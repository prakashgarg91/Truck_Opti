import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

// ============= TYPES =============
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

            const activeShipments = shipmentsRes.data?.filter((s: any) => s.status === 'in_transit').length || 0
            const deliveriesDone = shipmentsRes.data?.filter((s: any) => s.status === 'delivered').length || 0

            return {
                activeShipments,
                trucksCount: trucksRes.count || 0,
                routesToday: routesRes.count || 0,
                deliveriesDone
            }
        } catch (error) {
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

    async getLatestJobOfferByShipmentId(shipmentId: string): Promise<Record<string, any> | null> {
        const { data, error } = await supabase.rpc('get_shipment_job_offer_tracking', {
            p_shipment_id: shipmentId,
        })

        if (error) {
            throw new UserFacingError('Failed to load shipment details')
        }

        const row = Array.isArray(data) ? data[0] : data
        return (row as Record<string, any>) || null
    }
}

// ============= DRIVER EARNINGS API =============
export const driverEarningsApi = {
    async getEarnings(driverId: string): Promise<DriverEarnings> {
        try {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

            const [earningsRes, tripsRes] = await Promise.all([
                supabase.from('job_offers').select('shipments(estimated_cost)').eq('driver_id', driverId).eq('status', 'delivered'),
                supabase.from('drivers').select('rating').eq('id', driverId).single(),
            ])

            if (earningsRes.error || tripsRes.error) {
                throw earningsRes.error || tripsRes.error
            }

            const trips = earningsRes.data ?? []
            const totalEarnings = trips.reduce((sum: number, trip: any) => {
                const shipment = Array.isArray(trip.shipments) ? trip.shipments[0] : trip.shipments
                return sum + Number(shipment?.estimated_cost ?? 0)
            }, 0)

            const thirtyDayEarnings = trips
                .filter((trip: any) => trip.created_at >= thirtyDaysAgo)
                .reduce((sum: number, trip: any) => {
                    const shipment = Array.isArray(trip.shipments) ? trip.shipments[0] : trip.shipments
                    return sum + Number(shipment?.estimated_cost ?? 0)
                }, 0)

            return {
                total_earnings: totalEarnings,
                completed_trips: trips.length,
                average_per_trip: trips.length > 0 ? totalEarnings / trips.length : 0,
                current_rating: tripsRes.data?.rating ?? 0,
                last_thirty_days: thirtyDayEarnings,
            }
        } catch (error) {
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
        const totalDelivered = ((deliveredRes.data ?? []) as any[]).reduce((sum, job) => {
            const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
            return sum + Number((shipment as Record<string, unknown> | null | undefined)?.estimated_cost ?? 0)
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
export const driverTripsApi = {
    async getAll(driverId: string, filters?: { status?: string }): Promise<DriverTrip[]> {
        let query = supabase
            .from('job_offers')
            .select('id, shipment_id, driver_id, status, shipments(origin, destination, estimated_cost), created_at, delivered_at')
            .eq('driver_id', driverId)
            .order('created_at', { ascending: false })

        if (filters?.status) {
            query = query.eq('status', filters.status)
        }

        const { data, error } = await query

        if (error) {
            throw new UserFacingError('Failed to load trips')
        }

        return (data as any[])?.map((trip: any) => ({
            id: trip.id,
            shipment_id: trip.shipment_id,
            driver_id: trip.driver_id,
            status: trip.status,
            origin: trip.shipments?.origin ?? '',
            destination: trip.shipments?.destination ?? '',
            estimated_cost: trip.shipments?.estimated_cost ?? 0,
            created_at: trip.created_at,
            delivered_at: trip.delivered_at,
        })) || []
    },

    async getById(tripId: string): Promise<DriverTrip | null> {
        const { data, error } = await supabase
            .from('job_offers')
            .select('id, shipment_id, driver_id, status, shipments(origin, destination, estimated_cost), created_at, delivered_at')
            .eq('id', tripId)
            .single()

        if (error) {
            throw new UserFacingError('Failed to load trip details')
        }

        const trip = data as any
        return {
            id: trip.id,
            shipment_id: trip.shipment_id,
            driver_id: trip.driver_id,
            status: trip.status,
            origin: trip.shipments?.origin ?? '',
            destination: trip.shipments?.destination ?? '',
            estimated_cost: trip.shipments?.estimated_cost ?? 0,
            created_at: trip.created_at,
            delivered_at: trip.delivered_at,
        }
    },

    async updateStatus(tripId: string, status: string): Promise<DriverTrip> {
        const updateData: any = { status }
        if (status === 'delivered') {
            updateData.delivered_at = new Date().toISOString()
        }

        const { data, error } = await supabase
            .from('job_offers')
            .update(updateData)
            .eq('id', tripId)
            .select('id, shipment_id, driver_id, status, shipments(origin, destination, estimated_cost), created_at, delivered_at')
            .single()

        if (error) {
            throw new UserFacingError('Failed to update trip status')
        }

        const trip = data as any
        return {
            id: trip.id,
            shipment_id: trip.shipment_id,
            driver_id: trip.driver_id,
            status: trip.status,
            origin: trip.shipments?.origin ?? '',
            destination: trip.shipments?.destination ?? '',
            estimated_cost: trip.shipments?.estimated_cost ?? 0,
            created_at: trip.created_at,
            delivered_at: trip.delivered_at,
        }
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

    async respondToJobOffer(jobId: string, accept: boolean): Promise<void> {
        const { error } = await supabase
            .from('job_offers')
            .update({
                status: accept ? 'accepted' : 'declined',
                responded_at: new Date().toISOString(),
            })
            .eq('id', jobId)

        if (error) {
            throw new UserFacingError('Failed to respond to job')
        }
    },

    async setActiveJob(driverId: string, jobId: string): Promise<void> {
        const { error } = await supabase
            .from('drivers')
            .update({ active_job_id: jobId })
            .eq('id', driverId)

        if (error) {
            throw new UserFacingError('Failed to activate job')
        }
    },
}

// ============= TRUCKS API =============
export const trucksApi = {
    async getAll(): Promise<any[]> {
        const { data, error } = await supabase
            .from('trucks')
            .select('*')
            .order('name')

        if (error) {
            throw new UserFacingError('Failed to load trucks')
        }

        return (data as any[]) || []
    },

    async getById(truckId: string): Promise<any | null> {
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
