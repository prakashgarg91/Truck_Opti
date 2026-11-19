import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const getMock = vi.hoisted(() => vi.fn())

vi.mock('../../lib/supabase', () => ({
    supabase: { rpc: vi.fn(), from: vi.fn(), auth: { onAuthStateChange: vi.fn() } },
}))

vi.mock('../../services/subscriptionApi', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/subscriptionApi')>()
    return { ...actual, entitlementApi: { ...actual.entitlementApi, get: getMock } }
})

import { useEntitlement } from './useEntitlement'
import { useAuthStore } from '../../stores/authStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const ENTITLEMENT = {
    ok: true, agency_id: 'ag_1', status: 'active', plan_tier: 'starter',
    period_end: '2027-01-01T00:00:00Z', can_write: true, can_dispatch: true,
    limits: {}, usage: { trucks: 0, staff: 0, drivers: 0, orders_month: 0 },
}

type HookResult = ReturnType<typeof useEntitlement>

let root: Root | null = null
let container: HTMLDivElement | null = null
let latest: { current: HookResult | undefined } = { current: undefined }

function Probe() {
    latest.current = useEntitlement()
    return null
}

async function mountHook() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    container = document.createElement('div')
    root = createRoot(container)
    await act(async () => {
        root!.render(createElement(QueryClientProvider, { client }, createElement(Probe)))
    })
    return client
}

async function settle() {
    for (let i = 0; i < 5; i++) {
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 0))
        })
    }
}

function setAccess(access: { role?: string; isAgencyOwner?: boolean; agencyScopes?: string[]; isLoading?: boolean; user?: boolean }) {
    useAuthStore.setState({
        user: access.user === false ? null : ({ id: 'u1', role: access.role ?? 'user' } as never),
        isAgencyOwner: access.isAgencyOwner ?? true,
        agencyScopes: access.agencyScopes ?? [],
        isLoading: access.isLoading ?? false,
    })
}

beforeEach(() => {
    getMock.mockReset()
    getMock.mockResolvedValue(ENTITLEMENT)
    latest = { current: undefined }
})

afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = null
    container = null
})

describe('useEntitlement access gate', () => {
    it('does not call the RPC for an admin (no agency) and stays idle', async () => {
        setAccess({ role: 'admin' })
        await mountHook()
        await settle()

        expect(getMock).not.toHaveBeenCalled()
        expect(latest.current?.entitlement).toBeUndefined()
        expect(latest.current?.view).toBeNull()
        expect(latest.current?.isLoading).toBe(false)
    })

    it('does not call the RPC for a driver', async () => {
        setAccess({ role: 'driver' })
        await mountHook()
        await settle()

        expect(getMock).not.toHaveBeenCalled()
        expect(latest.current?.isLoading).toBe(false)
    })

    it('does not call the RPC for a plain customer or a signed-out visitor', async () => {
        setAccess({ role: 'user' })
        await mountHook()
        await settle()
        expect(getMock).not.toHaveBeenCalled()

        await act(async () => {
            setAccess({ user: false, isLoading: false })
        })
        await settle()
        expect(getMock).not.toHaveBeenCalled()
    })

    it('calls the RPC once for an agency owner', async () => {
        setAccess({ role: 'agency', isAgencyOwner: true })
        await mountHook()
        await settle()

        expect(getMock).toHaveBeenCalledTimes(1)
        expect(latest.current?.entitlement).toEqual(ENTITLEMENT)
        expect(latest.current?.view).not.toBeNull()
    })

    it('calls the RPC once for an agency staff member with a scope', async () => {
        setAccess({ role: 'agency', isAgencyOwner: false, agencyScopes: ['dispatcher'] })
        await mountHook()
        await settle()

        expect(getMock).toHaveBeenCalledTimes(1)
        expect(latest.current?.entitlement).toEqual(ENTITLEMENT)
    })

    it('reports loading and does not call the RPC while access is still resolving', async () => {
        setAccess({ role: 'agency', isAgencyOwner: true, isLoading: true })
        await mountHook()
        await settle()

        expect(getMock).not.toHaveBeenCalled()
        expect(latest.current?.isLoading).toBe(true)

        await act(async () => {
            useAuthStore.setState({ isLoading: false })
        })
        await settle()

        expect(getMock).toHaveBeenCalledTimes(1)
        expect(latest.current?.isLoading).toBe(false)
        expect(latest.current?.entitlement).toEqual(ENTITLEMENT)
    })

    it('does not call the RPC while resolving an admin, and stays idle once resolved', async () => {
        setAccess({ role: 'admin', isLoading: true })
        await mountHook()
        await settle()
        expect(getMock).not.toHaveBeenCalled()

        await act(async () => {
            useAuthStore.setState({ isLoading: false })
        })
        await settle()
        expect(getMock).not.toHaveBeenCalled()
        expect(latest.current?.isLoading).toBe(false)
    })
})
