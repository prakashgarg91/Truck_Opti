import { assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { assertDriverAvailableForAgencyTruck, RequestError } from '../_shared/portal-auth.ts'

function createTruckAssignmentMockServiceClient(responses: {
  driver: { data: { id: string; status: string } | null; error: null }
  foreignTruck: { data: { id: string; agency_id: string } | null; error: null }
}) {
  return {
    from(table: string) {
      if (table === 'drivers') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => responses.driver,
            }),
          }),
        }
      }

      if (table === 'agency_trucks') {
        return {
          select: () => ({
            eq: () => ({
              neq: () => ({
                limit: () => ({
                  maybeSingle: async () => responses.foreignTruck,
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

Deno.test('fleet update-truck regression: blocks drivers already assigned to another agency', async () => {
  await assertRejects(
    () =>
      assertDriverAvailableForAgencyTruck(
        createTruckAssignmentMockServiceClient({
          driver: { data: { id: 'driver-1', status: 'approved' }, error: null },
          foreignTruck: { data: { id: 'truck-9', agency_id: 'agency-2' }, error: null },
        }) as never,
        'agency-1',
        'driver-1',
      ),
    RequestError,
    'Driver is already assigned to another agency.',
  )
})
