import { describe, expect, it } from 'vitest'
import {
  buildQrPayload,
  financialYear,
  formatGrNumber,
  nextProofState,
  parseQrPayload,
  type ProofEvent,
  type ProofState,
} from './grLr'

describe('formatGrNumber', () => {
  it('formats prefix, financial year and a six-digit padded sequence', () => {
    expect(formatGrNumber('AGY', 123, 2026)).toBe('AGY/2026-27/000123')
  })

  it('zero-pads short sequences to six digits', () => {
    expect(formatGrNumber('AGY', 1, 2026)).toBe('AGY/2026-27/000001')
  })

  it('keeps sequences longer than six digits intact', () => {
    expect(formatGrNumber('AGY', 1234567, 2026)).toBe('AGY/2026-27/1234567')
  })

  it('upper-cases the prefix', () => {
    expect(formatGrNumber('agy', 5, 2026)).toBe('AGY/2026-27/000005')
  })

  it('accepts prefixes of 2 to 6 letters or digits', () => {
    expect(formatGrNumber('AB', 1, 2026)).toBe('AB/2026-27/000001')
    expect(formatGrNumber('AB12CD', 1, 2026)).toBe('AB12CD/2026-27/000001')
    expect(formatGrNumber('X1', 1, 2026)).toBe('X1/2026-27/000001')
  })

  it('throws for a prefix shorter than 2 characters', () => {
    expect(() => formatGrNumber('A', 1, 2026)).toThrow()
    expect(() => formatGrNumber('', 1, 2026)).toThrow()
  })

  it('throws for a prefix longer than 6 characters', () => {
    expect(() => formatGrNumber('ABCDEFG', 1, 2026)).toThrow()
  })

  it('throws for a prefix with punctuation, spaces or slashes', () => {
    expect(() => formatGrNumber('A-G', 1, 2026)).toThrow()
    expect(() => formatGrNumber('A G', 1, 2026)).toThrow()
    expect(() => formatGrNumber('AG/Y', 1, 2026)).toThrow()
  })

  it('throws for a non-positive or non-integer sequence', () => {
    expect(() => formatGrNumber('AGY', 0, 2026)).toThrow()
    expect(() => formatGrNumber('AGY', -1, 2026)).toThrow()
    expect(() => formatGrNumber('AGY', 1.5, 2026)).toThrow()
  })

  it('rolls the two-digit year suffix over at a century boundary', () => {
    expect(formatGrNumber('AGY', 1, 2099)).toBe('AGY/2099-00/000001')
  })
})

describe('financialYear', () => {
  it('returns the year before the boundary on 31 March', () => {
    expect(financialYear('2026-03-31')).toBe('2025-26')
  })

  it('starts a new financial year on 1 April', () => {
    expect(financialYear('2026-04-01')).toBe('2026-27')
  })

  it('treats 31 March and 1 April as adjacent years', () => {
    expect(financialYear('2027-03-31')).toBe('2026-27')
    expect(financialYear('2027-04-01')).toBe('2027-28')
  })

  it('returns the previous year for January through March', () => {
    expect(financialYear('2026-01-01')).toBe('2025-26')
    expect(financialYear('2026-02-15')).toBe('2025-26')
  })

  it('returns the same year for April through December', () => {
    expect(financialYear('2026-07-15')).toBe('2026-27')
    expect(financialYear('2026-12-31')).toBe('2026-27')
  })

  it('accepts an ISO timestamp and uses its date part', () => {
    expect(financialYear('2026-03-31T23:59:59Z')).toBe('2025-26')
    expect(financialYear('2026-04-01T00:00:00Z')).toBe('2026-27')
  })

  it('rolls the suffix over at a century boundary', () => {
    expect(financialYear('1999-04-01')).toBe('1999-00')
  })

  it('throws for a malformed date', () => {
    expect(() => financialYear('not-a-date')).toThrow()
    expect(() => financialYear('2026-13-01')).toThrow()
    expect(() => financialYear('')).toThrow()
  })
})

