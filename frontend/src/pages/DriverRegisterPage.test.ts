/**
 * Regression suite for DriverRegisterPage — the driver onboarding wizard.
 *
 * The page is exercised through react-dom (no Testing Library in this repo):
 * auth comes from a mocked useAuthStore, driverKycApi.uploadDocument and
 * driverSupabaseApi.register are vi.hoisted mocks, so no network or real
 * Supabase client is ever touched. Every case pins the CURRENT behaviour of
 * the page so later changes cannot break it silently.
 *
 * Documents are selected locally and sent through driverKycApi.uploadDocument
 * only AFTER the drivers row is created (driver-kyc requires that row).
 */
// FINDING (a11y, not fixed here): the visible <label> elements have no
// htmlFor/id association and the text/select inputs carry no aria-label, so
// screen readers cannot map labels to fields; the only programmatic labels on
// the page are the two remove-photo aria-labels. These tests therefore assert
// visible label text, not label/field association.
// FINDING (validation quirk, not fixed here and NOT pinned by any test):
// step-3 IFSC is validated WITHOUT trimming (`form.ifsc_code.toUpperCase()`)
// while submission trims it, so a value like "SBIN0001234 " is rejected with a
// format error even though the submitted payload would normalize to a valid
// code. No test below asserts either side of this quirk.

import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    register: vi.fn(),
    updateUser: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    loggerError: vi.fn(),
    uploadDocument: vi.fn(),
}))

const auth = vi.hoisted(() => ({
    user: null as { id: string; email: string; role: string } | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/supabaseApi', () => ({
    driverSupabaseApi: { register: h.register },
}))

vi.mock('../services/driverKycApi', () => ({
    uploadDocument: h.uploadDocument,
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: auth.user, updateUser: h.updateUser }),
}))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), warn: vi.fn(), info: vi.fn(), error: h.loggerError },
}))

import DriverRegisterPage from './DriverRegisterPage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const RETURN_TO_KEY = 'truckopti-auth-return-to'
const USER_ID = 'user-1'

