#!/usr/bin/env node
/**
 * Agency expenses, fuel and maintenance (TO-149) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the RPCs the way PostgREST does
 * per request: `SET ROLE authenticated` with `request.jwt.claims` set to the
 * caller's sub.
 *
 * Pinned contract under test. The migration that implements it is NOT written
 * yet (it will be supabase/migrations/20261022000000_agency_expenses.sql), so
 * every case that needs the new tables or commands is EXPECTED to fail now.
 * Each case fails with the missing-object reason until the migration lands.
 *
 *   Tables (RLS on, no direct write privileges for authenticated):
 *     agency_expenses(id, agency_id, truck_id NULL -> agency_trucks,
 *       category 'fuel'|'toll'|'maintenance'|'driver_allowance'|'insurance'|'permit'|'other',
 *       amount_paise bigint CHECK (> 0), spent_on date, note, idempotency_key,
 *       created_by, created_at)  UNIQUE (agency_id, idempotency_key)
 *     agency_fuel_fills(id, agency_id, truck_id, odometer_km numeric, litres numeric(8,2),
 *       full_tank boolean, expense_id -> agency_expenses, filled_on date)
 *     agency_maintenance_items(id, agency_id, truck_id, name, interval_km int NULL,
 *       interval_days int NULL, last_service_km numeric, last_service_on date,
 *       version int default 1)  UNIQUE (agency_id, truck_id, name)
 *
 *   RLS reads: owner and every active staff scope (dispatcher, fleet_manager, finance, viewer)
 *   read their agency's rows. Suspended-agency staff, revoked members, users with no agency,
 *   other agencies and anon read 0 rows. No direct INSERT/UPDATE/DELETE for authenticated.
 *
 *   Commands (SECURITY DEFINER, agency from auth.uid(), jsonb results, no agency argument).
 *   Writes allowed for scopes fleet_manager and finance, and always for the owner.
 *   Dispatcher and viewer writes return {ok:false,error:'forbidden_scope'}.
 *   Caller refusals (RAISE EXCEPTION, pinned wording from the existing staff-scope helpers):
 *     'No agency profile found for this account.'  (no agency at all)
 *     'Agency approval is required.'               (active staff of a non-approved agency)
 *
 *   public.agency_expense_record(p_truck_id uuid, p_category text, p_amount_paise bigint,
 *     p_spent_on date, p_note text, p_idempotency_key text) RETURNS jsonb
 *     - Success: {ok:true, expense_id, replay:false}. Same key and same payload again:
 *       {ok:true, expense_id (same id), replay:true}, no new row.
 *     - {ok:false,error:'idempotency_key_reused'} when the key is reused with a different payload.
 *     - {ok:false,error:'invalid_category'} | 'invalid_amount' (<= 0 or > 100000000 paise)
 *       | 'future_date' | 'truck_not_found' (missing or other agency) | 'note_too_long' (> 300)
 *       | 'truck_required' (null truck for fuel, toll, maintenance or driver_allowance).
 *       Null truck is valid for insurance, permit and other.
 *
 *   public.agency_fuel_fill_record(p_truck_id uuid, p_odometer_km numeric, p_litres numeric,
 *     p_full_tank boolean, p_amount_paise bigint, p_filled_on date, p_idempotency_key text) RETURNS jsonb
 *     - Creates a fuel expense AND a fill in one transaction (both or neither).
 *     - {ok:false,error:'odometer_not_increasing',previous_km} when odometer <= the truck's last km.
 *     - {ok:false,error:'invalid_litres'} unless 1 <= litres <= 1000.
 *     - Same replay and key-reuse rules as agency_expense_record.
 *
 *   public.agency_maintenance_item_upsert(p_truck_id uuid, p_name text, p_interval_km int,
 *     p_interval_days int, p_last_service_km numeric, p_last_service_on date,
 *     p_expected_version int) RETURNS jsonb
 *     - Item identity is (truck, name). At least one interval required: {ok:false,error:'interval_required'}.
 *     - Create: p_expected_version is passed as NULL by these cases. Duplicate name on create:
 *       {ok:false,error:'name_exists'}.
 *     - Update: stale p_expected_version -> {ok:false,error:'version_conflict'}; success bumps version.
 *
 *   public.agency_maintenance_service_done(p_item_id uuid, p_service_km numeric, p_service_on date,
 *     p_expected_version int, p_cost_paise bigint, p_idempotency_key text) RETURNS jsonb
 *     - Updates last_service_km/on, bumps version by 1, and when p_cost_paise > 0 records a
 *       'maintenance' expense for the truck in the same transaction.
 *     - service_km below last_service_km: {ok:false,error:'km_going_backwards'}.
 *     - Stale version: {ok:false,error:'version_conflict'}.
 *     - Same key replayed: no second expense, no second version bump.
 *
 *   public.agency_expense_summary(p_from date, p_to date) RETURNS jsonb
 *     - Read command for any active scope. {ok:true, by_category:[{category,total_paise}],
 *       by_truck:[{truck_id,total_paise}], total_paise}. Both ends inclusive.
 *     - p_from > p_to: {ok:false,error:'invalid_range'}. Range wider than 366 days inclusive:
 *       {ok:false,error:'range_too_large'}. Never includes another agency.
 *
 *   No delete command exists for expenses, fills or maintenance items. Direct DELETE is denied.
 *
 * Assumptions (not pinned by the brief, flagged for the implementer):
 *   - Success responses carry expense_id (used to identify replays).
 *   - Fill and service identities are read from the database, not from response keys.
 *   - Maintenance create passes p_expected_version NULL.
 *   - Refusals that the brief leaves open (revoked member, suspended staff, other-agency item)
 *     pass with either a raised error or {ok:false}; no wording is pinned.
 *   - anon SELECT either raises or returns 0 rows (both are "no access").
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST / GoTrue
 * behaviour is NOT covered. Concurrency is not raced; duplicates are sequential.
 *
 * Usage:  node scripts/agency_expenses.db.test.mjs   (from the repo root)
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
const EXP_FILE = '20261022000000_agency_expenses.sql'

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

/** Passes only if the promise rejects with EXACTLY `exactMessage`. */
async function expectExactError(promise, exactMessage) {
  try {
    await promise
  } catch (error) {
    const message = firstLine(error)
    expect(message === exactMessage, `expected exactly ${JSON.stringify(exactMessage)}, got: ${JSON.stringify(message)}`)
    return message
  }
  throw new Error(`expected exactly ${JSON.stringify(exactMessage)}, but the call succeeded`)
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

/** Exact {ok:false,error} shape. */
function expectResult(r, error) {
  expect(r && r.ok === false && r.error === error, `expected {ok:false,error:'${error}'}, got ${String(JSON.stringify(r)).slice(0, 200)}`)
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
// Fixtures (superuser). Only pre-existing tables are touched in setupFixtures, so
// the setup itself never fails; expense-table seeds happen inside cases.
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

/** Truck seeded by superuser. vehicle_type 'eicher_14ft' is in the existing vehicle catalog. */
async function seedTruck(agencyId) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number) VALUES ($1, $2, 'eicher_14ft', $3)`,
    [id, agencyId, `DL01EX${1000 + seq}`]
  )
  return id
}

// Fixture handles, assigned in setupFixtures().
let ownerA, ownerB, ownerS, agencyA, agencyB, agencyS
let truckA1, truckA2, truckB1, truckS1
let fleetA, financeA, dispatcherA, viewerA, revokedA, suspendedStaffS, noAgency

async function setupFixtures() {
  ownerA = await createUser('ex-owner-a')
  agencyA = await createAgencyRow(ownerA, 'Expense A', 'approved')
  ownerB = await createUser('ex-owner-b')
  agencyB = await createAgencyRow(ownerB, 'Expense B', 'approved')
  ownerS = await createUser('ex-owner-s')
  agencyS = await createAgencyRow(ownerS, 'Expense S', 'suspended')

  truckA1 = await seedTruck(agencyA)
  truckA2 = await seedTruck(agencyA)
  truckB1 = await seedTruck(agencyB)
  truckS1 = await seedTruck(agencyS)

  fleetA = await seedStaff(agencyA, 'ex-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'ex-finance', 'finance')
  dispatcherA = await seedStaff(agencyA, 'ex-dispatcher', 'dispatcher')
  viewerA = await seedStaff(agencyA, 'ex-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'ex-revoked', 'fleet_manager', 'revoked')
  suspendedStaffS = await seedStaff(agencyS, 'ex-suspended-staff', 'fleet_manager')
  noAgency = await createUser('ex-no-agency')
}

// ---------------------------------------------------------------------------
// Command wrappers, seeds and checks
// ---------------------------------------------------------------------------
const SCOPE_FORBIDDEN = 'forbidden_scope'
const NO_PROFILE_MSG = 'No agency profile found for this account.'
const SUSPENDED_MSG = 'Agency approval is required.'

const EXPENSE_TABLES = ['agency_expenses', 'agency_fuel_fills', 'agency_maintenance_items']
const REC_SQL = `SELECT public.agency_expense_record($1::uuid, $2::text, $3::bigint, $4::date, $5::text, $6::text) AS r`
const FUEL_SQL = `SELECT public.agency_fuel_fill_record($1::uuid, $2::numeric, $3::numeric, $4::boolean, $5::bigint, $6::date, $7::text) AS r`
const UPSERT_SQL = `SELECT public.agency_maintenance_item_upsert($1::uuid, $2::text, $3::int, $4::int, $5::numeric, $6::date, $7::int) AS r`
const SERVICE_SQL = `SELECT public.agency_maintenance_service_done($1::uuid, $2::numeric, $3::date, $4::int, $5::bigint, $6::text) AS r`
const SUMMARY_SQL = `SELECT public.agency_expense_summary($1::date, $2::date) AS r`

/** Schema precheck: every negative case calls this so a missing table can never pass a refusal. */
async function requireSchema() {
  const r = await suOne(
    `SELECT to_regclass('public.agency_expenses') IS NOT NULL AS e,
            to_regclass('public.agency_fuel_fills') IS NOT NULL AS f,
            to_regclass('public.agency_maintenance_items') IS NOT NULL AS m`
  )
  expect(r.e && r.f && r.m, `expense tables missing: migration ${EXP_FILE} is not applied yet`)
}

/** Runs one command as `userId`. Resolves { r } on return, { raised } when the database raised. */
async function callOutcome(userId, sql, params) {
  try {
    const r = await asActor(userId, async () => parseJson((await db.query(sql, params)).rows[0].r))
    return { r }
  } catch (error) {
    return { raised: firstLine(error) }
  }
}

/** Expense record. Defaults: own truck, fuel, 1500 paise, 2025-06-01, fresh key. */
async function recordExpense(userId, o = {}) {
  const truck = 'truck' in o ? o.truck : truckA1
  return callOutcome(userId, REC_SQL, [
    truck,
    o.category ?? 'fuel',
    o.amount ?? 1500,
    o.spentOn ?? '2025-06-01',
    'note' in o ? o.note : 'Diesel',
    o.key ?? nx('exp-key'),
  ])
}

async function fuelFill(userId, o) {
  return callOutcome(userId, FUEL_SQL, [
    o.truck ?? truckA1,
    o.odometer,
    o.litres ?? 100,
    o.fullTank ?? true,
    o.amount ?? 9000,
    o.filledOn ?? '2025-06-01',
    o.key ?? nx('fuel-key'),
  ])
}

async function upsertItem(userId, o) {
  return callOutcome(userId, UPSERT_SQL, [
    o.truck ?? truckA1,
    o.name,
    o.intervalKm ?? null,
    o.intervalDays ?? null,
    o.lastKm ?? null,
    o.lastOn ?? null,
    o.expectedVersion ?? null,
  ])
}

async function serviceDone(userId, o) {
  return callOutcome(userId, SERVICE_SQL, [
    o.item,
    o.serviceKm,
    o.serviceOn ?? '2025-03-01',
    o.expectedVersion,
    o.cost ?? 0,
    o.key ?? nx('svc-key'),
  ])
}

async function summary(userId, from, to) {
  return callOutcome(userId, SUMMARY_SQL, [from, to])
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

/** Visible row count for an actor, filtered to one agency (RLS applied). */
async function visibleCount(who, table, agencyId) {
  return asActor(who, async () => {
    const r = await db.query(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])
    return r.rows[0].n
  })
}

async function totalCount(table, agencyId) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])).n
}

async function expenseRowsWithKey(agencyId, key) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_expenses WHERE agency_id = $1 AND idempotency_key = $2`, [agencyId, key])).n
}

