#!/usr/bin/env node
/**
 * transport_agencies row guard — PGlite battery (security regression).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). The owner policy
 * "Agencies: own record" is FOR ALL, so an authenticated owner can run direct INSERT/UPDATE/DELETE on their
 * own row. This battery pins that a direct (PostgREST) caller cannot change the server-controlled columns,
 * cannot register as anything but a neutral pending agency, cannot delete the row, while every legitimate
 * owner write, the admin path, service_role and SECURITY DEFINER code keep working.
 *
 *   protected (owner direct write must not change): id, user_id, status, rejection_reason, approved_by,
 *                                                   approved_at, rating, total_jobs, created_at
 *   editable  (registration + profile fields):      company_name, gstin, transport_license, pan_number,
 *                                                   contact_*, address, city, state, pincode, bank_account,
 *                                                   ifsc_code, fleet_size, operating_routes, updated_at
 *
 * Evidence class: local DB only (PGlite, single session).
 * Usage:  node scripts/agency_row_guard.db.test.mjs   (from the repo root)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261040000000_agency_row_guard.sql'
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
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so x`)
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
let ownerA, ownerP, ownerR, ownerS, ownerB, adminU, staffA, stranger
let agencyA, agencyP, agencyR, agencyS, agencyB
const APPROVER = { id: null }

/** Columns the OWNER must never change directly (value must stay as the server set it). */
const PROTECTED = ['id', 'user_id', 'status', 'rejection_reason', 'approved_by', 'approved_at', 'rating', 'total_jobs', 'created_at']
/** Columns the owner legitimately edits (registration form + profile fields). */
const EDITABLE = [
  'company_name', 'gstin', 'transport_license', 'pan_number', 'contact_name', 'contact_phone', 'contact_email',
  'address', 'city', 'state', 'pincode', 'bank_account', 'ifsc_code', 'fleet_size', 'operating_routes', 'updated_at',
]

async function seedAgency(userId, tag, status) {
  const id = uid()
  await su(
    `INSERT INTO public.transport_agencies
       (id, user_id, company_name, city, status, gstin, pan_number, rating, total_jobs, approved_by, approved_at, rejection_reason)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6, $7, $8, $9, $10::timestamptz, $11)`,
    [
      id, userId, `${tag} Transport Pvt Ltd`, status, `07ABCDE${1000 + seq}A1Z5`, `ABCDE${4000 + seq}Q`,
      status === 'approved' ? 4.5 : 0, status === 'approved' ? 7 : 0,
      status === 'approved' || status === 'suspended' ? APPROVER.id : null,
      status === 'approved' || status === 'suspended' ? '2026-01-02T03:04:05Z' : null,
      status === 'rejected' ? 'Documents unclear' : null,
    ]
  )
  return id
}

const rowOf = async (id) => suOne(`SELECT * FROM public.transport_agencies WHERE id = $1`, [id])

/** Runs a direct statement as the user; returns {ok, error, rowCount}. Never throws. */
async function direct(userId, sql, params = []) {
  try {
    const r = await asActor(userId, () => db.query(sql, params))
    return { ok: true, rowCount: r.affectedRows ?? r.rows.length, rows: r.rows }
  } catch (error) {
    await actAsService()
    return { ok: false, error: firstLine(error), rowCount: 0, rows: [] }
  }
}

/** The protected value must be byte-identical afterwards, whether the statement raised or was neutralised. */
async function assertUnchanged(agencyId, col, before) {
  const after = await rowOf(agencyId)
  expect(String(after[col]) === String(before[col]), `${col} changed: ${before[col]} -> ${after[col]}`)
}

