import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction, json } from './run.mjs'

const ENV = {
  RAZORPAY_KEY_ID: 'rzp_test_key',
  RAZORPAY_KEY_SECRET: 'rzp_test_secret',
  SUPABASE_URL: 'http://db.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
}
const URL_ = 'http://edge.test/create-razorpay-order'
const ORDER_ID = 'order_TestOrder123'
const QUOTE = { ok: true, total_paise: 99900, currency: 'INR', agency_id: 'agency-1', plan_tier: 'pro', billing_cycle: 'monthly', coupon_code: null }

const h = await loadFunction('create-razorpay-order')

/** Scripts a happy path; individual tests override pieces. */
function script({ agencyRows = [{ id: 'agency-1', status: 'approved' }], state = { ok: true, status: 'active' }, quote = QUOTE, created } = {}) {
  h.fake
    .onGetUser(() => ({ data: { user: { id: 'user-1' } }, error: null }))
    .onFrom('transport_agencies', () => ({ data: agencyRows, error: null }))
    .onRpc('agency_subscription_state', () => ({ data: state, error: null }))
    .onRpc('subscription_quote_order', () => ({ data: quote, error: null }))
    .onRpc('subscription_create_order', () => ({ data: created ?? { ok: true, total_paise: quote?.total_paise, quote_hash: 'hash_abc' }, error: null }))
    .onRpc('subscription_cancel_pending_order', () => ({ data: null, error: null }))
}

const razorpayOk = (_url, init) => json({ id: ORDER_ID, amount: JSON.parse(init.body).amount, currency: 'INR' })

beforeEach(() => h.reset({ env: ENV, fetch: razorpayOk }))

function post(body, headers = { authorization: 'Bearer user-token' }) {
  return h.call(URL_, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers })
}
const cancelCalls = () => h.fake.rpcCalls('subscription_cancel_pending_order')

test('OPTIONS answers CORS preflight, other verbs are 405', async () => {
  const pre = await h.call(URL_, { method: 'OPTIONS' })
  assert.equal(pre.status, 200)
  assert.ok(pre.headers.get('access-control-allow-origin'))
  assert.equal((await h.call(URL_, { method: 'GET' })).status, 405)
})

test('missing Razorpay keys -> 503 billing_unavailable, no fetch', async () => {
  h.reset({ env: { ...ENV, RAZORPAY_KEY_SECRET: '' }, fetch: razorpayOk })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 503)
  assert.equal((await res.json()).error, 'billing_unavailable')
  assert.equal(h.fetchCalls.length, 0)
})

test('invalid request bodies are refused before authentication', async () => {
  for (const [body, code] of [
    ['not json', 'invalid_request'],
    [{ billing_cycle: 'monthly' }, 'invalid_plan'],
    [{ plan_tier: 'pro', billing_cycle: 'weekly' }, 'invalid_cycle'],
    [{ plan_tier: 'pro', billing_cycle: 'monthly', coupon_code: 'bad code!' }, 'coupon_invalid'],
  ]) {
    const res = await post(body)
    assert.equal((await res.json()).error, code)
  }
  assert.equal(h.fake.calls.length, 0)
  assert.equal(h.fetchCalls.length, 0)
})

test('missing Authorization header is 401 and nothing is created at Razorpay', async () => {
  script()
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' }, {})
  assert.equal(res.status, 401)
  assert.equal(h.fetchCalls.length, 0)
})

test('only plan_tier, billing_cycle, coupon_code are used; client amount/agency/price are ignored', async () => {
  script()
  const res = await post({
    plan_tier: 'PRO',
    billing_cycle: 'monthly',
    coupon_code: ' save10 ',
    amount: 1,
    total_paise: 1,
    price: 1,
    agency_id: 'attacker-agency',
    user_id: 'attacker',
  })
  assert.equal(res.status, 200)
  const quoteCall = h.fake.rpcCalls('subscription_quote_order')[0]
  assert.deepEqual(quoteCall.args, { p_agency_id: 'agency-1', p_plan_tier: 'pro', p_billing_cycle: 'monthly', p_coupon_code: 'SAVE10' })
  assert.equal(h.fetchCalls.length, 1)
  const sent = JSON.parse(h.fetchCalls[0].init.body)
  assert.equal(sent.amount, 99900)
  assert.equal(sent.currency, 'INR')
  assert.equal(sent.notes.agency_id, 'agency-1')
  assert.ok(!JSON.stringify(sent).includes('attacker'))
  const createCall = h.fake.rpcCalls('subscription_create_order')[0]
  assert.deepEqual(Object.keys(createCall.args).sort(), ['p_agency_id', 'p_billing_cycle', 'p_coupon_code', 'p_plan_tier', 'p_razorpay_order_id'])
})

test('happy path returns exactly {id, amount, currency, quote_hash}', async () => {
  script()
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.deepEqual(body, { id: ORDER_ID, amount: 99900, currency: 'INR', quote_hash: 'hash_abc' })
  assert.equal(cancelCalls().length, 0)
  const call = h.fetchCalls[0]
  assert.equal(call.url, 'https://api.razorpay.com/v1/orders')
  assert.equal(call.init.headers.Authorization, `Basic ${Buffer.from('rzp_test_key:rzp_test_secret').toString('base64')}`)
  assert.ok(!JSON.stringify(body).includes('rzp_test_secret'))
})

test('registered quote: gst_registered true and gst_rate_pct 18 pass through unchanged next to the amounts', async () => {
  script({ created: { ok: true, total_paise: 99900, quote_hash: 'hash_abc', gst_registered: true, gst_rate_pct: 18 } })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { id: ORDER_ID, amount: 99900, currency: 'INR', quote_hash: 'hash_abc', gst_registered: true, gst_rate_pct: 18 })
})

