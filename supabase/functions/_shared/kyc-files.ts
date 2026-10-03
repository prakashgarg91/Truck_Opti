/**
 * TO-126: Server-side KYC upload validation.
 *
 * Pure byte-level validation for driver KYC documents. The trusted
 * driver-kyc edge function downloads the stored object and validates the
 * actual bytes — a client-declared Content-Type alone is never trusted
 * (storage MIME lists are advisory; bytes are authoritative).
 *
 * No runtime-specific imports so this module is testable under both
 * Deno (edge runtime) and Node (--test type stripping).
 */

export const KYC_MAX_BYTES = 5 * 1024 * 1024 // 5 MiB

/** MIME types a KYC document may claim after byte sniffing. */
export const KYC_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type KycMimeType = (typeof KYC_ALLOWED_MIME_TYPES)[number]

export type KycObjectValidation =
  | { ok: true; mimeType: KycMimeType }
  | { ok: false; error: string }

/**
 * Detect the true file type from magic bytes, or null when unknown.
 * Recognizes JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A),
 * PDF (%PDF-) and WEBP (RIFF....WEBP).
 */
export function sniffKycFileType(bytes: Uint8Array): KycMimeType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'image/webp'
  }

  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  ) {
    return 'application/pdf'
  }

  return null
}

/**
 * Validate a stored KYC object: non-empty, at most 5 MiB, and bytes that
 * sniff to an allowed type. Returns the server-authoritative MIME type
 * on success (which may differ from any client-declared Content-Type).
 */
export function validateKycObject(sizeBytes: number, bytes: Uint8Array): KycObjectValidation {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: 'The uploaded file is empty. Choose a valid document scan or photo.' }
  }

  if (sizeBytes > KYC_MAX_BYTES) {
    return { ok: false, error: 'File is too large. Maximum size is 5 MB.' }
  }

  if (bytes.length === 0) {
    return { ok: false, error: 'The uploaded file has no readable content. Please re-upload.' }
  }

  const sniffed = sniffKycFileType(bytes)

  if (!sniffed) {
    return {
      ok: false,
      error: 'Unsupported file content. Use a JPG, PNG, WEBP image or a PDF document.',
    }
  }

  return { ok: true, mimeType: sniffed }
}
