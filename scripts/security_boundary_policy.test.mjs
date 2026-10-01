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

// TO-131: the portal service helpers were reverted once (04cf579c) to raw
// message passthrough. This source-level gate keeps the safe boundary in place.
const PORTAL_SERVICE_FILES = [
  'frontend/src/services/adminSupabaseApi.ts',
  'frontend/src/services/agencyPortalApi.ts',
]

test('portal service helpers do not surface raw provider error strings to users', () => {
  for (const path of PORTAL_SERVICE_FILES) {
    const source = fs.readFileSync(path, 'utf8')
    assert.doesNotMatch(
      source,
      /return\s+payload\.error/,
      `${path} must not pass arbitrary JSON payload.error strings to users`,
    )
    assert.doesNotMatch(
      source,
      /return\s+error\.message/,
      `${path} must not pass raw error.message strings to users`,
    )
    assert.match(
      source,
      /resolveFunctionUserMessage/,
      `${path} must resolve user messages through the approved typed-code mapping`,
    )
  }
})
