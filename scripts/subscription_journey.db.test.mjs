#!/usr/bin/env node
/**
 * Subscription USER JOURNEY battery (TO-152) on PGlite, through the REAL functions and roles.
 *
 * LEVEL: SQL-level proof on a REAL PostgreSQL engine (PGlite WASM). The whole supabase/migrations chain is
 * replayed, then one agency lives through a complete life: onboarding, trial, usage inside the Starter limits,
 * first purchase, a wrong-money attempt, an early renewal, expiry (grace, expired, renewal), a refund with a
 * support reopen, the payroll / freight invoice / expense modules, and finally a security walk.
 * Every command runs as the role the platform uses: owner and staff as `authenticated` (request.jwt.claims sub),
 * the billing functions as `service_role`, time travel through run_subscription_sweeps(as_of).
 * Nothing is mocked. Fixture rows (users, agency, drivers, jobs, clients, sites) are written as superuser.
 *
 * Groups: J1 new owner, J2 using the product during the trial, J3 first purchase, J4 wrong money, J5 renewal,
 * J6 expiry, J7 refund and reopen, J8 payroll and money modules, J9 security walk.
 * A journey case that exposes a real defect keeps failing and is named 'BUG: ...' in its title.
 *
 * Not testable in PGlite: concurrent callers (advisory-lock races), pg_cron scheduling, real wall-clock expiry
 * (time travel is only the as_of argument of the sweep; stored periods stay in the real future), Razorpay HMAC
 * signature verification (done in the Edge function; pgcrypto is not part of PGlite), hosted PostgREST/GoTrue.
 *
 * Usage:  node scripts/subscription_journey.db.test.mjs   (from the repo root)
 * Exit 0 = every case passed; any failure exits 1.
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

// ---------------------------------------------------------------------------
// Case runner
// ---------------------------------------------------------------------------
const results = []
const groupCounter = {}

function record(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function expect(cond, message) {
  if (!cond) throw new Error(message)
}

function firstLine(error) {
  const raw = error && error.message ? error.message : String(error)
  return raw.split('\n')[0].split(' [SQL:')[0].trim()
}

/** One numbered journey case. A failing assertion records FAIL and the battery keeps going. */
async function jc(group, title, fn) {
  groupCounter[group] = (groupCounter[group] ?? 0) + 1
  const name = `${group}.${String(groupCounter[group]).padStart(2, '0')} ${title}`
  try {
    await fn()
    record(name, true)
  } catch (error) {
    const message = error && error.message ? error.message.split('\n')[0].slice(0, 260) : String(error)
    record(name, false, message)
  }
}

/** Fixture steps are not cases; a failure here is a harness error that names itself. */
async function step(label, fn) {
  try {
    return await fn()
  } catch (error) {
    console.log(`FIXTURE-ERROR  ${label} — ${firstLine(error).slice(0, 240)}`)
    return null
  }
}

// ---------------------------------------------------------------------------
// Roles (what PostgREST does per request)
// ---------------------------------------------------------------------------
let seq = 0
const uid = () => `00000000-0000-4000-b000-${String(++seq).padStart(12, '0')}`
let nonce = 0
const nx = (prefix) => `${prefix}-${++nonce}`

async function actAsService() {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, ['{}'])
}

async function actAs(sub) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [
    sub ? JSON.stringify({ sub, role: 'authenticated' }) : '{}',
  ])
  await db.exec('SET ROLE authenticated')
}

async function asActor(userId, fn) {
  await actAs(userId)
  try {
    return await fn()
  } finally {
    await actAsService()
  }
}

/** Runs the statement as an arbitrary database role (anon, service_role, authenticated), claims reset to {}. */
async function asRole(role, sql, params = []) {
  await db.exec('RESET ROLE')
  await db.query(`SELECT set_config('request.jwt.claims', '{}', false)`)
  await db.exec(`SET ROLE ${role}`)
  try {
    return await db.query(sql, params)
  } finally {
    await actAsService()
  }
}

async function su(sql, params = []) {
  await actAsService()
  return db.query(sql, params)
}

async function suOne(sql, params = []) {
  return (await su(sql, params)).rows[0]
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value
}

function parseDetail(detail) {
  if (!detail) return null
  if (typeof detail === 'object') return detail
  try {
    return JSON.parse(detail)
  } catch {
    return null
  }
}

/** Runs one statement as `userId`. Returns {raised, code, message, detail} or {raised:false, value, rows}. */
async function call(userId, sql, params = []) {
  return asActor(userId, async () => {
    try {
      const res = await db.query(sql, params)
      const cell = res.rows.length ? Object.values(res.rows[0])[0] : null
      return { raised: false, value: parseJson(cell), rows: res.rows }
    } catch (error) {
      return { raised: true, code: error.code || null, message: firstLine(error), detail: parseDetail(error.detail) }
    }
  })
}

/** Same for service_role. */
async function svcCall(sql, params = []) {
  try {
    const res = await asRole('service_role', sql, params)
    const cell = res.rows.length ? Object.values(res.rows[0])[0] : null
    return { raised: false, value: parseJson(cell), rows: res.rows }
  } catch (error) {
    return { raised: true, code: error.code || null, message: firstLine(error), detail: parseDetail(error.detail) }
  }
}

async function roleCall(role, sql, params = []) {
  try {
    const res = await asRole(role, sql, params)
    const cell = res.rows.length ? Object.values(res.rows[0])[0] : null
    return { raised: false, value: parseJson(cell), rows: res.rows }
  } catch (error) {
    return { raised: true, code: error.code || null, message: firstLine(error), detail: parseDetail(error.detail) }
  }
}

const describe = (r) => (r.raised ? `raised ${r.code} ${r.message}` : JSON.stringify(r.value).slice(0, 200))

function expectOk(r, label = 'call') {
  expect(!r.raised, `${label}: raised ${r.code} ${r.message}`)
  expect(r.value && r.value.ok === true, `${label}: expected ok:true, got ${describe(r)}`)
  return r.value
}

/** A refusal: raised (message/code contains one of the codes) or returned {ok:false,error}. */
function expectRefusal(r, codes, label = 'call') {
  const list = Array.isArray(codes) ? codes : [codes]
  let code
  if (r.raised) code = `${r.code ?? ''} ${r.message}`
  else {
    expect(r.value && r.value.ok === false, `${label}: accepted (${describe(r)}), expected refusal ${list.join('|')}`)
    code = String(r.value.error ?? '')
  }
  expect(list.some((c) => code.includes(c)), `${label}: refused with "${code.slice(0, 160)}", expected ${list.join('|')}`)
}

function expectSB(r, sb, label = 'call') {
  expect(r.raised && r.code === sb && r.message.startsWith(sb), `${label}: expected ${sb}, got ${describe(r)}`)
}

const big = (x) => BigInt(String(x ?? 0))

// ---------------------------------------------------------------------------
// Money oracle (integer paise, independent of the SQL under test)
// ---------------------------------------------------------------------------
const halfUp = (num, den) => (num + den / 2n) / den
function sameStateSplit(taxable) {
  const c = halfUp(18n * taxable, 200n)
  return { cgst: c, sgst: c, total: taxable + 2n * c }
}
const STARTER_MONTHLY = 49900n
const STARTER_QUOTE = sameStateSplit(STARTER_MONTHLY)

function fyOfInstant(iso) {
  const ist = new Date(new Date(iso).getTime() + 330 * 60 * 1000)
  const y = ist.getUTCFullYear()
  const start = ist.getUTCMonth() + 1 >= 4 ? y : y - 1
  return `${String(start % 100).padStart(2, '0')}-${String((start + 1) % 100).padStart(2, '0')}`
}
const fyNow = () => fyOfInstant(new Date().toISOString())

const SUPPLIER_GSTIN = '27ABCDE1234F1Z5'
const SUPPLIER_NAME = 'TruckOpti Logistics Pvt Ltd'

// ---------------------------------------------------------------------------
// Fixture builders (superuser)
// ---------------------------------------------------------------------------
let gstinCounter = 0
const gstinFor = (state) => `${state}ABCDE${String(1000 + ++gstinCounter)}F1Z5`

async function createUser(tag) {
  const id = uid()
  const email = `${tag}-${seq}@example.com`
  await su(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, '{}'::jsonb)`, [id, email])
  await su(`INSERT INTO public.users (id, email) VALUES ($1, $2)`, [id, email])
  return { id, email }
}

async function createAgency(tag, o = {}) {
  const owner = await createUser(`${tag}-owner`)
  const id = uid()
  const has = (k) => Object.prototype.hasOwnProperty.call(o, k)
  const gstin = has('gstin') ? o.gstin : gstinFor('27')
  const phone = has('phone') ? o.phone : `98${String(10000000 + seq).slice(-8)}`
  await su(
    `INSERT INTO public.transport_agencies (id, user_id, company_name, city, status, gstin, pan_number, state, contact_phone)
     VALUES ($1, $2, $3, 'Mumbai', $4, $5, $6, $7, $8)`,
    [id, owner.id, `${tag} Transport Pvt Ltd`, o.status ?? 'approved', gstin, `ABCDE${String(1000 + (seq % 9000))}Q`,
      has('state') ? o.state : 'Maharashtra', phone]
  )
  return { id, owner: owner.id, ownerEmail: owner.email, gstin, phone }
}

async function seedMembership(agencyId, userId, scope, status = 'active') {
  await su(
    `INSERT INTO public.agency_memberships (id, agency_id, user_id, scope, status, revoked_at)
     VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
    [uid(), agencyId, userId, scope, status, status === 'revoked' ? new Date().toISOString() : null]
  )
}

async function createDriver(tag, userId = null) {
  const id = uid()
  await su(
    `INSERT INTO public.drivers (id, user_id, full_name, phone, vehicle_type, status, pan_number)
     VALUES ($1, $2, $3, $4, 'tata_407', 'approved', $5)`,
    [id, userId, `${tag} Driver`, `9${String(100000000 + seq).slice(-9)}`, `JRNYD${String(1000 + (seq % 9000))}Q`]
  )
  return id
}

