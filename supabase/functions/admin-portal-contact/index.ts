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

/** Upper bound on rows returned by the list action. Newest first. */
const LIST_ROW_CAP = 200

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new RequestError('A valid admin action is required.')
  }
}

function parseRequestBody(body: unknown): ContactRequest {
  if (!isRecord(body) || typeof body.action !== 'string') {
    throw new RequestError('A valid admin action is required.')
  }

  switch (body.action) {
    case 'list':
      return { action: 'list' }
    case 'resolve':
      if (!isUuid(body.inquiryId)) {
        throw new RequestError('A valid inquiry id is required.')
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
    const body = parseRequestBody(await readJsonBody(req))

    if (body.action === 'list') {
      const { data, error } = await serviceClient
        .from('contact_inquiries')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(LIST_ROW_CAP)

      if (error) {
        console.error('Failed to load contact inquiries', error)
        throw new RequestError('Unable to load contact inquiries.', 500, false)
      }

      return jsonResponse({ inquiries: data ?? [] })
    }

    // Select the row back so an unknown id is reported instead of silently "resolved".
    const { data, error } = await serviceClient
      .from('contact_inquiries')
      .update({ status: 'resolved' })
      .eq('id', body.inquiryId)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Failed to resolve contact inquiry', error)
      throw new RequestError('Unable to update this inquiry.', 500, false)
    }

    if (!data) {
      throw new RequestError('Inquiry not found.', 404)
    }

    return jsonResponse({ message: 'Inquiry resolved.' })
  } catch (error) {
    return handleRequestError('admin-portal-contact', error)
  }
})
