#!/usr/bin/env node
/**
 * Agency load plans (load plan and versioned allocations) — red-first PGlite battery (TO-145 slice 3).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the
 * supabase/migrations chain, including supabase/migrations/20261025000000_agency_load_plans.sql,
 * and drives the RPCs the way PostgREST does per request: `SET ROLE authenticated` with
 * `request.jwt.claims` set to the caller's sub.
 *
 * Pinned contract under test. The migration that implements it is NOT written yet, so every
 * case that needs the new objects is EXPECTED to fail now with the reason "migration ... is
 * missing". The server only stores, validates and approves plans; it does not plan. Planning maths
 * lives client side in frontend/src/lib/loadPlanner.ts.
 *
 *   Tables (RLS on, no direct write privileges for authenticated or anon):
 *     agency_load_plans(id, agency_id, batch_id NULL -> agency_order_batches, name text 1..80,
 *       status 'draft'|'approved'|'superseded'|'cancelled', plan_version int (per agency+name lineage,
 *       starts 1), version int default 1 (optimistic lock), idempotency_key, approved_by, approved_at,
 *       created_by, created_at)
 *       UNIQUE (agency_id, idempotency_key); partial UNIQUE (agency_id, name) WHERE status = 'approved'
 *     agency_load_plan_loads(id, plan_id, agency_id, truck_id -> agency_trucks, total_kg numeric,
 *       utilization_pct numeric)
 *     agency_load_plan_lines(id, load_id, plan_id, agency_id, order_line_id -> agency_order_lines,
 *       quantity numeric > 0)  UNIQUE (plan_id, order_line_id)
 *     agency_load_plan_unmet(id, plan_id, agency_id, order_line_id, reason 'too_heavy'|'no_truck')
 *
 *   Truck capacity: the existing column agency_trucks.payload_kg numeric (migration
 *   20261008000000_agency_fleet_foundation.sql). The brief named it capacity_kg; this battery pins
 *   the column that already exists (payload_kg) and does not invent a new one.
 *
 *   public.agency_load_plan_save(p_name text, p_batch_id uuid, p_loads jsonb, p_unmet jsonb,
 *     p_idempotency_key text) RETURNS jsonb
 *     - SECURITY DEFINER, pinned search_path, NO agency argument, agency from auth.uid(),
 *       scope 'dispatcher' (owner always allowed). Other scopes: {ok:false,error:'forbidden_scope'}.
 *     - p_loads = [{truck_id, lines:[{order_line_id, quantity}]}]. Server re-validates everything:
 *       'truck_not_found' (other agency, unknown, or not operational: maintenance_blocked),
 *       'order_line_not_found' (other agency or unknown), 'order_cancelled',
 *       'line_allocated_twice', 'over_allocated' (with line index), 'over_capacity' (with load index,
 *       zero tolerance), 'truck_used_twice', 'too_large' (more than 200 loads or 5000 lines),
 *       'invalid_name' (1..80 chars).
 *     - total_kg and utilization_pct are recomputed server side (client numbers ignored).
 *     - New plan with an existing name: plan_version = previous max + 1, status 'draft'.
 *     - Same key and same payload: replay (not a new row). Same key different payload:
 *       'idempotency_key_reused'.
 *     - Any problem: {ok:false, error, problems:[...]} and nothing written (atomic).
 *   public.agency_load_plan_approve(p_plan_id uuid, p_expected_version int) RETURNS jsonb
 *     - draft -> approved; the previously approved plan of the same name becomes 'superseded' in the
 *       same transaction. Re-validates capacity and cancelled orders ('stale_plan' with the offending
 *       order line ids). 'version_conflict', 'illegal_transition' (only a draft can be approved),
 *       'empty_plan' (zero loads), 'line_already_planned' (a line is already allocated by another
 *       APPROVED plan of a different name). Other agency or unknown: 'not_found'.
 *   public.agency_load_plan_cancel(p_plan_id uuid, p_expected_version int) RETURNS jsonb
 *     - draft or approved -> cancelled. An approved plan with any agency_consignments row for an
 *       order in the plan: 'has_consignments'. cancelled and superseded are terminal
 *       ('illegal_transition'). 'version_conflict', 'not_found' as above.
 *   Success replies pin: {ok:true, plan_id, plan_version, status, version, replay} for save and
 *   {ok:true, state, version} for approve and cancel (version = expected + 1).
 *
 *   RLS reads: owner and every active staff scope (dispatcher, fleet_manager, finance, viewer) read
 *   their agency's plans, loads, lines and unmet rows. Other agencies, revoked members, suspended
 *   agency staff, users with no agency and anon read 0 rows. No direct INSERT/UPDATE/DELETE.
 *
 * Assumptions (not pinned by the brief, flagged for the implementer):
 *   - Refusals may be a raised exception or {ok:false}; this battery accepts either where noted.
 *   - Problem objects carry a numeric `index` for over_allocated and over_capacity.
 *   - The tonne/kg weight rule is not pinned. Every weighed line here is unit 'kg', so
 *     weight = quantity x weight_per_unit_kg.
 *   - Operational means maintenance_blocked = false. is_available is not pinned.
 *   - Save does not change order status (cancel after save must still succeed).
 *   - Unmet rows are stored as given; unmet reason validation is only pinned by the table CHECK.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST / GoTrue behaviour is
 * NOT covered. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_load_plans.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud failure,
 * never a silent skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261025000000_agency_load_plans.sql'
const MIGRATION_PRESENT = existsSync(join(MIGRATIONS_DIR, MIGRATION_FILE))

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

function short(value) {
  return String(JSON.stringify(value)).slice(0, 220)
}

/**
 * Per-case resilience: a failing assertion records FAIL and the battery keeps running, so a
 * red-first run reports EVERY unmet contract clause with its exact reason.
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

/** Every case that touches the load plan objects is gated on the migration file being present. */
async function gatedCase(name, fn) {
  await testCase(name, async () => {
    if (!MIGRATION_PRESENT) {
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so agency_load_plans does not exist yet`)
    }
    await fn()
  })
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

/** Superuser insert; resolves to the error text, or null when the row was accepted. */
async function insertError(sql, params = []) {
  try {
    await su(sql, params)
    return null
  } catch (error) {
    return firstLine(error)
  }
}

// ---------------------------------------------------------------------------
// Fixtures (superuser). Only tables from earlier migrations are touched in setup.
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

async function seedAgreement(agencyId, clientName, status = 'active') {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, agencyId, clientName, status, nx('lp-agr')]
  )
  return id
}

async function seedSite(agencyId, agreementId, siteKind, label, status = 'active') {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_sites
       (id, agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, '1 Test Road', 'Pune', 'Maharashtra', '411001', $6, $7)`,
    [id, agencyId, agreementId, siteKind, label, status, nx('lp-site')]
  )
  return id
}

/** Fleet truck of an agency with a payload capacity (payload_kg is the capacity column). */
async function seedTruck(agencyId, payloadKg, blocked = false) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, payload_kg, maintenance_blocked)
     VALUES ($1, $2, 'eicher_14ft', $3, $4, $5)`,
    [id, agencyId, nx('LP-RC'), payloadKg, blocked]
  )
  return id
}

/**
 * Superuser seed of one draft order (or the given status) with one line per spec [quantity, weight].
 * who is 'A' (agency A, owner A) or 'B' (agency B). Order lines are all unit 'kg'.
 */
async function seedOrder(who, specs, status = 'draft') {
  const isA = who === 'A'
  const agencyId = isA ? agencyA : agencyB
  const agreementId = isA ? agrA : agrB
  const siteId = isA ? siteAPune : siteBPune
  const orderId = uid()
  await su(
    `INSERT INTO public.agency_orders (id, agency_id, agreement_id, batch_id, client_order_ref, status, version)
     VALUES ($1, $2, $3, NULL, $4, $5, 1)`,
    [orderId, agencyId, agreementId, nx('LP-ORD'), status]
  )
  const lineIds = []
  let lineNo = 0
  for (const [quantity, weight] of specs) {
    lineNo += 1
    const id = uid()
    await su(
      `INSERT INTO public.agency_order_lines
         (id, agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg, length_m, width_m, height_m,
          pickup_site_id, drop_site_id, pickup_from, pickup_to, delivery_from, delivery_to)
       VALUES ($1, $2, $3, $4, 'SKU-LP', 'Load plan line', $5, 'kg', $6, 1, 1, 1, $7, $7, now(), now(), now(), now())`,
      [id, agencyId, orderId, lineNo, quantity, weight, siteId]
    )
    lineIds.push(id)
  }
  return { orderId, lineIds }
}

async function seedPlanRow(o = {}) {
  const id = uid()
  const approved = o.status === 'approved'
  await su(
    `INSERT INTO public.agency_load_plans
       (id, agency_id, batch_id, name, status, plan_version, version, idempotency_key, approved_by, approved_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      id,
      o.agencyId ?? agencyA,
      o.batchId ?? null,
      o.name ?? nx('LP-seed'),
      o.status ?? 'draft',
      o.planVersion ?? 1,
      o.version ?? 1,
      o.key ?? nx('lp-seed-key'),
      approved ? ownerA : null,
      approved ? new Date().toISOString() : null,
      ownerA,
    ]
  )
  return id
}

