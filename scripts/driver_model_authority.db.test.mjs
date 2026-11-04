#!/usr/bin/env node
/**
 * Driver model authority contract battery (red-first).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * supabase/migrations on fresh instances and drives the same surfaces the
 * portal uses: real RLS and role switching (`SET ROLE authenticated` +
 * `request.jwt.claims`, what PostgREST does), real triggers, and real
 * SECURITY DEFINER command RPCs.
 *
 * Pinned contract (decision):
 *   - public.agency_driver_employment is the SINGLE driver-to-agency authority.
 *   - agency_trucks.driver_id is only a default truck-driver pairing; it never
 *     grants agency access by itself.
 *   The migration under test is supabase/migrations/20261013000000_driver_model_authority.sql.
 *   This battery is written against the contract only. It does not author or
 *   modify that migration, and it does not weaken any assertion to match the
 *   current schema.
 *
 * Structure:
 *   Part 1 (backfill, B1-B5): fresh instances replay every migration that sorts
 *     before the D3 file, legacy rows are seeded as superuser with the replica
 *     session role (so legacy states bypass today's guard triggers), then the
 *     D3 file is applied with applyOne.
 *   Part 2 (authority, J/R/E): one shared instance replays the FULL chain
 *     (including D3 once it exists) and drives the owner, dispatcher and driver
 *     surfaces through RLS.
 *
 * Expected state: red until the D3 migration lands. A missing D3 file is a
 * recorded case failure, never a harness crash.
 *
 * Evidence class: local DB only (PGlite, single session). Concurrency is not
 * raced here; overlap behaviour is covered by the reservations battery.
 *
 * Usage:  node scripts/driver_model_authority.db.test.mjs
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is
 * a loud failure, never a silent skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const D3_FILE = '20261013000000_driver_model_authority.sql'
const BACKFILL_PREFIX = 'Driver model backfill blocked:'

if (!existsSync(PGLITE_BASE)) {
  console.error('FAIL: PGlite not found at ' + PGLITE_BASE + ' — run `npm ci` in frontend/ first.')
  process.exit(1)
}

const { PGlite } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'index.js')).href)
const { uuid_ossp } = await import(pathToFileURL(join(PGLITE_BASE, 'dist', 'contrib', 'uuid_ossp.js')).href)

// ---------------------------------------------------------------------------
// Harness helpers
// ---------------------------------------------------------------------------
const results = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

/** Strip the ` [SQL: ...]` note appended by the db wrappers, leaving the raw engine message. */
function stripSqlNote(message) {
  return String(message).replace(/ \[SQL: [\s\S]*\]$/, '')
}

function firstLine(message) {
  return stripSqlNote(message).split('\n')[0]
}

/** Returns the full (un-truncated) engine message, or fails if the call succeeded. */
async function captureError(promise, label = 'call') {
  try {
    await promise
  } catch (error) {
    return stripSqlNote(error && error.message ? error.message : String(error))
  }
  throw new Error(`expected an error from ${label}, but the call succeeded`)
}

async function expectError(promise, expectedMessage) {
  const message = await captureError(promise, `"${expectedMessage}"`)
  expect(
    message.split('\n')[0].includes(expectedMessage),
    `expected error containing "${expectedMessage}", got: ${JSON.stringify(firstLine(message))}`
  )
  return message
}

async function expectExactError(promise, expectedMessage) {
  const message = await captureError(promise, `"${expectedMessage}"`)
  expect(
    firstLine(message) === expectedMessage,
    `expected exactly ${JSON.stringify(expectedMessage)}, got: ${JSON.stringify(firstLine(message))}`
  )
}

/**
 * Per-case resilience: a failing assertion records FAIL and the battery keeps
 * running, so a red-first run reports EVERY unmet contract clause.
 */
async function testCase(name, fn) {
  try {
    await fn()
    record(name, true)
  } catch (error) {
    const message = error && error.message ? firstLine(error.message).slice(0, 240) : String(error)
    record(name, false, message)
  }
}

/**
 * Collects independent assertions in one case so a single run reports every
 * refused or accepted leg, not just the first.
 */
