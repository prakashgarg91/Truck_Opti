import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// CompanyProfilePage: an agency owner's GST identity must be loaded from and saved to the agency row
// (agency_identity_update), not the login metadata. Non-agency users keep the metadata-only behaviour.

const h = vi.hoisted(() => ({
    load: vi.fn(),
    save: vi.fn(),
    updateUser: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    user: { id: 'u-1', user_metadata: { company: { pan: 'ABCDE1234F', email: 'a@b.in', city: 'OldCity' } } } as unknown,
    isAgencyOwner: undefined as boolean | undefined,
    snapshot: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { updateUser: h.updateUser } } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => ({ user: h.user, isAgencyOwner: h.isAgencyOwner }) }))
vi.mock('../utils/logger', () => ({ logger: { log: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('../components/BackupSection', () => ({ default: () => null }))
vi.mock('../services/agencyIdentityApi', () => ({ agencyIdentityApi: { load: h.load, save: h.save } }))
vi.mock('../services/agencyPortalApi', () => ({ agencyDashboardApi: { getSnapshot: h.snapshot } }))

import CompanyProfilePage from './CompanyProfilePage'
import { UserFacingError } from '../utils/userFacingError'

const ROW = {
    agencyId: 'a-1', status: 'approved', legalName: 'Sethi Roadlines', gstin: '08ABCDE1234F1Z5', phone: '9829011111',
    address: '5 MI Road', state: 'Rajasthan', city: 'Jaipur', pincode: '302001', updatedAt: '2026-11-18T10:00:00.1+00:00',
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mount() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(CompanyProfilePage))
        await new Promise((r) => setTimeout(r, 0))
    })
}

const input = (id: string) => container!.querySelector(`#${id}`) as HTMLInputElement
async function type(id: string, value: string) {
    const el = input(id)
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
    })
}
async function clickSave() {
    const btn = Array.from(container!.querySelectorAll('button')).find((b) => /Save Company Profile/.test(b.textContent || ''))!
    await act(async () => {
        btn.click()
        await new Promise((r) => setTimeout(r, 0))
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    h.updateUser.mockResolvedValue({ error: null })
    h.user = { id: 'u-1', user_metadata: { company: { pan: 'ABCDE1234F', email: 'a@b.in', city: 'OldCity' } } }
    h.isAgencyOwner = undefined
    h.snapshot.mockResolvedValue({ agency: null, summary: {} })
})

afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = null
    container?.remove()
    container = null
})

