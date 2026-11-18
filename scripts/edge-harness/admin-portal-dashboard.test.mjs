import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/admin-portal-dashboard'
const ADMIN = '11111111-1111-4111-8111-111111111111'

const h = await loadFunction('admin-portal-dashboard')

/** Build `n` recent delivered agency jobs; the fake ignores .limit(), so the function's own slice is what is tested. */
const manyRecentJobs = (n) => Array.from({ length: n }, (_, i) => ({
  id: `job-${i}`, agency_id: 'a1', fare: 10, created_at: '2026-11-01T00:00:00Z', updated_at: `2026-11-${String((i % 28) + 1).padStart(2, '0')}T00:00:00Z`,
  shipments: { origin: 'Pune', destination: 'Goa', shipment_id: `S-${i}` },
}))

function setup({ role = 'admin', recentRows = manyRecentJobs(250), failTable = null } = {}) {
  h.reset({ env: ENV })
  h.fake
    .onGetUser(() => ({ data: { user: { id: ADMIN } }, error: null }))
    .onFrom('users', () => ({ data: { id: ADMIN, role }, error: null }))
    .onFrom('agency_jobs', (rec) => {
      if (failTable === 'agency_jobs') return { data: null, error: { message: 'relation "agency_jobs" secret detail' } }
      if (rec.ops.some(([op]) => op === 'order')) return { data: recentRows, error: null }
      if (rec.ops.some(([op, cols]) => op === 'select' && cols === 'shipment_id')) return { data: [{ shipment_id: 's1' }], error: null }
      return { data: [{ id: 'job-a', agency_id: 'a1', shipment_id: 's1', fare: 100 }], error: null }
    })
    .onFrom('job_offers', (rec) => {
      if (rec.ops.some(([op]) => op === 'order')) return { data: [], error: null }
      return { data: [{ id: 'offer-1', shipment_id: 's2', driver_id: 'd1', shipments: { estimated_cost: 50 } }], error: null }
    })
    .onFrom('shipments', (rec) => {
      if (rec.ops.some(([op, , opts]) => op === 'select' && opts?.head)) return { count: 7, data: null, error: null }
      return { data: [], error: null }
    })
    .onFrom('transport_agencies', (rec) => {
      if (rec.ops.some(([op, , opts]) => op === 'select' && opts?.head)) return { count: 2, data: null, error: null }
      return { data: [{ id: 'a1', company_name: 'Acme Transport' }], error: null }
    })
    .onFrom('drivers', (rec) => {
      if (rec.ops.some(([op, , opts]) => op === 'select' && opts?.head)) return { count: 3, data: null, error: null }
      return { data: [{ id: 'd1', full_name: 'Ravi', phone: '9999' }], error: null }
    })
}

const post = (body, raw) => h.call(URL_, { method: 'POST', body: raw ?? JSON.stringify(body), headers: { authorization: 'Bearer token', 'content-type': 'application/json' } })
const limitOf = (table, index = 0) => h.fake.fromCalls(table).filter((c) => c.ops.some(([op]) => op === 'order'))[index]?.ops.find(([op]) => op === 'limit')?.[1]

beforeEach(() => setup())

test('no bearer token is 401 and no analytics table is read', async () => {
  const res = await h.call(URL_, { method: 'POST', body: JSON.stringify({ action: 'snapshot' }) })
  assert.equal(res.status, 401)
  assert.equal(h.fake.fromCalls('agency_jobs').length, 0)
})

test('non-admin caller is refused with 403 and no analytics table is read', async () => {
  setup({ role: 'agency' })
  const res = await post({ action: 'snapshot' })
  assert.equal(res.status, 403)
  assert.equal(h.fake.fromCalls('agency_jobs').length, 0)
})

test('admin snapshot happy path returns analytics and recent jobs', async () => {
  const res = await post({ action: 'snapshot', limit: 5 })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.analytics.agencyRevenue, 100)
  assert.equal(body.analytics.driverRevenue, 50)
  assert.equal(body.analytics.totalRevenue, 150)
  assert.equal(body.analytics.totalAgencies, 2)
  assert.equal(body.analytics.totalDrivers, 3)
  assert.equal(body.analytics.totalShipments, 7)
  assert.equal(body.analytics.platformFee, 15)
  assert.equal(body.recentJobs.length, 5)
  assert.ok(['Agency Network', 'Driver Network'].includes(body.recentJobs[0].source))
})

test('default limit is 20 when the client sends none', async () => {
  const res = await post({ action: 'snapshot' })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).recentJobs.length, 20)
  assert.equal(limitOf('agency_jobs'), 20)
})

test('client limit is capped at 200 rows in both the query and the response', async () => {
  setup({ recentRows: manyRecentJobs(400) })
  const res = await post({ action: 'snapshot', limit: 5000 })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).recentJobs.length, 200)
  assert.equal(limitOf('agency_jobs'), 200)
  assert.equal(limitOf('job_offers'), 200)
})

test('bad limit values are 400 before any table is read', async () => {
  for (const limit of [0, -3, 'ten', Number.NaN]) {
    const res = await post({ action: 'snapshot', limit })
    assert.equal(res.status, 400, String(limit))
  }
  assert.equal(h.fake.fromCalls('agency_jobs').length, 0)
})

test('invalid JSON and unknown action are 400', async () => {
  assert.equal((await post(null, '{not json')).status, 400)
  assert.equal((await post({ action: 'export' })).status, 400)
})

test('a database error returns the calm message with no raw database text', async () => {
  setup({ failTable: 'agency_jobs' })
  const res = await post({ action: 'snapshot' })
  assert.equal(res.status, 500)
  const text = await res.text()
  assert.ok(!text.includes('secret'), 'raw DB message must not reach the client')
  assert.equal(JSON.parse(text).error, 'Unable to complete the request.')
})
