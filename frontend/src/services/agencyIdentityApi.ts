import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

/**
 * Agency identity (legal name, GSTIN, phone, address, state) lives on public.transport_agencies, because
 * the trial claim, subscription place of supply and freight invoices read it from there. This service is
 * the only writer from the UI: the owner-only command agency_identity_update (20261038000000). The
 * result contract is the same as the other agency services: a business refusal is a typed RESULT.
 */

export interface AgencyIdentity {
    agencyId: string
    status: string
    legalName: string
    gstin: string
    phone: string
    address: string
    state: string
    city: string
    pincode: string
    /** Optimistic-concurrency token echoed back on save. Kept as the server's string verbatim. */
    updatedAt: string | null
}

export interface IdentityInput {
    legalName: string
    gstin: string
    phone: string
    address: string
    state: string
    city?: string
    pincode?: string
    expectedUpdatedAt?: string | null
}

export type IdentityErrorCode =
    | 'sign_in_required'
    | 'not_found'
    | 'forbidden_scope'
    | 'agency_not_approved'
    | 'multiple_agencies'
    | 'invalid_name'
    | 'invalid_gstin'
    | 'invalid_phone'
    | 'invalid_state'
    | 'gstin_state_mismatch'
    | 'stale_version'

export const IDENTITY_ERROR_MESSAGES: Readonly<Record<IdentityErrorCode, string>> = Object.freeze({
    sign_in_required: 'Please sign in again to save your company details.',
    not_found: 'No agency was found for this account.',
    forbidden_scope: 'Only the agency owner can change company details.',
    agency_not_approved: 'Company details can be changed once your agency is approved or pending review.',
    multiple_agencies: 'This account has more than one agency. Contact support to fix it.',
    invalid_name: 'Enter the company name (up to 200 characters).',
    invalid_gstin: 'That GSTIN is not valid. It has 15 characters, for example 27ABCDE1234F1Z5.',
    invalid_phone: 'Enter a phone number with at least 10 digits.',
    invalid_state: 'Choose your state from the list.',
    gstin_state_mismatch: 'The first two digits of the GSTIN do not match the selected state.',
    stale_version: 'These details were changed somewhere else. Reload the page and try again.',
})

export type IdentitySaveResult =
    | { ok: true; identity: AgencyIdentity }
    | { ok: false; error: IdentityErrorCode; message: string }

const COLUMNS = 'id, status, company_name, gstin, contact_phone, address, state, city, pincode, updated_at'

function str(value: unknown): string {
    return typeof value === 'string' ? value : ''
}

function toIdentity(row: Record<string, unknown>): AgencyIdentity {
    return {
        agencyId: str(row.id),
        status: str(row.status),
        legalName: str(row.company_name),
        gstin: str(row.gstin),
        phone: str(row.contact_phone),
        address: str(row.address),
        state: str(row.state),
        city: str(row.city),
        pincode: str(row.pincode),
        updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
    }
}

export const agencyIdentityApi = {
    /**
     * The agency this user OWNS, or null when they own none (a staff member, a customer, a driver).
     * Throws UserFacingError when the read itself fails so the page can show Retry.
     */
    async load(userId: string): Promise<AgencyIdentity | null> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .select(COLUMNS)
            .eq('user_id', userId)
            .maybeSingle()
        if (error) throw new UserFacingError('Failed to load company details')
        return data ? toIdentity(data as unknown as Record<string, unknown>) : null
    },

    async save(input: IdentityInput): Promise<IdentitySaveResult> {
        const city = input.city?.trim()
        const pincode = input.pincode?.trim()
        const { data, error } = await supabase.rpc('agency_identity_update', {
            p_legal_name: input.legalName,
            p_gstin: input.gstin,
            p_phone: input.phone,
            p_address: input.address,
            p_state: input.state,
            ...(input.expectedUpdatedAt ? { p_expected_updated_at: input.expectedUpdatedAt } : {}),
            ...(city ? { p_city: city } : {}),
            ...(pincode ? { p_pincode: pincode } : {}),
        })
        if (error) throw new UserFacingError('Failed to save company details')
        const envelope = (data ?? {}) as Record<string, unknown>
        if (envelope.ok === true) {
            return {
                ok: true,
                identity: {
                    agencyId: str(envelope.agency_id),
                    status: '',
                    legalName: str(envelope.legal_name),
                    gstin: str(envelope.gstin),
                    phone: str(envelope.phone),
                    address: str(envelope.address),
                    state: str(envelope.state),
                    city: input.city?.trim() ?? '',
                    pincode: input.pincode?.trim() ?? '',
                    updatedAt: typeof envelope.updated_at === 'string' ? envelope.updated_at : null,
                },
            }
        }
        const code = envelope.error as IdentityErrorCode
        if (code in IDENTITY_ERROR_MESSAGES) {
            return { ok: false, error: code, message: IDENTITY_ERROR_MESSAGES[code] }
        }
        throw new UserFacingError('Failed to save company details')
    },
}
