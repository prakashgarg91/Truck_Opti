import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  assertDriverAvailableForAgencyTruck,
  assertDriverOnAgencyFleet,
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAgencyContext,
} from '../_shared/portal-auth.ts'

type DriversRequest =
  | { action: 'snapshot' }
  | { action: 'assign-truck'; truckId: string; driverId: string }
  | { action: 'unassign-truck'; truckId: string }
  | { action: 'create-payout'; driverId: string; amount: number; note?: string }

function parseRequestBody(body: unknown): DriversRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid action is required.')
  }

  switch (body.action) {
    case 'snapshot':
      return { action: 'snapshot' }
    case 'assign-truck':
      if (typeof body.truckId !== 'string' || typeof body.driverId !== 'string') {
        throw new RequestError('truckId and driverId are required.')
      }

      return { action: 'assign-truck', truckId: body.truckId, driverId: body.driverId }
    case 'unassign-truck':
      if (typeof body.truckId !== 'string') {
        throw new RequestError('truckId is required.')
      }

      return { action: 'unassign-truck', truckId: body.truckId }
    case 'create-payout':
      if (typeof body.driverId !== 'string' || typeof body.amount !== 'number' || !Number.isFinite(body.amount)) {
        throw new RequestError('driverId and amount are required.')
      }

      return {
        action: 'create-payout',
        driverId: body.driverId,
        amount: body.amount,
        note: typeof body.note === 'string' ? body.note : undefined,
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
    const { serviceClient, agencyId } = await requireAgencyContext(req.headers.get('Authorization'))
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

    if (body.action === 'assign-truck') {
      await assertDriverAvailableForAgencyTruck(serviceClient, agencyId, body.driverId)

      const { error } = await serviceClient
        .from('agency_trucks')
        .update({ driver_id: body.driverId })
        .eq('id', body.truckId)
        .eq('agency_id', agencyId)

      if (error) {
        console.error('Failed to assign truck to driver', error)
        throw new RequestError('Unable to assign truck.', 500, false)
      }

      return jsonResponse({ message: 'Truck assigned.' })
    }

    if (body.action === 'unassign-truck') {
      const { error } = await serviceClient
        .from('agency_trucks')
        .update({ driver_id: null })
        .eq('id', body.truckId)
        .eq('agency_id', agencyId)

      if (error) {
        console.error('Failed to unassign truck', error)
        throw new RequestError('Unable to unassign driver.', 500, false)
      }

      return jsonResponse({ message: 'Driver unassigned.' })
    }

    await assertDriverOnAgencyFleet(serviceClient, agencyId, body.driverId)

    const { error } = await serviceClient
      .from('driver_payouts')
      .insert({
        driver_id: body.driverId,
        agency_id: agencyId,
        amount: body.amount,
        type: 'agency_pay',
        status: 'pending',
        note: body.note ?? null,
      })

    if (error) {
      console.error('Failed to create driver payout', error)
      throw new RequestError('Unable to submit payment request.', 500, false)
    }

    return jsonResponse({ message: 'Payment request submitted.' })
  } catch (error) {
    return handleRequestError('agency-portal-drivers', error)
  }
})