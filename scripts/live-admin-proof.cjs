/**
 * live-admin-proof.cjs
 *
 * Authenticated Playwright proof for the TruckOpti Admin (management) portal.
 * Logs in as demo.admin, visits all 7 admin routes, asserts page content.
 *
 * Usage:
 *   SEED_DEMO_PASSWORD=<password> node scripts/live-admin-proof.cjs
 *
 * Optional env vars:
 *   PROOF_BASE_URL   — defaults to https://www.truckopti.in
 */

const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')
const { readEnvValue } = require('./_proofEnv.cjs')

const baseUrl = readEnvValue('PROOF_BASE_URL') || 'https://www.truckopti.in'
const password = readEnvValue('SEED_DEMO_PASSWORD')

if (!password) {
    console.error('Missing SEED_DEMO_PASSWORD (set it in .env.proof.local, .env.local, .env, or the shell environment)')
    process.exit(1)
}

const screenshotDir = path.join(__dirname, '..', 'screenshots', 'live-admin-proof')
const reportPath = path.join(__dirname, '..', '0.dev-matrix', 'test-reports', 'live-admin-proof.json')

fs.mkdirSync(screenshotDir, { recursive: true })

function slugify(value) {
    return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

async function saveScreenshot(page, name) {
    const filePath = path.join(screenshotDir, `${slugify(name)}.png`)
    await page.screenshot({ path: filePath, fullPage: true })
    return filePath
}

async function waitForPath(page, pathname, timeout = 30000) {
    await page.waitForURL((url) => url.pathname === pathname, { timeout })
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 })
    } catch {
        // networkidle can time out on live-data pages; URL match is the stronger guarantee.
    }
}

async function waitForAuthenticatedContent(page, requiredText = []) {
    try {
        await page.waitForFunction(
            (required) => {
                const body = document.body?.innerText || ''
                if (body.includes('Completing Sign In')) {
                    return false
                }

                return required.every((text) => body.includes(text))
            },
            requiredText,
            { timeout: 15000 }
        )
    } catch {
        // Fall back to the body assertion below so failures still report the real missing text.
    }
}

function ensureText(body, required, forbidden) {
    for (const text of required || []) {
        if (!body.includes(text)) {
            throw new Error(`Expected page body to include "${text}"`)
        }
    }
    for (const text of forbidden || []) {
        if (body.includes(text)) {
            throw new Error(`Expected page body to exclude "${text}"`)
        }
    }
}

async function proveAdminDriverDetail(page) {
    await page.goto('/admin/drivers', { waitUntil: 'domcontentloaded' })
    await waitForPath(page, '/admin/drivers')

    const tabs = ['Pending', 'Approved', 'Rejected', 'Suspended']
    let foundDetailsButton = false

    for (const tabName of tabs) {
        await page.getByRole('button', { name: tabName, exact: true }).click()
        await page.waitForTimeout(800)
        try {
            await page.waitForLoadState('networkidle', { timeout: 5000 })
        } catch {
            // networkidle can time out on live views; the button visibility check below is the real gate.
        }

        const detailsButton = page.getByRole('button', { name: 'Details' }).first()
        if (await detailsButton.count()) {
            await detailsButton.click()
            foundDetailsButton = true
            break
        }
    }

    if (!foundDetailsButton) {
        throw new Error('No driver detail rows were available in any admin driver tab')
    }

    await page.waitForURL((url) => /^\/admin\/drivers\/[^/]+$/.test(url.pathname), { timeout: 15000 })
    await waitForAuthenticatedContent(page, ['Driver Details'])

    const body = await page.locator('body').innerText()
    ensureText(body, ['Driver Details'], ['Application Error', 'Driver not found'])

    return {
        path: new URL(page.url()).pathname,
        screenshot: await saveScreenshot(page, 'admin-driver-detail'),
    }
}

