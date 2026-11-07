// FINDING: AdminPayoutsPage.handleMarkPaid (frontend/src/pages/AdminPayoutsPage.tsx)
// wraps adminPayoutsApi.markAsPaid in try/finally with NO catch: when the call
// rejects there is no error toast, no logger.error entry, and the rejection
// propagates unhandled (silent failure for the admin). Recorded per task rules;
// not fixed here, and deliberately not asserted as correct by any test below.
//
// Regression suite for AdminPayoutsPage: pins the CURRENT behaviour of the
// admin payouts console over adminPayoutsApi — auth gating, load/empty/error
// states, en-IN money and date formatting, search + status tabs, and the
// approve / reject / mark-paid actions with their exact call arguments.

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DriverPayout } from '../services/adminSupabaseApi'

const h = vi.hoisted(() => ({
    auth: { user: null as { id: string; email: string; role: string } | null, isLoading: false },
    getAll: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    markAsPaid: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    loggerLog: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/adminSupabaseApi', () => ({
    adminPayoutsApi: {
        getAll: h.getAll,
        approve: h.approve,
        reject: h.reject,
        markAsPaid: h.markAsPaid,
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: (selector?: (state: { user: unknown; isLoading: boolean }) => unknown) =>
        selector ? selector(h.auth) : h.auth,
}))

vi.mock('../utils/logger', () => ({
    logger: { log: h.loggerLog, warn: h.loggerWarn, error: h.loggerError, info: h.loggerInfo },
}))

import AdminPayoutsPage from './AdminPayoutsPage'

const ADMIN = { id: 'u-admin', email: 'admin@truckopti.in', role: 'admin' }

const PENDING_PAYOUT: DriverPayout = {
    id: 'po-1',
    driver_id: 'drv-1',
    amount: 1500,
    status: 'pending',
    requested_at: '2026-11-01T10:30:00Z',
    processed_at: null,
    note: null,
    drivers: { full_name: 'Ravi Kumar', phone: '9876543210' },
}
const APPROVED_PAYOUT: DriverPayout = {
    id: 'po-2',
    driver_id: 'drv-2',
    amount: 1250000,
    status: 'approved',
    requested_at: '2026-10-28T04:05:00Z',
    processed_at: '2026-10-29T06:00:00Z',
    note: null,
    drivers: { full_name: 'Meena Singh', phone: '9123456780' },
}
const PAID_PAYOUT: DriverPayout = {
    id: 'po-3',
    driver_id: 'drv-3',
    amount: 8750,
    status: 'paid',
    requested_at: '2026-10-20T01:15:00Z',
    processed_at: '2026-10-21T05:45:00Z',
    note: null,
    drivers: { full_name: 'Arun Verma', phone: '9000000001' },
}
const REJECTED_PAYOUT: DriverPayout = {
    id: 'po-4',
    driver_id: 'drv-4',
    amount: 500,
    status: 'rejected',
    requested_at: '2026-10-15T09:00:00Z',
    processed_at: '2026-10-16T03:30:00Z',
    note: 'Duplicate withdrawal request',
    drivers: { full_name: 'Sana Khan', phone: '9000000002' },
}
const LIST: DriverPayout[] = [PENDING_PAYOUT, APPROVED_PAYOUT, PAID_PAYOUT, REJECTED_PAYOUT]

const AFTER_APPROVE: DriverPayout[] = LIST.map((p) =>
    p.id === 'po-1' ? { ...p, status: 'approved', processed_at: '2026-11-07T08:00:00Z' } : p,
)
const AFTER_PAID: DriverPayout[] = LIST.map((p) =>
    p.id === 'po-2' ? { ...p, status: 'paid', processed_at: '2026-11-07T09:00:00Z' } : p,
)

// Same format call the page uses, so the expected string is computed in the
// same locale/timezone the page renders in — the pin is "formatted, never raw ISO".
const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

let root: Root | null = null
let container: HTMLElement | null = null

function pageTree() {
    return createElement(
        MemoryRouter,
        { initialEntries: ['/admin/payouts'] },
        createElement(
            Routes,
            null,
            createElement(Route, { path: '/admin', element: createElement('div', null, 'admin-home-marker') }),
            createElement(Route, { path: '/admin/payouts', element: createElement(AdminPayoutsPage) }),
        ),
    )
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(pageTree())
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(0)
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => {
            root!.unmount()
            await vi.advanceTimersByTimeAsync(0)
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
const tab = (label: string) => buttons(new RegExp(`^${label} \\(\\d+\\)$`))[0] as HTMLButtonElement
const rowFor = (name: string) =>
    Array.from((container as HTMLElement).querySelectorAll('tbody tr')).find((tr) => (tr.textContent || '').includes(name)) as HTMLElement | undefined
const rowButton = (name: string, re: RegExp) =>
    rowFor(name) ? Array.from(rowFor(name)!.querySelectorAll('button')).find((b) => re.test(b.textContent || '')) : undefined
const modal = () => q('.fixed.inset-0') as HTMLElement | null
const modalButton = (re: RegExp) =>
    Array.from((modal() as HTMLElement).querySelectorAll('button')).find((b) => re.test(b.textContent || '')) as HTMLButtonElement
const searchInput = () => q('input[type="text"]') as HTMLInputElement

async function click(button: Element) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(0)
    })
}

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        await vi.advanceTimersByTimeAsync(0)
    })
}

