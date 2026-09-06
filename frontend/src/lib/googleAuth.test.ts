// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { decodeIdToken, isGoogleAuthConfigured } from './googleAuth'

function jwt(payload: object): string {
  const b64 = (o: object) =>
    Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'RS256' })}.${b64(payload)}.sig`
}

describe('googleAuth', () => {
  it('decodes a valid credential', () => {
    const p = decodeIdToken(jwt({ sub: 'g123', email: 'a@b.c', name: 'A B', picture: 'http://x/y.png' }))
    expect(p).toEqual({ sub: 'g123', email: 'a@b.c', name: 'A B', picture: 'http://x/y.png' })
  })

  it('falls back to email when name missing', () => {
    expect(decodeIdToken(jwt({ sub: 'g1', email: 'a@b.c' })).name).toBe('a@b.c')
  })

  it('rejects malformed credentials', () => {
    expect(() => decodeIdToken('not-a-jwt')).toThrow()
    expect(() => decodeIdToken(jwt({ email: 'a@b.c' }))).toThrow(/subject/)
  })

  it('is unconfigured without a client ID', () => {
    expect(isGoogleAuthConfigured()).toBe(false)
  })
})
