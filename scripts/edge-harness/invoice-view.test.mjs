// invoice-view: owner/admin-only signed URL for an invoice PDF (supabase/functions/invoice-view/index.ts).
// Expectations: no session -> 401; another user's invoice -> 403 with no signed URL minted; owner and admin get
// a 300 s signed URL built from DB fields; bad ids -> 400/404; unsupported method -> 405; errors stay generic.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/invoice-view'
const OWNER = 'owner-user'
const OTHER = 'other-user'
const ADMIN = 'admin-user'
const INVOICE_ID = 'inv-1'
const TTL = 300
const RAW_DB = 'RAW-DB-DETAIL: relation "invoices" leaked'
const RAW_STORAGE = 'RAW-STORAGE-DETAIL: bucket billing-documents internals'

const h = await loadFunction('invoice-view')

let storageCalls = []
let scenario = {}

const invoiceRow = (overrides = {}) => ({ id: INVOICE_ID, user_id: OWNER, invoice_number: 'INV-001', ...overrides })

// The shared fake client has no storage: attach a recording stub to every client it creates (inside this file only).
function installStorage() {
  const storage = {
    from(bucket) {
      storageCalls.push({ op: 'from', bucket })
      return {
        async createSignedUrl(path, ttl) {
          storageCalls.push({ op: 'createSignedUrl', bucket, path, ttl })
          if (scenario.signError) return { data: null, error: scenario.signError }
          return { data: { signedUrl: `https://storage.test/signed/${path}?token=t` }, error: null }
        },
        async download(path) {
          storageCalls.push({ op: 'download', bucket, path })
          return { data: null, error: { message: 'unexpected' } }
        },
        async remove(paths) {
          storageCalls.push({ op: 'remove', bucket, paths })
          return { data: null, error: null }
        },
      }
    },
  }
  const fake = h.fake
  const original = fake.makeClient
  fake.makeClient = (url, key, options) => {
    const client = original(url, key, options)
    client.storage = storage
    return client
  }
}

function seed(overrides = {}) {
  scenario = {
    caller: OWNER,
    token: 'tok',
    invoice: invoiceRow(),
    role: 'user',
    invoiceError: null,
    roleError: null,
    signError: null,
    ...overrides,
  }
  h.reset({ env: ENV })
  storageCalls = []
  installStorage()
  h.fake
    .onGetUser((token) => (token === scenario.token
      ? { data: { user: { id: scenario.caller } }, error: null }
      : { data: { user: null }, error: { message: 'invalid jwt' } }))
    .onFrom('invoices', (rec) => {
      if (scenario.invoiceError) return { data: null, error: scenario.invoiceError }
      const id = rec.ops.find((op) => op[0] === 'eq' && op[1] === 'id')?.[2]
      return { data: scenario.invoice && scenario.invoice.id === id ? scenario.invoice : null, error: null }
    })
    .onFrom('users', () => {
      if (scenario.roleError) return { data: null, error: scenario.roleError }
      return { data: { id: scenario.caller, role: scenario.role }, error: null }
    })
}

function post(body, { token = scenario.token, method = 'POST', rawBody } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token !== null) headers.authorization = `Bearer ${token}`
  return h.call(URL_, {
    method,
    headers,
    body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
}

const dbCalls = () => h.fake.fromCalls('invoices')
const signCalls = () => storageCalls.filter((c) => c.op === 'createSignedUrl')
const assertNoStorage = () => assert.equal(storageCalls.length, 0, 'storage must not be touched')
const assertNoLeak = (text) => {
  assert.ok(!text.includes('RAW-'), 'raw internal detail leaked: ' + text)
  assert.ok(!/relation|bucket|storage|SQL/i.test(text), 'internal wording leaked: ' + text)
}

test('no Authorization header is 401 and never reaches the database or storage', async () => {
  seed()
  const res = await post({ invoiceId: INVOICE_ID }, { token: null })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).error, 'Authentication is required.')
  assert.equal(dbCalls().length, 0)
  assertNoStorage()
})

test('empty bearer token and an invalid session are both 401', async () => {
  seed()
  assert.equal((await post({ invoiceId: INVOICE_ID }, { token: '' })).status, 401)

  seed()
  const res = await post({ invoiceId: INVOICE_ID }, { token: 'expired' })
  assert.equal(res.status, 401)
  assertNoStorage()
})

test('another user cannot obtain a signed URL for an invoice they do not own (403, nothing minted)', async () => {
  seed({ caller: OTHER, role: 'user' })
  const res = await post({ invoiceId: INVOICE_ID })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).error, 'Access denied.')
  assert.equal(signCalls().length, 0, 'createSignedUrl must never be called')
  assertNoStorage()
})

test('a non-admin with an unexpected role value is refused (only role === admin elevates)', async () => {
  for (const role of ['driver', 'agency', null, 'Admin']) {
    seed({ caller: OTHER, role })
    const res = await post({ invoiceId: INVOICE_ID })
    assert.equal(res.status, 403, `role ${String(role)}`)
    assertNoStorage()
  }
})

