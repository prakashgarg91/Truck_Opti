// PhonePe subscription activation edge function.
// Deploy with: supabase functions deploy verify-payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      plan_id,
      billing_cycle,
      user_id,
      payment_provider,
    } = await req.json()

    if (!razorpay_order_id || !plan_id || !billing_cycle || !user_id) {
      throw new Error('razorpay_order_id, plan_id, billing_cycle, and user_id are required')
    }

    const normalizedBillingCycle = billing_cycle === 'yearly' ? 'yearly' : 'monthly'

    // Update payment status in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { data: paymentRow, error: paymentLookupError } = await supabase
      .from('payment_history')
      .select('id, subscription_id, invoice_id, metadata')
      .eq('razorpay_order_id', razorpay_order_id)
      .eq('user_id', user_id)
      .maybeSingle()

    if (paymentLookupError) {
      throw paymentLookupError
    }

    if (!paymentRow) {
      throw new Error('Pending payment record not found')
    }

    const { data: planData, error: planError } = await supabase
      .from('subscription_plans')
      .select('id, price_monthly, price_yearly')
      .eq('id', plan_id)
      .single()

    if (planError || !planData) {
      throw planError || new Error('Subscription plan not found')
    }

    const { startDate, endDate } = getBillingWindow(normalizedBillingCycle)

    const { data: subscription, error: subscriptionError } = await supabase
      .from('subscriptions')
      .upsert({
        user_id,
        plan_id,
        status: 'active',
        billing_cycle: normalizedBillingCycle,
        current_period_start: startDate,
        current_period_end: endDate,
        payment_method_id: razorpay_payment_id || razorpay_order_id,
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
      const { data: invoiceNumber, error: invoiceNumberError } = await supabase.rpc('generate_invoice_number')

      if (invoiceNumberError || !invoiceNumber) {
        throw invoiceNumberError || new Error('Failed to generate invoice number')
      }

      const amount = normalizedBillingCycle === 'yearly'
        ? planData.price_yearly
        : planData.price_monthly

      const { data: invoice, error: invoiceError } = await supabase.from('invoices').insert({
        user_id,
        subscription_id: subscription.id,
        invoice_number: invoiceNumber,
        amount,
        tax_amount: 0,
        total_amount: amount,
        currency: 'INR',
        status: 'paid',
        billing_period_start: startDate,
        billing_period_end: endDate,
        razorpay_payment_id: razorpay_payment_id || null,
        paid_at: new Date().toISOString(),
      }).select('id').single()

      if (invoiceError || !invoice) {
        throw invoiceError || new Error('Failed to create invoice')
      }

      invoiceId = invoice.id
    }

    const { error: updateError } = await supabase.from('payment_history')
      .update({
        status: 'success',
        subscription_id: subscription.id,
        invoice_id: invoiceId,
        razorpay_payment_id: razorpay_payment_id || null,
        metadata: {
          ...(paymentRow.metadata || {}),
          verified: true,
          payment_provider: payment_provider || 'phonepe',
        }
      })
      .eq('id', paymentRow.id)

    if (updateError) {
      throw updateError
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
