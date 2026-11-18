import { act, useEffect } from 'react'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-129: accepting an incoming job offer in the real driver dashboard UI must
// go through the single authorized server response and land the driver on the
// existing trip route (/driver/trip/:jobId). Declining must never navigate.
// This complements the DB/RLS behavioral suite in
// scripts/atomic_job_offer_response.rls.test.mjs (mock tier vs local-RLS tier).

const h = vi.hoisted(() => ({
    getByUserId: vi.fn(),
    getPendingOffer: vi.fn(),
    getIncomingJobById: vi.fn(),
    getTripHistory: vi.fn(async () => []),
    getPayoutHistory: vi.fn(async () => []),
    respondToJobOffer: vi.fn(),
    getBalanceSnapshot: vi.fn(),
    requestPayout: vi.fn(),
    setDriverOnlineStatus: vi.fn(async () => undefined),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
    default: {
        error: h.toastError,
        success: h.toastSuccess,
    },
}))

vi.mock('../services/supabaseApi', () => ({
    driverDashboardApi: {
        getPendingOffer: h.getPendingOffer,
        getIncomingJobById: h.getIncomingJobById,
        getTripHistory: h.getTripHistory,
        getPayoutHistory: h.getPayoutHistory,
        respondToJobOffer: h.respondToJobOffer,
        setDriverOnlineStatus: h.setDriverOnlineStatus,
    },
    driverEarningsApi: {
        getBalanceSnapshot: h.getBalanceSnapshot,
        requestPayout: h.requestPayout,
    },
    driverSupabaseApi: {
        getByUserId: h.getByUserId,
    },
}))

vi.mock('../lib/supabase', () => ({
    supabase: {
        channel: vi.fn(() => {
            const channel: Record<string, unknown> = {}
            channel.on = vi.fn(() => channel)
            channel.subscribe = vi.fn(() => channel)
            return channel
        }),
        removeChannel: vi.fn(),
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'auth-user-1' } }),
}))

import DriverDashboardPage from './DriverDashboardPage'
import { UserFacingError } from '../utils/userFacingError'

const DRIVER = {
    id: 'driver-1',
    full_name: 'TO129 Driver',
    phone: '9999999999',
    vehicle_type: 'tata_407',
    home_city: 'Delhi',
    status: 'approved' as const,
    rating: 4.5,
    total_trips: 2,
    is_online: true,
    active_job_id: null,
    created_at: '2026-01-01T00:00:00Z',
}

const PENDING_OFFER = {
    id: 'offer-777',
    shipment_id: 'ship-777',
    offered_at: '2026-10-03T09:00:00Z',
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    status: 'pending',
    shipments: {
        origin: 'Mumbai Yard',
        destination: 'Delhi Hub',
        total_weight: 900,
        estimated_cost: 4200,
    },
}

let container: HTMLElement | null = null
let root: Root | null = null
let lastPath = ''

function TripRouteProbe() {
    const params = useParams()
    return createElement('div', { 'data-testid': 'trip-probe' }, `TRIP:${params.jobId}`)
}

function LocationWatcher() {
    const location = useLocation()
    useEffect(() => {
        lastPath = location.pathname
    }, [location.pathname])
    return null
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    const page = createElement(DriverDashboardPage) as ReactElement
    await act(async () => {
        root = createRoot(container as HTMLElement)
        root.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/driver/dashboard'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/driver/dashboard', element: page }),
                    createElement(Route, { path: '/driver/trip/:jobId', element: createElement(TripRouteProbe) }),
                ),
                createElement(LocationWatcher),
            )
        )
    })
    return container
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (predicate()) return
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25))
        })
    }
    throw new Error(`timed out waiting for ${label}`)
}

function findButton(matcher: RegExp): HTMLButtonElement {
    const buttons = Array.from((container as HTMLElement).querySelectorAll('button'))
    const button = buttons.find((b) => matcher.test(b.textContent || ''))
    if (!button) throw new Error(`button matching ${matcher} not found`)
    return button
}

async function clickButton(matcher: RegExp): Promise<void> {
    const button = findButton(matcher)
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

describe('DriverDashboardPage offer response (TO-129)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        lastPath = ''
        h.getByUserId.mockResolvedValue(DRIVER)
        h.getPendingOffer.mockResolvedValue(PENDING_OFFER)
        h.respondToJobOffer.mockResolvedValue({
            offerId: 'offer-777',
            offerStatus: 'accepted',
            respondedAt: '2026-10-03T09:01:00Z',
            activeJobId: 'offer-777',
        })
    })

    it('shows the pending offer modal and Accept lands on the trip route via the single authorized response', async () => {
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('New Job Offer'), 'incoming offer modal')
        await waitFor(() => (view.textContent || '').includes('Mumbai Yard'), 'offer pickup location')

        await clickButton(/Accept/)

        await waitFor(() => lastPath === '/driver/trip/offer-777', 'navigation to the trip route')

        expect(h.respondToJobOffer).toHaveBeenCalledTimes(1)
        expect(h.respondToJobOffer).toHaveBeenCalledWith('offer-777', true)
    })

    it('Decline calls the authorized response with accept=false and never navigates', async () => {
        h.respondToJobOffer.mockResolvedValue({
            offerId: 'offer-777',
            offerStatus: 'declined',
            respondedAt: '2026-10-03T09:01:00Z',
            activeJobId: null,
        })
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('New Job Offer'), 'incoming offer modal')

        await clickButton(/Decline/)

        await waitFor(() => h.respondToJobOffer.mock.calls.length === 1, 'decline response call')
        expect(h.respondToJobOffer).toHaveBeenCalledWith('offer-777', false)
        expect(lastPath).toBe('/driver/dashboard')
    })
})

