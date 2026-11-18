import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { throwIfSubscriptionError } from '../lib/subscriptionGuard'
import type { ProofEvent, ProofState } from '../lib/grLr'

/**
 * Agency consignments / GR-LR (TO-146): reads over RLS plus the SECURITY DEFINER
 * commands agency_consignment_create / agency_consignment_event /
 * agency_consignment_qr of 20261019000000_agency_consignments.sql.
 *
 * Result contract (same as agencyOrdersApi): a business refusal is a typed
 * RESULT, never an exception; controlled database exceptions surface an
 * approved plain message; anything else collapses to the caller's fallback.
 * supabase.rpc / supabase.from are always called as client methods.
 */

export type OrderStatus = 'draft' | 'planned' | 'cancelled'

export interface OrderRow {
    id: string
    agreement_id: string
    client_order_ref: string
    status: OrderStatus
    version: number
    created_at: string
}

export interface ConsignmentRow {
    id: string
    order_id: string
    gr_number: string
    status: ProofState
    version: number
    created_at: string
    updated_at: string
}

export interface ConsignmentEventRow {
    id: string
    consignment_id: string
    event: string
    from_status: string | null
    to_status: string
    note: string | null
    version_after: number | null
    created_at: string
}

export type ConsignmentErrorCode =
    | 'forbidden_scope'
    | 'key_too_long'
    | 'order_not_found'
    | 'order_cancelled'
    | 'consignment_exists'
    | 'idempotency_key_reused'
    | 'not_found'
    | 'unknown_event'
    | 'note_too_long'
    | 'version_conflict'
    | 'illegal_transition'
    | 'unknown'

export type CreateResult =
    | { ok: true; replay: boolean; consignmentId: string; grNumber: string; status: ProofState; version: number }
    | { ok: false; error: ConsignmentErrorCode; message: string }

export type EventResult =
    | { ok: true; replay: boolean; status: ProofState; version: number }
    | { ok: false; error: ConsignmentErrorCode; message: string; currentVersion?: number }

export type QrResult =
    | { ok: true; token: string }
    | { ok: false; error: ConsignmentErrorCode; message: string }

const ERROR_MESSAGES: Readonly<Record<Exclude<ConsignmentErrorCode, 'unknown'>, string>> = Object.freeze({
    forbidden_scope: 'Your role does not allow this action. Ask the agency owner for dispatcher access.',
    key_too_long: 'This request could not be sent. Reload the page and try again.',
    order_not_found: 'This order could not be found. Reload to continue.',
    order_cancelled: 'This order was cancelled, so a GR cannot be created for it.',
    consignment_exists: 'A GR already exists for this order. Reload to see it.',
    idempotency_key_reused: 'This request was already used for something else. Try the action again.',
    not_found: 'This consignment could not be found. Reload to continue.',
    unknown_event: 'This update is not recognised. Reload the page and try again.',
    note_too_long: 'The note is too long. Keep it under 500 characters.',
    version_conflict: 'This consignment changed. Reload to continue.',
    illegal_transition: 'That update is not allowed at this stage of the delivery.',
})

/** Controlled RAISE EXCEPTION texts; anything else is redacted to the fallback. */
const CONTROLLED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'Agency approval is required.',
    'Your access scope does not allow this action.',
    'No agency profile found for this account.',
    'Multiple agency profiles found for this account.',
    'Sign-in is required.',
    'Idempotency key is required.',
])

const KNOWN_CODES: ReadonlySet<string> = new Set(Object.keys(ERROR_MESSAGES))
const PROOF_STATES: ReadonlySet<string> = new Set(['created', 'picked_up', 'in_transit', 'delivered', 'receipt_confirmed', 'disputed'])

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
    'agency_consignment_create',
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

function errorCode(envelope: Envelope): ConsignmentErrorCode {
    const raw = envelope.error
    return typeof raw === 'string' && KNOWN_CODES.has(raw) ? (raw as ConsignmentErrorCode) : 'unknown'
}

function refusal(envelope: Envelope, fallback: string): { ok: false; error: ConsignmentErrorCode; message: string } {
    const code = errorCode(envelope)
    return { ok: false, error: code, message: code === 'unknown' ? fallback : ERROR_MESSAGES[code] }
}

type Orderable = { order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }> }

async function readOrdered<T>(
    table: string,
    columns: string,
    fallback: string,
    filter?: (query: unknown) => unknown,
    order: { column: string; ascending: boolean } = { column: 'created_at', ascending: false }
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => unknown } }
    let query = client.from(table).select(columns)
    if (filter) query = filter(query)
    const { data, error } = await (query as Orderable).order(order.column, { ascending: order.ascending })
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

/** Client and site labels for one order, joined client-side (flat reads only). */
export interface OrderRoute {
    orderId: string
    clientName: string | null
    pickupLabels: string[]
    dropLabels: string[]
}

interface AgreementName { id: string; client_name: string }
interface SiteLabel { id: string; label: string }
interface OrderLineSites { order_id: string; pickup_site_id: string | null; drop_site_id: string | null }
interface OrderClient { id: string; agreement_id: string }

const eq = (column: string, value: string) => (q: unknown) =>
    (q as { eq: (c: string, v: string) => unknown }).eq(column, value)

