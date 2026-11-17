import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { throwIfSubscriptionError } from '../lib/subscriptionGuard'
import type { ImportLinePayload } from '../lib/orderImportPayload'

/**
 * Agency sales-order import (TO-145): reads over RLS and the two SECURITY
 * DEFINER commands agency_order_import / agency_order_cancel of
 * 20261018000000_agency_orders.sql. The database re-validates every line; this
 * module only shapes calls and results.
 *
 * Result contract (same as agencyOrganizationApi): a business refusal is a
 * typed RESULT, never an exception; controlled database exceptions surface an
 * approved plain message; anything else collapses to the caller's fallback.
 * supabase.rpc / supabase.from are always called as client methods.
 */

export interface ClientSite {
    id: string
    agreement_id: string
    site_kind: 'bill_to' | 'ship_to'
    label: string
    status: string
}

export interface ClientAgreementWithSites {
    id: string
    client_name: string
    status: string
    sites: ClientSite[]
}

export interface OrderBatchRow {
    id: string
    agreement_id: string
    file_hash: string
    row_count: number
    created_at: string
}

export type OrderStatus = 'draft' | 'planned' | 'cancelled'

export interface OrderRow {
    id: string
    agreement_id: string
    batch_id: string | null
    client_order_ref: string
    status: OrderStatus
    version: number
    created_at: string
    updated_at: string
}

export interface LineProblem {
    index: number
    message: string
}

type SimpleErrorCode =
    | 'idempotency_key_reused'
    | 'agreement_not_active'
    | 'version_conflict'
    | 'order_not_draft'
    | 'order_in_approved_plan'
    | 'unknown'

export type OrderErrorCode = 'invalid_lines' | 'order_exists' | SimpleErrorCode

export type ImportState = 'created' | 'duplicate_batch' | 'idempotent_replay'

export type ImportResult =
    | { ok: true; state: ImportState; batchId: string; ordersCreated: number | null; linesCreated: number | null }
    | { ok: false; error: 'invalid_lines'; message: string; problems: LineProblem[] }
    | { ok: false; error: 'order_exists'; message: string; refs: string[] }
    | { ok: false; error: SimpleErrorCode; message: string }

export type CancelResult =
    | { ok: true; state: 'cancelled' | 'unchanged'; version: number }
    | { ok: false; error: SimpleErrorCode; message: string; currentVersion?: number }

const ERROR_MESSAGES: Readonly<Record<Exclude<OrderErrorCode, 'unknown'>, string>> = Object.freeze({
    invalid_lines: 'Some lines were rejected by the server. Fix them and upload the file again. Nothing was imported.',
    order_exists: 'Some order references already exist for this client. Nothing was imported.',
    idempotency_key_reused: 'This request was already used for a different file. Choose the file again.',
    agreement_not_active: 'This client agreement is not active. Reactivate it before importing orders.',
    version_conflict: 'This order changed. Reload to continue.',
    order_not_draft: 'Only draft orders can be cancelled. An order that is already planned or cancelled stays as it is.',
    order_in_approved_plan: 'This order is in an approved load plan. Cancel the plan first.',
})

/** Controlled RAISE EXCEPTION texts; anything else is redacted to the fallback. */
const CONTROLLED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'Agency approval is required.',
    'Your access scope does not allow this action.',
    'No agency profile found for this account.',
    'Multiple agency profiles found for this account.',
    'Sign-in is required.',
    'Idempotency key is required.',
    'File hash is required.',
    'No order lines to import.',
    'Too many lines in one import (maximum 2000).',
    'Client agreement not found or access denied.',
    'Order not found or access denied.',
])

interface Envelope {
    ok?: unknown
    state?: unknown
    error?: unknown
    [key: string]: unknown
}

type RpcClient = {
    rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: unknown } | null }>
}

async function callRpc(name: string, args: Record<string, unknown>, fallback: string): Promise<Envelope> {
    // Call as a method: the client's rpc() relies on `this`; a detached call crashes.
    const client = supabase as unknown as RpcClient
    const { data, error } = await client.rpc(name, args)
    if (error) {
        throwIfSubscriptionError(error)
        const message = error.message
        throw new UserFacingError(typeof message === 'string' && CONTROLLED_EXCEPTIONS.has(message) ? message : fallback)
    }
    const envelope = (Array.isArray(data) ? data[0] : data) as Envelope | null | undefined
    if (!envelope || typeof envelope.ok !== 'boolean') throw new UserFacingError(fallback)
    return envelope
}

