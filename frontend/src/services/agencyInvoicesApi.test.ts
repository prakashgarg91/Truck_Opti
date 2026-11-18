import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

// Fail loudly unless the service calls the client methods with the client as `this`.
vi.mock('../lib/supabase', () => {
    const client: Record<string, unknown> = {}
    client.rpc = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.rpc called without its client as this')
        return rpcMock(...args)
    }
    client.from = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.from called without its client as this')
        return fromMock(...args)
    }
    return { supabase: client }
})

import { agencyInvoicesApi, CANCEL_ERROR_MESSAGES, ISSUE_ERROR_MESSAGES, PAYMENT_ERROR_MESSAGES } from './agencyInvoicesApi'
import { UserFacingError } from '../utils/userFacingError'

const issueInput = {
    clientId: 'c-1',
    lines: [{ description: 'Freight Pune to Delhi', quantity: 2.5, ratePaise: 150000 }],
    supplierState: '27',
    placeOfSupplyState: '07',
    gstRatePct: 12,
    reverseCharge: false,
    roundOff: true,
    idempotencyKey: 'k-1',
}
const payInput = {
    invoiceId: 'i-1', amountPaise: 12345, method: 'upi' as const, reference: 'UTR1',
    receivedOn: '2026-11-10', expectedVersion: 1, idempotencyKey: 'k-2',
}

function mockOrdered(rows: unknown[], error: unknown = null) {
    const order = vi.fn().mockResolvedValue({ data: rows, error })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ order, eq })
    fromMock.mockReturnValue({ select })
    return { select, order, eq }
}

