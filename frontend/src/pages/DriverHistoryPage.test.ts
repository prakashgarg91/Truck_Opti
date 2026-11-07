import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// DriverHistoryPage regression pins (driver trip history over driverTripsApi):
// the mount pipeline (auth user -> driver id -> unfiltered history), the three
// status filters with their refetch arguments, the five status labels, the
// shipment rendering rules (missing, array embed, zero cost) and the
// error/empty fallbacks. The clock is pinned so the rendered offer date and
// any future now-relative logic stay deterministic.
//
// FINDING (a11y): the loading state is a bare animate-spin SVG — no
//   role="status" and no aria-busy (AgencyTeamPage exposes a proper busy
//   region), and the filter buttons carry no aria-pressed for the active
//   filter.
// FINDING (bug): when the auth store has no user, fetchDriverId returns early
//   without ever calling setLoading(false), so the page mounts into an endless
//   spinner. Today the route sits behind ProtectedRoute(['driver']) so the
//   hang is only reachable through transient store states (e.g. mid-logout).
//   Deliberately NOT asserted as correct here.
// FINDING (ux): both failure paths (driver profile, trip history) only toast
//   and then render the generic "No trips found" empty state — there is no
//   inline error region and no Retry action. The tests below pin the toast
//   messages only, not the misleading empty-state wording.

const h = vi.hoisted(() => ({
    getDriverIdByUserId: vi.fn(),
    getHistory: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
    default: { error: h.toastError, success: h.toastSuccess },
}))

vi.mock('../services/supabaseApi', () => ({
    driverTripsApi: {
        getDriverIdByUserId: h.getDriverIdByUserId,
        getHistory: h.getHistory,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'auth-user-1' } }),
}))

import DriverHistoryPage from './DriverHistoryPage'

const NOW = new Date('2026-11-07T06:30:00Z')
// Midday UTC so the rendered calendar day (15 Jan) holds in any timezone
// within ±12h of UTC; only the clock-independent ISO instant is asserted.
const OFFERED_AT = '2026-01-15T12:00:00Z'

function tripRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 'job-1',
        offered_at: OFFERED_AT,
        responded_at: null,
        status: 'delivered',
        shipments: {
            origin: 'Mumbai Yard',
            destination: 'Delhi Hub',
            estimated_cost: 4200,
            total_weight: 900,
        },
        ...overrides,
    }
}

let root: Root | null = null
let container: HTMLElement | null = null

async function flushAsyncWork() {
    // The page's fetch chains resolve through promise continuations only;
    // no real timer is awaited, so everything is deterministic under fake timers.
    for (let i = 0; i < 30; i++) await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(DriverHistoryPage))
        await flushAsyncWork()
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => {
            root!.unmount()
        })
        root = null
    }
    container?.remove()
    container = null
    vi.useRealTimers()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await flushAsyncWork()
    })
}

