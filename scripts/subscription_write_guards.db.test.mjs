#!/usr/bin/env node
/**
 * Agency subscription WRITE GUARDS (TO-152 rulings B, section 1). Red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). Replays every supabase/migrations file
 * BELOW 20261035000000 (so 027 limits, 028 settings table and the 034 chain are in place), then loads
 * 20261035000000_subscription_write_guards.sql. Commands run as `authenticated` with request.jwt.claims set to
 * the owner (the way PostgREST does); fixtures are written as superuser; the guard is called as superuser.
 *
 * The migration does NOT exist yet. Every case is gated and is EXPECTED to fail now with
 * "red: migration 20261035000000_subscription_write_guards.sql is missing". Cases go green only once the
 * migration does what the rulings section 1 requires.
 *
 * Contract pinned by this battery (where the rulings leave a choice, the choice is stated here):
 *   1. agency_subscription_assert(p_agency_id uuid, p_action text, p_add integer) gains:
 *      - 'record_add' -> resource 'records': SB002 in grace, expired, cancelled, none; allowed in trial, active,
 *        past_due. No SB001 and no SB003 for this action.
 *      - 'settle' -> resource 'settlement': allowed in trial, active, past_due, grace; SB002 in expired,
 *        cancelled, none.
 *      - 'erp' -> resource 'erp': the record_add matrix, PLUS SB004 SUBSCRIPTION_FEATURE_NOT_IN_PLAN when the
 *        plan's erp_enabled is false. Status is checked FIRST, so a read-only agency on Starter gets SB002, not SB004.
 *      SB004 DETAIL = {code, resource:'erp', limit:null, used:null, plan:<tier>, status:<status>}.
 *      Unknown action keeps the existing 22023 raise.
 *   2. subscription_plans.erp_enabled boolean NOT NULL DEFAULT false; true for Growth, Professional, Enterprise;
 *      false for Starter. agency_subscription_entitlement() gains features{erp} matching the plan.
 *   3. Wiring. The guard runs AFTER scope resolution and BEFORE any other check (payload validation, state
 *      checks) and before any write. So a forbidden scope still gets its own error (forbidden_scope), while a
 *      refused status gets SB002 whatever the payload. Replays are the exception, see erp_event_ingest.
 *   4. erp_event_ingest is service-role only and reports typed jsonb errors, not raises. Its guard runs after
 *      the credential check, the shape checks and the duplicate-event lookup (replays are answered first), and
 *      immediately before its agency_order_import call. A refusal is RETURNED as jsonb
 *      {ok:false, error:'subscription_read_only'|'subscription_feature_not_in_plan', code:'SB002'|'SB004'}.
 *      This battery accepts either a raised SB00x or that returned jsonb code.
 *   5. Never-guarded commands are called with NULL-typed arguments. That proves only that they do NOT answer with
 *      SB00x, which is the contract. Their full behaviour is covered by the journey battery.
 *
 * Fixtures: wiring cases build real entities (agreement, truck, driver with employment, order, payroll period,
 * maintenance item, ERP connection) as superuser, so refused cases reach the guard after scope resolution.
 * Assumptions to confirm when the migration lands: the plan names 'Starter', 'Growth', 'Professional',
 * 'Enterprise'; the ERP connection's client_id reuses the agreement id (its FK target is not verified here).
 *
 * Evidence class: local DB only (PGlite, single session). No concurrency, no hosted PostgREST or GoTrue.
 *
 * Usage:  node scripts/subscription_write_guards.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud failure, never a skip.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261035000000_subscription_write_guards.sql'
const MIGRATION_PRESENT = existsSync(join(MIGRATIONS_DIR, MIGRATION_FILE))

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}

const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)

const db = await PGlite.create({ extensions: { uuid_ossp } })

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

function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].split(' [SQL:')[0].trim()
}

// ---------------------------------------------------------------------------
// Case registry. Numbered Q01.. in registration order.
// ---------------------------------------------------------------------------
const CASES = []
function qCase(title, fn) {
  const n = CASES.length + 1
  CASES.push({ name: `Q${String(n).padStart(2, '0')}. ${title}`, fn })
}

async function runCase(c) {
  try {
    await c.fn()
    record(c.name, true)
  } catch (error) {
    const message = error && error.message ? error.message.split('\n')[0].slice(0, 240) : String(error)
    record(c.name, false, message)
  }
}

// ---------------------------------------------------------------------------
// Gating
// ---------------------------------------------------------------------------
let migrationApplied = false
let migrationError = ''

function requireMigration() {
  if (!MIGRATION_PRESENT) {
    throw new Error(`red: migration ${MIGRATION_FILE} is missing, so the write guards do not exist yet`)
  }
  if (!migrationApplied) throw new Error(`red: migration ${MIGRATION_FILE} failed to apply: ${migrationError}`)
}

async function applyFiles(files) {
  for (const file of files) {
    const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sqlText)
    } catch (error) {
      const message = error && error.message ? error.message.split('\n')[0] : String(error)
      throw new Error(`migration ${file} failed: ${message}`)
    }
  }
}

// ---------------------------------------------------------------------------
// Ids and role switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
let nonce = 0
const nx = (prefix) => `${prefix}-${++nonce}`
const genGstin = () => `07ABCDE${1000 + ++seq}A1Z5`

async function actAsService() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
}

async function actAs(sub) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    sub ? JSON.stringify({ sub, role: 'authenticated' }) : '{}',
  ])
  await db.exec('SET ROLE authenticated')
}

async function asActor(userId, fn) {
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await actAsService()
  }
}

async function su(sql, params = []) {
  await actAsService()
  return db.query(sql, params)
}

async function suOne(sql, params = []) {
  return (await su(sql, params)).rows[0]
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function parseDetail(detail) {
  if (!detail) return null
  if (typeof detail === 'object') return detail
  try {
    return JSON.parse(detail)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Fixture builders (superuser)
// ---------------------------------------------------------------------------
async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [id, email, '{}'])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

async function createAgencyRow(userId, tag, status = 'approved') {
  const id = uid()
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number, created_at)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6, now())`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, genGstin(), `ABCDE${String(1000 + (seq % 9000)).padStart(4, '0')}Q`]
  )
  return id
}

async function insertSub({ agencyId, userId, plan, status }) {
  const id = uid()
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
     VALUES ($1, $2, $3, (SELECT id FROM public.subscription_plans WHERE name = $4), $5, 'monthly',
             now(), now() + interval '30 days')`,
    [id, userId, agencyId, plan, status]
  )
  return id
}

/** Agency + owner + optional subscription. Pass {plan:null} for no subscription at all. */
async function mkAgency(tag, o = {}) {
  const { status = 'approved', plan = 'Starter', subStatus = 'active' } = o
  const owner = await createUser(tag)
  const agency = await createAgencyRow(owner, tag, status)
  let sub = null
  if (plan) sub = await insertSub({ agencyId: agency, userId: owner, plan, status: subStatus })
  return { owner, agency, sub }
}

