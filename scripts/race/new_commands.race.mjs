#!/usr/bin/env node
/**
 * Concurrency battery on REAL PostgreSQL for the TO-145..151 commands (consignments, invoices,
 * fuel fills, payroll close, ERP ingest, tracking pings).
 *
 * Same harness as postgres_race.test.mjs: embedded server, full supabase/migrations chain,
 * N independent connections (own backend each) fired at the same moment after a warm-up round
 * trip. Every iteration builds a FRESH agency, so iterations never interfere and gap-free
 * numbering can be asserted from 1. A raised database error (anything not returned as a typed
 * { ok:false, error } result, in particular a raw 23505) is always an invariant violation.
 *
 * Scenarios:
 *   R1 consignment_create, N different orders   GR numbers unique and gap-free 000001..N
 *   R2 consignment_event, same expected_version one wins, the rest version_conflict
 *   R3 same idempotency key, different targets  typed error or replay, never a raw error
 *      (R3a events on N consignments, R3b creates for N orders)
 *   R4 invoice_issue, N different keys          unique gap-free invoice numbers
 *   R5 invoice_record_payment, over-subscribed  paid <= total, paid_paise = sum(payments)
 *   R6 fuel_fill_record, rising odometers       no equal or decreasing odometer accepted
 *   R7 erp_event_ingest, same external event id exactly one batch
 *   R8 payroll_close_period, same dates         exactly one closed period and one set of lines
 *      (R8a different keys, R8b same key)
 *   R9 tracking_ping_record, same (job, time)   exactly one row
 *
 * Usage:  node scripts/race/new_commands.race.mjs     (RACE_MODULES must point at the folder
 *         RACE_ITERATIONS=3 RACE_PARALLEL=8 node scripts/race/new_commands.race.mjs      with embedded-postgres + pg)
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

let counter = 0
const next = () => ++counter
const firstLine = (e) => String((e && e.message) || e).split('\n')[0].trim()
const parseJson = (v) => (typeof v === 'string' ? JSON.parse(v) : v)

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
  const userId = await createUser('nc-agency')
  const k = next()
  const id = randomUUID()
  await q(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', 'approved', $4, $5)`,
    [id, userId, `NC ${k} Transport Pvt Ltd`, `07ABCDE${1000 + k}A1Z5`, `ABCDE${4000 + k}Q`]
  )
  return { agencyId: id, ownerId: userId }
}

async function createCustomer() {
  const userId = await createUser('nc-cust')
  const k = next()
  const id = randomUUID()
  await q(
    `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, gst_number, pan_number, created_by)
     VALUES ($1, $2, $3, $4, 'Race Street', 'Delhi', 'Delhi', '110001', $5, $6, $7)`,
    [id, `NC Cust ${k} Pvt Ltd`, `9${String(k).padStart(9, '0')}`, `nc-cust-${k}@race.example.com`, `ABCDE${1000 + k}F`, `FGHIJ${2000 + k}K`, userId]
  )
  return { id, userId }
}

async function freshAgreement(agencyId) {
  const id = randomUUID()
  await q(`INSERT INTO public.agency_client_agreements (id, agency_id, client_name, idempotency_key) VALUES ($1, $2, $3, $4)`, [
    id, agencyId, `Client ${next()}`, `agr-${randomUUID()}`,
  ])
  return id
}

async function freshSite(agencyId, agreementId, label) {
  await q(
    `INSERT INTO public.agency_client_sites (agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, idempotency_key)
     VALUES ($1, $2, 'ship_to', $3, '1 Race Road', 'Delhi', 'Delhi', '110001', $4)`,
    [agencyId, agreementId, label, `site-${randomUUID()}`]
  )
}

async function freshOrder(agencyId, agreementId) {
  const id = randomUUID()
  await q(`INSERT INTO public.agency_orders (id, agency_id, agreement_id, client_order_ref) VALUES ($1, $2, $3, $4)`, [id, agencyId, agreementId, `ORD-${randomUUID()}`])
  return id
}

async function freshTruck(agencyId) {
  const id = randomUUID()
  await q(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, is_available,
       insurance_expiry, fitness_expiry, permit_expiry, puc_expiry)
     VALUES ($1, $2, 'eicher_14ft', $3, true, '2030-01-01', '2030-01-01', '2030-01-01', '2030-01-01')`,
    [id, agencyId, `RC-NC-${next()}`]
  )
  return id
}

async function freshDriver(agencyId) {
  const k = next()
  const userId = await createUser('nc-drv')
  const driverId = randomUUID()
  await q(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', 'approved', true, 'ABCDE1234F')`,
    [driverId, userId, `NC Driver ${k}`, `8${String(k).padStart(9, '0')}`]
  )
  await q(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, licence_number, licence_class, licence_expiry, status)
     VALUES ($1, $2, $3, $4, 'HGV', '2030-01-01', 'active')`,
    [randomUUID(), agencyId, driverId, `DL-NC-${k}`]
  )
  return { userId, driverId }
}

/** Accepted agency job already assigned to the driver (ping target). */
async function freshAssignedJob(agencyId, driverId) {
  const k = next()
  const shipmentId = randomUUID()
  await q(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [shipmentId, `NC-${k}-${Date.now()}`, customerId, customerUserId]
  )
  const jobId = randomUUID()
  await q(`INSERT INTO public.agency_jobs (id, agency_id, shipment_id, driver_id, fare, status) VALUES ($1, $2, $3, $4, 15000, 'accepted')`, [jobId, agencyId, shipmentId, driverId])
  return jobId
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------
const call = async (conn, sql, params) => parseJson((await conn.query(sql, params)).rows[0].r)

const consignmentCreate = (c, orderId, key) => call(c, `SELECT public.agency_consignment_create($1::uuid, $2::text) AS r`, [orderId, key])
const consignmentEvent = (c, id, event, version, key) =>
  call(c, `SELECT public.agency_consignment_event($1::uuid, $2::text, $3::integer, $4::text, NULL) AS r`, [id, event, version, key])
const invoiceIssue = (c, clientId, key) =>
  call(c, `SELECT public.agency_invoice_issue($1::uuid, $2::jsonb, '07', '07', 0, false, false, $3::text) AS r`, [
    clientId, JSON.stringify([{ description: 'Freight', quantity: 1, rate_paise: 100000 }]), key,
  ])
const invoicePay = (c, id, amount, version, key) =>
  call(c, `SELECT public.agency_invoice_record_payment($1::uuid, $2::bigint, 'bank', NULL, (now() AT TIME ZONE 'Asia/Kolkata')::date, $3::integer, $4::text) AS r`, [id, amount, version, key])
const fuelFill = (c, truckId, odo, filledOn, key) =>
  call(c, `SELECT public.agency_fuel_fill_record($1::uuid, $2::numeric, 50, true, 500000, $3::date, $4::text) AS r`, [truckId, odo, filledOn, key])
const payrollClose = (c, start, end, key) => call(c, `SELECT public.agency_payroll_close_period($1::date, $2::date, $3::text) AS r`, [start, end, key])
const erpIngest = (c, connectionId, secret, eventId, lines) =>
  call(c, `SELECT public.erp_event_ingest($1::uuid, $2::text, $3::text, $4::jsonb) AS r`, [connectionId, secret, eventId, JSON.stringify(lines)])
const pingRecord = (c, jobId, lat, at) => call(c, `SELECT public.tracking_ping_record($1::uuid, $2::numeric, 77.1, 40, $3::timestamptz) AS r`, [jobId, lat, at])

/** ok | typed (ok:false with error code) | raised (a database error escaped) */
function classify(settled) {
  if (settled.status === 'fulfilled') {
    const v = settled.value
    if (v && v.ok === true) return { kind: 'ok', value: v, code: null, label: v.replay ? 'ok:replay' : `ok:${v.state ?? v.outcome ?? 'done'}` }
    const code = v && v.error ? v.error : 'no_error_code'
    return { kind: 'typed', value: v, code, label: `typed:${code}` }
  }
  const e = settled.reason
  return { kind: 'raised', value: null, code: e && e.code, label: `RAISED:${e && e.code ? e.code + ' ' : ''}${firstLine(e)}` }
}

/** Opens N connections, warms them, then fires fn(conn, i) on all of them at once. */
async function fireAll(open, userId, fn, count = N) {
  const conns = []
  for (let i = 0; i < count; i++) conns.push(await open(userId))
  await Promise.all(conns.map((c) => c.query('SELECT 1')))
  const settled = await Promise.allSettled(conns.map((c, i) => fn(c, i)))
  return settled.map(classify)
}

function raisedViolations(outs) {
  return outs.filter((o) => o.kind === 'raised').map((o) => `database error escaped: ${o.label}`)
}

const tally = (outs) => [...outs.reduce((m, o) => m.set(o.label, (m.get(o.label) ?? 0) + 1), new Map())].map(([l, n]) => `${n}x ${l}`).sort().join(', ')
const dateOffset = (days) => new Date(Date.now() + days * 86400e3).toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Scenarios: each returns { label, violations }
// ---------------------------------------------------------------------------
async function r1(open) {
  const { agencyId, ownerId } = await freshAgency()
  const agr = await freshAgreement(agencyId)
  const orders = []
  for (let i = 0; i < N; i++) orders.push(await freshOrder(agencyId, agr))
  const outs = await fireAll(open, ownerId, (c, i) => consignmentCreate(c, orders[i], `r1-${randomUUID()}`))
  const v = raisedViolations(outs)
  const okCount = outs.filter((o) => o.kind === 'ok' && !o.value.replay).length
  if (okCount !== N) v.push(`expected ${N} created, got ${tally(outs)}`)
  const rows = await rowsOf(`SELECT gr_number FROM public.agency_consignments WHERE agency_id = $1`, [agencyId])
  const seqs = rows.map((r) => Number(r.gr_number.split('/').pop())).sort((a, b) => a - b)
  if (new Set(rows.map((r) => r.gr_number)).size !== rows.length) v.push('duplicate GR numbers')
  if (seqs.length !== N || seqs.some((x, i) => x !== i + 1)) v.push(`GR sequence not gap-free 1..${N}: ${seqs.join(',')}`)
  const last = (await oneRow(`SELECT last_seq FROM public.agency_gr_sequences WHERE agency_id = $1`, [agencyId]))?.last_seq
  if (last !== N) v.push(`agency_gr_sequences.last_seq = ${last}, expected ${N}`)
  return { label: tally(outs), violations: v }
}

async function r2(open) {
  const { agencyId, ownerId } = await freshAgency()
  const agr = await freshAgreement(agencyId)
  const order = await freshOrder(agencyId, agr)
  const setup = await open(ownerId)
  const created = await consignmentCreate(setup, order, `r2-c-${randomUUID()}`)
  const cid = created.consignment_id
  const outs = await fireAll(open, ownerId, (c) => consignmentEvent(c, cid, 'pickup_scanned', 1, `r2-${randomUUID()}`))
  const v = raisedViolations(outs)
  const wins = outs.filter((o) => o.kind === 'ok')
  if (wins.length !== 1) v.push(`expected exactly one winner, got ${tally(outs)}`)
  const losers = outs.filter((o) => o.kind !== 'ok')
  if (losers.some((o) => !(o.kind === 'typed' && o.code === 'version_conflict'))) v.push(`losers must all be version_conflict: ${tally(outs)}`)
  const row = await oneRow(`SELECT status, version FROM public.agency_consignments WHERE id = $1`, [cid])
  if (row.status !== 'picked_up' || row.version !== 2) v.push(`consignment ended ${row.status} v${row.version}, expected picked_up v2`)
  const ev = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_consignment_events WHERE consignment_id = $1`, [cid])).n
  if (ev !== 2) v.push(`event rows = ${ev}, expected 2 (created + one pickup)`)
  return { label: tally(outs), violations: v }
}

async function r3(open) {
  const v = []
  const labels = []
  // R3a: same key, same event, N different consignments
  {
    const { agencyId, ownerId } = await freshAgency()
    const agr = await freshAgreement(agencyId)
    const setup = await open(ownerId)
    const ids = []
    for (let i = 0; i < N; i++) ids.push((await consignmentCreate(setup, await freshOrder(agencyId, agr), `r3a-c-${randomUUID()}`)).consignment_id)
    const key = `r3a-${randomUUID()}`
    const outs = await fireAll(open, ownerId, (c, i) => consignmentEvent(c, ids[i], 'pickup_scanned', 1, key))
    v.push(...raisedViolations(outs).map((m) => `R3a ${m}`))
    const oks = outs.filter((o) => o.kind === 'ok' && !o.value.replay).length
    if (oks !== 1) v.push(`R3a expected exactly one real success, got ${tally(outs)}`)
    if (outs.some((o) => o.kind === 'typed' && o.code !== 'idempotency_key_reused')) v.push(`R3a unexpected typed error: ${tally(outs)}`)
    const n = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_consignment_events WHERE agency_id = $1 AND idempotency_key = $2`, [agencyId, key])).n
    if (n !== 1) v.push(`R3a event rows for the key = ${n}, expected 1`)
    labels.push(`events[${tally(outs)}]`)
  }
  // R3b: same key, N different orders
  {
    const { agencyId, ownerId } = await freshAgency()
    const agr = await freshAgreement(agencyId)
    const orders = []
    for (let i = 0; i < N; i++) orders.push(await freshOrder(agencyId, agr))
    const key = `r3b-${randomUUID()}`
    const outs = await fireAll(open, ownerId, (c, i) => consignmentCreate(c, orders[i], key))
    v.push(...raisedViolations(outs).map((m) => `R3b ${m}`))
    const oks = outs.filter((o) => o.kind === 'ok' && !o.value.replay).length
    if (oks !== 1) v.push(`R3b expected exactly one real success, got ${tally(outs)}`)
    if (outs.some((o) => o.kind === 'typed' && o.code !== 'idempotency_key_reused')) v.push(`R3b unexpected typed error: ${tally(outs)}`)
    const n = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_consignments WHERE agency_id = $1`, [agencyId])).n
    if (n !== 1) v.push(`R3b consignment rows = ${n}, expected 1`)
    labels.push(`creates[${tally(outs)}]`)
  }
  return { label: labels.join(' '), violations: v }
}

async function r4(open) {
  const { agencyId, ownerId } = await freshAgency()
  const agr = await freshAgreement(agencyId)
  const results = await fireAll(open, ownerId, (c) => invoiceIssue(c, agr, `r4-${randomUUID()}`))
  const v = raisedViolations(results)
  const okCount = results.filter((o) => o.kind === 'ok' && !o.value.replay).length
  if (okCount !== N) v.push(`expected ${N} issued, got ${tally(results)}`)
  const rows = await rowsOf(`SELECT invoice_number FROM public.agency_invoices WHERE agency_id = $1`, [agencyId])
  if (new Set(rows.map((r) => r.invoice_number)).size !== rows.length) v.push('duplicate invoice numbers')
  const seqs = rows.map((r) => Number(String(r.invoice_number).match(/(\d+)$/)?.[1])).sort((a, b) => a - b)
  if (seqs.length !== N || seqs.some((x, i) => x !== i + 1)) v.push(`invoice numbers not gap-free 1..${N}: ${rows.map((r) => r.invoice_number).join(',')}`)
  const last = (await oneRow(`SELECT last_seq FROM public.agency_invoice_sequences WHERE agency_id = $1`, [agencyId]))?.last_seq
  if (last !== N) v.push(`agency_invoice_sequences.last_seq = ${last}, expected ${N}`)
  return { label: tally(results), violations: v }
}

async function r5(open) {
  const { agencyId, ownerId } = await freshAgency()
  const agr = await freshAgreement(agencyId)
  const setup = await open(ownerId)
  const issued = await invoiceIssue(setup, agr, `r5-i-${randomUUID()}`)
  const invoiceId = issued.invoice_id
  const total = Number((await oneRow(`SELECT total_paise FROM public.agency_invoices WHERE id = $1`, [invoiceId])).total_paise)
  // payments of 40% of the total: only two fit; every worker retries version conflicts the way a client would
  const amount = Math.floor((total * 40) / 100)
  const outs = await fireAll(open, ownerId, async (c) => {
    let version = 1
    for (let attempt = 0; attempt < N + 4; attempt++) {
      const r = await invoicePay(c, invoiceId, amount, version, `r5-${randomUUID()}`)
      if (r.ok === false && r.error === 'version_conflict') {
        version = r.current_version
        continue
      }
      return r
    }
    return { ok: false, error: 'retry_exhausted' }
  })
  const v = raisedViolations(outs)
  const oks = outs.filter((o) => o.kind === 'ok').length
  const maxFit = Math.floor(total / amount)
  if (oks !== maxFit) v.push(`expected exactly ${maxFit} accepted payments, got ${tally(outs)}`)
  if (outs.some((o) => o.kind === 'typed' && o.code !== 'overpayment')) v.push(`unexpected typed error: ${tally(outs)}`)
  const inv = await oneRow(`SELECT paid_paise, total_paise, status FROM public.agency_invoices WHERE id = $1`, [invoiceId])
  const sum = Number((await oneRow(`SELECT coalesce(sum(amount_paise), 0)::bigint AS s FROM public.agency_invoice_payments WHERE invoice_id = $1`, [invoiceId])).s)
  if (Number(inv.paid_paise) > Number(inv.total_paise)) v.push(`paid ${inv.paid_paise} exceeds total ${inv.total_paise}`)
  if (Number(inv.paid_paise) !== sum) v.push(`paid_paise ${inv.paid_paise} != sum(payments) ${sum}`)
  return { label: tally(outs), violations: v }
}

async function r6(open) {
  const { agencyId, ownerId } = await freshAgency()
  const truckId = await freshTruck(agencyId)
  const filledOn = dateOffset(-2)
  // 8 distinct rising values (1000..1700) plus 2 extra duplicates of 1300, all fired at once for ONE truck.
  // Lock order is random, so which values are accepted varies per round: only the invariants are fixed.
  const values = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1300, 1300]
  const outs = await fireAll(open, ownerId, (c, i) => fuelFill(c, truckId, values[i], filledOn, `r6-${randomUUID()}`), values.length)
  const v = raisedViolations(outs)
  const acceptedIdx = outs.map((o, i) => (o.kind === 'ok' && !o.value.replay ? i : -1)).filter((i) => i >= 0)
  const acceptedVals = acceptedIdx.map((i) => values[i])
  if (acceptedIdx.length < 1 || acceptedIdx.length > 8) v.push(`accepted count ${acceptedIdx.length} outside 1..8 (${tally(outs)})`)
  if (outs.some((o) => o.kind === 'ok' && o.value.replay)) v.push(`unexpected replay with unique keys: ${tally(outs)}`)
  if (outs.some((o) => o.kind === 'typed' && o.code !== 'odometer_not_increasing')) v.push(`unexpected typed error: ${tally(outs)}`)
  // heap order of a fresh, append-only table is insertion (commit-serialised) order
  const rows = await rowsOf(`SELECT odometer_km FROM public.agency_fuel_fills WHERE truck_id = $1 ORDER BY ctid`, [truckId])
  const odos = rows.map((r) => Number(r.odometer_km))
  if (odos.length !== acceptedIdx.length) v.push(`fill rows ${odos.length} != accepted ${acceptedIdx.length}`)
  for (let i = 1; i < odos.length; i++) {
    if (odos[i] <= odos[i - 1]) v.push(`stored odometer ${odos[i]} after ${odos[i - 1]} (not strictly increasing in creation order)`)
  }
  if (new Set(odos).size !== odos.length) v.push(`duplicate odometer stored: ${odos.join(',')}`)
  // every stored row must be one of the accepted values, and together they are the same multiset
  if ([...odos].sort((x, y) => x - y).join(',') !== [...acceptedVals].sort((x, y) => x - y).join(',')) {
    v.push(`stored odometers ${odos.join(',')} differ from accepted values ${acceptedVals.join(',')}`)
  }
  // strictly increasing creation order above means each accepted fill exceeded all earlier accepted ones
  const maxStored = (await oneRow(`SELECT max(odometer_km) AS m FROM public.agency_fuel_fills WHERE truck_id = $1`, [truckId])).m
  const maxAccepted = acceptedVals.length ? Math.max(...acceptedVals) : null
  if (maxAccepted === null || Number(maxStored) !== maxAccepted) v.push(`final max odometer ${maxStored} != max accepted ${maxAccepted}`)
  // a rejected fill with a value above the final max would mean a valid fill was refused
  for (let i = 0; i < values.length; i++) {
    if (outs[i].kind === 'typed' && maxAccepted !== null && values[i] > maxAccepted) v.push(`value ${values[i]} rejected although above final max ${maxAccepted}`)
  }
  return { label: `${acceptedIdx.length} accepted [${odos.join(',')}]`, violations: v }
}

async function r7(open) {
  const { agencyId } = await freshAgency()
  const agr = await freshAgreement(agencyId)
  await freshSite(agencyId, agr, 'Plant A')
  await freshSite(agencyId, agr, 'Plant B')
  const secret = `erpk_${randomUUID().replace(/-/g, '')}`
  const connectionId = randomUUID()
  await q(
    `INSERT INTO public.agency_erp_connections (id, agency_id, client_id, agreement_id, name, kind, secret_hash, secret_hint, idempotency_key)
     VALUES ($1, $2, $3, $3, 'race feed', 'webhook', $4, 'erpk_...', $5)`,
    [connectionId, agencyId, agr, createHash('sha256').update(secret).digest('hex'), `erp-${randomUUID()}`]
  )
  const eventId = `EVT-${randomUUID()}`
  const lines = [
    { client_order_ref: `R7-${randomUUID()}`, line_no: 1, sku: 'SKU-1', quantity: 5, unit: 'piece', pickup_site: 'Plant A', drop_site: 'Plant B' },
    { client_order_ref: `R7-${randomUUID()}`, line_no: 1, sku: 'SKU-2', quantity: 2, unit: 'carton', pickup_site: 'Plant A', drop_site: 'Plant B' },
  ]
  const outs = await fireAll(open, null, (c) => erpIngest(c, connectionId, secret, eventId, lines))
  const v = raisedViolations(outs)
  const accepted = outs.filter((o) => o.kind === 'ok' && o.value.outcome === 'accepted').length
  const dup = outs.filter((o) => o.kind === 'ok' && o.value.outcome === 'duplicate').length
  if (accepted !== 1 || dup !== N - 1) v.push(`expected 1 accepted + ${N - 1} duplicate, got ${tally(outs)}`)
  const batches = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_order_batches WHERE agency_id = $1`, [agencyId])).n
  const events = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_erp_events WHERE connection_id = $1`, [connectionId])).n
  const orders = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_orders WHERE agency_id = $1`, [agencyId])).n
  if (batches !== 1) v.push(`order batches = ${batches}, expected 1`)
  if (events !== 1) v.push(`erp events = ${events}, expected 1`)
  if (orders !== 2) v.push(`orders = ${orders}, expected 2`)
  const batchIds = new Set(outs.filter((o) => o.kind === 'ok').map((o) => o.value.batch_id))
  if (batchIds.size !== 1) v.push(`responses reference ${batchIds.size} different batch ids`)
  return { label: tally(outs), violations: v }
}

