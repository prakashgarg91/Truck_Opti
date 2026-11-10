#!/usr/bin/env node
/**
 * Agency order import — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the RPCs the way PostgREST does
 * per request: `SET ROLE authenticated` with `request.jwt.claims` set to the
 * caller's sub.
 *
 * Pinned contract under test. The migration that implements it is NOT written
 * yet (it will be supabase/migrations/20261018000000_agency_orders.sql, created
 * by another writer), so every case that needs the new tables or RPCs is
 * EXPECTED to fail now.
 *
 *   Tables (RLS on, no direct write privileges for authenticated):
 *     agency_order_batches(id, agency_id, agreement_id, file_hash, row_count,
 *       created_by, created_at, idempotency_key)  UNIQUE (agency_id, agreement_id, file_hash)
 *     agency_orders(id, agency_id, agreement_id, batch_id, client_order_ref,
 *       status 'draft'|'planned'|'cancelled', version, created_at, updated_at)
 *       UNIQUE (agency_id, agreement_id, client_order_ref)
 *     agency_order_lines(id, agency_id, order_id, line_no, sku, description, quantity,
 *       unit 'kg'|'tonne'|'piece'|'carton', weight_per_unit_kg, length_m, width_m, height_m,
 *       pickup_site_id, drop_site_id, pickup_from, pickup_to, delivery_from, delivery_to,
 *       stackable default true, fragile default false)  UNIQUE (order_id, line_no)
 *
 *   public.agency_order_import(p_agreement_id uuid, p_file_hash text,
 *     p_idempotency_key text, p_lines jsonb) RETURNS jsonb
 *     - SECURITY DEFINER, pinned search_path, NO agency id argument, scope 'dispatcher'
 *       (owner always allowed). EXECUTE for authenticated and service_role only.
 *     - Caller refusals (RAISE EXCEPTION): 'Your access scope does not allow this action.',
 *       'No agency profile found for this account.', 'Agency approval is required.'
 *     - Input refusals (RAISE EXCEPTION): 'Idempotency key is required.',
 *       'Client agreement not found or access denied.' (other agency or unknown),
 *       'No order lines to import.', 'Too many lines in one import (maximum 2000).'
 *     - Ended agreement: {ok:false,error:'agreement_not_active'}.
 *     - Every line is validated by the database. Any problem refuses the WHOLE call:
 *       {ok:false,error:'invalid_lines',problems:[{index,message}]} (index 0-based), nothing written.
 *       Messages: 'Unsupported unit.', 'Quantity must be greater than zero.',
 *       'Line number must be at least 1.', 'Pickup site not found.', 'Drop site not found.',
 *       'Delivery window ends before pickup window.'
 *     - Same file_hash already imported for the agreement: {ok:true,state:'duplicate_batch',batch_id}.
 *     - Same key replay (same hash): {ok:true,state:'idempotent_replay',batch_id}.
 *     - Same key, different hash: {ok:false,error:'idempotency_key_reused'}.
 *     - client_order_ref already present for the agreement: {ok:false,error:'order_exists',refs:[...]}.
 *     - Success: {ok:true,state:'created',batch_id,orders_created,lines_created}; lines grouped
 *       by client_order_ref into draft orders at version 1.
 *   public.agency_order_cancel(p_order_id uuid, p_expected_version int) RETURNS jsonb
 *     - Same scope and grant rules. Draft only: {ok:true,state:'cancelled',version}
 *       (version = the new version, expected + 1); already cancelled with the current
 *       version: {ok:true,state:'unchanged'}; planned: {ok:false,error:'order_not_draft'};
 *       stale version: {ok:false,error:'version_conflict',current_version}.
 *
 *   RLS reads: owner and every active staff scope (dispatcher, fleet_manager, finance, viewer)
 *   read their agency's batches, orders and lines. Suspended-agency staff, revoked members,
 *   users with no agency and other agencies read 0 rows. anon reads nothing.
 *
 * Assumptions (not pinned by the brief, flagged for the implementer):
 *   - row_count = number of submitted lines.
 *   - Idempotency replay (same key AND same hash) is checked before the duplicate-hash rule.
 *   - Scope check and agency resolution run before the agreement lookup, so a suspended or
 *     no-agency caller gets its caller error even when it names a valid agreement.
 *   - A revoked member is refused with either a raised error or {ok:false}; no text is pinned.
 *   - An other-agency owner cancelling an order is refused with a raised error or {ok:false}.
 *   - anon SELECT on the new tables either raises or returns 0 rows (both are "no access").
 *   - Cancel uses the same 'dispatcher' scope as import.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST / GoTrue
 * behaviour is NOT covered. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_order_import.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud
 * failure, never a silent skip.
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

/** Passes only if the promise rejects with a message containing `fragment`. */
async function expectRaises(promise, fragment) {
  try {
    await promise
  } catch (error) {
    const message = firstLine(error)
    expect(message.includes(fragment), `expected an error containing "${fragment}", got: ${JSON.stringify(message)}`)
    return message
  }
  throw new Error(`expected an error containing "${fragment}", but the statement succeeded`)
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
// Fixtures (superuser). Only pre-existing tables are touched here, so the setup
// itself never fails; anything that needs the new tables happens inside a case.
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

async function seedAgreement(agencyId, clientName, status = 'active') {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, agencyId, clientName, status, nx('seed-agr')]
  )
  return id
}

