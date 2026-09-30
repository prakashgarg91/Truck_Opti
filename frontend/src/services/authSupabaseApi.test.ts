import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    signInWithOAuth: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
    supabase: { auth: { signInWithOAuth: h.signInWithOAuth } },
    isSupabaseConfigured: true,
    isSupabaseReachable: vi.fn(async () => true),
}))

import { authSupabaseApi } from '../services/supabaseApi'
import { UserFacingError } from '../utils/userFacingError'

beforeEach(() => {
    h.signInWithOAuth.mockReset()
    h.signInWithOAuth.mockResolvedValue({ provider: 'google', url: 'https://supabase.example/authorize' })
})

describe('authSupabaseApi.signInWithGoogle', () => {
    it('starts Google OAuth against the /auth/callback route on the current origin', async () => {
        await authSupabaseApi.signInWithGoogle()

        expect(h.signInWithOAuth).toHaveBeenCalledTimes(1)
        const call = h.signInWithOAuth.mock.calls[0][0] as { provider: string; options: { redirectTo: string } }
        expect(call.provider).toBe('google')
        expect(call.options.redirectTo).toBe(`${window.location.origin}/auth/callback`)
    })

    it('carries a safe return-to path through the OAuth redirect', async () => {
        await authSupabaseApi.signInWithGoogle('/agency/dashboard?tab=jobs')

        const redirectTo = (h.signInWithOAuth.mock.calls[0][0] as { options: { redirectTo: string } }).options.redirectTo
        const parsed = new URL(redirectTo)
        expect(parsed.origin).toBe(window.location.origin)
        expect(parsed.pathname).toBe('/auth/callback')
        expect(parsed.searchParams.get('returnTo')).toBe('/agency/dashboard?tab=jobs')
    })

    it('refuses to carry an unsafe return-to path', async () => {
        await authSupabaseApi.signInWithGoogle('//evil.com')

        const redirectTo = (h.signInWithOAuth.mock.calls[0][0] as { options: { redirectTo: string } }).options.redirectTo
        const parsed = new URL(redirectTo)
        expect(parsed.pathname).toBe('/auth/callback')
        expect(parsed.searchParams.get('returnTo')).toBeNull()
    })

    it('maps provider failures to a user-facing error', async () => {
        h.signInWithOAuth.mockResolvedValue({ provider: null, url: null, error: { message: 'provider disabled' } })

        await expect(authSupabaseApi.signInWithGoogle()).rejects.toBeInstanceOf(UserFacingError)
    })
})
