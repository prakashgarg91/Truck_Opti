#!/usr/bin/env node
/**
 * Agency consignments (GR/LR note, pickup-to-receipt proof) — red-first PGlite battery (TO-146).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays the
 * supabase/migrations chain, including supabase/migrations/20261019000000_agency_consignments.sql,
 * and drives the RPCs the way PostgREST does per request: `SET ROLE authenticated` with
 * `request.jwt.claims` set to the caller's sub.
 *
 * Pinned contract under test. The migration that implements it is NOT written yet, so every
 * case is EXPECTED to fail now with the reason "migration ... is missing". Once the file exists,
 * each case runs against the real objects.
 *
 *   Tables (RLS on, no direct write privileges for authenticated):
 *     agency_consignments(id uuid pk, agency_id, order_id references agency_orders, gr_number text,
 *       status text, qr_token text, version int default 1, created_at, idempotency_key)
 *       UNIQUE (agency_id, gr_number), UNIQUE (agency_id, order_id), UNIQUE (agency_id, idempotency_key)
 *     agency_gr_sequences(agency_id, fy text, last_seq int)  PRIMARY KEY (agency_id, fy)
 *     agency_consignment_events(id, consignment_id, agency_id, event text, from_status, to_status,
 *       actor uuid, note, created_at)
 *
 *   RLS reads: owner and every active staff scope (dispatcher, fleet_manager, finance, viewer) read
 *   their agency's consignments. Other agencies, revoked members, suspended-agency staff, users with
 *   no agency and anon read 0 rows. No direct INSERT/UPDATE/DELETE for authenticated.
 *
 *   public.agency_consignment_create(p_order_id uuid, p_idempotency_key text) RETURNS jsonb
 *     - SECURITY DEFINER, pinned search_path, NO agency argument, agency from auth.uid().
 *     - Scope 'dispatcher' (owner always allowed). Other scopes: {ok:false,error:'forbidden_scope'}.
 *     - Success: {ok:true, consignment_id, gr_number, status:'created', version:1}, GR like
 *       'AGY/2026-27/000001' (April-March financial year from current_date, sequence per agency
 *       per FY, never reused).
 *     - {ok:false,error:'order_not_found'} (other agency or missing order), 'order_cancelled',
 *       'consignment_exists' (second create for the order with a different key),
 *       'idempotency_key_reused' (same key, different order).
 *     - Same key + same order: {ok:true, ..., replay:true} with the same consignment, no new row.
 *     - Unapproved (suspended) agency and revoked or no-agency callers: refused (raised or ok:false).
 *
 *   public.agency_consignment_event(p_consignment_id uuid, p_event text, p_expected_version int,
 *     p_idempotency_key text, p_note text) RETURNS jsonb
 *     - SECURITY DEFINER, pinned search_path, NO agency argument. Scope 'dispatcher' or
 *       'fleet_manager' (owner always allowed). finance and viewer refused.
 *     - States: created, picked_up, in_transit, delivered, receipt_confirmed (terminal), disputed.
 *       pickup_scanned created->picked_up; transit_started picked_up->in_transit;
 *       delivery_scanned in_transit->delivered; receipt_signed delivered->receipt_confirmed;
 *       dispute_raised from picked_up, in_transit, delivered -> disputed.
 *     - Success: {ok:true, status, version}; version = previous + 1; exactly one events row appended.
 *     - Other combination: {ok:false,error:'illegal_transition'}. Unknown event: 'unknown_event'.
 *     - Stale expected version: {ok:false,error:'version_conflict',current_version}.
 *     - Note longer than 500 characters: {ok:false,error:'note_too_long'}.
 *     - Same key replay: {ok:true, replay:true, status, version}, no second events row.
 *     - Another agency's consignment: {ok:false,error:'not_found'}.
 *
 * Assumptions (not pinned by the brief, flagged for the implementer):
 *   - Replay is checked before the state and version rules (the replay case sends identical args).
 *   - The fiscal year is computed from the database current_date (April to March, 'YYYY-YY').
 *   - agency_gr_sequences.fy stores the same 'YYYY-YY' text that appears in the GR number.
 *   - Refusals for unapproved agencies, revoked members, no-agency users and direct DML may raise
 *     or return ok:false (the case accepts either, but the state must not change).
 *   - anon SELECT on the new tables either raises or returns 0 rows.
 *   - A creation may or may not write an events row, so event-count checks use deltas.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST / GoTrue
 * behaviour is NOT covered. Concurrency is not raced.
 *
 * Usage:  node scripts/agency_consignments.db.test.mjs   (from the repo root)
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
const MIGRATION_FILE = '20261019000000_agency_consignments.sql'
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
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so agency_consignments does not exist yet`)
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
 * Superuser seed of one batch and one order (2 lines) on the given site.
 * The order is the input the consignment commands act on.
 */
async function seedOrderTree(agencyId, agreementId, siteId, { status = 'draft' } = {}) {
  const batchId = uid()
  const orderId = uid()
  const hash = nx('seed-hash')
  const ref = nx('seed-ref')
  await su(
    `INSERT INTO public.agency_order_batches (id, agency_id, agreement_id, file_hash, row_count, created_by, idempotency_key)
     VALUES ($1, $2, $3, $4, 2, NULL, $5)`,
    [batchId, agencyId, agreementId, hash, nx('seed-batch-key')]
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
  return { orderId, agencyId, agreementId }
}

/** A fresh agency with an approved owner, one active agreement and one ship-to site. */
async function makeAgency(tag) {
  const owner = await createUser(`${tag}-owner`)
  const agency = await createAgencyRow(owner, tag, 'approved')
  const agr = await seedAgreement(agency, `${tag} client`)
  const site = await seedSite(agency, agr, 'ship_to', `${tag} depot`)
  return { owner, agency, agr, site }
}

// Fixture handles, assigned in setupFixtures().
let ownerA, ownerB, ownerS, agencyA, agencyB, agencyS
let agrA, agrB, agrS
let siteAPune, siteBPune, siteSPlant
let dispatcherA, fleetA, financeA, viewerA, revokedA, suspendedStaffS, noAgency
let tenantA

async function setupFixtures() {
  ownerA = await createUser('ct-owner-a')
  agencyA = await createAgencyRow(ownerA, 'Consign A', 'approved')
  ownerB = await createUser('ct-owner-b')
  agencyB = await createAgencyRow(ownerB, 'Consign B', 'approved')
  ownerS = await createUser('ct-owner-s')
  agencyS = await createAgencyRow(ownerS, 'Consign S', 'suspended')

  agrA = await seedAgreement(agencyA, 'Acme Cement')
  agrB = await seedAgreement(agencyB, 'Beta Logistics')
  agrS = await seedAgreement(agencyS, 'Gamma Goods')

  await seedSite(agencyA, agrA, 'bill_to', 'Head Office')
  siteAPune = await seedSite(agencyA, agrA, 'ship_to', 'Pune Depot')
  await seedSite(agencyB, agrB, 'bill_to', 'Head Office')
  siteBPune = await seedSite(agencyB, agrB, 'ship_to', 'Pune Depot')
  await seedSite(agencyS, agrS, 'bill_to', 'Head Office')
  siteSPlant = await seedSite(agencyS, agrS, 'ship_to', 'Plant S')

  dispatcherA = await seedStaff(agencyA, 'ct-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'ct-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'ct-finance', 'finance')
  viewerA = await seedStaff(agencyA, 'ct-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'ct-revoked', 'dispatcher', 'revoked')
  suspendedStaffS = await seedStaff(agencyS, 'ct-suspended', 'dispatcher')
  noAgency = await createUser('ct-no-agency')

  tenantA = { owner: ownerA, agency: agencyA, agr: agrA, site: siteAPune }
}

// ---------------------------------------------------------------------------
// Command wrappers and state helpers
// ---------------------------------------------------------------------------
const CREATE_SQL = `SELECT public.agency_consignment_create($1::uuid, $2::text) AS r`
const EVENT_SQL = `SELECT public.agency_consignment_event($1::uuid, $2::text, $3::int, $4::text, $5::text) AS r`

async function createAs(userId, orderId, key) {
  return asActor(userId, async () => parseJson((await db.query(CREATE_SQL, [orderId, key])).rows[0].r))
}

async function eventAs(userId, consignmentId, event, expectedVersion, key, note = null) {
  return asActor(userId, async () =>
    parseJson((await db.query(EVENT_SQL, [consignmentId, event, expectedVersion, key, note])).rows[0].r)
  )
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
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])).n)
}

