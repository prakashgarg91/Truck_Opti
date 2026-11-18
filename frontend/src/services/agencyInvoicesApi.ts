import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { throwIfSubscriptionError } from '../lib/subscriptionGuard'

/**
 * Agency freight invoices (TO-148, RECORD-ONLY): reads over RLS and the three
 * SECURITY DEFINER commands agency_invoice_issue / agency_invoice_record_payment /
 * agency_invoice_cancel of 20261021000000_agency_invoices.sql. The platform never
 * holds freight money; the server recomputes every total and is the authority.
 *
 * Result contract (same as agencyOrdersApi): a business refusal is a typed
 * RESULT, never an exception; controlled database exceptions surface an
 * approved plain message; anything else collapses to the caller's fallback.
 * supabase.rpc / supabase.from are always called as client methods.
 */

export type InvoiceStatus = 'issued' | 'partly_paid' | 'paid' | 'cancelled'
export type PaymentMethod = 'upi' | 'bank' | 'cash' | 'cheque'

export interface InvoiceClient {
    id: string
    client_name: string
    status: string
}

export interface InvoiceRow {
    id: string
    client_id: string
    invoice_number: string
    status: InvoiceStatus
    supplier_state_code: string
    place_of_supply_state_code: string
    gst_rate_pct: number
    reverse_charge: boolean
    subtotal_paise: number
    cgst_paise: number
    sgst_paise: number
    igst_paise: number
    round_off_paise: number
    total_paise: number
    paid_paise: number
    version: number
    cancelled_reason: string | null
    created_at: string
}

export interface InvoiceLineRow {
    id: string
    invoice_id: string
    line_no: number
    description: string
    quantity: number
    rate_paise: number
    amount_paise: number
}

export interface InvoicePaymentRow {
    id: string
    invoice_id: string
    amount_paise: number
    method: PaymentMethod
    reference: string | null
    received_on: string
    created_at: string
}

export interface InvoiceDetail {
    lines: InvoiceLineRow[]
    payments: InvoicePaymentRow[]
}

export interface IssueLineInput {
    description: string
    quantity: number
    ratePaise: number
}

export interface IssueInput {
    clientId: string
    lines: IssueLineInput[]
    supplierState: string
    placeOfSupplyState: string
    gstRatePct: number
    reverseCharge: boolean
    roundOff: boolean
    idempotencyKey: string
}

export interface PaymentInput {
    invoiceId: string
    amountPaise: number
    method: PaymentMethod
    reference: string
    receivedOn: string
    expectedVersion: number
    idempotencyKey: string
}

export interface LineProblem {
    index: number
    message: string
}

export type IssueErrorCode =
    | 'idempotency_key_required'
    | 'idempotency_key_reused'
    | 'no_lines'
    | 'too_many_lines'
    | 'invalid_gst_rate'
    | 'invalid_state_code'
    | 'client_not_found'
    | 'invalid_line'
    | 'invalid_total'
    | 'unknown'

export type PaymentErrorCode =
    | 'not_found'
    | 'idempotency_key_required'
    | 'idempotency_key_reused'
    | 'invoice_cancelled'
    | 'invalid_amount'
    | 'invalid_method'
    | 'invalid_date'
    | 'future_date'
    | 'version_conflict'
    | 'overpayment'
    | 'invalid_reference'
    | 'unknown'

export type CancelErrorCode =
    | 'not_found'
    | 'already_cancelled'
    | 'reason_required'
    | 'version_conflict'
    | 'has_payments'
    | 'unknown'

export type IssueResult =
    | { ok: true; invoiceId: string; invoiceNumber: string; replay: boolean }
    | { ok: false; error: IssueErrorCode; message: string; problems: LineProblem[] }

export type PaymentResult =
    | { ok: true; paidPaise: number; status: InvoiceStatus; version: number; replay: boolean }
    | { ok: false; error: PaymentErrorCode; message: string; currentVersion?: number; outstandingPaise?: number }

export type CancelResult =
    | { ok: true; version: number }
    | { ok: false; error: CancelErrorCode; message: string; currentVersion?: number }

export const ISSUE_ERROR_MESSAGES: Readonly<Record<Exclude<IssueErrorCode, 'unknown'>, string>> = Object.freeze({
    idempotency_key_required: 'This request could not be identified. Reload the page and try again.',
    idempotency_key_reused: 'This request was already used for a different invoice. Review the form and issue it again.',
    no_lines: 'Add at least one line item before issuing the invoice.',
    too_many_lines: 'An invoice can have at most 100 lines. Split it into two invoices.',
    invalid_gst_rate: 'Choose a GST rate of 0, 5, 12 or 18 percent.',
    invalid_state_code: 'Enter two-digit state codes (01 to 38) for the supplier and the place of supply.',
    client_not_found: 'This client could not be found. Reload the page and choose the client again.',
    invalid_line: 'Some line items were rejected. Fix them and issue the invoice again. Nothing was saved.',
    invalid_total: 'The invoice total must be more than zero.',
})

