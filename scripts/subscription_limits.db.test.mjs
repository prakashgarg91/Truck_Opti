#!/usr/bin/env node
/**
 * Agency subscription LIMITS — TO-152 S2. Red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays every supabase/migrations file
 * BELOW 20261027000000 (agency_subscriptions included), then applies 20261027000000_subscription_limits.sql,
 * then applies 20261028000000_subscription_gst.sql ONLY to obtain public.platform_billing_settings (the
 * enforcement switch). Calls run per request the way PostgREST does: SET ROLE authenticated with
 * request.jwt.claims for the caller. Guard calls and fixture writes run as superuser.
 *
 * ORDER (pinned): 027 runs BEFORE 028. The guard therefore must not depend on platform_billing_settings at
 * creation time. Cases that run BEFORE 028 is applied prove the to_regclass path: with no settings table,
 * enforcement is OFF and the guard is a no-op. Cases that run AFTER 028 read enforcement_enabled once per call.
 *
 * The migration does NOT exist yet. Every case is gated and is EXPECTED to fail now with "red: migration ...
 * is missing". Cases pass only once the file exists and does what docs/TO-152-rulings.md section 2 requires.
 *
 * Pinned contract (rulings section 2, with the decisions below):
 *   public.agency_subscription_assert(p_agency_id uuid, p_action text, p_add integer) RETURNS void.
 *     Service-internal: SECURITY DEFINER, search_path set, no PUBLIC/anon/authenticated EXECUTE.
 *     Actions and resources: truck_add -> trucks; staff_add -> staff; driver_add -> drivers;
 *     order_import -> orders_month; dispatch -> dispatch.
 *   Enforcement read: IF to_regclass('public.platform_billing_settings') IS NULL THEN OFF; otherwise read
 *     enforcement_enabled from the single row. OFF means the guard returns without any check.
 *   Lock: pg_advisory_xact_lock(hashtextextended('sub:' || agency_id::text, 0)) is taken BEFORE any count.
 *   Errors: SQLSTATE SB001 SUBSCRIPTION_LIMIT_REACHED, SB002 SUBSCRIPTION_READ_ONLY,
 *     SB003 SUBSCRIPTION_DISPATCH_LOCKED. MESSAGE starts with the code. DETAIL is JSON with keys
 *     code, resource, limit, used, plan, status.
 *   Count rules: trucks = agency_trucks rows; staff = active agency_memberships + pending
 *     agency_invitations (owner seat uncounted); drivers = active agency_driver_employment rows; orders_month =
 *     agency_orders created in the current Asia/Kolkata month (any status); a refusal needs used + add > limit.
 *   Limits from the plan row: trucks_limit, users_limit (staff), drivers_limit (= 2 x trucks), shipments_monthly
 *     (orders). Enterprise -1 is unlimited.
 *
 * Decisions this battery pins beyond the rulings (the implementer must match these):
 *   - Status matrix: trial, active, past_due allow all write actions and dispatch. grace refuses *_add and
 *     order_import with SB002 but allows dispatch. expired and cancelled refuse *_add and order_import with
 *     SB002 and refuse dispatch with SB003. No subscription at all: every guarded action raises SB002
 *     (read-only), including dispatch.
 *   - DETAIL.plan is the plan tier in lowercase ('starter'), null with no subscription. DETAIL.status is the
 *     stored status ('none' with no subscription).
 *   - Trial uses the Starter plan row (the agency_subscription_start_trial path).
 *
 * Not covered here, and why:
 *   - Race: the advisory lock is asserted to be taken and to be held (pg_locks, inside a transaction). No
 *     concurrent writers are raced in PGlite.
 *   - Wiring of agency_member_accept, agency_driver_invitation_accept, agency_order_import, agency_load_plan_approve,
 *     agency_job_assign_driver, reserve_fleet_assignment and agency_driver_employment_create: static checks only
 *     (the guard call and its action literal exist in the function body, and it runs before the first write).
 *     Behavioural refusal is driven through agency_vehicle_create and agency_member_invite, plus the guard directly.
 *   - Trip status updates are not guarded (not in the rulings list). They are not tested here.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST and GoTrue behaviour is not covered.
 *
 * Usage:  node scripts/subscription_limits.db.test.mjs   (from the repo root)
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
const MIGRATION_FILE = '20261027000000_subscription_limits.sql'
const SETTINGS_FILE = '20261028000000_subscription_gst.sql'
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

/**
 * Per-case resilience: a failing assertion records FAIL and the battery keeps running, so a red-first
 * run reports EVERY unmet contract clause with its exact reason.
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

// ---------------------------------------------------------------------------
// Gating: every case is gated on the migration and on the settings migration that follows it.
// ---------------------------------------------------------------------------
let migrationApplied = false
let migrationError = ''
let settingsApplied = false
let settingsError = ''

function requireMigration() {
  if (!MIGRATION_PRESENT) {
    throw new Error(`red: migration ${MIGRATION_FILE} is missing, so the subscription limit guard does not exist yet`)
  }
  if (!migrationApplied) throw new Error(`red: migration ${MIGRATION_FILE} failed to apply: ${migrationError}`)
}

function requireSettings() {
  requireMigration()
  if (!settingsApplied) {
    throw new Error(`red: ${SETTINGS_FILE} (platform_billing_settings) did not apply: ${settingsError}`)
  }
}

/** Cases that run BEFORE 028 is applied (no settings table yet). */
const PRE = []
/** Cases that run AFTER 028 is applied (settings table present). */
const POST = []

function preCase(name, fn) {
  PRE.push({
    name,
    fn: async () => {
      requireMigration()
      await fn()
    },
  })
}

function postCase(name, fn) {
  POST.push({
    name,
    fn: async () => {
      requireSettings()
      await fn()
    },
  })
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
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

/** Runs fn as the authenticated role for `userId`, then returns to superuser. */
async function asActor(userId, fn) {
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await actAsService()
  }
}

/** Superuser statement (service-equivalent fixture write). Always resets the role first. */
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

/** Subscription row seeded by superuser, post-migration (agency-keyed). */
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

/**
 * Agency + owner + (optional) subscription. Defaults: approved agency, Starter plan, active subscription.
 * Pass {plan:null} for no subscription at all.
 */
