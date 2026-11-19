import { supabase } from '../lib/supabase'
import { UserFacingError, reportFunctionFailure, resolveFunctionUserMessage } from '../utils/userFacingError'

// ============= TYPES =============
export interface Agency {
    id: string
    company_name: string
    gstin: string | null
    pan_number: string | null
    transport_license: string
    contact_name: string | null
    contact_phone: string | null
    city: string | null
    state: string | null
    fleet_size: number | null
    operating_routes: string | null
    status: 'pending' | 'approved' | 'rejected' | 'suspended'
    rating: number | null
    total_jobs: number | null
    created_at: string
    approved_at: string | null
    rejection_reason: string | null
}

export interface DriverPayout {
    id: string
    driver_id: string
    amount: number
    status: 'pending' | 'approved' | 'paid' | 'rejected'
    requested_at: string
    processed_at: string | null
    note: string | null
    /** why an admin rejected the payout (kept separate from the requester's note) */
    rejection_note?: string | null
    drivers: {
        full_name: string
        phone: string
    } | null
}

export interface AdminDashboardData {
    totalRevenue: number
    agencyRevenue: number
    driverRevenue: number
    directAppRevenue: number
    directAppBookingValue: number
    directAppBookingCount: number
    totalAgencies: number
    totalDrivers: number
    totalShipments: number
    platformFee: number
}

export interface RevenueEvent {
    id: string
    source: string
    ownerName: string
    origin: string
    destination: string
    amount: number
    eventDate: string
}

export interface ContactInquiry {
    id: string
    name: string
    email: string
    phone: string | null
    subject: string
    message: string
    status: 'open' | 'resolved'
    created_at: string
}

export interface AdminUser {
    id: string
    email: string
    role: string
    created_at: string
    updated_at: string
    name?: string
    phone?: string
    account_status: 'active' | 'disabled'
    banned_until?: string | null
}

export type AdminSubscriptionStatus = 'trial' | 'active' | 'past_due' | 'grace' | 'expired' | 'cancelled'

// Subscriptions are agency-level. `user` was the old per-user owner; the purchaser is now informational only.
export interface AdminSubscription {
    id: string
    agency_id: string | null
    agency: {
        name: string | null
        gstin: string | null
        status: string | null
    } | null
    purchaser: {
        name: string | null
        email: string | null
    } | null
    status: AdminSubscriptionStatus
    billing_cycle: 'monthly' | 'yearly'
    current_period_start: string
    current_period_end: string
    trial_end: string | null
    grace_end: string | null
    first_paid_at: string | null
    cancel_at_period_end: boolean
    created_at: string
    plan: {
        id: string
        name: string
        tier: string
    } | null
    // True only on the newest cancelled row of an agency with no live subscription.
    can_reopen: boolean
}

// A Razorpay payment that was captured but refused by activation (payment_history.metadata.refusal).
export interface AdminRefusedPayment {
    id: string
    agency_id: string | null
    subscription_id: string | null
    amount_paise: number | null
    order_id: string | null
    payment_id: string | null
    refused_payment_ids: string[]
    refusal: string
    refused_at: string
    error_message: string | null
}

// A refund Razorpay already processed that could not be credit-noted (append-only subscription_refund_exceptions).
export interface AdminRefundException {
    id: string
    refund_id: string
    payment_id: string
    agency_id: string | null
    amount_paise: number
    reason: string
    created_at: string
}

export interface AdminSubscriptionsSnapshot {
    subscriptions: AdminSubscription[]
    opsAttention: {
        refusedPayments: AdminRefusedPayment[]
        refundExceptions: AdminRefundException[]
    }
}

export interface AdminDriverProfile {
    id: string
    user_id: string | null
    full_name: string
    phone: string
    aadhaar_last4: string | null
    pan_number: string | null
    date_of_birth: string | null
    vehicle_type: string
    rc_number: string | null
    license_number: string | null
    vehicle_capacity: number | null
    dl_url: string | null
    rc_url: string | null
    insurance_url: string | null
    selfie_url: string | null
    bank_account: string | null
    ifsc_code: string | null
    upi_id: string | null
    status: 'pending' | 'approved' | 'rejected' | 'suspended'
    rejection_reason: string | null
    approved_by: string | null
    approved_at: string | null
    home_city: string | null
    rating: number | null
    total_trips: number | null
    is_online: boolean
    created_at: string
    updated_at: string
}

