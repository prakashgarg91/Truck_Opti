#!/usr/bin/env node
/**
 * Subscription GST and invoices (TO-152 S6) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the
 * supabase/migrations chain and drives the commands the way PostgREST does per request:
 * `SET ROLE authenticated` with `request.jwt.claims` set to the caller's sub.
 *
 * RED FIRST. The migration that implements this contract is NOT written yet
 * (supabase/migrations/20261028000000_subscription_gst.sql, created by another writer).
 * Every case that needs the new objects is EXPECTED to fail now; G01 names the missing file.
 *
 * Money: integer paise only (BigInt in this harness). Same state: CGST = SGST = half-up(taxable x 18 / 200),
 * CGST always equal to SGST. Different state: IGST = half-up(taxable x 18 / 100). No rupee round-off.
 *
 * Pinned contract under test (rulings: docs/TO-152-rulings.md section 5, S6).
 *
 *   public.platform_billing_settings (single row): legal_name, gstin, address, state_code (2 digits 01-38),
 *     sac_code DEFAULT '997331', enforcement_enabled DEFAULT false.
 *   public.platform_billing_settings_update(p_legal_name, p_gstin, p_address, p_state_code, p_sac_code,
 *     p_enforcement_enabled) — SECURITY DEFINER, search_path pinned, is_admin_user() only.
 *     Refusals: non-admin 'forbidden' (or permission denied), invalid_gstin (15-char pattern, lowercase
 *     refused), invalid_state_code. Direct UPDATE on the table by authenticated changes nothing.
 *
 *   public.subscription_invoice_counters(series, fy, last_no), PRIMARY KEY (series, fy).
 *   public.subscription_next_invoice_number(p_series text, p_at timestamptz) RETURNS text — service_role
 *     only. 'TO/26-27/000001', 'CN/26-27/000001'. FY starts 1 April in Asia/Kolkata. Refuses invalid series.
 *
 *   public.subscription_tax_split(p_taxable_paise bigint, p_supplier_state text, p_pos_state text) —
 *     pure SQL (LANGUAGE sql, IMMUTABLE). Returns one row or one jsonb object with cgst, sgst, igst, total
 *     (keys cgst_paise|cgst etc. both accepted). Refuses taxable <= 0, overflow, invalid state codes.
 *   public.subscription_place_of_supply(p_gstin text, p_agency_state text) RETURNS text — first two GSTIN
 *     digits, else mapped state name, else error 'BILLING_STATE_REQUIRED' (raised or returned).
 *
 *   public.subscription_invoices(id, agency_id -> transport_agencies, invoice_number UNIQUE, series, fy,
 *     supplier_gstin, supplier_state_code, recipient_gstin, place_of_supply_state_code, sac_code,
 *     taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at). Append-only.
 *   public.subscription_credit_notes(id, invoice_id -> subscription_invoices, credit_note_number UNIQUE,
 *     refund_id UNIQUE, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at).
 *     Append-only; cumulative total never exceeds the invoice total.
 *
 *   Append-only: UPDATE and DELETE refused for every role (incl. service_role and the superuser),
 *   TRUNCATE revoked from anon, authenticated and service_role. Functions: search_path pinned, no PUBLIC
 *   or anon EXECUTE.
 *
 * Assumptions (not pinned by the rulings, flagged for the implementer):
 *   - Table/column names of the invoice and credit-note tables above are this battery's contract.
 *   - A refusal may be RAISED (message contains the code) or RETURNED as {ok:false,error:code}.
 *   - The first TO call in FY 26-27 of the battery is the first call against the counters table.
 *
 * Usage:  node scripts/subscription_gst.db.test.mjs   (from the repo root)
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
const GST_MIGRATION = join(MIGRATIONS_DIR, '20261028000000_subscription_gst.sql')

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

/** Runs the statement as an arbitrary database role (anon, service_role, ...), then returns to superuser. */
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

function expectAccepted(o, label = '') {
  expect(!o.refused, `${label}refused with "${o.code.slice(0, 160)}"`)
}

function expectBillingStateRequired(o, label = '') {
  expect(!o.missing, `${label}object missing (${o.code.slice(0, 120)})`)
  const text = o.refused ? o.code : String(valueOf(o))
  expect(text.includes('BILLING_STATE_REQUIRED'), `${label}expected BILLING_STATE_REQUIRED, got "${text.slice(0, 120)}"`)
}

// ---------------------------------------------------------------------------
// Money helpers (BigInt paise). Independent oracle for the SQL under test.
// ---------------------------------------------------------------------------
/** Half-up integer division for a non-negative numerator and an even denominator. */
const halfUp = (num, den) => (num + den / 2n) / den

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

const SPLIT_SQL = `SELECT to_jsonb(t) AS j FROM public.subscription_tax_split($1::bigint, $2::text, $3::text) AS t`

async function splitOut(taxable, sup, pos) {
  return suOut(SPLIT_SQL, [String(taxable), sup, pos])
}

/** Reads cgst/sgst/igst/total from an accepted split outcome (row or jsonb object). */
function splitParts(o) {
  const j = cellOf(o.rows[0])
  const pick = (...keys) => {
    for (const k of keys) {
      if (j && j[k] !== undefined && j[k] !== null) return BigInt(String(j[k]))
    }
    throw new Error(`no ${keys[0]} in ${JSON.stringify(j).slice(0, 120)}`)
  }
  return {
    cgst: pick('cgst_paise', 'cgst'),
    sgst: pick('sgst_paise', 'sgst'),
    igst: pick('igst_paise', 'igst'),
    total: pick('total_paise', 'total'),
  }
}

async function expectSplit(taxable, same) {
  const label = `T=${taxable} ${same ? 'same' : 'inter'}-state`
  const o = await splitOut(taxable, '27', same ? '27' : '07')
  expectAccepted(o, `${label} refused: `)
  const got = splitParts(o)
  const want = ruleSplit(taxable, same)
  const bad = ['cgst', 'sgst', 'igst', 'total']
    .filter((k) => got[k] !== want[k])
    .map((k) => `${k} got ${got[k]} want ${want[k]}`)
  expect(bad.length === 0, `${label}: ${bad.join(', ')}`)
}

async function sweepSplit(values, same) {
  const failures = []
  for (const t of values) {
    try {
      await expectSplit(t, same)
    } catch (error) {
      failures.push(firstLine(error))
    }
  }
  expect(failures.length === 0, `${failures.length}/${values.length} wrong: ${failures.slice(0, 3).join(' ; ')}`)
}

const BOUNDARY = [1n, 2n, 49n, 99n, 100n, 199n, 1000n, 49900n, 99999n, 100001n, 199900n, 499000n, 499900n, 1999000n, 4999000n, 999999999n, 123456789n]

const ODD_SAME = []
const ODD_INTER = []
for (let t = 1n; t <= 4000n; t++) {
  if ((18n * t) % 200n === 100n && ODD_SAME.length < 40) ODD_SAME.push(t)
  if ((18n * t) % 100n === 50n && ODD_INTER.length < 40) ODD_INTER.push(t)
}

