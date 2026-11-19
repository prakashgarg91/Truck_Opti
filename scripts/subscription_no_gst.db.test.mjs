#!/usr/bin/env node
/**
 * Subscription without GST ("unregistered seller" mode) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the whole
 * supabase/migrations chain, including supabase/migrations/20261043000000_unregistered_seller_mode.sql
 * when that file exists, and drives the commands the way PostgREST does per request
 * (`SET ROLE authenticated` with `request.jwt.claims` set to the caller's sub).
 *
 * Contract under test: docs/FABLE-RULINGS-2026-11-18-C.md section 1 (binding).
 *
 * RED FIRST. The migration 20261043000000_unregistered_seller_mode.sql is written by another worker.
 * Until it lands, every case that needs the new switch, column, function or invoice rule is EXPECTED
 * to fail, and each failure names the missing object or the refused rule. Cases that only exercise
 * behaviour that already exists (registered quote amounts, anon cannot read the settings row,
 * the rate check that refuses 5) pass now.
 *
 * Each case runs independently: a red case never stops the rest of the battery.
 *
 * Money: integer paise only (BigInt in this harness). Registered rule: same state
 * CGST = SGST = half-up(taxable x 18 / 200); different state IGST = half-up(taxable x 18 / 100).
 * Unregistered rule: every tax column 0, gst_rate_pct 0, total = taxable.
 *
 * Usage:  node scripts/subscription_no_gst.db.test.mjs   (from the repo root)
 * Exit 0 = every assertion passed; any failure exits 1. A missing PGlite install is a loud failure.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const NEW_MIGRATION = '20261043000000_unregistered_seller_mode.sql'

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

/** One named assertion. A failure records FAIL with its reason and the battery keeps going. */
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
// Migrations
// ---------------------------------------------------------------------------
let migrationApplied = false
let migrationError = ''
let flagPresent = false

/**
 * Applies the whole chain in order. The new migration is the last link: its absence or failure is a red
 * result (N00 and every case that needs it), not a harness error. Any other migration failing stops the run.
 */
async function applyChain() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sqlText = readFileSync(join(MIGRATIONS_DIR, file), 'utf8')
    try {
      await db.exec(sqlText)
      if (file === NEW_MIGRATION) migrationApplied = true
    } catch (error) {
      if (file === NEW_MIGRATION) {
        migrationError = firstLine(error)
        continue
      }
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Ids and role switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-c000-${String(++seq).padStart(12, '0')}`
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

/** Runs the statement as an arbitrary database role (anon, authenticated, ...), then returns to superuser. */
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

const asUser = (userId, sql, params = []) => attempt(async () => (await asActor(userId, () => db.query(sql, params))).rows)
const asRoleOut = (role, sql, params = []) => attempt(async () => (await asRole(role, sql, params)).rows)
const suOut = (sql, params = []) => attempt(async () => (await su(sql, params)).rows)

/** First value of an accepted outcome (text, number, or decoded json). */
function valueOf(o) {
  return o.rows.length ? cellOf(o.rows[0]) : null
}

function bodyOf(o) {
  const b = o.body ?? valueOf(o)
  expect(b && typeof b === 'object', `no JSON body (${String(b).slice(0, 80)})`)
  return b
}

function expectRefused(o, codes, label = '') {
  const list = Array.isArray(codes) ? codes : [codes]
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 160)})`)
  expect(o.refused, `${label}accepted (${String(JSON.stringify(o.body ?? valueOf(o))).slice(0, 160)}), expected refusal ${list.join(' | ')}`)
  expect(
    list.some((c) => o.code.includes(c)),
    `${label}refused with "${o.code.slice(0, 160)}", expected ${list.join(' | ')}`
  )
}

function expectRefusedMatch(o, re, label = '') {
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 160)})`)
  expect(o.refused, `${label}accepted (${String(JSON.stringify(o.body ?? valueOf(o))).slice(0, 160)}), expected refusal ${re}`)
  expect(re.test(o.code), `${label}refused with "${o.code.slice(0, 160)}", expected ${re}`)
}

function expectAccepted(o, label = '') {
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 160)})`)
  expect(!o.refused, `${label}refused with "${o.code.slice(0, 160)}"`)
}

// ---------------------------------------------------------------------------
// Money helpers (BigInt paise). Independent oracle for the SQL under test.
// ---------------------------------------------------------------------------
const big = (x) => BigInt(String(x ?? 0))

