import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAgencyContext,
} from '../_shared/portal-auth.ts'

type BillingRequest = { action: 'list' }

function parseRequestBody(body: unknown): BillingRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid action is required.')
  }

  if (body.action === 'list') {
    return { action: 'list' }
  }

  throw new RequestError('Unsupported action.')
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

    const body = req.method === 'GET' ? { action: 'list' as const } : parseRequestBody(await req.json())

    if (body.action === 'list') {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

      const [monthRes, pendingRes, paidRes, deliveredRes] = await Promise.all([
        serviceClient
          .from('agency_jobs')
          .select('fare')
          .eq('agency_id', agencyId)
          .eq('status', 'delivered')
          .gte('updated_at', monthStart),
        serviceClient
          .from('agency_jobs')
          .select('fare')
          .eq('agency_id', agencyId)
          .in('status', ['accepted', 'in_transit']),
        serviceClient
          .from('agency_jobs')
          .select('fare')
          .eq('agency_id', agencyId)
          .eq('status', 'delivered'),
        serviceClient
          .from('agency_jobs')
          .select('id, fare, updated_at, shipments(origin, destination, shipment_id)')
          .eq('agency_id', agencyId)
          .eq('status', 'delivered')
          .order('updated_at', { ascending: false }),
      ])

      const billingError = monthRes.error || pendingRes.error || paidRes.error || deliveredRes.error
      if (billingError) {
        console.error('Failed to fetch billing data', billingError)
        throw new RequestError('Unable to fetch billing data.', 500, false)
      }

      const sum = (rows: { fare: number | null }[] | null) =>
        (rows ?? []).reduce((a, r) => a + (r.fare ?? 0), 0)

      const thisMonth = sum(monthRes.data)
      const pending = sum(pendingRes.data)
      const totalPaid = sum(paidRes.data)
      const gstDue = Math.round(thisMonth * 0.05)

      const jobs = (deliveredRes.data ?? []).map((j: Record<string, unknown>) => {
        const s = (Array.isArray(j.shipments) ? j.shipments[0] : j.shipments) as Record<string, unknown> | null
        return {
          id: j.id,
          fare: Number(j.fare ?? 0),
          origin: s?.origin ?? '—',
          destination: s?.destination ?? '—',
          updated_at: j.updated_at,
          shipment_id: s?.shipment_id ?? '',
        }
      })

      return jsonResponse({
        summary: {
          thisMonth,
          pending,
          totalPaid,
          gstDue,
        },
        jobs,
      })
    }

    throw new RequestError('Invalid request.', 400)
  } catch (error) {
    return handleRequestError('agency-portal-billing', error)
  }
})
