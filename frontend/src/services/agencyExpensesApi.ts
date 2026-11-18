import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'
import { throwIfSubscriptionError } from '../lib/subscriptionGuard'

/**
 * Agency expenses, fuel and maintenance (TO-149): reads over RLS and the five
 * SECURITY DEFINER commands of 20261022000000_agency_expenses.sql. The database
 * re-validates every value; this module only shapes calls and results.
 *
 * Result contract (same as agencyOrdersApi): a business refusal is a typed
 * RESULT, never an exception; controlled database exceptions surface an approved
 * plain message; anything else collapses to the caller's fallback.
 * supabase.rpc / supabase.from are always called as client methods.
 */

export const EXPENSE_CATEGORIES = ['fuel', 'toll', 'maintenance', 'driver_allowance', 'insurance', 'permit', 'other'] as const
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]

export interface TruckRow {
    id: string
    rc_number: string
    vehicle_type: string
}

export interface ExpenseRow {
    id: string
    truck_id: string | null
    category: ExpenseCategory
    amount_paise: number
    spent_on: string
    note: string | null
    created_at: string
}

export interface FuelFillRow {
    id: string
    truck_id: string
    odometer_km: number
    litres: number
    full_tank: boolean
    expense_id: string | null
    filled_on: string
    created_at: string
}

export interface MaintenanceItemRow {
    id: string
    truck_id: string
    name: string
    interval_km: number | null
    interval_days: number | null
    last_service_km: number | null
    last_service_on: string | null
    version: number
    created_at: string
}

export type ExpenseErrorCode =
    | 'forbidden_scope'
    | 'idempotency_key_required'
    | 'invalid_key'
    | 'idempotency_key_reused'
    | 'invalid_category'
    | 'invalid_amount'
    | 'future_date'
    | 'date_too_old'
    | 'note_too_long'
    | 'truck_required'
    | 'truck_not_found'
    | 'invalid_litres'
    | 'invalid_odometer'
    | 'odometer_not_increasing'
    | 'odometer_jump_too_large'
    | 'name_required'
    | 'name_too_long'
    | 'interval_required'
    | 'invalid_interval'
    | 'invalid_km'
    | 'name_exists'
    | 'item_not_found'
    | 'version_conflict'
    | 'km_going_backwards'
    | 'invalid_range'
    | 'range_too_large'
    | 'unknown'

export type Refusal = {
    ok: false
    error: ExpenseErrorCode
    message: string
    previousKm?: number
    currentVersion?: number
    lastServiceKm?: number
}

export type RecordExpenseResult = { ok: true; expenseId: string; replay: boolean } | Refusal
export type FuelFillResult = { ok: true; expenseId: string; fillId: string; replay: boolean } | Refusal
export type ItemUpsertResult = { ok: true; itemId: string; version: number } | Refusal
export type ServiceDoneResult = { ok: true; replay: boolean; expenseId: string | null; version: number | null } | Refusal

export interface SummaryResult {
    ok: true
    totalPaise: number
    byCategory: { category: string; totalPaise: number }[]
    byTruck: { truckId: string; totalPaise: number }[]
}