test('owner gets a signed URL with the declared 300 s expiry and a DB-derived object path', async () => {
  seed({ caller: OWNER })
  const res = await post({ invoiceId: INVOICE_ID })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.expiresIn, TTL)
  assert.equal(body.path, `${OWNER}/${INVOICE_ID}/inv-001.pdf`)
  assert.match(body.signedUrl, /^https:\/\/storage\.test\/signed\//)
  assert.equal(signCalls().length, 1)
  assert.equal(signCalls()[0].ttl, TTL)
  assert.equal(signCalls()[0].bucket, 'billing-documents')
  assert.equal(signCalls()[0].path, body.path)
})

test('admin may obtain a signed URL for another user\'s invoice, after a users.role check', async () => {
  seed({ caller: ADMIN, role: 'admin' })
  const res = await post({ invoiceId: INVOICE_ID })
  assert.equal(res.status, 200)
  assert.equal((await res.json()).path, `${OWNER}/${INVOICE_ID}/inv-001.pdf`)
  assert.equal(signCalls()[0].ttl, TTL)
  assert.equal(h.fake.fromCalls('users').length, 1, 'role must be read from public.users')
})

test('owner path never queries users (ownership short-circuits elevation)', async () => {
  seed({ caller: OWNER })
  await post({ invoiceId: INVOICE_ID })
  assert.equal(h.fake.fromCalls('users').length, 0)
})

test('GET query string and POST body both carry invoiceId; GET with owner also signs', async () => {
  seed({ caller: OWNER })
  const res = await h.call(`${URL_}?invoiceId=${INVOICE_ID}`, { method: 'GET', headers: { authorization: 'Bearer tok' } })
  assert.equal(res.status, 200)
  assert.equal(signCalls()[0].ttl, TTL)
})

test('missing or non-string invoiceId is 400 and nothing is queried', async () => {
  for (const body of [{}, { invoiceId: '' }, { invoiceId: 42 }, { invoiceId: ['inv-1'] }, ['inv-1'], null]) {
    seed()
    const res = await post(body)
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.equal(dbCalls().length, 0)
    assertNoStorage()
  }
  seed()
  const bad = await post(undefined, { rawBody: '{not json' })
  assert.equal(bad.status, 400)
  assertNoStorage()
})

test('traversal and absolute-URL invoice ids match no invoice: 404 and no storage call', async () => {
  for (const invoiceId of ['../../etc/passwd', '../' + INVOICE_ID, 'https://evil.example/x.pdf', '/' + OTHER + '/x']) {
    seed({ caller: ADMIN, role: 'admin' })
    const res = await post({ invoiceId })
    assert.equal(res.status, 404, invoiceId)
    assert.equal((await res.json()).error, 'Invoice not found.')
    assert.equal(dbCalls().length, 1, 'id is only ever used as a DB equality value')
    assertNoStorage()
  }
})

test('a hostile invoice_number cannot escape the owner folder (path has exactly three safe segments)', async () => {
  seed({ caller: OWNER, invoice: invoiceRow({ invoice_number: '../../other-user/secret' }) })
  const res = await post({ invoiceId: INVOICE_ID })
  assert.equal(res.status, 200)
  const { path } = await res.json()
  const segments = path.split('/')
  assert.equal(segments.length, 3)
  assert.equal(segments[0], OWNER)
  assert.equal(segments[1], INVOICE_ID)
  assert.ok(!segments.includes('..') && !segments[2].includes('/'), path)
})

test('unsupported methods are refused with 405 for an authenticated owner, and never sign', async () => {
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    seed({ caller: OWNER })
    const res = await post({ invoiceId: INVOICE_ID }, { method })
    assert.equal(res.status, 405, method)
    assert.equal((await res.json()).error, 'Unsupported method.')
    assert.equal(dbCalls().length, 0, `${method} must not query invoices`)
    assertNoStorage()
  }
})

test('unknown invoice is 404 and storage is never called', async () => {
  seed({ invoice: null })
  const res = await post({ invoiceId: 'missing' })
  assert.equal(res.status, 404)
  assertNoStorage()
})

test('invoice lookup database error is a generic 500 with no raw detail', async () => {
  seed({ invoiceError: { message: RAW_DB, code: 'XX000' } })
  const res = await post({ invoiceId: INVOICE_ID })
  const text = await res.text()
  assert.equal(res.status, 500)
  assert.equal(JSON.parse(text).error, 'Unable to complete the request.')
  assertNoLeak(text)
  assertNoStorage()
})

test('role lookup database error for a non-owner is a generic 500, not a grant', async () => {
  seed({ caller: OTHER, roleError: { message: RAW_DB } })
  const res = await post({ invoiceId: INVOICE_ID })
  const text = await res.text()
  assert.equal(res.status, 500)
  assertNoLeak(text)
  assertNoStorage()
})

test('storage signing failure is a generic 500 with no raw storage detail', async () => {
  seed({ caller: OWNER, signError: { message: RAW_STORAGE, statusCode: '500' } })
  const res = await post({ invoiceId: INVOICE_ID })
  const text = await res.text()
  assert.equal(res.status, 500)
  assert.equal(JSON.parse(text).error, 'Unable to complete the request.')
  assertNoLeak(text)
  assert.equal(signCalls().length, 1)
})
