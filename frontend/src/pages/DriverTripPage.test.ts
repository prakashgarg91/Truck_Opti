import { act } from 'react'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Driver Trip Detail refresh (591699f3 → screen 98648447, 2026-10-24): the
// 7-step journey page must expose a labelled back action, an aria-live step
// announcer with aria-current, programmatically linked 4-digit OTP inputs,
// inline announced OTP rejections, honest loading/not-found states, and the
// GPS-failure state. Wiring stays TO-129/TO-130: progress runs through the
// single persist_driver_job_offer_progress RPC (real helpers, mocked RPC).

const h = vi.hoisted(() => ({
    getByUserId: vi.fn(),
    getTripByIdForDriver: vi.fn(),
    persistRpc: vi.fn(),
    resolveTripPhotoUrl: vi.fn(async () => null),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
    default: {
        error: h.toastError,
        success: h.toastSuccess,
    },
}))

vi.mock('../lib/supabase', () => ({
    supabase: {},
    supabaseConfigResolution: { clientUrl: 'https://localhost.invalid' },
}))

vi.mock('../services/supabaseApi', () => ({
    driverSupabaseApi: {
        getByUserId: h.getByUserId,
    },
    driverTripsApi: {
        getTripByIdForDriver: h.getTripByIdForDriver,
    },
}))

vi.mock('../services/driverTripProgress', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    persistDriverJobProgressRpc: h.persistRpc,
}))

vi.mock('../services/tripPhotoUrl', () => ({
    resolveTripPhotoUrl: h.resolveTripPhotoUrl,
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'auth-user-1' } }),
}))

import DriverTripPage from './DriverTripPage'

const DRIVER = {
    id: 'driver-1',
    full_name: 'Trip Driver',
    active_job_id: null,
    total_trips: 2,
}

function jobRow(status: string, overrides: Record<string, unknown> = {}) {
    return {
        id: 'job-1',
        shipment_id: 'TRK-1',
        status,
        photo_loading_url: null,
        photo_delivery_url: null,
        pickup_arrived_at: null,
        journey_started_at: null,
        delivery_arrived_at: null,
        delivered_at: null,
        shipments: {
            shipment_id: 'TRK-1',
            origin: 'Mumbai Yard',
            destination: 'Delhi Hub',
            total_weight: 900,
            estimated_cost: 4200,
            customer_id: 'cust-1',
        },
        ...overrides,
    }
}

let container: HTMLElement | null = null
let root: Root | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    const page = createElement(DriverTripPage) as ReactElement
    await act(async () => {
        root = createRoot(container as HTMLElement)
        root.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/driver/trip/job-1'] },
                createElement(Routes, null, createElement(Route, { path: '/driver/trip/:jobId', element: page })),
            )
        )
    })
    return container as HTMLElement
}

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        if (predicate()) return
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25))
        })
    }
    throw new Error(`timed out waiting for ${label}`)
}

function setInputValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
}

async function clickButton(matcher: RegExp): Promise<void> {
    const buttons = Array.from((container as HTMLElement).querySelectorAll('button'))
    const button = buttons.find((b) => matcher.test(b.textContent || ''))
    if (!button) throw new Error(`button matching ${matcher} not found`)
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((resolve) => setTimeout(resolve, 0))
    })
}

