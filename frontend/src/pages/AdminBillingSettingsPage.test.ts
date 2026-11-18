import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    countUnsubscribed: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))
vi.mock('../services/adminSupabaseApi', () => ({
    adminBillingSettingsApi: {
        getSettings: h.getSettings,
        updateSettings: h.updateSettings,
        countApprovedAgenciesWithoutLiveSubscription: h.countUnsubscribed,
    },
}))

import AdminBillingSettingsPage, { validateBillingForm } from './AdminBillingSettingsPage'
import { UserFacingError } from '../utils/userFacingError'

const EMPTY = { legalName: null, gstin: null, address: null, stateCode: null, sacCode: '997331', enforcementEnabled: false, updatedAt: null }
const FILLED = {
    legalName: 'TruckOpti Technologies Pvt Ltd',
    gstin: '27AAAAA0000A1Z5',
    address: '1 MG Road, Pune',
    stateCode: '27',
    sacCode: '997331',
    enforcementEnabled: false,
    updatedAt: '2026-11-10T00:00:00Z',
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/admin/billing-settings'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/admin/billing-settings', element: createElement(AdminBillingSettingsPage) }),
                    createElement(Route, { path: '/admin', element: createElement('div', null, 'ADMIN-HOME') }),
                ),
            ),
        )
        await new Promise((r) => setTimeout(r, 0))
    })
}

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const input = (id: string) => q(`#${id}`) as HTMLInputElement & HTMLTextAreaElement
const button = (label: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).find((b) => label.test(b.textContent || '')) as HTMLButtonElement

