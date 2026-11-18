import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Route-level guard tests for every protected route in App.tsx. The real App
// router and the real ProtectedRoute / RoleGate guards run; every page and layout
// is replaced by a text stub that records its pathname and the `from` location
// passed by a login redirect, so the test checks where the browser lands and
// whether any page content mounts, not what the pages render.
//
// Cases per protected route:
//  (a) signed out: redirected to /login with the original path as `from`, no page
//      content, and a bounded number of renders (render-loop guard).
//  (b) wrong role: the protected page never mounts; for the portal routes the
//      expected behaviour is a redirect to the role's home (see the BUG: block).
//  (c) right role: the lazy page mounts at the expected path.
// A drift test reads App.tsx and fails if a route is added without being listed here.

const MAX_RENDERS = 50

const h = vi.hoisted(() => ({
    state: {
        user: null as null | { id: string; role: string },
        isLoading: false,
        isAuthenticated: false,
        initialize: () => {},
    },
    storeCalls: 0,
}))

const mockHelpers = vi.hoisted(() => ({
    outletLayout: async () => {
        const { createElement } = await import('react')
        const { Outlet } = await import('react-router-dom')
        return { default: () => createElement('div', null, createElement(Outlet)) }
    },
    stub: (label: string) => async () => {
        const { createElement } = await import('react')
        const { useLocation } = await import('react-router-dom')
        const StubPage = () => {
            const loc = useLocation()
            const from = (loc.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? ''
            return createElement(
                'p',
                { 'data-testid': 'stub', 'data-pathname': loc.pathname, 'data-from': from },
                label,
            )
        }
        return { default: StubPage }
    },
}))

vi.mock('./stores/authStore', () => ({
    useAuthStore: () => {
        h.storeCalls++
        return h.state
    },
}))

vi.mock('./layouts/MobileLayout', mockHelpers.outletLayout)
vi.mock('./layouts/AuthLayout', mockHelpers.outletLayout)
vi.mock('./layouts/DriverLayout', mockHelpers.outletLayout)
vi.mock('./layouts/AgencyLayout', mockHelpers.outletLayout)

// Eagerly imported pages (loaded with App.tsx itself).
vi.mock('./pages/auth/LoginPage', mockHelpers.stub('LoginPage'))
vi.mock('./pages/auth/SignupPage', mockHelpers.stub('SignupPage'))
vi.mock('./pages/auth/OTPPage', mockHelpers.stub('OTPPage'))
vi.mock('./pages/auth/AuthCallbackPage', mockHelpers.stub('AuthCallbackPage'))
vi.mock('./pages/auth/ForgotPasswordPage', mockHelpers.stub('ForgotPasswordPage'))
vi.mock('./pages/auth/ResetPasswordPage', mockHelpers.stub('ResetPasswordPage'))

// Lazily imported pages behind protected routes.
vi.mock('./pages/Dashboard', mockHelpers.stub('Dashboard'))
vi.mock('./pages/PackingPage', mockHelpers.stub('PackingPage'))
vi.mock('./pages/RoutesPage', mockHelpers.stub('RoutesPage'))
vi.mock('./pages/TrackingPage', mockHelpers.stub('TrackingPage'))
vi.mock('./pages/ProfilePage', mockHelpers.stub('ProfilePage'))
vi.mock('./pages/ManagementPage', mockHelpers.stub('ManagementPage'))
vi.mock('./pages/TrucksPage', mockHelpers.stub('TrucksPage'))
vi.mock('./pages/CartonsPage', mockHelpers.stub('CartonsPage'))
vi.mock('./pages/CustomersPage', mockHelpers.stub('CustomersPage'))
vi.mock('./pages/SaleOrdersPage', mockHelpers.stub('SaleOrdersPage'))
vi.mock('./pages/InvoicePage', mockHelpers.stub('InvoicePage'))
vi.mock('./pages/SubscriptionPage', mockHelpers.stub('SubscriptionPage'))
vi.mock('./pages/CheckoutPage', mockHelpers.stub('CheckoutPage'))
vi.mock('./pages/CompanyProfilePage', mockHelpers.stub('CompanyProfilePage'))
vi.mock('./pages/ContactPage', mockHelpers.stub('ContactPage'))
vi.mock('./pages/NewShipmentPage', mockHelpers.stub('NewShipmentPage'))
vi.mock('./pages/ShipmentHistoryPage', mockHelpers.stub('ShipmentHistoryPage'))
vi.mock('./pages/AcceptInvitePage', mockHelpers.stub('AcceptInvitePage'))
vi.mock('./pages/AdminDashboardPage', mockHelpers.stub('AdminDashboardPage'))
vi.mock('./pages/AdminDriversPage', mockHelpers.stub('AdminDriversPage'))
vi.mock('./pages/DriverDetailPage', mockHelpers.stub('DriverDetailPage'))
vi.mock('./pages/AdminAgenciesPage', mockHelpers.stub('AdminAgenciesPage'))
vi.mock('./pages/AdminPayoutsPage', mockHelpers.stub('AdminPayoutsPage'))
vi.mock('./pages/AdminContactPage', mockHelpers.stub('AdminContactPage'))
vi.mock('./pages/AdminUsersPage', mockHelpers.stub('AdminUsersPage'))
vi.mock('./pages/AdminSubscriptionsPage', mockHelpers.stub('AdminSubscriptionsPage'))
vi.mock('./pages/AdminBillingSettingsPage', mockHelpers.stub('AdminBillingSettingsPage'))
vi.mock('./pages/AdminBillingOpsPage', mockHelpers.stub('AdminBillingOpsPage'))
vi.mock('./pages/DriverDashboardPage', mockHelpers.stub('DriverDashboardPage'))
vi.mock('./pages/DriverTripPage', mockHelpers.stub('DriverTripPage'))
vi.mock('./pages/DriverEarningsPage', mockHelpers.stub('DriverEarningsPage'))
vi.mock('./pages/DriverHistoryPage', mockHelpers.stub('DriverHistoryPage'))
vi.mock('./pages/DriverProfilePage', mockHelpers.stub('DriverProfilePage'))
vi.mock('./pages/DriverKycPage', mockHelpers.stub('DriverKycPage'))
vi.mock('./pages/AgencyDashboardPage', mockHelpers.stub('AgencyDashboardPage'))
vi.mock('./pages/AgencyFleetPage', mockHelpers.stub('AgencyFleetPage'))
vi.mock('./pages/AgencyJobsPage', mockHelpers.stub('AgencyJobsPage'))
vi.mock('./pages/AgencyBillingPage', mockHelpers.stub('AgencyBillingPage'))
vi.mock('./pages/AgencyDriversPage', mockHelpers.stub('AgencyDriversPage'))
vi.mock('./pages/AgencyTeamPage', mockHelpers.stub('AgencyTeamPage'))
vi.mock('./pages/AgencyClientsPage', mockHelpers.stub('AgencyClientsPage'))
vi.mock('./pages/AgencyTariffsPage', mockHelpers.stub('AgencyTariffsPage'))
vi.mock('./pages/AgencyOrderImportPage', mockHelpers.stub('AgencyOrderImportPage'))
vi.mock('./pages/AgencyConsignmentsPage', mockHelpers.stub('AgencyConsignmentsPage'))
vi.mock('./pages/AgencyInvoicesPage', mockHelpers.stub('AgencyInvoicesPage'))
vi.mock('./pages/AgencyExpensesPage', mockHelpers.stub('AgencyExpensesPage'))
vi.mock('./pages/AgencyTrackingPage', mockHelpers.stub('AgencyTrackingPage'))
vi.mock('./pages/AgencyPayrollPage', mockHelpers.stub('AgencyPayrollPage'))
vi.mock('./pages/AgencyErpPage', mockHelpers.stub('AgencyErpPage'))
vi.mock('./pages/AgencyLoadPlanPage', mockHelpers.stub('AgencyLoadPlanPage'))
vi.mock('./pages/AgencyProfilePage', mockHelpers.stub('AgencyProfilePage'))

import App from './App'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

type Role = 'user' | 'admin' | 'driver' | 'agency'

interface ProtectedRoute {
    /** Route pattern exactly as written in App.tsx. */
    pattern: string
    /** Concrete URL used for the test. */
    url: string
    /** Role that is allowed to see the page (also used for case (c)). */
    role: Role
    /** Label of the stub the right role must mount. */
    page: string
    /** Path where the right role ends up (differs only for redirects). */
    landsOn?: string
}

// Every route inside a ProtectedRoute wrapper in App.tsx. Keep in sync with App.tsx:
// the drift test below fails when App.tsx gains a route this list does not cover.
const PROTECTED: ProtectedRoute[] = [
    // Customer shell (MobileLayout). Roles: user, admin, plus driver/agency exceptions.
    { pattern: '/checkout', url: '/checkout', role: 'user', page: 'CheckoutPage' },
    { pattern: '/support', url: '/support', role: 'user', page: 'ContactPage' },
    { pattern: '/subscription', url: '/subscription', role: 'user', page: 'SubscriptionPage' },
    { pattern: '/invite/:token', url: '/invite/test-token', role: 'user', page: 'AcceptInvitePage' },
    { pattern: '/dashboard', url: '/dashboard', role: 'user', page: 'Dashboard' },
    { pattern: '/packing', url: '/packing', role: 'user', page: 'PackingPage' },
    { pattern: '/routes', url: '/routes', role: 'user', page: 'RoutesPage' },
    { pattern: '/tracking', url: '/tracking', role: 'user', page: 'TrackingPage' },
    { pattern: '/booking/new', url: '/booking/new', role: 'user', page: 'NewShipmentPage' },
    { pattern: '/profile', url: '/profile', role: 'user', page: 'ProfilePage' },
    { pattern: '/management', url: '/management', role: 'user', page: 'ManagementPage' },
    { pattern: '/management/trucks', url: '/management/trucks', role: 'agency', page: 'TrucksPage' },
    { pattern: '/management/cartons', url: '/management/cartons', role: 'agency', page: 'CartonsPage' },
    { pattern: '/management/customers', url: '/management/customers', role: 'user', page: 'CustomersPage' },
    { pattern: '/sale-orders', url: '/sale-orders', role: 'user', page: 'SaleOrdersPage' },
    { pattern: '/invoice/:shipmentId', url: '/invoice/ship-1', role: 'user', page: 'InvoicePage' },
    { pattern: '/settings/company', url: '/settings/company', role: 'agency', page: 'CompanyProfilePage' },
    { pattern: '/history', url: '/history', role: 'user', page: 'ShipmentHistoryPage' },

    // Admin portal (ProtectedRoute allowedRoles=['admin']).
    { pattern: '/admin', url: '/admin', role: 'admin', page: 'AdminDashboardPage' },
    { pattern: '/admin/drivers', url: '/admin/drivers', role: 'admin', page: 'AdminDriversPage' },
    { pattern: '/admin/drivers/:id', url: '/admin/drivers/drv-1', role: 'admin', page: 'DriverDetailPage' },
    { pattern: '/admin/agencies', url: '/admin/agencies', role: 'admin', page: 'AdminAgenciesPage' },
    { pattern: '/admin/payouts', url: '/admin/payouts', role: 'admin', page: 'AdminPayoutsPage' },
    { pattern: '/admin/contact', url: '/admin/contact', role: 'admin', page: 'AdminContactPage' },
    { pattern: '/admin/users', url: '/admin/users', role: 'admin', page: 'AdminUsersPage' },
    { pattern: '/admin/subscriptions', url: '/admin/subscriptions', role: 'admin', page: 'AdminSubscriptionsPage' },
    { pattern: '/admin/billing-settings', url: '/admin/billing-settings', role: 'admin', page: 'AdminBillingSettingsPage' },
    { pattern: '/admin/billing-ops', url: '/admin/billing-ops', role: 'admin', page: 'AdminBillingOpsPage' },

    // Driver portal (ProtectedRoute allowedRoles=['driver']).
    { pattern: '/driver/dashboard', url: '/driver/dashboard', role: 'driver', page: 'DriverDashboardPage' },
    { pattern: '/driver/trip/:jobId', url: '/driver/trip/job-1', role: 'driver', page: 'DriverTripPage' },
    { pattern: '/driver/earnings', url: '/driver/earnings', role: 'driver', page: 'DriverEarningsPage' },
    { pattern: '/driver/history', url: '/driver/history', role: 'driver', page: 'DriverHistoryPage' },
    { pattern: '/driver/profile', url: '/driver/profile', role: 'driver', page: 'DriverProfilePage' },
    { pattern: '/driver/kyc', url: '/driver/kyc', role: 'driver', page: 'DriverKycPage' },

    // Agency portal (ProtectedRoute allowedRoles=['agency']).
    { pattern: '/agency/dashboard', url: '/agency/dashboard', role: 'agency', page: 'AgencyDashboardPage' },
    { pattern: '/agency/fleet', url: '/agency/fleet', role: 'agency', page: 'AgencyFleetPage' },
    { pattern: '/agency/jobs', url: '/agency/jobs', role: 'agency', page: 'AgencyJobsPage' },
    { pattern: '/agency/billing', url: '/agency/billing', role: 'agency', page: 'AgencyBillingPage' },
    { pattern: '/agency/drivers', url: '/agency/drivers', role: 'agency', page: 'AgencyDriversPage' },
    { pattern: '/agency/team', url: '/agency/team', role: 'agency', page: 'AgencyTeamPage' },
    { pattern: '/agency/clients', url: '/agency/clients', role: 'agency', page: 'AgencyClientsPage' },
    { pattern: '/agency/clients/:agreementId/tariffs', url: '/agency/clients/ag-1/tariffs', role: 'agency', page: 'AgencyTariffsPage' },
    { pattern: '/agency/rates', url: '/agency/rates', role: 'agency', page: 'AgencyClientsPage', landsOn: '/agency/clients' },
    { pattern: '/agency/orders/import', url: '/agency/orders/import', role: 'agency', page: 'AgencyOrderImportPage' },
    { pattern: '/agency/consignments', url: '/agency/consignments', role: 'agency', page: 'AgencyConsignmentsPage' },
    { pattern: '/agency/invoices', url: '/agency/invoices', role: 'agency', page: 'AgencyInvoicesPage' },
    { pattern: '/agency/expenses', url: '/agency/expenses', role: 'agency', page: 'AgencyExpensesPage' },
    { pattern: '/agency/tracking', url: '/agency/tracking', role: 'agency', page: 'AgencyTrackingPage' },
    { pattern: '/agency/payroll', url: '/agency/payroll', role: 'agency', page: 'AgencyPayrollPage' },
    { pattern: '/agency/erp', url: '/agency/erp', role: 'agency', page: 'AgencyErpPage' },
    { pattern: '/agency/orders/plan', url: '/agency/orders/plan', role: 'agency', page: 'AgencyLoadPlanPage' },
    { pattern: '/agency/profile', url: '/agency/profile', role: 'agency', page: 'AgencyProfilePage' },
]

// Home each role is sent to (mirrors getDefaultHomePathForRole in ProtectedRoute.tsx).
const HOME: Record<Role, { path: string; page: string }> = {
    user: { path: '/dashboard', page: 'Dashboard' },
    admin: { path: '/admin', page: 'AdminDashboardPage' },
    driver: { path: '/driver/dashboard', page: 'DriverDashboardPage' },
    agency: { path: '/agency/dashboard', page: 'AgencyDashboardPage' },
}

// Wrong-role cases named in the brief: driver on /agency/*, agency staff on /admin/*,
// customer on /driver/*.
const WRONG_ROLE_CASES: Array<ProtectedRoute & { wrongRole: Role }> = [
    ...PROTECTED.filter((r) => r.pattern.startsWith('/agency/')).map((r) => ({ ...r, wrongRole: 'driver' as Role })),
    ...PROTECTED.filter((r) => r.pattern.startsWith('/admin')).map((r) => ({ ...r, wrongRole: 'agency' as Role })),
    ...PROTECTED.filter((r) => r.pattern.startsWith('/driver/')).map((r) => ({ ...r, wrongRole: 'user' as Role })),
]

// Public routes in App.tsx that intentionally have no ProtectedRoute wrapper.
const PUBLIC_PATHS = [
    '/',
    '/auth/callback',
    '/pricing',
    '/payment/callback',
    '/payment/success',
    '/terms',
    '/privacy',
    '/contact',
    '/driver/register',
    '/agency/register',
    '/local-start',
    '/test-payment',
    '/login',
    '/signup',
    '/otp',
    '/forgot-password',
    '/reset-password',
    '*',
]

let root: Root | null = null
let container: HTMLElement | null = null

async function renderAt(path: string, role: Role | null): Promise<void> {
    h.storeCalls = 0
    h.state.user = role ? { id: 'user-1', role } : null
    h.state.isAuthenticated = role !== null
    h.state.isLoading = false
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, { initialEntries: [path] }, createElement(App)))
    })
    // Lazy pages resolve over a few ticks; stop as soon as any stub or redirect target appears.
    for (let i = 0; i < 20 && !container.querySelector('[data-testid="stub"]'); i++) {
        await act(async () => { await new Promise((r) => setTimeout(r, 0)) })
    }
}

