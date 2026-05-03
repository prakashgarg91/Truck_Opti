// Razorpay Payment Verification Edge Function
// Deploy with: supabase functions deploy verify-razorpay-payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || ''

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

function getBillingWindow(billingCycle: 'monthly' | 'yearly') {
  const startDate = new Date()
  const endDate = new Date(startDate)

  if (billingCycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1)
  } else {
    endDate.setMonth(endDate.getMonth() + 1)
  }

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  }
}

function normalizeBillingCycle(value: unknown): 'monthly' | 'yearly' | null {
  if (value === 'monthly' || value === 'yearly') {
    return value
  }

  return null
}

function calculateExpectedAmounts(baseAmount: number) {
  const taxAmount = Math.round(baseAmount * 0.18)

  return {
    subtotalAmount: baseAmount,
    taxAmount,
    totalAmount: baseAmount + taxAmount,
  }
}

type PaidInvoiceParams = {
  userId: string
  subscriptionId: string
  subtotalAmount: number
  taxAmount: number
  totalAmount: number
  startDate: string
  endDate: string
  providerPaymentId: string | null
}

async function findExistingInvoiceId(
  supabase: SupabaseClient,
  subscriptionId: string,
  providerPaymentId: string | null,
) {
  if (!providerPaymentId) {
    return null
  }

  const { data: existingInvoice, error: existingInvoiceError } = await supabase
    .from('invoices')
    .select('id')
    .eq('subscription_id', subscriptionId)
    .eq('razorpay_payment_id', providerPaymentId)
    .maybeSingle()

  if (existingInvoiceError) {
    throw existingInvoiceError
  }

  return existingInvoice?.id ?? null
}

async function createOrReusePaidInvoice(
  supabase: SupabaseClient,
  params: PaidInvoiceParams,
) {
  const existingInvoiceId = await findExistingInvoiceId(
    supabase,
    params.subscriptionId,
    params.providerPaymentId,
  )

  if (existingInvoiceId) {
    return existingInvoiceId
  }

  const { data: invoiceNumber, error: invoiceNumberError } = await supabase.rpc('generate_invoice_number')

  if (invoiceNumberError || !invoiceNumber) {
    throw invoiceNumberError || new Error('Failed to generate invoice number')
  }

  const { data: invoice, error: invoiceError } = await supabase.from('invoices').insert({
    user_id: params.userId,
    subscription_id: params.subscriptionId,
    amount: params.subtotalAmount,
    tax_amount: params.taxAmount,
    total_amount: params.totalAmount,
    currency: 'INR',
    status: 'paid',
    paid_at: new Date().toISOString(),
    invoice_number: invoiceNumber,
    billing_period_start: params.startDate,
    billing_period_end: params.endDate,
    razorpay_payment_id: params.providerPaymentId,
  }).select('id').single()

  if (invoiceError) {
    if (invoiceError.code === '23505') {
      const racedInvoiceId = await findExistingInvoiceId(
        supabase,
        params.subscriptionId,
        params.providerPaymentId,
      )

      if (racedInvoiceId) {
        return racedInvoiceId
      }
    }

    throw invoiceError
  }

  if (!invoice) {
    throw new Error('Failed to create invoice')
  }

  return invoice.id
}

function hexToBytes(value: string): Uint8Array | null {
  const normalized = value.trim().toLowerCase()

  if (normalized.length === 0 || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/.test(normalized)) {
    return null
  }

  const bytes = new Uint8Array(normalized.length / 2)

  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16)
  }

  return bytes
}

