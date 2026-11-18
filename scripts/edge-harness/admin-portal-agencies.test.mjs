import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/admin-portal-agencies'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const AGENCY = '22222222-2222-4222-8222-222222222222'

const h = await loadFunction('admin-portal-agencies')

/**
 * Scripts the caller role and the transport_agencies table.
 * `current` is the row the lookup returns (null = not found). `updated` is what the conditional UPDATE returns
 * (null = status changed under us).
 */
function setup({ role = 'admin', current = { id: AGENCY, status: 'pending', approved_at: null }, lookupError = null, updated = { id: AGENCY, status: 'approved' }, updateError = null, rows = [] } = {}) {
  h.reset({ env: ENV })
  h.fake
    .onGetUser(() => ({ data: { user: { id: ADMIN } }, error: null }))
    .onFrom('users', () => ({ data: { id: ADMIN, role }, error: null }))
    .onFrom('transport_agencies', (rec) => {
      if (rec.ops.some(([op, , opts]) => op === 'select' && opts?.head)) return { count: 0, data: null, error: null }
      if (rec.ops.some(([op]) => op === 'update')) return updateError ? { data: null, error: updateError } : { data: updated, error: null }
      if (rec.ops.some(([op, cols]) => op === 'select' && cols === 'id, status, approved_at')) {
        return lookupError ? { data: null, error: lookupError } : { data: current, error: null }
      }
      return { data: rows, error: null }
    })
}

const updates = () => h.fake.fromCalls('transport_agencies').filter((c) => c.ops.some(([op]) => op === 'update'))
const updatePayload = (rec) => rec.ops.find(([op]) => op === 'update')[1]
const post = (body, raw) => h.call(URL_, { method: 'POST', body: raw ?? JSON.stringify(body), headers: { authorization: 'Bearer token', 'content-type': 'application/json' } })

beforeEach(() => setup())

test('no bearer token is 401 and touches nothing', async () => {
  const res = await h.call(URL_, { method: 'POST', body: JSON.stringify({ action: 'list', status: 'pending' }) })
  assert.equal(res.status, 401)
  assert.equal(h.fake.fromCalls('transport_agencies').length, 0)
})

test('non-admin caller is refused with 403 and no agency write', async () => {
  setup({ role: 'agency' })
  const res = await post({ action: 'approve', agencyId: AGENCY })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).error, 'Admin access is required.')
  assert.equal(updates().length, 0)
})

test('admin list returns agencies and counts', async () => {
  setup({ rows: [{ id: AGENCY, status: 'pending' }] })
  const res = await post({ action: 'list', status: 'pending' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body.agencies, [{ id: AGENCY, status: 'pending' }])
  assert.deepEqual(Object.keys(body.counts).sort(), ['approved', 'pending', 'rejected', 'suspended'])
})

test('list is capped at 200 rows, newest first', async () => {
  await post({ action: 'list', status: 'pending' })
  const listCall = h.fake.fromCalls('transport_agencies').find((c) => c.ops.some(([op]) => op === 'order'))
  assert.ok(listCall.ops.some(([op, n]) => op === 'limit' && n === 200), 'list must set limit 200')
})

test('bad list status and bad agency id are 400 before any database read', async () => {
  let res = await post({ action: 'list', status: 'archived' })
  assert.equal(res.status, 400)
  res = await post({ action: 'approve', agencyId: 'not-a-uuid' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'A valid agency id is required.')
  assert.equal(h.fake.fromCalls('transport_agencies').length, 0)
})

test('invalid JSON body is 400 with a calm message, not a 500', async () => {
  const res = await post(null, '{not json')
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'A valid admin action is required.')
})

test('reject with a blank reason is refused', async () => {
  const res = await post({ action: 'reject', agencyId: AGENCY, rejectionReason: '   ' })
  assert.equal(res.status, 400)
  assert.equal(updates().length, 0)
})

test('approve from pending is the happy path and sets approved_at', async () => {
  const res = await post({ action: 'approve', agencyId: AGENCY })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).agency.status, 'approved')
  const payload = updatePayload(updates()[0])
  assert.equal(payload.status, 'approved')
  assert.match(payload.approved_at, /^\d{4}-\d{2}-\d{2}T/)
  assert.ok(updates()[0].ops.some(([op, col, val]) => op === 'eq' && col === 'status' && val === 'pending'), 'update must be conditional on the status read')
})

test('reinstate (suspended -> approved) keeps the original approved_at', async () => {
  setup({ current: { id: AGENCY, status: 'suspended', approved_at: '2026-01-05T00:00:00.000Z' }, updated: { id: AGENCY, status: 'approved' } })
  const res = await post({ action: 'approve', agencyId: AGENCY })
  assert.equal(res.status, 200)
  assert.equal(updatePayload(updates()[0]).approved_at, '2026-01-05T00:00:00.000Z')
})

test('approve on an already approved agency is 409 and writes nothing', async () => {
  setup({ current: { id: AGENCY, status: 'approved', approved_at: '2026-01-05T00:00:00.000Z' } })
  const res = await post({ action: 'approve', agencyId: AGENCY })
  assert.equal(res.status, 409)
  assert.equal(updates().length, 0)
})

test('reject is refused unless the agency is pending (no rejecting an approved agency)', async () => {
  setup({ current: { id: AGENCY, status: 'approved', approved_at: '2026-01-05T00:00:00.000Z' } })
  const res = await post({ action: 'reject', agencyId: AGENCY, rejectionReason: 'Bad documents' })
  assert.equal(res.status, 409)
  assert.equal(updates().length, 0)
})

test('suspend is refused unless the agency is approved', async () => {
  const res = await post({ action: 'suspend', agencyId: AGENCY })
  assert.equal(res.status, 409)
  assert.equal(updates().length, 0)
})

test('suspend from approved writes status suspended', async () => {
  setup({ current: { id: AGENCY, status: 'approved', approved_at: '2026-01-05T00:00:00.000Z' }, updated: { id: AGENCY, status: 'suspended' } })
  const res = await post({ action: 'suspend', agencyId: AGENCY })
  assert.equal(res.status, 200)
  assert.equal(updatePayload(updates()[0]).status, 'suspended')
})

test('unknown agency is 404', async () => {
  setup({ current: null })
  const res = await post({ action: 'approve', agencyId: AGENCY })
  assert.equal(res.status, 404)
  assert.equal(updates().length, 0)
})

test('status changed between read and write is 409, not a silent success', async () => {
  setup({ updated: null })
  const res = await post({ action: 'approve', agencyId: AGENCY })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'The agency status changed. Refresh and try again.')
})

test('database errors return a calm message with no raw database text', async () => {
  setup({ updateError: { message: 'duplicate key value violates unique constraint "transport_agencies_pkey"' } })
  const res = await post({ action: 'approve', agencyId: AGENCY })
  assert.equal(res.status, 500)
  const text = await res.text()
  assert.ok(!text.includes('constraint'), 'raw DB message must not reach the client')
  assert.equal(JSON.parse(text).error, 'Unable to complete the request.')

  setup({ lookupError: { message: 'permission denied for table transport_agencies' } })
  const lookup = await post({ action: 'suspend', agencyId: AGENCY })
  assert.equal(lookup.status, 500)
  assert.ok(!(await lookup.text()).includes('permission denied'))
})
