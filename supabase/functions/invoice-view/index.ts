import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  corsHeaders,
  handleRequestError,
  jsonResponse,
  RequestError,
  requireUserContext,
} from '../_shared/portal-auth.ts'

// Pinned signed-URL TTL (seconds). Expiring signed URLs are not revocable
// once issued (the Storage API signs an HMAC over path+expiry): revocation
// requires object deletion or key rotation. 300s covers the invoice-view
// click window without leaving a long-lived link behind.
const INVOICE_SIGNED_URL_EXPIRES_SECONDS = 300
const BILLING_DOCUMENTS_BUCKET = 'billing-documents'

// Mirrors sanitizeFileSegment in _shared/invoice-delivery.ts so the object
// path is deterministic from the invoice row. Because finalizePaidInvoiceDelivery
// has always uploaded to <userId>/<invoiceId>/<sanitized invoice number>.pdf,
// this also resolves documents written before the bucket was privatized —
// no data backfill is required.
function sanitizeFileSegment(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { caller, serviceClient } = await requireUserContext(req.headers.get('Authorization'))

    let invoiceId: string | null
    if (req.method === 'GET') {
      invoiceId = new URL(req.url).searchParams.get('invoiceId')
    } else if (req.method === 'POST') {
      let parsed: unknown = null
      try {
        parsed = await req.json()
      } catch {
        parsed = null
      }
      invoiceId =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? ((parsed as Record<string, unknown>).invoiceId as string | undefined) ?? null
          : null
    } else {
      throw new RequestError('Unsupported method.', 405)
    }

    if (!invoiceId || typeof invoiceId !== 'string') {
      throw new RequestError('invoiceId is required.', 400)
    }

    const { data: invoice, error: invoiceError } = await serviceClient
      .from('invoices')
      .select('id, user_id, invoice_number')
      .eq('id', invoiceId)
      .maybeSingle<{ id: string; user_id: string; invoice_number: string }>()

    if (invoiceError) {
      console.error('Failed to load invoice for signing', invoiceError)
      throw new RequestError('Unable to verify invoice access.', 500, false)
    }

    if (!invoice) {
      throw new RequestError('Invoice not found.', 404)
    }

    // Owner or a database-backed admin only (portal-auth authority pattern:
    // the trusted session identifies the caller, public.users.role decides
    // elevation — never client-controlled metadata).
    if (invoice.user_id !== caller.id) {
      const { data: profile, error: profileError } = await serviceClient
        .from('users')
        .select('id, role')
        .eq('id', caller.id)
        .maybeSingle<{ id: string; role: string | null }>()

      if (profileError) {
        console.error('Failed to resolve caller role for invoice access', profileError)
        throw new RequestError('Unable to verify invoice access.', 500, false)
      }

      if (profile?.role !== 'admin') {
        throw new RequestError('Access denied.', 403)
      }
    }

    const objectPath = `${invoice.user_id}/${invoice.id}/${sanitizeFileSegment(invoice.invoice_number)}.pdf`
    const { data: signed, error: signError } = await serviceClient.storage
      .from(BILLING_DOCUMENTS_BUCKET)
      .createSignedUrl(objectPath, INVOICE_SIGNED_URL_EXPIRES_SECONDS)

    if (signError || !signed?.signedUrl) {
      console.error('Failed to sign invoice document', signError)
      throw new RequestError('Unable to open the invoice document.', 500, false)
    }

    return jsonResponse({
      signedUrl: signed.signedUrl,
      expiresIn: INVOICE_SIGNED_URL_EXPIRES_SECONDS,
      path: objectPath,
    })
  } catch (error) {
    return handleRequestError('invoice-view', error)
  }
})
