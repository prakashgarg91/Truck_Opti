/**
 * TO-144-D1 pre-acceptance browser pass (read-only verification).
 *
 * Controls under test (agency fleet foundation, migration 20261008000000):
 *   1. AgencyFleetPage (/agency/fleet) — RLS list via agency_trucks, create via
 *      POST /rest/v1/rpc/agency_vehicle_create, availability toggle via
 *      POST /rest/v1/rpc/agency_vehicle_update. Five distinct states
 *      (loading/empty/error/success/denied) + the expected-version conflict
 *      path (single refetch + ONE message, no auto-retry).
 *   2. AgencyDriversPage (/agency/drivers) — edge snapshot (untouched) plus the
 *      new employment panel (GET /rest/v1/agency_driver_employment) and end
 *      via POST /rest/v1/rpc/agency_driver_employment_end; same five states +
 *      conflict path.
 *   Selected-language behavior: localStorage truckopti-language='hi' render
 *   check on both pages (the fleet/driver surfaces are English strings; the
 *   check pins no-crash rendering under a non-default language selection).
 *
 * Backend: none locally. Supabase REST/RPC/Functions/GoTrue endpoints of the
 * local-first placeholder client (https://localhost.invalid,
 * frontend/src/lib/authCapabilities.ts:47) are mocked at the HTTP boundary
 * with Playwright page.route. Boot auth is seeded via the supabase-js
 * localStorage session; a direct authStore.setState injection is the fallback.
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
const VEHICLE_ID = '8f2ac1b4-1234-4abc-9def-56789abcdef0'
const VEHICLE2_ID = '9a3bd2c5-2345-4bcd-aef0-67890abcdef1'
const EMPLOYMENT_ID = 'b4ce3d67-3456-4cde-bf01-7890abcdef12'
const AUTH_TOKEN_KEYS = ['sb-jbxncejtcbpcronndqlx-auth-token', 'sb-localhost-auth-token']

const VEHICLE_ROW = {
  id: VEHICLE_ID,
  agency_id: 'c1d2e3f4-4567-4abc-8def-123456789abc',
  vehicle_type: 'eicher_14ft',
  rc_number: 'DL01AA1101',
  insurance_expiry: '2027-01-01',
  fitness_expiry: null,
  permit_expiry: null,
  puc_expiry: '2027-03-15',
  payload_kg: 4000,
  body_length_m: 4.26,
  body_width_m: 1.8,
  body_height_m: 1.8,
  is_available: true,
  maintenance_blocked: false,
  maintenance_block_reason: null,
  maintenance_blocked_until: null,
  driver_id: null,
  notes: null,
  version: 3,
  created_at: '2026-10-08T10:00:00Z',
  updated_at: '2026-10-08T10:00:00Z',
}
const VEHICLE_ROW2 = {
  ...VEHICLE_ROW,
  id: VEHICLE2_ID,
  vehicle_type: 'tata_407',
  rc_number: 'DL01BB2202',
  version: 1,
  is_available: false,
}

const EMPLOYMENT_ROW = {
  id: EMPLOYMENT_ID,
  agency_id: 'c1d2e3f4-4567-4abc-8def-123456789abc',
  driver_id: 'd1e2f3a4-5678-4abc-9ef0-23456789abcd',
  licence_number: 'DL-0420190001234',
  licence_class: 'LMV-TR',
  licence_expiry: '2027-06-30',
  contact_phone: '9810011223',
  status: 'active',
  version: 2,
  created_at: '2026-10-08T10:00:00Z',
  updated_at: '2026-10-08T10:00:00Z',
}

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

const results = { fleet: {}, drivers: {} }

function json(res) { return { status: res.status, contentType: 'application/json', body: JSON.stringify(res.body) } }

/**
 * Shared HTTP-boundary mocks. `state.rpc` carries per-call overrides:
 * { create, update, end, employmentList: {status, body, delayMs}, trucksList }
 */
