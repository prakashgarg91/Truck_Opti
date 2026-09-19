/**
 * Client-side state machine for the driver "Documents & KYC Upload" screen.
 *
 * Terminology mirrors the admin "KYC Verification Detail" pairing screen
 * (Stitch screen d9fafd06c79345d2896c265eb12f6ea4): "Uploaded Documents",
 * "Pending review", "Review Needed", "Accepted", "Rejected".
 *
 * Uploads are simulated client-side until storage/backend wiring exists;
 * every transition is a pure function so the review pipeline can be unit
 * tested deterministically and later driven by real admin outcomes.
 */

export const KYC_DOC_KINDS = ['rc_book', 'driving_license', 'aadhaar', 'truck_photo'] as const

export type KycDocKind = (typeof KYC_DOC_KINDS)[number]

/**
 * pending       — not uploaded yet
 * uploading     — transfer in progress (progress 0-100)
 * pending_review— uploaded, awaiting admin verification ("Pending review")
 * rejected      — admin rejected with a reason ("Review Needed")
 * accepted      — admin approved ("Accepted")
 * error         — upload failed validation or transfer (retryable)
 */
export type KycDocStatus =
  | 'pending'
  | 'uploading'
  | 'pending_review'
  | 'rejected'
  | 'accepted'
  | 'error'

export interface KycFileMeta {
  name: string
  sizeBytes: number
  type: string
}

export interface KycDocument {
  kind: KycDocKind
  status: KycDocStatus
  fileName: string | null
  fileSizeBytes: number | null
  fileType: string | null
  /** Upload progress 0-100; 0 when not uploading. */
  progress: number
  rejectionReason: string | null
  errorMessage: string | null
  updatedAt: string | null
}

export interface KycSubmissionState {
  docs: Record<KycDocKind, KycDocument>
  /** Whole set handed to verification via the sticky CTA. */
  submitted: boolean
  submittedAt: string | null
  /** True once all four documents are accepted; the screen locks. */
  locked: boolean
  lockedAt: string | null
}

export const MAX_KYC_UPLOAD_BYTES = 5 * 1024 * 1024
export const KYC_ALLOWED_UPLOAD_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export const KYC_DOC_META: Record<KycDocKind, { title: string; subtitle: string; helper: string }> = {
  rc_book: {
    title: 'RC Book',
    subtitle: 'Vehicle Registration',
    helper: 'Chassis and engine numbers must be clearly readable',
  },
  driving_license: {
    title: 'Driving License',
    subtitle: 'Commercial Heavy Vehicle',
    helper: 'Full license in frame with the expiry date visible',
  },
  aadhaar: {
    title: 'Aadhaar (Combined)',
    subtitle: 'Front & back side',
    helper: 'Both sides in one clear photo, 12-digit number readable',
  },
  truck_photo: {
    title: 'Truck Photo',
    subtitle: 'Your vehicle',
    helper: 'Number plate clearly visible, full truck in frame',
  },
}

function createDocument(kind: KycDocKind): KycDocument {
  return {
    kind,
    status: 'pending',
    fileName: null,
    fileSizeBytes: null,
    fileType: null,
    progress: 0,
    rejectionReason: null,
    errorMessage: null,
    updatedAt: null,
  }
}

export function createInitialKycState(): KycSubmissionState {
  const docs = {} as Record<KycDocKind, KycDocument>
  for (const kind of KYC_DOC_KINDS) {
    docs[kind] = createDocument(kind)
  }
  return {
    docs,
    submitted: false,
    submittedAt: null,
    locked: false,
    lockedAt: null,
  }
}