// Response-state coverage added with the 2026-10-23 design-audit retirement of
// Stitch screen 202377b7: the live wiring (not a designed page) owns the offer
// journey, so its remaining states are pinned here — the bounded server
// rejection path and the active-job-id fallback after acceptance.
describe('DriverDashboardPage offer response states', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        lastPath = ''
        h.getByUserId.mockResolvedValue(DRIVER)
        h.getPendingOffer.mockResolvedValue(PENDING_OFFER)
    })

    it('a rejected response surfaces the bounded server message and never navigates', async () => {
        h.respondToJobOffer.mockRejectedValue(
            new UserFacingError('This job offer has expired.')
        )
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('New Job Offer'), 'incoming offer modal')

        await clickButton(/Accept/)

        await waitFor(() => h.toastError.mock.calls.length > 0, 'bounded rejection toast')
        expect(h.toastError).toHaveBeenCalledWith('This job offer has expired.')
        expect(h.respondToJobOffer).toHaveBeenCalledTimes(1)
        expect(h.respondToJobOffer).toHaveBeenCalledWith('offer-777', true)
        // The driver stays on the dashboard — no trip navigation on failure.
        expect(lastPath).toBe('/driver/dashboard')
        // The offer card is dismissed after the failed response.
        expect((view.textContent || '')).not.toContain('New Job Offer')
    })

    it('acceptance falls back to the incoming offer id when the server returns no active job', async () => {
        h.respondToJobOffer.mockResolvedValue({
            offerId: 'offer-777',
            offerStatus: 'accepted',
            respondedAt: '2026-10-23T09:01:00Z',
            activeJobId: null,
        })
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('New Job Offer'), 'incoming offer modal')

        await clickButton(/Accept/)

        await waitFor(() => lastPath === '/driver/trip/offer-777', 'fallback navigation to the trip route')
        expect(h.toastSuccess).toHaveBeenCalledWith('✅ Job Accepted! Navigate to pickup.')
        expect(h.respondToJobOffer).toHaveBeenCalledTimes(1)
    })
})

// Driver App Home refresh (05bf2a23 → screen 96715dd2, 2026-10-24): the page
// must carry switch semantics on the online toggle, an honest load-error state
// with Retry, a labelled offer dialog with a timer and named actions, real
// tel: support links, and a busy loading status region.
describe('DriverDashboardPage refresh a11y and states', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        lastPath = ''
        h.getByUserId.mockResolvedValue(DRIVER)
        h.getPendingOffer.mockResolvedValue(null)
        h.respondToJobOffer.mockResolvedValue({
            offerId: 'offer-777',
            offerStatus: 'accepted',
            respondedAt: '2026-10-24T09:01:00Z',
            activeJobId: 'offer-777',
        })
    })

    async function waitForElement(selector: string, label: string): Promise<Element> {
        await waitFor(() => (container as HTMLElement).querySelector(selector) !== null, label)
        const found = (container as HTMLElement).querySelector(selector)
        if (!found) throw new Error(`element ${selector} not found after waiting for ${label}`)
        return found
    }

    async function clickElement(element: Element): Promise<void> {
        await act(async () => {
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    it('loading renders a busy status region before data arrives', async () => {
        h.getByUserId.mockReturnValue(new Promise(() => {}))
        const view = await mountPage()

        const status = view.querySelector('[role="status"]')
        expect(status).not.toBeNull()
        expect(status?.getAttribute('aria-busy')).toBe('true')
    })

    it('online toggle is a labelled switch that flips status through the API', async () => {
        await mountPage()
        const toggle = await waitForElement('[role="switch"]', 'online switch')
        expect(toggle.getAttribute('aria-checked')).toBe('true')
        expect(toggle.getAttribute('aria-label')).toBe('Go offline')

        await clickElement(toggle)

        await waitFor(() => toggle.getAttribute('aria-checked') === 'false', 'switch flipped offline')
        expect(toggle.getAttribute('aria-label')).toBe('Go online')
        expect(h.setDriverOnlineStatus).toHaveBeenCalledTimes(1)
        expect(h.setDriverOnlineStatus).toHaveBeenCalledWith('driver-1', false)
    })

    it('profile load failure shows an alert with a working Retry', async () => {
        h.getByUserId.mockRejectedValueOnce(new Error('network down'))
        const view = await mountPage()

        const alert = await waitForElement('[role="alert"]', 'load error alert')
        expect(alert.textContent || '').toContain("We couldn't reach the server")
        const heading = alert.parentElement?.querySelector('h2')
        expect(heading?.textContent || '').toContain("Couldn't load your dashboard")
        expect(h.toastError).toHaveBeenCalledWith('Failed to load driver profile')

        h.getByUserId.mockResolvedValue(DRIVER)
        const retry = Array.from(view.querySelectorAll('button')).find(
            (b) => (b.textContent || '').includes('Retry')
        )
        expect(retry).toBeDefined()
        await clickElement(retry as Element)

        await waitForElement('[role="switch"]', 'dashboard after retry')
    })

    it('incoming offer renders a labelled dialog with a timer and named actions', async () => {
        h.getPendingOffer.mockResolvedValue(PENDING_OFFER)
        await mountPage()

        const dialog = await waitForElement('[role="dialog"]', 'offer dialog')
        expect(dialog.getAttribute('aria-modal')).toBe('true')
        expect(dialog.getAttribute('aria-labelledby')).toBe('job-offer-dialog-title')
        expect(dialog.querySelector('[role="timer"]')).not.toBeNull()

        const accept = dialog.querySelector('button[aria-label="Accept job offer"]')
        const decline = dialog.querySelector('button[aria-label="Decline job offer"]')
        expect(accept).not.toBeNull()
        expect(decline).not.toBeNull()
        expect((accept as HTMLElement).textContent || '').toContain('Accept')
        expect((decline as HTMLElement).textContent || '').toContain('Decline')
    })

    it('driver header shows name, rating and the verified chip', async () => {
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes(DRIVER.full_name), 'driver header name')
        expect(view.textContent || '').toContain('Verified')
        expect(view.textContent || '').toContain('4.5 rating · 2 trips')
    })

    it('active trip card exposes real email support links from the shared config (no phone)', async () => {
        h.getByUserId.mockResolvedValue({ ...DRIVER, active_job_id: 'job-42' })
        const view = await mountPage()

        await waitForElement('a[href^="mailto:"]', 'support email link')
        const supportLinks = Array.from(view.querySelectorAll('a[href^="mailto:"]'))
        // One in the driver header, one on the active-trip card.
        expect(supportLinks.length).toBeGreaterThanOrEqual(2)
        for (const link of supportLinks) {
            expect(link.getAttribute('href')).toBe('mailto:prakashgarg91@gmail.com')
            expect(link.getAttribute('aria-label') || '').toContain('Email support')
        }
        expect(view.querySelector('a[href^="tel:"]')).toBeNull()
    })
})

