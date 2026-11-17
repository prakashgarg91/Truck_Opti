import { beforeEach, describe, expect, it, vi } from 'vitest'

// TO-152 S7: every guarded command must surface SQLSTATE SB001/SB002/SB003 as a
// SubscriptionLimitError (not the generic "Failed to ..." fallback) so the page
// can show the limit prompt. Non-subscription errors must keep their fallback.

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => {
    const client: Record<string, unknown> = {}
    client.rpc = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.rpc called without its client as this')
        return rpcMock(...args)
    }
    return { supabase: client }
})

import { agencyTeamApi, agencyDriverInvitationApi } from './agencyOrganizationApi'
import { agencyFleetApi, agencyJobsApi } from './agencyPortalApi'
import { agencyOrdersApi } from './agencyOrdersApi'
import { agencyLoadPlansApi } from './agencyLoadPlansApi'
import { SubscriptionLimitError } from '../lib/subscriptionGuard'
import { UserFacingError } from '../utils/userFacingError'

const sb = (code: string, resource: string, status: string) => ({
    code,
    message: `${code} SUBSCRIPTION`,
    details: JSON.stringify({ code, resource, limit: 5, used: 5, plan: 'starter', status }),
})

const calls: ReadonlyArray<[string, () => Promise<unknown>]> = [
    ['agency_member_invite', () => agencyTeamApi.invite({ email: 'a@b.co', scope: 'viewer', idempotencyKey: 'k1' })],
    ['agency_driver_invitation_create', () => agencyDriverInvitationApi.create({ phone: '+919876543210', idempotencyKey: 'k2' })],
    ['agency_vehicle_create', () => agencyFleetApi.createVehicle({ rc_number: 'KA01AB1234', vehicle_type: 'eicher_14ft' })],
    ['agency_order_import', () => agencyOrdersApi.importOrders({ agreementId: 'ag', fileHash: 'h', idempotencyKey: 'k3', lines: [] })],
    ['agency_load_plan_approve', () => agencyLoadPlansApi.approvePlan('p-1', 1)],
    ['agency_job_assign_driver', () => agencyJobsApi.assignDriver('j-1', 'd-1')],
]

describe('guarded commands surface SB001/SB002/SB003', () => {
    beforeEach(() => rpcMock.mockReset())

    for (const [name, run] of calls) {
        it(`${name}: SB001 becomes a SubscriptionLimitError with the DETAIL numbers`, async () => {
            rpcMock.mockResolvedValue({ data: null, error: sb('SB001', 'truck_add', 'active') })
            const err = await run().catch((e) => e)
            expect(err).toBeInstanceOf(SubscriptionLimitError)
            expect(err).toBeInstanceOf(UserFacingError)
            expect((err as SubscriptionLimitError).info).toMatchObject({ code: 'SB001', limit: 5, used: 5, action: 'upgrade' })
        })

        it(`${name}: SB002 and SB003 map to read-only and dispatch-locked`, async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: sb('SB002', 'order_import', 'grace') })
            const readOnly = await run().catch((e) => e)
            expect((readOnly as SubscriptionLimitError).info).toMatchObject({ code: 'SB002', kind: 'read_only', action: 'renew' })

            rpcMock.mockResolvedValueOnce({ data: null, error: sb('SB003', 'dispatch', 'expired') })
            const locked = await run().catch((e) => e)
            expect((locked as SubscriptionLimitError).info).toMatchObject({ code: 'SB003', kind: 'dispatch_locked' })
        })

        it(`${name}: an unrelated database error keeps the generic fallback`, async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset', code: '08006' } })
            const err = await run().catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err).not.toBeInstanceOf(SubscriptionLimitError)
        })
    }
})
