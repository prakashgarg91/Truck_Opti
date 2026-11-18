#!/usr/bin/env node
/**
 * Driver trip -> agency job resolver — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). Replays supabase/migrations
 * including 20261039000000_driver_trip_job.sql; calls the RPC as PostgREST does (SET ROLE authenticated
 * + request.jwt.claims).
 *
 * Relation used (the only one in the schema): job_offers(shipment_id, driver_id) matches
 * agency_jobs(shipment_id, driver_id). The driver trip page holds a job_offers.id.
 *
 * Pinned contract:
 *   public.driver_trip_agency_job(p_offer_id uuid) RETURNS jsonb
 *     - SECURITY DEFINER, STABLE, search_path = public, pg_temp. EXECUTE: authenticated only.
 *     - The driver is resolved from auth.uid() (drivers.user_id); the offer must belong to the caller.
 *     - ok: {ok:true, job_id, job_status, can_share_location} and NOTHING else. can_share_location is true
 *       only when the job's agency is operational (approved).
 *     - Errors (typed, never an exception): 'not_found' (unknown id, another driver's offer, no sign-in:
 *       no existence leak), 'not_assigned' (no agency job of this shipment is assigned to the caller driver
 *       under an agency that actively employs that driver), 'job_not_active' (job is delivered/cancelled).
 *     - Writes nothing; public.agency_jobs RLS is NOT widened.
 *
 * Usage:  node scripts/driver_trip_job.db.test.mjs   (from the repo root)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261039000000_driver_trip_job.sql'
const MIGRATION_PRESENT = existsSync(join(MIGRATIONS_DIR, MIGRATION_FILE))

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

/** Resolves true when the call is refused (raised, or returned ok:false), false when it was accepted. */
async function refusedOrNotOk(promise) {
  try {
    const r = await promise
    return Boolean(r && r.ok === false)
  } catch {
    return true
  }
}

/** Passes only when the reply is exactly {ok:false, error: code}. */
function expectError(r, code) {
  expect(r && r.ok === false && r.error === code, `expected {ok:false,error:'${code}'}, got ${JSON.stringify(r)}`)
}

