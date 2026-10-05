import { beforeEach, describe, expect, it, vi } from 'vitest'

const sentry = vi.hoisted(() => ({
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}))

vi.mock('@sentry/react', () => ({
    init: sentry.init,
    captureException: sentry.captureException,
    captureMessage: sentry.captureMessage,
}))

import {
    STAGING_PROBE_MESSAGE,
    isSensitiveKey,
    sanitizeBreadcrumb,
    sanitizeErrorEvent,
    sanitizeText,
    sanitizeValue,
} from './monitoring'

type MonitoringModule = typeof import('./monitoring')

async function freshMonitoring(): Promise<MonitoringModule> {
    vi.resetModules()
    return import('./monitoring')
}

beforeEach(() => {
    sentry.captureException.mockReturnValue('sent-event-id')
    sentry.captureMessage.mockReturnValue('sent-message-id')
})

describe('bounded redaction', () => {
    it('redacts nested secrets while preserving safe structure', () => {
        const sanitized = JSON.stringify(
            sanitizeValue({
                orderId: 'order-42',
                user: {
                    password: 'hunter2',
                    profile: {
                        aadhaarNumber: '2345 6789 0123',
                        email: 'rider@example.invalid',
                        phone: '9876543210',
                    },
                },
                nested: {
                    deep: {
                        deeper: {
                            deepest: {
                                token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature123',
                            },
                        },
                    },
                },
                error_code: 'E_FAIL',
                company_name: 'TruckOpti',
            }),
        )

        expect(sanitized).toContain('"orderId":"order-42"')
        expect(sanitized).toContain('"error_code":"E_FAIL"')
        expect(sanitized).toContain('"company_name":"TruckOpti"')
        expect(sanitized).not.toContain('hunter2')
        expect(sanitized).not.toContain('2345 6789 0123')
        expect(sanitized).not.toContain('rider@example.invalid')
        expect(sanitized).not.toContain('9876543210')
        expect(sanitized).not.toContain('eyJ')
        expect(sanitized).toContain('[REDACTED]')
    })

    it('scrubs secrets from exception messages and stacks', () => {
        const error = new Error('login failed password=hunter2 bearer eyJhbGciOiJIUzI1NiJ9.eyJ1IjoiYSJ9.abc12345')
        const sanitized = sanitizeValue(error) as { name: string; message: string; stack?: string }

        expect(sanitized.name).toBe('Error')
        expect(sanitized.message).not.toContain('hunter2')
        expect(sanitized.message).not.toContain('eyJ')
        expect(sanitized.message).toContain('password=[REDACTED]')
    })

    it('redacts request headers and cookies but keeps safe headers', () => {
        const sanitized = JSON.stringify(
            sanitizeValue({
                request: {
                    headers: {
                        authorization: 'Bearer abcdef123456',
                        cookie: 'session=abc123',
                        'x-api-key': 'AIzaSyA1234567890123456789012345678901',
                        'content-type': 'application/json',
                    },
                },
            }),
        )

        expect(sanitized).not.toContain('abcdef123456')
        expect(sanitized).not.toContain('session=abc123')
        expect(sanitized).not.toContain('AIza')
        expect(sanitized).toContain('application/json')
    })

    it('drops ui.input breadcrumbs and scrubs console breadcrumbs', () => {
        expect(sanitizeBreadcrumb({ category: 'ui.input', message: 'typed hunter2' })).toBeNull()

        const crumb = sanitizeBreadcrumb({
            category: 'console',
            level: 'error',
            message: 'payment failed for rider@example.invalid token=abc123',
        }) as { message: string }

        expect(crumb.message).not.toContain('abc123')
        expect(crumb.message).not.toContain('rider@example.invalid')
        expect(crumb.message).toContain('[REDACTED')
    })

    it('redacts URL credentials and query secrets while keeping safe parameters', () => {
        const text = sanitizeText('GET https://admin:hunter2@api.example.com/callback?token=abc123&order=42')

        expect(text).not.toContain('hunter2')
        expect(text).not.toContain('abc123')
        expect(text).toContain('[REDACTED]@api.example.com')
        expect(text).toContain('order=42')
    })

    it('redacts payment details and KYC identifiers by shape', () => {
        const text = sanitizeText(
            'card 4111 1111 1111 1111 pan ABCDE1234F aadhaar 2345 6789 0123 phone 9876543210',
        )

        expect(text).toContain('[REDACTED_CARD]')
        expect(text).toContain('[REDACTED_PAN]')
        expect(text).toContain('[REDACTED_AADHAAR]')
        expect(text).toContain('[REDACTED_PHONE]')
    })

    it('keeps a 16-digit reference that is not a valid card number', () => {
        expect(sanitizeText('reference 1234 5678 9012 3456')).toContain('1234 5678 9012 3456')
    })

    it('bounds depth, array length and cycles', () => {
        const cyclic: Record<string, unknown> = { name: 'root' }
        cyclic.self = cyclic

        expect(JSON.stringify(sanitizeValue(cyclic))).toContain('[CIRCULAR]')
        expect(JSON.stringify(sanitizeValue({ a: { b: { c: { d: { e: { f: { g: 'too deep' } } } } } } }))).toContain(
            '[TRUNCATED_DEPTH]',
        )
        expect(JSON.stringify(sanitizeValue(Array.from({ length: 30 }, (_, i) => i)))).toContain('[TRUNCATED_10_ITEMS]')
    })

    it('classifies sensitive keys without over-redacting lookalikes', () => {
        expect(isSensitiveKey('password')).toBe(true)
        expect(isSensitiveKey('aadhaarNumber')).toBe(true)
        expect(isSensitiveKey('apiKey')).toBe(true)
        expect(isSensitiveKey('documentUrl')).toBe(true)
        expect(isSensitiveKey('error_code')).toBe(false)
        expect(isSensitiveKey('company_name')).toBe(false)
        expect(isSensitiveKey('orderId')).toBe(false)
    })

    it('applies the beforeSend policy to full events', () => {
        const event = sanitizeErrorEvent({
            event_id: 'event-1',
            exception: { values: [{ type: 'Error', value: 'failed token=abc123 for rider@example.invalid' }] },
            request: {
                url: 'https://app.example/callback?token=abc123&ok=1',
                headers: { authorization: 'Bearer abcdef123456' },
                cookies: { 'sb-auth-token': 'cookie-value', theme: 'dark' },
            },
            user: { id: 'user-1', email: 'person@example.invalid', ip_address: '1.2.3.4' },
            extra: { card: '4111 1111 1111 1111' },
        } as unknown as Parameters<typeof sanitizeErrorEvent>[0]) as unknown as {
            exception: { values: Array<{ value: string }> }
            request: { url: string; headers: Record<string, string>; cookies: string }
            user?: { id?: string; email?: string; ip_address?: string }
            extra: Record<string, unknown>
        }

        expect(event.exception.values[0].value).not.toContain('abc123')
        expect(event.exception.values[0].value).not.toContain('rider@example.invalid')
        expect(event.request.url).not.toContain('abc123')
        expect(event.request.url).toContain('ok=1')
        expect(event.request.headers.authorization).toBe('[REDACTED]')
        expect(event.request.cookies).toBe('[REDACTED]')
        expect(event.user).toEqual({ id: 'user-1' })
        expect(event.extra.card).toBe('[REDACTED]')
    })
})

