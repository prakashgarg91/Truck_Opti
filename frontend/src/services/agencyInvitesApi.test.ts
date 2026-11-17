import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({
    supabase: {
        // A method that needs `this`, like the real client: a detached call would throw.
        rpc(this: unknown, name: string, args: Record<string, unknown>) {
            if (this === undefined) throw new Error('detached rpc call')
            return h.rpc(name, args)
        },
    },
}))

import { agencyInvitesApi, buildInviteLink, INVITE_FAILURE_MESSAGES } from './agencyInvitesApi'

const TOKEN = 'a'.repeat(64)
const ok = (data: unknown) => ({ data, error: null })
const invalid = { data: { ok: false, error: 'invitation_invalid' }, error: null }

describe('agencyInvitesApi.accept', () => {
    beforeEach(() => h.rpc.mockReset())

    it('accepts a staff invitation with one call and returns the scope', async () => {
        h.rpc.mockResolvedValueOnce(ok({ ok: true, state: 'accepted', membership: { scope: 'finance' } }))
        const r = await agencyInvitesApi.accept(`  ${TOKEN} `)
        expect(r).toEqual({ status: 'accepted', kind: 'member', replay: false, alreadyJoined: false, scope: 'finance' })
        expect(h.rpc).toHaveBeenCalledTimes(1)
        expect(h.rpc).toHaveBeenCalledWith('agency_member_accept', { p_token: TOKEN })
    })

    it('falls through to the driver command only when the staff command says invalid', async () => {
        h.rpc.mockResolvedValueOnce(invalid).mockResolvedValueOnce(ok({ ok: true, state: 'idempotent_replay', employment: {} }))
        const r = await agencyInvitesApi.accept(TOKEN)
        expect(r).toMatchObject({ status: 'accepted', kind: 'driver', replay: true })
        expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(['agency_member_accept', 'agency_driver_invitation_accept'])
    })

    it('maps not_found when both commands say invalid', async () => {
        h.rpc.mockResolvedValueOnce(invalid).mockResolvedValueOnce(invalid)
        expect(await agencyInvitesApi.accept(TOKEN)).toMatchObject({ status: 'failed', code: 'not_found' })
    })

    it('does not call the server for a malformed code', async () => {
        expect(await agencyInvitesApi.accept('bad token!')).toMatchObject({ status: 'failed', code: 'not_found' })
        expect(h.rpc).not.toHaveBeenCalled()
    })

    it.each([
        ['invitation_expired', 'expired'],
        ['invitation_not_pending', 'already_used'],
        ['invitation_revoked', 'revoked'],
        ['invitation_recipient_mismatch', 'wrong_account'],
        ['driver_not_approved', 'driver_not_approved'],
        ['driver_already_employed_elsewhere', 'driver_employed_elsewhere'],
        ['something_new', 'unavailable'],
    ])('maps the typed result %s to %s without trying the driver command', async (error, code) => {
        h.rpc.mockResolvedValueOnce(ok({ ok: false, error }))
        const r = await agencyInvitesApi.accept(TOKEN)
        expect(r).toEqual({ status: 'failed', code, message: INVITE_FAILURE_MESSAGES[code as keyof typeof INVITE_FAILURE_MESSAGES] })
        expect(h.rpc).toHaveBeenCalledTimes(1)
    })

    it.each([
        ['An agency owner cannot accept a membership for its own agency.', 'owner_blocked'],
        ['Agency approval is required.', 'approval_required'],
        ['Sign-in is required.', 'sign_in_required'],
        ['Driver already has an active employment record.', 'driver_employed_elsewhere'],
        ['Driver is not approved for assignment.', 'driver_not_approved'],
        ['permission denied for table secret', 'unavailable'],
    ])('maps the exception "%s" to %s and never leaks unknown text', async (message, code) => {
        h.rpc.mockResolvedValueOnce({ data: null, error: { message } })
        const r = await agencyInvitesApi.accept(TOKEN)
        expect(r).toMatchObject({ status: 'failed', code })
        expect(JSON.stringify(r)).not.toContain('secret')
    })

    it('a driver account without a profile reaches the driver command and gets a driver hint', async () => {
        h.rpc.mockResolvedValueOnce(invalid).mockResolvedValueOnce({ data: null, error: { message: 'No driver profile found for this account.' } })
        expect(await agencyInvitesApi.accept(TOKEN)).toMatchObject({ status: 'failed', code: 'driver_profile_required' })
    })

    it('returns the parsed prompt for a plan limit (SB001) and a read-only plan (SB002)', async () => {
        h.rpc.mockResolvedValueOnce({
            data: null,
            error: { code: 'SB001', message: 'SB001: limit', details: JSON.stringify({ code: 'SB001', resource: 'staff', limit: 3, used: 3 }) },
        })
        const limit = await agencyInvitesApi.accept(TOKEN)
        expect(limit).toMatchObject({ status: 'limit', kind: 'member', info: { code: 'SB001', kind: 'limit_reached' } })

        h.rpc.mockResolvedValueOnce(invalid).mockResolvedValueOnce({ data: null, error: { code: 'SB002', message: 'SB002: read only', details: '{"status":"expired"}' } })
        expect(await agencyInvitesApi.accept(TOKEN)).toMatchObject({ status: 'limit', kind: 'driver', info: { code: 'SB002' } })
    })

    it('reports an unexpected thrown error as unavailable', async () => {
        h.rpc.mockRejectedValueOnce(new Error('network'))
        expect(await agencyInvitesApi.accept(TOKEN)).toMatchObject({ status: 'failed', code: 'unavailable' })
    })
})

describe('buildInviteLink', () => {
    it('points to /invite/<token>', () => {
        expect(buildInviteLink(TOKEN, 'https://app.example.com')).toBe(`https://app.example.com/invite/${TOKEN}`)
    })
})
