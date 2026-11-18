#!/usr/bin/env node
/**
 * Agency identity update — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). Replays supabase/migrations
 * including 20261038000000_agency_identity_update.sql and calls the command the way PostgREST does
 * (`SET ROLE authenticated`, `request.jwt.claims` = caller).
 *
 * Pinned contract:
 *   public.agency_identity_update(p_legal_name, p_gstin, p_phone, p_address, p_state,
 *                                 p_expected_updated_at timestamptz DEFAULT NULL,
 *                                 p_city text DEFAULT NULL, p_pincode text DEFAULT NULL) RETURNS jsonb
 *     - SECURITY DEFINER, search_path pinned, EXECUTE authenticated only (not PUBLIC, not anon).
 *     - OWNER only (transport_agencies.user_id = auth.uid()); staff -> forbidden_scope.
 *     - Typed refusals (never an exception): sign_in_required, not_found, forbidden_scope,
 *       agency_not_approved (rejected/suspended), multiple_agencies, invalid_name, invalid_gstin,
 *       invalid_phone, invalid_state, gstin_state_mismatch, stale_version.
 *     - GSTIN: blank -> NULL (unregistered), else 15-char GSTIN regex (upper-cased, trimmed).
 *     - Phone: digits only; >= 10 digits -> the last 10 are stored (same rule as the trial claim).
 *     - State: a recognised state name; when a GSTIN is present its first two digits must equal that state.
 *     - Never changes status, approval fields, user_id, rating, bank, PAN.
 *     - Changing GSTIN/phone never creates trial eligibility (claims are keyed by agency_id too).
 *
 * Evidence class: local DB only (PGlite, single session).
 * Usage:  node scripts/agency_identity_update.db.test.mjs   (from the repo root)
 */


import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261038000000_agency_identity_update.sql'
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
const GST_DL = '07ABCDE1234F1Z5' // Delhi (07)
const GST_MH = '27ABCDE1234F1Z5' // Maharashtra (27)
const GST_MH2 = '27PQRST5678G1Z9'

let ownerA, ownerB, ownerPending, ownerRejected, ownerSuspended, ownerMulti, noAgency
let agencyA, agencyB, agencyPending
let financeA, dispatcherA, viewerA, revokedA

