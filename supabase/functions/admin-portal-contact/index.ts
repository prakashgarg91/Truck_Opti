import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  isRecord,
  jsonResponse,
  RequestError,
  requireAdminContext,
} from '../_shared/portal-auth.ts'

type ContactRequest =
  | { action: 'list' }
  | { action: 'resolve'; inquiryId: string }

function parseRequestBody(body: unknown): ContactRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid admin action is required.')
  }

  switch (body.action) {
    case 'list':
      return { action: 'list' }
    case 'resolve':
      if (typeof body.inquiryId !== 'string') {
        throw new RequestError('inquiryId is required.')
      }

      return { action: 'resolve', inquiryId: body.inquiryId }
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
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Failed to load contact inquiries', error)
        throw new RequestError('Unable to load contact inquiries.', 500, false)
      }

      return jsonResponse({ inquiries: data ?? [] })
    }

    const { error } = await serviceClient
      .from('contact_inquiries')
      .update({ status: 'resolved' })
      .eq('id', body.inquiryId)

    if (error) {
      console.error('Failed to resolve contact inquiry', error)
      throw new RequestError('Unable to update this inquiry.', 500, false)
    }

    return jsonResponse({ message: 'Inquiry resolved.' })
  } catch (error) {
    return handleRequestError('admin-portal-contact', error)
  }
})