async function softCheck(failures, label, fn) {
  try {
    await fn()
  } catch (error) {
    failures.push(`${label}: ${firstLine(error.message).slice(0, 160)}`)
  }
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

// ---------------------------------------------------------------------------
// Engine lifecycle: fresh PGlite per instance, error-annotating wrappers
// ---------------------------------------------------------------------------
let db = null

function wrapDb(instance) {
  const rawQuery = instance.query.bind(instance)
  const rawExec = instance.exec.bind(instance)
  instance.query = async (sql, params) => {
    try {
      return await rawQuery(sql, params)
    } catch (error) {
      error.message = `${error.message} [SQL: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 140)}]`
      throw error
    }
  }
  instance.exec = async (sql) => {
    try {
      return await rawExec(sql)
    } catch (error) {
      error.message = `${error.message} [SQL: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 140)}]`
      throw error
    }
  }
  return instance
}

function listMigrations() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
}

/** Applies one migration file to the given instance. The engine error is rethrown unchanged. */
async function applyOne(target, filename) {
  const path = join(MIGRATIONS_DIR, filename)
  if (!existsSync(path)) {
    throw new Error(`migration file not found: supabase/migrations/${filename}`)
  }
  await target.exec(readFileSync(path, 'utf8'))
}

/**
 * Creates a fresh PGlite instance, runs the Supabase-shaped BOOTSTRAP, and
 * applies migration files in sorted order. With no argument ALL files are
 * applied; with upToExclusive only files whose name sorts before it are.
 * The new instance becomes the module-level `db`.
 */
async function createDb(upToExclusive) {
  if (db) {
    await db.close().catch(() => {})
    db = null
  }
  db = wrapDb(await PGlite.create({ extensions: { uuid_ossp } }))
  await db.exec(BOOTSTRAP)
  const files = listMigrations().filter((f) => upToExclusive === undefined || f < upToExclusive)
  for (const file of files) {
    try {
      await applyOne(db, file)
    } catch (error) {
      throw new Error(`migration ${file} failed: ${firstLine(error.message)}`)
    }
  }
  return { applied: files }
}

// ---------------------------------------------------------------------------
// Fixtures (service-role equivalent: run as the postgres superuser)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const uniqKey = (tag) => `d3-${tag}-${++seq}-${Date.now()}`

const T0 = Date.now()
const at = (hours) => new Date(T0 + 24 * 3600e3 + hours * 3600e3).toISOString()
const W1 = [at(0), at(4)]

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await db.query(
    `INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`,
    [id, email, JSON.stringify({})]
  )
  await db.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

async function createAgencyRow(userId, tag, status = 'pending') {
  const id = uid()
  await db.query(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6)`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, `07ABCDE${1000 + seq}A1Z5`, `ABCDE${4000 + seq}Q`]
  )
  return id
}

async function createDriver(userId, tag, status = 'pending') {
  const id = uid()
  await db.query(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', $5, true, 'ABCDE1234F')`,
    [id, userId, `${tag} Driver`, `9${String(seq).padStart(9, '0')}`, status]
  )
  return id
}

/** Service-seeded truck row. Callers pass explicit columns (docs, driver_id, ...). */
async function createTruckRow(agencyId, rcNumber, columns = {}) {
  const id = uid()
  const sets = {
    is_available: true,
    insurance_expiry: '2030-01-01',
    fitness_expiry: '2030-01-01',
    permit_expiry: '2030-01-01',
    puc_expiry: '2030-01-01',
    ...columns,
  }
  const keys = ['id', 'agency_id', 'vehicle_type', 'rc_number']
  const params = [id, agencyId, 'eicher_14ft', rcNumber]
  for (const [k, v] of Object.entries(sets)) {
    keys.push(k)
    params.push(v)
  }
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(`INSERT INTO public.agency_trucks (${keys.join(', ')}) VALUES (${placeholders})`, params)
  return id
}

async function createEmploymentRow(agencyId, driverId, columns = {}) {
  const id = uid()
  const keys = ['id', 'agency_id', 'driver_id']
  const params = [id, agencyId, driverId]
  for (const [k, v] of Object.entries(columns)) {
    keys.push(k)
    params.push(v)
  }
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  await db.query(`INSERT INTO public.agency_driver_employment (${keys.join(', ')}) VALUES (${placeholders})`, params)
  return id
}

async function createCustomer(userId, tag) {
  const id = uid()
  await db.query(
    `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, gst_number, pan_number, created_by)
     VALUES ($1, $2, $3, $4, $5, 'Delhi', 'Delhi', '110001', $6, $7, $8)`,
    [
      id,
      `${tag} Logistics Pvt Ltd`,
      '99999999' + String(seq).padStart(2, '0'),
      `${tag.toLowerCase()}-${seq}@example.com`,
      `${tag} Street, Demo Logistics Park`,
      `ABCDE${1000 + seq}F`,
      `FGHIJ${2000 + seq}K`,
      userId,
    ]
  )
  return id
}

