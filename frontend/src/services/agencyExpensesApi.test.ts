import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpcMock = vi.hoisted(() => vi.fn())
const fromMock = vi.hoisted(() => vi.fn())

// The real SupabaseClient methods depend on `this`; these wrappers fail loudly
// unless the service calls them as methods.
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

import { agencyExpensesApi } from './agencyExpensesApi'
import { UserFacingError } from '../utils/userFacingError'

const expenseInput = {
    truckId: 't-1',
    category: 'toll' as const,
    amountPaise: 12050,
    spentOn: '2026-11-10',
    note: '  Highway toll  ',
    idempotencyKey: 'key-1',
}
const fuelInput = {
    truckId: 't-1', odometerKm: 1500, litres: 40, fullTank: true, amountPaise: 400000, filledOn: '2026-11-10', idempotencyKey: 'key-2',
}
const serviceInput = { itemId: 'i-1', serviceKm: 9000, serviceOn: '2026-11-10', expectedVersion: 2, costPaise: 0, idempotencyKey: 'key-3' }

describe('agencyExpensesApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    describe('recordExpense', () => {
        it('sends the exact RPC arguments and returns a typed success', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, expense_id: 'e-1', replay: false }, error: null })
            const result = await agencyExpensesApi.recordExpense(expenseInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_expense_record', {
                p_truck_id: 't-1',
                p_category: 'toll',
                p_amount_paise: 12050,
                p_spent_on: '2026-11-10',
                p_note: 'Highway toll',
                p_idempotency_key: 'key-1',
            })
            expect(result).toEqual({ ok: true, expenseId: 'e-1', replay: false })
        })

        it('sends a blank note as null and reports a replay', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, expense_id: 'e-1', replay: true }, error: null })
            const result = await agencyExpensesApi.recordExpense({ ...expenseInput, truckId: null, note: '   ' })
            expect(rpcMock.mock.calls[0][1]).toMatchObject({ p_truck_id: null, p_note: null })
            expect(result).toEqual({ ok: true, expenseId: 'e-1', replay: true })
        })

        it.each([
            ['forbidden_scope', /fleet managers and finance/],
            ['idempotency_key_required', /Reload/],
            ['invalid_key', /Reload/],
            ['idempotency_key_reused', /different details/],
            ['invalid_category', /valid category/],
            ['invalid_amount', /above zero/],
            ['future_date', /future/],
            ['date_too_old', /5 years/],
            ['note_too_long', /300/],
            ['truck_required', /Choose a truck/],
            ['truck_not_found', /not found/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyExpensesApi.recordExpense(expenseInput)
            expect(result).toMatchObject({ ok: false, error: code })
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('maps an unknown refusal to the fallback message', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'mystery' }, error: null })
            expect(await agencyExpensesApi.recordExpense(expenseInput)).toEqual({
                ok: false, error: 'unknown', message: 'Failed to save expense',
            })
        })

        it('surfaces approved database exceptions and redacts everything else', async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'Agency approval is required.' } })
            await expect(agencyExpensesApi.recordExpense(expenseInput)).rejects.toThrow('Agency approval is required.')
            rpcMock.mockResolvedValueOnce({ data: null, error: { message: 'relation "x" does not exist' } })
            const err = await agencyExpensesApi.recordExpense(expenseInput).catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err.message).toBe('Failed to save expense')
        })

        it('rejects a malformed success envelope', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true }, error: null })
            await expect(agencyExpensesApi.recordExpense(expenseInput)).rejects.toThrow('Failed to save expense')
        })
    })

    describe('recordFuelFill', () => {
        it('sends the exact RPC arguments', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, expense_id: 'e-1', fill_id: 'f-1', replay: false }, error: null })
            const result = await agencyExpensesApi.recordFuelFill(fuelInput)
            expect(rpcMock).toHaveBeenCalledWith('agency_fuel_fill_record', {
                p_truck_id: 't-1',
                p_odometer_km: 1500,
                p_litres: 40,
                p_full_tank: true,
                p_amount_paise: 400000,
                p_filled_on: '2026-11-10',
                p_idempotency_key: 'key-2',
            })
            expect(result).toEqual({ ok: true, expenseId: 'e-1', fillId: 'f-1', replay: false })
        })

        it('includes the previous reading for odometer refusals', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'odometer_not_increasing', previous_km: 1500 }, error: null })
            const a = await agencyExpensesApi.recordFuelFill(fuelInput)
            expect(a).toMatchObject({ ok: false, error: 'odometer_not_increasing', previousKm: 1500 })
            expect(a.ok === false && a.message).toContain('1,500 km')
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'odometer_jump_too_large', previous_km: 1000 }, error: null })
            const b = await agencyExpensesApi.recordFuelFill(fuelInput)
            expect(b.ok === false && b.message).toMatch(/5,000 km/)
        })

        it.each([
            ['invalid_litres', /between 1 and 1,000/],
            ['invalid_odometer', /odometer/],
            ['invalid_amount', /above zero/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyExpensesApi.recordFuelFill(fuelInput)
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('rejects a success envelope without a fill id', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, expense_id: 'e-1' }, error: null })
            await expect(agencyExpensesApi.recordFuelFill(fuelInput)).rejects.toThrow('Failed to save fuel fill')
        })
    })

    describe('upsertMaintenanceItem', () => {
        const itemInput = {
            truckId: 't-1', name: 'Oil', intervalKm: 10000, intervalDays: null, lastServiceKm: 500, lastServiceOn: '2026-10-01', expectedVersion: null,
        }

        it('sends the exact RPC arguments', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, item_id: 'i-1', version: 1 }, error: null })
            expect(await agencyExpensesApi.upsertMaintenanceItem(itemInput)).toEqual({ ok: true, itemId: 'i-1', version: 1 })
            expect(rpcMock).toHaveBeenCalledWith('agency_maintenance_item_upsert', {
                p_truck_id: 't-1',
                p_name: 'Oil',
                p_interval_km: 10000,
                p_interval_days: null,
                p_last_service_km: 500,
                p_last_service_on: '2026-10-01',
                p_expected_version: null,
            })
        })

        it.each([
            ['name_required', /name/],
            ['name_too_long', /100/],
            ['interval_required', /interval/],
            ['invalid_interval', /whole numbers/],
            ['invalid_km', /km/],
            ['name_exists', /already has/],
            ['item_not_found', /not found/],
            ['truck_not_found', /not found/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyExpensesApi.upsertMaintenanceItem(itemInput)
            expect(result.ok === false && result.message).toMatch(pattern)
        })

        it('returns version_conflict with the current version', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'version_conflict', current_version: 4 }, error: null })
            expect(await agencyExpensesApi.upsertMaintenanceItem({ ...itemInput, expectedVersion: 1 })).toMatchObject({
                ok: false, error: 'version_conflict', currentVersion: 4, message: 'This item changed. Reload to continue.',
            })
        })
    })

    describe('markServiceDone', () => {
        it('sends the exact RPC arguments', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, replay: false, expense_id: 'e-9', version: 3 }, error: null })
            const result = await agencyExpensesApi.markServiceDone({ ...serviceInput, costPaise: 250000 })
            expect(rpcMock).toHaveBeenCalledWith('agency_maintenance_service_done', {
                p_item_id: 'i-1',
                p_service_km: 9000,
                p_service_on: '2026-11-10',
                p_expected_version: 2,
                p_cost_paise: 250000,
                p_idempotency_key: 'key-3',
            })
            expect(result).toEqual({ ok: true, replay: false, expenseId: 'e-9', version: 3 })
        })

        it('treats a zero-cost service as a success without an expense', async () => {
            rpcMock.mockResolvedValue({ data: { ok: true, replay: false, expense_id: null, version: 3 }, error: null })
            expect(await agencyExpensesApi.markServiceDone(serviceInput)).toEqual({ ok: true, replay: false, expenseId: null, version: 3 })
        })

        it('includes the last service km when km goes backwards', async () => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: 'km_going_backwards', last_service_km: 12000 }, error: null })
            const result = await agencyExpensesApi.markServiceDone(serviceInput)
            expect(result).toMatchObject({ ok: false, error: 'km_going_backwards', lastServiceKm: 12000 })
            expect(result.ok === false && result.message).toContain('12,000 km')
        })

        it('returns version_conflict and idempotency_key_reused', async () => {
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'version_conflict', current_version: 5 }, error: null })
            expect(await agencyExpensesApi.markServiceDone(serviceInput)).toMatchObject({ error: 'version_conflict', currentVersion: 5 })
            rpcMock.mockResolvedValueOnce({ data: { ok: false, error: 'idempotency_key_reused' }, error: null })
            expect(await agencyExpensesApi.markServiceDone(serviceInput)).toMatchObject({ error: 'idempotency_key_reused' })
        })
    })

    describe('expenseSummary', () => {
        it('maps the summary and ignores malformed rows', async () => {
            rpcMock.mockResolvedValue({
                data: {
                    ok: true,
                    total_paise: 15000,
                    by_category: [{ category: 'fuel', total_paise: 10000 }, { category: 'toll', total_paise: 5000 }, { bad: true }],
                    by_truck: [{ truck_id: 't-1', total_paise: 15000 }],
                },
                error: null,
            })
            const result = await agencyExpensesApi.expenseSummary('2026-11-01', '2026-11-30')
            expect(rpcMock).toHaveBeenCalledWith('agency_expense_summary', { p_from: '2026-11-01', p_to: '2026-11-30' })
            expect(result).toEqual({
                ok: true,
                totalPaise: 15000,
                byCategory: [{ category: 'fuel', totalPaise: 10000 }, { category: 'toll', totalPaise: 5000 }],
                byTruck: [{ truckId: 't-1', totalPaise: 15000 }],
            })
        })

        it.each([
            ['invalid_range', /on or before/],
            ['range_too_large', /366/],
        ])('maps %s to plain language', async (code, pattern) => {
            rpcMock.mockResolvedValue({ data: { ok: false, error: code }, error: null })
            const result = await agencyExpensesApi.expenseSummary('2026-11-01', '2026-11-30')
            expect(result.ok === false && result.message).toMatch(pattern)
        })
    })

    describe('reads', () => {
        function mockChain(rows: unknown[], error: unknown = null) {
            const order = vi.fn().mockResolvedValue({ data: rows, error })
            const lte = vi.fn().mockReturnValue({ order })
            const gte = vi.fn().mockReturnValue({ lte })
            const select = vi.fn().mockReturnValue({ order, gte })
            fromMock.mockReturnValue({ select })
            return { select, order, gte, lte }
        }

        it('lists trucks', async () => {
            const { order } = mockChain([{ id: 't-1', rc_number: 'MH12', vehicle_type: 'Truck' }])
            expect(await agencyExpensesApi.listTrucks()).toHaveLength(1)
            expect(fromMock).toHaveBeenCalledWith('agency_trucks')
            expect(order).toHaveBeenCalledWith('rc_number', { ascending: true })
        })

        it('filters expenses by the period and coerces amounts to numbers', async () => {
            const { gte, lte } = mockChain([{ id: 'e-1', amount_paise: '12050' }])
            const rows = await agencyExpensesApi.listExpenses('2026-11-01', '2026-11-30')
            expect(fromMock).toHaveBeenCalledWith('agency_expenses')
            expect(gte).toHaveBeenCalledWith('spent_on', '2026-11-01')
            expect(lte).toHaveBeenCalledWith('spent_on', '2026-11-30')
            expect(rows[0].amount_paise).toBe(12050)
        })

        it('coerces fuel fill numerics and maintenance km', async () => {
            mockChain([{ id: 'f-1', odometer_km: '1500', litres: '40.50' }])
            expect(await agencyExpensesApi.listFuelFills()).toMatchObject([{ odometer_km: 1500, litres: 40.5 }])
            expect(fromMock).toHaveBeenCalledWith('agency_fuel_fills')
            mockChain([{ id: 'i-1', last_service_km: '900' }, { id: 'i-2', last_service_km: null }])
            expect(await agencyExpensesApi.listMaintenanceItems()).toMatchObject([{ last_service_km: 900 }, { last_service_km: null }])
            expect(fromMock).toHaveBeenCalledWith('agency_maintenance_items')
        })

        it('throws the fallback when a read fails', async () => {
            mockChain([], { message: 'raw detail' })
            await expect(agencyExpensesApi.listFuelFills()).rejects.toThrow('Failed to load fuel fills')
        })
    })
})
