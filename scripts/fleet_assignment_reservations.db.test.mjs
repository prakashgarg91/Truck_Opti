#!/usr/bin/env node
/**
 * TO-143-D2 — fleet assignment and transactional reservations battery (red-first).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain (including 20261010000000_fleet_assignment_reservations.sql)
 * and drives the same surfaces the portal uses: real RLS and role switching
 * (`SET ROLE authenticated` + `request.jwt.claims`, what PostgREST does), real
 * triggers, real SECURITY DEFINER command RPCs, and the existing driver offer
 * RPC (respond_to_job_offer) for the reject / accept paths.
 *
 * Pinned contract:
 *   - public.fleet_assignment_reservations (agency-scoped; vehicle, driver
 *     employment, agency job and job offer references; active/released/consumed;
 *     window; version; idempotency key), RLS read-only for authenticated,
 *   - overlap guard: no two ACTIVE reservations may hold the same vehicle or the
 *     same driver for overlapping [start, end) windows, enforced in the database
 *     (row-lock + overlap check trigger; no btree_gist dependency),
 *   - reserve_fleet_assignment(...) jsonb: must pass BOTH D1 eligibility
 *     predicates at window start and end, honours maintenance/availability
 *     blocks, expected vehicle version, idempotency-key replay,
 *   - release_fleet_assignment(id, expected_version) jsonb,
 *   - automatic release: offer declined / expired / cancelled and agency job
 *     cancelled free the resources; offer delivered consumes the reservation;
 *     accept keeps it active (single-load behaviour unchanged),
 *   - release_stale_fleet_reservations(agency, as_of) for service_role expiry sweeps.
 *
 * Evidence class: local DB only (PGlite, single session). The overlap guard is
 * a row-lock + overlap check, and its concurrent-transaction behaviour is
 * reasoned from READ COMMITTED semantics, not raced (PGlite is one session).
 * Sequential double-reserve, direct-insert bypass and idempotent replay are
 * observed. Hosted PostgREST/GoTrue behaviour is NOT covered here.
 *
 * Usage:  node scripts/fleet_assignment_reservations.db.test.mjs
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is
 * a loud failure, never a silent skip.
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

/**
 * Per-case resilience: a failing assertion records FAIL and the battery keeps
 * running, so a red-first run reports EVERY unmet contract clause with its
 * exact reason instead of dying on the first one.
 */
async function testCase(name, fn) {
  try {
    await fn()
    record(name, true)
  } catch (error) {
    const message = error && error.message ? error.message.split('\n')[0].slice(0, 240) : String(error)
    record(name, false, message)
  }
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
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
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
    [id, email, JSON.stringify({})]
  )
  await db.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
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

/** Service-seeded truck row with explicit column control (for the eligibility matrix). */
async function createTruckRow(agencyId, rcNumber, columns = {}) {
  const id = uid()
  const sets = { is_available: true, ...columns }
  const keys = ['id', 'agency_id', 'vehicle_type', 'rc_number']
  const params = [id, agencyId, 'eicher_14ft', rcNumber]
  for (const [k, v] of Object.entries(sets)) {
    keys.push(k)
    params.push(v)
  }
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(
    `INSERT INTO public.agency_trucks (${keys.join(', ')}) VALUES (${placeholders})`,
    params
  )
  return id
}

