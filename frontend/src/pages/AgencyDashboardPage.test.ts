/**
 * TO-139 — device-local agency dashboard regression.
 *
 * Before this slice the device-local identity (created at /local-start) landed
 * on the cloud agency dashboard: the edge fetch failed and the page told the
 * user "No Agency Profile Found — Register your transport agency", directly
 * contradicting the workspace they had just created on the device.
 *
 * This test pins the local-first branch: with no backend configured and a
 * device profile present, the dashboard renders the device workspace (company
 * name, local truck/carton counts) and never calls the cloud API.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const localApi = vi.hoisted(() => ({
  current: vi.fn(),
  trucks: vi.fn(),
  cartons: vi.fn(),
}))
const getSnapshotMock = vi.hoisted(() => vi.fn())
const authState = vi.hoisted(() => ({
  user: { id: 'local:test', role: 'agency', email: '' } as Record<string, unknown> | null,
}))

vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: false,
}))

vi.mock('../services/localApi', () => ({
  agencyProfileLocalApi: { current: localApi.current },
  trucksLocalApi: { getAll: localApi.trucks },
  cartonsLocalApi: { getAll: localApi.cartons },
}))

vi.mock('../services/agencyPortalApi', () => ({
  agencyDashboardApi: { getSnapshot: getSnapshotMock },
}))

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => authState,
}))

vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
}))

import AgencyDashboardPage from './AgencyDashboardPage'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement | null = null
let root: Root | null = null

async function renderPage() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(createElement(MemoryRouter, null, createElement(AgencyDashboardPage)))
  })
  return container
}

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
})

describe('AgencyDashboardPage device-local branch (TO-139)', () => {
  beforeEach(() => {
    authState.user = { id: 'local:test', role: 'agency', email: '' }
    localApi.current.mockResolvedValue({
      id: 'local-agent-1',
      role: 'agency',
      company_name: 'Sharma Transport',
      contact_name: 'Ravi Sharma',
      contact_phone: null,
    })
    localApi.trucks.mockResolvedValue([{ id: 't1' }, { id: 't2' }])
    localApi.cartons.mockResolvedValue([{ id: 'c1' }])
    getSnapshotMock.mockReset()
  })

  it('renders the device workspace instead of a failed cloud dashboard', async () => {
    await renderPage()
    const text = document.body.textContent ?? ''

    expect(text).toContain('Sharma Transport')
    expect(text).toContain('On this device')
    expect(text).toContain('Manage Trucks')
    expect(text).not.toContain('No Agency Profile Found')
    expect(text).not.toContain('Register your transport agency')
    expect(getSnapshotMock).not.toHaveBeenCalled()
  })

  it('offers device setup (not cloud registration) when no local profile exists', async () => {
    localApi.current.mockResolvedValue(null)
    await renderPage()
    const text = document.body.textContent ?? ''

    expect(text).toContain('Set up this device')
    expect(text).not.toContain('No Agency Profile Found')
    expect(text).not.toContain('Register your transport agency')
    expect(getSnapshotMock).not.toHaveBeenCalled()
  })
})
