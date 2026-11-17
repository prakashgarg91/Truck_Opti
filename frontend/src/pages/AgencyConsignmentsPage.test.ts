import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-146 Consignments: loading / empty / denied / error states, orders awaiting
// a GR, create with one idempotency key per intent, next legal event buttons,
// typed refusals, event history, QR payload and the single refetch.

const h = vi.hoisted(() => ({
    listOrders: vi.fn(),
    listConsignments: vi.fn(),
    listEvents: vi.fn(),
    createConsignment: vi.fn(),
    recordEvent: vi.fn(),
    getQrToken: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }))
vi.mock('../services/agencyConsignmentsApi', () => ({
    agencyConsignmentsApi: {
        listOrders: h.listOrders,
        listConsignments: h.listConsignments,
        listEvents: h.listEvents,
        createConsignment: h.createConsignment,
        recordEvent: h.recordEvent,
        getQrToken: h.getQrToken,
    },
}))

import AgencyConsignmentsPage from './AgencyConsignmentsPage'
import { UserFacingError } from '../utils/userFacingError'

const order = (id: string, ref: string, status = 'draft') => ({
    id, agreement_id: 'ag-1', client_order_ref: ref, status, version: 1, created_at: '2026-11-10T00:00:00Z',
})
const consignment = (id: string, orderId: string, status: string, version = 1) => ({
    id, order_id: orderId, gr_number: `AGY/2026-27/00000${id.slice(-1)}`, status, version,
    created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-11T00:00:00Z',
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(AgencyConsignmentsPage))
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

beforeEach(() => {
    vi.clearAllMocks()
    h.listOrders.mockResolvedValue([order('o-1', 'SO-1'), order('o-2', 'SO-2', 'planned'), order('o-3', 'SO-3', 'cancelled')])
    h.listConsignments.mockResolvedValue([])
    h.listEvents.mockResolvedValue([])
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
    Array.from((container as HTMLElement).querySelectorAll('button')).find(
        (b) => re.test(b.textContent || '') || re.test(b.getAttribute('aria-label') || '')
    ) as HTMLButtonElement | undefined

async function click(b: HTMLButtonElement) {
    await act(async () => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('AgencyConsignmentsPage', () => {
    it('shows a busy loading state before data arrives', async () => {
        h.listOrders.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="consignments-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the denied state for a scope refusal', async () => {
        h.listOrders.mockRejectedValue(new UserFacingError('Your access scope does not allow this action.'))
        await mountPage()
        expect(q('[data-testid="consignments-denied"]')).not.toBeNull()
    })

    it('shows an error alert with a single-refetch Retry', async () => {
        h.listOrders.mockRejectedValueOnce(new UserFacingError('Failed to load orders'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load orders')
        await click(button(/^Retry/)!)
        expect(h.listOrders).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
    })

    it('shows empty states for no orders and no consignments', async () => {
        h.listOrders.mockResolvedValue([])
        await mountPage()
        expect(q('[data-testid="consignments-no-orders"]')).not.toBeNull()
        expect(q('[data-testid="consignments-empty"]')).not.toBeNull()
    })

    it('lists only draft or planned orders without a GR', async () => {
        h.listConsignments.mockResolvedValue([consignment('c-1', 'o-2', 'created')])
        await mountPage()
        expect(q('[data-testid="consignments-order-o-1"]')).not.toBeNull()
        expect(q('[data-testid="consignments-order-o-2"]')).toBeNull()
        expect(q('[data-testid="consignments-order-o-3"]')).toBeNull()
    })

    it('creates a GR with one key, refetches once and reuses the key after a failure', async () => {
        h.createConsignment
            .mockRejectedValueOnce(new UserFacingError('Failed to create GR'))
            .mockResolvedValueOnce({ ok: true, replay: false, consignmentId: 'c-1', grNumber: 'AGY/2026-27/000001', status: 'created', version: 1 })
        await mountPage()
        await click(button(/Create GR for SO-1/)!)
        expect(h.toastError).toHaveBeenCalledWith('Failed to create GR')
        expect(h.listOrders).toHaveBeenCalledTimes(1)

        await click(button(/Create GR for SO-1/)!)
        expect(h.createConsignment.mock.calls[1][1]).toBe(h.createConsignment.mock.calls[0][1])
        expect(h.createConsignment.mock.calls[0][0]).toBe('o-1')
        expect(h.toastSuccess).toHaveBeenCalledWith('GR AGY/2026-27/000001 created')
        expect(h.listOrders).toHaveBeenCalledTimes(2)
        expect(h.listConsignments).toHaveBeenCalledTimes(2)
    })

    it('shows a typed refusal in plain language', async () => {
        h.createConsignment.mockResolvedValue({ ok: false, error: 'forbidden_scope', message: 'Your role does not allow this action.' })
        await mountPage()
        await click(button(/Create GR for SO-1/)!)
        expect(q('[data-testid="consignments-order-o-1"] [role="alert"]')?.textContent).toContain('Your role does not allow')
    })

    it('shows only the next legal events for each status', async () => {
        h.listConsignments.mockResolvedValue([
            consignment('c-1', 'o-1', 'created'),
            consignment('c-2', 'o-2', 'in_transit'),
            consignment('c-3', 'o-3', 'receipt_confirmed'),
        ])
        await mountPage()
        const c1 = q('[data-testid="consignment-c-1"]')!.textContent!
        expect(c1).toContain('Mark picked up')
        expect(c1).not.toContain('Raise dispute')
        const c2 = q('[data-testid="consignment-c-2"]')!.textContent!
        expect(c2).toContain('Mark delivered')
        expect(c2).toContain('Raise dispute')
        expect(c2).not.toContain('Mark picked up')
        const c3 = q('[data-testid="consignment-c-3"]')!.textContent!
        expect(c3).toContain('Delivery complete')
        expect(c3).not.toContain('Raise dispute')
    })

    it('records an event with the expected version and refetches', async () => {
        h.listConsignments.mockResolvedValue([consignment('c-1', 'o-1', 'created', 3)])
        h.recordEvent.mockResolvedValue({ ok: true, replay: false, status: 'picked_up', version: 4 })
        await mountPage()
        await click(button(/Mark picked up/)!)
        expect(h.recordEvent).toHaveBeenCalledWith(
            expect.objectContaining({ consignmentId: 'c-1', event: 'pickup_scanned', expectedVersion: 3, note: null })
        )
        expect(typeof h.recordEvent.mock.calls[0][0].idempotencyKey).toBe('string')
        expect(h.toastSuccess).toHaveBeenCalledWith('Delivery updated')
        expect(h.listConsignments).toHaveBeenCalledTimes(2)
    })

    it('shows a version conflict message on the consignment', async () => {
        h.listConsignments.mockResolvedValue([consignment('c-1', 'o-1', 'created')])
        h.recordEvent.mockResolvedValue({ ok: false, error: 'version_conflict', message: 'This consignment changed. Reload to continue.', currentVersion: 2 })
        await mountPage()
        await click(button(/Mark picked up/)!)
        expect(q('[data-testid="consignment-c-1"] [role="alert"]')?.textContent).toContain('This consignment changed')
    })

    it('raises a dispute only after confirming, with the note', async () => {
        h.listConsignments.mockResolvedValue([consignment('c-1', 'o-1', 'in_transit')])
        h.recordEvent.mockResolvedValue({ ok: true, replay: false, status: 'disputed', version: 2 })
        await mountPage()
        await click(button(/^Raise dispute/)!)
        expect(h.recordEvent).not.toHaveBeenCalled()
        const note = q('#dispute-note-c-1') as HTMLTextAreaElement
        await act(async () => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(note, 'Boxes crushed')
            note.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await click(button(/Confirm dispute/)!)
        expect(h.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ event: 'dispute_raised', note: 'Boxes crushed' }))
    })

    it('shows event history on demand', async () => {
        h.listConsignments.mockResolvedValue([consignment('c-1', 'o-1', 'picked_up')])
        h.listEvents.mockResolvedValue([
            { id: 'e-2', consignment_id: 'c-1', event: 'pickup_scanned', from_status: 'created', to_status: 'picked_up', note: 'At gate', version_after: 2, created_at: '2026-11-11T00:00:00Z' },
            { id: 'e-1', consignment_id: 'c-1', event: 'created', from_status: null, to_status: 'created', note: null, version_after: 1, created_at: '2026-11-10T00:00:00Z' },
        ])
        await mountPage()
        await click(button(/Show history/)!)
        expect(h.listEvents).toHaveBeenCalledWith('c-1')
        const history = q('[data-testid="consignment-history-c-1"]')!.textContent!
        expect(history).toContain('Picked up')
        expect(history).toContain('Note: At gate')
        expect(history).toContain('GR created')
    })

    it('shows the QR payload with a copy action and the later note', async () => {
        h.listConsignments.mockResolvedValue([consignment('c-1', 'o-1', 'created')])
        h.getQrToken.mockResolvedValue({ ok: true, token: 'tok123' })
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
        await mountPage()
        await click(button(/Show QR for/)!)
        const block = q('[data-testid="consignment-qr-c-1"]')!
        expect(block.querySelector('pre')?.textContent).toBe('TRKOPT:v1:AGY/2026-27/000001:c-1:tok123')
        expect(block.textContent).toContain('QR image: later')
        await click(button(/Copy payload/)!)
        expect(writeText).toHaveBeenCalledWith('TRKOPT:v1:AGY/2026-27/000001:c-1:tok123')
    })

    it('explains a QR refusal for a role without dispatcher scope', async () => {
        h.listConsignments.mockResolvedValue([consignment('c-1', 'o-1', 'created')])
        h.getQrToken.mockResolvedValue({ ok: false, error: 'forbidden_scope', message: 'Your role does not allow this action.' })
        await mountPage()
        await click(button(/Show QR for/)!)
        expect(q('[data-testid="consignment-c-1"] [role="alert"]')?.textContent).toContain('Your role does not allow')
        expect(q('[data-testid="consignment-qr-c-1"]')).toBeNull()
    })

    it('disables actions while a request is in flight', async () => {
        let release: (v: unknown) => void = () => {}
        h.createConsignment.mockReturnValue(new Promise((r) => { release = r }))
        await mountPage()
        await click(button(/Create GR for SO-1/)!)
        expect(text()).toContain('Creating…')
        expect(button(/Create GR for SO-2/)!.disabled).toBe(true)
        await act(async () => {
            release({ ok: true, replay: false, consignmentId: 'c-1', grNumber: 'G', status: 'created', version: 1 })
            await new Promise((r) => setTimeout(r, 0))
        })
    })
})
