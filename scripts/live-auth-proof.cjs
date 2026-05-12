const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')
const { chromium } = require('playwright')
const { readEnvValue, validateRequiredEnv } = require('./_proofEnv.cjs')

const baseUrl = readEnvValue('PROOF_BASE_URL') || 'https://www.truckopti.in'
const password = readEnvValue('SEED_DEMO_PASSWORD')
const supabaseUrl = readEnvValue('SUPABASE_URL', ['VITE_SUPABASE_URL'])
const supabaseServiceRoleKey = readEnvValue('SUPABASE_SERVICE_ROLE_KEY')

if (!validateRequiredEnv(['SEED_DEMO_PASSWORD'])) {
    process.exit(1)
}

const screenshotDir = path.join(__dirname, '..', 'screenshots', 'live-auth-proof')
const reportPath = path.join(__dirname, '..', '0.dev-matrix', 'test-reports', 'live-auth-proof.json')

fs.mkdirSync(screenshotDir, { recursive: true })

const DRIVER_TRIP_FIXTURE = Object.freeze({
    driverPhone: '9999999991',
    shipmentId: 'PROOF-TRIP-DEMO',
    origin: 'Delhi Demo Yard',
    destination: 'Jaipur Demo Hub',
    totalWeight: 1200,
    totalVolume: 18,
    estimatedCost: 4500,
    pickupOtp: '1111',
    deliveryOtp: '2222',
})

const DRIVER_TRIP_STEP_TEXTS = [
    'Navigate to Pickup',
    'Enter Pickup OTP',
    'Capture Loading Photo',
    'Journey in Progress',
    'Enter Delivery OTP',
    'Proof of Delivery',
    'Delivery Complete!',
]

const DRIVER_TRIP_PROOF_IMAGE_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4////fwAJ+wP9KobjigAAAABJRU5ErkJggg=='

const serviceSupabase = supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
    : null

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

async function waitForBodyText(page, text, timeout = 20000) {
    await page.waitForFunction(
        (requiredText) => (document.body?.innerText || '').includes(requiredText),
        text,
        { timeout }
    )
}

async function waitForButtonEnabled(page, buttonText, timeout = 30000) {
    await page.waitForFunction(
        (requiredText) => Array.from(document.querySelectorAll('button'))
            .some((button) => (button.innerText || '').includes(requiredText) && !button.disabled),
        buttonText,
        { timeout }
    )
}

function ensureProofImageAsset() {
    const filePath = path.join(screenshotDir, 'driver-trip-proof.png')

    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, Buffer.from(DRIVER_TRIP_PROOF_IMAGE_BASE64, 'base64'))
    }

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

