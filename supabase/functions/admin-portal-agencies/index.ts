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
  | { action: 'list'; status: AgencyStatus; offset: number }
  | { action: 'approve'; agencyId: string }
  | { action: 'reject'; agencyId: string; rejectionReason: string }
  | { action: 'suspend'; agencyId: string }

const agencyStatuses: AgencyStatus[] = ['pending', 'approved', 'rejected', 'suspended']

/** Rows returned per list page. Newest first. The query fetches one extra row to learn whether another page exists. */
const LIST_ROW_CAP = 200

/** Largest accepted list offset. Keeps a client from forcing a deep, expensive scan. */
const MAX_LIST_OFFSET = 100000

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isAgencyStatus(value: unknown): value is AgencyStatus {
  return typeof value === 'string' && agencyStatuses.includes(value as AgencyStatus)
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new RequestError('A valid admin action is required.')
  }
}

function parseListOffset(value: unknown): number {
  if (value === undefined) {
    return 0
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > MAX_LIST_OFFSET) {
    throw new RequestError('A valid offset is required.')
  }

  return value
}

function parseAgencyId(value: unknown): string {
  if (!isUuid(value)) {
    throw new RequestError('A valid agency id is required.')
  }

  return value
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

      return { action: 'list', status: body.status, offset: parseListOffset(body.offset) }
    case 'approve':
      return { action: 'approve', agencyId: parseAgencyId(body.agencyId) }
    case 'reject': {
      const agencyId = parseAgencyId(body.agencyId)

      if (typeof body.rejectionReason !== 'string' || body.rejectionReason.trim().length === 0) {
        throw new RequestError('A rejection reason is required.')
      }

      return { action: 'reject', agencyId, rejectionReason: body.rejectionReason.trim() }
    }
    case 'suspend':
      return { action: 'suspend', agencyId: parseAgencyId(body.agencyId) }
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

type ServiceClient = Awaited<ReturnType<typeof requireAdminContext>>['serviceClient']

/**
 * Moves one agency to a new status. The allowed source statuses are checked on the row that is read,
 * and the UPDATE is conditional on that same status, so a concurrent change cannot slip through.
 */
async function transitionAgency(
  serviceClient: ServiceClient,
  agencyId: string,
  allowedFrom: AgencyStatus[],
  refusal: string,
  label: string,
  buildUpdate: (current: { approved_at: string | null }) => Record<string, unknown>,
) {
  const { data: current, error: lookupError } = await serviceClient
    .from('transport_agencies')
    .select('id, status, approved_at')
    .eq('id', agencyId)
    .maybeSingle<{ id: string; status: AgencyStatus; approved_at: string | null }>()

  if (lookupError) {
    console.error(`Failed to load agency before ${label}`, lookupError)
    throw new RequestError(`Unable to ${label} agency.`, 500, false)
  }

  if (!current) {
    throw new RequestError('Agency not found.', 404)
  }

  if (!allowedFrom.includes(current.status)) {
    throw new RequestError(refusal, 409)
  }

  const { data, error } = await serviceClient
    .from('transport_agencies')
    .update(buildUpdate({ approved_at: current.approved_at }))
    .eq('id', agencyId)
    .eq('status', current.status)
    .select('*')
    .maybeSingle()

  if (error) {
    console.error(`Failed to ${label} agency`, error)
    throw new RequestError(`Unable to ${label} agency.`, 500, false)
  }

  if (!data) {
    throw new RequestError('The agency status changed. Refresh and try again.', 409)
  }

  return data
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceClient } = await requireAdminContext(req.headers.get('Authorization'))
    const body = parseRequestBody(await readJsonBody(req))

    if (body.action === 'list') {
      const [agenciesRes, counts] = await Promise.all([
        serviceClient
          .from('transport_agencies')
          .select('*')
          .eq('status', body.status)
          .order('created_at', { ascending: false })
          // id is the primary key, so this tiebreaker keeps page boundaries stable when created_at ties.
          .order('id', { ascending: false })
          .range(body.offset, body.offset + LIST_ROW_CAP),
        loadCounts(serviceClient),
      ])

      if (agenciesRes.error) {
        console.error('Failed to load agencies', agenciesRes.error)
        throw new RequestError('Unable to load agencies.', 500, false)
      }

      const fetched = agenciesRes.data ?? []

      return jsonResponse({
        agencies: fetched.slice(0, LIST_ROW_CAP),
        counts,
        has_more: fetched.length > LIST_ROW_CAP,
      })
    }

    if (body.action === 'approve') {
      // Approve is also the reinstate path (suspended -> approved) and the re-approve path for rejected agencies.
      // The first approval time is kept, so a reinstate does not overwrite it.
      const agency = await transitionAgency(
        serviceClient,
        body.agencyId,
        ['pending', 'rejected', 'suspended'],
        'Only pending, rejected or suspended agencies can be approved.',
        'approve',
        (current) => ({
          status: 'approved',
          approved_at: current.approved_at ?? new Date().toISOString(),
          rejection_reason: null,
        }),
      )

      return jsonResponse({ agency })
    }

    if (body.action === 'reject') {
      const agency = await transitionAgency(
        serviceClient,
        body.agencyId,
        ['pending'],
        'Only pending agencies can be rejected.',
        'reject',
        () => ({
          status: 'rejected',
          rejection_reason: body.rejectionReason,
        }),
      )

      return jsonResponse({ agency })
    }

    const agency = await transitionAgency(
      serviceClient,
      body.agencyId,
      ['approved'],
      'Only approved agencies can be suspended.',
      'suspend',
      () => ({ status: 'suspended' }),
    )

    return jsonResponse({ agency })
  } catch (error) {
    return handleRequestError('admin-portal-agencies', error)
  }
})