async function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
    await act(async () => {
        const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}
async function click(el: HTMLElement) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}
async function submit() {
    await act(async () => {
        ;(q('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    h.getSettings.mockResolvedValue(FILLED)
    h.updateSettings.mockResolvedValue(undefined)
    h.countUnsubscribed.mockResolvedValue(3)
})

afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = null
    container?.remove()
    container = null
})

describe('validateBillingForm', () => {
    const ok = { legalName: 'A', gstin: '27AAAAA0000A1Z5', address: 'B', stateCode: '27', sacCode: '997331' }
    it('accepts a complete valid form', () => expect(validateBillingForm(ok)).toEqual({}))
    it('rejects a short GSTIN with its length', () => expect(validateBillingForm({ ...ok, gstin: '27AAAA' }).gstin).toContain('6 of 15'))
    it('rejects a lowercase or malformed GSTIN', () => expect(validateBillingForm({ ...ok, gstin: '27aaaaa0000a1z5' }).gstin).toBeTruthy())
    it('rejects state code 00, 39 and letters', () => {
        for (const s of ['00', '39', 'MH', '']) expect(validateBillingForm({ ...ok, stateCode: s }).stateCode).toBeTruthy()
    })
    it('flags a state code that differs from the GSTIN prefix', () =>
        expect(validateBillingForm({ ...ok, stateCode: '29' }).stateCode).toContain('first two digits'))
    it('requires non-blank legal name and address', () => {
        const e = validateBillingForm({ ...ok, legalName: '  ', address: ' ' })
        expect(e.legalName).toBeTruthy()
        expect(e.address).toBeTruthy()
    })
    it('requires a 6 to 8 digit SAC', () => {
        for (const s of ['12345', '123456789', 'abc123']) expect(validateBillingForm({ ...ok, sacCode: s }).sacCode).toBeTruthy()
        expect(validateBillingForm({ ...ok, sacCode: '99733100' }).sacCode).toBeUndefined()
    })
})

describe('AdminBillingSettingsPage', () => {
    it('shows a spinner while loading', async () => {
        h.getSettings.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('[data-testid="billing-loading"]')).not.toBeNull()
        expect(q('form')).toBeNull()
    })

    it('load error: shows the message and Retry, never an empty form', async () => {
        h.getSettings.mockRejectedValueOnce(new UserFacingError('Unable to load billing settings right now. Please try again.')).mockResolvedValueOnce(FILLED)
        await mountPage()
        expect(q('[data-testid="billing-load-error"]')).not.toBeNull()
        expect(q('form')).toBeNull()
        await click(button(/^Retry$/))
        expect(q('form')).not.toBeNull()
        expect(input('billing-gstin').value).toBe('27AAAAA0000A1Z5')
    })

    it('empty state: unconfigured row shows the not-set notice and the default SAC with the accountant note', async () => {
        h.getSettings.mockResolvedValue(EMPTY)
        await mountPage()
        expect(q('[data-testid="billing-empty"]')).not.toBeNull()
        expect(input('billing-sac').value).toBe('997331')
        expect(text()).toContain('Confirm with your accountant')
    })

    it('populates the form from the stored settings and hides the empty notice', async () => {
        await mountPage()
        expect(input('billing-legal-name').value).toBe(FILLED.legalName)
        expect(input('billing-address').value).toBe(FILLED.address)
        expect(input('billing-state').value).toBe('27')
        expect(q('[data-testid="billing-empty"]')).toBeNull()
    })

    it('uppercases the GSTIN, caps it at 15, and derives the state hint and value from its first two digits', async () => {
        h.getSettings.mockResolvedValue(EMPTY)
        await mountPage()
        await setValue(input('billing-gstin'), '27aaaaa0000a1z5extra')
        expect(input('billing-gstin').value).toBe('27AAAAA0000A1Z5')
        expect(input('billing-state').value).toBe('27')
        expect(q('[data-testid="billing-state-hint"]')?.textContent).toContain('27 (Maharashtra)')
    })

    it('stops following the GSTIN once the state code is edited by hand', async () => {
        h.getSettings.mockResolvedValue(EMPTY)
        await mountPage()
        await setValue(input('billing-state'), '29')
        await setValue(input('billing-gstin'), '27AAAAA0000A1Z5')
        expect(input('billing-state').value).toBe('29')
    })

    it('live GSTIN message appears at 15 characters when invalid, with aria-invalid', async () => {
        h.getSettings.mockResolvedValue(EMPTY)
        await mountPage()
        await setValue(input('billing-gstin'), '27AAAAA0000A1Z!')
        expect(q('#billing-gstin-error')?.textContent).toContain('not a valid GSTIN')
        expect(input('billing-gstin').getAttribute('aria-invalid')).toBe('true')
    })

    it('submit with invalid values shows field errors and does not call the service', async () => {
        h.getSettings.mockResolvedValue(EMPTY)
        await mountPage()
        await submit()
        expect(h.updateSettings).not.toHaveBeenCalled()
        expect(text()).toContain('Enter the legal name')
        expect(text()).toContain('Enter the 15-character GSTIN')
        expect(text()).toContain('Enter the registered address')
    })

    it('submit with a mismatching state code shows the mismatch message', async () => {
        await mountPage()
        await setValue(input('billing-state'), '29')
        await submit()
        expect(h.updateSettings).not.toHaveBeenCalled()
        expect(text()).toContain('must match the first two digits')
    })

    it('saves trimmed values, toasts success and shows the saved status', async () => {
        await mountPage()
        await setValue(input('billing-legal-name'), '  Acme Pvt Ltd  ')
        await submit()
        expect(h.updateSettings).toHaveBeenCalledWith({
            legalName: 'Acme Pvt Ltd',
            gstin: '27AAAAA0000A1Z5',
            address: '1 MG Road, Pune',
            stateCode: '27',
            sacCode: '997331',
        })
        expect(h.toastSuccess).toHaveBeenCalledWith('Billing settings saved.')
        expect(q('[data-testid="billing-saved"]')).not.toBeNull()
    })

    it('a typed server error is shown inline and toasted, and no saved status appears', async () => {
        h.updateSettings.mockRejectedValue(new UserFacingError('The state code must match the first two digits of the GSTIN.'))
        await mountPage()
        await submit()
        expect(q('[data-testid="billing-save-error"]')?.textContent).toContain('must match the first two digits')
        expect(h.toastError).toHaveBeenCalled()
        expect(q('[data-testid="billing-saved"]')).toBeNull()
    })

    it('a raw error falls back to a safe message and leaks nothing', async () => {
        h.updateSettings.mockRejectedValue(new Error('pg: relation leaked'))
        await mountPage()
        await submit()
        expect(text()).toContain('Billing settings could not be saved. Please try again.')
        expect(text()).not.toContain('leaked')
    })

    it('disables Save while saving', async () => {
        h.updateSettings.mockReturnValue(new Promise(() => {}))
        await mountPage()
        await submit()
        expect(button(/Saving/).disabled).toBe(true)
    })

    it('danger section is read-only: shows the value and launch text, and has no toggle or switch', async () => {
        await mountPage()
        const danger = q('[data-testid="billing-danger"]') as HTMLElement
        expect(danger.textContent).toContain('Enforcement is currently OFF.')
        expect(danger.textContent).toContain('Turning enforcement on is a launch step: see docs/STAGING-SMOKE-CHECKLIST.md')
        expect(danger.querySelector('input, button, [role="switch"]')).toBeNull()
    })

    it('danger section shows ON when enforcement is enabled', async () => {
        h.getSettings.mockResolvedValue({ ...FILLED, enforcementEnabled: true })
        await mountPage()
        expect(q('[data-testid="billing-enforcement-value"]')?.textContent).toContain('ON')
    })

    it('shows the count of approved agencies without a live subscription', async () => {
        await mountPage()
        expect(q('[data-testid="billing-unsubscribed"]')?.textContent).toContain('3 approved agencies have no live subscription')
    })

    it('an unavailable agency count never blocks the form', async () => {
        h.countUnsubscribed.mockRejectedValue(new Error('x'))
        await mountPage()
        expect(q('[data-testid="billing-unsubscribed"]')?.textContent).toContain('unavailable')
        expect(q('form')).not.toBeNull()
    })

    it('inputs and buttons carry 44px minimum targets', async () => {
        await mountPage()
        for (const id of ['billing-legal-name', 'billing-gstin', 'billing-state', 'billing-sac']) {
            expect(input(id).className).toContain('min-h-[44px]')
        }
        expect(button(/Save billing settings/).className).toContain('min-h-[44px]')
    })

    it('every field has an associated label', async () => {
        await mountPage()
        for (const id of ['billing-legal-name', 'billing-gstin', 'billing-address', 'billing-state', 'billing-sac']) {
            expect(q(`label[for="${id}"]`)).not.toBeNull()
        }
    })

    it('the back button navigates to /admin', async () => {
        await mountPage()
        await click(q('button[aria-label="Back to admin dashboard"]') as HTMLElement)
        expect(text()).toContain('ADMIN-HOME')
    })
})