// Wallet honesty: the numbers come from the complete balance snapshot (not the
// 10-trip / 5-payout recent lists), are labelled as customer-quote estimates,
// and a failed withdrawal is surfaced instead of becoming an unhandled rejection.
describe('DriverDashboardPage wallet and copy', () => {
    const SNAPSHOT = {
        paid: 4000,
        approved: 1000,
        pending: 500,
        totalDelivered: 25000,
        payouts: [
            { amount: 4000, status: 'paid' },
            { amount: 1000, status: 'approved' },
            { amount: 500, status: 'pending' },
            { amount: 900, status: 'rejected' },
        ],
    }

    beforeEach(() => {
        vi.clearAllMocks()
        h.getByUserId.mockResolvedValue(DRIVER)
        h.getPendingOffer.mockResolvedValue(null)
        h.getTripHistory.mockResolvedValue([])
        h.getPayoutHistory.mockResolvedValue([])
        h.getBalanceSnapshot.mockResolvedValue(SNAPSHOT)
        h.requestPayout.mockResolvedValue(undefined)
    })

    it('computes the wallet from the complete snapshot, not from the recent lists, with honest labels', async () => {
        // Recent lists hold a single small trip; the snapshot is the truth.
        h.getTripHistory.mockResolvedValue([
            { id: 't1', offered_at: '2026-11-01T00:00:00Z', responded_at: null, delivered_at: '2026-11-01T10:00:00Z', status: 'delivered', shipments: { origin: 'A', destination: 'B', estimated_cost: 100 } },
        ] as never)
        const view = await mountPage()
        await waitFor(() => (view.textContent || '').includes('Available to withdraw (estimate)'), 'wallet card')
        const txt = view.textContent || ''
        expect(txt).toContain('₹19,500') // 25000 - (4000 + 1000 + 500); the rejected payout is not reserved
        expect(txt).toContain('₹25,000')
        expect(txt).toContain('Delivered trips (customer quote)')
        expect(txt).toContain('Your agency sets your actual pay')
        expect(txt).not.toContain('Available Balance')
        expect(txt).not.toContain('Total Earned')
        expect(h.getBalanceSnapshot).toHaveBeenCalledWith('driver-1')
    })

    it('hides the wallet numbers instead of guessing when the snapshot cannot be loaded', async () => {
        h.getBalanceSnapshot.mockRejectedValue(new Error('payouts unavailable'))
        const view = await mountPage()
        await waitFor(() => (view.textContent || '').includes('Could not load your totals right now.'), 'unavailable note')
        expect(view.textContent || '').not.toContain('₹19,500')
    })

    it('a failed withdrawal request shows an error toast and re-enables the form', async () => {
        h.requestPayout.mockRejectedValue(new UserFacingError('Failed to submit withdrawal request'))
        const view = await mountPage()
        await waitFor(() => (view.textContent || '').includes('Request Withdrawal'), 'wallet card')
        await clickButton(/Request Withdrawal/)
        const input = (container as HTMLElement).querySelector('#driver-withdrawal-amount') as HTMLInputElement
        expect(input).not.toBeNull()
        expect((container as HTMLElement).querySelector('label[for="driver-withdrawal-amount"]')).not.toBeNull()
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            setter?.call(input, '1000')
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await clickButton(/Submit Request/)
        await waitFor(() => h.toastError.mock.calls.some((c) => c[0] === 'Failed to submit withdrawal request'), 'error toast')
        expect(h.requestPayout).toHaveBeenCalledWith('driver-1', 1000)
        expect(findButton(/Submit Request/).disabled).toBe(false)
    })

    it('shows readable trip status labels and no unbacked promises', async () => {
        h.getTripHistory.mockResolvedValue([
            { id: 't2', offered_at: '2026-11-01T00:00:00Z', responded_at: null, delivered_at: null, status: 'pickup_arrived', shipments: { origin: 'A', destination: 'B', estimated_cost: 100 } },
        ] as never)
        const view = await mountPage()
        await waitFor(() => (view.textContent || '').includes('Recent Trips'), 'recent trips')
        const txt = view.textContent || ''
        expect(txt).toContain('At pickup')
        expect(txt).not.toContain('pickup_arrived')
        expect(txt).not.toContain('near you')
        expect(txt).not.toContain('visible to customers')
    })
})

