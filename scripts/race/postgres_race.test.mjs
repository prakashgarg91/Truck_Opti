#!/usr/bin/env node
/**
 * Concurrency battery on REAL PostgreSQL (embedded server, full supabase/migrations chain).
 *
 * Unlike the PGlite batteries (single session, no races), every iteration here fires two
 * business calls at the same moment from two INDEPENDENT connections (own backend each),
 * with an optional 0-3 ms jitter on one side. Fixtures are built through the superuser
 * connection (service-role equivalent) and every iteration uses fresh ids, so iterations
 * never interfere. Business refusals are data, not exceptions. Invariants are checked
 * against the database afterwards; they are never weakened to make a run green.
 *
 * Scenarios (fixture helpers copied from scripts/fleet_assignment_reservations.db.test.mjs
 * and scripts/staff_scope_dispatch.db.test.mjs, adapted to the superuser harness):
 *   R1 double-reserve vehicle       two jobs, same vehicle, two drivers, overlapping windows
 *   R2 double-reserve driver        two jobs, same driver, two vehicles, overlapping windows
 *   R3 idempotent replay race       same reserve call (same key) from two connections
 *   R4 end vs reserve               agency_driver_employment_end races reserve for the employment
 *   R5 release vs re-reserve        release of reservation A races a new reserve for job B
 *   R6 truck pairing race           same driver assigned to two trucks at once
 *
 * Usage:  node scripts/race/postgres_race.test.mjs            (from the repo root)
 *         RACE_ITERATIONS=30 node scripts/race/postgres_race.test.mjs
 * Exit 0 = every scenario satisfied every invariant; any invariant violation or
 * unexpected database error exits 1. Warnings (one-sided R4 distribution) do not fail.
 */

import { randomUUID } from 'node:crypto'
import { startServer } from './_realPg.mjs'

const DEFAULT_ITERATIONS = 120

function parseIterations(raw) {
  if (raw === undefined || raw.trim() === '') return DEFAULT_ITERATIONS
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    console.error(`FAIL: RACE_ITERATIONS must be a positive integer, got ${JSON.stringify(raw)}`)
    process.exit(1)
  }
  return n
}

const ITERATIONS = parseIterations(process.env.RACE_ITERATIONS)

/** Refusals the database raises as controlled, expected messages (counted as refusals). */
const CONTROLLED_ERRORS = new Set([
  'Agency job not found or access denied.',
  'Employment record not found or access denied.',
  'Vehicle not found or access denied.',
  'Reservation not found or access denied.',
  'Vehicle reservation overlaps an active reservation.',
  'Driver reservation overlaps an active reservation.',
  // Raised by the trigger enforce_agency_truck_driver_assignment: the database form of driver_already_assigned.
  'Driver is already assigned to another truck.',
])

const T0 = Date.now()
const at = (hours) => new Date(T0 + 24 * 3600e3 + hours * 3600e3).toISOString()
const WINDOW = [at(0), at(4)]
const OVERLAP_WINDOW = [at(2), at(6)]

let counter = 0
const next = () => ++counter

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].trim()
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

let s
let customerUserId
let customerId
let agencyUserId
let agencyId

// ---------------------------------------------------------------------------
// Fixtures (superuser, bypasses RLS; same shapes as the PGlite batteries)
// ---------------------------------------------------------------------------
const q = (sql, params) => s.admin.query(sql, params)
const rowsOf = async (sql, params) => (await q(sql, params)).rows
const oneRow = async (sql, params) => (await rowsOf(sql, params))[0]

