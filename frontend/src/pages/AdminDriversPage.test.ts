import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pin for AdminDriversPage over adminSupabaseApi: the four status
// tabs, search across name/phone/city, approve/reject/suspend actions with
// their exact call arguments, the reject-reason validation, CSV export and
// the operational states (loading, empty per tab, fetch failure + Refresh).

// FINDING (a11y gap, pinned as-is — not asserted as correct): the reject
// modal is a plain div overlay without role="dialog"/aria-modal, a labelled
// title, focus trap or Escape handling, unlike the dialogs in AgencyTeamPage.

const h = vi.hoisted(() => ({
    getDriversByStatus: vi.fn(),
    approveDriver: vi.fn(),
    rejectDriver: vi.fn(),
    suspendDriver: vi.fn(),
    loggerError: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/adminSupabaseApi', () => ({
    adminSupabaseApi: {
        getDriversByStatus: h.getDriversByStatus,
        approveDriver: h.approveDriver,
        rejectDriver: h.rejectDriver,
        suspendDriver: h.suspendDriver,
    },
}))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: h.loggerError },
}))

import AdminDriversPage from './AdminDriversPage'
import { UserFacingError } from '../utils/userFacingError'

// Pinned clock: exportCSV stamps the file name with the current date and the
// clock must never leak real "now" into assertions.
const PINNED_NOW = new Date('2026-11-07T12:00:00Z')

const PENDING_RAM = {
    id: 'drv-1',
    full_name: 'Ramesh Kumar',
    phone: '9876543210',
    pan_number: 'ABCDE1234F',
    vehicle_type: 'tata_407',
    home_city: 'Jaipur',
    rc_number: 'RC12345',
    license_number: 'LIC9999',
    aadhaar_last4: '1234',
    bank_account: '1234567890',
    ifsc_code: 'SBIN0001234',
    upi_id: 'ramesh@upi',
    status: 'pending',
    rating: null,
    total_trips: null,
    // midday UTC keeps the formatted day stable across realistic timezones
    created_at: '2026-01-15T12:00:00Z',
    approved_by: null,
    approved_at: null,
    rejection_reason: null,
}
const PENDING_SITA = {
    ...PENDING_RAM,
    id: 'drv-2',
    full_name: 'Sita Devi',
    phone: '9123456780',
    pan_number: null,
    vehicle_type: 'eicher_14ft',
    home_city: 'Pune',
    rc_number: null,
    license_number: null,
    aadhaar_last4: null,
    bank_account: null,
    ifsc_code: null,
    upi_id: null,
    created_at: '2026-03-02T12:00:00Z',
}
const APPROVED_VIK = {
    ...PENDING_RAM,
    id: 'drv-3',
    full_name: 'Vikram Singh',
    phone: '9812345678',
    vehicle_type: 'bharatbenz_32ft',
    home_city: 'Delhi',
    status: 'approved',
    rating: 4.8,
    total_trips: 12,
    approved_by: 'admin-1',
    approved_at: '2026-02-01T12:00:00Z',
}
const REJECTED_AMIT = {
    ...PENDING_RAM,
    id: 'drv-4',
    full_name: 'Amit Yadav',
    phone: '9898989898',
    vehicle_type: 'ashok_19ft',
    home_city: 'Kanpur',
    status: 'rejected',
    rejection_reason: 'Invalid documents',
}

let root: Root | null = null
let container: HTMLElement | null = null
let lastPathname = ''

function LocationProbe() {
    const location = useLocation()
    lastPathname = location.pathname
    return null
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, null, createElement(LocationProbe), createElement(AdminDriversPage)))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

afterEach(async () => {
    vi.useRealTimers()
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const allButtons = () => Array.from((container as HTMLElement).querySelectorAll('button'))
const exact = (label: string) => allButtons().filter((b) => (b.textContent || '').trim() === label)
const modal = () => q('div.fixed.inset-0') as HTMLElement
const refreshButton = () => q('button[aria-label="Refresh drivers"]') as HTMLButtonElement

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

// jsdom's Blob has no .text(); FileReader is always available there
function blobText(blob: Blob): Promise<string> {
    if (typeof (blob as unknown as { text?: unknown }).text === 'function') {
        return blob.text()
    }
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsText(blob)
    })
}

