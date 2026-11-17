#!/usr/bin/env node
/**
 * Razorpay webhook events (TO-152 S3) - red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the supabase/migrations chain
 * (copied harness from scripts/subscription_activation.db.test.mjs) and drives the service function the way the
 * Edge function does: service_role, one call per Razorpay delivery.
 *
 * RED FIRST. supabase/migrations/20261030000000_razorpay_webhook_events.sql does NOT exist yet. Every case that
 * needs the new objects is gated and EXPECTED to fail with "migration ... is missing"; H01 names the missing file.
 * The activation fixtures (029) are used as-is, so the 029 chain must stay green.
 *
 * Contract under test: docs/TO-152-rulings.md section 3 (S3 events, dedupe table, refund handling).
 * Pinned contract (decided here; the migration must satisfy it):
 *   subscription_webhook_process(p_event_id text, p_event_type text, p_payload jsonb, p_payload_sha256 text)
 *     RETURNS jsonb. service_role only, search_path pinned, SECURITY DEFINER. p_payload is the WHOLE Razorpay event
 *     body (fields: event, payload.payment.entity, payload.order.entity, payload.refund.entity).
 *     Success: {ok:true, result, ...}. Typed refusal: {ok:false, error:CODE, retryable:bool}.
 *     result = activated | replay | duplicate | orphan | failed_recorded | refunded | past_due | ignored.
 *   Typed codes matched by fragment: event_id_reused (exact), event_id, event_type, payload_too_large, amount,
 *   currency. Raw SQL messages are never returned (every sanity code is ^[a-z_]+$).
 *   razorpay_webhook_events(event_id text PK, event_type, order_id, payment_id, payload_sha256, received_at,
 *   processed_at, result, error). No foreign keys (events survive agency deletion). Append-only: UPDATE and DELETE
 *   refused for every role, including the superuser; TRUNCATE refused for every role. The function may set
 *   processed_at and result on the row it inserts; this battery only pins that the row is written and immutable.
 *   subscription_verify_webhook_signature(p_body text, p_signature text, p_secret text) RETURNS boolean.
 *   IMMUTABLE, internal (no PUBLIC/anon/authenticated EXECUTE). HMAC-SHA256 lowercase hex of the raw body.
 *
 * Dedupe rules pinned here: same event id + same payload hash -> 'duplicate', no effect; same event id + other
 * hash -> event_id_reused, nothing recorded; a second event (new id) for an already-captured payment -> 'replay'
 * (activation replay); unknown order -> 'orphan' (ok:true); amount/currency mismatch -> 'failed_recorded' with the
 * captured payment id kept (ok:true, no retry storm).
 *
 * Assumptions (not pinned by the rulings, flagged for the implementer):
 *   - payment.failed on a first purchase returns 'failed_recorded' and leaves the subscription alone.
 *   - refund.processed for an unknown payment id accepts 'orphan' or 'failed_recorded' (ok:true, no credit note).
 *   - Transient DB error = a harness trigger on subscription_invoices that raises P0001 during activation (same
 *     stand-in as the activation battery). Required: ok:false, retryable:true, NO event row, no payment or
 *     subscription change; after the trigger is dropped the same event id succeeds.
 *   - pgcrypto is loaded into the PGlite instance (schema extensions) so hmac() is available to the migration. This
 *     is the only deviation from the activation harness bootstrap. Signature cases are NOT dropped.
 *
 * Usage:  node scripts/subscription_webhook.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud failure, never a silent skip.
 */

import { createHash, createHmac } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261030000000_razorpay_webhook_events.sql'
const MIGRATION_PRESENT = existsSync(join(MIGRATIONS_DIR, MIGRATION_FILE))

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}

const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)
const { pgcrypto } = await import(pathToFileURL(join(PGLITE_BASE, "dist", "contrib", "pgcrypto.js")).href)

const db = await PGlite.create({ extensions: { uuid_ossp, pgcrypto } })

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
let caseNo = 0

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
 * Per-case resilience: a failing assertion records FAIL and the battery keeps running,
 * so a red-first run reports EVERY unmet contract clause with its exact reason.
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

/** Every case that touches the new objects is gated on the migration existing AND applying AND fixtures. */
let migrationApplied = false
let migrationError = ''
let chainFiles = []
let fixturesReady = false
let fixtureError = ''

async function gatedCase(name, fn) {
  await testCase(name, async () => {
    if (!MIGRATION_PRESENT) {
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so subscription_create_order, subscription_activate_payment and subscription_record_refund do not exist yet`)
    }
    if (!migrationApplied) throw new Error(`red: migration ${MIGRATION_FILE} failed to apply: ${migrationError}`)
    if (!fixturesReady) throw new Error(`red: post-migration fixtures failed: ${fixtureError}`)
    await fn()
  })
}

// ---------------------------------------------------------------------------
// Migrations
// ---------------------------------------------------------------------------
/** Applies the whole chain in order. The activation migration is the last link; its absence is a red result, not an error. */
async function applyChain() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (file === MIGRATION_FILE) {
      try {
        await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
        migrationApplied = true
      } catch (error) {
        migrationError = firstLine(error)
      }
      continue
    }
    const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sqlText)
    } catch (error) {
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Ids and role switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-a000-${String(++seq).padStart(12, '0')}`
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

/** Runs the statement as an arbitrary database role (anon, service_role, authenticated), then returns to superuser. */
async function asRole(role, sql, params = []) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  await db.exec(`SET ROLE ${role}`)
  try {
    return await db.query(sql, params)
  } finally {
    await actAsService()
  }
}

/** Superuser statement (service-equivalent owner). Always resets the role first. */
async function su(sql, params = []) {
  await actAsService()
  return db.query(sql, params)
}

async function suOne(sql, params = []) {
  return (await su(sql, params)).rows[0]
}

/** First cell of a row, JSON-decoded when the cell is a JSON text. */
function cellOf(row) {
  const v = Object.values(row)[0]
  return typeof v === 'string' && /^\s*[{[]/.test(v) ? JSON.parse(v) : v
}

/**
 * Outcome of a statement: refused (raised, or returned {ok:false,error}) or accepted.
 * `code` is the raised message or the returned error code; `rows` the result rows.
 */
async function attempt(fn) {
  try {
    const rows = await fn()
    const body = rows.length ? cellOf(rows[0]) : null
    if (body && typeof body === 'object' && body.ok === false) {
      return { refused: true, code: String(body.error ?? ''), rows, body }
    }
    return { refused: false, code: '', rows, body }
  } catch (error) {
    const code = firstLine(error)
    // A missing object is NOT a refusal: it must never satisfy a refusal expectation.
    return { refused: true, code, rows: [], body: null, missing: /does not exist/.test(code) }
  }
}

const suOut = (sql, params = []) => attempt(async () => (await su(sql, params)).rows)
const asRoleOut = (role, sql, params = []) => attempt(async () => (await asRole(role, sql, params)).rows)

/** First value of an accepted outcome (text, number, or decoded json). */
function valueOf(o) {
  return o.rows.length ? cellOf(o.rows[0]) : null
}

/** The JSON body of an outcome; fails the case if the outcome carries no object. */
function bodyOf(o) {
  const b = o.body ?? valueOf(o)
  expect(b && typeof b === 'object', `no JSON body (${String(b).slice(0, 80)})`)
  return b
}

function expectRefused(o, codes, label = '') {
  const list = Array.isArray(codes) ? codes : [codes]
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 120)})`)
  expect(o.refused, `${label}accepted (${String(JSON.stringify(o.body ?? valueOf(o))).slice(0, 160)}), expected refusal ${list.join(' | ')}`)
  expect(
    list.some((c) => o.code.includes(c)),
    `${label}refused with "${o.code.slice(0, 160)}", expected ${list.join(' | ')}`
  )
}

function expectRefusedMatch(o, re, label = '') {
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 120)})`)
  expect(o.refused, `${label}accepted (${String(JSON.stringify(o.body ?? valueOf(o))).slice(0, 160)}), expected refusal ${re}`)
  expect(re.test(o.code), `${label}refused with "${o.code.slice(0, 160)}", expected ${re}`)
}

function expectAnyRefusal(o, label = '') {
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 120)})`)
  expect(o.refused, `${label}accepted (${String(JSON.stringify(o.body ?? valueOf(o))).slice(0, 160)}), expected a refusal`)
}

function expectAccepted(o, label = '') {
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 120)})`)
  expect(!o.refused, `${label}refused with "${o.code.slice(0, 160)}"`)
}

