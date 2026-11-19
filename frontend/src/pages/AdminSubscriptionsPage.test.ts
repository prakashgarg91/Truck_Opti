import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Admin subscriptions page, agency-level (TO-152): lists by agency, filters by
// status, shows trial/grace/expired, an Ops attention list (captured-but-refused
// payments and refund exceptions) and ONE legal action, Reopen after
// cancellation (confirm step, calls the service only on confirm).
//
// FINDING (robustness): for a signed-in non-admin (or a signed-out session)
// the page stays in the initial loading state forever -- `loading` starts
// true and only fetchSubscriptions() clears it, while the effect skips
// non-admin roles. Masked today by the admin-only route guard in App.tsx.
// The gate test pins the no-fetch behaviour; it does not bless the stuck state.

const h = vi.hoisted(() => ({
    getAdminSubscriptions: vi.fn(),
    reopenSubscription: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    currentUser: null as { id: string; email: string; name: string; role: string } | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/adminSupabaseApi', () => ({
    adminSupabaseApi: {
        getAdminSubscriptions: h.getAdminSubscriptions,
        reopenSubscription: h.reopenSubscription,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.currentUser }),
}))

import AdminSubscriptionsPage from './AdminSubscriptionsPage'
import { UserFacingError } from '../utils/userFacingError'

const base = {
    billing_cycle: 'monthly',
    current_period_start: '2026-11-01T00:00:00Z',
    current_period_end: '2026-12-01T00:00:00Z',
    trial_end: null,
    grace_end: null,
    first_paid_at: null,
    cancel_at_period_end: false,
    can_reopen: false,
}
const ACTIVE = {
    ...base,
    id: 'sub-1',
    agency_id: 'ag-1',
    status: 'active',
    first_paid_at: '2026-09-20T00:00:00Z',
    created_at: '2026-09-15T09:30:00Z',
    agency: { name: 'Fast Movers', gstin: '27AAAAA0000A1Z5', status: 'approved' },
    purchaser: { name: 'Owner', email: 'ops@fastmovers.test' },
    plan: { id: 'plan-pro', name: 'Pro Monthly', tier: 'pro' },
}
const TRIAL = {
    ...base,
    id: 'sub-2',
    agency_id: 'ag-2',
    status: 'trial',
    trial_end: '2026-11-12T00:00:00Z',
    created_at: '2026-10-05T10:15:00Z',
    agency: { name: 'Meena Logistics', gstin: null, status: 'approved' },
    purchaser: { name: 'Meena Rao', email: 'meena@example.com' },
    plan: { id: 'plan-growth', name: 'Growth', tier: 'growth' },
}
const GRACE = {
    ...base,
    id: 'sub-g',
    agency_id: 'ag-g',
    status: 'grace',
    grace_end: '2026-11-20T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    agency: { name: 'Grace Carriers', gstin: null, status: 'approved' },
    purchaser: null,
    plan: { id: 'plan-basic', name: 'Basic', tier: 'basic' },
}
const PAST_DUE = { ...GRACE, id: 'sub-p', agency_id: 'ag-p', status: 'past_due', grace_end: null, agency: { name: 'Late Payers', gstin: null, status: 'approved' } }
const EXPIRED = {
    ...base,
    id: 'sub-3',
    agency_id: 'ag-3',
    status: 'expired',
    created_at: '2025-01-01T00:00:00Z',
    agency: { name: 'Ravi Transport', gstin: null, status: 'approved' },
    purchaser: { name: 'Ravi Kumar', email: 'ravi@example.com' },
    plan: { id: 'plan-basic', name: 'Basic', tier: 'basic' },
}
const CANCELLED = {
    ...base,
    id: 'sub-4',
    agency_id: 'ag-4',
    status: 'cancelled',
    can_reopen: true,
    created_at: '2026-02-10T00:00:00Z',
    agency: { name: 'Refunded Co', gstin: null, status: 'approved' },
    purchaser: null,
    plan: null,
}
const CANCELLED_OLD = { ...CANCELLED, id: 'sub-4-old', can_reopen: false, created_at: '2026-01-10T00:00:00Z' }

