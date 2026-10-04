import { supabase } from '../lib/supabase'
import type { Database } from '../types/database.types'
import { UserFacingError } from '../utils/userFacingError'
import { logger } from '../utils/logger'

// ============= TYPES =============

/** Canonical `trucks` table row (database.types.ts is the schema source of truth). */
export type TruckRow = Database['public']['Tables']['trucks']['Row']

/** Row returned by the `get_shipment_job_offer_tracking` RPC (supabase/migrations/20260730110000). */
export interface ShipmentJobOfferTrackingRow {
    id: string
    shipment_id: string
    status: string
    pickup_otp: string | null
    delivery_otp: string | null
    photo_loading_url: string | null
    photo_delivery_url: string | null
    /** JSONB column: object or array depending on PostgREST serialisation. */
    drivers: unknown
}

/** `job_offers` row joined with its shipment columns, as selected by driverTripsApi.
 * PostgREST returns many-to-one embeds as an object; supabase-js without Database
 * generics infers an array — both shapes are accepted and normalised. */
interface DriverTripRow {
    id: string
    shipment_id: string | null
    driver_id: string | null
    status: string
    shipments: { origin: string | null; destination: string | null; estimated_cost: number | string | null } | { origin: string | null; destination: string | null; estimated_cost: number | string | null }[] | null
    offered_at: string | null
    delivered_at: string | null
}

/** `job_offers` row joined with `shipments(estimated_cost)`, as selected by driverEarningsApi. */
interface DriverEarningsJobRow {
    delivered_at?: string | null
    shipments: { estimated_cost: number | string | null } | { estimated_cost: number | string | null }[] | null
}

export interface DashboardStats {
    activeShipments: number
    trucksCount: number
    routesToday: number
    deliveriesDone: number
}

export interface ShipmentDetail {
    id: string
    shipment_id: string
    customer_id: string | null
    truck_id: string | null
    origin: string
    destination: string
    status: 'pending' | 'in_transit' | 'delivered' | 'cancelled'
    total_weight: number
    total_volume: number
    estimated_cost: number
    driver_name: string | null
    driver_phone: string | null
    vehicle_number: string | null
    latitude: number | null
    longitude: number | null
    created_at: string
    updated_at: string
}

export interface DriverEarnings {
    total_earnings: number
    completed_trips: number
    average_per_trip: number
    current_rating: number
    last_thirty_days: number
}

export interface DriverTrip {
    id: string
    shipment_id: string | null
    driver_id: string | null
    status: string
    origin: string
    destination: string
    estimated_cost: number
    created_at: string
    delivered_at: string | null
}

export interface ManagementCounts {
    trucks: number
    cartons: number
    customers: number
}

// ============= CUSTOMER DASHBOARD API =============
export const customerDashboardApi = {
    async getDashboardStats(): Promise<DashboardStats> {
        try {
            const [trucksRes, shipmentsRes, routesRes, pendingJobsRes] = await Promise.all([
                supabase.from('trucks').select('id', { count: 'exact' }),
                supabase.from('shipments').select('id, status', { count: 'exact' }),
                supabase.from('routes').select('id', { count: 'exact' }),
                supabase.from('packing_jobs').select('id', { count: 'exact' }).eq('status', 'draft')
            ])

            const firstError = trucksRes.error || shipmentsRes.error || routesRes.error || pendingJobsRes.error
            if (firstError) throw firstError

            const shipmentRows = (shipmentsRes.data ?? []) as Array<{ id: string; status: string }>
            const activeShipments = shipmentRows.filter((s) => s.status === 'in_transit').length
            const deliveriesDone = shipmentRows.filter((s) => s.status === 'delivered').length

            return {
                activeShipments,
                trucksCount: trucksRes.count || 0,
                routesToday: routesRes.count || 0,
                deliveriesDone
            }
        } catch (error) {
            logger.error('[customerDashboardApi.getDashboardStats]', error)
            throw new UserFacingError('Failed to load dashboard statistics')
        }
    },

    async getManagementCounts(): Promise<ManagementCounts> {
        try {
            const [trucksResult, cartonsResult, customersResult] = await Promise.all([
                supabase.from('trucks').select('id', { count: 'exact', head: true }),
                supabase.from('cartons').select('id', { count: 'exact', head: true }),
                supabase.from('customers').select('id', { count: 'exact', head: true }),
            ])

            const firstError = trucksResult.error || cartonsResult.error || customersResult.error
            if (firstError) throw firstError

            return {
                trucks: trucksResult.count || 0,
                cartons: cartonsResult.count || 0,
                customers: customersResult.count || 0,
            }
        } catch (error) {
            logger.error('[customerDashboardApi.getManagementCounts]', error)
            throw new UserFacingError('Failed to load management data')
        }
    },

    async getPendingOptimizationsCount(): Promise<number> {
        const { count, error } = await supabase
            .from('packing_jobs')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'draft')

        if (error) {
            throw new UserFacingError('Failed to load pending optimizations')
        }

        return count || 0
    },
}