async function createUser(tag) {
  const id = randomUUID()
  const email = `${tag}-${next()}@race.example.com`
  await q(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [id, email, JSON.stringify({})])
  await q(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

async function createAgency(userId, tag) {
  const k = next()
  const id = randomUUID()
  await q(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', 'approved', $4, $5)`,
    [id, userId, `${tag} ${k} Transport Pvt Ltd`, `07ABCDE${1000 + k}A1Z5`, `ABCDE${4000 + k}Q`]
  )
  return id
}

async function createCustomer(userId) {
  const k = next()
  const id = randomUUID()
  await q(
    `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, gst_number, pan_number, created_by)
     VALUES ($1, $2, $3, $4, 'Race Street, Demo Logistics Park', 'Delhi', 'Delhi', '110001', $5, $6, $7)`,
    [id, `Race Cust ${k} Logistics Pvt Ltd`, `9${String(k).padStart(9, '0')}`, `race-cust-${k}@race.example.com`, `ABCDE${1000 + k}F`, `FGHIJ${2000 + k}K`, userId]
  )
  return id
}

/** Approved driver with an ACTIVE employment at the agency, licence valid to 2030. */
async function freshDriver() {
  const k = next()
  const userId = await createUser('race-drv')
  const driverId = randomUUID()
  await q(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', 'approved', true, 'ABCDE1234F')`,
    [driverId, userId, `Race Driver ${k}`, `8${String(k).padStart(9, '0')}`]
  )
  const employmentId = randomUUID()
  await q(
    `INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, licence_number, licence_class, licence_expiry, status)
     VALUES ($1, $2, $3, $4, 'HGV', '2030-01-01', 'active')`,
    [employmentId, agencyId, driverId, `DL-RACE-${k}`]
  )
  return { userId, driverId, employmentId }
}

/** Agency vehicle with current document dates (eligible across the test windows). */
async function freshVehicle() {
  const k = next()
  const id = randomUUID()
  await q(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, is_available,
       insurance_expiry, fitness_expiry, permit_expiry, puc_expiry)
     VALUES ($1, $2, 'eicher_14ft', $3, true, '2030-01-01', '2030-01-01', '2030-01-01', '2030-01-01')`,
    [id, agencyId, `RC-RACE-${k}`]
  )
  return id
}

/** Agency job plus a pending dispatch offer for the driver (48h expiry). */
async function freshJob(driverId) {
  const k = next()
  const shipmentId = randomUUID()
  await q(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [shipmentId, `RACE-${k}-${Date.now()}`, customerId, customerUserId]
  )
  const jobId = randomUUID()
  await q(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, 'pending')`,
    [jobId, agencyId, shipmentId]
  )
  const offerId = randomUUID()
  await q(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), now() + interval '48 hours', 'pending', '4321', '8765')`,
    [offerId, shipmentId, driverId]
  )
  return { jobId, offerId }
}

async function versionOf(table, id) {
  return (await oneRow(`SELECT version FROM public.${table} WHERE id = $1`, [id])).version
}

async function overlapCount(column, id, window) {
  return (
    await oneRow(
      `SELECT count(*)::int AS n FROM public.fleet_assignment_reservations
       WHERE ${column} = $1 AND status = 'active'
         AND tstzrange(window_start, window_end, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [id, window[0], window[1]]
    )
  ).n
}

// ---------------------------------------------------------------------------
// Business calls (executed on an independent connection as the owner)
// ---------------------------------------------------------------------------
async function reserve(conn, a) {
  const r = await conn.query(
    `SELECT public.reserve_fleet_assignment($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::integer, $8::text) AS r`,
    [a.jobId, a.offerId, a.vehicleId, a.employmentId, a.start ?? WINDOW[0], a.end ?? WINDOW[1], a.expectedVersion, a.key]
  )
  return parseJson(r.rows[0].r)
}

async function release(conn, reservationId, expectedVersion) {
  const r = await conn.query(`SELECT public.release_fleet_assignment($1::uuid, $2::integer) AS r`, [reservationId, expectedVersion])
  return parseJson(r.rows[0].r)
}

async function endEmployment(conn, employmentId, expectedVersion) {
  const r = await conn.query(`SELECT public.agency_driver_employment_end($1::uuid, $2::integer) AS r`, [employmentId, expectedVersion])
  return parseJson(r.rows[0].r)
}

