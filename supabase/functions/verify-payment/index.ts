// PhonePe subscription activation edge function.
// Deploy with: supabase functions deploy verify-payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { calculateExpectedAmounts } from '../_shared/billing.ts'
import { finalizePaidInvoiceDelivery } from '../_shared/invoice-delivery.ts'
import { resolveSubscriptionPlanByIdentifier } from '../_shared/plans.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHONEPE_SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY') || ''
const PHONEPE_SALT_INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || '1'
const PHONEPE_API_URL = Deno.env.get('PHONEPE_API_URL') || 'https://api-preprod.phonepe.com/apis/pg-sandbox'

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

function generateChecksum(payload: string): Promise<string> {
  const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload + PHONEPE_SALT_KEY))
    .then((buffer) => Array.from(new Uint8Array(buffer))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(''))

  return hash.then((value) => `${value}###${PHONEPE_SALT_INDEX}`)
}

function getPhonePeStatusDetails(result: Record<string, unknown>) {
  const resultData = toRecord(result.data)
  const providerStatus = typeof result.code === 'string'
    ? result.code
    : typeof result.state === 'string'
      ? result.state
      : typeof resultData.state === 'string'
        ? resultData.state
        : 'PAYMENT_PENDING'
  const transactionId = typeof result.transactionId === 'string'
    ? result.transactionId
    : typeof resultData.transactionId === 'string'
      ? resultData.transactionId
      : null
  const paymentStatus = providerStatus === 'PAYMENT_SUCCESS'
    ? 'success'
    : providerStatus === 'PAYMENT_ERROR' || providerStatus === 'PAYMENT_DECLINED' || providerStatus === 'PAYMENT_FAILED'
      ? 'failed'
      : 'pending'
  const message = typeof result.message === 'string'
    ? result.message
    : paymentStatus === 'success'
      ? 'Payment successful'
      : paymentStatus === 'failed'
        ? 'Payment failed'
        : 'Payment is still pending'

  return {
    providerStatus,
    paymentStatus,
    transactionId,
    message,
    data: resultData,
  }
}

