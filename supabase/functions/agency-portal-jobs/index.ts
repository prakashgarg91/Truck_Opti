import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  assertApprovedAgency,
  assertApprovedDriver,
  assertDriverOnAgencyFleet,
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
    default:
      throw new RequestError('Unsupported action.')
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceClient, agencyId, agencyStatus } = await requireAgencyContext(
      req.headers.get('Authorization'),
      { requireApproved: false },
    )

    const body = req.method === 'GET' ? { action: 'list' as const } : parseRequestBody(await req.json())

    if (body.action !== 'list') {
      assertApprovedAgency(agencyStatus)
    }

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
      await assertApprovedDriver(serviceClient, body.driverId)
      await assertDriverOnAgencyFleet(serviceClient, agencyId, body.driverId)

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
        .update({ driver_id: body.driverId })
        .eq('id', body.jobId)

      if (error) {
        console.error('Failed to assign driver', error)
        throw new RequestError('Unable to assign driver.', 500, false)
      }

      return jsonResponse({ message: 'Driver assigned.' })
    }

    throw new RequestError('Invalid request.', 400)
  } catch (error) {
    return handleRequestError('agency-portal-jobs', error)
  }
})