async function r8(open) {
  const v = []
  const labels = []
  const start = dateOffset(-40)
  const end = dateOffset(-10)
  for (const mode of ['different keys', 'same key']) {
    const { agencyId, ownerId } = await freshAgency()
    await freshDriver(agencyId)
    await freshDriver(agencyId)
    const sharedKey = `r8-${randomUUID()}`
    const outs = await fireAll(open, ownerId, (c) => payrollClose(c, start, end, mode === 'same key' ? sharedKey : `r8-${randomUUID()}`))
    v.push(...raisedViolations(outs).map((m) => `R8 (${mode}) ${m}`))
    const real = outs.filter((o) => o.kind === 'ok' && !o.value.replay).length
    if (real !== 1) v.push(`R8 (${mode}) expected exactly one real close, got ${tally(outs)}`)
    const allowed = mode === 'same key' ? (o) => o.kind === 'ok' : (o) => o.kind === 'ok' || (o.kind === 'typed' && o.code === 'already_closed')
    if (!outs.every(allowed)) v.push(`R8 (${mode}) unexpected outcome: ${tally(outs)}`)
    const periods = await rowsOf(`SELECT id, status FROM public.agency_payroll_periods WHERE agency_id = $1`, [agencyId])
    if (periods.length !== 1 || periods[0].status !== 'closed') v.push(`R8 (${mode}) periods = ${JSON.stringify(periods)}, expected one closed`)
    const lines = (await oneRow(`SELECT count(*)::int AS n, count(DISTINCT driver_id)::int AS d FROM public.agency_payroll_lines WHERE agency_id = $1`, [agencyId]))
    if (lines.n !== 2 || lines.d !== 2) v.push(`R8 (${mode}) payroll lines = ${lines.n} (${lines.d} distinct drivers), expected 2 and 2`)
    labels.push(`${mode}[${tally(outs)}]`)
  }
  return { label: labels.join(' '), violations: v }
}

