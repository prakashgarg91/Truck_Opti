// driver-kyc private document access (supabase/functions/driver-kyc/index.ts).
// Expectations: no session -> 401; a driver may only read their own documents (another driver's -> 403, nothing
// minted); an admin may read any driver's document with an explicit driverId; signed URLs last 60 s; uploads
// must use a randomized, owner-scoped path (traversal and absolute URLs refused before any storage call);
// errors stay generic.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_ANON_KEY: 'anon-key', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/driver-kyc'
const TTL = 60
const RAW_DB = 'RAW-DB-DETAIL: relation "driver_kyc_documents" leaked'
const RAW_STORAGE = 'RAW-STORAGE-DETAIL: bucket driver-docs internals'

const DRIVER_A_USER = '11111111-1111-4111-8111-111111111111'
const DRIVER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DRIVER_B_USER = '22222222-2222-4222-8222-222222222222'
const DRIVER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const ADMIN_USER = '33333333-3333-4333-8333-333333333333'
const B_DOC_PATH = `${DRIVER_B_USER}/rc_book/abcdefgh12.pdf`

const h = await loadFunction('driver-kyc')

let storageCalls = []
let scenario = {}

// Documents keyed by driver: B has an accepted rc_book at version 1 and a newer version 2.
const docs = () => [
  { driver_id: DRIVER_B, kind: 'rc_book', version: 1, status: 'rejected', storage_path: `${DRIVER_B_USER}/rc_book/old0000001.pdf` },
  { driver_id: DRIVER_B, kind: 'rc_book', version: 2, status: 'accepted', storage_path: B_DOC_PATH },
  { driver_id: DRIVER_A, kind: 'driving_license', version: 1, status: 'pending_review', storage_path: `${DRIVER_A_USER}/driving_license/zyxwvuts99.jpg` },
]

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
          return { data: null, error: { message: 'object missing' } }
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
  scenario = { caller: DRIVER_A_USER, role: 'driver', docsError: null, signError: null, ...overrides }
  h.reset({ env: ENV })
  storageCalls = []
  installStorage()
  h.fake
    .onGetUser(() => ({ data: { user: { id: scenario.caller } }, error: null }))
    .onFrom('users', () => ({ data: { id: scenario.caller, role: scenario.role }, error: null }))
    .onFrom('drivers', (rec) => {
      const userId = rec.ops.find((op) => op[0] === 'eq' && op[1] === 'user_id')?.[2]
      const id = rec.ops.find((op) => op[0] === 'eq' && op[1] === 'id')?.[2]
      if (userId === DRIVER_A_USER) return { data: { id: DRIVER_A, user_id: DRIVER_A_USER, status: 'pending' }, error: null }
      if (userId === DRIVER_B_USER) return { data: { id: DRIVER_B, user_id: DRIVER_B_USER, status: 'approved' }, error: null }
      if (id === DRIVER_B) return { data: { id: DRIVER_B }, error: null }
      return { data: null, error: null }
    })
    .onFrom('driver_kyc_documents', (rec) => {
      if (scenario.docsError) return { data: null, error: scenario.docsError }
      const eq = (col) => rec.ops.find((op) => op[0] === 'eq' && op[1] === col)?.[2]
      const driverId = eq('driver_id')
      const kind = eq('kind')
      const version = eq('version')
      const matches = docs()
        .filter((d) => d.driver_id === driverId && (kind === undefined || d.kind === kind) && (version === undefined || d.version === version))
        .sort((x, y) => y.version - x.version)
      if (rec.ops.some((op) => op[0] === 'maybeSingle')) return { data: matches[0] ?? null, error: null }
      return { data: matches, error: null }
    })
}

function post(body, { token = 'tok', rawBody, method = 'POST' } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (token !== null) headers.authorization = `Bearer ${token}`
  return h.call(URL_, { method, headers, body: rawBody ?? JSON.stringify(body) })
}

const signCalls = () => storageCalls.filter((c) => c.op === 'createSignedUrl')
const downloadCalls = () => storageCalls.filter((c) => c.op === 'download')
const assertNoStorage = () => assert.equal(storageCalls.length, 0, 'storage must not be touched')
const writes = () => h.fake.fromCalls('driver_kyc_documents').filter((c) => c.ops.some((op) => ['insert', 'update', 'delete', 'upsert'].includes(op[0])))
const assertNoLeak = (text) => {
  assert.ok(!text.includes('RAW-'), 'raw internal detail leaked: ' + text)
  assert.ok(!/relation|bucket|storage|SQL|object missing/i.test(text), 'internal wording leaked: ' + text)
}

