import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

// Fail loudly unless the service calls the client methods with the client as `this`.
vi.mock('../lib/supabase', () => {
    const client: Record<string, unknown> = {}
    client.rpc = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.rpc called without its client as this')
        return rpcMock(...args)
    }
    client.from = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.from called without its client as this')
        return fromMock(...args)
    }
    return { supabase: client }
})

import { agencyPayrollApi, ADJUST_ERROR_MESSAGES, PERIOD_ERROR_MESSAGES, RATE_ERROR_MESSAGES } from './agencyPayrollApi'
import { UserFacingError } from '../utils/userFacingError'

const rateInput = { driverId: 'd-1', basePaise: 1500000, perKmPaise: 1250, perTonnePaise: 40000, expectedVersion: 2 }
const periodInput = { periodStart: '2026-10-01', periodEnd: '2026-10-31', idempotencyKey: 'k-1' }
const adjustInput = { periodId: 'p-1', driverId: 'd-1', kind: 'advance' as const, amountPaise: 200000, reason: 'Diesel advance' }

function mockOrdered(rows: unknown[], error: unknown = null) {
    const order = vi.fn().mockResolvedValue({ data: rows, error })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ order, eq })
    fromMock.mockReturnValue({ select })
    return { select, order, eq }
}

describe('agencyPayrollApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('setRate', () => {
        it('sends the exact RPC arguments and returns the new version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'saved', version: 3 }, error: null })
            const result = await agencyPayrollApi.setRate(rateInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_driver_rate_set', {
                p_driver_id: 'd-1',
                p_base_paise: 1500000,
                p_per_km_paise: 1250,
                p_per_tonne_paise: 40000,
                p_expected_version: 2,
            })
            expect(result).toEqual({ ok: true, version: 3 })
        })

        it('maps version_conflict to a typed result with the current version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'version_conflict', current_version: 5 }, error: null })
            const result = await agencyPayrollApi.setRate(rateInput)
            expect(result).toEqual({ ok: false, error: 'version_conflict', message: RATE_ERROR_MESSAGES.version_conflict, currentVersion: 5 })
        })

        it.each(['driver_not_employed', 'invalid_rate'] as const)('maps %s', async (code) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyPayrollApi.setRate(rateInput)
            expect(result).toMatchObject({ ok: false, error: code, message: RATE_ERROR_MESSAGES[code] })
        })

        it('collapses an unknown code to the fallback', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'select * from secrets' }, error: null })
            const result = await agencyPayrollApi.setRate(rateInput)
            expect(result).toEqual({ ok: false, error: 'unknown', message: 'Failed to save the rate' })
        })
    })

    describe('openPeriod and closePeriod', () => {
        it('opens with the exact RPC arguments', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'opened', replay: false, period_id: 'p-1', status: 'open', version: 1 }, error: null })
            const result = await agencyPayrollApi.openPeriod(periodInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_payroll_open_period', {
                p_period_start: '2026-10-01', p_period_end: '2026-10-31', p_idempotency_key: 'k-1',
            })
            expect(result).toEqual({ ok: true, periodId: 'p-1', replay: false, version: 1 })
        })

        it('closes with the exact RPC arguments and reports the line count', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'closed', replay: false, period_id: 'p-1', version: 2, lines: 4 }, error: null })
            const result = await agencyPayrollApi.closePeriod(periodInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_payroll_close_period', {
                p_period_start: '2026-10-01', p_period_end: '2026-10-31', p_idempotency_key: 'k-1',
            })
            expect(result).toEqual({ ok: true, periodId: 'p-1', replay: false, version: 2, lines: 4 })
        })

        it('marks an idempotent replay', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'idempotent_replay', replay: true, period_id: 'p-1', version: 2 }, error: null })
            const result = await agencyPayrollApi.closePeriod(periodInput)
            expect(result).toMatchObject({ ok: true, replay: true })
        })

        it.each(Object.keys(PERIOD_ERROR_MESSAGES) as (keyof typeof PERIOD_ERROR_MESSAGES)[])('maps close refusal %s', async (code) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyPayrollApi.closePeriod(periodInput)
            expect(result).toEqual({ ok: false, error: code, message: PERIOD_ERROR_MESSAGES[code] })
        })

        it('throws the fallback for a malformed success envelope', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
            await expect(agencyPayrollApi.openPeriod(periodInput)).rejects.toThrow('Failed to open the payroll period')
        })
    })

    describe('adjust', () => {
        it('sends the exact RPC arguments', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, state: 'recorded', adjustment_id: 'a-1' }, error: null })
            const result = await agencyPayrollApi.adjust(adjustInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_payroll_adjust', {
                p_period_id: 'p-1', p_driver_id: 'd-1', p_kind: 'advance', p_amount_paise: 200000, p_reason: 'Diesel advance',
            })
            expect(result).toEqual({ ok: true, adjustmentId: 'a-1' })
        })

        it.each(Object.keys(ADJUST_ERROR_MESSAGES) as (keyof typeof ADJUST_ERROR_MESSAGES)[])('maps %s', async (code) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyPayrollApi.adjust(adjustInput)
            expect(result).toEqual({ ok: false, error: code, message: ADJUST_ERROR_MESSAGES[code] })
        })
    })

    describe('exceptions', () => {
        it('surfaces a controlled denial message', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'Your access scope does not allow this action.' } })
            await expect(agencyPayrollApi.adjust(adjustInput)).rejects.toThrow(new UserFacingError('Your access scope does not allow this action.'))
        })

        it('redacts an unknown database message', async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'relation "x" does not exist' } })
            await expect(agencyPayrollApi.setRate(rateInput)).rejects.toThrow('Failed to save the rate')
        })
    })

    describe('reads', () => {
        it('lists rates', async () => {
            const { order } = mockOrdered([{ driver_id: 'd-1' }])
            const rows = await agencyPayrollApi.listRates()
            expect(fromMock).toHaveBeenCalledWith('agency_driver_rates')
            expect(order).toHaveBeenCalledWith('updated_at', { ascending: false })
            expect(rows).toEqual([{ driver_id: 'd-1' }])
        })

        it('lists lines filtered by period', async () => {
            const { eq } = mockOrdered([])
            await agencyPayrollApi.listLines('p-1')
            expect(fromMock).toHaveBeenCalledWith('agency_payroll_lines')
            expect(eq).toHaveBeenCalledWith('period_id', 'p-1')
        })

        it('lists adjustments filtered by period', async () => {
            const { eq } = mockOrdered([])
            await agencyPayrollApi.listAdjustments('p-1')
            expect(fromMock).toHaveBeenCalledWith('agency_payroll_adjustments')
            expect(eq).toHaveBeenCalledWith('period_id', 'p-1')
        })

        it('throws the fallback when a read fails', async () => {
            mockOrdered([], { message: 'boom' })
            await expect(agencyPayrollApi.listPeriods()).rejects.toThrow('Failed to load payroll periods')
        })
    })
})
