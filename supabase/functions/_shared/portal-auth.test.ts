import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  assertDriverAffiliatedWithAgency,
  assertDriverLinkedToAgency,
  assertDriverOnAgencyFleet,
} from './portal-auth.ts'

type QueryResult = { data: { id: string } | null; error: null }

function createMockServiceClient(responses: {
  truck: QueryResult
  job: QueryResult
  offer?: QueryResult
  agencyShipments?: { data: Array<{ shipment_id: string }> | null; error: null }
}) {
  const buildChain = (result: QueryResult) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => result,
          }),
        }),
        neq: () => ({
          limit: () => ({
            maybeSingle: async () => result,
          }),
        }),
        in: () => ({
          limit: () => ({
            maybeSingle: async () => responses.offer ?? { data: null, error: null },
          }),
        }),
      }),
    }),
  })

  return {
    from(table: string) {
      if (table === 'agency_trucks') {
        return buildChain(responses.truck)
      }

      if (table === 'agency_jobs') {
        const jobChain = {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => responses.job,
                }),
                neq: () => ({
                  limit: () => ({
                    maybeSingle: async () => responses.job,
                  }),
                }),
              }),
              neq: () => ({
                limit: () => ({
                  maybeSingle: async () => responses.job,
                }),
              }),
            }),
          }),
        }

        return jobChain
      }

      if (table === 'job_offers') {
        return buildChain(responses.offer ?? { data: null, error: null })
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

Deno.test('assertDriverLinkedToAgency allows drivers linked via agency trucks', async () => {
  await assertDriverLinkedToAgency(
    createMockServiceClient({
      truck: { data: { id: 'truck-1' }, error: null },
      job: { data: null, error: null },
    }) as never,
    'agency-1',
    'driver-1',
  )
})

Deno.test('assertDriverLinkedToAgency allows drivers linked via agency jobs', async () => {
  await assertDriverLinkedToAgency(
    createMockServiceClient({
      truck: { data: null, error: null },
      job: { data: { id: 'job-1' }, error: null },
    }) as never,
    'agency-1',
    'driver-1',
  )
})

Deno.test('assertDriverLinkedToAgency rejects drivers with no agency relationship', async () => {
  await assertRejects(
    () =>
      assertDriverLinkedToAgency(
        createMockServiceClient({
          truck: { data: null, error: null },
          job: { data: null, error: null },
        }) as never,
        'agency-1',
        'driver-1',
      ),
    Error,
    'Driver is not assigned to this agency.',
  )
})

Deno.test('assertDriverOnAgencyFleet allows drivers assigned to agency trucks', async () => {
  await assertDriverOnAgencyFleet(
    createMockServiceClient({
      truck: { data: { id: 'truck-1' }, error: null },
      job: { data: null, error: null },
    }) as never,
    'agency-1',
    'driver-1',
  )
})

Deno.test('assertDriverOnAgencyFleet rejects drivers only linked via jobs', async () => {
  await assertRejects(
    () =>
      assertDriverOnAgencyFleet(
        createMockServiceClient({
          truck: { data: null, error: null },
          job: { data: { id: 'job-1' }, error: null },
        }) as never,
        'agency-1',
        'driver-1',
      ),
    Error,
    'Driver is not assigned to this agency fleet.',
  )
})

Deno.test('assertDriverAffiliatedWithAgency allows drivers with accepted offers', async () => {
  const mockClient = {
    from(table: string) {
      if (table === 'agency_trucks') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
          }),
        }
      }

      if (table === 'agency_jobs') {
        const jobResult = { data: { id: 'job-1' }, error: null }
        const emptyJobResult = { data: null, error: null }
        const limitMaybeSingle = (result: typeof jobResult) => ({
          maybeSingle: async () => result,
        })
        const eqShipment = () => ({
          limit: () => limitMaybeSingle(jobResult),
        })
        const eqDriver = () => ({
          neq: () => ({
            limit: () => limitMaybeSingle(emptyJobResult),
          }),
        })

        return {
          select: () => ({
            eq: () => ({
              eq: (column: string) => (column === 'shipment_id' ? eqShipment() : eqDriver()),
              neq: () => ({
                limit: () => limitMaybeSingle(emptyJobResult),
              }),
            }),
          }),
        }
      }

      if (table === 'job_offers') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: { id: 'offer-1' }, error: null }),
                  }),
                }),
              }),
            }),
          }),
        }
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }

  await assertDriverAffiliatedWithAgency(
    mockClient as never,
    'agency-1',
    'driver-1',
    { shipmentId: 'ship-1' },
  )
})

Deno.test('assertDriverAffiliatedWithAgency rejects unaffiliated drivers', async () => {
  await assertRejects(
    () =>
      assertDriverAffiliatedWithAgency(
        createMockServiceClient({
          truck: { data: null, error: null },
          job: { data: null, error: null },
          offer: { data: null, error: null },
        }) as never,
        'agency-1',
        'driver-1',
      ),
    Error,
    'Driver is not affiliated with this agency.',
  )
})