/** Registered split: same state CGST = SGST = half-up(18%/2), different state IGST = half-up(18%). */
function registeredSplit(taxable, same) {
  const T = BigInt(taxable)
  if (same) {
    const c = (18n * T + 100n) / 200n
    return { cgst: c, sgst: c, igst: 0n, total: T + 2n * c }
  }
  const i = (18n * T + 50n) / 100n
  return { cgst: 0n, sgst: 0n, igst: i, total: T + i }
}

/** Tax for an arbitrary rate (0, 5, 18) on a taxable amount, using the same half-up rule as the table check. */
function taxFor(rate, taxable, same) {
  const r = BigInt(rate)
  const T = BigInt(taxable)
  if (same) {
    const c = (r * T + 100n) / 200n
    return { cgst: c, sgst: c, igst: 0n }
  }
  return { cgst: 0n, sgst: 0n, igst: (r * T + 50n) / 100n }
}

const MONTHLY_STARTER = 49900n
const SELLER_LEGAL = 'TruckOpti Logistics Pvt Ltd'
const SELLER_ADDR = 'Mumbai, Maharashtra'
const SELLER_GSTIN = '27ABCDE1234F1Z5'
const SAC = '997331'
const FY = '26-27'
/** 15 July 2026 IST: a fixed issue instant inside FY 26-27 for raw invoice rows. */
const FIXED_ISSUE_AT = '2026-07-15T06:00:00Z'

/** Indian financial-year label ('26-27') of an instant. Asia/Kolkata, FY starts 1 April. */
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

let adminUser = null
let ownerUser = null
let rawAgencyId = null

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [id, email, JSON.stringify({})])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

