import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-144-D2 driver invitations (Stitch Roster edit eac990fe): phone-bound,
// show-once code, named revoke confirm, single-refetch version conflict.

const h = vi.hoisted(() => ({
    list: vi.fn(),
    create: vi.fn(),
    revoke: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))
vi.mock('../services/agencyOrganizationApi', () => ({
    agencyDriverInvitationApi: { list: h.list, create: h.create, revoke: h.revoke },
}))

import DriverInvitationsPanel from './DriverInvitationsPanel'
import { UserFacingError } from '../utils/userFacingError'

const FUTURE = new Date(Date.now() + 4 * 86400000).toISOString()
const PENDING = {
    id: 'di-1',
    invited_phone: '+919876543210',
    status: 'pending',
    expires_at: FUTURE,
    created_at: '2026-11-01T00:00:00Z',
    revoked_at: null,
    accepted_at: null,
    employment_id: null,
    version: 1,
}
const ACCEPTED = { ...PENDING, id: 'di-2', invited_phone: '+919000000001', status: 'accepted', accepted_at: '2026-11-02T00:00:00Z', version: 2 }

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPanel(): Promise<void> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(DriverInvitationsPanel))
        await new Promise((r) => setTimeout(r, 0))
    })
}

afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = null
    container?.remove()
    container = null
})

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp, within: ParentNode = container as HTMLElement) =>
    Array.from(within.querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(b: HTMLButtonElement) {
    await act(async () => {
        b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}
async function type(input: HTMLInputElement, value: string) {
    await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true }))
    })
}

describe('DriverInvitationsPanel', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.list.mockResolvedValue([PENDING, ACCEPTED])
    })

    it('loading renders a busy status region', async () => {
        h.list.mockReturnValue(new Promise(() => {}))
        await mountPanel()
        expect(q('[data-testid="driver-invites-loading"]')?.getAttribute('aria-busy')).toBe('true')
    })

    it('lists invitations with phone, status text and expiry', async () => {
        await mountPanel()
        const t = q('[data-testid="driver-invites"]')?.textContent || ''
        expect(t).toContain('+91 98765 43210')
        expect(t).toContain('Pending')
        expect(t).toContain('Accepted')
        expect(t).toMatch(/Expires in [34] days/)
        // only pending rows can be revoked
        expect(buttons(/^Revoke/)).toHaveLength(1)
    })

    it('empty state explains the flow', async () => {
        h.list.mockResolvedValue([])
        await mountPanel()
        expect(text()).toContain('No driver invitations yet')
    })

    it('error state offers Retry', async () => {
        h.list.mockRejectedValueOnce(new UserFacingError('Failed to load driver invitations'))
        await mountPanel()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load driver invitations')
        await click(buttons(/Retry/)[0])
        expect(h.list).toHaveBeenCalledTimes(2)
    })

    it('rejects a malformed phone before calling the server', async () => {
        await mountPanel()
        await click(buttons(/Invite driver/)[0])
        await type(q('input[name="driver-phone"]') as HTMLInputElement, '12345')
        await click(buttons(/Create invitation/)[0])
        expect(h.create).not.toHaveBeenCalled()
        expect(q('#driver-phone-error')?.textContent).toContain('Driver phone is invalid.')
        expect(q('input[name="driver-phone"]')?.getAttribute('aria-invalid')).toBe('true')
    })

    it('normalises a 10-digit Indian mobile to +91, shows the code once and never lists it', async () => {
        h.create.mockResolvedValue({ ok: true, state: 'created', token: 'DRV-CODE-9X8Y', invitation: { ...PENDING, id: 'di-3' } })
        await mountPanel()
        await click(buttons(/Invite driver/)[0])
        await type(q('input[name="driver-phone"]') as HTMLInputElement, '98765 43211')
        await click(buttons(/Create invitation/)[0])

        const arg = h.create.mock.calls[0][0]
        expect(arg.phone).toBe('+919876543211')
        expect(arg.idempotencyKey.length).toBeGreaterThan(8)
        expect(q('[data-testid="driver-invite-code"]')?.textContent).toContain('DRV-CODE-9X8Y')
        expect(text()).toContain('shown only once')

        await click(buttons(/I have shared it/)[0])
        expect(text()).not.toContain('DRV-CODE-9X8Y')
    })

    it('revoke names the number and sends the expected version; a conflict shows one message and one refetch', async () => {
        h.revoke.mockResolvedValue({ ok: false, error: 'version_conflict', currentVersion: 4, message: 'This record changed. Reload to continue.' })
        await mountPanel()
        const before = h.list.mock.calls.length
        await click(buttons(/^Revoke/)[0])
        const dialog = q('[role="dialog"]') as HTMLElement
        expect(dialog.textContent).toContain('+91 98765 43210')
        expect(h.revoke).not.toHaveBeenCalled()
        await click(buttons(/Revoke invitation/, dialog)[0])

        expect(h.revoke).toHaveBeenCalledWith('di-1', 1)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('This record changed. Reload to continue.')
        expect(h.list.mock.calls.length).toBe(before + 1)
    })
})
