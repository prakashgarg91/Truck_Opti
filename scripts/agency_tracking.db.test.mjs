#!/usr/bin/env node
/**
 * Agency trip tracking and incidents (TO-147) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the RPCs the way PostgREST does
 * per request: `SET ROLE authenticated` with `request.jwt.claims` set to the
 * caller's sub.
 *
 * Pinned contract under test. The migration that implements it is NOT written
 * yet (it will be supabase/migrations/20261020000000_agency_tracking.sql, created
 * by another writer), so every case that needs the new tables or RPCs is
 * EXPECTED to fail now.
 *
 *   Tables (RLS on, no direct write privileges for authenticated):
 *     agency_tracking_pings(id, agency_id, job_id -> agency_jobs, driver_id, recorded_at timestamptz,
 *       lat numeric(9,6), lng numeric(9,6), speed_kmph numeric, created_at)
 *       UNIQUE (job_id, recorded_at)
 *     agency_incidents(id, agency_id, job_id, kind 'long_halt'|'overspeed'|'route_deviation'|'breakdown'|
 *       'accident'|'other', status 'open'|'acknowledged'|'resolved', dedupe_key text, details jsonb,
 *       version int default 1, resolution_note text, created_at)
 *       UNIQUE (agency_id, dedupe_key)
 *
 *   RLS reads: any active agency scope reads its agency's pings and incidents. The assigned driver
 *   reads his own pings. Other agency, suspended agency, no-agency users and anon read 0 rows.
 *
 *   public.tracking_ping_record(p_job_id uuid, p_lat numeric, p_lng numeric, p_speed_kmph numeric,
 *     p_recorded_at timestamptz) RETURNS jsonb
 *     - SECURITY DEFINER, pinned search_path, NO agency argument. Caller must be a driver with ACTIVE
 *       agency_driver_employment and assigned (agency_jobs.driver_id) to that job.
 *     - Refusals: 'not_assigned' (driver not assigned), 'not_found' (another agency's job),
 *       'job_not_active' (terminal job), 'invalid_coordinates' (lat -90..90, lng -180..180),
 *       'invalid_speed' (0..250), 'future_timestamp' (more than 5 minutes ahead),
 *       'too_old' (older than 24h), 'rate_limited' (more than 120 pings per job per hour).
 *     - Duplicate (job, recorded_at): {ok:true, replay:true}, still one row.
 *   public.agency_incident_open(p_job_id uuid, p_kind text, p_details jsonb, p_dedupe_key text) RETURNS jsonb
 *     - Scope 'dispatcher' or 'fleet_manager' (owner always allowed). Finance and viewer refused with
 *       'forbidden_scope' (or the scope message). Invalid kind 'invalid_kind'. Details JSON larger than
 *       4000 characters 'details_too_large'. Duplicate dedupe_key returns {ok:true, replay:true,
 *       incident_id} with the same id.
 *   public.agency_incident_update(p_incident_id uuid, p_to_status text, p_expected_version int,
 *     p_note text) RETURNS jsonb
 *     - open -> acknowledged -> resolved, open -> resolved. Resolved is terminal ('illegal_transition').
 *       Resolution needs a note of 3..500 characters ('note_required'). Stale version 'version_conflict'.
 *   public.agency_trip_live(p_job_id uuid) RETURNS jsonb
 *     - Read for any active agency scope: {ok:true, last_ping, ping_count, open_incidents}.
 *       Other agency 'not_found'.
 *
 *   EXECUTE for authenticated and service_role only. Scope and agency are resolved server side.
 *
 * Assumptions (not pinned by the brief, flagged for the implementer):
 *   - Refusal of an unassigned or ended-employment driver may be a raised error or {ok:false}; only
 *     "refused, nothing written" is required for ended employment.
 *   - Rate guard counts pings for the job created in the last hour; 120 accepted, the 121st refused.
 *   - open_incidents counts incidents in status 'open' or 'acknowledged' (not resolved).
 *   - Update of an incident by another agency or by a finance/viewer scope may be a raised error or
 *     {ok:false}; no text is pinned beyond the listed tokens.
 *   - Every denial case first checks that the object under test exists, so a missing migration
 *     can never produce a green result by accident.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST / GoTrue
 * behaviour is NOT covered. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_tracking.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud
 * failure, never a silent skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261020000000_agency_tracking.sql'
const MIGRATION_PATH = join(MIGRATIONS_DIR, MIGRATION_FILE)

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

/** First line of an error message with the harness's [SQL: ...] annotation removed. */
function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].split(' [SQL:')[0].trim()
}

/** Passes only if the promise rejects with a message containing `fragment`. */
async function expectRaises(promise, fragment) {
  try {
    await promise
  } catch (error) {
    const message = firstLine(error)
    expect(message.includes(fragment), `expected an error containing "${fragment}", got: ${JSON.stringify(message)}`)
    return message
  }
  throw new Error(`expected an error containing "${fragment}", but the statement succeeded`)
}

/**
 * Passes only when the call is refused (ok:false) or raises, and the refusal text contains one of
 * `tokens`. An accepted call fails. Returns the refusal text.
 */
async function expectRefusal(promise, tokens) {
  let text
  try {
    const r = await promise
    if (!(r && r.ok === false)) {
      throw new Error(`expected a refusal (${tokens.join(' | ')}), got ${String(JSON.stringify(r)).slice(0, 160)}`)
    }
    text = String(r.error === undefined ? '' : r.error)
  } catch (error) {
    if (String(error.message).startsWith('expected a refusal')) throw error
    text = firstLine(error)
  }
  expect(
    tokens.some((t) => text.includes(t)),
    `expected a refusal containing one of ${JSON.stringify(tokens)}, got: ${JSON.stringify(text)}`
  )
  return text
}

/** Resolves true when the call is refused (raised, or returned ok:false), false when it was accepted. */
async function refusedOrNotOk(promise) {
  try {
    const r = await promise
    return Boolean(r && r.ok === false)
  } catch {
    return true
  }
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

/** Runs every sub-check and reports ALL failing ones in one case. */
async function gather(checks) {
  const failures = []
  for (const [label, fn] of checks) {
    try {
      await fn()
    } catch (error) {
      failures.push(`${label}: ${firstLine(error)}`)
    }
  }
  if (failures.length) throw new Error(failures.join(' ; '))
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
// Ids and role switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
let nonce = 0
const nx = (prefix) => `${prefix}-${++nonce}`
let tick = 0
/** A unique recorded_at, more than an hour in the past (inside the 24h window, never in the future). */
const pastIso = () => new Date(Date.now() - 60 * 60e3 - ++tick * 60e3).toISOString()
const hoursAgoIso = (h) => new Date(Date.now() - h * 60 * 60e3).toISOString()
const minutesFromNowIso = (m) => new Date(Date.now() + m * 60e3).toISOString()

async function actAs(sub) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    sub ? JSON.stringify({ sub, role: 'authenticated' }) : '{}',
  ])
  await db.exec('SET ROLE authenticated')
}

async function actAsService() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
}

/** Runs fn as the authenticated role for `userId`, then returns to superuser. */
async function asActor(userId, fn) {
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await actAsService()
  }
}

/** Runs one statement as the anon role (no claims), then returns to superuser. */
async function asAnon(sql, params = []) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  await db.exec('SET ROLE anon')
  try {
    return await db.query(sql, params)
  } finally {
    await actAsService()
  }
}

/** Superuser statement (service-role equivalent). Always resets the role first. */
async function su(sql, params = []) {
  await actAsService()
  return db.query(sql, params)
}

async function suOne(sql, params = []) {
  return (await su(sql, params)).rows[0]
}

/** Direct DML as an actor; resolves to { rows } or { error } (never throws). */
async function dmlOutcome(who, sql, params) {
  return asActor(who, async () => {
    try {
      return { rows: (await db.query(sql, params)).rows }
    } catch (error) {
      return { error: firstLine(error) }
    }
  })
}

