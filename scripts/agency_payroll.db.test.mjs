#!/usr/bin/env node
/**
 * Agency driver payroll (TO-150) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the commands the way PostgREST
 * does per request: `SET ROLE authenticated` with `request.jwt.claims` set to
 * the caller's sub.
 *
 * Pinned contract under test. The migration that implements it is NOT written
 * yet (it will be supabase/migrations/20261023000000_agency_payroll.sql, created
 * by another writer), so every case that needs the new tables or commands is
 * EXPECTED to fail now. P01 states the missing file explicitly.
 *
 *   Tables (RLS on, no direct write privileges for authenticated, integer paise):
 *     agency_payroll_periods(id, agency_id, period_start date, period_end date,
 *       status 'open'|'closed', closed_at, closed_by, version int, idempotency_key)
 *       UNIQUE (agency_id, period_start, period_end), UNIQUE (agency_id, idempotency_key),
 *       CHECK (period_end >= period_start)
 *     agency_payroll_lines(id, period_id, agency_id, driver_id, base_paise, trips_paise,
 *       advances_paise, deductions_paise, net_paise, shortfall_paise, carried_in_paise,
 *       trip_count)  UNIQUE (period_id, driver_id)
 *     agency_driver_rates(agency_id, driver_id, base_paise, per_km_paise, per_tonne_paise,
 *       version)  PRIMARY KEY (agency_id, driver_id)
 *     agency_payroll_adjustments(id, period_id, agency_id, driver_id, kind 'advance'|'deduction',
 *       amount_paise > 0, reason)
 *   RLS reads: finance scope and owner only (dispatcher, fleet_manager, viewer denied: payroll
 *     is confidential). Other agency denied. A driver reads ONLY their own lines.
 *     anon reads nothing.
 *
 *   public.agency_driver_rate_set(p_driver_id uuid, p_base_paise bigint, p_per_km_paise bigint,
 *     p_per_tonne_paise bigint, p_expected_version int) RETURNS jsonb
 *   public.agency_payroll_adjust(p_period_id uuid, p_driver_id uuid, p_kind text,
 *     p_amount_paise bigint, p_reason text) RETURNS jsonb
 *   public.agency_payroll_close_period(p_period_start date, p_period_end date,
 *     p_idempotency_key text) RETURNS jsonb
 *   public.agency_payroll_my_lines() RETURNS jsonb
 *     - All SECURITY DEFINER, pinned search_path, NO agency id argument, agency from
 *       auth.uid(). Scope 'finance' (owner always) for rate_set, adjust and close.
 *       EXECUTE for authenticated and service_role only.
 *     - Caller refusals (RAISE EXCEPTION, message text pinned to the template):
 *       'Your access scope does not allow this action.', 'No agency profile found for this
 *       account.', 'Agency approval is required.'
 *     - Business refusals are read as {ok:false,error:CODE} OR as a raised message containing
 *       CODE. Codes: 'driver_not_employed', 'invalid_rate', 'version_conflict', 'period_closed',
 *       'already_closed', 'idempotency_key_reused', 'period_too_long', 'period_not_finished',
 *       'period_overlap'.
 *     - Success results carry ok:true. Close returns period_id and replay (boolean).
 *       Rate set returns version.
 *
 *   Calculation (the pinned rule this battery checks):
 *     Completed job = agency_jobs.status 'delivered' with completed_at inside the period
 *     (inclusive, by the date of completed_at). Tonnes per trip = floor((weight_kg + 500) / 1000)
 *     (half-up, whole tonnes). trips_paise = sum over trips of distance_km * per_km_paise +
 *     tonnes * per_tonne_paise. base_paise = the rate base, once per period, always.
 *     earnings = base + trips. net = max(0, earnings - advances - deductions).
 *     shortfall = max(0, advances + deductions - earnings). The shortfall of a closed period is
 *     the carried_in_paise of that driver's line in the NEXT closed period.
 *
 *   Open periods: a period is created open (service role / ops, or the seeded fixture below).
 *     Adjustments are accepted only while open. Closing an open period with the same
 *     idempotency key and dates closes it (replay false). Closing with the same key and dates
 *     after it is closed returns replay true and the same period id. A different key on a
 *     period already closed for the same dates is 'already_closed'.
 *
 *   Schema assumption (flagged for the implementer): agency_jobs today has NO distance,
 *     weight or completion-date column (status and updated_at only). The migration must add
 *     agency_jobs.distance_km numeric, agency_jobs.weight_kg numeric and
 *     agency_jobs.completed_at timestamptz. P25 pins this and every fixture job depends on it.
 *
 *   Open question flagged, NOT pinned: the brief's net formula does not mention carried_in.
 *     This battery pins carried_in_paise and shortfall_paise only, never net for a line that
 *     has carried_in_paise > 0.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST / GoTrue
 * behaviour is NOT covered. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_payroll.db.test.mjs   (from the repo root)
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
const PAYROLL_MIGRATION = '20261023000000_agency_payroll.sql'

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

const num = (x) => Number(x)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const SCOPE_MSG = 'Your access scope does not allow this action.'
const APPROVAL_MSG = 'Agency approval is required.'
const NO_PROFILE_MSG = 'No agency profile found for this account.'

const PAY_TABLES = ['agency_payroll_periods', 'agency_payroll_lines', 'agency_driver_rates', 'agency_payroll_adjustments']
const RATE_SIG = 'p_driver_id uuid, p_base_paise bigint, p_per_km_paise bigint, p_per_tonne_paise bigint, p_expected_version integer'
const ADJUST_SIG = 'p_period_id uuid, p_driver_id uuid, p_kind text, p_amount_paise bigint, p_reason text'
const CLOSE_SIG = 'p_period_start date, p_period_end date, p_idempotency_key text'

const P1 = { start: '2026-10-01', end: '2026-10-31' }
const P2 = { start: '2026-11-01', end: '2026-11-10' }
const P3 = { start: '2026-11-11', end: '2026-11-15' }
const LONG = { start: '2025-01-01', end: '2025-05-01' } // 121 days
const FUTURE = { start: '2026-11-20', end: '2026-12-31' } // ends after today
const OVERLAP = { start: '2026-10-15', end: '2026-10-20' } // inside P1
const REUSED = { start: '2026-09-01', end: '2026-09-10' } // free dates, reused key

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
const migrationErrors = {}

async function applyMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sqlText)
    } catch (error) {
      // Recorded, not thrown: a broken payroll file must show up as its own FAIL, not abort the run.
      migrationErrors[file] = firstLine(error)
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

// ---------------------------------------------------------------------------
// Fixtures (superuser). Users, agencies, staff, drivers and employment first;
// completed jobs second (they need the agency_jobs columns the migration adds).
// ---------------------------------------------------------------------------
let agencyA, agencyB, agencyC
let ownerA, ownerB, ownerC, noAgency
let dispatcherA, fleetA, financeA, viewerA, financeC
let driverD1, driverD2, driverD3, driverUnemp, driverEnded, driverB1, driverUserD1
let fixtureError = null
let jobsError = null
let scenarioError = null
let closeError = null
const S = {}

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

async function seedStaff(agencyId, tag, scope, status = 'active') {
  const userId = await createUser(tag)
  await su(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [uid(), agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
}

async function createDriver(tag, status = 'approved', userId = null) {
  const id = uid()
  await su(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, pan_number)
     VALUES ($1, $2, $3, $4, 'tata_407', $5, $6)`,
    [id, userId, `${tag} Driver`, `9000${String(seq).padStart(6, '0')}`, status, `PAYDR${String(1000 + seq).padStart(4, '0')}Q`]
  )
  return id
}

async function employDriver(agencyId, driverId, status = 'active') {
  await su(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, $4)`,
    [uid(), agencyId, driverId, status]
  )
}

async function buildFixtures() {
  ownerA = await createUser('pay-owner-a')
  agencyA = await createAgencyRow(ownerA, 'Payroll A', 'approved')
  ownerB = await createUser('pay-owner-b')
  agencyB = await createAgencyRow(ownerB, 'Payroll B', 'approved')
  ownerC = await createUser('pay-owner-c')
  agencyC = await createAgencyRow(ownerC, 'Payroll C', 'pending')

  dispatcherA = await seedStaff(agencyA, 'pay-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'pay-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'pay-finance', 'finance')
  viewerA = await seedStaff(agencyA, 'pay-viewer', 'viewer')
  financeC = await seedStaff(agencyC, 'pay-finance-c', 'finance')
  noAgency = await createUser('pay-no-agency')

  driverUserD1 = await createUser('pay-driver-d1')
  driverD1 = await createDriver('pay-d1', 'approved', driverUserD1)
  driverD2 = await createDriver('pay-d2')
  driverD3 = await createDriver('pay-d3')
  driverUnemp = await createDriver('pay-unemployed')
  driverEnded = await createDriver('pay-ended')
  driverB1 = await createDriver('pay-b1')

  await employDriver(agencyA, driverD1)
  await employDriver(agencyA, driverD2)
  await employDriver(agencyA, driverD3)
  await employDriver(agencyA, driverEnded, 'ended')
  await employDriver(agencyB, driverB1)
}

async function seedJob(agencyId, driverId, status, completedAt, distanceKm, weightKg) {
  const shipmentRowId = uid()
  await su(
    `INSERT INTO public.shipments (id, shipment_id, origin, destination, total_weight)
     VALUES ($1, $2, 'Pune', 'Mumbai', $3)`,
    [shipmentRowId, nx('PAY-SHP'), weightKg]
  )
  await su(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, driver_id, status, distance_km, weight_kg, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [uid(), agencyId, shipmentRowId, driverId, status, distanceKm, weightKg, completedAt]
  )
}

async function buildJobs() {
  // Agency A, driver D1: two completed trips inside P1, one before P1, one still in transit,
  // one cancelled, one completed in P2 (2600 kg = 3 tonnes), one completed in P3.
  await seedJob(agencyA, driverD1, 'delivered', '2026-10-05T10:00:00Z', 100, 1500)
  await seedJob(agencyA, driverD1, 'delivered', '2026-10-20T10:00:00Z', 50, 400)
  await seedJob(agencyA, driverD1, 'delivered', '2026-09-30T12:00:00Z', 999, 9000)
  await seedJob(agencyA, driverD1, 'in_transit', null, 77, 1000)
  await seedJob(agencyA, driverD1, 'cancelled', '2026-10-12T10:00:00Z', 30, 1000)
  await seedJob(agencyA, driverD1, 'delivered', '2026-11-03T10:00:00Z', 10, 2600)
  await seedJob(agencyA, driverD1, 'delivered', '2026-11-12T10:00:00Z', 5, 0)
  // Agency A, driver D3: one 20 km trip inside P1.
  await seedJob(agencyA, driverD3, 'delivered', '2026-10-15T10:00:00Z', 20, 0)
  // Agency B, driver B1: the same two P1 trips as D1, plus one outside P1.
  await seedJob(agencyB, driverB1, 'delivered', '2026-10-05T10:00:00Z', 100, 1500)
  await seedJob(agencyB, driverB1, 'delivered', '2026-10-20T10:00:00Z', 50, 400)
  await seedJob(agencyB, driverB1, 'delivered', '2026-09-30T12:00:00Z', 999, 9000)
}

// ---------------------------------------------------------------------------
// Command wrappers and helpers
// ---------------------------------------------------------------------------
async function rateSetAs(userId, driverId, base, perKm, perTonne, expected) {
  return asActor(userId, async () =>
    parseJson(
      (
        await db.query(
          `SELECT public.agency_driver_rate_set($1::uuid, $2::bigint, $3::bigint, $4::bigint, $5::int) AS r`,
          [driverId, base, perKm, perTonne, expected]
        )
      ).rows[0].r
    )
  )
}

async function adjustAs(userId, periodId, driverId, kind, amount, reason) {
  return asActor(userId, async () =>
    parseJson(
      (
        await db.query(`SELECT public.agency_payroll_adjust($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text) AS r`, [
          periodId,
          driverId,
          kind,
          amount,
          reason,
        ])
      ).rows[0].r
    )
  )
}

async function closeAs(userId, start, end, key) {
  return asActor(userId, async () =>
    parseJson(
      (await db.query(`SELECT public.agency_payroll_close_period($1::date, $2::date, $3::text) AS r`, [start, end, key])).rows[0].r
    )
  )
}

async function myLinesAs(userId) {
  return asActor(userId, async () =>
    parseJson((await db.query(`SELECT public.agency_payroll_my_lines() AS r`)).rows[0].r)
  )
}

/** Business refusal code: {ok:false,error} or a raised message. 'ok' when accepted. */
async function outcomeOf(run) {
  try {
    const r = await run()
    if (r && r.ok === false) return String(r.error)
    if (r && r.ok === true) return 'ok'
    return `unexpected: ${JSON.stringify(r)}`
  } catch (error) {
    return firstLine(error)
  }
}

