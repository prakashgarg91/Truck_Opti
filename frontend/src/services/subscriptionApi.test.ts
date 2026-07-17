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
    },
}))

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

    describe('subscriptionsApi.getCurrent', () => {
        it('returns null when no user is authenticated', async () => {
            authGetUserMock.mockResolvedValue({ data: { user: null } })

            const result = await subscriptionApi.subscriptions.getCurrent()

            expect(result).toBeNull()
        })

        it('returns active subscription when found', async () => {
            const mockUser = { id: 'user_1' }
            const mockSubscription = { id: 'sub_1', user_id: 'user_1', status: 'active' }

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })
            maybeSingleMock.mockResolvedValue({ data: mockSubscription, error: null })

            const result = await subscriptionApi.subscriptions.getCurrent()

            expect(result).toEqual(mockSubscription)
        })

        it('returns trial subscription when found', async () => {
            const mockUser = { id: 'user_1' }
            const mockSubscription = { id: 'sub_1', user_id: 'user_1', status: 'trial' }

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })
            maybeSingleMock.mockResolvedValue({ data: mockSubscription, error: null })

            const result = await subscriptionApi.subscriptions.getCurrent()

            expect(result).toEqual(mockSubscription)
        })

        it('returns null on query error', async () => {
            const mockUser = { id: 'user_1' }

            authGetUserMock.mockResolvedValue({ data: { user: mockUser } })
            maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'Query error' } })

            const result = await subscriptionApi.subscriptions.getCurrent()

            expect(result).toBeNull()
        })
    })

    describe('subscriptionsApi.create', () => {
        it('throws error when called directly', async () => {
            await expect(subscriptionApi.subscriptions.create('pro', 'monthly'))
                .rejects.toThrow('Direct client subscription creation is disabled')
        })
    })

    describe('subscriptionsApi.startTrial', () => {
        it('throws error when called directly', async () => {
            await expect(subscriptionApi.subscriptions.startTrial('pro'))
                .rejects.toThrow('Direct client trial activation is disabled')
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

    describe('invoicesApi.downloadPdf', () => {
        it('returns null when invoice not found', async () => {
            singleMock.mockResolvedValue({ data: null, error: { message: 'Not found' } })

            const result = await subscriptionApi.invoices.downloadPdf('invoice_1')

            expect(result).toBeNull()
        })

        it('returns pdf_url when invoice exists', async () => {
            const mockInvoice = { id: 'invoice_1', pdf_url: 'https://example.com/invoice.pdf' }
            singleMock.mockResolvedValue({ data: mockInvoice, error: null })

            const result = await subscriptionApi.invoices.downloadPdf('invoice_1')

            expect(result).toBe('https://example.com/invoice.pdf')
        })

        it('returns null when pdf_url is missing', async () => {
            const mockInvoice = { id: 'invoice_1', pdf_url: null }
            singleMock.mockResolvedValue({ data: mockInvoice, error: null })

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
