#!/usr/bin/env node
/**
 * Expiry sweeps — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives public.run_expiry_sweeps(p_as_of)
 * the way the scheduler does: `SET ROLE service_role` with JWT claims, plus
 * `SET ROLE authenticated` / `anon` to prove the grants. Real RLS, real triggers
 * (reservation release on offer transition), real SECURITY DEFINER behaviour.
 *
 * Pinned contract under test (the migration that implements it,
 * supabase/migrations/20261016000000_expiry_sweeps.sql, is NOT written yet, so
 * the sweep cases are EXPECTED to fail now; grant/RLS cases may partly pass):
 *   public.run_expiry_sweeps(p_as_of timestamptz DEFAULT now()) RETURNS jsonb
 *   - SECURITY DEFINER, pinned search_path, EXECUTE for service_role ONLY,
 *     no agency-id argument.
 *   - (a) agency_invitations rows with status 'pending' and expires_at <= p_as_of
 *     become 'expired' with version + 1. Other statuses and future expiries are
 *     untouched.
 *   - (b) the same for agency_driver_invitations.
 *   - (c) calls public.release_stale_fleet_reservations(NULL, p_as_of): a pending
 *     job_offers row past expires_at that holds an ACTIVE reservation becomes
 *     'expired', the reservation becomes 'released' with reason offer_expired
 *     (existing trigger), and agency_jobs.truck_id / driver_id for that job are
 *     cleared.
 *   - (d) inserts one row into public.expiry_sweep_runs(id, ran_at, as_of,
 *     invitations_expired, driver_invitations_expired, reservations_released,
 *     error) and returns {ok, invitations_expired, driver_invitations_expired,
 *     reservations_released, run_id}.
 *   - Idempotent: a second run changes no business rows and still logs a run.
 *   - expiry_sweep_runs: RLS on, no write privilege for authenticated or anon,
 *     readable by platform admins (is_admin_user) through RLS, not by other
 *     authenticated users.
 *
 * Assumptions (stated, not invented by the contract):
 *   - Migration 20261010000000 (fleet reservations) supplies reserve_fleet_assignment
 *     and the stale-offer trigger; this battery seeds ACTIVE reservations through
 *     the real reserve RPC, exactly as fleet_assignment_reservations.db.test.mjs does.
 *   - agency_jobs.truck_id / driver_id projection is seeded by the superuser with
 *     session_replication_role = replica, because the reservation authority does
 *     NOT write the projection and the legacy driver guard would refuse it.
 *   - The sweep's SELECT on expiry_sweep_runs for authenticated is RLS-gated;
 *     the table grants only SELECT to authenticated and nothing to anon.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST/GoTrue,
 * pg_cron scheduling, and concurrency are NOT covered here. The migration's
 * pg_cron block must be tolerant of PGlite (no pg_cron); the battery running at
 * all proves the chain replays.
 *
 * Usage:  node scripts/expiry_sweeps.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is
 * a loud failure, never a silent skip.
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

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function tokenHash(seedText) {
  return createHash('sha256').update(seedText).digest('hex')
}

// ---------------------------------------------------------------------------
// Time: AS_OF is 30 days ahead so every seeded expiry is relative to one instant.
// ---------------------------------------------------------------------------
const HOUR = 3600e3
const DAY = 24 * HOUR
const T0 = Date.now()
const AS_OF = new Date(T0 + 30 * DAY).toISOString()
const JUST_BEFORE_AS_OF = new Date(T0 + 30 * DAY - HOUR).toISOString() // stale at AS_OF
const JUST_AFTER_AS_OF = new Date(T0 + 30 * DAY + HOUR).toISOString() // live at AS_OF
const EARLY_AS_OF = new Date(T0 - 365 * DAY).toISOString() // before every expiry
const at = (hours) => new Date(T0 + DAY + hours * HOUR).toISOString()
const W1 = [at(0), at(4)]

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
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Fixtures (service-seeded as the superuser)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

async function one(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows[0]
}

async function rows(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows
}

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify({}),
  ])
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
  const reference = `EXPIRY-${tag}-${Date.now()}-${seq}`
  await db.query(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [id, reference, custId, ownerUserId]
  )
  return { id }
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

/** Approved driver with an ACTIVE employment record at agency A. */
async function freshDriver(tag) {
  const userId = await createUser(`${tag}-drv`)
  const driverId = await createDriver(userId, tag, 'approved')
  const employmentId = await createEmploymentRow(agencyA, driverId, {
    licence_number: `DL-${tag}-${seq}`,
    licence_class: 'HGV',
    licence_expiry: '2030-01-01',
    status: 'active',
  })
  return { userId, driverId, employmentId }
}