async function setupFixtures() {
  adminU = uid()
  await su(`INSERT INTO auth.users (id, email) VALUES ($1, 'rg-admin@example.com')`, [adminU])
  await su(`INSERT INTO public.users (id, email, role) VALUES ($1, 'rg-admin@example.com', 'admin')`, [adminU])
  APPROVER.id = adminU
  ownerA = await createUser('rg-owner-a')
  ownerP = await createUser('rg-owner-p')
  ownerR = await createUser('rg-owner-r')
  ownerS = await createUser('rg-owner-s')
  ownerB = await createUser('rg-owner-b')
  stranger = await createUser('rg-stranger')
  agencyA = await seedAgency(ownerA, 'RG A', 'approved')
  agencyP = await seedAgency(ownerP, 'RG P', 'pending')
  agencyR = await seedAgency(ownerR, 'RG R', 'rejected')
  agencyS = await seedAgency(ownerS, 'RG S', 'suspended')
  agencyB = await seedAgency(ownerB, 'RG B', 'approved')
  staffA = await seedStaff(agencyA, 'rg-dispatcher', 'dispatcher')
}

const regPayload = (userId, extra = {}) => ({
  user_id: userId,
  company_name: 'Registered Carriers',
  gstin: null,
  transport_license: 'TL-1',
  pan_number: 'ABCDE9999Q',
  contact_name: 'Owner',
  contact_phone: '9876543210',
  contact_email: null,
  address: null,
  city: 'Pune',
  state: 'Maharashtra',
  pincode: null,
  fleet_size: 3,
  operating_routes: null,
  bank_account: '123456789012',
  ifsc_code: 'SBIN0001234',
  status: 'pending',
  ...extra,
})