export const PAYMENT_ERROR_MESSAGES: Readonly<Record<Exclude<PaymentErrorCode, 'unknown'>, string>> = Object.freeze({
    not_found: 'This invoice could not be found. Reload the page.',
    idempotency_key_required: 'This request could not be identified. Reload the page and try again.',
    idempotency_key_reused: 'This request was already used for a different payment. Check the form and record it again.',
    invoice_cancelled: 'This invoice is cancelled, so payments cannot be recorded.',
    invalid_amount: 'Enter an amount greater than zero.',
    invalid_method: 'Choose how the money was received: UPI, bank, cash or cheque.',
    invalid_date: 'Enter the date the money was received.',
    future_date: 'The received date cannot be in the future.',
    version_conflict: 'This invoice changed since you opened it. Reload to continue.',
    overpayment: 'This amount is more than the outstanding balance.',
    invalid_reference: 'The reference can be at most 100 characters.',
})

export const CANCEL_ERROR_MESSAGES: Readonly<Record<Exclude<CancelErrorCode, 'unknown'>, string>> = Object.freeze({
    not_found: 'This invoice could not be found. Reload the page.',
    already_cancelled: 'This invoice is already cancelled.',
    reason_required: 'Enter a reason for cancelling (up to 300 characters).',
    version_conflict: 'This invoice changed since you opened it. Reload to continue.',
    has_payments: 'This invoice has recorded payments, so it cannot be cancelled.',
})

/** Controlled RAISE EXCEPTION texts; anything else is redacted to the fallback. */
const CONTROLLED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'Agency approval is required.',
    'Your access scope does not allow this action.',
    'No agency profile found for this account.',
    'Multiple agency profiles found for this account.',
    'Sign-in is required.',
])

interface Envelope {
    ok?: unknown
    error?: unknown
    [key: string]: unknown
}

type RpcClient = {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: unknown } | null }>
}

/**
 * Commands guarded server-side by agency_subscription_assert (rulings B 1). Only these map
 * SB001-SB004 to a typed subscription error; commands that must stay open never do.
 */
const SUBSCRIPTION_GUARDED: ReadonlySet<string> = new Set([
    'agency_invoice_issue',
])

async function callRpc(name: string, args: Record<string, unknown>, fallback: string): Promise<Envelope> {
    // Call as a method: the client's rpc() relies on `this`; a detached call crashes.
    const client = supabase as unknown as RpcClient
    const { data, error } = await client.rpc(name, args)
    if (error) {
        if (SUBSCRIPTION_GUARDED.has(name)) throwIfSubscriptionError(error)
        const message = error.message
        throw new UserFacingError(typeof message === 'string' && CONTROLLED_EXCEPTIONS.has(message) ? message : fallback)
    }
    const envelope = (Array.isArray(data) ? data[0] : data) as Envelope | null | undefined
    if (!envelope || typeof envelope.ok !== 'boolean') throw new UserFacingError(fallback)
    return envelope
}

function pick<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
    return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null
}

const ISSUE_CODES = Object.keys(ISSUE_ERROR_MESSAGES) as Exclude<IssueErrorCode, 'unknown'>[]
const PAYMENT_CODES = Object.keys(PAYMENT_ERROR_MESSAGES) as Exclude<PaymentErrorCode, 'unknown'>[]
const CANCEL_CODES = Object.keys(CANCEL_ERROR_MESSAGES) as Exclude<CancelErrorCode, 'unknown'>[]
const STATUSES: readonly InvoiceStatus[] = ['issued', 'partly_paid', 'paid', 'cancelled']

function toProblems(raw: unknown): LineProblem[] {
    if (!Array.isArray(raw)) return []
    const out: LineProblem[] = []
    for (const item of raw) {
        if (item && typeof item === 'object') {
            const { index, message } = item as { index?: unknown; message?: unknown }
            if (typeof index === 'number' && typeof message === 'string') out.push({ index, message })
        }
    }
    return out
}

type Orderable = {
    order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }>
}

async function readOrdered<T>(
    table: string,
    columns: string,
    fallback: string,
    orderBy: string,
    ascending: boolean,
    filter?: (query: unknown) => unknown
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => unknown } }
    let query = client.from(table).select(columns)
    if (filter) query = filter(query)
    const { data, error } = await (query as Orderable).order(orderBy, { ascending })
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

const eq = (column: string, value: string) => (q: unknown) =>
    (q as { eq: (c: string, v: string) => unknown }).eq(column, value)

