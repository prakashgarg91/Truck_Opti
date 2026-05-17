import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BILLING_DOCUMENTS_BUCKET = 'billing-documents'
const DEFAULT_APP_URL = 'https://www.truckopti.in'
const DEFAULT_SUPPORT_EMAIL = 'support@truckopti.in'
const DEFAULT_EMAIL_FROM = 'support@truckopti.in'
const AWS_SES_SERVICE = 'ses'
const textEncoder = new TextEncoder()

type InvoiceRow = {
    id: string
    subscription_id: string
    user_id: string
    invoice_number: string
    amount: number
    tax_amount: number
    total_amount: number
    currency: string | null
    status: 'pending' | 'paid' | 'failed' | 'refunded'
    billing_period_start: string
    billing_period_end: string
    paid_at: string | null
    pdf_url: string | null
}

type SubscriptionRow = {
    id: string
    plan_id: string
    billing_cycle: 'monthly' | 'yearly'
}

type PlanRow = {
    name: string
    tier: string
    support_level: string
}

type PublicUserRow = {
    email: string | null
    name: string | null
    phone: string | null
}

type CompanyMetadata = {
    name?: string
    gstin?: string
    address?: string
    address_line1?: string
    address_line2?: string
    city?: string
    state?: string
    pincode?: string
}

type AuthUserRow = {
    email: string | null
    phone: string | null
    user_metadata?: {
        full_name?: string
        name?: string
        phone?: string
        company?: CompanyMetadata
    }
}

type InvoiceDeliveryState = {
    pdfUrl?: string | null
    bucketPath?: string | null
    emailProvider?: string | null
    emailSentAt?: string | null
    emailError?: string | null
    finalizedAt?: string | null
    paymentProvider?: string | null
    providerPaymentId?: string | null
}

type InvoiceDeliveryContext = {
    invoice: InvoiceRow
    subscription: SubscriptionRow | null
    plan: PlanRow | null
    publicUser: PublicUserRow | null
    authUser: AuthUserRow | null
}

export type FinalizePaidInvoiceDeliveryParams = {
    invoiceId: string
    paymentHistoryId?: string | null
    paymentMetadata?: Record<string, unknown>
    userId: string
    customerEmail?: string | null
    customerPhone?: string | null
    paymentProvider: 'razorpay' | 'phonepe'
    providerPaymentId?: string | null
}

export type FinalizePaidInvoiceDeliveryResult = {
    pdfUrl: string | null
    emailSentAt: string | null
    emailError: string | null
}

type SesEmailConfig = {
    accessKeyId: string
    secretAccessKey: string
    sessionToken: string | null
    region: string
    fromEmailAddress: string
    replyToAddress: string | null
    configurationSetName: string | null
}

function toRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>
    }

    return {}
}

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
}

function sanitizeFileSegment(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function formatCurrency(amountInPaise: number, currency = 'INR') {
    const formattedAmount = new Intl.NumberFormat('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amountInPaise / 100)

    return `${currency} ${formattedAmount}`
}

function formatDate(value: string | null | undefined) {
    if (!value) {
        return '—'
    }

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
        return '—'
    }

    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date)
}

function escapeHtml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;')
}

function extractEmailAddress(value: string | null) {
    const normalized = normalizeString(value)
    if (!normalized) {
        return null
    }

    const match = normalized.match(/<([^>]+)>/)
    return normalizeString(match?.[1] ?? normalized)
}

function bytesToHex(bytes: Uint8Array) {
    return Array.from(bytes)
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')
}

