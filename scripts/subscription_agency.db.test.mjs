#!/usr/bin/env node
/**
 * Agency subscriptions — S1 data model and S1 trial rules. Red-first PGlite battery (TO-152 S1).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the supabase/migrations
 * chain up to and including supabase/migrations/20261026000000_agency_subscriptions.sql and drives the
 * objects the way PostgREST does per request: `SET ROLE authenticated` with `request.jwt.claims` set to
 * the caller's sub. Legacy (pre-migration) subscription rows are seeded AFTER every earlier migration and
 * BEFORE the new file runs, so the backfill is exercised on real pre-migration data.
 *
 * The migration does NOT exist yet. Every case that needs the new objects is gated and is EXPECTED to
 * fail now with "red: migration ... is missing". Cases only pass once the file exists and does what
 * docs/TO-152-rulings.md sections 1 and 7 require.
 *
 * Pinned contract (sections 1 and 7 of the rulings):
 *   subscriptions: + agency_id (FK transport_agencies), grace_end, first_paid_at, version (int);
 *     user_id nullable; subscriptions_user_id_key dropped; status CHECK in
 *     trial|active|past_due|grace|expired|cancelled ('paused' rejected).
 *     Partial unique index subscriptions_one_live_per_agency (agency_id) WHERE status IN
 *     ('trial','active','past_due','grace').
 *   Backfill via transport_agencies.user_id: several agencies -> oldest approved; none -> row kept with
 *     agency_id NULL. Both logged in subscription_backfill_conflicts. 'paused' -> 'cancelled'.
 *   plans.drivers_limit = 2 x trucks_limit. price_yearly = 10 x price_monthly, Starter/Growth/Professional
 *     = 499000 / 1999000 / 4999000 (Enterprise 14999000).
 *   public.agency_subscription_entitlement() : no args, SECURITY DEFINER, any active member scope
 *     (viewer included). Reply shape {ok, agency_id, status, plan_tier, period_end, grace_end, trial_end,
 *     can_write, can_dispatch, limits{trucks,staff,drivers,orders_month}, usage{trucks,staff,drivers,orders_month}}.
 *   public.agency_subscription_state(p_agency_id uuid) : service_role only.
 *   public.agency_subscription_start_trial() : owner of an approved agency only. Inserts a
 *     subscription_trial_claims row: one per agency, per GSTIN and per normalised phone.
 *     14-day trial on Starter limits. Second call / same GSTIN / same phone -> {ok:false,error:'trial_already_claimed'}.
 *     Staff of any scope -> {ok:false,error:'forbidden_scope'}. Suspended or unapproved agency refused.
 *   Direct writes by authenticated to subscriptions and subscription_trial_claims are refused.
 *   Every new SECURITY DEFINER function: search_path set, no PUBLIC or anon EXECUTE.
 *
 * Assumptions (the brief does not pin these; flagged for the implementer):
 *   - No subscription row: entitlement replies {ok:true, status:'none', plan_tier:null, can_write:false,
 *     can_dispatch:false} for an approved member. Not a raised error.
 *   - can_write is true for trial, active, past_due (banner only). False for grace, expired, cancelled.
 *   - can_dispatch is true for trial, active, past_due, grace. False for expired and cancelled.
 *   - limits.trucks = trucks_limit; limits.staff = users_limit (owner uncounted); limits.drivers =
 *     drivers_limit; limits.orders_month = shipments_monthly. Enterprise sentinel -1 is kept as -1.
 *   - usage.trucks counts agency_trucks rows; usage.staff counts active agency_memberships;
 *     usage.drivers counts active agency_driver_employment rows; usage.orders_month counts agency_orders
 *     created in the current Asia/Kolkata month (any status).
 *   - Caller refusals (revoked member, no agency, suspended or unapproved agency) may be a raised error or
 *     a reply with ok:false. Only the trial reply codes are pinned exactly.
 *   - subscription_backfill_conflicts has a subscription_id column.
 *   - subscription_trial_claims has an agency_id column. Phone is normalised to its last 10 digits, so
 *     '+91 98765-43210' and '9876543210' collide.
 *   - Entitlement with several rows reads the live row, or the newest row when none is live.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST and GoTrue behaviour is not
 * covered. Concurrency is not raced (see the S2 battery for the advisory-lock race).
 *
 * Usage:  node scripts/subscription_agency.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud failure, never a skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261026000000_agency_subscriptions.sql'
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

/** Every case that touches the new objects is gated on the migration existing AND applying. */
let migrationApplied = false
let migrationError = ''
let legacyError = ''
let fixturesReady = false
let fixtureError = ''

