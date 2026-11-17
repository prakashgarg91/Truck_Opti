// Pure GR/LR (goods receipt / lorry receipt) helpers for TO-146.
// No React, no network, no storage, no clock: time and ids are always
// passed in by the caller so every result is deterministic.

const PREFIX_PATTERN = /^[A-Z0-9]{2,6}$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})/
const QR_PREFIX = 'TRKOPT'
const QR_VERSION = 'v1'
const QR_VERSION_PATTERN = /^v\d+$/

function assertFinancialYearStart(start: number): void {
  if (!Number.isInteger(start) || start < 1000 || start > 9999) {
    throw new Error(`Invalid financial year start: ${start}`)
  }
}

function fyLabel(start: number): string {
  const suffix = String((start + 1) % 100).padStart(2, '0')
  return `${start}-${suffix}`
}

/**
 * Formats a GR number such as `AGY/2026-27/000123`.
 * `financialYearStart` is the calendar year in which the April-March
 * financial year begins (2026 for FY 2026-27).
 */
export function formatGrNumber(
  prefix: string,
  sequence: number,
  financialYearStart: number,
): string {
  const normalizedPrefix = prefix.toUpperCase()
  if (!PREFIX_PATTERN.test(normalizedPrefix)) {
    throw new Error(`Invalid GR prefix: "${prefix}"`)
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error(`Invalid GR sequence: ${sequence}`)
  }
  assertFinancialYearStart(financialYearStart)
  return `${normalizedPrefix}/${fyLabel(financialYearStart)}/${String(sequence).padStart(6, '0')}`
}

/**
 * Returns the Indian financial year (April-March) for an ISO date such as
 * `2026-03-31` (-> `2025-26`) or `2026-04-01` (-> `2026-27`).
 * Only the date part is read, so the result never depends on the timezone.
 */
export function financialYear(dateIso: string): string {
  const match = DATE_PATTERN.exec(dateIso)
  if (!match) {
    throw new Error(`Invalid ISO date: "${dateIso}"`)
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`Invalid ISO date: "${dateIso}"`)
  }
  const start = month >= 4 ? year : year - 1
  return fyLabel(start)
}

export interface QrPayloadInput {
  grNumber: string
  consignmentId: string
  token: string
}

/** Builds `TRKOPT:v1:<grNumber>:<consignmentId>:<token>`. */
export function buildQrPayload(input: QrPayloadInput): string {
  const parts = [input.grNumber, input.consignmentId, input.token]
  for (const part of parts) {
    if (part.length === 0 || part.includes(':')) {
      throw new Error('QR payload parts must be non-empty and must not contain ":"')
    }
  }
  return [QR_PREFIX, QR_VERSION, ...parts].join(':')
}

export type QrParseResult =
  | { ok: true; grNumber: string; consignmentId: string; token: string }
  | { ok: false; error: 'bad_format' | 'bad_version' }

/** Parses a payload produced by {@link buildQrPayload}. */
export function parseQrPayload(text: string): QrParseResult {
  const parts = text.split(':')
  if (parts.length !== 5 || parts[0] !== QR_PREFIX) {
    return { ok: false, error: 'bad_format' }
  }
  const version = parts[1]
  if (!QR_VERSION_PATTERN.test(version)) {
    return { ok: false, error: 'bad_format' }
  }
  if (version !== QR_VERSION) {
    return { ok: false, error: 'bad_version' }
  }
  const [, , grNumber, consignmentId, token] = parts
  if (grNumber === '' || consignmentId === '' || token === '') {
    return { ok: false, error: 'bad_format' }
  }
  return { ok: true, grNumber, consignmentId, token }
}

export type ProofState =
  | 'created'
  | 'picked_up'
  | 'in_transit'
  | 'delivered'
  | 'receipt_confirmed'
  | 'disputed'

export type ProofEvent =
  | 'pickup_scanned'
  | 'transit_started'
  | 'delivery_scanned'
  | 'receipt_signed'
  | 'dispute_raised'

export type ProofTransitionResult =
  | { ok: true; state: ProofState }
  | { ok: false; error: 'illegal_transition' }

// Transition table. `disputed` has no outgoing entries because no event
// in the current event set resolves a dispute; `receipt_confirmed` is terminal.
const PROOF_TRANSITIONS: Readonly<Record<ProofState, Partial<Record<ProofEvent, ProofState>>>> = {
  created: { pickup_scanned: 'picked_up' },
  picked_up: { transit_started: 'in_transit', dispute_raised: 'disputed' },
  in_transit: { delivery_scanned: 'delivered', dispute_raised: 'disputed' },
  delivered: { receipt_signed: 'receipt_confirmed', dispute_raised: 'disputed' },
  receipt_confirmed: {},
  disputed: {},
}

/** Pure proof-of-delivery state machine. Unknown states or events are illegal. */
export function nextProofState(current: ProofState, event: ProofEvent): ProofTransitionResult {
  const row = PROOF_TRANSITIONS[current]
  const next = row && Object.prototype.hasOwnProperty.call(row, event) ? row[event] : undefined
  if (next === undefined) {
    return { ok: false, error: 'illegal_transition' }
  }
  return { ok: true, state: next }
}
