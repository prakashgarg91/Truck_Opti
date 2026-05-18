import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

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
            throw new UserFacingError('Failed to load job summary')
        }
    }
}

// ============= AGENCY JOBS API =============
export const agencyJobsApi = {
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
