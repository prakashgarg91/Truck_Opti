import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: { rpc: rpcMock, from: fromMock },
}))

vi.mock('../utils/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

import {
    agencyClientsApi,
    agencyDriverInvitationApi,
    agencyTariffApi,
    agencyTeamApi,
} from './agencyOrganizationApi'
import { UserFacingError } from '../utils/userFacingError'

function mockList(rows: unknown[], error: unknown = null) {
    const order = vi.fn().mockResolvedValue({ data: rows, error })
    const select = vi.fn().mockReturnValue({ order })
    fromMock.mockReturnValue({ select })
    return { select, order }
}

describe('agencyOrganizationApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('team commands', () => {
        it('invites a member and surfaces the one-time token', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'created', token: 'ONE-TIME-CODE', invitation: { id: 'inv-1', scope: 'dispatcher', version: 1 } },
                error: null,
            })

            const result = await agencyTeamApi.invite({
                email: 'staff@example.com',
                scope: 'dispatcher',
                idempotencyKey: 'key-1',
            })

            expect(rpcMock).toHaveBeenCalledWith('agency_member_invite', {
                p_invited_email: 'staff@example.com',
                p_scope: 'dispatcher',
                p_expires_in_days: 7,
                p_idempotency_key: 'key-1',
            })
            expect(result).toMatchObject({ ok: true, state: 'created', token: 'ONE-TIME-CODE' })
        })

        it('never returns a token on an idempotent replay', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'idempotent_replay', invitation: { id: 'inv-1' } },
                error: null,
            })

            const result = await agencyTeamApi.invite({ email: 'a@b.in', scope: 'viewer', idempotencyKey: 'k' })

            expect(result.ok).toBe(true)
            if (result.ok) {
                expect(result.state).toBe('idempotent_replay')
                expect(result.token).toBeUndefined()
            }
        })

        it('returns a typed version conflict instead of throwing', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: false, error: 'version_conflict', current_version: 4 },
                error: null,
            })

            const result = await agencyTeamApi.revokeMember('mem-1', 2)

            expect(rpcMock).toHaveBeenCalledWith('agency_member_revoke', { p_membership_id: 'mem-1', p_expected_version: 2 })
            expect(result).toEqual({
                ok: false,
                error: 'version_conflict',
                currentVersion: 4,
                message: 'This record changed. Reload to continue.',
            })
        })

        it('maps a pending-invitation result to a plain message', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'invitation_already_pending' }, error: null })

            const result = await agencyTeamApi.invite({ email: 'a@b.in', scope: 'finance', idempotencyKey: 'k' })

            expect(result).toMatchObject({ ok: false, error: 'invitation_already_pending' })
            if (!result.ok) expect(result.message).toMatch(/already pending/i)
        })

        it('changes scope with expected version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'scope_changed', membership: { id: 'mem-1', version: 3 } }, error: null })

            const result = await agencyTeamApi.changeScope('mem-1', 'fleet_manager', 2)

            expect(rpcMock).toHaveBeenCalledWith('agency_member_change_scope', {
                p_membership_id: 'mem-1',
                p_scope: 'fleet_manager',
                p_expected_version: 2,
            })
            expect(result).toMatchObject({ ok: true, state: 'scope_changed' })
        })
    })

    describe('error handling', () => {
        it('shows controlled database exceptions verbatim', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'Pincode must be six digits.' } })

            await expect(
                agencyClientsApi.createSite({
                    agreementId: 'agr-1',
                    siteKind: 'bill_to',
                    label: 'HQ',
                    addressLine: '1 Road',
                    city: 'Delhi',
                    state: 'Delhi',
                    pincode: '11',
                    idempotencyKey: 'k',
                })
            ).rejects.toThrow('Pincode must be six digits.')
        })

        it('collapses unknown provider errors to the redacted fallback', async () => {
            rpcMock.mockResolvedValue({
                data: null,
                error: { message: 'permission denied for table agency_invitations (secret detail)' },
            })

            const failure = agencyTeamApi.invite({ email: 'a@b.in', scope: 'viewer', idempotencyKey: 'k' })

            await expect(failure).rejects.toBeInstanceOf(UserFacingError)
            await expect(failure).rejects.toThrow('Failed to create invitation')
            await expect(failure).rejects.not.toThrow(/secret detail/)
        })

        it('treats a malformed envelope as a failure, not success', async () => {
            rpcMock.mockResolvedValue({ data: { hello: 'world' }, error: null })

            await expect(agencyTeamApi.revokeInvitation('inv-1', 1)).rejects.toThrow('Failed to revoke invitation')
        })
    })

    describe('client agreements', () => {
        it('creates an agreement with trimmed GSTIN and idempotency key', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'created', agreement: { id: 'agr-1', version: 1 } }, error: null })

            await agencyClientsApi.createAgreement({
                clientName: 'Acme Steel',
                clientGstin: ' 07ABCDE1234F1Z5 ',
                paymentTermsDays: 30,
                idempotencyKey: 'k1',
            })

            expect(rpcMock).toHaveBeenCalledWith('agency_client_agreement_create', {
                p_client_name: 'Acme Steel',
                p_client_gstin: '07ABCDE1234F1Z5',
                p_payment_terms_days: 30,
                p_idempotency_key: 'k1',
            })
        })

        it('surfaces the one active bill-to rule', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'active_bill_to_exists' }, error: null })

            const result = await agencyClientsApi.updateSite('site-1', 1, { status: 'active' })

            expect(result).toMatchObject({ ok: false, error: 'active_bill_to_exists' })
            if (!result.ok) expect(result.message).toMatch(/one active bill-to/i)
        })
    })

    describe('tariffs', () => {
        it('publishes a rate with two-decimal amount and superseded head', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'published', tariff: { id: 't2', version_no: 2 } }, error: null })

            const result = await agencyTariffApi.publish({
                agreementId: 'agr-1',
                origin: 'Delhi',
                destination: 'Jaipur',
                vehicleType: null,
                rateBasis: 'per_trip',
                rateAmount: 18500.5,
                effectiveFrom: '2026-12-01',
                effectiveTo: null,
                supersedesVersionId: 't1',
                idempotencyKey: 'k2',
            })

            expect(rpcMock).toHaveBeenCalledWith('agency_tariff_version_publish', {
                p_agreement_id: 'agr-1',
                p_origin: 'Delhi',
                p_destination: 'Jaipur',
                p_rate_basis: 'per_trip',
                p_rate_amount: 18500.5,
                p_effective_from: '2026-12-01',
                p_idempotency_key: 'k2',
                p_supersedes_version_id: 't1',
            })
            expect(result).toMatchObject({ ok: true, state: 'published' })
        })

        it('refuses more than two decimals before calling the server', async () => {
            await expect(
                agencyTariffApi.publish({
                    agreementId: 'agr-1',
                    origin: 'A',
                    destination: 'B',
                    vehicleType: null,
                    rateBasis: 'per_km',
                    rateAmount: 12.345,
                    effectiveFrom: '2026-12-01',
                    effectiveTo: null,
                    idempotencyKey: 'k',
                })
            ).rejects.toThrow('Rate amount must have at most two decimal places.')
            expect(rpcMock).not.toHaveBeenCalled()
        })

        it('maps an overlap to a revise-instead message', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'tariff_overlap' }, error: null })

            const result = await agencyTariffApi.publish({
                agreementId: 'agr-1',
                origin: 'A',
                destination: 'B',
                vehicleType: 'eicher_14ft',
                rateBasis: 'per_tonne',
                rateAmount: 900,
                effectiveFrom: '2026-12-01',
                effectiveTo: '2027-01-01',
                idempotencyKey: 'k',
            })

            expect(result).toMatchObject({ ok: false, error: 'tariff_overlap' })
            if (!result.ok) expect(result.message).toMatch(/revise/i)
        })
    })

    describe('driver invitations', () => {
        it('creates an invitation by phone and returns the one-time token', async () => {
            rpcMock.mockResolvedValue({
                data: { ok: true, state: 'created', token: 'DRIVER-CODE', invitation: { id: 'di-1', version: 1 } },
                error: null,
            })

            const result = await agencyDriverInvitationApi.create({ phone: '+919876543210', idempotencyKey: 'k3' })

            expect(rpcMock).toHaveBeenCalledWith('agency_driver_invitation_create', {
                p_invited_phone: '+919876543210',
                p_expires_in_days: 7,
                p_idempotency_key: 'k3',
            })
            expect(result).toMatchObject({ ok: true, token: 'DRIVER-CODE' })
        })
    })

    describe('reads', () => {
        it('lists invitations with explicit columns and never token_hash or *', async () => {
            const { select } = mockList([{ id: 'inv-1' }])

            const rows = await agencyTeamApi.listInvitations()

            const columns = select.mock.calls[0][0] as string
            expect(columns).not.toContain('*')
            expect(columns).not.toContain('token_hash')
            expect(columns).toContain('invited_email')
            expect(fromMock).toHaveBeenCalledWith('agency_invitations')
            expect(rows).toEqual([{ id: 'inv-1' }])
        })

        it('lists driver invitations without token_hash', async () => {
            const { select } = mockList([])

            await agencyDriverInvitationApi.list()

            expect(select.mock.calls[0][0]).not.toContain('token_hash')
            expect(fromMock).toHaveBeenCalledWith('agency_driver_invitations')
        })

        it('turns a read error into a redacted failure', async () => {
            mockList([], { message: 'relation does not exist (internal)' })

            await expect(agencyTeamApi.listMembers()).rejects.toThrow('Failed to load team members')
        })
    })
})