async function consignmentRow(cid) {
  return suOne(
    `SELECT agency_id, order_id, gr_number, status, version FROM public.agency_consignments WHERE id = $1`,
    [cid]
  )
}

async function consignmentsForOrder(orderId) {
  return Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_consignments WHERE order_id = $1`, [orderId])).n)
}

async function eventRowCount(cid) {
  return Number(
    (await suOne(`SELECT count(*)::int AS n FROM public.agency_consignment_events WHERE consignment_id = $1`, [cid])).n
  )
}

async function expectUnchanged(cid, status, version) {
  const row = await consignmentRow(cid)
  expect(
    row && row.status === status && Number(row.version) === version,
    `row changed: ${JSON.stringify(row)}, expected ${status} v${version}`
  )
}

/** Creates a fresh draft order in the tenant and a consignment for it, asserting success. */
async function newConsignment(tenant, actor = tenant.owner) {
  const order = await seedOrderTree(tenant.agency, tenant.agr, tenant.site)
  const r = await createAs(actor, order.orderId, nx('ckey'))
  expect(r && r.ok === true, `precondition: create refused ${JSON.stringify(r)}`)
  return { cid: r.consignment_id, orderId: order.orderId, gr: r.gr_number, tenant }
}

const NEXT_EVENT = {
  created: { event: 'pickup_scanned', to: 'picked_up' },
  picked_up: { event: 'transit_started', to: 'in_transit' },
  in_transit: { event: 'delivery_scanned', to: 'delivered' },
  delivered: { event: 'receipt_signed', to: 'receipt_confirmed' },
}

/** Drives a consignment along the happy path until it reaches `target` (precondition helper). */
async function driveTo(actor, cid, target) {
  for (let guard = 0; guard < 8; guard++) {
    const row = await consignmentRow(cid)
    if (row.status === target) return row
    const step = NEXT_EVENT[row.status]
    if (!step) throw new Error(`precondition: cannot move from ${row.status} toward ${target}`)
    const r = await eventAs(actor, cid, step.event, Number(row.version), nx('drv'), null)
    expect(r && r.ok === true, `precondition: ${step.event} refused: ${JSON.stringify(r)}`)
  }
  throw new Error(`precondition: did not reach ${target}`)
}

/** Fiscal year text 'YYYY-YY' (April to March) from the database current_date. */
async function fiscalYear() {
  const row = await suOne(
    `SELECT extract(year FROM current_date)::int AS y, extract(month FROM current_date)::int AS m`
  )
  const y = Number(row.y)
  const start = Number(row.m) >= 4 ? y : y - 1
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

function sequenceOf(grNumber) {
  const m = /^AGY\/\d{4}-\d{2}\/(\d{6})$/.exec(String(grNumber))
  return m ? m[1] : null
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
  console.log(`migration ${MIGRATION_FILE}: ${MIGRATION_PRESENT ? 'present' : 'MISSING'}`)
  await setupFixtures()

  // =========================================================================
  // A. Schema, grants and signatures
  // =========================================================================
  await testCase(`C01. migration file ${MIGRATION_FILE} is present in supabase/migrations`, async () => {
    expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing (not written yet)`)
  })

  await gatedCase('C02. agency_consignments, agency_gr_sequences and agency_consignment_events exist with RLS enabled', async () => {
    const rows = (
      await su(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = ANY($1::text[])`,
        [['agency_consignments', 'agency_gr_sequences', 'agency_consignment_events']]
      )
    ).rows
    const byName = Object.fromEntries(rows.map((r) => [r.relname, r.relrowsecurity]))
    const missing = ['agency_consignments', 'agency_gr_sequences', 'agency_consignment_events'].filter((t) => !(t in byName))
    expect(missing.length === 0, `missing tables: ${missing.join(', ')}`)
    const noRls = Object.keys(byName).filter((t) => byName[t] !== true)
    expect(noRls.length === 0, `RLS not enabled on: ${noRls.join(', ')}`)
  })

  await gatedCase('C03. agency_consignments is unique on (agency_id, gr_number), (agency_id, order_id) and (agency_id, idempotency_key)', async () => {
    const rows = (
      await su(
        `SELECT array_agg(a.attname::text ORDER BY a.attname) AS cols
           FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = 'public.agency_consignments'::regclass AND i.indisunique
          GROUP BY i.indexrelid`
      )
    ).rows.map((r) => r.cols)
    const want = [
      ['agency_id', 'gr_number'],
      ['agency_id', 'order_id'],
      ['agency_id', 'idempotency_key'],
    ]
    const missing = want.filter((w) => !rows.some((c) => JSON.stringify(c) === JSON.stringify([...w].sort())))
    expect(missing.length === 0, `missing unique indexes: ${missing.map((m) => m.join('+')).join(', ')}`)
  })

  await gatedCase('C04. agency_gr_sequences is keyed by (agency_id, fy) and carries last_seq', async () => {
    const pk = (
      await su(
        `SELECT array_agg(a.attname::text ORDER BY a.attname) AS cols
           FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
          WHERE i.indrelid = 'public.agency_gr_sequences'::regclass AND i.indisprimary`
      )
    ).rows[0]
    expect(pk && JSON.stringify(pk.cols) === JSON.stringify(['agency_id', 'fy']), `primary key ${JSON.stringify(pk)}`)
    const cols = (
      await su(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'agency_gr_sequences'`
      )
    ).rows.map((r) => r.column_name)
    expect(cols.includes('last_seq'), `columns ${cols.join(', ')} lack last_seq`)
  })

  await gatedCase('C05. agency_consignment_events carries consignment_id, agency_id, event, from_status, to_status, actor, note and created_at', async () => {
    const cols = (
      await su(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'agency_consignment_events'`
      )
    ).rows.map((r) => r.column_name)
    const want = ['consignment_id', 'agency_id', 'event', 'from_status', 'to_status', 'actor', 'note', 'created_at']
    const missing = want.filter((c) => !cols.includes(c))
    expect(missing.length === 0, `missing columns: ${missing.join(', ')}`)
  })

  await gatedCase('C06. authenticated and anon hold no INSERT, UPDATE or DELETE privilege on the three tables', async () => {
    const failures = []
    for (const t of ['agency_consignments', 'agency_gr_sequences', 'agency_consignment_events']) {
      for (const role of ['authenticated', 'anon']) {
        for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
          const row = await suOne(`SELECT has_table_privilege($1, $2, $3) AS ok`, [role, `public.${t}`, priv])
          if (row.ok === true) failures.push(`${role} ${priv} on ${t}`)
        }
      }
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C07. agency_consignment_create is (p_order_id uuid, p_idempotency_key text) returning jsonb, SECURITY DEFINER, pinned search_path, no agency argument', async () => {
    const info = await su(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS res,
              p.prosecdef, p.proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = 'agency_consignment_create'`
    )
    expect(info.rows.length === 1, `expected 1 definition, found ${info.rows.length}`)
    const { args, res, prosecdef, proconfig } = info.rows[0]
    const failures = []
    if (args !== 'p_order_id uuid, p_idempotency_key text') failures.push(`identity arguments: ${args}`)
    if (/agency/i.test(args)) failures.push(`an argument names an agency: ${args}`)
    if (res !== 'jsonb') failures.push(`return type ${res}`)
    if (prosecdef !== true) failures.push('not SECURITY DEFINER')
    if (!/search_path=public/.test((proconfig || []).join(','))) failures.push('search_path not pinned')
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C08. agency_consignment_event is (p_consignment_id, p_event, p_expected_version, p_idempotency_key, p_note) returning jsonb, SECURITY DEFINER, pinned search_path, no agency argument', async () => {
    const info = await su(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS res,
              p.prosecdef, p.proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = 'agency_consignment_event'`
    )
    expect(info.rows.length === 1, `expected 1 definition, found ${info.rows.length}`)
    const { args, res, prosecdef, proconfig } = info.rows[0]
    const failures = []
    if (args !== 'p_consignment_id uuid, p_event text, p_expected_version integer, p_idempotency_key text, p_note text') {
      failures.push(`identity arguments: ${args}`)
    }
    if (/agency/i.test(args)) failures.push(`an argument names an agency: ${args}`)
    if (res !== 'jsonb') failures.push(`return type ${res}`)
    if (prosecdef !== true) failures.push('not SECURITY DEFINER')
    if (!/search_path=public/.test((proconfig || []).join(','))) failures.push('search_path not pinned')
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C09. both commands are executable by authenticated and service_role, not by anon', async () => {
    const sigs = ['public.agency_consignment_create(uuid,text)', 'public.agency_consignment_event(uuid,text,integer,text,text)']
    const failures = []
    for (const sig of sigs) {
      const p = await suOne(
        `SELECT has_function_privilege('authenticated', $1, 'EXECUTE') AS auth_ok,
                has_function_privilege('service_role', $1, 'EXECUTE') AS svc_ok,
                has_function_privilege('anon', $1, 'EXECUTE') AS anon_ok`,
        [sig]
      )
      if (p.auth_ok !== true) failures.push(`${sig}: authenticated cannot execute`)
      if (p.svc_ok !== true) failures.push(`${sig}: service_role cannot execute`)
      if (p.anon_ok === true) failures.push(`${sig}: anon can execute`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // B. Consignment creation and GR numbering
  // =========================================================================
  await gatedCase('C10. owner creates a consignment for a draft order: ok/created, version 1, uuid id, gr_number, no replay flag', async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune)
    const r = await createAs(ownerA, order.orderId, nx('ckey'))
    expect(r && r.ok === true && r.status === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
    expect(Number(r.version) === 1, `version ${r.version}, expected 1`)
    expect(UUID_RE.test(String(r.consignment_id)), `consignment_id ${JSON.stringify(r.consignment_id)}`)
    expect(typeof r.gr_number === 'string' && r.gr_number.length > 0, `gr_number ${JSON.stringify(r.gr_number)}`)
    expect(r.replay !== true, 'a first create was flagged as replay')
  })

  await gatedCase('C11. the stored consignment matches the reply and carries a non-empty qr_token', async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune)
    const r = await createAs(ownerA, order.orderId, nx('ckey'))
    expect(r && r.ok === true, `create ${JSON.stringify(r)}`)
    const row = await suOne(
      `SELECT agency_id, order_id, gr_number, status, version, qr_token FROM public.agency_consignments WHERE id = $1`,
      [r.consignment_id]
    )
    expect(row, 'no agency_consignments row for the returned consignment_id')
    expect(row.agency_id === agencyA, `agency_id ${row.agency_id}`)
    expect(row.order_id === order.orderId, `order_id ${row.order_id}`)
    expect(row.gr_number === r.gr_number, `gr_number ${row.gr_number} vs reply ${r.gr_number}`)
    expect(row.status === 'created' && Number(row.version) === 1, `status/version ${row.status}/${row.version}`)
    expect(typeof row.qr_token === 'string' && row.qr_token.trim() !== '', 'qr_token is empty')
  })

  await gatedCase("C12. the first GR of a new agency is 'AGY/<FY>/000001' with FY the April-March year of current_date", async () => {
    const t = await makeAgency('Gr first')
    const r = await createAs(t.owner, (await seedOrderTree(t.agency, t.agr, t.site)).orderId, nx('ckey'))
    expect(r && r.ok === true, `create ${JSON.stringify(r)}`)
    const fy = await fiscalYear()
    expect(r.gr_number === `AGY/${fy}/000001`, `gr_number ${r.gr_number}, expected AGY/${fy}/000001`)
  })

  await gatedCase('C13. two sequential creates in one agency give GR numbers ending 000001 then 000002', async () => {
    const t = await makeAgency('Gr pair')
    const r1 = await createAs(t.owner, (await seedOrderTree(t.agency, t.agr, t.site)).orderId, nx('ckey'))
    const r2 = await createAs(t.owner, (await seedOrderTree(t.agency, t.agr, t.site)).orderId, nx('ckey'))
    expect(r1 && r1.ok === true && r2 && r2.ok === true, `creates ${JSON.stringify([r1, r2])}`)
    expect(sequenceOf(r1.gr_number) === '000001', `first GR ${r1.gr_number}`)
    expect(sequenceOf(r2.gr_number) === '000002', `second GR ${r2.gr_number}`)
  })

  await gatedCase('C14. a different agency starts its own sequence again at 000001', async () => {
    const a = await makeAgency('Gr iso a')
    const b = await makeAgency('Gr iso b')
    const ra = await createAs(a.owner, (await seedOrderTree(a.agency, a.agr, a.site)).orderId, nx('ckey'))
    const rb = await createAs(b.owner, (await seedOrderTree(b.agency, b.agr, b.site)).orderId, nx('ckey'))
    expect(ra && ra.ok === true && rb && rb.ok === true, `creates ${JSON.stringify([ra, rb])}`)
    expect(sequenceOf(ra.gr_number) === '000001', `agency a first GR ${ra.gr_number}`)
    expect(sequenceOf(rb.gr_number) === '000001', `agency b first GR ${rb.gr_number}`)
  })

  await gatedCase('C15. agency_gr_sequences holds last_seq = 2 for the agency and the current FY after two creates', async () => {
    const t = await makeAgency('Gr seq')
    await createAs(t.owner, (await seedOrderTree(t.agency, t.agr, t.site)).orderId, nx('ckey'))
    await createAs(t.owner, (await seedOrderTree(t.agency, t.agr, t.site)).orderId, nx('ckey'))
    const fy = await fiscalYear()
    const row = await suOne(`SELECT last_seq FROM public.agency_gr_sequences WHERE agency_id = $1 AND fy = $2`, [t.agency, fy])
    expect(row, `no agency_gr_sequences row for (agency, ${fy})`)
    expect(Number(row.last_seq) === 2, `last_seq ${row.last_seq}, expected 2`)
  })

  await gatedCase('C16. a dispatcher may create a consignment', async () => {
    const r = await createAs(dispatcherA, (await seedOrderTree(agencyA, agrA, siteAPune)).orderId, nx('ckey'))
    expect(r && r.ok === true && r.status === 'created', `expected ok/created, got ${JSON.stringify(r)}`)
  })

  await gatedCase("C17. viewer, finance and fleet_manager are refused with 'forbidden_scope' and create nothing", async () => {
    await gather(
      [
        ['viewer', viewerA],
        ['finance', financeA],
        ['fleet_manager', fleetA],
      ].map(([label, who]) => [
        label,
        async () => {
          const order = await seedOrderTree(agencyA, agrA, siteAPune)
          expectError(await createAs(who, order.orderId, nx('ckey')), 'forbidden_scope')
          expect((await consignmentsForOrder(order.orderId)) === 0, 'a consignment was written by an out-of-scope caller')
        },
      ])
    )
  })

  await gatedCase("C18. an order of another agency is refused with 'order_not_found' and no consignment is written", async () => {
    const foreign = await seedOrderTree(agencyB, agrB, siteBPune)
    const r = await createAs(ownerA, foreign.orderId, nx('ckey'))
    expectError(r, 'order_not_found')
    expect((await consignmentsForOrder(foreign.orderId)) === 0, 'a consignment was written for a foreign order')
  })

  await gatedCase("C19. a missing order id is refused with 'order_not_found'", async () => {
    const missing = uid()
    expectError(await createAs(ownerA, missing, nx('ckey')), 'order_not_found')
    expect((await consignmentsForOrder(missing)) === 0, 'a consignment was written for a missing order')
  })

  await gatedCase("C20. a cancelled order is refused with 'order_cancelled' and no consignment is written", async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune, { status: 'cancelled' })
    expectError(await createAs(ownerA, order.orderId, nx('ckey')), 'order_cancelled')
    expect((await consignmentsForOrder(order.orderId)) === 0, 'a consignment was written for a cancelled order')
  })

  await gatedCase("C21. a second create for the same order with a different key is refused with 'consignment_exists'", async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune)
    const first = await createAs(ownerA, order.orderId, nx('ckey-1'))
    expect(first && first.ok === true, `first create ${JSON.stringify(first)}`)
    expectError(await createAs(ownerA, order.orderId, nx('ckey-2')), 'consignment_exists')
    expect((await consignmentsForOrder(order.orderId)) === 1, 'a second consignment row exists for the order')
  })

  await gatedCase('C22. same key and same order replays the same consignment with replay:true and no new row', async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune)
    const key = nx('ckey-replay')
    const first = await createAs(ownerA, order.orderId, key)
    expect(first && first.ok === true, `first create ${JSON.stringify(first)}`)
    const replay = await createAs(ownerA, order.orderId, key)
    expect(replay && replay.ok === true && replay.replay === true, `expected replay:true, got ${JSON.stringify(replay)}`)
    expect(replay.consignment_id === first.consignment_id, `consignment_id ${replay.consignment_id}, expected ${first.consignment_id}`)
    expect(replay.gr_number === first.gr_number, `gr_number ${replay.gr_number}, expected ${first.gr_number}`)
    expect((await consignmentsForOrder(order.orderId)) === 1, 'the replay wrote a second consignment')
  })

  await gatedCase("C23. same key on a different order is refused with 'idempotency_key_reused' and writes nothing for that order", async () => {
    const o1 = await seedOrderTree(agencyA, agrA, siteAPune)
    const o2 = await seedOrderTree(agencyA, agrA, siteAPune)
    const key = nx('ckey-reuse')
    const first = await createAs(ownerA, o1.orderId, key)
    expect(first && first.ok === true, `first create ${JSON.stringify(first)}`)
    expectError(await createAs(ownerA, o2.orderId, key), 'idempotency_key_reused')
    expect((await consignmentsForOrder(o2.orderId)) === 0, 'a consignment was written for the second order')
  })

  await gatedCase('C24. staff and owner of an unapproved (suspended) agency cannot create, and nothing is written', async () => {
    const order = await seedOrderTree(agencyS, agrS, siteSPlant)
    await gather([
      ['suspended owner', async () => {
        expect(await refusedOrNotOk(createAs(ownerS, order.orderId, nx('ckey'))), 'the suspended owner created a consignment')
      }],
      ['suspended staff', async () => {
        expect(await refusedOrNotOk(createAs(suspendedStaffS, order.orderId, nx('ckey'))), 'suspended-agency staff created a consignment')
      }],
    ])
    expect((await consignmentsForOrder(order.orderId)) === 0, 'a consignment was written for the suspended agency')
  })

  await gatedCase('C25. a revoked dispatcher and a user with no agency cannot create, and nothing is written', async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune)
    await gather([
      ['revoked dispatcher', async () => {
        expect(await refusedOrNotOk(createAs(revokedA, order.orderId, nx('ckey'))), 'a revoked member created a consignment')
      }],
      ['no agency', async () => {
        expect(await refusedOrNotOk(createAs(noAgency, order.orderId, nx('ckey'))), 'a user with no agency created a consignment')
      }],
    ])
    expect((await consignmentsForOrder(order.orderId)) === 0, 'a consignment was written for a refused caller')
  })

  // =========================================================================
  // C. State machine and events
  // =========================================================================
  await gatedCase('C26. pickup_scanned moves created to picked_up at version 2 and the row reflects it', async () => {
    const c = await newConsignment(tenantA)
    const r = await eventAs(ownerA, c.cid, 'pickup_scanned', 1, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'picked_up' && Number(r.version) === 2, `reply ${JSON.stringify(r)}`)
    const row = await consignmentRow(c.cid)
    expect(row.status === 'picked_up' && Number(row.version) === 2, `row ${JSON.stringify(row)}`)
  })

  await gatedCase('C27. transit_started moves picked_up to in_transit at version 3', async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'picked_up')
    const r = await eventAs(ownerA, c.cid, 'transit_started', 2, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'in_transit' && Number(r.version) === 3, `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C28. delivery_scanned moves in_transit to delivered at version 4', async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'in_transit')
    const r = await eventAs(ownerA, c.cid, 'delivery_scanned', 3, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'delivered' && Number(r.version) === 4, `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C29. receipt_signed moves delivered to receipt_confirmed at version 5', async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'delivered')
    const r = await eventAs(ownerA, c.cid, 'receipt_signed', 4, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'receipt_confirmed' && Number(r.version) === 5, `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C30. dispute_raised from picked_up moves to disputed', async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'picked_up')
    const r = await eventAs(ownerA, c.cid, 'dispute_raised', 2, nx('ev'), 'Seal broken')
    expect(r && r.ok === true && r.status === 'disputed', `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C31. dispute_raised from in_transit moves to disputed', async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'in_transit')
    const r = await eventAs(ownerA, c.cid, 'dispute_raised', 3, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'disputed', `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C32. dispute_raised from delivered moves to disputed', async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'delivered')
    const r = await eventAs(ownerA, c.cid, 'dispute_raised', 4, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'disputed', `reply ${JSON.stringify(r)}`)
  })

  await gatedCase("C33. dispute_raised from created is refused with 'illegal_transition' and the row is unchanged", async () => {
    const c = await newConsignment(tenantA)
    expectError(await eventAs(ownerA, c.cid, 'dispute_raised', 1, nx('ev'), null), 'illegal_transition')
    await expectUnchanged(c.cid, 'created', 1)
  })

  await gatedCase("C34. out-of-order events are refused with 'illegal_transition' from every non-matching state", async () => {
    const cases = [
      ['created', 'transit_started'],
      ['created', 'delivery_scanned'],
      ['created', 'receipt_signed'],
      ['picked_up', 'pickup_scanned'],
      ['picked_up', 'delivery_scanned'],
      ['picked_up', 'receipt_signed'],
      ['in_transit', 'pickup_scanned'],
      ['in_transit', 'transit_started'],
      ['in_transit', 'receipt_signed'],
      ['delivered', 'pickup_scanned'],
      ['delivered', 'transit_started'],
      ['delivered', 'delivery_scanned'],
    ]
    await gather(
      cases.map(([from, event]) => [
        `${from} + ${event}`,
        async () => {
          const c = await newConsignment(tenantA)
          await driveTo(ownerA, c.cid, from)
          const before = await consignmentRow(c.cid)
          expectError(await eventAs(ownerA, c.cid, event, Number(before.version), nx('ev'), null), 'illegal_transition')
          await expectUnchanged(c.cid, from, Number(before.version))
        },
      ])
    )
  })

  await gatedCase("C35. receipt_confirmed is terminal: every event is refused with 'illegal_transition'", async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'receipt_confirmed')
    const events = ['pickup_scanned', 'transit_started', 'delivery_scanned', 'receipt_signed', 'dispute_raised']
    await gather(
      events.map((event) => [
        event,
        async () => {
          expectError(await eventAs(ownerA, c.cid, event, 5, nx('ev'), null), 'illegal_transition')
          await expectUnchanged(c.cid, 'receipt_confirmed', 5)
        },
      ])
    )
  })

  await gatedCase("C36. dispute_raised from disputed is refused with 'illegal_transition'", async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'picked_up')
    const first = await eventAs(ownerA, c.cid, 'dispute_raised', 2, nx('ev'), null)
    expect(first && first.ok === true, `dispute ${JSON.stringify(first)}`)
    expectError(await eventAs(ownerA, c.cid, 'dispute_raised', 3, nx('ev'), null), 'illegal_transition')
    await expectUnchanged(c.cid, 'disputed', 3)
  })

  await gatedCase("C37. an unknown event name is refused with 'unknown_event' and the row is unchanged", async () => {
    const c = await newConsignment(tenantA)
    expectError(await eventAs(ownerA, c.cid, 'teleport_scanned', 1, nx('ev'), null), 'unknown_event')
    await expectUnchanged(c.cid, 'created', 1)
  })

  await gatedCase("C38. a stale expected version is refused with 'version_conflict' and current_version, and writes nothing", async () => {
    const c = await newConsignment(tenantA)
    const before = await eventRowCount(c.cid)
    const r = await eventAs(ownerA, c.cid, 'pickup_scanned', 5, nx('ev'), null)
    expectError(r, 'version_conflict')
    expect(Number(r.current_version) === 1, `current_version ${r.current_version}, expected 1`)
    await expectUnchanged(c.cid, 'created', 1)
    expect((await eventRowCount(c.cid)) === before, 'a conflicting event appended an events row')
  })

  await gatedCase('C39. version rises by exactly 1 per successful event and each success appends exactly one events row', async () => {
    const c = await newConsignment(tenantA)
    const steps = [
      ['pickup_scanned', 'picked_up', 2],
      ['transit_started', 'in_transit', 3],
      ['delivery_scanned', 'delivered', 4],
      ['receipt_signed', 'receipt_confirmed', 5],
    ]
    let version = 1
    for (const [event, status, next] of steps) {
      const before = await eventRowCount(c.cid)
      const r = await eventAs(ownerA, c.cid, event, version, nx('ev'), null)
      expect(r && r.ok === true, `${event} refused: ${JSON.stringify(r)}`)
      expect(Number(r.version) === next, `${event} version ${r.version}, expected ${next}`)
      expect((await eventRowCount(c.cid)) === before + 1, `${event} did not append exactly one events row`)
      version = next
      expect(r.status === status, `${event} status ${r.status}`)
    }
  })

  await gatedCase('C40. the events row records event, from_status, to_status, actor and note', async () => {
    const c = await newConsignment(tenantA)
    const r = await eventAs(ownerA, c.cid, 'pickup_scanned', 1, nx('ev'), 'Gate pass 42')
    expect(r && r.ok === true, `pickup ${JSON.stringify(r)}`)
    const row = await suOne(
      `SELECT event, from_status, to_status, actor, note FROM public.agency_consignment_events
        WHERE consignment_id = $1 AND event = 'pickup_scanned'`,
      [c.cid]
    )
    expect(row, 'no pickup_scanned events row')
    expect(row.from_status === 'created' && row.to_status === 'picked_up', `statuses ${row.from_status}->${row.to_status}`)
    expect(row.actor === ownerA, `actor ${row.actor}, expected the owner`)
    expect(row.note === 'Gate pass 42', `note ${JSON.stringify(row.note)}`)
  })

  await gatedCase("C41. a note longer than 500 characters is refused with 'note_too_long' and writes nothing", async () => {
    const c = await newConsignment(tenantA)
    const before = await eventRowCount(c.cid)
    expectError(await eventAs(ownerA, c.cid, 'pickup_scanned', 1, nx('ev'), 'x'.repeat(501)), 'note_too_long')
    await expectUnchanged(c.cid, 'created', 1)
    expect((await eventRowCount(c.cid)) === before, 'an over-long note appended an events row')
  })

  await gatedCase('C42. a note of exactly 500 characters is accepted', async () => {
    const c = await newConsignment(tenantA)
    const r = await eventAs(ownerA, c.cid, 'pickup_scanned', 1, nx('ev'), 'x'.repeat(500))
    expect(r && r.ok === true && r.status === 'picked_up', `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C43. replaying the same event key returns replay:true with the original status and version and no second row', async () => {
    const c = await newConsignment(tenantA)
    const key = nx('ev-replay')
    const first = await eventAs(ownerA, c.cid, 'pickup_scanned', 1, key, null)
    expect(first && first.ok === true, `first ${JSON.stringify(first)}`)
    const before = await eventRowCount(c.cid)
    const replay = await eventAs(ownerA, c.cid, 'pickup_scanned', 1, key, null)
    expect(replay && replay.ok === true && replay.replay === true, `expected replay:true, got ${JSON.stringify(replay)}`)
    expect(replay.status === 'picked_up' && Number(replay.version) === 2, `replay ${JSON.stringify(replay)}`)
    expect((await eventRowCount(c.cid)) === before, 'the replay appended an events row')
  })

  await gatedCase('C44. a fleet_manager may record a pickup event', async () => {
    const c = await newConsignment(tenantA)
    const r = await eventAs(fleetA, c.cid, 'pickup_scanned', 1, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'picked_up', `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C45. a dispatcher may record a pickup event', async () => {
    const c = await newConsignment(tenantA)
    const r = await eventAs(dispatcherA, c.cid, 'pickup_scanned', 1, nx('ev'), null)
    expect(r && r.ok === true && r.status === 'picked_up', `reply ${JSON.stringify(r)}`)
  })

  await gatedCase('C46. finance and viewer are refused events and the row is unchanged', async () => {
    const c = await newConsignment(tenantA)
    await gather([
      ['finance', async () => {
        expect(await refusedOrNotOk(eventAs(financeA, c.cid, 'pickup_scanned', 1, nx('ev'), null)), 'finance recorded an event')
      }],
      ['viewer', async () => {
        expect(await refusedOrNotOk(eventAs(viewerA, c.cid, 'pickup_scanned', 1, nx('ev'), null)), 'viewer recorded an event')
      }],
    ])
    await expectUnchanged(c.cid, 'created', 1)
  })

  await gatedCase("C47. an event on another agency's consignment is refused with 'not_found' and changes nothing", async () => {
    const c = await newConsignment(tenantA)
    const r = await eventAs(ownerB, c.cid, 'pickup_scanned', 1, nx('ev'), null)
    expectError(r, 'not_found')
    await expectUnchanged(c.cid, 'created', 1)
  })

  await gatedCase('C48. a revoked dispatcher and suspended-agency staff cannot record events on this agency', async () => {
    const c = await newConsignment(tenantA)
    await gather([
      ['revoked dispatcher', async () => {
        expect(await refusedOrNotOk(eventAs(revokedA, c.cid, 'pickup_scanned', 1, nx('ev'), null)), 'a revoked member recorded an event')
      }],
      ['suspended staff', async () => {
        expect(await refusedOrNotOk(eventAs(suspendedStaffS, c.cid, 'pickup_scanned', 1, nx('ev'), null)), 'suspended-agency staff recorded an event')
      }],
    ])
    await expectUnchanged(c.cid, 'created', 1)
  })

  // =========================================================================
  // D. Row-level security and direct writes
  // =========================================================================
  await gatedCase('C49. owner, dispatcher, fleet_manager, finance and viewer read every consignment of their agency', async () => {
    await newConsignment(tenantA)
    const total = await totalCount('agency_consignments', agencyA)
    expect(total >= 1, 'precondition: no consignments seeded for agency A')
    const failures = []
    for (const [label, who] of [
      ['owner', ownerA],
      ['dispatcher', dispatcherA],
      ['fleet_manager', fleetA],
      ['finance', financeA],
      ['viewer', viewerA],
    ]) {
      const n = await visibleCount(who, 'agency_consignments', agencyA)
      if (n !== total) failures.push(`${label} sees ${n} of ${total}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase("C50. another agency's owner and dispatcher see 0 consignments of agency A", async () => {
    await newConsignment(tenantA)
    const dispatcherB = await seedStaff(agencyB, 'ct-dispatcher-b', 'dispatcher')
    const failures = []
    for (const [label, who] of [
      ['owner B', ownerB],
      ['dispatcher B', dispatcherB],
    ]) {
      const n = await visibleCount(who, 'agency_consignments', agencyA)
      if (n !== 0) failures.push(`${label} sees ${n}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C51. revoked members, suspended-agency staff and users with no agency see 0 consignments of agency A', async () => {
    await newConsignment(tenantA)
    const failures = []
    for (const [label, who] of [
      ['revoked dispatcher', revokedA],
      ['suspended staff', suspendedStaffS],
      ['no agency', noAgency],
    ]) {
      const n = await visibleCount(who, 'agency_consignments', agencyA)
      if (n !== 0) failures.push(`${label} sees ${n}`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C52. anon reads no consignments (an error or zero rows both count as no access)', async () => {
    await newConsignment(tenantA)
    let n = 0
    try {
      n = Number((await asAnon(`SELECT count(*)::int AS n FROM public.agency_consignments`)).rows[0].n)
    } catch {
      n = 0
    }
    expect(n === 0, `anon saw ${n} consignment rows`)
  })

  await gatedCase('C53. a direct INSERT into agency_consignments by the owner is refused and writes nothing', async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune)
    const before = await totalCount('agency_consignments', agencyA)
    const out = await dmlOutcome(
      ownerA,
      `INSERT INTO public.agency_consignments (id, agency_id, order_id, gr_number, status, qr_token, idempotency_key)
       VALUES ($1, $2, $3, 'AGY/HACK/000001', 'created', 'hack-token', $4)`,
      [uid(), agencyA, order.orderId, nx('hack-key')]
    )
    expect(out.error !== undefined, `direct INSERT was accepted: ${JSON.stringify(out)}`)
    expect((await totalCount('agency_consignments', agencyA)) === before, 'a direct INSERT changed the table')
  })

  await gatedCase('C54. a direct UPDATE of consignment status by a dispatcher is refused and the status is unchanged', async () => {
    const c = await newConsignment(tenantA)
    const out = await dmlOutcome(
      dispatcherA,
      `UPDATE public.agency_consignments SET status = 'disputed', version = version + 1 WHERE id = $1`,
      [c.cid]
    )
    expect(out.error !== undefined, `direct UPDATE was accepted: ${JSON.stringify(out)}`)
    await expectUnchanged(c.cid, 'created', 1)
  })

  await gatedCase('C55. a direct DELETE of a consignment by the owner is refused and the row remains', async () => {
    const c = await newConsignment(tenantA)
    const out = await dmlOutcome(ownerA, `DELETE FROM public.agency_consignments WHERE id = $1`, [c.cid])
    expect(out.error !== undefined, `direct DELETE was accepted: ${JSON.stringify(out)}`)
    expect((await consignmentRow(c.cid)) !== undefined, 'the consignment row was deleted')
  })

  await gatedCase('C56. authenticated cannot write agency_gr_sequences or agency_consignment_events directly (insert, update, delete)', async () => {
    const c = await newConsignment(tenantA)
    await driveTo(ownerA, c.cid, 'picked_up')
    const eventsBefore = await eventRowCount(c.cid)
    const seqBefore = await suOne(`SELECT last_seq FROM public.agency_gr_sequences WHERE agency_id = $1`, [agencyA])
    const forged = await dmlOutcome(
      ownerA,
      `INSERT INTO public.agency_consignment_events (id, consignment_id, agency_id, event, from_status, to_status, actor, note)
       VALUES ($1, $2, $3, 'forged', 'created', 'picked_up', $4, NULL)`,
      [uid(), c.cid, agencyA, ownerA]
    )
    const erased = await dmlOutcome(ownerA, `DELETE FROM public.agency_consignment_events WHERE consignment_id = $1`, [c.cid])
    const bumped = await dmlOutcome(
      ownerA,
      `UPDATE public.agency_gr_sequences SET last_seq = last_seq + 100 WHERE agency_id = $1`,
      [agencyA]
    )
    const failures = []
    if (forged.error === undefined) failures.push('direct INSERT into events was accepted')
    if (erased.error === undefined) failures.push('direct DELETE from events was accepted')
    if (bumped.error === undefined) failures.push('direct UPDATE of agency_gr_sequences was accepted')
    if ((await eventRowCount(c.cid)) !== eventsBefore) failures.push('the events row count changed')
    const seqAfter = await suOne(`SELECT last_seq FROM public.agency_gr_sequences WHERE agency_id = $1`, [agencyA])
    if (JSON.stringify(seqAfter) !== JSON.stringify(seqBefore)) failures.push('the GR sequence changed')
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // Opus review hardening (C57+)
  // =========================================================================
  async function asServiceRole(sql, params) {
    await db.exec('RESET ROLE')
    await db.exec('SET ROLE service_role')
    try {
      await db.query(sql, params)
      return true
    } catch {
      return false
    } finally {
      await actAsService()
    }
  }
  async function suAccepted(sql, params) {
    try {
      await su(sql, params)
      return true
    } catch {
      return false
    }
  }

  await gatedCase('C57. events are append-only: UPDATE and DELETE are refused even for superuser and service_role', async () => {
    const c = await newConsignment(tenantA)
    const before = await eventRowCount(c.cid)
    const failures = []
    const upd = `UPDATE public.agency_consignment_events SET note = 'x' WHERE consignment_id = $1`
    const del = `DELETE FROM public.agency_consignment_events WHERE consignment_id = $1`
    if (await suAccepted(upd, [c.cid])) failures.push('superuser UPDATE accepted')
    if (await suAccepted(del, [c.cid])) failures.push('superuser DELETE accepted')
    if (await asServiceRole(upd, [c.cid])) failures.push('service_role UPDATE accepted')
    if (await asServiceRole(del, [c.cid])) failures.push('service_role DELETE accepted')
    if ((await eventRowCount(c.cid)) !== before) failures.push('events row count changed')
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C58. gr_number, qr_token, order_id and agency_id are frozen for every role', async () => {
    const c = await newConsignment(tenantA)
    const other = await seedOrderTree(agencyA, agrA, siteAPune)
    const failures = []
    const attempts = [
      ['gr_number', `UPDATE public.agency_consignments SET gr_number = 'AGY/2000-01/999999' WHERE id = $1`, [c.cid]],
      ['qr_token', `UPDATE public.agency_consignments SET qr_token = 'forged' WHERE id = $1`, [c.cid]],
      ['order_id', `UPDATE public.agency_consignments SET order_id = $2 WHERE id = $1`, [c.cid, other.orderId]],
      ['agency_id', `UPDATE public.agency_consignments SET agency_id = $2 WHERE id = $1`, [c.cid, agencyB]],
    ]
    for (const [label, sql, params] of attempts) {
      if (await suAccepted(sql, params)) failures.push(`superuser changed ${label}`)
    }
    if (await asServiceRole(`UPDATE public.agency_consignments SET gr_number = 'AGY/2000-01/999998' WHERE id = $1`, [c.cid])) {
      failures.push('service_role changed gr_number')
    }
    const row = await consignmentRow(c.cid)
    if (row.gr_number !== c.gr || row.agency_id !== agencyA || row.order_id !== c.orderId) failures.push('identity changed')
    const ev = await eventAs(ownerA, c.cid, 'pickup_scanned', 1, nx('c58'))
    if (!(ev && ev.ok === true)) failures.push('legal status update was blocked: ' + JSON.stringify(ev))
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C59. deleting an agency still cascades through consignments and events despite the guards', async () => {
    const ownerX = await createUser('c59-owner')
    const agencyX = await createAgencyRow(ownerX, 'C59 Agency', 'approved')
    const agrX = await seedAgreement(agencyX, 'C59 Client')
    await seedSite(agencyX, agrX, 'bill_to', 'HO')
    const siteX = await seedSite(agencyX, agrX, 'ship_to', 'Depot')
    const order = await seedOrderTree(agencyX, agrX, siteX)
    const r = await createAs(ownerX, order.orderId, nx('c59'))
    expect(r && r.ok === true, 'precondition: create refused ' + JSON.stringify(r))
    await su(`DELETE FROM public.transport_agencies WHERE id = $1`, [agencyX])
    expect(Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_consignments WHERE agency_id = $1`, [agencyX])).n) === 0, 'consignments remain')
    expect(Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_consignment_events WHERE agency_id = $1`, [agencyX])).n) === 0, 'events remain')
  })

  await gatedCase('C60. qr_token cannot be selected by any authenticated scope, other columns still can', async () => {
    const c = await newConsignment(tenantA)
    const failures = []
    for (const [label, who] of [['owner', ownerA], ['dispatcher', dispatcherA], ['finance', financeA], ['viewer', viewerA]]) {
      const direct = await dmlOutcome(who, `SELECT qr_token FROM public.agency_consignments WHERE id = $1`, [c.cid])
      if (direct.error === undefined) failures.push(`${label} read qr_token`)
      const star = await dmlOutcome(who, `SELECT * FROM public.agency_consignments WHERE id = $1`, [c.cid])
      if (star.error === undefined) failures.push(`${label} SELECT * succeeded`)
      const ok = await dmlOutcome(who, `SELECT id, gr_number, status, version FROM public.agency_consignments WHERE id = $1`, [c.cid])
      if (ok.error !== undefined || ok.rows.length !== 1) failures.push(`${label} lost access to ordinary columns`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C61. agency_consignment_qr returns the token to owner and dispatcher only; others get typed refusals', async () => {
    const c = await newConsignment(tenantA)
    const stored = (await suOne(`SELECT qr_token FROM public.agency_consignments WHERE id = $1`, [c.cid])).qr_token
    const qr = (who, id) =>
      asActor(who, async () => parseJson((await db.query(`SELECT public.agency_consignment_qr($1::uuid) AS r`, [id])).rows[0].r))
    const failures = []
    for (const [label, who] of [['owner', ownerA], ['dispatcher', dispatcherA]]) {
      const r = await qr(who, c.cid)
      if (!(r && r.ok === true && r.qr_token === stored)) failures.push(`${label}: ${JSON.stringify(r)}`)
    }
    for (const [label, who] of [['fleet_manager', fleetA], ['finance', financeA], ['viewer', viewerA]]) {
      const r = await qr(who, c.cid)
      if (!(r && r.ok === false && r.error === 'forbidden_scope')) failures.push(`${label} not forbidden: ${JSON.stringify(r)}`)
    }
    const cross = await qr(ownerB, c.cid)
    if (!(cross && cross.ok === false && cross.error === 'not_found')) failures.push('cross-agency: ' + JSON.stringify(cross))
    const missing = await qr(ownerA, uid())
    if (!(missing && missing.ok === false && missing.error === 'not_found')) failures.push('missing: ' + JSON.stringify(missing))
    if (!(await refusedOrNotOk(qr(revokedA, c.cid)))) failures.push('revoked member was served the token')
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C62. financial year is computed in Asia/Kolkata and the commands pin search_path with pg_temp', async () => {
    const rows = (await su(
      `SELECT proname, pg_get_functiondef(oid) AS def, proconfig::text AS cfg FROM pg_proc
       WHERE pronamespace = 'public'::regnamespace AND proname LIKE 'agency_consignment%'`
    )).rows
    const byName = Object.fromEntries(rows.map((r) => [r.proname, r]))
    const failures = []
    const createDef = (byName.agency_consignment_create && byName.agency_consignment_create.def) || ''
    if (!/Asia\/Kolkata/.test(createDef)) failures.push('create does not use Asia/Kolkata')
    if (/current_date/.test(createDef)) failures.push('create still uses current_date')
    for (const n of ['agency_consignment_create', 'agency_consignment_event', 'agency_consignment_qr']) {
      if (!/pg_temp/.test((byName[n] && byName[n].cfg) || '')) failures.push(`${n} search_path lacks pg_temp`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await gatedCase('C63. idempotency keys over 200 chars are refused with key_too_long (create and event); 200 is accepted', async () => {
    const order = await seedOrderTree(agencyA, agrA, siteAPune)
    const tooLong = 'k'.repeat(201)
    expectError(await createAs(ownerA, order.orderId, tooLong), 'key_too_long')
    expect((await consignmentsForOrder(order.orderId)) === 0, 'a consignment was created with an over-long key')
    const made = await createAs(ownerA, order.orderId, 'k'.repeat(200))
    expect(made && made.ok === true, 'a 200-char key was refused: ' + JSON.stringify(made))
    const before = await eventRowCount(made.consignment_id)
    expectError(await eventAs(ownerA, made.consignment_id, 'pickup_scanned', 1, tooLong), 'key_too_long')
    expect((await eventRowCount(made.consignment_id)) === before, 'an event was written with an over-long key')
    await expectUnchanged(made.consignment_id, 'created', 1)
    const fine = await eventAs(ownerA, made.consignment_id, 'pickup_scanned', 1, 'e'.repeat(200))
    expect(fine && fine.ok === true, 'a 200-char event key was refused: ' + JSON.stringify(fine))
  })

  await gatedCase('C64. note is trimmed before storage and before the 500-char limit', async () => {
    const c = await newConsignment(tenantA)
    const r1 = await eventAs(ownerA, c.cid, 'pickup_scanned', 1, nx('c64a'), '   loaded at dock 3   ')
    expect(r1 && r1.ok === true, 'event refused: ' + JSON.stringify(r1))
    const row = await suOne(
      `SELECT note FROM public.agency_consignment_events WHERE consignment_id = $1 AND event = 'pickup_scanned'`,
      [c.cid]
    )
    expect(row.note === 'loaded at dock 3', `note stored as ${JSON.stringify(row.note)}`)
    const r2 = await eventAs(ownerA, c.cid, 'transit_started', 2, nx('c64b'), '   ' + 'n'.repeat(500) + '   ')
    expect(r2 && r2.ok === true, 'a padded 500-char note was refused: ' + JSON.stringify(r2))
    expectError(await eventAs(ownerA, c.cid, 'delivery_scanned', 3, nx('c64c'), 'n'.repeat(501)), 'note_too_long')
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