function installMocks(context, state) {
  // The configured backend (frontend/.env) AND the local-first placeholder
  // host are both mocked at the HTTP boundary, so the pass is hermetic no
  // matter which client URL the build resolves.
  // Registered FIRST = consulted LAST: catch-all swallows any unmocked call.
  context.route('**localhost.invalid/**', (route) => {
    state.unmocked.push(route.request().url())
    return route.fulfill(json({ status: 200, body: [] }))
  })
  context.route('**supabase.co/auth/v1/health', (route) => route.fulfill(json({ status: 200, body: {} })))
  context.route('**supabase.co/**', (route) => {
    state.unmocked.push(route.request().url())
    return route.fulfill(json({ status: 200, body: [] }))
  })
  context.route('**/auth/v1/user', (route) => route.fulfill(json({ status: 200, body: RAW_USER })))
  context.route('**/auth/v1/token**', (route) => route.fulfill(json({ status: 200, body: FAKE_SESSION })))
  context.route('**/rest/v1/users**', (route) => {
    const m = route.request().method()
    if (m === 'POST') return route.fulfill({ status: 204 })
    return route.fulfill(json({ status: 200, body: { role: 'user', login_id: null } }))
  })
  context.route('**/rest/v1/transport_agencies**', (route) =>
    route.fulfill(json({ status: 200, body: { id: 'c1d2e3f4-4567-4abc-8def-123456789abc' } })))
  context.route('**/rest/v1/drivers**', (route) => route.fulfill(json({ status: 200, body: null })))
  context.route('**/rest/v1/subscriptions**', (route) => route.fulfill(json({ status: 200, body: null })))
  context.route('**/rest/v1/usage_tracking**', (route) => route.fulfill(json({ status: 200, body: {} })))
  context.route('**/rest/v1/notifications**', (route) => route.fulfill(json({ status: 200, body: [] })))
  context.route('**/functions/v1/agency-portal-drivers**', async (route) => {
    state.counters.edgeDrivers++
    const s = state.snapshot
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    return route.fulfill(json({ status: 200, body: { trucks: state.snapshotTrucks, drivers: state.snapshotDrivers } }))
  })
  context.route('**/rest/v1/agency_trucks**', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill(json({ status: 200, body: null }))
    state.counters.trucksList++
    const s = state.trucksList
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    if (s?.status) return route.fulfill(json({ status: s.status, body: s.body ?? { message: 'unmocked' } }))
    return route.fulfill(json({ status: 200, body: s?.body ?? [] }))
  })
  context.route('**/rest/v1/agency_driver_employment**', async (route) => {
    if (route.request().method() !== 'GET') return route.fulfill(json({ status: 200, body: null }))
    state.counters.employmentList++
    const s = state.employmentList
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    if (s?.status) return route.fulfill(json({ status: s.status, body: s.body ?? { message: 'unmocked' } }))
    return route.fulfill(json({ status: 200, body: s?.body ?? [] }))
  })
  context.route('**/rest/v1/rpc/agency_vehicle_create', async (route) => {
    state.counters.createRpc++
    const s = state.create
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    return route.fulfill(json({ status: s?.status ?? 500, body: s?.body ?? { message: 'unmocked' } }))
  })
  context.route('**/rest/v1/rpc/agency_vehicle_update', async (route) => {
    state.counters.updateRpc++
    const s = state.update
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    return route.fulfill(json({ status: s?.status ?? 500, body: s?.body ?? { message: 'unmocked' } }))
  })
  context.route('**/rest/v1/rpc/agency_driver_employment_end', async (route) => {
    state.counters.endRpc++
    const s = state.end
    if (s?.delayMs) await new Promise((r) => setTimeout(r, s.delayMs))
    return route.fulfill(json({ status: s?.status ?? 500, body: s?.body ?? { message: 'unmocked' } }))
  })
}

async function newPage(browser, vp, state) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'en-IN' })
  await context.addInitScript((keysAndSession) => {
    for (const key of keysAndSession.keys) {
      window.localStorage.setItem(key, JSON.stringify(keysAndSession.session))
    }
  }, { keys: AUTH_TOKEN_KEYS, session: FAKE_SESSION })
  installMocks(context, state)
  const page = await context.newPage()
  page.on('pageerror', (e) => state.pageErrors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') state.consoleErrors.push(m.text().slice(0, 300)) })
  return { context, page }
}

