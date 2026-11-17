/**
 * TO-152 subscription checkout decisions: pure, no Deno globals, no secrets, no network.
 * The database owns every price and every activation; this module only validates input,
 * maps typed database answers to calm user-facing states, and guards the amount handoff.
 */

export type BillingCycle = 'monthly' | 'yearly'

export interface CreateOrderInput {
  planTier: string
  billingCycle: BillingCycle
  couponCode: string | null
}

export interface UserFacingError {
  status: number
  code: string
  message: string
}

const PLAN_TIER_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/
const COUPON_PATTERN = /^[A-Za-z0-9_-]{1,32}$/
/** Postgres integer ceiling used by the amount column. */
export const MAX_ORDER_PAISE = 2147483647

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Reads ONLY plan_tier, billing_cycle and coupon_code. Every other field (amount, price, agency id,
 * user id, notes) is ignored and never read.
 */
export function parseCreateOrderRequest(
  body: unknown,
): { ok: true; value: CreateOrderInput } | { ok: false; error: UserFacingError } {
  if (!isRecord(body)) {
    return { ok: false, error: { status: 400, code: 'invalid_request', message: 'Please choose a plan and billing cycle.' } }
  }
  const tier = typeof body.plan_tier === 'string' ? body.plan_tier.trim().toLowerCase() : ''
  if (!PLAN_TIER_PATTERN.test(tier)) {
    return { ok: false, error: { status: 400, code: 'invalid_plan', message: 'Please choose a plan.' } }
  }
  if (body.billing_cycle !== 'monthly' && body.billing_cycle !== 'yearly') {
    return { ok: false, error: { status: 400, code: 'invalid_cycle', message: 'Please choose monthly or yearly billing.' } }
  }
  let couponCode: string | null = null
  if (body.coupon_code !== undefined && body.coupon_code !== null && body.coupon_code !== '') {
    if (typeof body.coupon_code !== 'string' || !COUPON_PATTERN.test(body.coupon_code.trim())) {
      return { ok: false, error: { status: 422, code: 'coupon_invalid', message: 'This coupon code is not valid.' } }
    }
    couponCode = body.coupon_code.trim().toUpperCase()
  }
  return { ok: true, value: { planTier: tier, billingCycle: body.billing_cycle, couponCode } }
}

export interface SubscriptionStateLike {
  ok?: unknown
  status?: unknown
}

/**
 * Runs BEFORE anything is created at Razorpay: the agency must be approved and the subscription
 * must not be cancelled (a refunded subscription goes through support, not through a new checkout).
 */
export function checkoutPrecheck(
  agencyStatus: string | null | undefined,
  state: unknown,
): { ok: true } | { ok: false; error: UserFacingError } {
  if (agencyStatus !== 'approved') {
    return {
      ok: false,
      error: {
        status: 403,
        code: 'agency_not_operational',
        message: 'Your agency needs to be approved before you can subscribe.',
      },
    }
  }
  if (!isRecord(state) || state.ok !== true) {
    return {
      ok: false,
      error: { status: 503, code: 'state_unavailable', message: 'We could not check your subscription right now. Please try again.' },
    }
  }
  if (state.status === 'cancelled') {
    return {
      ok: false,
      error: {
        status: 409,
        code: 'subscription_cancelled',
        message: 'This subscription was cancelled after a refund. Please contact support to restart it.',
      },
    }
  }
  return { ok: true }
}

const QUOTE_ERRORS: Record<string, UserFacingError> = {
  agency_not_found: { status: 403, code: 'agency_not_found', message: 'We could not find your agency.' },
  agency_not_operational: {
    status: 403,
    code: 'agency_not_operational',
    message: 'Your agency needs to be approved before you can subscribe.',
  },
  agency_without_owner: { status: 409, code: 'agency_without_owner', message: 'Your agency needs an owner account. Please contact support.' },
  invalid_cycle: { status: 400, code: 'invalid_cycle', message: 'Please choose monthly or yearly billing.' },
  unknown_plan: { status: 400, code: 'invalid_plan', message: 'That plan is not available.' },
  plan_not_purchasable: { status: 400, code: 'invalid_plan', message: 'That plan cannot be bought online. Please contact sales.' },
  plan_change_blocked: {
    status: 409,
    code: 'plan_change_blocked',
    message: 'Your current plan still has more than 7 days left. Please contact support to change it now, or switch closer to renewal.',
  },
  coupon_invalid: { status: 422, code: 'coupon_invalid', message: 'This coupon code is not valid.' },
  coupon_expired: { status: 422, code: 'coupon_expired', message: 'This coupon has expired.' },
  coupon_exhausted: { status: 422, code: 'coupon_exhausted', message: 'This coupon has already been used up.' },
  coupon_yearly_not_allowed: { status: 422, code: 'coupon_yearly_not_allowed', message: 'This coupon works with monthly billing only.' },
  coupon_discount_too_large: { status: 422, code: 'coupon_invalid', message: 'This coupon cannot be applied to this plan.' },
  amount_too_large: { status: 400, code: 'invalid_plan', message: 'That plan cannot be bought online. Please contact sales.' },
  BILLING_NOT_CONFIGURED: { status: 503, code: 'billing_unavailable', message: 'Billing is not available right now. Please try again later.' },
  BILLING_STATE_REQUIRED: {
    status: 422,
    code: 'billing_state_required',
    message: 'Please add your GSTIN or state in your company profile so we can issue a correct invoice.',
  },
  order_id_conflict: { status: 409, code: 'order_conflict', message: 'We could not start this payment. Please try again.' },
}

