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

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  return {}
}

function generateChecksum(payload: string): string {
  const hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload + PHONEPE_SALT_KEY))
    .then(buf => Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(''))
  return hash.then(h => h + '###' + PHONEPE_SALT_INDEX)
}

function getPhonePeStatusDetails(result: Record<string, unknown>) {
  const resultData = toRecord(result.data)
  const providerStatus = typeof result.code === 'string'
    ? result.code
    : typeof result.state === 'string'
      ? result.state
      : typeof resultData.state === 'string'
        ? resultData.state
        : 'PAYMENT_PENDING'
  const paymentStatus = providerStatus === 'PAYMENT_SUCCESS'
    ? 'success'
    : providerStatus === 'PAYMENT_ERROR' || providerStatus === 'PAYMENT_DECLINED' || providerStatus === 'PAYMENT_FAILED'
      ? 'failed'
      : 'pending'
  const transactionId = typeof result.transactionId === 'string'
    ? result.transactionId
    : typeof resultData.transactionId === 'string'
      ? resultData.transactionId
      : null

  return {
    providerStatus,
    paymentStatus,
    transactionId,
    message: typeof result.message === 'string'
      ? result.message
      : paymentStatus === 'success'
        ? 'Payment successful'
        : paymentStatus === 'failed'
          ? 'Payment failed'
          : 'Payment is still pending',
    data: resultData,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authorization = req.headers.get('Authorization')

    if (!authorization) {
      return new Response(JSON.stringify({ error: 'Authentication is required to check PhonePe payment status' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const accessToken = authorization.replace('Bearer ', '').trim()

    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Authentication is required to check PhonePe payment status' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
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
      return new Response(JSON.stringify({ error: 'Unable to resolve authenticated user' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { merchantTransactionId } = await req.json()

    if (!merchantTransactionId) {
      throw new Error('merchantTransactionId is required')
    }

    const supabase = createClient(supabaseUrl, supabaseKey)
    const { data: paymentRow, error: paymentLookupError } = await supabase
      .from('payment_history')
      .select('id, user_id, metadata, status, subscription_id, invoice_id, razorpay_payment_id')
      .eq('razorpay_order_id', merchantTransactionId)
      .maybeSingle()

    if (paymentLookupError) {
      throw paymentLookupError
    }

    if (!paymentRow) {
      return new Response(JSON.stringify({ error: 'Payment record not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      })
    }

    if (paymentRow.user_id !== user.id) {
      return new Response(JSON.stringify({ error: 'Authenticated user does not match the payment being checked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    const paymentMetadata = toRecord(paymentRow.metadata)

    if (paymentRow.status === 'success' && (paymentRow.subscription_id || paymentRow.invoice_id)) {
      const cachedResult = toRecord(paymentMetadata.phonepe_response)
      const cachedTransactionId = typeof paymentMetadata.phonepe_transaction_id === 'string'
        ? paymentMetadata.phonepe_transaction_id
        : paymentRow.razorpay_payment_id || merchantTransactionId

      return new Response(JSON.stringify({
        success: true,
        status: 'SUCCESS',
        code: 'PAYMENT_SUCCESS',
        message: 'Payment already verified',
        data: {
          ...toRecord(cachedResult.data),
          transactionId: cachedTransactionId,
        },
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      })
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

    const result = toRecord(await response.json().catch(() => ({})))
    const statusDetails = getPhonePeStatusDetails(result)
    const resolvedTransactionId = statusDetails.transactionId || paymentRow.razorpay_payment_id || merchantTransactionId

    if (!response.ok && statusDetails.paymentStatus === 'pending') {
      console.error('PhonePe status check failed:', result)
      throw new Error(statusDetails.message || 'Failed to check payment status')
    }

    const { error: updateError } = await supabase.from('payment_history')
      .update({
        status: statusDetails.paymentStatus,
        metadata: {
          ...paymentMetadata,
          payment_provider: 'phonepe',
          phonepe_response: result,
          phonepe_transaction_id: resolvedTransactionId,
        }
      })
      .eq('id', paymentRow.id)

    if (updateError) {
      throw updateError
    }

    return new Response(JSON.stringify({
      success: statusDetails.paymentStatus === 'success',
      status: statusDetails.paymentStatus === 'success' ? 'SUCCESS' : statusDetails.paymentStatus === 'failed' ? 'FAILED' : 'PENDING',
      code: statusDetails.providerStatus,
      message: statusDetails.message,
      data: {
        ...statusDetails.data,
        transactionId: resolvedTransactionId,
      },
    }), {
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
