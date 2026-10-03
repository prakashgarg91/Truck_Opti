/**
 * TO-126 — Frontend adapter for the driver KYC backend.
 *
 * Every method talks to the trusted `driver-kyc` edge function, which is
 * the only authority for KYC state: documents live in the PRIVATE
 * driver-docs bucket, review state is versioned server-side, and the
 * all-accepted (locked) state is computed by the server. Nothing here
 * simulates a transition — a state shown by this adapter was returned by
 * the backend.
 *
 * Upload flow (uploadDocument): the browser uploads the raw file to the
 * private bucket under a randomized owner-scoped path
 * ({userId}/{kind}/{token}.{ext}) using the authenticated storage
 * policies, then asks the function to validate the stored bytes
 * (≤5 MiB, JPEG/PNG/WebP/PDF magic bytes) and register the next chain
 * version. Invalid content is removed server-side and surfaced as an
 * error.
 */

import { supabase } from '../lib/supabase'
import { UserFacingError, reportFunctionFailure, resolveFunctionUserMessage } from '../utils/userFacingError'
import {
  KYC_DOC_KINDS,
  validateUploadFile,
  type KycDocKind,
  type KycDocStatus,
  type KycDocument,
  type KycSubmissionState,
} from './driverKycDocuments'

const KYC_FUNCTION_NAME = 'driver-kyc'

/** Server payload for one document kind (camelCase, mirrors KycDocument). */
export interface KycApiDocumentPayload {
  kind: KycDocKind
  status: KycDocStatus
  fileName: string | null
  fileSizeBytes: number | null
  fileType: string | null
  progress: number
  rejectionReason: string | null
  errorMessage: string | null
  updatedAt: string | null
}

export interface KycApiStatePayload {
  docs: Partial<Record<KycDocKind, KycApiDocumentPayload>>
  versions?: Partial<Record<KycDocKind, number>>
  submitted: boolean
  submittedAt: string | null
  locked: boolean
  lockedAt: string | null
}

/**
 * KycSubmissionState plus the server-authoritative current version per
 * document kind (0 = none uploaded). The version is what
 * reviewDocument must be called with, so it is carried through
 * deliberately (TO-126 metadata extension).
 */
export interface KycApiSubmissionState extends KycSubmissionState {
  versions: Record<KycDocKind, number>
}

export type KycReviewDecision = 'accept' | 'reject'

export interface KycDocumentAccess {
  url: string
  /** Seconds the signed URL stays valid (short-lived by contract). */
  expiresIn: number
  kind: KycDocKind
  version: number
  status: string
}