// TO-131: user-facing messages are resolved only from approved typed status
// codes; raw provider messages and payload strings are reported as bounded
// diagnostics instead of being surfaced.
async function invokeAdminFunction<T>(functionName: string, body: Record<string, unknown>, fallbackMessage: string): Promise<T> {
    try {
        const { data, error } = await supabase.functions.invoke<T>(functionName, { body })

        if (error) {
            reportFunctionFailure(functionName, error)
            throw new UserFacingError(resolveFunctionUserMessage(error, fallbackMessage))
        }

        return data as T
    } catch (error) {
        if (error instanceof UserFacingError) {
            throw error
        }

        reportFunctionFailure(functionName, error)
        throw new UserFacingError(fallbackMessage)
    }
}

// ============= AGENCIES API =============
export const adminAgenciesApi = {
    async getSnapshot(status: 'pending' | 'approved' | 'rejected' | 'suspended'): Promise<{ agencies: Agency[]; counts: Record<'pending' | 'approved' | 'rejected' | 'suspended', number> }> {
        const data = await invokeAdminFunction<{
            agencies: Agency[]
            counts: Record<'pending' | 'approved' | 'rejected' | 'suspended', number>
        }>('admin-portal-agencies', { action: 'list', status }, 'Failed to load agencies')

        return {
            agencies: data?.agencies ?? [],
            counts: data?.counts ?? { pending: 0, approved: 0, rejected: 0, suspended: 0 },
        }
    },

    async approve(agencyId: string): Promise<Agency> {
        const data = await invokeAdminFunction<{ agency: Agency }>('admin-portal-agencies', { action: 'approve', agencyId }, 'Failed to approve agency. Please try again.')
        return data.agency
    },

    async reject(agencyId: string, rejectionReason: string): Promise<Agency> {
        const data = await invokeAdminFunction<{ agency: Agency }>('admin-portal-agencies', { action: 'reject', agencyId, rejectionReason }, 'Failed to reject agency. Please try again.')
        return data.agency
    },

    async suspend(agencyId: string): Promise<Agency> {
        const data = await invokeAdminFunction<{ agency: Agency }>('admin-portal-agencies', { action: 'suspend', agencyId }, 'Failed to suspend agency. Please try again.')
        return data.agency
    }
}

// ============= ADMIN PAYOUTS API =============
export const adminPayoutsApi = {
    async getAll(): Promise<DriverPayout[]> {
        const data = await invokeAdminFunction<{ payouts: DriverPayout[] }>('admin-portal-payouts', { action: 'list' }, 'Failed to load payouts')
        return data?.payouts ?? []
    },

    async approve(payoutId: string): Promise<DriverPayout> {
        const data = await invokeAdminFunction<{ payout: DriverPayout }>('admin-portal-payouts', { action: 'approve', payoutId }, 'Failed to approve payout. Please try again.')
        return data.payout
    },

    async reject(payoutId: string, rejectionNote: string): Promise<DriverPayout> {
        const data = await invokeAdminFunction<{ payout: DriverPayout }>('admin-portal-payouts', { action: 'reject', payoutId, rejectionNote }, 'Failed to reject payout. Please try again.')
        return data.payout
    },

    async markAsPaid(payoutId: string): Promise<DriverPayout> {
        const data = await invokeAdminFunction<{ payout: DriverPayout }>('admin-portal-payouts', { action: 'mark-paid', payoutId }, 'Failed to mark payout as paid. Please try again.')
        return data.payout
    }
}