test('unregistered quote: gst_registered false and gst_rate_pct 0 pass through; Razorpay is sent the total with no tax', async () => {
  script({
    quote: { ...QUOTE, total_paise: 84746 },
    created: { ok: true, total_paise: 84746, quote_hash: 'hash_def', gst_registered: false, gst_rate_pct: 0 },
  })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 200)
  assert.deepEqual(await res.json(), { id: ORDER_ID, amount: 84746, currency: 'INR', quote_hash: 'hash_def', gst_registered: false, gst_rate_pct: 0 })
  assert.equal(JSON.parse(h.fetchCalls[0].init.body).amount, 84746)
})

test('non-owner (staff / no owned agency) is refused with owner_required and no Razorpay call', async () => {
  script({ agencyRows: [] })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 403)
  assert.equal((await res.json()).error, 'owner_required')
  assert.equal(h.fetchCalls.length, 0)
  assert.equal(h.fake.rpcCalls('subscription_quote_order').length, 0)
})

test('agency lookup failure is 503 and nothing is created', async () => {
  script()
  h.fake.onFrom('transport_agencies', () => ({ data: null, error: { code: '08006', message: 'down' } }))
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 503)
  assert.equal(h.fetchCalls.length, 0)
})

test('not-approved agency is refused BEFORE any fetch to Razorpay', async () => {
  for (const status of ['pending', 'suspended', null]) {
    h.reset({ env: ENV, fetch: razorpayOk })
    script({ agencyRows: [{ id: 'agency-1', status }] })
    const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
    assert.equal(res.status, 403)
    assert.equal((await res.json()).error, 'agency_not_operational')
    assert.equal(h.fetchCalls.length, 0)
    assert.equal(h.fake.rpcCalls('subscription_quote_order').length, 0)
  }
})

test('cancelled subscription is refused BEFORE any fetch to Razorpay', async () => {
  script({ state: { ok: true, status: 'cancelled' } })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'subscription_cancelled')
  assert.equal(h.fetchCalls.length, 0)
  assert.equal(h.fake.rpcCalls('subscription_quote_order').length, 0)
})

test('subscription state unavailable is 503 before any fetch', async () => {
  script()
  h.fake.onRpc('agency_subscription_state', () => ({ data: null, error: { code: 'XX000', message: 'x' } }))
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 503)
  assert.equal((await res.json()).error, 'state_unavailable')
  assert.equal(h.fetchCalls.length, 0)
})

test('typed quote refusal is mapped and no Razorpay order is created', async () => {
  script({ quote: { ok: false, error: 'coupon_expired' } })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly', coupon_code: 'OLD' })
  assert.equal(res.status, 422)
  assert.equal((await res.json()).error, 'coupon_expired')
  assert.equal(h.fetchCalls.length, 0)
})

test('quote below 100 paise or malformed is refused before Razorpay', async () => {
  script({ quote: { ...QUOTE, total_paise: 50 } })
  assert.notEqual((await post({ plan_tier: 'pro', billing_cycle: 'monthly' })).status, 200)
  assert.equal(h.fetchCalls.length, 0)
})

test('Razorpay amount different from the quote -> no checkout returned and the order is cancelled', async () => {
  script()
  h.reset({ env: ENV, fetch: () => json({ id: ORDER_ID, amount: 100, currency: 'INR' }) })
  script()
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 502)
  const body = await res.json()
  assert.equal(body.error, 'order_failed')
  assert.ok(!('quote_hash' in body) && !('id' in body) && !('amount' in body))
  assert.equal(cancelCalls().length, 1)
  assert.deepEqual(cancelCalls()[0].args, { p_razorpay_order_id: ORDER_ID })
  assert.equal(h.fake.rpcCalls('subscription_create_order').length, 0)
})

test('Razorpay wrong currency is treated as a mismatch', async () => {
  h.reset({ env: ENV, fetch: () => json({ id: ORDER_ID, amount: 99900, currency: 'USD' }) })
  script()
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 502)
  assert.equal(cancelCalls().length, 1)
})

test('Razorpay refusing the order is 502 and nothing is stored', async () => {
  h.reset({ env: ENV, fetch: () => json({ error: { description: 'nope' } }, 400) })
  script()
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 502)
  assert.equal(h.fake.rpcCalls('subscription_create_order').length, 0)
  assert.equal(cancelCalls().length, 0)
})

test('Razorpay network failure is 502', async () => {
  h.reset({ env: ENV, fetch: () => { throw new Error('socket hang up') } })
  script()
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 502)
  assert.equal(h.fake.rpcCalls('subscription_create_order').length, 0)
})

test('stored total differing from the amount sent -> 409 price_changed and cancel, no checkout', async () => {
  script({ created: { ok: true, total_paise: 12345, quote_hash: 'hash_abc' } })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 409)
  const body = await res.json()
  assert.equal(body.error, 'price_changed')
  assert.ok(!('quote_hash' in body))
  assert.equal(cancelCalls().length, 1)
})

test('subscription_create_order failure cancels the Razorpay order reservation', async () => {
  script()
  h.fake.onRpc('subscription_create_order', () => ({ data: null, error: { code: '40001', message: 'serialization' } }))
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 503)
  assert.equal(cancelCalls().length, 1)
})

test('typed create_order refusal is mapped and cancels', async () => {
  script({ created: { ok: false, error: 'order_id_conflict' } })
  const res = await post({ plan_tier: 'pro', billing_cycle: 'monthly' })
  assert.equal(res.status, 409)
  assert.equal((await res.json()).error, 'order_conflict')
  assert.equal(cancelCalls().length, 1)
})