// ============= CUSTOMER SHIPMENTS API =============
export const customerShipmentsApi = {
    async getAll(customerId: string, filters?: { status?: string }): Promise<ShipmentDetail[]> {
        let query = supabase
            .from('shipments')
            .select('*')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })

        if (filters?.status) {
            query = query.eq('status', filters.status)
        }

        const { data, error } = await query

        if (error) {
            throw new UserFacingError('Failed to load shipments')
        }

        return (data as ShipmentDetail[]) || []
    },

    async getById(shipmentId: string): Promise<ShipmentDetail | null> {
        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('id', shipmentId)
            .single()

        if (error) {
            throw new UserFacingError('Failed to load shipment details')
        }

        return data as ShipmentDetail | null
    },

    async getHistory(customerId: string, limit = 20): Promise<ShipmentDetail[]> {
        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('customer_id', customerId)
            .in('status', ['delivered', 'cancelled'])
            .order('updated_at', { ascending: false })
            .limit(limit)

        if (error) {
            throw new UserFacingError('Failed to load shipment history')
        }

        return (data as ShipmentDetail[]) || []
    },

    async create(shipment: Omit<ShipmentDetail, 'id' | 'created_at' | 'updated_at'>): Promise<ShipmentDetail> {
        const { data, error } = await supabase
            .from('shipments')
            .insert(shipment)
            .select()
            .single()

        if (error) {
            throw new UserFacingError('Failed to create shipment')
        }

        return data as ShipmentDetail
    },

    async updateStatus(shipmentId: string, status: string): Promise<ShipmentDetail> {
        const { data, error } = await supabase
            .from('shipments')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', shipmentId)
            .select()
            .single()

        if (error) {
            throw new UserFacingError('Failed to update shipment status')
        }

        return data as ShipmentDetail
    },

    async updateLocation(shipmentId: string, latitude: number, longitude: number): Promise<ShipmentDetail> {
        const { data, error } = await supabase
            .from('shipments')
            .update({ latitude, longitude, updated_at: new Date().toISOString() })
            .eq('id', shipmentId)
            .select()
            .single()

        if (error) {
            throw new UserFacingError('Failed to update shipment location')
        }

        return data as ShipmentDetail
    },

    async getCreatedByUser(userId: string): Promise<ShipmentDetail[]> {
        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('created_by', userId)
            .order('created_at', { ascending: false })

        if (error) {
            throw new UserFacingError('Failed to load shipment history')
        }

        return (data as ShipmentDetail[]) || []
    },

    async createBooking(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
        const { data, error } = await supabase
            .from('shipments')
            .insert(payload)
            .select()
            .single()

        if (error) {
            throw new UserFacingError('Failed to create booking')
        }

        return (data as Record<string, unknown>) || {}
    },

    async updateEWayBill(shipmentId: string, userId: string, ewayBillData: Record<string, unknown>): Promise<void> {
        const { error } = await supabase
            .from('shipments')
            .update({ eway_bill_data: ewayBillData })
            .eq('id', shipmentId)
            .eq('created_by', userId)

        if (error) {
            throw new UserFacingError('Failed to save e-way bill')
        }
    }
}

