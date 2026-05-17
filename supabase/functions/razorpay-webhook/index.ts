import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js'
import { finalizePaidInvoiceDelivery } from '../_shared/invoice-delivery.ts'
import { resolveSubscriptionPlanByIdentifier } from '../_shared/plans.ts'

const VALID_PAYMENT_METHODS = new Set(['card', 'upi', 'netbanking', 'wallet'])

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
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

async function verifyWebhookSignature(secret: string, body: string, signature: string) {
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

function getCapturedPaymentMethod(value: unknown): 'card' | 'upi' | 'netbanking' | 'wallet' | null {
  if (typeof value === 'string' && VALID_PAYMENT_METHODS.has(value)) {
    return value as 'card' | 'upi' | 'netbanking' | 'wallet'
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

  const { data: invoice, error: invoiceError } = await supabase
    .from('invoices')
    .insert({
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
    })
    .select('id')
    .single()

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
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature') ?? ''
    const secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''
    if (!secret) {
      console.error('[razorpay-webhook] RAZORPAY_KEY_SECRET not configured')
      return new Response('Webhook not configured', { status: 500 })
    }

    // Verify HMAC-SHA256 signature without a direct string comparison.
    const isValidSignature = await verifyWebhookSignature(secret, body, signature)

    if (!isValidSignature) {
      console.error('Invalid webhook signature received')
      return new Response('Invalid signature', { status: 401 })
    }

    const event = JSON.parse(body)
    console.log('Razorpay webhook event:', event.event)

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    if (event.event === 'payment.captured') {
      const { order_id: orderId, contact: phone, id: paymentId, method } = event.payload.payment.entity
      const { data: paymentRow, error: paymentLookupError } = await supabase
        .from('payment_history')
        .select('id, user_id, subscription_id, invoice_id, payment_method, metadata, status, razorpay_payment_id, amount')
        .eq('razorpay_order_id', orderId)
        .maybeSingle()

      if (paymentLookupError) {
        console.error('Failed to look up payment history:', paymentLookupError)
        return new Response('Payment lookup failed', { status: 500 })
      }

      if (!paymentRow) {
        console.error('Payment history row not found for order:', orderId)
        return new Response('Payment history not found', { status: 404 })
      }

      const paymentMetadata = toRecord(paymentRow.metadata)

      if (
        paymentRow.status === 'success' &&
        paymentRow.razorpay_payment_id === paymentId &&
        paymentRow.subscription_id &&
        paymentRow.invoice_id
      ) {
        try {
          await finalizePaidInvoiceDelivery(supabase, {
            invoiceId: paymentRow.invoice_id,
            paymentHistoryId: paymentRow.id,
            paymentMetadata,
            userId: paymentRow.user_id,
            customerEmail: typeof paymentMetadata.customer_email === 'string' ? paymentMetadata.customer_email : null,
            customerPhone: typeof paymentMetadata.customer_phone === 'string' ? paymentMetadata.customer_phone : null,
            paymentProvider: 'razorpay',
            providerPaymentId: paymentId,
          })
        } catch (deliveryError) {
          console.error('Invoice delivery follow-up failed for a duplicate Razorpay webhook:', deliveryError)
        }

        console.log('Ignoring duplicate Razorpay webhook for order:', orderId)
        return new Response('ok', { status: 200 })
      }

      const planId = typeof paymentMetadata.plan_id === 'string' ? paymentMetadata.plan_id : null
      const billingCycle: 'monthly' | 'yearly' = paymentMetadata.billing_cycle === 'yearly' ? 'yearly' : 'monthly'
      const capturedPaymentMethod = getCapturedPaymentMethod(method)
      let userId = typeof paymentRow.user_id === 'string' ? paymentRow.user_id : null

      if (!userId) {
        console.error('Unable to resolve user for captured payment order:', orderId)
        return new Response('Payment user not found', { status: 409 })
      }

      let subscriptionId = paymentRow.subscription_id || null
      let invoiceId = paymentRow.invoice_id || null

      if (planId) {
        const planData = await resolveSubscriptionPlanByIdentifier(supabase, planId)

        if (!planData) {
          console.error('Failed to load subscription plan for webhook activation')
          return new Response('Subscription plan lookup failed', { status: 500 })
        }

        const { startDate, endDate } = getBillingWindow(billingCycle)
        const { data: subscription, error: subscriptionError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan_id: planData.id,
            status: 'active',
            billing_cycle: billingCycle,
            current_period_start: startDate,
            current_period_end: endDate,
            payment_method_id: paymentId || orderId,
          }, {
            onConflict: 'user_id'
          })
          .select('id')
          .single()

        if (subscriptionError || !subscription) {
          console.error('Failed to activate subscription from webhook:', subscriptionError)
          return new Response('Subscription update failed', { status: 500 })
        }

        subscriptionId = subscription.id

        if (!invoiceId) {
          const subtotalAmount = billingCycle === 'yearly'
            ? planData.price_yearly
            : planData.price_monthly
          const totalAmount = typeof paymentRow.amount === 'number' ? paymentRow.amount : subtotalAmount
          const taxAmount = Math.max(totalAmount - subtotalAmount, 0)

          try {
            invoiceId = await createOrReusePaidInvoice(supabase, {
              userId,
              subscriptionId: subscription.id,
              subtotalAmount,
              taxAmount,
              totalAmount,
              startDate,
              endDate,
              providerPaymentId: paymentId,
            })
          } catch (invoiceError) {
            console.error('Failed to create invoice from webhook:', invoiceError)
            return new Response('Invoice creation failed', { status: 500 })
          }
        }
      }

      const { error: updateError } = await supabase
        .from('payment_history')
        .update({
          user_id: userId,
          subscription_id: subscriptionId,
          invoice_id: invoiceId,
          payment_method: capturedPaymentMethod || paymentRow.payment_method,
          status: 'success',
          razorpay_payment_id: paymentId,
          metadata: {
            ...paymentMetadata,
            payment_provider: 'razorpay',
            customer_phone: paymentMetadata.customer_phone || phone || null,
            webhook_event: event.event,
          },
        })
        .eq('id', paymentRow.id)

      if (updateError) {
        console.error('Failed to update payment history after webhook:', updateError)
        return new Response('Database update failed', { status: 500 })
      }

      if (invoiceId && userId) {
        try {
          await finalizePaidInvoiceDelivery(supabase, {
            invoiceId,
            paymentHistoryId: paymentRow.id,
            paymentMetadata: {
              ...paymentMetadata,
              payment_provider: 'razorpay',
              customer_phone: paymentMetadata.customer_phone || phone || null,
              webhook_event: event.event,
            },
            userId,
            customerEmail: typeof paymentMetadata.customer_email === 'string' ? paymentMetadata.customer_email : null,
            customerPhone: typeof paymentMetadata.customer_phone === 'string'
              ? paymentMetadata.customer_phone
              : typeof phone === 'string'
                ? phone
                : null,
            paymentProvider: 'razorpay',
            providerPaymentId: paymentId,
          })
        } catch (deliveryError) {
          console.error('Invoice delivery follow-up failed after webhook:', deliveryError)
        }
      }

      console.log('Subscription activation reconciled for order:', orderId)
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Internal server error', { status: 500 })
  }
})