async function ensureAgreement(agencyId) {
  const row = await suOne(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES (gen_random_uuid(), $1, 'Q Client', 'active', $2) RETURNING id`,
    [agencyId, nx('q-agr')]
  )
  return row.id
}

/** Real entities for one agency, built as superuser. Refused wiring cases reach the guard through these. */
async function fixtures(a) {
  const agreement = await ensureAgreement(a.agency)
  const truck = uid()
  await su(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number) VALUES ($1, $2, 'eicher_14ft', $3)`,
    [truck, a.agency, nx('Q-RC')]
  )
  const driver = uid()
  await su(
    `INSERT INTO public.drivers (id, full_name, phone, vehicle_type, pan_number) VALUES ($1, $2, $3, 'eicher_14ft', $4)`,
    [driver, `Q Driver ${nx('d')}`, `9${String(100000000 + ++seq).slice(-9)}`, `QDRVW${String(1000 + (seq % 9000)).padStart(4, '0')}F`]
  )
  await su(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, 'active')`,
    [uid(), a.agency, driver]
  )
  const order = uid()
  await su(
    `INSERT INTO public.agency_orders (id, agency_id, agreement_id, client_order_ref, status, version)
     VALUES ($1, $2, $3, $4, 'draft', 1)`,
    [order, a.agency, agreement, nx('Q-ORD')]
  )
  const period = uid()
  await su(
    `INSERT INTO public.agency_payroll_periods (id, agency_id, period_start, period_end, idempotency_key)
     VALUES ($1, $2, '2026-01-01', '2026-01-31', $3)`,
    [period, a.agency, nx('Q-PER')]
  )
  const item = uid()
  await su(
    `INSERT INTO public.agency_maintenance_items (id, agency_id, truck_id, name, interval_km) VALUES ($1, $2, $3, $4, 10000)`,
    [item, a.agency, truck, nx('Oil')]
  )
  const connection = uid()
  await su(
    `INSERT INTO public.agency_erp_connections
       (id, agency_id, client_id, agreement_id, name, kind, secret_hash, secret_hint, idempotency_key)
     VALUES ($1, $2, $3, $3, $4, 'webhook', public.agency_erp_hash('sek'), 'sek', $5)`,
    [connection, a.agency, agreement, nx('Q-ERP'), nx('Q-ERPK')]
  )
  return {
    agreement, truck, driver, order, period, item, connection,
    day: '2026-03-10', pStart: '2026-01-01', pEnd: '2026-01-31',
  }
}

async function setEnforcement(on) {
  await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = $1`, [on])
}

