/**
 * TO-128 — component tests for the admin KYC review section on
 * DriverDetailPage. The page is exercised through react-dom (no Testing
 * Library in this repo) with the driver-kyc and admin APIs mocked, so
 * every assertion proves the screen renders/acts per the server contract:
 * outcomes come only from the backend, review goes only through
 * reviewDocument, and approving with incomplete KYC is a documented,
 * explicit decision.
 */
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import {
    KYC_DOC_KINDS,
    createInitialKycState,
    type KycDocKind,
    type KycDocument,
} from '../services/driverKycDocuments'
import type { KycApiSubmissionState } from '../services/driverKycApi'
import type { AdminDriverProfile } from '../services/adminSupabaseApi'
import { UserFacingError } from '../utils/userFacingError'

const getDriverKycStateMock = vi.hoisted(() => vi.fn())
const reviewDocumentMock = vi.hoisted(() => vi.fn())
const getDocumentAccessUrlMock = vi.hoisted(() => vi.fn())
const adminApi = vi.hoisted(() => ({
    getDriverById: vi.fn(),
    approveDriver: vi.fn(),
    rejectDriver: vi.fn(),
    suspendDriver: vi.fn(),
    getDriversByStatus: vi.fn(),
}))

vi.mock('../services/driverKycApi', () => ({
    getDriverKycState: getDriverKycStateMock,
    reviewDocument: reviewDocumentMock,
    getDocumentAccessUrl: getDocumentAccessUrlMock,
}))

vi.mock('../services/adminSupabaseApi', () => ({
    adminSupabaseApi: adminApi,
}))

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}))

import toast from 'react-hot-toast'
import DriverDetailPage from './DriverDetailPage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const AT = '2026-10-03T08:00:00.000Z'
const DRIVER_ID = 'd1d1d1d1-2222-4333-8444-555555555555'
const SIGNED_URL = 'https://signed.test/driver-docs/short-lived?token=abc'

const DRIVER: AdminDriverProfile = {
    id: DRIVER_ID,
    user_id: 'uuuuuuuu-1111-4222-8333-444444444444',
    full_name: 'Battery Driver',
    phone: '+911234567890',
    aadhaar_last4: '1234',
    pan_number: 'ABCDE1234F',
    date_of_birth: '1990-01-01',
    vehicle_type: 'tata_407',
    rc_number: 'RC1234',
    license_number: 'DL1234',
    vehicle_capacity: 1,
    dl_url: null,
    rc_url: null,
    insurance_url: null,
    selfie_url: null,
    bank_account: null,
    ifsc_code: null,
    upi_id: null,
    status: 'pending',
    rejection_reason: null,
    approved_by: null,
    approved_at: null,
    home_city: 'Pune',
    rating: 4.5,
    total_trips: 3,
    is_online: false,
    created_at: AT,
    updated_at: AT,
}

function kycApiState(opts: {
    versions?: Partial<Record<KycDocKind, number>>
    docs?: Partial<Record<KycDocKind, Partial<KycDocument>>>
    locked?: boolean
} = {}): KycApiSubmissionState {
    const state = createInitialKycState() as KycApiSubmissionState
    state.versions = { rc_book: 0, driving_license: 0, aadhaar: 0, truck_photo: 0 }
    for (const kind of KYC_DOC_KINDS) {
        state.versions[kind] = opts.versions?.[kind] ?? 0
        if (opts.docs?.[kind]) {
            state.docs[kind] = { ...state.docs[kind], ...opts.docs[kind] }
        }
    }
    state.locked = opts.locked ?? false
    return state
}

/** Mixed submission: rc accepted (v2), licence pending review, aadhaar rejected, truck missing. */
function mixedState(): KycApiSubmissionState {
    return kycApiState({
        versions: { rc_book: 2, driving_license: 1, aadhaar: 1, truck_photo: 0 },
        docs: {
            rc_book: { status: 'accepted', fileName: 'rc.pdf', fileSizeBytes: 2048, fileType: 'application/pdf', updatedAt: AT, reviewedAt: AT },
            driving_license: { status: 'pending_review', fileName: 'licence.jpg', fileSizeBytes: 4096, fileType: 'image/jpeg', updatedAt: AT },
            aadhaar: { status: 'rejected', rejectionReason: 'Both sides not readable', fileName: 'aadhaar.jpg', fileSizeBytes: 1024, fileType: 'image/jpeg', updatedAt: AT, reviewedAt: AT },
        },
    })
}

