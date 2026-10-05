#!/usr/bin/env node
/**
 * TO-134 — customer cloud business journey + cross-tenant isolation proof.
 *
 * LEVEL (read this first): SQL-level proof on a REAL PostgreSQL engine
 * (PGlite WASM — PostgreSQL 18.3 in this run; the Supabase local image
 * configured by supabase/config.toml is PostgreSQL 17). It
 * replays the full supabase/migrations chain, then drives the customer
 * journey through the same SQL surfaces the frontend services use — real RLS,
 * real role switching (`SET ROLE authenticated` + `request.jwt.claims`,
 * exactly what PostgREST does), real triggers, real SECURITY DEFINER RPCs and
 * real table/column privileges — for two separate identities.
 *
 * It is NOT the disposable Supabase stack: there is no PostgREST, no GoTrue
 * and no second connection, so:
 *   - "fresh session / relogin" is proven by re-establishing the JWT claims
 *     and re-reading persisted state, not by a new GoTrue-issued token;
 *   - REST-level error codes are exercised at the SQL privilege/RLS layer
 *     (same role, same grants, same policies);
 *   - offline/backend-failure UX and browser/mobile-desktop rendering are not
 *     executable at this level (see agent-results/024-result.md).
 *
 * Reason for this level: Docker Desktop (and Podman) are not installed on this
 * machine, so `npx supabase start` cannot run — the CLI reports
 * "failed to inspect container health: docker: command not found (podman also
 * not found)" (exit 1, verified 2026-10-05). The completion verdict for
 * 2026-10-04 sanctions this harness as the alternative to the local stack.
 *
 * Evidence class: local DB (fixture-labelled for anything derived from seeded
 * rows). Every recorded case asserts an observed database behaviour; two
 * journey defects found by running it are recorded as FINDINGS and are NOT
 * counted as passing security cases.
 *
 * Fixtures: the packing items below are the real item shapes from the 18
 * maintained packing-regression fixtures (frontend/scripts/packing-regression.ts,
 * 'skyline' / 'skyline mixed-load'), not re-derived values.
 *
 * Usage:  node scripts/customer_journey_isolation.db.test.mjs
 * Exit code 0 = every case passed; any failure exits 1. A missing PGlite
 * install is a loud failure, never a silent skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}

const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)

const db = await PGlite.create({ extensions: { uuid_ossp } })

// Annotate failures with the offending SQL so a harness error is diagnosable.
const rawQuery = db.query.bind(db)
const rawExec = db.exec.bind(db)
db.query = async (sql, params) => {
  try {
    return await rawQuery(sql, params)
  } catch (error) {
    error.message = `${error.message} [SQL: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 140)}]`
    throw error
  }
}
db.exec = async (sql) => {
  try {
    return await rawExec(sql)
  } catch (error) {
    error.message = `${error.message} [SQL: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 140)}]`
    throw error
  }
}

const results = []
const findings = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function recordFinding(name, detail) {
  findings.push({ name, detail })
  console.log(`FINDING  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

async function expectError(promise, expectedMessage) {
  try {
    await promise
  } catch (error) {
    const message = error && error.message ? error.message.split('\n')[0] : String(error)
    if (expectedMessage !== undefined) {
      expect(
        message.startsWith(expectedMessage) || message.includes(expectedMessage),
        `expected error containing "${expectedMessage}", got: ${JSON.stringify(message)}`
      )
    }
    return message
  }
  throw new Error(`expected an error${expectedMessage ? ` "${expectedMessage}"` : ''}, but the call succeeded`)
}

// ---------------------------------------------------------------------------
// Supabase-shaped bootstrap (the platform pre-creates these in the local image)
// ---------------------------------------------------------------------------
const BOOTSTRAP = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA extensions;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$fn$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$fn$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'role', '')
$fn$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $fn$
  DECLARE parts text[]; BEGIN
    parts := string_to_array(name, '/');
    RETURN parts[1:array_length(parts, 1) - 1];
  END $fn$;
CREATE PUBLICATION supabase_realtime;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
async function applyMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sqlText)
    } catch (error) {
      const message = error && error.message ? error.message.split('\n')[0] : String(error)
      throw new Error(`migration ${file} failed: ${message}`)
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Fixtures (service-role equivalent: run as the postgres superuser)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

async function createUser(tag, { role = 'user', metadata = {} } = {}) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  // GoTrue writes auth.users; the app then upserts public.users WITHOUT role
  // (authStore.ts:139-148) so the column default applies on first signup.
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
    [id, email, JSON.stringify(metadata)]
  )
  await db.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

async function createCustomer(userId, tag) {
  const id = uid()
  await db.query(
    `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, gst_number, pan_number, created_by)
     VALUES ($1, $2, $3, $4, $5, 'Delhi', 'Delhi', '110001', $6, $7, $8)`,
    [
      id,
      `${tag} Logistics Pvt Ltd`,
      '99999999' + String(seq).padStart(2, '0'),
      `${tag.toLowerCase()}-${seq}@example.com`,
      `${tag} Street, Demo Logistics Park`,
      `ABCDE${1000 + seq}F`,
      `FGHIJ${2000 + seq}K`,
      userId,
    ]
  )
  return id
}

async function createDriver(userId, tag) {
  const id = uid()
  await db.query(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', 'approved', true, 'ABCDE1234F')`,
    [id, userId, `${tag} Driver`, `9${String(seq).padStart(9, '0')}`]
  )
  return id
}

async function createOffer(shipmentId, driverId, status = 'pending') {
  const id = uid()
  await db.query(
    `INSERT INTO public.job_offers
       (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), now() + interval '1 hour', $4, '1111', '2222')`,
    [id, shipmentId, driverId, status]
  )
  return id
}

// ---------------------------------------------------------------------------
// Role/claims switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
async function actAs(sub) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    sub ? JSON.stringify({ sub, role: 'authenticated' }) : '{}',
  ])
  await db.exec('SET ROLE authenticated')
}

async function actAsAnon() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
  await db.exec('SET ROLE anon')
}

async function actAsService() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
}

async function rows(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows
}

// ---------------------------------------------------------------------------
// The journey
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  record(
    '0. migration chain replays cleanly (full supabase/migrations, newest last)',
    applied.length >= 34,
    `${applied.length} files, last=${applied[applied.length - 1]}`
  )

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)

  // =========================================================================
  // A. Identity and profile (signup + relogin refresh)
  // =========================================================================
  const userA = await createUser('customer-a', { metadata: { full_name: 'Asha Mehta', company: { name: 'Asha Freight', gstin: '07AAAAA0000A1Z5' } } })
  const userB = await createUser('customer-b', { metadata: { full_name: 'Bharat Rao', company: { name: 'Bharat Cargo', gstin: '27BBBBB0000B1Z5' } } })
  record('1. two isolated signups create auth.users + public.users rows', true, 'userA, userB')

  {
    await actAs(userA)
    const own = await rows(`SELECT id, email, role, name FROM public.users WHERE id = $1`, [userA])
    expect(own.length === 1 && own[0].role === 'user', `signup sync must default role to 'user': ${JSON.stringify(own)}`)
    const other = await rows(`SELECT id FROM public.users WHERE id = $1`, [userB])
    expect(other.length === 0, 'customer A must not read customer B profile')

    const msg = await expectError(
      db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [userA]),
      'Only admins can change roles'
    )
    expect(/Only admins/.test(msg), 'self-elevation blocked with the role-guard message')

    await db.query(`UPDATE public.users SET name = 'Asha Mehta', phone = '9810000001' WHERE id = $1`, [userA])
    record('2. signup defaults to role user, blocks self-elevation, profile update persists', true)
  }

  {
    // auth.users is not exposed to the authenticated role (GoTrue delivers the
    // company profile through the session/JWT, not through a table read), so the
    // persisted metadata is checked at the service-role layer.
    await actAsService()
    const meta = await rows(`SELECT raw_user_meta_data->'company'->>'name' AS company FROM auth.users WHERE id = $1`, [userA])
    expect(meta[0].company === 'Asha Freight', 'company profile metadata persists on the identity record')
  }

  {
    await actAs(userB)
    const changed = await rows(`UPDATE public.users SET name = 'Stolen' WHERE id = $1 RETURNING id`, [userA])
    expect(changed.length === 0, 'customer B must not update customer A profile')
    record('3. profile reads/writes are owner-scoped (B cannot touch A)', true)
  }

  // =========================================================================
  // B. Tenant-owned customer CRUD + reference data
  // =========================================================================
  let customerA1
  let customerA2
  let customerB1
  {
    await actAs(userA)
    customerA1 = await createCustomer(userA, 'Asha')
    customerA2 = await createCustomer(userA, 'Asha Second')
    const own = await rows(`SELECT id, name, created_by FROM public.customers ORDER BY name`)
    expect(own.length === 2, `customer A must read exactly its own 2 customers, got ${own.length}`)
    expect(own.every((r) => r.created_by === userA), 'every A customer row is owned by A')

    const missingPan = await expectError(
      db.query(
        `INSERT INTO public.customers (name, phone, address, city, state, pincode, created_by)
         VALUES ('No PAN Co', '9999999900', 'Street', 'Delhi', 'Delhi', '110001', $1)`,
        [userA]
      ),
      'PAN number is required for customers'
    )
    expect(/PAN number is required/.test(missingPan), 'PAN contract enforced')

    const badPan = await expectError(
      db.query(
        `INSERT INTO public.customers (name, phone, address, city, state, pincode, pan_number, created_by)
         VALUES ('Bad PAN Co', '9999999901', 'Street', 'Delhi', 'Delhi', '110001', 'NOPE', $1)`,
        [userA]
      ),
      'Invalid PAN format. Expected AAAAA1234A'
    )
    expect(/Invalid PAN format/.test(badPan), 'PAN format validated server-side')

    const forged = await expectError(
      db.query(
        `INSERT INTO public.customers (name, phone, address, city, state, pincode, pan_number, created_by)
         VALUES ('Forged Co', '9999999902', 'Street', 'Delhi', 'Delhi', '110001', 'ABCDE1234F', $1)`,
        [userB]
      ),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(forged), 'A cannot create a row owned by B (WITH CHECK)')
    record('4. customer CRUD as A: create/read own, PAN contract, forged ownership rejected', true)
  }

  {
    await actAs(userB)
    const visible = await rows(`SELECT id FROM public.customers`)
    expect(visible.length === 0, `customer B must see zero of A's customers, got ${visible.length}`)
    const updated = await rows(`UPDATE public.customers SET city = 'Mumbai' WHERE id = $1 RETURNING id`, [customerA1])
    expect(updated.length === 0, 'customer B must not update A customer')
    const deleted = await rows(`DELETE FROM public.customers WHERE id = $1 RETURNING id`, [customerA1])
    expect(deleted.length === 0, 'customer B must not delete A customer')

    customerB1 = await createCustomer(userB, 'Bharat')
    record('5. customer B is isolated from A rows; B creates its own customer', true)
  }

  {
    await actAs(userA)
    const visible = await rows(`SELECT id FROM public.customers`)
    expect(visible.length === 2, 'A still sees only its own 2 customers after B activity')
    const updated = await rows(`UPDATE public.customers SET city = 'Gurugram' WHERE id = $1 RETURNING city`, [customerA2])
    expect(updated.length === 1 && updated[0].city === 'Gurugram', 'A updates own customer')
    const deleted = await rows(`DELETE FROM public.customers WHERE id = $1 RETURNING id`, [customerA1])
    expect(deleted.length === 1, 'A deletes own customer')
    const remaining = await rows(`SELECT id FROM public.customers`)
    expect(remaining.length === 1 && remaining[0].id === customerA2, 'A owns one remaining customer')
    record('6. A update/delete own customer; B rows untouched', true)
  }

  {
    await actAs(userA)
    const trucks = await rows(`SELECT count(*)::int AS n FROM public.trucks`)
    const cartons = await rows(`SELECT count(*)::int AS n FROM public.cartons`)
    expect(trucks[0].n === 8, `catalog trucks must be the 8 reference rows, got ${trucks[0].n}`)
    expect(cartons[0].n === 5, `catalog cartons must be the 5 reference rows, got ${cartons[0].n}`)

    const insertTruck = await expectError(
      db.query(`INSERT INTO public.trucks (name, name_hi, length, width, height, capacity, cost_per_km) VALUES ('X','X',1,1,1,1,1)`),
      'new row violates row-level security policy'
    )
    const updateTruck = await rows(`UPDATE public.trucks SET available = 0 WHERE name = 'Tata Ace' RETURNING id`)
    expect(updateTruck.length === 0, 'authenticated must not update reference trucks')
    const deleteCarton = await rows(`DELETE FROM public.cartons RETURNING id`)
    expect(deleteCarton.length === 0, 'authenticated must not delete reference cartons')
    expect(/row-level security/.test(insertTruck), 'reference writes blocked by RLS (read-only catalog)')

    await actAsAnon()
    const anonTrucks = await rows(`SELECT count(*)::int AS n FROM public.trucks`)
    expect(anonTrucks[0].n === 8, 'anon can read the truck catalog (public reference read)')
    record('7. truck/carton catalog: public read, tenant-write denied (reference data is not tenant-owned)', true, 'catalog CRUD lives in the device-local PGlite path (localApi.ts), covered by unit tests')
  }

  // =========================================================================
  // C. Packing run / save / reopen
  // =========================================================================
  const truckId = (await rows(`SELECT id FROM public.trucks WHERE name = 'Eicher 14ft'`))[0].id
  let packingJobId
  const PACKING_ITEMS = [
    // Real item shapes from the maintained 18 packing fixtures
    // (frontend/scripts/packing-regression.ts 'skyline' + 'skyline mixed-load').
    { name: 'Slim Box', length: 50, width: 100, height: 100, weight: 50, quantity: 4, fragile: false, stackable: true },
    { name: 'Tall Panel', length: 50, width: 150, height: 100, weight: 10, quantity: 1, fragile: false, stackable: true },
    { name: 'Floor Beam', length: 200, width: 50, height: 50, weight: 10, quantity: 3, fragile: false, stackable: true },
  ]

  {
    await actAs(userA)
    const job = await rows(
      `INSERT INTO public.packing_jobs
         (user_id, truck_id, status, items, volume_utilization, weight_utilization, total_cost, algorithm, optimization_goal, result_data)
       VALUES ($1, $2, 'completed', '[]'::jsonb, 62.5, 41.2, 1850, 'skyline', 'space', $3::jsonb)
       RETURNING id, status, user_id`,
      [userA, truckId, JSON.stringify({ packed_boxes: 8, unfit_items: 0, items_fit: 8, total_items: 8 })]
    )
    packingJobId = job[0].id
    expect(job[0].user_id === userA && job[0].status === 'completed', 'packing job saved as completed for A')

    for (const item of PACKING_ITEMS) {
      await db.query(
        `INSERT INTO public.packing_items (job_id, name, length, width, height, weight, quantity, fragile, stackable)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [packingJobId, item.name, item.length, item.width, item.height, item.weight, item.quantity, item.fragile, item.stackable]
      )
    }
    const items = await rows(`SELECT name, quantity FROM public.packing_items WHERE job_id = $1 ORDER BY name`, [packingJobId])
    expect(items.length === PACKING_ITEMS.length, `saved ${PACKING_ITEMS.length} packing items, read back ${items.length}`)
    record('8. packing run saved: job + items persisted for A with real fixture item shapes', true, `${PACKING_ITEMS.length} item rows`)
  }

  {
    // "Reopen": fresh session (new claims) then read the persisted job + items back.
    await actAs(userA)
    const reopened = await rows(
      `SELECT j.id, j.status, j.algorithm, j.optimization_goal, j.volume_utilization, j.result_data,
              count(i.id)::int AS item_rows
       FROM public.packing_jobs j
       LEFT JOIN public.packing_items i ON i.job_id = j.id
       WHERE j.id = $1
       GROUP BY j.id`,
      [packingJobId]
    )
    expect(reopened.length === 1, 'reopened packing job is readable')
    expect(reopened[0].item_rows === PACKING_ITEMS.length, 'reopened job still has all items')
    expect(Number(reopened[0].volume_utilization) === 62.5, 'utilization survives the reopen')
    expect(reopened[0].result_data.items_fit === 8, 'result_data survives the reopen')
    record('9. packing job reopens after a fresh session with identical persisted state', true)
  }

  {
    await actAs(userB)
    const job = await rows(`SELECT id FROM public.packing_jobs WHERE id = $1`, [packingJobId])
    expect(job.length === 0, 'B must not read A packing job')
    const items = await rows(`SELECT id FROM public.packing_items WHERE job_id = $1`, [packingJobId])
    expect(items.length === 0, 'B must not read A packing items')
    const insert = await expectError(
      db.query(
        `INSERT INTO public.packing_items (job_id, name, length, width, height) VALUES ($1, 'Intruder', 1, 1, 1)`,
        [packingJobId]
      ),
      'new row violates row-level security policy'
    )
    const update = await rows(`UPDATE public.packing_jobs SET total_cost = 0 WHERE id = $1 RETURNING id`, [packingJobId])
    expect(update.length === 0, 'B must not update A packing job')
    expect(/row-level security/.test(insert), 'B cannot add items to A job (WITH CHECK)')
    record('10. packing job/items fully isolated: B cannot read, write or attach items', true)
  }

  {
    await actAs(userA)
    await db.query(`UPDATE public.packing_jobs SET status = 'failed', total_cost = 0 WHERE id = $1`, [packingJobId])
    const before = await rows(`SELECT count(*)::int AS n FROM public.packing_items WHERE job_id = $1`, [packingJobId])
    await db.query(`DELETE FROM public.packing_jobs WHERE id = $1`, [packingJobId])
    const after = await rows(`SELECT count(*)::int AS n FROM public.packing_items WHERE job_id = $1`, [packingJobId])
    expect(before[0].n === PACKING_ITEMS.length && after[0].n === 0, 'deleting the job cascades to its items')
    record('11. packing job update + delete with cascade works for the owner', true)
  }

  // =========================================================================
  // D. Route selection
  // =========================================================================
  let routeAId
  {
    await actAs(userA)
    const route = await rows(
      `INSERT INTO public.routes (name, start_location, destinations, total_distance, total_time, total_cost, toll_cost, fuel_cost, status, created_by)
       VALUES ('Delhi → Jaipur', 'Delhi', ARRAY['Jaipur'], 280, 5.5, 1850, 320, 980, 'planned', $1)
       RETURNING id, created_by`,
      [userA]
    )
    expect(route.length === 1 && route[0].created_by === userA, 'route saved with A ownership')
    routeAId = route[0].id
    await actAs(userB)
    const visible = await rows(`SELECT id FROM public.routes`)
    expect(visible.length === 0, 'B must not see A routes')
    const updated = await rows(`UPDATE public.routes SET status = 'active' WHERE id = $1 RETURNING id`, [routeAId])
    expect(updated.length === 0, 'B must not update A route')
    record('12. route selection persisted and owner-scoped', true)
  }

  // =========================================================================
  // E. Booking + server-generated shipment documents
  // =========================================================================
  let shipmentAId
  let shipmentANumber
  let invoiceNumber
  let lrNumber
  {
    await actAs(userA)
    shipmentANumber = `TO134-A-${Date.now()}`
    const booked = await rows(
      `INSERT INTO public.shipments
         (shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
          vehicle_type, pickup_date, goods_description, estimated_value)
       VALUES ($1, $2, $3, 'Delhi', 'Jaipur', 'pending', 1200, 1850, 'eicher_14ft', '2026-10-10', 'Electronics', 75000)
       RETURNING id, invoice_number, lr_number`,
      [shipmentANumber, customerA2, userA]
    )
    shipmentAId = booked[0].id
    invoiceNumber = booked[0].invoice_number
    lrNumber = booked[0].lr_number
    expect(!!invoiceNumber && /^INV-\d{6}-\d{6}$/.test(invoiceNumber), `shipment invoice_number must be server-generated, got ${invoiceNumber}`)
    expect(!!lrNumber && /^LR-\d{6}-\d{6}$/.test(lrNumber), `shipment lr_number must be server-generated, got ${lrNumber}`)

    const documents = await rows(`SELECT * FROM public.ensure_shipment_document_numbers($1)`, [shipmentAId])
    expect(
      documents[0].invoice_number === invoiceNumber && documents[0].lr_number === lrNumber,
      'ensure_shipment_document_numbers returns the same persisted numbers (idempotent, server-authoritative)'
    )
    record('13. booking persists; invoice/lr numbers are server-generated and idempotent', true, `${invoiceNumber} / ${lrNumber}`)
  }

  {
    await actAs(userB)
    const visible = await rows(`SELECT id FROM public.shipments`)
    expect(visible.length === 0, 'B must not read A shipments')
    const updated = await rows(`UPDATE public.shipments SET status = 'delivered' WHERE id = $1 RETURNING id`, [shipmentAId])
    expect(updated.length === 0, 'B must not update A shipment')
    const forged = await expectError(
      db.query(
        `INSERT INTO public.shipments (shipment_id, created_by, origin, destination) VALUES ($1, $2, 'X', 'Y')`,
        [`TO134-forged-${Date.now()}`, userA]
      ),
      'new row violates row-level security policy'
    )
    const documents = await expectError(
      db.query(`SELECT * FROM public.ensure_shipment_document_numbers($1)`, [shipmentAId]),
      'Shipment not found or access denied'
    )
    expect(/row-level security/.test(forged), 'B cannot forge A ownership on insert')
    expect(/access denied/.test(documents), 'B cannot mint document numbers for A shipment')
    record('14. shipment isolation: no read/update/forge/document-number access for B', true)
  }

  {
    await actAsAnon()
    const msg = await expectError(
      db.query(`SELECT * FROM public.ensure_shipment_document_numbers($1)`, [shipmentAId])
    )
    expect(/access denied|permission denied/i.test(msg), `anon document-number call must fail closed, got: ${msg}`)
    const read = await rows(`SELECT id FROM public.shipments`)
    expect(read.length === 0, 'anon must not read shipments (RLS)')
    const anonExecute = await rows(`SELECT has_function_privilege('anon', 'public.ensure_shipment_document_numbers(uuid)', 'EXECUTE') AS allowed`)
    record('15. anon cannot read shipments; document-number RPC fails closed for anon', true, `EXECUTE=${anonExecute[0].allowed}`)
    if (anonExecute[0].allowed) {
      recordFinding(
        'ensure_shipment_document_numbers EXECUTE is not revoked from PUBLIC',
        `has_function_privilege('anon', ..., 'EXECUTE') = true; the call is denied only by the internal guard ("${msg}")`
      )
    }
  }

  // =========================================================================
  // F. Tracking and shipment history
  // =========================================================================
  await actAsService()
  const driverUser = await createUser('driver-1')
  const driverId = await createDriver(driverUser, 'Trip')
  {
    await actAsService()
    await createOffer(shipmentAId, driverId, 'accepted')

    await actAs(userA)
    const tracking = await rows(`SELECT * FROM public.get_shipment_job_offer_tracking($1)`, [shipmentAId])
    expect(tracking.length === 1 && tracking[0].status === 'accepted', 'A reads its shipment tracking via the RPC')
    expect(tracking[0].pickup_otp === '1111' && tracking[0].delivery_otp === '2222', 'tracking RPC returns the shipment OTPs to the stakeholder')

    const offers = await rows(`SELECT id FROM public.job_offers WHERE shipment_id = $1`, [shipmentAId])
    expect(offers.length === 1, 'A (shipment stakeholder) can read the job offer row')

    await actAs(userB)
    const denied = await expectError(
      db.query(`SELECT * FROM public.get_shipment_job_offer_tracking($1)`, [shipmentAId]),
      'Access denied'
    )
    const offersB = await rows(`SELECT id FROM public.job_offers WHERE shipment_id = $1`, [shipmentAId])
    expect(offersB.length === 0, 'B cannot read A job offers directly')
    expect(/Access denied/.test(denied), 'tracking RPC denies the foreign customer')

    await actAsAnon()
    const anonDenied = await expectError(
      db.query(`SELECT * FROM public.get_shipment_job_offer_tracking($1)`, [shipmentAId])
    )
    expect(/permission denied/i.test(anonDenied), `anon tracking call must be privilege-denied, got: ${anonDenied}`)
    record('16. tracking: stakeholder reads via RPC; B and anon denied', true)
  }

  {
    await actAs(userA)
    await db.query(`UPDATE public.shipments SET status = 'delivered', updated_at = now() WHERE id = $1`, [shipmentAId])
    const history = await rows(
      `SELECT shipment_id FROM public.shipments WHERE customer_id = $1 AND status IN ('delivered','cancelled') ORDER BY updated_at DESC LIMIT 20`,
      [customerA2]
    )
    expect(history.some((r) => r.shipment_id === shipmentANumber), 'A history query returns its delivered shipment')
    await actAs(userB)
    const bHistory = await rows(
      `SELECT shipment_id FROM public.shipments WHERE customer_id = $1 AND status IN ('delivered','cancelled')`,
      [customerA2]
    )
    expect(bHistory.length === 0, 'B history query returns none of A shipments even when filtering A customer id')
    record('17. shipment history is owner-scoped', true)
  }

  // =========================================================================
  // G. Invoice + subscription usage (server-authoritative writes)
  // =========================================================================
  const planStarter = (await rows(`SELECT id, price_monthly, shipments_monthly FROM public.subscription_plans WHERE tier = 'starter'`))[0]
  let subscriptionAId
  {
    await actAsService()
    const subscription = await rows(
      `INSERT INTO public.subscriptions (user_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
       VALUES ($1, $2, 'active', 'monthly', now(), now() + interval '30 days')
       RETURNING id`,
      [userA, planStarter.id]
    )
    subscriptionAId = subscription[0].id
    const usage = await rows(`SELECT subscription_id, shipments_used FROM public.usage_tracking WHERE subscription_id = $1`, [subscriptionAId])
    expect(usage.length === 1 && usage[0].shipments_used === 0, 'subscription insert auto-creates usage_tracking (server trigger)')

    await actAs(userA)
    const own = await rows(`SELECT plan_id FROM public.subscriptions WHERE id = $1`, [subscriptionAId])
    const ownUsage = await rows(`SELECT shipments_used FROM public.usage_tracking WHERE subscription_id = $1`, [subscriptionAId])
    expect(own.length === 1 && ownUsage.length === 1, 'A reads own subscription + usage')
    await actAs(userB)
    const other = await rows(`SELECT id FROM public.subscriptions WHERE id = $1`, [subscriptionAId])
    const otherUsage = await rows(`SELECT id FROM public.usage_tracking WHERE subscription_id = $1`, [subscriptionAId])
    expect(other.length === 0 && otherUsage.length === 0, 'B cannot read A subscription or usage')
    record('18. subscription + usage created server-side; reads owner-scoped', true)
  }

  {
    await actAs(userA)
    const writeErrors = []
    writeErrors.push(await expectError(db.query(`UPDATE public.invoices SET total_amount = 0 WHERE user_id = $1`, [userA]), 'permission denied for table invoices'))
    writeErrors.push(await expectError(db.query(`INSERT INTO public.subscriptions (user_id, plan_id, status, billing_cycle, current_period_start, current_period_end) SELECT $1, id, 'active', 'monthly', now(), now() + interval '30 days' FROM public.subscription_plans LIMIT 1`, [userA]), 'permission denied for table subscriptions'))
    writeErrors.push(await expectError(db.query(`INSERT INTO public.usage_tracking (subscription_id, period_start, period_end) VALUES ($1, now(), now() + interval '30 days')`, [subscriptionAId]), 'permission denied for table usage_tracking'))
    expect(writeErrors.every((m) => /permission denied/.test(m)), 'all client billing writes are privilege-denied')
    record('19. client cannot write invoices/subscriptions/usage_tracking (server-managed only)', true)
  }

  // Server billing module executed under Node with a Deno shim: the SAME module
  // the payment Edge Functions import (supabase/functions/_shared/billing.ts).
  globalThis.Deno = { env: { get: (key) => process.env[key] } }
  const billing = await import(new URL('../supabase/functions/_shared/billing.ts', import.meta.url).href)
  const billingNoGst = billing.calculateExpectedAmounts(planStarter.price_monthly)
  process.env.BILLING_GST_ENABLED = 'true'
  process.env.BILLING_GST_RATE_PERCENT = '18'
  const billingGst = billing.calculateExpectedAmounts(planStarter.price_monthly)
  delete process.env.BILLING_GST_ENABLED
  delete process.env.BILLING_GST_RATE_PERCENT

  expect(billingNoGst.taxAmount === 0 && billingNoGst.totalAmount === planStarter.price_monthly, 'GST-disabled totals equal the plan price')
  expect(billingGst.taxAmount === Math.round(planStarter.price_monthly * 0.18), `GST-enabled tax must be 18% of the plan price, got ${billingGst.taxAmount}`)
  expect(billingGst.totalAmount === planStarter.price_monthly + billingGst.taxAmount, 'GST-enabled total = price + tax')
  record('20. server billing module computes authoritative subscription totals (GST off/on)', true, `plan ₹${planStarter.price_monthly}, tax ₹${billingGst.taxAmount}, total ₹${billingGst.totalAmount}`)

  {
    await actAsService()
    const invoiceNumberValue = `SUBINV-${Date.now()}`
    const paymentId = `pay_TO134_${Date.now()}`
    await db.query(
      `INSERT INTO public.invoices (subscription_id, user_id, invoice_number, amount, tax_amount, total_amount, billing_period_start, billing_period_end, razorpay_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now() + interval '30 days', $7)`,
      [subscriptionAId, userA, invoiceNumberValue, billingGst.subtotalAmount, billingGst.taxAmount, billingGst.totalAmount, paymentId]
    )
    const duplicate = await expectError(
      db.query(
        `INSERT INTO public.invoices (subscription_id, user_id, invoice_number, amount, tax_amount, total_amount, billing_period_start, billing_period_end, razorpay_payment_id)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now() + interval '30 days', $7)`,
        [subscriptionAId, userA, `${invoiceNumberValue}-dup`, billingGst.subtotalAmount, billingGst.taxAmount, billingGst.totalAmount, paymentId]
      ),
      'duplicate key value violates unique constraint'
    )
    expect(/duplicate key/.test(duplicate), 'replayed provider payment cannot create a second invoice')

    const stored = await rows(`SELECT amount, tax_amount, total_amount FROM public.invoices WHERE subscription_id = $1`, [subscriptionAId])
    expect(
      stored.length === 1 && Number(stored[0].total_amount) === billingGst.totalAmount,
      'stored invoice totals equal the server module output'
    )

    await actAs(userA)
    const ownInvoice = await rows(`SELECT invoice_number, total_amount FROM public.invoices`)
    expect(ownInvoice.length === 1 && Number(ownInvoice[0].total_amount) === billingGst.totalAmount, 'A reads own invoice only')
    await actAs(userB)
    const bInvoice = await rows(`SELECT id FROM public.invoices`)
    expect(bInvoice.length === 0, 'B cannot read A invoices')
    record('21. invoice totals server-authoritative; provider-payment replay blocked; owner-scoped reads', true, `${invoiceNumberValue} total ₹${billingGst.totalAmount}`)
  }

  {
    await actAs(userA)
    const before = await rows(`SELECT public.check_usage_limit($1, 'shipments') AS allowed`, [userA])
    await db.query(`SELECT public.increment_usage($1, 'shipments', $2)`, [userA, planStarter.shipments_monthly])
    const after = await rows(`SELECT public.check_usage_limit($1, 'shipments') AS allowed`, [userA])
    expect(before[0].allowed === true, 'usage below the Starter limit is allowed')
    expect(after[0].allowed === false, 'usage at the Starter limit (50) blocks new shipments')
    const used = await rows(`SELECT shipments_used FROM public.usage_tracking WHERE subscription_id = $1`, [subscriptionAId])
    expect(used[0].shipments_used === planStarter.shipments_monthly, 'increment_usage wrote the subscription usage counter')
    record('22. subscription usage gate enforced at the limit boundary', true, `Starter limit ${planStarter.shipments_monthly}`)
  }

  {
    // Forbidden cross-customer direct API request: does A's call reach B's billing?
    await actAsService()
    const bSubscription = await rows(
      `INSERT INTO public.subscriptions (user_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
       VALUES ($1, $2, 'active', 'monthly', now(), now() + interval '30 days') RETURNING id`,
      [userB, planStarter.id]
    )
    const bSubscriptionId = bSubscription[0].id
    const bUsageBefore = await rows(`SELECT shipments_used FROM public.usage_tracking WHERE subscription_id = $1`, [bSubscriptionId])

    await actAs(userA)
    let crossWrite = null
    try {
      await db.query(`SELECT public.increment_usage($1, 'shipments', 7)`, [userB])
      crossWrite = 'accepted'
    } catch (error) {
      crossWrite = error.message.split('\n')[0]
    }
    let crossPlan = null
    try {
      const plan = await rows(`SELECT plan_name, status FROM public.get_user_plan($1)`, [userB])
      crossPlan = plan.length ? `${plan[0].plan_name}/${plan[0].status}` : '[]'
    } catch (error) {
      crossPlan = error.message.split('\n')[0]
    }

    await actAsService()
    const bUsageAfter = await rows(`SELECT shipments_used FROM public.usage_tracking WHERE subscription_id = $1`, [bSubscriptionId])
    const landed = bUsageAfter[0].shipments_used - bUsageBefore[0].shipments_used

    if (landed > 0) {
      recordFinding(
        '23. cross-customer billing RPCs are callable for a foreign user id',
        `A -> increment_usage(B) ${crossWrite}; B usage ${bUsageBefore[0].shipments_used} -> ${bUsageAfter[0].shipments_used} (+${landed}); A -> get_user_plan(B) = ${crossPlan}`
      )
    } else {
      record('23. cross-customer usage RPC refuses to modify a foreign subscription', true, `increment_usage(B) ${crossWrite}, usage delta ${landed}, plan read ${crossPlan}`)
    }
  }

  // =========================================================================
  // H. Fresh session / relogin re-read
  // =========================================================================
  {
    // Re-establish A's claims from scratch (fresh token) and re-read everything written.
    await actAsAnon()
    await actAs(userA)
    const state = await rows(
      `SELECT
         (SELECT count(*)::int FROM public.customers) AS customers,
         (SELECT count(*)::int FROM public.shipments) AS shipments,
         (SELECT count(*)::int FROM public.routes) AS routes,
         (SELECT count(*)::int FROM public.subscriptions) AS subscriptions,
         (SELECT count(*)::int FROM public.invoices) AS invoices`
    )
    expect(
      state[0].customers === 1 && state[0].shipments === 1 && state[0].routes === 1 && state[0].subscriptions === 1 && state[0].invoices === 1,
      `relogged A must re-read exactly its persisted journey state: ${JSON.stringify(state[0])}`
    )
    record('24. relogin re-read: persisted journey state is identical after re-established claims', true)
  }

  {
    // Forbidden cross-customer request after relogin: B sees nothing of A's journey.
    await actAsAnon()
    await actAs(userB)
    const foreign = await rows(
      `SELECT
         (SELECT count(*)::int FROM public.customers) AS customers,
         (SELECT count(*)::int FROM public.shipments) AS shipments,
         (SELECT count(*)::int FROM public.routes) AS routes,
         (SELECT count(*)::int FROM public.packing_jobs) AS packing_jobs,
         (SELECT count(*)::int FROM public.invoices) AS invoices`
    )
    expect(
      foreign[0].customers === 1 && foreign[0].shipments === 0 && foreign[0].routes === 0 && foreign[0].packing_jobs === 0 && foreign[0].invoices === 0,
      `B must see only its own customer: ${JSON.stringify(foreign[0])}`
    )
    record('25. cross-customer sweep after relogin: B sees zero A records across every journey table', true)
  }

  // =========================================================================
  // I. Booking dispatch defect (reproduced, not repaired here)
  // =========================================================================
  {
    await actAs(userA)
    let dispatchMessage
    try {
      await db.query(`SELECT public.dispatch_job_to_drivers($1, 'eicher_14ft')`, [shipmentAId])
      dispatchMessage = 'accepted'
    } catch (error) {
      dispatchMessage = error.message.split('\n')[0]
    }
    expect(/does not exist/.test(dispatchMessage), `dispatch RPC unexpectedly callable: ${dispatchMessage}`)
    recordFinding(
      '26. booking dispatch RPC is missing (reproduced)',
      `NewShipmentPage.tsx:93 calls dispatch_job_to_drivers(uuid,text); DB says: ${dispatchMessage}`
    )
  }

  // -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} cases passed (SQL-level, PostgreSQL engine, two identities)`)
  if (findings.length > 0) {
    console.log(`${findings.length} finding(s) recorded separately (defects reproduced, not counted as passing cases):`)
    for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`)
  }
  console.log('NOTE: PostgREST/GoTrue round-trips, browser/mobile-desktop rendering, offline failure UX and the disposable local Supabase stack were NOT executed here; see agent-results/024-result.md.')
  if (failed.length > 0) process.exit(1)
}

main()
  .catch((error) => {
    console.error('FAIL (harness error):', error && error.message ? error.message : error)
    if (error && error.stack) console.error(error.stack.split('\n').slice(1, 5).join('\n'))
    process.exit(1)
  })
  .finally(async () => {
    await db.close()
  })
