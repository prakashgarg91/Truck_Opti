import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/admin-portal-contact'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const INQUIRY = '44444444-4444-4444-8444-444444444444'

const h = await loadFunction('admin-portal-contact')

/** `updated` is what the resolve UPDATE returns (null = no row matched the id). */
function setup({ role = 'admin', updated = { id: INQUIRY }, updateError = null, rows = [] } = {}) {
  h.reset({ env: ENV })
  h.fake
    .onGetUser(() => ({ data: { user: { id: ADMIN } }, error: null }))
    .onFrom('users', () => ({ data: { id: ADMIN, role }, error: null }))
    .onFrom('contact_inquiries', (rec) => {
      if (rec.ops.some(([op]) => op === 'update')) return updateError ? { data: null, error: updateError } : { data: updated, error: null }
      return { data: rows, error: null }
    })
}

const inquiryCalls = () => h.fake.fromCalls('contact_inquiries')
const updates = () => inquiryCalls().filter((c) => c.ops.some(([op]) => op === 'update'))
const post = (body, raw) => h.call(URL_, { method: 'POST', body: raw ?? JSON.stringify(body), headers: { authorization: 'Bearer token', 'content-type': 'application/json' } })

beforeEach(() => setup())

test('no bearer token is 401 and touches nothing', async () => {
  const res = await h.call(URL_, { method: 'POST', body: JSON.stringify({ action: 'list' }) })
  assert.equal(res.status, 401)
  assert.equal(inquiryCalls().length, 0)
})

test('non-admin caller is refused with 403 and nothing is resolved', async () => {
  setup({ role: 'driver' })
  const res = await post({ action: 'resolve', inquiryId: INQUIRY })
  assert.equal(res.status, 403)
  assert.equal(updates().length, 0)
})

test('admin list returns inquiries, newest first, capped at 200', async () => {
  setup({ rows: [{ id: INQUIRY, status: 'open' }] })
  const res = await post({ action: 'list' })
  assert.equal(res.status, 200)
  assert.deepEqual((await res.json()).inquiries, [{ id: INQUIRY, status: 'open' }])
  const ops = inquiryCalls()[0].ops
  assert.ok(ops.some(([op, col, asc]) => op === 'order' && col === 'created_at' && asc?.ascending === false))
  assert.ok(ops.some(([op, from, to]) => op === 'range' && from === 0 && to === 200), 'first page reads range 0 to 200 (201 rows)')
})

test('admin resolve happy path writes status resolved and returns the message', async () => {
  const res = await post({ action: 'resolve', inquiryId: INQUIRY })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { message: 'Inquiry resolved.' })
  const payload = updates()[0].ops.find(([op]) => op === 'update')[1]
  assert.deepEqual(payload, { status: 'resolved' })
})

test('resolve of an unknown inquiry is 404, not a false "resolved"', async () => {
  setup({ updated: null })
  const res = await post({ action: 'resolve', inquiryId: INQUIRY })
  assert.equal(res.status, 404)
  assert.equal((await res.json()).error, 'Inquiry not found.')
})

test('a non-uuid inquiry id is refused with 400 before any write', async () => {
  const res = await post({ action: 'resolve', inquiryId: 'abc' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'A valid inquiry id is required.')
  assert.equal(inquiryCalls().length, 0)
})

test('unknown action and invalid JSON are 400', async () => {
  assert.equal((await post({ action: 'delete' })).status, 400)
  assert.equal((await post(null, '{not json')).status, 400)
})

test('database errors return a calm message with no raw database text', async () => {
  setup({ updateError: { message: 'permission denied for table contact_inquiries' } })
  const res = await post({ action: 'resolve', inquiryId: INQUIRY })
  assert.equal(res.status, 500)
  const text = await res.text()
  assert.ok(!text.includes('permission denied'), 'raw DB message must not reach the client')
  assert.equal(JSON.parse(text).error, 'Unable to complete the request.')
})

// Paging: the list action reads range(offset, offset + 200) and reports has_more from the 201st row.
/** Fake contact table that honours newest-first order and range(), like PostgREST. */
function setupTable(total, { role = 'admin' } = {}) {
  const table = Array.from({ length: total }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    status: 'open',
    created_at: new Date(Date.UTC(2026, 10, 1) - i * 60000).toISOString(),
  }))
  setup({ role })
  h.fake.onFrom('contact_inquiries', (rec) => {
    if (rec.ops.some(([op]) => op === 'update')) return { data: { id: INQUIRY }, error: null }
    const range = rec.ops.find(([op]) => op === 'range')
    const from = range ? range[1] : 0
    const to = range ? range[2] : table.length - 1
    return { data: table.slice(from, to + 1), error: null }
  })
  return table
}

