import { describe, expect, it } from 'vitest'

import {
    KYC_DOC_KINDS,
    MAX_KYC_UPLOAD_BYTES,
    canSubmitForVerification,
    createInitialKycState,
    createMidflowDemoState,
    demoQueryEnabled,
    failUpload,
    kycAcceptedCount,
    kycCompletionPercent,
    kycProfileSummary,
    kycSubmitBlockers,
    mergeServerState,
    retryFromError,
    startUpload,
    submitHelperText,
    validateUploadFile,
    type KycDocKind,
    type KycDocument,
    type KycSubmissionState,
} from './driverKycDocuments'

const AT = '2026-09-19T10:00:00.000Z'

/** Builds a server-authoritative state (what driverKycApi.normalizeKycState returns). */
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
                fileSizeBytes: 1024,
                fileType: 'image/jpeg',
                updatedAt: AT,
                ...overrides[kind],
            }
        }
    }
    return { ...state, ...flags }
}

function uploadedAll(status: KycDocument['status'] = 'pending_review'): KycSubmissionState {
    return serverState(
        Object.fromEntries(KYC_DOC_KINDS.map((kind) => [kind, { status }])) as Partial<Record<KycDocKind, Partial<KycDocument>>>,
    )
}

describe('driverKycDocuments validation', () => {
    it('accepts a valid in-range image upload', () => {
        expect(validateUploadFile({ size: 1024 * 1024, type: 'image/jpeg' })).toBeNull()
        expect(validateUploadFile({ size: 1024, type: 'application/pdf' })).toBeNull()
    })

    it('rejects oversized files with the 5 MB limit message', () => {
        const error = validateUploadFile({ size: MAX_KYC_UPLOAD_BYTES + 1, type: 'image/jpeg' })
        expect(error).toBe('File is too large. Maximum size is 5 MB.')
    })

    it('rejects unsupported file types and empty files', () => {
        expect(validateUploadFile({ size: 1024, type: 'image/gif' })).toMatch(/Unsupported file type/)
        expect(validateUploadFile({ size: 0, type: 'image/jpeg' })).toMatch(/looks empty/)
    })
})

describe('driverKycDocuments client-local overlays', () => {
    it('starts from four pending documents with nothing submitted or locked', () => {
        const state = createInitialKycState()
        expect(Object.keys(state.docs)).toHaveLength(4)
        expect(kycAcceptedCount(state)).toBe(0)
        expect(state.submitted).toBe(false)
        expect(state.locked).toBe(false)
    })

    it('marks a transfer in flight with progress 0 — never a percentage', () => {
        const state = startUpload(
            createInitialKycState(),
            'rc_book',
            { name: 'rc.pdf', sizeBytes: 2048, type: 'application/pdf' },
            AT,
        )
        expect(state.docs.rc_book.status).toBe('uploading')
        expect(state.docs.rc_book.progress).toBe(0)
        expect(state.docs.rc_book.fileName).toBe('rc.pdf')
    })

    it('records upload errors and clears them on retry', () => {
        let state = createInitialKycState()
        state = failUpload(state, 'truck_photo', 'File is too large. Maximum size is 5 MB.', AT)
        expect(state.docs.truck_photo.status).toBe('error')
        expect(state.docs.truck_photo.errorMessage).toMatch(/too large/)
        state = retryFromError(state, 'truck_photo', AT)
        expect(state.docs.truck_photo.status).toBe('pending')
        expect(state.docs.truck_photo.errorMessage).toBeNull()
        expect(state.docs.truck_photo.fileName).toBeNull()
    })

    it('never lets client-local transitions accept, reject, submit or lock a document', () => {
        // Regression for TO-127: the only paths that once fabricated
        // acceptance (acceptDocument / approvePendingReviews / submit timers)
        // no longer exist; everything below is client-local overlay state.
        let state = createInitialKycState()
        for (const kind of KYC_DOC_KINDS) {
            state = startUpload(state, kind, { name: `${kind}.jpg`, sizeBytes: 10, type: 'image/jpeg' }, AT)
            state = failUpload(state, kind, 'boom', AT)
            state = retryFromError(state, kind, AT)
        }
        expect(KYC_DOC_KINDS.every((kind) => state.docs[kind].status === 'pending')).toBe(true)
        expect(state.submitted).toBe(false)
        expect(state.locked).toBe(false)
    })

    it('is a no-op once the server locked the state', () => {
        const locked = serverState(
            Object.fromEntries(KYC_DOC_KINDS.map((kind) => [kind, { status: 'accepted' }])) as Partial<Record<KycDocKind, Partial<KycDocument>>>,
            { locked: true, lockedAt: AT },
        )
        expect(startUpload(locked, 'rc_book', { name: 'x.jpg', sizeBytes: 1, type: 'image/jpeg' }, AT)).toBe(locked)
        expect(failUpload(locked, 'rc_book', 'boom', AT)).toBe(locked)
    })

    it('does not mutate the previous state (pure transitions)', () => {
        const before = startUpload(
            createInitialKycState(),
            'aadhaar',
            { name: 'a.jpg', sizeBytes: 10, type: 'image/jpeg' },
            AT,
        )
        const snapshot = JSON.stringify(before)
        failUpload(before, 'rc_book', 'boom', AT)
        retryFromError(before, 'aadhaar', AT)
        expect(JSON.stringify(before)).toBe(snapshot)
    })
})

