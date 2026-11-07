/**
 * Regression suite for AdminDashboardPage (admin platform analytics).
 *
 * Pins the current behaviour of the page against a fully mocked
 * adminDashboardApi + auth store: the role-gated mount fetch, the
 * loading / error / empty / data states, the refresh recovery path,
 * the six management navigation targets and the export button surface.
 * Nothing touches supabase, the network, the filesystem or real timers.
 */

// FINDING 1 — the export buttons can never export: fetchAnalytics always
// resets exportRows to [] (see the TODO in AdminDashboardPage.tsx), so
// handleExport always early-returns with the toast 'No management data
// available to export' even after a successful load, and downloadCsv /
// downloadJson / downloadXlsx are unreachable from this page. Per task
// rules the bug is NOT asserted as correct: this suite only pins that the
// three buttons render enabled and that no download util fires during a
// load. When the TODO is implemented, add call-argument assertions on the
// download utils and the pinned date-stamped filename.
//
// FINDING 2 — no permission state for non-admins: when user?.role !== 'admin'
// the mount effect never runs, `loading` (initialised to true) never clears
// and the page stays on the bare spinner forever instead of showing a
// permission-denied message. The suite pins only the intended half of that
// behaviour (getSnapshot is never called for a non-admin). Related: the
// loading spinner exposes no role="status" / aria-busy attributes; the only
// accessibility hook on the page is the refresh button's aria-label.

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    getSnapshot: vi.fn(),
    downloadCsv: vi.fn(),
    downloadJson: vi.fn(),
    downloadXlsx: vi.fn(),
    loggerError: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    auth: { user: null as { id: string; role: string } | null },
}))

vi.mock('react-hot-toast', () => ({
    default: { error: h.toastError, success: h.toastSuccess },
}))

vi.mock('../services/adminSupabaseApi', () => ({
    adminDashboardApi: { getSnapshot: h.getSnapshot },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => h.auth,
}))

vi.mock('../utils/dataExport', () => ({
    downloadCsv: h.downloadCsv,
    downloadJson: h.downloadJson,
    downloadXlsx: h.downloadXlsx,
}))

