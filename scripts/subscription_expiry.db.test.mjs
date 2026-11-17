#!/usr/bin/env node
/**
 * Subscription sweeps (TO-152 S5) — red-first PGlite battery.
 *
 * RED BY DESIGN NOW. supabase/migrations/20261031000000_subscription_sweeps.sql does not exist,
 * so every case that needs the sweep fails with "red: migration ... is missing". Runner cases
 * W02 and W03 stay red until scripts/run-expiry-sweeps.mjs calls run_subscription_sweeps after
 * run_expiry_sweeps. W04 and W05 are regression guards and pass now.
 *
 * LEVEL: SQL on a real PostgreSQL engine (PGlite). Replays the supabase/migrations chain below the
 * sweep migration (20261026 agency subscriptions, 20261027 limits, 20261028 GST), then the sweep
 * migration. Siblings 20261029 (activation) and 20261030 (webhook) are NOT replayed and NOT depended
 * on. Each runtime case runs in a transaction that is rolled back, so counts are exact.
 *
 * Pinned reading (where the rulings are silent; the migration must match these):
 *   public.run_subscription_sweeps(p_as_of timestamptz) RETURNS jsonb. SECURITY DEFINER, search_path
 *   pinned, EXECUTE for service_role only. Returns {ok, trials_expired, grace_started, grace_expired,
 *   reminders_created, run_id}.
 *   public.subscription_sweep_runs(id, as_of, started_at, finished_at, trials_expired, grace_started,
 *   grace_expired, reminders_created, result jsonb): one row per call, even when nothing changed.
 *   Append-only: a trigger rejects UPDATE and DELETE; authenticated has no privilege on it.
 *   Boundaries are inclusive, as in expiry_sweeps (expires_at <= p_as_of):
 *     trial with trial_end <= as_of -> expired.
 *     active or past_due with current_period_end <= as_of -> grace, grace_end = current_period_end + 7 days.
 *     grace with grace_end <= as_of -> expired.
 *   Every UPDATE is status-conditional (WHERE status = the source status), so a row that a concurrent
 *   activation moved is not overwritten. Untouched rows keep their version (the S1 trigger bumps it).
 *   The only status pairs the sweep may write: trial>expired, active>grace, past_due>grace, grace>expired.
 *   The sweep is definer-owned, so the S1 guard's current_user exemption applies inside it. The battery
 *   therefore checks the pairs directly and asserts the sweep never sets app.subscription_paid.
 *   Reminders: public.subscription_reminders(id, subscription_id, period_end, kind, created_at),
 *   UNIQUE(subscription_id, period_end, kind), in-app rows only. Kinds, due instant D, and anchor A
 *   (trial_end for trial rows, current_period_end otherwise):
 *     t_minus_7: D = A-7d; t_minus_3: D = A-3d; t_minus_1: D = A-1d; t_zero: D = A;
 *     grace_day_5: D = current_period_end+5d (grace rows only).
 *   Created when D <= as_of < D+24h. Only rows whose status BEFORE this sweep is trial/active/past_due
 *   (renewal kinds) or grace (grace_day_5) qualify, and only if this sweep does not move them to
 *   expired. period_end column = anchor.
 *   Known consequence, flagged for the architect: a trial's t_zero is never written, because the trial
 *   expires at the same instant.
 *   All comparisons are absolute timestamptz, so results must not depend on the session TimeZone.
 *
 * pg_cron: job 'truckopti-subscription-sweeps', hourly ('0 * * * *'), calling
 * public.run_subscription_sweeps(), inside the same guarded DO pattern as 20261016000000.
 * Without the cron schema the migration is a no-op.
 *
 * Usage: node scripts/subscription_expiry.db.test.mjs   (from the repo root)
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
const RUNNER = join(REPO_ROOT, 'scripts', 'run-expiry-sweeps.mjs')
const SWEEP_FILE = '20261031000000_subscription_sweeps.sql'
const SIBLINGS = new Set(['20261029000000_subscription_activation.sql', '20261030000000_razorpay_webhook_events.sql'])
const SWEEP_PRESENT = existsSync(join(MIGRATIONS_DIR, SWEEP_FILE))

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

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

/** Per-case resilience: a failing assertion records FAIL and the battery keeps running. */
async function testCase(name, fn) {
  try {
    await fn()
    record(name, true)
  } catch (error) {
    const message = error && error.message ? error.message.split('\n')[0].slice(0, 240) : String(error)
    record(name, false, message)
  }
}

// ---------------------------------------------------------------------------
// Time: absolute instants. AS_OF is X; iso(sec) is X plus sec seconds (negative = before).
// ---------------------------------------------------------------------------
const DAY = 86400
const X = Date.parse('2026-12-01T00:00:00Z')
function iso(sec) {
  return new Date(X + sec * 1000).toISOString()
}
const AS_OF = iso(0)
const KINDS = ['t_minus_7', 't_minus_3', 't_minus_1', 't_zero', 'grace_day_5']
const ALLOWED_PAIRS = new Set(['trial>expired', 'active>grace', 'past_due>grace', 'grace>expired'])

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
let prefixError = ''
let migrationApplied = false
let migrationError = ''