/**
 * Per-case resilience: a failing assertion records FAIL and the battery keeps running, so a
 * red-first run reports EVERY unmet contract clause with its exact reason.
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

/** Every case that touches the consignment objects is gated on the migration file being present. */
async function gatedCase(name, fn) {
  await testCase(name, async () => {
    if (!MIGRATION_PRESENT) {
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so driver_trip_agency_job does not exist yet`)
    }
    await fn()
  })
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
// Ids and role switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
let nonce = 0
const nx = (prefix) => `${prefix}-${++nonce}`

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

/** Superuser statement (service-role equivalent). Always resets the role first. */
async function su(sql, params = []) {
  await actAsService()
  return db.query(sql, params)
}

async function suOne(sql, params = []) {
  return (await su(sql, params)).rows[0]
}

// ---------------------------------------------------------------------------
// Fixtures (superuser). Only pre-existing tables are touched in setup.
// ---------------------------------------------------------------------------
async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify({}),
  ])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return id
}

async function createAgencyRow(userId, tag, status = 'pending') {
  const id = uid()
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6)`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, `07ABCDE${1000 + seq}A1Z5`, `ABCDE${4000 + seq}Q`]
  )
  return id
}

/** Membership row seeded by superuser (status 'revoked' also needs revoked_at, table CHECK). */
async function seedStaff(agencyId, tag, scope, status = 'active') {
  const userId = await createUser(tag)
  await su(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [uid(), agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
}


// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
let agencyA, agencyB, agencyS, ownerA, ownerS
let uA, uA2, uE, uB, uN, uS, uCust, staffA, custId
let dA, dA2, dE, dB, dS, dN
const SENT = { fare: 987654, notes: 'NOTE-SENTINEL-4242' }

async function createDriver(userId, tag) {
  const id = uid()
  await su(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', 'approved', true, 'ABCDE1234F')`,
    [id, userId, `${tag} Driver`, `9${String(seq).padStart(9, '0')}`]
  )
  return id
}

async function employ(agencyId, driverId, status = 'active') {
  await su(
    `INSERT INTO public.agency_driver_employment (agency_id, driver_id, status) VALUES ($1, $2, $3)`,
    [agencyId, driverId, status]
  )
}

async function createShipment() {
  const id = uid()
  await su(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Goods', 75000)`,
    [id, `DTJ-${seq}-${Date.now()}`, custId, uCust]
  )
  return id
}

/** Seeds a job that the guard triggers would refuse (stale/odd states): triggers are bypassed for the insert only. */
async function createJob(agencyId, shipmentId, driverId, status = 'accepted', force = false) {
  const id = uid()
  if (force) await su(`SET session_replication_role = replica`)
  await su(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, driver_id, status, fare, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, agencyId, shipmentId, driverId, status, SENT.fare, SENT.notes]
  )
  if (force) await su(`SET session_replication_role = origin`)
  return id
}

async function createOffer(shipmentId, driverId, status = 'accepted') {
  const id = uid()
  await su(
    `INSERT INTO public.job_offers (id, shipment_id, driver_id, offered_at, expires_at, status)
     VALUES ($1, $2, $3, now(), now() + interval '1 hour', $4)`,
    [id, shipmentId, driverId, status]
  )
  return id
}

/** One shipment + agency job + offer. Returns ids. */
async function scenario({ agency = agencyA, jobDriver, offerDriver, jobStatus = 'accepted', offerStatus = 'accepted', noJob = false, force = false }) {
  const shipment = await createShipment()
  const job = noJob ? null : await createJob(agency, shipment, jobDriver, jobStatus, force)
  const offer = await createOffer(shipment, offerDriver, offerStatus)
  return { shipment, job, offer }
}

const CALL_SQL = `SELECT public.driver_trip_agency_job($1::uuid) AS r`
async function callAs(userId, offerId) {
  return asActor(userId, async () => parseJson((await db.query(CALL_SQL, [offerId])).rows[0].r))
}

async function setupFixtures() {
  ownerA = await createUser('dtj-owner-a')
  agencyA = await createAgencyRow(ownerA, 'DTJ A', 'approved')
  const ownerB = await createUser('dtj-owner-b')
  agencyB = await createAgencyRow(ownerB, 'DTJ B', 'approved')
  ownerS = await createUser('dtj-owner-s')
  agencyS = await createAgencyRow(ownerS, 'DTJ S', 'suspended')
  staffA = await seedStaff(agencyA, 'dtj-dispatcher', 'dispatcher')
  uCust = await createUser('dtj-cust')
  custId = uid()
  await su(
    `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, gst_number, pan_number, created_by)
     VALUES ($1, 'DTJ Logistics', '9999999900', 'dtj-cust@example.com', 'Street', 'Delhi', 'Delhi', '110001', 'ABCDE1000F', 'FGHIJ2000K', $2)`,
    [custId, uCust]
  )
  uA = await createUser('dtj-drv-a')
  uA2 = await createUser('dtj-drv-a2')
  uE = await createUser('dtj-drv-e')
  uB = await createUser('dtj-drv-b')
  uN = await createUser('dtj-drv-n')
  uS = await createUser('dtj-drv-s')
  dA = await createDriver(uA, 'A')
  dA2 = await createDriver(uA2, 'A2')
  dE = await createDriver(uE, 'E')
  dB = await createDriver(uB, 'B')
  dS = await createDriver(uS, 'S')
  dN = await createDriver(uN, 'N')
  await employ(agencyA, dA)
  await employ(agencyA, dA2)
  await employ(agencyA, dE, 'ended')
  await employ(agencyB, dB)
  await employ(agencyS, dS)
}

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]})`)
  console.log(`migration ${MIGRATION_FILE}: ${MIGRATION_PRESENT ? 'present' : 'MISSING'}`)
  await setupFixtures()

  const happy = await scenario({ jobDriver: dA, offerDriver: dA })

  await testCase(`T01. migration file ${MIGRATION_FILE} is present`, async () => {
    expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing (not written yet)`)
  })

  await gatedCase('T02. function exists: (p_offer_id uuid) -> jsonb, SECURITY DEFINER, STABLE, one overload', async () => {
    const rows = (await su(
      `SELECT pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS res, p.prosecdef AS sd, p.provolatile AS vol
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'driver_trip_agency_job'`
    )).rows
    expect(rows.length === 1, `overloads ${rows.length}`)
    expect(rows[0].args === 'p_offer_id uuid' && rows[0].res === 'jsonb', `${rows[0].args} -> ${rows[0].res}`)
    expect(rows[0].sd === true && rows[0].vol === 's', 'not SECURITY DEFINER STABLE')
  })

  await gatedCase('T03. search_path pinned to public, pg_temp', async () => {
    const row = await suOne(
      `SELECT array_to_string(p.proconfig, ',') AS cfg FROM pg_proc p WHERE p.proname = 'driver_trip_agency_job'`
    )
    expect(row && /search_path=public, pg_temp/.test(row.cfg || ''), `proconfig ${row && row.cfg}`)
  })

  await gatedCase('T04. EXECUTE: authenticated yes; anon and PUBLIC no', async () => {
    const row = await suOne(
      `SELECT has_function_privilege('authenticated', 'public.driver_trip_agency_job(uuid)', 'EXECUTE') AS auth,
              has_function_privilege('anon', 'public.driver_trip_agency_job(uuid)', 'EXECUTE') AS anon,
              (SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
                WHERE p.proname = 'driver_trip_agency_job' AND a.grantee = 0) AS pub`
    )
    expect(row.auth === true && row.anon === false && Number(row.pub) === 0, JSON.stringify(row))
  })

  await gatedCase('T05. anon cannot call it', async () => {
    let refused = false
    try {
      await asAnon(CALL_SQL, [happy.offer])
    } catch {
      refused = true
    }
    expect(refused, 'anon call accepted')
  })

  await gatedCase('T06. the assigned, employed driver gets ok with job id, status and can_share_location true', async () => {
    const r = await callAs(uA, happy.offer)
    expect(r.ok === true && r.job_id === happy.job && r.job_status === 'accepted' && r.can_share_location === true, JSON.stringify(r))
  })

  await gatedCase('T07. exact ok shape: {ok, job_id, job_status, can_share_location} and nothing else', async () => {
    const r = await callAs(uA, happy.offer)
    expect(JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['can_share_location', 'job_id', 'job_status', 'ok']), Object.keys(r).join(','))
    expect(UUID_RE.test(r.job_id) && typeof r.can_share_location === 'boolean', 'bad types')
  })

  await gatedCase('T08. no fare, notes, agency id, shipment id or driver id leaks', async () => {
    const text = JSON.stringify(await callAs(uA, happy.offer))
    const bad = [String(SENT.fare), SENT.notes, agencyA, happy.shipment, dA, uA].filter((s) => text.includes(s))
    expect(bad.length === 0, 'leaked: ' + bad.join(', '))
  })

  for (const st of ['pending', 'accepted', 'in_transit']) {
    await gatedCase(`T09. job status ${st} is resolvable and reported as is`, async () => {
      const s = await scenario({ jobDriver: dA, offerDriver: dA, jobStatus: st })
      const r = await callAs(uA, s.offer)
      expect(r.ok === true && r.job_id === s.job && r.job_status === st && r.can_share_location === true, JSON.stringify(r))
    })
  }

  for (const st of ['delivered', 'cancelled']) {
    await gatedCase(`T10. job status ${st} gives job_not_active`, async () => {
      const s = await scenario({ jobDriver: dA, offerDriver: dA, jobStatus: st })
      const r = await callAs(uA, s.offer)
      expectError(r, 'job_not_active')
      expect(!('job_id' in r), 'job id leaked on error')
    })
  }

  await gatedCase('T11. another driver of the same agency gets not_found for this offer (no existence leak)', async () => {
    expectError(await callAs(uA2, happy.offer), 'not_found')
  })

  await gatedCase('T12. a driver of another agency gets not_found', async () => {
    expectError(await callAs(uB, happy.offer), 'not_found')
  })

  await gatedCase('T13. not_found is byte-identical for a foreign offer and a random id', async () => {
    const a = JSON.stringify(await callAs(uB, happy.offer))
    const b = JSON.stringify(await callAs(uB, uid()))
    expect(a === b && a === JSON.stringify({ ok: false, error: 'not_found' }), `${a} vs ${b}`)
  })

  await gatedCase('T14. NULL offer id gives not_found', async () => {
    expectError(await callAs(uA, null), 'not_found')
  })

  await gatedCase('T15. no sign-in claim gives not_found (typed, not an exception)', async () => {
    await actAs(null)
    try {
      expectError(parseJson((await db.query(CALL_SQL, [happy.offer])).rows[0].r), 'not_found')
    } finally {
      await actAsService()
    }
  })

  await gatedCase('T16. a user who is not a driver gets not_found', async () => {
    expectError(await callAs(uCust, happy.offer), 'not_found')
    expectError(await callAs(ownerA, happy.offer), 'not_found')
  })

  await gatedCase('T17. agency staff (dispatcher) cannot use it to resolve a driver offer', async () => {
    expectError(await callAs(staffA, happy.offer), 'not_found')
  })

  await gatedCase('T18. offer of the caller but the shipment has no agency job gives not_assigned', async () => {
    const s = await scenario({ jobDriver: null, offerDriver: dA, noJob: true })
    expectError(await callAs(uA, s.offer), 'not_assigned')
  })

  await gatedCase('T19. agency job with no driver yet gives not_assigned', async () => {
    const s = await scenario({ jobDriver: null, offerDriver: dA })
    expectError(await callAs(uA, s.offer), 'not_assigned')
  })

  await gatedCase('T20. agency job assigned to a colleague gives not_assigned to the offer holder', async () => {
    const s = await scenario({ jobDriver: dA2, offerDriver: dA })
    expectError(await callAs(uA, s.offer), 'not_assigned')
  })

  await gatedCase('T21. the assigned driver whose employment ENDED gets not_assigned', async () => {
    const s = await scenario({ jobDriver: dE, offerDriver: dE, force: true })
    expectError(await callAs(uE, s.offer), 'not_assigned')
  })

  await gatedCase('T22. a driver with no employment at all gets not_assigned', async () => {
    const s = await scenario({ jobDriver: dN, offerDriver: dN, force: true })
    expectError(await callAs(uN, s.offer), 'not_assigned')
  })

  await gatedCase('T23. job of an agency that does not employ the driver gives not_assigned', async () => {
    const s = await scenario({ agency: agencyB, jobDriver: dA, offerDriver: dA, force: true })
    expectError(await callAs(uA, s.offer), 'not_assigned')
  })

  for (const st of ['declined', 'expired', 'cancelled']) {
    await gatedCase(`T24. an offer in status ${st} gives not_assigned even when the job is assigned`, async () => {
      const s = await scenario({ jobDriver: dA, offerDriver: dA, offerStatus: st })
      expectError(await callAs(uA, s.offer), 'not_assigned')
    })
  }

  for (const st of ['pending', 'pickup_arrived', 'in_transit', 'delivery_arrived']) {
    await gatedCase(`T25. an offer in status ${st} with an active assigned job resolves ok`, async () => {
      const s = await scenario({ jobDriver: dA, offerDriver: dA, offerStatus: st })
      const r = await callAs(uA, s.offer)
      expect(r.ok === true && r.job_id === s.job, JSON.stringify(r))
    })
  }

  await gatedCase('T26. suspended agency: ok but can_share_location is false', async () => {
    const s = await scenario({ agency: agencyS, jobDriver: dS, offerDriver: dS, force: true })
    const r = await callAs(uS, s.offer)
    expect(r.ok === true && r.job_id === s.job && r.can_share_location === false, JSON.stringify(r))
  })

  await gatedCase('T27. live status change: delivering the job flips the answer to job_not_active', async () => {
    const s = await scenario({ jobDriver: dA, offerDriver: dA, jobStatus: 'in_transit' })
    expect((await callAs(uA, s.offer)).ok === true, 'not ok before')
    await su(`UPDATE public.agency_jobs SET status = 'delivered' WHERE id = $1`, [s.job])
    expectError(await callAs(uA, s.offer), 'job_not_active')
  })

  await gatedCase('T28. reassigning the job to a colleague makes the first driver not_assigned', async () => {
    const s = await scenario({ jobDriver: dA, offerDriver: dA })
    expect((await callAs(uA, s.offer)).ok === true, 'not ok before')
    await su(`UPDATE public.agency_jobs SET driver_id = $2 WHERE id = $1`, [s.job, dA2])
    expectError(await callAs(uA, s.offer), 'not_assigned')
  })

  await gatedCase('T29. ending the employment makes the answer not_assigned', async () => {
    const du = await createUser('dtj-tmp')
    const d = await createDriver(du, 'Tmp')
    await employ(agencyA, d)
    const s = await scenario({ jobDriver: d, offerDriver: d })
    expect((await callAs(du, s.offer)).ok === true, 'not ok before')
    await su(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE driver_id = $1`, [d])
    expectError(await callAs(du, s.offer), 'not_assigned')
  })

  await gatedCase('T30. suspending the agency later flips can_share_location to false', async () => {
    const ou = await createUser('dtj-tmp-owner')
    const ag = await createAgencyRow(ou, 'DTJ Tmp', 'approved')
    const du = await createUser('dtj-tmp-drv')
    const d = await createDriver(du, 'TmpS')
    await employ(ag, d)
    const s = await scenario({ agency: ag, jobDriver: d, offerDriver: d })
    expect((await callAs(du, s.offer)).can_share_location === true, 'not true before')
    await su(`UPDATE public.transport_agencies SET status = 'suspended' WHERE id = $1`, [ag])
    const r = await callAs(du, s.offer)
    expect(r.ok === true && r.can_share_location === false, JSON.stringify(r))
  })

  await gatedCase('T31. the id handed back is accepted by tracking_ping_record (same caller)', async () => {
    const s = await scenario({ jobDriver: dA, offerDriver: dA, jobStatus: 'in_transit' })
    const r = await callAs(uA, s.offer)
    const ping = await asActor(uA, async () =>
      parseJson((await db.query(`SELECT public.tracking_ping_record($1::uuid, 19.07, 72.87, 30, now()) AS r`, [r.job_id])).rows[0].r)
    )
    expect(ping.ok === true, JSON.stringify(ping))
  })

  await gatedCase('T32. the call writes nothing (row counts and updated_at unchanged)', async () => {
    const snap = async () => JSON.stringify([
      (await suOne(`SELECT count(*)::int AS n FROM public.agency_jobs`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.job_offers`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.agency_tracking_pings`)).n,
      (await suOne(`SELECT max(updated_at)::text AS m FROM public.agency_jobs`)).m,
    ])
    const before = await snap()
    await callAs(uA, happy.offer)
    await callAs(uB, happy.offer)
    expect(before === (await snap()), 'state changed')
  })

  await gatedCase('T33. agency_jobs RLS is not widened: the driver still reads 0 agency_jobs rows directly', async () => {
    const n = await asActor(uA, async () => (await db.query(`SELECT count(*)::int AS n FROM public.agency_jobs`)).rows[0].n)
    expect(Number(n) === 0, `driver reads ${n} rows`)
  })

  await gatedCase('T34. deterministic: two calls return the same payload', async () => {
    expect(JSON.stringify(await callAs(uA, happy.offer)) === JSON.stringify(await callAs(uA, happy.offer)), 'differs')
  })

  await gatedCase('T35. named-argument call (p_offer_id => ...) works as PostgREST sends it', async () => {
    const r = await asActor(uA, async () => parseJson((await db.query(`SELECT public.driver_trip_agency_job(p_offer_id => $1::uuid) AS r`, [happy.offer])).rows[0].r))
    expect(r.ok === true, JSON.stringify(r))
  })

  await gatedCase('T36. an argument naming an agency or driver is rejected (no such overload)', async () => {
    let refused = false
    try {
      await asActor(uA, () => db.query(`SELECT public.driver_trip_agency_job($1::uuid, $2::uuid)`, [happy.offer, agencyA]))
    } catch {
      refused = true
    }
    expect(refused, 'two-argument call accepted')
  })

  await gatedCase('T37. error replies are exactly {ok:false, error}', async () => {
    const r = await callAs(uA2, happy.offer)
    expect(JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['error', 'ok']), Object.keys(r).join(','))
  })

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  for (const f of failed.slice(0, 10)) console.log(`  - ${f.name}`)
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
