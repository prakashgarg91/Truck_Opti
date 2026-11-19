import { describe, expect, it } from 'vitest'
import { indiaCalendarDate } from './indiaDate'

describe('indiaCalendarDate', () => {
  it('returns the India day, not the UTC day, for the first 5.5 hours of an IST day', () => {
    // 2026-11-18T19:00Z is 00:30 on 19 Nov in India.
    expect(indiaCalendarDate('2026-11-18T19:00:00Z')).toBe('2026-11-19')
    expect(indiaCalendarDate(new Date('2026-11-18T18:29:59Z'))).toBe('2026-11-18')
  })

  it('moves to the next day exactly at IST midnight', () => {
    expect(indiaCalendarDate('2026-11-18T18:30:00Z')).toBe('2026-11-19')
    expect(indiaCalendarDate('2026-11-18T18:29:59.999Z')).toBe('2026-11-18')
  })

  it('does not depend on the host time zone', () => {
    expect(indiaCalendarDate(Date.UTC(2026, 10, 19, 1, 0, 0))).toBe('2026-11-19')
  })

  it('returns null for an invalid date instead of throwing', () => {
    expect(indiaCalendarDate('not a date')).toBeNull()
    expect(indiaCalendarDate(Number.NaN)).toBeNull()
  })
})
