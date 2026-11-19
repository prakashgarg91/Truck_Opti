import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Accessibility pins for the plan checkout form: labelled fields, a named feature list, a status
// region for test mode, and a 44px primary action with a focus ring. No payment logic is covered
// here; the Razorpay and API layers are mocked.

const h = vi.hoisted(() => ({
    getByTier: vi.fn(),
    createOrder: vi.fn(),
    gst: { status: 'ready', registered: true } as { status: 'loading' | 'ready' | 'error'; registered: boolean | null },
}))

// Registered is the default; the GST branch tests below switch the state.
vi.mock('../hooks/useSellerGstRegistered', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../hooks/useSellerGstRegistered')>()),
    useSellerGstRegistered: () => h.gst,
}))

vi.mock('../services/razorpayPayment', () => ({
    getRazorpayConfig: () => ({ keyId: 'rzp_test_example', isCheckoutEnabled: true, isTestMode: true }),
}))

vi.mock('../services/subscriptionApi', () => ({
    subscriptionPlansApi: { getByTier: h.getByTier },
    checkoutApi: { createOrder: h.createOrder, verifyPayment: vi.fn() },
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

/** Fills a valid mobile number and presses Continue, so the order is created and the server quote is read. */
async function payWithValidPhone() {
    const phone = container.querySelector('#checkout-phone') as HTMLInputElement
    await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
        setValue.call(phone, '9876543210')
        phone.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const pay = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Continue to payment')!
    await act(async () => {
        pay.click()
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('CheckoutPage accessibility', () => {
    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        h.getByTier.mockResolvedValue(PLAN)
        h.gst = { status: 'ready', registered: true }
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

describe('CheckoutPage tax copy follows the seller GST flag and the server quote', () => {
    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        h.getByTier.mockResolvedValue(PLAN)
        h.gst = { status: 'ready', registered: true }
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('registered: keeps the GST copy and the excl. GST label', async () => {
        h.gst = { status: 'ready', registered: true }
        await render()
        expect(container.textContent).toContain('GST extra at 18%')
        expect(container.textContent).toContain('excl. GST')
        expect(container.textContent).toContain('including GST and any coupon')
        expect(container.textContent).not.toContain('No GST charged')
    })

    it('unregistered: says No GST charged and never shows the 18% copy', async () => {
        h.gst = { status: 'ready', registered: false }
        await render()
        expect(container.textContent).toContain('No GST charged')
        expect(container.textContent).not.toMatch(/GST extra|18%|excl\. GST|including GST/)
    })

    it('loading: shows the price before tax and says taxes are shown at checkout', async () => {
        h.gst = { status: 'loading', registered: null }
        await render()
        expect(container.textContent).toContain('Before tax')
        expect(container.textContent).toContain('Taxes, if any, are shown at checkout')
        expect(container.textContent).not.toMatch(/GST extra|18%|No GST charged/)
    })

    it('error: shows the price before tax and says taxes are shown at checkout', async () => {
        h.gst = { status: 'error', registered: null }
        await render()
        expect(container.textContent).toContain('Taxes, if any, are shown at checkout')
        expect(container.textContent).not.toMatch(/GST extra|18%|No GST charged/)
    })

    it('server registered wins over a platform flag that says unregistered', async () => {
        h.gst = { status: 'ready', registered: false }
        h.createOrder.mockResolvedValue({ id: 'order_2', amount: 49900, currency: 'INR', gst_registered: true, gst_rate_pct: 18 })
        await render()
        expect(container.textContent).toContain('No GST charged')
        await payWithValidPhone()
        expect(h.createOrder).toHaveBeenCalledTimes(1)
        expect(container.textContent).toContain('GST extra at 18%')
        expect(container.textContent).toContain('excl. GST')
        expect(container.textContent).not.toContain('No GST charged')
    })

    it('the server quote overrides the platform flag once the order is created', async () => {
        h.gst = { status: 'ready', registered: true }
        h.createOrder.mockResolvedValue({ id: 'order_1', amount: 49900, currency: 'INR', gst_registered: false, gst_rate_pct: 0 })
        await render()
        expect(container.textContent).toContain('GST extra at 18%')
        const phone = container.querySelector('#checkout-phone') as HTMLInputElement
        await act(async () => {
            const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
            setValue.call(phone, '9876543210')
            phone.dispatchEvent(new Event('input', { bubbles: true }))
        })
        const pay = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Continue to payment')!
        await act(async () => {
            pay.click()
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(h.createOrder).toHaveBeenCalledTimes(1)
        expect(container.textContent).toContain('No GST charged')
        expect(container.textContent).not.toContain('GST extra at 18%')
    })
})