const ADMIN_ROUTES = [
    {
        path: '/admin',
        label: 'Admin Dashboard',
        required: ['Platform Analytics'],
        forbidden: ['Application Error', 'Admin access required'],
    },
    {
        path: '/admin/drivers',
        label: 'Admin Drivers',
        required: [],
        forbidden: ['Application Error', 'Failed to load'],
    },
    {
        path: '/admin/agencies',
        label: 'Admin Agencies',
        required: [],
        forbidden: ['Application Error', 'Failed to load agencies'],
    },
    {
        path: '/admin/payouts',
        label: 'Admin Payouts',
        required: [],
        forbidden: ['Application Error'],
    },
    {
        path: '/admin/contact',
        label: 'Admin Contact',
        required: [],
        forbidden: ['Application Error'],
    },
    {
        path: '/admin/users',
        label: 'Admin Users',
        required: [],
        forbidden: ['Application Error'],
    },
    {
        path: '/admin/subscriptions',
        label: 'Admin Subscriptions',
        required: [],
        forbidden: ['Application Error'],
    },
]

async function main() {
    const browser = await chromium.launch({ headless: true })
    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        loginId: 'demo.admin',
        checks: [],
    }
    let passed = 0
    let failed = 0

    try {
        const context = await browser.newContext({
            baseURL: baseUrl,
            ignoreHTTPSErrors: true,
            viewport: { width: 1440, height: 900 },
        })
        const page = await context.newPage()
        const consoleErrors = []

        page.on('console', (msg) => {
            if (msg.type() === 'error') {
                consoleErrors.push({ text: msg.text(), location: msg.location() })
            }
        })
        page.on('pageerror', (err) => {
            consoleErrors.push({ text: err.message, location: null })
        })

        // ── Login ──────────────────────────────────────────────────────────
        console.log('→ Navigating to /admin to trigger redirect to /login …')
        await page.goto('/admin', { waitUntil: 'domcontentloaded' })
        await page.waitForURL((url) => url.pathname === '/login', { timeout: 15000 })

        await page.getByRole('button', { name: 'Password', exact: true }).click()
        await page.locator('input[placeholder="your@email.com or demo.driver"]').fill('demo.admin')
        await page.locator('input[placeholder="Enter your password"]').fill(password)
        await page.getByRole('button', { name: 'Sign In with Password' }).click()
        await waitForPath(page, '/admin')
        await waitForAuthenticatedContent(page, ADMIN_ROUTES[0].required)
        console.log('✓ Logged in and reached /admin')

        // ── Visit each admin route ─────────────────────────────────────────
        for (const route of ADMIN_ROUTES) {
            try {
                if (page.url().includes(route.path) === false) {
                    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
                    await waitForPath(page, route.path)
                }

                await waitForAuthenticatedContent(page, route.required)

                const body = await page.locator('body').innerText()
                ensureText(body, route.required, route.forbidden)
                const screenshot = await saveScreenshot(page, `admin-${route.path}`)

                report.checks.push({
                    path: route.path,
                    label: route.label,
                    status: 'pass',
                    screenshot,
                })
                console.log(`  ✓ ${route.label} (${route.path})`)
                passed++
            } catch (err) {
                const screenshot = await saveScreenshot(page, `admin-${route.path}-FAIL`).catch(() => null)
                report.checks.push({
                    path: route.path,
                    label: route.label,
                    status: 'fail',
                    error: err.message,
                    screenshot,
                })
                console.error(`  ✗ ${route.label} (${route.path}): ${err.message}`)
                failed++
            }
        }

        try {
            const driverDetail = await proveAdminDriverDetail(page)
            report.checks.push({
                path: driverDetail.path,
                label: 'Admin Driver Detail',
                status: 'pass',
                screenshot: driverDetail.screenshot,
            })
            console.log(`  ✓ Admin Driver Detail (${driverDetail.path})`)
            passed++
        } catch (err) {
            const screenshot = await saveScreenshot(page, 'admin-driver-detail-FAIL').catch(() => null)
            report.checks.push({
                path: '/admin/drivers/:id',
                label: 'Admin Driver Detail',
                status: 'fail',
                error: err.message,
                screenshot,
            })
            console.error(`  ✗ Admin Driver Detail (/admin/drivers/:id): ${err.message}`)
            failed++
        }

        report.consoleErrors = consoleErrors
        await context.close()
    } finally {
        await browser.close()
    }

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
    console.log(`\nAdmin proof report written to ${reportPath}`)
    console.log(`Results: ${passed} passed, ${failed} failed`)

    if (failed > 0) {
        process.exit(1)
    }
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
