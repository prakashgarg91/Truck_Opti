import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PricingPage renders plans from the database when it loads and from
// config/pricing.ts when it does not. Both paths must show human labels only.

const h = vi.hoisted(() => ({
    getAll: vi.fn(),
}))

vi.mock('../services/subscriptionApi', () => ({
    subscriptionPlansApi: { getAll: h.getAll },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: null }),
}))

vi.mock('../hooks/useSubscription', () => ({
    useSubscription: () => ({ subscription: null, plan: null }),
}))

import PricingPage from './PricingPage'

const DB_PLANS = [
    {
        id: 'p-starter', name: 'Starter', tier: 'starter',
        price_monthly: 49900, price_yearly: 499000,
        trucks_limit: 3, shipments_monthly: 50, users_limit: 2, storage_gb: 1,
        api_calls_monthly: 1000, sms_included: 100, maps_requests_monthly: 500,
        support_level: 'email',
        features: ['basic_3d_packing', 'route_planning', 'shipment_tracking', 'basic_reports'],
    },
    {
        id: 'p-growth', name: 'Growth', tier: 'growth',
        price_monthly: 199900, price_yearly: 1999000,
        trucks_limit: 20, shipments_monthly: 500, users_limit: 10, storage_gb: 10,
        api_calls_monthly: 10000, sms_included: 500, maps_requests_monthly: 5000,
        support_level: 'chat',
        features: [
            'brand_new_feature', 'advanced_3d_packing', 'multi_stop_optimization', 'live_tracking',
            'analytics_dashboard', 'export_reports', 'api_access',
        ],
    },
]

function LocationProbe() {
    const location = useLocation()
    return createElement('div', { 'data-testid': 'location-probe' }, `${location.pathname}${location.search}`)
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                QueryClientProvider,
                { client },
                createElement(
                    MemoryRouter,
                    { initialEntries: ['/pricing'] },
                    createElement(PricingPage),
                    createElement(LocationProbe),
                ),
            ),
        )
        await new Promise((r) => setTimeout(r, 150))
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
    document.title = ''
})

const text = () => (container as HTMLElement).textContent || ''
const probe = () => (container as HTMLElement).querySelector('[data-testid="location-probe"]')?.textContent || ''
const buttonsNamed = (label: string) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => (b.textContent || '').trim() === label)

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

describe('PricingPage plan rendering', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('shows human feature labels, never raw slugs, when the database loads', async () => {
        h.getAll.mockResolvedValue(DB_PLANS)
        await mountPage()
        expect(text()).toContain('Basic reports')
        expect(text()).toContain('3D bin packing')
        expect(text()).toContain('Live GPS tracking')
        expect(text()).not.toMatch(/basic_reports|basic_3d_packing|route_planning|api_access|live_tracking/)
        expect(text()).not.toMatch(/_/)
    })

    it('title-cases a slug the map does not know yet', async () => {
        h.getAll.mockResolvedValue(DB_PLANS)
        await mountPage()
        expect(text()).toContain('Brand New Feature')
    })

    it('shows the support level as a label, not a code', async () => {
        h.getAll.mockResolvedValue(DB_PLANS)
        await mountPage()
        expect(text()).toContain('Email support')
        expect(text()).toContain('Chat support')
    })

    it('says how many features are hidden instead of cutting them silently', async () => {
        h.getAll.mockResolvedValue(DB_PLANS)
        await mountPage()
        // Growth has 7 features and 5 are shown
        expect(text()).toContain('+2 more')
    })

    it('does not render the duplicate Packing Opts row', async () => {
        h.getAll.mockResolvedValue(DB_PLANS)
        await mountPage()
        expect(text()).not.toContain('Packing Opts')
    })

    it('a zero limit reads as 0, not Unlimited', async () => {
        h.getAll.mockResolvedValue([{ ...DB_PLANS[0], shipments_monthly: 0 }])
        await mountPage()
        // "Shipments/mo" row for Starter must show 0
        const rows = Array.from((container as HTMLElement).querySelectorAll('tr'))
        const row = rows.find((r) => (r.textContent || '').includes('Shipments/mo'))
        expect(row?.textContent).toContain('0')
        expect(row?.textContent).not.toContain('Unlimited')
    })

    it('falls back to the config plans with human labels when the database fails', async () => {
        h.getAll.mockRejectedValue(new Error('offline'))
        await mountPage()
        expect(text()).toContain('₹499')
        expect(text()).toContain('₹1,999')
        expect(text()).toContain('₹4,999')
        expect(text()).toContain('Three 3D packing methods')
        expect(text()).not.toMatch(/_/)
        expect(text()).not.toContain('WhatsApp')
    })

    it('the free-trial CTA sends agencies to agency registration, not customer sign-up', async () => {
        h.getAll.mockResolvedValue(DB_PLANS)
        await mountPage()
        expect(text()).toContain('14-day agency trial')
        expect(text()).not.toContain('Free Forever')
        const cta = buttonsNamed('Start your free agency trial →')
        expect(cta).toHaveLength(1)
        await click(cta[0])
        expect(probe()).toBe('/agency/register')
    })

    it('the page title is set', async () => {
        h.getAll.mockResolvedValue(DB_PLANS)
        await mountPage()
        expect(document.title).toBe('Pricing — TruckOpti')
    })
})
