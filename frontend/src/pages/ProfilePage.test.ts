import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ProfilePage accessibility pins (2026-11-18): the avatar change control and
// the hidden photo file input carry accessible names, so the icon-only camera
// badge is announced by screen readers.

const h = vi.hoisted(() => ({
    user: null as Record<string, unknown> | null,
}))

vi.mock('react-hot-toast', () => ({ default: { error: vi.fn(), success: vi.fn() } }))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), log: vi.fn() } }))
vi.mock('../lib/supabase', () => ({ supabase: { storage: { from: vi.fn() }, auth: { updateUser: vi.fn() } } }))
vi.mock('../stores/authStore', () => ({
    useAuthStore: () => ({ user: h.user, logout: vi.fn(async () => {}), updateUser: vi.fn() }),
}))

import ProfilePage from './ProfilePage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

describe('ProfilePage accessibility', () => {
    beforeEach(() => {
        h.user = {
            id: 'user-1',
            name: 'Asha Rao',
            email: 'asha@example.com',
            role: 'user',
            user_metadata: {},
        }
    })

    it('names the icon-only avatar camera control and the photo file input', async () => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
        await act(async () => {
            root!.render(createElement(MemoryRouter, null, createElement(ProfilePage)))
        })

        const camera = container.querySelector('button[aria-label="Change profile photo"]')
        expect(camera).not.toBeNull()
        expect(camera?.querySelector('svg')).not.toBeNull()

        const fileInput = container.querySelector('input[type="file"]')
        expect(fileInput?.getAttribute('aria-label')).toBe('Upload profile photo')
    })

    it('every button on the page has an accessible name', async () => {
        container = document.createElement('div')
        document.body.appendChild(container)
        root = createRoot(container)
        await act(async () => {
            root!.render(createElement(MemoryRouter, null, createElement(ProfilePage)))
        })
        const unnamed = Array.from(container.querySelectorAll('button')).filter((b) => {
            const name = b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent?.trim() || ''
            return name === ''
        })
        expect(unnamed).toHaveLength(0)
    })
})