const CLIENT_COLUMNS = 'id,client_name,status,created_at'
const INVOICE_COLUMNS =
    'id,client_id,invoice_number,status,supplier_state_code,place_of_supply_state_code,gst_rate_pct,reverse_charge,subtotal_paise,cgst_paise,sgst_paise,igst_paise,round_off_paise,total_paise,paid_paise,version,cancelled_reason,created_at'
const LINE_COLUMNS = 'id,invoice_id,line_no,description,quantity,rate_paise,amount_paise'
const PAYMENT_COLUMNS = 'id,invoice_id,amount_paise,method,reference,received_on,created_at'

export const agencyInvoicesApi = {
    listClients: () =>
        readOrdered<InvoiceClient>('agency_client_agreements', CLIENT_COLUMNS, 'Failed to load clients', 'created_at', false),

    listInvoices: () =>
        readOrdered<InvoiceRow>('agency_invoices', INVOICE_COLUMNS, 'Failed to load invoices', 'created_at', false),

    async getInvoiceDetail(invoiceId: string): Promise<InvoiceDetail> {
        const [lines, payments] = await Promise.all([
            readOrdered<InvoiceLineRow>(
                'agency_invoice_lines', LINE_COLUMNS, 'Failed to load invoice lines', 'line_no', true, eq('invoice_id', invoiceId)
            ),
            readOrdered<InvoicePaymentRow>(
                'agency_invoice_payments', PAYMENT_COLUMNS, 'Failed to load payments', 'created_at', false, eq('invoice_id', invoiceId)
            ),
        ])
        return { lines, payments }
    },

    async issueInvoice(input: IssueInput): Promise<IssueResult> {
        const fallback = 'Failed to issue invoice'
        const envelope = await callRpc(
            'agency_invoice_issue',
            {
                p_client_id: input.clientId,
                p_lines: input.lines.map((l) => ({
                    description: l.description,
                    quantity: l.quantity,
                    rate_paise: l.ratePaise,
                })),
                p_supplier_state: input.supplierState,
                p_place_of_supply_state: input.placeOfSupplyState,
                p_gst_rate_pct: input.gstRatePct,
                p_reverse_charge: input.reverseCharge,
                p_round_off: input.roundOff,
                p_idempotency_key: input.idempotencyKey,
            },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.invoice_id === 'string' && typeof envelope.invoice_number === 'string') {
                return {
                    ok: true,
                    invoiceId: envelope.invoice_id,
                    invoiceNumber: envelope.invoice_number,
                    replay: envelope.replay === true,
                }
            }
            throw new UserFacingError(fallback)
        }
        const code = pick(envelope.error, ISSUE_CODES)
        return {
            ok: false,
            error: code ?? 'unknown',
            message: code ? ISSUE_ERROR_MESSAGES[code] : fallback,
            problems: code === 'invalid_line' ? toProblems(envelope.problems) : [],
        }
    },

    async recordPayment(input: PaymentInput): Promise<PaymentResult> {
        const fallback = 'Failed to record payment'
        const envelope = await callRpc(
            'agency_invoice_record_payment',
            {
                p_invoice_id: input.invoiceId,
                p_amount_paise: input.amountPaise,
                p_method: input.method,
                p_reference: input.reference,
                p_received_on: input.receivedOn,
                p_expected_version: input.expectedVersion,
                p_idempotency_key: input.idempotencyKey,
            },
            fallback
        )
        if (envelope.ok === true) {
            const status = pick(envelope.status, STATUSES)
            if (typeof envelope.paid_paise === 'number' && typeof envelope.version === 'number' && status) {
                return { ok: true, paidPaise: envelope.paid_paise, status, version: envelope.version, replay: envelope.replay === true }
            }
            throw new UserFacingError(fallback)
        }
        const code = pick(envelope.error, PAYMENT_CODES)
        return {
            ok: false,
            error: code ?? 'unknown',
            message: code ? PAYMENT_ERROR_MESSAGES[code] : fallback,
            ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
            ...(typeof envelope.outstanding_paise === 'number' ? { outstandingPaise: envelope.outstanding_paise } : {}),
        }
    },

    async cancelInvoice(invoiceId: string, expectedVersion: number, reason: string): Promise<CancelResult> {
        const fallback = 'Failed to cancel invoice'
        const envelope = await callRpc(
            'agency_invoice_cancel',
            { p_invoice_id: invoiceId, p_expected_version: expectedVersion, p_reason: reason },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.version === 'number') return { ok: true, version: envelope.version }
            throw new UserFacingError(fallback)
        }
        const code = pick(envelope.error, CANCEL_CODES)
        return {
            ok: false,
            error: code ?? 'unknown',
            message: code ? CANCEL_ERROR_MESSAGES[code] : fallback,
            ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
        }
    },
}