const GENERIC_ORDER_ERROR: UserFacingError = {
  status: 400,
  code: 'order_failed',
  message: 'Unable to start the payment right now. Please try again.',
}

/** Maps a typed database refusal (quote or create_order) to a calm user-facing error. */
export function mapOrderRefusal(result: unknown): UserFacingError {
  if (isRecord(result) && typeof result.error === 'string' && Object.prototype.hasOwnProperty.call(QUOTE_ERRORS, result.error)) {
    return QUOTE_ERRORS[result.error]
  }
  return GENERIC_ORDER_ERROR
}

export interface Quote {
  totalPaise: number
  currency: 'INR'
  agencyId: string
  planTier: string
  billingCycle: BillingCycle
  couponCode: string | null
}

/** Validates a database quote before any money is moved at Razorpay. */
export function readQuote(result: unknown): { ok: true; quote: Quote } | { ok: false; error: UserFacingError } {
  if (!isRecord(result)) {
    return { ok: false, error: GENERIC_ORDER_ERROR }
  }
  if (result.ok !== true) {
    return { ok: false, error: mapOrderRefusal(result) }
  }
  const total = result.total_paise
  if (
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 100 ||
    total > MAX_ORDER_PAISE ||
    result.currency !== 'INR' ||
    typeof result.agency_id !== 'string' ||
    typeof result.plan_tier !== 'string' ||
    (result.billing_cycle !== 'monthly' && result.billing_cycle !== 'yearly')
  ) {
    return { ok: false, error: GENERIC_ORDER_ERROR }
  }
  return {
    ok: true,
    quote: {
      totalPaise: total,
      currency: 'INR',
      agencyId: result.agency_id,
      planTier: result.plan_tier,
      billingCycle: result.billing_cycle,
      couponCode: typeof result.coupon_code === 'string' ? result.coupon_code : null,
    },
  }
}

/** Razorpay order request body. Notes carry identifiers only, never prices. */
export function buildRazorpayOrderBody(quote: Quote, nowMs: number): Record<string, unknown> {
  return {
    amount: quote.totalPaise,
    currency: 'INR',
    receipt: `sub_${quote.agencyId.replace(/-/g, '').slice(0, 12)}_${nowMs.toString(36)}`.slice(0, 40),
    notes: {
      kind: 'subscription',
      agency_id: quote.agencyId,
      plan_tier: quote.planTier,
      billing_cycle: quote.billingCycle,
    },
  }
}

export type CreateOrderOutcome =
  | { ok: true; response: { id: string; amount: number; currency: 'INR'; quote_hash: string } }
  | { ok: false; error: UserFacingError; log: string }

/**
 * Final gate: the stored order total must equal the amount that was sent to Razorpay. On any
 * difference no checkout is returned.
 */
export function finalizeCreateOrder(
  razorpayOrderId: string,
  sentPaise: number,
  created: unknown,
): CreateOrderOutcome {
  if (!isRecord(created)) {
    return { ok: false, error: GENERIC_ORDER_ERROR, log: 'create_order_malformed' }
  }
  if (created.ok !== true) {
    return { ok: false, error: mapOrderRefusal(created), log: `create_order_refused:${String(created.error ?? 'unknown').slice(0, 40)}` }
  }
  const stored = created.total_paise
  if (typeof stored !== 'number' || !Number.isSafeInteger(stored) || stored !== sentPaise) {
    return {
      ok: false,
      error: { status: 409, code: 'price_changed', message: 'The price changed while we were preparing your payment. Please try again.' },
      log: `amount_mismatch:sent=${sentPaise}:stored=${String(stored)}`,
    }
  }
  const quoteHash = typeof created.quote_hash === 'string' ? created.quote_hash : ''
  if (!quoteHash) {
    return { ok: false, error: GENERIC_ORDER_ERROR, log: 'create_order_without_quote_hash' }
  }
  return { ok: true, response: { id: razorpayOrderId, amount: sentPaise, currency: 'INR', quote_hash: quoteHash } }
}

// ---------------------------------------------------------------------------
// Verify path
// ---------------------------------------------------------------------------

