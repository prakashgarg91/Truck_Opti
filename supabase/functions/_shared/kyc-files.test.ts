/**
 * TO-126 — Unit tests for the server-side KYC byte validator.
 * Pure module: runs under Node (type stripping) and Deno alike.
 *   node --test supabase/functions/_shared/kyc-files.test.ts
 */
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  KYC_ALLOWED_MIME_TYPES,
  KYC_MAX_BYTES,
  sniffKycFileType,
  validateKycObject,
} from './kyc-files.ts'

const jpegBytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])
const pngBytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00])
const webpBytes = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
])
const pdfBytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])

test('sniffs the four allowed KYC file types from magic bytes', () => {
  assert.equal(sniffKycFileType(jpegBytes), 'image/jpeg')
  assert.equal(sniffKycFileType(pngBytes), 'image/png')
  assert.equal(sniffKycFileType(webpBytes), 'image/webp')
  assert.equal(sniffKycFileType(pdfBytes), 'application/pdf')
})

test('returns null for spoofed or unknown content regardless of declared type', () => {
  // A text/plain payload renamed to .pdf ("spoofed" content type).
  const textAsPdf = Uint8Array.from(new TextEncoder().encode('hello world, not a document'))
  assert.equal(sniffKycFileType(textAsPdf), null)
  assert.equal(sniffKycFileType(new Uint8Array(0)), null)
  // Truncated PDF header must not pass.
  assert.equal(sniffKycFileType(pdfBytes.slice(0, 4)), null)
  // RIFF container that is not WEBP must not pass.
  const riffWave = Uint8Array.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
  ])
  assert.equal(sniffKycFileType(riffWave), null)
})

test('validateKycObject accepts every allowed type and returns the sniffed MIME', () => {
  for (const [bytes, mime] of [
    [jpegBytes, 'image/jpeg'],
    [pngBytes, 'image/png'],
    [webpBytes, 'image/webp'],
    [pdfBytes, 'application/pdf'],
  ] as const) {
    const result = validateKycObject(bytes.length, bytes)
    assert.deepEqual(result, { ok: true, mimeType: mime })
  }
  assert.deepEqual([...KYC_ALLOWED_MIME_TYPES].sort(), [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
  ])
})

test('validateKycObject rejects empty payloads', () => {
  const empty = validateKycObject(0, new Uint8Array(0))
  assert.equal(empty.ok, false)
  assert.match((empty as { error: string }).error, /empty/i)
  assert.equal(validateKycObject(-1, jpegBytes).ok, false)
})

test('validateKycObject rejects payloads over the 5 MiB limit', () => {
  const oversize = validateKycObject(KYC_MAX_BYTES + 1, jpegBytes)
  assert.equal(oversize.ok, false)
  assert.match((oversize as { error: string }).error, /5 MB/)

  // Exactly at the limit is allowed.
  const atLimit = validateKycObject(KYC_MAX_BYTES, jpegBytes)
  assert.equal(atLimit.ok, true)
})

test('validateKycObject rejects byte-spoofed files whose content is not a KYC type', () => {
  // Declared as application/pdf at upload time but actually text bytes.
  const spoofed = Uint8Array.from(new TextEncoder().encode('<html>not a kyc doc</html>'))
  const result = validateKycObject(spoofed.length, spoofed)
  assert.equal(result.ok, false)
  assert.match((result as { error: string }).error, /Unsupported file content/)
})
