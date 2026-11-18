import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// PackingPage truck list resilience (2026-11-18): loading is announced, a
// failed truck load shows an inline alert with Retry (not an empty list), and
// an account with no trucks gets an explicit empty message.

const h = vi.hoisted(() => ({
    getAll: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() } }))
vi.mock('../components/TruckViewer', () => ({ default: () => null }))
vi.mock('../services/supabaseApi', () => {
    // Every other API method resolves to an empty list; only trucks are driven by the test.
    const passive = () => new Proxy({}, { get: () => vi.fn(async () => []) })
    return {
        trucksSupabaseApi: { getAll: h.getAll },
        packingJobsSupabaseApi: passive(),
        shipmentsSupabaseApi: passive(),
        customersSupabaseApi: passive(),
        notificationsSupabaseApi: passive(),
        saleOrdersSupabaseApi: passive(),
    }
})
vi.mock('../hooks/usePackingWorker', () => ({
    usePackingWorker: () => ({
        runPacking: vi.fn(),
        runRecommendation: vi.fn(),
        isSupported: false,
        terminate: vi.fn(),
    }),
}))
vi.mock('../hooks/useSubscription', () => ({
    useSubscription: () => ({ isExpired: false, checkLimit: vi.fn(() => true), showUpgradePrompt: vi.fn() }),
}))
vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'user-1', role: 'user' } }),
}))

import PackingPage from './PackingPage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const truckRow = {
    id: 'truck-1',
    name: 'Tata Ace 7.5ft',
    length: 228,
    width: 152,
    height: 152,
    capacity: 750,
    cost_per_km: 12,
    available: 1,
}

let root: Root | null = null
let container: HTMLElement | null = null

async function flush() {
    for (let i = 0; i < 20; i++) await Promise.resolve()
}

async function mountPage() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, null, createElement(PackingPage)))
        await flush()
    })
    // The truck picker is only rendered in manual mode; the default is smart.
    const manual = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Manual')
    if (manual) {
        await act(async () => {
            manual.click()
            await flush()
        })
    }
    for (let i = 0; i < 10 && container.textContent?.includes('Loading trucks'); i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }
    return container
}

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

describe('PackingPage truck list states', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.getAll.mockResolvedValue([truckRow])
    })

    it('announces the truck loading state while the fleet is fetched', async () => {
        h.getAll.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const status = q('[role="status"][aria-label="Loading trucks"]')
        expect(status).not.toBeNull()
        expect(q('[role="alert"]')).toBeNull()
    })

    it('a failed truck load shows an inline alert with Retry instead of an empty list', async () => {
        h.getAll.mockRejectedValueOnce(new Error('network down'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Could not load trucks.')
        expect(text()).not.toContain('No trucks available')
        expect(text()).not.toContain('Tata Ace 7.5ft')
    })

    it('Retry refetches the trucks and lists them on success', async () => {
        h.getAll.mockRejectedValueOnce(new Error('network down'))
        await mountPage()
        const retry = Array.from((container as HTMLElement).querySelectorAll('button')).find(
            (b) => b.textContent?.trim() === 'Retry',
        ) as HTMLElement
        expect(retry.className).toContain('min-h-[44px]')
        await act(async () => {
            retry.click()
            await flush()
        })
        for (let i = 0; i < 10 && !text().includes('Tata Ace 7.5ft'); i++) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0))
            })
        }
        expect(h.getAll).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
        expect(text()).toContain('Tata Ace 7.5ft')
    })

    it('an account with no usable trucks sees an explicit empty message', async () => {
        h.getAll.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No trucks available')
        expect(q('[role="alert"]')).toBeNull()
    })
})