/** Returns an error message for invalid uploads, or null when acceptable. */
export function validateUploadFile(file: Pick<File, 'size' | 'type'>): string | null {
  if (!KYC_ALLOWED_UPLOAD_TYPES.includes(file.type as (typeof KYC_ALLOWED_UPLOAD_TYPES)[number])) {
    return 'Unsupported file type. Use JPG, PNG, WEBP or PDF.'
  }
  if (file.size <= 0) {
    return 'That file looks empty. Choose a valid document scan or photo.'
  }
  if (file.size > MAX_KYC_UPLOAD_BYTES) {
    return 'File is too large. Maximum size is 5 MB.'
  }
  return null
}

function updateDoc(
  state: KycSubmissionState,
  kind: KycDocKind,
  patch: Partial<KycDocument>,
  at: string,
): KycSubmissionState {
  return {
    ...state,
    docs: {
      ...state.docs,
      [kind]: { ...state.docs[kind], ...patch, kind, updatedAt: at },
    },
  }
}

export function startUpload(
  state: KycSubmissionState,
  kind: KycDocKind,
  file: KycFileMeta,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  if (state.locked || state.docs[kind].status === 'accepted') return state
  return updateDoc(
    state,
    kind,
    {
      status: 'uploading',
      fileName: file.name,
      fileSizeBytes: file.sizeBytes,
      fileType: file.type,
      progress: 0,
      rejectionReason: null,
      errorMessage: null,
    },
    at,
  )
}

export function setUploadProgress(
  state: KycSubmissionState,
  kind: KycDocKind,
  progress: number,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  const doc = state.docs[kind]
  if (doc.status !== 'uploading') return state
  const clamped = Math.max(0, Math.min(100, Math.round(progress)))
  return updateDoc(state, kind, { progress: clamped }, at)
}

export function completeUpload(
  state: KycSubmissionState,
  kind: KycDocKind,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  const doc = state.docs[kind]
  if (doc.status !== 'uploading') return state
  return updateDoc(state, kind, { status: 'pending_review', progress: 100 }, at)
}

export function cancelUpload(
  state: KycSubmissionState,
  kind: KycDocKind,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  const doc = state.docs[kind]
  if (doc.status !== 'uploading') return state
  return updateDoc(
    state,
    kind,
    { status: 'pending', progress: 0, fileName: null, fileSizeBytes: null, fileType: null },
    at,
  )
}

/** Upload-error path: validation failure or transfer failure; retryable. */
export function failUpload(
  state: KycSubmissionState,
  kind: KycDocKind,
  message: string,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  if (state.locked) return state
  return updateDoc(
    state,
    kind,
    { status: 'error', errorMessage: message, progress: 0 },
    at,
  )
}

export function retryFromError(
  state: KycSubmissionState,
  kind: KycDocKind,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  const doc = state.docs[kind]
  if (doc.status !== 'error') return state
  return updateDoc(
    state,
    kind,
    {
      status: 'pending',
      errorMessage: null,
      fileName: null,
      fileSizeBytes: null,
      fileType: null,
    },
    at,
  )
}

/** Admin review outcome: rejection with the reviewer's verbatim reason. */
export function rejectDocument(
  state: KycSubmissionState,
  kind: KycDocKind,
  reason: string,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  const doc = state.docs[kind]
  if (doc.status === 'accepted' || doc.status === 'uploading' || doc.status === 'pending') {
    return state
  }
  return updateDoc(state, kind, { status: 'rejected', rejectionReason: reason, progress: 0 }, at)
}

export function acceptDocument(
  state: KycSubmissionState,
  kind: KycDocKind,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  const doc = state.docs[kind]
  if (doc.status !== 'pending_review' && doc.status !== 'rejected') return state
  const next = updateDoc(
    state,
    kind,
    { status: 'accepted', rejectionReason: null, errorMessage: null, progress: 100 },
    at,
  )
  const allAccepted = KYC_DOC_KINDS.every((k) => next.docs[k].status === 'accepted')
  if (allAccepted && !next.locked) {
    return { ...next, locked: true, lockedAt: at }
  }
  return next
}

/** Mock review pipeline: approves everything currently awaiting review. */
export function approvePendingReviews(
  state: KycSubmissionState,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  let next = state
  for (const kind of KYC_DOC_KINDS) {
    next = acceptDocument(next, kind, at)
  }
  return next
}

