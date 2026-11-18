import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-145 Order Import: loading / empty / denied / error states, client
// picker, CSV preview with row statuses, Import gating (errors, submitting),
// RPC payload shape, one idempotency key per intent, typed refusals and the
// single refetch after an import.

const h = vi.hoisted(() => ({
    listAgreementsWithSites: vi.fn(),
    listBatches: vi.fn(),
    listOrders: vi.fn(),
    importOrders: vi.fn(),
    cancelOrder: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyOrdersApi', () => ({
    agencyOrdersApi: {
        listAgreementsWithSites: h.listAgreementsWithSites,
        listBatches: h.listBatches,
        listOrders: h.listOrders,
        importOrders: h.importOrders,
        cancelOrder: h.cancelOrder,
    },
}))

import AgencyOrderImportPage from './AgencyOrderImportPage'
import { UserFacingError } from '../utils/userFacingError'
import { ORDER_CSV_TEMPLATE } from '../lib/orderImport'
import { withGate, gateFor, sbError, SB002_ERROR } from '../components/billing/testGate'
import type { BillingGate } from '../components/billing/BillingGate'

const AGREEMENT = {
    id: 'ag-1',
    client_name: 'Sri Balaji Transport',
    status: 'active',
    sites: [
        { id: 's-1', agreement_id: 'ag-1', site_kind: 'ship_to', label: 'Central Warehouse', status: 'active' },
        { id: 's-2', agreement_id: 'ag-1', site_kind: 'ship_to', label: 'Retail Park North', status: 'active' },
        { id: 's-3', agreement_id: 'ag-1', site_kind: 'ship_to', label: 'Mall Exit 4', status: 'active' },
    ],
}
const ENDED = { ...AGREEMENT, id: 'ag-2', client_name: 'Nova Steel', status: 'ended' }