function buildSesConfig() {
    const accessKeyId = normalizeString(Deno.env.get('AWS_ACCESS_KEY_ID'))
    const secretAccessKey = normalizeString(Deno.env.get('AWS_SECRET_ACCESS_KEY'))
    const region = normalizeString(Deno.env.get('AWS_SES_REGION'))
        ?? normalizeString(Deno.env.get('AWS_REGION'))
        ?? normalizeString(Deno.env.get('AWS_DEFAULT_REGION'))
    const sessionToken = normalizeString(Deno.env.get('AWS_SESSION_TOKEN'))
    const configurationSetName = normalizeString(Deno.env.get('AWS_SES_CONFIGURATION_SET'))
    const fromEmailAddress = extractEmailAddress(normalizeString(Deno.env.get('BILLING_EMAIL_FROM')) ?? DEFAULT_EMAIL_FROM)
    const replyToAddress = extractEmailAddress(normalizeString(Deno.env.get('BILLING_SUPPORT_EMAIL')) ?? DEFAULT_SUPPORT_EMAIL)

    const missingSettings = [
        ['AWS_ACCESS_KEY_ID', accessKeyId],
        ['AWS_SECRET_ACCESS_KEY', secretAccessKey],
        ['AWS_SES_REGION or AWS_REGION', region],
        ['BILLING_EMAIL_FROM', fromEmailAddress],
    ].filter(([, value]) => !value).map(([name]) => name)

    if (missingSettings.length > 0) {
        return {
            config: null,
            error: `Missing AWS SES configuration: ${missingSettings.join(', ')}`,
        }
    }

    return {
        config: {
            accessKeyId: accessKeyId!,
            secretAccessKey: secretAccessKey!,
            sessionToken,
            region: region!,
            fromEmailAddress: fromEmailAddress!,
            replyToAddress,
            configurationSetName,
        } satisfies SesEmailConfig,
        error: null,
    }
}

async function sha256Hex(value: string) {
    const digest = await crypto.subtle.digest('SHA-256', textEncoder.encode(value))
    return bytesToHex(new Uint8Array(digest))
}

async function hmacSha256(key: Uint8Array | string, value: string) {
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        typeof key === 'string' ? textEncoder.encode(key) : key,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )

    const signature = await crypto.subtle.sign('HMAC', cryptoKey, textEncoder.encode(value))
    return new Uint8Array(signature)
}

async function buildAwsSignatureKey(secretAccessKey: string, dateStamp: string, region: string) {
    const dateKey = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp)
    const regionKey = await hmacSha256(dateKey, region)
    const serviceKey = await hmacSha256(regionKey, AWS_SES_SERVICE)
    return await hmacSha256(serviceKey, 'aws4_request')
}

function formatAwsTimestamp(date: Date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

async function sendAwsSesEmail(
    config: SesEmailConfig,
    input: {
        subject: string
        html: string
        text: string
        recipientEmail: string
        invoiceId: string
        invoiceNumber: string
    },
) {
    const host = `email.${config.region}.amazonaws.com`
    const endpoint = `https://${host}/v2/email/outbound-emails`
    const payload = JSON.stringify({
        ...(config.configurationSetName ? { ConfigurationSetName: config.configurationSetName } : {}),
        FromEmailAddress: config.fromEmailAddress,
        Destination: {
            ToAddresses: [input.recipientEmail],
        },
        ...(config.replyToAddress ? { ReplyToAddresses: [config.replyToAddress] } : {}),
        Content: {
            Simple: {
                Subject: {
                    Charset: 'UTF-8',
                    Data: input.subject,
                },
                Body: {
                    Html: {
                        Charset: 'UTF-8',
                        Data: input.html,
                    },
                    Text: {
                        Charset: 'UTF-8',
                        Data: input.text,
                    },
                },
            },
        },
        EmailTags: [
            { Name: 'invoice_id', Value: sanitizeFileSegment(input.invoiceId) },
            { Name: 'invoice_number', Value: sanitizeFileSegment(input.invoiceNumber) },
        ],
    })

    const now = new Date()
    const amzDate = formatAwsTimestamp(now)
    const dateStamp = amzDate.slice(0, 8)
    const payloadHash = await sha256Hex(payload)
    const canonicalHeaders = [
        `content-type:application/json`,
        `host:${host}`,
        `x-amz-content-sha256:${payloadHash}`,
        `x-amz-date:${amzDate}`,
        ...(config.sessionToken ? [`x-amz-security-token:${config.sessionToken}`] : []),
    ].join('\n') + '\n'
    const signedHeaders = [
        'content-type',
        'host',
        'x-amz-content-sha256',
        'x-amz-date',
        ...(config.sessionToken ? ['x-amz-security-token'] : []),
    ].join(';')
    const canonicalRequest = [
        'POST',
        '/v2/email/outbound-emails',
        '',
        canonicalHeaders,
        signedHeaders,
        payloadHash,
    ].join('\n')
    const credentialScope = `${dateStamp}/${config.region}/${AWS_SES_SERVICE}/aws4_request`
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        await sha256Hex(canonicalRequest),
    ].join('\n')
    const signingKey = await buildAwsSignatureKey(config.secretAccessKey, dateStamp, config.region)
    const signature = bytesToHex(await hmacSha256(signingKey, stringToSign))

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
            'Content-Type': 'application/json',
            Host: host,
            'X-Amz-Content-Sha256': payloadHash,
            'X-Amz-Date': amzDate,
            ...(config.sessionToken ? { 'X-Amz-Security-Token': config.sessionToken } : {}),
        },
        body: payload,
    })

    if (!response.ok) {
        const errorText = await response.text()
        return {
            emailSentAt: null,
            emailError: `AWS SES send failed: ${response.status} ${errorText}`,
        }
    }

    return {
        emailSentAt: new Date().toISOString(),
        emailError: null,
    }
}

