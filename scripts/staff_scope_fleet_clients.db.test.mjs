#!/usr/bin/env node
/**
 * Staff-scope authority over fleet, client and membership commands (red-first
 * contract battery).
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). It replays
 * the full supabase/migrations chain, then pins the staff-scope authority model
 * through the same SQL surfaces the portal uses: real RLS, real role switching
 * (`SET ROLE authenticated` + `request.jwt.claims`, what PostgREST does), real
 * triggers and real SECURITY DEFINER command RPCs.
 *
 * Pinned contract (the staff-scope migration does NOT exist yet; this battery is
 * the spec it must satisfy). Builds on the D1 fleet foundation and the D2 members,
 * clients and tariffs migrations:
 *   - Scopes: dispatcher | fleet_manager | finance | viewer (plus the agency owner).
 *   - Fleet commands (agency_vehicle_*, agency_driver_employment_*,
 *     agency_driver_invitation_*): owner and fleet_manager allowed.
 *   - Client commands (agency_client_*, agency_tariff_version_publish): owner and finance.
 *   - Membership commands (agency_member_invite / invitation_revoke / revoke /
 *     change_scope): owner only.
 *   - SELECT on agency_trucks, agency_driver_employment, agency_client_agreements,
 *     agency_client_sites, agency_client_contacts, agency_tariff_versions: owner and
 *     every scope. agency_driver_invitations: owner and fleet_manager.
 *   - Direct writes: agency_trucks and agency_driver_employment INSERT/UPDATE for
 *     owner and fleet_manager; DELETE on both for owner only.
 *   - Denials: a staff member of the right agency whose scope is insufficient gets
 *     'Your access scope does not allow this action.'; a suspended agency fails
 *     closed with 'Agency approval is required.'; a revoked member or a user with no
 *     profile gets 'No agency profile found for this account.'
 *   - Wrong-agency isolation: a fleet_manager of agency A reads and touches no
 *     agency B row.
 *   - No listed command RPC takes an agency or organisation id argument.
 *
 * Evidence class: local DB only (PGlite, single session). No hosted round-trip.
 *
 * Usage:  node scripts/staff_scope_fleet_clients.db.test.mjs
 * Exit code 0 = every case passed; any failure exits 1. A missing PGlite
 * install is a loud failure, never a silent skip.
 */

import { createHash } from 'node:crypto'
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

const firstLine = (error) => (error && error.message ? error.message : String(error)).split('\n')[0]

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
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
  return files
}

// ---------------------------------------------------------------------------
// Fixtures (service-role equivalent: run as the postgres superuser)
// Fixture shapes are copied from scripts/agency_fleet_foundation.db.test.mjs (D1)
// and scripts/agency_members_clients_tariffs.db.test.mjs (D2).
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`
let nonce = 0
const nx = (prefix) => `${prefix}-${++nonce}`
let phoneSeq = 0
const nextPhone = () => `98${String(++phoneSeq).padStart(8, '0')}`
let rcSeq = 0
const nextRc = () => `DL01SS${String(++rcSeq).padStart(4, '0')}`
let licenceSeq = 0
const nextLicence = () => `DL-0420${String(++licenceSeq).padStart(9, '0')}`
let inviteSeq = 0
const nextInviteEmail = () => `staff-invite-${++inviteSeq}@example.com`
const sha256Hex = (text) => createHash('sha256').update(text, 'utf8').digest('hex')

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await db.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)`, [
    id,
    email,
    JSON.stringify({}),
  ])
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

/** Service-seeded truck row (D1 createTruckRow pattern). */
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
  await db.query(`INSERT INTO public.agency_trucks (${keys.join(', ')}) VALUES (${placeholders})`, params)
  return id
}

/** Service-seeded employment row (D1 createEmploymentRow pattern). */
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

async function newApprovedDriver(tag) {
  await actAsService()
  const userId = await createUser(`drv-${tag}`)
  return createDriver(userId, tag, 'approved')
}

async function seedTruck(agencyId) {
  return createTruckRow(agencyId, nextRc())
}

async function seedEmployment(agencyId) {
  const driverId = await newApprovedDriver(nx('emp'))
  return createEmploymentRow(agencyId, driverId)
}

async function seedMembership(agencyId, userId, scope, status = 'active') {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [id, agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
  return id
}

async function seedAgreement(agencyId, name) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, idempotency_key)
     VALUES ($1, $2, $3, $4)`,
    [id, agencyId, name, nx('seed-agr')]
  )
  return id
}

async function seedSite(agencyId, agreementId, label) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_client_sites
       (id, agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, idempotency_key)
     VALUES ($1, $2, $3, 'ship_to', $4, '1 Seed Road', 'Pune', 'Maharashtra', '411001', $5)`,
    [id, agencyId, agreementId, label, nx('seed-site')]
  )
  return id
}

async function seedContact(agencyId, agreementId, name) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_client_contacts (id, agency_id, agreement_id, full_name, phone, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, agencyId, agreementId, name, nextPhone(), nx('seed-con')]
  )
  return id
}

async function seedTariff(agencyId, agreementId, destination) {
  const id = uid()
  const destinationKey = destination.toLowerCase()
  await db.query(
    `INSERT INTO public.agency_tariff_versions
       (id, agency_id, agreement_id, origin_label, origin_key, destination_label, destination_key,
        vehicle_type, vehicle_key, rate_basis, rate_amount, effective_from, version_no, idempotency_key)
     VALUES ($1, $2, $3, 'Delhi', 'delhi', $4, $5, 'tata_ace', 'tata_ace', 'per_trip', 1000, '2026-01-01', 1, $6)`,
    [id, agencyId, agreementId, destination, destinationKey, nx('seed-tariff')]
  )
  return id
}

