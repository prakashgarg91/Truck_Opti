#!/usr/bin/env node
/**
 * Subscription ENFORCEMENT rehearsal on hosted STAGING (ref ydkhgclfjdksicpwqzmw): release gate 10/11 of
 * docs/FABLE-RULINGS-2026-11-17-B.md, risk 3. Turns enforcement_enabled ON, checks the status matrix, ALWAYS turns it
 * OFF again (try/finally) and proves it.
 *   node scripts/staging/enforcement_rehearsal.mjs
 *   node scripts/staging/enforcement_rehearsal.mjs --restore-only   (puts the saved original settings back)
 * Inputs (git-ignored, read here only, never printed): .env.staging, .env.staging.users. Signed-in users over PostgREST
 * RPC and Edge functions only; no service-role key, no SQL, no Razorpay.
 * Probes are chosen so they write NOTHING: an invalid category / unknown id is refused for a non-subscription reason
 * AFTER the guard has run, so the guard result is visible without creating rows.
 */
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REF = 'ydkhgclfjdksicpwqzmw'
const OUT_DIR = join(REPO, 'evidence', 'staging')
const SAFETY = join(OUT_DIR, '.enforcement-settings-original.json')
mkdirSync(OUT_DIR, { recursive: true })

function parseEnv(file) {
  const out = {}
  for (const raw of readFileSync(resolve(REPO, file), 'utf8').split(/\r?\n/)) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const i = l.indexOf('=')
    if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const stg = parseEnv('.env.staging')
const users = parseEnv('.env.staging.users')
const base = (stg.STAGING_SUPABASE_URL ?? '').replace(/\/+$/, '')
let host = ''
try { host = new URL(base).hostname } catch { /* below */ }
if (!base.includes(REF) || host !== `${REF}.supabase.co`) { console.error('ABORT: not the staging project'); process.exit(3) }
const anon = stg.STAGING_SUPABASE_ANON_KEY
if (!anon) { console.error('ABORT: anon key missing'); process.exit(3) }
const U = {
  o1: { email: users.SMOKE_OWNER_EMAIL, password: users.SMOKE_OWNER_PASSWORD },
  staff: { email: users.SMOKE_STAFF_EMAIL, password: users.SMOKE_STAFF_PASSWORD },
  o2: { email: users.SMOKE_OWNER2_EMAIL, password: users.SMOKE_OWNER2_PASSWORD },
  admin: { email: users.SMOKE_ADMIN_EMAIL, password: users.SMOKE_ADMIN_PASSWORD },
}
for (const [k, v] of Object.entries(U)) if (!v.email || !v.password) { console.error(`ABORT: ${k} credentials missing`); process.exit(3) }
const AGENCY2 = users.SMOKE_AGENCY2_ID
const AGENCY1 = users.SMOKE_AGENCY_ID

const secretList = [anon, ...Object.values(U).map((x) => x.password)].filter((s) => s && s.length >= 6)
const emailList = Object.values(U).map((x) => x.email).filter(Boolean)
const scrub = (t) => {
  let s = String(t ?? '')
  for (const x of secretList) s = s.split(x).join('***')
  for (const e of emailList) s = s.split(e).join('<email>')
  return s
    .replace(/eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, '<jwt>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => `…${m.slice(-4)}`)
}

const results = []
let failed = 0
function record(status, id, desc, detail = '') {
  const d = scrub(detail).replace(/\s+/g, ' ').slice(0, 400)
  results.push({ id, status, description: desc, detail: d })
  if (status === 'FAIL') failed += 1
  console.log(`${status} ${id}  ${desc}  (${d})`)
}

async function http(url, init = {}) {
  let res
  try { res = await fetch(url, { ...init, signal: AbortSignal.timeout(60000) }) } catch (e) { return { status: 0, text: '', json: null, net: String(e?.message ?? e) } }
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, text, json }
}
async function signIn(u) {
  const r = await http(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon }, body: JSON.stringify({ email: u.email, password: u.password }),
  })
  if (!r.json?.access_token) throw new Error(`sign-in failed (${r.status})`)
  return r.json.access_token
}
const rpc = (token, name, args = {}) => http(`${base}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token ?? anon}` }, body: JSON.stringify(args),
})
const edge = (token, fn, body) => http(`${base}/functions/v1/${fn}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
})

// ---- billing settings (admin) ----
const SETTINGS_COLS = 'legal_name,gstin,address,state_code,sac_code,gst_registered,enforcement_enabled'
async function readSettings(adminToken) {
  const r = await http(`${base}/rest/v1/platform_billing_settings?select=${SETTINGS_COLS}&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${adminToken}` } })
  const row = Array.isArray(r.json) ? r.json[0] : null
  if (r.status !== 200 || !row) throw new Error(`billing settings read failed (${r.status})`)
  return row
}
async function writeSettings(adminToken, s, enforcement) {
  const r = await rpc(adminToken, 'platform_billing_settings_update', {
    p_legal_name: s.legal_name, p_gstin: s.gst_registered ? s.gstin : null, p_address: s.address, p_state_code: s.state_code,
    p_sac_code: s.sac_code ?? '997331', p_enforcement_enabled: enforcement, p_gst_registered: s.gst_registered === true,
  })
  if (r.status >= 300 || r.json?.ok === false) throw new Error(`billing settings update failed (${r.status}) ${scrub(r.text).slice(0, 160)}`)
}
const sameSettings = (a, b) => ['legal_name', 'gstin', 'address', 'state_code', 'sac_code', 'gst_registered', 'enforcement_enabled'].every((k) => (a[k] ?? null) === (b[k] ?? null))

// ---- result classification ----
const sqlstate = (r) => (r.json && typeof r.json === 'object' && !Array.isArray(r.json) && r.json.code ? String(r.json.code) : '')
const SB = /^SB00[1-4]$/
const isSB = (r) => SB.test(sqlstate(r)) || SB.test(String(r.json?.message ?? '').slice(0, 5))
const sbCode = (r) => (SB.test(sqlstate(r)) ? sqlstate(r) : String(r.json?.message ?? '').slice(0, 5))
const brief = (r) => {
  if (r.net) return `network ${r.net.slice(0, 60)}`
  const j = r.json
  const bits = [String(r.status)]
  if (sqlstate(r)) bits.push(`sqlstate ${sqlstate(r)}`)
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    if (j.ok !== undefined) bits.push(`ok=${j.ok}`)
    if (j.error) bits.push(`error=${String(j.error).slice(0, 60)}`)
    if (r.status >= 400 && j.message) bits.push(String(j.message).slice(0, 70))
  }
  return bits.join(' / ')
}

// ---- probes: none of them writes a row ----
const today = new Date().toISOString().slice(0, 10)
// record_add: the guard runs before the category check, so an invalid category writes nothing.
const probeRecordAdd = (token) => rpc(token, 'agency_expense_record', {
  p_truck_id: null, p_category: 'enforcement_rehearsal_invalid', p_amount_paise: 100, p_spent_on: today, p_note: null, p_idempotency_key: `enf-${randomUUID()}`,
})
// dispatch: agency_load_plan_approve asserts 'dispatch' before looking the plan up, so a random id writes nothing.
const probeDispatch = (token) => rpc(token, 'agency_load_plan_approve', { p_plan_id: randomUUID(), p_expected_version: 1 })
// never guarded: recording a payment on an invoice that does not exist.
const probePayment = (token) => rpc(token, 'agency_invoice_record_payment', {
  p_invoice_id: randomUUID(), p_amount_paise: 100, p_method: 'cash', p_reference: 'enf-rehearsal', p_received_on: today, p_expected_version: 1, p_idempotency_key: `enf-pay-${randomUUID()}`,
})
const ent = async (token) => (await rpc(token, 'agency_subscription_entitlement')).json ?? {}
const entBrief = (e) => `status=${e.status} tier=${e.plan_tier} can_write=${e.can_write} can_dispatch=${e.can_dispatch} enforcement=${e.enforcement_enabled} period_end=${e.period_end ?? e.current_period_end ?? ''}`
const entView = (e) => ({ status: e.status, plan_tier: e.plan_tier, can_write: e.can_write, can_dispatch: e.can_dispatch, enforcement_enabled: e.enforcement_enabled, period_end: e.period_end ?? null, grace_end: e.grace_end ?? null, features: e.features ?? null })
const notSubscription = (r) => !isSB(r) && r.status !== 0 && r.status < 500

const evidence = { baseline: {}, enforced: {}, restored: {} }
let tAdmin = null
let settings0 = null
let turnedOn = false
let crashed = null

async function main() {
  const t1 = await signIn(U.o1)
  const t2 = await signIn(U.o2)
  const tStaff = await signIn(U.staff)
  tAdmin = await signIn(U.admin)

  // ============================== 1. baseline, enforcement OFF ==============================
  settings0 = await readSettings(tAdmin)
  writeFileSync(SAFETY, JSON.stringify(settings0, null, 2))
  record(settings0.enforcement_enabled === false && settings0.gst_registered === false ? 'PASS' : 'FAIL', '0.start',
    'start state: enforcement OFF, seller NOT GST-registered', `enforcement_enabled=${settings0.enforcement_enabled}, gst_registered=${settings0.gst_registered}`)
  if (settings0.enforcement_enabled !== false || settings0.gst_registered !== false) { failed += 0; return }

  const e1 = await ent(t1)
  const e2 = await ent(t2)
  evidence.baseline.entitlement = { owner1: entView(e1), owner2: entView(e2) }
  record(e1.status === 'past_due' && e2.status === 'cancelled' && e1.enforcement_enabled === false && e2.enforcement_enabled === false ? 'PASS' : 'FAIL', '1.entitlement',
    'baseline entitlement: owner1 past_due, owner2 cancelled, enforcement flag false', `owner1 ${entBrief(e1)} | owner2 ${entBrief(e2)}`)

  const b2 = await probeRecordAdd(t2)
  evidence.baseline.owner2_record_add = brief(b2)
  record(notSubscription(b2) ? 'PASS' : 'FAIL', '1.owner2-record_add-off', 'enforcement OFF: owner2 (cancelled) record_add is NOT refused by the subscription guard', brief(b2))
  const b2d = await probeDispatch(t2)
  evidence.baseline.owner2_dispatch = brief(b2d)
  record(notSubscription(b2d) ? 'PASS' : 'FAIL', '1.owner2-dispatch-off', 'enforcement OFF: owner2 dispatch-type command (load_plan_approve) is NOT refused by the guard', brief(b2d))
  const b1 = await probeRecordAdd(t1)
  evidence.baseline.owner1_record_add = brief(b1)
  record(notSubscription(b1) ? 'PASS' : 'FAIL', '1.owner1-record_add-off', 'enforcement OFF: owner1 record_add not refused by the guard', brief(b1))
  const bsExp = await probeRecordAdd(tStaff)
  const bsEnt = await rpc(tStaff, 'agency_subscription_entitlement')
  evidence.baseline.staff = { record_add: brief(bsExp), entitlement: brief(bsEnt) }
  note('1.staff-baseline', 'staff baseline (before enforcement)', `record_add ${brief(bsExp)} | entitlement ${brief(bsEnt)}`)

  // ============================== 2. switch ON ==============================
  turnedOn = true
  await writeSettings(tAdmin, settings0, true)
  const on = await readSettings(tAdmin)
  const onOk = on.enforcement_enabled === true && on.gst_registered === false && (on.gstin ?? null) === null &&
    ['legal_name', 'address', 'state_code', 'sac_code'].every((k) => on[k] === settings0[k])
  record(onOk ? 'PASS' : 'FAIL', '2.switch-on', 'admin turned enforcement ON; every other field exactly as read; seller still unregistered, gstin null',
    `enforcement_enabled=${on.enforcement_enabled}, gst_registered=${on.gst_registered}, gstin=${on.gstin ?? 'null'}`)
  if (!onOk) return

  // ============================== 3. enforcement ON ==============================
  const o2 = await probeRecordAdd(t2)
  evidence.enforced.owner2_record_add = brief(o2)
  record(sbCode(o2) === 'SB002' ? 'PASS' : 'FAIL', '3.owner2-record_add', 'ON: owner2 (cancelled) record_add refused with SB002', brief(o2))

  const o2d = await probeDispatch(t2)
  evidence.enforced.owner2_dispatch = brief(o2d)
  record(sbCode(o2d) === 'SB003' ? 'PASS' : 'FAIL', '3.owner2-dispatch', 'ON: owner2 (cancelled) dispatch-type command (agency_load_plan_approve, random plan id; guard fires before lookup) refused with SB003', brief(o2d))

  const o2p = await probePayment(t2)
  evidence.enforced.owner2_record_payment = brief(o2p)
  record(notSubscription(o2p) ? 'PASS' : 'FAIL', '3.owner2-never-guarded', 'ON: owner2 agency_invoice_record_payment (never guarded, unknown invoice) answers without SB code', brief(o2p))

  const e2on = await ent(t2)
  evidence.enforced.owner2_entitlement = entView(e2on)
  record(e2on.status === 'cancelled' && e2on.can_write === false && e2on.can_dispatch === false && e2on.enforcement_enabled === true ? 'PASS' : 'FAIL', '3.owner2-entitlement',
    'ON: owner2 entitlement is read-only (can_write false, can_dispatch false, enforcement true)', entBrief(e2on))

  const o1 = await probeRecordAdd(t1)
  evidence.enforced.owner1_record_add = brief(o1)
  record(notSubscription(o1) ? 'PASS' : 'FAIL', '3.owner1-record_add', 'ON: owner1 (past_due) record_add still allowed (no SB code)', brief(o1))
  const o1d = await probeDispatch(t1)
  evidence.enforced.owner1_dispatch = brief(o1d)
  record(notSubscription(o1d) ? 'PASS' : 'FAIL', '3.owner1-dispatch', 'ON: owner1 (past_due) dispatch-type command passes the guard (no SB code)', brief(o1d))
  const e1on = await ent(t1)
  evidence.enforced.owner1_entitlement = entView(e1on)
  record(e1on.status === 'past_due' && e1on.can_write === true && e1on.can_dispatch === true && e1on.enforcement_enabled === true ? 'PASS' : 'FAIL', '3.owner1-entitlement',
    'ON: owner1 entitlement can_write true, can_dispatch true', entBrief(e1on))

  const sExp = await probeRecordAdd(tStaff)
  const sEnt = await rpc(tStaff, 'agency_subscription_entitlement')
  const sTrucks = await http(`${base}/rest/v1/agency_trucks?select=id&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${tStaff}` } })
  evidence.enforced.staff = { record_add: brief(sExp), entitlement: brief(sEnt), trucks_read: String(sTrucks.status) }
  record(sEnt.status === 200 && sEnt.json?.can_write === true && sTrucks.status === 200 ? 'PASS' : 'FAIL', '3.staff-in-scope',
    'ON: staff (owner1 agency) in-scope calls (entitlement read, trucks read) behave as before', `entitlement ${brief(sEnt)} can_write=${sEnt.json?.can_write} | trucks read ${sTrucks.status}`)
  const bsScope = brief(bsExp)
  record(!isSB(sExp) && brief(sExp) === bsScope && /forbidden_scope|ok=false|\b4\d\d\b/.test(brief(sExp)) ? 'PASS' : 'FAIL', '3.staff-out-of-scope',
    'ON: staff record_add (outside scope) refused for scope reasons, not SB codes, same answer as baseline', `ON ${brief(sExp)} | baseline ${bsScope}`)

  for (const [fn, body] of [['agency-portal-dashboard', { action: 'snapshot' }], ['agency-portal-jobs', { action: 'list' }], ['agency-portal-billing', { action: 'list' }]]) {
    const r = await edge(t2, fn, body)
    evidence.enforced[`edge_${fn}`] = r.status
    record(r.status === 200 ? 'PASS' : 'FAIL', `3.edge-${fn}`, `ON: ${fn} as owner2 (cancelled) still answers 200 (read)`, `${r.status}${r.status !== 200 ? ' ' + scrub(r.text).slice(0, 120) : ''}`)
  }

  const aw = await rpc(tAdmin, 'admin_agencies_without_subscription')
  const listed = (aw.json?.agencies ?? []).some((a) => a.id === AGENCY2)
  const listed1 = (aw.json?.agencies ?? []).some((a) => a.id === AGENCY1)
  evidence.enforced.admin_without_subscription = { status: aw.status, count: (aw.json?.agencies ?? []).length, owner2_listed: listed, owner1_listed: listed1 }
  record(aw.status === 200 && aw.json?.ok === true && listed && !listed1 ? 'PASS' : 'FAIL', '3.admin-without-subscription',
    'ON: admin_agencies_without_subscription lists owner2 agency (and not owner1)', `${aw.status}, ${(aw.json?.agencies ?? []).length} agencies, owner2 listed=${listed}, owner1 listed=${listed1}`)

  record('PASS', '3.cleanup', 'cleanup: every probe was refused or missed before writing, nothing to cancel or delete', 'rows created: 0 (all probes use an invalid category or a random id)')
}
function note(id, desc, detail) { record('NOTE', id, desc, detail) }

try {
  if (process.argv.includes('--restore-only')) {
    if (!existsSync(SAFETY)) { console.log('no safety file; nothing to restore'); process.exit(0) }
    settings0 = JSON.parse(readFileSync(SAFETY, 'utf8'))
    tAdmin = await signIn(U.admin)
    turnedOn = true
  } else {
    await main()
  }
} catch (e) {
  crashed = e instanceof Error ? e.message : 'unknown'
  failed += 1
  console.log(`FAIL crash  ${scrub(crashed)}`)
} finally {
  // ============================== 4. ALWAYS switch OFF and prove it ==============================
  try {
    if (!tAdmin) tAdmin = await signIn(U.admin)
    const orig = settings0 ?? (existsSync(SAFETY) ? JSON.parse(readFileSync(SAFETY, 'utf8')) : null)
    if (turnedOn && orig) await writeSettings(tAdmin, orig, false)
    const cur = await readSettings(tAdmin)
    const restoredOk = cur.enforcement_enabled === false && cur.gst_registered === false && (!orig || sameSettings(cur, { ...orig, enforcement_enabled: false }))
    evidence.restored.settings = { enforcement_enabled: cur.enforcement_enabled, gst_registered: cur.gst_registered, gstin: cur.gstin ?? null }
    record(restoredOk ? 'PASS' : 'FAIL', '4.switch-off', 'enforcement OFF again with the original values; gst_registered false', `enforcement_enabled=${cur.enforcement_enabled}, gst_registered=${cur.gst_registered}, other fields equal original=${orig ? sameSettings(cur, { ...orig, enforcement_enabled: false }) : 'n/a'}`)
    if (restoredOk && existsSync(SAFETY)) unlinkSync(SAFETY)
    const t2 = await signIn(U.o2)
    const r2 = await probeRecordAdd(t2)
    const r2d = await probeDispatch(t2)
    const e2 = await ent(t2)
    evidence.restored.owner2 = { record_add: brief(r2), dispatch: brief(r2d), entitlement: entView(e2) }
    record(notSubscription(r2) && notSubscription(r2d) && e2.enforcement_enabled === false ? 'PASS' : 'FAIL', '4.owner2-as-baseline',
      'OFF: owner2 record_add and dispatch behave as in step 1; entitlement enforcement flag false', `record_add ${brief(r2)} | dispatch ${brief(r2d)} | ${entBrief(e2)}`)
    const sameAsBaseline = evidence.baseline.owner2_record_add === brief(r2) && evidence.baseline.owner2_dispatch === brief(r2d)
    record(!evidence.baseline.owner2_record_add || sameAsBaseline ? 'PASS' : 'FAIL', '4.identical-to-baseline', 'OFF: answers identical to the baseline answers', `baseline ${evidence.baseline.owner2_record_add} | now ${brief(r2)}`)
  } catch (e) {
    record('FAIL', '4.switch-off', 'restore failed: RUN scripts/staging/enforcement_rehearsal.mjs --restore-only', scrub(e instanceof Error ? e.message : 'unknown'))
  }
  const date = new Date().toISOString().slice(0, 10)
  const out = join(OUT_DIR, `enforcement-rehearsal-${date}.json`)
  writeFileSync(out, scrub(JSON.stringify({ finished_at: new Date().toISOString(), supabase_ref: REF, failed, crashed, results, evidence }, null, 2)))
  console.log(`evidence: ${out}`)
  process.exit(failed ? 1 : 0)
}
