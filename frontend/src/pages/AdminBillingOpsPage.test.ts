import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    getSweepRuns: vi.fn(),
    getAgencies: vi.fn(),
    getEvents: vi.fn(),
    getAttempts: vi.fn(),
    getCoupons: vi.fn(),
}))

vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('../services/adminSupabaseApi', () => ({
    adminBillingOpsApi: {
        getSweepRuns: h.getSweepRuns,
        getAgenciesWithoutSubscription: h.getAgencies,
        getWebhookEvents: h.getEvents,
        getWebhookAttempts: h.getAttempts,
        getCoupons: h.getCoupons,
    },
}))

import AdminBillingOpsPage from './AdminBillingOpsPage'

const RUNS = [
    {
        id: 'run-aaa-111',
        asOf: '2026-11-18T10:00:00Z',
        startedAt: '2026-11-18T10:00:02Z',
        finishedAt: '2026-11-18T10:00:09Z',
        trialsExpired: 2,
        graceStarted: 1,
        graceExpired: 0,
        remindersCreated: 4,
    },
    {
        id: 'run-bbb-222',
        asOf: '2026-11-18T09:00:00Z',
        startedAt: '2026-11-18T09:00:01Z',
        finishedAt: null,
        trialsExpired: 0,
        graceStarted: 0,
        graceExpired: 3,
        remindersCreated: 0,
    },
]

const AGENCIES = [
    { id: 'a1', name: 'Alpha Logistics', createdAt: '2026-11-01T10:00:00Z', ownerUserId: 'owner-uuid-1', ownerEmail: 'alpha@example.com' },
    { id: 'a2', name: 'Beta Movers', createdAt: '2026-11-02T10:00:00Z', ownerUserId: 'owner-uuid-2', ownerEmail: null },
]
const EVENTS = [
    { receivedAt: '2026-11-18T10:00:00Z', eventId: 'evt_1', eventType: 'payment.captured', result: 'orphan', orderId: 'order_1', paymentId: 'pay_1' },
    { receivedAt: '2026-11-18T09:00:00Z', eventId: 'evt_2', eventType: 'ping', result: 'ignored', orderId: null, paymentId: null },
]
const ATTEMPTS = [
    { eventId: 'evt_1', attemptNo: 2, sqlstateOrCode: 'P0001', at: '2026-11-18T10:01:00Z' },
    { eventId: 'evt_1', attemptNo: 1, sqlstateOrCode: '23505', at: '2026-11-18T10:00:30Z' },
]
const COUPONS = [
    { code: 'FOUNDING50', percentOff: 50, maxCycles: 3, monthlyOnly: true, validUntil: null, maxRedemptions: null, redemptionCount: 3 },
    { code: 'LIMITED10', percentOff: 10, maxCycles: 2, monthlyOnly: false, validUntil: '2031-01-01T00:00:00Z', maxRedemptions: 5, redemptionCount: 1 },
]

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/admin/billing-ops'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/admin/billing-ops', element: createElement(AdminBillingOpsPage) }),
                    createElement(Route, { path: '/admin', element: createElement('div', null, 'ADMIN-HOME') }),
                ),
            ),
        )
        await new Promise((r) => setTimeout(r, 0))
    })
}

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const qa = (sel: string) => Array.from((container as HTMLElement).querySelectorAll(sel))
const text = () => (container as HTMLElement).textContent || ''
const button = (label: RegExp) =>
    qa('button').find((b) => label.test(b.textContent || '') || label.test(b.getAttribute('aria-label') || '')) as HTMLButtonElement | undefined

async function click(el: HTMLElement) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function typeSearch(value: string) {
    const input = q('#sweep-search') as HTMLInputElement
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    h.getSweepRuns.mockResolvedValue(RUNS)
    h.getAgencies.mockResolvedValue(AGENCIES)
    h.getEvents.mockResolvedValue(EVENTS)
    h.getAttempts.mockResolvedValue(ATTEMPTS)
    h.getCoupons.mockResolvedValue(COUPONS)
})

afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = null
    container?.remove()
    container = null
})

