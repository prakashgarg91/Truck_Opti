import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    getSweepRuns: vi.fn(),
}))

vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('../services/adminSupabaseApi', () => ({
    adminBillingOpsApi: { getSweepRuns: h.getSweepRuns },
}))

import AdminBillingOpsPage, { NOT_AVAILABLE_TEXT } from './AdminBillingOpsPage'

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

describe('AdminBillingOpsPage: sections an admin cannot read yet', () => {
    it('renders the four section headings in order', async () => {
        await mountPage()
        const headings = qa('section h2').map((h) => h.textContent)
        expect(headings).toEqual([
            'Agencies without a live subscription',
            'Webhook events',
            'Sweep runs',
            'Coupons',
        ])
    })

    it('shows the not-available notice with the exact table names for every unreadable table', async () => {
        await mountPage()
        const notices = qa('[data-testid="ops-not-available"]')
        expect(notices).toHaveLength(5)
        const combined = notices.map((n) => n.textContent).join('\n')
        expect(combined).toContain(NOT_AVAILABLE_TEXT)
        for (const table of [
            'subscriptions',
            'razorpay_webhook_events',
            'razorpay_webhook_attempts',
            'subscription_coupons',
            'subscription_coupon_redemptions',
        ]) {
            expect(combined).toContain(table)
        }
    })

    it('renders the notice text exactly, never an empty table or zero count, for the unreadable sections', async () => {
        await mountPage()
        const agencies = q('[data-testid="ops-section-ops-agencies-no-subscription"]') as HTMLElement
        expect(agencies.querySelector('table')).toBeNull()
        expect(agencies.textContent).toContain('Not available yet: needs an admin read path')
        expect(agencies.textContent).not.toMatch(/\b0\b/)
    })

    it('makes no query for the unreadable sections: only the sweep runs are fetched', async () => {
        await mountPage()
        expect(h.getSweepRuns).toHaveBeenCalledTimes(1)
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