describe('DriverTripPage refresh states and a11y', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.getByUserId.mockResolvedValue(DRIVER)
        h.getTripByIdForDriver.mockResolvedValue(jobRow('accepted'))
        h.persistRpc.mockResolvedValue({ data: null, error: null })
    })

    it('loading renders a busy status region before data arrives', async () => {
        h.getTripByIdForDriver.mockReturnValue(new Promise(() => {}))
        const view = await mountPage()

        const status = view.querySelector('[role="status"]')
        expect(status).not.toBeNull()
        expect(status?.getAttribute('aria-busy')).toBe('true')
    })

    it('a missing trip renders the not-found alert with a back CTA', async () => {
        h.getTripByIdForDriver.mockResolvedValue(null)
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Trip Not Found'), 'trip not found state')
        expect(view.querySelector('[role="alert"]')).not.toBeNull()
        expect(Array.from(view.querySelectorAll('button')).some((b) => /Back to Dashboard/.test(b.textContent || ''))).toBe(true)
    })

    it('the header exposes a labelled back action and the configured support tel link', async () => {
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Active Trip'), 'trip header')
        const back = view.querySelector('button[aria-label="Back to dashboard"]')
        expect(back).not.toBeNull()
        const support = view.querySelector('a[href^="tel:"]')
        expect(support?.getAttribute('href')).toBe('tel:+919999352050')
        expect(support?.getAttribute('aria-label') || '').toContain('support')
    })

    it('the stepper announces the current step and marks it with aria-current', async () => {
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Navigate to Pickup'), 'navigate step content')
        expect(view.textContent || '').toContain('Step 1 of 7: Navigate')
        const current = view.querySelector('[aria-current="step"]')
        expect(current?.textContent || '').toContain('Navigate')
    })

    it('the pickup OTP input is programmatically labelled and gates Verify on 4 digits', async () => {
        h.getTripByIdForDriver.mockResolvedValue(jobRow('pickup_arrived'))
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Enter Pickup OTP'), 'pickup otp step')
        const input = view.querySelector('#pickup-otp-input') as HTMLInputElement
        expect(input).not.toBeNull()
        const label = view.querySelector('label[for="pickup-otp-input"]')
        expect(label?.textContent || '').toContain('4-Digit OTP from Sender')
        expect((input.getAttribute('aria-describedby') || '')).toContain('pickup-otp-hint')

        const verify = Array.from(view.querySelectorAll('button')).find((b) => /Verify OTP/.test(b.textContent || '')) as HTMLButtonElement
        expect(verify.disabled).toBe(true)

        await act(async () => {
            setInputValue(input, '12')
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(verify.disabled).toBe(true)

        await act(async () => {
            setInputValue(input, '1234')
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(verify.disabled).toBe(false)

        await clickButton(/Verify OTP/)

        await waitFor(() => (view.textContent || '').includes('Capture Loading Photo'), 'loading photo step')
        expect(view.textContent || '').toContain('Step 3 of 7: Load Photo')
        expect(h.toastSuccess).toHaveBeenCalledWith('OTP entered — continue with loading photo')
    })

    it('a server OTP rejection returns to the OTP step with an inline announced error', async () => {
        h.getTripByIdForDriver.mockResolvedValue(
            jobRow('pickup_arrived', { photo_loading_url: 'https://localhost.invalid/storage/v1/object/sign/trip-photos/p.jpg' })
        )
        h.persistRpc.mockResolvedValue({
            data: {
                job_offer_id: 'job-1',
                status: 'pickup_arrived',
                pickup_arrived_at: '2026-10-24T09:00:00Z',
                journey_started_at: null,
                delivery_arrived_at: null,
                delivered_at: null,
                photo_loading_url: null,
                photo_delivery_url: null,
                total_trips: 2,
                result_code: 'OTP_INCORRECT',
                otp_attempts_remaining: 2,
            },
            error: null,
        })
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Enter Pickup OTP'), 'pickup otp step')
        await act(async () => {
            setInputValue(view.querySelector('#pickup-otp-input') as HTMLInputElement, '9999')
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        await clickButton(/Verify OTP/)
        await waitFor(() => (view.textContent || '').includes('Start Journey'), 'loading photo step')
        await clickButton(/Start Journey/)

        await waitFor(() => (view.textContent || '').includes('Incorrect OTP. 2 attempts remaining.'), 'inline OTP rejection')
        expect(h.toastError).toHaveBeenCalledWith('Incorrect OTP. 2 attempts remaining.')
        // Back on the pickup OTP step, input cleared, marked invalid.
        const input = view.querySelector('#pickup-otp-input') as HTMLInputElement
        expect(input).not.toBeNull()
        expect(input.value).toBe('')
        expect(input.getAttribute('aria-invalid')).toBe('true')
        expect(h.persistRpc).toHaveBeenCalledTimes(1)
    })

    it('in-transit renders the labelled GPS failure state when geolocation is unavailable', async () => {
        h.getTripByIdForDriver.mockResolvedValue(jobRow('in_transit'))
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Journey in Progress'), 'in transit step')
        expect(view.textContent || '').toContain('This device does not support browser geolocation for live tracking.')
        expect(view.textContent || '').toContain('Attention needed')
    })

    it('the delivery OTP step labels its own 4-digit input', async () => {
        h.getTripByIdForDriver.mockResolvedValue(jobRow('delivery_arrived'))
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Enter Delivery OTP'), 'delivery otp step')
        const label = view.querySelector('label[for="delivery-otp-input"]')
        expect(label?.textContent || '').toContain('4-Digit OTP from Recipient')
        const input = view.querySelector('#delivery-otp-input') as HTMLInputElement
        expect(input.getAttribute('aria-describedby') || '').toContain('delivery-otp-hint')
    })

    it('a delivered job renders the completion card', async () => {
        h.getTripByIdForDriver.mockResolvedValue(jobRow('delivered'))
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Delivery Complete!'), 'complete step')
        expect(Array.from(view.querySelectorAll('button')).some((b) => /Back to Dashboard/.test(b.textContent || ''))).toBe(true)
    })
})
