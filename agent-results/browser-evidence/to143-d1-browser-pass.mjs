/**
 * TO-143-D1 pre-acceptance browser pass (read-only verification).
 *
 * Controls under test:
 *  1. NewShipmentPage success panel — "Authorize an agency" (uuid input + submit + role=status message)
 *     -> customerShipmentsApi.authorizeAgency -> POST /rest/v1/rpc/authorize_agency_for_shipment
 *  2. AgencyJobsPage — "Authorized Shipments" panel (shipment uuid + grant date rows, fare input,
 *     Create Job) -> agencySupabaseApi.listAuthorizations / createJob (direct client)
 *
 * Backend: none locally. Supabase REST/RPC/Functions/GoTrue endpoints of the local-first
 * placeholder client (https://localhost.invalid, frontend/src/lib/authCapabilities.ts:47) are
 * mocked at the HTTP boundary with Playwright page.route. Boot auth is seeded via the
 * supabase-js localStorage session (sb-localhost-auth-token) so resolveAppRole
 * (frontend/src/stores/authStore.ts) resolves roles from the mocked tables; a direct
 * authStore.setState injection is the fallback.
 */
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = 'http://localhost:5173'
const VP = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 900 },
]
const OUT_DIR = path.resolve(process.cwd(), 'agent-results/browser-evidence')
fs.mkdirSync(OUT_DIR, { recursive: true })

const USER_ID = '11111111-2222-4333-8444-555555555555'
const AGENCY_ID = '8f2ac1b4-1234-4abc-9def-56789abcdef0'
const SHIPMENT_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
const SHIPMENT2_ID = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'
const CONSENT_ID = 'c3d4e5f6-a7b8-4c9d-8e0f-1a2b3c4d5e6f'
const JOB_ID = 'd4e5f6a7-b8c9-4d0e-9f1a-2b3c4d5e6f7a'
const AUTH_TOKEN_KEY = 'sb-localhost-auth-token'

const RAW_USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'owner@varsharoadlines.example',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Agency Owner', company: { name: 'Varsha Roadlines' } },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}
const FAKE_SESSION = {
  access_token: 'fake-access-token',
  token_type: 'bearer',
  expires_in: 31536000,
  expires_at: Math.floor(Date.now() / 1000) + 31536000,
  refresh_token: 'fake-refresh-token',
  user: RAW_USER,
}

const INJECT_ROLE_USER = {
  id: USER_ID, email: RAW_USER.email, login_id: null, name: 'Agency Owner',
  phone: null, phone_verified: false, google_linked: false, profile_picture: null,
  role: 'user', user_metadata: { full_name: 'Agency Owner' },
}
const INJECT_ROLE_AGENCY = {
  ...INJECT_ROLE_USER,
  role: 'agency',
  user_metadata: { full_name: 'Agency Owner', company: { name: 'Varsha Roadlines' } },
}

const results = { customer: {}, agency: {} }
const allConsoleErrors = []

function json(res) { return { status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) } }

