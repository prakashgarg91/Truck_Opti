import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAdminContext,
} from '../_shared/portal-auth.ts'

type PayoutRequest =
  | { action: 'list' }
  | { action: 'approve'; payoutId: string }
  | { action: 'reject'; payoutId: string; rejectionNote: string }
  | { action: 'mark-paid'; payoutId: string }

function parseRequestBody(body: unknown): PayoutRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid admin action is required.')
  }

  switch (body.action) {
    case 'list':
      return { action: 'list' }
    case 'approve':
      if (typeof body.payoutId !== 'string') {
        throw new RequestError('payoutId is required.')
      }

      return { action: 'approve', payoutId: body.payoutId }
    case 'reject':
      if (typeof body.payoutId !== 'string' || typeof body.rejectionNote !== 'string') {
        throw new RequestError('payoutId and rejectionNote are required.')
      }

      return { action: 'reject', payoutId: body.payoutId, rejectionNote: body.rejectionNote }
    case 'mark-paid':
      if (typeof body.payoutId !== 'string') {
        throw new RequestError('payoutId is required.')
      }

      return { action: 'mark-paid', payoutId: body.payoutId }
    default:
      throw new RequestError('Unsupported admin action.')
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { serviceClient } = await requireAdminContext(req.headers.get('Authorization'))
    const body = parseRequestBody(await req.json())

    if (body.action === 'list') {
      const { data, error } = await serviceClient
        .from('driver_payouts')
        .select('*, drivers(full_name, phone)')
        .order('requested_at', { ascending: false })

      if (error) {
        console.error('Failed to load payouts', error)
        throw new RequestError('Unable to load payouts.', 500, false)
      }

      return jsonResponse({ payouts: data ?? [] })
    }

    if (body.action === 'approve') {
      const { data, error } = await serviceClient
        .from('driver_payouts')
        .update({
          status: 'approved',
          processed_at: new Date().toISOString(),
        })
        .eq('id', body.payoutId)
        .select('*, drivers(full_name, phone)')
        .single()

      if (error) {
        console.error('Failed to approve payout', error)
        throw new RequestError('Unable to approve payout.', 500, false)
      }

      return jsonResponse({ payout: data })
    }

    if (body.action === 'reject') {
      const { data, error } = await serviceClient
        .from('driver_payouts')
        .update({
          status: 'rejected',
          note: body.rejectionNote,
          processed_at: new Date().toISOString(),
        })
        .eq('id', body.payoutId)
        .select('*, drivers(full_name, phone)')
        .single()

      if (error) {
        console.error('Failed to reject payout', error)
        throw new RequestError('Unable to reject payout.', 500, false)
      }

      return jsonResponse({ payout: data })
    }

    const { data, error } = await serviceClient
      .from('driver_payouts')
      .update({
        status: 'paid',
        processed_at: new Date().toISOString(),
      })
      .eq('id', body.payoutId)
      .select('*, drivers(full_name, phone)')
      .single()

    if (error) {
      console.error('Failed to mark payout as paid', error)
      throw new RequestError('Unable to mark payout as paid.', 500, false)
    }

    return jsonResponse({ payout: data })
  } catch (error) {
    return handleRequestError('admin-portal-payouts', error)
  }
})