#!/usr/bin/env node
/**
 * Sweep resilience (20261046) - PGlite battery, red-first.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). Replays the whole supabase/migrations chain
 * and drives public.run_subscription_sweeps(p_as_of) as service_role, like the scheduler.
 *
 * Contract: one subscription that cannot be moved (legacy row whose period end equals its start violates the
 * NOT VALID subscriptions_period_order_check on UPDATE) must not fail the whole sweep. Every other due row still
 * moves, the run reports failed = N, and subscription_sweep_runs.failures names each row (id, attempted
 * transition, SQLSTATE, message <= 200 chars, at most 50 entries). A rerun is idempotent. With no bad row the
 * outcome equals the pre-20261046 function (differential case against the 20261031 body, run in the same txn).
 *
 * Red-first: SWEEP_SKIP_NEW=1 replays the chain WITHOUT 20261046000000 so the cases show the bug.
 *
 * Usage:  node scripts/sweep_resilience.db.test.mjs   (from the repo root)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const NEW_FILE = '20261046000000_sweep_resilience_and_invoice_rule.sql'
const OLD_SWEEP_FILE = '20261031000000_subscription_sweeps.sql'
const SKIP_NEW = process.env.SWEEP_SKIP_NEW === '1'

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' - run `npm ci` in frontend/ first.')
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
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`)
}
function expect(cond, message) {
  if (!cond) throw new Error(message)
}
function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split(/\r?\n/)[0].split(' [SQL:')[0].trim()
}
function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}
async function testCase(name, fn) {
  try {
    await fn()
    record(name, true)
  } catch (error) {
    record(name, false, error && error.message ? error.message.split(/\r?\n/)[0].slice(0, 240) : String(error))
  }
}

const DAY = 86400
const X = Date.parse('2026-12-01T00:00:00Z')
const iso = (sec) => new Date(X + sec * 1000).toISOString()
const AS_OF = iso(0)

let seq = 0
let agencySeq = 0
const uid = () => `00000000-0000-4000-9100-${String(++seq).padStart(12, '0')}`

/** Empty claims: the bootstrap's auth.uid() casts the claim, so '' is a hard error. */
async function resetClaims() {
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
}

async function su(sql, params = []) {
  await db.exec('RESET ROLE')
  await resetClaims()
  return db.query(sql, params)
}

async function one(sql, params = []) {
  return (await db.query(sql, params)).rows[0]
}

async function rows(sql, params = []) {
  return (await db.query(sql, params)).rows
}

async function asRole(role) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role })])
  await db.exec(`SET ROLE ${role}`)
}

/** Runs one statement inside a savepoint; returns its first error line, or null on success. */
async function attempt(sql, params = []) {
  await db.exec('SAVEPOINT attempt_sp')
  try {
    await db.query(sql, params)
    await db.exec('RELEASE SAVEPOINT attempt_sp')
    return null
  } catch (error) {
    await db.exec('ROLLBACK TO SAVEPOINT attempt_sp')
    await db.exec('RELEASE SAVEPOINT attempt_sp')
    return firstLine(error)
  }
}

/** The sweep, called the way the scheduler calls it: service_role, no caller identity. */
async function sweep(asOf = AS_OF) {
  await asRole('service_role')
  try {
    const result = await db.query(`SELECT public.run_subscription_sweeps($1::timestamptz) AS r`, [asOf])
    return parseJson(result.rows[0].r)
  } finally {
    await db.exec('RESET ROLE')
  }
}

/** Service-level mutation WITHOUT the paid flag (cancellation, simulated expiry). */
async function asService(sql, params = []) {
  await asRole('service_role')
  try {
    await db.query(sql, params)
  } finally {
    await db.exec('RESET ROLE')
  }
}

/** Service-level mutation WITH the transaction-local paid flag (simulated concurrent activation). */
async function asServicePaid(sql, params = []) {
  await asRole('service_role')
  try {
    await db.query(`SELECT set_config('app.subscription_paid', 'on', true)`)
    await db.query(sql, params)
    await db.query(`SELECT set_config('app.subscription_paid', '', true)`)
  } finally {
    await db.exec('RESET ROLE')
  }
}

async function account() {
  const userId = uid()
  const email = `sub-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)`, [userId, email])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [userId, email])
  const agencyId = uid()
  agencySeq += 1
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', 'approved', $4, $5)`,
    [
      agencyId,
      userId,
      `Sweep Transport ${agencySeq}`,
      `07ABCDE${String(1000 + agencySeq).padStart(4, '0')}A1Z5`,
      `ABCDE${String(4000 + agencySeq).padStart(4, '0')}Q`,
    ]
  )
  return { userId, agencyId }
}