function expectCode(got, want, label) {
  expect(got.includes(want), `${label}: expected "${want}", got "${got.slice(0, 160)}"`)
}

function expectRefused(got, label) {
  expect(got !== 'ok' && !got.startsWith('unexpected'), `${label}: expected a refusal, got "${got.slice(0, 160)}"`)
}

function must(r, label) {
  if (!r || r.ok !== true) throw new Error(`${label} refused: ${JSON.stringify(r)}`)
  return r
}

async function seedOpenPeriod(agencyId, start, end, key) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_payroll_periods (id, agency_id, period_start, period_end, status, version, idempotency_key)
     VALUES ($1, $2, $3, $4, 'open', 1, $5)`,
    [id, agencyId, start, end, key]
  )
  return id
}

async function lineOf(periodId, driverId) {
  return suOne(`SELECT * FROM public.agency_payroll_lines WHERE period_id = $1 AND driver_id = $2`, [periodId, driverId])
}

async function rateRow(agencyId, driverId) {
  return suOne(`SELECT * FROM public.agency_driver_rates WHERE agency_id = $1 AND driver_id = $2`, [agencyId, driverId])
}

async function currentRateVersion(agencyId, driverId) {
  const row = await rateRow(agencyId, driverId)
  return row ? num(row.version) : 0
}

async function countAs(userId, sql, params = []) {
  return asActor(userId, async () => num((await db.query(sql, params)).rows[0].n))
}

async function countAnon(sql) {
  try {
    return num((await asAnon(sql)).rows[0].n)
  } catch {
    return 0
  }
}

async function missingColumns(table, cols) {
  const have = (await su(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])).rows.map((r) => r.column_name)
  return cols.filter((c) => !have.includes(c))
}

/** Normalised constraint definitions (contype + definition, whitespace removed, lower-case). */
async function constraintDefs(table) {
  return (
    await su(`SELECT contype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass`, [`public.${table}`])
  ).rows.map((r) => ({ type: r.contype, def: r.def.replace(/\s+/g, '').toLowerCase() }))
}

/** Normalised unique index definitions (covers unique constraints and primary keys). */
async function uniqueIndexDefs(table) {
  return (
    await su(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1`, [table])
  ).rows
    .filter((r) => /CREATE UNIQUE INDEX/i.test(r.indexdef))
    .map((r) => r.indexdef.replace(/\s+/g, '').toLowerCase())
}

/** Privilege failures for one table: anon must hold nothing, authenticated no writes. */
async function privilegeRow(table) {
  return suOne(
    `SELECT has_table_privilege('anon', $1, 'SELECT') AS anon_s,
            has_table_privilege('anon', $1, 'INSERT') AS anon_i,
            has_table_privilege('anon', $1, 'UPDATE') AS anon_u,
            has_table_privilege('anon', $1, 'DELETE') AS anon_d,
            has_table_privilege('authenticated', $1, 'INSERT') AS auth_i,
            has_table_privilege('authenticated', $1, 'UPDATE') AS auth_u,
            has_table_privilege('authenticated', $1, 'DELETE') AS auth_d`,
    [`public.${table}`]
  )
}

/** EXECUTE grants for one RPC: authenticated and service_role yes, anon and PUBLIC no. */
async function rpcGrantFailures(sig) {
  const name = sig.split('.')[1].split('(')[0]
  const p = await suOne(
    `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_ok,
            has_function_privilege('service_role', $1, 'EXECUTE') AS svc_ok,
            has_function_privilege('anon', $1, 'EXECUTE') AS anon_ok`,
    [sig]
  )
  const grantees = (
    await su(
      `SELECT grantee FROM information_schema.routine_privileges
        WHERE routine_schema = 'public' AND routine_name = $1 AND privilege_type = 'EXECUTE'`,
      [name]
    )
  ).rows.map((r) => r.grantee)
  const failures = []
  if (p.auth_ok !== true) failures.push('authenticated cannot EXECUTE')
  if (p.svc_ok !== true) failures.push('service_role cannot EXECUTE')
  if (p.anon_ok !== false) failures.push('anon can EXECUTE')
  if (grantees.includes('PUBLIC')) failures.push('PUBLIC has EXECUTE')
  return failures
}

/** Signature, return type, SECURITY DEFINER and pinned search_path for one RPC. */
async function rpcDefinitionFailures(name, expectedArgs) {
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
  if (res !== 'jsonb') failures.push(`return type ${res}`)
  if (prosecdef !== true) failures.push('not SECURITY DEFINER')
  if (!/search_path=public/.test((proconfig || []).join(','))) failures.push(`search_path not pinned (${(proconfig || []).join(',') || 'none'})`)
  return failures
}

// ---------------------------------------------------------------------------
// Scenario (superuser seeds the two open periods, then the commands run as owners)
// ---------------------------------------------------------------------------
async function runScenario() {
  try {
    S.rateD1 = must(await rateSetAs(ownerA, driverD1, 100000, 1500, 2000, 0), 'rate D1')
    S.rateD2 = must(await rateSetAs(ownerA, driverD2, 0, 1000, 0, 0), 'rate D2')
    S.rateD3 = must(await rateSetAs(ownerA, driverD3, 0, 1000, 0, 0), 'rate D3')
    S.rateB1 = must(await rateSetAs(ownerB, driverB1, 100000, 1500, 2000, 0), 'rate B1')

    S.p1A = await seedOpenPeriod(agencyA, P1.start, P1.end, 'pay-P1')
    S.p2A = await seedOpenPeriod(agencyA, P2.start, P2.end, 'pay-P2')
    S.p1B = await seedOpenPeriod(agencyB, P1.start, P1.end, 'pay-P1')

    S.adjD1Adv = must(await adjustAs(ownerA, S.p1A, driverD1, 'advance', 50000, 'October fuel advance'), 'advance D1')
    S.adjD1Ded = must(await adjustAs(ownerA, S.p1A, driverD1, 'deduction', 20000, 'Damaged pallet recovery'), 'deduction D1')
    S.adjD2Adv = must(await adjustAs(ownerA, S.p1A, driverD2, 'advance', 30000, 'Advance against October pay'), 'advance D2')
    S.adjB1Adv = must(await adjustAs(ownerB, S.p1B, driverB1, 'advance', 50000, 'October fuel advance'), 'advance B1')
    S.adjB1Ded = must(await adjustAs(ownerB, S.p1B, driverB1, 'deduction', 20000, 'Damaged pallet recovery'), 'deduction B1')
  } catch (error) {
    scenarioError = firstLine(error)
  }
  await runCloses()
}

