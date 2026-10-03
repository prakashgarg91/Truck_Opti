/**
 * TO-127 — component tests for the real driver KYC screen.
 *
 * The page is exercised through react-dom (no Testing Library in this
 * repo): server states come from mocked driverKycApi responses, so every
 * assertion proves the screen renders/behaves per the TO-126 backend
 * contract — no client-side acceptance, no invented upload percentage.
 */
import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

import { KYC_DOC_KINDS, createInitialKycState, type KycDocKind, type KycDocument, type KycSubmissionState } from '../services/driverKycDocuments'

const getStateMock = vi.hoisted(() => vi.fn())
const uploadDocumentMock = vi.hoisted(() => vi.fn())
const submitMock = vi.hoisted(() => vi.fn())
const accessUrlMock = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({ user: { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } as { id: string } | null }))

vi.mock('../services/driverKycApi', () => ({
    getState: getStateMock,
    uploadDocument: uploadDocumentMock,
    submit: submitMock,
    getDocumentAccessUrl: accessUrlMock,
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => authState,
}))

import DriverKycPage from './DriverKycPage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const AT = '2026-10-03T08:00:00.000Z'
const SIGNED_URL = 'https://signed.test/driver-docs/short-lived?token=x'

function serverState(
    overrides: Partial<Record<KycDocKind, Partial<KycDocument>>> = {},
    flags: Partial<Pick<KycSubmissionState, 'submitted' | 'locked' | 'submittedAt' | 'lockedAt'>> = {},
): KycSubmissionState {
    const state = createInitialKycState()
    for (const kind of KYC_DOC_KINDS) {
        if (overrides[kind]) {
            state.docs[kind] = {
                ...state.docs[kind],
                fileName: `${kind}.jpg`,
                fileSizeBytes: 2048,
                fileType: 'image/jpeg',
                updatedAt: AT,
                ...overrides[kind],
            }
        }
    }
    return { ...state, ...flags }
}

function uploadedAll(status: KycDocument['status']): KycSubmissionState {
    return serverState(
        Object.fromEntries(KYC_DOC_KINDS.map((kind) => [kind, { status }])) as Partial<Record<KycDocKind, Partial<KycDocument>>>,
    )
}

let root: Root | null = null
let container: HTMLElement | null = null

async function renderPage(initialEntry = '/driver/kyc') {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, { initialEntries: [initialEntry] }, createElement(DriverKycPage)))
    })
    return container
}

function bodyText(): string {
    return document.body.textContent ?? ''
}

function docSection(kind: KycDocKind): HTMLElement | null {
    return document.getElementById(`kyc-upload-${kind}-title`)?.closest('section') ?? null
}

function findButton(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(label))
}

function setInputFiles(kind: KycDocKind, file: File) {
    const input = document.getElementById(`kyc-upload-${kind}`) as HTMLInputElement | null
    if (!input) throw new Error(`missing file input for ${kind}`)
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    input.dispatchEvent(new Event('change', { bubbles: true }))
}

function pdfFile(): File {
    return new File([new ArrayBuffer(32)], 'rc-book.pdf', { type: 'application/pdf' })
}

afterEach(async () => {
    await act(async () => {
        root?.unmount()
    })
    container?.remove()
    root = null
    container = null
})