describe('Sentry absent mode', () => {
    it('initializes nothing and makes every reporting call a safe no-op', async () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
        const monitoring = await freshMonitoring()

        expect(monitoring.initMonitoring({ dsn: '' })).toBe(false)
        expect(monitoring.isMonitoringEnabled()).toBe(false)
        expect(sentry.init).not.toHaveBeenCalled()

        expect(monitoring.reportError(new Error('nothing is sent'))).toBeUndefined()
        expect(monitoring.reportLoggedError(['failure', new Error('nothing is sent')])).toBeUndefined()
        expect(monitoring.sendStagingMonitoringProbe()).toBeUndefined()
        expect(sentry.captureException).not.toHaveBeenCalled()
        expect(sentry.captureMessage).not.toHaveBeenCalled()

        // No global handlers are installed while absent.
        const globalHandlerRegistrations = addEventListenerSpy.mock.calls.filter(
            ([type]) => type === 'error' || type === 'unhandledrejection',
        )
        expect(globalHandlerRegistrations).toHaveLength(0)

        addEventListenerSpy.mockRestore()
    })

    it('stays disabled when Sentry init throws', async () => {
        const monitoring = await freshMonitoring()
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        sentry.init.mockImplementationOnce(() => {
            throw new Error('invalid dsn')
        })

        expect(monitoring.initMonitoring({ dsn: 'https://public@example.invalid/1' })).toBe(false)
        expect(monitoring.isMonitoringEnabled()).toBe(false)
        expect(monitoring.reportError(new Error('x'))).toBeUndefined()

        consoleError.mockRestore()
    })
})