// qr_token is deliberately not selectable by clients; it is read only via agency_consignment_qr.
const ORDER_COLUMNS = 'id,agreement_id,client_order_ref,status,version,created_at'
const CONSIGNMENT_COLUMNS = 'id,order_id,gr_number,status,version,created_at,updated_at'
const EVENT_COLUMNS = 'id,consignment_id,event,from_status,to_status,note,version_after,created_at'
const ORDER_CLIENT_COLUMNS = 'id,agreement_id'
const AGREEMENT_NAME_COLUMNS = 'id,client_name'
const SITE_LABEL_COLUMNS = 'id,label'
const ORDER_LINE_SITE_COLUMNS = 'order_id,pickup_site_id,drop_site_id'

export const agencyConsignmentsApi = {
    listOrders: () => readOrdered<OrderRow>('agency_orders', ORDER_COLUMNS, 'Failed to load orders'),

    listConsignments: () =>
        readOrdered<ConsignmentRow>('agency_consignments', CONSIGNMENT_COLUMNS, 'Failed to load consignments'),

    listEvents: (consignmentId: string) =>
        readOrdered<ConsignmentEventRow>(
            'agency_consignment_events',
            EVENT_COLUMNS,
            'Failed to load delivery history',
            eq('consignment_id', consignmentId)
        ),

    /**
     * Client name and pickup / drop site labels per order. Five flat reads over RLS
     * (the same scopes as the orders list); the join happens here by id, never with
     * embedded selects. A site or agreement that cannot be read is simply left out.
     */
    async listOrderRoutes(): Promise<OrderRoute[]> {
        const [orders, agreements, sites, lines] = await Promise.all([
            readOrdered<OrderClient>('agency_orders', ORDER_CLIENT_COLUMNS, 'Failed to load routes'),
            readOrdered<AgreementName>('agency_client_agreements', AGREEMENT_NAME_COLUMNS, 'Failed to load routes'),
            readOrdered<SiteLabel>('agency_client_sites', SITE_LABEL_COLUMNS, 'Failed to load routes'),
            readOrdered<OrderLineSites>('agency_order_lines', ORDER_LINE_SITE_COLUMNS, 'Failed to load routes', undefined, {
                column: 'order_id',
                ascending: true,
            }),
        ])
        const clientName = new Map(agreements.map((a) => [a.id, a.client_name]))
        const siteLabel = new Map(sites.map((s) => [s.id, s.label]))
        const sitesByOrder = new Map<string, { pickup: Set<string>; drop: Set<string> }>()
        for (const line of lines) {
            let entry = sitesByOrder.get(line.order_id)
            if (!entry) {
                entry = { pickup: new Set<string>(), drop: new Set<string>() }
                sitesByOrder.set(line.order_id, entry)
            }
            const pickup = line.pickup_site_id ? siteLabel.get(line.pickup_site_id) : undefined
            const drop = line.drop_site_id ? siteLabel.get(line.drop_site_id) : undefined
            if (pickup) entry.pickup.add(pickup)
            if (drop) entry.drop.add(drop)
        }
        return orders.map((o) => {
            const entry = sitesByOrder.get(o.id)
            return {
                orderId: o.id,
                clientName: clientName.get(o.agreement_id) ?? null,
                pickupLabels: entry ? [...entry.pickup] : [],
                dropLabels: entry ? [...entry.drop] : [],
            }
        })
    },

    async createConsignment(orderId: string, idempotencyKey: string): Promise<CreateResult> {
        const fallback = 'Failed to create GR'
        const envelope = await callRpc(
            'agency_consignment_create',
            { p_order_id: orderId, p_idempotency_key: idempotencyKey },
            fallback
        )
        if (envelope.ok === true) {
            const { consignment_id: id, gr_number: gr, status, version } = envelope
            if (typeof id === 'string' && typeof gr === 'string' && typeof status === 'string' && PROOF_STATES.has(status) && typeof version === 'number') {
                return { ok: true, replay: envelope.replay === true, consignmentId: id, grNumber: gr, status: status as ProofState, version }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },

    async recordEvent(input: {
        consignmentId: string
        event: ProofEvent
        expectedVersion: number
        idempotencyKey: string
        note?: string | null
    }): Promise<EventResult> {
        const fallback = 'Failed to update the delivery'
        const envelope = await callRpc(
            'agency_consignment_event',
            {
                p_consignment_id: input.consignmentId,
                p_event: input.event,
                p_expected_version: input.expectedVersion,
                p_idempotency_key: input.idempotencyKey,
                p_note: input.note ?? null,
            },
            fallback
        )
        if (envelope.ok === true) {
            const { status, version } = envelope
            if (typeof status === 'string' && PROOF_STATES.has(status) && typeof version === 'number') {
                return { ok: true, replay: envelope.replay === true, status: status as ProofState, version }
            }
            throw new UserFacingError(fallback)
        }
        return {
            ...refusal(envelope, fallback),
            ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
        }
    },

    async getQrToken(consignmentId: string): Promise<QrResult> {
        const fallback = 'Failed to load the QR code'
        const envelope = await callRpc('agency_consignment_qr', { p_consignment_id: consignmentId }, fallback)
        if (envelope.ok === true) {
            if (typeof envelope.qr_token === 'string' && envelope.qr_token.length > 0) return { ok: true, token: envelope.qr_token }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },
}