async function assignTruck(conn, truckId, driverId, expectedVersion) {
  const r = await conn.query(`SELECT public.agency_truck_assign_driver($1::uuid, $2::uuid, $3::integer) AS r`, [truckId, driverId, expectedVersion])
  return parseJson(r.rows[0].r)
}

/**
 * Turns one settled call into a classified outcome:
 *  ok        returned ok:true
 *  refused   returned ok:false with a typed error, or raised a CONTROLLED message
 *  unexpected  any other database error (always a case failure)
 */
function outcomeOf(settled) {
  if (settled.status === 'fulfilled') {
    const value = settled.value
    if (value && value.ok === true) return { kind: 'ok', code: null, state: value.state, value, label: `ok:${value.state}` }
    const code = value && value.error ? value.error : 'no_error_code'
    return { kind: 'refused', code, value, label: `refused:${code}` }
  }
  const message = firstLine(settled.reason)
  if (CONTROLLED_ERRORS.has(message)) return { kind: 'refused', code: message, value: null, label: `refused:raised(${message})` }
  return { kind: 'unexpected', code: message, value: null, label: `UNEXPECTED:${message}` }
}

/** Fires two calls at the same moment; optional 0-3 ms jitter on one randomly chosen side. */
async function fireTogether(runA, runB) {
  const jitterMs = Math.floor(Math.random() * 4)
  const jitterOnA = Math.random() < 0.5
  const delayed = (run, isDelayed) => async () => {
    if (isDelayed && jitterMs > 0) await sleep(jitterMs)
    return run()
  }
  const [a, b] = await Promise.allSettled([delayed(runA, jitterOnA)(), delayed(runB, !jitterOnA)()])
  return { a: outcomeOf(a), b: outcomeOf(b) }
}

function pairLabel(a, b) {
  const oks = [a, b].filter((o) => o.kind === 'ok').length
  if (oks === 1) {
    const winner = a.kind === 'ok' ? 'A' : 'B'
    const loser = a.kind === 'ok' ? b : a
    return `winner=${winner}, loser=${loser.label}`
  }
  return `A:${a.label} | B:${b.label}`
}

// ---------------------------------------------------------------------------
// Scenario runner
// ---------------------------------------------------------------------------
/**
 * Runs one scenario for ITERATIONS iterations. `iterate(open)` returns
 * { label, violations: string[] }. A thrown error inside an iteration is a harness
 * error and counts as a violation.
 */