/** One subscription row, seeded by the superuser. Each row gets its own agency (one live row per agency). */
async function sub(acc, { status, periodEnd, trialEnd = null, graceEnd = null }) {
  const id = uid()
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, grace_end)
     VALUES ($1, $2, $3, (SELECT id FROM public.subscription_plans WHERE name = 'Starter'), $4, 'monthly',
             $5::timestamptz - interval '30 days', $5::timestamptz, $6::timestamptz, $7::timestamptz)`,
    [id, acc.userId, acc.agencyId, status, periodEnd, trialEnd, graceEnd]
  )
  return id
}

const trialSub = (acc, sec) => sub(acc, { status: 'trial', periodEnd: iso(sec), trialEnd: iso(sec) })
const liveSub = (acc, status, sec) => sub(acc, { status, periodEnd: iso(sec) })
const graceSub = (acc, sec, graceSec) => sub(acc, { status: 'grace', periodEnd: iso(sec), graceEnd: iso(graceSec) })

async function subState(id) {
  return one(
    `SELECT status, version, current_period_end::text AS pe, trial_end::text AS te, grace_end::text AS ge
     FROM public.subscriptions WHERE id = $1`,
    [id]
  )
}

async function kindsFor(id) {
  return (await rows(`SELECT kind FROM public.subscription_reminders WHERE subscription_id = $1 ORDER BY kind`, [id])).map(
    (r) => r.kind
  )
}

async function snapshot() {
  const map = {}
  for (const r of await rows(
    `SELECT id, status, version, current_period_end::text AS pe, trial_end::text AS te, grace_end::text AS ge
     FROM public.subscriptions`
  )) {
    map[r.id] = r
  }
  return map
}

function sameSnapshot(a, b) {
  const keys = Object.keys(a).sort()
  return JSON.stringify(keys.map((k) => a[k])) === JSON.stringify(Object.keys(b).sort().map((k) => b[k]))
}

async function mixedFixture() {
  return {
    trialPast: await trialSub(await account(), -1),
    activePast: await liveSub(await account(), 'active', -1),
    activePast2: await liveSub(await account(), 'active', -1),
    pastDuePast: await liveSub(await account(), 'past_due', -1),
    graceDone: await graceSub(await account(), -8 * DAY, -DAY),
    activeFuture: await liveSub(await account(), 'active', DAY),
    trialFuture: await trialSub(await account(), DAY),
    graceOpen: await graceSub(await account(), -2 * DAY, DAY),
    cancelledPast: await sub(await account(), { status: 'cancelled', periodEnd: iso(-1) }),
    expiredOld: await sub(await account(), { status: 'expired', periodEnd: iso(-8 * DAY) }),
  }
}


// ---------------------------------------------------------------------------
// Poisoned rows: reproduce the legacy case. The period CHECK is NOT VALID, so a row whose end equals its start can
// only exist if it predates the constraint; the fixture drops the constraint, inserts the row, and re-adds it NOT
// VALID, exactly the state the rehearsal found. Always called inside a rolled-back transaction.
// ---------------------------------------------------------------------------
async function poisonedSub(acc, { status, periodEnd, trialEnd = null, graceEnd = null }) {
  const id = uid()
  await su(`ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_period_order_check`)
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, grace_end)
     VALUES ($1, $2, $3, (SELECT id FROM public.subscription_plans WHERE name = 'Starter'), $4, 'monthly',
             $5::timestamptz, $5::timestamptz, $6::timestamptz, $7::timestamptz)`,
    [id, acc.userId, acc.agencyId, status, periodEnd, trialEnd, graceEnd]
  )
  await su(
    `ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_period_order_check
       CHECK (current_period_end > current_period_start) NOT VALID`
  )
  return id
}

async function lastRun() {
  return one(
    `SELECT failed, failures, trials_expired, grace_started, grace_expired, result
     FROM public.subscription_sweep_runs ORDER BY started_at DESC, id LIMIT 1`
  )
}

async function txCase(name, fn) {
  return testCase(name, async () => {
    await db.exec('RESET ROLE')
    await db.exec('BEGIN')
    try {
      await fn()
    } finally {
      await db.exec('ROLLBACK')
      await db.exec('RESET ROLE')
      await resetClaims()
    }
  })
}

/** The 20261031 function under another name, so the same txn can run old and new on identical rows. */
function legacySweepSql() {
  const text = readFileSync(join(MIGRATIONS_DIR, OLD_SWEEP_FILE), 'utf8')
  const a = text.indexOf('CREATE OR REPLACE FUNCTION public.run_subscription_sweeps')
  const b = text.indexOf('$$;', text.indexOf('AS $$', a)) + 3
  return text.slice(a, b).replace('public.run_subscription_sweeps', 'public.run_subscription_sweeps_legacy')
}