describe('mergeServerState', () => {
    it('adopts the server outcome for every settled document', () => {
        const local = startUpload(
            createInitialKycState(),
            'rc_book',
            { name: 'rc.pdf', sizeBytes: 10, type: 'application/pdf' },
            AT,
        )
        const server = uploadedAll('pending_review')

        const merged = mergeServerState(local, server, ['rc_book'])

        expect(KYC_DOC_KINDS.every((kind) => merged.docs[kind].status === 'pending_review')).toBe(true)
        expect(merged.docs.rc_book.fileName).toBe('rc_book.jpg')
    })

    it('preserves an in-flight transfer when a concurrent refresh arrives', () => {
        const local = startUpload(
            createInitialKycState(),
            'aadhaar',
            { name: 'aadhaar.jpg', sizeBytes: 10, type: 'image/jpeg' },
            AT,
        )
        const server = serverState({
            aadhaar: { status: 'pending_review' },
        })

        const merged = mergeServerState(local, server)

        expect(merged.docs.aadhaar.status).toBe('uploading')
        expect(merged.docs.aadhaar.fileName).toBe('aadhaar.jpg')
        expect(merged.docs.rc_book.status).toBe('pending')
        expect(merged.submitted).toBe(false)
    })

    it('propagates server-computed submission and locked flags only', () => {
        const server = uploadedAll('accepted')
        server.submitted = true
        server.submittedAt = AT
        server.locked = true
        server.lockedAt = AT

        const merged = mergeServerState(createInitialKycState(), server)

        expect(merged.submitted).toBe(true)
        expect(merged.locked).toBe(true)
        expect(merged.lockedAt).toBe(AT)
        expect(KYC_DOC_KINDS.every((kind) => merged.docs[kind].status === 'accepted')).toBe(true)
    })

    it('keeps the KYC Verified state strictly server-owned', () => {
        // A locked server payload is the only way locked becomes true; a
        // locally uploading document cannot flip it.
        const local = startUpload(
            createInitialKycState(),
            'truck_photo',
            { name: 't.jpg', sizeBytes: 10, type: 'image/jpeg' },
            AT,
        )
        const server = uploadedAll('accepted')
        server.locked = true
        server.lockedAt = AT

        const merged = mergeServerState(local, server)
        expect(merged.locked).toBe(true)
        expect(merged.docs.truck_photo.status).toBe('uploading')
    })
})