async function runScenario(id, title, iterate) {
  const distribution = new Map()
  const violations = []
  for (let i = 0; i < ITERATIONS; i++) {
    const conns = []
    const open = async (userId) => {
      const conn = await s.connect(userId)
      conns.push(conn)
      return conn
    }
    try {
      const { label, violations: found } = await iterate(open)
      distribution.set(label, (distribution.get(label) ?? 0) + 1)
      for (const message of found) violations.push({ iteration: i + 1, message })
    } catch (error) {
      violations.push({ iteration: i + 1, message: `harness error: ${firstLine(error)}` })
    } finally {
      await Promise.allSettled(conns.map((conn) => conn.close()))
    }
  }
  const pass = violations.length === 0
  console.log(`\n[${id}] ${title}`)
  console.log(`  iterations: ${ITERATIONS}`)
  console.log('  distribution:')
  for (const [label, count] of [...distribution.entries()].sort((x, y) => y[1] - x[1])) {
    console.log(`    ${String(count).padStart(5)}  ${label}`)
  }
  console.log(`  invariant violations: ${violations.length}`)
  for (const v of violations.slice(0, 5)) console.log(`    - iteration ${v.iteration}: ${v.message}`)
  if (violations.length > 5) console.log(`    ... ${violations.length - 5} more`)
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id}`)
  return { id, title, pass, distribution }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

/** R1: two jobs, same vehicle, two different drivers, overlapping windows, two owner sessions. */
async function r1(open) {
  const vehicleId = await freshVehicle()
  const dA = await freshDriver()
  const dB = await freshDriver()
  const jA = await freshJob(dA.driverId)
  const jB = await freshJob(dB.driverId)
  const cA = await open(agencyUserId)
  const cB = await open(agencyUserId)
  const { a, b } = await fireTogether(
    () => reserve(cA, { jobId: jA.jobId, offerId: jA.offerId, vehicleId, employmentId: dA.employmentId, start: WINDOW[0], end: WINDOW[1], expectedVersion: 1, key: `r1a-${randomUUID()}` }),
    () => reserve(cB, { jobId: jB.jobId, offerId: jB.offerId, vehicleId, employmentId: dB.employmentId, start: OVERLAP_WINDOW[0], end: OVERLAP_WINDOW[1], expectedVersion: 1, key: `r1b-${randomUUID()}` })
  )
  const violations = []
  const oks = [a, b].filter((o) => o.kind === 'ok').length
  if (oks !== 1) violations.push(`expected exactly one ok:true, got A=${a.label} B=${b.label}`)
  const loser = a.kind === 'ok' ? b : a
  if (oks === 1 && !(loser.kind === 'refused' && loser.code === 'vehicle_reserved')) {
    violations.push(`loser ${loser.label}, expected refused:vehicle_reserved`)
  }
  const active = await overlapCount('vehicle_id', vehicleId, WINDOW)
  if (active !== 1) violations.push(`active reservations for the vehicle in the window = ${active}, expected exactly 1`)
  return { label: pairLabel(a, b), violations }
}

/** R2: two jobs, same driver employment, two different vehicles, overlapping windows. */
async function r2(open) {
  const d = await freshDriver()
  const vA = await freshVehicle()
  const vB = await freshVehicle()
  const jA = await freshJob(d.driverId)
  const jB = await freshJob(d.driverId)
  const cA = await open(agencyUserId)
  const cB = await open(agencyUserId)
  const { a, b } = await fireTogether(
    () => reserve(cA, { jobId: jA.jobId, offerId: jA.offerId, vehicleId: vA, employmentId: d.employmentId, start: WINDOW[0], end: WINDOW[1], expectedVersion: 1, key: `r2a-${randomUUID()}` }),
    () => reserve(cB, { jobId: jB.jobId, offerId: jB.offerId, vehicleId: vB, employmentId: d.employmentId, start: OVERLAP_WINDOW[0], end: OVERLAP_WINDOW[1], expectedVersion: 1, key: `r2b-${randomUUID()}` })
  )
  const violations = []
  const oks = [a, b].filter((o) => o.kind === 'ok').length
  if (oks !== 1) violations.push(`expected exactly one ok:true, got A=${a.label} B=${b.label}`)
  const loser = a.kind === 'ok' ? b : a
  if (oks === 1 && !(loser.kind === 'refused' && loser.code === 'driver_reserved')) {
    violations.push(`loser ${loser.label}, expected refused:driver_reserved`)
  }
  const active = await overlapCount('driver_id', d.driverId, WINDOW)
  if (active !== 1) violations.push(`active reservations for the driver in the window = ${active}, expected exactly 1`)
  return { label: pairLabel(a, b), violations }
}

/** R3: the same reserve call (same idempotency key) from two connections at once. */
async function r3(open) {
  const d = await freshDriver()
  const vehicleId = await freshVehicle()
  const j = await freshJob(d.driverId)
  const key = `r3-${randomUUID()}`
  const args = { jobId: j.jobId, offerId: j.offerId, vehicleId, employmentId: d.employmentId, expectedVersion: 1, key }
  const cA = await open(agencyUserId)
  const cB = await open(agencyUserId)
  const { a, b } = await fireTogether(() => reserve(cA, args), () => reserve(cB, args))
  const violations = []
  const states = [a, b].map((o) => (o.kind === 'ok' ? o.state : null)).sort()
  if (!(a.kind === 'ok' && b.kind === 'ok')) violations.push(`both calls must return ok:true, got A=${a.label} B=${b.label}`)
  else if (JSON.stringify(states) !== JSON.stringify(['created', 'idempotent_replay'])) {
    violations.push(`expected states [created, idempotent_replay], got ${JSON.stringify(states)}`)
  }
  const n = (await oneRow(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_id = $1 AND idempotency_key = $2`, [agencyId, key])).n
  if (n !== 1) violations.push(`expected exactly one reservation row for the key, found ${n}`)
  const label = a.kind === 'ok' && b.kind === 'ok' ? `both ok: ${states.join(' + ')}` : pairLabel(a, b)
  return { label, violations }
}

