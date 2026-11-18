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
  assert.ok(ops.some(([op, n]) => op === 'limit' && n === 200))
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