/** Approved agency with an owner. Pass gstin null for no GSTIN; state is the agency's state name. */
async function createAgency({ gstin = gstinFor('27'), stateName = 'Maharashtra', status = 'approved' } = {}) {
  const userId = await createUser('nogst-owner')
  const id = uid()
  const name = `NoGST ${seq} Transport Pvt Ltd`
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number, state)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6, $7)`,
    [id, userId, name, status, gstin, `ABCDE${String(1000 + (seq % 9000))}Q`, stateName]
  )
  return { id, userId, name, gstin, stateName }
}

async function makeSub(agencyId, status = 'trial') {
  const planId = (await suOne(`SELECT id FROM public.subscription_plans WHERE tier = 'starter'`)).id
  const id = uid()
  await su(
    `INSERT INTO public.subscriptions
       (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, grace_end)
     VALUES ($1, NULL, $2, $3, $4, 'monthly', now() - interval '10 days', now() + interval '20 days',
             CASE WHEN $4 = 'trial' THEN now() + interval '14 days' END, NULL)`,
    [id, agencyId, planId, status]
  )
  return id
}

async function setupFixtures() {
  adminUser = await createUser('nogst-admin')
  await su(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [adminUser])
  ownerUser = await createUser('nogst-non-admin')
  rawAgencyId = (await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })).id
}

/**
 * Seller configuration as a direct superuser write (fixture only, not the admin path).
 * Registered writes the registered row; unregistered sets gst_registered = false and gstin NULL.
 * Before the migration lands there is no flag column, so an unregistered seller cannot be set up at all.
 */
async function setSeller({ registered = true, legal = SELLER_LEGAL, gstin = SELLER_GSTIN, address = SELLER_ADDR, state = '27', sac = SAC } = {}) {
  const g = registered ? gstin : null
  if (!flagPresent) {
    if (!registered) throw new Error('red: column gst_registered is missing, so an unregistered seller cannot be configured')
    await su(
      `UPDATE public.platform_billing_settings SET legal_name = $1, gstin = $2, address = $3, state_code = $4, sac_code = $5`,
      [legal, g, address, state, sac]
    )
    return
  }
  await su(
    `UPDATE public.platform_billing_settings
        SET legal_name = $1, gstin = $2, address = $3, state_code = $4, sac_code = $5, gst_registered = $6::boolean`,
    [legal, g, address, state, sac, registered ? 'true' : 'false']
  )
}

async function readSeller() {
  return (await su(`SELECT * FROM public.platform_billing_settings`)).rows[0]
}

// ---------------------------------------------------------------------------
// Command wrappers
// ---------------------------------------------------------------------------
const bool = (v) => (v === null || v === undefined ? null : v ? 'true' : 'false')

const SETTINGS_7 = `SELECT public.platform_billing_settings_update($1::text, $2::text, $3::text, $4::text, $5::text, $6::boolean, $7::boolean) AS r`

/** Seven positional arguments. Omitted keys take the valid registered defaults. */
function settingsArgs(o = {}) {
  return [
    'legal' in o ? o.legal : SELLER_LEGAL,
    'gstin' in o ? o.gstin : SELLER_GSTIN,
    'address' in o ? o.address : SELLER_ADDR,
    'state' in o ? o.state : '27',
    'sac' in o ? o.sac : SAC,
    'enforce' in o ? bool(o.enforce) : 'false',
    'reg' in o ? bool(o.reg) : 'true',
  ]
}

/** The admin path (or whichever actor is given): platform_billing_settings_update with 7 arguments. */
const updateAs = (actor, o) => asUser(actor, SETTINGS_7, settingsArgs(o))

const QUOTE = `SELECT public.subscription_quote_order($1::uuid, $2::text, $3::text, $4::text) AS r`
const quoteFor = (agencyId, cycle = 'monthly') => suOut(QUOTE, [agencyId, 'starter', cycle, null])

async function orderOut(agencyId, orderId) {
  return suOut(`SELECT public.subscription_create_order($1::uuid, $2::text, $3::text, $4::text, $5::text) AS r`, [agencyId, 'starter', 'monthly', null, orderId])
}

async function paymentRow(orderId) {
  return (await su(`SELECT * FROM public.payment_history WHERE razorpay_order_id = $1`, [orderId])).rows[0]
}

async function activateOut(orderId, paymentId) {
  const amt = big((await paymentRow(orderId)).amount)
  return suOut(
    `SELECT public.subscription_activate_payment($1::text, $2::text, $3, $4::text, $5::text, $6::text) AS r`,
    [orderId, paymentId, String(amt), 'INR', 'upi', 'verify']
  )
}

const refundOut = (paymentId, refundId, amount) =>
  suOut(`SELECT public.subscription_record_refund($1::text, $2::text, $3) AS r`, [paymentId, refundId, String(amount)])

/**
 * Agency + trial subscription + order + verified payment, priced under the seller as configured now.
 * Throws (a red case) if the order or the activation is refused, naming the refusal.
 */
async function activatedInvoice(agency) {
  await makeSub(agency.id, 'trial')
  const orderId = nx('order')
  const o = await orderOut(agency.id, orderId)
  expectAccepted(o, 'create_order refused: ')
  const pay = `pay_${String(++nonce).padStart(8, '0')}`
  const act = await activateOut(orderId, pay)
  expectAccepted(act, 'activation refused: ')
  const inv = (
    await su(
      `SELECT i.* FROM public.subscription_invoices i
         JOIN public.payment_history h ON h.subscription_invoice_id = i.id
        WHERE h.razorpay_order_id = $1`,
      [orderId]
    )
  ).rows[0]
  expect(inv, 'no invoice row linked to the activated payment')
  return { inv, orderId, pay, act }
}

async function invoicesFor(agencyId) {
  return (await su(`SELECT * FROM public.subscription_invoices WHERE agency_id = $1 ORDER BY issued_at, id`, [agencyId])).rows
}

async function invoiceSnapshot(invoiceId) {
  const r = await su(`SELECT to_jsonb(i) AS j FROM public.subscription_invoices i WHERE id = $1`, [invoiceId])
  return JSON.stringify(cellOf(r.rows[0]))
}

/** Numeric sequence part of TO/yy-yy/NNNNNN or CN/yy-yy/NNNNNN. */
const seqPart = (number) => Number(String(number).split('/')[2])

/** Inserts a subscription invoice row as superuser (raw, bypassing activation). */
async function insertInvoiceOut(o = {}) {
  const id = uid()
  const rate = o.rate ?? 0
  const same = o.same ?? true
  const taxable = BigInt(o.taxable ?? MONTHLY_STARTER)
  const tax = o.tax ?? taxFor(rate, taxable, same)
  const total = taxable + tax.cgst + tax.sgst + tax.igst
  const number = o.number ?? `TO/${FY}/${String(800000 + ++nonce).padStart(6, '0')}`
  const supplier = o.supplier !== undefined ? o.supplier : SELLER_GSTIN
  const out = await suOut(
    `INSERT INTO public.subscription_invoices
       (id, agency_id, invoice_number, series, fy, supplier_gstin, supplier_state_code, recipient_gstin,
        place_of_supply_state_code, sac_code, gst_rate_pct, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
     VALUES ($1, $2, $3, 'TO', $4, $5, '27', NULL, $6, $7, $8, $9, $10, $11, $12, $13, $14::timestamptz)`,
    [
      id,
      o.agencyId ?? rawAgencyId,
      number,
      FY,
      supplier,
      same ? '27' : '07',
      SAC,
      String(rate),
      String(taxable),
      String(tax.cgst),
      String(tax.sgst),
      String(tax.igst),
      String(total),
      FIXED_ISSUE_AT,
    ]
  )
  return { ...out, id, total, taxable, tax }
}

/** A credit note row inserted as superuser (raw). Its number is minted by the service function. */
async function insertCreditNoteRaw(invoiceId, agencyId, amount) {
  const number = (await suOne(`SELECT public.subscription_next_invoice_number('CN', now()) AS n`)).n
  return suOut(
    `INSERT INTO public.subscription_credit_notes
       (invoice_id, agency_id, credit_note_number, refund_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
     VALUES ($1, $2, $3, $4, $5, 0, 0, 0, $5, now())`,
    [invoiceId, agencyId, number, nx('rf-raw'), String(amount)]
  )
}

async function notesFor(invoiceId) {
  return (await su(`SELECT * FROM public.subscription_credit_notes WHERE invoice_id = $1 ORDER BY issued_at, id`, [invoiceId])).rows
}

async function colsOf(table) {
  const r = await su(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])
  return new Set(r.rows.map((x) => x.column_name))
}

async function fnRows(name) {
  return (
    await su(
      `SELECT p.oid, p.pronargs, pg_get_function_identity_arguments(p.oid) AS args
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = $1`,
      [name]
    )
  ).rows
}

// ---------------------------------------------------------------------------
// Settings configuration cases
// ---------------------------------------------------------------------------

/** Quote fields used by several cases, read from an accepted quote. */
function quoteBody(o, label) {
  expectAccepted(o, `${label} quote refused: `)
  return bodyOf(o)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyChain()
  flagPresent = (await suOne(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'platform_billing_settings' AND column_name = 'gst_registered'`
  )).n === 1

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(
    `migrations applied: ${applied.length} (last=${applied[applied.length - 1]}; ${NEW_MIGRATION} present=${existsSync(join(MIGRATIONS_DIR, NEW_MIGRATION))}, applied=${migrationApplied}${migrationError ? `, error=${migrationError}` : ''}; gst_registered column=${flagPresent})`
  )

  await setupFixtures()
  await setSeller({ registered: true })

  // =========================================================================
  // 0. Migration and column
  // =========================================================================
  await testCase('N00. migration supabase/migrations/20261043000000_unregistered_seller_mode.sql exists and applies', async () => {
    expect(existsSync(join(MIGRATIONS_DIR, NEW_MIGRATION)), `${NEW_MIGRATION} is missing`)
    expect(migrationApplied, `${NEW_MIGRATION} failed to apply: ${migrationError}`)
  })

  await testCase('N01. platform_billing_settings.gst_registered column exists', async () => {
    expect((await colsOf('platform_billing_settings')).has('gst_registered'), 'column gst_registered is missing')
  })

  await testCase('N02. gst_registered is NOT NULL with default true', async () => {
    const r = await suOne(
      `SELECT is_nullable, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_billing_settings' AND column_name = 'gst_registered'`
    )
    expect(r, 'column gst_registered is missing')
    expect(r.is_nullable === 'NO', `is_nullable ${r.is_nullable}, want NO`)
    expect(/^true$/i.test(String(r.column_default)), `column_default ${r.column_default}, want true`)
  })

  await testCase('N03. the existing settings row is registered (gst_registered = true)', async () => {
    const r = await readSeller()
    expect(r && r.gst_registered === true, `gst_registered is ${r ? r.gst_registered : 'no row'}, want true`)
  })

  // =========================================================================
  // 1. Settings update: signature, privilege, validation
  // =========================================================================
  await testCase('N04. the 6-argument platform_billing_settings_update is gone', async () => {
    const six = (await fnRows('platform_billing_settings_update')).filter((r) => Number(r.pronargs) === 6)
    expect(six.length === 0, `${six.length} six-argument overload(s) still exist`)
  })

  await testCase('N05. the 7-argument platform_billing_settings_update exists with p_gst_registered boolean last', async () => {
    const seven = (await fnRows('platform_billing_settings_update')).filter((r) => Number(r.pronargs) === 7)
    expect(seven.length === 1, `expected one seven-argument overload, found ${seven.length}`)
    expect(/, p_gst_registered boolean$/.test(seven[0].args), `arguments end "${seven[0].args.slice(-60)}"`)
  })

  await testCase('N06. a non-admin is refused the 7-argument update with 42501 forbidden', async () => {
    const o = await updateAs(ownerUser, {})
    expectRefused(o, ['forbidden'], 'non-admin: ')
  })

  await testCase('N07. a NULL p_gst_registered is refused as invalid_gst_registered (22023)', async () => {
    const o = await updateAs(adminUser, { reg: null })
    expectRefused(o, ['invalid_gst_registered'], 'NULL flag: ')
  })

  await testCase('N08. registered path: admin saves with a GSTIN and true; flag and GSTIN are stored', async () => {
    const o = await updateAs(adminUser, { reg: true, gstin: SELLER_GSTIN })
    expectAccepted(o, 'registered save: ')
    const r = await readSeller()
    expect(r.gst_registered === true, `gst_registered ${r.gst_registered}`)
    expect(r.gstin === SELLER_GSTIN, `gstin ${r.gstin}`)
  })

  await testCase('N09. registered path: a blank GSTIN is refused as invalid_gstin', async () => {
    expectRefused(await updateAs(adminUser, { reg: true, gstin: '   ' }), ['invalid_gstin'], 'blank GSTIN: ')
  })

  await testCase('N10. registered path: a NULL GSTIN is refused as invalid_gstin', async () => {
    expectRefused(await updateAs(adminUser, { reg: true, gstin: null }), ['invalid_gstin'], 'NULL GSTIN: ')
  })

  await testCase('N11. registered quote is unchanged: 18% same-state split on the plan price', async () => {
    await setSeller({ registered: true })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const b = quoteBody(await quoteFor(agency.id), 'registered')
    const want = registeredSplit(MONTHLY_STARTER, true)
    const got = { taxable: big(b.taxable_paise), cgst: big(b.cgst_paise), sgst: big(b.sgst_paise), igst: big(b.igst_paise), total: big(b.total_paise) }
    const bad = []
    if (got.taxable !== MONTHLY_STARTER) bad.push(`taxable ${got.taxable}`)
    if (got.cgst !== want.cgst) bad.push(`cgst ${got.cgst} want ${want.cgst}`)
    if (got.sgst !== want.sgst) bad.push(`sgst ${got.sgst} want ${want.sgst}`)
    if (got.igst !== 0n) bad.push(`igst ${got.igst}`)
    if (got.total !== want.total) bad.push(`total ${got.total} want ${want.total}`)
    expect(bad.length === 0, bad.join(', '))
  })

  await testCase('N12. registered quote result carries gst_registered = true', async () => {
    await setSeller({ registered: true })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const b = quoteBody(await quoteFor(agency.id), 'registered')
    expect(b.gst_registered === true, `gst_registered is ${JSON.stringify(b.gst_registered)}, want true`)
  })

  // =========================================================================
  // 2. Unregistered settings: GSTIN rules and the other fields still validated
  // =========================================================================
  await testCase('N13. unregistered with a GSTIN is refused as gstin_not_allowed_when_unregistered (22023)', async () => {
    expectRefused(await updateAs(adminUser, { reg: false, gstin: SELLER_GSTIN }), ['gstin_not_allowed_when_unregistered'], 'GSTIN while unregistered: ')
  })

  await testCase('N14. unregistered with a blank GSTIN is accepted and the GSTIN is stored NULL', async () => {
    const o = await updateAs(adminUser, { reg: false, gstin: '   ' })
    expectAccepted(o, 'blank GSTIN while unregistered: ')
    const r = await readSeller()
    expect(r.gst_registered === false && r.gstin === null, `flag ${r.gst_registered}, gstin ${r.gstin}`)
  })

  await testCase('N15. unregistered with a NULL GSTIN is accepted and the GSTIN is stored NULL', async () => {
    const o = await updateAs(adminUser, { reg: false, gstin: null })
    expectAccepted(o, 'NULL GSTIN while unregistered: ')
    const r = await readSeller()
    expect(r.gst_registered === false && r.gstin === null, `flag ${r.gst_registered}, gstin ${r.gstin}`)
  })

  await testCase('N16. unregistered still requires the legal name (invalid_legal_name)', async () => {
    expectRefused(await updateAs(adminUser, { reg: false, gstin: null, legal: '  ' }), ['invalid_legal_name'], 'legal name: ')
  })

  await testCase('N17. unregistered still requires the address (invalid_address)', async () => {
    expectRefused(await updateAs(adminUser, { reg: false, gstin: null, address: '' }), ['invalid_address'], 'address: ')
  })

  await testCase('N18. unregistered still validates the state code (invalid_state_code)', async () => {
    expectRefused(await updateAs(adminUser, { reg: false, gstin: null, state: '99' }), ['invalid_state_code'], 'state: ')
  })

  await testCase('N19. unregistered still validates the SAC code (invalid_sac_code)', async () => {
    expectRefused(await updateAs(adminUser, { reg: false, gstin: null, sac: '12' }), ['invalid_sac_code'], 'SAC: ')
  })

  await testCase('N20. table check refuses gst_registered = false while a GSTIN is stored', async () => {
    await setSeller({ registered: true })
    const o = await suOut(`UPDATE public.platform_billing_settings SET gst_registered = false RETURNING gst_registered`)
    expectRefusedMatch(o, /check constraint/i, 'direct UPDATE with GSTIN still set: ')
    const r = await readSeller()
    expect(r.gstin === SELLER_GSTIN, 'refused UPDATE still changed the GSTIN')
  })

  // =========================================================================
  // 3. Quote without GST
  // =========================================================================
  await testCase('N21. unregistered seller, same-state agency: quote succeeds with zero tax and total = taxable', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const b = quoteBody(await quoteFor(agency.id), 'unregistered same-state')
    const bad = []
    if (big(b.taxable_paise) !== MONTHLY_STARTER) bad.push(`taxable ${b.taxable_paise} want ${MONTHLY_STARTER}`)
    for (const k of ['cgst_paise', 'sgst_paise', 'igst_paise']) if (big(b[k]) !== 0n) bad.push(`${k} ${b[k]}`)
    if (big(b.total_paise) !== MONTHLY_STARTER) bad.push(`total ${b.total_paise} want ${MONTHLY_STARTER}`)
    expect(bad.length === 0, bad.join(', '))
  })

  await testCase('N22. unregistered seller, other-state agency: quote succeeds with zero IGST too', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Delhi', gstin: gstinFor('07') })
    const b = quoteBody(await quoteFor(agency.id), 'unregistered other-state')
    const bad = []
    if (big(b.taxable_paise) !== MONTHLY_STARTER) bad.push(`taxable ${b.taxable_paise}`)
    for (const k of ['cgst_paise', 'sgst_paise', 'igst_paise']) if (big(b[k]) !== 0n) bad.push(`${k} ${b[k]}`)
    if (big(b.total_paise) !== MONTHLY_STARTER) bad.push(`total ${b.total_paise}`)
    expect(bad.length === 0, bad.join(', '))
  })

  await testCase('N23. unregistered quote result carries gst_registered = false and gst_rate_pct = 0', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const b = quoteBody(await quoteFor(agency.id), 'unregistered result keys')
    expect(b.gst_registered === false, `gst_registered is ${JSON.stringify(b.gst_registered)}, want false`)
    expect(Number(b.gst_rate_pct) === 0, `gst_rate_pct is ${JSON.stringify(b.gst_rate_pct)}, want 0`)
  })

  await testCase('N24. unregistered without a legal name: sale refused as BILLING_NOT_CONFIGURED', async () => {
    await setSeller({ registered: false, gstin: null, legal: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    expectRefused(await quoteFor(agency.id), ['BILLING_NOT_CONFIGURED'], 'no legal name: ')
  })

  await testCase('N25. unregistered without an address: sale refused as BILLING_NOT_CONFIGURED', async () => {
    await setSeller({ registered: false, gstin: null, address: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    expectRefused(await quoteFor(agency.id), ['BILLING_NOT_CONFIGURED'], 'no address: ')
  })

  await testCase('N26. unregistered without a state code: sale refused as BILLING_NOT_CONFIGURED', async () => {
    await setSeller({ registered: false, gstin: null, state: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    expectRefused(await quoteFor(agency.id), ['BILLING_NOT_CONFIGURED'], 'no state: ')
  })

  // =========================================================================
  // 4. Activation and invoices while unregistered
  // =========================================================================
  await testCase('N27. activation while unregistered: invoice supplier_gstin is NULL', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const { inv } = await activatedInvoice(agency)
    expect(inv.supplier_gstin === null, `supplier_gstin ${inv.supplier_gstin}, want NULL`)
  })

  await testCase('N28. activation while unregistered: gst_rate_pct 0, every tax column 0, total = taxable', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const { inv } = await activatedInvoice(agency)
    const bad = []
    if (Number(inv.gst_rate_pct) !== 0) bad.push(`gst_rate_pct ${inv.gst_rate_pct}`)
    for (const k of ['cgst_paise', 'sgst_paise', 'igst_paise']) if (big(inv[k]) !== 0n) bad.push(`${k} ${inv[k]}`)
    if (big(inv.total_paise) !== big(inv.taxable_paise)) bad.push(`total ${inv.total_paise} vs taxable ${inv.taxable_paise}`)
    if (big(inv.taxable_paise) !== MONTHLY_STARTER) bad.push(`taxable ${inv.taxable_paise} want ${MONTHLY_STARTER}`)
    expect(bad.length === 0, bad.join(', '))
  })

  await testCase('N29. activation while unregistered: invoice number is in the same TO/yy-yy/NNNNNN series', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const { inv } = await activatedInvoice(agency)
    const want = new RegExp(`^TO/${fyNow()}/[0-9]{6}$`)
    expect(want.test(inv.invoice_number), `invoice_number ${inv.invoice_number} does not match TO/${fyNow()}/NNNNNN`)
    expect(inv.series === 'TO' && inv.fy === fyNow(), `series ${inv.series}, fy ${inv.fy}`)
  })

  await testCase('N30. activation while unregistered: recipient GSTIN is stored when the agency has one', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const { inv } = await activatedInvoice(agency)
    expect(inv.recipient_gstin === agency.gstin, `recipient_gstin ${inv.recipient_gstin}, want ${agency.gstin}`)
  })

  await testCase('N31. numbering stays unbroken: registered sale, then unregistered, then registered', async () => {
    await setSeller({ registered: true })
    const a1 = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const first = (await activatedInvoice(a1)).inv
    await setSeller({ registered: false, gstin: null })
    const a2 = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const second = (await activatedInvoice(a2)).inv
    await setSeller({ registered: true })
    const a3 = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const third = (await activatedInvoice(a3)).inv
    const n1 = seqPart(first.invoice_number)
    const n2 = seqPart(second.invoice_number)
    const n3 = seqPart(third.invoice_number)
    expect(n2 === n1 + 1 && n3 === n2 + 1, `numbers ${first.invoice_number}, ${second.invoice_number}, ${third.invoice_number} are not consecutive`)
  })

  // =========================================================================
  // 5. Invoice table constraints
  // =========================================================================
  await testCase('N32. invoice with gst_rate_pct 18 and NULL supplier_gstin is rejected by a check constraint', async () => {
    const o = await insertInvoiceOut({ rate: 18, supplier: null })
    expectRefusedMatch(o, /check constraint/i, 'rate 18 without supplier GSTIN: ')
  })

  await testCase('N33. invoice with gst_rate_pct 0 and NULL supplier_gstin is accepted', async () => {
    const o = await insertInvoiceOut({ rate: 0, supplier: null })
    expectAccepted(o, 'rate 0 without supplier GSTIN: ')
  })

  await testCase('N34. invoice with gst_rate_pct 5 is rejected by a check constraint', async () => {
    const o = await insertInvoiceOut({ rate: 5, supplier: SELLER_GSTIN, taxable: 49900n })
    expectRefusedMatch(o, /check constraint/i, 'rate 5: ')
  })

  // =========================================================================
  // 6. Flag switch does not rewrite stored invoices
  // =========================================================================
  await testCase('N35. switching the flag changes no stored invoice (registered and unregistered snapshots unchanged)', async () => {
    await setSeller({ registered: true })
    const a1 = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const regInv = (await activatedInvoice(a1)).inv
    const regBefore = await invoiceSnapshot(regInv.id)

    expectAccepted(await updateAs(adminUser, { reg: false, gstin: null }), 'switch to unregistered: ')
    expect((await invoiceSnapshot(regInv.id)) === regBefore, 'registered invoice changed after switching to unregistered')

    const a2 = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const unregInv = (await activatedInvoice(a2)).inv
    const unregBefore = await invoiceSnapshot(unregInv.id)

    expectAccepted(await updateAs(adminUser, { reg: true, gstin: SELLER_GSTIN }), 'switch back to registered: ')
    expect((await invoiceSnapshot(regInv.id)) === regBefore, 'registered invoice changed after switching back')
    expect((await invoiceSnapshot(unregInv.id)) === unregBefore, 'unregistered invoice changed after switching back')
  })

  // =========================================================================
  // 7. Refunds and credit notes on a rate-0 invoice
  // =========================================================================
  await testCase('N36. full refund of a rate-0 invoice: credit note has zero tax and total = invoice total', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const { inv, pay } = await activatedInvoice(agency)
    expectAccepted(await refundOut(pay, nx('rf'), big(inv.total_paise)), 'full refund: ')
    const n = (await notesFor(inv.id))[0]
    expect(n, 'no credit note issued')
    const bad = []
    if (big(n.cgst_paise) !== 0n || big(n.sgst_paise) !== 0n || big(n.igst_paise) !== 0n) bad.push('tax not zero')
    if (big(n.taxable_paise) !== big(inv.taxable_paise)) bad.push(`taxable ${n.taxable_paise} want ${inv.taxable_paise}`)
    if (big(n.total_paise) !== big(inv.total_paise)) bad.push(`total ${n.total_paise} want ${inv.total_paise}`)
    expect(bad.length === 0, bad.join(', '))
  })

  await testCase('N37. partial refund of a rate-0 invoice: taxable equals the refunded amount, tax stays zero', async () => {
    await setSeller({ registered: false, gstin: null })
    const agency = await createAgency({ stateName: 'Maharashtra', gstin: gstinFor('27') })
    const { inv, pay } = await activatedInvoice(agency)
    const half = big(inv.total_paise) / 2n
    expectAccepted(await refundOut(pay, nx('rf'), half), 'partial refund: ')
    const n = (await notesFor(inv.id))[0]
    expect(n, 'no credit note issued')
    const bad = []
    if (big(n.total_paise) !== half) bad.push(`total ${n.total_paise} want ${half}`)
    if (big(n.taxable_paise) !== half) bad.push(`taxable ${n.taxable_paise} want ${half}`)
    if (big(n.cgst_paise) !== 0n || big(n.sgst_paise) !== 0n || big(n.igst_paise) !== 0n) bad.push('tax not zero')
    expect(bad.length === 0, bad.join(', '))
  })

  await testCase('N38. credit note guard accepts a partial zero-tax note on a rate-0 invoice (isolated, raw insert)', async () => {
    const inv = await insertInvoiceOut({ rate: 0, supplier: null })
    expectAccepted(inv, 'raw rate-0 invoice: ')
    const half = inv.total / 2n
    const note = await insertCreditNoteRaw(inv.id, rawAgencyId, half)
    expectAccepted(note, 'partial zero-tax credit note: ')
  })

  // =========================================================================
  // 8. platform_gst_registered(): the flag only, public to anon and authenticated
  // =========================================================================
  await testCase('N39. platform_gst_registered is STABLE SECURITY DEFINER, search_path pinned, EXECUTE for anon and authenticated only', async () => {
    const r = await suOne(
      `SELECT p.prosecdef, p.provolatile, p.proconfig::text AS cfg,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub_exec
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = 'platform_gst_registered'`
    )
    expect(r, 'function public.platform_gst_registered does not exist')
    const bad = []
    if (r.prosecdef !== true) bad.push('not SECURITY DEFINER')
    if (r.provolatile !== 's') bad.push(`volatility ${r.provolatile}, want s (STABLE)`)
    if (!/search_path=public,\s*pg_temp/.test(String(r.cfg))) bad.push(`search_path not pinned (${r.cfg})`)
    if (r.anon_exec !== true) bad.push('anon cannot EXECUTE')
    if (r.auth_exec !== true) bad.push('authenticated cannot EXECUTE')
    if (r.pub_exec === true) bad.push('PUBLIC has EXECUTE')
    expect(bad.length === 0, bad.join(', '))
  })

  await testCase('N40. anon can call platform_gst_registered and gets the flag (true, then false after the switch)', async () => {
    await setSeller({ registered: true })
    const t = await asRoleOut('anon', `SELECT public.platform_gst_registered() AS r`)
    expectAccepted(t, 'anon call while registered: ')
    expect(valueOf(t) === true, `anon got ${JSON.stringify(valueOf(t))}, want true`)
    await setSeller({ registered: false, gstin: null })
    const f = await asRoleOut('anon', `SELECT public.platform_gst_registered() AS r`)
    expectAccepted(f, 'anon call while unregistered: ')
    expect(valueOf(f) === false, `anon got ${JSON.stringify(valueOf(f))}, want false`)
  })

  await testCase('N41. authenticated can call platform_gst_registered and gets the flag', async () => {
    await setSeller({ registered: false, gstin: null })
    const o = await asRoleOut('authenticated', `SELECT public.platform_gst_registered() AS r`)
    expectAccepted(o, 'authenticated call: ')
    expect(valueOf(o) === false, `authenticated got ${JSON.stringify(valueOf(o))}, want false`)
  })

  await testCase('N42. anon still cannot select platform_billing_settings (permission denied)', async () => {
    const o = await asRoleOut('anon', `SELECT legal_name FROM public.platform_billing_settings`)
    expectRefusedMatch(o, /permission denied/i, 'anon select: ')
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} assertions passed; ${failed.length} failed`)
  if (failed.length) {
    console.log('Failing assertions:')
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
