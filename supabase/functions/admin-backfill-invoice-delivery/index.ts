import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { finalizePaidInvoiceDelivery } from '../_shared/invoice-delivery.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type BackfillRequest = {
    invoiceId?: string
    invoiceNumber?: string
    customerEmail?: string | null
    customerPhone?: string | null
}

type InvoiceRow = {
    id: string
    user_id: string
    invoice_number: string
    razorpay_payment_id: string | null
}

type PaymentHistoryRow = {
    id: string
    payment_method: string | null
    razorpay_payment_id: string | null
    metadata: Record<string, unknown> | null
}

class RequestError extends Error {
    status: number
    expose: boolean

    constructor(message: string, status = 400, expose = true) {
        super(message)
        this.name = 'RequestError'
        this.status = status
        this.expose = expose
    }
}

function jsonResponse(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
        },
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function toRecord(value: unknown): Record<string, unknown> {
    return isRecord(value) ? value : {}
}

function normalizeString(value: unknown) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function getRequiredEnv(name: string) {
    const value = Deno.env.get(name)?.trim()

    if (!value) {
        throw new RequestError(`Missing required environment variable: ${name}`, 500, false)
    }

    return value
}

function getBearerToken(authorization: string | null) {
    if (!authorization) {
        throw new RequestError('Authentication is required.', 401)
    }

    const token = authorization.replace('Bearer ', '').trim()

    if (!token) {
        throw new RequestError('Authentication is required.', 401)
    }

    return token
}

function normalizeRole(role: string | null) {
    return typeof role === 'string' && role.trim().length > 0 ? role : 'user'
}

function normalizePaymentProvider(value: unknown): 'razorpay' | 'phonepe' | null {
    if (value === 'razorpay' || value === 'phonepe') {
        return value
    }

    return null
}

function parseRequestBody(body: unknown): BackfillRequest {
    if (!isRecord(body)) {
        throw new RequestError('A valid backfill request is required.')
    }

    const invoiceId = normalizeString(body.invoiceId)
    const invoiceNumber = normalizeString(body.invoiceNumber)
    if (!invoiceId && !invoiceNumber) {
        throw new RequestError('Provide invoiceId or invoiceNumber.')
    }

    return {
        invoiceId,
        invoiceNumber,
        customerEmail: normalizeString(body.customerEmail),
        customerPhone: normalizeString(body.customerPhone),
    }
}

async function requireAdmin(
    authorization: string,
    accessToken: string,
    supabaseUrl: string,
    supabaseAnonKey: string,
    supabaseServiceRoleKey: string,
) {
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global: {
            headers: {
                Authorization: authorization,
            },
        },
    })

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    })

    const {
        data: { user: caller },
        error: callerError,
    } = await authClient.auth.getUser(accessToken)

    if (callerError || !caller) {
        throw new RequestError('Authentication is required.', 401)
    }

    const { data: callerProfile, error: callerProfileError } = await serviceClient
        .from('users')
        .select('id, role')
        .eq('id', caller.id)
        .maybeSingle<{ id: string; role: string | null }>()

    if (callerProfileError) {
        console.error('Failed to resolve caller profile', callerProfileError)
        throw new RequestError('Unable to verify admin access.', 500, false)
    }

    if (normalizeRole(callerProfile?.role ?? null) !== 'admin') {
        throw new RequestError('Admin access is required.', 403)
    }

    return serviceClient
}

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const authorization = req.headers.get('Authorization')
        const accessToken = getBearerToken(authorization)
        const request = parseRequestBody(await req.json())

        const supabaseUrl = getRequiredEnv('SUPABASE_URL')
        const supabaseAnonKey = getRequiredEnv('SUPABASE_ANON_KEY')
        const supabaseServiceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY')

        const serviceClient = await requireAdmin(
            authorization!,
            accessToken,
            supabaseUrl,
            supabaseAnonKey,
            supabaseServiceRoleKey,
        )

        let invoiceLookup = serviceClient
            .from('invoices')
            .select('id, user_id, invoice_number, razorpay_payment_id')

        invoiceLookup = request.invoiceId
            ? invoiceLookup.eq('id', request.invoiceId)
            : invoiceLookup.eq('invoice_number', request.invoiceNumber!)

        const { data: invoice, error: invoiceError } = await invoiceLookup.maybeSingle<InvoiceRow>()

        if (invoiceError) {
            console.error('Failed to load invoice for delivery backfill', invoiceError)
            throw new RequestError('Unable to load invoice.', 500, false)
        }

        if (!invoice) {
            throw new RequestError('Invoice not found.', 404)
        }

        const { data: paymentRow, error: paymentError } = await serviceClient
            .from('payment_history')
            .select('id, payment_method, razorpay_payment_id, metadata')
            .eq('invoice_id', invoice.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle<PaymentHistoryRow>()

        if (paymentError) {
            console.error('Failed to load payment history for invoice delivery backfill', paymentError)
            throw new RequestError('Unable to load payment history.', 500, false)
        }

        const paymentMetadata = toRecord(paymentRow?.metadata)
        const paymentProvider = normalizePaymentProvider(paymentMetadata.payment_provider)
            ?? (paymentRow?.payment_method === 'phonepe' ? 'phonepe' : 'razorpay')
        const providerPaymentId = normalizeString(paymentRow?.razorpay_payment_id)
            ?? normalizeString(invoice.razorpay_payment_id)
        const customerEmail = request.customerEmail
            ?? normalizeString(paymentMetadata.customer_email)
        const customerPhone = request.customerPhone
            ?? normalizeString(paymentMetadata.customer_phone)

        const deliveryResult = await finalizePaidInvoiceDelivery(serviceClient, {
            invoiceId: invoice.id,
            paymentHistoryId: paymentRow?.id ?? null,
            paymentMetadata,
            userId: invoice.user_id,
            customerEmail,
            customerPhone,
            paymentProvider,
            providerPaymentId,
        })

        return jsonResponse({
            success: true,
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            paymentHistoryId: paymentRow?.id ?? null,
            paymentProvider,
            ...deliveryResult,
        })
    } catch (error) {
        if (error instanceof RequestError) {
            return jsonResponse({
                success: false,
                error: error.expose ? error.message : 'Request failed.',
            }, error.status)
        }

        console.error('admin-backfill-invoice-delivery failed', error)
        return jsonResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 500)
    }
})