// ============= ADMIN DASHBOARD API =============
export const adminDashboardApi = {
    async getSnapshot(limit = 20): Promise<{ analytics: AdminDashboardData; recentJobs: RevenueEvent[] }> {
        const data = await invokeAdminFunction<{
            analytics: AdminDashboardData
            recentJobs: RevenueEvent[]
        }>('admin-portal-dashboard', { action: 'snapshot', limit }, 'Failed to load dashboard analytics. Please try again.')

        return {
            analytics: data.analytics,
            recentJobs: data.recentJobs ?? [],
        }
    },
}

// ============= PLATFORM BILLING SETTINGS =============
// Read: RLS select (admin only, platform_billing_settings_admin_select). Write: the SECURITY DEFINER RPC
// platform_billing_settings_update, called with the admin's own JWT. The RPC also takes the enforcement flag;
// this version never changes it: the flag is re-read right before each save and passed through unchanged.
export interface PlatformBillingSettings {
    legalName: string | null
    gstin: string | null
    address: string | null
    stateCode: string | null
    sacCode: string
    /** false: the seller is not registered under GST, so no GST is charged and no GSTIN is stored. */
    gstRegistered: boolean
    enforcementEnabled: boolean
    updatedAt: string | null
}

export interface PlatformBillingSettingsInput {
    legalName: string
    /** Not sent to the server when gstRegistered is false (sent as null). */
    gstin: string
    address: string
    stateCode: string
    sacCode: string
    gstRegistered: boolean
}

export const BILLING_SETTINGS_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
    forbidden: 'Only an admin can change billing settings.',
    invalid_legal_name: 'Enter the legal name of the business that issues the invoices.',
    invalid_gstin: 'This is not a valid GSTIN. It has 15 characters, for example 27AAAAA0000A1Z5.',
    invalid_address: 'Enter the registered address that appears on the invoices.',
    invalid_state_code: 'Enter a valid two-digit GST state code between 01 and 38.',
    gstin_state_mismatch: 'The state code must match the first two digits of the GSTIN.',
    invalid_sac_code: 'The SAC must be 6 to 8 digits.',
    invalid_enforcement_enabled: 'The enforcement setting could not be read. Reload the page and try again.',
    invalid_gst_registered: 'Choose whether the seller is registered under GST, then try again.',
    gstin_not_allowed_when_unregistered:
        'A GSTIN cannot be saved while the seller is not registered under GST. Remove the GSTIN or switch on "Registered under GST".',
})
const BILLING_SETTINGS_UNKNOWN = 'Billing settings could not be saved. Please try again.'

function billingSettingsErrorMessage(error: unknown): string {
    const raw = `${(error as { message?: string } | null)?.message ?? ''} ${(error as { code?: string } | null)?.code ?? ''}`
    for (const code of Object.keys(BILLING_SETTINGS_ERROR_MESSAGES)) {
        if (raw.includes(code)) return BILLING_SETTINGS_ERROR_MESSAGES[code]
    }
    if (raw.includes('42501')) return BILLING_SETTINGS_ERROR_MESSAGES.forbidden
    return BILLING_SETTINGS_UNKNOWN
}

async function readBillingSettings(): Promise<PlatformBillingSettings | null> {
    const { data, error } = await supabase
        .from('platform_billing_settings')
        .select('legal_name, gstin, address, state_code, sac_code, gst_registered, enforcement_enabled, updated_at')
        .limit(1)
        .maybeSingle()
    if (error) {
        reportFunctionFailure('platform_billing_settings', error)
        throw new UserFacingError('Unable to load billing settings right now. Please try again.')
    }
    if (!data) return null
    return {
        legalName: data.legal_name ?? null,
        gstin: data.gstin ?? null,
        address: data.address ?? null,
        stateCode: data.state_code ?? null,
        sacCode: data.sac_code ?? '997331',
        gstRegistered: data.gst_registered !== false,
        enforcementEnabled: data.enforcement_enabled === true,
        updatedAt: data.updated_at ?? null,
    }
}