// ---------------------------------------------------------------------------
// Call helpers
// ---------------------------------------------------------------------------
/** Runs an RPC as `userId`. Returns {raised, code, message} or {raised:false, value}. */
async function callAs(userId, sql, params = []) {
  return asActor(userId, async () => {
    try {
      const res = await db.query(sql, params)
      return { raised: false, value: parseJson(res.rows[0].r) }
    } catch (error) {
      return { raised: true, code: error.code || null, message: firstLine(error) }
    }
  })
}

/** Service-role call. Typed jsonb refusals with an SB00x code count as refusals too (see header item 4). */
async function callService(sql, params = []) {
  await actAsService()
  try {
    const res = await db.query(sql, params)
    const value = parseJson(res.rows[0].r)
    if (value && typeof value === 'object' && typeof value.code === 'string' && value.code.startsWith('SB00')) {
      return { raised: true, code: value.code, message: value.code, value }
    }
    return { raised: false, value }
  } catch (error) {
    return { raised: true, code: error.code || null, message: firstLine(error) }
  }
}

/** Calls the guard as superuser. */
async function guard(agencyId, action, add) {
  await actAsService()
  try {
    await db.query('SELECT public.agency_subscription_assert($1::uuid, $2::text, $3::int)', [agencyId, action, add])
    return { raised: false }
  } catch (error) {
    return {
      raised: true,
      code: error.code || null,
      message: firstLine(error),
      detail: parseDetail(error.detail),
    }
  }
}

function describe(res) {
  return res.raised ? `${res.code} ${res.message}` : 'no error'
}

const isSB = (res) => res.raised && typeof res.code === 'string' && /^SB00\d$/.test(res.code)

function expectNotSB(res, label) {
  expect(!isSB(res), `${label}: must not be refused by the guard, got ${describe(res)}`)
}

function expectBlocked(res, code, label) {
  expect(
    res.raised && res.code === code && res.message.startsWith(code),
    `${label}: expected ${code}, got ${describe(res)}`
  )
}

function expectDetail(res, expected, label) {
  const d = res.detail
  expect(d && typeof d === 'object', `${label}: DETAIL is not JSON (${JSON.stringify(res.detail)})`)
  for (const key of ['code', 'resource', 'limit', 'used', 'plan', 'status']) {
    expect(key in d, `${label}: DETAIL is missing key "${key}"`)
  }
  for (const [key, value] of Object.entries(expected)) {
    expect(d[key] === value, `${label}: DETAIL.${key} expected ${JSON.stringify(value)}, got ${JSON.stringify(d[key])}`)
  }
}

