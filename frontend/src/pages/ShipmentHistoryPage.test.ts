import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ShipmentHistoryPage regression pins (customer shipment history over
// customerShipmentsApi.getCreatedByUser): the mount pipeline (auth user ->
// created_by query), the loading/empty/error states, client-side search and
// the five status filters (no refetch), the card rendering rules (id suffix,
// en-IN date and amount formatting, field fallbacks), pagination at
// PAGE_SIZE = 10 and the card-click navigation to /tracking. The clock is
// pinned so the rendered created_at date stays deterministic.
//
// FINDING (bug): when the auth store has no user, fetchShipments returns
//   before setLoading(false), so the page mounts into an endless full-screen
//   spinner (same defect as DriverHistoryPage). Reachable through transient
//   store states such as mid-logout. Deliberately NOT asserted as correct.
// FINDING (a11y): the loading spinner is a bare SVG — no role="status" and
//   no aria-busy; the search input has no accessible name beyond its
//   placeholder; the filter tabs carry no aria-pressed. Only the hooks the
//   page does expose (document.title, the h1) are pinned.
// FINDING (ux): the error path has no inline error region and no Retry — it
//   only toasts and then renders the generic empty state. Pinned as-is.

const h = vi.hoisted(() => ({
    getCreatedByUser: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    loggerError: vi.fn(),
    authUser: null as { id: string } | null,
}))

vi.mock('react-hot-toast', () => ({
    default: { error: h.toastError, success: h.toastSuccess },
}))

vi.mock('../services/supabaseApi', () => ({
    customerShipmentsApi: {
        getCreatedByUser: h.getCreatedByUser,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.authUser }),
}))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: h.loggerError },
}))

import ShipmentHistoryPage from './ShipmentHistoryPage'

const NOW = new Date('2026-11-07T06:30:00Z')
// Midday UTC so the rendered calendar day (15 Jan) holds in any timezone
// within ±12h of UTC; only the clock-independent ISO instant is asserted.
const CREATED_AT = '2026-01-15T12:00:00Z'

function row(overrides: Record<string, unknown> = {}) {
    return {
        id: 'ship-uuid-1',
        shipment_id: 'SHP-0001',
        origin: 'Mumbai Warehouse',
        destination: 'Delhi Hub',
        status: 'delivered',
        vehicle_type: 'Truck 32ft',
        total_weight: 900,
        created_at: CREATED_AT,
        estimated_cost: 4200,
        ...overrides,
    }
}

function rows(count: number, overrides: Record<string, unknown> = {}) {
    // Fixed-width ids so no rendered "#SHP-00NN" is a substring of another
    // card's "#SHP-00NN" + date text.
    return Array.from({ length: count }, (_, i) =>
        row({ id: `ship-uuid-${i + 1}`, shipment_id: `SHP-${String(i + 1).padStart(4, '0')}`, status: 'pending', ...overrides })
    )
}

function LocationProbe() {
    const location = useLocation()
    return createElement('p', { 'data-testid': 'location-probe' }, `${location.pathname}${location.search}`)
}

let root: Root | null = null
let container: HTMLElement | null = null

async function flushAsyncWork() {
    // The page's fetch resolves through promise continuations only; no real
    // timer is awaited, so everything is deterministic under fake timers.
    for (let i = 0; i < 30; i++) await Promise.resolve()
    await vi.advanceTimersByTimeAsync(0)
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(MemoryRouter, null, createElement(ShipmentHistoryPage), createElement(LocationProbe))
        )
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
    document.title = ''
    vi.useRealTimers()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(el: HTMLElement) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await flushAsyncWork()
    })
}

async function type(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await flushAsyncWork()
    })
}

