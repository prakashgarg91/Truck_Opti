import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-148 Freight Invoices: loading / empty / denied / error states, list with
// status chips and outstanding, issue form (live preview, gating, exact RPC
// arguments, one key per intent), payment form (rupees to paise, overpayment,
// refusals), UPI link (never persisted) and cancel with a reason.

const h = vi.hoisted(() => ({
    listClients: vi.fn(),
    listInvoices: vi.fn(),
    listInvoiceableGrs: vi.fn(),
    getInvoiceDetail: vi.fn(),
    issueInvoice: vi.fn(),
    recordPayment: vi.fn(),
    cancelInvoice: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyInvoicesApi', () => ({
    agencyInvoicesApi: {
        listClients: h.listClients,
        listInvoices: h.listInvoices,
        listInvoiceableGrs: h.listInvoiceableGrs,
        getInvoiceDetail: h.getInvoiceDetail,
        issueInvoice: h.issueInvoice,
        recordPayment: h.recordPayment,
        cancelInvoice: h.cancelInvoice,
    },
}))

import AgencyInvoicesPage from './AgencyInvoicesPage'
import { withGate, gateFor, sbError, SB002_ERROR } from '../components/billing/testGate'
import type { BillingGate } from '../components/billing/BillingGate'
import { UserFacingError } from '../utils/userFacingError'

const CLIENT = { id: 'c-1', client_name: 'Sri Balaji Transport', status: 'active' }

function invoice(over: Record<string, unknown> = {}) {
    return {
        id: 'i-1', client_id: 'c-1', invoice_number: 'INV/2026-27/000001', status: 'issued',
        supplier_state_code: '27', place_of_supply_state_code: '07', gst_rate_pct: 18, reverse_charge: false,
        subtotal_paise: 100000, cgst_paise: 0, sgst_paise: 0, igst_paise: 18000, round_off_paise: 0,
        total_paise: 118000, paid_paise: 0, version: 1, cancelled_reason: null, created_at: '2026-11-10T00:00:00Z',
        ...over,
    }
}
const DETAIL = {
    lines: [{ id: 'l-1', invoice_id: 'i-1', line_no: 1, description: 'Freight Pune to Delhi', quantity: 1, rate_paise: 100000, amount_paise: 100000 }],
    payments: [],
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(gate?: BillingGate): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(gate ? withGate(createElement(AgencyInvoicesPage), gate) : createElement(AgencyInvoicesPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    h.listClients.mockResolvedValue([CLIENT])
    h.listInvoices.mockResolvedValue([invoice()])
    h.listInvoiceableGrs.mockResolvedValue([])
    h.getInvoiceDetail.mockResolvedValue(DETAIL)
})

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const button = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).find((b) => re.test(b.textContent || '') || re.test(b.getAttribute('aria-label') || '')) as HTMLButtonElement | undefined

async function click(b: HTMLButtonElement) {
    await act(async () => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}
async function setValue(el: Element, value: string) {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    await act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value)
        el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}