async function seedSite(agencyId, agreementId, siteKind, label, status = 'active') {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_sites
       (id, agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, '1 Test Road', 'Pune', 'Maharashtra', '411001', $6, $7)`,
    [id, agencyId, agreementId, siteKind, label, status, nx('seed-site')]
  )
  return id
}

/**
 * Superuser seed of one batch, one order (2 lines, line_no 1 and 2) on the given site.
 * Used by the read, grant and cancel cases; they run after the tables exist.
 */
async function seedOrderTree(agencyId, agreementId, siteId, { status = 'draft', createdBy = null } = {}) {
  const batchId = uid()
  const orderId = uid()
  const hash = nx('seed-hash')
  const ref = nx('seed-ref')
  await su(
    `INSERT INTO public.agency_order_batches (id, agency_id, agreement_id, file_hash, row_count, created_by, idempotency_key)
     VALUES ($1, $2, $3, $4, 2, $5, $6)`,
    [batchId, agencyId, agreementId, hash, createdBy, nx('seed-batch-key')]
  )
  await su(
    `INSERT INTO public.agency_orders (id, agency_id, agreement_id, batch_id, client_order_ref, status, version)
     VALUES ($1, $2, $3, $4, $5, $6, 1)`,
    [orderId, agencyId, agreementId, batchId, ref, status]
  )
  for (const lineNo of [1, 2]) {
    await su(
      `INSERT INTO public.agency_order_lines
         (id, agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg, length_m, width_m, height_m,
          pickup_site_id, drop_site_id, pickup_from, pickup_to, delivery_from, delivery_to)
       VALUES ($1, $2, $3, $4, 'SKU-SEED', 'Seed line', 5, 'kg', 10, 1, 1, 1, $5, $5, now(), now(), now(), now())`,
      [uid(), agencyId, orderId, lineNo, siteId]
    )
  }
  return { batchId, orderId, hash, ref, agencyId, agreementId }
}

// Fixture handles, assigned in setupFixtures().
let ownerA, ownerB, ownerS, agencyA, agencyB, agencyS
let agrA, agrA2, agrAEnded, agrB, agrS
let siteAHead, siteAPune, siteAMumbai, siteAOld, siteA2Pune, siteA2Only
let siteBPune, siteBOnly, siteSPlant
let dispatcherA, fleetA, financeA, viewerA, revokedA, suspendedStaffS, noAgency

async function setupFixtures() {
  ownerA = await createUser('oi-owner-a')
  agencyA = await createAgencyRow(ownerA, 'OImport A', 'approved')
  ownerB = await createUser('oi-owner-b')
  agencyB = await createAgencyRow(ownerB, 'OImport B', 'approved')
  ownerS = await createUser('oi-owner-s')
  agencyS = await createAgencyRow(ownerS, 'OImport S', 'suspended')

  agrA = await seedAgreement(agencyA, 'Acme Cement')
  agrA2 = await seedAgreement(agencyA, 'Acme Steel')
  agrAEnded = await seedAgreement(agencyA, 'Acme Retired', 'ended')
  agrB = await seedAgreement(agencyB, 'Beta Logistics')
  agrS = await seedAgreement(agencyS, 'Gamma Goods')

  siteAHead = await seedSite(agencyA, agrA, 'bill_to', 'Head Office')
  siteAPune = await seedSite(agencyA, agrA, 'ship_to', 'Pune Depot')
  siteAMumbai = await seedSite(agencyA, agrA, 'ship_to', 'Mumbai Depot')
  siteAOld = await seedSite(agencyA, agrA, 'ship_to', 'Old Depot', 'inactive')
  siteA2Pune = await seedSite(agencyA, agrA2, 'ship_to', 'Pune Depot')
  siteA2Only = await seedSite(agencyA, agrA2, 'ship_to', 'Only In Agreement Two')
  await seedSite(agencyA, agrAEnded, 'bill_to', 'Head Office')
  await seedSite(agencyA, agrAEnded, 'ship_to', 'Pune Depot')
  await seedSite(agencyB, agrB, 'bill_to', 'Head Office')
  siteBPune = await seedSite(agencyB, agrB, 'ship_to', 'Pune Depot')
  siteBOnly = await seedSite(agencyB, agrB, 'ship_to', 'Only At B')
  await seedSite(agencyS, agrS, 'bill_to', 'Head Office')
  siteSPlant = await seedSite(agencyS, agrS, 'ship_to', 'Plant S')

  dispatcherA = await seedStaff(agencyA, 'oi-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'oi-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'oi-finance', 'finance')
  viewerA = await seedStaff(agencyA, 'oi-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'oi-revoked', 'dispatcher', 'revoked')
  suspendedStaffS = await seedStaff(agencyS, 'oi-suspended', 'dispatcher')
  noAgency = await createUser('oi-no-agency')
}

// ---------------------------------------------------------------------------
// Command wrappers and line builders
// ---------------------------------------------------------------------------
const SCOPE_MSG = 'Your access scope does not allow this action.'
const SUSPENDED_MSG = 'Agency approval is required.'
const NO_PROFILE_MSG = 'No agency profile found for this account.'
const NOT_FOUND_MSG = 'Client agreement not found or access denied.'
const BLANK_KEY_MSG = 'Idempotency key is required.'
const EMPTY_MSG = 'No order lines to import.'
const TOO_MANY_MSG = 'Too many lines in one import (maximum 2000).'

const TABLES = ['agency_order_batches', 'agency_orders', 'agency_order_lines']
const IMPORT_SQL = `SELECT public.agency_order_import($1::uuid, $2::text, $3::text, $4::jsonb) AS r`
const CANCEL_SQL = `SELECT public.agency_order_cancel($1::uuid, $2::int) AS r`

async function importAs(userId, agreementId, fileHash, key, lines) {
  return asActor(userId, async () => {
    const result = await db.query(IMPORT_SQL, [agreementId, fileHash, key, JSON.stringify(lines)])
    return parseJson(result.rows[0].r)
  })
}

async function cancelAs(userId, orderId, expectedVersion) {
  return asActor(userId, async () => {
    const result = await db.query(CANCEL_SQL, [orderId, expectedVersion])
    return parseJson(result.rows[0].r)
  })
}

/** Direct DML as an actor; resolves to { rows } or { error } (never throws). */
async function dmlOutcome(who, sql, params) {
  return asActor(who, async () => {
    try {
      return { rows: (await db.query(sql, params)).rows }
    } catch (error) {
      return { error: firstLine(error) }
    }
  })
}

/** Visible row count for an actor, filtered to one agency (RLS applied). */
async function visibleCount(who, table, agencyId) {
  return asActor(who, async () => {
    const r = await db.query(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])
    return r.rows[0].n
  })
}

async function totalCount(table, agencyId) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])).n
}

async function batchesByHash(fileHash) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_order_batches WHERE file_hash = $1`, [fileHash])).n
}

