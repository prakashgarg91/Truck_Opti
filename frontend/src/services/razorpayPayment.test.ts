import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RazorpayPaymentRequest } from './razorpayPayment'

const invokeMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())
const loggerWarnMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        functions: {
            invoke: invokeMock,
        },
    },
}))

vi.mock('../utils/logger', () => ({
    logger: {
        error: loggerErrorMock,
        warn: loggerWarnMock,
    },
}))

const request: RazorpayPaymentRequest = {
    amount: 199900,
    description: 'TruckOpti Pro',
    customerName: 'Test User',
    customerEmail: 'test@example.com',
    customerPhone: '9999999999',
    userId: 'user_1',
    planId: 'pro',
    billingCycle: 'monthly',
}

async function importRazorpayModule(keyId: string | undefined, extraEnv: Record<string, string> = {}) {
    vi.resetModules()
    vi.unstubAllEnvs()

    if (keyId !== undefined) {
        vi.stubEnv('VITE_RAZORPAY_KEY_ID', keyId)
    }

    for (const [envKey, envValue] of Object.entries(extraEnv)) {
        vi.stubEnv(envKey, envValue)
    }

    return import('./razorpayPayment')
}

describe('initiateRazorpayPayment', () => {
    beforeEach(() => {
        invokeMock.mockReset()
        loggerErrorMock.mockReset()
        loggerWarnMock.mockReset()
        vi.spyOn(Date, 'now').mockReturnValue(1715457600000)
        document.body.innerHTML = ''
        delete (window as Window & { Razorpay?: unknown }).Razorpay
    })

    afterEach(() => {
        vi.restoreAllMocks()
        vi.unstubAllEnvs()
        delete (window as Window & { Razorpay?: unknown }).Razorpay
    })

    it('fails fast when Razorpay is not configured', async () => {
        const { initiateRazorpayPayment } = await importRazorpayModule('')

        await expect(initiateRazorpayPayment(request)).resolves.toEqual({
            success: false,
            error: 'Razorpay is not configured. Missing VITE_RAZORPAY_KEY_ID.',
        })
    })

    it('blocks test keys on the live TruckOpti site', async () => {
        const { initiateRazorpayPayment } = await importRazorpayModule('rzp_test_12345')

        await expect(initiateRazorpayPayment(request)).resolves.toEqual({
            success: false,
            error: 'Razorpay live payments are not enabled yet. Please contact support.',
        })
    })

    it('allows test keys on the live TruckOpti site when verification override is enabled', async () => {
        invokeMock
            .mockResolvedValueOnce({ data: { id: 'order_1' }, error: null })
            .mockResolvedValueOnce({ data: { success: true }, error: null })

        class RazorpayMock {
            constructor(private options: { handler: (response: Record<string, string>) => Promise<void> }) { }

            on() {
                return undefined
            }

            open() {
                void this.options.handler({
                    razorpay_payment_id: 'pay_1',
                    razorpay_order_id: 'order_1',
                    razorpay_signature: 'sig_1',
                })
            }
        }

        ; (window as Window & { Razorpay?: unknown }).Razorpay = RazorpayMock

        const { initiateRazorpayPayment } = await importRazorpayModule('rzp_test_12345', {
            VITE_ALLOW_TEST_RAZORPAY_ON_PRODUCTION: 'true',
        })
        const result = await initiateRazorpayPayment(request)

        expect(result).toEqual({
            success: true,
            status: 'success',
            paymentId: 'pay_1',
            orderId: 'order_1',
            signature: 'sig_1',
        })
    })

    it('returns success after server-side verification', async () => {
        invokeMock
            .mockResolvedValueOnce({ data: { id: 'order_1' }, error: null })
            .mockResolvedValueOnce({ data: { success: true }, error: null })

        class RazorpayMock {
            constructor(private options: { handler: (response: Record<string, string>) => Promise<void> }) { }

            on() {
                return undefined
            }

            open() {
                void this.options.handler({
                    razorpay_payment_id: 'pay_1',
                    razorpay_order_id: 'order_1',
                    razorpay_signature: 'sig_1',
                })
            }
        }

        ; (window as Window & { Razorpay?: unknown }).Razorpay = RazorpayMock

        const { initiateRazorpayPayment } = await importRazorpayModule('rzp_live_12345')
        const result = await initiateRazorpayPayment(request)

        expect(invokeMock).toHaveBeenNthCalledWith(
            1,
            'create-razorpay-order',
            expect.objectContaining({
                body: expect.objectContaining({
                    amount: 199900,
                    currency: 'INR',
                    receipt: 'rcpt_1715457600000',
                    customerPhone: '9999999999',
                    customerEmail: 'test@example.com',
                    notes: {
                        user_id: 'user_1',
                        plan_id: 'pro',
                        billing_cycle: 'monthly',
                    },
                }),
            })
        )
        expect(invokeMock).toHaveBeenNthCalledWith(
            2,
            'verify-razorpay-payment',
            expect.objectContaining({
                body: {
                    razorpay_order_id: 'order_1',
                    razorpay_payment_id: 'pay_1',
                    razorpay_signature: 'sig_1',
                    customer_phone: '9999999999',
                    customer_email: 'test@example.com',
                },
            })
        )
        expect(result).toEqual({
            success: true,
            status: 'success',
            paymentId: 'pay_1',
            orderId: 'order_1',
            signature: 'sig_1',
        })
    })

    it('returns a pending result when verification does not confirm success', async () => {
        invokeMock
            .mockResolvedValueOnce({ data: { id: 'order_1' }, error: null })
            .mockResolvedValueOnce({ data: { success: false, error: 'Verification pending' }, error: null })

        class RazorpayMock {
            constructor(private options: { handler: (response: Record<string, string>) => Promise<void> }) { }

            on() {
                return undefined
            }

            open() {
                void this.options.handler({
                    razorpay_payment_id: 'pay_1',
                    razorpay_order_id: 'order_1',
                    razorpay_signature: 'sig_1',
                })
            }
        }

        ; (window as Window & { Razorpay?: unknown }).Razorpay = RazorpayMock

        const { initiateRazorpayPayment } = await importRazorpayModule('rzp_live_12345')
        const result = await initiateRazorpayPayment(request)

        expect(loggerWarnMock).toHaveBeenCalledOnce()
        expect(result).toEqual({
            success: false,
            status: 'pending',
            paymentId: 'pay_1',
            orderId: 'order_1',
            signature: 'sig_1',
            error: 'Payment completed, but subscription verification is still pending.',
        })
    })

    it('sanitizes create-order failures before returning them to the UI', async () => {
        invokeMock.mockResolvedValueOnce({
            data: null,
            error: { message: 'Authenticated user does not match requested payment user' },
        })

        ; (window as Window & { Razorpay?: unknown }).Razorpay = class RazorpayMock { }

        const { initiateRazorpayPayment } = await importRazorpayModule('rzp_live_12345')
        const result = await initiateRazorpayPayment(request)

        expect(loggerErrorMock).toHaveBeenCalledOnce()
        expect(result).toEqual({
            success: false,
            error: 'Unable to start Razorpay payment right now. Please try again.',
        })
    })
})