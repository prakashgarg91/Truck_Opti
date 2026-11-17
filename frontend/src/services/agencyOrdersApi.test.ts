import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

// The real SupabaseClient methods depend on `this`; a detached call crashes in the
// browser. These wrappers fail loudly unless the service calls them as methods.
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

import { agencyOrdersApi } from './agencyOrdersApi'
import { UserFacingError } from '../utils/userFacingError'

const LINES = [
    {
        client_order_ref: 'SO-1', line_no: 1, sku: 'A', description: null, quantity: 2, unit: 'kg',
        weight_per_unit_kg: 1, length_m: null, width_m: null, height_m: null,
        pickup_site: 'Depot', drop_site: 'Gate', pickup_from: null, pickup_to: null,
        delivery_from: null, delivery_to: null, stackable: true, fragile: false,
    },
]
const importInput = { agreementId: 'ag-1', fileHash: 'abc', idempotencyKey: 'key-1', lines: LINES }

function mockOrdered(rows: unknown[], error: unknown = null) {
    const order = vi.fn().mockResolvedValue({ data: rows, error })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ order, eq })
    fromMock.mockReturnValue({ select })
    return { select, order, eq }
}

describe('agencyOrdersApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('importOrders', () => {
        it('sends the exact RPC arguments and returns the created counts', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'created', batch_id: 'b-1', orders_created: 1, lines_created: 1 },
                error: null,
            })
            const result = await agencyOrdersApi.importOrders(importInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_order_import', {
                p_agreement_id: 'ag-1',
                p_file_hash: 'abc',
                p_idempotency_key: 'key-1',
                p_lines: LINES,
            })
            expect(result).toEqual({ ok: true, state: 'created', batchId: 'b-1', ordersCreated: 1, linesCreated: 1 })
        })

        it('treats duplicate_batch and idempotent_replay as typed successes without counts', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: true, state: 'duplicate_batch', batch_id: 'b-0' }, error: null })
            rpcMock.mockResolvedValueOnce({ data: { ok: true, state: 'idempotent_replay', batch_id: 'b-0' }, error: null })
            expect(await agencyOrdersApi.importOrders(importInput)).toEqual({
                ok: true, state: 'duplicate_batch', batchId: 'b-0', ordersCreated: null, linesCreated: null,
            })
            expect(await agencyOrdersApi.importOrders(importInput)).toMatchObject({ ok: true, state: 'idempotent_replay' })
        })

        it('returns invalid_lines with the server problems', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'invalid_lines', problems: [{ index: 3, message: 'Drop site not found.' }, { bad: true }] },
                error: null,
            })
            const result = await agencyOrdersApi.importOrders(importInput)
            expect(result).toMatchObject({ ok: false, error: 'invalid_lines', problems: [{ index: 3, message: 'Drop site not found.' }] })
        })

        it('returns order_exists with the clashing references', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'order_exists', refs: ['SO-1', 'SO-2'] }, error: null })
            const result = await agencyOrdersApi.importOrders(importInput)
            expect(result).toMatchObject({ ok: false, error: 'order_exists', refs: ['SO-1', 'SO-2'] })
            expect(result.ok === false && result.message).toMatch(/already exist/)
        })

        it.each([
            ['idempotency_key_reused', /different file/],
            ['agreement_not_active', /not active/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyOrdersApi.importOrders(importInput)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('maps an unknown refusal to the fallback message', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyOrdersApi.importOrders(importInput)).toEqual({
                ok: false, error: 'unknown', message: 'Failed to import orders',
            })
        })

        it('surfaces approved database exceptions and redacts everything else', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Too many lines in one import (maximum 2000).' } })
            await expect(agencyOrdersApi.importOrders(importInput)).rejects.toThrow('Too many lines in one import (maximum 2000).')
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist' } })
            const err = await agencyOrdersApi.importOrders(importInput).catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to import orders')
        })

        it('rejects a malformed success envelope', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'created' }, error: null })
            await expect(agencyOrdersApi.importOrders(importInput)).rejects.toThrow('Failed to import orders')
        })
    })

    describe('cancelOrder', () => {
        it('cancels with the expected version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'cancelled', version: 2 }, error: null })
            expect(await agencyOrdersApi.cancelOrder('o-1', 1)).toEqual({ ok: true, state: 'cancelled', version: 2 })
            expect(rpcMock).toHaveBeenCalledWith('agency_order_cancel', { p_order_id: 'o-1', p_expected_version: 1 })
        })

        it('returns version_conflict with the current version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'version_conflict', current_version: 4 }, error: null })
            expect(await agencyOrdersApi.cancelOrder('o-1', 1)).toMatchObject({
                ok: false, error: 'version_conflict', currentVersion: 4, message: 'This order changed. Reload to continue.',
            })
        })

        it('returns order_not_draft in plain language', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'order_not_draft' }, error: null })
            expect(await agencyOrdersApi.cancelOrder('o-1', 1)).toMatchObject({ ok: false, error: 'order_not_draft', message: 'Only draft orders can be cancelled.' })
        })

        it('surfaces the not-found exception', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'Order not found or access denied.' } })
            await expect(agencyOrdersApi.cancelOrder('o-1', 1)).rejects.toThrow('Order not found or access denied.')
        })
    })

    describe('reads', () => {
        it('lists agreements with their sites grouped per agreement', async () => {
            fromMock.mockImplementation((table: string) => {
                const rows =
                    table === 'agency_client_agreements'
                        ? [{ id: 'ag-1', client_name: 'A', status: 'active' }, { id: 'ag-2', client_name: 'B', status: 'ended' }]
                        : [{ id: 's-1', agreement_id: 'ag-1', site_kind: 'ship_to', label: 'Gate', status: 'active' }]
                return { select: vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: rows, error: null }) }) }
            })
            const result = await agencyOrdersApi.listAgreementsWithSites()
            expect(result.map((a) => [a.id, a.sites.length])).toEqual([['ag-1', 1], ['ag-2', 0]])
        })

        it('filters batches and orders by agreement', async () => {
            const { eq } = mockOrdered([{ id: 'o-1' }])
            expect(await agencyOrdersApi.listOrders('ag-1')).toEqual([{ id: 'o-1' }])
            expect(fromMock).toHaveBeenCalledWith('agency_orders')
            expect(eq).toHaveBeenCalledWith('agreement_id', 'ag-1')
            await agencyOrdersApi.listBatches('ag-1')
            expect(fromMock).toHaveBeenCalledWith('agency_order_batches')
        })

        it('throws the fallback when a read fails', async () => {
            mockOrdered([], { message: 'raw detail' })
            await expect(agencyOrdersApi.listOrders('ag-1')).rejects.toThrow('Failed to load orders')
        })
    })
})
