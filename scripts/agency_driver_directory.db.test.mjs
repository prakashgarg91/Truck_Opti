#!/usr/bin/env node
/**
 * Agency driver directory (names for payroll) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the
 * supabase/migrations chain including 20261032000000_agency_driver_names.sql and calls the RPC
 * the way PostgREST does: `SET ROLE authenticated` with `request.jwt.claims` set to the caller.
 *
 * Pinned contract:
 *   public.agency_driver_directory() RETURNS jsonb  (no arguments)
 *     - SECURITY DEFINER, STABLE, SET search_path = public, pg_temp; agency from auth.uid()
 *       via resolve_caller_agency_for_scopes. EXECUTE: authenticated only (not PUBLIC, not anon).
 *     - Scopes finance, dispatcher, fleet_manager and the owner. viewer: {ok:false,error:'forbidden_scope'}.
 *     - Typed refusals: 'sign_in_required', 'no_agency', 'agency_not_approved', 'forbidden_scope',
 *       'multiple_agencies'. Never an exception for these.
 *     - Success: {ok:true, drivers:[{driver_id, name, phone_last4}]} for every driver with ANY
 *       agency_driver_employment row (active or ended) of the caller's agency, one entry per driver,
 *       ordered by name then driver_id. phone_last4 = last 4 digits of the phone, null when the phone
 *       has fewer than 4 digits. Nothing else is exposed (no PAN, licence, address, full phone, bank).
 *     - Other agencies' drivers are never visible. public.drivers RLS is NOT widened.
 *
 * Evidence class: local DB only (PGlite, single session).
 * Usage:  node scripts/agency_driver_directory.db.test.mjs   (from the repo root)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261032000000_agency_driver_names.sql'
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
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so agency_driver_directory does not exist yet`)
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
// Fixtures
// ---------------------------------------------------------------------------
let ownerA, ownerB, ownerS, ownerEmpty, ownerMulti
let agencyA, agencyB, agencyS, agencyEmpty
let financeA, dispatcherA, fleetA, viewerA, revokedA, suspendedStaffS, noAgency
let drvActive, drvEnded, drvDup, drvB, drvShort, drvShared
const SENTINEL = {
  licence: 'DLSENTINEL7788',
  bank: '5566778899001122',
  upi: 'sentinel@upi',
  city: 'Sentinelpur',
  empLicence: 'EMPLIC-SENT-99',
}

async function createDriver(name, phone) {
  const id = uid()
  await su(
    `INSERT INTO public.drivers (id, full_name, phone, vehicle_type, license_number, aadhaar_last4, bank_account, ifsc_code, upi_id, home_city, pan_number)
     VALUES ($1, $2, $3, 'tata_407', $4, '9012', $5, 'HDFC0001234', $6, $7, 'QWERT1234Y')`,
    [id, name, phone, SENTINEL.licence, SENTINEL.bank, SENTINEL.upi, SENTINEL.city]
  )
  return id
}

async function employ(agencyId, driverId, status = 'active', contact = '+91 90000 00000') {
  await su(
    `INSERT INTO public.agency_driver_employment (agency_id, driver_id, licence_number, contact_phone, status)
     VALUES ($1, $2, $3, $4, $5)`,
    [agencyId, driverId, SENTINEL.empLicence, contact, status]
  )
}

async function setupFixtures() {
  ownerA = await createUser('dd-owner-a')
  agencyA = await createAgencyRow(ownerA, 'Dir A', 'approved')
  ownerB = await createUser('dd-owner-b')
  agencyB = await createAgencyRow(ownerB, 'Dir B', 'approved')
  ownerS = await createUser('dd-owner-s')
  agencyS = await createAgencyRow(ownerS, 'Dir S', 'suspended')
  ownerEmpty = await createUser('dd-owner-empty')
  agencyEmpty = await createAgencyRow(ownerEmpty, 'Dir Empty', 'approved')
  ownerMulti = await createUser('dd-owner-multi')
  await createAgencyRow(ownerMulti, 'Dir Multi 1', 'approved')
  await createAgencyRow(ownerMulti, 'Dir Multi 2', 'approved')

  financeA = await seedStaff(agencyA, 'dd-finance', 'finance')
  dispatcherA = await seedStaff(agencyA, 'dd-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'dd-fleet', 'fleet_manager')
  viewerA = await seedStaff(agencyA, 'dd-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'dd-revoked', 'finance', 'revoked')
  suspendedStaffS = await seedStaff(agencyS, 'dd-suspended', 'finance')
  noAgency = await createUser('dd-no-agency')

  drvActive = await createDriver('Ravi Kumar', '+91 98765-43210')
  drvEnded = await createDriver('  Anil Sharma  ', '9123456789')
  drvDup = await createDriver('Mohan Das', '0000 1111')
  drvB = await createDriver('Bhavna Other Agency', '9000012345')
  drvShort = await createDriver('Short Phone', '12')
  drvShared = await createDriver('Shared Driver', '8888877777')

  await employ(agencyA, drvActive, 'active')
  await employ(agencyA, drvEnded, 'ended')
  await employ(agencyA, drvDup, 'ended')
  await employ(agencyA, drvDup, 'active')
  await employ(agencyA, drvShort, 'ended')
  await employ(agencyA, drvShared, 'ended')
  await employ(agencyB, drvShared, 'active')
  await employ(agencyB, drvB, 'active')
  await employ(agencyS, await createDriver('Suspended Agency Driver', '7777766666'), 'active')
}

const DIR_SQL = `SELECT public.agency_driver_directory() AS r`
async function dirAs(userId) {
  return asActor(userId, async () => parseJson((await db.query(DIR_SQL)).rows[0].r))
}
function names(r) {
  return r.drivers.map((d) => d.name)
}

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]})`)
  console.log(`migration ${MIGRATION_FILE}: ${MIGRATION_PRESENT ? 'present' : 'MISSING'}`)
  await setupFixtures()

  await testCase(`D01. migration file ${MIGRATION_FILE} is present`, async () => {
    expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing (not written yet)`)
  })

  await gatedCase('D02. function exists: no arguments, returns jsonb, SECURITY DEFINER, STABLE', async () => {
    const rows = (await su(
      `SELECT pg_get_function_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS res,
              p.prosecdef AS sd, p.provolatile AS vol
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'agency_driver_directory'`
    )).rows
    expect(rows.length === 1, `expected exactly one overload, got ${rows.length}`)
    expect(rows[0].args === '' && rows[0].res === 'jsonb', `signature ${rows[0].args} -> ${rows[0].res}`)
    expect(rows[0].sd === true, 'not SECURITY DEFINER')
    expect(rows[0].vol === 's', 'not STABLE')
  })

  await gatedCase('D03. search_path is pinned to public, pg_temp', async () => {
    const row = await suOne(
      `SELECT array_to_string(p.proconfig, ',') AS cfg FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'agency_driver_directory'`
    )
    expect(row && /search_path=public, pg_temp/.test(row.cfg || ''), `proconfig ${row && row.cfg}`)
  })

  await gatedCase('D04. EXECUTE: authenticated yes; anon and PUBLIC no', async () => {
    const row = await suOne(
      `SELECT has_function_privilege('authenticated', 'public.agency_driver_directory()', 'EXECUTE') AS auth,
              has_function_privilege('anon', 'public.agency_driver_directory()', 'EXECUTE') AS anon,
              (SELECT count(*)::int FROM pg_proc p, aclexplode(p.proacl) a
                WHERE p.proname = 'agency_driver_directory' AND a.grantee = 0) AS pub`
    )
    expect(row.auth === true && row.anon === false && Number(row.pub) === 0, JSON.stringify(row))
  })

  await gatedCase('D05. anon cannot call it', async () => {
    let refused = false
    try {
      await asAnon(DIR_SQL)
    } catch {
      refused = true
    }
    expect(refused, 'anon call was accepted')
  })

  await gatedCase('D06. owner gets ok with active AND ended drivers, one entry each', async () => {
    const r = await dirAs(ownerA)
    expect(r && r.ok === true && Array.isArray(r.drivers), JSON.stringify(r))
    const got = [...names(r)].sort()
    const want = ['Anil Sharma', 'Mohan Das', 'Ravi Kumar', 'Shared Driver', 'Short Phone'].sort()
    expect(JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}`)
  })

  for (const [label, who] of [
    ['D07. finance', () => financeA],
    ['D08. dispatcher', () => dispatcherA],
    ['D09. fleet_manager', () => fleetA],
  ]) {
    await gatedCase(`${label} staff may read the directory (same list as the owner)`, async () => {
      const r = await dirAs(who())
      const o = await dirAs(ownerA)
      expect(r && r.ok === true, JSON.stringify(r))
      expect(JSON.stringify(r) === JSON.stringify(o), 'differs from the owner view')
    })
  }

  await gatedCase('D10. viewer is refused with forbidden_scope', async () => {
    expectError(await dirAs(viewerA), 'forbidden_scope')
  })

  await gatedCase('D11. revoked member is refused with no_agency and sees no drivers', async () => {
    const r = await dirAs(revokedA)
    expectError(r, 'no_agency')
    expect(!('drivers' in r), 'drivers leaked')
  })

  await gatedCase('D12. staff of a suspended agency get agency_not_approved', async () => {
    expectError(await dirAs(suspendedStaffS), 'agency_not_approved')
  })

  await gatedCase('D13. owner of a suspended agency gets agency_not_approved', async () => {
    expectError(await dirAs(ownerS), 'agency_not_approved')
  })

  await gatedCase('D14. a user with no agency gets no_agency', async () => {
    expectError(await dirAs(noAgency), 'no_agency')
  })

  await gatedCase('D15. no sign-in claim gives sign_in_required (typed, not an exception)', async () => {
    await actAs(null)
    try {
      const r = parseJson((await db.query(DIR_SQL)).rows[0].r)
      expectError(r, 'sign_in_required')
    } finally {
      await actAsService()
    }
  })

  await gatedCase('D16. an owner of two agencies gets multiple_agencies', async () => {
    expectError(await dirAs(ownerMulti), 'multiple_agencies')
  })

  await gatedCase('D17. other agencies are never visible (A excludes B and S drivers; B sees only its own)', async () => {
    const a = await dirAs(ownerA)
    expect(!names(a).includes('Bhavna Other Agency') && !names(a).includes('Suspended Agency Driver'), 'A sees foreign drivers')
    const b = await dirAs(ownerB)
    expect(JSON.stringify([...names(b)].sort()) === JSON.stringify(['Bhavna Other Agency', 'Shared Driver']), JSON.stringify(names(b)))
  })

  await gatedCase('D18. a driver shared (ended in A, active in B) is listed for both agencies', async () => {
    expect(names(await dirAs(ownerA)).includes('Shared Driver'), 'missing in A')
    expect(names(await dirAs(ownerB)).includes('Shared Driver'), 'missing in B')
  })

  await gatedCase('D19. exact shape: top-level {ok, drivers}; each driver exactly {driver_id, name, phone_last4}', async () => {
    const r = await dirAs(ownerA)
    expect(JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['drivers', 'ok']), Object.keys(r).join(','))
    for (const d of r.drivers) {
      expect(JSON.stringify(Object.keys(d).sort()) === JSON.stringify(['driver_id', 'name', 'phone_last4']), Object.keys(d).join(','))
      expect(UUID_RE.test(d.driver_id), 'driver_id not a uuid')
    }
  })

  await gatedCase('D20. driver_id values are the real driver ids', async () => {
    const r = await dirAs(ownerA)
    const ids = r.drivers.map((d) => d.driver_id)
    for (const id of [drvActive, drvEnded, drvDup, drvShort, drvShared]) expect(ids.includes(id), `missing ${id}`)
    expect(!ids.includes(drvB), 'B driver present')
  })

  await gatedCase('D21. name comes from drivers.full_name, trimmed', async () => {
    const r = await dirAs(ownerA)
    const e = r.drivers.find((d) => d.driver_id === drvEnded)
    expect(e && e.name === 'Anil Sharma', JSON.stringify(e))
  })

  await gatedCase('D22. phone_last4 is the last 4 digits, ignoring formatting', async () => {
    const r = await dirAs(ownerA)
    const get = (id) => r.drivers.find((d) => d.driver_id === id).phone_last4
    expect(get(drvActive) === '3210', get(drvActive))
    expect(get(drvEnded) === '6789', get(drvEnded))
    expect(get(drvDup) === '1111', get(drvDup))
  })

  await gatedCase('D23. a phone with fewer than 4 digits gives phone_last4 null (no full phone)', async () => {
    const r = await dirAs(ownerA)
    const d = r.drivers.find((x) => x.driver_id === drvShort)
    expect(d && d.phone_last4 === null, JSON.stringify(d))
  })

  await gatedCase('D24. no sensitive value leaks anywhere in the payload', async () => {
    const text = JSON.stringify(await dirAs(ownerA))
    const bad = [
      SENTINEL.licence, SENTINEL.bank, SENTINEL.upi, SENTINEL.city, SENTINEL.empLicence,
      '9876543210', '+91 98765-43210', '98765-43210', '9123456789', 'HDFC0001234', 'QWERT1234Y', 'ABCDE', '90000 00000',
    ].filter((s) => text.includes(s))
    expect(bad.length === 0, 'leaked: ' + bad.join(', '))
  })

  await gatedCase('D25. an agency with no employed drivers gets ok with an empty list', async () => {
    const r = await dirAs(ownerEmpty)
    expect(r && r.ok === true && Array.isArray(r.drivers) && r.drivers.length === 0, JSON.stringify(r))
  })

  await gatedCase('D26. ordering is by name then driver_id, deterministic across calls', async () => {
    const r1 = await dirAs(ownerA)
    const r2 = await dirAs(ownerA)
    expect(JSON.stringify(r1) === JSON.stringify(r2), 'two calls differ')
    const ns = names(r1)
    expect(JSON.stringify(ns) === JSON.stringify([...ns].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))), 'not ordered by name: ' + ns.join('|'))
  })

  await gatedCase('D27. a driver with both an ended and an active row appears once', async () => {
    const r = await dirAs(ownerA)
    expect(r.drivers.filter((d) => d.driver_id === drvDup).length === 1, 'duplicate or missing')
  })

  await gatedCase('D28. the call writes nothing', async () => {
    const count = async () => [
      (await suOne(`SELECT count(*)::int AS n FROM public.drivers`)).n,
      (await suOne(`SELECT count(*)::int AS n FROM public.agency_driver_employment`)).n,
    ]
    const before = await count()
    await dirAs(ownerA)
    await dirAs(financeA)
    expect(JSON.stringify(before) === JSON.stringify(await count()), 'row counts changed')
  })

  await gatedCase('D29. public.drivers RLS is not widened: finance staff still read 0 driver rows directly', async () => {
    const n = await asActor(financeA, async () => (await db.query(`SELECT count(*)::int AS n FROM public.drivers`)).rows[0].n)
    expect(Number(n) === 0, `finance staff read ${n} rows`)
  })

  await gatedCase('D30. the function takes no agency argument: passing one is rejected', async () => {
    let refused = false
    try {
      await asActor(ownerA, () => db.query(`SELECT public.agency_driver_directory($1::uuid)`, [agencyB]))
    } catch {
      refused = true
    }
    expect(refused, 'an argument was accepted')
  })

  await gatedCase('D31. a hire in another agency does not change this agency view', async () => {
    const before = JSON.stringify(await dirAs(ownerA))
    const extra = await createDriver('Late Joiner B', '6666655555')
    await employ(agencyB, extra, 'active')
    expect(JSON.stringify(await dirAs(ownerA)) === before, 'A view changed after a B-only hire')
  })

  await gatedCase('D32. a new hire appears, and stays listed after the employment ends', async () => {
    const d = await createDriver('Mid Joiner', '5555544444')
    await employ(agencyA, d, 'active')
    expect(names(await dirAs(ownerA)).includes('Mid Joiner'), 'not listed after hire')
    await su(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE agency_id = $1 AND driver_id = $2`, [agencyA, d])
    expect(names(await dirAs(ownerA)).includes('Mid Joiner'), 'dropped after the employment ended')
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