describe('agencyInvoicesApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('listInvoiceableGrs', () => {
        it('keeps delivered and receipt-confirmed GRs and maps each to its order client', async () => {
            const tables: Record<string, unknown[]> = {
                agency_consignments: [
                    { id: 'g-1', order_id: 'o-1', gr_number: 'AGY/1', status: 'delivered' },
                    { id: 'g-2', order_id: 'o-2', gr_number: 'AGY/2', status: 'receipt_confirmed' },
                    { id: 'g-3', order_id: 'o-1', gr_number: 'AGY/3', status: 'in_transit' },
                    { id: 'g-4', order_id: 'o-missing', gr_number: 'AGY/4', status: 'delivered' },
                    { id: 'g-5', order_id: 'o-1', gr_number: 'AGY/5', status: 'disputed' },
                ],
                agency_orders: [
                    { id: 'o-1', agreement_id: 'ag-1' },
                    { id: 'o-2', agreement_id: 'ag-2' },
                ],
            }
            fromMock.mockImplementation((table: string) => {
                const order = vi.fn().mockResolvedValue({ data: tables[table] ?? [], error: null })
                return { select: vi.fn().mockReturnValue({ order }) }
            })
            expect(await agencyInvoicesApi.listInvoiceableGrs()).toEqual([
                { consignmentId: 'g-1', grNumber: 'AGY/1', status: 'delivered', clientId: 'ag-1' },
                { consignmentId: 'g-2', grNumber: 'AGY/2', status: 'receipt_confirmed', clientId: 'ag-2' },
            ])
        })

        it('throws the fallback when a read fails', async () => {
            mockOrdered([], { message: 'raw detail' })
            await expect(agencyInvoicesApi.listInvoiceableGrs()).rejects.toThrow('Failed to load GRs')
        })
    })

    describe('issueInvoice', () => {
        it('sends the exact RPC arguments with snake_case lines and returns the number', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, invoice_id: 'i-1', invoice_number: 'INV/2026-27/000001' }, error: null })
            const result = await agencyInvoicesApi.issueInvoice(issueInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_invoice_issue', {
                p_client_id: 'c-1',
                p_lines: [{ description: 'Freight Pune to Delhi', quantity: 2.5, rate_paise: 150000 }],
                p_supplier_state: '27',
                p_place_of_supply_state: '07',
                p_gst_rate_pct: 12,
                p_reverse_charge: false,
                p_round_off: true,
                p_idempotency_key: 'k-1',
            })
            expect(result).toEqual({ ok: true, invoiceId: 'i-1', invoiceNumber: 'INV/2026-27/000001', replay: false })
        })

        it('marks a replay as a typed success', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, replay: true, invoice_id: 'i-1', invoice_number: 'N' }, error: null })
            expect(await agencyInvoicesApi.issueInvoice(issueInput)).toMatchObject({ ok: true, replay: true })
        })

        it('returns invalid_line with the server problems', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'invalid_line', problems: [{ index: 1, message: 'Quantity must be greater than zero.' }, { x: 1 }] },
                error: null,
            })
            expect(await agencyInvoicesApi.issueInvoice(issueInput)).toMatchObject({
                ok: false, error: 'invalid_line', problems: [{ index: 1, message: 'Quantity must be greater than zero.' }],
            })
        })

        it.each(Object.keys(ISSUE_ERROR_MESSAGES))('maps %s to a plain message', async (code) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyInvoicesApi.issueInvoice(issueInput)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toBe(ISSUE_ERROR_MESSAGES[code as keyof typeof ISSUE_ERROR_MESSAGES])
        })

        it('maps an unknown refusal to the fallback', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyInvoicesApi.issueInvoice(issueInput)).toEqual({
                ok: false, error: 'unknown', message: 'Failed to issue invoice', problems: [],
            })
        })

        it('surfaces approved exceptions and redacts everything else', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Agency approval is required.' } })
            await expect(agencyInvoicesApi.issueInvoice(issueInput)).rejects.toThrow('Agency approval is required.')
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist' } })
            const err = await agencyInvoicesApi.issueInvoice(issueInput).catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to issue invoice')
        })

        it('rejects a malformed success envelope', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
            await expect(agencyInvoicesApi.issueInvoice(issueInput)).rejects.toThrow('Failed to issue invoice')
        })
    })

    describe('recordPayment', () => {
        it('sends the exact RPC arguments and returns the new balance state', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, paid_paise: 12345, status: 'partly_paid', version: 2 }, error: null })
            const result = await agencyInvoicesApi.recordPayment(payInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_invoice_record_payment', {
                p_invoice_id: 'i-1',
                p_amount_paise: 12345,
                p_method: 'upi',
                p_reference: 'UTR1',
                p_received_on: '2026-11-10',
                p_expected_version: 1,
                p_idempotency_key: 'k-2',
            })
            expect(result).toEqual({ ok: true, paidPaise: 12345, status: 'partly_paid', version: 2, replay: false })
        })

        it('returns overpayment with the outstanding amount and version_conflict with the current version', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'overpayment', outstanding_paise: 500 }, error: null })
            expect(await agencyInvoicesApi.recordPayment(payInput)).toMatchObject({ ok: false, error: 'overpayment', outstandingPaise: 500 })
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'version_conflict', current_version: 5 }, error: null })
            expect(await agencyInvoicesApi.recordPayment(payInput)).toMatchObject({ ok: false, error: 'version_conflict', currentVersion: 5 })
        })

        it.each(Object.keys(PAYMENT_ERROR_MESSAGES))('maps %s to a plain message', async (code) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyInvoicesApi.recordPayment(payInput)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toBe(PAYMENT_ERROR_MESSAGES[code as keyof typeof PAYMENT_ERROR_MESSAGES])
        })

        it('maps unknown and rejects a malformed success', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyInvoicesApi.recordPayment(payInput)).toEqual({ ok: false, error: 'unknown', message: 'Failed to record payment' })
            rpcMock.mockResolvedValueOnce({ data: { ok: true, paid_paise: 1, status: 'bogus', version: 2 }, error: null })
            await expect(agencyInvoicesApi.recordPayment(payInput)).rejects.toThrow('Failed to record payment')
        })
    })

    describe('cancelInvoice', () => {
        it('cancels with the expected version and reason', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, status: 'cancelled', version: 2 }, error: null })
            expect(await agencyInvoicesApi.cancelInvoice('i-1', 1, 'Wrong client')).toEqual({ ok: true, version: 2 })
            expect(rpcMock).toHaveBeenCalledWith('agency_invoice_cancel', { p_invoice_id: 'i-1', p_expected_version: 1, p_reason: 'Wrong client' })
        })

        it.each(Object.keys(CANCEL_ERROR_MESSAGES))('maps %s to a plain message', async (code) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code, current_version: 3 }, error: null })
            const result = await agencyInvoicesApi.cancelInvoice('i-1', 1, 'x')
            expect(result).toMatchObject({ ok: false, error: code, currentVersion: 3 })
            expect(result.ok === false && result.message).toBe(CANCEL_ERROR_MESSAGES[code as keyof typeof CANCEL_ERROR_MESSAGES])
        })

        it('maps unknown to the fallback', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyInvoicesApi.cancelInvoice('i-1', 1, 'x')).toEqual({ ok: false, error: 'unknown', message: 'Failed to cancel invoice' })
        })
    })

    describe('reads', () => {
        it('lists invoices newest first', async () => {
            const { order } = mockOrdered([{ id: 'i-1' }])
            expect(await agencyInvoicesApi.listInvoices()).toEqual([{ id: 'i-1' }])
            expect(fromMock).toHaveBeenCalledWith('agency_invoices')
            expect(order).toHaveBeenCalledWith('created_at', { ascending: false })
        })

        it('loads lines and payments filtered by invoice', async () => {
            const { eq } = mockOrdered([])
            expect(await agencyInvoicesApi.getInvoiceDetail('i-1')).toEqual({ lines: [], payments: [] })
            expect(fromMock).toHaveBeenCalledWith('agency_invoice_lines')
            expect(fromMock).toHaveBeenCalledWith('agency_invoice_payments')
            expect(eq).toHaveBeenCalledWith('invoice_id', 'i-1')
        })

        it('lists clients and throws the fallback when a read fails', async () => {
            mockOrdered([{ id: 'c-1', client_name: 'A', status: 'active' }])
            expect(await agencyInvoicesApi.listClients()).toHaveLength(1)
            expect(fromMock).toHaveBeenCalledWith('agency_client_agreements')
            mockOrdered([], { message: 'raw detail' })
            await expect(agencyInvoicesApi.listInvoices()).rejects.toThrow('Failed to load invoices')
        })
    })
})

