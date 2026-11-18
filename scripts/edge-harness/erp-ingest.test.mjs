import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const ENV = { SUPABASE_URL: 'http://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/erp-ingest'
const CONN = '123e4567-e89b-42d3-a456-426614174000'

const h = await loadFunction('erp-ingest')
beforeEach(() => h.reset({ env: ENV }))

const payload = (over = {}) => JSON.stringify({ connection_id: CONN, external_event_id: 'evt-1', lines: [{ ref: 'A' }], ...over })
const post = (body, headers = {}) => h.call(URL_, { method: 'POST', body, headers })
const ingestCalls = () => h.fake.rpcCalls('erp_event_ingest')
const rpc = (data, error = null) => h.fake.onRpc('erp_event_ingest', () => ({ data, error }))

test('non-POST is 405, no CORS headers', async () => {
  const res = await h.call(URL_, { method: 'OPTIONS' })
  assert.equal(res.status, 405)
  assert.equal(res.headers.get('access-control-allow-origin'), null)
  const ok = (rpc({ ok: true, outcome: 'accepted' }), await post(payload(), { authorization: 'Bearer s' }))
  assert.equal(ok.headers.get('access-control-allow-origin'), null)
})

test('outcome mapping table', async () => {
  const table = [
    [{ ok: true, outcome: 'accepted', batch_id: 'b1' }, null, 200, { ok: true, outcome: 'accepted', batch_id: 'b1' }],
    [{ ok: true, outcome: 'duplicate' }, null, 200, { ok: true, outcome: 'duplicate' }],
    [{ ok: false, error: 'bad_credentials' }, null, 401, { ok: false, error: 'bad_credentials' }],
    [{ ok: false, error: 'invalid_lines', problems: [{ line: 1 }] }, null, 200, { ok: false, outcome: 'rejected', error: 'invalid_lines', problems: [{ line: 1 }] }],
    [{ ok: false, error: 'invalid_lines', outcome: 'duplicate', problems: [] }, null, 200, { ok: false, outcome: 'duplicate', error: 'invalid_lines', problems: [] }],
    [{ ok: false, error: 'payload_too_large' }, null, 413, { ok: false, error: 'payload_too_large' }],
    [{ ok: false, error: 'connection_not_active' }, null, 403, { ok: false, error: 'connection_not_active' }],
    [{ ok: false, error: 'agency_not_operational' }, null, 403, { ok: false, error: 'agency_not_operational' }],
    [{ ok: false, error: 'event_id_reused' }, null, 409, { ok: false, error: 'event_id_reused' }],
    [{ ok: false, error: 'event_id_required' }, null, 400, { ok: false, error: 'event_id_required' }],
    [{ ok: false, error: 'no_lines' }, null, 400, { ok: false, error: 'no_lines' }],
    [{ ok: false, error: 'too_many_lines' }, null, 400, { ok: false, error: 'too_many_lines' }],
    [{ ok: false, error: 'unknown_consignment', refs: ['X'] }, null, 422, { ok: false, error: 'unknown_consignment', refs: ['X'] }],
    [{ ok: false }, null, 422, { ok: false, error: 'import_refused' }],
    [null, { code: 'SB001', message: 'limit' }, 403, { ok: false, error: 'subscription_limit' }],
    [null, { code: 'SB002', message: 'ro' }, 403, { ok: false, error: 'subscription_limit' }],
    [null, { code: 'SB003', message: 'dispatch' }, 403, { ok: false, error: 'subscription_limit' }],
    [null, { code: '57P01', message: 'down' }, 500, { ok: false, error: 'temporarily_unavailable' }],
    ['weird', null, 500, { ok: false, error: 'temporarily_unavailable' }],
    [{ nope: 1 }, null, 500, { ok: false, error: 'temporarily_unavailable' }],
  ]
  for (const [data, error, status, body] of table) {
    h.reset({ env: ENV })
    rpc(data, error)
    const res = await post(payload(), { authorization: 'Bearer s3cret' })
    assert.equal(res.status, status, JSON.stringify([data, error]))
    assert.deepEqual(await res.json(), body, JSON.stringify([data, error]))
  }
})

test('secret from the Authorization Bearer header wins over the body secret', async () => {
  rpc({ ok: true, outcome: 'accepted' })
  await post(payload({ secret: 'body-secret' }), { authorization: 'Bearer header-secret' })
  assert.equal(ingestCalls()[0].args.p_secret, 'header-secret')
})

test('x-truckopti-secret is preferred over the body secret; Authorization Bearer beats x-truckopti-secret', async () => {
  rpc({ ok: true, outcome: 'accepted' })
  await post(payload({ secret: 'body-secret' }), { 'x-truckopti-secret': 'custom-secret' })
  await post(payload({ secret: 'body-secret' }), { authorization: 'Bearer bearer-secret', 'x-truckopti-secret': 'custom-secret' })
  await post(payload({ secret: 'body-secret' }))
  assert.deepEqual(ingestCalls().map((c) => c.args.p_secret), ['custom-secret', 'bearer-secret', 'body-secret'])
})

test('rpc receives the lower-cased connection id, event id and lines; service key is used', async () => {
  rpc({ ok: true, outcome: 'accepted' })
  await post(payload({ connection_id: CONN.toUpperCase(), external_event_id: '  evt-9 ' }), { authorization: 'Bearer s' })
  const [call] = ingestCalls()
  assert.equal(call.args.p_connection_id, CONN)
  assert.equal(call.args.p_external_event_id, 'evt-9')
  assert.deepEqual(call.args.p_lines, [{ ref: 'A' }])
  assert.equal(call.key, 'service-key')
})

test('401 body is uniform for wrong secret and unknown connection', async () => {
  const bodies = []
  for (const connection of [CONN, '99999999-9999-4999-8999-999999999999']) {
    h.reset({ env: ENV })
    rpc({ ok: false, error: 'bad_credentials', detail: 'connection ' + connection + ' not found' })
    const res = await post(payload({ connection_id: connection }), { authorization: 'Bearer wrong' })
    assert.equal(res.status, 401)
    bodies.push(await res.text())
  }
  assert.equal(bodies[0], bodies[1])
  assert.deepEqual(JSON.parse(bodies[0]), { ok: false, error: 'bad_credentials' })
})

test('request-level failures are 400 and never reach the database', async () => {
  const cases = [
    ['not json', 'invalid_json'],
    ['[]', 'invalid_body'],
    [payload({ connection_id: 'nope' }), 'invalid_connection_id'],
    [payload(), 'missing_secret'],
    [payload({ external_event_id: '' }), 'invalid_event_id'],
    [payload({ lines: 'x' }), 'invalid_lines'],
  ]
  for (const [body, error] of cases) {
    const res = await post(body, error === 'missing_secret' ? {} : { authorization: 'Bearer s' })
    assert.equal(res.status, 400)
    assert.deepEqual(await res.json(), { ok: false, error })
  }
  assert.equal((await post(new Uint8Array([0xff, 0xfe, 0x00]), { authorization: 'Bearer s' })).status, 400)
  assert.equal(ingestCalls().length, 0)
})

test('body over 1 MB: declared length and streamed bodies get 413 payload_too_large', async () => {
  const declared = await post('x', { 'content-length': String(2 * 1024 * 1024), authorization: 'Bearer s' })
  assert.equal(declared.status, 413)
  assert.deepEqual(await declared.json(), { ok: false, error: 'payload_too_large' })

  const chunk = new Uint8Array(256 * 1024)
  let pulled = 0
  const stream = new ReadableStream({
    pull(controller) {
      if (pulled >= 40) return controller.close()
      pulled += 1
      controller.enqueue(chunk)
    },
  })
  const res = await h.call(URL_, { method: 'POST', body: stream, duplex: 'half', headers: { authorization: 'Bearer s' } })
  assert.equal(res.status, 413)
  assert.ok(pulled < 10, `read ${pulled} chunks`)
  assert.equal(ingestCalls().length, 0)
})

test('missing Supabase env is 500 not_configured', async () => {
  h.reset({ env: {} })
  const res = await post(payload(), { authorization: 'Bearer s' })
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { ok: false, error: 'not_configured' })
})