export const adminBillingSettingsApi = {
    getSettings: readBillingSettings,

    async updateSettings(input: PlatformBillingSettingsInput): Promise<void> {
        // Re-read so a flag changed elsewhere (for example from the database) is never overwritten by this form.
        const current = await readBillingSettings()
        if (!current) throw new UserFacingError('Unable to load billing settings right now. Please try again.')
        const { error } = await supabase.rpc('platform_billing_settings_update', {
            p_legal_name: input.legalName,
            p_gstin: input.gstRegistered ? input.gstin : null,
            p_address: input.address,
            p_state_code: input.stateCode,
            p_sac_code: input.sacCode,
            p_enforcement_enabled: current.enforcementEnabled,
            p_gst_registered: input.gstRegistered,
        })
        if (error) {
            reportFunctionFailure('platform_billing_settings_update', error)
            throw new UserFacingError(billingSettingsErrorMessage(error))
        }
    },

    /** Approved agencies with no trial, active, past-due or grace subscription (read-only; null when unknown). */
    async countApprovedAgenciesWithoutLiveSubscription(): Promise<number> {
        const [approved, subs] = await Promise.all([
            adminAgenciesApi.getSnapshot('approved'),
            adminSupabaseApi.getAdminSubscriptions(),
        ])
        const live = new Set(
            subs.subscriptions
                .filter((s) => ['trial', 'active', 'past_due', 'grace'].includes(s.status) && s.agency_id)
                .map((s) => s.agency_id as string),
        )
        return approved.agencies.filter((a) => !live.has(a.id)).length
    },
}

// ============= BILLING OPS (read-only) =============
// subscription_sweep_runs has an admin SELECT policy (is_admin_user) plus the authenticated grant
// (20261031000000_subscription_sweeps.sql). Every other ops table is readable by the server-side service account only,
// so those reads go through four admin-only SECURITY DEFINER functions (20261041000000_admin_billing_ops_read.sql).
// A failed or refused call throws: the page shows an error with Retry, never an empty list.
export interface AdminSweepRun {
    id: string
    asOf: string
    startedAt: string
    finishedAt: string | null
    trialsExpired: number
    graceStarted: number
    graceExpired: number
    remindersCreated: number
}

export interface AdminAgencyWithoutSubscription {
    id: string
    name: string
    createdAt: string
    ownerUserId: string | null
    ownerEmail: string | null
}

export interface AdminWebhookEvent {
    receivedAt: string
    eventId: string
    eventType: string
    result: string
    orderId: string | null
    paymentId: string | null
}

export interface AdminWebhookAttempt {
    eventId: string
    attemptNo: number
    sqlstateOrCode: string
    at: string
}

export interface AdminCoupon {
    code: string
    percentOff: number
    maxCycles: number
    monthlyOnly: boolean
    validUntil: string | null
    maxRedemptions: number | null
    redemptionCount: number
}

type OpsReply = { ok?: boolean; error?: string } & Record<string, unknown>
type OpsRow = Record<string, unknown>

// Calls one admin ops reader and returns the list under `key`. Anything but {ok:true, [key]: array} is a failure.
async function readOpsList(fn: string, args: Record<string, unknown> | undefined, key: string, failure: string): Promise<OpsRow[]> {
    const { data, error } = args ? await supabase.rpc(fn as never, args as never) : await supabase.rpc(fn as never)
    if (error) {
        reportFunctionFailure(fn, error)
        throw new UserFacingError(failure)
    }
    const reply = (data ?? null) as OpsReply | null
    const list = reply?.ok === true ? reply[key] : null
    if (!Array.isArray(list)) {
        reportFunctionFailure(fn, { message: reply?.error ?? 'unexpected reply' })
        throw new UserFacingError(failure)
    }
    return list as OpsRow[]
}

const opsStr = (v: unknown): string => (typeof v === 'string' ? v : '')
const opsStrOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const opsNum = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