export interface ActivationView {
  httpStatus: number
  body: {
    success: boolean
    state: 'active' | 'already_active' | 'retry' | 'review' | 'not_found' | 'support'
    message: string
    retryable?: boolean
    subscription_id?: string | null
    status?: string | null
    current_period_end?: string | null
  }
}

const REVIEW_CODES = new Set(['AMOUNT_MISMATCH', 'CURRENCY_MISMATCH'])
const SUPPORT_CODES = new Set([
  'subscription_cancelled',
  'agency_not_operational',
  'plan_change_blocked',
  'payment_id_in_use',
  'order_already_paid',
  'activation_conflict',
  'activation_rejected',
  'invoice_sequence_exhausted',
  'BILLING_NOT_CONFIGURED',
  'billing_settings_changed',
])

/** Maps the answer of subscription_activate_payment to calm states. The client still refetches entitlement. */
export function mapActivationResult(result: unknown): ActivationView {
  if (!isRecord(result)) {
    return {
      httpStatus: 503,
      body: { success: false, state: 'retry', retryable: true, message: 'We are confirming your payment. Please check again in a moment.' },
    }
  }
  if (result.ok === true) {
    const replay = result.replay === true
    return {
      httpStatus: 200,
      body: {
        success: true,
        state: replay ? 'already_active' : 'active',
        message: replay ? 'This payment was already applied. Your subscription is active.' : 'Payment received. Your subscription is active.',
        subscription_id: typeof result.subscription_id === 'string' ? result.subscription_id : null,
        status: typeof result.status === 'string' ? result.status : null,
        current_period_end: typeof result.current_period_end === 'string' ? result.current_period_end : null,
      },
    }
  }
  const code = typeof result.error === 'string' ? result.error : ''
  if (result.retryable === true) {
    return {
      httpStatus: 503,
      body: { success: false, state: 'retry', retryable: true, message: 'We are confirming your payment. Please check again in a moment.' },
    }
  }
  if (code === 'order_not_found') {
    return {
      httpStatus: 404,
      body: { success: false, state: 'not_found', message: 'We could not find this payment. If money was deducted, please contact support.' },
    }
  }
  if (REVIEW_CODES.has(code)) {
    return {
      httpStatus: 422,
      body: {
        success: false,
        state: 'review',
        message: 'Your payment needs a quick review by our team. If money was deducted it will be returned or applied. Please contact support.',
      },
    }
  }
  if (SUPPORT_CODES.has(code)) {
    return {
      httpStatus: 409,
      body: { success: false, state: 'support', message: 'We received your payment but could not apply it automatically. Please contact support and we will fix it.' },
    }
  }
  return {
    httpStatus: 409,
    body: { success: false, state: 'support', message: 'We could not confirm this payment automatically. Please contact support.' },
  }
}

// ---------------------------------------------------------------------------
// Caller and cleanup helpers
// ---------------------------------------------------------------------------

export const NOT_OWNER_ERROR: UserFacingError = {
  status: 403,
  code: 'owner_required',
  message: 'Only the agency owner can subscribe. Please ask the owner of your agency to do this.',
}

interface OwnerLookupClient {
  from(table: 'transport_agencies'): {
    select(columns: string): {
      eq(column: 'user_id', value: string): {
        order(column: 'created_at', options: { ascending: boolean }): {
          limit(count: number): PromiseLike<{
            data: Array<{ id: string; status: string | null }> | null
            error: { code?: string } | null
          }>
        }
      }
    }
  }
}

/** The caller's own agency (as owner): oldest first, deterministic when several exist. */
export async function resolveOwnerAgency(
  client: OwnerLookupClient,
  userId: string,
): Promise<
  | { ok: true; agencyId: string; agencyStatus: string | null }
  | { ok: false; error: UserFacingError; log: string }
> {
  const { data, error } = await client
    .from('transport_agencies')
    .select('id, status')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) {
    return {
      ok: false,
      log: `agency_lookup_failed:${error.code ?? 'unknown'}`,
      error: { status: 503, code: 'state_unavailable', message: 'We could not check your agency right now. Please try again.' },
    }
  }
  const row = data?.[0]
  if (!row?.id) {
    return { ok: false, error: NOT_OWNER_ERROR, log: 'not_owner' }
  }
  return { ok: true, agencyId: row.id, agencyStatus: row.status }
}

interface RpcClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ error: { code?: string } | null }>
}

/**
 * Releases the coupon reservation of an abandoned order. Best effort: never throws.
 * Returns a code for logging (never the error text), or null on success.
 */
export async function cancelPendingOrderBestEffort(client: RpcClient, razorpayOrderId: string): Promise<string | null> {
  try {
    const { error } = await client.rpc('subscription_cancel_pending_order', { p_razorpay_order_id: razorpayOrderId })
    return error ? (error.code ?? 'rpc_error') : null
  } catch {
    return 'exception'
  }
}