let root: Root | null = null
let container: HTMLElement | null = null

async function renderPage() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: [`/admin/drivers/${DRIVER_ID}`] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/admin/drivers/:id', element: createElement(DriverDetailPage) }),
                ),
            ),
        )
    })
    return container
}

function bodyText(): string {
    return document.body.textContent ?? ''
}

function findButton(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(label))
}

function docSection(kind: KycDocKind): HTMLElement | null {
    return document.getElementById(`kyc-admin-doc-${kind}`)
}

async function clickButton(label: string) {
    const button = findButton(label)
    if (!button) throw new Error(`button not found: ${label}`)
    await act(async () => {
        button.click()
    })
}

beforeEach(() => {
    vi.mocked(toast.success).mockClear()
    vi.mocked(toast.error).mockClear()
    adminApi.getDriverById.mockResolvedValue({ ...DRIVER })
    adminApi.approveDriver.mockResolvedValue({ ...DRIVER, status: 'approved' })
    getDriverKycStateMock.mockResolvedValue(mixedState())
    reviewDocumentMock.mockResolvedValue(mixedState())
    getDocumentAccessUrlMock.mockResolvedValue({ url: SIGNED_URL, expiresIn: 60, kind: 'rc_book', version: 2, status: 'accepted' })
})

afterEach(async () => {
    await act(async () => {
        root?.unmount()
    })
    container?.remove()
    root = null
    container = null
})

