import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pin for the current behaviour of AgencyRegisterPage (4-step
// agency registration wizard). The page is a purely local form: it loads no
// data, so it has no loading/empty/Retry states to cover. The state coverage
// maps instead to: anonymous gate (access state), per-step validation denials
// with exact toast messages, submit error + manual re-submit (retry path),
// pending-submit disabled state, and the aria-label="Go back" hook.
//
// FINDING (real page bug — NOT fixed, NOT asserted as correct):
// frontend/src/pages/AgencyRegisterPage.tsx line 76 validates the GSTIN
// against a regex that only accepts uppercase letters, but tests `form.gstin`
// RAW. The input is displayed uppercase (style textTransform: 'uppercase')
// and the submit payload normalizes it (`form.gstin.toUpperCase().trim()`),
// and PAN (line 80) and IFSC (line 92) are both uppercased before their
// regex test — GSTIN is not. A user who types the GSTIN in lowercase sees it
// rendered uppercase in the box yet is rejected with "Enter a valid 15-digit
// GSTIN". These tests use canonical uppercase GSTINs and deliberately avoid
// pinning the strict lowercase rejection as correct behaviour.

const h = vi.hoisted(() => ({
    user: null as { id: string; email: string; name: string } | null,
    register: vi.fn(),
    updateUser: vi.fn(),
    storeAuthReturnTo: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    loggerError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/agencyPortalApi', () => ({
    agencyRegistrationApi: { register: h.register },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.user, updateUser: h.updateUser }),
}))

vi.mock('../utils/authReturnTo', () => ({ storeAuthReturnTo: h.storeAuthReturnTo }))

vi.mock('../utils/logger', () => ({ logger: { error: h.loggerError } }))

import AgencyRegisterPage from './AgencyRegisterPage'

const USER = { id: 'user-77', email: 'owner@sharma.in', name: 'Ramesh Sharma' }

function LocationProbe() {
    const location = useLocation()
    return createElement('div', { 'data-testid': 'location-probe' }, `${location.pathname}${location.search}`)
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
                { initialEntries: ['/agency/register'] },
                createElement(AgencyRegisterPage),
                createElement(LocationProbe),
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
    document.title = ''
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))
const probe = () => q('[data-testid="location-probe"]')?.textContent || ''
const field = (ph: string) =>
    (container as HTMLElement).querySelector(`input[placeholder="${ph}"]`) as HTMLInputElement | null

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
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

const STEP1 = { company: 'Sharma Transport Co.', gstin: '', license: 'TR/2024/12345', pan: 'ABCDE1234F' }
const STEP2 = {
    contact: 'Ramesh Sharma', phone: '9876543210', email: '', address: '',
    city: 'Mumbai', pincode: '', state: 'Maharashtra', fleet: '', routes: '',
}
const STEP3 = { bank: '123456789012', ifsc: 'SBIN0001234' }

async function fillStep1(v: Partial<typeof STEP1> = {}) {
    const val = { ...STEP1, ...v }
    await type(field('Sharma Transport Co.') as HTMLInputElement, val.company)
    await type(field('22AAAAA0000A1Z5') as HTMLInputElement, val.gstin)
    await type(field('TR/2024/12345') as HTMLInputElement, val.license)
    await type(field('ABCDE1234F') as HTMLInputElement, val.pan)
}

async function fillStep2(v: Partial<typeof STEP2> = {}) {
    const val = { ...STEP2, ...v }
    await type(field('Ramesh Sharma') as HTMLInputElement, val.contact)
    await type(field('9876543210') as HTMLInputElement, val.phone)
    await type(field('agency@example.com') as HTMLInputElement, val.email)
    await type(field('123 Transport Nagar') as HTMLInputElement, val.address)
    await type(field('Mumbai') as HTMLInputElement, val.city)
    await type(field('400001') as HTMLInputElement, val.pincode)
    await type(q('select') as HTMLSelectElement, val.state)
    await type(field('10') as HTMLInputElement, val.fleet)
    await type(field('Mumbai–Pune, Delhi–Agra') as HTMLInputElement, val.routes)
}

async function fillStep3(v: Partial<typeof STEP3> = {}) {
    const val = { ...STEP3, ...v }
    await type(field('123456789012') as HTMLInputElement, val.bank)
    await type(field('SBIN0001234') as HTMLInputElement, val.ifsc)
}

async function advance() {
    await click(buttons(/Continue/)[0])
}

/** Fill steps 1 and 2 validly and land on step 3. */
async function reachStep3(step2: Partial<typeof STEP2> = {}) {
    await fillStep1()
    await advance()
    await fillStep2(step2)
    await advance()
}