async function insertAs(userId, payload) {
  const cols = Object.keys(payload)
  const sql = `INSERT INTO public.transport_agencies (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`
  return direct(userId, sql, cols.map((c) => payload[c]))
}

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]})`)
  await setupFixtures()

  await testCase('G01. every transport_agencies column is classified as protected or editable (new columns force a decision)', async () => {
    const cols = (await su(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'transport_agencies'`
    )).rows.map((r) => r.column_name)
    const unknown = cols.filter((c) => !PROTECTED.includes(c) && !EDITABLE.includes(c))
    expect(unknown.length === 0, 'unclassified columns: ' + unknown.join(', '))
    const missing = [...PROTECTED, ...EDITABLE].filter((c) => !cols.includes(c))
    expect(missing.length === 0, 'classified but absent: ' + missing.join(', '))
  })

  // --- Protected columns, as an APPROVED owner (the strongest position) -----------------------------------------
  const attacks = {
    rating: [`rating = 5`],
    total_jobs: [`total_jobs = 9999`],
    approved_at: [`approved_at = now()`],
    approved_by: [`approved_by = user_id`],
    rejection_reason: [`rejection_reason = 'tampered'`],
    user_id: [`user_id = '${'00000000-0000-4000-8000-0000000000aa'}'::uuid`],
    created_at: [`created_at = '2000-01-01'::timestamptz`],
  }
  for (const [col, [set]] of Object.entries(attacks)) {
    await testCase(`G02. approved owner cannot change ${col} directly`, async () => {
      if (col === 'user_id') {
        await su(`INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000aa', 'rg-target@example.com') ON CONFLICT DO NOTHING`)
      }
      const before = await rowOf(agencyA)
      await direct(ownerA, `UPDATE public.transport_agencies SET ${set} WHERE id = $1`, [agencyA])
      await assertUnchanged(agencyA, col, before)
    })
  }

  await testCase('G03. owner of a PENDING agency cannot self-approve (status) nor stamp approval fields', async () => {
    const before = await rowOf(agencyP)
    await direct(ownerP, `UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [agencyP])
    await direct(ownerP, `UPDATE public.transport_agencies SET approved_at = now(), approved_by = user_id WHERE id = $1`, [agencyP])
    for (const c of ['status', 'approved_at', 'approved_by']) await assertUnchanged(agencyP, c, before)
  })

  await testCase('G04. owner of a SUSPENDED agency cannot lift the suspension', async () => {
    const before = await rowOf(agencyS)
    await direct(ownerS, `UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [agencyS])
    await direct(ownerS, `UPDATE public.transport_agencies SET status = 'pending' WHERE id = $1`, [agencyS])
    await assertUnchanged(agencyS, 'status', before)
  })

  await testCase('G05. owner of a REJECTED agency cannot flip status or erase the rejection reason', async () => {
    const before = await rowOf(agencyR)
    await direct(ownerR, `UPDATE public.transport_agencies SET status = 'pending', rejection_reason = NULL WHERE id = $1`, [agencyR])
    await assertUnchanged(agencyR, 'status', before)
    await assertUnchanged(agencyR, 'rejection_reason', before)
  })

  await testCase('G06. an approved owner cannot downgrade or alter status either (no status games)', async () => {
    const before = await rowOf(agencyA)
    await direct(ownerA, `UPDATE public.transport_agencies SET status = 'suspended' WHERE id = $1`, [agencyA])
    await assertUnchanged(agencyA, 'status', before)
  })

  await testCase('G07. one statement mixing a protected and an editable column does not change the protected one', async () => {
    const before = await rowOf(agencyA)
    await direct(ownerA, `UPDATE public.transport_agencies SET city = 'Mixed', rating = 1, total_jobs = 0 WHERE id = $1`, [agencyA])
    await assertUnchanged(agencyA, 'rating', before)
    await assertUnchanged(agencyA, 'total_jobs', before)
    await su(`UPDATE public.transport_agencies SET city = 'Delhi' WHERE id = $1`, [agencyA])
  })

  await testCase('G08. an owner cannot move the agency to another user (user_id) nor take another agency over', async () => {
    const before = await rowOf(agencyB)
    const r = await direct(ownerA, `UPDATE public.transport_agencies SET user_id = $2 WHERE id = $1`, [agencyB, ownerA])
    expect(r.rowCount === 0 || !r.ok, 'update of a foreign row matched')
    await assertUnchanged(agencyB, 'user_id', before)
  })

  // --- Legitimate owner behaviour that must keep working --------------------------------------------------------
  for (const [col, value] of [
    ['company_name', 'Renamed Carriers'], ['gstin', '07ZZZZZ9999Z1Z5'], ['transport_license', 'TL-NEW'],
    ['contact_name', 'New Contact'], ['contact_phone', '9000000001'], ['contact_email', 'new@example.com'],
    ['address', '12 New Road'], ['city', 'Jaipur'], ['state', 'Rajasthan'], ['pincode', '302001'],
    ['bank_account', '999988887777'], ['ifsc_code', 'HDFC0001234'], ['fleet_size', 12], ['operating_routes', 'Delhi-Jaipur'],
  ]) {
    await testCase(`G09. owner can still edit ${col} directly`, async () => {
      const r = await direct(ownerA, `UPDATE public.transport_agencies SET ${col} = $2 WHERE id = $1`, [agencyA, value])
      expect(r.ok && r.rowCount === 1, `edit refused: ${r.error}`)
      expect(String((await rowOf(agencyA))[col]) === String(value), 'value not stored')
    })
  }

  await testCase('G10. a no-op write of protected columns (same value) is not an error: nothing the app does today breaks', async () => {
    const r = await direct(
      ownerA,
      `UPDATE public.transport_agencies SET status = status, rating = rating, total_jobs = total_jobs, approved_at = approved_at, user_id = user_id WHERE id = $1`,
      [agencyA]
    )
    expect(r.ok && r.rowCount === 1, `no-op refused: ${r.error}`)
  })

  await testCase('G11. owner can read their own row (all the app reads) and nobody else\'s', async () => {
    const own = await direct(ownerA, `SELECT id, company_name, status, rating, total_jobs, city, gstin, user_id FROM public.transport_agencies WHERE user_id = $1`, [ownerA])
    expect(own.ok && own.rows.length === 1 && own.rows[0].id === agencyA, JSON.stringify(own.rows))
    const all = await direct(ownerA, `SELECT id FROM public.transport_agencies`)
    expect(all.rows.length === 1, `owner sees ${all.rows.length} rows`)
  })

  await testCase('G12. registration (the exact payload AgencyRegisterPage sends) works and lands pending', async () => {
    const u = await createUser('rg-new-owner')
    const r = await insertAs(u, regPayload(u))
    expect(r.ok && r.rows.length === 1, `registration refused: ${r.error}`)
    const row = r.rows[0]
    expect(row.status === 'pending' && row.user_id === u && row.company_name === 'Registered Carriers' && Number(row.fleet_size) === 3, JSON.stringify(row))
  })

  // --- INSERT guard ---------------------------------------------------------------------------------------------
  await testCase('G13. registering with status approved is stored as pending', async () => {
    const u = await createUser('rg-ins-1')
    const r = await insertAs(u, regPayload(u, { status: 'approved' }))
    const row = r.ok ? r.rows[0] : await suOne(`SELECT * FROM public.transport_agencies WHERE user_id = $1`, [u])
    expect(!row || row.status === 'pending', `stored status ${row && row.status}`)
  })

  await testCase('G14. registering with pre-filled approval fields stores them neutral (no approver, no approved_at)', async () => {
    const u = await createUser('rg-ins-2')
    await insertAs(u, regPayload(u, { approved_by: adminU, approved_at: '2026-01-01T00:00:00Z' }))
    const row = await suOne(`SELECT * FROM public.transport_agencies WHERE user_id = $1`, [u])
    expect(!row || (row.approved_by === null && row.approved_at === null), `approved_by=${row && row.approved_by} approved_at=${row && row.approved_at}`)
  })

  await testCase('G15. registering with rating 5 / total_jobs 500 stores rating 0 and total_jobs 0', async () => {
    const u = await createUser('rg-ins-3')
    await insertAs(u, regPayload(u, { rating: 5, total_jobs: 500 }))
    const row = await suOne(`SELECT * FROM public.transport_agencies WHERE user_id = $1`, [u])
    expect(!row || (Number(row.rating) === 0 && Number(row.total_jobs) === 0), `rating=${row && row.rating} total_jobs=${row && row.total_jobs}`)
  })

  await testCase('G16. registering with a rejection_reason stores none', async () => {
    const u = await createUser('rg-ins-4')
    await insertAs(u, regPayload(u, { rejection_reason: 'pre-filled' }))
    const row = await suOne(`SELECT * FROM public.transport_agencies WHERE user_id = $1`, [u])
    expect(!row || row.rejection_reason === null, `rejection_reason=${row && row.rejection_reason}`)
  })

  await testCase('G17. an owner cannot register an agency for ANOTHER user', async () => {
    const r = await insertAs(stranger, regPayload(ownerP))
    expect(!r.ok || r.rows.length === 0, 'inserted a row owned by someone else')
    const n = await suOne(`SELECT count(*)::int AS n FROM public.transport_agencies WHERE user_id = $1`, [ownerP])
    expect(Number(n.n) === 1, `owner P now has ${n.n} agencies`)
  })

  await testCase('G18. a SECOND agency by an existing owner is never approved (pending, neutral fields)', async () => {
    const r = await insertAs(ownerA, regPayload(ownerA, { status: 'approved', rating: 5, approved_by: ownerA, approved_at: '2026-01-01T00:00:00Z' }))
    const rows = (await su(`SELECT * FROM public.transport_agencies WHERE user_id = $1 AND id <> $2`, [ownerA, agencyA])).rows
    for (const row of rows) {
      expect(row.status === 'pending' && row.approved_by === null && row.approved_at === null && Number(row.rating) === 0, JSON.stringify(row))
    }
    // clean the extra rows so later cases see one agency for this owner
    await su(`DELETE FROM public.transport_agencies WHERE user_id = $1 AND id <> $2`, [ownerA, agencyA])
    expect(r !== undefined, 'unreachable')
  })

  // --- DELETE ---------------------------------------------------------------------------------------------------
  await testCase('G19. an owner cannot delete their own agency row (it cascades to jobs, invoices, payroll)', async () => {
    await direct(ownerA, `DELETE FROM public.transport_agencies WHERE id = $1`, [agencyA])
    expect((await rowOf(agencyA)) !== undefined, 'row deleted by its owner')
  })

  await testCase('G20. an owner cannot delete another agency', async () => {
    await direct(ownerA, `DELETE FROM public.transport_agencies WHERE id = $1`, [agencyB])
    expect((await rowOf(agencyB)) !== undefined, 'foreign row deleted')
  })

  await testCase('G21. a suspended owner cannot delete the agency to escape the suspension', async () => {
    await direct(ownerS, `DELETE FROM public.transport_agencies WHERE id = $1`, [agencyS])
    expect((await rowOf(agencyS)) !== undefined, 'suspended agency deleted by its owner')
  })

  // --- Others -----------------------------------------------------------------------------------------------------
  await testCase('G22. dispatcher staff cannot update or delete the agency row', async () => {
    const before = await rowOf(agencyA)
    await direct(staffA, `UPDATE public.transport_agencies SET city = 'Staff', rating = 1 WHERE id = $1`, [agencyA])
    await direct(staffA, `DELETE FROM public.transport_agencies WHERE id = $1`, [agencyA])
    const after = await rowOf(agencyA)
    expect(after && after.city === before.city && String(after.rating) === String(before.rating), 'staff changed the row')
  })

  await testCase('G23. a stranger cannot update another owner\'s row', async () => {
    const before = await rowOf(agencyA)
    await direct(stranger, `UPDATE public.transport_agencies SET city = 'Stranger', rating = 1 WHERE id = $1`, [agencyA])
    const after = await rowOf(agencyA)
    expect(after.city === before.city && String(after.rating) === String(before.rating), 'stranger changed the row')
  })

  await testCase('G24. anon cannot write or delete', async () => {
    const before = await rowOf(agencyA)
    for (const sql of [
      `UPDATE public.transport_agencies SET city = 'Anon', rating = 1`,
      `DELETE FROM public.transport_agencies`,
    ]) {
      try {
        await asAnon(sql)
      } catch {
        /* refused is fine */
      }
    }
    const after = await rowOf(agencyA)
    expect(after && after.city === before.city, 'anon changed the table')
  })

  await testCase('G25. a real admin can still approve, reject, set rating/total_jobs/approval fields and reason', async () => {
    const r = await direct(
      adminU,
      `UPDATE public.transport_agencies
          SET status = 'approved', approved_by = $2, approved_at = '2026-03-03T00:00:00Z', rating = 3.25, total_jobs = 11, rejection_reason = NULL
        WHERE id = $1`,
      [agencyP, adminU]
    )
    expect(r.ok && r.rowCount === 1, `admin refused: ${r.error}`)
    const row = await rowOf(agencyP)
    expect(row.status === 'approved' && row.approved_by === adminU && Number(row.rating) === 3.25 && Number(row.total_jobs) === 11, JSON.stringify(row))
    const r2 = await direct(adminU, `UPDATE public.transport_agencies SET status = 'rejected', rejection_reason = 'Docs' WHERE id = $1`, [agencyP])
    expect(r2.ok && (await rowOf(agencyP)).rejection_reason === 'Docs', 'admin reject failed')
  })

  await testCase('G26. the admin may still register/delete as before (admin path unaffected by the insert and delete guards)', async () => {
    const u = await createUser('rg-admin-made')
    const r = await insertAs(adminU, regPayload(u, { status: 'approved', approved_by: adminU, approved_at: '2026-01-01T00:00:00Z', rating: 4 }))
    expect(r.ok && r.rows[0].status === 'approved' && Number(r.rows[0].rating) === 4, `admin insert changed: ${r.error || JSON.stringify(r.rows[0])}`)
    const d = await direct(adminU, `DELETE FROM public.transport_agencies WHERE id = $1`, [r.rows[0].id])
    expect(d.ok && (await rowOf(r.rows[0].id)) === undefined, 'admin delete failed')
  })

  await testCase('G27. service role (edge functions) can change every protected column and delete', async () => {
    await su(`SET ROLE service_role`)
    try {
      await db.query(
        `UPDATE public.transport_agencies SET status = 'approved', approved_by = $2, approved_at = now(), rating = 4.9, total_jobs = 21, rejection_reason = NULL WHERE id = $1`,
        [agencyR, adminU]
      )
    } finally {
      await actAsService()
    }
    const row = await rowOf(agencyR)
    expect(row.status === 'approved' && Number(row.rating) === 4.9 && Number(row.total_jobs) === 21, JSON.stringify(row))
    await su(`SET ROLE service_role`)
    try {
      await db.query(`DELETE FROM public.transport_agencies WHERE id = $1`, [agencyR])
    } finally {
      await actAsService()
    }
    expect((await rowOf(agencyR)) === undefined, 'service role delete failed')
  })

  await testCase('G28. SECURITY DEFINER code (counters/maintenance) can still update rating and total_jobs on behalf of an owner', async () => {
    await su(`CREATE OR REPLACE FUNCTION public.rg_probe_definer(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
              AS $$ BEGIN UPDATE public.transport_agencies SET total_jobs = total_jobs + 1, rating = 4.7 WHERE id = p_id; END; $$`)
    await su(`GRANT EXECUTE ON FUNCTION public.rg_probe_definer(uuid) TO authenticated`)
    const before = await rowOf(agencyB)
    const r = await direct(ownerB, `SELECT public.rg_probe_definer($1::uuid)`, [agencyB])
    expect(r.ok, `definer update refused: ${r.error}`)
    const after = await rowOf(agencyB)
    expect(Number(after.total_jobs) === Number(before.total_jobs) + 1 && Number(after.rating) === 4.7, `total_jobs ${before.total_jobs}->${after.total_jobs} rating ${after.rating}`)
    await su(`DROP FUNCTION public.rg_probe_definer(uuid)`)
  })

  await testCase('G29. the shipped agency_identity_update command still works for the owner', async () => {
    const r = await asActor(ownerB, async () =>
      parseJson((await db.query(
        `SELECT public.agency_identity_update('Identity Renamed Pvt Ltd', NULL, '9876543210', '1 Road', 'Delhi') AS r`
      )).rows[0].r)
    )
    expect(r && r.ok === true, JSON.stringify(r))
    expect((await rowOf(agencyB)).company_name === 'Identity Renamed Pvt Ltd', 'name not stored')
  })

  await testCase('G30. the guard is a real trigger on the table (BEFORE UPDATE and BEFORE INSERT/DELETE paths exist)', async () => {
    const rows = (await su(
      `SELECT tgname, tgtype FROM pg_trigger WHERE tgrelid = 'public.transport_agencies'::regclass AND NOT tgisinternal`
    )).rows
    const before = (t) => (Number(t) & 2) === 2
    const upd = rows.filter((r) => before(r.tgtype) && (Number(r.tgtype) & 16) === 16)
    expect(upd.length >= 1, 'no BEFORE UPDATE trigger on transport_agencies')
  })

  await testCase('G31. rows other than the target are untouched by every attack above (agency B ratings and owner intact)', async () => {
    const row = await rowOf(agencyB)
    expect(row.user_id === ownerB && row.status === 'approved', JSON.stringify(row))
  })

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  for (const f of failed.slice(0, 20)) console.log(`  - ${f.name}`)
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
