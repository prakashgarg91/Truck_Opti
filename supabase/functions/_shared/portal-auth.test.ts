import { assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  assertDriverAvailableForAgencyTruck,
  assertDriverLinkedToAgency,
  assertDriverOnAgencyFleet,
} from './portal-auth.ts'

type QueryResult = { data: { id: string } | null; error: null }

function createFleetMockServiceClient(truck: QueryResult) {
  const buildChain = (result: QueryResult) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => result,
          }),
        }),
      }),
    }),
  })

  return {
    from(table: string) {
      if (table === 'agency_trucks') {
        return buildChain(truck)
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

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

Deno.test('assertDriverOnAgencyFleet allows drivers linked via agency trucks', async () => {
  await assertDriverOnAgencyFleet(
    createFleetMockServiceClient({ data: { id: 'truck-1' }, error: null }) as never,
    'agency-1',
    'driver-1',
  )
})

Deno.test('assertDriverOnAgencyFleet rejects drivers not on agency fleet', async () => {
  await assertRejects(
    () =>
      assertDriverOnAgencyFleet(
        createFleetMockServiceClient({ data: null, error: null }) as never,
        'agency-1',
        'driver-1',
      ),
    Error,
    'Driver is not assigned to this agency fleet.',
  )
})

Deno.test('assertDriverLinkedToAgency delegates to fleet membership only', async () => {
  await assertRejects(
    () =>
      assertDriverLinkedToAgency(
        createFleetMockServiceClient({ data: null, error: null }) as never,
        'agency-1',
        'driver-1',
      ),
    Error,
    'Driver is not assigned to this agency fleet.',
  )
})

Deno.test('assertDriverAvailableForAgencyTruck allows approved unassigned drivers', async () => {
  await assertDriverAvailableForAgencyTruck(
    createTruckAssignmentMockServiceClient({
      driver: { data: { id: 'driver-1', status: 'approved' }, error: null },
      foreignTruck: { data: null, error: null },
    }) as never,
    'agency-1',
    'driver-1',
  )
})

Deno.test('assertDriverAvailableForAgencyTruck rejects drivers assigned to another agency', async () => {
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
    Error,
    'Driver is already assigned to another agency.',
  )
})

Deno.test('assertDriverAvailableForAgencyTruck rejects non-approved drivers', async () => {
  await assertRejects(
    () =>
      assertDriverAvailableForAgencyTruck(
        createTruckAssignmentMockServiceClient({
          driver: { data: { id: 'driver-1', status: 'pending' }, error: null },
          foreignTruck: { data: null, error: null },
        }) as never,
        'agency-1',
        'driver-1',
      ),
    Error,
    'Driver is not approved for assignment.',
  )
})
