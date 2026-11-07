/**
 * Regression suite for DriverRegisterPage — the driver onboarding wizard.
 *
 * The page is exercised through react-dom (no Testing Library in this repo):
 * auth comes from a mocked useAuthStore, supabase storage and
 * driverSupabaseApi.register are vi.hoisted mocks, so no network or real
 * Supabase client is ever touched. Every case pins the CURRENT behaviour of
 * the page so later changes cannot break it silently.
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
    storageFrom: vi.fn(),
    upload: vi.fn(),
    getPublicUrl: vi.fn(),
}))

const auth = vi.hoisted(() => ({
    user: null as { id: string; email: string; role: string } | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/supabaseApi', () => ({
    driverSupabaseApi: { register: h.register },
}))

vi.mock('../lib/supabase', () => ({
    supabase: { storage: { from: h.storageFrom } },
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
        h.storageFrom.mockImplementation(() => ({ upload: h.upload, getPublicUrl: h.getPublicUrl }))
        h.upload.mockResolvedValue({ error: null })
        h.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }))
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
        expect(h.upload).not.toHaveBeenCalled()
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

    it('licence upload stores under <user>/licence.<ext> with upsert and shows the public preview', async () => {
        await gotoStep2()
        const file = new File(['dl-bytes'], 'licence.png', { type: 'image/png' })
        await pickFile(fileInputs()[0], file)
        expect(h.storageFrom).toHaveBeenCalledWith('driver-docs')
        expect(h.upload).toHaveBeenCalledTimes(1)
        expect(h.upload).toHaveBeenCalledWith(`${USER_ID}/licence.png`, file, { upsert: true })
        expect(h.getPublicUrl).toHaveBeenCalledWith(`${USER_ID}/licence.png`)
        expect(h.toastSuccess).toHaveBeenCalledWith('Driving licence uploaded')
        expect(q('img[alt="Licence"]')?.getAttribute('src')).toBe(`https://cdn.test/${USER_ID}/licence.png`)
        expect(text()).toContain('Uploaded')
    })

    it('RC upload stores under <user>/rc.<ext> and toasts its own message', async () => {
        await gotoStep2()
        const file = new File(['rc-bytes'], 'rc.jpg', { type: 'image/jpeg' })
        await pickFile(fileInputs()[1], file)
        expect(h.upload).toHaveBeenCalledWith(`${USER_ID}/rc.jpg`, file, { upsert: true })
        expect(h.toastSuccess).toHaveBeenCalledWith('RC uploaded')
        expect(q('img[alt="RC"]')?.getAttribute('src')).toBe(`https://cdn.test/${USER_ID}/rc.jpg`)
    })

    it('a failed upload toasts, logs, and keeps the upload button', async () => {
        h.upload.mockRejectedValueOnce(new Error('storage down'))
        await gotoStep2()
        await pickFile(fileInputs()[0], new File(['x'], 'licence.png', { type: 'image/png' }))
        expect(h.toastError).toHaveBeenCalledWith('Failed to upload document')
        expect(h.loggerError).toHaveBeenCalled()
        expect(q('img[alt="Licence"]')).toBeNull()
        expect(buttons(/Upload Driving Licence/)).toHaveLength(1)
    })

    it('the licence button is disabled and reads "Uploading..." while the upload is in flight', async () => {
        let settle!: (value: { error: null }) => void
        h.upload.mockImplementation(() => new Promise((res) => { settle = res }))
        await gotoStep2()
        await pickFile(fileInputs()[0], new File(['x'], 'licence.png', { type: 'image/png' }))
        const uploading = buttons(/^Uploading\.\.\.$/)[0] as HTMLButtonElement
        expect(uploading).toBeTruthy()
        expect(uploading.disabled).toBe(true)
        expect((buttons(/Upload Vehicle RC/)[0] as HTMLButtonElement).disabled).toBe(false)
        await act(async () => {
            settle({ error: null })
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(q('img[alt="Licence"]')).not.toBeNull()
    })

    it('removing an uploaded licence restores the upload button', async () => {
        await gotoStep2()
        await pickFile(fileInputs()[0], new File(['x'], 'licence.png', { type: 'image/png' }))
        expect(q('button[aria-label="Remove driving licence photo"]')).not.toBeNull()
        await click(q('button[aria-label="Remove driving licence photo"]') as HTMLButtonElement)
        expect(q('img[alt="Licence"]')).toBeNull()
        expect(buttons(/Upload Driving Licence/)).toHaveLength(1)
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
