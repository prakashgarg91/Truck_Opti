import { act, useEffect } from 'react'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
    driverEarningsApi: {},
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

    it('active trip card exposes real tel: support links from the shared config', async () => {
        h.getByUserId.mockResolvedValue({ ...DRIVER, active_job_id: 'job-42' })
        const view = await mountPage()

        await waitForElement('a[href^="tel:"]', 'support tel link')
        const telLinks = Array.from(view.querySelectorAll('a[href^="tel:"]'))
        // One in the driver header, one on the active-trip card.
        expect(telLinks.length).toBeGreaterThanOrEqual(2)
        for (const link of telLinks) {
            expect(link.getAttribute('href')).toBe('tel:+919999352050')
            expect(link.getAttribute('aria-label') || '').toContain('support')
        }
    })
})
