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
  assert.ok(ops.some(([op, from, to]) => op === 'range' && from === 0 && to === 200), 'first page reads range 0 to 200 (201 rows)')
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

// Paging: the list action reads range(offset, offset + 200) and reports has_more from the 201st row.
/** Fake drivers table that honours the status filter, newest-first order and range(), like PostgREST. */
function setupTable(total, { role = 'admin' } = {}) {
  const table = Array.from({ length: total }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    status: 'pending',
    created_at: new Date(Date.UTC(2026, 10, 1) - i * 60000).toISOString(),
  }))
  setup({ role })
  h.fake.onFrom('drivers', (rec) => {
    if (rec.ops.some(([op]) => op === 'update' || op === 'maybeSingle')) {
      return { data: { id: DRIVER, status: 'approved' }, error: null }
    }
    const status = rec.ops.find(([op, col]) => op === 'eq' && col === 'status')?.[2]
    const range = rec.ops.find(([op]) => op === 'range')
    const from = range ? range[1] : 0
    const to = range ? range[2] : table.length - 1
    return { data: table.filter((r) => r.status === status).slice(from, to + 1), error: null }
  })
  return table
}

const listBody = (extra = {}) => ({ action: 'list', status: 'pending', ...extra })
const rangeOf = (call) => call.ops.find(([op]) => op === 'range')
const pageOf = async (body) => {
  const res = await post(body)
  assert.equal(res.status, 200)
  return res.json()
}

test('list without an offset reads the first page: range 0 to 200, and has_more is false for a short table', async () => {
  setupTable(3)
  const body = await pageOf(listBody())
  assert.equal(body.drivers.length, 3)
  assert.equal(body.has_more, false)
  assert.deepEqual(rangeOf(driverCalls()[0]).slice(1), [0, 200])
})

test('list orders by created_at then id, so pages have a stable final tiebreaker', async () => {
  setupTable(1)
  await pageOf(listBody())
  const ops = driverCalls()[0].ops
  assert.ok(ops.some(([op, col, opts]) => op === 'order' && col === 'created_at' && opts?.ascending === false))
  assert.ok(ops.some(([op, col, opts]) => op === 'order' && col === 'id' && opts?.ascending === false))
})

test('offset 200 returns the next rows with no overlap across the pages of a 450-row table', async () => {
  const table = setupTable(450)
  const first = await pageOf(listBody())
  const second = await pageOf(listBody({ offset: 200 }))
  const third = await pageOf(listBody({ offset: 400 }))
  assert.equal(first.drivers.length, 200)
  assert.equal(second.drivers.length, 200)
  assert.equal(third.drivers.length, 50)
  assert.deepEqual([first.has_more, second.has_more, third.has_more], [true, true, false])
  const ids = [...first.drivers, ...second.drivers, ...third.drivers].map((d) => d.id)
  assert.deepEqual(ids, table.map((r) => r.id), 'pages join up in order with no skips or repeats')
  assert.equal(new Set(ids).size, 450)
  assert.deepEqual(rangeOf(driverCalls()[1]).slice(1), [200, 400])
})

test('has_more is false at exactly 200 rows, true at 201 (200 returned), and at 400 rows is true then false', async () => {
  setupTable(200)
  let body = await pageOf(listBody())
  assert.equal(body.drivers.length, 200)
  assert.equal(body.has_more, false)

  setupTable(201)
  body = await pageOf(listBody())
  assert.equal(body.drivers.length, 200, 'the extra probe row is never returned')
  assert.equal(body.has_more, true)

  setupTable(400)
  body = await pageOf(listBody())
  assert.equal(body.has_more, true)
  body = await pageOf(listBody({ offset: 200 }))
  assert.equal(body.drivers.length, 200)
  assert.equal(body.has_more, false)
})

test('invalid offsets are refused with 400 before any driver read', async () => {
  setupTable(5)
  for (const offset of [-1, 1.5, '200', 100001, true, null]) {
    const res = await post(listBody({ offset }))
    assert.equal(res.status, 400, JSON.stringify(offset))
    assert.equal((await res.json()).error, 'A valid offset is required.')
  }
  assert.equal(driverCalls().length, 0)
})

test('the maximum offset 100000 is accepted', async () => {
  setupTable(5)
  const res = await post(listBody({ offset: 100000 }))
  assert.equal(res.status, 200)
  assert.equal((await res.json()).has_more, false)
})

test('a non-admin caller is still refused when paging the list', async () => {
  setupTable(450, { role: 'driver' })
  const res = await post(listBody({ offset: 200 }))
  assert.equal(res.status, 403)
  assert.equal(driverCalls().length, 0)
})