async function seedLoadRow(planId, agencyId, truckId) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_load_plan_loads (id, plan_id, agency_id, truck_id, total_kg, utilization_pct)
     VALUES ($1, $2, $3, $4, 0, 0)`,
    [id, planId, agencyId, truckId]
  )
  return id
}

async function seedLineRow(planId, loadId, agencyId, orderLineId, quantity) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_load_plan_lines (id, load_id, plan_id, agency_id, order_line_id, quantity)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, loadId, planId, agencyId, orderLineId, quantity]
  )
  return id
}

/** Read fixture: one plan of agency A with one load, one line and one unmet row. Created once. */
let readPlanId = null
async function ensureReadPlan() {
  if (readPlanId) return readPlanId
  const o = await seedOrder('A', [[5, 10]])
  readPlanId = await seedPlanRow({ name: nx('LP-read'), status: 'draft' })
  const loadId = await seedLoadRow(readPlanId, agencyA, truckA100)
  await seedLineRow(readPlanId, loadId, agencyA, o.lineIds[0], 5)
  await su(
    `INSERT INTO public.agency_load_plan_unmet (id, plan_id, agency_id, order_line_id, reason)
     VALUES ($1, $2, $3, $4, 'no_truck')`,
    [uid(), readPlanId, agencyA, o.lineIds[0]]
  )
  return readPlanId
}

// Fixture handles, assigned in setupFixtures().
let ownerA, ownerB, ownerS, agencyA, agencyB, agencyS
let agrA, agrB, agrS, siteAPune, siteBPune
let dispatcherA, fleetA, financeA, viewerA, revokedA, suspendedStaffS, noAgency
let batchA
let truckA100, truckA50, truckA1000, truckABlocked, truckB500

async function setupFixtures() {
  ownerA = await createUser('lp-owner-a')
  agencyA = await createAgencyRow(ownerA, 'LoadPlan A', 'approved')
  ownerB = await createUser('lp-owner-b')
  agencyB = await createAgencyRow(ownerB, 'LoadPlan B', 'approved')
  ownerS = await createUser('lp-owner-s')
  agencyS = await createAgencyRow(ownerS, 'LoadPlan S', 'suspended')

  agrA = await seedAgreement(agencyA, 'Acme Cement')
  agrB = await seedAgreement(agencyB, 'Beta Logistics')
  agrS = await seedAgreement(agencyS, 'Gamma Goods')

  await seedSite(agencyA, agrA, 'bill_to', 'Head Office')
  siteAPune = await seedSite(agencyA, agrA, 'ship_to', 'Pune Depot')
  await seedSite(agencyB, agrB, 'bill_to', 'Head Office')
  siteBPune = await seedSite(agencyB, agrB, 'ship_to', 'Pune Depot')
  await seedSite(agencyS, agrS, 'bill_to', 'Head Office')
  await seedSite(agencyS, agrS, 'ship_to', 'Plant S')

  dispatcherA = await seedStaff(agencyA, 'lp-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'lp-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'lp-finance', 'finance')
  viewerA = await seedStaff(agencyA, 'lp-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'lp-revoked', 'dispatcher', 'revoked')
  suspendedStaffS = await seedStaff(agencyS, 'lp-suspended', 'dispatcher')
  noAgency = await createUser('lp-no-agency')

  batchA = uid()
  await su(
    `INSERT INTO public.agency_order_batches (id, agency_id, agreement_id, file_hash, row_count, created_by, idempotency_key)
     VALUES ($1, $2, $3, $4, 1, $5, $6)`,
    [batchA, agencyA, agrA, nx('lp-batch-hash'), ownerA, nx('lp-batch-key')]
  )

  truckA100 = await seedTruck(agencyA, 100)
  truckA50 = await seedTruck(agencyA, 50)
  truckA1000 = await seedTruck(agencyA, 1000)
  truckABlocked = await seedTruck(agencyA, 500, true)
  truckB500 = await seedTruck(agencyB, 500)
}

// ---------------------------------------------------------------------------
// Command wrappers and helpers
// ---------------------------------------------------------------------------
const SAVE_SQL = `SELECT public.agency_load_plan_save($1::text, $2::uuid, $3::jsonb, $4::jsonb, $5::text) AS r`
const APPROVE_SQL = `SELECT public.agency_load_plan_approve($1::uuid, $2::int) AS r`
const CANCEL_SQL = `SELECT public.agency_load_plan_cancel($1::uuid, $2::int) AS r`
const ORDER_CANCEL_SQL = `SELECT public.agency_order_cancel($1::uuid, $2::int) AS r`

const TABLES = ['agency_load_plans', 'agency_load_plan_loads', 'agency_load_plan_lines', 'agency_load_plan_unmet']
const PLAN_COLS = ['id', 'agency_id', 'batch_id', 'name', 'status', 'plan_version', 'version', 'idempotency_key',
  'approved_by', 'approved_at', 'created_by', 'created_at']
const LOAD_COLS = ['id', 'plan_id', 'agency_id', 'truck_id', 'total_kg', 'utilization_pct']
const LINE_COLS = ['id', 'load_id', 'plan_id', 'agency_id', 'order_line_id', 'quantity']
const UNMET_COLS = ['id', 'plan_id', 'agency_id', 'order_line_id', 'reason']

/** Runs a command as `who`; resolves to the parsed jsonb reply, or {ok:false, raised} when it raised. */
async function callAs(who, sql, params) {
  return asActor(who, async () => {
    try {
      const result = await db.query(sql, params)
      return parseJson(result.rows[0].r)
    } catch (error) {
      return { ok: false, raised: firstLine(error) }
    }
  })
}

function saveAs(who, name, loads, opts = {}) {
  return callAs(who, SAVE_SQL, [
    name,
    opts.batchId ?? null,
    JSON.stringify(loads),
    JSON.stringify(opts.unmet ?? []),
    opts.key ?? nx('lp-key'),
  ])
}

function approveAs(who, planId, expectedVersion) {
  return callAs(who, APPROVE_SQL, [planId, expectedVersion])
}

function cancelAs(who, planId, expectedVersion) {
  return callAs(who, CANCEL_SQL, [planId, expectedVersion])
}

/** Owner-A save that must succeed. */
async function mustSave(name, loads, opts = {}) {
  const r = await saveAs(ownerA, name, loads, opts)
  expect(r && r.ok === true, `save "${name}" refused: ${short(r)}`)
  return r
}

async function mustApprove(planId, expectedVersion = 1) {
  const r = await approveAs(ownerA, planId, expectedVersion)
  expect(r && r.ok === true, `approve refused: ${short(r)}`)
  return r
}

/** Load object for the save payload: pairs of [orderLineId, quantity]. */
function loadOf(truckId, pairs, extra = {}) {
  return {
    truck_id: truckId,
    lines: pairs.map(([orderLineId, quantity]) => ({ order_line_id: orderLineId, quantity })),
    ...extra,
  }
}

function expectOk(r, label = 'command') {
  expect(r && r.ok === true, `${label}: expected ok:true, got ${short(r)}`)
}

/** Exact refusal: {ok:false,error:code}. */
function expectErr(r, code) {
  expect(r && r.ok === false && r.error === code, `expected {ok:false,error:'${code}'}, got ${short(r)}`)
}

/** Any refusal: not ok (raised, or {ok:false}). */
function expectRefused(r) {
  expect(r && r.ok !== true, `expected a refusal, got ${short(r)}`)
}

/** A problem entry with the given numeric index exists in problems. */
function expectProblemIndex(r, index) {
  expect(Array.isArray(r.problems), `problems is not an array: ${short(r)}`)
  const hit = r.problems.some((p) => Number(p && p.index) === index)
  expect(hit, `no problem with index ${index}: ${short(r.problems)}`)
}

async function planCounts() {
  return suOne(
    `SELECT (SELECT count(*) FROM public.agency_load_plans)::int AS p,
            (SELECT count(*) FROM public.agency_load_plan_loads)::int AS l,
            (SELECT count(*) FROM public.agency_load_plan_lines)::int AS n,
            (SELECT count(*) FROM public.agency_load_plan_unmet)::int AS u`
  )
}

function expectSameCounts(before, after, label) {
  expect(
    JSON.stringify(before) === JSON.stringify(after),
    `${label}: rows written (${JSON.stringify(before)} -> ${JSON.stringify(after)})`
  )
}

const planRow = (id) =>
  suOne(
    `SELECT id, agency_id, batch_id, name, status, plan_version, version, idempotency_key,
            approved_by, approved_at, created_by
       FROM public.agency_load_plans WHERE id = $1`,
    [id]
  )

async function statusOf(id) {
  const row = await planRow(id)
  expect(row, `plan ${id} not found`)
  return row.status
}

async function approvedCountForName(agencyId, name) {
  return (
    await suOne(
      `SELECT count(*)::int AS n FROM public.agency_load_plans WHERE agency_id = $1 AND name = $2 AND status = 'approved'`,
      [agencyId, name]
    )
  ).n
}

async function loadsOf(planId) {
  return (await su(`SELECT * FROM public.agency_load_plan_loads WHERE plan_id = $1`, [planId])).rows
}

async function linesOf(planId) {
  return (await su(`SELECT * FROM public.agency_load_plan_lines WHERE plan_id = $1`, [planId])).rows
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

async function expectAllVisible(who, agencyId, label) {
  const failures = []
  for (const t of TABLES) {
    const total = await totalCount(t, agencyId)
    expect(total >= 1, `precondition: no ${t} rows seeded for agency`)
    const n = await visibleCount(who, t, agencyId)
    if (n !== total) failures.push(`${t}: sees ${n} of ${total}`)
  }
  expect(failures.length === 0, `${label} ${failures.join('; ')}`)
}

async function expectNoRowsVisible(who, agencyId, label) {
  const failures = []
  for (const t of TABLES) {
    const n = await visibleCount(who, t, agencyId)
    if (n !== 0) failures.push(`${t}=${n}`)
  }
  expect(failures.length === 0, `${label} can see rows: ${failures.join(', ')}`)
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

/** Exact text of a function's identity arguments, SECURITY DEFINER, jsonb result, pinned search_path. */
async function definitionFailures(name, expectedArgs) {
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
  if (!/search_path=public/.test((proconfig || []).join(','))) {
    failures.push(`search_path not pinned (${(proconfig || []).join(',') || 'none'})`)
  }
  return failures
}

/** EXECUTE grants for one signature: authenticated and service_role yes, anon and PUBLIC no. */
async function grantFailures(signature) {
  const oid = (await suOne(`SELECT $1::regprocedure::oid AS oid`, [signature])).oid
  const p = await suOne(
    `SELECT has_function_privilege('authenticated', $1::oid, 'EXECUTE') AS auth_ok,
            has_function_privilege('service_role', $1::oid, 'EXECUTE') AS svc_ok,
            has_function_privilege('anon', $1::oid, 'EXECUTE') AS anon_ok,
            EXISTS (SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     WHERE p.oid = $1::oid AND a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_ok`,
    [oid]
  )
  const failures = []
  if (p.auth_ok !== true) failures.push('authenticated cannot EXECUTE')
  if (p.svc_ok !== true) failures.push('service_role cannot EXECUTE')
  if (p.anon_ok !== false) failures.push('anon can EXECUTE')
  if (p.public_ok !== false) failures.push('PUBLIC has EXECUTE')
  return failures
}

async function expectColumns(table, cols) {
  const got = new Set(
    (await su(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])).rows.map(
      (r) => r.column_name
    )
  )
  const missing = cols.filter((c) => !got.has(c))
  expect(missing.length === 0, `${table} missing columns: ${missing.join(', ')}`)
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
  console.log(`migrations applied: ${applied.length} (last=${last})`)
  console.log(`migration ${MIGRATION_FILE}: ${MIGRATION_PRESENT ? 'present' : 'MISSING'}`)
  await setupFixtures()

  // =========================================================================
  // A. Schema, grants and signatures
  // =========================================================================
  await testCase(`L01. migration file ${MIGRATION_FILE} is present in supabase/migrations`, async () => {
    expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing (not written yet)`)
  })

  await gatedCase('L02. agency_load_plans, agency_load_plan_loads, agency_load_plan_lines and agency_load_plan_unmet exist with RLS enabled', async () => {
    const rows = (
      await su(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
        [TABLES]
      )
    ).rows
    const rls = new Map(rows.map((r) => [r.relname, r.relrowsecurity === true]))
    const missing = TABLES.filter((t) => !rls.has(t))
    expect(missing.length === 0, `missing tables: ${missing.join(', ')}`)
    const noRls = TABLES.filter((t) => rls.get(t) !== true)
    expect(noRls.length === 0, `RLS not enabled on: ${noRls.join(', ')}`)
  })

  await gatedCase('L03. agency_load_plans carries every pinned column including plan_version, version, approved_by and approved_at', async () => {
    await expectColumns('agency_load_plans', PLAN_COLS)
  })

  await gatedCase('L04. agency_load_plan_loads carries plan_id, agency_id, truck_id, total_kg and utilization_pct', async () => {
    await expectColumns('agency_load_plan_loads', LOAD_COLS)
  })

  await gatedCase('L05. agency_load_plan_lines carries load_id, plan_id, agency_id, order_line_id and quantity', async () => {
    await expectColumns('agency_load_plan_lines', LINE_COLS)
  })

  await gatedCase('L06. agency_load_plan_unmet carries plan_id, agency_id, order_line_id and reason', async () => {
    await expectColumns('agency_load_plan_unmet', UNMET_COLS)
  })

  await testCase('L07. agency_trucks.payload_kg numeric exists as the truck capacity column (already in the fleet foundation)', async () => {
    const row = await suOne(
      `SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'agency_trucks' AND column_name = 'payload_kg'`
    )
    expect(row && row.data_type === 'numeric', `agency_trucks.payload_kg is ${row ? row.data_type : 'missing'}`)
  })

  await gatedCase(`L08. agency_load_plans rejects a status outside draft, approved, superseded and cancelled`, async () => {
    const err = await insertError(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key)
       VALUES ($1, $2, $3, 'planned', 1, 1, $4)`,
      [uid(), agencyA, nx('LP-chk'), nx('lp-k')]
    )
    expect(err !== null, 'status "planned" was accepted')
  })

  await gatedCase('L09. agency_load_plans rejects an empty name', async () => {
    const err = await insertError(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key)
       VALUES ($1, $2, '', 'draft', 1, 1, $3)`,
      [uid(), agencyA, nx('lp-k')]
    )
    expect(err !== null, 'empty name was accepted')
  })

  await gatedCase('L10. agency_load_plans rejects a name longer than 80 characters', async () => {
    const err = await insertError(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key)
       VALUES ($1, $2, $3, 'draft', 1, 1, $4)`,
      [uid(), agencyA, 'x'.repeat(81), nx('lp-k')]
    )
    expect(err !== null, '81-character name was accepted')
  })

  await gatedCase('L11. agency_load_plans is unique on (agency_id, idempotency_key)', async () => {
    const key = nx('lp-dup-key')
    const first = await insertError(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key)
       VALUES ($1, $2, $3, 'draft', 1, 1, $4)`,
      [uid(), agencyA, nx('LP-dup'), key]
    )
    expect(first === null, `first insert failed: ${first}`)
    const second = await insertError(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key)
       VALUES ($1, $2, $3, 'draft', 1, 1, $4)`,
      [uid(), agencyA, nx('LP-dup'), key]
    )
    expect(second !== null, 'duplicate (agency_id, idempotency_key) was accepted')
  })

  await gatedCase('L12. at most one approved plan per (agency_id, name) is enforced by a partial unique index', async () => {
    const name = nx('LP-one-approved')
    const first = await insertError(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key, approved_by, approved_at)
       VALUES ($1, $2, $3, 'approved', 1, 2, $4, $5, now())`,
      [uid(), agencyA, name, nx('lp-k'), ownerA]
    )
    expect(first === null, `first approved insert failed: ${first}`)
    const second = await insertError(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key, approved_by, approved_at)
       VALUES ($1, $2, $3, 'approved', 2, 2, $4, $5, now())`,
      [uid(), agencyA, name, nx('lp-k'), ownerA]
    )
    expect(second !== null, 'a second approved plan with the same name was accepted')
  })

  await gatedCase('L13. agency_load_plan_lines is unique on (plan_id, order_line_id)', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const planId = await seedPlanRow({ name: nx('LP-uniq-line') })
    const loadId = await seedLoadRow(planId, agencyA, truckA100)
    await seedLineRow(planId, loadId, agencyA, o.lineIds[0], 5)
    const err = await insertError(
      `INSERT INTO public.agency_load_plan_lines (id, load_id, plan_id, agency_id, order_line_id, quantity)
       VALUES ($1, $2, $3, $4, $5, 1)`,
      [uid(), loadId, planId, agencyA, o.lineIds[0]]
    )
    expect(err !== null, 'the same order line was allocated twice inside one plan')
  })

  await gatedCase('L14. agency_load_plan_lines rejects a quantity of zero', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const planId = await seedPlanRow({ name: nx('LP-zero-q') })
    const loadId = await seedLoadRow(planId, agencyA, truckA100)
    const err = await insertError(
      `INSERT INTO public.agency_load_plan_lines (id, load_id, plan_id, agency_id, order_line_id, quantity)
       VALUES ($1, $2, $3, $4, $5, 0)`,
      [uid(), loadId, planId, agencyA, o.lineIds[0]]
    )
    expect(err !== null, 'quantity 0 was accepted')
  })

  await gatedCase("L15. agency_load_plan_unmet rejects a reason outside too_heavy and no_truck", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const planId = await seedPlanRow({ name: nx('LP-bad-reason') })
    const err = await insertError(
      `INSERT INTO public.agency_load_plan_unmet (id, plan_id, agency_id, order_line_id, reason)
       VALUES ($1, $2, $3, $4, 'other')`,
      [uid(), planId, agencyA, o.lineIds[0]]
    )
    expect(err !== null, "reason 'other' was accepted")
  })

  await gatedCase('L16. authenticated and anon hold no INSERT, UPDATE or DELETE privilege on the four tables', async () => {
    const failures = []
    for (const t of TABLES) {
      for (const role of ['authenticated', 'anon']) {
        for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
          const r = await suOne(`SELECT has_table_privilege($1, $2, $3) AS ok`, [role, `public.${t}`, priv])
          if (r.ok) failures.push(`${role} ${priv} ${t}`)
        }
      }
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('L17. agency_load_plan_save is (p_name, p_batch_id, p_loads, p_unmet, p_idempotency_key) returning jsonb, SECURITY DEFINER, pinned search_path, no agency argument', async () => {
    const failures = await definitionFailures(
      'agency_load_plan_save',
      'p_name text, p_batch_id uuid, p_loads jsonb, p_unmet jsonb, p_idempotency_key text'
    )
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('L18. agency_load_plan_approve is (p_plan_id, p_expected_version) returning jsonb, SECURITY DEFINER, pinned search_path, no agency argument', async () => {
    const failures = await definitionFailures('agency_load_plan_approve', 'p_plan_id uuid, p_expected_version integer')
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('L19. agency_load_plan_cancel is (p_plan_id, p_expected_version) returning jsonb, SECURITY DEFINER, pinned search_path, no agency argument', async () => {
    const failures = await definitionFailures('agency_load_plan_cancel', 'p_plan_id uuid, p_expected_version integer')
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('L20. save, approve and cancel are executable by authenticated and service_role, never by anon or PUBLIC', async () => {
    const failures = []
    const sigs = [
      ['save', 'public.agency_load_plan_save(text,uuid,jsonb,jsonb,text)'],
      ['approve', 'public.agency_load_plan_approve(uuid,integer)'],
      ['cancel', 'public.agency_load_plan_cancel(uuid,integer)'],
    ]
    for (const [label, sig] of sigs) {
      const f = await grantFailures(sig)
      for (const x of f) failures.push(`${label}: ${x}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // B. RLS reads and direct writes
  // =========================================================================
  await gatedCase('L21. owner reads every plan, load, line and unmet row of agency A', async () => {
    await ensureReadPlan()
    await expectAllVisible(ownerA, agencyA, 'owner A')
  })

  await gatedCase('L22. a dispatcher of agency A reads the agency A plan tables', async () => {
    await ensureReadPlan()
    await expectAllVisible(dispatcherA, agencyA, 'dispatcher A')
  })

  await gatedCase('L23. viewer, finance and fleet_manager of agency A read the agency A plan tables', async () => {
    await ensureReadPlan()
    await gather([
      ['viewer', () => expectAllVisible(viewerA, agencyA, 'viewer A')],
      ['finance', () => expectAllVisible(financeA, agencyA, 'finance A')],
      ['fleet_manager', () => expectAllVisible(fleetA, agencyA, 'fleet A')],
    ])
  })

  await gatedCase('L24. owner of agency B reads 0 rows of agency A in any plan table', async () => {
    await ensureReadPlan()
    await expectNoRowsVisible(ownerB, agencyA, 'owner B')
  })

  await gatedCase('L25. a revoked member of agency A reads 0 rows', async () => {
    await ensureReadPlan()
    await expectNoRowsVisible(revokedA, agencyA, 'revoked A')
  })

  await gatedCase('L26. suspended-agency staff read 0 rows of agency A', async () => {
    await ensureReadPlan()
    await expectNoRowsVisible(suspendedStaffS, agencyA, 'suspended staff S')
  })

  await gatedCase('L27. a user with no agency reads 0 rows', async () => {
    await ensureReadPlan()
    await expectNoRowsVisible(noAgency, agencyA, 'no-agency user')
  })

  await gatedCase('L28. anon reads nothing: a raised error or 0 rows', async () => {
    await ensureReadPlan()
    let n = 0
    try {
      n = Number((await asAnon(`SELECT count(*)::int AS n FROM public.agency_load_plans`)).rows[0].n)
    } catch {
      n = 0
    }
    expect(n === 0, `anon sees ${n} plan rows`)
  })

  await gatedCase('L29. owner direct INSERT into agency_load_plans is refused and writes nothing', async () => {
    const before = await planCounts()
    const out = await dmlOutcome(
      ownerA,
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key)
       VALUES ($1, $2, 'LP-direct', 'draft', 1, 1, $3)`,
      [uid(), agencyA, nx('lp-direct')]
    )
    expect(out.error !== undefined || (out.rows || []).length === 0, 'direct INSERT was accepted')
    expectSameCounts(before, await planCounts(), 'direct INSERT')
  })

  await gatedCase('L30. owner direct UPDATE of a plan status is refused and the status is unchanged', async () => {
    const planId = await ensureReadPlan()
    const out = await dmlOutcome(ownerA, `UPDATE public.agency_load_plans SET status = 'approved' WHERE id = $1`, [planId])
    expect(out.error !== undefined || (out.rows || []).length === 0, 'direct UPDATE was accepted')
    expect((await planRow(planId)).status === 'draft', 'status changed by a direct UPDATE')
  })

  await gatedCase('L31. owner direct DELETE of a plan is refused and the row stays', async () => {
    const planId = await ensureReadPlan()
    const out = await dmlOutcome(ownerA, `DELETE FROM public.agency_load_plans WHERE id = $1`, [planId])
    expect(out.error !== undefined || (out.rows || []).length === 0, 'direct DELETE was accepted')
    expect(await planRow(planId), 'plan row was deleted')
  })

  await gatedCase('L32. owner direct INSERT into agency_load_plan_lines is refused and writes nothing', async () => {
    const planId = await ensureReadPlan()
    const before = await planCounts()
    const out = await dmlOutcome(
      ownerA,
      `INSERT INTO public.agency_load_plan_lines (id, load_id, plan_id, agency_id, order_line_id, quantity)
       SELECT $1, l.id, l.plan_id, l.agency_id, $2, 1 FROM public.agency_load_plan_loads l WHERE l.plan_id = $3 LIMIT 1`,
      [uid(), uid(), planId]
    )
    expect(out.error !== undefined || (out.rows || []).length === 0, 'direct line INSERT was accepted')
    expectSameCounts(before, await planCounts(), 'direct line INSERT')
  })

  // =========================================================================
  // C. Save: happy path and stored shape
  // =========================================================================
  await gatedCase('L33. owner saves a valid plan: ok, uuid plan_id, plan_version 1, draft, version 1, not a replay', async () => {
    const o = await seedOrder('A', [[5, 10], [3, 10]])
    const r = await mustSave(nx('Alpha'), [loadOf(truckA100, [[o.lineIds[0], 5], [o.lineIds[1], 3]])])
    expect(typeof r.plan_id === 'string' && UUID_RE.test(r.plan_id), `plan_id ${short(r.plan_id)}`)
    expect(Number(r.plan_version) === 1, `plan_version ${r.plan_version}, expected 1`)
    expect(r.status === 'draft', `status ${r.status}, expected draft`)
    expect(Number(r.version) === 1, `version ${r.version}, expected 1`)
    expect(r.replay !== true, 'a first save reported replay:true')
  })

  await gatedCase('L34. the stored plan row carries agency, name, draft status, plan_version 1, version 1, key and creator', async () => {
    const name = nx('Beta')
    const key = nx('lp-store-key')
    const o = await seedOrder('A', [[5, 10]])
    const r = await mustSave(name, [loadOf(truckA100, [[o.lineIds[0], 5]])], { key })
    const row = await planRow(r.plan_id)
    expect(row, 'no stored plan row')
    expect(row.agency_id === agencyA, `agency_id ${row.agency_id}`)
    expect(row.name === name, `name ${row.name}`)
    expect(row.status === 'draft', `status ${row.status}`)
    expect(Number(row.plan_version) === 1, `plan_version ${row.plan_version}`)
    expect(Number(row.version) === 1, `version ${row.version}`)
    expect(row.idempotency_key === key, `idempotency_key ${row.idempotency_key}`)
    expect(row.created_by === ownerA, `created_by ${row.created_by}`)
  })

  await gatedCase('L35. one load row is stored per submitted load, with truck_id and agency_id', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const r = await mustSave(nx('Gamma'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    const loads = await loadsOf(r.plan_id)
    expect(loads.length === 1, `${loads.length} load rows, expected 1`)
    expect(loads[0].truck_id === truckA100, `truck_id ${loads[0].truck_id}`)
    expect(loads[0].agency_id === agencyA, `load agency_id ${loads[0].agency_id}`)
  })

  await gatedCase('L36. line rows link to their load and plan and keep the submitted quantity', async () => {
    const o = await seedOrder('A', [[5, 10], [3, 10]])
    const r = await mustSave(nx('Delta'), [loadOf(truckA100, [[o.lineIds[0], 5], [o.lineIds[1], 3]])])
    const loads = await loadsOf(r.plan_id)
    const lines = await linesOf(r.plan_id)
    expect(lines.length === 2, `${lines.length} line rows, expected 2`)
    const byLine = new Map(lines.map((l) => [l.order_line_id, l]))
    const a = byLine.get(o.lineIds[0])
    const b = byLine.get(o.lineIds[1])
    expect(a && Number(a.quantity) === 5, `line 0 quantity ${a && a.quantity}`)
    expect(b && Number(b.quantity) === 3, `line 1 quantity ${b && b.quantity}`)
    expect(lines.every((l) => l.load_id === loads[0].id), 'a line is not linked to the load')
    expect(lines.every((l) => l.agency_id === agencyA), 'a line carries the wrong agency_id')
  })

  await gatedCase('L37. total_kg and utilization_pct are recomputed server side: client numbers are ignored', async () => {
    const o = await seedOrder('A', [[5, 10], [3, 10]])
    const r = await mustSave(nx('Epsilon'), [
      loadOf(truckA100, [[o.lineIds[0], 5], [o.lineIds[1], 3]], { total_kg: 99999, utilization_pct: 1 }),
    ])
    const [load] = await loadsOf(r.plan_id)
    expect(Math.abs(Number(load.total_kg) - 80) < 0.01, `total_kg ${load.total_kg}, expected 80 (5x10 + 3x10)`)
    expect(Math.abs(Number(load.utilization_pct) - 80) < 0.01, `utilization_pct ${load.utilization_pct}, expected 80 (80 of 100 kg)`)
  })

  await gatedCase('L38. unmet rows are stored with their order line and reason', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const heavy = await seedOrder('A', [[2, 600]])
    const r = await mustSave(nx('Zeta'), [loadOf(truckA100, [[o.lineIds[0], 5]])], {
      unmet: [{ order_line_id: heavy.lineIds[0], reason: 'too_heavy' }],
    })
    const rows = (await su(`SELECT * FROM public.agency_load_plan_unmet WHERE plan_id = $1`, [r.plan_id])).rows
    expect(rows.length === 1, `${rows.length} unmet rows, expected 1`)
    expect(rows[0].order_line_id === heavy.lineIds[0], `unmet order_line_id ${rows[0].order_line_id}`)
    expect(rows[0].reason === 'too_heavy', `unmet reason ${rows[0].reason}`)
    expect(rows[0].agency_id === agencyA, `unmet agency_id ${rows[0].agency_id}`)
  })

  await gatedCase('L39. batch_id is stored when the save names a batch of the agency', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const r = await mustSave(nx('Eta'), [loadOf(truckA100, [[o.lineIds[0], 5]])], { batchId: batchA })
    const row = await planRow(r.plan_id)
    expect(row.batch_id === batchA, `batch_id ${row.batch_id}, expected ${batchA}`)
  })

  await gatedCase('L40. a dispatcher of agency A may save a plan', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const r = await saveAs(dispatcherA, nx('Theta'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectOk(r, 'dispatcher save')
  })

  await gatedCase("L41. viewer, finance and fleet_manager are refused with 'forbidden_scope' and write nothing", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const before = await planCounts()
    const loads = [loadOf(truckA100, [[o.lineIds[0], 5]])]
    await gather([
      ['viewer', async () => expectErr(await saveAs(viewerA, nx('Iota'), loads), 'forbidden_scope')],
      ['finance', async () => expectErr(await saveAs(financeA, nx('Kappa'), loads), 'forbidden_scope')],
      ['fleet_manager', async () => expectErr(await saveAs(fleetA, nx('Lambda'), loads), 'forbidden_scope')],
    ])
    expectSameCounts(before, await planCounts(), 'forbidden_scope saves')
  })

  await gatedCase('L42. owner and staff of an unapproved (suspended) agency are blocked and write nothing', async () => {
    const before = await planCounts()
    await gather([
      ['owner S', async () => expectRefused(await saveAs(ownerS, nx('Mu'), []))],
      ['staff S', async () => expectRefused(await saveAs(suspendedStaffS, nx('Nu'), []))],
    ])
    expectSameCounts(before, await planCounts(), 'unapproved agency saves')
  })

  await gatedCase('L43. a revoked dispatcher and a user with no agency are blocked and write nothing', async () => {
    const before = await planCounts()
    await gather([
      ['revoked', async () => expectRefused(await saveAs(revokedA, nx('Xi'), []))],
      ['no agency', async () => expectRefused(await saveAs(noAgency, nx('Omicron'), []))],
    ])
    expectSameCounts(before, await planCounts(), 'revoked or no-agency saves')
  })

  await gatedCase("L44. an empty name is refused with 'invalid_name' and writes nothing", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const before = await planCounts()
    expectErr(await saveAs(ownerA, '', [loadOf(truckA100, [[o.lineIds[0], 5]])]), 'invalid_name')
    expectSameCounts(before, await planCounts(), 'empty name')
  })

  await gatedCase("L45. a name of 81 characters is refused with 'invalid_name'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const before = await planCounts()
    expectErr(await saveAs(ownerA, 'n'.repeat(81), [loadOf(truckA100, [[o.lineIds[0], 5]])]), 'invalid_name')
    expectSameCounts(before, await planCounts(), '81-char name')
  })

  await gatedCase('L46. a name of exactly 80 characters is accepted', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const r = await saveAs(ownerA, 'n'.repeat(80), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectOk(r, '80-char name')
  })

  await gatedCase('L47. same key and same payload replays the same plan with replay:true and writes no new row', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const key = nx('lp-replay')
    const name = nx('Pi')
    const loads = [loadOf(truckA100, [[o.lineIds[0], 5]])]
    const first = await mustSave(name, loads, { key })
    const before = await planCounts()
    const second = await saveAs(ownerA, name, loads, { key })
    expectOk(second, 'replay')
    expect(second.replay === true, `replay flag ${second.replay}`)
    expect(second.plan_id === first.plan_id, `replay returned ${second.plan_id}, expected ${first.plan_id}`)
    expectSameCounts(before, await planCounts(), 'replay')
  })

  await gatedCase("L48. same key with a different payload is refused with 'idempotency_key_reused' and writes nothing", async () => {
    const o = await seedOrder('A', [[5, 10], [2, 10]])
    const key = nx('lp-reused')
    const name = nx('Rho')
    await mustSave(name, [loadOf(truckA100, [[o.lineIds[0], 5]])], { key })
    const before = await planCounts()
    const r = await saveAs(ownerA, name, [loadOf(truckA100, [[o.lineIds[1], 2]])], { key })
    expectErr(r, 'idempotency_key_reused')
    expectSameCounts(before, await planCounts(), 'reused key')
  })

  await gatedCase('L49. a new draft with an existing name gets plan_version 2 and the earlier draft stays version 1', async () => {
    const name = nx('Sigma')
    const o1 = await seedOrder('A', [[5, 10]])
    const p1 = await mustSave(name, [loadOf(truckA100, [[o1.lineIds[0], 5]])])
    const o2 = await seedOrder('A', [[4, 10]])
    const p2 = await mustSave(name, [loadOf(truckA100, [[o2.lineIds[0], 4]])])
    expect(Number(p2.plan_version) === 2, `plan_version ${p2.plan_version}, expected 2`)
    const row1 = await planRow(p1.plan_id)
    expect(Number(row1.plan_version) === 1 && row1.status === 'draft', `earlier draft changed: ${short(row1)}`)
  })

  await gatedCase('L50. a new draft with the name of an approved plan gets plan_version 2 and the approved plan is untouched', async () => {
    const name = nx('Tau')
    const o1 = await seedOrder('A', [[5, 10]])
    const p1 = await mustSave(name, [loadOf(truckA100, [[o1.lineIds[0], 5]])])
    await mustApprove(p1.plan_id, 1)
    const o2 = await seedOrder('A', [[4, 10]])
    const p2 = await mustSave(name, [loadOf(truckA100, [[o2.lineIds[0], 4]])])
    expect(Number(p2.plan_version) === 2, `plan_version ${p2.plan_version}, expected 2`)
    expect((await statusOf(p1.plan_id)) === 'approved', 'the approved plan changed on save')
  })

  await gatedCase("L51. a truck of another agency is refused with 'truck_not_found' and writes nothing", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const before = await planCounts()
    expectErr(await saveAs(ownerA, nx('Upsilon'), [loadOf(truckB500, [[o.lineIds[0], 5]])]), 'truck_not_found')
    expectSameCounts(before, await planCounts(), 'other-agency truck')
  })

  await gatedCase("L52. a maintenance-blocked truck (not operational) is refused with 'truck_not_found'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const before = await planCounts()
    expectErr(await saveAs(ownerA, nx('Phi'), [loadOf(truckABlocked, [[o.lineIds[0], 5]])]), 'truck_not_found')
    expectSameCounts(before, await planCounts(), 'blocked truck')
  })

  await gatedCase("L53. an unknown truck id is refused with 'truck_not_found'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    expectErr(await saveAs(ownerA, nx('Chi'), [loadOf(uid(), [[o.lineIds[0], 5]])]), 'truck_not_found')
  })

  await gatedCase("L54. an order line of another agency is refused with 'order_line_not_found'", async () => {
    const ob = await seedOrder('B', [[1, 1]])
    const before = await planCounts()
    expectErr(await saveAs(ownerA, nx('Psi'), [loadOf(truckA100, [[ob.lineIds[0], 1]])]), 'order_line_not_found')
    expectSameCounts(before, await planCounts(), 'other-agency line')
  })

  await gatedCase("L55. an unknown order line id is refused with 'order_line_not_found'", async () => {
    expectErr(await saveAs(ownerA, nx('Omega'), [loadOf(truckA100, [[uid(), 1]])]), 'order_line_not_found')
  })

  await gatedCase("L56. a line of a cancelled order is refused with 'order_cancelled' and writes nothing", async () => {
    const o = await seedOrder('A', [[5, 10]], 'cancelled')
    const before = await planCounts()
    expectErr(await saveAs(ownerA, nx('Alpha2'), [loadOf(truckA100, [[o.lineIds[0], 5]])]), 'order_cancelled')
    expectSameCounts(before, await planCounts(), 'cancelled order')
  })

  await gatedCase("L57. one order line allocated in two loads is refused with 'line_allocated_twice'", async () => {
    const o = await seedOrder('A', [[10, 10]])
    const before = await planCounts()
    const r = await saveAs(ownerA, nx('Beta2'), [
      loadOf(truckA100, [[o.lineIds[0], 5]]),
      loadOf(truckA1000, [[o.lineIds[0], 2]]),
    ])
    expectErr(r, 'line_allocated_twice')
    expectSameCounts(before, await planCounts(), 'line allocated twice')
  })

  await gatedCase("L58. quantity above the ordered quantity is refused with 'over_allocated' and writes nothing", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const before = await planCounts()
    const r = await saveAs(ownerA, nx('Gamma2'), [loadOf(truckA100, [[o.lineIds[0], 6]])])
    expectErr(r, 'over_allocated')
    expect(Array.isArray(r.problems) && r.problems.length > 0, `no problems listed: ${short(r)}`)
    expectSameCounts(before, await planCounts(), 'over-allocated line')
  })

  await gatedCase("L59. an overloaded second load is refused with 'over_capacity' and names load index 1", async () => {
    const o = await seedOrder('A', [[6, 10], [1, 10]])
    const before = await planCounts()
    const r = await saveAs(ownerA, nx('Delta2'), [
      loadOf(truckA100, [[o.lineIds[1], 1]]),
      loadOf(truckA50, [[o.lineIds[0], 6]]),
    ])
    expectErr(r, 'over_capacity')
    expectProblemIndex(r, 1)
    expectSameCounts(before, await planCounts(), 'over-capacity load')
  })

  await gatedCase('L60. a load weighing exactly the truck capacity (100 of 100 kg) is accepted', async () => {
    const o = await seedOrder('A', [[10, 10]])
    const r = await saveAs(ownerA, nx('Epsilon2'), [loadOf(truckA100, [[o.lineIds[0], 10]])])
    expectOk(r, 'exact capacity')
  })

  await gatedCase("L61. a load one hundredth of a kilogram over capacity is refused with 'over_capacity' (zero tolerance)", async () => {
    const o = await seedOrder('A', [[1, 100.01]])
    const r = await saveAs(ownerA, nx('Zeta2'), [loadOf(truckA100, [[o.lineIds[0], 1]])])
    expectErr(r, 'over_capacity')
  })

  await gatedCase("L62. the same truck in two loads of one plan is refused with 'truck_used_twice'", async () => {
    const o = await seedOrder('A', [[2, 10], [2, 10]])
    const before = await planCounts()
    const r = await saveAs(ownerA, nx('Eta2'), [
      loadOf(truckA100, [[o.lineIds[0], 2]]),
      loadOf(truckA100, [[o.lineIds[1], 2]]),
    ])
    expectErr(r, 'truck_used_twice')
    expectSameCounts(before, await planCounts(), 'truck used twice')
  })

  await gatedCase("L63. more than 200 loads is refused with 'too_large'", async () => {
    const loads = Array.from({ length: 201 }, () => ({ truck_id: uid(), lines: [] }))
    expectErr(await saveAs(ownerA, nx('Theta2'), loads), 'too_large')
  })

  await gatedCase("L64. more than 5000 lines is refused with 'too_large'", async () => {
    const o = await seedOrder('A', [[10, 10]])
    const lines = Array.from({ length: 5001 }, () => ({ order_line_id: o.lineIds[0], quantity: 0.001 }))
    expectErr(await saveAs(ownerA, nx('Iota2'), [{ truck_id: truckA1000, lines }]), 'too_large')
  })

  await gatedCase('L65. two drafts with different names may both allocate the same order line', async () => {
    const o = await seedOrder('A', [[5, 10]])
    await mustSave(nx('Kappa2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    await mustSave(nx('Lambda2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
  })

  // =========================================================================
  // D. Approve
  // =========================================================================
  await gatedCase('L66. approving a draft at version 1 returns ok/approved, sets approved_by and approved_at, version 2', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Mu2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    const r = await approveAs(ownerA, p.plan_id, 1)
    expectOk(r, 'approve')
    expect(r.state === 'approved', `state ${r.state}`)
    expect(Number(r.version) === 2, `version ${r.version}, expected 2`)
    const row = await planRow(p.plan_id)
    expect(row.status === 'approved', `status ${row.status}`)
    expect(row.approved_by === ownerA, `approved_by ${row.approved_by}`)
    expect(row.approved_at !== null, 'approved_at is null')
  })

  await gatedCase("L67. approving with a stale expected version is refused with 'version_conflict' and stays draft", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Nu2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectErr(await approveAs(ownerA, p.plan_id, 9), 'version_conflict')
    expect((await statusOf(p.plan_id)) === 'draft', 'status changed on a version conflict')
  })

  await gatedCase("L68. approving an approved plan is refused with 'illegal_transition'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Xi2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    await mustApprove(p.plan_id, 1)
    expectErr(await approveAs(ownerA, p.plan_id, 2), 'illegal_transition')
  })

  await gatedCase("L69. approving a cancelled plan is refused with 'illegal_transition'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Omicron2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectOk(await cancelAs(ownerA, p.plan_id, 1), 'cancel')
    expectErr(await approveAs(ownerA, p.plan_id, 2), 'illegal_transition')
  })

  await gatedCase("L70. a plan with zero loads is refused with 'empty_plan'", async () => {
    const planId = await seedPlanRow({ name: nx('Pi2'), status: 'draft' })
    expectErr(await approveAs(ownerA, planId, 1), 'empty_plan')
    expect((await statusOf(planId)) === 'draft', 'empty plan changed status')
  })

  await gatedCase('L71. approving a newer version supersedes the approved plan of the same name in the same step', async () => {
    const name = nx('Rho2')
    const o1 = await seedOrder('A', [[5, 10]])
    const p1 = await mustSave(name, [loadOf(truckA100, [[o1.lineIds[0], 5]])])
    await mustApprove(p1.plan_id, 1)
    const o2 = await seedOrder('A', [[4, 10]])
    const p2 = await mustSave(name, [loadOf(truckA100, [[o2.lineIds[0], 4]])])
    await mustApprove(p2.plan_id, 1)
    expect((await statusOf(p1.plan_id)) === 'superseded', `previous plan is ${await statusOf(p1.plan_id)}`)
    expect((await statusOf(p2.plan_id)) === 'approved', 'new plan is not approved')
    expect((await approvedCountForName(agencyA, name)) === 1, 'more than one approved plan for the name')
  })

  await gatedCase("L72. an order cancelled after save makes approve fail with 'stale_plan' naming the order line", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Sigma2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    const c = await callAs(ownerA, ORDER_CANCEL_SQL, [o.orderId, 1])
    expectOk(c, 'agency_order_cancel')
    const r = await approveAs(ownerA, p.plan_id, 1)
    expectErr(r, 'stale_plan')
    expect(JSON.stringify(r).includes(o.lineIds[0]), `offending line id missing: ${short(r)}`)
    expect((await statusOf(p.plan_id)) === 'draft', 'plan approved despite a cancelled order')
  })

  await gatedCase('L73. a truck whose capacity dropped below the load is not approved and stays draft', async () => {
    const truck = await seedTruck(agencyA, 50)
    const o = await seedOrder('A', [[4, 10]])
    const p = await mustSave(nx('Tau2'), [loadOf(truck, [[o.lineIds[0], 4]])])
    await su(`UPDATE public.agency_trucks SET payload_kg = 30 WHERE id = $1`, [truck])
    const r = await approveAs(ownerA, p.plan_id, 1)
    expect(r && r.ok === false, `approve accepted an overloaded plan: ${short(r)}`)
    expect((await statusOf(p.plan_id)) === 'draft', 'plan approved despite the capacity drop')
  })

  await gatedCase("L74. approving a plan whose line is already approved in a different plan is refused with 'line_already_planned'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const north = await mustSave(nx('North'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    await mustApprove(north.plan_id, 1)
    const south = await mustSave(nx('South'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectErr(await approveAs(ownerA, south.plan_id, 1), 'line_already_planned')
    expect((await statusOf(south.plan_id)) === 'draft', 'south approved despite the allocation clash')
  })

  await gatedCase("L75. approving a plan of another agency is refused with 'not_found' and changes nothing", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Upsilon2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectErr(await approveAs(ownerB, p.plan_id, 1), 'not_found')
    expect((await statusOf(p.plan_id)) === 'draft', 'foreign approve changed the plan')
  })

  await gatedCase("L76. viewer, finance and fleet_manager cannot approve: 'forbidden_scope', plan stays draft", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Phi2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    await gather([
      ['viewer', async () => expectErr(await approveAs(viewerA, p.plan_id, 1), 'forbidden_scope')],
      ['finance', async () => expectErr(await approveAs(financeA, p.plan_id, 1), 'forbidden_scope')],
      ['fleet_manager', async () => expectErr(await approveAs(fleetA, p.plan_id, 1), 'forbidden_scope')],
    ])
    expect((await statusOf(p.plan_id)) === 'draft', 'a forbidden approve changed the plan')
  })

  await gatedCase('L77. a dispatcher of agency A may approve a draft', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Chi2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectOk(await approveAs(dispatcherA, p.plan_id, 1), 'dispatcher approve')
  })

  await gatedCase("L78. approving an unknown plan id is refused with 'not_found'", async () => {
    expectErr(await approveAs(ownerA, uid(), 1), 'not_found')
  })

  await gatedCase("L79. a superseded plan cannot be approved again: 'illegal_transition'", async () => {
    const name = nx('Psi2')
    const o1 = await seedOrder('A', [[5, 10]])
    const p1 = await mustSave(name, [loadOf(truckA100, [[o1.lineIds[0], 5]])])
    await mustApprove(p1.plan_id, 1)
    const o2 = await seedOrder('A', [[4, 10]])
    const p2 = await mustSave(name, [loadOf(truckA100, [[o2.lineIds[0], 4]])])
    await mustApprove(p2.plan_id, 1)
    expect((await statusOf(p1.plan_id)) === 'superseded', 'precondition: p1 not superseded')
    expectErr(await approveAs(ownerA, p1.plan_id, 2), 'illegal_transition')
  })

  // =========================================================================
  // E. Cancel and lineage
  // =========================================================================
  await gatedCase('L80. cancelling a draft returns ok/cancelled, version 2 and the row is cancelled', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Omega2'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    const r = await cancelAs(ownerA, p.plan_id, 1)
    expectOk(r, 'cancel draft')
    expect(r.state === 'cancelled', `state ${r.state}`)
    expect(Number(r.version) === 2, `version ${r.version}, expected 2`)
    expect((await statusOf(p.plan_id)) === 'cancelled', 'row is not cancelled')
  })

  await gatedCase('L81. cancelling an approved plan with no consignment is ok and leaves it cancelled', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Alpha3'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    await mustApprove(p.plan_id, 1)
    expectOk(await cancelAs(ownerA, p.plan_id, 2), 'cancel approved')
    expect((await statusOf(p.plan_id)) === 'cancelled', 'approved plan not cancelled')
  })

  await gatedCase("L82. cancelling an approved plan whose order has a consignment is refused with 'has_consignments'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Beta3'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    await mustApprove(p.plan_id, 1)
    await su(
      `INSERT INTO public.agency_consignments (id, agency_id, order_id, gr_number, status, qr_token, idempotency_key)
       VALUES ($1, $2, $3, $4, 'created', $5, $6)`,
      [uid(), agencyA, o.orderId, nx('GR-LP'), nx('qr-lp'), nx('lp-cons-key')]
    )
    expectErr(await cancelAs(ownerA, p.plan_id, 2), 'has_consignments')
    expect((await statusOf(p.plan_id)) === 'approved', 'approved plan changed despite the consignment')
  })

  await gatedCase("L83. cancelling with a stale expected version is refused with 'version_conflict'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Gamma3'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectErr(await cancelAs(ownerA, p.plan_id, 7), 'version_conflict')
    expect((await statusOf(p.plan_id)) === 'draft', 'status changed on a version conflict')
  })

  await gatedCase("L84. cancelled is terminal: cancelling again is refused with 'illegal_transition'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Delta3'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectOk(await cancelAs(ownerA, p.plan_id, 1), 'first cancel')
    expectErr(await cancelAs(ownerA, p.plan_id, 2), 'illegal_transition')
  })

  await gatedCase("L85. superseded is terminal: cancelling it is refused with 'illegal_transition'", async () => {
    const name = nx('Epsilon3')
    const o1 = await seedOrder('A', [[5, 10]])
    const p1 = await mustSave(name, [loadOf(truckA100, [[o1.lineIds[0], 5]])])
    await mustApprove(p1.plan_id, 1)
    const o2 = await seedOrder('A', [[4, 10]])
    const p2 = await mustSave(name, [loadOf(truckA100, [[o2.lineIds[0], 4]])])
    await mustApprove(p2.plan_id, 1)
    expectErr(await cancelAs(ownerA, p1.plan_id, 2), 'illegal_transition')
  })

  await gatedCase('L86. viewer cannot cancel: forbidden_scope, plan unchanged', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Zeta3'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectErr(await cancelAs(viewerA, p.plan_id, 1), 'forbidden_scope')
    expect((await statusOf(p.plan_id)) === 'draft', 'a forbidden cancel changed the plan')
  })

  await gatedCase("L87. cancelling a plan of another agency is refused with 'not_found'", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('Eta3'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    expectErr(await cancelAs(ownerB, p.plan_id, 1), 'not_found')
    expect((await statusOf(p.plan_id)) === 'draft', 'foreign cancel changed the plan')
  })

  await gatedCase("L88. cancelling an unknown plan id is refused with 'not_found'", async () => {
    expectErr(await cancelAs(ownerA, uid(), 1), 'not_found')
  })

  await gatedCase('L89. a name whose plan was cancelled keeps its lineage: the next save is plan_version 2', async () => {
    const name = nx('Theta3')
    const o1 = await seedOrder('A', [[5, 10]])
    const p1 = await mustSave(name, [loadOf(truckA100, [[o1.lineIds[0], 5]])])
    expectOk(await cancelAs(ownerA, p1.plan_id, 1), 'cancel')
    const o2 = await seedOrder('A', [[4, 10]])
    const p2 = await mustSave(name, [loadOf(truckA100, [[o2.lineIds[0], 4]])])
    expect(Number(p2.plan_version) === 2, `plan_version ${p2.plan_version}, expected 2`)
  })

  // =========================================================================
  // Opus review hardening (L90+)
  // =========================================================================
  await gatedCase("L90. a load with no 'lines' key returns invalid_payload, never a raw error", async () => {
    const r = await saveAs(ownerA, nx('NoLines'), [{ truck_id: truckA100 }])
    expectErr(r, 'invalid_payload')
  })

  await gatedCase("L91. a line with no quantity returns invalid_payload with problems, never a raw error", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const r = await saveAs(ownerA, nx('NoQty'), [{ truck_id: truckA100, lines: [{ order_line_id: o.lineIds[0] }] }])
    expectErr(r, 'invalid_payload')
    expect(Array.isArray(r.problems) && r.problems.length > 0, `problems missing: ${short(r)}`)
  })

  await gatedCase("L92. a load with no truck_id and a line with no order_line_id return invalid_payload", async () => {
    const o = await seedOrder('A', [[5, 10]])
    expectErr(await saveAs(ownerA, nx('NoTruck'), [{ lines: [{ order_line_id: o.lineIds[0], quantity: 1 }] }]), 'invalid_payload')
    expectErr(await saveAs(ownerA, nx('NoOl'), [{ truck_id: truckA100, lines: [{ quantity: 1 }] }]), 'invalid_payload')
  })

  await gatedCase("L93. an unmet entry with no order_line_id returns invalid_unmet", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const r = await saveAs(ownerA, nx('NoUnmetId'), [loadOf(truckA100, [[o.lineIds[0], 5]])], { unmet: [{ reason: 'no_truck' }] })
    expectErr(r, 'invalid_unmet')
  })

  await gatedCase("L94. a line both allocated and unmet is refused with 'line_allocated_and_unmet' and writes nothing", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const before = await planCounts()
    const r = await saveAs(ownerA, nx('AllocUnmet'), [loadOf(truckA100, [[o.lineIds[0], 3]])], {
      unmet: [{ order_line_id: o.lineIds[0], reason: 'too_heavy' }],
    })
    expectErr(r, 'line_allocated_and_unmet')
    expectSameCounts(before, await planCounts(), 'allocated and unmet')
  })

  await gatedCase('L95. a zero weight_per_unit_kg does not bypass capacity (treated as missing, falls back to unit)', async () => {
    const o = await seedOrder('A', [[500, 0]])
    const r = await saveAs(ownerA, nx('ZeroWeight'), [loadOf(truckA100, [[o.lineIds[0], 500]])])
    expectErr(r, 'over_capacity')
  })

  await gatedCase("L96. approve repeats the weight check: a weight lost after save gives 'stale_plan' with weight_missing", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('LostWeight'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    await su(`UPDATE public.agency_order_lines SET unit = 'piece', weight_per_unit_kg = NULL WHERE id = $1`, [o.lineIds[0]])
    const r = await approveAs(ownerA, p.plan_id, 1)
    expectErr(r, 'stale_plan')
    expect(JSON.stringify(r).includes('weight_missing'), `weight_missing not reported: ${short(r)}`)
    expect((await statusOf(p.plan_id)) === 'draft', 'plan approved with an unknown weight')
  })

  await gatedCase("L97. an order in an APPROVED load plan cannot be cancelled: 'order_in_approved_plan'; a draft plan does not block", async () => {
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('CancelGuard'), [loadOf(truckA100, [[o.lineIds[0], 5]])])
    const ok = await callAs(ownerA, ORDER_CANCEL_SQL, [(await seedOrder('A', [[1, 1]])).orderId, 1])
    expectOk(ok, 'cancel of an unplanned order')
    await mustApprove(p.plan_id, 1)
    expectErr(await callAs(ownerA, ORDER_CANCEL_SQL, [o.orderId, 1]), 'order_in_approved_plan')
    expectErr(await callAs(ownerA, ORDER_CANCEL_SQL, [o.orderId, 2]), 'order_in_approved_plan')
    const st = await suOne(`SELECT status, version FROM public.agency_orders WHERE id = $1`, [o.orderId])
    expect(st.status === 'planned' && Number(st.version) === 2, `order ${st.status} v${st.version}, expected planned v2`)
    expectOk(await cancelAs(ownerA, p.plan_id, 2), 'cancel plan')
    const back = await suOne(`SELECT status, version FROM public.agency_orders WHERE id = $1`, [o.orderId])
    expect(back.status === 'draft' && Number(back.version) === 3, `order ${back.status} v${back.version}, expected draft v3`)
    expectOk(await callAs(ownerA, ORDER_CANCEL_SQL, [o.orderId, 3]), 'cancel order after the plan is cancelled')
  })

  await gatedCase('L98. service_role cannot TRUNCATE the plan tables and the guard functions are not callable by clients', async () => {
    const t = await su(`SELECT has_table_privilege('service_role', 'public.agency_load_plans', 'TRUNCATE') AS a,
                               has_table_privilege('service_role', 'public.agency_load_plan_lines', 'TRUNCATE') AS b`)
    expect(t.rows[0].a === false && t.rows[0].b === false, 'service_role still has TRUNCATE')
    for (const fn of ['agency_load_plans_guard()', 'agency_load_plan_children_guard()']) {
      const g = await su(`SELECT has_function_privilege('authenticated', 'public.${fn}', 'EXECUTE') AS a,
                                 has_function_privilege('anon', 'public.${fn}', 'EXECUTE') AS b`)
      expect(g.rows[0].a === false && g.rows[0].b === false, `${fn} executable by clients`)
    }
  })

  await gatedCase("L99. a truck in an APPROVED load plan cannot be put into maintenance: 'truck_in_approved_plan'; draft and cancelled plans do not block", async () => {
    const truck = await seedTruck(agencyA, 100)
    const VUPD = `SELECT public.agency_vehicle_update($1::uuid, $2::int, $3::jsonb) AS r`
    const verOf = async () => (await suOne(`SELECT version FROM public.agency_trucks WHERE id = $1`, [truck])).version
    const block = async () =>
      callAs(fleetA, VUPD, [truck, await verOf(), JSON.stringify({ maintenance_blocked: true, maintenance_block_reason: 'service' })])
    const o = await seedOrder('A', [[5, 10]])
    const p = await mustSave(nx('TruckGuard'), [loadOf(truck, [[o.lineIds[0], 5]])])
    expectOk(await callAs(fleetA, VUPD, [truck, await verOf(), JSON.stringify({ notes: 'ok' })]), 'notes patch on a drafted truck')
    await mustApprove(p.plan_id, 1)
    expectErr(await block(), 'truck_in_approved_plan')
    const t1 = await suOne(`SELECT maintenance_blocked FROM public.agency_trucks WHERE id = $1`, [truck])
    expect(t1.maintenance_blocked === false, 'truck was blocked despite the approved plan')
    expectOk(await callAs(fleetA, VUPD, [truck, await verOf(), JSON.stringify({ notes: 'still editable' })]), 'non-maintenance patch on a planned truck')
    expectOk(await cancelAs(ownerA, p.plan_id, 2), 'cancel plan')
    expectOk(await block(), 'maintenance block after the plan is cancelled')
  })

  await gatedCase('L100. a nested UPDATE cannot skip the plan, load, line and unmet immutability guards', async () => {
    const o = await seedOrder('A', [[5, 10]])
    const planId = await seedPlanRow({ name: nx('LP-nested') })
    const loadId = await seedLoadRow(planId, agencyA, truckA100)
    const lineId = await seedLineRow(planId, loadId, agencyA, o.lineIds[0], 5)
    const unmetId = uid()
    await su(`INSERT INTO public.agency_load_plan_unmet (id, plan_id, agency_id, order_line_id, reason) VALUES ($1, $2, $3, $4, 'no_truck')`,
      [unmetId, planId, agencyA, o.lineIds[0]])
    await su(`UPDATE public.agency_load_plans SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [planId, ownerA])
    const targets = [
      ['plan', `UPDATE public.agency_load_plans SET name = 'hacked' WHERE id = '${planId}'`],
      ['plan status', `UPDATE public.agency_load_plans SET status = 'draft' WHERE id = '${planId}'`],
      ['load', `UPDATE public.agency_load_plan_loads SET total_kg = 999 WHERE id = '${loadId}'`],
      ['line', `UPDATE public.agency_load_plan_lines SET quantity = 99 WHERE id = '${lineId}'`],
      ['unmet', `UPDATE public.agency_load_plan_unmet SET reason = 'x' WHERE id = '${unmetId}'`],
    ]
    await su(`CREATE FUNCTION public.lp_nested_probe() RETURNS trigger LANGUAGE plpgsql AS $f$
      BEGIN EXECUTE TG_ARGV[0]; RETURN NEW; END $f$`)
    const failures = []
    try {
      for (const [label, stmt] of targets) {
        await su(`DROP TRIGGER IF EXISTS lp_nested_probe ON public.agency_orders`)
        await su(`CREATE TRIGGER lp_nested_probe AFTER UPDATE ON public.agency_orders
                  FOR EACH ROW EXECUTE FUNCTION public.lp_nested_probe('${stmt.replace(/'/g, "''")}')`)
        const err = await insertError(`UPDATE public.agency_orders SET client_order_ref = client_order_ref WHERE id = $1`, [o.orderId])
        if (err === null) failures.push(`${label}: nested update was accepted`)
      }
    } finally {
      await su(`DROP TRIGGER IF EXISTS lp_nested_probe ON public.agency_orders`)
      await su(`DROP FUNCTION IF EXISTS public.lp_nested_probe()`)
    }
    expect(failures.length === 0, failures.join('; '))
    const row = await planRow(planId)
    expect(row.name !== 'hacked' && row.status === 'approved', `plan changed: ${short(row)}`)
  })

  await gatedCase('L101. FK actions still work: batch/user SET NULL on an approved plan and an agency delete cascade', async () => {
    const batchId = uid()
    await su(
      `INSERT INTO public.agency_order_batches (id, agency_id, agreement_id, file_hash, row_count, created_by, idempotency_key)
       VALUES ($1, $2, $3, $4, 1, $5, $6)`,
      [batchId, agencyA, agrA, nx('lp-batch-hash2'), ownerA, nx('lp-batch-key2')]
    )
    const planId = await seedPlanRow({ status: 'approved', batchId, name: nx('LP-setnull') })
    await su(`DELETE FROM public.agency_order_batches WHERE id = $1`, [batchId])
    const after = await planRow(planId)
    expect(after && after.batch_id === null && after.status === 'approved', `batch SET NULL failed: ${short(after)}`)
    const u = await createUser('lp-setnull-user')
    const pid = uid()
    await su(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key, approved_by, approved_at, created_by)
       VALUES ($1, $2, $3, 'approved', 1, 1, $4, $5, now(), $5)`,
      [pid, agencyA, nx('LP-usernull'), nx('lp-un-key'), u]
    )
    await su(`DELETE FROM public.users WHERE id = $1`, [u])
    await su(`DELETE FROM auth.users WHERE id = $1`, [u])
    const un = await planRow(pid)
    expect(un && un.approved_by === null && un.created_by === null && un.status === 'approved', `user SET NULL failed: ${short(un)}`)
    const owner = await createUser('lp-cascade-owner')
    const agency = await createAgencyRow(owner, 'LoadPlan Cascade', 'approved')
    const agr = await seedAgreement(agency, 'Cascade Client')
    const site = await seedSite(agency, agr, 'ship_to', 'Cascade Depot')
    const truck = await seedTruck(agency, 100)
    const orderId = uid()
    await su(`INSERT INTO public.agency_orders (id, agency_id, agreement_id, batch_id, client_order_ref, status, version) VALUES ($1, $2, $3, NULL, $4, 'draft', 1)`,
      [orderId, agency, agr, nx('LP-CAS')])
    const olId = uid()
    await su(
      `INSERT INTO public.agency_order_lines
         (id, agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg, length_m, width_m, height_m,
          pickup_site_id, drop_site_id, pickup_from, pickup_to, delivery_from, delivery_to)
       VALUES ($1, $2, $3, 1, 'SKU-LP', 'Load plan line', 5, 'kg', 10, 1, 1, 1, $4, $4, now(), now(), now(), now())`,
      [olId, agency, orderId, site]
    )
    const cp = uid()
    await su(
      `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key, approved_by, approved_at, created_by)
       VALUES ($1, $2, $3, 'draft', 1, 1, $4, NULL, NULL, $5)`,
      [cp, agency, nx('LP-cascade'), nx('lp-cas-key'), owner]
    )
    const cl = await seedLoadRow(cp, agency, truck)
    await seedLineRow(cp, cl, agency, olId, 5)
    await su(`UPDATE public.agency_load_plans SET status = 'approved', approved_by = $2, approved_at = now() WHERE id = $1`, [cp, owner])
    await su(`DELETE FROM public.transport_agencies WHERE id = $1`, [agency])
    const left = await suOne(
      `SELECT (SELECT count(*) FROM public.agency_load_plans WHERE agency_id = $1)::int AS p,
              (SELECT count(*) FROM public.agency_load_plan_loads WHERE agency_id = $1)::int AS l,
              (SELECT count(*) FROM public.agency_load_plan_lines WHERE agency_id = $1)::int AS n`, [agency])
    expect(left.p === 0 && left.l === 0 && left.n === 0, `cascade left rows: ${short(left)}`)
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
