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
    failLoad: false,
}))

vi.mock('../services/localApi', () => ({
    trucksLocalApi: {
        getAll: vi.fn(async () => {
            if (h.failLoad) throw new Error('load failed')
            return h.trucks
        }),
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
import { trucksLocalApi } from '../services/localApi'

const accessibleName = (el: Element) =>
    el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent?.trim() || ''

describe('TrucksPage accessibility', () => {
    let container: HTMLDivElement
    let root: Root

    beforeEach(() => {
        ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
        vi.clearAllMocks()
        h.failLoad = false
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
        expect(document.title).toBe('Vehicle types - TruckOpti')
    })

    async function renderPage() {
        await act(async () => {
            root.render(
                createElement(
                    QueryClientProvider,
                    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
                    createElement(MemoryRouter, null, createElement(TrucksPage)),
                ),
            )
        })
        for (let i = 0; i < 10 && !container.querySelector('button[aria-label="Edit Tata Ace 7.5ft"]') && !container.querySelector('[role="alert"]'); i++) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0))
            })
        }
    }

    const buttonByText = (label: string) =>
        Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label) as HTMLElement

    it('delete opens an in-app confirm dialog (never window.confirm) and Cancel keeps the truck', async () => {
        const nativeConfirm = vi.spyOn(window, 'confirm')
        await renderPage()
        await act(async () => {
            ;(container.querySelector('button[aria-label="Delete Tata Ace 7.5ft"]') as HTMLElement).click()
        })
        expect(nativeConfirm).not.toHaveBeenCalled()
        const dialog = container.querySelector('[role="alertdialog"]')
        expect(dialog).not.toBeNull()
        expect(dialog?.textContent).toContain('Tata Ace 7.5ft')
        await act(async () => {
            buttonByText('Cancel').click()
        })
        expect(container.querySelector('[role="alertdialog"]')).toBeNull()
        expect(trucksLocalApi.delete).not.toHaveBeenCalled()
        nativeConfirm.mockRestore()
    })

    it('confirming the dialog deletes the selected truck', async () => {
        await renderPage()
        await act(async () => {
            ;(container.querySelector('button[aria-label="Delete Tata Ace 7.5ft"]') as HTMLElement).click()
        })
        await act(async () => {
            buttonByText('Delete').click()
        })
        for (let i = 0; i < 10 && !vi.mocked(trucksLocalApi.delete).mock.calls.length; i++) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0))
            })
        }
        expect(trucksLocalApi.delete).toHaveBeenCalledTimes(1)
        expect(vi.mocked(trucksLocalApi.delete).mock.calls[0][0]).toBe('truck-1')
        expect(container.querySelector('[role="alertdialog"]')).toBeNull()
    })

    it('a failed load shows an inline alert with Retry, and Retry refetches the fleet', async () => {
        h.failLoad = true
        await renderPage()
        const alert = container.querySelector('[role="alert"]')
        expect(alert?.textContent).toContain('Could not load truck types.')
        expect(container.textContent).not.toContain('No trucks found')
        expect(buttonByText('Retry').className).toContain('min-h-[44px]')

        h.failLoad = false
        await act(async () => {
            buttonByText('Retry').click()
        })
        for (let i = 0; i < 10 && !container.querySelector('button[aria-label="Edit Tata Ace 7.5ft"]'); i++) {
            await act(async () => {
                await new Promise((resolve) => setTimeout(resolve, 0))
            })
        }
        expect(container.querySelector('[role="alert"]')).toBeNull()
        expect(container.querySelector('button[aria-label="Edit Tata Ace 7.5ft"]')).not.toBeNull()
    })

    it('the add/edit dialog is a labelled modal and its icon buttons meet the 44px target', async () => {
        await renderPage()
        const dialog = container.querySelector('[role="dialog"]')
        expect(dialog).toBeNull()
        await act(async () => {
            ;(container.querySelector('button[aria-label="Add truck type"]') as HTMLElement).click()
        })
        const modal = container.querySelector('[role="dialog"]')
        expect(modal?.getAttribute('aria-labelledby')).toBe('truck-dialog-title')
        expect(modal?.querySelector('#truck-dialog-title')?.textContent).toBe('Add New Truck')
        expect(buttonByText('Cancel').className).toContain('min-h-[44px]')
        expect(buttonByText('Save Truck').className).toContain('min-h-[44px]')
        expect(container.querySelector('button[aria-label="Close truck dialog"]')?.className).toContain('min-h-[44px]')
    })
})
