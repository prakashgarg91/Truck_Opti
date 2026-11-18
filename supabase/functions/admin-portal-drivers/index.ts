import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAdminContext,
} from '../_shared/portal-auth.ts'

type DriverStatus = 'pending' | 'approved' | 'rejected' | 'suspended'

type DriversRequest =
  | { action: 'list'; status: DriverStatus }
  | { action: 'get'; driverId: string }
  | { action: 'approve'; driverId: string }
  | { action: 'reject'; driverId: string; rejectionReason: string }
  | { action: 'suspend'; driverId: string }

const driverStatuses: DriverStatus[] = ['pending', 'approved', 'rejected', 'suspended']

/** Upper bound on rows returned by the list action. Newest first. */
const LIST_ROW_CAP = 200

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isDriverStatus(value: unknown): value is DriverStatus {
  return typeof value === 'string' && driverStatuses.includes(value as DriverStatus)
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

function parseDriverId(value: unknown): string {
  if (!isUuid(value)) {
    throw new RequestError('A valid driver id is required.')
  }

  return value
}

function parseRequestBody(body: unknown): DriversRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid admin action is required.')
  }

  switch (body.action) {
    case 'list':
      if (!isDriverStatus(body.status)) {
        throw new RequestError('A valid driver status is required.')
      }

      return { action: 'list', status: body.status }
    case 'get':
      return { action: 'get', driverId: parseDriverId(body.driverId) }
    case 'approve':
      return { action: 'approve', driverId: parseDriverId(body.driverId) }
    case 'reject': {
      const driverId = parseDriverId(body.driverId)

      if (typeof body.rejectionReason !== 'string' || body.rejectionReason.trim().length === 0) {
        throw new RequestError('A rejection reason is required.')
      }

      return { action: 'reject', driverId, rejectionReason: body.rejectionReason.trim() }
    }
    case 'suspend':
      return { action: 'suspend', driverId: parseDriverId(body.driverId) }
    default:
      throw new RequestError('Unsupported admin action.')
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { caller, serviceClient } = await requireAdminContext(req.headers.get('Authorization'))
    const body = parseRequestBody(await readJsonBody(req))

    if (body.action === 'list') {
      const { data, error } = await serviceClient
        .from('drivers')
        .select('*')
        .eq('status', body.status)
        .order('created_at', { ascending: false })
        .limit(LIST_ROW_CAP)

      if (error) {
        console.error('Failed to load drivers', error)
        throw new RequestError('Unable to load drivers.', 500, false)
      }

      return jsonResponse({ drivers: data ?? [] })
    }

    if (body.action === 'get') {
      const { data, error } = await serviceClient
        .from('drivers')
        .select('*')
        .eq('id', body.driverId)
        .maybeSingle()

      if (error) {
        console.error('Failed to load driver details', error)
        throw new RequestError('Unable to load driver details.', 500, false)
      }

      return jsonResponse({ driver: data ?? null })
    }

    if (body.action === 'approve') {
      const { data, error } = await serviceClient
        .from('drivers')
        .update({
          status: 'approved',
          approved_by: caller.id,
          approved_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', body.driverId)
        .select('*')
        .maybeSingle()

      if (error) {
        console.error('Failed to approve driver', error)
        throw new RequestError('Unable to approve driver.', 500, false)
      }

      if (!data) {
        throw new RequestError('Driver not found.', 404)
      }

      return jsonResponse({ driver: data })
    }

    if (body.action === 'reject') {
      const { data, error } = await serviceClient
        .from('drivers')
        .update({
          status: 'rejected',
          rejection_reason: body.rejectionReason,
        })
        .eq('id', body.driverId)
        .select('*')
        .maybeSingle()

      if (error) {
        console.error('Failed to reject driver', error)
        throw new RequestError('Unable to reject driver.', 500, false)
      }

      if (!data) {
        throw new RequestError('Driver not found.', 404)
      }

      return jsonResponse({ driver: data })
    }

    const { data, error } = await serviceClient
      .from('drivers')
      .update({ status: 'suspended' })
      .eq('id', body.driverId)
      .select('*')
      .maybeSingle()

    if (error) {
      console.error('Failed to suspend driver', error)
      throw new RequestError('Unable to suspend driver.', 500, false)
    }

    if (!data) {
      throw new RequestError('Driver not found.', 404)
    }

    return jsonResponse({ driver: data })
  } catch (error) {
    return handleRequestError('admin-portal-drivers', error)
  }
})
