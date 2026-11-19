#!/usr/bin/env node
/**
 * Proof A (failed payment, then retry) and Proof B (seller GST switch flips between order and payment)
 * against the hosted STAGING Supabase project (ref ydkhgclfjdksicpwqzmw), Razorpay TEST mode only.
 *   node scripts/staging/failed_and_flip_proof.mjs [--headed]
 *   node scripts/staging/failed_and_flip_proof.mjs --restore-only     (puts the saved original billing settings back)
 * Drives the already-running app at http://localhost:5198 with Playwright. Reads .env.proof, .env.staging,
 * .env.staging.users inside this script only. Prints/writes NO secret; ids are redacted to the last 4 characters.
 * Max 4 Razorpay test orders (this script creates 3 when everything works: A fail, A retry, B pending).
 * Billing settings are ALWAYS restored in a finally block; the original is also saved to a local safety file
 * (evidence/staging/.billing-settings-original.json) which is removed once the restore is verified.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const REF = 'ydkhgclfjdksicpwqzmw'
const APP = 'http://localhost:5198'
const PHONE = '9000090000'
const OUT_DIR = join(REPO, 'evidence', 'staging')
const SHOTS = join(OUT_DIR, 'failed-and-flip')
const SAFETY = join(OUT_DIR, '.billing-settings-original.json')
mkdirSync(SHOTS, { recursive: true })
const headed = process.argv.includes('--headed')
const restoreOnly = process.argv.includes('--restore-only')
const MAX_ORDERS = 4

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
const proof = parseEnv('.env.proof')
const stg = parseEnv('.env.staging')
const users = parseEnv('.env.staging.users')
const keyId = proof.RAZORPAY_KEY_ID ?? ''
if (!keyId.startsWith('rzp_test_')) { console.error('ABORT: RAZORPAY_KEY_ID must start with rzp_test_'); process.exit(3) }
const keySecret = proof.RAZORPAY_KEY_SECRET
const whSecret = proof.RAZORPAY_WEBHOOK_SECRET
const base = (stg.STAGING_SUPABASE_URL ?? '').replace(/\/+$/, '')
if (new URL(base).hostname !== `${REF}.supabase.co`) { console.error('ABORT: not the staging project'); process.exit(3) }
const anon = stg.STAGING_SUPABASE_ANON_KEY
const U = {
  o1: { email: users.SMOKE_OWNER_EMAIL, password: users.SMOKE_OWNER_PASSWORD },
  o2: { email: users.SMOKE_OWNER2_EMAIL, password: users.SMOKE_OWNER2_PASSWORD },
  admin: { email: users.SMOKE_ADMIN_EMAIL, password: users.SMOKE_ADMIN_PASSWORD },
}
for (const [k, v] of Object.entries(U)) if (!v.email || !v.password) { console.error(`ABORT: ${k} credentials missing`); process.exit(3) }

const secretList = [keySecret, whSecret, anon, U.o1.password, U.o2.password, U.admin.password].filter((s) => s && s.length >= 6)
const emailList = [U.o1.email, U.o2.email, U.admin.email].filter(Boolean)
const last4 = (s) => `…${String(s).slice(-4)}`
const scrub = (t) => {
  let s = String(t ?? '')
  for (const x of secretList) s = s.split(x).join('***')
  for (const e of emailList) s = s.split(e).join('<email>')
  return s
    .replace(/rzp_(test|live)_\w+/g, 'rzp_$1_…')
    .replace(/\b(order|pay|rfnd)_[A-Za-z0-9]{10,}\b/g, (m) => `${m.slice(0, m.indexOf('_') + 1)}${last4(m)}`)
    .replace(/\bevt_[A-Za-z0-9_]{8,}\b/g, (m) => `evt_${last4(m)}`)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, (m) => last4(m))
}

const results = []
let failed = 0
function record(id, status, desc, detail = '', extra = {}) {
  const d = scrub(detail)
  results.push({ id, status, description: desc, detail: d, ...extra })
  if (status === 'FAIL') failed += 1
  console.log(`${status} ${id}  ${desc}  (${d})`)
}
const pass = (id, ok, desc, detail, extra) => record(id, ok ? 'PASS' : 'FAIL', desc, detail, extra)
const note = (id, desc, detail, extra) => record(id, 'NOTE', desc, detail, extra)

async function http(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30000) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, text, json }
}
async function signIn(email, password) {
  const r = await http(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon }, body: JSON.stringify({ email, password }),
  })
  if (!r.json?.access_token) throw new Error(`sign-in failed (${r.status})`)
  return r.json.access_token
}
const rpc = (token, name, args = {}) => http(`${base}/rest/v1/rpc/${name}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(args),
})
const rzp = (path) => http(`https://api.razorpay.com/v1${path}`, { headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}` } })

async function snapshot(token) {
  const ent = (await rpc(token, 'agency_subscription_entitlement')).json ?? {}
  const inv = (await rpc(token, 'agency_subscription_invoices')).json?.invoices ?? []
  return {
    status: ent.status, planTier: ent.plan_tier, periodEnd: ent.period_end, canWrite: ent.can_write,
    invoices: inv.map((i) => ({
      number: i.invoice_number, total: i.total_paise, taxable: i.taxable_paise, cgst: i.cgst_paise, sgst: i.sgst_paise, igst: i.igst_paise,
      credit_notes: (i.credit_notes ?? []).map((c) => ({ number: c.credit_note_number, total: c.total_paise })),
    })),
  }
}
const brief = (s) => `${s.status}, ${s.planTier}, ${s.invoices.length} invoice(s) [${s.invoices.map((i) => `${i.number} ${i.total}/tax ${(i.cgst ?? 0) + (i.sgst ?? 0) + (i.igst ?? 0)}`).join('; ')}], period end ${s.periodEnd}`
const daysFromNow = (iso) => (new Date(iso).getTime() - Date.now()) / 86400000

// ---- webhook delivery (signed) ----
const sign = (raw) => createHmac('sha256', whSecret).update(raw).digest('hex')
const runId = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`
let evtN = 0
async function webhook(payload) {
  const raw = JSON.stringify(payload)
  const id = `evt_ff_${runId}_${++evtN}`
  const r = await http(`${base}/functions/v1/razorpay-webhook`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-event-id': id, 'x-razorpay-signature': sign(raw) }, body: raw,
  })
  return { ...r, eventId: id }
}
const now = () => Math.floor(Date.now() / 1000)
const paymentEvent = (event, entity) => ({
  entity: 'event', account_id: 'acc_failedflipproof', event, contains: ['payment'],
  payload: { payment: { entity: { entity: 'payment', currency: 'INR', method: 'netbanking', ...entity } } },
  created_at: now(),
})

// ---- billing settings (admin, over PostgREST) ----
const SETTINGS_COLS = 'legal_name,gstin,address,state_code,sac_code,gst_registered,enforcement_enabled'
async function readSettings(adminToken) {
  const r = await http(`${base}/rest/v1/platform_billing_settings?select=${SETTINGS_COLS}&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${adminToken}` } })
  const row = Array.isArray(r.json) ? r.json[0] : null
  if (r.status !== 200 || !row) throw new Error(`billing settings read failed (${r.status})`)
  return row
}
async function writeSettings(adminToken, s) {
  const r = await rpc(adminToken, 'platform_billing_settings_update', {
    p_legal_name: s.legal_name, p_gstin: s.gst_registered ? s.gstin : null, p_address: s.address, p_state_code: s.state_code,
    p_sac_code: s.sac_code ?? '997331', p_enforcement_enabled: s.enforcement_enabled === true, p_gst_registered: s.gst_registered,
  })
  if (r.status >= 300) throw new Error(`billing settings update failed (${r.status}) ${scrub(r.text).slice(0, 160)}`)
}
const sameSettings = (a, b) => ['legal_name', 'gstin', 'address', 'state_code', 'sac_code', 'gst_registered', 'enforcement_enabled'].every((k) => (a[k] ?? null) === (b[k] ?? null))
const gstFlag = async () => (await rpc(null, 'platform_gst_registered')).json

async function restoreFromSafety(adminToken) {
  if (!existsSync(SAFETY)) return null
  const orig = JSON.parse(readFileSync(SAFETY, 'utf8'))
  await writeSettings(adminToken, orig)
  const cur = await readSettings(adminToken)
  const ok = sameSettings(cur, orig) && (await gstFlag()) === false
  if (ok) unlinkSync(SAFETY)
  return { ok, cur }
}

// ---- browser helpers ----
let chromium
const sessions = []
async function openSession(who) {
  const browser = await chromium.launch({ headless: !headed })
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const net = { creates: [], verifies: [], keys: new Set(), live: false }
  const attach = (p) => {
    p.on('request', (r) => {
      for (const k of `${r.url()} ${r.postData() ?? ''}`.match(/rzp_(test|live)_\w+/g) ?? []) {
        net.keys.add(k.slice(0, 9))
        if (k.startsWith('rzp_live_')) net.live = true
      }
    })
    p.on('response', async (r) => {
      const u = r.url()
      try {
        if (u.includes('/functions/v1/create-razorpay-order')) net.creates.push({ status: r.status(), body: await r.json().catch(() => null) })
        if (u.includes('/functions/v1/verify-razorpay-payment')) net.verifies.push({ status: r.status(), body: await r.json().catch(() => null) })
      } catch { /* ignore */ }
    })
  }
  attach(page)
  context.on('page', attach)
  const s = { who, browser, context, page, net }
  sessions.push(s)
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com or login ID').fill(U[who].email)
  await page.getByPlaceholder('Enter your password').fill(U[who].password)
  await page.getByRole('button', { name: 'Sign In with Password' }).click()
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 })
  return s
}
let shotNo = 0
const shot = async (s, name) => { shotNo += 1; try { await s.page.screenshot({ path: join(SHOTS, `${String(shotNo).padStart(2, '0')}-${s.who}-${name}.png`) }) } catch { /* closed */ } }
const bodyText = (s) => s.page.evaluate(() => document.body.innerText).catch(() => '')
const flat = (t) => scrub(t).replace(/\s+/g, ' ').trim()
const alerts = (s) => s.page.evaluate(() => [...document.querySelectorAll('[role=alert]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => [])

let ordersCreated = 0
/** Open /checkout and press "Continue to payment". Returns the order response (or null). */
async function startCheckout(s, plan, billing) {
  await s.page.goto(`${APP}/checkout?plan=${plan}&billing=${billing}`, { waitUntil: 'domcontentloaded' })
  await s.page.getByText('Test mode is active').first().waitFor({ timeout: 30000 }).catch(() => {})
  await s.page.waitForTimeout(1500)
  const txt = await bodyText(s)
  const info = { banner: txt.includes('Test mode is active'), nogst: txt.includes('No GST charged') }
  await s.page.getByPlaceholder('9876543210').fill(PHONE)
  const emailBox = s.page.locator('#checkout-email')
  if (!(await emailBox.inputValue().catch(() => ''))) await emailBox.fill(U[s.who].email)
  if (ordersCreated >= MAX_ORDERS) throw new Error('order cap reached')
  const before = s.net.creates.length
  await s.page.getByRole('button', { name: 'Continue to payment' }).click()
  for (let i = 0; i < 60 && s.net.creates.length === before; i++) await s.page.waitForTimeout(500)
  const created = s.net.creates[before] ?? null
  if (created?.status === 200) ordersCreated += 1
  return { txt, info, created }
}

const rzFrame = (s) => s.page.frames().find((f) => f.url().includes('api.razorpay.com/v1/checkout'))
const frameInfo = async (f) => f.evaluate(() => ({ text: (document.body?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 600) })).catch(() => ({ text: '' }))

/** mode: 'stop' (until the window is open), 'success' or 'failure' (press the simulator button). */
async function drive(s, mode, maxMs = 150000) {
  const { page, context, net } = s
  const simRe = mode === 'failure' ? /^failure$/i : /^success$/i
  const deadline = Date.now() + maxMs
  let bankPicked = false
  let lastText = ''
  let same = 0
  while (Date.now() < deadline) {
    await page.waitForTimeout(2500)
    if (net.live || (net.keys.size > 0 && ![...net.keys].every((k) => k === 'rzp_test_'))) throw new Error('non-test Razorpay key seen')
    for (const pp of context.pages().filter((p) => p !== page && !p.isClosed())) {
      if (mode === 'stop') continue
      const ok = pp.getByRole('button', { name: simRe }).or(pp.getByText(simRe)).first()
      if (await ok.count()) { await ok.click({ timeout: 5000 }).catch(() => {}); return 'clicked' }
    }
    const f = rzFrame(s)
    if (!f) continue
    const { text: t } = await frameInfo(f)
    if (!t) continue
    if (mode === 'stop') {
      if (!net.keys.has('rzp_test_')) throw new Error('could not confirm rzp_test_ key in network')
      return 'open'
    }
    same = t === lastText ? same + 1 : 0
    lastText = t
    if (same >= 8) throw new Error(`Razorpay window stuck: ${scrub(t).slice(0, 160)}`)
    const tryClick = async (l) => { if (await l.count().catch(() => 0)) { await l.click({ timeout: 5000 }).catch(() => {}); return true } return false }
    const phoneInput = f.locator('input[name="contact"], input[type="tel"], input[placeholder*="obile" i]').first()
    if (/contact details/i.test(t) && (await phoneInput.count())) {
      await phoneInput.click({ clickCount: 3 }).catch(() => {})
      await phoneInput.fill('').catch(() => {})
      await phoneInput.fill(PHONE).catch(() => {})
      const em = f.locator('input[type="email"], input[name="email"]').first()
      if ((await em.count()) && !(await em.inputValue().catch(() => ''))) await em.fill(U[s.who].email).catch(() => {})
      await tryClick(f.getByRole('button', { name: /^Continue$/i }).first())
      continue
    }
    if (/Success/.test(t) && /Failure/.test(t)) {
      if (await tryClick(f.getByRole('button', { name: simRe }).or(f.getByText(simRe)).first())) return 'clicked'
    }
    if (/Suggested Banks|All Banks/i.test(t) && !bankPicked) {
      if (await tryClick(f.getByText(/^Canara Bank$/).first()) || await tryClick(f.getByText(/^IDBI$/).first())) { bankPicked = true; continue }
    }
    if (bankPicked) {
      if (await tryClick(f.getByRole('button', { name: /^(Pay|Continue|Proceed)/i }).first())) { await page.waitForTimeout(3000); continue }
    }
    if (/Netbanking/i.test(t) && !/Suggested Banks|All Banks/i.test(t)) {
      if (await tryClick(f.getByText(/^Netbanking$/).first())) continue
    }
    if (/Continue/i.test(t)) await tryClick(f.getByRole('button', { name: /^Continue$/i }).first())
  }
  return 'timeout'
}
const waitFor = async (fn, ms, step = 1000) => { const end = Date.now() + ms; for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return null; await new Promise((r) => setTimeout(r, step)) } }

// =====================================================================================================
async function main() {
  console.log(`failed-and-flip proof run ${runId}  target ${new URL(base).host}  razorpay key TEST ${last4(keyId)}`)
  ;({ chromium } = await import('playwright'))
  const t1 = await signIn(U.o1.email, U.o1.password)
  const t2 = await signIn(U.o2.email, U.o2.password)
  const tAdmin = await signIn(U.admin.email, U.admin.password)

  const pre1 = await snapshot(t1)
  const pre2 = await snapshot(t2)
  const settings0 = await readSettings(tAdmin)
  pass('0', pre2.status === 'cancelled' && pre2.invoices.length === 1 && pre1.status === 'active' && pre1.invoices.length === 1 && settings0.gst_registered === false && (await gstFlag()) === false,
    'start state: owner1 active 1 invoice, owner2 cancelled 1 invoice, seller NOT GST-registered',
    `owner1 ${brief(pre1)} | owner2 ${brief(pre2)} | gst_registered=${settings0.gst_registered}`)
  if (failed) return
  if (settings0.gst_registered !== false) return

  // ============================ PROOF A ============================
  const s2 = await openSession('o2')
  proofA: {
  const a1 = await startCheckout(s2, 'starter', 'monthly')
  await shot(s2, 'checkout-starter')
  pass('A1', /Starter plan/.test(a1.txt) && a1.txt.includes('₹499') && a1.info.nogst && a1.info.banner,
    'owner2 checkout shows Starter, Rs 499, "No GST charged", test-mode banner', `info=${JSON.stringify(a1.info)}, price shown=${a1.txt.includes('₹499')}`)
  const ca = a1.created
  pass('A2', ca?.status === 200 && ca.body?.amount === 49900 && ca.body?.gst_registered === false && ca.body?.gst_rate_pct === 0,
    'create-razorpay-order: 49900 paise, gst_registered=false, rate 0', `status ${ca?.status}, amount ${ca?.body?.amount}, gst_registered ${ca?.body?.gst_registered}, rate ${ca?.body?.gst_rate_pct}, order ${ca?.body?.id ? last4(ca.body.id) : 'none'}${ca?.status !== 200 ? ` body=${JSON.stringify(ca?.body)} alerts=${JSON.stringify(await alerts(s2))}` : ''}`)
  if (ca?.status !== 200) { note('A-skipped', 'Proof A could not start: the app refuses a new order for the cancelled/refunded agency (finding); Proof B continues independently', JSON.stringify(ca?.body)); break proofA }
  const orderFail = ca.body.id
  const dr1 = await drive(s2, 'stop')
  note('A3', 'Razorpay window opened (TEST key only)', `drive=${dr1}, keys=${[...s2.net.keys].join(',')}`)
  const dfail = await drive(s2, 'failure')
  pass('A4', dfail === 'clicked', 'simulator FAILURE button clicked', `drive=${dfail}`)
  // what the customer sees
  const failAlert = await waitFor(async () => { const a = await alerts(s2); return a.length ? a : null }, 25000)
  await s2.page.waitForTimeout(3000)
  const failText = await bodyText(s2)
  await shot(s2, 'after-failure')
  const failBodyFlat = flat(failText)
  pass('A5', !!failAlert && !/plan is active/i.test(failText),
    'app shows a failure message (role=alert), NOT "active"', `alert=${JSON.stringify(failAlert)}; page shows "Continue to payment" button: ${/Continue to payment/.test(failText)}`,
    { customer_failure_text: failAlert })
  const v1 = s2.net.verifies
  pass('A6', v1.length === 0 || v1.every((v) => v.status >= 400 && v.status < 500), 'verify-razorpay-payment not called (or clean 4xx) after the failure',
    v1.length === 0 ? 'not called' : JSON.stringify(v1.map((v) => ({ status: v.status, state: v.body?.state, message: v.body?.message }))))
  const afterFail2 = await snapshot(t2)
  pass('A7', afterFail2.status === 'cancelled' && afterFail2.invoices.length === 1 && afterFail2.invoices[0].number === pre2.invoices[0].number,
    'owner2 still cancelled, invoice count unchanged (1)', brief(afterFail2))
  // payment id of the failed attempt, from Razorpay itself (test key)
  const op = await rzp(`/orders/${orderFail}/payments`)
  const attempts = op.json?.items ?? []
  const failedPay = attempts.find((p) => p.status === 'failed') ?? attempts[0]
  note('A8', 'Razorpay-side attempts on the failed order', `${op.status}; ${attempts.map((p) => `${last4(p.id)} ${p.status} ${p.method} ${p.error_code ?? ''}`).join(' | ') || 'none'}`)
  const failedPayId = failedPay?.id ?? `pay_ff${runId}`.replace(/[^A-Za-z0-9_]/g, '').slice(0, 24)
  const wf = await webhook(paymentEvent('payment.failed', {
    id: failedPayId, amount: 49900, status: 'failed', order_id: orderFail, error_code: 'BAD_REQUEST_ERROR', error_description: 'Payment failed (test)',
  }))
  const afterWf2 = await snapshot(t2)
  pass('A9', wf.status >= 200 && wf.status < 300 && afterWf2.status === 'cancelled' && afterWf2.invoices.length === 1,
    'signed payment.failed webhook for that order -> 2xx, nothing activates', `${wf.status} ${scrub(wf.text).slice(0, 120)}; ${brief(afterWf2)}`)

  // retry -> SUCCESS (a fresh app checkout; the failed order stays failed)
  const a2 = await startCheckout(s2, 'starter', 'monthly')
  const cr = a2.created
  pass('A10', cr?.status === 200 && cr.body?.amount === 49900 && cr.body?.gst_registered === false,
    'retry: create-razorpay-order again (49900, unregistered)', `status ${cr?.status}, order ${cr?.body?.id ? last4(cr.body.id) : 'none'}, same order as failed one: ${cr?.body?.id === orderFail}`)
  if (cr?.status !== 200) break proofA
  const orderRetry = cr.body.id
  const vBefore = s2.net.verifies.length
  const dsucc = await drive(s2, 'success')
  pass('A11', dsucc === 'clicked', 'simulator SUCCESS button clicked on the retry', `drive=${dsucc}`)
  await waitFor(async () => s2.net.verifies.length > vBefore, 40000, 500)
  const vA = s2.net.verifies[vBefore]
  pass('A12', vA?.status === 200 && vA.body?.success === true && vA.body?.state === 'active', 'verify-razorpay-payment on the retry -> 200 active',
    vA ? `${vA.status} ${JSON.stringify({ state: vA.body?.state, message: vA.body?.message })}` : 'no verify call seen')
  await waitFor(async () => /plan is active/.test(await bodyText(s2)), 60000, 1500)
  const doneText = flat(await bodyText(s2))
  await shot(s2, 'after-retry-success')
  const post2 = await snapshot(t2)
  const newInv = post2.invoices.find((i) => i.number !== pre2.invoices[0].number)
  const dEnd = post2.periodEnd ? daysFromNow(post2.periodEnd) : NaN
  pass('A13', /plan is active/.test(doneText), 'app shows "plan is active" after the retry', doneText.slice(0, 160))
  pass('A14', post2.status === 'active' && post2.planTier === 'starter' && post2.invoices.length === 2 && newInv?.number === 'TO/26-27/000003' &&
    newInv.total === 49900 && newInv.taxable === 49900 && (newInv.cgst ?? 0) + (newInv.sgst ?? 0) + (newInv.igst ?? 0) === 0 && dEnd > 27 && dEnd < 32,
    'owner2 active on Starter; NEW invoice TO/26-27/000003, 49900 paise, zero tax, period end ~1 month', `${brief(post2)}; period end in ${dEnd.toFixed(1)} days`, { owner2_after_retry: post2 })
  }
  await s2.browser.close()

  // ============================ PROOF B ============================
  const s1 = await openSession('o1')
  const b1 = await startCheckout(s1, 'growth', 'monthly')
  await shot(s1, 'checkout-growth-renewal')
  const cb = b1.created
  pass('B1', cb?.status === 200 && cb.body?.amount === 199900 && cb.body?.gst_registered === false,
    'owner1 (active Growth) renewal order created while seller unregistered (Growth monthly 199900)', `status ${cb?.status}, amount ${cb?.body?.amount}, gst_registered ${cb?.body?.gst_registered}, order ${cb?.body?.id ? last4(cb.body.id) : 'none'}${cb?.status !== 200 ? ' body ' + JSON.stringify(cb?.body) : ''}`)
  if (cb?.status !== 200) {
    note('B1-note', 'the app refused an order for an already-active agency; Proof B needs owner 2 before the Proof A success step (not done)', JSON.stringify(cb?.body))
    await s1.browser.close()
    return
  }
  const orderB = cb.body.id
  const drB = await drive(s1, 'stop')
  note('B1b', 'stopped at the Razorpay window: order created, NOT paid', `drive=${drB}`)
  const preB = await snapshot(t1)

  // 2 flip the GST switch
  const stateCode = settings0.state_code
  const testGstin = `${stateCode}TESTA1234A1ZA`
  writeFileSync(SAFETY, JSON.stringify(settings0, null, 2)) // safety net, removed after verified restore
  flipped = true
  await writeSettings(tAdmin, { ...settings0, gst_registered: true, gstin: testGstin })
  const flippedRow = await readSettings(tAdmin)
  const flagNow = await gstFlag()
  pass('B2', flippedRow.gst_registered === true && flippedRow.state_code === settings0.state_code && flagNow === true &&
    flippedRow.legal_name === settings0.legal_name && flippedRow.address === settings0.address && flippedRow.sac_code === settings0.sac_code && flippedRow.enforcement_enabled === settings0.enforcement_enabled,
    'admin flipped billing settings to GST-registered (test GSTIN, other fields unchanged); anon platform_gst_registered now true', `gst_registered=${flippedRow.gst_registered}, state ${flippedRow.state_code}, anon flag=${flagNow}`)

  // 3 pay the pending order with SUCCESS
  const vB0 = s1.net.verifies.length
  const dsB = await drive(s1, 'success')
  pass('B3a', dsB === 'clicked', 'simulator SUCCESS clicked on the pending order', `drive=${dsB}`)
  await waitFor(async () => s1.net.verifies.length > vB0, 40000, 500)
  const vB = s1.net.verifies[vB0]
  const vbBody = JSON.stringify(vB?.body ?? null)
  pass('B3b', !!vB && vB.status >= 400 && vB.status < 500 && vB.body?.success === false && vB.body?.state !== 'active',
    'verify-razorpay-payment gives a clean 4xx refusal (not 5xx, not active)', vB ? `${vB.status} ${vbBody}` : 'no verify call seen')
  note('B3c', 'does the refusal body itself name billing_settings_changed?', `${/billing_settings_changed/.test(vbBody) ? 'yes' : 'NO: the function maps it to the generic state "support"; the code appears only in admin data'}`)
  const refusalScreen = await waitFor(async () => { const t = await bodyText(s1); return /We have your payment|plan is active/.test(t) ? t : null }, 110000, 2000)
  const refusalTextFull = flat(refusalScreen ?? await bodyText(s1))
  const refusalAlerts = await alerts(s1)
  await shot(s1, 'after-refusal')
  pass('B3d', !!refusalScreen && !/plan is active/.test(refusalScreen), 'app does not show "active"; shows an honest payment-received-but-not-applied screen',
    `screen text: ${refusalTextFull.slice(0, 420)}; alerts: ${JSON.stringify(refusalAlerts)}`, { customer_refusal_text: refusalTextFull.slice(0, 600) })
  const midB = await snapshot(t1)
  pass('B3e', midB.status === 'active' && midB.invoices.length === preB.invoices.length && midB.periodEnd === preB.periodEnd && midB.planTier === preB.planTier,
    'owner1 subscription unchanged, no new invoice', `${brief(midB)}`)
  const bPays = (await rzp(`/orders/${orderB}/payments`)).json?.items ?? []
  const captured = bPays.find((p) => p.status === 'captured')
  pass('B3f', !!captured && captured.amount === 199900, 'Razorpay shows the money CAPTURED for the unapplied payment (test money)', bPays.map((p) => `${last4(p.id)} ${p.status} ${p.amount}`).join(' | ') || 'none')
  const bPayId = captured?.id

  // 4 what can an admin see
  await new Promise((r) => setTimeout(r, 6000))
  const ev = (await rpc(tAdmin, 'admin_webhook_events', { p_limit: 50 })).json
  const evRows = (ev?.events ?? []).filter((e) => e.order_id === orderB)
  const att = (await rpc(tAdmin, 'admin_webhook_attempts', { p_limit: 50 })).json
  const attRows = (att?.attempts ?? [])
  const sub = await http(`${base}/functions/v1/admin-portal-subscriptions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${tAdmin}` }, body: JSON.stringify({ action: 'list' }),
  })
  const refused = (sub.json?.ops_attention?.refused_payments ?? []).filter((r) => r.order_id === orderB)
  const refundEx = sub.json?.ops_attention?.refund_exceptions ?? []
  note('B4a', 'admin_webhook_events rows for the pending order (Billing ops > Webhook events)', `${evRows.length} row(s): ${evRows.map((e) => `${e.event_type}/${e.result}`).join(', ') || 'none'}; list ok=${ev?.ok}`)
  note('B4b', 'admin_webhook_attempts (retry log) rows right now', `${attRows.length} row(s) in the latest 50; for these events: ${attRows.filter((a) => evRows.some((e) => e.event_id === a.event_id)).length}`)
  pass('B4c', refused.length >= 1 && refused.some((r) => r.refusal === 'billing_settings_changed'),
    'admin-portal-subscriptions ops_attention.refused_payments lists the order with refusal billing_settings_changed (Admin > Subscriptions "needs attention")',
    refused.length ? refused.map((r) => `refusal=${r.refusal}, amount=${r.amount_paise}, payment=${r.payment_id ? last4(r.payment_id) : 'none'}, error=${r.error_message}, at=${r.refused_at}`).join(' | ') : `none; http ${sub.status}`)
  note('B4d', 'refund_exceptions list (only refunds Razorpay already processed)', `${refundEx.length} row(s); a captured-but-unapplied payment does NOT appear here`)

  // 5 flip back, then replay payment.captured
  await writeSettings(tAdmin, settings0)
  const backRow = await readSettings(tAdmin)
  pass('B5a', sameSettings(backRow, settings0) && (await gstFlag()) === false, 'settings flipped back to exactly the original unregistered values', `gst_registered=${backRow.gst_registered}, gstin=${backRow.gstin ?? 'null'}`)
  flipped = false
  const wc = await webhook(paymentEvent('payment.captured', { id: bPayId ?? `pay_ff${runId}`, amount: 199900, status: 'captured', order_id: orderB }))
  const postB = await snapshot(t1)
  const newB = postB.invoices.find((i) => !preB.invoices.some((p) => p.number === i.number))
  const bEnd = postB.periodEnd && preB.periodEnd ? (new Date(postB.periodEnd) - new Date(preB.periodEnd)) / 86400000 : NaN
  pass('B5b', wc.status >= 200 && wc.status < 300, 'replayed signed payment.captured webhook is acknowledged 2xx', `${wc.status} ${scrub(wc.text).slice(0, 160)}`)
  note('B5c', `after flipping back, replay of the captured payment ${wc.json?.result === 'activated' ? 'ACTIVATES' : 'does NOT activate (result ' + wc.json?.result + ')'}`,
    `${brief(postB)}; new invoice ${newB ? `${newB.number} total ${newB.total} taxable ${newB.taxable} tax ${(newB.cgst ?? 0) + (newB.sgst ?? 0) + (newB.igst ?? 0)}` : 'none'}; period end moved ${Number.isNaN(bEnd) ? '?' : bEnd.toFixed(1)} days`,
    { owner1_after_replay: postB })
  const refused2 = ((await http(`${base}/functions/v1/admin-portal-subscriptions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: `Bearer ${tAdmin}` }, body: JSON.stringify({ action: 'list' }),
  })).json?.ops_attention?.refused_payments ?? []).filter((r) => r.order_id === orderB)
  note('B5d', 'admin refused-payments list for that order after the replay', `${refused2.length} row(s): ${refused2.map((r) => r.refusal).join(', ') || 'none (entry cleared or never listed)'}`)
  await s1.browser.close()
}

let flipped = false
let crashed = null
try {
  if (restoreOnly) {
    const tAdmin = await signIn(U.admin.email, U.admin.password)
    const r = await restoreFromSafety(tAdmin)
    console.log(r ? (r.ok ? 'restored and verified' : 'RESTORE NOT VERIFIED') : 'no safety file; nothing to restore')
    process.exit(r && !r.ok ? 1 : 0)
  }
  await main()
} catch (e) {
  crashed = e instanceof Error ? e.message : 'unknown'
  failed += 1
  console.log(`FAIL crash  ${scrub(crashed)}`)
} finally {
  // ALWAYS restore the seller settings and assert the public flag.
  let restoreDetail = ''
  let restoreOk = false
  try {
    const tAdmin = await signIn(U.admin.email, U.admin.password)
    const r = await restoreFromSafety(tAdmin)
    const flag = await gstFlag()
    restoreOk = flag === false && (r === null || r.ok)
    restoreDetail = `${r === null ? 'no flip was pending' : r.ok ? 'restored from the saved original and verified' : 'RESTORE NOT VERIFIED'}; anon platform_gst_registered=${flag}`
  } catch (e) { restoreDetail = `restore error: ${scrub(e instanceof Error ? e.message : 'unknown')}` }
  pass('RESTORE', restoreOk, 'billing settings restored to the original; anon platform_gst_registered is false', restoreDetail)
  for (const s of sessions) await s.browser.close().catch(() => {})

  const date = new Date().toISOString().slice(0, 10)
  const out = join(OUT_DIR, `failed-and-flip-proof-${date}.json`)
  writeFileSync(out, scrub(JSON.stringify({
    run_id: runId, finished_at: new Date().toISOString(), mode: 'razorpay_test', supabase_ref: REF, razorpay_key: `rzp_test_${last4(keyId)}`,
    orders_created: ordersCreated, failed, crashed, results,
  }, null, 2)))
  console.log(`orders created: ${ordersCreated}`)
  console.log(`evidence: ${out}`)
  process.exit(failed ? 1 : 0)
}