describe('driverKycDocuments submission gate', () => {
    it('blocks submit until every document is uploaded', () => {
        const state = createInitialKycState()
        expect(canSubmitForVerification(state)).toBe(false)
        expect(submitHelperText(state)).toBe('Upload all 4 documents to submit (4 not uploaded)')
    })

    it('names rejected and uploading documents as blockers like the generated design', () => {
        const state = serverState({
            driving_license: { status: 'rejected', rejectionReason: 'Expiry cut off' },
            aadhaar: { status: 'pending_review' },
            truck_photo: { status: 'pending_review' },
        })
        const withInFlight = startUpload(
            state,
            'rc_book',
            { name: 'rc.pdf', sizeBytes: 10, type: 'application/pdf' },
            AT,
        )
        expect(kycSubmitBlockers(withInFlight)).toEqual(['1 rejected', '1 uploading'])
        expect(submitHelperText(withInFlight)).toBe('Upload all 4 documents to submit (1 rejected, 1 uploading)')
        expect(canSubmitForVerification(withInFlight)).toBe(false)
    })

    it('stays pending after submission until the server reports a decision', () => {
        const uploaded = uploadedAll('pending_review')
        expect(canSubmitForVerification(uploaded)).toBe(true)
        expect(submitHelperText(uploaded)).toBe('All 4 documents ready for verification')

        const submitted = mergeServerState(uploaded, serverState(
            Object.fromEntries(KYC_DOC_KINDS.map((kind) => [kind, { status: 'pending_review' }])) as Partial<Record<KycDocKind, Partial<KycDocument>>>,
            { submitted: true, submittedAt: AT },
        ))
        expect(submitted.submitted).toBe(true)
        expect(submitHelperText(submitted)).toBe('Submitted — under review')
        expect(canSubmitForVerification(submitted)).toBe(false)
        expect(submitted.locked).toBe(false)
    })

    it('locks only on the server payload where all four are accepted', () => {
        const accepted = uploadedAll('accepted')
        accepted.locked = true
        accepted.lockedAt = AT
        expect(kycAcceptedCount(accepted)).toBe(4)
        expect(kycCompletionPercent(accepted)).toBe(100)
        expect(submitHelperText(accepted)).toBeNull()
    })
})

describe('kycProfileSummary', () => {
    it('reports Verified only for the server-computed locked state', () => {
        const locked = uploadedAll('accepted')
        locked.locked = true
        locked.lockedAt = AT
        expect(kycProfileSummary(locked)).toEqual({ tone: 'verified', label: 'Verified' })
    })

    it('reports Action needed when any document was rejected', () => {
        const state = serverState({ aadhaar: { status: 'rejected', rejectionReason: 'Blurry' } })
        expect(kycProfileSummary(state)).toEqual({ tone: 'action', label: 'Action needed' })
    })

    it('reports Pending review while documents await a decision', () => {
        expect(kycProfileSummary(uploadedAll('pending_review'))).toEqual({
            tone: 'progress',
            label: 'Pending review',
        })
    })

    it('claims nothing when nothing has been uploaded or the backend is empty', () => {
        expect(kycProfileSummary(createInitialKycState())).toBeNull()
    })
})

describe('demoQueryEnabled', () => {
    it('allows the midflow fixture only in development', () => {
        expect(demoQueryEnabled(true, 'midflow')).toBe(true)
    })

    it('never fabricates verification from a production query string', () => {
        expect(demoQueryEnabled(false, 'midflow')).toBe(false)
        expect(demoQueryEnabled(false, 'verified')).toBe(false)
        expect(demoQueryEnabled(true, 'verified')).toBe(false)
        expect(demoQueryEnabled(true, null)).toBe(false)
    })
})

describe('driverKycDocuments midflow demo seed (dev fixture)', () => {
    it('mirrors the generated Stitch mock: one document in each state', () => {
        const state = createMidflowDemoState(new Date('2026-09-19T10:00:00.000Z'))
        expect(state.docs.rc_book.status).toBe('uploading')
        expect(state.docs.rc_book.progress).toBe(0)
        expect(state.docs.driving_license.status).toBe('rejected')
        expect(state.docs.driving_license.rejectionReason).toMatch(/Expiry date is cut off/)
        expect(state.docs.aadhaar.status).toBe('pending_review')
        expect(state.docs.truck_photo.status).toBe('accepted')
        expect(state.locked).toBe(false)
        expect(submitHelperText(state)).toBe('Upload all 4 documents to submit (1 rejected, 1 uploading)')
    })
})
