#!/usr/bin/env node
/**
 * Agency driver payouts — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the command RPC the way
 * PostgREST does per request: `SET ROLE authenticated` with
 * `request.jwt.claims` set to the caller's sub.
 *
 * Pinned contract under test (the migration that implements it is NOT written
 * yet, so every RPC case and every RLS-after-migration case is EXPECTED to fail
 * now; the migration is supabase/migrations/20261017000000_agency_driver_payouts.sql):
 *   public.agency_driver_payout_request(p_driver_id uuid, p_amount numeric,
 *     p_note text, p_idempotency_key text) RETURNS jsonb
 *   - SECURITY DEFINER, pinned search_path, EXECUTE for authenticated and
 *     service_role only (anon denied). NO agency id argument.
 *   - Scope 'finance' via resolve_caller_agency_for_scopes (owner always allowed):
 *       suspended-agency staff   -> 'Agency approval is required.'
 *       user with no agency      -> 'No agency profile found for this account.'
 *       dispatcher/fleet/viewer  -> 'Your access scope does not allow this action.'
 *       other agency's owner     -> allowed; the row lands on THEIR agency.
 *   - Validation (RAISE EXCEPTION): idempotency key, amount > 0, at most two
 *     decimals, amount <= 500000.00, note <= 500 characters.
 *   - Business refusals are {ok:false,error:'<code>'}:
 *       driver_not_approved, driver_not_employed (ACTIVE employment in caller's
 *       agency only), idempotency_key_reused.
 *   - Success: {ok:true,state:'created',payout:{id,amount,status:'pending',requested_at}}
 *     and one driver_payouts row (agency_id = caller agency, type 'agency_pay',
 *     status 'pending', idempotency_key, requested_by = caller user id).
 *   - Replay with the same key and identical driver/amount/note returns
 *     {ok:true,state:'idempotent_replay'} with the same payout id.
 *   - Unique (agency_id, idempotency_key) where key is not null.
 *
 * RLS changes in the same migration (tested here):
 *   - agency_inserts_driver_payout is DROPPED: direct agency_pay INSERT by an
 *     owner or finance staff member is refused by row-level security.
 *   - Driver's own withdrawal INSERT keeps working (regression guard).
 *   - Agency read policy is scope-aware: owner and finance read their agency's
 *     rows; dispatcher, fleet_manager and viewer read none; a foreign owner reads
 *     only their own agency; the driver reads own rows; platform admin reads all.
 *
 * Hardening clauses (independent security review, 2026-11-08), all EXPECTED red until the
 * migration is updated:
 *   - Driver self-insert: only a plain pending withdrawal (agency_id, idempotency_key,
 *     requested_by, processed_at NULL; type withdrawal; status pending). Driver UPDATE/DELETE
 *     and agency-owner UPDATE/DELETE of agency_pay rows are refused (groups H).
 *   - Replay lookups consider only the agency's own agency_pay rows (group K).
 *   - Idempotency key at most 200 characters (group L); NaN/Infinity/0.005 amounts (group N).
 *   - Per-agency daily limits inside the command: 100 requests and 2000000.00 rupees per
 *     database day, counting non-rejected agency_pay rows; replays are not counted (group DL).
 *
 * Assumptions (not pinned by the brief, flagged for the implementer):
 *   - A NULL note is accepted and stored as NULL.
 *   - A driver that is both unapproved and unemployed reports driver_not_approved.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST /
 * GoTrue behaviour is NOT covered. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_driver_payouts.db.test.mjs   (from the repo root)
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
// Fixtures (service-role equivalent: run as the postgres superuser)
// Same shapes and columns as scripts/agency_job_commands.db.test.mjs.
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
const MISSING_DRIVER = uid()

async function createUser(tag, role = null) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify({}),
  ])
  if (role) {
    await db.query(`INSERT INTO public.users (id, email, role) VALUES ($1, $2, $3)`, [id, email, role])
  } else {
    await db.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  }
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

/** Membership row seeded by superuser (status 'revoked' also needs revoked_at, table CHECK). */
async function addMembership(agencyId, scope, tag, status = 'active') {
  const userId = await createUser(tag)
  await db.query(
    `INSERT INTO public.agency_memberships (agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return userId
}

/** Approved driver with an ACTIVE employment at the given agency (default). */
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

/** Approved driver with NO employment record anywhere. */
async function approvedDriverWithoutEmployment(tag) {
  const userId = await createUser(`${tag}-drv`)
  const driverId = await createDriver(userId, tag, 'approved')
  return { userId, driverId }
}

/** Superuser insert of a driver_payouts row using only the pre-existing columns. */
async function insertPayoutRow({ driverId, agencyId = null, type = 'agency_pay', amount = '100.00', status = 'pending', note = null }) {
  const id = uid()
  await db.query(
    `INSERT INTO public.driver_payouts (id, driver_id, amount, status, agency_id, type, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, driverId, amount, status, agencyId, type, note]
  )
  return id
}

/**
 * Superuser insert of a driver_payouts row with the agency-request columns.
 * requestedAgoDays 0 means requested_at = now(); 2 means now() - 2 days.
 */
async function seedPayoutRow({
  driverId,
  agencyId = null,
  type = 'agency_pay',
  amount = '100.00',
  status = 'pending',
  note = null,
  idempotencyKey = null,
  requestedAgoDays = 0,
}) {
  const id = uid()
  await db.query(
    `INSERT INTO public.driver_payouts (id, driver_id, amount, status, agency_id, type, note, idempotency_key, requested_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() - ($9::int * interval '1 day'))`,
    [id, driverId, amount, status, agencyId, type, note, idempotencyKey, requestedAgoDays]
  )
  return id
}

async function seedPayoutRows(count, options) {
  for (let i = 0; i < count; i++) await seedPayoutRow(options)
}

