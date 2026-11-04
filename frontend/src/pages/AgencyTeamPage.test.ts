import { act } from 'react'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// TO-144-D2 Team & Access (Stitch screen 0691bdff) over agencyTeamApi:
// the five operational states, owner-only denial, the show-once invitation
// code, named confirm dialogs and the single-refetch version conflict.

const h = vi.hoisted(() => ({
    listMembers: vi.fn(),
    listInvitations: vi.fn(),
    invite: vi.fn(),
    revokeInvitation: vi.fn(),
    revokeMember: vi.fn(),
    changeScope: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({ default: { error: h.toastError, success: h.toastSuccess } }))

vi.mock('../services/agencyOrganizationApi', () => ({
    agencyTeamApi: {
        listMembers: h.listMembers,
        listInvitations: h.listInvitations,
        invite: h.invite,
        revokeInvitation: h.revokeInvitation,
        revokeMember: h.revokeMember,
        changeScope: h.changeScope,
    },
}))

import AgencyTeamPage from './AgencyTeamPage'
import { UserFacingError } from '../utils/userFacingError'

const FUTURE = new Date(Date.now() + 5 * 86400000).toISOString()

const MEMBER = {
    id: 'mem-1',
    agency_id: 'a1',
    user_id: 'user-1',
    scope: 'dispatcher',
    status: 'active',
    granted_at: '2026-10-01T00:00:00Z',
    revoked_at: null,
    invitation_id: 'inv-accepted',
    version: 2,
}
const ACCEPTED_INVITATION = {
    id: 'inv-accepted',
    invited_email: 'ravi@example.com',
    scope: 'dispatcher',
    status: 'accepted',
    expires_at: FUTURE,
    created_at: '2026-09-30T00:00:00Z',
    revoked_at: null,
    accepted_at: '2026-10-01T00:00:00Z',
    version: 2,
}
const PENDING = {
    id: 'inv-2',
    invited_email: 'meena@example.com',
    scope: 'finance',
    status: 'pending',
    expires_at: FUTURE,
    created_at: '2026-11-01T00:00:00Z',
    revoked_at: null,
    accepted_at: null,
    version: 1,
}

let root: Root | null = null
let container: HTMLElement | null = null

async function mountPage(): Promise<HTMLElement> {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(MemoryRouter, null, createElement(AgencyTeamPage)))
        await new Promise((r) => setTimeout(r, 0))
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

const q = (sel: string) => (container as HTMLElement).querySelector(sel)
const text = () => (container as HTMLElement).textContent || ''
const buttons = (re: RegExp) =>
    Array.from((container as HTMLElement).querySelectorAll('button')).filter((b) => re.test(b.textContent || ''))

async function click(button: HTMLButtonElement) {
    await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
        await new Promise((r) => setTimeout(r, 0))
    })
}

async function type(input: HTMLInputElement | HTMLSelectElement, value: string) {
    await act(async () => {
        const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
        Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value)
        input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
    })
}