async function createShipment(custId, ownerUserId, tag) {
  const id = uid()
  const reference = `D3-${tag}-${Date.now()}-${seq}`
  await db.query(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [id, reference, custId, ownerUserId]
  )
  return { id }
}

// ---------------------------------------------------------------------------
// Role/claims switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
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

/** Runs fn as the authenticated user, then always restores the superuser session. */
async function asUser(userId, fn) {
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await actAsService()
  }
}

/** Legacy states (driver-truck links that today's guards refuse) are seeded with triggers off. */
let legacyDepth = 0
async function legacySeed(fn) {
  if (legacyDepth++ === 0) await db.exec('SET session_replication_role = replica')
  try {
    return await fn()
  } finally {
    if (--legacyDepth === 0) await db.exec('SET session_replication_role = origin')
  }
}

async function rows(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows
}

async function one(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows[0]
}

async function countWhere(sql, params) {
  return (await one(sql, params)).n
}

// ---------------------------------------------------------------------------
// Part 2 fixtures (shared instance)
// ---------------------------------------------------------------------------
const shared = { ready: false }
let customerUserId
let customerId
let agencyUserA
let agencyA
let agencyUserB
let agencyB

async function setupShared() {
  customerUserId = await createUser('d3-customer')
  customerId = await createCustomer(customerUserId, 'D3Cust')
  agencyUserA = await createUser('d3-agency-a')
  agencyA = await createAgencyRow(agencyUserA, 'D3 Agency A', 'approved')
  agencyUserB = await createUser('d3-agency-b')
  agencyB = await createAgencyRow(agencyUserB, 'D3 Agency B', 'approved')
  shared.ready = true
}

function requireShared() {
  if (!shared.ready) throw new Error('shared instance unavailable: precondition P0 failed')
}

/**
 * Driver fixture. employAt = agency id creates an ACTIVE employment there
 * (licence valid); null leaves the driver with no employment.
 */
async function freshDriver(tag, { status = 'approved', employAt = null, licenceExpiry = '2030-01-01' } = {}) {
  const userId = await createUser(`${tag}-drv`)
  const driverId = await createDriver(userId, tag, status)
  let employmentId = null
  if (employAt) {
    employmentId = await createEmploymentRow(employAt, driverId, {
      licence_number: `DL-${tag}-${seq}`,
      licence_class: 'HGV',
      licence_expiry: licenceExpiry,
      status: 'active',
    })
  }
  return { userId, driverId, employmentId }
}

/** Agency vehicle with current document dates; never links a driver (that is the caller's choice). */
async function freshVehicle(agencyId, tag, columns = {}) {
  return createTruckRow(agencyId, `RC-${tag}-${seq}`, columns)
}

/** Legacy truck-driver pairing (no employment), seeded with triggers off. */
async function legacyTruck(agencyId, tag, driverId) {
  return legacySeed(() => createTruckRow(agencyId, `RC-${tag}-${seq}`, { driver_id: driverId }))
}

/**
 * Agency job for an agency, with a live consent row (owner UPDATE policy
 * requires one) and a pending dispatch offer for offerDriverId.
 */
async function newJob(agencyId, offerDriverId, { jobStatus = 'pending', offerStatus = 'pending' } = {}) {
  const shipment = await createShipment(customerId, customerUserId, `J-${++seq}`)
  await db.query(
    `INSERT INTO public.shipment_agency_consents (shipment_id, agency_id, granted_via) VALUES ($1, $2, 'platform_dispatch')`,
    [shipment.id, agencyId]
  )
  const jobId = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, $4)`,
    [jobId, agencyId, shipment.id, jobStatus]
  )
  const offerId = uid()
  await db.query(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), now() + interval '48 hours', $4, '4321', '8765')`,
    [offerId, shipment.id, offerDriverId, offerStatus]
  )
  return { jobId, offerId, shipmentId: shipment.id }
}

// ---------------------------------------------------------------------------
// Command and read wrappers (the portal's call shapes)
// ---------------------------------------------------------------------------
async function jobRow(jobId) {
  return one(`SELECT truck_id, driver_id FROM public.agency_jobs WHERE id = $1`, [jobId])
}