// ============= CUSTOMER TRACKING API =============
export const customerTrackingApi = {
    async trackShipment(shipmentId: string): Promise<ShipmentDetail | null> {
        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('id', shipmentId)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to track shipment')
        }

        return data as ShipmentDetail | null
    },

    async getShipmentByReference(shipmentRef: string): Promise<ShipmentDetail | null> {
        const { data, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('shipment_id', shipmentRef)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to find shipment')
        }

        return data as ShipmentDetail | null
    },

    async getActiveOfferDrivers(shipmentIds: string[]): Promise<Array<{ shipment_id: string; driver_id: string | null }>> {
        const { data, error } = await supabase
            .from('job_offers')
            .select('shipment_id, driver_id')
            .in('shipment_id', shipmentIds)
            .not('driver_id', 'is', null)
            .in('status', ['accepted', 'pickup_arrived', 'in_transit', 'delivery_arrived'])

        if (error) {
            throw new UserFacingError('Failed to load active driver assignments')
        }

        return (data as Array<{ shipment_id: string; driver_id: string | null }>) || []
    },

    async getLatestDriverLocations(driverIds: string[]): Promise<Array<{ driver_id: string; lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null }>> {
        const { data, error } = await supabase
            .from('driver_locations')
            .select('driver_id, lat, lng, updated_at, speed_kmh')
            .in('driver_id', driverIds)
            .order('updated_at', { ascending: false })

        if (error) {
            throw new UserFacingError('Failed to load driver locations')
        }

        return (data as Array<{ driver_id: string; lat: number | null; lng: number | null; updated_at: string; speed_kmh: number | null }>) || []
    },

    async getLatestJobOfferByShipmentId(shipmentId: string): Promise<ShipmentJobOfferTrackingRow | null> {
        const { data, error } = await supabase.rpc('get_shipment_job_offer_tracking', {
            p_shipment_id: shipmentId,
        })

        if (error) {
            throw new UserFacingError('Failed to load shipment details')
        }

        const row = Array.isArray(data) ? data[0] : data
        return (row as ShipmentJobOfferTrackingRow | null) || null
    }
}

// ============= DRIVER EARNINGS API =============
export const driverEarningsApi = {
    async getEarnings(driverId: string): Promise<DriverEarnings> {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

            const [earningsRes, tripsRes] = await Promise.all([
                // job_offers has no created_at column (schema truth: offered_at /
                // delivered_at). Earnings in the last 30 days are the trips
                // DELIVERED in that window, so select delivered_at.
                supabase.from('job_offers').select('delivered_at, shipments(estimated_cost)').eq('driver_id', driverId).eq('status', 'delivered'),
                supabase.from('drivers').select('rating').eq('id', driverId).single(),
            ])

            if (earningsRes.error || tripsRes.error) {
                throw earningsRes.error || tripsRes.error
            }

            const trips = (earningsRes.data ?? []) as DriverEarningsJobRow[]
            const tripCost = (trip: DriverEarningsJobRow) => {
                const shipment = Array.isArray(trip.shipments) ? trip.shipments[0] : trip.shipments
                return Number(shipment?.estimated_cost ?? 0)
            }
            const totalEarnings = trips.reduce((sum: number, trip) => sum + tripCost(trip), 0)

            const thirtyDayEarnings = trips
                .filter((trip) => typeof trip.delivered_at === 'string' && trip.delivered_at >= thirtyDaysAgo)
                .reduce((sum: number, trip) => sum + tripCost(trip), 0)

            return {
                total_earnings: totalEarnings,
                completed_trips: trips.length,
                average_per_trip: trips.length > 0 ? totalEarnings / trips.length : 0,
                current_rating: tripsRes.data?.rating ?? 0,
                last_thirty_days: thirtyDayEarnings,
            }
        } catch (error) {
            logger.error('[driverEarningsApi.getEarnings]', error)
            throw new UserFacingError('Failed to load earnings data')
        }
    },

    async getBalanceSnapshot(driverId: string): Promise<{
        paid: number
        approved: number
        pending: number
        totalDelivered: number
        payouts: Array<{ amount: number; status: string }>
    }> {
        const [payoutsRes, deliveredRes] = await Promise.all([
            supabase
                .from('driver_payouts')
                .select('amount, status')
                .eq('driver_id', driverId),
            supabase
                .from('job_offers')
                .select('shipments(estimated_cost)')
                .eq('driver_id', driverId)
                .eq('status', 'delivered'),
        ])

        if (payoutsRes.error || deliveredRes.error) {
            throw new UserFacingError('Failed to load balance')
        }

        const payouts = (payoutsRes.data as Array<{ amount: number; status: string }>) || []
        const paid = payouts.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount ?? 0), 0)
        const approved = payouts.filter(p => p.status === 'approved').reduce((s, p) => s + (p.amount ?? 0), 0)
        const pending = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount ?? 0), 0)
        const totalDelivered = ((deliveredRes.data ?? []) as DriverEarningsJobRow[]).reduce((sum, job) => {
            const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
            return sum + Number(shipment?.estimated_cost ?? 0)
        }, 0)

        return { paid, approved, pending, totalDelivered, payouts }
    },

    async requestPayout(driverId: string, amount: number): Promise<void> {
        const { error } = await supabase
            .from('driver_payouts')
            .insert({
                driver_id: driverId,
                amount,
                status: 'pending',
                requested_at: new Date().toISOString(),
            })

        if (error) {
            throw new UserFacingError('Failed to submit withdrawal request')
        }
    }
}

