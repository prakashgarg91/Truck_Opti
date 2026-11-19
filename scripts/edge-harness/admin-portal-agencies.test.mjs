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

test('list is a 200-row page (range 0..200 fetches 201 to detect more), newest first with id tiebreaker', async () => {
  await post({ action: 'list', status: 'pending' })
  const listCall = h.fake.fromCalls('transport_agencies').find((c) => c.ops.some(([op]) => op === 'order'))
  assert.ok(listCall.ops.some(([op, from, to]) => op === 'range' && from === 0 && to === 200), 'list must range 0..200')
  assert.ok(listCall.ops.some(([op, col, opts]) => op === 'order' && col === 'created_at' && opts?.ascending === false))
  assert.ok(listCall.ops.some(([op, col, opts]) => op === 'order' && col === 'id' && opts?.ascending === false), 'id must be the final tiebreaker')
})

/**
 * Seeds `total` pending agencies in the fake table and applies .range(from, to) the way PostgREST does.
 * created_at ties in pairs, so the id tiebreaker is what keeps page boundaries stable.
 */
function seedPaged(total, role = 'admin') {
  setup({ role })
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    status: 'pending',
    created_at: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 2) * 1000).toISOString(),
  })).sort((a, b) => (b.created_at === a.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
  h.fake.onFrom('transport_agencies', (rec) => {
    if (rec.ops.some(([op, , opts]) => op === 'select' && opts?.head)) return { count: 0, data: null, error: null }
    const range = rec.ops.find(([op]) => op === 'range')
    if (range) return { data: rows.slice(range[1], range[2] + 1), error: null }
    return { data: [], error: null }
  })
  return rows
}

const idsOf = (body) => body.agencies.map((a) => a.id)

test('offset defaults to 0 and a first page holds 200 rows with has_more true when 450 exist', async () => {
  seedPaged(450)
  const res = await post({ action: 'list', status: 'pending' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.agencies.length, 200)
  assert.equal(body.has_more, true)
  assert.equal(idsOf(body)[0], '00000000-0000-4000-8000-000000000449', 'newest row first')
})

test('offset=200 returns the next rows with no overlap, and paging through 450 rows covers each once', async () => {
  seedPaged(450)
  const first = await (await post({ action: 'list', status: 'pending' })).json()
  const second = await (await post({ action: 'list', status: 'pending', offset: 200 })).json()
  const third = await (await post({ action: 'list', status: 'pending', offset: 400 })).json()

  assert.equal(second.agencies.length, 200)
  assert.equal(second.has_more, true)
  assert.equal(third.agencies.length, 50)
  assert.equal(third.has_more, false)

  const all = [...idsOf(first), ...idsOf(second), ...idsOf(third)]
  assert.equal(new Set(all).size, 450, 'no row is skipped or repeated across pages')
})

test('has_more is false at exactly 200 rows, true at 201, and false on a final partial page of 400', async () => {
  seedPaged(200)
  assert.equal((await (await post({ action: 'list', status: 'pending' })).json()).has_more, false)

  seedPaged(201)
  const at201 = await (await post({ action: 'list', status: 'pending' })).json()
  assert.equal(at201.agencies.length, 200)
  assert.equal(at201.has_more, true)

  seedPaged(400)
  const last = await (await post({ action: 'list', status: 'pending', offset: 200 })).json()
  assert.equal(last.agencies.length, 200)
  assert.equal(last.has_more, false)
})

test('offset past the end returns an empty page with has_more false', async () => {
  seedPaged(10)
  const body = await (await post({ action: 'list', status: 'pending', offset: 200 })).json()
  assert.deepEqual(body.agencies, [])
  assert.equal(body.has_more, false)
})

test('offset boundary values 0 and 100000 are accepted', async () => {
  seedPaged(3)
  assert.equal((await post({ action: 'list', status: 'pending', offset: 0 })).status, 200)
  assert.equal((await post({ action: 'list', status: 'pending', offset: 100000 })).status, 200)
})

test('invalid offsets are 400 with the calm message and no agency read', async () => {
  seedPaged(10)
  for (const offset of [-1, 1.5, 100001, '200', null, NaN, true]) {
    const res = await post({ action: 'list', status: 'pending', offset })
    assert.equal(res.status, 400, `offset ${String(offset)}`)
    assert.equal((await res.json()).error, 'A valid offset is required.')
  }
  assert.equal(h.fake.fromCalls('transport_agencies').length, 0)
})

test('a non-admin caller asking for a page is still refused with 403 and reads no agencies', async () => {
  seedPaged(10, 'agency')
  const res = await post({ action: 'list', status: 'pending', offset: 200 })
  assert.equal(res.status, 403)
  assert.equal(h.fake.fromCalls('transport_agencies').length, 0)
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
