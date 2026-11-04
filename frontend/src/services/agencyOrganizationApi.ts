import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import type { Json } from '../types/database.types'

/**
 * Agency organization commands (TO-144-D2): staff memberships and invitations,
 * client agreements with bill-to/ship-to sites and contacts, tariff versions
 * and driver invitations. All writes go through the SECURITY DEFINER command
 * RPCs of 20261011000000_agency_members_clients_tariffs.sql; the server is the
 * authority (ownership, versions, idempotency). Reads select explicit columns:
 * authenticated has no grant on token_hash, so `select=*` would fail.
 *
 * Result contract: a business refusal ({ok:false,error}) is a typed RESULT
 * (version_conflict, tariff_overlap, ...), never an exception; controlled
 * database exceptions surface their approved message; anything else collapses
 * to the caller's redacted fallback. The raw invitation `token` exists only on
 * the 'created' result and is never stored here: the page shows it once.
 */

export type MembershipScope = 'dispatcher' | 'fleet_manager' | 'finance' | 'viewer'
export type RateBasis = 'per_trip' | 'per_tonne' | 'per_km'
export type SiteKind = 'bill_to' | 'ship_to'

export interface MembershipRow {
    id: string
    agency_id: string
    user_id: string
    scope: MembershipScope
    status: string
    granted_at: string
    revoked_at: string | null
    invitation_id: string | null
    version: number
}

export interface InvitationRow {
    id: string
    invited_email: string
    scope: MembershipScope
    status: string
    expires_at: string
    created_at: string
    revoked_at: string | null
    accepted_at: string | null
    version: number
}

export interface DriverInvitationRow {
    id: string
    invited_phone: string
    status: string
    expires_at: string
    created_at: string
    revoked_at: string | null
    accepted_at: string | null
    employment_id: string | null
    version: number
}

export interface AgreementRow {
    id: string
    client_name: string
    client_gstin: string | null
    payment_terms_days: number | null
    status: string
    version: number
    created_at: string
    updated_at: string
}

export interface SiteRow {
    id: string
    agreement_id: string
    site_kind: SiteKind
    label: string
    address_line: string
    city: string
    state: string
    pincode: string
    status: string
    version: number
}

export interface ContactRow {
    id: string
    agreement_id: string
    site_id: string | null
    full_name: string
    phone: string
    email: string | null
    status: string
    version: number
}

export interface TariffRow {
    id: string
    agreement_id: string
    origin_label: string
    destination_label: string
    vehicle_type: string | null
    rate_basis: RateBasis
    rate_amount: number
    currency: string
    effective_from: string
    effective_to: string | null
    version_no: number
    supersedes_version_id: string | null
    created_at: string
}

export type CommandErrorCode =
    | 'version_conflict'
    | 'idempotency_key_reused'
    | 'invitation_already_pending'
    | 'invitation_expired'
    | 'invitation_invalid'
    | 'invitation_not_pending'
    | 'invitation_recipient_mismatch'
    | 'invitation_revoked'
    | 'membership_not_active'
    | 'active_bill_to_exists'
    | 'agreement_not_active'
    | 'tariff_overlap'
    | 'driver_not_approved'
    | 'driver_already_employed_elsewhere'
    | 'unknown'

export type CommandResult<T extends Record<string, unknown> = Record<string, never>> =
    | ({ ok: true; state: string; token?: string } & T)
    | { ok: false; error: CommandErrorCode; message: string; currentVersion?: number }

const COMMAND_ERROR_MESSAGES: Readonly<Record<Exclude<CommandErrorCode, 'unknown'>, string>> = Object.freeze({
    version_conflict: 'This record changed. Reload to continue.',
    idempotency_key_reused: 'This request was already used for different details. Start again.',
    invitation_already_pending: 'An invitation is already pending for this person. Revoke it to send a new one.',
    invitation_expired: 'This invitation has expired.',
    invitation_invalid: 'This invitation code is not valid.',
    invitation_not_pending: 'This invitation is no longer pending.',
    invitation_recipient_mismatch: 'This invitation was sent to someone else.',
    invitation_revoked: 'This invitation was revoked.',
    membership_not_active: 'This team member no longer has access.',
    active_bill_to_exists: 'Only one active bill-to site is allowed per client. Deactivate the current one first.',
    agreement_not_active: 'This client agreement is inactive. Reactivate it to make changes.',
    tariff_overlap: 'A rate already exists for these dates. Revise the current version instead.',
    driver_not_approved: 'This driver is not approved yet.',
    driver_already_employed_elsewhere: 'This driver is already working for another agency.',
})