const REFUSED = {
    id: 'pay-1',
    agency_id: 'ag-1',
    subscription_id: 'sub-1',
    amount_paise: 118000,
    order_id: 'order_X',
    payment_id: 'pay_CAPTURED',
    refused_payment_ids: ['pay_CAPTURED'],
    refusal: 'AMOUNT_MISMATCH',
    refused_at: '2026-11-06T08:00:00Z',
    error_message: null,
}
const REFUND_EXC = {
    id: 'rx-1',
    refund_id: 'rfnd_1',
    payment_id: 'pay_9',
    agency_id: 'ag-4',
    amount_paise: 59000,
    reason: 'subscription_not_found',
    created_at: '2026-11-06T09:00:00Z',
}

const snap = (subscriptions: unknown[], refusedPayments: unknown[] = [], refundExceptions: unknown[] = []) => ({
    subscriptions,
    opsAttention: { refusedPayments, refundExceptions },
})

const SUBS = [ACTIVE, TRIAL, EXPIRED, CANCELLED]
const CURRENT_ADMIN = { id: 'me-admin', email: 'boss@truckopti.test', name: 'Boss', role: 'admin' }

const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/admin/subscriptions'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/admin/subscriptions', element: createElement(AdminSubscriptionsPage) }),
                    createElement(Route, { path: '/admin', element: createElement('div', null, 'ADMIN-HOME-MARKER') }),
                ),
            ),
        )
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
    vi.useRealTimers()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const cardTexts = () => Array.from((q('.grid.grid-cols-2') as HTMLElement)?.children || []).map((c) => c.textContent || '')
const refreshButton = () => q('button[aria-label="Refresh subscriptions"]') as HTMLButtonElement
const buttonByText = (label: string) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).find((b) => (b.textContent || '').includes(label)) as HTMLButtonElement

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function flush() {
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function setSelect(el: HTMLSelectElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(el, value)
        el.dispatchEvent(new Event('change', { bubbles: true }))
    })
}

