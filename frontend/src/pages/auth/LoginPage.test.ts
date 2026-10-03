import { act } from 'react'
import { createElement } from 'react'
import type { ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// TO-123: every login surface renders only the sign-in methods the canonical
// capability model calls enabled, never suggests an unavailable method, and
// never leaks environment names or developer setup copy to users.
const h = vi.hoisted(() => ({
    isSupabaseReachable: vi.fn(async () => true),
    signInWithEmail: vi.fn(async () => undefined),
    signInWithPhone: vi.fn(async () => undefined),
    signInWithEmailPassword: vi.fn(async () => ({ session: null })),
    caps: null as unknown as Record<string, unknown>,
}))

vi.mock('../../lib/supabase', () => ({
    supabase: {},
    isSupabaseConfigured: true,
    isSupabaseReachable: h.isSupabaseReachable,
}))

vi.mock('../../lib/authSurfaceMethods', () => ({
    // Getter: the mock registry survives vi.resetModules(), so the capability
    // object must be evaluated at import/use time to let tests flip it.
    get authSurfaceMethods() {
        return h.caps
    },
}))

vi.mock('../../services/supabaseApi', () => ({
    authSupabaseApi: {
        signInWithEmail: h.signInWithEmail,
        signInWithPhone: h.signInWithPhone,
        signInWithEmailPassword: h.signInWithEmailPassword,
    },
}))

vi.mock('react-hot-toast', () => ({
    default: { success: vi.fn(), error: vi.fn() },
}))

type MethodToggles = {
    google?: boolean
    email?: boolean
    phone?: boolean
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
        phoneOtp: method('phone_otp', toggles.phone ?? false),
        officePassword: method('office_password', toggles.password ?? false),
        hasCloudMethod: Boolean(toggles.google || toggles.email || toggles.phone),
    }
}

const Landed = () => {
    const location = useLocation()
    return createElement('div', { id: 'landed' }, `landed=${location.pathname}`)
}

async function freshPage() {
    vi.resetModules()
    const mod = await import('../../pages/auth/LoginPage')
    return mod.default as ComponentType
}

function renderPage(Page: ComponentType, initialEntry = '/login') {
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
                    { initialEntries: [initialEntry] },
                    createElement(
                        Routes,
                        null,
                        createElement(Route, { path: '/login', element: createElement(Page) }),
                        createElement(Route, { path: '*', element: createElement(Landed) }),
                    ),
                ),
            ),
        )
    })
    return { container, root }
}

async function flush() {
    await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
    })
}

async function click(container: HTMLElement, selector: string) {
    const button = [...container.querySelectorAll('button')].find((el) =>
        (el.textContent ?? '').includes(selector)
    )
    expect(button, `expected a button containing "${selector}"`).toBeTruthy()
    await act(async () => {
        button!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await Promise.resolve()
    })
    return button!
}

