import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHmac } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  assertTestKeyId, mask, signWebhookBody, signCheckout, checkInvoiceShape, renderPlan, runLive, HardStop, missingEnv, REQUIRED_ENV,
} from './razorpay_sandbox_proof.mjs'

const script = fileURLToPath(new URL('./razorpay_sandbox_proof.mjs', import.meta.url))

test('mask keeps only the last 4 characters', () => {
  assert.equal(mask('abcdefghijklmnop').endsWith('mnop'), true)
  assert.equal(mask('abcdefghijklmnop').includes('abcd'), false)
  assert.equal(mask('abc'), '***')
  assert.equal(mask(''), '(unset)')
})

test('live key is a hard stop, non-test key refused, test key accepted', () => {
  assert.throws(() => assertTestKeyId('rzp_live_AbCd1234'), (e) => e instanceof HardStop && /LIVE/.test(e.message))
  assert.throws(() => assertTestKeyId('abc'), HardStop)
  assert.throws(() => assertTestKeyId(''), HardStop)
  assert.equal(assertTestKeyId('rzp_test_AbCd1234'), 'rzp_test_AbCd1234')
})

test('runLive with a live key never touches the network', async () => {
  let calls = 0
  const env = Object.fromEntries(REQUIRED_ENV.map(([n]) => [n, 'x-value-123456']))
  env.RAZORPAY_KEY_ID = 'rzp_live_ZZZZ9999'
  await assert.rejects(runLive(env, { fetchImpl: () => { calls++; throw new Error('network') }, log: () => {} }), HardStop)
  assert.equal(calls, 0)
})

test('runLive with missing env names them and never touches the network', async () => {
  let calls = 0
  await assert.rejects(
    runLive({ RAZORPAY_KEY_ID: 'rzp_test_AbCd1234' }, { fetchImpl: () => { calls++ }, log: () => {} }),
    (e) => e instanceof HardStop && /SUPABASE_URL/.test(e.message),
  )
  assert.equal(calls, 0)
  assert.ok(missingEnv({}).length === REQUIRED_ENV.length)
})

test('webhook and checkout signatures are HMAC-SHA256 hex', () => {
  const raw = '{"event":"payment.captured"}'
  assert.equal(signWebhookBody('whsec', raw), createHmac('sha256', 'whsec').update(raw).digest('hex'))
  assert.equal(signCheckout('sec', 'order_A', 'pay_B'), createHmac('sha256', 'sec').update('order_A|pay_B').digest('hex'))
})

test('invoice shape: CGST=SGST or IGST, number format, totals', () => {
  const ok = { invoice_number: 'TO/26-27/000001', taxable_paise: 10000, cgst_paise: 900, sgst_paise: 900, igst_paise: 0, total_paise: 11800 }
  assert.deepEqual(checkInvoiceShape(ok), [])
  assert.deepEqual(checkInvoiceShape({ ...ok, cgst_paise: 0, sgst_paise: 0, igst_paise: 1800 }), [])
  assert.ok(checkInvoiceShape({ ...ok, sgst_paise: 800 }).length > 0)
  assert.ok(checkInvoiceShape({ ...ok, invoice_number: 'INV-1' }).length > 0)
  assert.ok(checkInvoiceShape({ ...ok, total_paise: 11801 }).length > 0)
})

test('plan lists every env var and step, masks secrets', () => {
  const plan = renderPlan({ RAZORPAY_KEY_SECRET: 'supersecretvalue9999' })
  for (const [n] of REQUIRED_ENV) assert.ok(plan.includes(n), n)
  assert.ok(plan.includes('9999') && !plan.includes('supersecretvalue9999'))
  assert.ok(/8\. Summary/i.test(plan) || plan.includes('8. Summary'))
})

test('--dry-run exits 0 with no keys and prints the plan', () => {
  const env = { ...process.env }
  for (const [n] of REQUIRED_ENV) delete env[n]
  const r = spawnSync(process.execPath, [script, '--dry-run'], { env, encoding: 'utf8' })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /PLAN \(dry run, no network calls\)/)
  assert.match(r.stdout, /NOT SET/)
})

test('CLI live run with an rzp_live_ key exits 3 and prints no secret', () => {
  const env = { ...process.env, RAZORPAY_KEY_ID: 'rzp_live_AbCd1234', RAZORPAY_KEY_SECRET: 'topsecret-value-777' }
  const r = spawnSync(process.execPath, [script], { env, encoding: 'utf8' })
  assert.equal(r.status, 3)
  assert.match(r.stderr, /HARD STOP/)
  assert.ok(!r.stdout.includes('topsecret') && !r.stderr.includes('topsecret'))
})
