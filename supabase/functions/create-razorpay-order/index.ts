// Razorpay Order Creation Edge Function
// Deploy with: supabase functions deploy create-razorpay-order

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const { amount, currency, receipt, notes } = await req.json()

    // Validate required fields
    if (!amount || amount < 100) {
      throw new Error('Amount must be at least ₹1 (100 paise)')
    }

    // Create Razorpay order
    const orderData = {
      amount: amount, // in paise
      currency: currency || 'INR',
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {}
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
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    await supabase.from('payment_history').insert({
      amount: amount,
      currency: currency || 'INR',
      payment_method: 'razorpay',
      status: 'pending',
      razorpay_order_id: order.id,
      metadata: {
        receipt: receipt,
        notes: notes
      }
    })

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
