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

vi.mock('../components/billing/useEntitlement', () => ({
    useEntitlement: () => ({ entitlement: undefined, view: null, isLoading: false, isError: false, refetch: vi.fn() }),
}))

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
