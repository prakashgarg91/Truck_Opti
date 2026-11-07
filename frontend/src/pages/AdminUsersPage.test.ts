import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression suite for the admin user list: AdminUsersPage over the
// adminSupabaseApi surface it actually touches (getAdminUsers / banUser /
// unbanUser / deleteUser). Pins the CURRENT behaviour — the admin-gated
// fetch, search + role filtering, the three moderation dialogs with their
// copy, the refetch-after-disable/enable and the local removal after delete.
//
// FINDING (a11y): the moderation dialog overlay (the fixed inset-0 div) has
// no role="dialog", aria-modal, labelled title or focus containment, unlike
// AgencyTeamPage's dialogs. Only its close control carries an aria-label.
// These tests pin only what exists; they do not bless the gap.
// FINDING (a11y): the loading region has no role="status"/aria-busy
// (AgencyTeamPage exposes [data-testid="team-loading"]); loading is signalled
// only by the disabled Refresh control and the animate-spin icons.
// FINDING (robustness): for a signed-in non-admin the page stays in the
// initial loading state forever — `loading` starts true and only
// fetchUsers() clears it, while the effect skips non-admin roles. Masked
// today by the admin-only route guard in App.tsx.
// FINDING (cosmetic): every row renders a Mail + green CheckCircle pair
// unconditionally; there is no verification data behind the checkmark, and
// updated_at / banned_until from the API are never surfaced.

const h = vi.hoisted(() => ({
    getAdminUsers: vi.fn(),
    deleteUser: vi.fn(),
    banUser: vi.fn(),
    unbanUser: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    currentUser: null as { id: string; email: string; name: string; role: string } | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/adminSupabaseApi', () => ({
    adminSupabaseApi: {
        getAdminUsers: h.getAdminUsers,
        deleteUser: h.deleteUser,
        banUser: h.banUser,
        unbanUser: h.unbanUser,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.currentUser }),
}))

import AdminUsersPage from './AdminUsersPage'
import { UserFacingError } from '../utils/userFacingError'

// Real adminSupabaseApi AdminUser shapes (see services/adminSupabaseApi.ts).
const ADMIN_ROW = {
    id: 'u-admin',
    email: 'root@truckopti.test',
    role: 'admin',
    name: 'Root Admin',
    phone: '+91 90000 00001',
    created_at: '2026-01-15T09:30:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    account_status: 'active',
}
const AGENCY_ROW = {
    id: 'u-agency',
    email: 'ops@fastmovers.test',
    role: 'agency',
    name: 'Fast Movers',
    phone: '+91 98765 43210',
    created_at: '2026-03-02T12:00:00Z',
    updated_at: '2026-03-02T12:00:00Z',
    account_status: 'active',
}
const CUSTOMER_ROW = {
    id: 'u-cust',
    email: 'meena@example.com',
    role: 'customer',
    name: 'Meena Rao',
    created_at: '2026-04-10T08:00:00Z',
    updated_at: '2026-06-15T10:00:00Z',
    account_status: 'disabled',
    banned_until: '2026-12-31T23:59:59Z',
}
const DRIVER_ROW = {
    id: 'u-driver',
    email: 'ravi.driver@example.com',
    role: 'driver',
    created_at: '2026-05-20T18:45:00Z',
    updated_at: '2026-05-20T18:45:00Z',
    account_status: 'active',
}
const OPS_ROW = {
    id: 'u-ops',
    email: 'zen@example.com',
    role: 'ops',
    name: 'Zen K',
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
    account_status: 'active',
}

const USERS = [ADMIN_ROW, AGENCY_ROW, CUSTOMER_ROW, DRIVER_ROW, OPS_ROW]

const CURRENT_ADMIN = { id: 'me-admin', email: 'boss@truckopti.test', name: 'Boss', role: 'admin' }

// The page formats created_at with toLocaleDateString('en-IN'); computing the
// expectation through the same call keeps the assertion deterministic in any
// host timezone while still pinning the format wiring.
const JOINED_AGENCY = new Date(AGENCY_ROW.created_at).toLocaleDateString('en-IN')

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
                { initialEntries: ['/admin/users'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/admin/users', element: createElement(AdminUsersPage) }),
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
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))
const refreshButton = () => q('button[aria-label="Refresh users"]') as HTMLButtonElement

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

