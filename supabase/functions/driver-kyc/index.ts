import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAdminContext,
  requireDriverContext,
} from '../_shared/portal-auth.ts'
import { validateKycObject } from '../_shared/kyc-files.ts'

/**
 * TO-126 — Driver KYC backend: private storage authority plus a durable,
 * versioned, server-authoritative review record.
 *
 * Documents live in the PRIVATE `driver-docs` bucket under randomized
 * owner-scoped paths ({userId}/{kind}/{token}.{ext}). The bucket has no
 * public reads; every view is a short-lived signed URL that this trusted
 * function mints only for the document's owner or an authorized admin
 * (public.users.role, never user_metadata).
 *
 * Driver actions (state/upload/submit) run as the authenticated driver;
 * reviewDocument runs as an authorized admin only. Accept/reject writes
 * a versioned row guarded on the current version, so concurrent or
 * stale reviews fail with 409 instead of silently overwriting. The
 * all-accepted (locked) state is always computed server-side.
 */

const KYC_KINDS = ['rc_book', 'driving_license', 'aadhaar', 'truck_photo'] as const
type KycKind = (typeof KYC_KINDS)[number]

const SIGNED_URL_EXPIRES_SECONDS = 60
const MAX_REJECTION_REASON_LENGTH = 500
const MAX_ORIGINAL_NAME_LENGTH = 200

/** Randomized owner-scoped path contract: {userId}/{kind}/{token}.{ext}. */
const STORAGE_PATH_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(rc_book|driving_license|aadhaar|truck_photo)\/[A-Za-z0-9_-]{8,64}\.(jpg|jpeg|png|webp|pdf)$/

type KycDocumentRow = {
  kind: string
  version: number
  status: string
  storage_path: string
  mime_type: string
  size_bytes: number
  original_name: string | null
  rejection_reason: string | null
  uploaded_at: string
  reviewed_at: string | null
}

function isKycKind(value: unknown): value is KycKind {
  return typeof value === 'string' && (KYC_KINDS as readonly string[]).includes(value)
}

type KycRequest =
  | { action: 'state' }
  | { action: 'upload'; kind: KycKind; path: string; fileName?: string }
  | { action: 'submit' }
  | {
      action: 'review'
      driverId: string
      kind: KycKind
      version: number
      decision: 'accept' | 'reject'
      reason?: string
    }
  | { action: 'access'; kind: KycKind; driverId?: string; version?: number }

function parseRequestBody(body: unknown): KycRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid action is required.')
  }

  switch (body.action) {
    case 'state':
      return { action: 'state' }
    case 'submit':
      return { action: 'submit' }
    case 'upload': {
      if (!isKycKind(body.kind)) {
        throw new RequestError('A valid document kind is required.')
      }
      if (typeof body.path !== 'string' || body.path.length === 0 || body.path.length > 512) {
        throw new RequestError('A valid upload path is required.')
      }
      if (body.fileName !== undefined && typeof body.fileName !== 'string') {
        throw new RequestError('fileName must be a string.')
      }
      return {
        action: 'upload',
        kind: body.kind,
        path: body.path,
        fileName: body.fileName,
      }
    }
    case 'review': {
      if (typeof body.driverId !== 'string' || body.driverId.length === 0) {
        throw new RequestError('driverId is required.')
      }
      if (!isKycKind(body.kind)) {
        throw new RequestError('A valid document kind is required.')
      }
      if (!Number.isInteger(body.version) || (body.version as number) < 1) {
        throw new RequestError('A valid document version is required.')
      }
      if (body.decision !== 'accept' && body.decision !== 'reject') {
        throw new RequestError('decision must be accept or reject.')
      }
      if (body.reason !== undefined && typeof body.reason !== 'string') {
        throw new RequestError('reason must be a string.')
      }
      return {
        action: 'review',
        driverId: body.driverId,
        kind: body.kind,
        version: body.version as number,
        decision: body.decision,
        reason: body.reason,
      }
    }
    case 'access': {
      if (!isKycKind(body.kind)) {
        throw new RequestError('A valid document kind is required.')
      }
      if (body.driverId !== undefined && typeof body.driverId !== 'string') {
        throw new RequestError('driverId must be a string.')
      }
      if (body.version !== undefined && (!Number.isInteger(body.version) || (body.version as number) < 1)) {
        throw new RequestError('version must be a positive integer.')
      }
      return {
        action: 'access',
        kind: body.kind,
        driverId: body.driverId,
        version: body.version as number | undefined,
      }
    }
    default:
      throw new RequestError('Unsupported action.')
  }
}