/** Agency-A vehicle with current document dates. */
async function freshVehicle(tag) {
  return createTruckRow(agencyA, `RC-${tag}-${seq}`, {
    insurance_expiry: '2030-01-01',
    fitness_expiry: '2030-01-01',
    permit_expiry: '2030-01-01',
    puc_expiry: '2030-01-01',
  })
}

/** Agency job + pending dispatch offer, live in real time (48h), for the reserve RPC. */
async function newJob(driverId) {
  const shipment = await createShipment(customerId, customerUserId, `EX-${++seq}`)
  const jobId = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status) VALUES ($1, $2, $3, 15000, 'pending')`,
    [jobId, agencyA, shipment.id]
  )
  const offerId = uid()
  await db.query(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), now() + interval '48 hours', 'pending', '4321', '8765')`,
    [offerId, shipment.id, driverId]
  )
  return { jobId, offerId, shipmentId: shipment.id }
}

/** Seeds agency invitations directly (superuser), the shape the invite command writes. */
async function seedAgencyInvitation(agencyId, tag, { status = 'pending', expiresAt, version = 1 }) {
  const id = uid()
  const email = `inv-${tag}-${seq}@example.com`
  await db.query(
    `INSERT INTO public.agency_invitations
       (id, agency_id, invited_email, scope, token_hash, status, expires_at, idempotency_key, version, accepted_at, revoked_at)
     VALUES ($1, $2, $3, 'dispatcher', $4, $5, $6::timestamptz, $7, $8, $9, $10)`,
    [
      id,
      agencyId,
      email,
      tokenHash(`inv-${tag}-${seq}`),
      status,
      expiresAt,
      `idem-inv-${tag}-${seq}`,
      version,
      status === 'accepted' ? new Date().toISOString() : null,
      status === 'revoked' ? new Date().toISOString() : null,
    ]
  )
  return id
}

/** Seeds driver invitations directly (superuser), the shape the driver invite command writes. */
async function seedDriverInvitation(agencyId, tag, { status = 'pending', expiresAt, version = 1 }) {
  const id = uid()
  const phone = '8' + String(100000000 + seq).padStart(9, '0')
  await db.query(
    `INSERT INTO public.agency_driver_invitations
       (id, agency_id, invited_phone, token_hash, status, expires_at, idempotency_key, version, accepted_at, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7, $8, $9, $10)`,
    [
      id,
      agencyId,
      phone,
      tokenHash(`drv-inv-${tag}-${seq}`),
      status,
      expiresAt,
      `idem-drv-inv-${tag}-${seq}`,
      version,
      status === 'accepted' ? new Date().toISOString() : null,
      status === 'revoked' ? new Date().toISOString() : null,
    ]
  )
  return id
}

/** Projection of a reservation onto agency_jobs (superuser; legacy driver guard bypassed for seeding). */
async function projectOntoJob(jobId, truckId, driverId) {
  await db.exec(`SET session_replication_role = replica`)
  try {
    await db.query(`UPDATE public.agency_jobs SET truck_id = $2, driver_id = $3 WHERE id = $1`, [jobId, truckId, driverId])
  } finally {
    await db.exec(`SET session_replication_role = origin`)
  }
}

async function vehicleVersion(vehicleId) {
  return (await one(`SELECT version FROM public.agency_trucks WHERE id = $1`, [vehicleId])).version
}

// ---------------------------------------------------------------------------
// Role / claims switching (what PostgREST and the scheduler do per request)
// ---------------------------------------------------------------------------
async function actAsSuperuser() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
}

async function actAs(sub) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub, role: 'authenticated' })])
  await db.exec('SET ROLE authenticated')
}

async function actAsAnon() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
  await db.exec('SET ROLE anon')
}

async function actAsServiceRole() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ role: 'service_role' })])
  await db.exec('SET ROLE service_role')
}

/** Runs the sweep as service_role (the scheduler's role). Returns the parsed jsonb envelope. */
async function runSweep(asOf) {
  await actAsServiceRole()
  try {
    const result =
      asOf === undefined
        ? await db.query(`SELECT public.run_expiry_sweeps() AS r`)
        : await db.query(`SELECT public.run_expiry_sweeps($1::timestamptz) AS r`, [asOf])
    return parseJson(result.rows[0].r)
  } finally {
    await actAsSuperuser()
  }
}

