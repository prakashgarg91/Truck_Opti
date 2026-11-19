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
    verifyPayment: vi.fn(),
    openRazorpay: vi.fn(),
    pollForActivation: vi.fn(),
    gst: { status: 'ready', registered: true } as { status: 'loading' | 'ready' | 'error'; registered: boolean | null },
}))

// The outcome tests control the poll result; every other export keeps its real behaviour.
vi.mock('../lib/billingState', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../lib/billingState')>()),
    pollForActivation: h.pollForActivation,
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
    checkoutApi: { createOrder: h.createOrder, verifyPayment: h.verifyPayment },
    entitlementApi: { get: vi.fn() },
}))

vi.mock('../components/billing/useEntitlement', () => ({
    useEntitlement: () => ({ entitlement: undefined, refetch: vi.fn() }),
}))

vi.mock('../components/billing/razorpayCheckout', () => ({
    openRazorpayCheckout: h.openRazorpay,
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'u1', email: 'owner@example.com', name: 'Owner', role: 'agency' } }),
}))

import CheckoutPage from './CheckoutPage'
import { SUPPORT_EMAIL } from '../config/support'

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

describe('CheckoutPage outcome after the Razorpay popup', () => {
    const PAID = {
        kind: 'paid',
        payload: { razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_ABC123', razorpay_signature: 'sig_1' },
    }
    const SERVER_SUPPORT_MESSAGE = 'We received your payment but could not apply it automatically. Please contact support and we will fix it.'

    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        h.getByTier.mockResolvedValue(PLAN)
        h.gst = { status: 'ready', registered: true }
        h.createOrder.mockResolvedValue({ id: 'order_1', amount: 49900, currency: 'INR' })
        h.openRazorpay.mockResolvedValue(PAID)
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('verify answers state support with a message: shows that message, the support mailto and the payment reference', async () => {
        h.verifyPayment.mockResolvedValue({ kind: 'support', message: SERVER_SUPPORT_MESSAGE })
        await render()
        await payWithValidPhone()

        expect(h.verifyPayment).toHaveBeenCalledWith(PAID.payload)
        const status = container.querySelector('[role="status"]')
        expect(status).not.toBeNull()
        expect(status?.querySelector('h1')?.textContent).toBe('We received your payment')
        expect(container.textContent).toContain(SERVER_SUPPORT_MESSAGE)
        expect(container.textContent).toContain('You do not need to pay again.')
        expect(container.textContent).toContain('Quote this payment reference: pay_ABC123')
        const mailto = container.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`)
        expect(mailto?.textContent).toBe(SUPPORT_EMAIL)
        expect(container.querySelector('a[href="/subscription"]')?.textContent).toContain('Back to subscription')
    })

    it('support never promises an email or activation and never shows the waiting screen', async () => {
        h.verifyPayment.mockResolvedValue({ kind: 'support', message: SERVER_SUPPORT_MESSAGE })
        await render()
        await payWithValidPhone()

        expect(container.textContent).not.toContain('taking longer than usual')
        expect(container.textContent).not.toContain('We will email you')
        expect(container.textContent).not.toContain('We have your payment')
        expect(h.pollForActivation).not.toHaveBeenCalled()
    })

    it('support without a message: shows the fallback text', async () => {
        h.verifyPayment.mockResolvedValue({ kind: 'support', message: null })
        await render()
        await payWithValidPhone()

        expect(container.textContent).toContain('We could not apply it automatically. Please contact support and we will fix it.')
        expect(container.textContent).toContain('Quote this payment reference: pay_ABC123')
        expect(container.textContent).not.toContain('taking longer than usual')
    })

    it('pending: verify unconfirmed and activation timing out keeps the waiting screen unchanged', async () => {
        h.verifyPayment.mockResolvedValue({ kind: 'unconfirmed' })
        h.pollForActivation.mockResolvedValue('timeout')
        await render()
        await payWithValidPhone()

        expect(h.pollForActivation).toHaveBeenCalledTimes(1)
        expect(container.querySelector('h1')?.textContent).toBe('We have your payment')
        expect(container.textContent).toContain('Activation is taking longer than usual. You do not need to pay again.')
        expect(container.textContent).toContain('We will email you as soon as your plan is active.')
        expect(container.textContent).not.toContain('We received your payment')
        expect(container.querySelector(`a[href="mailto:${SUPPORT_EMAIL}"]`)).toBeNull()
    })

    it('active: verify unconfirmed then activation keeps the success screen unchanged', async () => {
        h.verifyPayment.mockResolvedValue({ kind: 'unconfirmed' })
        h.pollForActivation.mockResolvedValue('activated')
        await render()
        await payWithValidPhone()

        expect(container.querySelector('h1')?.textContent).toBe('Your Starter plan is active')
        expect(container.textContent).toContain('Go to subscription')
        expect(container.textContent).not.toContain('We received your payment')
        expect(container.textContent).not.toContain('taking longer than usual')
    })
})
