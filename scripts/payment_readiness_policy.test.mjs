import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const webhook = fs.readFileSync('supabase/functions/razorpay-webhook/index.ts', 'utf8')

test('Razorpay webhook verification uses a dedicated webhook secret and fails closed when absent', () => {
  assert.match(webhook, /RAZORPAY_WEBHOOK_SECRET/)
  assert.doesNotMatch(webhook, /const secret = Deno\.env\.get\('RAZORPAY_KEY_SECRET'\)/)
  assert.match(webhook, /Webhook not configured/)
})
