// Razorpay Order Creation Edge Function
// Deploy with: supabase functions deploy create-razorpay-order

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const VALID_PAYMENT_METHODS = new Set(['card', 'upi', 'netbanking', 'wallet'])

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

function getPendingPaymentMethod(value: unknown): 'card' | 'upi' | 'netbanking' | 'wallet' {
  if (typeof value === 'string' && VALID_PAYMENT_METHODS.has(value)) {
    return value as 'card' | 'upi' | 'netbanking' | 'wallet'
  }

  return 'upi'
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

// Razorpay API configuration
const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') || ''
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') || ''

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { amount, currency, receipt, notes, customerPhone, customerEmail } = await req.json()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      throw new Error('Authentication is required to create a Razorpay order')
    }

    const accessToken = authorization.replace('Bearer ', '').trim()

    if (!accessToken) {
      throw new Error('Authentication is required to create a Razorpay order')
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

    const normalizedNotes = toRecord(notes)
    const requestedUserId = typeof normalizedNotes.user_id === 'string' ? normalizedNotes.user_id : null

    if (requestedUserId && requestedUserId !== user.id) {
      throw new Error('Authenticated user does not match requested payment user')
    }

    const orderNotes = {
      ...normalizedNotes,
      user_id: user.id,
    }
    const resolvedPlanId = typeof orderNotes.plan_id === 'string' ? orderNotes.plan_id : null
    const resolvedBillingCycle = normalizeBillingCycle(orderNotes.billing_cycle)
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    // Validate required fields
    if (!amount || amount < 100) {
      throw new Error('Amount must be at least ₹1 (100 paise)')
    }

    if (!resolvedPlanId) {
      throw new Error('plan_id is required to create a Razorpay order')
    }

    if (!resolvedBillingCycle) {
      throw new Error('billing_cycle must be monthly or yearly')
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
    const { totalAmount } = calculateExpectedAmounts(planAmount)

    if (amount !== totalAmount) {
      throw new Error('Payment amount does not match selected plan')
    }

    // Create Razorpay order
    const orderData = {
      amount: amount, // in paise
      currency: currency || 'INR',
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: orderNotes,
    }

    const auth = btoa(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`)

    const response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(orderData)
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Razorpay order creation failed:', error)
      throw new Error(error.error?.description || 'Failed to create order')
    }

    const order = await response.json()

    // Store order in Supabase
    const { error: paymentHistoryError } = await supabase.from('payment_history').insert({
      user_id: user.id,
      amount: amount,
      currency: currency || 'INR',
      payment_method: getPendingPaymentMethod(orderNotes.payment_method),
      status: 'pending',
      razorpay_order_id: order.id,
      metadata: {
        payment_provider: 'razorpay',
        receipt: receipt || orderData.receipt,
        plan_id: resolvedPlanId,
        billing_cycle: resolvedBillingCycle,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        notes: orderNotes,
      }
    })

    if (paymentHistoryError) {
      console.error('Failed to persist Razorpay payment history:', paymentHistoryError)
      throw paymentHistoryError
    }

    return new Response(JSON.stringify(order), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400
    })
  }
})
