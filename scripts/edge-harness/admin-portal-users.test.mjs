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
  assert.ok(ops.some(([op, n]) => op === 'limit' && n === 200))
  assert.ok(ops.some(([op, col, opts]) => op === 'order' && col === 'created_at' && opts?.ascending === false))
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
