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

    // Update payment status
    const { error: paymentError } = await supabase
      .from('payment_history')
      .update({
        status: 'completed',
        razorpay_payment_id: razorpay_payment_id,
        razorpay_signature: razorpay_signature,
        updated_at: new Date().toISOString()
      })
      .eq('razorpay_order_id', razorpay_order_id)

    if (paymentError) {
      console.error('Failed to update payment:', paymentError)
    }

    // Get user by phone
    const { data: userData } = await supabase
      .from('users')
      .select('id')
      .eq('phone', customer_phone)
      .single()

    if (userData && plan_id) {
      // Get plan details
      const { data: planData } = await supabase
        .from('subscription_plans')
        .select('*')
        .eq('id', plan_id)
        .single()

      if (planData) {
        // Calculate subscription period
        const startDate = new Date()
        const endDate = new Date()
        if (billing_cycle === 'annual') {
          endDate.setFullYear(endDate.getFullYear() + 1)
        } else {
          endDate.setMonth(endDate.getMonth() + 1)
        }

        // Create or update subscription
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userData.id,
            plan_id: plan_id,
            status: 'active',
            billing_cycle: billing_cycle || 'monthly',
            current_period_start: startDate.toISOString(),
            current_period_end: endDate.toISOString(),
            payment_method: 'razorpay',
            auto_renew: true
          }, {
            onConflict: 'user_id'
          })
          .select()
          .single()

        if (subError) {
          console.error('Failed to create subscription:', subError)
        }

        // Create invoice
        await supabase.from('invoices').insert({
          user_id: userData.id,
          subscription_id: subscription?.id,
          amount: billing_cycle === 'annual' 
            ? planData.annual_price 
            : planData.monthly_price,
          currency: 'INR',
          status: 'paid',
          paid_at: new Date().toISOString(),
          invoice_number: `INV-${Date.now()}`,
          billing_period_start: startDate.toISOString(),
          billing_period_end: endDate.toISOString()
        })

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