/** Closes need completed jobs (agency_jobs columns); they are kept apart so rate and adjust cases still run. */
async function runCloses() {
  if (scenarioError) return
  if (jobsError) {
    closeError = `jobs not established: ${jobsError}`
    return
  }
  try {
    S.closeP1A = must(await closeAs(ownerA, P1.start, P1.end, 'pay-P1'), 'close P1 agency A')
    S.closeP1B = must(await closeAs(ownerB, P1.start, P1.end, 'pay-P1'), 'close P1 agency B')
    S.closeP2A = must(await closeAs(ownerA, P2.start, P2.end, 'pay-P2'), 'close P2 agency A')
    S.closeP3A = must(await closeAs(ownerA, P3.start, P3.end, 'pay-P3'), 'close P3 agency A')
  } catch (error) {
    closeError = firstLine(error)
  }
}

function requireFixtures() {
  if (fixtureError) throw new Error(`fixtures not established: ${fixtureError}`)
}

function requireScenario() {
  requireFixtures()
  if (scenarioError) throw new Error(`scenario not established: ${scenarioError}`)
}

function requireClosed() {
  requireScenario()
  if (closeError) throw new Error(`closes not established: ${closeError}`)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  const last = applied[applied.length - 1]

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations applied: ${applied.length} (last=${last})`)

  try {
    await buildFixtures()
  } catch (error) {
    fixtureError = firstLine(error)
  }
  if (!fixtureError) {
    try {
      await buildJobs()
    } catch (error) {
      jobsError = firstLine(error)
    }
  }
  if (fixtureError) {
    scenarioError = 'skipped (fixtures not established)'
  } else {
    await runScenario()
  }

  // =========================================================================
  // P01-P25. Migration file, schema, RLS, privileges and signatures (no scenario needed)
  // =========================================================================
  await testCase('P01. migration 20261023000000_agency_payroll.sql exists and applies cleanly', async () => {
    expect(existsSync(join(MIGRATIONS_DIR, PAYROLL_MIGRATION)), `missing supabase/migrations/${PAYROLL_MIGRATION}`)
    expect(!migrationErrors[PAYROLL_MIGRATION], `apply failed: ${migrationErrors[PAYROLL_MIGRATION]}`)
  })

  await testCase('P02. the four payroll tables exist in public', async () => {
    const rows = (
      await su(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [PAY_TABLES])
    ).rows.map((r) => r.table_name)
    const missing = PAY_TABLES.filter((t) => !rows.includes(t))
    expect(missing.length === 0, `missing: ${missing.join(', ')}`)
  })

  await testCase('P03. agency_payroll_periods has every pinned column', async () => {
    const missing = await missingColumns('agency_payroll_periods', [
      'id', 'agency_id', 'period_start', 'period_end', 'status', 'closed_at', 'closed_by', 'version', 'idempotency_key',
    ])
    expect(missing.length === 0, `missing columns: ${missing.join(', ')}`)
  })

  await testCase('P04. agency_payroll_lines has every pinned column', async () => {
    const missing = await missingColumns('agency_payroll_lines', [
      'id', 'period_id', 'agency_id', 'driver_id', 'base_paise', 'trips_paise', 'advances_paise', 'deductions_paise',
      'net_paise', 'shortfall_paise', 'carried_in_paise', 'trip_count',
    ])
    expect(missing.length === 0, `missing columns: ${missing.join(', ')}`)
  })

  await testCase('P05. agency_driver_rates has every pinned column', async () => {
    const missing = await missingColumns('agency_driver_rates', ['agency_id', 'driver_id', 'base_paise', 'per_km_paise', 'per_tonne_paise', 'version'])
    expect(missing.length === 0, `missing columns: ${missing.join(', ')}`)
  })

  await testCase('P06. agency_payroll_adjustments has every pinned column', async () => {
    const missing = await missingColumns('agency_payroll_adjustments', ['id', 'period_id', 'agency_id', 'driver_id', 'kind', 'amount_paise', 'reason'])
    expect(missing.length === 0, `missing columns: ${missing.join(', ')}`)
  })

  await testCase('P07. periods: CHECK period_end >= period_start', async () => {
    const defs = await constraintDefs('agency_payroll_periods')
    expect(defs.some((d) => d.type === 'c' && d.def.includes('period_end>=period_start')), 'no period_end >= period_start check')
  })

  await testCase('P08. periods: UNIQUE (agency_id, period_start, period_end)', async () => {
    const idx = await uniqueIndexDefs('agency_payroll_periods')
    expect(idx.some((d) => d.endsWith('(agency_id,period_start,period_end)')), `no matching unique index (found: ${idx.join(' | ') || 'none'})`)
  })

  await testCase('P09. periods: UNIQUE (agency_id, idempotency_key)', async () => {
    const idx = await uniqueIndexDefs('agency_payroll_periods')
    expect(idx.some((d) => d.endsWith('(agency_id,idempotency_key)')), `no matching unique index (found: ${idx.join(' | ') || 'none'})`)
  })

  await testCase("P10. periods: status limited to 'open' and 'closed'", async () => {
    const defs = await constraintDefs('agency_payroll_periods')
    expect(defs.some((d) => d.type === 'c' && d.def.includes("'open'") && d.def.includes("'closed'")), 'no status check for open/closed')
  })

  await testCase('P11. lines: UNIQUE (period_id, driver_id)', async () => {
    const idx = await uniqueIndexDefs('agency_payroll_lines')
    expect(idx.some((d) => d.endsWith('(period_id,driver_id)')), `no matching unique index (found: ${idx.join(' | ') || 'none'})`)
  })

  await testCase('P12. rates: PRIMARY KEY (agency_id, driver_id)', async () => {
    const idx = await uniqueIndexDefs('agency_driver_rates')
    expect(idx.some((d) => d.endsWith('(agency_id,driver_id)')), `no matching unique index (found: ${idx.join(' | ') || 'none'})`)
  })

  await testCase("P13. adjustments: kind limited to 'advance'|'deduction' and amount_paise > 0", async () => {
    const defs = await constraintDefs('agency_payroll_adjustments')
    const kind = defs.some((d) => d.type === 'c' && d.def.includes("'advance'") && d.def.includes("'deduction'"))
    const amount = defs.some((d) => d.type === 'c' && d.def.includes('amount_paise>0'))
    expect(kind && amount, `kind check ${kind}, amount check ${amount}`)
  })

  await testCase('P14. RLS is enabled on all four payroll tables', async () => {
    const rows = (
      await su(
        `SELECT relname, relrowsecurity FROM pg_class
          WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`,
        [PAY_TABLES]
      )
    ).rows
    const off = PAY_TABLES.filter((t) => !rows.find((r) => r.relname === t && r.relrowsecurity === true))
    expect(off.length === 0, `RLS off or table missing: ${off.join(', ')}`)
  })

  await testCase('P15. anon holds no table privileges on the four payroll tables', async () => {
    const failures = []
    for (const table of PAY_TABLES) {
      const p = await privilegeRow(table)
      if (p.anon_s || p.anon_i || p.anon_u || p.anon_d) failures.push(`${table}: select=${p.anon_s} insert=${p.anon_i} update=${p.anon_u} delete=${p.anon_d}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P16. authenticated holds no direct INSERT, UPDATE or DELETE on the payroll tables', async () => {
    const failures = []
    for (const table of PAY_TABLES) {
      const p = await privilegeRow(table)
      if (p.auth_i || p.auth_u || p.auth_d) failures.push(`${table}: insert=${p.auth_i} update=${p.auth_u} delete=${p.auth_d}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P17. agency_driver_rate_set signature is exact, returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures('agency_driver_rate_set', RATE_SIG)
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P18. agency_payroll_adjust signature is exact, returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures('agency_payroll_adjust', ADJUST_SIG)
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P19. agency_payroll_close_period signature is exact, returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures('agency_payroll_close_period', CLOSE_SIG)
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P20. agency_payroll_my_lines takes no arguments, returns jsonb, SECURITY DEFINER', async () => {
    const failures = await rpcDefinitionFailures('agency_payroll_my_lines', '')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P21. agency_driver_rate_set: EXECUTE for authenticated and service_role only', async () => {
    const failures = await rpcGrantFailures('public.agency_driver_rate_set(uuid,bigint,bigint,bigint,integer)')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P22. agency_payroll_adjust: EXECUTE for authenticated and service_role only', async () => {
    const failures = await rpcGrantFailures('public.agency_payroll_adjust(uuid,uuid,text,bigint,text)')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P23. agency_payroll_close_period: EXECUTE for authenticated and service_role only', async () => {
    const failures = await rpcGrantFailures('public.agency_payroll_close_period(date,date,text)')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P24. agency_payroll_my_lines: EXECUTE for authenticated and service_role only', async () => {
    const failures = await rpcGrantFailures('public.agency_payroll_my_lines()')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('P25. agency_jobs carries distance_km, weight_kg and completed_at (completion source for the calculation)', async () => {
    const missing = await missingColumns('agency_jobs', ['distance_km', 'weight_kg', 'completed_at'])
    expect(missing.length === 0, `missing columns: ${missing.join(', ')}`)
  })

  // =========================================================================
  // P26-P41. agency_driver_rate_set
  // =========================================================================
  await testCase('P26. owner rate_set is accepted for an actively employed driver and returns version 1', async () => {
    requireScenario()
    expect(S.rateD1.ok === true && num(S.rateD1.version) === 1, `got ${JSON.stringify(S.rateD1)}`)
  })

  await testCase('P27. the rate row stores base, per-km and per-tonne rates in agency A only', async () => {
    requireScenario()
    const row = await rateRow(agencyA, driverD1)
    expect(row, 'no rate row for D1 in agency A')
    expect(num(row.base_paise) === 100000 && num(row.per_km_paise) === 1500 && num(row.per_tonne_paise) === 2000 && num(row.version) === 1,
      `row ${JSON.stringify(row)}`)
  })

  await testCase('P28. rate_set with a stale expected_version is refused as version_conflict', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => rateSetAs(ownerA, driverD1, 1, 1, 1, 0)), 'version_conflict', 'stale version')
  })

  await testCase('P29. rate_set with the matching expected_version increments the version', async () => {
    requireScenario()
    const r = await rateSetAs(ownerA, driverD3, 0, 1000, 0, 1)
    expect(r.ok === true && num(r.version) === 2, `got ${JSON.stringify(r)}`)
  })

  await testCase('P30. rate_set refuses a negative base as invalid_rate', async () => {
    requireFixtures()
    const v = await currentRateVersion(agencyA, driverD3)
    expectCode(await outcomeOf(() => rateSetAs(ownerA, driverD3, -1, 1000, 0, v)), 'invalid_rate', 'negative base')
  })

  await testCase('P31. rate_set refuses a negative per-km rate as invalid_rate', async () => {
    requireFixtures()
    const v = await currentRateVersion(agencyA, driverD3)
    expectCode(await outcomeOf(() => rateSetAs(ownerA, driverD3, 0, -5, 0, v)), 'invalid_rate', 'negative per-km')
  })

  await testCase('P32. rate_set refuses a negative per-tonne rate as invalid_rate', async () => {
    requireFixtures()
    const v = await currentRateVersion(agencyA, driverD3)
    expectCode(await outcomeOf(() => rateSetAs(ownerA, driverD3, 0, 1000, -5, v)), 'invalid_rate', 'negative per-tonne')
  })

  await testCase('P33. rate_set for a driver employed by ANOTHER agency is refused as driver_not_employed', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(ownerA, driverB1, 1, 1, 1, 0)), 'driver_not_employed', 'other agency driver')
  })

  await testCase('P34. rate_set for an approved driver with no employment is refused as driver_not_employed', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(ownerA, driverUnemp, 1, 1, 1, 0)), 'driver_not_employed', 'unemployed driver')
  })

  await testCase('P35. rate_set for a driver whose employment ended is refused as driver_not_employed', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(ownerA, driverEnded, 1, 1, 1, 0)), 'driver_not_employed', 'ended employment')
  })

  await testCase('P36. fleet_manager is refused rate_set (finance scope only)', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(fleetA, driverD2, 0, 1000, 0, 1)), SCOPE_MSG, 'fleet rate_set')
  })

  await testCase('P37. dispatcher is refused rate_set (finance scope only)', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(dispatcherA, driverD2, 0, 1000, 0, 1)), SCOPE_MSG, 'dispatcher rate_set')
  })

  await testCase('P38. finance staff of the agency may rate_set', async () => {
    requireScenario()
    const r = await outcomeOf(() => rateSetAs(financeA, driverD2, 0, 1000, 0, 1))
    expect(r === 'ok', `finance rate_set returned ${r}`)
  })

  await testCase('P39. finance staff of an unapproved agency is refused (Agency approval is required)', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(financeC, driverD2, 0, 1000, 0, 1)), APPROVAL_MSG, 'unapproved agency rate_set')
  })

  await testCase('P40. a user with no agency profile is refused rate_set', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(noAgency, driverD2, 0, 1000, 0, 1)), NO_PROFILE_MSG, 'no-agency rate_set')
  })

  await testCase('P41. owner of agency B cannot set a rate for agency A driver (driver_not_employed)', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => rateSetAs(ownerB, driverD1, 1, 1, 1, 1)), 'driver_not_employed', 'cross-tenant rate_set')
  })

  // =========================================================================
  // P42-P53. agency_payroll_adjust
  // =========================================================================
  await testCase('P42. advance on an open period is accepted and stored as kind advance', async () => {
    requireScenario()
    expect(S.adjD1Adv.ok === true, `got ${JSON.stringify(S.adjD1Adv)}`)
    const row = await suOne(
      `SELECT kind, amount_paise FROM public.agency_payroll_adjustments WHERE period_id = $1 AND driver_id = $2 AND kind = 'advance'`,
      [S.p1A, driverD1]
    )
    expect(row && num(row.amount_paise) === 50000, `stored row ${JSON.stringify(row)}`)
  })

  await testCase('P43. deduction on an open period is accepted and stored as kind deduction', async () => {
    requireScenario()
    expect(S.adjD1Ded.ok === true, `got ${JSON.stringify(S.adjD1Ded)}`)
    const row = await suOne(
      `SELECT amount_paise FROM public.agency_payroll_adjustments WHERE period_id = $1 AND driver_id = $2 AND kind = 'deduction'`,
      [S.p1A, driverD1]
    )
    expect(row && num(row.amount_paise) === 20000, `stored row ${JSON.stringify(row)}`)
  })

  await testCase('P44. fleet_manager is refused adjust (finance scope only)', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => adjustAs(fleetA, S.p2A || uid(), driverD1, 'advance', 100, 'Fleet attempt')), SCOPE_MSG, 'fleet adjust')
  })

  await testCase('P45. dispatcher is refused adjust (finance scope only)', async () => {
    requireFixtures()
    expectCode(await outcomeOf(() => adjustAs(dispatcherA, S.p2A || uid(), driverD1, 'advance', 100, 'Dispatcher attempt')), SCOPE_MSG, 'dispatcher adjust')
  })

  await testCase('P46. adjust on a closed period is refused as period_closed', async () => {
    requireClosed()
    expectCode(await outcomeOf(() => adjustAs(ownerA, S.p1A, driverD1, 'advance', 100, 'Too late for October')), 'period_closed', 'closed period adjust')
  })

  await testCase('P47. adjust reason shorter than 3 characters is refused', async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => adjustAs(ownerA, S.p2A, driverD1, 'advance', 100, 'ab')), 'two-character reason')
  })

  await testCase('P48. adjust reason longer than 200 characters is refused', async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => adjustAs(ownerA, S.p2A, driverD1, 'advance', 100, 'x'.repeat(201))), '201-character reason')
  })

  await testCase('P49. adjust amount of zero is refused', async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => adjustAs(ownerA, S.p2A, driverD1, 'advance', 0, 'Zero amount test')), 'zero amount')
  })

  await testCase('P50. adjust with a negative amount is refused', async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => adjustAs(ownerA, S.p2A, driverD1, 'advance', -500, 'Negative amount test')), 'negative amount')
  })

  await testCase("P51. adjust with kind 'bonus' is refused", async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => adjustAs(ownerA, S.p2A, driverD1, 'bonus', 100, 'Unknown kind test')), 'unknown kind')
  })

  await testCase('P52. adjust for a driver of another agency is refused', async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => adjustAs(ownerA, S.p2A, driverB1, 'advance', 100, 'Cross-tenant driver')), 'other agency driver')
  })

  await testCase('P53. finance staff of an unapproved agency is refused adjust (Agency approval is required)', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => adjustAs(financeC, S.p2A, driverD1, 'advance', 100, 'Unapproved agency')), APPROVAL_MSG, 'unapproved adjust')
  })

  // =========================================================================
  // P54-P81. agency_payroll_close_period, lines, carry, replay and refusals
  // =========================================================================
  await testCase('P54. closing P1 (open, same key and dates) returns ok, replay false, the same period id', async () => {
    requireClosed()
    expect(S.closeP1A.ok === true && S.closeP1A.period_id === S.p1A && S.closeP1A.replay !== true,
      `got ${JSON.stringify(S.closeP1A)} for period ${S.p1A}`)
    const row = await suOne(`SELECT status FROM public.agency_payroll_periods WHERE id = $1`, [S.p1A])
    expect(row && row.status === 'closed', `status ${JSON.stringify(row)}`)
  })

  await testCase('P55. the closed period records closed_at and closed_by (the owner)', async () => {
    requireClosed()
    const row = await suOne(`SELECT closed_at, closed_by FROM public.agency_payroll_periods WHERE id = $1`, [S.p1A])
    expect(row && row.closed_at !== null && row.closed_by === ownerA, `row ${JSON.stringify(row)}`)
  })

  await testCase('P56. P1 has exactly one line per actively employed driver (D1, D2, D3) and none for others', async () => {
    requireClosed()
    const rows = (await su(`SELECT driver_id FROM public.agency_payroll_lines WHERE period_id = $1`, [S.p1A])).rows.map((r) => r.driver_id)
    const want = [driverD1, driverD2, driverD3].sort()
    expect(rows.length === 3 && [...rows].sort().join() === want.join(), `driver ids ${rows.length}: ${rows.join(',')}`)
  })

  await testCase('P57. D1 P1 line: base 100000, trips 229000, advances 50000, deductions 20000, net 259000, shortfall 0, 2 trips', async () => {
    requireClosed()
    const l = await lineOf(S.p1A, driverD1)
    expect(l, 'no D1 line')
    const got = [l.base_paise, l.trips_paise, l.advances_paise, l.deductions_paise, l.net_paise, l.shortfall_paise, l.trip_count].map(num)
    expect(got.join() === '100000,229000,50000,20000,259000,0,2', `got ${got.join(',')}`)
  })

  await testCase('P58. D2 P1 line: no trips, advances 30000 exceed earnings, net 0, shortfall 30000', async () => {
    requireClosed()
    const l = await lineOf(S.p1A, driverD2)
    expect(l, 'no D2 line')
    const got = [l.base_paise, l.trips_paise, l.advances_paise, l.net_paise, l.shortfall_paise, l.carried_in_paise, l.trip_count].map(num)
    expect(got.join() === '0,0,30000,0,30000,0,0', `got ${got.join(',')}`)
  })

  await testCase('P59. D3 P1 line: one 20 km trip at 1000 paise per km gives trips 20000 and net 20000', async () => {
    requireClosed()
    const l = await lineOf(S.p1A, driverD3)
    expect(l, 'no D3 line')
    const got = [l.trips_paise, l.net_paise, l.shortfall_paise, l.trip_count].map(num)
    expect(got.join() === '20000,20000,0,1', `got ${got.join(',')}`)
  })

  await testCase('P60. trips dated 30 Sep, still in transit, or cancelled are ignored in P1 (D1 counts exactly the 2 delivered trips)', async () => {
    requireClosed()
    const l = await lineOf(S.p1A, driverD1)
    expect(l && num(l.trip_count) === 2 && num(l.trips_paise) === 229000, `trip_count ${l && l.trip_count}, trips ${l && l.trips_paise}`)
  })

  await testCase('P61. tonnes are rounded half-up per trip: 1500 kg counts 2 tonnes, 2600 kg counts 3 tonnes (P2 trips 21000)', async () => {
    requireClosed()
    const l = await lineOf(S.p2A, driverD1)
    expect(l && num(l.trips_paise) === 21000, `P2 D1 trips ${l && l.trips_paise}, want 21000 (15000 km + 6000 tonnes)`)
  })

  await testCase('P62. shortfall of D2 in P1 is carried into D2 carried_in_paise in P2 (30000)', async () => {
    requireClosed()
    const p1 = await lineOf(S.p1A, driverD2)
    const p2 = await lineOf(S.p2A, driverD2)
    expect(p1 && p2, 'missing D2 line in P1 or P2')
    expect(num(p1.shortfall_paise) === 30000 && num(p2.carried_in_paise) === 30000, `P1 shortfall ${p1.shortfall_paise}, P2 carried_in ${p2.carried_in_paise}`)
  })

  await testCase('P63. D1 P2 line: base 100000, trips 21000, net 121000, carried_in 0 (no shortfall in P1)', async () => {
    requireClosed()
    const l = await lineOf(S.p2A, driverD1)
    expect(l, 'no D1 line in P2')
    const got = [l.base_paise, l.trips_paise, l.net_paise, l.shortfall_paise, l.carried_in_paise, l.trip_count].map(num)
    expect(got.join() === '100000,21000,121000,0,0,1', `got ${got.join(',')}`)
  })

  await testCase('P64. D3 P2 line carries nothing in and has no trips', async () => {
    requireClosed()
    const l = await lineOf(S.p2A, driverD3)
    expect(l, 'no D3 line in P2')
    const got = [l.trips_paise, l.carried_in_paise, l.trip_count].map(num)
    expect(got.join() === '0,0,0', `got ${got.join(',')}`)
  })

  await testCase('P65. close creates P3 when no period row exists yet (ok, status closed)', async () => {
    requireClosed()
    expect(S.closeP3A.ok === true && typeof S.closeP3A.period_id === 'string' && UUID_RE.test(S.closeP3A.period_id), `got ${JSON.stringify(S.closeP3A)}`)
    const row = await suOne(`SELECT status FROM public.agency_payroll_periods WHERE id = $1`, [S.closeP3A.period_id])
    expect(row && row.status === 'closed', `status ${JSON.stringify(row)}`)
  })

  await testCase('P66. D1 P3 line: one 5 km trip completed 12 Nov counts (base 100000, trips 7500, net 107500)', async () => {
    requireClosed()
    const l = await lineOf(S.closeP3A.period_id, driverD1)
    expect(l, 'no D1 line in P3')
    const got = [l.base_paise, l.trips_paise, l.net_paise, l.carried_in_paise, l.trip_count].map(num)
    expect(got.join() === '100000,7500,107500,0,1', `got ${got.join(',')}`)
  })

  await testCase('P67. replay of the same key and dates returns the same period with replay true', async () => {
    requireClosed()
    const r = await closeAs(ownerA, P1.start, P1.end, 'pay-P1')
    expect(r.ok === true && r.replay === true && r.period_id === S.p1A, `got ${JSON.stringify(r)}`)
  })

  await testCase('P68. the same key with different dates is refused as idempotency_key_reused', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(ownerA, REUSED.start, REUSED.end, 'pay-P1')), 'idempotency_key_reused', 'key reuse')
  })

  await testCase('P69. a different key for dates that are already closed is refused as already_closed', async () => {
    requireClosed()
    expectCode(await outcomeOf(() => closeAs(ownerA, P1.start, P1.end, 'pay-P1-other')), 'already_closed', 'recompute closed period')
  })

  await testCase('P70. a period longer than 93 days is refused as period_too_long', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(ownerA, LONG.start, LONG.end, 'pay-long')), 'period_too_long', 'long period')
  })

  await testCase('P71. a period ending in the future is refused as period_not_finished', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(ownerA, FUTURE.start, FUTURE.end, 'pay-future')), 'period_not_finished', 'future period')
  })

  await testCase('P72. a period overlapping an existing period of the same agency is refused as period_overlap', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(ownerA, OVERLAP.start, OVERLAP.end, 'pay-overlap')), 'period_overlap', 'overlap')
  })

  await testCase('P73. a period that ends before it starts is refused', async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => closeAs(ownerA, '2026-10-31', '2026-10-01', 'pay-backwards')), 'backwards period')
  })

  await testCase('P74. a blank idempotency key is refused', async () => {
    requireScenario()
    expectRefused(await outcomeOf(() => closeAs(ownerA, REUSED.start, REUSED.end, '   ')), 'blank key')
  })

  await testCase('P75. dispatcher is refused close (finance scope only)', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(dispatcherA, REUSED.start, REUSED.end, 'pay-dispatch')), SCOPE_MSG, 'dispatcher close')
  })

  await testCase('P76. fleet_manager is refused close (finance scope only)', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(fleetA, REUSED.start, REUSED.end, 'pay-fleet')), SCOPE_MSG, 'fleet close')
  })

  await testCase('P77. finance staff of an unapproved agency is refused close (Agency approval is required)', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(financeC, REUSED.start, REUSED.end, 'pay-unapproved')), APPROVAL_MSG, 'unapproved close')
  })

  await testCase('P78. a user with no agency profile is refused close', async () => {
    requireScenario()
    expectCode(await outcomeOf(() => closeAs(noAgency, REUSED.start, REUSED.end, 'pay-no-agency')), NO_PROFILE_MSG, 'no-agency close')
  })

  await testCase('P79. determinism: agency B with identical data gets identical numbers for B1 as agency A gets for D1', async () => {
    requireClosed()
    const a = await lineOf(S.p1A, driverD1)
    const b = await lineOf(S.closeP1B.period_id, driverB1)
    expect(a && b, 'missing line for D1 (agency A) or B1 (agency B)')
    const fields = ['base_paise', 'trips_paise', 'advances_paise', 'deductions_paise', 'net_paise', 'shortfall_paise', 'trip_count']
    const diff = fields.filter((f) => num(a[f]) !== num(b[f])).map((f) => `${f}: A=${a[f]} B=${b[f]}`)
    expect(diff.length === 0, diff.join('; '))
  })

  await testCase('P80. replay did not duplicate lines: P1 of agency A still has exactly 3 lines', async () => {
    requireClosed()
    const row = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_lines WHERE period_id = $1`, [S.p1A])
    expect(num(row.n) === 3, `lines ${row.n}`)
  })

  await testCase('P81. agency B closing P1 does not change agency A lines (D1 net still 259000)', async () => {
    requireClosed()
    const l = await lineOf(S.p1A, driverD1)
    expect(l && num(l.net_paise) === 259000, `D1 net ${l && l.net_paise}`)
  })

  // =========================================================================
  // P82-P95. Reads (RLS), driver visibility, direct writes
  // =========================================================================
  await testCase('P82. owner of agency A reads its own 3 periods', async () => {
    requireClosed()
    const n = await countAs(ownerA, `SELECT count(*)::int AS n FROM public.agency_payroll_periods`)
    expect(n === 3, `owner sees ${n} periods, want 3`)
  })

  await testCase('P83. finance staff of agency A reads its 9 lines (3 per closed period)', async () => {
    requireClosed()
    const n = await countAs(financeA, `SELECT count(*)::int AS n FROM public.agency_payroll_lines`)
    expect(n === 9, `finance sees ${n} lines, want 9`)
  })

  await testCase('P84. viewer reads no periods, lines, rates or adjustments (payroll is confidential)', async () => {
    requireClosed()
    const counts = [
      await countAs(viewerA, `SELECT count(*)::int AS n FROM public.agency_payroll_periods`),
      await countAs(viewerA, `SELECT count(*)::int AS n FROM public.agency_payroll_lines`),
      await countAs(viewerA, `SELECT count(*)::int AS n FROM public.agency_driver_rates`),
      await countAs(viewerA, `SELECT count(*)::int AS n FROM public.agency_payroll_adjustments`),
    ]
    expect(counts.every((n) => n === 0), `viewer sees ${counts.join(',')}`)
  })

  await testCase('P85. dispatcher reads no periods or lines', async () => {
    requireClosed()
    const counts = [
      await countAs(dispatcherA, `SELECT count(*)::int AS n FROM public.agency_payroll_periods`),
      await countAs(dispatcherA, `SELECT count(*)::int AS n FROM public.agency_payroll_lines`),
    ]
    expect(counts.every((n) => n === 0), `dispatcher sees ${counts.join(',')}`)
  })

  await testCase('P86. fleet_manager reads no periods or lines', async () => {
    requireClosed()
    const counts = [
      await countAs(fleetA, `SELECT count(*)::int AS n FROM public.agency_payroll_periods`),
      await countAs(fleetA, `SELECT count(*)::int AS n FROM public.agency_payroll_lines`),
    ]
    expect(counts.every((n) => n === 0), `fleet sees ${counts.join(',')}`)
  })

  await testCase("P87. owner of agency B sees only its own period and none of agency A's periods or lines", async () => {
    requireClosed()
    const own = await countAs(ownerB, `SELECT count(*)::int AS n FROM public.agency_payroll_periods`)
    const foreign = await countAs(ownerB, `SELECT count(*)::int AS n FROM public.agency_payroll_lines WHERE agency_id = $1`, [agencyA])
    const foreignPeriods = await countAs(ownerB, `SELECT count(*)::int AS n FROM public.agency_payroll_periods WHERE agency_id = $1`, [agencyA])
    expect(own === 1 && foreign === 0 && foreignPeriods === 0, `own ${own}, foreign lines ${foreign}, foreign periods ${foreignPeriods}`)
  })

  await testCase('P88. finance staff of an unapproved agency reads no periods or lines', async () => {
    requireClosed()
    const n = await countAs(financeC, `SELECT count(*)::int AS n FROM public.agency_payroll_periods`)
    const m = await countAs(financeC, `SELECT count(*)::int AS n FROM public.agency_payroll_lines`)
    expect(n === 0 && m === 0, `periods ${n}, lines ${m}`)
  })

  await testCase('P89. anon reads no rows from any payroll table', async () => {
    requireClosed()
    const counts = []
    for (const t of PAY_TABLES) counts.push(await countAnon(`SELECT count(*)::int AS n FROM public.${t}`))
    expect(counts.every((n) => n === 0), `anon sees ${counts.join(',')}`)
  })

  await testCase('P90. a driver reads only their own lines directly (D1: 3 lines, all D1)', async () => {
    requireClosed()
    const rows = await asActor(driverUserD1, async () => (await db.query(`SELECT driver_id FROM public.agency_payroll_lines`)).rows)
    expect(rows.length === 3 && rows.every((r) => r.driver_id === driverD1), `rows ${rows.length}`)
  })

  await testCase('P91. agency_payroll_my_lines returns only the caller closed lines (3 entries, all D1)', async () => {
    requireClosed()
    const r = await myLinesAs(driverUserD1)
    const entries = Array.isArray(r) ? r : Array.isArray(r && r.lines) ? r.lines : null
    expect(entries, `unexpected shape ${JSON.stringify(r).slice(0, 160)}`)
    expect(entries.length === 3 && entries.every((e) => JSON.stringify(e).includes(driverD1)), `entries ${entries.length}`)
  })

  await testCase('P92. agency_payroll_my_lines for a user with no driver profile returns no lines (empty or refused)', async () => {
    requireClosed()
    let r
    try {
      r = await myLinesAs(ownerA)
    } catch {
      return
    }
    if (r && r.ok === false) return
    const entries = Array.isArray(r) ? r : Array.isArray(r && r.lines) ? r.lines : null
    expect(entries && entries.length === 0, `got ${JSON.stringify(r).slice(0, 160)}`)
  })

  await testCase('P93. a driver cannot insert a payroll line directly', async () => {
    requireScenario()
    const before = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_lines`)
    try {
      await asActor(driverUserD1, () =>
        db.query(
          `INSERT INTO public.agency_payroll_lines (id, period_id, agency_id, driver_id, base_paise, trips_paise, advances_paise, deductions_paise, net_paise, shortfall_paise, carried_in_paise, trip_count)
           VALUES ($1, $2, $3, $4, 999999, 0, 0, 0, 999999, 0, 0, 0)`,
          [uid(), S.p1A, agencyA, driverD1]
        )
      )
    } catch {
      // refused: fine
    }
    const after = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_lines`)
    expect(num(after.n) === num(before.n), `lines went from ${before.n} to ${after.n}`)
  })

  await testCase('P94. the owner cannot write a payroll period directly', async () => {
    requireScenario()
    const before = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_periods`)
    try {
      await asActor(ownerA, () =>
        db.query(
          `INSERT INTO public.agency_payroll_periods (id, agency_id, period_start, period_end, status, version, idempotency_key)
           VALUES ($1, $2, '2024-01-01', '2024-01-31', 'closed', 1, 'direct-write')`,
          [uid(), agencyA]
        )
      )
    } catch {
      // refused: fine
    }
    const after = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_periods`)
    expect(num(after.n) === num(before.n), `periods went from ${before.n} to ${after.n}`)
  })

  await testCase('P95. the owner cannot reopen a closed period by a direct update', async () => {
    requireClosed()
    try {
      await asActor(ownerA, () => db.query(`UPDATE public.agency_payroll_periods SET status = 'open' WHERE id = $1`, [S.p1A]))
    } catch {
      // refused: fine
    }
    const row = await suOne(`SELECT status FROM public.agency_payroll_periods WHERE id = $1`, [S.p1A])
    expect(row && row.status === 'closed', `status is now ${row && row.status}`)
  })

  // =========================================================================
  // P96+. Opus review fixes: forged job inputs, paid-job snapshot, order, union of drivers,
  // ranges, open_period, IST dates, closed-data guards, rate snapshot, search_path.
  // =========================================================================
  const D = {}
  let dError = null

  async function openAs(userId, start, end, key) {
    return asActor(userId, async () =>
      parseJson((await db.query(`SELECT public.agency_payroll_open_period($1::date, $2::date, $3::text) AS r`, [start, end, key])).rows[0].r)
    )
  }

  async function tryMsg(fn) {
    try {
      await fn()
      return null
    } catch (error) {
      return firstLine(error)
    }
  }

  async function seedJobR(agencyId, driverId, status, completedAt, distanceKm, weightKg) {
    const shipmentRowId = uid()
    await su(`INSERT INTO public.shipments (id, shipment_id, origin, destination, total_weight) VALUES ($1, $2, 'Pune', 'Mumbai', $3)`, [
      shipmentRowId,
      nx('PAY-SHP'),
      weightKg,
    ])
    const jobId = uid()
    await su(
      `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, driver_id, status, distance_km, weight_kg, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [jobId, agencyId, shipmentRowId, driverId, status, distanceKm, weightKg, completedAt]
    )
    await su(`INSERT INTO public.shipment_agency_consents (id, shipment_id, agency_id) VALUES ($1, $2, $3)`, [uid(), shipmentRowId, agencyId])
    return { jobId, shipmentRowId }
  }

  async function buildD() {
    D.owner = await createUser('pay-owner-d')
    D.agency = await createAgencyRow(D.owner, 'Payroll D', 'approved')
    D.disp = await seedStaff(D.agency, 'pay-disp-d', 'dispatcher')
    D.fin = await seedStaff(D.agency, 'pay-fin-d', 'finance')
    D.dA = await createDriver('pay-da')
    D.dE = await createDriver('pay-de')
    D.dS = await createDriver('pay-ds')
    await employDriver(D.agency, D.dA)
    await employDriver(D.agency, D.dE)
    await employDriver(D.agency, D.dS)
    must(await rateSetAs(D.owner, D.dA, 10000, 100, 500, 0), 'rate dA')
    must(await rateSetAs(D.owner, D.dE, 5000, 100, 0, 0), 'rate dE')
    must(await rateSetAs(D.owner, D.dS, 1000, 0, 0, 0), 'rate dS')

    D.j1 = await seedJobR(D.agency, D.dA, 'delivered', '2026-06-10T10:00:00Z', 10, 0) // June: 1000
    D.j2 = await seedJobR(D.agency, D.dA, 'delivered', '2026-06-30T19:00:00Z', 20, 0) // 01 Jul 00:30 IST: July 2000
    D.j3 = await seedJobR(D.agency, D.dA, 'delivered', '2026-07-31T20:00:00Z', 30, 0) // 01 Aug 01:30 IST: Aug 3000
    D.j4 = await seedJobR(D.agency, D.dE, 'delivered', '2026-06-12T10:00:00Z', 20, 0) // June: 2000 (driver ended)
    D.j5 = await seedJobR(D.agency, D.dA, 'delivered', '2026-11-01T10:00:00Z', 5, 0) // unpaid, never closed here
    D.j6 = await seedJobR(D.agency, D.dA, 'pending', null, 5, 0)

    D.openJun = must(await openAs(D.owner, '2026-06-01', '2026-06-30', 'd-jun-open'), 'open June')
    must(await adjustAs(D.owner, D.openJun.period_id, D.dS, 'advance', 50000, 'June advance for dS'), 'advance dS')
    await su(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE agency_id = $1 AND driver_id = $2`, [D.agency, D.dE])
    D.closeJun = must(await closeAs(D.owner, '2026-06-01', '2026-06-30', 'd-jun-close'), 'close June')
    D.closeJunReplay = await closeAs(D.owner, '2026-06-01', '2026-06-30', 'd-jun-close')
    await su(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE agency_id = $1 AND driver_id = $2`, [D.agency, D.dS])
    D.closeJul = must(await closeAs(D.owner, '2026-07-01', '2026-07-31', 'd-jul'), 'close July')
    D.closeAug = must(await closeAs(D.owner, '2026-08-01', '2026-08-31', 'd-aug'), 'close August')
  }

  async function requireD() {
    requireClosed()
    if (!D.owner && !dError) {
      try {
        await buildD()
      } catch (error) {
        dError = firstLine(error)
      }
    }
    if (dError) throw new Error(`agency D scenario not established: ${dError}`)
  }

  const dLine = (periodId, driverId) => lineOf(periodId, driverId)

  await testCase('P96. a dispatcher cannot change distance_km of a delivered job through the direct UPDATE policy', async () => {
    await requireD()
    const msg = await tryMsg(() => asActor(D.disp, () => db.query(`UPDATE public.agency_jobs SET distance_km = 100000 WHERE id = $1`, [D.j5.jobId])))
    expect(msg && /delivered job is final/.test(msg), `got ${msg}`)
    const row = await suOne(`SELECT distance_km FROM public.agency_jobs WHERE id = $1`, [D.j5.jobId])
    expect(num(row.distance_km) === 5, `distance now ${row.distance_km}`)
  })

  await testCase('P97. a dispatcher cannot change weight_kg or driver_id of a delivered job', async () => {
    await requireD()
    const w = await tryMsg(() => asActor(D.disp, () => db.query(`UPDATE public.agency_jobs SET weight_kg = 900000 WHERE id = $1`, [D.j5.jobId])))
    expect(w && /delivered job is final/.test(w), `weight: ${w}`)
    const d = await tryMsg(() => asActor(D.disp, () => db.query(`UPDATE public.agency_jobs SET driver_id = $2 WHERE id = $1`, [D.j5.jobId, D.dS])))
    expect(d !== null, 'driver_id change was accepted')
    const row = await suOne(`SELECT weight_kg, driver_id FROM public.agency_jobs WHERE id = $1`, [D.j5.jobId])
    expect(num(row.weight_kg) === 0 && row.driver_id === D.dA, `row ${JSON.stringify(row)}`)
  })

  await testCase('P98. completed_at is write-once: a dispatcher can neither reset it to NULL nor move it', async () => {
    await requireD()
    const before = await suOne(`SELECT completed_at FROM public.agency_jobs WHERE id = $1`, [D.j5.jobId])
    const a = await tryMsg(() => asActor(D.disp, () => db.query(`UPDATE public.agency_jobs SET completed_at = NULL WHERE id = $1`, [D.j5.jobId])))
    const b = await tryMsg(() => asActor(D.disp, () => db.query(`UPDATE public.agency_jobs SET completed_at = '2026-06-15T10:00:00Z' WHERE id = $1`, [D.j5.jobId])))
    expect(a && /write-once/.test(a), `null: ${a}`)
    expect(b && /write-once/.test(b), `move: ${b}`)
    const after = await suOne(`SELECT completed_at FROM public.agency_jobs WHERE id = $1`, [D.j5.jobId])
    expect(String(after.completed_at) === String(before.completed_at), 'completed_at changed')
  })

  await testCase('P99. a dispatcher cannot supply completed_at on a pending job or deliver it with a forged time', async () => {
    await requireD()
    const a = await tryMsg(() => asActor(D.disp, () => db.query(`UPDATE public.agency_jobs SET completed_at = '2026-06-15T10:00:00Z' WHERE id = $1`, [D.j6.jobId])))
    expect(a && /set by the system/.test(a), `pending: ${a}`)
    const b = await tryMsg(() =>
      asActor(D.disp, () => db.query(`UPDATE public.agency_jobs SET status = 'delivered', completed_at = '2026-06-15T10:00:00Z' WHERE id = $1`, [D.j6.jobId]))
    )
    expect(b && /set by the system/.test(b), `deliver: ${b}`)
    const row = await suOne(`SELECT status, completed_at FROM public.agency_jobs WHERE id = $1`, [D.j6.jobId])
    expect(row.status === 'pending' && row.completed_at === null, `row ${JSON.stringify(row)}`)
  })

  await testCase('P100. a dispatcher cannot INSERT a job with completed_at or already delivered', async () => {
    await requireD()
    const shp = uid()
    await su(`INSERT INTO public.shipments (id, shipment_id, origin, destination, total_weight) VALUES ($1, $2, 'Pune', 'Mumbai', 1)`, [shp, nx('PAY-SHP')])
    const a = await tryMsg(() =>
      asActor(D.disp, () => db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, status, completed_at) VALUES ($1, $2, 'pending', now())`, [D.agency, shp]))
    )
    expect(a && /set by the system/.test(a), `completed_at: ${a}`)
    const b = await tryMsg(() =>
      asActor(D.disp, () => db.query(`INSERT INTO public.agency_jobs (agency_id, shipment_id, status) VALUES ($1, $2, 'delivered')`, [D.agency, shp]))
    )
    expect(b && /cannot be created as delivered/.test(b), `delivered: ${b}`)
  })

  await testCase('P101. the system still stamps completed_at when a job is delivered by the owner/service path', async () => {
    await requireD()
    await su(`UPDATE public.agency_jobs SET status = 'delivered' WHERE id = $1`, [D.j6.jobId])
    const row = await suOne(`SELECT completed_at FROM public.agency_jobs WHERE id = $1`, [D.j6.jobId])
    expect(row.completed_at !== null, 'completed_at not stamped')
    await su(`UPDATE public.agency_jobs SET status = 'pending' WHERE id = $1`, [D.j6.jobId])
  })

  await testCase('P102. closing snapshots the paid jobs: every counted trip has exactly one agency_payroll_line_jobs row', async () => {
    await requireD()
    const jun = await dLine(D.closeJun.period_id, D.dA)
    const n = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_line_jobs WHERE line_id = $1 AND job_id = $2`, [jun.id, D.j1.jobId])
    expect(num(n.n) === 1 && num(jun.trip_count) === 1, `snapshot rows ${n.n}, trip_count ${jun.trip_count}`)
    const total = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_line_jobs WHERE agency_id = $1`, [D.agency])
    expect(num(total.n) === 4, `agency D paid jobs ${total.n}, want 4 (j1..j4)`)
  })

  await testCase('P103. a paid job can never be recorded twice (UNIQUE per agency) and snapshot rows cannot be edited or deleted', async () => {
    await requireD()
    const jun = await dLine(D.closeJun.period_id, D.dA)
    const dup = await tryMsg(() =>
      su(
        `INSERT INTO public.agency_payroll_line_jobs (agency_id, period_id, line_id, driver_id, job_id) VALUES ($1, $2, $3, $4, $5)`,
        [D.agency, D.closeAug.period_id, jun.id, D.dA, D.j1.jobId]
      )
    )
    expect(dup !== null, 'duplicate paid job accepted')
    const del = await tryMsg(() => su(`DELETE FROM public.agency_payroll_line_jobs WHERE job_id = $1`, [D.j1.jobId]))
    expect(del !== null, 'snapshot delete accepted')
    const upd = await tryMsg(() => su(`UPDATE public.agency_payroll_line_jobs SET job_id = $1 WHERE job_id = $2`, [uid(), D.j1.jobId]))
    expect(upd !== null, 'snapshot update accepted')
  })

  await testCase('P104. dates use Asia/Kolkata: 30 Jun 19:00Z pays in July and 31 Jul 20:00Z pays in August', async () => {
    await requireD()
    const jul = await dLine(D.closeJul.period_id, D.dA)
    const aug = await dLine(D.closeAug.period_id, D.dA)
    const jun = await dLine(D.closeJun.period_id, D.dA)
    expect(num(jun.trips_paise) === 1000 && num(jun.trip_count) === 1, `June ${JSON.stringify(jun)}`)
    expect(num(jul.trips_paise) === 2000 && num(jul.trip_count) === 1, `July ${JSON.stringify(jul)}`)
    expect(num(aug.trips_paise) === 3000 && num(aug.trip_count) === 1, `August ${JSON.stringify(aug)}`)
  })

  await testCase('P105. open_period then close with a DIFFERENT key for the same dates closes that period; its close key replays', async () => {
    await requireD()
    expect(D.openJun.status === 'open' && D.openJun.replay === false, `open ${JSON.stringify(D.openJun)}`)
    expect(D.closeJun.period_id === D.openJun.period_id && D.closeJun.replay === false, `close ${JSON.stringify(D.closeJun)}`)
    expect(D.closeJunReplay.ok === true && D.closeJunReplay.replay === true && D.closeJunReplay.period_id === D.openJun.period_id, `replay ${JSON.stringify(D.closeJunReplay)}`)
    const adv = await dLine(D.closeJun.period_id, D.dS)
    expect(num(adv.advances_paise) === 50000, `advance recorded on the opened period: ${JSON.stringify(adv)}`)
  })

  await testCase('P106. open_period is idempotent on its key, refuses a reused key, dispatcher and unapproved finance', async () => {
    await requireD()
    const again = await openAs(D.owner, '2026-06-01', '2026-06-30', 'd-jun-open')
    expect(again.ok === true && again.replay === true && again.period_id === D.openJun.period_id, `replay ${JSON.stringify(again)}`)
    const reused = await openAs(D.owner, '2026-09-01', '2026-09-30', 'd-jun-open')
    expect(reused.ok === false && reused.error === 'idempotency_key_reused', `reused ${JSON.stringify(reused)}`)
    expectCode(await outcomeOf(() => openAs(D.disp, '2026-09-01', '2026-09-30', 'd-sep-disp')), SCOPE_MSG, 'dispatcher open')
    expectCode(await outcomeOf(() => openAs(financeC, '2026-09-01', '2026-09-30', 'd-sep-c')), APPROVAL_MSG, 'unapproved open')
    const closed = await openAs(D.owner, '2026-06-01', '2026-06-30', 'd-jun-other')
    expect(closed.ok === false && closed.error === 'already_closed', `closed dates ${JSON.stringify(closed)}`)
  })

  await testCase('P107. periods must close in order: an earlier period after a later closed one is refused as out_of_order', async () => {
    await requireD()
    const c = await closeAs(D.owner, '2026-05-01', '2026-05-31', 'd-may')
    expect(c.ok === false && c.error === 'out_of_order', `close ${JSON.stringify(c)}`)
    const o = await openAs(D.owner, '2026-05-01', '2026-05-31', 'd-may-open')
    expect(o.ok === false && o.error === 'out_of_order', `open ${JSON.stringify(o)}`)
    const n = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_periods WHERE agency_id = $1`, [D.agency])
    expect(num(n.n) === 3, `periods ${n.n}`)
  })

  await testCase('P108. a driver whose employment ended is still paid their delivered trips (June: dE 2000, base 0)', async () => {
    await requireD()
    const l = await dLine(D.closeJun.period_id, D.dE)
    expect(l && num(l.base_paise) === 0 && num(l.trips_paise) === 2000 && num(l.net_paise) === 2000 && num(l.trip_count) === 1, `dE ${JSON.stringify(l)}`)
  })

  await testCase('P109. a driver with a previous shortfall stays in the next periods after employment ends (debt is never lost)', async () => {
    await requireD()
    const jun = await dLine(D.closeJun.period_id, D.dS)
    const jul = await dLine(D.closeJul.period_id, D.dS)
    const aug = await dLine(D.closeAug.period_id, D.dS)
    expect(num(jun.shortfall_paise) === 49000, `June ${JSON.stringify(jun)}`)
    expect(jul && num(jul.carried_in_paise) === 49000 && num(jul.shortfall_paise) === 49000 && num(jul.net_paise) === 0, `July ${JSON.stringify(jul)}`)
    expect(aug && num(aug.carried_in_paise) === 49000 && num(aug.shortfall_paise) === 49000, `August ${JSON.stringify(aug)}`)
    const deLater = await dLine(D.closeJul.period_id, D.dE)
    expect(!deLater, 'a driver with nothing to settle must not get a line')
  })

  await testCase('P110. each payroll line stores the per-km, per-tonne rate and rate version used', async () => {
    await requireD()
    const l = await dLine(D.closeJun.period_id, D.dA)
    expect(num(l.per_km_paise) === 100 && num(l.per_tonne_paise) === 500 && num(l.rate_version) === 1, `line ${JSON.stringify(l)}`)
    const noRate = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_lines WHERE rate_version = 0 AND agency_id = $1`, [D.agency])
    expect(num(noRate.n) === 0, `lines without a rate card ${noRate.n}`)
  })

  await testCase('P111. job distance, weight and payroll rates are range checked (CHECK constraints)', async () => {
    await requireD()
    const bad = [
      [100001, 0],
      [-1, 0],
      [1, 1000001],
      [1, -1],
    ]
    for (const [dist, wt] of bad) {
      const msg = await tryMsg(() => seedJobR(D.agency, D.dA, 'pending', null, dist, wt))
      expect(msg !== null, `distance ${dist} weight ${wt} was accepted`)
    }
    const r = await rateSetAs(D.owner, D.dA, 1000000001, 0, 0, 1)
    expect(r.ok === false && r.error === 'invalid_rate', `rate ${JSON.stringify(r)}`)
    const direct = await tryMsg(() => su(`UPDATE public.agency_driver_rates SET per_km_paise = 1000000001 WHERE agency_id = $1 AND driver_id = $2`, [D.agency, D.dA]))
    expect(direct !== null, 'direct oversized rate accepted')
  })

  await testCase('P112. an overflowing close returns value_out_of_range and changes nothing (period stays open, no lines)', async () => {
    await requireD()
    const ownerE = await createUser('pay-owner-e')
    const agencyE = await createAgencyRow(ownerE, 'Payroll E', 'approved')
    const dE1 = await createDriver('pay-e1')
    await employDriver(agencyE, dE1)
    const opened = must(await openAs(ownerE, '2026-01-01', '2026-01-31', 'e-jan'), 'open E')
    await su(
      `INSERT INTO public.agency_payroll_adjustments (period_id, agency_id, driver_id, kind, amount_paise, reason) VALUES ($1, $2, $3, 'advance', 9000000000000000000, 'overflow one'), ($1, $2, $3, 'advance', 9000000000000000000, 'overflow two')`,
      [opened.period_id, agencyE, dE1]
    )
    const c = await closeAs(ownerE, '2026-01-01', '2026-01-31', 'e-jan')
    expect(c.ok === false && c.error === 'value_out_of_range', `close ${JSON.stringify(c)}`)
    const p = await suOne(`SELECT status FROM public.agency_payroll_periods WHERE id = $1`, [opened.period_id])
    const n = await suOne(`SELECT count(*)::int AS n FROM public.agency_payroll_lines WHERE period_id = $1`, [opened.period_id])
    expect(p.status === 'open' && num(n.n) === 0, `status ${p.status}, lines ${n.n}`)
    await su(`DELETE FROM public.agency_payroll_adjustments WHERE period_id = $1`, [opened.period_id])
    const ok = await closeAs(ownerE, '2026-01-01', '2026-01-31', 'e-jan')
    expect(ok.ok === true && ok.replay === false, `retry ${JSON.stringify(ok)}`)
  })

  await testCase('P113. service role cannot delete or insert closed payroll data', async () => {
    await requireD()
    const line = await dLine(D.closeJun.period_id, D.dS)
    const adj = await suOne(`SELECT id FROM public.agency_payroll_adjustments WHERE period_id = $1 LIMIT 1`, [D.closeJun.period_id])
    const attempts = {
      'delete period': () => su(`DELETE FROM public.agency_payroll_periods WHERE id = $1`, [D.closeJun.period_id]),
      'delete line': () => su(`DELETE FROM public.agency_payroll_lines WHERE id = $1`, [line.id]),
      'delete adjustment': () => su(`DELETE FROM public.agency_payroll_adjustments WHERE id = $1`, [adj.id]),
      'insert adjustment': () =>
        su(`INSERT INTO public.agency_payroll_adjustments (period_id, agency_id, driver_id, kind, amount_paise, reason) VALUES ($1, $2, $3, 'advance', 1, 'late add')`, [D.closeJun.period_id, D.agency, D.dS]),
      'insert line': () =>
        su(
          `INSERT INTO public.agency_payroll_lines (period_id, agency_id, driver_id, base_paise, trips_paise, advances_paise, deductions_paise, net_paise, shortfall_paise, trip_count) VALUES ($1, $2, $3, 0, 0, 0, 0, 0, 0, 0)`,
          [D.closeAug.period_id, D.agency, D.dE]
        ),
      'insert closed period': () =>
        su(`INSERT INTO public.agency_payroll_periods (agency_id, period_start, period_end, status, version, idempotency_key) VALUES ($1, '2025-01-01', '2025-01-31', 'closed', 1, 'direct-closed')`, [D.agency]),
    }
    for (const [name, fn] of Object.entries(attempts)) {
      const msg = await tryMsg(fn)
      expect(msg !== null, `${name} was accepted`)
    }
    const n = await suOne(`SELECT (SELECT count(*) FROM public.agency_payroll_lines WHERE period_id = $1)::int AS lines`, [D.closeJun.period_id])
    expect(num(n.lines) === 3, `June lines ${n.lines}`)
  })

  await testCase('P114. payroll and job trigger functions pin search_path; open_period is EXECUTE-granted to authenticated and service_role only', async () => {
    requireFixtures()
    const rows = (
      await su(
        `SELECT proname, coalesce(array_to_string(proconfig, ','), '') AS cfg FROM pg_proc
         WHERE pronamespace = 'public'::regnamespace
           AND proname IN ('agency_jobs_set_completed_at','agency_payroll_guard_period','agency_payroll_guard_lines','agency_payroll_guard_adjustments','agency_payroll_guard_line_jobs')`
      )
    ).rows
    expect(rows.length === 5, `found ${rows.length} trigger functions`)
    for (const r of rows) expect(/search_path=/.test(r.cfg), `${r.proname} cfg "${r.cfg}"`)
    const g = (
      await su(
        `SELECT has_function_privilege('anon', 'public.agency_payroll_open_period(date,date,text)', 'EXECUTE') AS anon,
                has_function_privilege('authenticated', 'public.agency_payroll_open_period(date,date,text)', 'EXECUTE') AS auth,
                has_function_privilege('service_role', 'public.agency_payroll_open_period(date,date,text)', 'EXECUTE') AS svc`
      )
    ).rows[0]
    expect(g.anon === false && g.auth === true && g.svc === true, `grants ${JSON.stringify(g)}`)
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  if (failed.length) {
    console.log('First failing cases:')
    for (const f of failed.slice(0, 10)) console.log(`  - ${f.name}`)
  }
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
