import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
    corsHeaders,
    handleRequestError,
    isRecord,
    jsonResponse,
    RequestError,
    requireAgencyContext,
} from '../_shared/portal-auth.ts'

type JobRequest =
    | { action: 'list' }
    | { action: 'update-status'; jobId: string; status: string }
    | { action: 'assign-driver'; jobId: string; driverId: string }
    | { action: 'assignable-drivers' }
    | { action: 'latest-driver-location'; jobId: string }

function parseRequestBody(body: unknown): JobRequest {
    if (!isRecord(body) || typeof body.action !== 'string') {
        throw new RequestError('A valid action is required.')
    }

    switch (body.action) {
        case 'list':
            return { action: 'list' }
        case 'update-status':
            if (typeof body.jobId !== 'string' || typeof body.status !== 'string') {
                throw new RequestError('jobId and status are required.')
            }
            return {
                action: 'update-status',
                jobId: body.jobId,
                status: body.status,
            }
        case 'assign-driver':
            if (typeof body.jobId !== 'string' || typeof body.driverId !== 'string') {
                throw new RequestError('jobId and driverId are required.')
            }
            return {
                action: 'assign-driver',
                jobId: body.jobId,
                driverId: body.driverId,
            }
        case 'assignable-drivers':
            return { action: 'assignable-drivers' }
        case 'latest-driver-location':
            if (typeof body.jobId !== 'string') {
                throw new RequestError('jobId is required.')
            }
            return {
                action: 'latest-driver-location',
                jobId: body.jobId,
            }
        default:
            throw new RequestError('Unsupported action.')
    }
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const { serviceClient, agencyId } = await requireAgencyContext(req.headers.get('Authorization'))

        const body = req.method === 'GET' ? { action: 'list' } : parseRequestBody(await req.json())

        if (body.action === 'list') {
            const { data: jobs, error } = await serviceClient
                .from('agency_jobs')
                .select(`
          id,
          shipment_id,
          status,
          fare,
          driver_id,
          created_at,
          updated_at,
          shipments (
            shipment_id,
            origin,
            destination,
            total_weight,
            estimated_cost
          )
        `)
                .eq('agency_id', agencyId)
                .order('created_at', { ascending: false })

            if (error) {
                console.error('Failed to fetch jobs', error)
                throw new RequestError('Unable to fetch jobs.', 500, false)
            }

            return jsonResponse({ jobs: jobs ?? [] })
        }

        if (body.action === 'update-status') {
            const { data: job, error: fetchError } = await serviceClient
                .from('agency_jobs')
                .select('id, agency_id')
                .eq('id', body.jobId)
                .maybeSingle()

            if (fetchError || !job) {
                throw new RequestError('Job not found.', 404)
            }

            if (job.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            const { error } = await serviceClient
                .from('agency_jobs')
                .update({ status: body.status })
                .eq('id', body.jobId)

            if (error) {
                console.error('Failed to update job status', error)
                throw new RequestError('Unable to update job.', 500, false)
            }

            return jsonResponse({ message: 'Job status updated.' })
        }

        if (body.action === 'assign-driver') {
            const { data: job, error: fetchError } = await serviceClient
                .from('agency_jobs')
                .select('id, agency_id')
                .eq('id', body.jobId)
                .maybeSingle()

            if (fetchError || !job) {
                throw new RequestError('Job not found.', 404)
            }

            if (job.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            const { data: truckAssignment, error: assignmentError } = await serviceClient
                .from('agency_trucks')
                .select('id')
                .eq('agency_id', agencyId)
                .eq('driver_id', body.driverId)
                .eq('is_available', true)
                .maybeSingle()

            if (assignmentError) {
                console.error('Failed to validate agency driver assignment', assignmentError)
                throw new RequestError('Unable to assign driver.', 500, false)
            }

            if (!truckAssignment) {
                throw new RequestError('Driver is not currently available for this agency.', 409)
            }

            const { error } = await serviceClient
                .from('agency_jobs')
                .update({ driver_id: body.driverId })
                .eq('id', body.jobId)

            if (error) {
                console.error('Failed to assign driver', error)
                throw new RequestError('Unable to assign driver.', 500, false)
            }

            return jsonResponse({ message: 'Driver assigned.' })
        }

        if (body.action === 'assignable-drivers') {
            const { data: drivers, error } = await serviceClient
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
                console.error('Failed to load assignable drivers', error)
                throw new RequestError('Unable to load drivers.', 500, false)
            }

            return jsonResponse({ drivers: drivers ?? [] })
        }

        if (body.action === 'latest-driver-location') {
            const { data: job, error: jobError } = await serviceClient
                .from('agency_jobs')
                .select('id, agency_id, driver_id')
                .eq('id', body.jobId)
                .maybeSingle<{ id: string; agency_id: string; driver_id: string | null }>()

            if (jobError) {
                console.error('Failed to resolve agency tracking job', jobError)
                throw new RequestError('Unable to load driver location.', 500, false)
            }

            if (!job) {
                throw new RequestError('Job not found.', 404)
            }

            if (job.agency_id !== agencyId) {
                throw new RequestError('Access denied.', 403)
            }

            if (!job.driver_id) {
                return jsonResponse({ location: null })
            }

            const { data: location, error: locationError } = await serviceClient
                .from('driver_locations')
                .select('lat, lng, updated_at, speed_kmh')
                .eq('driver_id', job.driver_id)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (locationError) {
                console.error('Failed to load driver location', locationError)
                throw new RequestError('Unable to load driver location.', 500, false)
            }

            return jsonResponse({ location: location ?? null })
        }

        throw new RequestError('Invalid request.', 400)
    } catch (error) {
        return handleRequestError('agency-portal-jobs', error)
    }
})
