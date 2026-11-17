import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    isOwner: vi.fn(),
    startTrial: vi.fn(),
}))

vi.mock('../../services/subscriptionApi', () => {
    class TrialError extends Error {
        code: string | null
        constructor(code: string | null, message: string) {
            super(message)
            this.code = code
        }
    }
    return { agencyOwnerApi: { isOwner: h.isOwner }, entitlementApi: { startTrial: h.startTrial }, TrialError }
})
vi.mock('../../stores/authStore', () => ({
    useAuthStore: (selector: (s: { user: { id: string } }) => unknown) => selector({ user: { id: 'u-1' } }),
}))

import AgencyTrialPanel from './AgencyTrialPanel'
import { TrialError } from '../../services/subscriptionApi'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let container: HTMLElement | null = null
const onStarted = vi.fn()

async function mount() {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    await act(async () => {
        root!.render(
            createElement(
                QueryClientProvider,
                { client },
                createElement(MemoryRouter, null, createElement(AgencyTrialPanel, { onStarted }))
            )
        )
    })
    // Wait for the owner query to settle (the loading placeholder has no text).
    for (let i = 0; i < 40 && !text(); i++) {
        await act(async () => {
            await new Promise((r) => setTimeout(r, 10))
        })
    }
}

const text = () => container?.textContent || ''
const startButton = () =>
    Array.from(container!.querySelectorAll('button')).find((b) => /Start your 14-day free trial/.test(b.textContent || ''))

async function clickStart() {
    await act(async () => {
        startButton()!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = null
    container?.remove()
    container = null
})

describe('AgencyTrialPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.isOwner.mockResolvedValue(true)
    })

    it('offers the 14-day trial to the owner and refetches after it starts', async () => {
        h.startTrial.mockResolvedValue({})
        await mount()
        expect(startButton()).toBeDefined()
        await clickStart()
        expect(h.startTrial).toHaveBeenCalledTimes(1)
        expect(onStarted).toHaveBeenCalledTimes(1)
    })

    it('hides the button for staff and explains why', async () => {
        h.isOwner.mockResolvedValue(false)
        await mount()
        expect(startButton()).toBeUndefined()
        expect(text()).toContain('Only the agency owner can start the free trial')
    })

    it('still offers the trial when the owner check is unknown (the server enforces forbidden_scope)', async () => {
        h.isOwner.mockResolvedValue(null)
        await mount()
        expect(startButton()).toBeDefined()
    })

    it.each([
        ['identity_required', 'Add your GSTIN and phone to the agency profile first'],
        ['trial_already_claimed', 'free trial has already been used'],
        ['forbidden_scope', 'Only the agency owner can start the free trial'],
    ])('shows a typed message for %s and does not refetch', async (code, expected) => {
        h.startTrial.mockRejectedValue(new TrialError(code as never, code))
        await mount()
        await clickStart()
        expect(container!.querySelector('[role="alert"]')?.textContent).toContain(expected)
        expect(onStarted).not.toHaveBeenCalled()
    })

    it('links to the agency profile when identity is missing', async () => {
        h.startTrial.mockRejectedValue(new TrialError('identity_required', 'identity_required'))
        await mount()
        await clickStart()
        expect(container!.querySelector('a[href="/agency/profile"]')).not.toBeNull()
    })

    it('shows a generic calm message for an unknown failure', async () => {
        h.startTrial.mockRejectedValue(new Error('network'))
        await mount()
        await clickStart()
        expect(container!.querySelector('[role="alert"]')?.textContent).toContain('could not start your trial')
    })
})
