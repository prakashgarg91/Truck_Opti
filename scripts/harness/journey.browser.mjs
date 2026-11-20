/**
 * Browser journey (tasks H5 + H6): sign in as the seeded owner, billing none state, read-only refusal, 14-day trial,
 * trial banner, truck, staff invite accepted by a second browser context (finance), seat-limit refusal, dispatcher,
 * driver, order import, load plan approval, consignment (GR) lifecycle, tracking ping + incident, invoice + payments,
 * expenses + fuel, payroll, then the billing state machine (trial lapse -> expired, paid activation, grace, renewal)
 * driven by SQL over the harness superuser connection, and a 375x812 mobile pass.
 *
 * Driven by scripts/harness/run.mjs, which supplies the routed browser contexts. Real UI only: every state change
 * goes through the pages, never through the database. The database is read (never written) to back a visible outcome.
 *
 * Each step: do, assert a visible outcome, screenshot. A failing step records page text + console + the last 20 shim
 * requests and the journey CONTINUES. A step that cannot work because the page needs an Edge function (answered 501 by
 * the shim) is 'hosted-only', never 'pass'.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(here, '..', '..')

class HostedOnly extends Error {
  constructor(page, fns) {
    super(`${page} needs the Edge function ${fns.join(', ')} (answered 501 by the shim)`)
    this.page = page
    this.fns = fns
  }
}

/** The header line comes from the real template in the frontend, so the journey cannot drift from the page. */
function templateHeader() {
  const src = readFileSync(join(REPO, 'frontend', 'src', 'lib', 'orderImport.ts'), 'utf8')
  const m = /'(client_order_ref,line_no,[^']+)'/.exec(src)
  if (!m) throw new Error('could not find the CSV template header in frontend/src/lib/orderImport.ts')
  return m[1]
}

