import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAgencyContext,
} from '../_shared/portal-auth.ts'

type DashboardRequest = { action: 'snapshot' }

function parseRequestBody(body: unknown): DashboardRequest {
  if (!isRecord(body) || body.action !== 'snapshot') {
    throw new RequestError('A valid action is required.')
  }

  return { action: 'snapshot' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceClient, agencyId } = await requireAgencyContext(
      req.headers.get('Authorization'),
      { requireApproved: false },
    )
    parseRequestBody(await req.json())

    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [agencyRes, activeRes, todayRes, pendingRes, revenueRes] = await Promise.all([
      serviceClient
        .from('transport_agencies')
        .select('id, company_name, status, rating, total_jobs, fleet_size, city, gstin')
        .eq('id', agencyId)
        .maybeSingle(),
      serviceClient
        .from('agency_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .in('status', ['accepted', 'in_transit']),
      serviceClient
        .from('agency_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .gte('created_at', today),
      serviceClient
        .from('agency_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('status', 'pending'),
      serviceClient
        .from('agency_jobs')
        .select('fare')
        .eq('agency_id', agencyId)
        .eq('status', 'delivered')
        .gte('updated_at', thirtyDaysAgo),
    ])

    const firstError = agencyRes.error || activeRes.error || todayRes.error || pendingRes.error || revenueRes.error

    if (firstError) {
      console.error('Failed to load agency dashboard snapshot', firstError)
      throw new RequestError('Unable to load dashboard data.', 500, false)
    }

    const revenueRows = (revenueRes.data ?? []) as Array<{ fare: number | null }>
    const thirtyDayRevenue = revenueRows.reduce((total, row) => total + Number(row.fare ?? 0), 0)

    return jsonResponse({
      agency: agencyRes.data ?? null,
      summary: {
        active: activeRes.count ?? 0,
        today: todayRes.count ?? 0,
        pending: pendingRes.count ?? 0,
        thirtyDayRevenue,
        thirtyDayJobs: revenueRows.length,
      },
    })
  } catch (error) {
    return handleRequestError('agency-portal-dashboard', error)
  }
})