// jsdom has no URL.createObjectURL and anchor click would try to navigate;
// stub both so the export path can be asserted end to end.
function stubDownload() {
    const blobs: Blob[] = []
    const revoked: string[] = []
    const urlAny = URL as unknown as Record<string, unknown>
    const origCreate = urlAny.createObjectURL
    const origRevoke = urlAny.revokeObjectURL
    urlAny.createObjectURL = (b: Blob) => {
        blobs.push(b)
        return 'blob:mock-drivers'
    }
    urlAny.revokeObjectURL = (u: string) => {
        revoked.push(u)
    }
    let anchor: HTMLAnchorElement | null = null
    const spy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        anchor = this
    })
    const restore = () => {
        spy.mockRestore()
        if (origCreate === undefined) delete urlAny.createObjectURL
        else urlAny.createObjectURL = origCreate
        if (origRevoke === undefined) delete urlAny.revokeObjectURL
        else urlAny.revokeObjectURL = origRevoke
    }
    return { blobs, revoked, getAnchor: () => anchor, restore }
}

describe('AdminDriversPage', () => {
    beforeEach(() => {
        // fake clock that still lets awaited setTimeout(0) ticks fire, so the
        // mount/click helpers keep working while Date stays pinned
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(PINNED_NOW)
        vi.clearAllMocks()
        h.getDriversByStatus.mockResolvedValue([PENDING_RAM, PENDING_SITA])
        h.approveDriver.mockResolvedValue({})
        h.rejectDriver.mockResolvedValue({})
        h.suspendDriver.mockResolvedValue({})
    })

    it('loads the pending tab first, showing a spinner and disabling Refresh', async () => {
        h.getDriversByStatus.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(h.getDriversByStatus).toHaveBeenCalledTimes(1)
        expect(h.getDriversByStatus).toHaveBeenCalledWith('pending')
        expect(q('div.h-48 .animate-spin')).not.toBeNull()
        expect(refreshButton().disabled).toBe(true)
        expect(text()).not.toContain('No pending drivers')
        expect(text()).not.toContain('Ramesh Kumar')
    })

    it('renders the pending driver card with profile details and actions', async () => {
        h.getDriversByStatus.mockResolvedValue([PENDING_RAM])
        await mountPage()
        expect(text()).toContain('Driver Management')
        expect(text()).toContain('Approve or reject driver registrations')
        expect(text()).toContain('Ramesh Kumar')
        expect(q('.text-primary-700')?.textContent).toBe('R')
        expect(q('span.bg-amber-100')?.textContent).toBe('pending')
        expect(text()).toContain('9876543210')
        expect(text()).toContain('Tata 407 (1T)')
        expect(text()).toContain('Jan 2026')
        expect(text()).toContain('📍 Jaipur')
        expect(text()).toContain('PAN: ABCDE1234F')
        expect(text()).toContain('RC: RC12345')
        expect(exact('Details')).toHaveLength(1)
        expect(exact('Approve')).toHaveLength(1)
        expect(exact('Reject')).toHaveLength(1)
        expect(exact('Suspend')).toHaveLength(0)
    })

    it('renders an unknown vehicle type as its raw code', async () => {
        h.getDriversByStatus.mockResolvedValue([{ ...PENDING_RAM, vehicle_type: 'custom_trike' }])
        await mountPage()
        expect(text()).toContain('custom_trike')
        expect(text()).not.toContain('Tata 407')
    })

    it('shows the pending-specific empty state when the tab has no drivers', async () => {
        h.getDriversByStatus.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No pending drivers')
        expect(text()).toContain('New applications will appear here')
        expect(exact('CSV')).toHaveLength(0)
    })

    it('search filters by name case-insensitively and clearing restores the list', async () => {
        await mountPage()
        await type(q('input') as HTMLInputElement, 'SITA')
        expect(text()).toContain('Sita Devi')
        expect(text()).not.toContain('Ramesh Kumar')
        await type(q('input') as HTMLInputElement, '')
        expect(text()).toContain('Ramesh Kumar')
        expect(text()).toContain('Sita Devi')
    })

    it('search matches phone and home city; a non-matching term shows the empty card', async () => {
        await mountPage()
        await type(q('input') as HTMLInputElement, '9123456780')
        expect(text()).toContain('Sita Devi')
        expect(text()).not.toContain('Ramesh Kumar')
        await type(q('input') as HTMLInputElement, 'pune')
        expect(text()).toContain('Sita Devi')
        expect(text()).not.toContain('Ramesh Kumar')
        // pin current behaviour: a no-match search renders the pending empty
        // card including its "new applications" hint
        await type(q('input') as HTMLInputElement, 'zzz-no-match')
        expect(text()).toContain('No pending drivers')
        expect(text()).toContain('New applications will appear here')
    })

    it('a fetch failure toasts, logs and shows the empty state; Refresh recovers', async () => {
        h.getDriversByStatus.mockRejectedValueOnce(new Error('network down'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load drivers.')
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(text()).toContain('No pending drivers')

        await click(refreshButton())
        expect(h.getDriversByStatus).toHaveBeenCalledTimes(2)
        expect(h.getDriversByStatus.mock.calls.map((c) => c[0])).toEqual(['pending', 'pending'])
        expect(text()).toContain('Ramesh Kumar')
        expect(text()).toContain('Sita Devi')
        expect(refreshButton().disabled).toBe(false)
    })

    it('switching to Approved refetches by status and swaps actions to Suspend', async () => {
        h.getDriversByStatus.mockImplementation((status: string) =>
            Promise.resolve(status === 'approved' ? [APPROVED_VIK] : [PENDING_RAM, PENDING_SITA])
        )
        await mountPage()
        await click(exact('Approved')[0])
        expect(h.getDriversByStatus).toHaveBeenLastCalledWith('approved')
        expect(text()).toContain('Vikram Singh')
        expect(q('span.bg-emerald-100')?.textContent).toBe('approved')
        expect(exact('Suspend')).toHaveLength(1)
        expect(exact('Approve')).toHaveLength(0)
        expect(exact('Reject')).toHaveLength(0)
        expect(exact('Details')).toHaveLength(1)
    })

    it('the Rejected tab shows the stored rejection reason and no action buttons', async () => {
        h.getDriversByStatus.mockImplementation((status: string) =>
            Promise.resolve(status === 'rejected' ? [REJECTED_AMIT] : [PENDING_RAM, PENDING_SITA])
        )
        await mountPage()
        await click(exact('Rejected')[0])
        expect(h.getDriversByStatus).toHaveBeenLastCalledWith('rejected')
        expect(text()).toContain('Amit Yadav')
        expect(text()).toContain('Reason: Invalid documents')
        expect(exact('Approve')).toHaveLength(0)
        expect(exact('Reject')).toHaveLength(0)
        expect(exact('Suspend')).toHaveLength(0)
        expect(exact('Details')).toHaveLength(1)
    })

    it('an empty non-pending tab uses the status-specific empty message', async () => {
        h.getDriversByStatus.mockImplementation((status: string) =>
            Promise.resolve(status === 'suspended' ? [] : [PENDING_RAM, PENDING_SITA])
        )
        await mountPage()
        await click(exact('Suspended')[0])
        expect(text()).toContain('No suspended drivers')
        expect(text()).toContain('No drivers with suspended status')
        expect(text()).not.toContain('New applications will appear here')
    })

    it('Details navigates to the per-driver admin route', async () => {
        h.getDriversByStatus.mockResolvedValue([PENDING_RAM])
        await mountPage()
        expect(lastPathname).toBe('/')
        await click(exact('Details')[0])
        expect(lastPathname).toBe('/admin/drivers/drv-1')
    })

    it('Approve sends the driver id, toasts with the name and removes only that driver', async () => {
        await mountPage()
        await click(exact('Approve')[0])
        expect(h.approveDriver).toHaveBeenCalledTimes(1)
        expect(h.approveDriver).toHaveBeenCalledWith('drv-1')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Ramesh Kumar approved!')
        expect(text()).not.toContain('Ramesh Kumar')
        expect(text()).toContain('Sita Devi')
        expect(h.toastError).not.toHaveBeenCalled()
    })

    it('an Approve failure toasts the fallback message and keeps the driver listed', async () => {
        h.approveDriver.mockRejectedValue(new Error('edge function exploded'))
        await mountPage()
        await click(exact('Approve')[0])
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Approval failed')
        expect(text()).toContain('Ramesh Kumar')
        // action loading cleared: the button is usable again
        expect(exact('Approve')[0].disabled).toBe(false)
    })

    it('an Approve failure carrying a user-facing message surfaces it', async () => {
        h.approveDriver.mockRejectedValue(new UserFacingError('Driver record locked'))
        await mountPage()
        await click(exact('Approve')[0])
        expect(h.toastError).toHaveBeenCalledWith('Driver record locked')
        expect(h.toastError).not.toHaveBeenCalledWith('Approval failed')
    })

    it('Reject opens the named modal and Cancel closes it without calling the API', async () => {
        h.getDriversByStatus.mockResolvedValue([PENDING_RAM])
        await mountPage()
        await click(exact('Reject')[0])
        const dialog = modal()
        expect(dialog.textContent).toContain('Reject Application')
        expect(dialog.textContent).toContain('Provide a reason for rejecting')
        expect(dialog.textContent).toContain('Ramesh Kumar')
        expect(q('textarea')?.getAttribute('placeholder')).toBe('e.g. Invalid documents, duplicate application...')
        expect(h.rejectDriver).not.toHaveBeenCalled()

        const cancel = Array.from(dialog.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === 'Cancel') as HTMLButtonElement
        await click(cancel)
        expect(modal()).toBeNull()
        expect(h.rejectDriver).not.toHaveBeenCalled()
        expect(text()).toContain('Ramesh Kumar')
    })

    it('Reject with a blank or whitespace-only reason is rejected client-side', async () => {
        h.getDriversByStatus.mockResolvedValue([PENDING_RAM])
        await mountPage()
        await click(exact('Reject')[0])
        const dialog = modal()
        const confirm = dialog.querySelector('button.bg-red-500') as HTMLButtonElement

        await click(confirm)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Enter a reason for rejection')
        expect(h.rejectDriver).not.toHaveBeenCalled()

        await type(q('textarea') as HTMLTextAreaElement, '   ')
        await click(dialog.querySelector('button.bg-red-500') as HTMLButtonElement)
        expect(h.toastError).toHaveBeenCalledTimes(2)
        expect(h.rejectDriver).not.toHaveBeenCalled()
        expect(modal()).not.toBeNull()
    })

    it('confirming Reject trims the reason, sends the exact arguments and removes the driver', async () => {
        h.getDriversByStatus.mockResolvedValue([PENDING_RAM, PENDING_SITA])
        await mountPage()
        await click(exact('Reject')[0])
        await type(q('textarea') as HTMLTextAreaElement, '  Duplicate application  ')
        await click(modal().querySelector('button.bg-red-500') as HTMLButtonElement)

        expect(h.rejectDriver).toHaveBeenCalledTimes(1)
        expect(h.rejectDriver).toHaveBeenCalledWith('drv-1', 'Duplicate application')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Ramesh Kumar rejected')
        expect(modal()).toBeNull()
        expect(text()).not.toContain('Ramesh Kumar')
        expect(text()).toContain('Sita Devi')
    })

    it('a Reject API failure toasts the fallback and keeps the modal open for retry', async () => {
        h.getDriversByStatus.mockResolvedValue([PENDING_RAM])
        h.rejectDriver.mockRejectedValue(new Error('db down'))
        await mountPage()
        await click(exact('Reject')[0])
        await type(q('textarea') as HTMLTextAreaElement, 'Blurry documents')
        await click(modal().querySelector('button.bg-red-500') as HTMLButtonElement)

        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Rejection failed')
        expect(modal()).not.toBeNull()
        expect(modal().textContent).toContain('Ramesh Kumar')
        expect(text()).toContain('Ramesh Kumar')
    })

    it('Suspend sends the driver id, toasts with the name and removes the driver', async () => {
        h.getDriversByStatus.mockImplementation((status: string) =>
            Promise.resolve(status === 'approved' ? [APPROVED_VIK] : [PENDING_RAM, PENDING_SITA])
        )
        await mountPage()
        await click(exact('Approved')[0])
        await click(exact('Suspend')[0])
        expect(h.suspendDriver).toHaveBeenCalledTimes(1)
        expect(h.suspendDriver).toHaveBeenCalledWith('drv-3')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Vikram Singh suspended')
        expect(text()).not.toContain('Vikram Singh')
    })

    it('a Suspend failure surfaces the user-facing message and keeps the driver', async () => {
        h.getDriversByStatus.mockImplementation((status: string) =>
            Promise.resolve(status === 'approved' ? [APPROVED_VIK] : [PENDING_RAM, PENDING_SITA])
        )
        h.suspendDriver.mockRejectedValue(new UserFacingError('Driver has active trips'))
        await mountPage()
        await click(exact('Approved')[0])
        await click(exact('Suspend')[0])
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Driver has active trips')
        expect(text()).toContain('Vikram Singh')
        expect(exact('Suspend')[0].disabled).toBe(false)
    })

    it('CSV export writes the pinned file name, all visible rows and revokes the object URL', async () => {
        const dl = stubDownload()
        try {
            h.getDriversByStatus.mockResolvedValue([PENDING_RAM, PENDING_SITA])
            await mountPage()
            await click(exact('CSV')[0])

            expect(dl.blobs).toHaveLength(1)
            const csv = await blobText(dl.blobs[0])
            expect(csv.startsWith('"Name","Phone","PAN","Vehicle Type","Home City"')).toBe(true)
            expect(csv).toContain('"Ramesh Kumar","9876543210","ABCDE1234F","Tata 407 (1T)","Jaipur"')
            expect(csv).toContain('"Sita Devi"')
            expect(csv).toContain('"pending"')
            expect(h.toastSuccess).toHaveBeenCalledTimes(1)
            expect(h.toastSuccess).toHaveBeenCalledWith('Exported 2 drivers')
            const anchor = dl.getAnchor()
            expect(anchor?.download).toBe('drivers_pending_2026-11-07.csv')
            expect(anchor?.href).toContain('blob:mock-drivers')
            expect(dl.revoked).toEqual(['blob:mock-drivers'])
        } finally {
            dl.restore()
        }
    })

    it('CSV export honours the active search filter', async () => {
        const dl = stubDownload()
        try {
            await mountPage()
            await type(q('input') as HTMLInputElement, 'pune')
            await click(exact('CSV')[0])
            expect(h.toastSuccess).toHaveBeenCalledWith('Exported 1 drivers')
            const csv = await blobText(dl.blobs[0])
            expect(csv).toContain('Sita Devi')
            expect(csv).not.toContain('Ramesh Kumar')
        } finally {
            dl.restore()
        }
    })

    it('an in-flight action disables that row\'s buttons and shows the in-button spinner', async () => {
        h.approveDriver.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const approveButtons = allButtons().filter((b) => b.classList.contains('bg-emerald-500'))
        expect(approveButtons).toHaveLength(2)

        await click(approveButtons[0] as HTMLButtonElement)
        expect(approveButtons[0].disabled).toBe(true)
        expect(approveButtons[0].querySelector('.animate-spin')).not.toBeNull()
        expect(approveButtons[0].textContent || '').not.toContain('Approve')
        // the same row's Reject button is blocked, the other row stays usable
        const rejectButton = q('button.bg-red-50') as HTMLButtonElement
        expect(rejectButton.disabled).toBe(true)
        expect(approveButtons[1].disabled).toBe(false)
        expect(h.toastSuccess).not.toHaveBeenCalled()
        expect(h.toastError).not.toHaveBeenCalled()
    })
})