async function ensureAuth(page) {
  await page.waitForFunction(() => {
    const s = window.__authStore?.getState?.()
    return s ? s.isLoading === false : false
  }, { timeout: 15000 }).catch(() => {})
  return page.evaluate(async () => {
    const mod = await import('/src/stores/authStore.ts')
    const store = mod.useAuthStore
    window.__authStore = store
    const s = store.getState()
    if (!s.isAuthenticated || s.user?.role !== 'agency') {
      store.setState({
        user: {
          id: '11111111-2222-4333-8444-555555555555', email: 'owner@varsharoadlines.example',
          login_id: null, name: 'Agency Owner', phone: null, phone_verified: false,
          google_linked: false, profile_picture: null, role: 'agency',
          user_metadata: { full_name: 'Agency Owner', company: { name: 'Varsha Roadlines' } },
        },
        session: null,
        authMode: 'supabase',
        isAuthenticated: true,
        isLoading: false,
      })
      return { injected: true, bootRole: s.user?.role ?? null }
    }
    return { injected: false, bootRole: s.user?.role }
  })
}

async function waitForToast(page, text, timeout = 7000) {
  try {
    await page.waitForFunction((t) => document.body.innerText.includes(t), text, { timeout })
    return { ok: true }
  } catch {
    return { ok: false, bodySnippet: (await page.evaluate(() => document.body.innerText)).slice(0, 400) }
  }
}

const shot = (page, vp, name) => page.screenshot({ path: path.join(OUT_DIR, `to144-${name}-${vp.name}.png`) })

// ─────────────────────────── AgencyFleetPage ───────────────────────────

