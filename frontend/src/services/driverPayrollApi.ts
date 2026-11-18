import { supabase } from '../lib/supabase'
import { UserFacingError } from '../utils/userFacingError'

/**
 * The driver's own closed payroll lines, from agency_payroll_my_lines()
 * (20261023000000_agency_payroll.sql). The server returns only the caller's
 * lines of CLOSED periods. All amounts are integer paise; no money moves
 * through the platform, this is an accounting statement.
 */

export interface DriverPayLine {
    periodId: string
    periodStart: string
    periodEnd: string
    basePaise: number
    tripsPaise: number
    advancesPaise: number
    deductionsPaise: number
    netPaise: number
    shortfallPaise: number
    carriedInPaise: number
    tripCount: number
}

const FALLBACK = 'Could not load your pay statements'

type RpcClient = {
    rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: unknown } | null }>
}

function int(value: unknown): number {
    const n = typeof value === 'string' ? Number(value) : value
    return typeof n === 'number' && Number.isFinite(n) ? Math.trunc(n) : 0
}

export const driverPayrollApi = {
    async listMyLines(): Promise<DriverPayLine[]> {
        // Call as a client method: the client's rpc() relies on `this`.
        const client = supabase as unknown as RpcClient
        const { data, error } = await client.rpc('agency_payroll_my_lines')
        if (error) throw new UserFacingError(FALLBACK)
        const envelope = (Array.isArray(data) ? data[0] : data) as { ok?: unknown; lines?: unknown } | null | undefined
        if (!envelope || envelope.ok !== true || !Array.isArray(envelope.lines)) throw new UserFacingError(FALLBACK)

        const lines: DriverPayLine[] = []
        for (const raw of envelope.lines as Array<Record<string, unknown>>) {
            if (!raw || typeof raw.period_start !== 'string' || typeof raw.period_end !== 'string') continue
            lines.push({
                periodId: String(raw.period_id ?? ''),
                periodStart: raw.period_start,
                periodEnd: raw.period_end,
                basePaise: int(raw.base_paise),
                tripsPaise: int(raw.trips_paise),
                advancesPaise: int(raw.advances_paise),
                deductionsPaise: int(raw.deductions_paise),
                netPaise: int(raw.net_paise),
                shortfallPaise: int(raw.shortfall_paise),
                carriedInPaise: int(raw.carried_in_paise),
                tripCount: int(raw.trip_count),
            })
        }
        return lines
    },
}