const SAMPLE = Array.from({ length: 300 }, (_, i) => BigInt(i * 7919 + 1))

/** Hard-coded paise: [taxable, sameState, cgst, sgst, igst, total]. */
const HARD = [
  [1n, true, 0n, 0n, 0n, 1n],
  [1n, false, 0n, 0n, 0n, 1n],
  [49900n, true, 4491n, 4491n, 0n, 58882n],
  [49900n, false, 0n, 0n, 8982n, 58882n],
  [199900n, true, 17991n, 17991n, 0n, 235882n],
  [199900n, false, 0n, 0n, 35982n, 235882n],
  [499900n, true, 44991n, 44991n, 0n, 589882n],
  [499900n, false, 0n, 0n, 89982n, 589882n],
  [50n, true, 5n, 5n, 0n, 60n],
  [250n, true, 23n, 23n, 0n, 296n],
  [25n, false, 0n, 0n, 5n, 30n],
  [75n, false, 0n, 0n, 14n, 89n],
]

// ---------------------------------------------------------------------------
// SQL texts and fixtures
// ---------------------------------------------------------------------------
const GSTIN_OK = '27ABCDE1234F1Z5'
const SETTINGS_SQL = 'SELECT public.platform_billing_settings_update($1, $2, $3, $4, $5, $6) AS r'
const NEXT_SQL = 'SELECT public.subscription_next_invoice_number($1::text, $2::timestamptz) AS n'
const POS_SQL = 'SELECT public.subscription_place_of_supply($1::text, $2::text) AS p'

const FN_SETTINGS = 'platform_billing_settings_update'
const FN_NEXT = 'subscription_next_invoice_number'
const FN_SPLIT = 'subscription_tax_split'
const FN_POS = 'subscription_place_of_supply'
const GST_FNS = [FN_SETTINGS, FN_NEXT, FN_SPLIT, FN_POS]

function settingsArgs(over = {}) {
  const v = {
    legal: 'Truck Opti Software Pvt Ltd',
    gstin: GSTIN_OK,
    address: 'Plot 1, Pune, Maharashtra',
    state: '27',
    sac: '997331',
    enforce: false,
    ...over,
  }
  return [v.legal, v.gstin, v.address, v.state, v.sac, v.enforce]
}

async function settingsRow() {
  const r = await su(
    `SELECT legal_name, gstin, address, state_code, sac_code, enforcement_enabled FROM public.platform_billing_settings`
  )
  expect(r.rows.length >= 1, 'no platform_billing_settings row')
  return r.rows[0]
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

async function colsOf(table) {
  const r = await su(`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`, [table])
  return new Set(r.rows.map((x) => x.column_name))
}

function expectColumns(have, wanted, label) {
  const missing = wanted.filter((c) => !have.has(c))
  expect(missing.length === 0, `${label} missing columns: ${missing.join(', ')}`)
}

const SETTINGS_COLS = ['legal_name', 'gstin', 'address', 'state_code', 'sac_code', 'enforcement_enabled']
const INVOICE_COLS = [
  'id', 'agency_id', 'invoice_number', 'series', 'fy', 'supplier_gstin', 'supplier_state_code', 'recipient_gstin',
  'place_of_supply_state_code', 'sac_code', 'taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'total_paise', 'issued_at',
]
const NOTE_COLS = [
  'id', 'invoice_id', 'credit_note_number', 'refund_id', 'taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'total_paise', 'issued_at',
]

let adminUser, ownerUser, agencyG, invA, invB

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [id, email, JSON.stringify({})])
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

async function setupFixtures() {
  adminUser = await createUser('gst-admin')
  await su(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [adminUser])
  ownerUser = await createUser('gst-owner')
  const agencyOwner = await createUser('gst-agency-owner')
  agencyG = await createAgencyRow(agencyOwner, 'GST', 'approved')
}

/** Inserts a subscription invoice as superuser. Totals derive from the rule unless overridden. */
/** Issue instant used by fixtures: 15 July 2026 IST, inside FY 26-27 whatever the wall clock says. */
const FIXED_ISSUE_AT = '2026-07-15T06:00:00Z'

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

async function insertInvoice(opts = {}) {
  const same = opts.same ?? true
  const taxable = BigInt(opts.taxable ?? 49900n)
  const base = ruleSplit(taxable, same)
  const cgst = opts.cgst ?? base.cgst
  const sgst = opts.sgst ?? base.sgst
  const igst = opts.igst ?? base.igst
  const total = opts.total ?? taxable + cgst + sgst + igst
  const id = uid()
  const at = opts.at ?? FIXED_ISSUE_AT
  const fy = fyOfInstant(at)
  const number = opts.number ?? `TO/${fy}/${String(900000 + ++nonce).padStart(6, '0')}`
  const o = await suOut(
    `INSERT INTO public.subscription_invoices
       (id, agency_id, invoice_number, series, fy, supplier_gstin, supplier_state_code, recipient_gstin,
        place_of_supply_state_code, sac_code, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
     VALUES ($1, $2, $3, 'TO', $13, $4, $5, $6, $7, '997331', $8, $9, $10, $11, $12, $14::timestamptz)`,
    [
      id,
      opts.agency ?? agencyG,
      number,
      GSTIN_OK,
      opts.supplier ?? '27',
      opts.recipient ?? null,
      opts.pos ?? (same ? '27' : '07'),
      String(taxable),
      String(cgst),
      String(sgst),
      String(igst),
      String(total),
      fy,
      at,
    ]
  )
  return { ...o, id }
}

