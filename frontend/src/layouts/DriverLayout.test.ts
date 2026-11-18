import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The phone header must carry a reachable Sign out: the desktop sidebar is
// hidden below md, so without it phone users cannot log out.

const h = vi.hoisted(() => ({
    signOut: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../lib/supabase', () => ({ supabase: { auth: { signOut: h.signOut } } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => ({ user: { name: 'Ravi', email: 'ravi@example.com' } }) }))
vi.mock('../components/OfflineBanner', () => ({ default: () => null }))

import DriverLayout from './DriverLayout'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

async function mount(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(
            createElement(
                MemoryRouter,
                { initialEntries: ['/driver/dashboard'] },
                createElement(
                    Routes,
                    null,
                    createElement(Route, { path: '/driver', element: createElement(DriverLayout) }, createElement(Route, { path: 'dashboard', element: createElement('div', null, 'HOME') })),
                    createElement(Route, { path: '/login', element: createElement('div', { 'data-testid': 'login' }, 'LOGIN') })
                )
            )
        )
    })
    return container
}

afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = null
    container?.remove()
    container = null
})

describe('DriverLayout sign out', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.signOut.mockResolvedValue({ error: null })
    })

    it('has a Sign out button in the mobile header with a 44px target', async () => {
        const view = await mount()
        const header = view.querySelector('header') as HTMLElement
        expect(header).not.toBeNull()
        const button = header.querySelector('button[aria-label="Sign out"]') as HTMLButtonElement
        expect(button).not.toBeNull()
        expect(button.className).toContain('min-h-[44px]')
        expect(button.textContent).toContain('Sign out')
    })

    it('signs out and goes to the login page without a confirm step', async () => {
        const view = await mount()
        const button = view.querySelector('header button[aria-label="Sign out"]') as HTMLButtonElement
        await act(async () => {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(h.signOut).toHaveBeenCalledTimes(1)
        expect(view.querySelector('[data-testid="login"]')).not.toBeNull()
        expect(h.toastSuccess).toHaveBeenCalledWith('Signed out')
    })

    it('stays signed in and tells the driver when sign out fails', async () => {
        h.signOut.mockRejectedValue(new Error('offline'))
        const view = await mount()
        const button = view.querySelector('header button[aria-label="Sign out"]') as HTMLButtonElement
        await act(async () => {
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(h.toastError).toHaveBeenCalled()
        expect(view.querySelector('[data-testid="login"]')).toBeNull()
    })
})
