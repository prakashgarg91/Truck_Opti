import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { throwIfSubscriptionError } from '../lib/subscriptionGuard'

/**
 * Agency load plans (TO-145 slice 3): reads over RLS plus the SECURITY DEFINER commands
 * agency_load_plan_save / agency_load_plan_approve / agency_load_plan_cancel of
 * 20261025000000_agency_load_plans.sql. The planning maths runs on the client
 * (lib/loadPlanner.ts); the server re-validates and stores.
 *
 * Result contract (same as agencyConsignmentsApi): a business refusal is a typed RESULT, never an
 * exception; controlled database exceptions surface an approved plain message; anything else
 * collapses to the caller's fallback. supabase.rpc / supabase.from are always called as client methods.
 */

export type PlanStatus = 'draft' | 'approved' | 'superseded' | 'cancelled'
export type UnmetReasonCode = 'too_heavy' | 'no_truck'

export interface DraftOrderRow {
    id: string
    client_order_ref: string
    status: string
    version: number
    created_at: string
}

export interface OrderLineRow {
    id: string
    order_id: string
    line_no: number
    sku: string
    description: string | null
    quantity: number
    unit: string
    weight_per_unit_kg: number | null
    pickup_site_id: string | null
    drop_site_id: string | null
    pickup_to: string | null
    stackable: boolean
    fragile: boolean
}

export interface TruckRow {
    id: string
    vehicle_type: string
    rc_number: string
    payload_kg: number | null
    is_available: boolean | null
    maintenance_blocked: boolean
}

export interface PlanRow {
    id: string
    name: string
    status: PlanStatus
    plan_version: number
    version: number
    approved_at: string | null
    created_at: string
}

export interface PlanLoadRow {
    id: string
    plan_id: string
    truck_id: string
    total_kg: number
    utilization_pct: number
}

export interface PlanLineRow {
    id: string
    load_id: string
    plan_id: string
    order_line_id: string
    quantity: number
}

export interface PlanUnmetRow {
    id: string
    plan_id: string
    order_line_id: string
    reason: UnmetReasonCode
}

export interface PlanDetail {
    loads: PlanLoadRow[]
    lines: PlanLineRow[]
    unmet: PlanUnmetRow[]
}

export type LoadPlanErrorCode =
    | 'forbidden_scope'
    | 'idempotency_key_required'
    | 'key_too_long'
    | 'invalid_name'
    | 'invalid_payload'
    | 'invalid_unmet'
    | 'too_large'
    | 'idempotency_key_reused'
    | 'batch_not_found'
    | 'truck_used_twice'
    | 'truck_not_found'
    | 'order_line_not_found'
    | 'order_cancelled'
    | 'line_allocated_twice'
    | 'line_allocated_and_unmet'
    | 'over_allocated'
    | 'weight_missing'
    | 'over_capacity'
    | 'concurrent_conflict'
    | 'not_found'
    | 'illegal_transition'
    | 'version_conflict'
    | 'empty_plan'
    | 'stale_plan'
    | 'line_already_planned'
    | 'has_consignments'
    | 'unknown'

/** One entry of the server's `problems` array (indexes are zero based, as sent). */
export interface PlanProblem {
    code: string
    index?: number
    lineIndex?: number
    loadIndex?: number
    unmetIndex?: number
    orderLineId?: string
    truckId?: string
    totalKg?: number
    payloadKg?: number
}

export interface PlanRefusal {
    ok: false
    error: LoadPlanErrorCode
    message: string
    problems: PlanProblem[]
    /** Offending order lines of stale_plan / line_already_planned. */
    orderLineIds: string[]
    currentVersion?: number
}

export interface SaveLoadInput {
    truckId: string
    lines: { orderLineId: string; quantity: number }[]
}

export interface SaveUnmetInput {
    orderLineId: string
    reason: UnmetReasonCode
}

export type SaveResult =
    | { ok: true; replay: boolean; planId: string; planVersion: number; status: PlanStatus; version: number }
    | PlanRefusal

export type TransitionResult = { ok: true; state: PlanStatus; version: number } | PlanRefusal

