import { describe, expect, it } from 'vitest'

import { UserFacingError, toUserFacingErrorMessage } from './userFacingError'

describe('UserFacingError', () => {
  it('preserves its message and has name UserFacingError', () => {
    const error = new UserFacingError('User-facing error message')
    expect(error.message).toBe('User-facing error message')
    expect(error.name).toBe('UserFacingError')
  })
})

describe('toUserFacingErrorMessage', () => {
  it('returns the message for a UserFacingError', () => {
    const error = new UserFacingError('Safe user message')
    expect(toUserFacingErrorMessage(error, 'Fallback message')).toBe('Safe user message')
  })

  it('returns the supplied fallback for ordinary Error instances', () => {
    const error = new Error('Internal error details')
    expect(toUserFacingErrorMessage(error, 'Fallback message')).toBe('Fallback message')
  })

  it('returns the supplied fallback for string inputs', () => {
    const error = 'String error'
    expect(toUserFacingErrorMessage(error, 'Fallback message')).toBe('Fallback message')
  })

  it('returns the supplied fallback for null inputs', () => {
    expect(toUserFacingErrorMessage(null, 'Fallback message')).toBe('Fallback message')
  })

  it('returns the supplied fallback for undefined inputs', () => {
    expect(toUserFacingErrorMessage(undefined, 'Fallback message')).toBe('Fallback message')
  })

  it('never leaks internal details from ordinary errors', () => {
    const error = new Error('Secret internal implementation details')
    expect(toUserFacingErrorMessage(error, 'Safe fallback')).toBe('Safe fallback')
    expect(toUserFacingErrorMessage(error, 'Safe fallback')).not.toContain('Secret')
    expect(toUserFacingErrorMessage(error, 'Safe fallback')).not.toContain('implementation')
  })
})