/** Asserts a direct write was denied: raised, or affected zero rows (RETURNING shows the count). */
function expectNoWrite(outcome, label) {
  const affected = outcome.rows ? outcome.rows.length : 0
  expect(outcome.error !== undefined || affected === 0, `${label} was accepted (${affected} row(s) changed)`)
}

/** Denial cases must prove the object exists first, so a missing migration cannot pass them. */
async function requireTable(name) {
  const r = await suOne(
    `SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
      WHERE ns.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`,
    [name]
  )
  expect(r.n === 1, `table public.${name} does not exist yet`)
}

async function requireFunction(name) {
  const r = await suOne(
    `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
      WHERE ns.nspname = 'public' AND p.proname = $1`,
    [name]
  )
  expect(r.n >= 1, `function public.${name} does not exist yet`)
}

async function visibleCount(who, table, agencyId) {
  return asActor(who, async () => {
    const r = await db.query(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])
    return r.rows[0].n
  })
}

// ---------------------------------------------------------------------------
// Fixtures (superuser). Only pre-existing tables are touched here, so setup never
// fails; anything that needs the new tables happens inside a case.
// ---------------------------------------------------------------------------
async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify({}),
  ])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

async function createAgencyRow(userId, tag, status = 'pending') {
  const id = uid()
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6)`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, `07ABCDE${1000 + seq}A1Z5`, `ABCDE${4000 + seq}Q`]
  )
  return id
}

/** Membership row seeded by superuser (status 'revoked' also needs revoked_at, table CHECK). */
async function seedStaff(agencyId, tag, scope, status = 'active') {
  const userId = await createUser(tag)
  await su(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [uid(), agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
}

async function createDriver(userId, tag, status = 'approved') {
  const id = uid()
  await su(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', $5, true, 'ABCDE1234F')`,
    [id, userId, `${tag} Driver`, `9${String(seq).padStart(9, '0')}`, status]
  )
  return id
}

/** Employment row seeded by superuser. */
async function employ(agencyId, driverId, status = 'active') {
  await su(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, $4)`,
    [uid(), agencyId, driverId, status]
  )
}

async function createCustomer(userId, tag) {
  const id = uid()
  await su(
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

let customerId, customerUserId

/** Pre-dispatch shipment with a matching consent, then an agency job in the given status. */
async function seedJob(agencyId, status, driverId, tag) {
  const shipmentId = uid()
  await su(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [shipmentId, `AGTRK-${tag}-${++seq}-${Date.now()}`, customerId, customerUserId]
  )
  await su(
    `INSERT INTO public.shipment_agency_consents (shipment_id, agency_id, granted_via, granted_by)
     VALUES ($1, $2, 'platform_dispatch', $3)`,
    [shipmentId, agencyId, customerUserId]
  )
  const jobId = uid()
  await su(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status, driver_id)
     VALUES ($1, $2, $3, 15000, $4, $5)`,
    [jobId, agencyId, shipmentId, status, driverId]
  )
  return jobId
}

// Fixture handles, assigned in setupFixtures().
let ownerA, ownerB, ownerS, agencyA, agencyB, agencyS
let dispatcherA, fleetA, financeA, viewerA, revokedA, staffS, noAgency
let driverUserA1, driverA1, driverUserA2, driverA2, driverUserB, driverB, driverUserE, driverEnded
let jobA1, jobA2, jobATerm, jobACancel, jobARate, jobALive, jobASchema, jobAOrder, jobB, jobS