function buildBillingAddress(company?: CompanyMetadata) {
    const addressParts = [
        company?.address_line1,
        company?.address_line2,
        company?.address,
        company?.city,
        company?.state,
        company?.pincode,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)

    return addressParts.length > 0 ? addressParts.join(', ') : 'Not provided'
}

function buildDisplayName(context: InvoiceDeliveryContext) {
    return normalizeString(context.publicUser?.name)
        ?? normalizeString(context.authUser?.user_metadata?.full_name)
        ?? normalizeString(context.authUser?.user_metadata?.name)
        ?? normalizeString(context.publicUser?.email)
        ?? normalizeString(context.authUser?.email)
        ?? 'TruckOpti Customer'
}

function buildDeliveryState(metadata: Record<string, unknown>): InvoiceDeliveryState {
    return toRecord(metadata.invoice_delivery)
}

function wrapText(text: string, maxWidth: number, font: Awaited<ReturnType<typeof PDFDocument.prototype.embedFont>>, fontSize: number) {
    const words = text.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
        return ['']
    }

    const lines: string[] = []
    let currentLine = words[0]

    for (const word of words.slice(1)) {
        const candidate = `${currentLine} ${word}`
        if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
            currentLine = candidate
            continue
        }

        lines.push(currentLine)
        currentLine = word
    }

    lines.push(currentLine)
    return lines
}

