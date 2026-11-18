import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { loadFunction, json } from './run.mjs'

const KEY_SECRET = 'rzp_test_secret'
const ENV = {
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  SUPABASE_URL: 'http://db.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}
const URL_ = 'http://edge.test/verify-razorpay-payment'
const ORDER = 'order_TestOrder123'
const PAY = 'pay_TestPay12345'
const sign = (order = ORDER, pay = PAY, secret = KEY_SECRET) => createHmac('sha256', secret).update(`${order}|${pay}`).digest('hex')
const entity = (over = {}) => ({ id: PAY, order_id: ORDER, status: 'captured', amount: 99900, amount_refunded: 0, currency: 'INR', method: 'upi', ...over })

const h = await loadFunction('verify-razorpay-payment')

function script({ orderRow = { agency_id: 'agency-1' }, activation = { ok: true, subscription_id: 'sub-1', status: 'active', current_period_end: '2027-01-01' } } = {}) {
  h.fake
    .onGetUser(() => ({ data: { user: { id: 'user-1' } }, error: null }))
    .onFrom('transport_agencies', () => ({ data: [{ id: 'agency-1', status: 'approved' }], error: null }))
    .onFrom('payment_history', () => ({ data: orderRow, error: null }))
    .onRpc('subscription_activate_payment', () => ({ data: activation, error: null }))
}
const withPayment = (value, status = 200) => ({ env: ENV, fetch: () => json(value, status) })
const activateCalls = () => h.fake.rpcCalls('subscription_activate_payment')

beforeEach(() => h.reset(withPayment(entity())))

function post(over = {}, headers = { authorization: 'Bearer user-token' }) {
  const body = { razorpay_order_id: ORDER, razorpay_payment_id: PAY, razorpay_signature: sign(), ...over }
  return h.call(URL_, { method: 'POST', body: typeof over === 'string' ? over : JSON.stringify(body), headers })
}

test('OPTIONS is CORS preflight, GET is 405', async () => {
  assert.equal((await h.call(URL_, { method: 'OPTIONS' })).status, 200)
  assert.equal((await h.call(URL_, { method: 'GET' })).status, 405)
})

test('bad signatures are refused before authentication, lookup, fetch or RPC', async () => {
  script()
  const wrongSameLength = sign(ORDER, PAY, 'other-secret')
  const swapped = sign(ORDER, 'pay_Different1234')
  for (const sig of [wrongSameLength, swapped, 'short', '', 'z'.repeat(64), sign().slice(0, 63) + (sign().endsWith('0') ? '1' : '0')]) {
    const res = await post({ razorpay_signature: sig })
    assert.equal(res.status, 400, `signature ${sig.slice(0, 8)}`)
    assert.equal((await res.json()).success, false)
  }
  assert.equal(h.fake.calls.length, 0, 'no auth/db call before the signature check')
  assert.equal(h.fetchCalls.length, 0)
})

test('malformed ids and non-string signature are 400', async () => {
  script()
  for (const over of [{ razorpay_order_id: 'bad' }, { razorpay_payment_id: 'pay_' }, { razorpay_signature: 123 }]) {
    assert.equal((await post(over)).status, 400)
  }
  assert.equal((await post('garbage')).status, 400)
  assert.equal(h.fetchCalls.length, 0)
})

test('uppercase hex signature is accepted (normalized), valid flow activates with source verify', async () => {
  script()
  const res = await post({ razorpay_signature: sign().toUpperCase() })
  assert.equal(res.status, 200)
  assert.equal(activateCalls().length, 1)
})

test('captured payment calls subscription_activate_payment with source verify and Razorpay-reported figures', async () => {
  script()
  const res = await post({ amount: 1, razorpay_amount: 1 })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.success, true)
  assert.equal(body.state, 'active')
  assert.deepEqual(activateCalls()[0].args, {
    p_order_id: ORDER,
    p_payment_id: PAY,
    p_amount_paise: 99900,
    p_currency: 'INR',
    p_method: 'upi',
    p_source: 'verify',
  })
  assert.equal(h.fetchCalls[0].url, `https://api.razorpay.com/v1/payments/${PAY}`)
})

test('replay activation maps to already_active', async () => {
  script({ activation: { ok: true, replay: true } })
  const body = await (await post()).json()
  assert.equal(body.state, 'already_active')
})