describe('agencyInvoicesApi consignment link', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('sends p_consignment_id only when a consignment is given', async () => {
        rpcMock.mockResolvedValue({ data: { ok: true, invoice_id: 'i-1', invoice_number: 'N' }, error: null })
        await agencyInvoicesApi.issueInvoice({ ...issueInput, consignmentId: 'g-1' })
        expect(rpcMock).toHaveBeenLastCalledWith('agency_invoice_issue', expect.objectContaining({ p_consignment_id: 'g-1', p_idempotency_key: 'k-1' }))
        await agencyInvoicesApi.issueInvoice(issueInput)
        expect(Object.keys(rpcMock.mock.calls[1][1])).not.toContain('p_consignment_id')
        await agencyInvoicesApi.issueInvoice({ ...issueInput, consignmentId: null })
        expect(Object.keys(rpcMock.mock.calls[2][1])).not.toContain('p_consignment_id')
    })

    it('maps consignment_already_invoiced to a typed refusal carrying the existing invoice', async () => {
        rpcMock.mockResolvedValue({ data: { ok: false, error: 'consignment_already_invoiced', invoice_id: 'i-9', invoice_number: 'INV/2026-27/000009' }, error: null })
        const result = await agencyInvoicesApi.issueInvoice({ ...issueInput, consignmentId: 'g-1' })
        expect(result).toEqual({
            ok: false,
            error: 'consignment_already_invoiced',
            message: ISSUE_ERROR_MESSAGES.consignment_already_invoiced,
            problems: [],
            invoiceId: 'i-9',
            invoiceNumber: 'INV/2026-27/000009',
        })
    })

    it('maps consignment_not_found to its message without invoice fields', async () => {
        rpcMock.mockResolvedValue({ data: { ok: false, error: 'consignment_not_found', invoice_id: 'leak' }, error: null })
        const result = await agencyInvoicesApi.issueInvoice({ ...issueInput, consignmentId: 'g-1' })
        expect(result).toEqual({ ok: false, error: 'consignment_not_found', message: ISSUE_ERROR_MESSAGES.consignment_not_found, problems: [] })
    })

    it('ignores a non-string invoice id on an already-invoiced refusal', async () => {
        rpcMock.mockResolvedValue({ data: { ok: false, error: 'consignment_already_invoiced', invoice_id: 42 }, error: null })
        const result = await agencyInvoicesApi.issueInvoice({ ...issueInput, consignmentId: 'g-1' })
        expect(result.ok === false && result.invoiceId).toBeUndefined()
    })

    it('reads consignment_id with the invoice list columns', async () => {
        const { select } = mockOrdered([])
        await agencyInvoicesApi.listInvoices()
        expect(String(select.mock.calls[0][0])).toContain('consignment_id')
    })
})
