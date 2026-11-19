// admin-backfill-invoice-delivery (supabase/functions/admin-backfill-invoice-delivery) and the invoice email it sends
// through _shared/invoice-delivery.ts. Expectations: deliberate request errors keep their messages; unexpected
// throws answer a generic 'Request failed.' with no database or provider internals; the invoice email HTML carries
// the "Thanks for your payment" paragraph exactly once.
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { loadFunction, json } from './run.mjs'

const ENV = {
  SUPABASE_URL: 'http://db.test',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  AWS_ACCESS_KEY_ID: 'AKIATESTKEY',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  AWS_SES_REGION: 'ap-south-1',
  BILLING_EMAIL_FROM: 'billing@truckopti.test',
  BILLING_SUPPORT_EMAIL: 'support@truckopti.test',
  BILLING_APP_URL: 'https://app.truckopti.test',
}
const URL_ = 'http://edge.test/admin-backfill-invoice-delivery'
const SES_HOST = 'email.ap-south-1.amazonaws.com'
const THANKS = 'Thanks for your payment.'
const LEAK = 'LEAK-DETAIL: relation "invoices" on db-internal-host.test'

const h = await loadFunction('admin-backfill-invoice-delivery')

const INVOICE = {
  id: 'inv-1',
  user_id: 'owner-1',
  invoice_number: 'INV-001',
  razorpay_payment_id: 'pay_1',
  subscription_id: 'sub-1',
  amount: 10000,
  tax_amount: 1800,
  total_amount: 11800,
  currency: 'INR',
  status: 'paid',
  billing_period_start: '2026-11-01',
  billing_period_end: '2026-12-01',
  paid_at: '2026-11-02T00:00:00Z',
  // A stored pdf_url skips PDF rendering, so the email path runs without pdf-lib.
  pdf_url: 'billing-documents/owner-1/inv-1/INV-001.pdf',
}

let scenario = {}

function selectsColumn(record, column) {
  const select = record.ops.find((op) => op[0] === 'select')
  return Boolean(select && String(select[1]).includes(column))
}

function scriptFake(h2) {
  const fake = h2.fake
  const original = fake.makeClient
  // The fake has no auth.admin; the delivery context loads the owner through it.
  fake.makeClient = (url, key, options) => {
    const client = original(url, key, options)
    client.auth.admin = {
      async getUserById() {
        return { data: { user: { email: 'owner@truckopti.test', phone: null, user_metadata: {} } }, error: null }
      },
    }
    return client
  }

  fake
    .onGetUser(() => ({ data: { user: { id: 'admin-1' } }, error: null }))
    .onFrom('users', (record) => {
      if (selectsColumn(record, 'role')) {
        return { data: scenario.callerRole === undefined ? { id: 'admin-1', role: 'admin' } : scenario.callerRole, error: null }
      }
      return { data: { email: 'owner@truckopti.test', name: 'Owner Name', phone: null }, error: null }
    })
    .onFrom('invoices', () => {
      if (scenario.invoiceThrows) throw new Error(LEAK)
      return { data: scenario.invoice === undefined ? INVOICE : scenario.invoice, error: null }
    })
    .onFrom('payment_history', () => ({
      data: {
        id: 'pay-hist-1',
        payment_method: 'razorpay',
        razorpay_payment_id: 'pay_1',
        metadata: { payment_provider: 'razorpay', customer_email: 'owner@truckopti.test' },
      },
      error: null,
    }))
    .onFrom('subscriptions', () => ({ data: { id: 'sub-1', plan_id: 'plan-1', billing_cycle: 'monthly' }, error: null }))
    .onFrom('subscription_plans', () => ({ data: { name: 'Pro Monthly', tier: 'pro', support_level: 'standard' }, error: null }))
}

function sesOk(url) {
  if (!url.includes(SES_HOST)) throw new Error('edge-harness: unexpected fetch to ' + url)
  return json({ MessageId: 'ses-message-1' })
}

beforeEach(() => {
  scenario = {}
  h.reset({ env: ENV, fetch: sesOk })
  scriptFake(h)
})

function post(body, authorization = 'Bearer admin-token') {
  const headers = authorization ? { authorization } : {}
  return h.call(URL_, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers })
}

test('unexpected throw -> 500 generic "Request failed." with no database or provider internals', async () => {
  scenario.invoiceThrows = true
  const res = await post({ invoiceId: 'inv-1' })
  const text = await res.text()
  assert.equal(res.status, 500)
  assert.deepEqual(JSON.parse(text), { success: false, error: 'Request failed.' })
  assert.ok(!text.includes('LEAK-DETAIL'))
  assert.ok(!text.includes('db-internal-host'))
  assert.equal(h.fetchCalls.length, 0)
})

test('deliberate request errors keep their specific messages', async () => {
  const bad = await post({ customerEmail: 'x@y.test' })
  assert.equal(bad.status, 400)
  assert.equal((await bad.json()).error, 'Provide invoiceId or invoiceNumber.')

  scenario.invoice = null
  const missing = await post({ invoiceId: 'inv-404' })
  assert.equal(missing.status, 404)
  assert.equal((await missing.json()).error, 'Invoice not found.')

  scenario.invoice = INVOICE
  scenario.callerRole = { id: 'user-1', role: 'user' }
  const notAdmin = await post({ invoiceId: 'inv-1' })
  assert.equal(notAdmin.status, 403)
  assert.equal((await notAdmin.json()).error, 'Admin access is required.')
})

test('missing session -> 401 before any database read', async () => {
  const res = await post({ invoiceId: 'inv-1' }, '')
  assert.equal(res.status, 401)
  assert.equal((await res.json()).error, 'Authentication is required.')
  assert.equal(h.fake.fromCalls('invoices').length, 0)
})

test('invoice email HTML contains the "Thanks for your payment" paragraph exactly once', async () => {
  const res = await post({ invoiceId: 'inv-1' })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.equal(body.success, true)
  assert.equal(body.emailError, null)
  assert.ok(body.emailSentAt)

  const sesCall = h.fetchCalls.find((c) => c.url.includes(SES_HOST))
  assert.ok(sesCall, 'SES send was attempted')
  const email = JSON.parse(sesCall.init.body)
  const html = email.Content.Simple.Body.Html.Data
  assert.equal(html.split(THANKS).length - 1, 1)
})
