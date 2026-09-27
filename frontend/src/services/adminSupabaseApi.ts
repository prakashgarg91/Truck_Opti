import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { logger } from '../utils/logger'

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

export interface AdminSubscription {
    id: string
    user_id: string
    status: 'active' | 'trial' | 'expired' | 'cancelled'
    billing_cycle: 'monthly' | 'yearly'
    current_period_start: string
    current_period_end: string
    trial_end: string | null
    cancel_at_period_end: boolean
    created_at: string
    user: {
        name: string
        email: string
    } | null
    plan: {
        id: string
        name: string
        tier: string
    } | null
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

async function getFunctionErrorMessage(error: unknown, fallbackMessage: string) {
    if (error && typeof error === 'object') {
        const response = 'context' in error ? error.context : null

        if (response instanceof Response) {
            try {
                const payload = (await response.clone().json()) as { error?: string }

                if (typeof payload.error === 'string' && payload.error.trim()) {
                    return payload.error
                }
            } catch {
                // Fall through to generic handling.
            }
        }

        if ('message' in error && typeof error.message === 'string' && error.message.trim()) {
            return error.message
        }
    }

    return fallbackMessage
}

async function invokeAdminFunction<T>(functionName: string, body: Record<string, unknown>, fallbackMessage: string): Promise<T> {
    try {
        const { data, error } = await supabase.functions.invoke<T>(functionName, { body })

        if (error) {
            logger.error(`[${functionName}]`, error)
            throw new UserFacingError(await getFunctionErrorMessage(error, fallbackMessage))
        }

        return data as T
    } catch (error) {
        logger.error(`[${functionName}]`, error)
        if (error instanceof UserFacingError) {
            throw error
        }

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

    async getAdminSubscriptions(): Promise<AdminSubscription[]> {
        const data = await invokeAdminFunction<{ subscriptions: AdminSubscription[] }>('admin-portal-subscriptions', { action: 'list' }, 'Unable to load subscriptions right now. Please try again.')
        return data?.subscriptions ?? []
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
