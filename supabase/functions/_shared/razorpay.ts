/**
 * TO-152 Razorpay helpers: pure, no Deno globals, no secrets, no network.
 * Runs under Deno (Edge) and under vitest/Node (frontend/src/lib/razorpayWebhook.test.ts).
 * All decision logic of the three Razorpay Edge functions lives here or in activation.ts.
 */

/** Hard cap for a webhook body. Razorpay events are a few KB. */
export const MAX_WEBHOOK_BODY_BYTES = 256 * 1024

const HEX_PATTERN = /^[0-9a-f]+$/
const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]{6,60}$/
const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]{6,60}$/
const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const encoder = new TextEncoder()

function subtle(): SubtleCrypto {
  const impl = globalThis.crypto?.subtle
  if (!impl) {
    throw new Error('Web Crypto is not available')
  }
  return impl
}

function toBytes(value: string | Uint8Array): BufferSource {
  return (typeof value === 'string' ? encoder.encode(value) : value) as BufferSource
}

/** Strict UTF-8 decode (invalid bytes fail instead of becoming U+FFFD); a leading BOM is kept. */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    return null
  }
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = ''
  for (let index = 0; index < bytes.length; index += 1) {
    out += bytes[index].toString(16).padStart(2, '0')
  }
  return out
}

/** HMAC-SHA256 of a UTF-8 message, lowercase hex. */
export async function hmacSha256Hex(secret: string, message: string | Uint8Array): Promise<string> {
  const key = await subtle().importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await subtle().sign('HMAC', key, toBytes(message))
  return bytesToHex(new Uint8Array(mac))
}

/** SHA-256 of a UTF-8 string, lowercase hex. */
export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const digest = await subtle().digest('SHA-256', toBytes(value))
  return bytesToHex(new Uint8Array(digest))
}

/**
 * Constant-time string comparison. The loop always runs over the longer input, the length
 * difference is folded into the result, and there is no early exit.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let index = 0; index < length; index += 1) {
    const left = index < a.length ? a.charCodeAt(index) : 0
    const right = index < b.length ? b.charCodeAt(index) : 0
    diff |= left ^ right
  }
  return diff === 0
}

/**
 * Verifies a Razorpay HMAC-SHA256 hex signature of `message` in constant time.
 * Missing secret, missing or malformed signature all fail closed.
 */
export async function verifyHmacSignature(
  secret: string | null | undefined,
  message: string | Uint8Array,
  signature: string | null | undefined,
): Promise<boolean> {
  if (!secret || typeof signature !== 'string') {
    return false
  }
  const candidate = signature.trim().toLowerCase()
  if (candidate.length !== 64 || !HEX_PATTERN.test(candidate)) {
    return false
  }
  const expected = await hmacSha256Hex(secret, message)
  return timingSafeEqualStrings(expected, candidate)
}

/** Checkout callback signature: HMAC-SHA256 of `order_id|payment_id` with the key secret. */
export function verifyCheckoutSignature(
  keySecret: string | null | undefined,
  orderId: string,
  paymentId: string,
  signature: string | null | undefined,
): Promise<boolean> {
  return verifyHmacSignature(keySecret, `${orderId}|${paymentId}`, signature)
}

/** Webhook signature: HMAC-SHA256 of the RAW body with the webhook secret. */
export function verifyWebhookSignature(
  webhookSecret: string | null | undefined,
  rawBody: string | Uint8Array,
  signature: string | null | undefined,
): Promise<boolean> {
  return verifyHmacSignature(webhookSecret, rawBody, signature)
}

export function isValidOrderId(value: unknown): value is string {
  return typeof value === 'string' && ORDER_ID_PATTERN.test(value)
}

export function isValidPaymentId(value: unknown): value is string {
  return typeof value === 'string' && PAYMENT_ID_PATTERN.test(value)
}

export function isValidEventId(value: unknown): value is string {
  return typeof value === 'string' && EVENT_ID_PATTERN.test(value)
}

export function utf8ByteLength(value: string): number {
  return encoder.encode(value).length
}

export type CappedBody = { ok: true; text: string } | { ok: false; reason: 'too_large' | 'unreadable' }
export type CappedBytes = { ok: true; bytes: Uint8Array } | { ok: false; reason: 'too_large' | 'unreadable' }

/**
 * Reads a request body as text, aborting as soon as the cap is exceeded
 * (the declared content-length is only a hint and is checked first).
 */
export async function readCappedBytes(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number = MAX_WEBHOOK_BODY_BYTES,
  declaredLength?: string | null,
): Promise<CappedBytes> {
  if (declaredLength) {
    const declared = Number(declaredLength)
    if (Number.isFinite(declared) && declared > maxBytes) {
      return { ok: false, reason: 'too_large' }
    }
  }
  if (!stream) {
    return { ok: true, bytes: new Uint8Array(0) }
  }
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        return { ok: false, reason: 'too_large' }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return { ok: true, bytes: merged }
}

/** Capped read decoded as UTF-8 text (for small JSON bodies). */
export async function readCappedText(
  stream: ReadableStream<Uint8Array> | null,
  maxBytes: number = MAX_WEBHOOK_BODY_BYTES,
  declaredLength?: string | null,
): Promise<CappedBody> {
  const raw = await readCappedBytes(stream, maxBytes, declaredLength)
  if (!raw.ok) return raw
  const text = decodeUtf8Strict(raw.bytes)
  return text === null ? { ok: false, reason: 'unreadable' } : { ok: true, text }
}