async function expenseRowByKey(agencyId, key) {
  return suOne(
    `SELECT *, spent_on::text AS spent_on_txt FROM public.agency_expenses WHERE agency_id = $1 AND idempotency_key = $2`,
    [agencyId, key]
  )
}

async function columnsOf(table) {
  const rows = (
    await su(
      `SELECT column_name, data_type, is_nullable, numeric_precision, numeric_scale
         FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    )
  ).rows
  return Object.fromEntries(rows.map((r) => [r.column_name, r]))
}

/** spec: { column: [data_type, nullable?] } */
function expectColumns(cols, table, spec) {
  const failures = []
  for (const [name, [type, nullable]] of Object.entries(spec)) {
    const c = cols[name]
    if (!c) {
      failures.push(`${name} missing`)
      continue
    }
    if (c.data_type !== type) failures.push(`${name} type ${c.data_type}, expected ${type}`)
    if (nullable !== undefined && (c.is_nullable === 'YES') !== nullable) failures.push(`${name} nullable mismatch`)
  }
  expect(failures.length === 0, `${table}: ${failures.join('; ')}`)
}

// Seeds (superuser). Used by read, direct-write, service and summary cases.
async function seedExpense({ agencyId, truckId = null, category = 'fuel', amount = 1000, spentOn = '2025-06-01', createdBy = null }) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_expenses (id, agency_id, truck_id, category, amount_paise, spent_on, note, idempotency_key, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'seed', $7, $8)`,
    [id, agencyId, truckId, category, amount, spentOn, nx('seed-exp'), createdBy]
  )
  return id
}

async function seedFill({ agencyId, truckId, odometer, expenseId }) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_fuel_fills (id, agency_id, truck_id, odometer_km, litres, full_tank, expense_id, filled_on)
     VALUES ($1, $2, $3, $4, 50, true, $5, '2025-06-01')`,
    [id, agencyId, truckId, odometer, expenseId]
  )
  return id
}

async function seedItem({ agencyId, truckId, name, intervalKm = 10000, intervalDays = null, lastKm = 1000, lastOn = '2025-01-01' }) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_maintenance_items (id, agency_id, truck_id, name, interval_km, interval_days, last_service_km, last_service_on, version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1)`,
    [id, agencyId, truckId, name, intervalKm, intervalDays, lastKm, lastOn]
  )
  return id
}

async function itemRow(id) {
  return suOne(
    `SELECT *, last_service_on::text AS last_on_txt FROM public.agency_maintenance_items WHERE id = $1`,
    [id]
  )
}

async function itemByName(truckId, name) {
  return suOne(`SELECT id, version, interval_km, interval_days FROM public.agency_maintenance_items WHERE truck_id = $1 AND name = $2`, [truckId, name])
}

async function itemCountByName(truckId, name) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_maintenance_items WHERE truck_id = $1 AND name = $2`, [truckId, name])).n
}

async function fillCountForTruck(truckId) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_fuel_fills WHERE truck_id = $1`, [truckId])).n
}

