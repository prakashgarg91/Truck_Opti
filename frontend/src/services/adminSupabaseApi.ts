import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

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
    full_name: string | null
    email: string | null
    role: string | null
    status: string | null
    created_at: string | null
}

// ============= AGENCIES API =============
export const adminAgenciesApi = {
    async getByStatus(status: 'pending' | 'approved' | 'rejected' | 'suspended'): Promise<Agency[]> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .select('*')
            .eq('status', status)
            .order('created_at', { ascending: false })

        if (error) {
            throw new UserFacingError('Failed to load agencies')
        }

        return (data as Agency[]) || []
    },

    async getCountsByStatus(): Promise<Record<string, number>> {
        const statuses = ['pending', 'approved', 'rejected', 'suspended'] as const
        const results = await Promise.all(
            statuses.map(status =>
                supabase.from('transport_agencies').select('id', { count: 'exact', head: true }).eq('status', status)
            )
        )

        const counts: Record<string, number> = {}
        statuses.forEach((status, i) => {
            counts[status] = results[i].count || 0
        })

        return counts
    },

    async approve(agencyId: string): Promise<Agency> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .update({
                status: 'approved',
                approved_at: new Date().toISOString(),
                rejection_reason: null,
            })
            .eq('id', agencyId)
            .select('*')
            .single()

        if (error) {
            throw new UserFacingError('Failed to approve agency. Please try again.')
        }

        return data as Agency
    },

    async reject(agencyId: string, rejectionReason: string): Promise<Agency> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .update({
                status: 'rejected',
                rejection_reason: rejectionReason,
            })
            .eq('id', agencyId)
            .select('*')
            .single()

        if (error) {
            throw new UserFacingError('Failed to reject agency. Please try again.')
        }

        return data as Agency
    },

    async suspend(agencyId: string): Promise<Agency> {
        const { data, error } = await supabase
            .from('transport_agencies')
            .update({ status: 'suspended' })
            .eq('id', agencyId)
            .select('*')
            .single()

        if (error) {
            throw new UserFacingError('Failed to suspend agency. Please try again.')
        }

        return data as Agency
    }
}

// ============= ADMIN PAYOUTS API =============
export const adminPayoutsApi = {
    async getAll(): Promise<DriverPayout[]> {
        const { data, error } = await supabase
            .from('driver_payouts')
            .select('*, drivers(full_name, phone)')
            .order('requested_at', { ascending: false })

        if (error) {
            throw new UserFacingError('Failed to load payouts')
        }

        return (data as DriverPayout[]) || []
    },

    async approve(payoutId: string): Promise<DriverPayout> {
        const { data, error } = await supabase
            .from('driver_payouts')
            .update({
                status: 'approved',
                processed_at: new Date().toISOString(),
            })
            .eq('id', payoutId)
            .select('*, drivers(full_name, phone)')
            .single()

        if (error) {
            throw new UserFacingError('Failed to approve payout. Please try again.')
        }

        return data as DriverPayout
    },

    async reject(payoutId: string, rejectionNote: string): Promise<DriverPayout> {
        const { data, error } = await supabase
            .from('driver_payouts')
            .update({
                status: 'rejected',
                note: rejectionNote,
                processed_at: new Date().toISOString(),
            })
            .eq('id', payoutId)
            .select('*, drivers(full_name, phone)')
            .single()

        if (error) {
            throw new UserFacingError('Failed to reject payout. Please try again.')
        }

        return data as DriverPayout
    },

    async markAsPaid(payoutId: string): Promise<DriverPayout> {
        const { data, error } = await supabase
            .from('driver_payouts')
            .update({
                status: 'paid',
                processed_at: new Date().toISOString(),
            })
            .eq('id', payoutId)
            .select('*, drivers(full_name, phone)')
            .single()

        if (error) {
            throw new UserFacingError('Failed to mark payout as paid. Please try again.')
        }

        return data as DriverPayout
    }
}