test('authorized / created is retryable 409 and never activates', async () => {
  for (const status of ['authorized', 'created']) {
    h.reset(withPayment(entity({ status })))
    script()
    const res = await post()
    assert.equal(res.status, 409)
    const body = await res.json()
    assert.equal(body.state, 'retry')
    assert.equal(body.retryable, true)
    assert.equal(activateCalls().length, 0)
  }
})

test('failed / refunded status and amount_refunded > 0 are 409 support and never activate', async () => {
  for (const over of [{ status: 'failed' }, { status: 'refunded' }, { amount_refunded: 500 }, { amount_refunded: 99900 }]) {
    h.reset(withPayment(entity(over)))
    script()
    const res = await post()
    assert.equal(res.status, 409, JSON.stringify(over))
    const body = await res.json()
    assert.equal(body.state, 'support')
    assert.equal(body.success, false)
    assert.equal(activateCalls().length, 0)
  }
})

test('mismatching order/payment id, wrong currency, bad amount never activate', async () => {
  for (const over of [{ order_id: 'order_Other123456' }, { id: 'pay_Other1234567' }, { currency: 'USD' }, { amount: 0 }, { amount: 10.5 }, { amount: '99900' }]) {
    h.reset(withPayment(entity(over)))
    script()
    const res = await post()
    assert.equal(res.status, 409, JSON.stringify(over))
    assert.equal(activateCalls().length, 0)
  }
})

test('order that belongs to another agency or does not exist is 404 and Razorpay is not called', async () => {
  script({ orderRow: { agency_id: 'someone-else' } })
  assert.equal((await post()).status, 404)
  h.reset(withPayment(entity()))
  script({ orderRow: null })
  assert.equal((await post()).status, 404)
  assert.equal(h.fetchCalls.length, 0)
})

test('non-owner caller is refused', async () => {
  script()
  h.fake.onFrom('transport_agencies', () => ({ data: [], error: null }))
  const res = await post()
  assert.equal(res.status, 403)
  assert.equal(h.fetchCalls.length, 0)
})

test('missing Authorization is 401 after the signature passed', async () => {
  script()
  const res = await post({}, {})
  assert.equal(res.status, 401)
  assert.equal(h.fetchCalls.length, 0)
})

test('Razorpay 5xx / 429 / network error is retryable 503; 4xx is 409 support', async () => {
  for (const status of [500, 502, 429]) {
    h.reset(withPayment({ error: 'x' }, status))
    script()
    const res = await post()
    assert.equal(res.status, 503)
    assert.equal((await res.json()).retryable, true)
  }
  h.reset(withPayment({ error: 'x' }, 404))
  script()
  assert.equal((await post()).status, 409)
  h.reset({ env: ENV, fetch: () => { throw new Error('down') } })
  script()
  assert.equal((await post()).status, 503)
  assert.equal(activateCalls().length, 0)
})

test('database error on activation is retryable 503', async () => {
  script()
  h.fake.onRpc('subscription_activate_payment', () => ({ data: null, error: { code: '40001', message: 'x' } }))
  const res = await post()
  assert.equal(res.status, 503)
  assert.equal((await res.json()).retryable, true)
})

test('typed activation refusals map to review / support / not_found / retry', async () => {
  const table = [
    [{ ok: false, error: 'AMOUNT_MISMATCH' }, 422, 'review'],
    [{ ok: false, error: 'CURRENCY_MISMATCH' }, 422, 'review'],
    [{ ok: false, error: 'payment_id_in_use' }, 409, 'support'],
    [{ ok: false, error: 'order_not_found' }, 404, 'not_found'],
    [{ ok: false, error: 'whatever', retryable: true }, 503, 'retry'],
    [{ ok: false, error: 'unknown_code' }, 409, 'support'],
  ]
  for (const [activation, status, state] of table) {
    h.reset(withPayment(entity()))
    script({ activation })
    const res = await post()
    assert.equal(res.status, status, JSON.stringify(activation))
    assert.equal((await res.json()).state, state)
  }
})

test('missing keys -> 503 retry, no fetch', async () => {
  h.reset({ env: { ...ENV, RAZORPAY_KEY_ID: '' }, fetch: () => json(entity()) })
  const res = await post()
  assert.equal(res.status, 503)
  assert.equal(h.fetchCalls.length, 0)
})
