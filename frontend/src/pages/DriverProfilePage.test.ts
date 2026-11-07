import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression pin for the driver profile hub (route /driver/profile): the
// loading/empty/error states, the server-authoritative KYC badge, the
// profile health / info-card derivations, document links and every
// navigation action. Services, the auth store, the logger and the toast
// are mocked; no network and no real Supabase client is touched.

// FINDING 1 (P2, still true — docs/design-audit.md "Driver Profile" action
// map): "Account Center" (quick action), "Refresh Settings" (compliance
// card) and "Open Account Center" (not-found card) all navigate to
// /profile, which mounts the customer ProfilePage (App.tsx) and leaves the
// driver layout mid-session. The navigation tests below pin the current
// target so a fix has to update them deliberately.
// FINDING 2 (still true): a failed driver-profile fetch renders the same
// "Driver profile not found" card as a genuinely missing record — the only
// distinction is the error toast. There is no role="alert" load-error card
// and no Retry button (the driver dashboard page has both per
// docs/design-audit.md state-coverage notes).
// FINDING 3 (minor a11y gap): the loading spinner has no role="status" /
// aria-busy attributes that the audit standard set for sibling driver
// screens. The loading test pins that the spinner renders; it does not
// assert the missing semantics are correct.

const h = vi.hoisted(() => ({
    getByUserId: vi.fn(),
    getState: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    loggerError: vi.fn(),
    currentUser: { id: 'user-1', email: 'ravi@example.com', role: 'driver' } as
        | { id: string; email: string; role: string }
        | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/driverKycApi', () => ({ getState: h.getState }))

vi.mock('../services/supabaseApi', () => ({ driverSupabaseApi: { getByUserId: h.getByUserId } }))

vi.mock('../stores/authStore', () => ({ useAuthStore: () => ({ user: h.currentUser }) }))

vi.mock('../utils/logger', () => ({
    logger: { log: vi.fn(), warn: vi.fn(), error: h.loggerError, info: vi.fn() },
}))

import DriverProfilePage from './DriverProfilePage'
import type { DriverProfile } from '../services/supabaseApi'
import type { KycDocument, KycSubmissionState } from '../services/driverKycDocuments'

const PROFILE: DriverProfile = {
    id: 'drv-1',
    user_id: 'user-1',
    full_name: 'Ravi Kumar',
    phone: '+91 98765 43210',
    aadhaar_last4: '4321',
    pan_number: 'ABCDE1234F',
    date_of_birth: '1990-01-15',
    vehicle_type: 'eicher_14ft',
    rc_number: 'KA01AB1234',
    license_number: 'KA0120200001234',
    vehicle_capacity: 3000,
    dl_url: 'https://cdn.example.com/dl.pdf',
    rc_url: 'https://cdn.example.com/rc.pdf',
    insurance_url: null,
    selfie_url: null,
    bank_account: '****4321',
    ifsc_code: 'HDFC0001234',
    upi_id: 'ravi@upi',
    status: 'approved',
    rejection_reason: null,
    approved_by: 'admin-1',
    approved_at: '2026-10-01T00:00:00Z',
    home_city: 'Bengaluru',
    rating: 4.25,
    total_trips: 42,
    is_online: true,
    created_at: '2026-03-05T10:30:00.000Z',
    updated_at: '2026-10-02T00:00:00Z',
}

// Mirrors the KycSubmissionState the real driverKycApi.getState() resolves;
// the real (pure) kycProfileSummary in driverKycDocuments consumes it.
function kycStateWith(
    statuses: Partial<Record<KycDocument['kind'], KycDocument['status']>>,
    locked = false,
): KycSubmissionState {
    const docs = {} as KycSubmissionState['docs']
    for (const kind of ['rc_book', 'driving_license', 'aadhaar', 'truck_photo'] as const) {
        docs[kind] = {
            kind,
            status: statuses[kind] ?? 'pending',
            fileName: null,
            fileSizeBytes: null,
            fileType: null,
            progress: 0,
            rejectionReason: null,
            errorMessage: null,
            updatedAt: null,
        }
    }
    return {
        docs,
        submitted: false,
        submittedAt: null,
        locked,
        lockedAt: locked ? '2026-10-01T00:00:00Z' : null,
    }
}

let root: Root | null = null
let container: HTMLElement | null = null

function LocationProbe() {
    const location = useLocation()
    return createElement('div', { 'data-testid': 'location' }, location.pathname)
}

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/driver/profile'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/driver/profile', element: createElement(DriverProfilePage) }),
                    createElement(Route, { path: '*', element: createElement(LocationProbe) }),
                ),
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
    vi.useRealTimers()
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))
// InfoCard / Profile Health render <p>title</p><p>value</p> adjacently.
const cardValue = (title: string) =>
    Array.from((container as HTMLElement).querySelectorAll('p')).find((p) => p.textContent === title)
        ?.nextElementSibling?.textContent || ''

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('DriverProfilePage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.setSystemTime(new Date('2026-11-07T08:00:00Z'))
        document.title = ''
        h.currentUser = { id: 'user-1', email: 'ravi@example.com', role: 'driver' }
        h.getByUserId.mockResolvedValue(PROFILE)
        h.getState.mockResolvedValue(kycStateWith({}))
    })

    it('loading renders the spinner and no profile content while the fetch is pending', async () => {
        h.getByUserId.mockReturnValue(new Promise(() => {}))
        await mountPage()
        expect(q('.animate-spin')).not.toBeNull()
        expect(text()).not.toContain('Driver Profile Hub')
        expect(text()).not.toContain('Driver profile not found')
    })

    it('without a signed-in user it calls no API and renders the not-found card', async () => {
        h.currentUser = null
        await mountPage()
        expect(h.getByUserId).not.toHaveBeenCalled()
        expect(h.getState).not.toHaveBeenCalled()
        expect(text()).toContain('Driver profile not found')
    })

    it('a null profile renders the not-found card with both recovery actions', async () => {
        h.getByUserId.mockResolvedValue(null)
        await mountPage()
        expect(text()).toContain('Driver profile not found')
        expect(text()).toContain('does not have a linked driver record yet')
        expect(buttons(/Back To Driver Dashboard/)).toHaveLength(1)
        expect(buttons(/Open Account Center/)).toHaveLength(1)
    })

    it('Back To Driver Dashboard navigates to /driver/dashboard', async () => {
        h.getByUserId.mockResolvedValue(null)
        await mountPage()
        await click(buttons(/Back To Driver Dashboard/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/driver/dashboard')
    })

    it('Open Account Center navigates to /profile (cross-role link — see FINDING 1)', async () => {
        h.getByUserId.mockResolvedValue(null)
        await mountPage()
        await click(buttons(/Open Account Center/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/profile')
    })

    it('a failed fetch logs once, toasts the fixed message and falls back to the not-found card', async () => {
        h.getByUserId.mockRejectedValue(new Error('network down'))
        await mountPage()
        expect(h.loggerError).toHaveBeenCalledTimes(1)
        expect(h.loggerError.mock.calls[0][0]).toBe('[DriverProfilePage] loadProfile')
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('Failed to load driver profile')
        // FINDING 2: the error masquerades as the empty state; no Retry exists.
        expect(text()).toContain('Driver profile not found')
    })

    it('locked KYC state shows the Verified badge and getState is called exactly once', async () => {
        h.getState.mockResolvedValue(kycStateWith({}, true))
        await mountPage()
        expect(h.getState).toHaveBeenCalledTimes(1)
        expect(text()).toContain('Verified')
    })

    it('any rejected document shows the Action needed badge', async () => {
        h.getState.mockResolvedValue(kycStateWith({ driving_license: 'rejected' }))
        await mountPage()
        expect(text()).toContain('Action needed')
        expect(text()).not.toContain('Verified')
    })

    it('uploaded but unlocked documents show the Pending review badge', async () => {
        h.getState.mockResolvedValue(kycStateWith({ rc_book: 'pending_review', aadhaar: 'accepted' }))
        await mountPage()
        expect(text()).toContain('Pending review')
        expect(text()).not.toContain('Verified')
    })

    it('nothing uploaded yet shows no badge — the page does not invent a status', async () => {
        await mountPage()
        expect(h.getState).toHaveBeenCalledTimes(1)
        expect(text()).not.toMatch(/Verified|Action needed|Pending review/)
    })

    it('a getState failure is swallowed: no badge and no error toast', async () => {
        h.getState.mockRejectedValue(new Error('kyc backend unreachable'))
        await mountPage()
        expect(h.toastError).not.toHaveBeenCalled()
        expect(text()).not.toMatch(/Verified|Action needed|Pending review/)
    })

    it('renders the identity header, the document title and fetches with the signed-in user id', async () => {
        await mountPage()
        expect(h.getByUserId).toHaveBeenCalledTimes(1)
        expect(h.getByUserId).toHaveBeenCalledWith('user-1')
        expect(document.title).toBe('Driver Profile - TruckOpti')
        expect(text()).toContain('Driver Profile Hub')
        expect(text()).toContain('Ravi Kumar')
        expect(text()).toContain('Eicher 14ft (3T)')
        expect(text()).toContain('Bengaluru')
        expect(text()).toContain('approved')
        expect(cardValue('Profile Health')).toBe('100%')
    })

    it('unknown vehicle type falls back to the raw code; a missing city shows both placeholders', async () => {
        h.getByUserId.mockResolvedValue({ ...PROFILE, vehicle_type: 'custom_van', home_city: null })
        await mountPage()
        expect(text()).toContain('custom_van')
        expect(text()).not.toContain('Eicher 14ft (3T)')
        expect(text()).toContain('City not added')
        expect(text()).toContain('Home city missing')
    })

    it('info cards show trips, the one-decimal rating and the UPI payout', async () => {
        await mountPage()
        expect(cardValue('Trips Completed')).toBe('42')
        expect(cardValue('Rating')).toBe('4.3')
        expect(cardValue('Payment Setup')).toBe('ravi@upi')
    })

    it('null trips and rating render 0 and New; a missing payout renders Pending', async () => {
        h.getByUserId.mockResolvedValue({ ...PROFILE, rating: null, total_trips: null, upi_id: null, bank_account: null })
        await mountPage()
        expect(cardValue('Trips Completed')).toBe('0')
        expect(cardValue('Rating')).toBe('New')
        expect(cardValue('Payment Setup')).toBe('Pending')
    })

    it('a bank account without UPI renders Bank linked', async () => {
        h.getByUserId.mockResolvedValue({ ...PROFILE, upi_id: null })
        await mountPage()
        expect(cardValue('Payment Setup')).toBe('Bank linked')
    })

    it('profile health is the rounded percentage of completed fields (5 of 7 -> 71%)', async () => {
        h.getByUserId.mockResolvedValue({ ...PROFILE, home_city: null, rc_number: null })
        await mountPage()
        expect(cardValue('Profile Health')).toBe('71%')
    })

    it('document links show View hrefs for present documents and Missing for absent ones', async () => {
        await mountPage()
        const links = Array.from((container as HTMLElement).querySelectorAll('a'))
        expect(links.filter((a) => (a.textContent || '').includes('View'))).toHaveLength(2)
        const dl = links.find((a) => a.getAttribute('href') === 'https://cdn.example.com/dl.pdf')
        expect(dl?.getAttribute('target')).toBe('_blank')
        expect(dl?.getAttribute('rel')).toBe('noreferrer')
        expect(links.find((a) => a.getAttribute('href') === 'https://cdn.example.com/rc.pdf')).toBeDefined()
        expect(Array.from((container as HTMLElement).querySelectorAll('span')).filter((s) => s.textContent === 'Missing')).toHaveLength(2)
        expect(text()).toContain('Driving License')
        expect(text()).toContain('RC Book')
        expect(text()).toContain('Insurance')
        expect(text()).toContain('Selfie Verification')
    })

    it('a rejection reason renders the latest review note', async () => {
        h.getByUserId.mockResolvedValue({ ...PROFILE, status: 'rejected', rejection_reason: 'License photo blurry, re-upload' })
        await mountPage()
        expect(text()).toContain('Latest review note: License photo blurry, re-upload')
    })

    it('the joined date renders created_at in en-IN day/month/year order', async () => {
        await mountPage()
        expect(text()).toContain('Joined 5/3/2026')
    })

    it('the Account Center quick action navigates to /profile (cross-role link — see FINDING 1)', async () => {
        await mountPage()
        await click(buttons(/Account Center/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/profile')
    })

    it('the Earnings quick action navigates to /driver/earnings', async () => {
        await mountPage()
        await click(buttons(/Earnings/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/driver/earnings')
    })

    it('the Trip History quick action navigates to /driver/history', async () => {
        await mountPage()
        await click(buttons(/Trip History/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/driver/history')
    })

    it('Documents & KYC navigates to /driver/kyc', async () => {
        await mountPage()
        await click(buttons(/Documents & KYC/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/driver/kyc')
    })

    it('Refresh Settings navigates to /profile (cross-role link — see FINDING 1)', async () => {
        await mountPage()
        await click(buttons(/Refresh Settings/)[0])
        expect(q('[data-testid="location"]')?.textContent).toBe('/profile')
    })
})