function simpleCode(envelope: Envelope): SimpleErrorCode {
    const raw = envelope.error
    if (
        raw === 'idempotency_key_reused' ||
        raw === 'agreement_not_active' ||
        raw === 'version_conflict' ||
        raw === 'order_not_draft' ||
        raw === 'order_in_approved_plan'
    ) {
        return raw
    }
    return 'unknown'
}

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

type Orderable = { order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> }

async function readOrdered<T>(
    table: string,
    columns: string,
    fallback: string,
    filter?: (query: unknown) => unknown
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => unknown } }
    let query = client.from(table).select(columns)
    if (filter) query = filter(query)
    const { data, error } = await (query as Orderable).order('created_at', { ascending: false })
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

const eq = (column: string, value: string) => (q: unknown) =>
    (q as { eq: (c: string, v: string) => unknown }).eq(column, value)

const AGREEMENT_COLUMNS = 'id,client_name,status,created_at'
const SITE_COLUMNS = 'id,agreement_id,site_kind,label,status,created_at'
const BATCH_COLUMNS = 'id,agreement_id,file_hash,row_count,created_at'
const ORDER_COLUMNS = 'id,agreement_id,batch_id,client_order_ref,status,version,created_at,updated_at'

export const agencyOrdersApi = {
    /** Client agreements with their sites, for the import picker. */
    async listAgreementsWithSites(): Promise<ClientAgreementWithSites[]> {
        const [agreements, sites] = await Promise.all([
            readOrdered<{ id: string; client_name: string; status: string }>(
                'agency_client_agreements',
                AGREEMENT_COLUMNS,
                'Failed to load client agreements'
            ),
            readOrdered<ClientSite>('agency_client_sites', SITE_COLUMNS, 'Failed to load client sites'),
        ])
        return agreements.map((a) => ({
            id: a.id,
            client_name: a.client_name,
            status: a.status,
            sites: sites.filter((s) => s.agreement_id === a.id),
        }))
    },

    listBatches: (agreementId: string) =>
        readOrdered<OrderBatchRow>('agency_order_batches', BATCH_COLUMNS, 'Failed to load imports', eq('agreement_id', agreementId)),

    listOrders: (agreementId: string) =>
        readOrdered<OrderRow>('agency_orders', ORDER_COLUMNS, 'Failed to load orders', eq('agreement_id', agreementId)),

    async importOrders(input: {
        agreementId: string
        fileHash: string
        idempotencyKey: string
        lines: ImportLinePayload[]
    }): Promise<ImportResult> {
        const fallback = 'Failed to import orders'
        const envelope = await callRpc(
            'agency_order_import',
            {
                p_agreement_id: input.agreementId,
                p_file_hash: input.fileHash,
                p_idempotency_key: input.idempotencyKey,
                p_lines: input.lines,
            },
            fallback
        )

        if (envelope.ok === true) {
            const state = envelope.state
            const batchId = envelope.batch_id
            if ((state === 'created' || state === 'duplicate_batch' || state === 'idempotent_replay') && typeof batchId === 'string') {
                return {
                    ok: true,
                    state,
                    batchId,
                    ordersCreated: typeof envelope.orders_created === 'number' ? envelope.orders_created : null,
                    linesCreated: typeof envelope.lines_created === 'number' ? envelope.lines_created : null,
                }
            }
            throw new UserFacingError(fallback)
        }

        if (envelope.error === 'invalid_lines') {
            return { ok: false, error: 'invalid_lines', message: ERROR_MESSAGES.invalid_lines, problems: toProblems(envelope.problems) }
        }
        if (envelope.error === 'order_exists') {
            const refs = Array.isArray(envelope.refs) ? envelope.refs.filter((r): r is string => typeof r === 'string') : []
            return { ok: false, error: 'order_exists', message: ERROR_MESSAGES.order_exists, refs }
        }
        const code = simpleCode(envelope)
        return { ok: false, error: code, message: code === 'unknown' ? fallback : ERROR_MESSAGES[code] }
    },

    async cancelOrder(orderId: string, expectedVersion: number): Promise<CancelResult> {
        const fallback = 'Failed to cancel order'
        const envelope = await callRpc(
            'agency_order_cancel',
            { p_order_id: orderId, p_expected_version: expectedVersion },
            fallback
        )
        if (envelope.ok === true) {
            if ((envelope.state === 'cancelled' || envelope.state === 'unchanged') && typeof envelope.version === 'number') {
                return { ok: true, state: envelope.state, version: envelope.version }
            }
            throw new UserFacingError(fallback)
        }
        const code = simpleCode(envelope)
        return {
            ok: false,
            error: code,
            message: code === 'unknown' ? fallback : ERROR_MESSAGES[code],
            ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
        }
    },
}
