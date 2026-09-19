import { describe, expect, it } from 'vitest'

import {
    KYC_DOC_KINDS,
    MAX_KYC_UPLOAD_BYTES,
    acceptDocument,
    approvePendingReviews,
    cancelUpload,
    canSubmitForVerification,
    completeUpload,
    createInitialKycState,
    createMidflowDemoState,
    failUpload,
    kycAcceptedCount,
    kycCompletionPercent,
    kycSubmitBlockers,
    rejectDocument,
    retryFromError,
    setUploadProgress,
    startUpload,
    submitForVerification,
    submitHelperText,
    validateUploadFile,
} from './driverKycDocuments'

const AT = '2026-09-19T10:00:00.000Z'

function uploadAll(state = createInitialKycState()) {
    let next = state
    for (const kind of KYC_DOC_KINDS) {
        next = startUpload(next, kind, { name: `${kind}.jpg`, sizeBytes: 1024, type: 'image/jpeg' }, AT)
        next = completeUpload(next, kind, AT)
    }
    return next
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

describe('driverKycDocuments upload lifecycle', () => {
    it('starts from four pending documents with no submission', () => {
        const state = createInitialKycState()
        expect(Object.keys(state.docs)).toHaveLength(4)
        expect(kycAcceptedCount(state)).toBe(0)
        expect(state.submitted).toBe(false)
        expect(state.locked).toBe(false)
    })

    it('moves a document pending → uploading → pending_review', () => {
        let state = createInitialKycState()
        state = startUpload(state, 'rc_book', { name: 'rc.pdf', sizeBytes: 2048, type: 'application/pdf' }, AT)
        expect(state.docs.rc_book.status).toBe('uploading')
        expect(state.docs.rc_book.progress).toBe(0)

        state = setUploadProgress(state, 'rc_book', 62, AT)
        expect(state.docs.rc_book.progress).toBe(62)

        state = completeUpload(state, 'rc_book', AT)
        expect(state.docs.rc_book.status).toBe('pending_review')
        expect(state.docs.rc_book.progress).toBe(100)
        expect(state.docs.rc_book.fileName).toBe('rc.pdf')
    })

    it('clamps progress to 0-100 and ignores progress on non-uploading docs', () => {
        let state = createInitialKycState()
        state = setUploadProgress(state, 'rc_book', 250, AT)
        expect(state.docs.rc_book.status).toBe('pending')
        state = startUpload(state, 'rc_book', { name: 'rc.pdf', sizeBytes: 1, type: 'image/png' }, AT)
        state = setUploadProgress(state, 'rc_book', 150, AT)
        expect(state.docs.rc_book.progress).toBe(100)
    })

    it('cancel returns an uploading document to pending with no file', () => {
        let state = createInitialKycState()
        state = startUpload(state, 'aadhaar', { name: 'a.jpg', sizeBytes: 10, type: 'image/jpeg' }, AT)
        state = cancelUpload(state, 'aadhaar', AT)
        expect(state.docs.aadhaar.status).toBe('pending')
        expect(state.docs.aadhaar.fileName).toBeNull()
    })

    it('records upload errors and clears them on retry', () => {
        let state = createInitialKycState()
        state = failUpload(state, 'truck_photo', 'File is too large. Maximum size is 5 MB.', AT)
        expect(state.docs.truck_photo.status).toBe('error')
        expect(state.docs.truck_photo.errorMessage).toMatch(/too large/)
        state = retryFromError(state, 'truck_photo', AT)
        expect(state.docs.truck_photo.status).toBe('pending')
        expect(state.docs.truck_photo.errorMessage).toBeNull()
    })

    it('re-uploading a rejected document clears the rejection reason', () => {
        let state = uploadAll()
        state = rejectDocument(state, 'driving_license', 'Blurry scan', AT)
        expect(state.docs.driving_license.status).toBe('rejected')
        state = startUpload(state, 'driving_license', { name: 'dl2.jpg', sizeBytes: 10, type: 'image/jpeg' }, AT)
        expect(state.docs.driving_license.status).toBe('uploading')
        expect(state.docs.driving_license.rejectionReason).toBeNull()
    })
})

describe('driverKycDocuments review pipeline', () => {
    it('keeps completion at 25% with one accepted document', () => {
        let state = uploadAll()
        state = acceptDocument(state, 'truck_photo', AT)
        expect(kycAcceptedCount(state)).toBe(1)
        expect(kycCompletionPercent(state)).toBe(25)
        expect(state.locked).toBe(false)
    })

    it('locks the submission only when all four documents are accepted', () => {
        let state = uploadAll()
        state = approvePendingReviews(state, AT)
        expect(kycAcceptedCount(state)).toBe(4)
        expect(kycCompletionPercent(state)).toBe(100)
        expect(state.locked).toBe(true)
        expect(state.lockedAt).toBe(AT)
    })

    it('allows a rejected document to be accepted after re-upload', () => {
        let state = uploadAll()
        state = rejectDocument(state, 'driving_license', 'Expiry cut off', AT)
        state = startUpload(state, 'driving_license', { name: 'dl2.jpg', sizeBytes: 10, type: 'image/jpeg' }, AT)
        state = completeUpload(state, 'driving_license', AT)
        state = acceptDocument(state, 'driving_license', AT)
        expect(state.docs.driving_license.status).toBe('accepted')
    })

    it('rejectDocument is a no-op for documents without an upload under review', () => {
        let state = createInitialKycState()
        state = rejectDocument(state, 'rc_book', 'nope', AT)
        expect(state.docs.rc_book.status).toBe('pending')
    })
})

describe('driverKycDocuments submission gate', () => {
    it('blocks submit until every document is uploaded', () => {
        const state = createInitialKycState()
        expect(canSubmitForVerification(state)).toBe(false)
        expect(submitHelperText(state)).toBe('Upload all 4 documents to submit (4 not uploaded)')
        expect(submitForVerification(state, AT)).toBe(state)
    })

    it('names rejected and uploading documents as blockers like the generated design', () => {
        let state = uploadAll()
        state = rejectDocument(state, 'driving_license', 'Expiry cut off', AT)
        state = startUpload(state, 'rc_book', { name: 'rc.pdf', sizeBytes: 10, type: 'application/pdf' }, AT)
        state = setUploadProgress(state, 'rc_book', 40, AT)
        expect(kycSubmitBlockers(state)).toEqual(['1 rejected', '1 uploading'])
        expect(submitHelperText(state)).toBe('Upload all 4 documents to submit (1 rejected, 1 uploading)')
        expect(canSubmitForVerification(state)).toBe(false)
    })

    it('submits when all four documents await review, then locks after approval', () => {
        const uploaded = uploadAll()
        expect(canSubmitForVerification(uploaded)).toBe(true)
        expect(submitHelperText(uploaded)).toBe('All 4 documents ready for verification')

        const submitted = submitForVerification(uploaded, AT)
        expect(submitted.submitted).toBe(true)
        expect(submitted.submittedAt).toBe(AT)
        expect(submitHelperText(submitted)).toBe('Submitted — under review')
        expect(canSubmitForVerification(submitted)).toBe(false)

        const approved = approvePendingReviews(submitted, AT)
        expect(approved.locked).toBe(true)
        expect(submitHelperText(approved)).toBeNull()
    })

    it('does not mutate the previous state (pure transitions)', () => {
        const before = uploadAll()
        const snapshot = JSON.stringify(before)
        rejectDocument(before, 'aadhaar', 'Blurry', AT)
        acceptDocument(before, 'aadhaar', AT)
        failUpload(before, 'rc_book', 'boom', AT)
        expect(JSON.stringify(before)).toBe(snapshot)
    })
})

describe('driverKycDocuments midflow demo seed', () => {
    it('mirrors the generated Stitch mock: one document in each state', () => {
        const state = createMidflowDemoState(new Date('2026-09-19T10:00:00.000Z'))
        expect(state.docs.rc_book.status).toBe('uploading')
        expect(state.docs.rc_book.progress).toBe(62)
        expect(state.docs.driving_license.status).toBe('rejected')
        expect(state.docs.driving_license.rejectionReason).toMatch(/Expiry date is cut off/)
        expect(state.docs.aadhaar.status).toBe('pending_review')
        expect(state.docs.truck_photo.status).toBe('accepted')
        expect(state.locked).toBe(false)
        expect(submitHelperText(state)).toBe('Upload all 4 documents to submit (1 rejected, 1 uploading)')
    })
})