async function applyFiles(files) {
  for (const file of files) {
    const text = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(text)
    } catch (error) {
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
}

function sweepSql() {
  if (!SWEEP_PRESENT) throw new Error(`red: migration ${SWEEP_FILE} is missing (not written yet)`)
  return readFileSync(join(MIGRATIONS_DIR, SWEEP_FILE), 'utf8')
}

function runnerText() {
  return readFileSync(RUNNER, 'utf8')
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------
let seq = 0
let agencySeq = 0
const uid = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`

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

/** Builds a row, sweeps once at asOfSec, and returns the row's state before and after. */
async function runOne(build, asOfSec = 0) {
  const id = await build()
  const before = await subState(id)
  const r = await sweep(iso(asOfSec))
  const after = await subState(id)
  return { id, before, after, r }
}

/** Reminder kinds written for one row after one sweep at asOfSec. */
async function kindsAfterSweep(build, asOfSec = 0) {
  const id = await build()
  const r = await sweep(iso(asOfSec))
  return { id, kinds: await kindsFor(id), r }
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

function gated(name, fn) {
  return testCase(name, async () => {
    if (!SWEEP_PRESENT) {
      throw new Error(`red: migration ${SWEEP_FILE} is missing, so run_subscription_sweeps does not exist yet`)
    }
    if (prefixError) throw new Error(`red: a prior migration did not replay: ${prefixError}`)
    if (!migrationApplied) throw new Error(`red: migration ${SWEEP_FILE} failed to apply: ${migrationError}`)
    await fn()
  })
}

/** A gated case in its own transaction, always rolled back. */
function txCase(name, fn) {
  return gated(name, async () => {
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

// ---------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------
async function runCases() {
  // ---- Static: files, runner, migration text (no database) -------------------------------
  await testCase('W01. migration 20261031000000_subscription_sweeps.sql exists', () => {
    expect(SWEEP_PRESENT, `red: ${SWEEP_FILE} is missing (not written yet)`)
  })
  await testCase('W02. runner scripts/run-expiry-sweeps.mjs calls run_subscription_sweeps', () => {
    expect(runnerText().includes('run_subscription_sweeps'), 'red: runner does not call run_subscription_sweeps yet')
  })
  await testCase('W03. runner calls run_subscription_sweeps after run_expiry_sweeps', () => {
    const t = runnerText()
    const a = t.indexOf('run_expiry_sweeps')
    const b = t.indexOf('run_subscription_sweeps')
    expect(a >= 0 && b > a, `red: expiry call at ${a}, subscription call at ${b}`)
  })
  await testCase('W04. runner still calls run_expiry_sweeps (regression)', () => {
    expect(runnerText().includes('run_expiry_sweeps'), 'runner lost run_expiry_sweeps')
  })
  await testCase('W05. runner reads the service key from env and never prints it (regression)', () => {
    const t = runnerText()
    expect(t.includes('SUPABASE_SERVICE_ROLE_KEY'), 'runner does not read SUPABASE_SERVICE_ROLE_KEY')
    expect(!/console\.(log|error)\([^)]*\bkey\b/.test(t), 'runner prints the key variable')
  })
  await testCase('W06. sweep function is SECURITY DEFINER with a pinned search_path (migration text)', () => {
    const t = sweepSql()
    expect(/SECURITY\s+DEFINER/i.test(t), 'no SECURITY DEFINER')
    expect(/SET\s+search_path\s*=/i.test(t), 'no pinned search_path')
  })
  await testCase('W07. EXECUTE revoked from PUBLIC, anon, authenticated and granted to service_role (migration text)', () => {
    const t = sweepSql()
    expect(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.run_subscription_sweeps\(timestamptz\)\s+FROM\s+PUBLIC,\s*anon,\s*authenticated/i.test(t),
      'missing REVOKE line'
    )
    expect(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.run_subscription_sweeps\(timestamptz\)\s+TO\s+service_role/i.test(t),
      'missing GRANT EXECUTE to service_role'
    )
  })
  await testCase('W08. the sweep migration never sets app.subscription_paid', () => {
    const t = sweepSql()
    expect(
      !/set_config\(\s*'app\.subscription_paid'/i.test(t) && !/SET\s+(LOCAL\s+)?app\.subscription_paid/i.test(t),
      'migration sets app.subscription_paid'
    )
  })
  await testCase('W09. reminders are in-app only: no outbound transport in the migration', () => {
    expect(!/pg_net|net\.http|http_post|smtp|twilio|sendgrid|whatsapp/i.test(sweepSql()), 'outbound transport referenced')
  })
  await testCase('W10. reminder table declares UNIQUE(subscription_id, period_end, kind)', () => {
    expect(/UNIQUE\s*\(\s*subscription_id\s*,\s*period_end\s*,\s*kind\s*\)/i.test(sweepSql()), 'missing unique key')
  })
  await testCase('W11. sweep log and reminder tables are created', () => {
    const t = sweepSql()
    expect(/subscription_sweep_runs/.test(t) && /subscription_reminders/.test(t), 'table names missing')
  })
  await testCase('W12. all five reminder kinds are named in the migration', () => {
    const t = sweepSql()
    for (const k of KINDS) expect(t.includes(`'${k}'`), `kind ${k} missing`)
  })
  await testCase('W13. pg_cron job is named truckopti-subscription-sweeps, hourly, guarded by pg_available_extensions', () => {
    const t = sweepSql()
    expect(t.includes("'truckopti-subscription-sweeps'"), 'job name missing')
    expect(t.includes("'0 * * * *'"), 'hourly schedule missing')
    expect(/pg_available_extensions/.test(t), 'no pg_available_extensions guard')
    expect(/run_subscription_sweeps\(\)/.test(t), 'job does not call run_subscription_sweeps()')
  })

  // ---- Runtime: the migration must exist and replay ---------------------------------------
  await gated('W14. the sweep migration replays cleanly after the prior chain', async () => {
    expect(migrationApplied, 'migration not applied')
  })
  await txCase('W15. no-op without pg_cron: the cron schema is absent and the migration did not fail', async () => {
    const r = await one(`SELECT to_regnamespace('cron')::text AS n`)
    expect(r.n === null, `cron schema exists: ${r.n}`)
  })
  await txCase('W16. run_subscription_sweeps takes (p_as_of timestamptz) and returns jsonb', async () => {
    const r = await one(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args, format_type(p.prorettype, NULL) AS ret
       FROM pg_proc p WHERE p.proname = 'run_subscription_sweeps' AND p.pronamespace = 'public'::regnamespace`
    )
    expect(r, 'function missing')
    expect(r.args === 'p_as_of timestamp with time zone', `args: ${r.args}`)
    expect(r.ret === 'jsonb', `returns ${r.ret}`)
  })
  await txCase('W17. function is SECURITY DEFINER with search_path set', async () => {
    const r = await one(
      `SELECT p.prosecdef AS d, array_to_string(p.proconfig, ',') AS c
       FROM pg_proc p WHERE p.proname = 'run_subscription_sweeps' AND p.pronamespace = 'public'::regnamespace`
    )
    expect(r, 'function missing')
    expect(r.d === true, 'not SECURITY DEFINER')
    expect(r.c !== null && /search_path=/.test(r.c), `search_path not pinned: ${r.c}`)
  })
  await txCase('W18. PUBLIC holds no EXECUTE on the function', async () => {
    const r = await one(
      `SELECT count(*)::int AS n FROM pg_proc p,
         aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
       WHERE p.proname = 'run_subscription_sweeps' AND p.pronamespace = 'public'::regnamespace
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'`
    )
    expect(r.n === 0, `PUBLIC can execute (${r.n} grant)`)
  })
  await txCase('W19. anon cannot execute the sweep (permission denied)', async () => {
    await asRole('anon')
    const err = await attempt(`SELECT public.run_subscription_sweeps($1::timestamptz)`, [AS_OF])
    await db.exec('RESET ROLE')
    expect(err && /permission denied/i.test(err), `anon call: ${err ?? 'succeeded'}`)
  })
  await txCase('W20. authenticated cannot execute the sweep (permission denied)', async () => {
    await asRole('authenticated')
    const err = await attempt(`SELECT public.run_subscription_sweeps($1::timestamptz)`, [AS_OF])
    await db.exec('RESET ROLE')
    expect(err && /permission denied/i.test(err), `authenticated call: ${err ?? 'succeeded'}`)
  })
  await txCase('W21. service_role can execute the sweep and gets ok:true', async () => {
    const r = await sweep(AS_OF)
    expect(r && r.ok === true, `service_role call: ${JSON.stringify(r)}`)
  })
  await txCase('W22. empty database: all counts 0, reply has every key, one run is logged', async () => {
    const r = await sweep(AS_OF)
    for (const k of ['ok', 'trials_expired', 'grace_started', 'grace_expired', 'reminders_created', 'run_id']) {
      expect(k in r, `missing key ${k}`)
    }
    expect(
      r.trials_expired === 0 && r.grace_started === 0 && r.grace_expired === 0 && r.reminders_created === 0,
      `counts ${JSON.stringify(r)}`
    )
    const n = await one(`SELECT count(*)::int AS n FROM public.subscription_sweep_runs`)
    expect(n.n === 1, `runs logged: ${n.n}`)
  })

  // ---- Transitions and boundaries ---------------------------------------------------------
  await txCase('W23. trial 1 second past trial_end becomes expired (version +1, grace_end stays null)', async () => {
    const { before, after } = await runOne(async () => trialSub(await account(), -1))
    expect(after.status === 'expired', `status ${after.status}`)
    expect(after.version === before.version + 1, `version ${before.version} -> ${after.version}`)
    expect(after.ge === null, `grace_end ${after.ge}`)
  })
  await txCase('W24. trial exactly at trial_end becomes expired (inclusive boundary)', async () => {
    const { after } = await runOne(async () => trialSub(await account(), 0))
    expect(after.status === 'expired', `status ${after.status}`)
  })
  await txCase('W25. trial 1 second before trial_end is untouched (same status, same version)', async () => {
    const { before, after } = await runOne(async () => trialSub(await account(), 1))
    expect(after.status === 'trial' && after.version === before.version, `${before.status} v${before.version} -> ${after.status} v${after.version}`)
  })
  await txCase('W26. active 1 second past period_end becomes grace', async () => {
    const { after } = await runOne(async () => liveSub(await account(), 'active', -1))
    expect(after.status === 'grace', `status ${after.status}`)
  })
  await txCase('W27. active exactly at period_end becomes grace (inclusive boundary)', async () => {
    const { after } = await runOne(async () => liveSub(await account(), 'active', 0))
    expect(after.status === 'grace', `status ${after.status}`)
  })
  await txCase('W28. active 1 second before period_end is untouched', async () => {
    const { before, after } = await runOne(async () => liveSub(await account(), 'active', 1))
    expect(after.status === 'active' && after.version === before.version, `${before.status} v${before.version} -> ${after.status} v${after.version}`)
  })
  await txCase('W29. past_due 1 second past period_end becomes grace', async () => {
    const { after } = await runOne(async () => liveSub(await account(), 'past_due', -1))
    expect(after.status === 'grace', `status ${after.status}`)
  })
  await txCase('W30. grace_end = current_period_end + 7 days exactly, period_end unchanged', async () => {
    const { id, before, after } = await runOne(async () => liveSub(await account(), 'active', -1))
    const d = await one(`SELECT (EXTRACT(EPOCH FROM (grace_end - current_period_end)))::float8 AS d FROM public.subscriptions WHERE id = $1`, [id])
    expect(d.d === 7 * DAY, `grace_end - period_end = ${d.d} seconds`)
    expect(after.pe === before.pe, `period_end moved ${before.pe} -> ${after.pe}`)
  })
  await txCase('W31. grace 1 second past grace_end becomes expired', async () => {
    const { after } = await runOne(async () => graceSub(await account(), -2 * DAY, -1))
    expect(after.status === 'expired', `status ${after.status}`)
  })
  await txCase('W32. grace exactly at grace_end becomes expired (inclusive boundary)', async () => {
    const { after } = await runOne(async () => graceSub(await account(), -2 * DAY, 0))
    expect(after.status === 'expired', `status ${after.status}`)
  })
  await txCase('W33. grace 1 second before grace_end is untouched', async () => {
    const { before, after } = await runOne(async () => graceSub(await account(), -2 * DAY, 1))
    expect(after.status === 'grace' && after.version === before.version, `${before.status} v${before.version} -> ${after.status} v${after.version}`)
  })
  await txCase('W34. cancelled rows are never touched, even when their dates are past', async () => {
    const f = await mixedFixture()
    const before = await snapshot()
    await sweep(AS_OF)
    const after = await snapshot()
    expect(after[f.cancelledPast].status === 'cancelled', `status ${after[f.cancelledPast].status}`)
    expect(after[f.cancelledPast].version === before[f.cancelledPast].version, 'cancelled row version changed')
  })
  await txCase('W35. expired rows are never touched', async () => {
    const f = await mixedFixture()
    const before = await snapshot()
    await sweep(AS_OF)
    const after = await snapshot()
    expect(after[f.expiredOld].status === 'expired' && after[f.expiredOld].version === before[f.expiredOld].version, 'expired row changed')
  })
  await txCase('W36. mixed fixture: exact counts (1 trial expired, 3 to grace, 1 grace expired)', async () => {
    await mixedFixture()
    const r = await sweep(AS_OF)
    expect(
      r.trials_expired === 1 && r.grace_started === 3 && r.grace_expired === 1,
      `counts ${JSON.stringify({ t: r.trials_expired, g: r.grace_started, e: r.grace_expired })}`
    )
  })
  await txCase('W37. every status change the sweep makes is a legal pair (trial>expired, active>grace, past_due>grace, grace>expired)', async () => {
    await mixedFixture()
    const before = await snapshot()
    await sweep(AS_OF)
    const after = await snapshot()
    const changed = []
    for (const id of Object.keys(before)) {
      if (before[id].status !== after[id].status) changed.push(`${before[id].status}>${after[id].status}`)
    }
    expect(changed.length === 5, `changed rows ${changed.length}: ${changed.join(', ')}`)
    for (const pair of changed) expect(ALLOWED_PAIRS.has(pair), `illegal sweep transition ${pair}`)
  })
  await txCase('W38. the sweep never leaves app.subscription_paid set (no activation is faked)', async () => {
    await mixedFixture()
    await sweep(AS_OF)
    const v = await one(`SELECT coalesce(current_setting('app.subscription_paid', true), '') AS v`)
    expect(v.v !== 'on', `app.subscription_paid = ${v.v}`)
  })
  await txCase('W39. a row a concurrent activation moved to active is not clobbered by a later sweep', async () => {
    const a = await account()
    const id = await liveSub(a, 'active', -1)
    await sweep(AS_OF)
    expect((await subState(id)).status === 'grace', 'setup: first sweep did not move the row to grace')
    await asServicePaid(
      `UPDATE public.subscriptions SET status = 'active', current_period_end = $2::timestamptz, grace_end = NULL WHERE id = $1`,
      [id, iso(30 * DAY)]
    )
    const activated = await subState(id)
    const r = await sweep(iso(DAY))
    const after = await subState(id)
    expect(after.status === 'active', `status ${after.status}`)
    expect(after.version === activated.version, `version ${activated.version} -> ${after.version}`)
    expect(r.grace_started === 0 && r.grace_expired === 0 && r.trials_expired === 0, `counts ${JSON.stringify(r)}`)
  })
  await txCase('W40. a row cancelled between two sweeps is not expired by the later one', async () => {
    const a = await account()
    const id = await graceSub(a, -2 * DAY, DAY)
    await sweep(AS_OF)
    expect((await subState(id)).status === 'grace', 'setup: grace row moved too early')
    await asService(`UPDATE public.subscriptions SET status = 'cancelled' WHERE id = $1`, [id])
    const r = await sweep(iso(2 * DAY))
    const after = await subState(id)
    expect(after.status === 'cancelled', `status ${after.status}`)
    expect(r.grace_expired === 0, `grace_expired ${r.grace_expired}`)
  })

  // ---- Idempotency and logging ------------------------------------------------------------
  await txCase('W41. running twice with the same p_as_of: the second run makes zero transitions and zero reminders', async () => {
    await mixedFixture()
    await sweep(AS_OF)
    const r2 = await sweep(AS_OF)
    expect(
      r2.trials_expired === 0 && r2.grace_started === 0 && r2.grace_expired === 0 && r2.reminders_created === 0,
      `second run ${JSON.stringify(r2)}`
    )
  })
  await txCase('W42. the second run leaves every subscription row byte-identical', async () => {
    await mixedFixture()
    await sweep(AS_OF)
    const s1 = await snapshot()
    await sweep(AS_OF)
    const s2 = await snapshot()
    expect(sameSnapshot(s1, s2), 'rows changed on the rerun')
  })
  await txCase('W43. two runs logged; exactly one of them (the rerun) has all-zero counts', async () => {
    await mixedFixture()
    await sweep(AS_OF)
    await sweep(AS_OF)
    const total = await one(`SELECT count(*)::int AS n FROM public.subscription_sweep_runs`)
    const zero = await one(
      `SELECT count(*)::int AS n FROM public.subscription_sweep_runs
       WHERE trials_expired + grace_started + grace_expired + reminders_created = 0`
    )
    expect(total.n === 2, `runs logged ${total.n}`)
    expect(zero.n === 1, `zero-count runs ${zero.n}`)
  })
  await txCase('W44. the result does not depend on the session TimeZone (UTC and Asia/Kolkata agree)', async () => {
    const fixture = async () => {
      await trialSub(await account(), -1)
      await liveSub(await account(), 'active', -1)
      await graceSub(await account(), -8 * DAY, -DAY)
    }
    const pick = (r) => [r.trials_expired, r.grace_started, r.grace_expired].join(',')
    await db.exec('SAVEPOINT tz_utc')
    await fixture()
    const utc = await sweep(AS_OF)
    await db.exec('ROLLBACK TO SAVEPOINT tz_utc')
    await db.exec("SET TIME ZONE 'Asia/Kolkata'")
    await db.exec('SAVEPOINT tz_ist')
    await fixture()
    const ist = await sweep(AS_OF)
    await db.exec('ROLLBACK TO SAVEPOINT tz_ist')
    await db.exec("SET TIME ZONE 'UTC'")
    expect(pick(utc) === pick(ist), `UTC ${pick(utc)} vs IST ${pick(ist)}`)
    expect(pick(utc) === '1,1,1', `counts ${pick(utc)}`)
  })
  await txCase('W45. the log row carries as_of equal to p_as_of', async () => {
    await mixedFixture()
    await sweep(AS_OF)
    const n = await one(`SELECT count(*)::int AS n FROM public.subscription_sweep_runs WHERE as_of = $1::timestamptz`, [AS_OF])
    expect(n.n >= 1, `no run logged with as_of ${AS_OF}`)
  })
  await txCase('W46. the log row has started_at and finished_at, finished not before started', async () => {
    await sweep(AS_OF)
    const n = await one(
      `SELECT count(*)::int AS n FROM public.subscription_sweep_runs
       WHERE started_at IS NOT NULL AND finished_at IS NOT NULL AND finished_at >= started_at`
    )
    expect(n.n >= 1, 'no complete run row')
  })
  await txCase('W47. the log row stores the same per-transition counts that the call returned', async () => {
    await mixedFixture()
    const r = await sweep(AS_OF)
    const n = await one(
      `SELECT count(*)::int AS n FROM public.subscription_sweep_runs
       WHERE trials_expired = $1 AND grace_started = $2 AND grace_expired = $3 AND reminders_created = $4`,
      [r.trials_expired, r.grace_started, r.grace_expired, r.reminders_created]
    )
    expect(n.n >= 1, `no matching run row for ${JSON.stringify(r)}`)
  })
  await txCase('W48. the log row keeps the reply in result (ok:true)', async () => {
    await sweep(AS_OF)
    const n = await one(`SELECT count(*)::int AS n FROM public.subscription_sweep_runs WHERE (result->>'ok') = 'true'`)
    expect(n.n >= 1, 'result jsonb does not carry ok:true')
  })

  // ---- Reminders --------------------------------------------------------------------------
  await txCase('W49. the five kinds are accepted and an unknown kind is refused', async () => {
    const a = await account()
    const id = await liveSub(a, 'active', DAY)
    for (const k of KINDS) {
      await su(
        `INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, $3)`,
        [id, iso(DAY), k]
      )
    }
    const err = await attempt(
      `INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, 'sms')`,
      [id, iso(2 * DAY)]
    )
    expect(err, 'kind sms was accepted')
  })
  await txCase('W50. UNIQUE(subscription_id, period_end, kind) refuses a duplicate reminder row', async () => {
    const a = await account()
    const id = await liveSub(a, 'active', DAY)
    await su(`INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, 't_minus_7')`, [id, iso(DAY)])
    const err = await attempt(
      `INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, 't_minus_7')`,
      [id, iso(DAY)]
    )
    expect(err && /duplicate key|unique/i.test(err), `duplicate accepted: ${err ?? 'no error'}`)
  })
  await txCase('W51. t_minus_7 is written at exactly anchor - 7 days (inclusive lower bound)', async () => {
    const { kinds } = await kindsAfterSweep(async () => liveSub(await account(), 'active', 7 * DAY), 0)
    expect(JSON.stringify(kinds) === '["t_minus_7"]', `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W52. t_minus_7 is not written 1 second before anchor - 7 days', async () => {
    const { kinds } = await kindsAfterSweep(async () => liveSub(await account(), 'active', 7 * DAY), -1)
    expect(kinds.length === 0, `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W53. t_minus_7 is not written at due + 24h (window is exclusive at the top)', async () => {
    const { kinds } = await kindsAfterSweep(async () => liveSub(await account(), 'active', 7 * DAY), DAY)
    expect(kinds.length === 0, `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W54. t_minus_7 is written at due + 24h - 1 second (still inside the window)', async () => {
    const { kinds } = await kindsAfterSweep(async () => liveSub(await account(), 'active', 7 * DAY), DAY - 1)
    expect(JSON.stringify(kinds) === '["t_minus_7"]', `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W55. t_minus_3 is written at exactly anchor - 3 days', async () => {
    const { kinds } = await kindsAfterSweep(async () => liveSub(await account(), 'active', 3 * DAY), 0)
    expect(JSON.stringify(kinds) === '["t_minus_3"]', `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W56. t_minus_1 is written at exactly anchor - 1 day', async () => {
    const { kinds } = await kindsAfterSweep(async () => liveSub(await account(), 'active', DAY), 0)
    expect(JSON.stringify(kinds) === '["t_minus_1"]', `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W57. t_zero is written for an active row at exactly period_end (the row moves to grace in the same sweep)', async () => {
    const { kinds, id } = await kindsAfterSweep(async () => liveSub(await account(), 'active', 0), 0)
    expect(JSON.stringify(kinds) === '["t_zero"]', `kinds ${JSON.stringify(kinds)}`)
    expect((await subState(id)).status === 'grace', 'row did not move to grace')
  })
  await txCase('W58. no t_zero for a trial: it expires at the same instant, so no reminder for an expired row', async () => {
    const { kinds, id } = await kindsAfterSweep(async () => trialSub(await account(), 0), 0)
    expect(kinds.length === 0, `kinds ${JSON.stringify(kinds)}`)
    expect((await subState(id)).status === 'expired', 'trial did not expire')
  })
  await txCase('W59. a trial reminder carries period_end = trial_end (the anchor)', async () => {
    const { id } = await kindsAfterSweep(async () => trialSub(await account(), 7 * DAY), 0)
    const n = await one(
      `SELECT count(*)::int AS n FROM public.subscription_reminders
       WHERE subscription_id = $1 AND kind = 't_minus_7' AND period_end = $2::timestamptz`,
      [id, iso(7 * DAY)]
    )
    expect(n.n === 1, `reminder rows with period_end = trial_end: ${n.n}`)
  })
  await txCase('W60. grace_day_5 is written for a grace row at exactly period_end + 5 days', async () => {
    const { kinds } = await kindsAfterSweep(async () => graceSub(await account(), -5 * DAY, 2 * DAY), 0)
    expect(JSON.stringify(kinds) === '["grace_day_5"]', `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W61. grace_day_5 is not written for an active row that this sweep moves to grace', async () => {
    const { kinds } = await kindsAfterSweep(async () => liveSub(await account(), 'active', -5 * DAY), 0)
    expect(!kinds.includes('grace_day_5'), `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W62. no reminder for a cancelled row even at a due instant', async () => {
    const { kinds } = await kindsAfterSweep(async () => sub(await account(), { status: 'cancelled', periodEnd: iso(0) }), 0)
    expect(kinds.length === 0, `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W63. no grace_day_5 for a grace row that this sweep expires', async () => {
    const { kinds, id } = await kindsAfterSweep(async () => graceSub(await account(), -5 * DAY, 0), 0)
    expect(kinds.length === 0, `kinds ${JSON.stringify(kinds)}`)
    expect((await subState(id)).status === 'expired', 'grace row did not expire')
  })
  await txCase('W64. a rerun writes no new reminder rows (created once only)', async () => {
    const id = await liveSub(await account(), 'active', 7 * DAY)
    await sweep(AS_OF)
    const r2 = await sweep(AS_OF)
    const kinds = await kindsFor(id)
    expect(r2.reminders_created === 0, `rerun reminders_created ${r2.reminders_created}`)
    expect(JSON.stringify(kinds) === '["t_minus_7"]', `kinds ${JSON.stringify(kinds)}`)
  })
  await txCase('W65. reminders_created on the first run equals the reminder rows written', async () => {
    const id = await liveSub(await account(), 'active', 7 * DAY)
    const r = await sweep(AS_OF)
    const n = await one(`SELECT count(*)::int AS n FROM public.subscription_reminders WHERE subscription_id = $1`, [id])
    expect(r.reminders_created === n.n && n.n === 1, `reminders_created ${r.reminders_created}, rows ${n.n}`)
  })

  // ---- Append-only and privileges on the log and reminder tables --------------------------
  await txCase('W66. authenticated cannot UPDATE subscription_sweep_runs (permission denied)', async () => {
    await sweep(AS_OF)
    await asRole('authenticated')
    const err = await attempt(`UPDATE public.subscription_sweep_runs SET trials_expired = 99`)
    await db.exec('RESET ROLE')
    expect(err && /permission denied/i.test(err), `UPDATE: ${err ?? 'succeeded'}`)
  })
  await txCase('W67. authenticated cannot DELETE subscription_sweep_runs (permission denied)', async () => {
    await sweep(AS_OF)
    await asRole('authenticated')
    const err = await attempt(`DELETE FROM public.subscription_sweep_runs`)
    await db.exec('RESET ROLE')
    expect(err && /permission denied/i.test(err), `DELETE: ${err ?? 'succeeded'}`)
  })
  await txCase('W68. authenticated cannot INSERT into subscription_sweep_runs (permission denied)', async () => {
    await asRole('authenticated')
    const err = await attempt(`INSERT INTO public.subscription_sweep_runs (as_of) VALUES ($1::timestamptz)`, [AS_OF])
    await db.exec('RESET ROLE')
    expect(err && /permission denied/i.test(err), `INSERT: ${err ?? 'succeeded'}`)
  })
  await txCase('W69. authenticated cannot UPDATE subscription_reminders (permission denied)', async () => {
    const id = await liveSub(await account(), 'active', DAY)
    await su(`INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, 't_minus_1')`, [id, iso(DAY)])
    await asRole('authenticated')
    const err = await attempt(`UPDATE public.subscription_reminders SET kind = 't_zero'`)
    await db.exec('RESET ROLE')
    expect(err && /permission denied/i.test(err), `UPDATE: ${err ?? 'succeeded'}`)
  })
  await txCase('W70. authenticated cannot DELETE subscription_reminders (permission denied)', async () => {
    const id = await liveSub(await account(), 'active', DAY)
    await su(`INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, 't_minus_1')`, [id, iso(DAY)])
    await asRole('authenticated')
    const err = await attempt(`DELETE FROM public.subscription_reminders`)
    await db.exec('RESET ROLE')
    expect(err && /permission denied/i.test(err), `DELETE: ${err ?? 'succeeded'}`)
  })
  await txCase('W71. the append-only trigger blocks even the superuser from UPDATE on subscription_reminders', async () => {
    const id = await liveSub(await account(), 'active', DAY)
    await su(`INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, 't_minus_1')`, [id, iso(DAY)])
    const err = await attempt(`UPDATE public.subscription_reminders SET kind = kind`)
    expect(err && /append-only/i.test(err), `UPDATE: ${err ?? 'succeeded'}`)
  })
  await txCase('W72. the append-only trigger blocks even the superuser from DELETE on subscription_sweep_runs', async () => {
    await sweep(AS_OF)
    const err = await attempt(`DELETE FROM public.subscription_sweep_runs`)
    expect(err && /append-only/i.test(err), `DELETE: ${err ?? 'succeeded'}`)
  })
  await txCase('W73. the sweep migration is re-runnable (idempotent DDL)', async () => {
    await applyFiles([SWEEP_FILE])
  })
  // ---- W74+: review fixes (appended) -----------------------------------------------------
  await txCase('W74. a grace row with NULL grace_end expires once period end + 168 hours has passed', async () => {
    const id = await sub(await account(), { status: 'grace', periodEnd: iso(-8 * DAY), graceEnd: null })
    const live = await sub(await account(), { status: 'grace', periodEnd: iso(-6 * DAY), graceEnd: null })
    const r = await sweep(AS_OF)
    expect((await subState(id)).status === 'expired', 'NULL grace_end row past 168 hours not expired')
    expect((await subState(live)).status === 'grace', 'NULL grace_end row inside 168 hours was expired')
    expect(r.grace_expired === 1, `grace_expired ${r.grace_expired}`)
  })
  await txCase('W75. the sweep result carries more_pending = false when nothing is left over', async () => {
    await mixedFixture()
    const r = await sweep(AS_OF)
    expect(r.more_pending === false, `more_pending ${r.more_pending}`)
  })
  await txCase('W76. a backlog above the 5000 batch is worked in batches and reported as more_pending', async () => {
    expect(/c_batch\s+CONSTANT\s+integer\s*:=\s*5000/i.test(sweepSql()), 'batch constant is not 5000')
    expect((sweepSql().match(/LIMIT\s+c_batch\s+FOR\s+UPDATE[^)]*SKIP\s+LOCKED/gi) ?? []).length === 3, 'three batched updates expected')
    expect(/more_pending/.test(sweepSql()), 'more_pending missing')
  })
  await txCase('W77. the function pins timezone = UTC and uses explicit hours, not day intervals', async () => {
    const r = await one(
      `SELECT array_to_string(p.proconfig, ',') AS c FROM pg_proc p
       WHERE p.proname = 'run_subscription_sweeps' AND p.pronamespace = 'public'::regnamespace`
    )
    expect(r.c && /timezone=UTC/i.test(r.c), `proconfig: ${r.c}`)
    const body = sweepSql().split('CREATE OR REPLACE FUNCTION public.run_subscription_sweeps')[1].split('REVOKE ALL ON FUNCTION')[0]
    expect(!/interval\s+'-?\d+\s+days?'/i.test(body), 'function still uses a day interval')
  })
  await txCase('W78. service_role can SELECT but not INSERT into the sweep run and reminder tables', async () => {
    const id = await liveSub(await account(), 'active', DAY)
    await asRole('service_role')
    const read = await attempt(`SELECT count(*) FROM public.subscription_sweep_runs`)
    const readR = await attempt(`SELECT count(*) FROM public.subscription_reminders`)
    const insRun = await attempt(`INSERT INTO public.subscription_sweep_runs (as_of) VALUES ($1::timestamptz)`, [AS_OF])
    const insRem = await attempt(
      `INSERT INTO public.subscription_reminders (subscription_id, period_end, kind) VALUES ($1, $2::timestamptz, 't_minus_1')`,
      [id, iso(DAY)]
    )
    await db.exec('RESET ROLE')
    expect(read === null && readR === null, `SELECT: ${read ?? readR}`)
    expect(insRun && /permission denied/i.test(insRun), `run INSERT: ${insRun ?? 'succeeded'}`)
    expect(insRem && /permission denied/i.test(insRem), `reminder INSERT: ${insRem ?? 'succeeded'}`)
  })
  await txCase('W79. the sweep produces exactly the edges trial>expired, active>grace, past_due>grace, grace>expired', async () => {
    await mixedFixture()
    const mid = await snapshot()
    await sweep(AS_OF)
    const after = await snapshot()
    const edges = new Set()
    for (const id of Object.keys(after)) {
      if (mid[id] && mid[id].status !== after[id].status) edges.add(`${mid[id].status}>${after[id].status}`)
    }
    expect([...edges].sort().join(',') === [...ALLOWED_PAIRS].sort().join(','), `edges: ${[...edges].sort().join(',')}`)
  })
  await txCase('W80. a non-postgres session cannot pass a future p_as_of; postgres still can', async () => {
    const id = await liveSub(await account(), 'active', -1)
    await su(`DROP ROLE IF EXISTS w80_api`)
    await su(`CREATE ROLE w80_api SUPERUSER LOGIN`)
    await su(`GRANT service_role TO w80_api`)
    let blocked = null
    let mode = 'SET SESSION AUTHORIZATION'
    try {
      const orig = (await one(`SELECT session_user AS u`)).u
      await db.exec('SET SESSION AUTHORIZATION w80_api')
      blocked = await attempt(`SELECT public.run_subscription_sweeps(clock_timestamp() + interval '1 day')`)
      await db.exec(`SET SESSION AUTHORIZATION "${orig}"`)
    } catch (error) {
      await db.exec('RESET SESSION AUTHORIZATION').catch(() => {})
      mode = 'pg_get_functiondef text (PGlite could not switch session user)'
      const def = (await one(`SELECT pg_get_functiondef('public.run_subscription_sweeps(timestamptz)'::regprocedure) AS d`)).d
      expect(/session_user\s+NOT\s+IN\s*\(\s*'postgres'\s*,\s*'supabase_admin'\s*\)/i.test(def) && /as_of_in_future/.test(def), `guard text missing (${mode})`)
      return
    }
    expect(blocked && /as_of_in_future/.test(blocked), `${mode}: ${blocked ?? 'succeeded'}`)
    expect((await subState(id)).status === 'active', 'row changed by a blocked call')
    const ok = await sweep(iso(DAY))
    expect(ok.ok === true, 'postgres session with a future date was refused')
  })
}

async function main() {
  await db.exec(BOOTSTRAP)
  await resetClaims()
  const prior = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && f < SWEEP_FILE && !SIBLINGS.has(f))
    .sort()
  try {
    await applyFiles(prior)
  } catch (error) {
    prefixError = firstLine(error)
  }
  console.log(`migrations replayed before ${SWEEP_FILE}: ${prior.length} (siblings 20261029/20261030 excluded)`)
  console.log(`migration ${SWEEP_FILE}: ${SWEEP_PRESENT ? 'present' : 'MISSING'}`)

  if (SWEEP_PRESENT && !prefixError) {
    try {
      await applyFiles([SWEEP_FILE])
      migrationApplied = true
    } catch (error) {
      migrationError = firstLine(error)
    }
  }

  await runCases()

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed`)
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