async function fnDefs(name) {
  const rows = (
    await su(
      `SELECT pg_get_functiondef(p.oid) AS d
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`,
      [name]
    )
  ).rows
  expect(rows.length > 0, `function public.${name} is missing`)
  return rows.map((r) => r.d).join('\n')
}

async function fnPrivs(name) {
  const row = (
    await su(
      `SELECT p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`,
      [name]
    )
  ).rows[0]
  expect(row, `function public.${name} is missing`)
  return row
}

const GUARD = 'agency_subscription_assert'
const STATUSES = ['trial', 'active', 'past_due', 'grace', 'expired', 'cancelled', 'none']

// ---------------------------------------------------------------------------
// Command table
// ---------------------------------------------------------------------------
const GROUPS = {
  record_add: {
    action: 'record_add',
    resource: 'records',
    allowed: ['trial', 'active', 'past_due'],
    plan: 'Starter',
    cmds: [
      { fn: 'agency_consignment_create', sql: 'SELECT public.agency_consignment_create($1::uuid, $2::text) AS r', args: (c) => [c.order, nx('Q-K')] },
      { fn: 'agency_expense_record', sql: 'SELECT public.agency_expense_record($1::uuid, $2::text, $3::bigint, $4::date, $5::text, $6::text) AS r', args: (c) => [c.truck, 'toll', 25000, c.day, 'Q note', nx('Q-K')] },
      { fn: 'agency_fuel_fill_record', sql: 'SELECT public.agency_fuel_fill_record($1::uuid, $2::numeric, $3::numeric, $4::boolean, $5::bigint, $6::date, $7::text) AS r', args: (c) => [c.truck, 1000, 40, true, 400000, c.day, nx('Q-K')] },
      { fn: 'agency_maintenance_item_upsert', sql: 'SELECT public.agency_maintenance_item_upsert($1::uuid, $2::text, $3::int, $4::int, $5::numeric, $6::date, $7::int) AS r', args: (c) => [c.truck, nx('Tyre'), 10000, null, null, null, 0] },
      { fn: 'agency_payroll_open_period', sql: 'SELECT public.agency_payroll_open_period($1::date, $2::date, $3::text) AS r', args: () => ['2026-02-01', '2026-02-28', nx('Q-K')] },
      { fn: 'agency_driver_rate_set', sql: 'SELECT public.agency_driver_rate_set($1::uuid, $2::bigint, $3::bigint, $4::bigint, $5::int) AS r', args: (c) => [c.driver, 100000, 1500, 2000, 0] },
      { fn: 'agency_load_plan_save', sql: 'SELECT public.agency_load_plan_save($1::text, $2::uuid, $3::jsonb, $4::jsonb, $5::text) AS r', args: () => [nx('Plan'), null, '[]', '[]', nx('Q-K')] },
    ],
  },
  settle: {
    action: 'settle',
    resource: 'settlement',
    allowed: ['trial', 'active', 'past_due', 'grace'],
    plan: 'Starter',
    cmds: [
      { fn: 'agency_invoice_issue', sql: 'SELECT public.agency_invoice_issue($1::uuid, $2::jsonb, $3::text, $4::text, $5::int, $6::boolean, $7::boolean, $8::text) AS r', args: (c) => [c.agreement, '[]', '27', '27', 18, false, false, nx('Q-K')] },
      { fn: 'agency_payroll_close_period', sql: 'SELECT public.agency_payroll_close_period($1::date, $2::date, $3::text) AS r', args: (c) => [c.pStart, c.pEnd, nx('Q-K')] },
      { fn: 'agency_payroll_adjust', sql: 'SELECT public.agency_payroll_adjust($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text) AS r', args: (c) => [c.period, c.driver, 'advance', 50000, 'Q advance'] },
      { fn: 'agency_maintenance_service_done', sql: 'SELECT public.agency_maintenance_service_done($1::uuid, $2::numeric, $3::date, $4::int, $5::bigint, $6::text) AS r', args: (c) => [c.item, 1000, c.day, 0, 50000, nx('Q-K')] },
    ],
  },
  erp: {
    action: 'erp',
    resource: 'erp',
    allowed: ['trial', 'active', 'past_due'],
    plan: 'Growth',
    cmds: [
      { fn: 'agency_erp_connection_create', sql: 'SELECT public.agency_erp_connection_create($1::uuid, $2::uuid, $3::text, $4::text, $5::text) AS r', args: (c) => [c.agreement, c.agreement, nx('ERP'), 'webhook', nx('Q-K')] },
      { fn: 'agency_erp_connection_rotate_secret', sql: 'SELECT public.agency_erp_connection_rotate_secret($1::uuid, $2::int) AS r', args: (c) => [c.connection, 1] },
      { fn: 'erp_event_ingest', service: true, sql: 'SELECT public.erp_event_ingest($1::uuid, $2::text, $3::text, $4::jsonb) AS r', args: (c) => [c.connection, 'sek', nx('evt'), '[{"sku":"A","qty":1}]'] },
    ],
  },
}