/** Controlled RAISE EXCEPTION texts from the migration; anything else is redacted. */
const CONTROLLED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'Agency approval is required.',
    'Your access scope does not allow this action.',
    'No agency profile found for this account.',
    'Multiple agency profiles found for this account.',
    'Sign-in is required.',
    'Idempotency key is required.',
    'Site label, address, city and state are required.',
    'Client agreement not found or access denied.',
    'Unknown membership scope.',
    'Pincode must be six digits.',
    'Payment terms must be between 0 and 365 days.',
    'Membership not found or access denied.',
    'Invitation expiry must be between 1 and 30 days.',
    'GSTIN format is invalid.',
    'Contact phone is invalid.',
    'Contact name is required.',
    'Contact email is invalid.',
    'Client name is required.',
    'Unknown vehicle type.',
    'Unknown site status.',
    'Unknown site kind.',
    'Unknown rate basis.',
    'Unknown contact status.',
    'Unknown agreement status.',
    'Tariff versions are immutable; publish a superseding version instead.',
    'Site not found for this agreement.',
    'Rate amount must have at most two decimal places.',
    'Rate amount must be greater than zero.',
    'No driver profile found for this account.',
    'Multiple driver profiles found for this account.',
    'Lane origin and destination are required.',
    'Invited email is invalid.',
    'Invitation not found or access denied.',
    'Effective start is required.',
    'Effective end must be after effective start.',
    'Driver phone is invalid.',
    'Driver invitation not found or access denied.',
    'Client site not found or access denied.',
    'Client contact not found or access denied.',
    'An agency owner cannot be invited to its own agency.',
])

const DEFAULT_EXPIRY_DAYS = 7

interface Envelope {
    ok?: unknown
    state?: unknown
    error?: unknown
    current_version?: unknown
    token?: unknown
    [key: string]: unknown
}

async function runCommand<T extends Record<string, unknown>>(
    rpcName: string,
    args: Record<string, unknown>,
    fallback: string,
    pick: (envelope: Envelope) => T
): Promise<CommandResult<T>> {
    // The generated rpc() overloads are per function name; this generic runner
    // forwards the already-typed args built by each public method below.
    // Call as a method: the client's rpc() relies on `this`; a detached call crashes.
    const client = supabase as unknown as {
        rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: unknown } | null }>
    }
    const { data, error } = await client.rpc(rpcName, args)

    if (error) {
        const message = error.message
        throw new UserFacingError(typeof message === 'string' && CONTROLLED_EXCEPTIONS.has(message) ? message : fallback)
    }

    const envelope = (Array.isArray(data) ? data[0] : data) as Envelope | null | undefined

    if (envelope && envelope.ok === false && typeof envelope.error === 'string') {
        const code = (envelope.error in COMMAND_ERROR_MESSAGES ? envelope.error : 'unknown') as CommandErrorCode
        return {
            ok: false,
            error: code,
            message: code === 'unknown' ? fallback : COMMAND_ERROR_MESSAGES[code as Exclude<CommandErrorCode, 'unknown'>],
            ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
        }
    }

    if (envelope && envelope.ok === true && typeof envelope.state === 'string') {
        return {
            ok: true,
            state: envelope.state,
            ...(typeof envelope.token === 'string' ? { token: envelope.token } : {}),
            ...pick(envelope),
        } as CommandResult<T>
    }

    throw new UserFacingError(fallback)
}

async function readRows<T>(
    table: string,
    columns: string,
    fallback: string,
    filter?: (query: unknown) => unknown
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => unknown } }
    let query = client.from(table).select(columns)
    if (filter) query = filter(query)
    const { data, error } = (await (query as { order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> }).order(
        'created_at',
        { ascending: false }
    ))
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