async function gatedCase(name, fn) {
  await testCase(name, async () => {
    if (!MIGRATION_PRESENT) {
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so agency subscriptions do not exist yet`)
    }
    if (!migrationApplied) throw new Error(`red: migration ${MIGRATION_FILE} failed to apply: ${migrationError}`)
    if (legacyError) throw new Error(`red: legacy pre-migration fixtures failed: ${legacyError}`)
    if (!fixturesReady) throw new Error(`red: post-migration fixtures failed: ${fixtureError}`)
    await fn()
  })
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
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

/** Runs one statement as service_role (BYPASSRLS, the role the server-side callers use). */
async function asServiceRole(sql, params = []) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  await db.exec('SET ROLE service_role')
  try {
    return await db.query(sql, params)
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

async function createAgencyRow(userId, tag, status = 'pending', opts = {}) {
  const id = uid()
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number, contact_phone, created_at)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6, $7, COALESCE($8::timestamptz, now()))`,
    [
      id,
      userId,
      `${tag} Transport Pvt Ltd`,
      status,
      opts.gstin ?? genGstin(),
      `ABCDE${4000 + seq}Q`,
      opts.phone ?? null,
      opts.createdAt ?? null,
    ]
  )
  return id
}

async function freshAgency(tag, status = 'approved') {
  const owner = await createUser(tag)
  const agency = await createAgencyRow(owner, tag, status)
  return { owner, agency }
}

/** Membership seeded by superuser (status 'revoked' also sets revoked_at, table CHECK). */
async function seedStaff(agencyId, tag, scope, status = 'active') {
  const userId = await createUser(tag)
  await su(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [uid(), agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
}

/**
 * Subscription row seeded by superuser, post-migration (may set agency_id).
 * agencyId null = row with no agency.
 */
async function insertSub({ agencyId = null, userId, plan = 'Starter', status = 'active', cycle = 'monthly', periodDays = 30 }) {
  const id = uid()
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, agency_id)
     VALUES ($1, $2, (SELECT id FROM public.subscription_plans WHERE name = $3), $4, $5,
             now(), now() + make_interval(days => $6::int), $7)`,
    [id, userId, plan, status, cycle, periodDays, agencyId]
  )
  return id
}

/** Legacy subscription row, pre-migration: only columns that exist before the migration (no agency_id). */
async function insertLegacySub({ userId, plan = 'Starter', status = 'active', cycle = 'monthly', periodDays = 30 }) {
  const id = uid()
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
     VALUES ($1, $2, (SELECT id FROM public.subscription_plans WHERE name = $3), $4, $5,
             now(), now() + make_interval(days => $6::int))`,
    [id, userId, plan, status, cycle, periodDays]
  )
  return id
}

// ---------------------------------------------------------------------------
// Pre-migration legacy fixtures (the old user-keyed shape). Seeded before the new file runs.
// ---------------------------------------------------------------------------
const legacy = {}

async function seedLegacy() {
  legacy.lu1 = await createUser('s1-legacy-multi')
  legacy.la1 = await createAgencyRow(legacy.lu1, 's1-legacy-old-approved', 'approved', { createdAt: '2026-01-05T00:00:00Z' })
  legacy.la2 = await createAgencyRow(legacy.lu1, 's1-legacy-new-approved', 'approved', { createdAt: '2026-03-05T00:00:00Z' })
  legacy.lu2 = await createUser('s1-legacy-pending-first')
  legacy.la3 = await createAgencyRow(legacy.lu2, 's1-legacy-pending', 'pending', { createdAt: '2026-01-01T00:00:00Z' })
  legacy.la4 = await createAgencyRow(legacy.lu2, 's1-legacy-later-approved', 'approved', { createdAt: '2026-02-01T00:00:00Z' })
  legacy.lu3 = await createUser('s1-legacy-no-agency')
  legacy.lu4 = await createUser('s1-legacy-single')
  legacy.la5 = await createAgencyRow(legacy.lu4, 's1-legacy-single-agency', 'approved', { createdAt: '2026-01-10T00:00:00Z' })
  legacy.ls1 = await insertLegacySub({ userId: legacy.lu1, status: 'active' })
  legacy.ls2 = await insertLegacySub({ userId: legacy.lu2, status: 'active' })
  legacy.ls3 = await insertLegacySub({ userId: legacy.lu3, status: 'active' })
  legacy.ls4 = await insertLegacySub({ userId: legacy.lu4, status: 'paused' })
}

// ---------------------------------------------------------------------------
// Post-migration fixtures
// ---------------------------------------------------------------------------
const GSTIN_A = '27AAAPL1234C1Z5'
const GSTIN_B = '29ABCDE1234F1Z5'
const GSTIN_C = '33XYZAB9876K1Z2'
const GSTIN_S = '24QWERT5678M1Z9'

const fx = {}

async function setupPostMigration() {
  fx.ownerA = await createUser('s1-owner-a')
  fx.agencyA = await createAgencyRow(fx.ownerA, 'S1 A', 'approved', { gstin: GSTIN_A, phone: '9000000001' })
  fx.ownerB = await createUser('s1-owner-b')
  fx.agencyB = await createAgencyRow(fx.ownerB, 'S1 B', 'approved', { gstin: GSTIN_B, phone: '+91 98765-43210' })
  fx.ownerC = await createUser('s1-owner-c')
  fx.agencyC = await createAgencyRow(fx.ownerC, 'S1 C', 'approved', { gstin: GSTIN_C, phone: '9876543210' })
  fx.ownerD = await createUser('s1-owner-d')
  fx.agencyD = await createAgencyRow(fx.ownerD, 'S1 D', 'approved', { gstin: GSTIN_B, phone: '9123456780' })
  fx.ownerS = await createUser('s1-owner-s')
  fx.agencyS = await createAgencyRow(fx.ownerS, 'S1 S', 'suspended', { gstin: GSTIN_S, phone: '9555555555' })
  fx.ownerP = await createUser('s1-owner-p')
  fx.agencyP = await createAgencyRow(fx.ownerP, 'S1 P', 'pending', { phone: '9444444444' })
  fx.noAgency = await createUser('s1-no-agency')

  fx.dispatcherA = await seedStaff(fx.agencyA, 's1-dispatcher-a', 'dispatcher')
  fx.fleetA = await seedStaff(fx.agencyA, 's1-fleet-a', 'fleet_manager')
  fx.financeA = await seedStaff(fx.agencyA, 's1-finance-a', 'finance')
  fx.viewerA = await seedStaff(fx.agencyA, 's1-viewer-a', 'viewer')
  fx.revokedA = await seedStaff(fx.agencyA, 's1-revoked-a', 'dispatcher', 'revoked')
  fx.staffS = await seedStaff(fx.agencyS, 's1-staff-s', 'dispatcher')

  // Growth plan on agency A: trucks 20, staff 10, drivers 40, orders 500 per month.
  fx.subA = await insertSub({ agencyId: fx.agencyA, userId: fx.ownerA, plan: 'Growth', status: 'active' })

  // Real usage rows for agency A.
  for (const rc of ['S1RC-01', 'S1RC-02']) {
    await su(
      `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number) VALUES ($1, $2, 'eicher_14ft', $3)`,
      [uid(), fx.agencyA, rc]
    )
  }
  const drivers = []
  for (let i = 1; i <= 3; i += 1) {
    const driverId = uid()
    drivers.push(driverId)
    await su(
      `INSERT INTO public.drivers (id, full_name, phone, vehicle_type, pan_number) VALUES ($1, $2, $3, 'eicher_14ft', $4)`,
      [driverId, `S1 Driver ${i}`, `900000010${i}`, `ABCDE${1000 + i}F`]
    )
  }
  await su(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, 'active'), ($4, $2, $5, 'active')`,
    [uid(), fx.agencyA, drivers[0], uid(), drivers[1]]
  )
  await su(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, 'ended')`,
    [uid(), fx.agencyA, drivers[2]]
  )

  const agreementId = uid()
  await su(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES ($1, $2, 'S1 Client', 'active', $3)`,
    [agreementId, fx.agencyA, nx('s1-agr')]
  )
  await su(
    `INSERT INTO public.agency_orders (id, agency_id, agreement_id, client_order_ref, status, version, created_at)
     VALUES ($1, $2, $3, 'S1-ORD-NOW', 'draft', 1, now()),
            ($4, $2, $3, 'S1-ORD-OLD', 'draft', 1, now() - interval '2 months')`,
    [uid(), fx.agencyA, agreementId, uid()]
  )
}

async function setSubA(status, { graceEnd = null, trialEnd = null, periodEnd = null } = {}) {
  await su(
    `UPDATE public.subscriptions
        SET status = $2,
            grace_end = $3::timestamptz,
            trial_end = COALESCE($4::timestamptz, trial_end),
            current_period_end = COALESCE($5::timestamptz, current_period_end)
      WHERE id = $1`,
    [fx.subA, status, graceEnd, trialEnd, periodEnd]
  )
}

// ---------------------------------------------------------------------------
// Call helpers
// ---------------------------------------------------------------------------
const ENT_SQL = 'SELECT public.agency_subscription_entitlement() AS r'
const TRIAL_SQL = 'SELECT public.agency_subscription_start_trial() AS r'
const STATE_SQL = 'SELECT public.agency_subscription_state($1::uuid) AS r'

/** Runs an RPC as `userId`. Returns {raised,message} or {raised:false,value}. */
async function callAs(userId, sql, params = []) {
  return asActor(userId, async () => {
    try {
      const res = await db.query(sql, params)
      return { raised: false, value: parseJson(res.rows[0].r) }
    } catch (error) {
      return { raised: true, message: firstLine(error) }
    }
  })
}

function describeReply(res) {
  return res.raised ? `raised: ${res.message}` : JSON.stringify(res.value)
}

/** A refusal is an error raised by the database OR a reply with ok:false. */
function expectRefusal(res, label) {
  const refused = res.raised || (res.value && res.value.ok === false)
  expect(refused, `${label}: expected a refusal, got ${describeReply(res)}`)
  if (!res.raised) {
    expect(res.value.agency_id === undefined, `${label}: refusal leaked agency_id ${JSON.stringify(res.value)}`)
  }
}

function expectReply(res, code) {
  expect(
    !res.raised && res.value && res.value.ok === false && res.value.error === code,
    `expected {ok:false,error:'${code}'}, got ${describeReply(res)}`
  )
}

function expectOk(res, label) {
  expect(!res.raised && res.value && res.value.ok === true, `${label}: expected {ok:true}, got ${describeReply(res)}`)
}

/** Live row count helper for a given agency. */
async function countSubs(agencyId) {
  return Number((await su(`SELECT count(*)::int AS n FROM public.subscriptions WHERE agency_id = $1`, [agencyId])).rows[0].n)
}

async function fnRow(name) {
  const row = (
    await su(
      `SELECT p.proname, p.prosecdef, p.proconfig, p.pronargs,
              pg_get_function_identity_arguments(p.oid) AS args,
              pg_get_function_result(p.oid) AS result,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
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

function hasSearchPath(row) {
  return Array.isArray(row.proconfig) && row.proconfig.some((c) => /^search_path=/.test(c))
}

async function columnsOf(table) {
  const rows = (
    await su(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1`,
      [table]
    )
  ).rows
  return Object.fromEntries(rows.map((r) => [r.column_name, r]))
}

const LIVE = ['trial', 'active', 'past_due', 'grace']

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------
async function runCases() {
  // =========================================================================
  // A. Migration presence and schema
  // =========================================================================
  await testCase(`S01.01 migration file ${MIGRATION_FILE} is present in supabase/migrations and applies cleanly`, async () => {
    expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing (not written yet)`)
    expect(migrationApplied, `migration ${MIGRATION_FILE} failed to apply: ${migrationError}`)
  })

  await gatedCase('S01.02 subscriptions gains agency_id (uuid), grace_end (timestamptz), first_paid_at (timestamptz), version (integer)', async () => {
    const cols = await columnsOf('subscriptions')
    expect(cols.agency_id && cols.agency_id.data_type === 'uuid', `agency_id is ${JSON.stringify(cols.agency_id)}`)
    expect(cols.grace_end && cols.grace_end.data_type === 'timestamp with time zone', `grace_end is ${JSON.stringify(cols.grace_end)}`)
    expect(cols.first_paid_at && cols.first_paid_at.data_type === 'timestamp with time zone', `first_paid_at is ${JSON.stringify(cols.first_paid_at)}`)
    expect(cols.version && cols.version.data_type === 'integer', `version is ${JSON.stringify(cols.version)}`)
  })

  await gatedCase('S01.03 subscriptions.user_id is nullable (the purchaser, not the tenant key)', async () => {
    const cols = await columnsOf('subscriptions')
    expect(cols.user_id && cols.user_id.is_nullable === 'YES', `user_id is_nullable=${cols.user_id && cols.user_id.is_nullable}`)
  })

  await gatedCase('S01.04 subscriptions_user_id_key is dropped and no unique index on user_id alone remains', async () => {
    const named = Number(
      (await su(`SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'public.subscriptions'::regclass AND conname = 'subscriptions_user_id_key'`)).rows[0].n
    )
    const alone = Number(
      (
        await su(
          `SELECT count(*)::int AS n FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
            WHERE i.indrelid = 'public.subscriptions'::regclass AND i.indisunique AND i.indnatts = 1 AND a.attname = 'user_id'`
        )
      ).rows[0].n
    )
    expect(named === 0 && alone === 0, `subscriptions_user_id_key present=${named}, unique user_id indexes=${alone}`)
  })

  await gatedCase('S01.05 subscriptions.status CHECK names exactly trial, active, past_due, grace, expired, cancelled', async () => {
    const def = (
      await su(
        `SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c
          WHERE c.conrelid = 'public.subscriptions'::regclass AND c.contype = 'c' AND pg_get_constraintdef(c.oid) ILIKE '%status%'`
      )
    ).rows.map((r) => r.d).join(' | ')
    const missing = ['trial', 'active', 'past_due', 'grace', 'expired', 'cancelled'].filter((s) => !def.includes(`'${s}'`))
    expect(missing.length === 0, `status CHECK lacks: ${missing.join(', ')} (def: ${def.slice(0, 200)})`)
    expect(!def.includes(`'paused'`), `status CHECK still allows 'paused'`)
  })

  await gatedCase(`S01.06 the status CHECK rejects the retired value 'paused' on insert`, async () => {
    const owner = await createUser('s1-paused')
    await expectRaises(
      insertSub({ userId: owner, status: 'paused' }),
      'check constraint'
    )
  })

  await gatedCase('S01.07 subscriptions_one_live_per_agency is a UNIQUE partial index on (agency_id) for trial, active, past_due, grace', async () => {
    const def = (await su(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'subscriptions_one_live_per_agency'`)).rows[0]
    expect(def, 'index subscriptions_one_live_per_agency is missing')
    const d = def.indexdef
    expect(/UNIQUE INDEX/i.test(d) && /\(agency_id\)/.test(d), `not a unique index on (agency_id): ${d}`)
    const missing = LIVE.filter((s) => !d.includes(`'${s}'`))
    expect(missing.length === 0, `predicate lacks ${missing.join(', ')}: ${d}`)
    expect(!d.includes(`'expired'`) && !d.includes(`'cancelled'`), `predicate wrongly includes expired or cancelled: ${d}`)
  })

  await gatedCase('S01.08 a second live subscription for the same agency is refused with a unique violation', async () => {
    const { owner, agency } = await freshAgency('s1-dup-live')
    await insertSub({ agencyId: agency, userId: owner, status: 'active' })
    await expectRaises(insertSub({ agencyId: agency, userId: owner, status: 'trial' }), 'duplicate key')
  })

  await gatedCase('S01.09 each of trial, active, past_due and grace blocks a second live row for its agency', async () => {
    const failures = []
    for (const first of LIVE) {
      const { owner, agency } = await freshAgency(`s1-live-${first}`)
      await insertSub({ agencyId: agency, userId: owner, status: first })
      try {
        await insertSub({ agencyId: agency, userId: owner, status: 'active' })
        failures.push(`${first} did not block a second live row`)
      } catch (error) {
        if (!firstLine(error).includes('duplicate key')) failures.push(`${first}: ${firstLine(error)}`)
      }
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await gatedCase('S01.10 a cancelled row does not block a new live row for the same agency', async () => {
    const { owner, agency } = await freshAgency('s1-cancelled-free')
    await insertSub({ agencyId: agency, userId: owner, status: 'cancelled' })
    await insertSub({ agencyId: agency, userId: owner, status: 'active' })
    expect((await countSubs(agency)) === 2, 'the active row after a cancelled row was not inserted')
  })

  await gatedCase('S01.11 an expired row does not block a new trial row for the same agency', async () => {
    const { owner, agency } = await freshAgency('s1-expired-free')
    await insertSub({ agencyId: agency, userId: owner, status: 'expired' })
    await insertSub({ agencyId: agency, userId: owner, status: 'trial' })
    expect((await countSubs(agency)) === 2, 'the trial row after an expired row was not inserted')
  })

  await gatedCase('S01.12 live rows for two different agencies are both allowed', async () => {
    const a = await freshAgency('s1-two-a')
    const b = await freshAgency('s1-two-b')
    await insertSub({ agencyId: a.agency, userId: a.owner, status: 'active' })
    await insertSub({ agencyId: b.agency, userId: b.owner, status: 'active' })
    expect((await countSubs(a.agency)) === 1 && (await countSubs(b.agency)) === 1, 'rows for distinct agencies collided')
  })

  await gatedCase('S01.13 legacy rows with agency_id NULL do not collide with each other', async () => {
    const owner = await createUser('s1-null-agency')
    await insertSub({ agencyId: null, userId: owner, status: 'active' })
    await insertSub({ agencyId: null, userId: owner, status: 'active' })
    const n = Number((await su(`SELECT count(*)::int AS n FROM public.subscriptions WHERE agency_id IS NULL AND user_id = $1`, [owner])).rows[0].n)
    expect(n === 2, `expected 2 NULL-agency rows, found ${n}`)
  })

  // =========================================================================
  // B. Plans
  // =========================================================================
  await gatedCase('S01.14 subscription_plans.drivers_limit exists as integer', async () => {
    const cols = await columnsOf('subscription_plans')
    expect(cols.drivers_limit && cols.drivers_limit.data_type === 'integer', `drivers_limit is ${JSON.stringify(cols.drivers_limit)}`)
  })

  const planRows = async () => {
    const rows = (
      await su(`SELECT name, trucks_limit, drivers_limit, users_limit, shipments_monthly, price_monthly, price_yearly FROM public.subscription_plans`)
    ).rows
    return Object.fromEntries(rows.map((r) => [r.name, r]))
  }

  await gatedCase('S01.15 Starter drivers_limit is 2 x trucks_limit (6)', async () => {
    const p = (await planRows()).Starter
    expect(p && p.drivers_limit === 6, `Starter drivers_limit=${p && p.drivers_limit}`)
  })

  await gatedCase('S01.16 Growth drivers_limit is 2 x trucks_limit (40)', async () => {
    const p = (await planRows()).Growth
    expect(p && p.drivers_limit === 40, `Growth drivers_limit=${p && p.drivers_limit}`)
  })

  await gatedCase('S01.17 Professional drivers_limit is 2 x trucks_limit (100)', async () => {
    const p = (await planRows()).Professional
    expect(p && p.drivers_limit === 100, `Professional drivers_limit=${p && p.drivers_limit}`)
  })

  await gatedCase('S01.18 Enterprise drivers_limit keeps the unlimited sentinel -1', async () => {
    const p = (await planRows()).Enterprise
    expect(p && p.drivers_limit === -1, `Enterprise drivers_limit=${p && p.drivers_limit}`)
  })

  await gatedCase('S01.19 Starter price_yearly is 499000 paise (10 x 49900)', async () => {
    const p = (await planRows()).Starter
    expect(p && p.price_yearly === 499000, `Starter price_yearly=${p && p.price_yearly}`)
  })

  await gatedCase('S01.20 Growth price_yearly is 1999000 paise', async () => {
    const p = (await planRows()).Growth
    expect(p && p.price_yearly === 1999000, `Growth price_yearly=${p && p.price_yearly}`)
  })

  await gatedCase('S01.21 Professional price_yearly is 4999000 paise', async () => {
    const p = (await planRows()).Professional
    expect(p && p.price_yearly === 4999000, `Professional price_yearly=${p && p.price_yearly}`)
  })

  await gatedCase('S01.22 Enterprise price_yearly is 14999000 paise', async () => {
    const p = (await planRows()).Enterprise
    expect(p && p.price_yearly === 14999000, `Enterprise price_yearly=${p && p.price_yearly}`)
  })

  await gatedCase('S01.23 every plan has price_yearly exactly 10 x price_monthly', async () => {
    const rows = Object.entries(await planRows())
    const bad = rows.filter(([, p]) => p.price_yearly !== 10 * p.price_monthly).map(([n, p]) => `${n}:${p.price_yearly}/${p.price_monthly}`)
    expect(bad.length === 0, `not 10x: ${bad.join(', ')}`)
  })

  // =========================================================================
  // C. Backfill from legacy rows (seeded before the migration ran)
  // =========================================================================
  await gatedCase('S01.24 several agencies: the legacy row takes the oldest APPROVED agency (pending older one skipped)', async () => {
    const r1 = await suOne(`SELECT agency_id FROM public.subscriptions WHERE id = $1`, [legacy.ls1])
    const r2 = await suOne(`SELECT agency_id FROM public.subscriptions WHERE id = $1`, [legacy.ls2])
    expect(r1 && r1.agency_id === legacy.la1, `lu1 row agency_id=${r1 && r1.agency_id}, expected oldest approved ${legacy.la1}`)
    expect(r2 && r2.agency_id === legacy.la4, `lu2 row agency_id=${r2 && r2.agency_id}, expected approved ${legacy.la4} (not pending ${legacy.la3})`)
  })

  await gatedCase('S01.25 single agency: the legacy row is linked to that agency', async () => {
    const r = await suOne(`SELECT agency_id FROM public.subscriptions WHERE id = $1`, [legacy.ls4])
    expect(r && r.agency_id === legacy.la5, `agency_id=${r && r.agency_id}, expected ${legacy.la5}`)
  })

  await gatedCase('S01.26 no agency: the legacy row is kept with agency_id NULL', async () => {
    const r = await suOne(`SELECT agency_id, user_id FROM public.subscriptions WHERE id = $1`, [legacy.ls3])
    expect(r, 'the no-agency legacy row was deleted')
    expect(r.agency_id === null, `agency_id=${r.agency_id}, expected NULL`)
  })

  await gatedCase('S01.27 subscription_backfill_conflicts logs the several-agencies rows and the no-agency row', async () => {
    const rows = (await su(`SELECT subscription_id FROM public.subscription_backfill_conflicts`)).rows.map((r) => r.subscription_id)
    const missing = [legacy.ls1, legacy.ls2, legacy.ls3].filter((id) => !rows.includes(id))
    expect(missing.length === 0, `not logged: ${missing.join(', ')}`)
  })

  await gatedCase('S01.28 legacy status paused is migrated to cancelled', async () => {
    const r = await suOne(`SELECT status FROM public.subscriptions WHERE id = $1`, [legacy.ls4])
    expect(r && r.status === 'cancelled', `status=${r && r.status}`)
  })

  await gatedCase('S01.29 backfill keeps the purchaser user_id on every legacy row', async () => {
    const rows = (await su(`SELECT id, user_id FROM public.subscriptions WHERE id = ANY($1::uuid[])`, [[legacy.ls1, legacy.ls2, legacy.ls3, legacy.ls4]])).rows
    const wrong = rows.filter((r) => r.user_id !== { [legacy.ls1]: legacy.lu1, [legacy.ls2]: legacy.lu2, [legacy.ls3]: legacy.lu3, [legacy.ls4]: legacy.lu4 }[r.id])
    expect(rows.length === 4 && wrong.length === 0, `rows=${rows.length}, user_id mismatches=${wrong.length}`)
  })

  await gatedCase('S01.30 subscription_backfill_conflicts has RLS on and authenticated cannot write it', async () => {
    const rls = await suOne(`SELECT c.relrowsecurity AS on FROM pg_class c WHERE c.oid = 'public.subscription_backfill_conflicts'::regclass`)
    expect(rls && rls.on === true, 'RLS not enabled on subscription_backfill_conflicts')
    const priv = await suOne(
      `SELECT has_table_privilege('authenticated', 'public.subscription_backfill_conflicts', 'INSERT') AS ins,
              has_table_privilege('authenticated', 'public.subscription_backfill_conflicts', 'UPDATE') AS upd`
    )
    expect(priv.ins === false && priv.upd === false, `authenticated can write conflicts: insert=${priv.ins} update=${priv.upd}`)
  })

  await gatedCase('S01.31 a no-agency legacy row never entitles its purchaser', async () => {
    const res = await callAs(legacy.lu3, ENT_SQL)
    expectRefusal(res, 'no-agency purchaser')
  })

  // =========================================================================
  // D. Entitlement reads (post-migration fixtures)
  // =========================================================================
  await gatedCase('S01.32 owner entitlement replies ok for their agency on the Growth subscription', async () => {
    const res = await callAs(fx.ownerA, ENT_SQL)
    expectOk(res, 'owner A')
    expect(res.value.agency_id === fx.agencyA, `agency_id=${res.value.agency_id}`)
    expect(res.value.status === 'active' && res.value.plan_tier === 'growth', `status=${res.value.status} plan_tier=${res.value.plan_tier}`)
  })

  await gatedCase('S01.33 entitlement shape has every top-level key plus limits and usage keys', async () => {
    const v = (await callAs(fx.ownerA, ENT_SQL)).value
    const top = ['ok', 'agency_id', 'status', 'plan_tier', 'period_end', 'grace_end', 'trial_end', 'can_write', 'can_dispatch', 'limits', 'usage']
    const missing = top.filter((k) => !(k in v))
    const lim = ['trucks', 'staff', 'drivers', 'orders_month'].filter((k) => !v.limits || !(k in v.limits))
    const use = ['trucks', 'staff', 'drivers', 'orders_month'].filter((k) => !v.usage || !(k in v.usage))
    expect(missing.length + lim.length + use.length === 0, `missing top=[${missing}] limits=[${lim}] usage=[${use}]`)
  })

  await gatedCase('S01.34 limits come from the Growth plan: trucks 20, staff 10, drivers 40, orders_month 500', async () => {
    const l = (await callAs(fx.ownerA, ENT_SQL)).value.limits
    expect(l.trucks === 20 && l.staff === 10 && l.drivers === 40 && l.orders_month === 500, JSON.stringify(l))
  })

  await gatedCase('S01.35 usage.trucks counts the real agency_trucks rows (2)', async () => {
    const u = (await callAs(fx.ownerA, ENT_SQL)).value.usage
    expect(u.trucks === 2, `usage.trucks=${u.trucks}`)
  })

  await gatedCase('S01.36 usage.staff counts active memberships only (4; revoked excluded; owner uncounted)', async () => {
    const u = (await callAs(fx.ownerA, ENT_SQL)).value.usage
    expect(u.staff === 4, `usage.staff=${u.staff}`)
  })

  await gatedCase('S01.37 usage.drivers counts active driver employments only (2)', async () => {
    const u = (await callAs(fx.ownerA, ENT_SQL)).value.usage
    expect(u.drivers === 2, `usage.drivers=${u.drivers}`)
  })

  await gatedCase('S01.38 usage.orders_month counts orders created this Asia/Kolkata month only (1)', async () => {
    const u = (await callAs(fx.ownerA, ENT_SQL)).value.usage
    expect(u.orders_month === 1, `usage.orders_month=${u.orders_month}`)
  })

  await gatedCase('S01.39 a viewer (any scope) can read the entitlement of their agency', async () => {
    const res = await callAs(fx.viewerA, ENT_SQL)
    expectOk(res, 'viewer A')
    expect(res.value.agency_id === fx.agencyA, `viewer sees agency_id=${res.value.agency_id}`)
  })

  await gatedCase('S01.40 dispatcher, fleet_manager and finance staff all read their agency entitlement', async () => {
    await gather([
      ['dispatcher', async () => expectOk(await callAs(fx.dispatcherA, ENT_SQL), 'dispatcher')],
      ['fleet_manager', async () => expectOk(await callAs(fx.fleetA, ENT_SQL), 'fleet_manager')],
      ['finance', async () => expectOk(await callAs(fx.financeA, ENT_SQL), 'finance')],
    ])
  })

  await gatedCase('S01.41 another agency owner sees only their own agency (none status) and never agency A', async () => {
    const res = await callAs(fx.ownerB, ENT_SQL)
    expectOk(res, 'owner B')
    expect(res.value.agency_id === fx.agencyB, `owner B sees agency_id=${res.value.agency_id}`)
    expect(!JSON.stringify(res.value).includes(fx.agencyA), 'agency A id leaked into owner B reply')
  })

  await gatedCase('S01.42 a revoked member is refused and receives no agency data', async () => {
    expectRefusal(await callAs(fx.revokedA, ENT_SQL), 'revoked member')
  })

  await gatedCase('S01.43 a user with no agency profile is refused', async () => {
    const res = await callAs(fx.noAgency, ENT_SQL)
    expectRefusal(res, 'no-agency user')
  })

  await gatedCase('S01.44 staff of a suspended agency are blocked and no suspended agency id is returned', async () => {
    const res = await callAs(fx.staffS, ENT_SQL)
    expectRefusal(res, 'suspended-agency staff')
    expect(!JSON.stringify(res.value ?? {}).includes(fx.agencyS), 'suspended agency id leaked')
  })

  await gatedCase('S01.45 the owner of a pending (unapproved) agency is refused', async () => {
    const res = await callAs(fx.ownerP, ENT_SQL)
    expectRefusal(res, 'unapproved owner')
  })

  await gatedCase('S01.46 an approved agency with no subscription row replies none, can_write false, can_dispatch false', async () => {
    const res = await callAs(fx.ownerB, ENT_SQL)
    expectOk(res, 'owner B before trial')
    expect(
      res.value.status === 'none' && res.value.can_write === false && res.value.can_dispatch === false && res.value.plan_tier === null,
      `reply=${JSON.stringify(res.value)}`
    )
  })

  // Status matrix on agency A's single live row.
  await gatedCase('S01.47 trial status: can_write true, trial_end returned', async () => {
    await setSubA('trial', { trialEnd: new Date(Date.now() + 5 * 86400e3).toISOString() })
    const v = (await callAs(fx.ownerA, ENT_SQL)).value
    expect(v.status === 'trial' && v.can_write === true && v.trial_end !== null, JSON.stringify(v))
  })

  await gatedCase('S01.48 active status: can_write true and can_dispatch true', async () => {
    await setSubA('active')
    const v = (await callAs(fx.ownerA, ENT_SQL)).value
    expect(v.status === 'active' && v.can_write === true && v.can_dispatch === true, JSON.stringify(v))
  })

  await gatedCase('S01.49 past_due status: writes still allowed (banner only) and dispatch allowed', async () => {
    await setSubA('past_due')
    const v = (await callAs(fx.ownerA, ENT_SQL)).value
    expect(v.status === 'past_due' && v.can_write === true && v.can_dispatch === true, JSON.stringify(v))
  })

  await gatedCase('S01.50 grace status: read-only (can_write false), dispatch allowed, grace_end returned', async () => {
    await setSubA('grace', { graceEnd: new Date(Date.now() + 6 * 86400e3).toISOString() })
    const v = (await callAs(fx.ownerA, ENT_SQL)).value
    expect(v.status === 'grace' && v.can_write === false && v.can_dispatch === true && v.grace_end !== null, JSON.stringify(v))
  })

  await gatedCase('S01.51 expired status: ok true (data stays visible), can_write false, can_dispatch false', async () => {
    await setSubA('expired')
    const res = await callAs(fx.ownerA, ENT_SQL)
    expectOk(res, 'expired A')
    expect(res.value.status === 'expired' && res.value.can_write === false && res.value.can_dispatch === false, JSON.stringify(res.value))
  })

  await gatedCase('S01.52 cancelled status: can_write false and can_dispatch false', async () => {
    await setSubA('cancelled')
    const v = (await callAs(fx.ownerA, ENT_SQL)).value
    expect(v.status === 'cancelled' && v.can_write === false && v.can_dispatch === false, JSON.stringify(v))
  })

  await setSubA('active').catch(() => {})

  await gatedCase('S01.53 anon cannot execute agency_subscription_entitlement (permission denied)', async () => {
    await expectRaises(asAnon(ENT_SQL), 'permission denied')
  })

  // =========================================================================
  // E. State RPC (service_role only) and function surface
  // =========================================================================
  await gatedCase('S01.54 agency_subscription_entitlement takes no arguments and returns jsonb', async () => {
    const f = await fnRow('agency_subscription_entitlement')
    expect(f.pronargs === 0 && f.result === 'jsonb', `args=${f.pronargs} result=${f.result}`)
  })

  await gatedCase('S01.55 agency_subscription_state takes exactly (p_agency_id uuid) and returns jsonb', async () => {
    const f = await fnRow('agency_subscription_state')
    expect(f.args === 'p_agency_id uuid' && f.result === 'jsonb', `args="${f.args}" result=${f.result}`)
  })

  await gatedCase('S01.56 service_role can call agency_subscription_state and gets agency A status', async () => {
    const r = (await asServiceRole(STATE_SQL, [fx.agencyA])).rows[0].r
    const v = parseJson(r)
    expect(v && v.status === 'active' && (v.agency_id === fx.agencyA || v.ok === true), `reply=${JSON.stringify(v)}`)
  })

  await gatedCase('S01.57 an authenticated owner gets permission denied from agency_subscription_state', async () => {
    await expectRaises(asActor(fx.ownerA, () => db.query(STATE_SQL, [fx.agencyA])), 'permission denied')
  })

  await gatedCase('S01.58 anon gets permission denied from agency_subscription_state', async () => {
    await expectRaises(asAnon(STATE_SQL, [fx.agencyA]), 'permission denied')
  })

  await gatedCase('S01.59 agency_subscription_entitlement is SECURITY DEFINER with search_path set', async () => {
    const f = await fnRow('agency_subscription_entitlement')
    expect(f.prosecdef === true && hasSearchPath(f), `secdef=${f.prosecdef} proconfig=${JSON.stringify(f.proconfig)}`)
  })

  await gatedCase('S01.60 agency_subscription_start_trial is SECURITY DEFINER with search_path set', async () => {
    const f = await fnRow('agency_subscription_start_trial')
    expect(f.prosecdef === true && hasSearchPath(f), `secdef=${f.prosecdef} proconfig=${JSON.stringify(f.proconfig)}`)
  })

  await gatedCase('S01.61 agency_subscription_state is SECURITY DEFINER with search_path set', async () => {
    const f = await fnRow('agency_subscription_state')
    expect(f.prosecdef === true && hasSearchPath(f), `secdef=${f.prosecdef} proconfig=${JSON.stringify(f.proconfig)}`)
  })

  await gatedCase('S01.62 none of the three new functions grants EXECUTE to PUBLIC', async () => {
    const names = ['agency_subscription_entitlement', 'agency_subscription_start_trial', 'agency_subscription_state']
    const failures = []
    for (const n of names) {
      const f = await fnRow(n)
      if (f.public_exec) failures.push(n)
    }
    expect(failures.length === 0, `PUBLIC has EXECUTE on: ${failures.join(', ')}`)
  })

  await gatedCase('S01.63 anon has no EXECUTE on the entitlement, start_trial or state functions', async () => {
    const names = ['agency_subscription_entitlement', 'agency_subscription_start_trial', 'agency_subscription_state']
    const failures = []
    for (const n of names) {
      const f = await fnRow(n)
      if (f.anon_exec) failures.push(n)
    }
    expect(failures.length === 0, `anon has EXECUTE on: ${failures.join(', ')}`)
  })

  // =========================================================================
  // F. Direct writes and RLS
  // =========================================================================
  await gatedCase('S01.64 the owner cannot INSERT a subscriptions row directly (permission denied)', async () => {
    await expectRaises(
      asActor(fx.ownerB, () =>
        db.query(
          `INSERT INTO public.subscriptions (id, user_id, plan_id, status, billing_cycle, current_period_start, current_period_end, agency_id)
           VALUES ($1, $2, (SELECT id FROM public.subscription_plans WHERE name = 'Starter'), 'active', 'monthly', now(), now() + interval '30 days', $3)`,
          [uid(), fx.ownerB, fx.agencyB]
        )
      ),
      'permission denied'
    )
  })

  await gatedCase('S01.65 the owner cannot UPDATE their subscription (status unchanged)', async () => {
    const before = (await suOne(`SELECT status FROM public.subscriptions WHERE id = $1`, [fx.subA])).status
    let refused = false
    try {
      const r = await asActor(fx.ownerA, () => db.query(`UPDATE public.subscriptions SET status = 'cancelled' WHERE id = $1`, [fx.subA]))
      refused = r.affectedRows === 0
    } catch (error) {
      refused = /permission denied|row-level/i.test(firstLine(error))
    }
    const after = (await suOne(`SELECT status FROM public.subscriptions WHERE id = $1`, [fx.subA])).status
    expect(refused && after === before, `UPDATE was accepted: status ${before} -> ${after}`)
  })

  await gatedCase('S01.66 the owner cannot DELETE their subscription (row kept)', async () => {
    let refused = false
    try {
      const r = await asActor(fx.ownerA, () => db.query(`DELETE FROM public.subscriptions WHERE id = $1`, [fx.subA]))
      refused = r.affectedRows === 0
    } catch (error) {
      refused = /permission denied|row-level/i.test(firstLine(error))
    }
    expect(refused && (await countSubs(fx.agencyA)) === 1, 'owner DELETE removed the subscription')
  })

  await gatedCase('S01.67 the owner cannot INSERT into subscription_trial_claims directly (permission denied)', async () => {
    await expectRaises(
      asActor(fx.ownerC, () => db.query(`INSERT INTO public.subscription_trial_claims (agency_id) VALUES ($1)`, [fx.agencyC])),
      'permission denied'
    )
  })

  await gatedCase('S01.68 the owner cannot UPDATE or DELETE subscription_trial_claims (claims unchanged)', async () => {
    const before = Number((await su(`SELECT count(*)::int AS n FROM public.subscription_trial_claims WHERE agency_id = $1`, [fx.agencyB])).rows[0].n)
    let blocked = true
    for (const sql of [
      `UPDATE public.subscription_trial_claims SET agency_id = agency_id WHERE agency_id = $1`,
      `DELETE FROM public.subscription_trial_claims WHERE agency_id = $1`,
    ]) {
      try {
        const r = await asActor(fx.ownerB, () => db.query(sql, [fx.agencyB]))
        if (r.affectedRows !== 0) blocked = false
      } catch (error) {
        if (!/permission denied|row-level/i.test(firstLine(error))) blocked = false
      }
    }
    const after = Number((await su(`SELECT count(*)::int AS n FROM public.subscription_trial_claims WHERE agency_id = $1`, [fx.agencyB])).rows[0].n)
    expect(blocked && after === before, `claim writes were accepted (before=${before}, after=${after})`)
  })

  await gatedCase('S01.69 authenticated holds no INSERT, UPDATE or DELETE privilege on subscriptions or subscription_trial_claims', async () => {
    const p = await suOne(
      `SELECT has_table_privilege('authenticated', 'public.subscriptions', 'INSERT') AS s_ins,
              has_table_privilege('authenticated', 'public.subscriptions', 'UPDATE') AS s_upd,
              has_table_privilege('authenticated', 'public.subscriptions', 'DELETE') AS s_del,
              has_table_privilege('authenticated', 'public.subscription_trial_claims', 'INSERT') AS c_ins,
              has_table_privilege('authenticated', 'public.subscription_trial_claims', 'UPDATE') AS c_upd,
              has_table_privilege('authenticated', 'public.subscription_trial_claims', 'DELETE') AS c_del`
    )
    const granted = Object.entries(p).filter(([, v]) => v === true).map(([k]) => k)
    expect(granted.length === 0, `authenticated still holds: ${granted.join(', ')}`)
  })

  await gatedCase('S01.70 the owner of A reads their own subscription row; the owner of B reads none of A', async () => {
    const own = Number((await asActor(fx.ownerA, () => db.query(`SELECT count(*)::int AS n FROM public.subscriptions WHERE agency_id = $1`, [fx.agencyA]))).rows[0].n)
    const other = Number((await asActor(fx.ownerB, () => db.query(`SELECT count(*)::int AS n FROM public.subscriptions WHERE agency_id = $1`, [fx.agencyA]))).rows[0].n)
    expect(own === 1 && other === 0, `own=${own} other-agency=${other}`)
  })

  await gatedCase('S01.71 subscription_trial_claims has RLS enabled and UNIQUE on agency_id', async () => {
    const rls = await suOne(`SELECT c.relrowsecurity AS on FROM pg_class c WHERE c.oid = 'public.subscription_trial_claims'::regclass`)
    expect(rls && rls.on === true, 'RLS not enabled on subscription_trial_claims')
    const uq = await su(
      `SELECT i.indisunique, a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'public.subscription_trial_claims'::regclass AND i.indisunique AND i.indnatts = 1`
    )
    expect(uq.rows.some((r) => r.attname === 'agency_id'), 'no single-column UNIQUE index on agency_id')
  })

  // =========================================================================
  // G. Trial rules (section 7)
  // =========================================================================
  await gatedCase('S01.72 the owner of an approved agency with no subscription starts a trial (ok true)', async () => {
    expectOk(await callAs(fx.ownerB, TRIAL_SQL), 'owner B start trial')
  })

  await gatedCase('S01.73 the trial row is Starter, status trial, linked to agency B, ending 14 days from now', async () => {
    const r = await suOne(
      `SELECT s.status, s.agency_id, p.name AS plan,
              (abs(extract(epoch FROM (s.trial_end - (now() + interval '14 days')))) < 60) AS ends_14d
         FROM public.subscriptions s JOIN public.subscription_plans p ON p.id = s.plan_id
        WHERE s.agency_id = $1`,
      [fx.agencyB]
    )
    expect(r, 'no subscription row for agency B')
    expect(r.status === 'trial' && r.plan === 'Starter' && r.agency_id === fx.agencyB && r.ends_14d === true, JSON.stringify(r))
  })

  await gatedCase('S01.74 entitlement after the trial: plan starter, limits trucks 3, staff 2, drivers 6, orders 50, can_write true', async () => {
    const v = (await callAs(fx.ownerB, ENT_SQL)).value
    const l = v.limits || {}
    expect(v.status === 'trial' && v.plan_tier === 'starter' && v.can_write === true, JSON.stringify(v))
    expect(l.trucks === 3 && l.staff === 2 && l.drivers === 6 && l.orders_month === 50, `limits=${JSON.stringify(l)}`)
  })

  await gatedCase('S01.75 a second trial call by the same owner replies trial_already_claimed', async () => {
    expectReply(await callAs(fx.ownerB, TRIAL_SQL), 'trial_already_claimed')
  })

  await gatedCase('S01.76 an approved agency with the same GSTIN as B gets trial_already_claimed', async () => {
    expectReply(await callAs(fx.ownerD, TRIAL_SQL), 'trial_already_claimed')
  })

  await gatedCase('S01.77 an approved agency with the same normalised phone as B gets trial_already_claimed', async () => {
    expectReply(await callAs(fx.ownerC, TRIAL_SQL), 'trial_already_claimed')
  })

  await gatedCase('S01.78 staff of any scope get forbidden_scope from start_trial (viewer and dispatcher)', async () => {
    await gather([
      ['viewer', async () => expectReply(await callAs(fx.viewerA, TRIAL_SQL), 'forbidden_scope')],
      ['dispatcher', async () => expectReply(await callAs(fx.dispatcherA, TRIAL_SQL), 'forbidden_scope')],
    ])
  })

  await gatedCase('S01.79 the owner of a suspended agency is refused and gets no trial row', async () => {
    const res = await callAs(fx.ownerS, TRIAL_SQL)
    expectRefusal(res, 'suspended owner start trial')
    expect((await countSubs(fx.agencyS)) === 0, 'a trial row was created for the suspended agency')
  })

  await gatedCase('S01.80 the owner of a pending (unapproved) agency is refused and gets no trial row', async () => {
    const res = await callAs(fx.ownerP, TRIAL_SQL)
    expectRefusal(res, 'unapproved owner start trial')
    expect((await countSubs(fx.agencyP)) === 0, 'a trial row was created for the unapproved agency')
  })

  await gatedCase('S01.81 a user with no agency profile is refused start_trial', async () => {
    expectRefusal(await callAs(fx.noAgency, TRIAL_SQL), 'no-agency start trial')
  })

  await gatedCase('S01.82 exactly one trial claim exists for agency B', async () => {
    const n = Number((await su(`SELECT count(*)::int AS n FROM public.subscription_trial_claims WHERE agency_id = $1`, [fx.agencyB])).rows[0].n)
    expect(n === 1, `claims for B=${n}`)
  })

  await gatedCase('S01.83 refused trial attempts (C same phone, D same GSTIN, second call) created no subscription rows', async () => {
    const counts = await Promise.all([countSubs(fx.agencyC), countSubs(fx.agencyD)])
    expect(counts[0] === 0 && counts[1] === 0, `subscription rows: C=${counts[0]} D=${counts[1]}`)
  })

  await gatedCase('S01.84 a viewer start_trial on approved agency A creates no row and agency A keeps its single subscription', async () => {
    await callAs(fx.viewerA, TRIAL_SQL)
    expect((await countSubs(fx.agencyA)) === 1, `agency A subscription rows=${await countSubs(fx.agencyA)}`)
  })

  // =========================================================================
  // G. Opus review fixes (appended): usage writes, legacy row, identity, claims, grants, orders
  // =========================================================================
  const usageOfA = async () =>
    (await su(`SELECT shipments_used, api_calls_used FROM public.usage_tracking WHERE subscription_id = $1 AND period_start <= now() AND period_end > now()`, [fx.subA])).rows[0]
  const incSql = (u, r, n) => asActor(u, () => db.query(`SELECT public.increment_usage($1::uuid, $2, $3::int)`, [u, r, n]))

  await gatedCase('S01.85 a viewer and a finance member cannot move the agency usage counters (increment_usage)', async () => {
    const before = await usageOfA()
    expect(before, 'agency A has no current usage_tracking row')
    for (const u of [fx.viewerA, fx.financeA]) {
      try { await incSql(u, 'shipments', 5) } catch { /* a raised refusal is also acceptable */ }
    }
    const after = await usageOfA()
    expect(after.shipments_used === before.shipments_used, `shipments_used ${before.shipments_used} -> ${after.shipments_used}`)
  })

  await gatedCase('S01.86 the owner and a dispatcher / fleet_manager can increment agency usage', async () => {
    const before = await usageOfA()
    await incSql(fx.ownerA, 'api_calls', 2)
    await incSql(fx.dispatcherA, 'api_calls', 3)
    await incSql(fx.fleetA, 'api_calls', 4)
    const after = await usageOfA()
    expect(after.api_calls_used === before.api_calls_used + 9, `api_calls_used ${before.api_calls_used} -> ${after.api_calls_used}`)
  })

  await gatedCase('S01.87 increment_usage rejects amounts outside 1..1000 and unknown resources, counters unchanged', async () => {
    const before = await usageOfA()
    await expectRaises(incSql(fx.ownerA, 'shipments', -5), 'between 1 and 1000')
    await expectRaises(incSql(fx.ownerA, 'shipments', 0), 'between 1 and 1000')
    await expectRaises(incSql(fx.ownerA, 'shipments', 1001), 'between 1 and 1000')
    await expectRaises(incSql(fx.ownerA, 'bogus', 1), 'Unknown usage resource')
    const after = await usageOfA()
    expect(after.shipments_used === before.shipments_used && after.api_calls_used === before.api_calls_used, JSON.stringify({ before, after }))
  })

  await gatedCase('S01.88 a no-agency legacy row does not entitle a user who owns an agency or is active staff', async () => {
    const owner = await createUser('s1-g-owner')
    await createAgencyRow(owner, 'S1 G', 'approved', { phone: '9333333331' })
    await insertSub({ agencyId: null, userId: owner, status: 'active' })
    const staffUser = await createUser('s1-g-staff')
    await su(`INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status) VALUES ($1, $2, $3, 'viewer', 'active')`, [uid(), fx.agencyA, staffUser])
    await insertSub({ agencyId: null, userId: staffUser, status: 'active' })
    const plan = (u) => asActor(u, () => db.query(`SELECT plan_name FROM public.get_user_plan($1::uuid)`, [u]))
    expect((await plan(owner)).rows.length === 0, 'owner of an agency was entitled by a NULL-agency row')
    const staffRows = (await plan(staffUser)).rows
    expect(staffRows.length === 1, `staff rows=${staffRows.length} (must read the agency row only)`)
    const active = await asActor(staffUser, () => db.query(`SELECT public.has_active_subscription($1::uuid) AS r`, [staffUser]))
    expect(active.rows[0].r === true, 'staff of agency A with an active agency subscription is entitled via the agency')
  })

  await gatedCase('S01.89 the owner of a suspended agency is not entitled by the legacy wrappers', async () => {
    await insertSub({ agencyId: fx.agencyS, userId: fx.ownerS, status: 'active' })
    const plan = await asActor(fx.ownerS, () => db.query(`SELECT plan_name FROM public.get_user_plan($1::uuid)`, [fx.ownerS]))
    expect(plan.rows.length === 0, `suspended owner rows=${plan.rows.length}`)
    const staff = await asActor(fx.staffS, () => db.query(`SELECT plan_name FROM public.get_user_plan($1::uuid)`, [fx.staffS]))
    expect(staff.rows.length === 0, `suspended staff rows=${staff.rows.length}`)
  })

  await gatedCase('S01.90 start_trial returns identity_required for no identifier, a malformed GSTIN and a short phone', async () => {
    const cases = [
      ['none', null, null],
      ['bad gstin', 'NOTAGSTIN', '9333333332'],
      ['short phone', '28AAAPL1234C1Z5', '12345'],
    ]
    for (const [label, gstin, phone] of cases) {
      const { owner, agency } = await freshAgency('s1-id')
      await su(`UPDATE public.transport_agencies SET gstin = $2, contact_phone = $3 WHERE id = $1`, [agency, gstin, phone])
      const res = await callAs(owner, TRIAL_SQL)
      if (!(!res.raised && res.value && res.value.ok === false && res.value.error === 'identity_required')) {
        throw new Error(`${label}: expected identity_required, got ${describeReply(res)}`)
      }
      expect((await countSubs(agency)) === 0, `${label}: a subscription row was created`)
    }
  })

  await gatedCase('S01.91 start_trial still works with a valid GSTIN only or a valid 10-digit phone only', async () => {
    const a = await freshAgency('s1-id-g')
    await su(`UPDATE public.transport_agencies SET gstin = '19ABCDE9991F1Z5', contact_phone = NULL WHERE id = $1`, [a.agency])
    expectOk(await callAs(a.owner, TRIAL_SQL), 'gstin only')
    const b = await freshAgency('s1-id-p')
    await su(`UPDATE public.transport_agencies SET gstin = NULL, contact_phone = '+91 99999-12345' WHERE id = $1`, [b.agency])
    expectOk(await callAs(b.owner, TRIAL_SQL), 'phone only')
  })

  await gatedCase('S01.92 backfill recorded a trial claim for every attached legacy agency (la1, la4, la5)', async () => {
    const rows = (await su(`SELECT agency_id, subscription_id FROM public.subscription_trial_claims WHERE agency_id = ANY($1::uuid[])`, [[legacy.la1, legacy.la4, legacy.la5]])).rows
    expect(rows.length === 3, `claims=${rows.length}`)
    const bySub = Object.fromEntries(rows.map((r) => [r.subscription_id, r.agency_id]))
    expect(bySub[legacy.ls1] === legacy.la1 && bySub[legacy.ls2] === legacy.la4 && bySub[legacy.ls4] === legacy.la5, JSON.stringify(bySub))
  })

  await gatedCase('S01.93 backfill conflict rows keep every reason in details.reasons (multiple_agencies; no_agency)', async () => {
    const one = async (id) => (await su(`SELECT reason, details FROM public.subscription_backfill_conflicts WHERE subscription_id = $1`, [id])).rows[0]
    const r1 = await one(legacy.ls1)
    const r3 = await one(legacy.ls3)
    expect(r1 && Array.isArray(r1.details.reasons) && r1.details.reasons.includes('multiple_agencies'), JSON.stringify(r1))
    expect(r3 && Array.isArray(r3.details.reasons) && r3.details.reasons.includes('no_agency'), JSON.stringify(r3))
  })

  await gatedCase('S01.94 authenticated cannot select razorpay_*, payment_method_id or the purchaser user_id; other columns stay readable', async () => {
    const p = await suOne(
      `SELECT has_column_privilege('authenticated', 'public.subscriptions', 'razorpay_customer_id', 'SELECT') AS rc,
              has_column_privilege('authenticated', 'public.subscriptions', 'razorpay_subscription_id', 'SELECT') AS rs,
              has_column_privilege('authenticated', 'public.subscriptions', 'user_id', 'SELECT') AS uid_,
              has_column_privilege('authenticated', 'public.subscriptions', 'payment_method_id', 'SELECT') AS pm,
              has_column_privilege('authenticated', 'public.subscriptions', 'status', 'SELECT') AS st`
    )
    expect(p.rc === false && p.rs === false && p.uid_ === false && p.pm === false && p.st === true, JSON.stringify(p))
    await expectRaises(asActor(fx.ownerA, () => db.query(`SELECT razorpay_customer_id FROM public.subscriptions WHERE agency_id = $1`, [fx.agencyA])), 'permission denied')
    const ok = await asActor(fx.viewerA, () => db.query(`SELECT status FROM public.subscriptions WHERE agency_id = $1`, [fx.agencyA]))
    expect(ok.rows.length === 1, `viewer status rows=${ok.rows.length}`)
  })

  await gatedCase('S01.95 service_role has no EXECUTE on agency_subscription_entitlement; authenticated keeps it', async () => {
    const r = await suOne(
      `SELECT has_function_privilege('service_role', 'public.agency_subscription_entitlement()', 'EXECUTE') AS svc,
              has_function_privilege('authenticated', 'public.agency_subscription_entitlement()', 'EXECUTE') AS auth_`
    )
    expect(r.svc === false && r.auth_ === true, JSON.stringify(r))
  })

  await gatedCase('S01.96 usage.orders_month excludes cancelled orders', async () => {
    const before = (await callAs(fx.ownerA, ENT_SQL)).value.usage.orders_month
    const agr = (await suOne(`SELECT id FROM public.agency_client_agreements WHERE agency_id = $1 LIMIT 1`, [fx.agencyA])).id
    await su(
      `INSERT INTO public.agency_orders (id, agency_id, agreement_id, client_order_ref, status, version, created_at)
       VALUES ($1, $2, $3, 'S1-ORD-CANCELLED', 'cancelled', 1, now())`,
      [uid(), fx.agencyA, agr]
    )
    const after = (await callAs(fx.ownerA, ENT_SQL)).value.usage.orders_month
    expect(after === before, `orders_month ${before} -> ${after} after a cancelled order`)
  })

  // =========================================================================
  // H. Status machine guard (appended): enforced for service_role, superuser fixtures exempt
  // =========================================================================
  const machineSub = async (status, extra = {}) => {
    const { owner, agency } = await freshAgency('s1-machine')
    const id = await insertSub({ agencyId: agency, userId: owner, status: 'active' })
    if (status !== 'active') {
      await su(
        `UPDATE public.subscriptions SET status = $2, trial_end = $3::timestamptz, grace_end = $4::timestamptz WHERE id = $1`,
        [id, status, status === 'trial' ? new Date(Date.now() + 86400e3).toISOString() : null, status === 'grace' ? new Date(Date.now() + 86400e3).toISOString() : null]
      )
    }
    return id
  }
  const svcSet = async (id, status, { paid = false, graceEnd = null } = {}) => {
    await db.exec('RESET ROLE')
    await db.exec('BEGIN')
    try {
      await db.exec('SET LOCAL ROLE service_role')
      if (paid) await db.query(`SELECT set_config('app.subscription_paid', 'on', true)`)
      await db.query(`UPDATE public.subscriptions SET status = $2, grace_end = $3::timestamptz WHERE id = $1`, [id, status, graceEnd])
      await db.exec('COMMIT')
    } catch (error) {
      await db.exec('ROLLBACK')
      throw error
    } finally {
      await actAsService()
    }
  }
  const statusOf = async (id) => (await suOne(`SELECT status FROM public.subscriptions WHERE id = $1`, [id])).status
  const GRACE = new Date(Date.now() + 5 * 86400e3).toISOString()

  await gatedCase('S01.97 service_role: legal transitions pass (trial>active, active>past_due, past_due>grace, grace>expired)', async () => {
    const t = await machineSub('trial')
    await svcSet(t, 'active')
    expect((await statusOf(t)) === 'active', 'trial>active')
    await svcSet(t, 'past_due')
    expect((await statusOf(t)) === 'past_due', 'active>past_due')
    await svcSet(t, 'grace', { graceEnd: GRACE })
    expect((await statusOf(t)) === 'grace', 'past_due>grace')
    await svcSet(t, 'expired')
    expect((await statusOf(t)) === 'expired', 'grace>expired')
    const t2 = await machineSub('trial')
    await svcSet(t2, 'expired')
    expect((await statusOf(t2)) === 'expired', 'trial>expired')
  })

  await gatedCase('S01.98 service_role: illegal transitions raise and leave the status unchanged', async () => {
    const bad = [
      ['active', 'trial'], ['active', 'expired'], ['past_due', 'trial'], ['grace', 'past_due'],
      ['trial', 'past_due'], ['trial', 'grace'], ['expired', 'grace'], ['expired', 'past_due'],
    ]
    const failures = []
    for (const [from, to] of bad) {
      const id = await machineSub(from)
      try {
        await svcSet(id, to, { graceEnd: GRACE })
        failures.push(`${from}>${to} accepted`)
      } catch (error) {
        if (!/not allowed/.test(firstLine(error))) failures.push(`${from}>${to}: ${firstLine(error)}`)
      }
      if ((await statusOf(id)) !== from) failures.push(`${from}>${to} changed status`)
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await gatedCase('S01.99 service_role: reactivation to active needs a paid order (past_due, grace, expired)', async () => {
    for (const from of ['past_due', 'grace', 'expired']) {
      const id = await machineSub(from)
      await expectRaises(svcSet(id, 'active'), 'not allowed')
      await svcSet(id, 'active', { paid: true })
      expect((await statusOf(id)) === 'active', `${from}>active (paid)`)
    }
  })

  await gatedCase('S01.100 service_role: any live status can be cancelled; nothing leaves cancelled', async () => {
    for (const from of ['trial', 'active', 'past_due', 'grace']) {
      const id = await machineSub(from)
      await svcSet(id, 'cancelled')
      expect((await statusOf(id)) === 'cancelled', `${from}>cancelled`)
      for (const to of ['active', 'trial', 'expired']) {
        await expectRaises(svcSet(id, to, { paid: true, graceEnd: GRACE }), 'cancelled subscription cannot change status')
      }
    }
    const e = await machineSub('expired')
    await expectRaises(svcSet(e, 'cancelled'), 'not allowed')
  })

  await gatedCase('S01.101 shape CHECK: current_period_end must be after current_period_start', async () => {
    const { owner, agency } = await freshAgency('s1-shape')
    const ins = (status, pd) =>
      su(
        `INSERT INTO public.subscriptions (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
         VALUES ($1, $2, $3, (SELECT id FROM public.subscription_plans WHERE name = 'Starter'), $4, 'monthly', now(), now() + make_interval(days => $5::int))`,
        [uid(), owner, agency, status, pd]
      )
    await expectRaises(ins('active', 0), 'violates check constraint')
    await ins('active', 5)
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
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

  try {
    await seedLegacy()
  } catch (error) {
    legacyError = firstLine(error)
  }

  if (MIGRATION_PRESENT) {
    try {
      await applyFiles([MIGRATION_FILE])
      migrationApplied = true
    } catch (error) {
      migrationError = firstLine(error)
    }
  }

  if (migrationApplied && !legacyError) {
    try {
      await setupPostMigration()
      fixturesReady = true
    } catch (error) {
      fixtureError = firstLine(error)
    }
  }

  await runCases()

  // Summary
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
