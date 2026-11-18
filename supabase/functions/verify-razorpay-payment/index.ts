// Razorpay checkout verification: a THIN shell around subscription_activate_payment (TO-152).
// Deploy with: supabase functions deploy verify-razorpay-payment
// Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (never logged, never returned).
//
// Steps: authenticate -> constant-time HMAC check of order_id|payment_id -> fetch the payment from
// Razorpay (captured, same order, INR) -> ONE database call that activates. No TypeScript writes.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, handleRequestError, jsonResponse, requireUserContext, RequestError } from '../_shared/portal-auth.ts'
import { mapActivationResult, resolveOwnerAgency } from '../_shared/activation.ts'
import { checkFetchedPayment, isValidOrderId, isValidPaymentId, readCappedText, verifyCheckoutSignature } from '../_shared/razorpay.ts'

const MAX_JSON_BODY_BYTES = 16 * 1024

function fail(status: number, state: string, message: string, retryable = false) {
  return jsonResponse({ success: false, state, message, retryable }, status)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return fail(405, 'support', 'Method not allowed.')
  }

  try {
    const keyId = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''
    if (!keyId || !keySecret) {
      console.error('[verify-razorpay-payment] Razorpay keys are not configured')
      return fail(503, 'retry', 'Payments are not available right now. Please check again in a moment.', true)
    }

    let body: Record<string, unknown> = {}
    const rawBody = await readCappedText(req.body, MAX_JSON_BODY_BYTES, req.headers.get('content-length'))
    try {
      const parsed: unknown = rawBody.ok ? JSON.parse(rawBody.text) : null
      body = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
    } catch {
      body = {}
    }
    const orderId = body.razorpay_order_id
    const paymentId = body.razorpay_payment_id
    const signature = body.razorpay_signature
    if (!isValidOrderId(orderId) || !isValidPaymentId(paymentId) || typeof signature !== 'string') {
      return fail(400, 'support', 'We could not read the payment details. Please contact support if money was deducted.')
    }

    // Constant-time signature check BEFORE any lookup.
    if (!(await verifyCheckoutSignature(keySecret, orderId, paymentId, signature))) {
      console.error('[verify-razorpay-payment] signature check failed')
      return fail(400, 'support', 'We could not verify this payment. Please contact support if money was deducted.')
    }

    const { caller, serviceClient } = await requireUserContext(req.headers.get('Authorization'))
    const owner = await resolveOwnerAgency(serviceClient as unknown as Parameters<typeof resolveOwnerAgency>[0], caller.id)
    if (!owner.ok) {
      if (owner.error.status >= 500) console.error('[verify-razorpay-payment]', owner.log)
      return fail(owner.error.status, 'support', owner.error.message, owner.error.status >= 500)
    }
    const agencyId = owner.agencyId

    // The order must belong to the caller's agency (read-only).
    const { data: orderRow, error: orderError } = await serviceClient
      .from('payment_history')
      .select('agency_id')
      .eq('razorpay_order_id', orderId)
      .not('agency_id', 'is', null)
      .maybeSingle<{ agency_id: string }>()
    if (orderError) {
      console.error('[verify-razorpay-payment] order lookup failed', orderError.code ?? 'unknown')
      return fail(503, 'retry', 'We are confirming your payment. Please check again in a moment.', true)
    }
    if (!orderRow || orderRow.agency_id !== agencyId) {
      return fail(404, 'not_found', 'We could not find this payment. If money was deducted, please contact support.')
    }

    // Razorpay itself must say: captured, same order, INR.
    let paymentResponse: Response
    try {
      paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` },
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      console.error('[verify-razorpay-payment] payment fetch failed to complete')
      return fail(503, 'retry', 'We are confirming your payment. Please check again in a moment.', true)
    }
    if (paymentResponse.status >= 500 || paymentResponse.status === 429) {
      return fail(503, 'retry', 'We are confirming your payment. Please check again in a moment.', true)
    }
    if (!paymentResponse.ok) {
      return fail(409, 'support', 'We could not confirm this payment automatically. Please contact support.')
    }
    const check = checkFetchedPayment(await paymentResponse.json().catch(() => null), orderId, paymentId)
    if (!check.ok) {
      if (check.error === 'payment_not_captured') {
        return fail(409, 'retry', 'Your payment is not confirmed yet. Please check again in a moment.', true)
      }
      console.error('[verify-razorpay-payment] payment refused:', check.error)
      return fail(409, 'support', 'We could not confirm this payment automatically. Please contact support.')
    }

    // The single activation path. The database compares the amount with the stored total.
    const { data, error } = await serviceClient.rpc('subscription_activate_payment', {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_amount_paise: check.amountPaise,
      p_currency: check.currency,
      p_method: check.method,
      p_source: 'verify',
    })
    if (error) {
      console.error('[verify-razorpay-payment] activation call failed', error.code ?? 'unknown')
      return fail(503, 'retry', 'We are confirming your payment. Please check again in a moment.', true)
    }
    const view = mapActivationResult(data)
    if (!view.body.success) {
      console.error('[verify-razorpay-payment] activation not applied:', view.body.state)
    }
    return jsonResponse(view.body, view.httpStatus)
  } catch (error) {
    if (error instanceof RequestError) {
      return handleRequestError('verify-razorpay-payment', error)
    }
    console.error('[verify-razorpay-payment] unexpected error', error instanceof Error ? error.name : 'unknown')
    return fail(503, 'retry', 'We are confirming your payment. Please check again in a moment.', true)
  }
})