async function mkAgency(tag, o = {}) {
  const { status = 'approved', plan = 'Starter', subStatus = 'active' } = o
  const owner = await createUser(tag)
  const agency = await createAgencyRow(owner, tag, status)
  let sub = null
  if (plan) sub = await insertSub({ agencyId: agency, userId: owner, plan, status: subStatus })
  return { owner, agency, sub }
}

/** Staff member with an active membership (superuser seed). */
async function seedStaff(agencyId, tag, scope, status = 'active') {
  const userId = await createUser(tag)
  await su(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [uid(), agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
}

async function addTrucks(agencyId, n) {
  if (n <= 0) return
  await su(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number)
     SELECT gen_random_uuid(), $1, 'eicher_14ft', 'S2-RC-' || $2 || '-' || g FROM generate_series(1, $3) g`,
    [agencyId, nx('t'), n]
  )
}

async function addActiveStaff(agencyId, n, scope = 'viewer') {
  for (let i = 0; i < n; i += 1) await seedStaff(agencyId, nx('s2-staff'), scope)
}

async function addInvites(agencyId, ownerId, n, status = 'pending') {
  for (let i = 0; i < n; i += 1) {
    const k = nx('s2-inv')
    await su(
      `INSERT INTO public.agency_invitations
         (agency_id, invited_email, scope, token_hash, status, expires_at, idempotency_key, created_by)
       VALUES ($1, $2, 'viewer', $3, $4, now() + interval '7 days', $5, $6)`,
      [agencyId, `${k}@example.com`, createHash('sha256').update(`th-${k}`).digest('hex'), status, `idem-${k}`, ownerId]
    )
  }
}

async function addDrivers(agencyId, n, { ended = 0 } = {}) {
  for (let i = 0; i < n + ended; i += 1) {
    const driverId = uid()
    const digits = String(100000000 + ++seq).slice(-9)
    await su(
      `INSERT INTO public.drivers (id, full_name, phone, vehicle_type, pan_number) VALUES ($1, $2, $3, 'eicher_14ft', $4)`,
      [driverId, `S2 Driver ${seq}`, `9${digits}`, `DRVWX${String(1000 + (seq % 9000)).padStart(4, '0')}F`]
    )
    await su(
      `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, $4)`,
      [uid(), agencyId, driverId, i < n ? 'active' : 'ended']
    )
  }
}

async function ensureAgreement(agencyId) {
  const row = await suOne(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES (gen_random_uuid(), $1, 'S2 Client', 'active', $2) RETURNING id`,
    [agencyId, nx('s2-agr')]
  )
  return row.id
}

/**
 * Orders for `agencyId` created at the SQL timestamp expression `tsSql` (trusted, internal literal).
 * Uses one shared agreement per call.
 */
async function addOrders(agencyId, n, tsSql = 'now()') {
  if (n <= 0) return
  const agreementId = await ensureAgreement(agencyId)
  await su(
    `INSERT INTO public.agency_orders (id, agency_id, agreement_id, client_order_ref, status, version, created_at)
     SELECT gen_random_uuid(), $1, $2, 'S2-' || $3 || '-' || g, 'draft', 1, ${tsSql}
       FROM generate_series(1, $4) g`,
    [agencyId, agreementId, nx('o'), n]
  )
}

/** IST month start as a timestamptz SQL expression, shifted by an interval (trusted literal). */
const IST_MONTH_START = `(date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')`

async function setEnforcement(on) {
  await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = $1`, [on])
}

async function enforcedAgency(tag, o = {}) {
  await setEnforcement(true)
  return mkAgency(tag, o)
}

// ---------------------------------------------------------------------------
// Call helpers
// ---------------------------------------------------------------------------
const TRIAL_SQL = 'SELECT public.agency_subscription_start_trial() AS r'
const VEH_SQL = 'SELECT public.agency_vehicle_create($1::text, $2::text) AS r'
const INV_SQL = 'SELECT public.agency_member_invite($1::text, $2::text, 7, $3::text) AS r'

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

/**
 * Calls the guard as superuser (service-internal). Returns {raised, code, message, detail}.
 * detail is the parsed DETAIL JSON or null.
 */
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

function expectAllowed(res, label) {
  expect(!res.raised, `${label}: expected allowed, got ${describe(res)}`)
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

function describeValue(res) {
  return res.raised ? `raised ${res.code} ${res.message}` : JSON.stringify(res.value)
}

async function countTrucks(agencyId) {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1`, [agencyId])).n)
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
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_exec,
              pg_get_function_identity_arguments(p.oid) AS args,
              pg_get_function_result(p.oid) AS result
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1`,
      [name]
    )
  ).rows[0]
  expect(row, `function public.${name} is missing`)
  return row
}

const GUARD = 'agency_subscription_assert'

// ===========================================================================
// PRE-028 CASES (migration 027 applied, platform_billing_settings NOT yet created)
// ===========================================================================

preCase('B01. migration 20261027000000_subscription_limits.sql is present and applies after the 026 chain', async () => {
  expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing`)
  expect(migrationApplied, `migration ${MIGRATION_FILE} failed to apply: ${migrationError}`)
})

preCase('B02. guard public.agency_subscription_assert(p_agency_id uuid, p_action text, p_add integer) returns void', async () => {
  const row = await fnPrivs(GUARD)
  expect(row.args === 'p_agency_id uuid, p_action text, p_add integer', `arguments are "${row.args}"`)
  expect(row.result === 'void', `returns "${row.result}", expected void`)
})

preCase('B03. guard is SECURITY DEFINER with search_path pinned', async () => {
  const row = await fnPrivs(GUARD)
  expect(row.prosecdef === true, 'guard is not SECURITY DEFINER')
  expect(
    Array.isArray(row.proconfig) && row.proconfig.some((c) => /^search_path=/.test(c)),
    `search_path not pinned (proconfig=${JSON.stringify(row.proconfig)})`
  )
})

preCase('B04. guard has no PUBLIC, anon or authenticated EXECUTE', async () => {
  const row = await fnPrivs(GUARD)
  expect(row.public_exec === false, 'PUBLIC has EXECUTE')
  expect(row.anon_exec === false, 'anon has EXECUTE')
  expect(row.auth_exec === false, 'authenticated has EXECUTE')
})

