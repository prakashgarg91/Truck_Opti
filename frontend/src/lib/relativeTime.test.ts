import { describe, expect, it } from 'vitest'
import { formatRelativeTime } from './relativeTime'

const NOW = new Date('2026-11-19T12:00:00.000Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms)
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('formatRelativeTime', () => {
  it.each([
    [0, 'Just now'],
    [30_000, 'Just now'],
    [1 * MIN, '1 min ago'],
    [2 * MIN, '2 min ago'],
    [59 * MIN, '59 min ago'],
  ])('minutes: %i ms ago reads %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), NOW)).toBe(expected)
  })

  it.each([
    [1 * HOUR, '1 hour ago'],
    [3 * HOUR, '3 hours ago'],
    [23 * HOUR + 59 * MIN, '23 hours ago'],
  ])('hours: %i ms ago reads %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), NOW)).toBe(expected)
  })

  it.each([
    [1 * DAY, '1 day ago'],
    [2 * DAY, '2 days ago'],
    [10 * DAY, '10 days ago'],
  ])('days: %i ms ago reads %s', (ms, expected) => {
    expect(formatRelativeTime(ago(ms), NOW)).toBe(expected)
  })

  it('defaults to the current time when no reference time is given', () => {
    expect(formatRelativeTime(new Date(Date.now() - 2 * HOUR))).toBe('2 hours ago')
  })
})
