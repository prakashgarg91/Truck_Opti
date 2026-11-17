import { beforeEach, describe, expect, it, vi } from 'vitest'

const selectMock = vi.hoisted(() => vi.fn())
const eqMock = vi.hoisted(() => vi.fn())
const inMock = vi.hoisted(() => vi.fn())
const singleMock = vi.hoisted(() => vi.fn())
const maybeSingleMock = vi.hoisted(() => vi.fn())
const orderMock = vi.hoisted(() => vi.fn())
const limitMock = vi.hoisted(() => vi.fn())
const authGetUserMock = vi.hoisted(() => vi.fn())
const rpcMock = vi.hoisted(() => vi.fn())
const functionsInvokeMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: vi.fn(() => ({
            select: selectMock,
            update: vi.fn(() => ({
                eq: eqMock,
                select: selectMock,
            })),
            delete: vi.fn(() => ({
                eq: eqMock,
            })),
            insert: vi.fn(() => ({
                select: selectMock,
            })),
        })),
        auth: {
            getUser: authGetUserMock,
        },
        rpc: rpcMock,
        functions: {
            invoke: functionsInvokeMock,
        },
    },
}))

import { supabase } from '../lib/supabase'
import {
    subscriptionApi,
    subscriptionHelpers,
    type Subscription,
} from './subscriptionApi'