export const adminBillingOpsApi = {
    /** Approved agencies with no trial, active, past-due or grace subscription. Admin-only function. */
    async getAgenciesWithoutSubscription(): Promise<AdminAgencyWithoutSubscription[]> {
        const rows = await readOpsList('admin_agencies_without_subscription', undefined, 'agencies', 'Unable to load agencies without a subscription right now. Please try again.')
        return rows.map((r) => ({
            id: opsStr(r.id),
            name: opsStr(r.name),
            createdAt: opsStr(r.created_at),
            ownerUserId: opsStrOrNull(r.owner_user_id),
            ownerEmail: opsStrOrNull(r.owner_email),
        }))
    },

    /** Latest webhook events, newest first (the function caps at 500). Never carries the payload. */
    async getWebhookEvents(limit = 100): Promise<AdminWebhookEvent[]> {
        const rows = await readOpsList('admin_webhook_events', { p_limit: limit }, 'events', 'Unable to load webhook events right now. Please try again.')
        return rows.map((r) => ({
            receivedAt: opsStr(r.received_at),
            eventId: opsStr(r.event_id),
            eventType: opsStr(r.event_type),
            result: opsStr(r.result),
            orderId: opsStrOrNull(r.order_id),
            paymentId: opsStrOrNull(r.payment_id),
        }))
    },

    /** Latest failed or retried webhook attempts, newest first. */
    async getWebhookAttempts(limit = 100): Promise<AdminWebhookAttempt[]> {
        const rows = await readOpsList('admin_webhook_attempts', { p_limit: limit }, 'attempts', 'Unable to load webhook retry attempts right now. Please try again.')
        return rows.map((r) => ({
            eventId: opsStr(r.event_id),
            attemptNo: opsNum(r.attempt_no),
            sqlstateOrCode: opsStr(r.sqlstate_or_code),
            at: opsStr(r.at),
        }))
    },

    /** Coupons with how many times each was redeemed. */
    async getCoupons(): Promise<AdminCoupon[]> {
        const rows = await readOpsList('admin_subscription_coupons', undefined, 'coupons', 'Unable to load coupons right now. Please try again.')
        return rows.map((r) => ({
            code: opsStr(r.code),
            percentOff: opsNum(r.percent_off),
            maxCycles: opsNum(r.max_cycles),
            monthlyOnly: r.monthly_only === true,
            validUntil: opsStrOrNull(r.valid_until),
            maxRedemptions: r.max_redemptions == null ? null : opsNum(r.max_redemptions),
            redemptionCount: opsNum(r.redemption_count),
        }))
    },

    /**
     * Sweep runs, newest first. `offset` pages forward (page N starts at offset N * limit); the first page is a plain limit.
     * Flat select; no payload or result column is read.
     */
    async getSweepRuns(limit = 20, offset = 0): Promise<AdminSweepRun[]> {
        const ordered = supabase
            .from('subscription_sweep_runs')
            .select('id, as_of, started_at, finished_at, trials_expired, grace_started, grace_expired, reminders_created')
            .order('started_at', { ascending: false })
        const { data, error } = offset > 0 ? await ordered.range(offset, offset + limit - 1) : await ordered.limit(limit)
        if (error) {
            reportFunctionFailure('subscription_sweep_runs', error)
            throw new UserFacingError('Unable to load sweep runs right now. Please try again.')
        }
        return (data ?? []).map((row) => ({
            id: row.id,
            asOf: row.as_of,
            startedAt: row.started_at,
            finishedAt: row.finished_at ?? null,
            trialsExpired: row.trials_expired ?? 0,
            graceStarted: row.grace_started ?? 0,
            graceExpired: row.grace_expired ?? 0,
            remindersCreated: row.reminders_created ?? 0,
        }))
    },
}

