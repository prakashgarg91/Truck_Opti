#!/usr/bin/env node
/**
 * Agency freight invoices and collections (TO-148) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the
 * supabase/migrations chain and drives the commands the way PostgREST does per request:
 * `SET ROLE authenticated` with `request.jwt.claims` set to the caller's sub.
 *
 * RED FIRST. The migration that implements this contract is NOT written yet
 * (supabase/migrations/20261021000000_agency_invoices.sql, created by another writer).
 * Every case that needs the new tables or commands is EXPECTED to fail now; I01 names the
 * missing file explicitly.
 *
 * RECORD-ONLY module: the platform never holds or moves freight money. The agency collects
 * into its own account and records receipts here. All amounts are integer paise.
 *
 * Pinned contract under test.
 *
 *   Tables (RLS on; authenticated gets SELECT only, no direct writes):
 *     agency_invoices(id, agency_id, client_id -> client, invoice_number text,
 *       status 'issued'|'partly_paid'|'paid'|'cancelled', supplier_state_code text,
 *       place_of_supply_state_code text, gst_rate_pct int in (0,5,12,18), reverse_charge boolean,
 *       subtotal_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise,
 *       paid_paise bigint default 0, version int, idempotency_key text, created_at)
 *       UNIQUE (agency_id, invoice_number), UNIQUE (agency_id, idempotency_key)
 *     agency_invoice_lines(id, invoice_id, line_no, description, quantity numeric,
 *       rate_paise bigint, amount_paise bigint)
 *     agency_invoice_payments(id, invoice_id, agency_id, amount_paise bigint > 0,
 *       method 'upi'|'bank'|'cash'|'cheque', reference text, received_on date,
 *       idempotency_key, created_at)  UNIQUE (agency_id, idempotency_key)
 *     agency_invoice_sequences(agency_id, fy, last_seq)
 *
 *   public.agency_invoice_issue(p_client_id uuid, p_lines jsonb, p_supplier_state text,
 *     p_place_of_supply_state text, p_gst_rate_pct int, p_reverse_charge boolean,
 *     p_round_off boolean, p_idempotency_key text) RETURNS jsonb
 *     - SECURITY DEFINER, agency from auth.uid(), scope 'finance' (owner always allowed).
 *       dispatcher / fleet_manager / viewer refused 'forbidden_scope'.
 *     - Totals RECOMPUTED server-side. Line amount = quantity * rate_paise, rounded half-up.
 *       Same state: CGST and SGST each half (an odd paisa goes to CGST). Different state: IGST.
 *       reverse_charge true: every tax is 0. p_round_off rounds the total to the nearest rupee
 *       (50 paise up) and round_off_paise records the difference.
 *     - Success: {ok:true, invoice_id, invoice_number} with number 'INV/<FY>/<000001>', Indian
 *       FY Apr-Mar, sequence per agency, gap-free per success.
 *     - Refusals: client_not_found (other agency), no_lines, invalid_line (problems[] with
 *       0-based index: quantity <= 0, rate < 0, empty description), invalid_gst_rate,
 *       invalid_state_code (2 digits 01-38), too_many_lines (> 100),
 *       idempotent_replay (same key, same payload: replay:true, same invoice),
 *       idempotency_key_reused (same key, different payload).
 *
 *   public.agency_invoice_record_payment(p_invoice_id uuid, p_amount_paise bigint,
 *     p_method text, p_reference text, p_received_on date, p_expected_version int,
 *     p_idempotency_key text) RETURNS jsonb
 *     - Success: {ok:true, paid_paise, status, version}. status 'partly_paid', then 'paid'
 *       when paid_paise = total_paise.
 *     - Refusals: invoice_cancelled, invalid_amount (<= 0), overpayment (beyond total; body
 *       carries outstanding_paise), version_conflict, invalid_method, future_date, not_found
 *       (other agency), forbidden_scope.
 *     - Replay of the same key: replay:true, no second payment row.
 *
 *   public.agency_invoice_cancel(p_invoice_id uuid, p_expected_version int, p_reason text)
 *     RETURNS jsonb
 *     - Only when paid_paise = 0. Refusals: has_payments, reason_required (blank, or longer
 *       than 300 characters), already_cancelled, version_conflict, not_found, forbidden_scope.
 *
 *   Invariants: payments never reduce paid_paise (no negative path); sum(payments) = paid_paise.
 *
 *   RLS reads: owner and every active staff scope read their agency's invoices, lines and
 *   payments. Suspended-agency staff, revoked members, users with no agency, other agencies
 *   and anon read 0 rows.
 *
 * Assumptions (not pinned by the brief, flagged for the implementer):
 *   - agency_clients does NOT exist in supabase/migrations. The billed client is
 *     public.agency_client_agreements (the TO-145 client table). The FK should target that.
 *   - A refusal may be RAISED (message = the code) or RETURNED as {ok:false,error:code}.
 *     Both are accepted. Other fields of a refusal body are only checked where pinned.
 *   - Version: the invoice starts at version 1; each accepted payment or cancel bumps it by 1.
 *   - Replay and idempotency checks run before the version check.
 *   - Sequence numbers are checked against the current Indian FY of the database clock host.
 *   - Concurrency is not raced. Evidence class: local DB only (PGlite, single session).
 *
 * Usage:  node scripts/agency_invoices.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud
 * failure, never a silent skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const INVOICE_MIGRATION = join(MIGRATIONS_DIR, '20261021000000_agency_invoices.sql')

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

/** Resolves the error message of a rejected promise, or null when it resolves. */
async function errorOf(promise) {
  try {
    await promise
    return null
  } catch (error) {
    return firstLine(error)
  }
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
const uid = () => `00000000-0000-4000-9000-${String(++seq).padStart(12, '0')}`
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
// Fixtures (superuser). Only pre-existing tables are touched here.
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

/** The billed client is an agency client agreement (agency_clients does not exist). */
async function seedClient(agencyId, clientName, status = 'active') {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, agencyId, clientName, status, nx('seed-client')]
  )
  return id
}

/** Fresh approved agency with its own owner and one billed client (for sequence tests). */
async function freshAgency(tag) {
  const owner = await createUser(`inv-${tag}`)
  const agency = await createAgencyRow(owner, `Invoice ${tag}`, 'approved')
  const client = await seedClient(agency, `Client ${tag}`)
  return { owner, agency, client }
}

// Fixture handles, assigned in setupFixtures().
let ownerA, ownerB, ownerS, agencyA, agencyB, agencyS
let clientA, clientB, clientS
let dispatcherA, fleetA, financeA, viewerA, revokedFinanceA, suspendedStaffS, noAgency

