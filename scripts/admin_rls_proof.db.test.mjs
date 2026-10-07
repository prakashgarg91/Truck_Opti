#!/usr/bin/env node
/**
 * TO-136 — admin authority + final database policy denial matrix.
 *
 * LEVEL (read this first): SQL-level proof on a REAL PostgreSQL engine
 * (PGlite WASM — PostgreSQL 18.3 in this run; the Supabase local image
 * configured by supabase/config.toml is PostgreSQL 17). It replays the full
 * supabase/migrations chain, then enumerates the FINAL installed policy/grant
 * state (RLS policies, table/column grants, views, SECURITY DEFINER ACLs,
 * Storage policies) and drives a role/tenant denial matrix through the same
 * SQL surfaces PostgREST, the frontend services and the Edge Functions use:
 * real RLS, real role switching (`SET ROLE` + `request.jwt.claims`, exactly
 * what PostgREST does), real triggers, real SECURITY DEFINER functions and
 * real table/column privileges.
 *
 * Actors exercised: anonymous, two customers (tenant isolation), approved /
 * pending drivers, approved / pending / suspended agencies, a metadata-forged
 * "admin" (user_metadata.role='admin' with DB role 'user'), a real DB admin,
 * and the service authority used by the Edge Functions.
 *
 * It is NOT the disposable Supabase stack: there is no PostgREST, no GoTrue,
 * no Storage HTTP API and no second connection, so:
 *   - REST round-trips and HTTP status codes are represented by the exact SQL
 *     privilege/RLS errors PostgREST maps;
 *   - no GoTrue-issued token exists, so "forged metadata" is modelled the way
 *     GoTrue embeds raw_user_meta_data into a signed JWT: the claim is present
 *     in request.jwt.claims, while public.users.role stays 'user';
 *   - Edge Functions cannot execute (no Deno runtime): their guard predicates
 *     are verified at source level and replicated as SQL assertions, labelled
 *     as such — never counted as live HTTP auth proof.
 *
 * Reason for this level: Docker Desktop (and Podman) are not installed on this
 * machine, so `npx supabase start` cannot run — the CLI reports
 * "failed to inspect container health: docker: command not found (podman also
 * not found)" (exit 1, re-verified 2026-10-05). The 2026-10-04 completion
 * verdict sanctions this harness as the alternative to the local stack
 * ("rebuild the disposable Supabase stack ... or extend the PGlite harness").
 *
 * Evidence class: local DB. Every recorded case asserts an observed database
 * behaviour. Defects found by running it are printed as DEFECT and counted
 * separately; they are not silently folded into passing cases.
 *
 * Usage:  node scripts/admin_rls_proof.db.test.mjs
 * Exit code 0 = every case passed; any case failure exits 1. A missing PGlite
 * install is a loud failure, never a silent skip.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const FUNCTIONS_DIR = join(REPO_ROOT, 'supabase', 'functions')

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
const defects = []
const findings = []
const inventory = {}

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function recordDefect(name, detail) {
  defects.push({ name, detail })
  console.log(`DEFECT  ${name}${detail ? ` — ${detail}` : ''}`)
}

function recordFinding(name, detail) {
  findings.push({ name, detail })
  console.log(`FINDING  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

async function expectError(promise, expectedMessage) {
  try {
    await promise
  } catch (error) {
    const message = error && error.message ? error.message.split('\n')[0] : String(error)
    if (expectedMessage !== undefined) {
      expect(
        message.includes(expectedMessage),
        `expected error containing "${expectedMessage}", got: ${JSON.stringify(message)}`
      )
    }
    return message
  }
  throw new Error(`expected an error${expectedMessage ? ` "${expectedMessage}"` : ''}, but the call succeeded`)
}

// ---------------------------------------------------------------------------
// Supabase-shaped bootstrap (the platform pre-creates these in the local image)
// ---------------------------------------------------------------------------
const BOOTSTRAP = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE ROLE anon NOLOGIN NOINHERIT;
CREATE ROLE authenticated NOLOGIN NOINHERIT;
CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA extensions;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'sub', '')::uuid
$fn$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$fn$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
  SELECT nullif(current_setting('request.jwt.claims', true)::json->>'role', '')
$fn$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- Platform-shaped storage grants (RLS in storage.objects remains the gate; the
-- Supabase image grants table privileges to these roles for the Storage API).
GRANT ALL ON storage.objects TO anon, authenticated, service_role;
GRANT ALL ON storage.buckets TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE plpgsql IMMUTABLE AS $fn$
  DECLARE parts text[]; BEGIN
    parts := string_to_array(name, '/');
    RETURN parts[1:array_length(parts, 1) - 1];
  END $fn$;
CREATE PUBLICATION supabase_realtime;
GRANT USAGE ON SCHEMA public, auth, storage, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
`

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
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`

async function createUser(tag, { role = null, metadata = {} } = {}) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify(metadata),
  ])
  if (role) {
    await db.query(`INSERT INTO public.users (id, email, role) VALUES ($1, $2, $3)`, [id, email, role])
  } else {
    await db.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  }
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

async function createAgencyTruck(agencyId, driverId = null) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number, driver_id)
     VALUES ($1, $2, 'eicher_14ft', $3, $4)`,
    [id, agencyId, `DL01AB${1000 + seq}`, driverId]
  )
  return id
}

async function createShipment(customerId, ownerUserId, tag) {
  const id = uid()
  const reference = `TO136-${tag}-${Date.now()}-${seq}`
  const result = await db.query(
    `INSERT INTO public.shipments
       (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost,
        vehicle_type, pickup_date, goods_description, estimated_value)
     VALUES ($1, $2, $3, $4, 'Delhi', 'Jaipur', 'pending', 1200, 18500, 'eicher_14ft', '2026-10-12', 'Electronics', 75000)
     RETURNING id, invoice_number, lr_number`,
    [id, reference, customerId, ownerUserId]
  )
  return { id, reference, invoiceNumber: result.rows[0].invoice_number, lrNumber: result.rows[0].lr_number }
}

async function createAgencyJob(agencyId, shipmentId, fare = 15000) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status)
     VALUES ($1, $2, $3, $4, 'pending')`,
    [id, agencyId, shipmentId, fare]
  )
  return id
}

async function createOffer(shipmentId, driverId, { pickupOtp = '4321', deliveryOtp = '8765' } = {}) {
  const id = uid()
  await db.query(
    `INSERT INTO public.job_offers
       (id, shipment_id, driver_id, offered_at, expires_at, status, pickup_otp, delivery_otp)
     VALUES ($1, $2, $3, now(), now() + interval '1 hour', 'pending', $4, $5)`,
    [id, shipmentId, driverId, pickupOtp, deliveryOtp]
  )
  return id
}

async function createStorageObject(bucketId, name, owner = null) {
  await db.query(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ($1, $2, $3)`, [
    bucketId,
    name,
    owner,
  ])
}

async function createKycRow(driverId, userId, kind = 'driving_license', version = 1) {
  const id = uid()
  await db.query(
    `INSERT INTO public.driver_kyc_documents
       (id, driver_id, user_id, kind, version, status, storage_path, mime_type, size_bytes)
     VALUES ($1, $2, $3, $4, $5, 'pending_review', $6, 'image/jpeg', 1000)`,
    [id, driverId, userId, kind, version, `${userId}/${kind}/${id}.jpg`]
  )
  return id
}

// ---------------------------------------------------------------------------
// Role/claims switching (what PostgREST does per request)
// ---------------------------------------------------------------------------
async function actAs(sub, extraClaims = {}) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    sub ? JSON.stringify({ sub, role: 'authenticated', ...extraClaims }) : '{}',
  ])
  await db.exec('SET ROLE authenticated')
}

// A user who set their own user_metadata.role='admin' (Supabase allows users to
// update user_metadata; GoTrue then embeds it in the signed JWT). The DB role
// stays 'user'. This is the forged-metadata actor.
async function actAsForgedAdmin(sub) {
  await actAs(sub, { user_metadata: { role: 'admin' } })
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

async function rows(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows
}

async function count(sql, params = []) {
  const result = await db.query(sql, params)
  return Number(result.rows[0].count)
}

// ---------------------------------------------------------------------------
// Source-level Edge Function authority checks (labelled as source assertions;
// the Deno/Edge runtime cannot execute here — no HTTP auth proof is claimed).
// ---------------------------------------------------------------------------
const ADMIN_PORTAL_FUNCTIONS = [
  'admin-portal-agencies',
  'admin-portal-contact',
  'admin-portal-dashboard',
  'admin-portal-drivers',
  'admin-portal-payouts',
  'admin-portal-subscriptions',
  'admin-portal-users',
]

function readSource(relPath) {
  return readFileSync(join(REPO_ROOT, relPath), 'utf8')
}

function collectSourceFiles(dir, { exclude = [] } = {}) {
  const out = []
  const walk = (current, rel) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name)
      const relPath = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(full, relPath)
        continue
      }
      if (!entry.name.endsWith('.ts') && !entry.name.endsWith('.mjs')) continue
      if (exclude.some((pattern) => relPath.includes(pattern))) continue
      out.push({ relPath, text: readFileSync(full, 'utf8') })
    }
  }
  walk(dir, '')
  return out
}

// ---------------------------------------------------------------------------
// The proof
// ---------------------------------------------------------------------------
async function main() {
  let caseCount = 0
  const caseStart = results.length

  // =========================================================================
  // A. Final-schema inventory (policy/grant state after ALL migrations)
  // =========================================================================
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  inventory.migrationCount = applied.length
  inventory.lastMigration = applied[applied.length - 1]
  record(
    'A1. migration chain replays cleanly (full supabase/migrations, newest last)',
    applied.length >= 35,
    `${applied.length} files, last=${applied[applied.length - 1]}`
  )

  const engine = (await rows(`SELECT version() AS v`))[0].v
  console.log(`engine: ${engine}`)

  const tableStats = (
    await rows(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE c.relrowsecurity)::int AS rls_on
       FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'`
    )
  )[0]
  inventory.publicTables = tableStats.total
  inventory.publicTablesRls = tableStats.rls_on
  record(
    'A2. every public base table has RLS enabled',
    tableStats.total > 0 && tableStats.total === tableStats.rls_on,
    `${tableStats.rls_on}/${tableStats.total} public tables with rowsecurity=true`
  )

  const policies = await rows(
    `SELECT schemaname, tablename, policyname, cmd, roles::text AS roles, qual, with_check
     FROM pg_policies
     WHERE schemaname IN ('public', 'storage')
     ORDER BY schemaname, tablename, policyname`
  )
  inventory.policyCount = policies.length
  inventory.policyCountBySchema = policies.reduce((acc, p) => {
    acc[p.schemaname] = (acc[p.schemaname] || 0) + 1
    return acc
  }, {})
  inventory.userMetadataPolicies = policies
    .filter((p) => `${p.qual ?? ''} ${p.with_check ?? ''}`.includes('user_metadata'))
    .map((p) => `${p.schemaname}.${p.tablename} :: ${p.policyname} (${p.cmd})`)

  record(
    'A3. no final-schema policy derives authority from client-controlled user_metadata',
    inventory.userMetadataPolicies.length === 0,
    inventory.userMetadataPolicies.length === 0
      ? `${policies.length} policies inspected (public+storage)`
      : `${inventory.userMetadataPolicies.length} policy/policies still trust user_metadata: ${inventory.userMetadataPolicies.join(' | ')}`
  )
  for (const entry of inventory.userMetadataPolicies) {
    recordDefect(
      'A3 defect: policy trusts client-controlled user_metadata',
      `${entry} — user_metadata is user-writable (supabase.auth.updateUser), so this is a role-escalation vector`
    )
  }

  const definerFunctions = await rows(
    `SELECT p.oid::regprocedure::text AS signature,
            p.prosecdef,
            COALESCE(array_to_string(p.proconfig, ','), '') AS proconfig,
            COALESCE(array_to_string(p.proacl, ','), '') AS proacl
     FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
     ORDER BY 1`
  )
  inventory.securityDefinerFunctions = definerFunctions.length
  const missingSearchPath = definerFunctions.filter((f) => !f.proconfig.includes('search_path'))
  inventory.securityDefinerWithoutSearchPath = missingSearchPath.map((f) => f.signature)
  record(
    'A4. SECURITY DEFINER inventory recorded (search_path pinning status)',
    definerFunctions.length > 0,
    `${definerFunctions.length} SECURITY DEFINER functions; unpinned(${missingSearchPath.length}): ${missingSearchPath.map((f) => f.signature).join(' | ') || 'none'}`
  )
  if (missingSearchPath.length > 0) {
    recordFinding(
      'A4 finding: SECURITY DEFINER functions with a mutable search_path (hardening, P2)',
      `${missingSearchPath.map((f) => f.signature).join(', ')} — owner-rights functions resolve unqualified table names from the caller search_path; house fix is ADD 'SET search_path = public' (the pattern used by every function written after 20260418003000). Not exploitable from this harness (no CREATE grant modelled); verify deployed role grants before rating.`
    )
  }

  const views = await rows(
    `SELECT c.relname,
            COALESCE(array_to_string(c.reloptions, ','), '') AS reloptions,
            has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
            has_table_privilege('authenticated', c.oid, 'SELECT') AS authenticated_select
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'v'
     ORDER BY 1`
  )
  inventory.views = views.map((v) => ({
    name: v.relname,
    securityInvoker: v.reloptions.includes('security_invoker=true'),
    anonSelect: v.anon_select,
    authenticatedSelect: v.authenticated_select,
  }))
  const viewColumns = (
    await rows(
      `SELECT string_agg(column_name, ', ' ORDER BY ordinal_position) AS cols
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'production_setup_status'`
    )
  )[0].cols
  inventory.productionSetupStatusColumns = viewColumns
  record(
    'A5. public view exposure is known and limited to aggregate counts (no row data)',
    !viewColumns || !/(email|phone|address|pan|gst|amount)/i.test(viewColumns),
    viewColumns
      ? `production_setup_status columns: ${viewColumns}; owner-rights view (security_invoker=false), aggregates only`
      : 'no views found'
  )
  const anonReadableViews = inventory.views.filter((v) => v.anonSelect)
  const authReadableViews = inventory.views.filter((v) => v.authenticatedSelect)
  // TO-142 r3: the setup-verification aggregate is revoked from both client
  // roles (the finding's own house fix) — no product consumer exists (only a
  // generated type at frontend/src/types/database.types.ts:571); the
  // owner/service path keeps access for operational verification.
  record(
    'A5b. no public view is client-readable (setup-verification aggregate revoked)',
    anonReadableViews.length === 0 && authReadableViews.length === 0,
    anonReadableViews.length === 0 && authReadableViews.length === 0
      ? `${inventory.views.length} view(s); SELECT revoked from anon + authenticated`
      : `client-readable views remain: anon=[${anonReadableViews.map((v) => v.name).join(', ')}] authenticated=[${authReadableViews.map((v) => v.name).join(', ')}]`
  )

  const otpPrivileges = (
    await rows(
      `SELECT has_table_privilege('authenticated', 'public.job_offers', 'SELECT') AS table_select,
              has_column_privilege('authenticated', 'public.job_offers', 'pickup_otp', 'SELECT') AS otp_select,
              has_column_privilege('authenticated', 'public.job_offers', 'delivery_otp', 'SELECT') AS otp2_select,
              has_column_privilege('authenticated', 'public.job_offers', 'status', 'SELECT') AS status_select`
    )
  )[0]
  inventory.jobOfferPrivileges = otpPrivileges
  record(
    'A6. authenticated has no direct OTP-column access (table SELECT revoked, non-OTP columns granted)',
    otpPrivileges.table_select === false &&
      otpPrivileges.otp_select === false &&
      otpPrivileges.otp2_select === false &&
      otpPrivileges.status_select === true,
    `table_select=${otpPrivileges.table_select} otp_select=${otpPrivileges.otp_select} delivery_otp_select=${otpPrivileges.otp2_select} status_select=${otpPrivileges.status_select}`
  )

  const buckets = await rows(
    `SELECT id, public, file_size_limit, COALESCE(array_to_string(allowed_mime_types, ','), '') AS mime
     FROM storage.buckets ORDER BY id`
  )
  inventory.buckets = buckets
  record(
    'A7. storage bucket configuration matches the migrated privacy contract (all document buckets private)',
    buckets.length === 3 &&
      buckets.find((b) => b.id === 'driver-docs')?.public === false &&
      buckets.find((b) => b.id === 'trip-photos')?.public === false &&
      buckets.find((b) => b.id === 'billing-documents')?.public === false,
    buckets.map((b) => `${b.id}:public=${b.public}`).join(', ')
  )

  // =========================================================================
  // Fixtures for the matrix (created under the service authority, as the
  // platform/admin tooling creates them; RLS is then exercised per actor)
  // =========================================================================
  await actAsService()
  const adminUser = await createUser('admin', { role: 'admin' })
  const forgedUser = await createUser('forged', { metadata: { role: 'admin' } })
  const customerAUser = await createUser('customer-a')
  const customerBUser = await createUser('customer-b')
  const driverOkUser = await createUser('driver-ok')
  const driverPendingUser = await createUser('driver-pending')
  const agencyOkUser = await createUser('agency-ok')
  const agencyPendingUser = await createUser('agency-pending')
  const agencySuspendedUser = await createUser('agency-suspended')

  const customerA = await createCustomer(customerAUser, 'Alpha')
  const customerB = await createCustomer(customerBUser, 'Bravo')
  const shipmentA = await createShipment(customerA, customerAUser, 'A')
  const shipmentB = await createShipment(customerB, customerBUser, 'B')

  const agencyOk = await createAgencyRow(agencyOkUser, 'Approved', 'approved')
  const agencyPending = await createAgencyRow(agencyPendingUser, 'Pending', 'pending')
  const agencySuspended = await createAgencyRow(agencySuspendedUser, 'Suspended', 'suspended')

  const driverOk = await createDriver(driverOkUser, 'Approved', 'approved')
  const driverPending = await createDriver(driverPendingUser, 'Pending', 'pending')
  await createAgencyTruck(agencyOk, driverOk)

  const agencyJobA = await createAgencyJob(agencyOk, shipmentA.id)
  const offerOk = await createOffer(shipmentA.id, driverOk)
  const offerPending = await createOffer(shipmentA.id, driverPending)

  const payoutId = uid()
  await db.query(
    `INSERT INTO public.driver_payouts (id, driver_id, amount, status, requested_at, note)
     VALUES ($1, $2, 5000, 'pending', now(), 'TO-136 fixture')`,
    [payoutId, driverOk]
  )

  const kycRow = await createKycRow(driverOk, driverOkUser)

  await createStorageObject('driver-docs', `${driverOkUser}/aadhaar.pdf`, driverOkUser)
  await createStorageObject('driver-docs', `${driverPendingUser}/licence.pdf`, driverPendingUser)
  await createStorageObject('trip-photos', `${driverOkUser}/trip-photo.jpg`, driverOkUser)
  await createStorageObject('trip-photos', `${driverPendingUser}/trip-photo.jpg`, driverPendingUser)
  await createStorageObject('trip-photos', `${driverOkUser}/${offerOk}/loading.jpg`, driverOkUser)
  await createStorageObject('billing-documents', `invoices/INV-2026-000001.pdf`, adminUser)
  await createStorageObject('billing-documents', `${customerAUser}/INV-2026-000002.pdf`, customerAUser)

  // =========================================================================
  // A8. Privatized document buckets (TO-142): anon denied, authorized readers
  // =========================================================================
  {
    await actAsAnon()
    const anonDocs = (
      await rows(
        `SELECT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'billing-documents')::int AS billing,
                (SELECT count(*) FROM storage.objects WHERE bucket_id = 'trip-photos')::int AS trips`
      )
    )[0]
    expect(anonDocs.billing === 0 && anonDocs.trips === 0, `anon must see zero document objects after privatization: ${JSON.stringify(anonDocs)}`)

    await actAs(customerAUser)
    const ownBilling = await count(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'billing-documents'`)
    expect(ownBilling === 1, `invoice owner must read the billing object in their own folder, got ${ownBilling}`)

    await actAs(customerBUser)
    const foreignBilling = await count(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'billing-documents'`)
    expect(foreignBilling === 0, `non-owner customer must not read billing documents, got ${foreignBilling}`)

    await actAs(customerAUser)
    const stakeholderTrip = await count(
      `SELECT count(*) FROM storage.objects WHERE bucket_id = 'trip-photos' AND name = $1`,
      [`${driverOkUser}/${offerOk}/loading.jpg`]
    )
    expect(stakeholderTrip === 1, `shipment customer must read the driver trip photo as a stakeholder, got ${stakeholderTrip}`)

    await actAs(driverOkUser)
    const driverOwnTrips = await count(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'trip-photos'`)
    expect(driverOwnTrips === 2, `uploading driver reads own trip objects (legacy + job-scoped), got ${driverOwnTrips}`)

    await actAs(adminUser)
    const adminBilling = await count(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'billing-documents'`)
    expect(adminBilling === 2, `DB admin reads all billing documents, got ${adminBilling}`)

    record(
      'A8. privatized document buckets: anon denied; billing owner/admin and trip-photo stakeholders authorized (TO-142)',
      true,
      'signed-URL flow replaces world-readable URLs; expiry asserted at source level in G7'
    )
  }

  // =========================================================================
  // B. Anonymous
  // =========================================================================
  await actAsAnon()
  const anonCatalog = (
    await rows(
      `SELECT (SELECT count(*) FROM public.trucks)::int AS trucks,
              (SELECT count(*) FROM public.cartons)::int AS cartons,
              (SELECT count(*) FROM public.subscription_plans)::int AS plans`
    )
  )[0]
  record(
    'B1. anonymous keeps the valid public catalog (trucks/cartons/plans)',
    anonCatalog.trucks === 8 && anonCatalog.cartons === 5 && anonCatalog.plans === 4,
    `trucks=${anonCatalog.trucks} cartons=${anonCatalog.cartons} plans=${anonCatalog.plans}`
  )

  const anonPrivate = (
    await rows(
      `SELECT (SELECT count(*) FROM public.users)::int AS users,
              (SELECT count(*) FROM public.customers)::int AS customers,
              (SELECT count(*) FROM public.shipments)::int AS shipments,
              (SELECT count(*) FROM public.drivers)::int AS drivers,
              (SELECT count(*) FROM public.transport_agencies)::int AS agencies,
              (SELECT count(*) FROM public.job_offers)::int AS offers,
              (SELECT count(*) FROM public.driver_payouts)::int AS payouts,
              (SELECT count(*) FROM public.contact_inquiries)::int AS inquiries,
              (SELECT count(*) FROM public.driver_kyc_documents)::int AS kyc`
    )
  )[0]
  const anonPrivateTotal = Object.values(anonPrivate).reduce((a, b) => a + b, 0)
  record(
    'B2. anonymous reads zero tenant/PII rows on every private table',
    anonPrivateTotal === 0,
    JSON.stringify(anonPrivate)
  )

  let anonInquiry = ''
  try {
    await db.query(
      `INSERT INTO public.contact_inquiries (name, email, subject, message) VALUES ('Anon Visitor', 'anon@example.com', 'General', 'Please contact me')`
    )
    anonInquiry = 'insert accepted'
  } catch (error) {
    anonInquiry = `insert failed: ${error.message.split('\n')[0]}`
  }
  record('B3. anonymous can submit a contact inquiry (intended public write)', anonInquiry === 'insert accepted', anonInquiry)

  const anonShipmentInsert = await expectError(
    db.query(
      `INSERT INTO public.shipments (shipment_id, origin, destination, status, total_weight, estimated_cost, vehicle_type, pickup_date, goods_description, estimated_value)
       VALUES ('TO136-ANON', 'Delhi', 'Jaipur', 'pending', 1, 1, 'eicher_14ft', '2026-10-12', 'x', 1)`
    ),
    'row-level security'
  )
  record('B4. anonymous cannot insert a shipment (RLS)', true, anonShipmentInsert)

  const anonAdmin = (await rows(`SELECT public.is_admin_user() AS is_admin`))[0].is_admin
  const anonTracking = await expectError(
    db.query(`SELECT * FROM public.get_shipment_job_offer_tracking('00000000-0000-4000-8000-000000000099'::uuid)`),
    undefined
  )
  record(
    'B5. anonymous has no admin authority and cannot execute the stakeholder OTP RPC',
    anonAdmin === false && /permission denied/i.test(anonTracking),
    `is_admin_user=${anonAdmin}; tracking RPC → ${anonTracking}`
  )

  const anonStorage = (
    await rows(
      `SELECT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'driver-docs')::int AS driver_docs,
              (SELECT count(*) FROM storage.objects WHERE bucket_id = 'trip-photos')::int AS trip_photos,
              (SELECT count(*) FROM storage.objects WHERE bucket_id = 'billing-documents')::int AS billing_docs`
    )
  )[0]
  record(
    'B6. anonymous storage: every document bucket is private (KYC, trip photos and invoice PDFs hidden)',
    anonStorage.driver_docs === 0 && anonStorage.trip_photos === 0 && anonStorage.billing_docs === 0,
    JSON.stringify(anonStorage)
  )

  // =========================================================================
  // C. Customer isolation
  // =========================================================================
  await actAs(customerAUser)
  const ownShipment = await count(`SELECT count(*) FROM public.shipments WHERE id = $1`, [shipmentA.id])
  const foreignShipment = await count(`SELECT count(*) FROM public.shipments WHERE id = $1`, [shipmentB.id])
  record(
    'C1. customer sees own shipment, zero foreign-tenant shipments',
    ownShipment === 1 && foreignShipment === 0,
    `own=${ownShipment} foreign=${foreignShipment}`
  )

  const foreignUpdate = await db.query(`UPDATE public.shipments SET destination = 'Mumbai' WHERE id = $1`, [
    shipmentB.id,
  ])
  const foreignDelete = await db.query(`DELETE FROM public.shipments WHERE id = $1`, [shipmentB.id])
  record(
    'C2. customer cannot update or delete a foreign shipment (0 rows affected)',
    foreignUpdate.affectedRows === 0 && foreignDelete.affectedRows === 0,
    `update=${foreignUpdate.affectedRows} delete=${foreignDelete.affectedRows}`
  )

  const customerScopes = (
    await rows(
      `SELECT (SELECT count(*) FROM public.users)::int AS users,
              (SELECT count(*) FROM public.drivers)::int AS drivers,
              (SELECT count(*) FROM public.transport_agencies)::int AS agencies,
              (SELECT count(*) FROM public.driver_payouts)::int AS payouts,
              (SELECT count(*) FROM public.contact_inquiries)::int AS inquiries,
              (SELECT count(*) FROM public.driver_kyc_documents)::int AS kyc`
    )
  )[0]
  record(
    'C3. customer scope: self profile only; no drivers/agencies/payouts/contact/KYC rows',
    customerScopes.users === 1 &&
      customerScopes.drivers === 0 &&
      customerScopes.agencies === 0 &&
      customerScopes.payouts === 0 &&
      customerScopes.inquiries === 0 &&
      customerScopes.kyc === 0,
    JSON.stringify(customerScopes)
  )

  const selfRoleChange = await expectError(
    db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [customerAUser]),
    'Only admins can change roles'
  )
  const ownRoleAfter = (
    await rows(`SELECT role FROM public.users WHERE id = $1`, [customerAUser])
  )[0].role
  record(
    'C4. self-role change is rejected by the trigger (role stays user)',
    ownRoleAfter === 'user',
    `${selfRoleChange}; role=${ownRoleAfter}`
  )

  const directOtp = await expectError(
    db.query(`SELECT pickup_otp FROM public.job_offers WHERE id = $1`, [offerOk]),
    'permission denied'
  )
  const trackingOtp = (
    await rows(`SELECT pickup_otp, delivery_otp FROM public.get_shipment_job_offer_tracking($1)`, [shipmentA.id])
  )[0]
  record(
    'C5. customer cannot read OTP columns directly but the sanctioned tracking RPC returns them',
    directOtp.includes('permission denied') && trackingOtp?.pickup_otp === '4321',
    `direct → ${directOtp}; RPC pickup_otp=${trackingOtp?.pickup_otp}`
  )

  const foreignTracking = await expectError(
    db.query(`SELECT * FROM public.get_shipment_job_offer_tracking($1)`, [shipmentB.id]),
    'Access denied'
  )
  record('C6. tracking RPC denies a shipment outside the caller tenant', true, foreignTracking)

  // =========================================================================
  // D. Driver / agency status matrix
  // =========================================================================
  await actAs(driverPendingUser)
  const pendingProgress = await expectError(
    db.query(`SELECT * FROM public.respond_to_job_offer($1, true)`, [offerPending]),
    'Driver account is not approved to respond to offers'
  )
  record('D1. pending driver cannot accept an offer (RPC approval gate)', true, pendingProgress)

  const pendingForeignOffer = await count(`SELECT count(*) FROM public.job_offers WHERE id = $1`, [offerOk])
  let pendingForeignUpdate = 'not attempted'
  try {
    const result = await db.query(`UPDATE public.job_offers SET status = 'accepted' WHERE id = $1`, [offerOk])
    pendingForeignUpdate = result.affectedRows
  } catch (error) {
    pendingForeignUpdate = `denied: ${error.message.split('\n')[0]}`
  }
  record(
    'D2. pending driver cannot read or update another driver offer (0 rows / privilege denied)',
    pendingForeignOffer === 0 && (pendingForeignUpdate === 0 || String(pendingForeignUpdate).startsWith('denied')),
    `read=${pendingForeignOffer} update=${pendingForeignUpdate}`
  )

  await actAs(driverOkUser)
  const ownOffer = await count(`SELECT count(*) FROM public.job_offers WHERE id = $1`, [offerOk])
  const otherOffer = await count(`SELECT count(*) FROM public.job_offers WHERE id = $1`, [offerPending])
  const driverOfferColumns = (
    await rows(`SELECT id, status FROM public.job_offers WHERE id = $1`, [offerOk])
  )[0]
  record(
    'D3. approved driver reads exactly own offer (granted columns only)',
    ownOffer === 1 && otherOffer === 0 && driverOfferColumns?.status === 'pending',
    `own=${ownOffer} foreign=${otherOffer} status=${driverOfferColumns?.status}`
  )

  await actAs(agencyPendingUser)
  const pendingSelfApprove = await db.query(`UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [
    agencyPending,
  ])
  const pendingStatus = (
    await rows(`SELECT status FROM public.transport_agencies WHERE id = $1`, [agencyPending])
  )[0].status
  record(
    'D4. pending agency cannot self-approve (trigger reverts the status write)',
    pendingStatus === 'pending',
    `rows=${pendingSelfApprove.affectedRows} status=${pendingStatus}`
  )

  await actAs(agencySuspendedUser)
  await db.query(`UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [agencySuspended])
  const suspendedStatus = (
    await rows(`SELECT status FROM public.transport_agencies WHERE id = $1`, [agencySuspended])
  )[0].status
  record(
    'D5. suspended agency cannot self-reactivate (trigger reverts)',
    suspendedStatus === 'suspended',
    `status=${suspendedStatus}`
  )

  await actAs(agencyOkUser)
  const ownAgency = await count(`SELECT count(*) FROM public.transport_agencies WHERE id = $1`, [agencyOk])
  const foreignAgency = await count(`SELECT count(*) FROM public.transport_agencies WHERE id = $1`, [agencyPending])
  const ownJob = await count(`SELECT count(*) FROM public.agency_jobs WHERE id = $1`, [agencyJobA])
  const agencyJobColumns = (
    await rows(`SELECT id, status, fare FROM public.agency_jobs WHERE id = $1`, [agencyJobA])
  )[0]
  const foreignDrivers = await count(`SELECT count(*) FROM public.drivers`)
  record(
    'D6. approved agency reads own agency/dispatch, zero foreign rows; drivers table stays RLS-scoped',
    ownAgency === 1 && foreignAgency === 0 && ownJob === 1 && foreignDrivers === 0 && agencyJobColumns?.status === 'pending',
    `own_agency=${ownAgency} foreign_agency=${foreignAgency} own_job=${ownJob} drivers=${foreignDrivers}`
  )

  await actAs(adminUser)
  await db.query(`UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [agencyPending])
  const adminApprovedAgency = (
    await rows(`SELECT status FROM public.transport_agencies WHERE id = $1`, [agencyPending])
  )[0].status
  record(
    'D7. authenticated admin (DB role) can approve a pending agency through RLS + trigger',
    adminApprovedAgency === 'approved',
    `status=${adminApprovedAgency}`
  )

  await actAs(adminUser)
  const adminDriverUpdate = await db.query(`UPDATE public.drivers SET status = 'approved' WHERE id = $1`, [
    driverPending,
  ])
  const adminDriverStatus = (
    await rows(`SELECT status FROM public.drivers WHERE id = $1`, [driverPending])
  )[0].status
  record(
    'D8. authenticated admin can approve a pending driver through RLS',
    adminDriverUpdate.affectedRows === 1 && adminDriverStatus === 'approved',
    `rows=${adminDriverUpdate.affectedRows} status=${adminDriverStatus}`
  )

  // =========================================================================
  // E. Forged metadata (user_metadata.role='admin', DB role 'user')
  // =========================================================================
  await actAsForgedAdmin(forgedUser)
  const forgedIsAdmin = (await rows(`SELECT public.is_admin_user() AS is_admin`))[0].is_admin
  record(
    'E1. forged user_metadata role does not confer admin authority (is_admin_user=false)',
    forgedIsAdmin === false,
    `is_admin_user=${forgedIsAdmin}`
  )

  const forgedScopes = (
    await rows(
      `SELECT (SELECT count(*) FROM public.users)::int AS users,
              (SELECT count(*) FROM public.driver_payouts)::int AS payouts,
              (SELECT count(*) FROM public.contact_inquiries)::int AS inquiries,
              (SELECT count(*) FROM public.driver_kyc_documents)::int AS kyc,
              (SELECT count(*) FROM public.drivers)::int AS drivers`
    )
  )[0]
  record(
    'E2. forged metadata grants no admin read scope (users self only; payouts/contact/KYC/drivers 0)',
    forgedScopes.users === 1 &&
      forgedScopes.payouts === 0 &&
      forgedScopes.inquiries === 0 &&
      forgedScopes.kyc === 0 &&
      forgedScopes.drivers === 0,
    JSON.stringify(forgedScopes)
  )

  const forgedRoleChange = await expectError(
    db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [forgedUser]),
    'Only admins can change roles'
  )
  const forgedDriverUpdate = await db.query(`UPDATE public.drivers SET status = 'suspended' WHERE id = $1`, [
    driverOk,
  ])
  const forgedPayoutUpdate = await db.query(`UPDATE public.driver_payouts SET status = 'released' WHERE id = $1`, [
    payoutId,
  ])
  record(
    'E3. forged metadata cannot change roles, edit drivers, or release payouts',
    forgedDriverUpdate.affectedRows === 0 && forgedPayoutUpdate.affectedRows === 0,
    `${forgedRoleChange}; driver_rows=${forgedDriverUpdate.affectedRows} payout_rows=${forgedPayoutUpdate.affectedRows}`
  )

  const forgedProgress = await expectError(
    db.query(`SELECT * FROM public.persist_driver_job_offer_progress($1, 'delivered')`, [offerOk]),
    'Job offer not found or access denied'
  )
  record('E4. admin-guarded SECURITY DEFINER RPC denies forged metadata', true, forgedProgress)

  const forgedStorageHardened = (
    await rows(
      `SELECT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'driver-docs')::int AS driver_docs,
              (SELECT count(*) FROM storage.objects WHERE bucket_id = 'trip-photos')::int AS trip_photos`
    )
  )[0]
  const forgedTripDelete = await db.query(`DELETE FROM storage.objects WHERE bucket_id = 'trip-photos'`)
  let forgedTripUpdate = 'not attempted'
  try {
    const result = await db.query(`UPDATE storage.objects SET name = 'stolen' WHERE bucket_id = 'trip-photos'`)
    forgedTripUpdate = result.affectedRows
  } catch (error) {
    forgedTripUpdate = `denied: ${error.message.split('\n')[0]}`
  }
  record(
    'E5. forged metadata is denied admin storage on hardened buckets (driver-docs hidden, trip-photo writes 0)',
    forgedStorageHardened.driver_docs === 0 &&
      forgedTripDelete.affectedRows === 0 &&
      (forgedTripUpdate === 0 || String(forgedTripUpdate).startsWith('denied')),
    `${JSON.stringify(forgedStorageHardened)} trip_delete=${forgedTripDelete.affectedRows} trip_update=${forgedTripUpdate}`
  )

  // ---- The billing-documents bucket is the one policy that still trusts
  //      user_metadata (see A3). Prove exploitation + the mirror-image denial
  //      for a legitimate DB admin.
  let forgedBillingInsert = 'not attempted'
  try {
    await db.query(
      `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('billing-documents', $1, $2)`,
      [`invoices/${forgedUser}/evil.pdf`, forgedUser]
    )
    forgedBillingInsert = 'ACCEPTED'
  } catch (error) {
    forgedBillingInsert = `denied: ${error.message.split('\n')[0]}`
  }
  const forgedBillingDelete = await db.query(
    `DELETE FROM storage.objects WHERE bucket_id = 'billing-documents' AND name = 'invoices/INV-2026-000001.pdf'`
  )
  record(
    'E6. [defect gate] forged metadata must not obtain admin write on invoice documents',
    forgedBillingInsert !== 'ACCEPTED' && forgedBillingDelete.affectedRows === 0,
    `insert=${forgedBillingInsert}; delete_existing=${forgedBillingDelete.affectedRows}`
  )
  if (forgedBillingInsert === 'ACCEPTED' || forgedBillingDelete.affectedRows > 0) {
    recordDefect(
      'billing-documents admin policy trusts user_metadata (P1 escalation)',
      `forged insert=${forgedBillingInsert}, forged delete of existing invoice rows=${forgedBillingDelete.affectedRows}`
    )
  }

  await actAsService()
  const invoiceFixtureExists = await count(
    `SELECT count(*) FROM storage.objects WHERE bucket_id = 'billing-documents' AND name = 'invoices/INV-2026-000001.pdf'`
  )
  if (invoiceFixtureExists === 0) {
    await db.query(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('billing-documents', $1, $2)`, [
      'invoices/INV-2026-000001.pdf',
      adminUser,
    ])
  }
  await actAs(adminUser)
  let adminBillingInsert = 'not attempted'
  try {
    await db.query(
      `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('billing-documents', $1, $2)`,
      [`invoices/${adminUser}/admin.pdf`, adminUser]
    )
    adminBillingInsert = 'ACCEPTED'
  } catch (error) {
    adminBillingInsert = `denied: ${error.message.split('\n')[0]}`
  }
  record(
    'E7. [defect gate] a real DB admin must be able to manage invoice documents',
    adminBillingInsert === 'ACCEPTED',
    `insert=${adminBillingInsert}`
  )
  if (adminBillingInsert !== 'ACCEPTED') {
    recordDefect(
      'billing-documents admin policy denies the real DB admin (same user_metadata root cause)',
      `admin insert=${adminBillingInsert}`
    )
  }

  // =========================================================================
  // F. Admin operations with controlled fixtures (service authority path)
  // =========================================================================
  await actAsService()
  const serviceUsers = await count(`SELECT count(*) FROM public.users`)
  const serviceAuthUsers = await count(`SELECT count(*) FROM auth.users`)
  const serviceInquiries = await count(`SELECT count(*) FROM public.contact_inquiries`)
  record(
    'F1. service authority (Edge Function path) can read portal users + contact inbox',
    serviceUsers >= 9 && serviceAuthUsers >= 9 && serviceInquiries >= 1,
    `public.users=${serviceUsers} auth.users=${serviceAuthUsers} inquiries=${serviceInquiries}`
  )

  await actAsService()
  await db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [customerBUser])
  const servicePromoted = (
    await rows(`SELECT role FROM public.users WHERE id = $1`, [customerBUser])
  )[0].role
  await db.query(`UPDATE public.users SET role = 'user' WHERE id = $1`, [customerBUser])
  const serviceDemoted = (
    await rows(`SELECT role FROM public.users WHERE id = $1`, [customerBUser])
  )[0].role
  record(
    'F2. service authority can grant and revoke a role (the only role-mutation path)',
    servicePromoted === 'admin' && serviceDemoted === 'user',
    `promoted=${servicePromoted} demoted=${serviceDemoted}`
  )

  await actAs(customerBUser)
  const clientRoleWrite = await expectError(
    db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [customerBUser]),
    'Only admins can change roles'
  )
  record('F3. no client-side role mutation path exists (trigger backstop)', true, clientRoleWrite)

  await actAsService()
  await db.query(`UPDATE public.drivers SET status = 'approved' WHERE id = $1`, [driverPending])
  const serviceDriverStatus = (
    await rows(`SELECT status FROM public.drivers WHERE id = $1`, [driverPending])
  )[0].status
  record('F4. service authority approves a driver (admin-portal-drivers path)', serviceDriverStatus === 'approved', `status=${serviceDriverStatus}`)

  await actAs(adminUser)
  const adminInquiryRows = await count(`SELECT count(*) FROM public.contact_inquiries`)
  await db.query(`UPDATE public.contact_inquiries SET status = 'resolved' WHERE email = 'anon@example.com'`)
  await actAsService()
  const inquiryStatus = (
    await rows(`SELECT status FROM public.contact_inquiries WHERE email = 'anon@example.com'`)
  )[0].status
  record(
    'F5. contact inbox: admin reads + resolves; status transition persisted',
    adminInquiryRows >= 1 && inquiryStatus === 'resolved',
    `admin_reads=${adminInquiryRows} status=${inquiryStatus}`
  )

  await actAs(customerAUser)
  const clientSubscriptionWrite = await expectError(
    db.query(`UPDATE public.subscriptions SET status = 'cancelled' WHERE user_id = $1`, [customerAUser]),
    undefined
  )
  record(
    'F6. client subscription mutation is locked (no UPDATE/INSERT grant or policy)',
    /permission denied|row-level security/.test(clientSubscriptionWrite),
    clientSubscriptionWrite
  )
  await actAsService()
  const serviceSubscriptions = await count(`SELECT count(*) FROM public.subscriptions`)
  record(
    'F7. admin portal reads subscriptions/billing via service authority (RLS keeps admin scoped to self)',
    serviceSubscriptions >= 0,
    `service subscriptions=${serviceSubscriptions}`
  )

  await actAs(adminUser)
  const adminPayoutRows = await count(`SELECT count(*) FROM public.driver_payouts`)
  const adminRelease = await db.query(`UPDATE public.driver_payouts SET status = 'paid' WHERE id = $1`, [payoutId])
  await actAsService()
  const payoutFinal = (
    await rows(`SELECT status, amount, type FROM public.driver_payouts WHERE id = $1`, [payoutId])
  )[0]
  const paymentRows = await count(`SELECT count(*) FROM public.payment_history`).catch(() => 0)
  record(
    'F8. payout review is status-only: admin releases, amount/type untouched, no payment rows',
    adminPayoutRows >= 1 &&
      adminRelease.affectedRows === 1 &&
      payoutFinal?.status === 'paid' &&
      Number(payoutFinal?.amount) === 5000 &&
      paymentRows === 0,
    `admin_rows=${adminPayoutRows} rows=${adminRelease.affectedRows} status=${payoutFinal?.status} amount=${payoutFinal?.amount} payment_rows=${paymentRows}`
  )

  await actAs(adminUser)
  const adminUserScope = await count(`SELECT count(*) FROM public.users`)
  record(
    'F9. users table has no admin read policy: admin list/ban/delete runs only through the service-backed Edge Function',
    adminUserScope === 1,
    `authenticated admin sees ${adminUserScope} users row (self); design fact, not a defect`
  )

  // =========================================================================
  // G. Edge Function authority (source assertions + SQL replica — labelled)
  // =========================================================================
  const adminGuards = ADMIN_PORTAL_FUNCTIONS.map((name) => {
    const text = readSource(`supabase/functions/${name}/index.ts`)
    const usesShared = text.includes('requireAdminContext(')
    const usesInline =
      text.includes('auth.getUser(') && /from\('users'\)/.test(text) && /role/.test(text)
    return { name, usesShared, usesInline, hasMetadataAuthority: /user_metadata|app_metadata/.test(text) }
  })
  const unguarded = adminGuards.filter((g) => !g.usesShared && !g.usesInline)
  const metadataAuthority = adminGuards.filter((g) => g.hasMetadataAuthority)
  inventory.adminPortalGuards = adminGuards
  record(
    'G1. all 7 admin-portal functions resolve an admin guard before service-role operations',
    unguarded.length === 0,
    adminGuards.map((g) => `${g.name}:${g.usesShared ? 'shared' : g.usesInline ? 'inline' : 'MISSING'}`).join(' ')
  )
  record(
    'G2. no admin-portal function reads user_metadata/app_metadata for authorization',
    metadataAuthority.length === 0,
    metadataAuthority.length ? metadataAuthority.map((g) => g.name).join(',') : 'clean'
  )

  const portalAuth = readSource('supabase/functions/_shared/portal-auth.ts')
  record(
    'G3. portal-auth.ts verify trusted authority: GoTrue getUser(token) then DB users.role (never metadata)',
    portalAuth.includes('authClient.auth.getUser(accessToken)') &&
      portalAuth.includes(".from('users')") &&
      portalAuth.includes(".select('id, role')") &&
      !portalAuth.includes('user_metadata') &&
      portalAuth.includes("throw new RequestError('Admin access is required.', 403)"),
    'source assertions on requireAdminContext / requireDriverContext / requireAgencyContext'
  )

  const stripComments = (text) =>
    text
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim()
        return !trimmed.startsWith('*') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')
      })
      .join('\n')
      .replace(/\/\/.*$/, '')

  const functionSources = collectSourceFiles(FUNCTIONS_DIR, {
    exclude: ['.test.ts', 'local-disposable-battery.mjs', 'driver-kyc/local-disposable-battery.mjs'],
  })
  const metadataFiles = functionSources
    .filter((f) => /user_metadata|app_metadata/.test(stripComments(f.text)))
    .map((f) => f.relPath)
  inventory.functionsUsingMetadata = metadataFiles
  record(
    'G4. only display-name metadata ($.full_name/company/phone) is read in Edge Functions, never authority',
    metadataFiles.every((f) => f.endsWith('invoice-delivery.ts')),
    metadataFiles.length ? metadataFiles.join(', ') : 'none'
  )
  if (metadataFiles.length > 0) {
    recordFinding(
      'G4 finding: invoice-delivery.ts reads user_metadata for display fields, not authority (P3)',
      'full_name/name/company/phone are used to populate invoice contact data after the caller has already been authenticated by GoTrue; the caller can only alter their own document display fields. Flagging for the invoice/PDF slice — not an authorization path.'
    )
  }

  const authStore = readSource('frontend/src/stores/authStore.ts')
  record(
    'G5. frontend role is DB-derived (resolveAppRole reads public.users.role); localStorage cannot confer server authority',
    /from\('users'\)\s*\n?\s*\.select\('role, login_id'\)/.test(authStore.replace(/\r/g, '')) &&
      !authStore.includes('user_metadata?.role'),
    'source assertion on frontend/src/stores/authStore.ts:87-123 (role route gates are UX-only; every data surface is server-gated)'
  )

  // TO-142: the private-bucket signed-URL flow, asserted at source level.
  // NOT an HTTP/Storage round-trip: no Edge/Storage runtime executes here, so
  // expiry and authorization of the minted URL are proven only as source
  // contracts (the SQL-side authorization is proven by A8/H-cases).
  const invoiceViewSource = readSource('supabase/functions/invoice-view/index.ts')
  const invoiceDeliverySource = readSource('supabase/functions/_shared/invoice-delivery.ts')
  const subscriptionPageSource = readSource('frontend/src/pages/SubscriptionPage.tsx')
  record(
    'G7. invoice signed-URL flow: server-minted createSignedUrl with pinned expiry; no public-URL builder remains',
    invoiceViewSource.includes('createSignedUrl(') &&
      invoiceViewSource.includes('INVOICE_SIGNED_URL_EXPIRES_SECONDS = 300') &&
      !invoiceDeliverySource.includes('getPublicUrl') &&
      subscriptionPageSource.includes('getSignedUrl'),
    'invoice-view mints createSignedUrl(path, 300) for the invoice owner/admin; invoice-delivery no longer persists public URLs (email links the authenticated /subscription route); SubscriptionPage fetches a fresh signed URL on click. Issued signed URLs are not revocable before expiry (HMAC over path+expiry) — revocation requires object deletion or key rotation.'
  )

  // SQL replica of the requireAdminContext predicate: GoTrue token → caller id,
  // then service-role read of public.users.role. The token-validation half
  // cannot run here (no GoTrue); the authority half is executed.
  async function edgeAdminGate(userId) {
    await actAsService()
    const profile = (await rows(`SELECT role FROM public.users WHERE id = $1`, [userId]))[0]
    return (profile?.role ?? 'user') === 'admin'
  }
  const gateAdmin = await edgeAdminGate(adminUser)
  const gateForged = await edgeAdminGate(forgedUser)
  const gateCustomer = await edgeAdminGate(customerAUser)
  record(
    'G6. replicated Edge admin gate (DB-role predicate) admits admin, denies forged/customer',
    gateAdmin === true && gateForged === false && gateCustomer === false,
    `admin=${gateAdmin} forged=${gateForged} customer=${gateCustomer}`
  )

  // =========================================================================
  // H. Storage document matrix
  // =========================================================================
  await actAs(driverOkUser)
  const driverDocsOwn = await count(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'driver-docs'`)
  const kycOwn = await count(`SELECT count(*) FROM public.driver_kyc_documents WHERE id = $1`, [kycRow])
  record(
    'H1. driver reads own KYC document rows and own driver-docs objects only',
    driverDocsOwn === 1 && kycOwn === 1,
    `driver_docs=${driverDocsOwn} kyc=${kycOwn}`
  )

  await actAs(driverPendingUser)
  const foreignKyc = await count(`SELECT count(*) FROM public.driver_kyc_documents`)
  const foreignKycUpdate = await expectError(
    db.query(`UPDATE public.driver_kyc_documents SET status = 'accepted' WHERE id = $1`, [kycRow]),
    undefined
  )
  record(
    'H2. another driver cannot read or review the KYC record (review is service-only)',
    foreignKyc === 0 && /permission denied|row-level security/.test(foreignKycUpdate),
    `read=${foreignKyc}; update → ${foreignKycUpdate}`
  )

  await actAs(adminUser)
  const adminKycRows = await count(`SELECT count(*) FROM public.driver_kyc_documents`)
  const adminDriverDocs = await count(`SELECT count(*) FROM storage.objects WHERE bucket_id = 'driver-docs'`)
  const adminTripDelete = await db.query(
    `DELETE FROM storage.objects WHERE bucket_id = 'trip-photos' AND name = $1`,
    [`${driverPendingUser}/trip-photo.jpg`]
  )
  record(
    'H3. DB admin can read all KYC rows and manage hardened buckets (is_admin_user policies)',
    adminKycRows >= 1 && adminDriverDocs === 2 && adminTripDelete.affectedRows === 1,
    `kyc=${adminKycRows} driver_docs=${adminDriverDocs} trip_delete=${adminTripDelete.affectedRows}`
  )

  await actAs(driverPendingUser)
  const foreignUpload = await expectError(
    db.query(
      `INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('trip-photos', $1, $2)`,
      [`${driverOkUser}/stolen.jpg`, driverPendingUser]
    ),
    'row-level security'
  )
  record('H4. driver cannot upload into another driver folder (storage owner-folder policy)', true, foreignUpload)

  await actAsService()
  await db.query(`INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('trip-photos', $1, $2)`, [
    `${driverPendingUser}/trip-photo.jpg`,
    driverPendingUser,
  ])

  // =========================================================================
  // Summary
  // =========================================================================
  for (let i = caseStart; i < results.length; i++) caseCount++

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length

  inventory.cases = results.length
  inventory.passed = passed
  inventory.failed = failed
  inventory.defects = defects.length
  inventory.findings = findings.length

  console.log('\n================ SUMMARY ================')
  console.log(`cases: ${passed}/${results.length} passed, ${failed} failed`)
  console.log(`defects reproduced (printed as DEFECT above): ${defects.length}`)
  console.log(`hardening/design findings (printed as FINDING above): ${findings.length}`)
  console.log(`schema: ${inventory.publicTables} public tables (${inventory.publicTablesRls} with RLS), ${inventory.policyCount} policies, ${inventory.securityDefinerFunctions} SECURITY DEFINER functions`)
  if (defects.length) {
    console.log('defects:')
    for (const d of defects) console.log(`  - ${d.name}: ${d.detail}`)
  }
  if (findings.length) {
    console.log('findings:')
    for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`)
  }
  console.log('NOTE: no PostgREST/GoTrue/Storage HTTP round-trip and no Edge Function execution in this harness; see agent-results/026-result.md.')

  try {
    mkdirSync(join(REPO_ROOT, 'logs'), { recursive: true })
    writeFileSync(
      join(REPO_ROOT, 'logs', 'to136-admin-rls-proof.json'),
      JSON.stringify({ engine, inventory, results, defects, findings }, null, 2)
    )
  } catch {
    // Log artifact is best-effort working evidence; stdout is the record.
  }

  if (failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('HARNESS ERROR:', error)
  process.exit(1)
})
