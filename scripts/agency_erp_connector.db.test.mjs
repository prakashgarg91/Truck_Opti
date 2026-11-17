#!/usr/bin/env node
/**
 * Agency ERP connector (TO-151) — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain and drives the commands the way PostgREST does
 * per request: `SET ROLE authenticated` with `request.jwt.claims` set to the
 * caller's sub, and the service role for erp_event_ingest.
 *
 * The migration that implements this contract is NOT written yet
 * (supabase/migrations/20261024000000_agency_erp_connector.sql). Every case that
 * needs the new tables or commands is EXPECTED to fail now, with the reason
 * "does not exist" (never a silent refusal).
 *
 * Pinned contract under test:
 *
 *   Tables
 *     agency_erp_connections(id, agency_id, client_id (the client's agency_client_agreements id), agreement_id ->
 *       agency_client_agreements, name, kind 'csv_drop'|'webhook', status 'active'|'paused'|'revoked',
 *       secret_hash text (sha256 hex, never the secret), secret_hint text (last 4 chars),
 *       version int default 1, created_at)  UNIQUE (agency_id, name)
 *     agency_erp_events(id, connection_id, agency_id, external_event_id text, payload_hash text,
 *       outcome 'accepted'|'rejected'|'duplicate', problems jsonb, batch_id uuid null, received_at)
 *       UNIQUE (connection_id, external_event_id)
 *     RLS on. SELECT for owner and dispatcher scopes only. authenticated has NO SELECT on
 *     secret_hash and no direct writes on either table.
 *
 *   public.agency_erp_connection_create(p_client_id uuid, p_agreement_id uuid, p_name text,
 *     p_kind text, p_idempotency_key text) RETURNS jsonb
 *     - Returns {ok:true, connection_id, secret} with the plaintext secret EXACTLY ONCE.
 *     - Errors: client_not_found, agreement_not_active, invalid_kind, name_exists, name_required.
 *     - Same key replays the same connection WITHOUT the secret: {ok:true, connection_id,
 *       secret:null, replay:true}.
 *   public.agency_erp_connection_set_status(p_connection_id uuid, p_to_status text,
 *     p_expected_version int) RETURNS jsonb
 *     - active<->paused, any->revoked; revoked is terminal ('illegal_transition');
 *       stale version 'version_conflict'.
 *   public.agency_erp_connection_rotate_secret(p_connection_id uuid, p_expected_version int)
 *     RETURNS jsonb — new secret once; old hash no longer verifies; revoked -> 'connection_revoked'.
 *   public.erp_event_ingest(p_connection_id uuid, p_secret text, p_external_event_id text,
 *     p_lines jsonb) RETURNS jsonb — service role only.
 *     - Wrong or unknown credentials: 'bad_credentials' (identical answer for both).
 *     - Paused or revoked: 'connection_not_active'.
 *     - Same external id + same payload: outcome 'duplicate', no second batch.
 *     - Same external id + different payload: 'event_id_reused'.
 *     - Invalid lines: outcome 'rejected' with problems, no orders created.
 *     - More than 2000 lines: 'too_many_lines'.
 *     - Failed secret never creates an events row.
 *
 * Scope rules for the commands: owner always; dispatcher allowed; fleet_manager, finance and
 * viewer get 'forbidden_scope'. Other agencies, suspended agencies and users with no agency are refused.
 *
 * Assumptions flagged for the implementer (not pinned by the brief):
 *   - Client model: agency_client_agreements (public.agency_clients does not exist and will not be
 *     created). p_client_id is the client's agreement id, as agency_orders refers to the client.
 *   - The ingest return shape is not pinned: cases read `ok`, `error`, and the events table.
 *   - Refusals may be raised (RAISE EXCEPTION) or returned as {ok:false}; both are read.
 *
 * Evidence class: local DB only (PGlite, single session). Hosted PostgREST behaviour is NOT covered.
 *
 * Usage:  node scripts/agency_erp_connector.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1. A missing PGlite install is a loud failure.
 */

import { createHash, randomBytes } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const ERP_MIGRATION = '20261024000000_agency_erp_connector.sql'

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

/** Per-case resilience: a failing assertion records FAIL and the battery keeps running. */
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
const SCOPE_MSG = 'Your access scope does not allow this action.'
const SUSPENDED_MSG = 'Agency approval is required.'
const NO_PROFILE_MSG = 'No agency profile found for this account.'

/** Refused: returned ok:false, or raised (normalise() turns a raise into {ok:false, error, raised:true}). */
function refused(r) {
  return Boolean(r) && r.ok === false
}

/** Refused with a given code, either as r.error or as a raised message containing it. */
function refusedWith(r, code) {
  if (!refused(r) || typeof r.error !== 'string') return false
  return r.error === code || r.error.includes(code)
}