const ERROR_MESSAGES: Readonly<Record<Exclude<LoadPlanErrorCode, 'unknown'>, string>> = Object.freeze({
    forbidden_scope: 'Your role does not allow this action. Ask the agency owner for dispatcher access.',
    idempotency_key_required: 'This request could not be sent. Reload the page and try again.',
    key_too_long: 'This request could not be sent. Reload the page and try again.',
    invalid_name: 'Give the plan a name of 1 to 80 characters.',
    invalid_payload: 'The plan has a load without a truck or lines. Propose the plan again.',
    invalid_unmet: 'The list of unplaced lines is not valid. Propose the plan again.',
    too_large: 'This plan is too large to save. Plan fewer orders at a time.',
    idempotency_key_reused: 'This request was already used for something else. Try the action again.',
    batch_not_found: 'The order batch could not be found. Reload to continue.',
    truck_used_twice: 'A truck is used in more than one load. Propose the plan again.',
    truck_not_found: 'A truck in this plan could not be found or is blocked for maintenance. Reload and propose again.',
    order_line_not_found: 'An order line in this plan could not be found. Reload and propose again.',
    order_cancelled: 'An order in this plan was cancelled. Reload and propose again.',
    line_allocated_twice: 'An order line is placed on more than one load. Propose the plan again.',
    line_allocated_and_unmet: 'An order line is both placed on a load and listed as unplaced. Propose the plan again.',
    over_allocated: 'A line carries more than its order quantity. Reload and propose again.',
    weight_missing: 'A line has no weight, so it cannot be planned. Add a weight per unit to the order line.',
    over_capacity: 'A load is heavier than its truck can carry. Reload and propose again.',
    concurrent_conflict: 'Someone else changed the plans at the same moment. Reload and try again.',
    not_found: 'This plan could not be found. Reload to continue.',
    illegal_transition: 'That change is not allowed for a plan in this state. Reload to continue.',
    version_conflict: 'This plan changed. Reload to continue.',
    empty_plan: 'This plan has no loads, so it cannot be approved.',
    stale_plan: 'Orders or trucks changed since this plan was saved. Propose the plan again.',
    line_already_planned: 'Some order lines already sit in another approved plan. Cancel that plan first.',
    has_consignments: 'A GR was already created for an order in this plan, so it cannot be cancelled.',
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
const PLAN_STATUSES: ReadonlySet<string> = new Set(['draft', 'approved', 'superseded', 'cancelled'])

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
    'agency_load_plan_save',
    'agency_load_plan_approve',
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

function errorCode(envelope: Envelope): LoadPlanErrorCode {
    const raw = envelope.error
    return typeof raw === 'string' && KNOWN_CODES.has(raw) ? (raw as LoadPlanErrorCode) : 'unknown'
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

function parseProblems(raw: unknown): PlanProblem[] {
    if (!Array.isArray(raw)) return []
    const out: PlanProblem[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue
        const p = item as Record<string, unknown>
        const code = str(p.code)
        if (!code) continue
        out.push({
            code,
            index: num(p.index),
            lineIndex: num(p.line_index),
            loadIndex: num(p.load_index),
            unmetIndex: num(p.unmet_index),
            orderLineId: str(p.order_line_id),
            truckId: str(p.truck_id),
            totalKg: num(p.total_kg),
            payloadKg: num(p.payload_kg),
        })
    }
    return out
}

function parseIds(raw: unknown): string[] {
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
}

function refusal(envelope: Envelope, fallback: string): PlanRefusal {
    const code = errorCode(envelope)
    const currentVersion = num(envelope.current_version)
    return {
        ok: false,
        error: code,
        message: code === 'unknown' ? fallback : ERROR_MESSAGES[code],
        problems: parseProblems(envelope.problems),
        orderLineIds: parseIds(envelope.order_line_ids),
        ...(currentVersion !== undefined ? { currentVersion } : {}),
    }
}

const kg = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`

/** Plain-language sentence for one server problem; positions are shown 1-based. */
export function describeProblem(p: PlanProblem): string {
    const load = p.loadIndex ?? p.index
    const where = (() => {
        if (p.unmetIndex !== undefined) return `Unplaced line ${p.unmetIndex + 1}`
        if (p.loadIndex !== undefined && p.index !== undefined) return `Load ${p.loadIndex + 1}, line ${p.index + 1}`
        return null
    })()
    const loadLabel = load !== undefined ? `Load ${load + 1}` : 'A load'
    switch (p.code) {
        case 'invalid_payload':
            return p.lineIndex !== undefined && p.index !== undefined
                ? `Load ${p.index + 1}, line ${p.lineIndex + 1}: each line needs an order line and a quantity above zero.`
                : `${loadLabel}: each load needs a truck and at least one line.`
        case 'invalid_unmet':
            return 'An unplaced line is missing its reason or is listed twice.'
        case 'truck_used_twice':
            return `${loadLabel} reuses a truck that already has a load in this plan.`
        case 'truck_not_found':
            return `${loadLabel}: the truck could not be found or is blocked for maintenance.`
        case 'truck_unavailable':
            return 'A truck in this plan is now blocked for maintenance.'
        case 'order_line_not_found':
            return `${where ?? 'A line'}: this order line could not be found.`
        case 'order_cancelled':
            return `${where ?? 'A line'}: its order was cancelled.`
        case 'line_allocated_twice':
            return `${where ?? 'A line'}: this line is already placed on an earlier load.`
        case 'line_allocated_and_unmet':
            return `${where ?? 'A line'}: this line is placed on a load and also listed as unplaced.`
        case 'over_allocated':
            return `${where ?? 'A line'}: this load carries more than the order quantity.`
        case 'weight_missing':
            return `${where ?? 'A line'}: no weight is known, so it cannot be planned.`
        case 'over_capacity':
            return p.totalKg !== undefined && p.payloadKg !== undefined
                ? `${loadLabel} is over capacity: ${kg(p.totalKg)} on a truck that carries ${kg(p.payloadKg)}.`
                : `${loadLabel} is over capacity.`
        default:
            return 'This plan has a problem. Propose the plan again.'
    }
}

type Query = PromiseLike<{ data: unknown; error: unknown }> & {
    eq: (column: string, value: string) => Query
    in: (column: string, values: string[]) => Query
    order: (column: string, opts: { ascending: boolean }) => Query
}

async function read<T>(
    table: string,
    columns: string,
    fallback: string,
    build: (query: Query) => Query = (q) => q
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => Query } }
    const { data, error } = await build(client.from(table).select(columns))
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

const ORDER_COLUMNS = 'id,client_order_ref,status,version,created_at'
const LINE_COLUMNS =
    'id,order_id,line_no,sku,description,quantity,unit,weight_per_unit_kg,pickup_site_id,drop_site_id,pickup_to,stackable,fragile'
const TRUCK_COLUMNS = 'id,vehicle_type,rc_number,payload_kg,is_available,maintenance_blocked'
const PLAN_COLUMNS = 'id,name,status,plan_version,version,approved_at,created_at'
const PLAN_LOAD_COLUMNS = 'id,plan_id,truck_id,total_kg,utilization_pct'
const PLAN_LINE_COLUMNS = 'id,load_id,plan_id,order_line_id,quantity'
const PLAN_UNMET_COLUMNS = 'id,plan_id,order_line_id,reason'

const toNumber = (v: unknown): number => (typeof v === 'number' ? v : Number(v))

function transition(envelope: Envelope, fallback: string, expected: PlanStatus): TransitionResult {
    if (envelope.ok === true) {
        const { state, version } = envelope
        if (state === expected && typeof version === 'number') return { ok: true, state: expected, version }
        throw new UserFacingError(fallback)
    }
    return refusal(envelope, fallback)
}

export const agencyLoadPlansApi = {
    listDraftOrders: () =>
        read<DraftOrderRow>('agency_orders', ORDER_COLUMNS, 'Failed to load orders', (q) =>
            q.eq('status', 'draft').order('created_at', { ascending: false })
        ),

    async listOrderLines(orderIds: string[]): Promise<OrderLineRow[]> {
        if (orderIds.length === 0) return []
        const rows = await read<OrderLineRow>('agency_order_lines', LINE_COLUMNS, 'Failed to load order lines', (q) =>
            q.in('order_id', orderIds).order('line_no', { ascending: true })
        )
        // NUMERIC columns can arrive as strings; normalise so callers always get numbers.
        return rows.map((r) => ({
            ...r,
            quantity: toNumber(r.quantity),
            weight_per_unit_kg: r.weight_per_unit_kg === null ? null : toNumber(r.weight_per_unit_kg),
        }))
    },

    async listTrucks(): Promise<TruckRow[]> {
        const rows = await read<TruckRow>('agency_trucks', TRUCK_COLUMNS, 'Failed to load trucks', (q) =>
            q.order('created_at', { ascending: false })
        )
        return rows.map((r) => ({ ...r, payload_kg: r.payload_kg === null ? null : toNumber(r.payload_kg) }))
    },

    listPlans: () =>
        read<PlanRow>('agency_load_plans', PLAN_COLUMNS, 'Failed to load plans', (q) =>
            q.order('created_at', { ascending: false })
        ),

    async getPlanDetail(planId: string): Promise<PlanDetail> {
        const [loads, lines, unmet] = await Promise.all([
            read<PlanLoadRow>('agency_load_plan_loads', PLAN_LOAD_COLUMNS, 'Failed to load plan details', (q) =>
                q.eq('plan_id', planId)
            ),
            read<PlanLineRow>('agency_load_plan_lines', PLAN_LINE_COLUMNS, 'Failed to load plan details', (q) =>
                q.eq('plan_id', planId)
            ),
            read<PlanUnmetRow>('agency_load_plan_unmet', PLAN_UNMET_COLUMNS, 'Failed to load plan details', (q) =>
                q.eq('plan_id', planId)
            ),
        ])
        return {
            loads: loads.map((l) => ({ ...l, total_kg: toNumber(l.total_kg), utilization_pct: toNumber(l.utilization_pct) })),
            lines: lines.map((l) => ({ ...l, quantity: toNumber(l.quantity) })),
            unmet,
        }
    },

    async savePlan(input: {
        name: string
        loads: SaveLoadInput[]
        unmet: SaveUnmetInput[]
        idempotencyKey: string
        batchId?: string | null
    }): Promise<SaveResult> {
        const fallback = 'Failed to save the plan'
        const envelope = await callRpc(
            'agency_load_plan_save',
            {
                p_name: input.name,
                p_batch_id: input.batchId ?? null,
                p_loads: input.loads.map((l) => ({
                    truck_id: l.truckId,
                    lines: l.lines.map((n) => ({ order_line_id: n.orderLineId, quantity: n.quantity })),
                })),
                p_unmet: input.unmet.map((u) => ({ order_line_id: u.orderLineId, reason: u.reason })),
                p_idempotency_key: input.idempotencyKey,
            },
            fallback
        )
        if (envelope.ok === true) {
            const { plan_id: id, plan_version: planVersion, status, version } = envelope
            if (
                typeof id === 'string' &&
                typeof planVersion === 'number' &&
                typeof status === 'string' &&
                PLAN_STATUSES.has(status) &&
                typeof version === 'number'
            ) {
                return { ok: true, replay: envelope.replay === true, planId: id, planVersion, status: status as PlanStatus, version }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },

    async approvePlan(planId: string, expectedVersion: number): Promise<TransitionResult> {
        const fallback = 'Failed to approve the plan'
        const envelope = await callRpc(
            'agency_load_plan_approve',
            { p_plan_id: planId, p_expected_version: expectedVersion },
            fallback
        )
        return transition(envelope, fallback, 'approved')
    },

    async cancelPlan(planId: string, expectedVersion: number): Promise<TransitionResult> {
        const fallback = 'Failed to cancel the plan'
        const envelope = await callRpc(
            'agency_load_plan_cancel',
            { p_plan_id: planId, p_expected_version: expectedVersion },
            fallback
        )
        return transition(envelope, fallback, 'cancelled')
    },
}