// ============= DRIVER TRIPS API =============
/** Normalises a raw job_offers row (object or array shipment embed) into DriverTrip. */
function toDriverTrip(trip: DriverTripRow): DriverTrip {
    const shipment = Array.isArray(trip.shipments) ? trip.shipments[0] : trip.shipments
    return {
        id: trip.id,
        shipment_id: trip.shipment_id,
        driver_id: trip.driver_id,
        status: trip.status,
        origin: shipment?.origin ?? '',
        destination: shipment?.destination ?? '',
        estimated_cost: Number(shipment?.estimated_cost ?? 0),
        created_at: trip.offered_at ?? '',
        delivered_at: trip.delivered_at,
    }
}

export const driverTripsApi = {
    async getAll(driverId: string, filters?: { status?: string }): Promise<DriverTrip[]> {
        let query = supabase
            .from('job_offers')
            .select('id, shipment_id, driver_id, status, shipments(origin, destination, estimated_cost), offered_at, delivered_at')
            .eq('driver_id', driverId)
            .order('offered_at', { ascending: false })

        if (filters?.status) {
            query = query.eq('status', filters.status)
        }

        const { data, error } = await query

        if (error) {
            throw new UserFacingError('Failed to load trips')
        }

        return ((data ?? []) as DriverTripRow[]).map(toDriverTrip)
    },

    async getById(tripId: string): Promise<DriverTrip | null> {
        const { data, error } = await supabase
            .from('job_offers')
            .select('id, shipment_id, driver_id, status, shipments(origin, destination, estimated_cost), offered_at, delivered_at')
            .eq('id', tripId)
            .single()

        if (error) {
            throw new UserFacingError('Failed to load trip details')
        }

        const trip = data as DriverTripRow
        return toDriverTrip(trip)
    },

    async updateStatus(tripId: string, status: string): Promise<DriverTrip> {
        const updateData: { status: string; delivered_at?: string } = { status }
        if (status === 'delivered') {
            updateData.delivered_at = new Date().toISOString()
        }

        const { data, error } = await supabase
            .from('job_offers')
            .update(updateData)
            .eq('id', tripId)
            .select('id, shipment_id, driver_id, status, shipments(origin, destination, estimated_cost), offered_at, delivered_at')
            .single()

        if (error) {
            throw new UserFacingError('Failed to update trip status')
        }

        const trip = data as DriverTripRow
        return toDriverTrip(trip)
    },

    async getDriverIdByUserId(userId: string): Promise<string | null> {
        const { data, error } = await supabase
            .from('drivers')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load driver profile')
        }

        return (data as { id: string } | null)?.id ?? null
    },

    async getDeliveredTrips(driverId: string, period: 'week' | 'month' | 'total'): Promise<Array<Record<string, unknown>>> {
        let query = supabase
            .from('job_offers')
            .select('id, delivered_at, status, shipments(shipment_id, origin, destination, estimated_cost)')
            .eq('driver_id', driverId)
            .eq('status', 'delivered')
            .order('delivered_at', { ascending: false })

        if (period !== 'total') {
            const days = period === 'week' ? 7 : 30
            const since = new Date(Date.now() - days * 86400000).toISOString()
            query = query.gte('delivered_at', since)
        }

        const { data, error } = await query.limit(100)

        if (error) {
            throw new UserFacingError('Failed to load earnings')
        }

        return (data as Array<Record<string, unknown>>) || []
    },

    async getHistory(driverId: string, filter: 'all' | 'delivered' | 'declined'): Promise<Array<Record<string, unknown>>> {
        let query = supabase
            .from('job_offers')
            .select('id, offered_at, responded_at, status, shipments(origin, destination, estimated_cost, total_weight)')
            .eq('driver_id', driverId)
            .in('status', ['delivered', 'accepted', 'declined', 'expired', 'cancelled'])
            .order('offered_at', { ascending: false })
            .limit(50)

        if (filter !== 'all') {
            query = query.eq('status', filter)
        }

        const { data, error } = await query

        if (error) {
            throw new UserFacingError('Failed to load trip history')
        }

        return (data as Array<Record<string, unknown>>) || []
    },

    async getTripByIdForDriver(jobId: string, driverId: string): Promise<Record<string, unknown> | null> {
        const { data, error } = await supabase
            .from('job_offers')
            .select(`
        id, shipment_id, status,
        photo_loading_url, photo_delivery_url,
        pickup_arrived_at, journey_started_at, delivery_arrived_at, delivered_at,
        shipments(shipment_id, origin, destination, total_weight, estimated_cost, customer_id)
      `)
            .eq('id', jobId)
            .eq('driver_id', driverId)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load trip details')
        }

        return (data as Record<string, unknown> | null) ?? null
    }
}

