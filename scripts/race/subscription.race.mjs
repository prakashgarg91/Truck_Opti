#!/usr/bin/env node
/**
 * Concurrency battery on REAL PostgreSQL for the TO-152 subscription commands (migrations
 * 20261026..20261032): subscription_create_order, subscription_activate_payment,
 * subscription_record_refund, subscription_webhook_process, subscription_next_invoice_number,
 * the agency_subscription_assert guard behind the guarded commands, and run_subscription_sweeps.
 *
 * Same harness as new_commands.race.mjs: embedded server, full supabase/migrations chain, N
 * independent connections (own backend each) fired at the same moment after a warm-up round trip.
 * Every iteration builds FRESH agencies, so iterations never interfere. A database error that
 * escapes as a raised exception is an invariant violation, except the typed guard codes SB001..SB003
 * where a scenario expects them. SQLSTATE 40P01 (deadlock detected) is ALWAYS a FAIL.
 *
 * Scenarios:
 *   S1 activate_payment, same order + same payment id   one activation, one invoice, rest replay, period extended once
 *   S2 activate_payment, same order, different payments  one success, rest order_already_paid, one invoice, losers on the ledger
 *   S3 webhook_process                                   (a) same event id (b) captured + order.paid under two event ids
 *                                                        (c) refund.processed under two event ids: one effect each, no transient failures
 *   S4 invoice numbers                                   (a) mint in parallel transactions, commit/rollback mix: unique, gap-free
 *                                                        (b) N orders of one agency activated at once, (c) same without a prior subscription
 *   S5 guard under parallel commands (enforcement ON)    trucks (3), staff invites (2), order imports per month (50): never over the limit
 *   S6 activation vs run_subscription_sweeps             final state consistent (active, new period), no 40P01
 *   S7 record_refund                                     (a) same refund id (b) different refund ids (c) refund vs second activation
 *   S8 deadlock probe, enforcement ON                    agency_job_assign_driver vs reserve_fleet_assignment on the same job
 *
 * Usage:  node scripts/race/subscription.race.mjs      (RACE_MODULES must point at the folder with embedded-postgres + pg)
 *         RACE_ITERATIONS=3 RACE_PARALLEL=8 node scripts/race/subscription.race.mjs
 * Exit 0 = all invariants hold; exit 1 = a violation or an unexpected database error.
 */

import { createHash, randomUUID } from 'node:crypto'
import { startServer } from './_realPg.mjs'

function positiveInt(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 2) {
    console.error(`FAIL: ${name} must be an integer >= 2, got ${JSON.stringify(raw)}`)
    process.exit(1)
  }
  return n
}

const ITERATIONS = positiveInt('RACE_ITERATIONS', 5)
const N = positiveInt('RACE_PARALLEL', 8)
const HALF = Math.max(1, Math.floor(N / 2))

let counter = 0
const next = () => ++counter
const firstLine = (e) => String((e && e.message) || e).split('\n')[0].trim()
const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v)
const sha256 = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex')

let s
let q
let rowsOf
let oneRow
let customerId
let customerUserId

// ---------------------------------------------------------------------------
// Fixtures (superuser)
// ---------------------------------------------------------------------------
async function createUser(tag) {
  const id = randomUUID()
  const email = `${tag}-${next()}@race.example.com`
  await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [id, email, JSON.stringify({})])
  await q(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

async function freshAgency() {
  const userId = await createUser('sub-agency')
  const k = next()
  const id = randomUUID()
  await q(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, state, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', 'Delhi', 'approved', $4, $5)`,
    [id, userId, `SUB ${k} Transport Pvt Ltd`, `07ABCDE${1000 + k}A1Z5`, `ABCDE${4000 + k}Q`]
  )
  return { agencyId: id, ownerId: userId }
}

async function createCustomer() {
  const userId = await createUser('sub-cust')
  const k = next()
  const id = randomUUID()
  await q(
    `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, gst_number, pan_number, created_by)
     VALUES ($1, $2, $3, $4, 'Race Street', 'Delhi', 'Delhi', '110001', $5, $6, $7)`,
    [id, `SUB Cust ${k} Pvt Ltd`, `9${String(k).padStart(9, '0')}`, `sub-cust-${k}@race.example.com`, `ABCDE${1000 + k}F`, `FGHIJ${2000 + k}K`, userId]
  )
  return { id, userId }
}

async function setBilling(enforcement = false) {
  await q(
    `UPDATE public.platform_billing_settings
        SET legal_name = 'TruckOpti Race Pvt Ltd', gstin = '07AAAAA0000A1Z5', address = '1 Race Road, New Delhi',
            state_code = '07', sac_code = '997331', enforcement_enabled = $1`,
    [enforcement]
  )
}
const setEnforcement = (on) => q(`UPDATE public.platform_billing_settings SET enforcement_enabled = $1`, [on])

async function planId(tier = 'starter') {
  return (await oneRow(`SELECT id FROM public.subscription_plans WHERE tier = $1 AND coalesce(is_active, TRUE) ORDER BY created_at, id LIMIT 1`, [tier])).id
}

/**
 * Stored subscription for an agency. kind: active | active_expiring | trial_expiring | grace_expiring.
 * Inserted as superuser (exempt from the status machine), exactly like a row created by earlier history.
 */
async function freshSub(agencyId, ownerId, kind = 'active', tier = 'starter') {
  const pid = await planId(tier)
  const cols = {
    active: ['active', `now() - interval '20 days'`, `now() + interval '10 days'`, 'NULL', 'NULL'],
    active_expiring: ['active', `now() - interval '31 days'`, `now() - interval '1 hour'`, 'NULL', 'NULL'],
    trial_expiring: ['trial', `now() - interval '15 days'`, `now() - interval '1 hour'`, `now() - interval '1 hour'`, 'NULL'],
    grace_expiring: ['grace', `now() - interval '40 days'`, `now() - interval '8 days'`, 'NULL', `now() - interval '1 hour'`],
  }[kind]
  const r = await oneRow(
    `INSERT INTO public.subscriptions
       (user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end, grace_end, first_paid_at)
     VALUES ($1, $2, $3, '${cols[0]}', 'monthly', ${cols[1]}, ${cols[2]}, ${cols[3]}, ${cols[4]}, ${kind === 'trial_expiring' ? 'NULL' : 'now() - interval \'60 days\''})
     RETURNING id, version, current_period_start, current_period_end`,
    [ownerId, agencyId, pid]
  )
  return r
}

/** Priced pending order through the real command (superuser connection). Returns { orderId, amount }. */
async function freshOrder(agencyId, { tier = 'starter', cycle = 'monthly' } = {}) {
  const orderId = `order_${randomUUID().replace(/-/g, '')}`
  const r = parseJson((await q(`SELECT public.subscription_create_order($1::uuid, $2::text, $3::text, NULL, $4::text) AS r`, [agencyId, tier, cycle, orderId])).rows[0].r)
  if (!r.ok) throw new Error(`subscription_create_order refused: ${JSON.stringify(r)}`)
  return { orderId, amount: Number(r.amount_paise) }
}
const payId = () => `pay_${randomUUID().replace(/-/g, '').slice(0, 20)}`
const refundId = () => `rfnd_${randomUUID().replace(/-/g, '').slice(0, 20)}`

async function freshAgreement(agencyId) {
  const id = randomUUID()
  await q(`INSERT INTO public.agency_client_agreements (id, agency_id, client_name, idempotency_key) VALUES ($1, $2, $3, $4)`, [
    id, agencyId, `Client ${next()}`, `agr-${randomUUID()}`,
  ])
  await q(
    `INSERT INTO public.agency_client_sites (agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, idempotency_key)
     VALUES ($1, $2, 'ship_to', 'Plant A', '1 Race Road', 'Delhi', 'Delhi', '110001', $3),
            ($1, $2, 'ship_to', 'Plant B', '2 Race Road', 'Delhi', 'Delhi', '110001', $4)`,
    [agencyId, id, `site-${randomUUID()}`, `site-${randomUUID()}`]
  )
  return id
}

async function freshDriver(agencyId) {
  const k = next()
  const userId = await createUser('sub-drv')
  const driverId = randomUUID()
  await q(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', 'approved', true, 'ABCDE1234F')`,
    [driverId, userId, `SUB Driver ${k}`, `8${String(k).padStart(9, '0')}`]
  )
  const employmentId = randomUUID()
  await q(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, licence_number, licence_class, licence_expiry, status)
     VALUES ($1, $2, $3, $4, 'HGV', '2030-01-01', 'active')`,
    [employmentId, agencyId, driverId, `DL-SUB-${k}`]
  )
  return { userId, driverId, employmentId }
}

async function freshTruck(agencyId) {
  const id = randomUUID()
  await q(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, is_available,
       insurance_expiry, fitness_expiry, permit_expiry, puc_expiry)
     VALUES ($1, $2, 'eicher_14ft', $3, true, '2030-01-01', '2030-01-01', '2030-01-01', '2030-01-01')`,
    [id, agencyId, `RC-SUB-${next()}`]
  )
  return id
}

