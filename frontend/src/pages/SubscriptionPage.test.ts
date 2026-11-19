import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Billing page invoice history: reads the agency GST invoices (subscription_invoices through
// agency_subscription_invoices()), not the legacy purchaser-keyed invoices table.

const h = vi.hoisted(() => ({
    list: vi.fn(),
    save: vi.fn(),
    text: vi.fn(),
    gst: { status: 'ready', registered: true } as { status: 'loading' | 'ready' | 'error'; registered: boolean | null },
}))

// Registered is the default; the GST branch tests below switch the state.
vi.mock('../hooks/useSellerGstRegistered', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../hooks/useSellerGstRegistered')>()),
    useSellerGstRegistered: () => h.gst,
}))

vi.mock('jspdf', () => ({
    default: class {
        setFont = vi.fn()
        setFontSize = vi.fn()
        setDrawColor = vi.fn()
        setTextColor = vi.fn()
        line = vi.fn()
        splitTextToSize = (value: string) => [value]
        text = h.text
        save = h.save
    },
}))

vi.mock('../services/subscriptionApi', () => ({
    gstInvoicesApi: { list: h.list },
}))

// An active plan, so the plan card (and its GST price note) renders.
const billing = vi.hoisted(() => ({
    entitlement: {
        status: 'active', planTier: 'growth', periodEnd: '2027-01-01T00:00:00Z', trialEnd: null, graceEnd: null,
    },
    view: {
        banner: null, daysLeft: null, canCreate: true, canSettle: true, dispatchLocked: false,
        needsPlan: false, statusLabel: 'Active',
    },
}))

vi.mock('../components/billing/useEntitlement', () => ({
    useEntitlement: () => ({ entitlement: billing.entitlement, view: billing.view, isLoading: false, isError: false, refetch: vi.fn() }),
}))

vi.mock('../components/billing/UsageBars', () => ({ default: () => null }))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'u1', email: 'owner@example.com', name: 'Owner', role: 'agency' } }),
}))

import SubscriptionPage from './SubscriptionPage'

const INVOICE = {
    id: 'inv-1',
    invoice_number: 'TO/26-27/000001',
    issued_at: '2026-07-15T06:00:00Z',
    taxable_paise: 49900,
    cgst_paise: 4491,
    sgst_paise: 4491,
    igst_paise: 0,
    total_paise: 58882,
    place_of_supply_state_code: '27',
    sac_code: '997331',
    recipient_name: null,
    recipient_gstin: null,
    credit_notes: [{ id: 'cn-1', credit_note_number: 'CN/26-27/000001', issued_at: '2026-07-20T06:00:00Z', total_paise: 11800 }],
}

let container: HTMLDivElement
let root: Root

async function render(settleMs = 0) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
        root.render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(SubscriptionPage))))
    })
    await act(async () => {
        await new Promise((r) => setTimeout(r, settleMs))
    })
}

describe('SubscriptionPage invoice history', () => {
    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        h.gst = { status: 'ready', registered: true }
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('lists the agency GST invoices with the stored total and credit note count', async () => {
        h.list.mockResolvedValue([INVOICE])
        await render()
        expect(h.list).toHaveBeenCalledTimes(1)
        expect(container.textContent).toContain('TO/26-27/000001')
        expect(container.textContent).toContain('588.82')
        expect(container.textContent).toContain('1 credit note')
    })

    it('shows the empty state when there are no invoices', async () => {
        h.list.mockResolvedValue([])
        await render()
        expect(container.textContent).toContain('No invoices yet')
    })

    it('shows a retryable error when the invoices cannot be loaded', async () => {
        h.list.mockRejectedValue(new Error('boom'))
        await render(1300) // the page retries once (react-query default 1s delay)
        expect(container.textContent).toContain('We could not load your invoices.')
        expect(container.textContent).toContain('Try again')
    })

    it('downloads a copy built from the stored figures', async () => {
        h.list.mockResolvedValue([INVOICE])
        await render()
        const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Download')
        expect(button).toBeTruthy()
        await act(async () => {
            button!.click()
        })
        expect(h.save).toHaveBeenCalledWith('to-26-27-000001.pdf')
        const written = h.text.mock.calls.map((c) => String(c[0])).join(' | ')
        expect(written).toContain('TO/26-27/000001')
        expect(written).toContain('Total in words')
        expect(written).toContain('Rs. ')
        expect(written).not.toContain('₹')
    })
})