// Records every router location the page navigates to (MemoryRouter has no
// history to inspect directly).
const locations: string[] = []
function LocationProbe() {
    const location = useLocation()
    locations.push(`${location.pathname}${location.search}`)
    return null
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/driver/register'] },
                createElement(LocationProbe),
                createElement(DriverRegisterPage),
            ),
        )
        await new Promise((r) => setTimeout(r, 0))
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
    sessionStorage.clear()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const qAll = (sel: string) => Array.from((container as HTMLElement).querySelectorAll(sel))
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(element: Element) {
    await act(async () => {
        element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
    await act(async () => {
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
}

async function pickFile(input: HTMLInputElement, file: File) {
    await act(async () => {
        Object.defineProperty(input, 'files', { value: [file], configurable: true })
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

const field = (placeholder: string) => q(`input[placeholder="${placeholder}"]`) as HTMLInputElement
const f = {
    name: () => field('As on Aadhaar card'),
    phone: () => field('10-digit number'),
    aadhaar: () => field('XXXX'),
    pan: () => field('ABCDE1234F'),
    city: () => field('e.g. Mumbai'),
    rc: () => field('MH01AB1234'),
    license: () => field('MH0120220001234'),
    bank: () => field('Account number'),
    ifsc: () => field('SBIN0001234'),
    upi: () => field('name@upi'),
}
const vehicleSelect = () => q('select') as HTMLSelectElement
const fileInputs = () => qAll('input[type="file"]') as HTMLInputElement[]
const nextButton = () => buttons(/Continue|Submit Application/)[0] as HTMLButtonElement

async function completeStep1() {
    await type(f.name(), 'Ravi Kumar')
    await type(f.phone(), '9876543210')
    await type(f.pan(), 'ABCDE1234F')
    await type(f.city(), 'Mumbai')
}
async function gotoStep2() {
    await mountPage()
    await completeStep1()
    await click(nextButton())
}
async function gotoStep3() {
    await gotoStep2()
    await type(vehicleSelect(), 'tata_407')
    await click(nextButton())
}

describe('DriverRegisterPage', () => {
    beforeEach(() => {
        auth.user = { id: USER_ID, email: 'driver@example.com', role: 'user' }
        h.register.mockResolvedValue(undefined)
        h.uploadDocument.mockResolvedValue({})
        locations.length = 0
        sessionStorage.clear()
    })

    it('logged out: shows the login gate instead of the form and never calls the API', async () => {
        auth.user = null
        await mountPage()
        expect(text()).toContain('Log In To Start Driver Registration')
        expect(text()).toContain('Continue To Driver Login')
        expect(f.name()).toBeNull()
        expect(h.register).not.toHaveBeenCalled()
        expect(h.uploadDocument).not.toHaveBeenCalled()
    })

    it('logged out: the gate button stores the return-to path and navigates to driver login', async () => {
        auth.user = null
        await mountPage()
        await click(buttons(/Continue To Driver Login/)[0])
        expect(sessionStorage.getItem(RETURN_TO_KEY)).toBe('/driver/register')
        expect(locations).toContain('/login?mode=driver')
    })

    it('sets the browser document title on mount', async () => {
        await mountPage()
        expect(document.title).toBe('Driver Registration - TruckOpti')
    })

    it('step 1 renders Personal Details with its field labels and input limits', async () => {
        await mountPage()
        expect(text()).toContain('Personal Details')
        expect(text()).toContain('Step 1 of 3 — Personal')
        for (const label of ['Full Name *', 'Mobile Number *', 'Aadhaar Last 4 Digits', 'PAN Number *', 'Home City *']) {
            expect(text()).toContain(label)
        }
        expect(f.phone().maxLength).toBe(10)
        expect(f.aadhaar().maxLength).toBe(4)
        expect(f.pan().maxLength).toBe(10)
    })

    it('blocks step 1 without a full name and stays on the step', async () => {
        await mountPage()
        await type(f.phone(), '9876543210')
        await type(f.pan(), 'ABCDE1234F')
        await type(f.city(), 'Mumbai')
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Enter your full name')
        expect(text()).toContain('Personal Details')
        expect(h.register).not.toHaveBeenCalled()
    })

    it('blocks step 1 when the mobile number is not exactly 10 digits', async () => {
        await mountPage()
        await type(f.name(), 'Ravi Kumar')
        await type(f.phone(), '98765')
        await type(f.pan(), 'ABCDE1234F')
        await type(f.city(), 'Mumbai')
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid 10-digit mobile number')
        expect(text()).toContain('Personal Details')
    })

    it('blocks step 1 on a malformed PAN number', async () => {
        await mountPage()
        await type(f.name(), 'Ravi Kumar')
        await type(f.phone(), '9876543210')
        await type(f.pan(), 'ABC123')
        await type(f.city(), 'Mumbai')
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid PAN number (e.g. ABCDE1234F)')
        expect(text()).toContain('Personal Details')
    })

    it('blocks step 1 without a home city', async () => {
        await mountPage()
        await type(f.name(), 'Ravi Kumar')
        await type(f.phone(), '9876543210')
        await type(f.pan(), 'ABCDE1234F')
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Enter your home city')
        expect(text()).toContain('Personal Details')
    })

    it('accepts a lowercase PAN and advances to the Vehicle step with an updated progress header', async () => {
        await mountPage()
        await type(f.name(), 'Ravi Kumar')
        await type(f.phone(), '9876543210')
        await type(f.pan(), 'abcde1234f')
        await type(f.city(), 'Mumbai')
        await click(nextButton())
        expect(h.toastError).not.toHaveBeenCalled()
        expect(text()).toContain('Step 2 of 3 — Vehicle')
        expect(text()).toContain('Vehicle Details')
    })

    it('Back from step 2 returns to step 1 and keeps the entered values', async () => {
        await gotoStep2()
        await click(buttons(/Back/)[0])
        expect(text()).toContain('Personal Details')
        expect(f.name().value).toBe('Ravi Kumar')
        expect(f.pan().value).toBe('ABCDE1234F')
    })

    it('step 2 offers the placeholder plus exactly the six supported vehicle types', async () => {
        await gotoStep2()
        const options = Array.from(vehicleSelect().options)
        expect(options.map((o) => o.value)).toEqual([
            '',
            'tata_407',
            'eicher_14ft',
            'eicher_17ft',
            'ashok_19ft',
            'bharatbenz_24ft',
            'bharatbenz_32ft',
        ])
        expect(text()).toContain('Tata 407 (1 ton)')
        expect(text()).toContain('BharatBenz 32ft (15 ton)')
    })

    it('blocks step 2 until a vehicle type is selected', async () => {
        await gotoStep2()
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Select your vehicle type')
        expect(text()).toContain('Vehicle Details')
        expect(h.register).not.toHaveBeenCalled()
    })

    async function completeWizard(docs: { licence?: File; rc?: File } = {}) {
        await mountPage()
        await type(f.name(), 'Ravi Kumar')
        await type(f.phone(), '9876543210')
        await type(f.aadhaar(), '1234')
        await type(f.pan(), 'ABCDE1234F')
        await type(f.city(), 'Mumbai')
        await click(nextButton())
        await type(vehicleSelect(), 'tata_407')
        await type(f.rc(), 'MH01AB1234')
        await type(f.license(), 'MH0120220001234')
        // RC first: picking the licence removes its input, which would shift the indexes.
        if (docs.rc) await pickFile(fileInputs()[1], docs.rc)
        if (docs.licence) await pickFile(fileInputs()[0], docs.licence)
        await click(nextButton())
        await type(f.bank(), '123456789012')
        await type(f.ifsc(), 'SBIN0001234')
        await click(nextButton())
    }

    it('selecting a licence holds the file locally: no upload happens until submit', async () => {
        await gotoStep2()
        await pickFile(fileInputs()[0], new File(['dl-bytes'], 'licence.png', { type: 'image/png' }))
        expect(h.uploadDocument).not.toHaveBeenCalled()
        expect(text()).toContain('Selected: licence.png')
        expect(q('button[aria-label="Remove driving licence photo"]')).not.toBeNull()
        expect(buttons(/Upload Driving Licence/)).toHaveLength(0)
    })

    it('selecting an RC holds the file locally and shows its Selected state', async () => {
        await gotoStep2()
        await pickFile(fileInputs()[1], new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' }))
        expect(h.uploadDocument).not.toHaveBeenCalled()
        expect(text()).toContain('Selected: rc.jpg')
        expect(q('button[aria-label="Remove RC photo"]')).not.toBeNull()
    })

    it('a file the KYC validator rejects is not selected and its reason is toasted', async () => {
        await gotoStep2()
        await pickFile(fileInputs()[0], new File(['gif'], 'licence.gif', { type: 'image/gif' }))
        expect(h.toastError).toHaveBeenCalledWith('Unsupported file type. Use JPG, PNG, WEBP or PDF.')
        expect(q('button[aria-label="Remove driving licence photo"]')).toBeNull()
        expect(buttons(/Upload Driving Licence/)).toHaveLength(1)
        expect(h.uploadDocument).not.toHaveBeenCalled()
    })

    it('removing an uploaded licence restores the upload button', async () => {
        await gotoStep2()
        await pickFile(fileInputs()[0], new File(['x'], 'licence.png', { type: 'image/png' }))
        expect(q('button[aria-label="Remove driving licence photo"]')).not.toBeNull()
        await click(q('button[aria-label="Remove driving licence photo"]') as HTMLButtonElement)
        expect(q('button[aria-label="Remove driving licence photo"]')).toBeNull()
        expect(buttons(/Upload Driving Licence/)).toHaveLength(1)
    })

    it('submission creates the driver row first, then uploads the licence as driving_license and the RC as rc_book', async () => {
        const licence = new File(['dl-bytes'], 'licence.png', { type: 'image/png' })
        const rc = new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' })
        await completeWizard({ licence, rc })

        expect(h.register).toHaveBeenCalledTimes(1)
        expect(h.register.mock.calls[0][0].dl_url).toBeNull()
        expect(h.register.mock.calls[0][0].rc_url).toBeNull()
        expect(h.uploadDocument.mock.calls).toEqual([
            ['driving_license', licence],
            ['rc_book', rc],
        ])
        expect(h.register.mock.invocationCallOrder[0]).toBeLessThan(h.uploadDocument.mock.invocationCallOrder[0])
    })

    it('all uploads ok: the confirmation lists both documents as received and reports no failure', async () => {
        await completeWizard({
            licence: new File(['dl-bytes'], 'licence.png', { type: 'image/png' }),
            rc: new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' }),
        })
        expect(text()).toContain('Application Submitted!')
        expect(text()).toContain('Documents received: Driving Licence, Vehicle RC.')
        expect(text()).not.toContain('did not upload')
        expect(h.toastError).not.toHaveBeenCalled()
        expect(h.updateUser).toHaveBeenCalledWith({ role: 'driver' })
    })

    it('one upload fails (licence): registration completes, the licence is named as not uploaded, and the RC is still sent', async () => {
        h.uploadDocument.mockRejectedValueOnce(new Error('bad bytes')).mockResolvedValueOnce({})
        await completeWizard({
            licence: new File(['dl-bytes'], 'licence.png', { type: 'image/png' }),
            rc: new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' }),
        })
        expect(h.uploadDocument).toHaveBeenCalledTimes(2)
        expect(h.updateUser).toHaveBeenCalledWith({ role: 'driver' })
        expect(text()).toContain('Application Submitted!')
        expect(text()).toContain('Documents received: Vehicle RC.')
        expect(text()).toContain('These documents did not upload: Driving Licence.')
        expect(text()).toContain('Add them from your profile (Documents & KYC).')
        expect(text()).not.toContain('Documents received: Driving Licence')
        expect(h.toastError).toHaveBeenCalledWith('Some documents did not upload. You can add them from your profile.')
        expect(h.loggerError).toHaveBeenCalled()
    })

    it('one upload fails (RC): the licence is reported as received and only the RC as not uploaded', async () => {
        h.uploadDocument.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('bad bytes'))
        await completeWizard({
            licence: new File(['dl-bytes'], 'licence.png', { type: 'image/png' }),
            rc: new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' }),
        })
        expect(h.uploadDocument).toHaveBeenCalledTimes(2)
        expect(text()).toContain('Application Submitted!')
        expect(text()).toContain('Documents received: Driving Licence.')
        expect(text()).toContain('These documents did not upload: Vehicle RC.')
        expect(text()).not.toContain('Documents received: Vehicle RC')
    })

    it('all uploads fail: nothing is reported as received, both documents are named, and registration still completes', async () => {
        h.uploadDocument.mockRejectedValue(new Error('storage down'))
        await completeWizard({
            licence: new File(['dl-bytes'], 'licence.png', { type: 'image/png' }),
            rc: new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' }),
        })
        expect(h.uploadDocument).toHaveBeenCalledTimes(2)
        expect(h.register).toHaveBeenCalledTimes(1)
        expect(h.updateUser).toHaveBeenCalledWith({ role: 'driver' })
        expect(text()).toContain('Application Submitted!')
        expect(text()).toContain('These documents did not upload: Driving Licence, Vehicle RC.')
        expect(text()).not.toContain('Documents received')
    })

    it('no documents selected: no upload is attempted and the confirmation says none were attached', async () => {
        await completeWizard({})
        expect(h.uploadDocument).not.toHaveBeenCalled()
        expect(text()).toContain('Application Submitted!')
        expect(text()).toContain('No documents were attached at sign-up. Add them from your profile (Documents & KYC).')
    })

    it('driver row insert fails: no document upload is attempted', async () => {
        h.register.mockRejectedValueOnce(new Error('insert failed'))
        await completeWizard({
            licence: new File(['dl-bytes'], 'licence.png', { type: 'image/png' }),
            rc: new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' }),
        })
        expect(h.register).toHaveBeenCalledTimes(1)
        expect(h.uploadDocument).not.toHaveBeenCalled()
        expect(h.toastError).toHaveBeenCalledWith('Submission failed. Please try again.')
        expect(text()).toContain('Payment Details')
        expect(text()).not.toContain('Application Submitted!')
    })

    it('the submit button stays disabled while documents upload after the driver row is created', async () => {
        let settle!: () => void
        h.uploadDocument.mockImplementation(() => new Promise<void>((res) => { settle = res }))
        await gotoStep2()
        await pickFile(fileInputs()[0], new File(['dl-bytes'], 'licence.png', { type: 'image/png' }))
        await type(vehicleSelect(), 'tata_407')
        await click(nextButton())
        await type(f.bank(), '123456789012')
        await type(f.ifsc(), 'SBIN0001234')
        const submit = nextButton()
        await click(submit)
        expect(submit.disabled).toBe(true)
        expect(h.register).toHaveBeenCalledTimes(1)
        expect(h.uploadDocument).toHaveBeenCalledTimes(1)
        await act(async () => {
            settle()
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(text()).toContain('Application Submitted!')
    })

    it('step 3 requires a bank account number', async () => {
        await gotoStep3()
        await type(f.ifsc(), 'SBIN0001234')
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Enter bank account number')
        expect(text()).toContain('Payment Details')
        expect(h.register).not.toHaveBeenCalled()
    })

    it('step 3 rejects a malformed IFSC code', async () => {
        await gotoStep3()
        await type(f.bank(), '123456789012')
        await type(f.ifsc(), 'SBIN999999')
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid IFSC code (e.g. SBIN0001234)')
        expect(text()).toContain('Payment Details')
        expect(h.register).not.toHaveBeenCalled()
    })

    it('submission sends the exact normalized payload, upgrades the role and shows the confirmation', async () => {
        await mountPage()
        await type(f.name(), '  Ravi Kumar  ')
        await type(f.phone(), '9876543210')
        await type(f.aadhaar(), '1234')
        await type(f.pan(), 'abcde1234f')
        await type(f.city(), '  Mumbai  ')
        await click(nextButton())
        await type(vehicleSelect(), 'tata_407')
        await type(f.rc(), '  MH01AB1234  ')
        await type(f.license(), 'MH0120220001234')
        await click(nextButton())
        await type(f.bank(), ' 123456789012 ')
        await type(f.ifsc(), 'sbin0001234')
        await click(nextButton())

        expect(h.register).toHaveBeenCalledTimes(1)
        expect(h.register.mock.calls[0][0]).toEqual({
            user_id: USER_ID,
            full_name: 'Ravi Kumar',
            phone: '9876543210',
            aadhaar_last4: '1234',
            pan_number: 'ABCDE1234F',
            home_city: 'Mumbai',
            vehicle_type: 'tata_407',
            rc_number: 'MH01AB1234',
            license_number: 'MH0120220001234',
            bank_account: '123456789012',
            ifsc_code: 'SBIN0001234',
            upi_id: null,
            dl_url: null,
            rc_url: null,
            status: 'pending',
        })
        expect(h.updateUser).toHaveBeenCalledWith({ role: 'driver' })
        expect(text()).toContain('Application Submitted!')
        expect(text()).toContain('Ravi Kumar')
        expect(text()).toContain('9876543210')
    })

    it('the confirmation makes no SMS promise and states the real next step (review, then sign in to check status)', async () => {
        await gotoStep3()
        await type(f.bank(), '123456789012')
        await type(f.ifsc(), 'SBIN0001234')
        await click(nextButton())
        const body = text()
        expect(body).toContain('Application Submitted!')
        expect(body).toContain('Our team reviews your details and documents.')
        expect(body).toContain('Sign in with this account to check your application status.')
        expect(body).not.toMatch(/SMS/i)
        expect(body).not.toContain('24')
        expect(body).not.toContain('Account activated via SMS')
    })

    it('the confirmation screen navigates to the driver portal', async () => {
        await gotoStep3()
        await type(f.bank(), '123456789012')
        await type(f.ifsc(), 'SBIN0001234')
        await click(nextButton())
        expect(text()).toContain('Application Submitted!')
        await click(buttons(/Open Driver Portal/)[0])
        expect(locations).toContain('/driver/dashboard')
    })

    it('a rejected submission toasts the fallback message and stays on step 3 without upgrading the role', async () => {
        h.register.mockRejectedValueOnce(new Error('insert failed'))
        await gotoStep3()
        await type(f.bank(), '123456789012')
        await type(f.ifsc(), 'SBIN0001234')
        await click(nextButton())
        expect(h.toastError).toHaveBeenCalledWith('Submission failed. Please try again.')
        expect(text()).toContain('Payment Details')
        expect(text()).not.toContain('Application Submitted!')
        expect(h.updateUser).not.toHaveBeenCalled()
    })

    it('the submit button is disabled while the application is in flight', async () => {
        let settle!: () => void
        h.register.mockImplementation(() => new Promise<void>((res) => { settle = res }))
        await gotoStep3()
        await type(f.bank(), '123456789012')
        await type(f.ifsc(), 'SBIN0001234')
        const submit = nextButton()
        await click(submit)
        expect(submit.disabled).toBe(true)
        expect(h.register).toHaveBeenCalledTimes(1)
        await act(async () => {
            settle()
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(text()).toContain('Application Submitted!')
    })

    it('the step-1 header arrow and the Sign In link both go to driver login', async () => {
        await mountPage()
        await click(q('button') as HTMLButtonElement)
        expect(locations).toContain('/login?mode=driver')
        expect(sessionStorage.getItem(RETURN_TO_KEY)).toBeNull()
        await click(buttons(/Sign In/)[0])
        expect(locations.filter((l) => l === '/login?mode=driver').length).toBeGreaterThanOrEqual(2)
    })
})
