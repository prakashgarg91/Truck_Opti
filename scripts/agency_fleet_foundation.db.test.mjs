#!/usr/bin/env node
/**
 * TO-144-D1 — agency fleet foundation contract battery (red-first).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain, then pins the owned-fleet authority model
 * through the same SQL surfaces the frontend services and Edge Functions use:
 * real RLS, real role switching (`SET ROLE authenticated` + `request.jwt.claims`,
 * exactly what PostgREST does), real triggers and real SECURITY DEFINER RPCs —
 * for two approved agencies, one suspended agency, one pending and one rejected
 * agency, and approved/pending drivers.
 *
 * Pinned contract (migration 20261008000000_agency_fleet_foundation.sql):
 *   - trucks catalog `code` key + agency_trucks catalog FK (NOT VALID),
 *   - agency_trucks payload/body/PUC/maintenance/version columns + version
 *     trigger (single bump; explicit sets are not double-bumped),
 *   - new public.agency_driver_employment table (licence/contact/status,
 *     partial UNIQUE on driver_id WHERE status='active'),
 *   - policy rewrite: owner OR admin SELECT; owner AND agency_is_operational
 *     INSERT/UPDATE; ownership-only DELETE (TO-142 precedent, pinned);
 *   - SECURITY DEFINER command RPCs with deterministic fail-closed agency
 *     resolution (zero/multiple profiles RAISE, never LIMIT-1), typed
 *     jsonb envelopes, idempotent create on UNIQUE(agency_id, rc_number),
 *     expected-version updates with version_conflict results (never an
 *     exception), and two free-standing allocation eligibility predicates.
 *
 * Evidence class: local DB. Every case asserts an observed database behaviour.
 *
 * Usage:  node scripts/agency_fleet_foundation.db.test.mjs
 * Exit code 0 = every case passed; any failure exits 1. A missing PGlite
 * install is a loud failure, never a silent skip.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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
const findings = []

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
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
        message.startsWith(expectedMessage) || message.includes(expectedMessage),
        `expected error containing "${expectedMessage}", got: ${JSON.stringify(message)}`
      )
    }
    return message
  }
  throw new Error(`expected an error${expectedMessage ? ` "${expectedMessage}"` : ''}, but the call succeeded`)
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

/** Service-seeded truck row with explicit column control (for the eligibility matrix). */
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
  await db.query(
    `INSERT INTO public.agency_trucks (${keys.join(', ')}) VALUES (${placeholders})`,
    params
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
  await db.query(
    `INSERT INTO public.agency_driver_employment (${keys.join(', ')}) VALUES (${placeholders})`,
    params
  )
  return id
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

async function rows(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows
}

// Catalog name -> stable code map pinned by the plan.
const CATALOG_CODES = {
  'Tata Ace': 'tata_ace',
  'Tata 407': 'tata_407',
  'Eicher 14ft': 'eicher_14ft',
  'Eicher 17ft': 'eicher_17ft',
  'Ashok Leyland 19ft': 'ashok_19ft',
  'BharatBenz 24ft': 'bharatbenz_24ft',
  'BharatBenz 32ft': 'bharatbenz_32ft',
  'Volvo 40ft Container': 'volvo_40ft',
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

  // =========================================================================
  // A. Chain replay, catalog code key, DDL introspection, policy-drop proof
  // =========================================================================
  await testCase('A1. migration chain replays cleanly and ends with the fleet-foundation migration', async () => {
    expect(applied.includes('20261008000000_agency_fleet_foundation.sql'),
      `fleet-foundation migration missing from chain (last=${last})`)
    expect(last === '20261008000000_agency_fleet_foundation.sql',
      `fleet-foundation migration must sort last, got ${last}`)
  })

  await testCase('A2. trucks catalog carries the 8 stable codes matching existing vehicle_type values', async () => {
    const catalog = await rows(`SELECT name, code FROM public.trucks ORDER BY name`)
    expect(catalog.length === 8, `expected 8 catalog rows, got ${catalog.length}`)
    for (const row of catalog) {
      expect(CATALOG_CODES[row.name] !== undefined, `unexpected catalog name ${JSON.stringify(row.name)}`)
      expect(row.code === CATALOG_CODES[row.name],
        `code for ${JSON.stringify(row.name)} must be ${JSON.stringify(CATALOG_CODES[row.name])}, got ${JSON.stringify(row.code)}`)
    }
    const codes = catalog.map((r) => r.code).sort()
    expect(new Set(codes).size === 8, `codes must be distinct, got ${JSON.stringify(codes)}`)
  })

  await testCase('A3. agency_trucks gains the additive fleet columns with pinned defaults and the catalog FK + settlement key', async () => {
    const cols = await rows(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agency_trucks'
    `)
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]))
    for (const name of ['payload_kg', 'body_length_m', 'body_width_m', 'body_height_m', 'puc_expiry', 'maintenance_blocked', 'maintenance_block_reason', 'maintenance_blocked_until', 'version']) {
      expect(byName[name] !== undefined, `agency_trucks.${name} column missing`)
    }
    expect(byName.version.is_nullable === 'NO', 'version must be NOT NULL')
    expect(String(byName.version.column_default).includes('1'), `version must default to 1, got ${byName.version.column_default}`)
    expect(byName.maintenance_blocked.is_nullable === 'NO', 'maintenance_blocked must be NOT NULL')
    expect(String(byName.maintenance_blocked.column_default).includes('false'), `maintenance_blocked must default false, got ${byName.maintenance_blocked.column_default}`)

    const constraints = await rows(`
      SELECT conname::text AS name, contype::text AS type,
             pg_get_constraintdef(oid) AS def
      FROM pg_constraint
      WHERE conrelid = 'public.agency_trucks'::regclass
    `)
    const fk = constraints.find((c) => c.name === 'agency_trucks_vehicle_type_catalog_fkey')
    expect(fk !== undefined, 'catalog FK agency_trucks_vehicle_type_catalog_fkey missing')
    expect(/FOREIGN KEY \(vehicle_type\)\s+REFERENCES trucks\(code\)/.test(fk.def), `FK must reference trucks(code), got: ${fk.def}`)
    expect(/NOT VALID/.test(fk.def), `FK must be NOT VALID, got: ${fk.def}`)
    const settlement = constraints.find((c) => c.name === 'agency_trucks_agency_id_rc_number_key')
    expect(settlement !== undefined && /UNIQUE/.test(settlement.def),
      `UNIQUE (agency_id, rc_number) settlement key missing: ${JSON.stringify(constraints.map((c) => c.name))}`)
  })

  await testCase('A4. agency_driver_employment exists with licence/contact/status columns and the active-only partial unique index', async () => {
    const cols = await rows(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'agency_driver_employment'
    `)
    const byName = Object.fromEntries(cols.map((c) => [c.column_name, c]))
    for (const name of ['id', 'agency_id', 'driver_id', 'licence_number', 'licence_class', 'licence_expiry', 'contact_phone', 'status', 'version', 'created_at', 'updated_at']) {
      expect(byName[name] !== undefined, `agency_driver_employment.${name} column missing`)
    }
    expect(byName.status.column_default !== null && byName.status.column_default.includes('active'),
      `status must default 'active', got ${byName.status.column_default}`)
    expect(byName.version.is_nullable === 'NO', 'version must be NOT NULL')

    const indexes = await rows(`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND tablename = 'agency_driver_employment'
    `)
    const partial = indexes.find((i) => /UNIQUE INDEX/.test(i.indexdef) && /driver_id/.test(i.indexdef) && /status = 'active'/.test(i.indexdef))
    expect(partial !== undefined, `partial UNIQUE on driver_id WHERE status='active' missing: ${JSON.stringify(indexes)}`)

    const constraints = await rows(`
      SELECT conname::text AS name FROM pg_constraint
      WHERE conrelid = 'public.agency_driver_employment'::regclass AND contype = 'c'
    `)
    expect(constraints.some((c) => /status/.test(c.name)), 'status CHECK constraint missing')
  })

  await testCase('A5. policy rewrite: old OR-combining policies are gone; per-command policies exist on both tables', async () => {
    const policies = await rows(`SELECT policyname::text AS name, tablename::text AS table_name, cmd::text AS cmd FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('agency_trucks', 'agency_driver_employment')`)
    const names = new Set(policies.map((p) => p.name))
    expect(!names.has('agency_truck_owner_all'), `agency_truck_owner_all must be dropped (permissive policies OR-combine), found: ${JSON.stringify([...names])}`)
    expect(!names.has('admin_see_all_trucks'), `admin_see_all_trucks must be dropped, found: ${JSON.stringify([...names])}`)
    for (const p of ['agency_trucks_select', 'agency_trucks_insert', 'agency_trucks_update', 'agency_trucks_delete']) {
      const row = policies.find((x) => x.name === p && x.table_name === 'agency_trucks')
      expect(row !== undefined, `policy ${p} missing`)
    }
    for (const p of ['agency_employment_select', 'agency_employment_insert', 'agency_employment_update', 'agency_employment_delete']) {
      const row = policies.find((x) => x.name === p && x.table_name === 'agency_driver_employment')
      expect(row !== undefined, `policy ${p} missing`)
    }
  })

  await testCase('A6. fleet command RPC signatures take NO agency/org id argument (browser-supplied org ids grant nothing)', async () => {
    // The five COMMAND RPCs resolve the agency from auth.uid() only.
    const commands = {
      agency_vehicle_create: ['p_rc_number', 'p_vehicle_type', 'p_insurance_expiry', 'p_fitness_expiry', 'p_permit_expiry', 'p_puc_expiry', 'p_payload_kg', 'p_body_length_m', 'p_body_width_m', 'p_body_height_m', 'p_notes'],
      agency_vehicle_update: ['p_vehicle_id', 'p_expected_version', 'p_patch'],
      agency_driver_employment_create: ['p_driver_id', 'p_licence_number', 'p_licence_class', 'p_licence_expiry', 'p_contact_phone'],
      agency_driver_employment_update: ['p_employment_id', 'p_expected_version', 'p_patch'],
      agency_driver_employment_end: ['p_employment_id', 'p_expected_version'],
    }
    // The two free-standing eligibility predicates serve the trusted TO-143-D2
    // dispatch path; the driver pair predicate legitimately takes p_agency_id
    // as a server-side argument (pinned by the plan).
    const predicates = {
      agency_vehicle_allocation_eligible: ['p_vehicle_id', 'p_as_of'],
      agency_driver_allocation_eligible: ['p_driver_id', 'p_agency_id', 'p_as_of'],
    }
    for (const [fnName, argNames] of Object.entries({ ...commands, ...predicates })) {
      const fns = await rows(`
        SELECT p.oid::text AS oid, p.proargnames::text[] AS argnames
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = '${fnName}'
      `)
      expect(fns.length >= 1, `function public.${fnName} missing`)
      const fn = fns[0]
      expect(JSON.stringify(fn.argnames) === JSON.stringify(argNames),
        `${fnName} argnames must be ${JSON.stringify(argNames)}, got ${JSON.stringify(fn.argnames)}`)
    }
    for (const [fnName, argNames] of Object.entries(commands)) {
      for (const a of argNames) {
        expect(!/^(p_)?(agency|org)_?id$/.test(a), `${fnName} must not accept an agency/org id argument, found ${a}`)
      }
    }
  })

  // =========================================================================
  // B. Fixtures: two approved agencies, suspended/pending/rejected, drivers
  // =========================================================================
  const agencyAUser = await createUser('fleet-a')
  const agencyBUser = await createUser('fleet-b')
  const agencyCUser = await createUser('fleet-c')
  const agencyDUser = await createUser('fleet-d')
  const agencyEUser = await createUser('fleet-e')
  const driver1User = await createUser('fleet-driver1')
  const driver2User = await createUser('fleet-driver2')
  const driver3User = await createUser('fleet-driver3')

  let agencyA
  let agencyB
  let agencyC
  let agencyD
  let agencyE
  let driver1
  let driver2
  let driver3
  {
    await actAsService()
    agencyA = await createAgencyRow(agencyAUser, 'Alpha', 'approved')
    agencyB = await createAgencyRow(agencyBUser, 'Bravo', 'approved')
    agencyC = await createAgencyRow(agencyCUser, 'Charlie', 'suspended')
    agencyD = await createAgencyRow(agencyDUser, 'Delta', 'pending')
    agencyE = await createAgencyRow(agencyEUser, 'Echo', 'rejected')
    driver1 = await createDriver(driver1User, 'One', 'approved')
    driver2 = await createDriver(driver2User, 'Two', 'pending')
    driver3 = await createDriver(driver3User, 'Three', 'approved')
  }

  // =========================================================================
  // C. Two agencies cannot see or edit each other's fleet (RLS + RPC)
  // =========================================================================
  let truckA1
  let truckB1
  let empA1
  let empB1
  const RC_A = 'DL01AA1101'
  const RC_B = 'DL01BB2202'

  await testCase('C1. agency A creates its vehicle and employment through the typed RPCs (no agency id argument)', async () => {
    await actAs(agencyAUser)
    const created = await rows(`SELECT public.agency_vehicle_create($1, $2) AS r`, [RC_A, 'eicher_14ft'])
    const env = created[0].r
    expect(env && env.ok === true && env.state === 'created', `create must return {ok:true,state:'created'}, got ${JSON.stringify(env)}`)
    expect(env.version === 1, `created version must be 1, got ${env.version}`)
    expect(env.vehicle && env.vehicle.rc_number === RC_A, `vehicle rc wrong: ${JSON.stringify(env.vehicle)}`)
    expect(env.vehicle && env.vehicle.body_length_m !== null, 'body_length_m must default from the trucks catalog when omitted')
    truckA1 = env.vehicle.id
    expect(typeof truckA1 === 'string' && truckA1.length > 0, `vehicle id missing: ${JSON.stringify(env.vehicle)}`)

    // Assign the approved fleet driver (C6's cross-agency guard test depends on it).
    await db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, truckA1])

    const emp = await rows(`SELECT public.agency_driver_employment_create($1, $2, $3, $4, $5) AS r`,
      [driver1, 'DL-0420190001234', 'LMV-TR', '2027-06-30', '9810011223'])
    const empEnv = emp[0].r
    expect(empEnv && empEnv.ok === true && empEnv.state === 'created', `employment create must return created, got ${JSON.stringify(empEnv)}`)
    empA1 = empEnv.employment.id
  })

  await testCase('C2. agency B creates its own vehicle and employment; catalog body defaults are per vehicle type', async () => {
    await actAs(agencyBUser)
    const created = await rows(`SELECT public.agency_vehicle_create($1, $2) AS r`, [RC_B, 'bharatbenz_32ft'])
    const env = created[0].r
    expect(env && env.ok === true && env.state === 'created', `create must return created, got ${JSON.stringify(env)}`)
    truckB1 = env.vehicle.id
    // Catalog default for BharatBenz 32ft: length 9.45 (base_schema catalog row).
    expect(Number(env.vehicle.body_length_m) === 9.45, `body_length_m must default to the catalog 9.45 for bharatbenz_32ft, got ${env.vehicle.body_length_m}`)
    const emp = await rows(`SELECT public.agency_driver_employment_create($1) AS r`, [driver3])
    expect(emp[0].r && emp[0].r.ok === true && emp[0].r.state === 'created', `employment create wrong: ${JSON.stringify(emp[0].r)}`)
    empB1 = emp[0].r.employment.id
  })

  await testCase('C3. fleet rows are tenant-isolated: A sees and mutates only its own rows', async () => {
    await actAs(agencyAUser)
    const trucks = await rows(`SELECT id FROM public.agency_trucks`)
    expect(trucks.length === 1 && trucks[0].id === truckA1, `A must see exactly its own truck, saw ${JSON.stringify(trucks)}`)
    const emps = await rows(`SELECT id FROM public.agency_driver_employment`)
    expect(emps.length === 1 && emps[0].id === empA1, `A must see exactly its own employment, saw ${JSON.stringify(emps)}`)

    const updForeign = await rows(`UPDATE public.agency_trucks SET is_available = false WHERE id = $1 RETURNING id`, [truckB1])
    expect(updForeign.length === 0, 'A must not UPDATE B truck')
    const delForeign = await rows(`DELETE FROM public.agency_trucks WHERE id = $1 RETURNING id`, [truckB1])
    expect(delForeign.length === 0, 'A must not DELETE B truck')
    const updEmp = await rows(`UPDATE public.agency_driver_employment SET contact_phone = 'x' WHERE id = $1 RETURNING id`, [empB1])
    expect(updEmp.length === 0, 'A must not UPDATE B employment')
    const delEmp = await rows(`DELETE FROM public.agency_driver_employment WHERE id = $1 RETURNING id`, [empB1])
    expect(delEmp.length === 0, 'A must not DELETE B employment')
  })

  await testCase('C4. cross-agency RPC commands raise the fixed not-found denial (row must belong to the caller agency)', async () => {
    await actAs(agencyAUser)
    await expectError(
      db.query(`SELECT public.agency_vehicle_update($1, 1, '{}'::jsonb)`, [truckB1]),
      'Vehicle not found or access denied.'
    )
    await expectError(
      db.query(`SELECT public.agency_driver_employment_update($1, 1, '{}'::jsonb)`, [empB1]),
      'Employment record not found or access denied.'
    )
    await expectError(
      db.query(`SELECT public.agency_driver_employment_end($1, 1)`, [empB1]),
      'Employment record not found or access denied.'
    )
  })

  await testCase('C5. INSERT of an unknown vehicle_type violates the new catalog FK on the authenticated path', async () => {
    await actAs(agencyAUser)
    const message = await expectError(
      db.query(`INSERT INTO public.agency_trucks (agency_id, vehicle_type, rc_number) VALUES ($1, 'martian_rover', 'DL01XX9901')`, [agencyA]),
      'agency_trucks_vehicle_type_catalog_fkey'
    )
    expect(/foreign key/.test(message), `expected FK violation, got: ${message}`)
  })

  await testCase('C6. one-truck-per-driver guard messages still fire verbatim after the policy rewrite', async () => {
    // driver1 rides A's truckA1; B tries its own truckB1 with driver1.
    await actAs(agencyBUser)
    await expectError(
      db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, truckB1]),
      'Driver is already assigned to another agency.'
    )
    // Same agency second truck.
    await actAs(agencyAUser)
    const created = await rows(`SELECT public.agency_vehicle_create($1, $2) AS r`, ['DL01AA1102', 'tata_ace'])
    expect(created[0].r.ok === true, `second A vehicle must create, got ${JSON.stringify(created[0].r)}`)
    await expectError(
      db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver1, created[0].r.vehicle.id]),
      'Driver is already assigned to another truck.'
    )
    // Pending driver denied.
    await expectError(
      db.query(`UPDATE public.agency_trucks SET driver_id = $1 WHERE id = $2`, [driver2, truckA1]),
      'Driver is not approved for assignment.'
    )
  })

  // =========================================================================
  // D. Allocation eligibility predicates
  // =========================================================================
  let vClean
  let vMaintFlag
  let vMaintUntil
  await testCase('D1. agency_vehicle_allocation_eligible: clean vehicle true; NULL expiry dates do NOT block', async () => {
    await actAsService()
    vClean = await createTruckRow(agencyB, 'DL01BB3303', {})
    const eligible = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [vClean])
    expect(eligible[0].e === true, `clean available vehicle with all-NULL docs must be eligible, got ${eligible[0].e}`)
    const missing = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [uid()])
    expect(missing[0].e === false, 'unknown vehicle id must not be eligible')
  })

  await testCase('D2. each expired document blocks eligibility (insurance/fitness/permit/PUC, one case per document)', async () => {
    await actAsService()
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    // insurance: flip v_clean's insurance to yesterday -> false, back to tomorrow -> true.
    await db.query(`UPDATE public.agency_trucks SET insurance_expiry = $1 WHERE id = $2`, [yesterday, vClean])
    const insBlocked = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [vClean])
    expect(insBlocked[0].e === false, 'expired insurance must block eligibility')
    await db.query(`UPDATE public.agency_trucks SET insurance_expiry = $1 WHERE id = $2`, [tomorrow, vClean])
    const insRestored = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [vClean])
    expect(insRestored[0].e === true, 'future insurance must restore eligibility')

    const docCases = [
      ['fitness_expiry', 'DL01BB4404'],
      ['permit_expiry', 'DL01BB4505'],
      ['puc_expiry', 'DL01BB4606'],
    ]
    for (const [col, rc] of docCases) {
      const v = await createTruckRow(agencyB, rc, { [col]: yesterday })
      const blocked = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [v])
      expect(blocked[0].e === false, `expired ${col} must block eligibility`)
    }
  })

  await testCase('D3. maintenance blocks: flag and future blocked_until block; past blocked_until does not', async () => {
    await actAsService()
    vMaintFlag = await createTruckRow(agencyB, 'DL01BB5505', { maintenance_blocked: true, maintenance_block_reason: 'Brake overhaul' })
    const flagBlocked = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [vMaintFlag])
    expect(flagBlocked[0].e === false, 'maintenance_blocked = true must block eligibility')

    vMaintUntil = await createTruckRow(agencyB, 'DL01BB6606', { maintenance_blocked_until: new Date(Date.now() + 86400000).toISOString() })
    const untilBlocked = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [vMaintUntil])
    expect(untilBlocked[0].e === false, 'future maintenance_blocked_until must block eligibility')

    await db.query(`UPDATE public.agency_trucks SET maintenance_blocked_until = now() - interval '1 hour' WHERE id = $1`, [vMaintUntil])
    const untilPast = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [vMaintUntil])
    expect(untilPast[0].e === true, 'past maintenance_blocked_until must not block eligibility')
  })

  await testCase('D4. suspended owning agency makes its vehicles ineligible', async () => {
    await actAsService()
    const vSuspended = await createTruckRow(agencyC, 'DL01CC7707', {})
    const eligible = await rows(`SELECT public.agency_vehicle_allocation_eligible($1) AS e`, [vSuspended])
    expect(eligible[0].e === false, 'vehicle of a suspended agency must not be eligible')
  })

  await testCase('D5. agency_driver_allocation_eligible: active employment + approved driver + licence window', async () => {
    await actAsService()
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

    // driver1: active employment at A with NULL licence_expiry -> eligible (NULL does not block).
    const e1 = await rows(`SELECT public.agency_driver_allocation_eligible($1, $2) AS e`, [driver1, agencyA])
    expect(e1[0].e === true, 'approved driver with active employment and NULL licence_expiry must be eligible')

    // driver3: empB1 (C2, NULL licence) is ACTIVE — end it service-side first, then
    // seed an expired-licence employment (partial UNIQUE admits one active row).
    await db.query(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE id = $1`, [empB1])
    const empExp = await createEmploymentRow(agencyB, driver3, { licence_expiry: yesterday })
    const e2 = await rows(`SELECT public.agency_driver_allocation_eligible($1, $2) AS e`, [driver3, agencyB])
    expect(e2[0].e === false, 'expired licence_expiry must block driver eligibility')

    // Ended employment -> false (end it service-side; E pins the RPC end).
    await db.query(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE id = $1`, [empExp])
    const e3 = await rows(`SELECT public.agency_driver_allocation_eligible($1, $2) AS e`, [driver3, agencyB])
    expect(e3[0].e === false, 'ended employment must block driver eligibility')

    // Fresh active employment with future licence -> true.
    await createEmploymentRow(agencyB, driver3, { licence_expiry: tomorrow })
    const e4 = await rows(`SELECT public.agency_driver_allocation_eligible($1, $2) AS e`, [driver3, agencyB])
    expect(e4[0].e === true, 'active employment with future licence and approved driver must be eligible')

    // Non-approved driver -> false even with an active employment row (service-seeded).
    const empPending = await createEmploymentRow(agencyB, driver2, {})
    const e5 = await rows(`SELECT public.agency_driver_allocation_eligible($1, $2) AS e`, [driver2, agencyB])
    expect(e5[0].e === false, 'non-approved driver must not be eligible')
    await db.query(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE id = $1`, [empPending])

    // Cross-agency employment pair -> false.
    const e6 = await rows(`SELECT public.agency_driver_allocation_eligible($1, $2) AS e`, [driver1, agencyB])
    expect(e6[0].e === false, 'employment at another agency must not satisfy the pair predicate')
  })

  // =========================================================================
  // E. Expected-version conflict and idempotent replay
  // =========================================================================
  await testCase('E1. replayed create with the same (agency_id, rc_number) returns idempotent_replay with exactly one row', async () => {
    await actAs(agencyAUser)
    const replay = await rows(`SELECT public.agency_vehicle_create($1, $2) AS r`, [RC_A, 'eicher_14ft'])
    const env = replay[0].r
    expect(env && env.ok === true && env.state === 'idempotent_replay', `replay must return idempotent_replay, got ${JSON.stringify(env)}`)
    expect(env.vehicle.id === truckA1, `replay must return the SAME row, got ${JSON.stringify(env.vehicle && env.vehicle.id)}`)
    const count = await rows(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1 AND rc_number = $2`, [agencyA, RC_A])
    expect(count[0].n === 1, `replay must not create a second row, got ${count[0].n}`)
  })

  await testCase('E2. update RPC with the current version succeeds and returns version N+1 (exactly one bump)', async () => {
    await actAs(agencyAUser)
    const before = (await rows(`SELECT version FROM public.agency_trucks WHERE id = $1`, [truckA1]))[0].version
    const updated = await rows(`SELECT public.agency_vehicle_update($1, $2, $3::jsonb) AS r`, [truckA1, before, JSON.stringify({ is_available: false })])
    const env = updated[0].r
    expect(env && env.ok === true, `update must succeed, got ${JSON.stringify(env)}`)
    expect(env.version === before + 1, `version must bump exactly once to ${before + 1}, got ${env.version}`)
    expect(env.vehicle.is_available === false, 'patch must apply')
  })

  await testCase('E3. stale-version update returns the typed conflict envelope and leaves the row byte-identical', async () => {
    await actAs(agencyAUser)
    const before = (await rows(`SELECT to_jsonb(t) AS j FROM public.agency_trucks t WHERE id = $1`, [truckA1]))[0].j
    const current = before.version
    const stale = await rows(`SELECT public.agency_vehicle_update($1, $2, $3::jsonb) AS r`, [truckA1, current - 1, JSON.stringify({ is_available: true })])
    const env = stale[0].r
    expect(env && env.ok === false && env.error === 'version_conflict', `stale update must return the conflict envelope, got ${JSON.stringify(env)}`)
    expect(env.current_version === current, `conflict must report current_version ${current}, got ${env.current_version}`)
    const after = (await rows(`SELECT to_jsonb(t) AS j FROM public.agency_trucks t WHERE id = $1`, [truckA1]))[0].j
    expect(JSON.stringify(after) === JSON.stringify(before), 'row must be byte-identical after a rejected update')
  })

  await testCase('E4. version trigger: plain UPDATE bumps exactly once; an explicit version set is not double-bumped', async () => {
    await actAsService()
    const start = (await rows(`SELECT version FROM public.agency_trucks WHERE id = $1`, [truckA1]))[0].version
    await db.query(`UPDATE public.agency_trucks SET notes = 'plain update' WHERE id = $1`, [truckA1])
    const afterPlain = (await rows(`SELECT version FROM public.agency_trucks WHERE id = $1`, [truckA1]))[0].version
    expect(afterPlain === start + 1, `plain UPDATE must bump version exactly once (${start} -> ${afterPlain})`)

    await db.query(`UPDATE public.agency_trucks SET version = version + 1, notes = 'explicit set' WHERE id = $1`, [truckA1])
    const afterExplicit = (await rows(`SELECT version FROM public.agency_trucks WHERE id = $1`, [truckA1]))[0].version
    expect(afterExplicit === afterPlain + 1, `explicit version set must not be double-bumped (${afterPlain} -> ${afterExplicit})`)
  })

  await testCase('E5. employment end: success bumps N+1; replay returns already_ended without a second bump; stale returns the conflict', async () => {
    await actAs(agencyAUser)
    const current = (await rows(`SELECT version FROM public.agency_driver_employment WHERE id = $1`, [empA1]))[0].version
    const ended = await rows(`SELECT public.agency_driver_employment_end($1, $2) AS r`, [empA1, current])
    let env = ended[0].r
    expect(env && env.ok === true && env.state === 'ended', `end must return {state:'ended'}, got ${JSON.stringify(env)}`)
    expect(env.version === current + 1, `end must bump version to ${current + 1}, got ${env.version}`)

    const replay = await rows(`SELECT public.agency_driver_employment_end($1, $2) AS r`, [empA1, current + 1])
    env = replay[0].r
    expect(env && env.ok === true && env.state === 'already_ended', `replayed end must return already_ended, got ${JSON.stringify(env)}`)
    expect(env.version === current + 1, `replayed end must not bump again, got ${env.version}`)

    const stale = await rows(`SELECT public.agency_driver_employment_end($1, $2) AS r`, [empA1, current])
    env = stale[0].r
    expect(env && env.ok === false && env.error === 'version_conflict' && env.current_version === current + 1,
      `stale end must return the conflict envelope, got ${JSON.stringify(env)}`)
  })

  await testCase('E6. partial UNIQUE: a second ACTIVE employment for the same driver is rejected; ended + new active is allowed', async () => {
    await actAsService()
    // driver3 holds one ACTIVE employment at B (D5, future licence).
    const active3 = (await rows(`SELECT id FROM public.agency_driver_employment WHERE driver_id = $1 AND status = 'active'`, [driver3]))
    expect(active3.length === 1, `driver3 fixture must hold exactly one active employment, got ${active3.length}`)
    const message = await expectError(
      createEmploymentRow(agencyA, driver3, {}),
      'agency_driver_employment_one_active_per_driver'
    )
    expect(/duplicate key|unique constraint/i.test(message), `second active employment must hit the partial unique index, got: ${message}`)
    await db.query(`UPDATE public.agency_driver_employment SET status = 'ended' WHERE id = $1`, [active3[0].id])
    const rehired = await createEmploymentRow(agencyA, driver3, {})
    expect(typeof rehired === 'string', 'ended employment must free the driver for a new active row')
  })

  // =========================================================================
  // F. Suspended/pending/rejected fail closed mid-session; DELETE is ownership-only
  // =========================================================================
  await testCase('F1. mid-session approved->suspended flip denies direct INSERT/UPDATE on both tables at RLS', async () => {
    await actAsService()
    await db.query(`UPDATE public.transport_agencies SET status = 'suspended' WHERE id = $1`, [agencyA])
    const status = (await rows(`SELECT status FROM public.transport_agencies WHERE id = $1`, [agencyA]))[0].status
    expect(status === 'suspended', `fixture flip must land, got ${status}`)

    await actAs(agencyAUser) // SAME JWT claims, no re-login
    await expectError(
      db.query(`INSERT INTO public.agency_trucks (agency_id, vehicle_type, rc_number) VALUES ($1, 'tata_ace', 'DL01AA8808')`, [agencyA]),
      'new row violates row-level security policy'
    )
    await expectError(
      db.query(`UPDATE public.agency_trucks SET is_available = true WHERE id = $1`, [truckA1]),
      'new row violates row-level security policy'
    )
    await expectError(
      db.query(`INSERT INTO public.agency_driver_employment (agency_id, driver_id) VALUES ($1, $2)`, [agencyA, driver3]),
      'new row violates row-level security policy'
    )
    await expectError(
      db.query(`UPDATE public.agency_driver_employment SET contact_phone = '999' WHERE id = $1`, [empA1]),
      'new row violates row-level security policy'
    )
  })

  await testCase('F2. suspended agency RPC commands raise "Agency approval is required."', async () => {
    await actAs(agencyAUser)
    for (const [sql, params] of [
      [`SELECT public.agency_vehicle_create($1, $2)`, [RC_A, 'eicher_14ft']],
      [`SELECT public.agency_vehicle_update($1, 1, '{}'::jsonb)`, [truckA1]],
      [`SELECT public.agency_driver_employment_create($1)`, [driver3]],
      [`SELECT public.agency_driver_employment_update($1, 1, '{}'::jsonb)`, [empA1]],
      [`SELECT public.agency_driver_employment_end($1, 1)`, [empA1]],
    ]) {
      await expectError(db.query(sql, params), 'Agency approval is required.')
    }
  })

  await testCase('F3. suspended owner keeps reads (portal renders) and CANNOT flip its own status', async () => {
    await actAs(agencyAUser)
    const trucks = await rows(`SELECT id FROM public.agency_trucks`)
    expect(trucks.length >= 1, 'suspended owner must keep SELECT on its own fleet')
    const emps = await rows(`SELECT id FROM public.agency_driver_employment`)
    expect(emps.length >= 1, 'suspended owner must keep SELECT on its own employments')

    const flipped = await rows(`UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1 RETURNING status`, [agencyA])
    expect(flipped.length === 1 && flipped[0].status === 'suspended', `owner status flip must be reverted by the guard, got ${JSON.stringify(flipped)}`)
  })

  await testCase('F4. DELETE is ownership-only per the TO-142 precedent: suspended owner CAN delete own rows', async () => {
    await actAs(agencyAUser)
    const delTruck = await rows(`DELETE FROM public.agency_trucks WHERE id = $1 RETURNING id`, [truckA1])
    expect(delTruck.length === 1, 'suspended owner must be able to DELETE its own vehicle row (pinned ownership-only DELETE)')
    const delEmp = await rows(`DELETE FROM public.agency_driver_employment WHERE id = $1 RETURNING id`, [empA1])
    expect(delEmp.length === 1, 'suspended owner must be able to DELETE its own employment row (pinned ownership-only DELETE)')
  })

  await testCase('F5. pending and rejected agencies fail closed identically (direct + RPC)', async () => {
    for (const [user, agencyId] of [[agencyDUser, agencyD], [agencyEUser, agencyE]]) {
      await actAs(user)
      await expectError(
        db.query(`INSERT INTO public.agency_trucks (agency_id, vehicle_type, rc_number) VALUES ($1, 'tata_ace', 'DL01ZZ0001')`, [agencyId]),
        'new row violates row-level security policy'
      )
      await expectError(db.query(`SELECT public.agency_vehicle_create($1, $2)`, ['DL01ZZ0002', 'tata_ace']), 'Agency approval is required.')
      await expectError(db.query(`SELECT public.agency_driver_employment_create($1)`, [driver3]), 'Agency approval is required.')
    }
  })

  // =========================================================================
  // G. Agency resolution is deterministic and fail-closed
  // =========================================================================
  await testCase('G1. zero transport_agencies rows -> "No agency profile found for this account."', async () => {
    await actAsService()
    const lonelyUser = await createUser('fleet-lonely')
    await actAs(lonelyUser)
    for (const [sql, params] of [
      [`SELECT public.agency_vehicle_create($1, $2)`, ['DL01ZZ0003', 'tata_ace']],
      [`SELECT public.agency_vehicle_update($1, 1, '{}'::jsonb)`, [uid()]],
      [`SELECT public.agency_driver_employment_create($1)`, [driver3]],
      [`SELECT public.agency_driver_employment_end($1, 1)`, [uid()]],
    ]) {
      await expectError(db.query(sql, params), 'No agency profile found for this account.')
    }
  })

  await testCase('G2. two transport_agencies rows for one user -> "Multiple agency profiles found for this account."', async () => {
    await actAsService()
    const dupUser = await createUser('fleet-dup')
    await createAgencyRow(dupUser, 'DupOne', 'approved')
    await createAgencyRow(dupUser, 'DupTwo', 'approved')
    await actAs(dupUser)
    await expectError(db.query(`SELECT public.agency_vehicle_create($1, $2)`, ['DL01ZZ0004', 'tata_ace']),
      'Multiple agency profiles found for this account.')
    await expectError(db.query(`SELECT public.agency_driver_employment_end($1, 1)`, [uid()]),
      'Multiple agency profiles found for this account.')
  })

  // =========================================================================
  // H. Regression guards: anon, admin visibility
  // =========================================================================
  await testCase('H1. anon reads and writes nothing on both tables', async () => {
    await actAsAnon()
    const trucks = await rows(`SELECT count(*)::int AS n FROM public.agency_trucks`)
    expect(trucks[0].n === 0, `anon must not read agency_trucks, got ${trucks[0].n}`)
    const emps = await rows(`SELECT count(*)::int AS n FROM public.agency_driver_employment`)
    expect(emps[0].n === 0, `anon must not read agency_driver_employment, got ${emps[0].n}`)
    await expectError(
      db.query(`INSERT INTO public.agency_trucks (agency_id, vehicle_type, rc_number) VALUES ($1, 'tata_ace', 'ANON1')`, [uid()]),
      'new row violates row-level security policy'
    )
  })

  await testCase('H2. admin retains full fleet visibility across agencies', async () => {
    await actAsService()
    const adminUser = await createUser('fleet-admin')
    await db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [adminUser])
    const totalTrucks = (await rows(`SELECT count(*)::int AS n FROM public.agency_trucks`))[0].n
    const totalEmps = (await rows(`SELECT count(*)::int AS n FROM public.agency_driver_employment`))[0].n
    expect(totalTrucks > 0 && totalEmps > 0, `fixture rows must exist for the admin check, got trucks=${totalTrucks} emps=${totalEmps}`)

    await actAs(adminUser)
    const seenTrucks = (await rows(`SELECT count(*)::int AS n FROM public.agency_trucks`))[0].n
    const seenEmps = (await rows(`SELECT count(*)::int AS n FROM public.agency_driver_employment`))[0].n
    expect(seenTrucks === totalTrucks, `admin must see all vehicles (${seenTrucks}/${totalTrucks})`)
    expect(seenEmps === totalEmps, `admin must see all employments (${seenEmps}/${totalEmps})`)
  })

  // -------------------------------------------------------------------------
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} cases passed (SQL-level, PostgreSQL engine, fleet-foundation contract)`)
  if (findings.length > 0) {
    console.log(`${findings.length} finding(s) recorded separately (defects/gaps reproduced, not counted as passing cases):`)
    for (const f of findings) console.log(`  - ${f.name}: ${f.detail}`)
  }
  if (failed.length > 0) {
    console.log('failed cases:')
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`)
  }
  if (failed.length > 0) process.exit(1)
}

main()
  .catch((error) => {
    console.error('FAIL (harness error):', error && error.message ? error.message : error)
    if (error && error.stack) console.error(error.stack.split('\n').slice(1, 5).join('\n'))
    process.exit(1)
  })
  .finally(async () => {
    await db.close()
  })