async function ensureDriverTripFixture() {
    if (!serviceSupabase) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to seed the driver trip fixture')
    }

    const { data: driver, error: driverError } = await serviceSupabase
        .from('drivers')
        .select('id, full_name, rc_number')
        .eq('phone', DRIVER_TRIP_FIXTURE.driverPhone)
        .maybeSingle()

    if (driverError || !driver) {
        throw driverError || new Error('Demo driver profile was not found')
    }

    const { data: shipment, error: shipmentError } = await serviceSupabase
        .from('shipments')
        .upsert({
            shipment_id: DRIVER_TRIP_FIXTURE.shipmentId,
            customer_id: null,
            truck_id: null,
            origin: DRIVER_TRIP_FIXTURE.origin,
            destination: DRIVER_TRIP_FIXTURE.destination,
            status: 'pending',
            total_weight: DRIVER_TRIP_FIXTURE.totalWeight,
            total_volume: DRIVER_TRIP_FIXTURE.totalVolume,
            estimated_cost: DRIVER_TRIP_FIXTURE.estimatedCost,
            driver_name: driver.full_name,
            vehicle_number: driver.rc_number || 'DL01AB1234',
        }, { onConflict: 'shipment_id' })
        .select('id')
        .single()

    if (shipmentError || !shipment) {
        throw shipmentError || new Error('Unable to create the demo trip shipment')
    }

    const { data: existingOffers, error: existingOffersError } = await serviceSupabase
        .from('job_offers')
        .select('id')
        .eq('shipment_id', shipment.id)
        .eq('driver_id', driver.id)
        .order('offered_at', { ascending: false })
        .limit(1)

    if (existingOffersError) {
        throw existingOffersError
    }

    const offerPayload = {
        status: 'accepted',
        offered_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        responded_at: new Date().toISOString(),
        decline_reason: null,
        pickup_otp: DRIVER_TRIP_FIXTURE.pickupOtp,
        delivery_otp: DRIVER_TRIP_FIXTURE.deliveryOtp,
        pickup_arrived_at: null,
        journey_started_at: null,
        delivery_arrived_at: null,
        delivered_at: null,
        photo_loading_url: null,
        photo_delivery_url: null,
    }

    let jobOfferId = existingOffers?.[0]?.id || null

    if (jobOfferId) {
        const { error: updateOfferError } = await serviceSupabase
            .from('job_offers')
            .update(offerPayload)
            .eq('id', jobOfferId)

        if (updateOfferError) {
            throw updateOfferError
        }
    } else {
        const { data: insertedOffer, error: insertOfferError } = await serviceSupabase
            .from('job_offers')
            .insert({
                shipment_id: shipment.id,
                driver_id: driver.id,
                ...offerPayload,
            })
            .select('id')
            .single()

        if (insertOfferError || !insertedOffer) {
            throw insertOfferError || new Error('Unable to create the demo trip job offer')
        }

        jobOfferId = insertedOffer.id
    }

    const { error: driverUpdateError } = await serviceSupabase
        .from('drivers')
        .update({ active_job_id: jobOfferId, status: 'approved' })
        .eq('id', driver.id)

    if (driverUpdateError) {
        throw driverUpdateError
    }

    return {
        driverId: driver.id,
        jobOfferId,
        seededFixture: true,
    }
}

async function fetchDriverTripProofState(jobOfferId) {
    if (!serviceSupabase) {
        return null
    }

    const { data: jobOffer, error: jobOfferError } = await serviceSupabase
        .from('job_offers')
        .select('id, driver_id, status, pickup_arrived_at, journey_started_at, delivery_arrived_at, delivered_at, photo_loading_url, photo_delivery_url')
        .eq('id', jobOfferId)
        .single()

    if (jobOfferError || !jobOffer) {
        throw jobOfferError || new Error('Driver trip proof state could not be loaded')
    }

    const { data: driver, error: driverError } = await serviceSupabase
        .from('drivers')
        .select('active_job_id, total_trips')
        .eq('id', jobOffer.driver_id)
        .single()

    if (driverError) {
        throw driverError
    }

    return {
        status: jobOffer.status,
        pickupArrivedAt: jobOffer.pickup_arrived_at,
        journeyStartedAt: jobOffer.journey_started_at,
        deliveryArrivedAt: jobOffer.delivery_arrived_at,
        deliveredAt: jobOffer.delivered_at,
        photoLoadingUrl: jobOffer.photo_loading_url,
        photoDeliveryUrl: jobOffer.photo_delivery_url,
        activeJobId: driver?.active_job_id ?? null,
        totalTrips: driver?.total_trips ?? 0,
    }
}

async function releaseDriverTripFixture(driverId) {
    if (!serviceSupabase || !driverId) {
        return
    }

    const { error } = await serviceSupabase
        .from('drivers')
        .update({ active_job_id: null })
        .eq('id', driverId)

    if (error) {
        throw error
    }
}

function assertDriverTripCompletion(dbState) {
    if (!dbState) {
        throw new Error('Missing driver trip proof database state')
    }

    if (dbState.status !== 'delivered') {
        throw new Error(`Expected driver trip status to be delivered, received ${dbState.status}`)
    }

    const requiredFields = {
        pickupArrivedAt: dbState.pickupArrivedAt,
        journeyStartedAt: dbState.journeyStartedAt,
        deliveryArrivedAt: dbState.deliveryArrivedAt,
        deliveredAt: dbState.deliveredAt,
        photoLoadingUrl: dbState.photoLoadingUrl,
        photoDeliveryUrl: dbState.photoDeliveryUrl,
    }

    for (const [field, value] of Object.entries(requiredFields)) {
        if (!value) {
            throw new Error(`Expected driver trip proof to persist ${field}`)
        }
    }

    if (dbState.activeJobId !== null) {
        throw new Error('Expected the driver active job to clear after delivery completion')
    }
}

