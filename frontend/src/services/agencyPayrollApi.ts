import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

/**
 * Agency driver payroll (TO-150, ACCOUNTING ONLY): reads over RLS and the four
 * SECURITY DEFINER commands agency_driver_rate_set / agency_payroll_open_period /
 * agency_payroll_adjust / agency_payroll_close_period of 20261023000000_agency_payroll.sql.
 * No money moves through the platform; the server computes every closed line.
 *
 * Result contract (same as agencyInvoicesApi): a business refusal is a typed
 * RESULT, never an exception; controlled database exceptions surface an approved
 * plain message; anything else collapses to the caller's fallback.
 */

export interface DriverRateRow {
    driver_id: string
    base_paise: number
    per_km_paise: number
    per_tonne_paise: number
    version: number
    updated_at: string
}

export interface EmployedDriver {
    driver_id: string
    status: string
    contact_phone: string | null
}

export interface DriverDirectoryEntry {
    driver_id: string
    name: string
    phone_last4: string | null
}

export type PeriodStatus = 'open' | 'closed'

export interface PayrollPeriodRow {
    id: string
    period_start: string
    period_end: string
    status: PeriodStatus
    closed_at: string | null
    version: number
    created_at: string
}

export interface PayrollLineRow {
    id: string
    period_id: string
    driver_id: string
    base_paise: number
    trips_paise: number
    advances_paise: number
    deductions_paise: number
    net_paise: number
    shortfall_paise: number
    carried_in_paise: number
    trip_count: number
}

export interface AdjustmentRow {
    id: string
    period_id: string
    driver_id: string
    kind: 'advance' | 'deduction'
    amount_paise: number
    reason: string
    created_at: string
}

export interface RateInput {
    driverId: string
    basePaise: number
    perKmPaise: number
    perTonnePaise: number
    expectedVersion: number
}

export interface PeriodInput {
    periodStart: string
    periodEnd: string
    idempotencyKey: string
}

export interface AdjustInput {
    periodId: string
    driverId: string
    kind: 'advance' | 'deduction'
    amountPaise: number
    reason: string
}

export type RateErrorCode = 'driver_not_employed' | 'invalid_rate' | 'version_conflict' | 'unknown'

export type PeriodErrorCode =
    | 'idempotency_key_required'
    | 'idempotency_key_reused'
    | 'invalid_period'
    | 'period_too_long'
    | 'period_not_finished'
    | 'already_closed'
    | 'period_overlap'
    | 'out_of_order'
    | 'value_out_of_range'
    | 'unknown'

export type AdjustErrorCode = 'period_closed' | 'driver_not_employed' | 'unknown'

export type RateResult =
    | { ok: true; version: number }
    | { ok: false; error: RateErrorCode; message: string; currentVersion?: number }

export type PeriodResult =
    | { ok: true; periodId: string; replay: boolean; version: number; lines?: number }
    | { ok: false; error: PeriodErrorCode; message: string }

export type AdjustResult =
    | { ok: true; adjustmentId: string }
    | { ok: false; error: AdjustErrorCode; message: string }

export const RATE_ERROR_MESSAGES: Readonly<Record<Exclude<RateErrorCode, 'unknown'>, string>> = Object.freeze({
    driver_not_employed: 'This driver is not employed by your agency.',
    invalid_rate: 'Rates must be between zero and ten crore rupees each.',
    version_conflict: 'This rate changed since you opened it. Reload to continue.',
})

export const PERIOD_ERROR_MESSAGES: Readonly<Record<Exclude<PeriodErrorCode, 'unknown'>, string>> = Object.freeze({
    idempotency_key_required: 'This request could not be identified. Reload the page and try again.',
    idempotency_key_reused: 'This request was already used for different dates. Check the dates and try again.',
    invalid_period: 'Enter a start date and an end date that is not before it.',
    period_too_long: 'A payroll period can be at most 93 days.',
    period_not_finished: 'A period can only be closed after its last day has passed.',
    already_closed: 'This period is already closed.',
    period_overlap: 'These dates overlap another payroll period.',
    out_of_order: 'A later period is already closed. Periods must be closed in order.',
    value_out_of_range: 'An amount in this period is too large to close. Nothing was changed.',
})

export const ADJUST_ERROR_MESSAGES: Readonly<Record<Exclude<AdjustErrorCode, 'unknown'>, string>> = Object.freeze({
    period_closed: 'This period is closed, so it cannot be changed.',
    driver_not_employed: 'This driver is not employed by your agency.',
})

/** Controlled RAISE EXCEPTION texts; anything else is redacted to the fallback. */
const CONTROLLED_EXCEPTIONS: ReadonlySet<string> = new Set([
    'Agency approval is required.',
    'Your access scope does not allow this action.',
    'No agency profile found for this account.',
    'Multiple agency profiles found for this account.',
    'Sign-in is required.',
    'Payroll period not found or access denied.',
    'Reason must be between 3 and 200 characters.',
    'Adjustment amount must be greater than zero.',
    'Adjustment kind must be advance or deduction.',
])