async function setupFixtures() {
  ownerA = await createUser('at-owner-a')
  agencyA = await createAgencyRow(ownerA, 'AgTrack A', 'approved')
  ownerB = await createUser('at-owner-b')
  agencyB = await createAgencyRow(ownerB, 'AgTrack B', 'approved')
  ownerS = await createUser('at-owner-s')
  agencyS = await createAgencyRow(ownerS, 'AgTrack S', 'suspended')

  customerUserId = await createUser('at-customer')
  customerId = await createCustomer(customerUserId, 'AgTrack')

  dispatcherA = await seedStaff(agencyA, 'at-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'at-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'at-finance', 'finance')
  viewerA = await seedStaff(agencyA, 'at-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'at-revoked', 'dispatcher', 'revoked')
  staffS = await seedStaff(agencyS, 'at-suspended', 'dispatcher')
  noAgency = await createUser('at-no-agency')

  driverUserA1 = await createUser('at-driver-a1')
  driverA1 = await createDriver(driverUserA1, 'AgTrack A1')
  await employ(agencyA, driverA1)
  driverUserA2 = await createUser('at-driver-a2')
  driverA2 = await createDriver(driverUserA2, 'AgTrack A2')
  await employ(agencyA, driverA2)
  driverUserB = await createUser('at-driver-b')
  driverB = await createDriver(driverUserB, 'AgTrack B1')
  await employ(agencyB, driverB)
  driverUserE = await createUser('at-driver-ended')
  driverEnded = await createDriver(driverUserE, 'AgTrack Ended')
  await employ(agencyA, driverEnded, 'ended')

  jobA1 = await seedJob(agencyA, 'accepted', driverA1, 'a1')
  jobA2 = await seedJob(agencyA, 'accepted', null, 'a2')
  jobATerm = await seedJob(agencyA, 'delivered', driverA1, 'term')
  jobACancel = await seedJob(agencyA, 'cancelled', driverA1, 'cancel')
  jobARate = await seedJob(agencyA, 'accepted', driverA1, 'rate')
  jobALive = await seedJob(agencyA, 'accepted', driverA1, 'live')
  jobASchema = await seedJob(agencyA, 'accepted', driverA1, 'schema')
  jobAOrder = await seedJob(agencyA, 'accepted', driverA1, 'order')
  jobB = await seedJob(agencyB, 'accepted', driverB, 'b')
  jobS = await seedJob(agencyS, 'accepted', null, 's')
}

// ---------------------------------------------------------------------------
// Command wrappers and helpers
// ---------------------------------------------------------------------------
const SCOPE_MSG = 'Your access scope does not allow this action.'
const SUSPENDED_MSG = 'Agency approval is required.'

const PING_SQL = `SELECT public.tracking_ping_record($1::uuid, $2::numeric, $3::numeric, $4::numeric, $5::timestamptz) AS r`
const OPEN_SQL = `SELECT public.agency_incident_open($1::uuid, $2::text, $3::jsonb, $4::text) AS r`
const UPDATE_SQL = `SELECT public.agency_incident_update($1::uuid, $2::text, $3::int, $4::text) AS r`
const LIVE_SQL = `SELECT public.agency_trip_live($1::uuid) AS r`

async function pingAs(who, jobId, lat, lng, speed, recordedAt) {
  return asActor(who, async () => parseJson((await db.query(PING_SQL, [jobId, lat, lng, speed, recordedAt])).rows[0].r))
}

/** A valid ping by the given driver at a unique past timestamp. */
async function goodPing(driverUser, jobId, label = '') {
  const r = await pingAs(driverUser, jobId, 26.912345, 75.787271, 42.5, pastIso())
  expect(r && r.ok === true, `setup ping ${label} refused: ${JSON.stringify(r)}`)
  return r
}

async function openAs(who, jobId, kind, details, dedupeKey) {
  return asActor(who, async () => parseJson((await db.query(OPEN_SQL, [jobId, kind, JSON.stringify(details), dedupeKey])).rows[0].r))
}

async function openIncident(who, jobId, kind = 'overspeed', dedupeKey = nx('inc')) {
  const r = await openAs(who, jobId, kind, { note: 'test' }, dedupeKey)
  expect(r && r.ok === true && UUID_RE.test(String(r.incident_id)), `open refused: ${JSON.stringify(r)}`)
  return { id: r.incident_id, key: dedupeKey }
}

async function updateAs(who, incidentId, toStatus, expectedVersion, note) {
  return asActor(who, async () =>
    parseJson((await db.query(UPDATE_SQL, [incidentId, toStatus, expectedVersion, note])).rows[0].r)
  )
}

async function liveAs(who, jobId) {
  return asActor(who, async () => parseJson((await db.query(LIVE_SQL, [jobId])).rows[0].r))
}

async function pingCount(jobId) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_tracking_pings WHERE job_id = $1`, [jobId])).n
}

async function incidentRow(id) {
  return suOne(`SELECT status, version, resolution_note, kind, agency_id, job_id FROM public.agency_incidents WHERE id = $1`, [id])
}

/** Function signature / SECURITY DEFINER / pinned search_path check. Returns failure strings. */
async function rpcDefinitionFailures(name, expectedArgs, expectedResult = 'jsonb') {
  const info = await su(
    `SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS res,
            p.prosecdef, p.proconfig
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname = $1`,
    [name]
  )
  expect(info.rows.length === 1, `expected 1 definition of ${name}, found ${info.rows.length}`)
  const { args, res, prosecdef, proconfig } = info.rows[0]
  const failures = []
  if (args !== expectedArgs) failures.push(`identity arguments: ${args}`)
  if (/agency/i.test(args)) failures.push(`an argument names an agency: ${args}`)
  if (res !== expectedResult) failures.push(`return type ${res}`)
  if (prosecdef !== true) failures.push('not SECURITY DEFINER')
  if (!/search_path=public/.test((proconfig || []).join(','))) failures.push(`search_path not pinned (${(proconfig || []).join(',') || 'none'})`)
  return failures
}

function expectNoRowsVisible(rows, label) {
  expect(rows === 0, `${label} can see ${rows} row(s)`)
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const migrationPresent = existsSync(MIGRATION_PATH)
  const applied = await applyMigrations()
  const last = applied[applied.length - 1]

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations applied: ${applied.length} (last=${last})`)
  console.log(`expected new migration ${MIGRATION_FILE}: ${migrationPresent ? 'present' : 'MISSING'}`)
  await setupFixtures()

  // =========================================================================
  // 0. Migration and schema
  // =========================================================================
  await testCase('T01. migration file supabase/migrations/20261020000000_agency_tracking.sql exists', async () => {
    expect(migrationPresent, `${MIGRATION_FILE} does not exist yet`)
  })

  await testCase('T02. agency_tracking_pings and agency_incidents exist with RLS enabled', async () => {
    await requireTable('agency_tracking_pings')
    await requireTable('agency_incidents')
    const rows = (
      await su(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
          WHERE ns.nspname = 'public' AND c.relname IN ('agency_tracking_pings', 'agency_incidents')`
      )
    ).rows
    expect(rows.length === 2, `found ${rows.length} of 2 tables`)
    expect(rows.every((r) => r.relrowsecurity === true), 'RLS is not enabled on both tables')
  })

  await testCase('T03. a second ping with the same (job_id, recorded_at) is rejected by a unique constraint', async () => {
    await requireTable('agency_tracking_pings')
    const ts = hoursAgoIso(3)
    const insert = `INSERT INTO public.agency_tracking_pings (agency_id, job_id, driver_id, recorded_at, lat, lng, speed_kmph)
                    VALUES ($1, $2, $3, $4, 1, 1, 1)`
    await su(insert, [agencyA, jobASchema, driverA1, ts])
    await expectRaises(su(insert, [agencyA, jobASchema, driverA1, ts]), 'unique')
  })

  await testCase('T04. two incidents of one agency with the same dedupe_key are rejected by a unique constraint', async () => {
    await requireTable('agency_incidents')
    const key = nx('uniq-key')
    const insert = `INSERT INTO public.agency_incidents (agency_id, job_id, kind, status, dedupe_key, details)
                    VALUES ($1, $2, 'other', 'open', $3, '{}'::jsonb)`
    await su(insert, [agencyA, jobASchema, key])
    await expectRaises(su(insert, [agencyA, jobASchema, key]), 'unique')
  })

  await testCase('T05. incident kind outside the six allowed values is rejected by a check constraint', async () => {
    await requireTable('agency_incidents')
    await expectRaises(
      su(
        `INSERT INTO public.agency_incidents (agency_id, job_id, kind, status, dedupe_key, details)
         VALUES ($1, $2, 'theft', 'open', $3, '{}'::jsonb)`,
        [agencyA, jobASchema, nx('kind')]
      ),
      'violates'
    )
  })

  await testCase('T06. incident status outside open/acknowledged/resolved is rejected by a check constraint', async () => {
    await requireTable('agency_incidents')
    await expectRaises(
      su(
        `INSERT INTO public.agency_incidents (agency_id, job_id, kind, status, dedupe_key, details)
         VALUES ($1, $2, 'other', 'closed', $3, '{}'::jsonb)`,
        [agencyA, jobASchema, nx('status')]
      ),
      'violates'
    )
  })

  await testCase('T07. a new incident starts at version 1 when version is not supplied', async () => {
    await requireTable('agency_incidents')
    const row = await suOne(
      `INSERT INTO public.agency_incidents (agency_id, job_id, kind, status, dedupe_key, details)
       VALUES ($1, $2, 'other', 'open', $3, '{}'::jsonb) RETURNING version`,
      [agencyA, jobASchema, nx('ver')]
    )
    expect(Number(row.version) === 1, `version ${row.version}, expected 1`)
  })

  await testCase('T08. authenticated driver cannot insert a ping directly', async () => {
    await requireTable('agency_tracking_pings')
    const o = await dmlOutcome(
      driverUserA1,
      `INSERT INTO public.agency_tracking_pings (agency_id, job_id, driver_id, recorded_at, lat, lng, speed_kmph)
       VALUES ($1, $2, $3, $4, 1, 1, 1) RETURNING id`,
      [agencyA, jobA1, driverA1, pastIso()]
    )
    expectNoWrite(o, 'driver direct ping insert')
  })

  await testCase('T09. authenticated owner cannot update or delete pings directly', async () => {
    await requireTable('agency_tracking_pings')
    const p = await su(
      `INSERT INTO public.agency_tracking_pings (agency_id, job_id, driver_id, recorded_at, lat, lng, speed_kmph)
       VALUES ($1, $2, $3, $4, 1, 1, 1) RETURNING id`,
      [agencyA, jobA2, null, pastIso()]
    )
    const id = p.rows[0].id
    await gather([
      ['update', async () => expectNoWrite(await dmlOutcome(ownerA, `UPDATE public.agency_tracking_pings SET speed_kmph = 99 WHERE id = $1 RETURNING id`, [id]), 'owner update')],
      ['delete', async () => expectNoWrite(await dmlOutcome(ownerA, `DELETE FROM public.agency_tracking_pings WHERE id = $1 RETURNING id`, [id]), 'owner delete')],
    ])
  })

  await testCase('T10. authenticated owner cannot insert, update or delete incidents directly', async () => {
    await requireTable('agency_incidents')
    const inc = await suOne(
      `INSERT INTO public.agency_incidents (agency_id, job_id, kind, status, dedupe_key, details)
       VALUES ($1, $2, 'other', 'open', $3, '{}'::jsonb) RETURNING id`,
      [agencyA, jobA2, nx('direct')]
    )
    await gather([
      ['insert', async () => expectNoWrite(await dmlOutcome(ownerA, `INSERT INTO public.agency_incidents (agency_id, job_id, kind, status, dedupe_key, details) VALUES ($1, $2, 'other', 'open', $3, '{}'::jsonb) RETURNING id`, [agencyA, jobA2, nx('direct-b')]), 'owner insert')],
      ['update', async () => expectNoWrite(await dmlOutcome(ownerA, `UPDATE public.agency_incidents SET status = 'resolved' WHERE id = $1 RETURNING id`, [inc.id]), 'owner update')],
      ['delete', async () => expectNoWrite(await dmlOutcome(ownerA, `DELETE FROM public.agency_incidents WHERE id = $1 RETURNING id`, [inc.id]), 'owner delete')],
    ])
  })

  await testCase('T11. anon reads nothing from pings or incidents', async () => {
    await requireTable('agency_tracking_pings')
    await requireTable('agency_incidents')
    for (const t of ['agency_tracking_pings', 'agency_incidents']) {
      let n
      try {
        n = (await asAnon(`SELECT count(*)::int AS n FROM public.${t}`)).rows[0].n
      } catch {
        n = 0
      }
      expect(n === 0, `anon sees ${n} row(s) in ${t}`)
    }
  })

  await testCase('T12. tracking_ping_record signature is (uuid, numeric, numeric, numeric, timestamptz) returns jsonb, SECURITY DEFINER, pinned search_path, no agency argument', async () => {
    const failures = await rpcDefinitionFailures(
      'tracking_ping_record',
      'p_job_id uuid, p_lat numeric, p_lng numeric, p_speed_kmph numeric, p_recorded_at timestamp with time zone'
    )
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('T13. agency_incident_open signature is (uuid, text, jsonb, text) returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures('agency_incident_open', 'p_job_id uuid, p_kind text, p_details jsonb, p_dedupe_key text')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('T14. agency_incident_update signature is (uuid, text, integer, text) returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures('agency_incident_update', 'p_incident_id uuid, p_to_status text, p_expected_version integer, p_note text')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('T15. agency_trip_live signature is (uuid) returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures('agency_trip_live', 'p_job_id uuid')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('T16. the four commands are executable by authenticated and not by anon', async () => {
    await requireFunction('tracking_ping_record')
    await requireFunction('agency_incident_open')
    await requireFunction('agency_incident_update')
    await requireFunction('agency_trip_live')
    const sigs = [
      'public.tracking_ping_record(uuid,numeric,numeric,numeric,timestamptz)',
      'public.agency_incident_open(uuid,text,jsonb,text)',
      'public.agency_incident_update(uuid,text,integer,text)',
      'public.agency_trip_live(uuid)',
    ]
    const failures = []
    for (const sig of sigs) {
      const r = await suOne(
        `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth, has_function_privilege('anon', $1, 'EXECUTE') AS anon`,
        [sig]
      )
      if (r.auth !== true) failures.push(`${sig} not executable by authenticated`)
      if (r.anon !== false) failures.push(`${sig} executable by anon`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // P. Driver pings: tracking_ping_record
  // =========================================================================
  await testCase('T17. the assigned, actively employed driver records a ping: ok true and one row stored', async () => {
    await requireTable('agency_tracking_pings')
    const before = await pingCount(jobA1)
    const r = await pingAs(driverUserA1, jobA1, 26.912345, 75.787271, 42.5, pastIso())
    expect(r && r.ok === true, `expected ok:true, got ${JSON.stringify(r)}`)
    expect((await pingCount(jobA1)) === before + 1, 'no ping row was stored')
  })

  await testCase('T18. the stored ping carries the job agency, the driver, and the submitted coordinates, speed and time', async () => {
    await requireTable('agency_tracking_pings')
    const ts = pastIso()
    const r = await pingAs(driverUserA1, jobAOrder, 28.5, 77.25, 61, ts)
    expect(r && r.ok === true, `ping refused: ${JSON.stringify(r)}`)
    const row = await suOne(
      `SELECT agency_id, driver_id, lat::float8 AS lat, lng::float8 AS lng, speed_kmph::float8 AS speed,
              recorded_at = $2::timestamptz AS same_time
         FROM public.agency_tracking_pings WHERE job_id = $1`,
      [jobAOrder, ts]
    )
    expect(row, 'no ping row for the job')
    expect(row.agency_id === agencyA, `agency_id ${row.agency_id}, expected the job agency`)
    expect(row.driver_id === driverA1, `driver_id ${row.driver_id}, expected the driver`)
    expect(row.lat === 28.5 && row.lng === 77.25 && row.speed === 61, `stored ${JSON.stringify(row)}`)
    expect(row.same_time === true, 'recorded_at was not stored as submitted')
  })

  await testCase('T19. a duplicate (job, recorded_at) returns ok true with replay true and keeps one row', async () => {
    await requireTable('agency_tracking_pings')
    const ts = pastIso()
    const first = await pingAs(driverUserA1, jobALive, 26.1, 75.1, 30, ts)
    expect(first && first.ok === true, `first ping refused: ${JSON.stringify(first)}`)
    const again = await pingAs(driverUserA1, jobALive, 26.1, 75.1, 30, ts)
    expect(again && again.ok === true && again.replay === true, `expected replay:true, got ${JSON.stringify(again)}`)
    const n = (await suOne(`SELECT count(*)::int AS n FROM public.agency_tracking_pings WHERE job_id = $1 AND recorded_at = $2::timestamptz`, [jobALive, ts])).n
    expect(n === 1, `${n} rows for the duplicate ping, expected 1`)
  })

  await testCase('T20. latitude or longitude outside the valid range is refused with invalid_coordinates', async () => {
    await requireFunction('tracking_ping_record')
    await gather([
      ['lat 90.5', async () => expectRefusal(pingAs(driverUserA1, jobA1, 90.5, 10, 10, pastIso()), ['invalid_coordinates'])],
      ['lat -91', async () => expectRefusal(pingAs(driverUserA1, jobA1, -91, 10, 10, pastIso()), ['invalid_coordinates'])],
      ['lng 181', async () => expectRefusal(pingAs(driverUserA1, jobA1, 10, 181, 10, pastIso()), ['invalid_coordinates'])],
      ['lng -180.5', async () => expectRefusal(pingAs(driverUserA1, jobA1, 10, -180.5, 10, pastIso()), ['invalid_coordinates'])],
    ])
  })

  await testCase('T21. speed below 0 or above 250 km/h is refused with invalid_speed', async () => {
    await requireFunction('tracking_ping_record')
    await gather([
      ['speed -1', async () => expectRefusal(pingAs(driverUserA1, jobA1, 10, 10, -1, pastIso()), ['invalid_speed'])],
      ['speed 251', async () => expectRefusal(pingAs(driverUserA1, jobA1, 10, 10, 251, pastIso()), ['invalid_speed'])],
    ])
  })

  await testCase('T22. boundary values are accepted: lat and lng at their limits, speed 0 and 250', async () => {
    await gather([
      ['lat 90 lng 180 speed 0', async () => expect((await pingAs(driverUserA1, jobASchema, 90, 180, 0, pastIso())).ok === true, 'refused')],
      ['lat -90 lng -180 speed 250', async () => expect((await pingAs(driverUserA1, jobASchema, -90, -180, 250, pastIso())).ok === true, 'refused')],
    ])
  })

  await testCase('T23. a recorded_at 4 minutes ahead is accepted; 6 minutes ahead is refused with future_timestamp', async () => {
    await gather([
      ['4 min ahead accepted', async () => expect((await pingAs(driverUserA1, jobALive, 10, 10, 10, minutesFromNowIso(4))).ok === true, 'refused')],
      ['6 min ahead refused', async () => expectRefusal(pingAs(driverUserA1, jobALive, 10, 10, 10, minutesFromNowIso(6)), ['future_timestamp'])],
    ])
  })

  await testCase('T24. a recorded_at 23 hours old is accepted; 25 hours old is refused with too_old', async () => {
    await gather([
      ['23h old accepted', async () => expect((await pingAs(driverUserA1, jobALive, 10, 10, 10, hoursAgoIso(23))).ok === true, 'refused')],
      ['25h old refused', async () => expectRefusal(pingAs(driverUserA1, jobALive, 10, 10, 10, hoursAgoIso(25)), ['too_old'])],
    ])
  })

  await testCase('T25. an employed driver who is not assigned to the job is refused with not_assigned', async () => {
    await requireFunction('tracking_ping_record')
    await expectRefusal(pingAs(driverUserA2, jobA1, 10, 10, 10, pastIso()), ['not_assigned'])
  })

  await testCase('T26. a driver without active employment is refused and writes no ping', async () => {
    await requireFunction('tracking_ping_record')
    const before = await pingCount(jobA1)
    expect(await refusedOrNotOk(pingAs(driverUserE, jobA1, 10, 10, 10, pastIso())), 'the ended-employment driver was accepted')
    expect((await pingCount(jobA1)) === before, 'a ping row was written for the ended-employment driver')
  })

  await testCase('T27. a delivered (terminal) job refuses pings with job_not_active', async () => {
    await requireFunction('tracking_ping_record')
    await expectRefusal(pingAs(driverUserA1, jobATerm, 10, 10, 10, pastIso()), ['job_not_active'])
  })

  await testCase('T28. a cancelled job refuses pings with job_not_active', async () => {
    await requireFunction('tracking_ping_record')
    await expectRefusal(pingAs(driverUserA1, jobACancel, 10, 10, 10, pastIso()), ['job_not_active'])
  })

  await testCase('T29. a driver pinging another agency job, or an agency driver pinging a foreign job, gets not_found', async () => {
    await requireFunction('tracking_ping_record')
    await gather([
      ['driver B on agency A job', async () => expectRefusal(pingAs(driverUserB, jobA1, 10, 10, 10, pastIso()), ['not_found'])],
      ['driver A1 on agency B job', async () => expectRefusal(pingAs(driverUserA1, jobB, 10, 10, 10, pastIso()), ['not_found'])],
    ])
  })

  await testCase('T30. an agency owner who is not a driver cannot record a ping and no row is written', async () => {
    await requireFunction('tracking_ping_record')
    const before = await pingCount(jobA1)
    expect(await refusedOrNotOk(pingAs(ownerA, jobA1, 10, 10, 10, pastIso())), 'the owner recorded a ping')
    expect((await pingCount(jobA1)) === before, 'a ping row was written for the owner')
  })

  await testCase('T31. the assigned driver reads own pings through RLS, and the count matches what was recorded', async () => {
    await requireTable('agency_tracking_pings')
    const job = jobAOrder
    const before = (await suOne(`SELECT count(*)::int AS n FROM public.agency_tracking_pings WHERE job_id = $1`, [job])).n
    await goodPing(driverUserA1, job, 'read-own-1')
    await goodPing(driverUserA1, job, 'read-own-2')
    const seen = await asActor(driverUserA1, async () =>
      (await db.query(`SELECT count(*)::int AS n FROM public.agency_tracking_pings WHERE job_id = $1`, [job])).rows[0].n
    )
    expect(seen === before + 2, `driver sees ${seen}, expected ${before + 2}`)
  })

  await testCase('T32. pings are listed in recorded_at order for the assigned driver', async () => {
    await requireTable('agency_tracking_pings')
    const job = jobA1
    const t3 = hoursAgoIso(3.5)
    const t1 = hoursAgoIso(1.5)
    const t2 = hoursAgoIso(2.5)
    await goodPing(driverUserA1, job, 'order-x')
    expect((await pingAs(driverUserA1, job, 10, 10, 10, t3)).ok === true, 'ping t3 refused')
    expect((await pingAs(driverUserA1, job, 10, 10, 10, t1)).ok === true, 'ping t1 refused')
    expect((await pingAs(driverUserA1, job, 10, 10, 10, t2)).ok === true, 'ping t2 refused')
    const rows = await asActor(driverUserA1, async () =>
      (await db.query(`SELECT recorded_at FROM public.agency_tracking_pings WHERE job_id = $1 ORDER BY recorded_at`, [job])).rows
    )
    const times = rows.map((r) => new Date(r.recorded_at).getTime())
    expect(times.length >= 3, `only ${times.length} pings listed`)
    expect(times.every((t, i) => i === 0 || times[i - 1] <= t), 'pings are not in recorded_at order')
  })

  await testCase('T33. the 120-per-hour rate guard accepts 120 pings and refuses the 121st with rate_limited', async () => {
    await requireFunction('tracking_ping_record')
    // FIXTURE CHANGE (min spacing guard, T64+): pings are 5s apart from one fixed base so no two are within 2s.
    const base33 = Date.now() - 2 * 60 * 60e3
    for (let i = 0; i < 120; i++) {
      const ts = new Date(base33 - i * 5000).toISOString()
      const r = await pingAs(driverUserA1, jobARate, 10, 10, 10, ts)
      expect(r && r.ok === true, `ping ${i + 1} of 120 refused: ${JSON.stringify(r)}`)
    }
    await expectRefusal(pingAs(driverUserA1, jobARate, 10, 10, 10, new Date(base33 - 700000).toISOString()), ['rate_limited'])
  })

  await testCase('T34. another driver of the same agency cannot read pings of a job not assigned to him', async () => {
    await requireTable('agency_tracking_pings')
    await goodPing(driverUserA1, jobALive, 'isolation')
    const seen = await asActor(driverUserA2, async () =>
      (await db.query(`SELECT count(*)::int AS n FROM public.agency_tracking_pings WHERE job_id = $1`, [jobALive])).rows[0].n
    )
    expectNoRowsVisible(seen, 'driver A2 reading driver A1 pings')
  })

  await testCase('T35. a driver of another agency cannot read pings of this agency and the owner of another agency sees none', async () => {
    await requireTable('agency_tracking_pings')
    await goodPing(driverUserA1, jobALive, 'cross-agency')
    const driverSeen = await asActor(driverUserB, async () =>
      (await db.query(`SELECT count(*)::int AS n FROM public.agency_tracking_pings WHERE job_id = $1`, [jobALive])).rows[0].n
    )
    const ownerSeen = await visibleCount(ownerB, 'agency_tracking_pings', agencyA)
    expectNoRowsVisible(driverSeen, 'driver B reading agency A pings')
    expectNoRowsVisible(ownerSeen, 'owner B reading agency A pings')
  })

  await testCase('T36. a driver cannot read another driver job row (agency_jobs) and cannot change it', async () => {
    await requireTable('agency_tracking_pings')
    const seen = await asActor(driverUserA2, async () =>
      (await db.query(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE id = $1`, [jobA1])).rows[0].n
    )
    expect(seen === 0, `driver A2 sees ${seen} row(s) of driver A1 job`)
    const o = await dmlOutcome(driverUserA2, `UPDATE public.agency_jobs SET notes = 'hijack' WHERE id = $1 RETURNING id`, [jobA1])
    expectNoWrite(o, 'driver A2 update of driver A1 job')
  })

  // =========================================================================
  // I. Incidents: open
  // =========================================================================
  await testCase('T37. dispatcher opens an incident: ok with incident_id, row open at version 1 for the job agency', async () => {
    await requireTable('agency_incidents')
    const r = await openAs(dispatcherA, jobA1, 'long_halt', { minutes: 40 }, nx('i37'))
    expect(r && r.ok === true && UUID_RE.test(String(r.incident_id)), `expected ok with incident_id, got ${JSON.stringify(r)}`)
    const row = await incidentRow(r.incident_id)
    expect(row.status === 'open' && Number(row.version) === 1, `row ${JSON.stringify(row)}`)
    expect(row.agency_id === agencyA && row.kind === 'long_halt', `row ${JSON.stringify(row)}`)
  })

  await testCase('T38. fleet_manager opens an incident', async () => {
    await requireTable('agency_incidents')
    const r = await openAs(fleetA, jobA1, 'breakdown', {}, nx('i38'))
    expect(r && r.ok === true && UUID_RE.test(String(r.incident_id)), `got ${JSON.stringify(r)}`)
  })

  await testCase('T39. agency owner opens an incident', async () => {
    await requireTable('agency_incidents')
    const r = await openAs(ownerA, jobA1, 'accident', { severity: 'minor' }, nx('i39'))
    expect(r && r.ok === true && UUID_RE.test(String(r.incident_id)), `got ${JSON.stringify(r)}`)
  })

  await testCase('T40. finance and viewer are refused with forbidden_scope and write nothing', async () => {
    await requireFunction('agency_incident_open')
    const key = nx('i40')
    await gather([
      ['finance', async () => expectRefusal(openAs(financeA, jobA1, 'other', {}, key), ['forbidden_scope', SCOPE_MSG])],
      ['viewer', async () => expectRefusal(openAs(viewerA, jobA1, 'other', {}, key), ['forbidden_scope', SCOPE_MSG])],
    ])
    await requireTable('agency_incidents')
    const n = (await suOne(`SELECT count(*)::int AS n FROM public.agency_incidents WHERE dedupe_key = $1`, [key])).n
    expect(n === 0, `${n} incident row(s) written by an out-of-scope caller`)
  })

  await testCase('T41. an unknown incident kind is refused with invalid_kind', async () => {
    await requireFunction('agency_incident_open')
    await expectRefusal(openAs(dispatcherA, jobA1, 'theft', {}, nx('i41')), ['invalid_kind'])
  })

  await testCase('T42. details larger than 4000 characters are refused with details_too_large; 3000 characters are accepted', async () => {
    await requireFunction('agency_incident_open')
    await gather([
      ['4100 chars refused', async () => expectRefusal(openAs(dispatcherA, jobA1, 'other', { note: 'x'.repeat(4100) }, nx('i42a')), ['details_too_large'])],
      ['3000 chars accepted', async () => expect((await openAs(dispatcherA, jobA1, 'other', { note: 'x'.repeat(3000) }, nx('i42b'))).ok === true, 'refused')],
    ])
  })

  await testCase('T43. a repeated dedupe_key returns replay true with the same incident_id and creates no second row', async () => {
    await requireTable('agency_incidents')
    const key = nx('i43')
    const first = await openAs(dispatcherA, jobA1, 'overspeed', { kmph: 96 }, key)
    expect(first && first.ok === true, `first open ${JSON.stringify(first)}`)
    const again = await openAs(dispatcherA, jobA1, 'overspeed', { kmph: 96 }, key)
    expect(again && again.ok === true && again.replay === true, `expected replay:true, got ${JSON.stringify(again)}`)
    expect(again.incident_id === first.incident_id, `incident_id ${again.incident_id}, expected ${first.incident_id}`)
    const n = (await suOne(`SELECT count(*)::int AS n FROM public.agency_incidents WHERE agency_id = $1 AND dedupe_key = $2`, [agencyA, key])).n
    expect(n === 1, `${n} rows for the key, expected 1`)
  })

  await testCase('T44. the same dedupe_key is allowed for another agency and creates a new incident there', async () => {
    await requireTable('agency_incidents')
    const key = nx('i44')
    const a = await openAs(dispatcherA, jobA1, 'other', {}, key)
    const b = await openAs(ownerB, jobB, 'other', {}, key)
    expect(a && a.ok === true, `agency A ${JSON.stringify(a)}`)
    expect(b && b.ok === true && b.replay !== true, `agency B expected a new incident, got ${JSON.stringify(b)}`)
    expect(b.incident_id !== a.incident_id, 'agency B got the agency A incident back')
  })

  await testCase('T45. an incident on another agency job is refused with not_found and nothing is written', async () => {
    await requireFunction('agency_incident_open')
    const key = nx('i45')
    await expectRefusal(openAs(ownerB, jobA1, 'other', {}, key), ['not_found'])
    await requireTable('agency_incidents')
    const n = (await suOne(`SELECT count(*)::int AS n FROM public.agency_incidents WHERE dedupe_key = $1`, [key])).n
    expect(n === 0, `${n} row(s) written for a foreign job`)
  })

  await testCase('T46. staff of a suspended agency are refused with the approval message', async () => {
    await requireFunction('agency_incident_open')
    await expectRefusal(openAs(staffS, jobS, 'other', {}, nx('i46')), [SUSPENDED_MSG, 'approval'])
  })

  // =========================================================================
  // U. Incidents: update
  // =========================================================================
  await testCase('T47. open to acknowledged with the current version: ok, status acknowledged, version 2', async () => {
    const inc = await openIncident(dispatcherA, jobA1)
    const r = await updateAs(dispatcherA, inc.id, 'acknowledged', 1, null)
    expect(r && r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
    const row = await incidentRow(inc.id)
    expect(row.status === 'acknowledged' && Number(row.version) === 2, `row ${JSON.stringify(row)}`)
  })

  await testCase('T48. acknowledged to resolved with a note: ok, resolution_note stored, version 3', async () => {
    const inc = await openIncident(dispatcherA, jobA1)
    expect((await updateAs(dispatcherA, inc.id, 'acknowledged', 1, null)).ok === true, 'ack refused')
    const r = await updateAs(dispatcherA, inc.id, 'resolved', 2, 'Driver rerouted, cleared')
    expect(r && r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
    const row = await incidentRow(inc.id)
    expect(row.status === 'resolved' && Number(row.version) === 3, `row ${JSON.stringify(row)}`)
    expect(row.resolution_note === 'Driver rerouted, cleared', `note ${row.resolution_note}`)
  })

  await testCase('T49. open straight to resolved with a note is allowed', async () => {
    const inc = await openIncident(fleetA, jobA1)
    const r = await updateAs(fleetA, inc.id, 'resolved', 1, 'False alarm on GPS')
    expect(r && r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
    expect((await incidentRow(inc.id)).status === 'resolved', 'status not resolved')
  })

  await testCase('T50. resolving without a note, or with a note of 2 or 501 characters, is refused with note_required', async () => {
    await gather([
      ['null note', async () => {
        const inc = await openIncident(dispatcherA, jobA1)
        await expectRefusal(updateAs(dispatcherA, inc.id, 'resolved', 1, null), ['note_required'])
      }],
      ['2 chars', async () => {
        const inc = await openIncident(dispatcherA, jobA1)
        await expectRefusal(updateAs(dispatcherA, inc.id, 'resolved', 1, 'ab'), ['note_required'])
      }],
      ['501 chars', async () => {
        const inc = await openIncident(dispatcherA, jobA1)
        await expectRefusal(updateAs(dispatcherA, inc.id, 'resolved', 1, 'n'.repeat(501)), ['note_required'])
      }],
    ])
  })

  await testCase('T51. a note of exactly 3 and exactly 500 characters is accepted for resolution', async () => {
    await gather([
      ['3 chars', async () => {
        const inc = await openIncident(dispatcherA, jobA1)
        expect((await updateAs(dispatcherA, inc.id, 'resolved', 1, 'abc')).ok === true, 'refused')
      }],
      ['500 chars', async () => {
        const inc = await openIncident(dispatcherA, jobA1)
        expect((await updateAs(dispatcherA, inc.id, 'resolved', 1, 'n'.repeat(500))).ok === true, 'refused')
      }],
    ])
  })

  await testCase('T52. a resolved incident is terminal: moving it to acknowledged is refused with illegal_transition', async () => {
    const inc = await openIncident(dispatcherA, jobA1)
    expect((await updateAs(dispatcherA, inc.id, 'resolved', 1, 'closed out')).ok === true, 'resolve refused')
    await expectRefusal(updateAs(dispatcherA, inc.id, 'acknowledged', 2, null), ['illegal_transition'])
    expect((await incidentRow(inc.id)).status === 'resolved', 'resolved incident was reopened')
  })

  await testCase('T53. a stale expected version is refused with version_conflict and the row is unchanged', async () => {
    const inc = await openIncident(dispatcherA, jobA1)
    await expectRefusal(updateAs(dispatcherA, inc.id, 'acknowledged', 7, null), ['version_conflict'])
    const row = await incidentRow(inc.id)
    expect(row.status === 'open' && Number(row.version) === 1, `row ${JSON.stringify(row)}`)
  })

  await testCase('T54. the owner of another agency cannot update this agency incident', async () => {
    const inc = await openIncident(dispatcherA, jobA1)
    expect(await refusedOrNotOk(updateAs(ownerB, inc.id, 'acknowledged', 1, null)), 'the foreign owner updated the incident')
    const row = await incidentRow(inc.id)
    expect(row.status === 'open' && Number(row.version) === 1, `row changed: ${JSON.stringify(row)}`)
  })

  await testCase('T55. dispatcher acknowledges an incident of his agency: ok', async () => {
    const inc = await openIncident(fleetA, jobA1)
    const r = await updateAs(dispatcherA, inc.id, 'acknowledged', 1, null)
    expect(r && r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
  })

  // =========================================================================
  // R. Reads: RLS on the tables
  // =========================================================================
  await testCase('T56. viewer and finance read every incident of their agency', async () => {
    await requireTable('agency_incidents')
    await openIncident(dispatcherA, jobA1)
    const total = (await suOne(`SELECT count(*)::int AS n FROM public.agency_incidents WHERE agency_id = $1`, [agencyA])).n
    expect(total >= 1, 'precondition: no incidents for agency A')
    const viewerSees = await visibleCount(viewerA, 'agency_incidents', agencyA)
    const financeSees = await visibleCount(financeA, 'agency_incidents', agencyA)
    expect(viewerSees === total && financeSees === total, `viewer ${viewerSees}, finance ${financeSees}, expected ${total}`)
  })

  await testCase('T57. the other agency owner and the suspended-agency staff read no incidents of agency A', async () => {
    await requireTable('agency_incidents')
    await openIncident(dispatcherA, jobA1)
    expectNoRowsVisible(await visibleCount(ownerB, 'agency_incidents', agencyA), 'owner B')
    expectNoRowsVisible(await visibleCount(staffS, 'agency_incidents', agencyA), 'suspended staff S')
    expectNoRowsVisible(await visibleCount(revokedA, 'agency_incidents', agencyA), 'revoked member of A')
  })

  await testCase('T58. the assigned driver reads no incidents of his job through the table', async () => {
    await requireTable('agency_incidents')
    await openIncident(dispatcherA, jobA1)
    const n = await asActor(driverUserA1, async () =>
      (await db.query(`SELECT count(*)::int AS n FROM public.agency_incidents WHERE agency_id = $1`, [agencyA])).rows[0].n
    )
    expectNoRowsVisible(n, 'driver A1')
  })

  // =========================================================================
  // L. agency_trip_live
  // =========================================================================
  await testCase('T59. trip live for the owner returns ok, ping_count, last_ping and open_incidents', async () => {
    await requireFunction('agency_trip_live')
    await requireFunction('agency_incident_open')
    await requireFunction('tracking_ping_record')
    // Fresh job so no earlier case's pings or incidents leak into the expected counts.
    const jobLive = await seedJob(agencyA, 'accepted', driverA1, 'live59')
    const latest = hoursAgoIso(0.5)
    await goodPing(driverUserA1, jobLive, 'live-1')
    await goodPing(driverUserA1, jobLive, 'live-2')
    expect((await pingAs(driverUserA1, jobLive, 10, 10, 10, latest)).ok === true, 'latest ping refused')
    const openInc = await openIncident(dispatcherA, jobLive)
    const resolvedInc = await openIncident(dispatcherA, jobLive)
    expect((await updateAs(dispatcherA, resolvedInc.id, 'resolved', 1, 'handled')).ok === true, 'resolve refused')
    const r = await liveAs(ownerA, jobLive)
    expect(r && r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
    expect(Number(r.ping_count) === 3, `ping_count ${r.ping_count}, expected 3`)
    expect(Number(r.open_incidents) === 1, `open_incidents ${r.open_incidents}, expected 1 (the unresolved one ${openInc.id})`)
    const lp = typeof r.last_ping === 'string' ? r.last_ping : r.last_ping && r.last_ping.recorded_at
    expect(lp && Date.parse(lp) === Date.parse(latest), `last_ping ${JSON.stringify(r.last_ping)}, expected ${latest}`)
  })

  await testCase('T60. viewer and finance can read trip live for their agency', async () => {
    await requireFunction('agency_trip_live')
    const v = await liveAs(viewerA, jobA2)
    const f = await liveAs(financeA, jobA2)
    expect(v && v.ok === true, `viewer ${JSON.stringify(v)}`)
    expect(f && f.ok === true, `finance ${JSON.stringify(f)}`)
  })

  await testCase('T61. a job with no pings reports ping_count 0 and last_ping null', async () => {
    await requireFunction('agency_trip_live')
    // Fresh job: jobA2 receives a null-driver ping in T09, so it cannot be the zero-ping fixture.
    const jobEmpty = await seedJob(agencyA, 'accepted', null, 'empty61')
    const r = await liveAs(dispatcherA, jobEmpty)
    expect(r && r.ok === true && Number(r.ping_count) === 0 && r.last_ping === null, `got ${JSON.stringify(r)}`)
  })

  await testCase('T62. trip live of another agency job is refused with not_found', async () => {
    await requireFunction('agency_trip_live')
    await expectRefusal(liveAs(ownerB, jobA1), ['not_found'])
  })

  await testCase('T63. trip live is refused for staff of a suspended agency, for a revoked member and for a user with no agency', async () => {
    await requireFunction('agency_trip_live')
    await gather([
      ['suspended staff', async () => expectRefusal(liveAs(staffS, jobS), [SUSPENDED_MSG, 'approval', 'not_found'])],
      ['revoked member', async () => expect(await refusedOrNotOk(liveAs(revokedA, jobA1)), 'revoked member read the trip')],
      ['no agency', async () => expect(await refusedOrNotOk(liveAs(noAgency, jobA1)), 'no-agency user read the trip')],
    ])
  })

  // =========================================================================
  // Review hardening (T64+)
  // =========================================================================
  await testCase('T64. the rate guard counts server created_at only: 120 fresh rows with old recorded_at still refuse a new ping', async () => {
    await requireFunction('tracking_ping_record')
    const job = await seedJob(agencyA, 'accepted', driverA1, 'rate64')
    await su(
      `INSERT INTO public.agency_tracking_pings (agency_id, job_id, driver_id, recorded_at, lat, lng, speed_kmph)
       SELECT $1, $2, $3, now() - interval '20 hours' + g * interval '10 seconds', 10, 10, 10 FROM generate_series(1, 120) g`,
      [agencyA, job, driverA1]
    )
    await expectRefusal(pingAs(driverUserA1, job, 10, 10, 10, pastIso()), ['rate_limited'])
  })

  await testCase('T65. a job at the hard per-job cap refuses further pings with ping_cap_reached', async () => {
    await requireFunction('tracking_ping_record')
    const job = await seedJob(agencyA, 'accepted', driverA1, 'cap65')
    await su(
      `INSERT INTO public.agency_tracking_pings (agency_id, job_id, driver_id, recorded_at, lat, lng, speed_kmph, created_at)
       SELECT $1, $2, $3, now() - interval '23 hours' + g * interval '1 second', 10, 10, 10, now() - interval '3 days'
       FROM generate_series(1, 20000) g`,
      [agencyA, job, driverA1]
    )
    await expectRefusal(pingAs(driverUserA1, job, 10, 10, 10, pastIso()), ['ping_cap_reached'])
  })

  await testCase('T66. two distinct recorded_at values less than 2 seconds apart are refused with too_frequent; 3 seconds apart is accepted', async () => {
    await requireFunction('tracking_ping_record')
    const job = await seedJob(agencyA, 'accepted', driverA1, 'freq66')
    const t0 = Date.now() - 3 * 60 * 60e3
    expect((await pingAs(driverUserA1, job, 10, 10, 10, new Date(t0).toISOString())).ok === true, 'first ping refused')
    await expectRefusal(pingAs(driverUserA1, job, 10, 10, 10, new Date(t0 + 1000).toISOString()), ['too_frequent'])
    await expectRefusal(pingAs(driverUserA1, job, 10, 10, 10, new Date(t0 - 1500).toISOString()), ['too_frequent'])
    expect((await pingAs(driverUserA1, job, 10, 10, 10, new Date(t0 + 3000).toISOString())).ok === true, '3s later refused')
  })

  await testCase('T67. the same recorded_at with different coordinates is refused with ping_conflict and stores nothing new', async () => {
    await requireFunction('tracking_ping_record')
    const job = await seedJob(agencyA, 'accepted', driverA1, 'conf67')
    const ts = pastIso()
    expect((await pingAs(driverUserA1, job, 20.5, 70.5, 10, ts)).ok === true, 'first ping refused')
    await expectRefusal(pingAs(driverUserA1, job, 21.5, 70.5, 10, ts), ['ping_conflict'])
    const again = await pingAs(driverUserA1, job, 20.5, 70.5, 10, ts)
    expect(again.ok === true && again.replay === true, `exact resend not a replay: ${JSON.stringify(again)}`)
    expect((await pingCount(job)) === 1, 'more than one row stored')
  })

  await testCase('T68. a reused dedupe_key for another job or kind is refused with idempotency_key_reused; same job and kind replays', async () => {
    await requireFunction('agency_incident_open')
    const key = nx('reuse68')
    const first = await openAs(dispatcherA, jobA1, 'overspeed', { a: 1 }, key)
    expect(first.ok === true, `open refused: ${JSON.stringify(first)}`)
    await expectRefusal(openAs(dispatcherA, jobA2, 'overspeed', { a: 1 }, key), ['idempotency_key_reused'])
    await expectRefusal(openAs(dispatcherA, jobA1, 'breakdown', { a: 1 }, key), ['idempotency_key_reused'])
    const same = await openAs(dispatcherA, jobA1, 'overspeed', { a: 1 }, key)
    expect(same.ok === true && same.replay === true && same.incident_id === first.incident_id, `replay mismatch ${JSON.stringify(same)}`)
  })

  await testCase('T69. a dedupe_key of 200 characters is accepted and 201 is refused with dedupe_key_too_long', async () => {
    await requireFunction('agency_incident_open')
    const ok200 = await openAs(dispatcherA, jobA1, 'other', {}, 'k'.repeat(200))
    expect(ok200.ok === true, `200 chars refused: ${JSON.stringify(ok200)}`)
    await expectRefusal(openAs(dispatcherA, jobA1, 'other', {}, 'k'.repeat(201)), ['dedupe_key_too_long'])
  })

  await testCase('T70. the 51st open incident of one job is refused with too_many_open_incidents; resolving one frees a slot', async () => {
    await requireFunction('agency_incident_open')
    const job = await seedJob(agencyA, 'accepted', driverA1, 'inc70')
    const ids = []
    for (let i = 0; i < 50; i++) {
      const r = await openAs(dispatcherA, job, 'other', {}, nx('lim70'))
      expect(r.ok === true, `incident ${i + 1} of 50 refused: ${JSON.stringify(r)}`)
      ids.push(r.incident_id)
    }
    await expectRefusal(openAs(dispatcherA, job, 'other', {}, nx('lim70')), ['too_many_open_incidents'])
    expect((await updateAs(dispatcherA, ids[0], 'resolved', 1, 'handled')).ok === true, 'resolve refused')
    expect((await openAs(dispatcherA, job, 'other', {}, nx('lim70'))).ok === true, 'slot not freed after resolve')
  })

  await testCase('T71. pings are append-only for every role, service_role and superuser included', async () => {
    await requireTable('agency_tracking_pings')
    const r = await goodPing(driverUserA1, jobALive, 'immutable71')
    await gather([
      ['superuser update', async () => expectRaises(su(`UPDATE public.agency_tracking_pings SET lat = 1 WHERE id = $1`, [r.ping_id]), 'append-only')],
      ['superuser delete', async () => expectRaises(su(`DELETE FROM public.agency_tracking_pings WHERE id = $1`, [r.ping_id]), 'append-only')],
      ['service_role update', async () => {
        await actAsService()
        await db.query(`SET ROLE service_role`)
        try {
          await expectRaises(db.query(`UPDATE public.agency_tracking_pings SET speed_kmph = 1 WHERE id = $1`, [r.ping_id]), 'append-only')
        } finally {
          await db.query(`RESET ROLE`)
        }
      }],
    ])
    expect((await pingCount(jobALive)) >= 1, 'ping vanished')
  })

  await testCase('T72. pings still cascade-delete with their job', async () => {
    await requireTable('agency_tracking_pings')
    const job = await seedJob(agencyA, 'accepted', driverA1, 'casc72')
    await goodPing(driverUserA1, job, 'casc72')
    await su(`DELETE FROM public.agency_jobs WHERE id = $1`, [job])
    expect((await pingCount(job)) === 0, 'pings survived their job')
  })

  await testCase('T73. incidents allow only status, version and resolution_note to change; delete is refused; the command still works', async () => {
    await requireTable('agency_incidents')
    const inc = await openIncident(dispatcherA, jobA1, 'other', nx('imm73'))
    await gather([
      ['kind change', async () => expectRaises(su(`UPDATE public.agency_incidents SET kind = 'accident' WHERE id = $1`, [inc.id]), 'only status')],
      ['details change', async () => expectRaises(su(`UPDATE public.agency_incidents SET details = '{"x":1}' WHERE id = $1`, [inc.id]), 'only status')],
      ['job change', async () => expectRaises(su(`UPDATE public.agency_incidents SET job_id = $2 WHERE id = $1`, [inc.id, jobA2]), 'only status')],
      ['delete', async () => expectRaises(su(`DELETE FROM public.agency_incidents WHERE id = $1`, [inc.id]), 'cannot be deleted')],
      ['command', async () => expect((await updateAs(dispatcherA, inc.id, 'acknowledged', 1, null)).ok === true, 'update command refused')],
    ])
  })

  await testCase('T74. a user with two driver rows can ping as the assigned (not the oldest) driver row', async () => {
    await requireFunction('tracking_ping_record')
    const u = await createUser('at-driver-two')
    const first = await createDriver(u, 'Two first')
    const second = await createDriver(u, 'Two second')
    await employ(agencyA, second)
    const job = await seedJob(agencyA, 'accepted', second, 'two74')
    const r = await pingAs(u, job, 12, 12, 12, pastIso())
    expect(r && r.ok === true, `refused: ${JSON.stringify(r)} (oldest driver row ${first})`)
    const row = await suOne(`SELECT driver_id FROM public.agency_tracking_pings WHERE id = $1`, [r.ping_id])
    expect(row.driver_id === second, 'ping stored under the wrong driver row')
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  if (failed.length) {
    console.log('First failing cases:')
    for (const f of failed.slice(0, 10)) console.log(`  - ${f.name}`)
  }
  console.log(`\n${passed}/${results.length} cases passed`)
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