/** Reserve through the real command RPC as an agency owner (fleet battery shape). */
async function reserveFor(userId, a) {
  await actAs(userId)
  try {
    const result = await db.query(
      `SELECT public.reserve_fleet_assignment($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::timestamptz, $6::timestamptz, $7::integer, $8::text) AS r`,
      [a.jobId, a.offerId, a.vehicleId, a.employmentId, a.start, a.end, a.expectedVersion, a.key]
    )
    return parseJson(result.rows[0].r)
  } finally {
    await actAsSuperuser()
  }
}

// ---------------------------------------------------------------------------
// Row readers and snapshot
// ---------------------------------------------------------------------------
const invitationRow = (id) => one(`SELECT status, version FROM public.agency_invitations WHERE id = $1`, [id])
const driverInvitationRow = (id) => one(`SELECT status, version FROM public.agency_driver_invitations WHERE id = $1`, [id])
const offerRow = (id) => one(`SELECT status FROM public.job_offers WHERE id = $1`, [id])
const reservationRow = (id) =>
  one(`SELECT status, released_reason, version FROM public.fleet_assignment_reservations WHERE id = $1`, [id])
const jobRow = (id) => one(`SELECT truck_id, driver_id FROM public.agency_jobs WHERE id = $1`, [id])

/** Every row the sweep could touch, plus the rows it must never touch. */
async function snapshot() {
  return {
    invitations: await rows(`SELECT id, status, version FROM public.agency_invitations ORDER BY id`),
    driverInvitations: await rows(`SELECT id, status, version FROM public.agency_driver_invitations ORDER BY id`),
    offers: await rows(`SELECT id, status FROM public.job_offers ORDER BY id`),
    reservations: await rows(
      `SELECT id, status, released_reason, version FROM public.fleet_assignment_reservations ORDER BY id`
    ),
    jobs: await rows(`SELECT id, status, truck_id, driver_id FROM public.agency_jobs ORDER BY id`),
    memberships: await rows(`SELECT id, status, revoked_at FROM public.agency_memberships ORDER BY id`),
    agencies: await rows(`SELECT id, status FROM public.transport_agencies ORDER BY id`),
  }
}

