import { act } from 'react'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
    const authCallbacks: Array<(event: string, session: unknown) => void> = []
    const auth = {
        setSession: vi.fn(),
        exchangeCodeForSession: vi.fn(),
        getSession: vi.fn(),
        onAuthStateChange: vi.fn(),
        signOut: vi.fn(),
    }
    const supabase = {
        auth,
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
            upsert: async () => ({ error: null }),
        }),
    }
    return { auth, authCallbacks, supabase }
})

vi.mock('../../lib/supabase', () => ({
    supabase: h.supabase,
    isSupabaseConfigured: true,
    isSupabaseReachable: vi.fn(async () => true),
}))

const SESSION = {
    access_token: 'at-1',
    refresh_token: 'rt-1',
    user: { id: 'u-1', email: 'cloud@example.com', user_metadata: {}, app_metadata: {} },
}

function emitSignIn(session: unknown) {
    for (const cb of [...h.authCallbacks]) cb('SIGNED_IN', session)
}

function subscribeCapture() {
    h.auth.onAuthStateChange.mockImplementation((cb: (event: string, session: unknown) => void) => {
        h.authCallbacks.push(cb)
        return { data: { subscription: { unsubscribe: () => {} } } }
    })
}

const Landed = () => {
    const location = useLocation()
    return createElement('div', { id: 'landed' }, `landed=${location.pathname}`)
}

async function freshPage() {
    vi.resetModules()
    const { default: Page } = await import('../../pages/auth/AuthCallbackPage')
    const { useAuthStore } = await import('../../stores/authStore')
    return { Page, useAuthStore }
}

async function bootStore(useAuthStore: { getState: () => { initialize: () => Promise<void> } }) {
    subscribeCapture()
    await useAuthStore.getState().initialize()
}

function renderTree(Page: ComponentType) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => {
        root.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/auth/callback'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/auth/callback', element: createElement(Page) }),
                    createElement(Route, { path: '*', element: createElement(Landed) })
                )
            )
        )
    })
    return { container, root }
}

async function waitForText(container: HTMLElement, text: string) {
    for (let i = 0; i < 150; i++) {
        if (container.textContent?.includes(text)) return
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20))
        })
    }
    throw new Error(`timeout waiting for "${text}"; page showed: ${container.textContent}`)
}

beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    window.history.replaceState({}, '', '/')
    h.authCallbacks.length = 0
    h.auth.setSession.mockReset()
    h.auth.exchangeCodeForSession.mockReset()
    h.auth.getSession.mockReset()
    h.auth.setSession.mockResolvedValue({ error: null })
    h.auth.exchangeCodeForSession.mockResolvedValue({ error: null })
    h.auth.getSession.mockResolvedValue({ data: { session: null }, error: null })
    h.auth.onAuthStateChange.mockReset()
})

describe('AuthCallbackPage', () => {
    it('completes the PKCE code flow, restores the safe return-to and lands off the auth pages', async () => {
        const { Page, useAuthStore } = await freshPage()
        await bootStore(useAuthStore)

        h.auth.exchangeCodeForSession.mockImplementation(async () => {
            emitSignIn(SESSION)
            return { error: null }
        })
        h.auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
        window.history.replaceState({}, '', '/auth/callback?code=c-1&returnTo=%2Fagency%2Fdashboard')

        const { container, root } = renderTree(Page)
        await waitForText(container, 'landed=/agency/dashboard')

        expect(h.auth.exchangeCodeForSession).toHaveBeenCalledWith('c-1')
        expect(window.sessionStorage.getItem('truckopti-auth-return-to')).toBeNull()
        root.unmount()
    })

    it('completes the implicit-hash flow (the configured SPA client flowType) via setSession', async () => {
        const { Page, useAuthStore } = await freshPage()
        await bootStore(useAuthStore)

        h.auth.setSession.mockImplementation(async () => {
            emitSignIn(SESSION)
            return { error: null }
        })
        h.auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
        window.history.replaceState({}, '', '/auth/callback#access_token=at-1&refresh_token=rt-1&expires_in=3600')

        const { container, root } = renderTree(Page)
        await waitForText(container, 'landed=/')

        expect(h.auth.setSession).toHaveBeenCalledWith({ access_token: 'at-1', refresh_token: 'rt-1' })
        expect(h.auth.exchangeCodeForSession).not.toHaveBeenCalled()
        root.unmount()
    })

    it('never follows an unsafe return-to planted in the callback URL', async () => {
        const { Page, useAuthStore } = await freshPage()
        await bootStore(useAuthStore)

        h.auth.exchangeCodeForSession.mockImplementation(async () => {
            emitSignIn(SESSION)
            return { error: null }
        })
        h.auth.getSession.mockResolvedValue({ data: { session: SESSION }, error: null })
        window.history.replaceState({}, '', '/auth/callback?code=c-2&returnTo=%2F%2Fevil.com')

        const { container, root } = renderTree(Page)
        await waitForText(container, 'landed=/')

        expect(container.textContent).not.toContain('evil.com')
        expect(window.sessionStorage.getItem('truckopti-auth-return-to')).toBeNull()
        root.unmount()
    })

    it('shows the mapped message when the provider returns an OAuth error', async () => {
        const { Page, useAuthStore } = await freshPage()
        await bootStore(useAuthStore)

        window.history.replaceState({}, '', '/auth/callback?error=access_denied&error_description=Sign+up+was+cancelled')

        const { container, root } = renderTree(Page)
        await waitForText(container, 'Authentication Failed')

        expect(container.textContent).toContain('cancelled or denied')
        expect(container.textContent).not.toContain('landed=')
        root.unmount()
    })

    it('shows an error and does not land anywhere when the code exchange fails', async () => {
        const { Page, useAuthStore } = await freshPage()
        await bootStore(useAuthStore)

        h.auth.exchangeCodeForSession.mockResolvedValue({ error: { message: 'invalid code' } })
        window.history.replaceState({}, '', '/auth/callback?code=bad')

        const { container, root } = renderTree(Page)
        await waitForText(container, 'Authentication Failed')

        expect(container.textContent).not.toContain('landed=')
        root.unmount()
    })
})
