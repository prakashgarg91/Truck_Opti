import { beforeEach, describe, expect, it, vi } from 'vitest'

// TO-152 S7: every guarded command must surface SQLSTATE SB001/SB002/SB003 as a
// SubscriptionLimitError (not the generic "Failed to ..." fallback) so the page
// can show the limit prompt. Non-subscription errors must keep their fallback.

const rpcMock = vi.hoisted(() => vi.fn())

vi.mock('../lib/supabase', () => {
    const client: Record<string, unknown> = {}
    client.rpc = function (this: unknown, ...args: unknown[]) {
        if (this !== client) throw new TypeError('supabase.rpc called without its client as this')
        return rpcMock(...args)
    }
    return { supabase: client }
})

import { agencyTeamApi, agencyDriverInvitationApi } from './agencyOrganizationApi'
import { agencyFleetApi, agencyJobsApi } from './agencyPortalApi'
import { agencyOrdersApi } from './agencyOrdersApi'
import { agencyLoadPlansApi } from './agencyLoadPlansApi'
import { agencyConsignmentsApi } from './agencyConsignmentsApi'
import { agencyInvoicesApi } from './agencyInvoicesApi'
import { agencyExpensesApi } from './agencyExpensesApi'
import { agencyPayrollApi } from './agencyPayrollApi'
import { agencyErpApi } from './agencyErpApi'
import { SubscriptionLimitError } from '../lib/subscriptionGuard'
import { UserFacingError } from '../utils/userFacingError'

const sb = (code: string, resource: string, status: string) => ({
    code,
    message: `${code} SUBSCRIPTION`,
    details: JSON.stringify({ code, resource, limit: 5, used: 5, plan: 'starter', status }),
})

const EXPENSE_INPUT = { truckId: 't-1', category: 'toll' as const, amountPaise: 100, spentOn: '2026-11-01', note: '', idempotencyKey: 'k6' }
const FUEL_INPUT = { truckId: 't-1', odometerKm: 10, litres: 5, fullTank: true, amountPaise: 100, filledOn: '2026-11-01', idempotencyKey: 'k7' }
const ITEM_INPUT = { truckId: 't-1', name: 'Oil', intervalKm: 100, intervalDays: null, lastServiceKm: null, lastServiceOn: null, expectedVersion: null }
const SERVICE_INPUT = { itemId: 'i-1', serviceKm: 10, serviceOn: '2026-11-01', expectedVersion: 1, costPaise: 0, idempotencyKey: 'k10' }
const PERIOD_INPUT = { periodStart: '2026-11-01', periodEnd: '2026-11-30', idempotencyKey: 'k8' }
const RATE_INPUT = { driverId: 'd-1', basePaise: 1, perKmPaise: 1, perTonnePaise: 1, expectedVersion: 0 }
const ADJUST_INPUT = { periodId: 'p-1', driverId: 'd-1', kind: 'advance' as const, amountPaise: 100, reason: 'Diesel advance' }
const INVOICE_INPUT = {
    clientId: 'c-1', lines: [{ description: 'Freight', quantity: 1, ratePaise: 100 }], supplierState: '27', placeOfSupplyState: '07',
    gstRatePct: 18, reverseCharge: false, roundOff: false, idempotencyKey: 'k12',
}

const calls: ReadonlyArray<[string, () => Promise<unknown>]> = [
    ['agency_member_invite', () => agencyTeamApi.invite({ email: 'a@b.co', scope: 'viewer', idempotencyKey: 'k1' })],
    ['agency_driver_invitation_create', () => agencyDriverInvitationApi.create({ phone: '+919876543210', idempotencyKey: 'k2' })],
    ['agency_vehicle_create', () => agencyFleetApi.createVehicle({ rc_number: 'KA01AB1234', vehicle_type: 'eicher_14ft' })],
    ['agency_order_import', () => agencyOrdersApi.importOrders({ agreementId: 'ag', fileHash: 'h', idempotencyKey: 'k3', lines: [] })],
    ['agency_load_plan_save', () => agencyLoadPlansApi.savePlan({ name: 'P', idempotencyKey: 'k4', loads: [], unmet: [] })],
    ['agency_consignment_create', () => agencyConsignmentsApi.createConsignment('o-1', 'k5')],
    ['agency_expense_record', () => agencyExpensesApi.recordExpense(EXPENSE_INPUT)],
    ['agency_fuel_fill_record', () => agencyExpensesApi.recordFuelFill(FUEL_INPUT)],
    ['agency_maintenance_item_upsert', () => agencyExpensesApi.upsertMaintenanceItem(ITEM_INPUT)],
    ['agency_maintenance_service_done', () => agencyExpensesApi.markServiceDone(SERVICE_INPUT)],
    ['agency_payroll_open_period', () => agencyPayrollApi.openPeriod(PERIOD_INPUT)],
    ['agency_payroll_close_period', () => agencyPayrollApi.closePeriod(PERIOD_INPUT)],
    ['agency_driver_rate_set', () => agencyPayrollApi.setRate(RATE_INPUT)],
    ['agency_payroll_adjust', () => agencyPayrollApi.adjust(ADJUST_INPUT)],
    ['agency_invoice_issue', () => agencyInvoicesApi.issueInvoice(INVOICE_INPUT)],
    ['agency_erp_connection_create', () => agencyErpApi.createConnection({ agreementId: 'ag-1', name: 'Feed', kind: 'webhook', idempotencyKey: 'k11' })],
    ['agency_erp_connection_rotate_secret', () => agencyErpApi.rotateSecret('c-1', 1)],
    ['agency_load_plan_approve', () => agencyLoadPlansApi.approvePlan('p-1', 1)],
    ['agency_job_assign_driver', () => agencyJobsApi.assignDriver('j-1', 'd-1')],
]

