import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/admin-portal-drivers'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const DRIVER = '33333333-3333-4333-8333-333333333333'

const h = await loadFunction('admin-portal-drivers')

/** Scripts the caller role and the drivers table. `result` is what each write or read returns. */
function setup({ role = 'admin', result = { data: { id: DRIVER, status: 'approved' }, error: null }, rows = [] } = {}) {
  h.reset({ env: ENV })
  h.fake
    .onGetUser(() => ({ data: { user: { id: ADMIN } }, error: null }))
    .onFrom('users', () => ({ data: { id: ADMIN, role }, error: null }))
    .onFrom('drivers', (rec) => {
      if (rec.ops.some(([op]) => op === 'update' || op === 'maybeSingle')) {
        return result
      }
      return { data: rows, error: null }
    })
}

const driverCalls = () => h.fake.fromCalls('drivers')
const writes = () => driverCalls().filter((c) => c.ops.some(([op]) => op === 'update'))
const post = (body, raw) => h.call(URL_, { method: 'POST', body: raw ?? JSON.stringify(body), headers: { authorization: 'Bearer token', 'content-type': 'application/json' } })

beforeEach(() => setup())

test('no bearer token is 401 and touches nothing', async () => {
  const res = await h.call(URL_, { method: 'POST', body: JSON.stringify({ action: 'list', status: 'pending' }) })
  assert.equal(res.status, 401)
  assert.equal(driverCalls().length, 0)
})

test('non-admin caller is refused with 403 and no driver write', async () => {
  setup({ role: 'driver' })
  const res = await post({ action: 'approve', driverId: DRIVER })
  assert.equal(res.status, 403)
  assert.equal(writes().length, 0)
})

test('admin approve happy path returns the driver and stamps the approver', async () => {
  const res = await post({ action: 'approve', driverId: DRIVER })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).driver.id, DRIVER)
  const payload = writes()[0].ops.find(([op]) => op === 'update')[1]
  assert.equal(payload.status, 'approved')
  assert.equal(payload.approved_by, ADMIN)
})

test('admin list is capped at 200 rows, newest first, and filters by status', async () => {
  setup({ rows: [{ id: DRIVER, status: 'pending' }] })
  const res = await post({ action: 'list', status: 'pending' })
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).drivers, [{ id: DRIVER, status: 'pending' }])
  const ops = driverCalls()[0].ops
  assert.ok(ops.some(([op, col, val]) => op === 'eq' && col === 'status' && val === 'pending'))
  assert.ok(ops.some(([op, n]) => op === 'limit' && n === 200))
})

test('admin get with a valid id returns the driver, null when absent', async () => {
  setup({ result: { data: null, error: null } })
  let res = await post({ action: 'get', driverId: DRIVER })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).driver, null)
  setup({ result: { data: { id: DRIVER, status: 'pending' }, error: null } })
  res = await post({ action: 'get', driverId: DRIVER })
  assert.equal((await res.json()).driver.id, DRIVER)
})

test('a non-uuid driver id is refused with 400 before any database call', async () => {
  for (const action of ['get', 'approve', 'suspend']) {
    const res = await post({ action, driverId: "'; drop table drivers; --" })
    assert.equal(res.status, 400, action)
    assert.equal((await res.json()).error, 'A valid driver id is required.')
  }
  assert.equal(driverCalls().length, 0)
})

test('reject with a blank reason is refused, and a valid reason is stored trimmed', async () => {
  let res = await post({ action: 'reject', driverId: DRIVER, rejectionReason: '  ' })
  assert.equal(res.status, 400)
  assert.equal(writes().length, 0)

  res = await post({ action: 'reject', driverId: DRIVER, rejectionReason: '  Blurred licence  ' })
  assert.equal(res.status, 200)
  assert.equal(writes()[0].ops.find(([op]) => op === 'update')[1].rejection_reason, 'Blurred licence')
})

test('an unknown driver on approve, reject or suspend is 404, not a generic 500', async () => {
  setup({ result: { data: null, error: null } })
  for (const body of [
    { action: 'approve', driverId: DRIVER },
    { action: 'reject', driverId: DRIVER, rejectionReason: 'No licence' },
    { action: 'suspend', driverId: DRIVER },
  ]) {
    const res = await post(body)
    assert.equal(res.status, 404, body.action)
    assert.equal((await res.json()).error, 'Driver not found.')
  }
})

test('invalid JSON body and unknown action are 400', async () => {
  let res = await post(null, '{not json')
  assert.equal(res.status, 400)
  res = await post({ action: 'delete-everything' })
  assert.equal(res.status, 400)
})

test('database errors return a calm message with no raw database text', async () => {
  setup({ result: { data: null, error: { message: 'new row violates check constraint "drivers_status_check" DETAIL: secret' } } })
  const res = await post({ action: 'suspend', driverId: DRIVER })
  assert.equal(res.status, 500)
  const text = await res.text()
  assert.ok(!text.includes('constraint') && !text.includes('secret'), 'raw DB message must not reach the client')
  assert.equal(JSON.parse(text).error, 'Unable to complete the request.')
})