async function verifyRazorpaySignature(secret: string, body: string, signature: string) {
  const signatureBytes = hexToBytes(signature)

  if (!signatureBytes) {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )

  return crypto.subtle.verify('HMAC', key, signatureBytes, new TextEncoder().encode(body))
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      customer_phone,
      customer_email
    } = await req.json()

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id
    if (!RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay secret is not configured')
    }

    const isValidSignature = await verifyRazorpaySignature(
      RAZORPAY_KEY_SECRET,
      body,
      razorpay_signature,
    )

    if (!isValidSignature) {
      throw new Error('Invalid payment signature')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      throw new Error('Authentication is required to verify a Razorpay payment')
    }

    const accessToken = authorization.replace('Bearer ', '').trim()

    if (!accessToken) {
      throw new Error('Authentication is required to verify a Razorpay payment')
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

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: paymentRow, error: paymentLookupError } = await supabase
      .from('payment_history')
      .select('id, user_id, invoice_id, subscription_id, amount, metadata, status, razorpay_payment_id')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle()

    if (paymentLookupError) {
      throw paymentLookupError
    }

    if (!paymentRow?.user_id) {
      throw new Error('Payment record not found for verification')
    }

    if (paymentRow.user_id !== user.id) {
      throw new Error('Authenticated user does not match the payment being verified')
    }

    if (
      paymentRow.status === 'success' &&
      paymentRow.razorpay_payment_id === razorpay_payment_id &&
      (paymentRow.subscription_id || paymentRow.invoice_id)
    ) {
      return new Response(JSON.stringify({
        success: true,
        subscriptionId: paymentRow.subscription_id ?? null,
        message: 'Payment already verified and subscription is active'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      })
    }

    if (
      paymentRow.status === 'success' &&
      paymentRow.razorpay_payment_id &&
      paymentRow.razorpay_payment_id !== razorpay_payment_id
    ) {
      throw new Error('Payment record is already linked to a different Razorpay payment')
    }

    const paymentMetadata = toRecord(paymentRow.metadata)
    const resolvedPlanId = typeof paymentMetadata.plan_id === 'string' ? paymentMetadata.plan_id : null
    const resolvedBillingCycle = normalizeBillingCycle(paymentMetadata.billing_cycle)

    if (!resolvedPlanId || !resolvedBillingCycle) {
      throw new Error('Payment record is missing required plan metadata')
    }

    const { data: planData, error: planError } = await supabase
      .from('subscription_plans')
      .select('id, price_monthly, price_yearly')
      .eq('id', resolvedPlanId)
      .single()

    if (planError || !planData) {
      throw planError || new Error('Subscription plan not found')
    }

    const planAmount = resolvedBillingCycle === 'yearly'
      ? planData.price_yearly
      : planData.price_monthly
    const { subtotalAmount, taxAmount, totalAmount: expectedTotalAmount } = calculateExpectedAmounts(planAmount)

    if (paymentRow.amount !== expectedTotalAmount) {
      throw new Error('Payment amount does not match selected plan')
    }

    const { startDate, endDate } = getBillingWindow(resolvedBillingCycle)

    const { data: subscription, error: subError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan_id: resolvedPlanId,
        status: 'active',
        billing_cycle: resolvedBillingCycle,
        current_period_start: startDate,
        current_period_end: endDate,
        payment_method_id: razorpay_payment_id || razorpay_order_id,
      }, {
        onConflict: 'user_id'
      })
      .select('id')
      .single()

    if (subError || !subscription) {
      throw subError || new Error('Failed to create subscription')
    }

    let invoiceId = paymentRow.invoice_id || null
    if (!invoiceId) {
      invoiceId = await createOrReusePaidInvoice(supabase, {
        userId: user.id,
        subscriptionId: subscription.id,
        subtotalAmount,
        taxAmount,
        totalAmount: expectedTotalAmount,
        startDate,
        endDate,
        providerPaymentId: razorpay_payment_id,
      })
    }

    const { error: updateError } = await supabase
      .from('payment_history')
      .update({
        status: 'success',
        subscription_id: subscription.id,
        invoice_id: invoiceId,
        razorpay_payment_id,
        metadata: {
          ...paymentMetadata,
          razorpay_signature,
          customer_phone,
          customer_email,
        },
      })
      .eq('id', paymentRow.id)

    if (updateError) {
      throw updateError
    }

    return new Response(JSON.stringify({
      success: true,
      subscriptionId: subscription.id,
      message: 'Payment verified and subscription activated'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Verification error:', error)
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