describe('subscriptionApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()

        // Create fluent mock chain that matches actual Supabase patterns:
        // getAll(): from().select().eq().order() -> resolves at order
        // getCurrent(): from().select().eq().in().order().limit().maybeSingle() -> resolves at maybeSingle
        // getById(): from().select().eq().single() -> resolves at single
        // invoices.getAll(): from().select().eq().order() -> resolves at order

        const limitResult = {
            maybeSingle: maybeSingleMock,
        }

        const orderResult = {
            limit: limitMock,
            single: singleMock,
            maybeSingle: maybeSingleMock,
        }

        const inResult = {
            order: orderMock,
            limit: limitMock,
            single: singleMock,
            maybeSingle: maybeSingleMock,
        }

        const eqResult = {
            in: inMock,
            order: orderMock,
            limit: limitMock,
            single: singleMock,
            maybeSingle: maybeSingleMock,
        }

        const selectResult = {
            eq: eqMock,
            in: inMock,
            order: orderMock,
            limit: limitMock,
            single: singleMock,
            maybeSingle: maybeSingleMock,
        }

        selectMock.mockReturnValue(selectResult)
        eqMock.mockReturnValue(eqResult)
        inMock.mockReturnValue(inResult)
        orderMock.mockReturnValue(orderResult)
        limitMock.mockReturnValue(limitResult)
        singleMock.mockResolvedValue({ data: null, error: { message: 'Not found' } })
        maybeSingleMock.mockResolvedValue({ data: null, error: null })
    })

    describe('subscriptionPlansApi.getAll', () => {
        it('returns empty array when no plans exist', async () => {
            orderMock.mockResolvedValue({ data: [], error: null })

            const result = await subscriptionApi.plans.getAll()

            expect(result).toEqual([])
            expect(selectMock).toHaveBeenCalledWith('*')
            expect(eqMock).toHaveBeenCalledWith('is_active', true)
            expect(orderMock).toHaveBeenCalledWith('price_monthly', { ascending: true })
        })

        it('returns plans with parsed features', async () => {
            const mockPlans = [
                { id: '1', name: 'Basic', features: '["feature1", "feature2"]', is_active: true },
                { id: '2', name: 'Pro', features: ['feature3', 'feature4'], is_active: true },
            ]
            orderMock.mockResolvedValue({ data: mockPlans, error: null })

            const result = await subscriptionApi.plans.getAll()

            expect(result).toHaveLength(2)
            expect(result[0].features).toEqual(['feature1', 'feature2'])
            expect(result[1].features).toEqual(['feature3', 'feature4'])
        })

        it('handles malformed features gracefully', async () => {
            const mockPlans = [
                { id: '1', name: 'Basic', features: 'invalid json', is_active: true },
                { id: '2', name: 'Pro', features: null, is_active: true },
            ]
            orderMock.mockResolvedValue({ data: mockPlans, error: null })

            const result = await subscriptionApi.plans.getAll()

            expect(result).toHaveLength(2)
            expect(result[0].features).toEqual([])
            expect(result[1].features).toEqual([])
        })

        it('throws error when query fails', async () => {
            orderMock.mockResolvedValue({ data: null, error: { message: 'Database error' } })

            await expect(subscriptionApi.plans.getAll()).rejects.toThrow('Database error')
        })
    })

    describe('subscriptionPlansApi.getByTier', () => {
        it('returns plan when found', async () => {
            const mockPlan = { id: 'growth', name: 'Growth', features: '["feature1"]', tier: 'growth' }
            singleMock.mockResolvedValue({ data: mockPlan, error: null })

            const result = await subscriptionApi.plans.getByTier('growth')

            expect(result).toEqual({ ...mockPlan, features: ['feature1'] })
        })

        it('returns null when not found and no fallback', async () => {
            singleMock.mockResolvedValue({ data: null, error: { message: 'Not found' } })

            const result = await subscriptionApi.plans.getByTier('nonexistent')

            expect(result).toBeNull()
        })
    })

    describe('subscriptionsApi.getCurrent (entitlement RPC, no table read)', () => {
        const entitlement = (over: Record<string, unknown> = {}) => ({
            ok: true,
            agency_id: 'ag_1',
            status: 'active',
            plan_tier: 'growth',
            period_end: '2027-01-01T00:00:00Z',
            grace_end: null,
            trial_end: null,
            can_write: true,
            can_dispatch: true,
            limits: { trucks: 10, staff: 5, drivers: 20, orders_month: 500 },
            usage: { trucks: 3, staff: 1, drivers: 2, orders_month: 40 },
            ...over,
        })

        it('reads through the RPC and never touches the subscriptions table', async () => {
            rpcMock.mockResolvedValue({ data: entitlement(), error: null })

            const result = await subscriptionApi.subscriptions.getCurrent()

            expect(rpcMock).toHaveBeenCalledWith('agency_subscription_entitlement')
            expect(supabase.from).not.toHaveBeenCalled()
            expect(result).toMatchObject({ status: 'active', plan_id: 'growth', current_period_end: '2027-01-01T00:00:00Z' })
        })

        it('returns a trial subscription using trial_end', async () => {
            rpcMock.mockResolvedValue({
                data: entitlement({ status: 'trial', trial_end: '2026-12-01T00:00:00Z', period_end: null }),
                error: null,
            })

            const result = await subscriptionApi.subscriptions.getCurrent()

            expect(result).toMatchObject({ status: 'trial', current_period_end: '2026-12-01T00:00:00Z' })
        })

        it('keeps past_due fully usable (banner only) for legacy callers', async () => {
            rpcMock.mockResolvedValue({ data: entitlement({ status: 'past_due' }), error: null })

            const result = await subscriptionApi.subscriptions.getCurrent()

            expect(result?.status).toBe('active')
        })

        it.each(['grace', 'expired', 'cancelled'])('returns null for %s', async (status) => {
            rpcMock.mockResolvedValue({ data: entitlement({ status, can_write: false }), error: null })

            expect(await subscriptionApi.subscriptions.getCurrent()).toBeNull()
        })

        it('returns null when the agency has no subscription', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false }, error: null })

            expect(await subscriptionApi.subscriptions.getCurrent()).toBeNull()
        })

        it('returns null on RPC error', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })

            expect(await subscriptionApi.subscriptions.getCurrent()).toBeNull()
        })
    })

    describe('usageApi.getCurrent (entitlement RPC)', () => {
        it('maps orders_month to shipments_used without reading usage_tracking', async () => {
            rpcMock.mockResolvedValue({
                data: {
                    ok: true, agency_id: 'ag_1', status: 'active', plan_tier: 'starter',
                    period_end: '2027-01-01T00:00:00Z', can_write: true, can_dispatch: true,
                    limits: {}, usage: { trucks: 1, staff: 0, drivers: 0, orders_month: 77 },
                },
                error: null,
            })

            const usage = await subscriptionApi.usage.getCurrent()

            expect(usage?.shipments_used).toBe(77)
            expect(supabase.from).not.toHaveBeenCalled()
        })

        it('returns null with no live subscription and an empty history', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false }, error: null })

            expect(await subscriptionApi.usage.getCurrent()).toBeNull()
            expect(await subscriptionApi.usage.getHistory()).toEqual([])
        })
    })

    describe('entitlementApi.startTrial', () => {
        it('calls the owner-only trial RPC then refetches the entitlement', async () => {
            rpcMock
                .mockResolvedValueOnce({ data: { ok: true }, error: null })
                .mockResolvedValueOnce({ data: { ok: true, status: 'trial', can_write: true, can_dispatch: true }, error: null })

            const ent = await subscriptionApi.entitlement.startTrial()

            expect(rpcMock).toHaveBeenNthCalledWith(1, 'agency_subscription_start_trial')
            expect(rpcMock).toHaveBeenNthCalledWith(2, 'agency_subscription_entitlement')
            expect(ent.status).toBe('trial')
        })

        it('surfaces the typed error from a raised exception', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'trial_already_claimed' } })

            await expect(subscriptionApi.entitlement.startTrial()).rejects.toMatchObject({ code: 'trial_already_claimed' })
        })

        it('surfaces the typed error from an ok:false payload', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'identity_required' }, error: null })

            await expect(subscriptionApi.entitlement.startTrial()).rejects.toMatchObject({ code: 'identity_required' })
        })
    })

    describe('checkoutApi.createOrder', () => {
        it('sends only plan_tier, billing_cycle and coupon_code (no amount)', async () => {
            functionsInvokeMock.mockResolvedValue({ data: { id: 'order_1', amount: 58882, currency: 'INR' }, error: null })

            const order = await subscriptionApi.checkout.createOrder({
                plan_tier: 'growth',
                billing_cycle: 'monthly',
                coupon_code: ' founding50 ',
            })

            expect(functionsInvokeMock).toHaveBeenCalledWith('create-razorpay-order', {
                body: { plan_tier: 'growth', billing_cycle: 'monthly', coupon_code: 'FOUNDING50' },
            })
            expect(order).toEqual({ id: 'order_1', amount: 58882, currency: 'INR' })
        })

        it('omits an empty coupon and rejects when no order id comes back', async () => {
            functionsInvokeMock.mockResolvedValue({ data: null, error: { message: 'x' } })

            await expect(subscriptionApi.checkout.createOrder({ plan_tier: 'starter', billing_cycle: 'yearly', coupon_code: '  ' }))
                .rejects.toThrow('Unable to start payment')
            expect(functionsInvokeMock.mock.calls[0][1]).toEqual({ body: { plan_tier: 'starter', billing_cycle: 'yearly' } })
        })
    })

    describe('subscriptionsApi.create', () => {
        it('throws error when called directly', async () => {
            await expect(subscriptionApi.subscriptions.create('pro', 'monthly'))
                .rejects.toThrow('Direct client subscription creation is disabled')
        })
    })

    describe('subscriptionsApi.cancel', () => {
        it('throws error when called directly', async () => {
            await expect(subscriptionApi.subscriptions.cancel())
                .rejects.toThrow('Direct client subscription cancellation is disabled')
        })
    })

    describe('subscriptionsApi.changePlan', () => {
        it('throws error when called directly', async () => {
            await expect(subscriptionApi.subscriptions.changePlan('enterprise'))
                .rejects.toThrow('Direct client plan changes are disabled')
        })
    })

    describe('usageApi.canUse', () => {
        it('returns false when no user is authenticated', async () => {
            authGetUserMock.mockResolvedValue({ data: { user: null } })

            const result = await subscriptionApi.usage.canUse('shipments')

            expect(result).toBe(false)
        })

        it('returns false on RPC error', async () => {
            const mockUser = { id: 'user_1' }
            rpcMock.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })

            const result = await subscriptionApi.usage.canUse('shipments')

            expect(result).toBe(false)
        })

        it('returns RPC result when successful', async () => {
            const mockUser = { id: 'user_1' }
            rpcMock.mockResolvedValue({ data: true, error: null })

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })

            const result = await subscriptionApi.usage.canUse('shipments')

            expect(result).toBe(true)
            expect(rpcMock).toHaveBeenCalledWith('check_usage_limit', { p_user_id: 'user_1', p_resource: 'shipments' })
        })
    })

    describe('usageApi.increment', () => {
        it('does nothing when no user is authenticated', async () => {
            authGetUserMock.mockResolvedValue({ data: { user: null } })

            await subscriptionApi.usage.increment('shipments', 1)

            expect(rpcMock).not.toHaveBeenCalled()
        })

        it('calls RPC with correct parameters', async () => {
            const mockUser = { id: 'user_1' }
            rpcMock.mockResolvedValue({ data: null, error: null })

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })

            await subscriptionApi.usage.increment('api_calls', 5)

            expect(rpcMock).toHaveBeenCalledWith('increment_usage', {
                p_user_id: 'user_1',
                p_resource: 'api_calls',
                p_amount: 5
            })
        })
    })

    describe('invoicesApi.getAll', () => {
        it('returns empty array when no user is authenticated', async () => {
            authGetUserMock.mockResolvedValue({ data: { user: null } })

            const result = await subscriptionApi.invoices.getAll()

            expect(result).toEqual([])
        })

        it('returns empty array on query error', async () => {
            const mockUser = { id: 'user_1' }

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })
            orderMock.mockResolvedValue({ data: null, error: { message: 'Query error' } })

            const result = await subscriptionApi.invoices.getAll()

            expect(result).toEqual([])
        })
    })

    describe('gstInvoicesApi.list', () => {
        const row = {
            id: 'inv_1', invoice_number: 'TO/26-27/000001', issued_at: '2026-07-15T06:00:00Z',
            taxable_paise: 49900, cgst_paise: 4491, sgst_paise: 4491, igst_paise: 0, total_paise: 58882,
            place_of_supply_state_code: '27', sac_code: '997331', recipient_name: null, recipient_gstin: null,
            credit_notes: [],
        }

        it('reads the agency invoices through agency_subscription_invoices()', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, invoices: [row] }, error: null })

            const result = await subscriptionApi.gstInvoices.list()

            expect(rpcMock).toHaveBeenCalledWith('agency_subscription_invoices')
            expect(result).toEqual([row])
        })

        it('defaults missing credit_notes to an empty array', async () => {
            const { credit_notes: _omit, ...bare } = row
            void _omit
            rpcMock.mockResolvedValue({ data: { ok: true, invoices: [bare] }, error: null })

            const result = await subscriptionApi.gstInvoices.list()

            expect(result[0].credit_notes).toEqual([])
        })

        it('returns an empty list for a scope that may not see billing documents', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'forbidden_scope' }, error: null })

            await expect(subscriptionApi.gstInvoices.list()).resolves.toEqual([])
        })

        it('throws on other refusals and on transport errors', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'no_agency' }, error: null })
            await expect(subscriptionApi.gstInvoices.list()).rejects.toThrow('no_agency')

            rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } })
            await expect(subscriptionApi.gstInvoices.list()).rejects.toEqual({ message: 'boom' })
        })
    })

    describe('invoicesApi.getSignedUrl', () => {
        it('mints a signed URL through the invoice-view Edge function (TO-142 private bucket)', async () => {
            functionsInvokeMock.mockResolvedValue({
                data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/billing-documents/x.pdf?token=t', expiresIn: 300 },
                error: null,
            })

            const result = await subscriptionApi.invoices.getSignedUrl('invoice_1')

            expect(result).toBe('https://example.supabase.co/storage/v1/object/sign/billing-documents/x.pdf?token=t')
            expect(functionsInvokeMock).toHaveBeenCalledWith('invoice-view', { body: { invoiceId: 'invoice_1' } })
        })

        it('returns null when the Edge function errors', async () => {
            functionsInvokeMock.mockResolvedValue({ data: null, error: { message: 'Access denied.' } })

            const result = await subscriptionApi.invoices.getSignedUrl('invoice_1')

            expect(result).toBeNull()
        })

        it('returns null when no signedUrl is returned', async () => {
            functionsInvokeMock.mockResolvedValue({ data: { signedUrl: null, expiresIn: 300 }, error: null })

            const result = await subscriptionApi.invoices.getSignedUrl('invoice_1')

            expect(result).toBeNull()
        })
    })

    describe('invoicesApi.downloadPdf', () => {
        it('mints a fresh signed URL instead of opening a stored pdf_url (TO-142)', async () => {
            functionsInvokeMock.mockResolvedValue({
                data: { signedUrl: 'https://example.supabase.co/storage/v1/object/sign/billing-documents/fresh.pdf?token=t', expiresIn: 300 },
                error: null,
            })

            const result = await subscriptionApi.invoices.downloadPdf('invoice_1')

            expect(result).toBe('https://example.supabase.co/storage/v1/object/sign/billing-documents/fresh.pdf?token=t')
            expect(functionsInvokeMock).toHaveBeenCalledWith('invoice-view', { body: { invoiceId: 'invoice_1' } })
        })

        it('returns null when signing fails', async () => {
            functionsInvokeMock.mockResolvedValue({ data: null, error: { message: 'Invoice not found.' } })

            const result = await subscriptionApi.invoices.downloadPdf('invoice_1')

            expect(result).toBeNull()
        })
    })
})

