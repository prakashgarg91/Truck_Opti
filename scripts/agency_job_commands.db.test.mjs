#!/usr/bin/env node
/**
 * Agency job / truck command RPCs — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the four SECURITY DEFINER
 * command RPCs the way PostgREST does per request: `SET ROLE authenticated`
 * with `request.jwt.claims` set to the caller's sub.
 *
 * Pinned contract under test (the migration that implements it is NOT written
 * yet, so every RPC case is EXPECTED to fail now):
 *   A) public.agency_job_set_status(p_job_id uuid, p_status text)        scope dispatcher
 *   B) public.agency_job_assign_driver(p_job_id uuid, p_driver_id uuid)  scope dispatcher
 *   C) public.agency_truck_assign_driver(p_truck_id uuid, p_driver_id uuid, p_expected_version integer)    scope fleet_manager
 *   D) public.agency_truck_unassign_driver(p_truck_id uuid, p_expected_version integer)                    scope fleet_manager
 *   - All return jsonb. Business refusals are {ok:false,error:'<code>'}; access
 *     and state-guard failures are RAISE EXCEPTION with the text listed below.
 *   - No RPC takes an agency id argument. The owner is always allowed.
 *   - Scope gate (shared resolver resolve_caller_agency_for_scopes):
 *       suspended-agency staff  -> 'Agency approval is required.'
 *       user with no agency     -> 'No agency profile found for this account.'
 *       wrong scope, same agency-> 'Your access scope does not allow this action.'
 *       other agency's target   -> job: 'Job not found or access denied.'
 *                                  truck: '... not found or access denied.'
 *   - EXECUTE: authenticated and service_role only (anon denied).
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST /
 * GoTrue behaviour is NOT covered. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_job_commands.db.test.mjs   (from the repo root)
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

/** Denial helper: exact exception text, or a substring for the other-agency truck case. */
async function expectDenied(promise, denial) {
  if (denial.exact !== undefined) return expectExactError(promise, denial.exact)
  return expectRaises(promise, denial.contains)
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
// Fixtures (service-role equivalent: run as the postgres superuser)
// Same shapes and columns as scripts/staff_scope_dispatch.db.test.mjs.
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const MISSING_JOB = uid()
const MISSING_TRUCK = uid()

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
  const reference = `AGJOBCMD-${tag}-${Date.now()}-${seq}`
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

async function rows(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows
}

async function one(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows[0]
}

// ---------------------------------------------------------------------------
// Dispatch-shaped fixtures
// ---------------------------------------------------------------------------
const T0 = Date.now()
const at = (hours) => new Date(T0 + 24 * 3600e3 + hours * 3600e3).toISOString()
const W1 = [at(0), at(4)]

let customerUserId
let customerId
let agencyUserA
let agencyUserB
let agencyUserS
let agencyA
let agencyB
let agencyS

/** Approved driver with an ACTIVE employment record at the given agency. */
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

/** Pending agency job (no offer) at the given agency, with a matching active consent. */
async function freshJobAt(agencyId, status = 'pending') {
  const shipment = await createShipment(customerId, customerUserId, `JOB-${++seq}`)
  await insertConsent(shipment.id, agencyId)
  const jobId = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, $4)`,
    [jobId, agencyId, shipment.id, status]
  )
  return { jobId, shipmentId: shipment.id }
}

/** Agency job + pending dispatch offer for a driver at the given agency (reservable). */
async function newJobAt(agencyId, driverId) {
  const shipment = await createShipment(customerId, customerUserId, `RSV-${++seq}`)
  await insertConsent(shipment.id, agencyId)
  const jobId = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, 'pending')`,
    [jobId, agencyId, shipment.id]
  )
  const offerId = uid()
  await db.query(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), now() + interval '48 hours', 'pending', '4321', '8765')`,
    [offerId, shipment.id, driverId]
  )
  return { jobId, offerId, shipmentId: shipment.id }
}

async function setJobStatus(jobId, status) {
  await db.query(`UPDATE public.agency_jobs SET status = $2 WHERE id = $1`, [jobId, status])
}

async function jobRow(jobId) {
  return one(`SELECT status, driver_id, assigned_at FROM public.agency_jobs WHERE id = $1`, [jobId])
}

/** Service-seeded truck driver pairing (superuser; triggers still run). */
async function setTruckDriver(truckId, driverId) {
  await db.query(`UPDATE public.agency_trucks SET driver_id = $2 WHERE id = $1`, [truckId, driverId])
}

async function truckRow(truckId) {
  return one(`SELECT driver_id, version FROM public.agency_trucks WHERE id = $1`, [truckId])
}

async function truckVersion(truckId) {
  return (await truckRow(truckId)).version
}

async function setup() {
  customerUserId = await createUser('agjobcmd-customer')
  customerId = await createCustomer(customerUserId, 'AgJobCmdCust')
  agencyUserA = await createUser('agjobcmd-agency-a')
  agencyA = await createAgencyRow(agencyUserA, 'AgJobCmd Agency A', 'approved')
  agencyUserB = await createUser('agjobcmd-agency-b')
  agencyB = await createAgencyRow(agencyUserB, 'AgJobCmd Agency B', 'approved')
  agencyUserS = await createUser('agjobcmd-agency-s')
  agencyS = await createAgencyRow(agencyUserS, 'AgJobCmd Agency S', 'suspended')
}

// ---------------------------------------------------------------------------
// Command wrappers (authenticated role + JWT claims, exactly as PostgREST)
// ---------------------------------------------------------------------------
async function callRpc(userId, sql, params) {
  return asActor(userId, async () => {
    const result = await db.query(sql, params)
    return parseJson(result.rows[0].r)
  })
}

const setStatusAs = (userId, jobId, status) =>
  callRpc(userId, `SELECT public.agency_job_set_status($1::uuid, $2::text) AS r`, [jobId, status])
const assignJobAs = (userId, jobId, driverId) =>
  callRpc(userId, `SELECT public.agency_job_assign_driver($1::uuid, $2::uuid) AS r`, [jobId, driverId])
const truckAssignAs = (userId, truckId, driverId, expectedVersion) =>
  callRpc(userId, `SELECT public.agency_truck_assign_driver($1::uuid, $2::uuid, $3::integer) AS r`, [
    truckId,
    driverId,
    expectedVersion,
  ])
const truckUnassignAs = (userId, truckId, expectedVersion) =>
  callRpc(userId, `SELECT public.agency_truck_unassign_driver($1::uuid, $2::integer) AS r`, [truckId, expectedVersion])

function argsFor(d, v, j, window = W1) {
  return {
    jobId: j.jobId,
    offerId: j.offerId,
    vehicleId: v,
    employmentId: d.employmentId,
    start: window[0],
    end: window[1],
    expectedVersion: 1,
    key: `ac-${++seq}-${Date.now()}`,
  }
}

/** Owner reserves a fleet assignment (real, existing RPC; used as fixture for the reservation rules). */
async function reserveOk(userId, d, v, j) {
  const args = argsFor(d, v, j)
  const r = await asActor(userId, async () => {
    const result = await db.query(
      `SELECT public.reserve_fleet_assignment($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::integer, $8::text) AS r`,
      [args.jobId, args.offerId, args.vehicleId, args.employmentId, args.start, args.end, args.expectedVersion, args.key]
    )
    return parseJson(result.rows[0].r)
  })
  expect(r && r.ok === true && r.state === 'created', `expected reserve ok/created, got ${JSON.stringify(r)}`)
  return r.reservation
}

async function reservationStatus(id) {
  return one(`SELECT status, released_reason, version FROM public.fleet_assignment_reservations WHERE id = $1`, [id])
}

// ---------------------------------------------------------------------------
// Actors
// ---------------------------------------------------------------------------
/**
 * scopes: scopes the actor holds on agency A (owner holds all).
 * denial: when set, the scope gate or target check refuses the call:
 *   a string => exact exception text from the scope gate
 *   'target' => the actor's own agency (B) cannot see agency A's target
 */
function sActors(users) {
  return [
    { key: 'owner', label: 'owner', userId: null, scopes: ['dispatcher', 'fleet_manager'] },
    { key: 'dispatcher', label: 'dispatcher', userId: users.dispatcher, scopes: ['dispatcher'] },
    { key: 'fleet_manager', label: 'fleet_manager', userId: users.fleetManager, scopes: ['fleet_manager'] },
    { key: 'finance', label: 'finance', userId: users.finance, scopes: [] },
    { key: 'viewer', label: 'viewer', userId: users.viewer, scopes: [] },
    {
      key: 'suspended', label: 'suspended-agency staff', userId: users.suspended, scopes: [],
      denial: 'Agency approval is required.',
    },
    {
      key: 'no_agency', label: 'user with no agency', userId: users.noAgency, scopes: [],
      denial: 'No agency profile found for this account.',
    },
    { key: 'outsider_owner', label: 'outsider owner (agency B)', userId: agencyUserB, scopes: [], denial: 'target' },
  ]
}

const RPCS = {
  A: { key: 'A', name: 'agency_job_set_status', scope: 'dispatcher', target: 'job' },
  B: { key: 'B', name: 'agency_job_assign_driver', scope: 'dispatcher', target: 'job' },
  C: { key: 'C', name: 'agency_truck_assign_driver', scope: 'fleet_manager', target: 'truck' },
  D: { key: 'D', name: 'agency_truck_unassign_driver', scope: 'fleet_manager', target: 'truck' },
}

/** The refusal an actor must receive for a given RPC (only meaningful when not allowed). */
function denialFor(actor, rpc) {
  if (actor.denial === 'target') {
    return rpc.target === 'job'
      ? { exact: 'Job not found or access denied.' }
      : { contains: 'not found or access denied' }
  }
  if (actor.denial) return { exact: actor.denial }
  return { exact: 'Your access scope does not allow this action.' }
}

// ---------------------------------------------------------------------------
// Matrix cell bodies (S). Allowed actors must succeed; others must be refused
// with the exact denial AND leave the target untouched.
// ---------------------------------------------------------------------------
async function scopeCell(rpc, actor) {
  const allowed = actor.scopes.includes(rpc.scope)
  const denial = denialFor(actor, rpc)
  const userId = actor.key === 'owner' ? agencyUserA : actor.userId

  if (rpc.key === 'A') {
    const j = await freshJobAt(agencyA)
    const call = setStatusAs(userId, j.jobId, 'accepted')
    if (allowed) {
      const r = await call
      expect(r && r.ok === true && r.state === 'updated', `expected updated, got ${JSON.stringify(r)}`)
      expect((await jobRow(j.jobId)).status === 'accepted', 'allowed set_status did not persist')
    } else {
      await expectDenied(call, denial)
      expect((await jobRow(j.jobId)).status === 'pending', 'a refused set_status changed the job')
    }
    return
  }

  if (rpc.key === 'B') {
    const j = await freshJobAt(agencyA)
    const d = await freshDriverAt(agencyA, `sb-${actor.key}`)
    const call = assignJobAs(userId, j.jobId, d.driverId)
    if (allowed) {
      const r = await call
      expect(r && r.ok === true && r.state === 'assigned', `expected assigned, got ${JSON.stringify(r)}`)
      expect((await jobRow(j.jobId)).driver_id === d.driverId, 'allowed assign did not persist the driver')
    } else {
      await expectDenied(call, denial)
      expect((await jobRow(j.jobId)).driver_id === null, 'a refused assign changed the job driver')
    }
    return
  }

  if (rpc.key === 'C') {
    const t = await freshVehicleAt(agencyA, `sc-${actor.key}`)
    const d = await freshDriverAt(agencyA, `sc-${actor.key}`)
    const v = await truckVersion(t)
    const call = truckAssignAs(userId, t, d.driverId, v)
    if (allowed) {
      const r = await call
      expect(r && r.ok === true && r.state === 'assigned', `expected assigned, got ${JSON.stringify(r)}`)
      expect((await truckRow(t)).driver_id === d.driverId, 'allowed truck assign did not persist the driver')
    } else {
      await expectDenied(call, denial)
      expect((await truckRow(t)).driver_id === null, 'a refused truck assign changed the truck driver')
    }
    return
  }

  // rpc.key === 'D'
  const t = await freshVehicleAt(agencyA, `sd-${actor.key}`)
  const d = await freshDriverAt(agencyA, `sd-${actor.key}`)
  await setTruckDriver(t, d.driverId)
  const v = await truckVersion(t)
  const call = truckUnassignAs(userId, t, v)
  if (allowed) {
    const r = await call
    expect(r && r.ok === true && r.state === 'unassigned', `expected unassigned, got ${JSON.stringify(r)}`)
    expect((await truckRow(t)).driver_id === null, 'allowed unassign did not clear the driver')
  } else {
    await expectDenied(call, denial)
    expect((await truckRow(t)).driver_id === d.driverId, 'a refused unassign cleared the truck driver')
  }
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
    dispatcher: await addMembership(agencyA, 'dispatcher', 'ac-dispatcher'),
    fleetManager: await addMembership(agencyA, 'fleet_manager', 'ac-fleet'),
    finance: await addMembership(agencyA, 'finance', 'ac-finance'),
    viewer: await addMembership(agencyA, 'viewer', 'ac-viewer'),
    suspended: await addMembership(agencyS, 'dispatcher', 'ac-suspended'),
  }
  users.noAgency = await createUser('ac-no-agency')
  const ACTORS = sActors(users)
  ACTORS.find((a) => a.key === 'owner').userId = agencyUserA

  // =========================================================================
  // A. agency_job_set_status (dispatcher)
  // =========================================================================
  await testCase('A1. pending -> accepted succeeds and persists', async () => {
    const j = await freshJobAt(agencyA)
    const r = await setStatusAs(users.dispatcher, j.jobId, 'accepted')
    expect(r && r.ok === true && r.state === 'updated', `expected ok/updated, got ${JSON.stringify(r)}`)
    expect(r.job && r.job.status === 'accepted', `returned job status ${r.job && r.job.status}`)
    expect((await jobRow(j.jobId)).status === 'accepted', 'status not persisted')
  })

  await testCase('A2. pending -> cancelled succeeds and persists', async () => {
    const j = await freshJobAt(agencyA)
    const r = await setStatusAs(users.dispatcher, j.jobId, 'cancelled')
    expect(r && r.ok === true && r.state === 'updated', `expected ok/updated, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).status === 'cancelled', 'status not persisted')
  })

  await testCase('A3. accepted -> cancelled succeeds and releases the ACTIVE fleet reservation', async () => {
    const d = await freshDriverAt(agencyA, 'a3')
    const v = await freshVehicleAt(agencyA, 'a3')
    const j = await newJobAt(agencyA, d.driverId)
    const reservation = await reserveOk(agencyUserA, d, v, j)
    await setJobStatus(j.jobId, 'accepted')
    const r = await setStatusAs(users.dispatcher, j.jobId, 'cancelled')
    expect(r && r.ok === true && r.state === 'updated', `expected ok/updated, got ${JSON.stringify(r)}`)
    const res = await reservationStatus(reservation.id)
    expect(res.status === 'released', `reservation still ${res.status} after job cancel`)
    expect(res.released_reason === 'agency_job_cancelled', `released_reason ${res.released_reason}`)
  })

  await testCase('A4. accepted -> delivered succeeds', async () => {
    const j = await freshJobAt(agencyA, 'accepted')
    const r = await setStatusAs(users.dispatcher, j.jobId, 'delivered')
    expect(r && r.ok === true && r.state === 'updated', `expected ok/updated, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).status === 'delivered', 'status not persisted')
  })

  await testCase('A5. in_transit -> delivered succeeds', async () => {
    const j = await freshJobAt(agencyA, 'in_transit')
    const r = await setStatusAs(users.dispatcher, j.jobId, 'delivered')
    expect(r && r.ok === true && r.state === 'updated', `expected ok/updated, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).status === 'delivered', 'status not persisted')
  })

  await testCase('A6. same status again returns unchanged and writes nothing', async () => {
    const j = await freshJobAt(agencyA)
    const r = await setStatusAs(users.dispatcher, j.jobId, 'pending')
    expect(r && r.ok === true && r.state === 'unchanged', `expected ok/unchanged, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).status === 'pending', 'status moved on unchanged')
  })

  await testCase('A7. delivered -> accepted is invalid_transition and leaves the job delivered', async () => {
    const j = await freshJobAt(agencyA, 'delivered')
    const r = await setStatusAs(users.dispatcher, j.jobId, 'accepted')
    expect(r && r.ok === false && r.error === 'invalid_transition', `expected invalid_transition, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).status === 'delivered', 'an invalid transition changed the job')
  })

  await testCase('A8. cancelled -> accepted is invalid_transition and leaves the job cancelled', async () => {
    const j = await freshJobAt(agencyA, 'cancelled')
    const r = await setStatusAs(users.dispatcher, j.jobId, 'accepted')
    expect(r && r.ok === false && r.error === 'invalid_transition', `expected invalid_transition, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).status === 'cancelled', 'an invalid transition changed the job')
  })

  await testCase('A9. pending -> delivered is invalid_transition', async () => {
    const j = await freshJobAt(agencyA)
    const r = await setStatusAs(users.dispatcher, j.jobId, 'delivered')
    expect(r && r.ok === false && r.error === 'invalid_transition', `expected invalid_transition, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).status === 'pending', 'an invalid transition changed the job')
  })

  await testCase('A10. pending -> in_transit and in_transit -> cancelled are both invalid_transition', async () => {
    const pending = await freshJobAt(agencyA)
    const transit = await freshJobAt(agencyA, 'in_transit')
    await gather([
      ['pending -> in_transit', async () => {
        const r = await setStatusAs(users.dispatcher, pending.jobId, 'in_transit')
        expect(r && r.ok === false && r.error === 'invalid_transition', `got ${JSON.stringify(r)}`)
        expect((await jobRow(pending.jobId)).status === 'pending', 'job changed')
      }],
      ['in_transit -> cancelled', async () => {
        const r = await setStatusAs(users.dispatcher, transit.jobId, 'cancelled')
        expect(r && r.ok === false && r.error === 'invalid_transition', `got ${JSON.stringify(r)}`)
        expect((await jobRow(transit.jobId)).status === 'in_transit', 'job changed')
      }],
    ])
  })

  await testCase('A11. unknown status string raises "Unknown job status."', async () => {
    const j = await freshJobAt(agencyA)
    await expectExactError(setStatusAs(users.dispatcher, j.jobId, 'archived'), 'Unknown job status.')
    expect((await jobRow(j.jobId)).status === 'pending', 'an unknown status changed the job')
  })

  await testCase('A12. other agency job or unknown id raises "Job not found or access denied."', async () => {
    const other = await freshJobAt(agencyB)
    await gather([
      ['agency B job', async () => {
        await expectExactError(setStatusAs(users.dispatcher, other.jobId, 'accepted'), 'Job not found or access denied.')
        expect((await jobRow(other.jobId)).status === 'pending', 'agency-B job changed by agency-A dispatcher')
      }],
      ['unknown id', () => expectExactError(setStatusAs(users.dispatcher, MISSING_JOB, 'accepted'), 'Job not found or access denied.')],
    ])
  })

  // =========================================================================
  // B. agency_job_assign_driver (dispatcher)
  // =========================================================================
  await testCase('B1. pending job takes an approved, employed driver and stamps assigned_at', async () => {
    const j = await freshJobAt(agencyA)
    const d = await freshDriverAt(agencyA, 'b1')
    const r = await assignJobAs(users.dispatcher, j.jobId, d.driverId)
    expect(r && r.ok === true && r.state === 'assigned', `expected ok/assigned, got ${JSON.stringify(r)}`)
    const row = await jobRow(j.jobId)
    expect(row.driver_id === d.driverId, `job driver_id ${row.driver_id}`)
    expect(row.assigned_at !== null, 'assigned_at is null after assignment')
  })

  await testCase('B2. accepted job also takes an approved, employed driver', async () => {
    const j = await freshJobAt(agencyA, 'accepted')
    const d = await freshDriverAt(agencyA, 'b2')
    const r = await assignJobAs(users.dispatcher, j.jobId, d.driverId)
    expect(r && r.ok === true && r.state === 'assigned', `expected ok/assigned, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).driver_id === d.driverId, 'job driver_id not set')
  })

  await testCase('B3. in_transit, delivered or cancelled job is job_not_assignable', async () => {
    const d = await freshDriverAt(agencyA, 'b3')
    const checks = ['in_transit', 'delivered', 'cancelled'].map((status) => [status, async () => {
      const j = await freshJobAt(agencyA, status)
      const r = await assignJobAs(users.dispatcher, j.jobId, d.driverId)
      expect(r && r.ok === false && r.error === 'job_not_assignable', `got ${JSON.stringify(r)}`)
      expect((await jobRow(j.jobId)).driver_id === null, 'a refused assign set the driver')
    }])
    await gather(checks)
  })

  await testCase('B4. driver not approved is driver_not_approved', async () => {
    const j = await freshJobAt(agencyA)
    const d = await freshDriverAt(agencyA, 'b4', { status: 'pending' })
    const r = await assignJobAs(users.dispatcher, j.jobId, d.driverId)
    expect(r && r.ok === false && r.error === 'driver_not_approved', `got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).driver_id === null, 'a refused assign set the driver')
  })

  await testCase('B5. driver without ACTIVE employment here is driver_not_employed (none, ended, or employed elsewhere)', async () => {
    const j = await freshJobAt(agencyA)
    const none = await createDriver(await createUser('b5-none'), 'b5-none', 'approved')
    const ended = await createDriver(await createUser('b5-ended'), 'b5-ended', 'approved')
    await createEmploymentRow(agencyA, ended, { status: 'ended' })
    const elsewhere = await createDriver(await createUser('b5-else'), 'b5-else', 'approved')
    await createEmploymentRow(agencyB, elsewhere, { status: 'active' })
    const checks = [['no employment', none], ['ended employment', ended], ['employed by agency B', elsewhere]].map(
      ([label, driverId]) => [label, async () => {
        const r = await assignJobAs(users.dispatcher, j.jobId, driverId)
        expect(r && r.ok === false && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
      }]
    )
    await gather(checks)
    expect((await jobRow(j.jobId)).driver_id === null, 'a refused assign set the driver')
  })

  await testCase('B6. job holding an ACTIVE reservation for another driver is job_has_reservation', async () => {
    const d1 = await freshDriverAt(agencyA, 'b6a')
    const d2 = await freshDriverAt(agencyA, 'b6b')
    const v = await freshVehicleAt(agencyA, 'b6')
    const j = await newJobAt(agencyA, d1.driverId)
    await reserveOk(agencyUserA, d1, v, j)
    const r = await assignJobAs(users.dispatcher, j.jobId, d2.driverId)
    expect(r && r.ok === false && r.error === 'job_has_reservation', `got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).driver_id === d1.driverId, 'a refused assign replaced the reserved driver')
  })

  await testCase('B7. same driver already set returns unchanged', async () => {
    const j = await freshJobAt(agencyA)
    const d = await freshDriverAt(agencyA, 'b7')
    await db.query(`UPDATE public.agency_jobs SET driver_id = $2, assigned_at = now() WHERE id = $1`, [j.jobId, d.driverId])
    const r = await assignJobAs(users.dispatcher, j.jobId, d.driverId)
    expect(r && r.ok === true && r.state === 'unchanged', `expected ok/unchanged, got ${JSON.stringify(r)}`)
    expect((await jobRow(j.jobId)).driver_id === d.driverId, 'driver changed on unchanged')
  })

  await testCase('B8. other agency job or unknown id raises "Job not found or access denied."', async () => {
    const d = await freshDriverAt(agencyA, 'b8')
    const other = await freshJobAt(agencyB)
    await gather([
      ['agency B job', async () => {
        await expectExactError(assignJobAs(users.dispatcher, other.jobId, d.driverId), 'Job not found or access denied.')
        expect((await jobRow(other.jobId)).driver_id === null, 'agency-B job was assigned by agency-A dispatcher')
      }],
      ['unknown id', () => expectExactError(assignJobAs(users.dispatcher, MISSING_JOB, d.driverId), 'Job not found or access denied.')],
    ])
  })

  // =========================================================================
  // C. agency_truck_assign_driver (fleet_manager)
  // =========================================================================
  await testCase('C1. assigns an employed driver, bumps version by exactly one', async () => {
    const t = await freshVehicleAt(agencyA, 'c1')
    const d = await freshDriverAt(agencyA, 'c1')
    const v = await truckVersion(t)
    const r = await truckAssignAs(users.fleetManager, t, d.driverId, v)
    expect(r && r.ok === true && r.state === 'assigned', `expected ok/assigned, got ${JSON.stringify(r)}`)
    expect(r.version === v + 1, `returned version ${r.version}, expected ${v + 1}`)
    const row = await truckRow(t)
    expect(row.driver_id === d.driverId, 'truck driver_id not set')
    expect(row.version === v + 1, `stored version ${row.version}, expected ${v + 1}`)
  })

  await testCase('C2. same driver already on the truck returns unchanged without a version bump', async () => {
    const t = await freshVehicleAt(agencyA, 'c2')
    const d = await freshDriverAt(agencyA, 'c2')
    await setTruckDriver(t, d.driverId)
    const v = await truckVersion(t)
    const r = await truckAssignAs(users.fleetManager, t, d.driverId, v)
    expect(r && r.ok === true && r.state === 'unchanged', `expected ok/unchanged, got ${JSON.stringify(r)}`)
    expect((await truckVersion(t)) === v, 'unchanged assign bumped the version')
  })

  await testCase('C3. stale expected version is version_conflict with current_version', async () => {
    const t = await freshVehicleAt(agencyA, 'c3')
    const d = await freshDriverAt(agencyA, 'c3')
    const v = await truckVersion(t)
    const r = await truckAssignAs(users.fleetManager, t, d.driverId, v + 1)
    expect(r && r.ok === false && r.error === 'version_conflict', `got ${JSON.stringify(r)}`)
    expect(r.current_version === v, `current_version ${r.current_version}, expected ${v}`)
    expect((await truckRow(t)).driver_id === null, 'a conflicting assign set the driver')
  })

  await testCase('C4. driver with no ACTIVE employment here is driver_not_employed (none, or ended)', async () => {
    const t = await freshVehicleAt(agencyA, 'c4')
    const v = await truckVersion(t)
    const none = await createDriver(await createUser('c4-none'), 'c4-none', 'approved')
    const ended = await createDriver(await createUser('c4-ended'), 'c4-ended', 'approved')
    await createEmploymentRow(agencyA, ended, { status: 'ended' })
    await gather([
      ['no employment', async () => {
        const r = await truckAssignAs(users.fleetManager, t, none, v)
        expect(r && r.ok === false && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
      }],
      ['ended employment', async () => {
        const r = await truckAssignAs(users.fleetManager, t, ended, v)
        expect(r && r.ok === false && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
      }],
    ])
  })

  await testCase('C5. driver already on another truck is driver_already_assigned', async () => {
    const t1 = await freshVehicleAt(agencyA, 'c5a')
    const t2 = await freshVehicleAt(agencyA, 'c5b')
    const d = await freshDriverAt(agencyA, 'c5')
    await setTruckDriver(t1, d.driverId)
    const v = await truckVersion(t2)
    const r = await truckAssignAs(users.fleetManager, t2, d.driverId, v)
    expect(r && r.ok === false && r.error === 'driver_already_assigned', `got ${JSON.stringify(r)}`)
    expect((await truckRow(t2)).driver_id === null, 'a refused assign set the driver on the second truck')
  })

  await testCase('C6. other agency truck or unknown id raises "not found or access denied"', async () => {
    const d = await freshDriverAt(agencyA, 'c6')
    const otherTruck = await freshVehicleAt(agencyB, 'c6b')
    await gather([
      ['agency B truck', () => expectRaises(truckAssignAs(users.fleetManager, otherTruck, d.driverId, 1), 'not found or access denied')],
      ['unknown id', () => expectRaises(truckAssignAs(users.fleetManager, MISSING_TRUCK, d.driverId, 1), 'not found or access denied')],
    ])
  })

  // =========================================================================
  // D. agency_truck_unassign_driver (fleet_manager)
  // =========================================================================
  await testCase('D1. unassign clears the driver and bumps version by exactly one', async () => {
    const t = await freshVehicleAt(agencyA, 'd1')
    const d = await freshDriverAt(agencyA, 'd1')
    await setTruckDriver(t, d.driverId)
    const v = await truckVersion(t)
    const r = await truckUnassignAs(users.fleetManager, t, v)
    expect(r && r.ok === true && r.state === 'unassigned', `expected ok/unassigned, got ${JSON.stringify(r)}`)
    const row = await truckRow(t)
    expect(row.driver_id === null, 'truck driver_id not cleared')
    expect(row.version === v + 1, `stored version ${row.version}, expected ${v + 1}`)
  })

  await testCase('D2. unassign on an already empty truck returns unchanged', async () => {
    const t = await freshVehicleAt(agencyA, 'd2')
    const v = await truckVersion(t)
    const r = await truckUnassignAs(users.fleetManager, t, v)
    expect(r && r.ok === true && r.state === 'unchanged', `expected ok/unchanged, got ${JSON.stringify(r)}`)
  })

  await testCase('D3. stale expected version is version_conflict with current_version', async () => {
    const t = await freshVehicleAt(agencyA, 'd3')
    const d = await freshDriverAt(agencyA, 'd3')
    await setTruckDriver(t, d.driverId)
    const v = await truckVersion(t)
    const r = await truckUnassignAs(users.fleetManager, t, v + 1)
    expect(r && r.ok === false && r.error === 'version_conflict', `got ${JSON.stringify(r)}`)
    expect(r.current_version === v, `current_version ${r.current_version}, expected ${v}`)
    expect((await truckRow(t)).driver_id === d.driverId, 'a conflicting unassign cleared the driver')
  })

  await testCase('D4. after unassign the same driver can be assigned to another truck', async () => {
    const t1 = await freshVehicleAt(agencyA, 'd4a')
    const t2 = await freshVehicleAt(agencyA, 'd4b')
    const d = await freshDriverAt(agencyA, 'd4')
    await setTruckDriver(t1, d.driverId)
    await truckUnassignAs(users.fleetManager, t1, await truckVersion(t1))
    const r = await truckAssignAs(users.fleetManager, t2, d.driverId, await truckVersion(t2))
    expect(r && r.ok === true && r.state === 'assigned', `expected ok/assigned, got ${JSON.stringify(r)}`)
  })

  await testCase('D5. other agency truck or unknown id raises "not found or access denied"', async () => {
    const otherTruck = await freshVehicleAt(agencyB, 'd5b')
    await gather([
      ['agency B truck', async () => {
        await expectRaises(truckUnassignAs(users.fleetManager, otherTruck, 1), 'not found or access denied')
        expect((await truckRow(otherTruck)).driver_id === null, 'agency-B truck touched')
      }],
      ['unknown id', () => expectRaises(truckUnassignAs(users.fleetManager, MISSING_TRUCK, 1), 'not found or access denied')],
    ])
  })

  // =========================================================================
  // S. Scope matrix: 4 RPCs x 8 actors (one case per cell)
  // =========================================================================
  let sIndex = 0
  for (const rpc of Object.values(RPCS)) {
    for (const actor of ACTORS) {
      sIndex += 1
      const allowed = actor.scopes.includes(rpc.scope)
      const verdict = allowed ? 'may' : 'may not'
      await testCase(`S${sIndex}. ${rpc.key} ${rpc.name}: ${actor.label} ${verdict} call`, () => scopeCell(rpc, actor))
    }
  }

  // =========================================================================
  // G. Grants
  // =========================================================================
  for (const rpc of Object.values(RPCS)) {
    const n = rpc.key === 'A' ? 1 : rpc.key === 'B' ? 2 : rpc.key === 'C' ? 3 : 4
    const sql = {
      A: `SELECT public.agency_job_set_status($1::uuid, $2::text) AS r`,
      B: `SELECT public.agency_job_assign_driver($1::uuid, $2::uuid) AS r`,
      C: `SELECT public.agency_truck_assign_driver($1::uuid, $2::uuid, $3::integer) AS r`,
      D: `SELECT public.agency_truck_unassign_driver($1::uuid, $2::integer) AS r`,
    }[rpc.key]
    const params = {
      A: [MISSING_JOB, 'accepted'],
      B: [MISSING_JOB, MISSING_JOB],
      C: [MISSING_TRUCK, MISSING_JOB, 1],
      D: [MISSING_TRUCK, 1],
    }[rpc.key]
    await testCase(`G${n}. anon may not execute ${rpc.name} (permission denied)`, () =>
      expectRaises(asAnon(sql, params), 'permission denied')
    )
  }

  await testCase('G5. the four RPCs grant EXECUTE to authenticated and service_role, never PUBLIC or anon, and are SECURITY DEFINER with a pinned search_path', async () => {
    const info = await rows(`
      SELECT p.proname,
             p.prosecdef,
             array_to_string(p.proconfig, ',') AS config,
             array_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) AS grantees
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.proname = ANY(ARRAY['agency_job_set_status','agency_job_assign_driver','agency_truck_assign_driver','agency_truck_unassign_driver']::text[])
        AND a.privilege_type = 'EXECUTE'
      GROUP BY p.proname, p.prosecdef, p.proconfig`)
    expect(info.length === 4, `expected 4 functions with grants, found ${info.length}`)
    const failures = []
    for (const r of info) {
      const grantees = r.grantees || []
      if (!grantees.includes('authenticated')) failures.push(`${r.proname}: authenticated missing`)
      if (!grantees.includes('service_role')) failures.push(`${r.proname}: service_role missing`)
      if (grantees.includes('PUBLIC')) failures.push(`${r.proname}: PUBLIC has EXECUTE`)
      if (grantees.includes('anon')) failures.push(`${r.proname}: anon has EXECUTE`)
      if (r.prosecdef !== true) failures.push(`${r.proname}: not SECURITY DEFINER`)
      if (!/search_path=public/.test(r.config || '')) failures.push(`${r.proname}: search_path not pinned`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // F. No agency-id argument on any of the four RPCs
  // =========================================================================
  await testCase('F1. none of the four RPCs has an argument named like %agency_id%', async () => {
    const info = await one(`
      SELECT count(*)::int AS n,
             count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM unnest(p.proargnames) an WHERE an ILIKE '%agency_id%'
             ))::int AS bad
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname = ANY(ARRAY['agency_job_set_status','agency_job_assign_driver','agency_truck_assign_driver','agency_truck_unassign_driver']::text[])`)
    expect(info.n === 4, `expected 4 RPC definitions, found ${info.n}`)
    expect(info.bad === 0, `${info.bad} RPC(s) take an agency id argument`)
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
