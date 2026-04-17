// Razorpay Payment Verification Edge Function
// Deploy with: supabase functions deploy verify-razorpay-payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createHmac } from 'https://deno.land/std@0.168.0/node/crypto.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || ''

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
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      plan_id,
      billing_cycle,
      customer_phone,
      customer_email
    } = await req.json()

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id
    const expectedSignature = createHmac('sha256', RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex')

    if (expectedSignature !== razorpay_signature) {
      throw new Error('Invalid payment signature')
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const normalizedBillingCycle: 'monthly' | 'yearly' = billing_cycle === 'yearly' ? 'yearly' : 'monthly'

    const { data: paymentRow, error: paymentLookupError } = await supabase
      .from('payment_history')
      .select('id, user_id, invoice_id, metadata')
      .eq('razorpay_order_id', razorpay_order_id)
      .maybeSingle()

    if (paymentLookupError) {
      throw paymentLookupError
    }

    // Get user by phone
    const { data: userData } = paymentRow?.user_id
      ? { data: { id: paymentRow.user_id } }
      : await supabase
        .from('users')
        .select('id')
        .eq('phone', customer_phone)
        .single()

    if (userData && plan_id) {
      // Get plan details
      const { data: planData } = await supabase
        .from('subscription_plans')
        .select('id, price_monthly, price_yearly')
        .eq('id', plan_id)
        .single()

      if (planData) {
        const { startDate, endDate } = getBillingWindow(normalizedBillingCycle)

        // Create or update subscription
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userData.id,
            plan_id: plan_id,
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

        if (subError) {
          console.error('Failed to create subscription:', subError)
        }

        // Create invoice
        let invoiceId = paymentRow?.invoice_id || null
        if (!invoiceId) {
          const { data: invoiceNumber } = await supabase.rpc('generate_invoice_number')
          const amount = normalizedBillingCycle === 'yearly'
            ? planData.price_yearly
            : planData.price_monthly

          const { data: invoice } = await supabase.from('invoices').insert({
            user_id: userData.id,
            subscription_id: subscription?.id,
            amount,
            tax_amount: 0,
            total_amount: amount,
            currency: 'INR',
            status: 'paid',
            paid_at: new Date().toISOString(),
            invoice_number: invoiceNumber,
            billing_period_start: startDate,
            billing_period_end: endDate,
            razorpay_payment_id,
          }).select('id').single()

          invoiceId = invoice?.id || null
        }

        if (paymentRow) {
          await supabase
            .from('payment_history')
            .update({
              status: 'success',
              subscription_id: subscription?.id,
              invoice_id: invoiceId,
              razorpay_payment_id,
              metadata: {
                ...(paymentRow.metadata || {}),
                razorpay_signature,
                customer_email,
              },
            })
            .eq('id', paymentRow.id)
        }

        return new Response(JSON.stringify({
          success: true,
          subscriptionId: subscription?.id,
          message: 'Payment verified and subscription activated'
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        })
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Payment verified successfully'
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