async function createAgency(userId, tag, status, extra = {}) {
  const id = uid()
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, state, status, gstin, contact_phone, pan_number, address, rating, bank_account)
     VALUES ($1, $2, $3, 'Delhi', 'Delhi', $4, $5, $6, $7, 'Old Road', 4.5, 'BANK-SENTINEL')`,
    [id, userId, `${tag} Transport Pvt Ltd`, status, extra.gstin ?? GST_DL, extra.phone ?? '9811111111', `ABCDE${5000 + seq}Q`]
  )
  return id
}

async function row(agencyId) {
  return suOne(`SELECT * FROM public.transport_agencies WHERE id = $1`, [agencyId])
}

const base = (o = {}) => ({
  name: 'Renamed Logistics Pvt Ltd',
  gstin: GST_MH,
  phone: '+91 98765 43210',
  address: '12 New Road, Andheri',
  state: 'Maharashtra',
  expected: null,
  city: null,
  pincode: null,
  ...o,
})

async function callAs(userId, a) {
  return asActor(userId, async () =>
    parseJson(
      (
        await db.query(`SELECT public.agency_identity_update($1,$2,$3,$4,$5,$6::timestamptz,$7,$8) AS r`, [
          a.name,
          a.gstin,
          a.phone,
          a.address,
          a.state,
          a.expected,
          a.city,
          a.pincode,
        ])
      ).rows[0].r
    )
  )
}

const TRIAL_SQL = `SELECT public.agency_subscription_start_trial() AS r`
async function trialAs(userId) {
  return asActor(userId, async () => parseJson((await db.query(TRIAL_SQL)).rows[0].r))
}

async function setupFixtures() {
  ownerA = await createUser('ai-owner-a')
  agencyA = await createAgency(ownerA, 'Id A', 'approved')
  ownerB = await createUser('ai-owner-b')
  agencyB = await createAgency(ownerB, 'Id B', 'approved', { gstin: GST_MH2, phone: '9822222222' })
  ownerPending = await createUser('ai-owner-pending')
  agencyPending = await createAgency(ownerPending, 'Id Pending', 'pending')
  ownerRejected = await createUser('ai-owner-rejected')
  await createAgency(ownerRejected, 'Id Rejected', 'rejected')
  ownerSuspended = await createUser('ai-owner-suspended')
  await createAgency(ownerSuspended, 'Id Suspended', 'suspended')
  ownerMulti = await createUser('ai-owner-multi')
  await createAgency(ownerMulti, 'Id Multi 1', 'approved')
  await createAgency(ownerMulti, 'Id Multi 2', 'approved')
  noAgency = await createUser('ai-no-agency')
  financeA = await seedStaff(agencyA, 'ai-finance', 'finance')
  dispatcherA = await seedStaff(agencyA, 'ai-dispatcher', 'dispatcher')
  viewerA = await seedStaff(agencyA, 'ai-viewer', 'viewer')
  revokedA = await seedStaff(agencyA, 'ai-revoked', 'finance', 'revoked')
}

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`Applied ${applied.length} migrations`)
  await setupFixtures()

  await gatedCase('I01. function exists, SECURITY DEFINER, search_path pinned', async () => {
    const r = await suOne(
      `SELECT p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'agency_identity_update'`
    )
    expect(r && r.prosecdef === true, 'not SECURITY DEFINER')
    expect((r.proconfig || []).some((c) => c.startsWith('search_path=')), 'search_path not pinned')
  })

  await gatedCase('I02. EXECUTE: authenticated yes, anon no', async () => {
    const r = await suOne(
      `SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'agency_identity_update'`
    )
    expect(r.auth === true && r.anon === false, `auth=${r.auth} anon=${r.anon}`)
  })

  await gatedCase('I03. anonymous role cannot call it', async () => {
    let denied = false
    try {
      await asAnon(`SELECT public.agency_identity_update('x','','9811111111','a','Delhi')`)
    } catch {
      denied = true
    }
    expect(denied, 'anon call was accepted')
  })

  await gatedCase('I04. no JWT subject -> sign_in_required', async () => {
    await actAs(null)
    try {
      const r = parseJson((await db.query(`SELECT public.agency_identity_update('x','','9811111111','a','Delhi') AS r`)).rows[0].r)
      expectError(r, 'sign_in_required')
    } finally {
      await actAsService()
    }
  })

  await gatedCase('I05. user without agency -> not_found', async () => {
    expectError(await callAs(noAgency, base()), 'not_found')
  })

  await gatedCase('I06. staff (finance) -> forbidden_scope, row untouched', async () => {
    const before = JSON.stringify(await row(agencyA))
    expectError(await callAs(financeA, base()), 'forbidden_scope')
    expect(JSON.stringify(await row(agencyA)) === before, 'row changed')
  })

  await gatedCase('I07. staff (dispatcher) and viewer -> forbidden_scope', async () => {
    expectError(await callAs(dispatcherA, base()), 'forbidden_scope')
    expectError(await callAs(viewerA, base()), 'forbidden_scope')
  })

  await gatedCase('I08. revoked staff -> not_found (no live relation)', async () => {
    expectError(await callAs(revokedA, base()), 'not_found')
  })

  await gatedCase('I09. rejected agency -> agency_not_approved', async () => {
    expectError(await callAs(ownerRejected, base()), 'agency_not_approved')
  })

  await gatedCase('I10. suspended agency -> agency_not_approved', async () => {
    expectError(await callAs(ownerSuspended, base()), 'agency_not_approved')
  })

  await gatedCase('I11. owner of two agencies -> multiple_agencies', async () => {
    expectError(await callAs(ownerMulti, base()), 'multiple_agencies')
  })

  await gatedCase('I12. invalid GSTIN shapes -> invalid_gstin', async () => {
    await gather(
      ['27ABCDE1234F1Z', '27ABCDE1234F1Z55', '27ABCDE1234F1Y5', '2XABCDE1234F1Z5', '27ABCDE1234F0Z5', ' not a gstin '].map((g) => [
        g,
        async () => expectError(await callAs(ownerA, base({ gstin: g })), 'invalid_gstin'),
      ])
    )
  })

  await gatedCase('I13. invalid phone shapes -> invalid_phone', async () => {
    await gather(
      ['', '12345', '98765-4321', 'abcdefghij', null].map((p) => [
        String(p),
        async () => expectError(await callAs(ownerA, base({ phone: p })), 'invalid_phone'),
      ])
    )
  })

  await gatedCase('I14. state must be a recognised name -> invalid_state', async () => {
    await gather(
      ['', 'Atlantis', null].map((s) => [
        String(s),
        async () => expectError(await callAs(ownerA, base({ state: s })), 'invalid_state'),
      ])
    )
  })

  await gatedCase('I15. GSTIN state digits must match the chosen state -> gstin_state_mismatch', async () => {
    expectError(await callAs(ownerA, base({ gstin: GST_DL, state: 'Maharashtra' })), 'gstin_state_mismatch')
  })

  await gatedCase('I16. blank or oversized legal name -> invalid_name', async () => {
    await gather(
      ['', '   ', null, 'x'.repeat(201)].map((n) => [
        String(n).slice(0, 8),
        async () => expectError(await callAs(ownerA, base({ name: n })), 'invalid_name'),
      ])
    )
  })

  await gatedCase('I17. refusals leave the agency row byte-identical', async () => {
    const before = JSON.stringify(await row(agencyA))
    await callAs(ownerA, base({ gstin: 'bad' }))
    await callAs(ownerA, base({ phone: '1' }))
    await callAs(ownerA, base({ state: 'Atlantis' }))
    await callAs(ownerA, base({ gstin: GST_DL, state: 'Maharashtra' }))
    expect(JSON.stringify(await row(agencyA)) === before, 'row changed after refusals')
  })

  await gatedCase('I18. successful save writes name, gstin, address, state', async () => {
    const r = await callAs(ownerA, base())
    expect(r.ok === true, JSON.stringify(r))
    const x = await row(agencyA)
    expect(x.company_name === 'Renamed Logistics Pvt Ltd', `name ${x.company_name}`)
    expect(x.gstin === GST_MH, `gstin ${x.gstin}`)
    expect(x.address === '12 New Road, Andheri', `address ${x.address}`)
    expect(x.state === 'Maharashtra', `state ${x.state}`)
  })

  await gatedCase('I19. phone stored as exactly the last 10 digits (same rule as the trial claim)', async () => {
    const x = await row(agencyA)
    expect(x.contact_phone === '9876543210', `phone ${x.contact_phone}`)
  })

  await gatedCase('I20. result is jsonb with ok, agency_id, updated_at and the saved identity', async () => {
    const r = await callAs(ownerA, base({ name: 'Result Shape Ltd' }))
    expect(r.ok === true && r.agency_id === agencyA, JSON.stringify(r))
    expect(typeof r.updated_at === 'string' && r.updated_at.length > 10, 'no updated_at')
    expect(r.gstin === GST_MH && r.phone === '9876543210' && r.state === 'Maharashtra', JSON.stringify(r))
  })

  await gatedCase('I21. lower-case padded GSTIN is normalised to upper-case trimmed', async () => {
    const r = await callAs(ownerA, base({ gstin: '  27abcde1234f1z5 ' }))
    expect(r.ok === true, JSON.stringify(r))
    expect((await row(agencyA)).gstin === GST_MH, 'not normalised')
  })

  await gatedCase('I22. blank GSTIN is accepted as unregistered and stored NULL', async () => {
    const r = await callAs(ownerB, base({ gstin: '', state: 'Gujarat' }))
    expect(r.ok === true, JSON.stringify(r))
    expect((await row(agencyB)).gstin === null, 'gstin not NULL')
    await callAs(ownerB, base({ gstin: GST_MH2 }))
  })

  await gatedCase('I23. state name variants are accepted (Delhi, Jammu & Kashmir)', async () => {
    const d = await callAs(ownerB, base({ gstin: '07ABCDE1234F1Z5', state: 'Delhi' }))
    expect(d.ok === true, JSON.stringify(d))
    const j = await callAs(ownerB, base({ gstin: '01ABCDE1234F1Z5', state: 'Jammu & Kashmir' }))
    expect(j.ok === true, JSON.stringify(j))
    await callAs(ownerB, base({ gstin: GST_MH2 }))
  })

  await gatedCase('I24. status, approval fields, user_id, rating, bank, PAN never change', async () => {
    const before = await row(agencyA)
    const r = await callAs(ownerA, base({ name: 'Locked Fields Ltd' }))
    expect(r.ok === true, JSON.stringify(r))
    const after = await row(agencyA)
    for (const k of ['status', 'approved_by', 'approved_at', 'rejection_reason', 'user_id', 'rating', 'bank_account', 'ifsc_code', 'pan_number', 'total_jobs', 'created_at', 'id']) {
      expect(String(before[k]) === String(after[k]), `${k} changed`)
    }
  })

  await gatedCase('I25. pending agency may update its identity and stays pending', async () => {
    const r = await callAs(ownerPending, base({ gstin: GST_DL, state: 'Delhi' }))
    expect(r.ok === true, JSON.stringify(r))
    const x = await row(agencyPending)
    expect(x.status === 'pending' && x.gstin === GST_DL, `${x.status} ${x.gstin}`)
  })

  await gatedCase('I26. one owner cannot write another agency row', async () => {
    const before = JSON.stringify(await row(agencyB))
    await callAs(ownerA, base({ name: 'Hijack B' }))
    expect(JSON.stringify(await row(agencyB)) === before, 'agency B changed')
  })

  await gatedCase('I27. optional city and pincode update only when supplied', async () => {
    const a = await callAs(ownerA, base({ city: 'Mumbai', pincode: '400058' }))
    expect(a.ok === true, JSON.stringify(a))
    let x = await row(agencyA)
    expect(x.city === 'Mumbai' && x.pincode === '400058', `${x.city} ${x.pincode}`)
    await callAs(ownerA, base())
    x = await row(agencyA)
    expect(x.city === 'Mumbai' && x.pincode === '400058', 'city/pincode wiped by a call that omitted them')
  })

  await gatedCase('I28. stale expected updated_at -> stale_version, row unchanged', async () => {
    const before = JSON.stringify(await row(agencyA))
    expectError(await callAs(ownerA, base({ name: 'Stale Write Ltd', expected: '2001-01-01T00:00:00Z' })), 'stale_version')
    expect(JSON.stringify(await row(agencyA)) === before, 'row changed')
  })

  await gatedCase('I29. matching expected updated_at succeeds and advances the version', async () => {
    const cur = await row(agencyA)
    const r = await callAs(ownerA, base({ name: 'Fresh Write Ltd', expected: new Date(cur.updated_at).toISOString() }))
    expect(r.ok === true, JSON.stringify(r))
    const nxt = await row(agencyA)
    expect(new Date(nxt.updated_at) > new Date(cur.updated_at), 'updated_at did not advance')
  })

  await gatedCase('I30. replaying the same version again is stale (no silent overwrite)', async () => {
    const cur = await row(agencyA)
    const stamp = new Date(cur.updated_at).toISOString()
    expect((await callAs(ownerA, base({ name: 'First Ltd', expected: stamp }))).ok === true, 'first failed')
    expectError(await callAs(ownerA, base({ name: 'Second Ltd', expected: stamp })), 'stale_version')
  })

  await gatedCase('I31. idempotent: the same payload twice returns ok both times', async () => {
    const a = await callAs(ownerA, base({ name: 'Same Ltd' }))
    const b = await callAs(ownerA, base({ name: 'Same Ltd' }))
    expect(a.ok === true && b.ok === true, `${JSON.stringify(a)} ${JSON.stringify(b)}`)
  })

  await gatedCase('I32. direct UPDATE of status by the owner stays impossible (existing guard)', async () => {
    await asActor(ownerPending, async () => {
      await db.query(`UPDATE public.transport_agencies SET status = 'approved' WHERE id = $1`, [agencyPending])
    })
    expect((await row(agencyPending)).status === 'pending', 'owner self-approved')
  })

  let trialOwner
  await gatedCase('I33. trial claim reads the saved identity (identity_required before, ok after)', async () => {
    trialOwner = await createUser('ai-trial-owner')
    await su(
      `INSERT INTO public.transport_agencies (id, user_id, company_name, status, pan_number) VALUES ($1,$2,'Trial Co','approved',$3)`,
      [uid(), trialOwner, `TRIAL${6000 + seq}Q`]
    )
    expectError(await trialAs(trialOwner), 'identity_required')
    const r = await callAs(trialOwner, base({ gstin: '29AAACT1234Q1Z8', state: 'Karnataka', phone: '9000011111' }))
    expect(r.ok === true, JSON.stringify(r))
    const after = await trialAs(trialOwner)
    expect(after.ok === true, JSON.stringify(after))
  })

  await gatedCase('I34. changing GSTIN/phone after a trial does not create a second trial', async () => {
    expect(trialOwner, 'I33 did not run')
    await callAs(trialOwner, base({ gstin: '29AAACT9999Q1Z8', state: 'Karnataka', phone: '9000022222' }))
    const again = await trialAs(trialOwner)
    expect(again.ok === false, 'a second trial was granted after identity change')
    const n = await suOne(
      `SELECT count(*)::int AS n FROM public.subscription_trial_claims c JOIN public.transport_agencies a ON a.id = c.agency_id WHERE a.user_id = $1`,
      [trialOwner]
    )
    expect(n.n === 1, `claims ${n.n}`)
  })

  await gatedCase('I35. the existing claim row keeps the identity it was made with', async () => {
    const c = await suOne(
      `SELECT c.gstin_norm, c.phone_norm FROM public.subscription_trial_claims c JOIN public.transport_agencies a ON a.id = c.agency_id WHERE a.user_id = $1`,
      [trialOwner]
    )
    expect(c && c.gstin_norm === '29AAACT1234Q1Z8' && c.phone_norm === '9000011111', JSON.stringify(c))
  })

  await gatedCase('I36. editing a GSTIN to one already claimed is allowed but still gets no trial', async () => {
    const other = await createUser('ai-collider')
    await su(
      `INSERT INTO public.transport_agencies (id, user_id, company_name, status, pan_number) VALUES ($1,$2,'Collider Co','approved',$3)`,
      [uid(), other, `COLLD${7000 + seq}Q`]
    )
    const r = await callAs(other, base({ gstin: '29AAACT1234Q1Z8', state: 'Karnataka', phone: '9333344444' }))
    expect(r.ok === true, 'the edit itself is allowed: ' + JSON.stringify(r))
    expectError(await trialAs(other), 'trial_already_claimed')
  })

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  for (const f of failed.slice(0, 20)) console.log(`  - ${f.name}: ${f.detail}`)
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
