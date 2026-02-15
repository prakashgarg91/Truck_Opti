// PhonePe Status Check Edge Function
// Deploy with: supabase functions deploy phonepe-status

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// PhonePe configuration
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
    const { merchantTransactionId } = await req.json()

    if (!merchantTransactionId) {
      throw new Error('merchantTransactionId is required')
    }

    const statusPath = `/v3/transaction/${merchantTransactionId}/status`
    const base64Payload = btoa(merchantTransactionId)
    const checksum = await generateChecksum(base64Payload)

    const response = await fetch(`${PHONEPE_API_URL}${statusPath}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': Deno.env.get('PHONEPE_MERCHANT_ID') || '',
        'accept': 'application/json'
      }
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('PhonePe status check failed:', error)
      throw new Error(error.error?.message || 'Failed to check payment status')
    }

    const result = await response.json()

    // Update payment status in Supabase if we have a transactionId
    if (result.transactionId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      const statusMap: Record<string, string> = {
        'PAYMENT_SUCCESS': 'completed',
        'PAYMENT_PENDING': 'pending',
        'PAYMENT_FAILED': 'failed'
      }

      await supabase.from('payment_history')
        .update({
          status: statusMap[result.state] || 'pending',
          metadata: {
            phonepe_response: result
          }
        })
        .like('metadata::text', `%${merchantTransactionId}%`)
    }

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
