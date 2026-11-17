import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AgencyBillingBanner from './AgencyBillingBanner'
import { BillingGateContext, deriveBillingGate, WRITE_LOCKED_TITLE, DISPATCH_LOCKED_TITLE } from './BillingGate'
import { gateFor } from './testGate'
import { deriveBillingView, parseEntitlement } from '../../lib/billingState'
import { SubscriptionLimitError, subscriptionInfoFromError, throwIfSubscriptionError } from '../../lib/subscriptionGuard'

const ent = (over: Record<string, unknown> = {}) =>
    parseEntitlement({
        ok: true, agency_id: 'a', status: 'active', plan_tier: 'starter', can_write: true, can_dispatch: true, ...over,
    })

function bannerHtml(value: ReturnType<typeof deriveBillingGate>) {
    return renderToStaticMarkup(
        createElement(MemoryRouter, null, createElement(BillingGateContext.Provider, { value }, createElement(AgencyBillingBanner)))
    )
}

describe('deriveBillingGate', () => {
    it('fails open while loading, on RPC error (undefined entitlement) and for status none', () => {
        for (const g of [deriveBillingGate(undefined, null, true), deriveBillingGate(undefined, null, false), gateFor('none')]) {
            expect(g.canWrite).toBe(true)
            expect(g.canDispatch).toBe(true)
            expect(g.writeTitle).toBeUndefined()
        }
    })

    it('does not block an active or trial agency', () => {
        expect(gateFor('active').canWrite).toBe(true)
        const trial = ent({ status: 'trial' })
        expect(deriveBillingGate(trial, deriveBillingView(trial), false).canWrite).toBe(true)
    })

    it('stays open for grace, expired and cancelled while the server reports enforcement off', () => {
        for (const status of ['grace', 'expired', 'cancelled']) {
            const off = ent({ status, can_write: false, can_dispatch: false, enforcement_enabled: false })
            const gate = deriveBillingGate(off, deriveBillingView(off), false)
            expect(gate.canWrite).toBe(true)
            expect(gate.canDispatch).toBe(true)
            expect(gate.writeTitle).toBeUndefined()
            expect(gate.dispatchTitle).toBeUndefined()
        }
    })

    it('locks grace and expired when the server reports enforcement on, or does not report it', () => {
        for (const flag of [{ enforcement_enabled: true }, {}]) {
            const grace = ent({ status: 'grace', can_write: false, can_dispatch: true, ...flag })
            expect(deriveBillingGate(grace, deriveBillingView(grace), false).canWrite).toBe(false)
            const expired = ent({ status: 'expired', can_write: false, can_dispatch: false, ...flag })
            expect(deriveBillingGate(expired, deriveBillingView(expired), false).canDispatch).toBe(false)
        }
    })

    it('grace blocks create but not dispatch; expired blocks both', () => {
        const grace = gateFor('grace')
        expect(grace.canWrite).toBe(false)
        expect(grace.canDispatch).toBe(true)
        expect(grace.writeTitle).toBe(WRITE_LOCKED_TITLE)
        const expired = gateFor('expired')
        expect(expired.canWrite).toBe(false)
        expect(expired.canDispatch).toBe(false)
        expect(expired.dispatchTitle).toBe(DISPATCH_LOCKED_TITLE)
    })
})

describe('AgencyBillingBanner', () => {
    it('renders nothing while loading (no flash) and when there is no entitlement', () => {
        expect(bannerHtml(deriveBillingGate(undefined, null, true))).toBe('')
        expect(bannerHtml(deriveBillingGate(undefined, null, false))).toBe('')
    })

    it('renders nothing for status none and active', () => {
        expect(bannerHtml(gateFor('none'))).toBe('')
        expect(bannerHtml(gateFor('active'))).toBe('')
    })

    it('shows the grace and expired banners', () => {
        expect(bannerHtml(gateFor('grace'))).toContain('Read-only grace period')
        expect(bannerHtml(gateFor('expired'))).toContain('has expired')
    })

    it('shows trial days left and past_due', () => {
        const trial = ent({ status: 'trial', trial_end: new Date(Date.now() + 5 * 86_400_000).toISOString() })
        const html = bannerHtml(deriveBillingGate(trial, deriveBillingView(trial), false))
        expect(html).toMatch(/Free trial: \d+ days? left/)
        const due = ent({ status: 'past_due' })
        expect(bannerHtml(deriveBillingGate(due, deriveBillingView(due), false))).toContain('Pay now')
    })
})

describe('subscriptionGuard', () => {
    const raw = { code: 'SB001', message: 'SB001 SUBSCRIPTION_LIMIT_REACHED', details: '{"resource":"driver_add","limit":3,"used":3}' }

    it('throwIfSubscriptionError throws only for SB errors', () => {
        expect(() => throwIfSubscriptionError(raw)).toThrow(SubscriptionLimitError)
        expect(() => throwIfSubscriptionError({ message: 'boom' })).not.toThrow()
        expect(() => throwIfSubscriptionError(null)).not.toThrow()
    })

    it('subscriptionInfoFromError accepts a wrapped or a raw error', () => {
        expect(subscriptionInfoFromError(raw)?.code).toBe('SB001')
        expect(subscriptionInfoFromError(new Error('nope'))).toBeNull()
        try {
            throwIfSubscriptionError(raw)
        } catch (e) {
            expect(subscriptionInfoFromError(e)?.message).toContain('drivers')
        }
    })
})