/** Never-guarded commands: NULL-typed arguments; the contract is only "not refused by the guard". */
const NEVER = [
  ['agency_invoice_record_payment', ['uuid', 'bigint', 'text', 'text', 'date', 'int', 'text']],
  ['agency_invoice_cancel', ['uuid', 'int', 'text']],
  ['agency_consignment_event', ['uuid', 'text', 'int', 'text', 'text']],
  ['agency_consignment_qr', ['uuid']],
  ['tracking_ping_record', ['uuid', 'numeric', 'numeric', 'numeric', 'timestamptz']],
  ['agency_incident_open', ['uuid', 'text', 'jsonb', 'text']],
  ['agency_incident_update', ['uuid', 'text', 'int', 'text']],
  ['agency_job_set_status', ['uuid', 'text']],
  ['agency_driver_payout_request', ['uuid', 'numeric', 'text', 'text']],
  ['agency_order_cancel', ['uuid', 'int']],
  ['agency_load_plan_cancel', ['uuid', 'int']],
  ['agency_erp_connection_set_status', ['uuid', 'text', 'int']],
  ['agency_vehicle_update', ['uuid', 'int', 'jsonb']],
  ['agency_truck_unassign_driver', ['uuid', 'int']],
]

/** Cases that run the command for a given agency state with enforcement ON. */
async function agencyFor(group, status) {
  const g = GROUPS[group]
  const plan = status === 'none' ? null : g.plan
  return mkAgency(nx('q'), { plan, subStatus: status })
}

// ===========================================================================
// 1. Migration and static shape
// ===========================================================================
qCase('migration 20261035000000_subscription_write_guards.sql is present and applies after the 034 chain', async () => {
  requireMigration()
})

qCase('guard keeps its signature: agency_subscription_assert(uuid, text, integer) returns void', async () => {
  requireMigration()
  const row = await fnPrivs(GUARD)
  const args = (await su(
    `SELECT pg_get_function_identity_arguments(p.oid) AS a, pg_get_function_result(p.oid) AS r
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = $1`,
    [GUARD]
  )).rows[0]
  expect(args.a === 'p_agency_id uuid, p_action text, p_add integer', `arguments are "${args.a}"`)
  expect(args.r === 'void', `returns "${args.r}"`)
  expect(row.prosecdef === true, 'guard is not SECURITY DEFINER')
})

qCase('guard grants unchanged: no PUBLIC, anon or authenticated EXECUTE', async () => {
  requireMigration()
  const row = await fnPrivs(GUARD)
  expect(row.public_exec === false && row.anon_exec === false && row.auth_exec === false,
    `public=${row.public_exec} anon=${row.anon_exec} authenticated=${row.auth_exec}`)
})

qCase('guard pins search_path', async () => {
  requireMigration()
  const row = await fnPrivs(GUARD)
  expect((row.proconfig || []).some((s) => s.startsWith('search_path=')), `proconfig=${JSON.stringify(row.proconfig)}`)
})