async function seedAgreement(agencyId, clientName) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_agreements (id, agency_id, client_name, status, idempotency_key)
     VALUES ($1, $2, $3, 'active', $4)`,
    [id, agencyId, clientName, nx('jr-agr')]
  )
  return id
}

async function seedSite(agencyId, agreementId, kind, label) {
  const id = uid()
  await su(
    `INSERT INTO public.agency_client_sites
       (id, agency_id, agreement_id, site_kind, label, address_line, city, state, pincode, status, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, '1 Test Road', 'Pune', 'Maharashtra', '411001', 'active', $6)`,
    [id, agencyId, agreementId, kind, label, nx('jr-site')]
  )
  return id
}

async function seedJob(agencyId, { distanceKm = 120, weightKg = 2600 } = {}) {
  const shipment = uid()
  await su(
    `INSERT INTO public.shipments (id, shipment_id, origin, destination, total_weight) VALUES ($1, $2, 'Pune', 'Mumbai', $3)`,
    [shipment, nx('JRNY-SHP'), weightKg]
  )
  const id = uid()
  await su(
    `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status, distance_km, weight_kg)
     VALUES ($1, $2, $3, 15000, 'pending', $4, $5)`,
    [id, agencyId, shipment, distanceKm, weightKg]
  )
  return id
}

// ---------------------------------------------------------------------------
// Command wrappers
// ---------------------------------------------------------------------------
const ENTITLEMENT = 'SELECT public.agency_subscription_entitlement() AS r'
const entitlement = (userId) => call(userId, ENTITLEMENT)
const ent = async (userId) => expectOk(await entitlement(userId), 'entitlement')

const vehicleCreate = (userId, rc, payloadKg = 5000) =>
  call(
    userId,
    `SELECT public.agency_vehicle_create(p_rc_number => $1::text, p_vehicle_type => 'eicher_14ft', p_payload_kg => $2::numeric) AS r`,
    [rc, payloadKg]
  )
const invite = (userId, email, scope, key) =>
  call(userId, `SELECT public.agency_member_invite($1::text, $2::text, 7, $3::text) AS r`, [email, scope, key])
const accept = (userId, token) => call(userId, `SELECT public.agency_member_accept($1::text) AS r`, [token])
const employ = (userId, driverId) => call(userId, `SELECT public.agency_driver_employment_create($1::uuid) AS r`, [driverId])
const importOrders = (userId, agreementId, hash, key, lines) =>
  call(userId, `SELECT public.agency_order_import($1::uuid, $2::text, $3::text, $4::jsonb) AS r`, [agreementId, hash, key, JSON.stringify(lines)])
const planSave = (userId, name, loads, key) =>
  call(userId, `SELECT public.agency_load_plan_save($1::text, NULL::uuid, $2::jsonb, '[]'::jsonb, $3::text) AS r`, [name, JSON.stringify(loads), key])
const planApprove = (userId, planId, v = 1) => call(userId, `SELECT public.agency_load_plan_approve($1::uuid, $2::int) AS r`, [planId, v])
const assignDriver = (userId, jobId, driverId) => call(userId, `SELECT public.agency_job_assign_driver($1::uuid, $2::uuid) AS r`, [jobId, driverId])
const setStatus = (userId, jobId, status) => call(userId, `SELECT public.agency_job_set_status($1::uuid, $2::text) AS r`, [jobId, status])

const quote = (agencyId, tier = 'starter', cycle = 'monthly', coupon = null) =>
  svcCall(`SELECT public.subscription_quote_order($1::uuid, $2::text, $3::text, $4::text) AS r`, [agencyId, tier, cycle, coupon])
const createOrder = (agencyId, orderId, tier = 'starter', cycle = 'monthly', coupon = null) =>
  svcCall(`SELECT public.subscription_create_order($1::uuid, $2::text, $3::text, $4::text, $5::text) AS r`, [agencyId, tier, cycle, coupon, orderId])
const activate = (orderId, paymentId, amount, { currency = 'INR', method = 'upi', source = 'verify' } = {}) =>
  svcCall(`SELECT public.subscription_activate_payment($1::text, $2::text, $3::bigint, $4::text, $5::text, $6::text) AS r`,
    [orderId, paymentId, String(amount), currency, method, source])
const sweep = (asOf) => svcCall(`SELECT public.run_subscription_sweeps($1::timestamptz) AS r`, [asOf])
const refundRpc = (paymentId, refundId, amount) =>
  svcCall(`SELECT public.subscription_record_refund($1::text, $2::text, $3::bigint) AS r`, [paymentId, refundId, String(amount)])
const reopen = (agencyId) => svcCall(`SELECT public.subscription_support_reopen($1::uuid) AS r`, [agencyId])

function webhook(eventId, eventType, payload) {
  const sha = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  return svcCall(`SELECT public.subscription_webhook_process($1::text, $2::text, $3::jsonb, $4::text) AS r`,
    [eventId, eventType, JSON.stringify(payload), sha])
}
const captured = (eventId, orderId, paymentId, amount, currency = 'INR') =>
  webhook(eventId, 'payment.captured', {
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: orderId, amount: Number(amount), currency, method: 'upi', status: 'captured' } } },
  })
const refundEvent = (eventId, refundId, paymentId, amount) =>
  webhook(eventId, 'refund.processed', {
    event: 'refund.processed',
    payload: { refund: { entity: { id: refundId, payment_id: paymentId, amount: Number(amount), currency: 'INR' } } },
  })

// Query helpers (superuser)
const subsOf = async (agencyId) => (await su(`SELECT * FROM public.subscriptions WHERE agency_id = $1 ORDER BY created_at, id`, [agencyId])).rows
const liveSubOf = async (agencyId) =>
  (await su(`SELECT * FROM public.subscriptions WHERE agency_id = $1 AND status IN ('trial','active','past_due','grace')`, [agencyId])).rows[0]
const invoicesOf = async (agencyId) => (await su(`SELECT * FROM public.subscription_invoices WHERE agency_id = $1 ORDER BY issued_at, id`, [agencyId])).rows
const payRow = async (orderId) => (await su(`SELECT * FROM public.payment_history WHERE razorpay_order_id = $1`, [orderId])).rows[0]
const count = async (sql, params = []) => Number((await suOne(sql, params)).n)
const tsMs = (d) => new Date(d).getTime()
const todayIst = async () => (await suOne(`SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date::text AS d`)).d
const dayOffset = async (n) => (await suOne(`SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date + $1::int)::text AS d`, [n])).d
const plusMonthIst = async (ts) =>
  (await suOne(`SELECT ((($1::timestamptz AT TIME ZONE 'Asia/Kolkata') + interval '1 month') AT TIME ZONE 'Asia/Kolkata') AS t`, [ts])).t

/** Counts the rows an authenticated user can see; a permission error counts as 'denied'. */
async function visible(userId, sql, params = []) {
  const r = await call(userId, sql, params)
  if (r.raised) return /permission denied/i.test(r.message) ? 'denied' : `error:${r.message}`
  return Number(r.rows[0].n)
}
const none = (v) => v === 0 || v === 'denied'

// ---------------------------------------------------------------------------
// Journey state
// ---------------------------------------------------------------------------
const S = {}

async function main() {
  await db.exec(BOOTSTRAP)
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'))
    } catch (error) {
      throw new Error(`migration ${file} failed: ${firstLine(error)}`)
    }
  }
  console.log(`migrations applied: ${files.length} (last=${files[files.length - 1]})`)

  // Platform billing configured, enforcement ON for the whole journey.
  await su(
    `UPDATE public.platform_billing_settings
        SET legal_name = $1, gstin = $2, address = 'Mumbai, Maharashtra', state_code = '27', sac_code = '997331', enforcement_enabled = true`,
    [SUPPLIER_NAME, SUPPLIER_GSTIN]
  )
  const starter = await suOne(`SELECT * FROM public.subscription_plans WHERE tier = 'starter'`)
  S.plan = {
    trucks: Number(starter.trucks_limit), staff: Number(starter.users_limit),
    drivers: Number(starter.drivers_limit), orders: Number(starter.shipments_monthly),
  }

  // ===========================================================================
  // J1. New agency owner
  // ===========================================================================
  await step('J1 fixtures', async () => {
    S.A = await createAgency('Journey A', { gstin: gstinFor('27'), phone: '9876543210' })
    S.staffTemp = (await createUser('j1-temp-staff')).id
    await seedMembership(S.A.id, S.staffTemp, 'dispatcher')
  })
  const A = S.A

  await jc('J1', 'the agency is registered and approved with an owner account', async () => {
    const row = await suOne(`SELECT status, user_id FROM public.transport_agencies WHERE id = $1`, [A.id])
    expect(row.status === 'approved' && row.user_id === A.owner, `row ${JSON.stringify(row)}`)
  })
  await jc('J1', 'before any subscription the entitlement says status none and plan_tier null', async () => {
    const e = await ent(A.owner)
    expect(e.status === 'none' && e.plan_tier === null, `got ${e.status}/${e.plan_tier}`)
  })
  await jc('J1', 'without a subscription the agency is read-only and cannot dispatch', async () => {
    const e = await ent(A.owner)
    expect(e.can_write === false && e.can_dispatch === false, `can_write ${e.can_write} can_dispatch ${e.can_dispatch}`)
  })
  await jc('J1', 'without a subscription every limit is zero', async () => {
    const e = await ent(A.owner)
    expect(e.limits.trucks === 0 && e.limits.staff === 0 && e.limits.drivers === 0 && e.limits.orders_month === 0, JSON.stringify(e.limits))
  })
  await jc('J1', 'with enforcement on, adding a truck before the trial is refused SB002', async () => {
    const r = await vehicleCreate(A.owner, 'MH12-J1-0001')
    expectSB(r, 'SB002', 'vehicle_create')
    expect(r.detail && r.detail.status === 'none', `detail ${JSON.stringify(r.detail)}`)
  })
  await jc('J1', 'a staff member (no agency of their own) cannot start a trial: forbidden_scope', async () => {
    const r = await call(S.staffTemp, 'SELECT public.agency_subscription_start_trial() AS r')
    expectRefusal(r, 'forbidden_scope', 'staff start_trial')
    expect(!(await liveSubOf(A.id)), 'a subscription appeared')
  })
  await step('J1 retire temp staff', async () => {
    await su(`DELETE FROM public.agency_memberships WHERE user_id = $1`, [S.staffTemp])
  })
  await jc('J1', 'an agency with neither GSTIN nor phone cannot start a trial: identity_required', async () => {
    const z = await createAgency('Journey Z1', { gstin: null, phone: null })
    expectRefusal(await call(z.owner, 'SELECT public.agency_subscription_start_trial() AS r'), 'identity_required')
  })
  await jc('J1', 'a malformed GSTIN is refused: identity_required', async () => {
    const z = await createAgency('Journey Z2', { gstin: '27BADGSTIN', phone: null })
    expectRefusal(await call(z.owner, 'SELECT public.agency_subscription_start_trial() AS r'), 'identity_required')
  })
  await jc('J1', 'a 9-digit phone with no GSTIN is refused: identity_required', async () => {
    const z = await createAgency('Journey Z3', { gstin: null, phone: '987654321' })
    expectRefusal(await call(z.owner, 'SELECT public.agency_subscription_start_trial() AS r'), 'identity_required')
  })
  await jc('J1', 'the owner starts the trial with a valid GSTIN and 10-digit phone', async () => {
    const r = expectOk(await call(A.owner, 'SELECT public.agency_subscription_start_trial() AS r'), 'start_trial')
    expect(r.status === 'trial' && r.plan_tier === 'starter' && r.agency_id === A.id, JSON.stringify(r))
    S.trialSubId = r.subscription_id
  })
  await jc('J1', 'the trial lasts 14 days', async () => {
    const e = await ent(A.owner)
    const days = (tsMs(e.trial_end) - Date.now()) / 86400000
    expect(days > 13.99 && days <= 14.001, `trial_end in ${days} days`)
    const sub = await liveSubOf(A.id)
    expect(sub.status === 'trial' && tsMs(sub.current_period_end) === tsMs(sub.trial_end), 'period_end is not trial_end')
  })
  await jc('J1', 'the entitlement shows trial with the Starter limits and write + dispatch allowed', async () => {
    const e = await ent(A.owner)
    expect(e.status === 'trial' && e.plan_tier === 'starter', `${e.status}/${e.plan_tier}`)
    expect(e.limits.trucks === S.plan.trucks && e.limits.staff === S.plan.staff && e.limits.drivers === S.plan.drivers
      && e.limits.orders_month === S.plan.orders, JSON.stringify(e.limits))
    expect(e.can_write === true && e.can_dispatch === true, 'trial should write and dispatch')
    expect(S.plan.drivers === 2 * S.plan.trucks, 'drivers limit is not 2 x trucks')
  })
  await jc('J1', 'a second trial request is refused: trial_already_claimed, still one subscription', async () => {
    expectRefusal(await call(A.owner, 'SELECT public.agency_subscription_start_trial() AS r'), ['trial_already_claimed', 'subscription_exists'])
    expect((await subsOf(A.id)).length === 1, 'more than one subscription row')
  })
  await jc('J1', 'another agency reusing the same phone cannot claim a second trial', async () => {
    const z = await createAgency('Journey Z4', { gstin: gstinFor('27'), phone: A.phone })
    expectRefusal(await call(z.owner, 'SELECT public.agency_subscription_start_trial() AS r'), 'trial_already_claimed')
  })
  await jc('J1', 'the owner cannot write the subscription directly (no INSERT/UPDATE privilege)', async () => {
    const u = await call(A.owner, `UPDATE public.subscriptions SET status = 'active' WHERE agency_id = $1`, [A.id])
    expect(u.raised && /permission denied/i.test(u.message), `update: ${describe(u)}`)
    const i = await call(A.owner, `INSERT INTO public.subscriptions (agency_id, plan_id, status) SELECT $1, id, 'active' FROM public.subscription_plans LIMIT 1`, [A.id])
    expect(i.raised && /permission denied/i.test(i.message), `insert: ${describe(i)}`)
  })
  await jc('J1', 'anon cannot start a trial', async () => {
    const r = await roleCall('anon', 'SELECT public.agency_subscription_start_trial() AS r')
    expect(r.raised && /permission denied/i.test(r.message), describe(r))
  })

  // ===========================================================================
  // J2. Using the product during the trial (enforcement ON)
  // ===========================================================================
  await step('J2 fixtures', async () => {
    S.agr = await seedAgreement(A.id, 'Acme Cement')
    await seedSite(A.id, S.agr, 'bill_to', 'Head Office')
    await seedSite(A.id, S.agr, 'ship_to', 'Pune Depot')
    S.disp = await createUser('j2-dispatcher')
    S.fin = await createUser('j2-finance')
    S.drivers = []
    for (let i = 0; i < S.plan.drivers + 1; i += 1) S.drivers.push(await createDriver(`J2d${i}`))
    S.trucks = []
  })

  await jc('J2', `the owner adds trucks up to the Starter limit (${S.plan.trucks})`, async () => {
    for (let i = 1; i <= S.plan.trucks; i += 1) {
      const r = expectOk(await vehicleCreate(A.owner, `MH12-J2-000${i}`), `truck ${i}`)
      expect(r.state === 'created', `state ${r.state}`)
      S.trucks.push(r.vehicle.id)
    }
  })
  await jc('J2', 'the next truck is refused SB001 with limit, used, plan and status', async () => {
    const r = await vehicleCreate(A.owner, 'MH12-J2-OVER')
    expectSB(r, 'SB001', 'over-limit truck')
    const d = r.detail
    expect(d && d.limit === S.plan.trucks && d.used === S.plan.trucks && d.plan === 'starter' && d.status === 'trial', JSON.stringify(d))
  })
  await jc('J2', 'a replay of an existing RC number is not refused at the limit and adds no row', async () => {
    const r = expectOk(await vehicleCreate(A.owner, 'MH12-J2-0001'), 'replay')
    expect(r.state === 'idempotent_replay', `state ${r.state}`)
    expect(await count(`SELECT count(*) AS n FROM public.agency_trucks WHERE agency_id = $1`, [A.id]) === S.plan.trucks, 'row count changed')
  })
  await jc('J2', 'the refused truck wrote nothing', async () => {
    expect(await count(`SELECT count(*) AS n FROM public.agency_trucks WHERE agency_id = $1 AND rc_number = 'MH12-J2-OVER'`, [A.id]) === 0, 'row exists')
  })

  await jc('J2', 'the owner invites a dispatcher (seat 1)', async () => {
    const r = expectOk(await invite(A.owner, S.disp.email, 'dispatcher', 'j2-inv-1'), 'invite dispatcher')
    S.dispToken = r.token
  })
  await jc('J2', 'the owner invites a finance user (seat 2)', async () => {
    const r = expectOk(await invite(A.owner, S.fin.email, 'finance', 'j2-inv-2'), 'invite finance')
    S.finToken = r.token
  })
  await jc('J2', 'a third invitation is refused SB001 (staff limit reached by pending seats)', async () => {
    const r = await invite(A.owner, 'third-seat@example.com', 'viewer', 'j2-inv-3')
    expectSB(r, 'SB001', 'third invite')
    expect(r.detail.resource === 'staff' && r.detail.limit === S.plan.staff && r.detail.used === S.plan.staff, JSON.stringify(r.detail))
  })
  await jc('J2', 'both invitees accept and become active members with their scope', async () => {
    expectOk(await accept(S.disp.id, S.dispToken), 'accept dispatcher')
    expectOk(await accept(S.fin.id, S.finToken), 'accept finance')
    const rows = (await su(`SELECT user_id, scope FROM public.agency_memberships WHERE agency_id = $1 AND status = 'active' ORDER BY scope`, [A.id])).rows
    expect(rows.length === 2 && rows[0].scope === 'dispatcher' && rows[1].scope === 'finance', JSON.stringify(rows))
  })
  await jc('J2', 'accepting an already-accepted invitation is a replay and does not trip the limit', async () => {
    const r = expectOk(await accept(S.disp.id, S.dispToken), 'accept again')
    expect(r.state === 'idempotent_replay', `state ${r.state}`)
  })

  await jc('J2', `the owner employs drivers up to the Starter limit (${S.plan.drivers})`, async () => {
    for (let i = 0; i < S.plan.drivers; i += 1) {
      const r = expectOk(await employ(A.owner, S.drivers[i]), `driver ${i}`)
      expect(r.state === 'created', `state ${r.state}`)
    }
  })
  await jc('J2', 'the next driver is refused SB001', async () => {
    const r = await employ(A.owner, S.drivers[S.plan.drivers])
    expectSB(r, 'SB001', 'over-limit driver')
    expect(r.detail.resource === 'drivers' && r.detail.limit === S.plan.drivers, JSON.stringify(r.detail))
  })

  await jc('J2', 'a two-order, four-line order file is imported', async () => {
    const mk = (ref, n) => ({
      client_order_ref: ref, line_no: n, sku: 'SKU-1', description: 'Cement bags', quantity: 10, unit: 'kg',
      weight_per_unit_kg: 25.5, length_m: 1.2, width_m: 0.8, height_m: 0.9, pickup_site: 'Head Office', drop_site: 'Pune Depot',
      pickup_from: '2026-12-01T06:00:00+05:30', pickup_to: '2026-12-01T08:00:00+05:30',
      delivery_from: '2026-12-02T06:00:00+05:30', delivery_to: '2026-12-02T18:00:00+05:30', stackable: true, fragile: false,
    })
    S.importLines = [mk('J2-ORD-1', 1), mk('J2-ORD-1', 2), mk('J2-ORD-2', 1), mk('J2-ORD-2', 2)]
    const r = expectOk(await importOrders(A.owner, S.agr, 'hash-j2', 'key-j2', S.importLines), 'import')
    S.importBody = r
    expect(await count(`SELECT count(*) AS n FROM public.agency_orders WHERE agency_id = $1`, [A.id]) === 2, 'order rows')
  })
  await jc('J2', 'replaying the same file and key adds no orders', async () => {
    const r = expectOk(await importOrders(A.owner, S.agr, 'hash-j2', 'key-j2', S.importLines), 'import replay')
    expect(await count(`SELECT count(*) AS n FROM public.agency_orders WHERE agency_id = $1`, [A.id]) === 2, 'order rows changed')
    expect(r.state === 'idempotent_replay' || r.replay === true || /replay/i.test(JSON.stringify(r)), `not flagged as replay: ${JSON.stringify(r).slice(0, 160)}`)
  })
  await jc('J2', 'an import that would exceed the monthly order limit is refused SB001', async () => {
    const r = await svcOrAdmin(`SELECT public.agency_subscription_assert($1::uuid, 'order_import', $2::int) AS r`, [A.id, S.plan.orders - 1])
    expectSB(r, 'SB001', 'order_import over limit')
    expect(r.detail.used === 2 && r.detail.limit === S.plan.orders, JSON.stringify(r.detail))
  })

  await jc('J2', 'a load plan for order 1 is saved on truck 1 and approved within the trial', async () => {
    const lines = (await su(
      `SELECT l.id, l.quantity FROM public.agency_order_lines l JOIN public.agency_orders o ON o.id = l.order_id
        WHERE o.agency_id = $1 AND o.client_order_ref = 'J2-ORD-1' ORDER BY l.line_no`, [A.id])).rows
    const lines2 = (await su(
      `SELECT l.id, l.quantity FROM public.agency_order_lines l JOIN public.agency_orders o ON o.id = l.order_id
        WHERE o.agency_id = $1 AND o.client_order_ref = 'J2-ORD-2' ORDER BY l.line_no`, [A.id])).rows
    const load = (truck, ls) => [{ truck_id: truck, lines: ls.map((l) => ({ order_line_id: l.id, quantity: Number(l.quantity) })) }]
    const s1 = expectOk(await planSave(A.owner, 'J2 plan one', load(S.trucks[0], lines), 'j2-plan-1'), 'save plan 1')
    const s2 = expectOk(await planSave(A.owner, 'J2 plan two', load(S.trucks[1], lines2), 'j2-plan-2'), 'save plan 2')
    S.plan2Id = s2.plan_id
    const ap = expectOk(await planApprove(A.owner, s1.plan_id, s1.version ?? 1), 'approve plan 1')
    expect(ap.state === 'approved', `state ${ap.state}`)
    S.plan1Id = s1.plan_id
  })
  await jc('J2', 'the approved plan is stored as approved and the second plan stays draft', async () => {
    expect((await suOne(`SELECT status FROM public.agency_load_plans WHERE id = $1`, [S.plan1Id])).status === 'approved', 'plan 1 not approved')
    expect((await suOne(`SELECT status FROM public.agency_load_plans WHERE id = $1`, [S.plan2Id])).status === 'draft', 'plan 2 not draft')
  })
  await step('J2 jobs', async () => {
    S.job1 = await seedJob(A.id)
    S.job2 = await seedJob(A.id, { distanceKm: 40, weightKg: 500 })
    S.job3 = await seedJob(A.id, { distanceKm: 10, weightKg: 100 })
  })
  await jc('J2', 'the owner dispatches job 1 to a driver and the trip is accepted (dispatch allowed in trial)', async () => {
    const a = expectOk(await assignDriver(A.owner, S.job1, S.drivers[0]), 'assign')
    expect(a.state === 'assigned', `state ${a.state}`)
    const s = expectOk(await setStatus(A.owner, S.job1, 'accepted'), 'accepted')
    expect(s.state === 'updated', `state ${s.state}`)
  })
  await jc('J2', 'the dispatcher staff member can dispatch too', async () => {
    const a = expectOk(await assignDriver(S.disp.id, S.job2, S.drivers[1]), 'dispatcher assign')
    expect(a.state === 'assigned', `state ${a.state}`)
  })
  await jc('J2', 'usage numbers in the entitlement equal the rows', async () => {
    const e = await ent(A.owner)
    const rows = {
      trucks: await count(`SELECT count(*) AS n FROM public.agency_trucks WHERE agency_id = $1`, [A.id]),
      staff: await count(`SELECT count(*) AS n FROM public.agency_memberships WHERE agency_id = $1 AND status = 'active'`, [A.id]),
      drivers: await count(`SELECT count(*) AS n FROM public.agency_driver_employment WHERE agency_id = $1 AND status = 'active'`, [A.id]),
      orders_month: await count(`SELECT count(*) AS n FROM public.agency_orders WHERE agency_id = $1 AND status <> 'cancelled'`, [A.id]),
    }
    expect(['trucks', 'staff', 'drivers', 'orders_month'].every((k) => e.usage[k] === rows[k]), `usage ${JSON.stringify(e.usage)} rows ${JSON.stringify(rows)}`)
    expect(rows.trucks === S.plan.trucks && rows.staff === S.plan.staff && rows.drivers === S.plan.drivers && rows.orders_month === 2, JSON.stringify(rows))
  })
  await jc('J2', 'the staff member sees the same entitlement as the owner', async () => {
    const e = await ent(S.fin.id)
    expect(e.agency_id === A.id && e.status === 'trial', `${e.agency_id}/${e.status}`)
  })

  // ===========================================================================
  // J3. First purchase
  // ===========================================================================
  const oracle = STARTER_QUOTE
  await jc('J3', 'the quote prices Starter monthly server side with CGST = SGST (same state)', async () => {
    const q = expectOk(await quote(A.id), 'quote')
    S.quote = q
    expect(big(q.subtotal_paise) === STARTER_MONTHLY && big(q.discount_paise) === 0n, `subtotal ${q.subtotal_paise}`)
    expect(big(q.cgst_paise) === oracle.cgst && big(q.sgst_paise) === oracle.sgst && big(q.igst_paise) === 0n, `tax ${q.cgst_paise}/${q.sgst_paise}/${q.igst_paise}`)
    expect(big(q.total_paise) === oracle.total && big(q.amount_paise) === oracle.total, `total ${q.total_paise}`)
    expect(q.supplier_state_code === '27' && q.pos_state_code === '27', 'states')
  })
  await jc('J3', 'create_order takes no amount, price, tax or total argument', async () => {
    const r = await suOne(
      `SELECT pg_get_function_identity_arguments(p.oid) AS a FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = 'subscription_create_order'`)
    const args = r.a.split(',').map((s) => s.trim().split(' ')[0])
    expect(JSON.stringify(args) === JSON.stringify(['p_agency_id', 'p_plan_tier', 'p_billing_cycle', 'p_coupon_code', 'p_razorpay_order_id']), args.join(','))
    expect(args.every((a) => !/amount|paise|price|total|tax|gst|rupee/i.test(a)), 'money-like argument')
  })
  await jc('J3', 'create_order writes one pending payment row equal to the quote and changes nothing else', async () => {
    S.order1 = 'order_J3_first'
    const subBefore = await liveSubOf(A.id)
    const o = expectOk(await createOrder(A.id, S.order1), 'create_order')
    expect(o.replay === false && big(o.total_paise) === oracle.total, JSON.stringify(o))
    const row = await payRow(S.order1)
    expect(row.status === 'pending' && big(row.amount) === oracle.total && big(row.subtotal_paise) === STARTER_MONTHLY
      && big(row.cgst_paise) === oracle.cgst && big(row.sgst_paise) === oracle.sgst && big(row.igst_paise) === 0n, JSON.stringify(row))
    expect(row.agency_id === A.id && row.razorpay_payment_id === null, 'agency / payment id')
    const subAfter = await liveSubOf(A.id)
    expect(subAfter.status === 'trial' && subAfter.version === subBefore.version, 'subscription changed')
    expect((await invoicesOf(A.id)).length === 0, 'an invoice exists before payment')
  })
  await jc('J3', 'activation as service_role (source verify) makes the subscription active', async () => {
    S.pay1 = 'pay_J3first01'
    const r = expectOk(await activate(S.order1, S.pay1, oracle.total), 'activate')
    expect(r.replay === false && r.status === 'active' && big(r.amount_paise) === oracle.total, JSON.stringify(r))
    S.act1 = r
  })
  await jc('J3', 'the subscription row is active, monthly, Starter, with a one-month IST period starting at activation', async () => {
    const sub = await liveSubOf(A.id)
    expect(sub.id === S.trialSubId && sub.status === 'active' && sub.billing_cycle === 'monthly', `${sub.status}/${sub.billing_cycle}`)
    expect(sub.first_paid_at !== null && sub.grace_end === null && sub.cancel_at_period_end === false, 'paid fields')
    const endExpected = await plusMonthIst(sub.current_period_start)
    expect(tsMs(sub.current_period_end) === tsMs(endExpected), `period ${sub.current_period_start} -> ${sub.current_period_end}`)
    expect(Math.abs(tsMs(sub.current_period_start) - Date.now()) < 120000, 'period does not start now')
    S.E1 = sub.current_period_end
  })
  await jc('J3', 'the entitlement is active with the same Starter limits', async () => {
    const e = await ent(A.owner)
    expect(e.status === 'active' && e.plan_tier === 'starter' && e.can_write === true, `${e.status}/${e.plan_tier}`)
    expect(tsMs(e.period_end) === tsMs(S.E1), 'period_end')
    expect(e.limits.trucks === S.plan.trucks && e.limits.staff === S.plan.staff, JSON.stringify(e.limits))
  })
  await jc('J3', 'exactly one tax invoice exists with CGST = SGST, no IGST, and parts that add up', async () => {
    const inv = await invoicesOf(A.id)
    expect(inv.length === 1, `${inv.length} invoices`)
    const i = inv[0]
    expect(big(i.cgst_paise) === big(i.sgst_paise) && big(i.cgst_paise) === oracle.cgst && big(i.igst_paise) === 0n, `${i.cgst_paise}/${i.sgst_paise}/${i.igst_paise}`)
    expect(big(i.taxable_paise) + big(i.cgst_paise) + big(i.sgst_paise) + big(i.igst_paise) === big(i.total_paise), 'parts do not add up')
    S.inv1 = i
  })
  await jc('J3', 'the invoice number carries the current financial year and a six-digit serial', async () => {
    expect(S.inv1.fy === fyNow(), `fy ${S.inv1.fy} expected ${fyNow()}`)
    expect(/^TO\/\d\d-\d\d\/\d{6}$/.test(S.inv1.invoice_number) && S.inv1.invoice_number.includes(`/${fyNow()}/`), S.inv1.invoice_number)
    expect(S.inv1.series === 'TO', `series ${S.inv1.series}`)
  })
  await jc('J3', 'the invoice total equals the quote and the payment amount; supplier and recipient are right', async () => {
    const row = await payRow(S.order1)
    expect(big(S.inv1.total_paise) === oracle.total && big(S.inv1.total_paise) === big(row.amount) && big(S.inv1.total_paise) === big(S.quote.total_paise), 'totals differ')
    expect(S.inv1.supplier_gstin === SUPPLIER_GSTIN && S.inv1.supplier_state_code === '27' && S.inv1.place_of_supply_state_code === '27', 'supplier / POS')
    expect(S.inv1.recipient_gstin === A.gstin && Number(S.inv1.gst_rate_pct) === 18, 'recipient / rate')
  })
  await jc('J3', 'the payment row is success, carries the payment id and links the invoice and subscription', async () => {
    const row = await payRow(S.order1)
    expect(row.status === 'success' && row.razorpay_payment_id === S.pay1 && row.subscription_invoice_id === S.inv1.id && row.subscription_id === S.trialSubId, JSON.stringify(row))
  })
  await jc('J3', 'replaying the same payment through verify returns replay and adds no invoice', async () => {
    const r = expectOk(await activate(S.order1, S.pay1, oracle.total), 'replay')
    expect(r.replay === true && r.invoice_number === S.inv1.invoice_number, JSON.stringify(r))
    expect((await invoicesOf(A.id)).length === 1, 'invoice added')
  })
  await jc('J3', 'the same payment arriving as a payment.captured webhook is a replay: nothing added, period unchanged', async () => {
    const w = expectOk(await captured('evt_J3_cap_1', S.order1, S.pay1, oracle.total), 'webhook')
    expect(w.result === 'replay', `result ${w.result}`)
    expect((await invoicesOf(A.id)).length === 1, 'invoice added')
    expect(tsMs((await liveSubOf(A.id)).current_period_end) === tsMs(S.E1), 'period moved')
  })
  await jc('J3', 'delivering the identical webhook event id again is a duplicate', async () => {
    const w = expectOk(await captured('evt_J3_cap_1', S.order1, S.pay1, oracle.total), 'duplicate')
    expect(w.result === 'duplicate' && w.original_result === 'replay', JSON.stringify(w))
  })
  await jc('J3', 'a different payment id for the already paid order is refused and recorded, nothing activated', async () => {
    const r = await activate(S.order1, 'pay_J3second99', oracle.total)
    expectRefusal(r, 'order_already_paid')
    const row = await payRow(S.order1)
    expect(row.status === 'success' && row.razorpay_payment_id === S.pay1, 'row changed')
    expect(row.metadata.captured_payment_id === 'pay_J3second99' && row.metadata.refused_payment_ids.includes('pay_J3second99'), JSON.stringify(row.metadata))
    expect((await invoicesOf(A.id)).length === 1, 'invoice added')
  })
  await jc('J3', 'the TO invoice counter for the financial year equals the number of invoices', async () => {
    expect(await count(`SELECT max(last_no) AS n FROM public.subscription_invoice_counters WHERE series = 'TO' AND fy = $1`, [fyNow()]) === 1, 'counter')
  })
  await jc('J3', 'the owner reads their own tax invoice; nobody can write one through the API', async () => {
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.subscription_invoices WHERE agency_id = $1`, [A.id]) === 1, 'owner cannot read')
    const w = await call(A.owner, `UPDATE public.subscription_invoices SET total_paise = 1 WHERE agency_id = $1`, [A.id])
    expect(w.raised && /permission denied/i.test(w.message), describe(w))
  })
  await jc('J3', 'the owner cannot call the activation function (service_role only)', async () => {
    const r = await call(A.owner, `SELECT public.subscription_activate_payment('order_J3_first', 'pay_hack000', 1, 'INR', 'upi', 'verify') AS r`)
    expect(r.raised && /permission denied/i.test(r.message), describe(r))
  })

  // ===========================================================================
  // J4. Wrong money
  // ===========================================================================
  await jc('J4', 'a payment.captured webhook with the wrong amount is a recorded refusal (failed_recorded AMOUNT_MISMATCH)', async () => {
    S.order4 = 'order_J4_wrong'
    expectOk(await createOrder(A.id, S.order4), 'create J4 order')
    S.e1Before = tsMs((await liveSubOf(A.id)).current_period_end)
    const w = expectOk(await captured('evt_J4_wrong_1', S.order4, 'pay_J4wrong01', oracle.total - 1n), 'webhook')
    expect(w.result === 'failed_recorded' && w.error === 'AMOUNT_MISMATCH', JSON.stringify(w))
  })
  await jc('J4', 'the order row is failed with the mismatch reason', async () => {
    const row = await payRow(S.order4)
    expect(row.status === 'failed' && /^AMOUNT_MISMATCH/.test(row.error_message), `${row.status} ${row.error_message}`)
  })
  await jc('J4', 'the captured Razorpay payment id is kept on the order row and in the refusal ledger', async () => {
    const row = await payRow(S.order4)
    expect(row.razorpay_payment_id === 'pay_J4wrong01', `payment id ${row.razorpay_payment_id}`)
    expect(row.metadata.captured_payment_id === 'pay_J4wrong01' && row.metadata.refusal === 'AMOUNT_MISMATCH', JSON.stringify(row.metadata))
    expect(row.metadata.refused_payment_ids.includes('pay_J4wrong01'), 'refused_payment_ids')
  })
  await jc('J4', 'the webhook ledger keeps the body of the refused event', async () => {
    const ev = await suOne(`SELECT * FROM public.razorpay_webhook_events WHERE event_id = 'evt_J4_wrong_1'`)
    expect(ev.result === 'failed_recorded' && ev.error === 'AMOUNT_MISMATCH' && ev.payment_id === 'pay_J4wrong01' && ev.payload, JSON.stringify(ev).slice(0, 200))
  })
  await jc('J4', 'nothing was activated: period unchanged and still one invoice', async () => {
    expect(tsMs((await liveSubOf(A.id)).current_period_end) === S.e1Before, 'period moved')
    expect((await invoicesOf(A.id)).length === 1, 'invoice added')
  })
  await jc('J4', 'the verify path refuses a too-high amount the same way (AMOUNT_MISMATCH)', async () => {
    expectOk(await createOrder(A.id, 'order_J4_high'), 'create')
    const r = await activate('order_J4_high', 'pay_J4high001', oracle.total + 1n)
    expectRefusal(r, 'AMOUNT_MISMATCH')
    const row = await payRow('order_J4_high')
    expect(row.status === 'failed' && row.metadata.captured_payment_id === 'pay_J4high001', JSON.stringify(row.metadata))
  })
  await jc('J4', 'a payment in the wrong currency is a recorded CURRENCY_MISMATCH', async () => {
    expectOk(await createOrder(A.id, 'order_J4_usd'), 'create')
    const w = expectOk(await captured('evt_J4_usd_1', 'order_J4_usd', 'pay_J4usd0001', oracle.total, 'USD'), 'webhook')
    expect(w.result === 'failed_recorded' && w.error === 'CURRENCY_MISMATCH', JSON.stringify(w))
    expect((await payRow('order_J4_usd')).status === 'failed', 'row not failed')
  })
  await jc('J4', 'the order amount cannot be tampered: re-posting the order id with another plan is order_id_conflict', async () => {
    const r = await createOrder(A.id, S.order1, 'growth')
    expectRefusal(r, 'order_id_conflict')
    expect(big((await payRow(S.order1)).amount) === oracle.total, 'amount changed')
  })
  await jc('J4', 'the stored order snapshot is immutable even for the database owner', async () => {
    const r = await call(null, `SELECT 1`)
    expect(!r.raised, 'harness')
    let err = ''
    try {
      await su(`UPDATE public.payment_history SET amount = 1 WHERE razorpay_order_id = $1`, [S.order4])
    } catch (e) {
      err = firstLine(e)
    }
    expect(/payment_history_snapshot_immutable/.test(err), `update accepted or wrong error: ${err}`)
    expect(big((await payRow(S.order4)).amount) === oracle.total, 'amount changed')
  })
  await jc('J4', 'the owner cannot edit the payment ledger through the API', async () => {
    const r = await call(A.owner, `UPDATE public.payment_history SET status = 'success' WHERE razorpay_order_id = $1`, [S.order4])
    expect(r.raised && /permission denied/i.test(r.message), describe(r))
  })
  await jc('J4', 'a refund for the refused payment cannot be credit-noted and is kept as a refund exception', async () => {
    const w = expectOk(await refundEvent('evt_J4_rf_1', 'rfnd_J4wrong01', 'pay_J4wrong01', oracle.total - 1n), 'refund webhook')
    expect(w.result === 'failed_recorded' && w.error === 'payment_not_refundable', JSON.stringify(w))
    const ex = await suOne(`SELECT * FROM public.subscription_refund_exceptions WHERE refund_id = 'rfnd_J4wrong01'`)
    expect(ex && ex.reason === 'payment_not_refundable' && big(ex.amount_paise) === oracle.total - 1n, JSON.stringify(ex))
    expect(await count(`SELECT count(*) AS n FROM public.subscription_credit_notes WHERE agency_id = $1`, [A.id]) === 0, 'credit note created')
  })

  // ===========================================================================
  // J5. Renewal
  // ===========================================================================
  await jc('J5', 'a plan change is refused while more than 7 days remain (quote and order)', async () => {
    expectRefusal(await quote(A.id, 'growth'), 'plan_change_blocked')
    expectRefusal(await createOrder(A.id, 'order_J5_growth', 'growth'), 'plan_change_blocked')
    expect(await payRow('order_J5_growth') === undefined, 'a payment row was written')
  })
  await jc('J5', 'buying again early stacks the new period from the current period end', async () => {
    S.order5 = 'order_J5_renew'
    expectOk(await createOrder(A.id, S.order5), 'create')
    const r = expectOk(await activate(S.order5, 'pay_J5renew01', oracle.total), 'activate')
    expect(r.replay === false && r.status === 'active', JSON.stringify(r))
    const sub = await liveSubOf(A.id)
    expect(tsMs(sub.current_period_start) === tsMs(S.E1), `period_start ${sub.current_period_start} != ${S.E1}`)
    expect(tsMs(sub.current_period_end) === tsMs(await plusMonthIst(S.E1)), 'period_end not +1 month from the old end')
    S.E2 = sub.current_period_end
  })
  await jc('J5', 'there is still exactly one live subscription row for the agency', async () => {
    const live = (await subsOf(A.id)).filter((s) => ['trial', 'active', 'past_due', 'grace'].includes(s.status))
    expect(live.length === 1 && live[0].id === S.trialSubId, `${live.length} live rows`)
  })
  await jc('J5', 'the renewal wrote a second invoice, number +1, same series and year, CGST = SGST', async () => {
    const inv = await invoicesOf(A.id)
    expect(inv.length === 2, `${inv.length} invoices`)
    const n1 = Number(inv[0].invoice_number.split('/')[2])
    const n2 = Number(inv[1].invoice_number.split('/')[2])
    expect(n2 === n1 + 1 && inv[1].series === 'TO' && inv[1].fy === inv[0].fy, `${inv[0].invoice_number} ${inv[1].invoice_number}`)
    expect(big(inv[1].cgst_paise) === big(inv[1].sgst_paise) && big(inv[1].total_paise) === oracle.total, 'tax')
  })
  await jc('J5', 'the entitlement shows the stacked period end', async () => {
    const e = await ent(A.owner)
    expect(tsMs(e.period_end) === tsMs(S.E2) && e.status === 'active', `${e.status} ${e.period_end}`)
  })
  await jc('J5', 'the same renewal as an order.paid webhook is a replay', async () => {
    const w = await webhook('evt_J5_paid_1', 'order.paid', {
      event: 'order.paid',
      payload: { payment: { entity: { id: 'pay_J5renew01', order_id: S.order5, amount: Number(oracle.total), currency: 'INR', method: 'upi' } },
        order: { entity: { id: S.order5 } } },
    })
    const b = expectOk(w, 'order.paid')
    expect(b.result === 'replay', `result ${b.result}`)
    expect((await invoicesOf(A.id)).length === 2, 'invoice added')
  })
  await jc('J5', 'support reopen is refused while a live subscription exists', async () => {
    expectRefusal(await reopen(A.id), 'subscription_live_exists')
  })
  await jc('J5', 'a failed renewal payment moves the active subscription to past_due without cancelling', async () => {
    expectOk(await createOrder(A.id, 'order_J5_fail'), 'create')
    const w = expectOk(await webhook('evt_J5_fail_1', 'payment.failed', {
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_J5fail001', order_id: 'order_J5_fail', amount: Number(oracle.total), currency: 'INR', error_code: 'BAD_REQUEST_ERROR' } } },
    }), 'payment.failed')
    expect(w.result === 'past_due', `result ${w.result}`)
    const sub = await liveSubOf(A.id)
    expect(sub.status === 'past_due', `status ${sub.status}`)
    const e = await ent(A.owner)
    expect(e.can_write === true && e.can_dispatch === true, 'past_due should still write')
  })
  await jc('J5', 'paying the order recovers past_due back to active', async () => {
    S.order5b = 'order_J5_recover'
    expectOk(await createOrder(A.id, S.order5b), 'create')
    const before = await liveSubOf(A.id)
    expectOk(await activate(S.order5b, 'pay_J5recov01', oracle.total), 'activate')
    const sub = await liveSubOf(A.id)
    expect(sub.status === 'active' && tsMs(sub.current_period_start) === tsMs(before.current_period_end), `${sub.status}`)
    S.E2 = sub.current_period_end
    expect((await invoicesOf(A.id)).length === 3, 'third invoice missing')
  })

  // ===========================================================================
  // J6. Expiry (time travel through run_subscription_sweeps(as_of))
  // ===========================================================================
  const E = S.E2
  const at = (offsetHours) => new Date(tsMs(E) + offsetHours * 3600000).toISOString()
  const remRows = async () =>
    (await su(`SELECT kind FROM public.subscription_reminders WHERE subscription_id = $1 AND period_end = $2 ORDER BY kind`, [S.trialSubId, E])).rows.map((r) => r.kind)

  await jc('J6', 'a sweep at T-7d creates the t_minus_7 reminder once', async () => {
    const r = expectOk(await sweep(at(-168 + 1)), 'sweep T-7')
    expect(r.reminders_created >= 1 && r.grace_started === 0, JSON.stringify(r))
    expect((await remRows()).join() === 't_minus_7', (await remRows()).join())
    expect((await liveSubOf(A.id)).status === 'active', 'status moved early')
  })
  await jc('J6', 'running the same sweep again is idempotent (no second reminder)', async () => {
    const r = expectOk(await sweep(at(-168 + 1)), 'sweep T-7 again')
    expect(r.reminders_created === 0, JSON.stringify(r))
    expect((await remRows()).filter((k) => k === 't_minus_7').length === 1, 'duplicate row')
  })
  await jc('J6', 'sweeps at T-3d and T-1d create t_minus_3 and t_minus_1 exactly once each', async () => {
    expectOk(await sweep(at(-72 + 1)), 'sweep T-3')
    expectOk(await sweep(at(-24 + 1)), 'sweep T-1')
    expectOk(await sweep(at(-24 + 2)), 'sweep T-1 later')
    expect((await remRows()).join() === 't_minus_1,t_minus_3,t_minus_7', (await remRows()).join())
  })
  await jc('J6', 'the owner can read their own reminders; the in-app list shows all three', async () => {
    const n = await visible(A.owner, `SELECT count(*) AS n FROM public.subscription_reminders WHERE subscription_id = $1`, [S.trialSubId])
    expect(n === 3, `owner sees ${n}`)
  })
  await jc('J6', 'past the period end an active subscription moves to grace with a 7-day grace end', async () => {
    const r = expectOk(await sweep(at(1)), 'sweep T+1h')
    expect(r.grace_started >= 1, JSON.stringify(r))
    const sub = await liveSubOf(A.id)
    expect(sub.status === 'grace', `status ${sub.status}`)
    expect(tsMs(sub.grace_end) === tsMs(E) + 168 * 3600000, `grace_end ${sub.grace_end}`)
  })
  await jc('J6', 'in grace the entitlement is read-only but still dispatches', async () => {
    const e = await ent(A.owner)
    expect(e.status === 'grace' && e.can_write === false && e.can_dispatch === true, JSON.stringify([e.status, e.can_write, e.can_dispatch]))
  })
  await jc('J6', 'in grace adding a truck, a seat or an order file is refused SB002', async () => {
    const t = await vehicleCreate(A.owner, 'MH12-J6-GRACE')
    expectSB(t, 'SB002', 'truck')
    expect(t.detail.status === 'grace' && t.detail.code === 'SB002', JSON.stringify(t.detail))
    expectSB(await invite(A.owner, 'grace-seat@example.com', 'viewer', 'j6-inv'), 'SB002', 'invite')
    expectSB(await importOrders(A.owner, S.agr, 'hash-j6', 'key-j6', [{ ...S.importLines[0], client_order_ref: 'J6-ORD' }]), 'SB002', 'import')
  })
  await jc('J6', 'in grace adding a driver is refused SB002', async () => {
    const d = await createDriver('J6extra')
    expectSB(await employ(A.owner, d), 'SB002', 'driver')
  })
  await jc('J6', 'in grace every read still works (trucks, orders, invoices, entitlement)', async () => {
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.agency_trucks WHERE agency_id = $1`, [A.id]) === S.plan.trucks, 'trucks')
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.agency_orders WHERE agency_id = $1`, [A.id]) === 2, 'orders')
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.subscription_invoices WHERE agency_id = $1`, [A.id]) === 3, 'invoices')
    expectOk(await entitlement(A.owner), 'entitlement')
  })
  await jc('J6', 'in grace the trip status update still works (job 1 is delivered)', async () => {
    const r = expectOk(await setStatus(A.owner, S.job1, 'delivered'), 'delivered')
    expect(r.state === 'updated' && r.job.status === 'delivered' && r.job.completed_at, JSON.stringify(r).slice(0, 160))
  })
  await jc('J6', 'in grace dispatch is still allowed (assign a driver to job 3)', async () => {
    expectOk(await assignDriver(A.owner, S.job3, S.drivers[2]), 'assign in grace')
  })
  await jc('J6', 'the sweep also left a t_zero reminder for the period end', async () => {
    expect((await remRows()).includes('t_zero'), (await remRows()).join())
  })
  await jc('J6', 'the grace sweep is idempotent', async () => {
    const r = expectOk(await sweep(at(1)), 'sweep again')
    expect(r.grace_started === 0 && r.grace_expired === 0, JSON.stringify(r))
    expect((await liveSubOf(A.id)).status === 'grace', 'status moved')
  })
  await jc('J6', 'at the end of grace the subscription expires', async () => {
    const r = expectOk(await sweep(at(168 + 1)), 'sweep grace end')
    expect(r.grace_expired >= 1, JSON.stringify(r))
    const sub = (await subsOf(A.id))[0]
    expect(sub.status === 'expired', `status ${sub.status}`)
  })
  await jc('J6', 'when expired, dispatch is refused SB003 (assign driver and approve plan)', async () => {
    const job4 = await seedJob(A.id)
    const a = await assignDriver(A.owner, job4, S.drivers[3])
    expectSB(a, 'SB003', 'assign')
    expect(a.detail.status === 'expired', JSON.stringify(a.detail))
    expectSB(await planApprove(A.owner, S.plan2Id, 1), 'SB003', 'approve plan')
    expect((await suOne(`SELECT status FROM public.agency_load_plans WHERE id = $1`, [S.plan2Id])).status === 'draft', 'plan changed')
  })
  await jc('J6', 'when expired, adds are refused SB002 and the entitlement is fully locked', async () => {
    expectSB(await vehicleCreate(A.owner, 'MH12-J6-EXP'), 'SB002', 'truck')
    const e = await ent(A.owner)
    expect(e.status === 'expired' && e.can_write === false && e.can_dispatch === false, JSON.stringify([e.status, e.can_write, e.can_dispatch]))
  })
  await jc('J6', 'when expired, reads still work', async () => {
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.agency_trucks WHERE agency_id = $1`, [A.id]) === S.plan.trucks, 'trucks')
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.subscription_invoices WHERE agency_id = $1`, [A.id]) === 3, 'invoices')
  })
  await jc('J6', 'the reminder rows are still exactly one each after all sweeps', async () => {
    const rows = await remRows()
    for (const k of ['t_minus_7', 't_minus_3', 't_minus_1']) expect(rows.filter((x) => x === k).length === 1, `${k} x${rows.filter((x) => x === k).length}`)
  })
  await jc('J6', 'renewing from expired restores active, the Starter limits and dispatch', async () => {
    S.order6 = 'order_J6_renew'
    S.pay6 = 'pay_J6renew01'
    expectOk(await createOrder(A.id, S.order6), 'create')
    const r = expectOk(await activate(S.order6, S.pay6, oracle.total), 'activate')
    expect(r.status === 'active', JSON.stringify(r))
    const sub = await liveSubOf(A.id)
    expect(sub.id === S.trialSubId && sub.status === 'active' && sub.grace_end === null, `${sub.status}`)
    const e = await ent(A.owner)
    expect(e.status === 'active' && e.can_write && e.can_dispatch && e.limits.trucks === S.plan.trucks, JSON.stringify([e.status, e.limits]))
    expectOk(await assignDriver(A.owner, S.job2, S.drivers[1]), 'dispatch again')
  })
  await jc('J6', 'after renewal the truck limit is enforced again (SB001, not SB002)', async () => {
    expectSB(await vehicleCreate(A.owner, 'MH12-J6-AFTER'), 'SB001', 'truck after renewal')
  })
  await jc('J6', 'the renewal from expired produced the fourth invoice', async () => {
    expect((await invoicesOf(A.id)).length === 4, `${(await invoicesOf(A.id)).length} invoices`)
    S.inv4 = (await invoicesOf(A.id))[3]
  })

  // ===========================================================================
  // J7. Refund, cancellation, support reopen
  // ===========================================================================
  await jc('J7', 'a refund.processed webhook for the latest payment creates a credit note', async () => {
    const w = expectOk(await refundEvent('evt_J7_rf_1', 'rfnd_J7full01', S.pay6, S.inv4.total_paise), 'refund')
    expect(w.result === 'refunded', JSON.stringify(w))
    S.cnList = (await su(`SELECT * FROM public.subscription_credit_notes WHERE invoice_id = $1`, [S.inv4.id])).rows
    expect(S.cnList.length === 1, `${S.cnList.length} notes`)
  })
  await jc('J7', 'the credit note has CGST = SGST and does not exceed the invoice', async () => {
    const n = S.cnList[0]
    const i = S.inv4
    expect(big(n.cgst_paise) === big(n.sgst_paise) && big(n.igst_paise) === 0n, `${n.cgst_paise}/${n.sgst_paise}/${n.igst_paise}`)
    expect(big(n.total_paise) <= big(i.total_paise) && big(n.cgst_paise) <= big(i.cgst_paise) && big(n.taxable_paise) <= big(i.taxable_paise), 'exceeds the invoice')
    expect(big(n.taxable_paise) + big(n.cgst_paise) + big(n.sgst_paise) === big(n.total_paise), 'parts do not add up')
  })
  await jc('J7', 'a full refund nets the invoice to zero component by component', async () => {
    const n = S.cnList[0]
    const i = S.inv4
    expect(big(n.total_paise) === big(i.total_paise) && big(n.taxable_paise) === big(i.taxable_paise) && big(n.cgst_paise) === big(i.cgst_paise), 'not a closing note')
    expect(/^CN\/\d\d-\d\d\/\d{6}$/.test(n.credit_note_number) && n.credit_note_number.includes(`/${fyNow()}/`), n.credit_note_number)
  })
  await jc('J7', 'the payment is refunded and the subscription is cancelled', async () => {
    expect((await payRow(S.order6)).status === 'refunded', 'payment status')
    const sub = (await subsOf(A.id))[0]
    expect(sub.status === 'cancelled' && sub.cancelled_at !== null, `status ${sub.status}`)
    const e = await ent(A.owner)
    expect(e.can_write === false && e.can_dispatch === false, 'cancelled agency can still write or dispatch')
  })
  await jc('J7', 'the same refund event is a duplicate; the same refund id on a new event adds no second note', async () => {
    const d = expectOk(await refundEvent('evt_J7_rf_1', 'rfnd_J7full01', S.pay6, S.inv4.total_paise), 'dup event')
    expect(d.result === 'duplicate', JSON.stringify(d))
    const r = expectOk(await refundEvent('evt_J7_rf_2', 'rfnd_J7full01', S.pay6, S.inv4.total_paise), 'new event same refund')
    expect(r.result === 'refunded', JSON.stringify(r))
    expect(await count(`SELECT count(*) AS n FROM public.subscription_credit_notes WHERE invoice_id = $1`, [S.inv4.id]) === 1, 'second note')
  })
  await jc('J7', 'a refund beyond what is left is refused and kept as a refund exception', async () => {
    const w = expectOk(await refundEvent('evt_J7_rf_3', 'rfnd_J7over01', S.pay6, 100), 'over refund')
    expect(w.result === 'failed_recorded' && w.error === 'refund_exceeds_payment', JSON.stringify(w))
    const ex = await suOne(`SELECT reason FROM public.subscription_refund_exceptions WHERE refund_id = 'rfnd_J7over01'`)
    expect(ex && ex.reason === 'refund_exceeds_payment', JSON.stringify(ex))
    expect(await count(`SELECT count(*) AS n FROM public.subscription_credit_notes WHERE invoice_id = $1`, [S.inv4.id]) === 1, 'extra note')
  })
  await jc('J7', 'a cancelled subscription can never be changed back, not even by service_role', async () => {
    const r = await svcCall(`UPDATE public.subscriptions SET status = 'active' WHERE agency_id = $1 AND status = 'cancelled'`, [A.id])
    expect(r.raised, `update accepted: ${describe(r)}`)
    expect((await subsOf(A.id))[0].status === 'cancelled', 'status changed')
  })
  await jc('J7', 'a new order for a cancelled subscription is captured, refused and recorded with the payment id', async () => {
    S.order7 = 'order_J7_after'
    expectOk(await createOrder(A.id, S.order7), 'create after cancel')
    const w = expectOk(await captured('evt_J7_cap_1', S.order7, 'pay_J7refused1', oracle.total), 'captured')
    expect(w.result === 'failed_recorded' && w.error === 'subscription_cancelled', JSON.stringify(w))
    const row = await payRow(S.order7)
    expect(row.metadata.captured_payment_id === 'pay_J7refused1' && row.metadata.refusal === 'subscription_cancelled' && row.razorpay_payment_id === 'pay_J7refused1', JSON.stringify(row.metadata))
    expect((await invoicesOf(A.id)).length === 4, 'invoice added')
  })
  await jc('J7', 'the refused capture can be refunded: kept as a refund exception, no credit note', async () => {
    const w = expectOk(await refundEvent('evt_J7_rf_4', 'rfnd_J7refused1', 'pay_J7refused1', oracle.total), 'refund refused capture')
    expect(w.result === 'failed_recorded' && w.error === 'payment_not_refundable', JSON.stringify(w))
    expect(await count(`SELECT count(*) AS n FROM public.subscription_credit_notes WHERE agency_id = $1`, [A.id]) === 1, 'extra credit note')
  })
  await jc('J7', 'support reopen is service_role only', async () => {
    const r = await call(A.owner, `SELECT public.subscription_support_reopen($1::uuid) AS r`, [A.id])
    expect(r.raised && /permission denied/i.test(r.message), describe(r))
  })
  await jc('J7', 'support reopen inserts a fresh expired subscription and leaves the cancelled one alone', async () => {
    const r = expectOk(await reopen(A.id), 'reopen')
    expect(r.status === 'expired', JSON.stringify(r))
    S.reopenId = r.subscription_id
    const rows = await subsOf(A.id)
    expect(rows.length === 2 && rows[0].status === 'cancelled' && rows[1].id === r.subscription_id, JSON.stringify(rows.map((x) => x.status)))
  })
  await jc('J7', 'a second reopen is refused (the live row is expired, not cancelled)', async () => {
    expectRefusal(await reopen(A.id), 'subscription_not_cancelled')
  })
  await jc('J7', 'after the reopen a purchase works: active again with a fifth invoice', async () => {
    S.order7b = 'order_J7_reopen'
    expectOk(await createOrder(A.id, S.order7b), 'create')
    const r = expectOk(await activate(S.order7b, 'pay_J7reopen01', oracle.total), 'activate')
    expect(r.status === 'active' && r.subscription_id === S.reopenId, JSON.stringify(r))
    expect((await invoicesOf(A.id)).length === 5, 'invoice count')
    expect((await subsOf(A.id))[0].status === 'cancelled', 'cancelled row changed')
    const e = await ent(A.owner)
    expect(e.status === 'active' && e.can_write === true && e.can_dispatch === true, JSON.stringify([e.status, e.can_write]))
  })

  // ===========================================================================
  // J8. Payroll and money modules in the same agency
  // ===========================================================================
  await jc('J8', 'the owner sets the driver rate for the driver who delivered job 1', async () => {
    const r = expectOk(await call(A.owner, `SELECT public.agency_driver_rate_set($1::uuid, 100000, 1500, 2000, 0) AS r`, [S.drivers[0]]), 'rate_set')
    expect(Number(r.version ?? 1) >= 1, JSON.stringify(r))
  })
  await jc('J8', 'a rate for a driver the agency does not employ is refused driver_not_employed', async () => {
    const d = await createDriver('J8stranger')
    expectRefusal(await call(A.owner, `SELECT public.agency_driver_rate_set($1::uuid, 1, 1, 1, 0) AS r`, [d]), 'driver_not_employed')
  })
  await jc('J8', 'the finance staff member opens a payroll period that ended yesterday', async () => {
    // A period can only be closed once it is over: the delivered job's completion is moved two days back (fixture).
    // (completed_at is write-once for every role, so a finished historical trip is seeded as a fixture.)
    const shipment = uid()
    await su(`INSERT INTO public.shipments (id, shipment_id, origin, destination, total_weight) VALUES ($1, $2, 'Pune', 'Mumbai', 2600)`, [shipment, nx('JRNY-SHP')])
    S.job5 = uid()
    await su(
      `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, driver_id, fare, status, distance_km, weight_kg, completed_at)
       VALUES ($1, $2, $3, $4, 15000, 'delivered', 120, 2600, now() - interval '2 days')`,
      [S.job5, A.id, shipment, S.drivers[0]]
    )
    S.pStart = await dayOffset(-4)
    S.pEnd = await dayOffset(-1)
    const r = expectOk(await call(S.fin.id, `SELECT public.agency_payroll_open_period($1::date, $2::date, 'j8-period') AS r`, [S.pStart, S.pEnd]), 'open')
    expect(r.state === 'opened', `state ${r.state}`)
    S.periodId = r.period_id
  })
  await jc('J8', 'the dispatcher staff member cannot adjust payroll (scope)', async () => {
    const r = await call(S.disp.id, `SELECT public.agency_payroll_adjust($1::uuid, $2::uuid, 'advance', 100, 'sneaky advance') AS r`, [S.periodId, S.drivers[0]])
    expectRefusal(r, ['forbidden_scope', 'access scope'])
  })
  await jc('J8', 'the finance staff member records an advance and a deduction', async () => {
    expectOk(await call(S.fin.id, `SELECT public.agency_payroll_adjust($1::uuid, $2::uuid, 'advance', 50000, 'October fuel advance') AS r`, [S.periodId, S.drivers[0]]), 'advance')
    expectOk(await call(S.fin.id, `SELECT public.agency_payroll_adjust($1::uuid, $2::uuid, 'deduction', 20000, 'Damaged pallet recovery') AS r`, [S.periodId, S.drivers[0]]), 'deduction')
  })
  await jc('J8', 'closing the period pays the delivered job once: base + km + tonnes - advance - deduction', async () => {
    const r = expectOk(await call(A.owner, `SELECT public.agency_payroll_close_period($1::date, $2::date, 'j8-period') AS r`, [S.pStart, S.pEnd]), 'close')
    expect(r.state === 'closed', `state ${r.state}`)
    const line = await suOne(`SELECT * FROM public.agency_payroll_lines WHERE period_id = $1 AND driver_id = $2`, [S.periodId, S.drivers[0]])
    // 120 km x 1500 + floor((2600 + 500) / 1000) = 3 t x 2000 = 186000; base 100000; owed 70000.
    expect(big(line.base_paise) === 100000n && big(line.trips_paise) === 186000n && Number(line.trip_count) === 1, JSON.stringify(line))
    expect(big(line.advances_paise) === 50000n && big(line.deductions_paise) === 20000n && big(line.net_paise) === 216000n && big(line.shortfall_paise) === 0n, JSON.stringify(line))
  })
  await jc('J8', 'the paid job is snapshotted exactly once and a second close is an idempotent replay', async () => {
    expect(await count(`SELECT count(*) AS n FROM public.agency_payroll_line_jobs WHERE job_id = $1`, [S.job5]) === 1, 'job snapshot')
    const r = expectOk(await call(A.owner, `SELECT public.agency_payroll_close_period($1::date, $2::date, 'j8-period') AS r`, [S.pStart, S.pEnd]), 'close again')
    expect(r.replay === true, JSON.stringify(r))
    expect(await count(`SELECT count(*) AS n FROM public.agency_payroll_lines WHERE period_id = $1 AND driver_id = $2`, [S.periodId, S.drivers[0]]) === 1, 'second line')
  })
  await jc('J8', 'a closed period accepts no more adjustments', async () => {
    const r = await call(S.fin.id, `SELECT public.agency_payroll_adjust($1::uuid, $2::uuid, 'advance', 100, 'too late') AS r`, [S.periodId, S.drivers[0]])
    expect(r.raised || (r.value && r.value.ok === false), `accepted: ${describe(r)}`)
  })
  await step('J8 freight client', async () => {
    S.inv8 = { lines: [{ description: 'Freight haulage', quantity: 2, rate_paise: 100000 }] }
  })
  await jc('J8', 'the dispatcher cannot issue a freight invoice; the finance staff member can (total 236000)', async () => {
    const issue = (u, key) => call(u, `SELECT public.agency_invoice_issue($1::uuid, $2::jsonb, '27', '27', 18, false, false, $3::text) AS r`, [S.agr, JSON.stringify(S.inv8.lines), key])
    expectRefusal(await issue(S.disp.id, 'j8-inv-d'), ['forbidden_scope', 'access scope'])
    const r = expectOk(await issue(S.fin.id, 'j8-inv-f'), 'issue')
    S.freightId = r.invoice_id
    const row = await suOne(`SELECT * FROM public.agency_invoices WHERE id = $1`, [r.invoice_id])
    expect(big(row.total_paise) === 236000n && big(row.cgst_paise) === 18000n && big(row.sgst_paise) === 18000n && big(row.igst_paise) === 0n, JSON.stringify(row))
    expect(/^INV\/\d{4}-\d\d\/\d{6}$/.test(row.invoice_number), row.invoice_number)
  })
  await jc('J8', 'recording payments is record-only: partly_paid then paid, an overpayment is refused', async () => {
    const today = await dayOffset(-1)
    const pay = (amt, key, v) => call(A.owner, `SELECT public.agency_invoice_record_payment($1::uuid, $2::bigint, 'upi', 'UTR-1', $3::date, $4::int, $5::text) AS r`, [S.freightId, amt, today, v, key])
    const p1 = expectOk(await pay(100000, 'j8-pay-1', 1), 'payment 1')
    expect(p1.status === 'partly_paid' && big(p1.paid_paise) === 100000n, JSON.stringify(p1))
    expectRefusal(await pay(200000, 'j8-pay-over', p1.version), 'overpayment')
    const p2 = expectOk(await pay(136000, 'j8-pay-2', p1.version), 'payment 2')
    expect(p2.status === 'paid' && big(p2.paid_paise) === 236000n, JSON.stringify(p2))
  })
  await jc('J8', 'replaying a recorded payment key adds no second payment row', async () => {
    const today = await dayOffset(-1)
    const r = await call(A.owner, `SELECT public.agency_invoice_record_payment($1::uuid, 100000, 'upi', 'UTR-1', $2::date, 1, 'j8-pay-1') AS r`, [S.freightId, today])
    expect(!r.raised, describe(r))
    expect(await count(`SELECT count(*) AS n FROM public.agency_invoice_payments WHERE invoice_id = $1`, [S.freightId]) === 2, 'payment rows')
  })
  await jc('J8', 'an expense is recorded once per key and an unknown category is refused', async () => {
    const d = await dayOffset(-1)
    const rec = (cat, key) => call(A.owner, `SELECT public.agency_expense_record($1::uuid, $2::text, 25000, $3::date, 'NH48 toll', $4::text) AS r`, [S.trucks[0], cat, d, key])
    expectOk(await rec('toll', 'j8-exp-1'), 'expense')
    expectOk(await rec('toll', 'j8-exp-1'), 'expense replay')
    expect(await count(`SELECT count(*) AS n FROM public.agency_expenses WHERE agency_id = $1 AND category = 'toll'`, [A.id]) === 1, 'expense rows')
    expectRefusal(await rec('lottery', 'j8-exp-2'), 'invalid_category')
  })
  await jc('J8', 'fuel fills keep the odometer strictly increasing and each fill makes a fuel expense', async () => {
    const d = await dayOffset(-1)
    const fill = (odo, key) => call(A.owner, `SELECT public.agency_fuel_fill_record($1::uuid, $2::numeric, 40, true, 400000, $3::date, $4::text) AS r`, [S.trucks[0], odo, d, key])
    expectOk(await fill(10000, 'j8-fuel-1'), 'fill 1')
    expectOk(await fill(10300, 'j8-fuel-2'), 'fill 2')
    expectRefusal(await fill(10100, 'j8-fuel-3'), 'odometer_not_increasing')
    expectRefusal(await fill(10300, 'j8-fuel-4'), 'odometer_not_increasing')
    expect(await count(`SELECT count(*) AS n FROM public.agency_fuel_fills WHERE truck_id = $1`, [S.trucks[0]]) === 2, 'fill rows')
    expect(await count(`SELECT count(*) AS n FROM public.agency_expenses WHERE agency_id = $1 AND category = 'fuel'`, [A.id]) === 2, 'fuel expense rows')
  })
  await jc('J8', 'the money modules did not disturb the subscription', async () => {
    const e = await ent(A.owner)
    expect(e.status === 'active' && (await invoicesOf(A.id)).length === 5, `${e.status}`)
  })

  // ===========================================================================
  // J9. Security walk
  // ===========================================================================
  await step('J9 fixtures', async () => {
    S.B = await createAgency('Journey B', { gstin: gstinFor('27'), phone: '9123456780' })
    S.bTruck = uid()
    await su(`INSERT INTO public.agency_trucks (id, agency_id, vehicle_type, rc_number) VALUES ($1, $2, 'eicher_14ft', 'MH12-B-0001')`, [S.bTruck, S.B.id])
    S.bDriver = await createDriver('J9B')
    await su(`INSERT INTO public.agency_driver_employment (id, agency_id, driver_id, status) VALUES ($1, $2, $3, 'active')`, [uid(), S.B.id, S.bDriver])
    S.viewer = (await createUser('j9-viewer')).id
    await seedMembership(A.id, S.viewer, 'viewer')
    S.bTrial = await call(S.B.owner, 'SELECT public.agency_subscription_start_trial() AS r')
  })

  await jc('J9', "agency B's owner starts a trial of their own and sees only their own entitlement", async () => {
    expectOk(S.bTrial, 'B trial')
    const e = await ent(S.B.owner)
    expect(e.agency_id === S.B.id && e.status === 'trial' && e.usage.trucks === 1 && e.usage.drivers === 1, JSON.stringify(e))
  })
  await jc('J9', "another agency's owner can never read this agency's subscription rows", async () => {
    const n = await visible(S.B.owner, `SELECT count(*) AS n FROM public.subscriptions WHERE agency_id = $1`, [A.id])
    expect(n === 0, `B sees ${n}`)
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.subscriptions WHERE agency_id = $1`, [A.id]) === 2, 'A owner cannot see own rows')
    expect(await visible(S.B.owner, `SELECT count(*) AS n FROM public.subscriptions WHERE agency_id = $1`, [S.B.id]) === 1, 'B owner cannot see own row')
  })
  await jc('J9', "another agency's owner can never read tax invoices or credit notes", async () => {
    expect(none(await visible(S.B.owner, `SELECT count(*) AS n FROM public.subscription_invoices WHERE agency_id = $1`, [A.id])), 'invoices')
    expect(none(await visible(S.B.owner, `SELECT count(*) AS n FROM public.subscription_credit_notes WHERE agency_id = $1`, [A.id])), 'credit notes')
    expect(await visible(A.owner, `SELECT count(*) AS n FROM public.subscription_credit_notes WHERE agency_id = $1`, [A.id]) === 1, 'owner own note')
  })
  await jc('J9', "another agency's owner can never read this agency's payments or reminders", async () => {
    expect(none(await visible(S.B.owner, `SELECT count(*) AS n FROM public.payment_history WHERE agency_id = $1`, [A.id])), 'payments')
    expect(none(await visible(S.B.owner, `SELECT count(*) AS n FROM public.subscription_reminders WHERE subscription_id = $1`, [S.trialSubId])), 'reminders')
  })
  await jc('J9', 'webhook ledgers, attempts, refund exceptions, coupons and counters are invisible to authenticated users', async () => {
    for (const t of ['razorpay_webhook_events', 'razorpay_webhook_attempts', 'subscription_refund_exceptions', 'subscription_coupons',
      'subscription_coupon_redemptions', 'subscription_invoice_counters', 'subscription_trial_claims']) {
      for (const who of [A.owner, S.B.owner]) {
        const n = await visible(who, `SELECT count(*) AS n FROM public.${t}`)
        expect(none(n), `${t} visible to a tenant: ${n}`)
      }
    }
  })
  await jc('J9', 'webhook ledgers are invisible to anon', async () => {
    for (const t of ['razorpay_webhook_events', 'subscription_invoices', 'payment_history', 'subscriptions']) {
      const r = await roleCall('anon', `SELECT count(*) AS n FROM public.${t}`)
      expect(r.raised || Number(r.rows[0].n) === 0, `anon reads ${t}`)
    }
  })
  await jc('J9', "another agency's owner can never read payroll periods, lines, adjustments, rates or paid jobs", async () => {
    for (const t of ['agency_payroll_periods', 'agency_payroll_lines', 'agency_payroll_adjustments', 'agency_driver_rates', 'agency_payroll_line_jobs']) {
      expect(none(await visible(S.B.owner, `SELECT count(*) AS n FROM public.${t} WHERE agency_id = $1`, [A.id])), `${t} leaks to B`)
      expect((await visible(A.owner, `SELECT count(*) AS n FROM public.${t} WHERE agency_id = $1`, [A.id])) > 0, `${t} not visible to the owner`)
    }
  })
  await jc('J9', "another agency's owner can never read freight invoices, payments, expenses or fuel fills", async () => {
    for (const t of ['agency_invoices', 'agency_invoice_payments', 'agency_expenses', 'agency_fuel_fills']) {
      expect(none(await visible(S.B.owner, `SELECT count(*) AS n FROM public.${t} WHERE agency_id = $1`, [A.id])), `${t} leaks to B`)
    }
  })
  await jc('J9', "the drivers directory of another agency shows only its own drivers", async () => {
    const own = expectOk(await call(A.owner, 'SELECT public.agency_driver_directory() AS r'), 'A directory')
    const other = expectOk(await call(S.B.owner, 'SELECT public.agency_driver_directory() AS r'), 'B directory')
    expect(own.drivers.length === S.plan.drivers, `A lists ${own.drivers.length}`)
    expect(other.drivers.length === 1 && other.drivers[0].driver_id === S.bDriver, JSON.stringify(other.drivers))
    expect(!other.drivers.some((d) => S.drivers.includes(d.driver_id)), 'B sees A drivers')
    expect(own.drivers.every((d) => Object.keys(d).sort().join() === 'driver_id,name,phone_last4'), 'directory leaks more than name and last 4')
  })
  await jc('J9', "another agency's owner cannot act on this agency's records through the commands", async () => {
    expectRefusal(await call(S.B.owner, `SELECT public.agency_payroll_adjust($1::uuid, $2::uuid, 'advance', 100, 'cross agency') AS r`, [S.periodId, S.drivers[0]]), ['not found', 'access denied', 'not_found'])
    expectRefusal(await call(S.B.owner, `SELECT public.agency_invoice_record_payment($1::uuid, 100, 'upi', 'x', $2::date, 1, 'x-pay') AS r`, [S.freightId, await dayOffset(-1)]), ['not_found'])
    expectRefusal(await call(S.B.owner, `SELECT public.agency_driver_rate_set($1::uuid, 1, 1, 1, 0) AS r`, [S.drivers[0]]), 'driver_not_employed')
    expectRefusal(await call(S.B.owner, `SELECT public.agency_job_set_status($1::uuid, 'cancelled') AS r`, [S.job2]), ['not found', 'access denied'])
    expectRefusal(await call(S.B.owner, `SELECT public.agency_load_plan_approve($1::uuid, 1) AS r`, [S.plan2Id]), 'not_found')
  })
  await jc('J9', 'the dispatcher scope sees the subscription and expenses but not tax invoices, payroll or freight money', async () => {
    const u = S.disp.id
    expect(await visible(u, `SELECT count(*) AS n FROM public.subscriptions WHERE agency_id = $1`, [A.id]) === 2, 'subscription')
    expect(none(await visible(u, `SELECT count(*) AS n FROM public.subscription_invoices WHERE agency_id = $1`, [A.id])), 'tax invoices')
    expect(none(await visible(u, `SELECT count(*) AS n FROM public.agency_payroll_lines WHERE agency_id = $1`, [A.id])), 'payroll')
    expect(none(await visible(u, `SELECT count(*) AS n FROM public.agency_driver_rates WHERE agency_id = $1`, [A.id])), 'rates')
    expect((await visible(u, `SELECT count(*) AS n FROM public.agency_expenses WHERE agency_id = $1`, [A.id])) > 0, 'expenses')
  })
  await jc('J9', 'the finance scope sees tax invoices, credit notes and payroll', async () => {
    const u = S.fin.id
    expect(await visible(u, `SELECT count(*) AS n FROM public.subscription_invoices WHERE agency_id = $1`, [A.id]) === 5, 'tax invoices')
    expect(await visible(u, `SELECT count(*) AS n FROM public.subscription_credit_notes WHERE agency_id = $1`, [A.id]) === 1, 'credit notes')
    expect((await visible(u, `SELECT count(*) AS n FROM public.agency_payroll_lines WHERE agency_id = $1`, [A.id])) > 0, 'payroll')
    expect((await visible(u, `SELECT count(*) AS n FROM public.agency_driver_rates WHERE agency_id = $1`, [A.id])) > 0, 'rates')
  })
  await jc('J9', 'the viewer scope reads the subscription and freight invoices but not tax invoices or payroll', async () => {
    const u = S.viewer
    expect(await visible(u, `SELECT count(*) AS n FROM public.subscriptions WHERE agency_id = $1`, [A.id]) === 2, 'subscription')
    expect((await visible(u, `SELECT count(*) AS n FROM public.agency_invoices WHERE agency_id = $1`, [A.id])) === 1, 'freight invoice')
    expect(none(await visible(u, `SELECT count(*) AS n FROM public.subscription_invoices WHERE agency_id = $1`, [A.id])), 'tax invoices')
    expect(none(await visible(u, `SELECT count(*) AS n FROM public.agency_payroll_periods WHERE agency_id = $1`, [A.id])), 'payroll')
  })
  await jc('J9', 'every staff scope reads the entitlement; the viewer cannot read the drivers directory', async () => {
    for (const u of [S.disp.id, S.fin.id, S.viewer]) expect((await ent(u)).agency_id === A.id, 'entitlement')
    expectRefusal(await call(S.viewer, 'SELECT public.agency_driver_directory() AS r'), 'forbidden_scope')
    expectOk(await call(S.fin.id, 'SELECT public.agency_driver_directory() AS r'), 'finance directory')
  })
  await jc('J9', 'staff cannot buy, refund or reopen: the billing functions are not callable by any tenant', async () => {
    for (const u of [A.owner, S.disp.id, S.fin.id, S.viewer]) {
      const r = await call(u, `SELECT public.subscription_create_order($1::uuid, 'starter', 'monthly', NULL, 'order_hack') AS r`, [A.id])
      expect(r.raised && /permission denied/i.test(r.message), describe(r))
    }
  })
  await jc('J9', 'a member of agency A cannot start a trial for B and the agency scope never crosses', async () => {
    const r = await call(S.viewer, 'SELECT public.agency_subscription_start_trial() AS r')
    expectRefusal(r, 'forbidden_scope')
  })

  // ---- Function grants -------------------------------------------------------------------------------------------
  const AUTH_OK = [
    'agency_subscription_entitlement', 'agency_subscription_start_trial', 'subscription_usage_visible', 'has_active_subscription',
    'get_user_plan', 'check_usage_limit', 'increment_usage', 'agency_vehicle_create', 'agency_member_invite', 'agency_member_accept',
    'agency_driver_employment_create', 'agency_driver_invitation_accept', 'agency_order_import', 'agency_load_plan_approve',
    'agency_job_assign_driver', 'reserve_fleet_assignment', 'platform_billing_settings_update', 'agency_driver_directory',
  ]
  const SERVICE_ONLY = [
    'agency_subscription_state', 'subscription_next_invoice_number', 'subscription_place_of_supply', 'subscription_tax_checked',
    'subscription_tax_split', 'subscription_quote_order', 'subscription_create_order', 'subscription_activate_payment',
    'subscription_record_refund', 'subscription_support_reopen', 'subscription_verify_webhook_signature',
    'subscription_webhook_process', 'subscription_cancel_pending_order', 'run_subscription_sweeps',
  ]
  const INTERNAL = [
    'subscription_append_only_guard', 'subscriptions_guard_update', 'subscription_entitlement_snapshot', 'subscription_row_for_user',
    'agency_subscription_assert', 'agency_subscription_lock', 'platform_billing_settings_no_delete', 'subscription_invoice_counters_guard',
    'subscription_ledger_append_only', 'subscription_ledger_number_guard', 'subscription_credit_note_guard',
    'payment_history_snapshot_guard', 'subscription_note_refusal', 'subscription_note_refund_exception',
  ]
  const migrationFiles = files.filter((f) => /^2026102[6-9]|^2026103[0-2]/.test(f))
  const created = new Set()
  for (const f of migrationFiles) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8')
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_0-9]+)/gi)) created.add(m[1])
  }
  const classified = new Set([...AUTH_OK, ...SERVICE_ONLY, ...INTERNAL])
  const procs = (
    await su(
      `SELECT p.oid, p.proname, p.oid::regprocedure::text AS sig, p.proargtypes::oid[] AS argtypes,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_x,
              has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_x,
              has_function_privilege('service_role', p.oid, 'EXECUTE') AS svc_x,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS pub_x
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
        WHERE p.proname = ANY($1::text[]) ORDER BY p.proname, p.oid`,
      [[...created]]
    )
  ).rows

  await jc('J9', 'every function the migrations 20261026..20261032 create is classified in the explicit intended lists', async () => {
    const unknown = [...created].filter((n) => !classified.has(n))
    expect(unknown.length === 0, `unclassified functions: ${unknown.join(', ')}`)
    const missing = [...classified].filter((n) => !procs.some((p) => p.proname === n) && ![...created].includes(n))
    expect(missing.length === 0, `intended-list functions that do not exist: ${missing.join(', ')}`)
  })
  await jc('J9', 'the set of created functions executable by authenticated equals the intended RPC list exactly', async () => {
    const got = [...new Set(procs.filter((p) => p.auth_x).map((p) => p.proname))].sort()
    const want = [...AUTH_OK].filter((n) => created.has(n)).sort()
    const extra = got.filter((n) => !want.includes(n))
    const lost = want.filter((n) => !got.includes(n))
    expect(extra.length === 0 && lost.length === 0, `authenticated can additionally execute: [${extra.join(', ')}]; cannot execute intended: [${lost.join(', ')}]`)
  })
  await jc('J9', 'no created function is executable by anon', async () => {
    const bad = procs.filter((p) => p.anon_x).map((p) => p.sig)
    expect(bad.length === 0, `anon can execute: ${bad.join(', ')}`)
  })
  await jc('J9', 'no created function is executable by PUBLIC', async () => {
    const bad = procs.filter((p) => p.pub_x).map((p) => p.sig)
    expect(bad.length === 0, `PUBLIC can execute: ${bad.join(', ')}`)
  })
  await jc('J9', 'every service-only billing function is executable by service_role and by nobody else', async () => {
    const bad = procs.filter((p) => SERVICE_ONLY.includes(p.proname) && (!p.svc_x || p.auth_x || p.anon_x || p.pub_x)).map((p) => p.sig)
    expect(bad.length === 0, `wrong grants: ${bad.join(', ')}`)
  })
  await jc('J9', 'the internal helpers and trigger functions are executable by no API role', async () => {
    const bad = procs.filter((p) => INTERNAL.includes(p.proname) && (p.auth_x || p.anon_x || p.pub_x)).map((p) => p.sig)
    expect(bad.length === 0, `executable internals: ${bad.join(', ')}`)
  })
  await jc('J9', 'calling every service-only and internal function as authenticated is refused (permission denied)', async () => {
    const targets = procs.filter((p) => !AUTH_OK.includes(p.proname))
    const bad = []
    for (const p of targets) {
      const typeNames = (await su(`SELECT array_agg(format_type(t, NULL) ORDER BY ord) AS ts FROM unnest($1::oid[]) WITH ORDINALITY AS u(t, ord)`, [p.argtypes])).rows[0].ts ?? []
      const sql = `SELECT public.${p.proname}(${typeNames.map((t) => `NULL::${t}`).join(', ')})`
      const r = await roleCall('authenticated', sql)
      if (!(r.raised && /permission denied/i.test(r.message))) bad.push(`${p.proname}: ${r.raised ? r.message : 'executed'}`)
    }
    expect(bad.length === 0, bad.slice(0, 4).join(' ; '))
  })
  await jc('J9', 'calling every service-only function as anon is refused (permission denied)', async () => {
    const bad = []
    for (const p of procs.filter((x) => SERVICE_ONLY.includes(x.proname))) {
      const typeNames = (await su(`SELECT array_agg(format_type(t, NULL) ORDER BY ord) AS ts FROM unnest($1::oid[]) WITH ORDINALITY AS u(t, ord)`, [p.argtypes])).rows[0].ts ?? []
      const r = await roleCall('anon', `SELECT public.${p.proname}(${typeNames.map((t) => `NULL::${t}`).join(', ')})`)
      if (!(r.raised && /permission denied/i.test(r.message))) bad.push(`${p.proname}: ${r.raised ? r.message : 'executed'}`)
    }
    expect(bad.length === 0, bad.slice(0, 4).join(' ; '))
  })
  await jc('J9', 'authenticated cannot move the clock: run_subscription_sweeps is refused for a tenant', async () => {
    const r = await call(A.owner, `SELECT public.run_subscription_sweeps(now() + interval '5 years') AS r`)
    expect(r.raised && /permission denied/i.test(r.message), describe(r))
    expect((await liveSubOf(A.id)).status === 'active', 'status moved')
  })
  await jc('J9', 'a tenant cannot flip the enforcement switch (platform_billing_settings_update is admin only)', async () => {
    const r = await call(A.owner, `SELECT public.platform_billing_settings_update('x', '27ABCDE1234F1Z5', 'a', '27', '997331', false, true) AS r`)
    expect(r.raised && /forbidden/i.test(r.message), describe(r))
    expect((await suOne(`SELECT enforcement_enabled FROM public.platform_billing_settings`)).enforcement_enabled === true, 'enforcement changed')
  })

  // ---- Summary ---------------------------------------------------------------------------------------------------
  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass)
  console.log(`\n${passed}/${results.length} cases passed; ${failed.length} failed`)
  for (const f of failed) console.log(`  FAIL ${f.name} — ${f.detail}`)
  return failed.length === 0
}

/** Calls an internal function directly as the database owner (the guard is service-internal). */
async function svcOrAdmin(sql, params) {
  await actAsService()
  try {
    const res = await db.query(sql, params)
    return { raised: false, value: res.rows[0] ? Object.values(res.rows[0])[0] : null }
  } catch (error) {
    return { raised: true, code: error.code || null, message: firstLine(error), detail: parseDetail(error.detail) }
  }
}

let ok = false
try {
  ok = await main()
} catch (error) {
  console.error('FAIL: harness error:', error && error.message ? error.message : error)
  ok = false
}
process.exit(ok ? 0 : 1)