describe('AdminPayoutsPage', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-11-07T12:00:00Z'))
        h.auth.user = ADMIN
        h.auth.isLoading = false
        h.getAll.mockResolvedValue(LIST)
        h.approve.mockResolvedValue({ ...PENDING_PAYOUT, status: 'approved' })
        h.reject.mockResolvedValue({ ...PENDING_PAYOUT, status: 'rejected', note: 'Duplicate request' })
        h.markAsPaid.mockResolvedValue({ ...APPROVED_PAYOUT, status: 'paid' })
    })

    it('while auth is loading it renders only a spinner and never fetches', async () => {
        h.auth.isLoading = true
        await mountPage()
        expect(q('.animate-spin')).toBeTruthy()
        expect(text()).not.toContain('Driver Payouts')
        expect(h.getAll).not.toHaveBeenCalled()
    })

    it('a non-admin role gets the admin-access-required card and no fetch', async () => {
        h.auth.user = { id: 'u-2', email: 'driver@x.in', role: 'driver' }
        await mountPage()
        expect(text()).toContain('Admin access required')
        expect(text()).toContain('This payouts console is only available to admin users')
        expect(h.getAll).not.toHaveBeenCalled()
    })

    it('a signed-out user gets the same admin-access-required card', async () => {
        h.auth.user = null
        await mountPage()
        expect(text()).toContain('Admin access required')
        expect(h.getAll).not.toHaveBeenCalled()
    })

    it('shows Loading payouts while the first fetch is in flight and disables Refresh', async () => {
        h.getAll.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(text()).toContain('Loading payouts...')
        expect((buttons(/^Refresh$/)[0] as HTMLButtonElement).disabled).toBe(true)
    })

    it('an empty payout list renders No payouts found with no table', async () => {
        h.getAll.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No payouts found')
        expect(q('table')).toBeNull()
    })

    it('a failed load toasts the error and Refresh retries successfully', async () => {
        h.getAll.mockRejectedValueOnce(new Error('edge function down'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load payouts')
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(h.loggerError.mock.calls[0][0]).toBe('[AdminPayouts] Fetch error:')
        expect(text()).toContain('No payouts found')

        await click(buttons(/^Refresh$/)[0])
        expect(h.getAll).toHaveBeenCalledTimes(2)
        expect(text()).toContain('Ravi Kumar')
        expect(h.toastError).toHaveBeenCalledTimes(1)
    })

    it('renders drivers, phones, en-IN amounts, status badges and formatted dates', async () => {
        await mountPage()
        expect(rowFor('Ravi Kumar')?.textContent).toContain('9876543210')
        expect(rowFor('Meena Singh')?.textContent).toContain('9123456780')
        // en-IN digit grouping: 1,500 and 12,50,000 (lakh), not 1,250,000
        expect(text()).toContain('₹1,500')
        expect(text()).toContain('₹12,50,000')
        expect(text()).toContain('₹8,750')
        expect(rowFor('Ravi Kumar')?.textContent).toContain('Pending')
        expect(rowFor('Meena Singh')?.textContent).toContain('Approved')
        expect(rowFor('Arun Verma')?.textContent).toContain('Paid')
        expect(rowFor('Sana Khan')?.textContent).toContain('Rejected')

        const raviCells = Array.from(rowFor('Ravi Kumar')!.querySelectorAll('td'))
        expect(raviCells[0].textContent).toContain('Ravi Kumar')
        expect(raviCells[4].textContent).toBe('-')
        const meenaRow = rowFor('Meena Singh')!
        expect(meenaRow.textContent).toContain(formatDate('2026-10-28T04:05:00Z'))
        expect(meenaRow.textContent).toContain(formatDate('2026-10-29T06:00:00Z'))
        // dates are formatted, the raw ISO strings never reach the DOM
        expect(text()).not.toContain('2026-11-01T10:30:00Z')
        expect(text()).not.toContain('2026-10-29T06:00:00Z')
    })

    it('a payout without a driver join falls back to Unknown and -', async () => {
        h.getAll.mockResolvedValue([{ ...PENDING_PAYOUT, id: 'po-9', driver_id: 'drv-9', drivers: null }])
        await mountPage()
        const row = rowFor('Unknown')
        expect(row).toBeTruthy()
        const cells = Array.from(row!.querySelectorAll('td'))
        expect(cells[0].textContent).toContain('Unknown')
        expect(cells[0].textContent).toContain('-')
    })

    it('status tabs count every payout, even while a search is active', async () => {
        await mountPage()
        const expected: Array<[string, number]> = [['All', 4], ['Pending', 1], ['Approved', 1], ['Paid', 1], ['Rejected', 1]]
        for (const [label, count] of expected) {
            expect(tab(label).textContent).toBe(`${label} (${count})`)
        }
        await type(searchInput(), 'meena')
        expect(tab('All').textContent).toBe('All (4)')
        expect(tab('Pending').textContent).toBe('Pending (1)')
    })

    it('the Paid tab filters the table to paid payouts only', async () => {
        await mountPage()
        await click(tab('Paid'))
        expect((container as HTMLElement).querySelectorAll('tbody tr').length).toBe(1)
        expect(rowFor('Arun Verma')).toBeTruthy()
        expect(rowFor('Ravi Kumar')).toBeUndefined()
        expect(rowFor('Meena Singh')).toBeUndefined()
    })

    it('search matches driver names case-insensitively', async () => {
        await mountPage()
        await type(searchInput(), 'rAvI')
        expect((container as HTMLElement).querySelectorAll('tbody tr').length).toBe(1)
        expect(rowFor('Ravi Kumar')).toBeTruthy()
        expect(rowFor('Meena Singh')).toBeUndefined()
    })

    it('search matches a phone substring', async () => {
        await mountPage()
        await type(searchInput(), '9123456780')
        expect((container as HTMLElement).querySelectorAll('tbody tr').length).toBe(1)
        expect(rowFor('Meena Singh')).toBeTruthy()
        expect(rowFor('Ravi Kumar')).toBeUndefined()
    })

    it('a search with no matches shows the empty state', async () => {
        await mountPage()
        await type(searchInput(), 'zzz')
        expect(text()).toContain('No payouts found')
        expect(q('table')).toBeNull()
    })

    it('Approve sends the payout id, toasts, and refetches so the row offers Mark Paid', async () => {
        h.getAll.mockResolvedValueOnce(LIST).mockResolvedValue(AFTER_APPROVE)
        await mountPage()
        await click(rowButton('Ravi Kumar', /^Approve$/) as HTMLButtonElement)
        expect(h.approve).toHaveBeenCalledTimes(1)
        expect(h.approve).toHaveBeenCalledWith('po-1')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Payout approved')
        expect(h.getAll).toHaveBeenCalledTimes(2)
        expect(rowButton('Ravi Kumar', /Mark Paid/)).toBeTruthy()
        expect(rowButton('Ravi Kumar', /^Approve$/)).toBeUndefined()
    })

    it('a failed Approve toasts the error, logs it, and does not refetch', async () => {
        h.approve.mockRejectedValue(new Error('boom'))
        await mountPage()
        await click(rowButton('Ravi Kumar', /^Approve$/) as HTMLButtonElement)
        expect(h.approve).toHaveBeenCalledWith('po-1')
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to approve payout')
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(h.loggerError.mock.calls[0][0]).toBe('[AdminPayouts] Approve error:')
        expect(h.getAll).toHaveBeenCalledTimes(1)
        expect(rowButton('Ravi Kumar', /^Approve$/)).toBeTruthy()
    })

    it('an in-flight Approve disables that row\'s actions but leaves other rows enabled', async () => {
        h.approve.mockReturnValue(new Promise(() => {}))
        await mountPage()
        await click(rowButton('Ravi Kumar', /^Approve$/) as HTMLButtonElement)
        expect((rowButton('Ravi Kumar', /^Approve$/) as HTMLButtonElement).disabled).toBe(true)
        expect((rowButton('Ravi Kumar', /^Reject$/) as HTMLButtonElement).disabled).toBe(true)
        expect((rowButton('Meena Singh', /Mark Paid/) as HTMLButtonElement).disabled).toBe(false)
    })

    it('the reject modal names the driver, requires a non-blank reason, and Cancel clears it', async () => {
        await mountPage()
        await click(rowButton('Ravi Kumar', /^Reject$/) as HTMLButtonElement)
        const dialog = modal()!
        expect(dialog.textContent).toContain('Reject Payout Request')
        expect(dialog.textContent).toContain('Ravi Kumar')
        expect(modalButton(/^Reject$/).disabled).toBe(true)

        await type(q('textarea') as HTMLTextAreaElement, '   ')
        expect(modalButton(/^Reject$/).disabled).toBe(true)

        await type(q('textarea') as HTMLTextAreaElement, 'Duplicate request')
        expect(modalButton(/^Reject$/).disabled).toBe(false)

        await click(modalButton(/Cancel/))
        expect(modal()).toBeNull()
        expect(h.reject).not.toHaveBeenCalled()

        await click(rowButton('Ravi Kumar', /^Reject$/) as HTMLButtonElement)
        expect((q('textarea') as HTMLTextAreaElement).value).toBe('')
    })

    it('confirming rejection sends the trimmed reason, toasts, closes the modal and refetches', async () => {
        await mountPage()
        await click(rowButton('Ravi Kumar', /^Reject$/) as HTMLButtonElement)
        await type(q('textarea') as HTMLTextAreaElement, '  Duplicate request  ')
        await click(modalButton(/^Reject$/))
        expect(h.reject).toHaveBeenCalledTimes(1)
        expect(h.reject).toHaveBeenCalledWith('po-1', 'Duplicate request')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Payout rejected')
        expect(modal()).toBeNull()
        expect(h.getAll).toHaveBeenCalledTimes(2)
    })

    it('a failed rejection toasts the error and keeps the modal open with the reason', async () => {
        h.reject.mockRejectedValue(new Error('rpc failed'))
        await mountPage()
        await click(rowButton('Ravi Kumar', /^Reject$/) as HTMLButtonElement)
        await type(q('textarea') as HTMLTextAreaElement, 'Wrong amount')
        await click(modalButton(/^Reject$/))
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to reject payout')
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(h.loggerError.mock.calls[0][0]).toBe('[AdminPayouts] Reject error:')
        expect(modal()).not.toBeNull()
        expect((q('textarea') as HTMLTextAreaElement).value).toBe('Wrong amount')
    })

    it('Mark Paid sends the payout id, toasts, and refetches to Completed', async () => {
        h.getAll.mockResolvedValueOnce(LIST).mockResolvedValue(AFTER_PAID)
        await mountPage()
        await click(rowButton('Meena Singh', /Mark Paid/) as HTMLButtonElement)
        expect(h.markAsPaid).toHaveBeenCalledTimes(1)
        expect(h.markAsPaid).toHaveBeenCalledWith('po-2')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Marked as paid')
        expect(h.getAll).toHaveBeenCalledTimes(2)
        expect(rowFor('Meena Singh')?.textContent).toContain('Completed')
        expect(rowButton('Meena Singh', /Mark Paid/)).toBeUndefined()
    })

    it('a rejected payout exposes its note via title and a note-less one shows nothing', async () => {
        const silentRejected: DriverPayout = {
            ...REJECTED_PAYOUT,
            id: 'po-5',
            driver_id: 'drv-5',
            note: null,
            requested_at: '2026-10-10T08:00:00Z',
            processed_at: '2026-10-11T02:00:00Z',
            drivers: { full_name: 'Tia Bose', phone: '9000000003' },
        }
        h.getAll.mockResolvedValue([...LIST, silentRejected])
        await mountPage()
        const reason = q('span[title="Duplicate withdrawal request"]')
        expect(reason?.textContent).toContain('Reason provided')
        expect((container as HTMLElement).querySelectorAll('span[title]').length).toBe(1)
        expect(rowFor('Tia Bose')?.textContent).not.toContain('Reason provided')
    })

    it('the back button is labelled and navigates to /admin', async () => {
        await mountPage()
        const back = q('button[aria-label="Back to admin dashboard"]') as HTMLButtonElement
        expect(back).toBeTruthy()
        await click(back)
        expect(text()).toContain('admin-home-marker')
        expect(text()).not.toContain('Driver Payouts')
    })

    it('exposes the table headers, a labelled search box and the five status tabs', async () => {
        await mountPage()
        expect(text()).toContain('Driver Payouts')
        expect(text()).toContain('Manage driver withdrawal requests')
        expect(q('table')).toBeTruthy()
        const headers = Array.from(q('table')!.querySelectorAll('th')).map((th) => th.textContent)
        for (const header of ['Driver', 'Amount', 'Status', 'Requested', 'Processed', 'Actions']) {
            expect(headers).toContain(header)
        }
        expect(searchInput().getAttribute('placeholder')).toBe('Search by name or phone...')
        for (const label of ['All', 'Pending', 'Approved', 'Paid', 'Rejected']) {
            expect(tab(label)).toBeTruthy()
        }
    })
})
