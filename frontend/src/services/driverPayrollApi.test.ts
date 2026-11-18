import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ rpc: vi.fn() }))

vi.mock('../lib/supabase', () => ({
    supabase: {
        // A real method: a detached call would lose `this` and fail the check below.
        rpc(this: unknown, name: string, args?: unknown) {
            if (this === undefined) throw new Error('rpc called detached')
            return h.rpc(name, args)
        },
    },
}))

import { driverPayrollApi } from './driverPayrollApi'

describe('driverPayrollApi.listMyLines', () => {
    beforeEach(() => vi.clearAllMocks())

    it('calls agency_payroll_my_lines as a client method and maps the lines', async () => {
        h.rpc.mockResolvedValue({
            data: {
                ok: true,
                lines: [
                    {
                        period_id: 'p1', period_start: '2026-10-01', period_end: '2026-10-31', driver_id: 'd1',
                        base_paise: 1500000, trips_paise: '420050', advances_paise: 200000, deductions_paise: 5000,
                        net_paise: 1715050, shortfall_paise: 0, carried_in_paise: 0, trip_count: 7,
                    },
                ],
            },
            error: null,
        })
        const lines = await driverPayrollApi.listMyLines()
        expect(h.rpc).toHaveBeenCalledWith('agency_payroll_my_lines', undefined)
        expect(lines).toEqual([
            {
                periodId: 'p1', periodStart: '2026-10-01', periodEnd: '2026-10-31',
                basePaise: 1500000, tripsPaise: 420050, advancesPaise: 200000, deductionsPaise: 5000,
                netPaise: 1715050, shortfallPaise: 0, carriedInPaise: 0, tripCount: 7,
            },
        ])
    })

    it('returns an empty list when nothing is closed', async () => {
        h.rpc.mockResolvedValue({ data: { ok: true, lines: [] }, error: null })
        expect(await driverPayrollApi.listMyLines()).toEqual([])
    })

    it('skips malformed lines instead of inventing numbers', async () => {
        h.rpc.mockResolvedValue({ data: { ok: true, lines: [{ period_id: 'x' }, null] }, error: null })
        expect(await driverPayrollApi.listMyLines()).toEqual([])
    })

    it('throws a plain message on an RPC error or an unexpected envelope', async () => {
        h.rpc.mockResolvedValue({ data: null, error: { message: 'permission denied for table secret' } })
        await expect(driverPayrollApi.listMyLines()).rejects.toThrow('Could not load your pay statements')
        h.rpc.mockResolvedValue({ data: { ok: false }, error: null })
        await expect(driverPayrollApi.listMyLines()).rejects.toThrow('Could not load your pay statements')
    })
})
