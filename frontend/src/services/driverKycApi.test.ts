import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())
const storageUploadMock = vi.hoisted(() => vi.fn())
const authGetUserMock = vi.hoisted(() => vi.fn())
const loggerErrorMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => ({
    supabase: {
        functions: {
            invoke: invokeMock,
        },
        auth: {
            getUser: authGetUserMock,
        },
        storage: {
            from: vi.fn(() => ({ upload: storageUploadMock })),
        },
    },
}))

vi.mock('../utils/logger', () => ({
    logger: {
        error: loggerErrorMock,
    },
}))

import {
    getDocumentAccessUrl,
    getState,
    normalizeKycState,
    reviewDocument,
    submit,
    uploadDocument,
    type KycApiStatePayload,
    type KycApiSubmissionState,
} from './driverKycApi'
import { MAX_KYC_UPLOAD_BYTES } from './driverKycDocuments'

const uid = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const driverId = '11111111-2222-4333-8444-555555555555'

function serverStatePatch(): KycApiStatePayload {
    return {
        docs: {
            rc_book: {
                kind: 'rc_book',
                status: 'pending_review',
                fileName: 'rc-book.pdf',
                fileSizeBytes: 1000,
                fileType: 'application/pdf',
                progress: 0,
                rejectionReason: null,
                errorMessage: null,
                updatedAt: '2026-10-03T00:00:00Z',
            },
        },
        versions: { rc_book: 2 },
        submitted: false,
        submittedAt: null,
        locked: false,
        lockedAt: null,
    }
}