describe('DriverHistoryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(NOW)
        h.getDriverIdByUserId.mockResolvedValue('driver-1')
        h.getHistory.mockResolvedValue([])
    })

    it('resolves the driver id from the auth user and fetches unfiltered history on mount', async () => {
        await mountPage()
        expect(h.getDriverIdByUserId).toHaveBeenCalledTimes(1)
        expect(h.getDriverIdByUserId).toHaveBeenCalledWith('auth-user-1')
        expect(h.getHistory).toHaveBeenCalledTimes(1)
        expect(h.getHistory).toHaveBeenCalledWith('driver-1', 'all')
    })

    it('renders the heading, subtitle and exactly three labelled filter buttons', async () => {
        await mountPage()
        expect(q('h1')?.textContent).toBe('Trip History')
        expect(text()).toContain('Your past job offers')
        const labels = Array.from((container as HTMLElement).querySelectorAll('button')).map((b) => b.textContent)
        expect(labels).toEqual(['All', 'delivered', 'declined'])
    })

    it('loading state shows the spinner while the driver profile is unresolved', async () => {
        h.getDriverIdByUserId.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('.animate-spin')).not.toBeNull()
        expect(text()).not.toContain('No trips found')
    })

    it('loading state keeps the header and filters visible while history is unresolved', async () => {
        h.getHistory.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('.animate-spin')).not.toBeNull()
        expect(buttons(/declined/)).toHaveLength(1)
        expect(text()).not.toContain('No trips found')
    })

    it('empty history renders the No trips found card and no spinner', async () => {
        await mountPage()
        expect(text()).toContain('No trips found')
        expect(q('.animate-spin')).toBeNull()
    })

    it('a null history payload is treated as empty', async () => {
        h.getHistory.mockResolvedValue(null)
        await mountPage()
        expect(text()).toContain('No trips found')
    })

    it('a user with no driver profile stops loading and never asks for history', async () => {
        h.getDriverIdByUserId.mockResolvedValue(null)
        await mountPage()
        expect(text()).toContain('No trips found')
        expect(q('.animate-spin')).toBeNull()
        expect(h.getHistory).not.toHaveBeenCalled()
    })

    it('driver profile failure toasts and falls back to the empty state', async () => {
        h.getDriverIdByUserId.mockRejectedValue(new Error('profile lookup failed'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load driver profile')
        expect(h.getHistory).not.toHaveBeenCalled()
        expect(text()).toContain('No trips found')
    })

    it('history failure toasts and falls back to the empty state', async () => {
        h.getHistory.mockRejectedValue(new Error('history query failed'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load trip history')
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('No trips found')
    })

    it('renders a delivered trip with route, weight, INR amount and formatted offer date', async () => {
        h.getHistory.mockResolvedValue([tripRow()])
        await mountPage()
        expect(text()).toContain('Mumbai Yard')
        expect(text()).toContain('Delhi Hub')
        expect(text()).toContain('Completed')
        expect(text()).toContain('900 kg')
        expect(text()).toContain('₹4,200')
        expect(text()).toContain('15 Jan 2026')
        expect(text()).toMatch(/\d{2}:\d{2}\s?(am|pm)/i)
    })

    it('a trip without shipment details shows the placeholder and hides weight and amount', async () => {
        h.getHistory.mockResolvedValue([tripRow({ shipments: null })])
        await mountPage()
        expect(text()).toContain('Trip details unavailable')
        expect(text()).toContain('Completed')
        expect(text()).not.toContain('Mumbai Yard')
        expect(text()).not.toContain('900 kg')
        expect(text()).not.toContain('₹')
    })

    it('an array-embedded shipment is narrowed to its first element', async () => {
        h.getHistory.mockResolvedValue([
            tripRow({
                shipments: [
                    { origin: 'Pune Yard', destination: 'Nashik Hub', estimated_cost: 1500, total_weight: 250 },
                    { origin: 'Second Element', destination: 'Never Shown', estimated_cost: 999, total_weight: 1 },
                ],
            }),
        ])
        await mountPage()
        expect(text()).toContain('Pune Yard')
        expect(text()).toContain('Nashik Hub')
        expect(text()).toContain('250 kg')
        expect(text()).toContain('₹1,500')
        expect(text()).not.toContain('Second Element')
    })

    it('a zero estimated cost hides the amount but keeps the weight line', async () => {
        h.getHistory.mockResolvedValue([
            tripRow({ shipments: { origin: 'Zero Yard', destination: 'Free Hub', estimated_cost: 0, total_weight: 300 } }),
        ])
        await mountPage()
        expect(text()).toContain('300 kg')
        expect(text()).not.toContain('₹')
    })

    it('an unknown status falls back to the Expired presentation', async () => {
        h.getHistory.mockResolvedValue([tripRow({ status: 'in-transit' })])
        await mountPage()
        expect(text()).toContain('Expired')
        expect(text()).not.toContain('Completed')
    })

    it('each of the five statuses renders its own label', async () => {
        h.getHistory.mockResolvedValue([
            tripRow({ id: 't-delivered', status: 'delivered' }),
            tripRow({ id: 't-accepted', status: 'accepted' }),
            tripRow({ id: 't-declined', status: 'declined' }),
            tripRow({ id: 't-expired', status: 'expired' }),
            tripRow({ id: 't-cancelled', status: 'cancelled' }),
        ])
        await mountPage()
        const t = text()
        for (const label of ['Completed', 'Accepted', 'Declined', 'Expired', 'Cancelled']) {
            expect(t).toContain(label)
        }
        expect((container as HTMLElement).querySelectorAll('.rounded-2xl')).toHaveLength(5)
    })

    it('trips render in the order returned by the API', async () => {
        h.getHistory.mockResolvedValue([
            tripRow({ id: 'first', shipments: { origin: 'Alpha Yard', destination: 'X', estimated_cost: 10, total_weight: 1 } }),
            tripRow({ id: 'second', shipments: { origin: 'Beta Yard', destination: 'Y', estimated_cost: 20, total_weight: 2 } }),
        ])
        await mountPage()
        const t = text()
        expect(t.indexOf('Alpha Yard')).toBeGreaterThan(-1)
        expect(t.indexOf('Beta Yard')).toBeGreaterThan(t.indexOf('Alpha Yard'))
    })

    it('choosing declined refetches with that filter, rerenders and moves the active styling', async () => {
        h.getHistory
            .mockResolvedValueOnce([tripRow({ id: 'initial' })])
            .mockResolvedValue([
                tripRow({
                    id: 'declined-1',
                    status: 'declined',
                    shipments: { origin: 'Declined Yard', destination: 'Z', estimated_cost: 30, total_weight: 3 },
                }),
            ])
        await mountPage()
        expect(h.getHistory).toHaveBeenCalledWith('driver-1', 'all')
        const declined = buttons(/declined/)[0]
        await click(declined)
        expect(h.getHistory).toHaveBeenCalledTimes(2)
        expect(h.getHistory).toHaveBeenLastCalledWith('driver-1', 'declined')
        expect(text()).toContain('Declined Yard')
        expect(text()).not.toContain('Mumbai Yard')
        expect(declined.className).toContain('bg-blue-600')
        expect(buttons(/All/)[0].className).not.toContain('bg-blue-600')
    })

    it('choosing delivered refetches with that filter and rerenders the result', async () => {
        h.getHistory
            .mockResolvedValueOnce([tripRow({ id: 'initial', status: 'declined' })])
            .mockResolvedValue([
                tripRow({
                    id: 'delivered-1',
                    status: 'delivered',
                    shipments: { origin: 'Delivered Yard', destination: 'W', estimated_cost: 40, total_weight: 4 },
                }),
            ])
        await mountPage()
        await click(buttons(/delivered/)[0])
        expect(h.getHistory).toHaveBeenLastCalledWith('driver-1', 'delivered')
        expect(text()).toContain('Delivered Yard')
        expect(text()).not.toContain('Mumbai Yard')
    })
})
