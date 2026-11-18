/**
 * Browser journey, FIRST HALF (task H5): sign in as the seeded owner, billing none state, read-only refusal,
 * 14-day trial, trial banner, truck, staff invite, second browser context (dispatcher), driver, order import,
 * load plan approval. The second half (consignments .. expired) belongs to H6.
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

  async function step(name, rec, fn) {
    const offset = shim.getRequestLog().length
    const consoleOffset = rec.consoleErrors.length
    const t0 = Date.now()
    const entry = { name, status: 'pass', detail: '', ms: 0 }
    try {
      const detail = await fn({ offset })
      if (typeof detail === 'string') entry.detail = detail
      entry.screenshot = await shot(rec, name)
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
    await page.getByPlaceholder('your@email.com or demo.driver').fill(who.email, { timeout: TIMEOUT })
    await page.getByPlaceholder('Enter your password').fill(who.password)
    await page.getByRole('button', { name: /sign in with password/i }).click()
    await page.waitForURL(/\/agency\//, { timeout: TIMEOUT })
  }

  /** Sign in and report where the app sends the user (no assertion about the landing page). */
  async function signInAnyRole(rec, who) {
    const { page } = rec
    await go(page, '/login?mode=agency')
    await page.getByPlaceholder('your@email.com or demo.driver').fill(who.email, { timeout: TIMEOUT })
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
    await op.getByRole('button', { name: 'Add Truck' }).first().click()
    await op.locator('#fleet-rc-number').fill('MH12JRNY0003')
    await op.getByRole('button', { name: 'Add Truck' }).last().click()
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
    await op.getByRole('button', { name: 'Add Truck' }).first().click()
    await op.locator('#fleet-rc-number').fill('MH12JRNY0003')
    await op.getByRole('button', { name: 'Add Truck' }).last().click()
    await see(op.getByTestId('fleet-vehicle-card').filter({ hasText: 'MH12JRNY0003' }))
    const n = await scalar('SELECT count(*)::int AS n FROM public.agency_trucks WHERE agency_id = $1', [seed.agencyId])
    if (n.n !== 3) throw new Error(`expected 3 trucks in the database, found ${n.n}`)
    return 'MH12JRNY0003 listed; 3 trucks stored'
  })

  await step('8 invite a staff member on the Team page (trial plan staff limit)', owner, async () => {
    await go(op, '/agency/team')
    await see(op.getByRole('heading', { name: /Team/ }), TIMEOUT)
    await op.getByRole('button', { name: 'Invite team member' }).click()
    await op.locator('#invite-email').fill('new.staff@journey.test')
    await op.getByRole('button', { name: 'Create invitation' }).click()
    const share = op.getByTestId('team-share-code')
    const limit = op.getByRole('alert').filter({ hasText: 'Plan limit reached' })
    await Promise.race([see(share, TIMEOUT).catch(() => {}), see(limit, TIMEOUT).catch(() => {})])
    if (await share.count()) {
      const text = await share.innerText()
      const m = /(https?:\/\/\S*\/invite\/[A-Za-z0-9._~-]+)/.exec(text)
      if (!m) throw new Error(`no /invite/<token> link in the share panel: "${text.slice(0, 200)}"`)
      return `link shown: ${m[1].replace(/\/invite\/.+$/, '/invite/<token>')}`
    }
    const seats = (await scalar(`SELECT count(*)::int AS n FROM public.agency_memberships WHERE agency_id = $1 AND status = 'active'`, [seed.agencyId])).n
    const limitText = (await limit.first().innerText()).replace(/\s+/g, ' ')
    notes.push(`staff invite NOT created: the seed already has ${seats} active staff and the trial plan allows fewer (server SB001: "${limitText.slice(0, 140)}"). The refusal is correct product behaviour; the link step needs a seed with fewer staff or a plan with more seats`)
    return 'refused with the plan-limit prompt (SB001), as designed; no invitation created'
  })

  // second browser context ---------------------------------------------------------------------------
  const dispatcher = await newContext('dispatcher')
  const dp = dispatcher.page
  const isMember = (await scalar(`SELECT count(*)::int AS n FROM public.agency_memberships WHERE agency_id = $1 AND user_id = $2 AND status = 'active'`, [seed.agencyId, seed.users.dispatcher.id])).n > 0
  await step('9 second context: seeded dispatcher signs in and works inside the same agency', dispatcher, async () => {
    const landed = await signInAnyRole(dispatcher, seed.users.dispatcher)
    await go(dp, '/agency/fleet')
    await dp.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {})
    const path = new URL(dp.url()).pathname
    if (isMember) notes.push('invite accept flow SKIPPED: the seeded dispatcher is already an active member of the agency')
    if (!/^\/agency\/fleet/.test(path) || (await dp.getByRole('heading', { name: 'Fleet Management' }).count()) === 0) {
      const role = (await scalar('SELECT role FROM public.users WHERE id = $1', [seed.users.dispatcher.id])).role
      throw new Error(`staff member with an active membership cannot reach the agency area: after sign-in the app sent them to "${landed}", /agency/fleet ended at "${path}" (public.users.role = ${role}; the app resolves the 'agency' role only from transport_agencies.user_id)`)
    }
    await see(dp.getByTestId('fleet-vehicle-card').filter({ hasText: 'MH12JRNY0003' }), TIMEOUT)
    return 'dispatcher sees the truck the owner added (staff scope resolved)'
  })
  await dispatcher.context.close()

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
  await step('11 import orders from a generated CSV on the Order Import page', owner, async () => {
    await go(op, '/agency/orders/import')
    await see(op.locator('#import-agreement'), TIMEOUT)
    await op.locator('#import-agreement').selectOption({ label: 'Journey Client Pvt Ltd' })
    // Site rules of the page: pickup may be an active bill-to or ship-to site, a drop must be an active ship-to site.
    // The seed has one ship-to ("Pickup Plant Pune") and one bill-to ("Drop Depot Mumbai"), so the drop is the ship-to.
    const rows = [
      'SO-J-001,1,SKU-STEEL-ROD,Steel rod 12mm,2000,kg,,,,,,,Drop Depot Mumbai,Pickup Plant Pune,2026-11-20,2026-11-21,2026-11-22,2026-11-23,yes,no',
      'SO-J-001,2,SKU-SERVICE-KIT,Service kit,10,carton,20,kg,60,40,30,cm,Drop Depot Mumbai,Pickup Plant Pune,2026-11-20,2026-11-21,2026-11-22,2026-11-23,no,yes',
    ]
    const csv = `${templateHeader()}\n${rows.join('\n')}\n`
    await op.locator('#import-file').setInputFiles({ name: 'journey-orders.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') })
    const summary = op.getByTestId('order-import-summary')
    await see(summary, TIMEOUT)
    const text = (await summary.innerText()).replace(/\s+/g, ' ')
    if (!/Errors\s*0/.test(text)) throw new Error(`CSV review shows errors: "${text}"`)
    await op.getByRole('button', { name: /^Import 2 lines?$/ }).click()
    await see(op.getByTestId('order-import-success'), TIMEOUT)
    const n = await scalar(`SELECT count(*)::int AS n FROM public.agency_orders WHERE agency_id = $1 AND client_order_ref = 'SO-J-001'`, [seed.agencyId])
    if (n.n !== 1) throw new Error(`expected 1 stored order SO-J-001, found ${n.n}`)
    return 'review: 2 rows, 0 errors; order SO-J-001 stored'
  })

  // load plan ----------------------------------------------------------------------------------------
  await step('12 save and approve a load plan on the Load Plan page', owner, async () => {
    await go(op, '/agency/orders/plan')
    const orderRow = op.locator('[data-testid^="loadplan-order-"]').filter({ hasText: 'SO-J-001' })
    await see(orderRow, TIMEOUT)
    await orderRow.getByRole('checkbox').check()
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

  notes.push('second half (consignments, tracking, invoices, payments, expenses, payroll, grace, expired) is task H6')
  await owner.context.close()
  return { steps, notes }
}
