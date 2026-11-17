#!/usr/bin/env node
/**
 * Subscription invoice read path + usage/guard agreement (TO-152, contract audit findings 3, 7, 8).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). Replays supabase/migrations and drives the
 * commands as PostgREST does: `SET ROLE authenticated` with request.jwt.claims set to the caller's sub.
 *
 * Contract under test (migration 20261033000000_subscription_invoice_read.sql):
 *   public.agency_subscription_invoices() RETURNS jsonb, SECURITY DEFINER, STABLE, search_path pinned,
 *     EXECUTE for authenticated only. Readable by the agency owner and active finance / viewer members.
 *     {ok:true, invoices:[{id, invoice_number, issued_at, taxable_paise, cgst_paise, sgst_paise, igst_paise,
 *        total_paise, place_of_supply_state_code, sac_code, recipient_name, recipient_gstin,
 *        credit_notes:[{id, credit_note_number, issued_at, total_paise}]}]}  newest first, at most 200.
 *     Refusals {ok:false,error}: sign_in_required, forbidden_scope, agency_not_approved, no_agency, multiple_agencies.
 *   public.subscription_entitlement_snapshot usage counts exactly what agency_subscription_assert counts
 *     (orders_month incl. cancelled; staff = active memberships + pending unexpired invitations).
 *
 * Usage:  node scripts/subscription_invoice_read.db.test.mjs   (from the repo root)
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
const READ_MIGRATION = join(MIGRATIONS_DIR, '20261033000000_subscription_invoice_read.sql')

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
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
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
function expect(cond, message) {
  if (!cond) throw new Error(message)
}
function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].split(' [SQL:')[0].trim()
}
async function testCase(name, fn) {
  try {
    await fn()
    record(name, true)
  } catch (error) {
    record(name, false, error && error.message ? error.message.split('\n')[0].slice(0, 240) : String(error))
  }
}

async function applyMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    } catch (error) {
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
  return files
}

let seq = 0
const uid = () => `00000000-0000-4000-a000-${String(++seq).padStart(12, '0')}`
let nonce = 0
const nx = (prefix) => `${prefix}-${++nonce}`

async function actAsService() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
}
async function actAs(sub) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [sub ? JSON.stringify({ sub, role: 'authenticated' }) : '{}'])
  await db.exec('SET ROLE authenticated')
}
async function asActor(userId, fn) {
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await actAsService()
  }
}
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
async function su(sql, params = []) {
  await actAsService()
  return db.query(sql, params)
}
async function suOne(sql, params = []) {
  return (await su(sql, params)).rows[0]
}
const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v)

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const GSTIN_OK = '27ABCDE1234F1Z5'
const FIXED_ISSUE_AT = '2026-07-15T06:00:00Z'
const halfUp = (num, den) => (num + den / 2n) / den

function fyOfInstant(iso) {
  const ist = new Date(new Date(iso).getTime() + 330 * 60 * 1000)
  const y = ist.getUTCFullYear()
  const start = ist.getUTCMonth() + 1 >= 4 ? y : y - 1
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`
}

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)`, [id, email])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}
async function createAgencyRow(userId, tag, status = 'approved') {
  const id = uid()
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6)`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, `07ABCDE${1000 + seq}A1Z5`, `ABCDE${String(1000 + (seq % 9000)).padStart(4, '0')}Q`]
  )
  return id
}
async function insertSub({ agencyId, userId, plan = 'Starter', status = 'active' }) {
  await su(
    `INSERT INTO public.subscriptions (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
     VALUES ($1, $2, $3, (SELECT id FROM public.subscription_plans WHERE name = $4), $5, 'monthly', now(), now() + interval '30 days')`,
    [uid(), userId, agencyId, plan, status]
  )
}
async function mkAgency(tag, { status = 'approved', plan = 'Starter' } = {}) {
  const owner = await createUser(tag)
  const agency = await createAgencyRow(owner, tag, status)
  if (plan) await insertSub({ agencyId: agency, userId: owner, plan })
  return { owner, agency }
}
async function seedStaff(agencyId, tag, scope, status = 'active') {
  const userId = await createUser(tag)
  await su(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [uid(), agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
}
async function addInvites(agencyId, ownerId, n, { status = 'pending', expires = `now() + interval '7 days'` } = {}) {
  for (let i = 0; i < n; i += 1) {
    const k = nx('ir-inv')
    await su(
      `INSERT INTO public.agency_invitations
         (agency_id, invited_email, scope, token_hash, status, expires_at, idempotency_key, created_by)
       VALUES ($1, $2, 'viewer', $3, $4, ${expires}, $5, $6)`,
      [agencyId, `${k}@example.com`, createHash('sha256').update(`th-${k}`).digest('hex'), status, `idem-${k}`, ownerId]
    )
  }
}
async function addTrucks(agencyId, n) {
  await su(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number)
     SELECT gen_random_uuid(), $1, 'eicher_14ft', 'IR-RC-' || $2 || '-' || g FROM generate_series(1, $3) g`,
    [agencyId, nx('t'), n]
  )
}
async function addDrivers(agencyId, n) {
  for (let i = 0; i < n; i += 1) {
    const driverId = uid()
    const digits = String(100000000 + ++seq).slice(-9)
    await su(`INSERT INTO public.drivers (id, full_name, phone, vehicle_type, pan_number) VALUES ($1, $2, $3, 'eicher_14ft', $4)`, [
      driverId, `IR Driver ${seq}`, `9${digits}`, `DRVWX${String(1000 + (seq % 9000)).padStart(4, '0')}F`,
    ])
    await su(`INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, 'active')`, [uid(), agencyId, driverId])
  }
}
async function addOrders(agencyId, n, { status = 'draft', ts = 'now()' } = {}) {
  if (n <= 0) return
  const agr = await suOne(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES (gen_random_uuid(), $1, 'IR Client', 'active', $2) RETURNING id`,
    [agencyId, nx('ir-agr')]
  )
  await su(
    `INSERT INTO public.agency_orders (id, agency_id, agreement_id, client_order_ref, status, version, created_at)
     SELECT gen_random_uuid(), $1, $2, 'IR-' || $3 || '-' || g, $5, 1, ${ts} FROM generate_series(1, $4) g`,
    [agencyId, agr.id, nx('o'), n, status]
  )
}

async function insertInvoice(agencyId, opts = {}) {
  const taxable = BigInt(opts.taxable ?? 49900n)
  const c = halfUp(18n * taxable, 200n)
  const total = taxable + 2n * c
  const at = opts.at ?? FIXED_ISSUE_AT
  const fy = fyOfInstant(at)
  const id = uid()
  const number = opts.number ?? `TO/${fy}/${String(700000 + ++nonce).padStart(6, '0')}`
  await su(
    `INSERT INTO public.subscription_invoices
       (id, agency_id, invoice_number, series, fy, supplier_gstin, supplier_state_code, recipient_gstin, recipient_name,
        place_of_supply_state_code, sac_code, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
     VALUES ($1, $2, $3, 'TO', $4, $5, '27', $6, $7, '27', '997331', $8, $9, $9, 0, $10, $11::timestamptz)`,
    [id, agencyId, number, fy, GSTIN_OK, opts.recipientGstin ?? null, opts.recipientName ?? null, String(taxable), String(c), String(total), at]
  )
  return { id, number, taxable, cgst: c, total }
}
async function insertNote(invoiceId, opts = {}) {
  const taxable = BigInt(opts.taxable ?? 20000n)
  const c = halfUp(18n * taxable, 200n)
  const total = taxable + 2n * c
  const at = opts.at ?? FIXED_ISSUE_AT
  const number = `CN/${fyOfInstant(at)}/${String(600000 + ++nonce).padStart(6, '0')}`
  const id = uid()
  await su(
    `INSERT INTO public.subscription_credit_notes
       (id, invoice_id, credit_note_number, refund_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, 0, $7, $8::timestamptz)`,
    [id, invoiceId, number, nx('rf'), String(taxable), String(c), String(total), at]
  )
  return { id, number, total }
}

// ---------------------------------------------------------------------------
// Call helpers
// ---------------------------------------------------------------------------
const READ_SQL = 'SELECT public.agency_subscription_invoices() AS r'
async function readAs(userId) {
  return asActor(userId, async () => {
    try {
      const res = await db.query(READ_SQL)
      return { raised: false, value: parseJson(res.rows[0].r) }
    } catch (error) {
      return { raised: true, message: firstLine(error) }
    }
  })
}
function expectOk(o, label = '') {
  expect(!o.raised, `${label}raised: ${o.message}`)
  expect(o.value && o.value.ok === true, `${label}not ok: ${JSON.stringify(o.value).slice(0, 160)}`)
  return o.value
}
function expectError(o, code, label = '') {
  expect(!o.raised, `${label}raised: ${o.message}`)
  expect(o.value && o.value.ok === false && o.value.error === code, `${label}expected ${code}, got ${JSON.stringify(o.value).slice(0, 160)}`)
}

async function guardUsed(agencyId, action) {
  await actAsService()
  try {
    await db.query('SELECT public.agency_subscription_assert($1::uuid, $2::text, $3::int)', [agencyId, action, 1000000])
  } catch (error) {
    const detail = typeof error.detail === 'string' ? JSON.parse(error.detail) : null
    if (detail && detail.code === 'SB001') return Number(detail.used)
    throw new Error(`guard did not report usage: ${firstLine(error)}`)
  }
  throw new Error('guard accepted an impossible quantity')
}
async function snapshotUsage(agencyId, key) {
  const r = await suOne('SELECT public.subscription_entitlement_snapshot($1::uuid) AS s', [agencyId])
  return Number(parseJson(r.s).usage[key])
}

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]})`)
  await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = true`)

  const A = await mkAgency('ir-a')
  const B = await mkAgency('ir-b')
  const financeA = await seedStaff(A.agency, 'ir-fin', 'finance')
  const viewerA = await seedStaff(A.agency, 'ir-view', 'viewer')
  const dispatcherA = await seedStaff(A.agency, 'ir-disp', 'dispatcher')
  const fleetA = await seedStaff(A.agency, 'ir-fleet', 'fleet_manager')
  const revokedA = await seedStaff(A.agency, 'ir-rev', 'finance', 'revoked')
  const stranger = await createUser('ir-stranger')
  const pending = await mkAgency('ir-pend', { status: 'pending', plan: null })
  const pendingFin = await seedStaff(pending.agency, 'ir-pfin', 'finance')

  const empty = await mkAgency('ir-empty')
  const inv1 = await insertInvoice(A.agency, { taxable: 49900n, at: '2026-06-10T06:00:00Z', recipientGstin: '27AAAPL1234C1ZV', recipientName: 'Alpha Freight' })
  const inv2 = await insertInvoice(A.agency, { taxable: 199900n, at: '2026-07-15T06:00:00Z' })
  const note1 = await insertNote(inv2.id, { taxable: 20000n })
  await insertInvoice(B.agency, { taxable: 10000n })

  await testCase('R01. migration 20261033000000_subscription_invoice_read.sql exists', async () => {
    expect(existsSync(READ_MIGRATION), 'migration file missing')
  })

  await testCase('R02. agency_subscription_invoices is SECURITY DEFINER, STABLE, search_path pinned', async () => {
    const r = await suOne(`SELECT prosecdef, provolatile, proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public' WHERE proname = 'agency_subscription_invoices'`)
    expect(r, 'function missing')
    expect(r.prosecdef === true, 'not SECURITY DEFINER')
    expect(r.provolatile === 's', 'not STABLE')
    expect((r.proconfig || []).some((c) => /^search_path=/.test(c)), 'search_path not pinned')
  })

  await testCase('R03. EXECUTE: authenticated yes, anon no, PUBLIC no', async () => {
    const r = await suOne(`SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS a, has_function_privilege('anon', p.oid, 'EXECUTE') AS n,
        EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x WHERE x.grantee = 0 AND x.privilege_type = 'EXECUTE') AS pub
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public' WHERE proname = 'agency_subscription_invoices'`)
    expect(r.a === true && r.n === false && r.pub === false, JSON.stringify(r))
  })

  await testCase('R04. anon role cannot call it', async () => {
    let refused = false
    try {
      await asRole('anon', READ_SQL)
    } catch {
      refused = true
    }
    expect(refused, 'anon call succeeded')
  })

  await testCase('R05. no JWT subject -> sign_in_required', async () => {
    await actAs(null)
    let v
    try {
      v = parseJson((await db.query(READ_SQL)).rows[0].r)
    } finally {
      await actAsService()
    }
    expect(v && v.ok === false && v.error === 'sign_in_required', JSON.stringify(v))
  })

  await testCase('R06. owner with no invoices gets ok and an empty list', async () => {
    const v = expectOk(await readAs(empty.owner))
    expect(Array.isArray(v.invoices) && v.invoices.length === 0, JSON.stringify(v))
  })

  await testCase('R07. owner sees exactly their two invoices', async () => {
    const v = expectOk(await readAs(A.owner))
    expect(v.invoices.length === 2, `got ${v.invoices.length}`)
  })

  await testCase('R08. newest invoice first', async () => {
    const v = expectOk(await readAs(A.owner))
    expect(v.invoices[0].invoice_number === inv2.number && v.invoices[1].invoice_number === inv1.number, v.invoices.map((i) => i.invoice_number).join(','))
  })

  await testCase('R09. another agency owner never sees these invoices', async () => {
    const v = expectOk(await readAs(B.owner))
    expect(v.invoices.length === 1 && !v.invoices.some((i) => [inv1.number, inv2.number].includes(i.invoice_number)), JSON.stringify(v.invoices.map((i) => i.invoice_number)))
  })

  await testCase('R10. finance member sees the agency invoices', async () => {
    const v = expectOk(await readAs(financeA))
    expect(v.invoices.length === 2, `got ${v.invoices.length}`)
  })

  await testCase('R11. viewer member sees the agency invoices', async () => {
    const v = expectOk(await readAs(viewerA))
    expect(v.invoices.length === 2, `got ${v.invoices.length}`)
  })

  await testCase('R12. dispatcher is refused with forbidden_scope', async () => {
    expectError(await readAs(dispatcherA), 'forbidden_scope')
  })

  await testCase('R13. fleet_manager is refused with forbidden_scope', async () => {
    expectError(await readAs(fleetA), 'forbidden_scope')
  })

  await testCase('R14. revoked finance member is refused', async () => {
    const o = await readAs(revokedA)
    expect(!o.raised && o.value.ok === false && ['forbidden_scope', 'no_agency'].includes(o.value.error), JSON.stringify(o.value ?? o.message))
  })

  await testCase('R15. a user with no agency gets no_agency', async () => {
    expectError(await readAs(stranger), 'no_agency')
  })

  await testCase('R16. finance member of a not-approved agency gets agency_not_approved', async () => {
    expectError(await readAs(pendingFin), 'agency_not_approved')
  })

  await testCase('R17. owner with two agencies gets multiple_agencies', async () => {
    const owner = await createUser('ir-two')
    await createAgencyRow(owner, 'ir-two-1')
    await createAgencyRow(owner, 'ir-two-2')
    expectError(await readAs(owner), 'multiple_agencies')
  })

  await testCase('R18. invoice carries the money fields as integers in paise', async () => {
    const v = expectOk(await readAs(A.owner))
    const i = v.invoices.find((x) => x.invoice_number === inv2.number)
    expect(i && i.taxable_paise === Number(inv2.taxable) && i.cgst_paise === Number(inv2.cgst) && i.sgst_paise === Number(inv2.cgst) && i.igst_paise === 0 && i.total_paise === Number(inv2.total), JSON.stringify(i))
  })

  await testCase('R19. invoice carries id, issued_at, place of supply and SAC', async () => {
    const v = expectOk(await readAs(A.owner))
    const i = v.invoices.find((x) => x.invoice_number === inv2.number)
    expect(i.id === inv2.id && typeof i.issued_at === 'string' && i.place_of_supply_state_code === '27' && i.sac_code === '997331', JSON.stringify(i))
  })

  await testCase('R20. recipient name and GSTIN are returned as on the invoice', async () => {
    const v = expectOk(await readAs(A.owner))
    const i = v.invoices.find((x) => x.invoice_number === inv1.number)
    expect(i.recipient_gstin === '27AAAPL1234C1ZV' && i.recipient_name === 'Alpha Freight', JSON.stringify(i))
  })

  await testCase('R21. only the pinned keys are exposed (printed invoice fields only: no agency_id or refund internals)', async () => {
    const v = expectOk(await readAs(A.owner))
    const allowed = new Set(['id', 'invoice_number', 'issued_at', 'taxable_paise', 'cgst_paise', 'sgst_paise', 'igst_paise', 'total_paise', 'place_of_supply_state_code', 'sac_code', 'recipient_name', 'recipient_gstin', 'recipient_address', 'supplier_legal_name', 'supplier_address', 'supplier_gstin', 'credit_notes'])
    const extra = Object.keys(v.invoices[0]).filter((k) => !allowed.has(k))
    expect(extra.length === 0, `extra keys: ${extra.join(',')}`)
    const noteKeys = Object.keys(v.invoices.find((x) => x.credit_notes.length).credit_notes[0])
    expect(noteKeys.every((k) => ['id', 'credit_note_number', 'issued_at', 'total_paise'].includes(k)), noteKeys.join(','))
  })

  await testCase('R22. credit note is nested under its invoice', async () => {
    const v = expectOk(await readAs(A.owner))
    const i = v.invoices.find((x) => x.invoice_number === inv2.number)
    expect(i.credit_notes.length === 1 && i.credit_notes[0].credit_note_number === note1.number && i.credit_notes[0].total_paise === Number(note1.total), JSON.stringify(i.credit_notes))
  })

  await testCase('R23. invoice without credit notes has an empty array, not null', async () => {
    const v = expectOk(await readAs(A.owner))
    const i = v.invoices.find((x) => x.invoice_number === inv1.number)
    expect(Array.isArray(i.credit_notes) && i.credit_notes.length === 0, JSON.stringify(i.credit_notes))
  })

  await testCase('R24. a second credit note on the same invoice is listed too, oldest first', async () => {
    const owner = await createUser('ir-cn')
    const ag = await createAgencyRow(owner, 'ir-cn')
    const inv = await insertInvoice(ag, { taxable: 100000n })
    await insertNote(inv.id, { taxable: 10000n, at: '2026-07-16T06:00:00Z' })
    await insertNote(inv.id, { taxable: 5000n, at: '2026-07-20T06:00:00Z' })
    const v = expectOk(await readAs(owner))
    const n = v.invoices[0].credit_notes
    expect(n.length === 2 && new Date(n[0].issued_at) <= new Date(n[1].issued_at), JSON.stringify(n))
  })

  await testCase('R25. at most 200 invoices are returned, newest first', async () => {
    const owner = await createUser('ir-many')
    const ag = await createAgencyRow(owner, 'ir-many')
    await su(
      `INSERT INTO public.subscription_invoices
         (id, agency_id, invoice_number, series, fy, supplier_gstin, supplier_state_code, place_of_supply_state_code, sac_code,
          taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
       SELECT gen_random_uuid(), $1, 'TO/26-27/' || lpad((500000 + g)::text, 6, '0'), 'TO', '26-27', $2, '27', '27', '997331',
              10000, 900, 900, 0, 11800, '2026-07-01T06:00:00Z'::timestamptz + (g || ' minutes')::interval
         FROM generate_series(1, 205) g`,
      [ag, GSTIN_OK]
    )
    const v = expectOk(await readAs(owner))
    expect(v.invoices.length === 200, `got ${v.invoices.length}`)
    expect(v.invoices[0].invoice_number === 'TO/26-27/500205', v.invoices[0].invoice_number)
  })

  await testCase('R26. the RPC is the read path: a viewer reading the table directly sees nothing', async () => {
    const rows = await asActor(viewerA, async () => (await db.query('SELECT id FROM public.subscription_invoices')).rows)
    expect(rows.length === 0, `viewer table read returned ${rows.length}`)
  })

  await testCase('R27. invoices stay append-only for the owner role', async () => {
    let refused = false
    try {
      await asActor(A.owner, () => db.query(`UPDATE public.subscription_invoices SET sac_code = '000000' WHERE agency_id = $1`, [A.agency]))
    } catch {
      refused = true
    }
    expect(refused, 'update by owner succeeded')
  })

  // ---- usage agrees with the guard -----------------------------------------------------------
  await testCase('U01. orders_month: cancelled orders count in the snapshot exactly as in the guard', async () => {
    const t = await mkAgency('ir-u1')
    await addOrders(t.agency, 3, { status: 'draft' })
    await addOrders(t.agency, 2, { status: 'cancelled' })
    const used = await guardUsed(t.agency, 'order_import')
    const snap = await snapshotUsage(t.agency, 'orders_month')
    expect(used === 5, `guard used ${used}`)
    expect(snap === used, `snapshot ${snap} vs guard ${used}`)
  })

  await testCase('U02. orders_month: previous-month orders excluded by both', async () => {
    const t = await mkAgency('ir-u2')
    await addOrders(t.agency, 2, { ts: `now() - interval '40 days'` })
    await addOrders(t.agency, 1)
    const used = await guardUsed(t.agency, 'order_import')
    expect(used === 1 && (await snapshotUsage(t.agency, 'orders_month')) === used, `guard ${used}`)
  })

  await testCase('U03. orders_month: only cancelled orders still count 2 = 2', async () => {
    const t = await mkAgency('ir-u3')
    await addOrders(t.agency, 2, { status: 'cancelled' })
    const snap = await snapshotUsage(t.agency, 'orders_month')
    expect(snap === (await guardUsed(t.agency, 'order_import')), 'disagree')
    expect(snap === 2, `snapshot ${snap}, not 2`)
  })

  await testCase('U04. staff: pending unexpired invitations count in the snapshot like the guard', async () => {
    const t = await mkAgency('ir-u4')
    await seedStaff(t.agency, 'ir-u4-s1', 'viewer')
    await seedStaff(t.agency, 'ir-u4-s2', 'finance')
    await addInvites(t.agency, t.owner, 2)
    const used = await guardUsed(t.agency, 'staff_add')
    const snap = await snapshotUsage(t.agency, 'staff')
    expect(used === 4, `guard used ${used}`)
    expect(snap === used, `snapshot ${snap} vs guard ${used}`)
  })

  await testCase('U05. staff: an expired pending invitation counts in neither', async () => {
    const t = await mkAgency('ir-u5')
    await seedStaff(t.agency, 'ir-u5-s1', 'viewer')
    await addInvites(t.agency, t.owner, 1, { expires: `now() - interval '1 day'` })
    const used = await guardUsed(t.agency, 'staff_add')
    expect(used === 1 && (await snapshotUsage(t.agency, 'staff')) === used, `guard ${used}`)
  })

  await testCase('U06. staff: revoked memberships and revoked invitations count in neither', async () => {
    const t = await mkAgency('ir-u6')
    await seedStaff(t.agency, 'ir-u6-s1', 'viewer', 'revoked')
    await addInvites(t.agency, t.owner, 1, { status: 'revoked' })
    const used = await guardUsed(t.agency, 'staff_add')
    expect(used === 0 && (await snapshotUsage(t.agency, 'staff')) === used, `guard ${used}`)
  })

  await testCase('U07. trucks and drivers agree (regression)', async () => {
    const t = await mkAgency('ir-u7')
    await addTrucks(t.agency, 2)
    await addDrivers(t.agency, 2)
    expect((await snapshotUsage(t.agency, 'trucks')) === (await guardUsed(t.agency, 'truck_add')), 'trucks disagree')
    expect((await snapshotUsage(t.agency, 'drivers')) === (await guardUsed(t.agency, 'driver_add')), 'drivers disagree')
  })

  await testCase('U08. the entitlement RPC shows the same staff usage to the owner', async () => {
    const t = await mkAgency('ir-u8')
    await addInvites(t.agency, t.owner, 3)
    const v = await asActor(t.owner, async () => parseJson((await db.query('SELECT public.agency_subscription_entitlement() AS r')).rows[0].r))
    expect(v.usage.staff === 3, JSON.stringify(v.usage))
  })

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  return failed.length === 0
}

let ok = false
try {
  ok = await main()
} catch (error) {
  console.error('FAIL: harness error:', error && error.message ? error.message : error)
}
process.exit(ok ? 0 : 1)