async function ordersByRef(ref) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_orders WHERE client_order_ref = $1`, [ref])).n
}

async function orderIdOfBatch(batchId) {
  return (await suOne(`SELECT id FROM public.agency_orders WHERE batch_id = $1 ORDER BY client_order_ref LIMIT 1`, [batchId])).id
}

/** A complete valid line; `over` overrides any key. Pickup = bill-to, drop = ship-to of agreement A. */
function line(ref, lineNo, over = {}) {
  return {
    client_order_ref: ref,
    line_no: lineNo,
    sku: 'SKU-1',
    description: 'Cement bags',
    quantity: 10,
    unit: 'kg',
    weight_per_unit_kg: 25.5,
    length_m: 1.2,
    width_m: 0.8,
    height_m: 0.9,
    pickup_site: 'Head Office',
    drop_site: 'Pune Depot',
    pickup_from: '2026-12-01T06:00:00+05:30',
    pickup_to: '2026-12-01T08:00:00+05:30',
    delivery_from: '2026-12-02T06:00:00+05:30',
    delivery_to: '2026-12-02T18:00:00+05:30',
    stackable: true,
    fragile: false,
    ...over,
  }
}

function fresh(tag) {
  return { hash: nx(`hash-${tag}`), key: nx(`key-${tag}`), ref: nx(`ORD-${tag}`) }
}

/** Exact assertion on a {ok:false,error:'invalid_lines'} response: every problem, nothing more. */
function expectInvalid(r, expected) {
  expect(
    r && r.ok === false && r.error === 'invalid_lines',
    `expected {ok:false,error:'invalid_lines'}, got ${String(JSON.stringify(r)).slice(0, 200)}`
  )
  expect(Array.isArray(r.problems), 'problems is not an array')
  const got = r.problems.map((p) => ({ index: Number(p.index), message: p.message })).sort((a, b) => a.index - b.index)
  const want = [...expected].sort((a, b) => a.index - b.index)
  expect(JSON.stringify(got) === JSON.stringify(want), `problems ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`)
}

async function expectNoRowsVisible(who, agencyId, label) {
  const failures = []
  for (const t of TABLES) {
    const n = await visibleCount(who, t, agencyId)
    if (n !== 0) failures.push(`${t}=${n}`)
  }
  expect(failures.length === 0, `${label} can see rows: ${failures.join(', ')}`)
}

async function expectAllVisible(who, agencyId, label) {
  const failures = []
  for (const t of TABLES) {
    const total = await totalCount(t, agencyId)
    expect(total >= 1, `precondition: no ${t} rows seeded for agency`)
    const n = await visibleCount(who, t, agencyId)
    if (n !== total) failures.push(`${t}: sees ${n} of ${total}`)
  }
  expect(failures.length === 0, `${label} ${failures.join('; ')}`)
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
  await setupFixtures()

  // =========================================================================
  // A. Import success: shapes, counts, grouping, storage
  // =========================================================================
  await testCase('A1. owner import returns ok/created with batch_id, orders_created and lines_created', async () => {
    const f = fresh('a1')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(f.ref, 2), line(nx('ORD-A1b'), 1)])
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    expect(typeof r.batch_id === 'string' && UUID_RE.test(r.batch_id), `batch_id ${JSON.stringify(r.batch_id)}`)
    expect(Number(r.orders_created) === 2, `orders_created ${r.orders_created}, expected 2`)
    expect(Number(r.lines_created) === 3, `lines_created ${r.lines_created}, expected 3`)
  })

  await testCase('A2. batch row stores agency, agreement, file hash, row count, creator and key', async () => {
    const f = fresh('a2')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(f.ref, 2)])
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    const b = await suOne(
      `SELECT agency_id, agreement_id, file_hash, row_count, created_by, idempotency_key
         FROM public.agency_order_batches WHERE id = $1`,
      [r.batch_id]
    )
    expect(b, 'no agency_order_batches row for the returned batch_id')
    expect(b.agency_id === agencyA, `agency_id ${b.agency_id}`)
    expect(b.agreement_id === agrA, `agreement_id ${b.agreement_id}`)
    expect(b.file_hash === f.hash, `file_hash ${b.file_hash}`)
    expect(Number(b.row_count) === 2, `row_count ${b.row_count}, expected 2`)
    expect(b.created_by === ownerA, `created_by ${b.created_by}, expected the owner`)
    expect(b.idempotency_key === f.key, `idempotency_key ${b.idempotency_key}`)
  })

  await testCase('A3. lines are grouped into draft orders at version 1, all linked to the batch', async () => {
    const f = fresh('a3')
    const refB = nx('ORD-A3b')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(f.ref, 2), line(refB, 1)])
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    const orders = (
      await su(
        `SELECT client_order_ref, status, version, agency_id, agreement_id, batch_id
           FROM public.agency_orders WHERE batch_id = $1`,
        [r.batch_id]
      )
    ).rows
    expect(orders.length === 2, `expected 2 orders for the batch, found ${orders.length}`)
    const refs = orders.map((o) => o.client_order_ref).sort()
    expect(JSON.stringify(refs) === JSON.stringify([f.ref, refB].sort()), `order refs ${JSON.stringify(refs)}`)
    for (const o of orders) {
      expect(o.status === 'draft', `${o.client_order_ref} status ${o.status}`)
      expect(Number(o.version) === 1, `${o.client_order_ref} version ${o.version}`)
      expect(o.agency_id === agencyA && o.agreement_id === agrA, `${o.client_order_ref} tenant ${o.agency_id}/${o.agreement_id}`)
      expect(o.batch_id === r.batch_id, `${o.client_order_ref} batch_id ${o.batch_id}`)
    }
  })

  await testCase('A4. line numbers, SKUs, units and measures are stored as submitted', async () => {
    const f = fresh('a4')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [
      line(f.ref, 1, { sku: 'SKU-A4-1', quantity: 12.5, unit: 'tonne', weight_per_unit_kg: 1000, length_m: 2.5, width_m: 2, height_m: 2.2 }),
      line(f.ref, 2, { sku: 'SKU-A4-2', quantity: 4, unit: 'carton' }),
    ])
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    expect(Number(r.lines_created) === 2, `lines_created ${r.lines_created}`)
    const lines = (
      await su(
        `SELECT l.line_no, l.sku, l.quantity::float8 AS quantity, l.unit, l.weight_per_unit_kg::float8 AS wpu,
                l.length_m::float8 AS length_m, l.width_m::float8 AS width_m, l.height_m::float8 AS height_m
           FROM public.agency_order_lines l JOIN public.agency_orders o ON o.id = l.order_id
          WHERE o.batch_id = $1 ORDER BY l.line_no`,
        [r.batch_id]
      )
    ).rows
    expect(lines.length === 2, `stored ${lines.length} lines, expected 2`)
    const [l1, l2] = lines
    expect(
      Number(l1.line_no) === 1 && l1.sku === 'SKU-A4-1' && l1.quantity === 12.5 && l1.unit === 'tonne' &&
        l1.wpu === 1000 && l1.length_m === 2.5 && l1.width_m === 2 && l1.height_m === 2.2,
      `line 1 stored as ${JSON.stringify(l1)}`
    )
    expect(Number(l2.line_no) === 2 && l2.sku === 'SKU-A4-2' && l2.quantity === 4 && l2.unit === 'carton', `line 2 stored as ${JSON.stringify(l2)}`)
  })

  await testCase('A5. site labels match case-insensitively and ignoring surrounding spaces', async () => {
    const f = fresh('a5')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { pickup_site: '  head OFFICE ', drop_site: ' pune depot  ' })])
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    const row = await suOne(
      `SELECT l.pickup_site_id, l.drop_site_id FROM public.agency_order_lines l
         JOIN public.agency_orders o ON o.id = l.order_id WHERE o.batch_id = $1`,
      [r.batch_id]
    )
    expect(row && row.pickup_site_id === siteAHead, `pickup_site_id ${row && row.pickup_site_id}, expected Head Office`)
    expect(row && row.drop_site_id === siteAPune, `drop_site_id ${row && row.drop_site_id}, expected Pune Depot`)
  })

  await testCase('A6. omitted stackable/fragile take the column defaults; explicit values are kept', async () => {
    const f = fresh('a6')
    const bare = line(f.ref, 1)
    delete bare.stackable
    delete bare.fragile
    const r = await importAs(ownerA, agrA, f.hash, f.key, [bare, line(f.ref, 2, { stackable: false, fragile: true })])
    expect(r && r.ok === true && r.state === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    const rows = (
      await su(
        `SELECT l.line_no, l.stackable, l.fragile FROM public.agency_order_lines l
           JOIN public.agency_orders o ON o.id = l.order_id WHERE o.batch_id = $1 ORDER BY l.line_no`,
        [r.batch_id]
      )
    ).rows
    expect(rows.length === 2, `stored ${rows.length} lines, expected 2`)
    expect(rows[0].stackable === true && rows[0].fragile === false, `defaults stored as ${JSON.stringify(rows[0])}`)
    expect(rows[1].stackable === false && rows[1].fragile === true, `explicit values stored as ${JSON.stringify(rows[1])}`)
  })

  // =========================================================================
  // B. Database-side line validation (the client is never trusted)
  // =========================================================================
  await testCase('B1. unsupported unit refuses the whole call with invalid_lines at that index', async () => {
    const f = fresh('b1')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(nx('ORD-B1x'), 1, { unit: 'pound' })])
    expectInvalid(r, [{ index: 1, message: 'Unsupported unit.' }])
  })

  await testCase('B2. quantity of zero or below is refused with "Quantity must be greater than zero."', async () => {
    await gather([
      ['quantity 0', async () => {
        const f = fresh('b2a')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { quantity: 0 })]), [
          { index: 0, message: 'Quantity must be greater than zero.' },
        ])
      }],
      ['quantity -2', async () => {
        const f = fresh('b2b')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { quantity: -2 })]), [
          { index: 0, message: 'Quantity must be greater than zero.' },
        ])
      }],
    ])
  })

  await testCase('B3. line_no below 1 is refused with "Line number must be at least 1."', async () => {
    await gather([
      ['line_no 0', async () => {
        const f = fresh('b3a')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 0)]), [
          { index: 0, message: 'Line number must be at least 1.' },
        ])
      }],
      ['line_no -3', async () => {
        const f = fresh('b3b')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, -3)]), [
          { index: 0, message: 'Line number must be at least 1.' },
        ])
      }],
    ])
  })

  await testCase('B4. unknown pickup site label is refused with "Pickup site not found."', async () => {
    const f = fresh('b4')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { pickup_site: 'Nowhere Depot' })])
    expectInvalid(r, [{ index: 0, message: 'Pickup site not found.' }])
  })

  await testCase('B5. unknown drop site, and a bill-to label used as drop, are refused with "Drop site not found."', async () => {
    await gather([
      ['unknown drop', async () => {
        const f = fresh('b5a')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { drop_site: 'Nowhere Depot' })]), [
          { index: 0, message: 'Drop site not found.' },
        ])
      }],
      ['bill-to used as drop', async () => {
        const f = fresh('b5b')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { drop_site: 'Head Office' })]), [
          { index: 0, message: 'Drop site not found.' },
        ])
      }],
    ])
  })

  await testCase('B6. inactive site, site of another agreement and site of another agency are not found', async () => {
    await gather([
      ['inactive pickup', async () => {
        const f = fresh('b6a')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { pickup_site: 'Old Depot' })]), [
          { index: 0, message: 'Pickup site not found.' },
        ])
      }],
      ['site of sibling agreement', async () => {
        const f = fresh('b6b')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { drop_site: 'Only In Agreement Two' })]), [
          { index: 0, message: 'Drop site not found.' },
        ])
      }],
      ['site of another agency', async () => {
        const f = fresh('b6c')
        expectInvalid(await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { drop_site: 'Only At B' })]), [
          { index: 0, message: 'Drop site not found.' },
        ])
      }],
    ])
  })

  await testCase('B7. delivery window ending before the pickup window is refused', async () => {
    const f = fresh('b7')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1, { delivery_to: '2026-11-30T10:00:00+05:30' })])
    expectInvalid(r, [{ index: 0, message: 'Delivery window ends before pickup window.' }])
  })

  await testCase('B8. every bad line is reported with its own 0-based index and message', async () => {
    const f = fresh('b8')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [
      line(f.ref, 1),
      line(f.ref, 2, { unit: 'pound' }),
      line(f.ref, 3, { quantity: 0 }),
      line(f.ref, 4, { drop_site: 'Nowhere Depot' }),
    ])
    expectInvalid(r, [
      { index: 1, message: 'Unsupported unit.' },
      { index: 2, message: 'Quantity must be greater than zero.' },
      { index: 3, message: 'Drop site not found.' },
    ])
  })

  await testCase('B9. a refused import writes nothing; the same hash and key then succeed with corrected lines', async () => {
    const f = fresh('b9')
    const refBad = nx('ORD-B9bad')
    const refused = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(refBad, 1, { unit: 'pound' })])
    expectInvalid(refused, [{ index: 1, message: 'Unsupported unit.' }])
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for the refused import')
    expect((await ordersByRef(f.ref)) === 0, 'the valid line of the refused import was written')
    const retry = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(refBad, 1)])
    expect(retry && retry.ok === true && retry.state === 'created', `retry expected ok/created, got ${JSON.stringify(retry)}`)
    expect((await batchesByHash(f.hash)) === 1, 'retry did not create exactly one batch')
  })

  // =========================================================================
  // C. Duplicates and idempotency
  // =========================================================================
  await testCase('C1. same file hash for the same agreement returns duplicate_batch with the existing batch and writes nothing', async () => {
    const f = fresh('c1')
    const first = await importAs(ownerA, agrA, f.hash, nx('key-c1a'), [line(f.ref, 1)])
    expect(first && first.ok === true && first.state === 'created', `first import ${JSON.stringify(first)}`)
    const dupRef = nx('ORD-C1dup')
    const dup = await importAs(ownerA, agrA, f.hash, nx('key-c1b'), [line(dupRef, 1)])
    expect(dup && dup.ok === true && dup.state === 'duplicate_batch', `expected duplicate_batch, got ${JSON.stringify(dup)}`)
    expect(dup.batch_id === first.batch_id, `batch_id ${dup.batch_id}, expected ${first.batch_id}`)
    expect((await batchesByHash(f.hash)) === 1, 'a second batch row exists for the hash')
    expect((await ordersByRef(dupRef)) === 0, 'orders were written by the duplicate import')
  })

  await testCase('C2. replay of the same key with the same hash returns idempotent_replay with the same batch and no new rows', async () => {
    const f = fresh('c2')
    const first = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(f.ref, 2)])
    expect(first && first.ok === true && first.state === 'created', `first import ${JSON.stringify(first)}`)
    const ordersBefore = await totalCount('agency_orders', agencyA)
    const linesBefore = await totalCount('agency_order_lines', agencyA)
    const replay = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1), line(f.ref, 2)])
    expect(replay && replay.ok === true && replay.state === 'idempotent_replay', `expected idempotent_replay, got ${JSON.stringify(replay)}`)
    expect(replay.batch_id === first.batch_id, `batch_id ${replay.batch_id}, expected ${first.batch_id}`)
    expect((await totalCount('agency_orders', agencyA)) === ordersBefore, 'replay wrote orders')
    expect((await totalCount('agency_order_lines', agencyA)) === linesBefore, 'replay wrote lines')
    expect((await batchesByHash(f.hash)) === 1, 'replay wrote a batch')
  })

  await testCase('C3. same key with a different hash returns idempotency_key_reused and writes nothing', async () => {
    const f = fresh('c3')
    const first = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    expect(first && first.ok === true, `first import ${JSON.stringify(first)}`)
    const otherHash = nx('hash-c3-other')
    const otherRef = nx('ORD-C3other')
    const r = await importAs(ownerA, agrA, otherHash, f.key, [line(otherRef, 1)])
    expect(r && r.ok === false && r.error === 'idempotency_key_reused', `expected idempotency_key_reused, got ${JSON.stringify(r)}`)
    expect((await batchesByHash(otherHash)) === 0, 'a batch was written for the reused key')
    expect((await ordersByRef(otherRef)) === 0, 'orders were written for the reused key')
  })

  await testCase('C4. the same file hash is allowed for another agreement of the same agency and for another agency', async () => {
    const f = fresh('c4')
    const first = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    expect(first && first.ok === true && first.state === 'created', `first import ${JSON.stringify(first)}`)
    await gather([
      ['sibling agreement, same agency', async () => {
        const r = await importAs(ownerA, agrA2, f.hash, nx('key-c4a'), [line(nx('ORD-C4a'), 1, { pickup_site: 'Pune Depot', drop_site: 'Only In Agreement Two' })])
        expect(r && r.ok === true && r.state === 'created', `expected created, got ${JSON.stringify(r)}`)
        expect(r.batch_id !== first.batch_id, 'returned the other agreement batch')
      }],
      ['other agency', async () => {
        const r = await importAs(ownerB, agrB, f.hash, nx('key-c4b'), [line(nx('ORD-C4b'), 1, { drop_site: 'Pune Depot' })])
        expect(r && r.ok === true && r.state === 'created', `expected created, got ${JSON.stringify(r)}`)
      }],
    ])
  })

  await testCase('C5. a client_order_ref that already exists returns order_exists, lists only the clashing refs, writes nothing', async () => {
    const existing = nx('EXIST')
    const first = await importAs(ownerA, agrA, nx('hash-c5a'), nx('key-c5a'), [line(existing, 1)])
    expect(first && first.ok === true && first.state === 'created', `first import ${JSON.stringify(first)}`)
    const f = fresh('c5b')
    const newRef = nx('NEW-C5')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(newRef, 1), line(existing, 1)])
    expect(r && r.ok === false && r.error === 'order_exists', `expected order_exists, got ${JSON.stringify(r)}`)
    expect(JSON.stringify(r.refs) === JSON.stringify([existing]), `refs ${JSON.stringify(r.refs)}, expected [${existing}]`)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for the refused import')
    expect((await ordersByRef(newRef)) === 0, 'the new order was written for the refused import')
    const still = await suOne(
      `SELECT version, (SELECT count(*)::int FROM public.agency_order_lines WHERE order_id = o.id) AS n
         FROM public.agency_orders o WHERE o.client_order_ref = $1 AND o.agency_id = $2`,
      [existing, agencyA]
    )
    expect(still && Number(still.version) === 1 && Number(still.n) === 1, `existing order changed: ${JSON.stringify(still)}`)
  })

  // =========================================================================
  // D. Agreement and request-level checks
  // =========================================================================
  await testCase('D1. another agency cannot import against this agency\'s agreement; nothing is written', async () => {
    const f = fresh('d1')
    await expectExactError(importAs(ownerB, agrA, f.hash, f.key, [line(f.ref, 1)]), NOT_FOUND_MSG)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for the foreign agreement')
  })

  await testCase('D2. an unknown agreement id is refused with the same not-found message', async () => {
    const f = fresh('d2')
    await expectExactError(importAs(ownerA, uid(), f.hash, f.key, [line(f.ref, 1)]), NOT_FOUND_MSG)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for an unknown agreement')
  })

  await testCase('D3. an ended agreement returns agreement_not_active and writes nothing', async () => {
    const f = fresh('d3')
    const r = await importAs(ownerA, agrAEnded, f.hash, f.key, [line(f.ref, 1)])
    expect(r && r.ok === false && r.error === 'agreement_not_active', `expected agreement_not_active, got ${JSON.stringify(r)}`)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for an ended agreement')
    expect((await ordersByRef(f.ref)) === 0, 'an order was written for an ended agreement')
  })

  await testCase('D4. blank, whitespace-only or NULL idempotency key raises "Idempotency key is required."', async () => {
    await gather(
      ['', '   ', null].map((key, i) => [
        `key ${JSON.stringify(key)} (${i})`,
        async () => {
          const f = fresh(`d4-${i}`)
          await expectExactError(importAs(ownerA, agrA, f.hash, key, [line(f.ref, 1)]), BLANK_KEY_MSG)
          expect((await batchesByHash(f.hash)) === 0, 'a batch was written without a key')
        },
      ])
    )
  })

  await testCase('D5. an empty line array raises "No order lines to import."', async () => {
    const f = fresh('d5')
    await expectExactError(importAs(ownerA, agrA, f.hash, f.key, []), EMPTY_MSG)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for an empty import')
  })

  await testCase('D6. 2001 lines raise "Too many lines in one import (maximum 2000)." and write nothing', async () => {
    const f = fresh('d6')
    const many = Array.from({ length: 2001 }, (_, i) => line(f.ref, i + 1))
    await expectExactError(importAs(ownerA, agrA, f.hash, f.key, many), TOO_MANY_MSG)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for an oversized import')
    expect((await ordersByRef(f.ref)) === 0, 'orders were written for an oversized import')
  })

  // =========================================================================
  // E. Cancel
  // =========================================================================
  await testCase('E1. owner cancels a draft order with the current version: ok/cancelled, version bumped', async () => {
    const f = fresh('e1')
    const imp = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    expect(imp && imp.ok === true, `import ${JSON.stringify(imp)}`)
    const orderId = await orderIdOfBatch(imp.batch_id)
    const r = await cancelAs(ownerA, orderId, 1)
    expect(r && r.ok === true && r.state === 'cancelled', `expected ok/cancelled, got ${JSON.stringify(r)}`)
    expect(Number(r.version) === 2, `version ${r.version}, expected 2`)
    const row = await suOne(`SELECT status, version FROM public.agency_orders WHERE id = $1`, [orderId])
    expect(row.status === 'cancelled' && Number(row.version) === 2, `row ${JSON.stringify(row)}`)
  })

  await testCase('E2. cancelling an already cancelled order with its current version returns unchanged', async () => {
    const f = fresh('e2')
    const imp = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    const orderId = await orderIdOfBatch(imp.batch_id)
    const first = await cancelAs(ownerA, orderId, 1)
    expect(first && first.ok === true && first.state === 'cancelled', `first cancel ${JSON.stringify(first)}`)
    const again = await cancelAs(ownerA, orderId, Number(first.version))
    expect(again && again.ok === true && again.state === 'unchanged', `expected unchanged, got ${JSON.stringify(again)}`)
    const row = await suOne(`SELECT status, version FROM public.agency_orders WHERE id = $1`, [orderId])
    expect(row.status === 'cancelled' && Number(row.version) === 2, `row ${JSON.stringify(row)}`)
  })

  await testCase('E3. a stale expected version returns version_conflict with current_version and changes nothing', async () => {
    const f = fresh('e3')
    const imp = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    const orderId = await orderIdOfBatch(imp.batch_id)
    const r = await cancelAs(ownerA, orderId, 5)
    expect(r && r.ok === false && r.error === 'version_conflict', `expected version_conflict, got ${JSON.stringify(r)}`)
    expect(Number(r.current_version) === 1, `current_version ${r.current_version}, expected 1`)
    const row = await suOne(`SELECT status FROM public.agency_orders WHERE id = $1`, [orderId])
    expect(row.status === 'draft', `status ${row.status}, expected draft`)
  })

  await testCase('E4. a planned order cannot be cancelled and returns order_not_draft', async () => {
    const tree = await seedOrderTree(agencyA, agrA, siteAPune, { status: 'planned' })
    const r = await cancelAs(ownerA, tree.orderId, 1)
    expect(r && r.ok === false && r.error === 'order_not_draft', `expected order_not_draft, got ${JSON.stringify(r)}`)
    const row = await suOne(`SELECT status FROM public.agency_orders WHERE id = $1`, [tree.orderId])
    expect(row.status === 'planned', `status ${row.status}, expected planned`)
  })

  await testCase('E5. another agency owner cannot cancel this agency\'s order', async () => {
    const f = fresh('e5')
    const imp = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    const orderId = await orderIdOfBatch(imp.batch_id)
    expect(await refusedOrNotOk(cancelAs(ownerB, orderId, 1)), 'the foreign owner cancelled the order')
    const row = await suOne(`SELECT status, version FROM public.agency_orders WHERE id = $1`, [orderId])
    expect(row.status === 'draft' && Number(row.version) === 1, `row changed: ${JSON.stringify(row)}`)
  })

  await testCase('E6. fleet_manager is refused with the scope message and the order is unchanged', async () => {
    const f = fresh('e6')
    const imp = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    const orderId = await orderIdOfBatch(imp.batch_id)
    await expectExactError(cancelAs(fleetA, orderId, 1), SCOPE_MSG)
    const row = await suOne(`SELECT status, version FROM public.agency_orders WHERE id = $1`, [orderId])
    expect(row.status === 'draft' && Number(row.version) === 1, `row changed: ${JSON.stringify(row)}`)
  })

  // =========================================================================
  // S. Scope matrix over agency_order_import
  // =========================================================================
  await testCase('S1. owner imports successfully', async () => {
    const f = fresh('s1')
    const r = await importAs(ownerA, agrA, f.hash, f.key, [line(f.ref, 1)])
    expect(r && r.ok === true && r.state === 'created', `expected created, got ${JSON.stringify(r)}`)
  })

  await testCase('S2. dispatcher imports successfully and is recorded as creator', async () => {
    const f = fresh('s2')
    const r = await importAs(dispatcherA, agrA, f.hash, f.key, [line(f.ref, 1)])
    expect(r && r.ok === true && r.state === 'created', `expected created, got ${JSON.stringify(r)}`)
    const b = await suOne(`SELECT created_by, agency_id FROM public.agency_order_batches WHERE id = $1`, [r.batch_id])
    expect(b.created_by === dispatcherA && b.agency_id === agencyA, `batch ${JSON.stringify(b)}`)
  })

  await testCase('S3. fleet_manager, finance and viewer are refused with the scope message and write nothing', async () => {
    await gather(
      [
        ['fleet_manager', fleetA],
        ['finance', financeA],
        ['viewer', viewerA],
      ].map(([label, who]) => [
        label,
        async () => {
          const f = fresh(`s3-${label}`)
          await expectExactError(importAs(who, agrA, f.hash, f.key, [line(f.ref, 1)]), SCOPE_MSG)
          expect((await batchesByHash(f.hash)) === 0, 'a batch was written by an out-of-scope caller')
        },
      ])
    )
  })

  await testCase('S4. suspended-agency staff are refused with the approval message and write nothing', async () => {
    const f = fresh('s4')
    await expectExactError(importAs(suspendedStaffS, agrS, f.hash, f.key, [line(f.ref, 1, { drop_site: 'Plant S' })]), SUSPENDED_MSG)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for a suspended agency')
  })

  await testCase('S5. a user with no agency profile is refused with the no-profile message', async () => {
    const f = fresh('s5')
    await expectExactError(importAs(noAgency, agrA, f.hash, f.key, [line(f.ref, 1)]), NO_PROFILE_MSG)
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for a user with no agency')
  })

  await testCase('S6. a revoked member is refused and writes nothing', async () => {
    const f = fresh('s6')
    expect(await refusedOrNotOk(importAs(revokedA, agrA, f.hash, f.key, [line(f.ref, 1)])), 'a revoked member was allowed to import')
    expect((await batchesByHash(f.hash)) === 0, 'a batch was written for a revoked member')
  })

  await testCase('S7. another agency owner imports into their own agreement; the batch lands on their agency', async () => {
    const f = fresh('s7')
    const r = await importAs(ownerB, agrB, f.hash, f.key, [line(f.ref, 1, { drop_site: 'Pune Depot' })])
    expect(r && r.ok === true && r.state === 'created', `expected created, got ${JSON.stringify(r)}`)
    const b = await suOne(`SELECT agency_id FROM public.agency_order_batches WHERE id = $1`, [r.batch_id])
    expect(b && b.agency_id === agencyB, `batch agency_id ${b && b.agency_id}, expected agency B`)
  })

  // =========================================================================
  // R. Reads (RLS)
  // =========================================================================
  await testCase('R1. owner and dispatcher, fleet_manager, finance and viewer read every batch, order and line of the agency', async () => {
    await seedOrderTree(agencyA, agrA, siteAPune, { createdBy: ownerA })
    await gather(
      [
        ['owner', ownerA],
        ['dispatcher', dispatcherA],
        ['fleet_manager', fleetA],
        ['finance', financeA],
        ['viewer', viewerA],
      ].map(([label, who]) => [label, () => expectAllVisible(who, agencyA, `${label}:`)])
    )
  })

  await testCase('R2. suspended-agency staff, a revoked member, a no-agency user and another agency owner read 0 rows', async () => {
    await seedOrderTree(agencyS, agrS, siteSPlant, { createdBy: ownerS })
    await gather([
      ['suspended staff (agency S)', () => expectNoRowsVisible(suspendedStaffS, agencyS, 'suspended staff:')],
      ['revoked member (agency A)', () => expectNoRowsVisible(revokedA, agencyA, 'revoked member:')],
      ['no-agency user (agency A)', () => expectNoRowsVisible(noAgency, agencyA, 'no-agency user:')],
      ['other agency owner (agency A)', () => expectNoRowsVisible(ownerB, agencyA, 'other agency owner:')],
    ])
  })

  await testCase('R3. anon has no access: the new tables are not readable (error or 0 rows)', async () => {
    expect((await totalCount('agency_orders', agencyA)) >= 1, 'precondition: no agency_orders rows seeded')
    let refused = false
    try {
      const r = await asAnon(`SELECT id FROM public.agency_orders`)
      refused = r.rows.length === 0
    } catch {
      refused = true
    }
    expect(refused, 'anon could read agency_orders rows')
  })

  // =========================================================================
  // G. Grants, RLS, constraints and signatures
  // =========================================================================
  await testCase('G1. the owner cannot INSERT, UPDATE or DELETE any of the new tables directly', async () => {
    const t = await seedOrderTree(agencyA, agrA, siteAPune, { createdBy: ownerA })
    const statements = [
      ['INSERT batch', `INSERT INTO public.agency_order_batches (id, agency_id, agreement_id, file_hash, row_count, idempotency_key) VALUES ($1, $2, $3, $4, 1, $5)`, [uid(), agencyA, agrA, nx('g1-hash'), nx('g1-key')]],
      ['INSERT order', `INSERT INTO public.agency_orders (id, agency_id, agreement_id, batch_id, client_order_ref, status, version) VALUES ($1, $2, $3, $4, $5, 'draft', 1)`, [uid(), agencyA, agrA, t.batchId, nx('g1-ref')]],
      ['INSERT line', `INSERT INTO public.agency_order_lines (id, agency_id, order_id, line_no, sku, quantity, unit) VALUES ($1, $2, $3, 9, 'G1', 1, 'kg')`, [uid(), agencyA, t.orderId]],
      ['UPDATE order', `UPDATE public.agency_orders SET status = 'cancelled' WHERE id = $1`, [t.orderId]],
      ['UPDATE line', `UPDATE public.agency_order_lines SET quantity = 99 WHERE order_id = $1`, [t.orderId]],
      ['DELETE line', `DELETE FROM public.agency_order_lines WHERE order_id = $1`, [t.orderId]],
      ['DELETE order', `DELETE FROM public.agency_orders WHERE id = $1`, [t.orderId]],
    ]
    await gather(
      statements.map(([label, sql, params]) => [
        label,
        async () => {
          const out = await dmlOutcome(ownerA, sql, params)
          expect(Boolean(out.error), `the owner was allowed to ${label}`)
        },
      ])
    )
    const row = await suOne(`SELECT status FROM public.agency_orders WHERE id = $1`, [t.orderId])
    expect(row && row.status === 'draft', `order status changed by a direct write: ${row && row.status}`)
  })

  await testCase('G2. row-level security is enabled on all three tables and the unique keys are enforced', async () => {
    const t = await seedOrderTree(agencyA, agrA, siteAPune, { createdBy: ownerA })
    await gather([
      ['RLS enabled', async () => {
        const rls = (
          await su(
            `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
            [TABLES]
          )
        ).rows
        expect(rls.length === 3 && rls.every((r) => r.relrowsecurity === true), `rls ${JSON.stringify(rls)}`)
      }],
      ['duplicate batch (agency, agreement, file_hash)', () =>
        expectRaises(
          su(
            `INSERT INTO public.agency_order_batches (id, agency_id, agreement_id, file_hash, row_count, idempotency_key) VALUES ($1, $2, $3, $4, 1, $5)`,
            [uid(), agencyA, agrA, t.hash, nx('g2-key')]
          ),
          'duplicate key'
        )],
      ['duplicate order (agency, agreement, client_order_ref)', () =>
        expectRaises(
          su(
            `INSERT INTO public.agency_orders (id, agency_id, agreement_id, batch_id, client_order_ref, status, version) VALUES ($1, $2, $3, $4, $5, 'draft', 1)`,
            [uid(), agencyA, agrA, t.batchId, t.ref]
          ),
          'duplicate key'
        )],
      ['duplicate line (order, line_no)', () =>
        expectRaises(
          su(
            `INSERT INTO public.agency_order_lines (id, agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg, length_m, width_m, height_m,
                    pickup_site_id, drop_site_id, pickup_from, pickup_to, delivery_from, delivery_to)
             SELECT $1, agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg, length_m, width_m, height_m,
                    pickup_site_id, drop_site_id, pickup_from, pickup_to, delivery_from, delivery_to
               FROM public.agency_order_lines WHERE order_id = $2 AND line_no = 1`,
            [uid(), t.orderId]
          ),
          'duplicate key'
        )],
    ])
  })

  await testCase('G3. anon holds no table privileges on the new tables', async () => {
    const failures = []
    for (const table of TABLES) {
      const p = await suOne(
        `SELECT has_table_privilege('anon', $1, 'SELECT') AS s, has_table_privilege('anon', $1, 'INSERT') AS i,
                has_table_privilege('anon', $1, 'UPDATE') AS u, has_table_privilege('anon', $1, 'DELETE') AS d`,
        [`public.${table}`]
      )
      if (p.s || p.i || p.u || p.d) failures.push(`${table}: select=${p.s} insert=${p.i} update=${p.u} delete=${p.d}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G4. authenticated holds no direct INSERT, UPDATE or DELETE on the new tables', async () => {
    const failures = []
    for (const table of TABLES) {
      const p = await suOne(
        `SELECT has_table_privilege('authenticated', $1, 'INSERT') AS i,
                has_table_privilege('authenticated', $1, 'UPDATE') AS u,
                has_table_privilege('authenticated', $1, 'DELETE') AS d`,
        [`public.${table}`]
      )
      if (p.i || p.u || p.d) failures.push(`${table}: insert=${p.i} update=${p.u} delete=${p.d}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  /** EXECUTE grants for one RPC: authenticated and service_role yes, anon and PUBLIC no. */
  async function rpcGrantFailures(sig) {
    const name = sig.split('.')[1].split('(')[0]
    const p = await suOne(
      `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_ok,
              has_function_privilege('service_role', $1, 'EXECUTE') AS svc_ok,
              has_function_privilege('anon', $1, 'EXECUTE') AS anon_ok`,
      [sig]
    )
    const grantees = (
      await su(
        `SELECT grantee FROM information_schema.routine_privileges
          WHERE routine_schema = 'public' AND routine_name = $1 AND privilege_type = 'EXECUTE'`,
        [name]
      )
    ).rows.map((r) => r.grantee)
    const failures = []
    if (p.auth_ok !== true) failures.push('authenticated cannot EXECUTE')
    if (p.svc_ok !== true) failures.push('service_role cannot EXECUTE')
    if (p.anon_ok !== false) failures.push('anon can EXECUTE')
    if (grantees.includes('PUBLIC')) failures.push('PUBLIC has EXECUTE')
    return failures
  }

  await testCase('G5. agency_order_import: EXECUTE for authenticated and service_role only', async () => {
    const failures = await rpcGrantFailures('public.agency_order_import(uuid,text,text,jsonb)')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G6. agency_order_cancel: EXECUTE for authenticated and service_role only', async () => {
    const failures = await rpcGrantFailures('public.agency_order_cancel(uuid,integer)')
    expect(failures.length === 0, failures.join('; '))
  })

  /** Signature, SECURITY DEFINER and pinned search_path for one RPC. */
  async function rpcDefinitionFailures(name, expectedArgs) {
    const info = await su(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS res,
              p.prosecdef, p.proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = $1`,
      [name]
    )
    expect(info.rows.length === 1, `expected 1 definition of ${name}, found ${info.rows.length}`)
    const { args, res, prosecdef, proconfig } = info.rows[0]
    const failures = []
    if (args !== expectedArgs) failures.push(`identity arguments: ${args}`)
    if (/agency/i.test(args)) failures.push(`an argument names an agency: ${args}`)
    if (res !== 'jsonb') failures.push(`return type ${res}`)
    if (prosecdef !== true) failures.push('not SECURITY DEFINER')
    if (!/search_path=public/.test((proconfig || []).join(','))) failures.push(`search_path not pinned (${(proconfig || []).join(',') || 'none'})`)
    return failures
  }

  await testCase('G7. agency_order_import signature is exactly (p_agreement_id, p_file_hash, p_idempotency_key, p_lines) returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures(
      'agency_order_import',
      'p_agreement_id uuid, p_file_hash text, p_idempotency_key text, p_lines jsonb'
    )
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('G8. agency_order_cancel signature is exactly (p_order_id, p_expected_version) returns jsonb, SECURITY DEFINER, no agency argument', async () => {
    const failures = await rpcDefinitionFailures('agency_order_cancel', 'p_order_id uuid, p_expected_version integer')
    expect(failures.length === 0, failures.join('; '))
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
