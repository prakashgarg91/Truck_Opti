import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAdminContext,
} from '../_shared/portal-auth.ts'

type DashboardRequest = { action: 'snapshot'; limit?: number }

function parseRequestBody(body: unknown): DashboardRequest {
  if (!isRecord(body) || body.action !== 'snapshot') {
    throw new RequestError('A valid admin action is required.')
  }

  if (body.limit !== undefined && (typeof body.limit !== 'number' || !Number.isFinite(body.limit) || body.limit < 1)) {
    throw new RequestError('limit must be a positive number when provided.')
  }

  return {
    action: 'snapshot',
    limit: typeof body.limit === 'number' ? Math.floor(body.limit) : undefined,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceClient } = await requireAdminContext(req.headers.get('Authorization'))
    const { limit = 20 } = parseRequestBody(await req.json())

    const [agencyJobsRes, agencyShipmentRefsRes, driverJobsRes, directBookingCandidatesRes, agenciesRes, driversRes, shipmentsRes, recentAgencyJobsRes, recentDriverJobsRes] = await Promise.all([
      serviceClient
        .from('agency_jobs')
        .select('id, agency_id, shipment_id, fare')
        .eq('status', 'delivered'),
      serviceClient
        .from('agency_jobs')
        .select('shipment_id'),
      serviceClient
        .from('job_offers')
        .select('id, shipment_id, driver_id, shipments(origin, destination, shipment_id, estimated_cost)')
        .eq('status', 'delivered'),
      serviceClient
        .from('shipments')
        .select('id, shipment_id, origin, destination, estimated_cost, status, created_at, updated_at, created_by')
        .not('created_by', 'is', null),
      serviceClient.from('transport_agencies').select('id', { count: 'exact', head: true }),
      serviceClient.from('drivers').select('id', { count: 'exact', head: true }),
      serviceClient.from('shipments').select('id', { count: 'exact', head: true }),
      serviceClient
        .from('agency_jobs')
        .select('id, agency_id, fare, created_at, updated_at, shipments(origin, destination, shipment_id)')
        .eq('status', 'delivered')
        .order('updated_at', { ascending: false })
        .limit(limit),
      serviceClient
        .from('job_offers')
        .select('id, driver_id, shipment_id, delivered_at, shipments(origin, destination, shipment_id, estimated_cost)')
        .eq('status', 'delivered')
        .order('delivered_at', { ascending: false })
        .limit(limit),
    ])

    const analyticsError = agencyJobsRes.error || agencyShipmentRefsRes.error || driverJobsRes.error || directBookingCandidatesRes.error || agenciesRes.error || driversRes.error || shipmentsRes.error || recentAgencyJobsRes.error || recentDriverJobsRes.error
    if (analyticsError) {
      console.error('Failed to load admin dashboard snapshot', analyticsError)
      throw new RequestError('Unable to load dashboard analytics.', 500, false)
    }

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

    const recentAgencyJobs = recentAgencyJobsRes.data ?? []
    const recentDriverJobs = recentDriverJobsRes.data ?? []

    const agencyIds = Array.from(new Set(recentAgencyJobs.map((job: any) => job.agency_id).filter((id: string | null | undefined): id is string => Boolean(id))))
    const driverIds = Array.from(new Set(recentDriverJobs.map((job: any) => job.driver_id).filter((id: string | null | undefined): id is string => Boolean(id))))

    const [agenciesDataRes, driversDataRes] = await Promise.all([
      agencyIds.length > 0
        ? serviceClient.from('transport_agencies').select('id, company_name').in('id', agencyIds)
        : Promise.resolve({ data: [], error: null }),
      driverIds.length > 0
        ? serviceClient.from('drivers').select('id, full_name, phone').in('id', driverIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (agenciesDataRes.error || driversDataRes.error) {
      console.error('Failed to load admin recent activity names', agenciesDataRes.error || driversDataRes.error)
      throw new RequestError('Unable to load dashboard analytics.', 500, false)
    }

    const agencyNameById = new Map((agenciesDataRes.data ?? []).map((agency: any) => [agency.id, agency.company_name ?? 'Unknown Agency']))
    const driverNameById = new Map((driversDataRes.data ?? []).map((driver: any) => [driver.id, driver.full_name || driver.phone || 'Unknown Driver']))

    const recentJobs = [
      ...recentAgencyJobs.map((job: any) => {
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
      ...recentDriverJobs.map((job: any) => {
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
      .sort((left, right) => new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime())
      .slice(0, limit)

    return jsonResponse({
      analytics: {
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
      },
      recentJobs,
    })
  } catch (error) {
    return handleRequestError('admin-portal-dashboard', error)
  }
})