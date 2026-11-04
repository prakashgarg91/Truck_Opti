#!/usr/bin/env node
/**
 * Agency job terminal cutoff — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the same surfaces the portal
 * uses: real RLS and role switching (`SET ROLE authenticated` / `anon` +
 * `request.jwt.claims`, what PostgREST does per request), direct INSERT and
 * UPDATE on agency_jobs through RLS, the SECURITY DEFINER command RPCs
 * reserve_fleet_assignment / release_fleet_assignment, and the helper
 * public.shipment_accepts_agency_jobs(uuid).
 *
 * Pinned contract under test (the migration that implements it is NOT written
 * yet, so the cutoff cases are EXPECTED to fail now; regression guards may pass):
 *   An active shipment_agency_consents row must NOT let an agency CREATE a NEW
 *   agency_jobs row for a shipment that has reached a terminal status
 *   (delivered | cancelled). Live statuses are pending and in_transit.
 *   - T1/T2: agency OWNER may INSERT (active consent) on pending / in_transit.
 *   - T3/T4: agency OWNER is denied INSERT on delivered / cancelled
 *     (error contains 'row-level security').
 *   - T5: dispatcher staff (agency A) allowed on pending, denied on delivered
 *     and cancelled.
 *   - T6: an EXISTING agency_jobs row on a shipment that later becomes
 *     delivered stays UPDATABLE by the owner (cutoff applies to INSERT only).
 *   - T7: same owner and consent flip from allowed to denied when the shipment
 *     moves pending -> delivered.
 *   - T8: no-consent and other-agency INSERT denials still hold on pending.
 *   - T9: public.shipment_accepts_agency_jobs(uuid) exists, is callable by the
 *     owner, a dispatcher and anon without a permission error, returns true for
 *     pending/in_transit, false for delivered/cancelled and false for an
 *     unknown id.
 *   - T10: reserve_fleet_assignment / release_fleet_assignment still work for an
 *     existing job on a pending shipment.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST /
 * GoTrue behaviour is NOT covered here. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_job_terminal_cutoff.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is
 * a loud failure, never a silent skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
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
 * Runs every sub-check and reports ALL failing ones in one case, so a case with
 * several surfaces does not hide its second failure behind the first.
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
// Same shapes and columns as scripts/staff_scope_dispatch.db.test.mjs.
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

/** Shipment is created 'pending'; use setShipmentStatus for other statuses. */
async function createShipment(custId, ownerUserId, tag) {
  const id = uid()
  const reference = `TERMINAL-${tag}-${Date.now()}-${seq}`
  await db.query(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)`,
    [id, reference, custId, ownerUserId]
  )
  return { id }
}

async function setShipmentStatus(shipmentId, status) {
  await db.query(`UPDATE public.shipments SET status = $1 WHERE id = $2`, [status, shipmentId])
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

/** Agency job + pending dispatch offer for a driver at the given agency. */
async function newJobAt(agencyId, driverId, { offerExpires = "now() + interval '48 hours'" } = {}) {
  const shipment = await createShipment(customerId, customerUserId, `NJ-${++seq}`)
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

/**
 * Fresh shipment in the given status with an ACTIVE consent to the agency and
 * NO agency_jobs row yet, so the next INSERT is a genuine "new job" create.
 */
async function shipmentWithConsent(agencyId, status, tag) {
  const shipment = await createShipment(customerId, customerUserId, tag)
  await insertConsent(shipment.id, agencyId)
  if (status !== 'pending') await setShipmentStatus(shipment.id, status)
  return shipment.id
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

async function actAsAnon() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
  await db.exec('SET ROLE anon')
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
// Shared state (set up in main)
// ---------------------------------------------------------------------------
const T0 = Date.now()
const at = (hours) => new Date(T0 + 24 * 3600e3 + hours * 3600e3).toISOString()
const W1 = [at(0), at(4)]

let customerUserId
let customerId
let agencyUserA
let agencyUserB
let agencyA
let agencyB

async function setup() {
  customerUserId = await createUser('terminal-customer')
  customerId = await createCustomer(customerUserId, 'TerminalCust')
  agencyUserA = await createUser('terminal-agency-a')
  agencyA = await createAgencyRow(agencyUserA, 'Terminal Agency A', 'approved')
  agencyUserB = await createUser('terminal-agency-b')
  agencyB = await createAgencyRow(agencyUserB, 'Terminal Agency B', 'approved')
}

// ---------------------------------------------------------------------------
// Command and write wrappers (authenticated role + JWT claims, as PostgREST)
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

function argsFor(d, v, j, window = W1) {
  return {
    jobId: j.jobId,
    offerId: j.offerId,
    vehicleId: v,
    employmentId: d.employmentId,
    start: window[0],
    end: window[1],
    expectedVersion: 1,
    key: `terminal-${++seq}-${Date.now()}`,
  }
}

async function reserveOk(userId, d, v, j, window = W1) {
  const r = await reserveAs(userId, argsFor(d, v, j, window))
  expect(r && r.ok === true && r.state === 'created', `expected reserve ok/created, got ${JSON.stringify(r)}`)
  return r.reservation
}

/** INSERT into agency_jobs through RLS as `userId`. Never throws; reports the outcome. */
async function insertJobAs(userId, agencyId, shipmentId) {
  try {
    const inserted = await asActor(userId, () =>
      rows(`INSERT INTO public.agency_jobs (agency_id, shipment_id, fare) VALUES ($1, $2, 1) RETURNING id`, [agencyId, shipmentId])
    )
    return { error: null, inserted: inserted.length }
  } catch (error) {
    return { error: firstLine(error), inserted: 0 }
  }
}

async function jobCountForShipment(shipmentId) {
  return (await one(`SELECT count(*)::int AS n FROM public.agency_jobs WHERE shipment_id = $1`, [shipmentId])).n
}

/** Passes only if the INSERT is allowed: one row returned and one row persisted. */
async function expectInsertAllowed(userId, agencyId, shipmentId, label) {
  const { error, inserted } = await insertJobAs(userId, agencyId, shipmentId)
  expect(!error && inserted === 1, `${label}: expected INSERT to succeed, got ${error || '0 rows'}`)
  const persisted = await jobCountForShipment(shipmentId)
  expect(persisted === 1, `${label}: expected 1 persisted job, found ${persisted}`)
}

/** Passes only if the INSERT is denied with a row-level security error and persists nothing. */
async function expectInsertDenied(userId, agencyId, shipmentId, label) {
  const { error, inserted } = await insertJobAs(userId, agencyId, shipmentId)
  expect(
    error && /row-level security/.test(error),
    `${label}: expected a row-level security denial, got ${error ? JSON.stringify(error) : 'success'}`
  )
  expect(inserted === 0, `${label}: a denied INSERT returned ${inserted} row(s)`)
  const persisted = await jobCountForShipment(shipmentId)
  expect(persisted === 0, `${label}: a denied INSERT persisted ${persisted} row(s)`)
}

async function jobFare(jobId) {
  return (await one(`SELECT fare::int AS fare FROM public.agency_jobs WHERE id = $1`, [jobId])).fare
}

/** Calls the helper as anon, an authenticated user, or the service role; returns the raw value. */
async function acceptsAs(actor, shipmentId) {
  if (actor === 'anon') await actAsAnon()
  else await actAs(actor)
  try {
    const r = await db.query(`SELECT public.shipment_accepts_agency_jobs($1::uuid) AS r`, [shipmentId])
    return r.rows[0].r
  } finally {
    await actAsService()
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

  // Dispatcher staff of agency A, seeded by superuser INSERT into agency_memberships.
  const dispatcherId = await addMembership(agencyA, 'dispatcher', 'terminal-dispatcher')

  // =========================================================================
  // T. Terminal cutoff for NEW agency_jobs INSERTs
  // =========================================================================
  await testCase('T1. agency owner may INSERT an agency job for a pending shipment with an active consent', async () => {
    const shipmentId = await shipmentWithConsent(agencyA, 'pending', 'T1')
    await expectInsertAllowed(agencyUserA, agencyA, shipmentId, 'owner on pending')
  })

  await testCase('T2. agency owner may INSERT an agency job for an in_transit shipment with an active consent', async () => {
    const shipmentId = await shipmentWithConsent(agencyA, 'in_transit', 'T2')
    await expectInsertAllowed(agencyUserA, agencyA, shipmentId, 'owner on in_transit')
  })

  await testCase('T3. agency owner is denied INSERT for a delivered shipment even with an active consent', async () => {
    const shipmentId = await shipmentWithConsent(agencyA, 'delivered', 'T3')
    await expectInsertDenied(agencyUserA, agencyA, shipmentId, 'owner on delivered')
  })

  await testCase('T4. agency owner is denied INSERT for a cancelled shipment even with an active consent', async () => {
    const shipmentId = await shipmentWithConsent(agencyA, 'cancelled', 'T4')
    await expectInsertDenied(agencyUserA, agencyA, shipmentId, 'owner on cancelled')
  })

  await testCase('T5. a dispatcher of agency A may INSERT on pending and is denied on delivered and cancelled', async () => {
    const pending = await shipmentWithConsent(agencyA, 'pending', 'T5-P')
    const delivered = await shipmentWithConsent(agencyA, 'delivered', 'T5-D')
    const cancelled = await shipmentWithConsent(agencyA, 'cancelled', 'T5-C')
    await gather([
      ['pending', () => expectInsertAllowed(dispatcherId, agencyA, pending, 'dispatcher on pending')],
      ['delivered', () => expectInsertDenied(dispatcherId, agencyA, delivered, 'dispatcher on delivered')],
      ['cancelled', () => expectInsertDenied(dispatcherId, agencyA, cancelled, 'dispatcher on cancelled')],
    ])
  })

  await testCase('T6. an existing agency job on a shipment that becomes delivered stays UPDATABLE by the owner', async () => {
    const seeded = await serviceJobWithConsent(agencyA)
    await setShipmentStatus(seeded.shipmentId, 'delivered')
    let updated = []
    let updateErr = null
    try {
      updated = await asActor(agencyUserA, () =>
        rows(`UPDATE public.agency_jobs SET fare = 15001 WHERE id = $1 RETURNING id`, [seeded.jobId])
      )
    } catch (error) {
      updateErr = firstLine(error)
    }
    expect(!updateErr && updated.length === 1, `expected UPDATE to affect 1 row, got ${updateErr || updated.length}`)
    const fare = await jobFare(seeded.jobId)
    expect(fare === 15001, `expected fare 15001, found ${fare}`)
  })

  await testCase('T7. the same owner and consent flip from allowed to denied when the shipment moves pending -> delivered', async () => {
    const shipmentId = await shipmentWithConsent(agencyA, 'pending', 'T7')
    await expectInsertAllowed(agencyUserA, agencyA, shipmentId, 'before delivery')
    // Service-side cleanup: remove the job created above so the post-delivery
    // INSERT is a genuine new-job create on the same shipment/consent.
    await db.query(`DELETE FROM public.agency_jobs WHERE shipment_id = $1`, [shipmentId])
    await setShipmentStatus(shipmentId, 'delivered')
    await expectInsertDenied(agencyUserA, agencyA, shipmentId, 'after delivery')
  })

  await testCase('T8. regression: no-consent and other-agency INSERT on a pending shipment stay denied', async () => {
    const noConsent = await createShipment(customerId, customerUserId, 'T8-NC')
    const otherAgency = await shipmentWithConsent(agencyA, 'pending', 'T8-OA')
    await gather([
      ['no consent', () => expectInsertDenied(agencyUserA, agencyA, noConsent.id, 'owner without consent')],
      ['other agency', () => expectInsertDenied(agencyUserB, agencyA, otherAgency, 'agency B owner into agency A')],
    ])
  })

  // =========================================================================
  // H. Helper function public.shipment_accepts_agency_jobs(uuid)
  // =========================================================================
  await testCase('T9. shipment_accepts_agency_jobs(uuid) is callable by owner, dispatcher and anon and answers by status', async () => {
    const ids = {
      pending: await shipmentWithConsent(agencyA, 'pending', 'T9-P'),
      in_transit: await shipmentWithConsent(agencyA, 'in_transit', 'T9-I'),
      delivered: await shipmentWithConsent(agencyA, 'delivered', 'T9-D'),
      cancelled: await shipmentWithConsent(agencyA, 'cancelled', 'T9-C'),
      unknown: randomUUID(),
    }
    const expected = { pending: true, in_transit: true, delivered: false, cancelled: false, unknown: false }
    const actors = [
      ['owner', agencyUserA],
      ['dispatcher', dispatcherId],
      ['anon', 'anon'],
    ]
    const checks = []
    for (const [label, actor] of actors) {
      for (const [status, id] of Object.entries(ids)) {
        checks.push([`${label}/${status}`, async () => {
          const value = await acceptsAs(actor, id)
          expect(value === expected[status], `expected ${expected[status]}, got ${JSON.stringify(value)}`)
        }])
      }
    }
    await gather(checks)
  })

  // =========================================================================
  // RS. Reservation regression on a pending shipment
  // =========================================================================
  await testCase('T10. reserve and release still work for an existing job on a pending shipment', async () => {
    const d = await freshDriverAt(agencyA, 't10')
    const v = await freshVehicleAt(agencyA, 't10')
    const j = await newJobAt(agencyA, d.driverId)
    await insertConsent(j.shipmentId, agencyA)
    const reservation = await reserveOk(agencyUserA, d, v, j)
    const released = await releaseAs(agencyUserA, reservation.id, reservation.version)
    expect(released.ok === true && released.state === 'released', `release: ${JSON.stringify(released)}`)
  })

  // =========================================================================
  // Summary
  // =========================================================================
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  if (failed.length) {
    console.log('Failing cases:')
    for (const f of failed) console.log(`  - ${f.name}`)
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
