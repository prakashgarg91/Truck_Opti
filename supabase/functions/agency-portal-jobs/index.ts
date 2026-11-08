import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAgencyContext,
} from '../_shared/portal-auth.ts'

// Writes (status changes, driver assignment) moved to database commands:
// agency_job_set_status and agency_job_assign_driver (20261015000000). This function is read-only.
type JobRequest = { action: 'list' }

function parseRequestBody(body: unknown): JobRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid action is required.')
  }

  switch (body.action) {
    case 'list':
      return { action: 'list' }
    default:
      throw new RequestError('This action moved to database commands.', 410, false)
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

    throw new RequestError('Invalid request.', 400)
  } catch (error) {
    return handleRequestError('agency-portal-jobs', error)
  }
})
