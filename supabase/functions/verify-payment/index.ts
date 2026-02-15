// PhonePe Payment Verification Edge Function
// Deploy with: supabase functions deploy verify-payment
// This function is called by PhonePe as a callback when payment is completed

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PhonePe configuration
const PHONEPE_SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY') || ''

function verifyChecksum(payload: string, checksum: string): boolean {
  const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload + PHONEPE_SALT_KEY))
    .then(buf => Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''))
  return hash.then(h => h === checksum.split('###')[0])
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transactionId, amount, status, checksum } = await req.json()

    // Verify the checksum
    const payload = JSON.stringify({ transactionId, amount, status })
    const isValid = await verifyChecksum(btoa(payload), checksum)

    if (!isValid) {
      console.error('Invalid checksum received')
      return new Response(JSON.stringify({ success: false, error: 'Invalid checksum' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      })
    }

    // Update payment status in Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const statusMap: Record<string, string> = {
      'PAYMENT_SUCCESS': 'completed',
      'PAYMENT_PENDING': 'pending',
      'PAYMENT_FAILED': 'failed'
    }

    const { error: updateError } = await supabase.from('payment_history')
      .update({
        status: statusMap[status] || 'pending',
        metadata: {
          verified: true,
          transactionId,
          amount,
          status
        }
      })
      .like('metadata::text', `%${transactionId}%`)

    if (updateError) {
      console.error('Failed to update payment status:', updateError)
    }

    return new Response(JSON.stringify({ success: true }), {
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
