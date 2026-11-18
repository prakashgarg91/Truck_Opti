import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ManagementPage resilience and accessibility pins: loading spinner is
// announced, a failed count load shows an error card with Retry (never a
// misleading zero), the cards are keyboard operable and navigate on Enter.

const h = vi.hoisted(() => ({
    getManagementCounts: vi.fn(),
    toastError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: vi.fn() } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() } }))
vi.mock('../services/supabaseApi', () => ({
    customerDashboardApi: { getManagementCounts: h.getManagementCounts },
}))

import ManagementPage from './ManagementPage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function LocationProbe() {
    const location = useLocation()
    return createElement('p', { 'data-testid': 'location-probe' }, location.pathname)
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
        root!.render(createElement(MemoryRouter, null, createElement(ManagementPage), createElement(LocationProbe)))
        await flush()
    })
    return container
}

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''

async function click(el: Element) {
    await act(async () => {
        el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
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
    document.title = ''
})

describe('ManagementPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.getManagementCounts.mockResolvedValue({ trucks: 3, cartons: 5, customers: 7 })
    })

    it('announces the loading state while counts load', async () => {
        h.getManagementCounts.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const spinner = q('[role="status"]')
        expect(spinner).not.toBeNull()
        expect(spinner?.getAttribute('aria-label')).toBe('Loading management data')
        expect(text()).toContain('...')
    })

    it('renders the counts once loaded', async () => {
        await mountPage()
        expect(text()).toContain('3 Types')
        expect(text()).toContain('5 Types')
        expect(text()).toContain('7 Active')
        expect(q('[role="alert"]')).toBeNull()
    })

    it('a failed load shows an error card with Retry and no misleading zero counts', async () => {
        h.getManagementCounts.mockRejectedValueOnce(new Error('boom'))
        await mountPage()
        expect(h.toastError).toHaveBeenCalledWith('Failed to load management data')
        const alert = q('[role="alert"]')
        expect(alert?.textContent).toContain('Could not load management data.')
        expect(text()).not.toContain('0 Types')
        expect(text()).toContain('—')
        const retry = Array.from(container!.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry')
        expect(retry).toBeDefined()
        expect(retry!.className).toContain('min-h-[44px]')
    })

    it('Retry refetches and replaces the error card with the loaded counts', async () => {
        h.getManagementCounts.mockRejectedValueOnce(new Error('boom'))
        await mountPage()
        const retry = Array.from(container!.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Retry')!
        await click(retry)
        expect(h.getManagementCounts).toHaveBeenCalledTimes(2)
        expect(q('[role="alert"]')).toBeNull()
        expect(text()).toContain('3 Types')
    })

    it('cards are keyboard operable: Enter navigates to the card route', async () => {
        await mountPage()
        const cards = Array.from(container!.querySelectorAll('[role="button"]'))
        expect(cards).toHaveLength(3)
        expect(cards.every((c) => c.getAttribute('tabindex') === '0')).toBe(true)
        await act(async () => {
            cards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
            await flush()
        })
        expect(q('[data-testid="location-probe"]')?.textContent).toBe('/management/cartons')
    })
})
