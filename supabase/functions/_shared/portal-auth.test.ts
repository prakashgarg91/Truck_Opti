import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  assertApprovedAgency,
  assertApprovedDriver,
  assertDriverLinkedToAgency,
  RequestError,
} from './portal-auth.ts'

type QueryResult = { data: { id: string; status?: string | null } | null; error: null }

function createMockServiceClient(responses: {
  truck: QueryResult
  job: QueryResult
  driver?: QueryResult
}) {
  const buildChain = (result: QueryResult) => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          limit: () => ({
            maybeSingle: async () => result,
          }),
        }),
        maybeSingle: async () => result,
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

      if (table === 'drivers') {
        return buildChain(responses.driver ?? { data: null, error: null })
      }

      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

Deno.test('assertApprovedAgency allows approved agencies', () => {
  assertApprovedAgency('approved')
})

Deno.test('assertApprovedAgency rejects pending agencies', () => {
  assertRejects(
    () => Promise.resolve().then(() => assertApprovedAgency('pending')),
    RequestError,
    'Agency approval is required.',
  )
})

Deno.test('assertApprovedDriver allows approved drivers', async () => {
  await assertApprovedDriver(
    createMockServiceClient({
      truck: { data: null, error: null },
      job: { data: null, error: null },
      driver: { data: { id: 'driver-1', status: 'approved' }, error: null },
    }) as never,
    'driver-1',
  )
})

Deno.test('assertApprovedDriver rejects non-approved drivers', async () => {
  await assertRejects(
    () =>
      assertApprovedDriver(
        createMockServiceClient({
          truck: { data: null, error: null },
          job: { data: null, error: null },
          driver: { data: { id: 'driver-1', status: 'pending' }, error: null },
        }) as never,
        'driver-1',
      ),
    RequestError,
    'Only approved drivers can be assigned or paid.',
  )
})

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
