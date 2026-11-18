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

import { agencyConsignmentsApi } from './agencyConsignmentsApi'
import { UserFacingError } from '../utils/userFacingError'

function mockOrdered(rows: unknown[], error: unknown = null) {
    const order = vi.fn().mockResolvedValue({ data: rows, error })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ order, eq })
    fromMock.mockReturnValue({ select })
    return { select, order, eq }
}

const eventInput = { consignmentId: 'c-1', event: 'pickup_scanned' as const, expectedVersion: 1, idempotencyKey: 'k-1' }

describe('agencyConsignmentsApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('createConsignment', () => {
        it('sends the exact RPC arguments and returns the typed success', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, consignment_id: 'c-1', gr_number: 'AGY/2026-27/000001', status: 'created', version: 1 },
                error: null,
            })
            const result = await agencyConsignmentsApi.createConsignment('o-1', 'k-1')
            expect(rpcMock).toHaveBeenCalledWith('agency_consignment_create', { p_order_id: 'o-1', p_idempotency_key: 'k-1' })
            expect(result).toEqual({ ok: true, replay: false, consignmentId: 'c-1', grNumber: 'AGY/2026-27/000001', status: 'created', version: 1 })
        })

        it('flags a replay', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, replay: true, consignment_id: 'c-1', gr_number: 'G', status: 'created', version: 1 },
                error: null,
            })
            expect(await agencyConsignmentsApi.createConsignment('o-1', 'k-1')).toMatchObject({ ok: true, replay: true })
        })

        it.each([
            ['forbidden_scope', /role does not allow/],
            ['key_too_long', /Reload the page/],
            ['order_not_found', /could not be found/],
            ['order_cancelled', /cancelled/],
            ['consignment_exists', /already exists/],
            ['idempotency_key_reused', /already used/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyConsignmentsApi.createConsignment('o-1', 'k-1')
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('maps an unknown refusal to the fallback message', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyConsignmentsApi.createConsignment('o-1', 'k-1')).toEqual({
                ok: false, error: 'unknown', message: 'Failed to create GR',
            })
        })

        it('surfaces approved exceptions, redacts the rest and rejects malformed envelopes', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Agency approval is required.' } })
            await expect(agencyConsignmentsApi.createConsignment('o-1', 'k')).rejects.toThrow('Agency approval is required.')
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist' } })
            const err = await agencyConsignmentsApi.createConsignment('o-1', 'k').catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to create GR')
            rpcMock.mockResolvedValueOnce({ data: { ok: true, consignment_id: 'c-1' }, error: null })
            await expect(agencyConsignmentsApi.createConsignment('o-1', 'k')).rejects.toThrow('Failed to create GR')
        })
    })

    describe('recordEvent', () => {
        it('sends the exact RPC arguments with a null note by default', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, status: 'picked_up', version: 2 }, error: null })
            const result = await agencyConsignmentsApi.recordEvent(eventInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_consignment_event', {
                p_consignment_id: 'c-1',
                p_event: 'pickup_scanned',
                p_expected_version: 1,
                p_idempotency_key: 'k-1',
                p_note: null,
            })
            expect(result).toEqual({ ok: true, replay: false, status: 'picked_up', version: 2 })
        })

        it('passes a note through', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, status: 'disputed', version: 3 }, error: null })
            await agencyConsignmentsApi.recordEvent({ ...eventInput, event: 'dispute_raised', note: 'Damaged' })
            expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_event: 'dispute_raised', p_note: 'Damaged' })
        })

        it('returns version_conflict with the current version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'version_conflict', current_version: 5 }, error: null })
            expect(await agencyConsignmentsApi.recordEvent(eventInput)).toMatchObject({
                ok: false, error: 'version_conflict', currentVersion: 5, message: 'This consignment changed. Reload to continue.',
            })
        })

        it.each([
            ['illegal_transition', /not allowed at this stage/],
            ['not_found', /could not be found/],
            ['unknown_event', /not recognised/],
            ['note_too_long', /500 characters/],
            ['forbidden_scope', /role does not allow/],
            ['idempotency_key_reused', /already used/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyConsignmentsApi.recordEvent(eventInput)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('rejects a malformed success envelope and an unknown status', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: true, status: 'weird', version: 2 }, error: null })
            await expect(agencyConsignmentsApi.recordEvent(eventInput)).rejects.toThrow('Failed to update the delivery')
        })
    })

    describe('getQrToken', () => {
        it('returns the token', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, qr_token: 'tok' }, error: null })
            expect(await agencyConsignmentsApi.getQrToken('c-1')).toEqual({ ok: true, token: 'tok' })
            expect(rpcMock).toHaveBeenCalledWith('agency_consignment_qr', { p_consignment_id: 'c-1' })
        })

        it('returns forbidden_scope and not_found as typed refusals', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'forbidden_scope' }, error: null })
            expect(await agencyConsignmentsApi.getQrToken('c-1')).toMatchObject({ ok: false, error: 'forbidden_scope' })
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'not_found' }, error: null })
            expect(await agencyConsignmentsApi.getQrToken('c-1')).toMatchObject({ ok: false, error: 'not_found' })
        })

        it('rejects a success envelope without a token', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
            await expect(agencyConsignmentsApi.getQrToken('c-1')).rejects.toThrow('Failed to load the QR code')
        })
    })

    describe('reads', () => {
        it('lists orders and consignments from their tables without the QR token column', async () => {
            const { select } = mockOrdered([{ id: 'o-1' }])
            expect(await agencyConsignmentsApi.listOrders()).toEqual([{ id: 'o-1' }])
            expect(fromMock).toHaveBeenCalledWith('agency_orders')
            await agencyConsignmentsApi.listConsignments()
            expect(fromMock).toHaveBeenCalledWith('agency_consignments')
            expect(select.mock.calls[1][0]).not.toContain('qr_token')
        })

        it('filters events by consignment', async () => {
            const { eq } = mockOrdered([{ id: 'e-1' }])
            expect(await agencyConsignmentsApi.listEvents('c-1')).toEqual([{ id: 'e-1' }])
            expect(fromMock).toHaveBeenCalledWith('agency_consignment_events')
            expect(eq).toHaveBeenCalledWith('consignment_id', 'c-1')
        })

        it('throws the fallback when a read fails', async () => {
            mockOrdered([], { message: 'raw detail' })
            await expect(agencyConsignmentsApi.listConsignments()).rejects.toThrow('Failed to load consignments')
        })
    })

    describe('listOrderRoutes', () => {
        it('joins client name and pickup and drop labels by id from flat reads', async () => {
            const tables: Record<string, unknown[]> = {
                agency_orders: [
                    { id: 'o-1', agreement_id: 'ag-1' },
                    { id: 'o-2', agreement_id: 'ag-x' },
                ],
                agency_client_agreements: [{ id: 'ag-1', client_name: 'Sri Balaji Transport' }],
                agency_client_sites: [
                    { id: 's-1', label: 'Pune Depot' },
                    { id: 's-2', label: 'Delhi Store' },
                ],
                agency_order_lines: [
                    { order_id: 'o-1', pickup_site_id: 's-1', drop_site_id: 's-2' },
                    { order_id: 'o-1', pickup_site_id: 's-1', drop_site_id: null },
                ],
            }
            fromMock.mockImplementation((table: string) => {
                const rows = tables[table] ?? []
                const order = vi.fn().mockResolvedValue({ data: rows, error: null })
                return { select: vi.fn().mockReturnValue({ order }) }
            })
            expect(await agencyConsignmentsApi.listOrderRoutes()).toEqual([
                { orderId: 'o-1', clientName: 'Sri Balaji Transport', pickupLabels: ['Pune Depot'], dropLabels: ['Delhi Store'] },
                { orderId: 'o-2', clientName: null, pickupLabels: [], dropLabels: [] },
            ])
            expect(fromMock).toHaveBeenCalledWith('agency_order_lines')
        })

        it('throws the fallback when one of the reads fails', async () => {
            fromMock.mockImplementation((table: string) => {
                const order = vi.fn().mockResolvedValue(
                    table === 'agency_client_sites' ? { data: null, error: { message: 'raw detail' } } : { data: [], error: null }
                )
                return { select: vi.fn().mockReturnValue({ order }) }
            })
            await expect(agencyConsignmentsApi.listOrderRoutes()).rejects.toThrow('Failed to load routes')
        })
    })
})
