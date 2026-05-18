import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { logger } from '../utils/logger'

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

// ============= JOBS API =============
export const agencyJobsApi = {
    async list(): Promise<AgencyJob[]> {
        try {
            const { data, error } = await supabase.functions.invoke('agency-portal-jobs', {
                method: 'GET',
            })

            if (error) {
                logger.error('[agencyJobsApi.list]', error)
                throw new UserFacingError('Failed to load jobs')
            }

            return data?.jobs || []
        } catch (e) {
            logger.error('[agencyJobsApi.list]', e)
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
                logger.error('[agencyJobsApi.updateStatus]', error)
                throw new UserFacingError('Failed to update job status')
            }
        } catch (e) {
            logger.error('[agencyJobsApi.updateStatus]', e)
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
                logger.error('[agencyJobsApi.assignDriver]', error)
                throw new UserFacingError('Failed to assign driver')
            }
        } catch (e) {
            logger.error('[agencyJobsApi.assignDriver]', e)
            throw new UserFacingError('Failed to assign driver')
        }
    },

    async getAgencyIdByUser(userId: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load agency profile')
        }

        return (data as { id: string } | null)?.id ?? null
    },

    async getAvailableDrivers(agencyId: string): Promise<AgencyDriverAssignmentRow[]> {
        const { data, error } = await supabase
            .from('agency_trucks')
            .select(`
        id,
        vehicle_type,
        rc_number,
        driver_id,
        drivers!agency_trucks_driver_id_fkey (
          id,
          full_name,
          phone,
          rating
        )
      `)
            .eq('agency_id', agencyId)
            .not('driver_id', 'is', null)
            .eq('is_available', true)

        if (error) {
            throw new UserFacingError('Failed to load drivers')
        }

        return (data as AgencyDriverAssignmentRow[]) || []
    },

    async getDriverLatestLocation(driverId: string): Promise<{ lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null } | null> {
        const { data, error } = await supabase
            .from('driver_locations')
            .select('lat, lng, updated_at, speed_kmh')
            .eq('driver_id', driverId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load driver location')
        }

        return (data as { lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null } | null) ?? null
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
                logger.error('[agencyFleetApi.list]', error)
                throw new UserFacingError('Failed to load trucks')
            }

            return data?.trucks || []
        } catch (e) {
            logger.error('[agencyFleetApi.list]', e)
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
                logger.error('[agencyFleetApi.addTruck]', error)
                throw new UserFacingError('Failed to add truck')
            }

            return data?.truck
        } catch (e) {
            logger.error('[agencyFleetApi.addTruck]', e)
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
                logger.error('[agencyFleetApi.updateTruck]', error)
                throw new UserFacingError('Failed to update truck')
            }
        } catch (e) {
            logger.error('[agencyFleetApi.updateTruck]', e)
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
                logger.error('[agencyBillingApi.list]', error)
                throw new UserFacingError('Failed to load billing data')
            }

            return {
                summary: data?.summary || { thisMonth: 0, pending: 0, totalPaid: 0, gstDue: 0 },
                jobs: data?.jobs || [],
            }
        } catch (e) {
            logger.error('[agencyBillingApi.list]', e)
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
                logger.error('[agencyRatesApi.list]', error)
                throw new UserFacingError('Failed to load rate cards')
            }

            return data?.rates || []
        } catch (e) {
            logger.error('[agencyRatesApi.list]', e)
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
                logger.error('[agencyRatesApi.addRate]', error)
                throw new UserFacingError('Failed to add rate card')
            }

            return data?.rate
        } catch (e) {
            logger.error('[agencyRatesApi.addRate]', e)
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
                logger.error('[agencyRatesApi.updateRate]', error)
                throw new UserFacingError('Failed to update rate card')
            }
        } catch (e) {
            logger.error('[agencyRatesApi.updateRate]', e)
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
                logger.error('[agencyRatesApi.deleteRate]', error)
                throw new UserFacingError('Failed to delete rate card')
            }
        } catch (e) {
            logger.error('[agencyRatesApi.deleteRate]', e)
            throw new UserFacingError('Failed to delete rate card')
        }
    },
}

export const agencyDriversApi = {
    async getAgencyByUserId(userId: string): Promise<{ id: string } | null> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load agency profile')
        }

        return (data as { id: string } | null) ?? null
    },

    async getAgencyTrucks(agencyId: string): Promise<Array<{ id: string; vehicle_type: string; rc_number: string }>> {
        const { data, error } = await supabase
            .from('agency_trucks')
            .select('id, vehicle_type, rc_number')
            .eq('agency_id', agencyId)

        if (error) {
            throw new UserFacingError('Failed to load trucks')
        }

        return (data as Array<{ id: string; vehicle_type: string; rc_number: string }>) || []
    },

    async getAssignedDrivers(agencyId: string): Promise<Array<Record<string, unknown>>> {
        const { data, error } = await supabase
            .from('agency_trucks')
            .select(`
        id,
        driver_id,
        vehicle_type,
        rc_number,
        drivers!agency_trucks_driver_id_fkey (
          id, full_name, phone, vehicle_type, home_city,
          rating, total_trips, status, is_online, active_job_id
        )
      `)
            .eq('agency_id', agencyId)
            .not('driver_id', 'is', null)

        if (error) {
            throw new UserFacingError('Failed to load drivers')
        }

        return (data as Array<Record<string, unknown>>) || []
    },

    async assignTruckToDriver(agencyId: string, truckId: string, driverId: string): Promise<void> {
        const { error } = await supabase
            .from('agency_trucks')
            .update({ driver_id: driverId })
            .eq('id', truckId)
            .eq('agency_id', agencyId)

        if (error) {
            throw new UserFacingError('Failed to assign truck')
        }
    },

    async unassignTruck(agencyId: string, truckId: string): Promise<void> {
        const { error } = await supabase
            .from('agency_trucks')
            .update({ driver_id: null })
            .eq('id', truckId)
            .eq('agency_id', agencyId)

        if (error) {
            throw new UserFacingError('Failed to unassign driver')
        }
    },

    async createPayout(agencyId: string, driverId: string, amount: number, note?: string): Promise<void> {
        const { error } = await supabase
            .from('driver_payouts')
            .insert({
                driver_id: driverId,
                agency_id: agencyId,
                amount,
                type: 'agency_pay',
                status: 'pending',
                note: note || null,
            })

        if (error) {
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
