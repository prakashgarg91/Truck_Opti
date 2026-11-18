import { act } from 'react'
import { createElement } from 'react'
import type { ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    storageUpload: vi.fn(),
    resolveTripPhotoUrl: vi.fn(async () => null),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    resolveAgencyJobId: vi.fn(),
    sendPing: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
    default: {
        error: h.toastError,
        success: h.toastSuccess,
    },
}))

vi.mock('../lib/supabase', () => ({
    supabase: {
        storage: {
            from: vi.fn(() => ({ upload: h.storageUpload })),
        },
    },
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

vi.mock('../services/driverTrackingApi', () => ({
    driverTrackingApi: {
        resolveAgencyJobId: h.resolveAgencyJobId,
        sendPing: h.sendPing,
    },
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

function DashboardRouteProbe() {
    return createElement('div', { 'data-testid': 'dashboard-probe' }, 'DASHBOARD')
}

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
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/driver/trip/:jobId', element: page }),
                    // Completing delivery navigates here (DriverTripPage handleCompleteDelivery).
                    createElement(Route, { path: '/driver/dashboard', element: createElement(DashboardRouteProbe) }),
                ),
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

    it('the header exposes a labelled back action and the email support link (no phone)', async () => {
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Active Trip'), 'trip header')
        const back = view.querySelector('button[aria-label="Back to dashboard"]')
        expect(back).not.toBeNull()
        const support = view.querySelector('a[href^="mailto:"]')
        expect(support?.getAttribute('href')).toBe('mailto:prakashgarg91@gmail.com')
        expect(support?.getAttribute('aria-label') || '').toContain('Email support')
        expect(view.querySelector('a[href^="tel:"]')).toBeNull()
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

// Delivery & Proof sub-flow (180752ea → screen c241f6c1, 2026-10-24): the
// destination_otp → delivery_photo → complete steps must carry labelled
// capture/submit actions, a photo-gated completion, and a retryable
// failed-upload alert instead of a toast alone.
describe('DriverTripPage delivery and proof sub-flow', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.getByUserId.mockResolvedValue(DRIVER)
        h.getTripByIdForDriver.mockResolvedValue(jobRow('delivery_arrived'))
        h.persistRpc.mockResolvedValue({ data: null, error: null })
        h.storageUpload.mockResolvedValue({ error: null })
    })

    async function enterDeliveryOtpAndVerify(view: HTMLElement): Promise<void> {
        await waitFor(() => (view.textContent || '').includes('Enter Delivery OTP'), 'delivery otp step')
        await act(async () => {
            setInputValue(view.querySelector('#delivery-otp-input') as HTMLInputElement, '1234')
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        await clickButton(/Verify OTP/)
        await waitFor(() => (view.textContent || '').includes('Proof of Delivery'), 'delivery photo step')
    }

    async function pickProofPhoto(view: HTMLElement): Promise<void> {
        const input = view.querySelector('input[type="file"]') as HTMLInputElement
        const file = new File(['proof-bytes'], 'proof.jpg', { type: 'image/jpeg' })
        await act(async () => {
            Object.defineProperty(input, 'files', { value: [file] })
            input.dispatchEvent(new Event('change', { bubbles: true }))
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    it('labels the capture and submit actions and gates completion on the proof photo', async () => {
        const view = await mountPage()
        await enterDeliveryOtpAndVerify(view)

        const capture = view.querySelector('button[aria-label="Capture proof of delivery photo"]')
        expect(capture).not.toBeNull()
        expect((capture as HTMLElement).textContent || '').toContain('Take Photo')

        const complete = view.querySelector('button[aria-label="Complete delivery"]') as HTMLButtonElement
        expect(complete).not.toBeNull()
        expect(complete.disabled).toBe(true)
        expect(view.textContent || '').toContain('Upload proof of delivery before you can complete the trip.')
    })

    it('a failed proof upload shows a retryable alert and keeps completion gated', async () => {
        h.storageUpload.mockResolvedValue({ error: { message: 'bucket denied' } })
        const view = await mountPage()
        await enterDeliveryOtpAndVerify(view)

        await pickProofPhoto(view)

        await waitFor(() => (view.textContent || '').includes('Photo upload failed. Please retry before continuing.'), 'failed upload alert')
        const alert = view.querySelector('[role="alert"]')
        expect(alert?.textContent || '').toContain('Photo upload failed')
        const retry = Array.from(view.querySelectorAll('button')).find((b) => /Retry Upload/.test(b.textContent || ''))
        expect(retry).toBeDefined()
        // Completion stays photo-gated and no progress was written.
        expect((view.querySelector('button[aria-label="Complete delivery"]') as HTMLButtonElement).disabled).toBe(true)
        expect(h.persistRpc).not.toHaveBeenCalled()

        // Retry re-opens the camera capture.
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
        await clickButton(/Retry Upload/)
        expect(clickSpy).toHaveBeenCalledTimes(1)
        clickSpy.mockRestore()
    })

    it('a successful upload persists the proof and enables completing delivery through the RPC', async () => {
        h.persistRpc.mockResolvedValue({
            data: {
                job_offer_id: 'job-1',
                status: 'delivery_arrived',
                pickup_arrived_at: '2026-10-24T09:00:00Z',
                journey_started_at: '2026-10-24T09:10:00Z',
                delivery_arrived_at: '2026-10-24T10:00:00Z',
                delivered_at: null,
                photo_loading_url: null,
                photo_delivery_url: 'https://localhost.invalid/storage/v1/object/sign/trip-photos/d.jpg',
                total_trips: 2,
                result_code: 'OK',
                otp_attempts_remaining: null,
            },
            error: null,
        })
        const view = await mountPage()
        await enterDeliveryOtpAndVerify(view)

        await pickProofPhoto(view)

        await waitFor(() => h.toastSuccess.mock.calls.some((c) => c[0] === 'Photo captured!'), 'upload success toast')
        // The upload itself persisted the photo reference through the RPC.
        expect(h.persistRpc).toHaveBeenCalledTimes(1)
        expect(h.persistRpc.mock.calls[0][0].newStatus).toBeNull()
        expect(h.persistRpc.mock.calls[0][0].extra.photo_delivery_url).toContain('/storage/v1/object/sign/trip-photos/')

        const complete = view.querySelector('button[aria-label="Complete delivery"]') as HTMLButtonElement
        expect(complete).not.toBeNull()
        // Re-query inside the wait: the job patch re-renders the button node.
        await waitFor(() => {
            const btn = (container as HTMLElement).querySelector('button[aria-label="Complete delivery"]') as HTMLButtonElement | null
            return !!btn && !btn.disabled
        }, 'completion enabled after proof upload')

        await clickButton(/Complete Delivery/)

        // Success sets the complete step and navigates to the dashboard route.
        await waitFor(() => (container as HTMLElement).querySelector('[data-testid="dashboard-probe"]') !== null, 'navigation to the dashboard after completion')
        expect(h.toastSuccess).toHaveBeenCalledWith('🎉 Delivery complete! Great job.')
        expect(h.persistRpc).toHaveBeenCalledTimes(2)
        expect(h.persistRpc.mock.calls[1][0].newStatus).toBe('delivered')
        expect(h.persistRpc.mock.calls[1][0].extra.delivery_otp).toBe('1234')
    })
})

// Load failures: a thrown or rejected load must never leave the spinner or read
// as "Trip Not Found"; it gets its own error state with Retry.
describe('DriverTripPage load error state', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.getByUserId.mockResolvedValue(DRIVER)
        h.persistRpc.mockResolvedValue({ data: null, error: null })
    })

    it('a failed trip fetch shows an error with Retry, not Trip Not Found, and Retry recovers', async () => {
        h.getTripByIdForDriver.mockRejectedValueOnce(new Error('network down')).mockResolvedValue(jobRow('accepted'))
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Could not load this trip'), 'error state')
        expect(view.textContent || '').not.toContain('Trip Not Found')
        expect(view.querySelector('[role="status"][aria-busy="true"]')).toBeNull()

        await clickButton(/^Retry$/)
        await waitFor(() => (view.textContent || '').includes('Navigate to Pickup'), 'trip after retry')
        expect(h.getTripByIdForDriver).toHaveBeenCalledTimes(2)
    })

    it('a failed driver lookup also ends in the error state instead of spinning forever', async () => {
        h.getByUserId.mockRejectedValue(new Error('profile lookup failed'))
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Could not load this trip'), 'error state')
        expect(h.getTripByIdForDriver).not.toHaveBeenCalled()
    })

    it('a user without a driver profile stops loading and shows the not-found state', async () => {
        h.getByUserId.mockResolvedValue(null)
        const view = await mountPage()

        await waitFor(() => (view.textContent || '').includes('Trip Not Found'), 'not found')
        expect(view.querySelector('[role="status"][aria-busy="true"]')).toBeNull()
    })
})

// Opt-in agency location sharing with a mocked Geolocation.
describe('DriverTripPage agency location sharing', () => {
    type PositionCb = (p: unknown) => void
    type ErrorCb = (e: { code: number }) => void
    let onPosition: PositionCb | null = null
    let onError: ErrorCb | null = null
    const watchPosition = vi.fn()
    const clearWatch = vi.fn()

    const position = (ts: number, speed: number | null = 10) => ({
        coords: { latitude: 19.07, longitude: 72.87, speed, accuracy: 5, heading: null },
        timestamp: ts,
    })

    const toggle = () => (container as HTMLElement).querySelector('[role="switch"]') as HTMLButtonElement

    async function turnOn(view: HTMLElement): Promise<void> {
        await waitFor(() => !!view.querySelector('[role="switch"]'), 'sharing toggle')
        await act(async () => {
            toggle().dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }

    function setGeolocation(value: unknown) {
        Object.defineProperty(navigator, 'geolocation', { configurable: true, value })
    }

    beforeEach(() => {
        vi.clearAllMocks()
        onPosition = null
        onError = null
        watchPosition.mockImplementation((ok: PositionCb, err: ErrorCb) => {
            onPosition = ok
            onError = err
            return 7
        })
        setGeolocation({ watchPosition, clearWatch, getCurrentPosition: vi.fn() })
        h.getByUserId.mockResolvedValue(DRIVER)
        h.getTripByIdForDriver.mockResolvedValue(jobRow('accepted'))
        h.persistRpc.mockResolvedValue({ data: null, error: null })
        h.resolveAgencyJobId.mockResolvedValue('agency-job-1')
        h.sendPing.mockResolvedValue({ kind: 'ok' })
    })

    afterEach(async () => {
        if (root) {
            await act(async () => root!.unmount())
            root = null
        }
        container?.remove()
        container = null
        // Restore the jsdom default (no geolocation) for the other suites.
        delete (navigator as unknown as Record<string, unknown>).geolocation
    })

    it('is OFF by default, explains what is shared, and never touches geolocation on load', async () => {
        const view = await mountPage()
        await waitFor(() => (view.textContent || '').includes('Share live location with your agency'), 'sharing card')

        expect(toggle().getAttribute('aria-checked')).toBe('false')
        expect(toggle().className).toContain('min-h-[44px]')
        const text = view.textContent || ''
        expect(text).toContain('position and speed')
        expect(text).toContain('only during this trip')
        expect(text).toContain('only your agency can see it')
        expect(text).not.toContain('Sharing location')
        expect(watchPosition).not.toHaveBeenCalled()
        expect(h.resolveAgencyJobId).not.toHaveBeenCalled()
        expect(h.sendPing).not.toHaveBeenCalled()
    })

    it('turning it on asks for location, shows the indicator and Stop, and sends the position with its own timestamp', async () => {
        const view = await mountPage()
        await turnOn(view)

        expect(h.resolveAgencyJobId).toHaveBeenCalledWith('job-1')
        expect(watchPosition).toHaveBeenCalledTimes(1)
        expect(toggle().getAttribute('aria-checked')).toBe('true')
        expect(view.textContent || '').toContain('Sharing location')
        expect(Array.from(view.querySelectorAll('button')).some((b) => /^Stop$/.test(b.textContent || ''))).toBe(true)

        const ts = Date.UTC(2026, 10, 18, 6, 30, 0)
        await act(async () => {
            onPosition!(position(ts, 10))
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(h.sendPing).toHaveBeenCalledTimes(1)
        expect(h.sendPing).toHaveBeenCalledWith('agency-job-1', {
            lat: 19.07,
            lng: 72.87,
            speedKmph: 36,
            recordedAt: '2026-11-18T06:30:00.000Z',
        })
    })

    it('sends at most one ping per minute however often the position changes', async () => {
        const view = await mountPage()
        await turnOn(view)
        const base = Date.UTC(2026, 10, 18, 6, 30, 0)
        for (let i = 0; i < 5; i++) {
            await act(async () => {
                onPosition!(position(base + i * 3000))
                await new Promise((resolve) => setTimeout(resolve, 0))
            })
        }
        expect(h.sendPing).toHaveBeenCalledTimes(1)
    })

    it('Stop ends sharing, clears the watch and hides the indicator', async () => {
        const view = await mountPage()
        await turnOn(view)
        await clickButton(/^Stop$/)

        expect(clearWatch).toHaveBeenCalledWith(7)
        expect(toggle().getAttribute('aria-checked')).toBe('false')
        expect(view.textContent || '').not.toContain('Sharing location')
    })

    it('leaving the page stops the watch', async () => {
        const view = await mountPage()
        await turnOn(view)
        expect(view).toBeTruthy()
        await act(async () => root!.unmount())
        root = null
        expect(clearWatch).toHaveBeenCalledWith(7)
    })

    it('a blocked permission ends sharing calmly with a plain message', async () => {
        const view = await mountPage()
        await turnOn(view)
        await act(async () => {
            onError!({ code: 1 })
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(view.textContent || '').toContain('Location permission is blocked')
        expect(toggle().getAttribute('aria-checked')).toBe('false')
        expect(h.sendPing).not.toHaveBeenCalled()
        expect(clearWatch).toHaveBeenCalled()
    })

    it('a timeout or unavailable position keeps sharing and shows a calm note', async () => {
        const view = await mountPage()
        await turnOn(view)
        await act(async () => {
            onError!({ code: 3 })
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(view.textContent || '').toContain('Still waiting for a GPS signal')
        expect(toggle().getAttribute('aria-checked')).toBe('true')
        await act(async () => {
            onError!({ code: 2 })
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(view.textContent || '').toContain('Your location is not available right now')
        expect(toggle().getAttribute('aria-checked')).toBe('true')
    })

    it('when the agency job cannot be resolved the driver is never prompted for location', async () => {
        h.resolveAgencyJobId.mockResolvedValue(null)
        const view = await mountPage()
        await turnOn(view)
        await waitFor(() => (view.textContent || '').includes('not available for this trip'), 'unavailable message')
        expect(watchPosition).not.toHaveBeenCalled()
        expect(toggle().getAttribute('aria-checked')).toBe('false')
    })

    it('a browser without geolocation says so and does not start', async () => {
        setGeolocation(undefined)
        const view = await mountPage()
        await turnOn(view)
        expect(view.textContent || '').toContain('cannot share location')
        expect(h.resolveAgencyJobId).not.toHaveBeenCalled()
    })

    it('stops by itself when the server says the job is no longer active', async () => {
        h.sendPing.mockResolvedValue({ kind: 'refused', code: 'job_not_active' })
        const view = await mountPage()
        await turnOn(view)
        await act(async () => {
            onPosition!(position(Date.UTC(2026, 10, 18, 6, 30, 0)))
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(view.textContent || '').toContain('no longer active')
        expect(toggle().getAttribute('aria-checked')).toBe('false')
        expect(clearWatch).toHaveBeenCalledWith(7)
    })

    it('stops by itself when the trip ends', async () => {
        const photo = 'https://localhost.invalid/storage/v1/object/sign/trip-photos/d.jpg'
        h.persistRpc.mockResolvedValue({
            data: {
                job_offer_id: 'job-1', status: 'delivered',
                pickup_arrived_at: null, journey_started_at: null, delivery_arrived_at: null,
                delivered_at: '2026-11-18T07:00:00Z', photo_loading_url: null,
                photo_delivery_url: photo,
                total_trips: 3, result_code: 'OK', otp_attempts_remaining: null,
            },
            error: null,
        })
        h.getTripByIdForDriver.mockResolvedValue(jobRow('delivery_arrived', { photo_delivery_url: photo }))
        const view = await mountPage()
        await turnOn(view)
        await waitFor(() => (view.textContent || '').includes('Enter Delivery OTP'), 'delivery otp step')
        await act(async () => {
            setInputValue(view.querySelector('#delivery-otp-input') as HTMLInputElement, '1234')
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        await clickButton(/Verify OTP/)
        await waitFor(() => (view.textContent || '').includes('Proof of Delivery'), 'delivery photo step')
        await clickButton(/Complete Delivery/)

        await waitFor(() => (container as HTMLElement).querySelector('[data-testid="dashboard-probe"]') !== null, 'navigation after delivery')
        expect(clearWatch).toHaveBeenCalledWith(7)
    })
})
