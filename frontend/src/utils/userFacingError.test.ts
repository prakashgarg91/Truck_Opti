import { describe, expect, it } from 'vitest'

import { APPROVED_FUNCTION_STATUS_MESSAGES, resolveFunctionUserMessage, UserFacingError, toUserFacingErrorMessage } from './userFacingError'

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

// TO-131: approved typed-code mapping for portal Edge Function failures.
describe('resolveFunctionUserMessage', () => {
  function functionHttpError(status: number, body: string) {
    return {
      name: 'FunctionsHttpError',
      message: 'Edge Function returned a non-2xx status code',
      context: new Response(body, { status }),
    }
  }

  it('maps every approved status code', () => {
    for (const [status, message] of Object.entries(APPROVED_FUNCTION_STATUS_MESSAGES)) {
      expect(resolveFunctionUserMessage(functionHttpError(Number(status), '{"error":"anything"}'), 'Fallback message')).toBe(message)
    }
  })

  it('falls back for unapproved statuses carrying arbitrary payload strings', () => {
    expect(resolveFunctionUserMessage(
      functionHttpError(500, JSON.stringify({ error: 'relation "public.profiles" does not exist' })),
      'Fallback message',
    )).toBe('Fallback message')
    expect(resolveFunctionUserMessage(
      functionHttpError(400, JSON.stringify({ error: 'eyJhbGciOiJIUzI1NiJ9.payload.sig' })),
      'Fallback message',
    )).toBe('Fallback message')
  })

  it('falls back for raw messages and unknown shapes', () => {
    expect(resolveFunctionUserMessage(new Error('stack trace detail'), 'Fallback message')).toBe('Fallback message')
    expect(resolveFunctionUserMessage({ message: 'raw message' }, 'Fallback message')).toBe('Fallback message')
    expect(resolveFunctionUserMessage(null, 'Fallback message')).toBe('Fallback message')
    expect(resolveFunctionUserMessage(undefined, 'Fallback message')).toBe('Fallback message')
  })

  it('falls back when the response context is not a Response', () => {
    expect(resolveFunctionUserMessage({ context: { status: 401 } }, 'Fallback message')).toBe('Fallback message')
  })
})