// ============= DRIVER DASHBOARD API =============

/** Authoritative offer + active-job state returned by respond_to_job_offer (TO-129). */
export interface JobOfferResponse {
    offerId: string
    offerStatus: string
    respondedAt: string | null
    activeJobId: string | null
}

interface JobOfferResponseRow {
    offer_id?: unknown
    offer_status?: unknown
    responded_at?: unknown
    active_job_id?: unknown
}

/**
 * Bounded mapping from the controlled respond_to_job_offer exceptions
 * (supabase/migrations/20261003010000) to approved user-facing messages.
 * Unmapped provider internals never reach the UI (TO-131 contract).
 */
const JOB_OFFER_RESPONSE_ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
    'A response decision is required': 'Failed to respond to job',
    'Driver profile not found for the signed-in user': 'Your driver profile could not be found. Please sign in again.',
    'Job offer not found or access denied': 'This job offer is no longer available.',
    'Driver account is not approved to respond to offers': 'Your driver account is not approved to accept jobs yet.',
    'Job offer has expired': 'This job offer has expired.',
    'Job offer has already been accepted': 'This job offer was already accepted.',
    'Job offer has already been declined': 'This job offer was already declined.',
    'Job offer is no longer available': 'This job offer is no longer available.',
    'Driver already has an active trip': 'You already have an active trip. Complete it before accepting a new one.',
})

function resolveJobOfferResponseMessage(error: unknown): string {
    const message = (error as { message?: unknown } | null)?.message
    if (typeof message === 'string') {
        return JOB_OFFER_RESPONSE_ERROR_MESSAGES[message] ?? 'Failed to respond to job'
    }
    return 'Failed to respond to job'
}