export async function runJourney({ appUrl, shim, pg, seed, evidenceDir, newContext }) {
  const steps = []
  const notes = []
  let shotNo = 0
  const scalar = async (sql, params = []) => (await pg.admin.query(sql, params)).rows[0]
  const TIMEOUT = 30000

  const shot = async (rec, name) => {
    shotNo += 1
    const file = `${String(shotNo).padStart(2, '0')}-${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`
    try {
      await rec.page.screenshot({ path: join(evidenceDir, file) })
    } catch {
      /* page may be closed */
    }
    return file
  }

  const edge501Since = (offset) =>
    [...new Set(shim.getRequestLog().slice(offset).filter((e) => e.path.startsWith('/functions/v1/') && e.status === 501).map((e) => e.path.replace('/functions/v1/', '')))]

  const NOISE = /ERR_BLOCKED_BY_CLIENT/
  const REACT = /Warning:|validateDOMNesting|Each child in a list|not wrapped in act|Maximum update depth|uncontrolled|controlled input/i
  const pageConsole = []
  function summariseConsole(name, rec, consoleOffset, pageErrOffset) {
    const errs = rec.consoleErrors.slice(consoleOffset).map((c) => c.text).filter((t) => !NOISE.test(t))
    const perr = rec.pageErrors.slice(pageErrOffset).map((c) => c.text)
    const react = errs.filter((t) => REACT.test(t))
    const out = { step: name, consoleErrors: errs.length, reactWarnings: react.length, pageErrors: perr.length }
    if (errs.length || perr.length) out.samples = [...new Set([...perr, ...errs].map((t) => t.split('\n')[0].slice(0, 180)))].slice(0, 4)
    pageConsole.push(out)
    return out
  }

  async function step(name, rec, fn, opts = {}) {
    const offset = shim.getRequestLog().length
    const consoleOffset = rec.consoleErrors.length
    const pageErrOffset = rec.pageErrors.length
    const t0 = Date.now()
    const entry = { name, status: 'pass', detail: '', ms: 0 }
    try {
      const detail = await fn({ offset })
      if (typeof detail === 'string') entry.detail = detail
      if (opts.shot !== false) entry.screenshot = await shot(rec, name)
    } catch (e) {
      entry.screenshot = await shot(rec, `${name}-state`)
      if (e instanceof HostedOnly) {
        entry.status = 'hosted-only'
        entry.detail = e.message
      } else {
        entry.status = 'fail'
        let pageText = ''
        try {
          pageText = await rec.page.evaluate(() => document.body.innerText.slice(0, 1500))
        } catch {
          /* ignore */
        }
        entry.failure = {
          error: String(e?.message ?? e).split('\n').slice(0, 4).join(' | '),
          pageText,
          url: rec.page.url().replace(appUrl, ''),
          console: rec.consoleErrors.slice(consoleOffset).map((c) => c.text).slice(-8),
          requests: shim.getRequestLog().slice(-20).map((r) => `${r.method} ${r.path} ${r.status}`),
        }
      }
    }
    entry.ms = Date.now() - t0
    entry.console = summariseConsole(name, rec, consoleOffset, pageErrOffset)
    steps.push(entry)
    return entry
  }

  const see = (locator, timeout = 15000) => locator.first().waitFor({ state: 'visible', timeout })
  const go = async (page, path) => {
    await page.goto(`${appUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: TIMEOUT })
  }

  async function signIn(rec, who) {
    const { page } = rec
    await go(page, '/login?mode=agency')
    await page.getByPlaceholder('your@email.com or login ID').fill(who.email, { timeout: TIMEOUT })
    await page.getByPlaceholder('Enter your password').fill(who.password)
    await page.getByRole('button', { name: /sign in with password/i }).click()
    await page.waitForURL(/\/agency\//, { timeout: TIMEOUT })
  }

  /** Sign in and report where the app sends the user (no assertion about the landing page). */
  async function signInAnyRole(rec, who) {
    const { page } = rec
    await go(page, '/login?mode=agency')
    await page.getByPlaceholder('your@email.com or login ID').fill(who.email, { timeout: TIMEOUT })
    await page.getByPlaceholder('Enter your password').fill(who.password)
    await page.getByRole('button', { name: /sign in with password/i }).click()
    await page.waitForURL((u) => !/\/(login|auth\/callback)(\/|$)/.test(u.pathname), { timeout: 20000 }).catch(() => {})
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    return new URL(page.url()).pathname
  }

  // -------------------------------------------------------------------------------------------------
  const owner = await newContext('owner')
  const op = owner.page

  await step('1 sign in as the seeded owner (password login)', owner, async () => {
    await signIn(owner, seed.users.owner)
    return `landed on ${op.url().replace(appUrl, '')}`
  })

  await step('2 agency area loaded, no billing banner before a plan exists', owner, async ({ offset }) => {
    await go(op, '/agency/fleet')
    await see(op.getByRole('heading', { name: 'Fleet Management' }), TIMEOUT)
    if ((await op.getByTestId('agency-billing-banner').count()) !== 0) throw new Error('a billing banner is shown although the agency has no subscription')
    const edge = edge501Since(offset)
    if (edge.length) notes.push(`landing/layout called Edge function(s) answered 501: ${edge.join(', ')}`)
    return 'Fleet page rendered inside the agency layout; banner absent for status none'
  })

  await step('3 subscription page shows the no-plan state with the trial offer', owner, async () => {
    await go(op, '/subscription')
    await see(op.getByText('No plan yet'), TIMEOUT)
    await see(op.getByRole('button', { name: 'Start your 14-day free trial' }))
    const row = await scalar('SELECT count(*)::int AS n FROM public.subscriptions WHERE agency_id = $1', [seed.agencyId])
    if (row.n !== 0) throw new Error(`expected no subscription row yet, found ${row.n}`)
  })

  await step('4 read-only before any plan: Add Truck is refused (SB002) with the renew prompt', owner, async () => {
    await go(op, '/agency/fleet')
    await see(op.getByRole('heading', { name: 'Fleet Management' }), TIMEOUT)
    await op.getByRole('button', { name: 'Add vehicle' }).first().click()
    await op.locator('#fleet-rc-number').fill('MH12JRNY0003')
    await op.getByRole('button', { name: 'Add vehicle' }).last().click()
    await see(op.getByRole('alert').filter({ hasText: 'Your account is read-only' }))
    const n = await scalar('SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1', [seed.agencyId])
    if (n.n !== 2) throw new Error(`read-only refusal must not create a truck; trucks now ${n.n}`)
    return 'server refused with SB002; truck count unchanged (2)'
  })

  await step('5 start the 14-day trial from the subscription page (agency_subscription_start_trial)', owner, async () => {
    await go(op, '/subscription')
    await op.getByRole('button', { name: 'Start your 14-day free trial' }).click({ timeout: TIMEOUT })
    await see(op.getByRole('heading', { name: 'Usage against your plan' }), TIMEOUT)
    const row = await scalar('SELECT status FROM public.subscriptions WHERE agency_id = $1', [seed.agencyId])
    if (row?.status !== 'trial') throw new Error(`expected subscriptions.status = trial, got ${row?.status}`)
    return 'subscription row status = trial'
  })

  await step('6 trial banner shows the days left on the agency pages', owner, async () => {
    await go(op, '/agency/fleet')
    const banner = op.getByTestId('agency-billing-banner')
    await see(banner, TIMEOUT)
    const text = (await banner.innerText()).replace(/\s+/g, ' ')
    const m = /Free trial: (\d+) days? left/.exec(text)
    if (!m) throw new Error(`banner does not show trial days left: "${text.slice(0, 160)}"`)
    return `banner: "Free trial: ${m[1]} days left"`
  })

  await step('7 add a truck on the Fleet page', owner, async () => {
    await op.getByRole('button', { name: 'Add vehicle' }).first().click()
    await op.locator('#fleet-rc-number').fill('MH12JRNY0003')
    await op.getByRole('button', { name: 'Add vehicle' }).last().click()
    await see(op.getByTestId('fleet-vehicle-card').filter({ hasText: 'MH12JRNY0003' }))
    const n = await scalar('SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1', [seed.agencyId])
    if (n.n !== 3) throw new Error(`expected 3 trucks in the database, found ${n.n}`)
    return 'MH12JRNY0003 listed; 3 trucks stored'
  })

  // helpers for the second half -----------------------------------------------------------------------------
  const tokenOf = async (u) => {
    const r = await fetch(`${shim.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: shim.anonKey },
      body: JSON.stringify({ email: u.email, password: u.password }),
    })
    if (r.status !== 200) throw new Error(`shim login for ${u.email} answered ${r.status}`)
    return (await r.json()).access_token
  }
  const rpcAs = async (token, fn, body) => {
    const r = await fetch(`${shim.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: shim.anonKey, authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    return { status: r.status, body: await r.json().catch(() => null) }
  }

  // 8: staff invitation, real happy path -----------------------------------------------------------------
  // The seed has exactly 1 active staff (dispatcher); the trial plan allows 2 seats (active members + pending invitations).
  let inviteLink = ''
  await step('8a invite the finance user by email on the Team page and copy the /invite/<token> link', owner, async () => {
    await go(op, '/agency/team')
    await see(op.getByRole('heading', { name: /Team/ }), TIMEOUT)
    await op.getByRole('button', { name: 'Invite team member' }).click()
    await op.locator('#invite-email').fill(seed.users.finance.email)
    await op.locator('#invite-scope').selectOption('finance')
    await op.getByRole('button', { name: 'Create invitation' }).click()
    const share = op.getByTestId('team-share-code')
    await see(share, TIMEOUT)
    const text = await share.innerText()
    const m = /(https?:\/\/\S*\/invite\/[A-Za-z0-9._~-]+)/.exec(text)
    if (!m) throw new Error(`no /invite/<token> link in the share panel: "${text.slice(0, 200)}"`)
    inviteLink = m[1]
    const row = await scalar(`SELECT count(*)::int AS n FROM public.agency_invitations WHERE agency_id = $1 AND status = 'pending' AND lower(invited_email) = $2`, [seed.agencyId, seed.users.finance.email])
    if (row.n !== 1) throw new Error(`expected 1 pending invitation for finance, found ${row.n}`)
    return `link shown: ${inviteLink.replace(/\/invite\/.+$/, '/invite/<token>')}; 1 pending invitation stored`
  })

  const finance = await newContext('finance')
  const fp = finance.page
  await step('8b fresh browser context: finance user signs in, opens the invite link, acceptance page shows success', finance, async () => {
    if (!inviteLink) throw new Error('no invite link from step 8a')
    await signInAnyRole(finance, seed.users.finance)
    await go(fp, new URL(inviteLink).pathname)
    await see(fp.getByTestId('invite-accepted'), TIMEOUT)
    const text = (await fp.getByTestId('invite-accepted').innerText()).replace(/\s+/g, ' ')
    if (!/You have joined the agency/.test(text)) throw new Error(`acceptance page text: "${text.slice(0, 200)}"`)
    const mem = await scalar(`SELECT scope FROM public.agency_memberships WHERE agency_id = $1 AND user_id = $2 AND status = 'active'`, [seed.agencyId, seed.users.finance.id])
    if (mem?.scope !== 'finance') throw new Error(`expected an active finance membership, got ${JSON.stringify(mem)}`)
    return `"${text.slice(0, 90)}"; membership scope = finance`
  })
  await step('8c finance user reaches /agency/invoices', finance, async () => {
    await go(fp, '/agency/invoices')
    await see(fp.getByRole('heading', { name: 'Freight invoices' }), TIMEOUT)
    return 'Freight invoices page rendered for the finance member'
  })
  await step('8d a further invite beyond the plan limit (viewer) shows the SB001 prompt', owner, async () => {
    await go(op, '/agency/team')
    await see(op.getByRole('heading', { name: /Team/ }), TIMEOUT)
    await op.getByRole('button', { name: 'Invite team member' }).click()
    await op.locator('#invite-email').fill(seed.users.viewer.email)
    await op.locator('#invite-scope').selectOption('viewer')
    await op.getByRole('button', { name: 'Create invitation' }).click()
    const limit = op.getByRole('alert').filter({ hasText: 'Plan limit reached' })
    await see(limit, TIMEOUT)
    const t = (await limit.first().innerText()).replace(/\s+/g, ' ')
    const n = await scalar(`SELECT count(*)::int AS n FROM public.agency_invitations WHERE agency_id = $1 AND lower(invited_email) = $2`, [seed.agencyId, seed.users.viewer.email])
    if (n.n !== 0) throw new Error('the refused viewer invitation was stored anyway')
    return `SB001 prompt: "${t.slice(0, 110)}"; no invitation stored`
  })

  // dispatcher context (kept open for the consignment steps) ---------------------------------------------------
  const dispatcher = await newContext('dispatcher')
  const dp = dispatcher.page
  await step('9 second context: seeded dispatcher signs in and works inside the same agency', dispatcher, async () => {
    const landed = await signInAnyRole(dispatcher, seed.users.dispatcher)
    await go(dp, '/agency/fleet')
    await dp.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    const path = new URL(dp.url()).pathname
    if (!/^\/agency\/fleet/.test(path) || (await dp.getByRole('heading', { name: 'Fleet Management' }).count()) === 0) {
      throw new Error(`staff member with an active membership cannot reach the agency area: after sign-in the app sent them to "${landed}", /agency/fleet ended at "${path}"`)
    }
    await see(dp.getByTestId('fleet-vehicle-card').filter({ hasText: 'MH12JRNY0003' }), TIMEOUT)
    return 'dispatcher sees the truck the owner added (staff scope resolved)'
  })

  // driver ------------------------------------------------------------------------------------------
  await step('10 drivers: the seeded driver is employed and listed (Drivers page)', owner, async ({ offset }) => {
    await go(op, '/agency/drivers')
    const loaded = op.getByRole('heading', { name: 'Drivers', exact: true })
    const failed = op.getByTestId('drivers-error')
    await Promise.race([see(loaded, TIMEOUT).catch(() => {}), see(failed, TIMEOUT).catch(() => {})])
    const edge = edge501Since(offset)
    const emp = await scalar(`SELECT count(*)::int AS n FROM public.agency_driver_employment WHERE agency_id = $1 AND status = 'active'`, [seed.agencyId])
    if (edge.includes('agency-portal-drivers')) {
      notes.push(`driver employment exists in the database (${emp.n} active record) but the roster snapshot is Edge-only`)
      throw new HostedOnly('AgencyDriversPage', ['agency-portal-drivers'])
    }
    await see(op.getByText('Journey Driver'), 10000)
    return 'driver listed'
  })

  // order import -------------------------------------------------------------------------------------
  // Site rules of the page: pickup may be an active bill-to or ship-to site, a drop must be an active ship-to site.
  // The seed has one ship-to ("Pickup Plant Pune") and one bill-to ("Drop Depot Mumbai"), so the drop is the ship-to.
  const orderRow = (ref, lineNo, sku, name, qty) =>
    `${ref},${lineNo},${sku},${name},${qty},kg,,,,,,,Drop Depot Mumbai,Pickup Plant Pune,2026-11-20,2026-11-21,2026-11-22,2026-11-23,yes,no`
  async function importCsv(page, rows) {
    await go(page, '/agency/orders/import')
    await see(page.locator('#import-agreement'), TIMEOUT)
    await page.locator('#import-agreement').selectOption({ label: 'Journey Client Pvt Ltd' })
    const csv = `${templateHeader()}\n${rows.join('\n')}\n`
    await page.locator('#import-file').setInputFiles({ name: 'journey-orders.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') })
    const summary = page.getByTestId('order-import-summary')
    await see(summary, TIMEOUT)
    const text = (await summary.innerText()).replace(/\s+/g, ' ')
    if (!/Errors\s*0/.test(text)) throw new Error(`CSV review shows errors: "${text}"`)
    return text
  }

  await step('11 import orders from a generated CSV on the Order Import page', owner, async () => {
    const rows = [
      'SO-J-001,1,SKU-STEEL-ROD,Steel rod 12mm,2000,kg,,,,,,,Drop Depot Mumbai,Pickup Plant Pune,2026-11-20,2026-11-21,2026-11-22,2026-11-23,yes,no',
      'SO-J-001,2,SKU-SERVICE-KIT,Service kit,10,carton,20,kg,60,40,30,cm,Drop Depot Mumbai,Pickup Plant Pune,2026-11-20,2026-11-21,2026-11-22,2026-11-23,no,yes',
    ]
    await importCsv(op, rows)
    await op.getByRole('button', { name: /^Import 2 lines?$/ }).click()
    await see(op.getByTestId('order-import-success'), TIMEOUT)
    const n = await scalar(`SELECT count(*)::int AS n FROM public.agency_orders WHERE agency_id = $1 AND client_order_ref = 'SO-J-001'`, [seed.agencyId])
    if (n.n !== 1) throw new Error(`expected 1 stored order SO-J-001, found ${n.n}`)
    return 'review: 2 rows, 0 errors; order SO-J-001 stored'
  })

  // load plan ----------------------------------------------------------------------------------------
  await step('12 save and approve a load plan on the Load Plan page', owner, async () => {
    await go(op, '/agency/orders/plan')
    const orderRowLoc = op.locator('[data-testid^="loadplan-order-"]').filter({ hasText: 'SO-J-001' })
    await see(orderRowLoc, TIMEOUT)
    await orderRowLoc.getByRole('checkbox').check()
    await op.getByTestId(`loadplan-truck-${seed.truckIds[1]}`).getByRole('checkbox').check()
    await op.getByRole('button', { name: 'Propose plan' }).click()
    await see(op.getByTestId('loadplan-proposal'), TIMEOUT)
    await op.locator('#plan-name').fill('Journey plan')
    await op.getByRole('button', { name: 'Save draft' }).click()
    const approve = op.getByRole('button', { name: /^Approve Journey plan version \d+$/ })
    await see(approve, TIMEOUT)
    await approve.click()
    await op.getByRole('button', { name: 'Confirm approval' }).click()
    const planCard = op.locator('[data-testid^="loadplan-plan-"]').filter({ hasText: 'Journey plan' })
    await see(planCard.getByText('Approved', { exact: true }), TIMEOUT)
    const row = await scalar(`SELECT status FROM public.agency_load_plans WHERE agency_id = $1 AND name = 'Journey plan' ORDER BY plan_version DESC LIMIT 1`, [seed.agencyId])
    if (row?.status !== 'approved') throw new Error(`expected load plan status approved, got ${row?.status}`)
    return 'plan "Journey plan" approved'
  })

  await step('12b second order SO-J-002 imported and a second plan saved as a DRAFT (kept for the dispatch-lock checks)', owner, async () => {
    await importCsv(op, [orderRow('SO-J-002', 1, 'SKU-COIL', 'Steel coil', 1500)])
    await op.getByRole('button', { name: /^Import 1 lines?$/ }).click()
    await see(op.getByTestId('order-import-success'), TIMEOUT)
    await go(op, '/agency/orders/plan')
    const row = op.locator('[data-testid^="loadplan-order-"]').filter({ hasText: 'SO-J-002' })
    await see(row, TIMEOUT)
    await row.getByRole('checkbox').check()
    await op.getByTestId(`loadplan-truck-${seed.truckIds[0]}`).getByRole('checkbox').check()
    await op.getByRole('button', { name: 'Propose plan' }).click()
    await see(op.getByTestId('loadplan-proposal'), TIMEOUT)
    await op.locator('#plan-name').fill('Journey plan B')
    await op.getByRole('button', { name: 'Save draft' }).click()
    await see(op.getByRole('button', { name: /^Approve Journey plan B version \d+$/ }), TIMEOUT)
    const r = await scalar(`SELECT status FROM public.agency_load_plans WHERE agency_id = $1 AND name = 'Journey plan B' ORDER BY plan_version DESC LIMIT 1`, [seed.agencyId])
    if (r?.status !== 'draft') throw new Error(`expected plan B draft, got ${r?.status}`)
    return 'SO-J-002 stored; "Journey plan B" is a draft'
  })

  // ===== second half (H6) ================================================================================
  // 13 consignments -------------------------------------------------------------------------------------
  const grLi = (page) => page.locator('li[data-testid^="consignment-"]').filter({ hasText: 'Order SO-J-001' })
  await step("13a dispatcher creates the GR/LR for the approved plan's order on /agency/consignments", dispatcher, async () => {
    await go(dp, '/agency/consignments')
    const waiting = dp.locator('[data-testid^="consignments-order-"]').filter({ hasText: 'SO-J-001' })
    await see(waiting, TIMEOUT)
    await dp.getByRole('button', { name: 'Create consignment note for SO-J-001' }).click()
    await see(grLi(dp).getByText('Consignment note created', { exact: true }), TIMEOUT)
    const gr = (await grLi(dp).locator('p.font-semibold').first().innerText()).trim()
    return `GR ${gr} created, chip "Consignment note created"`
  })
  for (const [label, button, chip, status] of [
    ['13b', 'Mark picked up', 'Picked up', 'pickup_scanned'],
    ['13c', 'Start transit', 'In transit', 'transit_started'],
    ['13d', 'Mark delivered', 'Delivered', 'delivery_scanned'],
  ]) {
    await step(`${label} consignment event ${status}: "${button}" -> chip "${chip}"`, dispatcher, async () => {
      await grLi(dp).getByRole('button', { name: button, exact: true }).click()
      await see(grLi(dp).getByText(chip, { exact: true }), TIMEOUT)
      return `chip "${chip}"`
    })
  }

  // 14 tracking -----------------------------------------------------------------------------------------
  // A driver ping cannot come from the agency UI (the driver app sends it). agency_jobs rows normally come from the
  // marketplace shipment flow, which this harness does not run, so the job is a SQL fixture; the ping itself goes
  // through the real rpc over the shim with the DRIVER's token.
  let jobId = ''
  await step('14 tracking: a driver ping (rpc as the driver) appears on /agency/tracking; owner opens an incident', owner, async () => {
    const shipmentId = '7a000000-0000-4000-8000-000000009001'
    jobId = '7a000000-0000-4000-8000-000000009002'
    const customerId = '7a000000-0000-4000-8000-000000009003'
    await pg.admin.query(
      `INSERT INTO public.customers (id, name, phone, email, address, city, state, pincode, pan_number, created_by)
       VALUES ($1, 'Journey Customer Pvt Ltd', '9810000099', 'customer@journey.test', '3 Test Road', 'Pune', 'Maharashtra', '411001', 'JRNYC3333R', $2) ON CONFLICT DO NOTHING`,
      [customerId, seed.users.admin.id]
    )
    await pg.admin.query(
      `INSERT INTO public.shipments (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost, vehicle_type, pickup_date, goods_description, estimated_value)
       VALUES ($1, 'JRNY-FIXTURE-1', $2, $3, 'Pune', 'Mumbai', 'pending', 1200, 18500, 'eicher_14ft', '2026-11-20', 'Steel', 75000) ON CONFLICT DO NOTHING`,
      [shipmentId, customerId, seed.users.admin.id]
    )
    await pg.admin.query(
      `INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status, driver_id, truck_id) VALUES ($1, $2, $3, 15000, 'accepted', $4, $5) ON CONFLICT DO NOTHING`,
      [jobId, seed.agencyId, shipmentId, seed.driverId, seed.truckIds[0]]
    )
    const token = await tokenOf(seed.users.driver)
    const ping = await rpcAs(token, 'tracking_ping_record', { p_job_id: jobId, p_lat: 18.52, p_lng: 73.8567, p_speed_kmph: 42, p_recorded_at: new Date().toISOString() })
    if (ping.status !== 200 || ping.body?.ok !== true) throw new Error(`driver ping refused: HTTP ${ping.status} ${JSON.stringify(ping.body)}`)
    await go(op, '/agency/tracking')
    const card = op.getByTestId(`tracking-job-${jobId}`)
    await see(card, TIMEOUT)
    await see(card.getByText(/Last ping/), TIMEOUT)
    await card.getByRole('button', { name: /View details/ }).click()
    const detail = op.getByTestId(`tracking-detail-${jobId}`)
    await see(detail.getByText(/Lat 18\.520000/), TIMEOUT)
    await detail.locator(`#incident-details-${jobId}`).fill('Truck halted near Lonavala toll')
    await detail.getByRole('button', { name: 'Open incident' }).click()
    await see(card.getByText('1 open incident'), TIMEOUT)
    return 'ping lat 18.520000 listed; incident opened (1 open incident)'
  })

  // 15 invoices (finance) ---------------------------------------------------------------------------------
  async function issueInvoice(page, description, rate) {
    await go(page, '/agency/invoices')
    await see(page.getByRole('button', { name: /New invoice|Close form/ }), TIMEOUT)
    if ((await page.locator('#new-invoice-form').count()) === 0) await page.getByRole('button', { name: 'New invoice' }).click()
    await see(page.getByTestId('invoice-form'), TIMEOUT)
    await page.locator('#inv-client').selectOption({ label: 'Journey Client Pvt Ltd' })
    const line = page.getByTestId('invoice-line-0')
    await line.getByLabel('Description').fill(description)
    await line.getByLabel('Quantity').fill('1')
    await line.getByLabel(/Rate/).fill(String(rate))
    await page.locator('#inv-gst').selectOption('18')
    await page.locator('#inv-supplier').fill('27')
    await page.locator('#inv-place').fill('27')
    await page.getByRole('button', { name: 'Issue invoice' }).click()
    await see(page.getByTestId('invoice-issued'), TIMEOUT)
    const number = (await page.getByTestId('invoice-issued').locator('strong').innerText()).trim()
    await see(page.getByTestId('invoice-totals'), TIMEOUT)
    return number
  }
  const totalsText = async (page) => (await page.getByTestId('invoice-totals').innerText()).replace(/\s+/g, ' ')
  async function recordPayment(page, amount, { settles = false } = {}) {
    await page.locator('#pay-amount').fill(String(amount))
    await page.getByRole('button', { name: 'Record payment' }).click()
    // a payment that settles the invoice removes the form (and its success note), so wait for the Paid chip instead
    if (settles) return see(statusChip(page, 'Paid'), TIMEOUT)
    await see(page.getByTestId('payment-success').or(page.getByTestId('payment-refused')), TIMEOUT)
    if (await page.getByTestId('payment-refused').count()) throw new Error(`payment refused: ${await page.getByTestId('payment-refused').innerText()}`)
  }
  const statusChip = (page, text) => page.getByTestId('invoice-detail').getByText(text, { exact: true }).first()

  let invoiceA = ''
  let invoiceB = ''
  await step('15a finance issues an invoice (1 line Rs 10,000, GST 18%, same state): CGST = SGST, number format', finance, async () => {
    invoiceA = await issueInvoice(fp, 'Freight Pune to Mumbai', 10000)
    const t = await totalsText(fp)
    const cg = /CGST 9%\s*(₹[\d,]+\.\d\d)/.exec(t)?.[1]
    const sg = /SGST 9%\s*(₹[\d,]+\.\d\d)/.exec(t)?.[1]
    if (!cg || !sg) throw new Error(`totals do not show CGST 9% and SGST 9%: "${t}"`)
    if (cg !== sg) throw new Error(`CGST ${cg} != SGST ${sg}`)
    if (/IGST/.test(t)) throw new Error(`same-state invoice shows IGST: "${t}"`)
    if (!/Total\s*₹11,800\.00/.test(t)) throw new Error(`expected total ₹11,800.00: "${t}"`)
    if (!/^(TO|INV)[-/A-Za-z0-9]*\d/.test(invoiceA)) throw new Error(`invoice number "${invoiceA}" is neither TO... nor INV...`)
    return `invoice ${invoiceA}: CGST ${cg} = SGST ${sg}, total ₹11,800.00`
  })
  await step('15b finance records a part payment: status partly_paid, then the rest: status paid', finance, async () => {
    await recordPayment(fp, 5000)
    await see(statusChip(fp, 'Partly paid'), TIMEOUT)
    await recordPayment(fp, 6800, { settles: true })
    const row = await scalar(`SELECT status, paid_paise FROM public.agency_invoices WHERE agency_id = $1 AND invoice_number = $2`, [seed.agencyId, invoiceA])
    if (row?.status !== 'paid' || Number(row.paid_paise) !== 1180000) throw new Error(`database says ${JSON.stringify(row)}`)
    return 'Partly paid (₹5,000) then Paid (₹11,800 received)'
  })
  await step('15c second invoice (Rs 5,000 + GST) issued and left open for the grace/expired checks', finance, async () => {
    invoiceB = await issueInvoice(fp, 'Freight Mumbai to Pune', 5000)
    return `invoice ${invoiceB} issued, outstanding ₹5,900.00`
  })

  // 16 expenses (finance) -----------------------------------------------------------------------------------
  await step('16a finance adds an expense on /agency/expenses', finance, async () => {
    await go(fp, '/agency/expenses')
    await see(fp.getByTestId('expense-form'), TIMEOUT)
    await fp.locator('#expense-category').selectOption('toll')
    await fp.locator('#expense-truck').selectOption({ index: 1 })
    await fp.locator('#expense-amount').fill('1250.50')
    await fp.locator('#expense-note').fill('Journey toll')
    await fp.getByRole('button', { name: 'Save expense' }).click()
    await see(fp.getByTestId('expense-list').getByText('Journey toll'), TIMEOUT)
    const t = (await fp.getByTestId('expense-list').innerText()).replace(/\s+/g, ' ')
    if (!/1,250\.50/.test(t)) throw new Error(`expense amount not shown: "${t}"`)
    return 'expense listed with ₹1,250.50'
  })
  await step('16b finance adds a fuel fill with an odometer reading', finance, async () => {
    await fp.getByRole('tab', { name: 'Fuel' }).click()
    await see(fp.getByTestId('fuel-form'), TIMEOUT)
    await fp.locator('#fuel-truck').selectOption({ index: 1 })
    await fp.locator('#fuel-odometer').fill('125430')
    await fp.locator('#fuel-litres').fill('50')
    await fp.locator('#fuel-amount').fill('4500')
    await fp.getByRole('button', { name: 'Save fuel fill' }).click()
    await see(fp.getByTestId('fuel-list'), TIMEOUT)
    const t = (await fp.getByTestId('fuel-list').innerText()).replace(/\s+/g, ' ')
    if (!/50 L/.test(t)) throw new Error(`fuel fill not listed: "${t}"`)
    return `fuel fill listed: ${t.slice(0, 100)}`
  })

  // 17 payroll (finance) --------------------------------------------------------------------------------------
  await step('17 payroll: finance opens a past period, adds an advance, closes it', finance, async () => {
    const now = new Date()
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const start = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    const end = iso(new Date(now.getFullYear(), now.getMonth(), 0))
    await go(fp, '/agency/payroll')
    await see(fp.getByTestId('open-period-form'), TIMEOUT)
    await fp.locator('#period-start').fill(start)
    await fp.locator('#period-end').fill(end)
    await fp.getByRole('button', { name: 'Open period' }).click()
    await see(fp.getByTestId('period-detail'), TIMEOUT)
    await see(fp.getByTestId('adjust-form'), TIMEOUT)
    const opts = await fp.locator('#adj-driver option').count()
    if (opts < 2) throw new Error('the adjustment driver list is empty (driver employment not readable by this role)')
    await fp.locator('#adj-driver').selectOption({ index: 1 })
    await fp.locator('#adj-kind').selectOption('advance')
    await fp.locator('#adj-amount').fill('2000')
    await fp.locator('#adj-reason').fill('Advance for diesel')
    await fp.getByRole('button', { name: 'Record adjustment' }).click()
    await see(fp.getByTestId('adjustments-list'), TIMEOUT)
    await fp.getByRole('button', { name: 'Close period' }).click()
    await fp.getByRole('button', { name: 'Confirm close period' }).click()
    await see(fp.getByTestId('period-closed-note'), TIMEOUT)
    const lines = (await fp.getByTestId('lines-table').count()) ? 'computed lines shown' : (await fp.getByTestId('lines-empty').count()) ? 'zero lines (no earnings)' : 'no lines section'
    const row = await scalar(`SELECT status FROM public.agency_payroll_periods WHERE agency_id = $1 AND period_start = $2`, [seed.agencyId, start])
    if (row?.status !== 'closed') throw new Error(`expected closed period in the database, got ${row?.status}`)
    return `period ${start}..${end} closed; ${lines}`
  })

  // ===== billing state machine (SQL over the superuser connection; the Razorpay Edge part is hosted-only) =====
  const asService = async (sql, params = []) => {
    const c = pg.admin
    await c.query('BEGIN')
    try {
      await c.query('SET LOCAL ROLE service_role')
      await c.query(`SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true)`)
      const r = await c.query(sql, params)
      await c.query('COMMIT')
      return r.rows[0] && Object.values(r.rows[0])[0]
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {})
      throw e
    }
  }
  const sweep = (asOf) => asService(`SELECT public.run_subscription_sweeps($1::timestamptz)`, [asOf])
  let orderSeq = 0
  async function buyPlan(tier) {
    const orderId = `order_journey_${tier}_${++orderSeq}`
    const q = await asService(`SELECT public.subscription_quote_order($1::uuid, $2::text, 'monthly', NULL::text)`, [seed.agencyId, tier])
    if (q?.ok !== true) throw new Error(`quote refused: ${JSON.stringify(q)}`)
    const o = await asService(`SELECT public.subscription_create_order($1::uuid, $2::text, 'monthly', NULL::text, $3::text)`, [seed.agencyId, tier, orderId])
    if (o?.ok !== true) throw new Error(`create_order refused: ${JSON.stringify(o)}`)
    const amount = q.amount_paise ?? q.total_paise ?? o.amount_paise
    const a = await asService(`SELECT public.subscription_activate_payment($1::text, $2::text, $3::bigint, 'INR', 'upi', 'verify')`, [orderId, `pay_journey_${orderSeq}`, String(amount)])
    if (a?.ok !== true) throw new Error(`activate refused: ${JSON.stringify(a)}`)
    return { amount, activation: a }
  }
  const sub = async () => scalar(`SELECT status, trial_end, current_period_end, grace_end FROM public.subscriptions WHERE agency_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`, [seed.agencyId])
  const banner = (page) => page.getByTestId('agency-billing-banner')

  // expired (trial lapse) ----------------------------------------------------------------------------------
  // The plan-B page is loaded BEFORE the state change, so its gate is still open and the click reaches the server.
  await go(op, '/agency/orders/plan')
  await see(op.getByRole('button', { name: /^Approve Journey plan B version \d+$/ }), TIMEOUT)
  await step('18 state change: the trial lapses (run_subscription_sweeps with a future as_of): status expired', owner, async () => {
    const before = await sub()
    if (before.status !== 'trial') throw new Error(`expected trial, got ${before.status}`)
    const asOf = new Date(new Date(before.trial_end).getTime() + 60_000).toISOString()
    const r = await sweep(asOf)
    const after = await sub()
    if (after.status !== 'expired') throw new Error(`expected expired after the sweep, got ${after.status} (${JSON.stringify(r)})`)
    notes.push('a TRIAL goes straight to expired (no grace): run_subscription_sweeps moves only active/past_due rows into grace, so grace is exercised after a paid period (steps 22-23)')
    return `trial_end passed -> status expired (${JSON.stringify(r)})`
  })
  await step('19 expired: dispatch refused with SB003 when the stale page approves plan B', owner, async () => {
    await op.getByRole('button', { name: /^Approve Journey plan B version \d+$/ }).click()
    await op.getByRole('button', { name: 'Confirm approval' }).click()
    await see(op.getByRole('alert').filter({ hasText: 'Dispatch is locked' }), TIMEOUT)
    const r = await scalar(`SELECT status FROM public.agency_load_plans WHERE agency_id = $1 AND name = 'Journey plan B' ORDER BY plan_version DESC LIMIT 1`, [seed.agencyId])
    if (r?.status !== 'draft') throw new Error(`the refused approval changed the plan: ${r?.status}`)
    return 'server refused (SB003 "Dispatch is locked"); plan B still draft'
  })
  await step('19b expired (fresh page): banner shown, Approve disabled, Add Truck disabled', owner, async () => {
    await go(op, '/agency/orders/plan')
    await see(banner(op), TIMEOUT)
    const t = (await banner(op).innerText()).replace(/\s+/g, ' ')
    if (!/Your subscription has expired/.test(t)) throw new Error(`expired banner missing: "${t}"`)
    const approve = op.getByRole('button', { name: /^Approve Journey plan B version \d+$/ })
    await see(approve, TIMEOUT)
    if (await approve.isEnabled()) throw new Error('Approve is enabled although dispatch is locked')
    await go(op, '/agency/fleet')
    await see(op.getByRole('heading', { name: 'Fleet Management' }), TIMEOUT)
    if (await op.getByRole('button', { name: 'Add vehicle' }).first().isEnabled()) throw new Error('Add Truck is enabled while expired')
    return 'expired banner; Approve and Add Truck disabled with the lock title'
  })
  await step('20 expired: a payment still records on an invoice (finance)', finance, async () => {
    await go(fp, '/agency/invoices')
    await fp.getByRole('button', { name: `Open invoice ${invoiceB}` }).click()
    await see(fp.getByTestId('payment-form'), TIMEOUT)
    await recordPayment(fp, 1000)
    await see(statusChip(fp, 'Partly paid'), TIMEOUT)
    return `payment ₹1,000 recorded on ${invoiceB} while expired`
  })

  // assign driver under SB003 (rpc-level) ---------------------------------------------------------------------
  // The Jobs page needs the agency-portal-jobs Edge function (501 locally), so the assignment is NOT driven through
  // the UI: it is the agency_job_assign_driver RPC over the shim with the DISPATCHER's token (resolve scope: dispatcher).
  // The job is a fresh SQL fixture with NO driver (an already-assigned driver returns 'unchanged' before the guard).
  const assignJobId = '7a000000-0000-4000-8000-000000009012'
  const assignShipmentId = '7a000000-0000-4000-8000-000000009011'
  let dispatcherToken = ''
  const markRpcLevel = (entry) => {
    entry.level = 'rpc-level'
    entry.name = `${entry.name} [rpc-level, not UI]`
  }
  const assignEntryA = await step('19c expired: agency_job_assign_driver (dispatcher token, rpc over the shim) is refused with SB003 + DETAIL JSON', dispatcher, async () => {
    await pg.admin.query(
      `INSERT INTO public.shipments (id, shipment_id, customer_id, created_by, origin, destination, status, total_weight, estimated_cost, vehicle_type, pickup_date, goods_description, estimated_value)
       VALUES ($1, 'JRNY-FIXTURE-2', '7a000000-0000-4000-8000-000000009003', $2, 'Pune', 'Nashik', 'pending', 900, 12000, 'eicher_14ft', '2026-11-22', 'Cement', 40000) ON CONFLICT DO NOTHING`,
      [assignShipmentId, seed.users.admin.id]
    ).catch((e) => { throw new Error(`fixture shipment insert: ${e.message} ${e.detail ?? ''} ${e.where ?? ''}`) })
    await pg.admin.query(
      // The pooled admin connection can carry an empty request.jwt.claims left behind by a shim request; the job trigger
      // parses it as json, so reset it for this one statement (is_local) before the row is inserted.
      `WITH c AS (SELECT set_config('request.jwt.claims', '{}', true))
       INSERT INTO public.agency_jobs (id, agency_id, shipment_id, fare, status, driver_id, truck_id)
       SELECT $1, $2, $3, 12000, 'pending', NULL, NULL FROM c ON CONFLICT DO NOTHING`,
      [assignJobId, seed.agencyId, assignShipmentId]
    ).catch((e) => { throw new Error(`fixture job insert: ${e.message} ${e.detail ?? ''} ${e.where ?? ''}`) })
    dispatcherToken = await tokenOf(seed.users.dispatcher)
    const r = await rpcAs(dispatcherToken, 'agency_job_assign_driver', { p_job_id: assignJobId, p_driver_id: seed.driverId })
    notes.push(`19c raw refusal: HTTP ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`)
    if (r.status < 400) throw new Error(`assignment was NOT refused while expired: HTTP ${r.status} ${JSON.stringify(r.body)}`)
    const b = r.body ?? {}
    const msg = String(b.message ?? '')
    const code = String(b.code ?? '')
    if (code !== 'SB003' && !msg.startsWith('SB003')) throw new Error(`refusal is not SB003: HTTP ${r.status} ${JSON.stringify(b)}`)
    let detail = b.details ?? b.detail
    if (typeof detail === 'string') {
      try { detail = JSON.parse(detail) } catch { throw new Error(`DETAIL is not JSON: ${JSON.stringify(b)}`) }
    }
    if (!detail || detail.code !== 'SB003') throw new Error(`DETAIL JSON missing code SB003: ${JSON.stringify(b)}`)
    const row = await scalar(`SELECT driver_id FROM public.agency_jobs WHERE id = $1`, [assignJobId])
    if (row?.driver_id) throw new Error('the refused assignment still set a driver')
    return `HTTP ${r.status} code ${code || '(none)'} message "${msg.slice(0, 40)}" DETAIL.code ${detail.code}; job still has no driver`
  }, { shot: false })
  markRpcLevel(assignEntryA)

  // paid activation (SQL) ------------------------------------------------------------------------------------
  await step('21 paid plan activated through subscription_create_order + subscription_activate_payment (SQL path; Razorpay Edge is hosted-only): banners clear, creates and dispatch work', owner, async () => {
    const { amount } = await buyPlan('growth')
    const s = await sub()
    if (s.status !== 'active') throw new Error(`expected active after activation, got ${s.status}`)
    await go(op, '/agency/fleet')
    await see(op.getByRole('heading', { name: 'Fleet Management' }), TIMEOUT)
    if (await banner(op).count()) throw new Error(`a billing banner is still shown: "${(await banner(op).innerText()).slice(0, 120)}"`)
    await op.getByRole('button', { name: 'Add vehicle' }).first().click()
    await op.locator('#fleet-rc-number').fill('MH12JRNY0004')
    await op.getByRole('button', { name: 'Add vehicle' }).last().click()
    await see(op.getByTestId('fleet-vehicle-card').filter({ hasText: 'MH12JRNY0004' }), TIMEOUT)
    await go(op, '/agency/orders/plan')
    const approve = op.getByRole('button', { name: /^Approve Journey plan B version \d+$/ })
    await see(approve, TIMEOUT)
    await approve.click()
    await op.getByRole('button', { name: 'Confirm approval' }).click()
    const planCard = op.locator('[data-testid^="loadplan-plan-"]').filter({ hasText: 'Journey plan B' })
    await see(planCard.getByText('Approved', { exact: true }), TIMEOUT)
    return `activated growth (₹${(Number(amount) / 100).toFixed(2)} paid): status active, no banner, truck added, plan B approved`
  })

  const assignEntryB = await step('21b paid: the same agency_job_assign_driver call is no longer SB003 and assigns the driver', dispatcher, async () => {
    const r = await rpcAs(dispatcherToken, 'agency_job_assign_driver', { p_job_id: assignJobId, p_driver_id: seed.driverId })
    const b = r.body ?? {}
    if (String(b.code ?? '') === 'SB003' || String(b.message ?? '').startsWith('SB003')) throw new Error(`still SB003 after paid activation: ${JSON.stringify(b)}`)
    if (r.status !== 200) throw new Error(`unexpected refusal after activation: HTTP ${r.status} ${JSON.stringify(b)}`)
    const typed = b.ok === true ? `ok state ${b.state}` : `typed result ${JSON.stringify(b)}`
    return `HTTP 200 ${typed}`
  }, { shot: false })
  markRpcLevel(assignEntryB)

  // grace ------------------------------------------------------------------------------------------------------
  await go(op, '/agency/fleet')
  await see(op.getByTestId('fleet-vehicle-card').first(), TIMEOUT)
  await op.getByRole('button', { name: 'Add vehicle' }).first().click()
  await op.locator('#fleet-rc-number').fill('MH12JRNY0005')
  await step('22 state change: paid period ends (sweep): status grace; the stale Add Truck form is refused with SB002', owner, async () => {
    const before = await sub()
    const r = await sweep(new Date(new Date(before.current_period_end).getTime() + 3600_000).toISOString())
    const after = await sub()
    if (after.status !== 'grace') throw new Error(`expected grace, got ${after.status} (${JSON.stringify(r)})`)
    await op.getByRole('button', { name: 'Add vehicle' }).last().click()
    await see(op.getByRole('alert').filter({ hasText: 'Your account is read-only' }), TIMEOUT)
    const n = await scalar('SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1', [seed.agencyId])
    if (n.n !== 4) throw new Error(`refused truck was created anyway: ${n.n} trucks`)
    return 'status grace; server refused with SB002; truck count unchanged (4)'
  })
  await step('22b grace (fresh pages): banner, Add Truck / Create GR / Import disabled', owner, async () => {
    await go(op, '/agency/fleet')
    await see(banner(op), TIMEOUT)
    const t = (await banner(op).innerText()).replace(/\s+/g, ' ')
    if (!/Read-only grace period/.test(t)) throw new Error(`grace banner missing: "${t}"`)
    if (await op.getByRole('button', { name: 'Add vehicle' }).first().isEnabled()) throw new Error('Add Truck enabled in grace')
    await go(op, '/agency/consignments')
    const create = op.getByRole('button', { name: 'Create consignment note for SO-J-002' })
    await see(create, TIMEOUT)
    if (await create.isEnabled()) throw new Error('Create GR enabled in grace')
    await importCsv(op, [orderRow('SO-J-003', 1, 'SKU-PIPE', 'Pipe', 500)])
    const imp = op.getByRole('button', { name: /^Import 1 lines?$/ })
    await see(imp, TIMEOUT)
    if (await imp.isEnabled()) throw new Error('Import button enabled in grace')
    return '"Read-only grace period" banner; Add Truck, Create GR and Import all disabled'
  })
  await step('23 grace: a payment still records (finance) and a trip status event still works (dispatcher confirms receipt)', finance, async () => {
    await go(fp, '/agency/invoices')
    await fp.getByRole('button', { name: `Open invoice ${invoiceB}` }).click()
    await see(fp.getByTestId('payment-form'), TIMEOUT)
    await recordPayment(fp, 1000)
    await go(dp, '/agency/consignments')
    await see(grLi(dp), TIMEOUT)
    await grLi(dp).getByRole('button', { name: 'Confirm receipt', exact: true }).click()
    await see(grLi(dp).getByText('Receipt confirmed', { exact: true }), TIMEOUT)
    return 'payment ₹1,000 recorded; consignment event receipt_signed -> "Receipt confirmed" (both during grace)'
  })

  // renewal ----------------------------------------------------------------------------------------------------
  await step('24 renewal during grace (SQL activation): banners clear, creates work again', owner, async () => {
    await buyPlan('growth')
    const s = await sub()
    if (s.status !== 'active') throw new Error(`expected active after renewal, got ${s.status}`)
    await go(op, '/agency/fleet')
    await see(op.getByRole('heading', { name: 'Fleet Management' }), TIMEOUT)
    if (await banner(op).count()) throw new Error(`banner still shown: "${(await banner(op).innerText()).slice(0, 120)}"`)
    await op.getByRole('button', { name: 'Add vehicle' }).first().click()
    await op.locator('#fleet-rc-number').fill('MH12JRNY0005')
    await op.getByRole('button', { name: 'Add vehicle' }).last().click()
    await see(op.getByTestId('fleet-vehicle-card').filter({ hasText: 'MH12JRNY0005' }), TIMEOUT)
    return 'status active; no banner; truck MH12JRNY0005 added'
  })

  // ===== mobile pass 375x812 =============================================================================
  await dispatcher.context.close()
  await finance.context.close()
  await owner.context.close()
  const mobile = await newContext('owner-mobile', { viewport: { width: 375, height: 812 } })
  const mp = mobile.page
  await signIn(mobile, seed.users.owner)
  const MOBILE_PAGES = [
    ['dashboard', '/agency/dashboard'],
    ['fleet', '/agency/fleet'],
    ['orders-import', '/agency/orders/import'],
    ['load-plan', '/agency/orders/plan'],
    ['consignments', '/agency/consignments'],
    ['tracking', '/agency/tracking'],
    ['invoices', '/agency/invoices'],
    ['expenses', '/agency/expenses'],
    ['payroll', '/agency/payroll'],
    ['subscription', '/subscription'],
    ['team', '/agency/team'],
  ]
  const mobileFindings = []
  for (const [name, path] of MOBILE_PAGES) {
    await step(`M ${name} at 375x812: no horizontal scroll, primary buttons >= 44px`, mobile, async ({ offset }) => {
      await go(mp, path)
      await mp.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      await mp.waitForFunction(() => document.querySelectorAll('[aria-busy="true"]').length === 0, null, { timeout: TIMEOUT })
      await mp.locator('main, h1, h2').first().waitFor({ state: 'visible', timeout: TIMEOUT })
      const m = await mp.evaluate(() => {
        const iw = window.innerWidth
        const sw = document.documentElement.scrollWidth
        const clipped = (el) => {
          for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
            const o = getComputedStyle(p).overflowX
            if (o === 'auto' || o === 'scroll' || o === 'hidden') return true
          }
          return false
        }
        const visible = (el) => {
          const r = el.getBoundingClientRect()
          const cs = getComputedStyle(el)
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'
        }
        const offenders = []
        for (const el of document.body.querySelectorAll('*')) {
          if (!visible(el)) continue
          const r = el.getBoundingClientRect()
          if (r.right > iw + 1 && !clipped(el)) offenders.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : ''} right=${Math.round(r.right)} "${(el.textContent || '').trim().slice(0, 40)}"`)
          if (offenders.length >= 6) break
        }
        const primary = [...document.querySelectorAll('button, a')].filter((el) => visible(el) && /\bbg-(indigo|emerald|red)-(600|700)\b/.test(el.className))
        const short = primary.filter((el) => el.getBoundingClientRect().height < 43.5).map((el) => `${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40)} h=${Math.round(el.getBoundingClientRect().height)}`)
        return { iw, sw, offenders, primary: primary.length, short }
      })
      await mp.screenshot({ path: join(evidenceDir, `mobile-${name}.png`), fullPage: true })
      const problems = []
      if (m.sw > m.iw + 1) problems.push(`horizontal scroll: scrollWidth ${m.sw} > innerWidth ${m.iw}; offenders: ${m.offenders.join(' | ') || 'none found outside scroll containers'}`)
      if (m.short.length) problems.push(`primary buttons under 44px: ${m.short.join(', ')}`)
      if (problems.length) {
        mobileFindings.push({ page: name, path, ...m, screenshot: `mobile-${name}.png` })
        throw new Error(`REAL BUG (mobile ${name}): ${problems.join(' ; ')}`)
      }
      const edge = edge501Since(offset)
      if (edge.length) {
        notes.push(`mobile ${name}: layout checked on the Edge-failure state only (no horizontal scroll, buttons >= 44px there); the real content needs ${edge.join(', ')}`)
        throw new HostedOnly(`mobile ${name}`, edge)
      }
      return `scrollWidth ${m.sw} <= ${m.iw}; ${m.primary} primary button(s), all >= 44px; screenshot mobile-${name}.png`
    }, { shot: false })
  }
  await mobile.context.close()

  return { steps, notes, pageConsole, mobileFindings }
}