async function r9(open) {
  const { agencyId } = await freshAgency()
  const drv = await freshDriver(agencyId)
  const jobId = await freshAssignedJob(agencyId, drv.driverId)
  const at = new Date(Date.now() - 60e3).toISOString()
  // even workers send one position, odd workers another: same instant, so the loser is a replay or ping_conflict
  const outs = await fireAll(open, drv.userId, (c, i) => pingRecord(c, jobId, i % 2 === 0 ? 28.5 : 28.6, at))
  const v = raisedViolations(outs)
  const created = outs.filter((o) => o.kind === 'ok' && !o.value.replay).length
  if (created !== 1) v.push(`expected exactly one created ping, got ${tally(outs)}`)
  if (outs.some((o) => o.kind === 'typed' && o.code !== 'ping_conflict')) v.push(`unexpected typed error: ${tally(outs)}`)
  const rows = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_tracking_pings WHERE job_id = $1 AND recorded_at = $2::timestamptz`, [jobId, at])).n
  if (rows !== 1) v.push(`ping rows for (job, recorded_at) = ${rows}, expected 1`)
  return { label: tally(outs), violations: v }
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
  for (const [label, count] of [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) console.log(`  ${String(count).padStart(3)}  ${label}`)
  console.log(`  invariant violations: ${violations.length}`)
  for (const x of violations.slice(0, 5)) console.log(`    - iteration ${x.iteration}: ${x.message}`)
  if (violations.length > 5) console.log(`    ... ${violations.length - 5} more`)
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id}`)
  return pass
}

