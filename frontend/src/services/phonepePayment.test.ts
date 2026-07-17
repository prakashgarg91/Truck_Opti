import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())

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
    },
}))

import type { PhonePePaymentRequest } from './phonepePayment'

async function initiatePhonePePayment(request: PhonePePaymentRequest) {
    const paymentModule = await import('./phonepePayment')
    return paymentModule.initiatePhonePePayment(request)
}

async function checkPaymentStatus(merchantTransactionId: string) {
    const paymentModule = await import('./phonepePayment')
    return paymentModule.checkPaymentStatus(merchantTransactionId)
}

async function verifyAndActivateSubscription(merchantTransactionId: string, userId: string) {
    const paymentModule = await import('./phonepePayment')
    return paymentModule.verifyAndActivateSubscription(merchantTransactionId, userId)
}

async function getPaymentConfig() {
    const paymentModule = await import('./phonepePayment')
    return paymentModule.getPaymentConfig()
}

describe('phonepePayment', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
        vi.clearAllMocks()
        loggerErrorMock.mockReset()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    describe('initiatePhonePePayment', () => {
        const validRequest: PhonePePaymentRequest = {
            amount: 199900,
            orderId: 'order_123',
            userId: 'user_123',
            planId: 'pro',
            billingCycle: 'monthly',
            customerPhone: '9999999999',
            customerEmail: 'test@example.com',
        }

        it('fails fast when PhonePe merchant ID is not configured', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', '')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            await expect(initiatePhonePePayment(validRequest)).resolves.toEqual({
                success: false,
                code: 'CONFIG_ERROR',
                message: 'PhonePe is not configured: Missing VITE_PHONEPE_MERCHANT_ID',
            })
        })

        it('fails fast when PhonePe API URL is not configured', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', '')

            await expect(initiatePhonePePayment(validRequest)).resolves.toEqual({
                success: false,
                code: 'CONFIG_ERROR',
                message: 'PhonePe is not configured: Missing VITE_PHONEPE_API_URL',
            })
        })

        it('fails when merchant ID is placeholder', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'REPLACE_ME')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            await expect(initiatePhonePePayment(validRequest)).resolves.toEqual({
                success: false,
                code: 'CONFIG_ERROR',
                message: 'PhonePe is not configured: Missing VITE_PHONEPE_MERCHANT_ID',
            })
        })

        it('fails when API URL contains YOUR_ placeholder', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'YOUR_API_URL')

            await expect(initiatePhonePePayment(validRequest)).resolves.toEqual({
                success: false,
                code: 'CONFIG_ERROR',
                message: 'PhonePe is not configured: Missing VITE_PHONEPE_API_URL',
            })
        })

        it('blocks test mode on live site', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api-preprod.phonepe.com/apis/pg-sandbox')

            const originalLocation = window.location
            Object.defineProperty(window, 'location', {
                value: { hostname: 'truckopti.in' },
                writable: true,
                configurable: true,
            })

            try {
                await expect(initiatePhonePePayment(validRequest)).resolves.toEqual({
                    success: false,
                    code: 'CONFIG_ERROR',
                    message: 'PhonePe live payments are not enabled yet. Please contact support.',
                })
            } finally {
                Object.defineProperty(window, 'location', {
                    value: originalLocation,
                    writable: true,
                    configurable: true,
                })
            }
        })

        it('returns PhonePe checkout response on success', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            const mockResponse = {
                success: true,
                code: 'SUCCESS',
                message: 'Payment initiated',
                data: {
                    merchantId: 'MERCHANT123',
                    merchantTransactionId: 'TRK1234567890abc',
                    instrumentResponse: {
                        type: 'PAY_PAGE',
                        redirectInfo: {
                            url: 'https://mercury.phonepe.com/transact/123',
                            method: 'GET',
                        },
                    },
                },
            }

            invokeMock.mockResolvedValue({ data: mockResponse, error: null })

            const result = await initiatePhonePePayment(validRequest)

            expect(result).toEqual(mockResponse)
            expect(invokeMock).toHaveBeenCalledWith('phonepe-checkout', expect.objectContaining({
                body: expect.objectContaining({
                    merchantTransactionId: expect.stringMatching(/^TRK\d+[a-z0-9]+$/),
                    userId: 'user_123',
                    amount: 199900,
                    planId: 'pro',
                    billingCycle: 'monthly',
                    customerPhone: '9999999999',
                    customerEmail: 'test@example.com',
                }),
            }))
        })

        it('rejects redirect URLs from untrusted domains', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            const mockResponse = {
                success: true,
                code: 'SUCCESS',
                message: 'Payment initiated',
                data: {
                    merchantId: 'MERCHANT123',
                    merchantTransactionId: 'TRK1234567890abc',
                    instrumentResponse: {
                        type: 'PAY_PAGE',
                        redirectInfo: {
                            url: 'https://evil-site.com/transact/123',
                            method: 'GET',
                        },
                    },
                },
            }

            invokeMock.mockResolvedValue({ data: mockResponse, error: null })

            const result = await initiatePhonePePayment(validRequest)

            expect(result).toEqual({
                success: false,
                code: 'INVALID_REDIRECT_URL',
                message: 'Payment redirect validation failed. Please try again.',
            })
            expect(loggerErrorMock).toHaveBeenCalledOnce()
        })

        it('allows subdomains of trusted domains', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            const mockResponse = {
                success: true,
                code: 'SUCCESS',
                message: 'Payment initiated',
                data: {
                    merchantId: 'MERCHANT123',
                    merchantTransactionId: 'TRK1234567890abc',
                    instrumentResponse: {
                        type: 'PAY_PAGE',
                        redirectInfo: {
                            url: 'https://sub.mercury.phonepe.com/transact/123',
                            method: 'GET',
                        },
                    },
                },
            }

            invokeMock.mockResolvedValue({ data: mockResponse, error: null })

            const result = await initiatePhonePePayment(validRequest)

            expect(result.success).toBe(true)
        })

        it('handles empty response from checkout', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            invokeMock.mockResolvedValue({ data: null, error: null })

            await expect(initiatePhonePePayment(validRequest)).resolves.toEqual({
                success: false,
                code: 'PAYMENT_ERROR',
                message: 'Unable to start PhonePe payment right now. Please try Razorpay or contact support.',
            })
        })

        it('handles network errors gracefully', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            invokeMock.mockResolvedValue({
                data: null,
                error: new Error('Failed to fetch'),
            })

            await expect(initiatePhonePePayment(validRequest)).resolves.toEqual({
                success: false,
                code: 'PAYMENT_ERROR',
                message: 'PhonePe payment service is currently unreachable. Please try again later.',
            })
        })

        it('truncates userId to 36 characters', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            const longUserIdRequest = {
                ...validRequest,
                userId: 'user_12345678901234567890123456789012345',
            }

            const mockResponse = {
                success: true,
                code: 'SUCCESS',
                message: 'Payment initiated',
                data: {
                    merchantId: 'MERCHANT123',
                    merchantTransactionId: 'TRK1234567890abc',
                },
            }

            invokeMock.mockResolvedValue({ data: mockResponse, error: null })

            await initiatePhonePePayment(longUserIdRequest)

            expect(invokeMock).toHaveBeenCalledWith('phonepe-checkout', expect.objectContaining({
                body: expect.objectContaining({
                    userId: 'user_12345678901234567890123456789012345'.substring(0, 36),
                }),
            }))
        })
    })

    describe('checkPaymentStatus', () => {
        beforeEach(() => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')
        })

        it('returns SUCCESS status for successful payment', async () => {
            invokeMock.mockResolvedValue({
                data: { status: 'SUCCESS', success: true },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result).toEqual({
                success: true,
                status: 'SUCCESS',
                message: '',
                data: undefined,
            })
        })

        it('normalizes PAYMENT_SUCCESS code to SUCCESS', async () => {
            invokeMock.mockResolvedValue({
                data: { code: 'PAYMENT_SUCCESS', success: true },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result.status).toBe('SUCCESS')
            expect(result.success).toBe(true)
        })

        it('returns FAILED status for failed payment', async () => {
            invokeMock.mockResolvedValue({
                data: { status: 'FAILED', success: false },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result.status).toBe('FAILED')
            expect(result.success).toBe(false)
        })

        it('normalizes PAYMENT_FAILED code to FAILED', async () => {
            invokeMock.mockResolvedValue({
                data: { code: 'PAYMENT_FAILED', success: false },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result.status).toBe('FAILED')
        })

        it('normalizes PAYMENT_DECLINED code to FAILED', async () => {
            invokeMock.mockResolvedValue({
                data: { code: 'PAYMENT_DECLINED', success: false },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result.status).toBe('FAILED')
        })

        it('returns PENDING status for pending payment', async () => {
            invokeMock.mockResolvedValue({
                data: { status: 'PENDING', success: false },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result.status).toBe('PENDING')
            expect(result.success).toBe(false)
        })

        it('defaults to PENDING for unknown status', async () => {
            invokeMock.mockResolvedValue({
                data: { status: 'UNKNOWN', success: false },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result.status).toBe('PENDING')
        })

        it('handles errors gracefully', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Network error' },
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result).toEqual({
                success: false,
                status: 'PENDING',
                message: 'Unable to check payment status',
            })
        })

        it('includes message from response when available', async () => {
            invokeMock.mockResolvedValue({
                data: {
                    status: 'SUCCESS',
                    success: true,
                    message: 'Payment completed successfully'
                },
                error: null,
            })

            const result = await checkPaymentStatus('TRK1234567890abc')

            expect(result.message).toBe('Payment completed successfully')
        })
    })

    describe('verifyAndActivateSubscription', () => {
        it('calls verify-payment edge function', async () => {
            invokeMock.mockResolvedValue({ data: null, error: null })

            const result = await verifyAndActivateSubscription('TRK1234567890abc', 'user_123')

            expect(result).toEqual({
                success: true,
                message: 'Subscription activated successfully!',
            })
            expect(invokeMock).toHaveBeenCalledWith('verify-payment', expect.objectContaining({
                body: {
                    razorpay_order_id: 'TRK1234567890abc',
                    user_id: 'user_123',
                    payment_provider: 'phonepe',
                },
            }))
        })

        it('handles activation errors', async () => {
            invokeMock.mockResolvedValue({
                data: null,
                error: { message: 'Activation failed' },
            })

            const result = await verifyAndActivateSubscription('TRK1234567890abc', 'user_123')

            expect(result).toEqual({
                success: false,
                message: 'Payment successful but subscription activation failed. Please contact support.',
            })
        })
    })

    describe('getPaymentConfig', () => {
        it('returns configured state when all env vars are set', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            const config = await getPaymentConfig()

            expect(config.merchantId).toBe('MERCHANT123')
            expect(config.isConfigured).toBe(true)
            expect(config.isTestMode).toBe(false)
            expect(config.isLaunchReady).toBe(true)
            expect(config.launchBlocker).toBeNull()
        })

        it('detects test mode from sandbox URL', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api-preprod.phonepe.com/apis/pg-sandbox')

            const config = await getPaymentConfig()

            expect(config.isTestMode).toBe(true)
            expect(config.isLaunchReady).toBe(false)
            expect(config.launchBlocker).toBe('PhonePe is still using sandbox/preprod')
        })

        it('detects test mode from preprod URL', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api-preprod.phonepe.com/apis/pg-sandbox')

            const config = await getPaymentConfig()

            expect(config.isTestMode).toBe(true)
        })

        it('returns not configured when merchant ID is missing', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', '')
            vi.stubEnv('VITE_PHONEPE_API_URL', 'https://api.phonepe.com/apis/hermes')

            const config = await getPaymentConfig()

            expect(config.isConfigured).toBe(false)
            expect(config.launchBlocker).toBe('Missing VITE_PHONEPE_MERCHANT_ID')
        })

        it('returns not configured when API URL is missing', async () => {
            vi.stubEnv('VITE_PHONEPE_MERCHANT_ID', 'MERCHANT123')
            vi.stubEnv('VITE_PHONEPE_API_URL', '')

            const config = await getPaymentConfig()

            expect(config.isConfigured).toBe(false)
            expect(config.launchBlocker).toBe('Missing VITE_PHONEPE_API_URL')
        })
    })
})
