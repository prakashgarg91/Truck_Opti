import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pin for AgencyBillingPage over agencyBillingApi.list(): the fetch
// lifecycle (loading / empty / error with no Retry), summary cards, delivered
// job rows, the three GSTR-1 report months, per-format exports (all-delivered
// and per-month) with the GST 5% math, export failure handling, and per-job
// invoice PDF generation.

// FINDING: (a11y) The loading branch renders only a visual spinner — it has no
// role="status" and no aria-busy, so screen readers get silence during fetch.
// FINDING: GSTR-1 bucketing uses the raw UTC month of updated_at
// (updated_at.slice(0, 7)) while every displayed date uses the local timezone,
// so a job delivered near a month boundary can land in a different report
// month than its displayed delivered date.
// FINDING: generateInvoice formats GST and Total with minimumFractionDigits: 2
// only, so the PDF shows three decimals ("GST (5%): ₹61.728",
// "Total: ₹1,296.288") on a tax invoice. It also has no error handling (a
// jspdf failure becomes an unhandled rejection) and the Invoice button has no
// busy state.

const h = vi.hoisted(() => ({
    list: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    logError: vi.fn(),
    downloadCsv: vi.fn(),
    downloadJson: vi.fn(),
    downloadXlsx: vi.fn(),
    jsPdfCtor: vi.fn(),
    jspdfSetFontSize: vi.fn(),
    jspdfText: vi.fn(),
    jspdfSave: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: h.logError },
}))

vi.mock('../utils/dataExport', () => ({
    downloadCsv: h.downloadCsv,
    downloadJson: h.downloadJson,
    downloadXlsx: h.downloadXlsx,
}))

vi.mock('../services/agencyPortalApi', () => ({
    agencyBillingApi: { list: h.list },
}))

vi.mock('jspdf', () => ({ default: h.jsPdfCtor }))

import AgencyBillingPage from './AgencyBillingPage'
import { formatCurrency } from '../utils/formatters'

// Mark the jsdom environment for React 18 act() support.
;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const NOW = new Date('2026-11-06T12:00:00Z')

const SUMMARY = { thisMonth: 45000, pending: 12500, totalPaid: 234567, gstDue: 2250 }

const OCTOBER_JOB = {
    id: 'a1b2c3d4e5f6',
    fare: 1234.56,
    origin: 'Mumbai',
    destination: 'Delhi',
    updated_at: '2026-10-18T12:00:00Z',
    shipment_id: 'SHPMT-2026-0011',
}

const SEPTEMBER_JOB = {
    id: 'job-xyz-12345678',
    fare: 500,
    origin: 'Pune',
    destination: 'Nashik',
    updated_at: '2026-09-05T12:00:00Z',
    shipment_id: '',
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(AgencyBillingPage))
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
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test((b.textContent || '').trim()))

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

// One of the CSV/XLSX/JSON buttons inside a GSTR-1 report row (e.g. "October 2026").
function reportButton(label: string, format: 'CSV' | 'XLSX' | 'JSON'): HTMLButtonElement {
    const row = Array.from((container as HTMLElement).querySelectorAll('div.py-2')).find((d) =>
        (d.textContent || '').includes(label),
    ) as HTMLElement
    return Array.from(row.querySelectorAll('button')).find(
        (b) => (b.textContent || '').trim() === format,
    ) as HTMLButtonElement
}

const EXPORT_COLUMN_LABELS = [
    'Shipment ID',
    'Origin',
    'Destination',
    'Delivered Date',
    'Taxable Value (INR)',
    'GST 5% (INR)',
    'Invoice Total (INR)',
]

