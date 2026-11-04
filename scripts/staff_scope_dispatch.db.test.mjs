#!/usr/bin/env node
/**
 * Staff scope dispatch — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the same surfaces the portal
 * uses: real RLS and role switching (`SET ROLE authenticated` +
 * `request.jwt.claims`, what PostgREST does per request), the SECURITY DEFINER
 * command RPCs reserve_fleet_assignment / release_fleet_assignment, and direct
 * table writes on agency_jobs through RLS.
 *
 * Pinned contract under test (the migration that implements it is NOT written
 * yet, so the "may" cases are EXPECTED to fail now; "may not" cases may pass):
 *   Actors: OWNER; staff via public.agency_memberships with scope
 *   dispatcher | fleet_manager | finance | viewer; SUSPENDED staff (active
 *   membership, agency suspended); REVOKED staff (membership revoked); OUTSIDER
 *   owner and OUTSIDER staff of another agency (agency B).
 *   - reserve_fleet_assignment / release_fleet_assignment: owner and dispatcher
 *     only. Everyone else RAISES.
 *   - SELECT on fleet_assignment_reservations, agency_jobs and
 *     shipment_agency_consents (agency side): owner and all four scopes; others
 *     see 0 rows.
 *   - agency_jobs INSERT / UPDATE through RLS: owner and dispatcher only.
 *     Denied INSERT raises 'row-level security'; denied UPDATE affects 0 rows.
 *   - agency_jobs DELETE: owner only.
 *   - Mid-session revoke: the same session's next reserve and read are denied.
 *   - Error text: right agency, insufficient scope -> exactly
 *     'Your access scope does not allow this action.'; no membership at all ->
 *     exactly 'No agency profile found for this account.'
 *   - Owner behaviour (reserve, idempotent replay, release) must not regress.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST /
 * GoTrue behaviour is NOT covered here. Concurrency is not raced.
 *
 * Usage:  node scripts/staff_scope_dispatch.db.test.mjs   (from the repo root)
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
const findings = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function recordFinding(name, detail) {
  findings.push({ name, detail })
  console.log(`FINDING  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

/** First line of an error message with the harness's [SQL: ...] annotation removed. */
function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].split(' [SQL:')[0].trim()
}

/** Passes only if the promise rejects (optionally with a message containing `expectedMessage`). */
async function expectRaises(promise, expectedMessage) {
  try {
    await promise
  } catch (error) {
    const message = firstLine(error)
    if (expectedMessage !== undefined) {
      expect(message.includes(expectedMessage), `expected error containing "${expectedMessage}", got: ${JSON.stringify(message)}`)
    }
    return message
  }
  throw new Error(`expected the call to raise${expectedMessage ? ` "${expectedMessage}"` : ''}, but it succeeded`)
}

/** Passes only if the promise rejects with EXACTLY `exactMessage`. */
async function expectExactError(promise, exactMessage) {
  try {
    await promise
  } catch (error) {
    const message = firstLine(error)
    expect(message === exactMessage, `expected exactly ${JSON.stringify(exactMessage)}, got: ${JSON.stringify(message)}`)
    return message
  }
  throw new Error(`expected exactly ${JSON.stringify(exactMessage)}, but the call succeeded`)
}

/**
 * Per-case resilience: a failing assertion records FAIL and the battery keeps
 * running, so a red-first run reports EVERY unmet contract clause with its
 * exact reason instead of dying on the first one.
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

/**
 * Runs every sub-check and reports ALL failing ones in one case, so a matrix
 * cell does not hide its second failing surface behind the first.
 */
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
// Fixtures (service-role equivalent: run as the postgres superuser)
// Same shapes and columns as scripts/fleet_assignment_reservations.db.test.mjs.
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

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

/** Service-seeded truck row with explicit column control. */
async function createTruckRow(agencyId, rcNumber, columns = {}) {
  const id = uid()
  const sets = { is_available: true, ...columns }
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
  const reference = `STAFFSCOPE-${tag}-${Date.now()}-${seq}`
  await db.query(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [id, reference, custId, ownerUserId]
  )
  return { id }
}

/** Active consent for (shipment, agency), service-seeded (platform_dispatch authority). */
async function insertConsent(shipmentId, agencyId) {
  await db.query(
    `INSERT INTO public.shipment_agency_consents (shipment_id, agency_id, granted_via, granted_by)
     VALUES ($1, $2, 'platform_dispatch', $3)`,
    [shipmentId, agencyId, customerUserId]
  )
}

