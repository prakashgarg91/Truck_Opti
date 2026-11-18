#!/usr/bin/env node
/**
 * Invoice -> consignment link — red-first PGlite battery.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). Replays supabase/migrations including
 * 20261042000000_invoice_consignment_link.sql and drives agency_invoice_issue the way PostgREST does
 * (SET ROLE authenticated with request.jwt.claims).
 *
 * Pinned contract:
 *   agency_invoices.consignment_id uuid NULL, composite FK (consignment_id, agency_id) ->
 *     agency_consignments(id, agency_id). A PARTIAL UNIQUE index allows at most ONE non-cancelled invoice per
 *     consignment (cancelled invoices free it; NULL is unconstrained). consignment_id is frozen after issue by the
 *     existing immutability guard.
 *   agency_invoice_issue gains ONE optional LAST argument p_consignment_id uuid DEFAULT NULL; the 8-argument
 *     overload no longer exists (no ambiguity), so every existing 8-argument caller keeps working unchanged.
 *     - replay (same key, same request) is answered FIRST, before any consignment rule; the request hash includes
 *       the consignment only when one is given, so hashes of consignment-less requests are byte-identical to before.
 *     - the subscription guard call is unchanged and still runs right after scope resolution.
 *     - {ok:false,error:'consignment_not_found'} when the id is not a consignment of the caller's agency (a foreign id
 *       and a random id are indistinguishable).
 *     - {ok:false,error:'consignment_already_invoiced', invoice_id, invoice_number} when a non-cancelled invoice
 *       already bills it; nothing is written and no invoice number is consumed.
 *
 * Evidence class: local DB only (PGlite, single session).
 * Usage:  node scripts/invoice_consignment_link.db.test.mjs   (from the repo root)
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { BOOTSTRAP } from './_pgliteBootstrap.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(here, '..')
const PGLITE_BASE = join(REPO_ROOT, 'frontend', 'node_modules', '@electric-sql', 'pglite')
const MIGRATIONS_DIR = join(REPO_ROOT, 'supabase', 'migrations')
const MIGRATION_FILE = '20261042000000_invoice_consignment_link.sql'
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

/** Every case that touches the link is gated on the migration file being present. */
async function gatedCase(name, fn) {
  await testCase(name, async () => {
    if (!MIGRATION_PRESENT) {
      throw new Error(`red: migration ${MIGRATION_FILE} is missing, so the consignment link does not exist yet`)
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
const ISSUE8 = `SELECT public.agency_invoice_issue($1::uuid, $2::jsonb, $3::text, $4::text, $5::int, $6::boolean, $7::boolean, $8::text) AS r`
const ISSUE9 = `SELECT public.agency_invoice_issue($1::uuid, $2::jsonb, $3::text, $4::text, $5::int, $6::boolean, $7::boolean, $8::text, $9::uuid) AS r`
const PAY_SQL = `SELECT public.agency_invoice_record_payment($1::uuid, $2::bigint, $3::text, $4::text, $5::date, $6::int, $7::text) AS r`
const CANCEL_SQL = `SELECT public.agency_invoice_cancel($1::uuid, $2::int, $3::text) AS r`

let ownerA, agencyA, clientA, financeA, dispatcherA, viewerA
let ownerB, agencyB, clientB, grB
let ownerS, agencyS, clientS
let ownerN, agencyN, clientN, grN
const gr = {}

async function seedClient(agencyId, name) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES ($1, $2, $3, 'active', $4)`,
    [id, agencyId, name, nx('seed-client')]
  )
  return id
}

/** One order plus its consignment (one consignment per order), as superuser. */
async function seedGr(agencyId, clientId, status = 'delivered') {
  const orderId = uid()
  await su(
    `INSERT INTO public.agency_orders (id, agency_id, agreement_id, batch_id, client_order_ref, status, version)
     VALUES ($1, $2, $3, NULL, $4, 'planned', 1)`,
    [orderId, agencyId, clientId, nx('seed-ref')]
  )
  const id = uid()
  await su(
    `INSERT INTO public.agency_consignments (id, agency_id, order_id, gr_number, status, qr_token, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, agencyId, orderId, `AGY/TEST/${String(seq).padStart(6, '0')}`, status, nx('qr'), nx('gr-key')]
  )
  return id
}

async function setupFixtures() {
  ownerA = await createUser('il-owner-a')
  agencyA = await createAgencyRow(ownerA, 'Link A', 'approved')
  clientA = await seedClient(agencyA, 'Acme Freight')
  financeA = await seedStaff(agencyA, 'il-finance', 'finance')
  dispatcherA = await seedStaff(agencyA, 'il-dispatcher', 'dispatcher')
  viewerA = await seedStaff(agencyA, 'il-viewer', 'viewer')
  ownerB = await createUser('il-owner-b')
  agencyB = await createAgencyRow(ownerB, 'Link B', 'approved')
  clientB = await seedClient(agencyB, 'Beta Logistics')
  grB = await seedGr(agencyB, clientB)
  ownerS = await createUser('il-owner-s')
  agencyS = await createAgencyRow(ownerS, 'Link S', 'suspended')
  clientS = await seedClient(agencyS, 'Gamma Goods')
  ownerN = await createUser('il-owner-n')
  agencyN = await createAgencyRow(ownerN, 'Link N', 'approved')
  clientN = await seedClient(agencyN, 'No Sub Client')
  grN = await seedGr(agencyN, clientN)
  for (const k of ['first', 'cancel', 'paid', 'replay', 'other', 'rollback', 'scope', 'dml', 'seq', 'fk', 'frozen', 'direct', 'key', 'extra']) {
    gr[k] = await seedGr(agencyA, clientA)
  }
}

const LINES = [{ description: 'Freight haulage', quantity: 2, rate_paise: 100000 }]

async function issue(who, { consignment, key = nx('il-key'), lines = LINES, client = clientA, arity = 9 } = {}) {
  return asActor(who, async () => {
    const base = [client, JSON.stringify(lines), '27', '27', 18, false, false, key]
    const r = arity === 8 ? await db.query(ISSUE8, base) : await db.query(ISSUE9, [...base, consignment ?? null])
    return parseJson(r.rows[0].r)
  })
}

async function issueOk(who, opts) {
  const r = await issue(who, opts)
  expect(r && r.ok === true && typeof r.invoice_id === 'string', `issue not accepted: ${JSON.stringify(r)}`)
  return r
}

async function invOf(id) {
  return suOne(`SELECT * FROM public.agency_invoices WHERE id = $1`, [id])
}
const invCount = async (agencyId) => Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoices WHERE agency_id = $1`, [agencyId])).n)
const lastSeq = async (agencyId) => Number((await suOne(`SELECT coalesce(max(last_seq), 0)::int AS n FROM public.agency_invoice_sequences WHERE agency_id = $1`, [agencyId])).n)

async function raised(fn) {
  try {
    await fn()
    return null
  } catch (error) {
    return error
  }
}

const SIG9 = 'public.agency_invoice_issue(uuid,jsonb,text,text,integer,boolean,boolean,text,uuid)'

async function main() {
  await db.exec(BOOTSTRAP)
  const applied = await applyMigrations()
  console.log(`migrations applied: ${applied.length} (last=${applied[applied.length - 1]})`)
  console.log(`migration ${MIGRATION_FILE}: ${MIGRATION_PRESENT ? 'present' : 'MISSING'}`)
  await setupFixtures()

  await testCase(`L01. migration file ${MIGRATION_FILE} is present`, async () => {
    expect(MIGRATION_PRESENT, `migration ${MIGRATION_FILE} is missing (not written yet)`)
  })

  await gatedCase('L02. agency_invoices.consignment_id exists: uuid, nullable, no default', async () => {
    const row = await suOne(`SELECT data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'agency_invoices' AND column_name = 'consignment_id'`)
    expect(row && row.data_type === 'uuid' && row.is_nullable === 'YES' && row.column_default === null, JSON.stringify(row))
  })

  await gatedCase('L03. a composite FK (consignment_id, agency_id) references agency_consignments (id, agency_id)', async () => {
    const rows = (await su(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid = 'public.agency_invoices'::regclass AND contype = 'f'`)).rows
    const hit = rows.find((r) => /consignment_id/.test(r.d))
    expect(hit && /\(consignment_id, agency_id\)/.test(hit.d) && /agency_consignments\s*\(id, agency_id\)/.test(hit.d), JSON.stringify(rows.map((r) => r.d)))
  })

  await gatedCase('L04. a partial UNIQUE index covers consignment_id for non-cancelled invoices only', async () => {
    const rows = (await su(`SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'agency_invoices'`)).rows
    const hit = rows.find((r) => /UNIQUE/i.test(r.indexdef) && /consignment_id/.test(r.indexdef))
    expect(hit, 'no unique index on consignment_id')
    expect(/WHERE/i.test(hit.indexdef) && /cancelled/.test(hit.indexdef) && /consignment_id IS NOT NULL/i.test(hit.indexdef), hit.indexdef)
  })

  await gatedCase('L05. exactly one agency_invoice_issue overload remains, with p_consignment_id uuid DEFAULT NULL last', async () => {
    const rows = (await su(`SELECT pg_get_function_arguments(p.oid) AS a, pg_get_function_result(p.oid) AS res, p.prosecdef AS sd
                              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'agency_invoice_issue'`)).rows
    expect(rows.length === 1, `expected one overload, got ${rows.length}`)
    expect(/p_idempotency_key text, p_consignment_id uuid DEFAULT NULL::uuid$/.test(rows[0].a), rows[0].a)
    expect(rows[0].res === 'jsonb' && rows[0].sd === true, JSON.stringify(rows[0]))
  })

  await gatedCase('L06. search_path pinned to public, pg_temp; EXECUTE authenticated yes, anon and PUBLIC no', async () => {
    const row = await suOne(
      `SELECT array_to_string(p.proconfig, ',') AS cfg,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
              has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc,
              (SELECT count(*)::int FROM aclexplode(p.proacl) a WHERE a.grantee = 0) AS pub
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'agency_invoice_issue'`
    )
    expect(/search_path=public, pg_temp/.test(row.cfg || ''), `proconfig ${row.cfg}`)
    expect(row.auth === true && row.anon === false && row.svc === true && Number(row.pub) === 0, JSON.stringify(row))
  })

  await gatedCase('L07. anon cannot call the function', async () => {
    const e = await raised(() => asAnon(ISSUE9, [clientA, JSON.stringify(LINES), '27', '27', 18, false, false, nx('anon'), null]))
    expect(e, 'anon call was accepted')
  })

  await gatedCase('L08. the subscription guard call is still in the body, right after scope resolution and before the consignment rules', async () => {
    const def = (await suOne(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'agency_invoice_issue'`)).d
    const guard = def.indexOf(`PERFORM public.agency_subscription_assert(v_agency_id, 'settle', 0);`)
    const scope = def.indexOf(`resolve_caller_agency_for_scopes(ARRAY['finance']`)
    const lookup = def.indexOf('consignment_not_found')
    expect(guard > 0 && scope > 0 && guard > scope, `guard=${guard} scope=${scope}`)
    expect(lookup > guard, 'consignment rules run before the subscription guard')
  })

  await gatedCase('L09. an existing 8-argument call still works and stores consignment_id NULL', async () => {
    const r = await issueOk(ownerA, { arity: 8 })
    expect((await invOf(r.invoice_id)).consignment_id === null, 'consignment_id not null')
  })

  await gatedCase('L10. an explicit NULL ninth argument and a named p_consignment_id => NULL both work', async () => {
    const r1 = await issueOk(ownerA, { consignment: null })
    expect((await invOf(r1.invoice_id)).consignment_id === null, 'not null')
    const r2 = await asActor(ownerA, async () => parseJson((await db.query(
      `SELECT public.agency_invoice_issue(p_client_id => $1, p_lines => $2::jsonb, p_supplier_state => '27', p_place_of_supply_state => '27',
         p_gst_rate_pct => 18, p_reverse_charge => false, p_round_off => false, p_idempotency_key => $3, p_consignment_id => $4) AS r`,
      [clientA, JSON.stringify(LINES), nx('named'), gr.extra])).rows[0].r))
    expect(r2.ok === true && (await invOf(r2.invoice_id)).consignment_id === gr.extra, JSON.stringify(r2))
  })

  await gatedCase('L11. issuing with a consignment stores consignment_id and the same totals as without', async () => {
    const withGr = await issueOk(ownerA, { consignment: gr.first })
    const plain = await issueOk(ownerA, {})
    const a = await invOf(withGr.invoice_id)
    const b = await invOf(plain.invoice_id)
    expect(a.consignment_id === gr.first, 'consignment_id not stored')
    expect(a.total_paise === b.total_paise && a.subtotal_paise === b.subtotal_paise && a.cgst_paise === b.cgst_paise, 'totals differ')
  })

  await gatedCase('L12. a second invoice for the same consignment is refused with consignment_already_invoiced and the first invoice id', async () => {
    const first = (await suOne(`SELECT id, invoice_number FROM public.agency_invoices WHERE consignment_id = $1`, [gr.first]))
    const r = await issue(ownerA, { consignment: gr.first })
    expectError(r, 'consignment_already_invoiced')
    expect(r.invoice_id === first.id && r.invoice_number === first.invoice_number, JSON.stringify(r))
  })

  await gatedCase('L13. the refusal reply has exactly {ok,error,invoice_id,invoice_number}', async () => {
    const r = await issue(ownerA, { consignment: gr.first })
    expect(JSON.stringify(Object.keys(r).sort()) === JSON.stringify(['error', 'invoice_id', 'invoice_number', 'ok']), Object.keys(r).join(','))
  })

  await gatedCase('L14. a refused issue writes nothing and consumes no invoice number', async () => {
    const n0 = await invCount(agencyA)
    const s0 = await lastSeq(agencyA)
    for (let i = 0; i < 3; i++) expectError(await issue(ownerA, { consignment: gr.first }), 'consignment_already_invoiced')
    expect((await invCount(agencyA)) === n0 && (await lastSeq(agencyA)) === s0, 'rows or sequence changed')
  })

  await gatedCase('L15. a cancelled invoice frees the consignment; the new invoice is accepted', async () => {
    const a = await issueOk(ownerA, { consignment: gr.cancel })
    expectError(await issue(ownerA, { consignment: gr.cancel }), 'consignment_already_invoiced')
    const c = await asActor(ownerA, async () => parseJson((await db.query(CANCEL_SQL, [a.invoice_id, 1, 'issued by mistake'])).rows[0].r))
    expect(c.ok === true, JSON.stringify(c))
    const b = await issueOk(ownerA, { consignment: gr.cancel })
    expect(b.invoice_id !== a.invoice_id && (await invOf(b.invoice_id)).consignment_id === gr.cancel, 'not re-invoiced')
  })

  await gatedCase('L16. after re-issue the refusal names the NEW invoice, never the cancelled one', async () => {
    const live = await suOne(`SELECT id FROM public.agency_invoices WHERE consignment_id = $1 AND status <> 'cancelled'`, [gr.cancel])
    const r = await issue(ownerA, { consignment: gr.cancel })
    expectError(r, 'consignment_already_invoiced')
    expect(r.invoice_id === live.id, 'named a cancelled invoice')
  })

  await gatedCase('L17. the cancelled invoice keeps its consignment link as history (still one row linked and cancelled)', async () => {
    const rows = (await su(`SELECT status FROM public.agency_invoices WHERE consignment_id = $1 ORDER BY created_at`, [gr.cancel])).rows
    expect(rows.length === 2 && rows[0].status === 'cancelled' && rows[1].status !== 'cancelled', JSON.stringify(rows))
  })

  await gatedCase('L18. a partly paid and a fully paid invoice still hold the consignment', async () => {
    const a = await issueOk(ownerA, { consignment: gr.paid })
    const p = await asActor(ownerA, async () => parseJson((await db.query(PAY_SQL, [a.invoice_id, 1000, 'upi', 'UTR-1', new Date(Date.now() - 86400000).toISOString().slice(0, 10), 1, nx('pay')])).rows[0].r))
    expect(p.ok === true && p.status === 'partly_paid', JSON.stringify(p))
    expectError(await issue(ownerA, { consignment: gr.paid }), 'consignment_already_invoiced')
    const inv = await invOf(a.invoice_id)
    const rest = Number(inv.total_paise) - 1000
    const p2 = await asActor(ownerA, async () => parseJson((await db.query(PAY_SQL, [a.invoice_id, rest, 'bank', 'UTR-2', new Date(Date.now() - 86400000).toISOString().slice(0, 10), 2, nx('pay')])).rows[0].r))
    expect(p2.ok === true && p2.status === 'paid', JSON.stringify(p2))
    expectError(await issue(ownerA, { consignment: gr.paid }), 'consignment_already_invoiced')
  })

  await gatedCase('L19. a consignment of another agency gives consignment_not_found and writes nothing', async () => {
    const n0 = await invCount(agencyA)
    const s0 = await lastSeq(agencyA)
    expectError(await issue(ownerA, { consignment: grB }), 'consignment_not_found')
    expect((await invCount(agencyA)) === n0 && (await lastSeq(agencyA)) === s0, 'rows or sequence changed')
    expect((await invCount(agencyB)) === 0, 'agency B was touched')
  })

  await gatedCase('L20. a random uuid gives the same consignment_not_found reply as a foreign id (no oracle)', async () => {
    const a = await issue(ownerA, { consignment: grB })
    const b = await issue(ownerA, { consignment: '00000000-0000-4000-8000-0000000fffff' })
    expectError(b, 'consignment_not_found')
    expect(JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} vs ${JSON.stringify(b)}`)
  })

  await gatedCase('L21. consignment_not_found writes no foreign rows: agency B consignment stays unlinked', async () => {
    const n = Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoices WHERE consignment_id = $1`, [grB])).n)
    expect(n === 0, `agency B consignment linked ${n} time(s)`)
  })

  await gatedCase('L22. replay: same key and same request returns the same invoice with replay:true and adds no row', async () => {
    const key = nx('replay')
    const a = await issueOk(ownerA, { consignment: gr.replay, key })
    const n0 = await invCount(agencyA)
    const r = await issue(ownerA, { consignment: gr.replay, key })
    expect(r.ok === true && r.replay === true && r.invoice_id === a.invoice_id && r.invoice_number === a.invoice_number, JSON.stringify(r))
    expect((await invCount(agencyA)) === n0, 'replay added a row')
  })

  await gatedCase('L23. replay is answered before the already-invoiced rule (same key still replays once the GR is billed)', async () => {
    const key = nx('replay2')
    const a = await issueOk(ownerA, { consignment: gr.other, key })
    expectError(await issue(ownerA, { consignment: gr.other }), 'consignment_already_invoiced')
    const r = await issue(ownerA, { consignment: gr.other, key })
    expect(r.ok === true && r.replay === true && r.invoice_id === a.invoice_id, JSON.stringify(r))
  })

  await gatedCase('L24. the same key with a different consignment is idempotency_key_reused', async () => {
    const key = nx('reuse')
    await issueOk(ownerA, { consignment: gr.rollback, key })
    expectError(await issue(ownerA, { consignment: gr.scope, key }), 'idempotency_key_reused')
  })

  await gatedCase('L25. the same key once with and once without a consignment is idempotency_key_reused (both directions)', async () => {
    const k1 = nx('mix1')
    await issueOk(ownerA, { key: k1 })
    expectError(await issue(ownerA, { key: k1, consignment: gr.dml }), 'idempotency_key_reused')
    const k2 = nx('mix2')
    await issueOk(ownerA, { key: k2, consignment: gr.dml })
    expectError(await issue(ownerA, { key: k2 }), 'idempotency_key_reused')
  })

  await gatedCase('L26. request hash of a consignment-less request is byte-identical to the pre-change formula', async () => {
    const key = nx('hash')
    const r = await issueOk(ownerA, { key })
    const row = await suOne(
      `SELECT request_hash = md5(jsonb_build_object('client', $1::uuid, 'lines', $2::jsonb, 'supplier', '27'::text, 'place', '27'::text,
                                                   'rate', 18, 'rc', false, 'ro', false)::text) AS same
         FROM public.agency_invoices WHERE id = $3`,
      [clientA, JSON.stringify(LINES), r.invoice_id]
    )
    expect(row.same === true, 'hash formula changed for consignment-less requests')
  })

  await gatedCase('L27. an 8-argument replay of an old-style request still replays', async () => {
    const key = nx('old-replay')
    const a = await issueOk(ownerA, { key, arity: 8 })
    const r = await issue(ownerA, { key, arity: 8 })
    expect(r.ok === true && r.replay === true && r.invoice_id === a.invoice_id, JSON.stringify(r))
  })

  await gatedCase('L28. finance staff may issue with a consignment; dispatcher and viewer are refused and nothing is written', async () => {
    const n0 = await invCount(agencyA)
    const ok = await issue(financeA, { consignment: gr.seq })
    expect(ok.ok === true, JSON.stringify(ok))
    for (const who of [dispatcherA, viewerA]) {
      let refused = false
      try {
        const r = await issue(who, { consignment: gr.key })
        refused = r && r.ok === false
      } catch {
        refused = true
      }
      expect(refused, 'a non-finance caller was accepted')
    }
    expect((await invCount(agencyA)) === n0 + 1, 'unexpected row count')
  })

  await gatedCase('L29. a suspended agency is refused (approval is still required)', async () => {
    const grS = await seedGr(agencyS, clientS)
    const e = await raised(() => issue(ownerS, { consignment: grS, client: clientS }))
    expect(e && /Agency approval is required/.test(e.message), `got ${e && e.message}`)
    expect((await invCount(agencyS)) === 0, 'rows written')
  })

  await gatedCase('L30. subscription enforcement still guards the command first: SB002 without a subscription, even for a bogus consignment', async () => {
    await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = true`)
    try {
      const e = await raised(() => issue(ownerN, { consignment: '00000000-0000-4000-8000-0000000eeeee', client: clientN }))
      expect(e && /SB00[1-4]/.test(e.message + (e.code || '')), `guard did not fire first: ${e && e.message}`)
      expect((await invCount(agencyN)) === 0, 'rows written')
    } finally {
      await su(`UPDATE public.platform_billing_settings SET enforcement_enabled = false`)
    }
    const r = await issue(ownerN, { consignment: grN, client: clientN })
    expect(r.ok === true, 'not accepted with enforcement off: ' + JSON.stringify(r))
  })

  await gatedCase('L31. many invoices without a consignment are unaffected by the unique index (NULLs do not collide)', async () => {
    for (let i = 0; i < 3; i++) await issueOk(ownerA, {})
  })

  await gatedCase('L32. database backstop: a direct second non-cancelled invoice for one consignment is a unique violation', async () => {
    const first = await issueOk(ownerA, { consignment: gr.fk })
    const src = await invOf(first.invoice_id)
    const e = await raised(() => su(
      `INSERT INTO public.agency_invoices (id, agency_id, client_id, invoice_number, status, supplier_state_code, place_of_supply_state_code, gst_rate_pct,
         reverse_charge, subtotal_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise, paid_paise, version, idempotency_key, consignment_id)
       VALUES ($1, $2, $3, 'INV/X/900001', 'issued', '27', '27', 18, false, 100, 9, 9, 0, 0, 118, 0, 1, $4, $5)`,
      [uid(), agencyA, src.client_id, nx('direct'), gr.fk]
    ))
    expect(e && (e.code === '23505' || /unique|duplicate/i.test(e.message)), `got ${e && e.message}`)
  })

  await gatedCase('L33. database: a cancelled row for an already billed consignment is allowed (history)', async () => {
    const e = await raised(() => su(
      `INSERT INTO public.agency_invoices (id, agency_id, client_id, invoice_number, status, supplier_state_code, place_of_supply_state_code, gst_rate_pct,
         reverse_charge, subtotal_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise, paid_paise, version, idempotency_key, consignment_id,
         cancelled_reason, cancelled_at)
       VALUES ($1, $2, $3, 'INV/X/900002', 'cancelled', '27', '27', 18, false, 100, 9, 9, 0, 0, 118, 0, 1, $4, $5, 'seed', now())`,
      [uid(), agencyA, clientA, nx('direct'), gr.fk]
    ))
    expect(e === null, `cancelled history row rejected: ${e && e.message}`)
  })

  await gatedCase('L34. database: the composite FK rejects a consignment of another agency', async () => {
    const e = await raised(() => su(
      `INSERT INTO public.agency_invoices (id, agency_id, client_id, invoice_number, status, supplier_state_code, place_of_supply_state_code, gst_rate_pct,
         reverse_charge, subtotal_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise, total_paise, paid_paise, version, idempotency_key, consignment_id)
       VALUES ($1, $2, $3, 'INV/X/900003', 'issued', '27', '27', 18, false, 100, 9, 9, 0, 0, 118, 0, 1, $4, $5)`,
      [uid(), agencyA, clientA, nx('direct'), grB]
    ))
    expect(e && (e.code === '23503' || /foreign key/i.test(e.message)), `got ${e && e.message}`)
  })

  await gatedCase('L35. consignment_id is frozen after issue: changing it, clearing it or setting it on an unlinked invoice is refused', async () => {
    const linked = await issueOk(ownerA, { consignment: gr.frozen })
    const plain = await issueOk(ownerA, {})
    await gather([
      ['change', async () => expect(await raised(() => su(`UPDATE public.agency_invoices SET consignment_id = $1 WHERE id = $2`, [gr.direct, linked.invoice_id])), 'change accepted')],
      ['clear', async () => expect(await raised(() => su(`UPDATE public.agency_invoices SET consignment_id = NULL WHERE id = $1`, [linked.invoice_id])), 'clear accepted')],
      ['set', async () => expect(await raised(() => su(`UPDATE public.agency_invoices SET consignment_id = $1 WHERE id = $2`, [gr.direct, plain.invoice_id])), 'set accepted')],
    ])
    expect((await invOf(linked.invoice_id)).consignment_id === gr.frozen, 'link changed')
  })

  await gatedCase('L36. an update that leaves consignment_id alone (status, paid) is still allowed by the guard', async () => {
    const r = await issueOk(ownerA, { consignment: gr.direct })
    const c = await asActor(ownerA, async () => parseJson((await db.query(CANCEL_SQL, [r.invoice_id, 1, 'cancel for guard test'])).rows[0].r))
    expect(c.ok === true, JSON.stringify(c))
    expect((await invOf(r.invoice_id)).consignment_id === gr.direct, 'link lost on cancel')
  })

  await gatedCase('L37. other frozen fields stay frozen (total and client)', async () => {
    const r = await issueOk(ownerA, {})
    expect(await raised(() => su(`UPDATE public.agency_invoices SET total_paise = total_paise + 1 WHERE id = $1`, [r.invoice_id])), 'total changed')
    expect(await raised(() => su(`UPDATE public.agency_invoices SET client_id = $1 WHERE id = $2`, [clientB, r.invoice_id])), 'client changed')
  })

  await gatedCase('L38. a billed consignment cannot be deleted (FK restricts)', async () => {
    const e = await raised(() => su(`DELETE FROM public.agency_consignments WHERE id = $1`, [gr.first]))
    expect(e, 'billed consignment was deleted')
  })

  await gatedCase('L39. authenticated can read consignment_id on own invoices; another agency sees none', async () => {
    const own = await asActor(ownerA, async () => (await db.query(`SELECT consignment_id FROM public.agency_invoices WHERE consignment_id = $1`, [gr.first])).rows)
    expect(own.length === 1, `own rows ${own.length}`)
    const foreign = await asActor(ownerB, async () => (await db.query(`SELECT consignment_id FROM public.agency_invoices WHERE consignment_id = $1`, [gr.first])).rows)
    expect(foreign.length === 0, `foreign rows ${foreign.length}`)
  })

  await gatedCase('L40. a client cannot write consignment_id directly (no INSERT/UPDATE grant)', async () => {
    const r = await issueOk(ownerA, {})
    const e1 = await raised(() => asActor(ownerA, () => db.query(`UPDATE public.agency_invoices SET consignment_id = $1 WHERE id = $2`, [gr.direct, r.invoice_id])))
    expect(e1, 'direct UPDATE accepted')
  })

  await gatedCase('L41. of several attempts on one consignment exactly one invoice results', async () => {
    const fresh = await seedGr(agencyA, clientA)
    const results = []
    for (let i = 0; i < 5; i++) results.push(await issue(ownerA, { consignment: fresh }))
    expect(results.filter((r) => r.ok === true).length === 1, JSON.stringify(results.map((r) => r.ok ? 'ok' : r.error)))
    expect(Number((await suOne(`SELECT count(*)::int AS n FROM public.agency_invoices WHERE consignment_id = $1`, [fresh])).n) === 1, 'more than one row')
  })

  await gatedCase('L42. lines, totals and invoice number format are unchanged by the link', async () => {
    const fresh = await seedGr(agencyA, clientA)
    const r = await issueOk(ownerA, { consignment: fresh })
    expect(/^INV\/\d{4}-\d{2}\/\d{6}$/.test(r.invoice_number), r.invoice_number)
    const lines = (await su(`SELECT description, amount_paise FROM public.agency_invoice_lines WHERE invoice_id = $1`, [r.invoice_id])).rows
    expect(lines.length === 1 && lines[0].description === 'Freight haulage' && Number(lines[0].amount_paise) === 200000, JSON.stringify(lines))
    expect(Number((await invOf(r.invoice_id)).total_paise) === 236000, 'total differs')
  })

  await gatedCase('L43. re-applying the migration keeps one overload, the grants and the behaviour', async () => {
    await db.exec(readFileSync(join(MIGRATIONS_DIR, MIGRATION_FILE), 'utf8'))
    const n = Number((await suOne(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace WHERE ns.nspname = 'public' AND p.proname = 'agency_invoice_issue'`)).n)
    expect(n === 1, `overloads after re-apply: ${n}`)
    const g = await suOne(`SELECT has_function_privilege('anon', '${SIG9}', 'EXECUTE') AS anon, has_function_privilege('authenticated', '${SIG9}', 'EXECUTE') AS auth`)
    expect(g.anon === false && g.auth === true, JSON.stringify(g))
    const fresh = await seedGr(agencyA, clientA)
    expect((await issue(ownerA, { consignment: fresh })).ok === true, 'issue broke after re-apply')
  })

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  for (const f of failed.slice(0, 12)) console.log(`  - ${f.name}${f.detail ? ' :: ' + f.detail : ''}`)
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