async function proveDriverTripRouteAccess(page) {
    const openTripFromDashboard = async () => {
        const viewTripButton = page.getByRole('button', { name: 'View Trip' }).first()
        if (await viewTripButton.count()) {
            await viewTripButton.click()
            return true
        }

        const acceptButton = page.getByRole('button', { name: 'Accept' }).first()
        if (await acceptButton.count()) {
            await acceptButton.click()
            await page.waitForTimeout(1500)
            await page.goto('/driver/dashboard', { waitUntil: 'domcontentloaded' })
            await waitForProtectedPath(page, '/driver/dashboard')
            await waitForAuthenticatedContent(page, ['My Wallet'])

            if (await viewTripButton.count()) {
                await viewTripButton.click()
                return true
            }
        }

        return false
    }

    let seededFixture = false
    let openedTrip = await openTripFromDashboard()

    if (!openedTrip) {
        const fixture = await ensureDriverTripFixture()
        seededFixture = fixture.seededFixture
        await page.goto('/driver/dashboard', { waitUntil: 'domcontentloaded' })
        await waitForProtectedPath(page, '/driver/dashboard')
        await waitForAuthenticatedContent(page, ['My Wallet'])
        const viewTripButton = page.getByRole('button', { name: 'View Trip' }).first()
        await viewTripButton.waitFor({ state: 'visible', timeout: 15000 })
        await viewTripButton.click()
        openedTrip = true
    }

    if (!openedTrip) {
        throw new Error('Driver dashboard did not expose a trip entry path')
    }

    await page.waitForURL((url) => url.pathname.startsWith('/driver/trip/'), { timeout: 15000 })
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 })
    } catch {
        // The live app can keep background requests open; the route and body checks below are stronger.
    }

    try {
        await page.waitForFunction(
            (stepTexts) => {
                const body = document.body?.innerText || ''
                return body.includes('Shipment Details') || body.includes('Trip Not Found') || stepTexts.some((text) => body.includes(text))
            },
            DRIVER_TRIP_STEP_TEXTS,
            { timeout: 20000 }
        )
    } catch {
        // The body assertion below will surface the final visible state if the route never resolves cleanly.
    }

    const body = await page.locator('body').innerText()
    if (body.includes('Trip Not Found')) {
        throw new Error(`Driver trip route opened but the job was not accessible: ${body.slice(0, 400)}`)
    }

    if (!body.includes('Shipment Details')) {
        throw new Error(`Driver trip route did not finish loading expected content: ${body.slice(0, 400)}`)
    }

    ensureText(body, ['Shipment Details'], ['Application Error', 'Trip not found'])

    if (!DRIVER_TRIP_STEP_TEXTS.some((text) => body.includes(text))) {
        throw new Error('Expected the driver trip page to show a known trip workflow step')
    }

    if (seededFixture) {
        ensureText(body, [
            DRIVER_TRIP_FIXTURE.origin,
            DRIVER_TRIP_FIXTURE.destination,
            'Navigate to Pickup',
        ], [])
    }

    return {
        path: new URL(page.url()).pathname,
        seededFixture,
        screenshot: await saveScreenshot(page, 'driver-driver-trip'),
    }
}