async function setInput(el: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('AdminSubscriptionsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
        h.currentUser = { ...CURRENT_ADMIN }
        h.getAdminSubscriptions.mockResolvedValue(snap(SUBS))
        h.reopenSubscription.mockResolvedValue(undefined)
    })

    it('never fetches subscriptions for a non-admin session (permission gate)', async () => {
        h.currentUser = { ...CURRENT_ADMIN, role: 'agency' }
        await mountPage()
        expect(h.getAdminSubscriptions).not.toHaveBeenCalled()
        expect((container as HTMLElement).querySelectorAll('.animate-spin').length).toBeGreaterThan(0)
        expect(q('h1')).toBeNull()
    })

    it('loading state: centered spinner while the first fetch is in flight', async () => {
        h.getAdminSubscriptions.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect((container as HTMLElement).querySelectorAll('.animate-spin').length).toBeGreaterThan(0)
        expect(refreshButton()).toBeNull()
        expect(q('.grid.grid-cols-2')).toBeNull()
        expect(text()).not.toContain('No subscriptions yet')
    })

    it('a rejected list call toasts its user-facing message and shows an error state with Retry, never an empty queue', async () => {
        h.getAdminSubscriptions.mockRejectedValue(new UserFacingError('Unable to load subscriptions right now. Please try again.'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledWith('Unable to load subscriptions right now. Please try again.')
        expect(q('[data-testid="subscriptions-load-error"]')).not.toBeNull()
        expect(text()).toContain('Unable to load subscriptions right now. Please try again.')
        expect(buttonByText('Retry')).toBeTruthy()
        expect(text()).not.toContain('No subscriptions yet')
        expect(text()).not.toContain('Nothing needs attention')
    })

    it('Retry after a first failed load shows the list', async () => {
        h.getAdminSubscriptions
            .mockRejectedValueOnce(new UserFacingError('Unable to load subscriptions right now. Please try again.'))
            .mockResolvedValueOnce(snap(SUBS))
        await mountPage()
        await click(buttonByText('Retry'))
        await flush()
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(2)
        expect(q('[data-testid="subscriptions-load-error"]')).toBeNull()
        expect(text()).toContain('Fast Movers')
    })

    it('a failed refresh keeps the last good data, warns it may be stale, and does not claim a clean ops queue', async () => {
        h.getAdminSubscriptions
            .mockResolvedValueOnce(snap(SUBS, [REFUSED]))
            .mockRejectedValueOnce(new UserFacingError('Unable to load subscriptions right now. Please try again.'))
        await mountPage()
        await click(refreshButton())
        await flush()
        expect(q('[data-testid="subscriptions-stale-error"]')).not.toBeNull()
        expect(text()).toContain('Fast Movers')
        expect(text()).not.toContain('Nothing needs attention')
        expect(text()).toContain('Not confirmed')
    })

    it('a raw transport error falls back to the page message and leaks nothing', async () => {
        h.getAdminSubscriptions.mockRejectedValue(new Error('postgres JWT secret leaked in stack'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledWith('Failed to load subscriptions')
        expect(text()).not.toContain('postgres')
    })

    it('Refresh is the retry affordance after an error', async () => {
        h.getAdminSubscriptions
            .mockRejectedValueOnce(new UserFacingError('Unable to load subscriptions right now. Please try again.'))
            .mockResolvedValueOnce(snap(SUBS))
        await mountPage()
        expect(q('[data-testid="subscriptions-load-error"]')).not.toBeNull()
        await click(buttonByText('Retry'))
        await flush()
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(2)
        expect(text()).toContain('Fast Movers')
    })

    it('empty state: zero subscriptions renders the empty message and a calm ops list', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([]))
        await mountPage()
        expect(text()).toContain('No subscriptions yet')
        expect(text()).toContain('Nothing needs attention.')
    })

    it('lists by agency (not by user) with plan, tier and dates', async () => {
        await mountPage()
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Fast Movers')
        expect(text()).toContain('ops@fastmovers.test')
        expect(text()).toContain('Pro Monthly')
        expect(text()).toContain('Meena Logistics')
        expect(text()).toContain('growth')
        expect(text()).toContain(fmt(TRIAL.trial_end as string))
        expect(text()).toContain(fmt(ACTIVE.first_paid_at as string))
        expect(text()).toContain(fmt(ACTIVE.current_period_end))
        const headers = Array.from((container as HTMLElement).querySelectorAll('thead th')).map((th) => th.textContent)
        expect(headers).toEqual(['Agency', 'Plan', 'Status', 'Trial End', 'Period End', 'Grace End', 'First Paid', 'Created', 'Action'])
    })

    it('summary cards count trial, past_due and grace, expired and cancelled', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([ACTIVE, TRIAL, GRACE, PAST_DUE, EXPIRED, CANCELLED]))
        await mountPage()
        expect(cardTexts()).toEqual(['Total6', 'Active1', 'Trial1', 'Past due / Grace2', 'Expired / Cancelled2'])
    })

    it('shows all six statuses with their labels and the grace end date', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([ACTIVE, TRIAL, PAST_DUE, GRACE, EXPIRED, CANCELLED]))
        await mountPage()
        const badges = Array.from((container as HTMLElement).querySelectorAll('tbody tr')).map(
            (tr) => tr.querySelector('td:nth-child(3)')?.textContent || '',
        )
        expect(badges).toEqual(['Active', 'Trial', 'Past due', 'Grace', 'Expired', 'Cancelled'])
        expect(text()).toContain(fmt(GRACE.grace_end))
    })

    it('a planless, purchaserless row falls back to Unknown plan', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([CANCELLED]))
        await mountPage()
        expect(text()).toContain('Unknown plan')
        expect(text()).toContain('Refunded Co')
    })

    it('an unmapped status renders its raw label and counts only toward Total', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([{ ...ACTIVE, id: 'sub-x', status: 'paused' }]))
        await mountPage()
        expect(text()).toContain('paused')
        expect(cardTexts()).toEqual(['Total1', 'Active0', 'Trial0', 'Past due / Grace0', 'Expired / Cancelled0'])
    })

    it('filters by status and by agency text, with a no-match state', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([ACTIVE, TRIAL, GRACE, EXPIRED]))
        await mountPage()
        await setSelect(q('#sub-status-filter') as HTMLSelectElement, 'grace')
        expect(text()).toContain('Grace Carriers')
        expect(text()).not.toContain('Fast Movers')
        await setSelect(q('#sub-status-filter') as HTMLSelectElement, 'all')
        await setInput(q('#sub-agency-search') as HTMLInputElement, 'meena')
        expect(text()).toContain('Meena Logistics')
        expect(text()).not.toContain('Ravi Transport')
        await setInput(q('#sub-agency-search') as HTMLInputElement, 'zzz-nothing')
        expect(text()).toContain('No subscriptions match these filters')
    })

    it('Ops attention lists captured-but-refused payments and refund exceptions by agency', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap(SUBS, [REFUSED], [REFUND_EXC]))
        await mountPage()
        const refused = q('[data-testid="refused-payment"]')?.textContent || ''
        expect(refused).toContain('Fast Movers')
        expect(refused).toContain('AMOUNT_MISMATCH')
        expect(refused).toContain('pay_CAPTURED')
        expect(refused).toContain('1,180.00')
        const exc = q('[data-testid="refund-exception"]')?.textContent || ''
        expect(exc).toContain('Refunded Co')
        expect(exc).toContain('rfnd_1')
        expect(exc).toContain('subscription_not_found')
        expect(exc).toContain('590.00')
        expect(q('[data-testid="ops-attention"]')?.textContent).toContain('(2)')
    })

    it('offers the one legal action, Reopen after cancellation, only where can_reopen is set', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([ACTIVE, CANCELLED, CANCELLED_OLD]))
        await mountPage()
        const reopenButtons = Array.from((container as HTMLElement).querySelectorAll('tbody button')).filter((b) => /Reopen after cancellation/.test(b.textContent || ''))
        expect(reopenButtons).toHaveLength(1)
    })

    it('has no free-form status control: no row inputs, no edit/cancel/plan-change buttons', async () => {
        await mountPage()
        expect((container as HTMLElement).querySelectorAll('tbody select, tbody input')).toHaveLength(0)
        const labels = Array.from((container as HTMLElement).querySelectorAll('button')).map((b) => b.textContent || '')
        expect(labels.filter((l) => /(edit|change|force|activate|extend|cancel subscription)/i.test(l))).toEqual([])
        // the only select is the read-only list filter
        expect((container as HTMLElement).querySelectorAll('select')).toHaveLength(1)
    })

    it('Reopen needs a confirm step; Cancel closes it without calling the service', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([CANCELLED]))
        await mountPage()
        await click(buttonByText('Reopen after cancellation'))
        expect(q('[data-testid="reopen-confirm"]')).not.toBeNull()
        expect(h.reopenSubscription).not.toHaveBeenCalled()
        await click(buttonByText('Cancel'))
        expect(q('[data-testid="reopen-confirm"]')).toBeNull()
        expect(h.reopenSubscription).not.toHaveBeenCalled()
    })

    it('confirming Reopen calls the service with the agency id, toasts and refetches', async () => {
        h.getAdminSubscriptions
            .mockResolvedValueOnce(snap([CANCELLED]))
            .mockResolvedValueOnce(snap([{ ...CANCELLED, can_reopen: false }]))
        await mountPage()
        await click(buttonByText('Reopen after cancellation'))
        await click(buttonByText('Confirm reopen'))
        await flush()
        expect(h.reopenSubscription).toHaveBeenCalledTimes(1)
        expect(h.reopenSubscription).toHaveBeenCalledWith('ag-4')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(2)
        expect(q('[data-testid="reopen-confirm"]')).toBeNull()
    })

    it('a refused Reopen shows the server message, keeps the confirm open and does not refetch', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap([CANCELLED]))
        h.reopenSubscription.mockRejectedValue(new UserFacingError('The agency already has a live subscription.'))
        await mountPage()
        await click(buttonByText('Reopen after cancellation'))
        await click(buttonByText('Confirm reopen'))
        await flush()
        expect(h.toastError).toHaveBeenCalledWith('The agency already has a live subscription.')
        expect(h.toastSuccess).not.toHaveBeenCalled()
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(1)
        expect(q('[data-testid="reopen-confirm"]')).not.toBeNull()
    })

    it('Refresh replaces the list with the latest snapshot', async () => {
        h.getAdminSubscriptions.mockResolvedValueOnce(snap(SUBS)).mockResolvedValueOnce(snap([TRIAL]))
        await mountPage()
        expect(cardTexts()[0]).toBe('Total4')
        await click(refreshButton())
        await flush()
        expect(cardTexts()).toEqual(['Total1', 'Active0', 'Trial1', 'Past due / Grace0', 'Expired / Cancelled0'])
        expect(text()).not.toContain('Fast Movers')
    })

    it('the back control navigates to /admin', async () => {
        await mountPage()
        await click(q('button[aria-label="Back to admin dashboard"]') as HTMLButtonElement)
        expect(text()).toContain('ADMIN-HOME-MARKER')
    })

    it('accessibility hooks: named header controls, heading, labelled filters, scoped column headers', async () => {
        await mountPage()
        expect(q('button[aria-label="Back to admin dashboard"]')).not.toBeNull()
        expect(refreshButton()).not.toBeNull()
        expect(q('h1')?.textContent).toBe('Subscriptions')
        expect(q('label[for="sub-status-filter"]')).not.toBeNull()
        expect(q('label[for="sub-agency-search"]')).not.toBeNull()
        expect((container as HTMLElement).querySelectorAll('thead th[scope="col"]').length).toBe(9)
    })
})

