import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression suite for the admin subscriptions list: AdminSubscriptionsPage
// over the single adminSupabaseApi call it makes (getAdminSubscriptions).
// Pins the CURRENT behaviour — the admin-gated fetch, loading/empty/error
// states, the summary-card derivation, per-row user/plan/status/date
// rendering with its fallbacks, and the Refresh/back header actions.
//
// FINDING (robustness): for a signed-in non-admin (or a signed-out session)
// the page stays in the initial loading state forever — `loading` starts
// true and only fetchSubscriptions() clears it, while the effect skips
// non-admin roles. Only the spinner renders; no header, no message. Masked
// today by the admin-only route guard in App.tsx. The gate test below pins
// the no-fetch behaviour and the spinner-only render; it does not bless the
// stuck state.
// FINDING (a11y): the loading region has no role="status"/aria-busy
// (AgencyTeamPage exposes [data-testid="team-loading"]) — it is only a
// centered animate-spin icon, and the table's <th> cells carry no scope.
// FINDING (semantics): the "Expired" summary card counts cancelled
// subscriptions too (status === 'expired' || 'cancelled') even though the
// table shows them as distinct badges; pinned as current behaviour.

const h = vi.hoisted(() => ({
    getAdminSubscriptions: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    currentUser: null as { id: string; email: string; name: string; role: string } | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/adminSupabaseApi', () => ({
    adminSupabaseApi: {
        getAdminSubscriptions: h.getAdminSubscriptions,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.currentUser }),
}))

import AdminSubscriptionsPage from './AdminSubscriptionsPage'
import { UserFacingError } from '../utils/userFacingError'

// Real adminSupabaseApi AdminSubscription shapes (see services/adminSupabaseApi.ts).
const ACTIVE = {
    id: 'sub-1',
    user_id: 'u-agency',
    status: 'active',
    billing_cycle: 'monthly',
    current_period_start: '2026-11-01T00:00:00Z',
    current_period_end: '2026-12-01T00:00:00Z',
    trial_end: null,
    cancel_at_period_end: false,
    created_at: '2026-09-15T09:30:00Z',
    user: { name: 'Fast Movers', email: 'ops@fastmovers.test' },
    plan: { id: 'plan-pro', name: 'Pro Monthly', tier: 'pro' },
}
const TRIAL = {
    id: 'sub-2',
    user_id: 'u-cust',
    status: 'trial',
    billing_cycle: 'monthly',
    current_period_start: '2026-11-05T00:00:00Z',
    current_period_end: '2026-12-05T00:00:00Z',
    trial_end: '2026-11-12T00:00:00Z',
    cancel_at_period_end: false,
    created_at: '2026-10-05T10:15:00Z',
    user: { name: 'Meena Rao', email: 'meena@example.com' },
    plan: { id: 'plan-growth', name: 'Growth', tier: 'growth' },
}
const EXPIRED = {
    id: 'sub-3',
    user_id: 'u-x1',
    status: 'expired',
    billing_cycle: 'yearly',
    current_period_start: '2025-01-01T00:00:00Z',
    current_period_end: '2026-01-01T00:00:00Z',
    trial_end: '2026-01-01T00:00:00Z',
    cancel_at_period_end: false,
    created_at: '2025-01-01T00:00:00Z',
    user: { name: 'Ravi Kumar', email: 'ravi@example.com' },
    plan: { id: 'plan-basic', name: 'Basic', tier: 'basic' },
}
const CANCELLED = {
    id: 'sub-4',
    user_id: 'u-x2',
    status: 'cancelled',
    billing_cycle: 'monthly',
    current_period_start: '2026-06-01T00:00:00Z',
    current_period_end: '2026-07-01T00:00:00Z',
    trial_end: null,
    cancel_at_period_end: true,
    created_at: '2026-02-10T00:00:00Z',
    user: null,
    plan: null,
}
const NO_NAME = {
    id: 'sub-5',
    user_id: 'u-x3',
    status: 'active',
    billing_cycle: 'monthly',
    current_period_start: '2026-11-05T00:00:00Z',
    current_period_end: '2026-12-05T00:00:00Z',
    trial_end: '2026-11-20T00:00:00Z',
    cancel_at_period_end: false,
    created_at: '2026-11-05T00:00:00Z',
    user: { name: '', email: 'noname@example.com' },
    plan: { id: 'plan-starter', name: 'Starter', tier: 'starter' },
}
// The AdminSubscription status union has only the four mapped values, but
// getStatusBadge has a raw-label fallback branch; pin it with an unmapped status.
const PAUSED = { ...ACTIVE, id: 'sub-paused', status: 'paused' }