// ============= ADMIN DASHBOARD API =============
export const adminDashboardApi = {
    async getDashboardData(): Promise<AdminDashboardData> {
        try {
            // Fetch all required data in parallel
            const [agencyJobsRes, agencyShipmentRefsRes, driverJobsRes, directBookingCandidatesRes, agenciesRes, driversRes, shipmentsRes] = await Promise.all([
                supabase
                    .from('agency_jobs')
                    .select('id, agency_id, shipment_id, fare, created_at, updated_at, shipments(origin, destination, shipment_id)')
                    .eq('status', 'delivered')
                    .order('updated_at', { ascending: false }),
                supabase
                    .from('agency_jobs')
                    .select('shipment_id'),
                supabase
                    .from('job_offers')
                    .select('id, shipment_id, driver_id, delivered_at, shipments(origin, destination, shipment_id, estimated_cost)')
                    .eq('status', 'delivered')
                    .order('delivered_at', { ascending: false }),
                supabase
                    .from('shipments')
                    .select('id, shipment_id, origin, destination, estimated_cost, status, created_at, updated_at, created_by')
                    .not('created_by', 'is', null)
                    .order('created_at', { ascending: false }),
                supabase.from('transport_agencies').select('id', { count: 'exact', head: true }),
                supabase.from('drivers').select('id', { count: 'exact', head: true }),
                supabase.from('shipments').select('id', { count: 'exact', head: true }),
            ])

            const analyticsError = agencyJobsRes.error || agencyShipmentRefsRes.error || driverJobsRes.error || directBookingCandidatesRes.error || agenciesRes.error || driversRes.error || shipmentsRes.error
            if (analyticsError) {
                throw analyticsError
            }

            // Process the data
            const agencyJobsData = agencyJobsRes.data ?? []
            const driverJobsData = driverJobsRes.data ?? []
            const directBookingCandidates = directBookingCandidatesRes.data ?? []

            const agencyShipmentIds = new Set(
                ((agencyShipmentRefsRes.data ?? []) as Array<{ shipment_id: string | null }>)
                    .map((row) => row.shipment_id)
                    .filter((shipmentId): shipmentId is string => Boolean(shipmentId))
            )

            const directAppBookings = directBookingCandidates.filter((shipment: any) => !agencyShipmentIds.has(shipment.id))

            const agencyRevenue = agencyJobsData.reduce((sum, job: any) => sum + Number(job.fare ?? 0), 0)
            const driverRevenue = driverJobsData.reduce((sum, job: any) => {
                const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
                return sum + Number(shipment?.estimated_cost ?? 0)
            }, 0)

            const directAppShipmentIds = new Set(directAppBookings.map((booking: any) => booking.id))
            const directAppRevenue = driverJobsData.reduce((sum, job: any) => {
                if (!job.shipment_id || !directAppShipmentIds.has(job.shipment_id)) {
                    return sum
                }
                const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
                return sum + Number(shipment?.estimated_cost ?? 0)
            }, 0)

            const directAppBookingValue = directAppBookings.reduce((sum: number, booking: any) => sum + Number(booking.estimated_cost ?? 0), 0)
            const totalRevenue = agencyRevenue + driverRevenue

            return {
                totalRevenue,
                agencyRevenue,
                driverRevenue,
                directAppRevenue,
                directAppBookingValue,
                directAppBookingCount: directAppBookings.length,
                totalAgencies: agenciesRes.count ?? 0,
                totalDrivers: driversRes.count ?? 0,
                totalShipments: shipmentsRes.count ?? 0,
                platformFee: totalRevenue * 0.10,
            }
        } catch (error) {
            throw new UserFacingError('Failed to load dashboard analytics. Please try again.')
        }
    },

    async getRecentJobs(limit = 20): Promise<RevenueEvent[]> {
        try {
            const [agencyJobsRes, driverJobsRes] = await Promise.all([
                supabase
                    .from('agency_jobs')
                    .select('id, agency_id, shipment_id, fare, created_at, updated_at, shipments(origin, destination, shipment_id)')
                    .eq('status', 'delivered')
                    .order('updated_at', { ascending: false })
                    .limit(limit),
                supabase
                    .from('job_offers')
                    .select('id, shipment_id, driver_id, delivered_at, shipments(origin, destination, shipment_id, estimated_cost)')
                    .eq('status', 'delivered')
                    .order('delivered_at', { ascending: false })
                    .limit(limit),
            ])

            if (agencyJobsRes.error || driverJobsRes.error) {
                throw agencyJobsRes.error || driverJobsRes.error
            }

            // Get agency and driver names
            const agencyIds = Array.from(new Set(
                (agencyJobsRes.data ?? [])
                    .map((job: any) => job.agency_id)
                    .filter((id): id is string => Boolean(id))
            ))

            const driverIds = Array.from(new Set(
                (driverJobsRes.data ?? [])
                    .map((job: any) => job.driver_id)
                    .filter((id): id is string => Boolean(id))
            ))

            const agenciesData: Array<{ id: string; company_name: string | null }> = agencyIds.length > 0
                ? (await supabase.from('transport_agencies').select('id, company_name').in('id', agencyIds)).data ?? []
                : []

            const driversData: Array<{ id: string; full_name: string | null; phone: string | null }> = driverIds.length > 0
                ? (await supabase.from('drivers').select('id, full_name, phone').in('id', driverIds)).data ?? []
                : []

            const agencyNameById = new Map(agenciesData.map((agency) => [agency.id, agency.company_name ?? 'Unknown Agency']))
            const driverNameById = new Map(driversData.map((driver) => [driver.id, driver.full_name || driver.phone || 'Unknown Driver']))

            const events: RevenueEvent[] = [
                ...(agencyJobsRes.data ?? []).map((job: any) => {
                    const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
                    return {
                        id: job.id,
                        source: 'Agency Network',
                        ownerName: job.agency_id ? (agencyNameById.get(job.agency_id) ?? 'Unknown Agency') : 'Unknown Agency',
                        origin: shipment?.origin ?? '',
                        destination: shipment?.destination ?? '',
                        amount: Number(job.fare ?? 0),
                        eventDate: job.updated_at ?? job.created_at,
                    }
                }),
                ...(driverJobsRes.data ?? []).map((job: any) => {
                    const shipment = Array.isArray(job.shipments) ? job.shipments[0] : job.shipments
                    return {
                        id: job.id,
                        source: 'Driver Network',
                        ownerName: job.driver_id ? (driverNameById.get(job.driver_id) ?? 'Unknown Driver') : 'Unknown Driver',
                        origin: shipment?.origin ?? '',
                        destination: shipment?.destination ?? '',
                        amount: Number(shipment?.estimated_cost ?? 0),
                        eventDate: job.delivered_at ?? new Date().toISOString(),
                    }
                }),
            ]

            return events.sort((left, right) => new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime()).slice(0, limit)
        } catch (error) {
            throw new UserFacingError('Failed to load recent jobs. Please try again.')
        }
    }
}

