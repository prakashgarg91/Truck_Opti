import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

// Shared controllable fake of the Supabase client. The zustand store is a
// module singleton, so every test re-imports it after vi.resetModules().
const h = vi.hoisted(() => {
    const authCallbacks: Array<(event: string, session: unknown) => void> = []
    const tableData: Record<string, unknown> = {}
    const auth = {
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signOut: vi.fn(),
    }
    const supabase = {
        auth,
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: tableData[table] ?? null, error: null }),
                }),
            }),
            upsert: async () => ({ error: null }),
        }),
    }
    return { auth, authCallbacks, supabase, tableData }
})

vi.mock('../lib/supabase', () => ({
    supabase: h.supabase,
    isSupabaseConfigured: true,
    isSupabaseReachable: vi.fn(async () => true),
}))

function subscribeCapture() {
    h.auth.onAuthStateChange.mockImplementation(
        (cb: (event: string, session: unknown) => void) => {
            h.authCallbacks.push(cb)
            return { data: { subscription: { unsubscribe: () => {} } } }
        }
    )
}

function makeSession(overrides: {
    userId?: string
    email?: string
    userMetadata?: Record<string, unknown>
} = {}): Session {
    return {
        access_token: 'at-1',
        refresh_token: 'rt-1',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
            id: overrides.userId ?? 'u-1',
            email: overrides.email ?? 'cloud@example.com',
            user_metadata: overrides.userMetadata ?? {},
            app_metadata: {},
            identities: [],
        },
    } as unknown as Session
}

function seedPersistedAuth(state: Record<string, unknown>) {
    window.localStorage.setItem('truckopti-auth', JSON.stringify({ state, version: 0 }))
}

const localProfile = {
    id: 'p-1',
    role: 'agency',
    company_name: 'Local Co',
    contact_name: 'Ravi',
    contact_phone: null,
}

const cloudUser = {
    id: 'u-1',
    email: 'cloud@example.com',
    name: 'Cloud User',
    phone: null,
    phone_verified: true,
    google_linked: false,
    profile_picture: null,
    role: 'user',
}

async function freshStore() {
    vi.resetModules()
    const { useAuthStore } = await import('../stores/authStore')
    return useAuthStore
}

beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    h.authCallbacks.length = 0
    for (const key of Object.keys(h.tableData)) delete h.tableData[key]
    h.auth.getSession.mockReset()
    h.auth.signOut.mockReset()
    h.auth.signOut.mockResolvedValue({ error: null })
    subscribeCapture()
})