const SUBS = [ACTIVE, TRIAL, EXPIRED, CANCELLED]
const CURRENT_ADMIN = { id: 'me-admin', email: 'boss@truckopti.test', name: 'Boss', role: 'admin' }

// The page formats dates with toLocaleDateString('en-IN', { day: '2-digit',
// month: 'short', year: 'numeric' }); computing the expectation through the
// same call keeps the assertion deterministic in any host timezone while
// still pinning the format wiring.
const fmt = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const TRIAL_END_TEXT = fmt(TRIAL.trial_end as string)
const CREATED_ACTIVE_TEXT = fmt(ACTIVE.created_at)

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

describe('AdminSubscriptionsPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Pinned clock (auto-advancing) so date rendering stays deterministic;
        // restored in afterEach.
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
        h.currentUser = { ...CURRENT_ADMIN }
        h.getAdminSubscriptions.mockResolvedValue(SUBS)
    })

    it('never fetches subscriptions for a non-admin session (permission gate)', async () => {
        h.currentUser = { ...CURRENT_ADMIN, role: 'agency' }
        await mountPage()
        expect(h.getAdminSubscriptions).not.toHaveBeenCalled()
        // current behaviour: the initial loading state persists (see FINDING above)
        expect((container as HTMLElement).querySelectorAll('.animate-spin').length).toBeGreaterThan(0)
        expect(q('h1')).toBeNull()
    })

    it('loading state: centered spinner while the first fetch is in flight', async () => {
        h.getAdminSubscriptions.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect((container as HTMLElement).querySelectorAll('.animate-spin').length).toBeGreaterThan(0)
        // the early return hides the whole app shell, including Refresh
        expect(refreshButton()).toBeNull()
        expect(q('.grid.grid-cols-2')).toBeNull()
        expect(text()).not.toContain('No subscriptions yet')
    })

    it('a rejected list call surfaces its user-facing message via toast and falls back to the empty list', async () => {
        h.getAdminSubscriptions.mockRejectedValue(new UserFacingError('Unable to load subscriptions right now. Please try again.'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Unable to load subscriptions right now. Please try again.')
        expect(text()).toContain('No subscriptions yet')
        expect(cardTexts()).toEqual(['Total0', 'Active0', 'Trial0', 'Expired0'])
    })

    it('a raw transport error falls back to the page message and leaks nothing', async () => {
        h.getAdminSubscriptions.mockRejectedValue(new Error('postgres JWT secret leaked in stack'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load subscriptions')
        expect(text()).not.toContain('postgres')
    })

    it('Refresh is the retry affordance: it refetches and recovers the list after an error', async () => {
        h.getAdminSubscriptions
            .mockRejectedValueOnce(new UserFacingError('Unable to load subscriptions right now. Please try again.'))
            .mockResolvedValueOnce(SUBS)
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(text()).toContain('No subscriptions yet')
        await click(refreshButton())
        await flush()
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(2)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Fast Movers')
    })

    it('empty state: zero subscriptions renders the empty message with zeroed cards', async () => {
        h.getAdminSubscriptions.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No subscriptions yet')
        expect(cardTexts()).toEqual(['Total0', 'Active0', 'Trial0', 'Expired0'])
    })

    it('happy path: fetches once and renders real shapes — users, plan names, tiers and dates', async () => {
        await mountPage()
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Fast Movers')
        expect(text()).toContain('ops@fastmovers.test')
        expect(text()).toContain('Pro Monthly')
        expect(text()).toContain('Meena Rao')
        expect(text()).toContain('meena@example.com')
        expect(text()).toContain('Growth')
        // tier is rendered as-is (uppercased only by CSS)
        expect(text()).toContain('growth')
        expect(text()).toContain(TRIAL_END_TEXT)
        expect(text()).toContain(CREATED_ACTIVE_TEXT)
    })

    it('summary cards derive from the statuses (cancelled counts toward Expired)', async () => {
        await mountPage()
        // current behaviour: the Expired card also counts cancelled rows
        expect(cardTexts()).toEqual(['Total4', 'Active1', 'Trial1', 'Expired2'])
    })

    it('user cell falls back to email when the name is blank and to em-dashes when user is null', async () => {
        h.getAdminSubscriptions.mockResolvedValue([NO_NAME, CANCELLED])
        await mountPage()
        // blank name renders the email on both the primary and secondary lines
        expect((text().match(/noname@example\.com/g) || []).length).toBe(2)
        // null user renders em-dashes twice (name line + email line), plus a
        // third for its missing trial_end
        expect((text().match(/—/g) || []).length).toBe(3)
    })

    it('plan cell: a named plan shows name and tier; a null plan shows Unknown plan with no tier', async () => {
        h.getAdminSubscriptions.mockResolvedValue([ACTIVE, CANCELLED])
        await mountPage()
        expect(text()).toContain('Pro Monthly')
        expect(text()).toContain('pro')
        expect(text()).toContain('Unknown plan')
        // no tier line is rendered for the planless row
        expect(text()).not.toContain('basic')
    })

    it('trial end column: formatted when present, em-dash when null', async () => {
        h.getAdminSubscriptions.mockResolvedValue([ACTIVE, TRIAL])
        await mountPage()
        expect(text()).toContain(TRIAL_END_TEXT)
        // ACTIVE has a user and a plan, so the only em-dash on the page is its
        // missing trial_end cell
        expect((text().match(/—/g) || []).length).toBe(1)
    })

    it('an unmapped status renders its raw label and counts only toward Total', async () => {
        h.getAdminSubscriptions.mockResolvedValue([PAUSED])
        await mountPage()
        expect(text()).toContain('paused')
        expect(cardTexts()).toEqual(['Total1', 'Active0', 'Trial0', 'Expired0'])
    })

    it('status badges render the four mapped labels in row order', async () => {
        await mountPage()
        const badges = Array.from((container as HTMLElement).querySelectorAll('tbody tr')).map(
            (tr) => tr.querySelector('td:nth-child(3)')?.textContent || '',
        )
        expect(badges).toEqual(['Active', 'Trial', 'Expired', 'Cancelled'])
    })

    it('Refresh replaces the list with the latest snapshot', async () => {
        h.getAdminSubscriptions.mockResolvedValueOnce(SUBS).mockResolvedValueOnce([TRIAL])
        await mountPage()
        expect(cardTexts()[0]).toBe('Total4')
        await click(refreshButton())
        await flush()
        expect(h.getAdminSubscriptions).toHaveBeenCalledTimes(2)
        expect(cardTexts()).toEqual(['Total1', 'Active0', 'Trial1', 'Expired0'])
        expect(text()).not.toContain('Fast Movers')
        expect(text()).toContain('meena@example.com')
    })

    it('the back control navigates to /admin', async () => {
        await mountPage()
        await click(q('button[aria-label="Back to admin dashboard"]') as HTMLButtonElement)
        expect(text()).toContain('ADMIN-HOME-MARKER')
    })

    it('accessibility hooks: named header controls, page heading and table column headers', async () => {
        await mountPage()
        expect(q('button[aria-label="Back to admin dashboard"]')).not.toBeNull()
        expect(refreshButton()).not.toBeNull()
        expect(q('h1')?.textContent).toBe('Subscriptions')
        const headers = Array.from((container as HTMLElement).querySelectorAll('thead th')).map((th) => th.textContent)
        expect(headers).toEqual(['User', 'Plan', 'Status', 'Trial End', 'Created'])
    })
})
