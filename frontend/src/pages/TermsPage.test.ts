import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import TermsPage from './TermsPage'

// Owner ruling (docs/FABLE-RULINGS-2026-11-18-C.md §3, B): refunds are pro rata
// for the unused part, only on the first purchase within 7 days, renewals are
// not refundable, and a refund ends the subscription.
let container: HTMLElement | null = null
let root: Root | null = null

afterEach(() => {
    act(() => root?.unmount())
    container?.remove()
    container = null
    root = null
})

describe('TermsPage refund rule', () => {
    it('states the approved refund rule and no discretionary refund wording', async () => {
        container = document.createElement('div')
        document.body.appendChild(container)
        await act(async () => {
            root = createRoot(container as HTMLElement)
            root.render(createElement(MemoryRouter, null, createElement(TermsPage)))
        })
        const text = container.textContent || ''
        expect(text).toContain('within 7 days of your first purchase')
        expect(text).toContain('pro rata')
        expect(text).toContain('Renewals are not refundable')
        expect(text).toContain('A refund ends the subscription')
        expect(text).not.toContain('at our discretion')
    })
})
