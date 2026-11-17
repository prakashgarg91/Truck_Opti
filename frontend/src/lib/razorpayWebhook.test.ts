import { createHmac, createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildRazorpayOrderBody,
  cancelPendingOrderBestEffort,
  checkoutPrecheck,
  finalizeCreateOrder,
  mapActivationResult,
  mapOrderRefusal,
  parseCreateOrderRequest,
  readQuote,
  resolveOwnerAgency,
} from '../../../supabase/functions/_shared/activation.ts'
import {
  checkFetchedPayment,
  decodeUtf8Strict,
  isValidOrderId,
  isValidPaymentId,
  mapWebhookOutcome,
  MAX_WEBHOOK_BODY_BYTES,
  parseWebhookRequest,
  readCappedBytes,
  readCappedText,
  sha256Hex,
  timingSafeEqualStrings,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from '../../../supabase/functions/_shared/razorpay.ts'

const SECRET = 'test_secret_value'
const hmac = (secret: string, message: string) => createHmac('sha256', secret).update(message).digest('hex')

function streamOf(text: string, chunk = 1024): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunk))
      offset += chunk
    },
  })
}

describe('signatures', () => {
  const body = '{"event":"payment.captured"}'

  it('accepts a correct webhook signature of the raw body', async () => {
    expect(await verifyWebhookSignature(SECRET, body, hmac(SECRET, body))).toBe(true)
  })

  it('rejects a changed body, wrong secret, empty, short, non-hex and missing signatures', async () => {
    const good = hmac(SECRET, body)
    expect(await verifyWebhookSignature(SECRET, body + ' ', good)).toBe(false)
    expect(await verifyWebhookSignature('other', body, good)).toBe(false)
    expect(await verifyWebhookSignature(SECRET, body, '')).toBe(false)
    expect(await verifyWebhookSignature(SECRET, body, good.slice(0, 62))).toBe(false)
    expect(await verifyWebhookSignature(SECRET, body, 'z'.repeat(64))).toBe(false)
    expect(await verifyWebhookSignature(SECRET, body, null)).toBe(false)
    expect(await verifyWebhookSignature('', body, good)).toBe(false)
    expect(await verifyWebhookSignature(undefined, body, good)).toBe(false)
  })

  it('accepts an uppercase hex signature (case is not security relevant)', async () => {
    expect(await verifyWebhookSignature(SECRET, body, hmac(SECRET, body).toUpperCase())).toBe(true)
  })

  it('verifies the checkout signature over order_id|payment_id', async () => {
    const sig = hmac(SECRET, 'order_ABC123456|pay_XYZ123456')
    expect(await verifyCheckoutSignature(SECRET, 'order_ABC123456', 'pay_XYZ123456', sig)).toBe(true)
    expect(await verifyCheckoutSignature(SECRET, 'order_ABC123456', 'pay_OTHER12345', sig)).toBe(false)
    expect(await verifyCheckoutSignature(SECRET, 'order_ABC123456', 'pay_XYZ123456', 'a'.repeat(64))).toBe(false)
  })

  it('verifies and hashes the received bytes, not a re-encoded string', async () => {
    const bytes = new Uint8Array([0x7b, 0xff, 0xfe, 0x7d])
    const sig = createHmac('sha256', SECRET).update(Buffer.from(bytes)).digest('hex')
    expect(await verifyWebhookSignature(SECRET, bytes, sig)).toBe(true)
    expect(await sha256Hex(bytes)).toBe(createHash('sha256').update(Buffer.from(bytes)).digest('hex'))
    expect(decodeUtf8Strict(bytes)).toBeNull()
    expect(decodeUtf8Strict(new TextEncoder().encode('ok'))).toBe('ok')
    expect(decodeUtf8Strict(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d]))).toBe('\ufeff{}')
  })

  it('hashes the raw body with sha256', async () => {
    expect(await sha256Hex(body)).toBe(createHash('sha256').update(body).digest('hex'))
  })

  it('compares strings without an early exit and treats length differences as unequal', () => {
    expect(timingSafeEqualStrings('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStrings('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStrings('abc', 'abcd')).toBe(false)
    expect(timingSafeEqualStrings('', '')).toBe(true)
  })
})

