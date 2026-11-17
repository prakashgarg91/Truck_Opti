#!/usr/bin/env node
/**
 * Subscription activation, order pricing and refunds (TO-152 S4) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the
 * supabase/migrations chain and drives the commands the way PostgREST does per request:
 * `SET ROLE authenticated` with `request.jwt.claims` set to the caller's sub.
 *
 * RED FIRST. The migration that implements this contract is NOT written yet
 * (supabase/migrations/20261029000000_subscription_activation.sql, created by another writer).
 * Every case that needs the new objects is gated and EXPECTED to fail now with "migration ... is missing";
 * A01 names the missing file.
 *
 * Contract under test: docs/TO-152-rulings.md section 3 (S4 activation and refund), section 5 (GST numbering
 * and tax) and section 7 (coupons). Money is integer paise (BigInt in this harness).
 *   Same state:      CGST = SGST = half-up(taxable x 18 / 200).
 *   Different state: IGST = half-up(taxable x 18 / 100). No rupee round-off.
 *
 * Pinned contract:
 *   public.subscription_create_order(p_agency_id uuid, p_plan_tier text, p_billing_cycle text,
 *     p_coupon_code text, p_razorpay_order_id text) RETURNS jsonb. NO money argument of any kind.
 *     Prices server side from subscription_plans (monthly 49900 / 199900 / 499900 paise, yearly = 10 x monthly).
 *     Writes one payment_history row (status 'pending', amount = total, snapshot columns) and changes nothing
 *     else: no coupon redemption, no subscription change.
 *   public.subscription_activate_payment(p_order_id, p_payment_id, p_amount_paise, p_currency, p_method,
 *     p_source) RETURNS jsonb. service_role only. p_order_id is the Razorpay order id
 *     (payment_history.razorpay_order_id). p_source is 'verify' or 'webhook' and must give identical results.
 *   public.subscription_record_refund(p_payment_id, p_refund_id, p_amount_paise) RETURNS jsonb. service_role only.
 *     p_payment_id is the Razorpay payment id.
 *   public.subscription_coupons(code PK, percent_off, max_cycles, monthly_only, valid_until, max_redemptions).
 *   public.subscription_coupon_redemptions, UNIQUE(coupon_code, agency_id, cycle_no), written in the activation transaction.
 *   payment_history gains agency_id, plan_id, billing_cycle, subtotal_paise, discount_paise, cgst_paise,
 *     sgst_paise, igst_paise, coupon_code.
 *
 * Assumptions (not pinned by the rulings, flagged for the implementer):
 *   - create_order and activation return jsonb {ok:true,...} or {ok:false,error:CODE}, or RAISE with CODE in the
 *     message. Both forms are accepted as a refusal.
 *   - AMOUNT_MISMATCH is RETURNED (not raised) so the payment row is persisted as status 'failed' with that
 *     code in error_message. The subscription and the ledgers are untouched.
 *   - Refusal codes not pinned verbatim are matched case-insensitively on a fragment (for example /not[ _]found/).
 *   - Invoice rows link to their agency; credit notes link to the invoice (subscription_credit_notes.invoice_id).
 *   - FOUNDING50 (max_cycles 3) allows three discounted billing cycles in total: the first payment and two renewals.
 *
 * Forced-failure probe: a temporary BEFORE INSERT trigger on subscription_invoices raises after the invoice number
 * is minted. It is dropped in a finally block, so no other case sees it.
 *
 * Usage:  node scripts/subscription_activation.db.test.mjs   (from the repo root)
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
const MIGRATION_FILE = '20261029000000_subscription_activation.sql'
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
let caseNo = 0
/** Sequential case names: A01, A02, ... */
const caseName = (title) => `A${String(++caseNo).padStart(2, '0')}. ${title}`

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
// Main
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyChain()
  chainFiles = applied

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]}; ${MIGRATION_FILE} present=${MIGRATION_PRESENT}, applied=${migrationApplied})`)
  if (migrationApplied) {
    try {
      await setupFixtures()
      fixturesReady = true
    } catch (error) {
      fixtureError = firstLine(error)
    }
  }

  // =========================================================================
  // 0. Schema, signatures, privileges
  // =========================================================================
  await testCase(caseName(`migration supabase/migrations/${MIGRATION_FILE} exists`), async () => {
    expect(MIGRATION_PRESENT, `supabase/migrations/${MIGRATION_FILE} does not exist yet (not written)`)
  })

  await gatedCase(caseName('the activation migration is applied after 20261028 (ordering only; later migrations are not constrained)'), async () => {
    const i = chainFiles.indexOf(MIGRATION_FILE)
    const j = chainFiles.indexOf('20261028000000_subscription_gst.sql')
    expect(i >= 0, `${MIGRATION_FILE} not in the chain`)
    expect(j >= 0 && i > j, `activation index ${i} is not after the GST migration index ${j}`)
  })

  await gatedCase(caseName('subscription_create_order takes exactly (p_agency_id, p_plan_tier, p_billing_cycle, p_coupon_code, p_razorpay_order_id)'), async () => {
    const args = await argNamesOf('subscription_create_order')
    expect(JSON.stringify(args) === JSON.stringify(['p_agency_id', 'p_plan_tier', 'p_billing_cycle', 'p_coupon_code', 'p_razorpay_order_id']), `args were ${args.join(', ')}`)
  })

  await gatedCase(caseName('subscription_create_order has no money, price, tax or total argument (the client never sends an amount)'), async () => {
    const args = await argNamesOf('subscription_create_order')
    const money = args.filter((a) => /amount|paise|price|total|tax|gst|rupee/i.test(a))
    expect(money.length === 0, `money-like arguments: ${money.join(', ')}`)
  })

  await gatedCase(caseName('subscription_activate_payment takes exactly (p_order_id, p_payment_id, p_amount_paise, p_currency, p_method, p_source)'), async () => {
    const args = await argNamesOf('subscription_activate_payment')
    expect(
      JSON.stringify(args) === JSON.stringify(['p_order_id', 'p_payment_id', 'p_amount_paise', 'p_currency', 'p_method', 'p_source']),
      `args were ${args.join(', ')}`
    )
  })

  await gatedCase(caseName('subscription_record_refund takes exactly (p_payment_id, p_refund_id, p_amount_paise)'), async () => {
    const args = await argNamesOf('subscription_record_refund')
    expect(JSON.stringify(args) === JSON.stringify(['p_payment_id', 'p_refund_id', 'p_amount_paise']), `args were ${args.join(', ')}`)
  })

  await gatedCase(caseName('subscription_create_order pins search_path'), async () => {
    expectSearchPath(await fnInfo('subscription_create_order'), 'subscription_create_order')
  })

  await gatedCase(caseName('subscription_activate_payment pins search_path'), async () => {
    expectSearchPath(await fnInfo('subscription_activate_payment'), 'subscription_activate_payment')
  })

  await gatedCase(caseName('subscription_record_refund pins search_path'), async () => {
    expectSearchPath(await fnInfo('subscription_record_refund'), 'subscription_record_refund')
  })

  await gatedCase(caseName('all three money functions are SECURITY DEFINER'), async () => {
    const bad = []
    for (const f of ['subscription_create_order', 'subscription_activate_payment', 'subscription_record_refund']) {
      if ((await fnInfo(f)).prosecdef !== true) bad.push(f)
    }
    expect(bad.length === 0, `not SECURITY DEFINER: ${bad.join(', ')}`)
  })

  await gatedCase(caseName('subscription_create_order is service_role only (no PUBLIC, anon or authenticated EXECUTE)'), async () => {
    expectServiceOnly(await fnInfo('subscription_create_order'), 'subscription_create_order')
  })

  await gatedCase(caseName('subscription_activate_payment is service_role only (no PUBLIC, anon or authenticated EXECUTE)'), async () => {
    expectServiceOnly(await fnInfo('subscription_activate_payment'), 'subscription_activate_payment')
  })

  await gatedCase(caseName('subscription_record_refund is service_role only (no PUBLIC, anon or authenticated EXECUTE)'), async () => {
    expectServiceOnly(await fnInfo('subscription_record_refund'), 'subscription_record_refund')
  })

  await gatedCase(caseName('subscription_coupons carries code, percent_off, max_cycles, monthly_only, valid_until, max_redemptions'), async () => {
    expectColumns(await colsOf('subscription_coupons'), ['code', 'percent_off', 'max_cycles', 'monthly_only', 'valid_until', 'max_redemptions'], 'subscription_coupons')
  })

  await gatedCase(caseName('FOUNDING50 is seeded at 50 percent, 3 cycles, monthly only'), async () => {
    const c = await suOne(`SELECT percent_off, max_cycles, monthly_only FROM public.subscription_coupons WHERE code = 'FOUNDING50'`)
    expect(c, 'FOUNDING50 not seeded')
    expect(Number(c.percent_off) === 50 && Number(c.max_cycles) === 3 && c.monthly_only === true,
      `got percent ${c.percent_off}, cycles ${c.max_cycles}, monthly_only ${c.monthly_only}`)
  })

  await gatedCase(caseName('subscription_coupon_redemptions carries coupon_code, agency_id, cycle_no under a UNIQUE index'), async () => {
    expectColumns(await colsOf('subscription_coupon_redemptions'), ['coupon_code', 'agency_id', 'cycle_no'], 'subscription_coupon_redemptions')
    const idx = await su(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'subscription_coupon_redemptions'`)
    const unique = idx.rows.some((r) => /UNIQUE/i.test(r.indexdef) && /coupon_code/.test(r.indexdef) && /agency_id/.test(r.indexdef) && /cycle_no/.test(r.indexdef))
    expect(unique, 'no UNIQUE index over (coupon_code, agency_id, cycle_no)')
  })

  await gatedCase(caseName('authenticated cannot write subscription_coupon_redemptions directly'), async () => {
    expect(!(await privilegeOf('authenticated', 'subscription_coupon_redemptions', 'INSERT')), 'authenticated has INSERT')
    expect(!(await privilegeOf('authenticated', 'subscription_coupon_redemptions', 'UPDATE')), 'authenticated has UPDATE')
  })

  await gatedCase(caseName('payment_history gains the order snapshot columns'), async () => {
    expectColumns(await colsOf('payment_history'), SNAPSHOT_COLS, 'payment_history')
  })

  await gatedCase(caseName('the activation function locks the payment row FOR UPDATE'), async () => {
    const r = await suOne(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public' WHERE p.proname = 'subscription_activate_payment'`)
    expect(r && /FOR\s+UPDATE/i.test(r.prosrc), 'no FOR UPDATE in subscription_activate_payment')
  })

  // =========================================================================
  // 1. Server-side pricing (create_order)
  // =========================================================================
  await gatedCase(caseName('starter monthly, same state: subtotal 49900, CGST = SGST = 4491, total 58882'), async () => {
    await priceOrder({ tier: 'starter' })
  })

  await gatedCase(caseName('growth monthly, same state: CGST = SGST = 17991, total 235882'), async () => {
    await priceOrder({ tier: 'growth' })
  })

  await gatedCase(caseName('professional monthly, same state: CGST = SGST = 44991, total 589882'), async () => {
    await priceOrder({ tier: 'professional' })
  })

  await gatedCase(caseName('starter yearly is 10 x monthly (subtotal 499000), total 588820'), async () => {
    await priceOrder({ tier: 'starter', cycle: 'yearly' })
  })

  await gatedCase(caseName('growth yearly is 10 x monthly (subtotal 1999000), total 2358820'), async () => {
    await priceOrder({ tier: 'growth', cycle: 'yearly' })
  })

  await gatedCase(caseName('professional yearly is 10 x monthly (subtotal 4999000), total 5898820'), async () => {
    await priceOrder({ tier: 'professional', cycle: 'yearly' })
  })

  await gatedCase(caseName('starter monthly, different state: IGST = 8982, CGST = SGST = 0, total 58882'), async () => {
    await priceOrder({ tier: 'starter', same: false, agency: { gstin: gstinFor('07'), stateName: 'Delhi' } })
  })

  await gatedCase(caseName('growth monthly, different state: IGST = 35982, total 235882'), async () => {
    await priceOrder({ tier: 'growth', same: false, agency: { gstin: gstinFor('07'), stateName: 'Delhi' } })
  })

  await gatedCase(caseName('FOUNDING50 starter monthly, same state: discount 24950, taxable 24950, CGST = SGST = 2246, total 29442'), async () => {
    await priceOrder({ tier: 'starter', coupon: 'FOUNDING50' })
  })

  await gatedCase(caseName('FOUNDING50 starter monthly, different state: IGST = 4491, total 29441'), async () => {
    await priceOrder({ tier: 'starter', coupon: 'FOUNDING50', same: false, agency: { gstin: gstinFor('07'), stateName: 'Delhi' } })
  })

  await gatedCase(caseName('FOUNDING50 growth monthly, same state: discount 99950, CGST = SGST = 8996, total 117942'), async () => {
    await priceOrder({ tier: 'growth', coupon: 'FOUNDING50' })
  })

  await gatedCase(caseName('FOUNDING50 professional monthly, same state: discount 249950, CGST = SGST = 22496, total 294942'), async () => {
    await priceOrder({ tier: 'professional', coupon: 'FOUNDING50' })
  })

  await gatedCase(caseName('place of supply comes from the GSTIN first: GSTIN 07 with state name Maharashtra prices as IGST'), async () => {
    await priceOrder({ tier: 'starter', same: false, agency: { gstin: gstinFor('07'), stateName: 'Maharashtra' } })
  })

  await gatedCase(caseName('with no GSTIN, place of supply is the mapped state name: Karnataka (29) prices as IGST'), async () => {
    await priceOrder({ tier: 'starter', same: false, agency: { gstin: null, stateName: 'Karnataka' } })
  })

  await gatedCase(caseName('no GSTIN and no state: BILLING_STATE_REQUIRED'), async () => {
    const a = await createAgency({ gstin: null, stateName: null })
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'starter' })
    expectRefused(o, ['BILLING_STATE_REQUIRED'], 'no-state agency: ')
  })

  await gatedCase(caseName('create_order writes one pending payment row for the owner, keyed by the Razorpay order id'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const orderId = nx('order')
    expectAccepted(await orderOut(a.id, { tier: 'starter', orderId }), 'create refused: ')
    const rows = (await su(`SELECT * FROM public.payment_history WHERE razorpay_order_id = $1`, [orderId])).rows
    expect(rows.length === 1, `expected one payment row, found ${rows.length}`)
    expect(rows[0].status === 'pending', `status ${rows[0].status}`)
    expect(rows[0].user_id === a.userId, 'payment row user_id is not the agency owner')
  })

  await gatedCase(caseName('create_order snapshots agency_id, plan_id and billing_cycle on the payment row'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const orderId = nx('order')
    expectAccepted(await orderOut(a.id, { tier: 'growth', cycle: 'yearly', orderId }), 'create refused: ')
    const row = await paymentRow(orderId)
    expect(row.agency_id === a.id, `agency_id ${row.agency_id}`)
    expect(row.plan_id === (await planIdOf('growth')), 'plan_id is not the growth plan')
    expect(row.billing_cycle === 'yearly', `billing_cycle ${row.billing_cycle}`)
  })

  await gatedCase(caseName('create_order writes no coupon redemption and leaves the subscription untouched'), async () => {
    const f = await freshOrder({ status: 'trial', coupon: 'FOUNDING50' })
    const before = await subOf(f.subId)
    expect((await redemptionsFor(f.agency.id)).length === 0, 'redemption written at order time')
    const after = await subOf(f.subId)
    expect(after.status === before.status && Number(after.version) === Number(before.version), 'subscription changed at order time')
  })

  await gatedCase(caseName('an unknown plan tier is refused (unknown_plan)'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'platinum' })
    expectRefusedMatch(o, /unknown[ _]plan/i, 'platinum: ')
  })

  await gatedCase(caseName('an invalid billing cycle is refused (invalid_cycle)'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'starter', cycle: 'weekly' })
    expectRefusedMatch(o, /invalid[ _]cycle/i, 'weekly: ')
  })

  await gatedCase(caseName('FOUNDING50 on a yearly cycle is refused (coupon_yearly_not_allowed)'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'starter', cycle: 'yearly', coupon: 'FOUNDING50' })
    expectRefused(o, ['coupon_yearly_not_allowed'], 'yearly FOUNDING50: ')
  })

  await gatedCase(caseName('an unknown coupon is refused (coupon_invalid)'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'starter', coupon: 'NOSUCHCODE' })
    expectRefused(o, ['coupon_invalid'], 'unknown coupon: ')
  })

  await gatedCase(caseName('an expired coupon is refused (coupon_expired)'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'starter', coupon: 'OLDCOUPON' })
    expectRefused(o, ['coupon_expired'], 'expired coupon: ')
  })

  await gatedCase(caseName('a coupon at its max_redemptions is refused for the next agency (coupon_exhausted)'), async () => {
    await paidFixture({ status: 'trial', coupon: 'ONESHOT' })
    const a2 = await createAgency()
    await makeSub(a2.id, 'trial')
    const o = await orderOut(a2.id, { tier: 'starter', coupon: 'ONESHOT' })
    expectRefused(o, ['coupon_exhausted'], 'second agency on ONESHOT: ')
  })

  await gatedCase(caseName('FOUNDING50 covers three billing cycles: cycles 1 to 3 discounted, the fourth refused (coupon_exhausted)'), async () => {
    const first = await paidFixture({ status: 'trial', coupon: 'FOUNDING50' })
    const agencyId = first.agency.id
    for (let n = 2; n <= 3; n += 1) {
      const r = await renewalOrder(agencyId, { coupon: 'FOUNDING50' })
      expect(big(r.row.discount_paise) === 24950n, `cycle ${n} discount ${r.row.discount_paise}`)
      expectAccepted(await activateOut(r.orderId, nx('pay')), `cycle ${n} activation: `)
    }
    const o4 = await orderOut(agencyId, { tier: 'starter', coupon: 'FOUNDING50' })
    expectRefused(o4, ['coupon_exhausted'], 'cycle 4 with FOUNDING50: ')
    const cycles = (await redemptionsFor(agencyId)).map((r) => Number(r.cycle_no))
    expect(JSON.stringify(cycles) === JSON.stringify([1, 2, 3]), `redemption cycles ${JSON.stringify(cycles)}`)
  })

  await gatedCase(caseName('after FOUNDING50 is used up, the fourth cycle prices at full rate with no coupon'), async () => {
    const first = await paidFixture({ status: 'trial', coupon: 'FOUNDING50' })
    const agencyId = first.agency.id
    for (let n = 2; n <= 3; n += 1) {
      const r = await renewalOrder(agencyId, { coupon: 'FOUNDING50' })
      expectAccepted(await activateOut(r.orderId, nx('pay')), `cycle ${n} activation: `)
    }
    const r4 = await renewalOrder(agencyId, { coupon: null })
    const want = expectedOrder({ tier: 'starter', same: true })
    expect(big(r4.row.discount_paise) === 0n, `discount ${r4.row.discount_paise}`)
    expect(r4.total === want.total, `total ${r4.total} want ${want.total}`)
  })

  await gatedCase(caseName('a pending agency cannot order (agency not operational)'), async () => {
    const a = await createAgency({ status: 'pending' })
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'starter' })
    expectRefusedMatch(o, /not[ _]operational/i, 'pending agency: ')
  })

  await gatedCase(caseName('an agency without an owner account cannot order (agency without owner)'), async () => {
    const a = await createAgency({ owner: false })
    await makeSub(a.id, 'trial')
    const o = await orderOut(a.id, { tier: 'starter' })
    expectRefusedMatch(o, /owner/i, 'ownerless agency: ')
  })

  // =========================================================================
  // 2. Activation (subscription_activate_payment)
  // =========================================================================
  await gatedCase(caseName('a payment amount that differs from the stored total is refused (AMOUNT_MISMATCH)'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const o = await activateOut(f.orderId, nx('pay'), { amount: f.total + 1n })
    expectRefused(o, ['AMOUNT_MISMATCH'], 'amount + 1: ')
  })

  await gatedCase(caseName('an AMOUNT_MISMATCH marks the payment failed and activates nothing'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    await activateOut(f.orderId, pay, { amount: 1n })
    const row = await paymentRow(f.orderId)
    expect(row.status === 'failed', `payment status ${row.status}`)
    expect(/AMOUNT_MISMATCH/.test(String(row.error_message ?? '')), `error_message ${row.error_message}`)
    expect((await subOf(f.subId)).status === 'trial', 'subscription changed on mismatch')
    expect((await invoicesFor(f.agency.id)).length === 0, 'invoice written on mismatch')
  })

  await gatedCase(caseName('a currency other than INR is refused and activates nothing'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const o = await activateOut(f.orderId, nx('pay'), { currency: 'USD' })
    expectRefusedMatch(o, /currency/i, 'USD: ')
    expect((await subOf(f.subId)).status === 'trial', 'subscription changed on bad currency')
    expect((await invoicesFor(f.agency.id)).length === 0, 'invoice written on bad currency')
  })

  await gatedCase(caseName('a trial payment activates the subscription (trial -> active)'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const o = await activateOut(f.orderId, nx('pay'))
    expectAccepted(o)
    const b = bodyOf(o)
    expect(b.ok === true && b.replay !== true, `body ${JSON.stringify(b).slice(0, 120)}`)
    expect((await subOf(f.subId)).status === 'active', 'status is not active')
  })

  await gatedCase(caseName('the first payment sets first_paid_at'), async () => {
    const f = await freshOrder({ status: 'trial' })
    expect((await subOf(f.subId)).first_paid_at == null, 'first_paid_at set before payment')
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    expect((await subOf(f.subId)).first_paid_at != null, 'first_paid_at not set by the first payment')
  })

  await gatedCase(caseName('the payment row ends success with the Razorpay payment id and method'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    expectAccepted(await activateOut(f.orderId, pay, { method: 'upi' }))
    const row = await paymentRow(f.orderId)
    expect(row.status === 'success', `status ${row.status}`)
    expect(row.razorpay_payment_id === pay, `razorpay_payment_id ${row.razorpay_payment_id}`)
    expect(row.payment_method === 'upi', `payment_method ${row.payment_method}`)
  })

  await gatedCase(caseName('the activation issues one tax invoice TO/FY/nnnnnn whose FY matches issued_at'), async () => {
    const f = await paidFixture({ status: 'trial' })
    const invs = await invoicesFor(f.agency.id)
    expect(invs.length === 1, `invoice count ${invs.length}`)
    const inv = invs[0]
    expect(/^TO\/\d{2}-\d{2}\/\d{6}$/.test(inv.invoice_number), `number ${inv.invoice_number}`)
    expect(inv.series === 'TO', `series ${inv.series}`)
    expect(inv.fy === fyOfInstant(new Date(inv.issued_at).toISOString()), `fy ${inv.fy} does not match issued_at ${inv.issued_at}`)
    expect(inv.invoice_number.startsWith(`TO/${inv.fy}/`), `number ${inv.invoice_number} does not carry fy ${inv.fy}`)
  })

  await gatedCase(caseName('the invoice snapshots both parties: supplier from billing settings, recipient from the agency'), async () => {
    const f = await paidFixture({ status: 'trial' })
    const inv = (await invoicesFor(f.agency.id))[0]
    expect(inv.supplier_legal_name === SUPPLIER_LEGAL_NAME, `supplier name ${inv.supplier_legal_name}`)
    expect(inv.supplier_gstin === SUPPLIER_GSTIN, `supplier gstin ${inv.supplier_gstin}`)
    expect(inv.supplier_state_code === '27', `supplier state ${inv.supplier_state_code}`)
    expect(inv.recipient_name === f.agency.name, `recipient name ${inv.recipient_name}`)
    expect(inv.recipient_gstin === f.agency.gstin, `recipient gstin ${inv.recipient_gstin}`)
    expect(inv.place_of_supply_state_code === '27', `place of supply ${inv.place_of_supply_state_code}`)
    expect(inv.sac_code === '997331', `sac ${inv.sac_code}`)
  })

  await gatedCase(caseName('the invoice tax split and total equal the priced order (same state)'), async () => {
    const f = await paidFixture({ status: 'trial', tier: 'growth' })
    const inv = (await invoicesFor(f.agency.id))[0]
    const want = expectedOrder({ tier: 'growth', same: true })
    const bad = []
    const check = (label, got, exp) => { if (big(got) !== exp) bad.push(`${label} got ${got} want ${exp}`) }
    check('taxable_paise', inv.taxable_paise, want.taxable)
    check('cgst_paise', inv.cgst_paise, want.cgst)
    check('sgst_paise', inv.sgst_paise, want.sgst)
    check('igst_paise', inv.igst_paise, want.igst)
    check('total_paise', inv.total_paise, f.total)
    expect(bad.length === 0, bad.join(', '))
  })

  await gatedCase(caseName('replaying the same payment id returns {ok:true, replay:true}'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    expectAccepted(await activateOut(f.orderId, pay))
    const o = await activateOut(f.orderId, pay)
    expectAccepted(o)
    const b = bodyOf(o)
    expect(b.ok === true && b.replay === true, `replay body ${JSON.stringify(b).slice(0, 120)}`)
  })

  await gatedCase(caseName('a replay writes no second invoice and does not extend the period'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    expectAccepted(await activateOut(f.orderId, pay))
    const end1 = new Date((await subOf(f.subId)).current_period_end).getTime()
    expectAccepted(await activateOut(f.orderId, pay))
    expect((await invoicesFor(f.agency.id)).length === 1, 'replay wrote a second invoice')
    expect(new Date((await subOf(f.subId)).current_period_end).getTime() === end1, 'replay extended the period')
  })

  await gatedCase(caseName('a different payment id for an already-paid order is refused (order_already_paid)'), async () => {
    const f = await freshOrder({ status: 'trial' })
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    const o = await activateOut(f.orderId, nx('pay-second'))
    expectRefused(o, ['order_already_paid'], 'second payment id: ')
  })

  await gatedCase(caseName('an early monthly renewal extends from the current period end (old end + 1 month)'), async () => {
    const f = await freshOrder({ status: 'active', days: 10 })
    const oldEnd = new Date((await subOf(f.subId)).current_period_end).toISOString()
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    const newEnd = (await subOf(f.subId)).current_period_end
    const want = (await suOne(`SELECT ($1::timestamptz + interval '1 month') AS e`, [oldEnd])).e
    expect(new Date(newEnd).getTime() === new Date(want).getTime(), `period_end ${new Date(newEnd).toISOString()} want ${new Date(want).toISOString()}`)
  })

  await gatedCase(caseName('an early yearly renewal extends from the current period end (old end + 1 year)'), async () => {
    const f = await freshOrder({ status: 'active', cycle: 'yearly', days: 10 })
    const oldEnd = new Date((await subOf(f.subId)).current_period_end).toISOString()
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    const newEnd = (await subOf(f.subId)).current_period_end
    const want = (await suOne(`SELECT ($1::timestamptz + interval '1 year') AS e`, [oldEnd])).e
    expect(new Date(newEnd).getTime() === new Date(want).getTime(), `period_end ${new Date(newEnd).toISOString()} want ${new Date(want).toISOString()}`)
  })

  await gatedCase(caseName('a renewal after expiry starts from now (within 5 minutes of now + 1 month)'), async () => {
    const f = await freshOrder({ status: 'expired', days: -3 })
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    const sub = await subOf(f.subId)
    expect(sub.status === 'active', `status ${sub.status}`)
    const near = (await suOne(
      `SELECT abs(extract(epoch FROM ($1::timestamptz - (now() + interval '1 month')))) < 300 AS ok`,
      [new Date(sub.current_period_end).toISOString()]
    )).ok
    expect(near === true, `period_end ${new Date(sub.current_period_end).toISOString()} is not near now + 1 month`)
  })

  await gatedCase(caseName('a grace subscription returns to active on payment (grace -> active)'), async () => {
    const f = await freshOrder({ status: 'grace', days: 2 })
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    expect((await subOf(f.subId)).status === 'active', 'grace did not become active')
  })

  await gatedCase(caseName('a past_due subscription returns to active on payment (past_due -> active)'), async () => {
    const f = await freshOrder({ status: 'past_due', days: 2 })
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    expect((await subOf(f.subId)).status === 'active', 'past_due did not become active')
  })

  await gatedCase(caseName('an expired subscription returns to active and keeps exactly one live row for the agency'), async () => {
    const f = await freshOrder({ status: 'expired', days: -3 })
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    expect((await subOf(f.subId)).status === 'active', 'expired did not become active')
    const live = (await su(
      `SELECT count(*)::int AS n FROM public.subscriptions WHERE agency_id = $1 AND status IN ('trial', 'active', 'past_due', 'grace')`,
      [f.agency.id]
    )).rows[0].n
    expect(Number(live) === 1, `live rows ${live}`)
  })

  await gatedCase(caseName('a cancelled subscription is not reactivated by a payment and issues no invoice'), async () => {
    const f = await freshOrder({ status: 'cancelled' })
    const o = await activateOut(f.orderId, nx('pay'))
    expectAnyRefusal(o, 'cancelled activation: ')
    expect((await subOf(f.subId)).status === 'cancelled', 'cancelled subscription changed')
    expect((await invoicesFor(f.agency.id)).length === 0, 'invoice issued for a cancelled subscription')
  })

  await gatedCase(caseName('each paid transition bumps the subscription version by exactly one'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const v0 = Number((await subOf(f.subId)).version)
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    expect(Number((await subOf(f.subId)).version) === v0 + 1, `version ${v0} -> ${(await subOf(f.subId)).version}`)
  })

  await gatedCase(caseName('the paid transaction flag app.subscription_paid does not leak out of the activation'), async () => {
    const f = await freshOrder({ status: 'trial' })
    expectAccepted(await activateOut(f.orderId, nx('pay')))
    const v = (await suOne(`SELECT coalesce(current_setting('app.subscription_paid', true), '') AS v`)).v
    expect(v === '', `flag still set after the call: "${v}"`)
  })

  await gatedCase(caseName('a direct service_role update expired -> active is refused without the activation function'), async () => {
    const f = await freshOrder({ status: 'expired', days: -3 })
    const o = await asRoleOut('service_role', `UPDATE public.subscriptions SET status = 'active' WHERE id = $1`, [f.subId])
    expectRefusedMatch(o, /not allowed/i, 'direct expired -> active: ')
  })

  await gatedCase(caseName('a FOUNDING50 activation records redemption cycle 1 in the same transaction'), async () => {
    const f = await paidFixture({ status: 'trial', coupon: 'FOUNDING50' })
    const reds = await redemptionsFor(f.agency.id)
    expect(reds.length === 1, `redemptions ${reds.length}`)
    expect(reds[0].coupon_code === 'FOUNDING50' && Number(reds[0].cycle_no) === 1, `row ${reds[0].coupon_code} ${reds[0].cycle_no}`)
  })

  await gatedCase(caseName('source verify activates and a later webhook delivery of the same payment is a replay'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    const v = bodyOf(await activateOut(f.orderId, pay, { source: 'verify' }))
    expect(v.ok === true && v.replay !== true, 'verify did not activate')
    const w = bodyOf(await activateOut(f.orderId, pay, { source: 'webhook' }))
    expect(w.ok === true && w.replay === true, `webhook replay ${JSON.stringify(w).slice(0, 120)}`)
  })

  await gatedCase(caseName('source webhook activates and a later verify of the same payment is a replay'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    const w = bodyOf(await activateOut(f.orderId, pay, { source: 'webhook' }))
    expect(w.ok === true && w.replay !== true, 'webhook did not activate')
    const v = bodyOf(await activateOut(f.orderId, pay, { source: 'verify' }))
    expect(v.ok === true && v.replay === true, `verify replay ${JSON.stringify(v).slice(0, 120)}`)
  })

  await gatedCase(caseName('verify and webhook give results with identical keys for a fresh activation'), async () => {
    const f1 = await freshOrder({ status: 'trial' })
    const f2 = await freshOrder({ status: 'trial' })
    const b1 = bodyOf(await activateOut(f1.orderId, nx('pay'), { source: 'verify' }))
    const b2 = bodyOf(await activateOut(f2.orderId, nx('pay'), { source: 'webhook' }))
    expect(JSON.stringify(Object.keys(b1).sort()) === JSON.stringify(Object.keys(b2).sort()),
      `verify keys ${Object.keys(b1).sort().join(',')} vs webhook keys ${Object.keys(b2).sort().join(',')}`)
    expect(b1.ok === b2.ok && b1.replay === b2.replay, 'ok/replay differ between sources')
  })

  await gatedCase(caseName('activation for an unknown order is refused (order_not_found)'), async () => {
    const o = await activateOut('order_does_not_exist', nx('pay'), { amount: 100n })
    expectRefusedMatch(o, /not[ _]found|unknown/i, 'unknown order: ')
  })

  await gatedCase(caseName('an authenticated caller cannot execute the activation (permission denied)'), async () => {
    const o = await asRoleOut('authenticated', `SELECT public.subscription_activate_payment('x', 'y', 100, 'INR', 'upi', 'verify') AS r`)
    expectRefusedMatch(o, /permission denied/i, 'authenticated: ')
  })

  await gatedCase(caseName('an anon caller cannot execute the activation (permission denied)'), async () => {
    const o = await asRoleOut('anon', `SELECT public.subscription_activate_payment('x', 'y', 100, 'INR', 'upi', 'verify') AS r`)
    expectRefusedMatch(o, /permission denied/i, 'anon: ')
  })

  await gatedCase(caseName('a failing step rolls back everything: payment, subscription, invoice, redemption and counter'), async () => {
    const f = await freshOrder({ status: 'trial', coupon: 'FOUNDING50' })
    const fy = fyNow()
    const counterBefore = await counterLast('TO', fy)
    const versionBefore = Number((await subOf(f.subId)).version)
    const o = await withForcedInvoiceFailure(() => activateOut(f.orderId, nx('pay')))
    expectAnyRefusal(o, 'forced failure: ')
    const sub = await subOf(f.subId)
    expect(sub.status === 'trial' && Number(sub.version) === versionBefore, `subscription ${sub.status} v${sub.version}`)
    expect((await paymentRow(f.orderId)).status !== 'success', 'payment left success after rollback')
    expect((await invoicesFor(f.agency.id)).length === 0, 'invoice survived rollback')
    expect((await redemptionsFor(f.agency.id)).length === 0, 'redemption survived rollback')
    expect((await counterLast('TO', fy)) === counterBefore, 'invoice counter moved despite rollback')
  })

  await gatedCase(caseName('invoice numbers stay gap-free: after a rolled-back activation the next number is the next one'), async () => {
    const fy = fyNow()
    const f = await freshOrder({ status: 'trial' })
    await withForcedInvoiceFailure(() => activateOut(f.orderId, nx('pay')))
    const p = await paidFixture({ status: 'trial' })
    const inv = (await invoicesFor(p.agency.id))[0]
    const n = Number(inv.invoice_number.slice(-6))
    const counted = (await su(`SELECT count(*)::int AS n FROM public.subscription_invoices WHERE series = 'TO' AND fy = $1`, [fy])).rows[0].n
    expect(Number(counted) === (await counterLast('TO', fy)), `TO invoices ${counted} but counter ${await counterLast('TO', fy)}`)
    expect(n === (await counterLast('TO', fy)), `number ${n} is not the counter`)
  })

  await gatedCase(caseName('two consecutive activations get consecutive invoice numbers'), async () => {
    const p1 = await paidFixture({ status: 'trial' })
    const p2 = await paidFixture({ status: 'trial' })
    const n1 = Number((await invoicesFor(p1.agency.id))[0].invoice_number.slice(-6))
    const n2 = Number((await invoicesFor(p2.agency.id))[0].invoice_number.slice(-6))
    expect(n2 === n1 + 1, `numbers ${n1} then ${n2}`)
  })

  await gatedCase(caseName('a payment on an active agency keeps the status active and issues one invoice'), async () => {
    const p = await paidFixture({ status: 'active', days: 10 })
    expect((await subOf(p.subId)).status === 'active', 'status changed')
    expect((await invoicesFor(p.agency.id)).length === 1, 'invoice count not one')
  })

  // =========================================================================
  // 3. Refunds (subscription_record_refund)
  // =========================================================================
  await gatedCase(caseName('a refund of an unknown payment is refused (not found)'), async () => {
    const o = await refundOut(nx('pay_unknown'), nx('rf'), 100n)
    expectRefusedMatch(o, /not[ _]found|unknown/i, 'unknown payment: ')
  })

  await gatedCase(caseName('a zero refund is refused'), async () => {
    const p = await paidFixture({ status: 'trial' })
    expectAnyRefusal(await refundOut(p.pay, nx('rf'), 0n), 'zero refund: ')
  })

  await gatedCase(caseName('a full refund issues a credit note equal to the invoice (taxable, CGST, SGST, IGST, total)'), async () => {
    const p = await paidFixture({ status: 'trial' })
    expectAccepted(await refundOut(p.pay, nx('rf'), p.total), 'full refund: ')
    const inv = (await invoicesFor(p.agency.id))[0]
    const notes = await notesFor(inv.id)
    expect(notes.length === 1, `credit notes ${notes.length}`)
    const n = notes[0]
    const bad = []
    for (const k of ['taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'total_paise']) {
      if (big(n[k]) !== big(inv[k])) bad.push(`${k} ${n[k]} vs invoice ${inv[k]}`)
    }
    expect(bad.length === 0, bad.join(', '))
  })

  await gatedCase(caseName('a full refund marks the payment refunded and cancels the subscription at once'), async () => {
    const p = await paidFixture({ status: 'trial' })
    expectAccepted(await refundOut(p.pay, nx('rf'), p.total))
    expect((await paymentRow(p.orderId)).status === 'refunded', `payment status ${(await paymentRow(p.orderId)).status}`)
    expect((await subOf(p.subId)).status === 'cancelled', `subscription ${(await subOf(p.subId)).status}`)
  })

  await gatedCase(caseName('a refund replay with the same refund id is a no-op returning {ok:true, replay:true}'), async () => {
    const p = await paidFixture({ status: 'trial' })
    const rf = nx('rf')
    expectAccepted(await refundOut(p.pay, rf, p.total))
    const o = await refundOut(p.pay, rf, p.total)
    expectAccepted(o)
    const b = bodyOf(o)
    expect(b.ok === true && b.replay === true, `replay body ${JSON.stringify(b).slice(0, 120)}`)
    const notes = await notesFor((await invoicesFor(p.agency.id))[0].id)
    expect(notes.length === 1, `credit notes after replay ${notes.length}`)
  })

  await gatedCase(caseName('a credit note number is CN/FY/nnnnnn with the FY of its issued_at'), async () => {
    const p = await paidFixture({ status: 'trial' })
    expectAccepted(await refundOut(p.pay, nx('rf'), p.total))
    const n = (await notesFor((await invoicesFor(p.agency.id))[0].id))[0]
    expect(/^CN\/\d{2}-\d{2}\/\d{6}$/.test(n.credit_note_number), `number ${n.credit_note_number}`)
    expect(n.credit_note_number.slice(3, 8) === fyOfInstant(new Date(n.issued_at).toISOString()), `fy in ${n.credit_note_number} does not match issued_at`)
  })

  await gatedCase(caseName('a partial refund credits its own amount, keeps CGST = SGST, and still cancels and marks refunded'), async () => {
    const p = await paidFixture({ status: 'trial' })
    const half = p.total / 2n
    expectAccepted(await refundOut(p.pay, nx('rf'), half))
    const n = (await notesFor((await invoicesFor(p.agency.id))[0].id))[0]
    expect(big(n.total_paise) === half, `credit note total ${n.total_paise} want ${half}`)
    expect(big(n.cgst_paise) === big(n.sgst_paise), `CGST ${n.cgst_paise} != SGST ${n.sgst_paise}`)
    expect((await paymentRow(p.orderId)).status === 'refunded', 'payment not refunded')
    expect((await subOf(p.subId)).status === 'cancelled', 'subscription not cancelled')
  })

  await gatedCase(caseName('partial refunds accumulate: two halves credit exactly the invoice, the closing note exhausts it'), async () => {
    const p = await paidFixture({ status: 'trial' })
    const r1 = p.total / 2n
    const r2 = p.total - r1
    expectAccepted(await refundOut(p.pay, nx('rf'), r1), 'first half: ')
    expectAccepted(await refundOut(p.pay, nx('rf'), r2), 'second half: ')
    const inv = (await invoicesFor(p.agency.id))[0]
    const notes = await notesFor(inv.id)
    expect(notes.length === 2, `credit notes ${notes.length}`)
    const sum = (k) => notes.reduce((acc, n) => acc + big(n[k]), 0n)
    const bad = []
    for (const k of ['taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'total_paise']) {
      if (sum(k) !== big(inv[k])) bad.push(`${k} sum ${sum(k)} vs invoice ${inv[k]}`)
    }
    expect(bad.length === 0, bad.join(', '))
  })

  await gatedCase(caseName('a refund larger than the amount paid is refused (exceeds)'), async () => {
    const p = await paidFixture({ status: 'trial' })
    expectRefusedMatch(await refundOut(p.pay, nx('rf'), p.total + 1n), /exceed/i, 'total + 1: ')
  })

  await gatedCase(caseName('a refund after the payment is fully refunded is refused (exceeds)'), async () => {
    const p = await paidFixture({ status: 'trial' })
    expectAccepted(await refundOut(p.pay, nx('rf'), p.total))
    expectRefusedMatch(await refundOut(p.pay, nx('rf'), 1n), /exceed/i, 'after full refund: ')
  })

  await gatedCase(caseName('a refund on a different-state invoice credits IGST only (CGST and SGST zero)'), async () => {
    const p = await paidFixture({ status: 'trial', agency: { gstin: gstinFor('07'), stateName: 'Delhi' } })
    expectAccepted(await refundOut(p.pay, nx('rf'), p.total))
    const inv = (await invoicesFor(p.agency.id))[0]
    const n = (await notesFor(inv.id))[0]
    expect(big(n.cgst_paise) === 0n && big(n.sgst_paise) === 0n, `CGST ${n.cgst_paise} SGST ${n.sgst_paise}`)
    expect(big(n.igst_paise) === big(inv.igst_paise) && big(inv.igst_paise) > 0n, `IGST ${n.igst_paise} vs invoice ${inv.igst_paise}`)
  })

  await gatedCase(caseName('a refund never consumes a TO invoice number'), async () => {
    const p = await paidFixture({ status: 'trial' })
    const fy = fyNow()
    const before = await counterLast('TO', fy)
    expectAccepted(await refundOut(p.pay, nx('rf'), p.total))
    expect((await counterLast('TO', fy)) === before, 'TO counter moved on refund')
  })

  await gatedCase(caseName('the CN counter is gap-free: credit notes in the FY equal the CN counter'), async () => {
    const fy = fyNow()
    const p = await paidFixture({ status: 'trial' })
    expectAccepted(await refundOut(p.pay, nx('rf'), p.total))
    const counted = (await su(`SELECT count(*)::int AS n FROM public.subscription_credit_notes WHERE credit_note_number LIKE $1`, [`CN/${fy}/%`])).rows[0].n
    expect(Number(counted) === (await counterLast('CN', fy)), `CN notes ${counted} but CN counter ${await counterLast('CN', fy)}`)
  })

  await gatedCase(caseName('an authenticated caller cannot execute the refund (permission denied)'), async () => {
    const o = await asRoleOut('authenticated', `SELECT public.subscription_record_refund('x', 'y', 100) AS r`)
    expectRefusedMatch(o, /permission denied/i, 'authenticated: ')
  })

  await gatedCase(caseName('an anon caller cannot execute the refund (permission denied)'), async () => {
    const o = await asRoleOut('anon', `SELECT public.subscription_record_refund('x', 'y', 100) AS r`)
    expectRefusedMatch(o, /permission denied/i, 'anon: ')
  })

  // =========================================================================
  // 4. Opus review fixes (money-trap ledger, coupon reservations, plan switch, refund exceptions, rounding)
  // =========================================================================
  const planOf = async (tier) => (await suOne(`SELECT id FROM public.subscription_plans WHERE tier = $1`, [tier])).id
  const metaOf = async (orderId) => (await paymentRow(orderId)).metadata ?? {}
  const exceptionsFor = async (refundId) =>
    (await su(`SELECT * FROM public.subscription_refund_exceptions WHERE refund_id = $1 ORDER BY created_at`, [refundId])).rows
  /** Like withForcedInvoiceFailure but for any table and SQLSTATE. */
  async function withForcedFailure(table, errcode, fn) {
    await su(`CREATE OR REPLACE FUNCTION public.zz_harness_force_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'harness forced failure' USING ERRCODE = '${errcode}'; END $$`)
    await su(`CREATE TRIGGER zz_harness_force_fail BEFORE INSERT ON public.${table} FOR EACH ROW EXECUTE FUNCTION public.zz_harness_force_fail()`)
    try {
      return await fn()
    } finally {
      await su(`DROP TRIGGER IF EXISTS zz_harness_force_fail ON public.${table}`)
      await su(`DROP FUNCTION IF EXISTS public.zz_harness_force_fail()`)
    }
  }

  await gatedCase(caseName('an AMOUNT_MISMATCH keeps the captured payment id on the order row (metadata and razorpay_payment_id)'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    expectRefused(await activateOut(f.orderId, pay, { amount: 1n }), ['AMOUNT_MISMATCH'])
    const row = await paymentRow(f.orderId)
    const m = row.metadata ?? {}
    expect(row.razorpay_payment_id === pay, `razorpay_payment_id ${row.razorpay_payment_id}`)
    expect(m.captured_payment_id === pay && m.refusal === 'AMOUNT_MISMATCH' && m.at, `metadata ${JSON.stringify(m)}`)
    expect(Array.isArray(m.refused_payment_ids) && m.refused_payment_ids.includes(pay), 'refused_payment_ids missing the id')
  })

  await gatedCase(caseName('a partial index over metadata ? refusal exists for ops queries'), async () => {
    const r = await su(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'payment_history' AND indexname = 'payment_history_refusal_idx'`)
    expect(r.rows.length === 1 && /WHERE/i.test(r.rows[0].indexdef) && /refusal/.test(r.rows[0].indexdef), `index ${JSON.stringify(r.rows)}`)
  })

  await gatedCase(caseName('a payment captured for a cancelled subscription is recorded and its refund is kept (typed exception, not lost)'), async () => {
    const f = await freshOrder({ status: 'cancelled' })
    const pay = nx('pay')
    expectRefused(await activateOut(f.orderId, pay), ['subscription_cancelled'])
    const row = await paymentRow(f.orderId)
    expect(row.razorpay_payment_id === pay && (row.metadata ?? {}).refusal === 'subscription_cancelled', `row ${row.razorpay_payment_id} ${JSON.stringify(row.metadata)}`)
    const rf = nx('rf')
    const o = await refundOut(pay, rf, f.total)
    expectRefused(o, ['payment_not_refundable'])
    expect(o.body.exception_id, 'no exception_id returned')
    const ex = await exceptionsFor(rf)
    expect(ex.length === 1 && big(ex[0].amount_paise) === f.total && ex[0].payment_id === pay, `exceptions ${JSON.stringify(ex)}`)
  })

  await gatedCase(caseName('BILLING_NOT_CONFIGURED after capture writes the payment id and refusal instead of nothing'), async () => {
    const f = await freshOrder({ status: 'trial' })
    await su(`UPDATE public.platform_billing_settings SET gstin = NULL`)
    let o
    try {
      o = await activateOut(f.orderId, nx('pay'))
    } finally {
      await su(`UPDATE public.platform_billing_settings SET gstin = $1`, [SUPPLIER_GSTIN])
    }
    expectRefused(o, ['BILLING_NOT_CONFIGURED'])
    const row = await paymentRow(f.orderId)
    expect((row.metadata ?? {}).refusal === 'BILLING_NOT_CONFIGURED' && row.razorpay_payment_id, `row ${row.razorpay_payment_id} ${JSON.stringify(row.metadata)}`)
    expect((await subOf(f.subId)).status === 'trial', 'subscription changed')
  })

  await gatedCase(caseName('a suspended agency cannot be activated by a captured payment; the payment id is recorded'), async () => {
    const f = await freshOrder({ status: 'trial' })
    await su(`UPDATE public.transport_agencies SET status = 'suspended' WHERE id = $1`, [f.agency.id])
    const pay = nx('pay')
    expectRefused(await activateOut(f.orderId, pay), ['agency_not_operational'])
    const row = await paymentRow(f.orderId)
    expect(row.razorpay_payment_id === pay && (row.metadata ?? {}).refusal === 'agency_not_operational', `row ${JSON.stringify(row.metadata)}`)
    expect((await invoicesFor(f.agency.id)).length === 0, 'invoice written for a suspended agency')
  })

  await gatedCase(caseName('order_already_paid records the second captured payment id so its refund is kept'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const first = nx('pay')
    const second = nx('pay-second')
    expectAccepted(await activateOut(f.orderId, first))
    expectRefused(await activateOut(f.orderId, second), ['order_already_paid'])
    const row = await paymentRow(f.orderId)
    expect(row.razorpay_payment_id === first && row.status === 'success', 'the paid row changed')
    expect((row.metadata ?? {}).refused_payment_ids.includes(second), 'second payment id not recorded')
    const rf = nx('rf')
    expectRefused(await refundOut(second, rf, 100n), ['payment_not_refundable'])
    expect((await exceptionsFor(rf)).length === 1, 'no exception row for the second payment refund')
    expect((await notesFor((await invoicesFor(f.agency.id))[0].id)).length === 0, 'a credit note was written against the first payment')
  })

  await gatedCase(caseName('a later valid capture after a refusal succeeds and keeps the earlier id in the ledger'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const bad = nx('pay-bad')
    expectRefused(await activateOut(f.orderId, bad, { amount: 5n }), ['AMOUNT_MISMATCH'])
    const good = nx('pay-good')
    expectAccepted(await activateOut(f.orderId, good))
    const row = await paymentRow(f.orderId)
    const m = row.metadata ?? {}
    expect(row.status === 'success' && row.razorpay_payment_id === good, `row ${row.status} ${row.razorpay_payment_id}`)
    expect(m.refusal === undefined && m.prior_refusal === 'AMOUNT_MISMATCH' && m.refused_payment_ids.includes(bad), `metadata ${JSON.stringify(m)}`)
  })

  await gatedCase(caseName('a plan change while the paid period has more than 7 days left is refused (plan_change_blocked)'), async () => {
    const f = await freshOrder({ status: 'active', days: 20 })
    const o = await orderOut(f.agency.id, { tier: 'growth' })
    expectRefused(o, ['plan_change_blocked'], 'growth over starter with 20 days left: ')
  })

  await gatedCase(caseName('a plan change is allowed inside the last 7 days, on a trial and after expiry'), async () => {
    const near = await freshOrder({ status: 'active', days: 5 })
    expectAccepted(await orderOut(near.agency.id, { tier: 'growth' }), 'within 7 days: ')
    const trial = await freshOrder({ status: 'trial' })
    expectAccepted(await orderOut(trial.agency.id, { tier: 'professional' }), 'trial: ')
    const exp = await freshOrder({ status: 'expired', days: -3 })
    expectAccepted(await orderOut(exp.agency.id, { tier: 'growth' }), 'expired: ')
  })

  await gatedCase(caseName('the same plan at renewal is never blocked, whatever the days left'), async () => {
    const f = await freshOrder({ status: 'active', days: 25 })
    expectAccepted(await orderOut(f.agency.id, { tier: 'starter' }), 'same plan: ')
  })

  await gatedCase(caseName('activation also refuses a plan change with more than 7 days left and records the capture'), async () => {
    // Priced while a trial on growth; the subscription then became a paid starter period with 20 days left.
    const f = await freshOrder({ status: 'trial', tier: 'growth' })
    await su(`UPDATE public.subscriptions SET status = 'active', plan_id = $1, current_period_end = now() + interval '20 days' WHERE id = $2`, [await planOf('starter'), f.subId])
    const pay = nx('pay')
    expectRefused(await activateOut(f.orderId, pay), ['plan_change_blocked'])
    expect((await paymentRow(f.orderId)).razorpay_payment_id === pay, 'payment id not recorded')
  })

  await gatedCase(caseName('unpaid FOUNDING50 orders of the last 24h count as reservations: used + pending >= max_cycles refuses'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    for (let n = 1; n <= 3; n += 1) expectAccepted(await orderOut(a.id, { tier: 'starter', coupon: 'FOUNDING50' }), `pending order ${n}: `)
    expectRefused(await orderOut(a.id, { tier: 'starter', coupon: 'FOUNDING50' }), ['coupon_exhausted'], 'fourth pending order: ')
  })

  await gatedCase(caseName('a pending order older than 24 hours no longer holds a coupon reservation'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    await su(`INSERT INTO public.subscription_coupons (code, percent_off, max_cycles, monthly_only) VALUES ('ONEPEND', 10, 1, false)`)
    const first = await orderOut(a.id, { tier: 'starter', coupon: 'ONEPEND' })
    expectAccepted(first)
    expectRefused(await orderOut(a.id, { tier: 'starter', coupon: 'ONEPEND' }), ['coupon_exhausted'], 'while reserved: ')
    await su(`UPDATE public.payment_history SET created_at = now() - interval '25 hours' WHERE razorpay_order_id = $1`, [first.orderId])
    expectAccepted(await orderOut(a.id, { tier: 'starter', coupon: 'ONEPEND' }), 'after the window: ')
  })

  await gatedCase(caseName('max_redemptions counts distinct OTHER agencies holding a redemption or a pending order'), async () => {
    await su(`INSERT INTO public.subscription_coupons (code, percent_off, max_cycles, monthly_only, max_redemptions) VALUES ('TWOAGENCY', 10, 3, false, 1)`)
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const b = await createAgency()
    await makeSub(b.id, 'trial')
    expectAccepted(await orderOut(a.id, { tier: 'starter', coupon: 'TWOAGENCY' }), 'agency A first order: ')
    expectAccepted(await orderOut(a.id, { tier: 'starter', coupon: 'TWOAGENCY' }), 'agency A second order (itself, not another agency): ')
    expectRefused(await orderOut(b.id, { tier: 'starter', coupon: 'TWOAGENCY' }), ['coupon_exhausted'], 'agency B behind A pending order: ')
  })

  await gatedCase(caseName('a coupon that would leave a zero taxable amount returns a typed error, not a raw check violation'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    await su(`INSERT INTO public.subscription_coupons (code, percent_off, max_cycles, monthly_only) VALUES ('NEARFREE', 99, 3, false)`)
    const old = (await suOne(`SELECT price_monthly FROM public.subscription_plans WHERE tier = 'starter'`)).price_monthly
    await su(`UPDATE public.subscription_plans SET price_monthly = 1 WHERE tier = 'starter'`)
    let o
    try {
      o = await orderOut(a.id, { tier: 'starter', coupon: 'NEARFREE' })
    } finally {
      await su(`UPDATE public.subscription_plans SET price_monthly = $1 WHERE tier = 'starter'`, [old])
    }
    expectRefused(o, ['coupon_discount_too_large'])
    expect(!/check/i.test(o.code), `raw check violation leaked: ${o.code}`)
  })

  await gatedCase(caseName('the priced order snapshot is immutable for every role, including the owner'), async () => {
    const f = await freshOrder({ status: 'trial' })
    for (const col of ['subtotal_paise = subtotal_paise + 1', `billing_cycle = 'yearly'`, 'cgst_paise = cgst_paise + 1', 'amount = amount + 1']) {
      const o = await suOut(`UPDATE public.payment_history SET ${col} WHERE id = $1`, [f.row.id])
      expectRefusedMatch(o, /snapshot_immutable|immutable/i, `${col}: `)
    }
    expectAccepted(await suOut(`UPDATE public.payment_history SET error_message = 'ops note' WHERE id = $1`, [f.row.id]), 'non-snapshot update: ')
  })

  await gatedCase(caseName('a long p_method is truncated to 32 characters in the stored metadata'), async () => {
    const f = await freshOrder({ status: 'trial' })
    expectAccepted(await activateOut(f.orderId, nx('pay'), { method: 'x'.repeat(200) }))
    const m = await metaOf(f.orderId)
    expect(String(m.razorpay_method).length === 32, `razorpay_method length ${String(m.razorpay_method).length}`)
  })

  await gatedCase(caseName('an invoice number-sequence failure during activation is a typed error and the capture is recorded'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    const o = await withForcedFailure('subscription_invoices', '54000', () => activateOut(f.orderId, pay))
    expectRefused(o, ['invoice_sequence_exhausted'])
    expect((await paymentRow(f.orderId)).razorpay_payment_id === pay, 'payment id not recorded')
    expect((await subOf(f.subId)).status === 'trial', 'subscription changed')
  })

  await gatedCase(caseName('an invalid_transaction_state during activation is a typed error and the capture is recorded'), async () => {
    const f = await freshOrder({ status: 'trial' })
    const pay = nx('pay')
    const o = await withForcedFailure('subscription_invoices', '25000', () => activateOut(f.orderId, pay))
    expectRefused(o, ['invalid_transaction_state'])
    expect((await paymentRow(f.orderId)).razorpay_payment_id === pay, 'payment id not recorded')
  })

  await gatedCase(caseName('a refund that Razorpay processed but the credit note cannot take is kept in subscription_refund_exceptions'), async () => {
    const p = await paidFixture({ status: 'trial' })
    const rf = nx('rf')
    const o = await withForcedFailure('subscription_credit_notes', '54000', () => refundOut(p.pay, rf, 1000n))
    expectRefused(o, ['invoice_sequence_exhausted'])
    expect(o.body.exception_id, 'no exception id')
    const ex = await exceptionsFor(rf)
    expect(ex.length === 1 && ex[0].reason === 'invoice_sequence_exhausted' && big(ex[0].amount_paise) === 1000n, `exceptions ${JSON.stringify(ex)}`)
    const o2 = await withForcedFailure('subscription_credit_notes', '25000', () => refundOut(p.pay, nx('rf'), 1000n))
    expectRefused(o2, ['invalid_transaction_state'])
    expect((await paymentRow(p.orderId)).status === 'success', 'payment changed although no note was written')
  })

  await gatedCase(caseName('an over-size refund is persisted as an exception row; the exception ledger is append-only'), async () => {
    const p = await paidFixture({ status: 'trial' })
    const rf = nx('rf')
    const o = await refundOut(p.pay, rf, p.total + 1n)
    expectRefusedMatch(o, /exceed/i)
    const ex = await exceptionsFor(rf)
    expect(ex.length === 1 && ex[0].reason === 'refund_exceeds_payment', `exceptions ${JSON.stringify(ex)}`)
    expectRefusedMatch(await suOut(`UPDATE public.subscription_refund_exceptions SET reason = 'x' WHERE refund_id = $1`, [rf]), /append-only/i, 'update: ')
    expectRefusedMatch(await suOut(`DELETE FROM public.subscription_refund_exceptions WHERE refund_id = $1`, [rf]), /append-only/i, 'delete: ')
    await refundOut(p.pay, rf, p.total + 1n)
    expect((await exceptionsFor(rf)).length === 1, 'a retry wrote a second exception row')
  })

  await gatedCase(caseName('the refund exception ledger is service_role read-only'), async () => {
    expect(!(await privilegeOf('authenticated', 'subscription_refund_exceptions', 'SELECT')), 'authenticated can read')
    expect(!(await privilegeOf('service_role', 'subscription_refund_exceptions', 'INSERT')), 'service_role can insert')
    expect(await privilegeOf('service_role', 'subscription_refund_exceptions', 'SELECT'), 'service_role cannot read')
  })

  await gatedCase(caseName('cumulative-target rounding: 60 tiny refunds reconcile to the invoice exactly, prefix by prefix (same state)'), async () => {
    const p = await paidFixture({ status: 'trial', tier: 'growth' })
    const inv = (await invoicesFor(p.agency.id))[0]
    const T = big(inv.total_paise)
    const C = big(inv.cgst_paise)
    let sum = 0n
    for (let n = 0; n < 60; n += 1) {
      const a = 111n + BigInt(n % 7)
      expectAccepted(await refundOut(p.pay, nx('rf'), a), `refund ${n}: `)
      sum += a
      const got = (await notesFor(inv.id)).reduce((s, x) => s + big(x.cgst_paise), 0n)
      const want = (2n * sum * C + T) / (2n * T)
      expect(got === want, `after ${n + 1} refunds cgst ${got} want ${want}`)
    }
    expectAccepted(await refundOut(p.pay, nx('rf'), T - sum), 'closing refund: ')
    const notes = await notesFor(inv.id)
    const tot = (k) => notes.reduce((s, x) => s + big(x[k]), 0n)
    expect(tot('cgst_paise') === C && tot('sgst_paise') === C && tot('taxable_paise') === big(inv.taxable_paise) && tot('total_paise') === T, 'notes do not net the invoice to zero')
  })

  await gatedCase(caseName('cumulative-target rounding also reconciles a different-state invoice (IGST)'), async () => {
    const p = await paidFixture({ status: 'trial', agency: { gstin: gstinFor('07'), stateName: 'Delhi' } })
    const inv = (await invoicesFor(p.agency.id))[0]
    const T = big(inv.total_paise)
    const I = big(inv.igst_paise)
    let sum = 0n
    for (let n = 0; n < 40; n += 1) {
      const a = 97n + BigInt(n % 5)
      expectAccepted(await refundOut(p.pay, nx('rf'), a))
      sum += a
      const got = (await notesFor(inv.id)).reduce((s, x) => s + big(x.igst_paise), 0n)
      expect(got === (2n * sum * I + T) / (2n * T), `after ${n + 1} refunds igst ${got}`)
    }
    expectAccepted(await refundOut(p.pay, nx('rf'), T - sum))
    expect((await notesFor(inv.id)).reduce((s, x) => s + big(x.igst_paise), 0n) === I, 'IGST does not net to the invoice')
  })

  await gatedCase(caseName('the invoice timestamp is taken after the number: number order equals issued_at order'), async () => {
    const ps = []
    for (let n = 0; n < 4; n += 1) ps.push(await paidFixture({ status: 'trial' }))
    const invs = []
    for (const p of ps) invs.push((await invoicesFor(p.agency.id))[0])
    for (let n = 1; n < invs.length; n += 1) {
      expect(invs[n].invoice_number > invs[n - 1].invoice_number, 'numbers not increasing')
      expect(new Date(invs[n].issued_at).getTime() >= new Date(invs[n - 1].issued_at).getTime(), `issued_at went backwards at ${n}`)
    }
  })

  await gatedCase(caseName('refunding an earlier payment leaves the subscription alive when a later invoice (by invoice date) is still paid'), async () => {
    const p1 = await paidFixture({ status: 'active', days: 3 })
    const r2 = await renewalOrder(p1.agency.id)
    expectAccepted(await activateOut(r2.orderId, nx('pay')))
    // Make payment_history.created_at disagree with the invoice order: the old created_at rule would cancel.
    await su(`UPDATE public.payment_history SET created_at = now() + interval '2 hours' WHERE id = $1`, [p1.row.id])
    expectAccepted(await refundOut(p1.pay, nx('rf'), p1.total))
    expect((await subOf(p1.subId)).status === 'active', `subscription ${(await subOf(p1.subId)).status}`)
  })

  await gatedCase(caseName('a full refund of the latest payment still cancels the subscription'), async () => {
    const p1 = await paidFixture({ status: 'active', days: 3 })
    const r2 = await renewalOrder(p1.agency.id)
    const pay2 = nx('pay')
    expectAccepted(await activateOut(r2.orderId, pay2))
    expectAccepted(await refundOut(pay2, nx('rf'), r2.total))
    expect((await subOf(p1.subId)).status === 'cancelled', 'a full refund of the latest payment did not cancel')
  })

  await gatedCase(caseName('create_order returns total_paise and a quote_hash, on first call and on replay'), async () => {
    const a = await createAgency()
    await makeSub(a.id, 'trial')
    const orderId = nx('order')
    const o = await orderOut(a.id, { tier: 'starter', orderId })
    expectAccepted(o)
    const b = bodyOf(o)
    const row = await paymentRow(orderId)
    expect(big(b.total_paise) === big(row.amount) && big(b.amount_paise) === big(row.amount), `total_paise ${b.total_paise}`)
    expect(typeof b.quote_hash === 'string' && b.quote_hash.length === 32, `quote_hash ${b.quote_hash}`)
    const r = bodyOf(await orderOut(a.id, { tier: 'starter', orderId }))
    expect(r.replay === true && big(r.total_paise) === big(row.amount) && r.quote_hash === b.quote_hash, `replay ${JSON.stringify(r)}`)
  })

  await gatedCase(caseName('a payment id outside ^[A-Za-z0-9_-]{6,64}$ is refused (invalid_payment_id) by activation and refund'), async () => {
    const f = await freshOrder({ status: 'trial' })
    for (const bad of ['pay 12345', 'abc', 'pay_' + 'x'.repeat(70), "pay_1';--"]) {
      expectRefused(await activateOut(f.orderId, bad), ['invalid_payment_id'], `activate "${bad.slice(0, 12)}": `)
    }
    expectRefused(await refundOut('bad id!', nx('rf'), 100n), ['invalid_payment_id'])
    expectAccepted(await activateOut(f.orderId, 'pay_Abc123XYZ789'), 'a real-looking pay_ id: ')
  })

  await gatedCase(caseName('support reopen: a cancelled agency gets a fresh expired row and can then buy'), async () => {
    const f = await freshOrder({ status: 'cancelled' })
    const o = await suOut(`SELECT public.subscription_support_reopen($1::uuid) AS r`, [f.agency.id])
    expectAccepted(o)
    const b = bodyOf(o)
    const fresh = await subOf(b.subscription_id)
    expect(fresh.status === 'expired' && fresh.agency_id === f.agency.id, `row ${fresh.status}`)
    expect((await subOf(f.subId)).status === 'cancelled', 'the cancelled row changed')
    const r = await renewalOrder(f.agency.id)
    const act = await activateOut(r.orderId, nx('pay'))
    expectAccepted(act)
    expect((await subOf(b.subscription_id)).status === 'active', 'fresh row not activated')
    expect((await subOf(f.subId)).status === 'cancelled', 'cancelled row was reactivated')
  })

  await gatedCase(caseName('support reopen refuses a live agency, a never-cancelled agency and a non-approved agency (typed)'), async () => {
    const live = await freshOrder({ status: 'active' })
    expectRefused(await suOut(`SELECT public.subscription_support_reopen($1::uuid) AS r`, [live.agency.id]), ['subscription_live_exists'])
    const exp = await freshOrder({ status: 'expired', days: -3 })
    expectRefused(await suOut(`SELECT public.subscription_support_reopen($1::uuid) AS r`, [exp.agency.id]), ['subscription_not_cancelled'])
    const pend = await createAgency({ status: 'pending' })
    expectRefused(await suOut(`SELECT public.subscription_support_reopen($1::uuid) AS r`, [pend.id]), ['agency_not_operational'])
    expectRefused(await suOut(`SELECT public.subscription_support_reopen(NULL::uuid) AS r`), ['agency_not_found'])
  })

  await gatedCase(caseName('support reopen twice does not create a second row (second call: live row is expired, not cancelled)'), async () => {
    const f = await freshOrder({ status: 'cancelled' })
    expectAccepted(await suOut(`SELECT public.subscription_support_reopen($1::uuid) AS r`, [f.agency.id]))
    expectRefused(await suOut(`SELECT public.subscription_support_reopen($1::uuid) AS r`, [f.agency.id]), ['subscription_not_cancelled'])
  })

  await gatedCase(caseName('subscription_support_reopen is service_role only'), async () => {
    expectServiceOnly(await fnInfo('subscription_support_reopen'), 'subscription_support_reopen')
    expectRefusedMatch(await asRoleOut('authenticated', `SELECT public.subscription_support_reopen(NULL) AS r`), /permission denied/i)
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