/** Inserts a credit note as superuser (the service path). Totals derive from the rule unless overridden. */
async function insertNote(invoiceId, opts = {}) {
  const taxable = BigInt(opts.taxable ?? 20000n)
  const base = ruleSplit(taxable, opts.same ?? true)
  const cgst = opts.cgst ?? base.cgst
  const sgst = opts.sgst ?? base.sgst
  const igst = opts.igst ?? base.igst
  const total = opts.total ?? taxable + cgst + sgst + igst
  const at = opts.at ?? FIXED_ISSUE_AT
  const number = opts.number ?? `CN/${fyOfInstant(at)}/${String(800000 + ++nonce).padStart(6, '0')}`
  return suOut(
    `INSERT INTO public.subscription_credit_notes
       (id, invoice_id, credit_note_number, refund_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
    [uid(), invoiceId, number, opts.refund ?? nx('rf'), String(taxable), String(cgst), String(sgst), String(igst), String(total), at]
  )
}

async function nextNo(series, at) {
  return suOut(NEXT_SQL, [series, at])
}

async function posOf(gstin, state) {
  return suOut(POS_SQL, [gstin, state])
}

/** TRUNCATE probed inside a transaction that is always rolled back. */
async function truncateAttempt(role, table) {
  await db.exec('RESET ROLE')
  await db.exec('BEGIN')
  try {
    await db.exec(`SET ROLE ${role}`)
    await db.exec(`TRUNCATE public.${table}`)
    return { refused: false, code: '' }
  } catch (error) {
    const code = firstLine(error)
    return { refused: true, code, missing: /does not exist/.test(code) }
  } finally {
    await db.exec('ROLLBACK')
    await actAsService()
  }
}

async function privilegeOf(role, table, priv) {
  const r = await su(`SELECT has_table_privilege($1, $2, $3) AS p`, [role, `public.${table}`, priv])
  return r.rows[0].p === true
}

// ---------------------------------------------------------------------------
// Main
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
  // 0. Schema
  // =========================================================================
  await testCase('G01. migration supabase/migrations/20261028000000_subscription_gst.sql exists', async () => {
    expect(existsSync(GST_MIGRATION), 'supabase/migrations/20261028000000_subscription_gst.sql does not exist yet (not written)')
  })

  await testCase('G02. platform_billing_settings carries the pinned columns', async () => {
    expectColumns(await colsOf('platform_billing_settings'), SETTINGS_COLS, 'platform_billing_settings')
  })

  await testCase('G03. platform_billing_settings is a single row: one seeded row, a second row refused', async () => {
    const n = await su(`SELECT count(*)::int AS n FROM public.platform_billing_settings`)
    expect(Number(n.rows[0].n) === 1, `expected exactly one settings row, found ${n.rows[0].n}`)
    const second = await suOut(
      `INSERT INTO public.platform_billing_settings (legal_name, gstin, address, state_code, sac_code, enforcement_enabled)
       VALUES ('Second', $1, 'Nowhere', '27', '997331', false)`,
      [GSTIN_OK]
    )
    expectRefused(second, [''], 'second settings row: ')
  })

  await testCase('G04. settings defaults: sac_code 997331 and enforcement_enabled false', async () => {
    const r = await su(
      `SELECT column_name, column_default FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'platform_billing_settings'
          AND column_name IN ('sac_code', 'enforcement_enabled')`
    )
    const byName = new Map(r.rows.map((x) => [x.column_name, String(x.column_default ?? '')]))
    expect(byName.get('sac_code') !== undefined && byName.get('sac_code').includes('997331'), `sac_code default is ${byName.get('sac_code')}`)
    expect(byName.get('enforcement_enabled') !== undefined && /false/i.test(byName.get('enforcement_enabled')), `enforcement_enabled default is ${byName.get('enforcement_enabled')}`)
  })

  await testCase('G05. subscription_invoice_counters has columns series, fy, last_no and PRIMARY KEY (series, fy)', async () => {
    expectColumns(await colsOf('subscription_invoice_counters'), ['series', 'fy', 'last_no'], 'subscription_invoice_counters')
    const pk = await su(
      `SELECT array_agg(a.attname::text ORDER BY a.attname::text) AS cols
         FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'public.subscription_invoice_counters'::regclass AND i.indisprimary`
    )
    const cols = [].concat(pk.rows[0].cols ?? []).sort().join(',')
    expect(cols === 'fy,series', `primary key is (${cols || 'none'}), expected (fy,series)`)
  })

  await testCase('G06. subscription_invoices carries the pinned snapshot columns', async () => {
    expectColumns(await colsOf('subscription_invoices'), INVOICE_COLS, 'subscription_invoices')
  })

  await testCase('G07. subscription_credit_notes carries the pinned columns', async () => {
    expectColumns(await colsOf('subscription_credit_notes'), NOTE_COLS, 'subscription_credit_notes')
  })

  await testCase('G08. the four GST functions exist in public', async () => {
    await gather(GST_FNS.map((name) => [name, () => fnInfo(name)]))
  })

  // =========================================================================
  // 1. Billing settings and the admin gate
  // =========================================================================
  await testCase('G09. an admin updates the single settings row through platform_billing_settings_update', async () => {
    const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs())
    expectAccepted(o, 'admin update refused: ')
    const row = await settingsRow()
    expect(
      row.legal_name === 'Truck Opti Software Pvt Ltd' && row.gstin === GSTIN_OK && row.state_code === '27',
      `row not updated: ${JSON.stringify(row)}`
    )
  })

  await testCase('G10. a non-admin owner is refused (forbidden) and the row is unchanged', async () => {
    const before = await settingsRow()
    const o = await asUser(ownerUser, SETTINGS_SQL, settingsArgs({ legal: 'Hostile Edit Ltd' }))
    expectRefusedMatch(o, /forbidden|permission denied|not_admin/i, 'non-admin: ')
    const after = await settingsRow()
    expect(after.legal_name === before.legal_name, `non-admin changed legal_name to ${after.legal_name}`)
  })

  await testCase('G11. anon is refused by platform_billing_settings_update', async () => {
    const o = await asRoleOut('anon', SETTINGS_SQL, settingsArgs())
    expectRefusedMatch(o, /permission denied/i, 'anon: ')
  })

  await testCase('G12. a 14-character GSTIN is refused with invalid_gstin', async () => {
    const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ gstin: 'AAABCDE1234F1Z' }))
    expectRefused(o, ['invalid_gstin'], 'short GSTIN: ')
  })

  await testCase('G13. a 15-character GSTIN with a wrong pattern is refused with invalid_gstin', async () => {
    const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ gstin: 'AAABCDE1234F1Z5' }))
    expectRefused(o, ['invalid_gstin'], 'letters in state digits: ')
  })

  await testCase('G14. a lowercase GSTIN is refused with invalid_gstin', async () => {
    const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ gstin: '27abcde1234f1z5' }))
    expectRefused(o, ['invalid_gstin'], 'lowercase GSTIN: ')
  })

  await testCase('G15. a 16-character GSTIN is refused with invalid_gstin', async () => {
    const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ gstin: '27ABCDE1234F1Z55' }))
    expectRefused(o, ['invalid_gstin'], 'long GSTIN: ')
  })

  await testCase('G16. state codes 00 and 39 are refused with invalid_state_code', async () => {
    const failures = []
    for (const state of ['00', '39']) {
      const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ state }))
      try {
        expectRefused(o, ['invalid_state_code'], `state ${state}: `)
      } catch (error) {
        failures.push(firstLine(error))
      }
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('G17. state codes MH, 7 and empty are refused with invalid_state_code', async () => {
    const failures = []
    for (const state of ['MH', '7', '']) {
      const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ state }))
      try {
        expectRefused(o, ['invalid_state_code'], `state "${state}": `)
      } catch (error) {
        failures.push(firstLine(error))
      }
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('G18. state codes 01, 07 and 38 are accepted and stored; the row is restored to 27', async () => {
    for (const state of ['01', '07', '38']) {
      // The GSTIN must start with the state code (migration rule: left(gstin, 2) = state_code).
      const gstin = state + GSTIN_OK.slice(2)
      const o = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ state, gstin }))
      expectAccepted(o, `state ${state}: `)
      const row = await settingsRow()
      expect(row.state_code === state, `stored state ${row.state_code}, expected ${state}`)
    }
    const restore = await asUser(adminUser, SETTINGS_SQL, settingsArgs())
    expectAccepted(restore, 'restore: ')
  })

  await testCase('G19. a direct UPDATE of the settings table by an admin changes nothing (edits go through the function)', async () => {
    const o = await asUser(adminUser, `UPDATE public.platform_billing_settings SET legal_name = 'Direct Edit'`)
    expect(!o.missing, `settings table missing (${o.code.slice(0, 80)})`)
    if (!o.refused) {
      const row = await settingsRow()
      expect(row.legal_name !== 'Direct Edit', 'direct UPDATE by an admin changed the settings row')
    }
  })

  await testCase('G20. all four GST functions pin search_path; the settings update is SECURITY DEFINER', async () => {
    await gather(
      GST_FNS.map((name) => [
        name,
        async () => {
          const i = await fnInfo(name)
          expect(/search_path=/.test(String(i.proconfig ?? '')), `search_path not pinned (${String(i.proconfig)})`)
          if (name === FN_SETTINGS) expect(i.prosecdef === true, 'not SECURITY DEFINER')
        },
      ])
    )
  })

  await testCase('G21. platform_billing_settings_update: no PUBLIC or anon EXECUTE; authenticated may execute', async () => {
    const i = await fnInfo(FN_SETTINGS)
    expect(i.pub_exec !== true, 'PUBLIC has EXECUTE')
    expect(i.anon_exec !== true, 'anon has EXECUTE')
    expect(i.auth_exec === true, 'authenticated has no EXECUTE')
  })

  await testCase('G22. subscription_next_invoice_number is service-only: no PUBLIC, anon or authenticated EXECUTE', async () => {
    const i = await fnInfo(FN_NEXT)
    const failures = []
    if (i.pub_exec === true) failures.push('PUBLIC has EXECUTE')
    if (i.anon_exec === true) failures.push('anon has EXECUTE')
    if (i.auth_exec === true) failures.push('authenticated has EXECUTE')
    if (i.svc_exec !== true) failures.push('service_role has no EXECUTE')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G23. subscription_tax_split is pure: LANGUAGE sql, IMMUTABLE, no PUBLIC or anon EXECUTE', async () => {
    const i = await fnInfo(FN_SPLIT)
    const failures = []
    if (i.lanname !== 'sql') failures.push(`language ${i.lanname}`)
    if (i.provolatile !== 'i') failures.push(`volatility ${i.provolatile}, expected immutable`)
    if (i.pub_exec === true) failures.push('PUBLIC has EXECUTE')
    if (i.anon_exec === true) failures.push('anon has EXECUTE')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G24. subscription_place_of_supply has no PUBLIC or anon EXECUTE', async () => {
    const i = await fnInfo(FN_POS)
    const failures = []
    if (i.pub_exec === true) failures.push('PUBLIC has EXECUTE')
    if (i.anon_exec === true) failures.push('anon has EXECUTE')
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // 2. Financial year sequence (the first TO call in FY 26-27 must come first)
  // =========================================================================
  await testCase('G25. first TO call at 2027-03-31T18:29:59Z (23:59:59 IST) is TO/26-27/000001', async () => {
    const o = await nextNo('TO', '2027-03-31T18:29:59Z')
    expectAccepted(o, 'call refused: ')
    expect(valueOf(o) === 'TO/26-27/000001', `got ${valueOf(o)}`)
  })

  await testCase('G26. CN at the same instant is CN/26-27/000001 (series numbers are independent)', async () => {
    const o = await nextNo('CN', '2027-03-31T18:29:59Z')
    expectAccepted(o, 'call refused: ')
    expect(valueOf(o) === 'CN/26-27/000001', `got ${valueOf(o)}`)
  })

  await testCase('G27. TO at 2027-03-31T18:30:00Z (00:00 IST 1 April) restarts at TO/27-28/000001', async () => {
    const o = await nextNo('TO', '2027-03-31T18:30:00Z')
    expectAccepted(o, 'call refused: ')
    expect(valueOf(o) === 'TO/27-28/000001', `got ${valueOf(o)}`)
  })

  await testCase('G28. TO back in FY 26-27 continues at TO/26-27/000002 (gap-free, no restart)', async () => {
    const o = await nextNo('TO', '2027-03-31T18:29:59Z')
    expectAccepted(o, 'call refused: ')
    expect(valueOf(o) === 'TO/26-27/000002', `got ${valueOf(o)}`)
  })

  await testCase('G29. counters hold TO 26-27 = 2, CN 26-27 = 1 and TO 27-28 = 1', async () => {
    const r = await su(`SELECT series, fy, last_no FROM public.subscription_invoice_counters ORDER BY series, fy`)
    const map = new Map(r.rows.map((x) => [`${x.series}|${x.fy}`, Number(x.last_no)]))
    expect(map.get('TO|26-27') === 2, `TO 26-27 last_no ${map.get('TO|26-27')}`)
    expect(map.get('CN|26-27') === 1, `CN 26-27 last_no ${map.get('CN|26-27')}`)
    expect(map.get('TO|27-28') === 1, `TO 27-28 last_no ${map.get('TO|27-28')}`)
  })

  await testCase('G30. ten sequential TO calls in FY 30-31 are gap-free: 000001 to 000010', async () => {
    const got = []
    for (let i = 0; i < 10; i++) got.push(valueOf(await nextNo('TO', '2030-06-15T00:00:00Z')))
    const want = Array.from({ length: 10 }, (_, i) => `TO/30-31/${String(i + 1).padStart(6, '0')}`)
    expect(JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`)
  })

  await testCase('G31. the first CN call in FY 30-31 is CN/30-31/000001 (no shared counter across series)', async () => {
    const o = await nextNo('CN', '2030-06-15T00:00:00Z')
    expectAccepted(o, 'call refused: ')
    expect(valueOf(o) === 'CN/30-31/000001', `got ${valueOf(o)}`)
  })

  await testCase('G32. 40 concurrent-looking TO calls in FY 31-32 return 40 distinct gap-free numbers', async () => {
    const outs = await Promise.all(Array.from({ length: 40 }, () => nextNo('TO', '2031-06-15T06:00:00Z')))
    const failed = outs.filter((o) => o.refused)
    expect(failed.length === 0, `${failed.length} calls refused: ${failed[0] ? failed[0].code : ''}`)
    const values = outs.map((o) => valueOf(o))
    const seqs = values.map((v) => Number(/^TO\/31-32\/(\d{6})$/.exec(String(v))?.[1] ?? NaN))
    const sorted = [...seqs].sort((a, b) => a - b)
    expect(sorted.every((n, i) => n === i + 1), `sequence not 1..40: ${sorted.slice(0, 12).join(',')}`)
  })

  await testCase('G33. series XX is refused', async () => {
    expectRefused(await nextNo('XX', '2030-06-15T00:00:00Z'), [''], 'XX: ')
  })

  await testCase('G34. an empty series is refused', async () => {
    expectRefused(await nextNo('', '2030-06-15T00:00:00Z'), [''], 'empty: ')
  })

  await testCase('G35. a NULL series is refused', async () => {
    expectRefused(await nextNo(null, '2030-06-15T00:00:00Z'), [''], 'null: ')
  })

  await testCase('G36. a lowercase series "to" is refused', async () => {
    expectRefused(await nextNo('to', '2030-06-15T00:00:00Z'), [''], 'lowercase: ')
  })

  await testCase('G37. an authenticated owner cannot call subscription_next_invoice_number (permission denied)', async () => {
    const o = await asUser(ownerUser, NEXT_SQL, ['TO', '2030-06-15T00:00:00Z'])
    expectRefusedMatch(o, /permission denied/i, 'owner: ')
  })

  await testCase('G38. anon cannot call subscription_next_invoice_number (permission denied)', async () => {
    const o = await asRoleOut('anon', NEXT_SQL, ['TO', '2030-06-15T00:00:00Z'])
    expectRefusedMatch(o, /permission denied/i, 'anon: ')
  })

  await testCase('G39. service_role gets the next number: TO/30-31/000011 after the ten above', async () => {
    const o = await asRoleOut('service_role', NEXT_SQL, ['TO', '2030-06-15T00:00:00Z'])
    expectAccepted(o, 'service_role refused: ')
    expect(valueOf(o) === 'TO/30-31/000011', `got ${valueOf(o)}`)
  })

  // =========================================================================
  // 3. Tax split (integer paise, half-up, CGST = SGST)
  // =========================================================================
  await testCase('G40. same-state split is CGST = SGST = half-up(taxable x 18 / 200) across boundary values', async () => {
    await sweepSplit(BOUNDARY, true)
  })

  await testCase('G41. inter-state split is IGST = half-up(taxable x 18 / 100) across boundary values', async () => {
    await sweepSplit(BOUNDARY, false)
  })

  await testCase('G42. hard-coded paise: 1, 49900, 199900, 499900 in both states, totals with no round-off', async () => {
    const failures = []
    for (const [taxable, same, cgst, sgst, igst, total] of HARD.slice(0, 8)) {
      const o = await splitOut(taxable, '27', same ? '27' : '07')
      try {
        expectAccepted(o, `T=${taxable}: `)
        const got = splitParts(o)
        const bad = []
        if (got.cgst !== cgst) bad.push(`cgst ${got.cgst}/${cgst}`)
        if (got.sgst !== sgst) bad.push(`sgst ${got.sgst}/${sgst}`)
        if (got.igst !== igst) bad.push(`igst ${got.igst}/${igst}`)
        if (got.total !== total) bad.push(`total ${got.total}/${total}`)
        expect(bad.length === 0, `T=${taxable} ${same ? 'same' : 'inter'} got/want ${bad.join(', ')}`)
      } catch (error) {
        failures.push(firstLine(error))
      }
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('G43. odd half-paise values, same state: 4.5 rounds up (e.g. T=50 gives CGST 5, not 4)', async () => {
    await sweepSplit(ODD_SAME, true)
  })

  await testCase('G44. odd half-paise values, inter state: IGST rounds half-up (e.g. T=25 gives IGST 5)', async () => {
    await sweepSplit(ODD_INTER, false)
  })

  await testCase('G45. half-up cases hard-coded: 50 and 250 same-state, 25 and 75 inter-state', async () => {
    const failures = []
    for (const [taxable, same, cgst, sgst, igst, total] of HARD.slice(8)) {
      const o = await splitOut(taxable, '27', same ? '27' : '07')
      try {
        expectAccepted(o, `T=${taxable}: `)
        const got = splitParts(o)
        expect(
          got.cgst === cgst && got.sgst === sgst && got.igst === igst && got.total === total,
          `T=${taxable} got cgst ${got.cgst} sgst ${got.sgst} igst ${got.igst} total ${got.total}; want ${cgst}/${sgst}/${igst}/${total}`
        )
      } catch (error) {
        failures.push(firstLine(error))
      }
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('G46. CGST equals SGST exactly and IGST is zero for same-state, over 300 sample values', async () => {
    const failures = []
    for (const t of SAMPLE) {
      const o = await splitOut(t, '27', '27')
      const got = o.refused ? null : splitParts(o)
      if (!got || got.cgst !== got.sgst || got.igst !== 0n) failures.push(`T=${t}`)
    }
    expect(failures.length === 0, `${failures.length} unequal: ${failures.slice(0, 5).join(', ')}`)
  })

  await testCase('G47. inter-state split never produces CGST or SGST, over 300 sample values', async () => {
    const failures = []
    for (const t of SAMPLE) {
      const o = await splitOut(t, '27', '07')
      const got = o.refused ? null : splitParts(o)
      if (!got || got.cgst !== 0n || got.sgst !== 0n) failures.push(`T=${t}`)
    }
    expect(failures.length === 0, `${failures.length} wrong: ${failures.slice(0, 5).join(', ')}`)
  })

  await testCase('G48. taxable 0 is refused', async () => {
    expectRefused(await splitOut('0', '27', '27'), [''], 'zero: ')
  })

  await testCase('G49. negative taxable (-1 and -49900) is refused', async () => {
    const failures = []
    for (const t of ['-1', '-49900']) {
      const o = await splitOut(t, '27', '27')
      if (o.missing || !o.refused) failures.push(`T=${t} accepted or missing`)
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  await testCase('G50. overflow guard: the largest bigint taxable is refused', async () => {
    expectRefused(await splitOut('9223372036854775807', '27', '27'), [''], 'max bigint: ')
  })

  await testCase('G51. overflow guard: 9e17 paise (18 x T exceeds bigint) is refused', async () => {
    expectRefused(await splitOut('900000000000000000', '27', '07'), [''], '9e17: ')
  })

  await testCase('G52. invalid supplier or place-of-supply state codes (00, 39, ZZ) are refused', async () => {
    const failures = []
    const cases = [
      ['00', '27'],
      ['27', '39'],
      ['ZZ', '27'],
    ]
    for (const [sup, pos] of cases) {
      const o = await splitOut(49900n, sup, pos)
      if (o.missing || !o.refused) failures.push(`${sup}/${pos} accepted or missing`)
    }
    expect(failures.length === 0, failures.join(' ; '))
  })

  // =========================================================================
  // 4. Place of supply
  // =========================================================================
  await testCase('G53. a GSTIN wins over a conflicting agency state: 07... with Maharashtra gives 07', async () => {
    const o = await posOf('07ABCDE1234F1Z5', 'Maharashtra')
    expectAccepted(o, 'refused: ')
    expect(valueOf(o) === '07', `got ${valueOf(o)}`)
  })

  await testCase('G54. the first two GSTIN digits are used when the agency state is null', async () => {
    const o = await posOf(GSTIN_OK, null)
    expectAccepted(o, 'refused: ')
    expect(valueOf(o) === '27', `got ${valueOf(o)}`)
  })

  await testCase('G55. no GSTIN and agency state Maharashtra gives 27', async () => {
    const o = await posOf(null, 'Maharashtra')
    expectAccepted(o, 'refused: ')
    expect(valueOf(o) === '27', `got ${valueOf(o)}`)
  })

  await testCase('G56. no GSTIN and agency state Delhi gives 07', async () => {
    const o = await posOf(null, 'Delhi')
    expectAccepted(o, 'refused: ')
    expect(valueOf(o) === '07', `got ${valueOf(o)}`)
  })

  await testCase('G57. an empty GSTIN and agency state Karnataka gives 29', async () => {
    const o = await posOf('', 'Karnataka')
    expectAccepted(o, 'refused: ')
    expect(valueOf(o) === '29', `got ${valueOf(o)}`)
  })

  await testCase('G58. neither GSTIN nor agency state is refused with BILLING_STATE_REQUIRED', async () => {
    expectBillingStateRequired(await posOf(null, null), 'null/null: ')
  })

  await testCase('G59. blank GSTIN and blank state are refused with BILLING_STATE_REQUIRED', async () => {
    expectBillingStateRequired(await posOf('', ''), 'blank: ')
  })

  await testCase('G60. an unknown state name (Atlantis) is refused with BILLING_STATE_REQUIRED', async () => {
    expectBillingStateRequired(await posOf(null, 'Atlantis'), 'unknown: ')
  })

  // =========================================================================
  // 5. Invoice snapshot and append-only tables
  // =========================================================================
  await testCase('G61. a same-state invoice snapshot is seeded (CGST = SGST, total = taxable + tax)', async () => {
    invA = await insertInvoice({ same: true, taxable: 49900n })
    expectAccepted(invA, 'seed refused: ')
    const r = await su(`SELECT cgst_paise, sgst_paise, igst_paise, total_paise FROM public.subscription_invoices WHERE id = $1`, [invA.id])
    expect(String(r.rows[0].cgst_paise) === '4491' && String(r.rows[0].sgst_paise) === '4491' && String(r.rows[0].total_paise) === '58882', `row ${JSON.stringify(r.rows[0])}`)
  })

  await testCase('G62. an invoice with CGST not equal to SGST is refused', async () => {
    const o = await insertInvoice({ same: true, taxable: 49900n, sgst: 4492n })
    expectRefused(o, [''], 'unequal CGST/SGST: ')
  })

  await testCase('G63. an invoice whose total is not taxable + tax is refused', async () => {
    const o = await insertInvoice({ same: true, taxable: 49900n, total: 58883n })
    expectRefused(o, [''], 'total mismatch: ')
  })

  await testCase('G64. an invoice mixing CGST and IGST is refused', async () => {
    const o = await insertInvoice({ same: true, taxable: 49900n, igst: 8982n, total: 49900n + 4491n * 2n + 8982n })
    expectRefused(o, [''], 'mixed CGST and IGST: ')
  })

  await testCase('G65. an inter-state invoice with IGST only is accepted (POS 07, supplier 27)', async () => {
    invB = await insertInvoice({ same: false, taxable: 49900n })
    expectAccepted(invB, 'inter-state invoice refused: ')
  })

  await testCase('G66. a duplicate invoice_number is refused', async () => {
    const number = (await su(`SELECT invoice_number FROM public.subscription_invoices WHERE id = $1`, [invA.id])).rows[0].invoice_number
    const o = await insertInvoice({ same: true, taxable: 49900n, number })
    expectRefused(o, [''], 'duplicate number: ')
  })

  await testCase('G67. UPDATE of an invoice is refused for service_role', async () => {
    const o = await asRoleOut('service_role', `UPDATE public.subscription_invoices SET issued_at = issued_at WHERE id = $1`, [invA.id])
    expectRefused(o, [''], 'service_role UPDATE: ')
  })

  await testCase('G68. DELETE of an invoice is refused for service_role', async () => {
    const o = await asRoleOut('service_role', `DELETE FROM public.subscription_invoices WHERE id = $1`, [invA.id])
    expectRefused(o, [''], 'service_role DELETE: ')
  })

  await testCase('G69. UPDATE and DELETE are refused for the superuser too, and the invoice still exists', async () => {
    const upd = await suOut(`UPDATE public.subscription_invoices SET issued_at = issued_at WHERE id = $1`, [invA.id])
    const del = await suOut(`DELETE FROM public.subscription_invoices WHERE id = $1`, [invA.id])
    const n = await su(`SELECT count(*)::int AS n FROM public.subscription_invoices WHERE id = $1`, [invA.id])
    expectRefused(upd, [''], 'superuser UPDATE: ')
    expectRefused(del, [''], 'superuser DELETE: ')
    expect(Number(n.rows[0].n) === 1, 'invoice row missing after refused DELETE')
  })

  await testCase('G70. TRUNCATE is revoked from anon, authenticated and service_role on both tables', async () => {
    const failures = []
    for (const table of ['subscription_invoices', 'subscription_credit_notes']) {
      for (const role of ['anon', 'authenticated', 'service_role']) {
        if (await privilegeOf(role, table, 'TRUNCATE')) failures.push(`${role} can TRUNCATE ${table}`)
      }
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G71. TRUNCATE by service_role is refused on both tables (rolled back, nothing removed)', async () => {
    const failures = []
    for (const table of ['subscription_invoices', 'subscription_credit_notes']) {
      const o = await truncateAttempt('service_role', table)
      if (o.missing) failures.push(`${table} missing (${o.code.slice(0, 80)})`)
      else if (!o.refused) failures.push(`TRUNCATE ${table} accepted`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G72. authenticated has no INSERT, UPDATE or DELETE on the invoice and credit-note tables', async () => {
    const failures = []
    for (const table of ['subscription_invoices', 'subscription_credit_notes']) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
        if (await privilegeOf('authenticated', table, priv)) failures.push(`${priv} on ${table}`)
      }
    }
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // 6. Credit notes
  // =========================================================================
  await testCase('G73. a credit note of 20000 paise taxable (total 23600) against invoice A is accepted', async () => {
    expect(invA && invA.id, 'no invoice seeded (G61 failed)')
    const o = await insertNote(invA.id, { taxable: 20000n, refund: 'rf-cn-1', number: 'CN/26-27/700001' })
    expectAccepted(o, 'credit note refused: ')
  })

  await testCase('G74. a second credit note with the same refund_id is refused', async () => {
    const o = await insertNote(invA.id, { taxable: 1000n, refund: 'rf-cn-1' })
    expectRefused(o, [''], 'duplicate refund_id: ')
  })

  await testCase('G75. a credit note whose total is not taxable + tax is refused', async () => {
    const o = await insertNote(invA.id, { taxable: 1000n, total: 1181n + 1n, refund: nx('rf') })
    expectRefused(o, [''], 'total mismatch: ')
  })

  await testCase('G76. a single credit note larger than the invoice (total 70000 vs 58882) is refused', async () => {
    const o = await insertNote(invA.id, { taxable: 59322n, refund: nx('rf') })
    expectRefused(o, [''], 'oversize note: ')
  })

  await testCase('G77. cumulative credit notes never exceed the invoice: second accepted, third refused', async () => {
    const second = await insertNote(invA.id, { taxable: 20000n, refund: nx('rf') })
    expectAccepted(second, 'second note refused: ')
    const third = await insertNote(invA.id, { taxable: 20000n, refund: nx('rf') })
    expectRefused(third, [''], 'third note (70800 > 58882): ')
    const sum = await su(`SELECT COALESCE(sum(total_paise), 0)::bigint AS s FROM public.subscription_credit_notes WHERE invoice_id = $1`, [invA.id])
    expect(BigInt(String(sum.rows[0].s)) <= 58882n, `credit notes total ${sum.rows[0].s} exceeds invoice 58882`)
  })

  await testCase('G78. a duplicate credit_note_number is refused', async () => {
    const o = await insertNote(invA.id, { taxable: 1n, number: 'CN/26-27/700001', refund: nx('rf') })
    expectRefused(o, [''], 'duplicate credit number: ')
  })

  await testCase('G79. a credit note pointing at an unknown invoice is refused', async () => {
    const o = await insertNote(uid(), { taxable: 1000n, refund: nx('rf') })
    expectRefused(o, [''], 'unknown invoice: ')
  })

  await testCase('G80. a credit note with CGST not equal to SGST is refused', async () => {
    const o = await insertNote(invA.id, { taxable: 1000n, cgst: 90n, sgst: 91n, total: 1181n, refund: nx('rf') })
    expectRefused(o, [''], 'unequal CGST/SGST: ')
  })

  await testCase('G81. UPDATE of a credit note is refused for service_role', async () => {
    const o = await asRoleOut('service_role', `UPDATE public.subscription_credit_notes SET issued_at = issued_at WHERE invoice_id = $1`, [invA.id])
    expectRefused(o, [''], 'service_role UPDATE: ')
  })

  await testCase('G82. DELETE of a credit note is refused for service_role and for the superuser', async () => {
    const asSvc = await asRoleOut('service_role', `DELETE FROM public.subscription_credit_notes WHERE invoice_id = $1`, [invA.id])
    const asSu = await suOut(`DELETE FROM public.subscription_credit_notes WHERE invoice_id = $1`, [invA.id])
    expectRefused(asSvc, [''], 'service_role DELETE: ')
    expectRefused(asSu, [''], 'superuser DELETE: ')
  })

  // =========================================================================
  // 7. Opus review (money): FY vs issued_at, number guard, tax, isolation
  // =========================================================================
  const rawInvoice = (over = {}) => {
    const o = { id: uid(), fy: '26-27', at: '2026-11-17T00:00:00Z', taxable: 10000n, same: true, ...over }
    const r = ruleSplit(o.taxable, o.same)
    return {
      id: o.id,
      run: () => suOut(
        `INSERT INTO public.subscription_invoices
           (id, agency_id, invoice_number, series, fy, supplier_gstin, supplier_state_code, place_of_supply_state_code,
            sac_code, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
         VALUES ($1, $2, $3, 'TO', $4, $5, '27', $6, '997331', $7, $8, $9, $10, $11, $12::timestamptz)`,
        [o.id, agencyG, o.number ?? `TO/${o.fy}/${String(700000 + ++nonce).padStart(6, '0')}`, o.fy, GSTIN_OK,
         o.same ? '27' : '07', String(o.taxable), String(r.cgst), String(r.sgst), String(r.igst), String(r.total), o.at]
      ),
    }
  }
  const rawNote = (invoiceId, over = {}) => {
    const o = { taxable: 1000n, at: '2026-11-18T00:00:00Z', fy: '26-27', same: true, ...over }
    const r = ruleSplit(o.taxable, o.same)
    const cgst = o.cgst ?? r.cgst
    const sgst = o.sgst ?? r.sgst
    const igst = o.igst ?? r.igst
    return suOut(
      `INSERT INTO public.subscription_credit_notes
         (id, invoice_id, credit_note_number, refund_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::timestamptz)`,
      [uid(), invoiceId, `CN/${o.fy}/${String(600000 + ++nonce).padStart(6, '0')}`, nx('rf'), String(o.taxable),
       String(cgst), String(sgst), String(igst), String(o.taxable + cgst + sgst + igst), o.at]
    )
  }

  await testCase('G83. an invoice fy must match issued_at in Asia/Kolkata: FY boundary at 1 April 00:00 IST', async () => {
    await gather([
      ['mismatch fy 25-26 at Nov 2026', async () => expectRefused(await rawInvoice({ fy: '25-26' }).run(), ['fy_issued_chk'], '')],
      ['31 Mar 23:59:59 IST is FY 25-26', async () => expectAccepted(await rawInvoice({ fy: '25-26', at: '2026-03-31T18:29:59Z' }).run(), '')],
      ['31 Mar 23:59:59 IST is not FY 26-27', async () => expectRefused(await rawInvoice({ fy: '26-27', at: '2026-03-31T18:29:59Z' }).run(), ['fy_issued_chk'], '')],
      ['1 Apr 00:00 IST is FY 26-27', async () => expectAccepted(await rawInvoice({ fy: '26-27', at: '2026-03-31T18:30:00Z' }).run(), '')],
      ['1 Apr 00:00 IST is not FY 25-26', async () => expectRefused(await rawInvoice({ fy: '25-26', at: '2026-03-31T18:30:00Z' }).run(), ['fy_issued_chk'], '')],
    ])
  })

  await testCase('G84. a credit-note number FY must match issued_at in Asia/Kolkata', async () => {
    const inv = rawInvoice({ fy: '25-26', at: '2026-01-10T00:00:00Z' })
    expectAccepted(await inv.run(), 'seed: ')
    await gather([
      ['CN/26-27 issued Feb 2026', async () => expectRefused(await rawNote(inv.id, { fy: '26-27', at: '2026-02-01T00:00:00Z' }), ['fy_issued_chk'], '')],
      ['CN/25-26 issued Feb 2026', async () => expectAccepted(await rawNote(inv.id, { fy: '25-26', at: '2026-02-01T00:00:00Z' }), '')],
      ['CN/25-26 issued 1 Apr IST', async () => expectRefused(await rawNote(inv.id, { fy: '25-26', at: '2026-03-31T18:30:00Z' }), ['fy_issued_chk'], '')],
    ])
  })

  await testCase('G85. a credit note issued before its invoice is refused', async () => {
    const inv = rawInvoice({ at: '2026-11-10T00:00:00Z' })
    expectAccepted(await inv.run(), 'seed: ')
    expectRefused(await rawNote(inv.id, { at: '2026-11-09T00:00:00Z' }), ['CREDIT_NOTE_BEFORE_INVOICE'], 'earlier: ')
    expectAccepted(await rawNote(inv.id, { at: '2026-11-10T00:00:00Z' }), 'same instant: ')
  })

  const svcInsertInvoice = (number) =>
    asRoleOut(
      'service_role',
      `INSERT INTO public.subscription_invoices
         (agency_id, invoice_number, series, fy, supplier_gstin, supplier_state_code, place_of_supply_state_code,
          sac_code, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
       VALUES ($1, $2, 'TO', substr($2, 4, 5), $3, '27', '27', '997331', 1000, 90, 90, 0, 1180, now())`,
      [agencyG, number, GSTIN_OK]
    )

  await testCase('G86. service_role cannot insert an invoice with a number that was not minted', async () => {
    const forged = await svcInsertInvoice('TO/26-27/555555')
    expectRefused(forged, ['invoice_number_not_minted'], 'forged: ')
  })

  await testCase('G87. service_role inserts an invoice with the number minted in the same statement; an older number is refused', async () => {
    const o = await asRoleOut(
      'service_role',
      `INSERT INTO public.subscription_invoices
         (agency_id, invoice_number, series, fy, supplier_gstin, supplier_state_code, place_of_supply_state_code,
          sac_code, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
       SELECT $1, n, 'TO', substr(n, 4, 5), $2, '27', '27', '997331', 1000, 90, 90, 0, 1180, now()
         FROM (SELECT public.subscription_next_invoice_number('TO', now()) AS n) m
       RETURNING invoice_number`,
      [agencyG, GSTIN_OK]
    )
    expectAccepted(o, 'minted insert: ')
    const minted = String(valueOf(o))
    expectAccepted(await asRoleOut('service_role', NEXT_SQL, ['TO', new Date().toISOString()]), 'second mint: ')
    expectRefused(await svcInsertInvoice(minted), [''], 'reused number: ')
    expectRefused(await svcInsertInvoice(minted.replace(/\d{6}$/, (d) => String(Number(d) + 5).padStart(6, '0'))), ['invoice_number_not_minted'], 'skipped number: ')
  })

  await testCase('G88. service_role credit-note numbers must also be the number just minted', async () => {
    const inv = rawInvoice({ at: '2026-11-17T00:00:00Z' })
    expectAccepted(await inv.run(), 'seed: ')
    const sql = (numExpr) => `INSERT INTO public.subscription_credit_notes
         (invoice_id, agency_id, credit_note_number, refund_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
       SELECT $1::uuid, $2::uuid, ${numExpr}, $3::text, 1000, 90, 90, 0, 1180, now()`
    expectRefused(await asRoleOut('service_role', sql(`'CN/26-27/444444'`), [inv.id, agencyG, nx('rf')]), ['invoice_number_not_minted'], 'forged CN: ')
    expectAccepted(await asRoleOut('service_role', sql(`public.subscription_next_invoice_number('CN', now())`), [inv.id, agencyG, nx('rf')]), 'minted CN: ')
  })

  await testCase('G89. settings UPDATE carries WHERE TRUE, and GSTIN/state mismatch is refused (function and table)', async () => {
    const def = (await su(`SELECT pg_get_functiondef('public.platform_billing_settings_update(text,text,text,text,text,boolean)'::regprocedure) AS d`)).rows[0].d
    expect(/WHERE\s+(TRUE|true)/.test(def), 'no WHERE TRUE in platform_billing_settings_update')
    const before = await settingsRow()
    const viaFn = await asUser(adminUser, SETTINGS_SQL, settingsArgs({ gstin: GSTIN_OK, state: '07' }))
    expectRefused(viaFn, ['gstin_state_mismatch'], 'function: ')
    const viaTable = await suOut(`UPDATE public.platform_billing_settings SET state_code = '07'`)
    expectRefused(viaTable, ['gstin_state_chk'], 'table: ')
    const after = await settingsRow()
    expect(after.state_code === before.state_code && after.gstin === before.gstin, 'settings changed by a refused update')
  })

  const noteInvoice = async (taxable = 49900n, same = true) => {
    const inv = rawInvoice({ taxable, same, at: '2026-11-17T00:00:00Z' })
    expectAccepted(await inv.run(), 'seed: ')
    return inv.id
  }

  await testCase('G90. credit-note tax must be within 1 paise of half-up 18% of its own taxable amount', async () => {
    const id = await noteInvoice()
    await gather([
      ['zero tax on 1000', async () => expectRefused(await rawNote(id, { taxable: 1000n, cgst: 0n, sgst: 0n }), ['CREDIT_NOTE_TAX_MISMATCH'], '')],
      ['expected 90, 92 refused', async () => expectRefused(await rawNote(id, { taxable: 1000n, cgst: 92n, sgst: 92n }), ['CREDIT_NOTE_TAX_MISMATCH'], '')],
      ['expected 90, 91 accepted', async () => expectAccepted(await rawNote(id, { taxable: 1000n, cgst: 91n, sgst: 91n }), '')],
      ['expected 90, 89 accepted', async () => expectAccepted(await rawNote(id, { taxable: 1000n, cgst: 89n, sgst: 89n }), '')],
      ['IGST on a same-state invoice refused', async () => expectRefused(await rawNote(id, { taxable: 1000n, cgst: 0n, sgst: 0n, igst: 180n }), [''], '')],
    ])
    const inter = await noteInvoice(49900n, false)
    await gather([
      ['inter: IGST 180 on 1000 accepted', async () => expectAccepted(await rawNote(inter, { taxable: 1000n, same: false }), '')],
      ['inter: IGST 183 refused', async () => expectRefused(await rawNote(inter, { taxable: 1000n, same: false, igst: 183n }), ['CREDIT_NOTE_TAX_MISMATCH'], '')],
    ])
  })

  await testCase('G91. the closing note that exhausts the invoice is exempt from the 1-paise rule', async () => {
    const id = await noteInvoice(49900n, true)
    expectAccepted(await rawNote(id, { taxable: 24950n, cgst: 2247n, sgst: 2247n }), 'first (off by 1): ')
    expectRefused(await rawNote(id, { taxable: 1000n, cgst: 0n, sgst: 0n }), ['CREDIT_NOTE_TAX_MISMATCH'], 'non-closing off by 90: ')
    expectAccepted(await rawNote(id, { taxable: 24950n, cgst: 2244n, sgst: 2244n }), 'closing (off by 2): ')
  })

  await testCase('G92. a credit note under REPEATABLE READ is refused; READ COMMITTED is accepted', async () => {
    const id = await noteInvoice()
    await actAsService()
    await db.exec('BEGIN ISOLATION LEVEL REPEATABLE READ')
    let o
    try {
      o = await attempt(async () => (await db.query(
        `INSERT INTO public.subscription_credit_notes
           (invoice_id, credit_note_number, refund_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
         VALUES ($1, 'CN/26-27/' || lpad((500000 + $3::int)::text, 6, '0'), $2, 1000, 90, 90, 0, 1180, '2026-11-18T00:00:00Z')`,
        [id, nx('rf'), ++nonce]
      )).rows)
    } finally {
      await db.exec('ROLLBACK')
    }
    expectRefused(o, ['CREDIT_NOTE_ISOLATION'], 'repeatable read: ')
    expectAccepted(await rawNote(id, { taxable: 1000n }), 'read committed: ')
  })

  await testCase('G93. migration documents UTGST labelling and does not overstate append-only', async () => {
    const text = readFileSync(GST_MIGRATION, 'utf8')
    expect(/UTGST/.test(text) && /Chandigarh/.test(text) && /Lakshadweep/.test(text), 'no UTGST label note')
    expect(!/append-only for EVERY role/.test(text), 'comment still claims every role')
    expect(/can still disable triggers/.test(text), 'no trigger-disable caveat')
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
