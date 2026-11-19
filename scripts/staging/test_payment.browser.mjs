/**
 * Staging subscription payment path, Razorpay TEST mode, real browser.
 * Usage: node scripts/staging/test_payment.browser.mjs [--headed] [--owner2]
 * Writes evidence/staging/payment/test-payment-<date>.json and screenshots. No secrets are printed or stored.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '..', '..')
const APP = 'http://localhost:5198'
const OUT = join(REPO, 'evidence', 'staging', 'payment')
mkdirSync(OUT, { recursive: true })
const date = new Date().toISOString().slice(0, 10)
const headed = process.argv.includes('--headed')
const useOwner2 = process.argv.includes('--owner2')
const phoneArg = process.argv.find((a) => a.startsWith('--phone='))
const PHONE = phoneArg ? phoneArg.slice(8) : '9000090000'

const env = {}
for (const line of readFileSync(join(REPO, '.env.staging.users'), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/s, '')
}
const prefix = useOwner2 ? 'SMOKE_OWNER2' : 'SMOKE_OWNER'
const EMAIL = env[`${prefix}_EMAIL`]
const PASSWORD = env[`${prefix}_PASSWORD`]
if (!EMAIL || !PASSWORD) throw new Error('smoke owner credentials missing')

const last4 = (s) => (typeof s === 'string' && s.length > 4 ? `…${s.slice(-4)}` : s)
const redact = (v) => {
  if (Array.isArray(v)) return v.map(redact)
  if (v && typeof v === 'object') {
    const o = {}
    for (const [k, val] of Object.entries(v)) {
      if (/(^|_)(id|signature|token|key|email|contact)$/i.test(k) || /order_id|payment_id|invoice_id/i.test(k)) {
        o[k] = typeof val === 'string' ? last4(val) : val
      } else o[k] = redact(val)
    }
    return o
  }
  return v
}
const scrub = (s) =>
  String(s ?? '')
    .split(PASSWORD).join('***')
    .split(EMAIL).join('<email>')
    .replace(/(rzp_(?:test|live)_)\w+/g, '$1…')
    .replace(/\b(order_|pay_)\w+/g, (m) => `${m.slice(0, m.indexOf('_') + 1)}…${m.slice(-4)}`)

const steps = []
const record = (ok, step, detail = '') => {
  const line = `${ok ? 'PASS' : 'FAIL'} ${step}  ${scrub(detail)}`
  console.log(line)
  steps.push({ status: ok ? 'PASS' : 'FAIL', step, detail: scrub(detail) })
  return ok
}
let shotNo = 0
const shot = async (page, name) => {
  shotNo += 1
  const f = `${String(shotNo).padStart(2, '0')}-${name}.png`
  try { await page.screenshot({ path: join(OUT, f) }) } catch { /* closed */ }
  return f
}
const finish = (extra = {}) => {
  const doc = { date, owner: useOwner2 ? 'owner2' : 'owner', steps, ...extra }
  writeFileSync(join(OUT, `test-payment-${date}.json`), JSON.stringify(doc, null, 2))
  process.exit(steps.some((s) => s.status === 'FAIL') ? 1 : 0)
}

const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: !headed })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await context.newPage()

const consoleErrors = []
const net = { create: null, verify: null, keys: new Set(), live: false }
const attachPage = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(scrub(m.text()).slice(0, 300)) })
  p.on('request', (r) => {
    const blob = `${r.url()} ${r.postData() ?? ''}`
    for (const k of blob.match(/rzp_(test|live)_\w+/g) ?? []) {
      net.keys.add(k.slice(0, 9))
      if (k.startsWith('rzp_live_')) net.live = true
    }
  })
  p.on('response', async (r) => {
    const u = r.url()
    try {
      if (u.includes('/functions/v1/create-razorpay-order')) net.create = { status: r.status(), body: await r.json().catch(() => null) }
      if (u.includes('/functions/v1/verify-razorpay-payment')) net.verify = { status: r.status(), body: await r.json().catch(() => null) }
    } catch { /* ignore */ }
  })
}
attachPage(page)
context.on('page', attachPage)

const abort = async (why) => {
  record(false, 'safety', why)
  await shot(page, 'abort')
  await browser.close()
  finish({ aborted: why })
}

const dumpFrame = async (frame, label) => {
  try {
    const info = await frame.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
      const text = document.body?.innerText?.replace(/\s+/g, ' ').slice(0, 600) ?? ''
      const btns = [...document.querySelectorAll('button,[role=button],input[type=submit],a,[data-testid],.option,[tabindex="0"]')]
        .filter(vis).map((e) => (e.innerText || e.value || e.getAttribute('data-testid') || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean).slice(0, 30)
      return { text, btns }
    })
    console.log(`  [${label}] text: ${scrub(info.text.slice(0, 160))}`)
    console.log(`  [${label}] buttons: ${scrub(info.btns.slice(-8).join(' | '))}`)
    return info
  } catch (e) { console.log(`  [${label}] dump failed ${e.message}`); return { text: '', btns: [] } }
}
const rzFrame = () => page.frames().find((f) => f.url().includes('api.razorpay.com/v1/checkout'))
const allRz = () => [...context.pages().flatMap((p) => p.frames())].filter((f) => /razorpay\.com/.test(f.url()))