describe('AgencyTeamPage', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.listMembers.mockResolvedValue([MEMBER])
        h.listInvitations.mockResolvedValue([ACCEPTED_INVITATION, PENDING])
    })

    it('loading renders a busy status region', async () => {
        h.listMembers.mockReturnValue(new Promise(() => {}))
        await mountPage()
        const loading = q('[data-testid="team-loading"]')
        expect(loading?.getAttribute('role')).toBe('status')
        expect(loading?.getAttribute('aria-busy')).toBe('true')
    })

    it('shows the pinned owner row, members with email and scope, and pending invitations', async () => {
        await mountPage()
        expect(text()).toContain('Team & Access')
        expect(text()).toContain('Owner')
        const members = q('[data-testid="team-members"]')?.textContent || ''
        expect(members).toContain('ravi@example.com')
        expect(members).toContain('Dispatcher')
        expect(members).toContain('Active')
        const pending = q('[data-testid="team-invitations"]')?.textContent || ''
        expect(pending).toContain('meena@example.com')
        expect(pending).toContain('Finance')
        expect(pending).toContain('Pending')
        // accepted invitations are history, not "pending invitations"
        expect(pending).not.toContain('ravi@example.com')
    })

    it('empty state invites the first member', async () => {
        h.listMembers.mockResolvedValue([])
        h.listInvitations.mockResolvedValue([])
        await mountPage()
        expect(text()).toContain('No team members yet')
    })

    it('error state offers Retry that refetches', async () => {
        h.listMembers.mockRejectedValueOnce(new UserFacingError('Failed to load team members'))
        await mountPage()
        expect(q('[role="alert"]')?.textContent).toContain('Failed to load team members')
        await click(buttons(/Retry/)[0])
        expect(h.listMembers).toHaveBeenCalledTimes(2)
        expect(text()).toContain('ravi@example.com')
    })

    it('denial renders the owner-only message, not a generic error', async () => {
        h.listMembers.mockRejectedValue(new UserFacingError('Agency approval is required.'))
        await mountPage()
        expect(text()).toContain('Only the agency owner can manage team access')
        expect(q('[role="alert"]')).toBeNull()
    })

    it('invite creates once, shows the code once, and never lists it', async () => {
        h.invite.mockResolvedValue({
            ok: true,
            state: 'created',
            token: 'ONE-TIME-CODE-123',
            invitation: { ...PENDING, id: 'inv-3', invited_email: 'new@example.com' },
        })
        await mountPage()
        await click(buttons(/Invite team member/)[0])
        await type(q('input[name="invite-email"]') as HTMLInputElement, 'new@example.com')
        await type(q('select[name="invite-scope"]') as HTMLSelectElement, 'viewer')
        await click(buttons(/Create invitation/)[0])

        expect(h.invite).toHaveBeenCalledTimes(1)
        const arg = h.invite.mock.calls[0][0]
        expect(arg).toMatchObject({ email: 'new@example.com', scope: 'viewer' })
        expect(typeof arg.idempotencyKey).toBe('string')
        expect(arg.idempotencyKey.length).toBeGreaterThan(8)

        const code = q('[data-testid="team-share-code"]')
        expect(code?.textContent).toContain('ONE-TIME-CODE-123')
        expect(text()).toContain('shown only once')

        await click(buttons(/I have shared it/)[0])
        expect(q('[data-testid="team-share-code"]')).toBeNull()
        expect(text()).not.toContain('ONE-TIME-CODE-123')
    })

    it('the owner scope is not offered', async () => {
        await mountPage()
        await click(buttons(/Invite team member/)[0])
        const options = Array.from((q('select[name="invite-scope"]') as HTMLSelectElement).options).map((o) => o.value)
        expect(options).toEqual(['dispatcher', 'fleet_manager', 'finance', 'viewer'])
    })

    it('revoke access names the person in a confirm dialog and sends the expected version', async () => {
        h.revokeMember.mockResolvedValue({ ok: true, state: 'revoked', membership: { ...MEMBER, status: 'revoked' } })
        await mountPage()
        await click(buttons(/Revoke access/)[0])
        const dialog = q('[role="dialog"]')
        expect(dialog?.textContent).toContain('ravi@example.com')
        expect(h.revokeMember).not.toHaveBeenCalled()
        await click(Array.from((dialog as HTMLElement).querySelectorAll('button')).find((b) => /Revoke access/.test(b.textContent || '')) as HTMLButtonElement)
        expect(h.revokeMember).toHaveBeenCalledWith('mem-1', 2)
        expect(h.toastSuccess).toHaveBeenCalled()
    })

    it('a version conflict shows one message and refetches once, with no automatic retry', async () => {
        h.revokeInvitation.mockResolvedValue({
            ok: false,
            error: 'version_conflict',
            currentVersion: 5,
            message: 'This record changed. Reload to continue.',
        })
        await mountPage()
        const before = h.listMembers.mock.calls.length
        await click(buttons(/Revoke invitation/)[0])
        const dialog = q('[role="dialog"]') as HTMLElement
        await click(Array.from(dialog.querySelectorAll('button')).find((b) => /Revoke invitation/.test(b.textContent || '')) as HTMLButtonElement)

        expect(h.revokeInvitation).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledTimes(1)
        expect(h.toastError).toHaveBeenCalledWith('This record changed. Reload to continue.')
        expect(h.listMembers.mock.calls.length).toBe(before + 1)
    })

    it('a pending invitation the server rejects as duplicate surfaces its message', async () => {
        h.invite.mockResolvedValue({
            ok: false,
            error: 'invitation_already_pending',
            message: 'An invitation is already pending for this person. Revoke it to send a new one.',
        })
        await mountPage()
        await click(buttons(/Invite team member/)[0])
        await type(q('input[name="invite-email"]') as HTMLInputElement, 'meena@example.com')
        await click(buttons(/Create invitation/)[0])
        expect(h.toastError).toHaveBeenCalledWith('An invitation is already pending for this person. Revoke it to send a new one.')
        expect(q('[data-testid="team-share-code"]')).toBeNull()
    })
})