const MEMBERSHIP_COLUMNS = 'id,agency_id,user_id,scope,status,granted_at,revoked_at,invitation_id,version,created_at'
const INVITATION_COLUMNS = 'id,invited_email,scope,status,expires_at,created_at,revoked_at,accepted_at,version'
const DRIVER_INVITATION_COLUMNS = 'id,invited_phone,status,expires_at,created_at,revoked_at,accepted_at,employment_id,version'
const AGREEMENT_COLUMNS = 'id,client_name,client_gstin,payment_terms_days,status,version,created_at,updated_at'
const SITE_COLUMNS = 'id,agreement_id,site_kind,label,address_line,city,state,pincode,status,version,created_at'
const CONTACT_COLUMNS = 'id,agreement_id,site_id,full_name,phone,email,status,version,created_at'
const TARIFF_COLUMNS =
    'id,agreement_id,origin_label,destination_label,vehicle_type,rate_basis,rate_amount,currency,effective_from,effective_to,version_no,supersedes_version_id,created_at'

const pickInvitation = (e: Envelope) => ({ invitation: e.invitation as InvitationRow | undefined })
const pickMembership = (e: Envelope) => ({ membership: e.membership as MembershipRow | undefined })

export const agencyTeamApi = {
    listMembers: () => readRows<MembershipRow>('agency_memberships', MEMBERSHIP_COLUMNS, 'Failed to load team members'),
    listInvitations: () => readRows<InvitationRow>('agency_invitations', INVITATION_COLUMNS, 'Failed to load invitations'),

    invite(input: { email: string; scope: MembershipScope; expiresInDays?: number; idempotencyKey: string }) {
        return runCommand(
            'agency_member_invite',
            {
                p_invited_email: input.email,
                p_scope: input.scope,
                p_expires_in_days: input.expiresInDays ?? DEFAULT_EXPIRY_DAYS,
                p_idempotency_key: input.idempotencyKey,
            },
            'Failed to create invitation',
            pickInvitation
        )
    },

    revokeInvitation(invitationId: string, expectedVersion: number) {
        return runCommand(
            'agency_member_invitation_revoke',
            { p_invitation_id: invitationId, p_expected_version: expectedVersion },
            'Failed to revoke invitation',
            pickInvitation
        )
    },

    revokeMember(membershipId: string, expectedVersion: number) {
        return runCommand(
            'agency_member_revoke',
            { p_membership_id: membershipId, p_expected_version: expectedVersion },
            'Failed to revoke access',
            pickMembership
        )
    },

    changeScope(membershipId: string, scope: MembershipScope, expectedVersion: number) {
        return runCommand(
            'agency_member_change_scope',
            { p_membership_id: membershipId, p_scope: scope, p_expected_version: expectedVersion },
            'Failed to change access scope',
            pickMembership
        )
    },
}

export const agencyClientsApi = {
    listAgreements: () => readRows<AgreementRow>('agency_client_agreements', AGREEMENT_COLUMNS, 'Failed to load client agreements'),

    listSites: (agreementId: string) =>
        readRows<SiteRow>('agency_client_sites', SITE_COLUMNS, 'Failed to load client sites', (q) =>
            (q as { eq: (c: string, v: string) => unknown }).eq('agreement_id', agreementId)
        ),

    listContacts: (agreementId: string) =>
        readRows<ContactRow>('agency_client_contacts', CONTACT_COLUMNS, 'Failed to load client contacts', (q) =>
            (q as { eq: (c: string, v: string) => unknown }).eq('agreement_id', agreementId)
        ),

    createAgreement(input: { clientName: string; clientGstin?: string | null; paymentTermsDays?: number | null; idempotencyKey: string }) {
        const gstin = input.clientGstin?.trim()
        return runCommand(
            'agency_client_agreement_create',
            {
                p_client_name: input.clientName.trim(),
                ...(gstin ? { p_client_gstin: gstin } : {}),
                ...(input.paymentTermsDays != null ? { p_payment_terms_days: input.paymentTermsDays } : {}),
                p_idempotency_key: input.idempotencyKey,
            },
            'Failed to save client agreement',
            (e) => ({ agreement: e.agreement as AgreementRow | undefined })
        )
    },

    updateAgreement(agreementId: string, expectedVersion: number, patch: Record<string, Json>) {
        return runCommand(
            'agency_client_agreement_update',
            { p_agreement_id: agreementId, p_expected_version: expectedVersion, p_patch: patch },
            'Failed to save client agreement',
            (e) => ({ agreement: e.agreement as AgreementRow | undefined })
        )
    },

    createSite(input: {
        agreementId: string
        siteKind: SiteKind
        label: string
        addressLine: string
        city: string
        state: string
        pincode: string
        idempotencyKey: string
    }) {
        return runCommand(
            'agency_client_site_create',
            {
                p_agreement_id: input.agreementId,
                p_site_kind: input.siteKind,
                p_label: input.label,
                p_address_line: input.addressLine,
                p_city: input.city,
                p_state: input.state,
                p_pincode: input.pincode,
                p_idempotency_key: input.idempotencyKey,
            },
            'Failed to save client site',
            (e) => ({ site: e.site as SiteRow | undefined })
        )
    },

    updateSite(siteId: string, expectedVersion: number, patch: Record<string, Json>) {
        return runCommand(
            'agency_client_site_update',
            { p_site_id: siteId, p_expected_version: expectedVersion, p_patch: patch },
            'Failed to save client site',
            (e) => ({ site: e.site as SiteRow | undefined })
        )
    },

    createContact(input: {
        agreementId: string
        fullName: string
        phone: string
        email?: string | null
        siteId?: string | null
        idempotencyKey: string
    }) {
        return runCommand(
            'agency_client_contact_create',
            {
                p_agreement_id: input.agreementId,
                p_full_name: input.fullName,
                p_phone: input.phone,
                ...(input.email ? { p_email: input.email } : {}),
                ...(input.siteId ? { p_site_id: input.siteId } : {}),
                p_idempotency_key: input.idempotencyKey,
            },
            'Failed to save client contact',
            (e) => ({ contact: e.contact as ContactRow | undefined })
        )
    },

    updateContact(contactId: string, expectedVersion: number, patch: Record<string, Json>) {
        return runCommand(
            'agency_client_contact_update',
            { p_contact_id: contactId, p_expected_version: expectedVersion, p_patch: patch },
            'Failed to save client contact',
            (e) => ({ contact: e.contact as ContactRow | undefined })
        )
    },
}