// The main subscriptions list is not capped by admin-portal-subscriptions (no limit on that query), so
// the notice belongs only to the two ops-attention lists, which the function caps at 200 rows each.
const refusedRows = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ ...REFUSED, id: `ref-cap-${i}` }))
const refundRows = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ ...REFUND_EXC, id: `rfx-cap-${i}`, refund_id: `rfnd_cap_${i}` }))

describe('AdminSubscriptionsPage ops attention cap notice', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.currentUser = { ...CURRENT_ADMIN }
    })

    it('shows no cap notice when both ops lists are under 200 rows', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap(SUBS, refusedRows(199), refundRows(199)))
        await mountPage()
        expect(q('[data-testid="ops-attention"]')).not.toBeNull()
        expect(q('[data-testid="refused-payments-cap-notice"]')).toBeNull()
        expect(q('[data-testid="refund-exceptions-cap-notice"]')).toBeNull()
    })

    it('shows the status notice under the refused payments list when it reaches 200 rows', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap(SUBS, refusedRows(200), []))
        await mountPage()
        const notice = q('[data-testid="refused-payments-cap-notice"]')
        expect(notice?.getAttribute('role')).toBe('status')
        expect(notice?.textContent).toBe('Showing the first 200 only.')
        expect(q('[data-testid="refund-exceptions-cap-notice"]')).toBeNull()
    })

    it('shows the status notice under the refund exceptions list when it reaches 200 rows', async () => {
        h.getAdminSubscriptions.mockResolvedValue(snap(SUBS, [], refundRows(200)))
        await mountPage()
        const notice = q('[data-testid="refund-exceptions-cap-notice"]')
        expect(notice?.getAttribute('role')).toBe('status')
        expect(notice?.textContent).toBe('Showing the first 200 only.')
        expect(q('[data-testid="refused-payments-cap-notice"]')).toBeNull()
    })

    it('shows no cap notice for the main subscriptions list, even with many subscriptions', async () => {
        const many = Array.from({ length: 200 }, (_, i) => ({ ...CANCELLED, id: `sub-many-${i}` }))
        h.getAdminSubscriptions.mockResolvedValue(snap(many))
        await mountPage()
        expect(q('[data-testid="refused-payments-cap-notice"]')).toBeNull()
        expect(q('[data-testid="refund-exceptions-cap-notice"]')).toBeNull()
        expect(q('[role="status"][data-testid$="cap-notice"]')).toBeNull()
    })

    it('shows no cap notice while loading', async () => {
        h.getAdminSubscriptions.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="refused-payments-cap-notice"]')).toBeNull()
    })

    it('shows no cap notice in the error state', async () => {
        h.getAdminSubscriptions.mockRejectedValue(new UserFacingError('Unable to load subscriptions right now. Please try again.'))
        await mountPage()
        expect(q('[data-testid="subscriptions-load-error"]')).not.toBeNull()
        expect(q('[data-testid="refused-payments-cap-notice"]')).toBeNull()
    })
})