export function kycAcceptedCount(state: KycSubmissionState): number {
  return KYC_DOC_KINDS.filter((kind) => state.docs[kind].status === 'accepted').length
}

/** Generated design shows "50% Completed" at 2 of 4 accepted. */
export function kycCompletionPercent(state: KycSubmissionState): number {
  return Math.round((kycAcceptedCount(state) / KYC_DOC_KINDS.length) * 100)
}

export function canSubmitForVerification(state: KycSubmissionState): boolean {
  if (state.submitted || state.locked) return false
  return KYC_DOC_KINDS.every(
    (kind) => state.docs[kind].status === 'pending_review' || state.docs[kind].status === 'accepted',
  )
}

/** Human blockers for the disabled CTA, e.g. ["1 rejected", "1 uploading"]. */
export function kycSubmitBlockers(state: KycSubmissionState): string[] {
  const counts = { rejected: 0, uploading: 0, notUploaded: 0 }
  for (const kind of KYC_DOC_KINDS) {
    const status = state.docs[kind].status
    if (status === 'rejected') counts.rejected += 1
    else if (status === 'uploading') counts.uploading += 1
    else if (status === 'pending' || status === 'error') counts.notUploaded += 1
  }
  const parts: string[] = []
  if (counts.rejected > 0) parts.push(`${counts.rejected} rejected`)
  if (counts.uploading > 0) parts.push(`${counts.uploading} uploading`)
  if (counts.notUploaded > 0) parts.push(`${counts.notUploaded} not uploaded`)
  return parts
}

export function submitHelperText(state: KycSubmissionState): string | null {
  if (state.locked) return null
  if (state.submitted) return 'Submitted — under review'
  const blockers = kycSubmitBlockers(state)
  if (blockers.length === 0) return 'All 4 documents ready for verification'
  return `Upload all 4 documents to submit (${blockers.join(', ')})`
}

export function submitForVerification(
  state: KycSubmissionState,
  at: string = new Date().toISOString(),
): KycSubmissionState {
  if (!canSubmitForVerification(state)) return state
  return { ...state, submitted: true, submittedAt: at }
}

/**
 * Snapshot matching the generated Stitch mock (screen
 * e72905bab5794849b0fcb495b7c474bc): one document in each of the four
 * interactive states. Used by the `?demo=midflow` seed and tests.
 */
export function createMidflowDemoState(now: Date = new Date()): KycSubmissionState {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
  let s = createInitialKycState()
  s = startUpload(
    s,
    'rc_book',
    { name: 'rc-book-original.pdf', sizeBytes: Math.round(2.4 * 1024 * 1024), type: 'application/pdf' },
    at(1),
  )
  s = setUploadProgress(s, 'rc_book', 62, at(1))
  s = startUpload(
    s,
    'driving_license',
    { name: 'dl_scan_front_01.jpg', sizeBytes: Math.round(1.1 * 1024 * 1024), type: 'image/jpeg' },
    at(30),
  )
  s = completeUpload(s, 'driving_license', at(29))
  s = rejectDocument(s, 'driving_license', 'Expiry date is cut off. Retake with the full license in frame.', at(5))
  s = startUpload(
    s,
    'aadhaar',
    { name: 'aadhaar-combined.jpg', sizeBytes: Math.round(1.8 * 1024 * 1024), type: 'image/jpeg' },
    at(2),
  )
  s = completeUpload(s, 'aadhaar', at(2))
  s = startUpload(
    s,
    'truck_photo',
    { name: 'truck-view-mh12.jpg', sizeBytes: Math.round(3.1 * 1024 * 1024), type: 'image/jpeg' },
    at(1440),
  )
  s = completeUpload(s, 'truck_photo', at(1430))
  s = acceptDocument(s, 'truck_photo', at(120))
  return s
}
