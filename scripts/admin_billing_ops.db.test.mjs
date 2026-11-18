#!/usr/bin/env node
/**
 * Admin billing ops read functions — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). Replays supabase/migrations including
 * 20261041000000_admin_billing_ops_read.sql and calls the RPCs the way PostgREST does (SET ROLE authenticated
 * with request.jwt.claims).
 *
 * Pinned contract (all SECURITY DEFINER, STABLE, SET search_path = public, pg_temp, jsonb result, EXECUTE for
 * authenticated only: never PUBLIC/anon). Admin = public.is_admin_user() inside; anyone else (non-admin user,
 * agency owner, no sign-in claim) gets {ok:false,error:'forbidden'}, never data. READ-ONLY: no write function.
 *   admin_agencies_without_subscription()       -> {ok:true, agencies:[{id,name,created_at,owner_user_id,owner_email}]}
 *       approved agencies with NO subscription in trial/active/past_due/grace, ordered created_at, id.
 *   admin_webhook_events(p_limit int DEFAULT 100) -> {ok:true, events:[{received_at,event_id,event_type,result,order_id,payment_id}]}
 *       newest first (received_at DESC, event_id), limit clamped to 500, p_limit < 1 -> {ok:false,error:'invalid_limit'},
 *       NULL -> 100. NEVER payload, payload_sha256, error text.
 *   admin_webhook_attempts(p_limit int DEFAULT 100) -> {ok:true, attempts:[{event_id,attempt_no,sqlstate_or_code,at}]}
 *       newest first (at DESC, event_id, attempt_no), same limit rules.
 *   admin_subscription_coupons()                -> {ok:true, coupons:[{code,percent_off,max_cycles,monthly_only,valid_until,max_redemptions,redemption_count}]}
 *       ordered by code; redemption_count = rows in subscription_coupon_redemptions for that code.
 * The raw tables stay closed to authenticated (no grant is widened).
 *
 * Evidence class: local DB only (PGlite, single session).
 * Usage:  node scripts/admin_billing_ops.db.test.mjs   (from the repo root)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261041000000_admin_billing_ops_read.sql'
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

/** Resolves true when the call is refused (raised, or returned ok:false), false when it was accepted. */
async function refusedOrNotOk(promise) {
  try {
    const r = await promise
    return Boolean(r && r.ok === false)
  } catch {
    return true
  }
}