qCase('subscription_plans.erp_enabled exists, boolean, NOT NULL, default false', async () => {
  requireMigration()
  const row = (await su(
    `SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'subscription_plans' AND column_name = 'erp_enabled'`
  )).rows[0]
  expect(row, 'column is missing')
  expect(row.data_type === 'boolean' && row.is_nullable === 'NO', JSON.stringify(row))
  expect(String(row.column_default).includes('false'), `default is ${row.column_default}`)
})

for (const plan of ['Growth', 'Professional', 'Enterprise']) {
  qCase(`plan ${plan} has erp_enabled = true`, async () => {
    requireMigration()
    const row = (await su(`SELECT erp_enabled FROM public.subscription_plans WHERE lower(name) = lower($1)`, [plan])).rows[0]
    expect(row, `plan ${plan} is missing`)
    expect(row.erp_enabled === true, `erp_enabled=${row.erp_enabled}`)
  })
}

qCase('plan Starter has erp_enabled = false', async () => {
  requireMigration()
  const row = (await su(`SELECT erp_enabled FROM public.subscription_plans WHERE lower(name) = 'starter'`)).rows[0]
  expect(row, 'plan Starter is missing')
  expect(row.erp_enabled === false, `erp_enabled=${row.erp_enabled}`)
})

qCase('entitlement snapshot carries features.erp = true for a Growth agency', async () => {
  requireMigration()
  await setEnforcement(false)
  const a = await mkAgency(nx('q-ent'), { plan: 'Growth', subStatus: 'active' })
  const r = await callAs(a.owner, 'SELECT public.agency_subscription_entitlement() AS r')
  expect(!r.raised, describe(r))
  expect(r.value.features && r.value.features.erp === true, `features=${JSON.stringify(r.value.features)}`)
})

qCase('entitlement snapshot carries features.erp = false for a Starter agency', async () => {
  requireMigration()
  await setEnforcement(false)
  const a = await mkAgency(nx('q-ent'), { plan: 'Starter', subStatus: 'active' })
  const r = await callAs(a.owner, 'SELECT public.agency_subscription_entitlement() AS r')
  expect(!r.raised, describe(r))
  expect(r.value.features && r.value.features.erp === false, `features=${JSON.stringify(r.value.features)}`)
})

// Static: each guarded command contains the guard call with its action literal.
for (const [group, g] of Object.entries(GROUPS)) {
  for (const cmd of g.cmds) {
    qCase(`static: ${cmd.fn} calls agency_subscription_assert with '${g.action}'`, async () => {
      requireMigration()
      const d = await fnDefs(cmd.fn)
      expect(d.includes('agency_subscription_assert('), `${cmd.fn} has no guard call`)
      expect(d.includes(`'${g.action}'`), `${cmd.fn} does not pass '${g.action}'`)
    })
  }
}

// Static: never-guarded commands do not call the guard.
for (const [fn] of NEVER) {
  qCase(`static: ${fn} does not call agency_subscription_assert`, async () => {
    requireMigration()
    const d = await fnDefs(fn)
    expect(!d.includes('agency_subscription_assert('), `${fn} calls the guard but must not`)
  })
}

// search_path pinned and no PUBLIC/anon execute on every replaced function.
for (const g of Object.values(GROUPS)) {
  for (const cmd of g.cmds) {
    qCase(`grants: ${cmd.fn} keeps search_path pinned and no PUBLIC or anon EXECUTE`, async () => {
      requireMigration()
      const row = await fnPrivs(cmd.fn)
      expect((row.proconfig || []).some((s) => s.startsWith('search_path=')), `proconfig=${JSON.stringify(row.proconfig)}`)
      expect(row.public_exec === false && row.anon_exec === false, `public=${row.public_exec} anon=${row.anon_exec}`)
    })
  }
}

