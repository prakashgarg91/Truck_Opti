import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Accessibility pins for the plan checkout form: labelled fields, a named feature list, a status
// region for test mode, and a 44px primary action with a focus ring. No payment logic is covered
// here; the Razorpay and API layers are mocked.

const h = vi.hoisted(() => ({
    getByTier: vi.fn(),
}))

vi.mock('../services/razorpayPayment', () => ({
    getRazorpayConfig: () => ({ keyId: 'rzp_test_example', isCheckoutEnabled: true, isTestMode: true }),
}))

vi.mock('../services/subscriptionApi', () => ({
    subscriptionPlansApi: { getByTier: h.getByTier },
    checkoutApi: { createOrder: vi.fn(), verifyPayment: vi.fn() },
    entitlementApi: { get: vi.fn() },
}))

vi.mock('../components/billing/useEntitlement', () => ({
    useEntitlement: () => ({ entitlement: undefined, refetch: vi.fn() }),
}))

vi.mock('../components/billing/razorpayCheckout', () => ({
    openRazorpayCheckout: vi.fn(),
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'u1', email: 'owner@example.com', name: 'Owner', role: 'agency' } }),
}))

import CheckoutPage from './CheckoutPage'

const PLAN = {
    tier: 'starter',
    name: 'Starter',
    price_monthly: 49900,
    price_yearly: 499000,
    features: ['max_trucks', 'gps_tracking'],
}

let container: HTMLDivElement
let root: Root

async function render() {
    await act(async () => {
        root.render(createElement(MemoryRouter, { initialEntries: ['/checkout?plan=starter'] }, createElement(CheckoutPage)))
    })
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('CheckoutPage accessibility', () => {
    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        h.getByTier.mockResolvedValue(PLAN)
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('labels every payment field and links the hints to their inputs', async () => {
        await render()
        const phone = container.querySelector('#checkout-phone') as HTMLInputElement
        expect(container.querySelector('label[for="checkout-phone"]')?.textContent).toContain('Mobile number')
        expect(phone.getAttribute('inputmode')).toBe('numeric')
        expect(phone.getAttribute('aria-describedby')).toBe('checkout-phone-help')
        expect(document.getElementById('checkout-phone-help')).not.toBeNull()
        expect(container.querySelector('label[for="checkout-email"]')?.textContent).toContain('Email address')
        expect(container.querySelector('label[for="checkout-coupon"]')?.textContent).toContain('Coupon code')
        expect((container.querySelector('#checkout-coupon') as HTMLInputElement).getAttribute('aria-describedby')).toBe('checkout-coupon-help')
    })

    it('names the included-features list and announces test mode in a status region', async () => {
        await render()
        expect(container.querySelector('ul[aria-label="Included features"]')?.querySelectorAll('li').length).toBe(2)
        expect(container.querySelector('[role="status"]')?.textContent).toContain('Test mode is active')
    })

    it('gives the primary payment action a 44px target and a focus ring', async () => {
        await render()
        const pay = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Continue to payment')!
        expect(pay.className).toContain('min-h-[44px]')
        expect(pay.className).toContain('focus-visible:ring-2')
        expect(pay.disabled).toBe(true)
    })
})