async function submit(form: Element) {
    await act(async () => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function fillValidForm() {
    if (!q('[data-testid="invoice-form"]')) await click(button(/New invoice/)!)
    await setValue(q('#inv-client')!, 'c-1')
    await setValue(q('#line-desc-0')!, 'Freight Pune to Delhi')
    await setValue(q('#line-qty-0')!, '2.5')
    await setValue(q('#line-rate-0')!, '1,000.50')
    await setValue(q('#inv-supplier')!, '27')
    await setValue(q('#inv-place')!, '07')
}

async function openInvoice() {
    await click(button(/Open invoice INV/)!)
}

describe('AgencyInvoicesPage', () => {
    it('shows a busy loading state', async () => {
        h.listInvoices.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="invoices-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the empty state', async () => {
        h.listInvoices.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="invoices-empty"]')).not.toBeNull()
    })

    it('shows the denied state for a scope refusal', async () => {
        h.listInvoices.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="invoices-denied"]')).not.toBeNull()
    })

    it('shows an error alert with a Retry that reloads once', async () => {
        h.listInvoices.mockRejectedValueOnce(new UserFacingError('Failed to load invoices'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load invoices')
        await click(button(/^Retry/)!)
        expect(h.listInvoices).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
    })

    it('lists invoices with a status chip and the outstanding amount in Indian grouping', async () => {
        h.listInvoices.mockResolvedValue([
            invoice({ total_paise: 12345678, paid_paise: 100000, status: 'partly_paid' }),
            invoice({ id: 'i-2', invoice_number: 'INV/2026-27/000002', status: 'cancelled', total_paise: 5000 }),
        ])
        await mountPage()
        const list = q('[data-testid="invoice-list"]')!.textContent!
        expect(list).toContain('Partly paid')
        expect(list).toContain('Total ₹1,23,456.78')
        expect(list).toContain('Outstanding ₹1,22,456.78')
        expect(list).toContain('Cancelled')
        expect(list).toContain('Outstanding ₹0.00')
    })

    it('shows a live preview and gates Issue until the form is valid', async () => {
        await mountPage()
        await click(button(/New invoice/)!)
        expect(button(/^Issue invoice/)!.disabled).toBe(true)
        await fillValidForm()
        // 2.5 x 1000.50 = 2501.25, inter-state IGST 18% = 450.23 (half-up), total 2951.48
        const preview = q('[data-testid="invoice-preview"]')!.textContent!
        expect(preview).toContain('₹2,501.25')
        expect(preview).toContain('IGST 18%')
        expect(preview).toContain('₹2,951.48')
        expect(button(/^Issue invoice/)!.disabled).toBe(false)
        await setValue(q('#inv-place')!, '99')
        expect(button(/^Issue invoice/)!.disabled).toBe(true)
        expect(text()).toContain('state codes (01 to 38)')
    })

    it('issues with the exact payload, one key, and shows the server total after the single refetch', async () => {
        h.issueInvoice.mockResolvedValue({ ok: true, invoiceId: 'i-1', invoiceNumber: 'INV/2026-27/000001', replay: false })
        h.listInvoices.mockResolvedValueOnce([]).mockResolvedValue([invoice({ total_paise: 295148 })])
        await mountPage()
        await fillValidForm()
        await submit(q('[data-testid="invoice-form"]')!)
        expect(h.issueInvoice).toHaveBeenCalledTimes(1)
        const arg = h.issueInvoice.mock.calls[0][0]
        expect(arg).toMatchObject({
            clientId: 'c-1', supplierState: '27', placeOfSupplyState: '07', gstRatePct: 18, reverseCharge: false, roundOff: false,
            lines: [{ description: 'Freight Pune to Delhi', quantity: 2.5, ratePaise: 100050 }],
        })
        expect(typeof arg.idempotencyKey).toBe('string')
        expect(h.toastSuccess).toHaveBeenCalledWith('Invoice issued')
        expect(h.listInvoices).toHaveBeenCalledTimes(2)
        expect(q('[data-testid="invoice-issued"]')?.textContent).toContain('Server total ₹2,951.48')
        expect(q('[data-testid="invoice-detail"]')).not.toBeNull()
    })

    it('shows server line problems and keeps the same key for an unchanged retry', async () => {
        h.issueInvoice
            .mockResolvedValueOnce({ ok: false, error: 'invalid_line', message: 'Some line items were rejected.', problems: [{ index: 0, message: 'Description is required (max 500 characters).' }] })
            .mockResolvedValueOnce({ ok: false, error: 'invalid_total', message: 'The invoice total must be more than zero.', problems: [] })
        await mountPage()
        await fillValidForm()
        await submit(q('[data-testid="invoice-form"]')!)
        expect(q('[data-testid="invoice-issue-refused"]')?.textContent).toContain('Line 1: Description is required')
        expect(h.toastError).toHaveBeenCalledTimes(1)
        await submit(q('[data-testid="invoice-form"]')!)
        expect(h.issueInvoice.mock.calls[1][0].idempotencyKey).toBe(h.issueInvoice.mock.calls[0][0].idempotencyKey)
        await setValue(q('#line-qty-0')!, '3')
        await submit(q('[data-testid="invoice-form"]')!)
        expect(h.issueInvoice.mock.calls[2][0].idempotencyKey).not.toBe(h.issueInvoice.mock.calls[0][0].idempotencyKey)
    })

    it('shows the detail with server totals, lines and payments', async () => {
        h.getInvoiceDetail.mockResolvedValue({
            ...DETAIL,
            payments: [{ id: 'p-1', invoice_id: 'i-1', amount_paise: 50000, method: 'upi', reference: 'UTR9', received_on: '2026-11-11', created_at: '2026-11-11T00:00:00Z' }],
        })
        await mountPage()
        await openInvoice()
        expect(q('[data-testid="invoice-totals"]')?.textContent).toContain('₹1,180.00')
        expect(text()).toContain('Freight Pune to Delhi')
        expect(q('[data-testid="invoice-payments"]')?.textContent).toContain('₹500.00 · UPI · UTR9')
    })

    it('records a payment converting rupees to integer paise and refetches once', async () => {
        h.recordPayment.mockResolvedValue({ ok: true, paidPaise: 100010, status: 'partly_paid', version: 2, replay: false })
        await mountPage()
        await openInvoice()
        await setValue(q('#pay-amount')!, '1,000.10')
        await setValue(q('#pay-method')!, 'bank')
        await setValue(q('#pay-reference')!, 'UTR123')
        await setValue(q('#pay-date')!, '2026-11-11')
        const listCalls = h.listInvoices.mock.calls.length
        await submit(q('[data-testid="payment-form"]')!)
        expect(h.recordPayment).toHaveBeenCalledTimes(1)
        expect(h.recordPayment.mock.calls[0][0]).toMatchObject({
            invoiceId: 'i-1', amountPaise: 100010, method: 'bank', reference: 'UTR123', receivedOn: '2026-11-11', expectedVersion: 1,
        })
        expect(typeof h.recordPayment.mock.calls[0][0].idempotencyKey).toBe('string')
        expect(h.listInvoices.mock.calls.length).toBe(listCalls + 1)
        expect(q('[data-testid="payment-success"]')?.textContent).toContain('₹1,000.10')
    })

    it('blocks an overpayment and a bad amount before calling the server', async () => {
        await mountPage()
        await openInvoice()
        await setValue(q('#pay-amount')!, '1180.01')
        expect(button(/^Record payment/)!.disabled).toBe(true)
        expect(text()).toContain('more than the outstanding ₹1,180.00')
        await setValue(q('#pay-amount')!, '12.345')
        expect(button(/^Record payment/)!.disabled).toBe(true)
        await submit(q('[data-testid="payment-form"]')!)
        expect(h.recordPayment).not.toHaveBeenCalled()
    })

    it('explains a payment refusal in plain language', async () => {
        h.recordPayment.mockResolvedValue({ ok: false, error: 'version_conflict', message: 'This invoice changed since you opened it. Reload to continue.', currentVersion: 3 })
        await mountPage()
        await openInvoice()
        await setValue(q('#pay-amount')!, '10')
        await submit(q('[data-testid="payment-form"]')!)
        expect(q('[data-testid="payment-refused"]')?.textContent).toContain('This invoice changed')
        expect(h.toastError).toHaveBeenCalledTimes(1)
    })

    it('builds and copies a UPI link from a VPA typed on screen, and never stores it', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        const setItem = vi.spyOn(Storage.prototype, 'setItem')
        await mountPage()
        await openInvoice()
        expect(q('[data-testid="upi-link"]')).toBeNull()
        await setValue(q('#upi-vpa')!, 'agency@okbank')
        await setValue(q('#upi-name')!, 'Sri Balaji')
        const link = q('[data-testid="upi-link"]')!.textContent!
        expect(link).toBe('upi://pay?pa=agency%40okbank&pn=Sri%20Balaji&am=1180.00&tn=INV%2F2026-27%2F000001&cu=INR')
        await click(button(/Copy pay link/)!)
        expect(writeText).toHaveBeenCalledWith(link)
        expect(setItem).not.toHaveBeenCalled()
        setItem.mockRestore()
    })

    it('cancels an unpaid invoice only with a reason', async () => {
        h.cancelInvoice.mockResolvedValue({ ok: true, version: 2 })
        await mountPage()
        await openInvoice()
        await click(button(/^Cancel invoice/)!)
        await click(button(/Confirm cancel invoice/)!)
        expect(h.cancelInvoice).not.toHaveBeenCalled()
        expect(q('[data-testid="cancel-refused"]')?.textContent).toContain('Enter a reason')
        await setValue(q('#cancel-reason')!, 'Wrong client')
        await click(button(/Confirm cancel invoice/)!)
        expect(h.cancelInvoice).toHaveBeenCalledWith('i-1', 1, 'Wrong client')
        expect(h.toastSuccess).toHaveBeenCalledWith('Invoice cancelled')
    })

    it('offers no payment or cancel actions on a paid or cancelled invoice', async () => {
        h.listInvoices.mockResolvedValue([invoice({ status: 'paid', paid_paise: 118000 })])
        await mountPage()
        await openInvoice()
        expect(q('[data-testid="payment-form"]')).toBeNull()
        expect(q('[data-testid="cancel-section"]')).toBeNull()
    })
})

describe('AgencyInvoicesPage subscription guard', () => {
    it('shows the read-only prompt when issue is refused with SB002', async () => {
        h.issueInvoice.mockRejectedValue(sbError(SB002_ERROR))
        await mountPage()
        await fillValidForm()
        await submit(q('[data-testid="invoice-form"]')!)
        expect(q('[role="alert"]')?.textContent).toContain('read-only')
        expect(h.toastError).not.toHaveBeenCalled()
    })

    it('settle semantics: New invoice stays open in grace, locks in expired and cancelled', async () => {
        await mountPage(gateFor('grace'))
        expect(button(/New invoice/)!.disabled).toBe(false)
        await act(async () => root!.unmount())
        container?.remove()
        for (const status of ['expired', 'cancelled'] as const) {
            await mountPage(gateFor(status))
            const b = button(/New invoice/)!
            expect(b.disabled).toBe(true)
            expect(b.title).toContain('expired')
            await act(async () => root!.unmount())
        container?.remove()
        }
        await mountPage(gateFor('none'))
        expect(button(/New invoice/)!.disabled).toBe(false)
    })

    it('keeps record payment and cancel invoice open when settlement is locked', async () => {
        await mountPage(gateFor('expired'))
        await openInvoice()
        expect(q('[data-testid="payment-form"]')).not.toBeNull()
        expect(button(/^Cancel invoice/)!.disabled).toBe(false)
    })
})

describe('AgencyInvoicesPage GR shortcut, outstanding by client and CSV export', () => {
    const OTHER = { id: 'c-2', client_name: 'Other Client', status: 'active' }
    const GR_A = { consignmentId: 'g-1', grNumber: 'AGY/2026-27/000001', status: 'delivered', clientId: 'c-1' }
    const GR_B = { consignmentId: 'g-2', grNumber: 'AGY/2026-27/000002', status: 'receipt_confirmed', clientId: 'c-2' }
    const lineInputs = () => Array.from((container as HTMLElement).querySelectorAll('[data-testid="invoice-line-0"] input')) as HTMLInputElement[]

    it('opens the form for the GR client with a Freight line and leaves the rate for the user', async () => {
        h.listInvoiceableGrs.mockResolvedValue([GR_A])
        await mountPage()
        await click(button(/Create invoice from consignment AGY\/2026-27\/000001/)!)
        expect(q('[data-testid="invoice-form"]')).not.toBeNull()
        expect((q('#inv-client') as HTMLSelectElement).value).toBe('c-1')
        expect(lineInputs()[0].value).toBe('Freight for GR AGY/2026-27/000001')
        expect(lineInputs()[1].value).toBe('1')
        expect(lineInputs()[2].value).toBe('')
    })

    it('refuses to replace typed lines with a GR for another client', async () => {
        h.listClients.mockResolvedValue([CLIENT, OTHER])
        h.listInvoiceableGrs.mockResolvedValue([GR_A, GR_B])
        await mountPage()
        await click(button(/Create invoice from consignment AGY\/2026-27\/000001/)!)
        await click(button(/Create invoice from consignment AGY\/2026-27\/000002/)!)
        expect(q('[data-testid="invoice-from-gr-note"]')?.textContent).toContain('another client')
        expect((q('#inv-client') as HTMLSelectElement).value).toBe('c-1')
    })

    it('shows outstanding per client from issued and partly paid invoices only, in rupees', async () => {
        h.listClients.mockResolvedValue([CLIENT, OTHER])
        h.listInvoices.mockResolvedValue([
            invoice({ id: 'i-1', client_id: 'c-1', invoice_number: 'INV/1', status: 'issued', total_paise: 118000, paid_paise: 0 }),
            invoice({ id: 'i-2', client_id: 'c-1', invoice_number: 'INV/2', status: 'partly_paid', total_paise: 50000, paid_paise: 20000 }),
            invoice({ id: 'i-3', client_id: 'c-1', invoice_number: 'INV/3', status: 'paid', total_paise: 10000, paid_paise: 10000 }),
            invoice({ id: 'i-4', client_id: 'c-2', invoice_number: 'INV/4', status: 'cancelled', total_paise: 99900, paid_paise: 0 }),
            invoice({ id: 'i-5', client_id: 'c-2', invoice_number: 'INV/5', status: 'issued', total_paise: 200000, paid_paise: 0 }),
        ])
        await mountPage()
        const box = q('[data-testid="outstanding-by-client"]') as HTMLElement
        const rows = Array.from(box.querySelectorAll('li')).map((li) => li.textContent)
        expect(rows).toEqual(['Other Client₹2,000.00', 'Sri Balaji Transport₹1,480.00'])
        expect(q('[data-testid="outstanding-total"]')?.textContent).toBe('₹3,480.00')
    })

    it('exports the visible invoice list as CSV with formula cells guarded', async () => {
        h.listClients.mockResolvedValue([CLIENT, { id: 'c-3', client_name: '=2+3 Logistics', status: 'active' }])
        h.listInvoices.mockResolvedValue([
            invoice({ client_id: 'c-3', invoice_number: 'INV/2026-27/000001', status: 'issued', total_paise: 118000, paid_paise: 0 }),
        ])
        const createUrl = vi.fn((_blob: Blob) => 'blob:csv')
        const urlApi = URL as unknown as Record<string, unknown>
        urlApi.createObjectURL = createUrl
        urlApi.revokeObjectURL = vi.fn()
        const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
        try {
            await mountPage()
            await click(button(/Export CSV/)!)
            expect(clickSpy).toHaveBeenCalled()
            const blob = createUrl.mock.calls[0][0] as Blob
            const csv = (await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(String(reader.result))
                reader.onerror = () => reject(reader.error)
                reader.readAsText(blob)
            })).replace(String.fromCharCode(0xfeff), '')
            const lines = csv.trimEnd().split('\r\n')
            expect(lines[0]).toBe('Invoice,Client,Status,Issued on,Total (INR),Received (INR),Outstanding (INR)')
            expect(lines[1]).toBe("INV/2026-27/000001,'=2+3 Logistics,Issued,2026-11-10,1180.00,0.00,1180.00")
        } finally {
            clickSpy.mockRestore()
            delete urlApi.createObjectURL
            delete urlApi.revokeObjectURL
        }
    })

    it('disables the CSV export when there are no invoices', async () => {
        h.listInvoices.mockResolvedValue([])
        await mountPage()
        expect(button(/Export CSV/)!.disabled).toBe(true)
    })
})