async function stateDump() {
  const subs = await rows(
    `SELECT id, status, version, current_period_end::text AS pe, trial_end::text AS te, grace_end::text AS ge
     FROM public.subscriptions ORDER BY id`
  )
  const rem = await rows(
    `SELECT subscription_id, kind, period_end::text AS pe FROM public.subscription_reminders ORDER BY subscription_id, kind, period_end`
  )
  return JSON.stringify({ subs, rem })
}

async function runCases() {
  await testCase('P01. subscription_sweep_runs has failed INTEGER NOT NULL DEFAULT 0 and failures JSONB NOT NULL DEFAULT []', async () => {
    const cols = await rows(
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'subscription_sweep_runs' AND column_name IN ('failed', 'failures')
       ORDER BY column_name`
    )
    expect(cols.length === 2, `columns found: ${cols.map((c) => c.column_name).join(',') || 'none'}`)
    const f = cols.find((c) => c.column_name === 'failed')
    const g = cols.find((c) => c.column_name === 'failures')
    expect(f.data_type === 'integer' && f.is_nullable === 'NO' && /^0/.test(f.column_default), `failed: ${JSON.stringify(f)}`)
    expect(g.data_type === 'jsonb' && g.is_nullable === 'NO' && /\[\]/.test(g.column_default), `failures: ${JSON.stringify(g)}`)
  })

  await txCase('P02. one poisoned active row: every other due row still moves, failed = 1, the row is named in failures', async () => {
    const f = await mixedFixture()
    const bad = await poisonedSub(await account(), { status: 'active', periodEnd: iso(-1) })
    const r = await sweep(AS_OF)
    expect(r.ok === true, `result ${JSON.stringify(r)}`)
    expect(r.failed === 1, `failed ${r.failed}`)
    expect((await subState(f.trialPast)).status === 'expired', 'trial not expired')
    expect((await subState(f.activePast)).status === 'grace', 'activePast not moved')
    expect((await subState(f.activePast2)).status === 'grace', 'activePast2 not moved')
    expect((await subState(f.pastDuePast)).status === 'grace', 'pastDuePast not moved')
    expect((await subState(f.graceDone)).status === 'expired', 'graceDone not expired')
    expect((await subState(f.activeFuture)).status === 'active', 'future active touched')
    expect((await subState(bad)).status === 'active', 'poisoned row changed')
    expect(r.trials_expired === 1 && r.grace_started === 3 && r.grace_expired === 1, `counts ${JSON.stringify(r)}`)
    const run = await lastRun()
    expect(run.failed === 1, `stored failed ${run.failed}`)
    const failures = parseJson(run.failures)
    expect(Array.isArray(failures) && failures.length === 1, `failures ${JSON.stringify(failures)}`)
    expect(failures[0].subscription_id === bad, `failure id ${failures[0].subscription_id}`)
    expect(failures[0].transition === 'active>grace', `transition ${failures[0].transition}`)
    expect(failures[0].sqlstate === '23514', `sqlstate ${failures[0].sqlstate}`)
    expect(
      /subscriptions_period_order_check/.test(failures[0].message) && failures[0].message.length <= 200,
      `message ${failures[0].message}`
    )
    expect(parseJson(run.result).failed === 1, 'result jsonb lacks failed')
  })

  await txCase('P03. a second run is idempotent: nothing else moves, the poisoned row is reported again, more_pending stays false', async () => {
    await mixedFixture()
    await poisonedSub(await account(), { status: 'active', periodEnd: iso(-1) })
    const r1 = await sweep(AS_OF)
    const s1 = await stateDump()
    const r2 = await sweep(AS_OF)
    const s2 = await stateDump()
    expect(r1.failed === 1 && r2.failed === 1, `failed ${r1.failed} / ${r2.failed}`)
    expect(
      r2.trials_expired === 0 && r2.grace_started === 0 && r2.grace_expired === 0 && r2.reminders_created === 0,
      `rerun counts ${JSON.stringify(r2)}`
    )
    expect(r1.more_pending === false && r2.more_pending === false, `more_pending ${r1.more_pending} / ${r2.more_pending}`)
    expect(s1 === s2, 'rows or reminders changed on the rerun')
  })

  await txCase('P04. a poisoned trial row reports trial>expired and a poisoned grace row reports grace>expired', async () => {
    const good = await trialSub(await account(), -1)
    const badTrial = await poisonedSub(await account(), { status: 'trial', periodEnd: iso(-DAY), trialEnd: iso(-1) })
    const badGrace = await poisonedSub(await account(), { status: 'grace', periodEnd: iso(-8 * DAY), graceEnd: iso(-DAY) })
    const goodGrace = await graceSub(await account(), -8 * DAY, -DAY)
    const r = await sweep(AS_OF)
    expect(r.failed === 2, `failed ${r.failed}`)
    expect((await subState(good)).status === 'expired' && (await subState(goodGrace)).status === 'expired', 'good rows not moved')
    expect((await subState(badTrial)).status === 'trial' && (await subState(badGrace)).status === 'grace', 'poisoned rows changed')
    const failures = parseJson((await lastRun()).failures)
    const byId = Object.fromEntries(failures.map((x) => [x.subscription_id, x.transition]))
    expect(byId[badTrial] === 'trial>expired' && byId[badGrace] === 'grace>expired', `transitions ${JSON.stringify(byId)}`)
  })

  await txCase('P05. failures is capped at 50 entries while failed counts every row', async () => {
    for (let i = 0; i < 55; i += 1) await poisonedSub(await account(), { status: 'active', periodEnd: iso(-1) })
    const good = await liveSub(await account(), 'active', -1)
    const r = await sweep(AS_OF)
    expect(r.failed === 55, `failed ${r.failed}`)
    expect((await subState(good)).status === 'grace', 'good row not moved')
    const run = await lastRun()
    expect(run.failed === 55 && parseJson(run.failures).length === 50, `stored failed ${run.failed}, entries ${parseJson(run.failures).length}`)
    expect(r.more_pending === false, 'failed rows must not keep more_pending true')
  })

  await txCase('P06. no bad rows: failed = 0, failures = [], same counts as the existing battery expects', async () => {
    await mixedFixture()
    const r = await sweep(AS_OF)
    expect(r.failed === 0, `failed ${r.failed}`)
    expect(r.trials_expired === 1 && r.grace_started === 3 && r.grace_expired === 1, `counts ${JSON.stringify(r)}`)
    expect(r.more_pending === false, `more_pending ${r.more_pending}`)
    const run = await lastRun()
    expect(run.failed === 0 && parseJson(run.failures).length === 0, `stored ${run.failed} / ${JSON.stringify(run.failures)}`)
  })

  await txCase('P07. differential: with no bad row the new function ends in the same rows and reminders as the 20261031 function', async () => {
    await db.exec(legacySweepSql())
    await db.exec(`GRANT EXECUTE ON FUNCTION public.run_subscription_sweeps_legacy(timestamptz) TO service_role`)
    await mixedFixture()
    // Reminder-bearing rows: trial ending in 3 days, active ending in 1 day, grace on its day 5.
    await trialSub(await account(), 3 * DAY - 60)
    await liveSub(await account(), 'active', DAY - 60)
    await graceSub(await account(), -5 * DAY, 2 * DAY)
    await db.exec('SAVEPOINT diff')
    await asRole('service_role')
    const legacy = parseJson((await db.query(`SELECT public.run_subscription_sweeps_legacy($1::timestamptz) AS r`, [AS_OF])).rows[0].r)
    await db.exec('RESET ROLE')
    const legacyState = await stateDump()
    await db.exec('ROLLBACK TO SAVEPOINT diff')
    const current = await sweep(AS_OF)
    const currentState = await stateDump()
    for (const k of ['trials_expired', 'grace_started', 'grace_expired', 'reminders_created', 'more_pending']) {
      expect(legacy[k] === current[k], `${k}: legacy ${legacy[k]} vs new ${current[k]}`)
    }
    expect(current.reminders_created > 0, 'fixture produced no reminders; the comparison would be weak')
    expect(legacyState === currentState, 'rows or reminders differ between the old and the new function')
  })

  await txCase('P08. execute stays service_role only (anon and authenticated refused), SECURITY DEFINER, timezone pinned', async () => {
    const p = await one(
      `SELECT prosecdef, array_to_string(proconfig, ',') AS cfg,
              has_function_privilege('service_role', oid, 'EXECUTE') AS svc,
              has_function_privilege('authenticated', oid, 'EXECUTE') AS auth,
              has_function_privilege('anon', oid, 'EXECUTE') AS anon
       FROM pg_proc WHERE proname = 'run_subscription_sweeps' AND pronamespace = 'public'::regnamespace`
    )
    expect(p.prosecdef === true && /timezone=UTC/i.test(p.cfg) && /search_path/.test(p.cfg), `definer/config ${p.prosecdef} ${p.cfg}`)
    expect(p.svc === true && p.auth === false && p.anon === false, `grants svc ${p.svc} auth ${p.auth} anon ${p.anon}`)
  })
}

async function main() {
  await db.exec(BOOTSTRAP)
  await resetClaims()
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !(SKIP_NEW && f === NEW_FILE))
    .sort()
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    } catch (error) {
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
  console.log(`migrations replayed: ${files.length}${SKIP_NEW ? ` (SWEEP_SKIP_NEW=1: without ${NEW_FILE})` : ''}`)

  await runCases()

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed`)
  if (failed.length) {
    console.log('Failing cases:')
    for (const f of failed) console.log(`  - ${f.name}`)
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