async function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
    await act(async () => {
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
}

describe('AdminUsersPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Pinned clock (auto-advancing) so date rendering stays deterministic;
        // restored in afterEach.
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
        h.currentUser = { ...CURRENT_ADMIN }
        h.getAdminUsers.mockResolvedValue(USERS)
    })

    it('never fetches users for a non-admin session (permission gate)', async () => {
        h.currentUser = { ...CURRENT_ADMIN, role: 'agency' }
        await mountPage()
        expect(h.getAdminUsers).not.toHaveBeenCalled()
        expect(text()).toContain('0 total users')
        // loading never completed, so Refresh stays disabled
        expect(refreshButton().disabled).toBe(true)
    })

    it('shows the loading spinner and disables Refresh while the first fetch is in flight', async () => {
        h.getAdminUsers.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(refreshButton().disabled).toBe(true)
        expect((container as HTMLElement).querySelectorAll('.animate-spin').length).toBeGreaterThan(0)
        // loading renders the spinner, not the empty-list message
        expect(text()).not.toContain('No users found')
    })

    it('a rejected list call surfaces its user-facing message via toast and shows the empty list', async () => {
        h.getAdminUsers.mockRejectedValue(new UserFacingError('Unable to load users right now. Please try again.'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Unable to load users right now. Please try again.')
        expect(text()).toContain('No users found')
    })

    it('a raw transport error falls back to the page message and leaks nothing', async () => {
        h.getAdminUsers.mockRejectedValue(new Error('postgres JWT secret leaked in stack'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledWith('Failed to load users')
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(text()).not.toContain('postgres')
    })

    it('Refresh retries the fetch and recovers the list after an error', async () => {
        h.getAdminUsers
            .mockRejectedValueOnce(new UserFacingError('Unable to load users right now. Please try again.'))
            .mockResolvedValueOnce(USERS)
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(refreshButton().disabled).toBe(false)
        await click(refreshButton())
        expect(h.getAdminUsers).toHaveBeenCalledTimes(2)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(text()).toContain('meena@example.com')
    })

    it('empty state: zero users renders the no-users message and a zero counter', async () => {
        h.getAdminUsers.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No users found')
        expect(text()).toContain('0 total users')
    })

    it('renders the real user shapes: names, email fallback, phones, badges and the joined date', async () => {
        await mountPage()
        expect(text()).toContain('5 total users')
        expect(text()).toContain('Root Admin')
        expect(text()).toContain('root@truckopti.test')
        expect(text()).toContain('Fast Movers')
        expect(text()).toContain('+91 98765 43210')
        expect(text()).toContain('Meena Rao')
        expect(text()).toContain('Disabled')
        // driver row has no name -> email local part is displayed
        expect(text()).toContain('ravi.driver')
        expect(text()).toContain('ravi.driver@example.com')
        expect(text()).toContain('Joined')
        expect(text()).toContain(JOINED_AGENCY)
        expect(text()).toContain('2026')
        // four active rows, one disabled row
        expect((text().match(/Active/g) || []).length).toBe(4)
        // an unmapped role renders raw text instead of a label
        expect(text()).toContain('Zen K')
        expect(text()).toContain('ops')
    })

    it('role filter chips are derived from the data and filter the list', async () => {
        await mountPage()
        const labels = Array.from((container as HTMLElement).querySelectorAll('button')).map((b) => b.textContent || '')
        for (const label of ['All', 'Admin', 'Agency', 'Customer', 'Driver', 'ops']) {
            expect(labels).toContain(label)
        }
        await click(buttons(/^Customer$/)[0])
        expect(text()).toContain('meena@example.com')
        expect(text()).not.toContain('ops@fastmovers.test')
        expect(text()).not.toContain('root@truckopti.test')
        await click(buttons(/^All$/)[0])
        expect(text()).toContain('ops@fastmovers.test')
    })

    it('search matches email, name and role case-insensitively', async () => {
        await mountPage()
        const search = q('input[type="text"]') as HTMLInputElement
        await type(search, 'MEENA')
        expect(text()).toContain('meena@example.com')
        expect(text()).not.toContain('Fast Movers')
        expect(text()).not.toContain('root@truckopti.test')
        await type(search, 'driver')
        expect(text()).toContain('ravi.driver@example.com')
        expect(text()).not.toContain('meena@example.com')
    })

    it('search and role filter combine', async () => {
        await mountPage()
        await type(q('input[type="text"]') as HTMLInputElement, 'example.com')
        expect(text()).toContain('meena@example.com')
        expect(text()).not.toContain('root@truckopti.test')
        await click(buttons(/^Driver$/)[0])
        expect(text()).toContain('ravi.driver@example.com')
        expect(text()).not.toContain('meena@example.com')
    })

    it('a search with no matches shows the empty-list message without refetching', async () => {
        await mountPage()
        await type(q('input[type="text"]') as HTMLInputElement, 'zzz-no-match')
        expect(text()).toContain('No users found')
        expect(h.getAdminUsers).toHaveBeenCalledTimes(1)
    })

    it('admin rows carry no moderation actions; every other row does', async () => {
        await mountPage()
        expect(q('button[aria-label="Delete root@truckopti.test"]')).toBeNull()
        expect(buttons(/^Disable$/)).toHaveLength(3) // agency, driver, ops (active non-admins)
        expect(buttons(/^Enable$/)).toHaveLength(1) // disabled customer
        for (const email of ['ops@fastmovers.test', 'meena@example.com', 'ravi.driver@example.com', 'zen@example.com']) {
            expect(q(`button[aria-label="Delete ${email}"]`)).not.toBeNull()
        }
    })

    it('disable: dialog names the account, bans by id, refetches and toasts', async () => {
        h.banUser.mockResolvedValue(undefined)
        h.getAdminUsers
            .mockResolvedValueOnce(USERS)
            .mockResolvedValueOnce(USERS.map((u) => (u.id === 'u-agency' ? { ...u, account_status: 'disabled' } : u)))
        await mountPage()
        await click(buttons(/^Disable$/)[0]) // first active non-admin row: the agency
        expect(text()).toContain('Disable Account')
        expect(text()).toContain('This bans sign-in for "ops@fastmovers.test"')
        expect(h.banUser).not.toHaveBeenCalled()
        await click(buttons(/Disable account/)[0])
        await flush()
        expect(h.banUser).toHaveBeenCalledTimes(1)
        expect(h.banUser).toHaveBeenCalledWith('u-agency')
        expect(h.getAdminUsers).toHaveBeenCalledTimes(2)
        expect(h.toastSuccess).toHaveBeenCalledWith('User account disabled')
        expect(text()).not.toContain('Disable Account')
        // refetched snapshot: the agency is now disabled, so it offers Enable
        expect(buttons(/^Enable$/)).toHaveLength(2)
    })

    it('enable: dialog lifts the ban, unbans by id, refetches and toasts', async () => {
        h.unbanUser.mockResolvedValue(undefined)
        h.getAdminUsers
            .mockResolvedValueOnce(USERS)
            .mockResolvedValueOnce(USERS.map((u) => (u.id === 'u-cust' ? { ...u, account_status: 'active' } : u)))
        await mountPage()
        await click(buttons(/^Enable$/)[0])
        expect(text()).toContain('Re-enable Account')
        expect(text()).toContain('This lifts the auth ban for "meena@example.com"')
        expect(h.unbanUser).not.toHaveBeenCalled()
        await click(buttons(/Re-enable account/)[0])
        await flush()
        expect(h.unbanUser).toHaveBeenCalledTimes(1)
        expect(h.unbanUser).toHaveBeenCalledWith('u-cust')
        expect(h.getAdminUsers).toHaveBeenCalledTimes(2)
        expect(h.toastSuccess).toHaveBeenCalledWith('User account re-enabled')
        expect(text()).not.toContain('Re-enable Account')
        expect(buttons(/^Enable$/)).toHaveLength(0)
    })

    it('delete: warns it cannot be undone, deletes by id, removes the row locally without refetching', async () => {
        h.deleteUser.mockResolvedValue(undefined)
        await mountPage()
        await click(q('button[aria-label="Delete ravi.driver@example.com"]') as HTMLButtonElement)
        expect(text()).toContain('Delete Account')
        expect(text()).toContain('This permanently deletes the auth account for "ravi.driver@example.com"')
        expect(text()).toContain('This cannot be undone.')
        expect(h.deleteUser).not.toHaveBeenCalled()
        await click(buttons(/Delete account/)[0])
        await flush()
        expect(h.deleteUser).toHaveBeenCalledTimes(1)
        expect(h.deleteUser).toHaveBeenCalledWith('u-driver')
        expect(h.toastSuccess).toHaveBeenCalledWith('User account deleted')
        // removal is local state only: no second list call
        expect(h.getAdminUsers).toHaveBeenCalledTimes(1)
        expect(text()).not.toContain('ravi.driver@example.com')
        expect(text()).toContain('4 total users')
    })

    it('Cancel and the Close control dismiss the dialog without calling the API', async () => {
        await mountPage()
        await click(buttons(/^Disable$/)[0])
        expect(text()).toContain('Disable Account')
        await click(buttons(/^Cancel$/)[0])
        expect(text()).not.toContain('Disable Account')
        expect(h.banUser).not.toHaveBeenCalled()
        await click(q('button[aria-label="Delete zen@example.com"]') as HTMLButtonElement)
        expect(text()).toContain('Delete Account')
        await click(q('button[aria-label="Close action dialog"]') as HTMLButtonElement)
        expect(text()).not.toContain('Delete Account')
        expect(h.deleteUser).not.toHaveBeenCalled()
    })

    it('a failed delete keeps the dialog open, keeps the row, and surfaces the message', async () => {
        h.deleteUser.mockRejectedValue(new UserFacingError('Failed to delete the user account'))
        await mountPage()
        await click(q('button[aria-label="Delete zen@example.com"]') as HTMLButtonElement)
        await click(buttons(/Delete account/)[0])
        await flush()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to delete the user account')
        expect(text()).toContain('Delete Account')
        expect(text()).toContain('zen@example.com')
        expect(h.getAdminUsers).toHaveBeenCalledTimes(1)
    })

    it('a raw disable error maps to the disable fallback message and keeps the dialog open', async () => {
        h.banUser.mockRejectedValue(new Error('Functions/netlify 502'))
        await mountPage()
        await click(buttons(/^Disable$/)[0])
        await click(buttons(/Disable account/)[0])
        await flush()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to disable the user account')
        expect(text()).toContain('Disable Account')
        expect(h.getAdminUsers).toHaveBeenCalledTimes(1)
    })

    it('while submitting: confirm shows Working..., Cancel is disabled and Close is blocked', async () => {
        let resolveBan!: () => void
        h.banUser.mockReturnValueOnce(new Promise<void>((resolve) => {
            resolveBan = resolve
        }))
        await mountPage()
        await click(buttons(/^Disable$/)[0])
        await click(buttons(/Disable account/)[0])
        expect(text()).toContain('Working...')
        expect(buttons(/^Cancel$/)[0].disabled).toBe(true)
        // the X control is a no-op while the action is in flight
        await click(q('button[aria-label="Close action dialog"]') as HTMLButtonElement)
        expect(text()).toContain('Disable Account')
        await act(async () => {
            resolveBan()
            await new Promise((r) => setTimeout(r, 0))
        })
        await flush()
        expect(h.toastSuccess).toHaveBeenCalledWith('User account disabled')
        expect(text()).not.toContain('Disable Account')
        expect(text()).not.toContain('Working...')
    })

    it('Refresh replaces the list with the latest snapshot', async () => {
        h.getAdminUsers.mockResolvedValueOnce(USERS).mockResolvedValueOnce([AGENCY_ROW, DRIVER_ROW])
        await mountPage()
        expect(text()).toContain('5 total users')
        await click(refreshButton())
        expect(h.getAdminUsers).toHaveBeenCalledTimes(2)
        expect(text()).toContain('2 total users')
        expect(text()).not.toContain('root@truckopti.test')
        expect(text()).toContain('ops@fastmovers.test')
    })

    it('the back control navigates to /admin', async () => {
        await mountPage()
        await click(q('button[aria-label="Back to admin dashboard"]') as HTMLButtonElement)
        expect(text()).toContain('ADMIN-HOME-MARKER')
    })

    it('exposes accessible names for header controls, search and the dialog close', async () => {
        await mountPage()
        expect(q('button[aria-label="Back to admin dashboard"]')).not.toBeNull()
        expect(q('button[aria-label="Refresh users"]')).not.toBeNull()
        expect((q('input[type="text"]') as HTMLInputElement).placeholder).toBe('Search users...')
        expect(q('button[aria-label="Delete meena@example.com"]')).not.toBeNull()
        await click(buttons(/^Disable$/)[0])
        expect(q('button[aria-label="Close action dialog"]')).not.toBeNull()
    })
})