async function jobSnapshot(jobId) {
  return (await one(`SELECT to_jsonb(j) AS j FROM public.agency_jobs j WHERE j.id = $1`, [jobId])).j
}

async function reservationRow(reservationId) {
  return one(`SELECT status, released_reason, version FROM public.fleet_assignment_reservations WHERE id = $1`, [reservationId])
}

async function employmentRow(employmentId) {
  return one(`SELECT status, version FROM public.agency_driver_employment WHERE id = $1`, [employmentId])
}

async function vehicleVersion(vehicleId) {
  return (await one(`SELECT version FROM public.agency_trucks WHERE id = $1`, [vehicleId])).version
}

/** Owner assigns a driver to an agency job through the normal RLS path. */
async function setJobDriver(userId, jobId, driverId) {
  return asUser(userId, () =>
    rows(`UPDATE public.agency_jobs SET driver_id = $1 WHERE id = $2 RETURNING driver_id`, [driverId, jobId])
  )
}

/** Owner assigns a driver to an agency truck through the normal RLS path. */
async function setTruckDriver(userId, truckId, driverId) {
  return asUser(userId, () =>
    rows(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2 RETURNING driver_id`, [driverId, truckId])
  )
}

async function reserveOwner(userId, { jobId, offerId, vehicleId, employmentId, key }) {
  const expectedVersion = await vehicleVersion(vehicleId)
  return asUser(userId, async () => {
    const result = await db.query(
      `SELECT public.reserve_fleet_assignment($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::integer, $8::text) AS r`,
      [jobId, offerId, vehicleId, employmentId, W1[0], W1[1], expectedVersion, key]
    )
    return parseJson(result.rows[0].r)
  })
}

async function releaseOwner(userId, reservationId, expectedVersion) {
  return asUser(userId, async () => {
    const result = await db.query(
      `SELECT public.release_fleet_assignment($1::uuid, $2::integer) AS r`,
      [reservationId, expectedVersion]
    )
    return parseJson(result.rows[0].r)
  })
}

async function endEmployment(userId, employmentId, expectedVersion) {
  return asUser(userId, async () => {
    const result = await db.query(
      `SELECT public.agency_driver_employment_end($1::uuid, $2::integer) AS r`,
      [employmentId, expectedVersion]
    )
    return parseJson(result.rows[0].r)
  })
}

/** Reserves a fresh vehicle and driver for a job through the owner, and asserts the create. */
async function reserveFor(userId, { driver, vehicleId, job, key }) {
  const res = await reserveOwner(userId, {
    jobId: job.jobId,
    offerId: job.offerId,
    vehicleId,
    employmentId: driver.employmentId,
    key,
  })
  expect(res && res.ok === true && res.state === 'created', `reserve failed: ${JSON.stringify(res)}`)
  return res
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------
async function main() {
  // =========================================================================
  // Part 1 — backfill. Fresh instance per case; D3 applied after the prefix.
  // =========================================================================

  await testCase('B1. legacy truck-linked driver with no employment gets an ACTIVE employment at the truck agency (licence NULL)', async () => {
    await createDb(D3_FILE)
    const agencyUser = await createUser('b1-agency')
    const agency = await createAgencyRow(agencyUser, 'B1 Agency', 'approved')
    const driverUser = await createUser('b1-drv')
    const driver = await createDriver(driverUser, 'B1', 'approved')
    await legacyTruck(agency, 'B1', driver)

    await applyOne(db, D3_FILE)

    const emp = await rows(
      `SELECT agency_id, status, licence_number, licence_class, licence_expiry
       FROM public.agency_driver_employment WHERE driver_id = $1`,
      [driver]
    )
    expect(emp.length === 1, `expected one employment row for the driver, got ${emp.length}`)
    expect(emp[0].agency_id === agency && emp[0].status === 'active',
      `expected ACTIVE employment at the truck agency, got ${JSON.stringify(emp[0])}`)
    expect(emp[0].licence_number === null && emp[0].licence_class === null && emp[0].licence_expiry === null,
      `licence columns must be NULL after backfill, got ${JSON.stringify(emp[0])}`)
  })

  await testCase('B2. driver already ACTIVE-employed at the same agency gets no duplicate employment row', async () => {
    await createDb(D3_FILE)
    const agencyUser = await createUser('b2-agency')
    const agency = await createAgencyRow(agencyUser, 'B2 Agency', 'approved')
    const driverUser = await createUser('b2-drv')
    const driver = await createDriver(driverUser, 'B2', 'approved')
    const existing = await legacySeed(async () => {
      await legacyTruck(agency, 'B2', driver)
      return createEmploymentRow(agency, driver, {
        licence_number: 'DL-B2-SEED',
        licence_class: 'HGV',
        licence_expiry: '2030-01-01',
        status: 'active',
      })
    })

    await applyOne(db, D3_FILE)

    const emp = await rows(`SELECT id, status FROM public.agency_driver_employment WHERE driver_id = $1`, [driver])
    expect(emp.length === 1, `backfill must not duplicate employment: count ${emp.length}`)
    expect(emp[0].id === existing && emp[0].status === 'active', 'the pre-existing ACTIVE employment must be kept as is')
  })

  await testCase('B3. truck-linked driver with ACTIVE employment at a DIFFERENT agency blocks D3 (Driver model backfill blocked:), nothing partially backfilled', async () => {
    await createDb(D3_FILE)
    const agencyAUser = await createUser('b3-agency-a')
    const agencyA1 = await createAgencyRow(agencyAUser, 'B3 Agency A', 'approved')
    const agencyBUser = await createUser('b3-agency-b')
    const agencyB1 = await createAgencyRow(agencyBUser, 'B3 Agency B', 'approved')
    const conflictUser = await createUser('b3-conflict')
    const conflictDriver = await createDriver(conflictUser, 'B3Conflict', 'approved')
    const cleanUser = await createUser('b3-clean')
    const cleanDriver = await createDriver(cleanUser, 'B3Clean', 'approved')
    await legacySeed(async () => {
      await legacyTruck(agencyA1, 'B3C', conflictDriver)
      await createEmploymentRow(agencyB1, conflictDriver, { status: 'active' })
      // A clean truck-linked driver: a non-atomic migration would backfill it before the conflict.
      await legacyTruck(agencyA1, 'B3K', cleanDriver)
    })
    const before = await countWhere(`SELECT count(*)::int AS n FROM public.agency_driver_employment`, [])

    const message = await captureError(applyOne(db, D3_FILE), 'D3 migration')
    expect(message.startsWith(BACKFILL_PREFIX), `message must start with "${BACKFILL_PREFIX}", got ${JSON.stringify(firstLine(message))}`)
    expect(message.includes(conflictDriver), `message must name the conflicting driver id ${conflictDriver}`)

    const after = await countWhere(`SELECT count(*)::int AS n FROM public.agency_driver_employment`, [])
    expect(after === before, `employment row count changed on a blocked migration (${before} -> ${after})`)
    const cleanRows = await countWhere(
      `SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE driver_id = $1`, [cleanDriver]
    )
    expect(cleanRows === 0, `partial backfill: clean driver got ${cleanRows} row(s) from a blocked migration`)
  })

  await testCase('B4. truck-linked driver that is NOT approved blocks D3 (Driver model backfill blocked:) and writes no employment', async () => {
    await createDb(D3_FILE)
    const agencyUser = await createUser('b4-agency')
    const agency = await createAgencyRow(agencyUser, 'B4 Agency', 'approved')
    const driverUser = await createUser('b4-drv')
    const driver = await createDriver(driverUser, 'B4', 'pending')
    await legacyTruck(agency, 'B4', driver)

    const message = await captureError(applyOne(db, D3_FILE), 'D3 migration')
    expect(message.startsWith(BACKFILL_PREFIX), `message must start with "${BACKFILL_PREFIX}", got ${JSON.stringify(firstLine(message))}`)
    const count = await countWhere(
      `SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE driver_id = $1`, [driver]
    )
    expect(count === 0, `a blocked migration must not write employment for the driver (got ${count})`)
  })

  await testCase('B5. rerunning the D3 body on a clean instance is idempotent (no error, no duplicates)', async () => {
    await createDb(D3_FILE)
    const agencyUser = await createUser('b5-agency')
    const agency = await createAgencyRow(agencyUser, 'B5 Agency', 'approved')
    const driverUser = await createUser('b5-drv')
    const driver = await createDriver(driverUser, 'B5', 'approved')
    await legacyTruck(agency, 'B5', driver)

    await applyOne(db, D3_FILE)
    await applyOne(db, D3_FILE)

    const emp = await rows(`SELECT agency_id, status FROM public.agency_driver_employment WHERE driver_id = $1`, [driver])
    expect(emp.length === 1, `rerun must not duplicate employment, got ${emp.length} rows`)
    expect(emp[0].agency_id === agency && emp[0].status === 'active', 'rerun must keep the single ACTIVE employment')
  })

  // =========================================================================
  // Part 2 — authority on one shared instance (full chain, including D3 once it exists)
  // =========================================================================

  await testCase('P0. full migration chain replays on one shared instance (precondition for J/R/E cases)', async () => {
    const { applied } = await createDb()
    expect(applied.length > 0, 'no migrations were applied')
    await setupShared()
    console.log(`      (P0 detail: ${applied.length} migrations replayed; D3 present=${applied.includes(D3_FILE)})`)
  })

  await testCase('J1. agency owner can set agency_jobs.driver_id to an ACTIVE employee with NO agency_trucks link', async () => {
    requireShared()
    const emp = await freshDriver('j1', { employAt: agencyA })
    const job = await newJob(agencyA, emp.driverId)
    const updated = await setJobDriver(agencyUserA, job.jobId, emp.driverId)
    expect(updated.length === 1 && updated[0].driver_id === emp.driverId,
      `owner assignment of an employed driver must succeed, got ${JSON.stringify(updated)}`)
  })

  await testCase('J2. truck-link-only driver (no employment) is REFUSED on agency_jobs and on agency_pay driver_payouts (Driver is not assigned to this agency fleet.)', async () => {
    requireShared()
    const driver = await freshDriver('j2', { employAt: null })
    await legacyTruck(agencyA, 'J2', driver.driverId)
    const job = await newJob(agencyA, driver.driverId)
    const failures = []
    await softCheck(failures, 'agency_jobs driver_id', async () => {
      await expectError(setJobDriver(agencyUserA, job.jobId, driver.driverId), 'Driver is not assigned to this agency fleet.')
    })
    await softCheck(failures, 'driver_payouts agency_pay', async () => {
      await expectError(
        asUser(agencyUserA, () =>
          db.query(
            `INSERT INTO public.driver_payouts (driver_id, agency_id, amount, type) VALUES ($1, $2, 1000, 'agency_pay')`,
            [driver.driverId, agencyA]
          )
        ),
        'Driver is not assigned to this agency fleet.'
      )
    })
    if (failures.length > 0) throw new Error(failures.join(' | '))
  })

  await testCase('J3. an employee of agency A is REFUSED on agency B jobs', async () => {
    requireShared()
    const emp = await freshDriver('j3', { employAt: agencyA })
    const jobB = await newJob(agencyB, emp.driverId)
    await expectError(setJobDriver(agencyUserB, jobB.jobId, emp.driverId), 'Driver is not assigned to this agency fleet.')
  })

  await testCase('J4. agency_trucks.driver_id: no active employment is refused with exactly "Driver is not employed by this agency."; with employment it succeeds', async () => {
    requireShared()
    const unemployed = await freshDriver('j4a', { employAt: null })
    const truckA = await freshVehicle(agencyA, 'j4a')
    await expectExactError(setTruckDriver(agencyUserA, truckA, unemployed.driverId), 'Driver is not employed by this agency.')

    const employed = await freshDriver('j4b', { employAt: agencyA })
    const truckB = await freshVehicle(agencyA, 'j4b')
    const updated = await setTruckDriver(agencyUserA, truckB, employed.driverId)
    expect(updated.length === 1 && updated[0].driver_id === employed.driverId,
      `pairing an employed driver must succeed, got ${JSON.stringify(updated)}`)
  })

  await testCase('R1. reserve_fleet_assignment (owner) writes agency_jobs.truck_id and driver_id, even with no agency_trucks link', async () => {
    requireShared()
    const driver = await freshDriver('r1', { employAt: agencyA })
    const vehicle = await freshVehicle(agencyA, 'r1')
    const job = await newJob(agencyA, driver.driverId)
    await reserveFor(agencyUserA, { driver, vehicleId: vehicle, job, key: uniqKey('r1') })
    const stamped = await jobRow(job.jobId)
    expect(stamped.truck_id === vehicle && stamped.driver_id === driver.driverId,
      `agency_jobs not stamped by the reservation: truck=${stamped.truck_id} driver=${stamped.driver_id}`)
  })

  await testCase('R2. release_fleet_assignment clears agency_jobs.truck_id and driver_id; replayed release (already_released) changes nothing', async () => {
    requireShared()
    const driver = await freshDriver('r2', { employAt: agencyA })
    const vehicle = await freshVehicle(agencyA, 'r2')
    const job = await newJob(agencyA, driver.driverId)
    const res = await reserveFor(agencyUserA, { driver, vehicleId: vehicle, job, key: uniqKey('r2') })
    const stamped = await jobRow(job.jobId)
    expect(stamped.truck_id === vehicle && stamped.driver_id === driver.driverId,
      `precondition: the reservation must stamp the job pair before release (see R1), got truck=${stamped.truck_id} driver=${stamped.driver_id}`)
    const first = await releaseOwner(agencyUserA, res.reservation.id, res.reservation.version)
    expect(first.ok === true && first.state === 'released', `release: ${JSON.stringify(first)}`)
    const cleared = await jobRow(job.jobId)
    expect(cleared.truck_id === null && cleared.driver_id === null,
      `release must clear the job pair, got truck=${cleared.truck_id} driver=${cleared.driver_id}`)
    const snapshotBefore = await jobSnapshot(job.jobId)
    const replay = await releaseOwner(agencyUserA, res.reservation.id, first.version)
    expect(replay.ok === true && replay.state === 'already_released', `replay: ${JSON.stringify(replay)}`)
    const snapshotAfter = await jobSnapshot(job.jobId)
    expect(JSON.stringify(snapshotAfter) === JSON.stringify(snapshotBefore), 'replayed release changed the agency job row')
  })

  await testCase('R3. release does NOT clear job truck_id/driver_id after driver_id was changed to someone else', async () => {
    requireShared()
    const driver = await freshDriver('r3a', { employAt: agencyA })
    const vehicle = await freshVehicle(agencyA, 'r3')
    const job = await newJob(agencyA, driver.driverId)
    const res = await reserveFor(agencyUserA, { driver, vehicleId: vehicle, job, key: uniqKey('r3') })
    const other = await freshDriver('r3b', { employAt: agencyA })
    const changed = await setJobDriver(agencyUserA, job.jobId, other.driverId)
    expect(changed.length === 1 && changed[0].driver_id === other.driverId, `owner change of job driver: ${JSON.stringify(changed)}`)
    const rel = await releaseOwner(agencyUserA, res.reservation.id, res.reservation.version)
    expect(rel.ok === true && rel.state === 'released', `release: ${JSON.stringify(rel)}`)
    const kept = await jobRow(job.jobId)
    expect(kept.driver_id === other.driverId, `release cleared a driver_id it no longer owned: ${kept.driver_id}`)
    expect(kept.truck_id === vehicle, `release cleared truck_id although the pair was changed: ${kept.truck_id}`)
  })

  await testCase('R4. offer declined: reservation auto-releases AND job truck_id/driver_id are cleared', async () => {
    requireShared()
    const driver = await freshDriver('r4', { employAt: agencyA })
    const vehicle = await freshVehicle(agencyA, 'r4')
    const job = await newJob(agencyA, driver.driverId)
    const res = await reserveFor(agencyUserA, { driver, vehicleId: vehicle, job, key: uniqKey('r4') })
    const stamped = await jobRow(job.jobId)
    expect(stamped.truck_id === vehicle && stamped.driver_id === driver.driverId,
      `precondition: the reservation must stamp the job pair before decline (see R1), got truck=${stamped.truck_id} driver=${stamped.driver_id}`)
    await db.query(`UPDATE public.job_offers SET status = 'declined' WHERE id = $1`, [job.offerId])
    const reservation = await reservationRow(res.reservation.id)
    expect(reservation.status === 'released' && reservation.released_reason === 'offer_declined',
      `reservation: ${JSON.stringify(reservation)}`)
    const cleared = await jobRow(job.jobId)
    expect(cleared.truck_id === null && cleared.driver_id === null,
      `declined offer must clear the job pair, got truck=${cleared.truck_id} driver=${cleared.driver_id}`)
  })

  await testCase('R5. consumed reservation (offer delivered) keeps job truck_id/driver_id', async () => {
    requireShared()
    const driver = await freshDriver('r5', { employAt: agencyA })
    const vehicle = await freshVehicle(agencyA, 'r5')
    const job = await newJob(agencyA, driver.driverId)
    const res = await reserveFor(agencyUserA, { driver, vehicleId: vehicle, job, key: uniqKey('r5') })
    await db.query(`UPDATE public.job_offers SET status = 'delivered' WHERE id = $1`, [job.offerId])
    const reservation = await reservationRow(res.reservation.id)
    expect(reservation.status === 'consumed', `reservation: ${JSON.stringify(reservation)}`)
    const kept = await jobRow(job.jobId)
    expect(kept.truck_id === vehicle && kept.driver_id === driver.driverId,
      `consumed assignment must keep the job pair, got truck=${kept.truck_id} driver=${kept.driver_id}`)
  })

  await testCase('E1. employment end refused (driver_has_active_assignment) while a reservation is ACTIVE; succeeds after release', async () => {
    requireShared()
    const driver = await freshDriver('e1', { employAt: agencyA })
    const vehicle = await freshVehicle(agencyA, 'e1')
    const job = await newJob(agencyA, driver.driverId)
    const res = await reserveFor(agencyUserA, { driver, vehicleId: vehicle, job, key: uniqKey('e1') })
    const version = (await employmentRow(driver.employmentId)).version
    const blocked = await endEmployment(agencyUserA, driver.employmentId, version)
    expect(blocked.ok === false && blocked.error === 'driver_has_active_assignment',
      `end while assigned must return driver_has_active_assignment, got ${JSON.stringify(blocked)}`)
    expect((await employmentRow(driver.employmentId)).status === 'active', 'the refused end changed the employment')
    const rel = await releaseOwner(agencyUserA, res.reservation.id, res.reservation.version)
    expect(rel.ok === true && rel.state === 'released', `release: ${JSON.stringify(rel)}`)
    const ended = await endEmployment(agencyUserA, driver.employmentId, version)
    expect(ended.ok === true && ended.state === 'ended', `end after release: ${JSON.stringify(ended)}`)
  })

  await testCase('E2. ending an employment sets agency_trucks.driver_id = NULL on the agency truck paired to that driver', async () => {
    requireShared()
    const driver = await freshDriver('e2', { employAt: agencyA })
    const truck = await freshVehicle(agencyA, 'e2')
    await db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver.driverId, truck])
    const version = (await employmentRow(driver.employmentId)).version
    const ended = await endEmployment(agencyUserA, driver.employmentId, version)
    expect(ended.ok === true && ended.state === 'ended', `end: ${JSON.stringify(ended)}`)
    const t = await one(`SELECT driver_id FROM public.agency_trucks WHERE id = $1`, [truck])
    expect(t.driver_id === null, `paired truck still points at the ended employee: ${t.driver_id}`)
  })

  await testCase('E3. after ending, the former employee is REFUSED on a new agency_jobs driver_id assignment', async () => {
    requireShared()
    const driver = await freshDriver('e3', { employAt: agencyA })
    const version = (await employmentRow(driver.employmentId)).version
    const ended = await endEmployment(agencyUserA, driver.employmentId, version)
    expect(ended.ok === true && ended.state === 'ended', `end: ${JSON.stringify(ended)}`)
    const job = await newJob(agencyA, driver.driverId)
    await expectError(setJobDriver(agencyUserA, job.jobId, driver.driverId), 'Driver is not assigned to this agency fleet.')
  })

  await testCase('E4. driver_is_assigned_to_agency is TRUE only with an ACTIVE employment (false for truck-link-only and ended employment)', async () => {
    requireShared()
    const employed = await freshDriver('e4a', { employAt: agencyA })
    const truckOnly = await freshDriver('e4b', { employAt: null })
    await legacyTruck(agencyA, 'E4B', truckOnly.driverId)
    const ended = await freshDriver('e4c', { employAt: agencyA })
    await db.query(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE id = $1`, [ended.employmentId])

    const check = async (driverId) =>
      (await one(`SELECT public.driver_is_assigned_to_agency($1::uuid, $2::uuid) AS v`, [driverId, agencyA])).v
    const failures = []
    if ((await check(employed.driverId)) !== true) failures.push('active employment must be TRUE')
    if ((await check(truckOnly.driverId)) !== false) failures.push('truck-link-only must be FALSE')
    if ((await check(ended.driverId)) !== false) failures.push('ended employment must be FALSE')
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed (driver model authority, PGlite SQL-level)`)
  if (failed.length > 0) {
    console.log('failed cases:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
  return failed.length === 0
}

let ok = false
try {
  ok = await main()
} catch (error) {
  console.error('FAIL: harness error:', error && error.message ? error.message : error)
  ok = false
} finally {
  if (db) await db.close().catch(() => {})
}
process.exit(ok ? 0 : 1)