test('no Authorization header is 401 for every action and nothing is signed or downloaded', async () => {
  seed()
  for (const body of [
    { action: 'access', kind: 'rc_book' },
    { action: 'state' },
    { action: 'upload', kind: 'rc_book', path: B_DOC_PATH },
  ]) {
    const res = await post(body, { token: null })
    assert.equal(res.status, 401, body.action)
  }
  assert.equal(h.fake.fromCalls('driver_kyc_documents').length, 0)
  assertNoStorage()
})

test('owner driver gets their own document as a 60 s signed URL', async () => {
  seed({ caller: DRIVER_B_USER, role: 'driver' })
  const res = await post({ action: 'access', kind: 'rc_book' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.expiresIn, TTL)
  assert.equal(body.version, 2, 'latest version is served')
  assert.equal(body.status, 'accepted')
  assert.match(body.url, /^https:\/\/storage\.test\/signed\//)
  assert.equal(signCalls().length, 1)
  assert.equal(signCalls()[0].ttl, TTL)
  assert.equal(signCalls()[0].path, B_DOC_PATH)
  assert.equal(signCalls()[0].bucket, 'driver-docs')
})

test('a driver asking for another driver\'s document is refused with 403 and nothing is minted', async () => {
  seed({ caller: DRIVER_A_USER, role: 'driver' })
  const res = await post({ action: 'access', kind: 'rc_book', driverId: DRIVER_B })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).error, 'You can only access your own documents.')
  assert.equal(signCalls().length, 0)
  assertNoStorage()
})

test('a driver cannot escape their scope with a version or state probe for another driver', async () => {
  seed({ caller: DRIVER_A_USER, role: 'driver' })
  const res = await post({ action: 'access', kind: 'rc_book', driverId: DRIVER_B, version: 1 })
  assert.equal(res.status, 403)
  assertNoStorage()
})

test('a driver with no document of that kind gets 404 and no storage call', async () => {
  seed({ caller: DRIVER_A_USER, role: 'driver' })
  const res = await post({ action: 'access', kind: 'rc_book' })
  assert.equal(res.status, 404)
  assert.equal((await res.json()).error, 'Document not found.')
  assertNoStorage()
})

test('a non-admin cannot review documents (403) and nothing is written', async () => {
  seed({ caller: DRIVER_A_USER, role: 'driver' })
  const res = await post({ action: 'review', driverId: DRIVER_B, kind: 'rc_book', version: 2, decision: 'accept' })
  assert.equal(res.status, 403)
  assert.equal(writes().length, 0)
  assertNoStorage()
})

test('admin may open any driver\'s document with an explicit driverId, still 60 s', async () => {
  seed({ caller: ADMIN_USER, role: 'admin' })
  const res = await post({ action: 'access', kind: 'rc_book', driverId: DRIVER_B })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.expiresIn, TTL)
  assert.equal(signCalls()[0].ttl, TTL)
  assert.equal(signCalls()[0].path, B_DOC_PATH)
})

test('admin without a driverId is refused with 400 and nothing is minted', async () => {
  seed({ caller: ADMIN_USER, role: 'admin' })
  const res = await post({ action: 'access', kind: 'rc_book' })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'driverId is required for admin document access.')
  assertNoStorage()
})

test('unknown document kinds and malformed ids are refused before any lookup or signing', async () => {
  for (const body of [
    { action: 'access', kind: '../../rc_book' },
    { action: 'access', kind: 'https://evil.example/x' },
    { action: 'access' },
    { action: 'access', kind: 'rc_book', driverId: 5 },
    { action: 'access', kind: 'rc_book', version: 0 },
    { action: 'access', kind: 'rc_book', version: 1.5 },
    { action: 'nope' },
    { nope: true },
  ]) {
    seed({ caller: ADMIN_USER, role: 'admin' })
    const res = await post(body)
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.equal(h.fake.fromCalls('driver_kyc_documents').length, 0)
    assertNoStorage()
  }
})

test('upload with another driver\'s path is refused before storage is touched', async () => {
  seed({ caller: DRIVER_A_USER, role: 'driver' })
  const res = await post({ action: 'upload', kind: 'rc_book', path: B_DOC_PATH })
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Upload path must be randomized and owner-scoped.')
  assertNoStorage()
})

