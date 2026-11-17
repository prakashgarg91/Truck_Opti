// Razorpay webhook: a THIN shell around subscription_webhook_process (TO-152 S3).
// Deploy with: supabase functions deploy razorpay-webhook --no-verify-jwt
// Env: RAZORPAY_WEBHOOK_SECRET (never logged).
//
// Order: size cap -> constant-time HMAC of the RAW bytes -> strict UTF-8 -> parse -> sha256 of the
// raw bytes -> ONE database call. 200 for every ok result and every ledgered refusal, 500 only for
// retryable failures, 400 for a bad signature or a malformed body. A missing event id falls back to
// sha_<payload hash>. Signatures, bodies and card data are never logged.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0'
import {
  mapWebhookOutcome,
  MAX_WEBHOOK_BODY_BYTES,
  parseWebhookRequest,
  decodeUtf8Strict,
  readCappedBytes,
  sha256Hex,
  verifyWebhookSignature,
} from '../_shared/razorpay.ts'

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return reply(405, { error: 'method_not_allowed' })
  }

  try {
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') ?? ''
    if (!secret) {
      console.error('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET is not configured')
      return reply(500, { error: 'not_configured' })
    }

    const raw = await readCappedBytes(req.body, MAX_WEBHOOK_BODY_BYTES, req.headers.get('content-length'))
    if (!raw.ok) {
      return reply(raw.reason === 'too_large' ? 413 : 400, { error: raw.reason })
    }

    // Signature of the RAW received bytes, BEFORE any decoding or JSON parsing.
    const signature = req.headers.get('x-razorpay-signature')
    if (!(await verifyWebhookSignature(secret, raw.bytes, signature))) {
      console.error('[razorpay-webhook] signature check failed')
      return reply(400, { error: 'invalid_signature' })
    }

    const payloadSha256 = await sha256Hex(raw.bytes)
    const text = decodeUtf8Strict(raw.bytes)
    if (text === null) {
      console.error('[razorpay-webhook] body is not valid UTF-8')
      return reply(400, { error: 'invalid_body' })
    }
    const parsed = parseWebhookRequest(text, req.headers.get('x-razorpay-event-id'), payloadSha256)
    if (!parsed.ok) {
      console.error('[razorpay-webhook] malformed request:', parsed.error)
      return reply(400, { error: parsed.error })
    }
    const { eventId, eventType, payload } = parsed.value

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      console.error('[razorpay-webhook] Supabase environment is not configured')
      return reply(500, { error: 'not_configured' })
    }
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data, error } = await supabase.rpc('subscription_webhook_process', {
      p_event_id: eventId,
      p_event_type: eventType,
      p_payload: payload,
      p_payload_sha256: payloadSha256,
    })

    const decision = mapWebhookOutcome({ data, error: error ? { message: error.message, code: error.code } : null })
    if (decision.level === 'error') {
      console.error('[razorpay-webhook]', eventType, eventId, decision.log)
    } else {
      console.log('[razorpay-webhook]', eventType, eventId, decision.log)
    }
    return reply(decision.status, decision.body)
  } catch (error) {
    console.error('[razorpay-webhook] unexpected error', error instanceof Error ? error.name : 'unknown')
    return reply(500, { error: 'temporarily_unavailable' })
  }
})