preCase('B05. an authenticated caller invoking the guard directly is refused with 42501', async () => {
  const { owner, agency } = await mkAgency('s2-direct')
  const res = await callAs(owner, 'SELECT public.agency_subscription_assert($1::uuid, $2::text, $3::int) AS r', [
    agency,
    'truck_add',
    1,
  ])
  expect(res.raised && res.code === '42501', `expected permission denied 42501, got ${describeValue(res)}`)
})

preCase('B06. guard takes the per-agency advisory lock BEFORE it counts anything', async () => {
  const body = await fnDefs(GUARD)
  const iLock = body.search(/pg_advisory_xact_lock\s*\(/i)
  const iCount = body.search(/\bcount\s*\(/i)
  expect(iLock >= 0, 'guard body has no pg_advisory_xact_lock call')
  expect(iCount > iLock, `count(...) at ${iCount} is not after the lock at ${iLock}`)
})

preCase("B07. guard's lock key is hashtextextended('sub:' || agency_id::text, 0)", async () => {
  const body = await fnDefs(GUARD)
  expect(
    /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'sub:'\s*\|\|/i.test(body),
    "guard does not lock on hashtextextended('sub:' || agency_id::text, 0)"
  )
})

preCase('B08. guard reads enforcement through a to_regclass check on platform_billing_settings', async () => {
  const body = await fnDefs(GUARD)
  expect(/to_regclass\s*\(\s*'public\.platform_billing_settings'\s*\)/i.test(body), 'no to_regclass guard on the settings table')
  expect(/enforcement_enabled/i.test(body), 'guard never reads enforcement_enabled')
})

preCase('B09. guard raises SB001, SB002 and SB003 by name', async () => {
  const body = await fnDefs(GUARD)
  for (const code of ['SB001', 'SB002', 'SB003']) {
    expect(body.includes(`'${code}'`), `guard body never raises ${code}`)
  }
})

const WIRES = [
  ['agency_vehicle_create', 'truck_add'],
  ['agency_member_invite', 'staff_add'],
  ['agency_member_accept', 'staff_add'],
  ['agency_driver_employment_create', 'driver_add'],
  ['agency_driver_invitation_accept', 'driver_add'],
  ['agency_order_import', 'order_import'],
  ['agency_load_plan_approve', 'dispatch'],
  ['agency_job_assign_driver', 'dispatch'],
  ['reserve_fleet_assignment', 'dispatch'],
]

WIRES.forEach(([fn, action], i) => {
  preCase(`B${String(10 + i).padStart(2, '0')}. ${fn} calls the guard with action '${action}'`, async () => {
    const body = await fnDefs(fn)
    expect(/agency_subscription_assert\s*\(/i.test(body), `${fn} does not call agency_subscription_assert`)
    expect(body.includes(`'${action}'`), `${fn} calls the guard but never with '${action}'`)
  })
})

WIRES.forEach(([fn], i) => {
  preCase(`B${String(19 + i).padStart(2, '0')}. ${fn} runs the guard before its first write`, async () => {
    const body = await fnDefs(fn)
    const iGuard = body.search(/agency_subscription_assert\s*\(/i)
    const iWrite = body.search(/INSERT\s+INTO|UPDATE\s+public\./i)
    expect(iGuard >= 0, `${fn} has no guard call`)
    expect(iWrite < 0 || iGuard < iWrite, `${fn}: guard at ${iGuard} comes after the first write at ${iWrite}`)
  })
})

preCase('B28. with NO platform_billing_settings table yet, the guard is a no-op at the truck limit (enforcement OFF)', async () => {
  const { agency } = await mkAgency('s2-pre-trucks')
  await addTrucks(agency, 3)
  const res = await guard(agency, 'truck_add', 1)
  expectAllowed(res, 'truck_add at 3/3 with no settings table')
})

preCase('B29. with NO settings table, an expired agency is not refused by the guard (enforcement OFF)', async () => {
  const { agency } = await mkAgency('s2-pre-expired', { subStatus: 'expired' })
  expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add on expired, no settings table')
  expectAllowed(await guard(agency, 'dispatch', 1), 'dispatch on expired, no settings table')
})

preCase('B30. with NO settings table, an agency with no subscription is not refused (enforcement OFF)', async () => {
  const { agency } = await mkAgency('s2-pre-none', { plan: null })
  expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add with no subscription, no settings table')
})

preCase('B31. with NO settings table, an order import over the monthly limit is not refused (enforcement OFF)', async () => {
  const { agency } = await mkAgency('s2-pre-orders')
  expectAllowed(await guard(agency, 'order_import', 51), 'order_import of 51 on a 50 limit, no settings table')
})

preCase('B32. agency_vehicle_create at 3 of 3 trucks still succeeds before 028 (existing command unchanged)', async () => {
  const { agency } = await mkAgency('s2-pre-veh')
  await addTrucks(agency, 3)
  const fleet = await seedStaff(agency, nx('s2-fleet'), 'fleet_manager')
  const res = await callAs(fleet, VEH_SQL, [nx('S2-RC-NEW'), 'eicher_14ft'])
  expect(!res.raised && res.value && res.value.ok === true, `expected {ok:true}, got ${describeValue(res)}`)
})

// ===========================================================================
// POST-028 CASES (settings table present; enforcement set explicitly per case)
// ===========================================================================

postCase('B33. platform_billing_settings.enforcement_enabled defaults to false on the single row', async () => {
  const rows = (await su(`SELECT enforcement_enabled FROM public.platform_billing_settings`)).rows
  expect(rows.length === 1, `expected exactly one settings row, got ${rows.length}`)
  expect(rows[0].enforcement_enabled === false, `default is ${rows[0].enforcement_enabled}, expected false`)
})

postCase('B34. enforcement OFF: guard does not refuse at the truck limit', async () => {
  await setEnforcement(false)
  const { agency } = await mkAgency('s2-off-trucks')
  await addTrucks(agency, 3)
  expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add at 3/3, enforcement OFF')
})

postCase('B35. enforcement OFF: guard does not refuse an expired agency for dispatch', async () => {
  await setEnforcement(false)
  const { agency } = await mkAgency('s2-off-exp', { subStatus: 'expired' })
  expectAllowed(await guard(agency, 'dispatch', 1), 'dispatch on expired, enforcement OFF')
})

postCase('B36. enforcement OFF: guard does not refuse an agency with no subscription', async () => {
  await setEnforcement(false)
  const { agency } = await mkAgency('s2-off-none', { plan: null })
  expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add with no subscription, enforcement OFF')
})

postCase('B37. enforcement OFF: guard does not refuse a grace agency for a staff add', async () => {
  await setEnforcement(false)
  const { agency } = await mkAgency('s2-off-grace', { subStatus: 'grace' })
  expectAllowed(await guard(agency, 'staff_add', 1), 'staff_add on grace, enforcement OFF')
})

postCase('B38. enforcement OFF: agency_vehicle_create at 3 of 3 trucks succeeds (existing behaviour)', async () => {
  await setEnforcement(false)
  const { agency } = await mkAgency('s2-off-veh')
  await addTrucks(agency, 3)
  const fleet = await seedStaff(agency, nx('s2-fleet'), 'fleet_manager')
  const res = await callAs(fleet, VEH_SQL, [nx('S2-RC-OFF'), 'eicher_14ft'])
  expect(!res.raised && res.value && res.value.ok === true, `expected {ok:true}, got ${describeValue(res)}`)
})

postCase('B39. enforcement OFF: agency_member_invite over the staff limit succeeds (existing behaviour)', async () => {
  await setEnforcement(false)
  const { owner, agency } = await mkAgency('s2-off-inv')
  await addActiveStaff(agency, 1)
  await addInvites(agency, owner, 1)
  const res = await callAs(owner, INV_SQL, [`${nx('s2-off-new')}@example.com`, 'viewer', nx('idem')])
  expect(!res.raised && res.value && res.value.ok === true, `expected {ok:true}, got ${describeValue(res)}`)
})

postCase('B40. enforcement OFF: agency_vehicle_create in an expired agency succeeds (existing behaviour)', async () => {
  await setEnforcement(false)
  const { agency } = await mkAgency('s2-off-expveh', { subStatus: 'expired' })
  const fleet = await seedStaff(agency, nx('s2-fleet'), 'fleet_manager')
  const res = await callAs(fleet, VEH_SQL, [nx('S2-RC-EXP'), 'eicher_14ft'])
  expect(!res.raised && res.value && res.value.ok === true, `expected {ok:true}, got ${describeValue(res)}`)
})

postCase('B41. authenticated cannot UPDATE platform_billing_settings directly (42501)', async () => {
  const { owner } = await mkAgency('s2-direct-upd')
  const res = await asActor(owner, async () => {
    try {
      await db.query('UPDATE public.platform_billing_settings SET enforcement_enabled = true')
      return { raised: false }
    } catch (error) {
      return { raised: true, code: error.code || null }
    }
  })
  expect(res.raised && res.code === '42501', `expected 42501 permission denied, got ${JSON.stringify(res)}`)
})

postCase('B42. superuser UPDATE of the single settings row switches enforcement ON and reads back true', async () => {
  await setEnforcement(false)
  await setEnforcement(true)
  const v = (await suOne(`SELECT enforcement_enabled FROM public.platform_billing_settings`)).enforcement_enabled
  expect(v === true, `read back ${v}, expected true`)
})

postCase('B43. superuser UPDATE switches enforcement back OFF and the guard stops refusing (reversible rollback)', async () => {
  const { agency } = await enforcedAgency('s2-toggle-off')
  await addTrucks(agency, 3)
  expectBlocked(await guard(agency, 'truck_add', 1), 'SB001', 'truck_add at 3/3 with enforcement ON')
  await setEnforcement(false)
  expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add at 3/3 after switching OFF')
})

// --- trucks (Starter: 3) ---------------------------------------------------

postCase('B44. trucks: 2 of 3 used, one more is allowed (exactly the limit)', async () => {
  const { agency } = await enforcedAgency('s2-tr-2')
  await addTrucks(agency, 2)
  expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add 2 -> 3')
})

postCase('B45. trucks: 3 of 3 used, one more is refused with SB001 (limit + 1)', async () => {
  const { agency } = await enforcedAgency('s2-tr-3')
  await addTrucks(agency, 3)
  expectBlocked(await guard(agency, 'truck_add', 1), 'SB001', 'truck_add 3 -> 4')
})

postCase('B46. trucks: 0 used, adding 3 at once is allowed (exactly the limit in one step)', async () => {
  const { agency } = await enforcedAgency('s2-tr-bulk3')
  expectAllowed(await guard(agency, 'truck_add', 3), 'truck_add 0 + 3')
})

postCase('B47. trucks: 0 used, adding 4 at once is refused with SB001', async () => {
  const { agency } = await enforcedAgency('s2-tr-bulk4')
  expectBlocked(await guard(agency, 'truck_add', 4), 'SB001', 'truck_add 0 + 4')
})

postCase('B48. SB001 DETAIL is {code,resource,limit,used,plan,status} = SB001, trucks, 3, 3, starter, active', async () => {
  const { agency } = await enforcedAgency('s2-detail-sb001')
  await addTrucks(agency, 3)
  const res = await guard(agency, 'truck_add', 1)
  expectBlocked(res, 'SB001', 'truck_add 3 -> 4')
  expectDetail(res, { code: 'SB001', resource: 'trucks', limit: 3, used: 3, plan: 'starter', status: 'active' }, 'SB001')
})

postCase('B49. SB001 SQLSTATE is SB001 and the MESSAGE starts with SB001', async () => {
  const { agency } = await enforcedAgency('s2-sqlstate')
  await addTrucks(agency, 3)
  const res = await guard(agency, 'truck_add', 1)
  expect(res.raised && res.code === 'SB001', `SQLSTATE is ${res.code}`)
  expect(res.message.startsWith('SB001'), `MESSAGE is "${res.message}"`)
})

postCase('B50. trial on Starter: 3 of 3 trucks, one more is refused with SB001 (trial uses Starter limits)', async () => {
  const { agency } = await enforcedAgency('s2-trial-lim', { subStatus: 'trial' })
  await addTrucks(agency, 3)
  const res = await guard(agency, 'truck_add', 1)
  expectBlocked(res, 'SB001', 'trial truck_add 3 -> 4')
  expectDetail(res, { code: 'SB001', resource: 'trucks', limit: 3, used: 3, plan: 'starter', status: 'trial' }, 'trial SB001')
})

postCase('B51. agency_subscription_start_trial creates a Starter trial that refuses the 4th truck', async () => {
  await setEnforcement(true)
  const owner = await createUser('s2-trial-start')
  const agency = await createAgencyRow(owner, 's2-trial-start', 'approved')
  const started = await callAs(owner, TRIAL_SQL)
  expect(!started.raised && started.value && started.value.ok === true, `start_trial: ${describeValue(started)}`)
  await addTrucks(agency, 3)
  expectBlocked(await guard(agency, 'truck_add', 1), 'SB001', 'trial from start_trial, 3 -> 4')
})

postCase('B52. past_due: 2 of 3 trucks, one more is allowed (past_due still writes)', async () => {
  const { agency } = await enforcedAgency('s2-pd-2', { subStatus: 'past_due' })
  await addTrucks(agency, 2)
  expectAllowed(await guard(agency, 'truck_add', 1), 'past_due truck_add 2 -> 3')
})

postCase('B53. past_due: 3 of 3 trucks, one more is refused with SB001 (the limit still applies)', async () => {
  const { agency } = await enforcedAgency('s2-pd-3', { subStatus: 'past_due' })
  await addTrucks(agency, 3)
  expectBlocked(await guard(agency, 'truck_add', 1), 'SB001', 'past_due truck_add 3 -> 4')
})

postCase('B54. agency_vehicle_create at 2 of 3 trucks succeeds with enforcement ON', async () => {
  const { agency } = await enforcedAgency('s2-veh-ok')
  await addTrucks(agency, 2)
  const fleet = await seedStaff(agency, nx('s2-fleet'), 'fleet_manager')
  const res = await callAs(fleet, VEH_SQL, [nx('S2-RC-OK'), 'eicher_14ft'])
  expect(!res.raised && res.value && res.value.ok === true, `expected {ok:true}, got ${describeValue(res)}`)
})

postCase('B55. agency_vehicle_create at 3 of 3 trucks is refused with SB001', async () => {
  const { agency } = await enforcedAgency('s2-veh-full')
  await addTrucks(agency, 3)
  const fleet = await seedStaff(agency, nx('s2-fleet'), 'fleet_manager')
  const res = await callAs(fleet, VEH_SQL, [nx('S2-RC-FULL'), 'eicher_14ft'])
  expectBlocked(res, 'SB001', 'agency_vehicle_create at 3/3')
})

postCase('B56. agency_vehicle_create in grace is refused with SB002 (read-only)', async () => {
  const { agency } = await enforcedAgency('s2-veh-grace', { subStatus: 'grace' })
  const fleet = await seedStaff(agency, nx('s2-fleet'), 'fleet_manager')
  const res = await callAs(fleet, VEH_SQL, [nx('S2-RC-GR'), 'eicher_14ft'])
  expectBlocked(res, 'SB002', 'agency_vehicle_create on grace')
})

postCase('B57. a refused vehicle create at the limit writes nothing (truck count stays at 3)', async () => {
  const { agency } = await enforcedAgency('s2-veh-nowrite')
  await addTrucks(agency, 3)
  const fleet = await seedStaff(agency, nx('s2-fleet'), 'fleet_manager')
  await callAs(fleet, VEH_SQL, [nx('S2-RC-NW'), 'eicher_14ft'])
  expect((await countTrucks(agency)) === 3, `truck count changed to ${await countTrucks(agency)}`)
})

// --- staff (Starter: users_limit 2; owner uncounted; active + pending count) ----

postCase('B58. staff: owner seat is not counted, so 0 staff plus 2 more is allowed', async () => {
  const { agency } = await enforcedAgency('s2-st-owner')
  expectAllowed(await guard(agency, 'staff_add', 2), 'staff_add 0 + 2')
})

postCase('B59. staff: 1 active + 1 pending is 2 of 2, one more is refused with SB001', async () => {
  const { owner, agency } = await enforcedAgency('s2-st-pend')
  await addActiveStaff(agency, 1)
  await addInvites(agency, owner, 1)
  const res = await guard(agency, 'staff_add', 1)
  expectBlocked(res, 'SB001', 'staff_add 1 active + 1 pending -> 3')
  expectDetail(res, { code: 'SB001', resource: 'staff', limit: 2, used: 2, plan: 'starter', status: 'active' }, 'staff SB001')
})

postCase('B60. staff: 1 active and nothing pending leaves room for one more', async () => {
  const { agency } = await enforcedAgency('s2-st-1')
  await addActiveStaff(agency, 1)
  expectAllowed(await guard(agency, 'staff_add', 1), 'staff_add 1 active -> 2')
})

postCase('B61. staff: a revoked membership is not counted', async () => {
  const { agency } = await enforcedAgency('s2-st-revoked')
  await seedStaff(agency, nx('s2-rev'), 'viewer', 'revoked')
  await addActiveStaff(agency, 1)
  expectAllowed(await guard(agency, 'staff_add', 1), 'staff_add 1 active + 1 revoked -> 2')
})

postCase('B62. staff: an expired invitation is not counted (only pending counts)', async () => {
  const { owner, agency } = await enforcedAgency('s2-st-expinv')
  await addActiveStaff(agency, 1)
  await addInvites(agency, owner, 1, 'expired')
  expectAllowed(await guard(agency, 'staff_add', 1), 'staff_add 1 active + 1 expired invite -> 2')
})

postCase('B63. staff: 2 active of 2 is refused with SB001 for a third', async () => {
  const { agency } = await enforcedAgency('s2-st-full')
  await addActiveStaff(agency, 2)
  expectBlocked(await guard(agency, 'staff_add', 1), 'SB001', 'staff_add 2 -> 3')
})

postCase('B64. agency_member_invite at 1 active + 1 pending is refused with SB001', async () => {
  const { owner, agency } = await enforcedAgency('s2-inv-full')
  await addActiveStaff(agency, 1)
  await addInvites(agency, owner, 1)
  const res = await callAs(owner, INV_SQL, [`${nx('s2-inv-new')}@example.com`, 'viewer', nx('idem')])
  expectBlocked(res, 'SB001', 'agency_member_invite at 2 of 2')
})

postCase('B65. agency_member_invite at 1 active (under the limit) succeeds with enforcement ON', async () => {
  const { owner, agency } = await enforcedAgency('s2-inv-ok')
  await addActiveStaff(agency, 1)
  const res = await callAs(owner, INV_SQL, [`${nx('s2-inv-ok-new')}@example.com`, 'viewer', nx('idem')])
  expect(!res.raised && res.value && res.value.ok === true, `expected {ok:true}, got ${describeValue(res)}`)
})

// --- drivers (2 x trucks = 6) -----------------------------------------------

postCase('B66. Starter drivers_limit equals 2 x trucks_limit (6 = 2 x 3)', async () => {
  const row = await suOne(`SELECT drivers_limit, trucks_limit FROM public.subscription_plans WHERE name = 'Starter'`)
  expect(row.trucks_limit === 3, `trucks_limit is ${row.trucks_limit}`)
  expect(row.drivers_limit === 6, `drivers_limit is ${row.drivers_limit}, expected 6`)
})

postCase('B67. drivers: 5 active of 6, one more is allowed', async () => {
  const { agency } = await enforcedAgency('s2-dr-5')
  await addDrivers(agency, 5)
  expectAllowed(await guard(agency, 'driver_add', 1), 'driver_add 5 -> 6')
})

postCase('B68. drivers: 6 active of 6, one more is refused with SB001 resource drivers', async () => {
  const { agency } = await enforcedAgency('s2-dr-6')
  await addDrivers(agency, 6)
  const res = await guard(agency, 'driver_add', 1)
  expectBlocked(res, 'SB001', 'driver_add 6 -> 7')
  expectDetail(res, { code: 'SB001', resource: 'drivers', limit: 6, used: 6, plan: 'starter', status: 'active' }, 'drivers SB001')
})

postCase('B69. drivers: an ended employment is not counted (5 active + 1 ended allows one more)', async () => {
  const { agency } = await enforcedAgency('s2-dr-ended')
  await addDrivers(agency, 5, { ended: 1 })
  expectAllowed(await guard(agency, 'driver_add', 1), 'driver_add 5 active + 1 ended -> 6')
})

postCase('B70. drivers quota is not tied to live trucks: 0 trucks with 6 drivers still refuses a seventh', async () => {
  const { agency } = await enforcedAgency('s2-dr-notrucks')
  await addDrivers(agency, 6)
  expectBlocked(await guard(agency, 'driver_add', 1), 'SB001', 'driver_add 6 with 0 trucks -> 7')
})

// --- orders per Asia/Kolkata month (Starter: 50) -----------------------------

postCase('B71. orders: 0 this month, importing 50 is allowed (exactly the limit)', async () => {
  const { agency } = await enforcedAgency('s2-or-50')
  expectAllowed(await guard(agency, 'order_import', 50), 'order_import 0 + 50')
})

postCase('B72. orders: 0 this month, importing 51 is refused with SB001 resource orders_month', async () => {
  const { agency } = await enforcedAgency('s2-or-51')
  const res = await guard(agency, 'order_import', 51)
  expectBlocked(res, 'SB001', 'order_import 0 + 51')
  expectDetail(res, { code: 'SB001', resource: 'orders_month', limit: 50, used: 0, plan: 'starter', status: 'active' }, 'orders SB001')
})

postCase('B73. orders: two imports in the same month share the count (30 imported, then 20 allowed, then 1 refused)', async () => {
  const { agency } = await enforcedAgency('s2-or-two')
  await addOrders(agency, 30)
  expectAllowed(await guard(agency, 'order_import', 20), 'second import 30 + 20')
  await addOrders(agency, 20)
  const res = await guard(agency, 'order_import', 1)
  expectBlocked(res, 'SB001', 'third import 50 + 1')
  expectDetail(res, { code: 'SB001', resource: 'orders_month', limit: 50, used: 50, plan: 'starter', status: 'active' }, 'orders two imports')
})

postCase('B74. orders: last month is not counted (60 orders created two months ago leave room for 50)', async () => {
  const { agency } = await enforcedAgency('s2-or-old')
  await addOrders(agency, 60, `now() - interval '2 months'`)
  expectAllowed(await guard(agency, 'order_import', 50), 'order_import 50 with 60 orders two months ago')
})

postCase('B75. IST boundary: 50 orders created 1 minute before the Asia/Kolkata month start do not count', async () => {
  const { agency } = await enforcedAgency('s2-or-ist-before')
  await addOrders(agency, 50, `${IST_MONTH_START} - interval '1 minute'`)
  expectAllowed(await guard(agency, 'order_import', 50), 'order_import 50 with 50 orders 1 min before IST month start')
})

postCase('B76. IST boundary: 50 orders created 1 minute after the Asia/Kolkata month start do count', async () => {
  const { agency } = await enforcedAgency('s2-or-ist-after')
  await addOrders(agency, 50, `${IST_MONTH_START} + interval '1 minute'`)
  const res = await guard(agency, 'order_import', 1)
  expectBlocked(res, 'SB001', 'order_import 1 with 50 orders 1 min after IST month start')
})

// --- status matrix ----------------------------------------------------------

async function matrix(agency, label, expectations) {
  const checks = []
  for (const [action, expected] of expectations) {
    checks.push([
      `${label} ${action}`,
      async () => {
        const res = await guard(agency, action, 1)
        if (expected === 'allowed') expectAllowed(res, `${label} ${action}`)
        else expectBlocked(res, expected, `${label} ${action}`)
      },
    ])
  }
  await gather(checks)
}

const WRITES_AND_DISPATCH = [
  ['truck_add', 'allowed'],
  ['staff_add', 'allowed'],
  ['driver_add', 'allowed'],
  ['order_import', 'allowed'],
  ['dispatch', 'allowed'],
]

postCase('B77. status active: every write action and dispatch are allowed under the limits', async () => {
  const { agency } = await enforcedAgency('s2-m-active')
  await matrix(agency, 'active', WRITES_AND_DISPATCH)
})

postCase('B78. status past_due: every write action and dispatch are allowed under the limits', async () => {
  const { agency } = await enforcedAgency('s2-m-pd', { subStatus: 'past_due' })
  await matrix(agency, 'past_due', WRITES_AND_DISPATCH)
})

postCase('B79. status trial: every write action and dispatch are allowed under the limits', async () => {
  const { agency } = await enforcedAgency('s2-m-trial', { subStatus: 'trial' })
  await matrix(agency, 'trial', WRITES_AND_DISPATCH)
})

postCase('B80. grace: truck_add, staff_add, driver_add and order_import are refused with SB002', async () => {
  const { agency } = await enforcedAgency('s2-m-grace', { subStatus: 'grace' })
  await matrix(agency, 'grace', [
    ['truck_add', 'SB002'],
    ['staff_add', 'SB002'],
    ['driver_add', 'SB002'],
    ['order_import', 'SB002'],
  ])
})

postCase('B81. grace: dispatch is still allowed', async () => {
  const { agency } = await enforcedAgency('s2-m-grace-d', { subStatus: 'grace' })
  await matrix(agency, 'grace', [['dispatch', 'allowed']])
})

postCase('B82. grace SB002 DETAIL carries code SB002, resource trucks and status grace', async () => {
  const { agency } = await enforcedAgency('s2-m-grace-detail', { subStatus: 'grace' })
  const res = await guard(agency, 'truck_add', 1)
  expectBlocked(res, 'SB002', 'grace truck_add')
  expectDetail(res, { code: 'SB002', resource: 'trucks', plan: 'starter', status: 'grace' }, 'grace SB002')
})

postCase('B83. expired: truck_add, staff_add, driver_add and order_import are refused with SB002', async () => {
  const { agency } = await enforcedAgency('s2-m-exp', { subStatus: 'expired' })
  await matrix(agency, 'expired', [
    ['truck_add', 'SB002'],
    ['staff_add', 'SB002'],
    ['driver_add', 'SB002'],
    ['order_import', 'SB002'],
  ])
})

postCase('B84. expired: dispatch is refused with SB003 (DISPATCH_LOCKED)', async () => {
  const { agency } = await enforcedAgency('s2-m-exp-d', { subStatus: 'expired' })
  await matrix(agency, 'expired', [['dispatch', 'SB003']])
})

postCase('B85. expired SB003 DETAIL carries code SB003, resource dispatch and status expired', async () => {
  const { agency } = await enforcedAgency('s2-m-exp-detail', { subStatus: 'expired' })
  const res = await guard(agency, 'dispatch', 1)
  expectBlocked(res, 'SB003', 'expired dispatch')
  expectDetail(res, { code: 'SB003', resource: 'dispatch', status: 'expired' }, 'expired SB003')
})

postCase('B86. cancelled: truck_add is refused with SB002 and dispatch with SB003', async () => {
  const { agency } = await enforcedAgency('s2-m-canc', { subStatus: 'cancelled' })
  await matrix(agency, 'cancelled', [
    ['truck_add', 'SB002'],
    ['dispatch', 'SB003'],
  ])
})

postCase('B87. no subscription at all: truck_add is refused with SB002, status none, plan null', async () => {
  const { agency } = await enforcedAgency('s2-m-none', { plan: null })
  const res = await guard(agency, 'truck_add', 1)
  expectBlocked(res, 'SB002', 'no-subscription truck_add')
  expectDetail(res, { code: 'SB002', resource: 'trucks', plan: null, status: 'none' }, 'no-subscription SB002')
})

postCase('B88. no subscription at all: dispatch is refused with SB002 (read-only), not SB003', async () => {
  const { agency } = await enforcedAgency('s2-m-none-d', { plan: null })
  await matrix(agency, 'no-sub', [['dispatch', 'SB002']])
})

postCase('B89. no subscription at all: staff_add and order_import are refused with SB002', async () => {
  const { agency } = await enforcedAgency('s2-m-none-w', { plan: null })
  await matrix(agency, 'no-sub', [
    ['staff_add', 'SB002'],
    ['order_import', 'SB002'],
  ])
})

// --- isolation between agencies ---------------------------------------------

postCase('B90. another agency at its truck limit does not block this agency', async () => {
  await setEnforcement(true)
  const x = await mkAgency('s2-iso-x')
  await addTrucks(x.agency, 3)
  const y = await mkAgency('s2-iso-y')
  expectBlocked(await guard(x.agency, 'truck_add', 1), 'SB001', 'agency X at 3/3')
  expectAllowed(await guard(y.agency, 'truck_add', 1), 'agency Y unaffected by X')
})

postCase('B91. another agency in grace or expired does not block dispatch for this agency', async () => {
  await setEnforcement(true)
  const x = await mkAgency('s2-iso-dx')
  await mkAgency('s2-iso-dy', { subStatus: 'expired' })
  expectAllowed(await guard(x.agency, 'dispatch', 1), 'agency X dispatch while agency Y is expired')
})

postCase("B92. trucks are counted per agency (agency Y's 3 trucks do not count against agency X)", async () => {
  await setEnforcement(true)
  const x = await mkAgency('s2-iso-cx')
  const y = await mkAgency('s2-iso-cy')
  await addTrucks(y.agency, 3)
  expectAllowed(await guard(x.agency, 'truck_add', 3), 'agency X 0 + 3 with agency Y at 3')
})

// --- lock -------------------------------------------------------------------

async function lockHeld(agencyId) {
  const row = await suOne(
    `SELECT count(*)::int AS n FROM pg_locks l
      WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted AND l.objsubid = 1
        AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended('sub:' || $1::text, 0)`,
    [agencyId]
  )
  return row.n
}

postCase('B93. the guard holds the per-agency advisory lock after a successful call (checked in a transaction)', async () => {
  const { agency } = await enforcedAgency('s2-lock-held')
  await actAsService()
  await db.exec('BEGIN')
  try {
    expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add 0 -> 1 inside a transaction')
    expect((await lockHeld(agency)) >= 1, `no advisory lock held for key sub:${agency}`)
  } finally {
    await db.exec('ROLLBACK')
  }
})

postCase("B94. the guard's lock is keyed to this agency only (another agency's key is not held)", async () => {
  const { agency } = await enforcedAgency('s2-lock-own')
  const other = await mkAgency('s2-lock-other')
  await actAsService()
  await db.exec('BEGIN')
  try {
    expectAllowed(await guard(agency, 'truck_add', 1), 'truck_add inside a transaction')
    expect((await lockHeld(other.agency)) === 0, 'another agency key is held by this guard call')
  } finally {
    await db.exec('ROLLBACK')
  }
})

// --- enforcement toggle semantics -------------------------------------------

postCase('B95. turning enforcement OFF at the limit lets the same agency through immediately', async () => {
  const { agency } = await enforcedAgency('s2-tog-off')
  await addTrucks(agency, 3)
  expectBlocked(await guard(agency, 'truck_add', 1), 'SB001', 'ON at 3/3')
  await setEnforcement(false)
  expectAllowed(await guard(agency, 'truck_add', 1), 'OFF at 3/3')
})

postCase('B96. turning enforcement back ON re-applies the limit to the same agency', async () => {
  const { agency } = await enforcedAgency('s2-tog-on')
  await addTrucks(agency, 3)
  await setEnforcement(false)
  expectAllowed(await guard(agency, 'truck_add', 1), 'OFF at 3/3')
  await setEnforcement(true)
  expectBlocked(await guard(agency, 'truck_add', 1), 'SB001', 'ON again at 3/3')
})

// --- unlimited plan ---------------------------------------------------------

postCase('B97. Enterprise is unlimited: 1000 trucks and 1000 staff are allowed (-1 sentinel)', async () => {
  const { agency } = await enforcedAgency('s2-ent', { plan: 'Enterprise' })
  expectAllowed(await guard(agency, 'truck_add', 1000), 'Enterprise truck_add 1000')
  expectAllowed(await guard(agency, 'staff_add', 1000), 'Enterprise staff_add 1000')
})

postCase('B98. every SB002 refusal carries a parseable DETAIL JSON', async () => {
  const { agency } = await enforcedAgency('s2-detail-all', { subStatus: 'grace' })
  const res = await guard(agency, 'truck_add', 1)
  expectBlocked(res, 'SB002', 'grace truck_add')
  expect(res.detail && typeof res.detail === 'object', `DETAIL not parseable: ${JSON.stringify(res.detail)}`)
})

postCase('B99. authenticated direct INSERT into the settings table is refused, so enforcement cannot be flipped by a client', async () => {
  const { owner } = await mkAgency('s2-direct-ins')
  const res = await asActor(owner, async () => {
    try {
      await db.query(
        `INSERT INTO public.platform_billing_settings (sac_code, enforcement_enabled) VALUES ('997331', true)`
      )
      return { raised: false }
    } catch (error) {
      return { raised: true, code: error.code || null }
    }
  })
  expect(res.raised, 'authenticated INSERT into platform_billing_settings succeeded')
})

// ---------------------------------------------------------------------------
// Appended review cases (B100+).
// LAUNCH NOTE (documentation only): an agency with NO subscription row is read-only and dispatch-locked (SB002)
// once enforcement is ON (see the status matrix above). Every agency must start a trial or buy a plan BEFORE
// enforcement_enabled is switched on.
// ---------------------------------------------------------------------------

postCase('B100. lock order: the sub-lock helper precedes the first FOR UPDATE in the three lock-taking commands', async () => {
  const helper = await fnDefs('agency_subscription_lock')
  expect(/pg_advisory_xact_lock\(hashtextextended\('sub:'/.test(helper), 'helper does not take the sub: advisory lock')
  const clientCan = (
    await suOne(
      `SELECT has_function_privilege('authenticated', 'public.agency_subscription_lock(uuid)', 'EXECUTE') AS a,
              has_function_privilege('anon', 'public.agency_subscription_lock(uuid)', 'EXECUTE') AS b`
    )
  )
  expect(!clientCan.a && !clientCan.b, 'agency_subscription_lock is executable by a client role')
  for (const fn of ['agency_job_assign_driver', 'agency_member_accept', 'agency_driver_invitation_accept']) {
    const def = await fnDefs(fn)
    const lockAt = def.indexOf('agency_subscription_lock(')
    const rowAt = def.search(/FOR UPDATE/i)
    expect(lockAt >= 0, `${fn} never calls agency_subscription_lock`)
    expect(rowAt >= 0, `${fn} has no FOR UPDATE`)
    expect(lockAt < rowAt, `${fn}: lock helper (${lockAt}) is not before the first FOR UPDATE (${rowAt})`)
    expect(def.includes('agency_subscription_assert('), `${fn} lost its guard call`)
  }
})

postCase('B101. a subscription whose plan row is missing fails closed with SB002 (never open)', async () => {
  const { agency, owner } = await enforcedAgency('s2-noplan', { plan: null })
  await su(`SET session_replication_role = replica`)
  try {
    const planId = uid()
    await su(
      `INSERT INTO public.subscriptions
         (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
       VALUES ($1, $2, $3, $4, 'active', 'monthly', now(), now() + interval '30 days')`,
      [uid(), owner, agency, planId]
    )
  } finally {
    await su(`SET session_replication_role = origin`)
  }
  expectBlocked(await guard(agency, 'truck_add', 1), 'SB002', 'orphan plan truck_add')
  expectBlocked(await guard(agency, 'dispatch', 1), 'SB002', 'orphan plan dispatch')
})

postCase('B102. add = 0 skips the limit comparison (seat already counted) but still applies the status checks', async () => {
  const { agency } = await enforcedAgency('s2-add0')
  await addActiveStaff(agency, 2)
  expectBlocked(await guard(agency, 'staff_add', 1), 'SB001', 'staff full, add 1')
  expectAllowed(await guard(agency, 'staff_add', 0), 'staff full, add 0 (downgrade, seat already counted)')
  const g = await enforcedAgency('s2-add0-grace', { subStatus: 'grace' })
  expectBlocked(await guard(g.agency, 'staff_add', 0), 'SB002', 'grace, add 0 still read-only')
  const e = await enforcedAgency('s2-add0-exp', { subStatus: 'expired' })
  expectBlocked(await guard(e.agency, 'staff_add', 0), 'SB002', 'expired, add 0 still read-only')
  const n = await enforcedAgency('s2-add0-none', { plan: null })
  expectBlocked(await guard(n.agency, 'staff_add', 0), 'SB002', 'no subscription, add 0 still read-only')
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

  for (const c of PRE) await testCase(c.name, c.fn)

  // Settings table (platform_billing_settings) comes from 028, which runs after this file.
  if (existsSync(join(MIGRATIONS_DIR, SETTINGS_FILE))) {
    try {
      await applyFiles([SETTINGS_FILE])
      settingsApplied = true
    } catch (error) {
      settingsError = firstLine(error)
    }
  } else {
    settingsError = `${SETTINGS_FILE} is missing`
  }

  for (const c of POST) await testCase(c.name, c.fn)

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