describe('CompanyProfilePage agency staff access', () => {
    it('an agency staff member sees the agency identity read-only with the owner-only note, and no form or save', async () => {
        h.isAgencyOwner = false
        h.snapshot.mockResolvedValue({
            agency: { id: 'a-1', company_name: 'Sethi Roadlines', status: 'approved', rating: null, total_jobs: null, fleet_size: null, city: 'Jaipur', gstin: '08ABCDE1234F1Z5' },
            summary: {},
        })
        await mount()
        const note = container!.querySelector('[data-testid="staff-readonly-note"]')
        expect(note?.textContent).toBe('Only the agency owner can change these details.')
        const text = container!.textContent || ''
        expect(text).toContain('Sethi Roadlines')
        expect(text).toContain('08ABCDE1234F1Z5')
        expect(text).toContain('Jaipur')
        expect(container!.querySelectorAll('input').length).toBe(0)
        expect(Array.from(container!.querySelectorAll('button')).some((b) => /Save/.test(b.textContent || ''))).toBe(false)
        expect(h.load).not.toHaveBeenCalled()
        expect(h.updateUser).not.toHaveBeenCalled()
    })

    it('a staff load failure shows the error with Retry that reloads the read-only view', async () => {
        h.isAgencyOwner = false
        h.snapshot.mockRejectedValueOnce(new UserFacingError('Failed to load company details'))
        await mount()
        expect(container!.querySelector('[role="alert"]')?.textContent).toContain('Failed to load company details')
        h.snapshot.mockResolvedValueOnce({ agency: { id: 'a-1', company_name: 'Sethi Roadlines', status: 'approved', rating: null, total_jobs: null, fleet_size: null, city: null, gstin: null }, summary: {} })
        await act(async () => {
            Array.from(container!.querySelectorAll('button')).find((b) => b.textContent === 'Retry')!.click()
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(container!.textContent || '').toContain('Sethi Roadlines')
        expect(container!.querySelector('[data-testid="staff-readonly-note"]')).not.toBeNull()
    })

    it('the agency owner keeps the editable profile form and save button', async () => {
        h.isAgencyOwner = true
        h.load.mockResolvedValue(ROW)
        await mount()
        expect(container!.querySelector('[data-testid="staff-readonly-note"]')).toBeNull()
        expect(input('company-name')).not.toBeNull()
        expect(Array.from(container!.querySelectorAll('button')).some((b) => /Save Company Profile/.test(b.textContent || ''))).toBe(true)
        expect(h.snapshot).not.toHaveBeenCalled()
    })
})

describe('CompanyProfilePage', () => {
    it('loads the GST identity from the agency row, not the login metadata', async () => {
        h.load.mockResolvedValue(ROW)
        await mount()
        expect(h.load).toHaveBeenCalledWith('u-1')
        expect(input('company-name').value).toBe('Sethi Roadlines')
        expect(input('company-gstin').value).toBe('08ABCDE1234F1Z5')
        expect(input('company-phone').value).toBe('9829011111')
        expect(input('company-state').value).toBe('Rajasthan')
        expect(input('company-pan').value).toBe('ABCDE1234F')
        expect(container!.querySelector('[data-testid="agency-identity-note"]')).not.toBeNull()
    })

    it('saves through agency_identity_update with the loaded version and mirrors PAN to metadata', async () => {
        h.load.mockResolvedValue(ROW)
        h.save.mockResolvedValue({ ok: true, identity: { ...ROW, phone: '9829022222', updatedAt: '2026-11-18T10:05:00.1+00:00' } })
        await mount()
        await type('company-phone', '98290 22222')
        await clickSave()
        expect(h.save).toHaveBeenCalledWith(expect.objectContaining({
            legalName: 'Sethi Roadlines', gstin: '08ABCDE1234F1Z5', phone: '98290 22222', address: '5 MI Road',
            state: 'Rajasthan', expectedUpdatedAt: '2026-11-18T10:00:00.1+00:00',
        }))
        expect(h.updateUser).toHaveBeenCalledTimes(1)
        expect(h.toastSuccess).toHaveBeenCalled()
    })

    it('shows the typed message and does not touch metadata when the command refuses', async () => {
        h.load.mockResolvedValue(ROW)
        h.save.mockResolvedValue({ ok: false, error: 'gstin_state_mismatch', message: 'The first two digits of the GSTIN do not match the selected state.' })
        await mount()
        await clickSave()
        expect(h.toastError).toHaveBeenCalledWith('The first two digits of the GSTIN do not match the selected state.')
        expect(h.updateUser).not.toHaveBeenCalled()
        expect(h.toastSuccess).not.toHaveBeenCalled()
    })

    it('rejects a short phone before calling the server for an agency owner', async () => {
        h.load.mockResolvedValue(ROW)
        await mount()
        await type('company-phone', '12345')
        await clickSave()
        expect(h.save).not.toHaveBeenCalled()
        expect(h.toastError).toHaveBeenCalledWith('Enter a phone number with at least 10 digits')
    })

    it('a user without an agency keeps the metadata-only behaviour', async () => {
        h.load.mockResolvedValue(null)
        h.user = { id: 'u-2', user_metadata: { company: { name: 'Solo Co', pan: 'ABCDE1234F', gstin: '', phone: '' } } }
        await mount()
        expect(input('company-name').value).toBe('Solo Co')
        expect(container!.querySelector('[data-testid="agency-identity-note"]')).toBeNull()
        await clickSave()
        expect(h.save).not.toHaveBeenCalled()
        expect(h.updateUser).toHaveBeenCalledTimes(1)
    })

    it('shows an error with Retry when the agency row cannot be read, then recovers', async () => {
        h.load.mockRejectedValueOnce(new UserFacingError('Failed to load company details'))
        await mount()
        expect(container!.querySelector('[role="alert"]')?.textContent).toContain('Failed to load company details')
        h.load.mockResolvedValueOnce(ROW)
        const retry = Array.from(container!.querySelectorAll('button')).find((b) => b.textContent === 'Retry')!
        await act(async () => {
            retry.click()
            await new Promise((r) => setTimeout(r, 0))
        })
        expect(container!.querySelector('[role="alert"]')).toBeNull()
        expect(input('company-name').value).toBe('Sethi Roadlines')
    })
})