describe('ShipmentHistoryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(NOW)
        document.title = ''
        h.authUser = { id: 'auth-user-1' }
        h.getCreatedByUser.mockResolvedValue([])
    })

    it('fetches the shipments created by the auth user exactly once on mount', async () => {
        h.getCreatedByUser.mockResolvedValue([row()])
        await mountPage()
        expect(h.getCreatedByUser).toHaveBeenCalledTimes(1)
        expect(h.getCreatedByUser).toHaveBeenCalledWith('auth-user-1')
    })

    it('loading state renders only the full-screen spinner', async () => {
        h.getCreatedByUser.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('.animate-spin')).not.toBeNull()
        expect(text()).not.toContain('Shipment History')
        expect(text()).not.toContain('No shipments found')
    })

    it('sets the document title (accessibility hook the page exposes)', async () => {
        await mountPage()
        expect(document.title).toBe('Shipment History - TruckOpti')
    })

    it('empty history renders the empty state with the pristine hint and a zero count', async () => {
        await mountPage()
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('No shipments found')
        expect(text()).toContain('Your shipment history will appear here')
        expect(text()).not.toContain('Try adjusting your filters')
        expect(text()).toContain('0 shipments')
    })

    it('a fetch failure toasts, logs, stops loading and renders the empty state without retrying', async () => {
        h.getCreatedByUser.mockRejectedValueOnce(new Error('history query failed'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load shipment history')
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('No shipments found')
        // the page has no Retry action: exactly the one mount fetch happened
        expect(h.getCreatedByUser).toHaveBeenCalledTimes(1)
    })

    it('a missing auth user never triggers a fetch', async () => {
        h.authUser = null
        await mountPage()
        expect(h.getCreatedByUser).not.toHaveBeenCalled()
    })

    it('renders a shipment card with id suffix, en-IN date, route, vehicle, weight and amount', async () => {
        h.getCreatedByUser.mockResolvedValue([row()])
        await mountPage()
        const t = text()
        expect(q('h1')?.textContent).toBe('Shipment History')
        expect(t).toContain('#SHP-0001')
        expect(t).toContain('15 Jan 2026')
        expect(t).toContain('Mumbai Warehouse')
        expect(t).toContain('Delhi Hub')
        expect(t).toContain('Delivered')
        expect(t).toContain('Truck 32ft')
        expect(t).toContain('900 kg')
        expect(t).toContain('₹4,200')
        expect(t).toContain('1 shipments')
    })

    it('renders exactly the five labelled filter tabs with All active', async () => {
        await mountPage()
        const labels = Array.from((container as HTMLElement).querySelectorAll('button')).map((b) => b.textContent)
        expect(labels).toEqual(['All', 'Pending', 'In Transit', 'Delivered', 'Cancelled'])
        expect(buttons(/All/)[0].className).toContain('bg-indigo-600')
        expect(buttons(/Pending/)[0].className).not.toContain('bg-indigo-600')
    })

    it('each of the four known statuses renders its own label', async () => {
        h.getCreatedByUser.mockResolvedValue([
            row({ id: 's-1', shipment_id: 'SHP-001' }),
            row({ id: 's-2', shipment_id: 'SHP-002', status: 'cancelled' }),
            row({ id: 's-3', shipment_id: 'SHP-003', status: 'in_transit' }),
            row({ id: 's-4', shipment_id: 'SHP-004', status: 'pending' }),
        ])
        await mountPage()
        const t = text()
        expect(t).toContain('Delivered')
        expect(t).toContain('Cancelled')
        expect(t).toContain('In Transit')
        // 'Pending' appears once on the tab and once on the pending card
        expect((t.match(/Pending/g) || []).length).toBe(2)
        expect(t).toContain('4 shipments')
    })

    it('an unknown status falls back to the Pending presentation', async () => {
        h.getCreatedByUser.mockResolvedValue([row({ status: 'held_at_hub' })])
        await mountPage()
        const t = text()
        // the raw status string itself is never rendered, only the mapped label
        expect(t).not.toContain('held_at_hub')
        // once on the filter tab, once on the card badge — the badge fell back
        expect((t.match(/Pending/g) || []).length).toBe(2)
    })

    it('missing fields fall back to em-dashes, Truck, 0 kg and hide the amount', async () => {
        h.getCreatedByUser.mockResolvedValue([
            row({ origin: '', destination: '', vehicle_type: '', total_weight: 0, estimated_cost: 0 }),
        ])
        await mountPage()
        const t = text()
        expect((t.match(/—/g) || []).length).toBe(2)
        expect(t).toContain('Truck')
        expect(t).toContain('0 kg')
        expect(t).not.toContain('₹')
    })

    it('an empty shipment_id falls back to the last 8 characters of the row id', async () => {
        h.getCreatedByUser.mockResolvedValue([row({ id: 'abcdefgh12345678', shipment_id: '' })])
        await mountPage()
        expect(text()).toContain('#12345678')
        expect(text()).not.toContain('#SHP-0001')
    })

    it('the Delivered filter narrows the list client-side without refetching', async () => {
        h.getCreatedByUser.mockResolvedValue([
            row({ id: 's-1', shipment_id: 'SHP-001' }),
            row({ id: 's-2', shipment_id: 'SHP-002', status: 'pending' }),
        ])
        await mountPage()
        await click(buttons(/Delivered/)[0])
        expect(h.getCreatedByUser).toHaveBeenCalledTimes(1)
        expect(text()).toContain('#SHP-001')
        expect(text()).not.toContain('#SHP-002')
        expect(text()).toContain('1 shipments')
        expect(buttons(/Delivered/)[0].className).toContain('bg-indigo-600')
        expect(buttons(/All/)[0].className).not.toContain('bg-indigo-600')
    })

    it('a filter with no matches shows the adjust-filters hint', async () => {
        h.getCreatedByUser.mockResolvedValue([row()])
        await mountPage()
        await click(buttons(/Cancelled/)[0])
        const t = text()
        expect(t).toContain('No shipments found')
        expect(t).toContain('Try adjusting your filters')
        expect(t).not.toContain('Your shipment history will appear here')
        expect(t).toContain('0 shipments')
    })

    it('search matches the origin case-insensitively', async () => {
        h.getCreatedByUser.mockResolvedValue([row(), row({ id: 's-2', shipment_id: 'SHP-002', origin: 'Pune Depot' })])
        await mountPage()
        await type(q('input') as HTMLInputElement, 'MUMBAI')
        expect(h.getCreatedByUser).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Mumbai Warehouse')
        expect(text()).not.toContain('Pune Depot')
        expect(text()).toContain('1 shipments')
    })

    it('search matches the destination', async () => {
        h.getCreatedByUser.mockResolvedValue([row(), row({ id: 's-2', shipment_id: 'SHP-002', destination: 'Pune Depot' })])
        await mountPage()
        await type(q('input') as HTMLInputElement, 'delhi')
        expect(text()).toContain('Delhi Hub')
        expect(text()).not.toContain('Pune Depot')
        expect(text()).toContain('1 shipments')
    })

    it('search matches the shipment id case-insensitively', async () => {
        h.getCreatedByUser.mockResolvedValue([row(), row({ id: 's-2', shipment_id: 'SHP-0002' })])
        await mountPage()
        await type(q('input') as HTMLInputElement, 'shp-0002')
        expect(text()).not.toContain('#SHP-0001')
        expect(text()).toContain('#SHP-0002')
    })

    it('a search with no matches shows the adjust-filters hint and a zero count', async () => {
        h.getCreatedByUser.mockResolvedValue([row()])
        await mountPage()
        await type(q('input') as HTMLInputElement, 'nowhere')
        const t = text()
        expect(t).toContain('No shipments found')
        expect(t).toContain('Try adjusting your filters')
        expect(t).toContain('0 shipments')
    })

    it('clicking a card navigates to tracking with the shipment id', async () => {
        h.getCreatedByUser.mockResolvedValue([row({ id: 'ship-abc' })])
        await mountPage()
        const card = (container as HTMLElement).querySelectorAll('.cursor-pointer')[0] as HTMLElement
        await click(card)
        expect(q('[data-testid="location-probe"]')?.textContent).toBe('/tracking?shipment=ship-abc')
    })

    it('exactly ten shipments render without the pagination footer', async () => {
        h.getCreatedByUser.mockResolvedValue(rows(10))
        await mountPage()
        expect(text()).toContain('10 shipments')
        expect(buttons(/Previous/)).toHaveLength(0)
        expect(buttons(/Next/)).toHaveLength(0)
        expect(text()).not.toContain('Page 1 of')
    })

    it('eleven shipments show the footer, page 1 range and a disabled Previous', async () => {
        h.getCreatedByUser.mockResolvedValue(rows(11))
        await mountPage()
        const t = text()
        expect(t).toContain('Showing 1-10 of 11')
        expect(t).toContain('Page 1 of 2')
        expect(t).toContain('#SHP-0001')
        expect(t).not.toContain('#SHP-0011')
        expect(buttons(/Previous/)[0].disabled).toBe(true)
        expect(buttons(/Next/)[0].disabled).toBe(false)
    })

    it('Next shows the last shipment and Next disables on the final page; Previous returns', async () => {
        h.getCreatedByUser.mockResolvedValue(rows(11))
        await mountPage()
        await click(buttons(/Next/)[0])
        let t = text()
        expect(t).toContain('Showing 11-11 of 11')
        expect(t).toContain('Page 2 of 2')
        expect(t).toContain('#SHP-0011')
        expect(t).not.toContain('#SHP-0001')
        expect(buttons(/Previous/)[0].disabled).toBe(false)
        expect(buttons(/Next/)[0].disabled).toBe(true)
        await click(buttons(/Previous/)[0])
        t = text()
        expect(t).toContain('Showing 1-10 of 11')
        expect(t).toContain('#SHP-0001')
        expect(t).not.toContain('#SHP-0011')
    })

    it('searching while on page 2 resets to page 1', async () => {
        const data = [
            row({ id: 'ship-uuid-1', shipment_id: 'SHP-0001', status: 'pending' }),
            ...Array.from({ length: 10 }, (_, i) =>
                row({
                    id: `ship-uuid-${i + 2}`,
                    shipment_id: `SHP-${String(i + 2).padStart(4, '0')}`,
                    origin: 'Delhi Depot',
                    status: 'pending',
                })
            ),
        ]
        h.getCreatedByUser.mockResolvedValue(data)
        await mountPage()
        await click(buttons(/Next/)[0])
        expect(text()).toContain('Page 2 of 2')
        await type(q('input') as HTMLInputElement, 'mumbai')
        const t = text()
        expect(t).toContain('Mumbai Warehouse')
        expect(t).toContain('1 shipments')
        expect(t).not.toContain('#SHP-0011')
        expect(t).not.toContain('Page 2')
        expect(buttons(/Previous/)).toHaveLength(0)
    })

    it('changing the filter while on page 2 resets to page 1', async () => {
        const data = [
            ...rows(9),
            row({ id: 'ship-uuid-10', shipment_id: 'SHP-0010' }),
            row({ id: 'ship-uuid-11', shipment_id: 'SHP-0011' }),
        ]
        h.getCreatedByUser.mockResolvedValue(data)
        await mountPage()
        await click(buttons(/Next/)[0])
        expect(text()).toContain('Page 2 of 2')
        await click(buttons(/Pending/)[0])
        const t = text()
        expect(t).toContain('9 shipments')
        expect(t).toContain('#SHP-0009')
        expect(t).not.toContain('#SHP-0010')
        expect(t).not.toContain('#SHP-0011')
    })
})
