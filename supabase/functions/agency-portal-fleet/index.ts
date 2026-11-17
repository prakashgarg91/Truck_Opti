import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  jsonResponse,
  RequestError,
  requireAgencyContext,
} from '../_shared/portal-auth.ts'

// Read-only. Truck writes go through the guarded SQL commands (agency_vehicle_create /
// agency_vehicle_update: subscription limit, optimistic version, approved-plan check, scope), never
// through this function, so it has no truck write actions.
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const context = await requireAgencyContext(
      req.headers.get('Authorization'),
      { requireApproved: false, portal: 'fleet' },
    )

    const { serviceClient, agencyId } = context

    if (req.method !== 'GET') {
      // POST is accepted only for the legacy { action: 'list' } call; any other action is refused.
      let action: unknown
      try {
        action = ((await req.json()) as { action?: unknown } | null)?.action
      } catch {
        throw new RequestError('A valid action is required.')
      }
      if (action !== 'list') {
        throw new RequestError('Unsupported action.')
      }
    }

    const { data: trucks, error } = await serviceClient
      .from('agency_trucks')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch trucks', error)
      throw new RequestError('Unable to fetch trucks.', 500, false)
    }

    return jsonResponse({ trucks: trucks ?? [] })
  } catch (error) {
    return handleRequestError('agency-portal-fleet', error)
  }
})