async function setupFixtures() {
  ownerA = await createUser('inv-owner-a')
  agencyA = await createAgencyRow(ownerA, 'Invoice A', 'approved')
  ownerB = await createUser('inv-owner-b')
  agencyB = await createAgencyRow(ownerB, 'Invoice B', 'approved')
  ownerS = await createUser('inv-owner-s')
  agencyS = await createAgencyRow(ownerS, 'Invoice S', 'suspended')

  clientA = await seedClient(agencyA, 'Acme Freight')
  clientB = await seedClient(agencyB, 'Beta Logistics')
  clientS = await seedClient(agencyS, 'Gamma Goods')

  dispatcherA = await seedStaff(agencyA, 'inv-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'inv-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'inv-finance', 'finance')
  viewerA = await seedStaff(agencyA, 'inv-viewer', 'viewer')
  revokedFinanceA = await seedStaff(agencyA, 'inv-revoked-fin', 'finance', 'revoked')
  suspendedStaffS = await seedStaff(agencyS, 'inv-suspended', 'finance')
  noAgency = await createUser('inv-no-agency')
}

// ---------------------------------------------------------------------------
// SQL texts and command wrappers
// ---------------------------------------------------------------------------
const INVOICE_TABLES = ['agency_invoices', 'agency_invoice_lines', 'agency_invoice_payments', 'agency_invoice_sequences']
const INVOICE_COLS = [
  'id', 'agency_id', 'client_id', 'invoice_number', 'status', 'supplier_state_code', 'place_of_supply_state_code',
  'gst_rate_pct', 'reverse_charge', 'subtotal_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'round_off_paise',
  'total_paise', 'paid_paise', 'version', 'idempotency_key', 'created_at',
]
const LINE_COLS = ['id', 'invoice_id', 'line_no', 'description', 'quantity', 'rate_paise', 'amount_paise']
const PAYMENT_COLS = ['id', 'invoice_id', 'agency_id', 'amount_paise', 'method', 'reference', 'received_on', 'idempotency_key', 'created_at']
const SEQUENCE_COLS = ['agency_id', 'fy', 'last_seq']

const ISSUE_SQL = `SELECT public.agency_invoice_issue($1::uuid, $2::jsonb, $3::text, $4::text, $5::int, $6::boolean, $7::boolean, $8::text) AS r`
const PAY_SQL = `SELECT public.agency_invoice_record_payment($1::uuid, $2::bigint, $3::text, $4::text, $5::date, $6::int, $7::text) AS r`
const CANCEL_SQL = `SELECT public.agency_invoice_cancel($1::uuid, $2::int, $3::text) AS r`

const SCOPE_CODES = ['forbidden_scope', 'Your access scope does not allow this action.']
const NO_PROFILE_CODES = ['No agency profile found for this account.']
const APPROVAL_CODES = ['Agency approval is required.']

const INV_INSERT = `INSERT INTO public.agency_invoices
  (id, agency_id, client_id, invoice_number, status, supplier_state_code, place_of_supply_state_code,
   gst_rate_pct, reverse_charge, subtotal_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise,
   total_paise, paid_paise, version, idempotency_key)
VALUES ($1, $2, $3, $4, $5, '27', '27', $6, false, 200000, 18000, 18000, 0, 0, 236000, $7, $8, $9)`

const LINE_INSERT = `INSERT INTO public.agency_invoice_lines (id, invoice_id, line_no, description, quantity, rate_paise, amount_paise)
VALUES ($1, $2, $3, 'Seed load', 1, 50000, 50000)`

const PAY_INSERT = `INSERT INTO public.agency_invoice_payments (id, invoice_id, agency_id, amount_paise, method, reference, received_on, idempotency_key)
VALUES ($1, $2, $3, $4, $5, 'UTR-SEED', current_date - 1, $6)`

/** Parameters for a superuser or direct-DML invoice insert (9 values, see INV_INSERT). */
function invInsertParams(agencyId, clientId, { number, key, gst = 18, status = 'issued', paid = 0, version = 1, id = uid() } = {}) {
  return [id, agencyId, clientId, number ?? nx('INV/SEED'), status, gst, paid, version, key ?? nx('seed-inv')]
}

async function seedInvoiceRow(agencyId, clientId, opts = {}) {
  const params = invInsertParams(agencyId, clientId, opts)
  await su(INV_INSERT, params)
  return params[0]
}

async function seedLine(invoiceId, lineNo = 1) {
  const id = uid()
  await su(LINE_INSERT, [id, invoiceId, lineNo])
  return id
}

async function seedPaymentRow(invoiceId, agencyId, { amount = 50000, method = 'upi', key } = {}) {
  const id = uid()
  await su(PAY_INSERT, [id, invoiceId, agencyId, amount, method, key ?? nx('seed-pay')])
  return id
}

/** A complete valid line. */
function invLine(over = {}) {
  return { description: 'Freight haulage', quantity: 2, rate_paise: 100000, ...over }
}

function linesOf(n, over = {}) {
  return Array.from({ length: n }, (_, i) => invLine({ description: `Load ${i + 1}`, ...over }))
}

async function issueAs(who, clientId, lines, over = {}) {
  const o = { supplier: '27', place: '27', rate: 18, rc: false, roundOff: false, key: nx('inv-key'), ...over }
  return asActor(who, async () => {
    const r = await db.query(ISSUE_SQL, [clientId, JSON.stringify(lines), o.supplier, o.place, o.rate, o.rc, o.roundOff, o.key])
    return parseJson(r.rows[0].r)
  })
}

/** Issue that must be accepted. Returns the body. */
async function issueOk(who, clientId, lines, over = {}) {
  const r = await issueAs(who, clientId, lines, over)
  expect(r && r.ok === true && typeof r.invoice_id === 'string', `issue not accepted: ${JSON.stringify(r)}`)
  return r
}

/** The standard invoice: one line 2 x 1000.00 at 18%, same state -> subtotal 200000, total 236000. */
async function standardInvoice(tag = 'std', who = ownerA, clientId = clientA) {
  const r = await issueOk(who, clientId, [invLine()], { key: nx(`inv-${tag}`) })
  return { id: r.invoice_id, number: r.invoice_number }
}

async function payAs(who, invoiceId, amount, expectedVersion, opts = {}) {
  const o = { method: 'upi', reference: 'UTR-001', receivedOn: isoDayOffset(-1), key: nx('pay-key'), ...opts }
  return asActor(who, async () => {
    const r = await db.query(PAY_SQL, [invoiceId, amount, o.method, o.reference, o.receivedOn, expectedVersion, o.key])
    return parseJson(r.rows[0].r)
  })
}