describe('QR payload', () => {
  const grNumber = 'AGY/2026-27/000123'
  const consignmentId = 'c3f1a2b4-0000-4000-8000-000000000001'
  const token = 'tok_abc123'

  it('builds the versioned colon-separated payload', () => {
    expect(buildQrPayload({ grNumber, consignmentId, token })).toBe(
      `TRKOPT:v1:${grNumber}:${consignmentId}:${token}`,
    )
  })

  it('round-trips through parseQrPayload', () => {
    const parsed = parseQrPayload(buildQrPayload({ grNumber, consignmentId, token }))
    expect(parsed).toEqual({ ok: true, grNumber, consignmentId, token })
  })

  it('throws when a part is empty', () => {
    expect(() => buildQrPayload({ grNumber: '', consignmentId, token })).toThrow()
    expect(() => buildQrPayload({ grNumber, consignmentId, token: '' })).toThrow()
  })

  it('throws when a part contains a colon', () => {
    expect(() => buildQrPayload({ grNumber, consignmentId, token: 'a:b' })).toThrow()
  })

  it('rejects text that does not start with the TRKOPT prefix', () => {
    expect(parseQrPayload('OTHER:v1:a:b:c')).toEqual({ ok: false, error: 'bad_format' })
  })

  it('rejects an empty string', () => {
    expect(parseQrPayload('')).toEqual({ ok: false, error: 'bad_format' })
  })

  it('rejects a payload with too few parts', () => {
    expect(parseQrPayload('TRKOPT:v1:AGY/2026-27/000123:cons')).toEqual({
      ok: false,
      error: 'bad_format',
    })
  })

  it('rejects a payload with too many parts', () => {
    expect(parseQrPayload('TRKOPT:v1:a:b:c:d')).toEqual({ ok: false, error: 'bad_format' })
  })

  it('rejects a payload with an empty part', () => {
    expect(parseQrPayload('TRKOPT:v1:AGY/2026-27/000123::tok')).toEqual({
      ok: false,
      error: 'bad_format',
    })
  })

  it('rejects an unsupported version', () => {
    expect(parseQrPayload('TRKOPT:v2:a:b:c')).toEqual({ ok: false, error: 'bad_version' })
  })

  it('does not trim surrounding whitespace into a valid payload', () => {
    const valid = buildQrPayload({ grNumber, consignmentId, token })
    expect(parseQrPayload(` ${valid}`)).toEqual({ ok: false, error: 'bad_format' })
  })
})

describe('nextProofState', () => {
  const states: ProofState[] = [
    'created',
    'picked_up',
    'in_transit',
    'delivered',
    'receipt_confirmed',
    'disputed',
  ]
  const events: ProofEvent[] = [
    'pickup_scanned',
    'transit_started',
    'delivery_scanned',
    'receipt_signed',
    'dispute_raised',
  ]

  const legal: Array<[ProofState, ProofEvent, ProofState]> = [
    ['created', 'pickup_scanned', 'picked_up'],
    ['picked_up', 'transit_started', 'in_transit'],
    ['in_transit', 'delivery_scanned', 'delivered'],
    ['delivered', 'receipt_signed', 'receipt_confirmed'],
    ['picked_up', 'dispute_raised', 'disputed'],
    ['in_transit', 'dispute_raised', 'disputed'],
    ['delivered', 'dispute_raised', 'disputed'],
  ]

  const legalKeys = new Set(legal.map(([s, e]) => `${s}|${e}`))

  it.each(legal)('moves %s on %s to %s', (from, event, to) => {
    expect(nextProofState(from, event)).toEqual({ ok: true, state: to })
  })

  const illegal: Array<[ProofState, ProofEvent]> = []
  for (const s of states) {
    for (const e of events) {
      if (!legalKeys.has(`${s}|${e}`)) illegal.push([s, e])
    }
  }

  it.each(illegal)('rejects %s on %s as illegal_transition', (from, event) => {
    expect(nextProofState(from, event)).toEqual({ ok: false, error: 'illegal_transition' })
  })

  it('covers every state and event pair exactly once', () => {
    expect(legal.length + illegal.length).toBe(states.length * events.length)
  })

  it('keeps receipt_confirmed terminal for every event', () => {
    for (const e of events) {
      expect(nextProofState('receipt_confirmed', e)).toEqual({
        ok: false,
        error: 'illegal_transition',
      })
    }
  })

  it('rejects an unknown event as illegal_transition', () => {
    expect(
      nextProofState('created', 'bogus' as unknown as ProofEvent),
    ).toEqual({ ok: false, error: 'illegal_transition' })
  })
})