function scopeRefusal(r) {
  return refused(r) && (refusedWith(r, 'forbidden_scope') || r.error === SCOPE_MSG)
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
// Fixtures (superuser). Only pre-existing tables are touched in setup, so the setup
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

// Fixture handles, assigned in setupFixtures() and ensureClients().
let ownerA, ownerB, ownerS, agencyA, agencyB, agencyS
let agrA, agrAEnded, agrB, agrS
let dispatcherA, fleetA, financeA, viewerA, revokedA, suspendedStaffS, noAgency
let clientA = null
let clientB = null

async function setupFixtures() {
  ownerA = await createUser('erp-owner-a')
  agencyA = await createAgencyRow(ownerA, 'ERP A', 'approved')
  ownerB = await createUser('erp-owner-b')
  agencyB = await createAgencyRow(ownerB, 'ERP B', 'approved')
  ownerS = await createUser('erp-owner-s')
  agencyS = await createAgencyRow(ownerS, 'ERP S', 'suspended')

  agrA = await seedAgreement(agencyA, 'Acme Cement')
  agrAEnded = await seedAgreement(agencyA, 'Acme Retired', 'ended')
  agrB = await seedAgreement(agencyB, 'Beta Logistics')
  agrS = await seedAgreement(agencyS, 'Gamma Goods')

  await seedSite(agencyA, agrA, 'bill_to', 'Head Office')
  await seedSite(agencyA, agrA, 'ship_to', 'Pune Depot')
  await seedSite(agencyA, agrAEnded, 'bill_to', 'Head Office')
  await seedSite(agencyA, agrAEnded, 'ship_to', 'Pune Depot')
  await seedSite(agencyB, agrB, 'bill_to', 'Head Office')
  await seedSite(agencyB, agrB, 'ship_to', 'Pune Depot')
  await seedSite(agencyS, agrS, 'bill_to', 'Head Office')
  await seedSite(agencyS, agrS, 'ship_to', 'Plant S')

  dispatcherA = await seedStaff(agencyA, 'erp-dispatcher', 'dispatcher')
  fleetA = await seedStaff(agencyA, 'erp-fleet', 'fleet_manager')
  financeA = await seedStaff(agencyA, 'erp-finance', 'finance')
  viewerA = await seedStaff(agencyA, 'erp-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'erp-revoked', 'dispatcher', 'revoked')
  suspendedStaffS = await seedStaff(agencyS, 'erp-suspended', 'dispatcher')
  noAgency = await createUser('erp-no-agency')
}

/**
 * Client model: the client is an agency_client_agreements row (no separate client party table;
 * agency_orders refers to the client by agreement_id). p_client_id is the client's agreement id.
 */
async function ensureClients() {
  if (clientA) return
  clientA = agrA
  clientB = agrB
}

// ---------------------------------------------------------------------------
// Command wrappers, invocation helpers and line builders
// ---------------------------------------------------------------------------
const CREATE_SQL = `SELECT public.agency_erp_connection_create($1::uuid, $2::uuid, $3::text, $4::text, $5::text) AS r`
const STATUS_SQL = `SELECT public.agency_erp_connection_set_status($1::uuid, $2::text, $3::int) AS r`
const ROTATE_SQL = `SELECT public.agency_erp_connection_rotate_secret($1::uuid, $2::int) AS r`
const INGEST_SQL = `SELECT public.erp_event_ingest($1::uuid, $2::text, $3::text, $4::jsonb) AS r`

/**
 * Normalises one command result to an object. A raised exception becomes
 * {ok:false, error:<message>, raised:true}, EXCEPT when the object is missing
 * ("does not exist"): that is rethrown so a missing contract is never read as a refusal.
 */
async function normalise(sql, params) {
  try {
    const v = parseJson((await db.query(sql, params)).rows[0].r)
    return v && typeof v === 'object' ? v : { ok: false, error: 'non_object_result' }
  } catch (error) {
    const msg = firstLine(error)
    if (/does not exist/i.test(msg)) throw error
    return { ok: false, error: msg, raised: true }
  }
}

function rpcAs(userId, sql, params) {
  return asActor(userId, () => normalise(sql, params))
}

async function rpcService(sql, params) {
  await actAsService()
  return normalise(sql, params)
}

async function rpcAnon(sql, params) {
  try {
    return await asAnon(sql, params).then(() => ({ ok: true, error: null }))
  } catch (error) {
    const msg = firstLine(error)
    if (/does not exist/i.test(msg)) throw error
    return { ok: false, error: msg, raised: true }
  }
}

function createAs(userId, clientId, agreementId, name, kind, key) {
  return rpcAs(userId, CREATE_SQL, [clientId, agreementId, name, kind, key])
}

function setStatusAs(userId, connId, toStatus, expectedVersion) {
  return rpcAs(userId, STATUS_SQL, [connId, toStatus, expectedVersion])
}

function rotateAs(userId, connId, expectedVersion) {
  return rpcAs(userId, ROTATE_SQL, [connId, expectedVersion])
}

function ingest(connId, secret, extId, lines) {
  return rpcService(INGEST_SQL, [connId, secret, extId, JSON.stringify(lines)])
}

/** Creates a connection for the owner (or given user) and throws if the setup itself is refused. */
async function newConnection(userId, { client = null, agreement = agrA, kind = 'csv_drop', name = null } = {}) {
  await ensureClients()
  const n = name ?? nx('erp-conn')
  const res = await createAs(userId, client ?? clientA, agreement, n, kind, nx('erp-key'))
  if (!res.ok) throw new Error(`setup: connection create refused: ${res.error}`)
  return { connId: res.connection_id, secret: res.secret, name: n }
}

/** DML as an actor; resolves to the error message, or null when the statement succeeded. */
async function dmlError(who, sql, params) {
  return asActor(who, async () => {
    try {
      await db.query(sql, params)
      return null
    } catch (error) {
      const m = firstLine(error)
      if (/does not exist/i.test(m)) throw error
      return m
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

/** Anon read count: permission denied counts as zero visible rows; anything else is a real failure. */
async function anonVisible(table, agencyId) {
  try {
    return (await asAnon(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])).rows[0].n
  } catch (error) {
    if (/permission denied/i.test(firstLine(error))) return 0
    throw error
  }
}

async function connRow(connId) {
  return suOne(`SELECT * FROM public.agency_erp_connections WHERE id = $1`, [connId])
}

async function versionOf(connId) {
  return (await suOne(`SELECT version FROM public.agency_erp_connections WHERE id = $1`, [connId])).version
}

async function statusOf(connId) {
  return (await suOne(`SELECT status FROM public.agency_erp_connections WHERE id = $1`, [connId])).status
}

async function eventRows(connId, extId) {
  return (
    await su(
      `SELECT outcome, batch_id, payload_hash, problems FROM public.agency_erp_events
        WHERE connection_id = $1 AND external_event_id = $2`,
      [connId, extId]
    )
  ).rows
}

async function batchCountByKey(key) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_order_batches WHERE idempotency_key = $1`, [key])).n
}

async function ordersByRef(ref) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_orders WHERE client_order_ref = $1`, [ref])).n
}

async function connCountByName(name) {
  return (await suOne(`SELECT count(*)::int AS n FROM public.agency_erp_connections WHERE name = $1`, [name])).n
}

/** A complete valid line. Pickup = bill-to 'Head Office', drop = ship-to 'Pune Depot' of the agreement. */
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

const sha256Hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

/** Function-definition helper: exact identity arguments, jsonb result, SECURITY DEFINER, pinned search_path. */
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

/** Execute grants for one function signature: which roles may run it. */
async function grantState(sig) {
  return suOne(
    `SELECT has_function_privilege('authenticated', $1::text, 'EXECUTE') AS auth_ok,
            has_function_privilege('service_role', $1::text, 'EXECUTE') AS svc_ok,
            has_function_privilege('anon', $1::text, 'EXECUTE') AS anon_ok,
            EXISTS (
              SELECT 1 FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               WHERE p.oid = $2::regprocedure AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
            ) AS public_ok`,
    [sig, sig]
  )
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
  console.log(`contract migration present: ${applied.includes(ERP_MIGRATION)} (${ERP_MIGRATION})`)
  await setupFixtures()

  // =========================================================================
  // S. Schema, privileges and definitions
  // =========================================================================
  await testCase('X01. agency_erp_connections and agency_erp_events exist with row-level security on', async () => {
    const rows = (
      await su(
        `SELECT c.relname, c.relrowsecurity FROM pg_class c
          WHERE c.oid IN ('public.agency_erp_connections'::regclass, 'public.agency_erp_events'::regclass)`
      )
    ).rows
    expect(rows.length === 2, `found ${rows.length} of 2 tables`)
    expect(rows.every((r) => r.relrowsecurity === true), 'row-level security is not enabled on both tables')
  })

  await testCase('X02. unique (agency_id, name) on connections and unique (connection_id, external_event_id) on events', async () => {
    const defs = (
      await su(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
          WHERE contype = 'u' AND conrelid IN ('public.agency_erp_connections'::regclass, 'public.agency_erp_events'::regclass)`
      )
    ).rows.map((d) => d.def.replace(/\s+/g, '').toLowerCase())
    expect(defs.some((d) => d.includes('(agency_id,name)')), `no unique(agency_id, name): ${JSON.stringify(defs)}`)
    expect(
      defs.some((d) => d.includes('(connection_id,external_event_id)')),
      `no unique(connection_id, external_event_id): ${JSON.stringify(defs)}`
    )
  })

  await testCase('X03. CHECK constraints pin kind (csv_drop, webhook) and status (active, paused, revoked)', async () => {
    const text = (
      await su(
        `SELECT string_agg(pg_get_constraintdef(oid), ' ') AS t FROM pg_constraint
          WHERE contype = 'c' AND conrelid = 'public.agency_erp_connections'::regclass`
      )
    ).rows[0].t || ''
    const missing = ['csv_drop', 'webhook', 'active', 'paused', 'revoked'].filter((v) => !text.includes(`'${v}'`))
    expect(missing.length === 0, `CHECK does not mention: ${missing.join(', ')}`)
  })

  await testCase('X04. both tables carry the contract columns', async () => {
    const cols = (
      await su(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name IN ('agency_erp_connections', 'agency_erp_events')`
      )
    ).rows
    const have = new Set(cols.map((c) => `${c.table_name}.${c.column_name}`))
    const want = [
      'agency_erp_connections.id', 'agency_erp_connections.agency_id', 'agency_erp_connections.client_id',
      'agency_erp_connections.agreement_id', 'agency_erp_connections.name', 'agency_erp_connections.kind',
      'agency_erp_connections.status', 'agency_erp_connections.secret_hash', 'agency_erp_connections.secret_hint',
      'agency_erp_connections.version', 'agency_erp_connections.created_at',
      'agency_erp_events.id', 'agency_erp_events.connection_id', 'agency_erp_events.agency_id',
      'agency_erp_events.external_event_id', 'agency_erp_events.payload_hash', 'agency_erp_events.outcome',
      'agency_erp_events.problems', 'agency_erp_events.batch_id', 'agency_erp_events.received_at',
    ]
    const missing = want.filter((w) => !have.has(w))
    expect(missing.length === 0, `missing columns: ${missing.join(', ')}`)
  })

  await testCase('X05. authenticated has no SELECT on secret_hash, and a direct select of it is refused', async () => {
    await ensureClients()
    const c = await newConnection(ownerA)
    const priv = await suOne(
      `SELECT has_column_privilege('authenticated', 'public.agency_erp_connections', 'secret_hash', 'SELECT') AS ok`
    )
    expect(priv.ok === false, 'authenticated holds SELECT on agency_erp_connections.secret_hash')
    const err = await dmlError(ownerA, `SELECT secret_hash FROM public.agency_erp_connections WHERE id = $1`, [c.connId])
    expect(err !== null, 'owner could select secret_hash directly')
  })

  await testCase('X06. authenticated holds no INSERT, UPDATE or DELETE privilege on either table', async () => {
    const failures = []
    for (const t of ['agency_erp_connections', 'agency_erp_events']) {
      for (const p of ['INSERT', 'UPDATE', 'DELETE']) {
        const r = await suOne(`SELECT has_table_privilege('authenticated', $1, $2) AS ok`, [`public.${t}`, p])
        if (r.ok) failures.push(`${t} ${p}`)
      }
    }
    expect(failures.length === 0, `authenticated still holds: ${failures.join(', ')}`)
  })

  await testCase('X07. a direct INSERT into agency_erp_connections by the owner is refused', async () => {
    await ensureClients()
    const err = await dmlError(
      ownerA,
      `INSERT INTO public.agency_erp_connections (id, agency_id, client_id, agreement_id, name, kind, status, secret_hash, secret_hint)
       VALUES ($1, $2, $3, $4, $5, 'csv_drop', 'active', $6, 'abcd')`,
      [uid(), agencyA, clientA, agrA, nx('direct-insert'), 'f'.repeat(64)]
    )
    expect(err !== null, 'direct INSERT was accepted')
  })

  await testCase('X08. anon reads zero connections and zero events', async () => {
    const n1 = await anonVisible('agency_erp_connections', agencyA)
    const n2 = await anonVisible('agency_erp_events', agencyA)
    expect(n1 === 0 && n2 === 0, `anon sees connections=${n1} events=${n2}`)
  })

  await testCase('X09. create, set_status and rotate: EXECUTE for authenticated and service_role only', async () => {
    const sigs = [
      'public.agency_erp_connection_create(uuid,uuid,text,text,text)',
      'public.agency_erp_connection_set_status(uuid,text,integer)',
      'public.agency_erp_connection_rotate_secret(uuid,integer)',
    ]
    const failures = []
    for (const sig of sigs) {
      const g = await grantState(sig)
      if (!g.auth_ok) failures.push(`${sig}: authenticated lacks EXECUTE`)
      if (!g.svc_ok) failures.push(`${sig}: service_role lacks EXECUTE`)
      if (g.anon_ok) failures.push(`${sig}: anon has EXECUTE`)
      if (g.public_ok) failures.push(`${sig}: PUBLIC has EXECUTE`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('X10. erp_event_ingest: EXECUTE for service_role only (authenticated, anon and PUBLIC refused)', async () => {
    const g = await grantState('public.erp_event_ingest(uuid,text,text,jsonb)')
    const failures = []
    if (g.auth_ok) failures.push('authenticated has EXECUTE')
    if (!g.svc_ok) failures.push('service_role lacks EXECUTE')
    if (g.anon_ok) failures.push('anon has EXECUTE')
    if (g.public_ok) failures.push('PUBLIC has EXECUTE')
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('X11. all four commands: exact arguments, jsonb result, SECURITY DEFINER, pinned search_path, no agency argument', async () => {
    await gather([
      ['create', async () => {
        const f = await rpcDefinitionFailures(
          'agency_erp_connection_create',
          'p_client_id uuid, p_agreement_id uuid, p_name text, p_kind text, p_idempotency_key text'
        )
        expect(f.length === 0, f.join('; '))
      }],
      ['set_status', async () => {
        const f = await rpcDefinitionFailures('agency_erp_connection_set_status', 'p_connection_id uuid, p_to_status text, p_expected_version integer')
        expect(f.length === 0, f.join('; '))
      }],
      ['rotate', async () => {
        const f = await rpcDefinitionFailures('agency_erp_connection_rotate_secret', 'p_connection_id uuid, p_expected_version integer')
        expect(f.length === 0, f.join('; '))
      }],
      ['ingest', async () => {
        const f = await rpcDefinitionFailures('erp_event_ingest', 'p_connection_id uuid, p_secret text, p_external_event_id text, p_lines jsonb')
        expect(f.length === 0, f.join('; '))
      }],
    ])
  })

  // =========================================================================
  // C. Connection create
  // =========================================================================
  await testCase('X12. owner creates a csv_drop connection: ok, connection_id, and a secret of at least 32 characters', async () => {
    await ensureClients()
    const r = await createAs(ownerA, clientA, agrA, nx('erp-create'), 'csv_drop', nx('erp-key'))
    expect(r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
    expect(typeof r.connection_id === 'string' && UUID_RE.test(r.connection_id), `connection_id ${JSON.stringify(r.connection_id)}`)
    expect(typeof r.secret === 'string' && r.secret.length >= 32, `secret length ${r.secret ? r.secret.length : 'none'}`)
  })

  await testCase('X13. two creations return different random secrets', async () => {
    await ensureClients()
    const a = await createAs(ownerA, clientA, agrA, nx('erp-rand-a'), 'csv_drop', nx('erp-key'))
    const b = await createAs(ownerA, clientA, agrA, nx('erp-rand-b'), 'csv_drop', nx('erp-key'))
    expect(a.ok === true && b.ok === true, `creates refused: ${JSON.stringify(a)} ${JSON.stringify(b)}`)
    expect(a.secret !== b.secret, 'two creations returned the same secret')
  })

  await testCase('X14. stored secret_hash is the sha256 hex of the returned secret, never the secret itself', async () => {
    const c = await newConnection(ownerA)
    const row = await connRow(c.connId)
    expect(row.secret_hash === sha256Hex(c.secret), `secret_hash ${row.secret_hash} is not sha256 of the secret`)
    expect(row.secret_hash !== c.secret, 'secret_hash equals the plaintext secret')
  })

  await testCase('X15. stored row: agency, client, agreement, name, kind, status active, version 1, secret_hint = last 4 chars', async () => {
    const c = await newConnection(ownerA)
    const row = await connRow(c.connId)
    expect(row.agency_id === agencyA, `agency_id ${row.agency_id}`)
    expect(row.client_id === clientA, `client_id ${row.client_id}`)
    expect(row.agreement_id === agrA, `agreement_id ${row.agreement_id}`)
    expect(row.name === c.name, `name ${row.name}`)
    expect(row.kind === 'csv_drop', `kind ${row.kind}`)
    expect(row.status === 'active', `status ${row.status}`)
    expect(Number(row.version) === 1, `version ${row.version}`)
    expect(row.secret_hint === c.secret.slice(-4), `secret_hint ${row.secret_hint}`)
  })

  await testCase('X16. the plaintext secret is stored in no column of the connection row', async () => {
    const c = await newConnection(ownerA)
    const txt = (await suOne(`SELECT t::text AS txt FROM public.agency_erp_connections t WHERE id = $1`, [c.connId])).txt
    expect(!txt.includes(c.secret), 'plaintext secret found inside the stored connection row')
  })

  await testCase('X17. a webhook connection is accepted and stored with kind webhook', async () => {
    await ensureClients()
    const name = nx('erp-hook')
    const r = await createAs(ownerA, clientA, agrA, name, 'webhook', nx('erp-key'))
    expect(r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
    const row = await connRow(r.connection_id)
    expect(row.kind === 'webhook', `kind ${row.kind}`)
  })

  await testCase('X18. an unknown kind is refused with invalid_kind and no row is written', async () => {
    await ensureClients()
    const name = nx('erp-ftp')
    const r = await createAs(ownerA, clientA, agrA, name, 'ftp', nx('erp-key'))
    expect(refusedWith(r, 'invalid_kind'), `expected invalid_kind, got ${JSON.stringify(r)}`)
    expect((await connCountByName(name)) === 0, 'a row was written for the invalid kind')
  })

  await testCase('X19. a blank name is refused with name_required', async () => {
    await ensureClients()
    const r = await createAs(ownerA, clientA, agrA, '   ', 'csv_drop', nx('erp-key'))
    expect(refusedWith(r, 'name_required'), `expected name_required, got ${JSON.stringify(r)}`)
  })

  await testCase('X20. a 61-character name is refused with name_required', async () => {
    await ensureClients()
    const r = await createAs(ownerA, clientA, agrA, 'y'.repeat(61), 'csv_drop', nx('erp-key'))
    expect(refusedWith(r, 'name_required'), `expected name_required, got ${JSON.stringify(r)}`)
  })

  await testCase('X21. a 60-character name is accepted', async () => {
    await ensureClients()
    const name = 'z'.repeat(60)
    const r = await createAs(ownerA, clientA, agrA, name, 'csv_drop', nx('erp-key'))
    expect(r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
    expect((await connRow(r.connection_id)).name.length === 60, 'stored name is not 60 characters')
  })

  await testCase('X22. a second connection with the same name in the same agency is refused with name_exists', async () => {
    await ensureClients()
    const name = nx('erp-dup')
    const first = await createAs(ownerA, clientA, agrA, name, 'csv_drop', nx('erp-key'))
    expect(first.ok === true, `setup create refused: ${JSON.stringify(first)}`)
    const second = await createAs(ownerA, clientA, agrA, name, 'csv_drop', nx('erp-key'))
    expect(refusedWith(second, 'name_exists'), `expected name_exists, got ${JSON.stringify(second)}`)
    expect((await connCountByName(name)) === 1, 'duplicate name wrote a second row')
  })

  await testCase('X23. an unknown client is refused with client_not_found', async () => {
    await ensureClients()
    const r = await createAs(ownerA, uid(), agrA, nx('erp-noclient'), 'csv_drop', nx('erp-key'))
    expect(refusedWith(r, 'client_not_found'), `expected client_not_found, got ${JSON.stringify(r)}`)
  })

  await testCase('X24. another agency cannot create under agency A client: refused, no row for agency B', async () => {
    await ensureClients()
    const name = nx('erp-xclient')
    const r = await createAs(ownerB, clientA, agrB, name, 'csv_drop', nx('erp-key'))
    expect(refused(r), `expected a refusal, got ${JSON.stringify(r)}`)
    expect((await connCountByName(name)) === 0, 'a cross-tenant row was written')
  })

  await testCase('X25. an ended client agreement is refused with agreement_not_active', async () => {
    await ensureClients()
    const r = await createAs(ownerA, clientA, agrAEnded, nx('erp-ended'), 'csv_drop', nx('erp-key'))
    expect(refusedWith(r, 'agreement_not_active'), `expected agreement_not_active, got ${JSON.stringify(r)}`)
  })

  await testCase('X26. an agreement of another agency is refused and writes no row', async () => {
    await ensureClients()
    const name = nx('erp-xagr')
    const r = await createAs(ownerA, clientA, agrB, name, 'csv_drop', nx('erp-key'))
    expect(refused(r), `expected a refusal, got ${JSON.stringify(r)}`)
    expect((await connCountByName(name)) === 0, 'a row was written against another agency agreement')
  })

  await testCase('X27. same idempotency key replays the same connection with secret null and replay true', async () => {
    await ensureClients()
    const key = nx('erp-replay-key')
    const name = nx('erp-replay')
    const first = await createAs(ownerA, clientA, agrA, name, 'csv_drop', key)
    expect(first.ok === true && typeof first.secret === 'string', `setup create: ${JSON.stringify(first)}`)
    const second = await createAs(ownerA, clientA, agrA, name, 'csv_drop', key)
    expect(second.ok === true, `replay refused: ${JSON.stringify(second)}`)
    expect(second.connection_id === first.connection_id, 'replay returned a different connection')
    expect(second.secret == null, 'replay returned a secret')
    expect(second.replay === true, `replay flag ${second.replay}`)
  })

  await testCase('X28. an idempotent replay writes no second connection row', async () => {
    await ensureClients()
    const key = nx('erp-replay-once')
    const name = nx('erp-replay-once')
    await createAs(ownerA, clientA, agrA, name, 'csv_drop', key)
    await createAs(ownerA, clientA, agrA, name, 'csv_drop', key)
    expect((await connCountByName(name)) === 1, `rows for replayed create: ${await connCountByName(name)}`)
  })

  await testCase('X29. a dispatcher may create a connection', async () => {
    await ensureClients()
    const name = nx('erp-dispatch')
    const r = await createAs(dispatcherA, clientA, agrA, name, 'csv_drop', nx('erp-key'))
    expect(r.ok === true, `expected ok, got ${JSON.stringify(r)}`)
  })

  await testCase('X30. fleet_manager, finance and viewer get forbidden_scope on create, and no row is written', async () => {
    await ensureClients()
    const failures = []
    for (const [label, who] of [['fleet_manager', fleetA], ['finance', financeA], ['viewer', viewerA]]) {
      const name = nx(`erp-${label}`)
      const r = await createAs(who, clientA, agrA, name, 'csv_drop', nx('erp-key'))
      if (!scopeRefusal(r)) failures.push(`${label}: ${JSON.stringify(r)}`)
      if ((await connCountByName(name)) !== 0) failures.push(`${label}: row written`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('X31. revoked member, suspended-agency staff and a user with no agency are all refused on create', async () => {
    await ensureClients()
    const checks = [
      ['revoked member', revokedA, agrA],
      ['suspended-agency staff', suspendedStaffS, agrS],
      ['no agency', noAgency, agrA],
    ]
    const failures = []
    for (const [label, who, agr] of checks) {
      const name = nx('erp-blocked')
      const r = await createAs(who, clientA, agr, name, 'csv_drop', nx('erp-key'))
      if (!refused(r)) failures.push(`${label}: accepted`)
      if ((await connCountByName(name)) !== 0) failures.push(`${label}: row written`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('X32. creating a connection writes no ingest event row', async () => {
    const c = await newConnection(ownerA)
    const n = (await suOne(`SELECT count(*)::int AS n FROM public.agency_erp_events WHERE connection_id = $1`, [c.connId])).n
    expect(n === 0, `events written by create: ${n}`)
  })

  // =========================================================================
  // T. Status transitions
  // =========================================================================
  await testCase('X33. active to paused and back to active, each with the current version', async () => {
    const c = await newConnection(ownerA)
    const p = await setStatusAs(ownerA, c.connId, 'paused', await versionOf(c.connId))
    expect(p.ok === true, `active->paused: ${JSON.stringify(p)}`)
    expect((await statusOf(c.connId)) === 'paused', 'status is not paused')
    const a = await setStatusAs(ownerA, c.connId, 'active', await versionOf(c.connId))
    expect(a.ok === true, `paused->active: ${JSON.stringify(a)}`)
    expect((await statusOf(c.connId)) === 'active', 'status is not active')
  })

  await testCase('X34. active to revoked succeeds and bumps the version', async () => {
    const c = await newConnection(ownerA)
    const before = await versionOf(c.connId)
    const r = await setStatusAs(ownerA, c.connId, 'revoked', before)
    expect(r.ok === true, `active->revoked: ${JSON.stringify(r)}`)
    expect((await statusOf(c.connId)) === 'revoked', 'status is not revoked')
    expect((await versionOf(c.connId)) === before + 1, `version ${await versionOf(c.connId)}, expected ${before + 1}`)
  })

  await testCase('X35. revoked is terminal: revoked to active and revoked to paused are illegal_transition', async () => {
    const c = await newConnection(ownerA)
    await setStatusAs(ownerA, c.connId, 'revoked', await versionOf(c.connId))
    const toActive = await setStatusAs(ownerA, c.connId, 'active', await versionOf(c.connId))
    const toPaused = await setStatusAs(ownerA, c.connId, 'paused', await versionOf(c.connId))
    expect(refusedWith(toActive, 'illegal_transition'), `revoked->active: ${JSON.stringify(toActive)}`)
    expect(refusedWith(toPaused, 'illegal_transition'), `revoked->paused: ${JSON.stringify(toPaused)}`)
    expect((await statusOf(c.connId)) === 'revoked', 'a revoked connection was reactivated')
  })

  await testCase('X36. a stale expected version is refused with version_conflict and nothing changes', async () => {
    const c = await newConnection(ownerA)
    const r = await setStatusAs(ownerA, c.connId, 'paused', 99)
    expect(refusedWith(r, 'version_conflict'), `expected version_conflict, got ${JSON.stringify(r)}`)
    expect((await statusOf(c.connId)) === 'active', 'status changed despite the conflict')
  })

  await testCase('X37. an unknown target status is refused and the status is unchanged', async () => {
    const c = await newConnection(ownerA)
    const r = await setStatusAs(ownerA, c.connId, 'deleted', await versionOf(c.connId))
    expect(refused(r), `expected a refusal, got ${JSON.stringify(r)}`)
    expect((await statusOf(c.connId)) === 'active', 'status changed to an unknown value')
  })

  await testCase('X38. fleet_manager and finance get forbidden_scope on set_status and the status is unchanged', async () => {
    const c = await newConnection(ownerA)
    const failures = []
    for (const [label, who] of [['fleet_manager', fleetA], ['finance', financeA]]) {
      const r = await setStatusAs(who, c.connId, 'paused', await versionOf(c.connId))
      if (!scopeRefusal(r)) failures.push(`${label}: ${JSON.stringify(r)}`)
    }
    expect((await statusOf(c.connId)) === 'active', 'status changed by an out-of-scope caller')
    expect(failures.length === 0, failures.join('; '))
  })

  // =========================================================================
  // R. Secret rotation
  // =========================================================================
  await testCase('X39. owner rotates: a new secret of at least 32 characters, different from the old one, version + 1', async () => {
    const c = await newConnection(ownerA)
    const before = await versionOf(c.connId)
    const r = await rotateAs(ownerA, c.connId, before)
    expect(r.ok === true, `rotate: ${JSON.stringify(r)}`)
    expect(typeof r.secret === 'string' && r.secret.length >= 32, `new secret length ${r.secret ? r.secret.length : 'none'}`)
    expect(r.secret !== c.secret, 'rotation returned the old secret')
    expect((await versionOf(c.connId)) === before + 1, 'version did not advance by one')
  })

  await testCase('X40. after rotation the stored hash is sha256 of the new secret only', async () => {
    const c = await newConnection(ownerA)
    const r = await rotateAs(ownerA, c.connId, await versionOf(c.connId))
    expect(r.ok === true, `rotate: ${JSON.stringify(r)}`)
    const row = await connRow(c.connId)
    expect(row.secret_hash === sha256Hex(r.secret), 'stored hash is not sha256 of the new secret')
    expect(row.secret_hash !== sha256Hex(c.secret), 'stored hash still matches the old secret')
  })

  await testCase('X41. after rotation the old secret is refused by ingest and the new one is accepted', async () => {
    const c = await newConnection(ownerA)
    const r = await rotateAs(ownerA, c.connId, await versionOf(c.connId))
    expect(r.ok === true, `rotate: ${JSON.stringify(r)}`)
    const ref1 = nx('ORD-ROT-OLD')
    const old = await ingest(c.connId, c.secret, nx('evt-old'), [line(ref1, 1)])
    expect(refusedWith(old, 'bad_credentials'), `old secret: ${JSON.stringify(old)}`)
    expect((await ordersByRef(ref1)) === 0, 'an order was created with the old secret')
    const ref2 = nx('ORD-ROT-NEW')
    const fresh = await ingest(c.connId, r.secret, nx('evt-new'), [line(ref2, 1)])
    expect(fresh.ok === true, `new secret: ${JSON.stringify(fresh)}`)
  })

  await testCase('X42. rotating a revoked connection is refused with connection_revoked', async () => {
    const c = await newConnection(ownerA)
    await setStatusAs(ownerA, c.connId, 'revoked', await versionOf(c.connId))
    const r = await rotateAs(ownerA, c.connId, await versionOf(c.connId))
    expect(refusedWith(r, 'connection_revoked'), `expected connection_revoked, got ${JSON.stringify(r)}`)
  })

  await testCase('X43. rotating with a stale version is refused with version_conflict and the hash is unchanged', async () => {
    const c = await newConnection(ownerA)
    const r = await rotateAs(ownerA, c.connId, 99)
    expect(refusedWith(r, 'version_conflict'), `expected version_conflict, got ${JSON.stringify(r)}`)
    expect((await connRow(c.connId)).secret_hash === sha256Hex(c.secret), 'hash changed despite the conflict')
  })

  await testCase('X44. finance gets forbidden_scope on rotate', async () => {
    const c = await newConnection(ownerA)
    const r = await rotateAs(financeA, c.connId, await versionOf(c.connId))
    expect(scopeRefusal(r), `expected forbidden_scope, got ${JSON.stringify(r)}`)
  })

  // =========================================================================
  // I. Ingest (service role)
  // =========================================================================
  await testCase('X45. a valid ingest is accepted and creates a batch keyed erp:<external id>', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-ok')
    const r = await ingest(c.connId, c.secret, ext, [line(nx('ORD-45'), 1), line(nx('ORD-45b'), 1)])
    expect(r.ok === true, `ingest: ${JSON.stringify(r)}`)
    const b = await suOne(
      `SELECT id, agency_id, agreement_id FROM public.agency_order_batches WHERE idempotency_key = $1`,
      [`erp:${ext}`]
    )
    expect(b, 'no batch keyed erp:<external id>')
    expect(b.agency_id === agencyA && b.agreement_id === agrA, `batch tenant ${b.agency_id}/${b.agreement_id}`)
  })

  await testCase('X46. accepted lines become draft version-1 orders linked to the batch', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-draft')
    const refA = nx('ORD-46a')
    const refB = nx('ORD-46b')
    const r = await ingest(c.connId, c.secret, ext, [line(refA, 1), line(refA, 2), line(refB, 1)])
    expect(r.ok === true, `ingest: ${JSON.stringify(r)}`)
    const batch = await suOne(`SELECT id FROM public.agency_order_batches WHERE idempotency_key = $1`, [`erp:${ext}`])
    const orders = (
      await su(`SELECT client_order_ref, status, version, batch_id FROM public.agency_orders WHERE batch_id = $1`, [batch.id])
    ).rows
    expect(orders.length === 2, `orders for batch: ${orders.length}, expected 2`)
    for (const o of orders) {
      expect(o.status === 'draft' && Number(o.version) === 1, `${o.client_order_ref} status ${o.status} v${o.version}`)
    }
    const lines = await suOne(
      `SELECT count(*)::int AS n FROM public.agency_order_lines l JOIN public.agency_orders o ON o.id = l.order_id WHERE o.batch_id = $1`,
      [batch.id]
    )
    expect(lines.n === 3, `lines for batch: ${lines.n}, expected 3`)
  })

  await testCase('X47. the accepted event row records outcome accepted, the batch id and a payload hash', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-rec')
    const r = await ingest(c.connId, c.secret, ext, [line(nx('ORD-47'), 1)])
    expect(r.ok === true, `ingest: ${JSON.stringify(r)}`)
    const rows = await eventRows(c.connId, ext)
    expect(rows.length === 1, `events rows: ${rows.length}`)
    expect(rows[0].outcome === 'accepted', `outcome ${rows[0].outcome}`)
    const batch = await suOne(`SELECT id FROM public.agency_order_batches WHERE idempotency_key = $1`, [`erp:${ext}`])
    expect(rows[0].batch_id === batch.id, `event batch_id ${rows[0].batch_id}`)
    expect(typeof rows[0].payload_hash === 'string' && rows[0].payload_hash.length > 0, 'payload_hash is empty')
  })

  await testCase('X48. the same external id with the same payload answers duplicate and creates no second batch or order', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-dup')
    const lines = [line(nx('ORD-48'), 1)]
    const first = await ingest(c.connId, c.secret, ext, lines)
    expect(first.ok === true, `first ingest: ${JSON.stringify(first)}`)
    const again = await ingest(c.connId, c.secret, ext, lines)
    expect(again.outcome === 'duplicate' || again.state === 'duplicate', `repeat answered ${JSON.stringify(again)}`)
    expect((await batchCountByKey(`erp:${ext}`)) === 1, 'the repeat created a second batch')
    expect((await suOne(`SELECT count(*)::int AS n FROM public.agency_orders WHERE batch_id IS NOT NULL AND client_order_ref = $1`, [lines[0].client_order_ref])).n === 1, 'the repeat created a second order')
  })

  await testCase('X49. a duplicate keeps exactly one events row for the external id, still outcome accepted', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-dup-row')
    const lines = [line(nx('ORD-49'), 1)]
    await ingest(c.connId, c.secret, ext, lines)
    await ingest(c.connId, c.secret, ext, lines)
    const rows = await eventRows(c.connId, ext)
    expect(rows.length === 1, `events rows for the id: ${rows.length}, expected 1`)
    expect(rows[0].outcome === 'accepted', `stored outcome ${rows[0].outcome}`)
  })

  await testCase('X50. the same external id with a different payload is refused with event_id_reused and writes nothing new', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-reuse')
    await ingest(c.connId, c.secret, ext, [line(nx('ORD-50a'), 1)])
    const newRef = nx('ORD-50b')
    const r = await ingest(c.connId, c.secret, ext, [line(newRef, 1)])
    expect(refusedWith(r, 'event_id_reused'), `expected event_id_reused, got ${JSON.stringify(r)}`)
    expect((await batchCountByKey(`erp:${ext}`)) === 1, 'a second batch was created for the reused id')
    expect((await ordersByRef(newRef)) === 0, 'an order was created from the reused id')
    expect((await eventRows(c.connId, ext)).length === 1, 'the reused id produced a second events row')
  })

  await testCase('X51. invalid lines are rejected: the events row has outcome rejected with problems', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-bad')
    const r = await ingest(c.connId, c.secret, ext, [line(nx('ORD-51'), 1, { unit: 'bogus' })])
    expect(r.ok === false, `expected a refusal, got ${JSON.stringify(r)}`)
    const rows = await eventRows(c.connId, ext)
    expect(rows.length === 1, `events rows: ${rows.length}`)
    expect(rows[0].outcome === 'rejected', `outcome ${rows[0].outcome}`)
    const probs = parseJson(rows[0].problems)
    expect(Array.isArray(probs) && probs.some((p) => Number(p.index) === 0 && p.message === 'Unsupported unit.'), `problems ${JSON.stringify(probs)}`)
  })

  await testCase('X52. a rejected payload creates no orders, even for its valid lines', async () => {
    const c = await newConnection(ownerA)
    const okRef = nx('ORD-52ok')
    const badRef = nx('ORD-52bad')
    const ext = nx('evt-atomic')
    await ingest(c.connId, c.secret, ext, [line(okRef, 1), line(badRef, 1, { quantity: 0 })])
    expect((await ordersByRef(okRef)) === 0, 'the valid line of a rejected payload created an order')
    expect((await ordersByRef(badRef)) === 0, 'the invalid line created an order')
    expect((await batchCountByKey(`erp:${ext}`)) === 0, 'a batch was created for a rejected payload')
  })

  await testCase('X53. more than 2000 lines is refused with too_many_lines and no batch is created', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-big')
    const many = Array.from({ length: 2001 }, (_, i) => line(nx('ORD-53'), i + 1))
    const r = await ingest(c.connId, c.secret, ext, many)
    expect(refusedWith(r, 'too_many_lines'), `expected too_many_lines, got ${JSON.stringify(r).slice(0, 200)}`)
    expect((await batchCountByKey(`erp:${ext}`)) === 0, 'a batch was created for an oversized payload')
  })

  await testCase('X54. a wrong secret is refused with bad_credentials and writes no events row and no batch', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-wrong')
    const r = await ingest(c.connId, randomBytes(24).toString('hex'), ext, [line(nx('ORD-54'), 1)])
    expect(refusedWith(r, 'bad_credentials'), `expected bad_credentials, got ${JSON.stringify(r)}`)
    expect((await eventRows(c.connId, ext)).length === 0, 'a failed secret created an events row')
    expect((await batchCountByKey(`erp:${ext}`)) === 0, 'a failed secret created a batch')
  })

  await testCase('X55. an unknown connection gives the same answer as a wrong secret (no existence leak)', async () => {
    const c = await newConnection(ownerA)
    const wrong = await ingest(c.connId, randomBytes(24).toString('hex'), nx('evt-leak-a'), [line(nx('ORD-55a'), 1)])
    const unknown = await ingest(uid(), randomBytes(24).toString('hex'), nx('evt-leak-b'), [line(nx('ORD-55b'), 1)])
    expect(refusedWith(wrong, 'bad_credentials') && refusedWith(unknown, 'bad_credentials'),
      `wrong=${JSON.stringify(wrong)} unknown=${JSON.stringify(unknown)}`)
    expect(wrong.error === unknown.error && wrong.raised === unknown.raised,
      `answers differ: ${JSON.stringify(wrong)} vs ${JSON.stringify(unknown)}`)
  })

  await testCase('X56. paused and revoked connections are refused with connection_not_active and create no batch', async () => {
    const paused = await newConnection(ownerA)
    await setStatusAs(ownerA, paused.connId, 'paused', await versionOf(paused.connId))
    const revoked = await newConnection(ownerA)
    await setStatusAs(ownerA, revoked.connId, 'revoked', await versionOf(revoked.connId))
    const extP = nx('evt-paused')
    const extR = nx('evt-revoked')
    const rp = await ingest(paused.connId, paused.secret, extP, [line(nx('ORD-56p'), 1)])
    const rr = await ingest(revoked.connId, revoked.secret, extR, [line(nx('ORD-56r'), 1)])
    expect(refusedWith(rp, 'connection_not_active'), `paused: ${JSON.stringify(rp)}`)
    expect(refusedWith(rr, 'connection_not_active'), `revoked: ${JSON.stringify(rr)}`)
    expect((await batchCountByKey(`erp:${extP}`)) === 0 && (await batchCountByKey(`erp:${extR}`)) === 0, 'a batch was created')
  })

  await testCase('X57. authenticated users and anon cannot call erp_event_ingest, and no batch is created', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-direct')
    const asOwner = await rpcAs(ownerA, INGEST_SQL, [c.connId, c.secret, ext, JSON.stringify([line(nx('ORD-57a'), 1)])])
    expect(refused(asOwner) && /forbidden|permission denied/i.test(asOwner.error), `authenticated: ${JSON.stringify(asOwner)}`)
    let anonOk = false
    try {
      await asAnon(INGEST_SQL, [c.connId, c.secret, ext, JSON.stringify([line(nx('ORD-57b'), 1)])])
      anonOk = true
    } catch (error) {
      expect(/permission denied/i.test(firstLine(error)), `anon error: ${firstLine(error)}`)
    }
    expect(!anonOk, 'anon executed erp_event_ingest')
    expect((await batchCountByKey(`erp:${ext}`)) === 0, 'a batch was created by a direct call')
  })

  await testCase('X58. a blank external event id is refused and nothing is written', async () => {
    const c = await newConnection(ownerA)
    const ref = nx('ORD-58')
    const r = await ingest(c.connId, c.secret, '   ', [line(ref, 1)])
    expect(refused(r), `expected a refusal, got ${JSON.stringify(r)}`)
    expect((await ordersByRef(ref)) === 0, 'an order was created for a blank event id')
    const n = (await suOne(`SELECT count(*)::int AS n FROM public.agency_erp_events WHERE connection_id = $1`, [c.connId])).n
    expect(n === 0, `events rows for the connection: ${n}`)
  })

  await testCase('X59. an ingest on agency B connection writes only to agency B', async () => {
    await ensureClients()
    const name = nx('erp-b-conn')
    const created = await createAs(ownerB, clientB, agrB, name, 'csv_drop', nx('erp-key'))
    expect(created.ok === true, `agency B create: ${JSON.stringify(created)}`)
    const ext = nx('evt-b')
    const r = await ingest(created.connection_id, created.secret, ext, [line(nx('ORD-59'), 1)])
    expect(r.ok === true, `ingest: ${JSON.stringify(r)}`)
    const b = await suOne(`SELECT agency_id FROM public.agency_order_batches WHERE idempotency_key = $1`, [`erp:${ext}`])
    expect(b && b.agency_id === agencyB, `batch agency ${b && b.agency_id}`)
    const ev = await suOne(`SELECT agency_id FROM public.agency_erp_events WHERE connection_id = $1`, [created.connection_id])
    expect(ev && ev.agency_id === agencyB, `event agency ${ev && ev.agency_id}`)
  })

  // =========================================================================
  // L. Secret never leaks; tenant and scope reads
  // =========================================================================
  await testCase('X60. the plaintext secret (before and after rotation) appears in no events row and no connection row', async () => {
    const c = await newConnection(ownerA)
    const extOk = nx('evt-leak-ok')
    const extBad = nx('evt-leak-bad')
    await ingest(c.connId, c.secret, extOk, [line(nx('ORD-60a'), 1)])
    await ingest(c.connId, c.secret, extOk, [line(nx('ORD-60a'), 1)])
    await ingest(c.connId, c.secret, extBad, [line(nx('ORD-60b'), 1, { unit: 'bogus' })])
    const rot = await rotateAs(ownerA, c.connId, await versionOf(c.connId))
    expect(rot.ok === true, `rotate: ${JSON.stringify(rot)}`)
    const hits = (
      await su(
        `SELECT (SELECT count(*) FROM public.agency_erp_events e WHERE e.connection_id = $1
                   AND (strpos(e::text, $2) > 0 OR strpos(e::text, $3) > 0))::int AS ev,
                (SELECT count(*) FROM public.agency_erp_connections k WHERE k.id = $1
                   AND (strpos(k::text, $2) > 0 OR strpos(k::text, $3) > 0))::int AS cx`,
        [c.connId, c.secret, rot.secret]
      )
    ).rows[0]
    expect(hits.ev === 0, `plaintext found in ${hits.ev} events row(s)`)
    expect(hits.cx === 0, `plaintext found in the connection row`)
  })

  await testCase('X61. owner listing with explicit safe columns works, excludes the secret, and shows only the hint', async () => {
    const c = await newConnection(ownerA)
    const rows = await asActor(ownerA, async () =>
      (
        await db.query(
          `SELECT id, name, kind, status, version, secret_hint FROM public.agency_erp_connections WHERE agency_id = $1`,
          [agencyA]
        )
      ).rows
    )
    const mine = rows.find((r) => r.id === c.connId)
    expect(mine, 'owner listing does not include the new connection')
    expect(!JSON.stringify(rows).includes(c.secret), 'the secret appears in the owner listing')
    expect(mine.secret_hint === c.secret.slice(-4), `hint ${mine.secret_hint}`)
  })

  await testCase('X62. dispatcher sees agency A connections and events (positive control)', async () => {
    const c = await newConnection(ownerA)
    await ingest(c.connId, c.secret, nx('evt-visible'), [line(nx('ORD-62'), 1)])
    const conns = await visibleCount(dispatcherA, 'agency_erp_connections', agencyA)
    const evs = await visibleCount(dispatcherA, 'agency_erp_events', agencyA)
    expect(conns >= 1, `dispatcher sees ${conns} connections`)
    expect(evs >= 1, `dispatcher sees ${evs} events`)
  })

  await testCase('X63. fleet_manager, finance and viewer see zero connections and zero events of agency A', async () => {
    const c = await newConnection(ownerA)
    await ingest(c.connId, c.secret, nx('evt-hidden'), [line(nx('ORD-63'), 1)])
    const failures = []
    for (const [label, who] of [['fleet_manager', fleetA], ['finance', financeA], ['viewer', viewerA]]) {
      const conns = await visibleCount(who, 'agency_erp_connections', agencyA)
      const evs = await visibleCount(who, 'agency_erp_events', agencyA)
      if (conns !== 0) failures.push(`${label} sees ${conns} connections`)
      if (evs !== 0) failures.push(`${label} sees ${evs} events`)
    }
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('X64. other agency owner, suspended-agency staff, revoked member, no-agency user and anon see zero rows of agency A', async () => {
    const failures = []
    const checks = [
      ['agency B owner', ownerB],
      ['suspended-agency staff', suspendedStaffS],
      ['revoked member', revokedA],
      ['no agency', noAgency],
    ]
    for (const [label, who] of checks) {
      const conns = await visibleCount(who, 'agency_erp_connections', agencyA)
      const evs = await visibleCount(who, 'agency_erp_events', agencyA)
      if (conns !== 0 || evs !== 0) failures.push(`${label} sees connections=${conns} events=${evs}`)
    }
    const anonConns = await anonVisible('agency_erp_connections', agencyA)
    const anonEvs = await anonVisible('agency_erp_events', agencyA)
    if (anonConns !== 0 || anonEvs !== 0) failures.push(`anon sees connections=${anonConns} events=${anonEvs}`)
    expect(failures.length === 0, failures.join('; '))
  })

  await testCase('X65. a payload over 1 MiB is refused with payload_too_large and writes no events row', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-huge')
    const r = await ingest(c.connId, c.secret, ext, [line(nx('ORD-65'), 1, { notes: 'x'.repeat(1100000) })])
    expect(refusedWith(r, 'payload_too_large'), `expected payload_too_large, got ${JSON.stringify(r).slice(0, 200)}`)
    expect((await eventRows(c.connId, ext)).length === 0, 'an events row was stored for an oversized payload')
  })

  await testCase('X66. a transient refusal (order_exists) stores no events row and a corrected retry with the same event id succeeds', async () => {
    const c = await newConnection(ownerA)
    const dupRef = nx('ORD-66')
    const first = await ingest(c.connId, c.secret, nx('evt-first'), [line(dupRef, 1)])
    expect(first.ok === true, `setup import failed: ${JSON.stringify(first)}`)
    const ext = nx('evt-retry')
    const r = await ingest(c.connId, c.secret, ext, [line(dupRef, 1, { quantity: 2 })])
    expect(r.ok === false && r.error === 'order_exists', `expected order_exists, got ${JSON.stringify(r)}`)
    expect((await eventRows(c.connId, ext)).length === 0, 'an events row was stored for a transient refusal')
    const fixed = await ingest(c.connId, c.secret, ext, [line(nx('ORD-66b'), 1)])
    expect(fixed.ok === true, `corrected retry was refused: ${JSON.stringify(fixed)}`)
  })

  await testCase('X67. a deterministic invalid_lines refusal still stores exactly one rejected row', async () => {
    const c = await newConnection(ownerA)
    const ext = nx('evt-det')
    const r = await ingest(c.connId, c.secret, ext, [line(nx('ORD-67'), 1, { unit: 'bogus' })])
    expect(r.ok === false && r.error === 'invalid_lines', `expected invalid_lines, got ${JSON.stringify(r)}`)
    const rows = await eventRows(c.connId, ext)
    expect(rows.length === 1 && rows[0].outcome === 'rejected', `rows ${JSON.stringify(rows)}`)
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