describe('AgencyRegisterPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.user = USER
        h.register.mockResolvedValue(undefined)
    })

    it('logged-out visitors get the login gate instead of the form', async () => {
        h.user = null
        await mountPage()
        expect(text()).toContain('Log In To Register Your Agency')
        expect(buttons(/^Continue To Agency Login$/)).toHaveLength(1)
        expect(text()).not.toContain('Business Details')
        expect(h.register).not.toHaveBeenCalled()
        expect(h.updateUser).not.toHaveBeenCalled()
    })

    it('the login gate stores the return-to path and routes to agency login', async () => {
        h.user = null
        await mountPage()
        await click(buttons(/^Continue To Agency Login$/)[0])
        expect(h.storeAuthReturnTo).toHaveBeenCalledWith('/agency/register')
        expect(probe()).toBe('/login?mode=agency')
    })

    it('mounting sets the document title', async () => {
        await mountPage()
        expect(document.title).toBe('Agency Registration - TruckOpti')
    })

    it('step 1 renders the business form with the four step indicators', async () => {
        await mountPage()
        expect(text()).toContain('Business Details')
        for (const label of ['Company Name', 'GSTIN', 'Transport License Number', 'PAN Number']) {
            expect(text()).toContain(label)
        }
        // step indicators
        for (const label of ['Business', 'Contact', 'Bank', 'Done']) {
            expect(text()).toContain(label)
        }
        expect(buttons(/^Continue$/)).toHaveLength(1)
        expect(buttons(/^Back$/)).toHaveLength(0)
    })

    it('step 1 blocks Continue without a company name', async () => {
        await mountPage()
        await fillStep1({ company: '' })
        await advance()
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Enter company name')
        expect(text()).toContain('Business Details')
        expect(text()).not.toContain('Contact & Address')
        expect(h.register).not.toHaveBeenCalled()
    })

    it('step 1 blocks a malformed PAN with the exact message', async () => {
        await mountPage()
        await fillStep1({ pan: 'AB1' })
        await advance()
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid PAN number (e.g. ABCDE1234F)')
        expect(text()).toContain('Business Details')
    })

    it('step 1 accepts a lowercase, padded PAN because validation normalizes it', async () => {
        await mountPage()
        await fillStep1({ pan: ' abcde1234f ' })
        await advance()
        expect(h.toastError).not.toHaveBeenCalled()
        expect(text()).toContain('Contact & Address')
    })

    it('step 1 blocks a missing transport license', async () => {
        await mountPage()
        await fillStep1({ license: '' })
        await advance()
        expect(h.toastError).toHaveBeenCalledWith('Enter transport license number')
        expect(text()).toContain('Business Details')
    })

    it('step 1 blocks a malformed GSTIN', async () => {
        await mountPage()
        await fillStep1({ gstin: '22AAAAA0000A1Z' })
        await advance()
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid 15-digit GSTIN')
        expect(text()).toContain('Business Details')
    })

    it('step 2 blocks a missing contact person name', async () => {
        await mountPage()
        await fillStep1()
        await advance()
        await fillStep2({ contact: '' })
        await advance()
        expect(h.toastError).toHaveBeenCalledWith('Enter contact person name')
        expect(text()).toContain('Contact & Address')
        expect(text()).not.toContain('Bank Details')
    })

    it('step 2 blocks a phone that is not exactly 10 digits', async () => {
        await mountPage()
        await fillStep1()
        await advance()
        await fillStep2({ phone: '98765' })
        await advance()
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid 10-digit phone')
        expect(text()).toContain('Contact & Address')
    })

    it('step 2 blocks submission without a selected state', async () => {
        await mountPage()
        await fillStep1()
        await advance()
        await fillStep2({ state: '' })
        await advance()
        expect(h.toastError).toHaveBeenCalledWith('Select state')
        expect(text()).toContain('Contact & Address')
    })

    it('step 3 blocks an empty bank account number', async () => {
        await mountPage()
        await reachStep3()
        await fillStep3({ bank: '' })
        await click(buttons(/^Submit Application$/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Enter bank account number')
        expect(text()).toContain('Bank Details')
        expect(h.register).not.toHaveBeenCalled()
    })

    it('step 3 blocks a malformed IFSC code', async () => {
        await mountPage()
        await reachStep3()
        await fillStep3({ ifsc: 'SBIN1234' })
        await click(buttons(/^Submit Application$/)[0])
        expect(h.toastError).toHaveBeenCalledWith('Enter a valid IFSC code (e.g. SBIN0001234)')
        expect(text()).toContain('Bank Details')
        expect(h.register).not.toHaveBeenCalled()
    })

    it('a full form submits the exact normalized payload', async () => {
        await mountPage()
        await fillStep1({ company: '  Sharma Transport Co.  ', gstin: '22AAAAA0000A1Z5', pan: ' abcde1234f ' })
        await advance()
        await fillStep2({
            contact: '  Ramesh Sharma  ', email: '  agency@example.com  ',
            address: '  123 Transport Nagar  ', city: '  Mumbai  ',
            pincode: '400001', fleet: '12', routes: 'Mumbai–Pune, Delhi–Agra',
        })
        await advance()
        await fillStep3({ bank: ' 123456789012 ', ifsc: 'sbin0001234' })
        await click(buttons(/^Submit Application$/)[0])

        expect(h.register).toHaveBeenCalledTimes(1)
        expect(h.register).toHaveBeenCalledWith({
            user_id: 'user-77',
            company_name: 'Sharma Transport Co.',
            gstin: '22AAAAA0000A1Z5',
            transport_license: 'TR/2024/12345',
            pan_number: 'ABCDE1234F',
            contact_name: 'Ramesh Sharma',
            contact_phone: '9876543210',
            contact_email: 'agency@example.com',
            address: '123 Transport Nagar',
            city: 'Mumbai',
            state: 'Maharashtra',
            pincode: '400001',
            fleet_size: 12,
            operating_routes: 'Mumbai–Pune, Delhi–Agra',
            bank_account: '123456789012',
            ifsc_code: 'SBIN0001234',
            status: 'pending',
        })
    })

    it('empty optional fields submit as null and fleet_size as 0', async () => {
        await mountPage()
        await fillStep1({ company: 'Speedy Logistics', license: 'TR/1', pan: 'AAAAA9999A' })
        await advance()
        await fillStep2({ contact: 'Asha Verma', phone: '9999999999', city: 'Pune', state: 'Goa' })
        await advance()
        await fillStep3({ bank: '1', ifsc: 'HDFC0000042' })
        await click(buttons(/^Submit Application$/)[0])

        expect(h.register).toHaveBeenCalledWith({
            user_id: 'user-77',
            company_name: 'Speedy Logistics',
            gstin: null,
            transport_license: 'TR/1',
            pan_number: 'AAAAA9999A',
            contact_name: 'Asha Verma',
            contact_phone: '9999999999',
            contact_email: null,
            address: null,
            city: 'Pune',
            state: 'Goa',
            pincode: null,
            fleet_size: 0,
            operating_routes: null,
            bank_account: '1',
            ifsc_code: 'HDFC0000042',
            status: 'pending',
        })
    })

    it('success promotes the local role to agency and opens the portal screen', async () => {
        await mountPage()
        await reachStep3()
        await fillStep3()
        await click(buttons(/^Submit Application$/)[0])

        expect(h.updateUser).toHaveBeenCalledTimes(1)
        expect(h.updateUser).toHaveBeenCalledWith({ role: 'agency' })
        expect(text()).toContain('Registration Submitted!')
        expect(text()).toContain('under review')
        // step 4 hides the wizard chrome
        expect(buttons(/^Continue$/)).toHaveLength(0)
        expect(buttons(/^Back$/)).toHaveLength(0)

        await click(buttons(/^Open Agency Portal$/)[0])
        expect(probe()).toBe('/agency/dashboard')
    })

    it('a rejected registration logs, toasts once per attempt, stays on step 3 and allows a retry', async () => {
        const boom = new Error('insert failed')
        h.register.mockRejectedValue(boom)
        await mountPage()
        await reachStep3()
        await fillStep3()
        await click(buttons(/^Submit Application$/)[0])

        expect(h.register).toHaveBeenCalledTimes(1)
        expect(h.loggerError).toHaveBeenCalledWith('[AgencyRegisterPage]', boom)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Registration failed. Please try again.')
        expect(text()).toContain('Bank Details')
        expect(h.updateUser).not.toHaveBeenCalled()
        const submit = buttons(/^Submit Application$/)[0] as HTMLButtonElement
        expect(submit.disabled).toBe(false)

        await click(submit)
        expect(h.register).toHaveBeenCalledTimes(2)
        expect(h.toastError).toHaveBeenCalledTimes(2)
        expect(text()).toContain('Bank Details')
    })

    it('the submit button is disabled and reads Submitting... while the request is pending', async () => {
        let resolveRegister!: () => void
        h.register.mockImplementation(
            () => new Promise<void>((res) => { resolveRegister = res }),
        )
        await mountPage()
        await reachStep3()
        await fillStep3()
        await click(buttons(/^Submit Application$/)[0])

        const pending = buttons(/Submitting\.\.\./)[0] as HTMLButtonElement
        expect(pending).toBeTruthy()
        expect(pending.disabled).toBe(true)
        expect(h.updateUser).not.toHaveBeenCalled()

        await act(async () => {
            resolveRegister()
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(h.updateUser).toHaveBeenCalledWith({ role: 'agency' })
        expect(text()).toContain('Registration Submitted!')
    })

    it('Back returns from step 2 to step 1 and keeps the entered data', async () => {
        await mountPage()
        await fillStep1()
        await advance()
        expect(text()).toContain('Contact & Address')
        await click(buttons(/^Back$/)[0])
        expect(text()).toContain('Business Details')
        expect((field('Sharma Transport Co.') as HTMLInputElement).value).toBe('Sharma Transport Co.')
        expect(h.toastError).not.toHaveBeenCalled()
    })

    it('the header Go back button steps backward inside the wizard', async () => {
        await mountPage()
        await fillStep1()
        await advance()
        await click(q('button[aria-label="Go back"]') as HTMLButtonElement)
        expect(text()).toContain('Business Details')
    })

    it('the header Go back button on step 1 routes to agency login', async () => {
        await mountPage()
        await click(q('button[aria-label="Go back"]') as HTMLButtonElement)
        expect(probe()).toBe('/login?mode=agency')
    })
})