async function createEmploymentRow(agencyId, driverId, columns = {}) {
  const id = uid()
  const keys = ['id', 'agency_id', 'driver_id']
  const params = [id, agencyId, driverId]
  for (const [k, v] of Object.entries(columns)) {
    keys.push(k)
    params.push(v)
  }
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(
    `INSERT INTO public.agency_driver_employment (${keys.join(', ')}) VALUES (${placeholders})`,
    params
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
// Dispatch-shaped fixtures (same shapes as dispatch_delivery_journey.db.test.mjs)
// ---------------------------------------------------------------------------
const FLEET_FOUNDATION = '20261008000000_agency_fleet_foundation.sql'
const RESERVATION_MIGRATION = '20261010000000_fleet_assignment_reservations.sql'

const T0 = Date.now()
const at = (hours) => new Date(T0 + 24 * 3600e3 + hours * 3600e3).toISOString()
const W1 = [at(0), at(4)]
const OVERLAP_W1 = [at(2), at(6)]
const W2_ADJACENT = [at(4), at(8)]
const W3 = [at(12), at(16)]

let customerUserId
let customerId
let agencyUserA
let agencyUserB
let agencyUserS
let agencyA
let agencyB
let agencyS

async function one(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows[0]
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

async function createShipment(custId, ownerUserId, tag) {
  const id = uid()
  const reference = `TO143D2-${tag}-${Date.now()}-${seq}`
  await db.query(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [id, reference, custId, ownerUserId]
  )
  return { id }
}

/** Approved (or otherwise) driver with an ACTIVE employment record at agency A. */
async function freshDriver(tag, { status = 'approved', licenceExpiry = '2030-01-01' } = {}) {
  const userId = await createUser(`${tag}-drv`)
  const driverId = await createDriver(userId, tag, status)
  const employmentId = await createEmploymentRow(agencyA, driverId, {
    licence_number: `DL-${tag}-${seq}`,
    licence_class: 'HGV',
    licence_expiry: licenceExpiry,
    status: 'active',
  })
  return { userId, driverId, employmentId }
}

/** Agency-A vehicle with current document dates unless overridden. */
async function freshVehicle(tag, columns = {}) {
  return createTruckRow(agencyA, `RC-${tag}-${seq}`, {
    insurance_expiry: '2030-01-01',
    fitness_expiry: '2030-01-01',
    permit_expiry: '2030-01-01',
    puc_expiry: '2030-01-01',
    ...columns,
  })
}

/** Agency job + pending dispatch offer for a driver (offer expires in 48h unless overridden). */
async function newJob(driverId, { jobStatus = 'pending', offerStatus = 'pending', offerExpires = "now() + interval '48 hours'" } = {}) {
  const shipment = await createShipment(customerId, customerUserId, `D2-${++seq}`)
  const jobId = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, $4)`,
    [jobId, agencyA, shipment.id, jobStatus]
  )
  const offerId = uid()
  await db.query(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), ${offerExpires}, $4, '4321', '8765')`,
    [offerId, shipment.id, driverId, offerStatus]
  )
  return { jobId, offerId, shipmentId: shipment.id }
}

async function setup() {
  customerUserId = await createUser('d2-customer')
  customerId = await createCustomer(customerUserId, 'D2Cust')
  agencyUserA = await createUser('d2-agency-a')
  agencyA = await createAgencyRow(agencyUserA, 'D2 Agency A', 'approved')
  agencyUserB = await createUser('d2-agency-b')
  agencyB = await createAgencyRow(agencyUserB, 'D2 Agency B', 'approved')
  agencyUserS = await createUser('d2-agency-s')
  agencyS = await createAgencyRow(agencyUserS, 'D2 Agency S', 'suspended')
}

// ---------------------------------------------------------------------------
// Command wrappers (authenticated role + JWT claims, exactly as PostgREST)
// ---------------------------------------------------------------------------
async function reserveAs(userId, a) {
  await actAs(userId)
  try {
    const result = await db.query(
      `SELECT public.reserve_fleet_assignment($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::integer, $8::text) AS r`,
      [a.jobId, a.offerId, a.vehicleId, a.employmentId, a.start, a.end, a.expectedVersion, a.key]
    )
    return parseJson(result.rows[0].r)
  } finally {
    await actAsService()
  }
}

async function releaseAs(userId, reservationId, expectedVersion) {
  await actAs(userId)
  try {
    const result = await db.query(
      `SELECT public.release_fleet_assignment($1::uuid, $2::integer) AS r`,
      [reservationId, expectedVersion]
    )
    return parseJson(result.rows[0].r)
  } finally {
    await actAsService()
  }
}

/** Default reservation args for a fresh vehicle/driver/job triple. */
function argsFor(d, v, j, window = W1) {
  return {
    jobId: j.jobId,
    offerId: j.offerId,
    vehicleId: v,
    employmentId: d.employmentId,
    start: window[0],
    end: window[1],
    expectedVersion: 1,
    key: `k-${++seq}-${Date.now()}`,
  }
}

async function reserveOk(d, v, j, window = W1) {
  const r = await reserveAs(agencyUserA, argsFor(d, v, j, window))
  expect(r && r.ok === true && r.state === 'created', `expected reserve ok/created, got ${JSON.stringify(r)}`)
  return r.reservation
}

async function reservationsForJob(jobId) {
  return (await one(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_job_id = $1`, [jobId])).n
}

async function reservationStatus(id) {
  return (await one(`SELECT status, released_reason, version FROM public.fleet_assignment_reservations WHERE id = $1`, [id]))
}

/** Active reservation rows for an agency job (the reservation table is the allocation authority). */
async function activeReservationsFor(jobId) {
  return rows(
    `SELECT id, vehicle_id, driver_id FROM public.fleet_assignment_reservations WHERE agency_job_id = $1 AND status = 'active'`,
    [jobId]
  )
}

async function vehicleVersion(vehicleId) {
  return (await one(`SELECT version FROM public.agency_trucks WHERE id = $1`, [vehicleId])).version
}

/** Typed denial: ok:false with the exact error code, and no write for that job. */
async function expectDenied(userId, a, errorCode) {
  const before = await reservationsForJob(a.jobId)
  const r = await reserveAs(userId, a)
  expect(r && r.ok === false && r.error === errorCode, `expected {ok:false,error:"${errorCode}"}, got ${JSON.stringify(r)}`)
  const after = await reservationsForJob(a.jobId)
  expect(after === before, `a denied reservation must not write a row (rows ${before} -> ${after})`)
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  const last = applied[applied.length - 1]

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  await setup()

  // =========================================================================
  // A. Chain, schema, grants, function hygiene, trigger inventory
  // =========================================================================
  await testCase('A1. migration chain replays with the reservation migration after fleet foundation', async () => {
    expect(applied.includes(FLEET_FOUNDATION), 'fleet-foundation migration missing from chain')
    expect(applied.includes(RESERVATION_MIGRATION), `reservation migration missing from chain (last=${last})`)
    expect(
      applied.indexOf(FLEET_FOUNDATION) < applied.indexOf(RESERVATION_MIGRATION),
      'reservation migration must sort after the fleet foundation'
    )
  })

  await testCase('A2. reservations table: RLS on, window + per-agency idempotency + one active reservation per job', async () => {
    const rls = await one(`SELECT relrowsecurity AS on FROM pg_class WHERE oid = 'public.fleet_assignment_reservations'::regclass`)
    expect(rls && rls.on === true, 'RLS is not enabled on fleet_assignment_reservations')
    const defs = (await rows(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'public.fleet_assignment_reservations'::regclass`
    )).map((r) => r.d)
    expect(defs.some((d) => d.includes('window_end > window_start')), `no window check constraint, found ${JSON.stringify(defs)}`)
    expect(defs.some((d) => d.includes('UNIQUE (agency_id, idempotency_key)')), `no per-agency idempotency unique, found ${JSON.stringify(defs)}`)
    const idx = (await rows(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'fleet_assignment_reservations'`)).map((r) => r.indexdef)
    expect(idx.some((d) => d.includes('UNIQUE') && d.includes('agency_job_id') && d.includes("status = 'active'")),
      `no partial unique one-active-per-job index, found ${JSON.stringify(idx)}`)
  })

  await testCase('A3. authenticated may SELECT reservations but has no direct INSERT/UPDATE/DELETE; anon has nothing', async () => {
    const p = await one(`SELECT
      has_table_privilege('authenticated', 'public.fleet_assignment_reservations', 'SELECT') AS s,
      has_table_privilege('authenticated', 'public.fleet_assignment_reservations', 'INSERT') AS i,
      has_table_privilege('authenticated', 'public.fleet_assignment_reservations', 'UPDATE') AS u,
      has_table_privilege('authenticated', 'public.fleet_assignment_reservations', 'DELETE') AS d,
      has_table_privilege('anon', 'public.fleet_assignment_reservations', 'SELECT') AS anon_s`)
    expect(p.s === true, 'authenticated lacks SELECT on reservations')
    expect(p.i === false && p.u === false && p.d === false, `authenticated has direct write privilege: ${JSON.stringify(p)}`)
    expect(p.anon_s === false, 'anon can SELECT reservations')
  })

  await testCase('A4. command RPCs are SECURITY DEFINER with pinned search_path; sweep is service_role only', async () => {
    const fns = await rows(`
      SELECT p.proname, p.prosecdef, p.proconfig,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
             has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('reserve_fleet_assignment', 'release_fleet_assignment', 'release_stale_fleet_reservations')`)
    expect(fns.length === 3, `expected 3 reservation functions, found ${fns.length}`)
    for (const f of fns) {
      expect(f.prosecdef === true, `${f.proname} is not SECURITY DEFINER`)
      expect(Array.isArray(f.proconfig) && f.proconfig.includes('search_path=public'), `${f.proname} search_path is not pinned`)
      expect(f.anon_exec === false, `${f.proname} is executable by anon`)
    }
    const reserve = fns.find((f) => f.proname === 'reserve_fleet_assignment')
    const release = fns.find((f) => f.proname === 'release_fleet_assignment')
    const sweep = fns.find((f) => f.proname === 'release_stale_fleet_reservations')
    expect(reserve.auth_exec === true && release.auth_exec === true, 'reserve/release not executable by authenticated')
    expect(sweep.auth_exec === false && sweep.svc_exec === true, 'expiry sweep must be service_role only')
  })

  await testCase('A5. automatic-release, overlap-guard and version triggers are installed', async () => {
    const trg = await rows(`SELECT tgname, tgrelid::regclass::text AS rel FROM pg_trigger WHERE NOT tgisinternal`)
    const has = (name, rel) => trg.some((t) => t.tgname === name && t.rel.endsWith(rel))
    expect(has('trg_fleet_offer_reservation_release', 'job_offers'), 'offer status release trigger missing on job_offers')
    expect(has('trg_fleet_job_reservation_release', 'agency_jobs'), 'job cancel release trigger missing on agency_jobs')
    expect(has('trg_fleet_reservations_overlap_guard', 'fleet_assignment_reservations'), 'overlap guard trigger missing')
    expect(has('trg_fleet_reservations_version', 'fleet_assignment_reservations'), 'version trigger missing')
  })

  // =========================================================================
  // B. Eligible reservation
  // =========================================================================
  await testCase('B1. eligible vehicle + driver reserve succeeds and assigns the agency job', async () => {
    const d = await freshDriver('b1')
    const v = await freshVehicle('b1')
    const j = await newJob(d.driverId)
    const r = await reserveAs(agencyUserA, argsFor(d, v, j))
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    expect(r.reservation.status === 'active', `expected active, got ${r.reservation.status}`)
    const active = await activeReservationsFor(j.jobId)
    expect(active.length === 1 && active[0].vehicle_id === v && active[0].driver_id === d.driverId,
      `job does not hold the assignment: ${JSON.stringify(active)}`)
  })

  await testCase('B2. reservation is stamped with the caller agency (never a browser-supplied id)', async () => {
    const d = await freshDriver('b2')
    const v = await freshVehicle('b2')
    const j = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j)
    expect(reservation.agency_id === agencyA, `reservation agency ${reservation.agency_id} != caller agency ${agencyA}`)
  })

  // =========================================================================
  // C. Ineligible / blocked / stale work is denied with typed errors, no write
  // =========================================================================
  await testCase('C1. vehicle with an expired insurance date is denied (vehicle_not_eligible)', async () => {
    const d = await freshDriver('c1')
    const v = await freshVehicle('c1', { insurance_expiry: '2020-01-01' })
    const j = await newJob(d.driverId)
    await expectDenied(agencyUserA, argsFor(d, v, j), 'vehicle_not_eligible')
  })

  await testCase('C2. vehicle under a maintenance block flag is denied (vehicle_not_eligible)', async () => {
    const d = await freshDriver('c2')
    const v = await freshVehicle('c2', { maintenance_blocked: true, maintenance_block_reason: 'brake service' })
    const j = await newJob(d.driverId)
    await expectDenied(agencyUserA, argsFor(d, v, j), 'vehicle_not_eligible')
  })

  await testCase('C3. vehicle blocked until a time inside the window is denied (vehicle_not_eligible)', async () => {
    const d = await freshDriver('c3')
    const v = await freshVehicle('c3', { maintenance_blocked_until: at(1) })
    const j = await newJob(d.driverId)
    await expectDenied(agencyUserA, argsFor(d, v, j), 'vehicle_not_eligible')
  })

  await testCase('C4. vehicle marked unavailable is denied (vehicle_not_eligible)', async () => {
    const d = await freshDriver('c4')
    const v = await freshVehicle('c4', { is_available: false })
    const j = await newJob(d.driverId)
    await expectDenied(agencyUserA, argsFor(d, v, j), 'vehicle_not_eligible')
  })

  await testCase('C5. driver with an expired licence is denied (driver_not_eligible)', async () => {
    const d = await freshDriver('c5', { licenceExpiry: '2020-01-01' })
    const v = await freshVehicle('c5')
    const j = await newJob(d.driverId)
    await expectDenied(agencyUserA, argsFor(d, v, j), 'driver_not_eligible')
  })

  await testCase('C6. driver not approved for assignment is denied (driver_not_eligible)', async () => {
    const d = await freshDriver('c6', { status: 'pending' })
    const v = await freshVehicle('c6')
    const j = await newJob(d.driverId)
    await expectDenied(agencyUserA, argsFor(d, v, j), 'driver_not_eligible')
  })

  await testCase('C7. a declined offer cannot be reserved (offer_not_active)', async () => {
    const d = await freshDriver('c7')
    const v = await freshVehicle('c7')
    const j = await newJob(d.driverId, { offerStatus: 'declined' })
    await expectDenied(agencyUserA, argsFor(d, v, j), 'offer_not_active')
  })

  await testCase('C8. a pending offer that has already expired cannot be reserved (offer_not_active)', async () => {
    const d = await freshDriver('c8')
    const v = await freshVehicle('c8')
    const j = await newJob(d.driverId, { offerExpires: "now() - interval '1 minute'" })
    await expectDenied(agencyUserA, argsFor(d, v, j), 'offer_not_active')
  })

  await testCase('C9. a cancelled agency job cannot be reserved (agency_job_not_open)', async () => {
    const d = await freshDriver('c9')
    const v = await freshVehicle('c9')
    const j = await newJob(d.driverId, { jobStatus: 'cancelled' })
    await expectDenied(agencyUserA, argsFor(d, v, j), 'agency_job_not_open')
  })

  await testCase('C10. a window that does not end after it starts is rejected before any write', async () => {
    const d = await freshDriver('c10')
    const v = await freshVehicle('c10')
    const j = await newJob(d.driverId)
    await expectError(
      reserveAs(agencyUserA, { ...argsFor(d, v, j), start: W1[1], end: W1[0] }),
      'Reservation window must end after it starts.'
    )
  })

  // =========================================================================
  // D. Concurrency / overlap: a vehicle or driver cannot be double-held
  // =========================================================================
  await testCase('D1. same vehicle, overlapping window, different driver is rejected (vehicle_reserved)', async () => {
    const v = await freshVehicle('d1')
    const dX = await freshDriver('d1x')
    const dY = await freshDriver('d1y')
    const jX = await newJob(dX.driverId)
    const jY = await newJob(dY.driverId)
    await reserveOk(dX, v, jX, W1)
    await expectDenied(agencyUserA, argsFor(dY, v, jY, OVERLAP_W1), 'vehicle_reserved')
  })

  await testCase('D2. same driver, overlapping window, different vehicle is rejected (driver_reserved)', async () => {
    const d = await freshDriver('d2')
    const v1 = await freshVehicle('d2a')
    const v2 = await freshVehicle('d2b')
    const j1 = await newJob(d.driverId)
    const j2 = await newJob(d.driverId)
    await reserveOk(d, v1, j1, W1)
    await expectDenied(agencyUserA, argsFor(d, v2, j2, OVERLAP_W1), 'driver_reserved')
  })

  await testCase('D3. adjacent windows (end == next start) on the same vehicle both succeed', async () => {
    const v = await freshVehicle('d3')
    const dX = await freshDriver('d3x')
    const dY = await freshDriver('d3y')
    const jX = await newJob(dX.driverId)
    const jY = await newJob(dY.driverId)
    await reserveOk(dX, v, jX, W1)
    await reserveOk(dY, v, jY, W2_ADJACENT)
  })

  await testCase('D4. direct INSERT bypassing the RPC is still blocked by the overlap guard (vehicle and driver)', async () => {
    const v = await freshVehicle('d4')
    const dX = await freshDriver('d4x')
    const dY = await freshDriver('d4y')
    const jX = await newJob(dX.driverId)
    const jY = await newJob(dY.driverId)
    await reserveOk(dX, v, jX, W1)
    const insert = (job, d, vehicle, window) => db.query(
      `INSERT INTO public.fleet_assignment_reservations
         (agency_id, agency_job_id, job_offer_id, vehicle_id, driver_employment_id, driver_id,
          window_start, window_end, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9)`,
      [agencyA, job.jobId, job.offerId, vehicle, d.employmentId, d.driverId, window[0], window[1], `direct-${++seq}`]
    )
    await expectError(insert(jY, dY, v, OVERLAP_W1), 'Vehicle reservation overlaps an active reservation')
    const dv = await freshVehicle('d4z')
    await expectError(insert(jY, dX, dv, OVERLAP_W1), 'Driver reservation overlaps an active reservation')
  })

  await testCase('D5. a job holds at most one active assignment (agency_job_already_assigned)', async () => {
    const d = await freshDriver('d5')
    const v1 = await freshVehicle('d5a')
    const v2 = await freshVehicle('d5b')
    const j = await newJob(d.driverId)
    await reserveOk(d, v1, j, W1)
    await expectDenied(agencyUserA, argsFor(d, v2, j, W3), 'agency_job_already_assigned')
  })

  // =========================================================================
  // E. Authority: foreign agency, suspended agency, anon, direct writes
  // =========================================================================
  await testCase('E1. foreign agency caller cannot reserve against another agency job', async () => {
    const d = await freshDriver('e1')
    const v = await freshVehicle('e1')
    const j = await newJob(d.driverId)
    await expectError(reserveAs(agencyUserB, argsFor(d, v, j)), 'Agency job not found or access denied')
  })

  await testCase('E2. foreign agency cannot read another agency reservation (RLS)', async () => {
    const d = await freshDriver('e2')
    const v = await freshVehicle('e2')
    const j = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j)
    await actAs(agencyUserB)
    try {
      const seen = await rows(`SELECT id FROM public.fleet_assignment_reservations WHERE id = $1`, [reservation.id])
      expect(seen.length === 0, `foreign agency saw ${seen.length} row(s)`)
    } finally {
      await actAsService()
    }
  })

  await testCase('E3. foreign agency cannot release another agency reservation', async () => {
    const d = await freshDriver('e3')
    const v = await freshVehicle('e3')
    const j = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j)
    await expectError(releaseAs(agencyUserB, reservation.id, reservation.version), 'Reservation not found or access denied')
  })

  await testCase('E4. a vehicle owned by another agency cannot be assigned (Vehicle not found or access denied)', async () => {
    const d = await freshDriver('e4')
    const j = await newJob(d.driverId)
    const foreignVehicle = await createTruckRow(agencyB, `RC-foreign-${seq}`, {
      insurance_expiry: '2030-01-01', fitness_expiry: '2030-01-01', permit_expiry: '2030-01-01', puc_expiry: '2030-01-01',
    })
    await expectError(reserveAs(agencyUserA, argsFor(d, foreignVehicle, j)), 'Vehicle not found or access denied')
  })

  await testCase('E5. suspended agency is denied (Agency approval is required.)', async () => {
    const d = await freshDriver('e5')
    const v = await freshVehicle('e5')
    const j = await newJob(d.driverId)
    await expectError(reserveAs(agencyUserS, argsFor(d, v, j)), 'Agency approval is required.')
  })

  await testCase('E6. anon cannot execute the reserve command', async () => {
    await actAsAnon()
    try {
      await expectError(
        db.query(`SELECT public.reserve_fleet_assignment(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), now(), now() + interval '1 hour', 1, 'anon')`),
        'permission denied'
      )
    } finally {
      await actAsService()
    }
  })

  await testCase('E7. authenticated cannot INSERT reservations directly (permission denied)', async () => {
    const d = await freshDriver('e7')
    const v = await freshVehicle('e7')
    const j = await newJob(d.driverId)
    await actAs(agencyUserA)
    try {
      await expectError(
        db.query(
          `INSERT INTO public.fleet_assignment_reservations
             (agency_id, agency_job_id, job_offer_id, vehicle_id, driver_employment_id, driver_id, window_start, window_end, status, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', 'direct-e7')`,
          [agencyA, j.jobId, j.offerId, v, d.employmentId, d.driverId, W1[0], W1[1]]
        ),
        'permission denied'
      )
    } finally {
      await actAsService()
    }
  })

  await testCase('E8. authenticated cannot run the service-role expiry sweep', async () => {
    await actAs(agencyUserA)
    try {
      await expectError(db.query(`SELECT public.release_stale_fleet_reservations(NULL, now())`), 'permission denied')
    } finally {
      await actAsService()
    }
  })

  // =========================================================================
  // F. Idempotent replay and expected-version (stale vehicle state)
  // =========================================================================
  await testCase('F1. same idempotency key and same request replays the same reservation (no second row)', async () => {
    const d = await freshDriver('f1')
    const v = await freshVehicle('f1')
    const j = await newJob(d.driverId)
    const a = argsFor(d, v, j)
    const first = await reserveAs(agencyUserA, a)
    expect(first.ok === true && first.state === 'created', `first call not created: ${JSON.stringify(first)}`)
    const replay = await reserveAs(agencyUserA, a)
    expect(replay.ok === true && replay.state === 'idempotent_replay', `replay state: ${JSON.stringify(replay)}`)
    expect(replay.reservation.id === first.reservation.id, 'replay returned a different reservation')
    const n = (await one(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_id = $1 AND idempotency_key = $2`, [agencyA, a.key])).n
    expect(n === 1, `expected one row for the key, found ${n}`)
  })

  await testCase('F2. reusing an idempotency key for a different request is rejected (idempotency_key_reused)', async () => {
    const d = await freshDriver('f2')
    const v1 = await freshVehicle('f2a')
    const v2 = await freshVehicle('f2b')
    const j = await newJob(d.driverId)
    const a = argsFor(d, v1, j)
    const first = await reserveAs(agencyUserA, a)
    expect(first.ok === true && first.state === 'created', `setup: first reserve ${JSON.stringify(first)}`)
    const r = await reserveAs(agencyUserA, { ...a, vehicleId: v2 })
    expect(r.ok === false && r.error === 'idempotency_key_reused', `got ${JSON.stringify(r)}`)
  })

  await testCase('F3. stale expected vehicle version returns version_conflict; the fresh version then succeeds', async () => {
    const d = await freshDriver('f3')
    const v = await freshVehicle('f3')
    const j = await newJob(d.driverId)
    const stale = await vehicleVersion(v)
    await actAs(agencyUserA)
    try {
      const edit = await db.query(`SELECT public.agency_vehicle_update($1::uuid, $2::integer, $3::jsonb) AS r`, [v, stale, JSON.stringify({ notes: 'edited elsewhere' })])
      expect(parseJson(edit.rows[0].r).ok === true, 'setup: agency_vehicle_update did not bump the version')
    } finally {
      await actAsService()
    }
    const conflict = await reserveAs(agencyUserA, { ...argsFor(d, v, j), expectedVersion: stale })
    expect(conflict.ok === false && conflict.error === 'version_conflict', `expected version_conflict, got ${JSON.stringify(conflict)}`)
    expect(conflict.current_version === stale + 1, `current_version ${conflict.current_version} != ${stale + 1}`)
    expect((await reservationsForJob(j.jobId)) === 0, 'a conflicting reserve must not write')
    const fresh = await reserveAs(agencyUserA, { ...argsFor(d, v, j), expectedVersion: stale + 1 })
    expect(fresh.ok === true && fresh.state === 'created', `fresh version did not succeed: ${JSON.stringify(fresh)}`)
  })

  // =========================================================================
  // G. Release and automatic release (frees resources) + accept/consume paths
  // =========================================================================
  await testCase('G1. manual release frees the vehicle and driver; a new reservation then succeeds', async () => {
    const d = await freshDriver('g1')
    const v = await freshVehicle('g1')
    const j1 = await newJob(d.driverId)
    const j2 = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j1)
    const released = await releaseAs(agencyUserA, reservation.id, reservation.version)
    expect(released.ok === true && released.state === 'released', `release: ${JSON.stringify(released)}`)
    expect(released.version === reservation.version + 1, `release version ${released.version}`)
    const stillHeld = await activeReservationsFor(j1.jobId)
    expect(stillHeld.length === 0, `released job still holds an active reservation: ${JSON.stringify(stillHeld)}`)
    await reserveOk(d, v, j2)
  })

  await testCase('G2. releasing again with the post-release version replays already_released (no second write)', async () => {
    const d = await freshDriver('g2')
    const v = await freshVehicle('g2')
    const j = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j)
    const first = await releaseAs(agencyUserA, reservation.id, reservation.version)
    const replay = await releaseAs(agencyUserA, reservation.id, first.version)
    expect(replay.ok === true && replay.state === 'already_released', `replay: ${JSON.stringify(replay)}`)
    expect(replay.version === first.version, 'replay must not bump the version')
  })

  await testCase('G3. releasing with a stale version returns version_conflict and leaves the row unchanged', async () => {
    const d = await freshDriver('g3')
    const v = await freshVehicle('g3')
    const j = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j)
    const r = await releaseAs(agencyUserA, reservation.id, 99)
    expect(r.ok === false && r.error === 'version_conflict' && r.current_version === 1, `got ${JSON.stringify(r)}`)
    expect((await reservationStatus(reservation.id)).status === 'active', 'a conflicting release changed the row')
  })

  await testCase('G4. driver rejects the offer: reservation auto-releases (offer_declined) and the vehicle is free again', async () => {
    const d = await freshDriver('g4')
    const v = await freshVehicle('g4')
    const j1 = await newJob(d.driverId)
    const j2 = await newJob(d.driverId)
    await reserveOk(d, v, j1)
    await actAs(d.userId)
    try {
      const resp = await rows(`SELECT * FROM public.respond_to_job_offer($1, false, 'no truck free')`, [j1.offerId])
      expect(resp[0].offer_status === 'declined', `offer not declined: ${JSON.stringify(resp)}`)
    } finally {
      await actAsService()
    }
    const row = await one(`SELECT status, released_reason FROM public.fleet_assignment_reservations WHERE agency_job_id = $1`, [j1.jobId])
    expect(row.status === 'released' && row.released_reason === 'offer_declined', `reservation: ${JSON.stringify(row)}`)
    await reserveOk(d, v, j2)
  })

  await testCase('G5. offer expires: service-role sweep releases the reservation (offer_expired) and frees resources', async () => {
    const d = await freshDriver('g5')
    const v = await freshVehicle('g5')
    const j1 = await newJob(d.driverId, { offerExpires: "now() + interval '1 hour'" })
    const j2 = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j1)
    await actAsService()
    const swept = await one(`SELECT public.release_stale_fleet_reservations($1::uuid, $2::timestamptz) AS n`, [agencyA, new Date(Date.now() + 2 * 3600e3).toISOString()])
    expect(Number(swept.n) >= 1, `sweep expired ${swept.n} offers, expected >= 1`)
    const offer = await one(`SELECT status FROM public.job_offers WHERE id = $1`, [j1.offerId])
    expect(offer.status === 'expired', `offer status ${offer.status}`)
    const status = await reservationStatus(reservation.id)
    expect(status.status === 'released' && status.released_reason === 'offer_expired', `reservation: ${JSON.stringify(status)}`)
    await reserveOk(d, v, j2)
  })

  await testCase('G6. agency job cancelled: reservation auto-releases (agency_job_cancelled)', async () => {
    const d = await freshDriver('g6')
    const v = await freshVehicle('g6')
    const j1 = await newJob(d.driverId)
    const j2 = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j1)
    await db.query(`UPDATE public.agency_jobs SET status = 'cancelled' WHERE id = $1`, [j1.jobId])
    const status = await reservationStatus(reservation.id)
    expect(status.status === 'released' && status.released_reason === 'agency_job_cancelled', `reservation: ${JSON.stringify(status)}`)
    await reserveOk(d, v, j2)
  })

  await testCase('G7. offer cancelled: reservation auto-releases (offer_cancelled)', async () => {
    const d = await freshDriver('g7')
    const v = await freshVehicle('g7')
    const j1 = await newJob(d.driverId)
    const j2 = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j1)
    await db.query(`UPDATE public.job_offers SET status = 'cancelled' WHERE id = $1`, [j1.offerId])
    const status = await reservationStatus(reservation.id)
    expect(status.status === 'released' && status.released_reason === 'offer_cancelled', `reservation: ${JSON.stringify(status)}`)
    await reserveOk(d, v, j2)
  })

  await testCase('G8. driver accepts: reservation stays active and the single-load accept still succeeds', async () => {
    const d = await freshDriver('g8')
    const v = await freshVehicle('g8')
    const j = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j)
    await actAs(d.userId)
    try {
      const resp = await rows(`SELECT * FROM public.respond_to_job_offer($1, true)`, [j.offerId])
      expect(resp[0].offer_status === 'accepted', `accept: ${JSON.stringify(resp)}`)
    } finally {
      await actAsService()
    }
    const status = await reservationStatus(reservation.id)
    expect(status.status === 'active', `accept released the reservation: ${JSON.stringify(status)}`)
  })

  await testCase('G9. offer delivered: reservation is consumed (not released) and the assignment is kept', async () => {
    const d = await freshDriver('g9')
    const v = await freshVehicle('g9')
    const j = await newJob(d.driverId)
    const reservation = await reserveOk(d, v, j)
    await db.query(`UPDATE public.job_offers SET status = 'delivered' WHERE id = $1`, [j.offerId])
    const status = await reservationStatus(reservation.id)
    expect(status.status === 'consumed', `reservation: ${JSON.stringify(status)}`)
    const kept = await one(`SELECT vehicle_id FROM public.fleet_assignment_reservations WHERE id = $1`, [reservation.id])
    expect(kept.vehicle_id === v, 'consumed reservation lost its vehicle')
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} cases passed; ${findings.length} findings`)
  return passed === results.length
}

let ok = false
try {
  ok = await main()
} catch (error) {
  console.error('FAIL: harness error:', error && error.message ? error.message : error)
  ok = false
}
process.exit(ok ? 0 : 1)