describe('subscriptionHelpers', () => {
    describe('formatPrice', () => {
        it('formats paise to rupees with Indian locale', () => {
            expect(subscriptionHelpers.formatPrice(10000)).toBe('₹100')
            expect(subscriptionHelpers.formatPrice(199900)).toBe('₹1,999')
            expect(subscriptionHelpers.formatPrice(5000)).toBe('₹50')
            expect(subscriptionHelpers.formatPrice(0)).toBe('₹0')
        })

        it('handles large numbers', () => {
            expect(subscriptionHelpers.formatPrice(10000000)).toBe('₹1,00,000')
        })
    })

    describe('hasActiveSubscription', () => {
        it('returns false when no user is authenticated', async () => {
            authGetUserMock.mockResolvedValue({ data: { user: null } })

            const result = await subscriptionHelpers.hasActiveSubscription()

            expect(result).toBe(false)
        })

        it('returns false on RPC error', async () => {
            const mockUser = { id: 'user_1' }
            rpcMock.mockResolvedValue({ data: null, error: { message: 'RPC error' } })

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })

            const result = await subscriptionHelpers.hasActiveSubscription()

            expect(result).toBe(false)
        })

        it('returns RPC result when successful', async () => {
            const mockUser = { id: 'user_1' }
            rpcMock.mockResolvedValue({ data: true, error: null })

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })

            const result = await subscriptionHelpers.hasActiveSubscription()

            expect(result).toBe(true)
            expect(rpcMock).toHaveBeenCalledWith('has_active_subscription', { p_user_id: 'user_1' })
        })
    })

    describe('getRemainingDays', () => {
        it('calculates remaining days correctly', () => {
            const subscription: Subscription = {
                id: 'sub_1',
                user_id: 'user_1',
                plan_id: 'pro',
                status: 'active',
                billing_cycle: 'monthly',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                cancel_at_period_end: false,
            }

            const result = subscriptionHelpers.getRemainingDays(subscription)

            expect(result).toBeGreaterThanOrEqual(6)
            expect(result).toBeLessThanOrEqual(8)
        })

        it('returns 0 when subscription has expired', () => {
            const subscription: Subscription = {
                id: 'sub_1',
                user_id: 'user_1',
                plan_id: 'pro',
                status: 'active',
                billing_cycle: 'monthly',
                current_period_start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                current_period_end: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                cancel_at_period_end: false,
            }

            const result = subscriptionHelpers.getRemainingDays(subscription)

            expect(result).toBe(0)
        })
    })

    describe('isInTrial', () => {
        it('returns true when subscription status is trial', () => {
            const subscription: Subscription = {
                id: 'sub_1',
                user_id: 'user_1',
                plan_id: 'pro',
                status: 'trial',
                billing_cycle: 'monthly',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date().toISOString(),
                cancel_at_period_end: false,
                trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            }

            expect(subscriptionHelpers.isInTrial(subscription)).toBe(true)
        })

        it('returns false when subscription status is not trial', () => {
            const subscription: Subscription = {
                id: 'sub_1',
                user_id: 'user_1',
                plan_id: 'pro',
                status: 'active',
                billing_cycle: 'monthly',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date().toISOString(),
                cancel_at_period_end: false,
            }

            expect(subscriptionHelpers.isInTrial(subscription)).toBe(false)
        })
    })

    describe('getUsagePercentage', () => {
        it('calculates percentage correctly', () => {
            expect(subscriptionHelpers.getUsagePercentage(50, 100)).toBe(50)
            expect(subscriptionHelpers.getUsagePercentage(75, 100)).toBe(75)
            expect(subscriptionHelpers.getUsagePercentage(100, 100)).toBe(100)
            expect(subscriptionHelpers.getUsagePercentage(0, 100)).toBe(0)
        })

        it('rounds to nearest whole number', () => {
            expect(subscriptionHelpers.getUsagePercentage(33, 100)).toBe(33)
            expect(subscriptionHelpers.getUsagePercentage(66, 100)).toBe(66)
        })

        it('caps at 100 percent', () => {
            expect(subscriptionHelpers.getUsagePercentage(150, 100)).toBe(100)
            expect(subscriptionHelpers.getUsagePercentage(200, 100)).toBe(100)
        })

        it('returns 0 for unlimited usage', () => {
            expect(subscriptionHelpers.getUsagePercentage(50, -1)).toBe(0)
            expect(subscriptionHelpers.getUsagePercentage(999999, -1)).toBe(0)
        })

        it('handles zero limit', () => {
            expect(subscriptionHelpers.getUsagePercentage(0, 0)).toBe(0)
        })
    })
})