// ---------------------------------------------------------------------------
// Money helpers (BigInt paise). Independent oracle for the SQL under test.
// ---------------------------------------------------------------------------
/** Half-up integer division for a non-negative numerator and an even denominator. */
const halfUp = (num, den) => (num + den / 2n) / den

/** Any stored numeric cell as BigInt; null counts as zero. */
const big = (x) => BigInt(String(x ?? 0))

/** Expected split for a taxable amount (BigInt paise). */
function ruleSplit(taxable, same) {
  const T = BigInt(taxable)
  if (same) {
    const c = halfUp(18n * T, 200n)
    return { cgst: c, sgst: c, igst: 0n, total: T + 2n * c }
  }
  const i = halfUp(18n * T, 100n)
  return { cgst: 0n, sgst: 0n, igst: i, total: T + i }
}

/** Monthly list prices, paise, excluding GST (rupees 499 / 1999 / 4999). */
const MONTHLY = { starter: 49900n, growth: 199900n, professional: 499900n }
const SUPPLIER_GSTIN = '27ABCDE1234F1Z5'
const SUPPLIER_LEGAL_NAME = 'TruckOpti Logistics Pvt Ltd'

/**
 * Expected order economics. Yearly = 10 x monthly. FOUNDING50 halves the subtotal (every seeded subtotal is
 * even, so the half is exact). Tax is on the discounted taxable amount.
 */
function expectedOrder({ tier, cycle = 'monthly', coupon = null, same = true }) {
  const monthly = MONTHLY[tier]
  const subtotal = cycle === 'yearly' ? monthly * 10n : monthly
  const discount = coupon === 'FOUNDING50' ? subtotal / 2n : 0n
  const taxable = subtotal - discount
  const s = ruleSplit(taxable, same)
  return { subtotal, discount, taxable, cgst: s.cgst, sgst: s.sgst, igst: s.igst, total: s.total }
}

/**
 * Indian financial-year label ('26-27') of an instant. Same rule as the migration: Asia/Kolkata
 * (UTC+05:30, no DST), FY starts 1 April 00:00 local.
 */
function fyOfInstant(iso) {
  const ist = new Date(new Date(iso).getTime() + 330 * 60 * 1000)
  const y = ist.getUTCFullYear()
  const start = ist.getUTCMonth() + 1 >= 4 ? y : y - 1
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`
}

const fyNow = () => fyOfInstant(new Date().toISOString())

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
let gstinCounter = 0
/** A GSTIN that passes the pinned pattern, with the given two-digit state code. */
function gstinFor(stateCode) {
  gstinCounter += 1
  return `${stateCode}ABCDE${String(1000 + (gstinCounter % 9000))}F1Z5`
}

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [id, email, JSON.stringify({})])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

/**
 * Approved, Maharashtra (27) agency by default. Pass gstin null for a no-GSTIN agency; stateName null for no state.
 * Pass owner false for an agency without an owner account.
 */
async function createAgency({ gstin = gstinFor('27'), stateName = 'Maharashtra', status = 'approved', owner = true } = {}) {
  const userId = owner ? await createUser('sub-owner') : null
  const id = uid()
  const name = `Sub ${seq} Transport Pvt Ltd`
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number, state)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6, $7)`,
    [id, userId, name, status, gstin, `ABCDE${String(1000 + (seq % 9000))}Q`, stateName]
  )
  return { id, userId, name, gstin, stateName }
}

async function planIdOf(tier) {
  return (await suOne(`SELECT id FROM public.subscription_plans WHERE tier = $1`, [tier])).id
}

