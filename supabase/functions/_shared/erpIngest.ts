// ERP ingest helpers (TO-151 receiver): pure, no Deno globals, no secrets, no network.
// Runs under Deno (supabase/functions/erp-ingest) and under vitest/Node
// (frontend/src/lib/erpIngest.test.ts). All decision logic of the receiver lives here.

import { decodeUtf8Strict } from './razorpay.ts'

/** Hard cap for the raw body (matches the 1 MB cap inside erp_event_ingest). */
export const MAX_ERP_BODY_BYTES = 1024 * 1024

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SECRET_LENGTH = 512
const MAX_EVENT_ID_LENGTH = 200

export interface ErpIngestRequest {
  connectionId: string
  secret: string
  externalEventId: string
  lines: unknown[]
}

export type ErpParseError =
  | 'invalid_json'
  | 'invalid_body'
  | 'invalid_connection_id'
  | 'missing_secret'
  | 'invalid_event_id'
  | 'invalid_lines'

export type ParsedErpRequest = { ok: true; value: ErpIngestRequest } | { ok: false; error: ErpParseError }

export interface ErpHeaders {
  authorization?: string | null
  secretHeader?: string | null
}

/** Secret from the Authorization Bearer header, then x-truckopti-secret. Null when neither is set. */
export function secretFromHeaders(headers: ErpHeaders): string | null {
  const auth = headers.authorization?.trim() ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(auth)
  if (match && match[1].trim()) return match[1].trim()
  const custom = headers.secretHeader?.trim() ?? ''
  return custom || null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The header secret wins over a body secret so proxies that log bodies never see it. */
export function parseErpRequest(text: string, headers: ErpHeaders): ParsedErpRequest {
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return { ok: false, error: 'invalid_json' }
  }
  if (!isPlainObject(body)) return { ok: false, error: 'invalid_body' }

  const connectionId = typeof body.connection_id === 'string' ? body.connection_id.trim() : ''
  if (!UUID_PATTERN.test(connectionId)) return { ok: false, error: 'invalid_connection_id' }

  const headerSecret = secretFromHeaders(headers)
  const bodySecret = typeof body.secret === 'string' ? body.secret : ''
  const secret = headerSecret ?? bodySecret
  if (!secret || secret.length > MAX_SECRET_LENGTH) return { ok: false, error: 'missing_secret' }

  const eventId = typeof body.external_event_id === 'string' ? body.external_event_id.trim() : ''
  if (!eventId || eventId.length > MAX_EVENT_ID_LENGTH) return { ok: false, error: 'invalid_event_id' }

  if (!Array.isArray(body.lines)) return { ok: false, error: 'invalid_lines' }

  return {
    ok: true,
    value: { connectionId: connectionId.toLowerCase(), secret, externalEventId: eventId, lines: body.lines },
  }
}

/** Strict-UTF-8 decode of the raw bytes, then parse. */
export function parseErpBytes(bytes: Uint8Array, headers: ErpHeaders): ParsedErpRequest {
  const text = decodeUtf8Strict(bytes)
  if (text === null) return { ok: false, error: 'invalid_body' }
  return parseErpRequest(text, headers)
}

export interface ErpHttpDecision {
  status: number
  body: Record<string, unknown>
  level: 'info' | 'error'
  /** Safe log text: codes only, never secrets, lines or problems. */
  log: string
}

/** Codes the SQL returns for a request the ERP can fix: 400. */
const BAD_REQUEST_CODES = new Set(['event_id_required', 'no_lines', 'too_many_lines'])
/** Business refusals that are not a transient failure: 403. */
const FORBIDDEN_CODES = new Set(['connection_not_active', 'agency_not_operational'])
/** Subscription guard SQLSTATEs raised by agency_order_import (limit, read-only, dispatch). */
const SUBSCRIPTION_SQLSTATES = new Set(['SB001', 'SB002', 'SB003'])

/**
 * Maps the RPC outcome to one HTTP answer.
 * 200 accepted/duplicate/rejected (problems in the body), 401 bad_credentials (uniform body),
 * 403 not active / not operational / subscription refusal, 413 too large, 409 event id reused,
 * 400 malformed request, 422 other typed import refusals, 500 only for retryable failures.
 * 429 is reserved for a future rate limit.
 */
export function mapErpOutcome(outcome: {
  data: unknown
  error: { message?: string; code?: string } | null
}): ErpHttpDecision {
  if (outcome.error) {
    const code = outcome.error.code ?? ''
    if (SUBSCRIPTION_SQLSTATES.has(code)) {
      return { status: 403, body: { ok: false, error: 'subscription_limit' }, level: 'info', log: `refused: subscription ${code}` }
    }
    return {
      status: 500,
      body: { ok: false, error: 'temporarily_unavailable' },
      level: 'error',
      log: `rpc failed: ${code || 'unknown'}`,
    }
  }

  const data = outcome.data
  if (!isPlainObject(data) || typeof data.ok !== 'boolean') {
    return { status: 500, body: { ok: false, error: 'temporarily_unavailable' }, level: 'error', log: 'unexpected rpc result' }
  }

  if (data.ok) {
    const result = data.outcome === 'duplicate' ? 'duplicate' : 'accepted'
    const body: Record<string, unknown> = { ok: true, outcome: result }
    if (typeof data.batch_id === 'string') body.batch_id = data.batch_id
    return { status: 200, body, level: 'info', log: result }
  }

  const code = typeof data.error === 'string' ? data.error : 'import_refused'

  if (code === 'bad_credentials') {
    return { status: 401, body: { ok: false, error: 'bad_credentials' }, level: 'info', log: 'bad_credentials' }
  }
  if (code === 'invalid_lines') {
    const outcomeName = data.outcome === 'duplicate' ? 'duplicate' : 'rejected'
    return {
      status: 200,
      body: { ok: false, outcome: outcomeName, error: 'invalid_lines', problems: Array.isArray(data.problems) ? data.problems : [] },
      level: 'info',
      log: `rejected: ${outcomeName}`,
    }
  }
  if (code === 'payload_too_large') {
    return { status: 413, body: { ok: false, error: code }, level: 'info', log: code }
  }
  if (FORBIDDEN_CODES.has(code)) {
    return { status: 403, body: { ok: false, error: code }, level: 'info', log: code }
  }
  if (code === 'event_id_reused') {
    return { status: 409, body: { ok: false, error: code }, level: 'info', log: code }
  }
  if (BAD_REQUEST_CODES.has(code)) {
    return { status: 400, body: { ok: false, error: code }, level: 'info', log: code }
  }
  // Other typed, state-dependent import refusals: nothing stored, a corrected retry works.
  const body: Record<string, unknown> = { ok: false, error: code }
  if (Array.isArray(data.refs)) body.refs = data.refs
  return { status: 422, body, level: 'info', log: `refused: ${code}` }
}

/** HTTP answer for a request-level failure before the RPC. */
export function mapParseError(error: string): { status: number; body: Record<string, unknown> } {
  return { status: 400, body: { ok: false, error } }
}