describe('AgencyBillingPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Pinned clock for the monthly report labels and date formatting; only
        // Date is faked so the real-timer flushes inside act() keep working.
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(NOW)
        h.list.mockResolvedValue({ summary: SUMMARY, jobs: [OCTOBER_JOB, SEPTEMBER_JOB] })
        h.downloadXlsx.mockResolvedValue(undefined)
        h.jsPdfCtor.mockImplementation(() => ({
            setFontSize: h.jspdfSetFontSize,
            text: h.jspdfText,
            save: h.jspdfSave,
        }))
    })

    it('loading renders the spinner and no page content', async () => {
        h.list.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('svg.animate-spin')).not.toBeNull()
        expect(q('h1')).toBeNull()
    })

    it('sets the browser tab title on mount', async () => {
        await mountPage()
        expect(document.title).toBe('Billing & Invoices - TruckOpti')
    })

    it('fetches billing data exactly once on mount', async () => {
        await mountPage()
        expect(h.list).toHaveBeenCalledTimes(1)
        expect(h.list).toHaveBeenCalledWith()
    })

    it('a fetch failure shows the error toast, logs, and renders the zeroed empty page (no Retry exists)', async () => {
        h.list.mockRejectedValueOnce(new Error('edge function down'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load billing data')
        expect(h.logError).toHaveBeenCalledWith('[AgencyBillingPage] fetchBilling failed:', expect.any(Error))
        expect(text()).toContain('No invoices yet')
        expect(text()).toContain(formatCurrency(0))
        expect(buttons(/Retry/)).toHaveLength(0)
    })

    it('empty state shows the invoice placeholder and no export-all buttons', async () => {
        h.list.mockResolvedValue({ summary: { thisMonth: 0, pending: 0, totalPaid: 0, gstDue: 0 }, jobs: [] })
        await mountPage()
        expect(text()).toContain('No invoices yet')
        expect(text()).toContain('Invoices will appear here once you complete your first job')
        expect(buttons(/Export CSV|Export XLSX|Export JSON/)).toHaveLength(0)
    })

    it('renders the four summary cards with formatted values', async () => {
        await mountPage()
        expect(text()).toContain('Billing & Invoices')
        expect(text()).toContain('Revenue overview and invoice management')
        expect(text()).toContain('This Month')
        expect(text()).toContain('In Progress Value')
        expect(text()).toContain('Total Paid')
        expect(text()).toContain('GST Due (5%)')
        expect(text()).toContain(formatCurrency(SUMMARY.thisMonth))
        expect(text()).toContain(formatCurrency(SUMMARY.pending))
        expect(text()).toContain(formatCurrency(SUMMARY.totalPaid))
        expect(text()).toContain(formatCurrency(SUMMARY.gstDue))
    })

    it('lists delivered jobs with route, date, shipment tail and fare', async () => {
        await mountPage()
        expect(text()).toContain('Invoices (2)')
        expect(text()).toContain('Mumbai → Delhi')
        expect(text()).toContain('18 Oct 2026')
        expect(text()).toContain('#' + OCTOBER_JOB.shipment_id.slice(-8))
        expect(text()).toContain(formatCurrency(OCTOBER_JOB.fare))
        expect(text()).toContain('Pune → Nashik')
        expect(text()).toContain('05 Sept 2026')
    })

    it('falls back to the job id tail when shipment_id is empty', async () => {
        await mountPage()
        expect(text()).toContain('#' + SEPTEMBER_JOB.id.slice(-8))
    })

    it('uses one heading per section (h1 title, h3 reports, h3 invoices)', async () => {
        await mountPage()
        expect(q('h1')?.textContent).toBe('Billing & Invoices')
        const h3s = Array.from((container as HTMLElement).querySelectorAll('h3')).map((el) => el.textContent)
        expect(h3s).toContain('GST Reports')
        expect(h3s).toContain('Invoices (2)')
    })

    it('offers the three previous calendar months as GSTR-1 reports (pinned clock)', async () => {
        await mountPage()
        expect(text()).toContain('GSTR-1 (October 2026)')
        expect(text()).toContain('GSTR-1 (September 2026)')
        expect(text()).toContain('GSTR-1 (August 2026)')
        expect(text()).not.toContain('GSTR-1 (November 2026)')
        expect(text()).toContain('coming in Phase 4')
        for (const label of ['October 2026', 'September 2026', 'August 2026']) {
            expect(reportButton(label, 'CSV')).toBeTruthy()
            expect(reportButton(label, 'XLSX')).toBeTruthy()
            expect(reportButton(label, 'JSON')).toBeTruthy()
        }
    })

    it('Export CSV sends all jobs with the GST 5% math, the export columns and the all-delivered filename', async () => {
        await mountPage()
        await click(buttons(/Export CSV/)[0])
        expect(h.downloadCsv).toHaveBeenCalledTimes(1)
        const [rows, columns, filename] = h.downloadCsv.mock.calls[0]
        expect(filename).toBe('truckopti-agency-earnings-all-delivered.csv')
        expect(columns.map((c: { label: string }) => c.label)).toEqual(EXPORT_COLUMN_LABELS)
        expect(rows).toEqual([
            {
                shipmentId: 'SHPMT-2026-0011',
                origin: 'Mumbai',
                destination: 'Delhi',
                deliveredDate: '18/10/2026',
                taxableValue: 1234.56,
                gstAmount: 61.73,
                invoiceTotal: 1296.29,
            },
            {
                shipmentId: '12345678',
                origin: 'Pune',
                destination: 'Nashik',
                deliveredDate: '5/9/2026',
                taxableValue: 500,
                gstAmount: 25,
                invoiceTotal: 525,
            },
        ])
        expect(h.toastSuccess).toHaveBeenCalledWith('CSV exported successfully!')
    })

    it('Export JSON sends the same rows under the .json filename', async () => {
        await mountPage()
        await click(buttons(/Export JSON/)[0])
        expect(h.downloadJson).toHaveBeenCalledTimes(1)
        const [rows, filename] = h.downloadJson.mock.calls[0]
        expect(filename).toBe('truckopti-agency-earnings-all-delivered.json')
        expect(rows).toHaveLength(2)
        expect(rows[0].gstAmount).toBe(61.73)
    })

    it('Export XLSX passes the Agency Earnings sheet name and succeeds', async () => {
        await mountPage()
        await click(buttons(/Export XLSX/)[0])
        expect(h.downloadXlsx).toHaveBeenCalledTimes(1)
        const [rows, , filename, sheet] = h.downloadXlsx.mock.calls[0]
        expect(filename).toBe('truckopti-agency-earnings-all-delivered.xlsx')
        expect(sheet).toBe('Agency Earnings')
        expect(rows).toHaveLength(2)
        expect(h.toastSuccess).toHaveBeenCalledWith('XLSX exported successfully!')
    })

    it('a monthly GSTR-1 CSV export filters jobs to that month and names the file after it', async () => {
        await mountPage()
        await click(reportButton('October 2026', 'CSV'))
        expect(h.downloadCsv).toHaveBeenCalledTimes(1)
        const [rows, , filename] = h.downloadCsv.mock.calls[0]
        expect(filename).toBe('truckopti-agency-earnings-2026-10.csv')
        expect(rows).toHaveLength(1)
        expect(rows[0].shipmentId).toBe('SHPMT-2026-0011')
    })

    it('exporting a month with no delivered jobs shows the month-specific toast and downloads nothing', async () => {
        await mountPage()
        await click(reportButton('August 2026', 'CSV'))
        expect(h.downloadCsv).not.toHaveBeenCalled()
        expect(h.toastError).toHaveBeenCalledWith('No delivered jobs found for this report month')
    })

    it('a failed export logs and shows the export failure toast', async () => {
        h.downloadXlsx.mockRejectedValueOnce(new Error('disk full'))
        await mountPage()
        await click(buttons(/Export XLSX/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Failed to export delivered jobs')
        expect(h.logError).toHaveBeenCalledWith('[AgencyBillingPage] export failed:', expect.any(Error))
    })

    it('the Invoice button generates a PDF with the invoice number, route and GST lines', async () => {
        await mountPage()
        await click(buttons(/^Invoice$/)[0])
        expect(h.jsPdfCtor).toHaveBeenCalledTimes(1)
        const lines = h.jspdfText.mock.calls.map((call) => call[0])
        expect(lines).toContain('TruckOpti Tax Invoice')
        expect(lines).toContain('Invoice #: TRK-A1B2C3D4')
        expect(lines).toContain('Date: 18/10/2026')
        expect(lines).toContain('Route: Mumbai → Delhi')
        expect(lines).toContain('Subtotal: ₹1,234.56')
        expect(lines).toContain('GST (5%): ₹61.728')
        expect(lines).toContain('Total: ₹1,296.288')
        expect(lines).toContain('Thank you for using TruckOpti!')
        expect(h.jspdfSave).toHaveBeenCalledWith('TruckOpti-Invoice-a1b2c3d4.pdf')
    })
})