async function buildInvoicePdf(context: InvoiceDeliveryContext) {
    const pdf = await PDFDocument.create()
    const page = pdf.addPage([595.28, 841.89])
    const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold)
    const bodyFont = await pdf.embedFont(StandardFonts.Helvetica)
    const monoFont = await pdf.embedFont(StandardFonts.Courier)
    const company = context.authUser?.user_metadata?.company
    const planName = normalizeString(context.plan?.name) ?? 'Subscription plan'
    const customerName = buildDisplayName(context)
    const customerEmail = normalizeString(context.publicUser?.email)
        ?? normalizeString(context.authUser?.email)
        ?? 'Not provided'
    const customerPhone = normalizeString(context.publicUser?.phone)
        ?? normalizeString(context.authUser?.phone)
        ?? normalizeString(context.authUser?.user_metadata?.phone)
        ?? 'Not provided'
    const customerAddress = buildBillingAddress(company)
    const customerGstin = normalizeString(company?.gstin)
    const labelX = 36
    const valueX = 168
    const contentWidth = 520
    let cursorY = 790

    const drawLines = (lines: string[], x: number, y: number, fontSize = 11) => {
        let lineY = y
        for (const line of lines) {
            page.drawText(line, {
                x,
                y: lineY,
                size: fontSize,
                font: bodyFont,
                color: rgb(0.1, 0.16, 0.25),
            })
            lineY -= 14
        }
        return lineY
    }

    const drawRow = (label: string, value: string) => {
        page.drawText(label, {
            x: labelX,
            y: cursorY,
            size: 11,
            font: titleFont,
            color: rgb(0.1, 0.16, 0.25),
        })

        const wrappedValue = wrapText(value, contentWidth - valueX, bodyFont, 11)
        const nextY = drawLines(wrappedValue, valueX, cursorY)
        cursorY = Math.min(cursorY - 18, nextY - 6)
    }

    page.drawText('TruckOpti Subscription Invoice', {
        x: labelX,
        y: cursorY,
        size: 20,
        font: titleFont,
        color: rgb(0.05, 0.23, 0.47),
    })
    cursorY -= 30

    page.drawText('TruckOpti Billing', {
        x: labelX,
        y: cursorY,
        size: 12,
        font: titleFont,
        color: rgb(0.1, 0.16, 0.25),
    })
    cursorY -= 16
    cursorY = drawLines([
        DEFAULT_APP_URL,
        DEFAULT_SUPPORT_EMAIL,
    ], labelX, cursorY, 10) - 8

    page.drawLine({
        start: { x: labelX, y: cursorY },
        end: { x: 559, y: cursorY },
        thickness: 1,
        color: rgb(0.88, 0.91, 0.95),
    })
    cursorY -= 24

    drawRow('Invoice Number', context.invoice.invoice_number)
    drawRow('Status', context.invoice.status.toUpperCase())
    drawRow('Paid On', formatDate(context.invoice.paid_at || context.invoice.billing_period_start))
    drawRow('Billing Period', `${formatDate(context.invoice.billing_period_start)} to ${formatDate(context.invoice.billing_period_end)}`)
    drawRow('Billing Cycle', context.subscription?.billing_cycle === 'yearly' ? 'Yearly' : 'Monthly')
    drawRow('Plan', planName)

    cursorY -= 4
    page.drawText('Billed To', {
        x: labelX,
        y: cursorY,
        size: 12,
        font: titleFont,
        color: rgb(0.1, 0.16, 0.25),
    })
    cursorY -= 18
    cursorY = drawLines([
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        ...(customerGstin ? [`GSTIN: ${customerGstin}`] : []),
    ], labelX, cursorY) - 10

    page.drawLine({
        start: { x: labelX, y: cursorY },
        end: { x: 559, y: cursorY },
        thickness: 1,
        color: rgb(0.88, 0.91, 0.95),
    })
    cursorY -= 24

    drawRow('Subtotal', formatCurrency(context.invoice.amount, context.invoice.currency ?? 'INR'))
    drawRow('Tax', formatCurrency(context.invoice.tax_amount, context.invoice.currency ?? 'INR'))
    drawRow('Total Paid', formatCurrency(context.invoice.total_amount, context.invoice.currency ?? 'INR'))
    drawRow('Currency', context.invoice.currency ?? 'INR')

    cursorY -= 8
    page.drawText('Reference', {
        x: labelX,
        y: cursorY,
        size: 12,
        font: titleFont,
        color: rgb(0.1, 0.16, 0.25),
    })
    cursorY -= 18
    page.drawText(context.invoice.id, {
        x: labelX,
        y: cursorY,
        size: 10,
        font: monoFont,
        color: rgb(0.32, 0.39, 0.49),
    })
    cursorY -= 28

    const noteLines = wrapText(
        'This hosted invoice was generated automatically when the payment verification flow marked the subscription payment as successful.',
        contentWidth,
        bodyFont,
        10,
    )
    drawLines(noteLines, labelX, cursorY, 10)

    return pdf.save()
}

async function ensureBillingBucket(supabase: SupabaseClient) {
    const { error } = await supabase.storage.createBucket(BILLING_DOCUMENTS_BUCKET, {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['application/pdf'],
    })

    if (!error) {
        return
    }

    const errorText = normalizeString(error.message)?.toLowerCase() ?? ''
    const errorStatus = 'status' in error ? String((error as { status?: number }).status ?? '') : ''
    if (errorText.includes('exists') || errorStatus === '409') {
        return
    }

    throw error
}

async function loadDeliveryContext(
    supabase: SupabaseClient,
    invoiceId: string,
    userId: string,
): Promise<InvoiceDeliveryContext> {
    const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, subscription_id, user_id, invoice_number, amount, tax_amount, total_amount, currency, status, billing_period_start, billing_period_end, paid_at, pdf_url')
        .eq('id', invoiceId)
        .maybeSingle<InvoiceRow>()

    if (invoiceError || !invoice) {
        throw invoiceError || new Error('Invoice not found for delivery')
    }

    if (invoice.user_id !== userId) {
        throw new Error('Invoice delivery user mismatch')
    }

    const [subscriptionResult, publicUserResult, authUserResult] = await Promise.all([
        supabase
            .from('subscriptions')
            .select('id, plan_id, billing_cycle')
            .eq('id', invoice.subscription_id)
            .maybeSingle<SubscriptionRow>(),
        supabase
            .from('users')
            .select('email, name, phone')
            .eq('id', userId)
            .maybeSingle<PublicUserRow>(),
        supabase.auth.admin.getUserById(userId),
    ])

    if (subscriptionResult.error) {
        throw subscriptionResult.error
    }

    if (publicUserResult.error) {
        throw publicUserResult.error
    }

    if (authUserResult.error) {
        throw authUserResult.error
    }

    let plan: PlanRow | null = null
    if (subscriptionResult.data?.plan_id) {
        const { data: planData, error: planError } = await supabase
            .from('subscription_plans')
            .select('name, tier, support_level')
            .eq('id', subscriptionResult.data.plan_id)
            .maybeSingle<PlanRow>()

        if (planError) {
            throw planError
        }

        plan = planData ?? null
    }

    const authUser = authUserResult.data.user
        ? {
            email: authUserResult.data.user.email ?? null,
            phone: authUserResult.data.user.phone ?? null,
            user_metadata: toRecord(authUserResult.data.user.user_metadata) as AuthUserRow['user_metadata'],
        }
        : null

    return {
        invoice,
        subscription: subscriptionResult.data ?? null,
        plan,
        publicUser: publicUserResult.data ?? null,
        authUser,
    }
}