describe('DriverKycPage (TO-127 real uploads)', () => {
    beforeEach(() => {
        authState.user = { id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
        getStateMock.mockResolvedValue(createInitialKycState())
        accessUrlMock.mockResolvedValue({ url: SIGNED_URL, expiresIn: 60, kind: 'rc_book', version: 1, status: 'pending_review' })
    })

    it('loads the persisted server state on mount and renders its outcomes', async () => {
        getStateMock.mockResolvedValue(serverState({
            rc_book: { status: 'pending_review' },
            aadhaar: { status: 'rejected', rejectionReason: 'Both sides are not readable' },
        }))

        await renderPage()

        expect(getStateMock).toHaveBeenCalledTimes(1)
        expect(bodyText()).toContain('Both sides are not readable')
        expect(bodyText()).toContain('Pending review')
        expect(bodyText()).toContain('Review Needed')
        expect(bodyText()).toContain('0 of 4 documents accepted')
    })

    it('renders the server-computed locked state as KYC Verified and removes every upload affordance', async () => {
        const locked = uploadedAll('accepted')
        locked.locked = true
        locked.lockedAt = AT
        getStateMock.mockResolvedValue(locked)

        await renderPage()

        expect(bodyText()).toContain('KYC Verified')
        expect(findButton('Submit for verification')).toBeUndefined()
        const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')]
        expect(inputs).toHaveLength(4)
        expect(inputs.every((input) => input.disabled)).toBe(true)
        expect(bodyText()).not.toContain('Replace File')
    })

    it('uploads real bytes through the TO-126 contract with an honest indeterminate transfer', async () => {
        let resolveUpload!: (state: KycSubmissionState) => void
        uploadDocumentMock.mockImplementation(() => new Promise<KycSubmissionState>((resolve) => { resolveUpload = resolve }))

        await renderPage()

        await act(async () => {
            setInputFiles('rc_book', pdfFile())
        })
        await act(async () => {})

        expect(uploadDocumentMock).toHaveBeenCalledTimes(1)
        const [kind, file] = uploadDocumentMock.mock.calls[0]
        expect(kind).toBe('rc_book')
        expect(file).toBeInstanceOf(File)
        expect(file.name).toBe('rc-book.pdf')

        const section = docSection('rc_book')
        expect(section?.textContent).toContain('Uploading…')
        expect(section?.textContent).not.toMatch(/Uploading \d+%/)
        expect(section?.textContent).not.toMatch(/\d+%/)
        const input = document.getElementById('kyc-upload-rc_book') as HTMLInputElement
        expect(input.disabled).toBe(true)

        const settled = uploadedAll('pending_review')
        await act(async () => {
            resolveUpload(settled)
        })
        // Flush the signed-preview effect chain spawned by the new state.
        await act(async () => {})

        expect(docSection('rc_book')?.textContent).toContain('Pending review')
        expect(docSection('rc_book')?.textContent).not.toContain('Uploading…')
        // The uploaded document is previewed via the short-lived signed URL.
        expect(accessUrlMock).toHaveBeenCalledWith('rc_book')
        const thumb = docSection('rc_book')?.querySelector('img')
        expect(thumb?.getAttribute('src')).toBe(SIGNED_URL)
    })

    it('leaves a retryable error state when the upload fails', async () => {
        uploadDocumentMock.mockRejectedValueOnce(new Error('The document upload failed. Please try again.'))

        await renderPage()
        await act(async () => {
            setInputFiles('rc_book', pdfFile())
        })
        // Flush the rejection-handling promise chain fully.
        await act(async () => {})

        const section = docSection('rc_book')
        expect(section?.textContent).toContain('Upload failed')
        expect(section?.textContent).toContain('The document upload failed. Please try again.')
        expect(docSection('rc_book')?.textContent).not.toContain('Pending review')

        const retry = [...docSection('rc_book')!.querySelectorAll('button')].find((button) =>
            button.textContent?.includes('Try again'),
        )
        expect(retry).toBeDefined()
        await act(async () => {
            retry!.click()
        })

        expect(docSection('rc_book')?.textContent).toContain('Take photo or upload')
        const input = document.getElementById('kyc-upload-rc_book') as HTMLInputElement
        expect(input.disabled).toBe(false)
    })

    it('submits through the server and stays pending until an actual admin decision', async () => {
        getStateMock.mockResolvedValue(uploadedAll('pending_review'))
        submitMock.mockResolvedValue(
            serverState(
                Object.fromEntries(KYC_DOC_KINDS.map((kind) => [kind, { status: 'pending_review' }])) as Partial<Record<KycDocKind, Partial<KycDocument>>>,
                { submitted: true, submittedAt: AT },
            ),
        )

        await renderPage()

        const cta = findButton('Submit for verification')
        expect(cta).toBeDefined()
        expect(cta!.disabled).toBe(false)

        await act(async () => {
            cta!.click()
        })

        expect(submitMock).toHaveBeenCalledTimes(1)
        const ctaAfter = findButton('Submitted — under review')
        expect(ctaAfter).toBeDefined()
        expect(ctaAfter!.disabled).toBe(true)
        // No client-side acceptance: the screen still awaits review.
        expect(bodyText()).not.toContain('KYC Verified')
        expect(bodyText()).toContain('Submitted — under review')
    })

    it('denies the screen without a driver session', async () => {
        authState.user = null

        await renderPage()

        expect(getStateMock).not.toHaveBeenCalled()
        expect(bodyText()).toContain('Sign in as a driver')
        expect(document.querySelector('input[type="file"]')).toBeNull()
        expect(findButton('Submit for verification')).toBeUndefined()
    })

    it('blocks uploads and submission while offline', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(window.Navigator.prototype, 'onLine')
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false })
        try {
            await renderPage()

            expect(bodyText()).toContain("You're offline")
            const input = document.getElementById('kyc-upload-rc_book') as HTMLInputElement
            expect(input.disabled).toBe(true)
            const cta = findButton('Submit for verification')
            expect(cta?.disabled).toBe(true)
        } finally {
            delete (window.navigator as unknown as { onLine?: boolean }).onLine
            if (descriptor) Object.defineProperty(window.Navigator.prototype, 'onLine', descriptor)
        }
    })

    it('seeds the midflow demo fixture only as a dev snapshot and disables actions', async () => {
        await renderPage('/driver/kyc?demo=midflow')

        expect(getStateMock).not.toHaveBeenCalled()
        expect(bodyText()).toContain('Dev preview')
        expect(docSection('rc_book')?.textContent).toContain('Uploading…')
        expect(docSection('driving_license')?.textContent).toContain('Expiry date is cut off')
        expect(docSection('truck_photo')?.textContent).toContain('Accepted')
        const input = document.getElementById('kyc-upload-rc_book') as HTMLInputElement
        expect(input.disabled).toBe(true)
        expect(findButton('Submit for verification')).toBeUndefined()
    })
})