async function fetchPhonePeStatus(merchantTransactionId: string) {
  const statusPath = `/v3/transaction/${merchantTransactionId}/status`
  const checksum = await generateChecksum(btoa(merchantTransactionId))

  const response = await fetch(`${PHONEPE_API_URL}${statusPath}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-VERIFY': checksum,
      'X-MERCHANT-ID': Deno.env.get('PHONEPE_MERCHANT_ID') || '',
      'accept': 'application/json',
    },
  })

  const result = toRecord(await response.json().catch(() => ({})))
  const statusDetails = getPhonePeStatusDetails(result)

  if (!response.ok && statusDetails.paymentStatus === 'pending') {
    throw new Error(statusDetails.message || 'Failed to verify PhonePe payment status')
  }

  return {
    ...statusDetails,
    raw: result,
  }
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
    invoice_number: invoiceNumber,
    amount: params.subtotalAmount,
    tax_amount: params.taxAmount,
    total_amount: params.totalAmount,
    currency: 'INR',
    status: 'paid',
    billing_period_start: params.startDate,
    billing_period_end: params.endDate,
    razorpay_payment_id: params.providerPaymentId,
    paid_at: new Date().toISOString(),
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      razorpay_order_id,
      user_id,
      payment_provider,
    } = await req.json()

    if (!razorpay_order_id) {
      throw new Error('razorpay_order_id is required')
    }

    // Update payment status in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      throw new Error('Authentication is required to verify a payment')
    }

    const accessToken = authorization.replace('Bearer ', '').trim()

    if (!accessToken) {
      throw new Error('Authentication is required to verify a payment')
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

    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: paymentRow, error: paymentLookupError } = await supabase
      .from('payment_history')
      .select('id, user_id, subscription_id, invoice_id, amount, metadata, status, razorpay_payment_id')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle()

    if (paymentLookupError) {
      throw paymentLookupError
    }

    if (!paymentRow) {
      throw new Error('Pending payment record not found')
    }

    if (paymentRow.user_id !== user.id) {
      throw new Error('Authenticated user does not match the payment being verified')
    }

    if (user_id && user_id !== user.id) {
      throw new Error('Authenticated user does not match requested payment user')
    }

    const paymentMetadata = toRecord(paymentRow.metadata)
    const merchantTransactionId = typeof paymentMetadata.merchantTransactionId === 'string'
      ? paymentMetadata.merchantTransactionId
      : razorpay_order_id
    const resolvedPlanId = typeof paymentMetadata.plan_id === 'string' ? paymentMetadata.plan_id : null
    const normalizedBillingCycle = normalizeBillingCycle(paymentMetadata.billing_cycle)

    if (paymentRow.status === 'success' && (paymentRow.subscription_id || paymentRow.invoice_id)) {
      if (paymentRow.invoice_id) {
        try {
          await finalizePaidInvoiceDelivery(supabase, {
            invoiceId: paymentRow.invoice_id,
            paymentHistoryId: paymentRow.id,
            paymentMetadata,
            userId: user.id,
            customerEmail: typeof paymentMetadata.customer_email === 'string' ? paymentMetadata.customer_email : null,
            customerPhone: typeof paymentMetadata.customer_phone === 'string' ? paymentMetadata.customer_phone : null,
            paymentProvider: 'phonepe',
            providerPaymentId: paymentRow.razorpay_payment_id || merchantTransactionId,
          })
        } catch (deliveryError) {
          console.error('Invoice delivery follow-up failed for an already-verified PhonePe payment:', deliveryError)
        }
      }

      return new Response(JSON.stringify({
        success: true,
        subscriptionId: paymentRow.subscription_id ?? null,
        message: 'Payment already verified',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
    }

    const phonePeStatus = await fetchPhonePeStatus(merchantTransactionId)
    const resolvedProviderTransactionId = phonePeStatus.transactionId || paymentRow.razorpay_payment_id || merchantTransactionId

    if (phonePeStatus.paymentStatus !== 'success') {
      const { error: failedUpdateError } = await supabase.from('payment_history')
        .update({
          status: phonePeStatus.paymentStatus,
          metadata: {
            ...paymentMetadata,
            payment_provider: 'phonepe',
            phonepe_response: phonePeStatus.raw,
            phonepe_transaction_id: resolvedProviderTransactionId,
          },
        })
        .eq('id', paymentRow.id)

      if (failedUpdateError) {
        throw failedUpdateError
      }

      return new Response(JSON.stringify({
        success: false,
        status: phonePeStatus.paymentStatus,
        message: phonePeStatus.message,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: phonePeStatus.paymentStatus === 'failed' ? 402 : 409,
      })
    }

    if (!resolvedPlanId || !normalizedBillingCycle) {
      throw new Error('Payment record is missing required plan metadata')
    }

    const planData = await resolveSubscriptionPlanByIdentifier(supabase, resolvedPlanId)

    if (!planData) {
      throw new Error('Subscription plan not found')
    }

    const planAmount = normalizedBillingCycle === 'yearly'
      ? planData.price_yearly
      : planData.price_monthly
    const { subtotalAmount, taxAmount, totalAmount: expectedTotalAmount } = calculateExpectedAmounts(planAmount)

    if (paymentRow.amount !== expectedTotalAmount) {
      throw new Error('Payment amount does not match selected plan')
    }

    const { startDate, endDate } = getBillingWindow(normalizedBillingCycle)

    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id: user.id,
        plan_id: planData.id,
        status: 'active',
        billing_cycle: normalizedBillingCycle,
        current_period_start: startDate,
        current_period_end: endDate,
        payment_method_id: resolvedProviderTransactionId,
      }, {
        onConflict: 'user_id'
      })
      .select('id')
      .single()

    if (subscriptionError || !subscription) {
      throw subscriptionError || new Error('Failed to activate subscription')
    }

    let invoiceId = paymentRow.invoice_id
    if (!invoiceId) {
      invoiceId = await createOrReusePaidInvoice(supabase, {
        userId: user.id,
        subscriptionId: subscription.id,
        subtotalAmount,
        taxAmount,
        totalAmount: expectedTotalAmount,
        startDate,
        endDate,
        providerPaymentId: resolvedProviderTransactionId,
      })
    }

    const { error: updateError } = await supabase.from('payment_history')
      .update({
        status: 'success',
        subscription_id: subscription.id,
        invoice_id: invoiceId,
        razorpay_payment_id: resolvedProviderTransactionId,
        metadata: {
          ...paymentMetadata,
          verified: true,
          payment_provider: payment_provider || 'phonepe',
          phonepe_response: phonePeStatus.raw,
          phonepe_transaction_id: resolvedProviderTransactionId,
        }
      })
      .eq('id', paymentRow.id)

    if (updateError) {
      throw updateError
    }

    try {
      await finalizePaidInvoiceDelivery(supabase, {
        invoiceId,
        paymentHistoryId: paymentRow.id,
        paymentMetadata: {
          ...paymentMetadata,
          verified: true,
          payment_provider: payment_provider || 'phonepe',
          phonepe_response: phonePeStatus.raw,
          phonepe_transaction_id: resolvedProviderTransactionId,
        },
        userId: user.id,
        customerEmail: typeof paymentMetadata.customer_email === 'string' ? paymentMetadata.customer_email : null,
        customerPhone: typeof paymentMetadata.customer_phone === 'string' ? paymentMetadata.customer_phone : null,
        paymentProvider: 'phonepe',
        providerPaymentId: resolvedProviderTransactionId,
      })
    } catch (deliveryError) {
      console.error('Invoice delivery follow-up failed after PhonePe verification:', deliveryError)
    }

    return new Response(JSON.stringify({ success: true, subscriptionId: subscription.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
