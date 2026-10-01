import { supabase } from '../lib/supabase'
import { UserFacingError, reportFunctionFailure, resolveFunctionUserMessage } from '../utils/userFacingError'

// ============= TYPES =============
export interface AgencyJob {
    id: string
    shipment_id: string
    status: string
    fare: number
    driver_id?: string
    created_at: string
    updated_at: string
    shipments?: {
        shipment_id: string
        origin: string
        destination: string
        total_weight: number
        estimated_cost: number
    }[]
}

export interface FleetTruck {
    id: string
    vehicle_type: string
    rc_number: string
    insurance_expiry: string | null
    fitness_expiry: string | null
    permit_expiry: string | null
    is_available: boolean
    driver_id: string | null
    agency_id: string
}

export interface BillingSummary {
    thisMonth: number
    pending: number
    totalPaid: number
    gstDue: number
}

export interface DeliveredJob {
    id: string
    fare: number
    origin: string
    destination: string
    updated_at: string
    shipment_id: string
}

export interface RateCard {
    id: string
    agency_id: string
    vehicle_type: string
    origin_city: string
    dest_city: string
    rate_per_km: number | null
    flat_rate: number | null
    min_weight_kg: number | null
    max_weight_kg: number | null
    is_active: boolean
    valid_from: string | null
    valid_until: string | null
    notes: string | null
}

export interface AgencyDriverAssignmentRow {
    id: string
    vehicle_type: string
    rc_number: string
    driver_id: string | null
    drivers?: {
        id?: string
        full_name?: string
        phone?: string
        rating?: number
    } | null
}

export interface AgencyPortalProfile {
    id: string
    company_name: string
    status: 'pending' | 'approved' | 'rejected' | 'suspended'
    rating: number | null
    total_jobs: number | null
    fleet_size: number | null
    city: string | null
    gstin: string | null
}

export interface AgencyPortalSummary {
    active: number
    today: number
    pending: number
    thirtyDayRevenue: number
    thirtyDayJobs: number
}

export interface AgencyAssignedDriver {
    id: string
    full_name: string
    phone: string
    vehicle_type: string
    home_city: string | null
    rating: number | null
    total_trips: number | null
    status: string
    is_online: boolean
    active_job_id: string | null
    truck_id: string | null
}

export interface AgencyFleetTruckSummary {
    id: string
    vehicle_type: string
    rc_number: string
}

// ============= DASHBOARD API =============
export const agencyDashboardApi = {
    async getSnapshot(): Promise<{ agency: AgencyPortalProfile | null; summary: AgencyPortalSummary }> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                agency: AgencyPortalProfile | null
                summary: AgencyPortalSummary
            }>('agency-portal-dashboard', {
                body: { action: 'snapshot' },
            })

            if (error) {
                reportFunctionFailure('agency-portal-dashboard', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load dashboard summary'))
            }

            return {
                agency: data?.agency ?? null,
                summary: data?.summary ?? {
                    active: 0,
                    today: 0,
                    pending: 0,
                    thirtyDayRevenue: 0,
                    thirtyDayJobs: 0,
                },
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-dashboard', e)
            throw new UserFacingError('Failed to load dashboard summary')
        }
    },
}

// ============= JOBS API =============
export const agencyJobsApi = {
    async list(): Promise<AgencyJob[]> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-jobs', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError('Failed to load jobs')
            }

            return data?.jobs || []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to load jobs')
        }
    },

    async updateStatus(jobId: string, status: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'update-status', jobId, status },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError('Failed to update job status')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to update job status')
        }
    },

    async assignDriver(jobId: string, driverId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'assign-driver', jobId, driverId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError('Failed to assign driver')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to assign driver')
        }
    },

    async getAssignableDrivers(): Promise<AgencyDriverAssignmentRow[]> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                drivers: AgencyDriverAssignmentRow[]
            }>('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'assignable-drivers' },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load drivers'))
            }

            return data?.drivers ?? []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to load drivers')
        }
    },

    async getDriverLatestLocation(jobId: string): Promise<{ lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null } | null> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                location: { lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null } | null
            }>('agency-portal-jobs', {
                method: 'POST',
                body: { action: 'latest-driver-location', jobId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-jobs', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load driver location'))
            }

            return data?.location ?? null
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-jobs', e)
            throw new UserFacingError('Failed to load driver location')
        }
    },
}