/** Membership row seeded by superuser. status 'revoked' also sets revoked_at (table CHECK). */
async function addMembership(agencyId, scope, tag, status = 'active') {
  const userId = await createUser(tag)
  await db.query(
    `INSERT INTO public.agency_memberships (agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
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

/** Runs fn as the authenticated role for `userId`, then returns to superuser. */
async function asActor(userId, fn) {
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await actAsService()
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

// ---------------------------------------------------------------------------
// Dispatch-shaped fixtures (same shapes as fleet_assignment_reservations.db.test.mjs)
// ---------------------------------------------------------------------------
const T0 = Date.now()
const at = (hours) => new Date(T0 + 24 * 3600e3 + hours * 3600e3).toISOString()
const W1 = [at(0), at(4)]
const W3 = [at(12), at(16)]

let customerUserId
let customerId
let agencyUserA
let agencyUserB
let agencyUserS
let agencyA
let agencyB
let agencyS

/** Approved (or otherwise) driver with an ACTIVE employment record at the given agency. */
async function freshDriverAt(agencyId, tag, { status = 'approved', licenceExpiry = '2030-01-01' } = {}) {
  const userId = await createUser(`${tag}-drv`)
  const driverId = await createDriver(userId, tag, status)
  const employmentId = await createEmploymentRow(agencyId, driverId, {
    licence_number: `DL-${tag}-${seq}`,
    licence_class: 'HGV',
    licence_expiry: licenceExpiry,
    status: 'active',
  })
  return { userId, driverId, employmentId }
}

/** Vehicle at the given agency with current document dates. */
async function freshVehicleAt(agencyId, tag, columns = {}) {
  return createTruckRow(agencyId, `RC-${tag}-${seq}`, {
    insurance_expiry: '2030-01-01',
    fitness_expiry: '2030-01-01',
    permit_expiry: '2030-01-01',
    puc_expiry: '2030-01-01',
    ...columns,
  })
}

/** Agency job + pending dispatch offer for a driver at the given agency. */
async function newJobAt(agencyId, driverId, { offerExpires = "now() + interval '48 hours'" } = {}) {
  const shipment = await createShipment(customerId, customerUserId, `SS-${++seq}`)
  const jobId = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, 'pending')`,
    [jobId, agencyId, shipment.id]
  )
  const offerId = uid()
  await db.query(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), ${offerExpires}, 'pending', '4321', '8765')`,
    [offerId, shipment.id, driverId]
  )
  return { jobId, offerId, shipmentId: shipment.id }
}

/** Service-seeded agency job row with a matching active consent (for direct-write tests). */
async function serviceJobWithConsent(agencyId) {
  const shipment = await createShipment(customerId, customerUserId, `SJ-${++seq}`)
  await insertConsent(shipment.id, agencyId)
  const jobId = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare) VALUES ($1, $2, $3, 15000)`,
    [jobId, agencyId, shipment.id]
  )
  return { jobId, shipmentId: shipment.id }
}

async function setup() {
  customerUserId = await createUser('staffscope-customer')
  customerId = await createCustomer(customerUserId, 'StaffScopeCust')
  agencyUserA = await createUser('staffscope-agency-a')
  agencyA = await createAgencyRow(agencyUserA, 'StaffScope Agency A', 'approved')
  agencyUserB = await createUser('staffscope-agency-b')
  agencyB = await createAgencyRow(agencyUserB, 'StaffScope Agency B', 'approved')
  agencyUserS = await createUser('staffscope-agency-s')
  agencyS = await createAgencyRow(agencyUserS, 'StaffScope Agency S', 'suspended')
}

// ---------------------------------------------------------------------------
// Command wrappers (authenticated role + JWT claims, exactly as PostgREST)
// ---------------------------------------------------------------------------
async function reserveAs(userId, a) {
  return asActor(userId, async () => {
    const result = await db.query(
      `SELECT public.reserve_fleet_assignment($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::integer, $8::text) AS r`,
      [a.jobId, a.offerId, a.vehicleId, a.employmentId, a.start, a.end, a.expectedVersion, a.key]
    )
    return parseJson(result.rows[0].r)
  })
}

async function releaseAs(userId, reservationId, expectedVersion) {
  return asActor(userId, async () => {
    const result = await db.query(`SELECT public.release_fleet_assignment($1::uuid, $2::integer) AS r`, [
      reservationId,
      expectedVersion,
    ])
    return parseJson(result.rows[0].r)
  })
}