async function proveFullDriverTrip(page) {
    const proofImagePath = ensureProofImageAsset()
    const fixture = await ensureDriverTripFixture()
    const screenshots = []
    let tripPath = ''

    try {
        await page.goto('/driver/dashboard', { waitUntil: 'domcontentloaded' })
        await waitForProtectedPath(page, '/driver/dashboard')
        await waitForAuthenticatedContent(page, ['My Wallet'])

        const dashboardBody = await page.locator('body').innerText()
        ensureText(dashboardBody, ['My Wallet', 'View Trip'], ['Application Error'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-dashboard-ready'))

        const viewTripButton = page.getByRole('button', { name: /View Trip/i }).first()
        await viewTripButton.waitFor({ state: 'visible', timeout: 15000 })
        await viewTripButton.click()

        await page.waitForURL((url) => url.pathname.startsWith('/driver/trip/'), { timeout: 15000 })
        try {
            await page.waitForLoadState('networkidle', { timeout: 10000 })
        } catch {
            // The live app can keep background requests open; the route and body checks are stronger.
        }

        tripPath = new URL(page.url()).pathname
        await waitForBodyText(page, 'Shipment Details')

        let body = await page.locator('body').innerText()
        ensureText(body, [
            'Shipment Details',
            DRIVER_TRIP_FIXTURE.origin,
            DRIVER_TRIP_FIXTURE.destination,
            'Navigate to Pickup',
        ], ['Application Error', 'Trip Not Found'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-navigate'))

        await page.getByRole('button', { name: /Arrived at Pickup/i }).click()
        await waitForBodyText(page, 'Enter Pickup OTP')
        body = await page.locator('body').innerText()
        ensureText(body, ['Enter Pickup OTP'], ['Incorrect OTP'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-pickup-otp'))

        await page.locator('input[placeholder="0000"]').fill(DRIVER_TRIP_FIXTURE.pickupOtp)
        await page.getByRole('button', { name: /^Verify OTP$/i }).click()
        await waitForBodyText(page, 'Capture Loading Photo')
        body = await page.locator('body').innerText()
        ensureText(body, ['Capture Loading Photo'], ['Incorrect OTP'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-loading-photo'))

        await page.locator('input[type="file"]').setInputFiles(proofImagePath)
        await waitForButtonEnabled(page, 'Start Journey')
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-loading-photo-uploaded'))

        await page.getByRole('button', { name: /Start Journey/i }).click()
        await waitForBodyText(page, 'Journey in Progress')
        body = await page.locator('body').innerText()
        ensureText(body, ['Journey in Progress'], ['Application Error'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-in-transit'))

        await page.getByRole('button', { name: /Arrived at Destination/i }).click()
        await waitForBodyText(page, 'Enter Delivery OTP')
        body = await page.locator('body').innerText()
        ensureText(body, ['Enter Delivery OTP'], ['Incorrect OTP'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-destination-otp'))

        await page.locator('input[placeholder="0000"]').fill(DRIVER_TRIP_FIXTURE.deliveryOtp)
        await page.getByRole('button', { name: /^Verify OTP$/i }).click()
        await waitForBodyText(page, 'Proof of Delivery')
        body = await page.locator('body').innerText()
        ensureText(body, ['Proof of Delivery'], ['Incorrect OTP'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-delivery-photo'))

        await page.locator('input[type="file"]').setInputFiles(proofImagePath)
        await waitForButtonEnabled(page, 'Complete Delivery')
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-delivery-photo-uploaded'))

        await page.getByRole('button', { name: /Complete Delivery/i }).click()
        await waitForProtectedPath(page, '/driver/dashboard')
        await waitForAuthenticatedContent(page, ['My Wallet'])
        screenshots.push(await saveScreenshot(page, 'driver-trip-step-complete'))

        const dbState = await fetchDriverTripProofState(fixture.jobOfferId)
        assertDriverTripCompletion(dbState)

        return {
            path: tripPath,
            seededFixture: fixture.seededFixture,
            completed: true,
            fullProof: true,
            screenshots,
            screenshot: screenshots[screenshots.length - 1],
            dbState,
        }
    } finally {
        await releaseDriverTripFixture(fixture.driverId)
    }
}

async function proveDriverTrip(page) {
    if (!serviceSupabase) {
        const routeAccessProof = await proveDriverTripRouteAccess(page)

        return {
            ...routeAccessProof,
            completed: false,
            fullProof: false,
            screenshots: [routeAccessProof.screenshot],
            dbState: null,
            note: 'Service-role Supabase credentials were unavailable, so only route access was verified.',
        }
    }

    return proveFullDriverTrip(page)
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
    await waitForAuthenticatedContent(page, spec.requiredText)

    const landingBody = await page.locator('body').innerText()
    ensureText(landingBody, spec.requiredText, spec.forbiddenText)

    const screenshots = [
        await saveScreenshot(page, `${spec.key}-${spec.protectedPath}`),
    ]

    for (const extraRoute of spec.extraPaths || []) {
        const routeSpec = typeof extraRoute === 'string'
            ? { path: extraRoute, requiredText: [], forbiddenText: spec.extraForbiddenText || [] }
            : {
                path: extraRoute.path,
                requiredText: extraRoute.requiredText || [],
                forbiddenText: extraRoute.forbiddenText || spec.extraForbiddenText || [],
            }

        await page.goto(routeSpec.path, { waitUntil: 'domcontentloaded' })
        await waitForProtectedPath(page, routeSpec.path)
        await waitForAuthenticatedContent(page, routeSpec.requiredText)
        const extraBody = await page.locator('body').innerText()
        ensureText(extraBody, routeSpec.requiredText, routeSpec.forbiddenText)
        screenshots.push(await saveScreenshot(page, `${spec.key}-${routeSpec.path}`))
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
            extraPaths: [
                '/driver/earnings',
                '/driver/history',
                { path: '/driver/profile', requiredText: ['Profile & Settings'], forbiddenText: ['Application Error'] },
            ],
            requiredText: ['My Wallet'],
            forbiddenText: ['Your application is under review.', 'Contact support to reapply or resolve issues.'],
        })
        const driverTrip = await proveDriverTrip(driver.page)
        driver.screenshots.push(...driverTrip.screenshots)
        report.checks.push({
            key: 'driver',
            protectedPath: '/driver/dashboard',
            consoleErrors: driver.consoleErrors,
            screenshots: driver.screenshots,
            driverTripPath: driverTrip.path,
            seededTripFixture: driverTrip.seededFixture,
            driverTripCompleted: driverTrip.completed,
            driverTripFullProof: driverTrip.fullProof,
            driverTripNote: driverTrip.note || null,
            driverTripState: driverTrip.dbState,
        })
        await driver.context.close()

        const agency = await loginAndReachPath(browser, {
            key: 'agency',
            loginId: 'demo.agency',
            protectedPath: '/agency/dashboard',
            extraPaths: [
                '/agency/fleet',
                '/agency/jobs',
                '/agency/drivers',
                '/agency/billing',
                { path: '/agency/rates', requiredText: ['Rate Cards'], forbiddenText: ['Application Error', 'Failed to load rate cards'] },
            ],
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
            extraPaths: [
                { path: '/dashboard', requiredText: ['Quick Actions'], forbiddenText: ['Application Error'] },
                { path: '/management', requiredText: ['Management Hub', 'Truck Fleet'], forbiddenText: ['Application Error', 'Failed to load management data'] },
                { path: '/packing', requiredText: ['3D Bin Packing'], forbiddenText: ['Application Error'] },
                { path: '/routes', requiredText: ['Routes', 'AI-powered route optimization'], forbiddenText: ['Application Error', 'Failed to load routes'] },
                { path: '/tracking', requiredText: ['Live Tracking', 'Fleet Map'], forbiddenText: ['Application Error', 'Failed to load shipments'] },
                { path: '/management/trucks', requiredText: ['Truck Types'], forbiddenText: ['Application Error', 'Failed to load trucks'] },
                { path: '/management/cartons', requiredText: ['Carton Types'], forbiddenText: ['Application Error', 'Failed to load cartons'] },
                { path: '/sale-orders', requiredText: ['Sale Orders'], forbiddenText: ['Application Error'] },
                { path: '/settings/company', requiredText: ['Company Profile'], forbiddenText: ['Application Error', 'Failed to load company profile'] },
                { path: '/booking/new', requiredText: ['New Shipment'], forbiddenText: ['Application Error'] },
                { path: '/history', requiredText: ['Shipment History'], forbiddenText: ['Application Error'] },
            ],
            requiredText: ['Customers'],
            forbiddenText: ['Failed to load customers'],
        })
        await customer.page.goto('/management/customers', { waitUntil: 'domcontentloaded' })
        await waitForProtectedPath(customer.page, '/management/customers')
        await waitForAuthenticatedContent(customer.page, ['Customers'])
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
            driverTripPath: check.driverTripPath || '',
            seededTripFixture: check.seededTripFixture ? 'yes' : '',
            driverTripCompleted: check.driverTripCompleted ? 'yes' : '',
            driverTripStatus: check.driverTripState?.status || '',
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