describe('sanitized reporting with a configured DSN', () => {
    it('initializes with the sanitizer policy and reports caught failures', async () => {
        const monitoring = await freshMonitoring()

        expect(
            monitoring.initMonitoring({ dsn: 'https://public@example.invalid/1', environment: 'staging', release: 'web@1.2.3' }),
        ).toBe(true)
        expect(sentry.init).toHaveBeenCalledTimes(1)

        const options = sentry.init.mock.calls[0][0]
        expect(options).toMatchObject({
            dsn: 'https://public@example.invalid/1',
            environment: 'staging',
            release: 'web@1.2.3',
            sendDefaultPii: false,
            replaysSessionSampleRate: 0,
            replaysOnErrorSampleRate: 0,
        })
        expect(typeof options.beforeSend).toBe('function')
        expect(typeof options.beforeBreadcrumb).toBe('function')

        const defaults = [{ name: 'GlobalHandlers' }, { name: 'Breadcrumbs' }]
        expect(options.integrations(defaults).map((integration: { name: string }) => integration.name)).toEqual([
            'Breadcrumbs',
        ])

        // Idempotent: a second init never re-registers the SDK.
        expect(monitoring.initMonitoring({ dsn: 'https://other@example.invalid/2' })).toBe(true)
        expect(sentry.init).toHaveBeenCalledTimes(1)

        expect(monitoring.reportError(new Error('caught failure'), { orderId: 'o-1', password: 'hunter2' })).toBe(
            'sent-event-id',
        )
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        const [reported, context] = sentry.captureException.mock.calls[0]
        expect(reported).toBeInstanceOf(Error)
        expect(context).toEqual({ extra: { orderId: 'o-1', password: '[REDACTED]' } })
    })

    it('captures uncaught errors and unhandled rejections through the owned handlers', async () => {
        const addEventListenerSpy = vi.spyOn(window, 'addEventListener')
        const monitoring = await freshMonitoring()
        expect(monitoring.initMonitoring({ dsn: 'https://public@example.invalid/1' })).toBe(true)

        const findListener = (type: string) =>
            addEventListenerSpy.mock.calls.find(([registeredType]) => registeredType === type)?.[1] as
                | ((event: Event) => void)
                | undefined

        const errorListener = findListener('error')
        const rejectionListener = findListener('unhandledrejection')
        expect(typeof errorListener).toBe('function')
        expect(typeof rejectionListener).toBe('function')

        errorListener?.(new ErrorEvent('error', { error: new Error('uncaught boom'), message: 'uncaught boom' }))
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        expect((sentry.captureException.mock.calls[0][0] as Error).message).toBe('uncaught boom')

        const rejection = new Event('unhandledrejection') as Event & { reason?: unknown }
        rejection.reason = new Error('promise boom')
        rejectionListener?.(rejection)
        expect(sentry.captureException).toHaveBeenCalledTimes(2)
        expect((sentry.captureException.mock.calls[1][0] as Error).message).toBe('promise boom')

        const nonErrorRejection = new Event('unhandledrejection') as Event & { reason?: unknown }
        nonErrorRejection.reason = { code: 'E_FAIL' }
        rejectionListener?.(nonErrorRejection)
        expect(sentry.captureException).toHaveBeenCalledTimes(3)
        expect((sentry.captureException.mock.calls[2][0] as Error).message).toContain('E_FAIL')

        // Resource-load errors dispatch a plain Event without error data and are ignored.
        errorListener?.(new Event('error'))
        expect(sentry.captureException).toHaveBeenCalledTimes(3)

        addEventListenerSpy.mockRestore()
    })

    it('routes logger.error calls through the funnel', async () => {
        const monitoring = await freshMonitoring()
        expect(monitoring.initMonitoring({ dsn: 'https://public@example.invalid/1' })).toBe(true)

        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { logger } = await import('./logger')

        logger.error('[portal-api] save failed', new Error('boom'))
        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        const [errorArg, context] = sentry.captureException.mock.calls[0]
        expect((errorArg as Error).message).toBe('boom')
        expect(context).toEqual({ extra: { loggedArguments: ['[portal-api] save failed'] } })

        logger.error('message-only failure token=abc123')
        expect(sentry.captureMessage).toHaveBeenCalledWith('message-only failure token=[REDACTED]', {
            level: 'error',
        })

        consoleError.mockRestore()
    })

    it('sends the controlled staging probe with obviously fake secrets redacted', async () => {
        const monitoring = await freshMonitoring()
        expect(monitoring.initMonitoring({ dsn: 'https://public@example.invalid/1' })).toBe(true)

        expect(monitoring.sendStagingMonitoringProbe()).toBe('sent-event-id')

        expect(sentry.captureException).toHaveBeenCalledTimes(1)
        const [probeError, context] = sentry.captureException.mock.calls[0]
        expect((probeError as Error).name).toBe('MonitoringStagingProbe')
        expect((probeError as Error).message).toBe(STAGING_PROBE_MESSAGE)

        const extra = context.extra as { probe: string; redactionSelfTest: Record<string, string> }
        expect(extra.probe).toBe('staging')

        // Content-shape redaction (free text inside an innocuous key).
        expect(extra.redactionSelfTest.note).toContain('[REDACTED_CARD]')
        expect(extra.redactionSelfTest.note).toContain('[REDACTED_AADHAAR]')
        expect(extra.redactionSelfTest.note).toContain('[REDACTED_EMAIL]')
        expect(extra.redactionSelfTest.note).not.toContain('4111')
        expect(extra.redactionSelfTest.note).not.toContain('eyJ')

        // Key-name redaction.
        expect(extra.redactionSelfTest.password).toBe('[REDACTED]')
        expect(extra.redactionSelfTest.otp).toBe('[REDACTED]')
        expect(extra.redactionSelfTest.authorization).toBe('[REDACTED]')
        expect(extra.redactionSelfTest.aadhaarNumber).toBe('[REDACTED]')
        expect(extra.redactionSelfTest.cardNumber).toBe('[REDACTED]')
        expect(extra.redactionSelfTest.email).toBe('[REDACTED]')

        expect(extra.redactionSelfTest.queryString).toBe('?token=[REDACTED]&order=1')
    })
})