const SCENARIOS = [
  ['R1', 'consignment_create: different orders, GR numbers unique and gap-free', r1],
  ['R2', 'consignment_event: same expected_version, exactly one wins', r2],
  ['R3', 'same idempotency key on different targets: typed error or replay, no raw 23505', r3],
  ['R4', 'invoice_issue: unique gap-free invoice numbers', r4],
  ['R5', 'invoice_record_payment: over-subscribed invoice, paid <= total and = sum(payments)', r5],
  ['R6', 'fuel_fill_record: rising odometer values, no equal or decreasing accepted', r6],
  ['R7', 'erp_event_ingest: same external event id, exactly one batch', r7],
  ['R8', 'payroll_close_period: same dates, one closed period and one set of lines', r8],
  ['R9', 'tracking_ping_record: same (job, recorded_at), one row', r9],
]

s = await startServer('newcmd')
q = (sql, params) => s.admin.query(sql, params)
rowsOf = async (sql, params) => (await q(sql, params)).rows
oneRow = async (sql, params) => (await rowsOf(sql, params))[0]

let exitCode = 0
try {
  console.log(`real PostgreSQL ${s.version}: ${s.files} migrations replayed; ${N} parallel x ${ITERATIONS} iterations`)
  const cust = await createCustomer()
  customerId = cust.id
  customerUserId = cust.userId
  const results = []
  for (const [id, title, fn] of SCENARIOS) results.push([id, await runScenario(id, title, fn)])
  const failed = results.filter(([, ok]) => !ok).map(([id]) => id)
  console.log(`\n${failed.length === 0 ? 'ALL PASS' : `FAILED: ${failed.join(', ')}`} (${results.length} scenarios)`)
  if (failed.length > 0) exitCode = 1
} catch (error) {
  console.error(`FAIL: ${firstLine(error)}`)
  exitCode = 1
} finally {
  await s.stop()
}
process.exit(exitCode)