export const agencyTariffApi = {
    list: (agreementId: string) =>
        readRows<TariffRow>('agency_tariff_versions', TARIFF_COLUMNS, 'Failed to load rates', (q) =>
            (q as { eq: (c: string, v: string) => unknown }).eq('agreement_id', agreementId)
        ),

    publish(input: {
        agreementId: string
        origin: string
        destination: string
        vehicleType: string | null
        rateBasis: RateBasis
        rateAmount: number
        effectiveFrom: string
        effectiveTo: string | null
        supersedesVersionId?: string | null
        idempotencyKey: string
    }) {
        // Fail fast with the server's own wording; the database remains the authority.
        if (Math.round(input.rateAmount * 100) / 100 !== input.rateAmount) {
            return Promise.reject(new UserFacingError('Rate amount must have at most two decimal places.'))
        }
        return runCommand(
            'agency_tariff_version_publish',
            {
                p_agreement_id: input.agreementId,
                p_origin: input.origin,
                p_destination: input.destination,
                ...(input.vehicleType ? { p_vehicle_type: input.vehicleType } : {}),
                p_rate_basis: input.rateBasis,
                p_rate_amount: input.rateAmount,
                p_effective_from: input.effectiveFrom,
                ...(input.effectiveTo ? { p_effective_to: input.effectiveTo } : {}),
                ...(input.supersedesVersionId ? { p_supersedes_version_id: input.supersedesVersionId } : {}),
                p_idempotency_key: input.idempotencyKey,
            },
            'Failed to publish rate',
            (e) => ({ tariff: e.tariff as TariffRow | undefined })
        )
    },
}

export const agencyDriverInvitationApi = {
    list: () =>
        readRows<DriverInvitationRow>('agency_driver_invitations', DRIVER_INVITATION_COLUMNS, 'Failed to load driver invitations'),

    create(input: { phone: string; expiresInDays?: number; idempotencyKey: string }) {
        return runCommand(
            'agency_driver_invitation_create',
            {
                p_invited_phone: input.phone,
                p_expires_in_days: input.expiresInDays ?? DEFAULT_EXPIRY_DAYS,
                p_idempotency_key: input.idempotencyKey,
            },
            'Failed to create driver invitation',
            (e) => ({ invitation: e.invitation as DriverInvitationRow | undefined })
        )
    },

    revoke(invitationId: string, expectedVersion: number) {
        return runCommand(
            'agency_driver_invitation_revoke',
            { p_invitation_id: invitationId, p_expected_version: expectedVersion },
            'Failed to revoke driver invitation',
            (e) => ({ invitation: e.invitation as DriverInvitationRow | undefined })
        )
    },
}
