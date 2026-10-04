#!/usr/bin/env node
/**
 * TO-130 — behavioral trip-transition / OTP-enforcement test.
 *
 * LEVEL (read this first): SQL-level proof on a REAL PostgreSQL 17 engine
 * (PGlite WASM, the same engine class as the local Supabase database). It
 * replays the full supabase/migrations chain, then drives the real
 * `persist_driver_job_offer_progress` / `get_shipment_job_offer_tracking`
 * SECURITY DEFINER functions, real RLS, real role switching
 * (`SET ROLE authenticated` + `request.jwt.claims`, exactly what PostgREST
 * does) and real column/table privilege checks.
 *
 * It is NOT the disposable Supabase stack: there is no PostgREST, no GoTrue
 * and no second connection, so:
 *   - REST-level checks are exercised at the SQL privilege/RLS layer instead
 *     (same role, same grants, same policies);
 *   - true concurrent transactions cannot be executed on a single-connection
 *     engine. The lock-then-replay logic that serializes concurrent calls is
 *     covered by the sequential replay case and FOR UPDATE row locking.
 *
 * Reason for this level: Docker Desktop (and Podman) are not installed on this
 * machine, so `npx supabase start` cannot run. `npx supabase status` reports
 * "docker: command not found (podman also not found)". See
 * agent-results/020-result.md for the exact transcript.
 *
 * Usage:  node scripts/trip_transition_integrity.db.test.mjs
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
function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
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
      // PGlite appends engine context (" [SQL: ...]") to driver-level errors,
      // so match on the message prefix rather than exact equality.
      expect(
        message.startsWith(expectedMessage),
        `expected error "${expectedMessage}", got: ${JSON.stringify(message)}`
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

async function createUser(tag, role = 'user') {
  const id = uid()
  await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${tag}-${seq}@example.com`])
  await db.query(`INSERT INTO public.users (id, email, role) VALUES ($1, $2, $3)`, [id, `${tag}-${seq}@example.com`, role])
  return id
}

async function createDriver(tag, userId) {
  const id = uid()
  await db.query(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'tata_407', 'approved', true, 'ABCDE1234F')`,
    [id, userId, `TO130 ${tag}`, `9${String(seq).padStart(9, '0')}`]
  )
  return id
}

async function createShipment(tag, customerUserId) {
  const id = uid()
  await db.query(
    `INSERT INTO public.shipments (id, shipment_id, customer_id, truck_id, origin, destination, status, total_weight, total_volume, estimated_cost, created_by)
     VALUES ($1, $2, NULL, NULL, 'Origin', 'Destination', 'pending', 500, 2, 1500, $3)`,
    [id, `TO130-${tag}-${seq}`, customerUserId]
  )
  return id
}

async function createOffer(shipmentId, driverId, overrides = {}) {
  const id = uid()
  const row = {
    status: 'accepted',
    pickup_otp: '1111',
    delivery_otp: '2222',
    ...overrides,
  }
  await db.query(
    `INSERT INTO public.job_offers
       (id, shipment_id, driver_id, offered_at, expires_at, responded_at, status,
        pickup_otp, delivery_otp, pickup_arrived_at, journey_started_at,
        delivery_arrived_at, delivered_at, pickup_otp_verified_at)
     VALUES ($1, $2, $3, now(), now() + interval '1 hour', now(), $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id, shipmentId, driverId, row.status, row.pickup_otp, row.delivery_otp,
      row.pickup_arrived_at ?? null, row.journey_started_at ?? null,
      row.delivery_arrived_at ?? null, row.delivered_at ?? null,
      row.pickup_otp_verified_at ?? null,
    ]
  )
  return id
}

async function serviceOffer(jobOfferId) {
  await actAsService()
  const { rows } = await db.query(
    `SELECT status, pickup_arrived_at, journey_started_at, delivery_arrived_at, delivered_at,
            photo_loading_url, photo_delivery_url, pickup_otp_verified_at, delivery_otp_verified_at,
            pickup_otp_attempts, delivery_otp_attempts, pickup_otp_locked_until, delivery_otp_locked_until
     FROM public.job_offers WHERE id = $1`,
    [jobOfferId]
  )
  return rows[0]
}

async function serviceDriver(driverId) {
  await actAsService()
  const { rows } = await db.query(
    `SELECT total_trips, active_job_id FROM public.drivers WHERE id = $1`,
    [driverId]
  )
  return rows[0]
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

async function callProgress(jobOfferId, status, extra = {}) {
  const { rows } = await db.query(
    `SELECT * FROM public.persist_driver_job_offer_progress($1, $2, $3::jsonb)`,
    [jobOfferId, status, JSON.stringify(extra)]
  )
  return rows[0]
}

async function callTracking(shipmentId) {
  const { rows } = await db.query(
    `SELECT * FROM public.get_shipment_job_offer_tracking($1)`,
    [shipmentId]
  )
  return rows[0]
}

// forward-declared fixture ids used across cases
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  record('migration chain replays cleanly (full supabase/migrations, newest last)', applied.length >= 34,
    `${applied.length} files, last=${applied[applied.length - 1]}`)

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)

  // Shared identities
  const goodUser = await createUser('good-driver')
  const evilUser = await createUser('evil-driver')
  const customerA = await createUser('customer-a')
  const customerB = await createUser('customer-b')
  const goodDriver = await createDriver('good', goodUser)
  const evilDriver = await createDriver('evil', evilUser)

  // ---- 1. happy path: ordered progress + server-authoritative timestamps --
  {
    await actAsService()
    const user1 = await createUser('happy-driver')
    const driver1 = await createDriver('happy', user1)
    const ship = await createShipment('happy', customerA)
    const offer = await createOffer(ship, driver1)

    await actAs(user1)
    const before = (await db.query('SELECT now() AS t')).rows[0].t
    const p1 = await callProgress(offer, 'pickup_arrived')
    expect(p1.result_code === 'OK', `pickup_arrived should succeed: ${JSON.stringify(p1)}`)
    expect(new Date(p1.pickup_arrived_at) >= new Date(before), 'pickup_arrived_at must be server time')

    const p2 = await callProgress(offer, 'in_transit', { pickup_otp: '1111' })
    expect(p2.result_code === 'OK' && p2.status === 'in_transit', `in_transit should succeed: ${JSON.stringify(p2)}`)
    expect(p2.otp_attempts_remaining === 5, 'successful pickup OTP resets to 5 remaining')

    const p3 = await callProgress(offer, 'delivery_arrived')
    expect(p3.result_code === 'OK' && p3.status === 'delivery_arrived', `delivery_arrived should succeed: ${JSON.stringify(p3)}`)

    const p4 = await callProgress(offer, 'delivered', { delivery_otp: '2222' })
    expect(p4.result_code === 'OK' && p4.status === 'delivered', `delivered should succeed: ${JSON.stringify(p4)}`)
    expect(p4.total_trips === 1, `first completion increments total_trips exactly once, got ${p4.total_trips}`)

    const row = await serviceOffer(offer)
    expect(row.pickup_otp_verified_at !== null, 'pickup_otp_verified_at set on in_transit')
    expect(row.delivery_otp_verified_at !== null, 'delivery_otp_verified_at set on delivered')
    expect(new Date(row.delivered_at) >= new Date(before), 'delivered_at must be server time')
    expect(row.pickup_otp_attempts === 0 && row.delivery_otp_attempts === 0, 'attempt counters reset after success')
    const drv = await serviceDriver(driver1)
    expect(drv.total_trips === 1 && drv.active_job_id === null, 'delivery effect: +1 trip and active job cleared')
    record('1. ordered happy path accepted→pickup_arrived→in_transit→delivery_arrived→delivered', true)
  }

  // ---- 2. skipped transition is rejected ----------------------------------
  {
    await actAsService()
    const ship = await createShipment('skip', customerA)
    const offer = await createOffer(ship, goodDriver)
    await actAs(goodUser)
    await expectError(callProgress(offer, 'in_transit', { pickup_otp: '1111' }), 'Trip status must advance one step at a time')
    const row = await serviceOffer(offer)
    expect(row.status === 'accepted', 'skipped transition must not write')
    record('2. skipped transition (accepted→in_transit) rejected, no write', true)
  }

  // ---- 3. backward transition is rejected ---------------------------------
  {
    await actAsService()
    const ship = await createShipment('back', customerA)
    const offer = await createOffer(ship, goodDriver, {
      status: 'delivered', delivered_at: new Date().toISOString(), pickup_otp_verified_at: new Date().toISOString(),
    })
    await actAs(goodUser)
    await expectError(callProgress(offer, 'delivery_arrived'), 'Trip status cannot move backwards')
    await expectError(callProgress(offer, 'accepted'), 'Invalid trip status')
    record('3. backward transition and non-progress statuses rejected', true)
  }

  // ---- 4. wrong / missing pickup OTP --------------------------------------
  {
    await actAsService()
    const ship = await createShipment('wrongpickup', customerA)
    const offer = await createOffer(ship, goodDriver, { status: 'pickup_arrived', pickup_arrived_at: new Date().toISOString() })
    await actAs(goodUser)

    const wrong = await callProgress(offer, 'in_transit', { pickup_otp: '9999' })
    expect(wrong.result_code === 'OTP_INCORRECT', `wrong pickup OTP must be OTP_INCORRECT: ${JSON.stringify(wrong)}`)
    expect(wrong.otp_attempts_remaining === 4, `4 attempts remaining after first failure, got ${wrong.otp_attempts_remaining}`)
    expect(wrong.status === 'pickup_arrived', 'wrong OTP must not change status')

    const attempts = await serviceOffer(offer)
    expect(attempts.pickup_otp_attempts === 1, `failed attempt must be durably recorded, got ${attempts.pickup_otp_attempts}`)
    expect(attempts.pickup_otp_verified_at === null, 'failed pickup OTP must not verify')

    await actAs(goodUser)
    await expectError(callProgress(offer, 'in_transit'), 'Pickup OTP is required before starting the journey')
    record('4. wrong OTP is committed+counted; missing OTP rejected', true)
  }

  // ---- 5. bounded attempts lock the code ----------------------------------
  {
    await actAsService()
    const ship = await createShipment('lockout', customerA)
    const offer = await createOffer(ship, goodDriver, { status: 'pickup_arrived', pickup_arrived_at: new Date().toISOString() })
    await actAs(goodUser)

    let last
    for (let i = 1; i <= 5; i += 1) {
      last = await callProgress(offer, 'in_transit', { pickup_otp: '0000' })
      expect(last.result_code === (i === 5 ? 'OTP_LOCKED' : 'OTP_INCORRECT'),
        `attempt ${i} should be ${i === 5 ? 'OTP_LOCKED' : 'OTP_INCORRECT'}: ${JSON.stringify(last)}`)
    }
    const locked = await serviceOffer(offer)
    expect(locked.pickup_otp_locked_until !== null, 'lock timestamp must be persisted')
    expect(locked.pickup_otp_attempts === 5, `5 attempts persisted, got ${locked.pickup_otp_attempts}`)

    // even the CORRECT code is refused while locked
    await actAs(goodUser)
    const correctWhileLocked = await callProgress(offer, 'in_transit', { pickup_otp: '1111' })
    expect(correctWhileLocked.result_code === 'OTP_LOCKED', 'correct OTP is refused while locked')
    expect(correctWhileLocked.status === 'pickup_arrived', 'locked attempt must not progress')

    // simulate the 15 minutes elapsing, then the correct code succeeds + resets
    await actAsService()
    await db.query(`UPDATE public.job_offers SET pickup_otp_locked_until = now() - interval '1 second' WHERE id = $1`, [offer])
    await actAs(goodUser)
    const afterLock = await callProgress(offer, 'in_transit', { pickup_otp: '1111' })
    expect(afterLock.result_code === 'OK', `correct OTP after lock expiry must succeed: ${JSON.stringify(afterLock)}`)
    const reset = await serviceOffer(offer)
    expect(reset.pickup_otp_attempts === 0 && reset.pickup_otp_locked_until === null, 'success resets attempt state')
    record('5. 4-digit attempt bound: 5 failures lock 15 minutes, correct code refused while locked, reset on success', true)
  }

  // ---- 6. delivery requires prior pickup verification ---------------------
  {
    await actAsService()
    const ship = await createShipment('nopickup', customerA)
    const offer = await createOffer(ship, goodDriver, { status: 'delivery_arrived', delivery_arrived_at: new Date().toISOString() })
    await actAs(goodUser)
    await expectError(callProgress(offer, 'delivered', { delivery_otp: '2222' }), 'Pickup OTP must be verified before delivery completion')
    const row = await serviceOffer(offer)
    expect(row.status === 'delivery_arrived' && row.delivery_otp_attempts === 0, 'structural rejection must not count an attempt')
    record('6. delivery without verified pickup OTP rejected (no attempt burned)', true)
  }

  // ---- 7. wrong / missing delivery OTP ------------------------------------
  {
    await actAsService()
    const ship = await createShipment('wrongdelivery', customerA)
    const offer = await createOffer(ship, goodDriver, {
      status: 'delivery_arrived', pickup_otp_verified_at: new Date().toISOString(), delivery_arrived_at: new Date().toISOString(),
    })
    await actAs(goodUser)
    const wrong = await callProgress(offer, 'delivered', { delivery_otp: '9999' })
    expect(wrong.result_code === 'OTP_INCORRECT' && wrong.status === 'delivery_arrived', `wrong delivery OTP: ${JSON.stringify(wrong)}`)
    await expectError(callProgress(offer, 'delivered'), 'Delivery OTP is required before completing the trip')
    record('7. wrong delivery OTP counted; missing delivery OTP rejected', true)
  }

  // ---- 8. duplicate completion has exactly one business effect ------------
  {
    await actAsService()
    const user8 = await createUser('replay-driver')
    const driver8 = await createDriver('replay', user8)
    const ship = await createShipment('replay', customerA)
    const offer = await createOffer(ship, driver8, {
      status: 'delivery_arrived', pickup_otp_verified_at: new Date().toISOString(), delivery_arrived_at: new Date().toISOString(),
    })
    await actAs(user8)

    const first = await callProgress(offer, 'delivered', { delivery_otp: '2222' })
    expect(first.result_code === 'OK' && first.total_trips === 1, `first completion: ${JSON.stringify(first)}`)
    const firstRow = await serviceOffer(offer)

    await actAs(user8)
    const second = await callProgress(offer, 'delivered', { delivery_otp: '2222' })
    expect(second.result_code === 'OK', 'replay must return prior success (idempotent)')
    expect(second.total_trips === 1, `replay must not increment again, got ${second.total_trips}`)

    const secondRow = await serviceOffer(offer)
    expect(new Date(secondRow.delivered_at).getTime() === new Date(firstRow.delivered_at).getTime(),
      'replay must not rewrite delivered_at')
    const drv = await serviceDriver(driver8)
    expect(drv.total_trips === 1, `driver total_trips must stay 1, got ${drv.total_trips}`)
    record('8. duplicate completion returns prior success; counter/payout basis unchanged', true)
  }

  // ---- 9. sequential serialization of two completions ---------------------
  {
    await actAsService()
    const user9 = await createUser('serial-driver')
    const driver9 = await createDriver('serial', user9)
    const ship = await createShipment('concurrent', customerA)
    const offer = await createOffer(ship, driver9, {
      status: 'delivery_arrived', pickup_otp_verified_at: new Date().toISOString(), delivery_arrived_at: new Date().toISOString(),
    })
    await actAs(user9)
    const [a, b] = await Promise.all([
      callProgress(offer, 'delivered', { delivery_otp: '2222' }),
      callProgress(offer, 'delivered', { delivery_otp: '2222' }),
    ])
    expect(a.result_code === 'OK' && b.result_code === 'OK', 'both serialized calls return success')
    const drv = await serviceDriver(driver9)
    expect(drv.total_trips === 1, `one completion effect across serialized calls, got ${drv.total_trips}`)
    record('9. serialized duplicate completion (FOR UPDATE order): exactly one effect', true,
      'single-connection engine — true concurrent transactions not executable')
  }

  // ---- 10. unrelated p_extra input is ignored -----------------------------
  {
    await actAsService()
    const ship = await createShipment('extra', customerA)
    const offer = await createOffer(ship, goodDriver, { status: 'pickup_arrived', pickup_arrived_at: new Date().toISOString() })
    await actAs(goodUser)

    const res = await callProgress(offer, null, {
      total_trips: 999,
      status: 'delivered',
      driver_id: evilDriver,
      delivered_at: '2000-01-01T00:00:00.000Z',
      pickup_arrived_at: '2000-01-01T00:00:00.000Z',
      pickup_otp: '1111',
    })
    expect(res.result_code === 'OK' && res.status === 'pickup_arrived', `unrelated p_extra must be inert: ${JSON.stringify(res)}`)
    const row = await serviceOffer(offer)
    expect(row.delivered_at === null && new Date(row.pickup_arrived_at) > new Date('2020-01-01'),
      'client timestamps in p_extra must not be written')
    const drv = await serviceDriver(goodDriver)
    expect(drv.total_trips === 0, 'p_extra total_trips must not be applied')
    record('10. unrelated/forged p_extra keys ignored (no state, timestamp or counter effect)', true)
  }

  // ---- 11. server-authoritative delivered_at beats client input -----------
  {
    await actAsService()
    const ship = await createShipment('timestamp', customerA)
    const offer = await createOffer(ship, goodDriver, {
      status: 'delivery_arrived', pickup_otp_verified_at: new Date().toISOString(), delivery_arrived_at: new Date().toISOString(),
    })
    await actAs(goodUser)
    const res = await callProgress(offer, 'delivered', { delivery_otp: '2222', delivered_at: '2000-01-01T00:00:00.000Z' })
    expect(res.result_code === 'OK', 'delivery should succeed with a correct OTP')
    const row = await serviceOffer(offer)
    expect(new Date(row.delivered_at) > new Date('2026-01-01T00:00:00.000Z'),
      `delivered_at must be the server clock, got ${row.delivered_at}`)
    record('11. client-supplied timestamp cannot forge the trip chronology', true)
  }

  // ---- 12. other driver / unknown offer -----------------------------------
  {
    await actAsService()
    const ship = await createShipment('otherowner', customerA)
    const offer = await createOffer(ship, goodDriver)
    await actAs(evilUser)
    await expectError(callProgress(offer, 'pickup_arrived'), 'Job offer not found or access denied')
    await expectError(callProgress('00000000-0000-4000-8000-ffffffffffff', 'pickup_arrived'), 'Job offer not found or access denied')
    const row = await serviceOffer(offer)
    expect(row.status === 'accepted', 'unauthorized driver must not mutate the offer')
    record('12. own-vs-other driver ownership enforced; unknown offer rejected', true)
  }

  // ---- 13. terminal states cannot progress --------------------------------
  {
    await actAsService()
    const ship = await createShipment('cancelled', customerA)
    const cancelled = await createOffer(ship, goodDriver, { status: 'cancelled' })
    const pending = await createOffer(ship, evilDriver, { status: 'pending' })
    await actAs(goodUser)
    await expectError(callProgress(cancelled, 'pickup_arrived'), 'Trip is not active')
    await expectError(callProgress(cancelled, null, { photo_loading_url: 'https://x.supabase.co/storage/v1/object/public/trip-photos/a/b/c.jpg' }), 'Trip is not active')
    await actAs(evilUser)
    await expectError(callProgress(pending, 'pickup_arrived'), 'Trip is not active')
    record('13. documented cancellations / pending are terminal for driver progress', true)
  }

  // ---- 14. completed trips are immutable for photo-only calls -------------
  {
    await actAsService()
    const ship = await createShipment('postdelivery', customerA)
    const offer = await createOffer(ship, goodDriver, { status: 'delivered', delivered_at: new Date().toISOString(), pickup_otp_verified_at: new Date().toISOString() })
    await actAs(goodUser)
    await expectError(
      callProgress(offer, null, { photo_delivery_url: `https://x.supabase.co/storage/v1/object/public/trip-photos/${goodUser}/${offer}/x.jpg` }),
      'Trip is already completed'
    )
    record('14. photo-only mutation after delivery rejected', true)
  }

  // ---- 15. photo references are job-scoped --------------------------------
  {
    await actAsService()
    const ship = await createShipment('photos', customerA)
    const offer = await createOffer(ship, goodDriver, { status: 'pickup_arrived', pickup_arrived_at: new Date().toISOString() })
    const valid = `https://proj.supabase.co/storage/v1/object/public/trip-photos/${goodUser}/${offer}/photo_loading_url.jpg`
    await actAs(goodUser)

    await expectError(callProgress(offer, null, { photo_loading_url: 'https://evil.example.com/tracker.jpg' }), 'Invalid trip photo reference')
    await expectError(
      callProgress(offer, null, { photo_loading_url: `https://proj.supabase.co/storage/v1/object/public/trip-photos/${goodDriver}/${offer}/photo_loading_url.jpg` }),
      'Invalid trip photo reference'
    )
    const ok = await callProgress(offer, null, { photo_loading_url: valid })
    expect(ok.result_code === 'OK' && ok.photo_loading_url === valid, `valid job-scoped URL must be stored: ${JSON.stringify(ok)}`)
    record('15. arbitrary photo references rejected; own job-scoped storage URL accepted', true)
  }

  // ---- 16. direct OTP SELECT / UPDATE denied for authenticated (even owner) --
  {
    await actAsService()
    const ship = await createShipment('direct', customerA)
    const offer = await createOffer(ship, goodDriver)
    await actAs(goodUser)
    await expectError(db.query(`SELECT pickup_otp FROM public.job_offers WHERE id = $1`, [offer]), 'permission denied for table job_offers')
    await expectError(db.query(`SELECT delivery_otp FROM public.job_offers WHERE id = $1`, [offer]), 'permission denied for table job_offers')
    await expectError(db.query(`SELECT * FROM public.job_offers WHERE id = $1`, [offer]), 'permission denied for table job_offers')
    await expectError(
      db.query(`UPDATE public.job_offers SET status = 'delivered' WHERE id = $1`, [offer]),
      'permission denied for table job_offers'
    )
    await expectError(
      db.query(`UPDATE public.job_offers SET pickup_otp = '0000' WHERE id = $1`, [offer]),
      'permission denied for table job_offers'
    )
    const row = await serviceOffer(offer)
    expect(row.status === 'accepted', 'direct UPDATE must not have mutated the row')
    record('16. direct OTP SELECT/UPDATE (incl. full-row SELECT) denied for the owner driver', true)
  }

  // ---- 17. privilege composition + re-assertion ---------------------------
  {
    await actAsService()
    const tableSelect = (await db.query(`SELECT has_table_privilege('authenticated','public.job_offers','SELECT') AS v`)).rows[0].v
    const tableUpdate = (await db.query(`SELECT has_table_privilege('authenticated','public.job_offers','UPDATE') AS v`)).rows[0].v
    const otpCol = (await db.query(`SELECT has_column_privilege('authenticated','public.job_offers','pickup_otp','SELECT') AS v`)).rows[0].v
    const lockCol = (await db.query(`SELECT has_column_privilege('authenticated','public.job_offers','pickup_otp_locked_until','SELECT') AS v`)).rows[0].v
    const safeCol = (await db.query(`SELECT has_column_privilege('authenticated','public.job_offers','status','SELECT') AS v`)).rows[0].v
    expect(tableSelect === false && tableUpdate === false, 'table SELECT and UPDATE must be revoked for authenticated')
    expect(otpCol === false && lockCol === false, 'OTP and internal attempt columns must not be granted')
    expect(safeCol === true, 'non-OTP columns stay readable for the driver UI')

    // PostgreSQL semantics: a later broad table grant overrides column grants.
    // The migration therefore re-asserts REVOKE+column-GRANT; prove it heals
    // the exposure.
    await db.exec('GRANT SELECT ON public.job_offers TO authenticated')
    await actAs(goodUser)
    let exposed = false
    try {
      await db.query(`SELECT pickup_otp FROM public.job_offers LIMIT 1`)
      exposed = true
    } catch { /* denied */ }
    expect(exposed, 'a re-added broad table SELECT exposes the OTP column (raw PostgreSQL semantics)')
    await actAsService()
    await db.exec(`
      REVOKE SELECT ON public.job_offers FROM authenticated;
      GRANT SELECT (
        id, shipment_id, driver_id, offered_at, expires_at, responded_at, status,
        decline_reason, photo_loading_url, photo_delivery_url, pickup_arrived_at,
        journey_started_at, delivery_arrived_at, delivered_at,
        pickup_otp_verified_at, delivery_otp_verified_at
      ) ON public.job_offers TO authenticated;
    `)
    await actAs(goodUser)
    await expectError(db.query(`SELECT pickup_otp FROM public.job_offers LIMIT 1`), 'permission denied for table job_offers')
    record('17. table/column privilege composition and migration re-assertion proven', true)
  }

  // ---- 18. customer code visibility through the authorized RPC only -------
  {
    await actAsService()
    const shipA = await createShipment('custA', customerA)
    const offer = await createOffer(shipA, goodDriver)
    await actAs(customerA)
    const own = await callTracking(shipA)
    expect(own && own.pickup_otp === '1111' && own.delivery_otp === '2222',
      `shipment owner must receive both codes via the RPC: ${JSON.stringify(own)}`)

    await actAs(customerB)
    await expectError(callTracking(shipA), 'Access denied')

    await actAs(goodUser)
    await expectError(callTracking(shipA), 'Access denied')
    record('18. customer reads own shipment codes via RPC; other customer and assigned driver denied', true)
  }

  // ---- 19. anon cannot execute either RPC ---------------------------------
  {
    await actAsService()
    const ship = await createShipment('anon', customerA)
    const offer = await createOffer(ship, goodDriver)
    await actAsAnon()
    const msg = await expectError(callProgress(offer, 'pickup_arrived'))
    expect(/permission denied/i.test(msg), `anon progress call must be privilege-denied, got: ${msg}`)
    const msg2 = await expectError(callTracking(ship))
    expect(/permission denied/i.test(msg2), `anon tracking call must be privilege-denied, got: ${msg2}`)
    record('19. anon EXECUTE revoked on both trip RPCs', true)
  }

  // ---- 20. the OTP gate protects the journey start end-to-end -------------
  {
    await actAsService()
    const ship = await createShipment('gate', customerA)
    const offer = await createOffer(ship, goodDriver)
    await actAs(goodUser)
    await callProgress(offer, 'pickup_arrived')
    const wrong = await callProgress(offer, 'in_transit', { pickup_otp: '1234' })
    expect(wrong.result_code === 'OTP_INCORRECT' && wrong.status === 'pickup_arrived', 'wrong pickup code blocks journey start')
    const right = await callProgress(offer, 'in_transit', { pickup_otp: '1111' })
    expect(right.result_code === 'OK' && right.status === 'in_transit', 'correct pickup code starts the journey')
    record('20. pickup OTP gate blocks/permits journey start at the server', true)
  }

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} cases passed (SQL-level, PostgreSQL engine)`)
  console.log('NOTE: PostgREST/GoTrue round-trips, browser proof and true concurrent transactions were NOT executed here; see agent-results/020-result.md.')
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