async function cancelInv(who, invoiceId, expectedVersion, reason) {
  return asActor(who, async () => {
    const r = await db.query(CANCEL_SQL, [invoiceId, expectedVersion, reason])
    return parseJson(r.rows[0].r)
  })
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

/**
 * Outcome of a command call: refused (raised, or returned ok:false) or accepted.
 * `code` is the raised message or the returned error code.
 */
async function outcome(promise) {
  try {
    const body = await promise
    if (body && body.ok === false) return { refused: true, code: String(body.error ?? ''), body }
    return { refused: false, code: '', body }
  } catch (error) {
    return { refused: true, code: firstLine(error), body: null }
  }
}

function expectRefused(o, codes, label = '') {
  const list = Array.isArray(codes) ? codes : [codes]
  expect(o.refused, `${label}accepted (${String(JSON.stringify(o.body)).slice(0, 160)}), expected refusal ${list.join(' | ')}`)
  expect(
    list.some((c) => o.code === c || o.code.includes(c)),
    `${label}refused with "${o.code.slice(0, 160)}", expected ${list.join(' | ')}`
  )
}

function expectAccepted(o, label = '') {
  expect(!o.refused, `${label}refused with "${o.code.slice(0, 160)}"`)
}

async function invRow(id) {
  return suOne(
    `SELECT status, version, paid_paise, total_paise, subtotal_paise, cgst_paise, sgst_paise, igst_paise,
            round_off_paise, gst_rate_pct, reverse_charge, supplier_state_code, place_of_supply_state_code, agency_id, client_id
       FROM public.agency_invoices WHERE id = $1`,
    [id]
  )
}

async function rowExists(id) {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoices WHERE id = $1`, [id])).n) === 1
}

async function versionOf(id) {
  return Number((await invRow(id)).version)
}

async function paymentsOf(invoiceId) {
  return (await su(`SELECT amount_paise, method, reference, received_on::text AS received_on, agency_id, idempotency_key FROM public.agency_invoice_payments WHERE invoice_id = $1 ORDER BY created_at, id`, [invoiceId])).rows
}

async function linesOfInvoice(invoiceId) {
  return (await su(`SELECT line_no, description, quantity::float8 AS quantity, rate_paise, amount_paise FROM public.agency_invoice_lines WHERE invoice_id = $1 ORDER BY line_no`, [invoiceId])).rows
}

async function invoiceCountOf(agencyId) {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoices WHERE agency_id = $1`, [agencyId])).n)
}

async function paymentCountOf(invoiceId) {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoice_payments WHERE invoice_id = $1`, [invoiceId])).n)
}

/** Parses 'INV/<YYYY-YY>/<000001>' into { fy, seq }, or null. */
function parseNumber(num) {
  const m = /^INV\/(\d{4})-(\d{2})\/(\d{6})$/.exec(String(num))
  return m ? { fy: `${m[1]}-${m[2]}`, seq: Number(m[3]) } : null
}

/** Indian financial year (Apr-Mar) of the current date, e.g. '2026-27'. */
function currentFy(now = new Date()) {
  const y = now.getFullYear()
  const start = now.getMonth() + 1 >= 4 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

function isoDayOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

async function expectTablesExist() {
  const r = await su(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])`, [INVOICE_TABLES])
  const have = new Set(r.rows.map((x) => x.table_name))
  const missing = INVOICE_TABLES.filter((t) => !have.has(t))
  expect(missing.length === 0, `missing tables: ${missing.join(', ')} (migration 20261021000000_agency_invoices.sql not applied)`)
}

async function columnsOf(table) {
  const r = await su(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])
  return new Set(r.rows.map((x) => x.column_name))
}

// Visibility counts. agency_invoice_lines has no agency_id, so it is counted through its invoice.
const COUNT_SQL = {
  invoices: `SELECT count(*)::int AS n FROM public.agency_invoices WHERE agency_id = $1`,
  lines: `SELECT count(*)::int AS n FROM public.agency_invoice_lines l JOIN public.agency_invoices i ON i.id = l.invoice_id WHERE i.agency_id = $1`,
  payments: `SELECT count(*)::int AS n FROM public.agency_invoice_payments WHERE agency_id = $1`,
}

async function countAs(who, key, agencyId) {
  return asActor(who, async () => Number((await db.query(COUNT_SQL[key], [agencyId])).rows[0].n))
}

async function countSu(key, agencyId) {
  return Number((await suOne(COUNT_SQL[key], [agencyId])).n)
}

async function expectSeesAll(who, agencyId, label) {
  const failures = []
  for (const key of ['invoices', 'lines', 'payments']) {
    const total = await countSu(key, agencyId)
    expect(total >= 1, `precondition: no ${key} rows seeded for the agency`)
    const n = await countAs(who, key, agencyId)
    if (n !== total) failures.push(`${key}: sees ${n} of ${total}`)
  }
  expect(failures.length === 0, `${label} ${failures.join('; ')}`)
}

