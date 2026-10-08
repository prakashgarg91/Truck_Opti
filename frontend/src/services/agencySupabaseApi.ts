import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { logger } from '../utils/logger'

// ============= TYPES =============
export interface AgencyRecord {
    id: string
    company_name: string
    status: 'pending' | 'approved' | 'rejected' | 'suspended'
    rating: number
    total_jobs: number
    fleet_size: number | null
    city: string | null
    gstin: string | null
    user_id: string | null
}

export interface JobSummary {
    active: number
    today: number
    pending: number
    thirtyDayRevenue: number
    thirtyDayJobs: number
}

export interface AgencyJob {
    id: string
    agency_id: string | null
    shipment_id: string | null
    fare: number | null
    status: string
    created_at: string
    updated_at: string | null
    shipments?: {
        origin?: string
        destination?: string
        shipment_id?: string
    }
}

export interface AgencyFleet {
    id: string
    agency_id: string
    truck_id: string | null
    truck_type: string
    status: string
    current_assignment?: string
    rating: number | null
    created_at: string
}

export interface AgencyRate {
    id: string
    agency_id: string
    route_name: string
    per_km_rate: number
    base_rate: number
    vehicle_type: string
    status: 'active' | 'inactive'
    created_at: string
    updated_at: string
}

export interface AgencyBillingData {
    pendingAmount: number
    paidAmount: number
    totalEarnings: number
    thirtyDayEarnings: number
    invoiceCount: number
}

export interface AgencyDriver {
    id: string
    full_name: string
    phone: string
    status: string
    total_trips: number
    rating: number | null
    vehicle_type: string
}

// ============= AGENCY DASHBOARD API =============
export const agencyDashboardApi = {
    async getAgencyProfile(userId: string): Promise<AgencyRecord | null> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .select('id, company_name, status, rating, total_jobs, fleet_size, city, gstin, user_id')
            .eq('user_id', userId)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load agency profile')
        }

        return data as AgencyRecord | null
    },

    async getJobSummary(agencyId: string): Promise<JobSummary> {
        try {
            const today = new Date().toISOString().split('T')[0]
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

            const [activeRes, todayRes, pendingRes, revenueRes] = await Promise.all([
                supabase.from('agency_jobs').select('id', { count: 'exact', head: true })
                    .eq('agency_id', agencyId).in('status', ['accepted', 'in_transit']),
                supabase.from('agency_jobs').select('id', { count: 'exact', head: true })
                    .eq('agency_id', agencyId).gte('created_at', today),
                supabase.from('agency_jobs').select('id', { count: 'exact', head: true })
                    .eq('agency_id', agencyId).eq('status', 'pending'),
                supabase.from('agency_jobs').select('fare')
                    .eq('agency_id', agencyId).eq('status', 'delivered').gte('updated_at', thirtyDaysAgo),
            ])

            const queryError = activeRes.error || todayRes.error || pendingRes.error || revenueRes.error
            if (queryError) {
                throw queryError
            }

            const thirtyDayJobs = revenueRes.data?.length ?? 0
            const thirtyDayRevenue = (revenueRes.data ?? []).reduce(
                (acc: number, j: { fare: number | null }) => acc + (j.fare ?? 0), 0
            )

            return {
                active: activeRes.count ?? 0,
                today: todayRes.count ?? 0,
                pending: pendingRes.count ?? 0,
                thirtyDayRevenue,
                thirtyDayJobs,
            }
        } catch (error) {
            logger.error('[agencyDashboardApi.getJobSummary]', error)
            throw new UserFacingError('Failed to load job summary')
        }
    }
}

// ============= AGENCY JOBS API =============

/** One customer authorization visible to the agency party (TO-143-D1).
 * The agency cannot read shipment details (shipments RLS is owner-only),
 * so only the raw shipment id and the grant metadata are selectable. */
export interface AgencyShipmentAuthorization {
    shipment_id: string
    granted_via: string
    created_at: string
}

/** Result of the consent-gated agency_jobs creation command (TO-143-D1).
 * Duplicate submissions are idempotent: the (agency_id, shipment_id)
 * settlement key maps SQLSTATE 23505 to the typed already-exists result. */
export interface AgencyJobCreateResult {
    job: AgencyJob | null
    alreadyExists: boolean
}

function isUniqueViolationError(error: unknown): boolean {
    const code = (error as { code?: unknown } | null)?.code
    if (code === '23505') return true
    const message = (error as { message?: unknown } | null)?.message
    return typeof message === 'string' && message.includes('duplicate key value violates unique constraint')
}

