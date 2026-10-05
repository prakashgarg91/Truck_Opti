#!/usr/bin/env node
/**
 * TO-139 — actual-app UX / accessibility route audit (FIXTURE TIER).
 *
 * LEVEL (read this first): this drives the REAL built frontend in Chromium
 * against a local-first artifact (no cloud backend configured). It proves what
 * the implemented routes render and how they behave — NOT generated Stitch
 * design quality and NOT cloud/staging behaviour. The only signed-in identity
 * available without a backend is the device-local agency profile created by
 * /local-start, so driver- and admin-only pages are exercised through their
 * denied-role state; driver/admin journeys need cloud credentials (owner gate).
 *
 * Per route and viewport (390x844, 1280x900) it records:
 *   - console errors / uncaught page errors / failed (>=400) responses
 *   - the app ErrorBoundary fallback ("Something went wrong") — hard failure
 *   - unexpected redirects (title must match the route's page)
 *   - horizontal overflow (mobile layout breakage) — finding
 *   - a11y signals: nameless interactive controls, unlabelled form fields,
 *     images without alt, heading structure — findings
 *   - a bounded text-contrast heuristic (WCAG AA thresholds) — findings
 * It also verifies the layout navigation hrefs actually resolve and the
 * Terms/Privacy/Contact targets reach their pages.
 *
 * Screenshots: logs/to139-ux-audit/<viewport>/<slug>.png
 * Report:      logs/to139-ux-audit-report.json
 *
 * Usage:
 *   1. build a local-first artifact (frontend/.env.local unset/renamed) and
 *      serve frontend/dist (e.g. `PORT=3000 node server.js`)
 *   2. PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/ux_route_audit.mjs
 *
 * Exit code 0 = no hard failures; 1 = at least one hard failure (journey-breaking).
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.PUBLIC_APP_URL || 'http://127.0.0.1:3000'
const OUT_DIR = path.join('logs', 'to139-ux-audit')
const REPORT_PATH = path.join('logs', 'to139-ux-audit-report.json')
const VIEWPORTS = [
  { label: 'mobile-390x844', width: 390, height: 844 },
  { label: 'desktop-1280x900', width: 1280, height: 900 },
]

// titleFragment must appear in document.title for the route to count as
// rendered by its own page (not NotFound / login redirect / error boundary).
const PUBLIC_ROUTES = [
  { path: '/', titleFragment: 'TruckOpti' },
  { path: '/pricing', titleFragment: 'Pricing' },
  { path: '/terms', titleFragment: 'Terms of Service' },
  { path: '/privacy', titleFragment: 'Privacy Policy' },
  { path: '/contact', titleFragment: 'Contact Us' },
  { path: '/login', titleFragment: 'Welcome Back' },
  { path: '/signup', titleFragment: 'Sign Up' },
  { path: '/forgot-password', titleFragment: 'Forgot Password' },
  { path: '/reset-password', titleFragment: 'Set New Password' },
  { path: '/driver/register', titleFragment: 'Driver' },
  { path: '/agency/register', titleFragment: 'Agency' },
  { path: '/local-start', titleFragment: 'Device Setup' },
  { path: '/payment/callback', titleFragment: 'Payment Status' },
  { path: '/payment/success', titleFragment: 'Payment Status' },
  { path: '/test-payment', titleFragment: '404', expectNotFound: true },
  { path: '/no-such-route-to139', titleFragment: '404', expectNotFound: true },
]

// Device-local agency identity: routes reachable after /local-start setup.
const AUTH_AGENCY_ROUTES = [
  { path: '/agency/dashboard', titleFragment: 'Agency' },
  { path: '/agency/fleet', titleFragment: 'Fleet' },
  { path: '/agency/jobs', titleFragment: 'Jobs' },
  { path: '/agency/billing', titleFragment: 'Billing' },
  { path: '/agency/drivers', titleFragment: 'Driver' },
  { path: '/agency/rates', titleFragment: 'Rate' },
  { path: '/agency/profile', titleFragment: 'Profile' },
  { path: '/dashboard', titleFragment: 'Dashboard' },
  { path: '/packing', titleFragment: 'Packing' },
  { path: '/routes', titleFragment: 'Route' },
  { path: '/tracking', titleFragment: 'Tracking' },
  { path: '/booking/new', titleFragment: 'Shipment' },
  { path: '/profile', titleFragment: 'Profile' },
  { path: '/management', titleFragment: 'Management' },
  { path: '/management/trucks', titleFragment: 'Truck' },
  { path: '/management/cartons', titleFragment: 'Carton' },
  { path: '/management/customers', titleFragment: 'Customer' },
  { path: '/sale-orders', titleFragment: 'Sale' },
  { path: '/settings/company', titleFragment: 'Company' },
  { path: '/history', titleFragment: 'History' },
  { path: '/invoice/test-shipment', titleFragment: 'Invoice' },
  { path: '/support', titleFragment: 'Contact Support' },
  { path: '/subscription', titleFragment: 'Subscription' },
]

const DENIED_ROUTES = [
  { path: '/admin', allowedRole: 'admin' },
  { path: '/admin/drivers', allowedRole: 'admin' },
  { path: '/admin/users', allowedRole: 'admin' },
  { path: '/driver/dashboard', allowedRole: 'driver' },
  { path: '/driver/earnings', allowedRole: 'driver' },
]

const results = []
const hardFailures = []

function record(result) {
  results.push(result)
  const tag = result.hardFailure ? 'FAIL' : result.findings.length > 0 ? 'WARN' : 'PASS'
  const detail = result.hardFailure
    ? ` — ${result.hardFailure}`
    : result.findings.length > 0
      ? ` — ${result.findings.length} finding(s)`
      : ''
  console.log(`${tag}  [${result.viewport}] ${result.kind} ${result.path}${detail}`)
  if (result.hardFailure) hardFailures.push(result)
}

function slugify(routePath) {
  return routePath === '/' ? 'home' : routePath.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-')
}

function attachSignals(page) {
  const signals = { consoleErrors: [], pageErrors: [], failedResponses: [], failedRequests: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') signals.consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => signals.pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 400) signals.failedResponses.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    signals.failedRequests.push(`${request.failure()?.errorText || 'failed'} ${request.url()}`)
  })
  return signals
}

// In-page audit: overflow, a11y signals and a bounded contrast sample.
async function auditPage(page) {
  return page.evaluate(() => {
    const findings = []
    const doc = document

    const overflow = doc.documentElement.scrollWidth - doc.documentElement.clientWidth
    if (overflow > 1) findings.push(`horizontal-overflow:${overflow}px`)

    const visible = (el) => el.getClientRects().length > 0
    const accName = (el) =>
      (el.getAttribute('aria-label') || el.getAttribute('title') || el.innerText || el.textContent || '').trim()

    const namelessButtons = [...doc.querySelectorAll('button')].filter(
      (b) => visible(b) && accName(b).length === 0 && !b.getAttribute('aria-labelledby')
    )
    if (namelessButtons.length > 0) findings.push(`nameless-buttons:${namelessButtons.length}`)

    const namelessLinks = [...doc.querySelectorAll('a')].filter(
      (a) => visible(a) && accName(a).length === 0 && !a.getAttribute('aria-labelledby')
    )
    if (namelessLinks.length > 0) findings.push(`nameless-links:${namelessLinks.length}`)

    const unlabelledFields = [...doc.querySelectorAll('input, select, textarea')].filter((el) => {
      if (!visible(el) || el.type === 'hidden') return false
      if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false
      if (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false
      if (el.closest('label')) return false
      if (el.getAttribute('placeholder')) return false // placeholder-only is weak but visible
      return true
    })
    if (unlabelledFields.length > 0) findings.push(`unlabelled-fields:${unlabelledFields.length}`)

    const imagesNoAlt = [...doc.querySelectorAll('img')].filter((img) => visible(img) && !img.hasAttribute('alt'))
    if (imagesNoAlt.length > 0) findings.push(`images-without-alt:${imagesNoAlt.length}`)

    const h1Count = [...doc.querySelectorAll('h1')].filter(visible).length
    if (h1Count === 0) findings.push('no-h1')
    if (h1Count > 1) findings.push(`multiple-h1:${h1Count}`)

    if (!doc.documentElement.getAttribute('lang')) findings.push('no-html-lang')

    // Bounded contrast sample: visible elements that directly own text.
    const luminance = (rgb) => {
      const channel = (c) => {
        const s = c / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
    }
    const parseColor = (value) => {
      const m = /rgba?\(([^)]+)\)/.exec(value || '')
      if (!m) return null
      const parts = m[1].split(',').map((p) => parseFloat(p.trim()))
      if (parts.length < 3 || (parts.length === 4 && parts[3] === 0)) return null
      return parts.slice(0, 3)
    }
    // Walk ancestors for the first painted background. Gradient/image
    // backgrounds make the ratio indeterminate → return null (skipped).
    const effectiveBackground = (el) => {
      let node = el
      while (node && node !== doc.documentElement) {
        const style = getComputedStyle(node)
        if (style.backgroundImage && style.backgroundImage !== 'none') return null
        const bg = parseColor(style.backgroundColor)
        if (bg) return bg
        node = node.parentElement
      }
      const bodyBg = parseColor(getComputedStyle(doc.body).backgroundColor)
      return bodyBg || [255, 255, 255]
    }

    let contrastChecked = 0
    let contrastViolations = 0
    const contrastSamples = []
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    let node
    while ((node = walker.nextNode()) && contrastChecked < 400) {
      const text = (node.textContent || '').trim()
      if (text.length < 2) continue
      const el = node.parentElement
      if (!el || !visible(el) || seen.has(el)) continue
      seen.add(el)
      const style = getComputedStyle(el)
      if (style.visibility === 'hidden' || parseFloat(style.opacity) < 0.5) continue
      const fg = parseColor(style.color)
      if (!fg) continue
      if (style.backgroundImage && style.backgroundImage !== 'none') continue
      const bg = effectiveBackground(el)
      if (!bg) continue
      const L1 = luminance(fg)
      const L2 = luminance(bg)
      const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)
      const fontSize = parseFloat(style.fontSize)
      const bold = parseInt(style.fontWeight, 10) >= 700
      const large = fontSize >= 24 || (bold && fontSize >= 18.66)
      const threshold = large ? 3.0 : 4.5
      contrastChecked += 1
      if (ratio < threshold) {
        contrastViolations += 1
        if (contrastSamples.length < 5) {
          contrastSamples.push({
            text: text.slice(0, 40),
            ratio: Number(ratio.toFixed(2)),
            threshold,
          })
        }
      }
    }
    if (contrastViolations > 0) {
      findings.push(`contrast-below-aa:${contrastViolations}/${contrastChecked}`)
    }

    return {
      findings,
      overflowPx: overflow,
      h1Count,
      contrast: { checked: contrastChecked, violations: contrastViolations, samples: contrastSamples },
    }
  })
}

async function gotoRoute(page, routePath) {
  const url = `${BASE_URL}${routePath}${routePath.includes('?') ? '&' : '?'}fresh=${Date.now()}`
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 })
  } catch {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
  }
  await page.waitForTimeout(400)
}

const ERROR_BOUNDARY_TEXT = 'Something went wrong'
const PERMISSION_DENIED_TEXT = 'Permission denied'

async function collectRoute({ browser, context, viewport, kind, routePath, titleFragment, expectDenied, expectNotFound = false }) {
  const page = await context.newPage()
  const signals = attachSignals(page)
  const result = {
    kind,
    viewport: viewport.label,
    path: routePath,
    findings: [],
    hardFailure: null,
  }

  try {
    await gotoRoute(page, routePath)
    result.finalUrl = page.url()
    result.title = await page.title()

    const bodyText = await page.locator('body').innerText().catch(() => '')
    result.errorBoundary = bodyText.includes(ERROR_BOUNDARY_TEXT)
    result.permissionDenied = bodyText.includes(PERMISSION_DENIED_TEXT)
    result.notFound = /Page Not Found/i.test(bodyText) || result.title.includes('404')

    const pageAudit = await auditPage(page)
    result.findings = pageAudit.findings
    result.h1Count = pageAudit.h1Count
    result.contrast = pageAudit.contrast

    const screenshotPath = path.join(OUT_DIR, viewport.label, `${slugify(routePath)}.png`)
    await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath, fullPage: true })
    result.screenshot = screenshotPath

    if (signals.pageErrors.length > 0) {
      result.hardFailure = `uncaught page error: ${signals.pageErrors[0].slice(0, 160)}`
    } else if (result.errorBoundary) {
      result.hardFailure = 'app ErrorBoundary fallback rendered'
    } else if (expectDenied && !result.permissionDenied) {
      result.hardFailure = 'expected permission-denied state, not rendered'
    } else if (expectNotFound && !result.notFound) {
      result.hardFailure = 'expected 404 page, not rendered'
    } else if (!expectNotFound && !expectDenied && result.notFound) {
      result.hardFailure = `rendered the 404 page at ${routePath}`
    } else if (kind !== 'public' && result.finalUrl.includes('/login')) {
      result.hardFailure = `unexpected redirect to login from ${routePath}`
    } else if (!result.title.includes(titleFragment)) {
      // These pages do not all set document.title; a mismatch is a finding,
      // not a hard failure (the title fallback is index.html's default).
      findingsPush(result, `title-mismatch:got "${result.title}"`)
    }

    // Failed responses and console errors are findings here: the known
    // local-first realtime/placeholder classes are annotated by the caller.
    result.consoleErrors = signals.consoleErrors
    result.failedResponses = signals.failedResponses
    result.failedRequestUrls = [...new Set(signals.failedRequests.map((entry) => entry.split(' ').slice(1).join(' ')))]
    if (signals.failedResponses.length > 0) findingsPush(result, `failed-responses:${signals.failedResponses.length}`)
    if (signals.consoleErrors.length > 0) findingsPush(result, `console-errors:${signals.consoleErrors.length}`)
    if (signals.failedRequests.length > 0) findingsPush(result, `failed-requests:${signals.failedRequests.length}`)

    return result
  } finally {
    await page.close().catch(() => {})
  }
}

function findingsPush(result, finding) {
  result.findings.push(finding)
}

async function enterLocalWorkspace(browser, viewport) {
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: viewport.width, height: viewport.height },
  })
  const page = await context.newPage()
  await gotoRoute(page, '/login')
  const startButton = page.getByRole('button', { name: 'Start using TruckOpti on this device' })
  await startButton.waitFor({ state: 'visible', timeout: 20000 })
  await startButton.click()
  await page.getByRole('heading', { name: 'Set up this device' }).waitFor({ state: 'visible', timeout: 20000 })
  const continueExisting = page.getByRole('button', { name: /^Continue as / })
  if ((await continueExisting.count()) > 0) {
    await continueExisting.click()
  } else {
    await page.getByPlaceholder('Sharma Transport').fill(`UX Audit ${viewport.label}`)
    await page.getByRole('button', { name: 'Start using TruckOpti' }).click()
  }
  await page.waitForURL(/\/agency\/dashboard/, { timeout: 20000 })
  await page.close()
  return context
}

async function collectLinkTarget(browser, context, viewport, fromPath, linkHref, expectedPathFragment) {
  const page = await context.newPage()
  const signals = attachSignals(page)
  const result = {
    kind: 'link-target',
    viewport: viewport.label,
    path: `${fromPath} → ${linkHref}`,
    findings: [],
    hardFailure: null,
  }
  try {
    await gotoRoute(page, fromPath)
    await page.locator(`a[href="${linkHref}"]`).first().click()
    await page.waitForTimeout(800)
    result.finalUrl = page.url()
    result.title = await page.title()
    if (!result.finalUrl.includes(expectedPathFragment)) {
      result.hardFailure = `link ${linkHref} went to ${result.finalUrl}, expected *${expectedPathFragment}*`
    }
    return result
  } catch (error) {
    result.hardFailure = `link ${linkHref} not clickable: ${error.message.slice(0, 120)}`
    return result
  } finally {
    await page.close().catch(() => {})
  }
}

async function collectLayoutNav(browser, context, viewport, routePath, expectedHrefs, expectedButtons = []) {
  const page = await context.newPage()
  const result = {
    kind: 'layout-nav',
    viewport: viewport.label,
    path: routePath,
    findings: [],
    hardFailure: null,
  }
  try {
    await gotoRoute(page, routePath)
    // Layouts that hide nav behind a drawer: open it first when the trigger
    // is actually visible at this viewport.
    const openMenu = page.locator('[aria-label="Open menu"]')
    if ((await openMenu.count()) > 0 && (await openMenu.first().isVisible().catch(() => false))) {
      await openMenu.first().click()
      await page.waitForTimeout(500)
    }
    const hrefs = await page.$$eval('a[href]', (anchors) =>
      anchors.map((a) => a.getAttribute('href')).filter((h) => h && h.startsWith('/'))
    )
    // Some destinations are onClick buttons, not anchors; assert their labels.
    const buttonNames = await page.$$eval('button', (buttons) =>
      buttons.map((b) => (b.textContent || '').trim())
    )
    const missingHrefs = expectedHrefs.filter((href) => !hrefs.some((h) => h.split('?')[0] === href))
    const missingButtons = expectedButtons.filter((label) => !buttonNames.includes(label))
    result.expectedHrefs = expectedHrefs
    result.presentHrefs = [...new Set(hrefs)]
    if (missingHrefs.length > 0) {
      result.hardFailure = `missing nav hrefs: ${missingHrefs.join(', ')}`
    } else if (missingButtons.length > 0) {
      result.hardFailure = `missing nav buttons: ${missingButtons.join(', ')}`
    }
    return result
  } finally {
    await page.close().catch(() => {})
  }
}

async function collectNavResolution(browser, context, viewport, hrefList) {
  // Verifies each layout nav href renders its own page (not 404 / redirect).
  const findings = []
  const failures = []
  for (const href of hrefList) {
    const page = await context.newPage()
    try {
      await gotoRoute(page, href)
      const title = await page.title()
      const body = await page.locator('body').innerText().catch(() => '')
      if (title.includes('404') || body.includes(ERROR_BOUNDARY_TEXT)) {
        failures.push(`${href} → title="${title}"`)
      }
    } finally {
      await page.close().catch(() => {})
    }
  }
  const result = {
    kind: 'nav-resolution',
    viewport: viewport.label,
    path: `nav hrefs (${hrefList.length})`,
    findings,
    hardFailure: failures.length > 0 ? `nav targets broken: ${failures.join('; ')}` : null,
  }
  return result
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })

  // A single check must never abort the whole sweep.
  async function safe(viewportLabel, path, fn) {
    try {
      record(await fn())
    } catch (error) {
      record({
        kind: 'audit-error',
        viewport: viewportLabel,
        path,
        findings: [],
        hardFailure: `audit harness error: ${error.message.slice(0, 160)}`,
      })
    }
  }

  try {
    for (const viewport of VIEWPORTS) {
      // ---- public (fresh context, no auth) ----
      const publicContext = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: viewport.width, height: viewport.height },
      })
      try {
        for (const route of PUBLIC_ROUTES) {
          await safe(viewport.label, route.path, () => collectRoute({
            browser, context: publicContext, viewport, kind: 'public', routePath: route.path,
            titleFragment: route.titleFragment, expectDenied: false, expectNotFound: !!route.expectNotFound,
          }))
        }
        await safe(viewport.label, '/ → /terms', () => collectLinkTarget(browser, publicContext, viewport, '/', '/terms', '/terms'))
        await safe(viewport.label, '/ → /privacy', () => collectLinkTarget(browser, publicContext, viewport, '/', '/privacy', '/privacy'))
        await safe(viewport.label, '/ → /contact', () => collectLinkTarget(browser, publicContext, viewport, '/', '/contact', '/contact'))
        await safe(viewport.label, '/login → /terms', () => collectLinkTarget(browser, publicContext, viewport, '/login', '/terms', '/terms'))
        await safe(viewport.label, '/login → /privacy', () => collectLinkTarget(browser, publicContext, viewport, '/login', '/privacy', '/privacy'))
      } finally {
        await publicContext.close()
      }

      // ---- authenticated device-local agency identity (fresh context) ----
      const agencyContext = await enterLocalWorkspace(browser, viewport)
      try {
        for (const route of AUTH_AGENCY_ROUTES) {
          await safe(viewport.label, route.path, () => collectRoute({
            browser, context: agencyContext, viewport, kind: 'auth-agency', routePath: route.path,
            titleFragment: route.titleFragment, expectDenied: false,
          }))
        }
        for (const route of DENIED_ROUTES) {
          await safe(viewport.label, route.path, () => collectRoute({
            browser, context: agencyContext, viewport, kind: 'denied-role', routePath: route.path,
            titleFragment: 'Permission Denied', expectDenied: true,
          }))
        }
        await safe(viewport.label, '/agency/dashboard nav', () => collectLayoutNav(browser, agencyContext, viewport, '/agency/dashboard',
          ['/agency/dashboard', '/agency/fleet', '/agency/drivers', '/agency/jobs', '/agency/billing', '/agency/rates', '/agency/profile']))
        await safe(viewport.label, '/dashboard nav', () => collectLayoutNav(browser, agencyContext, viewport, '/dashboard',
          ['/dashboard', '/sale-orders', '/packing', '/routes', '/tracking', '/history'],
          ['Management', 'Subscription', 'Company Profile', 'Settings', 'Help & Support']))
        await safe(viewport.label, 'nav resolution', () => collectNavResolution(browser, agencyContext, viewport, [
          '/agency/fleet', '/agency/jobs', '/agency/billing', '/agency/drivers', '/agency/rates', '/agency/profile',
          '/packing', '/routes', '/tracking', '/booking/new', '/management', '/sale-orders', '/history', '/settings/company', '/subscription', '/support',
        ]))
      } finally {
        await agencyContext.close()
      }
    }

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      mode: 'local-first fixture tier (device-local agency identity; no cloud backend)',
      summary: {
        checks: results.length,
        hardFailures: hardFailures.length,
        findings: results.reduce((sum, r) => sum + r.findings.length, 0),
      },
      results,
    }
    await fs.writeFile(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8')
    console.log(`\nUX route audit complete: ${REPORT_PATH}`)
    console.log(`Checks: ${results.length} · Hard failures: ${hardFailures.length} · Findings: ${report.summary.findings}`)
    if (hardFailures.length > 0) {
      console.error('\nHard failures (journey-breaking):')
      for (const failure of hardFailures) {
        console.error(`  [${failure.viewport}] ${failure.kind} ${failure.path} — ${failure.hardFailure}`)
      }
      process.exitCode = 1
    }
  } finally {
    await browser.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
