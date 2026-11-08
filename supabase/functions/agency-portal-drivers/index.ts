import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAgencyContext,
} from '../_shared/portal-auth.ts'

type DriversRequest =
  | { action: 'snapshot' }

function parseRequestBody(body: unknown): DriversRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid action is required.')
  }

  switch (body.action) {
    case 'snapshot':
      return { action: 'snapshot' }
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
    const body = parseRequestBody(await req.json())

    if (body.action === 'snapshot') {
      const [trucksRes, assignmentsRes] = await Promise.all([
        serviceClient
          .from('agency_trucks')
          .select('id, vehicle_type, rc_number')
          .eq('agency_id', agencyId)
          .order('created_at', { ascending: false }),
        serviceClient
          .from('agency_trucks')
          .select(`
            id,
            driver_id,
            vehicle_type,
            rc_number,
            drivers!agency_trucks_driver_id_fkey (
              id,
              full_name,
              phone,
              vehicle_type,
              home_city,
              rating,
              total_trips,
              status,
              is_online,
              active_job_id
            )
          `)
          .eq('agency_id', agencyId)
          .not('driver_id', 'is', null),
      ])

      const snapshotError = trucksRes.error || assignmentsRes.error

      if (snapshotError) {
        console.error('Failed to load agency drivers snapshot', snapshotError)
        throw new RequestError('Unable to load drivers.', 500, false)
      }

      const drivers = ((assignmentsRes.data ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
        const driver = (Array.isArray(row.drivers) ? row.drivers[0] : row.drivers) as Record<string, unknown> | null

        if (!driver) {
          return []
        }

        return [{
          ...driver,
          truck_id: row.id,
        }]
      })

      return jsonResponse({
        trucks: trucksRes.data ?? [],
        drivers,
      })
    }

    throw new RequestError('Invalid request.', 400)
  } catch (error) {
    return handleRequestError('agency-portal-drivers', error)
  }
})