describe('AdminBillingOpsPage: sweep runs (live)', () => {
    it('shows a loading status while the sweep runs are fetched', async () => {
        h.getSweepRuns.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="sweep-loading"]')).not.toBeNull()
        expect(q('[data-testid="sweep-table"]')).toBeNull()
    })

    it('requests the latest 20 runs and renders one row per run with its counts', async () => {
        await mountPage()
        expect(h.getSweepRuns).toHaveBeenCalledWith(20)
        expect(qa('[data-testid="sweep-table"] tbody tr')).toHaveLength(2)
        const firstRow = qa('[data-testid="sweep-table"] tbody tr')[0].textContent || ''
        expect(firstRow).toContain('run-aaa-111')
        expect(firstRow).not.toContain('Not finished')
        expect(qa('[data-testid="sweep-table"] tbody tr')[1].textContent).toContain('Not finished')
    })

    it('empty state: no runs shows the empty notice and no table', async () => {
        h.getSweepRuns.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="sweep-empty"]')?.textContent).toContain('No sweep runs have been recorded yet.')
        expect(q('[data-testid="sweep-table"]')).toBeNull()
    })

    it('error state: shows the shared error with Retry, never an empty table, and Retry reloads the runs', async () => {
        h.getSweepRuns
            .mockRejectedValueOnce(new Error('pg: relation leaked'))
            .mockResolvedValueOnce(RUNS)
        await mountPage()
        expect(q('[data-testid="admin-load-error"]')).not.toBeNull()
        expect(text()).toContain('Unable to load sweep runs right now. Please try again.')
        expect(text()).not.toContain('leaked')
        expect(q('[data-testid="sweep-table"]')).toBeNull()
        expect(q('[data-testid="sweep-empty"]')).toBeNull()
        await click(button(/^Retry$/) as HTMLElement)
        expect(h.getSweepRuns).toHaveBeenCalledTimes(2)
        expect(qa('[data-testid="sweep-table"] tbody tr')).toHaveLength(2)
    })

    it('search filters rows by run id and shows a no-match notice when nothing fits', async () => {
        await mountPage()
        await typeSearch('bbb-222')
        expect(qa('[data-testid="sweep-table"] tbody tr')).toHaveLength(1)
        expect(text()).toContain('run-bbb')
        expect(text()).not.toContain('run-aaa')
        await typeSearch('zzz-no-such-run')
        expect(q('[data-testid="sweep-no-match"]')).not.toBeNull()
        expect(q('[data-testid="sweep-table"]')).toBeNull()
    })

    it('search is case-insensitive and an empty query restores all rows', async () => {
        await mountPage()
        await typeSearch('RUN-AAA')
        expect(qa('[data-testid="sweep-table"] tbody tr')).toHaveLength(1)
        await typeSearch('')
        expect(qa('[data-testid="sweep-table"] tbody tr')).toHaveLength(2)
    })

    it('the search input has an accessible label', async () => {
        await mountPage()
        expect(q('label[for="sweep-search"]')?.textContent).toBe('Search sweep runs')
    })
})

