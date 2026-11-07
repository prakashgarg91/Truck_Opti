// Regression suite for the admin agency approval console: AdminAgenciesPage
// over the adminAgenciesApi surface it actually touches (getSnapshot / approve /
// reject / suspend). Pins the CURRENT behaviour — the admin-gated tab snapshot,
// count badges, search narrowing, the reject confirm modal with its validation,
// and each action's exact call arguments, toasts and refetch.
//
// FINDING (robustness): for a signed-in non-admin the page stays in the initial
// loading state forever — `loading` starts true and only fetchSnapshot() clears
// it, while the effect skips non-admin roles. Masked today by the admin-only
// route guard in App.tsx; the non-admin test below pins only the intended part
// (no fetch is issued without the admin role).
// FINDING (a11y): loading has no role="status"/aria-busy marker (it is a bare
// animate-spin svg), and the reject modal overlay has no role="dialog",
// aria-modal or labelled title. These tests pin only the hooks that exist: the
// two aria-labels on the header buttons.

import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    getSnapshot: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    suspend: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    logError: vi.fn(),
    currentUser: null as { id: string; email: string; role: string } | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/adminSupabaseApi', () => ({
    adminAgenciesApi: {
        getSnapshot: h.getSnapshot,
        approve: h.approve,
        reject: h.reject,
        suspend: h.suspend,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.currentUser }),
}))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: h.logError },
}))

import AdminAgenciesPage from './AdminAgenciesPage'
import type { Agency } from '../services/adminSupabaseApi'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

// Real adminSupabaseApi Agency shapes (see services/adminSupabaseApi.ts).
const COUNTS = { pending: 2, approved: 1, rejected: 0, suspended: 3 }

const KAVERI: Agency = {
    id: 'agn-1',
    company_name: 'Kaveri Roadways',
    gstin: '29ABCDE1234F1Z5',
    pan_number: 'ABCDE1234F',
    transport_license: 'KA-TR-00921',
    contact_name: 'Ravi Kumar',
    contact_phone: '+919845001234',
    city: 'Bengaluru',
    state: 'Karnataka',
    fleet_size: 12,
    operating_routes: 'Bengaluru-Chennai',
    status: 'pending',
    rating: null,
    total_jobs: null,
    created_at: '2026-10-01T12:00:00Z',
    approved_at: null,
    rejection_reason: null,
}

const GANGA: Agency = {
    ...KAVERI,
    id: 'agn-2',
    company_name: 'Ganga Freight Movers',
    gstin: null,
    pan_number: null,
    contact_name: null,
    contact_phone: '+919812345678',
    city: 'Mumbai',
    state: null,
    fleet_size: null,
    status: 'pending',
}

const APPROVED: Agency = {
    ...KAVERI,
    id: 'agn-7',
    company_name: 'Deccan Cargo',
    city: 'Hyderabad',
    status: 'approved',
    approved_at: '2026-10-20T12:00:00Z',
}

const SUSPENDED: Agency = {
    ...KAVERI,
    id: 'agn-8',
    company_name: 'Nilgiri Transport',
    status: 'suspended',
    approved_at: '2026-09-15T12:00:00Z',
}

const REJECTED: Agency = {
    ...KAVERI,
    id: 'agn-9',
    company_name: 'Vindhya Logistics',
    status: 'rejected',
    rejection_reason: 'Transport license number could not be verified',
}

