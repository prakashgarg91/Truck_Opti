import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ accept: vi.fn() }))

vi.mock('../services/agencyInvitesApi', () => ({
    agencyInvitesApi: { accept: h.accept },
    INVITE_FAILURE_MESSAGES: { unavailable: 'We could not accept the invitation right now.' },
}))

import AcceptInvitePage from './AcceptInvitePage'

;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const TOKEN = 'a'.repeat(64)
let root: Root
let host: HTMLDivElement
const text = () => host.textContent ?? ''
const q = (s: string) => host.querySelector(s)

async function mount(path = `/invite/${TOKEN}`) {
    await act(async () => {
        root.render(
            createElement(
                MemoryRouter,
                { initialEntries: [path] },
                createElement(Routes, null, createElement(Route, { path: '/invite/:token', element: createElement(AcceptInvitePage) }))
            )
        )
    })
    await act(async () => {})
}

describe('AcceptInvitePage', () => {
    beforeEach(() => {
        h.accept.mockReset()
        host = document.createElement('div')
        document.body.appendChild(host)
        root = createRoot(host)
    })
    afterEach(() => {
        act(() => root.unmount())
        host.remove()
    })

    it('shows a loading state, then accepts once with the token from the URL', async () => {
        let release: (v: unknown) => void = () => {}
        h.accept.mockReturnValue(new Promise((r) => (release = r)))
        await mount()
        expect(q('[data-testid="invite-loading"]')).not.toBeNull()
        await act(async () => release({ status: 'accepted', kind: 'member', replay: false, alreadyJoined: false, scope: 'finance' }))
        expect(h.accept).toHaveBeenCalledTimes(1)
        expect(h.accept).toHaveBeenCalledWith(TOKEN)
        expect(q('[data-testid="invite-accepted"]')).not.toBeNull()
        expect(text()).toContain('You have joined the agency')
        expect(text()).toContain('Finance')
        expect((q('a') as HTMLAnchorElement).getAttribute('href')).toBe('/agency/dashboard')
    })

    it('sends an accepted driver to the driver dashboard', async () => {
        h.accept.mockResolvedValue({ status: 'accepted', kind: 'driver', replay: true, alreadyJoined: false, scope: null })
        await mount()
        expect(text()).toContain('already part of this agency')
        expect((q('a') as HTMLAnchorElement).getAttribute('href')).toBe('/driver/dashboard')
    })

    it('shows a calm failure with a next step', async () => {
        h.accept.mockResolvedValue({ status: 'failed', code: 'expired', message: 'This invitation has expired.' })
        await mount()
        expect(q('[data-testid="invite-failed"]')?.getAttribute('data-code')).toBe('expired')
        expect(text()).toContain('Invitation expired')
        expect(text()).toContain('This invitation has expired.')
        expect(q('[role="alert"]')).not.toBeNull()
        expect((q('a') as HTMLAnchorElement).getAttribute('href')).toBe('/')
    })

    it('points a driver-profile failure to driver registration', async () => {
        h.accept.mockResolvedValue({ status: 'failed', code: 'driver_profile_required', message: 'Register first.' })
        await mount()
        expect((q('a') as HTMLAnchorElement).getAttribute('href')).toBe('/driver/register')
    })

    it('shows the plan-limit state for SB001 and retries only on click', async () => {
        h.accept.mockResolvedValue({ status: 'limit', kind: 'member', info: { code: 'SB001', kind: 'limit_reached' } })
        await mount()
        expect(q('[data-testid="invite-limit"]')).not.toBeNull()
        expect(text()).toContain('reached the limit of its plan')
        expect(h.accept).toHaveBeenCalledTimes(1)
        await act(async () => {
            ;(q('button') as HTMLButtonElement).click()
        })
        expect(h.accept).toHaveBeenCalledTimes(2)
    })

    it('offers Try again for a temporary failure', async () => {
        h.accept.mockResolvedValueOnce({ status: 'failed', code: 'unavailable', message: 'We could not accept the invitation right now.' })
        h.accept.mockResolvedValueOnce({ status: 'accepted', kind: 'member', replay: false, alreadyJoined: false, scope: null })
        await mount()
        await act(async () => {
            ;(q('button') as HTMLButtonElement).click()
        })
        expect(q('[data-testid="invite-accepted"]')).not.toBeNull()
    })
})