describe('SubscriptionPage accessibility', () => {
    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('names the invoice table and keeps Download buttons 44px high with a focus ring', async () => {
        h.list.mockResolvedValue([INVOICE])
        await render()
        const table = container.querySelector('table')
        expect(table?.getAttribute('aria-labelledby')).toBe('invoice-heading')
        expect(document.getElementById('invoice-heading')?.textContent).toBe('Invoice history')
        const download = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Download')!
        expect(download.className).toContain('min-h-[44px]')
        expect(download.className).toContain('focus-visible:ring-2')
    })
})

const REGISTERED_INVOICE = {
    ...INVOICE,
    gst_rate_pct: 18,
    supplier_gstin: '27ABCDE1234F1Z5',
}

const UNREGISTERED_INVOICE = {
    ...INVOICE,
    id: 'inv-2',
    invoice_number: 'TO/26-27/000002',
    gst_rate_pct: 0,
    supplier_gstin: null,
    taxable_paise: 49900,
    cgst_paise: 0,
    sgst_paise: 0,
    igst_paise: 0,
    total_paise: 49900,
    credit_notes: [],
}

describe('SubscriptionPage GST copy follows the seller GST flag', () => {
    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        h.gst = { status: 'ready', registered: true }
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })
    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('registered: keeps the GST price note and the incl. GST column header', async () => {
        h.list.mockResolvedValue([REGISTERED_INVOICE])
        await render()
        expect(container.textContent).toContain('Prices exclude GST (GST extra at 18%).')
        expect(container.textContent).toContain('Amount (incl. GST)')
        expect(container.textContent).not.toContain('No GST charged')
    })

    it('registered: the download is titled Tax Invoice', async () => {
        h.list.mockResolvedValue([REGISTERED_INVOICE])
        await render()
        const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Download')!
        await act(async () => {
            button.click()
        })
        const written = h.text.mock.calls.map((c) => String(c[0])).join(' | ')
        expect(written).toContain('TruckOpti Subscription Tax Invoice')
        expect(written).toContain('Supplier GSTIN')
        expect(written).toContain('CGST (9%)')
    })

    it('unregistered: says No GST charged, drops the incl. GST header and marks the invoice', async () => {
        h.gst = { status: 'ready', registered: false }
        h.list.mockResolvedValue([UNREGISTERED_INVOICE])
        await render()
        expect(container.textContent).toContain('Prices exclude GST. No GST charged.')
        expect(container.textContent).not.toMatch(/GST extra|18%|incl\. GST/)
        expect(container.textContent).toContain('No GST charged')
        const headers = Array.from(container.querySelectorAll('th')).map((th) => th.textContent)
        expect(headers).toContain('Amount')
    })

    it('unregistered: the download is titled Invoice with no seller GSTIN or tax rows', async () => {
        h.gst = { status: 'ready', registered: false }
        h.list.mockResolvedValue([UNREGISTERED_INVOICE])
        await render()
        const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Download')!
        await act(async () => {
            button.click()
        })
        const written = h.text.mock.calls.map((c) => String(c[0])).join(' | ')
        expect(written).toContain('TruckOpti Subscription Invoice')
        expect(written).not.toContain('Tax Invoice')
        expect(written).toContain('Seller not registered under GST. No GST charged.')
        expect(written).not.toContain('CGST')
        expect(written).not.toContain('Supplier GSTIN')
    })

    it('loading: shows the price before tax and says taxes are shown at checkout', async () => {
        h.gst = { status: 'loading', registered: null }
        h.list.mockResolvedValue([REGISTERED_INVOICE])
        await render()
        expect(container.textContent).toContain('Prices exclude tax. Taxes, if any, are shown at checkout.')
        expect(container.textContent).not.toMatch(/GST extra|18%|No GST charged/)
    })

    it('error: shows the price before tax and says taxes are shown at checkout', async () => {
        h.gst = { status: 'error', registered: null }
        h.list.mockResolvedValue([REGISTERED_INVOICE])
        await render()
        expect(container.textContent).toContain('Taxes, if any, are shown at checkout')
        expect(container.textContent).not.toMatch(/GST extra|18%|incl\. GST/)
    })
})
