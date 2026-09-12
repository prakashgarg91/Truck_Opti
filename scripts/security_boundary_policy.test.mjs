import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const PAYMENT_BOUNDARY_FILES = [
  'supabase/functions/verify-payment/index.ts',
  'supabase/functions/phonepe-status/index.ts',
  'supabase/functions/verify-razorpay-payment/index.ts',
]

test('payment Edge Functions do not expose raw caught error messages to clients', () => {
  for (const path of PAYMENT_BOUNDARY_FILES) {
    const source = fs.readFileSync(path, 'utf8')
    assert.doesNotMatch(
      source,
      /JSON\.stringify\([\s\S]{0,120}error:\s*error\.message/,
      `${path} must log internal errors server-side and return a stable client-safe message`,
    )
  }
})
