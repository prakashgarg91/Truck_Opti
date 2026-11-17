// Legacy PhonePe subscription activation: retired.
//
// Activation is now: create-razorpay-order -> Razorpay checkout -> verify-razorpay-payment (and the
// razorpay-webhook as the safety net), both thin shells over the SQL command subscription_activate_payment.
// This function used to upsert `subscriptions` with onConflict 'user_id', a unique key that no longer exists
// (subscriptions are agency keyed since 20261026000000), and it wrote no agency_id, so it can never entitle.
// It stays deployed only to answer 410 with a clear pointer, never to write anything.
// Deploy with: supabase functions deploy verify-payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve((req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  return new Response(
    JSON.stringify({
      error: 'moved',
      message: 'This payment endpoint moved to verify-razorpay-payment. Start checkout from the Subscription page.',
      moved_to: 'verify-razorpay-payment',
    }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
})
