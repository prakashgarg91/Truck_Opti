import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  assertApprovedAgency,
  assertApprovedDriver,
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAgencyContext,
} from '../_shared/portal-auth.ts'

type FleetRequest =
  | { action: 'list' }
  | { action: 'add-truck'; rc_number: string; vehicle_type: string; insurance_expiry?: string; fitness_expiry?: string; permit_expiry?: string }
  | { action: 'update-truck'; truckId: string; data: Record<string, unknown> }

const allowedTruckUpdateFields = new Set([
  'vehicle_type',
  'rc_number',
  'insurance_expiry',
  'fitness_expiry',
  'permit_expiry',
  'is_available',
  'driver_id',
  'notes',
])

function sanitizeTruckUpdate(data: Record<string, unknown>) {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(data)) {
    if (allowedTruckUpdateFields.has(key)) {
      sanitized[key] = value
    }
  }

  if (Object.keys(sanitized).length === 0) {
    throw new RequestError('No valid truck fields were provided.', 400)
  }

  return sanitized
}

function parseRequestBody(body: unknown): FleetRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid action is required.')
  }

  switch (body.action) {
    case 'list':
      return { action: 'list' }
    case 'add-truck':
      if (typeof body.rc_number !== 'string' || typeof body.vehicle_type !== 'string') {
        throw new RequestError('rc_number and vehicle_type are required.')
      }
      return {
        action: 'add-truck',
        rc_number: body.rc_number,
        vehicle_type: body.vehicle_type,
        insurance_expiry: body.insurance_expiry as string | undefined,
        fitness_expiry: body.fitness_expiry as string | undefined,
        permit_expiry: body.permit_expiry as string | undefined,
      }
    case 'update-truck':
      if (typeof body.truckId !== 'string' || !isRecord(body.data)) {
        throw new RequestError('truckId and data are required.')
      }
      return {
        action: 'update-truck',
        truckId: body.truckId,
        data: body.data,
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
    }

    if (body.action === 'add-truck') {
      const { data: newTruck, error } = await serviceClient
        .from('agency_trucks')
        .insert({
          agency_id: agencyId,
          rc_number: body.rc_number,
          vehicle_type: body.vehicle_type,
          insurance_expiry: body.insurance_expiry,
          fitness_expiry: body.fitness_expiry,
          permit_expiry: body.permit_expiry,
        })
        .select()
        .single()

      if (error) {
        console.error('Failed to add truck', error)
        throw new RequestError('Unable to add truck.', 500, false)
      }

      return jsonResponse({ truck: newTruck, message: 'Truck added successfully.' })
    }

    if (body.action === 'update-truck') {
      const { data: truck, error: fetchError } = await serviceClient
        .from('agency_trucks')
        .select('id, agency_id')
        .eq('id', body.truckId)
        .maybeSingle()

      if (fetchError || !truck) {
        throw new RequestError('Truck not found.', 404)
      }

      if (truck.agency_id !== agencyId) {
        throw new RequestError('Access denied.', 403)
      }

      const updateData = sanitizeTruckUpdate(body.data)

      if (typeof updateData.driver_id === 'string') {
        await assertApprovedDriver(serviceClient, updateData.driver_id)
      }

      const { error } = await serviceClient
        .from('agency_trucks')
        .update(updateData)
        .eq('id', body.truckId)

      if (error) {
        console.error('Failed to update truck', error)
        throw new RequestError('Unable to update truck.', 500, false)
      }

      return jsonResponse({ message: 'Truck updated.' })
    }

    throw new RequestError('Invalid request.', 400)
  } catch (error) {
    return handleRequestError('agency-portal-fleet', error)
  }
})