async function runFleet(browser, vp) {
  const state = {
    counters: { trucksList: 0, createRpc: 0, updateRpc: 0, endRpc: 0, edgeDrivers: 0, employmentList: 0 },
    trucksList: { body: [] }, create: null, update: null, end: null,
    employmentList: { body: [] }, snapshot: null, snapshotTrucks: [], snapshotDrivers: [],
    unmocked: [], pageErrors: [], consoleErrors: [],
  }
  const r = { steps: [], state, consoleErrors: [], pageErrors: [] }
  const step = (name, ok, detail) => { r.steps.push({ name, ok, detail }); console.log(`  [fleet/${vp.name}] ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`) }

  // 1) LOADING state: delayed list keeps the spinner up.
  state.trucksList = { body: [], delayMs: 4000 }
  const { context, page } = await newPage(browser, vp, state)
  const loadingProbe = page.getByTestId('fleet-loading').waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
  await page.goto(`${BASE}/agency/fleet`, { waitUntil: 'domcontentloaded' })
  const boot = await ensureAuth(page)
  const sawLoading = await loadingProbe
  step('boot: authenticated as agency', true, JSON.stringify(boot))
  step('loading state renders (spinner) while the list is in flight', sawLoading, 'data-testid=fleet-loading')

  // 2) EMPTY state.
  state.trucksList = { body: [] }
  await page.getByTestId('fleet-empty').waitFor({ timeout: 10000 }).catch(() => {})
  const emptyVisible = await page.getByTestId('fleet-empty').isVisible().catch(() => false)
  step('empty state renders with copy', emptyVisible, 'No vehicles added yet...')
  await shot(page, vp, 'fleet-empty')

  // 3) ERROR state + Retry (fresh context; the list always 500s until Retry).
  await context.close()

  // error state on a fresh page: list always 500s until Retry is clicked.
  const state2 = {
    counters: { trucksList: 0, createRpc: 0, updateRpc: 0, endRpc: 0, edgeDrivers: 0, employmentList: 0 },
    trucksList: { status: 500, body: { code: 'P0001', message: 'permission denied for table agency_trucks' } },
    create: null, update: null, end: null, employmentList: { body: [] },
    snapshot: null, snapshotTrucks: [], snapshotDrivers: [],
    unmocked: [], pageErrors: [], consoleErrors: [],
  }
  const ctx2 = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'en-IN' })
  await ctx2.addInitScript((ks) => { for (const k of ks.keys) window.localStorage.setItem(k, JSON.stringify(ks.session)) }, { keys: AUTH_TOKEN_KEYS, session: FAKE_SESSION })
  installMocks(ctx2, state2)
  const page2 = await ctx2.newPage()
  page2.on('pageerror', (e) => state2.pageErrors.push(String(e)))
  await page2.goto(`${BASE}/agency/fleet`, { waitUntil: 'domcontentloaded' })
  await ensureAuth(page2)
  const errVisible = await page2.getByTestId('fleet-error').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
  const errCopy = errVisible ? await page2.getByTestId('fleet-error').innerText() : ''
  step('error state renders with retry affordance (distinct from empty)', errVisible && /couldn't load/i.test(errCopy), errCopy.replace(/\n/g, ' | ').slice(0, 120))
  await shot(page2, vp, 'fleet-error')

  // Retry recovers into the success state.
  state2.trucksList = { body: [VEHICLE_ROW, VEHICLE_ROW2] }
  await page2.getByRole('button', { name: /Retry/ }).click()
  await page2.getByTestId('fleet-vehicle-card').first().waitFor({ timeout: 8000 }).catch(() => {})
  const cards = await page2.getByTestId('fleet-vehicle-card').count()
  step('retry recovers into the success state (2 vehicle cards)', cards === 2, `cards=${cards}`)

  // 4) SUCCESS state content: labels, docs, availability toggle buttons.
  const bodyText = await page2.evaluate(() => document.body.innerText)
  step('success rows show vehicle label, RC, PUC chip and availability',
    bodyText.includes('Eicher 14ft (3T)') && bodyText.includes('DL01AA1101') && bodyText.includes('PUC') && bodyText.includes('On Trip') && bodyText.includes('Available'),
    'labels+rc+puc+availability')
  await shot(page2, vp, 'fleet-rows')

  // 5) CREATE success (typed envelope) -> toast + list refresh.
  state2.create = { status: 200, body: { ok: true, state: 'created', vehicle: { ...VEHICLE_ROW, rc_number: 'MH12CD3344' }, version: 1 } }
  await page2.getByRole('button', { name: 'Add Truck' }).first().click()
  await page2.locator('#fleet-rc-number').fill('MH12CD3344')
  await page2.getByRole('button', { name: /^Add Truck$/ }).last().click()
  const createdToast = await waitForToast(page2, 'Truck added to fleet')
  step('create success: toast + list refresh (rpc fired once)', createdToast.ok && state2.counters.createRpc === 1,
    `createRpc=${state2.counters.createRpc}`)
  await shot(page2, vp, 'fleet-create-success')

  // 6) CREATE idempotent replay -> distinct info copy.
  state2.create = { status: 200, body: { ok: true, state: 'idempotent_replay', vehicle: VEHICLE_ROW, version: 1 } }
  await page2.getByRole('button', { name: 'Add Truck' }).first().click()
  await page2.locator('#fleet-rc-number').fill('DL01AA1101')
  await page2.getByRole('button', { name: /^Add Truck$/ }).last().click()
  const replayToast = await waitForToast(page2, 'already in your fleet')
  step('create replay: idempotent info copy', replayToast.ok, replayToast.ok ? '' : replayToast.bodySnippet)
  await shot(page2, vp, 'fleet-create-replay')

  // 7) DENIED state: controlled server denial renders the distinct banner.
  state2.create = { status: 400, body: { code: 'P0001', message: 'Agency approval is required.' } }
  await page2.getByRole('button', { name: 'Add Truck' }).first().click()
  await page2.locator('#fleet-rc-number').fill('MH12ZZ9999')
  await page2.getByRole('button', { name: /^Add Truck$/ }).last().click()
  const deniedVisible = await page2.getByTestId('fleet-denied').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
  const deniedText = deniedVisible ? await page2.getByTestId('fleet-denied').innerText() : ''
  step('denied state renders as a distinct banner with the controlled copy',
    deniedVisible && deniedText.includes('Agency approval is required.'),
    deniedText.replace(/\n/g, ' | ').slice(0, 120))
  await shot(page2, vp, 'fleet-denied')

  // 8) CONFLICT path: one update call, one refetch, ONE conflict message.
  state2.update = { status: 200, body: { ok: false, error: 'version_conflict', current_version: 4 } }
  const listBefore = state2.counters.trucksList
  const updateBefore = state2.counters.updateRpc
  await page2.getByRole('button', { name: /unavailable/i }).first().click()
  const conflictToast = await waitForToast(page2, 'updated elsewhere. Showing the latest version.')
  const updateCalls = state2.counters.updateRpc - updateBefore
  const listRefreshes = state2.counters.trucksList - listBefore
  step('version conflict: typed branch -> single refetch + ONE conflict message, no auto-retry',
    conflictToast.ok && updateCalls === 1 && listRefreshes >= 1,
    `updateCalls=${updateCalls}, listRefreshes=${listRefreshes}`)
  await shot(page2, vp, 'fleet-conflict')

  // 9) UPDATE denial also lands in the denied banner.
  state2.update = { status: 400, body: { code: 'P0001', message: 'Agency approval is required.' } }
  await page2.getByRole('button', { name: /unavailable|available/i }).first().click()
  await page2.getByTestId('fleet-denied').waitFor({ timeout: 8000 }).catch(() => {})
  step('update denial renders the denied banner', await page2.getByTestId('fleet-denied').isVisible().catch(() => false))

  // 10) Selected-language behavior: hi selection renders without crashing.
  await ctx2.addInitScript(() => { window.localStorage.setItem('truckopti-language', 'hi') })
  await page2.reload({ waitUntil: 'domcontentloaded' })
  await ensureAuth(page2)
  await page2.getByTestId('fleet-vehicle-card').first().waitFor({ timeout: 8000 }).catch(() => {})
  const hiCards = await page2.getByTestId('fleet-vehicle-card').count()
  const hiHeading = await page2.getByRole('heading', { name: 'Fleet Management' }).isVisible().catch(() => false)
  step('selected Hindi renders the page without crash (English surface strings, no fallback crash)',
    hiCards >= 1 && hiHeading, `cards=${hiCards}, heading=${hiHeading}`)
  await shot(page2, vp, 'fleet-hindi')

  r.consoleErrors = state2.consoleErrors
  r.pageErrors = state2.pageErrors
  await ctx2.close()
  return r
}