const CURRENT_ADMIN = { id: 'user-admin', email: 'admin@truckopti.in', role: 'admin' }

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
                { initialEntries: ['/admin/agencies'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/admin/agencies', element: createElement(AdminAgenciesPage) }),
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

const tabButton = (label: string) => buttons(new RegExp(`^${label}\\d*$`))[0]

const modalRoot = () => (q('textarea') as HTMLTextAreaElement | null)?.closest('div.fixed') ?? null

const modalRejectButton = (modal: HTMLElement) =>
    Array.from(modal.querySelectorAll('button')).find((b) => b.textContent === 'Reject') as HTMLButtonElement

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('AdminAgenciesPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Pinned clock (auto-advancing) so the Registered/Approved date
        // rendering stays deterministic; restored in afterEach.
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
        h.currentUser = { ...CURRENT_ADMIN }
        h.getSnapshot.mockImplementation(async (tab: string) => {
            if (tab === 'approved') return { agencies: [APPROVED], counts: COUNTS }
            if (tab === 'suspended') return { agencies: [SUSPENDED], counts: COUNTS }
            if (tab === 'rejected') return { agencies: [REJECTED], counts: COUNTS }
            return { agencies: [KAVERI, GANGA], counts: COUNTS }
        })
    })

    it('fetches the pending snapshot once on admin mount', async () => {
        await mountPage()
        expect(h.getSnapshot).toHaveBeenCalledTimes(1)
        expect(h.getSnapshot).toHaveBeenCalledWith('pending')
        expect(text()).toContain('Agency Approvals')
        expect(text()).toContain('Manage transport agency registrations')
    })

    it('shows a spinner and no cards while the snapshot is in flight', async () => {
        h.getSnapshot.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('svg.animate-spin')).not.toBeNull()
        expect(text()).not.toContain('Kaveri Roadways')
        expect(text()).not.toContain('No pending agencies')
    })

    it('an empty pending tab shows the empty message instead of cards', async () => {
        h.getSnapshot.mockResolvedValue({ agencies: [], counts: { pending: 0, approved: 0, rejected: 0, suspended: 0 } })
        await mountPage()
        expect(q('svg.animate-spin')).toBeNull()
        expect(text()).toContain('No pending agencies')
    })

    it('a load failure toasts, logs, and falls back to the empty state', async () => {
        h.getSnapshot.mockRejectedValueOnce(new Error('edge function unreachable'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load agencies')
        expect(h.logError).toHaveBeenCalledTimes(1)
        expect(h.logError.mock.calls[0][0]).toBe('[AdminAgencies] Load error:')
        expect(text()).toContain('No pending agencies')
    })

    it('the Refresh button re-fetches and recovers after a failure', async () => {
        h.getSnapshot.mockRejectedValueOnce(new Error('edge function unreachable'))
        await mountPage()
        const refresh = q('button[aria-label="Refresh agencies"]') as HTMLButtonElement
        expect(refresh).not.toBeNull()
        await click(refresh)
        expect(h.getSnapshot).toHaveBeenCalledTimes(2)
        expect(h.getSnapshot).toHaveBeenLastCalledWith('pending')
        expect(text()).toContain('Kaveri Roadways')
    })

    it('renders a full pending card: contact, phone, city, license, fleet, GSTIN, PAN, dates and actions', async () => {
        await mountPage()
        const t = text()
        expect(t).toContain('Kaveri Roadways')
        expect(t).toContain('Ravi Kumar')
        expect(t).toContain('+919845001234')
        expect(t).toContain('Bengaluru, Karnataka')
        expect(t).toContain('KA-TR-00921')
        expect(t).toContain('12 vehicles')
        expect(t).toContain('GSTIN')
        expect(t).toContain('29ABCDE1234F1Z5')
        expect(t).toContain('PAN')
        expect(t).toContain('ABCDE1234F')
        expect(t).toContain('Registered:')
        expect(t).toContain('Oct 2026')
        // both pending cards expose their own action pair
        expect(buttons(/Approve/)).toHaveLength(2)
        expect(buttons(/Reject/)).toHaveLength(2)
    })

    it('hides the optional details an agency does not have', async () => {
        h.getSnapshot.mockResolvedValue({ agencies: [GANGA], counts: COUNTS })
        await mountPage()
        const t = text()
        expect(t).toContain('Ganga Freight Movers')
        expect(t).toContain('Mumbai')
        expect(t).not.toContain('GSTIN')
        expect(t).not.toContain('PAN')
        expect(t).not.toContain('vehicles')
        expect(t).not.toContain('Ravi Kumar')
    })

    it('renders a count badge per non-zero tab and none for a zero tab', async () => {
        await mountPage()
        expect(tabButton('pending').textContent).toBe('pending2')
        expect(tabButton('approved').textContent).toBe('approved1')
        expect(tabButton('suspended').textContent).toBe('suspended3')
        expect(tabButton('rejected').textContent).toBe('rejected')
    })

    it('switching to the approved tab fetches approved agencies and offers Suspend', async () => {
        await mountPage()
        await click(tabButton('approved'))
        expect(h.getSnapshot).toHaveBeenLastCalledWith('approved')
        expect(text()).toContain('Deccan Cargo')
        expect(text()).toContain('Approved:')
        expect(buttons(/Suspend/)).toHaveLength(1)
        expect(buttons(/Approve/)).toHaveLength(0)
        expect(buttons(/Reject/)).toHaveLength(0)
    })

    it('suspend sends the agency id, toasts, and refetches the approved tab', async () => {
        h.suspend.mockResolvedValue({ ...APPROVED, status: 'suspended' })
        await mountPage()
        await click(tabButton('approved'))
        const before = h.getSnapshot.mock.calls.length
        await click(buttons(/Suspend/)[0])
        expect(h.suspend).toHaveBeenCalledTimes(1)
        expect(h.suspend).toHaveBeenCalledWith('agn-7')
        expect(h.toastSuccess).toHaveBeenCalledWith('Agency suspended')
        expect(h.getSnapshot.mock.calls.length).toBe(before + 1)
        expect(h.getSnapshot).toHaveBeenLastCalledWith('approved')
    })

    it('a failed suspend toasts the failure message', async () => {
        h.suspend.mockRejectedValue(new Error('edge function down'))
        await mountPage()
        await click(tabButton('approved'))
        await click(buttons(/Suspend/)[0])
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to suspend agency')
    })

    it('the suspended tab offers Reinstate, which calls approve for that agency', async () => {
        h.approve.mockResolvedValue({ ...SUSPENDED, status: 'approved' })
        await mountPage()
        await click(tabButton('suspended'))
        expect(h.getSnapshot).toHaveBeenLastCalledWith('suspended')
        expect(text()).toContain('Nilgiri Transport')
        await click(buttons(/Reinstate/)[0])
        expect(h.approve).toHaveBeenCalledTimes(1)
        expect(h.approve).toHaveBeenCalledWith('agn-8')
        expect(h.toastSuccess).toHaveBeenCalledWith('Agency approved successfully')
    })

    it('the rejected tab shows the stored rejection reason and no actions', async () => {
        await mountPage()
        await click(tabButton('rejected'))
        expect(text()).toContain('Vindhya Logistics')
        expect(text()).toContain('Rejection reason:')
        expect(text()).toContain('Transport license number could not be verified')
        expect(buttons(/Approve|Reject|Suspend|Reinstate/)).toHaveLength(0)
    })

    it('approve sends the agency id, toasts, and refetches the pending tab', async () => {
        h.approve.mockResolvedValue({ ...KAVERI, status: 'approved' })
        await mountPage()
        const before = h.getSnapshot.mock.calls.length
        await click(buttons(/Approve/)[0])
        expect(h.approve).toHaveBeenCalledTimes(1)
        expect(h.approve).toHaveBeenCalledWith('agn-1')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Agency approved successfully')
        expect(h.getSnapshot.mock.calls.length).toBe(before + 1)
        expect(h.getSnapshot).toHaveBeenLastCalledWith('pending')
    })

    it('the action buttons stay disabled while approve is in flight, then recover', async () => {
        let settle!: (agency: Agency) => void
        h.approve.mockImplementation(() => new Promise<Agency>((resolve) => { settle = resolve }))
        await mountPage()
        const approveButton = buttons(/Approve/)[0]
        await click(approveButton)
        expect(approveButton.disabled).toBe(true)
        expect(buttons(/Reject/)[0].disabled).toBe(true)
        expect(h.getSnapshot).toHaveBeenCalledTimes(1)
        await act(async () => {
            settle({ ...KAVERI, status: 'approved' })
            await new Promise((r) => setTimeout(r, 0))
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(h.toastSuccess).toHaveBeenCalledWith('Agency approved successfully')
        const restored = buttons(/Approve/)[0]
        expect(restored.disabled).toBe(false)
    })

    it('a failed approve toasts the failure message and logs it', async () => {
        h.approve.mockRejectedValue(new Error('edge function down'))
        await mountPage()
        await click(buttons(/Approve/)[0])
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to approve agency')
        expect(h.logError.mock.calls[0][0]).toBe('[AdminAgencies] Approve error:')
        expect(text()).toContain('Kaveri Roadways')
    })

    it('Reject opens a modal naming the agency; Cancel closes it without calling the API', async () => {
        await mountPage()
        await click(buttons(/Reject/)[0])
        const modal = modalRoot() as HTMLElement
        expect(modal).not.toBeNull()
        expect(modal.textContent).toContain('Reject Agency')
        expect(modal.textContent).toContain('Kaveri Roadways')
        const cancel = Array.from(modal.querySelectorAll('button')).find(
            (b) => b.textContent === 'Cancel',
        ) as HTMLButtonElement
        await click(cancel)
        expect(q('textarea')).toBeNull()
        expect(h.reject).not.toHaveBeenCalled()
    })

    it('a blank or whitespace-only reason is refused without calling reject', async () => {
        await mountPage()
        await click(buttons(/Reject/)[0])
        await click(modalRejectButton(modalRoot() as HTMLElement))
        expect(h.toastError).toHaveBeenCalledWith('Please enter a rejection reason')
        expect(h.reject).not.toHaveBeenCalled()
        expect(q('textarea')).not.toBeNull()
        await type(q('textarea') as HTMLTextAreaElement, '   ')
        await click(modalRejectButton(modalRoot() as HTMLElement))
        expect(h.toastError).toHaveBeenCalledTimes(2)
        expect(h.reject).not.toHaveBeenCalled()
        expect(q('textarea')).not.toBeNull()
    })

    it('reject sends the trimmed reason, toasts, closes the modal, and refetches', async () => {
        h.reject.mockResolvedValue({ ...KAVERI, status: 'rejected' })
        await mountPage()
        const before = h.getSnapshot.mock.calls.length
        await click(buttons(/Reject/)[0])
        await type(q('textarea') as HTMLTextAreaElement, '  Invalid transport license number  ')
        await click(modalRejectButton(modalRoot() as HTMLElement))
        expect(h.reject).toHaveBeenCalledTimes(1)
        expect(h.reject).toHaveBeenCalledWith('agn-1', 'Invalid transport license number')
        expect(h.toastSuccess).toHaveBeenCalledWith('Agency rejected')
        expect(q('textarea')).toBeNull()
        expect(h.getSnapshot.mock.calls.length).toBe(before + 1)
    })

    it('a failed reject keeps the modal open with the typed reason and toasts the failure', async () => {
        h.reject.mockRejectedValue(new Error('edge function down'))
        await mountPage()
        await click(buttons(/Reject/)[0])
        await type(q('textarea') as HTMLTextAreaElement, 'License mismatch')
        await click(modalRejectButton(modalRoot() as HTMLElement))
        expect(h.toastError).toHaveBeenCalledWith('Failed to reject agency')
        expect(q('textarea')).not.toBeNull()
        expect((q('textarea') as HTMLTextAreaElement).value).toBe('License mismatch')
    })

    it('search narrows by company name case-insensitively', async () => {
        await mountPage()
        await type(q('input') as HTMLInputElement, 'kaveri')
        expect(text()).toContain('Kaveri Roadways')
        expect(text()).not.toContain('Ganga Freight Movers')
    })

    it('search matches phone and city, and clearing restores every card', async () => {
        await mountPage()
        const search = q('input') as HTMLInputElement
        await type(search, '+919812345678')
        expect(text()).toContain('Ganga Freight Movers')
        expect(text()).not.toContain('Kaveri Roadways')
        await type(search, 'mumbai')
        expect(text()).toContain('Ganga Freight Movers')
        expect(text()).not.toContain('Kaveri Roadways')
        await type(search, '')
        expect(text()).toContain('Kaveri Roadways')
        expect(text()).toContain('Ganga Freight Movers')
    })

    it('the back button navigates to /admin', async () => {
        await mountPage()
        const back = q('button[aria-label="Back to admin dashboard"]') as HTMLButtonElement
        expect(back).not.toBeNull()
        await click(back)
        expect(text()).toContain('ADMIN-HOME-MARKER')
    })

    it('a non-admin user never triggers a snapshot fetch (permission gate)', async () => {
        h.currentUser = { ...CURRENT_ADMIN, role: 'agency' }
        await mountPage()
        expect(h.getSnapshot).not.toHaveBeenCalled()
        expect(h.toastError).not.toHaveBeenCalled()
        expect(h.approve).not.toHaveBeenCalled()
        expect(h.reject).not.toHaveBeenCalled()
        expect(h.suspend).not.toHaveBeenCalled()
    })
})
