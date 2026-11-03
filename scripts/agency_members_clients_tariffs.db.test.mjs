#!/usr/bin/env node
/**
 * TO-144-D2 — agency memberships/invitations, client agreements (bill-to/ship-to
 * sites and contacts), tariff effective versions and driver invitations
 * (red-first contract battery).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain, then pins the backend authority model
 * through the same SQL surfaces the portal uses: real RLS, real role switching
 * (`SET ROLE authenticated` + `request.jwt.claims`, what PostgREST does), real
 * triggers and real SECURITY DEFINER command RPCs.
 *
 * Pinned contract (migration 20261011000000_agency_members_clients_tariffs.sql):
 *   - memberships: owner-only invite / invitation revoke / membership revoke /
 *     scope change; token-hashed one-use invitations with expiry and recipient
 *     binding; scope vocabulary excludes 'owner'; no self-escalation;
 *   - client agreements per agency with versioned bill-to/ship-to sites and
 *     contacts, expected-version updates, idempotent creates;
 *   - tariff versions per agreement lane: append-only (immutable rows),
 *     supersede-by-new-version with expected head, non-overlapping effective
 *     ranges, service-only effective-rate lookup;
 *   - driver invitations (token-hashed, expiry, phone binding) linked to the
 *     D1 agency_driver_employment record on accept.
 *
 * Evidence class: local DB only (PGlite, single session). No hosted round-trip.
 *
 * Usage:  node scripts/agency_members_clients_tariffs.db.test.mjs
 * Exit code 0 = every case passed; any failure exits 1. A missing PGlite
 * install is a loud failure, never a silent skip.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const D2_MIGRATION = '20261011000000_agency_members_clients_tariffs.sql'
const RESERVATION_MIGRATION = '20261010000000_fleet_assignment_reservations.sql'

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

/** Per-case resilience: a failing case records FAIL and the battery keeps running. */
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
const emailOf = new Map()

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify({}),
  ])
  await db.query(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  emailOf.set(id, email)
  return id
}

async function createAgencyRow(userId, tag, status = 'approved') {
  const id = uid()
  await db.query(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number)
     VALUES ($1, $2, $3, 'Delhi', $4, $5, $6)`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, `07ABCDE${1000 + seq}A1Z5`, `ABCDE${4000 + seq}Q`]
  )
  return id
}

async function createDriverRow(userId, tag, status, phone) {
  const id = uid()
  await db.query(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, is_online, pan_number)
     VALUES ($1, $2, $3, $4, 'eicher_14ft', $5, true, 'ABCDE1234F')`,
    [id, userId, `${tag} Driver`, phone, status]
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

async function actAsService() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
}

async function rows(sql, params = []) {
  const result = await db.query(sql, params)
  return result.rows
}

/** `SELECT public.<fn>(...) AS r` — returns the jsonb envelope. */
async function callRpc(call, params = []) {
  const result = await db.query(`SELECT ${call} AS r`, params)
  return result.rows[0].r
}

function expectOk(env, state, label) {
  expect(
    env && env.ok === true && (state === undefined || env.state === state),
    `${label}: expected ok/${state ?? 'any'}, got ${JSON.stringify(env)}`
  )
}

function expectDenied(env, error, label) {
  expect(
    env && env.ok === false && env.error === error,
    `${label}: expected ok:false ${error}, got ${JSON.stringify(env)}`
  )
}