// ---------------------------------------------------------------------------
// Webhook outcome mapping
// ---------------------------------------------------------------------------

export interface RpcOutcome {
  data: unknown
  error: { message?: string; code?: string } | null
}

export interface HttpDecision {
  status: number
  body: Record<string, unknown>
  /** Safe, secret-free token for logs. */
  log: string
  level: 'info' | 'error'
}

const OK_RESULTS = new Set([
  'activated',
  'replay',
  'duplicate',
  'orphan',
  'ignored',
  'failed_recorded',
  'refunded',
  'past_due',
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null
}

/**
 * Maps the database answer for one webhook delivery to an HTTP answer.
 * 200 for every ok result and for every non-retryable refusal (the database ledgers it), 500 ONLY
 * when the failure is retryable or the database could not be reached.
 */
export function mapWebhookOutcome(outcome: RpcOutcome): HttpDecision {
  if (outcome.error) {
    return { status: 500, body: { error: 'temporarily_unavailable' }, log: 'rpc_error', level: 'error' }
  }
  const data = asRecord(outcome.data)
  if (!data || typeof data.ok !== 'boolean') {
    return { status: 500, body: { error: 'temporarily_unavailable' }, log: 'rpc_malformed', level: 'error' }
  }
  if (data.ok) {
    const result = typeof data.result === 'string' ? data.result : ''
    if (!OK_RESULTS.has(result)) {
      // Unknown success word from a newer function version: it was recorded, so stop the retries.
      return { status: 200, body: { ok: true, result: 'ignored' }, log: 'ok:unknown_result', level: 'info' }
    }
    return { status: 200, body: { ok: true, result }, log: `ok:${result}`, level: 'info' }
  }
  const code = typeof data.error === 'string' && /^[A-Za-z_]{1,64}$/.test(data.error) ? data.error : 'rejected'
  if (data.retryable === true) {
    return { status: 500, body: { error: 'retry_later' }, log: `retryable:${code}`, level: 'error' }
  }
  // Not retryable: the database has ledgered the refusal, so Razorpay must stop retrying (200).
  return { status: 200, body: { ok: false, error: code }, log: `refused:${code}`, level: 'error' }
}

export interface WebhookRequestParts {
  eventId: string | null
  eventType: string
  payload: Record<string, unknown>
}

export type ParsedWebhook =
  | { ok: true; value: WebhookRequestParts }
  | { ok: false; error: 'invalid_json' | 'event_type_missing' }

/** Parses an ALREADY signature-verified raw body plus the event id header. */
export function parseWebhookRequest(
  rawBody: string,
  eventIdHeader: string | null,
  payloadSha256: string,
): ParsedWebhook {
  const header = typeof eventIdHeader === 'string' ? eventIdHeader.trim() : ''
  // A signed body without a usable event id is still deduplicated, by its own hash.
  const eventId = isValidEventId(header) ? header : `sha_${payloadSha256}`
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody)
  } catch {
    return { ok: false, error: 'invalid_json' }
  }
  const payload = asRecord(parsed)
  if (!payload) {
    return { ok: false, error: 'invalid_json' }
  }
  const eventType = typeof payload.event === 'string' ? payload.event.trim() : ''
  if (!eventType || eventType.length > 128) {
    return { ok: false, error: 'event_type_missing' }
  }
  return { ok: true, value: { eventId, eventType, payload } }
}

// ---------------------------------------------------------------------------
// Payment fetch confirmation (verify path)
// ---------------------------------------------------------------------------

export interface RazorpayPaymentEntity {
  id?: unknown
  order_id?: unknown
  status?: unknown
  amount?: unknown
  amount_refunded?: unknown
  currency?: unknown
  method?: unknown
}

export type PaymentCheck =
  | { ok: true; amountPaise: number; currency: string; method: string }
  | { ok: false; error: 'payment_not_captured' | 'payment_failed' | 'payment_refunded' | 'payment_mismatch' | 'payment_amount_invalid' }

/**
 * Confirms what Razorpay itself reports for the payment: captured, same order and payment id,
 * integer paise amount, INR. The amount is then compared with the stored total inside the database.
 */
export function checkFetchedPayment(entity: unknown, orderId: string, paymentId: string): PaymentCheck {
  const payment = asRecord(entity) as RazorpayPaymentEntity | null
  if (!payment || payment.id !== paymentId || payment.order_id !== orderId) {
    return { ok: false, error: 'payment_mismatch' }
  }
  if (payment.status === 'authorized' || payment.status === 'created') {
    return { ok: false, error: 'payment_not_captured' }
  }
  if (payment.status === 'failed' || payment.status === 'refunded') {
    return { ok: false, error: 'payment_failed' }
  }
  if (payment.status !== 'captured') {
    return { ok: false, error: 'payment_mismatch' }
  }
  if (payment.amount_refunded !== undefined && payment.amount_refunded !== null && payment.amount_refunded !== 0) {
    return { ok: false, error: 'payment_refunded' }
  }
  if (typeof payment.amount !== 'number' || !Number.isSafeInteger(payment.amount) || payment.amount <= 0) {
    return { ok: false, error: 'payment_amount_invalid' }
  }
  if (payment.currency !== 'INR') {
    return { ok: false, error: 'payment_mismatch' }
  }
  const method = typeof payment.method === 'string' && /^[a-z_]{1,32}$/.test(payment.method) ? payment.method : 'unknown'
  return { ok: true, amountPaise: payment.amount, currency: 'INR', method }
}
