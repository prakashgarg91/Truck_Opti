import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { assertDriverLinkedToAgency } from './portal-auth.ts'

type QueryResult = { data: { id: string } | null; error: null }

function createMockServiceClient(responses: {
  truck: QueryResult
  job: QueryResult
}) {
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
        return buildChain(responses.truck)
      }

      if (table === 'agency_jobs') {
        return buildChain(responses.job)
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