function pdfFile(overrides: { size?: number; type?: string } = {}) {
    const size = overrides.size ?? 1024
    const type = overrides.type ?? 'application/pdf'
    return { name: 'rc.pdf', size, type, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as File
}

describe('driverKycApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        invokeMock.mockResolvedValue({ data: { state: serverStatePatch() } })
        storageUploadMock.mockResolvedValue({ error: null })
        authGetUserMock.mockResolvedValue({ data: { user: { id: uid } }, error: null })
    })

    describe('normalizeKycState', () => {
        it('fills every document kind as pending and defaults versions to 0', () => {
            const state = normalizeKycState(null)

            expect(state.docs.rc_book.status).toBe('pending')
            expect(state.docs.driving_license.status).toBe('pending')
            expect(state.docs.aadhaar.status).toBe('pending')
            expect(state.docs.truck_photo.status).toBe('pending')
            expect(state.versions).toEqual({ rc_book: 0, driving_license: 0, aadhaar: 0, truck_photo: 0 })
            expect(state.submitted).toBe(false)
            expect(state.locked).toBe(false)
        })

        it('maps the server payload into the shared KycSubmissionState shape', () => {
            const state = normalizeKycState(serverStatePatch()) as KycApiSubmissionState

            expect(state.docs.rc_book).toMatchObject({
                kind: 'rc_book',
                status: 'pending_review',
                fileName: 'rc-book.pdf',
                progress: 0,
            })
            expect(state.versions.rc_book).toBe(2)
            expect(state.versions.truck_photo).toBe(0)
        })

        it('never lets a fabricated client status through', () => {
            const payload = serverStatePatch()
            const rcBook = payload.docs.rc_book
            if (!rcBook) throw new Error('fixture must include rc_book')
            rcBook.status = 'uploading'
            rcBook.progress = 87

            const state = normalizeKycState(payload)

            // Progress is server-owned (always 0 here); statuses come from
            // the payload but the server only ever returns
            // pending/pending_review/accepted/rejected.
            expect(state.docs.rc_book.progress).toBe(0)
        })
    })

    describe('getState', () => {
        it('requests the server-computed state and normalizes it', async () => {
            const state = await getState()

            expect(invokeMock).toHaveBeenCalledWith('driver-kyc', { body: { action: 'state' } })
            expect(state.docs.rc_book.status).toBe('pending_review')
        })

        it('throws a user-facing fallback when the function fails', async () => {
            invokeMock.mockRejectedValueOnce(new Error('network down'))

            await expect(getState()).rejects.toThrow('Could not load your KYC status')
            expect(loggerErrorMock).toHaveBeenCalled()
        })
    })

    describe('uploadDocument', () => {
        it('rejects oversized files locally before any upload or call', async () => {
            await expect(uploadDocument('rc_book', pdfFile({ size: MAX_KYC_UPLOAD_BYTES + 1 }))).rejects.toThrow(
                'File is too large',
            )
            expect(storageUploadMock).not.toHaveBeenCalled()
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('rejects unsupported types locally', async () => {
            await expect(uploadDocument('rc_book', pdfFile({ type: 'text/plain' }))).rejects.toThrow(
                'Unsupported file type',
            )
            expect(storageUploadMock).not.toHaveBeenCalled()
        })

        it('requires a signed-in user', async () => {
            authGetUserMock.mockResolvedValueOnce({ data: { user: null }, error: null })

            await expect(uploadDocument('rc_book', pdfFile())).rejects.toThrow('Sign in as a driver')
            expect(storageUploadMock).not.toHaveBeenCalled()
        })

        it('uploads to a randomized owner-scoped path then asks the function to validate bytes', async () => {
            const file = pdfFile()
            const state = await uploadDocument('rc_book', file)

            expect(storageUploadMock).toHaveBeenCalledTimes(1)
            const [path, uploadedFile, options] = storageUploadMock.mock.calls[0]
            expect(path).toMatch(
                new RegExp(`^${uid}/rc_book/[0-9a-f-]{36}\\.pdf$`),
            )
            expect(uploadedFile).toBe(file)
            expect(options).toEqual({ contentType: 'application/pdf', upsert: false })

            expect(invokeMock).toHaveBeenCalledWith('driver-kyc', {
                body: { action: 'upload', kind: 'rc_book', path, fileName: 'rc.pdf' },
            })
            expect(state.docs.rc_book.status).toBe('pending_review')
        })

        it('surfaces a storage failure as a user-facing error', async () => {
            storageUploadMock.mockResolvedValueOnce({ error: { message: 'bucket policy' } })

            await expect(uploadDocument('rc_book', pdfFile())).rejects.toThrow('upload failed')
            expect(invokeMock).not.toHaveBeenCalled()
        })
    })

    describe('submit', () => {
        it('delegates the gate to the server and returns its state', async () => {
            const state = await submit()

            expect(invokeMock).toHaveBeenCalledWith('driver-kyc', { body: { action: 'submit' } })
            expect(state.submitted).toBe(false)
        })
    })

    describe('reviewDocument', () => {
        it('requires a rejection reason', async () => {
            await expect(reviewDocument(driverId, 'rc_book', 2, 'reject', '   ')).rejects.toThrow(
                'rejection reason is required',
            )
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('requires a positive integer version', async () => {
            await expect(reviewDocument(driverId, 'rc_book', 0, 'accept')).rejects.toThrow(
                'valid document version',
            )
            expect(invokeMock).not.toHaveBeenCalled()
        })

        it('forwards the version-guarded accept to the function', async () => {
            await reviewDocument(driverId, 'rc_book', 3, 'accept')

            expect(invokeMock).toHaveBeenCalledWith('driver-kyc', {
                body: { action: 'review', driverId, kind: 'rc_book', version: 3, decision: 'accept', reason: undefined },
            })
        })

        it('trims the rejection reason for reject decisions', async () => {
            await reviewDocument(driverId, 'aadhaar', 1, 'reject', '  Not readable  ')

            expect(invokeMock).toHaveBeenCalledWith('driver-kyc', {
                body: {
                    action: 'review',
                    driverId,
                    kind: 'aadhaar',
                    version: 1,
                    decision: 'reject',
                    reason: 'Not readable',
                },
            })
        })
    })

    describe('getDocumentAccessUrl', () => {
        it('returns the short-lived signed access payload', async () => {
            invokeMock.mockResolvedValueOnce({
                data: { url: 'https://signed.test/u?token=x', expiresIn: 60, kind: 'rc_book', version: 2, status: 'accepted' },
            })

            const access = await getDocumentAccessUrl('rc_book', { driverId, version: 2 })

            expect(invokeMock).toHaveBeenCalledWith('driver-kyc', {
                body: { action: 'access', kind: 'rc_book', driverId, version: 2 },
            })
            expect(access.url).toBe('https://signed.test/u?token=x')
            expect(access.expiresIn).toBe(60)
        })

        it('fails with a user-facing error when no URL comes back', async () => {
            invokeMock.mockResolvedValueOnce({ data: null })

            await expect(getDocumentAccessUrl('rc_book')).rejects.toThrow('could not be opened')
        })
    })
})
