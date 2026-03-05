import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'

serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const body = await req.text()
    const signature = req.headers.get('x-razorpay-signature') ?? ''
    const secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

    // Verify HMAC-SHA256 signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
    const expected = Array.from(new Uint8Array(mac))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    if (expected !== signature) {
      console.error('Invalid signature:', { expected, received: signature })
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
      const { order_id, contact: phone } = event.payload.payment.entity

      // Activate subscription for the paying user
      const { error: updateError } = await supabase
        .from('subscriptions')
        .update({ status: 'active', razorpay_order_id: order_id })
        .eq('razorpay_order_id', order_id)

      if (updateError) {
        console.error('Failed to update subscription:', updateError)
        return new Response('Database update failed', { status: 500 })
      }

      console.log('Subscription activated for order:', order_id)
    }

    return new Response('ok', { status: 200 })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response('Internal server error', { status: 500 })
  }
})