/** Inserts a subscription row as superuser. `days` is the period end relative to now (negative = in the past). */
async function makeSub(agencyId, status, { tier = 'starter', cycle = 'monthly', days = 20 } = {}) {
  const planId = await planIdOf(tier)
  const id = uid()
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, grace_end)
     VALUES ($1, NULL, $2, $3, $4, $5,
             now() + make_interval(days => $6::int - 30),
             now() + make_interval(days => $6::int),
             CASE WHEN $4 = 'trial' THEN now() + interval '14 days' END,
             CASE WHEN $4 = 'grace' THEN now() + interval '7 days' END)`,
    [id, agencyId, planId, status, cycle, days]
  )
  return id
}

async function setupFixtures() {
  await su(
    `UPDATE public.platform_billing_settings
        SET legal_name = $1, gstin = $2, address = 'Mumbai, Maharashtra', state_code = '27',
            sac_code = '997331', enforcement_enabled = false`,
    [SUPPLIER_LEGAL_NAME, SUPPLIER_GSTIN]
  )
  await su(
    `INSERT INTO public.subscription_coupons (code, percent_off, max_cycles, monthly_only, valid_until, max_redemptions)
     VALUES ('ONESHOT', 10, 1, false, NULL, 1)`
  )
  await su(
    `INSERT INTO public.subscription_coupons (code, percent_off, max_cycles, monthly_only, valid_until, max_redemptions)
     VALUES ('OLDCOUPON', 20, 1, false, '2020-01-01T00:00:00Z', NULL)`
  )
  const n = (await suOne(`SELECT count(*)::int AS n FROM public.subscription_plans WHERE tier IN ('starter', 'growth', 'professional')`)).n
  expect(Number(n) === 3, `expected three priced plans, found ${n}`)
}

// ---------------------------------------------------------------------------
// Command wrappers
// ---------------------------------------------------------------------------
async function orderOut(agencyId, { tier = 'starter', cycle = 'monthly', coupon = null, orderId = nx('order') } = {}) {
  const o = await suOut(
    `SELECT public.subscription_create_order($1::uuid, $2::text, $3::text, $4::text, $5::text) AS r`,
    [agencyId, tier, cycle, coupon, orderId]
  )
  return { ...o, orderId }
}

async function paymentRow(orderId) {
  return (await su(`SELECT * FROM public.payment_history WHERE razorpay_order_id = $1`, [orderId])).rows[0]
}

async function activateOut(orderId, paymentId, { amount, currency = 'INR', method = 'upi', source = 'verify' } = {}) {
  const amt = amount ?? big((await paymentRow(orderId)).amount)
  return suOut(
    `SELECT public.subscription_activate_payment($1::text, $2::text, $3, $4::text, $5::text, $6::text) AS r`,
    [orderId, paymentId, String(amt), currency, method, source]
  )
}

function refundOut(paymentId, refundId, amount) {
  return suOut(`SELECT public.subscription_record_refund($1::text, $2::text, $3) AS r`, [paymentId, refundId, String(amount)])
}

// ---------------------------------------------------------------------------
// Scenario builders
// ---------------------------------------------------------------------------
/** Creates an agency, a subscription in `status`, and one priced order. Nothing is activated yet. */
async function freshOrder({ status = 'trial', tier = 'starter', cycle = 'monthly', coupon = null, days = 20, agency = {} } = {}) {
  const a = await createAgency(agency)
  const subId = await makeSub(a.id, status, { tier, cycle, days })
  const orderId = nx('order')
  const o = await orderOut(a.id, { tier, cycle, coupon, orderId })
  expectAccepted(o, 'create_order refused: ')
  const row = await paymentRow(orderId)
  expect(row, 'no payment_history row for the order')
  return { agency: a, subId, orderId, row, total: big(row.amount), tier, cycle, coupon }
}

/** freshOrder plus a verified payment. */
async function paidFixture(opts = {}) {
  const f = await freshOrder(opts)
  const pay = nx('pay')
  const act = await activateOut(f.orderId, pay)
  expectAccepted(act, 'activation refused: ')
  return { ...f, pay, act, body: bodyOf(act) }
}

/** Creates an order for an existing agency (renewal) and returns its total. */
async function renewalOrder(agencyId, { tier = 'starter', cycle = 'monthly', coupon = null } = {}) {
  const o = await orderOut(agencyId, { tier, cycle, coupon })
  expectAccepted(o, 'renewal create_order refused: ')
  const row = await paymentRow(o.orderId)
  return { orderId: o.orderId, row, total: big(row.amount) }
}

async function priceOrder({ tier = 'starter', cycle = 'monthly', coupon = null, same = true, agency = {} } = {}) {
  const f = await freshOrder({ status: 'trial', tier, cycle, coupon, agency })
  const want = expectedOrder({ tier, cycle, coupon, same })
  const r = f.row
  const bad = []
  const check = (label, got, exp) => {
    if (big(got) !== exp) bad.push(`${label} got ${got ?? 'null'} want ${exp}`)
  }
  check('amount', r.amount, want.total)
  check('subtotal_paise', r.subtotal_paise, want.subtotal)
  check('discount_paise', r.discount_paise, want.discount)
  check('cgst_paise', r.cgst_paise, want.cgst)
  check('sgst_paise', r.sgst_paise, want.sgst)
  check('igst_paise', r.igst_paise, want.igst)
  expect((r.coupon_code ?? null) === (coupon ?? null), `coupon_code got ${r.coupon_code ?? 'null'} want ${coupon ?? 'null'}`)
  expect(bad.length === 0, bad.join(', '))
  return f
}

async function subOf(subId) {
  return (await su(`SELECT * FROM public.subscriptions WHERE id = $1`, [subId])).rows[0]
}

async function invoicesFor(agencyId) {
  return (await su(`SELECT * FROM public.subscription_invoices WHERE agency_id = $1 ORDER BY issued_at, id`, [agencyId])).rows
}

async function notesFor(invoiceId) {
  return (await su(`SELECT * FROM public.subscription_credit_notes WHERE invoice_id = $1 ORDER BY issued_at, id`, [invoiceId])).rows
}

async function redemptionsFor(agencyId) {
  return (await su(`SELECT * FROM public.subscription_coupon_redemptions WHERE agency_id = $1 ORDER BY cycle_no`, [agencyId])).rows
}

async function counterLast(series, fy) {
  const r = await su(`SELECT last_no FROM public.subscription_invoice_counters WHERE series = $1 AND fy = $2`, [series, fy])
  return r.rows.length ? Number(r.rows[0].last_no) : 0
}

/** Runs fn with a temporary trigger that refuses every invoice insert AFTER the number has been minted. */
async function withForcedInvoiceFailure(fn) {
  await su(`CREATE OR REPLACE FUNCTION public.zz_harness_force_invoice_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'harness forced invoice failure' USING ERRCODE = 'P0001'; END $$`)
  await su(`CREATE TRIGGER zz_harness_force_invoice_fail BEFORE INSERT ON public.subscription_invoices FOR EACH ROW EXECUTE FUNCTION public.zz_harness_force_invoice_fail()`)
  try {
    return await fn()
  } finally {
    await su(`DROP TRIGGER IF EXISTS zz_harness_force_invoice_fail ON public.subscription_invoices`)
    await su(`DROP FUNCTION IF EXISTS public.zz_harness_force_invoice_fail()`)
  }
}

async function privilegeOf(role, table, priv) {
  const r = await su(`SELECT has_table_privilege($1, $2, $3) AS p`, [role, `public.${table}`, priv])
  return r.rows[0].p === true
}

async function fnInfo(name) {
  const r = await su(
    `SELECT p.prosecdef, p.proconfig, p.provolatile, l.lanname,
            EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub_exec,
            has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
            has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_exec
       FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
       JOIN pg_language l ON l.oid = p.prolang
      WHERE p.proname = $1`,
    [name]
  )
  expect(r.rows.length === 1, `expected one public.${name}, found ${r.rows.length}`)
  return r.rows[0]
}

/** Argument names in declaration order, from the function's identity arguments. */
async function argNamesOf(name) {
  const r = await su(
    `SELECT pg_get_function_identity_arguments(p.oid) AS a
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname = $1`,
    [name]
  )
  expect(r.rows.length === 1, `expected one public.${name}, found ${r.rows.length}`)
  return r.rows[0].a.split(',').map((s) => s.trim().split(' ')[0]).filter(Boolean)
}

async function colsOf(table) {
  const r = await su(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])
  return new Set(r.rows.map((x) => x.column_name))
}

function expectColumns(have, wanted, label) {
  const missing = wanted.filter((c) => !have.has(c))
  expect(missing.length === 0, `${label} missing columns: ${missing.join(', ')}`)
}

function expectServiceOnly(info, label) {
  expect(!info.pub_exec, `${label}: PUBLIC has EXECUTE`)
  expect(!info.anon_exec, `${label}: anon has EXECUTE`)
  expect(!info.auth_exec, `${label}: authenticated has EXECUTE`)
  expect(info.svc_exec === true, `${label}: service_role lacks EXECUTE`)
}

function expectSearchPath(info, label) {
  expect((info.proconfig ?? []).some((c) => /^search_path=/.test(c)), `${label}: search_path not pinned (${JSON.stringify(info.proconfig)})`)
}

const SNAPSHOT_COLS = [
  'agency_id', 'plan_id', 'billing_cycle', 'subtotal_paise', 'discount_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'coupon_code',
]

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Webhook battery (H cases). Fixtures and command wrappers come from the activation harness above.
// ---------------------------------------------------------------------------
let hNo = 0
const hName = (title) => `H${String(++hNo).padStart(2, '0')}. ${title}`
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k)
const sha256Of = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
let idSeq = 0
const payId = () => `pay_WH${String(++idSeq).padStart(8, '0')}`
const rfId = () => `rfnd_WH${String(++idSeq).padStart(8, '0')}`
const evtId = () => `evt_WH${String(++idSeq).padStart(8, '0')}`
const missingOrderId = () => `order_missing_${String(++idSeq).padStart(8, '0')}`
const RZP_SECRET = 'whsec_harness_only_0001'
const RZP_BODY = JSON.stringify({ entity: 'event', event: 'payment.captured', payload: {} })
const RZP_SIG = createHmac('sha256', RZP_SECRET).update(RZP_BODY).digest('hex')

/** Razorpay event envelope: the whole parsed body, as the Edge function passes it. */
function eventBody(event, payload) {
  return { entity: 'event', event, payload, created_at: 1763000000 }
}
function paymentEntity({ id, orderId, amount, currency = 'INR', method = 'card', status = 'captured' }) {
  return { id, entity: 'payment', order_id: orderId, amount, currency, method, status }
}
const capturedBody = (p) => eventBody('payment.captured', { payment: { entity: paymentEntity(p) } })
const failedBody = (p) => eventBody('payment.failed', { payment: { entity: paymentEntity({ ...p, status: 'failed' }) } })
function orderPaidBody({ orderId, paymentId, amount, currency = 'INR', method = 'card' }) {
  return eventBody('order.paid', {
    order: { entity: { id: orderId, entity: 'order', amount, currency, status: 'paid' } },
    payment: { entity: paymentEntity({ id: paymentId, orderId, amount, currency, method }) },
  })
}
function refundBody({ refundId, paymentId, amount }) {
  return eventBody('refund.processed', {
    refund: { entity: { id: refundId, entity: 'refund', payment_id: paymentId, amount, currency: 'INR' } },
  })
}

/** One delivery. opts.type / opts.hash override the envelope fields (sanity and reuse cases). */
async function hookOut(eventId, body, opts = {}) {
  const type = hasOwn(opts, 'type') ? opts.type : body.event
  const hash = hasOwn(opts, 'hash') ? opts.hash : sha256Of(body)
  return suOut(
    `SELECT public.subscription_webhook_process($1::text, $2::text, $3::jsonb, $4::text) AS r`,
    [eventId, type, JSON.stringify(body), hash]
  )
}

async function verifyOut(body, sig, secret) {
  return suOut(`SELECT public.subscription_verify_webhook_signature($1::text, $2::text, $3::text) AS r`, [body, sig, secret])
}

async function eventRow(eventId) {
  return (await su(`SELECT * FROM public.razorpay_webhook_events WHERE event_id = $1`, [eventId])).rows[0]
}
async function eventCount() {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.razorpay_webhook_events`)).n)
}
async function payHistoryCount(orderId) {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.payment_history WHERE razorpay_order_id = $1`, [orderId])).n)
}
async function creditNotesForRefund(refundId) {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.subscription_credit_notes WHERE refund_id = $1`, [refundId])).n)
}

/** Agency with an ACTIVE subscription and a priced renewal order (nothing activated yet). */
async function renewalFixture() {
  const agency = await createAgency()
  const subId = await makeSub(agency.id, 'active', { days: 20 })
  const order = await renewalOrder(agency.id)
  return { agency, subId, ...order }
}

/** First purchase (trial by default) activated through a webhook payment.captured. */
async function webhookPaidFixture(opts = {}) {
  const f = await freshOrder(opts)
  const pay = payId()
  const o = await hookOut(evtId(), capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total), method: 'card' }))
  expectAccepted(o, 'webhook activation refused: ')
  return { ...f, pay }
}

/** A first purchase whose activation hits a forced transient failure inside the transaction. */
async function transientRun() {
  const f = await freshOrder({ status: 'trial' })
  const pay = payId()
  const evt = evtId()
  const body = capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total) })
  const o = await withForcedInvoiceFailure(() => hookOut(evt, body))
  return { f, pay, evt, body, o }
}