async function maintenanceExpenseCount(truckId) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_expenses WHERE truck_id = $1 AND category = 'maintenance'`, [truckId])).n
}

/** Grant check for one RPC: authenticated and service_role yes, anon and PUBLIC no. */
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

/** Signature, return type, SECURITY DEFINER, pinned search_path and no agency argument. */
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

const COMMANDS = [
  ['agency_expense_record', 'public.agency_expense_record(uuid,text,bigint,date,text,text)',
    'p_truck_id uuid, p_category text, p_amount_paise bigint, p_spent_on date, p_note text, p_idempotency_key text'],
  ['agency_fuel_fill_record', 'public.agency_fuel_fill_record(uuid,numeric,numeric,boolean,bigint,date,text)',
    'p_truck_id uuid, p_odometer_km numeric, p_litres numeric, p_full_tank boolean, p_amount_paise bigint, p_filled_on date, p_idempotency_key text'],
  ['agency_maintenance_item_upsert', 'public.agency_maintenance_item_upsert(uuid,text,integer,integer,numeric,date,integer)',
    'p_truck_id uuid, p_name text, p_interval_km integer, p_interval_days integer, p_last_service_km numeric, p_last_service_on date, p_expected_version integer'],
  ['agency_maintenance_service_done', 'public.agency_maintenance_service_done(uuid,numeric,date,integer,bigint,text)',
    'p_item_id uuid, p_service_km numeric, p_service_on date, p_expected_version integer, p_cost_paise bigint, p_idempotency_key text'],
  ['agency_expense_summary', 'public.agency_expense_summary(date,date)', 'p_from date, p_to date'],
]

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  const last = applied[applied.length - 1]

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations applied: ${applied.length} (last=${last})`)
  await setupFixtures()

  // =========================================================================
  // A. Migration and schema shape
  // =========================================================================
  await testCase('E01. migration 20261022000000_agency_expenses.sql exists under supabase/migrations', async () => {
    expect(existsSync(join(MIGRATIONS_DIR, EXP_FILE)), `missing file supabase/migrations/${EXP_FILE}`)
  })

  await testCase('E02. agency_expenses, agency_fuel_fills and agency_maintenance_items tables exist', async () => {
    await requireSchema()
  })

  await testCase('E03. agency_expenses columns and types match the contract', async () => {
    await requireSchema()
    expectColumns(await columnsOf('agency_expenses'), 'agency_expenses', {
      id: ['uuid', false],
      agency_id: ['uuid', false],
      truck_id: ['uuid', true],
      category: ['text', false],
      amount_paise: ['bigint', false],
      spent_on: ['date', false],
      note: ['text', true],
      idempotency_key: ['text', false],
      created_by: ['uuid', true],
      created_at: ['timestamp with time zone', false],
    })
  })

  await testCase('E04. agency_fuel_fills and agency_maintenance_items columns match the contract', async () => {
    await requireSchema()
    const fills = await columnsOf('agency_fuel_fills')
    const items = await columnsOf('agency_maintenance_items')
    const failures = []
    try {
      expectColumns(fills, 'agency_fuel_fills', {
        id: ['uuid', false],
        agency_id: ['uuid', false],
        truck_id: ['uuid', false],
        odometer_km: ['numeric', false],
        litres: ['numeric', false],
        full_tank: ['boolean', false],
        expense_id: ['uuid', true],
        filled_on: ['date', false],
      })
    } catch (e) {
      failures.push(firstLine(e))
    }
    try {
      expectColumns(items, 'agency_maintenance_items', {
        id: ['uuid', false],
        agency_id: ['uuid', false],
        truck_id: ['uuid', false],
        name: ['text', false],
        interval_km: ['integer', true],
        interval_days: ['integer', true],
        last_service_km: ['numeric', true],
        last_service_on: ['date', true],
        version: ['integer', false],
      })
    } catch (e) {
      failures.push(firstLine(e))
    }
    if (fills.litres && (fills.litres.numeric_precision !== 8 || fills.litres.numeric_scale !== 2)) {
      failures.push(`litres is numeric(${fills.litres.numeric_precision},${fills.litres.numeric_scale}), expected numeric(8,2)`)
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('E05. row level security is enabled on all three expense tables', async () => {
    await requireSchema()
    const rows = (
      await su(
        `SELECT relname, relrowsecurity FROM pg_class
          WHERE relnamespace = 'public'::regnamespace AND relname = ANY($1::text[])`,
        [EXPENSE_TABLES]
      )
    ).rows
    const off = EXPENSE_TABLES.filter((t) => !rows.find((r) => r.relname === t && r.relrowsecurity === true))
    expect(off.length === 0, `RLS not enabled on: ${off.join(', ')}`)
  })

  await testCase('E06. amount_paise rejects zero and negative amounts at the table level', async () => {
    await requireSchema()
    await gather([
      ['zero', () => expectRaises(su(`INSERT INTO public.agency_expenses (agency_id, category, amount_paise, spent_on, idempotency_key) VALUES ($1, 'other', 0, '2025-06-01', $2)`, [agencyA, nx('chk0')]), 'violates check constraint')],
      ['negative', () => expectRaises(su(`INSERT INTO public.agency_expenses (agency_id, category, amount_paise, spent_on, idempotency_key) VALUES ($1, 'other', -5, '2025-06-01', $2)`, [agencyA, nx('chkn')]), 'violates check constraint')],
    ])
  })

  await testCase('E07. unique (agency_id, idempotency_key) is enforced at the table level', async () => {
    await requireSchema()
    const key = nx('uniq')
    await su(`INSERT INTO public.agency_expenses (agency_id, category, amount_paise, spent_on, idempotency_key) VALUES ($1, 'other', 100, '2025-06-01', $2)`, [agencyA, key])
    await expectRaises(
      su(`INSERT INTO public.agency_expenses (agency_id, category, amount_paise, spent_on, idempotency_key) VALUES ($1, 'other', 200, '2025-06-01', $2)`, [agencyA, key]),
      'duplicate key value violates unique constraint'
    )
  })

  await testCase('E08. fuel fill expense_id references agency_expenses (foreign key)', async () => {
    await requireSchema()
    await expectRaises(
      su(
        `INSERT INTO public.agency_fuel_fills (agency_id, truck_id, odometer_km, litres, full_tank, expense_id, filled_on)
         VALUES ($1, $2, 100, 10, true, $3, '2025-06-01')`,
        [agencyA, truckA1, uid()]
      ),
      'violates foreign key constraint'
    )
  })

  await testCase('E09. expense truck_id references agency_trucks (foreign key)', async () => {
    await requireSchema()
    await expectRaises(
      su(
        `INSERT INTO public.agency_expenses (agency_id, truck_id, category, amount_paise, spent_on, idempotency_key)
         VALUES ($1, $2, 'fuel', 100, '2025-06-01', $3)`,
        [agencyA, uid(), nx('fk')]
      ),
      'violates foreign key constraint'
    )
  })

  // =========================================================================
  // B. Grants and command signatures
  // =========================================================================
  for (const [i, [name, sig]] of COMMANDS.entries()) {
    await testCase(`E${String(10 + i).padStart(2, '0')}. ${name}: EXECUTE for authenticated and service_role only`, async () => {
      await requireSchema()
      const failures = await rpcGrantFailures(sig)
      expect(failures.length === 0, failures.join('; '))
    })
  }

  for (const [i, [name, , args]] of COMMANDS.entries()) {
    await testCase(`E${String(15 + i).padStart(2, '0')}. ${name} signature is (${args.split(',').length} params), returns jsonb, SECURITY DEFINER, no agency argument`, async () => {
      await requireSchema()
      const failures = await rpcDefinitionFailures(name, args)
      expect(failures.length === 0, failures.join('; '))
    })
  }

  await testCase('E20. no delete or remove command exists for expenses, fills or maintenance', async () => {
    await requireSchema()
    const rows = (
      await su(
        `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname ~ '(expense|fuel|maintenance)' AND p.proname ~ '(delete|remove)'`
      )
    ).rows
    expect(rows.length === 0, `delete-like commands exist: ${rows.map((r) => r.proname).join(', ')}`)
  })

  // =========================================================================
  // C. Direct writes and RLS reads
  // =========================================================================
  await testCase('E21. owner cannot INSERT an expense directly', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyA)
    const out = await dmlOutcome(ownerA, `INSERT INTO public.agency_expenses (agency_id, category, amount_paise, spent_on, idempotency_key) VALUES ($1, 'other', 100, '2025-06-01', $2)`, [agencyA, nx('direct')])
    expect(out.error !== undefined, 'direct INSERT was accepted')
    expect((await totalCount('agency_expenses', agencyA)) === before, 'direct INSERT wrote a row')
  })

  await testCase('E22. fleet manager cannot INSERT an expense directly', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyA)
    const out = await dmlOutcome(fleetA, `INSERT INTO public.agency_expenses (agency_id, category, amount_paise, spent_on, idempotency_key) VALUES ($1, 'other', 100, '2025-06-01', $2)`, [agencyA, nx('direct')])
    expect(out.error !== undefined, 'direct INSERT by fleet manager was accepted')
    expect((await totalCount('agency_expenses', agencyA)) === before, 'direct INSERT wrote a row')
  })

  await testCase('E23. owner cannot INSERT a fuel fill or a maintenance item directly', async () => {
    await requireSchema()
    const expId = await seedExpense({ agencyId: agencyA, truckId: truckA1 })
    const fillBefore = await totalCount('agency_fuel_fills', agencyA)
    const itemBefore = await totalCount('agency_maintenance_items', agencyA)
    const f = await dmlOutcome(ownerA, `INSERT INTO public.agency_fuel_fills (agency_id, truck_id, odometer_km, litres, full_tank, expense_id, filled_on) VALUES ($1, $2, 100, 10, true, $3, '2025-06-01')`, [agencyA, truckA1, expId])
    const m = await dmlOutcome(ownerA, `INSERT INTO public.agency_maintenance_items (agency_id, truck_id, name, interval_km, version) VALUES ($1, $2, 'Direct', 5000, 1)`, [agencyA, truckA1])
    expect(f.error !== undefined && m.error !== undefined, `direct INSERT accepted (fill=${f.error ? 'denied' : 'accepted'}, item=${m.error ? 'denied' : 'accepted'})`)
    expect((await totalCount('agency_fuel_fills', agencyA)) === fillBefore, 'direct fill INSERT wrote a row')
    expect((await totalCount('agency_maintenance_items', agencyA)) === itemBefore, 'direct item INSERT wrote a row')
  })

  await testCase('E24. owner cannot UPDATE an expense directly (amount unchanged)', async () => {
    await requireSchema()
    const id = await seedExpense({ agencyId: agencyA, truckId: truckA1, amount: 4321 })
    await dmlOutcome(ownerA, `UPDATE public.agency_expenses SET amount_paise = 1 WHERE id = $1`, [id])
    const row = await suOne(`SELECT amount_paise::int AS a FROM public.agency_expenses WHERE id = $1`, [id])
    expect(row && row.a === 4321, `direct UPDATE changed amount to ${row && row.a}`)
  })

  await testCase('E25. owner cannot DELETE an expense directly (row remains)', async () => {
    await requireSchema()
    const id = await seedExpense({ agencyId: agencyA, truckId: truckA1 })
    const out = await dmlOutcome(ownerA, `DELETE FROM public.agency_expenses WHERE id = $1`, [id])
    const still = await suOne(`SELECT count(*)::int AS n FROM public.agency_expenses WHERE id = $1`, [id])
    expect(out.error !== undefined || still.n === 1, 'direct DELETE removed the expense')
    expect(still.n === 1, 'expense row is gone after direct DELETE')
  })

  await testCase('E26. owner cannot DELETE a fuel fill or a maintenance item directly', async () => {
    await requireSchema()
    const expId = await seedExpense({ agencyId: agencyA, truckId: truckA1 })
    const fillId = await seedFill({ agencyId: agencyA, truckId: truckA1, odometer: 777, expenseId: expId })
    const itemId = await seedItem({ agencyId: agencyA, truckId: truckA1, name: `del-${nonce}` })
    const f = await dmlOutcome(ownerA, `DELETE FROM public.agency_fuel_fills WHERE id = $1`, [fillId])
    const m = await dmlOutcome(ownerA, `DELETE FROM public.agency_maintenance_items WHERE id = $1`, [itemId])
    const fRow = await suOne(`SELECT count(*)::int AS n FROM public.agency_fuel_fills WHERE id = $1`, [fillId])
    const mRow = await suOne(`SELECT count(*)::int AS n FROM public.agency_maintenance_items WHERE id = $1`, [itemId])
    expect(fRow.n === 1 && mRow.n === 1, `direct DELETE removed rows (fill=${f.error ? 'denied' : 'ok'}, item=${m.error ? 'denied' : 'ok'})`)
  })

  await testCase('E27. fleet manager cannot DELETE an expense directly', async () => {
    await requireSchema()
    const id = await seedExpense({ agencyId: agencyA, truckId: truckA1 })
    await dmlOutcome(fleetA, `DELETE FROM public.agency_expenses WHERE id = $1`, [id])
    const still = await suOne(`SELECT count(*)::int AS n FROM public.agency_expenses WHERE id = $1`, [id])
    expect(still.n === 1, 'fleet manager direct DELETE removed the expense')
  })

  await testCase('E28. anon reads no expense, fill or maintenance rows', async () => {
    await requireSchema()
    await seedExpense({ agencyId: agencyA, truckId: truckA1 })
    const leaked = []
    for (const t of EXPENSE_TABLES) {
      try {
        const r = await asAnon(`SELECT count(*)::int AS n FROM public.${t}`)
        if (r.rows[0].n !== 0) leaked.push(`${t}=${r.rows[0].n}`)
      } catch {
        // Permission denied is also "no access".
      }
    }
    expect(leaked.length === 0, `anon can read: ${leaked.join(', ')}`)
  })

  await testCase('E29. owner sees every expense of its own agency', async () => {
    await requireSchema()
    const total = await totalCount('agency_expenses', agencyA)
    expect(total >= 1, 'precondition: no expenses seeded for agency A')
    expect((await visibleCount(ownerA, 'agency_expenses', agencyA)) === total, 'owner sees fewer rows than exist')
  })

  await testCase('E30. fleet manager, finance, dispatcher and viewer all read their agency expenses', async () => {
    await requireSchema()
    const total = await totalCount('agency_expenses', agencyA)
    const failures = []
    for (const [label, who] of [['fleet_manager', fleetA], ['finance', financeA], ['dispatcher', dispatcherA], ['viewer', viewerA]]) {
      const n = await visibleCount(who, 'agency_expenses', agencyA)
      if (n !== total) failures.push(`${label} sees ${n} of ${total}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('E31. owner of agency B reads zero expense rows of agency A', async () => {
    await requireSchema()
    expect((await visibleCount(ownerB, 'agency_expenses', agencyA)) === 0, 'other agency can read agency A expenses')
  })

  await testCase('E32. revoked member and no-agency user read zero expense rows', async () => {
    await requireSchema()
    const a = await visibleCount(revokedA, 'agency_expenses', agencyA)
    const b = await visibleCount(noAgency, 'agency_expenses', agencyA)
    expect(a === 0 && b === 0, `revoked sees ${a}, no-agency sees ${b}`)
  })

  await testCase('E33. suspended-agency staff read zero rows of their own agency and of agency A', async () => {
    await requireSchema()
    await seedExpense({ agencyId: agencyS, truckId: truckS1 })
    const own = await visibleCount(suspendedStaffS, 'agency_expenses', agencyS)
    const other = await visibleCount(suspendedStaffS, 'agency_expenses', agencyA)
    expect(own === 0 && other === 0, `suspended staff sees ${own} of S and ${other} of A`)
  })

  await testCase('E34. fuel fills and maintenance items: agency staff read own rows, other agency reads none', async () => {
    await requireSchema()
    const expId = await seedExpense({ agencyId: agencyA, truckId: truckA1 })
    await seedFill({ agencyId: agencyA, truckId: truckA1, odometer: 1234, expenseId: expId })
    await seedItem({ agencyId: agencyA, truckId: truckA1, name: `read-${nonce}` })
    const failures = []
    for (const t of ['agency_fuel_fills', 'agency_maintenance_items']) {
      const total = await totalCount(t, agencyA)
      const viewer = await visibleCount(viewerA, t, agencyA)
      if (viewer !== total) failures.push(`${t}: viewer sees ${viewer} of ${total}`)
      const other = await visibleCount(ownerB, t, agencyA)
      if (other !== 0) failures.push(`${t}: other agency sees ${other}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // D. agency_expense_record
  // =========================================================================
  await testCase('E35. owner records a fuel expense: ok, replay false, stored with actor and amounts', async () => {
    await requireSchema()
    const key = nx('e35')
    const out = await recordExpense(ownerA, { truck: truckA1, category: 'fuel', amount: 1500, spentOn: '2025-06-01', note: 'Diesel', key })
    expect(!out.raised, `raised: ${out.raised}`)
    expect(out.r && out.r.ok === true, `expected ok:true, got ${JSON.stringify(out.r)}`)
    expect(out.r.replay === false, `first call replay=${out.r.replay}, expected false`)
    expect(typeof out.r.expense_id === 'string' && UUID_RE.test(out.r.expense_id), `expense_id ${JSON.stringify(out.r.expense_id)}`)
    const row = await expenseRowByKey(agencyA, key)
    expect(row, 'no expense row stored')
    expect(row.id === out.r.expense_id, 'stored id differs from expense_id')
    expect(row.truck_id === truckA1 && row.category === 'fuel', `truck/category ${row.truck_id}/${row.category}`)
    expect(Number(row.amount_paise) === 1500, `amount_paise ${row.amount_paise}`)
    expect(row.spent_on_txt === '2025-06-01', `spent_on ${row.spent_on_txt}`)
    expect(row.created_by === ownerA, `created_by ${row.created_by}`)
  })

  await testCase('E36. fleet manager may record an expense', async () => {
    await requireSchema()
    const out = await recordExpense(fleetA, { truck: truckA1, category: 'toll', amount: 300 })
    expect(out.r && out.r.ok === true, `fleet manager refused: ${JSON.stringify(out.r ?? out.raised)}`)
  })

  await testCase('E37. finance may record an expense', async () => {
    await requireSchema()
    const out = await recordExpense(financeA, { truck: truckA1, category: 'toll', amount: 310 })
    expect(out.r && out.r.ok === true, `finance refused: ${JSON.stringify(out.r ?? out.raised)}`)
  })

  await testCase('E38. viewer write returns forbidden_scope and writes nothing', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyA)
    const out = await recordExpense(viewerA, { truck: truckA1 })
    expect(!out.raised && out.r && out.r.ok === false && out.r.error === SCOPE_FORBIDDEN, `viewer got ${JSON.stringify(out.r ?? out.raised)}`)
    expect((await totalCount('agency_expenses', agencyA)) === before, 'viewer write left a row')
  })

  await testCase('E39. dispatcher write returns forbidden_scope and writes nothing', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyA)
    const out = await recordExpense(dispatcherA, { truck: truckA1 })
    expect(!out.raised && out.r && out.r.ok === false && out.r.error === SCOPE_FORBIDDEN, `dispatcher got ${JSON.stringify(out.r ?? out.raised)}`)
    expect((await totalCount('agency_expenses', agencyA)) === before, 'dispatcher write left a row')
  })

  await testCase('E40. revoked member write is refused and writes nothing', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyA)
    const out = await recordExpense(revokedA, { truck: truckA1 })
    const refused = out.raised !== undefined || (out.r && out.r.ok === false)
    expect(refused, `revoked member accepted: ${JSON.stringify(out.r)}`)
    expect((await totalCount('agency_expenses', agencyA)) === before, 'revoked write left a row')
  })

  await testCase('E41. active staff of an unapproved agency is blocked with the approval message', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyS)
    const out = await recordExpense(suspendedStaffS, { truck: truckS1 })
    expect(out.raised === SUSPENDED_MSG, `expected exactly "${SUSPENDED_MSG}", got ${JSON.stringify(out.raised ?? out.r)}`)
    expect((await totalCount('agency_expenses', agencyS)) === before, 'blocked staff wrote a row for agency S')
  })

  await testCase('E42. user with no agency is blocked with the no-profile message', async () => {
    await requireSchema()
    const out = await recordExpense(noAgency, { truck: truckA1 })
    expect(out.raised === NO_PROFILE_MSG, `expected exactly "${NO_PROFILE_MSG}", got ${JSON.stringify(out.raised ?? out.r)}`)
  })

  await testCase('E43. every contract category is accepted (truck attached for vehicle categories)', async () => {
    await requireSchema()
    const failures = []
    for (const category of ['fuel', 'toll', 'maintenance', 'driver_allowance']) {
      const out = await recordExpense(ownerA, { truck: truckA1, category, amount: 50 })
      if (!(out.r && out.r.ok === true)) failures.push(`${category}: ${JSON.stringify(out.r ?? out.raised)}`)
    }
    for (const category of ['insurance', 'permit', 'other']) {
      const out = await recordExpense(ownerA, { truck: null, category, amount: 50 })
      if (!(out.r && out.r.ok === true)) failures.push(`${category} (no truck): ${JSON.stringify(out.r ?? out.raised)}`)
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('E44. unknown category is refused with invalid_category and writes nothing', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyA)
    const out = await recordExpense(ownerA, { truck: truckA1, category: 'lunch' })
    expectResult(out.r, 'invalid_category')
    expect((await totalCount('agency_expenses', agencyA)) === before, 'invalid category left a row')
  })

  await testCase('E45. amounts of 0, -5 and 100000001 paise are refused with invalid_amount', async () => {
    await requireSchema()
    const before = await totalCount('agency_expenses', agencyA)
    const failures = []
    for (const amount of [0, -5, 100000001]) {
      const out = await recordExpense(ownerA, { truck: truckA1, amount })
      if (!(out.r && out.r.ok === false && out.r.error === 'invalid_amount')) failures.push(`${amount}: ${JSON.stringify(out.r ?? out.raised)}`)
    }
    expect(failures.length === 0, failures.join(' ; '))
    expect((await totalCount('agency_expenses', agencyA)) === before, 'invalid amount left a row')
  })

  await testCase('E46. amount of exactly 100000000 paise is accepted (upper bound)', async () => {
    await requireSchema()
    const out = await recordExpense(ownerA, { truck: truckA2, amount: 100000000, category: 'permit' })
    expect(out.r && out.r.ok === true, `boundary amount refused: ${JSON.stringify(out.r ?? out.raised)}`)
  })

  await testCase('E47. a spent_on date in the future is refused with future_date', async () => {
    await requireSchema()
    const out = await recordExpense(ownerA, { truck: truckA1, spentOn: '2099-01-01' })
    expectResult(out.r, 'future_date')
  })

  await testCase('E48. a truck of another agency is refused with truck_not_found and writes nothing', async () => {
    await requireSchema()
    const beforeA = await totalCount('agency_expenses', agencyA)
    const beforeB = await totalCount('agency_expenses', agencyB)
    const out = await recordExpense(ownerA, { truck: truckB1 })
    expectResult(out.r, 'truck_not_found')
    expect((await totalCount('agency_expenses', agencyA)) === beforeA, 'cross-agency attempt left a row for A')
    expect((await totalCount('agency_expenses', agencyB)) === beforeB, 'cross-agency attempt left a row for B')
  })

  await testCase('E49. a note of 301 characters is refused; 300 characters is accepted', async () => {
    await requireSchema()
    const long = await recordExpense(ownerA, { truck: truckA1, note: 'x'.repeat(301) })
    expectResult(long.r, 'note_too_long')
    const edge = await recordExpense(ownerA, { truck: truckA1, note: 'y'.repeat(300) })
    expect(edge.r && edge.r.ok === true, `300-character note refused: ${JSON.stringify(edge.r ?? edge.raised)}`)
  })

  await testCase('E50. fuel, toll, maintenance and driver_allowance without a truck are refused with truck_required', async () => {
    await requireSchema()
    const failures = []
    for (const category of ['fuel', 'toll', 'maintenance', 'driver_allowance']) {
      const out = await recordExpense(ownerA, { truck: null, category })
      if (!(out.r && out.r.ok === false && out.r.error === 'truck_required')) failures.push(`${category}: ${JSON.stringify(out.r ?? out.raised)}`)
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('E51. replaying the same key and payload returns the same expense with replay true, no new row', async () => {
    await requireSchema()
    const key = nx('e51')
    const first = await recordExpense(ownerA, { truck: truckA1, amount: 900, key })
    expect(first.r && first.r.ok === true && first.r.replay === false, `first call ${JSON.stringify(first.r ?? first.raised)}`)
    const countAfterFirst = await expenseRowsWithKey(agencyA, key)
    const replay = await recordExpense(ownerA, { truck: truckA1, amount: 900, key })
    expect(replay.r && replay.r.ok === true && replay.r.replay === true, `replay ${JSON.stringify(replay.r ?? replay.raised)}`)
    expect(replay.r.expense_id === first.r.expense_id, 'replay returned a different expense_id')
    expect((await expenseRowsWithKey(agencyA, key)) === countAfterFirst && countAfterFirst === 1, 'replay created an extra row')
  })

  await testCase('E52. same key with a different payload is refused with idempotency_key_reused and stored row unchanged', async () => {
    await requireSchema()
    const key = nx('e52')
    const first = await recordExpense(ownerA, { truck: truckA1, amount: 700, key })
    expect(first.r && first.r.ok === true, `first call ${JSON.stringify(first.r ?? first.raised)}`)
    const other = await recordExpense(ownerA, { truck: truckA1, amount: 701, key })
    expectResult(other.r, 'idempotency_key_reused')
    const row = await expenseRowByKey(agencyA, key)
    expect(Number(row.amount_paise) === 700, `stored amount ${row.amount_paise}, expected 700`)
  })

  await testCase('E53. three sequential duplicates with one key create exactly one row', async () => {
    await requireSchema()
    const key = nx('e53')
    const replays = []
    for (let i = 0; i < 3; i++) replays.push(await recordExpense(ownerA, { truck: truckA1, amount: 450, key }))
    expect(replays.every((o) => o.r && o.r.ok === true), `a duplicate was refused: ${JSON.stringify(replays.map((o) => o.r ?? o.raised))}`)
    expect((await expenseRowsWithKey(agencyA, key)) === 1, `rows with that key: ${await expenseRowsWithKey(agencyA, key)}`)
    expect(replays[1].r.replay === true && replays[2].r.replay === true, 'later duplicates did not report replay true')
  })

  await testCase('E54. the same key used by agency B creates its own row (keys are per agency)', async () => {
    await requireSchema()
    const key = nx('e54')
    const a = await recordExpense(ownerA, { truck: truckA1, amount: 111, key })
    const b = await recordExpense(ownerB, { truck: truckB1, amount: 222, key })
    expect(a.r && a.r.ok === true && a.r.replay === false, `agency A ${JSON.stringify(a.r ?? a.raised)}`)
    expect(b.r && b.r.ok === true && b.r.replay === false, `agency B ${JSON.stringify(b.r ?? b.raised)}`)
    expect((await expenseRowsWithKey(agencyA, key)) === 1 && (await expenseRowsWithKey(agencyB, key)) === 1, 'keys collided across agencies')
  })

  // =========================================================================
  // E. agency_fuel_fill_record (expense and fill in one transaction)
  // =========================================================================
  await testCase('E55. a valid fuel fill creates one fill and one fuel expense linked by expense_id', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const key = nx('e55')
    const beforeExp = await totalCount('agency_expenses', agencyA)
    const out = await fuelFill(ownerA, { truck, odometer: 5000, litres: 120.5, amount: 9500, key })
    expect(out.r && out.r.ok === true, `fuel fill refused: ${JSON.stringify(out.r ?? out.raised)}`)
    expect((await totalCount('agency_expenses', agencyA)) === beforeExp + 1, 'expected exactly one new expense')
    expect((await fillCountForTruck(truck)) === 1, 'expected exactly one fill for the truck')
    const fill = await suOne(`SELECT f.expense_id, f.litres::float8 AS litres, f.full_tank, f.odometer_km::float8 AS km FROM public.agency_fuel_fills f WHERE truck_id = $1`, [truck])
    const exp = await suOne(`SELECT id, category, amount_paise::int AS amount, truck_id FROM public.agency_expenses WHERE id = $1`, [fill.expense_id])
    expect(exp && exp.category === 'fuel' && exp.amount === 9500 && exp.truck_id === truck, `linked expense ${JSON.stringify(exp)}`)
    expect(fill.litres === 120.5 && fill.full_tank === true && fill.km === 5000, `fill stored as ${JSON.stringify(fill)}`)
  })

  await testCase('E56. a fill whose odometer does not exceed the previous reading is refused with previous_km', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const first = await fuelFill(ownerA, { truck, odometer: 2000 })
    expect(first.r && first.r.ok === true, `setup fill refused: ${JSON.stringify(first.r ?? first.raised)}`)
    const beforeExp = await totalCount('agency_expenses', agencyA)
    const equal = await fuelFill(ownerA, { truck, odometer: 2000 })
    expect(equal.r && equal.r.ok === false && equal.r.error === 'odometer_not_increasing', `equal odometer ${JSON.stringify(equal.r ?? equal.raised)}`)
    expect(Number(equal.r.previous_km) === 2000, `previous_km ${equal.r.previous_km}, expected 2000`)
    expect((await fillCountForTruck(truck)) === 1, 'refused fill left a fill row')
    expect((await totalCount('agency_expenses', agencyA)) === beforeExp, 'refused fill left an orphan expense')
  })

  await testCase('E57. a fill with a lower odometer is refused and leaves no fill or expense (atomic)', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    await fuelFill(ownerA, { truck, odometer: 3000 })
    const beforeExp = await totalCount('agency_expenses', agencyA)
    const lower = await fuelFill(ownerA, { truck, odometer: 2500 })
    expect(lower.r && lower.r.ok === false && lower.r.error === 'odometer_not_increasing', `lower odometer ${JSON.stringify(lower.r ?? lower.raised)}`)
    expect(Number(lower.r.previous_km) === 3000, `previous_km ${lower.r.previous_km}`)
    expect((await fillCountForTruck(truck)) === 1, 'lower odometer left a fill row')
    expect((await totalCount('agency_expenses', agencyA)) === beforeExp, 'lower odometer left an expense row')
  })

  await testCase('E58. a strictly higher odometer after a fill is accepted', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    await fuelFill(ownerA, { truck, odometer: 4000 })
    const next = await fuelFill(ownerA, { truck, odometer: 4100 })
    expect(next.r && next.r.ok === true, `higher odometer refused: ${JSON.stringify(next.r ?? next.raised)}`)
  })

  await testCase('E59. litres of 0 and 1001 are refused with invalid_litres and write nothing', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const beforeExp = await totalCount('agency_expenses', agencyA)
    const zero = await fuelFill(ownerA, { truck, odometer: 100, litres: 0 })
    const big = await fuelFill(ownerA, { truck, odometer: 100, litres: 1001 })
    expectResult(zero.r, 'invalid_litres')
    expectResult(big.r, 'invalid_litres')
    expect((await fillCountForTruck(truck)) === 0, 'invalid litres left a fill row')
    expect((await totalCount('agency_expenses', agencyA)) === beforeExp, 'invalid litres left an expense row')
  })

  await testCase('E60. litres of exactly 1 and exactly 1000 are accepted (bounds)', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const low = await fuelFill(ownerA, { truck, odometer: 100, litres: 1 })
    const high = await fuelFill(ownerA, { truck, odometer: 200, litres: 1000 })
    expect(low.r && low.r.ok === true, `litres 1 refused: ${JSON.stringify(low.r ?? low.raised)}`)
    expect(high.r && high.r.ok === true, `litres 1000 refused: ${JSON.stringify(high.r ?? high.raised)}`)
  })

  await testCase('E61. a fill with an invalid amount rolls back: no fill and no orphan expense', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const beforeExp = await totalCount('agency_expenses', agencyA)
    const out = await fuelFill(ownerA, { truck, odometer: 300, amount: 0 })
    const refused = out.raised !== undefined || (out.r && out.r.ok === false)
    expect(refused, `zero-amount fill accepted: ${JSON.stringify(out.r)}`)
    expect((await fillCountForTruck(truck)) === 0, 'failed fill left a fill row')
    expect((await totalCount('agency_expenses', agencyA)) === beforeExp, 'failed fill left an orphan expense')
  })

  await testCase('E62. replaying a fuel fill with the same key and payload creates nothing new', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const key = nx('e62')
    const first = await fuelFill(ownerA, { truck, odometer: 900, key })
    expect(first.r && first.r.ok === true, `first ${JSON.stringify(first.r ?? first.raised)}`)
    const beforeExp = await totalCount('agency_expenses', agencyA)
    const replay = await fuelFill(ownerA, { truck, odometer: 900, key })
    expect(replay.r && replay.r.ok === true && replay.r.replay === true, `replay ${JSON.stringify(replay.r ?? replay.raised)}`)
    expect((await fillCountForTruck(truck)) === 1, 'replay created a second fill')
    expect((await totalCount('agency_expenses', agencyA)) === beforeExp, 'replay created a second expense')
  })

  await testCase('E63. a fuel fill key reused with a different payload is refused with idempotency_key_reused', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const key = nx('e63')
    const first = await fuelFill(ownerA, { truck, odometer: 1000, key })
    expect(first.r && first.r.ok === true, `first ${JSON.stringify(first.r ?? first.raised)}`)
    const other = await fuelFill(ownerA, { truck, odometer: 1100, key })
    expectResult(other.r, 'idempotency_key_reused')
    expect((await fillCountForTruck(truck)) === 1, 'reused key created a second fill')
  })

  await testCase('E64. a fuel fill for another agency truck is refused with truck_not_found and writes nothing', async () => {
    await requireSchema()
    const beforeExp = await totalCount('agency_expenses', agencyA)
    const out = await fuelFill(ownerA, { truck: truckB1, odometer: 100 })
    expectResult(out.r, 'truck_not_found')
    expect((await fillCountForTruck(truckB1)) === 0, 'cross-agency fill left a row')
    expect((await totalCount('agency_expenses', agencyA)) === beforeExp, 'cross-agency fill left an expense')
  })

  await testCase('E65. a fuel fill by a viewer returns forbidden_scope and writes nothing', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const out = await fuelFill(viewerA, { truck, odometer: 100 })
    expect(!out.raised && out.r && out.r.ok === false && out.r.error === SCOPE_FORBIDDEN, `viewer got ${JSON.stringify(out.r ?? out.raised)}`)
    expect((await fillCountForTruck(truck)) === 0, 'viewer fill left a row')
  })

  await testCase('E66. a fuel fill dated in the future is refused with future_date', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const out = await fuelFill(ownerA, { truck, odometer: 100, filledOn: '2099-01-01' })
    expectResult(out.r, 'future_date')
  })

  await testCase('E67. full_tank false is stored as given', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const out = await fuelFill(ownerA, { truck, odometer: 100, fullTank: false })
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    const fill = await suOne(`SELECT full_tank FROM public.agency_fuel_fills WHERE truck_id = $1`, [truck])
    expect(fill && fill.full_tank === false, `full_tank stored as ${fill && fill.full_tank}`)
  })

  // =========================================================================
  // F. agency_maintenance_item_upsert
  // =========================================================================
  await testCase('E68. creating an item with an interval_km only stores version 1', async () => {
    await requireSchema()
    const name = nx('Engine oil')
    const out = await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 10000, lastKm: 1000, lastOn: '2025-01-01' })
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    const row = await itemByName(truckA1, name)
    expect(row && Number(row.version) === 1 && Number(row.interval_km) === 10000 && row.interval_days === null, `stored ${JSON.stringify(row)}`)
  })

  await testCase('E69. creating an item with an interval_days only is accepted', async () => {
    await requireSchema()
    const name = nx('Fire extinguisher')
    const out = await upsertItem(ownerA, { truck: truckA1, name, intervalDays: 365, lastOn: '2025-01-01' })
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    const row = await itemByName(truckA1, name)
    expect(row && Number(row.interval_days) === 365, `interval_days ${row && row.interval_days}`)
  })

  await testCase('E70. an item with no interval at all is refused with interval_required', async () => {
    await requireSchema()
    const name = nx('No interval')
    const out = await upsertItem(ownerA, { truck: truckA1, name })
    expectResult(out.r, 'interval_required')
    expect((await itemCountByName(truckA1, name)) === 0, 'refused item was stored')
  })

  await testCase('E71. a duplicate name on create for the same truck is refused with name_exists', async () => {
    await requireSchema()
    const name = nx('Brake check')
    const first = await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 5000 })
    expect(first.r && first.r.ok === true, `setup refused: ${JSON.stringify(first.r ?? first.raised)}`)
    const dup = await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 6000 })
    expectResult(dup.r, 'name_exists')
    expect((await itemCountByName(truckA1, name)) === 1, 'duplicate name created a second item')
  })

  await testCase('E72. the same name on a different truck is allowed (unique per truck)', async () => {
    await requireSchema()
    const name = nx('Tyre rotation')
    const a = await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 8000 })
    const b = await upsertItem(ownerA, { truck: truckA2, name, intervalKm: 8000 })
    expect(a.r && a.r.ok === true && b.r && b.r.ok === true, `A=${JSON.stringify(a.r ?? a.raised)} B=${JSON.stringify(b.r ?? b.raised)}`)
  })

  await testCase('E73. update with the current expected_version bumps version to 2 and stores the new interval', async () => {
    await requireSchema()
    const name = nx('Clutch')
    const created = await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 20000 })
    expect(created.r && created.r.ok === true, `setup refused: ${JSON.stringify(created.r ?? created.raised)}`)
    const upd = await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 25000, expectedVersion: 1 })
    expect(upd.r && upd.r.ok === true, `update refused: ${JSON.stringify(upd.r ?? upd.raised)}`)
    const row = await itemByName(truckA1, name)
    expect(Number(row.version) === 2 && Number(row.interval_km) === 25000, `stored version ${row.version}, interval ${row.interval_km}`)
  })

  await testCase('E74. update with a stale expected_version is refused with version_conflict and changes nothing', async () => {
    await requireSchema()
    const name = nx('Air filter')
    await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 15000 })
    await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 16000, expectedVersion: 1 })
    const stale = await upsertItem(ownerA, { truck: truckA1, name, intervalKm: 99999, expectedVersion: 1 })
    expectResult(stale.r, 'version_conflict')
    const row = await itemByName(truckA1, name)
    expect(Number(row.version) === 2 && Number(row.interval_km) === 16000, `after conflict version ${row.version}, interval ${row.interval_km}`)
  })

  await testCase('E75. an item for another agency truck is refused with truck_not_found', async () => {
    await requireSchema()
    const name = nx('Cross agency')
    const out = await upsertItem(ownerA, { truck: truckB1, name, intervalKm: 5000 })
    expectResult(out.r, 'truck_not_found')
    expect((await itemCountByName(truckB1, name)) === 0, 'cross-agency item was stored')
  })

  await testCase('E76. viewer upsert returns forbidden_scope; fleet manager and finance may upsert', async () => {
    await requireSchema()
    const viewerName = nx('Viewer item')
    const v = await upsertItem(viewerA, { truck: truckA1, name: viewerName, intervalKm: 5000 })
    expect(!v.raised && v.r && v.r.ok === false && v.r.error === SCOPE_FORBIDDEN, `viewer got ${JSON.stringify(v.r ?? v.raised)}`)
    expect((await itemCountByName(truckA1, viewerName)) === 0, 'viewer upsert stored an item')
    const f = await upsertItem(fleetA, { truck: truckA1, name: nx('Fleet item'), intervalKm: 5000 })
    const fin = await upsertItem(financeA, { truck: truckA1, name: nx('Finance item'), intervalKm: 5000 })
    expect(f.r && f.r.ok === true && fin.r && fin.r.ok === true, `fleet=${JSON.stringify(f.r ?? f.raised)} finance=${JSON.stringify(fin.r ?? fin.raised)}`)
  })

  await testCase('E77. revoked member upsert is refused and stores nothing', async () => {
    await requireSchema()
    const name = nx('Revoked item')
    const out = await upsertItem(revokedA, { truck: truckA1, name, intervalKm: 5000 })
    const refused = out.raised !== undefined || (out.r && out.r.ok === false)
    expect(refused, `revoked upsert accepted: ${JSON.stringify(out.r)}`)
    expect((await itemCountByName(truckA1, name)) === 0, 'revoked upsert stored an item')
  })

  // =========================================================================
  // G. agency_maintenance_service_done
  // =========================================================================
  await testCase('E78. service done updates last service km and date and bumps version by one', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const item = await seedItem({ agencyId: agencyA, truckId: truck, name: 'Oil', lastKm: 1000, lastOn: '2025-01-01' })
    const out = await serviceDone(ownerA, { item, serviceKm: 1500, serviceOn: '2025-03-01', expectedVersion: 1, cost: 0 })
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    const row = await itemRow(item)
    expect(Number(row.last_service_km) === 1500, `last_service_km ${row.last_service_km}`)
    expect(row.last_on_txt === '2025-03-01', `last_service_on ${row.last_on_txt}`)
    expect(Number(row.version) === 2, `version ${row.version}, expected 2`)
  })

  await testCase('E79. service done with a cost records one maintenance expense in the same call', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const item = await seedItem({ agencyId: agencyA, truckId: truck, name: 'Brake pads' })
    const before = await maintenanceExpenseCount(truck)
    const out = await serviceDone(ownerA, { item, serviceKm: 2000, expectedVersion: 1, cost: 4200 })
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    expect((await maintenanceExpenseCount(truck)) === before + 1, 'expected exactly one new maintenance expense')
    const exp = await suOne(`SELECT amount_paise::int AS amount, agency_id FROM public.agency_expenses WHERE truck_id = $1 AND category = 'maintenance'`, [truck])
    expect(exp.amount === 4200 && exp.agency_id === agencyA, `maintenance expense ${JSON.stringify(exp)}`)
  })

  await testCase('E80. service done with cost 0 records no expense', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const item = await seedItem({ agencyId: agencyA, truckId: truck, name: 'Filter' })
    const before = await totalCount('agency_expenses', agencyA)
    const out = await serviceDone(ownerA, { item, serviceKm: 2000, expectedVersion: 1, cost: 0 })
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    expect((await totalCount('agency_expenses', agencyA)) === before, 'zero-cost service recorded an expense')
  })

  await testCase('E81. service km below the last service km is refused with km_going_backwards and changes nothing', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const item = await seedItem({ agencyId: agencyA, truckId: truck, name: 'Backwards', lastKm: 5000 })
    const before = await totalCount('agency_expenses', agencyA)
    const out = await serviceDone(ownerA, { item, serviceKm: 4000, expectedVersion: 1, cost: 1000 })
    expectResult(out.r, 'km_going_backwards')
    const row = await itemRow(item)
    expect(Number(row.version) === 1 && Number(row.last_service_km) === 5000, `item changed: version ${row.version}, km ${row.last_service_km}`)
    expect((await totalCount('agency_expenses', agencyA)) === before, 'refused service recorded an expense')
  })

  await testCase('E82. service done with a stale expected_version is refused with version_conflict', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const item = await seedItem({ agencyId: agencyA, truckId: truck, name: 'Stale svc' })
    const first = await serviceDone(ownerA, { item, serviceKm: 1500, expectedVersion: 1, cost: 0 })
    expect(first.r && first.r.ok === true, `setup refused: ${JSON.stringify(first.r ?? first.raised)}`)
    const stale = await serviceDone(ownerA, { item, serviceKm: 1800, expectedVersion: 1, cost: 0 })
    expectResult(stale.r, 'version_conflict')
    const row = await itemRow(item)
    expect(Number(row.version) === 2 && Number(row.last_service_km) === 1500, `after conflict version ${row.version}, km ${row.last_service_km}`)
  })

  await testCase('E83. replaying a service with the same key does not add a second expense or bump version again', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const item = await seedItem({ agencyId: agencyA, truckId: truck, name: 'Replay svc' })
    const key = nx('svc-replay')
    const first = await serviceDone(ownerA, { item, serviceKm: 2500, expectedVersion: 1, cost: 700, key })
    expect(first.r && first.r.ok === true, `first ${JSON.stringify(first.r ?? first.raised)}`)
    const expBefore = await maintenanceExpenseCount(truck)
    const versionBefore = Number((await itemRow(item)).version)
    const replay = await serviceDone(ownerA, { item, serviceKm: 2500, expectedVersion: 1, cost: 700, key })
    expect(replay.r && replay.r.ok === true && replay.r.replay === true, `replay ${JSON.stringify(replay.r ?? replay.raised)}`)
    expect((await maintenanceExpenseCount(truck)) === expBefore, 'replay added a maintenance expense')
    expect(Number((await itemRow(item)).version) === versionBefore, 'replay bumped the version again')
  })

  await testCase('E84. service done on another agency item is refused and changes nothing', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyB)
    const item = await seedItem({ agencyId: agencyB, truckId: truck, name: 'B item' })
    const out = await serviceDone(ownerA, { item, serviceKm: 1500, expectedVersion: 1, cost: 500 })
    const refused = out.raised !== undefined || (out.r && out.r.ok === false)
    expect(refused, `cross-agency service accepted: ${JSON.stringify(out.r)}`)
    const row = await itemRow(item)
    expect(Number(row.version) === 1 && Number(row.last_service_km) === 1000, `B item changed: version ${row.version}, km ${row.last_service_km}`)
  })

  await testCase('E85. service done by a dispatcher returns forbidden_scope', async () => {
    await requireSchema()
    const truck = await seedTruck(agencyA)
    const item = await seedItem({ agencyId: agencyA, truckId: truck, name: 'Dispatcher svc' })
    const out = await serviceDone(dispatcherA, { item, serviceKm: 1500, expectedVersion: 1, cost: 0 })
    expect(!out.raised && out.r && out.r.ok === false && out.r.error === SCOPE_FORBIDDEN, `dispatcher got ${JSON.stringify(out.r ?? out.raised)}`)
    expect(Number((await itemRow(item)).version) === 1, 'dispatcher service bumped the version')
  })

  // =========================================================================
  // H. agency_expense_summary (read command)
  // =========================================================================
  let summarySeeded = null
  /** Seeds 2024 rows for both agencies once; summary cases query only 2024 ranges. */
  async function ensureSummarySeeds() {
    if (!summarySeeded) {
      summarySeeded = (async () => {
        const t1 = truckA1
        await seedExpense({ agencyId: agencyA, truckId: t1, category: 'fuel', amount: 1000, spentOn: '2024-03-05' })
        await seedExpense({ agencyId: agencyA, truckId: null, category: 'toll', amount: 500, spentOn: '2024-03-10' })
        await seedExpense({ agencyId: agencyA, truckId: t1, category: 'maintenance', amount: 2000, spentOn: '2024-03-31' })
        await seedExpense({ agencyId: agencyA, truckId: t1, category: 'fuel', amount: 9999, spentOn: '2024-04-01' })
        await seedExpense({ agencyId: agencyB, truckId: truckB1, category: 'fuel', amount: 7777, spentOn: '2024-03-06' })
      })()
    }
    return summarySeeded
  }

  await testCase('E86. summary over 2024-03-01..2024-03-31 totals only agency A rows inside the range', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const out = await summary(ownerA, '2024-03-01', '2024-03-31')
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    expect(Number(out.r.total_paise) === 3500, `total_paise ${out.r.total_paise}, expected 3500 (excludes 9999 and agency B 7777)`)
  })

  await testCase('E87. summary by_category groups the range by category', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const out = await summary(ownerA, '2024-03-01', '2024-03-31')
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    const map = Object.fromEntries((out.r.by_category || []).map((c) => [c.category, Number(c.total_paise)]))
    expect(map.fuel === 1000 && map.toll === 500 && map.maintenance === 2000, `by_category ${JSON.stringify(out.r.by_category)}`)
  })

  await testCase('E88. summary by_truck totals the truck inside the range', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const out = await summary(ownerA, '2024-03-01', '2024-03-31')
    expect(out.r && out.r.ok === true, `refused: ${JSON.stringify(out.r ?? out.raised)}`)
    const t = (out.r.by_truck || []).find((x) => x.truck_id === truckA1)
    expect(t && Number(t.total_paise) === 3000, `by_truck for truckA1 ${JSON.stringify(t)}, expected 3000`)
  })

  await testCase('E89. the start date is inclusive', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const out = await summary(ownerA, '2024-03-05', '2024-03-05')
    expect(out.r && out.r.ok === true && Number(out.r.total_paise) === 1000, `total ${JSON.stringify(out.r ?? out.raised)}, expected 1000`)
  })

  await testCase('E90. the end date is inclusive', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const out = await summary(ownerA, '2024-03-31', '2024-03-31')
    expect(out.r && out.r.ok === true && Number(out.r.total_paise) === 2000, `total ${JSON.stringify(out.r ?? out.raised)}, expected 2000`)
  })

  await testCase('E91. agency B summary sees only its own 7777 for the same range', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const out = await summary(ownerB, '2024-03-01', '2024-03-31')
    expect(out.r && out.r.ok === true && Number(out.r.total_paise) === 7777, `agency B total ${JSON.stringify(out.r ?? out.raised)}`)
    const leak = (out.r.by_truck || []).find((x) => x.truck_id === truckA1)
    expect(!leak, 'agency B summary lists a truck of agency A')
  })

  await testCase('E92. from later than to is refused with invalid_range', async () => {
    await requireSchema()
    const out = await summary(ownerA, '2024-05-01', '2024-03-01')
    expectResult(out.r, 'invalid_range')
  })

  await testCase('E93. a 366-day inclusive range (2024 leap year) is accepted', async () => {
    await requireSchema()
    const out = await summary(ownerA, '2024-01-01', '2024-12-31')
    expect(out.r && out.r.ok === true, `366-day range refused: ${JSON.stringify(out.r ?? out.raised)}`)
  })

  await testCase('E94. a 368-day inclusive range is refused with range_too_large', async () => {
    await requireSchema()
    const out = await summary(ownerA, '2024-01-01', '2025-01-02')
    expectResult(out.r, 'range_too_large')
  })

  await testCase('E95. a viewer may read the summary', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const out = await summary(viewerA, '2024-03-01', '2024-03-31')
    expect(out.r && out.r.ok === true && Number(out.r.total_paise) === 3500, `viewer ${JSON.stringify(out.r ?? out.raised)}`)
  })

  await testCase('E96. revoked member and suspended-agency staff get no summary', async () => {
    await requireSchema()
    await ensureSummarySeeds()
    const r1 = await refusedOrNotOk(asActor(revokedA, async () => (await db.query(SUMMARY_SQL, ['2024-03-01', '2024-03-31'])).rows[0].r))
    const r2 = await refusedOrNotOk(asActor(suspendedStaffS, async () => (await db.query(SUMMARY_SQL, ['2024-03-01', '2024-03-31'])).rows[0].r))
    expect(r1 && r2, `revoked refused=${r1}, suspended staff refused=${r2}`)
  })

  await testCase('E97. user with no agency gets the no-profile refusal for the summary', async () => {
    await requireSchema()
    const out = await summary(noAgency, '2024-03-01', '2024-03-31')
    expect(out.raised === NO_PROFILE_MSG, `expected exactly "${NO_PROFILE_MSG}", got ${JSON.stringify(out.raised ?? out.r)}`)
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed`)
  console.log(`${failed.length} failed`)
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