async function freshJobWithOffer(agencyId, driverId) {
  const k = next()
  const shipmentId = randomUUID()
  await q(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [shipmentId, `SUB-${k}-${Date.now()}`, customerId, customerUserId]
  )
  const jobId = randomUUID()
  await q(`INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, 'pending')`, [jobId, agencyId, shipmentId])
  const offerId = randomUUID()
  await q(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), now() + interval '48 hours', 'pending', '4321', '8765')`,
    [offerId, shipmentId, driverId]
  )
  return { jobId, offerId }
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------
const call = async (conn, sql, params) => parseJson((await conn.query(sql, params)).rows[0].r)

const activate = (c, orderId, paymentId, amount, source = 'verify') =>
  call(c, `SELECT public.subscription_activate_payment($1::text, $2::text, $3::bigint, 'INR', 'upi', $4::text) AS r`, [orderId, paymentId, amount, source])
const refund = (c, paymentId, rId, amount) => call(c, `SELECT public.subscription_record_refund($1::text, $2::text, $3::bigint) AS r`, [paymentId, rId, amount])
const sweep = (c) => call(c, `SELECT public.run_subscription_sweeps() AS r`, [])
const webhook = (c, eventId, type, payload) =>
  call(c, `SELECT public.subscription_webhook_process($1::text, $2::text, $3::jsonb, $4::text) AS r`, [eventId, type, JSON.stringify(payload), sha256(payload)])
const capturedPayload = (type, orderId, paymentId, amount) => ({
  event: type,
  payload: {
    payment: { entity: { id: paymentId, order_id: orderId, amount, currency: 'INR', method: 'upi', status: 'captured' } },
    ...(type === 'order.paid' ? { order: { entity: { id: orderId, amount, amount_paid: amount, status: 'paid' } } } : {}),
  },
})
const refundPayload = (paymentId, rId, amount) => ({
  event: 'refund.processed',
  payload: { refund: { entity: { id: rId, payment_id: paymentId, amount, currency: 'INR' } } },
})

const vehicleCreate = (c, rc) => call(c, `SELECT public.agency_vehicle_create($1::text, 'eicher_14ft') AS r`, [rc])
const memberInvite = (c, email, key) => call(c, `SELECT public.agency_member_invite($1::text, 'viewer', 7, $2::text) AS r`, [email, key])
const orderImport = (c, agreementId, ref, hash, key) =>
  call(c, `SELECT public.agency_order_import($1::uuid, $2::text, $3::text, $4::jsonb) AS r`, [
    agreementId, hash, key,
    JSON.stringify([{ client_order_ref: ref, line_no: 1, sku: 'SKU-1', quantity: 5, unit: 'piece', pickup_site: 'Plant A', drop_site: 'Plant B' }]),
  ])
const assignDriver = (c, jobId, driverId) => call(c, `SELECT public.agency_job_assign_driver($1::uuid, $2::uuid) AS r`, [jobId, driverId])
const reserveFleet = (c, a) =>
  call(c, `SELECT public.reserve_fleet_assignment($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::integer, $8::text) AS r`, [
    a.jobId, a.offerId, a.vehicleId, a.employmentId, a.start, a.end, a.version, a.key,
  ])

/** ok | typed (ok:false with error code) | guard (SB00x raised on purpose) | raised (any other escaped database error) */
function classify(settled) {
  if (settled.status === 'fulfilled') {
    const v = settled.value
    if (v && v.ok === true) {
      const tag = v.replay ? 'replay' : v.result ?? v.state ?? v.status ?? 'done'
      return { kind: 'ok', value: v, code: null, label: `ok:${tag}` }
    }
    const code = v && v.error ? v.error : 'no_error_code'
    return { kind: 'typed', value: v, code, label: `typed:${code}` }
  }
  const e = settled.reason
  const code = e && e.code
  if (code === 'SB001' || code === 'SB002' || code === 'SB003') return { kind: 'guard', value: null, code, label: `guard:${code}` }
  return { kind: 'raised', value: null, code, label: `RAISED:${code ? code + ' ' : ''}${firstLine(e)}` }
}

/** Opens `count` connections, warms them, then fires fn(conn, i) on all of them at once. */
async function fireAll(open, userId, fn, count = N) {
  const conns = []
  for (let i = 0; i < count; i++) conns.push(await open(userId))
  await Promise.all(conns.map((c) => c.query('SELECT 1')))
  const settled = await Promise.allSettled(conns.map((c, i) => fn(c, i)))
  return settled.map(classify)
}

function raisedViolations(outs) {
  return outs
    .filter((o) => o.kind === 'raised')
    .map((o) => (o.code === '40P01' ? `DEADLOCK 40P01 surfaced: ${o.label}` : `database error escaped: ${o.label}`))
}

const tally = (outs) => [...outs.reduce((m, o) => m.set(o.label, (m.get(o.label) ?? 0) + 1), new Map())].map(([l, n]) => `${n}x ${l}`).sort().join(', ')
const count = (outs, pred) => outs.filter(pred).length
const isRealOk = (o) => o.kind === 'ok' && !o.value.replay
const nthMonth = async (ts, n) => {
  let t = ts
  for (let i = 0; i < n; i++) t = (await oneRow(`SELECT (((($1::timestamptz) AT TIME ZONE 'Asia/Kolkata') + interval '1 month') AT TIME ZONE 'Asia/Kolkata') AS e`, [t])).e
  return new Date(t).getTime()
}
/** current financial year label, e.g. 26-27 (1 April, Asia/Kolkata) */
function currentFy() {
  const ist = new Date(Date.now() + 5.5 * 3600e3)
  const y = ist.getUTCMonth() + 1 >= 4 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1
  return `${String(y % 100).padStart(2, '0')}-${String((y + 1) % 100).padStart(2, '0')}`
}

async function invoiceCount(agencyId) {
  return (await oneRow(`SELECT count(*)::int AS n FROM public.subscription_invoices WHERE agency_id = $1`, [agencyId])).n
}
async function webhookAttempts(eventIds) {
  return rowsOf(`SELECT event_id, sqlstate_or_code FROM public.razorpay_webhook_attempts WHERE event_id = ANY($1::text[])`, [eventIds])
}

/** Global ledger checks for the CURRENT financial year: invoice and credit note numbers 1..last_no without gaps or duplicates. */
async function ledgerViolations() {
  const v = []
  const fy = currentFy()
  for (const [series, table, col] of [['TO', 'subscription_invoices', 'invoice_number'], ['CN', 'subscription_credit_notes', 'credit_note_number']]) {
    const rows = await rowsOf(`SELECT ${col} AS n FROM public.${table} WHERE ${col} LIKE $1`, [`${series}/${fy}/%`])
    const seqs = rows.map((r) => Number(r.n.split('/').pop())).sort((a, b) => a - b)
    const last = (await oneRow(`SELECT last_no FROM public.subscription_invoice_counters WHERE series = $1 AND fy = $2`, [series, fy]))?.last_no
    if (new Set(rows.map((r) => r.n)).size !== rows.length) v.push(`${series}/${fy}: duplicate numbers`)
    if (seqs.some((x, i) => x !== i + 1)) v.push(`${series}/${fy}: not gap-free 1..${seqs.length}: ${seqs.slice(-12).join(',')}`)
    if (Number(last ?? 0) !== seqs.length) v.push(`${series}/${fy}: counter last_no ${last} != ${seqs.length} issued numbers`)
  }
  const over = await rowsOf(
    `SELECT i.id, i.total_paise, sum(c.total_paise)::bigint AS credited
       FROM public.subscription_invoices i JOIN public.subscription_credit_notes c ON c.invoice_id = i.id
      GROUP BY i.id, i.total_paise HAVING sum(c.total_paise) > i.total_paise`
  )
  if (over.length) v.push(`credit notes exceed invoice total: ${JSON.stringify(over[0])}`)
  const dated = await rowsOf(
    `SELECT a.invoice_number FROM public.subscription_invoices a JOIN public.subscription_invoices b
       ON a.series = b.series AND a.fy = b.fy AND a.invoice_number < b.invoice_number AND a.issued_at > b.issued_at
      WHERE a.fy = $1 LIMIT 1`, [fy]
  )
  if (dated.length) v.push(`invoice number order differs from date order at ${dated[0].invoice_number}`)
  return v
}

// ---------------------------------------------------------------------------
// Scenarios: each returns { label, violations }
// ---------------------------------------------------------------------------
async function s1(open) {
  const { agencyId, ownerId } = await freshAgency()
  const sub = await freshSub(agencyId, ownerId, 'active')
  const { orderId, amount } = await freshOrder(agencyId)
  const pid = payId()
  const outs = await fireAll(open, null, (c) => activate(c, orderId, pid, amount))
  const v = raisedViolations(outs)
  if (count(outs, isRealOk) !== 1) v.push(`expected exactly one real activation, got ${tally(outs)}`)
  if (count(outs, (o) => o.kind === 'ok' && o.value.replay) !== N - 1) v.push(`expected ${N - 1} replays, got ${tally(outs)}`)
  if (outs.some((o) => o.kind === 'typed' || o.kind === 'guard')) v.push(`unexpected typed refusal: ${tally(outs)}`)
  const inv = await invoiceCount(agencyId)
  if (inv !== 1) v.push(`invoices = ${inv}, expected 1`)
  const after = await oneRow(`SELECT status, version, current_period_start, current_period_end, grace_end FROM public.subscriptions WHERE agency_id = $1`, [agencyId])
  const expectEnd = await nthMonth(sub.current_period_end, 1)
  if (after.status !== 'active') v.push(`subscription ended ${after.status}`)
  if (after.version !== sub.version + 1) v.push(`subscription version ${after.version}, expected ${sub.version + 1} (one UPDATE)`)
  if (new Date(after.current_period_end).getTime() !== expectEnd) v.push(`period end ${new Date(after.current_period_end).toISOString()} != old end + 1 month ${new Date(expectEnd).toISOString()} (extended more than once?)`)
  if (new Date(after.current_period_start).getTime() !== new Date(sub.current_period_end).getTime()) v.push('period start is not the old period end')
  const pay = await rowsOf(`SELECT status, razorpay_payment_id FROM public.payment_history WHERE agency_id = $1`, [agencyId])
  if (pay.length !== 1 || pay[0].status !== 'success' || pay[0].razorpay_payment_id !== pid) v.push(`payment rows ${JSON.stringify(pay)}`)
  return { label: tally(outs), violations: v }
}

async function s2(open) {
  const { agencyId, ownerId } = await freshAgency()
  const sub = await freshSub(agencyId, ownerId, 'active')
  const { orderId, amount } = await freshOrder(agencyId)
  const pids = Array.from({ length: N }, payId)
  const outs = await fireAll(open, null, (c, i) => activate(c, orderId, pids[i], amount))
  const v = raisedViolations(outs)
  if (count(outs, isRealOk) !== 1) v.push(`expected exactly one success, got ${tally(outs)}`)
  if (count(outs, (o) => o.kind === 'typed' && o.code === 'order_already_paid') !== N - 1) v.push(`expected ${N - 1}x order_already_paid, got ${tally(outs)}`)
  if (outs.some((o) => o.kind === 'ok' && o.value.replay)) v.push(`unexpected replay for distinct payment ids: ${tally(outs)}`)
  const inv = await invoiceCount(agencyId)
  if (inv !== 1) v.push(`invoices = ${inv}, expected 1`)
  const row = await oneRow(`SELECT status, razorpay_payment_id, metadata FROM public.payment_history WHERE agency_id = $1`, [agencyId])
  const winnerIdx = outs.findIndex(isRealOk)
  if (row.status !== 'success' || row.razorpay_payment_id !== pids[winnerIdx]) v.push(`order row ${row.status}/${row.razorpay_payment_id}, expected success/${pids[winnerIdx]}`)
  const ledger = row.metadata?.refused_payment_ids ?? []
  for (let i = 0; i < N; i++) if (i !== winnerIdx && !ledger.includes(pids[i])) v.push(`refused captured payment ${pids[i]} is not on the refusal ledger (money would be unfindable)`)
  const after = await oneRow(`SELECT version, current_period_end FROM public.subscriptions WHERE agency_id = $1`, [agencyId])
  if (after.version !== sub.version + 1) v.push(`subscription version ${after.version}, expected ${sub.version + 1}`)
  if (new Date(after.current_period_end).getTime() !== (await nthMonth(sub.current_period_end, 1))) v.push('period extended more than once')
  return { label: tally(outs), violations: v }
}

async function s3(open) {
  const v = []
  const labels = []
  // (a) same event id, N parallel deliveries
  {
    const { agencyId, ownerId } = await freshAgency()
    await freshSub(agencyId, ownerId, 'active')
    const { orderId, amount } = await freshOrder(agencyId)
    const pid = payId()
    const evt = `evt_${randomUUID()}`
    const body = capturedPayload('payment.captured', orderId, pid, amount)
    const outs = await fireAll(open, null, (c) => webhook(c, evt, 'payment.captured', body))
    v.push(...raisedViolations(outs).map((m) => `S3a ${m}`))
    if (count(outs, (o) => o.kind === 'ok' && o.value.result === 'activated') !== 1) v.push(`S3a expected exactly one activated, got ${tally(outs)}`)
    if (count(outs, (o) => o.kind === 'ok' && o.value.result === 'duplicate') !== N - 1) v.push(`S3a expected ${N - 1} duplicates, got ${tally(outs)}`)
    if (outs.some((o) => o.kind === 'typed')) v.push(`S3a typed refusal: ${tally(outs)}`)
    if ((await invoiceCount(agencyId)) !== 1) v.push('S3a invoices != 1')
    const ev = (await oneRow(`SELECT count(*)::int AS n FROM public.razorpay_webhook_events WHERE event_id = $1`, [evt])).n
    if (ev !== 1) v.push(`S3a event rows = ${ev}, expected 1`)
    const att = await webhookAttempts([evt])
    if (att.length) v.push(`S3a transient failures recorded: ${JSON.stringify(att)}`)
    labels.push(`same-event[${tally(outs)}]`)
  }
  // (b) payment.captured and order.paid for the SAME payment under two event ids
  {
    const { agencyId, ownerId } = await freshAgency()
    const sub = await freshSub(agencyId, ownerId, 'active')
    const { orderId, amount } = await freshOrder(agencyId)
    const pid = payId()
    const e1 = `evt_${randomUUID()}`
    const e2 = `evt_${randomUUID()}`
    const b1 = capturedPayload('payment.captured', orderId, pid, amount)
    const b2 = capturedPayload('order.paid', orderId, pid, amount)
    const outs = await fireAll(open, null, (c, i) => (i % 2 === 0 ? webhook(c, e1, 'payment.captured', b1) : webhook(c, e2, 'order.paid', b2)))
    v.push(...raisedViolations(outs).map((m) => `S3b ${m}`))
    if (count(outs, (o) => o.kind === 'ok' && o.value.result === 'activated') !== 1) v.push(`S3b expected exactly one activated, got ${tally(outs)}`)
    if (outs.some((o) => o.kind === 'typed' || (o.kind === 'ok' && !['activated', 'replay', 'duplicate'].includes(o.value.result)))) v.push(`S3b unexpected outcome: ${tally(outs)}`)
    if ((await invoiceCount(agencyId)) !== 1) v.push('S3b invoices != 1')
    const ev = (await oneRow(`SELECT count(*)::int AS n FROM public.razorpay_webhook_events WHERE event_id = ANY($1::text[])`, [[e1, e2]])).n
    if (ev !== 2) v.push(`S3b event rows = ${ev}, expected 2`)
    const att = await webhookAttempts([e1, e2])
    if (att.length) v.push(`S3b transient failures recorded: ${JSON.stringify(att)}`)
    const after = await oneRow(`SELECT version, current_period_end FROM public.subscriptions WHERE agency_id = $1`, [agencyId])
    if (after.version !== sub.version + 1 || new Date(after.current_period_end).getTime() !== (await nthMonth(sub.current_period_end, 1))) v.push('S3b period extended more than once')
    labels.push(`two-events[${tally(outs)}]`)

    // (c) refund.processed for that payment under two event ids, same refund id
    const rid = refundId()
    const half = Math.floor(amount / 2)
    const r1 = `evt_${randomUUID()}`
    const r2 = `evt_${randomUUID()}`
    const rb = refundPayload(pid, rid, half)
    const outsC = await fireAll(open, null, (c, i) => webhook(c, i % 2 === 0 ? r1 : r2, 'refund.processed', rb))
    v.push(...raisedViolations(outsC).map((m) => `S3c ${m}`))
    if (outsC.some((o) => !(o.kind === 'ok' && (o.value.result === 'refunded' || o.value.result === 'duplicate')))) v.push(`S3c unexpected outcome: ${tally(outsC)}`)
    const cn = (await oneRow(`SELECT count(*)::int AS n FROM public.subscription_credit_notes WHERE refund_id = $1`, [rid])).n
    if (cn !== 1) v.push(`S3c credit notes for the refund id = ${cn}, expected 1`)
    const att2 = await webhookAttempts([r1, r2])
    if (att2.length) v.push(`S3c transient failures recorded: ${JSON.stringify(att2)}`)
    labels.push(`refund[${tally(outsC)}]`)
  }
  v.push(...(await ledgerViolations()).map((m) => `S3 ledger: ${m}`))
  return { label: labels.join(' '), violations: v }
}

// FY 20-21 is never used by real activations (they use now), so these numbers belong to this scenario alone.
let s4aMinted = 0
async function s4(open) {
  const v = []
  const labels = []
  // (a) parallel transactions mint a number; even ones commit, odd ones roll back (the number must be returned)
  {
    const conns = []
    for (let i = 0; i < N; i++) conns.push(await open(null))
    await Promise.all(conns.map((c) => c.query('SELECT 1')))
    const settled = await Promise.allSettled(
      conns.map(async (c, i) => {
        await c.query('BEGIN')
        try {
          const n = (await c.query(`SELECT public.subscription_next_invoice_number('TO', '2020-06-01T00:00:00Z'::timestamptz) AS n`)).rows[0].n
          await c.query(i % 2 === 0 ? 'COMMIT' : 'ROLLBACK')
          return { n, committed: i % 2 === 0 }
        } catch (e) {
          await c.query('ROLLBACK').catch(() => {})
          throw e
        }
      })
    )
    const bad = settled.filter((x) => x.status === 'rejected')
    for (const b of bad) v.push(b.reason?.code === '40P01' ? `DEADLOCK 40P01 surfaced: ${firstLine(b.reason)}` : `S4a database error escaped: ${firstLine(b.reason)}`)
    const committed = settled.filter((x) => x.status === 'fulfilled' && x.value.committed).map((x) => x.value.n)
    s4aMinted += committed.length
    if (new Set(committed).size !== committed.length) v.push(`S4a duplicate committed numbers: ${committed.join(',')}`)
    const stored = (await oneRow(`SELECT last_no FROM public.subscription_invoice_counters WHERE series = 'TO' AND fy = '20-21'`))?.last_no ?? 0
    if (Number(stored) !== s4aMinted) v.push(`S4a counter last_no ${stored} != ${s4aMinted} committed mints (a rollback did not return its number, or a number was lost)`)
    const seqs = committed.map((x) => Number(x.split('/').pop())).sort((a, b) => a - b)
    if (seqs.length && seqs.some((x, i) => i > 0 && x !== seqs[i - 1] + 1)) v.push(`S4a committed numbers not contiguous: ${seqs.join(',')}`)
    labels.push(`mint[${committed.length} committed of ${N}]`)
  }
  // (b) N orders of one agency with a live subscription, all activated at once
  // (c) same, but the agency has no subscription row yet (first activation inserts it)
  for (const mode of ['live subscription', 'no subscription yet']) {
    const { agencyId, ownerId } = await freshAgency()
    const sub = mode === 'live subscription' ? await freshSub(agencyId, ownerId, 'active') : null
    const orders = []
    for (let i = 0; i < N; i++) orders.push(await freshOrder(agencyId))
    const pids = orders.map(() => payId())
    const outs = await fireAll(open, null, async (c, i) => {
      // activation_conflict is the typed, retryable backstop (first-subscription insert race): a client retries it
      let r = await activate(c, orders[i].orderId, pids[i], orders[i].amount)
      for (let a = 0; a < 4 && r.ok === false && r.retryable === true; a++) r = await activate(c, orders[i].orderId, pids[i], orders[i].amount)
      return r
    })
    v.push(...raisedViolations(outs).map((m) => `S4 (${mode}) ${m}`))
    if (count(outs, isRealOk) !== N) v.push(`S4 (${mode}) expected ${N} activations, got ${tally(outs)}`)
    const invs = await rowsOf(`SELECT invoice_number FROM public.subscription_invoices WHERE agency_id = $1 ORDER BY invoice_number`, [agencyId])
    if (invs.length !== N) v.push(`S4 (${mode}) invoices = ${invs.length}, expected ${N}`)
    const seqs = invs.map((r) => Number(r.invoice_number.split('/').pop()))
    if (seqs.some((x, i) => i > 0 && x !== seqs[i - 1] + 1)) v.push(`S4 (${mode}) invoice numbers of the agency not contiguous: ${seqs.join(',')}`)
    const subs = await rowsOf(`SELECT status, current_period_end FROM public.subscriptions WHERE agency_id = $1`, [agencyId])
    if (subs.length !== 1 || subs[0].status !== 'active') v.push(`S4 (${mode}) subscriptions = ${JSON.stringify(subs)}, expected one active row`)
    else {
      let base
      if (sub) base = sub.current_period_end
      else {
        const first = await oneRow(
          `SELECT (p.metadata ->> 'activated_at')::timestamptz AS t FROM public.payment_history p
             JOIN public.subscription_invoices i ON i.id = p.subscription_invoice_id
            WHERE p.agency_id = $1 ORDER BY i.invoice_number LIMIT 1`, [agencyId])
        base = first.t
      }
      const expectEnd = await nthMonth(base, sub ? N : N)
      if (new Date(subs[0].current_period_end).getTime() !== expectEnd) v.push(`S4 (${mode}) period end ${new Date(subs[0].current_period_end).toISOString()} != ${N} stacked months ${new Date(expectEnd).toISOString()}`)
    }
    labels.push(`${mode === 'live subscription' ? 'live' : 'fresh'}[${tally(outs)}]`)
  }
  v.push(...(await ledgerViolations()).map((m) => `S4 ledger: ${m}`))
  return { label: labels.join(' '), violations: v }
}

async function s5(open) {
  const v = []
  const labels = []
  await setEnforcement(true)
  try {
    // trucks: Starter = 3
    {
      const { agencyId, ownerId } = await freshAgency()
      await freshSub(agencyId, ownerId, 'active')
      const outs = await fireAll(open, ownerId, (c, i) => vehicleCreate(c, `RC-S5-${randomUUID().slice(0, 8)}-${i}`), 8)
      v.push(...raisedViolations(outs).map((m) => `S5 trucks ${m}`))
      if (count(outs, (o) => o.kind === 'ok') !== 3) v.push(`S5 trucks expected exactly 3 successes, got ${tally(outs)}`)
      if (count(outs, (o) => o.kind === 'guard' && o.code === 'SB001') !== 5) v.push(`S5 trucks expected 5x SB001, got ${tally(outs)}`)
      const n = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1`, [agencyId])).n
      if (n > 3) v.push(`S5 trucks: ${n} live rows exceed the Starter limit 3`)
      if (n !== 3) v.push(`S5 trucks: ${n} live rows, expected 3`)
      labels.push(`trucks[${tally(outs)}]`)
    }
    // staff invites: Starter = 2
    {
      const { agencyId, ownerId } = await freshAgency()
      await freshSub(agencyId, ownerId, 'active')
      const outs = await fireAll(open, ownerId, (c, i) => memberInvite(c, `s5-${i}-${randomUUID().slice(0, 8)}@race.example.com`, `s5-${randomUUID()}`), 8)
      v.push(...raisedViolations(outs).map((m) => `S5 staff ${m}`))
      if (count(outs, (o) => o.kind === 'ok') !== 2) v.push(`S5 staff expected exactly 2 successes, got ${tally(outs)}`)
      if (count(outs, (o) => o.kind === 'guard' && o.code === 'SB001') !== 6) v.push(`S5 staff expected 6x SB001, got ${tally(outs)}`)
      const seats = (await oneRow(
        `SELECT (SELECT count(*) FROM public.agency_memberships WHERE agency_id = $1 AND status = 'active')::int
              + (SELECT count(*) FROM public.agency_invitations WHERE agency_id = $1 AND status = 'pending' AND expires_at > now())::int AS n`, [agencyId])).n
      if (seats > 2) v.push(`S5 staff: ${seats} seats exceed the Starter limit 2`)
      labels.push(`staff[${tally(outs)}]`)
    }
    // order imports per month: Starter = 50; 46 already this month, two agreements of the same agency
    {
      const { agencyId, ownerId } = await freshAgency()
      await freshSub(agencyId, ownerId, 'active')
      const agrA = await freshAgreement(agencyId)
      const agrB = await freshAgreement(agencyId)
      await q(`INSERT INTO public.agency_orders (agency_id, agreement_id, client_order_ref) SELECT $1::uuid, $2::uuid, 'PRE-' || g || '-' || $3::text FROM generate_series(1, 46) g`, [agencyId, agrA, randomUUID()])
      const outs = await fireAll(open, ownerId, (c, i) => orderImport(c, i % 2 === 0 ? agrA : agrB, `S5-${randomUUID()}`, `hash-${randomUUID()}`, `s5-${randomUUID()}`), 8)
      v.push(...raisedViolations(outs).map((m) => `S5 imports ${m}`))
      if (count(outs, (o) => o.kind === 'ok') !== 4) v.push(`S5 imports expected exactly 4 successes (50 - 46), got ${tally(outs)}`)
      if (count(outs, (o) => o.kind === 'guard' && o.code === 'SB001') !== 4) v.push(`S5 imports expected 4x SB001, got ${tally(outs)}`)
      const n = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_orders WHERE agency_id = $1`, [agencyId])).n
      if (n > 50) v.push(`S5 imports: ${n} orders this month exceed the Starter limit 50`)
      labels.push(`imports[${tally(outs)}]`)
    }
  } finally {
    await setEnforcement(false)
  }
  return { label: labels.join(' '), violations: v }
}

async function s6(open) {
  const kinds = ['active_expiring', 'trial_expiring', 'grace_expiring']
  const agencies = []
  for (const kind of kinds) {
    const { agencyId, ownerId } = await freshAgency()
    const sub = await freshSub(agencyId, ownerId, kind)
    const order = await freshOrder(agencyId)
    agencies.push({ kind, agencyId, sub, order, pid: payId() })
  }
  const sweepers = Math.max(2, N - 3)
  const outs = await fireAll(open, null, (c, i) => (i < 3 ? activate(c, agencies[i].order.orderId, agencies[i].pid, agencies[i].order.amount) : sweep(c)), 3 + sweepers)
  const v = raisedViolations(outs)
  const acts = outs.slice(0, 3)
  const sweeps = outs.slice(3)
  if (count(acts, isRealOk) !== 3) v.push(`expected 3 real activations, got ${tally(acts)}`)
  if (sweeps.some((o) => !(o.kind === 'ok'))) v.push(`a sweep failed: ${tally(sweeps)}`)
  for (const a of agencies) {
    const rows = await rowsOf(`SELECT status, current_period_end, grace_end FROM public.subscriptions WHERE agency_id = $1`, [a.agencyId])
    if (rows.length !== 1) {
      v.push(`${a.kind}: ${rows.length} subscription rows, expected 1`)
      continue
    }
    const r = rows[0]
    if (r.status !== 'active') v.push(`${a.kind}: final status ${r.status} although the payment succeeded (activation clobbered by the sweep)`)
    if (new Date(r.current_period_end).getTime() < Date.now() + 25 * 86400e3) v.push(`${a.kind}: period end ${new Date(r.current_period_end).toISOString()} was not extended`)
    if (r.grace_end !== null && r.status === 'active') v.push(`${a.kind}: active but grace_end ${r.grace_end} not cleared`)
    const inv = await invoiceCount(a.agencyId)
    if (inv !== 1) v.push(`${a.kind}: invoices = ${inv}, expected 1`)
  }
  // a later sweep must change nothing for these agencies
  const again = await sweep({ query: (sql, p) => q(sql, p) })
  const still = await rowsOf(`SELECT status FROM public.subscriptions WHERE agency_id = ANY($1::uuid[])`, [agencies.map((a) => a.agencyId)])
  if (still.some((r) => r.status !== 'active')) v.push(`a follow-up sweep moved an activated subscription: ${JSON.stringify(still)} (${JSON.stringify(again)})`)
  return { label: `${tally(acts)} | ${tally(sweeps)}`, violations: v }
}

async function s7(open) {
  const v = []
  const labels = []
  // (a) same refund id in parallel
  {
    const { agencyId, ownerId } = await freshAgency()
    await freshSub(agencyId, ownerId, 'active')
    const { orderId, amount } = await freshOrder(agencyId)
    const pid = payId()
    const act = await activate({ query: (a, b) => q(a, b) }, orderId, pid, amount)
    if (!act.ok) throw new Error(`setup activation refused: ${JSON.stringify(act)}`)
    const rid = refundId()
    const part = Math.floor(amount / 3)
    const outs = await fireAll(open, null, (c) => refund(c, pid, rid, part))
    v.push(...raisedViolations(outs).map((m) => `S7a ${m}`))
    if (count(outs, isRealOk) !== 1) v.push(`S7a expected exactly one credit note, got ${tally(outs)}`)
    if (count(outs, (o) => o.kind === 'ok' && o.value.replay) !== N - 1) v.push(`S7a expected ${N - 1} replays, got ${tally(outs)}`)
    const cn = await rowsOf(`SELECT total_paise FROM public.subscription_credit_notes WHERE refund_id = $1`, [rid])
    if (cn.length !== 1 || Number(cn[0].total_paise) !== part) v.push(`S7a credit notes ${JSON.stringify(cn)}, expected one of ${part}`)
    labels.push(`same-id[${tally(outs)}]`)
  }
  // (b) different refund ids, each 40% of the invoice: only two fit
  {
    const { agencyId, ownerId } = await freshAgency()
    await freshSub(agencyId, ownerId, 'active')
    const { orderId, amount } = await freshOrder(agencyId)
    const pid = payId()
    const act = await activate({ query: (a, b) => q(a, b) }, orderId, pid, amount)
    if (!act.ok) throw new Error(`setup activation refused: ${JSON.stringify(act)}`)
    const total = Number((await oneRow(`SELECT total_paise FROM public.subscription_invoices WHERE id = $1`, [act.invoice_id])).total_paise)
    const part = Math.floor((total * 40) / 100)
    const rids = Array.from({ length: N }, refundId)
    const outs = await fireAll(open, null, (c, i) => refund(c, pid, rids[i], part))
    v.push(...raisedViolations(outs).map((m) => `S7b ${m}`))
    const fit = Math.floor(total / part)
    if (count(outs, isRealOk) !== fit) v.push(`S7b expected exactly ${fit} credit notes, got ${tally(outs)}`)
    if (outs.some((o) => o.kind === 'typed' && o.code !== 'refund_exceeds_payment')) v.push(`S7b unexpected typed error: ${tally(outs)}`)
    const credited = Number((await oneRow(`SELECT coalesce(sum(total_paise), 0)::bigint AS s FROM public.subscription_credit_notes WHERE invoice_id = $1`, [act.invoice_id])).s)
    if (credited > total) v.push(`S7b credited ${credited} exceeds invoice ${total}`)
    if (credited !== fit * part) v.push(`S7b credited ${credited} != ${fit} x ${part}`)
    const exc = (await oneRow(`SELECT count(*)::int AS n FROM public.subscription_refund_exceptions WHERE refund_id = ANY($1::text[])`, [rids])).n
    if (exc !== N - fit) v.push(`S7b refund exceptions = ${exc}, expected ${N - fit} (every refused refund must be kept)`)
    labels.push(`diff-ids[${tally(outs)}]`)
  }
  // (c) a full refund of payment 1 racing a SECOND activation (another order of the same agency)
  {
    const { agencyId, ownerId } = await freshAgency()
    await freshSub(agencyId, ownerId, 'active')
    const o1 = await freshOrder(agencyId)
    const p1 = payId()
    const act = await activate({ query: (a, b) => q(a, b) }, o1.orderId, p1, o1.amount)
    if (!act.ok) throw new Error(`setup activation refused: ${JSON.stringify(act)}`)
    const total = Number((await oneRow(`SELECT total_paise FROM public.subscription_invoices WHERE id = $1`, [act.invoice_id])).total_paise)
    const o2 = await freshOrder(agencyId)
    const p2 = payId()
    const rid = refundId()
    const outs = await fireAll(open, null, (c, i) => (i % 2 === 0 ? refund(c, p1, rid, total) : activate(c, o2.orderId, p2, o2.amount)))
    v.push(...raisedViolations(outs).map((m) => `S7c ${m}`))
    const refunds = outs.filter((_, i) => i % 2 === 0)
    const acts = outs.filter((_, i) => i % 2 === 1)
    if (count(refunds, isRealOk) !== 1) v.push(`S7c expected exactly one credit note, got ${tally(refunds)}`)
    const realActs = count(acts, isRealOk)
    if (realActs > 1) v.push(`S7c second order activated ${realActs} times: ${tally(acts)}`)
    if (acts.some((o) => o.kind === 'typed' && o.code !== 'subscription_cancelled')) v.push(`S7c unexpected activation refusal: ${tally(acts)}`)
    const cnRows = (await oneRow(`SELECT count(*)::int AS n FROM public.subscription_credit_notes WHERE invoice_id = $1`, [act.invoice_id])).n
    if (cnRows !== 1) v.push(`S7c credit notes on invoice 1 = ${cnRows}, expected 1`)
    const pay2 = await oneRow(`SELECT status FROM public.payment_history WHERE razorpay_order_id = $1`, [o2.orderId])
    const subRow = await oneRow(`SELECT status FROM public.subscriptions WHERE agency_id = $1 ORDER BY created_at DESC LIMIT 1`, [agencyId])
    if (pay2.status === 'success' && subRow.status === 'cancelled') v.push('S7c the second payment is invoiced and successful but the subscription it paid for is cancelled')
    if (pay2.status !== 'success' && subRow.status !== 'cancelled') v.push(`S7c the second payment was refused (${pay2.status}) yet the subscription stayed ${subRow.status}`)
    const inv2 = await invoiceCount(agencyId)
    if (inv2 !== (pay2.status === 'success' ? 2 : 1)) v.push(`S7c invoices = ${inv2} for second payment status ${pay2.status}`)
    labels.push(`vs-activation[${tally(refunds)} | ${tally(acts)}]`)
  }
  v.push(...(await ledgerViolations()).map((m) => `S7 ledger: ${m}`))
  return { label: labels.join(' '), violations: v }
}

async function s8(open) {
  const { agencyId, ownerId } = await freshAgency()
  await freshSub(agencyId, ownerId, 'active')
  const drv = await freshDriver(agencyId)
  const vehicleId = await freshTruck(agencyId)
  const { jobId, offerId } = await freshJobWithOffer(agencyId, drv.driverId)
  const version = (await oneRow(`SELECT version FROM public.agency_trucks WHERE id = $1`, [vehicleId])).version
  const start = new Date(Date.now() + 86400e3).toISOString()
  const end = new Date(Date.now() + 2 * 86400e3).toISOString()
  await setEnforcement(true)
  let outs
  try {
    outs = await fireAll(open, ownerId, (c, i) =>
      i % 2 === 0
        ? assignDriver(c, jobId, drv.driverId)
        : reserveFleet(c, { jobId, offerId, vehicleId, employmentId: drv.employmentId, start, end, version, key: `s8-${randomUUID()}` })
    )
  } finally {
    await setEnforcement(false)
  }
  const v = raisedViolations(outs)
  const assigns = outs.filter((_, i) => i % 2 === 0)
  const reserves = outs.filter((_, i) => i % 2 === 1)
  const active = (await oneRow(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_job_id = $1 AND status = 'active'`, [jobId])).n
  if (active > 1) v.push(`${active} active reservations for one job`)
  const job = await oneRow(`SELECT driver_id FROM public.agency_jobs WHERE id = $1`, [jobId])
  if (job.driver_id !== null && job.driver_id !== drv.driverId) v.push(`job driver ${job.driver_id} is not the assigned driver`)
  if (count(assigns, (o) => o.kind === 'ok') + count(reserves, (o) => o.kind === 'ok') < 1) v.push(`nothing succeeded: ${tally(outs)}`)
  return { label: `assign[${tally(assigns)}] reserve[${tally(reserves)}]`, violations: v }
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
async function runScenario(id, title, iterate) {
  const dist = new Map()
  const violations = []
  for (let i = 0; i < ITERATIONS; i++) {
    const conns = []
    const open = async (userId) => {
      const c = await s.connect(userId)
      conns.push(c)
      return c
    }
    try {
      const { label, violations: found } = await iterate(open)
      dist.set(label, (dist.get(label) ?? 0) + 1)
      for (const m of found) violations.push({ iteration: i + 1, message: m })
    } catch (error) {
      violations.push({ iteration: i + 1, message: `harness error: ${firstLine(error)}` })
    } finally {
      await Promise.allSettled(conns.map((c) => c.close()))
    }
  }
  const pass = violations.length === 0
  console.log(`\n[${id}] ${title}  (${N} parallel connections x ${ITERATIONS} iterations)`)
  for (const [label, n] of [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(`  ${String(n).padStart(3)}  ${label}`)
  console.log(`  invariant violations: ${violations.length}`)
  for (const x of violations.slice(0, 6)) console.log(`    - iteration ${x.iteration}: ${x.message}`)
  if (violations.length > 6) console.log(`    ... ${violations.length - 6} more`)
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id}`)
  return pass
}

const SCENARIOS = [
  ['S1', 'activate_payment: same order + same payment id, one activation and invoice, period extended once', s1],
  ['S2', 'activate_payment: same order, different payment ids, one success, rest order_already_paid', s2],
  ['S3', 'webhook_process: same event id; captured + order.paid; refund under two event ids, one effect', s3],
  ['S4', 'invoice numbers: unique and gap-free across commits, rollbacks and many orders of one agency', s4],
  ['S5', 'guard (enforcement ON): trucks 3, staff 2, orders per month 50, never over the limit', s5],
  ['S6', 'activation vs run_subscription_sweeps: consistent final state, no 40P01', s6],
  ['S7', 'record_refund: same refund id, different refund ids, refund vs second activation', s7],
  ['S8', 'deadlock probe: agency_job_assign_driver vs reserve_fleet_assignment, enforcement ON', s8],
]

const t0 = Date.now()
s = await startServer('subscription')
q = (sql, params) => s.admin.query(sql, params)
rowsOf = async (sql, params) => (await q(sql, params)).rows
oneRow = async (sql, params) => (await rowsOf(sql, params))[0]

let exitCode = 0
try {
  console.log(`real PostgreSQL ${s.version}: ${s.files} migrations replayed; ${N} parallel x ${ITERATIONS} iterations`)
  await setBilling(false)
  const cust = await createCustomer()
  customerId = cust.id
  customerUserId = cust.userId
  const results = []
  for (const [id, title, fn] of SCENARIOS) results.push([id, await runScenario(id, title, fn)])
  const failed = results.filter(([, ok]) => !ok).map(([id]) => id)
  console.log(`\n${failed.length === 0 ? 'ALL PASS' : `FAILED: ${failed.join(', ')}`} (${results.length} scenarios, ${Math.round((Date.now() - t0) / 1000)}s)`)
  if (failed.length > 0) exitCode = 1
} catch (error) {
  console.error(`FAIL: ${firstLine(error)}`)
  exitCode = 1
} finally {
  await s.stop()
}
process.exit(exitCode)