describe('DriverDetailPage KYC review (TO-128)', () => {
    it('loads and renders the server-authoritative per-document outcomes', async () => {
        await renderPage()

        expect(getDriverKycStateMock).toHaveBeenCalledWith(DRIVER_ID)
        const rc = docSection('rc_book')
        expect(rc?.textContent).toContain('Accepted')
        expect(rc?.textContent).toContain('v2')
        expect(docSection('driving_license')?.textContent).toContain('Pending review')
        const aadhaar = docSection('aadhaar')
        expect(aadhaar?.textContent).toContain('Review Needed')
        expect(aadhaar?.textContent).toContain('Both sides not readable')
        expect(bodyText()).toContain('1 of 4 accepted')
        // Missing document is reported honestly as not uploaded.
        expect(docSection('truck_photo')?.textContent).toContain('No document uploaded yet')
    })

    it('accept goes through reviewDocument with the server version and adopts the returned state', async () => {
        const locked = kycApiState({
            versions: { rc_book: 2, driving_license: 1, aadhaar: 1, truck_photo: 1 },
            docs: Object.fromEntries(
                KYC_DOC_KINDS.map((kind) => [kind, { status: 'accepted' as const, updatedAt: AT, reviewedAt: AT }]),
            ) as Partial<Record<KycDocKind, Partial<KycDocument>>>,
            locked: true,
        })
        reviewDocumentMock.mockResolvedValue(locked)

        await renderPage()
        const acceptButton = [...(docSection('driving_license')?.querySelectorAll('button') ?? [])]
            .find((button) => button.textContent?.includes('Accept'))
        expect(acceptButton).toBeDefined()
        await act(async () => {
            acceptButton!.click()
        })

        expect(reviewDocumentMock).toHaveBeenCalledTimes(1)
        expect(reviewDocumentMock).toHaveBeenCalledWith(DRIVER_ID, 'driving_license', 1, 'accept', undefined)
        expect(bodyText()).toContain('KYC Verified')
    })

    it('reject requires a reason, then records it through reviewDocument', async () => {
        const rejected = mixedState()
        reviewDocumentMock.mockResolvedValue(rejected)

        await renderPage()
        const licenceSection = docSection('driving_license')
        const rejectButton = [...(licenceSection?.querySelectorAll('button') ?? [])]
            .find((button) => button.textContent?.includes('Reject'))
        await act(async () => {
            rejectButton!.click()
        })

        const confirmButton = [...document.querySelectorAll('button')]
            .find((button) => button.textContent?.includes('Confirm Reject')) as HTMLButtonElement
        // No reason yet: the confirm stays disabled and nothing is sent.
        expect(confirmButton.disabled).toBe(true)
        expect(reviewDocumentMock).not.toHaveBeenCalled()

        const textarea = document.getElementById('kyc-admin-reject-reason-driving_license') as HTMLTextAreaElement
        expect(textarea).toBeDefined()
        await act(async () => {
            // React's value tracker ignores direct .value assignment; the
            // native setter is what a real keystroke goes through.
            const nativeSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
            nativeSetter.call(textarea, 'Licence expiry not visible')
            textarea.dispatchEvent(new Event('input', { bubbles: true }))
        })
        await clickButton('Confirm Reject')

        expect(reviewDocumentMock).toHaveBeenCalledTimes(1)
        expect(reviewDocumentMock).toHaveBeenCalledWith(DRIVER_ID, 'driving_license', 1, 'reject', 'Licence expiry not visible')
    })

    it('a stale-version conflict surfaces the error and reloads the authoritative state', async () => {
        reviewDocumentMock.mockRejectedValue(
            new UserFacingError('This document version was already reviewed or replaced. Refresh and try again.'),
        )

        await renderPage()
        expect(getDriverKycStateMock).toHaveBeenCalledTimes(1)
        const acceptButton = [...(docSection('driving_license')?.querySelectorAll('button') ?? [])]
            .find((button) => button.textContent?.includes('Accept'))
        await act(async () => {
            acceptButton!.click()
        })

        expect(reviewDocumentMock).toHaveBeenCalledTimes(1)
        expect(toast.error).toHaveBeenCalled()
        // The conflict path reloads the server state so the UI shows the
        // version that actually won.
        expect(getDriverKycStateMock).toHaveBeenCalledTimes(2)
    })

    it('preview mints a fresh signed URL scoped to this driver', async () => {
        await renderPage()
        const previewButton = [...(docSection('driving_license')?.querySelectorAll('button') ?? [])]
            .find((button) => button.textContent?.includes('Preview'))
        expect(previewButton).toBeDefined()
        await act(async () => {
            previewButton!.click()
        })

        expect(getDocumentAccessUrlMock).toHaveBeenCalledWith('driving_license', { driverId: DRIVER_ID })
        const img = docSection('driving_license')?.querySelector('img')
        expect(img?.getAttribute('src')).toBe(SIGNED_URL)
    })

    it('approving with incomplete KYC is a documented, confirmed decision', async () => {
        await renderPage()
        await clickButton('Approve Driver')

        // Not locked: the shortfall is stated and approveDriver is not yet called.
        expect(adminApi.approveDriver).not.toHaveBeenCalled()
        expect(bodyText()).toContain('Only 1 of 4 KYC documents are accepted')
        expect(bodyText()).toContain('without full document verification')

        await clickButton('Approve Anyway')
        expect(adminApi.approveDriver).toHaveBeenCalledTimes(1)
        expect(adminApi.approveDriver).toHaveBeenCalledWith(DRIVER_ID)
    })

    it('approving a fully verified driver does not ask for confirmation', async () => {
        getDriverKycStateMock.mockResolvedValue(kycApiState({
            versions: { rc_book: 1, driving_license: 1, aadhaar: 1, truck_photo: 1 },
            docs: Object.fromEntries(
                KYC_DOC_KINDS.map((kind) => [kind, { status: 'accepted' as const, updatedAt: AT, reviewedAt: AT }]),
            ) as Partial<Record<KycDocKind, Partial<KycDocument>>>,
            locked: true,
        }))

        await renderPage()
        await clickButton('Approve Driver')

        expect(adminApi.approveDriver).toHaveBeenCalledTimes(1)
        expect(bodyText()).not.toContain('Approve Anyway')
    })
})
