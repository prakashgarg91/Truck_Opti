import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Accessibility regression: every icon-only action on the truck types page
// carries a descriptive accessible name (item name included), and the route
// sets its document title.
const h = vi.hoisted(() => ({
    trucks: [] as Array<Record<string, unknown>>,
}))

vi.mock('../services/localApi', () => ({
    trucksLocalApi: {
        getAll: vi.fn(async () => h.trucks),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        seed: vi.fn(),
    },
}))

vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: { id: 'user-1' } }),
}))

import TrucksPage from './TrucksPage'

const accessibleName = (el: Element) =>
    el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || ''

describe('TrucksPage accessibility', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        h.trucks = [{
            id: 'truck-1',
            name: 'Tata Ace 7.5ft',
            length: 2,
            width: 1,
            height: 1,
            capacity: 1000,
            cost_per_km: 12,
            available: 1,
            category: 'Mini',
        }]
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
    })

    afterEach(() => {
        act(() => root.unmount())
        container.remove()
    })

    it('gives every button an accessible name and sets the page title', async () => {
        await act(async () => {
            root.render(
                createElement(
                    QueryClientProvider,
                    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
                    createElement(MemoryRouter, null, createElement(TrucksPage)),
                ),
            )
        })
        for (let i = 0; i < 10 && !container.querySelector('button[aria-label="Edit Tata Ace 7.5ft"]'); i++) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0))
            })
        }

        const buttons = Array.from(container.querySelectorAll('button'))
        const names = buttons.map(accessibleName)

        expect(names).not.toContain('')
        expect(names).toEqual(expect.arrayContaining([
            'Back to management',
            'Add truck type',
            'Edit Tata Ace 7.5ft',
            'Delete Tata Ace 7.5ft',
        ]))
        expect(document.title).toBe('Truck Types - TruckOpti')
    })
})