// ---------------------------------------------------------------------------
// Extended page coverage (2026-11-18 audit): loading, empty and status-gated
// states, withdrawal flow and toasts, navigation links, trip and offer details,
// the online switch, and privacy of rendered identifiers. Same harness as above.
// ---------------------------------------------------------------------------

const WALLET_SNAPSHOT = {
    paid: 4000,
    approved: 1000,
    pending: 500,
    totalDelivered: 25000,
    payouts: [
        { amount: 4000, status: 'paid' },
        { amount: 1000, status: 'approved' },
        { amount: 500, status: 'pending' },
        { amount: 900, status: 'rejected' },
    ],
}

function makeTrip(id: string, status: string, deliveredAt: string | null, origin: string, cost: number) {
    return {
        id,
        offered_at: '2026-11-10T08:00:00Z',
        responded_at: null,
        delivered_at: deliveredAt,
        status,
        shipments: { origin, destination: 'Delhi Hub', estimated_cost: cost },
    }
}

function requireButton(scope: ParentNode, matcher: RegExp): HTMLButtonElement {
    const button = Array.from(scope.querySelectorAll('button')).find((b) => matcher.test(b.textContent || ''))
    if (!button) throw new Error(`button matching ${matcher} not found`)
    return button
}

function hasButton(scope: ParentNode, matcher: RegExp): boolean {
    return Array.from(scope.querySelectorAll('button')).some((b) => matcher.test(b.textContent || ''))
}

/** Value shown in a stat tile, read from the number that sits above its caption. */
function statValue(scope: ParentNode, caption: string): string {
    const label = Array.from(scope.querySelectorAll('p')).find((p) => p.textContent === caption)
    return label?.previousElementSibling?.textContent ?? ''
}

async function clickEl(element: Element): Promise<void> {
    await act(async () => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

async function mountWithRoutes(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    const page = createElement(DriverDashboardPage) as ReactElement
    await act(async () => {
        root = createRoot(container as HTMLElement)
        root.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/driver/dashboard'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/driver/dashboard', element: page }),
                    createElement(Route, { path: '/driver/trip/:jobId', element: createElement(TripRouteProbe) }),
                    createElement(Route, {
                        path: '/driver/register',
                        element: createElement('div', { 'data-testid': 'register-probe' }, 'REGISTER PROBE'),
                    }),
                ),
                createElement(LocationWatcher),
            )
        )
    })
    return container
}

function unmountMounted(): void {
    act(() => {
        root?.unmount()
    })
    container?.remove()
    root = null
    container = null
}

function resetDashboardMocks(): void {
    vi.clearAllMocks()
    lastPath = ''
    h.getByUserId.mockResolvedValue(DRIVER)
    h.getPendingOffer.mockResolvedValue(null)
    h.getIncomingJobById.mockResolvedValue(null)
    h.getTripHistory.mockResolvedValue([])
    h.getPayoutHistory.mockResolvedValue([])
    h.getBalanceSnapshot.mockResolvedValue(WALLET_SNAPSHOT)
    h.requestPayout.mockResolvedValue(undefined)
    h.setDriverOnlineStatus.mockResolvedValue(undefined)
    h.respondToJobOffer.mockResolvedValue({
        offerId: 'offer-777',
        offerStatus: 'declined',
        respondedAt: '2026-11-18T09:01:00Z',
        activeJobId: null,
    })
}

