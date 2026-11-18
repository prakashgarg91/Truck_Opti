// Razorpay order creation: a THIN shell. The database prices, stores and compares (TO-152).
// Deploy with: supabase functions deploy create-razorpay-order
// Env: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET (never logged, never returned).
//
// The client sends ONLY { plan_tier, billing_cycle, coupon_code }. No amount, price or agency id is read.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, handleRequestError, jsonResponse, requireUserContext, RequestError } from '../_shared/portal-auth.ts'
import {
  buildRazorpayOrderBody,
  cancelPendingOrderBestEffort,
  checkoutPrecheck,
  finalizeCreateOrder,
  parseCreateOrderRequest,
  readQuote,
  resolveOwnerAgency,
  type UserFacingError,
} from '../_shared/activation.ts'
import { readCappedText } from '../_shared/razorpay.ts'

const MAX_JSON_BODY_BYTES = 16 * 1024

function refuse(error: UserFacingError) {
  return jsonResponse({ error: error.code, message: error.message }, error.status)
}

serve(async (req) => {
  // Set once the Razorpay order exists; any later failure releases its coupon reservation.
  let createdOrderId: string | null = null
  let cleanupClient: Parameters<typeof cancelPendingOrderBestEffort>[0] | null = null

  async function refuseAndCancel(error: UserFacingError) {
    if (createdOrderId && cleanupClient) {
      const code = await cancelPendingOrderBestEffort(cleanupClient, createdOrderId)
      if (code) console.error('[create-razorpay-order] cancel pending order failed', code)
    }
    return refuse(error)
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed', message: 'Method not allowed.' }, 405)
  }

  try {
    const keyId = Deno.env.get('RAZORPAY_KEY_ID') ?? ''
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''
    if (!keyId || !keySecret) {
      console.error('[create-razorpay-order] Razorpay keys are not configured')
      return refuse({ status: 503, code: 'billing_unavailable', message: 'Payments are not available right now. Please try again later.' })
    }

    let body: unknown = null
    const rawBody = await readCappedText(req.body, MAX_JSON_BODY_BYTES, req.headers.get('content-length'))
    if (rawBody.ok) {
      try {
        body = JSON.parse(rawBody.text)
      } catch {
        body = null
      }
    }
    const parsed = parseCreateOrderRequest(body)
    if (!parsed.ok) {
      return refuse(parsed.error)
    }
    const input = parsed.value

    // Authenticate and resolve the caller's own agency (owner). Approval is judged below, calmly.
    const { caller, serviceClient } = await requireUserContext(req.headers.get('Authorization'))
    // The cast only avoids TS2589 (structural comparison of the full SupabaseClient is too deep for tsc); the shape is checked by the runtime lookup.
    const owner = await resolveOwnerAgency(serviceClient as unknown as Parameters<typeof resolveOwnerAgency>[0], caller.id)
    if (!owner.ok) {
      if (owner.error.status >= 500) console.error('[create-razorpay-order]', owner.log)
      return refuse(owner.error)
    }
    const { agencyId, agencyStatus } = owner
    cleanupClient = serviceClient

    // 1. State check BEFORE anything is created at Razorpay.
    const { data: state, error: stateError } = await serviceClient.rpc('agency_subscription_state', { p_agency_id: agencyId })
    if (stateError) {
      console.error('[create-razorpay-order] state lookup failed', stateError.code ?? 'unknown')
    }
    const precheck = checkoutPrecheck(agencyStatus, stateError ? null : state)
    if (!precheck.ok) {
      return refuse(precheck.error)
    }

    // 2. Quote server-side.
    const { data: quoteData, error: quoteError } = await serviceClient.rpc('subscription_quote_order', {
      p_agency_id: agencyId,
      p_plan_tier: input.planTier,
      p_billing_cycle: input.billingCycle,
      p_coupon_code: input.couponCode,
    })
    if (quoteError) {
      console.error('[create-razorpay-order] quote failed', quoteError.code ?? 'unknown')
      return refuse({ status: 503, code: 'order_failed', message: 'Unable to start the payment right now. Please try again.' })
    }
    const quote = readQuote(quoteData)
    if (!quote.ok) {
      return refuse(quote.error)
    }

    // 3. Create the Razorpay order with the quoted total.
    const orderBody = buildRazorpayOrderBody(quote.quote, Date.now())
    let razorpayResponse: Response
    try {
      razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderBody),
        signal: AbortSignal.timeout(15000),
      })
    } catch {
      console.error('[create-razorpay-order] Razorpay order request failed to complete')
      return refuse({ status: 502, code: 'order_failed', message: 'Unable to start the payment right now. Please try again.' })
    }
    if (!razorpayResponse.ok) {
      console.error('[create-razorpay-order] Razorpay refused the order', razorpayResponse.status)
      return refuse({ status: 502, code: 'order_failed', message: 'Unable to start the payment right now. Please try again.' })
    }
    const razorpayOrder = (await razorpayResponse.json().catch(() => null)) as { id?: unknown; amount?: unknown; currency?: unknown } | null
    if (
      !razorpayOrder ||
      typeof razorpayOrder.id !== 'string' ||
      razorpayOrder.amount !== quote.quote.totalPaise ||
      razorpayOrder.currency !== 'INR'
    ) {
      console.error('[create-razorpay-order] Razorpay order does not match the quote')
      if (razorpayOrder && typeof razorpayOrder.id === 'string') createdOrderId = razorpayOrder.id
      return await refuseAndCancel({ status: 502, code: 'order_failed', message: 'Unable to start the payment right now. Please try again.' })
    }

    createdOrderId = razorpayOrder.id

    // 4. Store the order (server snapshot) and COMPARE the stored total with what Razorpay was sent.
    const { data: created, error: createError } = await serviceClient.rpc('subscription_create_order', {
      p_agency_id: agencyId,
      p_plan_tier: input.planTier,
      p_billing_cycle: input.billingCycle,
      p_coupon_code: input.couponCode,
      p_razorpay_order_id: razorpayOrder.id,
    })
    if (createError) {
      console.error('[create-razorpay-order] subscription_create_order failed', createError.code ?? 'unknown')
      return await refuseAndCancel({ status: 503, code: 'order_failed', message: 'Unable to start the payment right now. Please try again.' })
    }
    const outcome = finalizeCreateOrder(razorpayOrder.id, quote.quote.totalPaise, created)
    if (!outcome.ok) {
      console.error('[create-razorpay-order] refused checkout:', outcome.log, 'order', razorpayOrder.id)
      return await refuseAndCancel(outcome.error)
    }

    return jsonResponse(outcome.response, 200)
  } catch (error) {
    if (error instanceof RequestError) {
      return handleRequestError('create-razorpay-order', error)
    }
    console.error('[create-razorpay-order] unexpected error', error instanceof Error ? error.name : 'unknown')
    return await refuseAndCancel({ status: 500, code: 'order_failed', message: 'Unable to start the payment right now. Please try again.' })
  }
})