async function expectSeesNone(who, agencyId, label) {
  const failures = []
  for (const key of ['invoices', 'lines', 'payments']) {
    const n = await countAs(who, key, agencyId)
    if (n !== 0) failures.push(`${key}=${n}`)
  }
  expect(failures.length === 0, `${label} can see rows: ${failures.join(', ')}`)
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
  await setupFixtures()

  // =========================================================================
  // 0. Schema (the migration and its tables)
  // =========================================================================
  await testCase('I01. migration supabase/migrations/20261021000000_agency_invoices.sql exists', async () => {
    expect(existsSync(INVOICE_MIGRATION), 'supabase/migrations/20261021000000_agency_invoices.sql does not exist yet (not written)')
  })

  await testCase('I02. the four invoice tables exist with row-level security enabled', async () => {
    const r = await su(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
      [INVOICE_TABLES]
    )
    const byName = new Map(r.rows.map((x) => [x.relname, x.relrowsecurity]))
    const missing = INVOICE_TABLES.filter((t) => !byName.has(t))
    const noRls = INVOICE_TABLES.filter((t) => byName.has(t) && byName.get(t) !== true)
    expect(missing.length === 0, `missing tables: ${missing.join(', ')}`)
    expect(noRls.length === 0, `RLS not enabled on: ${noRls.join(', ')}`)
  })

  await testCase('I03. agency_invoices carries every pinned column', async () => {
    const have = await columnsOf('agency_invoices')
    const missing = INVOICE_COLS.filter((c) => !have.has(c))
    expect(missing.length === 0, `agency_invoices missing columns: ${missing.join(', ')}`)
  })

  await testCase('I04. agency_invoice_lines, agency_invoice_payments and agency_invoice_sequences carry the pinned columns', async () => {
    const lines = await columnsOf('agency_invoice_lines')
    const pays = await columnsOf('agency_invoice_payments')
    const seqs = await columnsOf('agency_invoice_sequences')
    const missing = [
      ...LINE_COLS.filter((c) => !lines.has(c)).map((c) => `lines.${c}`),
      ...PAYMENT_COLS.filter((c) => !pays.has(c)).map((c) => `payments.${c}`),
      ...SEQUENCE_COLS.filter((c) => !seqs.has(c)).map((c) => `sequences.${c}`),
    ]
    expect(missing.length === 0, `missing: ${missing.join(', ')}`)
  })

  await testCase('I05. invoice number is unique per agency at the table level', async () => {
    await expectTablesExist()
    const number = nx('INV/UQ')
    await seedInvoiceRow(agencyA, clientA, { number })
    const err = await errorOf(seedInvoiceRow(agencyA, clientA, { number }))
    expect(err !== null, 'a second invoice with the same number in the same agency was accepted')
  })

  await testCase('I06. idempotency key is unique per agency at the table level', async () => {
    await expectTablesExist()
    const key = nx('uq-inv-key')
    await seedInvoiceRow(agencyA, clientA, { key })
    const err = await errorOf(seedInvoiceRow(agencyA, clientA, { key }))
    expect(err !== null, 'a second invoice with the same idempotency key in the same agency was accepted')
  })

  await testCase('I07. gst_rate_pct CHECK accepts 12 and rejects 7', async () => {
    await expectTablesExist()
    const ok = await errorOf(seedInvoiceRow(agencyA, clientA, { gst: 12 }))
    expect(ok === null, `12% refused: ${ok}`)
    const bad = await errorOf(seedInvoiceRow(agencyA, clientA, { gst: 7 }))
    expect(bad !== null, '7% accepted by the table')
  })

  await testCase('I08. payment amount_paise CHECK rejects zero at the table level', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    const err = await errorOf(su(PAY_INSERT, [uid(), inv, agencyA, 0, 'upi', nx('zero-pay')]))
    expect(err !== null, 'a zero-paise payment row was accepted')
  })

  await testCase('I09. payment method CHECK rejects a method outside upi, bank, cash, cheque', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    const err = await errorOf(su(PAY_INSERT, [uid(), inv, agencyA, 100, 'card', nx('card-pay')]))
    expect(err !== null, "a 'card' payment row was accepted")
  })

  await testCase('I10. payment idempotency key is unique per agency at the table level', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    const key = nx('uq-pay-key')
    await su(PAY_INSERT, [uid(), inv, agencyA, 100, 'upi', key])
    const err = await errorOf(su(PAY_INSERT, [uid(), inv, agencyA, 100, 'upi', key]))
    expect(err !== null, 'a second payment with the same idempotency key was accepted')
  })

  // =========================================================================
  // RLS and direct writes
  // =========================================================================
  await testCase('I11. the owner cannot UPDATE an invoice directly (no direct writes); the row is unchanged', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    const o = await dmlOutcome(ownerA, `UPDATE public.agency_invoices SET paid_paise = 236000, status = 'paid' WHERE id = $1 RETURNING id`, [inv])
    expect(o.error !== undefined || o.rows.length === 0, `owner UPDATE was allowed: ${JSON.stringify(o)}`)
    const row = await invRow(inv)
    expect(row.status === 'issued' && Number(row.paid_paise) === 0, `row changed by a direct UPDATE: ${JSON.stringify(row)}`)
  })

  await testCase('I12. the owner cannot INSERT an invoice directly', async () => {
    await expectTablesExist()
    const params = invInsertParams(agencyA, clientA)
    const o = await dmlOutcome(ownerA, INV_INSERT, params)
    expect(o.error !== undefined || o.rows.length === 0, `owner INSERT was allowed: ${JSON.stringify(o)}`)
    expect((await rowExists(params[0])) === false, 'a row was written by a direct INSERT')
  })

  await testCase('I13. owner reads every invoice, line and payment of its agency', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    await seedLine(inv, 1)
    await seedPaymentRow(inv, agencyA)
    await expectSeesAll(ownerA, agencyA, 'owner:')
  })

  await testCase('I14. finance staff of the agency reads every invoice, line and payment', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    await seedLine(inv, 1)
    await seedPaymentRow(inv, agencyA)
    await expectSeesAll(financeA, agencyA, 'finance:')
  })

  await testCase('I15. viewer (any active scope) reads the agency invoices, lines and payments', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    await seedLine(inv, 1)
    await seedPaymentRow(inv, agencyA)
    await expectSeesAll(viewerA, agencyA, 'viewer:')
  })

  await testCase('I16. another agency owner reads 0 invoices, lines or payments of this agency', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    await seedLine(inv, 1)
    await seedPaymentRow(inv, agencyA)
    await expectSeesNone(ownerB, agencyA, 'other-agency owner')
  })

  await testCase('I17. suspended-agency staff reads 0 rows, including its own agency invoices', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyS, clientS)
    await seedLine(inv, 1)
    await seedPaymentRow(inv, agencyS)
    await gather([
      ['own suspended agency', () => expectSeesNone(suspendedStaffS, agencyS, 'suspended staff of S:')],
      ['agency A', () => expectSeesNone(suspendedStaffS, agencyA, 'suspended staff of S, agency A:')],
    ])
  })

  await testCase('I18. revoked finance member reads 0 invoices of the agency', async () => {
    await expectTablesExist()
    const inv = await seedInvoiceRow(agencyA, clientA)
    await seedLine(inv, 1)
    await seedPaymentRow(inv, agencyA)
    await expectSeesNone(revokedFinanceA, agencyA, 'revoked finance member:')
  })

  await testCase('I19. a user with no agency reads 0 invoices, lines or payments', async () => {
    await expectTablesExist()
    await expectSeesNone(noAgency, agencyA, 'no-agency user:')
  })

  await testCase('I20. anon reads no invoice, line or payment rows (an error counts as no access)', async () => {
    await expectTablesExist()
    const failures = []
    for (const t of ['agency_invoices', 'agency_invoice_lines', 'agency_invoice_payments']) {
      try {
        const r = await asAnon(`SELECT count(*)::int AS n FROM public.${t}`)
        const n = Number(r.rows[0].n)
        if (n !== 0) failures.push(`${t}=${n}`)
      } catch {
        // denied: no access
      }
    }
    expect(failures.length === 0, `anon can see rows: ${failures.join(', ')}`)
  })

  // =========================================================================
  // Issue: numbering
  // =========================================================================
  await testCase('I21. owner issue is accepted: invoice_id, INV/<FY>/000001 number, status issued, version 1, nothing paid', async () => {
    const f = await freshAgency('i21')
    const r = await issueOk(f.owner, f.client, [invLine()])
    expect(UUID_RE.test(r.invoice_id), `invoice_id ${r.invoice_id}`)
    const p = parseNumber(r.invoice_number)
    expect(p && p.fy === currentFy() && p.seq === 1, `invoice_number ${r.invoice_number}, expected INV/${currentFy()}/000001`)
    const row = await invRow(r.invoice_id)
    expect(row.status === 'issued' && Number(row.version) === 1 && Number(row.paid_paise) === 0, `row ${JSON.stringify(row)}`)
  })

  await testCase('I22. invoice numbers run 000001, 000002, 000003 for one agency', async () => {
    const f = await freshAgency('i22')
    const nums = []
    for (let i = 0; i < 3; i++) nums.push((await issueOk(f.owner, f.client, [invLine()])).invoice_number)
    const seqs = nums.map((n) => (parseNumber(n) || {}).seq)
    expect(JSON.stringify(seqs) === '[1,2,3]', `numbers ${JSON.stringify(nums)}`)
  })

  await testCase('I23. another agency restarts its own sequence at 000001', async () => {
    const x = await freshAgency('i23x')
    const y = await freshAgency('i23y')
    await issueOk(x.owner, x.client, [invLine()])
    const second = await issueOk(x.owner, x.client, [invLine()])
    const first = await issueOk(y.owner, y.client, [invLine()])
    expect((parseNumber(second.invoice_number) || {}).seq === 2, `agency X second ${second.invoice_number}`)
    expect((parseNumber(first.invoice_number) || {}).seq === 1, `agency Y first ${first.invoice_number}, expected sequence 1`)
  })

  await testCase('I24. agency_invoice_sequences holds last_seq 3 for the agency after three issues', async () => {
    const f = await freshAgency('i24')
    for (let i = 0; i < 3; i++) await issueOk(f.owner, f.client, [invLine()])
    const r = await suOne(`SELECT coalesce(max(last_seq), 0)::int AS m FROM public.agency_invoice_sequences WHERE agency_id = $1`, [f.agency])
    expect(Number(r.m) === 3, `last_seq ${r.m}, expected 3`)
  })

  await testCase('I25. a refused issue consumes no number: the next success is 000001 (gap-free per success)', async () => {
    const f = await freshAgency('i25')
    const refused = await outcome(issueAs(f.owner, f.client, []))
    expectRefused(refused, 'no_lines', 'empty issue: ')
    const ok = await issueOk(f.owner, f.client, [invLine()])
    expect((parseNumber(ok.invoice_number) || {}).seq === 1, `next number ${ok.invoice_number}, expected sequence 1`)
  })

  await testCase('I26. same key and same payload replays: replay:true, same invoice_id, no second invoice', async () => {
    const f = await freshAgency('i26')
    const key = nx('replay-key')
    const first = await issueOk(f.owner, f.client, [invLine()], { key })
    const again = await issueAs(f.owner, f.client, [invLine()], { key })
    expect(again && again.ok === true && again.replay === true, `expected replay:true, got ${JSON.stringify(again)}`)
    expect(again.invoice_id === first.invoice_id, `invoice_id ${again.invoice_id}, expected ${first.invoice_id}`)
    expect((await invoiceCountOf(f.agency)) === 1, 'the replay created a second invoice')
  })

  await testCase('I27. a replay does not consume a number: the next new invoice is 000002', async () => {
    const f = await freshAgency('i27')
    const key = nx('replay-seq-key')
    await issueOk(f.owner, f.client, [invLine()], { key })
    await issueAs(f.owner, f.client, [invLine()], { key })
    const next = await issueOk(f.owner, f.client, [invLine()])
    expect((parseNumber(next.invoice_number) || {}).seq === 2, `next number ${next.invoice_number}, expected sequence 2`)
  })

  await testCase('I28. same key with a different payload is refused with idempotency_key_reused and writes nothing', async () => {
    const f = await freshAgency('i28')
    const key = nx('reuse-key')
    await issueOk(f.owner, f.client, [invLine()], { key })
    const o = await outcome(issueAs(f.owner, f.client, [invLine({ rate_paise: 200000 })], { key }))
    expectRefused(o, 'idempotency_key_reused')
    expect((await invoiceCountOf(f.agency)) === 1, 'the reused key wrote a second invoice')
  })

  // =========================================================================
  // Issue: refusals
  // =========================================================================
  await testCase('I29. another agency\'s client is refused with client_not_found; its own client is accepted', async () => {
    await gather([
      ['foreign client', async () => {
        const before = await invoiceCountOf(agencyB)
        const o = await outcome(issueAs(ownerB, clientA, [invLine()]))
        expectRefused(o, 'client_not_found')
        expect((await invoiceCountOf(agencyB)) === before, 'an invoice was written against a foreign client')
      }],
      ['own client', async () => {
        const r = await issueAs(ownerB, clientB, [invLine()])
        expect(r && r.ok === true, `own client refused: ${JSON.stringify(r)}`)
      }],
    ])
  })

  await testCase('I30. an empty line array is refused with no_lines', async () => {
    const f = await freshAgency('i30')
    expectRefused(await outcome(issueAs(f.owner, f.client, [])), 'no_lines')
    expect((await invoiceCountOf(f.agency)) === 0, 'an invoice was written with no lines')
  })

  await testCase('I31. quantity of zero is refused with invalid_line naming index 1 only', async () => {
    const f = await freshAgency('i31')
    const o = await outcome(issueAs(f.owner, f.client, [invLine(), invLine({ quantity: 0 })]))
    expectRefused(o, 'invalid_line')
    const idx = (o.body && Array.isArray(o.body.problems) ? o.body.problems : []).map((p) => Number(p.index)).sort()
    expect(JSON.stringify(idx) === '[1]', `problem indexes ${JSON.stringify(idx)}, expected [1]`)
  })

  await testCase('I32. negative rate (index 0) and empty description (index 2) are both reported as invalid_line', async () => {
    const f = await freshAgency('i32')
    const o = await outcome(issueAs(f.owner, f.client, [invLine({ rate_paise: -5 }), invLine(), invLine({ description: '' })]))
    expectRefused(o, 'invalid_line')
    const idx = (o.body && Array.isArray(o.body.problems) ? o.body.problems : []).map((p) => Number(p.index)).sort()
    expect(JSON.stringify(idx) === '[0,2]', `problem indexes ${JSON.stringify(idx)}, expected [0,2]`)
  })

  await testCase('I33. gst rates outside 0, 5, 12, 18 are refused with invalid_gst_rate', async () => {
    const f = await freshAgency('i33')
    await gather([7, 28].map((rate) => [`rate ${rate}`, async () => {
      expectRefused(await outcome(issueAs(f.owner, f.client, [invLine()], { rate })), 'invalid_gst_rate')
    }]))
  })

  await testCase('I34. state codes that are not 2 digits 01-38 are refused with invalid_state_code', async () => {
    const f = await freshAgency('i34')
    await gather([
      ['supplier "2"', async () => expectRefused(await outcome(issueAs(f.owner, f.client, [invLine()], { supplier: '2' })), 'invalid_state_code')],
      ['supplier "MH"', async () => expectRefused(await outcome(issueAs(f.owner, f.client, [invLine()], { supplier: 'MH' })), 'invalid_state_code')],
      ['place "00"', async () => expectRefused(await outcome(issueAs(f.owner, f.client, [invLine()], { place: '00' })), 'invalid_state_code')],
      ['place "39"', async () => expectRefused(await outcome(issueAs(f.owner, f.client, [invLine()], { place: '39' })), 'invalid_state_code')],
    ])
  })

  await testCase('I35. 101 lines are refused with too_many_lines', async () => {
    const f = await freshAgency('i35')
    expectRefused(await outcome(issueAs(f.owner, f.client, linesOf(101))), 'too_many_lines')
    expect((await invoiceCountOf(f.agency)) === 0, 'an oversized invoice was written')
  })

  await testCase('I36. exactly 100 lines are accepted and stored as 100 line rows', async () => {
    const f = await freshAgency('i36')
    const r = await issueOk(f.owner, f.client, linesOf(100))
    const n = Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoice_lines WHERE invoice_id = $1`, [r.invoice_id])).n)
    expect(n === 100, `stored ${n} lines, expected 100`)
  })

  // =========================================================================
  // Issue: tax and totals (recomputed on the server)
  // =========================================================================
  await testCase('I37. same state splits tax into CGST and SGST halves: 18000 + 18000, total 236000', async () => {
    const f = await freshAgency('i37')
    const r = await issueOk(f.owner, f.client, [invLine()])
    const row = await invRow(r.invoice_id)
    expect(Number(row.subtotal_paise) === 200000, `subtotal ${row.subtotal_paise}`)
    expect(Number(row.cgst_paise) === 18000 && Number(row.sgst_paise) === 18000, `cgst ${row.cgst_paise} sgst ${row.sgst_paise}`)
    expect(Number(row.igst_paise) === 0, `igst ${row.igst_paise}`)
    expect(Number(row.total_paise) === 236000 && Number(row.round_off_paise) === 0, `total ${row.total_paise} round_off ${row.round_off_paise}`)
  })

  await testCase('I38. different state charges IGST 36000 and no CGST or SGST; total 236000', async () => {
    const f = await freshAgency('i38')
    const r = await issueOk(f.owner, f.client, [invLine()], { place: '29' })
    const row = await invRow(r.invoice_id)
    expect(Number(row.igst_paise) === 36000, `igst ${row.igst_paise}`)
    expect(Number(row.cgst_paise) === 0 && Number(row.sgst_paise) === 0, `cgst ${row.cgst_paise} sgst ${row.sgst_paise}`)
    expect(Number(row.total_paise) === 236000, `total ${row.total_paise}`)
  })

  await testCase('I39. line amount rounds half-up: 1.5 x 333 = 500 paise; tax 90; CGST 45 SGST 45; total 590', async () => {
    const f = await freshAgency('i39')
    const r = await issueOk(f.owner, f.client, [invLine({ quantity: 1.5, rate_paise: 333 })])
    const lines = await linesOfInvoice(r.invoice_id)
    expect(lines.length === 1 && Number(lines[0].amount_paise) === 500, `line amount ${JSON.stringify(lines)}`)
    const row = await invRow(r.invoice_id)
    expect(Number(row.subtotal_paise) === 500, `subtotal ${row.subtotal_paise}`)
    expect(Number(row.cgst_paise) === 45 && Number(row.sgst_paise) === 45, `cgst ${row.cgst_paise} sgst ${row.sgst_paise}`)
    expect(Number(row.total_paise) === 590, `total ${row.total_paise}`)
  })

  await testCase('I40. intra-state CGST = SGST: 5% of 10010 -> CGST 250, SGST 250, total 10510', async () => {
    const f = await freshAgency('i40')
    const r = await issueOk(f.owner, f.client, [invLine({ quantity: 1, rate_paise: 10010 })], { rate: 5 })
    const row = await invRow(r.invoice_id)
    expect(Number(row.cgst_paise) === 250 && Number(row.sgst_paise) === 250, `cgst ${row.cgst_paise} sgst ${row.sgst_paise}`)
    expect(Number(row.total_paise) === 10510, `total ${row.total_paise}`)
  })

  await testCase('I41. reverse charge: every tax is 0 and the total equals the subtotal', async () => {
    const f = await freshAgency('i41')
    const r = await issueOk(f.owner, f.client, [invLine()], { rc: true })
    const row = await invRow(r.invoice_id)
    expect(Number(row.cgst_paise) === 0 && Number(row.sgst_paise) === 0 && Number(row.igst_paise) === 0, `tax ${JSON.stringify(row)}`)
    expect(row.reverse_charge === true, `reverse_charge ${row.reverse_charge}`)
    expect(Number(row.total_paise) === Number(row.subtotal_paise) && Number(row.total_paise) === 200000, `total ${row.total_paise}`)
  })

  await testCase('I42. round off up at exactly 50 paise: total 10050 becomes 10100, round_off_paise 50', async () => {
    const f = await freshAgency('i42')
    const r = await issueOk(f.owner, f.client, [invLine({ quantity: 1, rate_paise: 10050 })], { rate: 0, roundOff: true })
    const row = await invRow(r.invoice_id)
    expect(Number(row.total_paise) === 10100, `total ${row.total_paise}`)
    expect(Number(row.round_off_paise) === 50, `round_off ${row.round_off_paise}`)
  })

  await testCase('I43. round off down: 18% of 10001 = 1800 tax, total 11801 becomes 11800, round_off_paise -1', async () => {
    const f = await freshAgency('i43')
    const r = await issueOk(f.owner, f.client, [invLine({ quantity: 1, rate_paise: 10001 })], { roundOff: true })
    const row = await invRow(r.invoice_id)
    expect(Number(row.subtotal_paise) === 10001, `subtotal ${row.subtotal_paise}`)
    expect(Number(row.total_paise) === 11800, `total ${row.total_paise}`)
    expect(Number(row.round_off_paise) === -1, `round_off ${row.round_off_paise}`)
  })

  await testCase('I44. without the round-off flag the total keeps its paise: 11801 and round_off_paise 0', async () => {
    const f = await freshAgency('i44')
    const r = await issueOk(f.owner, f.client, [invLine({ quantity: 1, rate_paise: 10001 })], { roundOff: false })
    const row = await invRow(r.invoice_id)
    expect(Number(row.total_paise) === 11801 && Number(row.round_off_paise) === 0, `total ${row.total_paise} round_off ${row.round_off_paise}`)
  })

  await testCase('I45. a client-supplied amount_paise on a line is ignored; the server recomputes 200000', async () => {
    const f = await freshAgency('i45')
    const r = await issueOk(f.owner, f.client, [invLine({ amount_paise: 1 })])
    const lines = await linesOfInvoice(r.invoice_id)
    expect(lines.length === 1 && Number(lines[0].amount_paise) === 200000, `stored line ${JSON.stringify(lines)}`)
    expect(Number((await invRow(r.invoice_id)).total_paise) === 236000, 'total used the client amount')
  })

  await testCase('I46. lines are stored as line_no 1..3 and their amounts sum to the subtotal', async () => {
    const f = await freshAgency('i46')
    const r = await issueOk(f.owner, f.client, [
      invLine({ description: 'A' }),
      invLine({ description: 'B', quantity: 1, rate_paise: 50000 }),
      invLine({ description: 'C', quantity: 3, rate_paise: 1000 }),
    ])
    const lines = await linesOfInvoice(r.invoice_id)
    expect(JSON.stringify(lines.map((l) => Number(l.line_no))) === '[1,2,3]', `line numbers ${JSON.stringify(lines.map((l) => l.line_no))}`)
    const sum = lines.reduce((s, l) => s + Number(l.amount_paise), 0)
    const row = await invRow(r.invoice_id)
    expect(sum === 253000 && Number(row.subtotal_paise) === 253000, `sum ${sum}, subtotal ${row.subtotal_paise}`)
  })

  // =========================================================================
  // Payments
  // =========================================================================
  await testCase('I47. a partial payment: paid 100000, status partly_paid, version 2; the payment row keeps its fields', async () => {
    const inv = await standardInvoice('i47')
    const r = await payAs(ownerA, inv.id, 100000, 1, { method: 'upi', reference: 'UTR-47', receivedOn: isoDayOffset(-1) })
    expect(r && r.ok === true, `payment not accepted: ${JSON.stringify(r)}`)
    expect(Number(r.paid_paise) === 100000 && r.status === 'partly_paid' && Number(r.version) === 2, `body ${JSON.stringify(r)}`)
    const pays = await paymentsOf(inv.id)
    expect(pays.length === 1, `${pays.length} payment rows, expected 1`)
    expect(Number(pays[0].amount_paise) === 100000 && pays[0].method === 'upi' && pays[0].reference === 'UTR-47', `row ${JSON.stringify(pays[0])}`)
    expect(pays[0].received_on === isoDayOffset(-1), `received_on ${pays[0].received_on}`)
    expect(pays[0].agency_id === agencyA, `payment agency ${pays[0].agency_id}`)
  })

  await testCase('I48. the final payment brings paid_paise to the total: status paid, version 3', async () => {
    const inv = await standardInvoice('i48')
    expect((await payAs(ownerA, inv.id, 100000, 1)).ok === true, 'first payment refused')
    const r = await payAs(ownerA, inv.id, 136000, 2)
    expect(r && r.ok === true && r.status === 'paid' && Number(r.paid_paise) === 236000 && Number(r.version) === 3, `body ${JSON.stringify(r)}`)
    const row = await invRow(inv.id)
    expect(row.status === 'paid' && Number(row.paid_paise) === 236000, `row ${JSON.stringify(row)}`)
  })

  await testCase('I49. overpayment beyond the total is refused with overpayment and outstanding_paise 236000; nothing recorded', async () => {
    const inv = await standardInvoice('i49')
    const o = await outcome(payAs(ownerA, inv.id, 236001, 1))
    expectRefused(o, 'overpayment')
    expect(o.body && Number(o.body.outstanding_paise) === 236000, `outstanding_paise ${o.body && o.body.outstanding_paise}, expected 236000`)
    expect((await paymentCountOf(inv.id)) === 0, 'an overpayment was recorded')
  })

  await testCase('I50. a zero or negative amount is refused with invalid_amount', async () => {
    const inv = await standardInvoice('i50')
    await gather([
      ['amount 0', async () => expectRefused(await outcome(payAs(ownerA, inv.id, 0, 1)), 'invalid_amount')],
      ['amount -5', async () => expectRefused(await outcome(payAs(ownerA, inv.id, -5, 1)), 'invalid_amount')],
    ])
  })

  await testCase("I51. a method outside upi, bank, cash, cheque is refused with invalid_method", async () => {
    const inv = await standardInvoice('i51')
    expectRefused(await outcome(payAs(ownerA, inv.id, 1000, 1, { method: 'card' })), 'invalid_method')
    expect((await paymentCountOf(inv.id)) === 0, 'a payment with an invalid method was recorded')
  })

  await testCase('I52. a received_on date in the future is refused with future_date', async () => {
    const inv = await standardInvoice('i52')
    expectRefused(await outcome(payAs(ownerA, inv.id, 1000, 1, { receivedOn: isoDayOffset(10) })), 'future_date')
    expect((await paymentCountOf(inv.id)) === 0, 'a future-dated payment was recorded')
  })

  await testCase('I53. a stale expected version is refused with version_conflict and records nothing', async () => {
    const inv = await standardInvoice('i53')
    expectRefused(await outcome(payAs(ownerA, inv.id, 1000, 5)), 'version_conflict')
    expect((await paymentCountOf(inv.id)) === 0, 'a payment was recorded on a version conflict')
  })

  await testCase('I54. the same payment key replays: replay:true, paid unchanged, exactly one payment row', async () => {
    const inv = await standardInvoice('i54')
    const key = nx('pay-replay')
    const first = await payAs(ownerA, inv.id, 100000, 1, { key })
    expect(first && first.ok === true, `first payment refused: ${JSON.stringify(first)}`)
    const again = await payAs(ownerA, inv.id, 100000, 1, { key })
    expect(again && again.ok === true && again.replay === true, `expected replay:true, got ${JSON.stringify(again)}`)
    expect(Number((await invRow(inv.id)).paid_paise) === 100000, 'replay changed paid_paise')
    expect((await paymentCountOf(inv.id)) === 1, `${await paymentCountOf(inv.id)} payment rows after replay, expected 1`)
  })

  await testCase('I55. the sum of payment rows always equals paid_paise (100000 + 36000 + 50000 = 186000)', async () => {
    const inv = await standardInvoice('i55')
    await payAs(ownerA, inv.id, 100000, 1)
    await payAs(ownerA, inv.id, 36000, 2)
    const last = await payAs(ownerA, inv.id, 50000, 3)
    expect(last && last.ok === true && Number(last.paid_paise) === 186000 && last.status === 'partly_paid', `body ${JSON.stringify(last)}`)
    const sum = Number((await suOne(`SELECT coalesce(sum(amount_paise), 0)::bigint AS s FROM public.agency_invoice_payments WHERE invoice_id = $1`, [inv.id])).s)
    const row = await invRow(inv.id)
    expect(sum === 186000 && Number(row.paid_paise) === sum, `sum ${sum}, paid_paise ${row.paid_paise}`)
  })

  await testCase('I56. a negative amount cannot reduce paid_paise: refused, paid unchanged, no non-positive payment row', async () => {
    const inv = await standardInvoice('i56')
    expect((await payAs(ownerA, inv.id, 100000, 1)).ok === true, 'setup payment refused')
    expectRefused(await outcome(payAs(ownerA, inv.id, -100000, 2)), 'invalid_amount')
    expect(Number((await invRow(inv.id)).paid_paise) === 100000, 'paid_paise was reduced')
    const bad = Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoice_payments WHERE invoice_id = $1 AND amount_paise <= 0`, [inv.id])).n)
    expect(bad === 0, `${bad} non-positive payment rows`)
  })

  await testCase('I57. a payment on a cancelled invoice is refused with invoice_cancelled', async () => {
    const inv = await standardInvoice('i57')
    expect((await cancelInv(ownerA, inv.id, 1, 'Raised in error')).ok === true, 'setup cancel refused')
    expectRefused(await outcome(payAs(ownerA, inv.id, 1000, 2)), 'invoice_cancelled')
    expect((await paymentCountOf(inv.id)) === 0, 'a payment was recorded on a cancelled invoice')
  })

  await testCase('I58. another agency owner paying this invoice is refused with not_found', async () => {
    const inv = await standardInvoice('i58')
    expectRefused(await outcome(payAs(ownerB, inv.id, 1000, 1)), 'not_found')
    expect((await paymentCountOf(inv.id)) === 0, 'a foreign payment was recorded')
  })

  await testCase('I59. dispatcher is refused recording a payment with forbidden_scope', async () => {
    const inv = await standardInvoice('i59')
    expectRefused(await outcome(payAs(dispatcherA, inv.id, 1000, 1)), SCOPE_CODES)
    expect((await paymentCountOf(inv.id)) === 0, 'a dispatcher payment was recorded')
  })

  await testCase('I60. finance staff records a payment: accepted, paid 100000, partly_paid', async () => {
    const inv = await standardInvoice('i60')
    const r = await payAs(financeA, inv.id, 100000, 1)
    expect(r && r.ok === true && Number(r.paid_paise) === 100000 && r.status === 'partly_paid', `body ${JSON.stringify(r)}`)
  })

  // =========================================================================
  // Cancel
  // =========================================================================
  await testCase('I61. cancel with no payments: status cancelled, version 2, paid stays 0', async () => {
    const inv = await standardInvoice('i61')
    const r = await cancelInv(ownerA, inv.id, 1, 'Raised in error')
    expect(r && r.ok === true, `cancel not accepted: ${JSON.stringify(r)}`)
    const row = await invRow(inv.id)
    expect(row.status === 'cancelled' && Number(row.version) === 2 && Number(row.paid_paise) === 0, `row ${JSON.stringify(row)}`)
  })

  await testCase('I62. cancel after any payment is refused with has_payments and the status is unchanged', async () => {
    const inv = await standardInvoice('i62')
    expect((await payAs(ownerA, inv.id, 100000, 1)).ok === true, 'setup payment refused')
    expectRefused(await outcome(cancelInv(ownerA, inv.id, 2, 'Too late')), 'has_payments')
    expect((await invRow(inv.id)).status === 'partly_paid', 'status changed on a refused cancel')
  })

  await testCase('I63. a blank cancel reason is refused with reason_required', async () => {
    const inv = await standardInvoice('i63')
    expectRefused(await outcome(cancelInv(ownerA, inv.id, 1, '')), 'reason_required')
    expect((await invRow(inv.id)).status === 'issued', 'status changed on a refused cancel')
  })

  await testCase('I64. a 301-character reason is refused with reason_required; a 300-character reason is accepted', async () => {
    const long = await standardInvoice('i64a')
    const ok = await standardInvoice('i64b')
    await gather([
      ['301 characters', async () => expectRefused(await outcome(cancelInv(ownerA, long.id, 1, 'x'.repeat(301))), 'reason_required')],
      ['300 characters', async () => {
        const r = await cancelInv(ownerA, ok.id, 1, 'x'.repeat(300))
        expect(r && r.ok === true, `300 characters refused: ${JSON.stringify(r)}`)
      }],
    ])
  })

  await testCase('I65. cancelling an already cancelled invoice is refused with already_cancelled', async () => {
    const inv = await standardInvoice('i65')
    expect((await cancelInv(ownerA, inv.id, 1, 'First cancel')).ok === true, 'setup cancel refused')
    expectRefused(await outcome(cancelInv(ownerA, inv.id, 2, 'Second cancel')), 'already_cancelled')
  })

  await testCase('I66. cancel with a stale expected version is refused with version_conflict; status unchanged', async () => {
    const inv = await standardInvoice('i66')
    expectRefused(await outcome(cancelInv(ownerA, inv.id, 9, 'Stale')), 'version_conflict')
    expect((await invRow(inv.id)).status === 'issued', 'status changed on a version conflict')
  })

  await testCase('I67. another agency owner cancelling this invoice is refused with not_found', async () => {
    const inv = await standardInvoice('i67')
    expectRefused(await outcome(cancelInv(ownerB, inv.id, 1, 'Not mine')), 'not_found')
    expect((await invRow(inv.id)).status === 'issued', 'a foreign cancel changed the invoice')
  })

  await testCase('I68. dispatcher cancelling is refused with forbidden_scope', async () => {
    const inv = await standardInvoice('i68')
    expectRefused(await outcome(cancelInv(dispatcherA, inv.id, 1, 'Dispatcher try')), SCOPE_CODES)
    expect((await invRow(inv.id)).status === 'issued', 'a dispatcher cancel changed the invoice')
  })

  // =========================================================================
  // Scope and approval over agency_invoice_issue
  // =========================================================================
  await testCase('I69. dispatcher, fleet_manager and viewer are refused issue with forbidden_scope and write nothing', async () => {
    const before = await invoiceCountOf(agencyA)
    await gather(
      [
        ['dispatcher', dispatcherA],
        ['fleet_manager', fleetA],
        ['viewer', viewerA],
      ].map(([label, who]) => [label, async () => {
        expectRefused(await outcome(issueAs(who, clientA, [invLine()])), SCOPE_CODES)
      }])
    )
    expect((await invoiceCountOf(agencyA)) === before, 'an out-of-scope caller wrote an invoice')
  })

  await testCase('I70. finance staff issues an invoice: accepted with an INV number', async () => {
    const r = await issueOk(financeA, clientA, [invLine()])
    expect(parseNumber(r.invoice_number) !== null, `invoice_number ${r.invoice_number}`)
  })

  await testCase('I71. staff of a suspended agency is refused with the approval message and writes nothing', async () => {
    const before = await invoiceCountOf(agencyS)
    expectRefused(await outcome(issueAs(suspendedStaffS, clientS, [invLine()])), [...APPROVAL_CODES, ...SCOPE_CODES])
    expect((await invoiceCountOf(agencyS)) === before, 'an invoice was written for a suspended agency')
  })

  await testCase('I72. a user with no agency is refused with the no-profile message', async () => {
    expectRefused(await outcome(issueAs(noAgency, clientA, [invLine()])), NO_PROFILE_CODES)
  })

  await testCase('I73. a revoked finance member is refused and writes nothing', async () => {
    const before = await invoiceCountOf(agencyA)
    expectRefused(
      await outcome(issueAs(revokedFinanceA, clientA, [invLine()])),
      [...SCOPE_CODES, ...NO_PROFILE_CODES, ...APPROVAL_CODES]
    )
    expect((await invoiceCountOf(agencyA)) === before, 'a revoked member wrote an invoice')
  })

  await testCase('I74. the issue command is SECURITY DEFINER with no agency argument, scope finance', async () => {
    const info = await su(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, p.proconfig, pg_get_function_result(p.oid) AS res
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = 'agency_invoice_issue'`
    )
    expect(info.rows.length === 1, `expected 1 agency_invoice_issue definition, found ${info.rows.length}`)
    const { args, prosecdef, proconfig, res } = info.rows[0]
    const failures = []
    if (args !== 'p_client_id uuid, p_lines jsonb, p_supplier_state text, p_place_of_supply_state text, p_gst_rate_pct integer, p_reverse_charge boolean, p_round_off boolean, p_idempotency_key text, p_consignment_id uuid') failures.push(`arguments: ${args}`)
    if (/agency/i.test(args)) failures.push('an argument names an agency')
    if (res !== 'jsonb') failures.push(`return type ${res}`)
    if (prosecdef !== true) failures.push('not SECURITY DEFINER')
    if (!/search_path=public/.test((proconfig || []).join(','))) failures.push('search_path not pinned')
    expect(failures.length === 0, failures.join('; '))
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