// ============= CONSOLIDATED ADMIN API =============
export const adminSupabaseApi = {
    async getAdminDashboardData(): Promise<AdminDashboardData> {
        const snapshot = await adminDashboardApi.getSnapshot()
        return snapshot.analytics
    },

    async getAdminUsers(): Promise<AdminUser[]> {
        const data = await invokeAdminFunction<{ users: AdminUser[] }>('admin-portal-users', { action: 'list' }, 'Unable to load users right now. Please try again.')
        return data?.users ?? []
    },

    async getAdminAgencies(status: 'pending' | 'approved' | 'rejected' | 'suspended'): Promise<Agency[]> {
        const snapshot = await adminAgenciesApi.getSnapshot(status)
        return snapshot.agencies
    },

    async getAdminPayouts(): Promise<DriverPayout[]> {
        return adminPayoutsApi.getAll()
    },

    async getAdminSubscriptions(): Promise<AdminSubscriptionsSnapshot> {
        const data = await invokeAdminFunction<{
            subscriptions?: AdminSubscription[]
            ops_attention?: { refused_payments?: AdminRefusedPayment[]; refund_exceptions?: AdminRefundException[] }
        }>('admin-portal-subscriptions', { action: 'list' }, 'Unable to load subscriptions right now. Please try again.')
        return {
            subscriptions: data?.subscriptions ?? [],
            opsAttention: {
                refusedPayments: data?.ops_attention?.refused_payments ?? [],
                refundExceptions: data?.ops_attention?.refund_exceptions ?? [],
            },
        }
    },

    // The only subscription write the admin side has: support reopen after a cancellation or refund. The server
    // runs subscription_support_reopen (service-only, admin-checked); status is never edited directly.
    async reopenSubscription(agencyId: string): Promise<void> {
        await invokeAdminFunction('admin-portal-subscriptions', { action: 'reopen', agencyId }, 'Unable to reopen the subscription. Please try again.')
    },

    async deleteUser(userId: string): Promise<void> {
        await invokeAdminFunction('admin-portal-users', { action: 'delete', userId }, 'Failed to delete the user account')
    },

    async banUser(userId: string): Promise<void> {
        await invokeAdminFunction('admin-portal-users', { action: 'set-disabled', userId, disabled: true }, 'Failed to disable the user account')
    },

    async unbanUser(userId: string): Promise<void> {
        await invokeAdminFunction('admin-portal-users', { action: 'set-disabled', userId, disabled: false }, 'Failed to re-enable the user account')
    },

    async getContactInquiries(): Promise<ContactInquiry[]> {
        const data = await invokeAdminFunction<{ inquiries: ContactInquiry[] }>('admin-portal-contact', { action: 'list' }, 'Unable to load contact inquiries right now. Please try again.')
        return data?.inquiries ?? []
    },

    async resolveContactInquiry(id: string): Promise<void> {
        await invokeAdminFunction('admin-portal-contact', { action: 'resolve', inquiryId: id }, 'Unable to update this inquiry right now. Please try again.')
    },

    async getDriversByStatus(status: 'pending' | 'approved' | 'rejected' | 'suspended'): Promise<AdminDriverProfile[]> {
        const data = await invokeAdminFunction<{ drivers: AdminDriverProfile[] }>('admin-portal-drivers', { action: 'list', status }, 'Unable to load drivers right now. Please try again.')
        return data?.drivers ?? []
    },

    async getDriverById(driverId: string): Promise<AdminDriverProfile | null> {
        const data = await invokeAdminFunction<{ driver: AdminDriverProfile | null }>('admin-portal-drivers', { action: 'get', driverId }, 'Unable to load driver details right now. Please try again.')
        return data?.driver ?? null
    },

    async approveDriver(driverId: string): Promise<AdminDriverProfile> {
        const data = await invokeAdminFunction<{ driver: AdminDriverProfile }>('admin-portal-drivers', { action: 'approve', driverId }, 'Failed to approve driver. Please try again.')
        return data.driver
    },

    async rejectDriver(driverId: string, rejectionReason: string): Promise<AdminDriverProfile> {
        const data = await invokeAdminFunction<{ driver: AdminDriverProfile }>('admin-portal-drivers', { action: 'reject', driverId, rejectionReason }, 'Failed to reject driver. Please try again.')
        return data.driver
    },

    async suspendDriver(driverId: string): Promise<AdminDriverProfile> {
        const data = await invokeAdminFunction<{ driver: AdminDriverProfile }>('admin-portal-drivers', { action: 'suspend', driverId }, 'Failed to suspend driver. Please try again.')
        return data.driver
    },
}