// ============= CONSOLIDATED ADMIN API =============
export const adminSupabaseApi = {
    async getAdminDashboardData(): Promise<AdminDashboardData> {
        return adminDashboardApi.getDashboardData()
    },

    async getAdminUsers(): Promise<AdminUser[]> {
        return []
    },

    async getAdminAgencies(status: 'pending' | 'approved' | 'rejected' | 'suspended'): Promise<Agency[]> {
        return adminAgenciesApi.getByStatus(status)
    },

    async getAdminPayouts(): Promise<DriverPayout[]> {
        return adminPayoutsApi.getAll()
    },

    async deleteUser(_userId: string): Promise<void> {
        throw new UserFacingError('User deletion is not available in this client module.')
    },

    async banUser(_userId: string): Promise<void> {
        throw new UserFacingError('User banning is not available in this client module.')
    },

    async unbanUser(_userId: string): Promise<void> {
        throw new UserFacingError('User unban is not available in this client module.')
    },

    async getContactInquiries(): Promise<ContactInquiry[]> {
        const { data, error } = await supabase
            .from('contact_inquiries')
            .select('*')
            .order('created_at', { ascending: false })

        if (error) {
            throw new UserFacingError('Unable to load contact inquiries right now. Please try again.')
        }

        return (data as ContactInquiry[]) || []
    },

    async resolveContactInquiry(id: string): Promise<void> {
        const { error } = await supabase
            .from('contact_inquiries')
            .update({ status: 'resolved' })
            .eq('id', id)

        if (error) {
            throw new UserFacingError('Unable to update this inquiry right now. Please try again.')
        }
    },

    async getDriversByStatus(status: 'pending' | 'approved' | 'rejected' | 'suspended'): Promise<any[]> {
        const { data, error } = await supabase
            .from('drivers')
            .select('*')
            .eq('status', status)
            .order('created_at', { ascending: false })

        if (error) {
            throw new UserFacingError('Unable to load drivers right now. Please try again.')
        }

        return (data as any[]) || []
    },
}