/** Current = highest version per kind for the driver. */
async function loadCurrentDocuments(
  serviceClient: SupabaseClient,
  driverId: string,
): Promise<Map<KycKind, KycDocumentRow>> {
  const { data, error } = await serviceClient
    .from('driver_kyc_documents')
    .select(
      'kind,version,status,storage_path,mime_type,size_bytes,original_name,rejection_reason,uploaded_at,reviewed_at',
    )
    .eq('driver_id', driverId)
    .order('version', { ascending: false })

  if (error) {
    console.error('Failed to load KYC documents', error)
    throw new RequestError('Unable to load KYC documents.', 500, false)
  }

  const current = new Map<KycKind, KycDocumentRow>()
  for (const row of (data ?? []) as KycDocumentRow[]) {
    const kind = row.kind as KycKind
    if ((KYC_KINDS as readonly string[]).includes(kind) && !current.has(kind)) {
      current.set(kind, row)
    }
  }
  return current
}

/**
 * Server-authoritative submission state. `submitted` (all four documents
 * present) and `locked` (all four accepted) are computed here — the
 * client can never fabricate a verified state.
 */
function buildKycState(current: Map<KycKind, KycDocumentRow>) {
  const docs: Record<string, unknown> = {}
  const versions: Record<string, number> = {}
  let allPresent = true
  let allAccepted = true
  let submittedAt: string | null = null
  let lockedAt: string | null = null

  for (const kind of KYC_KINDS) {
    const row = current.get(kind)
    versions[kind] = row?.version ?? 0

    if (!row) {
      allPresent = false
      allAccepted = false
      docs[kind] = {
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
      continue
    }

    if (row.status !== 'accepted') allAccepted = false
    if (!submittedAt || row.uploaded_at > submittedAt) submittedAt = row.uploaded_at
    if (row.reviewed_at && (!lockedAt || row.reviewed_at > lockedAt)) lockedAt = row.reviewed_at

    docs[kind] = {
      kind,
      status: row.status,
      fileName: row.original_name ?? row.storage_path.split('/').pop() ?? null,
      fileSizeBytes: Number(row.size_bytes),
      fileType: row.mime_type,
      progress: 0,
      rejectionReason: row.status === 'rejected' ? row.rejection_reason : null,
      errorMessage: null,
      updatedAt: row.uploaded_at,
    }
  }

  return {
    docs,
    versions,
    submitted: allPresent,
    submittedAt: allPresent ? submittedAt : null,
    locked: allAccepted,
    lockedAt: allAccepted ? lockedAt : null,
  }
}

async function insertDocumentVersion(
  serviceClient: SupabaseClient,
  values: {
    driverId: string
    userId: string
    kind: KycKind
    storagePath: string
    mimeType: string
    sizeBytes: number
    originalName: string | null
  },
): Promise<void> {
  // A concurrent upload of the same kind could race on max(version); the
  // DB unique (driver_id, kind, version) plus the version-chain trigger
  // keep the record honest — retry once with a recomputed version.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data: lastRow, error: lastError } = await serviceClient
      .from('driver_kyc_documents')
      .select('version')
      .eq('driver_id', values.driverId)
      .eq('kind', values.kind)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle<{ version: number }>()

    if (lastError) {
      console.error('Failed to read current KYC version', lastError)
      throw new RequestError('Unable to register the document.', 500, false)
    }

    const { error: insertError } = await serviceClient
      .from('driver_kyc_documents')
      .insert({
        driver_id: values.driverId,
        user_id: values.userId,
        kind: values.kind,
        version: (lastRow?.version ?? 0) + 1,
        status: 'pending_review',
        storage_path: values.storagePath,
        mime_type: values.mimeType,
        size_bytes: values.sizeBytes,
        original_name: values.originalName,
      })

    if (!insertError) return

    const code = (insertError as { code?: string }).code
    const isVersionRace = code === '23505' || /out of chain/i.test(insertError.message)
    if (!isVersionRace || attempt === 1) {
      console.error('Failed to register KYC document', insertError)
      throw new RequestError('Unable to register the document.', 500, false)
    }
  }
}

