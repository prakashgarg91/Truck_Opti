import { describe, expect, it } from 'vitest'
import { toDisplayName } from './displayName'

describe('toDisplayName', () => {
  it('returns plain string metadata as-is', () => {
    expect(toDisplayName('Sharma Transport')).toBe('Sharma Transport')
  })

  it('extracts the name from the local-profile { name } shape', () => {
    expect(toDisplayName({ name: 'Sharma Transport' })).toBe('Sharma Transport')
  })

  it('never returns a non-string object (React error #31 guard)', () => {
    expect(toDisplayName({ name: 42 })).toBeNull()
    expect(toDisplayName({ other: 'x' })).toBeNull()
    expect(toDisplayName({})).toBeNull()
  })

  it('returns null for empty, blank and non-string values', () => {
    expect(toDisplayName('')).toBeNull()
    expect(toDisplayName('   ')).toBeNull()
    expect(toDisplayName(null)).toBeNull()
    expect(toDisplayName(undefined)).toBeNull()
    expect(toDisplayName(7)).toBeNull()
  })
})