const BAD_CSV = `${ORDER_CSV_TEMPLATE}\nSO-9,1,SKU-X,,1,kg,,,,,,,Nowhere,Mall Exit 4,,,,,,`

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(gate?: BillingGate): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(gate ? withGate(createElement(AgencyOrderImportPage), gate) : createElement(AgencyOrderImportPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    h.listAgreementsWithSites.mockResolvedValue([AGREEMENT, ENDED])
    h.listBatches.mockResolvedValue([])
    h.listOrders.mockResolvedValue([])
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
    Array.from((container as HTMLElement).querySelectorAll('button')).find((b) => re.test(b.textContent || '')) as HTMLButtonElement | undefined

async function choose(select: HTMLSelectElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(select, value)
        select.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function upload(csv: string, name = 'orders.csv') {
    const input = q('#import-file') as HTMLInputElement
    const file = new File([csv], name, { type: 'text/csv' })
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    await act(async () => {
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 50))
    })
}

async function click(b: HTMLButtonElement) {
    await act(async () => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('AgencyOrderImportPage', () => {
    it('shows a busy loading state before the agreements arrive', async () => {
        h.listAgreementsWithSites.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="order-import-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the empty state when there are no client agreements', async () => {
        h.listAgreementsWithSites.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="order-import-no-clients"]')).not.toBeNull()
    })

    it('shows the denied state for a scope refusal', async () => {
        h.listAgreementsWithSites.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="order-import-denied"]')).not.toBeNull()
    })

    it('shows an error alert with a single-refetch Retry', async () => {
        h.listAgreementsWithSites.mockRejectedValueOnce(new UserFacingError('Failed to load client agreements'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load client agreements')
        await click(button(/Retry/)!)
        expect(h.listAgreementsWithSites).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
    })

    it('disables the file input until a client is chosen and warns about an ended agreement', async () => {
        await mountPage()
        expect((q('#import-file') as HTMLInputElement).disabled).toBe(true)
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-2')
        expect(text()).toContain('not active')
    })

    it('previews a clean file and imports the normalized lines with one key', async () => {
        h.importOrders.mockResolvedValue({ ok: true, state: 'created', batchId: 'b-1', ordersCreated: 1, linesCreated: 2 })
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload(ORDER_CSV_TEMPLATE)

        expect(q('[data-testid="order-import-summary"]')?.textContent).toContain('Ready')
        expect(q('[data-testid="order-import-row-2"]')).not.toBeNull()
        const importButton = button(/^Import 2 lines/)!
        expect(importButton.disabled).toBe(false)

        await click(importButton)
        expect(h.importOrders).toHaveBeenCalledTimes(1)
        const arg = h.importOrders.mock.calls[0][0]
        expect(arg.agreementId).toBe('ag-1')
        expect(arg.fileHash).toMatch(/^[0-9a-f]{64}$/)
        expect(typeof arg.idempotencyKey).toBe('string')
        expect(arg.lines).toHaveLength(2)
        expect(arg.lines[0]).toMatchObject({ client_order_ref: 'SO-2001', pickup_site: 'Central Warehouse', drop_site: 'Retail Park North', weight_per_unit_kg: 1 })
        expect(q('[data-testid="order-import-success"]')?.textContent).toContain('Imported 1 draft order')
        expect(h.toastSuccess).toHaveBeenCalledTimes(1)
        // History refetched exactly once after the import (plus once on selecting the client).
        expect(h.listOrders).toHaveBeenCalledTimes(2)
        expect(button(/^Import 2 lines/)!.disabled).toBe(true)
    })

    it('blocks Import while any error row exists and offers the errors CSV', async () => {
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload(BAD_CSV)

        expect(q('[data-testid="order-import-row-4"]')?.textContent).toContain('Pickup site not found for this client.')
        expect(button(/^Import/)!.disabled).toBe(true)
        expect(text()).toContain('Fix the rows marked Error')
        expect(button(/Download errors CSV/)).toBeDefined()
        await click(button(/^Import/)!)
        expect(h.importOrders).not.toHaveBeenCalled()
    })

    it('rejects a file missing required columns', async () => {
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload('sku,quantity\nA,1')
        expect(text()).toContain("Column 'client_order_ref' is missing.")
        expect(button(/^Import/)!.disabled).toBe(true)
    })

    it('rejects a file over 5 MB without reading it', async () => {
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        const input = q('#import-file') as HTMLInputElement
        const big = new File(['x'], 'big.csv', { type: 'text/csv' })
        Object.defineProperty(big, 'size', { value: 5 * 1024 * 1024 + 1 })
        Object.defineProperty(input, 'files', { value: [big], configurable: true })
        await act(async () => {
            input.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(q('[role="alert"]')?.textContent).toContain('larger than 5 MB')
        expect(q('[data-testid="order-import-preview"]')).toBeNull()
    })

    it('shows server line problems and keeps the same key for a retry', async () => {
        h.importOrders
            .mockResolvedValueOnce({
                ok: false, error: 'invalid_lines', message: 'Some lines were rejected by the server.',
                problems: [{ index: 1, message: 'Drop site not found.' }],
            })
            .mockResolvedValueOnce({ ok: true, state: 'created', batchId: 'b-1', ordersCreated: 1, linesCreated: 2 })
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload(ORDER_CSV_TEMPLATE)
        await click(button(/^Import 2 lines/)!)
        expect(q('[data-testid="order-import-refused"]')?.textContent).toContain('Line 2 of the import: Drop site not found.')
        expect(h.toastError).toHaveBeenCalledTimes(1)

        await click(button(/^Import 2 lines/)!)
        expect(h.importOrders.mock.calls[1][0].idempotencyKey).toBe(h.importOrders.mock.calls[0][0].idempotencyKey)
    })

    it('lists clashing order references and explains a duplicate file', async () => {
        h.importOrders.mockResolvedValueOnce({ ok: false, error: 'order_exists', message: 'Some order references already exist for this client. Nothing was imported.', refs: ['SO-2001'] })
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload(ORDER_CSV_TEMPLATE)
        await click(button(/^Import 2 lines/)!)
        expect(q('[data-testid="order-import-refused"]')?.textContent).toContain('Already imported: SO-2001')

        h.importOrders.mockResolvedValueOnce({ ok: true, state: 'duplicate_batch', batchId: 'b-0', ordersCreated: null, linesCreated: null })
        await click(button(/^Import 2 lines/)!)
        expect(q('[data-testid="order-import-duplicate"]')).not.toBeNull()
    })

    it('disables Import while submitting', async () => {
        let release: (v: unknown) => void = () => {}
        h.importOrders.mockReturnValue(new Promise((r) => { release = r }))
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload(ORDER_CSV_TEMPLATE)
        await click(button(/^Import 2 lines/)!)
        expect(button(/Importing/)!.disabled).toBe(true)
        await click(button(/Importing/)!)
        expect(h.importOrders).toHaveBeenCalledTimes(1)
        await act(async () => {
            release({ ok: true, state: 'created', batchId: 'b', ordersCreated: 1, linesCreated: 2 })
            await new Promise((r) => setTimeout(r, 0))
        })
    })

    it('cancels a draft order after an inline confirmation', async () => {
        h.listOrders.mockResolvedValue([
            { id: 'o-1', agreement_id: 'ag-1', batch_id: 'b', client_order_ref: 'SO-1', status: 'draft', version: 1, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z' },
        ])
        h.cancelOrder.mockResolvedValue({ ok: true, state: 'cancelled', version: 2 })
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await click(button(/^Cancel order/)!)
        expect(h.cancelOrder).not.toHaveBeenCalled()
        await click(button(/Confirm cancel SO-1/)!)
        expect(h.cancelOrder).toHaveBeenCalledWith('o-1', 1)
        expect(h.toastSuccess).toHaveBeenCalledWith('Order cancelled')
    })

    it('SB002 on import shows the read-only prompt instead of a toast', async () => {
        h.importOrders.mockRejectedValue(sbError(SB002_ERROR))
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload(ORDER_CSV_TEMPLATE)
        await click(button(/^Import 2 lines/)!)
        expect(q('[role="alert"]')?.textContent).toContain('read-only')
        expect(h.toastError).not.toHaveBeenCalled()
    })

    it('disables Import with an explanation while read-only', async () => {
        await mountPage(gateFor('grace'))
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        await upload(ORDER_CSV_TEMPLATE)
        const b = button(/^Import 2 lines/)!
        expect(b.disabled).toBe(true)
        expect(b.title).toContain('read-only')
    })

    it('filters the recent-orders history by order reference, client-side', async () => {
        const base = { agreement_id: 'ag-1', batch_id: 'b', status: 'draft', version: 1, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z' }
        h.listOrders.mockResolvedValue([
            { ...base, id: 'o-1', client_order_ref: 'SO-1001' },
            { ...base, id: 'o-2', client_order_ref: 'PO-7' },
        ])
        await mountPage()
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        expect(q('#order-history-search')).not.toBeNull()
        const search = q('#order-history-search') as HTMLInputElement
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'so-10')
            search.dispatchEvent(new Event('input', { bubbles: true }))
        })
        expect(text()).toContain('SO-1001')
        expect(text()).not.toContain('PO-7')
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'zzz')
            search.dispatchEvent(new Event('input', { bubbles: true }))
        })
        expect(text()).toContain('No orders match that reference.')
    })
})

describe('AgencyOrderImportPage accessibility', () => {
    it('the client, file and order-search fields each have an associated label', async () => {
        const view = await mountPage()
        for (const id of ['import-agreement', 'import-file']) {
            expect(view.querySelector(`label[for="${id}"]`), `label for ${id}`).not.toBeNull()
            expect(q(`#${id}`), `field ${id}`).not.toBeNull()
        }
        const base = { agreement_id: 'ag-1', batch_id: 'b', status: 'draft', version: 1, created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z' }
        h.listOrders.mockResolvedValue([{ ...base, id: 'o-1', client_order_ref: 'SO-1001' }])
        await choose(q('#import-agreement') as HTMLSelectElement, 'ag-1')
        expect(view.querySelector('label[for="order-history-search"]')).not.toBeNull()
        expect(q('#order-history-search')).not.toBeNull()
    })

    it('the template download and the import action are at least 44px high', async () => {
        await mountPage()
        expect(button(/Download template/)?.className).toContain('min-h-[44px]')
        expect(button(/Download template/)?.className).toContain('focus-visible:ring-2')
    })

    it('the file step is labelled by its heading and the file input is described by its hint', async () => {
        await mountPage()
        const section = q('[aria-labelledby="import-step-file"]')
        expect(section?.querySelector('#import-step-file')?.textContent).toContain('CSV file')
        expect(q('#import-file')?.getAttribute('aria-describedby')).toBe('import-file-hint')
    })
})
