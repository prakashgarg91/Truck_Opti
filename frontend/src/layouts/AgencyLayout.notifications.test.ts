import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/authStore'

// Captured calls to the realtime bell subscription.
const channelState = vi.hoisted(() => ({
  channels: [] as Array<{ name: string; filters: string[]; subscribed: boolean }>,
  removed: [] as Array<{ name: string; filters: string[]; subscribed: boolean }>,
  agencyRow: { data: null as { id: string } | null },
  membershipRows: { data: [] as Array<{ agency_id: string; scope: string }> },
  fromCalls: [] as string[],
}))

vi.mock('../lib/supabase', () => {
  const channel = vi.fn((name: string) => {
    const entry = { name, filters: [] as string[], subscribed: false }
    channelState.channels.push(entry)
    const builder: {
      entry: typeof entry
      on: (type: string, filter: { filter?: string }) => typeof builder
      subscribe: () => typeof builder
    } = {
      entry,
      on:(_type, filter) => {
        if (filter.filter) entry.filters.push(filter.filter)
        return builder
      },
      subscribe: () => {
        entry.subscribed = true
        return builder
      },
    }
    return builder
  })
  const removeChannel = vi.fn((ch: { entry: (typeof channelState.channels)[number] }) => {
    channelState.removed.push(ch.entry)
  })
  const from = vi.fn((table: string) => {
    channelState.fromCalls.push(table)
    const result = table === 'transport_agencies' ? channelState.agencyRow : channelState.membershipRows
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = () => builder
    builder.maybeSingle = () => Promise.resolve(result)
    builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(result).then(resolve, reject)
    return builder
  })
  return {
    supabase: { auth: { signOut: vi.fn() }, from, channel, removeChannel },
    isSupabaseConfigured: true,
  }
})

vi.mock('../components/billing/useEntitlement', () => ({
  useEntitlement: () => ({ entitlement: undefined, view: null, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('../components/billing/AgencyBillingBanner', () => ({ default: () => null }))

import AgencyLayout from './AgencyLayout'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function setAuth(userId: string, role: string, isAgencyOwner: boolean, agencyScopes: string[]) {
  useAuthStore.setState({
    user: { id: userId, email: 'a@b.c', name: 'N', phone: null, phone_verified: false, google_linked: false, profile_picture: null, role },
    isAuthenticated: true,
    isLoading: false,
    isAgencyOwner,
    agencyScopes,
  })
}

async function mountLayout() {
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: ['/agency/dashboard'] },
        createElement(
          Routes,
          null,
          createElement(Route, { path: '/agency/*', element: createElement(AgencyLayout) }),
        ),
      ),
    )
  })
  // Let the async agency lookup settle.
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const bellChannels = () => channelState.channels.filter((c) => c.name === 'agency-new-jobs')

describe('AgencyLayout new-job bell subscription', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    channelState.channels.length = 0
    channelState.removed.length = 0
    channelState.fromCalls.length = 0
    channelState.agencyRow = { data: null }
    channelState.membershipRows = { data: [] }
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it('owner subscribes to new jobs of the agency they own', async () => {
    channelState.agencyRow = { data: { id: 'agency-owner' } }
    setAuth('owner-user', 'agency', true, [])
    await mountLayout()

    expect(channelState.fromCalls).toContain('transport_agencies')
    expect(bellChannels()).toHaveLength(1)
    expect(bellChannels()[0].subscribed).toBe(true)
    expect(bellChannels()[0].filters).toEqual(['agency_id=eq.agency-owner'])
  })

  it('dispatcher subscribes with the agency from their own active membership', async () => {
    channelState.membershipRows = { data: [{ agency_id: 'agency-42', scope: 'dispatcher' }] }
    setAuth('dispatcher-user', 'agency', false, ['dispatcher'])
    await mountLayout()

    expect(channelState.fromCalls).toContain('agency_memberships')
    expect(channelState.fromCalls).not.toContain('transport_agencies')
    expect(bellChannels()).toHaveLength(1)
    expect(bellChannels()[0].filters).toEqual(['agency_id=eq.agency-42'])
  })

  it('fleet manager subscribes with the membership agency id', async () => {
    channelState.membershipRows = { data: [{ agency_id: 'agency-7', scope: 'fleet_manager' }] }
    setAuth('fleet-user', 'agency', false, ['fleet_manager'])
    await mountLayout()

    expect(bellChannels()).toHaveLength(1)
    expect(bellChannels()[0].filters).toEqual(['agency_id=eq.agency-7'])
  })

  it('finance staff never subscribe and never query for an agency', async () => {
    channelState.membershipRows = { data: [{ agency_id: 'agency-9', scope: 'finance' }] }
    setAuth('finance-user', 'agency', false, ['finance'])
    await mountLayout()

    expect(bellChannels()).toHaveLength(0)
    expect(channelState.fromCalls).not.toContain('agency_memberships')
  })

  it('viewer staff never subscribe', async () => {
    channelState.membershipRows = { data: [{ agency_id: 'agency-9', scope: 'viewer' }] }
    setAuth('viewer-user', 'agency', false, ['viewer'])
    await mountLayout()

    expect(bellChannels()).toHaveLength(0)
  })

  it('a staff member with no job-capable membership row does not subscribe', async () => {
    channelState.membershipRows = { data: [{ agency_id: 'agency-9', scope: 'finance' }, { agency_id: 'agency-9', scope: 'viewer' }] }
    setAuth('mixed-user', 'agency', false, ['finance', 'viewer'])
    await mountLayout()

    expect(bellChannels()).toHaveLength(0)
  })

  it('unmount removes the channel', async () => {
    channelState.agencyRow = { data: { id: 'agency-owner' } }
    setAuth('owner-user', 'agency', true, [])
    await mountLayout()
    expect(bellChannels()).toHaveLength(1)

    await act(async () => root.unmount())
    expect(channelState.removed).toHaveLength(1)
    expect(channelState.removed[0]).toBe(bellChannels()[0])
  })

  it('switching user removes the old channel and does not open a second one', async () => {
    channelState.agencyRow = { data: { id: 'agency-owner' } }
    setAuth('owner-user', 'agency', true, [])
    await mountLayout()
    expect(bellChannels()).toHaveLength(1)

    channelState.agencyRow = { data: null }
    channelState.membershipRows = { data: [{ agency_id: 'agency-42', scope: 'dispatcher' }] }
    await act(async () => {
      setAuth('dispatcher-user', 'agency', false, ['dispatcher'])
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(channelState.removed).toHaveLength(1)
    const dispatcherChannels = bellChannels().filter((c) => c.filters.includes('agency_id=eq.agency-42'))
    expect(dispatcherChannels).toHaveLength(1)
  })

  it('a re-render with the same scopes does not resubscribe', async () => {
    channelState.membershipRows = { data: [{ agency_id: 'agency-42', scope: 'dispatcher' }] }
    setAuth('dispatcher-user', 'agency', false, ['dispatcher'])
    await mountLayout()
    expect(bellChannels()).toHaveLength(1)

    await act(async () => {
      setAuth('dispatcher-user', 'agency', false, ['dispatcher'])
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(bellChannels()).toHaveLength(1)
    expect(channelState.removed).toHaveLength(0)
  })
})
