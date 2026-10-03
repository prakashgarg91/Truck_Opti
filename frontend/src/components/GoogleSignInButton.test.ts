import { act } from 'react'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The production Google entry must start the trusted Supabase OAuth round
// trip. It must never decode a GIS ID token client-side, never link a
// client-decoded identity into the local profile store, and never call the
// store's local login.
const h = vi.hoisted(() => ({
    signInWithGoogle: vi.fn(),
    isSupabaseReachable: vi.fn(async () => true),
    isSupabaseConfigured: true,
}))

vi.mock('../lib/supabase', () => ({
    supabase: {},
    // Getter: the mock registry survives vi.resetModules(), so the flag must
    // be evaluated at import/use time to let tests flip it.
    get isSupabaseConfigured() {
        return h.isSupabaseConfigured
    },
    isSupabaseReachable: h.isSupabaseReachable,
}))

vi.mock('../services/supabaseApi', () => ({
    authSupabaseApi: { signInWithGoogle: h.signInWithGoogle },
}))

async function freshButton(): Promise<ComponentType<{ label: string }>> {
    vi.resetModules()
    const mod = await import('../components/GoogleSignInButton')
    return mod.default
}

function renderButton(Button: ComponentType<{ label: string }>, routeState?: unknown) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const entry = routeState === undefined ? '/login' : { pathname: '/login', state: routeState }
    act(() => {
        root.render(createElement(MemoryRouter, { initialEntries: [entry] }, createElement(Button, { label: 'Continue with Google' })))
    })
    return { container, root }
}

async function clickButton(container: HTMLElement) {
    const button = container.querySelector('button:not([disabled])')
    expect(button, 'expected an enabled Google sign-in button').toBeTruthy()
    await act(async () => {
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await Promise.resolve()
    })
    return button!
}

beforeEach(() => {
    h.signInWithGoogle.mockReset()
    h.signInWithGoogle.mockResolvedValue({ provider: 'google', url: 'https://supabase.example/auth/v1/authorize?provider=google' })
    h.isSupabaseReachable.mockReset()
    h.isSupabaseReachable.mockResolvedValue(true)
    h.isSupabaseConfigured = true
})

describe('GoogleSignInButton', () => {
    it('starts the Supabase Google OAuth redirect, carrying a safe return-to, without touching local identity', async () => {
        const Button = await freshButton()
        const { container, root } = renderButton(Button, { from: { pathname: '/agency/dashboard', search: '?tab=jobs' } })

        await clickButton(container)

        expect(h.isSupabaseReachable).toHaveBeenCalled()
        expect(h.signInWithGoogle).toHaveBeenCalledWith('/agency/dashboard?tab=jobs')
        expect(container.textContent).not.toContain('needs setup')
        root.unmount()
    })

    it('passes no return-to when the login surface did not request one', async () => {
        const Button = await freshButton()
        const { container, root } = renderButton(Button)

        await clickButton(container)

        expect(h.signInWithGoogle).toHaveBeenCalledTimes(1)
        expect(h.signInWithGoogle.mock.calls[0][0]).toBeUndefined()
        root.unmount()
    })

    it('fails closed with an honest message when the sign-in backend is unreachable', async () => {
        h.isSupabaseReachable.mockResolvedValue(false)
        const Button = await freshButton()
        const { container, root } = renderButton(Button)

        await clickButton(container)

        expect(h.signInWithGoogle).not.toHaveBeenCalled()
        expect(container.textContent).toContain('unavailable')
        root.unmount()
    })

    it('renders nothing when the sign-in backend is not configured, so no surface suggests an unavailable method', async () => {
        h.isSupabaseConfigured = false
        const Button = await freshButton()
        const { container, root } = renderButton(Button)

        // TO-123: an unconfigured Google provider renders nothing at all —
        // never a disabled "(needs setup)" button or developer setup copy.
        expect(container.querySelector('button')).toBeNull()
        expect(container.textContent).not.toContain('needs setup')
        expect(container.textContent).not.toContain('VITE_')
        expect(h.signInWithGoogle).not.toHaveBeenCalled()
        root.unmount()
    })
})