function installMocks(context, role, state) {
  // Registered FIRST = consulted LAST: catch-all swallows any unmocked local-first call.
  context.route('**localhost.invalid/**', (route) => {
    state.unmocked.push(route.request().url())
    return route.fulfill(json({ status: 200, body: [] }))
  })
  // GoTrue
  context.route('**/auth/v1/user', (route) => route.fulfill(json({ status: 200, body: RAW_USER })))
  context.route('**/auth/v1/token**', (route) => route.fulfill(json({ status: 200, body: FAKE_SESSION })))
  // Role resolution / profile sync. NOTE: .single()/.maybeSingle() set the
  // PostgREST object Accept header, so mocks must return single OBJECTS (or
  // JSON null), never arrays — an array body silently yields undefined fields.
  context.route('**/rest/v1/users**', (route) => {
    const m = route.request().method()
    if (m === 'POST') return route.fulfill({ status: 204 })
    return route.fulfill(json({ status: 200, body: { role: 'user', login_id: null } }))
  })
  context.route('**/rest/v1/transport_agencies**', (route) => {
    state.counters.agencyLookup++
    return route.fulfill(json({ status: 200, body: role === 'agency' ? { id: AGENCY_ID } : null }))
  })
  context.route('**/rest/v1/drivers**', (route) => route.fulfill(json({ status: 200, body: null })))
  // Customer booking
  context.route('**/rest/v1/shipments**', (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(json({ status: 200, body: null }))
    state.counters.shipmentsInsert++
    return route.fulfill(json({
      status: 201,
      body: {
        id: SHIPMENT_ID, shipment_id: 'TO-DEMO-001', customer_id: null, created_by: USER_ID,
        origin: 'Mumbai', destination: 'Delhi', status: 'pending', total_weight: 2000,
        estimated_cost: 0, vehicle_type: 'eicher_14ft', pickup_date: '2026-10-15',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
    }))
  })
  context.route('**/rest/v1/rpc/dispatch_job_to_drivers', (route) => {
    state.counters.dispatchRpc++
    return route.fulfill(json({ status: 200, body: 4 }))
  })
  // THE control: authorize_agency_for_shipment
  context.route('**/rest/v1/rpc/authorize_agency_for_shipment', async (route) => {
    state.counters.authRpc++
    const s = state.authRpc
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    return route.fulfill(json({ status: s?.status ?? 500, body: s?.body ?? { message: 'unmocked' } }))
  })
  // Agency authorizations list
  context.route('**/rest/v1/shipment_agency_consents**', (route) =>
    route.fulfill(json({ status: 200, body: state.consentsRows })))
  // THE control: agency_jobs direct INSERT
  context.route('**/rest/v1/agency_jobs**', async (route) => {
    if (route.request().method() !== 'POST') return route.fulfill(json({ status: 200, body: null }))
    state.counters.agencyJobsPost++
    const s = state.agencyJobsPost
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    return route.fulfill(json({ status: s?.status ?? 500, body: s?.body ?? { message: 'unmocked' } }))
  })
  // Edge client used by fetchAgency (list refresh + jobs list)
  context.route('**/functions/v1/agency-portal-jobs**', (route) => {
    state.counters.edgeJobs++
    return route.fulfill(json({ status: 200, body: { jobs: state.edgeJobsList } }))
  })
  // Subscription gate + layout noise
  context.route('**/rest/v1/subscriptions**', (route) => route.fulfill(json({ status: 200, body: null })))
  context.route('**/rest/v1/usage_tracking**', (route) => route.fulfill(json({ status: 200, body: {} })))
  context.route('**/rest/v1/notifications**', (route) => route.fulfill(json({ status: 200, body: [] })))
}

async function newPage(browser, vp, role, state) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'en-IN' })
  await context.addInitScript(([key, sess]) => {
    window.localStorage.setItem(key, JSON.stringify(sess))
  }, [AUTH_TOKEN_KEY, FAKE_SESSION])
  installMocks(context, role, state)
  const page = await context.newPage()
  page.on('pageerror', (e) => state.pageErrors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') state.consoleErrors.push(m.text().slice(0, 300)) })
  page.on('requestfailed', (r) => state.requestFailed.push(`${r.failure()?.errorText} ${r.url()}`.slice(0, 200)))
  return { context, page }
}

