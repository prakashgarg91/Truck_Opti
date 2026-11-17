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

import { agencyErpApi, EVENT_LIMIT, RECENT_EVENT_LIMIT } from './agencyErpApi'
import { UserFacingError } from '../utils/userFacingError'

function mockQuery(rows: unknown[], error: unknown = null) {
    const limit = vi.fn().mockResolvedValue({ data: rows, error })
    const order = vi.fn().mockReturnValue({ limit })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ order, eq })
    fromMock.mockReturnValue({ select })
    return { select, order, eq, limit }
}

const createInput = { agreementId: 'ag-1', name: 'Tally feed', kind: 'webhook' as const, idempotencyKey: 'k-1' }

describe('agencyErpApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('reads', () => {
        it('never selects secret_hash or the idempotency key', async () => {
            // connections: order is the terminal call here
            const order = vi.fn().mockResolvedValue({ data: [], error: null })
            const select = vi.fn().mockReturnValue({ order })
            fromMock.mockReturnValue({ select })
            await agencyErpApi.listConnections()
            expect(fromMock).toHaveBeenCalledWith('agency_erp_connections')
            const columns = select.mock.calls[0][0] as string
            expect(columns).toContain('secret_hint')
            expect(columns).not.toContain('secret_hash')
            expect(columns).not.toContain('idempotency_key')
            expect(columns).not.toBe('*')
        })

        it('lists events for one connection, newest first, bounded', async () => {
            const { eq, order, limit } = mockQuery([{ id: 'e-1' }])
            const rows = await agencyErpApi.listEvents('c-1')
            expect(fromMock).toHaveBeenCalledWith('agency_erp_events')
            expect(eq).toHaveBeenCalledWith('connection_id', 'c-1')
            expect(order).toHaveBeenCalledWith('received_at', { ascending: false })
            expect(limit).toHaveBeenCalledWith(EVENT_LIMIT)
            expect(rows).toEqual([{ id: 'e-1' }])
        })

        it('lists recent events across connections with a bound', async () => {
            const { eq, limit } = mockQuery([])
            await agencyErpApi.listRecentEvents()
            expect(eq).not.toHaveBeenCalled()
            expect(limit).toHaveBeenCalledWith(RECENT_EVENT_LIMIT)
        })

        it('lists agreements', async () => {
            const order = vi.fn().mockResolvedValue({ data: [{ id: 'ag-1', client_name: 'Acme', status: 'active' }], error: null })
            const select = vi.fn().mockReturnValue({ order })
            fromMock.mockReturnValue({ select })
            expect(await agencyErpApi.listAgreements()).toHaveLength(1)
            expect(fromMock).toHaveBeenCalledWith('agency_client_agreements')
        })

        it('turns a read error into a plain message', async () => {
            const order = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied for table x' } })
            fromMock.mockReturnValue({ select: vi.fn().mockReturnValue({ order }) })
            const err = await agencyErpApi.listConnections().catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to load connections')
        })
    })

    describe('createConnection', () => {
        it('sends the exact RPC arguments and returns the secret once', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, connection_id: 'c-1', secret: 'erpk_abc' }, error: null })
            const result = await agencyErpApi.createConnection(createInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_erp_connection_create', {
                p_client_id: 'ag-1',
                p_agreement_id: 'ag-1',
                p_name: 'Tally feed',
                p_kind: 'webhook',
                p_idempotency_key: 'k-1',
            })
            expect(result).toEqual({ ok: true, replay: false, connectionId: 'c-1', secret: 'erpk_abc' })
        })

        it('returns a null secret on a replay', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, connection_id: 'c-1', secret: null, replay: true }, error: null })
            expect(await agencyErpApi.createConnection(createInput)).toEqual({ ok: true, replay: true, connectionId: 'c-1', secret: null })
        })

        it.each([
            ['idempotency_key_reused', /already used/],
            ['name_required', /up to 60/],
            ['invalid_kind', /CSV drop or Webhook/],
            ['client_not_found', /client could not be found/],
            ['agreement_not_found', /agreement could not be found/],
            ['agreement_not_active', /has ended/],
            ['name_exists', /already exists/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyErpApi.createConnection(createInput)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('maps an unknown refusal to the fallback and never echoes a secret', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'mystery', secret: 'erpk_leak' }, error: null })
            const result = await agencyErpApi.createConnection(createInput)
            expect(result).toEqual({ ok: false, error: 'unknown', message: 'Failed to create the connection' })
            expect(JSON.stringify(result)).not.toContain('erpk_leak')
        })

        it('surfaces approved exceptions, redacts the rest and rejects malformed envelopes', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Agency approval is required.' } })
            await expect(agencyErpApi.createConnection(createInput)).rejects.toThrow('Agency approval is required.')
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist' } })
            const err = await agencyErpApi.createConnection(createInput).catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to create the connection')
            rpcMock.mockResolvedValueOnce({ data: { ok: true }, error: null })
            await expect(agencyErpApi.createConnection(createInput)).rejects.toThrow('Failed to create the connection')
            rpcMock.mockResolvedValueOnce({ data: { ok: true, connection_id: 'c-1', secret: '' }, error: null })
            await expect(agencyErpApi.createConnection(createInput)).rejects.toThrow('Failed to create the connection')
        })
    })

    describe('setStatus', () => {
        it('sends the exact RPC arguments', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, status: 'paused', version: 3 }, error: null })
            const result = await agencyErpApi.setStatus('c-1', 'paused', 2)
            expect(rpcMock).toHaveBeenCalledWith('agency_erp_connection_set_status', {
                p_connection_id: 'c-1',
                p_to_status: 'paused',
                p_expected_version: 2,
            })
            expect(result).toEqual({ ok: true, status: 'paused', version: 3 })
        })

        it('returns version_conflict with the current version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'version_conflict', current_version: 7 }, error: null })
            expect(await agencyErpApi.setStatus('c-1', 'active', 2)).toMatchObject({
                ok: false, error: 'version_conflict', currentVersion: 7, message: 'This connection changed. Reload to continue.',
            })
        })

        it.each([
            ['illegal_transition', /not allowed/],
            ['connection_not_found', /could not be found/],
            ['invalid_status', /not recognised/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyErpApi.setStatus('c-1', 'revoked', 1)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('rejects a malformed success envelope', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: true, status: 'weird', version: 2 }, error: null })
            await expect(agencyErpApi.setStatus('c-1', 'paused', 1)).rejects.toThrow('Failed to change the connection')
        })
    })

    describe('rotateSecret', () => {
        it('sends the exact RPC arguments and returns the new secret', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, secret: 'erpk_new', version: 4 }, error: null })
            const result = await agencyErpApi.rotateSecret('c-1', 3)
            expect(rpcMock).toHaveBeenCalledWith('agency_erp_connection_rotate_secret', { p_connection_id: 'c-1', p_expected_version: 3 })
            expect(result).toEqual({ ok: true, secret: 'erpk_new', version: 4 })
        })

        it.each([
            ['connection_revoked', /revoked/],
            ['connection_not_found', /could not be found/],
            ['version_conflict', /changed/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyErpApi.rotateSecret('c-1', 1)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('rejects a success envelope without a secret', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: true, version: 4 }, error: null })
            await expect(agencyErpApi.rotateSecret('c-1', 3)).rejects.toThrow('Failed to rotate the secret')
        })
    })
})
