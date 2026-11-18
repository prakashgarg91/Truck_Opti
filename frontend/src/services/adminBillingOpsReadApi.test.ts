import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({ supabase: { rpc: h.rpc, from: vi.fn() } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { adminBillingOpsApi } from './adminSupabaseApi'
import { UserFacingError } from '../utils/userFacingError'

describe('adminBillingOpsApi admin read functions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('agencies: calls the admin function with no arguments and maps rows to camelCase', async () => {
        h.rpc.mockResolvedValue({
            data: { ok: true, agencies: [{ id: 'a1', name: 'Alpha', created_at: '2026-11-01T00:00:00Z', owner_user_id: 'u1', owner_email: 'a@x.test' }] },
            error: null,
        })
        const rows = await adminBillingOpsApi.getAgenciesWithoutSubscription()
        expect(h.rpc).toHaveBeenCalledWith('admin_agencies_without_subscription')
        expect(rows).toEqual([{ id: 'a1', name: 'Alpha', createdAt: '2026-11-01T00:00:00Z', ownerUserId: 'u1', ownerEmail: 'a@x.test' }])
    })

    it('events: passes p_limit and maps rows, keeping null ids null', async () => {
        h.rpc.mockResolvedValue({
            data: { ok: true, events: [{ received_at: 't', event_id: 'e1', event_type: 'x', result: 'orphan', order_id: null, payment_id: 'p1' }] },
            error: null,
        })
        const rows = await adminBillingOpsApi.getWebhookEvents(50)
        expect(h.rpc).toHaveBeenCalledWith('admin_webhook_events', { p_limit: 50 })
        expect(rows).toEqual([{ receivedAt: 't', eventId: 'e1', eventType: 'x', result: 'orphan', orderId: null, paymentId: 'p1' }])
    })

    it('events: defaults to a limit of 100 and never maps a payload field even if one leaked into the reply', async () => {
        h.rpc.mockResolvedValue({
            data: { ok: true, events: [{ received_at: 't', event_id: 'e1', event_type: 'x', result: 'r', payload: { secret: 's' }, payload_sha256: 'h' }] },
            error: null,
        })
        const rows = await adminBillingOpsApi.getWebhookEvents()
        expect(h.rpc).toHaveBeenCalledWith('admin_webhook_events', { p_limit: 100 })
        expect(JSON.stringify(rows)).not.toContain('secret')
        expect(JSON.stringify(rows)).not.toContain('payload')
    })

    it('attempts: passes p_limit and maps rows', async () => {
        h.rpc.mockResolvedValue({ data: { ok: true, attempts: [{ event_id: 'e1', attempt_no: 2, sqlstate_or_code: '23505', at: 't' }] }, error: null })
        const rows = await adminBillingOpsApi.getWebhookAttempts(20)
        expect(h.rpc).toHaveBeenCalledWith('admin_webhook_attempts', { p_limit: 20 })
        expect(rows).toEqual([{ eventId: 'e1', attemptNo: 2, sqlstateOrCode: '23505', at: 't' }])
    })

    it('coupons: maps terms and the redemption count, nulls stay null', async () => {
        h.rpc.mockResolvedValue({
            data: { ok: true, coupons: [{ code: 'C1', percent_off: 50, max_cycles: 3, monthly_only: true, valid_until: null, max_redemptions: null, redemption_count: 4 }] },
            error: null,
        })
        const rows = await adminBillingOpsApi.getCoupons()
        expect(h.rpc).toHaveBeenCalledWith('admin_subscription_coupons')
        expect(rows).toEqual([{ code: 'C1', percentOff: 50, maxCycles: 3, monthlyOnly: true, validUntil: null, maxRedemptions: null, redemptionCount: 4 }])
    })

    it('returns an empty list for an ok reply with no rows', async () => {
        h.rpc.mockResolvedValue({ data: { ok: true, coupons: [] }, error: null })
        expect(await adminBillingOpsApi.getCoupons()).toEqual([])
    })

    it('a forbidden reply is a failure, never an empty list', async () => {
        h.rpc.mockResolvedValue({ data: { ok: false, error: 'forbidden' }, error: null })
        await expect(adminBillingOpsApi.getAgenciesWithoutSubscription()).rejects.toThrow('Unable to load agencies without a subscription right now. Please try again.')
        await expect(adminBillingOpsApi.getWebhookEvents()).rejects.toBeInstanceOf(UserFacingError)
    })

    it('a transport error hides the raw message behind a user-facing one', async () => {
        h.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for function admin_webhook_attempts' } })
        const failure = adminBillingOpsApi.getWebhookAttempts()
        await expect(failure).rejects.toThrow('Unable to load webhook retry attempts right now. Please try again.')
        await expect(adminBillingOpsApi.getWebhookAttempts()).rejects.not.toThrow(/permission denied/)
    })

    it('a malformed reply (no list) is a failure', async () => {
        h.rpc.mockResolvedValue({ data: { ok: true }, error: null })
        await expect(adminBillingOpsApi.getCoupons()).rejects.toThrow('Unable to load coupons right now. Please try again.')
        h.rpc.mockResolvedValue({ data: null, error: null })
        await expect(adminBillingOpsApi.getWebhookEvents()).rejects.toBeInstanceOf(UserFacingError)
    })
})