describe('body cap', () => {
  it('reads a small body', async () => {
    expect(await readCappedText(streamOf('hello'))).toEqual({ ok: true, text: 'hello' })
  })

  it('refuses a body above 256 KB while streaming', async () => {
    const big = 'a'.repeat(MAX_WEBHOOK_BODY_BYTES + 1)
    expect(await readCappedText(streamOf(big, 65536))).toEqual({ ok: false, reason: 'too_large' })
  })

  it('accepts a body of exactly 256 KB', async () => {
    const exact = 'a'.repeat(MAX_WEBHOOK_BODY_BYTES)
    const out = await readCappedText(streamOf(exact, 65536))
    expect(out.ok).toBe(true)
  })

  it('caps a small JSON body at 16 KB', async () => {
    const out = await readCappedText(streamOf('x'.repeat(16 * 1024 + 1), 4096), 16 * 1024)
    expect(out).toEqual({ ok: false, reason: 'too_large' })
    expect((await readCappedBytes(streamOf('abc'), 16 * 1024)).ok).toBe(true)
  })

  it('refuses early on a declared content-length above the cap', async () => {
    expect(await readCappedText(streamOf('x'), MAX_WEBHOOK_BODY_BYTES, String(MAX_WEBHOOK_BODY_BYTES + 1))).toEqual({
      ok: false,
      reason: 'too_large',
    })
  })
})

describe('webhook request parsing', () => {
  it('parses a verified body with an event id', () => {
    const out = parseWebhookRequest('{"event":"payment.captured","payload":{}}', 'evt_123', 'a'.repeat(64))
    expect(out).toEqual({ ok: true, value: { eventId: 'evt_123', eventType: 'payment.captured', payload: { event: 'payment.captured', payload: {} } } })
  })

  it('falls back to sha_<payload hash> for a missing or malformed event id', () => {
    const sha = 'b'.repeat(64)
    for (const header of [null, '', 'bad id!', 'x'.repeat(200)]) {
      expect(parseWebhookRequest('{"event":"x"}', header, sha)).toMatchObject({ ok: true, value: { eventId: `sha_${sha}` } })
    }
  })

  it('refuses invalid json and a missing event type', () => {
    expect(parseWebhookRequest('not json', 'evt_1', 'a')).toEqual({ ok: false, error: 'invalid_json' })
    expect(parseWebhookRequest('[]', 'evt_1', 'a')).toEqual({ ok: false, error: 'invalid_json' })
    expect(parseWebhookRequest('{}', 'evt_1', 'a')).toEqual({ ok: false, error: 'event_type_missing' })
  })
})

describe('webhook outcome to HTTP', () => {
  const ok = (result: string) => mapWebhookOutcome({ data: { ok: true, result }, error: null })

  it.each(['activated', 'replay', 'duplicate', 'orphan', 'ignored', 'failed_recorded', 'refunded', 'past_due'])(
    '%s is HTTP 200',
    (result) => {
      expect(ok(result).status).toBe(200)
    },
  )

  it('an unknown ok result is still 200 (recorded, stop retries)', () => {
    expect(ok('something_new').status).toBe(200)
  })

  it('a retryable failure is 500', () => {
    expect(mapWebhookOutcome({ data: { ok: false, error: 'activation_conflict', retryable: true }, error: null }).status).toBe(500)
  })

  it('a database or transport error is 500 without leaking its message', () => {
    const out = mapWebhookOutcome({ data: null, error: { message: 'secret detail' } })
    expect(out.status).toBe(500)
    expect(JSON.stringify(out)).not.toContain('secret detail')
  })

  it('a malformed answer is 500 (retry)', () => {
    expect(mapWebhookOutcome({ data: 'x', error: null }).status).toBe(500)
    expect(mapWebhookOutcome({ data: null, error: null }).status).toBe(500)
  })

  it('a non-retryable refusal is HTTP 200 with the code and an error-level log', () => {
    for (const code of ['event_id_reused', 'event_type', 'payload_too_large', 'amount', 'currency', 'payment_id_in_use']) {
      const out = mapWebhookOutcome({ data: { ok: false, error: code, retryable: false }, error: null })
      expect(out.status).toBe(200)
      expect(out.body).toEqual({ ok: false, error: code })
      expect(out.level).toBe('error')
    }
    expect(mapWebhookOutcome({ data: { ok: false, error: 'amount' }, error: null }).status).toBe(200)
  })

  it('ok results log at info level, retryable failures are 500 at error level', () => {
    expect(ok('activated').level).toBe('info')
    expect(mapWebhookOutcome({ data: { ok: false, error: 'x', retryable: true }, error: null })).toMatchObject({ status: 500, level: 'error' })
  })

  it('never echoes a raw SQL message as a code', () => {
    const out = mapWebhookOutcome({ data: { ok: false, error: 'ERROR: relation "x" does not exist' }, error: null })
    expect(out.body).toEqual({ ok: false, error: 'rejected' })
  })
})

