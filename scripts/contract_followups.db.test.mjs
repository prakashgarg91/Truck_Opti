#!/usr/bin/env node
/**
 * Contract audit follow-ups (TO-152, audit rows 3, 6, 15). SQL-level proof on a REAL PostgreSQL engine (PGlite).
 * Migration under test: supabase/migrations/20261034000000_contract_audit_followups.sql
 *   - agency_subscription_invoices() also returns supplier_legal_name, supplier_address, supplier_gstin,
 *     recipient_address exactly as stored (null when absent).
 *   - subscription_entitlement_snapshot() returns enforcement_enabled (the platform_billing_settings flag).
 *   - Approving a load plan marks its draft orders 'planned'; cancelling the approved plan returns them to 'draft';
 *     superseding by a replacement keeps them planned; agency_order_cancel answers 'order_in_approved_plan'
 *     before the version/draft checks.
 * Usage:  node scripts/contract_followups.db.test.mjs   (from the repo root)
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
const READ_MIGRATION = join(MIGRATIONS_DIR, '20261034000000_contract_audit_followups.sql')

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
        place_of_supply_state_code, sac_code, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at, supplier_legal_name, supplier_address, recipient_address)
     VALUES ($1, $2, $3, 'TO', $4, $5, '27', $6, $7, '27', '997331', $8, $9, $9, 0, $10, $11::timestamptz, $12, $13, $14)`,
    [id, agencyId, number, fy, GSTIN_OK, opts.recipientGstin ?? null, opts.recipientName ?? null, String(taxable), String(c), String(total), at, opts.supplierName ?? null, opts.supplierAddress ?? null, opts.recipientAddress ?? null]
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


async function seedPlanFixture(agencyId, ownerId, tag, specs = [[5, 10]]) {
  const agr = uid()
  await su(`INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key) VALUES ($1, $2, 'CF Client', 'active', $3)`, [agr, agencyId, nx('cf-agr')])
  const site = uid()
  await su(
    `INSERT INTO public.agency_client_sites (id, agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, status, idempotency_key)
     VALUES ($1, $2, $3, 'ship_to', 'Pune Depot', '1 Test Road', 'Pune', 'Maharashtra', '411001', 'active', $4)`,
    [site, agencyId, agr, nx('cf-site')]
  )
  const truck = uid()
  await su(`INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, payload_kg) VALUES ($1, $2, 'eicher_14ft', $3, 1000)`, [truck, agencyId, nx('CF-RC')])
  const orders = []
  for (const spec of specs) {
    const orderId = uid()
    await su(`INSERT INTO public.agency_orders (id, agency_id, agreement_id, client_order_ref, status, version) VALUES ($1, $2, $3, $4, 'draft', 1)`, [orderId, agencyId, agr, nx('CF-ORD')])
    const lineId = uid()
    await su(
      `INSERT INTO public.agency_order_lines (id, agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg, length_m, width_m, height_m,
         pickup_site_id, drop_site_id, pickup_from, pickup_to, delivery_from, delivery_to)
       VALUES ($1, $2, $3, 1, 'SKU', 'Line', $4, 'kg', $5, 1, 1, 1, $6, $6, now(), now(), now(), now())`,
      [lineId, agencyId, orderId, spec[0], spec[1], site]
    )
    orders.push({ orderId, lineId })
  }
  return { truck, orders, tag, ownerId }
}
async function seedPlan(fx, agencyId, name, lineIds, planVersion = 1) {
  const planId = uid()
  await su(
    `INSERT INTO public.agency_load_plans (id, agency_id, name, status, plan_version, version, idempotency_key, created_by)
     VALUES ($1, $2, $3, 'draft', $6, 1, $4, $5)`,
    [planId, agencyId, name, nx('cf-key'), fx.ownerId, planVersion]
  )
  const loadId = uid()
  await su(`INSERT INTO public.agency_load_plan_loads (id, plan_id, agency_id, truck_id, total_kg, utilization_pct) VALUES ($1, $2, $3, $4, 0, 0)`, [loadId, planId, agencyId, fx.truck])
  for (const lineId of lineIds) {
    await su(`INSERT INTO public.agency_load_plan_lines (id, load_id, plan_id, agency_id, order_line_id, quantity) VALUES ($1, $2, $3, $4, $5, 5)`, [uid(), loadId, planId, agencyId, lineId])
  }
  return planId
}
const orderRow = (id) => suOne('SELECT status, version FROM public.agency_orders WHERE id = $1', [id])
const planCall = (sub, sql, args) => asActor(sub, async () => parseJson((await db.query(sql, args)).rows[0].r))

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]})`)

  await testCase('F01. migration 20261034000000_contract_audit_followups.sql exists', async () => {
    expect(existsSync(READ_MIGRATION), 'migration file missing')
  })

  // ---- Row 3: invoice legal fields
  const A = await mkAgency('cf-a')
  const financeA = await seedStaff(A.agency, 'cf-fin', 'finance')
  await testCase('F02. invoice read returns supplier name/address/GSTIN and recipient address as stored', async () => {
    const inv = await insertInvoice(A.agency, { taxable: 49900n, recipientGstin: "27AAAPL1234C1ZV", recipientName: "Alpha Freight", supplierName: "TruckOpti Technologies Pvt Ltd", supplierAddress: "1 MG Road, Pune", recipientAddress: "9 Ring Road, Delhi" })
    const v = expectOk(await readAs(financeA))
    const row = v.invoices.find((i) => i.id === inv.id)
    expect(row.supplier_legal_name === 'TruckOpti Technologies Pvt Ltd', JSON.stringify(row))
    expect(row.supplier_address === '1 MG Road, Pune' && row.recipient_address === '9 Ring Road, Delhi', JSON.stringify(row))
    expect(row.supplier_gstin === GSTIN_OK, `supplier_gstin ${row.supplier_gstin}`)
  })
  await testCase('F03. missing supplier name/address/recipient address come back null, not invented', async () => {
    const inv = await insertInvoice(A.agency, { taxable: 10000n })
    const v = expectOk(await readAs(financeA))
    const row = v.invoices.find((i) => i.id === inv.id)
    expect(row.supplier_legal_name === null && row.supplier_address === null && row.recipient_address === null, JSON.stringify(row))
  })

  // ---- Row 6: enforcement flag in the snapshot
  await testCase('F04. entitlement snapshot carries enforcement_enabled and follows the platform flag', async () => {
    await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = false`)
    let s = parseJson((await suOne('SELECT public.subscription_entitlement_snapshot($1::uuid) AS s', [A.agency])).s)
    expect(s.enforcement_enabled === false, `off: ${JSON.stringify(s).slice(0, 120)}`)
    await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = true`)
    s = parseJson((await suOne('SELECT public.subscription_entitlement_snapshot($1::uuid) AS s', [A.agency])).s)
    expect(s.enforcement_enabled === true, 'on')
    const viaRpc = await asActor(A.owner, async () => parseJson((await db.query('SELECT public.agency_subscription_entitlement() AS r')).rows[0].r))
    expect(viaRpc.enforcement_enabled === true, 'owner RPC does not carry the flag')
    await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = false`)
  })

  // ---- Row 15: planned status
  const APPROVE = 'SELECT public.agency_load_plan_approve($1::uuid, $2::int) AS r'
  const CANCEL = 'SELECT public.agency_load_plan_cancel($1::uuid, $2::int) AS r'
  const ORDER_CANCEL = 'SELECT public.agency_order_cancel($1::uuid, $2::int) AS r'

  await testCase('F05. approving a plan marks its draft orders planned (version+1); other orders stay draft', async () => {
    const fx = await seedPlanFixture(A.agency, A.owner, 'f5', [[5, 10], [5, 10]])
    const plan = await seedPlan(fx, A.agency, nx('CF-P5'), [fx.orders[0].lineId])
    const r = await planCall(A.owner, APPROVE, [plan, 1])
    expect(r.ok === true, JSON.stringify(r))
    const o0 = await orderRow(fx.orders[0].orderId)
    const o1 = await orderRow(fx.orders[1].orderId)
    expect(o0.status === 'planned' && Number(o0.version) === 2, `planned order ${JSON.stringify(o0)}`)
    expect(o1.status === 'draft' && Number(o1.version) === 1, `other order ${JSON.stringify(o1)}`)
  })
  await testCase('F06. cancelling the approved plan returns its orders to draft', async () => {
    const fx = await seedPlanFixture(A.agency, A.owner, 'f6')
    const plan = await seedPlan(fx, A.agency, nx('CF-P6'), [fx.orders[0].lineId])
    expect((await planCall(A.owner, APPROVE, [plan, 1])).ok === true, 'approve')
    expect((await orderRow(fx.orders[0].orderId)).status === 'planned', 'not planned')
    const c = await planCall(A.owner, CANCEL, [plan, 2])
    expect(c.ok === true, JSON.stringify(c))
    const o = await orderRow(fx.orders[0].orderId)
    expect(o.status === 'draft' && Number(o.version) === 3, JSON.stringify(o))
  })
  await testCase('F07. a draft plan alone never changes order status; cancelling a draft plan leaves orders draft', async () => {
    const fx = await seedPlanFixture(A.agency, A.owner, 'f7')
    const plan = await seedPlan(fx, A.agency, nx('CF-P7'), [fx.orders[0].lineId])
    expect((await orderRow(fx.orders[0].orderId)).status === 'draft', 'draft plan changed the order')
    expect((await planCall(A.owner, CANCEL, [plan, 1])).ok === true, 'cancel draft plan')
    const o = await orderRow(fx.orders[0].orderId)
    expect(o.status === 'draft' && Number(o.version) === 1, JSON.stringify(o))
  })
  await testCase('F08. superseding an approved plan by an approved replacement of the same name keeps the orders planned', async () => {
    const fx = await seedPlanFixture(A.agency, A.owner, 'f8')
    const name = nx('CF-P8')
    const p1 = await seedPlan(fx, A.agency, name, [fx.orders[0].lineId])
    expect((await planCall(A.owner, APPROVE, [p1, 1])).ok === true, 'approve 1')
    const p2 = await seedPlan(fx, A.agency, name, [fx.orders[0].lineId], 2)
    const r = await planCall(A.owner, APPROVE, [p2, 1])
    expect(r.ok === true, JSON.stringify(r))
    expect((await suOne('SELECT status FROM public.agency_load_plans WHERE id = $1', [p1])).status === 'superseded', 'p1 not superseded')
    const o = await orderRow(fx.orders[0].orderId)
    expect(o.status === 'planned', JSON.stringify(o))
  })
  await testCase("F09. an order in an approved plan answers 'order_in_approved_plan' whatever version is sent; after plan cancel it can be cancelled", async () => {
    const fx = await seedPlanFixture(A.agency, A.owner, 'f9')
    const plan = await seedPlan(fx, A.agency, nx('CF-P9'), [fx.orders[0].lineId])
    expect((await planCall(A.owner, APPROVE, [plan, 1])).ok === true, 'approve')
    for (const v of [1, 2]) {
      const r = await planCall(A.owner, ORDER_CANCEL, [fx.orders[0].orderId, v])
      expect(r.ok === false && r.error === 'order_in_approved_plan', `v${v}: ${JSON.stringify(r)}`)
    }
    expect((await planCall(A.owner, CANCEL, [plan, 2])).ok === true, 'cancel plan')
    const ok = await planCall(A.owner, ORDER_CANCEL, [fx.orders[0].orderId, 3])
    expect(ok.ok === true && ok.state === 'cancelled', JSON.stringify(ok))
  })
  await testCase('F10. a stale version on a draft order is still version_conflict; a cancelled order still replays unchanged', async () => {
    const fx = await seedPlanFixture(A.agency, A.owner, 'f10')
    const r = await planCall(A.owner, ORDER_CANCEL, [fx.orders[0].orderId, 7])
    expect(r.ok === false && r.error === 'version_conflict', JSON.stringify(r))
    expect((await planCall(A.owner, ORDER_CANCEL, [fx.orders[0].orderId, 1])).ok === true, 'cancel')
    const again = await planCall(A.owner, ORDER_CANCEL, [fx.orders[0].orderId, 1])
    expect(again.ok === true && again.state === 'unchanged', JSON.stringify(again))
  })
  await testCase('F11. the status-sync trigger function is not callable by clients', async () => {
    const g = await su(`SELECT has_function_privilege('authenticated', 'public.agency_load_plan_order_status_sync()', 'EXECUTE') AS a,
                               has_function_privilege('anon', 'public.agency_load_plan_order_status_sync()', 'EXECUTE') AS b`)
    expect(g.rows[0].a === false && g.rows[0].b === false, 'executable by clients')
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
