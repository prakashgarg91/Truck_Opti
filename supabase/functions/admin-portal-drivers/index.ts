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

function isDriverStatus(value: unknown): value is DriverStatus {
  return typeof value === 'string' && driverStatuses.includes(value as DriverStatus)
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
      if (typeof body.driverId !== 'string') {
        throw new RequestError('driverId is required.')
      }

      return { action: 'get', driverId: body.driverId }
    case 'approve':
      if (typeof body.driverId !== 'string') {
        throw new RequestError('driverId is required.')
      }

      return { action: 'approve', driverId: body.driverId }
    case 'reject':
      if (typeof body.driverId !== 'string' || typeof body.rejectionReason !== 'string') {
        throw new RequestError('driverId and rejectionReason are required.')
      }

      return { action: 'reject', driverId: body.driverId, rejectionReason: body.rejectionReason }
    case 'suspend':
      if (typeof body.driverId !== 'string') {
        throw new RequestError('driverId is required.')
      }

      return { action: 'suspend', driverId: body.driverId }
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
    const body = parseRequestBody(await req.json())

    if (body.action === 'list') {
      const { data, error } = await serviceClient
        .from('drivers')
        .select('*')
        .eq('status', body.status)
        .order('created_at', { ascending: false })

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
        .single()

      if (error) {
        console.error('Failed to approve driver', error)
        throw new RequestError('Unable to approve driver.', 500, false)
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
        .single()

      if (error) {
        console.error('Failed to reject driver', error)
        throw new RequestError('Unable to reject driver.', 500, false)
      }

      return jsonResponse({ driver: data })
    }

    const { data, error } = await serviceClient
      .from('drivers')
      .update({ status: 'suspended' })
      .eq('id', body.driverId)
      .select('*')
      .single()

    if (error) {
      console.error('Failed to suspend driver', error)
      throw new RequestError('Unable to suspend driver.', 500, false)
    }

    return jsonResponse({ driver: data })
  } catch (error) {
    return handleRequestError('admin-portal-drivers', error)
  }
})