const STATIC_MESSAGES: Readonly<Record<Exclude<ExpenseErrorCode, 'unknown'>, string>> = Object.freeze({
    forbidden_scope: 'Only fleet managers and finance can record or change this. You can view it.',
    idempotency_key_required: 'This request could not be identified. Reload the page and try again.',
    invalid_key: 'This request could not be identified. Reload the page and try again.',
    idempotency_key_reused: 'This request was already used for different details. Check the form and save again.',
    invalid_category: 'Choose a valid category.',
    invalid_amount: 'Enter an amount above zero and up to 10,00,000 rupees.',
    future_date: 'The date cannot be in the future.',
    date_too_old: 'The date cannot be more than 5 years ago.',
    note_too_long: 'The note is too long. Keep it within 300 characters.',
    truck_required: 'Choose a truck for this category.',
    truck_not_found: 'That truck was not found. Reload and choose another.',
    invalid_litres: 'Litres must be between 1 and 1,000.',
    invalid_odometer: 'Enter a valid odometer reading in km.',
    odometer_not_increasing: 'The odometer must be higher than the last fill for this truck.',
    odometer_jump_too_large: 'The odometer is more than 5,000 km above the last fill. Check the reading.',
    name_required: 'Enter a name for the maintenance item.',
    name_too_long: 'The item name is too long. Keep it within 100 characters.',
    interval_required: 'Enter a service interval in km, days, or both.',
    invalid_interval: 'Intervals must be whole numbers above zero.',
    invalid_km: 'Enter a valid km reading.',
    name_exists: 'This truck already has an item with that name.',
    item_not_found: 'This maintenance item was not found. Reload to continue.',
    version_conflict: 'This item changed. Reload to continue.',
    km_going_backwards: 'The service km cannot be lower than the last recorded service.',
    invalid_range: 'The start date must be on or before the end date.',
    range_too_large: 'Choose a period of at most 366 days.',
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
    'agency_expense_record',
    'agency_fuel_fill_record',
    'agency_maintenance_item_upsert',
    'agency_maintenance_service_done',
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

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const km = (v: number) => v.toLocaleString('en-IN')

function refusal(envelope: Envelope, fallback: string): Refusal {
    const raw = envelope.error
    const code: ExpenseErrorCode =
        typeof raw === 'string' && Object.prototype.hasOwnProperty.call(STATIC_MESSAGES, raw) ? (raw as ExpenseErrorCode) : 'unknown'
    const previousKm = num(envelope.previous_km)
    const currentVersion = num(envelope.current_version)
    const lastServiceKm = num(envelope.last_service_km)
    let message = code === 'unknown' ? fallback : STATIC_MESSAGES[code]
    if (code === 'odometer_not_increasing' && previousKm !== undefined) {
        message = `The odometer must be higher than the last fill (${km(previousKm)} km).`
    }
    if (code === 'odometer_jump_too_large' && previousKm !== undefined) {
        message = `The odometer is more than 5,000 km above the last fill (${km(previousKm)} km). Check the reading.`
    }
    if (code === 'km_going_backwards' && lastServiceKm !== undefined) {
        message = `The service km cannot be lower than the last recorded service (${km(lastServiceKm)} km).`
    }
    return {
        ok: false,
        error: code,
        message,
        ...(previousKm !== undefined ? { previousKm } : {}),
        ...(currentVersion !== undefined ? { currentVersion } : {}),
        ...(lastServiceKm !== undefined ? { lastServiceKm } : {}),
    }
}

type Chain = {
    gte?: (c: string, v: string) => Chain
    lte?: (c: string, v: string) => Chain
    order: (col: string, opts: { ascending: boolean }) => Promise<{ data: unknown; error: unknown }>
}

async function readOrdered<T>(
    table: string,
    columns: string,
    fallback: string,
    orderBy: { column: string; ascending: boolean },
    filter?: (query: Chain) => Chain
): Promise<T[]> {
    const client = supabase as unknown as { from: (name: string) => { select: (cols: string) => unknown } }
    let query = client.from(table).select(columns) as Chain
    if (filter) query = filter(query)
    const { data, error } = await query.order(orderBy.column, { ascending: orderBy.ascending })
    if (error) throw new UserFacingError(fallback)
    return (data ?? []) as T[]
}

// Methods are called on the query object (never detached) so `this` is kept.
const inRange = (column: string, from: string, to: string) => (q: Chain) => q.gte!(column, from).lte!(column, to)

const toNumber = (v: unknown): number => (typeof v === 'number' ? v : Number(v))

export const agencyExpensesApi = {
    listTrucks: () =>
        readOrdered<TruckRow>('agency_trucks', 'id,rc_number,vehicle_type', 'Failed to load trucks', { column: 'rc_number', ascending: true }),

    listExpenses: (from: string, to: string) =>
        readOrdered<ExpenseRow>(
            'agency_expenses',
            'id,truck_id,category,amount_paise,spent_on,note,created_at',
            'Failed to load expenses',
            { column: 'spent_on', ascending: false },
            inRange('spent_on', from, to)
        ).then((rows) => rows.map((r) => ({ ...r, amount_paise: toNumber(r.amount_paise) }))),

    listFuelFills: () =>
        readOrdered<FuelFillRow>(
            'agency_fuel_fills',
            'id,truck_id,odometer_km,litres,full_tank,expense_id,filled_on,created_at',
            'Failed to load fuel fills',
            { column: 'odometer_km', ascending: true }
        ).then((rows) => rows.map((r) => ({ ...r, odometer_km: toNumber(r.odometer_km), litres: toNumber(r.litres) }))),

    listMaintenanceItems: () =>
        readOrdered<MaintenanceItemRow>(
            'agency_maintenance_items',
            'id,truck_id,name,interval_km,interval_days,last_service_km,last_service_on,version,created_at',
            'Failed to load maintenance items',
            { column: 'name', ascending: true }
        ).then((rows) => rows.map((r) => ({ ...r, last_service_km: r.last_service_km === null ? null : toNumber(r.last_service_km) }))),

    async recordExpense(input: {
        truckId: string | null
        category: ExpenseCategory
        amountPaise: number
        spentOn: string
        note: string
        idempotencyKey: string
    }): Promise<RecordExpenseResult> {
        const fallback = 'Failed to save expense'
        const envelope = await callRpc(
            'agency_expense_record',
            {
                p_truck_id: input.truckId,
                p_category: input.category,
                p_amount_paise: input.amountPaise,
                p_spent_on: input.spentOn,
                p_note: input.note.trim() === '' ? null : input.note.trim(),
                p_idempotency_key: input.idempotencyKey,
            },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.expense_id === 'string') {
                return { ok: true, expenseId: envelope.expense_id, replay: envelope.replay === true }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },

    async recordFuelFill(input: {
        truckId: string
        odometerKm: number
        litres: number
        fullTank: boolean
        amountPaise: number
        filledOn: string
        idempotencyKey: string
    }): Promise<FuelFillResult> {
        const fallback = 'Failed to save fuel fill'
        const envelope = await callRpc(
            'agency_fuel_fill_record',
            {
                p_truck_id: input.truckId,
                p_odometer_km: input.odometerKm,
                p_litres: input.litres,
                p_full_tank: input.fullTank,
                p_amount_paise: input.amountPaise,
                p_filled_on: input.filledOn,
                p_idempotency_key: input.idempotencyKey,
            },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.expense_id === 'string' && typeof envelope.fill_id === 'string') {
                return { ok: true, expenseId: envelope.expense_id, fillId: envelope.fill_id, replay: envelope.replay === true }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },

    async upsertMaintenanceItem(input: {
        truckId: string
        name: string
        intervalKm: number | null
        intervalDays: number | null
        lastServiceKm: number | null
        lastServiceOn: string | null
        expectedVersion: number | null
    }): Promise<ItemUpsertResult> {
        const fallback = 'Failed to save maintenance item'
        const envelope = await callRpc(
            'agency_maintenance_item_upsert',
            {
                p_truck_id: input.truckId,
                p_name: input.name,
                p_interval_km: input.intervalKm,
                p_interval_days: input.intervalDays,
                p_last_service_km: input.lastServiceKm,
                p_last_service_on: input.lastServiceOn,
                p_expected_version: input.expectedVersion,
            },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.item_id === 'string' && typeof envelope.version === 'number') {
                return { ok: true, itemId: envelope.item_id, version: envelope.version }
            }
            throw new UserFacingError(fallback)
        }
        return refusal(envelope, fallback)
    },

    async markServiceDone(input: {
        itemId: string
        serviceKm: number
        serviceOn: string
        expectedVersion: number
        costPaise: number
        idempotencyKey: string
    }): Promise<ServiceDoneResult> {
        const fallback = 'Failed to record service'
        const envelope = await callRpc(
            'agency_maintenance_service_done',
            {
                p_item_id: input.itemId,
                p_service_km: input.serviceKm,
                p_service_on: input.serviceOn,
                p_expected_version: input.expectedVersion,
                p_cost_paise: input.costPaise,
                p_idempotency_key: input.idempotencyKey,
            },
            fallback
        )
        if (envelope.ok === true) {
            return {
                ok: true,
                replay: envelope.replay === true,
                expenseId: typeof envelope.expense_id === 'string' ? envelope.expense_id : null,
                version: num(envelope.version) ?? null,
            }
        }
        return refusal(envelope, fallback)
    },

    async expenseSummary(from: string, to: string): Promise<SummaryResult | Refusal> {
        const fallback = 'Failed to load the summary'
        const envelope = await callRpc('agency_expense_summary', { p_from: from, p_to: to }, fallback)
        if (envelope.ok !== true) return refusal(envelope, fallback)
        const byCategory: SummaryResult['byCategory'] = []
        for (const item of Array.isArray(envelope.by_category) ? envelope.by_category : []) {
            const { category, total_paise } = (item ?? {}) as { category?: unknown; total_paise?: unknown }
            if (typeof category === 'string' && num(total_paise) !== undefined) byCategory.push({ category, totalPaise: total_paise as number })
        }
        const byTruck: SummaryResult['byTruck'] = []
        for (const item of Array.isArray(envelope.by_truck) ? envelope.by_truck : []) {
            const { truck_id, total_paise } = (item ?? {}) as { truck_id?: unknown; total_paise?: unknown }
            if (typeof truck_id === 'string' && num(total_paise) !== undefined) byTruck.push({ truckId: truck_id, totalPaise: total_paise as number })
        }
        const totalPaise = num(envelope.total_paise)
        if (totalPaise === undefined) throw new UserFacingError(fallback)
        return { ok: true, totalPaise, byCategory, byTruck }
    },
}
