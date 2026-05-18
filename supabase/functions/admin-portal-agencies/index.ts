import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAdminContext,
} from '../_shared/portal-auth.ts'

type AgencyStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

type AgenciesRequest =
  | { action: 'list'; status: AgencyStatus }
  | { action: 'approve'; agencyId: string }
  | { action: 'reject'; agencyId: string; rejectionReason: string }
  | { action: 'suspend'; agencyId: string }

const agencyStatuses: AgencyStatus[] = ['pending', 'approved', 'rejected', 'suspended']

function isAgencyStatus(value: unknown): value is AgencyStatus {
  return typeof value === 'string' && agencyStatuses.includes(value as AgencyStatus)
}

function parseRequestBody(body: unknown): AgenciesRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid admin action is required.')
  }

  switch (body.action) {
    case 'list':
      if (!isAgencyStatus(body.status)) {
        throw new RequestError('A valid agency status is required.')
      }

      return { action: 'list', status: body.status }
    case 'approve':
      if (typeof body.agencyId !== 'string') {
        throw new RequestError('agencyId is required.')
      }

      return { action: 'approve', agencyId: body.agencyId }
    case 'reject':
      if (typeof body.agencyId !== 'string' || typeof body.rejectionReason !== 'string') {
        throw new RequestError('agencyId and rejectionReason are required.')
      }

      return { action: 'reject', agencyId: body.agencyId, rejectionReason: body.rejectionReason }
    case 'suspend':
      if (typeof body.agencyId !== 'string') {
        throw new RequestError('agencyId is required.')
      }

      return { action: 'suspend', agencyId: body.agencyId }
    default:
      throw new RequestError('Unsupported admin action.')
  }
}

async function loadCounts(serviceClient: Awaited<ReturnType<typeof requireAdminContext>>['serviceClient']) {
  const results = await Promise.all(
    agencyStatuses.map((status) =>
      serviceClient.from('transport_agencies').select('id', { count: 'exact', head: true }).eq('status', status)
    )
  )

  const firstError = results.find((result) => result.error)?.error

  if (firstError) {
    console.error('Failed to load agency counts', firstError)
    throw new RequestError('Unable to load agencies.', 500, false)
  }

  return agencyStatuses.reduce((counts, status, index) => {
    counts[status] = results[index].count ?? 0
    return counts
  }, {} as Record<AgencyStatus, number>)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceClient } = await requireAdminContext(req.headers.get('Authorization'))
    const body = parseRequestBody(await req.json())

    if (body.action === 'list') {
      const [agenciesRes, counts] = await Promise.all([
        serviceClient
          .from('transport_agencies')
          .select('*')
          .eq('status', body.status)
          .order('created_at', { ascending: false }),
        loadCounts(serviceClient),
      ])

      if (agenciesRes.error) {
        console.error('Failed to load agencies', agenciesRes.error)
        throw new RequestError('Unable to load agencies.', 500, false)
      }

      return jsonResponse({ agencies: agenciesRes.data ?? [], counts })
    }

    if (body.action === 'approve') {
      const { data, error } = await serviceClient
        .from('transport_agencies')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', body.agencyId)
        .select('*')
        .single()

      if (error) {
        console.error('Failed to approve agency', error)
        throw new RequestError('Unable to approve agency.', 500, false)
      }

      return jsonResponse({ agency: data })
    }

    if (body.action === 'reject') {
      const { data, error } = await serviceClient
        .from('transport_agencies')
        .update({
          status: 'rejected',
          rejection_reason: body.rejectionReason,
        })
        .eq('id', body.agencyId)
        .select('*')
        .single()

      if (error) {
        console.error('Failed to reject agency', error)
        throw new RequestError('Unable to reject agency.', 500, false)
      }

      return jsonResponse({ agency: data })
    }

    const { data, error } = await serviceClient
      .from('transport_agencies')
      .update({ status: 'suspended' })
      .eq('id', body.agencyId)
      .select('*')
      .single()

    if (error) {
      console.error('Failed to suspend agency', error)
      throw new RequestError('Unable to suspend agency.', 500, false)
    }

    return jsonResponse({ agency: data })
  } catch (error) {
    return handleRequestError('admin-portal-agencies', error)
  }
})