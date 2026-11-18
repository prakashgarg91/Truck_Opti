import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import ContactPage from './ContactPage'

// Owner decision: support is EMAIL ONLY. The Contact page must render no tel:
// link and no support phone digits (see config/support.test.ts for the
// repository-wide guard).
let container: HTMLElement | null = null
let root: Root | null = null

async function mount(variant: 'public' | 'authenticated') {
    container = document.createElement('div')
    document.body.appendChild(container)
    await act(async () => {
        root = createRoot(container as HTMLElement)
        root.render(createElement(MemoryRouter, null, createElement(ContactPage, { variant })))
    })
    return container
}

afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    container = null
    root = null
})

describe('ContactPage support contact', () => {
    for (const variant of ['public', 'authenticated'] as const) {
        it(`(${variant}) shows the support email and no phone number or tel: link`, async () => {
            const view = await mount(variant)

            expect(view.querySelector('a[href^="tel:"]')).toBeNull()
            expect(view.querySelector('a[href="mailto:prakashgarg91@gmail.com"]')).not.toBeNull()
            const text = view.textContent || ''
            expect(text).not.toContain('99993')
            expect(text).not.toContain('9999352050')
            expect(text).not.toMatch(/\+91\s?99993/)
            expect(text).not.toMatch(/\bor call\b/i)
        })
    }
})