// ============= FLEET API =============
export const agencyFleetApi = {
    async list(): Promise<FleetTruck[]> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-fleet', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-fleet', error)
                throw new UserFacingError('Failed to load trucks')
            }

            return data?.trucks || []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-fleet', e)
            throw new UserFacingError('Failed to load trucks')
        }
    },

    async addTruck(rcNumber: string, vehicleType: string, expiryData?: {
        insurance_expiry?: string
        fitness_expiry?: string
        permit_expiry?: string
    }): Promise<FleetTruck> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-fleet', {
                method: 'POST',
                body: {
                    action: 'add-truck',
                    rc_number: rcNumber,
                    vehicle_type: vehicleType,
                    ...expiryData,
                },
            })

            if (error) {
                reportFunctionFailure('agency-portal-fleet', error)
                throw new UserFacingError('Failed to add truck')
            }

            return data?.truck
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-fleet', e)
            throw new UserFacingError('Failed to add truck')
        }
    },

    async updateTruck(truckId: string, updateData: Record<string, unknown>): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-fleet', {
                method: 'POST',
                body: { action: 'update-truck', truckId, data: updateData },
            })

            if (error) {
                reportFunctionFailure('agency-portal-fleet', error)
                throw new UserFacingError('Failed to update truck')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-fleet', e)
            throw new UserFacingError('Failed to update truck')
        }
    },
}

// ============= BILLING API =============
export const agencyBillingApi = {
    async list(): Promise<{ summary: BillingSummary; jobs: DeliveredJob[] }> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-billing', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-billing', error)
                throw new UserFacingError('Failed to load billing data')
            }

            return {
                summary: data?.summary || { thisMonth: 0, pending: 0, totalPaid: 0, gstDue: 0 },
                jobs: data?.jobs || [],
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-billing', e)
            throw new UserFacingError('Failed to load billing data')
        }
    },
}

// ============= RATES API =============
export const agencyRatesApi = {
    async list(): Promise<RateCard[]> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'GET',
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to load rate cards')
            }

            return data?.rates || []
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to load rate cards')
        }
    },

    async addRate(rateData: {
        vehicle_type: string
        origin_city: string
        dest_city: string
        rate_per_km?: number
        flat_rate?: number
        min_weight_kg?: number
        max_weight_kg?: number
        valid_until?: string
        notes?: string
    }): Promise<RateCard> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'POST',
                body: { action: 'add-rate', ...rateData },
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to add rate card')
            }

            return data?.rate
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to add rate card')
        }
    },

    async updateRate(rateId: string, updateData: Record<string, unknown>): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'POST',
                body: { action: 'update-rate', rateId, data: updateData },
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to update rate card')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to update rate card')
        }
    },

    async deleteRate(rateId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-rates', {
                method: 'POST',
                body: { action: 'delete-rate', rateId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-rates', error)
                throw new UserFacingError('Failed to delete rate card')
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-rates', e)
            throw new UserFacingError('Failed to delete rate card')
        }
    },
}

export const agencyDriversApi = {
    async getSnapshot(): Promise<{ trucks: AgencyFleetTruckSummary[]; drivers: AgencyAssignedDriver[] }> {
        try {
            const { data, error } = await supabase.functions.invoke<{
                trucks: AgencyFleetTruckSummary[]
                drivers: AgencyAssignedDriver[]
            }>('agency-portal-drivers', {
                body: { action: 'snapshot' },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to load drivers'))
            }

            return {
                trucks: data?.trucks ?? [],
                drivers: data?.drivers ?? [],
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to load drivers')
        }
    },

    async assignTruckToDriver(truckId: string, driverId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-drivers', {
                body: { action: 'assign-truck', truckId, driverId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to assign truck'))
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to assign truck')
        }
    },

    async unassignTruck(truckId: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-drivers', {
                body: { action: 'unassign-truck', truckId },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to unassign driver'))
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to unassign driver')
        }
    },

    async createPayout(driverId: string, amount: number, note?: string): Promise<void> {
        try {
            const { error } = await supabase.functions.invoke('agency-portal-drivers', {
                body: { action: 'create-payout', driverId, amount, note },
            })

            if (error) {
                reportFunctionFailure('agency-portal-drivers', error)
                throw new UserFacingError(resolveFunctionUserMessage(error, 'Failed to submit payment request'))
            }
        } catch (e) {
            if (e instanceof UserFacingError) {
                throw e
            }

            reportFunctionFailure('agency-portal-drivers', e)
            throw new UserFacingError('Failed to submit payment request')
        }
    },
}

export const agencyRegistrationApi = {
    async register(payload: Record<string, unknown>): Promise<void> {
        const { error } = await supabase
            .from('transport_agencies')
            .insert(payload)

        if (error) {
            throw new UserFacingError('Unable to submit agency registration right now. Please try again.')
        }
    },
}