async function main() {
  await db.exec(BOOTSTRAP)
  await db.exec('CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions')
  const applied = await applyChain()
  chainFiles = applied

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]}; ${MIGRATION_FILE} present=${MIGRATION_PRESENT}, applied=${migrationApplied})`)
  try {
    await setupFixtures()
    fixturesReady = true
  } catch (error) {
    fixtureError = firstLine(error)
  }

  // =========================================================================
  // 0. Schema, signatures, privileges
  // =========================================================================
  await testCase(hName(`migration supabase/migrations/${MIGRATION_FILE} exists`), async () => {
    expect(MIGRATION_PRESENT, `supabase/migrations/${MIGRATION_FILE} does not exist yet (not written)`)
  })

  await gatedCase(hName('the webhook migration applies after 20261029 (activation) and before 20261031 (sweeps)'), async () => {
    const i = chainFiles.indexOf(MIGRATION_FILE)
    const lo = chainFiles.indexOf('20261029000000_subscription_activation.sql')
    const hi = chainFiles.indexOf('20261031000000_subscription_sweeps.sql')
    expect(i > lo && i < hi, `index ${i} not between activation ${lo} and sweeps ${hi}`)
  })

  await gatedCase(hName('razorpay_webhook_events has the pinned columns'), async () => {
    expectColumns(
      await colsOf('razorpay_webhook_events'),
      ['event_id', 'event_type', 'order_id', 'payment_id', 'payload_sha256', 'received_at', 'processed_at', 'result', 'error'],
      'razorpay_webhook_events'
    )
  })

  await gatedCase(hName('event_id is the primary key and is text'), async () => {
    const r = await su(
      `SELECT a.attname AS col, format_type(a.atttypid, a.atttypmod) AS typ
         FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'public.razorpay_webhook_events'::regclass AND i.indisprimary`
    )
    expect(r.rows.length === 1 && r.rows[0].col === 'event_id' && r.rows[0].typ === 'text', `primary key ${JSON.stringify(r.rows)}`)
  })

  await gatedCase(hName('subscription_webhook_process takes exactly (p_event_id, p_event_type, p_payload, p_payload_sha256)'), async () => {
    const args = await argNamesOf('subscription_webhook_process')
    expect(JSON.stringify(args) === JSON.stringify(['p_event_id', 'p_event_type', 'p_payload', 'p_payload_sha256']), `args were ${args.join(', ')}`)
  })

  await gatedCase(hName('subscription_verify_webhook_signature takes exactly (p_body, p_signature, p_secret)'), async () => {
    const args = await argNamesOf('subscription_verify_webhook_signature')
    expect(JSON.stringify(args) === JSON.stringify(['p_body', 'p_signature', 'p_secret']), `args were ${args.join(', ')}`)
  })

  await gatedCase(hName('subscription_webhook_process pins search_path'), async () => {
    expectSearchPath(await fnInfo('subscription_webhook_process'), 'subscription_webhook_process')
  })

  await gatedCase(hName('subscription_verify_webhook_signature pins search_path'), async () => {
    expectSearchPath(await fnInfo('subscription_verify_webhook_signature'), 'subscription_verify_webhook_signature')
  })

  await gatedCase(hName('subscription_webhook_process is SECURITY DEFINER'), async () => {
    expect((await fnInfo('subscription_webhook_process')).prosecdef === true, 'not SECURITY DEFINER')
  })

  await gatedCase(hName('subscription_webhook_process is service_role only (PUBLIC, anon, authenticated denied)'), async () => {
    expectServiceOnly(await fnInfo('subscription_webhook_process'), 'subscription_webhook_process')
  })

  await gatedCase(hName('subscription_verify_webhook_signature is not executable by PUBLIC, anon or authenticated (internal)'), async () => {
    const info = await fnInfo('subscription_verify_webhook_signature')
    expect(!info.pub_exec && !info.anon_exec && !info.auth_exec, `executable by a client role: ${JSON.stringify(info)}`)
  })

  await gatedCase(hName('authenticated cannot call subscription_webhook_process (permission denied)'), async () => {
    const o = await asRoleOut('authenticated', `SELECT public.subscription_webhook_process('evt_probe', 'payment.captured', '{}'::jsonb, 'x') AS r`)
    expectRefusedMatch(o, /permission denied/i)
  })

  await gatedCase(hName('anon cannot call subscription_webhook_process (permission denied)'), async () => {
    const o = await asRoleOut('anon', `SELECT public.subscription_webhook_process('evt_probe', 'payment.captured', '{}'::jsonb, 'x') AS r`)
    expectRefusedMatch(o, /permission denied/i)
  })

  await gatedCase(hName('subscription_verify_webhook_signature is IMMUTABLE'), async () => {
    const info = await fnInfo('subscription_verify_webhook_signature')
    expect(info.provolatile === 'i', `provolatile ${info.provolatile} (want i)`)
  })

  await gatedCase(hName('razorpay_webhook_events has no foreign keys (events survive agency deletion)'), async () => {
    const r = await su(`SELECT count(*)::int AS n FROM pg_constraint WHERE conrelid = 'public.razorpay_webhook_events'::regclass AND contype = 'f'`)
    expect(Number(r.rows[0].n) === 0, `${r.rows[0].n} foreign key(s) on the events table`)
  })

  await gatedCase(hName('anon and authenticated hold no privilege on razorpay_webhook_events'), async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const p of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        expect(!(await privilegeOf(role, 'razorpay_webhook_events', p)), `${role} holds ${p}`)
      }
    }
  })

  await gatedCase(hName('service_role holds no UPDATE, DELETE or TRUNCATE on razorpay_webhook_events'), async () => {
    for (const p of ['UPDATE', 'DELETE', 'TRUNCATE']) {
      expect(!(await privilegeOf('service_role', 'razorpay_webhook_events', p)), `service_role holds ${p}`)
    }
  })

  // =========================================================================
  // 1. payment.captured and order.paid: activation through the single path
  // =========================================================================
  await gatedCase(hName('payment.captured on a first purchase activates the subscription (result activated, ok true)'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const o = await hookOut(evtId(), capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total), method: 'card' }))
    expectAccepted(o, 'webhook refused: ')
    const b = bodyOf(o)
    expect(b.ok === true && b.result === 'activated', `got ${JSON.stringify(b)}`)
    expect((await subOf(f.subId)).status === 'active', `subscription is ${(await subOf(f.subId)).status}`)
  })

  await gatedCase(hName('the event row is recorded with type, order, payment, hash, received_at, processed_at and result'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = payId()
    const evt = evtId()
    const body = capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total), method: 'card' })
    expectAccepted(await hookOut(evt, body))
    const r = await eventRow(evt)
    expect(r, 'no razorpay_webhook_events row')
    expect(
      r.event_type === 'payment.captured' && r.order_id === f.orderId && r.payment_id === pay &&
        r.payload_sha256 === sha256Of(body) && r.result === 'activated',
      `row ${JSON.stringify(r)}`
    )
    expect(r.received_at && r.processed_at, 'received_at or processed_at not set')
  })

  await gatedCase(hName('payment.captured writes the captured payment id, method card and status success on the payment row'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = payId()
    expectAccepted(await hookOut(evtId(), capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total), method: 'card' })))
    const row = await paymentRow(f.orderId)
    expect(row.razorpay_payment_id === pay && row.status === 'success' && row.payment_method === 'card', `row ${row.status}/${row.payment_method}/${row.razorpay_payment_id}`)
  })

  await gatedCase(hName('order.paid on a first purchase activates using order.entity.id and payment.entity fields'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = payId()
    const o = await hookOut(evtId(), orderPaidBody({ orderId: f.orderId, paymentId: pay, amount: Number(f.total), method: 'upi' }))
    expectAccepted(o, 'order.paid refused: ')
    expect(bodyOf(o).result === 'activated', `result ${bodyOf(o).result}`)
    expect((await subOf(f.subId)).status === 'active', 'subscription not active')
    expect((await paymentRow(f.orderId)).razorpay_payment_id === pay, 'payment id not stored from payment.entity')
  })

  await gatedCase(hName('a second event (new id) for an already-captured payment is a replay with one invoice'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = payId()
    expectAccepted(await hookOut(evtId(), capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total) })))
    const o = await hookOut(evtId(), orderPaidBody({ orderId: f.orderId, paymentId: pay, amount: Number(f.total) }))
    expectAccepted(o, 'order.paid refused: ')
    expect(bodyOf(o).result === 'replay', `result ${bodyOf(o).result}`)
    expect((await invoicesFor(f.agency.id)).length === 1, `invoices ${(await invoicesFor(f.agency.id)).length}`)
  })

  await gatedCase(hName('a replayed event is recorded with result replay'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = payId()
    expectAccepted(await hookOut(evtId(), capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total) })))
    const evt = evtId()
    expectAccepted(await hookOut(evt, orderPaidBody({ orderId: f.orderId, paymentId: pay, amount: Number(f.total) })))
    expect((await eventRow(evt)).result === 'replay', `row result ${(await eventRow(evt)).result}`)
  })

  // =========================================================================
  // 2. Dedupe table
  // =========================================================================
  await gatedCase(hName('same event id with the same payload hash returns duplicate'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const evt = evtId()
    const body = capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })
    expectAccepted(await hookOut(evt, body))
    const o = await hookOut(evt, body)
    expectAccepted(o, 'duplicate refused: ')
    expect(bodyOf(o).result === 'duplicate', `result ${bodyOf(o).result}`)
  })

  await gatedCase(hName('a duplicate delivery has no second effect (one invoice, same period end, same processed_at)'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const evt = evtId()
    const body = capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })
    expectAccepted(await hookOut(evt, body))
    const before = await eventRow(evt)
    const subBefore = await subOf(f.subId)
    expectAccepted(await hookOut(evt, body))
    const after = await eventRow(evt)
    const subAfter = await subOf(f.subId)
    expect((await invoicesFor(f.agency.id)).length === 1, 'duplicate created another invoice')
    expect(String(subAfter.current_period_end) === String(subBefore.current_period_end), 'duplicate moved the period end')
    expect(String(after.processed_at) === String(before.processed_at), 'duplicate rewrote processed_at')
  })

  await gatedCase(hName('same event id with a different payload hash is event_id_reused'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const evt = evtId()
    expectAccepted(await hookOut(evt, capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })))
    const o = await hookOut(evt, capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) }), { hash: sha256Of('other body') })
    expectRefusedMatch(o, /event_id_reused/)
  })

  await gatedCase(hName('event_id_reused records nothing new and leaves the original row untouched'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const evt = evtId()
    const body = capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })
    expectAccepted(await hookOut(evt, body))
    const before = await eventRow(evt)
    const n0 = await eventCount()
    await hookOut(evt, capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) }), { hash: sha256Of('other body') })
    expect((await eventCount()) === n0, 'a row was recorded for a reused event id')
    const after = await eventRow(evt)
    expect(after.payload_sha256 === before.payload_sha256 && after.result === before.result, 'original row changed')
  })

  await gatedCase(hName('event_id_reused has no effect on the order its payload names'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const other = await freshOrder({ status: 'trial' })
    const evt = evtId()
    expectAccepted(await hookOut(evt, capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })))
    await hookOut(evt, capturedBody({ id: payId(), orderId: other.orderId, amount: Number(other.total) }), { hash: sha256Of('x') })
    expect((await paymentRow(other.orderId)).status === 'pending', `other order is ${(await paymentRow(other.orderId)).status}`)
    expect((await subOf(other.subId)).status === 'trial', 'other subscription changed')
  })

  await gatedCase(hName('five sequential deliveries of one event: one activated, four duplicate, one invoice'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const evt = evtId()
    const body = capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })
    const outs = []
    for (let i = 0; i < 5; i += 1) outs.push(bodyOf(await hookOut(evt, body)))
    expect(outs[0].result === 'activated', `first ${outs[0].result}`)
    expect(outs.slice(1).every((b) => b.result === 'duplicate'), `repeats ${outs.map((b) => b.result).join(',')}`)
    expect((await invoicesFor(f.agency.id)).length === 1, 'repeats created invoices')
  })

  // =========================================================================
  // 3. Orphans and amount mismatch
  // =========================================================================
  await gatedCase(hName('an unknown order id is recorded as orphan with ok true (no retry storm)'), async () => {
    const o = await hookOut(evtId(), capturedBody({ id: payId(), orderId: missingOrderId(), amount: 49900 }))
    expectAccepted(o, 'orphan refused: ')
    expect(bodyOf(o).ok === true && bodyOf(o).result === 'orphan', `got ${JSON.stringify(bodyOf(o))}`)
  })

  await gatedCase(hName('an orphan row keeps its order id and no payment_history row is created for it'), async () => {
    const evt = evtId()
    const missing = missingOrderId()
    expectAccepted(await hookOut(evt, capturedBody({ id: payId(), orderId: missing, amount: 49900 })))
    const r = await eventRow(evt)
    expect(r && r.result === 'orphan' && r.order_id === missing, `row ${JSON.stringify(r)}`)
    expect((await payHistoryCount(missing)) === 0, 'a payment_history row was created')
  })

  await gatedCase(hName('amount mismatch by one paise records failed_recorded (ok true)'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const o = await hookOut(evtId(), capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) + 1 }))
    expectAccepted(o, 'amount mismatch refused: ')
    expect(bodyOf(o).ok === true && bodyOf(o).result === 'failed_recorded', `got ${JSON.stringify(bodyOf(o))}`)
  })

  await gatedCase(hName('failed_recorded keeps the captured payment id on the event row and the payment row'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = payId()
    const evt = evtId()
    expectAccepted(await hookOut(evt, capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total) + 1 })))
    const r = await eventRow(evt)
    expect(r.result === 'failed_recorded' && r.payment_id === pay, `event row ${JSON.stringify({ result: r.result, payment_id: r.payment_id })}`)
    const p = await paymentRow(f.orderId)
    expect(p.status === 'failed' && p.razorpay_payment_id === pay, `payment row ${p.status}/${p.razorpay_payment_id}`)
  })

  await gatedCase(hName('amount mismatch activates nothing: subscription still trial, no invoice'), async () => {
    const f = await freshOrder({ status: 'trial' })
    expectAccepted(await hookOut(evtId(), capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) - 1 })))
    expect((await subOf(f.subId)).status === 'trial', `subscription is ${(await subOf(f.subId)).status}`)
    expect((await invoicesFor(f.agency.id)).length === 0, 'an invoice was created')
  })

  await gatedCase(hName('a currency other than INR records failed_recorded with the payment id kept'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = payId()
    const evt = evtId()
    const o = await hookOut(evt, capturedBody({ id: pay, orderId: f.orderId, amount: Number(f.total), currency: 'USD' }))
    expectAccepted(o, 'currency mismatch refused: ')
    expect(bodyOf(o).ok === true && bodyOf(o).result === 'failed_recorded', `got ${JSON.stringify(bodyOf(o))}`)
    expect((await eventRow(evt)).payment_id === pay, 'captured payment id not kept')
  })

  // =========================================================================
  // 4. Transient database failure: retryable, records nothing
  // =========================================================================
  await gatedCase(hName('a transient database failure returns ok false with retryable true'), async () => {
    const t = await transientRun()
    expect(!t.o.missing, `object missing: ${t.o.code.slice(0, 120)}`)
    expect(t.o.body && t.o.body.ok === false && t.o.body.retryable === true, `expected {ok:false,retryable:true}, got ${t.o.code || JSON.stringify(t.o.body)}`)
  })

  await gatedCase(hName('a transient failure records no event row, changes no payment and no subscription'), async () => {
    const t = await transientRun()
    expect((await eventRow(t.evt)) === undefined, 'a row was recorded for a retryable failure')
    expect((await paymentRow(t.f.orderId)).status === 'pending', `payment is ${(await paymentRow(t.f.orderId)).status}`)
    expect((await subOf(t.f.subId)).status === 'trial', `subscription is ${(await subOf(t.f.subId)).status}`)
  })

  await gatedCase(hName('the same event id succeeds on retry after a transient failure (nothing was recorded)'), async () => {
    const t = await transientRun()
    expect(t.o.body && t.o.body.retryable === true, 'precondition: first attempt was not retryable')
    const again = await hookOut(t.evt, t.body)
    expectAccepted(again, 'retry refused: ')
    expect(bodyOf(again).result === 'activated', `retry result ${bodyOf(again).result}`)
  })

  await gatedCase(hName('the transient refusal body is typed and leaks no SQL text'), async () => {
    const t = await transientRun()
    const text = JSON.stringify(t.o.body ?? {})
    expect(t.o.body && typeof t.o.body.error === 'string' && /^[a-z_]+$/.test(t.o.body.error), `error ${JSON.stringify(t.o.body)}`)
    expect(!/harness|SQLSTATE|P0001|forced/i.test(text), `raw text in body: ${text.slice(0, 120)}`)
  })

  // =========================================================================
  // 5. payment.failed: renewals go past_due, first purchases never do, nothing cancels
  // =========================================================================
  await gatedCase(hName('payment.failed on a renewal moves the active subscription to past_due'), async () => {
    const r = await renewalFixture()
    const o = await hookOut(evtId(), failedBody({ id: payId(), orderId: r.orderId, amount: Number(r.total) }))
    expectAccepted(o, 'payment.failed refused: ')
    expect(bodyOf(o).result === 'past_due', `result ${bodyOf(o).result}`)
    expect((await subOf(r.subId)).status === 'past_due', `subscription is ${(await subOf(r.subId)).status}`)
  })

  await gatedCase(hName('payment.failed marks the payment row failed'), async () => {
    const r = await renewalFixture()
    expectAccepted(await hookOut(evtId(), failedBody({ id: payId(), orderId: r.orderId, amount: Number(r.total) })))
    expect((await paymentRow(r.orderId)).status === 'failed', `payment is ${(await paymentRow(r.orderId)).status}`)
  })

  await gatedCase(hName('payment.failed never cancels and never moves the period end'), async () => {
    const r = await renewalFixture()
    const before = await subOf(r.subId)
    expectAccepted(await hookOut(evtId(), failedBody({ id: payId(), orderId: r.orderId, amount: Number(r.total) })))
    const after = await subOf(r.subId)
    expect(after.status !== 'cancelled', 'payment.failed cancelled the subscription')
    expect(String(after.current_period_end) === String(before.current_period_end), 'period end moved')
  })

  await gatedCase(hName('payment.failed on a first purchase is failed_recorded and leaves the trial alone'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const o = await hookOut(evtId(), failedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) }))
    expectAccepted(o, 'payment.failed refused: ')
    expect(bodyOf(o).result === 'failed_recorded', `result ${bodyOf(o).result}`)
    expect((await subOf(f.subId)).status === 'trial', `subscription is ${(await subOf(f.subId)).status}`)
  })

  await gatedCase(hName('payment.failed for an expired agency purchase leaves the subscription expired'), async () => {
    const f = await freshOrder({ status: 'expired', days: -3 })
    expectAccepted(await hookOut(evtId(), failedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })))
    expect((await subOf(f.subId)).status === 'expired', `subscription is ${(await subOf(f.subId)).status}`)
  })

  await gatedCase(hName('payment.failed for an unknown order is orphan'), async () => {
    const o = await hookOut(evtId(), failedBody({ id: payId(), orderId: missingOrderId(), amount: 49900 }))
    expectAccepted(o, 'orphan refused: ')
    expect(bodyOf(o).result === 'orphan', `result ${bodyOf(o).result}`)
  })

  await gatedCase(hName('a repeated payment.failed event is a duplicate and the subscription stays past_due'), async () => {
    const r = await renewalFixture()
    const evt = evtId()
    const body = failedBody({ id: payId(), orderId: r.orderId, amount: Number(r.total) })
    expectAccepted(await hookOut(evt, body))
    const o = await hookOut(evt, body)
    expect(bodyOf(o).result === 'duplicate', `result ${bodyOf(o).result}`)
    expect((await subOf(r.subId)).status === 'past_due', `subscription is ${(await subOf(r.subId)).status}`)
  })

  // =========================================================================
  // 6. refund.processed: subscription_record_refund, idempotent on the refund id
  // =========================================================================
  await gatedCase(hName('refund.processed on a paid first purchase returns refunded, cancels the subscription, refunds the payment'), async () => {
    const p = await webhookPaidFixture({ status: 'trial' })
    const o = await hookOut(evtId(), refundBody({ refundId: rfId(), paymentId: p.pay, amount: Number(p.total) }))
    expectAccepted(o, 'refund refused: ')
    expect(bodyOf(o).result === 'refunded', `result ${bodyOf(o).result}`)
    expect((await subOf(p.subId)).status === 'cancelled', `subscription is ${(await subOf(p.subId)).status}`)
    expect((await paymentRow(p.orderId)).status === 'refunded', `payment is ${(await paymentRow(p.orderId)).status}`)
  })

  await gatedCase(hName('refund.processed writes exactly one credit note for the refund id'), async () => {
    const p = await webhookPaidFixture({ status: 'trial' })
    const rf = rfId()
    expectAccepted(await hookOut(evtId(), refundBody({ refundId: rf, paymentId: p.pay, amount: Number(p.total) })))
    expect((await creditNotesForRefund(rf)) === 1, `credit notes ${await creditNotesForRefund(rf)}`)
  })

  await gatedCase(hName('the same refund under a new event id is idempotent: still one credit note, ok true'), async () => {
    const p = await webhookPaidFixture({ status: 'trial' })
    const rf = rfId()
    expectAccepted(await hookOut(evtId(), refundBody({ refundId: rf, paymentId: p.pay, amount: Number(p.total) })))
    const o = await hookOut(evtId(), refundBody({ refundId: rf, paymentId: p.pay, amount: Number(p.total) }))
    expectAccepted(o, 'second refund delivery refused: ')
    expect((await creditNotesForRefund(rf)) === 1, `credit notes ${await creditNotesForRefund(rf)}`)
  })

  await gatedCase(hName('a refund for an unknown payment id is orphan or failed_recorded, ok true, no credit note'), async () => {
    const rf = rfId()
    const o = await hookOut(evtId(), refundBody({ refundId: rf, paymentId: 'pay_UNKNOWN_0001', amount: 49900 }))
    expectAccepted(o, 'refund for unknown payment refused: ')
    expect(['orphan', 'failed_recorded'].includes(bodyOf(o).result), `result ${bodyOf(o).result}`)
    expect((await creditNotesForRefund(rf)) === 0, 'a credit note was written')
  })

  await gatedCase(hName('a refund larger than the invoice is kept in subscription_refund_exceptions (ok true)'), async () => {
    const p = await webhookPaidFixture({ status: 'trial' })
    const rf = rfId()
    const o = await hookOut(evtId(), refundBody({ refundId: rf, paymentId: p.pay, amount: Number(p.total) + 100 }))
    expectAccepted(o, 'oversized refund refused: ')
    const n = await suOne(`SELECT count(*)::int AS n FROM public.subscription_refund_exceptions WHERE refund_id = $1`, [rf])
    expect(Number(n.n) >= 1, 'no refund exception row for the oversized refund')
  })

  // =========================================================================
  // 7. Other events are recorded and ignored
  // =========================================================================
  await gatedCase(hName('an unhandled event type is recorded as ignored with ok true'), async () => {
    const evt = evtId()
    const o = await hookOut(evt, eventBody('subscription.charged', { subscription: { entity: { id: 'sub_probe' } } }))
    expectAccepted(o, 'ignored refused: ')
    expect(bodyOf(o).ok === true && bodyOf(o).result === 'ignored', `got ${JSON.stringify(bodyOf(o))}`)
    const r = await eventRow(evt)
    expect(r && r.event_type === 'subscription.charged' && r.result === 'ignored', `row ${JSON.stringify(r)}`)
  })

  await gatedCase(hName('payment.authorized is ignored and leaves the payment row pending'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const o = await hookOut(evtId(), eventBody('payment.authorized', { payment: { entity: paymentEntity({ id: payId(), orderId: f.orderId, amount: Number(f.total) }) } }))
    expectAccepted(o, 'payment.authorized refused: ')
    expect(bodyOf(o).result === 'ignored', `result ${bodyOf(o).result}`)
    expect((await paymentRow(f.orderId)).status === 'pending', `payment is ${(await paymentRow(f.orderId)).status}`)
  })

  await gatedCase(hName('an ignored event leaves a live subscription active'), async () => {
    const r = await renewalFixture()
    expectAccepted(await hookOut(evtId(), eventBody('subscription.charged', { subscription: { entity: { id: 'sub_probe' } } })))
    expect((await subOf(r.subId)).status === 'active', `subscription is ${(await subOf(r.subId)).status}`)
  })

  // =========================================================================
  // 8. Payload sanity: typed refusals, nothing recorded
  // =========================================================================
  await gatedCase(hName('a missing event id is a typed refusal and records nothing'), async () => {
    const n0 = await eventCount()
    const body = capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900 })
    expectRefusedMatch(await hookOut(null, body), /event_id/)
    expectRefusedMatch(await hookOut('', body), /event_id/)
    expect((await eventCount()) === n0, 'a row was recorded')
  })

  await gatedCase(hName('a missing event type is a typed refusal and records nothing'), async () => {
    const n0 = await eventCount()
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900 }), { type: null }), /event_type/)
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900 }), { type: '' }), /event_type/)
    expect((await eventCount()) === n0, 'a row was recorded')
  })

  await gatedCase(hName('a payload above 256 KB is payload_too_large and records nothing'), async () => {
    const n0 = await eventCount()
    const huge = eventBody('payment.captured', { junk: 'x'.repeat(300 * 1024), payment: { entity: paymentEntity({ id: payId(), orderId: 'order_probe', amount: 49900 }) } })
    expectRefusedMatch(await hookOut(evtId(), huge), /payload_too_large|too_large/)
    expect((await eventCount()) === n0, 'a row was recorded')
  })

  await gatedCase(hName('a 200 KB payload (under the limit) is accepted as ignored'), async () => {
    const o = await hookOut(evtId(), eventBody('subscription.charged', { junk: 'x'.repeat(200 * 1024) }))
    expectAccepted(o, 'under-limit payload refused: ')
    expect(bodyOf(o).result === 'ignored', `result ${bodyOf(o).result}`)
  })

  await gatedCase(hName('a non-integer amount (49900.5) is a typed refusal and records nothing'), async () => {
    const n0 = await eventCount()
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900.5 })), /amount/)
    expect((await eventCount()) === n0, 'a row was recorded')
  })

  await gatedCase(hName('a negative amount is a typed refusal and records nothing'), async () => {
    const n0 = await eventCount()
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: -49900 })), /amount/)
    expect((await eventCount()) === n0, 'a row was recorded')
  })

  await gatedCase(hName('an amount sent as a string ("49900") is a typed refusal'), async () => {
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: '49900' })), /amount/)
  })

  await gatedCase(hName('a two-letter currency is a typed refusal'), async () => {
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900, currency: 'IN' })), /currency/)
  })

  await gatedCase(hName('a four-letter currency is a typed refusal'), async () => {
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900, currency: 'INRX' })), /currency/)
  })

  await gatedCase(hName('a null currency is a typed refusal'), async () => {
    expectRefusedMatch(await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900, currency: null })), /currency/)
  })

  await gatedCase(hName('sanity refusals return typed lower-case codes, never raw SQL messages'), async () => {
    const samples = [
      await hookOut(null, capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900 })),
      await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900 }), { type: null }),
      await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900.5 })),
      await hookOut(evtId(), capturedBody({ id: payId(), orderId: 'order_probe', amount: 49900, currency: 'IN' })),
    ]
    for (const s of samples) {
      expect(s.refused && !s.missing && /^[a-z_]+$/.test(s.code), `untyped refusal: ${s.code.slice(0, 120)}`)
    }
  })

  // =========================================================================
  // 9. Signature helper (HMAC-SHA256, hex, raw body)
  // =========================================================================
  await gatedCase(hName('RFC 4231 test case 2 vector verifies (key Jefe)'), async () => {
    const o = await verifyOut('what do ya want for nothing?', '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843', 'Jefe')
    expectAccepted(o, 'verify refused: ')
    expect(valueOf(o) === true, `RFC vector returned ${valueOf(o)}`)
  })

  await gatedCase(hName('a correct signature of the raw body verifies (node HMAC oracle)'), async () => {
    const o = await verifyOut(RZP_BODY, RZP_SIG, RZP_SECRET)
    expectAccepted(o, 'verify refused: ')
    expect(valueOf(o) === true, `valid signature returned ${valueOf(o)}`)
  })

  await gatedCase(hName('one changed hex character in the signature fails verification'), async () => {
    const bad = (RZP_SIG[0] === '0' ? '1' : '0') + RZP_SIG.slice(1)
    const o = await verifyOut(RZP_BODY, bad, RZP_SECRET)
    expectAccepted(o, 'verify refused: ')
    expect(valueOf(o) === false, `tampered signature returned ${valueOf(o)}`)
  })

  await gatedCase(hName('a body changed by one byte fails verification'), async () => {
    const o = await verifyOut(RZP_BODY + ' ', RZP_SIG, RZP_SECRET)
    expectAccepted(o, 'verify refused: ')
    expect(valueOf(o) === false, `changed body returned ${valueOf(o)}`)
  })

  await gatedCase(hName('the wrong secret fails verification'), async () => {
    const o = await verifyOut(RZP_BODY, RZP_SIG, 'whsec_other_secret')
    expectAccepted(o, 'verify refused: ')
    expect(valueOf(o) === false, `wrong secret returned ${valueOf(o)}`)
  })

  await gatedCase(hName('an empty signature fails verification without raising'), async () => {
    const o = await verifyOut(RZP_BODY, '', RZP_SECRET)
    expectAccepted(o, 'verify raised: ')
    expect(valueOf(o) === false, `empty signature returned ${valueOf(o)}`)
  })

  await gatedCase(hName('a non-hex signature fails verification without raising'), async () => {
    const o = await verifyOut(RZP_BODY, 'zz' + RZP_SIG.slice(2), RZP_SECRET)
    expectAccepted(o, 'verify raised: ')
    expect(valueOf(o) === false, `non-hex signature returned ${valueOf(o)}`)
  })

  await gatedCase(hName('an odd-length signature fails verification without raising'), async () => {
    const o = await verifyOut(RZP_BODY, RZP_SIG.slice(0, -1), RZP_SECRET)
    expectAccepted(o, 'verify raised: ')
    expect(valueOf(o) === false, `odd-length signature returned ${valueOf(o)}`)
  })

  await gatedCase(hName('an all-zero 64-character signature fails verification'), async () => {
    const o = await verifyOut(RZP_BODY, '0'.repeat(64), RZP_SECRET)
    expectAccepted(o, 'verify raised: ')
    expect(valueOf(o) === false, `zero signature returned ${valueOf(o)}`)
  })

  // =========================================================================
  // 10. Append-only table (destructive probes last: TRUNCATE only after every other case)
  // =========================================================================
  await gatedCase(hName('the superuser cannot UPDATE an event row'), async () => {
    const evt = evtId()
    expectAccepted(await hookOut(evt, eventBody('subscription.charged', {})))
    const o = await suOut(`UPDATE public.razorpay_webhook_events SET result = 'tampered' WHERE event_id = $1 RETURNING event_id`, [evt])
    expectAnyRefusal(o, 'superuser UPDATE: ')
    expect((await eventRow(evt)).result === 'ignored', 'the row was changed')
  })

  await gatedCase(hName('the superuser cannot DELETE an event row'), async () => {
    const evt = evtId()
    expectAccepted(await hookOut(evt, eventBody('subscription.charged', {})))
    const o = await suOut(`DELETE FROM public.razorpay_webhook_events WHERE event_id = $1 RETURNING event_id`, [evt])
    expectAnyRefusal(o, 'superuser DELETE: ')
    expect(!!(await eventRow(evt)), 'the row was deleted')
  })

  await gatedCase(hName('service_role cannot UPDATE an event row'), async () => {
    const evt = evtId()
    expectAccepted(await hookOut(evt, eventBody('subscription.charged', {})))
    const o = await asRoleOut('service_role', `UPDATE public.razorpay_webhook_events SET result = 'tampered' WHERE event_id = $1 RETURNING event_id`, [evt])
    expectAnyRefusal(o, 'service_role UPDATE: ')
    expect((await eventRow(evt)).result === 'ignored', 'the row was changed')
  })

  await gatedCase(hName('service_role cannot DELETE an event row'), async () => {
    const evt = evtId()
    expectAccepted(await hookOut(evt, eventBody('subscription.charged', {})))
    const o = await asRoleOut('service_role', `DELETE FROM public.razorpay_webhook_events WHERE event_id = $1 RETURNING event_id`, [evt])
    expectAnyRefusal(o, 'service_role DELETE: ')
    expect(!!(await eventRow(evt)), 'the row was deleted')
  })

  await gatedCase(hName('authenticated cannot DELETE an event row'), async () => {
    const evt = evtId()
    expectAccepted(await hookOut(evt, eventBody('subscription.charged', {})))
    const o = await asRoleOut('authenticated', `DELETE FROM public.razorpay_webhook_events WHERE event_id = $1 RETURNING event_id`, [evt])
    expectAnyRefusal(o, 'authenticated DELETE: ')
    expect(!!(await eventRow(evt)), 'the row was deleted')
  })

  await gatedCase(hName('the superuser cannot TRUNCATE the events table'), async () => {
    expectAnyRefusal(await suOut(`TRUNCATE public.razorpay_webhook_events`), 'superuser TRUNCATE: ')
  })

  await gatedCase(hName('service_role cannot TRUNCATE the events table'), async () => {
    expectAnyRefusal(await asRoleOut('service_role', `TRUNCATE public.razorpay_webhook_events`), 'service_role TRUNCATE: ')
  })

  // =========================================================================
  // 11. Opus review additions: attempts ledger, bounded retries, payload evidence, cancel_pending_order
  // =========================================================================
  const attemptsFor = async (evt) => Number((await suOne(`SELECT count(*)::int AS n FROM public.razorpay_webhook_attempts WHERE event_id = $1`, [evt])).n)
  async function withBillingUnset(fn) {
    const saved = await suOne(`SELECT gstin FROM public.platform_billing_settings`)
    await su(`UPDATE public.platform_billing_settings SET gstin = NULL`)
    try {
      return await fn()
    } finally {
      await su(`UPDATE public.platform_billing_settings SET gstin = $1`, [saved.gstin])
    }
  }

  await gatedCase(hName('razorpay_webhook_attempts exists, is append-only and holds no client privilege'), async () => {
    expectColumns(await colsOf('razorpay_webhook_attempts'), ['event_id', 'attempt_no', 'sqlstate_or_code', 'at'], 'razorpay_webhook_attempts')
    expectColumns(await colsOf('razorpay_webhook_events'), ['payload'], 'razorpay_webhook_events')
    const t = await transientRun()
    expect(t.o.body && t.o.body.retryable === true, 'precondition')
    expectAnyRefusal(await suOut(`UPDATE public.razorpay_webhook_attempts SET sqlstate_or_code = 'x' WHERE event_id = $1`, [t.evt]), 'UPDATE: ')
    expectAnyRefusal(await suOut(`DELETE FROM public.razorpay_webhook_attempts WHERE event_id = $1`, [t.evt]), 'DELETE: ')
    for (const role of ['anon', 'authenticated']) expect(!(await privilegeOf(role, 'razorpay_webhook_attempts', 'SELECT')), `${role} can SELECT`)
    for (const p of ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) expect(!(await privilegeOf('service_role', 'razorpay_webhook_attempts', p)), `service_role holds ${p}`)
  })

  await gatedCase(hName('a transient failure leaves one attempt row (outside the rolled-back work) and still no event row'), async () => {
    const t = await transientRun()
    expect((await attemptsFor(t.evt)) === 1, `attempts ${await attemptsFor(t.evt)}`)
    expect((await eventRow(t.evt)) === undefined, 'event row written')
  })

  await gatedCase(hName('a billing refusal that may clear later is retryable, writes no ledger row and leaves the payment untouched'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const evt = evtId()
    const body = capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })
    await withBillingUnset(async () => {
      const o = await hookOut(evt, body)
      expect(o.body && o.body.ok === false && o.body.retryable === true, `got ${JSON.stringify(o.body ?? o.code)}`)
    })
    expect((await eventRow(evt)) === undefined, 'ledger row written')
    expect((await paymentRow(f.orderId)).status === 'pending', 'payment row changed')
    expect((await attemptsFor(evt)) === 1, 'attempt not recorded')
    const again = await hookOut(evt, body)
    expect(bodyOf(again).result === 'activated', `retry after fix: ${JSON.stringify(bodyOf(again))}`)
  })

  await gatedCase(hName('the 8th attempt of a still-refused event is terminal: failed_recorded, ok true, body kept'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const evt = evtId()
    const body = capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) })
    await withBillingUnset(async () => {
      for (let i = 1; i <= 7; i += 1) {
        const o = await hookOut(evt, body)
        expect(o.body && o.body.retryable === true, `attempt ${i}: ${JSON.stringify(o.body ?? o.code)}`)
      }
      const last = await hookOut(evt, body)
      expect(last.body && last.body.ok === true && last.body.result === 'failed_recorded', `8th: ${JSON.stringify(last.body ?? last.code)}`)
    })
    const r = await eventRow(evt)
    expect(r && r.result === 'failed_recorded' && r.payload && r.payload.event === 'payment.captured', `row ${JSON.stringify(r && { result: r.result, error: r.error })}`)
    expect((await attemptsFor(evt)) === 7, `attempts ${await attemptsFor(evt)}`)
    expect(bodyOf(await hookOut(evt, body)).result === 'duplicate', 'repeat after terminal is not a duplicate')
  })

  await gatedCase(hName('failed_recorded keeps the whole payload on the event row; a success row keeps none'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const bad = evtId()
    expectAccepted(await hookOut(bad, capturedBody({ id: payId(), orderId: f.orderId, amount: Number(f.total) + 1 })))
    const r = await eventRow(bad)
    expect(r.result === 'failed_recorded' && r.payload && r.payload.payload.payment.entity.amount === Number(f.total) + 1, 'payload not kept')
    const good = evtId()
    const g = await freshOrder({ status: 'trial' })
    expectAccepted(await hookOut(good, capturedBody({ id: payId(), orderId: g.orderId, amount: Number(g.total) })))
    expect((await eventRow(good)).payload === null, 'payload kept for a success row')
  })

  await gatedCase(hName('order.paid whose order.entity.id and payment.entity.order_id disagree is failed_recorded and activates nothing'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const g = await freshOrder({ status: 'trial' })
    const body = orderPaidBody({ orderId: f.orderId, paymentId: payId(), amount: Number(f.total) })
    body.payload.payment.entity.order_id = g.orderId
    const o = await hookOut(evtId(), body)
    expectAccepted(o)
    expect(bodyOf(o).result === 'failed_recorded', `result ${bodyOf(o).result}`)
    expect((await subOf(f.subId)).status === 'trial' && (await subOf(g.subId)).status === 'trial', 'a subscription was activated')
  })

  await gatedCase(hName('payment.failed does not overwrite an AMOUNT_MISMATCH error message'), async () => {
    const r = await renewalFixture()
    expectAccepted(await hookOut(evtId(), capturedBody({ id: payId(), orderId: r.orderId, amount: Number(r.total) + 5 })))
    expect(/^AMOUNT_MISMATCH/.test((await paymentRow(r.orderId)).error_message ?? ''), 'precondition: no AMOUNT_MISMATCH message')
    expectAccepted(await hookOut(evtId(), failedBody({ id: payId(), orderId: r.orderId, amount: Number(r.total) })))
    expect(/^AMOUNT_MISMATCH/.test((await paymentRow(r.orderId)).error_message ?? ''), `message now ${(await paymentRow(r.orderId)).error_message}`)
  })

  await gatedCase(hName('subscription_cancel_pending_order is service_role only and pins search_path'), async () => {
    const info = await fnInfo('subscription_cancel_pending_order')
    expectServiceOnly(info, 'subscription_cancel_pending_order')
    expectSearchPath(info, 'subscription_cancel_pending_order')
    expect(info.prosecdef === true, 'not SECURITY DEFINER')
  })

  await gatedCase(hName('cancel_pending_order marks a pending order failed/cancelled, is idempotent, and the order can no longer reserve'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const a = bodyOf(await suOut(`SELECT public.subscription_cancel_pending_order($1) AS r`, [f.orderId]))
    expect(a.ok === true && a.result === 'cancelled', JSON.stringify(a))
    const row = await paymentRow(f.orderId)
    expect(row.status === 'failed' && row.metadata && row.metadata.cancelled === true, `row ${row.status}`)
    const b = bodyOf(await suOut(`SELECT public.subscription_cancel_pending_order($1) AS r`, [f.orderId]))
    expect(b.ok === true && b.result === 'already_cancelled', JSON.stringify(b))
  })

  await gatedCase(hName('cancel_pending_order never touches a paid order and types unknown orders'), async () => {
    const p = await paidFixture({ status: 'trial' })
    const a = bodyOf(await suOut(`SELECT public.subscription_cancel_pending_order($1) AS r`, [p.orderId]))
    expect(a.ok === true && a.result === 'not_pending', JSON.stringify(a))
    expect((await paymentRow(p.orderId)).status === 'success', 'paid order changed')
    const u = bodyOf(await suOut(`SELECT public.subscription_cancel_pending_order($1) AS r`, [missingOrderId()]))
    expect(u.ok === false && u.error === 'order_not_found', JSON.stringify(u))
    const n = bodyOf(await suOut(`SELECT public.subscription_cancel_pending_order($1) AS r`, ['']))
    expect(n.ok === false && n.error === 'invalid_order_id', JSON.stringify(n))
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
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