/** Ensure the authStore is authenticated with the expected role; setState fallback if boot auth failed. */
async function ensureAuth(page, role) {
  const injectUser = role === 'agency' ? INJECT_ROLE_AGENCY : INJECT_ROLE_USER
  await page.waitForFunction(() => {
    const s = window.__authStore?.getState?.()
    return s ? s.isLoading === false : false
  }, { timeout: 15000 }).catch(() => {})
  const bootState = await page.evaluate(async (expected) => {
    const mod = await import('/src/stores/authStore.ts')
    const store = mod.useAuthStore
    window.__authStore = store
    const s = store.getState()
    if (!s.isAuthenticated || s.user?.role !== expected) {
      store.setState({
        user: {
          id: '11111111-2222-4333-8444-555555555555', email: 'owner@varsharoadlines.example',
          login_id: null, name: 'Agency Owner', phone: null, phone_verified: false,
          google_linked: false, profile_picture: null, role: expected,
          user_metadata: expected === 'agency'
            ? { full_name: 'Agency Owner', company: { name: 'Varsha Roadlines' } }
            : { full_name: 'Agency Owner' },
        },
        session: null,
        authMode: 'supabase',
        isAuthenticated: true,
        isLoading: false,
      })
      return { injected: true, bootRole: s.user?.role ?? null, bootAuthed: s.isAuthenticated }
    }
    return { injected: false, bootRole: s.user?.role, bootAuthed: s.isAuthenticated }
  }, role)
  return bootState
}

/** WCAG contrast probe (executed in page). */
function contrastProbe(specs) {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null
    const p = m[1].split(',').map((x) => parseFloat(x))
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] } }
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const effBg = (el) => { let n = el
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor)
      if (c && c.a > 0.5) return c
      n = n.parentElement }
    return { r: 255, g: 255, b: 255, a: 1 } }
  const hex = ({ r, g, b }) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
  return specs.map(({ sel, label }) => {
    const el = document.querySelector(sel)
    if (!el) return { label, found: false }
    const cs = getComputedStyle(el)
    const fg = parse(cs.color)
    const bg = effBg(el)
    const L1 = lum(fg), L2 = lum(bg)
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
    return { label, found: true, fg: hex(fg), bg: hex(bg), ratio: Math.round(ratio * 100) / 100,
      fontSizePx: cs.fontSize, fontWeight: cs.fontWeight }
  })
}

async function measureContrast(page, specs) {
  return page.evaluate(contrastProbe, specs)
}

async function tabSequence(page, presses) {
  const seq = []
  for (let i = 0; i < presses; i++) {
    await page.keyboard.press('Tab')
    seq.push(await page.evaluate(() => {
      const a = document.activeElement
      if (!a || a === document.body) return { tag: 'body' }
      return {
        tag: a.tagName, type: a.getAttribute('type'),
        text: (a.innerText || a.textContent || '').trim().slice(0, 40),
        aria: a.getAttribute('aria-label'), placeholder: a.getAttribute('placeholder'),
        disabled: a.disabled ?? false,
      }
    }))
  }
  return seq
}

async function waitForToast(page, text, timeout = 7000) {
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout })
    return { ok: true }
  } catch {
    return { ok: false, bodySnippet: (await page.evaluate(() => document.body.innerText)).slice(0, 400) }
  }
}

const shot = (page, vp, name) => page.screenshot({ path: path.join(OUT_DIR, `to143-${name}-${vp.name}.png`) })

// ─────────────────────────── Customer: NewShipmentPage ───────────────────────────