// ===========================================================================
// 2. Guard matrix, direct calls (enforcement ON)
// ===========================================================================
for (const [group, g] of Object.entries(GROUPS)) {
  for (const status of STATUSES) {
    qCase(`guard ${g.action} in ${status} (${g.plan}) ${g.allowed.includes(status) ? 'is allowed' : `raises ${status === 'none' ? 'no-subscription' : status} SB002`}`, async () => {
      requireMigration()
      await setEnforcement(true)
      const a = await agencyFor(group, status)
      const res = await guard(a.agency, g.action, 1)
      if (g.allowed.includes(status)) {
        expect(!res.raised, `expected allowed, got ${describe(res)}`)
      } else {
        expect(res.raised && res.code === 'SB002' && res.message.startsWith('SB002'), `expected SB002, got ${describe(res)}`)
        expectDetail(res, { code: 'SB002', resource: g.resource }, `${g.action}/${status}`)
      }
    })
  }
}

qCase('guard erp in trial on Starter raises SB004 with DETAIL {code,resource:erp,plan:starter,status:trial}', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-sb4'), { plan: 'Starter', subStatus: 'trial' })
  const res = await guard(a.agency, 'erp', 0)
  expect(res.raised && res.code === 'SB004' && res.message.startsWith('SB004'), `expected SB004, got ${describe(res)}`)
  expectDetail(res, { code: 'SB004', resource: 'erp', plan: 'starter', status: 'trial' }, 'erp SB004')
})

qCase('guard erp on Starter in grace raises SB002 (status is checked before the plan feature)', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-sb2first'), { plan: 'Starter', subStatus: 'grace' })
  const res = await guard(a.agency, 'erp', 0)
  expect(res.raised && res.code === 'SB002', `expected SB002, got ${describe(res)}`)
})

qCase('guard unknown action still raises 22023', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-unk'), { plan: 'Starter', subStatus: 'active' })
  const res = await guard(a.agency, 'no_such_action', 1)
  expect(res.raised && res.code === '22023', `expected 22023, got ${describe(res)}`)
})

for (const [group, g] of Object.entries(GROUPS)) {
  qCase(`guard ${g.action} with enforcement OFF changes nothing (expired agency is not refused)`, async () => {
    requireMigration()
    await setEnforcement(false)
    const a = await agencyFor(group, 'expired')
    const res = await guard(a.agency, g.action, 1)
    expect(!res.raised, `expected no check with enforcement OFF, got ${describe(res)}`)
  })
}

// ===========================================================================
// 3. Wiring, one group per command x status (enforcement ON)
// ===========================================================================
for (const [group, g] of Object.entries(GROUPS)) {
  for (const cmd of g.cmds) {
    for (const status of STATUSES) {
      const allowed = g.allowed.includes(status)
      qCase(`wiring ${cmd.fn} in ${status}: ${allowed ? 'not refused by the guard' : 'refused SB002'}`, async () => {
        requireMigration()
        await setEnforcement(true)
        const a = await agencyFor(group, status)
        const c = await fixtures(a)
        const res = cmd.service
          ? await callService(cmd.sql, cmd.args(c))
          : await callAs(a.owner, cmd.sql, cmd.args(c))
        if (allowed) expectNotSB(res, `${cmd.fn}/${status}`)
        else expectBlocked(res, 'SB002', `${cmd.fn}/${status}`)
      })
    }
  }
  qCase(`wiring ${group}: enforcement OFF changes nothing for ${g.cmds[0].fn} (expired agency not refused)`, async () => {
    requireMigration()
    await setEnforcement(false)
    const a = await agencyFor(group, 'expired')
    const c = await fixtures(a)
    const cmd = g.cmds[0]
    const res = cmd.service ? await callService(cmd.sql, cmd.args(c)) : await callAs(a.owner, cmd.sql, cmd.args(c))
    expectNotSB(res, `${cmd.fn} enforcement OFF`)
  })
}

// Starter plan: the ERP commands are refused SB004 even in an active trial.
for (const cmd of GROUPS.erp.cmds) {
  qCase(`wiring ${cmd.fn} on Starter in trial: refused SB004 (feature not in plan)`, async () => {
    requireMigration()
    await setEnforcement(true)
    const a = await mkAgency(nx('q-st'), { plan: 'Starter', subStatus: 'trial' })
    const c = await fixtures(a)
    const res = cmd.service ? await callService(cmd.sql, cmd.args(c)) : await callAs(a.owner, cmd.sql, cmd.args(c))
    expectBlocked(res, 'SB004', `${cmd.fn} on Starter`)
  })
}