async function sendInvoiceEmail(input: {
    invoice: InvoiceRow
    planName: string
    pdfUrl: string
    recipientEmail: string
    customerName: string
}) {
    const sesConfig = buildSesConfig()
    const supportEmail = normalizeString(Deno.env.get('BILLING_SUPPORT_EMAIL')) ?? DEFAULT_SUPPORT_EMAIL
    const appUrl = normalizeString(Deno.env.get('BILLING_APP_URL')) ?? DEFAULT_APP_URL

    if (!sesConfig.config) {
        return {
            emailSentAt: null,
            emailError: sesConfig.error,
        }
    }

    const subject = `TruckOpti invoice ${input.invoice.invoice_number}`
    const formattedTotal = formatCurrency(input.invoice.total_amount, input.invoice.currency ?? 'INR')
    const paidOn = formatDate(input.invoice.paid_at || input.invoice.billing_period_start)
    const billingPeriod = `${formatDate(input.invoice.billing_period_start)} to ${formatDate(input.invoice.billing_period_end)}`

    const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; background: #f8fafc; padding: 24px; color: #0f172a;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="padding: 24px 28px; background: linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%); color: #ffffff;">
          <div style="font-size: 24px; font-weight: 700;">TruckOpti Billing</div>
          <div style="font-size: 14px; margin-top: 8px; opacity: 0.9;">Your payment is confirmed and the hosted invoice is ready.</div>
        </div>
        <div style="padding: 28px;">
          <p style="margin: 0 0 16px; font-size: 15px;">Hi ${escapeHtml(input.customerName)},</p>
          <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6;">Thanks for your payment. Your subscription invoice is ready at the hosted link below.</p>
                    <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6;">Thanks for your payment. Your subscription invoice is ready at the hosted link below.</p>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px;">
            <tr><td style="padding: 8px 0; color: #475569;">Invoice Number</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${escapeHtml(input.invoice.invoice_number)}</td></tr>
            <tr><td style="padding: 8px 0; color: #475569;">Plan</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${escapeHtml(input.planName)}</td></tr>
            <tr><td style="padding: 8px 0; color: #475569;">Paid On</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${escapeHtml(paidOn)}</td></tr>
            <tr><td style="padding: 8px 0; color: #475569;">Billing Period</td><td style="padding: 8px 0; font-weight: 600; text-align: right;">${escapeHtml(billingPeriod)}</td></tr>
            <tr><td style="padding: 8px 0; color: #475569;">Total Paid</td><td style="padding: 8px 0; font-weight: 700; text-align: right;">${escapeHtml(formattedTotal)}</td></tr>
          </table>
          <div style="margin-bottom: 24px;">
            <a href="${escapeHtml(input.pdfUrl)}" style="display: inline-block; background: #1d4ed8; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 10px; font-weight: 600;">Open hosted invoice</a>
          </div>
          <p style="margin: 0 0 8px; font-size: 14px; line-height: 1.6;">You can also review your billing history anytime in your TruckOpti account.</p>
          <p style="margin: 0 0 4px; font-size: 14px;"><a href="${escapeHtml(appUrl)}/subscription" style="color: #1d4ed8;">${escapeHtml(appUrl)}/subscription</a></p>
        </div>
        <div style="padding: 18px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
          Need help? Contact ${escapeHtml(supportEmail)}.
        </div>
      </div>
    </div>
  `.trim()

    const text = [
        `Hi ${input.customerName},`,
        '',
        'Your TruckOpti payment is confirmed.',
        `Invoice Number: ${input.invoice.invoice_number}`,
        `Plan: ${input.planName}`,
        `Paid On: ${paidOn}`,
        `Billing Period: ${billingPeriod}`,
        `Total Paid: ${formattedTotal}`,
        '',
        `Hosted invoice: ${input.pdfUrl}`,
        `Billing history: ${appUrl}/subscription`,
        '',
        `Support: ${supportEmail}`,
    ].join('\n')

    return await sendAwsSesEmail(sesConfig.config, {
        subject,
        html,
        text,
        recipientEmail: input.recipientEmail,
        invoiceId: input.invoice.id,
        invoiceNumber: input.invoice.invoice_number,
    })
}

async function persistDeliveryState(
    supabase: SupabaseClient,
    paymentHistoryId: string,
    paymentMetadata: Record<string, unknown>,
    deliveryState: InvoiceDeliveryState,
) {
    const { error } = await supabase
        .from('payment_history')
        .update({
            metadata: {
                ...paymentMetadata,
                invoice_delivery: deliveryState,
            },
        })
        .eq('id', paymentHistoryId)

    if (error) {
        throw error
    }
}

export async function finalizePaidInvoiceDelivery(
    supabase: SupabaseClient,
    params: FinalizePaidInvoiceDeliveryParams,
): Promise<FinalizePaidInvoiceDeliveryResult> {
    const paymentMetadata = params.paymentMetadata ?? {}
    const existingDeliveryState = buildDeliveryState(paymentMetadata)
    const context = await loadDeliveryContext(supabase, params.invoiceId, params.userId)

    if (context.invoice.status !== 'paid') {
        return {
            pdfUrl: context.invoice.pdf_url,
            emailSentAt: normalizeString(existingDeliveryState.emailSentAt),
            emailError: normalizeString(existingDeliveryState.emailError),
        }
    }

    let pdfUrl = normalizeString(context.invoice.pdf_url) ?? normalizeString(existingDeliveryState.pdfUrl)
    let bucketPath = normalizeString(existingDeliveryState.bucketPath)

    if (!pdfUrl) {
        await ensureBillingBucket(supabase)

        const filePath = `${params.userId}/${params.invoiceId}/${sanitizeFileSegment(context.invoice.invoice_number)}.pdf`
        const pdfBytes = await buildInvoicePdf(context)
        const { error: uploadError } = await supabase.storage
            .from(BILLING_DOCUMENTS_BUCKET)
            .upload(filePath, pdfBytes, {
                upsert: true,
                contentType: 'application/pdf',
                cacheControl: '3600',
            })

        if (uploadError) {
            throw uploadError
        }

        const { data } = supabase.storage.from(BILLING_DOCUMENTS_BUCKET).getPublicUrl(filePath)
        pdfUrl = normalizeString(data.publicUrl)
        bucketPath = filePath

        if (!pdfUrl) {
            throw new Error('Failed to build public invoice URL')
        }

        const { error: invoiceUpdateError } = await supabase
            .from('invoices')
            .update({ pdf_url: pdfUrl })
            .eq('id', context.invoice.id)

        if (invoiceUpdateError) {
            throw invoiceUpdateError
        }
    }

    let emailSentAt = normalizeString(existingDeliveryState.emailSentAt)
    let emailError = normalizeString(existingDeliveryState.emailError)

    if (!emailSentAt) {
        const recipientEmail = normalizeString(params.customerEmail)
            ?? normalizeString(context.publicUser?.email)
            ?? normalizeString(context.authUser?.email)

        if (!recipientEmail) {
            emailError = 'Missing recipient email address'
        } else if (pdfUrl) {
            const emailResult = await sendInvoiceEmail({
                invoice: context.invoice,
                planName: normalizeString(context.plan?.name) ?? 'Subscription plan',
                pdfUrl,
                recipientEmail,
                customerName: buildDisplayName(context),
            })

            emailSentAt = emailResult.emailSentAt
            emailError = emailResult.emailError
        }
    }

    if (params.paymentHistoryId) {
        await persistDeliveryState(supabase, params.paymentHistoryId, paymentMetadata, {
            ...existingDeliveryState,
            pdfUrl,
            bucketPath,
            emailProvider: 'aws-ses',
            emailSentAt,
            emailError,
            finalizedAt: new Date().toISOString(),
            paymentProvider: params.paymentProvider,
            providerPaymentId: params.providerPaymentId ?? null,
        })
    }

    return {
        pdfUrl,
        emailSentAt,
        emailError,
    }
}