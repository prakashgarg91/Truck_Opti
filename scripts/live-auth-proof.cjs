const fs = require('fs')
const path = require('path')
const { chromium } = require('playwright')

const baseUrl = process.env.PROOF_BASE_URL || 'https://www.truckopti.in'
const password = process.env.SEED_DEMO_PASSWORD

if (!password) {
    console.error('Missing SEED_DEMO_PASSWORD')
    process.exit(1)
}

const screenshotDir = path.join(__dirname, '..', 'screenshots', 'live-auth-proof')
const reportPath = path.join(__dirname, '..', '0.dev-matrix', 'test-reports', 'live-auth-proof.json')

fs.mkdirSync(screenshotDir, { recursive: true })

function slugify(value) {
    return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

async function waitForProtectedPath(page, pathname) {
    await page.waitForURL((url) => url.pathname === pathname, { timeout: 30000 })
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 })
    } catch {
        // The live app keeps a few long-running requests; URL match is the stronger guarantee.
    }
}

async function saveScreenshot(page, name) {
    const filePath = path.join(screenshotDir, `${slugify(name)}.png`)
    await page.screenshot({ path: filePath, fullPage: true })
    return filePath
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

async function loginAndReachPath(browser, spec) {
    const context = await browser.newContext({
        baseURL: baseUrl,
        ignoreHTTPSErrors: true,
        viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()
    const consoleErrors = []

    page.on('console', (message) => {
        if (message.type() === 'error') {
            consoleErrors.push({
                text: message.text(),
                location: message.location(),
            })
        }
    })
    page.on('pageerror', (error) => {
        consoleErrors.push({
            text: error.message,
            location: null,
        })
    })

    await page.goto(spec.protectedPath, { waitUntil: 'domcontentloaded' })
    await page.waitForURL((url) => url.pathname === '/login', { timeout: 15000 })
    await page.getByRole('button', { name: 'Password' }).click()
    await page.locator('input[placeholder="your@email.com or demo.driver"]').fill(spec.loginId)
    await page.locator('input[placeholder="Enter your password"]').fill(password)
    await page.getByRole('button', { name: 'Sign In with Password' }).click()
    await waitForProtectedPath(page, spec.protectedPath)

    const landingBody = await page.locator('body').innerText()
    ensureText(landingBody, spec.requiredText, spec.forbiddenText)

    const screenshots = [
        await saveScreenshot(page, `${spec.key}-${spec.protectedPath}`),
    ]

    for (const extraPath of spec.extraPaths || []) {
        await page.goto(extraPath, { waitUntil: 'domcontentloaded' })
        await waitForProtectedPath(page, extraPath)
        const extraBody = await page.locator('body').innerText()
        ensureText(extraBody, [], spec.extraForbiddenText || [])
        screenshots.push(await saveScreenshot(page, `${spec.key}-${extraPath}`))
    }

    return { context, page, consoleErrors, screenshots }
}

async function cleanupProofCustomers(page) {
    // Delete any leftover "Proof Customer" rows created by previous test runs
    let deleted = 0
    for (let attempt = 0; attempt < 20; attempt++) {
        const rows = page.locator('text=/Proof Customer \\d+/')
        const count = await rows.count()
        if (count === 0) break

        const deleteBtn = page.locator('[aria-label="Delete customer"], button[title="Delete"]').first()
        if (await deleteBtn.count() === 0) {
            // Find the first proof customer row's delete icon button (trash)
            const proofRow = rows.first()
            const trashBtn = proofRow.locator('xpath=ancestor::div[contains(@class,"border")]').locator('button').last()
            await trashBtn.click()
        } else {
            await deleteBtn.click()
        }
        // Confirm deletion dialog if present
        try {
            const confirmBtn = page.getByRole('button', { name: /delete|confirm|yes/i })
            if (await confirmBtn.count()) await confirmBtn.first().click()
        } catch { /* no confirm dialog — deletion was immediate */ }
        await page.waitForTimeout(600)
        deleted++
    }
    return deleted
}

async function createCustomerProof(page) {
    const proofToken = Date.now()
    const customerName = `Proof Customer ${proofToken}`
    const addButton = page.getByRole('button', { name: 'Add Customer' })

    if (await addButton.count()) {
        await addButton.first().click()
    } else {
        await page.locator('button.bg-primary-600').first().click()
    }

    await page.getByText('Add New Customer').waitFor({ state: 'visible', timeout: 10000 })
    await page.locator('input[placeholder="e.g. Reliance Retail"]').fill(customerName)
    await page.locator('input[placeholder="+91 98765 43210"]').fill('9999999993')
    await page.locator('input[placeholder="contact@company.com"]').fill(`proof.customer.${proofToken}@truckopti.in`)
    await page.locator('input[placeholder="e.g. Mumbai"]').fill('Delhi')
    await page.locator('input[placeholder="e.g. Maharashtra"]').fill('Delhi')
    await page.locator('input[placeholder="400001"]').fill('110001')
    await page.locator('input[placeholder="ABCDE1234F"]').fill('ABCDE1234H')
    await page.locator('textarea[placeholder="Street address, Landmark"]').fill('Proof Street, Demo Logistics Park')
    await page.getByRole('button', { name: 'Save Customer' }).click()
    await page.getByText(customerName).waitFor({ state: 'visible', timeout: 15000 })

    return customerName
}

async function main() {
    const browser = await chromium.launch({ headless: true })
    const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        checks: [],
    }

    try {
        const driver = await loginAndReachPath(browser, {
            key: 'driver',
            loginId: 'demo.driver',
            protectedPath: '/driver/dashboard',
            extraPaths: ['/driver/earnings', '/driver/history'],
            requiredText: ['Offline'],
            forbiddenText: ['Your application is under review.', 'Contact support to reapply or resolve issues.'],
        })
        report.checks.push({
            key: 'driver',
            protectedPath: '/driver/dashboard',
            consoleErrors: driver.consoleErrors,
            screenshots: driver.screenshots,
        })
        await driver.context.close()

        const agency = await loginAndReachPath(browser, {
            key: 'agency',
            loginId: 'demo.agency',
            protectedPath: '/agency/dashboard',
            extraPaths: ['/agency/fleet', '/agency/jobs', '/agency/drivers', '/agency/billing'],
            requiredText: ['TruckOpti Demo Logistics Pvt Ltd'],
            forbiddenText: ['No Agency Profile Found', 'Verification Pending', 'Your application is under review.'],
        })
        report.checks.push({
            key: 'agency',
            protectedPath: '/agency/dashboard',
            consoleErrors: agency.consoleErrors,
            screenshots: agency.screenshots,
        })
        await agency.context.close()

        const customer = await loginAndReachPath(browser, {
            key: 'customer',
            loginId: 'demo.customer',
            protectedPath: '/management/customers',
            requiredText: ['Customers'],
            forbiddenText: ['Failed to load customers'],
        })
        // Clean up any leftover proof customers from previous runs
        const cleanedUp = await cleanupProofCustomers(customer.page)
        if (cleanedUp > 0) console.log(`  ↩ Cleaned up ${cleanedUp} leftover proof customer(s) from previous runs`)

        const createdCustomer = await createCustomerProof(customer.page)
        customer.screenshots.push(await saveScreenshot(customer.page, 'customer-created-record'))

        // Clean up the proof customer we just created
        await cleanupProofCustomers(customer.page)

        report.checks.push({
            key: 'customer',
            protectedPath: '/management/customers',
            consoleErrors: customer.consoleErrors,
            screenshots: customer.screenshots,
            createdCustomer,
        })
        await customer.context.close()

        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
        console.log(`Live auth proof report written to ${reportPath}`)
        console.table(report.checks.map((check) => ({
            key: check.key,
            protectedPath: check.protectedPath,
            consoleErrors: check.consoleErrors.length,
            screenshots: check.screenshots.length,
            createdCustomer: check.createdCustomer || '',
        })))
    } finally {
        await browser.close()
    }
}

main().catch((error) => {
    console.error(error)
    process.exit(1)
})