export const driverDashboardApi = {
    async getIncomingJobById(jobOfferId: string): Promise<Record<string, unknown> | null> {
        const { data, error } = await supabase
            .from('job_offers')
            .select('id, shipment_id, offered_at, expires_at, status, shipments(origin, destination, total_weight, estimated_cost)')
            .eq('id', jobOfferId)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load job offer details')
        }

        return (data as Record<string, unknown> | null) ?? null
    },

    async getPendingOffer(driverId: string): Promise<Record<string, unknown> | null> {
        const { data, error } = await supabase
            .from('job_offers')
            .select('id, shipment_id, offered_at, expires_at, status, shipments(origin, destination, total_weight, estimated_cost)')
            .eq('driver_id', driverId)
            .eq('status', 'pending')
            .gt('expires_at', new Date().toISOString())
            .order('expires_at', { ascending: true })
            .limit(1)
            .maybeSingle()

        if (error) {
            throw new UserFacingError('Failed to load pending job offer')
        }

        return (data as Record<string, unknown> | null) ?? null
    },

    async getTripHistory(driverId: string): Promise<Array<Record<string, unknown>>> {
        const { data, error } = await supabase
            .from('job_offers')
            .select('id, offered_at, responded_at, delivered_at, status, shipments(origin, destination, estimated_cost)')
            .eq('driver_id', driverId)
            .in('status', ['accepted', 'declined', 'expired', 'delivered'])
            .order('offered_at', { ascending: false })
            .limit(10)

        if (error) {
            throw new UserFacingError('Failed to load trip history')
        }

        return (data as Array<Record<string, unknown>>) || []
    },

    async getPayoutHistory(driverId: string): Promise<Array<{ id: string; amount: number; status: string; requested_at: string }>> {
        const { data, error } = await supabase
            .from('driver_payouts')
            .select('id, amount, status, requested_at')
            .eq('driver_id', driverId)
            .order('requested_at', { ascending: false })
            .limit(5)

        if (error) {
            throw new UserFacingError('Failed to load payout history')
        }

        return (data as Array<{ id: string; amount: number; status: string; requested_at: string }>) || []
    },

    async setDriverOnlineStatus(driverId: string, isOnline: boolean): Promise<void> {
        const { error } = await supabase
            .from('drivers')
            .update({ is_online: isOnline })
            .eq('id', driverId)

        if (error) {
            throw new UserFacingError('Failed to update status')
        }
    },

    /**
     * Responds to a pending job offer through the trusted server transaction
     * (TO-129): the server verifies the signed-in driver, offer ownership,
     * pending state, expiry, driver approval and conflicting active trip, then
     * writes the offer status and — on acceptance — the driver's active job in
     * one atomic, idempotent transaction. Duplicate accept/reject replays
     * return the authoritative state instead of writing again; every rejected
     * path raises, so an empty (zero-row) result is never reported as success.
     */
    async respondToJobOffer(jobId: string, accept: boolean, declineReason?: string): Promise<JobOfferResponse> {
        const { data, error } = await supabase.rpc('respond_to_job_offer', {
            p_job_offer_id: jobId,
            p_accept: accept,
            p_decline_reason: declineReason ?? null,
        })

        if (error) {
            throw new UserFacingError(resolveJobOfferResponseMessage(error))
        }

        const row = (Array.isArray(data) ? data[0] : data) as JobOfferResponseRow | undefined
        if (!row || typeof row.offer_id !== 'string' || typeof row.offer_status !== 'string') {
            // A zero-row response means nothing was authorized or written.
            throw new UserFacingError('Failed to respond to job')
        }

        return {
            offerId: row.offer_id,
            offerStatus: row.offer_status,
            respondedAt: typeof row.responded_at === 'string' ? row.responded_at : null,
            activeJobId: typeof row.active_job_id === 'string' ? row.active_job_id : null,
        }
    },
}

// ============= TRUCKS API =============
export const trucksApi = {
    async getAll(): Promise<TruckRow[]> {
        const { data, error } = await supabase
            .from('trucks')
            .select('*')
            .order('name')

        if (error) {
            throw new UserFacingError('Failed to load trucks')
        }

        return ((data ?? []) as TruckRow[])
    },

    async getById(truckId: string): Promise<TruckRow | null> {
        const { data, error } = await supabase
            .from('trucks')
            .select('*')
            .eq('id', truckId)
            .single()

        if (error) {
            throw new UserFacingError('Failed to load truck details')
        }

        return data
    }
}