describe('DriverDashboardPage loading, empty and status states', () => {
    beforeEach(() => {
        resetDashboardMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        unmountMounted()
    })

    it('shows the sr-only loading text and no controls while the profile is pending', async () => {
        h.getByUserId.mockReturnValue(new Promise(() => {}))
        const view = await mountWithRoutes()
        expect(view.textContent || '').toContain('Loading driver dashboard')
        expect(view.querySelector('[role="switch"]')).toBeNull()
        expect(hasButton(view, /Request Withdrawal/)).toBe(false)
    })

    it('shows the no-profile state with a register action and no alert or Retry', async () => {
        h.getByUserId.mockResolvedValue(null)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('No Driver Profile Found'), 'no-profile state')
        expect(view.querySelector('[role="alert"]')).toBeNull()
        expect(hasButton(view, /Retry/)).toBe(false)
    })

    it('Register as Driver navigates to the registration route', async () => {
        h.getByUserId.mockResolvedValue(null)
        const view = await mountWithRoutes()
        await waitFor(() => hasButton(view, /Register as Driver/), 'register button')
        await clickEl(requireButton(view, /Register as Driver/))
        await waitFor(() => lastPath === '/driver/register', 'navigation to registration')
        expect(view.textContent || '').toContain('REGISTER PROBE')
    })

    it('a failed Retry keeps the error state and reports the failure again', async () => {
        h.getByUserId.mockRejectedValue(new Error('network down'))
        const view = await mountWithRoutes()
        await waitFor(() => view.querySelector('[role="alert"]') !== null, 'load error alert')
        await clickEl(requireButton(view, /Retry/))
        await waitFor(() => h.toastError.mock.calls.length === 2, 'second failure toast')
        expect(view.querySelector('[role="alert"]')).not.toBeNull()
        expect(hasButton(view, /Retry/)).toBe(true)
        expect(view.textContent || '').not.toContain('No Driver Profile Found')
    })

    it('an approved offline driver with no trips sees the offline empty state', async () => {
        h.getByUserId.mockResolvedValue({ ...DRIVER, is_online: false })
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('No trips yet'), 'empty trips state')
        expect(view.textContent || '').toContain('Go online to start receiving job offers')
        expect(view.textContent || '').not.toContain('Looking for jobs...')
    })

    it('an approved online driver with no trips sees the looking-for-jobs status', async () => {
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Looking for jobs...'), 'waiting state')
        expect(view.textContent || '').not.toContain('No trips yet')
        const waiting = Array.from(view.querySelectorAll('[role="status"]'))
            .find((el) => (el.textContent || '').includes('Looking for jobs'))
        expect(waiting).toBeDefined()
    })

    async function expectGatedDriver(status: 'pending' | 'rejected' | 'suspended', label: string, copy: string) {
        h.getByUserId.mockResolvedValue({ ...DRIVER, status })
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes(label), `${status} banner`)
        expect(view.querySelector('[role="status"]')).not.toBeNull()
        expect(view.textContent || '').toContain(copy)
        expect(view.querySelector('[role="switch"]')).toBeNull()
        expect(view.textContent || '').not.toContain('Payout estimate')
        expect(view.textContent || '').not.toContain('Available to withdraw')
        expect(hasButton(view, /Request Withdrawal/)).toBe(false)
    }

    it('a pending driver sees the verification banner and no toggle, earnings or withdrawal', async () => {
        await expectGatedDriver('pending', 'Verification Pending', 'Your application is under review')
    })

    it('a rejected driver sees the reapply guidance and no toggle, earnings or withdrawal', async () => {
        await expectGatedDriver('rejected', 'Application Rejected', 'Contact support to reapply or resolve issues.')
    })

    it('a suspended driver sees the suspension notice and no toggle, earnings or withdrawal', async () => {
        await expectGatedDriver('suspended', 'Account Suspended', 'Contact support for more information.')
    })

    it('the active trip card links to the trip route', async () => {
        h.getByUserId.mockResolvedValue({ ...DRIVER, active_job_id: 'job-42' })
        const view = await mountWithRoutes()
        await waitFor(() => hasButton(view, /View Trip/), 'active job card')
        await clickEl(requireButton(view, /View Trip/))
        await waitFor(() => lastPath === '/driver/trip/job-42', 'navigation to the active trip')
        expect(view.textContent || '').toContain('TRIP:job-42')
    })

    it('the vehicle card maps the vehicle code to its label and shows the home city', async () => {
        h.getByUserId.mockResolvedValue({ ...DRIVER, vehicle_type: 'bharatbenz_24ft' })
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('BharatBenz 24ft (10T)'), 'vehicle label')
        expect(view.textContent || '').toContain('Delhi • 2 total trips')
        expect(view.textContent || '').not.toContain('bharatbenz_24ft')
    })
})