describe('guarded commands surface SB001/SB002/SB003', () => {
    beforeEach(() => rpcMock.mockReset())

    for (const [name, run] of calls) {
        it(`${name}: SB001 becomes a SubscriptionLimitError with the DETAIL numbers`, async () => {
            rpcMock.mockResolvedValue({ data: null, error: sb('SB001', 'truck_add', 'active') })
            const err = await run().catch((e) => e)
            expect(err).toBeInstanceOf(SubscriptionLimitError)
            expect(err).toBeInstanceOf(UserFacingError)
            expect((err as SubscriptionLimitError).info).toMatchObject({ code: 'SB001', limit: 5, used: 5, action: 'upgrade' })
        })

        it(`${name}: SB002 and SB003 map to read-only and dispatch-locked`, async () => {
            rpcMock.mockResolvedValueOnce({ data: null, error: sb('SB002', 'order_import', 'grace') })
            const readOnly = await run().catch((e) => e)
            expect((readOnly as SubscriptionLimitError).info).toMatchObject({ code: 'SB002', kind: 'read_only', action: 'renew' })

            rpcMock.mockResolvedValueOnce({ data: null, error: sb('SB003', 'dispatch', 'expired') })
            const locked = await run().catch((e) => e)
            expect((locked as SubscriptionLimitError).info).toMatchObject({ code: 'SB003', kind: 'dispatch_locked' })
        })

        it(`${name}: an unrelated database error keeps the generic fallback`, async () => {
            rpcMock.mockResolvedValue({ data: null, error: { message: 'connection reset', code: '08006' } })
            const err = await run().catch((e) => e)
            expect(err).toBeInstanceOf(UserFacingError)
            expect(err).not.toBeInstanceOf(SubscriptionLimitError)
        })
    }
})

// Commands that must stay open never raise SB001..SB004 server-side; if one ever arrived it must NOT be mapped.
const openCalls: ReadonlyArray<[string, () => Promise<unknown>]> = [
    ['agency_invoice_record_payment', () => agencyInvoicesApi.recordPayment({ invoiceId: 'i-1', amountPaise: 100, method: 'upi', reference: '', receivedOn: '2026-11-01', expectedVersion: 1, idempotencyKey: 'k13' })],
    ['agency_invoice_cancel', () => agencyInvoicesApi.cancelInvoice('i-1', 1, 'Wrong client')],
    ['agency_consignment_event', () => agencyConsignmentsApi.recordEvent({ consignmentId: 'c-1', event: 'pickup_scanned', expectedVersion: 1, idempotencyKey: 'k14' })],
    ['agency_consignment_qr', () => agencyConsignmentsApi.getQrToken('c-1')],
    ['agency_erp_connection_set_status', () => agencyErpApi.setStatus('c-1', 'paused', 1)],
    ['agency_load_plan_cancel', () => agencyLoadPlansApi.cancelPlan('p-1', 1)],
]

describe('open commands never map a subscription error', () => {
    beforeEach(() => rpcMock.mockReset())
    for (const [name, run] of openCalls) {
        it(`${name}: SB002 and SB004 stay a generic failure`, async () => {
            for (const code of ['SB002', 'SB004']) {
                rpcMock.mockResolvedValueOnce({ data: null, error: sb(code, 'records', 'expired') })
                const err = await run().catch((e) => e)
                expect(err).toBeInstanceOf(UserFacingError)
                expect(err).not.toBeInstanceOf(SubscriptionLimitError)
            }
        })
    }
})

describe('SB004 on the ERP commands', () => {
    beforeEach(() => rpcMock.mockReset())
    it('maps to feature_not_in_plan with an upgrade action', async () => {
        rpcMock.mockResolvedValue({ data: null, error: sb('SB004', 'erp', 'active') })
        const err = await agencyErpApi.createConnection({ agreementId: 'ag-1', name: 'Feed', kind: 'webhook', idempotencyKey: 'k' }).catch((e) => e)
        expect((err as SubscriptionLimitError).info).toMatchObject({ code: 'SB004', kind: 'feature_not_in_plan', action: 'upgrade' })
    })
})