/**
 * A viewer is either an authorized admin (explicit driverId required) or
 * the document's owning driver. Authority is resolved from the trusted
 * session + database role, never from user_metadata.
 */
async function resolveAccessContext(
  authorization: string | null,
  requestedDriverId: string | undefined,
) {
  try {
    const admin = await requireAdminContext(authorization)
    if (!requestedDriverId) {
      throw new RequestError('driverId is required for admin document access.', 400)
    }
    return {
      serviceClient: admin.serviceClient,
      driverId: requestedDriverId,
      isAdmin: true,
    }
  } catch (error) {
    // Non-admin callers fall through to the driver path; explicit bad
    // admin requests (400) are surfaced as-is.
    if (error instanceof RequestError && error.status === 400) throw error
  }

  const driver = await requireDriverContext(authorization)
  if (requestedDriverId && requestedDriverId !== driver.driverId) {
    throw new RequestError('You can only access your own documents.', 403)
  }
  return { serviceClient: driver.serviceClient, driverId: driver.driverId, isAdmin: false }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = parseRequestBody(await req.json())
    const authorization = req.headers.get('Authorization')

    if (body.action === 'state') {
      const { serviceClient, driverId } = await requireDriverContext(authorization)
      return jsonResponse({ state: buildKycState(await loadCurrentDocuments(serviceClient, driverId)) })
    }

    if (body.action === 'submit') {
      const { serviceClient, driverId } = await requireDriverContext(authorization)
      const current = await loadCurrentDocuments(serviceClient, driverId)

      const missing = KYC_KINDS.filter((kind) => !current.has(kind))
      if (missing.length > 0) {
        throw new RequestError(`Upload all four documents before submitting (missing: ${missing.join(', ')}).`, 400)
      }

      const rejected = KYC_KINDS.filter((kind) => current.get(kind)?.status === 'rejected')
      if (rejected.length > 0) {
        throw new RequestError(`Replace rejected documents before submitting (${rejected.join(', ')}).`, 400)
      }

      return jsonResponse({ state: buildKycState(current) })
    }

    if (body.action === 'upload') {
      const { caller, serviceClient, driverId } = await requireDriverContext(authorization)

      const path = body.path
      const isOwnPath =
        path.startsWith(`${caller.id}/`) &&
        STORAGE_PATH_PATTERN.test(path) &&
        path.includes(`/${body.kind}/`)

      if (!isOwnPath) {
        throw new RequestError('Upload path must be randomized and owner-scoped.', 400)
      }

      const storage = serviceClient.storage.from('driver-docs')
      const { data: blob, error: downloadError } = await storage.download(path)

      if (downloadError || !blob) {
        console.error('Failed to download uploaded KYC object', downloadError)
        throw new RequestError('Uploaded file could not be found. Upload the document again.', 404)
      }

      const bytes = new Uint8Array(await blob.arrayBuffer())
      const validation = validateKycObject(bytes.byteLength, bytes)

      if (!validation.ok) {
        // Invalid bytes must not linger in storage.
        await storage.remove([path])
        throw new RequestError(validation.error, 400)
      }

      const originalName =
        typeof body.fileName === 'string' && body.fileName.trim().length > 0
          ? body.fileName.trim().slice(0, MAX_ORIGINAL_NAME_LENGTH)
          : null

      await insertDocumentVersion(serviceClient, {
        driverId,
        userId: caller.id,
        kind: body.kind,
        storagePath: path,
        mimeType: validation.mimeType,
        sizeBytes: bytes.byteLength,
        originalName,
      })

      return jsonResponse({ state: buildKycState(await loadCurrentDocuments(serviceClient, driverId)) })
    }

    if (body.action === 'review') {
      const { caller, serviceClient } = await requireAdminContext(authorization)

      const { data: driver, error: driverError } = await serviceClient
        .from('drivers')
        .select('id')
        .eq('id', body.driverId)
        .maybeSingle<{ id: string }>()

      if (driverError) {
        console.error('Failed to resolve reviewed driver', driverError)
        throw new RequestError('Unable to review the document.', 500, false)
      }
      if (!driver?.id) {
        throw new RequestError('Driver not found.', 404)
      }

      const trimmedReason = typeof body.reason === 'string' ? body.reason.trim() : ''
      if (body.decision === 'reject' && trimmedReason.length === 0) {
        throw new RequestError('A rejection reason is required.', 400)
      }

      const reviewedAt = new Date().toISOString()
      const patch =
        body.decision === 'accept'
          ? {
              status: 'accepted',
              rejection_reason: null,
              reviewed_by: caller.id,
              reviewed_at: reviewedAt,
            }
          : {
              status: 'rejected',
              rejection_reason: trimmedReason.slice(0, MAX_REJECTION_REASON_LENGTH),
              reviewed_by: caller.id,
              reviewed_at: reviewedAt,
            }

      // Version-guarded write: only the current pending review can move.
      const { data: updated, error: updateError } = await serviceClient
        .from('driver_kyc_documents')
        .update(patch)
        .match({ driver_id: body.driverId, kind: body.kind, version: body.version })
        .eq('status', 'pending_review')
        .select('id')

      if (updateError) {
        console.error('Failed to record KYC review', updateError)
        throw new RequestError('Unable to record the review.', 500, false)
      }
      if (!updated || updated.length === 0) {
        throw new RequestError(
          'This document version was already reviewed or replaced. Refresh and try again.',
          409,
        )
      }

      return jsonResponse({
        state: buildKycState(await loadCurrentDocuments(serviceClient, body.driverId)),
      })
    }

    // action === 'access' — short-lived signed URL for owner or admin.
    const { serviceClient, driverId } = await resolveAccessContext(authorization, body.driverId)

    let query = serviceClient
      .from('driver_kyc_documents')
      .select('version,status,storage_path')
      .eq('driver_id', driverId)
      .eq('kind', body.kind)

    if (body.version !== undefined) {
      query = query.eq('version', body.version)
    }

    const { data: row, error: rowError } = await query
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle<{ version: number; status: string; storage_path: string }>()

    if (rowError) {
      console.error('Failed to resolve KYC document for access', rowError)
      throw new RequestError('Unable to open the document.', 500, false)
    }
    if (!row) {
      throw new RequestError('Document not found.', 404)
    }

    const { data: signed, error: signedError } = await serviceClient.storage
      .from('driver-docs')
      .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRES_SECONDS)

    if (signedError || !signed) {
      console.error('Failed to sign KYC document URL', signedError)
      throw new RequestError('Unable to open the document.', 500, false)
    }

    return jsonResponse({
      url: signed.signedUrl,
      expiresIn: SIGNED_URL_EXPIRES_SECONDS,
      kind: body.kind,
      version: row.version,
      status: row.status,
    })
  } catch (error) {
    return handleRequestError('driver-kyc', error)
  }
})
