import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
    maybeSingle: vi.fn(),
    rpc: vi.fn(),
    invoke: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
    supabase: {
        from: () => ({ select: () => ({ limit: () => ({ maybeSingle: h.maybeSingle }) }) }),
        rpc: h.rpc,
        functions: { invoke: h.invoke },
    },
}))
vi.mock('../utils/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }))

import { adminBillingSettingsApi, BILLING_SETTINGS_ERROR_MESSAGES } from './adminSupabaseApi'
import { UserFacingError } from '../utils/userFacingError'

const ROW = {
    legal_name: 'Acme', gstin: '27AAAAA0000A1Z5', address: 'Pune', state_code: '27',
    sac_code: '997331', enforcement_enabled: true, updated_at: '2026-11-10T00:00:00Z',
}
const INPUT = { legalName: 'Acme', gstin: '27AAAAA0000A1Z5', address: 'Pune', stateCode: '27', sacCode: '997331' }

describe('adminBillingSettingsApi', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        h.maybeSingle.mockResolvedValue({ data: ROW, error: null })
        h.rpc.mockResolvedValue({ data: { ok: true }, error: null })
    })

    it('maps the stored row to camelCase settings', async () => {
        expect(await adminBillingSettingsApi.getSettings()).toEqual({
            legalName: 'Acme', gstin: '27AAAAA0000A1Z5', address: 'Pune', stateCode: '27',
            sacCode: '997331', enforcementEnabled: true, updatedAt: '2026-11-10T00:00:00Z',
        })
    })

    it('returns null when the row is missing', async () => {
        h.maybeSingle.mockResolvedValue({ data: null, error: null })
        expect(await adminBillingSettingsApi.getSettings()).toBeNull()
    })

    it('hides read errors behind a user-facing message', async () => {
        h.maybeSingle.mockResolvedValue({ data: null, error: { message: 'permission denied for table x' } })
        await expect(adminBillingSettingsApi.getSettings()).rejects.toThrow(/Unable to load billing settings/)
        await expect(adminBillingSettingsApi.getSettings()).rejects.toBeInstanceOf(UserFacingError)
    })

    it('passes the freshly read enforcement flag through unchanged, so it is never toggled from here', async () => {
        await adminBillingSettingsApi.updateSettings(INPUT)
        expect(h.rpc).toHaveBeenCalledWith('platform_billing_settings_update', {
            p_legal_name: 'Acme', p_gstin: '27AAAAA0000A1Z5', p_address: 'Pune', p_state_code: '27',
            p_sac_code: '997331', p_enforcement_enabled: true,
        })
        h.maybeSingle.mockResolvedValue({ data: { ...ROW, enforcement_enabled: false }, error: null })
        await adminBillingSettingsApi.updateSettings(INPUT)
        expect(h.rpc.mock.calls[1][1].p_enforcement_enabled).toBe(false)
    })

    it('does not call the RPC when the row cannot be read', async () => {
        h.maybeSingle.mockResolvedValue({ data: null, error: null })
        await expect(adminBillingSettingsApi.updateSettings(INPUT)).rejects.toBeInstanceOf(UserFacingError)
        expect(h.rpc).not.toHaveBeenCalled()
    })

    it.each(Object.keys(BILLING_SETTINGS_ERROR_MESSAGES))('maps the server error %s to its typed message', async (code) => {
        h.rpc.mockResolvedValue({ data: null, error: { message: code } })
        await expect(adminBillingSettingsApi.updateSettings(INPUT)).rejects.toThrow(BILLING_SETTINGS_ERROR_MESSAGES[code])
    })

    it('maps SQLSTATE 42501 to the forbidden message', async () => {
        h.rpc.mockResolvedValue({ data: null, error: { message: 'x', code: '42501' } })
        await expect(adminBillingSettingsApi.updateSettings(INPUT)).rejects.toThrow(BILLING_SETTINGS_ERROR_MESSAGES.forbidden)
    })

    it('an unknown server error falls back to a safe message and leaks nothing', async () => {
        h.rpc.mockResolvedValue({ data: null, error: { message: 'deadlock detected in table secrets' } })
        const err = await adminBillingSettingsApi.updateSettings(INPUT).catch((e) => e)
        expect(err.message).toBe('Billing settings could not be saved. Please try again.')
    })

    it('counts approved agencies that lack a trial, active, past-due or grace subscription', async () => {
        h.invoke.mockImplementation((fn: string) => {
            if (fn === 'admin-portal-agencies') {
                return Promise.resolve({ data: { agencies: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }, { id: 'a4' }], counts: {} }, error: null })
            }
            return Promise.resolve({
                data: {
                    subscriptions: [
                        { id: 's1', agency_id: 'a1', status: 'active' },
                        { id: 's2', agency_id: 'a2', status: 'expired' },
                        { id: 's3', agency_id: 'a3', status: 'grace' },
                    ],
                },
                error: null,
            })
        })
        expect(await adminBillingSettingsApi.countApprovedAgenciesWithoutLiveSubscription()).toBe(2)
    })
})