test('upload path traversal and absolute URLs are refused before storage is touched', async () => {
  const paths = [
    `${DRIVER_A_USER}/rc_book/../../${DRIVER_B_USER}/rc_book/abcdefgh12.pdf`,
    `${DRIVER_A_USER}/../${DRIVER_B_USER}/rc_book/abcdefgh12.pdf`,
    `${DRIVER_A_USER}/rc_book/../../../secret.pdf`,
    `${DRIVER_A_USER}/rc_book/abcdefgh12.pdf/../../x.pdf`,
    `https://evil.example/${DRIVER_A_USER}/rc_book/abcdefgh12.pdf`,
    `//evil.example/${DRIVER_A_USER}/rc_book/abcdefgh12.pdf`,
    `${DRIVER_A_USER}/rc_book/abcdefgh12.exe`,
    `${DRIVER_A_USER}/aadhaar/abcdefgh12.pdf`,
  ]
  for (const path of paths) {
    seed({ caller: DRIVER_A_USER, role: 'driver' })
    const res = await post({ action: 'upload', kind: 'rc_book', path })
    assert.equal(res.status, 400, path)
    assertNoStorage()
    assert.equal(writes().length, 0)
  }
})

test('upload of a missing object is a generic 404 with no storage detail', async () => {
  seed({ caller: DRIVER_A_USER, role: 'driver' })
  const path = `${DRIVER_A_USER}/rc_book/abcdefgh12.pdf`
  const res = await post({ action: 'upload', kind: 'rc_book', path })
  const text = await res.text()
  assert.equal(res.status, 404)
  assert.equal(downloadCalls().length, 1, 'own, well-formed path is the only one downloaded')
  assert.equal(JSON.parse(text).error, 'Uploaded file could not be found. Upload the document again.')
  assertNoLeak(text)
})

test('document database error is a generic 500 with no raw detail', async () => {
  seed({ caller: ADMIN_USER, role: 'admin', docsError: { message: RAW_DB } })
  const res = await post({ action: 'access', kind: 'rc_book', driverId: DRIVER_B })
  const text = await res.text()
  assert.equal(res.status, 500)
  assertNoLeak(text)
  assertNoStorage()
})

test('storage signing failure is a generic 500 with no raw storage detail', async () => {
  seed({ caller: DRIVER_B_USER, role: 'driver', signError: { message: RAW_STORAGE } })
  const res = await post({ action: 'access', kind: 'rc_book' })
  const text = await res.text()
  assert.equal(res.status, 500)
  assert.equal(JSON.parse(text).error, 'Unable to complete the request.')
  assertNoLeak(text)
})

test('unsupported methods with a valid driver session are refused with 405, Allow header, and no side effects', async () => {
  for (const method of ['PUT', 'PATCH', 'DELETE', 'GET']) {
    seed({ caller: DRIVER_B_USER, role: 'driver' })
    const res = await h.call(URL_, { method, headers: { authorization: 'Bearer tok' } })
    assert.equal(res.status, 405, method)
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS', method)
    assert.equal(res.headers.get('content-type'), 'application/json', method)
    assert.deepEqual(await res.json(), { error: 'Unsupported method.' }, method)
    assert.equal(h.fake.calls.length, 0, `${method} must not touch the database or auth`)
    assertNoStorage()
  }
})

test('unsupported method with a JSON body is refused before the body is parsed', async () => {
  seed({ caller: DRIVER_B_USER, role: 'driver' })
  const res = await post({ action: 'access', kind: 'rc_book' }, { method: 'PUT' })
  assert.equal(res.status, 405)
  assert.equal((await res.json()).error, 'Unsupported method.')
  assert.equal(h.fake.calls.length, 0)
  assertNoStorage()
})

test('OPTIONS answers the CORS preflight with 200 and no database or storage work', async () => {
  seed({ caller: DRIVER_B_USER, role: 'driver' })
  const res = await h.call(URL_, { method: 'OPTIONS' })
  assert.equal(res.status, 200)
  assert.equal(await res.text(), 'ok')
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
  assert.equal(h.fake.calls.length, 0)
  assertNoStorage()
})

test('POST remains the allowed method for every action and still reaches the handler', async () => {
  seed({ caller: DRIVER_B_USER, role: 'driver' })
  const res = await post({ action: 'access', kind: 'rc_book' })
  assert.equal(res.status, 200)
  assert.equal(signCalls().length, 1)
  assert.equal(res.headers.get('allow'), null)
})