try {
  // 1 login
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByPlaceholder('your@email.com or login ID').fill(EMAIL)
  await page.getByPlaceholder('Enter your password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In with Password' }).click()
  try {
    await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 })
    record(true, 'login', `landed on ${new URL(page.url()).pathname}`)
  } catch {
    await shot(page, 'login-fail')
    record(false, 'login', 'still on login page')
    await browser.close(); finish({ consoleErrors })
  }
  await shot(page, 'after-login')

  // 2 checkout
  await page.goto(`${APP}/checkout?plan=growth&billing=monthly`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Test mode is active').first().waitFor({ timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1000)
  const txt = await page.evaluate(() => document.body.innerText)
  await shot(page, 'checkout')
  const checks = {
    banner: txt.includes('Test mode is active'),
    plan: txt.includes('Growth plan'),
    price: txt.includes('₹1,999'),
    nogst: txt.includes('No GST charged'),
  }
  const ok2 = Object.values(checks).every(Boolean)
  record(ok2, 'checkout-page', JSON.stringify(checks))
  if (!checks.banner) await abort('test-mode banner missing')
  if (!ok2) { await browser.close(); finish({ consoleErrors }) }

  await page.getByPlaceholder('9876543210').fill(PHONE)
  const emailBox = page.locator('#checkout-email')
  if (!(await emailBox.inputValue().catch(() => ''))) await emailBox.fill(EMAIL)
  await shot(page, 'checkout-filled')
  await page.getByRole('button', { name: 'Continue to payment' }).click()

  // 3 order response
  for (let i = 0; i < 60 && !net.create; i++) await page.waitForTimeout(500)
  if (!net.create) { record(false, 'create-order', 'no response seen'); await shot(page, 'no-order'); await browser.close(); finish({ consoleErrors }) }
  const cb = net.create.body ?? {}
  const orderInfo = {
    status: net.create.status, amount: cb.amount, currency: cb.currency, id: last4(cb.id),
    gst_registered: cb.gst_registered, gst_rate_pct: cb.gst_rate_pct,
    other_fields: Object.keys(cb).filter((k) => /amount|tax|gst|subtotal|total|discount/i.test(k)).reduce((a, k) => ({ ...a, [k]: cb[k] }), {}),
  }
  record(net.create.status === 200 && cb.amount === 199900 && cb.gst_registered === false,
    'create-order', JSON.stringify(orderInfo))
  if (net.create.status !== 200) { await shot(page, 'order-error'); await browser.close(); finish({ orderInfo, consoleErrors }) }

  // 4 iframe
  let frame
  for (let i = 0; i < 60 && !(frame = rzFrame()); i++) await page.waitForTimeout(500)
  if (!frame) { record(false, 'razorpay-iframe', 'not found'); await shot(page, 'no-iframe'); await browser.close(); finish({ orderInfo, consoleErrors }) }
  await page.waitForTimeout(4000)
  if (net.live || (net.keys.size > 0 && ![...net.keys].every((k) => k === 'rzp_test_'))) await abort('non-test Razorpay key seen')
  if (!net.keys.has('rzp_test_')) await abort('could not confirm rzp_test_ key in network')
  record(true, 'razorpay-iframe', `keys seen: ${[...net.keys].join(',')}`)
  await shot(page, 'rz-open')

  // drive the checkout step by step
  const deadline = Date.now() + 150000
  let done = false
  let lastSig = ''
  let sameCount = 0
  let bankPicked = false
  let paid = false
  while (Date.now() < deadline && !net.verify) {
    await page.waitForTimeout(2500)
    // popup/redirect simulator pages
    const popups = context.pages().filter((p) => p !== page && !p.isClosed())
    for (const pp of popups) {
      const t = await pp.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      console.log(`  [popup ${scrub(pp.url().slice(0, 80))}] ${scrub(t.replace(/\s+/g, ' ').slice(0, 200))}`)
      await shot(pp, 'popup')
      const ok = pp.getByRole('button', { name: /^success$/i }).or(pp.getByText(/^success$/i)).first()
      if (await ok.count()) { await ok.click({ timeout: 5000 }).catch(() => {}); paid = true; console.log('  clicked Success (popup)'); continue }
    }
    const f = rzFrame()
    if (!f) {
      // maybe redirected main page to simulator
      const t = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')
      if (/success/i.test(t) && /failure/i.test(t) && !page.url().startsWith(APP)) {
        await shot(page, 'redirect-sim')
        await page.getByRole('button', { name: /^success$/i }).first().click().catch(() => {})
        paid = true
      }
      continue
    }
    const info = await dumpFrame(f, 'rz')
    const sig = info.text + info.btns.join()
    if (sig !== lastSig) { await shot(page, 'rz-step'); lastSig = sig; sameCount = 0 } else sameCount += 1
    if (sameCount >= 6) {
      record(false, 'razorpay-stuck', `same visible text for ${sameCount} polls: ${info.text.slice(0, 200)}`)
      await browser.close(); finish({ orderInfo, consoleErrors })
    }
    const t = info.text
    const loc = (re) => f.getByText(re).first()
    const tryClick = async (l) => { if (await l.count().catch(() => 0)) { await l.click({ timeout: 5000 }).catch(() => {}); return true } return false }

    const phoneInput = f.locator('input[name="contact"], input[type="tel"], input[placeholder*="obile" i]').first()
    if (/contact details/i.test(t) && (await phoneInput.count())) {
      await phoneInput.click({ clickCount: 3 }).catch(() => {})
      await phoneInput.fill('').catch(() => {})
      await phoneInput.fill(PHONE).catch(() => {})
      const em = f.locator('input[type="email"], input[name="email"]').first()
      if ((await em.count()) && !(await em.inputValue().catch(() => ''))) await em.fill(EMAIL).catch(() => {})
      await tryClick(f.getByRole('button', { name: /^Continue$/i }).first())
      continue
    }
    if (/Success/.test(t) && /Failure/.test(t)) {
      if (await tryClick(f.getByRole('button', { name: /^success$/i }).or(f.getByText(/^success$/i)).first())) { console.log('  clicked Success (iframe)'); paid = true; continue }
    }
    if (/Suggested Banks|All Banks/i.test(t) && !bankPicked) {
      if (await tryClick(f.getByText(/^Canara Bank$/).first()) || await tryClick(f.getByText(/^IDBI$/).first())) { bankPicked = true; console.log('  picked bank'); continue }
    }
    if (bankPicked && !paid) {
      if (await tryClick(f.getByRole('button', { name: /^(Pay|Continue|Proceed)/i }).first())) { console.log('  clicked pay/continue'); await page.waitForTimeout(3000); continue }
    }
    if (/Netbanking/i.test(t) && !/Suggested Banks|All Banks/i.test(t)) {
      if (await tryClick(f.getByText(/^Netbanking$/).first())) { console.log('  chose Netbanking'); continue }
    }
    if (/Continue/i.test(t)) await tryClick(f.getByRole('button', { name: /^Continue$/i }).first())
  }

  // 5 verify
  for (let i = 0; i < 40 && !net.verify; i++) await page.waitForTimeout(500)
  if (!net.verify) {
    await shot(page, 'no-verify')
    record(false, 'verify-payment', 'no verify-razorpay-payment call seen within time limit')
    await browser.close(); finish({ orderInfo, consoleErrors })
  }
  const vb = net.verify.body ?? {}
  const verifyInfo = { status: net.verify.status, body: redact(vb) }
  record(net.verify.status === 200, 'verify-payment', JSON.stringify(verifyInfo))
  await page.waitForTimeout(3000)
  for (let i = 0; i < 40; i++) {
    const t = await page.evaluate(() => document.body.innerText).catch(() => '')
    if (/plan is active|We have your payment/.test(t)) break
    await page.waitForTimeout(1000)
  }
  const afterText = scrub(await page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ').slice(0, 300)
  await shot(page, 'after-payment')
  const activated = /plan is active/.test(afterText)
  record(activated, 'app-after-payment', afterText)

  // 6 subscription page
  await page.goto(`${APP}/subscription`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  await page.getByRole('button', { name: /Refresh status/i }).click().catch(() => {})
  await page.waitForTimeout(3000)
  const sub = await page.evaluate(() => {
    const t = document.body.innerText.replace(/[ \t]+/g, ' ')
    const rows = [...document.querySelectorAll('table tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ').trim())
    const inv = (t.match(/\bINV[-\w/]*\d+[-\w/]*/g) ?? [])
    return { text: t.slice(0, 900).replace(/\n+/g, ' | '), rows, inv }
  })
  await shot(page, 'subscription')
  const subInfo = { text: sub.text, invoiceRows: sub.rows.length, firstInvoice: sub.rows[0] ?? null }
  record(sub.rows.length > 0 && /active/i.test(sub.text) && /growth/i.test(sub.text), 'subscription-page', JSON.stringify(subInfo))

  console.log(`INFO console-errors  ${consoleErrors.length} (third-party Razorpay noise is expected): ${scrub(consoleErrors.slice(0, 6).join(' || '))}`)
  await browser.close()
  finish({ orderInfo, verifyInfo, subInfo, consoleErrors })
} catch (e) {
  record(false, 'script-error', e.message.slice(0, 400))
  await shot(page, 'error')
  await browser.close().catch(() => {})
  finish({ consoleErrors })
}