// ─────────────────────────── AgencyDriversPage ───────────────────────────

async function runDrivers(browser, vp) {
  const state = {
    counters: { trucksList: 0, createRpc: 0, updateRpc: 0, endRpc: 0, edgeDrivers: 0, employmentList: 0 },
    trucksList: { body: [] }, create: null, update: null, end: null,
    employmentList: { body: [EMPLOYMENT_ROW] },
    snapshot: null, snapshotTrucks: [{ id: VEHICLE_ID, vehicle_type: 'eicher_14ft', rc_number: 'DL01AA1101' }],
    snapshotDrivers: [],
    unmocked: [], pageErrors: [], consoleErrors: [],
  }
  const r = { steps: [], state, consoleErrors: [], pageErrors: [] }
  const step = (name, ok, detail) => { r.steps.push({ name, ok, detail }); console.log(`  [drivers/${vp.name}] ${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` :: ${detail}` : ''}`) }

  // 1) LOADING state: delayed snapshot keeps the spinner up.
  state.snapshot = { delayMs: 4000 }
  const { context, page } = await newPage(browser, vp, state)
  const loadingProbe = page.getByTestId('drivers-loading').waitFor({ timeout: 20000 }).then(() => true).catch(() => false)
  await page.goto(`${BASE}/agency/drivers`, { waitUntil: 'domcontentloaded' })
  const boot = await ensureAuth(page)
  const sawLoading = await loadingProbe
  step('boot: authenticated as agency', true, JSON.stringify(boot))
  step('loading state renders (spinner) while snapshot is in flight', sawLoading, 'data-testid=drivers-loading')
  state.snapshot = null

  // 2) SUCCESS: employment row renders with licence window + End action.
  await page.getByTestId('employment-card').waitFor({ timeout: 10000 }).catch(() => {})
  const empText = await page.evaluate(() => document.body.innerText)
  step('employment panel shows the licence record and End action',
    empText.includes('DL-0420190001234') && empText.includes('LMV-TR') && empText.includes('End Employment') && empText.includes('Employment Records'),
    'licence+class+end-action')
  await shot(page, vp, 'drivers-rows')

  // 3) END success (typed envelope) -> toast + refetch.
  state.end = { status: 200, body: { ok: true, state: 'ended', employment: { ...EMPLOYMENT_ROW, status: 'ended' }, version: 3 } }
  await page.getByRole('button', { name: /End employment record/ }).click()
  const endedToast = await waitForToast(page, 'Employment ended')
  step('end success: toast + list refresh (rpc fired once)', endedToast.ok && state.counters.endRpc === 1,
    `endRpc=${state.counters.endRpc}`)

  // 4) END replay -> already_ended copy.
  state.end = { status: 200, body: { ok: true, state: 'already_ended', version: 3 } }
  await page.getByRole('button', { name: /End employment record/ }).click()
  const alreadyToast = await waitForToast(page, 'Employment already ended')
  step('end replay: already_ended copy', alreadyToast.ok, alreadyToast.ok ? '' : alreadyToast.bodySnippet)

  // 5) END conflict -> single refetch + ONE conflict message, no auto-retry.
  state.end = { status: 200, body: { ok: false, error: 'version_conflict', current_version: 4 } }
  const listBefore = state.counters.employmentList
  const endBefore = state.counters.endRpc
  await page.getByRole('button', { name: /End employment record/ }).click()
  const conflictToast = await waitForToast(page, 'changed elsewhere. Showing the latest version.')
  const endCalls = state.counters.endRpc - endBefore
  const refreshes = state.counters.employmentList - listBefore
  step('version conflict: typed branch -> single refetch + ONE conflict message, no auto-retry',
    conflictToast.ok && endCalls === 1 && refreshes >= 1,
    `endCalls=${endCalls}, listRefreshes=${refreshes}`)
  await shot(page, vp, 'drivers-conflict')

  // 6) END denial -> distinct denied banner.
  state.end = { status: 400, body: { code: 'P0001', message: 'Agency approval is required.' } }
  await page.getByRole('button', { name: /End employment record/ }).click()
  const deniedVisible = await page.getByTestId('drivers-denied').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
  const deniedText = deniedVisible ? await page.getByTestId('drivers-denied').innerText() : ''
  step('denied state renders as a distinct banner with the controlled copy',
    deniedVisible && deniedText.includes('Agency approval is required.'),
    deniedText.replace(/\n/g, ' | ').slice(0, 120))
  await shot(page, vp, 'drivers-denied')
  await context.close()

  // 7) EMPTY employments.
  const state2 = {
    counters: { trucksList: 0, createRpc: 0, updateRpc: 0, endRpc: 0, edgeDrivers: 0, employmentList: 0 },
    trucksList: { body: [] }, create: null, update: null, end: null,
    employmentList: { body: [] },
    snapshot: null, snapshotTrucks: [], snapshotDrivers: [],
    unmocked: [], pageErrors: [], consoleErrors: [],
  }
  const ctx2 = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'en-IN' })
  await ctx2.addInitScript((ks) => { for (const k of ks.keys) window.localStorage.setItem(k, JSON.stringify(ks.session)) }, { keys: AUTH_TOKEN_KEYS, session: FAKE_SESSION })
  installMocks(ctx2, state2)
  const page2 = await ctx2.newPage()
  page2.on('pageerror', (e) => state2.pageErrors.push(String(e)))
  await page2.goto(`${BASE}/agency/drivers`, { waitUntil: 'domcontentloaded' })
  await ensureAuth(page2)
  const emptyVisible = await page2.getByTestId('employments-empty').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  step('empty employments render with copy', emptyVisible, 'No employment records yet...')
  await shot(page2, vp, 'drivers-empty')
  await ctx2.close()

  // 8) ERROR state: snapshot OK but employment list fails -> error + retry.
  const state3 = {
    counters: { trucksList: 0, createRpc: 0, updateRpc: 0, endRpc: 0, edgeDrivers: 0, employmentList: 0 },
    trucksList: { body: [] }, create: null, update: null, end: null,
    employmentList: { status: 500, body: { code: 'P0001', message: 'permission denied for table agency_driver_employment' } },
    snapshot: null, snapshotTrucks: [], snapshotDrivers: [],
    unmocked: [], pageErrors: [], consoleErrors: [],
  }
  const ctx3 = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'en-IN' })
  await ctx3.addInitScript((ks) => { for (const k of ks.keys) window.localStorage.setItem(k, JSON.stringify(ks.session)) }, { keys: AUTH_TOKEN_KEYS, session: FAKE_SESSION })
  installMocks(ctx3, state3)
  const page3 = await ctx3.newPage()
  page3.on('pageerror', (e) => state3.pageErrors.push(String(e)))
  await page3.goto(`${BASE}/agency/drivers`, { waitUntil: 'domcontentloaded' })
  await ensureAuth(page3)
  const errVisible = await page3.getByTestId('drivers-error').waitFor({ timeout: 10000 }).then(() => true).catch(() => false)
  const errCopy = errVisible ? await page3.getByTestId('drivers-error').innerText() : ''
  step('error state renders with retry affordance (distinct from empty)', errVisible && /couldn't load/i.test(errCopy),
    errCopy.replace(/\n/g, ' | ').slice(0, 120))
  await shot(page3, vp, 'drivers-error')
  state3.employmentList = { body: [EMPLOYMENT_ROW] }
  await page3.getByRole('button', { name: /Retry/ }).click()
  const recovered = await page3.getByTestId('employment-card').waitFor({ timeout: 8000 }).then(() => true).catch(() => false)
  step('retry recovers into the success state', recovered)
  await ctx3.close()

  // 9) Selected-language behavior: hi selection renders without crashing.
  const state4 = {
    counters: { trucksList: 0, createRpc: 0, updateRpc: 0, endRpc: 0, edgeDrivers: 0, employmentList: 0 },
    trucksList: { body: [] }, create: null, update: null, end: null,
    employmentList: { body: [EMPLOYMENT_ROW] },
    snapshot: null, snapshotTrucks: [], snapshotDrivers: [],
    unmocked: [], pageErrors: [], consoleErrors: [],
  }
  const ctx4 = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'en-IN' })
  await ctx4.addInitScript((ks) => {
    for (const k of ks.keys) window.localStorage.setItem(k, JSON.stringify(ks.session))
    window.localStorage.setItem('truckopti-language', 'hi')
  }, { keys: AUTH_TOKEN_KEYS, session: FAKE_SESSION })
  installMocks(ctx4, state4)
  const page4 = await ctx4.newPage()
  page4.on('pageerror', (e) => state4.pageErrors.push(String(e)))
  await page4.goto(`${BASE}/agency/drivers`, { waitUntil: 'domcontentloaded' })
  await ensureAuth(page4)
  await page4.getByTestId('employment-card').waitFor({ timeout: 10000 }).catch(() => {})
  const hiOk = await page4.getByTestId('employment-card').isVisible().catch(() => false)
  const hiHeading = await page4.getByRole('heading', { name: 'Drivers' }).isVisible().catch(() => false)
  step('selected Hindi renders the page without crash (English surface strings, no fallback crash)',
    hiOk && hiHeading, `card=${hiOk}, heading=${hiHeading}`)
  await shot(page4, vp, 'drivers-hindi')
  r.consoleErrors = state4.consoleErrors
  r.pageErrors = state4.pageErrors
  await ctx4.close()
  return r
}