describe('authStore', () => {
    describe('device-local identity', () => {
        it('loginLocal creates an isolated device-local session and logout never touches the network', async () => {
            const store = await freshStore()
            store.getState().loginLocal(localProfile as never)

            expect(store.getState().isAuthenticated).toBe(true)
            expect(store.getState().authMode).toBe('local')
            expect(store.getState().session).toBeNull()
            expect(store.getState().user?.id).toBe('local:p-1')

            await store.getState().logout()

            expect(h.auth.signOut).not.toHaveBeenCalled()
            expect(store.getState().isAuthenticated).toBe(false)
            expect(store.getState().user).toBeNull()
            expect(store.getState().authMode).toBe('supabase')
        })

        it('initialize restores a persisted device-local session when the cloud has none', async () => {
            seedPersistedAuth({ user: { ...cloudUser, id: 'local:p-1', role: 'agency' }, session: null, authMode: 'local' })
            h.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

            const store = await freshStore()
            await store.getState().initialize()

            expect(store.getState().isAuthenticated).toBe(true)
            expect(store.getState().authMode).toBe('local')
            expect(store.getState().user?.id).toBe('local:p-1')
        })

        it('initialize restores device-local access when the backend cannot be reached', async () => {
            seedPersistedAuth({ user: { ...cloudUser, id: 'local:p-1', role: 'agency' }, session: null, authMode: 'local' })
            h.auth.getSession.mockResolvedValue({
                data: { session: null },
                error: { message: 'Network request failed' },
            })

            const store = await freshStore()
            await store.getState().initialize()

            expect(store.getState().isAuthenticated).toBe(true)
            expect(store.getState().authMode).toBe('local')
        })

        it('initialize does not authenticate a persisted cloud identity when the backend is down', async () => {
            seedPersistedAuth({ user: cloudUser, session: null, authMode: 'supabase' })
            h.auth.getSession.mockResolvedValue({
                data: { session: null },
                error: { message: 'Network request failed' },
            })

            const store = await freshStore()
            await store.getState().initialize()

            expect(store.getState().isAuthenticated).toBe(false)
            expect(store.getState().authMode).toBe('supabase')
        })
    })

    describe('cloud identity from verified Supabase data', () => {
        it('resolves the app role from protected server tables, not client claims', async () => {
            h.tableData['users'] = { role: 'admin', login_id: 'L-1' }
            h.auth.getSession.mockResolvedValue({ data: { session: makeSession({ userMetadata: { role: 'admin' } }) }, error: null })

            const store = await freshStore()
            await store.getState().initialize()

            expect(store.getState().isAuthenticated).toBe(true)
            expect(store.getState().user?.role).toBe('admin')
        })

        it('falls back to least privilege when no server role exists, ignoring spoofed metadata', async () => {
            h.auth.getSession.mockResolvedValue({ data: { session: makeSession({ userMetadata: { role: 'admin' } }) }, error: null })

            const store = await freshStore()
            await store.getState().initialize()

            expect(store.getState().user?.role).toBe('user')
        })

        it('login marks the identity as cloud', async () => {
            const store = await freshStore()
            store.getState().login(cloudUser as never, makeSession())

            expect(store.getState().authMode).toBe('supabase')
            expect(store.getState().isAuthenticated).toBe(true)
        })
    })

    describe('cloud/local switching and auth events', () => {
        it('a cloud sign-in while a local session is active switches identity to the cloud user', async () => {
            h.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

            const store = await freshStore()
            store.getState().loginLocal(localProfile as never)
            await store.getState().initialize()

            const session = makeSession()
            for (const cb of [...h.authCallbacks]) cb('SIGNED_IN', session)

            // The store's auth-event handler resolves the user asynchronously.
            await vi.waitFor(() => {
                expect(store.getState().isAuthenticated).toBe(true)
                expect(store.getState().authMode).toBe('supabase')
                expect(store.getState().user?.id).toBe('u-1')
            })
            expect(store.getState().session).toBe(session)
        })

        it('TOKEN_REFRESHED keeps the session fresh and the identity cloud-backed', async () => {
            h.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

            const store = await freshStore()
            await store.getState().initialize()

            const session = makeSession()
            for (const cb of [...h.authCallbacks]) cb('TOKEN_REFRESHED', session)

            await vi.waitFor(() => {
                expect(store.getState().isAuthenticated).toBe(true)
                expect(store.getState().session).toBe(session)
                expect(store.getState().authMode).toBe('supabase')
            })
        })

        it('SIGNED_OUT from a revoked or expired cloud session clears cloud state', async () => {
            h.auth.getSession.mockResolvedValue({ data: { session: makeSession() }, error: null })

            const store = await freshStore()
            await store.getState().initialize()
            expect(store.getState().isAuthenticated).toBe(true)

            for (const cb of [...h.authCallbacks]) cb('SIGNED_OUT', null)

            expect(store.getState().isAuthenticated).toBe(false)
            expect(store.getState().user).toBeNull()
            expect(store.getState().session).toBeNull()
        })

        it('a revoked cloud session does not evict an active device-local session', async () => {
            h.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })

            const store = await freshStore()
            store.getState().loginLocal(localProfile as never)
            await store.getState().initialize()

            for (const cb of [...h.authCallbacks]) cb('SIGNED_OUT', null)

            expect(store.getState().authMode).toBe('local')
            expect(store.getState().isAuthenticated).toBe(true)
            expect(store.getState().user?.id).toBe('local:p-1')
        })
    })

    describe('logout', () => {
        it('cloud logout calls Supabase sign-out and clears state', async () => {
            const store = await freshStore()
            store.getState().login(cloudUser as never, makeSession())

            await store.getState().logout()

            expect(h.auth.signOut).toHaveBeenCalled()
            expect(store.getState().isAuthenticated).toBe(false)
            expect(store.getState().user).toBeNull()
        })

        it('offline logout still ends the session locally, including the persisted Supabase token', async () => {
            window.localStorage.setItem('sb-demo-ref-auth-token', 'stored-session')
            window.localStorage.setItem('sb-demo-ref-code-verifier', 'pkce-verifier')

            const store = await freshStore()
            store.getState().login(cloudUser as never, makeSession())
            h.auth.signOut.mockResolvedValue({ error: { message: 'Network request failed' } })

            await store.getState().logout()

            expect(store.getState().isAuthenticated).toBe(false)
            expect(store.getState().user).toBeNull()
            expect(window.localStorage.getItem('sb-demo-ref-auth-token')).toBeNull()
            expect(window.localStorage.getItem('sb-demo-ref-code-verifier')).toBeNull()
        })
    })
})