/** Default reservation args for a driver/vehicle/job triple. */
function argsFor(d, v, j, window = W1) {
  return {
    jobId: j.jobId,
    offerId: j.offerId,
    vehicleId: v,
    employmentId: d.employmentId,
    start: window[0],
    end: window[1],
    expectedVersion: 1,
    key: `ss-${++seq}-${Date.now()}`,
  }
}

async function reserveOk(userId, d, v, j, window = W1) {
  const r = await reserveAs(userId, argsFor(d, v, j, window))
  expect(r && r.ok === true && r.state === 'created', `expected reserve ok/created, got ${JSON.stringify(r)}`)
  return r.reservation
}

async function reservationsForJob(jobId) {
  return (await one(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_job_id = $1`, [jobId])).n
}

async function reservationStatus(id) {
  return one(`SELECT status, released_reason, version FROM public.fleet_assignment_reservations WHERE id = $1`, [id])
}

async function vehicleFare(jobId) {
  return (await one(`SELECT fare::int AS fare FROM public.agency_jobs WHERE id = $1`, [jobId])).fare
}

// ---------------------------------------------------------------------------
// Shared fixtures for the matrix (created once, after setup)
// ---------------------------------------------------------------------------
const SHARED = {}

/** Agency A: one owner-created reservation plus its job and consent (for reads). */
async function ensureSharedA() {
  const d = await freshDriverAt(agencyA, 'shA')
  const v = await freshVehicleAt(agencyA, 'shA')
  const j = await newJobAt(agencyA, d.driverId)
  await insertConsent(j.shipmentId, agencyA)
  const reservation = await reserveOk(agencyUserA, d, v, j)
  SHARED.A = { reservationId: reservation.id, jobId: j.jobId }
}

/** Agency B: the same shape, owned by the outsider owner. */
async function ensureSharedB() {
  const d = await freshDriverAt(agencyB, 'shB')
  const v = await freshVehicleAt(agencyB, 'shB')
  const j = await newJobAt(agencyB, d.driverId)
  await insertConsent(j.shipmentId, agencyB)
  const reservation = await reserveOk(agencyUserB, d, v, j)
  SHARED.B = { reservationId: reservation.id, jobId: j.jobId }
}

// ---------------------------------------------------------------------------
// Actor matrix. `allow` flags come straight from the contract.
// ---------------------------------------------------------------------------
function buildActors(users) {
  return [
    { key: 'owner', label: 'owner', userId: agencyUserA, allow: { rpc: true, read: true, write: true, del: true } },
    { key: 'dispatcher', label: 'dispatcher', userId: users.dispatcher, allow: { rpc: true, read: true, write: true, del: false } },
    { key: 'fleet_manager', label: 'fleet_manager', userId: users.fleetManager, allow: { rpc: false, read: true, write: false, del: false } },
    { key: 'finance', label: 'finance', userId: users.finance, allow: { rpc: false, read: true, write: false, del: false } },
    { key: 'viewer', label: 'viewer', userId: users.viewer, allow: { rpc: false, read: true, write: false, del: false } },
    { key: 'suspended', label: 'suspended staff', userId: users.suspended, allow: { rpc: false, read: false, write: false, del: false } },
    { key: 'revoked', label: 'revoked staff', userId: users.revoked, allow: { rpc: false, read: false, write: false, del: false } },
    { key: 'outsider_owner', label: 'outsider owner (agency B)', userId: agencyUserB, allow: { rpc: false, read: false, write: false, del: false } },
    { key: 'outsider_staff', label: 'outsider staff (agency B)', userId: users.outsiderStaff, allow: { rpc: false, read: false, write: false, del: false } },
  ]
}

function verb(allowed, yes, no) {
  return allowed ? `may ${yes}` : `may not ${no}`
}

// ---------------------------------------------------------------------------
// Matrix cell bodies
// ---------------------------------------------------------------------------

/** RPC reserve: allowed actors get created; denied actors must RAISE and write nothing. */
async function reserveCell(actor) {
  const d = await freshDriverAt(agencyA, `r-${actor.key}`)
  const v = await freshVehicleAt(agencyA, `r-${actor.key}`)
  const j = await newJobAt(agencyA, d.driverId)
  const args = argsFor(d, v, j)
  if (actor.allow.rpc) {
    const r = await reserveAs(actor.userId, args)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    expect(r.reservation.agency_id === agencyA, `reservation stamped with ${r.reservation.agency_id}, expected agency A`)
  } else {
    await expectRaises(reserveAs(actor.userId, args))
    expect((await reservationsForJob(j.jobId)) === 0, 'a denied reserve must not write a reservation row')
  }
}

/** RPC release of an owner-created reservation: allowed actors release; others RAISE and leave it active. */
async function releaseCell(actor) {
  const d = await freshDriverAt(agencyA, `l-${actor.key}`)
  const v = await freshVehicleAt(agencyA, `l-${actor.key}`)
  const j = await newJobAt(agencyA, d.driverId)
  const reservation = await reserveOk(agencyUserA, d, v, j)
  if (actor.allow.rpc) {
    const r = await releaseAs(actor.userId, reservation.id, reservation.version)
    expect(r && r.ok === true && r.state === 'released', `expected ok/released, got ${JSON.stringify(r)}`)
    expect((await reservationStatus(reservation.id)).status === 'released', 'release did not persist')
  } else {
    await expectRaises(releaseAs(actor.userId, reservation.id, reservation.version))
    expect((await reservationStatus(reservation.id)).status === 'active', 'a denied release changed the reservation')
  }
}

/** SELECT on the three agency-side tables, filtered to agency A. */
async function readCell(actor) {
  const count = (sql) => asActor(actor.userId, async () => (await one(sql, [agencyA])).n)
  const checks = [
    ['fleet_assignment_reservations', async () => {
      const n = await count(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_id = $1`)
      if (actor.allow.read) expect(n >= 1, `saw ${n} agency-A reservation rows`)
      else expect(n === 0, `saw ${n} agency-A reservation rows`)
    }],
    ['agency_jobs', async () => {
      const n = await count(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE agency_id = $1`)
      if (actor.allow.read) expect(n >= 1, `saw ${n} agency-A job rows`)
      else expect(n === 0, `saw ${n} agency-A job rows`)
    }],
    ['shipment_agency_consents', async () => {
      const n = await count(`SELECT count(*)::int AS n FROM public.shipment_agency_consents WHERE agency_id = $1`)
      if (actor.allow.read) expect(n >= 1, `saw ${n} agency-A consent rows`)
      else expect(n === 0, `saw ${n} agency-A consent rows`)
    }],
  ]
  await gather(checks)
}

/** Direct agency_jobs INSERT and UPDATE through RLS, with a valid consent. */
async function writeCell(actor) {
  const checks = []

  checks.push(['INSERT', async () => {
    const shipment = await createShipment(customerId, customerUserId, `WI-${++seq}`)
    await insertConsent(shipment.id, agencyA)
    let insertErr = null
    let inserted = null
    try {
      inserted = await asActor(actor.userId, () =>
        rows(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1) RETURNING id`, [agencyA, shipment.id])
      )
    } catch (error) {
      insertErr = firstLine(error)
    }
    const persisted = (await one(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE shipment_id = $1`, [shipment.id])).n
    if (actor.allow.write) {
      expect(!insertErr && inserted && inserted.length === 1, `expected INSERT to succeed, got ${insertErr || '0 rows'}`)
      expect(persisted === 1, `expected 1 persisted job, found ${persisted}`)
    } else {
      expect(insertErr && /row-level security/.test(insertErr), `expected a row-level security denial, got ${insertErr ? JSON.stringify(insertErr) : 'success'}`)
      expect(persisted === 0, `a denied INSERT persisted ${persisted} row(s)`)
    }
  }])

  checks.push(['UPDATE', async () => {
    const seeded = await serviceJobWithConsent(agencyA)
    let updateErr = null
    let updated = []
    try {
      updated = await asActor(actor.userId, () =>
        rows(`UPDATE public.agency_jobs SET fare = 15001 WHERE id = $1 RETURNING id`, [seeded.jobId])
      )
    } catch (error) {
      updateErr = firstLine(error)
    }
    const fare = await vehicleFare(seeded.jobId)
    if (actor.allow.write) {
      expect(!updateErr && updated.length === 1, `expected UPDATE to affect 1 row, got ${updateErr || updated.length}`)
      expect(fare === 15001, `expected fare 15001, found ${fare}`)
    } else {
      // Denial: 0 rows affected (the contract), or an explicit row-level security raise.
      const denied = (!updateErr && updated.length === 0) || (updateErr && /row-level security/.test(updateErr))
      expect(denied, `expected 0 rows affected, got ${updateErr || updated.length + ' rows'}`)
      expect(fare === 15000, `a denied UPDATE changed the fare to ${fare}`)
    }
  }])

  await gather(checks)
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
  await setup()

  // Staff seeded by superuser INSERT into public.agency_memberships.
  const users = {
    dispatcher: await addMembership(agencyA, 'dispatcher', 'ss-dispatcher'),
    fleetManager: await addMembership(agencyA, 'fleet_manager', 'ss-fleet'),
    finance: await addMembership(agencyA, 'finance', 'ss-finance'),
    viewer: await addMembership(agencyA, 'viewer', 'ss-viewer'),
    suspended: await addMembership(agencyS, 'dispatcher', 'ss-suspended'),
    revoked: await addMembership(agencyA, 'dispatcher', 'ss-revoked', 'revoked'),
    outsiderStaff: await addMembership(agencyB, 'dispatcher', 'ss-outsider-b'),
  }
  const noMembershipUser = await createUser('ss-no-membership')
  const ACTORS = buildActors(users)
  await ensureSharedA()
  await ensureSharedB()

  // =========================================================================
  // P. Precondition
  // =========================================================================
  await testCase('P1. agency_memberships carries scope, status and revoked_at', async () => {
    const n = (await one(`SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agency_memberships' AND column_name IN ('scope', 'status', 'revoked_at')`)).n
    expect(n === 3, `expected 3 membership columns, found ${n}`)
  })

  // =========================================================================
  // R. RPC reserve matrix (one case per actor)
  // =========================================================================
  for (const [i, actor] of ACTORS.entries()) {
    await testCase(`R${i + 1}. ${actor.label} ${verb(actor.allow.rpc, 'reserve', 'reserve')}`, () => reserveCell(actor))
  }

  // =========================================================================
  // L. RPC release matrix (owner-created reservation, one case per actor)
  // =========================================================================
  for (const [i, actor] of ACTORS.entries()) {
    await testCase(`L${i + 1}. ${actor.label} ${verb(actor.allow.rpc, 'release an owner-created reservation', 'release an owner-created reservation')}`, () => releaseCell(actor))
  }

  // =========================================================================
  // S. Agency-side SELECT matrix (one case per actor, all three tables)
  // =========================================================================
  for (const [i, actor] of ACTORS.entries()) {
    await testCase(`S${i + 1}. ${actor.label} ${verb(actor.allow.read, 'read agency A reservations, jobs and consents', 'read agency A reservations, jobs or consents')}`, () => readCell(actor))
  }

  // =========================================================================
  // W. Direct agency_jobs INSERT / UPDATE matrix (one case per actor)
  // =========================================================================
  for (const [i, actor] of ACTORS.entries()) {
    await testCase(`W${i + 1}. ${actor.label} ${verb(actor.allow.write, 'insert and update agency jobs', 'insert or update agency jobs')}`, () => writeCell(actor))
  }

  // =========================================================================
  // X. agency_jobs DELETE: owner only
  // =========================================================================
  await testCase('X1. owner may delete an agency job', async () => {
    const seeded = await serviceJobWithConsent(agencyA)
    const deleted = await asActor(agencyUserA, () =>
      rows(`DELETE FROM public.agency_jobs WHERE id = $1 RETURNING id`, [seeded.jobId])
    )
    expect(deleted.length === 1, `expected owner DELETE to remove 1 row, got ${deleted.length}`)
  })

  await testCase('X2. no non-owner may delete an agency job', async () => {
    const others = ACTORS.filter((a) => a.key !== 'owner')
    const checks = others.map((actor) => [actor.label, async () => {
      const seeded = await serviceJobWithConsent(agencyA)
      const deleted = await asActor(actor.userId, () =>
        rows(`DELETE FROM public.agency_jobs WHERE id = $1 RETURNING id`, [seeded.jobId])
      )
      expect(deleted.length === 0, `DELETE removed ${deleted.length} row(s)`)
      const still = (await one(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE id = $1`, [seeded.jobId])).n
      expect(still === 1, 'the job row is gone')
    }])
    await gather(checks)
  })

  // =========================================================================
  // T. Tenant isolation: dispatcher of agency A versus agency B
  // =========================================================================
  await testCase('T1. dispatcher of agency A cannot reserve against an agency B job', async () => {
    const d = await freshDriverAt(agencyB, 't1b')
    const v = await freshVehicleAt(agencyB, 't1b')
    const j = await newJobAt(agencyB, d.driverId)
    await expectRaises(reserveAs(users.dispatcher, argsFor(d, v, j)))
    expect((await reservationsForJob(j.jobId)) === 0, 'a cross-agency reserve wrote a row')
  })

  await testCase('T2. dispatcher of agency A cannot see agency B reservations, jobs or consents', async () => {
    await gather([
      ['reservations', async () => {
        const n = await asActor(users.dispatcher, async () => (await one(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_id = $1`, [agencyB])).n)
        expect(n === 0, `saw ${n} agency-B reservation rows`)
      }],
      ['jobs', async () => {
        const n = await asActor(users.dispatcher, async () => (await one(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE agency_id = $1`, [agencyB])).n)
        expect(n === 0, `saw ${n} agency-B job rows`)
      }],
      ['consents', async () => {
        const n = await asActor(users.dispatcher, async () => (await one(`SELECT count(*)::int AS n FROM public.shipment_agency_consents WHERE agency_id = $1`, [agencyB])).n)
        expect(n === 0, `saw ${n} agency-B consent rows`)
      }],
    ])
  })

  await testCase('T3. dispatcher of agency A cannot update, insert into, or release agency B work', async () => {
    const shipment = await createShipment(customerId, customerUserId, 'T3-B')
    await insertConsent(shipment.id, agencyB)
    await gather([
      ['update B job', async () => {
        const updated = await asActor(users.dispatcher, () =>
          rows(`UPDATE public.agency_jobs SET fare = 15001 WHERE id = $1 RETURNING id`, [SHARED.B.jobId])
        ).catch((e) => {
          if (/row-level security/.test(firstLine(e))) return []
          throw e
        })
        expect(updated.length === 0, `updated ${updated.length} agency-B job row(s)`)
        expect((await vehicleFare(SHARED.B.jobId)) === 15000, 'agency-B job fare changed')
      }],
      ['insert into B', async () => {
        const inserted = await asActor(users.dispatcher, () =>
          rows(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1) RETURNING id`, [agencyB, shipment.id])
        ).catch((e) => {
          expect(/row-level security/.test(firstLine(e)), `expected row-level security, got ${firstLine(e)}`)
          return []
        })
        expect(inserted.length === 0, 'an agency-B job was inserted by an agency-A dispatcher')
      }],
      ['release B reservation', async () => {
        await expectRaises(releaseAs(users.dispatcher, SHARED.B.reservationId, 1))
        expect((await reservationStatus(SHARED.B.reservationId)).status === 'active', 'agency-B reservation was released')
      }],
    ])
  })

  // =========================================================================
  // RA. Release authority on an owner-created reservation
  // =========================================================================
  await testCase('RA1. owner-created reservation released by a dispatcher frees the vehicle for re-reserve', async () => {
    const d = await freshDriverAt(agencyA, 'ra1')
    const v = await freshVehicleAt(agencyA, 'ra1')
    const j1 = await newJobAt(agencyA, d.driverId)
    const j2 = await newJobAt(agencyA, d.driverId)
    const reservation = await reserveOk(agencyUserA, d, v, j1)
    const released = await releaseAs(users.dispatcher, reservation.id, reservation.version)
    expect(released.ok === true && released.state === 'released', `dispatcher release: ${JSON.stringify(released)}`)
    await reserveOk(agencyUserA, d, v, j2)
  })

  await testCase('RA2. owner-created reservation stays active after a viewer release attempt', async () => {
    const d = await freshDriverAt(agencyA, 'ra2')
    const v = await freshVehicleAt(agencyA, 'ra2')
    const j = await newJobAt(agencyA, d.driverId)
    const reservation = await reserveOk(agencyUserA, d, v, j)
    await expectRaises(releaseAs(users.viewer, reservation.id, reservation.version))
    expect((await reservationStatus(reservation.id)).status === 'active', 'viewer release changed the reservation')
  })

  // =========================================================================
  // ER. Error text
  // =========================================================================
  await testCase('ER1. fleet_manager of the right agency gets exactly the scope message on reserve', async () => {
    const d = await freshDriverAt(agencyA, 'er1')
    const v = await freshVehicleAt(agencyA, 'er1')
    const j = await newJobAt(agencyA, d.driverId)
    await expectExactError(reserveAs(users.fleetManager, argsFor(d, v, j)), 'Your access scope does not allow this action.')
  })

  await testCase('ER2. a user with no agency or membership gets exactly the no-profile message on reserve', async () => {
    const d = await freshDriverAt(agencyA, 'er2')
    const v = await freshVehicleAt(agencyA, 'er2')
    const j = await newJobAt(agencyA, d.driverId)
    await expectExactError(reserveAs(noMembershipUser, argsFor(d, v, j)), 'No agency profile found for this account.')
  })

  // =========================================================================
  // O. Owner regression (must keep passing)
  // =========================================================================
  await testCase('O1. owner reserve then release round-trips', async () => {
    const d = await freshDriverAt(agencyA, 'o1')
    const v = await freshVehicleAt(agencyA, 'o1')
    const j = await newJobAt(agencyA, d.driverId)
    const reservation = await reserveOk(agencyUserA, d, v, j)
    const released = await releaseAs(agencyUserA, reservation.id, reservation.version)
    expect(released.ok === true && released.state === 'released', `release: ${JSON.stringify(released)}`)
  })

  await testCase('O2. owner idempotent replay returns the same reservation with no second row', async () => {
    const d = await freshDriverAt(agencyA, 'o2')
    const v = await freshVehicleAt(agencyA, 'o2')
    const j = await newJobAt(agencyA, d.driverId)
    const a = argsFor(d, v, j)
    const first = await reserveAs(agencyUserA, a)
    expect(first.ok === true && first.state === 'created', `first call: ${JSON.stringify(first)}`)
    const replay = await reserveAs(agencyUserA, a)
    expect(replay.ok === true && replay.state === 'idempotent_replay', `replay state: ${JSON.stringify(replay)}`)
    expect(replay.reservation.id === first.reservation.id, 'replay returned a different reservation')
    const n = (await one(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_id = $1 AND idempotency_key = $2`, [agencyA, a.key])).n
    expect(n === 1, `expected one row for the key, found ${n}`)
  })

  await testCase('O3. owner release replay returns already_released without a second write', async () => {
    const d = await freshDriverAt(agencyA, 'o3')
    const v = await freshVehicleAt(agencyA, 'o3')
    const j = await newJobAt(agencyA, d.driverId)
    const reservation = await reserveOk(agencyUserA, d, v, j)
    const first = await releaseAs(agencyUserA, reservation.id, reservation.version)
    const replay = await releaseAs(agencyUserA, reservation.id, first.version)
    expect(replay.ok === true && replay.state === 'already_released', `replay: ${JSON.stringify(replay)}`)
    expect(replay.version === first.version, 'replay must not bump the version')
  })

  // =========================================================================
  // M. Mid-session revoke (own dispatcher; must run after the matrix)
  // =========================================================================
  await testCase('M1. a dispatcher revoked mid-session is denied on the same session’s next reserve and reads', async () => {
    const midUser = await addMembership(agencyA, 'dispatcher', 'ss-mid')
    const d = await freshDriverAt(agencyA, 'm1')
    const v = await freshVehicleAt(agencyA, 'm1')
    const j1 = await newJobAt(agencyA, d.driverId)
    const j2 = await newJobAt(agencyA, d.driverId)

    // Precondition: the dispatcher succeeds once before the revoke.
    const before = await reserveAs(midUser, argsFor(d, v, j1))
    expect(before.ok === true && before.state === 'created', `precondition: dispatcher reserve before revoke: ${JSON.stringify(before)}`)

    // Superuser revokes the membership; the SAME session keeps going.
    await db.query(
      `UPDATE public.agency_memberships SET status = 'revoked', revoked_at = now() WHERE user_id = $1 AND agency_id = $2`,
      [midUser, agencyA]
    )

    await gather([
      ['reserve after revoke', () => expectRaises(reserveAs(midUser, argsFor(d, v, j2)))],
      ['jobs read after revoke', async () => {
        const n = await asActor(midUser, async () => (await one(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE agency_id = $1`, [agencyA])).n)
        expect(n === 0, `saw ${n} agency-A job rows after revoke`)
      }],
      ['reservations read after revoke', async () => {
        const n = await asActor(midUser, async () => (await one(`SELECT count(*)::int AS n FROM public.fleet_assignment_reservations WHERE agency_id = $1`, [agencyA])).n)
        expect(n === 0, `saw ${n} agency-A reservation rows after revoke`)
      }],
    ])
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed; ${findings.length} findings`)
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
