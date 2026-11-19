import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import ListCapNotice, { ADMIN_LIST_ROW_CAP } from './ListCapNotice'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLElement | null = null

async function render(props: { rowCount: number; cap?: number }) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(ListCapNotice, { testId: 'cap-notice', ...props }))
    })
    return container
}

afterEach(async () => {
    if (root) {
        await act(async () => root!.unmount())
        root = null
    }
    container?.remove()
    container = null
})

describe('ListCapNotice', () => {
    it('uses the 200-row cap that the admin list functions return', () => {
        expect(ADMIN_LIST_ROW_CAP).toBe(200)
    })

    it('renders nothing when fewer rows than the cap came back', async () => {
        const el = await render({ rowCount: ADMIN_LIST_ROW_CAP - 1 })
        expect(el.querySelector('[data-testid="cap-notice"]')).toBeNull()
        expect(el.textContent).toBe('')
    })

    it('renders nothing for an empty list', async () => {
        const el = await render({ rowCount: 0 })
        expect(el.querySelector('[data-testid="cap-notice"]')).toBeNull()
    })

    it('shows a polite status notice with the real cap when exactly the cap came back', async () => {
        const el = await render({ rowCount: 200 })
        const notice = el.querySelector('[data-testid="cap-notice"]')
        expect(notice).not.toBeNull()
        expect(notice?.getAttribute('role')).toBe('status')
        expect(notice?.textContent).toBe('Showing the first 200 only.')
    })

    it('uses a custom cap when one is passed', async () => {
        const el = await render({ rowCount: 3, cap: 3 })
        expect(el.querySelector('[data-testid="cap-notice"]')?.textContent).toBe('Showing the first 3 only.')
    })
})