/** Passes only when the reply is exactly {ok:false, error: code}. */
function expectError(r, code) {
  expect(r && r.ok === false && r.error === code, `expected {ok:false,error:'${code}'}, got ${JSON.stringify(r)}`)
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

/** Every case that touches the new functions is gated on the migration file being present. */
async function gatedCase(name, fn) {
  await testCase(name, async () => {
    if (!MIGRATION_PRESENT) {
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so the admin billing ops functions do not exist yet`)
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

// ---------------------------------------------------------------------------
// Fixtures (superuser). Only pre-existing tables are touched in setup.
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


// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FNS = ['admin_agencies_without_subscription', 'admin_webhook_events', 'admin_webhook_attempts', 'admin_subscription_coupons']
const CALLS = {
  admin_agencies_without_subscription: `SELECT public.admin_agencies_without_subscription() AS r`,
  admin_webhook_events: `SELECT public.admin_webhook_events() AS r`,
  admin_webhook_attempts: `SELECT public.admin_webhook_attempts() AS r`,
  admin_subscription_coupons: `SELECT public.admin_subscription_coupons() AS r`,
}
const PAYLOAD_SENTINEL = 'PAYLOADSENTINEL-5521'
const ERROR_SENTINEL = 'ERRORSENTINEL-7731'
const HASH_SENTINEL = 'abababababababab'

let adminU, plainU, ownerPlain, agencyPlain, staffPlain
let ag = {}
let owners = {}

async function makeSub(agencyId, status, { tier = 'starter' } = {}) {
  const planId = (await suOne(`SELECT id FROM public.subscription_plans WHERE tier = $1`, [tier])).id
  const id = uid()
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, grace_end)
     VALUES ($1, NULL, $2, $3, $4, 'monthly', now() - interval '10 days', now() + interval '20 days',
             CASE WHEN $4 = 'trial' THEN now() + interval '14 days' END,
             CASE WHEN $4 = 'grace' THEN now() + interval '7 days' END)`,
    [id, agencyId, planId, status]
  )
  return id
}

async function mkAgency(key, status, subs = []) {
  const owner = await createUser(`bo-${key}`)
  const id = await createAgencyRow(owner, `BO ${key}`, status)
  owners[key] = owner
  ag[key] = id
  for (const s of subs) await makeSub(id, s)
  return id
}

async function setupFixtures() {
  adminU = await createUser('bo-admin')
  await su(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [adminU])
  plainU = await createUser('bo-plain')
  agencyPlain = await mkAgency('plainowner', 'approved', ['active'])
  ownerPlain = owners.plainowner
  staffPlain = await seedStaff(agencyPlain, 'bo-staff', 'finance')

  await mkAgency('live_active', 'approved', ['active'])
  await mkAgency('live_trial', 'approved', ['trial'])
  await mkAgency('live_pastdue', 'approved', ['past_due'])
  await mkAgency('live_grace', 'approved', ['grace'])
  await mkAgency('none', 'approved', [])
  await mkAgency('cancelled', 'approved', ['cancelled'])
  await mkAgency('expired', 'approved', ['expired'])
  await mkAgency('expired_then_active', 'approved', ['expired', 'active'])
  await mkAgency('pending', 'pending', [])
  await mkAgency('rejected', 'rejected', [])
  await mkAgency('suspended', 'suspended', [])

  // Webhook events: 520 rows, one per minute back from now; every 3rd is an orphan carrying a payload.
  await su(
    `INSERT INTO public.razorpay_webhook_events
       (event_id, event_type, order_id, payment_id, payload_sha256, received_at, processed_at, result, error, payload)
     SELECT 'evt_' || lpad(i::text, 4, '0'), 'payment.captured', 'order_' || i, 'pay_' || i,
            repeat('ab', 32), now() - (i || ' minutes')::interval, now(),
            CASE WHEN i % 3 = 0 THEN 'orphan' ELSE 'activated' END,
            CASE WHEN i % 3 = 0 THEN '${ERROR_SENTINEL}' END,
            CASE WHEN i % 3 = 0 THEN jsonb_build_object('note', '${PAYLOAD_SENTINEL}') END
       FROM generate_series(1, 520) AS i`
  )
  await su(
    `INSERT INTO public.razorpay_webhook_attempts (event_id, attempt_no, sqlstate_or_code, at)
     SELECT 'evt_' || lpad(i::text, 4, '0'), 1, '23505', now() - (i || ' seconds')::interval
       FROM generate_series(1, 520) AS i`
  )
  await su(`INSERT INTO public.razorpay_webhook_attempts (event_id, attempt_no, sqlstate_or_code, at) VALUES ('evt_0001', 2, 'P0001', now() - interval '500 milliseconds')`)

  await su(
    `INSERT INTO public.subscription_coupons (code, percent_off, max_cycles, monthly_only, valid_until, max_redemptions)
     VALUES ('ZZLIMITED', 10, 2, false, '2031-01-01T00:00:00Z', 5), ('AAUNUSED', 25, 1, true, NULL, NULL)`
  )
  // Redemption rows without their payment/subscription parents (FK triggers are skipped in replica mode).
  await su(`SET session_replication_role = replica`)
  for (let n = 1; n <= 3; n++) {
    await su(
      `INSERT INTO public.subscription_coupon_redemptions (coupon_code, agency_id, cycle_no, subscription_id, payment_id)
       VALUES ('FOUNDING50', $1, $2, $3, $4)`,
      [ag.live_active, n, uid(), uid()]
    )
  }
  await su(
    `INSERT INTO public.subscription_coupon_redemptions (coupon_code, agency_id, cycle_no, subscription_id, payment_id)
     VALUES ('ZZLIMITED', $1, 1, $2, $3)`,
    [ag.live_trial, uid(), uid()]
  )
  await su(`SET session_replication_role = origin`)
}

async function callAs(userId, sql) {
  return asActor(userId, async () => parseJson((await db.query(sql)).rows[0].r))
}
const adm = (fn, sql) => callAs(adminU, sql || CALLS[fn])
const keysOf = (o) => JSON.stringify(Object.keys(o).sort())

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]})`)
  console.log(`migration ${MIGRATION_FILE}: ${MIGRATION_PRESENT ? 'present' : 'MISSING'}`)
  await setupFixtures()

  await testCase(`A01. migration file ${MIGRATION_FILE} is present`, async () => {
    expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing (not written yet)`)
  })

  await gatedCase('A02. all four functions exist as one overload, return jsonb, SECURITY DEFINER, STABLE', async () => {
    await gather(FNS.map((f) => [f, async () => {
      const rows = (await su(
        `SELECT pg_get_function_result(p.oid) AS res, p.prosecdef AS sd, p.provolatile AS vol
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1`, [f]
      )).rows
      expect(rows.length === 1, `expected one overload, got ${rows.length}`)
      expect(rows[0].res === 'jsonb' && rows[0].sd === true && rows[0].vol === 's', JSON.stringify(rows[0]))
    }]))
  })

  await gatedCase('A03. signatures: no argument, except p_limit integer DEFAULT 100 on the two webhook readers', async () => {
    const args = async (f) => (await suOne(`SELECT pg_get_function_arguments(p.oid) AS a FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1`, [f])).a
    await gather([
      ['agencies', async () => expect((await args('admin_agencies_without_subscription')) === '', 'has arguments')],
      ['coupons', async () => expect((await args('admin_subscription_coupons')) === '', 'has arguments')],
      ['events', async () => expect((await args('admin_webhook_events')) === 'p_limit integer DEFAULT 100', await args('admin_webhook_events'))],
      ['attempts', async () => expect((await args('admin_webhook_attempts')) === 'p_limit integer DEFAULT 100', await args('admin_webhook_attempts'))],
    ])
  })

  await gatedCase('A04. search_path is pinned to public, pg_temp on every function', async () => {
    await gather(FNS.map((f) => [f, async () => {
      const row = await suOne(`SELECT array_to_string(p.proconfig, ',') AS cfg FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1`, [f])
      expect(row && /search_path=public, pg_temp/.test(row.cfg || ''), `proconfig ${row && row.cfg}`)
    }]))
  })

  await gatedCase('A05. EXECUTE: authenticated yes; anon and PUBLIC no (all four)', async () => {
    await gather(FNS.map((f) => [f, async () => {
      const row = await suOne(
        `SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
                (SELECT count(*)::int FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS pub
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1`, [f]
      )
      expect(row.auth === true && row.anon === false && Number(row.pub) === 0, JSON.stringify(row))
    }]))
  })

  await gatedCase('A06. anon is denied on every function', async () => {
    await gather(FNS.map((f) => [f, async () => {
      let refused = false
      try { await asAnon(CALLS[f]) } catch { refused = true }
      expect(refused, 'anon call was accepted')
    }]))
  })

  await gatedCase('A07. a plain signed-in user gets exactly {ok:false,error:forbidden} from every function', async () => {
    await gather(FNS.map((f) => [f, async () => {
      const r = await callAs(plainU, CALLS[f])
      expectError(r, 'forbidden')
      expect(keysOf(r) === JSON.stringify(['error', 'ok']), `extra keys ${Object.keys(r)}`)
    }]))
  })

  await gatedCase('A08. an agency owner is forbidden on every function', async () => {
    await gather(FNS.map((f) => [f, async () => expectError(await callAs(ownerPlain, CALLS[f]), 'forbidden')]))
  })

  await gatedCase('A09. agency staff (finance scope) are forbidden on every function', async () => {
    await gather(FNS.map((f) => [f, async () => expectError(await callAs(staffPlain, CALLS[f]), 'forbidden')]))
  })

  await gatedCase('A10. no sign-in claim gives forbidden (typed, not an exception)', async () => {
    await actAs(null)
    try {
      await gather(FNS.map((f) => [f, async () => expectError(parseJson((await db.query(CALLS[f])).rows[0].r), 'forbidden')]))
    } finally {
      await actAsService()
    }
  })

  await gatedCase('A11. a forged user_metadata.role=admin claim does not unlock anything', async () => {
    await db.exec('RESET ROLE')
    await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: plainU, role: 'authenticated', user_metadata: { role: 'admin' }, app_metadata: { role: 'admin' } })])
    await db.exec('SET ROLE authenticated')
    try {
      await gather(FNS.map((f) => [f, async () => expectError(parseJson((await db.query(CALLS[f])).rows[0].r), 'forbidden')]))
    } finally {
      await actAsService()
    }
  })

  await gatedCase('A12. an admin whose role is later removed is forbidden again', async () => {
    const u = await createUser('bo-temp-admin')
    await su(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [u])
    expect((await callAs(u, CALLS.admin_subscription_coupons)).ok === true, 'admin refused')
    await su(`UPDATE public.users SET role = 'user' WHERE id = $1`, [u])
    expectError(await callAs(u, CALLS.admin_subscription_coupons), 'forbidden')
  })

  await gatedCase('A13. the admin gets ok:true from every function', async () => {
    await gather(FNS.map((f) => [f, async () => {
      const r = await adm(f)
      expect(r && r.ok === true, JSON.stringify(r).slice(0, 160))
    }]))
  })

  // ---- agencies without a live subscription
  await gatedCase('A14. agencies list is exactly the approved agencies with no trial/active/past_due/grace subscription', async () => {
    const r = await adm('admin_agencies_without_subscription')
    const got = r.agencies.map((a) => a.id).sort()
    const want = [ag.none, ag.cancelled, ag.expired].sort()
    expect(JSON.stringify(got) === JSON.stringify(want), `got ${r.agencies.map((a) => a.name)}`)
  })

  await gatedCase('A15. agencies with a trial, active, past_due or grace subscription are excluded', async () => {
    const ids = (await adm('admin_agencies_without_subscription')).agencies.map((a) => a.id)
    for (const k of ['live_active', 'live_trial', 'live_pastdue', 'live_grace', 'expired_then_active', 'plainowner']) {
      expect(!ids.includes(ag[k]), `${k} listed`)
    }
  })

  await gatedCase('A16. pending, rejected and suspended agencies are never listed', async () => {
    const ids = (await adm('admin_agencies_without_subscription')).agencies.map((a) => a.id)
    for (const k of ['pending', 'rejected', 'suspended']) expect(!ids.includes(ag[k]), `${k} listed`)
  })

  await gatedCase('A17. an agency whose only subscription is cancelled or expired IS listed', async () => {
    const ids = (await adm('admin_agencies_without_subscription')).agencies.map((a) => a.id)
    expect(ids.includes(ag.cancelled) && ids.includes(ag.expired), 'cancelled/expired-only agency missing')
  })

  await gatedCase('A18. exact row shape {id,name,created_at,owner_user_id,owner_email}', async () => {
    const r = await adm('admin_agencies_without_subscription')
    expect(keysOf(r) === JSON.stringify(['agencies', 'ok']), keysOf(r))
    for (const a of r.agencies) {
      expect(keysOf(a) === JSON.stringify(['created_at', 'id', 'name', 'owner_email', 'owner_user_id']), keysOf(a))
      expect(UUID_RE.test(a.id) && UUID_RE.test(a.owner_user_id), 'ids are not uuids')
    }
  })

  await gatedCase('A19. name is the company name and owner fields point at the agency owner', async () => {
    const r = await adm('admin_agencies_without_subscription')
    const a = r.agencies.find((x) => x.id === ag.none)
    const email = (await suOne(`SELECT email FROM public.users WHERE id = $1`, [owners.none])).email
    expect(a.name === 'BO none Transport Pvt Ltd', a.name)
    expect(a.owner_user_id === owners.none && a.owner_email === email, JSON.stringify(a))
  })

  await gatedCase('A20. rows are ordered by created_at then id and the order is stable across calls', async () => {
    await su(`UPDATE public.transport_agencies SET created_at = now() - interval '3 days' WHERE id = $1`, [ag.expired])
    const r1 = await adm('admin_agencies_without_subscription')
    const r2 = await adm('admin_agencies_without_subscription')
    expect(JSON.stringify(r1) === JSON.stringify(r2), 'two calls differ')
    expect(r1.agencies[0].id === ag.expired, 'oldest agency is not first')
    const ts = r1.agencies.map((a) => new Date(a.created_at).getTime())
    expect(JSON.stringify(ts) === JSON.stringify([...ts].sort((x, y) => x - y)), 'not ordered by created_at')
  })

  await gatedCase('A21. giving a listed agency a live subscription removes it; cancelling it brings it back', async () => {
    const sid = await makeSub(ag.none, 'active')
    expect(!(await adm('admin_agencies_without_subscription')).agencies.some((a) => a.id === ag.none), 'still listed with an active sub')
    await su(`UPDATE public.subscriptions SET status = 'cancelled' WHERE id = $1`, [sid])
    expect((await adm('admin_agencies_without_subscription')).agencies.some((a) => a.id === ag.none), 'not listed after cancel')
  })

  await gatedCase('A22. an agency is listed once even when it has several dead subscriptions', async () => {
    await makeSub(ag.cancelled, 'expired')
    const r = await adm('admin_agencies_without_subscription')
    expect(r.agencies.filter((a) => a.id === ag.cancelled).length === 1, 'listed more than once')
  })

  // ---- webhook events
  await gatedCase('A23. events: exact row shape, no payload / hash / error column', async () => {
    const r = await adm('admin_webhook_events')
    expect(keysOf(r) === JSON.stringify(['events', 'ok']), keysOf(r))
    for (const e of r.events) {
      expect(keysOf(e) === JSON.stringify(['event_id', 'event_type', 'order_id', 'payment_id', 'received_at', 'result']), keysOf(e))
    }
  })

  await gatedCase('A24. events: the default is the latest 100, newest first', async () => {
    const r = await adm('admin_webhook_events')
    expect(r.events.length === 100, `got ${r.events.length}`)
    expect(r.events[0].event_id === 'evt_0001' && r.events[99].event_id === 'evt_0100', `${r.events[0].event_id}..${r.events[99].event_id}`)
  })

  await gatedCase('A25. events: p_limit selects that many (named and positional)', async () => {
    const a = await adm('admin_webhook_events', `SELECT public.admin_webhook_events(7) AS r`)
    const b = await adm('admin_webhook_events', `SELECT public.admin_webhook_events(p_limit => 3) AS r`)
    expect(a.events.length === 7 && b.events.length === 3, `${a.events.length}/${b.events.length}`)
  })

  await gatedCase('A26. events: p_limit 500 returns 500; larger values clamp to 500', async () => {
    const a = await adm('admin_webhook_events', `SELECT public.admin_webhook_events(500) AS r`)
    const b = await adm('admin_webhook_events', `SELECT public.admin_webhook_events(100000) AS r`)
    expect(a.events.length === 500 && b.events.length === 500, `${a.events.length}/${b.events.length}`)
  })

  await gatedCase('A27. events: p_limit 0 and negative give invalid_limit; NULL falls back to 100', async () => {
    expectError(await adm('admin_webhook_events', `SELECT public.admin_webhook_events(0) AS r`), 'invalid_limit')
    expectError(await adm('admin_webhook_events', `SELECT public.admin_webhook_events(-5) AS r`), 'invalid_limit')
    const n = await adm('admin_webhook_events', `SELECT public.admin_webhook_events(NULL) AS r`)
    expect(n.ok === true && n.events.length === 100, JSON.stringify(n).slice(0, 120))
  })

  await gatedCase('A28. events: a non-numeric limit is rejected by the type system, never run as SQL', async () => {
    let refused = false
    try { await asActor(adminU, () => db.query(`SELECT public.admin_webhook_events('1; DROP TABLE x'::text)`)) } catch { refused = true }
    expect(refused, 'text limit accepted')
  })

  await gatedCase('A29. events: payload, payload hash and error text never appear anywhere in the reply', async () => {
    const text = JSON.stringify(await adm('admin_webhook_events', `SELECT public.admin_webhook_events(500) AS r`))
    const bad = [PAYLOAD_SENTINEL, ERROR_SENTINEL, HASH_SENTINEL, 'payload'].filter((s) => text.includes(s))
    expect(bad.length === 0, 'leaked: ' + bad.join(', '))
  })

  await gatedCase('A30. events: values come from the right columns (event 3 is an orphan with order_3 / pay_3)', async () => {
    const r = await adm('admin_webhook_events')
    const e = r.events.find((x) => x.event_id === 'evt_0003')
    expect(e && e.result === 'orphan' && e.event_type === 'payment.captured' && e.order_id === 'order_3' && e.payment_id === 'pay_3', JSON.stringify(e))
    const f = r.events.find((x) => x.event_id === 'evt_0002')
    expect(f && f.result === 'activated', JSON.stringify(f))
  })

  await gatedCase('A31. events: received_at is a timestamp and ordering is newest first', async () => {
    const r = await adm('admin_webhook_events')
    const ts = r.events.map((e) => new Date(e.received_at).getTime())
    expect(ts.every((t) => Number.isFinite(t)), 'bad timestamp')
    for (let i = 1; i < ts.length; i++) expect(ts[i - 1] >= ts[i], 'not newest first at ' + i)
  })

  await gatedCase('A32. events: equal received_at is ordered deterministically by event_id, null ids stay null', async () => {
    await su(`SET session_replication_role = replica`)
    await su(`INSERT INTO public.razorpay_webhook_events (event_id, event_type, payload_sha256, received_at, processed_at, result)
              VALUES ('evt_tie_b', 't', repeat('cd', 32), now() + interval '1 hour', now(), 'ignored'), ('evt_tie_a', 't', repeat('cd', 32), now() + interval '1 hour', now(), 'ignored')`)
    await su(`SET session_replication_role = origin`)
    const r = await adm('admin_webhook_events')
    expect(r.events[0].event_id === 'evt_tie_a' && r.events[1].event_id === 'evt_tie_b', `${r.events[0].event_id},${r.events[1].event_id}`)
    expect(r.events[0].order_id === null && r.events[0].payment_id === null, 'null ids not preserved as null')
  })

  // ---- webhook attempts
  await gatedCase('A33. attempts: exact row shape {event_id,attempt_no,sqlstate_or_code,at}', async () => {
    const r = await adm('admin_webhook_attempts')
    expect(keysOf(r) === JSON.stringify(['attempts', 'ok']), keysOf(r))
    for (const a of r.attempts) expect(keysOf(a) === JSON.stringify(['at', 'attempt_no', 'event_id', 'sqlstate_or_code']), keysOf(a))
  })

  await gatedCase('A34. attempts: default 100, newest first, both attempts of one event listed', async () => {
    const r = await adm('admin_webhook_attempts')
    expect(r.attempts.length === 100, `got ${r.attempts.length}`)
    expect(r.attempts[0].event_id === 'evt_0001' && r.attempts[0].attempt_no === 2 && r.attempts[0].sqlstate_or_code === 'P0001', JSON.stringify(r.attempts[0]))
    expect(r.attempts[1].event_id === 'evt_0001' && r.attempts[1].attempt_no === 1, JSON.stringify(r.attempts[1]))
  })

  await gatedCase('A35. attempts: p_limit selects that many; 500 and above clamp to 500', async () => {
    const a = await adm('admin_webhook_attempts', `SELECT public.admin_webhook_attempts(4) AS r`)
    const b = await adm('admin_webhook_attempts', `SELECT public.admin_webhook_attempts(500) AS r`)
    const c = await adm('admin_webhook_attempts', `SELECT public.admin_webhook_attempts(99999) AS r`)
    expect(a.attempts.length === 4 && b.attempts.length === 500 && c.attempts.length === 500, `${a.attempts.length}/${b.attempts.length}/${c.attempts.length}`)
  })

  await gatedCase('A36. attempts: invalid limit is typed, NULL falls back to 100', async () => {
    expectError(await adm('admin_webhook_attempts', `SELECT public.admin_webhook_attempts(0) AS r`), 'invalid_limit')
    expectError(await adm('admin_webhook_attempts', `SELECT public.admin_webhook_attempts(-1) AS r`), 'invalid_limit')
    const n = await adm('admin_webhook_attempts', `SELECT public.admin_webhook_attempts(NULL) AS r`)
    expect(n.ok === true && n.attempts.length === 100, JSON.stringify(n).slice(0, 120))
  })

  // ---- coupons
  await gatedCase('A37. coupons: exact row shape', async () => {
    const r = await adm('admin_subscription_coupons')
    expect(keysOf(r) === JSON.stringify(['coupons', 'ok']), keysOf(r))
    for (const c of r.coupons) {
      expect(keysOf(c) === JSON.stringify(['code', 'max_cycles', 'max_redemptions', 'monthly_only', 'percent_off', 'redemption_count', 'valid_until']), keysOf(c))
    }
  })

  await gatedCase('A38. coupons: ordered by code and complete (seed FOUNDING50 plus the fixtures)', async () => {
    const codes = (await adm('admin_subscription_coupons')).coupons.map((c) => c.code)
    expect(JSON.stringify(codes) === JSON.stringify(['AAUNUSED', 'FOUNDING50', 'ZZLIMITED']), codes.join(','))
  })

  await gatedCase('A39. coupons: redemption_count counts rows per code, 0 when unused', async () => {
    const by = Object.fromEntries((await adm('admin_subscription_coupons')).coupons.map((c) => [c.code, c]))
    expect(by.FOUNDING50.redemption_count === 3 && by.ZZLIMITED.redemption_count === 1 && by.AAUNUSED.redemption_count === 0, JSON.stringify(Object.values(by).map((c) => c.redemption_count)))
    expect(typeof by.AAUNUSED.redemption_count === 'number', 'count is not a JSON number')
  })

  await gatedCase('A40. coupons: terms are carried exactly, nulls stay null', async () => {
    const by = Object.fromEntries((await adm('admin_subscription_coupons')).coupons.map((c) => [c.code, c]))
    const f = by.FOUNDING50
    expect(f.percent_off === 50 && f.max_cycles === 3 && f.monthly_only === true && f.valid_until === null && f.max_redemptions === null, JSON.stringify(f))
    const z = by.ZZLIMITED
    expect(z.percent_off === 10 && z.max_cycles === 2 && z.monthly_only === false && z.max_redemptions === 5 && new Date(z.valid_until).getUTCFullYear() === 2031, JSON.stringify(z))
  })

  await gatedCase('A41. coupons: a new redemption raises the count on the next call', async () => {
    await su(`SET session_replication_role = replica`)
    await su(`INSERT INTO public.subscription_coupon_redemptions (coupon_code, agency_id, cycle_no, subscription_id, payment_id) VALUES ('AAUNUSED', $1, 1, $2, $3)`, [ag.live_active, uid(), uid()])
    await su(`SET session_replication_role = origin`)
    const c = (await adm('admin_subscription_coupons')).coupons.find((x) => x.code === 'AAUNUSED')
    expect(c.redemption_count === 1, String(c.redemption_count))
  })

  // ---- read-only, no widening
  await gatedCase('A42. the calls write nothing (row counts unchanged across every function)', async () => {
    const count = async () => JSON.stringify([
      (await suOne(`SELECT count(*)::int AS n FROM public.razorpay_webhook_events`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.razorpay_webhook_attempts`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.subscription_coupons`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.subscription_coupon_redemptions`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.subscriptions`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.transport_agencies`)).n,
    ])
    const before = await count()
    for (const f of FNS) { await adm(f); await callAs(plainU, CALLS[f]) }
    expect(before === (await count()), 'row counts changed')
  })

  await gatedCase('A43. the raw tables stay closed: an admin session still gets permission denied (no grant widened)', async () => {
    await gather(['razorpay_webhook_events', 'razorpay_webhook_attempts', 'subscription_coupons', 'subscription_coupon_redemptions'].map((t) => [t, async () => {
      let refused = false
      try { await asActor(adminU, () => db.query(`SELECT 1 FROM public.${t} LIMIT 1`)) } catch { refused = true }
      expect(refused, 'authenticated could read the table')
    }]))
  })

  await gatedCase('A44. no write function was added: the only admin billing ops functions are the four readers', async () => {
    const rows = (await su(
      `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND (p.proname ~ '^admin_.*(webhook|coupon|subscription)' )`
    )).rows.map((r) => r.proname).sort()
    const extra = rows.filter((n) => !FNS.includes(n))
    expect(extra.length === 0, 'unexpected functions: ' + extra.join(','))
  })

  await gatedCase('A45. re-applying the migration keeps grants and behaviour (CREATE OR REPLACE)', async () => {
    const sqlText = readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8')
    await db.exec(sqlText)
    const row = await suOne(`SELECT has_function_privilege('anon', 'public.admin_subscription_coupons()', 'EXECUTE') AS anon,
                                    has_function_privilege('authenticated', 'public.admin_subscription_coupons()', 'EXECUTE') AS auth`)
    expect(row.anon === false && row.auth === true, JSON.stringify(row))
    expect((await adm('admin_subscription_coupons')).ok === true, 'admin call broke after re-apply')
  })

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  for (const f of failed.slice(0, 10)) console.log(`  - ${f.name}`)
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