// ===========================================================================
// 4. Never-guarded commands keep working in every unpaid state (enforcement ON)
// ===========================================================================
for (const [fn, types] of NEVER) {
  for (const status of ['expired', 'cancelled', 'none']) {
    qCase(`never-guarded ${fn} in ${status} is not refused by the guard`, async () => {
      requireMigration()
      await setEnforcement(true)
      const a = await mkAgency(nx('q-nv'), { plan: status === 'none' ? null : 'Starter', subStatus: status })
      const sql = `SELECT public.${fn}(${types.map((t) => `NULL::${t}`).join(', ')}) AS r`
      const res = await callAs(a.owner, sql)
      expectNotSB(res, `${fn}/${status}`)
    })
  }
}

qCase('never-guarded reads: agency_subscription_entitlement works in expired (enforcement ON)', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-rd'), { plan: 'Starter', subStatus: 'expired' })
  const res = await callAs(a.owner, 'SELECT public.agency_subscription_entitlement() AS r')
  expectNotSB(res, 'entitlement/expired')
})

qCase('never-guarded reads: agency_subscription_invoices works in grace (enforcement ON)', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-rd2'), { plan: 'Starter', subStatus: 'grace' })
  const res = await callAs(a.owner, 'SELECT public.agency_subscription_invoices() AS r')
  expectNotSB(res, 'subscription_invoices/grace')
})

// ===========================================================================
// 5. Idempotent replay and happy paths with enforcement OFF / ON (no existing behaviour changed)
// ===========================================================================
qCase('happy path: agency_expense_record succeeds for an active Starter agency (enforcement ON)', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-hp1'), { plan: 'Starter', subStatus: 'active' })
  const c = await fixtures(a)
  const res = await callAs(a.owner, GROUPS.record_add.cmds[1].sql, GROUPS.record_add.cmds[1].args(c))
  expect(!res.raised, describe(res))
})

qCase('happy path: agency_driver_rate_set succeeds for an active Starter agency (enforcement ON)', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-hp2'), { plan: 'Starter', subStatus: 'active' })
  const c = await fixtures(a)
  const res = await callAs(a.owner, GROUPS.record_add.cmds[5].sql, GROUPS.record_add.cmds[5].args(c))
  expect(!res.raised, describe(res))
})

qCase('happy path: agency_payroll_open_period succeeds for an active Starter agency (enforcement ON)', async () => {
  requireMigration()
  await setEnforcement(true)
  const a = await mkAgency(nx('q-hp3'), { plan: 'Starter', subStatus: 'active' })
  const res = await callAs(a.owner, GROUPS.record_add.cmds[4].sql, GROUPS.record_add.cmds[4].args())
  expect(!res.raised, describe(res))
})

// ===========================================================================
// Main
// ===========================================================================
async function main() {
  await db.exec(BOOTSTRAP)
  const preFiles = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f < MIGRATION_FILE)
    .sort()
  await applyFiles(preFiles)

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations applied before ${MIGRATION_FILE}: ${preFiles.length} (last=${preFiles[preFiles.length - 1]})`)
  console.log(`migration ${MIGRATION_FILE}: ${MIGRATION_PRESENT ? 'present' : 'MISSING'}`)

  if (MIGRATION_PRESENT) {
    try {
      await applyFiles([MIGRATION_FILE])
      migrationApplied = true
    } catch (error) {
      migrationError = firstLine(error)
    }
  }

  console.log(`registered cases: ${CASES.length}`)
  for (const c of CASES) await runCase(c)

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  if (failed.length) {
    console.log('First failing cases:')
    for (const f of failed.slice(0, 10)) console.log(`  - ${f.name}`)
  }
  return passed === results.length && results.length >= 110
}

let ok = false
try {
  ok = await main()
} catch (error) {
  console.error('FAIL: harness error:', error && error.message ? error.message : error)
  ok = false
}
process.exit(ok ? 0 : 1)
