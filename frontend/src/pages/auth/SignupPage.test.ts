import { act } from 'react'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// TO-123: the signup surface renders only enabled, configured signup methods
// and never suggests an unavailable one or leaks environment copy.
const h = vi.hoisted(() => ({
    isSupabaseReachable: vi.fn(async () => true),
    signUpWithEmail: vi.fn(async () => undefined),
    signUpWithEmailPassword: vi.fn(async () => ({ session: null })),
    caps: null as unknown as Record<string, unknown>,
}))

vi.mock('../../lib/supabase', () => ({
    supabase: {},
    isSupabaseConfigured: true,
    isSupabaseReachable: h.isSupabaseReachable,
}))

vi.mock('../../lib/authSurfaceMethods', () => ({
    get authSurfaceMethods() {
        return h.caps
    },
}))

vi.mock('../../services/supabaseApi', () => ({
    authSupabaseApi: {
        signUpWithEmail: h.signUpWithEmail,
        signUpWithEmailPassword: h.signUpWithEmailPassword,
    },
}))

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}))

type MethodToggles = {
    google?: boolean
    email?: boolean
    password?: boolean
}

function capabilities(toggles: MethodToggles = {}) {
    const method = (id: string, enabled: boolean) => ({
        id,
        enabled,
        level: enabled ? 'configured' : 'intentionally_disabled',
        detail: enabled ? 'enabled' : 'intentionally disabled',
    })
    return {
        google: method('google', toggles.google ?? false),
        emailOtp: method('email_otp', toggles.email ?? false),
        phoneOtp: method('phone_otp', false),
        officePassword: method('office_password', toggles.password ?? false),
        hasCloudMethod: Boolean(toggles.google || toggles.email),
    }
}

const Landed = () => {
    const location = useLocation()
    return createElement('div', { id: 'landed' }, `landed=${location.pathname}`)
}

async function freshPage() {
    vi.resetModules()
    const mod = await import('../../pages/auth/SignupPage')
    return mod.default as ComponentType
}

function renderPage(Page: ComponentType) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => {
        root.render(
            createElement(
                QueryClientProvider,
                { client: new QueryClient() },
                createElement(
                    MemoryRouter,
                    { initialEntries: ['/signup'] },
                    createElement(
                        Routes,
                        null,
                        createElement(Route, { path: '/signup', element: createElement(Page) }),
                        createElement(Route, { path: '*', element: createElement(Landed) }),
                    ),
                ),
            ),
        )
    })
    return { container, root }
}

beforeEach(() => {
    h.isSupabaseReachable.mockReset()
    h.isSupabaseReachable.mockResolvedValue(true)
    h.signUpWithEmail.mockReset()
    h.signUpWithEmailPassword.mockReset()
    h.signUpWithEmailPassword.mockResolvedValue({ session: null })
    document.title = ''
})

describe('SignupPage method availability (TO-123)', () => {
    it('email OTP only: renders the email form with no dead password field', async () => {
        h.caps = capabilities({ email: true, google: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)

        expect(container.querySelector('input[autocomplete="email"]')).toBeTruthy()
        expect(container.textContent).toContain('Create Account')
        expect(container.textContent).not.toContain('Create Password Account')
        expect(container.textContent).not.toContain('Email Signup Disabled')
        expect(container.textContent).not.toContain('in this environment')
        expect(container.textContent).not.toContain('VITE_')
        root.unmount()
    })

    it('password only: renders the password form with no method chooser', async () => {
        h.caps = capabilities({ password: true, google: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)

        expect(container.querySelector('input[autocomplete="new-password"]')).toBeTruthy()
        expect(container.textContent).toContain('Create Password Account')
        expect(container.textContent).not.toContain('Choose signup method')
        root.unmount()
    })

    it('both methods: renders the chooser with pressed state', async () => {
        h.caps = capabilities({ email: true, password: true, google: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)

        expect(container.textContent).toContain('Choose signup method')
        const otpButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Email OTP')
        const passwordButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Password')
        expect(otpButton?.getAttribute('aria-pressed')).toBe('true')
        expect(passwordButton?.getAttribute('aria-pressed')).toBe('false')
        root.unmount()
    })

    it('google-only signup: honest notice plus the Google path, and no email/password form', async () => {
        h.caps = capabilities({ google: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)

        expect(container.textContent).toContain('Email signup is not available right now')
        expect(container.textContent).toContain('Sign up with Google')
        expect(container.querySelector('form')).toBeNull()
        expect(container.textContent).not.toContain('Create Account')
        expect(container.textContent).not.toContain('VITE_')
        root.unmount()
    })

    it('no methods at all: honest maintenance state whose button reaches the device-local workspace', async () => {
        h.caps = capabilities()
        const Page = await freshPage()
        const { container, root } = renderPage(Page)

        expect(container.textContent).toContain('Sign-up is being set up and is not available right now.')
        expect(container.textContent).not.toContain('Sign up with Google')

        const button = [...container.querySelectorAll('button')].find((b) =>
            (b.textContent ?? '').includes('Start using TruckOpti on this device')
        )
        expect(button).toBeTruthy()
        await act(async () => {
            button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
            await Promise.resolve()
        })

        expect(container.textContent).toContain('landed=/local-start')
        root.unmount()
    })
})
