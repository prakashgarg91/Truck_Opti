import { beforeEach, describe, expect, it } from 'vitest'
import {
    buildAuthReturnTo,
    consumeAuthReturnTo,
    isSafeAuthReturnTo,
    storeAuthReturnTo,
} from './authReturnTo'

describe('authReturnTo', () => {
    beforeEach(() => {
        window.sessionStorage.clear()
    })

    describe('isSafeAuthReturnTo', () => {
        it('accepts plain internal routes', () => {
            expect(isSafeAuthReturnTo('/')).toBe(true)
            expect(isSafeAuthReturnTo('/pricing')).toBe(true)
            expect(isSafeAuthReturnTo('/agency/jobs?status=active')).toBe(true)
        })

        it('rejects protocol-relative and external URLs', () => {
            expect(isSafeAuthReturnTo('//evil.com')).toBe(false)
            expect(isSafeAuthReturnTo('https://evil.com')).toBe(false)
            expect(isSafeAuthReturnTo('javascript:alert(1)')).toBe(false)
        })

        it('rejects backslash open-redirect bypasses', () => {
            expect(isSafeAuthReturnTo('/\\evil.com')).toBe(false)
            expect(isSafeAuthReturnTo('\\evil.com')).toBe(false)
            expect(isSafeAuthReturnTo('/pricing\\\n')).toBe(false)
        })

        it('rejects whitespace and control characters', () => {
            expect(isSafeAuthReturnTo('/pricing foo')).toBe(false)
            expect(isSafeAuthReturnTo('/pricing\t')).toBe(false)
        })

        it('rejects auth-flow routes that would loop', () => {
            expect(isSafeAuthReturnTo('/login')).toBe(false)
            expect(isSafeAuthReturnTo('/otp')).toBe(false)
            expect(isSafeAuthReturnTo('/auth/callback')).toBe(false)
        })

        it('rejects missing values', () => {
            expect(isSafeAuthReturnTo(null)).toBe(false)
            expect(isSafeAuthReturnTo(undefined)).toBe(false)
            expect(isSafeAuthReturnTo('')).toBe(false)
        })
    })

    describe('store/consume round trip', () => {
        it('stores and consumes a safe path once', () => {
            storeAuthReturnTo('/pricing')
            expect(consumeAuthReturnTo()).toBe('/pricing')
            expect(consumeAuthReturnTo()).toBeNull()
        })

        it('refuses to store an unsafe path', () => {
            storeAuthReturnTo('/\\evil.com')
            expect(consumeAuthReturnTo()).toBeNull()
        })

        it('re-validates values planted directly in storage', () => {
            window.sessionStorage.setItem('truckopti-auth-return-to', '//evil.com')
            expect(consumeAuthReturnTo()).toBeNull()
        })
    })

    describe('buildAuthReturnTo', () => {
        it('builds a safe path from route state', () => {
            expect(buildAuthReturnTo({ from: { pathname: '/pricing', search: '?plan=x' } })).toBe('/pricing?plan=x')
        })

        it('returns null for unsafe route state', () => {
            expect(buildAuthReturnTo({ from: { pathname: '/\\evil.com' } })).toBeNull()
            expect(buildAuthReturnTo(null)).toBeNull()
        })
    })
})
