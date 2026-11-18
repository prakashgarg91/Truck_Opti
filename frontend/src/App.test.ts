import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Route-level regression pin for App.tsx: the customer shell only opens for the
// customer roles (user, admin), drivers and agency staff are sent to their own
// home, the old agency Rates route redirects to Clients, and the orphan
// /payment/success alias goes to /subscription. Pages are replaced by text stubs
// so the test exercises routing and guards, not page content.

const h = vi.hoisted(() => ({
    state: {
        user: null as null | { id: string; role: string },
        isLoading: false,
        isAuthenticated: true,
        initialize: () => {},
    },
}))

const mockHelpers = vi.hoisted(() => ({
    outletLayout: async () => {
        const { createElement } = await import('react')
        const { Outlet } = await import('react-router-dom')
        return { default: () => createElement('div', null, createElement(Outlet)) }
    },
    stub: (label: string) => async () => {
        const { createElement } = await import('react')
        return { default: () => createElement('p', { 'data-testid': 'stub' }, label) }
    },
}))

vi.mock('./stores/authStore', () => ({ useAuthStore: () => h.state }))

vi.mock('./layouts/MobileLayout', mockHelpers.outletLayout)
vi.mock('./layouts/AuthLayout', mockHelpers.outletLayout)
vi.mock('./layouts/DriverLayout', mockHelpers.outletLayout)
vi.mock('./layouts/AgencyLayout', mockHelpers.outletLayout)

vi.mock('./pages/auth/LoginPage', mockHelpers.stub('login-page'))
vi.mock('./pages/auth/SignupPage', mockHelpers.stub('signup-page'))
vi.mock('./pages/auth/OTPPage', mockHelpers.stub('otp-page'))
vi.mock('./pages/auth/AuthCallbackPage', mockHelpers.stub('auth-callback-page'))
vi.mock('./pages/auth/ForgotPasswordPage', mockHelpers.stub('forgot-password-page'))
vi.mock('./pages/auth/ResetPasswordPage', mockHelpers.stub('reset-password-page'))
vi.mock('./pages/Dashboard', mockHelpers.stub('customer-dashboard'))
vi.mock('./pages/ProfilePage', mockHelpers.stub('customer-profile'))
vi.mock('./pages/CompanyProfilePage', mockHelpers.stub('company-settings'))
vi.mock('./pages/SubscriptionPage', mockHelpers.stub('subscription-page'))
vi.mock('./pages/AgencyDashboardPage', mockHelpers.stub('agency-dashboard'))
vi.mock('./pages/AgencyClientsPage', mockHelpers.stub('agency-clients'))
vi.mock('./pages/DriverDashboardPage', mockHelpers.stub('driver-dashboard'))

import App from './App'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

async function renderAt(path: string, role: string | null): Promise<void> {
    h.state.user = role ? { id: 'user-1', role } : null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)))
    })
    // Lazy pages resolve over a few ticks; wait until a stub or the redirect target appears.
    for (let i = 0; i < 20 && !container.querySelector('[data-testid="stub"]'); i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    }
}

const shown = () => Array.from(container?.querySelectorAll('[data-testid="stub"]') ?? []).map((el) => el.textContent)

beforeEach(() => {
    h.state.isLoading = false
    h.state.isAuthenticated = true
})

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

describe('App customer shell role gate', () => {
    it('lets a customer open the customer dashboard', async () => {
        await renderAt('/dashboard', 'user')
        expect(shown()).toEqual(['customer-dashboard'])
    })

    it('lets an admin open the customer dashboard', async () => {
        await renderAt('/dashboard', 'admin')
        expect(shown()).toEqual(['customer-dashboard'])
    })

    it('sends a driver from the customer dashboard to the driver home', async () => {
        await renderAt('/dashboard', 'driver')
        expect(shown()).toEqual(['driver-dashboard'])
    })

    it('sends agency staff from the customer dashboard to the agency home', async () => {
        await renderAt('/dashboard', 'agency')
        expect(shown()).toEqual(['agency-dashboard'])
    })

    it('keeps /profile open for drivers, whose profile page links there', async () => {
        await renderAt('/profile', 'driver')
        expect(shown()).toEqual(['customer-profile'])
    })

    it('keeps /settings/company open for agency owners and staff', async () => {
        await renderAt('/settings/company', 'agency')
        expect(shown()).toEqual(['company-settings'])
    })

    it('still blocks a driver from /settings/company', async () => {
        await renderAt('/settings/company', 'driver')
        expect(shown()).toEqual(['driver-dashboard'])
    })
})

describe('App legacy and retired routes', () => {
    it('redirects /payment/success to /subscription', async () => {
        await renderAt('/payment/success', 'user')
        expect(shown()).toEqual(['subscription-page'])
    })

    it('redirects the retired agency Rates route to Clients (per-client tariffs)', async () => {
        await renderAt('/agency/rates', 'agency')
        expect(shown()).toEqual(['agency-clients'])
    })
})