async function runLogCount() {
  return (await one(`SELECT count(*)::int AS n FROM public.expiry_sweep_runs`)).n
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------
let customerUserId
let customerId
let agencyUserA
let agencyUserB
let agencyA
let agencyB
let adminUserId

async function setup() {
  customerUserId = await createUser('ex-customer')
  customerId = await createCustomer(customerUserId, 'ExCust')
  agencyUserA = await createUser('ex-agency-a')
  agencyA = await createAgencyRow(agencyUserA, 'EX Agency A', 'approved')
  agencyUserB = await createUser('ex-agency-b')
  agencyB = await createAgencyRow(agencyUserB, 'EX Agency B', 'approved')
  adminUserId = await createUser('ex-admin')
  await db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [adminUserId])
}

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  const last = applied[applied.length - 1]

  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations applied: ${applied.length} (last=${last})`)
  await setup()

  // Staff membership: a REVOKED dispatcher at agency A (must never be touched by a sweep).
  await addMembership(agencyA, 'dispatcher', 'ex-revoked-staff', 'revoked')
  await addMembership(agencyA, 'dispatcher', 'ex-active-staff', 'active')

  // ---- Agency invitation fixtures -----------------------------------------
  const inv = {}
  inv.stalePending = await seedAgencyInvitation(agencyA, 'stale', { expiresAt: JUST_BEFORE_AS_OF })
  inv.futurePending = await seedAgencyInvitation(agencyA, 'future', { expiresAt: JUST_AFTER_AS_OF })
  inv.acceptedPast = await seedAgencyInvitation(agencyA, 'accepted', { status: 'accepted', expiresAt: JUST_BEFORE_AS_OF })
  inv.revokedPast = await seedAgencyInvitation(agencyA, 'revoked', { status: 'revoked', expiresAt: JUST_BEFORE_AS_OF })
  inv.boundary = await seedAgencyInvitation(agencyA, 'boundary', { expiresAt: AS_OF })
  inv.otherAgencyStale = await seedAgencyInvitation(agencyB, 'other', { expiresAt: JUST_BEFORE_AS_OF })

  // ---- Driver invitation fixtures -----------------------------------------
  const drv = {}
  drv.stalePending = await seedDriverInvitation(agencyA, 'stale', { expiresAt: JUST_BEFORE_AS_OF })
  drv.futurePending = await seedDriverInvitation(agencyA, 'future', { expiresAt: JUST_AFTER_AS_OF })
  drv.acceptedPast = await seedDriverInvitation(agencyA, 'accepted', { status: 'accepted', expiresAt: JUST_BEFORE_AS_OF })
  drv.revokedPast = await seedDriverInvitation(agencyA, 'revoked', { status: 'revoked', expiresAt: JUST_BEFORE_AS_OF })

  // ---- Reservation fixtures (real reserve RPC, then offer expiry set in the past / future) ----
  let held = null
  let heldError = ''
  try {
    const stale = await seedHeldReservation('stale', JUST_BEFORE_AS_OF)
    const live = await seedHeldReservation('live', JUST_AFTER_AS_OF)
    held = { stale, live }
  } catch (error) {
    heldError = firstLine(error)
  }
  console.log(`fixtures: held reservations ${held ? 'seeded (stale + live)' : `NOT seeded: ${heldError}`}`)
  const need = (value, what) => expect(value, `fixture not seeded (${what}): ${heldError}`)

  // Pre-sweep expectations, counted from the fixture state itself.
  const expectedInvitations = (
    await one(
      `SELECT count(*)::int AS n FROM public.agency_invitations WHERE status = 'pending' AND expires_at <= $1::timestamptz`,
      [AS_OF]
    )
  ).n
  const expectedDriverInvitations = (
    await one(
      `SELECT count(*)::int AS n FROM public.agency_driver_invitations WHERE status = 'pending' AND expires_at <= $1::timestamptz`,
      [AS_OF]
    )
  ).n
  const expectedReservations = (
    await one(
      `SELECT count(*)::int AS n FROM public.fleet_assignment_reservations r
         JOIN public.job_offers jo ON jo.id = r.job_offer_id
        WHERE r.status = 'active' AND jo.status = 'pending' AND jo.expires_at <= $1::timestamptz`,
      [AS_OF]
    )
  ).n

  const pre = await snapshot()

  // =========================================================================
  // P. Precondition: a sweep as of an earlier instant changes nothing
  // =========================================================================
  await testCase('P1. a sweep as of an instant before every expiry expires nothing and still logs its run', async () => {
    const r = await runSweep(EARLY_AS_OF)
    expect(r && r.ok === true, `envelope: ${JSON.stringify(r)}`)
    expect(
      r.invitations_expired === 0 && r.driver_invitations_expired === 0 && r.reservations_released === 0,
      `counts: ${JSON.stringify(r)}`
    )
    const post = await snapshot()
    expect(JSON.stringify(post.invitations) === JSON.stringify(pre.invitations), 'invitations changed for an early as_of')
    expect(JSON.stringify(post.reservations) === JSON.stringify(pre.reservations), 'reservations changed for an early as_of')
  })

  // The main sweep. Captured, not thrown, so every dependent case reports its own reason.
  let run1 = null
  let run1Error = ''
  try {
    run1 = await runSweep(AS_OF)
  } catch (error) {
    run1Error = firstLine(error)
  }
  const need1 = (what) => expect(run1 && run1.ok === true, `first sweep did not succeed (${what}): ${run1Error || JSON.stringify(run1)}`)
  const post1 = await snapshot()

  // =========================================================================
  // X. Agency invitation expiry
  // =========================================================================
  await testCase('X1. past pending agency invitation becomes expired', async () => {
    need1('X1')
    const r = await invitationRow(inv.stalePending)
    expect(r.status === 'expired', `status: ${r.status}`)
  })

  await testCase('X2. expired agency invitation has its version bumped 1 -> 2', async () => {
    need1('X2')
    const r = await invitationRow(inv.stalePending)
    expect(r.version === 2, `version: ${r.version}`)
  })

  await testCase('X3. future pending agency invitation stays pending at version 1', async () => {
    need1('X3')
    const r = await invitationRow(inv.futurePending)
    expect(r.status === 'pending' && r.version === 1, `row: ${JSON.stringify(r)}`)
  })

  await testCase('X4. accepted agency invitation with a past expires_at keeps status and version', async () => {
    need1('X4')
    const r = await invitationRow(inv.acceptedPast)
    expect(r.status === 'accepted' && r.version === 1, `row: ${JSON.stringify(r)}`)
  })

  await testCase('X5. revoked agency invitation with a past expires_at keeps status and version', async () => {
    need1('X5')
    const r = await invitationRow(inv.revokedPast)
    expect(r.status === 'revoked' && r.version === 1, `row: ${JSON.stringify(r)}`)
  })

  await testCase('X6. boundary: pending invitation with expires_at equal to as_of becomes expired', async () => {
    need1('X6')
    const r = await invitationRow(inv.boundary)
    expect(r.status === 'expired' && r.version === 2, `row: ${JSON.stringify(r)}`)
  })

  await testCase('X7. invitations_expired equals the pre-sweep count of stale pending invitations (all agencies)', async () => {
    need1('X7')
    expect(expectedInvitations === 3, `fixture drift: expected 3 stale pending agency invitations, counted ${expectedInvitations}`)
    expect(run1.invitations_expired === expectedInvitations, `invitations_expired=${run1.invitations_expired}, expected ${expectedInvitations}`)
    const other = await invitationRow(inv.otherAgencyStale)
    expect(other.status === 'expired', `agency B stale invitation not expired: ${other.status}`)
  })

  // =========================================================================
  // Y. Agency driver invitation expiry
  // =========================================================================
  await testCase('Y1. past pending driver invitation becomes expired', async () => {
    need1('Y1')
    const r = await driverInvitationRow(drv.stalePending)
    expect(r.status === 'expired', `status: ${r.status}`)
  })

  await testCase('Y2. expired driver invitation has its version bumped 1 -> 2', async () => {
    need1('Y2')
    const r = await driverInvitationRow(drv.stalePending)
    expect(r.version === 2, `version: ${r.version}`)
  })

  await testCase('Y3. future pending driver invitation stays pending at version 1', async () => {
    need1('Y3')
    const r = await driverInvitationRow(drv.futurePending)
    expect(r.status === 'pending' && r.version === 1, `row: ${JSON.stringify(r)}`)
  })

  await testCase('Y4. accepted and revoked driver invitations with past expiry keep status and version', async () => {
    need1('Y4')
    const accepted = await driverInvitationRow(drv.acceptedPast)
    const revoked = await driverInvitationRow(drv.revokedPast)
    expect(accepted.status === 'accepted' && accepted.version === 1, `accepted: ${JSON.stringify(accepted)}`)
    expect(revoked.status === 'revoked' && revoked.version === 1, `revoked: ${JSON.stringify(revoked)}`)
  })

  await testCase('Y5. driver_invitations_expired equals the pre-sweep count of stale pending driver invitations', async () => {
    need1('Y5')
    expect(expectedDriverInvitations === 1, `fixture drift: expected 1 stale pending driver invitation, counted ${expectedDriverInvitations}`)
    expect(
      run1.driver_invitations_expired === expectedDriverInvitations,
      `driver_invitations_expired=${run1.driver_invitations_expired}, expected ${expectedDriverInvitations}`
    )
  })

  // =========================================================================
  // Z. Reservation release through stale offers
  // =========================================================================
  await testCase('Z1. stale offer (pending, past expires_at, ACTIVE reservation) becomes expired', async () => {
    need1('Z1')
    need(held, 'stale reservation')
    const r = await offerRow(held.stale.offerId)
    expect(r.status === 'expired', `offer status: ${r.status}`)
  })

  await testCase('Z2. its reservation is released with released_reason offer_expired', async () => {
    need1('Z2')
    need(held, 'stale reservation')
    const r = await reservationRow(held.stale.reservationId)
    expect(r.status === 'released' && r.released_reason === 'offer_expired', `reservation: ${JSON.stringify(r)}`)
  })

  await testCase('Z3. the stale job projection (agency_jobs.truck_id and driver_id) is cleared', async () => {
    need1('Z3')
    need(held, 'stale reservation')
    const r = await jobRow(held.stale.jobId)
    expect(r.truck_id === null && r.driver_id === null, `projection still set: ${JSON.stringify(r)}`)
  })

  await testCase('Z4. non-stale offer with an ACTIVE reservation is untouched (offer pending, reservation active)', async () => {
    need1('Z4')
    need(held, 'live reservation')
    const offer = await offerRow(held.live.offerId)
    const reservation = await reservationRow(held.live.reservationId)
    expect(offer.status === 'pending', `live offer status: ${offer.status}`)
    expect(reservation.status === 'active', `live reservation: ${JSON.stringify(reservation)}`)
  })

  await testCase('Z5. non-stale job keeps its truck_id and driver_id projection', async () => {
    need1('Z5')
    need(held, 'live reservation')
    const r = await jobRow(held.live.jobId)
    expect(r.truck_id === held.live.vehicleId && r.driver_id === held.live.driverId, `projection: ${JSON.stringify(r)}`)
  })

  await testCase('Z6. reservations_released equals the pre-sweep count of stale ACTIVE reservations', async () => {
    need1('Z6')
    expect(expectedReservations === 1, `fixture drift: expected 1 stale active reservation, counted ${expectedReservations}`)
    expect(run1.reservations_released === expectedReservations, `reservations_released=${run1.reservations_released}, expected ${expectedReservations}`)
  })

  await testCase('Z7. the released reservation has its version bumped 1 -> 2', async () => {
    need1('Z7')
    need(held, 'stale reservation')
    const r = await reservationRow(held.stale.reservationId)
    expect(r.version === 2, `reservation version: ${r.version}`)
  })

  await testCase('Z8. the released vehicle and driver can be reserved again for an overlapping window', async () => {
    need1('Z8')
    need(held, 'stale reservation')
    const job = await newJob(held.stale.driverId)
    const r = await reserveFor(agencyUserA, {
      jobId: job.jobId,
      offerId: job.offerId,
      vehicleId: held.stale.vehicleId,
      employmentId: held.stale.employmentId,
      start: W1[0],
      end: W1[1],
      expectedVersion: await vehicleVersion(held.stale.vehicleId),
      key: `ex-rereserve-${++seq}`,
    })
    expect(r && r.ok === true && r.state === 'created', `re-reserve: ${JSON.stringify(r)}`)
    // The re-reservation uses a job whose offer is itself past expiry, so a LATER sweep would
    // legitimately expire it. Release it here so the R-series idempotency cases (a second sweep
    // with nothing to do) test the sweep, not this fixture's side effect.
    await db.query(
      `UPDATE public.fleet_assignment_reservations SET status = 'released', released_reason = 'manual_release' WHERE id = $1`,
      [r.reservation.id]
    )
  })

  // =========================================================================
  // R. Run log and idempotency
  // =========================================================================
  await testCase('R1. first sweep returns ok with integer counts and a run_id', async () => {
    need1('R1')
    expect(Number.isInteger(run1.invitations_expired), `invitations_expired: ${JSON.stringify(run1.invitations_expired)}`)
    expect(Number.isInteger(run1.driver_invitations_expired), `driver_invitations_expired: ${JSON.stringify(run1.driver_invitations_expired)}`)
    expect(Number.isInteger(run1.reservations_released), `reservations_released: ${JSON.stringify(run1.reservations_released)}`)
    expect(typeof run1.run_id === 'string' && run1.run_id.length > 0, `run_id: ${JSON.stringify(run1.run_id)}`)
  })

  await testCase('R2. run row is logged with as_of, the returned counts and a NULL error', async () => {
    need1('R2')
    const row = await one(
      `SELECT as_of, invitations_expired, driver_invitations_expired, reservations_released, error
         FROM public.expiry_sweep_runs WHERE id = $1`,
      [run1.run_id]
    )
    expect(row, 'no expiry_sweep_runs row for the returned run_id')
    expect(new Date(row.as_of).getTime() === new Date(AS_OF).getTime(), `as_of: ${row.as_of}`)
    expect(
      row.invitations_expired === run1.invitations_expired &&
        row.driver_invitations_expired === run1.driver_invitations_expired &&
        row.reservations_released === run1.reservations_released,
      `logged counts ${JSON.stringify(row)} differ from returned ${JSON.stringify(run1)}`
    )
    expect(row.error === null, `error column: ${JSON.stringify(row.error)}`)
  })

  let runCountBeforeSecond = null
  let snapBeforeSecond = null
  let run2 = null
  let run2Error = ''
  await testCase('R3. second run with nothing to do returns all-zero counts', async () => {
    need1('R3')
    runCountBeforeSecond = await runLogCount()
    snapBeforeSecond = await snapshot()
    try {
      run2 = await runSweep(AS_OF)
    } catch (error) {
      run2Error = firstLine(error)
    }
    expect(run2 && run2.ok === true, `second sweep: ${run2Error || JSON.stringify(run2)}`)
    expect(
      run2.invitations_expired === 0 && run2.driver_invitations_expired === 0 && run2.reservations_released === 0,
      `second run counts: ${JSON.stringify(run2)}`
    )
  })

  await testCase('R4. second run still logs a new run row', async () => {
    need1('R4')
    expect(run2 && run2.ok === true, `no second run: ${run2Error}`)
    const after = await runLogCount()
    expect(after === runCountBeforeSecond + 1, `run rows ${runCountBeforeSecond} -> ${after}, expected +1`)
    const row = await one(`SELECT invitations_expired, driver_invitations_expired, reservations_released FROM public.expiry_sweep_runs WHERE id = $1`, [run2.run_id])
    expect(row && row.invitations_expired === 0 && row.reservations_released === 0, `second run row: ${JSON.stringify(row)}`)
  })

  await testCase('R5. second run leaves every business row unchanged (invitations, offers, reservations, projection, memberships, agencies)', async () => {
    need1('R5')
    expect(run2 && run2.ok === true, `no second run: ${run2Error}`)
    expect(snapBeforeSecond, 'no snapshot taken before the second run')
    const post2 = await snapshot()
    expect(JSON.stringify(post2) === JSON.stringify(snapBeforeSecond), 'a row changed during the second, idempotent run')
  })

  await testCase('R6. default-argument call run_expiry_sweeps() as service_role succeeds and logs a run', async () => {
    const before = await runLogCount()
    const r = await runSweep()
    expect(r && r.ok === true, `envelope: ${JSON.stringify(r)}`)
    expect((await runLogCount()) === before + 1, 'default-argument call did not log a run row')
  })

  // =========================================================================
  // G. Grants and signature
  // =========================================================================
  await testCase('G1. service_role holds EXECUTE and the first sweep ran as service_role', async () => {
    const priv = (
      await one(`SELECT has_function_privilege('service_role', 'public.run_expiry_sweeps(timestamptz)', 'EXECUTE') AS p`)
    ).p
    expect(priv === true, 'service_role lacks EXECUTE on run_expiry_sweeps(timestamptz)')
    need1('G1')
  })

  await testCase('G2. authenticated holds no EXECUTE and a direct call is denied', async () => {
    const priv = (
      await one(`SELECT has_function_privilege('authenticated', 'public.run_expiry_sweeps(timestamptz)', 'EXECUTE') AS p`)
    ).p
    expect(priv === false, 'authenticated holds EXECUTE on run_expiry_sweeps')
    await actAs(agencyUserA)
    try {
      await expectRaises(db.query(`SELECT public.run_expiry_sweeps($1::timestamptz) AS r`, [AS_OF]), 'permission denied')
    } finally {
      await actAsSuperuser()
    }
  })

  await testCase('G3. anon holds no EXECUTE and a direct call is denied', async () => {
    const priv = (
      await one(`SELECT has_function_privilege('anon', 'public.run_expiry_sweeps(timestamptz)', 'EXECUTE') AS p`)
    ).p
    expect(priv === false, 'anon holds EXECUTE on run_expiry_sweeps')
    await actAsAnon()
    try {
      await expectRaises(db.query(`SELECT public.run_expiry_sweeps($1::timestamptz) AS r`, [AS_OF]), 'permission denied')
    } finally {
      await actAsSuperuser()
    }
  })

  await testCase('G4. signature is (p_as_of timestamptz) only: no agency-id argument', async () => {
    const args = (await one(`SELECT pg_get_function_identity_arguments('public.run_expiry_sweeps'::regproc) AS a`)).a
    expect(args === 'p_as_of timestamp with time zone', `identity arguments: ${JSON.stringify(args)}`)
  })

  await testCase('G5. SECURITY DEFINER with a pinned search_path', async () => {
    const fn = await one(
      `SELECT prosecdef, proconfig FROM pg_proc WHERE oid = 'public.run_expiry_sweeps(timestamptz)'::regprocedure`
    )
    expect(fn && fn.prosecdef === true, 'run_expiry_sweeps is not SECURITY DEFINER')
    expect(
      Array.isArray(fn.proconfig) && fn.proconfig.some((c) => c.startsWith('search_path=')),
      `no pinned search_path: ${JSON.stringify(fn.proconfig)}`
    )
  })

  // =========================================================================
  // RL. expiry_sweep_runs table privileges and RLS
  // =========================================================================
  await testCase('RL1. expiry_sweep_runs has RLS enabled', async () => {
    const r = await one(`SELECT relrowsecurity AS on FROM pg_class WHERE oid = 'public.expiry_sweep_runs'::regclass`)
    expect(r && r.on === true, 'RLS is not enabled on expiry_sweep_runs')
  })

  await testCase('RL2. authenticated and anon hold no write privilege on expiry_sweep_runs; anon has no read', async () => {
    const p = await one(`SELECT
        has_table_privilege('authenticated', 'public.expiry_sweep_runs', 'INSERT') AS auth_ins,
        has_table_privilege('authenticated', 'public.expiry_sweep_runs', 'UPDATE') AS auth_upd,
        has_table_privilege('authenticated', 'public.expiry_sweep_runs', 'DELETE') AS auth_del,
        has_table_privilege('anon', 'public.expiry_sweep_runs', 'SELECT') AS anon_sel,
        has_table_privilege('anon', 'public.expiry_sweep_runs', 'INSERT') AS anon_ins,
        has_table_privilege('anon', 'public.expiry_sweep_runs', 'UPDATE') AS anon_upd,
        has_table_privilege('anon', 'public.expiry_sweep_runs', 'DELETE') AS anon_del`)
    const leaks = Object.entries(p)
      .filter(([, v]) => v === true)
      .map(([k]) => k)
    expect(leaks.length === 0, `privileges that must be absent: ${leaks.join(', ')}`)
  })

  await testCase('RL3. platform admin reads every run row through RLS', async () => {
    const total = (await one(`SELECT count(*)::int AS n FROM public.expiry_sweep_runs`)).n
    expect(total >= 4, `expected at least 4 run rows in the fixture, found ${total}`)
    await actAs(adminUserId)
    try {
      const seen = (await one(`SELECT count(*)::int AS n FROM public.expiry_sweep_runs`)).n
      expect(seen === total, `admin saw ${seen} of ${total} run rows`)
    } finally {
      await actAsSuperuser()
    }
  })

  await testCase('RL4. non-admin authenticated user reads zero run rows', async () => {
    await actAs(agencyUserA)
    try {
      const seen = (await one(`SELECT count(*)::int AS n FROM public.expiry_sweep_runs`)).n
      expect(seen === 0, `non-admin saw ${seen} run rows`)
    } finally {
      await actAsSuperuser()
    }
  })

  // =========================================================================
  // T. Collateral: rows the sweep must not touch
  // =========================================================================
  await testCase('T1. revoked membership stays revoked and membership rows are unchanged by the sweep', async () => {
    const revoked = post1.memberships.find((m) => m.status === 'revoked')
    expect(revoked, 'no revoked membership in fixture')
    expect(
      JSON.stringify(post1.memberships) === JSON.stringify(pre.memberships),
      'agency_memberships changed during the sweep'
    )
    const after = (await rows(`SELECT status FROM public.agency_memberships WHERE id = $1`, [revoked.id]))[0]
    expect(after && after.status === 'revoked', `revoked membership now: ${JSON.stringify(after)}`)
  })

  await testCase('T2. transport_agencies rows are unchanged by the sweep', async () => {
    expect(
      JSON.stringify(post1.agencies) === JSON.stringify(pre.agencies),
      'transport_agencies changed during the sweep'
    )
  })

  await testCase('T3. the sweep neither inserts nor deletes agency_invitations rows', async () => {
    expect(post1.invitations.length === pre.invitations.length, `row count ${pre.invitations.length} -> ${post1.invitations.length}`)
    expect(
      JSON.stringify(post1.invitations.map((r) => r.id)) === JSON.stringify(pre.invitations.map((r) => r.id)),
      'agency_invitations id set changed during the sweep'
    )
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  console.log(`\n${passed}/${results.length} cases passed`)
  return passed === results.length
}

// Helper used by the seeding block above. Defined after main's closure values exist.
async function seedHeldReservation(tag, expiresAt) {
  const driver = await freshDriver(tag)
  const vehicleId = await freshVehicle(tag)
  const job = await newJob(driver.driverId)
  const reservation = await reserveFor(agencyUserA, {
    jobId: job.jobId,
    offerId: job.offerId,
    vehicleId,
    employmentId: driver.employmentId,
    start: W1[0],
    end: W1[1],
    expectedVersion: await vehicleVersion(vehicleId),
    key: `ex-held-${tag}-${++seq}`,
  })
  expect(reservation && reservation.ok === true && reservation.state === 'created', `seed reserve (${tag}): ${JSON.stringify(reservation)}`)
  await projectOntoJob(job.jobId, vehicleId, driver.driverId)
  await db.query(`UPDATE public.job_offers SET expires_at = $2::timestamptz WHERE id = $1`, [job.offerId, expiresAt])
  return {
    driverId: driver.driverId,
    employmentId: driver.employmentId,
    vehicleId,
    jobId: job.jobId,
    offerId: job.offerId,
    reservationId: reservation.reservation.id,
  }
}

let ok = false
try {
  ok = await main()
} catch (error) {
  console.error('FAIL: harness error:', error && error.message ? error.message : error)
  ok = false
}
process.exit(ok ? 0 : 1)
