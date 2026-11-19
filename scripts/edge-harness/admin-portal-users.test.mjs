import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/admin-portal-users'
const ADMIN = '11111111-1111-4111-8111-111111111111'
const TARGET = '55555555-5555-4555-8555-555555555555'
const GENERIC = 'Unable to complete the admin user request.'

const h = await loadFunction('admin-portal-users')

let authCalls = []
let authErrors = {}

/**
 * Scripts the caller role, the target profile and the auth admin API. The fake client has no auth.admin,
 * so the service-role client is given one here. `target` null means no such profile.
 */
function setup({ role = 'admin', target = { id: TARGET, email: 'owner@example.com', role: 'agency', created_at: 'c', updated_at: 'u', name: null, phone: null }, profiles = [], profileError = null, authErrs = {} } = {}) {
  h.reset({ env: ENV })
  authCalls = []
  authErrors = authErrs
  h.fake
    .onGetUser(() => ({ data: { user: { id: ADMIN } }, error: null }))
    .onFrom('users', (rec) => {
      if (rec.ops.some(([op]) => op === 'maybeSingle')) {
        const cols = rec.ops.find(([op]) => op === 'select')[1]
        if (cols === 'id, role') return { data: { id: ADMIN, role }, error: null }
        return { data: target, error: null }
      }
      return profileError ? { data: null, error: profileError } : { data: profiles, error: null }
    })
  const base = h.fake.makeClient
  h.fake.makeClient = (url, key, opts) => {
    const client = base(url, key, opts)
    if (key === 'service-key') {
      client.auth.admin = {
        async listUsers() {
          return { data: { users: [{ id: TARGET, email: 'owner@example.com', banned_until: null }] }, error: null }
        },
        async updateUserById(id, attrs) {
          authCalls.push(['update', id, attrs])
          if (authErrors.update) return { data: { user: null }, error: authErrors.update }
          return { data: { user: { id, email: 'owner@example.com', banned_until: attrs.ban_duration === 'none' ? null : '2126-01-01T00:00:00Z' } }, error: null }
        },
        async deleteUser(id, soft) {
          authCalls.push(['delete', id, soft])
          return authErrors.delete ? { data: null, error: authErrors.delete } : { data: null, error: null }
        },
      }
    }
    return client
  }
}

const profileCalls = () => h.fake.fromCalls('users').filter((c) => !c.ops.some(([op]) => op === 'maybeSingle'))
const post = (body, raw) => h.call(URL_, { method: 'POST', body: raw ?? JSON.stringify(body), headers: { authorization: 'Bearer token', 'content-type': 'application/json' } })

beforeEach(() => setup())

test('no bearer token is 401 and no auth admin call is made', async () => {
  const res = await h.call(URL_, { method: 'POST', body: JSON.stringify({ action: 'list' }) })
  assert.equal(res.status, 401)
  assert.equal(authCalls.length, 0)
})

test('non-admin caller is refused with 403 and no user is changed', async () => {
  setup({ role: 'agency' })
  const res = await post({ action: 'set-disabled', userId: TARGET, disabled: true })
  assert.equal(res.status, 403)
  assert.equal(authCalls.length, 0)
})

test('admin list returns users with account status, profile query capped at 200 newest first', async () => {
  setup({ profiles: [{ id: TARGET, email: 'owner@example.com', role: 'agency', created_at: 'c', updated_at: 'u', name: 'Owner', phone: null }] })
  const res = await post({ action: 'list' })
  assert.equal(res.status, 200)
  const [user] = (await res.json()).users
  assert.equal(user.id, TARGET)
  assert.equal(user.account_status, 'active')
  const ops = profileCalls()[0].ops
  assert.ok(ops.some(([op, from, to]) => op === 'range' && from === 0 && to === 200), 'first page is range 0..200 (201 rows fetched)')
  assert.ok(ops.some(([op, col, opts]) => op === 'order' && col === 'created_at' && opts?.ascending === false))
  assert.ok(ops.some(([op, col, opts]) => op === 'order' && col === 'id' && opts?.ascending === false), 'id must be the final tiebreaker')
})

/**
 * Seeds `total` portal profiles and applies .range(from, to) the way PostgREST does. The caller is an admin,
 * and the target lookup (maybeSingle) still resolves to the scripted target.
 */
function seedPagedUsers(total) {
  setup({})
  const rows = Array.from({ length: total }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    email: `user${i}@example.com`,
    role: 'customer',
    created_at: new Date(Date.UTC(2026, 0, 1) + Math.floor(i / 2) * 1000).toISOString(),
    updated_at: 'u',
    name: null,
    phone: null,
  })).sort((a, b) => (b.created_at === a.created_at ? b.id.localeCompare(a.id) : b.created_at.localeCompare(a.created_at)))
  h.fake.onFrom('users', (rec) => {
    if (rec.ops.some(([op]) => op === 'maybeSingle')) {
      const cols = rec.ops.find(([op]) => op === 'select')[1]
      return cols === 'id, role' ? { data: { id: ADMIN, role: 'admin' }, error: null } : { data: null, error: null }
    }
    const range = rec.ops.find(([op]) => op === 'range')
    return { data: range ? rows.slice(range[1], range[2] + 1) : [], error: null }
  })
  return rows
}