const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

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
  // A. Chain replay, schema, privilege and signature contract
  // =========================================================================
  await testCase('A1. migration chain replays cleanly and the D2 migration sorts after the reservation migration', async () => {
    expect(applied.includes(D2_MIGRATION), `D2 migration missing from chain (last=${last})`)
    expect(applied.indexOf(D2_MIGRATION) > applied.indexOf(RESERVATION_MIGRATION),
      'D2 migration must sort after the reservation migration')
  })

  const NEW_TABLES = [
    'agency_memberships',
    'agency_invitations',
    'agency_driver_invitations',
    'agency_client_agreements',
    'agency_client_sites',
    'agency_client_contacts',
    'agency_tariff_versions',
  ]

  await testCase('A2. the seven D2 tables exist with row-level security enabled', async () => {
    const found = await rows(`
      SELECT c.relname::text AS name, c.relrowsecurity AS rls
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
    `, [NEW_TABLES])
    expect(found.length === NEW_TABLES.length, `expected ${NEW_TABLES.length} tables, found ${JSON.stringify(found.map((f) => f.name))}`)
    const noRls = found.filter((f) => f.rls !== true).map((f) => f.name)
    expect(noRls.length === 0, `RLS not enabled on: ${JSON.stringify(noRls)}`)
  })

  await testCase('A3. authenticated has NO direct write privilege on any D2 table (writes only through RPCs)', async () => {
    for (const table of NEW_TABLES) {
      for (const priv of ['INSERT', 'UPDATE', 'DELETE']) {
        const r = await rows(`SELECT has_table_privilege('authenticated', $1, $2) AS ok`, [`public.${table}`, priv])
        expect(r[0].ok === false, `authenticated must not hold ${priv} on ${table}`)
      }
      const s = await rows(`SELECT has_table_privilege('anon', $1, 'SELECT') AS ok`, [`public.${table}`])
      expect(s[0].ok === false, `anon must not read ${table}`)
    }
  })

  await testCase('A4. invitation token is stored only as a hash: token_hash exists, no raw-token column, and authenticated cannot read it', async () => {
    for (const table of ['agency_invitations', 'agency_driver_invitations']) {
      const cols = await rows(`SELECT column_name::text AS name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])
      const names = cols.map((c) => c.name)
      expect(names.includes('token_hash'), `${table}.token_hash missing`)
      expect(!names.some((n) => /^(token|raw_token|token_plain|secret)$/.test(n)), `${table} must not carry a raw token column: ${JSON.stringify(names)}`)
      const hashCheck = await rows(`
        SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
        WHERE conrelid = $1::regclass AND contype = 'c'
      `, [`public.${table}`])
      expect(hashCheck.some((c) => /length\(token_hash\)|char_length\(token_hash\)|token_hash/.test(c.def)),
        `${table} must constrain token_hash (sha-256 hex) with a CHECK`)
      const priv = await rows(`SELECT has_column_privilege('authenticated', $1, 'token_hash', 'SELECT') AS ok`, [`public.${table}`])
      expect(priv[0].ok === false, `authenticated must not SELECT ${table}.token_hash`)
      const contactColumn = table === 'agency_invitations' ? 'invited_email' : 'invited_phone'
      const visible = await rows(`SELECT has_column_privilege('authenticated', $1, $2, 'SELECT') AS ok`, [`public.${table}`, contactColumn])
      expect(visible[0].ok === true, `${table} must grant SELECT on its non-secret ${contactColumn} column`)
    }
  })

  await testCase('A5. every D2 command RPC takes NO agency/org id argument (tenant derives from auth.uid())', async () => {
    const commands = {
      agency_member_invite: ['p_invited_email', 'p_scope', 'p_expires_in_days', 'p_idempotency_key'],
      agency_member_invitation_revoke: ['p_invitation_id', 'p_expected_version'],
      agency_member_accept: ['p_token'],
      agency_member_revoke: ['p_membership_id', 'p_expected_version'],
      agency_member_change_scope: ['p_membership_id', 'p_expected_version', 'p_scope'],
      agency_client_agreement_create: ['p_client_name', 'p_client_gstin', 'p_payment_terms_days', 'p_idempotency_key'],
      agency_client_agreement_update: ['p_agreement_id', 'p_expected_version', 'p_patch'],
      agency_client_site_create: ['p_agreement_id', 'p_site_kind', 'p_label', 'p_address_line', 'p_city', 'p_state', 'p_pincode', 'p_idempotency_key'],
      agency_client_site_update: ['p_site_id', 'p_expected_version', 'p_patch'],
      agency_client_contact_create: ['p_agreement_id', 'p_full_name', 'p_phone', 'p_email', 'p_site_id', 'p_idempotency_key'],
      agency_client_contact_update: ['p_contact_id', 'p_expected_version', 'p_patch'],
      agency_tariff_version_publish: ['p_agreement_id', 'p_origin', 'p_destination', 'p_rate_basis', 'p_rate_amount', 'p_effective_from', 'p_vehicle_type', 'p_effective_to', 'p_supersedes_version_id', 'p_idempotency_key'],
      agency_driver_invitation_create: ['p_invited_phone', 'p_expires_in_days', 'p_idempotency_key'],
      agency_driver_invitation_revoke: ['p_invitation_id', 'p_expected_version'],
      agency_driver_invitation_accept: ['p_token'],
    }
    const predicates = {
      agency_member_has_scope: ['p_agency_id', 'p_scope'],
      agency_tariff_rate_at: ['p_agreement_id', 'p_origin', 'p_destination', 'p_vehicle_type', 'p_as_of'],
    }
    for (const [fnName, argNames] of Object.entries({ ...commands, ...predicates })) {
      const fns = await rows(`
        SELECT p.proargnames::text[] AS argnames
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = $1
      `, [fnName])
      expect(fns.length >= 1, `function public.${fnName} missing`)
      expect(JSON.stringify(fns[0].argnames) === JSON.stringify(argNames),
        `${fnName} argnames must be ${JSON.stringify(argNames)}, got ${JSON.stringify(fns[0].argnames)}`)
    }
    for (const [fnName, argNames] of Object.entries(commands)) {
      for (const a of argNames) {
        expect(!/^(p_)?(agency|org)_?id$/.test(a), `${fnName} must not accept an agency/org id argument, found ${a}`)
      }
    }
  })

  await testCase('A6. command RPCs are SECURITY DEFINER with a pinned search_path and no anon EXECUTE', async () => {
    const fns = await rows(`
      SELECT p.proname::text AS name, p.prosecdef AS definer, p.proconfig::text[] AS config,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname ~ '^agency_(member|client|tariff|driver_invitation)'
    `)
    expect(fns.length === 17, `expected exactly 17 D2 command/predicate functions, found ${fns.length}`)
    for (const f of fns) {
      expect(f.definer === true, `${f.name} must be SECURITY DEFINER`)
      expect(JSON.stringify(f.config || []).includes('search_path'), `${f.name} must pin search_path`)
      expect(f.anon_exec === false, `${f.name} must not be executable by anon`)
    }
  })

  // =========================================================================
  // B. Fixtures: agencies (approved A and B, suspended C), staff and drivers
  // =========================================================================
  let ownerA, ownerB, ownerC, dispatcher, viewer, intruder, revokedInvitee
  let driverOk, driverPending, driverOther, driverFourth
  let driverRowOk, driverRowOther
  let agencyA, agencyB, agencyC

  {
    await actAsService()
    ownerA = await createUser('d2-owner-a')
    ownerB = await createUser('d2-owner-b')
    ownerC = await createUser('d2-owner-c')
    dispatcher = await createUser('d2-dispatcher')
    viewer = await createUser('d2-viewer')
    intruder = await createUser('d2-intruder')
    revokedInvitee = await createUser('d2-revoked')
    driverOk = await createUser('d2-driver-ok')
    driverPending = await createUser('d2-driver-pending')
    driverOther = await createUser('d2-driver-other')
    driverFourth = await createUser('d2-driver-fourth')
    agencyA = await createAgencyRow(ownerA, 'D2 Alpha', 'approved')
    agencyB = await createAgencyRow(ownerB, 'D2 Bravo', 'approved')
    agencyC = await createAgencyRow(ownerC, 'D2 Charlie', 'suspended')
    driverRowOk = await createDriverRow(driverOk, 'D2 Ok', 'approved', '9800000001')
    await createDriverRow(driverPending, 'D2 Pending', 'pending', '9800000002')
    driverRowOther = await createDriverRow(driverOther, 'D2 Other', 'approved', '9800000003')
    await createDriverRow(driverFourth, 'D2 Fourth', 'approved', '9800000004')
  }

  // =========================================================================
  // C. Membership invitations (owner-only, token-hashed, idempotent)
  // =========================================================================
  const KEY_INV_DISPATCHER = 'member-invite-dispatcher-1'
  let inviteToken
  let inviteId

  await testCase('C1. owner A invites a dispatcher: created, one-time token returned, invitation pending with the requested scope', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_invite($1, $2, $3, $4)`,
      [emailOf.get(dispatcher), 'dispatcher', 7, KEY_INV_DISPATCHER])
    expectOk(env, 'created', 'C1')
    expect(typeof env.token === 'string' && /^[0-9a-f]{64}$/.test(env.token), `token must be 64 hex chars, got ${JSON.stringify(env.token)}`)
    expect(env.invitation && env.invitation.status === 'pending' && env.invitation.scope === 'dispatcher',
      `invitation must be pending/dispatcher: ${JSON.stringify(env.invitation)}`)
    inviteToken = env.token
    inviteId = env.invitation.id
  })

  await testCase('C2. the invitation token is persisted only as its SHA-256 hash (never the raw token)', async () => {
    await actAsService()
    const r = await rows(`SELECT token_hash, row_to_json(i)::text AS whole FROM public.agency_invitations i WHERE id = $1`, [inviteId])
    expect(r.length === 1, 'invitation row missing')
    expect(r[0].token_hash === sha256Hex(inviteToken), 'token_hash must equal sha256 hex of the returned token')
    expect(!r[0].whole.includes(inviteToken), 'raw token must not appear anywhere in the stored row')
  })

  await testCase('C3. cross-agency read: owner B cannot see agency A invitations', async () => {
    await actAs(ownerB)
    const seen = await rows(`SELECT id FROM public.agency_invitations WHERE id = $1`, [inviteId])
    expect(seen.length === 0, `B must see 0 of A's invitations, saw ${seen.length}`)
  })

  await testCase('C4. owner B cannot revoke agency A invitation (fixed not-found denial)', async () => {
    await actAs(ownerB)
    await expectError(
      db.query(`SELECT public.agency_member_invitation_revoke($1, 1)`, [inviteId]),
      'Invitation not found or access denied.'
    )
  })

  await testCase('C5. no self-escalation: an agency owner cannot invite its own email', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'viewer', 7, 'self-invite-1')`, [emailOf.get(ownerA)]),
      'An agency owner cannot be invited to its own agency.'
    )
  })

  await testCase('C6. the scope vocabulary rejects owner-level and unknown scopes (no privilege minting)', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'owner', 7, 'scope-owner-1')`, [emailOf.get(viewer)]),
      'Unknown membership scope.'
    )
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'superadmin', 7, 'scope-super-1')`, [emailOf.get(viewer)]),
      'Unknown membership scope.'
    )
  })

  await testCase('C7. the table CHECK rejects an owner scope even for a direct superuser insert', async () => {
    await actAsService()
    await expectError(
      db.query(`INSERT INTO public.agency_memberships (agency_id, user_id, scope) VALUES ($1, $2, 'owner')`, [agencyA, viewer]),
      'violates check constraint'
    )
  })

  await testCase('C8. invite is idempotent per agency: same key and same payload replays without a second invitation', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_invite($1, $2, $3, $4)`,
      [emailOf.get(dispatcher), 'dispatcher', 7, KEY_INV_DISPATCHER])
    expectOk(env, 'idempotent_replay', 'C8')
    expect(env.token === undefined, 'replay must not re-issue a raw token')
    await actAsService()
    const count = await rows(`SELECT count(*)::int AS n FROM public.agency_invitations WHERE agency_id = $1 AND idempotency_key = $2`, [agencyA, KEY_INV_DISPATCHER])
    expect(count[0].n === 1, `expected 1 invitation for the key, found ${count[0].n}`)
  })

  await testCase('C9. same idempotency key with a different payload is rejected (key reuse)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_invite($1, $2, $3, $4)`,
      [emailOf.get(viewer), 'viewer', 7, KEY_INV_DISPATCHER])
    expectDenied(env, 'idempotency_key_reused', 'C9')
  })

  await testCase('C10. a second pending invitation for the same email is rejected (new key)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_invite($1, $2, $3, $4)`,
      [emailOf.get(dispatcher), 'finance', 7, 'member-invite-dispatcher-dup'])
    expectDenied(env, 'invitation_already_pending', 'C10')
  })

  await testCase('C11. invitation expiry and email shape are validated (1..30 days, well-formed email)', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'viewer', 0, 'expiry-zero-1')`, [emailOf.get(viewer)]),
      'Invitation expiry must be between 1 and 30 days.'
    )
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'viewer', 31, 'expiry-big-1')`, [emailOf.get(viewer)]),
      'Invitation expiry must be between 1 and 30 days.'
    )
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'viewer', 7, 'bad-email-1')`, ['not-an-email']),
      'Invited email is invalid.'
    )
  })

  await testCase('C12. a suspended owner cannot invite (fail-closed on agency status)', async () => {
    await actAs(ownerC)
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'viewer', 7, 'suspended-invite-1')`, [emailOf.get(viewer)]),
      'Agency approval is required.'
    )
  })

  await testCase('C13. a non-owner (no agency profile) cannot invite: staff never grant roles', async () => {
    // The dispatcher has not accepted yet; a bare user has no profile at all.
    await actAs(intruder)
    await expectError(
      db.query(`SELECT public.agency_member_invite($1, 'viewer', 7, 'intruder-invite-1')`, [emailOf.get(viewer)]),
      'No agency profile found for this account.'
    )
  })

  // =========================================================================
  // D. Membership acceptance (token, recipient binding, expiry, replay)
  // =========================================================================
  let membershipDispatcherId

  await testCase('D1. the invited dispatcher accepts: active membership with the invited scope', async () => {
    await actAs(dispatcher)
    const env = await callRpc(`public.agency_member_accept($1)`, [inviteToken])
    expectOk(env, 'accepted', 'D1')
    expect(env.membership && env.membership.scope === 'dispatcher' && env.membership.status === 'active',
      `membership must be active/dispatcher: ${JSON.stringify(env.membership)}`)
    membershipDispatcherId = env.membership.id
  })

  await testCase('D2. scope predicate: dispatcher holds dispatcher only; owner holds scopes; foreign agency denied', async () => {
    await actAs(dispatcher)
    const own = await rows(`SELECT public.agency_member_has_scope($1, 'dispatcher') AS ok`, [agencyA])
    expect(own[0].ok === true, 'dispatcher must hold dispatcher scope in A')
    const finance = await rows(`SELECT public.agency_member_has_scope($1, 'finance') AS ok`, [agencyA])
    expect(finance[0].ok === false, 'dispatcher must NOT hold finance (payroll/finance) scope')
    const foreign = await rows(`SELECT public.agency_member_has_scope($1, 'dispatcher') AS ok`, [agencyB])
    expect(foreign[0].ok === false, 'dispatcher must NOT hold any scope in agency B')
    await actAs(ownerA)
    const owner = await rows(`SELECT public.agency_member_has_scope($1, 'finance') AS ok`, [agencyA])
    expect(owner[0].ok === true, 'owner must hold every scope in its own operational agency')
  })

  await testCase('D3. accepting again by the same user replays idempotently without a second membership', async () => {
    await actAs(dispatcher)
    const env = await callRpc(`public.agency_member_accept($1)`, [inviteToken])
    expectOk(env, 'idempotent_replay', 'D3')
    await actAsService()
    const count = await rows(`SELECT count(*)::int AS n FROM public.agency_memberships WHERE agency_id = $1 AND user_id = $2 AND status = 'active'`, [agencyA, dispatcher])
    expect(count[0].n === 1, `expected exactly one active membership, found ${count[0].n}`)
  })

  await testCase('D4. replayed token used by a different user is rejected (invitation is one-use)', async () => {
    await actAs(intruder)
    const env = await callRpc(`public.agency_member_accept($1)`, [inviteToken])
    expectDenied(env, 'invitation_not_pending', 'D4')
  })

  let viewerInviteToken
  await testCase('D5. recipient binding: a token for another email is rejected and creates no membership', async () => {
    await actAs(ownerA)
    const created = await callRpc(`public.agency_member_invite($1, 'viewer', 7, $2)`, [emailOf.get(viewer), 'member-invite-viewer-1'])
    expectOk(created, 'created', 'D5 setup')
    viewerInviteToken = created.token
    await actAs(intruder)
    const env = await callRpc(`public.agency_member_accept($1)`, [viewerInviteToken])
    expectDenied(env, 'invitation_recipient_mismatch', 'D5')
    await actAsService()
    const r = await rows(`SELECT count(*)::int AS n FROM public.agency_memberships WHERE user_id = $1`, [intruder])
    expect(r[0].n === 0, 'a mismatched recipient must not gain a membership')
  })

  await testCase('D6. an expired invitation is rejected (expiry enforced at accept time)', async () => {
    await actAsService()
    await db.query(`UPDATE public.agency_invitations SET expires_at = now() - interval '1 hour' WHERE idempotency_key = 'member-invite-viewer-1'`)
    await actAs(viewer)
    const env = await callRpc(`public.agency_member_accept($1)`, [viewerInviteToken])
    expectDenied(env, 'invitation_expired', 'D6')
  })

  await testCase('D7. a revoked invitation is rejected at accept time', async () => {
    await actAs(ownerA)
    const created = await callRpc(`public.agency_member_invite($1, 'viewer', 7, 'member-invite-revoked-1')`, [emailOf.get(revokedInvitee)])
    expectOk(created, 'created', 'D7 setup')
    const revokedId = created.invitation.id
    const revoke = await callRpc(`public.agency_member_invitation_revoke($1, $2)`, [revokedId, created.invitation.version])
    expectOk(revoke, 'revoked', 'D7 revoke')
    await actAs(revokedInvitee)
    const env = await callRpc(`public.agency_member_accept($1)`, [created.token])
    expectDenied(env, 'invitation_revoked', 'D7')
  })

  await testCase('D8. an unknown token is rejected generically (no enumeration detail)', async () => {
    await actAs(intruder)
    const env = await callRpc(`public.agency_member_accept($1)`, ['f'.repeat(64)])
    expectDenied(env, 'invitation_invalid', 'D8')
  })

  await testCase('D9. defense in depth: an agency owner cannot accept a membership for its own agency', async () => {
    // Seed an owner-addressed invitation directly (superuser), with a known token.
    const seedToken = 'a'.repeat(63) + 'b'
    await actAsService()
    await db.query(`
      INSERT INTO public.agency_invitations
        (agency_id, invited_email, scope, token_hash, status, expires_at, created_by, idempotency_key)
      VALUES ($1, $2, 'viewer', $3, 'pending', now() + interval '1 day', $4, 'self-accept-seed')
    `, [agencyA, emailOf.get(ownerA), sha256Hex(seedToken), ownerA])
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_member_accept($1)`, [seedToken]),
      'An agency owner cannot accept a membership for its own agency.'
    )
  })

  await testCase('D10. already-active member accepting a fresh invitation keeps the existing scope (no escalation)', async () => {
    await actAs(ownerA)
    const created = await callRpc(`public.agency_member_invite($1, 'finance', 7, 'member-invite-escalate-1')`, [emailOf.get(dispatcher)])
    expectOk(created, 'created', 'D10 setup')
    await actAs(dispatcher)
    const env = await callRpc(`public.agency_member_accept($1)`, [created.token])
    expectOk(env, 'already_member', 'D10')
    expect(env.membership && env.membership.scope === 'dispatcher', `scope must stay dispatcher, got ${env.membership && env.membership.scope}`)
    await actAs(dispatcher)
    const finance = await rows(`SELECT public.agency_member_has_scope($1, 'finance') AS ok`, [agencyA])
    expect(finance[0].ok === false, 'the second invitation must not grant finance scope')
  })

  await testCase('D11. a suspended agency cannot accept new memberships (fail-closed)', async () => {
    await actAsService()
    await db.query(`UPDATE public.transport_agencies SET status = 'suspended' WHERE id = $1`, [agencyA])
    await actAs(viewer)
    await expectError(
      db.query(`SELECT public.agency_member_accept($1)`, [viewerInviteToken]),
      'Agency approval is required.'
    )
    await actAsService()
    await db.query(`UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [agencyA])
  })

  let membershipViewerId
  await testCase('D12. the invited viewer accepts within expiry: active viewer membership', async () => {
    // D6 pushed this invitation past expiry; reissue a fresh one for the viewer.
    await actAs(ownerA)
    const created = await callRpc(`public.agency_member_invite($1, 'viewer', 7, 'member-invite-viewer-fresh')`, [emailOf.get(viewer)])
    expectOk(created, 'created', 'D12 setup')
    await actAs(viewer)
    const env = await callRpc(`public.agency_member_accept($1)`, [created.token])
    expectOk(env, 'accepted', 'D12')
    membershipViewerId = env.membership.id
    expect(env.membership.scope === 'viewer', `viewer scope expected, got ${env.membership.scope}`)
  })

  // =========================================================================
  // E. Membership revoke / scope change (owner-only, expected version)
  // =========================================================================
  await testCase('E1. owner changes the viewer scope to finance with the current version: scope_changed, version 2', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_change_scope($1, 1, 'finance')`, [membershipViewerId])
    expectOk(env, 'scope_changed', 'E1')
    expect(env.membership.scope === 'finance' && env.membership.version === 2, `expected finance/v2: ${JSON.stringify(env.membership)}`)
  })

  await testCase('E2. stale expected version on scope change returns version_conflict with the current version', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_change_scope($1, 1, 'viewer')`, [membershipViewerId])
    expect(env && env.ok === false && env.error === 'version_conflict' && env.current_version === 2,
      `expected version_conflict current_version=2, got ${JSON.stringify(env)}`)
  })

  await testCase('E3. unknown scope on change is rejected (no minting owner via change)', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_member_change_scope($1, 2, 'owner')`, [membershipViewerId]),
      'Unknown membership scope.'
    )
  })

  await testCase('E4. a dispatcher cannot change any scope, including its own (no self-escalation)', async () => {
    await actAs(dispatcher)
    await expectError(
      db.query(`SELECT public.agency_member_change_scope($1, 1, 'finance')`, [membershipDispatcherId]),
      'No agency profile found for this account.'
    )
    await actAsService()
    const r = await rows(`SELECT scope FROM public.agency_memberships WHERE id = $1`, [membershipDispatcherId])
    expect(r[0].scope === 'dispatcher', `dispatcher scope must be unchanged, got ${r[0].scope}`)
  })

  await testCase('E5. cross-agency: owner B cannot change or revoke agency A membership', async () => {
    await actAs(ownerB)
    await expectError(
      db.query(`SELECT public.agency_member_change_scope($1, 2, 'viewer')`, [membershipViewerId]),
      'Membership not found or access denied.'
    )
    await expectError(
      db.query(`SELECT public.agency_member_revoke($1, 2)`, [membershipViewerId]),
      'Membership not found or access denied.'
    )
  })

  await testCase('E6. revoke with a stale expected version returns version_conflict and writes nothing', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_revoke($1, 1)`, [membershipViewerId])
    expect(env && env.ok === false && env.error === 'version_conflict' && env.current_version === 2,
      `expected version_conflict current_version=2, got ${JSON.stringify(env)}`)
    await actAsService()
    const r = await rows(`SELECT status FROM public.agency_memberships WHERE id = $1`, [membershipViewerId])
    expect(r[0].status === 'active', 'a conflicting revoke must not change the membership')
  })

  await testCase('E7. owner revokes the viewer membership with the current version: revoked, version 3', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_revoke($1, 2)`, [membershipViewerId])
    expectOk(env, 'revoked', 'E7')
    expect(env.membership.status === 'revoked' && env.membership.version === 3,
      `expected revoked/v3, got ${JSON.stringify(env.membership)}`)
  })

  await testCase('E8. revoke replays exactly once: same expected version returns already_revoked without a write', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_revoke($1, 3)`, [membershipViewerId])
    expectOk(env, 'already_revoked', 'E8')
    await actAsService()
    const r = await rows(`SELECT version FROM public.agency_memberships WHERE id = $1`, [membershipViewerId])
    expect(r[0].version === 3, `version must stay 3 after replay, got ${r[0].version}`)
  })

  await testCase('E9. a revoked membership cannot be re-scoped (membership_not_active)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_member_change_scope($1, 3, 'dispatcher')`, [membershipViewerId])
    expectDenied(env, 'membership_not_active', 'E9')
  })

  await testCase('E10. old session of a revoked staff member fails closed: no scope and no membership rows', async () => {
    await actAs(viewer)
    const scope = await rows(`SELECT public.agency_member_has_scope($1, 'finance') AS ok`, [agencyA])
    expect(scope[0].ok === false, 'revoked staff must hold no scope')
    const visible = await rows(`SELECT id FROM public.agency_memberships WHERE id = $1`, [membershipViewerId])
    expect(visible.length === 0, `revoked staff must not read membership rows, saw ${visible.length}`)
  })

  await testCase('E11. a revoked staff member cannot reactivate itself by replaying its old accept', async () => {
    await actAs(viewer)
    const env = await callRpc(`public.agency_member_accept($1)`, [viewerInviteToken])
    expect(env && env.ok === false, `replayed accept must not succeed for a revoked member: ${JSON.stringify(env)}`)
    await actAsService()
    const active = await rows(`SELECT count(*)::int AS n FROM public.agency_memberships WHERE user_id = $1 AND status = 'active'`, [viewer])
    expect(active[0].n === 0, `revoked member must stay inactive, found ${active[0].n} active`)
  })

  await testCase('E12. membership revoke/invite never touch the dispatcher (scope of other members unchanged)', async () => {
    await actAsService()
    const r = await rows(`SELECT scope, status FROM public.agency_memberships WHERE id = $1`, [membershipDispatcherId])
    expect(r[0].scope === 'dispatcher' && r[0].status === 'active', `dispatcher membership must stay active/dispatcher: ${JSON.stringify(r[0])}`)
  })

  // =========================================================================
  // F. Client agreements (per agency; versioned; idempotent creates)
  // =========================================================================
  const KEY_AG1 = 'client-agreement-acme-1'
  let agr1
  let agr2

  await testCase('F1. owner A creates a client agreement: created at version 1, active', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_client_agreement_create($1, $2, $3, $4)`,
      ['Acme Steel Ltd', '07ABCDE1234A1Z5', 30, KEY_AG1])
    expectOk(env, 'created', 'F1')
    expect(env.agreement && env.agreement.version === 1 && env.agreement.status === 'active',
      `agreement must be v1/active: ${JSON.stringify(env.agreement)}`)
    agr1 = env.agreement.id
  })

  await testCase('F2. agreement create replays idempotently for the same key and name', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_client_agreement_create($1, $2, $3, $4)`,
      ['Acme Steel Ltd', '07ABCDE1234A1Z5', 30, KEY_AG1])
    expectOk(env, 'idempotent_replay', 'F2')
    await actAsService()
    const n = await rows(`SELECT count(*)::int AS n FROM public.agency_client_agreements WHERE agency_id = $1`, [agencyA])
    expect(n[0].n === 1, `expected one agreement for agency A, found ${n[0].n}`)
  })

  await testCase('F3. agreement key reuse with a different client is rejected', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_client_agreement_create($1, $2, $3, $4)`,
      ['Other Client Pvt', null, 30, KEY_AG1])
    expectDenied(env, 'idempotency_key_reused', 'F3')
  })

  await testCase('F4. invalid GSTIN and out-of-range payment terms are rejected', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_client_agreement_create('Bad GST Ltd', '12BAD', 30, 'client-agreement-badgst')`),
      'GSTIN format is invalid.'
    )
    await expectError(
      db.query(`SELECT public.agency_client_agreement_create('Long Terms Ltd', NULL, 400, 'client-agreement-terms')`),
      'Payment terms must be between 0 and 365 days.'
    )
  })

  await testCase('F5. cross-agency: owner B cannot read or update agency A agreement', async () => {
    await actAs(ownerB)
    const seen = await rows(`SELECT id FROM public.agency_client_agreements WHERE id = $1`, [agr1])
    expect(seen.length === 0, `B must see 0 of A's agreements, saw ${seen.length}`)
    await expectError(
      db.query(`SELECT public.agency_client_agreement_update($1, 1, '{}'::jsonb)`, [agr1]),
      'Client agreement not found or access denied.'
    )
  })

  await testCase('F6. a non-owner dispatcher cannot create agreements (no agency profile)', async () => {
    await actAs(dispatcher)
    await expectError(
      db.query(`SELECT public.agency_client_agreement_create('Staff Made Ltd', NULL, 15, 'client-agreement-staff')`),
      'No agency profile found for this account.'
    )
  })

  await testCase('F7. stale expected version on agreement update returns version_conflict; current update bumps to v2', async () => {
    await actAs(ownerA)
    const stale = await callRpc(`public.agency_client_agreement_update($1, 0, $2::jsonb)`, [agr1, JSON.stringify({ payment_terms_days: 45 })])
    expect(stale && stale.ok === false && stale.error === 'version_conflict' && stale.current_version === 1,
      `expected version_conflict current_version=1, got ${JSON.stringify(stale)}`)
    const env = await callRpc(`public.agency_client_agreement_update($1, 1, $2::jsonb)`, [agr1, JSON.stringify({ payment_terms_days: 45 })])
    expectOk(env, 'updated', 'F7')
    expect(env.agreement.version === 2 && Number(env.agreement.payment_terms_days) === 45, `v2/45 expected: ${JSON.stringify(env.agreement)}`)
  })

  await testCase('F8. unknown agreement status is rejected', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_client_agreement_update($1, 2, $2::jsonb)`, [agr1, JSON.stringify({ status: 'paused' })]),
      'Unknown agreement status.'
    )
  })

  await testCase('F9. a suspended owner cannot create agreements (fail-closed)', async () => {
    await actAs(ownerC)
    await expectError(
      db.query(`SELECT public.agency_client_agreement_create('Suspended Co Client', NULL, 30, 'client-agreement-suspended')`),
      'Agency approval is required.'
    )
  })

  let agr2Created = false
  await testCase('F10. owner A creates a second client agreement (Beta) for a second ship-to network', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_client_agreement_create($1, $2, $3, $4)`,
      ['Beta Logistics Pvt', null, 45, 'client-agreement-beta-1'])
    expectOk(env, 'created', 'F10')
    agr2 = env.agreement.id
    agr2Created = true
  })

  // =========================================================================
  // G. Bill-to / ship-to sites and contacts (versioned, tenant-bound)
  // =========================================================================
  const KEY_BILL1 = 'site-bill-to-1'
  let siteBill1
  let siteBill1Version
  let siteShip1
  let contact1

  await testCase('G1. owner A adds a bill-to site: created at version 1', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_client_site_create($1, 'bill_to', 'Head office', '12 Industrial Area', 'Gurugram', 'Haryana', '122001', $2)`,
      [agr1, KEY_BILL1])
    expectOk(env, 'created', 'G1')
    expect(env.site && env.site.site_kind === 'bill_to' && env.site.version === 1, `bill_to v1 expected: ${JSON.stringify(env.site)}`)
    siteBill1 = env.site.id
    siteBill1Version = env.site.version
  })

  await testCase('G2. owner A adds a ship-to site and a second ship-to site (multiple ship-to allowed)', async () => {
    await actAs(ownerA)
    const first = await callRpc(`public.agency_client_site_create($1, 'ship_to', 'Plant 1', '4 Sector 5', 'Pune', 'Maharashtra', '411001', 'site-ship-1')`, [agr1])
    expectOk(first, 'created', 'G2a')
    siteShip1 = first.site.id
    const second = await callRpc(`public.agency_client_site_create($1, 'ship_to', 'Warehouse', '9 MIDC', 'Nashik', 'Maharashtra', '422010', 'site-ship-2')`, [agr1])
    expectOk(second, 'created', 'G2b')
  })

  await testCase('G3. a second ACTIVE bill-to for the same agreement is rejected (deactivate first)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_client_site_create($1, 'bill_to', 'Second bill', '1 Other Rd', 'Delhi', 'Delhi', '110001', 'site-bill-to-2')`, [agr1])
    expectDenied(env, 'active_bill_to_exists', 'G3')
  })

  await testCase('G4. malformed pincode and unknown site kind are rejected', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_client_site_create($1, 'ship_to', 'Bad pin', '1 Rd', 'Pune', 'Maharashtra', '12345', 'site-bad-pin')`, [agr1]),
      'Pincode must be six digits.'
    )
    await expectError(
      db.query(`SELECT public.agency_client_site_create($1, 'depot', 'Depot', '1 Rd', 'Pune', 'Maharashtra', '411001', 'site-bad-kind')`, [agr1]),
      'Unknown site kind.'
    )
  })

  await testCase('G5. cross-agency: owner B cannot add a site to agency A agreement', async () => {
    await actAs(ownerB)
    await expectError(
      db.query(`SELECT public.agency_client_site_create($1, 'ship_to', 'Spy', '1 Rd', 'Pune', 'Maharashtra', '411001', 'site-spy-1')`, [agr1]),
      'Client agreement not found or access denied.'
    )
  })

  await testCase('G6. stale site update returns version_conflict; current update bumps the site to v2', async () => {
    await actAs(ownerA)
    const stale = await callRpc(`public.agency_client_site_update($1, 0, $2::jsonb)`, [siteShip1, JSON.stringify({ label: 'Plant 2' })])
    expect(stale && stale.ok === false && stale.error === 'version_conflict' && stale.current_version === 1,
      `expected version_conflict current_version=1, got ${JSON.stringify(stale)}`)
    const env = await callRpc(`public.agency_client_site_update($1, 1, $2::jsonb)`, [siteShip1, JSON.stringify({ label: 'Plant 2' })])
    expectOk(env, 'updated', 'G6')
    expect(env.site.version === 2 && env.site.label === 'Plant 2', `v2 'Plant 2' expected: ${JSON.stringify(env.site)}`)
  })

  await testCase('G7. after deactivating the bill-to, a new active bill-to is allowed', async () => {
    await actAs(ownerA)
    const off = await callRpc(`public.agency_client_site_update($1, $2, $3::jsonb)`, [siteBill1, siteBill1Version, JSON.stringify({ status: 'inactive' })])
    expectOk(off, 'updated', 'G7 deactivate')
    const on = await callRpc(`public.agency_client_site_create($1, 'bill_to', 'Accounts office', '2 Park St', 'Gurugram', 'Haryana', '122002', 'site-bill-to-3')`, [agr1])
    expectOk(on, 'created', 'G7 new bill-to')
  })

  await testCase('G8. a contact may only reference a site of the same agreement', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_client_contact_create($1, 'Ravi Kumar', '9810011223', NULL, $2, 'contact-foreign-site')`, [agr2, siteShip1]),
      'Site not found for this agreement.'
    )
  })

  await testCase('G9. owner A adds a contact on agreement 1 bound to a ship-to site (created v1, replay idempotent)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_client_contact_create($1, 'Ravi Kumar', '9810011223', 'ravi@acme.example', $2, 'contact-ravi-1')`, [agr1, siteShip1])
    expectOk(env, 'created', 'G9')
    expect(env.contact && env.contact.version === 1, `contact v1 expected: ${JSON.stringify(env.contact)}`)
    contact1 = env.contact.id
    const replay = await callRpc(`public.agency_client_contact_create($1, 'Ravi Kumar', '9810011223', 'ravi@acme.example', $2, 'contact-ravi-1')`, [agr1, siteShip1])
    expectOk(replay, 'idempotent_replay', 'G9 replay')
  })

  await testCase('G10. malformed contact phone is rejected', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_client_contact_create($1, 'Bad Phone', '12', NULL, NULL, 'contact-bad-phone')`, [agr1]),
      'Contact phone is invalid.'
    )
  })

  await testCase('G11. stale contact update returns version_conflict; current update bumps to v2', async () => {
    await actAs(ownerA)
    const stale = await callRpc(`public.agency_client_contact_update($1, 0, $2::jsonb)`, [contact1, JSON.stringify({ full_name: 'R. Kumar' })])
    expect(stale && stale.ok === false && stale.error === 'version_conflict' && stale.current_version === 1,
      `expected version_conflict current_version=1, got ${JSON.stringify(stale)}`)
    const env = await callRpc(`public.agency_client_contact_update($1, 1, $2::jsonb)`, [contact1, JSON.stringify({ full_name: 'R. Kumar' })])
    expectOk(env, 'updated', 'G11')
    expect(env.contact.version === 2 && env.contact.full_name === 'R. Kumar', `v2 expected: ${JSON.stringify(env.contact)}`)
  })

  await testCase('G12. cross-agency: owner B cannot update an agency A contact or read A sites/contacts', async () => {
    await actAs(ownerB)
    await expectError(
      db.query(`SELECT public.agency_client_contact_update($1, 2, '{"full_name":"x"}'::jsonb)`, [contact1]),
      'Client contact not found or access denied.'
    )
    const sites = await rows(`SELECT id FROM public.agency_client_sites WHERE agreement_id = $1`, [agr1])
    expect(sites.length === 0, `B must see 0 of A's sites, saw ${sites.length}`)
    const contacts = await rows(`SELECT id FROM public.agency_client_contacts WHERE agreement_id = $1`, [agr1])
    expect(contacts.length === 0, `B must see 0 of A's contacts, saw ${contacts.length}`)
  })

  await testCase('G13. an ended agreement accepts no new sites (agreement_not_active)', async () => {
    expect(agr2Created, 'F10 must have created the second agreement')
    await actAs(ownerA)
    const ended = await callRpc(`public.agency_client_agreement_update($1, 1, $2::jsonb)`, [agr2, JSON.stringify({ status: 'ended' })])
    expectOk(ended, 'updated', 'G13 end')
    const env = await callRpc(`public.agency_client_site_create($1, 'ship_to', 'Late', '1 Rd', 'Pune', 'Maharashtra', '411001', 'site-after-end')`, [agr2])
    expectDenied(env, 'agreement_not_active', 'G13')
  })

  // =========================================================================
  // H. Tariff effective versions (append-only, supersede, no overlap)
  // =========================================================================
  let tariff1
  let tariff2
  let tariff3

  await testCase('H1. owner A publishes tariff v1 for Delhi to Mumbai (eicher_14ft, per trip) from 2026-11-01: version_no 1', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 45000.00, '2026-11-01', 'eicher_14ft', NULL, NULL, 'tariff-t1')`, [agr1])
    expectOk(env, 'published', 'H1')
    expect(env.tariff && env.tariff.version_no === 1 && env.tariff.supersedes_version_id === null,
      `v1 expected: ${JSON.stringify(env.tariff)}`)
    tariff1 = env.tariff.id
  })

  await testCase('H2. an overlapping version that starts before the head is rejected (tariff_overlap)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 43000.00, '2026-10-15', 'eicher_14ft', NULL, $2, 'tariff-t2-early')`, [agr1, tariff1])
    expectDenied(env, 'tariff_overlap', 'H2')
  })

  await testCase('H3. supersede with a bounded version (2026-12-01 to 2026-12-31) against the current head is accepted', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 48000.00, '2026-12-01', 'eicher_14ft', '2026-12-31', $2, 'tariff-t3-bounded')`, [agr1, tariff1])
    expectOk(env, 'published', 'H3')
    expect(env.tariff.version_no === 2, `version_no 2 expected: ${JSON.stringify(env.tariff)}`)
    tariff2 = env.tariff.id
  })

  await testCase('H4. a version overlapping the bounded head range is rejected (tariff_overlap)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 49000.00, '2026-12-15', 'eicher_14ft', NULL, $2, 'tariff-t4-overlap')`, [agr1, tariff2])
    expectDenied(env, 'tariff_overlap', 'H4')
  })

  await testCase('H5. a stale supersession target (not the current head) returns version_conflict with the head id', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 50000.00, '2027-01-01', 'eicher_14ft', NULL, $2, 'tariff-t5-stale')`, [agr1, tariff1])
    expect(env && env.ok === false && env.error === 'version_conflict' && env.current_version_id === tariff2,
      `expected version_conflict current_version_id=${tariff2}, got ${JSON.stringify(env)}`)
  })

  await testCase('H6. open-ended supersession of the head at 2027-01-01 is accepted as version 3', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 52000.00, '2027-01-01', 'eicher_14ft', NULL, $2, 'tariff-t6-open')`, [agr1, tariff2])
    expectOk(env, 'published', 'H6')
    expect(env.tariff.version_no === 3, `version_no 3 expected, got ${env.tariff.version_no}`)
    tariff3 = env.tariff.id
  })

  await testCase('H7. the same publish key replays idempotently; reusing it for a different amount is rejected', async () => {
    await actAs(ownerA)
    const replay = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 52000.00, '2027-01-01', 'eicher_14ft', NULL, $2, 'tariff-t6-open')`, [agr1, tariff2])
    expectOk(replay, 'idempotent_replay', 'H7 replay')
    const reused = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 99999.00, '2027-01-01', 'eicher_14ft', NULL, $2, 'tariff-t6-open')`, [agr1, tariff2])
    expectDenied(reused, 'idempotency_key_reused', 'H7 reuse')
    await actAsService()
    const n = await rows(`SELECT count(*)::int AS n FROM public.agency_tariff_versions WHERE agency_id = $1`, [agencyA])
    expect(n[0].n === 3, `expected exactly 3 tariff versions, found ${n[0].n}`)
  })

  await testCase('H8. past versions are immutable: superuser UPDATE and DELETE of v1 are blocked by the trigger', async () => {
    await actAsService()
    await expectError(
      db.query(`UPDATE public.agency_tariff_versions SET rate_amount = 1 WHERE id = $1`, [tariff1]),
      'Tariff versions are immutable'
    )
    await expectError(
      db.query(`DELETE FROM public.agency_tariff_versions WHERE id = $1`, [tariff1]),
      'Tariff versions are immutable'
    )
    const r = await rows(`SELECT rate_amount FROM public.agency_tariff_versions WHERE id = $1`, [tariff1])
    expect(Number(r[0].rate_amount) === 45000, `v1 amount must stay 45000, got ${r[0].rate_amount}`)
  })

  await testCase('H9. authenticated cannot UPDATE tariff rows directly (permission denied, not a silent zero-row write)', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`UPDATE public.agency_tariff_versions SET rate_amount = 1 WHERE id = $1`, [tariff1]),
      'permission denied'
    )
  })

  await testCase('H10. effective-rate lookup picks the right version by date and returns nothing in a gap or before the first', async () => {
    await actAsService()
    const at = async (date) => (await rows(
      `SELECT id, version_no FROM public.agency_tariff_rate_at($1, 'Delhi', 'Mumbai', 'eicher_14ft', $2::date)`,
      [agr1, date]
    ))
    const v1 = await at('2026-11-10')
    expect(v1.length === 1 && v1[0].id === tariff1, `2026-11-10 must resolve v1, got ${JSON.stringify(v1)}`)
    const v2 = await at('2026-12-10')
    expect(v2.length === 1 && v2[0].id === tariff2, `2026-12-10 must resolve v2, got ${JSON.stringify(v2)}`)
    const gap = await at('2026-12-31')
    expect(gap.length === 0, `2026-12-31 is a gap (to is exclusive) and must resolve nothing, got ${JSON.stringify(gap)}`)
    const v3 = await at('2027-02-01')
    expect(v3.length === 1 && v3[0].id === tariff3, `2027-02-01 must resolve v3, got ${JSON.stringify(v3)}`)
    const before = await at('2026-10-01')
    expect(before.length === 0, `before the first version nothing resolves, got ${JSON.stringify(before)}`)
  })

  await testCase('H11. lanes are independent: the same origin/destination for another vehicle type starts at version 1', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 61000.00, '2026-11-01', 'tata_407', NULL, NULL, 'tariff-t7-tata407')`, [agr1])
    expectOk(env, 'published', 'H11')
    expect(env.tariff.version_no === 1, `tata_407 lane must start at version 1, got ${env.tariff.version_no}`)
  })

  await testCase('H12. cross-agency: owner B cannot publish on agency A agreement or read A tariffs', async () => {
    await actAs(ownerB)
    await expectError(
      db.query(`SELECT public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 1.00, '2027-05-01', NULL, NULL, NULL, 'tariff-spy-1')`, [agr1]),
      'Client agreement not found or access denied.'
    )
    const seen = await rows(`SELECT id FROM public.agency_tariff_versions WHERE agreement_id = $1`, [agr1])
    expect(seen.length === 0, `B must see 0 of A's tariffs, saw ${seen.length}`)
  })

  await testCase('H13. a non-owner dispatcher cannot publish tariffs (no agency profile)', async () => {
    await actAs(dispatcher)
    await expectError(
      db.query(`SELECT public.agency_tariff_version_publish($1, 'Delhi', 'Pune', 'per_trip', 1000.00, '2027-05-01', NULL, NULL, NULL, 'tariff-staff-1')`, [agr1]),
      'No agency profile found for this account.'
    )
  })

  await testCase('H14. input validation: unknown vehicle type, inverted range, sub-paise amount and non-positive amount', async () => {
    await actAs(ownerA)
    await expectError(
      db.query(`SELECT public.agency_tariff_version_publish($1, 'Delhi', 'Pune', 'per_trip', 1000.00, '2027-05-01', 'martian_rover', NULL, NULL, 'tariff-v-1')`, [agr1]),
      'Unknown vehicle type.'
    )
    await expectError(
      db.query(`SELECT public.agency_tariff_version_publish($1, 'Delhi', 'Pune', 'per_trip', 1000.00, '2027-03-01', NULL, '2027-02-01', NULL, 'tariff-v-2')`, [agr1]),
      'Effective end must be after effective start.'
    )
    await expectError(
      db.query(`SELECT public.agency_tariff_version_publish($1, 'Delhi', 'Pune', 'per_trip', 100.005, '2027-05-01', NULL, NULL, NULL, 'tariff-v-3')`, [agr1]),
      'Rate amount must have at most two decimal places.'
    )
    await expectError(
      db.query(`SELECT public.agency_tariff_version_publish($1, 'Delhi', 'Pune', 'per_trip', 0, '2027-05-01', NULL, NULL, NULL, 'tariff-v-4')`, [agr1]),
      'Rate amount must be greater than zero.'
    )
  })

  await testCase('H15. tariffs cannot be published on an ended agreement (agreement_not_active)', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 1000.00, '2027-05-01', NULL, NULL, NULL, 'tariff-ended-1')`, [agr2])
    expectDenied(env, 'agreement_not_active', 'H15')
  })

  await testCase('H16. a suspended owner cannot publish tariffs (fail-closed)', async () => {
    await actAs(ownerC)
    await expectError(
      db.query(`SELECT public.agency_tariff_version_publish($1, 'Delhi', 'Mumbai', 'per_trip', 1000.00, '2027-05-01', NULL, NULL, NULL, 'tariff-suspended-1')`, [agr1]),
      'Agency approval is required.'
    )
  })

  // =========================================================================
  // I. Driver invitations (token-hashed; accept links D1 employment)
  // =========================================================================
  const KEY_DI1 = 'driver-invite-ok-1'
  let driverInviteToken
  let driverInviteId
  let driverInviteVersion
  let employmentOk

  await testCase('I1. owner A creates a driver invitation: created, one-time token, pending', async () => {
    await actAs(ownerA)
    const env = await callRpc(`public.agency_driver_invitation_create($1, 7, $2)`, ['9800000001', KEY_DI1])
    expectOk(env, 'created', 'I1')
    expect(typeof env.token === 'string' && /^[0-9a-f]{64}$/.test(env.token), 'driver token must be 64 hex chars')
    expect(env.invitation && env.invitation.status === 'pending', `pending expected: ${JSON.stringify(env.invitation)}`)
    driverInviteToken = env.token
    driverInviteId = env.invitation.id
    driverInviteVersion = env.invitation.version
    await actAsService()
    const r = await rows(`SELECT token_hash FROM public.agency_driver_invitations WHERE id = $1`, [driverInviteId])
    expect(r[0].token_hash === sha256Hex(driverInviteToken), 'driver invitation must store only the SHA-256 hash')
  })

  await testCase('I2. driver invitation create replays idempotently; key reuse with a different phone is rejected', async () => {
    await actAs(ownerA)
    const replay = await callRpc(`public.agency_driver_invitation_create($1, 7, $2)`, ['9800000001', KEY_DI1])
    expectOk(replay, 'idempotent_replay', 'I2 replay')
    expect(replay.token === undefined, 'driver replay must not re-issue a token')
    const reused = await callRpc(`public.agency_driver_invitation_create($1, 7, $2)`, ['9800000003', KEY_DI1])
    expectDenied(reused, 'idempotency_key_reused', 'I2 reuse')
  })

  await testCase('I3. a second pending invitation for the same phone is rejected; a malformed phone is rejected', async () => {
    await actAs(ownerA)
    const dup = await callRpc(`public.agency_driver_invitation_create($1, 7, $2)`, ['9800000001', 'driver-invite-dup'])
    expectDenied(dup, 'invitation_already_pending', 'I3 dup')
    await expectError(
      db.query(`SELECT public.agency_driver_invitation_create('not-a-phone', 7, 'driver-invite-bad')`),
      'Driver phone is invalid.'
    )
  })

  await testCase('I4. cross-agency: owner B cannot see or revoke agency A driver invitation', async () => {
    await actAs(ownerB)
    const seen = await rows(`SELECT id FROM public.agency_driver_invitations WHERE id = $1`, [driverInviteId])
    expect(seen.length === 0, `B must see 0 of A's driver invitations, saw ${seen.length}`)
    await expectError(
      db.query(`SELECT public.agency_driver_invitation_revoke($1, 1)`, [driverInviteId]),
      'Driver invitation not found or access denied.'
    )
  })

  await testCase('I5. a dispatcher and a driver cannot create driver invitations (no agency profile)', async () => {
    await actAs(dispatcher)
    await expectError(
      db.query(`SELECT public.agency_driver_invitation_create('9800000005', 7, 'driver-invite-staff')`),
      'No agency profile found for this account.'
    )
    await actAs(driverOk)
    await expectError(
      db.query(`SELECT public.agency_driver_invitation_create('9800000005', 7, 'driver-invite-self')`),
      'No agency profile found for this account.'
    )
  })

  await testCase('I6. accept without a driver profile is rejected (fail-closed)', async () => {
    await actAs(dispatcher)
    await expectError(
      db.query(`SELECT public.agency_driver_invitation_accept($1)`, [driverInviteToken]),
      'No driver profile found for this account.'
    )
  })

  await testCase('I7. recipient binding: a driver whose phone differs cannot accept (invitation_recipient_mismatch)', async () => {
    await actAs(driverPending)
    const env = await callRpc(`public.agency_driver_invitation_accept($1)`, [driverInviteToken])
    expectDenied(env, 'invitation_recipient_mismatch', 'I7')
  })

  let dInviteUnapprovedToken
  await testCase('I8. a matching but unapproved driver is rejected (driver_not_approved)', async () => {
    await actAs(ownerA)
    const created = await callRpc(`public.agency_driver_invitation_create($1, 7, $2)`, ['9800000002', 'driver-invite-pending-drv'])
    expectOk(created, 'created', 'I8 setup')
    dInviteUnapprovedToken = created.token
    await actAs(driverPending)
    const env = await callRpc(`public.agency_driver_invitation_accept($1)`, [dInviteUnapprovedToken])
    expectDenied(env, 'driver_not_approved', 'I8')
  })

  await testCase('I9. the approved driver accepts: D1 employment created for agency A and the invitation links it', async () => {
    await actAs(driverOk)
    const env = await callRpc(`public.agency_driver_invitation_accept($1)`, [driverInviteToken])
    expectOk(env, 'accepted', 'I9')
    expect(env.employment && env.employment.agency_id === agencyA && env.employment.status === 'active',
      `active employment for agency A expected: ${JSON.stringify(env.employment)}`)
    employmentOk = env.employment.id
    await actAsService()
    const linked = await rows(`SELECT employment_id, status FROM public.agency_driver_invitations WHERE id = $1`, [driverInviteId])
    expect(linked[0].status === 'accepted' && linked[0].employment_id === employmentOk, `invitation must link the employment: ${JSON.stringify(linked[0])}`)
  })

  await testCase('I10. the same driver replays acceptance without a second employment; another user gets invitation_not_pending', async () => {
    await actAs(driverOk)
    const replay = await callRpc(`public.agency_driver_invitation_accept($1)`, [driverInviteToken])
    expectOk(replay, 'idempotent_replay', 'I10 replay')
    await actAs(driverOther)
    const other = await callRpc(`public.agency_driver_invitation_accept($1)`, [driverInviteToken])
    expectDenied(other, 'invitation_not_pending', 'I10 other')
    await actAsService()
    const n = await rows(`SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE driver_id = $1 AND status = 'active'`, [driverRowOk])
    expect(n[0].n === 1, `exactly one active employment expected, found ${n[0].n}`)
  })

  await testCase('I11. a driver already employed by another agency is refused (driver_already_employed_elsewhere)', async () => {
    await actAsService()
    const agencyBEmp = uid()
    await db.query(`INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, 'active')`, [agencyBEmp, agencyB, driverRowOther])
    await actAs(ownerA)
    const created = await callRpc(`public.agency_driver_invitation_create($1, 7, $2)`, ['9800000003', 'driver-invite-elsewhere'])
    expectOk(created, 'created', 'I11 setup')
    await actAs(driverOther)
    const env = await callRpc(`public.agency_driver_invitation_accept($1)`, [created.token])
    expectDenied(env, 'driver_already_employed_elsewhere', 'I11')
  })

  await testCase('I12. stale revoke returns version_conflict; current revoke returns revoked; revoked token is refused', async () => {
    await actAs(ownerA)
    const created = await callRpc(`public.agency_driver_invitation_create($1, 7, $2)`, ['9800000006', 'driver-invite-revoke-me'])
    expectOk(created, 'created', 'I12 setup')
    const stale = await callRpc(`public.agency_driver_invitation_revoke($1, 0)`, [created.invitation.id])
    expect(stale && stale.ok === false && stale.error === 'version_conflict' && stale.current_version === 1,
      `expected version_conflict current_version=1, got ${JSON.stringify(stale)}`)
    const revoked = await callRpc(`public.agency_driver_invitation_revoke($1, 1)`, [created.invitation.id])
    expectOk(revoked, 'revoked', 'I12 revoke')
    await actAs(driverPending)
    const env = await callRpc(`public.agency_driver_invitation_accept($1)`, [created.token])
    expectDenied(env, 'invitation_revoked', 'I12 accept')
  })

  await testCase('I13. an expired driver invitation is refused (invitation_expired)', async () => {
    await actAs(ownerA)
    const created = await callRpc(`public.agency_driver_invitation_create($1, 1, $2)`, ['9800000004', 'driver-invite-expired'])
    expectOk(created, 'created', 'I13 setup')
    await actAsService()
    await db.query(`UPDATE public.agency_driver_invitations SET expires_at = now() - interval '1 hour' WHERE id = $1`, [created.invitation.id])
    await actAs(driverFourth)
    const env = await callRpc(`public.agency_driver_invitation_accept($1)`, [created.token])
    expectDenied(env, 'invitation_expired', 'I13')
  })

  await testCase('I14. a suspended agency cannot accept driver invitations (fail-closed)', async () => {
    await actAsService()
    await db.query(`UPDATE public.transport_agencies SET status = 'suspended' WHERE id = $1`, [agencyA])
    await actAs(ownerA)
    // Creation itself must now fail closed.
    await expectError(
      db.query(`SELECT public.agency_driver_invitation_create('9800000005', 7, 'driver-invite-suspended')`),
      'Agency approval is required.'
    )
    await actAs(driverFourth)
    await expectError(
      db.query(`SELECT public.agency_driver_invitation_accept($1)`, [driverInviteToken]),
      'Agency approval is required.'
    )
    await actAsService()
    await db.query(`UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [agencyA])
  })

  // =========================================================================
  // J. Read-isolation spot checks across the whole D2 surface
  // =========================================================================
  await testCase('J1. two agencies, two clients: each owner sees only its own memberships, agreements and tariffs', async () => {
    await actAs(ownerB)
    const memberships = await rows(`SELECT id FROM public.agency_memberships WHERE agency_id = $1`, [agencyA])
    expect(memberships.length === 0, `B must see 0 memberships of A, saw ${memberships.length}`)
    const agreements = await rows(`SELECT id FROM public.agency_client_agreements`)
    expect(agreements.every((a) => a.id !== agr1 && a.id !== agr2), 'B must not see A agreements')
    const tariffs = await rows(`SELECT id FROM public.agency_tariff_versions`)
    expect(tariffs.length === 0, `B must see 0 tariffs, saw ${tariffs.length}`)
    await actAs(ownerA)
    const own = await rows(`SELECT id FROM public.agency_client_agreements`)
    expect(own.some((a) => a.id === agr1), 'A must see its own agreement')
  })

  await testCase('J2. the platform admin can read D2 tables through the explicit admin predicate, and nothing else changes', async () => {
    await actAsService()
    await db.query(`UPDATE public.users SET role = 'admin' WHERE id = $1`, [intruder])
    await actAs(intruder)
    const visible = await rows(`SELECT id FROM public.agency_client_agreements WHERE id = $1`, [agr1])
    expect(visible.length === 1, `admin must read agency agreements, saw ${visible.length}`)
    await db.query(`RESET ROLE`)
    await db.query(`UPDATE public.users SET role = 'user' WHERE id = $1`, [intruder])
    await actAsService()
  })

  await testCase('J3. the four D1 fleet tables and the reservation table keep their policies (no D2 regression)', async () => {
    const policies = await rows(`SELECT tablename::text AS t, policyname::text AS p FROM pg_policies WHERE schemaname='public' AND tablename IN ('agency_trucks','agency_driver_employment','fleet_assignment_reservations')`)
    for (const p of ['agency_trucks_select', 'agency_trucks_insert', 'agency_trucks_update', 'agency_trucks_delete', 'agency_employment_select', 'fleet_reservations_select']) {
      expect(policies.some((x) => x.p === p), `policy ${p} must still exist`)
    }
  })

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const passed = results.filter((r) => r.pass).length
  const total = results.length
  console.log(`\nTO-144-D2 agency members/clients/tariffs battery: ${passed}/${total} passed`)
  process.exit(passed === total ? 0 : 1)
}

main().catch((error) => {
  console.error(`FAIL: battery crashed: ${error && error.message ? error.message : error}`)
  process.exit(1)
})