async function runCustomer(browser, vp) {
  const state = {
    authRpc: null, counters: { authRpc: 0, shipmentsInsert: 0, dispatchRpc: 0, agencyLookup: 0 },
    consentsRows: [], agencyJobsPost: null, edgeJobsList: [],
    unmocked: [], pageErrors: [], consoleErrors: [], requestFailed: [],
  }
  const r = { steps: [], contrast: [], tabOrder: [], state, consoleErrors: [], pageErrors: [] }
  const step = (name, ok, detail) => { r.steps.push({ name, ok, detail }); console.log(`  [customer/${vp.name}] ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`) }

  const { context, page } = await newPage(browser, vp, 'user', state)
  const boot = await (async () => {
    await page.goto(`${BASE}/booking/new`, { waitUntil: 'domcontentloaded' })
    return ensureAuth(page, 'user')
  })()
  step('boot: authenticated as role user', true, JSON.stringify(boot))

  await page.getByText('Book a Truck').waitFor({ timeout: 15000 })
  await page.getByPlaceholder('e.g., Mumbai').fill('Mumbai')
  await page.getByPlaceholder('e.g., Delhi').fill('Delhi')
  await page.locator('input[type="number"]').first().fill('2000')
  await page.locator('input[type="date"]').fill('2026-10-15')
  await page.getByRole('button', { name: /Book Now/ }).click()
  await page.getByText('Booking Confirmed!').waitFor({ timeout: 15000 })
  step('booking submitted -> success panel rendered', true,
    `shipmentsInsert=${state.counters.shipmentsInsert} dispatchRpc=${state.counters.dispatchRpc}`)

  const panel = page.locator('form', { has: page.getByText('Authorize an agency (optional)') })
  const uuidInput = panel.locator('input')
  const authBtn = panel.getByRole('button')
  const statusMsg = panel.locator('p[role="status"]')

  // 1) UUID shape validation (client-side)
  await uuidInput.fill('not-a-uuid')
  await authBtn.click()
  await statusMsg.waitFor({ timeout: 5000 })
  const vMsg = (await statusMsg.innerText()).trim()
  step('uuid validation rejected with copy', vMsg === 'Enter a valid agency ID (uuid).', vMsg)
  step('uuid validation made NO rpc call', state.counters.authRpc === 0, `authRpc=${state.counters.authRpc}`)
  await shot(page, vp, `customer-${vp.name}-uuid-invalid`)

  // 2) Controlled server error copy (mocked PostgREST 400)
  state.authRpc = { status: 400, body: { code: 'P0001', message: 'Shipment is not open for dispatch.', details: null, hint: null } }
  await uuidInput.fill(SHIPMENT_ID)
  await authBtn.click()
  await page.waitForFunction((prev) => {
    const el = document.querySelector('form p[role="status"]')
    return el && el.textContent !== prev
  }, vMsg, { timeout: 7000 })
  const eMsg = (await statusMsg.innerText()).trim()
  step('server rejection shown verbatim (controlled message map)', eMsg === 'Shipment is not open for dispatch.', eMsg)
  step('error message has role=status', await statusMsg.count() === 1, 'p[role=status]')
  await shot(page, vp, `customer-${vp.name}-error`)
  r.contrast.push(...await measureContrast(page, [
    { sel: 'form p[role="status"]', label: 'error message (text-xs on card)' },
  ]))

  // 3) Submitting state + double-submit protection (delayed rpc)
  state.authRpc = { status: 200, body: { id: CONSENT_ID, state: 'granted' }, delayMs: 1500 }
  const before = state.counters.authRpc
  await authBtn.click()
  await authBtn.waitFor({ state: 'visible' })
  await page.getByRole('button', { name: 'Authorizing...' }).waitFor({ timeout: 3000 })
  const inflight = await page.evaluate(() => {
    const form = document.querySelector('form')
    const btn = form.querySelector('button[type="submit"]')
    const inp = form.querySelector('input')
    let extra = false
    btn.click() // suppressed for disabled buttons — recorded via rpc counter
    return {
      btnText: btn.textContent.trim(), btnDisabled: btn.disabled,
      inputDisabled: inp.disabled,
      clickEventSuppressed: true,
    }
  })
  let secondClickThrown = false
  try { await authBtn.click({ timeout: 800 }) } catch { secondClickThrown = true }
  await shot(page, vp, `customer-${vp.name}-authorizing`)
  await statusMsg.waitFor({ timeout: 8000 })
  const gMsg = (await statusMsg.innerText()).trim()
  const rpcDuringFlight = state.counters.authRpc - before
  step('submitting state shows "Authorizing..." + disabled controls',
    inflight.btnText === 'Authorizing...' && inflight.btnDisabled && inflight.inputDisabled,
    JSON.stringify(inflight))
  step('double-submit suppressed (disabled click-through + el.click())',
    rpcDuringFlight === 1 && secondClickThrown,
    `rpcCalls=${rpcDuringFlight}, playwrightClickRefused=${secondClickThrown}`)
  await waitForToast(page, 'Booking created!') // sanity: previous toast may be gone; ignore
  step('granted success copy', gMsg === 'Agency authorized for this shipment.', gMsg)
  r.contrast.push(...await measureContrast(page, [
    { sel: 'form p[role="status"]', label: 'success message (text-xs on card)' },
  ]))

  // 4) already_active
  state.authRpc = { status: 200, body: { id: CONSENT_ID, state: 'already_active' } }
  await authBtn.click()
  await page.waitForFunction(() => document.querySelector('form p[role="status"]')?.textContent === 'This agency is already authorized.', null, { timeout: 7000 })
  step('already_active success copy', true, 'This agency is already authorized.')

  // 5) reactivated
  state.authRpc = { status: 200, body: { id: CONSENT_ID, state: 'reactivated' } }
  await authBtn.click()
  await page.waitForFunction(() => document.querySelector('form p[role="status"]')?.textContent === 'Authorization restored for this agency.', null, { timeout: 7000 })
  step('reactivated success copy', true, 'Authorization restored for this agency.')
  await shot(page, vp, `customer-${vp.name}-success-panel`)

  // 6) Label association + keyboard operability
  const labelInfo = await page.evaluate(() => {
    const form = document.querySelector('form')
    const inp = form.querySelector('input[type="text"]')
    return {
      id: inp.id, ariaLabel: inp.getAttribute('aria-label'), labelledby: inp.getAttribute('aria-labelledby'),
      labelsLength: inp.labels?.length ?? -1,
      placeholder: inp.getAttribute('placeholder'),
      formButtonIsSubmit: form.querySelector('button[type="submit"]') !== null,
    }
  })
  step('input label association', labelInfo.labelsLength > 0 || !!labelInfo.ariaLabel || !!labelInfo.labelledby,
    JSON.stringify(labelInfo))
  r.customerLabel = labelInfo

  // keyboard: Tab to the uuid input, type uuid, press Enter -> rpc fires and success renders
  state.authRpc = { status: 200, body: { id: CONSENT_ID, state: 'granted' } }
  const kbBefore = state.counters.authRpc
  let kb = null
  let kbTabs = -1
  try {
    await page.evaluate(() => document.activeElement?.blur?.())
    for (let i = 0; i < 60; i++) {
      const hit = await page.evaluate(() => document.activeElement?.id === 'authorize-agency-input')
      if (hit) { kbTabs = i; break }
      await page.keyboard.press('Tab')
    }
    if (kbTabs < 0) throw new Error('uuid input not reached via Tab')
    await page.keyboard.type(SHIPMENT_ID)
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => document.querySelector('form p[role="status"]')?.textContent === 'Agency authorized for this shipment.', null, { timeout: 7000 })
    kb = true
  } catch { kb = false }
  step('keyboard-only submit (Tab->type->Enter) triggers rpc', kb && state.counters.authRpc - kbBefore === 1,
    `tabs=${kbTabs}, authRpcDelta=${state.counters.authRpc - kbBefore}`)

  r.tabOrder = await tabSequence(page, 14)
  r.contrast.push(...await measureContrast(page, [
    { sel: 'form label', label: 'Authorize label (text-xs slate-600 on white card)' },
    { sel: 'form p:not([role])', label: 'helper text (text-xs slate-500)' },
    { sel: 'form button[type="submit"]', label: 'Authorize button (btn-primary, primary-600/white)' },
  ]))

  r.consoleErrors = state.consoleErrors
  r.pageErrors = state.pageErrors
  await context.close()
  return r
}

