import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TrackingPage resilience and accessibility pins (2026-11-18): the list shows a
// loading state while fetching (not the "No active shipments" empty state), a
// failed load shows an inline alert with Retry, cancelling a shipment goes
// through the in-app dialog (never window.confirm), and the search and filter
// controls are labelled.

const h = vi.hoisted(() => ({
    getAll: vi.fn(),
    updateStatus: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() } }))
vi.mock('../components/MapViewWrapper', () => ({ default: () => null }))
vi.mock('../utils/whatsappShare', () => ({ shareTrackingLink: vi.fn() }))
vi.mock('../services/tripPhotoUrl', () => ({ resolveTripPhotoUrl: vi.fn(async () => null) }))
vi.mock('../stores/languageStore', () => ({ useLanguageStore: () => ({ language: 'en' }) }))
vi.mock('../lib/supabase', () => ({ supabase: { removeChannel: vi.fn(), channel: vi.fn() }, isSupabaseConfigured: false }))
vi.mock('../services/supabaseApi', () => ({
    shipmentsSupabaseApi: { getAll: h.getAll, updateStatus: h.updateStatus },
    customerTrackingApi: { getActiveOfferDrivers: vi.fn(async () => []) },
    notificationsSupabaseApi: { getAll: vi.fn(async () => []) },
    saleOrdersSupabaseApi: { getAll: vi.fn(async () => []) },
}))

import TrackingPage from './TrackingPage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const pendingRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'ship-1',
    shipment_id: 'SHP-1',
    status: 'pending',
    origin: 'Mumbai',
    destination: 'Pune',
    total_weight: 100,
    ...overrides,
})

let root: Root | null = null
let container: HTMLElement | null = null

async function flush() {
    for (let i = 0; i < 20; i++) await Promise.resolve()
}

async function renderPage() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
        root!.render(createElement(QueryClientProvider, { client }, createElement(MemoryRouter, null, createElement(TrackingPage))))
        await flush()
    })
    for (let i = 0; i < 10 && container.textContent?.includes('Loading shipments'); i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }
    return container
}

const buttonByText = (label: string) =>
    Array.from(container!.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLElement | undefined

const chipByLabel = (label: string) =>
    Array.from(container!.querySelectorAll('button')).find((b) => b.textContent?.trim().startsWith(label)) as HTMLElement | undefined

async function click(el: HTMLElement) {
    await act(async () => {
        el.click()
        await flush()
    })
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

describe('TrackingPage resilience and accessibility', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.getAll.mockResolvedValue([pendingRow()])
        h.updateStatus.mockResolvedValue(undefined)
    })

    it('shows a loading status while shipments are fetched, not the empty state', async () => {
        h.getAll.mockReturnValue(new Promise(() => {}))
        await renderPage()
        const status = container!.querySelector('[role="status"]')
        expect(status?.textContent).toContain('Loading shipments...')
        expect(container!.textContent).not.toContain('No active shipments')
    })

    it('a failed load shows an inline alert with Retry, and Retry refetches the list', async () => {
        h.getAll.mockRejectedValueOnce(new Error('network down'))
        await renderPage()
        const alert = container!.querySelector('[role="alert"]')
        expect(alert?.textContent).toContain('Could not load shipments.')
        expect(container!.textContent).not.toContain('No active shipments')
        const retry = buttonByText('Retry')
        expect(retry).toBeDefined()
        expect(retry!.className).toContain('min-h-[44px]')

        await click(retry!)
        for (let i = 0; i < 10 && container!.querySelector('[role="alert"]'); i++) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0))
            })
        }
        expect(h.getAll).toHaveBeenCalledTimes(2)
        expect(container!.querySelector('[role="alert"]')).toBeNull()
        expect(container!.textContent).toContain('SHP-1')
    })

    it('search and status filter controls expose accessible names and pressed state', async () => {
        await renderPage()
        expect(container!.querySelector('input')?.getAttribute('aria-label')).toBe('Search shipments, drivers or vehicles')
        expect(chipByLabel('All')?.getAttribute('aria-pressed')).toBe('true')
        expect(chipByLabel('Pending')?.getAttribute('aria-pressed')).toBe('false')
    })

    it('cancelling a shipment asks in the in-app dialog and never calls window.confirm', async () => {
        const nativeConfirm = vi.spyOn(window, 'confirm')
        await renderPage()
        const row = Array.from(container!.querySelectorAll('div')).find(
            (d) => d.className.includes('cursor-pointer') && d.textContent?.includes('SHP-1'),
        ) as HTMLElement
        await click(row)
        await click(buttonByText('Cancel Shipment')!)

        expect(nativeConfirm).not.toHaveBeenCalled()
        const dialog = container!.querySelector('[role="alertdialog"]')
        expect(dialog?.textContent).toContain('Cancel shipment SHP-1? This cannot be undone.')

        await click(buttonByText('Keep shipment')!)
        expect(container!.querySelector('[role="alertdialog"]')).toBeNull()
        expect(h.updateStatus).not.toHaveBeenCalled()

        await click(buttonByText('Cancel Shipment')!)
        await click(buttonByText('Cancel shipment')!)
        expect(h.updateStatus).toHaveBeenCalledWith('ship-1', 'cancelled')
        expect(container!.querySelector('[role="alertdialog"]')).toBeNull()
        nativeConfirm.mockRestore()
    })
})