interface Envelope {
    ok?: unknown
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

const RATE_CODES = Object.keys(RATE_ERROR_MESSAGES) as Exclude<RateErrorCode, 'unknown'>[]
const PERIOD_CODES = Object.keys(PERIOD_ERROR_MESSAGES) as Exclude<PeriodErrorCode, 'unknown'>[]
const ADJUST_CODES = Object.keys(ADJUST_ERROR_MESSAGES) as Exclude<AdjustErrorCode, 'unknown'>[]

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

const RATE_COLUMNS = 'driver_id,base_paise,per_km_paise,per_tonne_paise,version,updated_at'
const EMPLOYMENT_COLUMNS = 'driver_id,status,contact_phone,created_at'
const PERIOD_COLUMNS = 'id,period_start,period_end,status,closed_at,version,created_at'
const LINE_COLUMNS =
    'id,period_id,driver_id,base_paise,trips_paise,advances_paise,deductions_paise,net_paise,shortfall_paise,carried_in_paise,trip_count'
const ADJUSTMENT_COLUMNS = 'id,period_id,driver_id,kind,amount_paise,reason,created_at'

function periodResult(envelope: Envelope, fallback: string): PeriodResult {
    if (envelope.ok === true) {
        if (typeof envelope.period_id === 'string' && typeof envelope.version === 'number') {
            return {
                ok: true,
                periodId: envelope.period_id,
                replay: envelope.replay === true,
                version: envelope.version,
                ...(typeof envelope.lines === 'number' ? { lines: envelope.lines } : {}),
            }
        }
        throw new UserFacingError(fallback)
    }
    const code = pick(envelope.error, PERIOD_CODES)
    return { ok: false, error: code ?? 'unknown', message: code ? PERIOD_ERROR_MESSAGES[code] : fallback }
}

export const agencyPayrollApi = {
    listRates: () =>
        readOrdered<DriverRateRow>('agency_driver_rates', RATE_COLUMNS, 'Failed to load driver rates', 'updated_at', false),

    listEmployedDrivers: () =>
        readOrdered<EmployedDriver>('agency_driver_employment', EMPLOYMENT_COLUMNS, 'Failed to load drivers', 'created_at', true),

    /**
     * Display names (and last 4 phone digits) of the drivers this agency employs or employed, from
     * agency_driver_directory(). A typed refusal yields an empty list; the caller keeps its fallback label.
     */
    async listDriverDirectory(): Promise<DriverDirectoryEntry[]> {
        const envelope = await callRpc('agency_driver_directory', {}, 'Failed to load driver names')
        if (envelope.ok !== true || !Array.isArray(envelope.drivers)) return []
        const entries: DriverDirectoryEntry[] = []
        for (const raw of envelope.drivers as unknown[]) {
            const d = raw as { driver_id?: unknown; name?: unknown; phone_last4?: unknown } | null
            if (!d || typeof d.driver_id !== 'string' || typeof d.name !== 'string' || d.name.trim() === '') continue
            entries.push({
                driver_id: d.driver_id,
                name: d.name,
                phone_last4: typeof d.phone_last4 === 'string' && /^\d{4}$/.test(d.phone_last4) ? d.phone_last4 : null,
            })
        }
        return entries
    },

    listPeriods: () =>
        readOrdered<PayrollPeriodRow>('agency_payroll_periods', PERIOD_COLUMNS, 'Failed to load payroll periods', 'period_start', false),

    listLines: (periodId: string) =>
        readOrdered<PayrollLineRow>(
            'agency_payroll_lines', LINE_COLUMNS, 'Failed to load payroll lines', 'driver_id', true, eq('period_id', periodId)
        ),

    listAdjustments: (periodId: string) =>
        readOrdered<AdjustmentRow>(
            'agency_payroll_adjustments', ADJUSTMENT_COLUMNS, 'Failed to load adjustments', 'created_at', false, eq('period_id', periodId)
        ),

    async setRate(input: RateInput): Promise<RateResult> {
        const fallback = 'Failed to save the rate'
        const envelope = await callRpc(
            'agency_driver_rate_set',
            {
                p_driver_id: input.driverId,
                p_base_paise: input.basePaise,
                p_per_km_paise: input.perKmPaise,
                p_per_tonne_paise: input.perTonnePaise,
                p_expected_version: input.expectedVersion,
            },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.version === 'number') return { ok: true, version: envelope.version }
            throw new UserFacingError(fallback)
        }
        const code = pick(envelope.error, RATE_CODES)
        return {
            ok: false,
            error: code ?? 'unknown',
            message: code ? RATE_ERROR_MESSAGES[code] : fallback,
            ...(typeof envelope.current_version === 'number' ? { currentVersion: envelope.current_version } : {}),
        }
    },

    async openPeriod(input: PeriodInput): Promise<PeriodResult> {
        const fallback = 'Failed to open the payroll period'
        const envelope = await callRpc(
            'agency_payroll_open_period',
            { p_period_start: input.periodStart, p_period_end: input.periodEnd, p_idempotency_key: input.idempotencyKey },
            fallback
        )
        return periodResult(envelope, fallback)
    },

    async closePeriod(input: PeriodInput): Promise<PeriodResult> {
        const fallback = 'Failed to close the payroll period'
        const envelope = await callRpc(
            'agency_payroll_close_period',
            { p_period_start: input.periodStart, p_period_end: input.periodEnd, p_idempotency_key: input.idempotencyKey },
            fallback
        )
        return periodResult(envelope, fallback)
    },

    async adjust(input: AdjustInput): Promise<AdjustResult> {
        const fallback = 'Failed to record the adjustment'
        const envelope = await callRpc(
            'agency_payroll_adjust',
            {
                p_period_id: input.periodId,
                p_driver_id: input.driverId,
                p_kind: input.kind,
                p_amount_paise: input.amountPaise,
                p_reason: input.reason,
            },
            fallback
        )
        if (envelope.ok === true) {
            if (typeof envelope.adjustment_id === 'string') return { ok: true, adjustmentId: envelope.adjustment_id }
            throw new UserFacingError(fallback)
        }
        const code = pick(envelope.error, ADJUST_CODES)
        return { ok: false, error: code ?? 'unknown', message: code ? ADJUST_ERROR_MESSAGES[code] : fallback }
    },
}