const pageOf = async (body) => {
  const res = await post(body)
  assert.equal(res.status, 200)
  return res.json()
}
const rangeOf = (call) => call.ops.find(([op]) => op === 'range')

test('list without an offset reads the first page: range 0 to 200, and has_more is false for a short table', async () => {
  setupTable(3)
  const body = await pageOf({ action: 'list' })
  assert.equal(body.inquiries.length, 3)
  assert.equal(body.has_more, false)
  assert.deepEqual(rangeOf(inquiryCalls()[0]).slice(1), [0, 200])
})

test('list orders by created_at then id, so pages have a stable final tiebreaker', async () => {
  setupTable(1)
  await pageOf({ action: 'list' })
  const ops = inquiryCalls()[0].ops
  assert.ok(ops.some(([op, col, opts]) => op === 'order' && col === 'id' && opts?.ascending === false))
})

test('offset 200 returns the next rows with no overlap across the pages of a 450-row table', async () => {
  const table = setupTable(450)
  const first = await pageOf({ action: 'list' })
  const second = await pageOf({ action: 'list', offset: 200 })
  const third = await pageOf({ action: 'list', offset: 400 })
  assert.equal(first.inquiries.length, 200)
  assert.equal(second.inquiries.length, 200)
  assert.equal(third.inquiries.length, 50)
  assert.deepEqual([first.has_more, second.has_more, third.has_more], [true, true, false])
  const ids = [...first.inquiries, ...second.inquiries, ...third.inquiries].map((i) => i.id)
  assert.deepEqual(ids, table.map((r) => r.id), 'pages join up in order with no skips or repeats')
  assert.equal(new Set(ids).size, 450)
  assert.deepEqual(rangeOf(inquiryCalls()[1]).slice(1), [200, 400])
})

test('has_more is false at exactly 200 rows, true at 201 (200 returned), and at 400 rows is true then false', async () => {
  setupTable(200)
  let body = await pageOf({ action: 'list' })
  assert.equal(body.inquiries.length, 200)
  assert.equal(body.has_more, false)

  setupTable(201)
  body = await pageOf({ action: 'list' })
  assert.equal(body.inquiries.length, 200, 'the extra probe row is never returned')
  assert.equal(body.has_more, true)

  setupTable(400)
  body = await pageOf({ action: 'list' })
  assert.equal(body.has_more, true)
  body = await pageOf({ action: 'list', offset: 200 })
  assert.equal(body.inquiries.length, 200)
  assert.equal(body.has_more, false)
})

test('invalid offsets are refused with 400 before any inquiry read', async () => {
  setupTable(5)
  for (const offset of [-1, 1.5, '200', 100001, true, null]) {
    const res = await post({ action: 'list', offset })
    assert.equal(res.status, 400, JSON.stringify(offset))
    assert.equal((await res.json()).error, 'A valid offset is required.')
  }
  assert.equal(inquiryCalls().length, 0)
})

test('the maximum offset 100000 is accepted', async () => {
  setupTable(5)
  const res = await post({ action: 'list', offset: 100000 })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).has_more, false)
})

test('a non-admin caller is still refused when paging the list', async () => {
  setupTable(450, { role: 'driver' })
  const res = await post({ action: 'list', offset: 200 })
  assert.equal(res.status, 403)
  assert.equal(inquiryCalls().length, 0)
})
