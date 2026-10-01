import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// supabase.ts reads import.meta.env at module scope, so every case resets the
// module registry after stubbing the environment (same pattern as
// phonepePayment.test.ts).
async function importSupabase() {
    return await import('./supabase')
}

describe('supabase lib capability wiring (TO-124)', () => {
    beforeEach(() => {
        vi.resetModules()
        vi.unstubAllEnvs()
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.unstubAllGlobals()
    })

    it('stays local-first with placeholder env values and never requests the placeholder backend', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://YOUR_PROJECT_ID.supabase.co')
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'your_supabase_anon_key_here')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const mod = await importSupabase()

        expect(mod.isSupabaseConfigured).toBe(false)
        expect(mod.supabaseConfigError).toMatch(/placeholder/i)
        await expect(mod.isSupabaseReachable()).resolves.toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('stays local-first and offline-safe when nothing is configured', async () => {
        // A developer .env can provide real values; stub them away for this case.
        vi.stubEnv('VITE_SUPABASE_URL', '')
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const mod = await importSupabase()

        expect(mod.isSupabaseConfigured).toBe(false)
        await expect(mod.isSupabaseReachable(5000)).resolves.toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('treats a non-https backend URL as unconfigured instead of probing it', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'http://prod-project.supabase.co')
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_anon_real_value')
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)

        const mod = await importSupabase()

        expect(mod.isSupabaseConfigured).toBe(false)
        await expect(mod.isSupabaseReachable()).resolves.toBe(false)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('is configured with a valid https backend URL and anon key', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://prod-project.supabase.co')
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_anon_real_value')
        const fetchMock = vi.fn(async (_url: string) => ({ ok: true, status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const mod = await importSupabase()

        expect(mod.isSupabaseConfigured).toBe(true)
        expect(mod.supabaseConfigError).toBeNull()
        await expect(mod.isSupabaseReachable()).resolves.toBe(true)
        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock.mock.calls[0][0]).toBe('https://prod-project.supabase.co/auth/v1/health')
    })

    it('fails closed with a bounded probe when the explicitly configured backend is unreachable', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://dead-host.invalid')
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_anon_real_value')
        const fetchMock = vi.fn(async () => {
            throw new TypeError('fetch failed')
        })
        vi.stubGlobal('fetch', fetchMock)

        const mod = await importSupabase()

        expect(mod.isSupabaseConfigured).toBe(true)
        await expect(mod.isSupabaseReachable(50)).resolves.toBe(false)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('caches the reachability result per session', async () => {
        vi.stubEnv('VITE_SUPABASE_URL', 'https://prod-project.supabase.co')
        vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'sb_anon_real_value')
        const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }))
        vi.stubGlobal('fetch', fetchMock)

        const mod = await importSupabase()

        await expect(mod.isSupabaseReachable()).resolves.toBe(true)
        await expect(mod.isSupabaseReachable()).resolves.toBe(true)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })
})