/** The driver's own INSERT as the authenticated role (what PostgREST sends from the driver app). */
async function driverInsertPayout(userId, driverId, columns) {
  const keys = ['driver_id', ...Object.keys(columns)]
  const params = [driverId, ...Object.values(columns)]
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  return asActor(userId, () =>
    db.query(`INSERT INTO public.driver_payouts (${keys.join(', ')}) VALUES (${placeholders})`, params)
  )
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

async function one(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows[0]
}

async function countByNote(note) {
  return (await one(`SELECT count(*)::int AS n FROM public.driver_payouts WHERE note IS NOT DISTINCT FROM $1`, [note])).n
}

async function countByKey(agencyId, key) {
  return (
    await one(`SELECT count(*)::int AS n FROM public.driver_payouts WHERE agency_id = $1 AND idempotency_key = $2`, [
      agencyId,
      key,
    ])
  ).n
}

async function countByKeyAnyAgency(key) {
  return (await one(`SELECT count(*)::int AS n FROM public.driver_payouts WHERE idempotency_key = $1`, [key])).n
}

// ---------------------------------------------------------------------------
// Command wrapper (authenticated role + JWT claims, exactly as PostgREST)
// ---------------------------------------------------------------------------
const RPC_SQL = `SELECT public.agency_driver_payout_request($1::uuid, $2::numeric, $3::text, $4::text) AS r`

async function requestAs(userId, driverId, amount, note, key) {
  return asActor(userId, async () => {
    const result = await db.query(RPC_SQL, [driverId, amount, note, key])
    return parseJson(result.rows[0].r)
  })
}

/** Lists which of the given payout ids the actor can SELECT (RLS applied). */
async function visibleIds(userId, ids) {
  return asActor(userId, async () => {
    const result = await db.query(
      `SELECT id FROM public.driver_payouts WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [ids]
    )
    return result.rows.map((r) => r.id)
  })
}

function expectSameIds(actual, expected, label) {
  const a = [...actual].sort()
  const e = [...expected].sort()
  expect(
    JSON.stringify(a) === JSON.stringify(e),
    `${label}: saw ${a.length} of the fixture rows, expected ${e.length}`
  )
}

// ---------------------------------------------------------------------------
// Agencies and staff
// ---------------------------------------------------------------------------
let agencyUserA
let agencyUserB
let agencyUserS
let agencyA
let agencyB
let agencyS

async function setupAgencies() {
  agencyUserA = await createUser('dpayout-agency-a')
  agencyA = await createAgencyRow(agencyUserA, 'DPayout Agency A', 'approved')
  agencyUserB = await createUser('dpayout-agency-b')
  agencyB = await createAgencyRow(agencyUserB, 'DPayout Agency B', 'approved')
  agencyUserS = await createUser('dpayout-agency-s')
  agencyS = await createAgencyRow(agencyUserS, 'DPayout Agency S', 'suspended')
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
  await setupAgencies()

  // Staff seeded by superuser INSERT into public.agency_memberships.
  const users = {
    dispatcher: await addMembership(agencyA, 'dispatcher', 'dpayout-dispatcher'),
    fleetManager: await addMembership(agencyA, 'fleet_manager', 'dpayout-fleet'),
    finance: await addMembership(agencyA, 'finance', 'dpayout-finance'),
    viewer: await addMembership(agencyA, 'viewer', 'dpayout-viewer'),
    suspended: await addMembership(agencyS, 'dispatcher', 'dpayout-suspended'),
    noAgency: await createUser('dpayout-no-agency'),
  }

  // =========================================================================
  // A. Command success and validation (owner)
  // =========================================================================
  await testCase('A1. owner request returns ok/created with the pinned payout shape', async () => {
    const d = await freshDriverAt(agencyA, 'a1')
    const r = await requestAs(agencyUserA, d.driverId, '1250.50', 'A1 note', `k-a1-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    expect(r.payout && typeof r.payout.id === 'string' && UUID_RE.test(r.payout.id), `payout.id ${JSON.stringify(r.payout)}`)
    expect(Number(r.payout.amount) === 1250.5, `payout.amount ${r.payout.amount}`)
    expect(r.payout.status === 'pending', `payout.status ${r.payout.status}`)
    expect(typeof r.payout.requested_at === 'string' && r.payout.requested_at.length > 0, 'payout.requested_at missing')
  })

  await testCase('A2. owner request persists exactly one agency_pay row with caller agency, key and requested_by', async () => {
    const d = await freshDriverAt(agencyA, 'a2')
    const key = `k-a2-${seq}`
    const note = `A2-${seq}`
    const r = await requestAs(agencyUserA, d.driverId, '250.00', note, key)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    const row = await one(
      `SELECT driver_id, agency_id, type, status, amount::text AS amount, note, idempotency_key, requested_by
         FROM public.driver_payouts WHERE id = $1`,
      [r.payout.id]
    )
    expect(row, 'no driver_payouts row for the returned payout id')
    expect(row.driver_id === d.driverId, `driver_id ${row.driver_id}`)
    expect(row.agency_id === agencyA, `agency_id ${row.agency_id}, expected agency A`)
    expect(row.type === 'agency_pay', `type ${row.type}`)
    expect(row.status === 'pending', `status ${row.status}`)
    expect(row.amount === '250.00', `amount ${row.amount}`)
    expect(row.note === note, `note ${row.note}`)
    expect(row.idempotency_key === key, `idempotency_key ${row.idempotency_key}`)
    expect(row.requested_by === agencyUserA, `requested_by ${row.requested_by}, expected the owner`)
    expect((await countByKey(agencyA, key)) === 1, 'expected exactly one row for the key')
  })

  await testCase('A3. blank or NULL idempotency key raises "Idempotency key is required."', async () => {
    const d = await freshDriverAt(agencyA, 'a3')
    await gather(
      ['', '   ', null].map((key, i) => [
        `key ${JSON.stringify(key)} (${i})`,
        () => expectExactError(requestAs(agencyUserA, d.driverId, '100.00', `A3-${seq}-${i}`, key), 'Idempotency key is required.'),
      ])
    )
  })

  await testCase('A4. NULL amount raises "Payout amount must be greater than zero."', async () => {
    const d = await freshDriverAt(agencyA, 'a4')
    await expectExactError(
      requestAs(agencyUserA, d.driverId, null, `A4-${seq}`, `k-a4-${seq}`),
      'Payout amount must be greater than zero.'
    )
  })

  await testCase('A5. zero and negative amounts raise "Payout amount must be greater than zero."', async () => {
    const d = await freshDriverAt(agencyA, 'a5')
    await gather(
      ['0', '-1.00'].map((amount) => [
        `amount ${amount}`,
        () => expectExactError(
          requestAs(agencyUserA, d.driverId, amount, `A5-${seq}-${amount}`, `k-a5-${seq}-${amount}`),
          'Payout amount must be greater than zero.'
        ),
      ])
    )
  })

  await testCase('A6. more than two decimal places raises "Payout amount must have at most two decimal places."', async () => {
    const d = await freshDriverAt(agencyA, 'a6')
    await gather(
      ['10.005', '0.001'].map((amount) => [
        `amount ${amount}`,
        () => expectExactError(
          requestAs(agencyUserA, d.driverId, amount, `A6-${seq}-${amount}`, `k-a6-${seq}-${amount}`),
          'Payout amount must have at most two decimal places.'
        ),
      ])
    )
  })

  await testCase('A7. amount above 500000.00 raises "Payout amount exceeds the per-request limit."', async () => {
    const d = await freshDriverAt(agencyA, 'a7')
    await expectExactError(
      requestAs(agencyUserA, d.driverId, '500000.01', `A7-${seq}`, `k-a7-${seq}`),
      'Payout amount exceeds the per-request limit.'
    )
  })

  await testCase('A8. amount exactly 500000.00 is allowed', async () => {
    const d = await freshDriverAt(agencyA, 'a8')
    const r = await requestAs(agencyUserA, d.driverId, '500000.00', `A8-${seq}`, `k-a8-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  await testCase('A9. note longer than 500 characters raises "Payout note is too long."', async () => {
    const d = await freshDriverAt(agencyA, 'a9')
    await expectExactError(
      requestAs(agencyUserA, d.driverId, '100.00', 'n'.repeat(501), `k-a9-${seq}`),
      'Payout note is too long.'
    )
  })

  await testCase('A10. note of exactly 500 characters is allowed', async () => {
    const d = await freshDriverAt(agencyA, 'a10')
    const r = await requestAs(agencyUserA, d.driverId, '100.00', 'n'.repeat(500), `k-a10-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  await testCase('A11. validation refusals write no payout row', async () => {
    const d = await freshDriverAt(agencyA, 'a11')
    const marker = `A11-${seq}`
    await gather([
      ['zero amount', () => expectExactError(
        requestAs(agencyUserA, d.driverId, '0', marker, `k-a11-z-${seq}`),
        'Payout amount must be greater than zero.'
      )],
      ['blank key', () => expectExactError(
        requestAs(agencyUserA, d.driverId, '100.00', marker, '  '),
        'Idempotency key is required.'
      )],
      ['over limit', () => expectExactError(
        requestAs(agencyUserA, d.driverId, '500000.01', marker, `k-a11-l-${seq}`),
        'Payout amount exceeds the per-request limit.'
      )],
    ])
    expect((await countByNote(marker)) === 0, 'a refused validation left a payout row behind')
  })

  await testCase('A12. a NULL note is accepted and stored as NULL', async () => {
    const d = await freshDriverAt(agencyA, 'a12')
    const key = `k-a12-${seq}`
    const r = await requestAs(agencyUserA, d.driverId, '75.00', null, key)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    const row = await one(`SELECT note FROM public.driver_payouts WHERE id = $1`, [r.payout.id])
    expect(row && row.note === null, `note ${row && row.note}`)
  })

  // =========================================================================
  // B. Driver eligibility (owner of agency A)
  // =========================================================================
  await testCase('B1. pending (not approved) driver is refused with driver_not_approved and writes nothing', async () => {
    const d = await freshDriverAt(agencyA, 'b1', { status: 'pending' })
    const note = `B1-${seq}`
    const r = await requestAs(agencyUserA, d.driverId, '100.00', note, `k-b1-${seq}`)
    expect(r && r.ok === false && r.error === 'driver_not_approved', `got ${JSON.stringify(r)}`)
    expect((await countByNote(note)) === 0, 'refused request wrote a row')
  })

  await testCase('B2. approved driver with no employment record is refused with driver_not_employed', async () => {
    const d = await approvedDriverWithoutEmployment('b2')
    const note = `B2-${seq}`
    const r = await requestAs(agencyUserA, d.driverId, '100.00', note, `k-b2-${seq}`)
    expect(r && r.ok === false && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
    expect((await countByNote(note)) === 0, 'refused request wrote a row')
  })

  await testCase('B3. approved driver whose employment here has ended is refused with driver_not_employed', async () => {
    const d = await approvedDriverWithoutEmployment('b3')
    await createEmploymentRow(agencyA, d.driverId, { status: 'ended' })
    const note = `B3-${seq}`
    const r = await requestAs(agencyUserA, d.driverId, '100.00', note, `k-b3-${seq}`)
    expect(r && r.ok === false && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
    expect((await countByNote(note)) === 0, 'refused request wrote a row')
  })

  await testCase('B4. approved driver employed by agency B only is refused for agency A with driver_not_employed', async () => {
    const d = await approvedDriverWithoutEmployment('b4')
    await createEmploymentRow(agencyB, d.driverId, { status: 'active' })
    const note = `B4-${seq}`
    const r = await requestAs(agencyUserA, d.driverId, '100.00', note, `k-b4-${seq}`)
    expect(r && r.ok === false && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
    expect((await countByNote(note)) === 0, 'refused request wrote a row')
  })

  await testCase('B5. all four eligibility refusals together leave no payout row for the marker note', async () => {
    const marker = `B5-${seq}`
    const pending = await freshDriverAt(agencyA, 'b5p', { status: 'pending' })
    const none = await approvedDriverWithoutEmployment('b5n')
    const ended = await approvedDriverWithoutEmployment('b5e')
    await createEmploymentRow(agencyA, ended.driverId, { status: 'ended' })
    const elsewhere = await approvedDriverWithoutEmployment('b5o')
    await createEmploymentRow(agencyB, elsewhere.driverId, { status: 'active' })
    await gather([
      ['pending', async () => {
        const r = await requestAs(agencyUserA, pending.driverId, '10.00', marker, `k-b5-p-${seq}`)
        expect(r && r.error === 'driver_not_approved', `got ${JSON.stringify(r)}`)
      }],
      ['no employment', async () => {
        const r = await requestAs(agencyUserA, none.driverId, '10.00', marker, `k-b5-n-${seq}`)
        expect(r && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
      }],
      ['ended', async () => {
        const r = await requestAs(agencyUserA, ended.driverId, '10.00', marker, `k-b5-e-${seq}`)
        expect(r && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
      }],
      ['agency B employment', async () => {
        const r = await requestAs(agencyUserA, elsewhere.driverId, '10.00', marker, `k-b5-o-${seq}`)
        expect(r && r.error === 'driver_not_employed', `got ${JSON.stringify(r)}`)
      }],
    ])
    expect((await countByNote(marker)) === 0, 'a refused eligibility check left a payout row behind')
  })

  // =========================================================================
  // C. Idempotency
  // =========================================================================
  await testCase('C1. same key, same driver/amount/note replays as idempotent_replay with the same payout id', async () => {
    const d = await freshDriverAt(agencyA, 'c1')
    const key = `k-c1-${seq}`
    const first = await requestAs(agencyUserA, d.driverId, '400.00', 'C1 note', key)
    expect(first && first.ok === true && first.state === 'created', `first call ${JSON.stringify(first)}`)
    const replay = await requestAs(agencyUserA, d.driverId, '400.00', 'C1 note', key)
    expect(replay && replay.ok === true && replay.state === 'idempotent_replay', `replay ${JSON.stringify(replay)}`)
    expect(replay.payout.id === first.payout.id, `replay id ${replay.payout.id}, first id ${first.payout.id}`)
  })

  await testCase('C2. a replay leaves exactly one row for the key', async () => {
    const d = await freshDriverAt(agencyA, 'c2')
    const key = `k-c2-${seq}`
    await requestAs(agencyUserA, d.driverId, '410.00', 'C2 note', key)
    const replay = await requestAs(agencyUserA, d.driverId, '410.00', 'C2 note', key)
    expect(replay && replay.state === 'idempotent_replay', `replay ${JSON.stringify(replay)}`)
    expect((await countByKey(agencyA, key)) === 1, `rows for key: ${await countByKey(agencyA, key)}, expected 1`)
  })

  await testCase('C3. same key with a different driver returns idempotency_key_reused and writes no new row', async () => {
    const d1 = await freshDriverAt(agencyA, 'c3a')
    const d2 = await freshDriverAt(agencyA, 'c3b')
    const key = `k-c3-${seq}`
    await requestAs(agencyUserA, d1.driverId, '420.00', 'C3 note', key)
    const r = await requestAs(agencyUserA, d2.driverId, '420.00', 'C3 note', key)
    expect(r && r.ok === false && r.error === 'idempotency_key_reused', `got ${JSON.stringify(r)}`)
    expect((await countByKey(agencyA, key)) === 1, 'a reused key created a second row')
  })

  await testCase('C4. same key with a different amount returns idempotency_key_reused and writes no new row', async () => {
    const d = await freshDriverAt(agencyA, 'c4')
    const key = `k-c4-${seq}`
    await requestAs(agencyUserA, d.driverId, '430.00', 'C4 note', key)
    const r = await requestAs(agencyUserA, d.driverId, '431.00', 'C4 note', key)
    expect(r && r.ok === false && r.error === 'idempotency_key_reused', `got ${JSON.stringify(r)}`)
    expect((await countByKey(agencyA, key)) === 1, 'a reused key created a second row')
  })

  await testCase('C5. same key with a different note returns idempotency_key_reused and writes no new row', async () => {
    const d = await freshDriverAt(agencyA, 'c5')
    const key = `k-c5-${seq}`
    await requestAs(agencyUserA, d.driverId, '440.00', 'C5 note a', key)
    const r = await requestAs(agencyUserA, d.driverId, '440.00', 'C5 note b', key)
    expect(r && r.ok === false && r.error === 'idempotency_key_reused', `got ${JSON.stringify(r)}`)
    expect((await countByKey(agencyA, key)) === 1, 'a reused key created a second row')
  })

  await testCase('C6. the same key used by a different agency is independent and creates its own row', async () => {
    const dA = await freshDriverAt(agencyA, 'c6a')
    const dB = await freshDriverAt(agencyB, 'c6b')
    const key = `k-c6-${seq}`
    const rA = await requestAs(agencyUserA, dA.driverId, '450.00', 'C6 note', key)
    expect(rA && rA.ok === true && rA.state === 'created', `agency A ${JSON.stringify(rA)}`)
    const rB = await requestAs(agencyUserB, dB.driverId, '450.00', 'C6 note', key)
    expect(rB && rB.ok === true && rB.state === 'created', `agency B ${JSON.stringify(rB)}`)
    expect(rB.payout.id !== rA.payout.id, 'agency B reused agency A payout id')
    expect((await countByKey(agencyB, key)) === 1, 'agency B has no row for the key')
    expect((await countByKeyAnyAgency(key)) === 2, `rows for key across agencies: ${await countByKeyAnyAgency(key)}, expected 2`)
  })

  // =========================================================================
  // S. Scope matrix across the RPC (8 actors, one case per actor)
  // =========================================================================
  const SCOPE_ACTORS = [
    { key: 'owner', label: 'owner (agency A)', userId: agencyUserA, allowed: true, expectAgency: agencyA, driverAgency: agencyA },
    { key: 'dispatcher', label: 'dispatcher', userId: users.dispatcher, allowed: false, denial: 'Your access scope does not allow this action.', driverAgency: agencyA },
    { key: 'fleet_manager', label: 'fleet_manager', userId: users.fleetManager, allowed: false, denial: 'Your access scope does not allow this action.', driverAgency: agencyA },
    { key: 'finance', label: 'finance', userId: users.finance, allowed: true, expectAgency: agencyA, driverAgency: agencyA },
    { key: 'viewer', label: 'viewer', userId: users.viewer, allowed: false, denial: 'Your access scope does not allow this action.', driverAgency: agencyA },
    { key: 'suspended', label: 'suspended-agency staff', userId: users.suspended, allowed: false, denial: 'Agency approval is required.', driverAgency: agencyA },
    { key: 'no_agency', label: 'user with no agency', userId: users.noAgency, allowed: false, denial: 'No agency profile found for this account.', driverAgency: agencyA },
    { key: 'outsider', label: 'other-agency owner (agency B)', userId: agencyUserB, allowed: true, expectAgency: agencyB, driverAgency: agencyB },
  ]

  for (const [index, actor] of SCOPE_ACTORS.entries()) {
    const n = index + 1
    const verdict = actor.allowed ? 'may request; the row lands on its own agency' : 'is refused by the scope gate and writes nothing'
    await testCase(`S${n}. ${actor.label} ${verdict}`, async () => {
      const note = `S${n}-${actor.key}-${seq}`
      const key = `k-s${n}-${actor.key}-${seq}`
      const d = await freshDriverAt(actor.driverAgency, `s${n}-${actor.key}`)
      const call = requestAs(actor.userId, d.driverId, '750.00', note, key)
      if (actor.allowed) {
        const r = await call
        expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
        const row = await one(`SELECT agency_id FROM public.driver_payouts WHERE note = $1`, [note])
        expect(row && row.agency_id === actor.expectAgency, `row landed on ${row && row.agency_id}, expected ${actor.expectAgency}`)
        expect((await countByNote(note)) === 1, 'expected exactly one row')
      } else {
        await expectExactError(call, actor.denial)
        expect((await countByNote(note)) === 0, 'a refused request wrote a payout row')
      }
    })
  }

  // =========================================================================
  // R. RLS reads after the migration (scope-aware agency read policy)
  // =========================================================================
  const dX = await freshDriverAt(agencyA, 'r-x')
  const dY = await freshDriverAt(agencyB, 'r-y')
  const payA1 = await insertPayoutRow({ driverId: dX.driverId, agencyId: agencyA, amount: '100.00', note: `R-A1-${seq}` })
  const payA2 = await insertPayoutRow({ driverId: dX.driverId, agencyId: agencyA, amount: '200.00', note: `R-A2-${seq}` })
  const payB1 = await insertPayoutRow({ driverId: dY.driverId, agencyId: agencyB, amount: '300.00', note: `R-B1-${seq}` })
  const READ_IDS = [payA1, payA2, payB1]
  const A_ROWS = [payA1, payA2]
  const adminUser = await createUser('dpayout-admin', 'admin')

  await testCase('R1. agency OWNER reads own agency payout rows and not agency B rows', async () => {
    expectSameIds(await visibleIds(agencyUserA, READ_IDS), A_ROWS, 'owner A')
  })

  await testCase('R2. finance staff reads their agency payout rows and not agency B rows', async () => {
    expectSameIds(await visibleIds(users.finance, READ_IDS), A_ROWS, 'finance A')
  })

  await testCase('R3. dispatcher staff reads zero payout rows', async () => {
    expectSameIds(await visibleIds(users.dispatcher, READ_IDS), [], 'dispatcher A')
  })

  await testCase('R4. fleet_manager staff reads zero payout rows', async () => {
    expectSameIds(await visibleIds(users.fleetManager, READ_IDS), [], 'fleet_manager A')
  })

  await testCase('R5. viewer staff reads zero payout rows', async () => {
    expectSameIds(await visibleIds(users.viewer, READ_IDS), [], 'viewer A')
  })

  await testCase('R6. another agency OWNER reads only their own agency rows (zero of agency A)', async () => {
    expectSameIds(await visibleIds(agencyUserB, READ_IDS), [payB1], 'owner B')
  })

  await testCase('R7. the driver still reads their own payout rows and not other drivers rows', async () => {
    expectSameIds(await visibleIds(dX.userId, READ_IDS), A_ROWS, 'driver X')
  })

  await testCase('R8. platform admin reads every payout row', async () => {
    expectSameIds(await visibleIds(adminUser, READ_IDS), READ_IDS, 'platform admin')
  })

  // =========================================================================
  // D. Direct inserts: agency_pay is no longer insertable by agency staff;
  //    the driver's own withdrawal insert keeps working (regression guard).
  // =========================================================================
  await testCase('D1. agency OWNER direct INSERT of an agency_pay row is refused by row-level security', async () => {
    const d = await freshDriverAt(agencyA, 'd1')
    const note = `D1-${seq}`
    await expectRaises(
      asActor(agencyUserA, () =>
        db.query(
          `INSERT INTO public.driver_payouts (driver_id, amount, status, agency_id, type, note)
           VALUES ($1, '100.00', 'pending', $2, 'agency_pay', $3)`,
          [d.driverId, agencyA, note]
        )
      ),
      'row-level security'
    )
    expect((await countByNote(note)) === 0, 'the direct insert left a row behind')
  })

  await testCase('D2. finance staff direct INSERT of an agency_pay row is refused by row-level security', async () => {
    const d = await freshDriverAt(agencyA, 'd2')
    const note = `D2-${seq}`
    await expectRaises(
      asActor(users.finance, () =>
        db.query(
          `INSERT INTO public.driver_payouts (driver_id, amount, status, agency_id, type, note)
           VALUES ($1, '100.00', 'pending', $2, 'agency_pay', $3)`,
          [d.driverId, agencyA, note]
        )
      ),
      'row-level security'
    )
    expect((await countByNote(note)) === 0, 'the direct insert left a row behind')
  })

  await testCase('D3. driver own withdrawal INSERT still works (regression guard)', async () => {
    const d = await freshDriverAt(agencyA, 'd3')
    const note = `D3-${seq}`
    await asActor(d.userId, () =>
      db.query(
        `INSERT INTO public.driver_payouts (driver_id, amount, status, type, note)
         VALUES ($1, '60.00', 'pending', 'withdrawal', $2)`,
        [d.driverId, note]
      )
    )
    expect((await countByNote(note)) === 1, 'driver withdrawal row was not written')
  })

  await testCase('D4. driver withdrawal for ANOTHER driver is refused by row-level security', async () => {
    const mine = await freshDriverAt(agencyA, 'd4m')
    const theirs = await freshDriverAt(agencyA, 'd4t')
    const note = `D4-${seq}`
    await expectRaises(
      asActor(mine.userId, () =>
        db.query(
          `INSERT INTO public.driver_payouts (driver_id, amount, status, type, note)
           VALUES ($1, '60.00', 'pending', 'withdrawal', $2)`,
          [theirs.driverId, note]
        )
      ),
      'row-level security'
    )
    expect((await countByNote(note)) === 0, 'a foreign withdrawal left a row behind')
  })

  // =========================================================================
  // H. Driver self-insert hardening (security review): a driver may insert
  //    only a plain pending withdrawal for their own driver row.
  // =========================================================================
  /** Driver's own INSERT with one forbidden column changed: refused, and no row is left behind. */
  async function assertDriverInsertRefused(tag, overrides, expectedMessage) {
    const d = await freshDriverAt(agencyA, tag)
    const note = `${tag}-${seq}`
    await expectRaises(
      driverInsertPayout(d.userId, d.driverId, { amount: '60.00', status: 'pending', type: 'withdrawal', note, ...overrides }),
      expectedMessage
    )
    expect((await countByNote(note)) === 0, 'a refused driver insert left a row behind')
  }

  await testCase('H1. driver inserts a plain own withdrawal (pending, no agency, key, requester or processed date) and it succeeds', async () => {
    const d = await freshDriverAt(agencyA, 'h1')
    const note = `H1-${seq}`
    await driverInsertPayout(d.userId, d.driverId, { amount: '60.00', status: 'pending', type: 'withdrawal', note })
    expect((await countByNote(note)) === 1, 'plain driver withdrawal was not written')
  })

  await testCase('H2. driver insert with status approved is refused by row-level security', () =>
    assertDriverInsertRefused('h2', { status: 'approved' }, 'row-level security')
  )

  await testCase('H3. driver insert with status paid is refused by row-level security', () =>
    assertDriverInsertRefused('h3', { status: 'paid' }, 'row-level security')
  )

  await testCase('H4. driver insert with another agency id is refused by row-level security', () =>
    assertDriverInsertRefused('h4', { agency_id: agencyB }, 'row-level security')
  )

  await testCase('H5. driver insert with an idempotency key is refused by row-level security', () =>
    assertDriverInsertRefused('h5', { idempotency_key: `h5-key-${seq}` }, 'row-level security')
  )

  await testCase('H6. driver insert with requested_by set to another user is refused by row-level security', () =>
    assertDriverInsertRefused('h6', { requested_by: agencyUserB }, 'row-level security')
  )

  await testCase('H7. driver insert with processed_at set is refused by row-level security', () =>
    assertDriverInsertRefused('h7', { processed_at: new Date().toISOString() }, 'row-level security')
  )

  await testCase('H8. driver insert with type agency_pay is refused (any error)', () =>
    assertDriverInsertRefused('h8', { type: 'agency_pay' }, undefined)
  )

  await testCase('H9. driver cannot UPDATE own payout row to approved; row stays pending', async () => {
    const d = await freshDriverAt(agencyA, 'h9')
    const pid = await seedPayoutRow({ driverId: d.driverId, type: 'withdrawal', amount: '40.00', note: `H9-${seq}` })
    let affected = 0
    try {
      affected = (await asActor(d.userId, () => db.query(`UPDATE public.driver_payouts SET status = 'approved' WHERE id = $1`, [pid]))).affectedRows
    } catch {
      /* a privilege or RLS refusal is an acceptable outcome */
    }
    expect(affected === 0, `driver UPDATE touched ${affected} row(s)`)
    const status = (await one(`SELECT status FROM public.driver_payouts WHERE id = $1`, [pid])).status
    expect(status === 'pending', `status is ${status} after the driver UPDATE`)
  })

  await testCase('H9b. driver cannot DELETE own payout row; row still exists', async () => {
    const d = await freshDriverAt(agencyA, 'h9b')
    const pid = await seedPayoutRow({ driverId: d.driverId, type: 'withdrawal', amount: '41.00', note: `H9b-${seq}` })
    let affected = 0
    try {
      affected = (await asActor(d.userId, () => db.query(`DELETE FROM public.driver_payouts WHERE id = $1`, [pid]))).affectedRows
    } catch {
      /* a privilege or RLS refusal is an acceptable outcome */
    }
    expect(affected === 0, `driver DELETE removed ${affected} row(s)`)
    expect((await one(`SELECT count(*)::int AS n FROM public.driver_payouts WHERE id = $1`, [pid])).n === 1, 'row is gone')
  })

  await testCase('H10. agency OWNER cannot UPDATE an agency_pay payout row directly; row stays pending', async () => {
    const d = await freshDriverAt(agencyA, 'h10')
    const pid = await seedPayoutRow({ driverId: d.driverId, agencyId: agencyA, amount: '55.00', note: `H10-${seq}` })
    let affected = 0
    try {
      affected = (await asActor(agencyUserA, () => db.query(`UPDATE public.driver_payouts SET status = 'approved' WHERE id = $1`, [pid]))).affectedRows
    } catch {
      /* refusal is acceptable */
    }
    expect(affected === 0, `owner UPDATE touched ${affected} row(s)`)
    const status = (await one(`SELECT status FROM public.driver_payouts WHERE id = $1`, [pid])).status
    expect(status === 'pending', `status is ${status} after the owner UPDATE`)
  })

  await testCase('H10b. agency OWNER cannot DELETE an agency_pay payout row directly; row still exists', async () => {
    const d = await freshDriverAt(agencyA, 'h10b')
    const pid = await seedPayoutRow({ driverId: d.driverId, agencyId: agencyA, amount: '56.00', note: `H10b-${seq}` })
    let affected = 0
    try {
      affected = (await asActor(agencyUserA, () => db.query(`DELETE FROM public.driver_payouts WHERE id = $1`, [pid]))).affectedRows
    } catch {
      /* refusal is acceptable */
    }
    expect(affected === 0, `owner DELETE removed ${affected} row(s)`)
    expect((await one(`SELECT count(*)::int AS n FROM public.driver_payouts WHERE id = $1`, [pid])).n === 1, 'row is gone')
  })

  // =========================================================================
  // K. Replay lookups consider only the agency's own agency_pay rows.
  //    The unique index (agency_id, idempotency_key) is NOT scoped by type, so a
  //    same-key withdrawal under the SAME agency cannot sit beside the command's
  //    own row. K1 covers the same key with no agency (the index ignores it);
  //    K2 covers an agency-scoped withdrawal under a different key.
  // =========================================================================
  await testCase('K1. a driver withdrawal with the same key and no agency is not treated as a replay', async () => {
    const d = await freshDriverAt(agencyA, 'k1')
    const key = `k-k1-${seq}`
    const squatter = await seedPayoutRow({
      driverId: d.driverId, agencyId: null, type: 'withdrawal', amount: '70.00', idempotencyKey: key, note: `K1sq-${seq}`,
    })
    const r = await requestAs(agencyUserA, d.driverId, '70.00', `K1-${seq}`, key)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    expect(r.payout.id !== squatter, 'the command returned the withdrawal row as a replay')
    expect((await countByKey(agencyA, key)) === 1, 'the agency call did not get its own agency_pay row')
  })

  await testCase('K2. an agency-scoped driver withdrawal under another key does not affect the agency call', async () => {
    const d = await freshDriverAt(agencyA, 'k2')
    const key = `k-k2-${seq}`
    await seedPayoutRow({
      driverId: d.driverId, agencyId: agencyA, type: 'withdrawal', amount: '80.00', idempotencyKey: `k-k2-other-${seq}`, note: `K2sq-${seq}`,
    })
    const r = await requestAs(agencyUserA, d.driverId, '80.00', `K2-${seq}`, key)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  // =========================================================================
  // L. Idempotency key length (200 characters is the maximum)
  // =========================================================================
  await testCase('L1. idempotency key of 201 characters raises "Idempotency key is too long."', async () => {
    const d = await freshDriverAt(agencyA, 'l1')
    const note = `L1-${seq}`
    await expectExactError(
      requestAs(agencyUserA, d.driverId, '100.00', note, `k${'x'.repeat(200)}`),
      'Idempotency key is too long.'
    )
    expect((await countByNote(note)) === 0, 'a refused key left a row behind')
  })

  await testCase('L2. idempotency key of exactly 200 characters is accepted', async () => {
    const d = await freshDriverAt(agencyA, 'l2')
    const key = `L2-${seq}-`.padEnd(200, 'x')
    expect(key.length === 200, `fixture key length ${key.length}`)
    const r = await requestAs(agencyUserA, d.driverId, '100.00', `L2-${seq}`, key)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  // =========================================================================
  // N. Amount edge values
  // =========================================================================
  await testCase('N1. NaN and Infinity amounts raise "Payout amount exceeds the per-request limit."', async () => {
    const d = await freshDriverAt(agencyA, 'n1')
    await gather(
      ['NaN', 'Infinity'].map((amount) => [
        `amount ${amount}`,
        () => expectExactError(
          requestAs(agencyUserA, d.driverId, amount, `N1-${seq}-${amount}`, `k-n1-${seq}-${amount}`),
          'Payout amount exceeds the per-request limit.'
        ),
      ])
    )
  })

  await testCase('N2. amount 0.005 raises "Payout amount must have at most two decimal places."', async () => {
    const d = await freshDriverAt(agencyA, 'n2')
    await expectExactError(
      requestAs(agencyUserA, d.driverId, '0.005', `N2-${seq}`, `k-n2-${seq}`),
      'Payout amount must have at most two decimal places.'
    )
  })

  await testCase('N3. amount exactly 500000.00 is accepted (boundary, restated for the edge set)', async () => {
    const d = await freshDriverAt(agencyA, 'n3')
    const r = await requestAs(agencyUserA, d.driverId, '500000.00', `N3-${seq}`, `k-n3-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  // =========================================================================
  // DL. Per-agency daily limits: at most 100 requests and 2000000.00 rupees
  //     per agency per database day, counting agency_pay rows not rejected.
  //     Each case uses its own agency so limits never leak between cases.
  // =========================================================================
  async function freshPayoutAgency(tag) {
    const owner = await createUser(`dpayout-${tag}-owner`)
    const agency = await createAgencyRow(owner, `DPayout ${tag}`, 'approved')
    return { owner, agency }
  }

  await testCase('DL1. the 101st request of the day hits the count limit; another agency is unaffected', async () => {
    const x = await freshPayoutAgency('dl1x')
    const y = await freshPayoutAgency('dl1y')
    const dx = await freshDriverAt(x.agency, 'dl1x')
    const dy = await freshDriverAt(y.agency, 'dl1y')
    await seedPayoutRows(100, { driverId: dx.driverId, agencyId: x.agency, amount: '1.00' })
    const note = `DL1-${seq}`
    await expectExactError(
      requestAs(x.owner, dx.driverId, '1.00', note, `k-dl1-${seq}`),
      'Daily payout limit for this agency reached.'
    )
    expect((await countByNote(note)) === 0, 'the refused request left a row behind')
    const r = await requestAs(y.owner, dy.driverId, '1.00', `DL1y-${seq}`, `k-dl1y-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `other agency: ${JSON.stringify(r)}`)
  })

  await testCase('DL2. a 1.01 request over the 2000000.00 daily total is refused; a 1.00 request reaching it exactly succeeds', async () => {
    const x = await freshPayoutAgency('dl2')
    const d = await freshDriverAt(x.agency, 'dl2')
    for (const amount of ['500000.00', '500000.00', '500000.00', '499999.00']) {
      await seedPayoutRow({ driverId: d.driverId, agencyId: x.agency, amount })
    }
    const total = (await one(`SELECT sum(amount)::text AS t FROM public.driver_payouts WHERE agency_id = $1`, [x.agency])).t
    expect(total === '1999999.00', `seeded total ${total}, expected 1999999.00`)
    await expectExactError(
      requestAs(x.owner, d.driverId, '1.01', `DL2a-${seq}`, `k-dl2a-${seq}`),
      'Daily payout limit for this agency reached.'
    )
    const r = await requestAs(x.owner, d.driverId, '1.00', `DL2b-${seq}`, `k-dl2b-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `1.00 at the total: ${JSON.stringify(r)}`)
  })

  await testCase('DL3. rejected rows do not count toward the daily limits', async () => {
    const x = await freshPayoutAgency('dl3')
    const d = await freshDriverAt(x.agency, 'dl3')
    // 100 rows and 3000000.00 in total: over both limits if rejected rows counted.
    await seedPayoutRows(100, { driverId: d.driverId, agencyId: x.agency, amount: '30000.00', status: 'rejected' })
    const r = await requestAs(x.owner, d.driverId, '100.00', `DL3-${seq}`, `k-dl3-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  await testCase('DL4. rows requested two days ago do not count toward the daily limits', async () => {
    const x = await freshPayoutAgency('dl4')
    const d = await freshDriverAt(x.agency, 'dl4')
    await seedPayoutRows(100, { driverId: d.driverId, agencyId: x.agency, amount: '30000.00', requestedAgoDays: 2 })
    const r = await requestAs(x.owner, d.driverId, '100.00', `DL4-${seq}`, `k-dl4-${seq}`)
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  await testCase('DL5. a replay of an existing request still returns idempotent_replay when the daily limit is reached', async () => {
    const x = await freshPayoutAgency('dl5')
    const d = await freshDriverAt(x.agency, 'dl5')
    const key = `k-dl5-${seq}`
    const note = `DL5-${seq}`
    const first = await requestAs(x.owner, d.driverId, '1.00', note, key)
    expect(first && first.ok === true && first.state === 'created', `first call ${JSON.stringify(first)}`)
    // The created row is the 100th counted request once 99 more are seeded.
    await seedPayoutRows(99, { driverId: d.driverId, agencyId: x.agency, amount: '1.00' })
    await expectExactError(
      requestAs(x.owner, d.driverId, '1.00', `DL5-new-${seq}`, `k-dl5-new-${seq}`),
      'Daily payout limit for this agency reached.'
    )
    const replay = await requestAs(x.owner, d.driverId, '1.00', note, key)
    expect(replay && replay.ok === true && replay.state === 'idempotent_replay', `replay ${JSON.stringify(replay)}`)
    expect(replay.payout.id === first.payout.id, 'replay returned a different payout id')
  })

  // =========================================================================
  // G. Grants and signature
  // =========================================================================
  await testCase('G1. anon may not execute agency_driver_payout_request (permission denied)', () =>
    expectRaises(
      asAnon(RPC_SQL, [MISSING_DRIVER, '1.00', 'g1', 'g1-key']),
      'permission denied'
    )
  )

  await testCase('G2. EXECUTE is granted to authenticated and service_role only; SECURITY DEFINER; search_path pinned', async () => {
    const info = await db.query(`
      SELECT p.prosecdef,
             array_to_string(p.proconfig, ',') AS config,
             array_agg(DISTINCT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END) AS grantees
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.proname = 'agency_driver_payout_request'
        AND a.privilege_type = 'EXECUTE'
      GROUP BY p.prosecdef, p.proconfig`)
    expect(info.rows.length === 1, `expected 1 function with EXECUTE grants, found ${info.rows.length}`)
    const r = info.rows[0]
    const grantees = r.grantees || []
    const failures = []
    if (!grantees.includes('authenticated')) failures.push('authenticated missing')
    if (!grantees.includes('service_role')) failures.push('service_role missing')
    if (grantees.includes('PUBLIC')) failures.push('PUBLIC has EXECUTE')
    if (grantees.includes('anon')) failures.push('anon has EXECUTE')
    if (r.prosecdef !== true) failures.push('not SECURITY DEFINER')
    if (!/search_path=public/.test(r.config || '')) failures.push(`search_path not pinned (${r.config || 'none'})`)
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G3. signature is exactly (p_driver_id uuid, p_amount numeric, p_note text, p_idempotency_key text) returns jsonb, with no agency id argument', async () => {
    const info = await db.query(`
      SELECT pg_get_function_identity_arguments(p.oid) AS args,
             pg_get_function_result(p.oid) AS res
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
      WHERE p.proname = 'agency_driver_payout_request'`)
    expect(info.rows.length === 1, `expected 1 definition, found ${info.rows.length}`)
    const { args, res } = info.rows[0]
    expect(
      args === 'p_driver_id uuid, p_amount numeric, p_note text, p_idempotency_key text',
      `identity arguments: ${args}`
    )
    expect(res === 'jsonb', `return type ${res}`)
    expect(!/agency/i.test(args), `an argument names an agency: ${args}`)
  })

  await testCase('G4. has_function_privilege: authenticated and service_role true, anon false', async () => {
    const sig = 'public.agency_driver_payout_request(uuid,numeric,text,text)'
    const priv = await one(
      `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_ok,
              has_function_privilege('service_role', $1, 'EXECUTE') AS svc_ok,
              has_function_privilege('anon', $1, 'EXECUTE') AS anon_ok`,
      [sig]
    )
    expect(priv.auth_ok === true, 'authenticated cannot EXECUTE')
    expect(priv.svc_ok === true, 'service_role cannot EXECUTE')
    expect(priv.anon_ok === false, 'anon can EXECUTE')
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