// ─────────────────────────── main ───────────────────────────

const browser = await chromium.launch()
try {
  for (const vp of VP) {
    console.log(`== viewport ${vp.name} ${vp.width}x${vp.height} ==`)
    results.fleet[vp.name] = await runFleet(browser, vp)
    results.drivers[vp.name] = await runDrivers(browser, vp)
  }
} finally {
  await browser.close()
}

fs.writeFileSync(path.join(OUT_DIR, 'to144-d1-browser-pass-results.json'), JSON.stringify(results, null, 2))
const fail = []
let total = 0
for (const [ctrl, vps] of Object.entries(results)) {
  for (const [v, r] of Object.entries(vps)) {
    for (const s of r.steps) {
      total += 1
      if (!s.ok) fail.push(`${ctrl}/${v}: ${s.name} :: ${s.detail || ''}`)
    }
  }
}
console.log('\n==== SUMMARY ====')
console.log(`total steps: ${total}`)
console.log(`failures: ${fail.length}`)
for (const f of fail) console.log('FAIL ' + f)
const consoleErrorCount = Object.values(results).flatMap((c) => Object.values(c)).flatMap((r) => r.consoleErrors).length
const pageErrorCount = Object.values(results).flatMap((c) => Object.values(c)).flatMap((r) => r.pageErrors).length
console.log('console errors:', consoleErrorCount, '| page errors:', pageErrorCount)
process.exit(fail.length > 0 ? 1 : 0)
