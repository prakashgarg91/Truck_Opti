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
    getTripHistory: vi.fn(async () => []),
    getPayoutHistory: vi.fn(async () => []),
    respondToJobOffer: vi.fn(),
}))

vi.mock('../services/supabaseApi', () => ({
    driverDashboardApi: {
        getPendingOffer: h.getPendingOffer,
        getTripHistory: h.getTripHistory,
        getPayoutHistory: h.getPayoutHistory,
        respondToJobOffer: h.respondToJobOffer,
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