function setInputValue(container: HTMLElement, selector: string, value: string) {
    const input = container.querySelector(selector) as HTMLInputElement | null
    expect(input, `expected an input matching ${selector}`).toBeTruthy()
    // React controlled inputs ignore direct value writes: go through the
    // native value setter so the input event is seen as a real change.
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!
    act(() => {
        nativeSetter.call(input!, value)
        input!.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

beforeEach(() => {
    h.isSupabaseReachable.mockReset()
    h.isSupabaseReachable.mockResolvedValue(true)
    h.signInWithEmail.mockReset()
    h.signInWithPhone.mockReset()
    h.signInWithEmailPassword.mockReset()
    h.signInWithEmailPassword.mockResolvedValue({ session: null })
    document.title = ''
})

describe('LoginPage method availability matrix (TO-123)', () => {
    it('no-provider: renders the honest maintenance state with a device-local workspace and no unavailable method', async () => {
        h.caps = capabilities()
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(document.title).toBe('Welcome Back - TruckOpti')
        expect(container.textContent).toContain('Sign-in is being set up and is not available right now.')
        expect(container.textContent).toContain('Start using TruckOpti on this device')
        // No unavailable method is suggested anywhere.
        expect(container.querySelector('form')).toBeNull()
        expect(container.textContent).not.toContain('needs setup')
        expect(container.textContent).not.toContain('Continue with Google')
        expect(container.textContent).not.toContain('VITE_')
        expect(container.textContent).not.toContain('in this environment')
        root.unmount()
    })

    it('google-only: shows the Google path and no OTP or password form', async () => {
        h.caps = capabilities({ google: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(container.textContent).toContain('Continue with Google')
        expect(container.textContent).not.toContain('Receive OTP via')
        expect(container.textContent).not.toContain('Sign In with Password')
        expect(container.textContent).not.toContain('Sign-in is being set up')
        root.unmount()
    })

    it('password-only: defaults to the password form with no dead OTP chooser', async () => {
        h.caps = capabilities({ password: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(container.querySelector('input[autocomplete="current-password"]')).toBeTruthy()
        expect(container.textContent).toContain('Sign In with Password')
        expect(container.textContent).not.toContain('Choose sign-in method')
        expect(container.textContent).not.toContain('Receive OTP via')
        root.unmount()
    })

    it('email-only: offers the email OTP channel without phone channels', async () => {
        h.caps = capabilities({ email: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(container.querySelector('input[autocomplete="email"]')).toBeTruthy()
        expect(container.textContent).toContain('Send Email OTP')
        expect(container.textContent).toContain('Phone sign-in is not available yet')
        expect(container.textContent).not.toContain('WhatsApp')
        expect(container.textContent).not.toContain('SMS')
        root.unmount()
    })

    it('phone-only: offers SMS/WhatsApp without an email channel and explains the honest state', async () => {
        h.caps = capabilities({ phone: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(container.querySelector('input[autocomplete="tel"]')).toBeTruthy()
        expect(container.textContent).toContain('Get OTP')
        expect(container.textContent).toContain('Email sign-in is not available yet')
        expect(container.textContent).not.toContain('Send Email OTP')
        root.unmount()
    })

    it('email + phone + password: renders the method chooser with pressed state', async () => {
        h.caps = capabilities({ email: true, phone: true, password: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(container.textContent).toContain('Choose sign-in method')
        const otpButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'OTP')
        const passwordButton = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Password')
        expect(otpButton?.getAttribute('aria-pressed')).toBe('true')
        expect(passwordButton?.getAttribute('aria-pressed')).toBe('false')
        root.unmount()
    })

    it('hides the Google divider entirely when Google is not enabled', async () => {
        h.caps = capabilities({ email: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(container.textContent).not.toContain('Or continue with')
        expect(container.textContent).not.toContain('Continue with Google')
        root.unmount()
    })
})

describe('LoginPage surfaces (TO-123)', () => {
    it('driver surface renders its own title and registration link', async () => {
        h.caps = capabilities({ email: true, google: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page, '/login?mode=driver')
        await flush()

        expect(document.title).toBe('Driver Login - TruckOpti')
        expect(container.textContent).toContain('Register Driver')
        expect(container.textContent).not.toContain('VITE_')
        root.unmount()
    })

    it('agency surface renders its own title and registration link', async () => {
        h.caps = capabilities({ email: true, google: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page, '/login?mode=agency')
        await flush()

        expect(document.title).toBe('Agency Login - TruckOpti')
        expect(container.textContent).toContain('Register Agency')
        root.unmount()
    })

    it('office surface defaults to the working password path with keyboard focus on the identifier', async () => {
        h.caps = capabilities({ password: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page, '/login?mode=office')
        await flush()

        expect(document.title).toBe('Office Login - TruckOpti')
        expect(container.querySelector('input[autocomplete="current-password"]')).toBeTruthy()
        expect(document.activeElement?.getAttribute('autocomplete')).toBe('username')
        expect(container.textContent).toContain('Sign In with Password')
        // Office has no self-signup link.
        expect(container.textContent).not.toContain('Create Account')
        expect(container.textContent).not.toContain('VITE_')
        root.unmount()
    })

    it('office surface without password shows an honest blocked state and a local workspace', async () => {
        h.caps = capabilities()
        const Page = await freshPage()
        const { container, root } = renderPage(Page, '/login?mode=office')
        await flush()

        expect(document.title).toBe('Office Login - TruckOpti')
        expect(container.textContent).toContain(
            'Password sign-in is not available for office accounts yet. Ask your TruckOpti administrator for access.'
        )
        expect(container.textContent).toContain('Start using TruckOpti on this device')
        expect(container.textContent).not.toContain('VITE_')
        expect(container.textContent).not.toContain('needs setup')
        root.unmount()
    })

    it('partner surface defaults to the password path', async () => {
        h.caps = capabilities({ password: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page, '/login?mode=partner')
        await flush()

        expect(document.title).toBe('Partner Login - TruckOpti')
        expect(container.querySelector('input[autocomplete="current-password"]')).toBeTruthy()
        root.unmount()
    })
})

describe('LoginPage offline and password flows (TO-123)', () => {
    it('backend-down entry navigates to the device-local workspace at /local-start', async () => {
        h.caps = capabilities({ google: true })
        h.isSupabaseReachable.mockResolvedValue(false)
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        expect(container.textContent).toContain('Continue offline on this device')
        await click(container, 'Continue offline on this device')

        expect(container.textContent).toContain('landed=/local-start')
        root.unmount()
    })

    it('no-method maintenance card also navigates to /local-start', async () => {
        h.caps = capabilities()
        const Page = await freshPage()
        const { container, root } = renderPage(Page)
        await flush()

        await click(container, 'Start using TruckOpti on this device')

        expect(container.textContent).toContain('landed=/local-start')
        root.unmount()
    })

    it('invalid credentials keep the submit disabled and never call the password mutation', async () => {
        h.caps = capabilities({ password: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page, '/login?mode=office')
        await flush()

        setInputValue(container, 'input[autocomplete="username"]', 'ab')
        setInputValue(container, 'input[autocomplete="current-password"]', 'short')
        await flush()

        const submit = [...container.querySelectorAll('button')].find((b) =>
            (b.textContent ?? '').includes('Sign In with Password')
        )
        expect(submit).toBeTruthy()
        expect(submit!.disabled).toBe(true)
        expect(h.signInWithEmailPassword).not.toHaveBeenCalled()
        root.unmount()
    })

    it('wrong credentials surface the enumeration-safe error honestly', async () => {
        h.caps = capabilities({ password: true })
        const Page = await freshPage()
        // The page resolved its own module registry under resetModules: the
        // rejection must use THAT UserFacingError class for instanceof to hold.
        const { UserFacingError: FreshUserFacingError } = await import('../../utils/userFacingError')
        h.signInWithEmailPassword.mockRejectedValue(
            new FreshUserFacingError('Incorrect login ID, email, or password. Please try again.')
        )
        const { container, root } = renderPage(Page, '/login?mode=office')
        await flush()

        setInputValue(container, 'input[autocomplete="username"]', 'demo.office')
        setInputValue(container, 'input[autocomplete="current-password"]', 'wrong-password')
        await click(container, 'Sign In with Password')
        await flush()

        expect(h.signInWithEmailPassword).toHaveBeenCalledTimes(1)
        expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
            'Incorrect login ID, email, or password. Please try again.'
        )
        root.unmount()
    })

    it('valid credentials call the password sign-in mutation exactly once', async () => {
        h.caps = capabilities({ password: true })
        const Page = await freshPage()
        const { container, root } = renderPage(Page, '/login?mode=office')
        await flush()

        setInputValue(container, 'input[autocomplete="username"]', 'demo.office')
        setInputValue(container, 'input[autocomplete="current-password"]', 'correct-horse-battery')
        await click(container, 'Sign In with Password')
        await flush()

        expect(h.signInWithEmailPassword).toHaveBeenCalledTimes(1)
        expect(h.signInWithEmailPassword).toHaveBeenCalledWith('demo.office', 'correct-horse-battery')
        root.unmount()
    })
})