/** R4: agency_driver_employment_end races reserve_fleet_assignment for the same employment. */
async function r4(open) {
  const d = await freshDriver()
  const vehicleId = await freshVehicle()
  const j = await freshJob(d.driverId)
  const employmentVersion = await versionOf('agency_driver_employment', d.employmentId)
  const cEnd = await open(agencyUserId)
  const cRes = await open(agencyUserId)
  const { a: endO, b: resO } = await fireTogether(
    () => endEmployment(cEnd, d.employmentId, employmentVersion),
    () => reserve(cRes, { jobId: j.jobId, offerId: j.offerId, vehicleId, employmentId: d.employmentId, expectedVersion: 1, key: `r4-${randomUUID()}` })
  )
  const violations = []
  let label
  if (resO.kind === 'ok' && endO.kind === 'refused' && endO.code === 'driver_has_active_assignment') {
    label = 'reserve won (end refused: driver_has_active_assignment)'
  } else if (endO.kind === 'ok' && resO.kind === 'refused' && (resO.code === 'driver_not_eligible' || resO.code === 'Employment record not found or access denied.')) {
    label = 'end won (reserve refused: employment ended)'
  } else {
    label = `other: end=${endO.label} reserve=${resO.label}`
    violations.push(`unexpected pairing: end=${endO.label}, reserve=${resO.label}`)
  }
  const status = (await oneRow(`SELECT status FROM public.agency_driver_employment WHERE id = $1`, [d.employmentId])).status
  const active = (await oneRow(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE driver_employment_id = $1 AND status = 'active'`, [d.employmentId])).n
  if (status === 'ended' && active > 0) violations.push(`INVARIANT: employment ended AND ${active} active reservation(s) for it`)
  return { label, violations }
}

/** R5: release of reservation A races a new reserve of the same vehicle and driver for job B. */
async function r5(open) {
  const d = await freshDriver()
  const vehicleId = await freshVehicle()
  const jA = await freshJob(d.driverId)
  const jB = await freshJob(d.driverId)
  const owner = await open(agencyUserId)
  const seeded = await reserve(owner, { jobId: jA.jobId, offerId: jA.offerId, vehicleId, employmentId: d.employmentId, expectedVersion: 1, key: `r5a-${randomUUID()}` })
  if (!(seeded.ok === true && seeded.state === 'created')) throw new Error(`seed reserve failed: ${JSON.stringify(seeded)}`)
  const cRel = await open(agencyUserId)
  const cRes = await open(agencyUserId)
  const { a: relO, b: resO } = await fireTogether(
    () => release(cRel, seeded.reservation.id, seeded.reservation.version),
    () => reserve(cRes, { jobId: jB.jobId, offerId: jB.offerId, vehicleId, employmentId: d.employmentId, expectedVersion: 1, key: `r5b-${randomUUID()}` })
  )
  const violations = []
  if (!(relO.kind === 'ok' && relO.state === 'released')) violations.push(`release must succeed with the current version, got ${relO.label}`)
  const acceptable = resO.kind === 'ok' || (resO.kind === 'refused' && (resO.code === 'vehicle_reserved' || resO.code === 'driver_reserved'))
  if (!acceptable) violations.push(`reserve for job B returned ${resO.label}, expected ok or vehicle_reserved/driver_reserved`)
  const vehicleActive = await overlapCount('vehicle_id', vehicleId, WINDOW)
  const driverActive = await overlapCount('driver_id', d.driverId, WINDOW)
  if (vehicleActive > 1) violations.push(`vehicle has ${vehicleActive} overlapping active reservations`)
  if (driverActive > 1) violations.push(`driver has ${driverActive} overlapping active reservations`)
  const label = `release ${relO.label} | reserve B ${resO.label}`
  return { label, violations }
}

/** R6: the same driver assigned to two different trucks at once (current expected versions). */
async function r6(open) {
  const d = await freshDriver()
  const t1 = await freshVehicle()
  const t2 = await freshVehicle()
  const v1 = await versionOf('agency_trucks', t1)
  const v2 = await versionOf('agency_trucks', t2)
  const cA = await open(agencyUserId)
  const cB = await open(agencyUserId)
  const { a, b } = await fireTogether(() => assignTruck(cA, t1, d.driverId, v1), () => assignTruck(cB, t2, d.driverId, v2))
  const violations = []
  const oks = [a, b].filter((o) => o.kind === 'ok').length
  if (oks !== 1) violations.push(`expected exactly one ok:true, got A=${a.label} B=${b.label}`)
  const loser = a.kind === 'ok' ? b : a
  const acceptedLoser = ['driver_already_assigned', 'version_conflict', 'Driver is already assigned to another truck.']
  if (oks === 1 && !(loser.kind === 'refused' && acceptedLoser.includes(loser.code))) {
    violations.push(`loser ${loser.label}, expected refused:driver_already_assigned, version_conflict, or the trigger's controlled "already assigned" raise`)
  }
  const onTrucks = (await oneRow(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE driver_id = $1`, [d.driverId])).n
  if (onTrucks !== 1) violations.push(`driver is on ${onTrucks} truck(s), expected exactly 1`)
  return { label: pairLabel(a, b), violations }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  s = await startServer('race')
  try {
    console.log(`PostgreSQL ${s.version}; ${s.files} migrations replayed`)
    console.log(`iterations per scenario: ${ITERATIONS}${process.env.RACE_ITERATIONS ? ' (RACE_ITERATIONS)' : ' (default)'}`)

    customerUserId = await createUser('race-customer')
    customerId = await createCustomer(customerUserId)
    agencyUserId = await createUser('race-agency')
    agencyId = await createAgency(agencyUserId, 'Race Agency')

    const results = []
    results.push(await runScenario('R1', 'double-reserve vehicle (two drivers, one vehicle, overlapping windows)', r1))
    results.push(await runScenario('R2', 'double-reserve driver (two vehicles, one driver, overlapping windows)', r2))
    results.push(await runScenario('R3', 'idempotent replay race (same key from two connections)', r3))
    results.push(await runScenario('R4', 'end employment vs reserve (same employment)', r4))
    results.push(await runScenario('R5', 'release reservation A vs re-reserve for job B', r5))
    results.push(await runScenario('R6', 'truck pairing race (same driver, two trucks)', r6))

    const r4Result = results.find((r) => r.id === 'R4')
    const endWon = [...r4Result.distribution.entries()].filter(([label]) => label.startsWith('end won')).reduce((n, [, c]) => n + c, 0)
    const reserveWon = [...r4Result.distribution.entries()].filter(([label]) => label.startsWith('reserve won')).reduce((n, [, c]) => n + c, 0)
    if (endWon === 0 || reserveWon === 0) {
      console.log(`\nWARNING R4 one-sided distribution (end won=${endWon}, reserve won=${reserveWon}); not a failure`)
    }

    const failed = results.filter((r) => !r.pass)
    console.log('\n=== summary ===')
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id}  ${r.title}`)
    console.log(`${results.length - failed.length}/${results.length} scenarios passed`)
    return failed.length === 0
  } finally {
    await s.stop().catch((error) => console.error('WARNING: server stop failed:', firstLine(error)))
  }
}

let ok = false
try {
  ok = await main()
} catch (error) {
  console.error('FAIL: harness error:', firstLine(error))
  ok = false
}
process.exit(ok ? 0 : 1)
