// PhonePe Checkout Edge Function
// Deploy with: supabase functions deploy phonepe-checkout

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { calculateExpectedAmounts } from '../_shared/billing.ts'
import { resolveSubscriptionPlanByIdentifier } from '../_shared/plans.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PhonePe configuration (server-side secrets)
const PHONEPE_MERCHANT_ID = Deno.env.get('PHONEPE_MERCHANT_ID') || ''
const PHONEPE_SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY') || ''
const PHONEPE_SALT_INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || '1'
const PHONEPE_API_URL = Deno.env.get('PHONEPE_API_URL') || 'https://api-preprod.phonepe.com/apis/pg-sandbox'
const DEFAULT_CALLBACK_ORIGIN = 'https://www.truckopti.in'
const DEFAULT_ALLOWED_CALLBACK_ORIGINS = [
  DEFAULT_CALLBACK_ORIGIN,
  'https://truckopti.in',
  'https://truck-opti-app.herokuapp.com',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]
const SAFE_CLIENT_ERROR_MESSAGES = new Set([
  'Authentication is required to create a PhonePe checkout',
  'Unable to resolve authenticated user',
  'Amount must be at least ₹1 (100 paise)',
  'merchantTransactionId is required',
  'Authenticated user does not match requested payment user',
  'planId is required to create a PhonePe checkout',
  'billingCycle must be monthly or yearly',
  'Payment amount does not match selected plan',
])

function normalizeOrigin(value: string | null | undefined) {
  if (!value) {
    return null
  }

  try {
    const parsed = new URL(value)
    return `${parsed.protocol}//${parsed.host}`
  } catch {
    return null
  }
}

function getAllowedCallbackOrigins() {
  const configuredOrigins = (Deno.env.get('PHONEPE_ALLOWED_CALLBACK_ORIGINS') || '')
    .split(',')
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin))

  const configuredPrimaryOrigin = normalizeOrigin(Deno.env.get('PHONEPE_CALLBACK_ORIGIN'))

  return new Set([
    ...DEFAULT_ALLOWED_CALLBACK_ORIGINS,
    ...configuredOrigins,
    ...(configuredPrimaryOrigin ? [configuredPrimaryOrigin] : []),
  ])
}

function getTrustedCallbackOrigin(req: Request) {
  const allowedOrigins = getAllowedCallbackOrigins()
  const referer = req.headers.get('referer')
  const refererOrigin = referer ? normalizeOrigin(referer) : null
  const candidates = [
    Deno.env.get('PHONEPE_CALLBACK_ORIGIN'),
    req.headers.get('origin'),
    refererOrigin,
  ]

  for (const candidate of candidates) {
    const normalized = normalizeOrigin(candidate)
    if (normalized && allowedOrigins.has(normalized)) {
      return normalized
    }
  }

  return DEFAULT_CALLBACK_ORIGIN
}

function buildRedirectTarget(req: Request, merchantTransactionId: string) {
  const redirectUrl = new URL('/payment/callback', getTrustedCallbackOrigin(req))
  redirectUrl.searchParams.set('txnId', merchantTransactionId)
  return redirectUrl.toString()
}

function getSafeClientErrorMessage(error: unknown) {
  if (error instanceof Error && SAFE_CLIENT_ERROR_MESSAGES.has(error.message)) {
    return error.message
  }

  return 'Unable to initiate PhonePe payment right now.'
}

function normalizeBillingCycle(value: unknown): 'monthly' | 'yearly' | null {
  if (value === 'monthly' || value === 'yearly') {
    return value
  }

  return null
}

function generateChecksum(payload: string): string {
  const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload + PHONEPE_SALT_KEY))
    .then(buf => Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''))
  return hash.then(h => h + '###' + PHONEPE_SALT_INDEX)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      throw new Error('Authentication is required to create a PhonePe checkout')
    }

    const accessToken = authorization.replace('Bearer ', '').trim()

    if (!accessToken) {
      throw new Error('Authentication is required to create a PhonePe checkout')
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    })

    const { data: { user }, error: userError } = await authClient.auth.getUser(accessToken)

    if (userError || !user) {
      throw userError || new Error('Unable to resolve authenticated user')
    }

    const {
      amount,
      merchantTransactionId,
      userId,
      planId,
      billingCycle,
      customerPhone,
      customerEmail,
    } = await req.json()

    if (!amount || amount < 100) {
      throw new Error('Amount must be at least ₹1 (100 paise)')
    }

    if (!merchantTransactionId) {
      throw new Error('merchantTransactionId is required')
    }

    if (userId && userId !== user.id) {
      throw new Error('Authenticated user does not match requested payment user')
    }

    if (!planId || typeof planId !== 'string') {
      throw new Error('planId is required to create a PhonePe checkout')
    }

    const resolvedBillingCycle = normalizeBillingCycle(billingCycle)

    if (!resolvedBillingCycle) {
      throw new Error('billingCycle must be monthly or yearly')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const planData = await resolveSubscriptionPlanByIdentifier(supabase, planId)

    if (!planData) {
      throw new Error('Subscription plan not found')
    }

    const canonicalPlanId = planData.id

    const planAmount = resolvedBillingCycle === 'yearly'
      ? planData.price_yearly
      : planData.price_monthly
    const { totalAmount } = calculateExpectedAmounts(planAmount)

    if (amount !== totalAmount) {
      throw new Error('Payment amount does not match selected plan')
    }

    const redirectTarget = buildRedirectTarget(req, merchantTransactionId)

    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: user.id,
      amount: amount,
      redirectUrl: redirectTarget,
      redirectMode: 'GET',
      callbackUrl: redirectTarget,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    }

    const base64Payload = btoa(JSON.stringify(payload))
    const checksum = await generateChecksum(base64Payload)

    const response = await fetch(`${PHONEPE_API_URL}/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'accept': 'application/json'
      },
      body: JSON.stringify({ request: base64Payload })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('PhonePe payment initiation failed:', error)
      throw new Error(error.error?.message || 'Failed to initiate payment')
    }

    const result = await response.json()

    // Store pending payment in Supabase
    const { error: paymentHistoryError } = await supabase.from('payment_history').insert({
      user_id: user.id,
      amount,
      currency: 'INR',
      payment_method: 'upi',
      status: 'pending',
      razorpay_order_id: merchantTransactionId,
      metadata: {
        merchantTransactionId,
        userId: user.id,
        plan_id: canonicalPlanId,
        billing_cycle: resolvedBillingCycle,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        phonepe_response: result
      }
    })

    if (paymentHistoryError) {
      console.error('Failed to persist PhonePe payment history:', paymentHistoryError)
      throw paymentHistoryError
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: getSafeClientErrorMessage(error) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