describe('DriverDashboardPage withdrawal flow', () => {
    beforeEach(() => {
        resetDashboardMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        unmountMounted()
    })

    async function openWithdrawalDialog(view: HTMLElement): Promise<void> {
        await waitFor(() => hasButton(view, /Request Withdrawal/), 'wallet card')
        await clickEl(requireButton(view, /Request Withdrawal/))
        await waitFor(() => view.querySelector('[role="dialog"]') !== null, 'withdrawal dialog')
    }

    async function typeAmount(value: string): Promise<void> {
        const input = container?.querySelector('#driver-withdrawal-amount') as HTMLInputElement | null
        if (!input) throw new Error('withdrawal amount input not found')
        await act(async () => {
            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
            setter?.call(input, value)
            input.dispatchEvent(new Event('input', { bubbles: true }))
        })
    }

    it('Request Withdrawal opens a labelled dialog showing the estimate, and the close button dismisses it', async () => {
        const view = await mountWithRoutes()
        await openWithdrawalDialog(view)
        const dialog = view.querySelector('[role="dialog"]') as HTMLElement
        expect(dialog.getAttribute('aria-modal')).toBe('true')
        expect(dialog.getAttribute('aria-labelledby')).toBe('withdrawal-dialog-title')
        expect(view.textContent || '').toContain('Available: ₹19,500')

        const close = view.querySelector('button[aria-label="Close withdrawal dialog"]') as Element
        await clickEl(close)
        expect(view.querySelector('[role="dialog"]')).toBeNull()
    })

    it('Submit Request stays disabled until an amount is entered', async () => {
        const view = await mountWithRoutes()
        await openWithdrawalDialog(view)
        expect(requireButton(view, /Submit Request/).disabled).toBe(true)
        await typeAmount('500')
        expect(requireButton(view, /Submit Request/).disabled).toBe(false)
    })

    it('a valid withdrawal shows the success toast, closes the dialog and refreshes the balance', async () => {
        const view = await mountWithRoutes()
        await openWithdrawalDialog(view)
        await typeAmount('1000')
        await clickEl(requireButton(view, /Submit Request/))
        await waitFor(() => h.toastSuccess.mock.calls.length > 0, 'success toast')
        expect(h.toastSuccess).toHaveBeenCalledWith('Withdrawal request submitted')
        expect(h.requestPayout).toHaveBeenCalledWith('driver-1', 1000)
        expect(view.querySelector('[role="dialog"]')).toBeNull()
        await waitFor(() => h.getBalanceSnapshot.mock.calls.length >= 2, 'balance refresh after success')
    })

    it('the form shows Submitting and stays disabled while the request is in flight', async () => {
        let finish: () => void = () => {}
        h.requestPayout.mockReturnValue(new Promise<void>((resolve) => { finish = () => resolve() }))
        const view = await mountWithRoutes()
        await openWithdrawalDialog(view)
        await typeAmount('700')
        await clickEl(requireButton(view, /Submit Request/))
        await waitFor(() => hasButton(view, /Submitting/), 'in-flight state')
        expect(requireButton(view, /Submitting/).disabled).toBe(true)
        await act(async () => {
            finish()
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        await waitFor(() => h.toastSuccess.mock.calls.length > 0, 'success toast after in-flight')
    })

    it('an amount above the available balance is refused with a toast and no request', async () => {
        const view = await mountWithRoutes()
        await openWithdrawalDialog(view)
        await typeAmount('19501')
        await clickEl(requireButton(view, /Submit Request/))
        await waitFor(() => h.toastError.mock.calls.length > 0, 'over-balance toast')
        expect(h.toastError).toHaveBeenCalledWith('Amount exceeds available balance')
        expect(h.requestPayout).not.toHaveBeenCalled()
        expect(view.querySelector('[role="dialog"]')).not.toBeNull()
    })

    it('a zero or negative amount is refused before any request', async () => {
        const view = await mountWithRoutes()
        await openWithdrawalDialog(view)
        await typeAmount('-5')
        await clickEl(requireButton(view, /Submit Request/))
        await waitFor(() => h.toastError.mock.calls.length > 0, 'invalid amount toast')
        expect(h.toastError).toHaveBeenCalledWith('Please enter a valid amount')
        expect(h.requestPayout).not.toHaveBeenCalled()
    })

    it('when the balance snapshot failed, the amount reads as unavailable and withdrawals are blocked', async () => {
        h.getBalanceSnapshot.mockRejectedValue(new Error('payouts unavailable'))
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Could not load your totals right now.'), 'unavailable note')
        await openWithdrawalDialog(view)
        expect(view.textContent || '').toContain('Available: —')
        expect(view.textContent || '').not.toContain('₹19,500')
        await typeAmount('100')
        await clickEl(requireButton(view, /Submit Request/))
        await waitFor(() => h.toastError.mock.calls.length > 0, 'unavailable-balance toast')
        expect(h.toastError).toHaveBeenCalledWith('Your amount could not be checked. Please try again later.')
        expect(h.requestPayout).not.toHaveBeenCalled()
    })

    it('a network failure shows only the fallback message, never the raw error, and keeps the form open', async () => {
        h.requestPayout.mockRejectedValue(new Error('PGRST301 jwt expired'))
        const view = await mountWithRoutes()
        await openWithdrawalDialog(view)
        await typeAmount('1000')
        await clickEl(requireButton(view, /Submit Request/))
        await waitFor(() => h.toastError.mock.calls.length > 0, 'failure toast')
        expect(h.toastError).toHaveBeenCalledWith('Failed to submit withdrawal request')
        const shown = h.toastError.mock.calls.map((c) => String(c[0])).join(' | ')
        expect(shown).not.toContain('PGRST')
        expect(view.querySelector('[role="dialog"]')).not.toBeNull()
        expect(requireButton(view, /Submit Request/).disabled).toBe(false)
    })

    it('the payout history shows readable status labels and amounts, never the payout id', async () => {
        h.getPayoutHistory.mockResolvedValue([
            { id: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d', amount: 1000, status: 'pending', requested_at: '2026-11-13T09:00:00Z' },
            { id: '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', amount: 2000, status: 'approved', requested_at: '2026-11-14T09:00:00Z' },
            { id: '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f', amount: 3000, status: 'paid', requested_at: '2026-11-15T09:00:00Z' },
            { id: '3d4e5f6a-7b8c-4d9e-8f1a-2b3c4d5e6f7a', amount: 900, status: 'rejected', requested_at: '2026-11-16T09:00:00Z' },
        ] as never)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Recent payout requests'), 'payout card')
        const text = view.textContent || ''
        for (const label of ['Pending', 'Approved', 'Paid', 'Rejected']) {
            expect(text).toContain(label)
        }
        expect(text).toContain('₹1,000')
        expect(text).toContain('₹3,000')
        expect(text).not.toContain('9a8b7c6d')
    })

    it('the delivered-trips ledger lists at most five recent trips with customer-quote amounts', async () => {
        h.getTripHistory.mockResolvedValue([1, 2, 3, 4, 5, 6].map((n) =>
            makeTrip(`trip-${n}`, 'delivered', `2026-11-1${n}T10:00:00Z`, `Origin ${n}`, n * 100),
        ) as never)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Recent delivered trips (customer quote)'), 'ledger heading')
        const heading = Array.from(view.querySelectorAll('h3'))
            .find((h3) => (h3.textContent || '').includes('Recent delivered trips'))
        const card = heading?.parentElement?.parentElement as HTMLElement
        const rows = card.querySelectorAll('.divide-y > div')
        expect(rows.length).toBe(5)
        expect(card.textContent || '').toContain('Origin 5')
        expect(card.textContent || '').not.toContain('Origin 6')
        expect(card.textContent || '').toContain('₹500')
    })
})

describe('DriverDashboardPage trips, today figures, offers and online switch', () => {
    beforeEach(() => {
        resetDashboardMocks()
    })

    afterEach(() => {
        vi.useRealTimers()
        unmountMounted()
    })

    it('trip history maps statuses to readable chips and handles a trip without shipment details', async () => {
        h.getTripHistory.mockResolvedValue([
            makeTrip('t-accepted-1', 'accepted', null, 'Origin Accepted', 500),
            makeTrip('t-declined-1', 'declined', null, 'Origin Declined', 500),
            makeTrip('t-expired-1', 'expired', null, 'Origin Expired', 500),
            makeTrip('t-pickup-1', 'pickup_arrived', null, 'Origin Pickup', 500),
            makeTrip('t-weird-1', 'weird_state', null, 'Origin Weird', 500),
            { id: 't-noship-1', offered_at: '2026-11-10T08:00:00Z', responded_at: null, delivered_at: null, status: 'accepted' },
        ] as never)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Recent Trips'), 'recent trips')
        const text = view.textContent || ''
        for (const label of ['Accepted', 'Declined', 'Expired', 'At pickup', 'Updated', 'Trip details unavailable']) {
            expect(text).toContain(label)
        }
        expect(text).not.toContain('weird_state')
        expect(text).not.toContain('pickup_arrived')
    })

    it('the Today figures count only trips delivered on the current date and sum their fares', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-11-18T10:00:00Z'))
        h.getTripHistory.mockResolvedValue([
            makeTrip('t-today-1', 'delivered', '2026-11-18T08:00:00Z', 'Mumbai Yard', 1000),
            makeTrip('t-old-1', 'delivered', '2026-11-17T08:00:00Z', 'Pune Depot', 700),
        ] as never)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Recent Trips'), 'recent trips')
        expect(statValue(view, 'Today')).toBe('₹1,000')
        expect(statValue(view, 'Delivered')).toBe('1')
    })

    // BUG: "Today" is computed from the UTC calendar date (DriverDashboardPage.tsx:247
    // `new Date().toISOString().split('T')[0]` and :250 `delivered_at?.startsWith(today)`).
    // The app is India-only (en-IN, INR, +91), so for the first 5.5 hours of each IST day
    // the figures use the wrong calendar day: a delivery at 00:30 IST on 19 Nov is dropped
    // from Today on 19 Nov. This assertion states the expected IST behaviour and fails today.
    it.fails('BUG: a delivery made after IST midnight counts toward Today', async () => {
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-11-19T01:00:00Z')) // 06:30 IST, 19 Nov
        h.getTripHistory.mockResolvedValue([
            makeTrip('t-ist-1', 'delivered', '2026-11-18T19:00:00Z', 'Mumbai Yard', 900), // 00:30 IST, 19 Nov
        ] as never)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Recent Trips'), 'recent trips')
        expect(statValue(view, 'Today')).toBe('₹900')
        expect(statValue(view, 'Delivered')).toBe('1')
    })

    it('the offer card shows pickup, drop, weight and the estimated fare marked as an estimate', async () => {
        h.getPendingOffer.mockResolvedValue(PENDING_OFFER)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Mumbai Yard'), 'offer details')
        const text = view.textContent || ''
        expect(text).toContain('Delhi Hub')
        expect(text).toContain('900 kg')
        expect(text).toContain('₹4,200')
        expect(text).toContain('est.')
    })

    it('an offer without shipment details falls back to neutral location labels', async () => {
        h.getPendingOffer.mockResolvedValue({ ...PENDING_OFFER, shipments: null })
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('New Job Offer'), 'offer dialog')
        const text = view.textContent || ''
        expect(text).toContain('Pickup Location')
        expect(text).toContain('Drop Location')
        expect(text).not.toContain(' kg')
    })

    it('Decline shows the declined toast, dismisses the offer and never navigates', async () => {
        h.getPendingOffer.mockResolvedValue(PENDING_OFFER)
        const view = await mountWithRoutes()
        await waitFor(() => hasButton(view, /Decline/), 'decline button')
        await clickEl(requireButton(view, /Decline/))
        await waitFor(() => h.toastSuccess.mock.calls.length > 0, 'declined toast')
        expect(h.toastSuccess).toHaveBeenCalledWith('Job declined.')
        expect(h.respondToJobOffer).toHaveBeenCalledWith('offer-777', false)
        expect(view.querySelector('[role="dialog"]')).toBeNull()
        expect(lastPath).toBe('/driver/dashboard')
    })

    it('both offer buttons are disabled while an accept is in flight', async () => {
        h.getPendingOffer.mockResolvedValue(PENDING_OFFER)
        let finish: () => void = () => {}
        h.respondToJobOffer.mockReturnValue(new Promise((resolve) => {
            finish = () => resolve({
                offerId: 'offer-777',
                offerStatus: 'accepted',
                respondedAt: '2026-11-18T09:01:00Z',
                activeJobId: 'offer-777',
            })
        }))
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Mumbai Yard'), 'offer details')
        await clickEl(requireButton(view, /Accept/))
        await waitFor(() => h.respondToJobOffer.mock.calls.length === 1, 'accept call')
        expect(requireButton(view, /Accept/).disabled).toBe(true)
        expect(requireButton(view, /Decline/).disabled).toBe(true)
        await act(async () => {
            finish()
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        await waitFor(() => lastPath === '/driver/trip/offer-777', 'navigation after accept')
    })

    it('the offer timer exposes the remaining seconds to assistive technology', async () => {
        h.getPendingOffer.mockResolvedValue(PENDING_OFFER)
        const view = await mountWithRoutes()
        await waitFor(() => view.querySelector('[role="timer"]') !== null, 'offer timer')
        const label = view.querySelector('[role="timer"]')?.getAttribute('aria-label') ?? ''
        expect(label).toMatch(/^\d+ seconds left to respond$/)
    })

    it('a failed online toggle shows an error toast and keeps the switch where it was', async () => {
        h.setDriverOnlineStatus.mockRejectedValueOnce(new Error('rpc down'))
        const view = await mountWithRoutes()
        await waitFor(() => view.querySelector('[role="switch"]') !== null, 'online switch')
        await clickEl(view.querySelector('[role="switch"]') as Element)
        await waitFor(() => h.toastError.mock.calls.length > 0, 'failure toast')
        expect(h.toastError).toHaveBeenCalledWith('Failed to update status')
        expect(view.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    })

    it('going offline calls the API with false, flips the switch and shows the offline toast', async () => {
        const view = await mountWithRoutes()
        await waitFor(() => view.querySelector('[role="switch"]') !== null, 'online switch')
        await clickEl(view.querySelector('[role="switch"]') as Element)
        await waitFor(() => h.toastSuccess.mock.calls.length > 0, 'offline toast')
        expect(h.setDriverOnlineStatus).toHaveBeenCalledWith('driver-1', false)
        expect(h.toastSuccess).toHaveBeenCalledWith('⚫ You are now Offline')
        expect(view.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false')
    })

    it('rendered text carries no driver phone, internal ids, or bank-like digit runs', async () => {
        h.getTripHistory.mockResolvedValue([
            makeTrip('3f2b8c1e-9a4d-4b7e-8c2a-1d5e6f7a8b9c', 'delivered', '2026-11-12T10:00:00Z', 'Mumbai Yard', 4200),
            makeTrip('7d1e2f3a-4b5c-4d6e-8f70-a1b2c3d4e5f6', 'accepted', null, 'Pune Depot', 1800),
        ] as never)
        h.getPayoutHistory.mockResolvedValue([
            { id: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d', amount: 1000, status: 'paid', requested_at: '2026-11-13T09:00:00Z' },
        ] as never)
        const view = await mountWithRoutes()
        await waitFor(() => (view.textContent || '').includes('Recent payout requests'), 'payout card')
        const text = view.textContent || ''
        expect(text).not.toContain(DRIVER.phone)
        expect(text).not.toContain(DRIVER.id)
        expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
        expect(text).not.toMatch(/\d{9,18}/)
        expect(text).not.toMatch(/IFSC|account no|bank/i)
    })
})