function emptyDocument(kind: KycDocKind): KycDocument {
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

/** Normalizes a server payload into a complete KycApiSubmissionState. */
export function normalizeKycState(payload: KycApiStatePayload | null | undefined): KycApiSubmissionState {
  const docs = {} as Record<KycDocKind, KycDocument>
  const versions = {} as Record<KycDocKind, number>

  for (const kind of KYC_DOC_KINDS) {
    docs[kind] = emptyDocument(kind)
    versions[kind] = 0
  }

  for (const kind of Object.keys(payload?.docs ?? {}) as KycDocKind[]) {
    const doc = payload?.docs?.[kind]
    if (doc) {
      docs[kind] = { ...docs[kind], ...doc, kind, progress: 0, errorMessage: null }
    }
  }
  for (const kind of Object.keys(payload?.versions ?? {}) as KycDocKind[]) {
    const version = payload?.versions?.[kind]
    if (typeof version === 'number' && Number.isFinite(version)) {
      versions[kind] = Math.max(0, Math.round(version))
    }
  }

  return {
    docs,
    versions,
    submitted: payload?.submitted === true,
    submittedAt: payload?.submittedAt ?? null,
    locked: payload?.locked === true,
    lockedAt: payload?.lockedAt ?? null,
  }
}

async function invokeKycFunction<T>(
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  try {
    const { data, error } = await supabase.functions.invoke<T>(KYC_FUNCTION_NAME, { body })

    if (error) {
      reportFunctionFailure(KYC_FUNCTION_NAME, error)
      throw new UserFacingError(resolveFunctionUserMessage(error, fallbackMessage))
    }

    return data as T
  } catch (caught) {
    if (caught instanceof UserFacingError) throw caught
    reportFunctionFailure(KYC_FUNCTION_NAME, caught)
    throw new UserFacingError(fallbackMessage)
  }
}

function extensionForType(type: string): string {
  switch (type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'application/pdf':
      return 'pdf'
    default:
      return 'bin'
  }
}

/** Server-computed KYC state for the signed-in driver. */
export async function getState(): Promise<KycSubmissionState> {
  const data = await invokeKycFunction<{ state: KycApiStatePayload }>(
    { action: 'state' },
    'Could not load your KYC status. Please try again.',
  )
  return normalizeKycState(data?.state)
}

/**
 * Uploads one KYC document (validating locally first), then has the
 * trusted function validate the stored bytes and register the next
 * version. Returns the fresh server-computed state.
 */
export async function uploadDocument(kind: KycDocKind, file: File): Promise<KycSubmissionState> {
  const validationError = validateUploadFile(file)
  if (validationError) {
    throw new UserFacingError(validationError)
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getUser()
  const user = sessionData?.user
  if (sessionError || !user) {
    throw new UserFacingError('Sign in as a driver to upload KYC documents.')
  }

  const path = `${user.id}/${kind}/${crypto.randomUUID()}.${extensionForType(file.type)}`
  const { error: uploadError } = await supabase.storage
    .from('driver-docs')
    .upload(path, file, { contentType: file.type, upsert: false })

  if (uploadError) {
    reportFunctionFailure('driver-kyc:storage-upload', uploadError)
    throw new UserFacingError('The document upload failed. Please try again.')
  }

  const data = await invokeKycFunction<{ state: KycApiStatePayload }>(
    { action: 'upload', kind, path, fileName: file.name },
    'The document could not be verified. Please try again.',
  )
  return normalizeKycState(data?.state)
}

/**
 * Hands the complete document set to verification. The server refuses
 * unless all four documents exist and none is rejected.
 */
export async function submit(): Promise<KycSubmissionState> {
  const data = await invokeKycFunction<{ state: KycApiStatePayload }>(
    { action: 'submit' },
    'The submission failed. Please try again.',
  )
  return normalizeKycState(data?.state)
}

/**
 * Admin review of one document version. Conflicts (already reviewed or
 * replaced versions) fail with a refresh-and-retry message instead of
 * silently overwriting.
 */
export async function reviewDocument(
  driverId: string,
  kind: KycDocKind,
  version: number,
  decision: KycReviewDecision,
  reason?: string,
): Promise<KycSubmissionState> {
  if (!driverId) {
    throw new UserFacingError('A driver is required to review a document.')
  }
  if (!Number.isInteger(version) || version < 1) {
    throw new UserFacingError('A valid document version is required.')
  }
  if (decision === 'reject' && !(reason ?? '').trim()) {
    throw new UserFacingError('A rejection reason is required.')
  }

  const data = await invokeKycFunction<{ state: KycApiStatePayload }>(
    { action: 'review', driverId, kind, version, decision, reason: reason?.trim() || undefined },
    decision === 'accept'
      ? 'The document could not be accepted. Refresh and try again.'
      : 'The document could not be rejected. Refresh and try again.',
  )
  return normalizeKycState(data?.state)
}

/**
 * Short-lived signed access to one document (current version unless
 * specified). Owners access their own documents; admins pass driverId.
 */
export async function getDocumentAccessUrl(
  kind: KycDocKind,
  options: { driverId?: string; version?: number } = {},
): Promise<KycDocumentAccess> {
  const data = await invokeKycFunction<KycDocumentAccess>(
    { action: 'access', kind, driverId: options.driverId, version: options.version },
    'The document could not be opened. Please try again.',
  )
  if (!data?.url) {
    throw new UserFacingError('The document could not be opened. Please try again.')
  }
  return data
}
