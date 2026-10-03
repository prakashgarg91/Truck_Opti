/**
 * Client-side presentation helpers for the driver "Documents & KYC" screen.
 *
 * Terminology mirrors the admin "KYC Verification Detail" pairing screen
 * (Stitch screen d9fafd06c79345d2896c265eb12f6ea4): "Uploaded Documents",
 * "Pending review", "Review Needed", "Accepted", "Rejected".
 *
 * Authority (TO-127): review outcomes (pending_review/rejected/accepted),
 * submission and the locked "KYC Verified" state come ONLY from the
 * server via the TO-126 contract (`driverKycApi.ts`). This module holds
 * no ability to accept, reject, submit or complete a document — it only
 * manages honest client-local overlay state (a transfer in flight, a
 * validation error, retry) and merges fresh server state on top.
 */

export const KYC_DOC_KINDS = ['rc_book', 'driving_license', 'aadhaar', 'truck_photo'] as const

export type KycDocKind = (typeof KYC_DOC_KINDS)[number]

/**
 * pending       — not uploaded yet
 * uploading     — transfer in flight (client-local, indeterminate; never
 *                 carries a percentage)
 * pending_review— uploaded, awaiting admin verification ("Pending review")
 * rejected      — admin rejected with a reason ("Review Needed")
 * accepted      — admin approved ("Accepted")
 * error         — client validation or transfer failure (retryable)
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
  /** Server-owned field; always 0 from the backend. Not rendered. */
  progress: number
  rejectionReason: string | null
  errorMessage: string | null
  updatedAt: string | null
}

export interface KycSubmissionState {
  docs: Record<KycDocKind, KycDocument>
  /** Server-computed: every kind has an uploaded document. */
  submitted: boolean
  submittedAt: string | null
  /** Server-computed: every document accepted. The screen locks. */
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

/** Client-local: the transfer for this document is in flight. */
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

/** Client-local failure: validation error or failed transfer; retryable. */
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

/**
 * Applies a fresh server-computed state on top of the local one. The
 * server is authoritative for every document status, submission and the
 * locked state — EXCEPT for documents whose transfer is still in flight
 * locally (status 'uploading'), which would otherwise be clobbered by a
 * concurrent refresh. `forceKinds` lists documents whose in-flight
 * overlay should be dropped because their transfer just settled (the
 * caller then adopts the server outcome verbatim).
 */
export function mergeServerState(
  local: KycSubmissionState,
  server: KycSubmissionState,
  forceKinds: readonly KycDocKind[] = [],
): KycSubmissionState {
  const docs = {} as Record<KycDocKind, KycDocument>
  const forced = new Set(forceKinds)
  for (const kind of KYC_DOC_KINDS) {
    const inFlight = local.docs[kind].status === 'uploading' && !forced.has(kind)
    docs[kind] = inFlight ? local.docs[kind] : server.docs[kind]
  }
  return {
    docs,
    submitted: server.submitted,
    submittedAt: server.submittedAt,
    locked: server.locked,
    lockedAt: server.lockedAt,
  }
}

/**
 * Dev-only demo gating: the `?demo=midflow` fixture may fabricate a
 * mid-flow snapshot in development builds and tests only. A production
 * query string can never fabricate verification.
 */
export function demoQueryEnabled(dev: boolean, value: string | null): boolean {
  return dev === true && value === 'midflow'
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

/** Authoritative one-line summary for the profile entry badge. */
export type KycProfileSummary = {
  tone: 'verified' | 'action' | 'progress'
  label: string
}

/**
 * Maps the server-computed state to the profile entry badge. Returns
 * null when nothing has been uploaded yet (no claim to show) — callers
 * must not invent a status when the backend is unreachable.
 */
export function kycProfileSummary(state: KycSubmissionState): KycProfileSummary | null {
  if (state.locked) return { tone: 'verified', label: 'Verified' }
  const rejected = KYC_DOC_KINDS.some((kind) => state.docs[kind].status === 'rejected')
  if (rejected) return { tone: 'action', label: 'Action needed' }
  const uploaded = KYC_DOC_KINDS.some(
    (kind) => state.docs[kind].status === 'pending_review' || state.docs[kind].status === 'accepted',
  )
  if (uploaded) return { tone: 'progress', label: 'Pending review' }
  return null
}

/**
 * DEVELOPMENT/TEST FIXTURE ONLY (gated by demoQueryEnabled). Snapshot
 * matching the generated Stitch mock (screen
 * e72905bab5794849b0fcb495b7c474bc): one document in each of the four
 * interactive states. Never reachable from a production query string.
 */
export function createMidflowDemoState(now: Date = new Date()): KycSubmissionState {
  const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString()
  let s = createInitialKycState()
  // Transfer in flight (client-local, indeterminate — no percentage).
  s = startUpload(
    s,
    'rc_book',
    { name: 'rc-book-original.pdf', sizeBytes: Math.round(2.4 * 1024 * 1024), type: 'application/pdf' },
    at(1),
  )
  // Rejected with the reviewer's reason (server outcome, mirrored).
  s = updateDoc(
    s,
    'driving_license',
    {
      status: 'rejected',
      fileName: 'dl_scan_front_01.jpg',
      fileSizeBytes: Math.round(1.1 * 1024 * 1024),
      fileType: 'image/jpeg',
      rejectionReason: 'Expiry date is cut off. Retake with the full license in frame.',
    },
    at(5),
  )
  // Awaiting review (server outcome, mirrored).
  s = updateDoc(
    s,
    'aadhaar',
    {
      status: 'pending_review',
      fileName: 'aadhaar-combined.jpg',
      fileSizeBytes: Math.round(1.8 * 1024 * 1024),
      fileType: 'image/jpeg',
    },
    at(2),
  )
  // Accepted by review (server outcome, mirrored).
  s = updateDoc(
    s,
    'truck_photo',
    {
      status: 'accepted',
      fileName: 'truck-view-mh12.jpg',
      fileSizeBytes: Math.round(3.1 * 1024 * 1024),
      fileType: 'image/jpeg',
      progress: 100,
    },
    at(120),
  )
  return s
}
