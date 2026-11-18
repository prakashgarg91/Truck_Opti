import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, createHash } from 'node:crypto'
import { loadFunction } from './run.mjs'

const SECRET = 'whsec_test_secret'
const ENV = { RAZORPAY_WEBHOOK_SECRET: SECRET, SUPABASE_URL: 'http://db.test', SUPABASE_SERVICE_ROLE_KEY: 'service-key' }
const URL_ = 'http://edge.test/razorpay-webhook'

const sign = (body, secret = SECRET) => createHmac('sha256', secret).update(body).digest('hex')
const sha256 = (body) => createHash('sha256').update(body).digest('hex')
const eventBody = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_ABCDEF1' } } } })

const h = await loadFunction('razorpay-webhook')
beforeEach(() => h.reset({ env: ENV }))

function post(body, headers = {}) {
  return h.call(URL_, { method: 'POST', body, headers })
}
const webhookCalls = () => h.fake.rpcCalls('subscription_webhook_process')

test('non-POST is 405 and never touches the database', async () => {
  const res = await h.call(URL_, { method: 'GET' })
  assert.equal(res.status, 405)
  assert.equal(webhookCalls().length, 0)
})

test('missing webhook secret fails closed with 500', async () => {
  h.reset({ env: { ...ENV, RAZORPAY_WEBHOOK_SECRET: '' } })
  const res = await post(eventBody, { 'x-razorpay-signature': sign(eventBody) })
  assert.equal(res.status, 500)
  assert.equal(webhookCalls().length, 0)
})

test('bad signature is 400 BEFORE the body is parsed (invalid JSON still yields invalid_signature)', async () => {
  const res = await post('{not json', { 'x-razorpay-signature': 'a'.repeat(64) })
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: 'invalid_signature' })
  assert.equal(h.fake.clients.length, 0, 'no database client may be created')
})

test('missing, short and wrong-secret signatures are all 400', async () => {
  for (const sig of [undefined, 'abc', sign(eventBody, 'other-secret')]) {
    const headers = sig === undefined ? {} : { 'x-razorpay-signature': sig }
    const res = await post(eventBody, headers)
    assert.equal(res.status, 400)
    assert.equal((await res.json()).error, 'invalid_signature')
  }
  assert.equal(webhookCalls().length, 0)
})

test('signature over a different body is refused (tampered payload)', async () => {
  const res = await post(eventBody + ' ', { 'x-razorpay-signature': sign(eventBody) })
  assert.equal(res.status, 400)
  assert.equal(webhookCalls().length, 0)
})

test('valid signature + invalid JSON is 400 invalid_json', async () => {
  const bad = '{not json'
  const res = await post(bad, { 'x-razorpay-signature': sign(bad) })
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: 'invalid_json' })
})

test('valid signature + missing event type is 400 event_type_missing', async () => {
  const body = JSON.stringify({ nope: true })
  const res = await post(body, { 'x-razorpay-signature': sign(body) })
  assert.equal(res.status, 400)
  assert.deepEqual(await res.json(), { error: 'event_type_missing' })
})

test('event id header is used and the exact raw-body hash is sent', async () => {
  h.fake.onRpc('subscription_webhook_process', () => ({ data: { ok: true, result: 'activated' }, error: null }))
  const res = await post(eventBody, { 'x-razorpay-signature': sign(eventBody), 'x-razorpay-event-id': 'evt_123' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, result: 'activated' })
  const [call] = webhookCalls()
  assert.equal(call.args.p_event_id, 'evt_123')
  assert.equal(call.args.p_event_type, 'payment.captured')
  assert.equal(call.args.p_payload_sha256, sha256(eventBody))
  assert.equal(call.key, 'service-key')
})

