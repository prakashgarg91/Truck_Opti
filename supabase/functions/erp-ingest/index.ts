// ERP ingest receiver: a THIN shell around erp_event_ingest (TO-151).
// Deploy with: supabase functions deploy erp-ingest --no-verify-jwt
// The connection id + secret are the credential; the database decides everything.
//
// Order: size cap (streamed) -> strict UTF-8 -> JSON parse -> ONE service-role database call.
// The secret may be sent as "Authorization: Bearer <secret>" or "x-truckopti-secret" (preferred over
// the body so proxies that log bodies never see it). Secrets, lines and problems are never logged.
// No CORS: this is a server-to-server endpoint.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.0'
import { readCappedBytes } from '../_shared/razorpay.ts'
import { mapErpOutcome, mapParseError, MAX_ERP_BODY_BYTES, parseErpBytes } from '../_shared/erpIngest.ts'

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return reply(405, { ok: false, error: 'method_not_allowed' })
  }

  try {
    const raw = await readCappedBytes(req.body, MAX_ERP_BODY_BYTES, req.headers.get('content-length'))
    if (!raw.ok) {
      return reply(raw.reason === 'too_large' ? 413 : 400, {
        ok: false,
        error: raw.reason === 'too_large' ? 'payload_too_large' : 'invalid_body',
      })
    }

    const parsed = parseErpBytes(raw.bytes, {
      authorization: req.headers.get('authorization'),
      secretHeader: req.headers.get('x-truckopti-secret'),
    })
    if (!parsed.ok) {
      const failure = mapParseError(parsed.error)
      return reply(failure.status, failure.body)
    }
    const { connectionId, secret, externalEventId, lines } = parsed.value

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      console.error('[erp-ingest] Supabase environment is not configured')
      return reply(500, { ok: false, error: 'not_configured' })
    }
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data, error } = await supabase.rpc('erp_event_ingest', {
      p_connection_id: connectionId,
      p_secret: secret,
      p_external_event_id: externalEventId,
      p_lines: lines,
    })

    const decision = mapErpOutcome({ data, error: error ? { message: error.message, code: error.code } : null })
    if (decision.level === 'error') {
      console.error('[erp-ingest]', connectionId, decision.log)
    } else {
      console.log('[erp-ingest]', connectionId, decision.log)
    }
    return reply(decision.status, decision.body)
  } catch (error) {
    console.error('[erp-ingest] unexpected error', error instanceof Error ? error.name : 'unknown')
    return reply(500, { ok: false, error: 'temporarily_unavailable' })
  }
})
