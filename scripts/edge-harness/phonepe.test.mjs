// PhonePe functions (supabase/functions/phonepe-checkout, phonepe-status).
// Expectations: PhonePe config is read per request; with merchant id or salt key missing -> 503 billing_unavailable
// and no outbound PhonePe call. The auth checks run first: a signed-out caller never reaches the config check.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction } from './run.mjs'

const BASE_ENV = {
  SUPABASE_URL: 'http://db.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  PHONEPE_MERCHANT_ID: 'MERCHANT_TEST',
  PHONEPE_SALT_KEY: 'salt-test',
  PHONEPE_SALT_INDEX: '1',
}
const WITHOUT = {
  noMerchant: { ...BASE_ENV, PHONEPE_MERCHANT_ID: '' },
  noSalt: { ...BASE_ENV, PHONEPE_SALT_KEY: '' },
  noSecrets: { SUPABASE_URL: BASE_ENV.SUPABASE_URL, SUPABASE_ANON_KEY: BASE_ENV.SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: BASE_ENV.SUPABASE_SERVICE_ROLE_KEY },
}
const CHECKOUT_URL = 'http://edge.test/phonepe-checkout'
const STATUS_URL = 'http://edge.test/phonepe-status'
const USER = { id: 'user-1' }

const checkout = await loadFunction('phonepe-checkout')
const status = await loadFunction('phonepe-status')

// Any PhonePe call fails the test: the harness throws on unexpected fetch targets, and fetchCalls must stay empty.
const noPhonePeFetch = () => { throw new Error('PhonePe must not be called') }

function signedIn(h) {
  h.fake.onGetUser(() => ({ data: { user: USER }, error: null }))
}

function post(h, url, body, headers) {
  return h.call(url, { method: 'POST', body: JSON.stringify(body), headers })
}

beforeEach(() => {
  checkout.reset({ env: BASE_ENV, fetch: noPhonePeFetch })
  status.reset({ env: BASE_ENV, fetch: noPhonePeFetch })
})

test('checkout: merchant id or salt key missing -> 503 billing_unavailable, no PhonePe call', async () => {
  for (const env of [WITHOUT.noMerchant, WITHOUT.noSalt, WITHOUT.noSecrets]) {
    checkout.reset({ env, fetch: noPhonePeFetch })
    signedIn(checkout)
    const res = await post(checkout, CHECKOUT_URL, { amount: 10000, planId: 'plan-1', billingCycle: 'monthly' }, { authorization: 'Bearer user-token' })
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, 'billing_unavailable')
    assert.equal(typeof body.message, 'string')
    assert.equal(checkout.fetchCalls.length, 0)
    assert.equal(checkout.fake.fromCalls('payment_history').length, 0)
  }
})

test('checkout: signed-out caller is refused by the auth check before the config check (no 503, no PhonePe call)', async () => {
  checkout.reset({ env: WITHOUT.noSecrets, fetch: noPhonePeFetch })
  const res = await post(checkout, CHECKOUT_URL, { amount: 10000 }, {})
  // Existing checkout behaviour for a missing session is a 400 with a safe message (not changed by this fix).
  assert.equal(res.status, 400)
  assert.equal((await res.json()).error, 'Authentication is required to create a PhonePe checkout')
  assert.equal(checkout.fetchCalls.length, 0)
})

test('status: merchant id or salt key missing -> 503 billing_unavailable, no PhonePe call', async () => {
  for (const env of [WITHOUT.noMerchant, WITHOUT.noSalt, WITHOUT.noSecrets]) {
    status.reset({ env, fetch: noPhonePeFetch })
    signedIn(status)
    const res = await post(status, STATUS_URL, { merchantTransactionId: 'txn-1' }, { authorization: 'Bearer user-token' })
    assert.equal(res.status, 503)
    const body = await res.json()
    assert.equal(body.error, 'billing_unavailable')
    assert.equal(status.fetchCalls.length, 0)
    assert.equal(status.fake.fromCalls('payment_history').length, 0)
  }
})

test('status: signed-out caller still gets 401 with config missing, and nothing is fetched', async () => {
  status.reset({ env: WITHOUT.noSecrets, fetch: noPhonePeFetch })
  const res = await post(status, STATUS_URL, { merchantTransactionId: 'txn-1' }, {})
  assert.equal(res.status, 401)
  assert.equal((await res.json()).error, 'Authentication is required to check PhonePe payment status')
  assert.equal(status.fetchCalls.length, 0)
})

test('status: unresolvable session is still 401 with config missing', async () => {
  status.reset({ env: WITHOUT.noSecrets, fetch: noPhonePeFetch })
  status.fake.onGetUser(() => ({ data: { user: null }, error: { message: 'bad token' } }))
  const res = await post(status, STATUS_URL, { merchantTransactionId: 'txn-1' }, { authorization: 'Bearer bad-token' })
  assert.equal(res.status, 401)
  assert.equal(status.fetchCalls.length, 0)
})
