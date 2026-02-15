// PhonePe Checkout Edge Function
// Deploy with: supabase functions deploy phonepe-checkout

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PhonePe configuration (server-side secrets)
const PHONEPE_MERCHANT_ID = Deno.env.get('PHONEPE_MERCHANT_ID') || ''
const PHONEPE_SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY') || ''
const PHONEPE_SALT_INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || '1'
const PHONEPE_API_URL = Deno.env.get('PHONEPE_API_URL') || 'https://api-preprod.phonepe.com/apis/pg-sandbox'

function generateChecksum(payload: string): string {
  const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload + PHONEPE_SALT_KEY))
    .then(buf => Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''))
  return hash.then(h => h + '###' + PHONEPE_SALT_INDEX)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { amount, merchantTransactionId, userId, callbackUrl } = await req.json()

    if (!amount || amount < 100) {
      throw new Error('Amount must be at least ₹1 (100 paise)')
    }

    if (!merchantTransactionId) {
      throw new Error('merchantTransactionId is required')
    }

    const payload = {
      merchantId: PHONEPE_MERCHANT_ID,
      merchantTransactionId: merchantTransactionId,
      merchantUserId: userId || `MUID_${Date.now()}`,
      amount: amount,
      redirectUrl: callbackUrl || `/?payment=success&transactionId=${merchantTransactionId}`,
      redirectMode: 'POST',
      callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/phonepe-status`,
      paymentInstrument: {
        type: 'PAY_PAGE'
      }
    }

    const base64Payload = btoa(JSON.stringify(payload))
    const checksum = await generateChecksum(base64Payload)

    const response = await fetch(`${PHONEPE_API_URL}/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'accept': 'application/json'
      },
      body: JSON.stringify({ request: base64Payload })
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('PhonePe payment initiation failed:', error)
      throw new Error(error.error?.message || 'Failed to initiate payment')
    }

    const result = await response.json()

    // Store pending payment in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    await supabase.from('payment_history').insert({
      amount: amount / 100, // Convert from paise to rupees
      currency: 'INR',
      payment_method: 'phonepe',
      status: 'pending',
      metadata: {
        merchantTransactionId,
        userId,
        phonepe_response: result
      }
    })

    return new Response(JSON.stringify(result), {
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
