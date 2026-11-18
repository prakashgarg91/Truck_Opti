import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

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

import { agencyIdentityApi, IDENTITY_ERROR_MESSAGES, type IdentityErrorCode } from './agencyIdentityApi'
import { UserFacingError } from '../utils/userFacingError'

const input = {
    legalName: 'Sethi Roadlines',
    gstin: '08ABCDE1234F1Z5',
    phone: '98290 11111',
    address: '5 MI Road',
    state: 'Rajasthan',
}

function mockLoad(data: unknown, error: unknown = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data, error })
    const eq = vi.fn().mockReturnValue({ maybeSingle })
    const select = vi.fn().mockReturnValue({ eq })
    fromMock.mockReturnValue({ select })
    return { select, eq }
}

describe('agencyIdentityApi', () => {
    beforeEach(() => vi.clearAllMocks())

    describe('load', () => {
        it('reads the agency row the user owns', async () => {
            const { eq } = mockLoad({
                id: 'a-1', status: 'approved', company_name: 'Sethi', gstin: '08ABCDE1234F1Z5', contact_phone: '9829011111',
                address: '5 MI Road', state: 'Rajasthan', city: 'Jaipur', pincode: '302001', updated_at: '2026-11-18T10:00:00.123456+00:00',
            })
            const id = await agencyIdentityApi.load('u-1')
            expect(fromMock).toHaveBeenCalledWith('transport_agencies')
            expect(eq).toHaveBeenCalledWith('user_id', 'u-1')
            expect(id).toMatchObject({ agencyId: 'a-1', legalName: 'Sethi', gstin: '08ABCDE1234F1Z5', phone: '9829011111', state: 'Rajasthan' })
            expect(id?.updatedAt).toBe('2026-11-18T10:00:00.123456+00:00')
        })

        it('maps missing columns to empty strings', async () => {
            mockLoad({ id: 'a-1', status: 'pending', company_name: 'X', gstin: null, contact_phone: null, address: null, state: null, city: null, pincode: null, updated_at: null })
            expect(await agencyIdentityApi.load('u-1')).toMatchObject({ gstin: '', phone: '', address: '', state: '', updatedAt: null })
        })

        it('returns null when the user owns no agency', async () => {
            mockLoad(null)
            expect(await agencyIdentityApi.load('u-1')).toBeNull()
        })

        it('throws a plain message when the read fails', async () => {
            mockLoad(null, { message: 'permission denied for table x' })
            const err = await agencyIdentityApi.load('u-1').catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to load company details')
        })
    })

    describe('save', () => {
        it('sends the exact RPC arguments including the version guard and returns the saved identity', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, agency_id: 'a-1', legal_name: 'Sethi Roadlines', gstin: '08ABCDE1234F1Z5', phone: '9829011111', address: '5 MI Road', state: 'Rajasthan', updated_at: '2026-11-18T10:05:00.5+00:00' },
                error: null,
            })
            const r = await agencyIdentityApi.save({ ...input, city: ' Jaipur ', pincode: '302001', expectedUpdatedAt: '2026-11-18T10:00:00.123456+00:00' })
            expect(rpcMock).toHaveBeenCalledWith('agency_identity_update', {
                p_legal_name: 'Sethi Roadlines', p_gstin: '08ABCDE1234F1Z5', p_phone: '98290 11111', p_address: '5 MI Road', p_state: 'Rajasthan',
                p_expected_updated_at: '2026-11-18T10:00:00.123456+00:00', p_city: 'Jaipur', p_pincode: '302001',
            })
            expect(r.ok).toBe(true)
            if (r.ok) {
                expect(r.identity.phone).toBe('9829011111')
                expect(r.identity.updatedAt).toBe('2026-11-18T10:05:00.5+00:00')
            }
        })

        it('omits optional arguments that are blank', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, agency_id: 'a-1' }, error: null })
            await agencyIdentityApi.save({ ...input, city: '  ', pincode: '' })
            expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_city')
            expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_pincode')
            expect(rpcMock.mock.calls[0][1]).not.toHaveProperty('p_expected_updated_at')
        })

        it.each(Object.keys(IDENTITY_ERROR_MESSAGES) as IdentityErrorCode[])('returns a typed result with an approved message for %s', async (code) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const r = await agencyIdentityApi.save(input)
            expect(r).toEqual({ ok: false, error: code, message: IDENTITY_ERROR_MESSAGES[code] })
        })

        it('collapses an unknown refusal to a plain failure', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'select * from secrets' }, error: null })
            const err = await agencyIdentityApi.save(input).catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to save company details')
        })

        it('does not leak a database error message', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'relation "x" does not exist' } })
            const err = await agencyIdentityApi.save(input).catch((e) => e)
            expect(err.message).toBe('Failed to save company details')
        })
    })
})