describe('fetched payment check', () => {
  const good = { id: 'pay_ABC123456', order_id: 'order_ABC123456', status: 'captured', amount: 59880, currency: 'INR', method: 'upi' }

  it('accepts a captured INR payment of the same order', () => {
    expect(checkFetchedPayment(good, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: true, amountPaise: 59880, currency: 'INR', method: 'upi' })
  })

  it('treats authorized and created as retryable, failed and refunded as support, and any refund as refused', () => {
    expect(checkFetchedPayment({ ...good, status: 'authorized' }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_not_captured' })
    expect(checkFetchedPayment({ ...good, status: 'created' }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_not_captured' })
    expect(checkFetchedPayment({ ...good, status: 'failed' }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_failed' })
    expect(checkFetchedPayment({ ...good, status: 'refunded' }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_failed' })
    expect(checkFetchedPayment({ ...good, amount_refunded: 100 }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_refunded' })
    expect(checkFetchedPayment({ ...good, amount_refunded: 0 }, 'order_ABC123456', 'pay_ABC123456')).toMatchObject({ ok: true })
  })

  it('refuses authorized, other order, other payment, non-integer amount and foreign currency', () => {
    expect(checkFetchedPayment({ ...good, status: 'authorized' }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_not_captured' })
    expect(checkFetchedPayment(good, 'order_OTHER12345', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_mismatch' })
    expect(checkFetchedPayment(good, 'order_ABC123456', 'pay_OTHER12345')).toEqual({ ok: false, error: 'payment_mismatch' })
    expect(checkFetchedPayment({ ...good, amount: 598.8 }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_amount_invalid' })
    expect(checkFetchedPayment({ ...good, amount: '59880' }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_amount_invalid' })
    expect(checkFetchedPayment({ ...good, currency: 'USD' }, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_mismatch' })
    expect(checkFetchedPayment(null, 'order_ABC123456', 'pay_ABC123456')).toEqual({ ok: false, error: 'payment_mismatch' })
  })

  it('validates Razorpay id shapes before they reach a URL', () => {
    expect(isValidOrderId('order_ABC123456')).toBe(true)
    expect(isValidOrderId('order_../x')).toBe(false)
    expect(isValidPaymentId('pay_ABC123456')).toBe(true)
    expect(isValidPaymentId('pay_ABC/../1')).toBe(false)
    expect(isValidPaymentId(42)).toBe(false)
  })
})

describe('create order request', () => {
  it('reads only plan_tier, billing_cycle and coupon_code', () => {
    const out = parseCreateOrderRequest({
      plan_tier: ' Growth ',
      billing_cycle: 'monthly',
      coupon_code: 'founding50',
      amount: 1,
      agency_id: 'evil',
      price: 1,
    })
    expect(out).toEqual({ ok: true, value: { planTier: 'growth', billingCycle: 'monthly', couponCode: 'FOUNDING50' } })
  })

  it('treats a missing or empty coupon as none', () => {
    expect(parseCreateOrderRequest({ plan_tier: 'starter', billing_cycle: 'yearly' })).toEqual({
      ok: true,
      value: { planTier: 'starter', billingCycle: 'yearly', couponCode: null },
    })
    expect(parseCreateOrderRequest({ plan_tier: 'starter', billing_cycle: 'yearly', coupon_code: '' })).toMatchObject({ ok: true })
  })

  it('refuses a bad cycle, bad plan, odd coupon and a non-object body', () => {
    expect(parseCreateOrderRequest({ plan_tier: 'starter', billing_cycle: 'weekly' })).toMatchObject({ ok: false })
    expect(parseCreateOrderRequest({ billing_cycle: 'monthly' })).toMatchObject({ ok: false })
    expect(parseCreateOrderRequest({ plan_tier: 'starter', billing_cycle: 'monthly', coupon_code: "x'; drop" })).toMatchObject({ ok: false })
    expect(parseCreateOrderRequest(null)).toMatchObject({ ok: false })
  })
})

describe('checkout precheck', () => {
  it('passes for an approved agency without a cancelled subscription', () => {
    for (const status of ['none', 'trial', 'active', 'past_due', 'grace', 'expired']) {
      expect(checkoutPrecheck('approved', { ok: true, status })).toEqual({ ok: true })
    }
  })

  it('refuses a cancelled subscription with a calm typed error', () => {
    const out = checkoutPrecheck('approved', { ok: true, status: 'cancelled' })
    expect(out).toMatchObject({ ok: false, error: { code: 'subscription_cancelled', status: 409 } })
  })

  it('refuses an agency that is not approved, and an unreadable state', () => {
    expect(checkoutPrecheck('pending', { ok: true, status: 'none' })).toMatchObject({ ok: false, error: { code: 'agency_not_operational' } })
    expect(checkoutPrecheck(null, { ok: true, status: 'none' })).toMatchObject({ ok: false })
    expect(checkoutPrecheck('approved', null)).toMatchObject({ ok: false, error: { status: 503 } })
    expect(checkoutPrecheck('approved', { ok: false, error: 'agency_not_found' })).toMatchObject({ ok: false })
  })
})

describe('quote and amount handoff', () => {
  const quoteRow = {
    ok: true,
    agency_id: '11111111-1111-1111-1111-111111111111',
    plan_tier: 'starter',
    billing_cycle: 'monthly',
    coupon_code: null,
    currency: 'INR',
    total_paise: 58882,
    quote_hash: 'h',
  }

  it('reads a valid quote and builds an order body with the quoted integer paise and identifiers only in notes', () => {
    const q = readQuote(quoteRow)
    expect(q.ok).toBe(true)
    if (!q.ok) return
    const body = buildRazorpayOrderBody(q.quote, 1700000000000)
    expect(body.amount).toBe(58882)
    expect(body.currency).toBe('INR')
    expect(String(body.receipt).length).toBeLessThanOrEqual(40)
    expect(JSON.stringify(body.notes)).not.toMatch(/amount|price|total/)
  })

  it('refuses a quote with a non-integer, tiny, huge or foreign-currency total', () => {
    for (const total_paise of [588.82, 99, 2147483648, '58882', null]) {
      expect(readQuote({ ...quoteRow, total_paise }).ok).toBe(false)
    }
    expect(readQuote({ ...quoteRow, currency: 'USD' }).ok).toBe(false)
    expect(readQuote(null).ok).toBe(false)
  })

  it('maps quote refusals to calm typed errors and unknown ones to a generic error', () => {
    expect(mapOrderRefusal({ ok: false, error: 'coupon_expired' })).toMatchObject({ code: 'coupon_expired', status: 422 })
    expect(mapOrderRefusal({ ok: false, error: 'BILLING_STATE_REQUIRED' })).toMatchObject({ code: 'billing_state_required' })
    expect(mapOrderRefusal({ ok: false, error: 'boom: raw sql' })).toMatchObject({ code: 'order_failed' })
  })

  it('returns exactly {id, amount, currency, quote_hash} when the stored total equals the amount sent', () => {
    const out = finalizeCreateOrder('order_ABC123456', 58882, { ok: true, total_paise: 58882, quote_hash: 'abc' })
    expect(out).toEqual({ ok: true, response: { id: 'order_ABC123456', amount: 58882, currency: 'INR', quote_hash: 'abc' } })
  })

  it('refuses to return a checkout when the stored total differs from the amount sent', () => {
    const out = finalizeCreateOrder('order_ABC123456', 58882, { ok: true, total_paise: 58883, quote_hash: 'abc' })
    expect(out).toMatchObject({ ok: false, error: { code: 'price_changed' } })
    if (!out.ok) expect(out.log).toContain('amount_mismatch')
  })

  it('refuses when the stored total is missing, non-integer or the order call refused', () => {
    expect(finalizeCreateOrder('order_A', 100, { ok: true, quote_hash: 'a' }).ok).toBe(false)
    expect(finalizeCreateOrder('order_A', 100, { ok: true, total_paise: '100', quote_hash: 'a' }).ok).toBe(false)
    expect(finalizeCreateOrder('order_A', 100, { ok: true, total_paise: 100 }).ok).toBe(false)
    expect(finalizeCreateOrder('order_A', 100, { ok: false, error: 'order_id_conflict' })).toMatchObject({ ok: false, error: { code: 'order_conflict' } })
    expect(finalizeCreateOrder('order_A', 100, null).ok).toBe(false)
  })
})

describe('activation result mapping', () => {
  it('maps a fresh and a replayed activation to success states', () => {
    expect(mapActivationResult({ ok: true, replay: false, subscription_id: 's', status: 'active' })).toMatchObject({
      httpStatus: 200,
      body: { success: true, state: 'active', subscription_id: 's' },
    })
    expect(mapActivationResult({ ok: true, replay: true })).toMatchObject({ httpStatus: 200, body: { success: true, state: 'already_active' } })
  })

  it('maps amount and currency mismatches to a review state without raw codes', () => {
    for (const error of ['AMOUNT_MISMATCH', 'CURRENCY_MISMATCH']) {
      const view = mapActivationResult({ ok: false, error })
      expect(view.body.state).toBe('review')
      expect(JSON.stringify(view)).not.toContain(error)
    }
  })

  it('maps retryable failures to 503 retry and unknown order to 404', () => {
    expect(mapActivationResult({ ok: false, error: 'activation_conflict', retryable: true })).toMatchObject({ httpStatus: 503, body: { retryable: true } })
    expect(mapActivationResult({ ok: false, error: 'order_not_found' }).httpStatus).toBe(404)
    expect(mapActivationResult(null).httpStatus).toBe(503)
  })

  it('maps blocked activations to a support state', () => {
    for (const error of ['subscription_cancelled', 'order_already_paid', 'payment_id_in_use', 'something_else']) {
      expect(mapActivationResult({ ok: false, error })).toMatchObject({ httpStatus: 409, body: { state: 'support', success: false } })
    }
  })
})

describe('owner lookup and order cleanup', () => {
  function lookup(result: { data: Array<{ id: string; status: string | null }> | null; error: { code?: string } | null }) {
    const calls: unknown[] = []
    const client = {
      from: () => ({
        select: () => ({
          eq: (_c: string, v: string) => ({
            order: (col: string, opts: { ascending: boolean }) => ({
              limit: (n: number) => {
                calls.push([v, col, opts.ascending, n])
                return Promise.resolve(result)
              },
            }),
          }),
        }),
      }),
    }
    return { client, calls }
  }

  it('resolves the oldest owned agency', async () => {
    const { client, calls } = lookup({ data: [{ id: 'a1', status: 'approved' }], error: null })
    expect(await resolveOwnerAgency(client, 'u1')).toEqual({ ok: true, agencyId: 'a1', agencyStatus: 'approved' })
    expect(calls).toEqual([['u1', 'created_at', true, 1]])
  })

  it('tells non-owner staff that only the owner can subscribe', async () => {
    const { client } = lookup({ data: [], error: null })
    const out = await resolveOwnerAgency(client, 'u1')
    expect(out).toMatchObject({ ok: false, error: { status: 403, code: 'owner_required' } })
    if (!out.ok) expect(out.error.message).toContain('Only the agency owner can subscribe')
  })

  it('reports a lookup failure as retryable 503', async () => {
    const { client } = lookup({ data: null, error: { code: 'XX000' } })
    expect(await resolveOwnerAgency(client, 'u1')).toMatchObject({ ok: false, error: { status: 503 } })
  })

  it('cancels a pending order best effort and never throws', async () => {
    const seen: unknown[] = []
    expect(await cancelPendingOrderBestEffort({ rpc: (n, a) => (seen.push([n, a]), Promise.resolve({ error: null })) }, 'order_X')).toBeNull()
    expect(seen).toEqual([['subscription_cancel_pending_order', { p_razorpay_order_id: 'order_X' }]])
    expect(await cancelPendingOrderBestEffort({ rpc: () => Promise.resolve({ error: { code: '42883' } }) }, 'order_X')).toBe('42883')
    expect(await cancelPendingOrderBestEffort({ rpc: () => Promise.reject(new Error('secret')) }, 'order_X')).toBe('exception')
  })
})
