#!/usr/bin/env node
/**
 * TO-135 — dispatch-to-delivery business loop + agency/driver isolation proof.
 *
 * LEVEL (read this first): SQL-level proof on a REAL PostgreSQL engine
 * (PGlite WASM — PostgreSQL 18.3 in this run; the Supabase local image
 * configured by supabase/config.toml is PostgreSQL 17). It replays the full
 * supabase/migrations chain, then drives the dispatch-to-delivery journey
 * through the same SQL surfaces the frontend services and Edge Functions use:
 * real RLS, real role switching (`SET ROLE authenticated` + `request.jwt.claims`,
 * exactly what PostgREST does), real triggers, real SECURITY DEFINER RPCs and
 * real table/column privileges — for two agencies, two drivers and the
 * customer who booked the shipment.
 *
 * Authority layers (mirrors how the product is actually wired):
 *   - customer and driver operations run on the authenticated role (direct
 *     PostgREST/RLS) and the SECURITY DEFINER RPCs;
 *   - agency operational mutations (fleet assignment, job driver assignment,
 *     agency payouts) and admin approvals run through the service authority,
 *     exactly as the agency-portal-* Edge Functions do with the service client;
 *   - the Edge Function guard predicates (portal-auth.ts) are replicated as
 *     SQL assertions and labelled as such; the HTTP wrapper itself cannot run
 *     here (no Deno/Edge runtime).
 *
 * It is NOT the disposable Supabase stack: there is no PostgREST, no GoTrue,
 * no Storage HTTP API and no second connection, so:
 *   - "fresh session / relogin" is proven by re-establishing the JWT claims
 *     and re-reading persisted state, not by a new GoTrue-issued token;
 *   - HTTP-level error codes are represented by the same SQL privilege/RLS
 *     errors PostgREST maps;
 *   - browser/mobile-desktop rendering is NOT executable at this level (see
 *     agent-results/025-result.md for the fixture-tier browser evidence).
 *
 * Reason for this level: Docker Desktop (and Podman) are not installed on this
 * machine, so `npx supabase start` cannot run — the CLI reports
 * "failed to inspect container health: docker: command not found (podman also
 * not found)" (exit 1, re-verified 2026-10-05). The 2026-10-04 completion
 * verdict sanctions this harness as the alternative to the local stack
 * ("rebuild the disposable Supabase stack ... or extend the PGlite harness").
 *
 * Evidence class: local DB. Every recorded case asserts an observed database
 * behaviour. Journey gaps/defects found by running it are recorded as FINDINGS
 * and are NOT counted as passing cases.
 *
 * Usage:  node scripts/dispatch_delivery_journey.db.test.mjs
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

function ts(value) {
  if (value === null || value === undefined) return null
  return new Date(value).getTime()
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
-- Platform-shaped storage grants (RLS in storage.objects remains the gate; the
-- Supabase image grants table privileges to these roles for the Storage API).
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
GRANT ALL ON storage.buckets TO anon, authenticated, service_role;
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

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  // GoTrue writes auth.users; the app then upserts public.users WITHOUT role,
  // so the column default applies on first signup.
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
    [id, email, JSON.stringify({})]
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

async function createAgencyRow(userId, tag, status = 'pending') {
  const id = uid()
  await db.query(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6)`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, `07ABCDE${1000 + seq}A1Z5`, `ABCDE${4000 + seq}Q`]
  )
  return id
}

async function createDriver(userId, tag, status = 'pending') {
  const id = uid()
  await db.query(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', $5, true, 'ABCDE1234F')`,
    [id, userId, `${tag} Driver`, `9${String(seq).padStart(9, '0')}`, status]
  )
  return id
}

async function createAgencyTruck(agencyId, driverId = null) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, driver_id)
     VALUES ($1, $2, 'eicher_14ft', $3, $4)`,
    [id, agencyId, `DL01AB${1000 + seq}`, driverId]
  )
  return id
}

async function createShipment(customerId, ownerUserId, tag) {
  const id = uid()
  const reference = `TO135-${tag}-${Date.now()}-${seq}`
  const result = await db.query(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)
     RETURNING id, invoice_number, lr_number`,
    [id, reference, customerId, ownerUserId]
  )
  return { id, reference, invoiceNumber: result.rows[0].invoice_number, lrNumber: result.rows[0].lr_number }
}

async function createOffer(shipmentId, driverId, { expiresExpression = "now() + interval '1 hour'", pickupOtp = '4321', deliveryOtp = '8765' } = {}) {
  const id = uid()
  await db.query(
    `INSERT INTO public.job_offers
       (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), ${expiresExpression}, 'pending', $4, $5)`,
    [id, shipmentId, driverId, pickupOtp, deliveryOtp]
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
// Replicas of supabase/functions/_shared/portal-auth.ts predicates.
// These are the guard checks the Edge Functions run with the service client
// before performing an agency mutation; the HTTP wrapper itself cannot run in
// this harness (no Deno/Edge runtime), so the predicates are executed as SQL.
// ---------------------------------------------------------------------------
async function assertApprovedAgencyStatus(status) {
  if (status !== 'approved') throw new Error('Agency approval is required.')
}

async function assertApprovedDriverContract(driverId) {
  const driver = (await rows(`SELECT id, status FROM public.drivers WHERE id = $1`, [driverId]))[0]
  if (!driver) throw new Error('Driver not found.')
  if (driver.status !== 'approved') throw new Error('Only approved drivers can be assigned or paid.')
}

async function assertDriverAvailableForAgencyTruck(agencyId, driverId) {
  const driver = (await rows(`SELECT id, status FROM public.drivers WHERE id = $1`, [driverId]))[0]
  if (!driver) throw new Error('Driver not found.')
  if (driver.status !== 'approved') throw new Error('Driver is not approved for assignment.')
  const foreignTruck = await rows(
    `SELECT id FROM public.agency_trucks WHERE driver_id = $1 AND agency_id <> $2 LIMIT 1`,
    [driverId, agencyId]
  )
  if (foreignTruck.length > 0) throw new Error('Driver is already assigned to another agency.')
}

async function assertDriverOnAgencyFleet(agencyId, driverId) {
  const truck = await rows(
    `SELECT id FROM public.agency_trucks WHERE agency_id = $1 AND driver_id = $2 LIMIT 1`,
    [agencyId, driverId]
  )
  if (truck.length === 0) throw new Error('Driver is not assigned to this agency fleet.')
}

// ---------------------------------------------------------------------------
// The journey
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  record(
    '0. migration chain replays cleanly (full supabase/migrations, newest last)',
    // Newest-migration assertion is monotonic (TO-136 appended a forward
    // migration after the TO-135 baseline) so this stays valid as the chain grows.
    applied.length >= 35 && applied[applied.length - 1] >= '20261005000000_trip_photo_url_correction.sql',
    `${applied.length} files, last=${applied[applied.length - 1]}`
  )

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)

  // =========================================================================
  // A. Identities and the approval matrix
  // =========================================================================
  const customerUser = await createUser('customer-c1')
  const agencyAUser = await createUser('agency-a')
  const agencyBUser = await createUser('agency-b')
  const agencyCUser = await createUser('agency-c')
  const driver1User = await createUser('driver-1')
  const driver2User = await createUser('driver-2')

  {
    await actAsService()
    const roles = await rows(`SELECT id, role FROM public.users ORDER BY id`)
    record(
      '1. signups create auth.users + public.users rows; default role user',
      roles.length === 6 && roles.every((r) => r.role === 'user'),
      `${roles.length} identities`
    )
  }

  // Agency A registers under its own RLS/trigger path (the real onboarding write).
  let agencyA
  {
    await actAs(agencyAUser)
    const inserted = await rows(
      `INSERT INTO public.transport_agencies (user_id, company_name, city, gstin, pan_number)
       VALUES ($1, 'Alpha Freight Transport Pvt Ltd', 'Delhi', '07AAAAA0000A1Z5', 'AAAAA1234A')
       RETURNING id, status`,
      [agencyAUser]
    )
    agencyA = inserted[0].id
    expect(inserted[0].status === 'pending', `agency registration must be forced to pending, got ${inserted[0].status}`)

    // Self-approval must be ignored by the guard trigger.
    const selfApprove = await rows(
      `UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1 RETURNING status`,
      [agencyA]
    )
    expect(selfApprove[0].status === 'pending', `agency self-approval must not stick, got ${selfApprove[0].status}`)
    record('2. agency registration lands pending; owner cannot self-approve (guard trigger)', true)
  }

  await actAsService()
  const agencyB = await createAgencyRow(agencyBUser, 'Bravo', 'pending')
  const agencyC = await createAgencyRow(agencyCUser, 'Charlie', 'pending')

  let driver1
  let driver2
  {
    // Admin/service authority — what admin-portal-agencies does after checking
    // the caller's users.role with the service client.
    await actAsService()
    await db.query(`UPDATE public.transport_agencies SET status = 'approved', approved_at = now() WHERE id IN ($1, $2)`, [agencyA, agencyB])
    await db.query(`UPDATE public.transport_agencies SET status = 'suspended' WHERE id = $1`, [agencyC])

    driver1 = await createDriver(driver1User, 'One', 'pending')
    driver2 = await createDriver(driver2User, 'Two', 'pending')
    await db.query(`UPDATE public.drivers SET status = 'approved', approved_at = now() WHERE id = $1`, [driver1])

    const statuses = await rows(`SELECT id, status FROM public.transport_agencies ORDER BY company_name`)
    expect(
      statuses.some((r) => r.id === agencyA && r.status === 'approved') &&
        statuses.some((r) => r.id === agencyB && r.status === 'approved') &&
        statuses.some((r) => r.id === agencyC && r.status === 'suspended'),
      `agency matrix wrong: ${JSON.stringify(statuses)}`
    )
    record('3. approval matrix: A+B approved, C suspended; driver1 approved, driver2 pending', true)
  }

  {
    // Suspended agency: the server-side approval contract (replicated from
    // portal-auth.ts) rejects operational dispatch for the suspended row.
    await actAsService()
    const cStatus = (await rows(`SELECT status FROM public.transport_agencies WHERE id = $1`, [agencyC]))[0].status
    let message = 'accepted'
    try {
      await assertApprovedAgencyStatus(cStatus)
    } catch (error) {
      message = error.message
    }
    expect(/Agency approval is required/.test(message), `suspended agency must fail the approval contract, got: ${message}`)
    record('4. suspended agency fails the Edge approval contract (status gate)', true, `status=${cStatus}`)
  }

  // =========================================================================
  // B. Fleets: RLS path, portal authority, guard-trigger reality
  // =========================================================================
  let truckA1
  let truckB1
  {
    // Truck creation works on the authenticated own-agency RLS policy (the
    // guard trigger skips while driver_id is NULL).
    await actAs(agencyAUser)
    truckA1 = await createAgencyTruck(agencyA, null)

    // TO-142: direct authenticated assignment of a VALID approved fleet driver
    // must SUCCEED — the guard resolves drivers through the RLS-safe definer
    // helper instead of the RLS-filtered plain SELECT that made every
    // authenticated assignment fail closed.
    await db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, truckA1])
    const assigned = await rows(`SELECT driver_id FROM public.agency_trucks WHERE id = $1`, [truckA1])
    expect(assigned[0].driver_id === driver1, 'authenticated direct assignment of a valid approved driver must succeed on the RLS path')
    record('4b. authenticated fleet assignment of a valid approved driver succeeds (RLS-safe guard)', true, `truck ${truckA1}`)
  }

  {
    // Portal authority (the agency-portal-drivers Edge Function uses the
    // service client): the edge contract validates, then the write proceeds.
    await actAsService()
    await assertApprovedDriverContract(driver1)
    await db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, truckA1])
    const assigned = await rows(`SELECT driver_id FROM public.agency_trucks WHERE id = $1`, [truckA1])
    expect(assigned[0].driver_id === driver1, 'portal authority must assign the approved driver')
    record('5. portal authority assigns the approved driver to the fleet truck', true, `truck ${truckA1}`)
  }

  {
    // TO-142: the guard now runs on BOTH deployed paths. A service-role
    // cross-agency double assignment must be denied by the definer-backed
    // check (previously the trigger early-returned on auth.uid() IS NULL).
    await actAsService()
    truckB1 = await createAgencyTruck(agencyB, null)
    const serviceDenied = await expectError(
      db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, truckB1]),
      'Driver is already assigned to another agency.'
    )
    expect(/another agency/.test(serviceDenied), 'service-role cross-agency double assignment must be denied by the trigger')

    // The authenticated path gets the same denial through the same definer
    // helper: the caller cannot see other agencies' trucks, the helper can.
    await actAs(agencyBUser)
    const authDenied = await expectError(
      db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, truckB1]),
      'Driver is already assigned to another agency.'
    )
    expect(/another agency/.test(authDenied), 'authenticated cross-agency double assignment must be denied by the trigger')

    // Pinned duplicate rule (TO-142): a driver holds at most ONE truck row
    // globally, so a second truck in the SAME agency is denied too.
    await actAs(agencyAUser)
    const truckA2 = await createAgencyTruck(agencyA, null)
    const dupDenied = await expectError(
      db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, truckA2]),
      'Driver is already assigned to another truck.'
    )
    expect(/another truck/.test(dupDenied), 'same-agency duplicate truck assignment must be denied')

    const assignments = await rows(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE driver_id = $1`, [driver1])
    expect(assignments[0].n === 1, `driver1 must hold exactly one truck row, got ${assignments[0].n}`)
    record('5b. DB-layer guards enforce on both paths: service + authenticated cross-agency and duplicate denied', true, `driver1 truck rows=${assignments[0].n}`)
  }

  {
    // Portal contract replicas: pending driver and cross-agency driver rejected.
    await actAsService()
    const pendingRejected = await expectError(
      assertApprovedDriverContract(driver2),
      'Only approved drivers can be assigned or paid.'
    )
    expect(/approved drivers/.test(pendingRejected), 'pending driver must fail the portal contract')

    const crossAgencyRejected = await expectError(
      assertDriverAvailableForAgencyTruck(agencyB, driver1),
      'Driver is already assigned to another agency.'
    )
    expect(/another agency/.test(crossAgencyRejected), 'driver on agency A must fail the agency-B fleet contract')

    const fleetRejected = await expectError(
      assertDriverOnAgencyFleet(agencyB, driver1),
      'Driver is not assigned to this agency fleet.'
    )
    expect(/this agency fleet/.test(fleetRejected), 'driver not on agency B fleet must fail the fleet contract')
    record('6. portal contract rejects pending, cross-agency and out-of-fleet assignments', true)
  }

  {
    // RLS isolation on the fleet tables (reads and the authenticated update path).
    await actAs(agencyBUser)
    const trucksVisible = await rows(`SELECT id FROM public.agency_trucks`)
    expect(trucksVisible.length === 1 && trucksVisible[0].id === truckB1, `B must see only its own truck, saw ${trucksVisible.length}`)
    const updateForeign = await rows(`UPDATE public.agency_trucks SET is_available = false WHERE id = $1 RETURNING id`, [truckA1])
    expect(updateForeign.length === 0, 'B must not update A truck')
    record('7. fleet rows are tenant-isolated (B reads/updates only its own)', true)
  }

  // =========================================================================
  // C. Booking, dispatch producer, agency job
  // =========================================================================
  let shipment1
  let customer1
  {
    await actAs(customerUser)
    customer1 = await createCustomer(customerUser, 'Asha')
    shipment1 = await createShipment(customer1, customerUser, 'JOURNEY')
    expect(/^INV-\d{6}-\d{6}$/.test(shipment1.invoiceNumber), `server invoice number, got ${shipment1.invoiceNumber}`)
    expect(/^LR-\d{6}-\d{6}$/.test(shipment1.lrNumber), `server lr number, got ${shipment1.lrNumber}`)
    record('8. customer booking persists with server-generated invoice/LR identity', true, `${shipment1.invoiceNumber} / ${shipment1.lrNumber}`)
  }

  {
    // TO-142 r2: the booking dispatch producer exists (NewShipmentPage.tsx:81
    // calls dispatch_job_to_drivers right after booking). It fans OTP-gated
    // driver offers out to every ELIGIBLE approved driver for the vehicle
    // type — driver2 is still pending here, so only driver1 is notified.
    await actAs(customerUser)
    const shipment4 = await createShipment(customer1, customerUser, 'DISPATCH')
    const notified = await rows(`SELECT public.dispatch_job_to_drivers($1, 'eicher_14ft') AS n`, [shipment4.id])
    expect(Number(notified[0].n) === 1, `producer must notify only the approved eicher_14ft driver, got ${notified[0].n}`)
    // Offer identity via non-OTP columns (stakeholder row read — case 16
    // pattern); OTP contract via the tracking RPC (direct OTP reads stay
    // denied — case 14).
    const offers = await rows(`SELECT id, driver_id, status FROM public.job_offers WHERE shipment_id = $1`, [shipment4.id])
    expect(
      offers.length === 1 && offers[0].driver_id === driver1 && offers[0].status === 'pending',
      `producer offer wrong: ${JSON.stringify(offers)}`
    )
    const tracking = await rows(`SELECT * FROM public.get_shipment_job_offer_tracking($1)`, [shipment4.id])
    expect(
      tracking.length === 1 &&
        tracking[0].id === offers[0].id &&
        (tracking[0].pickup_otp ?? '').length === 4 &&
        (tracking[0].delivery_otp ?? '').length === 4,
      `producer OTPs wrong via tracking: ${JSON.stringify(tracking)}`
    )
    record('8b. booking dispatch producer fans out an OTP-gated offer to the eligible approved driver', true, `${notified[0].n} driver notified`)

    // Ownership guard: a foreign caller cannot dispatch someone else's shipment.
    await actAs(agencyBUser)
    const foreign = await expectError(
      db.query(`SELECT public.dispatch_job_to_drivers($1, 'eicher_14ft')`, [shipment4.id]),
      'Shipment not found or access denied'
    )
    expect(/access denied/i.test(foreign), 'foreign dispatch must be ownership-denied')
    record('8c. booking dispatch producer is ownership-guarded', true)
  }

  {
    // Pending driver cannot respond to an offer (SECURITY DEFINER RPC gate).
    await actAsService()
    const pendingOffer = await createOffer(shipment1.id, driver2)
    await actAs(driver2User)
    const denied = await expectError(
      db.query(`SELECT * FROM public.respond_to_job_offer($1, true)`, [pendingOffer]),
      'Driver account is not approved to respond to offers'
    )
    expect(/not approved/.test(denied), 'pending driver must not respond')
    record('9. pending driver cannot respond to an offer (RPC approval gate)', true)
  }

  {
    await actAsService()
    await db.query(`UPDATE public.drivers SET status = 'approved', approved_at = now() WHERE id = $1`, [driver2])
    const d2 = await rows(`SELECT status FROM public.drivers WHERE id = $1`, [driver2])
    expect(d2[0].status === 'approved', 'driver2 must be approvable through the admin/service path')
    record('10. driver approval matrix: pending -> approved via admin/service authority', true)
  }

  let agencyJob1
  {
    // Agency-side dispatch job. TO-142: the INSERT policy additionally requires
    // an explicit customer-consented / platform-dispatched authorization for
    // (shipment, agency). TO-143-D1: the consent producer is now the REAL
    // customer command path — public.authorize_agency_for_shipment — called
    // here exactly as customerSupabaseApi.authorizeAgency calls it.
    await actAs(agencyAUser)
    const noConsent = await expectError(
      db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 15000)`, [agencyA, shipment1.id]),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(noConsent), 'agency job creation without a shipment authorization must be denied')

    await actAs(customerUser)
    await rows(`SELECT public.authorize_agency_for_shipment($1, $2)`, [shipment1.id, agencyA])

    await actAs(agencyAUser)
    const created = await rows(
      `INSERT INTO public.agency_jobs (agency_id, shipment_id, fare, status)
       VALUES ($1, $2, 15000, 'pending') RETURNING id, status`,
      [agencyA, shipment1.id]
    )
    agencyJob1 = created[0].id
    record('11a. agency A creates its dispatch job under an active customer-RPC consent (own-agency RLS + consent predicate)', true)

    const duplicate = await expectError(
      db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 15000)`, [agencyA, shipment1.id]),
      'duplicate key value violates unique constraint'
    )
    expect(/duplicate key/.test(duplicate), 'a second agency job for the same agency+shipment must be rejected')
    record('11b. settlement key: one agency job per (agency, shipment) — duplicate dispatch rejected', true)
  }

  {
    // Portal authority assigns the driver to the agency job (after its contract
    // checks pass).
    await actAsService()
    await assertApprovedDriverContract(driver1)
    await assertDriverOnAgencyFleet(agencyA, driver1)
    await db.query(`UPDATE public.agency_jobs SET driver_id = $1 WHERE id = $2`, [driver1, agencyJob1])
    const assigned = await rows(`SELECT driver_id FROM public.agency_jobs WHERE id = $1`, [agencyJob1])
    expect(assigned[0].driver_id === driver1, 'portal authority must assign its fleet driver to the job')
    record('12. portal authority assigns the approved fleet driver to the dispatch job', true)
  }

  {
    await actAs(agencyBUser)
    const visible = await rows(`SELECT id FROM public.agency_jobs`)
    expect(visible.length === 0, `B must not read A agency jobs, saw ${visible.length}`)
    const updated = await rows(`UPDATE public.agency_jobs SET status = 'delivered' WHERE id = $1 RETURNING id`, [agencyJob1])
    expect(updated.length === 0, 'B must not update A agency job')
    record('13. agency jobs are tenant-isolated (B reads/updates none of A)', true)
  }

  // =========================================================================
  // D. Offer dispatch + acceptance (exactly-once allocation)
  // =========================================================================
  let offer1
  {
    await actAs(agencyAUser)
    offer1 = await createOffer(shipment1.id, driver1)

    const directOtp = await expectError(
      db.query(`SELECT pickup_otp FROM public.job_offers WHERE id = $1`, [offer1]),
      'permission denied for table job_offers'
    )
    expect(/permission denied/.test(directOtp), 'OTP columns must stay outside the authenticated column grant')

    // Cross-agency offer insert: B has no agency job on this shipment.
    await actAs(agencyBUser)
    const crossOffer = await expectError(
      db.query(
        `INSERT INTO public.job_offers (shipment_id, driver_id, offered_at, expires_at, pickup_otp, delivery_otp)
         VALUES ($1, $2, now(), now() + interval '1 hour', '1111', '2222')`,
        [shipment1.id, driver2]
      ),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(crossOffer), 'B must not dispatch offers for A shipment')

    await actAs(agencyAUser)
    record('14. offer dispatched by owning agency under RLS; OTP columns unreadable; cross-agency offer denied', true)
  }

  let shipment2
  let shipment3Id
  {
    // Expiry path (offer on a separate shipment so the journey tracking read
    // below is not shadowed by stale pending offers).
    await actAs(customerUser)
    shipment2 = await createShipment(customer1, customerUser, 'NOISE')
    // TO-143-D1: the customer grants the consent through the production RPC
    // before the agency-side job creation below.
    await rows(`SELECT public.authorize_agency_for_shipment($1, $2)`, [shipment2.id, agencyA])
    await actAs(agencyAUser)
    await db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 100)`, [agencyA, shipment2.id])
    const expiredOffer = await createOffer(shipment2.id, driver2, { expiresExpression: "now() - interval '5 minutes'" })

    await actAs(driver2User)
    const expired = await expectError(
      db.query(`SELECT * FROM public.respond_to_job_offer($1, true)`, [expiredOffer]),
      'Job offer has expired'
    )
    expect(/expired/.test(expired), 'expired offer must not be acceptable')
    record('15. expired offer rejected at accept time', true)
  }

  {
    // Decline + idempotent decline replay.
    await actAs(agencyAUser)
    const declineOffer = await createOffer(shipment2.id, driver2)

    await actAs(driver2User)
    const first = await rows(`SELECT * FROM public.respond_to_job_offer($1, false, 'Vehicle under maintenance')`, [declineOffer])
    expect(first[0].offer_status === 'declined', `decline must persist, got ${first[0].offer_status}`)
    const second = await rows(`SELECT * FROM public.respond_to_job_offer($1, false, 'changed mind')`, [declineOffer])
    expect(
      second[0].offer_status === 'declined' && ts(second[0].responded_at) === ts(first[0].responded_at),
      'decline replay must be idempotent (same responded_at)'
    )
    const reason = await rows(`SELECT decline_reason FROM public.job_offers WHERE id = $1`, [declineOffer])
    expect(reason[0].decline_reason === 'Vehicle under maintenance', 'replayed decline must not rewrite the stored reason')
    record('16. decline persists; replayed decline is idempotent (no second write)', true)
  }

  {
    // Cross-driver accept must fail closed.
    await actAs(driver2User)
    const denied = await expectError(
      db.query(`SELECT * FROM public.respond_to_job_offer($1, true)`, [offer1]),
      'Job offer not found or access denied'
    )
    expect(/access denied/.test(denied), 'driver2 must not accept driver1 offer')
    record('17. cross-driver offer accept denied', true)
  }

  let acceptedRespondedAt
  {
    await actAs(driver1User)
    const accepted = await rows(`SELECT * FROM public.respond_to_job_offer($1, true)`, [offer1])
    expect(accepted[0].offer_status === 'accepted', `accept must succeed, got ${accepted[0].offer_status}`)
    expect(accepted[0].active_job_id === offer1, 'accept must set the driver active job')
    acceptedRespondedAt = accepted[0].responded_at

    const replay = await rows(`SELECT * FROM public.respond_to_job_offer($1, true)`, [offer1])
    expect(
      replay[0].offer_status === 'accepted' && ts(replay[0].responded_at) === ts(acceptedRespondedAt),
      'accept replay must return the authoritative state without writing again'
    )

    const directUpdate = await expectError(
      db.query(`UPDATE public.job_offers SET status = 'delivered' WHERE id = $1`, [offer1]),
      'permission denied for table job_offers'
    )
    expect(/permission denied/.test(directUpdate), 'direct driver UPDATE on job_offers must stay revoked')
    record('18. driver accepts offer atomically; duplicate accept idempotent; direct UPDATE denied', true)
  }

  {
    // While driver1 is on an active trip, a second offer cannot be accepted:
    // one trip/driver at a time.
    await actAs(customerUser)
    const shipment3 = await createShipment(customer1, customerUser, 'SECOND')
    shipment3Id = shipment3.id
    // TO-143-D1: the customer grants the consent through the production RPC.
    await rows(`SELECT public.authorize_agency_for_shipment($1, $2)`, [shipment3.id, agencyA])
    await actAs(agencyAUser)
    await db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 9000)`, [agencyA, shipment3.id])
    const offer2 = await createOffer(shipment3.id, driver1)

    await actAs(driver1User)
    const denied = await expectError(
      db.query(`SELECT * FROM public.respond_to_job_offer($1, true)`, [offer2]),
      'Driver already has an active trip'
    )
    expect(/active trip/.test(denied), 'driver must not hold two active trips')
    record('19. one active trip per driver: second offer accept rejected while trip active', true)
  }

  {
    // Customer tracking: the stakeholder sees the accepted offer and its OTPs.
    await actAs(customerUser)
    const tracking = await rows(`SELECT * FROM public.get_shipment_job_offer_tracking($1)`, [shipment1.id])
    expect(tracking.length === 1 && tracking[0].status === 'accepted', `stakeholder tracking must show the accepted offer: ${JSON.stringify(tracking)}`)
    expect(tracking[0].pickup_otp === '4321' && tracking[0].delivery_otp === '8765', 'tracking RPC must return the shipment OTPs to the stakeholder')
    record('20. customer tracking RPC returns accepted offer + OTPs to the stakeholder', true)
  }

  // =========================================================================
  // E. Trip lifecycle: ordered, OTP-gated, photo-scoped, exactly-once
  // =========================================================================
  {
    await actAs(driver1User)
    const jump = await expectError(
      db.query(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivered', '{}'::jsonb)`, [offer1]),
      'Trip status must advance one step at a time'
    )
    expect(/one step at a time/.test(jump), 'status jump must be rejected')

    // Unauthenticated waypoint: pickup_arrived needs no OTP.
    const arrived = await rows(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'pickup_arrived', '{}'::jsonb)`, [offer1])
    expect(arrived[0].status === 'pickup_arrived' && arrived[0].pickup_arrived_at !== null, `pickup_arrived must persist: ${JSON.stringify(arrived[0])}`)

    const noOtp = await expectError(
      db.query(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'in_transit', '{}'::jsonb)`, [offer1]),
      'Pickup OTP is required before starting the journey'
    )
    expect(/Pickup OTP/.test(noOtp), 'pickup OTP gate must hold')

    const wrong = await rows(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'in_transit', '{"pickup_otp":"0000"}'::jsonb)`, [offer1])
    expect(wrong[0].result_code === 'OTP_INCORRECT' && wrong[0].otp_attempts_remaining === 4, `wrong pickup OTP must be counted: ${JSON.stringify(wrong[0])}`)
    expect(wrong[0].status === 'pickup_arrived', 'wrong OTP must not move the trip')
    record('21. out-of-order and wrong-OTP progress rejected, failed attempt counted', true)
  }

  {
    await actAs(driver1User)
    const foreignPhoto = `https://demo.supabase.local/storage/v1/object/public/trip-photos/${driver2User}/${offer1}/loading.jpg`
    const badPhoto = await expectError(
      db.query(
        `SELECT * FROM public.persist_driver_job_offer_progress($1, NULL, $2::jsonb)`,
        [offer1, JSON.stringify({ photo_loading_url: foreignPhoto })]
      ),
      'Invalid trip photo reference'
    )
    expect(/Invalid trip photo/.test(badPhoto), 'foreign-driver photo path must be rejected')

    const ownerPhoto = `https://demo.supabase.local/storage/v1/object/public/trip-photos/${driver1User}/${offer1}/loading.jpg`
    const photoState = await rows(
      `SELECT * FROM public.persist_driver_job_offer_progress($1, NULL, $2::jsonb)`,
      [offer1, JSON.stringify({ photo_loading_url: ownerPhoto })]
    )
    expect(photoState[0].photo_loading_url === ownerPhoto && photoState[0].status === 'pickup_arrived', 'job-scoped photo must persist on the in-progress trip')
    record('22. photo reference restricted to the job-scoped driver path; photo persists in progress', true)
  }

  {
    await actAs(driver1User)
    const started = await rows(
      `SELECT * FROM public.persist_driver_job_offer_progress($1, 'in_transit', '{"pickup_otp":"4321"}'::jsonb)`,
      [offer1]
    )
    expect(started[0].status === 'in_transit' && started[0].journey_started_at !== null, `in_transit must set journey_started_at: ${JSON.stringify(started[0])}`)
    const verified = await rows(`SELECT pickup_otp_verified_at FROM public.job_offers WHERE id = $1`, [offer1])
    expect(verified[0].pickup_otp_verified_at !== null, 'pickup OTP verification timestamp must be recorded')

    const arrived = await rows(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivery_arrived', '{}'::jsonb)`, [offer1])
    expect(arrived[0].status === 'delivery_arrived', 'delivery_arrived step must be accepted')

    const wrongDelivery = await rows(
      `SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivered', '{"delivery_otp":"0000"}'::jsonb)`,
      [offer1]
    )
    expect(wrongDelivery[0].result_code === 'OTP_INCORRECT', `wrong delivery OTP must be counted: ${JSON.stringify(wrongDelivery[0])}`)

    const deliveryPhoto = `https://demo.supabase.local/storage/v1/object/public/trip-photos/${driver1User}/${offer1}/delivery.jpg`
    const delivered = await rows(
      `SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivered', $2::jsonb)`,
      [offer1, JSON.stringify({ delivery_otp: '8765', photo_delivery_url: deliveryPhoto })]
    )
    expect(delivered[0].status === 'delivered' && delivered[0].delivered_at !== null, `delivery must complete: ${JSON.stringify(delivered[0])}`)
    expect(delivered[0].photo_delivery_url === deliveryPhoto, 'delivery photo must persist')
    expect(delivered[0].total_trips === 1, `total_trips must be 1 after the first delivery, got ${delivered[0].total_trips}`)
    record('23. full OTP-gated trip completion persists with server timestamps and photos', true)
  }

  {
    // Duplicate realtime delivery / retry: replayed completion must have no effect.
    await actAs(driver1User)
    const before = (await rows(`SELECT delivered_at FROM public.job_offers WHERE id = $1`, [offer1]))[0]
    const replay = await rows(
      `SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivered', '{"delivery_otp":"8765"}'::jsonb)`,
      [offer1]
    )
    const after = (await rows(`SELECT delivered_at FROM public.job_offers WHERE id = $1`, [offer1]))[0]
    const driverRow = await rows(`SELECT total_trips, active_job_id FROM public.drivers WHERE id = $1`, [driver1])

    expect(replay[0].status === 'delivered' && replay[0].result_code === 'OK', 'replayed completion must return the authoritative state')
    expect(ts(after.delivered_at) === ts(before.delivered_at), 'replay must not rewrite delivered_at')
    expect(driverRow[0].total_trips === 1, `replay must not increment total_trips again, got ${driverRow[0].total_trips}`)
    expect(driverRow[0].active_job_id === null, 'completion must clear the active job')
    record('24. duplicate/replayed delivery is exactly-once (counter, timestamp, active job unchanged)', true)
  }

  {
    await actAs(driver1User)
    const photoSwap = await expectError(
      db.query(
        `SELECT * FROM public.persist_driver_job_offer_progress($1, NULL, $2::jsonb)`,
        [offer1, JSON.stringify({ photo_delivery_url: `https://demo.supabase.local/storage/v1/object/public/trip-photos/${driver1User}/${offer1}/other.jpg` })]
      ),
      'Trip is already completed'
    )
    expect(/already completed/.test(photoSwap), 'completed trip must be immutable for the driver')

    // A same-status call is the idempotent replay path (proven above) and must
    // leave the verification stamps untouched.
    const stamps = await rows(`SELECT pickup_otp_verified_at, delivery_otp_verified_at FROM public.job_offers WHERE id = $1`, [offer1])
    expect(stamps[0].pickup_otp_verified_at !== null && stamps[0].delivery_otp_verified_at !== null, 'verification stamps must survive the replayed completion')

    await actAs(driver2User)
    const foreignProgress = await expectError(
      db.query(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'pickup_arrived', '{}'::jsonb)`, [offer1]),
      'Job offer not found or access denied'
    )
    expect(/access denied/.test(foreignProgress), 'driver2 must not progress driver1 trip')
    record('25. post-delivery immutability + cross-driver trip progress denied', true)
  }

  // =========================================================================
  // F. Storage: real trip-photo objects and buckets
  // =========================================================================
  {
    await actAsService()
    const buckets = await rows(`SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets ORDER BY id`)
    const tripPhotos = buckets.find((b) => b.id === 'trip-photos')
    const driverDocs = buckets.find((b) => b.id === 'driver-docs')
    const billingDocs = buckets.find((b) => b.id === 'billing-documents')
    // TO-142: trip-photos and billing-documents are now PRIVATE buckets like
    // driver-docs; reads go through stakeholder/owner RLS policies plus
    // expiring signed URLs minted by trusted edges, never world-readable URLs.
    expect(tripPhotos && tripPhotos.public === false && Number(tripPhotos.file_size_limit) === 5242880, `trip-photos bucket config wrong: ${JSON.stringify(tripPhotos)}`)
    expect(driverDocs && driverDocs.public === false, `driver-docs bucket must stay private: ${JSON.stringify(driverDocs)}`)
    expect(billingDocs && billingDocs.public === false, `billing-documents bucket must be private: ${JSON.stringify(billingDocs)}`)

    await actAs(driver1User)
    const uploaded = await rows(
      `INSERT INTO storage.objects (bucket_id, name, owner)
       VALUES ('trip-photos', $1, $2) RETURNING id, name`,
      [`${driver1User}/${offer1}/loading.jpg`, driver1User]
    )
    expect(uploaded.length === 1, 'driver must be able to upload the trip photo into their own folder')

    await actAs(driver2User)
    const intruder = await expectError(
      db.query(
        `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('trip-photos', $1, $2)`,
        [`${driver1User}/${offer1}/intruder.jpg`, driver2User]
      ),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(intruder), 'driver2 must not upload into driver1 folder')

    await actAs(driver1User)
    const visible = await rows(`SELECT name FROM storage.objects WHERE bucket_id = 'trip-photos'`)
    expect(visible.some((r) => r.name === `${driver1User}/${offer1}/loading.jpg`), 'uploaded trip photo must be readable by its uploader')

    // TO-142 stakeholder reads on the private bucket: the shipment customer and
    // the owning agency user may view the driver's proof photo; a driver with
    // no stake on the job and the anonymous role may not.
    await actAs(customerUser)
    const customerView = await rows(`SELECT name FROM storage.objects WHERE bucket_id = 'trip-photos'`)
    expect(customerView.some((r) => r.name === `${driver1User}/${offer1}/loading.jpg`), 'shipment customer must read the trip photo as a stakeholder')

    await actAs(agencyAUser)
    const agencyView = await rows(`SELECT name FROM storage.objects WHERE bucket_id = 'trip-photos'`)
    expect(agencyView.some((r) => r.name === `${driver1User}/${offer1}/loading.jpg`), 'owning agency user must read the trip photo as a stakeholder')

    await actAs(driver2User)
    const foreignView = await rows(`SELECT name FROM storage.objects WHERE bucket_id = 'trip-photos'`)
    expect(!foreignView.some((r) => r.name === `${driver1User}/${offer1}/loading.jpg`), 'non-stakeholder driver must not read another driver trip photo')

    await actAsAnon()
    const anonCount = await rows(`SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'trip-photos'`)
    expect(anonCount[0].n === 0, 'anon must not read trip photos after privatization')
    record('26. trip-photo storage: private bucket, owner-folder upload, cross-driver upload denied, stakeholder reads scoped', true, 'billing-documents private bucket re-verified (TO-142)')
  }

  // =========================================================================
  // G. Handoff linkage: shipment status, agency ledger, driver earnings
  // =========================================================================
  {
    // TO-142 r2: the delivery trigger propagates the completed trip to the
    // shipment and the agency job server-side (exactly-once: replays no-op).
    await actAsService()
    const shipmentState = (await rows(`SELECT status FROM public.shipments WHERE id = $1`, [shipment1.id]))[0]
    const jobState = (await rows(`SELECT status FROM public.agency_jobs WHERE id = $1`, [agencyJob1]))[0]
    expect(
      shipmentState.status === 'delivered' && jobState.status === 'delivered',
      `server-side propagation must sync shipment + agency job on delivery, got shipment=${shipmentState.status} job=${jobState.status}`
    )
    record('27. server-side delivery propagation: shipment and agency job status sync from the delivered trip', true, `shipment=${shipmentState.status}, job=${jobState.status}`)

    // The customer surface keeps its own write path; the agency cannot write
    // the customer's shipment.
    await actAs(customerUser)
    const moved = await rows(`UPDATE public.shipments SET status = 'delivered', updated_at = now() WHERE id = $1 RETURNING status`, [shipment1.id])
    expect(moved[0].status === 'delivered', 'customer must update own shipment status')
    const history = await rows(
      `SELECT shipment_id FROM public.shipments WHERE status = 'delivered' ORDER BY updated_at DESC LIMIT 20`
    )
    expect(history.some((r) => r.shipment_id === shipment1.reference), 'customer history must return the delivered shipment')

    await actAs(agencyAUser)
    const agencyShipment = await rows(`UPDATE public.shipments SET status = 'cancelled' WHERE id = $1 RETURNING id`, [shipment1.id])
    expect(agencyShipment.length === 0, 'agency must not update the customer shipment')

    record('27b. customer keeps its own shipment status path; agency cannot write the customer shipment', true)
  }

  {
    // Agency ledger (agency-portal-billing SQL replicated on the agency's own
    // RLS-visible rows): only delivered agency jobs count, fare once.
    await actAs(agencyAUser)
    const delivered = await rows(`UPDATE public.agency_jobs SET status = 'delivered' WHERE id = $1 RETURNING status, fare`, [agencyJob1])
    expect(delivered[0].status === 'delivered', 'agency must be able to mark its job delivered (direct RLS update, as agencySupabaseApi.updateStatus does)')

    const ledger = await rows(
      `SELECT
         COALESCE(SUM(fare) FILTER (WHERE status = 'delivered'), 0)::numeric AS total_delivered,
         COALESCE(SUM(fare) FILTER (WHERE status IN ('accepted','in_transit')), 0)::numeric AS pending,
         count(*) FILTER (WHERE status = 'delivered')::int AS delivered_count
       FROM public.agency_jobs`
    )
    expect(Number(ledger[0].total_delivered) === 15000 && ledger[0].delivered_count === 1, `ledger must count the fare once: ${JSON.stringify(ledger[0])}`)

    // Replay of the deliverable status write is a no-op on a single row.
    await db.query(`UPDATE public.agency_jobs SET status = 'delivered' WHERE id = $1`, [agencyJob1])
    const ledgerAfter = await rows(
      `SELECT count(*)::int AS n, COALESCE(SUM(fare),0)::numeric AS total FROM public.agency_jobs WHERE status = 'delivered'`
    )
    expect(ledgerAfter[0].n === 1 && Number(ledgerAfter[0].total) === 15000, `replayed agency status must not duplicate the ledger row: ${JSON.stringify(ledgerAfter[0])}`)

    await actAs(agencyBUser)
    const foreignLedger = await rows(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE status = 'delivered'`)
    expect(foreignLedger[0].n === 0, 'B ledger must not count A jobs')
    record('28. agency ledger counts one delivered job/fare; cross-agency ledger isolated', true, 'billing SQL replicated from agency-portal-billing')
  }

  {
    // Driver earnings (driverEarningsApi SQL) — one delivered trip, cost once.
    await actAs(driver1User)
    const earnings = await rows(
      `SELECT jo.delivered_at, s.estimated_cost
       FROM public.job_offers jo
       JOIN public.shipments s ON s.id = jo.shipment_id
       WHERE jo.driver_id = $1 AND jo.status = 'delivered'`,
      [driver1]
    )
    expect(earnings.length === 1, `driver must have exactly 1 delivered trip, got ${earnings.length}`)
    expect(Number(earnings[0].estimated_cost) === 18500, `trip earnings must equal the shipment cost once, got ${earnings[0].estimated_cost}`)
    const thirtyDays = earnings.filter((t) => t.delivered_at && ts(t.delivered_at) >= Date.now() - 30 * 86400000)
    expect(thirtyDays.length === 1, 'last-30-days earnings must include the delivery exactly once')

    const history = await rows(
      `SELECT id, status FROM public.job_offers WHERE driver_id = $1 AND status IN ('delivered','accepted','declined','expired','cancelled')`,
      [driver1]
    )
    expect(history.length === 1 && history[0].status === 'delivered', `driver history must show exactly the delivered trip: ${JSON.stringify(history)}`)
    record('29. driver earnings/history read exactly one trip with the correct amount', true, 'earnings SQL replicated from driverEarningsApi')
  }

  {
    // Payouts: requests only, no money movement at the DB layer.
    await actAs(driver1User)
    await rows(`INSERT INTO public.driver_payouts (driver_id, amount, status, requested_at, note) VALUES ($1, 5000, 'pending', now(), 'weekly withdrawal')`, [driver1])
    const own = await rows(`SELECT amount, status, type FROM public.driver_payouts`)
    expect(own.length === 1 && own[0].status === 'pending' && own[0].type === 'withdrawal', `driver payout request shape wrong: ${JSON.stringify(own)}`)

    await actAs(driver2User)
    const foreign = await rows(`SELECT id FROM public.driver_payouts`)
    expect(foreign.length === 0, 'driver2 must not read driver1 payouts')
    const forged = await expectError(
      db.query(`INSERT INTO public.driver_payouts (driver_id, amount, status, requested_at) VALUES ($1, 100, 'pending', now())`, [driver1]),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(forged), 'driver2 must not insert a payout for driver1')
    record('30. driver payout request persists as pending; cross-driver read/write denied', true)
  }

  {
    // Agency payout via portal authority: contract checks then service insert.
    await actAsService()
    await assertApprovedDriverContract(driver1)
    await assertDriverOnAgencyFleet(agencyA, driver1)
    await db.query(
      `INSERT INTO public.driver_payouts (driver_id, agency_id, amount, type, status, requested_at, note)
       VALUES ($1, $2, 3000, 'agency_pay', 'pending', now(), 'trip advance')`,
      [driver1, agencyA]
    )
    const agencyPayout = await rows(`SELECT amount, type, status FROM public.driver_payouts WHERE type = 'agency_pay'`)
    expect(agencyPayout.length === 1 && agencyPayout[0].status === 'pending', `agency payout must be created pending: ${JSON.stringify(agencyPayout)}`)

    // Contract rejections: out-of-fleet and suspended-unapproved drivers.
    const crossFleet = await expectError(
      assertDriverOnAgencyFleet(agencyB, driver1),
      'Driver is not assigned to this agency fleet.'
    )
    expect(/this agency fleet/.test(crossFleet), 'agency B must not pay agency A fleet driver')

    await db.query(`UPDATE public.drivers SET status = 'suspended' WHERE id = $1`, [driver2])
    const unapproved = await expectError(
      assertApprovedDriverContract(driver2),
      'Only approved drivers can be assigned or paid.'
    )
    expect(/approved drivers/.test(unapproved), 'suspended driver must not be payable')
    record('31. agency payout via portal authority; contract rejects cross-fleet and suspended driver', true)
  }

  {
    // Admin releases one payout (status transition only) — no provider call,
    // no invoice/payment record is created at the DB layer.
    await actAsService()
    await db.query(`UPDATE public.driver_payouts SET status = 'approved', processed_at = now() WHERE type = 'agency_pay'`)
    await actAs(driver1User)
    const balance = await rows(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0)::numeric AS pending,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0)::numeric AS approved,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric AS paid
       FROM public.driver_payouts`
    )
    expect(Number(balance[0].pending) === 5000 && Number(balance[0].approved) === 3000 && Number(balance[0].paid) === 0, `balance snapshot wrong: ${JSON.stringify(balance[0])}`)

    await actAsService()
    const payments = await rows(`SELECT count(*)::int AS n FROM public.payment_history`)
    const invoices = await rows(`SELECT count(*)::int AS n FROM public.invoices`)
    expect(payments[0].n === 0 && invoices[0].n === 0, 'payout state changes must not create payment/invoice rows (no money transfer)')
    record('32. payout release is a status transition only; balance snapshot sums are exact; no money moved', true)
  }

  // =========================================================================
  // H. Realtime/disconnect replay + relogin re-read
  // =========================================================================
  {
    // "Disconnect and refresh": re-establish claims from scratch and re-read
    // the persisted journey state for each role.
    await actAsAnon()
    await actAs(customerUser)
    const customerState = await rows(
      `SELECT
         (SELECT count(*)::int FROM public.shipments WHERE status = 'delivered') AS delivered_shipments,
         (SELECT count(*)::int FROM public.get_shipment_job_offer_tracking($1)) AS tracked,
         (SELECT count(*)::int FROM public.job_offers WHERE shipment_id = $1 AND status = 'delivered') AS delivered_offers`,
      [shipment1.id]
    )
    expect(
      customerState[0].delivered_shipments === 1 && customerState[0].tracked === 1 && customerState[0].delivered_offers === 1,
      `customer re-read mismatch: ${JSON.stringify(customerState[0])}`
    )

    await actAsAnon()
    await actAs(agencyAUser)
    const agencyState = await rows(
      `SELECT (SELECT count(*)::int FROM public.agency_jobs WHERE status = 'delivered') AS delivered_jobs,
              (SELECT count(*)::int FROM public.agency_trucks) AS trucks`
    )
    // trucks=2: A owns truckA1 (assigned) plus truckA2, the empty truck the
    // duplicate-assignment denial test created in case 5b.
    expect(agencyState[0].delivered_jobs === 1 && agencyState[0].trucks === 2, `agency re-read mismatch: ${JSON.stringify(agencyState[0])}`)

    await actAsAnon()
    await actAs(driver1User)
    const driverState = await rows(
      `SELECT (SELECT count(*)::int FROM public.job_offers WHERE status = 'delivered') AS delivered,
              (SELECT total_trips FROM public.drivers WHERE id = $1) AS total_trips`,
      [driver1]
    )
    expect(driverState[0].delivered === 1 && driverState[0].total_trips === 1, `driver re-read mismatch: ${JSON.stringify(driverState[0])}`)

    await actAsAnon()
    await actAs(agencyBUser)
    const bSweep = await rows(
      `SELECT (SELECT count(*)::int FROM public.agency_jobs) AS jobs,
              (SELECT count(*)::int FROM public.agency_trucks WHERE id = $1) AS a_truck,
              (SELECT count(*)::int FROM public.driver_payouts) AS payouts`,
      [truckA1]
    )
    expect(bSweep[0].jobs === 0 && bSweep[0].a_truck === 0 && bSweep[0].payouts === 0, `B sweep must see zero A records: ${JSON.stringify(bSweep[0])}`)

    await actAsAnon()
    await actAs(driver2User)
    const d2Sweep = await rows(
      `SELECT (SELECT count(*)::int FROM public.job_offers WHERE id = $1) AS foreign_offer,
              (SELECT count(*)::int FROM public.driver_payouts) AS payouts`,
      [offer1]
    )
    expect(d2Sweep[0].foreign_offer === 0 && d2Sweep[0].payouts === 0, `driver2 sweep must see zero driver1 records: ${JSON.stringify(d2Sweep[0])}`)

    record('33. relogin/refresh: each role re-reads exactly its own journey state; cross-tenant sweep is empty', true)
  }

  // =========================================================================
  // I. Tenant-claim probes (hard denials after TO-142)
  // =========================================================================
  {
    // TO-142: a different approved agency can no longer attach itself to a
    // shipment it was never authorized on. The consent predicate denies the
    // agency_jobs INSERT, which also removes the row that the offer-insert
    // policy requires, so the derived offer path denies as well.
    await actAs(agencyBUser)
    const claimDenied = await expectError(
      db.query(
        `INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1)`,
        [agencyB, shipment1.id]
      ),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(claimDenied), 'foreign agency claim must be denied by the consent predicate')

    const crossOffer = await expectError(
      db.query(
        `INSERT INTO public.job_offers (shipment_id, driver_id, offered_at, expires_at, pickup_otp, delivery_otp)
         VALUES ($1, $2, now(), now() + interval '1 hour', '1111', '2222')`,
        [shipment1.id, driver2]
      ),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(crossOffer), 'foreign agency offer dispatch must be denied (no authorized agency job of its own)')

    const bJobs = await rows(`SELECT count(*)::int AS n FROM public.agency_jobs`)
    expect(bJobs[0].n === 0, `agency B must hold zero agency jobs, got ${bJobs[0].n}`)
    record('34. tenant-claim probe: foreign agency cannot attach itself or dispatch offers on another shipment', true, 'consent predicate denies the claim and the derived offer')
  }

  {
    // TO-142: suspended agencies are non-operational at the DB write layer.
    // Fixture (TO-143-D1): these consents stay SERVICE-SEEDED on purpose — the
    // platform_dispatch / admin_grant authority is the documented non-RPC
    // write path, and the grant RPC would rightly REFUSE a suspended agency,
    // so the denials below remain attributable to the status predicate alone
    // (not to a missing consent row).
    await actAsService()
    await db.query(
      `INSERT INTO public.shipment_agency_consents (shipment_id, agency_id, granted_via, granted_by)
       VALUES ($1, $2, 'platform_dispatch', $3), ($4, $2, 'platform_dispatch', $3)`,
      [shipment1.id, agencyC, customerUser, shipment3Id]
    )
    await db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1)`, [agencyC, shipment1.id])

    await actAs(agencyCUser)
    const suspendedInsert = await expectError(
      db.query(
        `INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1)`,
        [agencyC, shipment3Id]
      ),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(suspendedInsert), 'suspended agency INSERT must be denied by the status predicate')

    const suspendedUpdate = await expectError(
      db.query(`UPDATE public.agency_jobs SET status = 'accepted' WHERE agency_id = $1`, [agencyC]),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(suspendedUpdate), 'suspended agency UPDATE of its own job must be denied by the status predicate')

    // Reads stay open (the portal must still render for suspended tenants).
    const cReads = await rows(`SELECT count(*)::int AS n FROM public.agency_jobs`)
    expect(cReads[0].n === 1, `suspended agency keeps read access to its own job, got ${cReads[0].n}`)
    record('35. suspended agency rejected at the DB write layer; own reads preserved', true, 'INSERT + UPDATE denied by the agency-status predicate')
  }

  // =========================================================================
  // I2. Consent writer RPCs — the production customer command path (TO-143-D1)
  //     authorize_agency_for_shipment / revoke_agency_for_shipment are
  //     SECURITY DEFINER but caller-bound: ownership mirrors the producer's
  //     predicate (WITHOUT the tracking RPC's is_admin_user arm), self-grant
  //     is denied explicitly, agency_is_operational and pending status are
  //     enforced at grant time. Consent validity is REVOCATION-ONLY (section J
  //     reproduces the terminal-status gap; no cutoff is enforced or claimed).
  // =========================================================================
  let shipment5
  let consentRowId
  let agencyJob5
  {
    // 36 Grant happy path (fresh shipment5, mirroring the producer's
    // fresh-shipment4 pattern): the customer authorizes agency A through the
    // production RPC and the agency's authenticated INSERT immediately
    // succeeds on that real consent — the 11a-style command path now runs on
    // the real writer, not a service stand-in.
    await actAs(customerUser)
    shipment5 = await createShipment(customer1, customerUser, 'CONSENT')
    const granted = await rows(`SELECT public.authorize_agency_for_shipment($1, $2) AS r`, [shipment5.id, agencyA])
    expect(
      granted[0].r && granted[0].r.state === 'granted' && typeof granted[0].r.id === 'string',
      `grant must return {id, state:'granted'}, got ${JSON.stringify(granted[0].r)}`
    )
    consentRowId = granted[0].r.id

    // The grantor consumes the RPC response; the row itself is verified under
    // the service authority (the SELECT policy covers agency-party/admin only).
    await actAsService()
    const consentRows = await rows(
      `SELECT id, granted_via, granted_by::text AS granted_by, revoked_at
       FROM public.shipment_agency_consents
       WHERE shipment_id = $1 AND agency_id = $2`,
      [shipment5.id, agencyA]
    )
    expect(
      consentRows.length === 1 &&
        consentRows[0].id === consentRowId &&
        consentRows[0].granted_via === 'customer_consent' &&
        consentRows[0].granted_by === customerUser &&
        consentRows[0].revoked_at === null,
      `consent row wrong: ${JSON.stringify(consentRows)}`
    )

    await actAs(agencyAUser)
    const created5 = await rows(
      `INSERT INTO public.agency_jobs (agency_id, shipment_id, fare, status)
       VALUES ($1, $2, 15000, 'pending') RETURNING id`,
      [agencyA, shipment5.id]
    )
    agencyJob5 = created5[0].id
    record('36. grant RPC writes one active customer_consent row; agency job INSERT succeeds on the real consent', true, `state=granted, job=${agencyJob5}`)
  }

  {
    // 37 Foreign caller: an unrelated user cannot grant consent on a shipment
    // it does not own (the ownership guard fires before every other check).
    await actAs(agencyBUser)
    const foreignGrant = await expectError(
      db.query(`SELECT public.authorize_agency_for_shipment($1, $2)`, [shipment5.id, agencyB]),
      'Shipment not found or access denied'
    )
    expect(/not found or access denied/i.test(foreignGrant), 'foreign grant must be ownership-denied')
    record('37. grant RPC is ownership-guarded (foreign caller denied)', true)
  }

  {
    // 38 Agency self-grant: genuinely non-redundant with the ownership guard —
    // a caller can be BOTH the shipment creator (created_by = caller) and the
    // agency owner, so guard (b) must fire where guard (a) passes.
    await actAs(agencyAUser)
    const selfCustomer = await createCustomer(agencyAUser, 'AgencyA Self')
    const selfShipment = await createShipment(selfCustomer, agencyAUser, 'SELF')
    const selfGrant = await expectError(
      db.query(`SELECT public.authorize_agency_for_shipment($1, $2)`, [selfShipment.id, agencyA]),
      'An agency cannot grant itself consent on a shipment.'
    )
    expect(/cannot grant itself/.test(selfGrant), 'agency self-grant must be denied')
    record('38. agency self-grant denied even when the caller owns the shipment', true)
  }

  {
    // 39 Grant-time operational gate: a suspended agency is refused (message
    // parity with portal-auth assertApprovedAgency and the guard triggers).
    await actAs(customerUser)
    const suspendedGrant = await expectError(
      db.query(`SELECT public.authorize_agency_for_shipment($1, $2)`, [shipment5.id, agencyC]),
      'Agency approval is required.'
    )
    expect(/Agency approval is required/.test(suspendedGrant), 'suspended agency grant must be refused')
    record('39. grant RPC refuses non-operational agencies', true)
  }

  {
    // 40 Grant-time lifecycle guard: only pending shipments can be authorized
    // (shipment1 was delivered by the case-27 server-side propagation).
    await actAs(customerUser)
    const closedGrant = await expectError(
      db.query(`SELECT public.authorize_agency_for_shipment($1, $2)`, [shipment1.id, agencyB]),
      'Shipment is not open for dispatch.'
    )
    expect(/not open for dispatch/.test(closedGrant), 'delivered shipment must not be grantable')
    record('40. grant-time lifecycle guard: non-pending shipments are not open for new consent', true)
  }

  {
    // 41 Idempotent replay: an active consent is returned unchanged, with no
    // second write (UNIQUE(shipment_id, agency_id) row is untouched).
    await actAs(customerUser)
    const replay = await rows(`SELECT public.authorize_agency_for_shipment($1, $2) AS r`, [shipment5.id, agencyA])
    expect(
      replay[0].r.state === 'already_active' && replay[0].r.id === consentRowId,
      `active replay must return already_active with the same id, got ${JSON.stringify(replay[0].r)}`
    )
    await actAsService()
    const consentRows = await rows(
      `SELECT count(*)::int AS n,
              (SELECT granted_by::text FROM public.shipment_agency_consents WHERE id = $1) AS granted_by
       FROM public.shipment_agency_consents
       WHERE shipment_id = $2 AND agency_id = $3`,
      [consentRowId, shipment5.id, agencyA]
    )
    expect(
      consentRows[0].n === 1 && consentRows[0].granted_by === customerUser,
      `replay must not write: ${JSON.stringify(consentRows)}`
    )
    record('41. duplicate grant is idempotent: already_active, one row, granted_by unchanged', true)
  }

  {
    // 42 Revocation: the customer revokes; the agency loses its authenticated
    // write path (fail-closed by design) while the service-role Edge path and
    // the delivery propagation trigger are unaffected.
    await actAs(customerUser)
    const revoked = await rows(`SELECT public.revoke_agency_for_shipment($1, $2) AS r`, [shipment5.id, agencyA])
    expect(revoked[0].r && revoked[0].r.state === 'revoked', `revoke must return {state:'revoked'}, got ${JSON.stringify(revoked[0].r)}`)

    // (i) The agency's authenticated UPDATE of its own in-flight job is
    // fail-closed by the UPDATE WITH CHECK consent predicate.
    await actAs(agencyAUser)
    const updateDenied = await expectError(
      db.query(`UPDATE public.agency_jobs SET status = 'accepted' WHERE id = $1`, [agencyJob5]),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(updateDenied), 'revoked consent must fail-close the agency job UPDATE')

    // (ii) A NEW agency job INSERT on the revoked shipment is denied.
    const insertDenied = await expectError(
      db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1)`, [agencyA, shipment5.id]),
      'new row violates row-level security policy'
    )
    expect(/row-level security/.test(insertDenied), 'revoked consent must deny new agency job INSERTs')

    // (iii) The service-role Edge path (agency-portal-jobs BYPASSRLS) still
    // writes statuses after revocation.
    await actAsService()
    await db.query(`UPDATE public.agency_jobs SET status = 'accepted' WHERE id = $1`, [agencyJob5])
    const serviceUpdated = await rows(`SELECT status FROM public.agency_jobs WHERE id = $1`, [agencyJob5])
    expect(serviceUpdated[0].status === 'accepted', 'service-role status write must still succeed after revocation (Edge parity)')

    // (iv) The driver offer/trip path is unaffected (job_offers policies never
    // consult consents) and the SECURITY DEFINER delivery propagation trigger
    // still completes the status sync.
    await actAs(agencyAUser)
    const offer5 = await createOffer(shipment5.id, driver1)
    await actAs(driver1User)
    await rows(`SELECT * FROM public.respond_to_job_offer($1, true)`, [offer5])
    await rows(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'pickup_arrived', '{}'::jsonb)`, [offer5])
    await rows(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'in_transit', '{"pickup_otp":"4321"}'::jsonb)`, [offer5])
    await rows(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivery_arrived', '{}'::jsonb)`, [offer5])
    const delivered5 = await rows(
      `SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivered', '{"delivery_otp":"8765"}'::jsonb)`,
      [offer5]
    )
    expect(delivered5[0].status === 'delivered', `post-revocation offer must still complete: ${JSON.stringify(delivered5[0])}`)
    await actAsService()
    const propagated = await rows(
      `SELECT (SELECT status FROM public.shipments WHERE id = $1) AS shipment_status,
              (SELECT status FROM public.agency_jobs WHERE id = $2) AS job_status`,
      [shipment5.id, agencyJob5]
    )
    expect(
      propagated[0].shipment_status === 'delivered' && propagated[0].job_status === 'delivered',
      `delivery propagation must still sync after revocation: ${JSON.stringify(propagated[0])}`
    )
    record('42. revocation fail-closes the agency authenticated path; service-role writes and delivery propagation continue', true)
  }

  {
    // 43 Re-consent after revocation reactivates the single row and restores
    // the agency's authenticated INSERT/UPDATE path. Case 42(iv)'s delivered
    // offer left shipment5 in the terminal 'delivered' status (server-side
    // propagation), so the owner first reopens it through its own shipment
    // status path (case 27b capability) — the grant-time lifecycle guard (d)
    // then admits the re-consent, exactly as it would for any reopened
    // booking.
    await actAs(customerUser)
    const reopened = await rows(`UPDATE public.shipments SET status = 'pending', updated_at = now() WHERE id = $1 RETURNING id`, [shipment5.id])
    expect(reopened.length === 1, 'owner must be able to reopen its own shipment for re-consent')
    const reactivate = await rows(`SELECT public.authorize_agency_for_shipment($1, $2) AS r`, [shipment5.id, agencyA])
    expect(
      reactivate[0].r.state === 'reactivated' && reactivate[0].r.id === consentRowId,
      `re-grant must reactivate the same row, got ${JSON.stringify(reactivate[0].r)}`
    )
    await actAsService()
    const reactivatedRow = await rows(`SELECT revoked_at FROM public.shipment_agency_consents WHERE id = $1`, [consentRowId])
    expect(reactivatedRow[0].revoked_at === null, `reactivated row must have revoked_at IS NULL, got ${JSON.stringify(reactivatedRow)}`)

    await actAs(agencyAUser)
    const restored = await rows(`UPDATE public.agency_jobs SET status = 'accepted' WHERE id = $1 RETURNING status`, [agencyJob5])
    expect(restored[0].status === 'accepted', 'agency UPDATE path must be restored after re-consent')
    // INSERT path restored too: RLS now admits the statement, so the
    // (agency_id, shipment_id) settlement key is what rejects the duplicate —
    // a policy denial would fire before the constraint check.
    const dupInsert = await expectError(
      db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1)`, [agencyA, shipment5.id]),
      'duplicate key value violates unique constraint'
    )
    expect(/duplicate key/.test(dupInsert), 'restored INSERT path must reach the settlement key (RLS admitted, unique constraint rejected)')
    record('43. re-consent reactivates the single row and restores the INSERT/UPDATE path', true)
  }

  {
    // 44 anon EXECUTE revoked on both consent RPCs (trip-battery case-19
    // pattern, TO-143-D1 verification round 2). The harness grants default
    // privileges (line ~183) so new public functions are anon-executable
    // UNTIL the migration's REVOKE ALL ... FROM PUBLIC, anon removes it. The
    // assertion is discriminating: without the revoke the call would surface
    // the ownership-guard message ('Shipment not found or access denied'),
    // not a privilege denial.
    await actAsAnon()
    const anonGrant = await expectError(
      db.query(`SELECT public.authorize_agency_for_shipment($1, $2)`, [shipment5.id, agencyA]),
      'permission denied'
    )
    expect(/permission denied/i.test(anonGrant), `anon grant call must be privilege-denied, got: ${anonGrant}`)
    const anonRevoke = await expectError(
      db.query(`SELECT public.revoke_agency_for_shipment($1, $2)`, [shipment5.id, agencyA]),
      'permission denied'
    )
    expect(/permission denied/i.test(anonRevoke), `anon revoke call must be privilege-denied, got: ${anonRevoke}`)
    record('44. anon EXECUTE revoked on both consent RPCs', true)
  }

  {
    // 45 Revoke RPC idempotent replay (verification round 2 — coverage for
    // the already_revoked branch the round-1 battery never exercised): a
    // second revoke on the already-revoked pair returns already_revoked with
    // the same row id and performs no second write (revoked_at unchanged).
    // Runs after 43 so the pair is ACTIVE again; nothing after this block
    // depends on it (section J seeds its own agencyB/shipment1 consent).
    await actAs(customerUser)
    const first = await rows(`SELECT public.revoke_agency_for_shipment($1, $2) AS r`, [shipment5.id, agencyA])
    expect(first[0].r && first[0].r.state === 'revoked', `first revoke must return revoked, got ${JSON.stringify(first[0].r)}`)
    await actAsService()
    const afterFirst = await rows(
      `SELECT id, revoked_at FROM public.shipment_agency_consents WHERE shipment_id = $1 AND agency_id = $2`,
      [shipment5.id, agencyA]
    )
    await actAs(customerUser)
    const second = await rows(`SELECT public.revoke_agency_for_shipment($1, $2) AS r`, [shipment5.id, agencyA])
    expect(
      second[0].r && second[0].r.state === 'already_revoked' && second[0].r.id === afterFirst[0].id,
      `replay must return already_revoked with the same id, got ${JSON.stringify(second[0].r)}`
    )
    await actAsService()
    const afterSecond = await rows(
      `SELECT id, revoked_at FROM public.shipment_agency_consents WHERE shipment_id = $1 AND agency_id = $2`,
      [shipment5.id, agencyA]
    )
    expect(
      afterSecond[0].revoked_at !== null &&
        String(afterSecond[0].revoked_at) === String(afterFirst[0].revoked_at),
      `replay must not rewrite revoked_at: first=${afterFirst[0].revoked_at} second=${afterSecond[0].revoked_at}`
    )
    record('45. revoke RPC replay is idempotent (already_revoked, same id, no rewrite)', true)
  }

  // =========================================================================
  // J. Reproduced finding — NOT a passing case (harness finding convention):
  //    terminal-status consent cutoff missing (owner-deferred).
  // =========================================================================
  {
    // Consent validity is REVOCATION-ONLY. The agency_jobs INSERT/UPDATE
    // policies (20261006120000:382-421) check ownership + active consent +
    // agency_is_operational but have NO shipment-status predicate, so an
    // active consent granted pre-termination (or platform-seeded) still
    // permits a NEW agency_jobs INSERT after the shipment reaches a terminal
    // status. agencyB held zero jobs through case 34; this block runs LAST so
    // nothing earlier is disturbed.
    await actAsService()
    await db.query(
      `INSERT INTO public.shipment_agency_consents (shipment_id, agency_id, granted_via, granted_by)
       VALUES ($1, $2, 'platform_dispatch', $3)`,
      [shipment1.id, agencyB, customerUser]
    )
    await actAs(agencyBUser)
    let terminalInsertOutcome = 'denied'
    let terminalJobId = null
    try {
      const terminalInsert = await rows(
        `INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1) RETURNING id`,
        [agencyB, shipment1.id]
      )
      terminalInsertOutcome = 'SUCCEEDED'
      terminalJobId = terminalInsert[0]?.id ?? null
    } catch (error) {
      terminalInsertOutcome = `denied (${error && error.message ? error.message.split('\n')[0] : error})`
    }
    recordFinding(
      'terminal-status consent cutoff missing',
      `an active consent granted pre-termination (or platform-seeded) permits a NEW agency_jobs INSERT on a delivered/cancelled shipment — INSERT ${terminalInsertOutcome} on delivered shipment1 (agency_jobs.id=${terminalJobId}). Remediation = shipment-status predicate on the agency_jobs INSERT/UPDATE policies (20261006120000:382-421) or a consent auto-revoke trigger on shipments.status; both are policy/schema changes outside the TO-143-D1 fences (owner-deferred).`
    )
  }

  // -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} cases passed (SQL-level, PostgreSQL engine, two agencies + two drivers)`)
  if (findings.length > 0) {
    console.log(`${findings.length} finding(s) recorded separately (defects/gaps reproduced, not counted as passing cases):`)
    for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`)
  }
  console.log('NOTE: PostgREST/GoTrue/Storage HTTP round-trips, Edge Function execution, browser rendering and the disposable local Supabase stack were NOT executed here; see agent-results/025-result.md.')
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