vi.mock('../utils/logger', () => ({
    logger: { error: h.loggerError, log: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import AdminDashboardPage from './AdminDashboardPage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const ADMIN = { id: 'admin-1', role: 'admin' }

const ANALYTICS = {
    totalRevenue: 1250000,
    agencyRevenue: 800000,
    driverRevenue: 300000,
    directAppRevenue: 150000,
    directAppBookingValue: 220000,
    directAppBookingCount: 34,
    totalAgencies: 12,
    totalDrivers: 48,
    totalShipments: 260,
    platformFee: 125000,
}

// Fixed UTC-noon instants so the localized day/month is stable on any host
// timezone between UTC-11 and UTC+12.
const AGENCY_JOB = {
    id: 'job-1',
    source: 'agency',
    ownerName: 'Sharma Transport',
    origin: 'Mumbai',
    destination: 'Pune',
    amount: 18500,
    eventDate: '2026-10-15T12:00:00Z',
}
const DRIVER_JOB_WITHOUT_ROUTE = {
    id: 'job-2',
    source: 'driver',
    ownerName: 'Ravi Kumar',
    origin: '',
    destination: '',
    amount: 2400,
    eventDate: '2026-10-14T12:00:00Z',
}

const SNAPSHOT = {
    analytics: ANALYTICS,
    recentJobs: [AGENCY_JOB, DRIVER_JOB_WITHOUT_ROUTE],
}

const EMPTY_SNAPSHOT = {
    analytics: {
        totalRevenue: 0,
        agencyRevenue: 0,
        driverRevenue: 0,
        directAppRevenue: 0,
        directAppBookingValue: 0,
        directAppBookingCount: 0,
        totalAgencies: 0,
        totalDrivers: 0,
        totalShipments: 0,
        platformFee: 0,
    },
    recentJobs: [],
}

// Exposes the router location so navigate() targets are observable.
function LocationProbe() {
    const location = useLocation()
    return createElement('div', { 'data-testid': 'location' }, location.pathname)
}

let root: Root | null = null
let container: HTMLElement | null = null

async function renderTree() {
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/admin'] },
                createElement(AdminDashboardPage),
                createElement(LocationProbe),
            ),
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

async function renderPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await renderTree()
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
    // restoreMocks in vitest.config.ts does not undo vi.useFakeTimers().
    vi.useRealTimers()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

describe('AdminDashboardPage', () => {
    beforeEach(() => {
        // shouldAdvanceTime:true keeps real-time timers firing while the
        // clock itself is pinned for determinism.
        vi.useFakeTimers({ now: Date.parse('2026-11-07T06:30:00Z'), shouldAdvanceTime: true })
        h.auth.user = ADMIN
        h.getSnapshot.mockResolvedValue(SNAPSHOT)
    })

    it('loading state: while the snapshot request is pending only the spinner renders, fetched once with limit 20', async () => {
        h.getSnapshot.mockReturnValue(new Promise(() => {}))
        await renderPage()

        expect(q('.animate-spin')).not.toBeNull()
        expect(text()).not.toContain('Platform Analytics')
        expect(q('table')).toBeNull()
        expect(h.getSnapshot).toHaveBeenCalledTimes(1)
        expect(h.getSnapshot).toHaveBeenCalledWith(20)
    })

    it('permission path: a non-admin user never triggers the snapshot request', async () => {
        h.auth.user = { id: 'user-2', role: 'agency' }
        await renderPage()

        expect(h.getSnapshot).not.toHaveBeenCalled()
        // FINDING 2: the page stays on the spinner instead of a denial message.
        expect(q('.animate-spin')).not.toBeNull()
        expect(text()).not.toContain('Platform Analytics')
    })

    it('auth hydration: no fetch while signed out, then exactly one fetch once the admin user arrives', async () => {
        h.auth.user = null
        await renderPage()
        expect(h.getSnapshot).not.toHaveBeenCalled()

        h.auth.user = ADMIN
        await renderTree()

        expect(h.getSnapshot).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Platform Analytics')
    })

    it('error state: a failed snapshot toasts, logs and falls back to the zeroed dashboard', async () => {
        h.getSnapshot.mockRejectedValueOnce(new Error('supabase down'))
        await renderPage()

        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load analytics')
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(h.loggerError.mock.calls[0][0]).toBe('Failed to fetch analytics:')
        // loading cleared, dashboard renders with initial zeroed state
        expect(q('.animate-spin')).toBeNull()
        expect(text()).toContain('Platform Analytics')
        expect(text()).toContain('No revenue activity yet')
        expect(text()).toContain('₹0')
    })

    it('refresh is the recovery path: after an error it refetches and renders the data', async () => {
        h.getSnapshot.mockRejectedValueOnce(new Error('supabase down'))
        await renderPage()
        expect(h.toastError).toHaveBeenCalled()

        await click(q('button[aria-label="Refresh analytics"]') as HTMLButtonElement)

        expect(h.getSnapshot).toHaveBeenCalledTimes(2)
        expect(h.getSnapshot).toHaveBeenLastCalledWith(20)
        expect(text()).toContain('Sharma Transport')
    })

    it('happy path: all analytics counters render in order with Indian currency grouping', async () => {
        await renderPage()

        const counterValues = Array.from(container!.querySelectorAll('p.text-xl.font-bold')).map(
            (p) => p.textContent,
        )
        expect(counterValues).toEqual([
            '₹12,50,000', // Delivered Revenue
            '₹8,00,000', // Agency Revenue
            '₹3,00,000', // Driver Revenue
            '₹1,50,000', // Direct App Revenue
            '12', // Agencies
            '48', // Drivers
            '260', // Shipments
            '34', // Direct App Bookings
        ])
        // platform fee hero card uses its own size class
        expect(q('.text-3xl')?.textContent).toBe('₹1,25,000')
        expect(text()).toContain('Est. value ₹2,20,000')
        expect(text()).toContain('Estimated Platform Revenue (10%)')
    })

    it('recent jobs: table lists source, owner, route, formatted amount and localized date', async () => {
        await renderPage()

        expect(Array.from(container!.querySelectorAll('thead th')).map((th) => th.textContent)).toEqual([
            'Source',
            'Owner',
            'Route',
            'Amount',
            'Date',
        ])
        const rows = Array.from(container!.querySelectorAll('tbody tr'))
        expect(rows).toHaveLength(2)
        const cells = Array.from(rows[0].querySelectorAll('td')).map((td) => td.textContent)
        expect(cells).toEqual(['agency', 'Sharma Transport', 'Mumbai → Pune', '₹18,500', '15 Oct'])
    })

    it('route fallback: missing origin/destination render em-dashes', async () => {
        await renderPage()

        const row = container!.querySelectorAll('tbody tr')[1]
        const cells = Array.from(row.querySelectorAll('td')).map((td) => td.textContent)
        expect(cells).toEqual(['driver', 'Ravi Kumar', '— → —', '₹2,400', '14 Oct'])
    })

    it('empty state: zero counters and every section empty message, no jobs table', async () => {
        h.getSnapshot.mockResolvedValue(EMPTY_SNAPSHOT)
        await renderPage()

        expect(text()).toContain('No revenue activity yet')
        expect(text()).toContain('No revenue data yet')
        expect(text()).toContain('No delivered driver trips yet')
        expect(text()).toContain('₹0')
        expect(q('table')).toBeNull()
    })

    it('export surface: CSV/XLSX/JSON render enabled after load and no download util fires', async () => {
        await renderPage()

        const exportButtons = buttons(/^(CSV|XLSX|JSON)$/)
        expect(exportButtons).toHaveLength(3)
        expect(exportButtons.map((b) => b.textContent)).toEqual(['CSV', 'XLSX', 'JSON'])
        expect(exportButtons.every((b) => !b.disabled)).toBe(true)
        // FINDING 1: with exportRows always reset to [] the download utils are
        // unreachable; loading data must not trigger any export side effect.
        expect(h.downloadCsv).not.toHaveBeenCalled()
        expect(h.downloadJson).not.toHaveBeenCalled()
        expect(h.downloadXlsx).not.toHaveBeenCalled()
        expect(h.toastSuccess).not.toHaveBeenCalled()
    })

    it('accessibility: the refresh control exposes its aria-label', async () => {
        await renderPage()

        const refresh = q('button[aria-label="Refresh analytics"]')
        expect(refresh).not.toBeNull()
        expect(refresh?.tagName).toBe('BUTTON')
    })

    it('navigates to user management', async () => {
        await renderPage()
        await click(buttons(/User Management/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/admin/users')
    })

    it('navigates to driver management', async () => {
        await renderPage()
        await click(buttons(/Manage Drivers/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/admin/drivers')
    })

    it('navigates to agency management', async () => {
        await renderPage()
        await click(buttons(/Manage Agencies/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/admin/agencies')
    })

    it('navigates to driver payouts', async () => {
        await renderPage()
        await click(buttons(/Driver Payouts/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/admin/payouts')
    })

    it('navigates to contact inquiries', async () => {
        await renderPage()
        await click(buttons(/Contact Inquiries/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/admin/contact')
    })

    it('navigates to subscriptions', async () => {
        await renderPage()
        await click(buttons(/Subscriptions/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/admin/subscriptions')
    })
})