async function seedDriverInvite(agencyId, createdBy) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_driver_invitations
       (id, agency_id, invited_phone, token_hash, expires_at, idempotency_key, created_by)
     VALUES ($1, $2, $3, $4, now() + interval '7 days', $5, $6)`,
    [id, agencyId, nextPhone(), sha256Hex(`seed-drv-${id}`), nx('seed-drv'), createdBy]
  )
  return id
}

async function seedAgencyInvite(agencyId, createdBy) {
  const id = uid()
  await db.query(
    `INSERT INTO public.agency_invitations
       (id, agency_id, invited_email, scope, token_hash, expires_at, idempotency_key, created_by)
     VALUES ($1, $2, $3, 'viewer', $4, now() + interval '7 days', $5, $6)`,
    [id, agencyId, nextInviteEmail(), sha256Hex(`seed-inv-${id}`), nx('seed-inv'), createdBy]
  )
  return id
}

/** One full tenant read-set: a row in every table the staff matrix covers. */
async function seedTree(agencyId, ownerId) {
  const truck = await seedTruck(agencyId)
  const emp = await seedEmployment(agencyId)
  const agr = await seedAgreement(agencyId, nx('Tree Client'))
  const site = await seedSite(agencyId, agr, nx('Tree Site'))
  const con = await seedContact(agencyId, agr, nx('Tree Contact'))
  const tariff = await seedTariff(agencyId, agr, nx('Tree Lane'))
  const dinv = await seedDriverInvite(agencyId, ownerId)
  const ainv = await seedAgencyInvite(agencyId, ownerId)
  return { truck, emp, agr, site, con, tariff, dinv, ainv }
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

async function countIs(sql, params, want = 1) {
  await actAsService()
  const n = (await rows(sql, params))[0].n
  expect(n === want, `expected ${want} matching row(s), found ${n}`)
}

async function valueIs(sql, params, want) {
  await actAsService()
  const v = (await rows(sql, params))[0]?.v
  expect(v === want, `expected ${JSON.stringify(want)}, got ${JSON.stringify(v)}`)
}

async function verOf(table, id) {
  const r = await rows(`SELECT version::int AS v FROM public.${table} WHERE id = $1`, [id])
  return r.length ? r[0].v : 1
}

/** Superuser snapshot of every D1/D2 row belonging to the given agencies. */
const SNAP_TABLES = [
  'agency_trucks',
  'agency_driver_employment',
  'agency_client_agreements',
  'agency_client_sites',
  'agency_client_contacts',
  'agency_tariff_versions',
  'agency_driver_invitations',
  'agency_invitations',
  'agency_memberships',
]
async function snapshot(agencyIds) {
  await actAsService()
  const parts = []
  for (const t of SNAP_TABLES) {
    const r = await rows(
      `SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id), '[]'::jsonb)::text AS s
       FROM public.${t} x WHERE x.agency_id = ANY($1::uuid[])`,
      [agencyIds]
    )
    parts.push(`${t}:${r[0].s}`)
  }
  return parts.join('\n')
}

/** Visible row count for an actor, filtered to one agency. */
async function visibleCount(who, table, agencyId) {
  await actAs(who)
  const r = await rows(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])
  return r[0].n
}

async function totalCount(table, agencyId) {
  await actAsService()
  const r = await rows(`SELECT count(*)::int AS n FROM public.${table} WHERE agency_id = $1`, [agencyId])
  return r[0].n
}

/** Direct DML as an actor; resolves to { rows } or { error } (never throws). */
async function dmlOutcome(who, sql, params) {
  await actAs(who)
  try {
    return { rows: await rows(sql, params) }
  } catch (error) {
    return { error: firstLine(error) }
  }
}

// ---------------------------------------------------------------------------
// The battery
// ---------------------------------------------------------------------------
const SCOPE_MSG = 'Your access scope does not allow this action.'
const SUSPENDED_MSG = 'Agency approval is required.'
const NO_PROFILE_MSG = 'No agency profile found for this account.'

const TABLES_READ = [
  'agency_trucks',
  'agency_driver_employment',
  'agency_client_agreements',
  'agency_client_sites',
  'agency_client_contacts',
  'agency_tariff_versions',
]

const COMMAND_RPCS = [
  'agency_vehicle_create',
  'agency_vehicle_update',
  'agency_driver_employment_create',
  'agency_driver_employment_update',
  'agency_driver_employment_end',
  'agency_driver_invitation_create',
  'agency_driver_invitation_revoke',
  'agency_client_agreement_create',
  'agency_client_agreement_update',
  'agency_client_site_create',
  'agency_client_site_update',
  'agency_client_contact_create',
  'agency_client_contact_update',
  'agency_tariff_version_publish',
  'agency_member_invite',
  'agency_member_invitation_revoke',
  'agency_member_revoke',
  'agency_member_change_scope',
]

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  const version = (await db.query('SELECT version() AS v')).rows[0].v
  console.log(`engine: ${version.split(',')[0]}`)
  console.log(`migrations replayed: ${applied.length}`)

  // =========================================================================
  // A. Contract introspection
  // =========================================================================
  await testCase('A1. all 18 listed command RPCs exist and none accepts an agency or organisation id argument', async () => {
    await actAsService()
    const problems = []
    for (const fn of COMMAND_RPCS) {
      const found = await rows(
        `SELECT p.proargnames::text[] AS args
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = $1`,
        [fn]
      )
      if (found.length === 0) {
        problems.push(`${fn} missing`)
        continue
      }
      for (const row of found) {
        for (const arg of row.args || []) {
          if (/agency_id|org_id|organi[sz]ation_id/i.test(arg)) problems.push(`${fn} accepts ${arg}`)
        }
      }
    }
    expect(problems.length === 0, problems.join('; '))
  })

  // =========================================================================
  // B. Fixtures: agencies, actors, memberships, seeded tenant rows
  // =========================================================================
  await actAsService()
  const U = {}
  U.ownerA = await createUser('stf-owner-a')
  U.ownerB = await createUser('stf-owner-b')
  U.ownerS = await createUser('stf-owner-s')
  U.outOwner = await createUser('stf-out-owner')
  U.fm = await createUser('stf-fleet-mgr')
  U.disp = await createUser('stf-dispatcher')
  U.fin = await createUser('stf-finance')
  U.view = await createUser('stf-viewer')
  U.rev = await createUser('stf-revoked')
  U.susp = await createUser('stf-suspended')
  U.outStaff = await createUser('stf-out-staff')
  U.none = await createUser('stf-no-profile')
  U.tgtRevoke = await createUser('stf-tgt-revoke')
  U.tgtScope = await createUser('stf-tgt-scope')
  U.tgtDeny = await createUser('stf-tgt-deny')

  const agA = await createAgencyRow(U.ownerA, 'Staff Alpha', 'approved')
  const agB = await createAgencyRow(U.ownerB, 'Staff Bravo', 'approved')
  const agO = await createAgencyRow(U.outOwner, 'Staff Outsider', 'approved')
  const agS = await createAgencyRow(U.ownerS, 'Staff Suspended', 'suspended')
  const ALL = [agA, agB, agO, agS]

  const M = {}
  M.fm = await seedMembership(agA, U.fm, 'fleet_manager')
  M.disp = await seedMembership(agA, U.disp, 'dispatcher')
  M.fin = await seedMembership(agA, U.fin, 'finance')
  M.view = await seedMembership(agA, U.view, 'viewer')
  M.rev = await seedMembership(agA, U.rev, 'fleet_manager', 'revoked')
  M.susp = await seedMembership(agS, U.susp, 'fleet_manager')
  M.outStaff = await seedMembership(agB, U.outStaff, 'fleet_manager')
  M.tgtRevoke = await seedMembership(agA, U.tgtRevoke, 'viewer')
  M.tgtScope = await seedMembership(agA, U.tgtScope, 'dispatcher')
  M.tgtDeny = await seedMembership(agA, U.tgtDeny, 'viewer')

  // Read-sets: one row of every covered table per agency (A visible to staff, S suspended, B other-agency).
  const TA = await seedTree(agA, U.ownerA)
  const TB = await seedTree(agB, U.ownerB)
  const TS = await seedTree(agS, U.ownerS)

  // Dedicated mutation targets inside agency A (each denial is checked for no state change).
  const hostAgr = await seedAgreement(agA, 'Host Client A')
  const T = {
    vUpdOwn: await seedTruck(agA),
    vUpdFm: await seedTruck(agA),
    vUpdDeny: await seedTruck(agA),
    dUpdOwn: await seedTruck(agA),
    dUpdFm: await seedTruck(agA),
    dUpdDeny: await seedTruck(agA),
    dDelOwn: await seedTruck(agA),
    dDelDeny: await seedTruck(agA),
    eUpdOwn: await seedEmployment(agA),
    eUpdFm: await seedEmployment(agA),
    eUpdDeny: await seedEmployment(agA),
    eEndOwn: await seedEmployment(agA),
    eEndFm: await seedEmployment(agA),
    eEndDeny: await seedEmployment(agA),
    eDUpdOwn: await seedEmployment(agA),
    eDUpdFm: await seedEmployment(agA),
    eDUpdDeny: await seedEmployment(agA),
    eDDelOwn: await seedEmployment(agA),
    eDDelDeny: await seedEmployment(agA),
    dinvOwn: await seedDriverInvite(agA, U.ownerA),
    dinvFm: await seedDriverInvite(agA, U.ownerA),
    dinvDeny: await seedDriverInvite(agA, U.ownerA),
    ainvOwn: await seedAgencyInvite(agA, U.ownerA),
    ainvDeny: await seedAgencyInvite(agA, U.ownerA),
    agrUpdOwn: await seedAgreement(agA, nx('Upd Owner Client')),
    agrUpdFin: await seedAgreement(agA, nx('Upd Finance Client')),
    agrUpdDeny: await seedAgreement(agA, nx('Upd Deny Client')),
    siteUpdOwn: await seedSite(agA, hostAgr, nx('Site Owner')),
    siteUpdFin: await seedSite(agA, hostAgr, nx('Site Finance')),
    siteUpdDeny: await seedSite(agA, hostAgr, nx('Site Deny')),
    conUpdOwn: await seedContact(agA, hostAgr, nx('Contact Owner')),
    conUpdFin: await seedContact(agA, hostAgr, nx('Contact Finance')),
    conUpdDeny: await seedContact(agA, hostAgr, nx('Contact Deny')),
    tgtRevokeMem: M.tgtRevoke,
    tgtScopeMem: M.tgtScope,
    tgtDenyMem: M.tgtDeny,
  }

  const DENY_DRIVER = await newApprovedDriver('deny-driver')

  // Role-keyed target map. Roles: owner, second (fleet_manager / finance), deny
  // (any non-permitted actor in agency A), susp (suspended agency S row).
  const TGT = {
    veh: { owner: T.vUpdOwn, second: T.vUpdFm, deny: T.vUpdDeny, susp: TS.truck },
    empUpd: { owner: T.eUpdOwn, second: T.eUpdFm, deny: T.eUpdDeny, susp: TS.emp },
    empEnd: { owner: T.eEndOwn, second: T.eEndFm, deny: T.eEndDeny, susp: TS.emp },
    dinv: { owner: T.dinvOwn, second: T.dinvFm, deny: T.dinvDeny, susp: TS.dinv },
    agrUpd: { owner: T.agrUpdOwn, second: T.agrUpdFin, deny: T.agrUpdDeny, susp: TS.agr },
    agrParent: { owner: hostAgr, second: hostAgr, deny: hostAgr, susp: TS.agr },
    siteUpd: { owner: T.siteUpdOwn, second: T.siteUpdFin, deny: T.siteUpdDeny, susp: TS.site },
    conUpd: { owner: T.conUpdOwn, second: T.conUpdFin, deny: T.conUpdDeny, susp: TS.con },
    minvRevoke: { owner: T.ainvOwn, second: T.ainvDeny, deny: T.ainvDeny, susp: TS.ainv },
    memRevoke: { owner: T.tgtRevokeMem, second: T.tgtDenyMem, deny: T.tgtDenyMem, susp: M.susp },
    memScope: { owner: T.tgtScopeMem, second: T.tgtDenyMem, deny: T.tgtDenyMem, susp: M.susp },
  }

  // Command specs. `table` (when set) makes callSpec read the current version of target `id`.
  // `fresh` (when set) asks for a newly approved driver so an allowed create cannot collide.
  const F = {
    vehicle_create: {
      name: 'agency_vehicle_create',
      sql: 'public.agency_vehicle_create($1, $2)',
      args: (c) => [c.rc, 'eicher_14ft'],
    },
    vehicle_update: {
      name: 'agency_vehicle_update',
      sql: 'public.agency_vehicle_update($1, $2, $3::jsonb)',
      table: 'agency_trucks',
      target: TGT.veh,
      args: (c) => [c.id, c.ver, JSON.stringify({ notes: c.note })],
    },
    emp_create: {
      name: 'agency_driver_employment_create',
      sql: 'public.agency_driver_employment_create($1, $2, $3, $4, $5)',
      fresh: true,
      args: (c) => [c.drv, c.lic, 'LMV-TR', '2027-06-30', c.phone],
    },
    emp_update: {
      name: 'agency_driver_employment_update',
      sql: 'public.agency_driver_employment_update($1, $2, $3::jsonb)',
      table: 'agency_driver_employment',
      target: TGT.empUpd,
      args: (c) => [c.id, c.ver, JSON.stringify({ contact_phone: c.phone })],
    },
    emp_end: {
      name: 'agency_driver_employment_end',
      sql: 'public.agency_driver_employment_end($1, $2)',
      table: 'agency_driver_employment',
      target: TGT.empEnd,
      args: (c) => [c.id, c.ver],
    },
    dinv_create: {
      name: 'agency_driver_invitation_create',
      sql: 'public.agency_driver_invitation_create($1, $2, $3)',
      args: (c) => [c.phone, 7, c.key],
    },
    dinv_revoke: {
      name: 'agency_driver_invitation_revoke',
      sql: 'public.agency_driver_invitation_revoke($1, $2)',
      table: 'agency_driver_invitations',
      target: TGT.dinv,
      args: (c) => [c.id, c.ver],
    },
  }
  const C = {
    agr_create: {
      name: 'agency_client_agreement_create',
      sql: 'public.agency_client_agreement_create($1, $2, $3, $4)',
      args: (c) => [c.name, null, 30, c.key],
    },
    agr_update: {
      name: 'agency_client_agreement_update',
      sql: 'public.agency_client_agreement_update($1, $2, $3::jsonb)',
      table: 'agency_client_agreements',
      target: TGT.agrUpd,
      args: (c) => [c.id, c.ver, JSON.stringify({ payment_terms_days: 45 })],
    },
    site_create: {
      name: 'agency_client_site_create',
      sql: 'public.agency_client_site_create($1, $2, $3, $4, $5, $6, $7, $8)',
      target: TGT.agrParent,
      args: (c) => [c.id, 'ship_to', c.label, '1 Plant Road', 'Pune', 'Maharashtra', '411001', c.key],
    },
    site_update: {
      name: 'agency_client_site_update',
      sql: 'public.agency_client_site_update($1, $2, $3::jsonb)',
      table: 'agency_client_sites',
      target: TGT.siteUpd,
      args: (c) => [c.id, c.ver, JSON.stringify({ label: c.label })],
    },
    con_create: {
      name: 'agency_client_contact_create',
      sql: 'public.agency_client_contact_create($1, $2, $3, $4, $5, $6)',
      target: TGT.agrParent,
      args: (c) => [c.id, c.name, c.phone, null, null, c.key],
    },
    con_update: {
      name: 'agency_client_contact_update',
      sql: 'public.agency_client_contact_update($1, $2, $3::jsonb)',
      table: 'agency_client_contacts',
      target: TGT.conUpd,
      args: (c) => [c.id, c.ver, JSON.stringify({ full_name: c.name })],
    },
    tariff_publish: {
      name: 'agency_tariff_version_publish',
      sql: 'public.agency_tariff_version_publish($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
      target: TGT.agrParent,
      args: (c) => [c.id, 'Delhi', c.label, 'per_trip', 1200, '2026-12-01', 'eicher_14ft', null, null, c.key],
    },
  }
  const MEM = {
    invite: {
      name: 'agency_member_invite',
      sql: 'public.agency_member_invite($1, $2, $3, $4)',
      args: (c) => [c.email, 'viewer', 7, c.key],
    },
    minv_revoke: {
      name: 'agency_member_invitation_revoke',
      sql: 'public.agency_member_invitation_revoke($1, $2)',
      table: 'agency_invitations',
      target: TGT.minvRevoke,
      args: (c) => [c.id, c.ver],
    },
    mem_revoke: {
      name: 'agency_member_revoke',
      sql: 'public.agency_member_revoke($1, $2)',
      table: 'agency_memberships',
      target: TGT.memRevoke,
      args: (c) => [c.id, c.ver],
    },
    mem_scope: {
      name: 'agency_member_change_scope',
      sql: 'public.agency_member_change_scope($1, $2, $3)',
      table: 'agency_memberships',
      target: TGT.memScope,
      args: (c) => [c.id, c.ver, 'finance'],
    },
  }
  const FLEET_LIST = [F.vehicle_create, F.vehicle_update, F.emp_create, F.emp_update, F.emp_end, F.dinv_create, F.dinv_revoke]
  const CLIENT_LIST = [C.agr_create, C.agr_update, C.site_create, C.site_update, C.con_create, C.con_update, C.tariff_publish]
  const MEM_LIST = [MEM.invite, MEM.minv_revoke, MEM.mem_revoke, MEM.mem_scope]

  const OUTSIDERS = [
    { name: 'other-agency owner', who: U.outOwner },
    { name: 'other-agency fleet manager', who: U.outStaff },
  ]
  const SCOPE_NO_FLEET = [
    { name: 'dispatcher', who: U.disp, role: 'deny', msg: SCOPE_MSG },
    { name: 'finance', who: U.fin, role: 'deny', msg: SCOPE_MSG },
    { name: 'viewer', who: U.view, role: 'deny', msg: SCOPE_MSG },
  ]
  const SCOPE_NO_CLIENT = [
    { name: 'dispatcher', who: U.disp, role: 'deny', msg: SCOPE_MSG },
    { name: 'fleet manager', who: U.fm, role: 'deny', msg: SCOPE_MSG },
    { name: 'viewer', who: U.view, role: 'deny', msg: SCOPE_MSG },
  ]
  const SCOPE_NO_MEMBERSHIP = [
    { name: 'fleet manager', who: U.fm, role: 'deny', msg: SCOPE_MSG },
    { name: 'dispatcher', who: U.disp, role: 'deny', msg: SCOPE_MSG },
    { name: 'finance', who: U.fin, role: 'deny', msg: SCOPE_MSG },
    { name: 'viewer', who: U.view, role: 'deny', msg: SCOPE_MSG },
  ]
  const STATE_ACTORS = [
    { name: 'suspended-agency staff', who: U.susp, role: 'susp', msg: SUSPENDED_MSG },
    { name: 'revoked member', who: U.rev, role: 'deny', msg: NO_PROFILE_MSG },
    { name: 'no-profile user', who: U.none, role: 'deny', msg: NO_PROFILE_MSG },
  ]

  /** Context for one call. Targets are chosen per role; drivers are the fixed deny driver unless `fresh`. */
  const ctxOf = (spec, role) => ({
    id: spec.target ? spec.target[role] : undefined,
    drv: DENY_DRIVER,
    key: nx('key'),
    phone: nextPhone(),
    rc: nextRc(),
    lic: nextLicence(),
    name: nx('Client'),
    label: nx('Label'),
    email: nextInviteEmail(),
    note: nx('note'),
  })
  const freshCtx = async (spec, role) => {
    const c = ctxOf(spec, role)
    if (spec.fresh) c.drv = await newApprovedDriver(nx('drv'))
    return c
  }

  /** Runs one command as `who`. Returns the jsonb envelope; a raised SQL error propagates. */
  async function callSpec(who, spec, c) {
    if (spec.table) {
      await actAsService()
      c.ver = await verOf(spec.table, c.id)
    }
    await actAs(who)
    const r = await db.query(`SELECT ${spec.sql} AS r`, spec.args(c))
    return r.rows[0].r
  }

  /** Allowed cell: the call must return ok:true, then the database must show the effect. */
  async function runAllowed(who, spec, c, check) {
    const env = await callSpec(who, spec, c)
    expect(env && env.ok === true, `${spec.name}: expected ok envelope, got ${JSON.stringify(env)}`)
    await actAsService()
    await check()
  }

  /**
   * Denied group: every actor's call must RAISE the exact message, and no row of the
   * listed agencies may change. Returns failure strings instead of throwing so a
   * multi-spec case can report every unmet cell.
   */
  async function denyGroup(spec, actors, agencyIds = ALL) {
    const fails = []
    await actAsService()
    const before = await snapshot(agencyIds)
    for (const a of actors) {
      try {
        const env = await callSpec(a.who, spec, ctxOf(spec, a.role))
        fails.push(`${spec.name} as ${a.name}: returned ${JSON.stringify(env).slice(0, 90)} instead of raising "${a.msg}"`)
      } catch (error) {
        const m = firstLine(error)
        if (!m.includes(a.msg)) fails.push(`${spec.name} as ${a.name}: expected "${a.msg}", got "${m.slice(0, 120)}"`)
      }
    }
    const after = await snapshot(agencyIds)
    if (before !== after) fails.push(`${spec.name}: agency state changed by denied calls`)
    return fails
  }

  /**
   * Outsider group (other-agency owner and staff) against agency A targets. A call with
   * an agency-A target must not succeed; a create may only land in the outsider's own
   * agency. Agency A's rows must not change in any case.
   */
  async function outsiderGroup(specs) {
    const fails = []
    await actAsService()
    const before = await snapshot([agA])
    for (const spec of specs) {
      for (const o of OUTSIDERS) {
        const c = await freshCtx(spec, 'deny')
        try {
          const env = await callSpec(o.who, spec, c)
          if (spec.target && env && env.ok === true) {
            fails.push(`${o.name} ${spec.name}: succeeded on an agency A target`)
          }
        } catch {
          // Denied as expected.
        }
      }
    }
    const after = await snapshot([agA])
    if (before !== after) fails.push('agency A state changed under outsider calls')
    return fails
  }

  /** Zero-row DML denial for each actor (UPDATE / DELETE denial semantics). */
  async function zeroRowDml(actors, sql, params) {
    const fails = []
    for (const [name, who] of actors) {
      const out = await dmlOutcome(who, sql, params)
      if (out.error) fails.push(`${name}: raised "${out.error.slice(0, 100)}" instead of 0 rows`)
      else if (out.rows.length !== 0) fails.push(`${name}: changed ${out.rows.length} row(s)`)
    }
    return fails
  }

  /** Direct INSERT denial for each actor (RLS semantics). */
  async function rlsInsertDenied(actors, sql, paramsOf) {
    const fails = []
    for (const [name, who, agencyId] of actors) {
      const out = await dmlOutcome(who, sql, paramsOf(agencyId))
      if (!out.error || !out.error.includes('row-level security')) {
        fails.push(`${name}: ${out.error ? `error "${out.error.slice(0, 100)}"` : 'insert succeeded'} (expected row-level security)`)
      }
    }
    return fails
  }

  const expectNoFails = (fails) => expect(fails.length === 0, fails.join(' | '))

  // =========================================================================
  // C. Fleet commands (owner and fleet_manager; dispatcher, finance, viewer denied by scope)
  // =========================================================================
  await testCase('C1. owner may create a vehicle (agency_vehicle_create)', async () => {
    const c = await freshCtx(F.vehicle_create, 'owner')
    await runAllowed(U.ownerA, F.vehicle_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1 AND rc_number = $2`, [agA, c.rc])
    )
  })

  await testCase('C2. fleet_manager may create a vehicle (agency_vehicle_create)', async () => {
    const c = await freshCtx(F.vehicle_create, 'owner')
    await runAllowed(U.fm, F.vehicle_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1 AND rc_number = $2`, [agA, c.rc])
    )
  })

  await testCase('C3. dispatcher, finance and viewer are denied vehicle creation with the scope message', async () => {
    expectNoFails(await denyGroup(F.vehicle_create, SCOPE_NO_FLEET))
  })

  await testCase('C4. owner may update a vehicle at the current version (agency_vehicle_update)', async () => {
    const c = await freshCtx(F.vehicle_update, 'owner')
    await runAllowed(U.ownerA, F.vehicle_update, c, () =>
      valueIs(`SELECT notes AS v FROM public.agency_trucks WHERE id = $1`, [c.id], c.note)
    )
  })

  await testCase('C5. fleet_manager may update a vehicle (agency_vehicle_update)', async () => {
    const c = await freshCtx(F.vehicle_update, 'second')
    await runAllowed(U.fm, F.vehicle_update, c, () =>
      valueIs(`SELECT notes AS v FROM public.agency_trucks WHERE id = $1`, [c.id], c.note)
    )
  })

  await testCase('C6. dispatcher, finance and viewer are denied vehicle update with the scope message', async () => {
    expectNoFails(await denyGroup(F.vehicle_update, SCOPE_NO_FLEET))
  })

  await testCase('C7. owner may create a driver employment (agency_driver_employment_create)', async () => {
    const c = await freshCtx(F.emp_create, 'owner')
    await runAllowed(U.ownerA, F.emp_create, c, () =>
      countIs(
        `SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE agency_id = $1 AND driver_id = $2 AND status = 'active'`,
        [agA, c.drv]
      )
    )
  })

  await testCase('C8. fleet_manager may create a driver employment (agency_driver_employment_create)', async () => {
    const c = await freshCtx(F.emp_create, 'owner')
    await runAllowed(U.fm, F.emp_create, c, () =>
      countIs(
        `SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE agency_id = $1 AND driver_id = $2 AND status = 'active'`,
        [agA, c.drv]
      )
    )
  })

  await testCase('C9. dispatcher, finance and viewer are denied employment creation with the scope message', async () => {
    expectNoFails(await denyGroup(F.emp_create, SCOPE_NO_FLEET))
  })

  await testCase('C10. owner may update a driver employment (agency_driver_employment_update)', async () => {
    const c = await freshCtx(F.emp_update, 'owner')
    await runAllowed(U.ownerA, F.emp_update, c, () =>
      valueIs(`SELECT contact_phone AS v FROM public.agency_driver_employment WHERE id = $1`, [c.id], c.phone)
    )
  })

  await testCase('C11. fleet_manager may update a driver employment (agency_driver_employment_update)', async () => {
    const c = await freshCtx(F.emp_update, 'second')
    await runAllowed(U.fm, F.emp_update, c, () =>
      valueIs(`SELECT contact_phone AS v FROM public.agency_driver_employment WHERE id = $1`, [c.id], c.phone)
    )
  })

  await testCase('C12. dispatcher, finance and viewer are denied employment update with the scope message', async () => {
    expectNoFails(await denyGroup(F.emp_update, SCOPE_NO_FLEET))
  })

  await testCase('C13. owner may end a driver employment (agency_driver_employment_end)', async () => {
    const c = await freshCtx(F.emp_end, 'owner')
    await runAllowed(U.ownerA, F.emp_end, c, () =>
      valueIs(`SELECT status AS v FROM public.agency_driver_employment WHERE id = $1`, [c.id], 'ended')
    )
  })

  await testCase('C14. fleet_manager may end a driver employment (agency_driver_employment_end)', async () => {
    const c = await freshCtx(F.emp_end, 'second')
    await runAllowed(U.fm, F.emp_end, c, () =>
      valueIs(`SELECT status AS v FROM public.agency_driver_employment WHERE id = $1`, [c.id], 'ended')
    )
  })

  await testCase('C15. dispatcher, finance and viewer are denied employment end with the scope message', async () => {
    expectNoFails(await denyGroup(F.emp_end, SCOPE_NO_FLEET))
  })

  await testCase('C16. owner may create a driver invitation (agency_driver_invitation_create)', async () => {
    const c = await freshCtx(F.dinv_create, 'owner')
    await runAllowed(U.ownerA, F.dinv_create, c, () =>
      countIs(
        `SELECT count(*)::int AS n FROM public.agency_driver_invitations WHERE agency_id = $1 AND invited_phone = $2 AND status = 'pending'`,
        [agA, c.phone]
      )
    )
  })

  await testCase('C17. fleet_manager may create a driver invitation (agency_driver_invitation_create)', async () => {
    const c = await freshCtx(F.dinv_create, 'owner')
    await runAllowed(U.fm, F.dinv_create, c, () =>
      countIs(
        `SELECT count(*)::int AS n FROM public.agency_driver_invitations WHERE agency_id = $1 AND invited_phone = $2 AND status = 'pending'`,
        [agA, c.phone]
      )
    )
  })

  await testCase('C18. dispatcher, finance and viewer are denied driver invitation creation with the scope message', async () => {
    expectNoFails(await denyGroup(F.dinv_create, SCOPE_NO_FLEET))
  })

  await testCase('C19. owner may revoke a driver invitation (agency_driver_invitation_revoke)', async () => {
    const c = await freshCtx(F.dinv_revoke, 'owner')
    await runAllowed(U.ownerA, F.dinv_revoke, c, () =>
      valueIs(`SELECT status AS v FROM public.agency_driver_invitations WHERE id = $1`, [c.id], 'revoked')
    )
  })

  await testCase('C20. fleet_manager may revoke a driver invitation (agency_driver_invitation_revoke)', async () => {
    const c = await freshCtx(F.dinv_revoke, 'second')
    await runAllowed(U.fm, F.dinv_revoke, c, () =>
      valueIs(`SELECT status AS v FROM public.agency_driver_invitations WHERE id = $1`, [c.id], 'revoked')
    )
  })

  await testCase('C21. dispatcher, finance and viewer are denied driver invitation revoke with the scope message', async () => {
    expectNoFails(await denyGroup(F.dinv_revoke, SCOPE_NO_FLEET))
  })

  await testCase('C22. suspended-agency staff, revoked member and no-profile user are denied every fleet command with their exact state message', async () => {
    const fails = []
    for (const spec of FLEET_LIST) fails.push(...(await denyGroup(spec, STATE_ACTORS)))
    expectNoFails(fails)
  })

  await testCase('C23. other-agency owner and fleet manager cannot change agency A through any fleet command', async () => {
    expectNoFails(await outsiderGroup(FLEET_LIST))
  })

  // =========================================================================
  // D. Client commands (owner and finance; dispatcher, fleet_manager, viewer denied by scope)
  // =========================================================================
  await testCase('D1. owner may create a client agreement (agency_client_agreement_create)', async () => {
    const c = await freshCtx(C.agr_create, 'owner')
    await runAllowed(U.ownerA, C.agr_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_client_agreements WHERE agency_id = $1 AND client_name = $2`, [agA, c.name])
    )
  })

  await testCase('D2. finance may create a client agreement (agency_client_agreement_create)', async () => {
    const c = await freshCtx(C.agr_create, 'owner')
    await runAllowed(U.fin, C.agr_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_client_agreements WHERE agency_id = $1 AND client_name = $2`, [agA, c.name])
    )
  })

  await testCase('D3. dispatcher, fleet_manager and viewer are denied client agreement creation with the scope message', async () => {
    expectNoFails(await denyGroup(C.agr_create, SCOPE_NO_CLIENT))
  })

  await testCase('D4. owner may update a client agreement at the current version (agency_client_agreement_update)', async () => {
    const c = await freshCtx(C.agr_update, 'owner')
    await runAllowed(U.ownerA, C.agr_update, c, () =>
      valueIs(`SELECT payment_terms_days::int AS v FROM public.agency_client_agreements WHERE id = $1`, [c.id], 45)
    )
  })

  await testCase('D5. finance may update a client agreement (agency_client_agreement_update)', async () => {
    const c = await freshCtx(C.agr_update, 'second')
    await runAllowed(U.fin, C.agr_update, c, () =>
      valueIs(`SELECT payment_terms_days::int AS v FROM public.agency_client_agreements WHERE id = $1`, [c.id], 45)
    )
  })

  await testCase('D6. dispatcher, fleet_manager and viewer are denied client agreement update with the scope message', async () => {
    expectNoFails(await denyGroup(C.agr_update, SCOPE_NO_CLIENT))
  })

  await testCase('D7. owner may add a ship-to site (agency_client_site_create)', async () => {
    const c = await freshCtx(C.site_create, 'owner')
    await runAllowed(U.ownerA, C.site_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_client_sites WHERE agreement_id = $1 AND label = $2`, [hostAgr, c.label])
    )
  })

  await testCase('D8. finance may add a ship-to site (agency_client_site_create)', async () => {
    const c = await freshCtx(C.site_create, 'second')
    await runAllowed(U.fin, C.site_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_client_sites WHERE agreement_id = $1 AND label = $2`, [hostAgr, c.label])
    )
  })

  await testCase('D9. dispatcher, fleet_manager and viewer are denied site creation with the scope message', async () => {
    expectNoFails(await denyGroup(C.site_create, SCOPE_NO_CLIENT))
  })

  await testCase('D10. owner may update a client site at the current version (agency_client_site_update)', async () => {
    const c = await freshCtx(C.site_update, 'owner')
    await runAllowed(U.ownerA, C.site_update, c, () =>
      valueIs(`SELECT label AS v FROM public.agency_client_sites WHERE id = $1`, [c.id], c.label)
    )
  })

  await testCase('D11. finance may update a client site (agency_client_site_update)', async () => {
    const c = await freshCtx(C.site_update, 'second')
    await runAllowed(U.fin, C.site_update, c, () =>
      valueIs(`SELECT label AS v FROM public.agency_client_sites WHERE id = $1`, [c.id], c.label)
    )
  })

  await testCase('D12. dispatcher, fleet_manager and viewer are denied site update with the scope message', async () => {
    expectNoFails(await denyGroup(C.site_update, SCOPE_NO_CLIENT))
  })

  await testCase('D13. owner may add a client contact (agency_client_contact_create)', async () => {
    const c = await freshCtx(C.con_create, 'owner')
    await runAllowed(U.ownerA, C.con_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_client_contacts WHERE agreement_id = $1 AND full_name = $2`, [hostAgr, c.name])
    )
  })

  await testCase('D14. finance may add a client contact (agency_client_contact_create)', async () => {
    const c = await freshCtx(C.con_create, 'second')
    await runAllowed(U.fin, C.con_create, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_client_contacts WHERE agreement_id = $1 AND full_name = $2`, [hostAgr, c.name])
    )
  })

  await testCase('D15. dispatcher, fleet_manager and viewer are denied contact creation with the scope message', async () => {
    expectNoFails(await denyGroup(C.con_create, SCOPE_NO_CLIENT))
  })

  await testCase('D16. owner may update a client contact at the current version (agency_client_contact_update)', async () => {
    const c = await freshCtx(C.con_update, 'owner')
    await runAllowed(U.ownerA, C.con_update, c, () =>
      valueIs(`SELECT full_name AS v FROM public.agency_client_contacts WHERE id = $1`, [c.id], c.name)
    )
  })

  await testCase('D17. finance may update a client contact (agency_client_contact_update)', async () => {
    const c = await freshCtx(C.con_update, 'second')
    await runAllowed(U.fin, C.con_update, c, () =>
      valueIs(`SELECT full_name AS v FROM public.agency_client_contacts WHERE id = $1`, [c.id], c.name)
    )
  })

  await testCase('D18. dispatcher, fleet_manager and viewer are denied contact update with the scope message', async () => {
    expectNoFails(await denyGroup(C.con_update, SCOPE_NO_CLIENT))
  })

  await testCase('D19. owner may publish a tariff version (agency_tariff_version_publish)', async () => {
    const c = await freshCtx(C.tariff_publish, 'owner')
    await runAllowed(U.ownerA, C.tariff_publish, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_tariff_versions WHERE agreement_id = $1 AND destination_label = $2`, [hostAgr, c.label])
    )
  })

  await testCase('D20. finance may publish a tariff version (agency_tariff_version_publish)', async () => {
    const c = await freshCtx(C.tariff_publish, 'second')
    await runAllowed(U.fin, C.tariff_publish, c, () =>
      countIs(`SELECT count(*)::int AS n FROM public.agency_tariff_versions WHERE agreement_id = $1 AND destination_label = $2`, [hostAgr, c.label])
    )
  })

  await testCase('D21. dispatcher, fleet_manager and viewer are denied tariff publish with the scope message', async () => {
    expectNoFails(await denyGroup(C.tariff_publish, SCOPE_NO_CLIENT))
  })

  await testCase('D22. suspended-agency staff, revoked member and no-profile user are denied every client command with their exact state message', async () => {
    const fails = []
    for (const spec of CLIENT_LIST) fails.push(...(await denyGroup(spec, STATE_ACTORS)))
    expectNoFails(fails)
  })

  await testCase('D23. other-agency owner and fleet manager cannot change agency A through any client command', async () => {
    expectNoFails(await outsiderGroup(CLIENT_LIST))
  })

  // =========================================================================
  // E. Membership commands (owner only; every staff scope denied by scope)
  // =========================================================================
  await testCase('E1. owner may invite a member (agency_member_invite)', async () => {
    const c = await freshCtx(MEM.invite, 'owner')
    await runAllowed(U.ownerA, MEM.invite, c, () =>
      countIs(
        `SELECT count(*)::int AS n FROM public.agency_invitations WHERE agency_id = $1 AND invited_email = $2 AND scope = 'viewer' AND status = 'pending'`,
        [agA, c.email]
      )
    )
  })

  await testCase('E2. fleet_manager, dispatcher, finance and viewer are denied member invitation with the scope message', async () => {
    expectNoFails(await denyGroup(MEM.invite, SCOPE_NO_MEMBERSHIP))
  })

  await testCase('E3. owner may revoke a pending invitation (agency_member_invitation_revoke)', async () => {
    const c = await freshCtx(MEM.minv_revoke, 'owner')
    await runAllowed(U.ownerA, MEM.minv_revoke, c, () =>
      valueIs(`SELECT status AS v FROM public.agency_invitations WHERE id = $1`, [c.id], 'revoked')
    )
  })

  await testCase('E4. fleet_manager, dispatcher, finance and viewer are denied invitation revoke with the scope message', async () => {
    expectNoFails(await denyGroup(MEM.minv_revoke, SCOPE_NO_MEMBERSHIP))
  })

  await testCase('E5. owner may revoke a membership (agency_member_revoke)', async () => {
    const c = await freshCtx(MEM.mem_revoke, 'owner')
    await runAllowed(U.ownerA, MEM.mem_revoke, c, () =>
      valueIs(`SELECT status AS v FROM public.agency_memberships WHERE id = $1`, [c.id], 'revoked')
    )
  })

  await testCase('E6. fleet_manager, dispatcher, finance and viewer are denied membership revoke with the scope message', async () => {
    expectNoFails(await denyGroup(MEM.mem_revoke, SCOPE_NO_MEMBERSHIP))
  })

  await testCase('E7. owner may change a member scope (agency_member_change_scope)', async () => {
    const c = await freshCtx(MEM.mem_scope, 'owner')
    await runAllowed(U.ownerA, MEM.mem_scope, c, () =>
      valueIs(`SELECT scope AS v FROM public.agency_memberships WHERE id = $1`, [c.id], 'finance')
    )
  })

  await testCase('E8. fleet_manager, dispatcher, finance and viewer are denied scope change with the scope message', async () => {
    expectNoFails(await denyGroup(MEM.mem_scope, SCOPE_NO_MEMBERSHIP))
  })

  await testCase('E9. suspended-agency staff, revoked member and no-profile user are denied every membership command with their exact state message', async () => {
    const fails = []
    for (const spec of MEM_LIST) fails.push(...(await denyGroup(spec, STATE_ACTORS)))
    expectNoFails(fails)
  })

  await testCase('E10. other-agency owner and fleet manager cannot change agency A membership through any membership command', async () => {
    expectNoFails(await outsiderGroup(MEM_LIST))
  })

  // =========================================================================
  // F. Read matrix (SELECT visibility per scope)
  // =========================================================================
  let fIndex = 1
  for (const table of TABLES_READ) {
    await testCase(`F${fIndex}. owner and all four scopes can read ${table} rows of agency A`, async () => {
      const fails = []
      for (const [name, who] of [
        ['owner', U.ownerA],
        ['fleet manager', U.fm],
        ['dispatcher', U.disp],
        ['finance', U.fin],
        ['viewer', U.view],
      ]) {
        const n = await visibleCount(who, table, agA)
        if (n === 0) fails.push(`${name} sees 0 rows`)
      }
      expectNoFails(fails)
    })
    fIndex += 1
  }
  for (const table of TABLES_READ) {
    await testCase(`F${fIndex}. suspended-agency staff, revoked member and other-agency users read zero ${table} rows`, async () => {
      const fails = []
      const denied = [
        ['suspended-agency staff', U.susp, agS],
        ['revoked member', U.rev, agA],
        ['other-agency owner', U.outOwner, agA],
        ['other-agency fleet manager', U.outStaff, agA],
      ]
      for (const [name, who, target] of denied) {
        const n = await visibleCount(who, table, target)
        if (n !== 0) fails.push(`${name} sees ${n} row(s)`)
      }
      if ((await totalCount(table, agS)) === 0 || (await totalCount(table, agA)) === 0) {
        fails.push('fixture rows missing (denial would be vacuous)')
      }
      expectNoFails(fails)
    })
    fIndex += 1
  }
  await testCase(`F${fIndex}. owner and fleet_manager can read agency_driver_invitations rows of agency A`, async () => {
    const fails = []
    for (const [name, who] of [['owner', U.ownerA], ['fleet manager', U.fm]]) {
      if ((await visibleCount(who, 'agency_driver_invitations', agA)) === 0) fails.push(`${name} sees 0 rows`)
    }
    expectNoFails(fails)
  })
  fIndex += 1
  await testCase(`F${fIndex}. dispatcher, finance, viewer, suspended-agency staff, revoked member and other-agency users read zero agency_driver_invitations rows`, async () => {
    const fails = []
    const denied = [
      ['dispatcher', U.disp, agA],
      ['finance', U.fin, agA],
      ['viewer', U.view, agA],
      ['suspended-agency staff', U.susp, agS],
      ['revoked member', U.rev, agA],
      ['other-agency owner', U.outOwner, agA],
      ['other-agency fleet manager', U.outStaff, agA],
    ]
    for (const [name, who, target] of denied) {
      const n = await visibleCount(who, 'agency_driver_invitations', target)
      if (n !== 0) fails.push(`${name} sees ${n} row(s)`)
    }
    expectNoFails(fails)
  })
  fIndex += 1

  // =========================================================================
  // G. Direct table writes (RLS and DELETE ownership)
  // =========================================================================
  const NON_FLEET = [
    ['dispatcher', U.disp],
    ['finance', U.fin],
    ['viewer', U.view],
    ['suspended-agency staff', U.susp],
    ['revoked member', U.rev],
    ['other-agency owner', U.outOwner],
    ['other-agency fleet manager', U.outStaff],
    ['no-profile user', U.none],
  ]
  const NON_OWNER = [['fleet manager', U.fm], ...NON_FLEET]
  const TRUCK_INSERT = `INSERT INTO public.agency_trucks (agency_id, vehicle_type, rc_number) VALUES ($1, 'tata_ace', $2) RETURNING id`
  const EMP_INSERT = `INSERT INTO public.agency_driver_employment (agency_id, driver_id) VALUES ($1, $2) RETURNING id`

  await testCase('G1. owner may insert a vehicle directly into its own agency (RLS insert)', async () => {
    const out = await dmlOutcome(U.ownerA, TRUCK_INSERT, [agA, nextRc()])
    expect(!out.error && out.rows.length === 1, `owner direct insert refused: ${out.error || 'no row returned'}`)
  })

  await testCase('G2. fleet_manager may insert a vehicle directly into its agency (RLS insert)', async () => {
    const out = await dmlOutcome(U.fm, TRUCK_INSERT, [agA, nextRc()])
    expect(!out.error && out.rows.length === 1, `fleet_manager direct insert refused: ${out.error || 'no row returned'}`)
  })

  await testCase('G3. dispatcher, finance, viewer, suspended, revoked, other-agency and no-profile users are refused a direct vehicle insert by RLS', async () => {
    expectNoFails(await rlsInsertDenied(
      [
        ...NON_FLEET.map(([name, who]) => [name, who, name === 'suspended-agency staff' ? agS : agA]),
      ],
      TRUCK_INSERT,
      (agencyId) => [agencyId, nextRc()]
    ))
  })

  await testCase('G4. owner may update a vehicle directly (RLS update)', async () => {
    const note = nx('direct-owner')
    const out = await dmlOutcome(U.ownerA, `UPDATE public.agency_trucks SET notes = $2 WHERE id = $1 RETURNING id`, [T.dUpdOwn, note])
    expect(!out.error && out.rows.length === 1, `owner direct update changed ${out.rows?.length ?? 0} row(s): ${out.error || ''}`)
  })

  await testCase('G5. fleet_manager may update a vehicle directly (RLS update)', async () => {
    const note = nx('direct-fm')
    const out = await dmlOutcome(U.fm, `UPDATE public.agency_trucks SET notes = $2 WHERE id = $1 RETURNING id`, [T.dUpdFm, note])
    expect(!out.error && out.rows.length === 1, `fleet_manager direct update changed ${out.rows?.length ?? 0} row(s): ${out.error || ''}`)
  })

  await testCase('G6. dispatcher, finance, viewer and every other non-fleet actor update zero vehicle rows directly', async () => {
    expectNoFails(await zeroRowDml(NON_FLEET, `UPDATE public.agency_trucks SET notes = 'denied' WHERE id = $1 RETURNING id`, [T.dUpdDeny]))
  })

  await testCase('G7. owner may delete a vehicle directly (DELETE is owner-only)', async () => {
    const out = await dmlOutcome(U.ownerA, `DELETE FROM public.agency_trucks WHERE id = $1 RETURNING id`, [T.dDelOwn])
    expect(!out.error && out.rows.length === 1, `owner direct delete removed ${out.rows?.length ?? 0} row(s): ${out.error || ''}`)
  })

  await testCase('G8. fleet_manager and every other actor delete zero vehicle rows directly', async () => {
    expectNoFails(await zeroRowDml(NON_OWNER, `DELETE FROM public.agency_trucks WHERE id = $1 RETURNING id`, [T.dDelDeny]))
    await countIs(`SELECT count(*)::int AS n FROM public.agency_trucks WHERE id = $1`, [T.dDelDeny])
  })

  await testCase('G9. owner may insert a driver employment directly (RLS insert)', async () => {
    const driver = await newApprovedDriver(nx('ins-owner'))
    const out = await dmlOutcome(U.ownerA, EMP_INSERT, [agA, driver])
    expect(!out.error && out.rows.length === 1, `owner direct employment insert refused: ${out.error || 'no row returned'}`)
  })

  await testCase('G10. fleet_manager may insert a driver employment directly (RLS insert)', async () => {
    const driver = await newApprovedDriver(nx('ins-fm'))
    const out = await dmlOutcome(U.fm, EMP_INSERT, [agA, driver])
    expect(!out.error && out.rows.length === 1, `fleet_manager direct employment insert refused: ${out.error || 'no row returned'}`)
  })

  await testCase('G11. dispatcher, finance, viewer, suspended, revoked, other-agency and no-profile users are refused a direct employment insert by RLS', async () => {
    expectNoFails(await rlsInsertDenied(
      NON_FLEET.map(([name, who]) => [name, who, name === 'suspended-agency staff' ? agS : agA]),
      EMP_INSERT,
      (agencyId) => [agencyId, DENY_DRIVER]
    ))
  })

  await testCase('G12. owner may update a driver employment directly (RLS update)', async () => {
    const phone = nextPhone()
    const out = await dmlOutcome(U.ownerA, `UPDATE public.agency_driver_employment SET contact_phone = $2 WHERE id = $1 RETURNING id`, [T.eDUpdOwn, phone])
    expect(!out.error && out.rows.length === 1, `owner direct employment update changed ${out.rows?.length ?? 0} row(s): ${out.error || ''}`)
  })

  await testCase('G13. fleet_manager may update a driver employment directly (RLS update)', async () => {
    const phone = nextPhone()
    const out = await dmlOutcome(U.fm, `UPDATE public.agency_driver_employment SET contact_phone = $2 WHERE id = $1 RETURNING id`, [T.eDUpdFm, phone])
    expect(!out.error && out.rows.length === 1, `fleet_manager direct employment update changed ${out.rows?.length ?? 0} row(s): ${out.error || ''}`)
  })

  await testCase('G14. dispatcher, finance, viewer and every other non-fleet actor update zero employment rows directly', async () => {
    expectNoFails(await zeroRowDml(NON_FLEET, `UPDATE public.agency_driver_employment SET contact_phone = '9999999999' WHERE id = $1 RETURNING id`, [T.eDUpdDeny]))
  })

  await testCase('G15. owner may delete a driver employment directly (DELETE is owner-only)', async () => {
    const out = await dmlOutcome(U.ownerA, `DELETE FROM public.agency_driver_employment WHERE id = $1 RETURNING id`, [T.eDDelOwn])
    expect(!out.error && out.rows.length === 1, `owner direct employment delete removed ${out.rows?.length ?? 0} row(s): ${out.error || ''}`)
  })

  await testCase('G16. fleet_manager and every other actor delete zero employment rows directly', async () => {
    expectNoFails(await zeroRowDml(NON_OWNER, `DELETE FROM public.agency_driver_employment WHERE id = $1 RETURNING id`, [T.eDDelDeny]))
    await countIs(`SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE id = $1`, [T.eDDelDeny])
  })

  // =========================================================================
  // H. Wrong-agency isolation (fleet_manager of A versus agency B)
  // =========================================================================
  await testCase('H1. fleet_manager of agency A reads zero agency B rows across all seven agency tables', async () => {
    const fails = []
    for (const table of [...TABLES_READ, 'agency_driver_invitations']) {
      const n = await visibleCount(U.fm, table, agB)
      if (n !== 0) fails.push(`${table}: ${n} agency B row(s) visible`)
      if ((await totalCount(table, agB)) === 0) fails.push(`${table}: no agency B fixture rows (vacuous)`)
    }
    expectNoFails(fails)
  })

  await testCase('H2. fleet_manager of agency A cannot write agency B rows (direct DML and command RPCs)', async () => {
    const fails = []
    await actAsService()
    const before = await snapshot([agB])
    const probes = [
      [`UPDATE public.agency_trucks SET notes = 'x' WHERE id = $1 RETURNING id`, [TB.truck], 'direct truck update of B'],
      [`DELETE FROM public.agency_trucks WHERE id = $1 RETURNING id`, [TB.truck], 'direct truck delete of B'],
      [`UPDATE public.agency_driver_employment SET contact_phone = '9999999999' WHERE id = $1 RETURNING id`, [TB.emp], 'direct employment update of B'],
      [`DELETE FROM public.agency_driver_employment WHERE id = $1 RETURNING id`, [TB.emp], 'direct employment delete of B'],
    ]
    for (const [sql, params, label] of probes) {
      const out = await dmlOutcome(U.fm, sql, params)
      if (out.error || out.rows.length !== 0) fails.push(`${label}: ${out.error || `${out.rows.length} row(s)`}`)
    }
    const rpcVehicle = ctxOf(F.vehicle_update, 'deny')
    rpcVehicle.id = TB.truck
    try {
      await callSpec(U.fm, F.vehicle_update, rpcVehicle)
      fails.push('agency_vehicle_update on a B truck returned without raising')
    } catch (error) {
      const m = firstLine(error)
      if (!m.includes('Vehicle not found or access denied.')) fails.push(`agency_vehicle_update on B: "${m.slice(0, 120)}"`)
    }
    const rpcEmployment = ctxOf(F.emp_end, 'deny')
    rpcEmployment.id = TB.emp
    try {
      await callSpec(U.fm, F.emp_end, rpcEmployment)
      fails.push('agency_driver_employment_end on a B employment returned without raising')
    } catch (error) {
      const m = firstLine(error)
      if (!m.includes('Employment record not found or access denied.')) fails.push(`agency_driver_employment_end on B: "${m.slice(0, 120)}"`)
    }
    const after = await snapshot([agB])
    if (before !== after) fails.push('agency B state changed')
    expectNoFails(fails)
  })

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  const passed = results.filter((r) => r.pass).length
  const total = results.length
  console.log(`\nSTAFF-SCOPE fleet/client/membership battery: ${passed}/${total} passed, ${total - passed} failed`)
  const failed = results.filter((r) => !r.pass)
  if (failed.length > 0) {
    console.log('failed cases:')
    for (const f of failed) console.log(`  - ${f.name}`)
  }
  process.exit(passed === total ? 0 : 1)
}

main().catch((error) => {
  console.error(`FAIL: battery crashed: ${error && error.message ? error.message : error}`)
  if (error && error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'))
  process.exit(1)
})