test('missing or invalid event id header falls back to sha_<payload hash>', async () => {
  h.fake.onRpc('subscription_webhook_process', () => ({ data: { ok: true, result: 'activated' }, error: null }))
  await post(eventBody, { 'x-razorpay-signature': sign(eventBody) })
  await post(eventBody, { 'x-razorpay-signature': sign(eventBody), 'x-razorpay-event-id': 'bad id with spaces!' })
  const calls = webhookCalls()
  assert.equal(calls.length, 2)
  for (const call of calls) assert.equal(call.args.p_event_id, `sha_${sha256(eventBody)}`)
})

test('duplicate and replay results map to 200 ok', async () => {
  for (const result of ['duplicate', 'replay']) {
    h.fake.onRpc('subscription_webhook_process', () => ({ data: { ok: true, result }, error: null }))
    const res = await post(eventBody, { 'x-razorpay-signature': sign(eventBody), 'x-razorpay-event-id': 'evt_1' })
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { ok: true, result })
  }
})

test('unknown ok result is acknowledged as ignored (200)', async () => {
  h.fake.onRpc('subscription_webhook_process', () => ({ data: { ok: true, result: 'brand_new_word' }, error: null }))
  const res = await post(eventBody, { 'x-razorpay-signature': sign(eventBody) })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: true, result: 'ignored' })
})

test('retryable:true failure is 500 so Razorpay retries', async () => {
  h.fake.onRpc('subscription_webhook_process', () => ({ data: { ok: false, error: 'busy', retryable: true }, error: null }))
  const res = await post(eventBody, { 'x-razorpay-signature': sign(eventBody) })
  assert.equal(res.status, 500)
  assert.deepEqual(await res.json(), { error: 'retry_later' })
})

test('non-retryable ok:false is 200 (ledgered refusal, stop the retries)', async () => {
  h.fake.onRpc('subscription_webhook_process', () => ({ data: { ok: false, error: 'amount_mismatch' }, error: null }))
  const res = await post(eventBody, { 'x-razorpay-signature': sign(eventBody) })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { ok: false, error: 'amount_mismatch' })
})

test('database error and malformed result are 500', async () => {
  h.fake.onRpc('subscription_webhook_process', () => ({ data: null, error: { message: 'boom', code: '57P01' } }))
  assert.equal((await post(eventBody, { 'x-razorpay-signature': sign(eventBody) })).status, 500)
  h.fake.onRpc('subscription_webhook_process', () => ({ data: 'weird', error: null }))
  assert.equal((await post(eventBody, { 'x-razorpay-signature': sign(eventBody) })).status, 500)
})

test('declared content-length over 256 KB is rejected with 413 before any read', async () => {
  const res = await post('x', { 'content-length': String(300 * 1024), 'x-razorpay-signature': 'a'.repeat(64) })
  assert.equal(res.status, 413)
  assert.deepEqual(await res.json(), { error: 'too_large' })
})

test('streamed body over 256 KB is cut off without reading it all', async () => {
  const chunk = new Uint8Array(64 * 1024)
  let pulled = 0
  const total = 100
  const stream = new ReadableStream({
    pull(controller) {
      if (pulled >= total) return controller.close()
      pulled += 1
      controller.enqueue(chunk)
    },
  })
  const res = await h.call(URL_, { method: 'POST', body: stream, duplex: 'half', headers: { 'x-razorpay-signature': 'a'.repeat(64) } })
  assert.equal(res.status, 413)
  assert.ok(pulled < total / 2, `read ${pulled} of ${total} chunks`)
})

test('no CORS headers on any response (server-to-server endpoint)', async () => {
  h.fake.onRpc('subscription_webhook_process', () => ({ data: { ok: true, result: 'activated' }, error: null }))
  const responses = [
    await h.call(URL_, { method: 'OPTIONS' }),
    await post(eventBody, { 'x-razorpay-signature': sign(eventBody) }),
    await post(eventBody, { 'x-razorpay-signature': 'bad' }),
  ]
  assert.equal(responses[0].status, 405)
  for (const res of responses) {
    assert.equal(res.headers.get('access-control-allow-origin'), null)
    assert.equal(res.headers.get('access-control-allow-headers'), null)
  }
})
