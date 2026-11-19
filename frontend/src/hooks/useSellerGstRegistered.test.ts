import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The hook reads platform_gst_registered() once and reports loading, ready or error.
// It never reports a guessed flag: a failed or malformed answer is an error state.

const h = vi.hoisted(() => ({
    rpc: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
    supabase: { rpc: h.rpc },
}))

import { taxModeOf, useSellerGstRegistered, type SellerGstState } from './useSellerGstRegistered'

let container: HTMLDivElement
let root: Root
let client: QueryClient
const seen: SellerGstState[] = []

function Probe({ label }: { label: string }) {
    const state = useSellerGstRegistered()
    seen.push(state)
    return createElement('span', { 'data-label': label }, state.status)
}

async function mount(...labels: string[]) {
    await act(async () => {
        root.render(
            createElement(
                QueryClientProvider,
                { client },
                ...labels.map((label) => createElement(Probe, { key: label, label })),
            ),
        )
    })
    await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
    })
}

beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.clearAllMocks()
    seen.length = 0
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
})

afterEach(() => {
    act(() => root.unmount())
    container.remove()
})

describe('useSellerGstRegistered', () => {
    it('reports loading while the RPC is in flight', async () => {
        h.rpc.mockReturnValue(new Promise(() => {}))
        await mount('a')
        expect(seen[0]).toEqual({ status: 'loading', registered: null })
        expect(h.rpc).toHaveBeenCalledWith('platform_gst_registered')
    })

    it('reports ready and registered when the seller is registered', async () => {
        h.rpc.mockResolvedValue({ data: true, error: null })
        await mount('a')
        expect(seen.at(-1)).toEqual({ status: 'ready', registered: true })
    })

    it('reports ready and not registered when the seller is not registered', async () => {
        h.rpc.mockResolvedValue({ data: false, error: null })
        await mount('a')
        expect(seen.at(-1)).toEqual({ status: 'ready', registered: false })
    })

    it('reports error when the RPC fails, never a guessed flag', async () => {
        h.rpc.mockResolvedValue({ data: null, error: new Error('network down') })
        await mount('a')
        expect(seen.at(-1)).toEqual({ status: 'error', registered: null })
    })

    it('reports error when the answer is not a boolean', async () => {
        h.rpc.mockResolvedValue({ data: 'yes', error: null })
        await mount('a')
        expect(seen.at(-1)).toEqual({ status: 'error', registered: null })
    })

    it('calls the RPC once for several screens sharing one query client', async () => {
        h.rpc.mockResolvedValue({ data: false, error: null })
        await mount('a', 'b')
        expect(h.rpc).toHaveBeenCalledTimes(1)
        expect(seen.at(-1)).toEqual({ status: 'ready', registered: false })
    })
})

describe('taxModeOf', () => {
    it('maps ready answers to registered or unregistered', () => {
        expect(taxModeOf({ status: 'ready', registered: true })).toBe('registered')
        expect(taxModeOf({ status: 'ready', registered: false })).toBe('unregistered')
    })

    it('keeps loading and error unknown so no tax figure is assumed', () => {
        expect(taxModeOf({ status: 'loading', registered: null })).toBe('unknown')
        expect(taxModeOf({ status: 'error', registered: null })).toBe('unknown')
    })
})