describe('AdminBillingOpsPage: the admin read sections (live)', () => {
    it('renders the four section headings in order', async () => {
        await mountPage()
        const headings = qa('section h2').map((h) => h.textContent)
        expect(headings).toEqual(['Agencies without a live subscription', 'Webhook events', 'Sweep runs', 'Coupons'])
    })

    it('no section shows a "not available" notice any more', async () => {
        await mountPage()
        expect(q('[data-testid="ops-not-available"]')).toBeNull()
        expect(text()).not.toContain('Not available yet')
    })

    it('requests every section once: 100 events, 100 attempts, 20 sweep runs', async () => {
        await mountPage()
        expect(h.getAgencies).toHaveBeenCalledTimes(1)
        expect(h.getEvents).toHaveBeenCalledWith(100)
        expect(h.getAttempts).toHaveBeenCalledWith(100)
        expect(h.getCoupons).toHaveBeenCalledTimes(1)
        expect(h.getSweepRuns).toHaveBeenCalledWith(20)
    })

    it('shows a loading status per section while it is fetched', async () => {
        h.getAgencies.mockReturnValue(new Promise(() => {}))
        h.getCoupons.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="agencies-loading"]')).not.toBeNull()
        expect(q('[data-testid="coupons-loading"]')).not.toBeNull()
        expect(q('[data-testid="events-table"]')).not.toBeNull()
    })

    it('agencies: one row per agency with the owner email, falling back to the owner id', async () => {
        await mountPage()
        const rows = qa('[data-testid="agencies-table"] tbody tr')
        expect(rows).toHaveLength(2)
        expect(rows[0].textContent).toContain('Alpha Logistics')
        expect(rows[0].textContent).toContain('alpha@example.com')
        expect(rows[1].textContent).toContain('owner-uuid-2')
    })

    it('agencies: an empty list says every approved agency is subscribed, with no table', async () => {
        h.getAgencies.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="agencies-empty"]')?.textContent).toContain('Every approved agency has a live subscription.')
        expect(q('[data-testid="agencies-table"]')).toBeNull()
    })

    it('webhook events: rows show ids and result, null ids render as a dash, and no payload is shown', async () => {
        await mountPage()
        const rows = qa('[data-testid="events-table"] tbody tr')
        expect(rows).toHaveLength(2)
        expect(rows[0].textContent).toContain('evt_1')
        expect(rows[0].textContent).toContain('orphan')
        expect(rows[0].textContent).toContain('order_1')
        expect(rows[1].textContent).toContain('-')
        expect(text().toLowerCase()).not.toContain('payload')
    })

    it('webhook attempts: rows show event, attempt number and code', async () => {
        await mountPage()
        const rows = qa('[data-testid="attempts-table"] tbody tr')
        expect(rows).toHaveLength(2)
        expect(rows[0].textContent).toContain('evt_1')
        expect(rows[0].textContent).toContain('P0001')
    })

    it('coupons: discount, limit text and expiry are rendered', async () => {
        await mountPage()
        const rows = qa('[data-testid="coupons-table"] tbody tr')
        expect(rows).toHaveLength(2)
        expect(rows[0].textContent).toContain('FOUNDING50')
        expect(rows[0].textContent).toContain('50%')
        expect(rows[0].textContent).toContain('3 (no limit)')
        expect(rows[0].textContent).toContain('No expiry')
        expect(rows[1].textContent).toContain('1 of 5')
    })

    it('empty states: events, attempts and coupons each show their own notice', async () => {
        h.getEvents.mockResolvedValue([])
        h.getAttempts.mockResolvedValue([])
        h.getCoupons.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="events-empty"]')).not.toBeNull()
        expect(q('[data-testid="attempts-empty"]')).not.toBeNull()
        expect(q('[data-testid="coupons-empty"]')).not.toBeNull()
    })

    it('one failing section shows its own error with Retry and leaves the other sections intact', async () => {
        h.getEvents.mockRejectedValueOnce(new Error('rpc forbidden')).mockResolvedValueOnce(EVENTS)
        await mountPage()
        expect(qa('[data-testid="admin-load-error"]')).toHaveLength(1)
        expect(text()).toContain('Unable to load webhook events right now. Please try again.')
        expect(q('[data-testid="events-table"]')).toBeNull()
        expect(q('[data-testid="events-empty"]')).toBeNull()
        expect(q('[data-testid="agencies-table"]')).not.toBeNull()
        expect(q('[data-testid="coupons-table"]')).not.toBeNull()
        await click(button(/^Retry$/) as HTMLElement)
        expect(h.getEvents).toHaveBeenCalledTimes(2)
        expect(qa('[data-testid="events-table"] tbody tr')).toHaveLength(2)
        expect(q('[data-testid="admin-load-error"]')).toBeNull()
    })

    it('a refused agencies read (not an admin) is an error, never an empty "all subscribed" list', async () => {
        h.getAgencies.mockRejectedValue(new Error('forbidden'))
        await mountPage()
        expect(q('[data-testid="agencies-empty"]')).toBeNull()
        expect(q('[data-testid="agencies-table"]')).toBeNull()
        expect(q('[data-testid="admin-load-error"]')).not.toBeNull()
    })

    it('is read-only: the only buttons are Back and Retry, and there is no form', async () => {
        h.getSweepRuns.mockRejectedValue(new Error('x'))
        await mountPage()
        expect(q('form')).toBeNull()
        const labels = qa('button').map((b) => b.getAttribute('aria-label') || b.textContent?.trim())
        expect(labels).toEqual(['Back to admin dashboard', 'Retry'])
    })

    it('the back button navigates to /admin', async () => {
        await mountPage()
        await click(button(/Back to admin dashboard/) as HTMLElement)
        expect(text()).toContain('ADMIN-HOME')
    })
})