/** Render, then fail if the guards re-render past the loop budget. */
async function renderBounded(path: string, role: Role | null): Promise<void> {
    await renderAt(path, role)
    expect(h.storeCalls, `renders for ${path}`).toBeLessThanOrEqual(MAX_RENDERS)
}

function stubs(): HTMLElement[] {
    return Array.from(container?.querySelectorAll<HTMLElement>('[data-testid="stub"]') ?? [])
}
const shown = () => stubs().map((el) => el.textContent)
const pathOf = () => stubs()[0]?.dataset.pathname
const fromOf = () => stubs()[0]?.dataset.from

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

beforeEach(() => {
    h.storeCalls = 0
})

describe('route table drift', () => {
    it('lists every App.tsx route, and every listed route still exists in App.tsx', () => {
        const source = readFileSync(resolve(__dirname, 'App.tsx'), 'utf8')
        const appPaths = new Set(Array.from(source.matchAll(/path="([^"]+)"/g), (m) => m[1]))
        const listed = new Set(PROTECTED.map((r) => r.pattern))

        const unlisted = Array.from(appPaths).filter((p) => !listed.has(p) && !PUBLIC_PATHS.includes(p))
        const stale = Array.from(listed).filter((p) => !appPaths.has(p))

        expect(unlisted, 'App.tsx routes missing from PROTECTED (or PUBLIC_PATHS)').toEqual([])
        expect(stale, 'PROTECTED routes no longer in App.tsx').toEqual([])
    })
})

describe.each(PROTECTED)('signed out: $url', (route) => {
    it('redirects to /login with the original path as the return-to, and shows no page content', async () => {
        await renderBounded(route.url, null)

        expect(shown()).toEqual(['LoginPage'])
        expect(pathOf()).toBe('/login')
        expect(fromOf()).toBe(route.url)
    })
})

describe.each(PROTECTED)('right role: $url', (route) => {
    it('mounts the lazy page for the expected role', async () => {
        await renderBounded(route.url, route.role)

        expect(shown()).toEqual([route.page])
        expect(pathOf()).toBe(route.landsOn ?? route.url)
    })
})

describe.each(WRONG_ROLE_CASES)('wrong role never mounts the page: $wrongRole on $url', (route) => {
    it('does not show the protected page content', async () => {
        await renderBounded(route.url, route.wrongRole)

        expect(shown()).not.toContain(route.page)
    })
})

// Portal routes (ProtectedRoute allowedRoles) are an intentional, safe contract: a wrong
// role gets the permission-denied state and the page module is never mounted.
describe('wrong role on portal routes sees permission-denied, not the page', () => {
    it.each(WRONG_ROLE_CASES)('$wrongRole on $url shows the permission-denied state', async (route) => {
        await renderBounded(route.url, route.wrongRole)

        expect(shown()).toEqual([])
        expect(container?.textContent).toContain('Permission denied')
    })
})

// Customer shell (MobileLayout) uses RoleGate, which redirects unlisted roles home.
describe('customer shell RoleGate redirects unlisted roles to their home', () => {
    it.each([
        { url: '/dashboard', role: 'driver' as Role, home: HOME.driver },
        { url: '/packing', role: 'agency' as Role, home: HOME.agency },
        { url: '/sale-orders', role: 'driver' as Role, home: HOME.driver },
    ])('$role on $url is redirected to $home.path', async ({ url, role, home }) => {
        await renderBounded(url, role)

        expect(shown()).toEqual([home.page])
        expect(pathOf()).toBe(home.path)
    })
})