export const agencyJobsApi = {
    /**
     * Lists the active customer authorizations for the caller's agency, as
     * permitted by the consent SELECT policy (the agency party reads its own
     * consents; shipment details stay owner-only). Rendered as shipment uuid
     * + grant date only.
     */
    async listAuthorizations(): Promise<AgencyShipmentAuthorization[]> {
        const { data, error } = await supabase
            .from('shipment_agency_consents')
            .select('shipment_id, granted_via, created_at')
            .is('revoked_at', null)
            .order('created_at', { ascending: false })

        if (error) {
            throw new UserFacingError('Failed to load authorizations')
        }

        return (data as AgencyShipmentAuthorization[]) || []
    },

    /**
     * Creates the agency's dispatch job for ONE authorized shipment through
     * the direct RLS INSERT (TO-143-D1) — NOT the agency-portal-jobs Edge
     * function. The caller's own agency id is resolved here (permitted by
     * the 'Agencies: own record' policy); the agency_jobs INSERT policy
     * independently re-validates ownership + active consent + operational
     * status on the write. Re-submission is idempotent: the
     * (agency_id, shipment_id) unique key maps to { alreadyExists: true }.
     */
    async createJob(shipmentId: string, fare: number): Promise<AgencyJobCreateResult> {
        const { data: authData, error: authError } = await supabase.auth.getUser()
        const userId = authData?.user?.id
        if (authError || !userId) {
            throw new UserFacingError('Please sign in to create jobs')
        }

        const { data: agency, error: agencyError } = await supabase
            .from('transport_agencies')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()

        if (agencyError) {
            throw new UserFacingError('Failed to resolve agency')
        }
        if (!agency?.id) {
            throw new UserFacingError('Agency profile not found')
        }

        const { data, error } = await supabase
            .from('agency_jobs')
            .insert({
                agency_id: agency.id,
                shipment_id: shipmentId,
                fare,
                status: 'pending',
            })
            .select('id, agency_id, shipment_id, fare, status')
            .single()

        if (error) {
            if (isUniqueViolationError(error)) {
                return { job: null, alreadyExists: true }
            }
            throw new UserFacingError('Failed to create job')
        }

        return { job: data as AgencyJob, alreadyExists: false }
    },

    async getAll(agencyId: string, filters?: { status?: string }): Promise<AgencyJob[]> {
        let query = supabase
            .from('agency_jobs')
            .select('id, agency_id, shipment_id, fare, status, created_at, updated_at, shipments(origin, destination, shipment_id)')
            .eq('agency_id', agencyId)
            .order('created_at', { ascending: false })

        if (filters?.status) {
            query = query.eq('status', filters.status)
        }

        const { data, error } = await query

        if (error) {
            throw new UserFacingError('Failed to load jobs')
        }

        return (data as AgencyJob[]) || []
    },

    async getById(jobId: string): Promise<AgencyJob | null> {
        const { data, error } = await supabase
            .from('agency_jobs')
            .select('id, agency_id, shipment_id, fare, status, created_at, updated_at, shipments(origin, destination, shipment_id)')
            .eq('id', jobId)
            .single()

        if (error) {
            throw new UserFacingError('Failed to load job details')
        }

        return data as AgencyJob | null
    },

    async updateStatus(jobId: string, status: string): Promise<AgencyJob> {
        const { data, error } = await supabase
            .from('agency_jobs')
            .update({ status })
            .eq('id', jobId)
            .select('id, agency_id, shipment_id, fare, status, created_at, updated_at, shipments(origin, destination, shipment_id)')
            .single()

        if (error) {
            throw new UserFacingError('Failed to update job status')
        }

        return data as AgencyJob
    }
}

// ============= AGENCY FLEET API =============
// ============= AGENCY FLEET API =============
export const agencyFleetApi = {
    async getFleet(_agencyId: string): Promise<AgencyFleet[]> {
        // TODO: Implement when agency_fleet table exists
        return []
    },

    async updateAssignment(_fleetId: string, _truckId: string | null): Promise<AgencyFleet> {
        // TODO: Implement when agency_fleet table exists
        throw new UserFacingError('Fleet assignment update not implemented')
    }
}

// ============= AGENCY RATES API =============
export const agencyRatesApi = {
    async getAll(_agencyId: string): Promise<AgencyRate[]> {
        // TODO: Implement when agency_rates table exists
        return []
    },

    async create(_rate: Omit<AgencyRate, 'id' | 'created_at' | 'updated_at'>): Promise<AgencyRate> {
        // TODO: Implement when agency_rates table exists
        throw new UserFacingError('Rate creation not implemented')
    },

    async update(_rateId: string, _rate: Partial<AgencyRate>): Promise<AgencyRate> {
        // TODO: Implement when agency_rates table exists
        throw new UserFacingError('Rate update not implemented')
    },

    async delete(_rateId: string): Promise<void> {
        // TODO: Implement when agency_rates table exists
        throw new UserFacingError('Rate deletion not implemented')
    }
}

// ============= AGENCY BILLING API =============
export const agencyBillingApi = {
    async getBillingData(_agencyId: string): Promise<AgencyBillingData> {
        // TODO: Implement when agency_invoices table exists
        return {
            pendingAmount: 0,
            paidAmount: 0,
            totalEarnings: 0,
            thirtyDayEarnings: 0,
            invoiceCount: 0,
        }
    }
}

// ============= AGENCY DRIVERS API =============
export const agencyDriversApi = {
    async getAll(_agencyId: string): Promise<AgencyDriver[]> {
        // TODO: Implement when agency_drivers table exists
        return []
    },

    async add(_agencyId: string, _driverId: string): Promise<AgencyDriver> {
        // TODO: Implement when agency_drivers table exists
        throw new UserFacingError('Driver assignment not implemented')
    },

    async remove(_driverId: string): Promise<void> {
        // TODO: Implement when agency_drivers table exists
        throw new UserFacingError('Driver removal not implemented')
    }
}