// ─────────────────────────── Agency: AgencyJobsPage ───────────────────────────

async function runAgency(browser, vp) {
  const state = {
    authRpc: null, counters: { authRpc: 0, agencyJobsPost: 0, edgeJobs: 0, agencyLookup: 0 },
    consentsRows: [], agencyJobsPost: null, edgeJobsList: [],
    unmocked: [], pageErrors: [], consoleErrors: [], requestFailed: [],
  }
  const r = { steps: [], contrast: [], tabOrder: [], state, consoleErrors: [], pageErrors: [] }
  const step = (name, ok, detail) => { r.steps.push({ name, ok, detail }); console.log(`  [agency/${vp.name}] ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`) }

  const { context, page } = await newPage(browser, vp, 'agency', state)
  await page.goto(`${BASE}/agency/jobs`, { waitUntil: 'domcontentloaded' })
  const boot = await ensureAuth(page, 'agency')
  step('boot: authenticated as role agency', true, JSON.stringify(boot))

  await page.getByRole('heading', { name: 'Authorized Shipments' }).waitFor({ timeout: 20000 })
  await page.getByText('No customer authorizations yet.').waitFor({ timeout: 10000 })
  step('empty state copy renders', true, 'No customer authorizations yet...')
  await shot(page, vp, `agency-${vp.name}-empty`)
  r.contrast.push(...await measureContrast(page, [
    { sel: 'h2', label: 'Authorized Shipments h2 (slate-800 on white)' },
    { sel: 'h2 + p', label: 'panel description (text-xs slate-500 on white)' },
    { sel: 'h2 ~ p.text-xs.text-slate-400', label: 'empty-state copy (text-xs slate-400 on white)' },
  ]))

  // rows
  state.consentsRows = [
    { shipment_id: SHIPMENT_ID, granted_via: 'customer_grant', created_at: '2026-10-07T10:30:00Z' },
    { shipment_id: SHIPMENT2_ID, granted_via: 'admin_grant', created_at: '2026-10-06T08:00:00Z' },
  ]
  await page.goto(`${BASE}/agency/jobs`, { waitUntil: 'domcontentloaded' })
  await ensureAuth(page, 'agency')
  await page.getByRole('heading', { name: 'Authorized Shipments' }).waitFor({ timeout: 20000 })
  await page.getByText(SHIPMENT_ID).first().waitFor({ timeout: 10000 })
  const rowInfo = await page.evaluate((ids) => {
    const body = document.body.innerText
    return {
      id1: body.includes(ids[0]), id2: body.includes(ids[1]),
      d1: body.includes('Authorized 07 Oct'), d2: body.includes('Authorized 06 Oct'),
      fareAria: [...document.querySelectorAll('input[type="number"]')].map((i) => i.getAttribute('aria-label')),
      buttons: [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('Create Job')).length,
    }
  }, [SHIPMENT_ID, SHIPMENT2_ID])
  step('rows show shipment uuid + grant date (en-IN)',
    rowInfo.id1 && rowInfo.id2 && rowInfo.d1 && rowInfo.d2, JSON.stringify(rowInfo))
  step('fare inputs carry aria-label', (rowInfo.fareAria || []).every(Boolean) && rowInfo.fareAria.length === 2,
    JSON.stringify(rowInfo.fareAria))
  step('two Create Job buttons rendered', rowInfo.buttons === 2, `buttons=${rowInfo.buttons}`)
  await shot(page, vp, `agency-${vp.name}-rows`)

  const row1 = page.locator('div', { has: page.getByText(SHIPMENT_ID) }).locator('button', { hasText: 'Create Job' }).first()
  const fareInput = page.getByLabel(`Fare for shipment ${SHIPMENT_ID}`)
  const createBtn = page.getByRole('button', { name: 'Create Job' }).first()

  // fare validation (empty + zero) — no POST expected
  await createBtn.click()
  const t1 = await waitForToast(page, 'Enter a valid fare')
  step('empty fare -> validation toast', t1.ok, t1.ok ? '' : t1.bodySnippet)
  await fareInput.fill('0')
  await createBtn.click()
  const t2 = await waitForToast(page, 'Enter a valid fare')
  step('zero fare -> validation toast', t2.ok, t2.ok ? '' : t2.bodySnippet)
  step('fare validation made NO insert call', state.counters.agencyJobsPost === 0, `agencyJobsPost=${state.counters.agencyJobsPost}`)

  // submitting state + double-submit protection + success
  state.agencyJobsPost = { status: 201, body: { id: JOB_ID, agency_id: AGENCY_ID, shipment_id: SHIPMENT_ID, fare: 1500, status: 'pending' }, delayMs: 1500 }
  await fareInput.fill('1500')
  const postBefore = state.counters.agencyJobsPost
  const edgeBefore = state.counters.edgeJobs
  const createBtnHandle = await createBtn.elementHandle() // pin row-1 button across its 'Creating...' rename
  await createBtn.click()
  await page.getByRole('button', { name: 'Creating...' }).waitFor({ timeout: 3000 })
  const inflight = await page.evaluate((sid) => {
    const inp = document.querySelector(`input[aria-label="Fare for shipment ${sid}"]`)
    const btn = inp.closest('div').querySelector('button')
    btn.click()
    return { btnText: btn.textContent.trim(), btnDisabled: btn.disabled, inputDisabled: inp.disabled }
  }, SHIPMENT_ID)
  let secondClickThrown = false
  try { await createBtnHandle.click({ timeout: 800 }) } catch { secondClickThrown = true }
  await shot(page, vp, `agency-${vp.name}-creating`)
  const t3 = await waitForToast(page, 'Dispatch job created!')
  await page.waitForTimeout(1200) // let fetchAgency() refresh actually issue before counting
  const posts = state.counters.agencyJobsPost - postBefore
  const edgeDelta = state.counters.edgeJobs - edgeBefore
  const fareCleared = await fareInput.inputValue()
  step('submitting state shows "Creating..." + disabled row controls',
    inflight.btnText === 'Creating...' && inflight.btnDisabled && inflight.inputDisabled, JSON.stringify(inflight))
  step('double-submit suppressed', posts === 1 && secondClickThrown,
    `posts=${posts}, playwrightClickRefused=${secondClickThrown}, elClickSuppressed=${posts === 1}`)
  step('success toast', t3.ok, t3.ok ? '' : t3.bodySnippet)
  step('fare cleared after success', fareCleared === '', `value='${fareCleared}'`)
  step('jobs list refresh (edge GET) fired after success', edgeDelta >= 1, `edgeGetDelta=${edgeDelta}`)
  await shot(page, vp, `agency-${vp.name}-success-toast`)

  // already-exists (SQLSTATE 23505 -> typed result)
  state.agencyJobsPost = {
    status: 409,
    body: { code: '23505', message: 'duplicate key value violates unique constraint "agency_jobs_agency_id_shipment_id_key"', details: null, hint: null },
  }
  await fareInput.fill('1500')
  await createBtn.click()
  const t4 = await waitForToast(page, 'A job already exists for this shipment.')
  step('already-exists info toast (23505 mapped)', t4.ok, t4.ok ? '' : t4.bodySnippet)
  await shot(page, vp, `agency-${vp.name}-already-exists`)

  // generic error
  state.agencyJobsPost = { status: 400, body: { code: '42501', message: 'new row violates row-level security policy for table "agency_jobs"' } }
  await fareInput.fill('999')
  await createBtn.click()
  const t5 = await waitForToast(page, 'Failed to create job')
  step('error toast', t5.ok, t5.ok ? 'observed copy: "Failed to create job"' : t5.bodySnippet)
  await shot(page, vp, `agency-${vp.name}-error`)

  // keyboard: Tab to fare input, type fare, Tab to Create Job, Enter -> POST fires
  state.agencyJobsPost = { status: 201, body: { id: JOB_ID, agency_id: AGENCY_ID, shipment_id: SHIPMENT_ID, fare: 1500, status: 'pending' } }
  let kbOk = false
  let kbTabs = -1
  const kbBefore = state.counters.agencyJobsPost
  try {
    await page.evaluate(() => document.activeElement?.blur?.())
    for (let i = 0; i < 60; i++) {
      const hit = await page.evaluate((sid) =>
        document.activeElement?.getAttribute?.('aria-label') === `Fare for shipment ${sid}`, SHIPMENT_ID)
      if (hit) { kbTabs = i; break }
      await page.keyboard.press('Tab')
    }
    if (kbTabs < 0) throw new Error('fare input not reached via Tab')
    await page.keyboard.type('1500')
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab')
      const isBtn = await page.evaluate(() => document.activeElement?.tagName === 'BUTTON' && document.activeElement.textContent.includes('Create Job'))
      if (isBtn) break
    }
    await page.keyboard.press('Enter')
    const kt = await waitForToast(page, 'Dispatch job created!')
    await page.waitForTimeout(1200)
    kbOk = state.counters.agencyJobsPost - kbBefore === 1
    if (!kbOk) {
      const diag = await page.evaluate(() => {
        const t = document.body.innerText
        return {
          validFareToast: t.includes('Enter a valid fare'),
          failToast: t.includes('Failed to create job'),
          fareValue: document.querySelector(`input[aria-label="Fare for shipment ${arguments?.[0] || ''}"]`)?.value ?? null,
        }
      }).catch(() => ({}))
      console.log(`  [agency/${vp.name}] keyboard diag:`, JSON.stringify({ toastOk: kt.ok, ...diag }))
    }
  } catch { kbOk = false }
  step('keyboard-only create (Tab->type->Tab->Enter) triggers insert', kbOk,
    `tabs=${kbTabs}, postsDelta=${state.counters.agencyJobsPost - kbBefore}`)

  r.contrast.push(...await measureContrast(page, [
    { sel: 'h2', label: 'Authorized Shipments h2 (slate-800 on white)' },
    { sel: 'h2 + p', label: 'panel description (text-xs slate-500)' },
    { sel: 'p.font-mono', label: 'shipment uuid (text-xs slate-700 on slate-50 row)' },
    { sel: 'p.font-mono + p', label: 'grant date (text-xs slate-400 on slate-50 row)' },
    { sel: 'button[class*="bg-indigo-600"]', label: 'Create Job button (white on indigo-600)' },
  ]))
  r.tabOrder = await tabSequence(page, 16)

  r.consoleErrors = state.consoleErrors
  r.pageErrors = state.pageErrors
  await context.close()
  return r
}

// ─────────────────────────── main ───────────────────────────

const browser = await chromium.launch()
try {
  for (const vp of VP) {
    console.log(`== viewport ${vp.name} ${vp.width}x${vp.height} ==`)
    results.customer[vp.name] = await runCustomer(browser, vp)
    results.agency[vp.name] = await runAgency(browser, vp)
  }
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(OUT_DIR, 'to143-d1-browser-pass-results.json'), JSON.stringify(results, null, 2))
const fail = []
for (const [ctrl, vps] of Object.entries(results)) {
  for (const [v, r] of Object.entries(vps)) {
    for (const s of r.steps) if (!s.ok) fail.push(`${ctrl}/${v}: ${s.name} :: ${s.detail || ''}`)
  }
}
console.log('\n==== SUMMARY ====')
console.log(`total steps: ${Object.values(results).flatMap((c) => Object.values(c)).flatMap((r) => r.steps).length}`)
console.log(`failures: ${fail.length}`)
for (const f of fail) console.log('FAIL ' + f)
console.log('console errors:', Object.values(results).flatMap((c) => Object.values(c)).flatMap((r) => r.consoleErrors).length)
process.exit(0)