test('list offset defaults to 0 and a first page holds 200 users with has_more true when 450 exist', async () => {
  seedPagedUsers(450)
  const res = await post({ action: 'list' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.users.length, 200)
  assert.equal(body.has_more, true)
  assert.ok(profileCalls()[0].ops.some(([op, from, to]) => op === 'range' && from === 0 && to === 200))
})

test('list offset=200 returns the next users with no overlap, and paging through 450 covers each once', async () => {
  seedPagedUsers(450)
  const pages = [
    await (await post({ action: 'list', offset: 0 })).json(),
    await (await post({ action: 'list', offset: 200 })).json(),
    await (await post({ action: 'list', offset: 400 })).json(),
  ]
  assert.equal(pages[1].users.length, 200)
  assert.equal(pages[1].has_more, true)
  assert.equal(pages[2].users.length, 50)
  assert.equal(pages[2].has_more, false)
  const ids = pages.flatMap((p) => p.users.map((u) => u.id))
  assert.equal(new Set(ids).size, 450, 'no user is skipped or repeated across pages')
})

test('list has_more is false at exactly 200 users and true at 201', async () => {
  seedPagedUsers(200)
  assert.equal((await (await post({ action: 'list' })).json()).has_more, false)
  seedPagedUsers(201)
  const body = await (await post({ action: 'list' })).json()
  assert.equal(body.users.length, 200)
  assert.equal(body.has_more, true)
})

test('list offset 400 over 400 users is a final page with has_more false', async () => {
  seedPagedUsers(400)
  const body = await (await post({ action: 'list', offset: 200 })).json()
  assert.equal(body.users.length, 200)
  assert.equal(body.has_more, false)
})

test('invalid list offsets are 400 with the calm message before any auth or profile read', async () => {
  seedPagedUsers(10)
  for (const offset of [-5, 2.5, 100001, '200', null]) {
    const res = await post({ action: 'list', offset })
    assert.equal(res.status, 400, `offset ${String(offset)}`)
    assert.equal((await res.json()).error, 'A valid offset is required.')
  }
  assert.equal(profileCalls().length, 0)
  assert.equal(authCalls.length, 0)
})

test('a non-admin caller asking for a page is still refused with 403', async () => {
  seedPagedUsers(10)
  setup({ role: 'agency' })
  const res = await post({ action: 'list', offset: 200 })
  assert.equal(res.status, 403)
  assert.equal(profileCalls().length, 0)
})

test('admin disables then re-enables a non-admin user', async () => {
  let res = await post({ action: 'set-disabled', userId: TARGET, disabled: true })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).message, 'User account disabled.')
  assert.equal(authCalls[0][2].ban_duration, '876000h')

  res = await post({ action: 'set-disabled', userId: TARGET, disabled: false })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).message, 'User account re-enabled.')
  assert.equal(authCalls[1][2].ban_duration, 'none')
})

test('admin delete is a hard delete (soft=false) and the message names the account', async () => {
  const res = await post({ action: 'delete', userId: TARGET })
  assert.equal(res.status, 200)
  assert.match((await res.json()).message, /owner@example\.com/)
  assert.deepEqual(authCalls, [['delete', TARGET, false]])
})

test('non-uuid user id is refused with 400 before any lookup or auth call', async () => {
  for (const body of [
    { action: 'set-disabled', userId: 'x', disabled: true },
    { action: 'delete', userId: '1 OR 1=1' },
  ]) {
    const res = await post(body)
    assert.equal(res.status, 400, body.action)
    assert.equal((await res.json()).error, 'A valid user action payload is required.')
  }
  assert.equal(authCalls.length, 0)
})

test('an admin cannot disable or delete their own account', async () => {
  const res = await post({ action: 'set-disabled', userId: ADMIN, disabled: true })
  assert.equal(res.status, 409)
  assert.equal(authCalls.length, 0)
})

test('portal admins cannot be disabled or deleted from this screen', async () => {
  setup({ target: { id: TARGET, email: 'x@example.com', role: 'admin', created_at: 'c', updated_at: 'u', name: null, phone: null } })
  const res = await post({ action: 'delete', userId: TARGET })
  assert.equal(res.status, 409)
  assert.equal(authCalls.length, 0)
})

test('unknown target user is 404', async () => {
  setup({ target: null })
  const res = await post({ action: 'set-disabled', userId: TARGET, disabled: true })
  assert.equal(res.status, 404)
  assert.equal((await res.json()).error, 'The requested user was not found.')
})

test('invalid JSON and unknown action are 400', async () => {
  assert.equal((await post(null, '{not json')).status, 400)
  assert.equal((await post({ action: 'promote' })).status, 400)
})

test('auth and profile database errors return the generic message, never the raw text', async () => {
  setup({ authErrs: { update: { message: 'User not allowed: service role ban policy DETAIL secret' } } })
  let res = await post({ action: 'set-disabled', userId: TARGET, disabled: true })
  let text = await res.text()
  assert.equal(res.status, 500)
  assert.equal(JSON.parse(text).error, GENERIC)
  assert.ok(!text.includes('secret') && !text.includes('policy'))

  setup({ profileError: { message: 'relation "users" does not exist secret' } })
  res = await post({ action: 'list' })
  text = await res.text()
  assert.equal(res.status, 500)
  assert.ok(!text.includes('secret'))
})
