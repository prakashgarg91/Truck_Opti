import { supabase } from '../lib/supabase'
import { parseSubscriptionError, type SubscriptionErrorInfo } from '../lib/billingState'

// Invitation acceptance (staff and driver). The invitation code is one 64-character namespace:
// agency_member_accept and agency_driver_invitation_accept hash it with the same function and look it
// up in their own table, so the kind is not known to the client. Order: staff first; only when the
// staff command answers `invitation_invalid` is the driver command tried. The server decides
// everything (recipient match, expiry, limits); this file only maps typed outcomes to calm copy.

export type InviteKind = 'member' | 'driver'

export type InviteFailureCode =
    | 'not_found'
    | 'expired'
    | 'already_used'
    | 'revoked'
    | 'wrong_account'
    | 'owner_blocked'
    | 'approval_required'
    | 'sign_in_required'
    | 'driver_profile_required'
    | 'driver_not_approved'
    | 'driver_employed_elsewhere'
    | 'driver_profile_conflict'
    | 'unavailable'

export type InviteOutcome =
    | { status: 'accepted'; kind: InviteKind; replay: boolean; alreadyJoined: boolean; scope: string | null }
    | { status: 'limit'; kind: InviteKind; info: SubscriptionErrorInfo }
    | { status: 'failed'; code: InviteFailureCode; message: string }

export const INVITE_FAILURE_MESSAGES: Readonly<Record<InviteFailureCode, string>> = Object.freeze({
    not_found: 'We could not find this invitation. Check the link, or ask the sender for a new one.',
    expired: 'This invitation has expired. Ask the sender to send a new one.',
    already_used: 'This invitation was already used.',
    revoked: 'This invitation was cancelled by the sender. Ask them to send a new one.',
    wrong_account: 'This invitation was sent to a different account. Sign in with the email or phone number it was sent to.',
    owner_blocked: 'You own this agency, so you cannot join its team as a member.',
    approval_required: 'This agency is not active right now. Ask the sender to check their agency approval.',
    sign_in_required: 'Sign in to accept this invitation.',
    driver_profile_required:
        'This code did not match a team invitation. If it is a driver invitation, register as a driver with the invited phone number first, then open the link again.',
    driver_not_approved: 'Your driver profile is not approved yet. You can accept once it is approved.',
    driver_employed_elsewhere: 'You are already working for another agency. Ask that agency to end your employment first.',
    driver_profile_conflict: 'More than one driver profile is linked to this account. Contact support to continue.',
    unavailable: 'We could not accept the invitation right now. Please try again.',
})

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,200}$/

const ENVELOPE_CODES: Readonly<Record<string, InviteFailureCode>> = Object.freeze({
    invitation_invalid: 'not_found',
    invitation_expired: 'expired',
    invitation_not_pending: 'already_used',
    invitation_revoked: 'revoked',
    invitation_recipient_mismatch: 'wrong_account',
    driver_not_approved: 'driver_not_approved',
    driver_already_employed_elsewhere: 'driver_employed_elsewhere',
})

const EXCEPTION_CODES: Readonly<Record<string, InviteFailureCode>> = Object.freeze({
    'An agency owner cannot accept a membership for its own agency.': 'owner_blocked',
    'Agency approval is required.': 'approval_required',
    'Sign-in is required.': 'sign_in_required',
    'No driver profile found for this account.': 'driver_profile_required',
    'Multiple driver profiles found for this account.': 'driver_profile_conflict',
    'Driver already has an active employment record.': 'driver_employed_elsewhere',
    'Driver is not approved for assignment.': 'driver_not_approved',
})

interface RpcResponse {
    data: unknown
    error: { message?: unknown; code?: unknown; details?: unknown } | null
}

type Step = { outcome: InviteOutcome } | { notFound: true }

function fail(code: InviteFailureCode): InviteOutcome {
    return { status: 'failed', code, message: INVITE_FAILURE_MESSAGES[code] }
}

function record(value: unknown): Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

async function callAccept(rpcName: string, kind: InviteKind, token: string): Promise<Step> {
    // Call as a method: the client's rpc() relies on `this`; a detached call crashes.
    const client = supabase as unknown as { rpc: (name: string, params: Record<string, unknown>) => Promise<RpcResponse> }
    const { data, error } = await client.rpc(rpcName, { p_token: token })

    if (error) {
        const info = parseSubscriptionError(error)
        if (info) return { outcome: { status: 'limit', kind, info } }
        const message = typeof error.message === 'string' ? error.message : ''
        const code = EXCEPTION_CODES[message]
        return { outcome: fail(code ?? 'unavailable') }
    }

    const envelope = record(Array.isArray(data) ? data[0] : data)
    if (envelope.ok === true && typeof envelope.state === 'string') {
        const state = envelope.state
        const owner = kind === 'member' ? record(envelope.membership) : record(envelope.employment)
        return {
            outcome: {
                status: 'accepted',
                kind,
                replay: state === 'idempotent_replay',
                alreadyJoined: state === 'already_member' || state === 'already_employed',
                scope: typeof owner.scope === 'string' ? owner.scope : null,
            },
        }
    }
    if (envelope.ok === false && typeof envelope.error === 'string') {
        if (envelope.error === 'invitation_invalid') return { notFound: true }
        return { outcome: fail(ENVELOPE_CODES[envelope.error] ?? 'unavailable') }
    }
    return { outcome: fail('unavailable') }
}

/** The shareable acceptance link for a one-time code (the owner copies this). */
export function buildInviteLink(token: string, origin?: string): string {
    const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
    return `${base}/invite/${encodeURIComponent(token)}`
}

export const agencyInvitesApi = {
    async accept(rawToken: string): Promise<InviteOutcome> {
        const token = rawToken.trim()
        if (!TOKEN_PATTERN.test(token)) return fail('not_found')

        let member: Step
        try {
            member = await callAccept('agency_member_accept', 'member', token)
        } catch {
            return fail('unavailable')
        }
        if (!('notFound' in member)) return member.outcome

        let driver: Step
        try {
            driver = await callAccept('agency_driver_invitation_accept', 'driver', token)
        } catch {
            return fail('unavailable')
        }
        return 'notFound' in driver ? fail('not_found') : driver.outcome
    },
}
