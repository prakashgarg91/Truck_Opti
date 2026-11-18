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

const supabaseFlag = vi.hoisted(() => ({ configured: false }))

vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return supabaseFlag.configured
  },
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

vi.mock('../utils/logger', () => ({
  logger: { error: vi.fn(), log: vi.fn(), warn: vi.fn(), info: vi.fn() },
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

describe('AgencyDashboardPage cloud snapshot states', () => {
  const SUMMARY = { active: 3, today: 1, pending: 2, thirtyDayRevenue: 5000, thirtyDayJobs: 4 }
  const AGENCY = {
    id: 'a1', company_name: 'Gupta Logistics', status: 'approved', rating: 4.5,
    total_jobs: 10, fleet_size: 7, city: 'Pune', gstin: null,
  }
  const retryButtons = () =>
    Array.from(document.body.querySelectorAll('button')).filter((b) => /Retry/.test(b.textContent ?? ''))

  beforeEach(() => {
    supabaseFlag.configured = true
    authState.user = { id: 'u1', role: 'agency', email: 'a@b.c' }
    getSnapshotMock.mockReset()
  })
  afterEach(() => {
    supabaseFlag.configured = false
  })

  it('loading shows only a spinner', async () => {
    getSnapshotMock.mockReturnValue(new Promise(() => {}))
    await renderPage()
    expect(document.body.querySelector('.animate-spin')).not.toBeNull()
    expect(document.body.textContent).not.toContain('No Agency Profile Found')
    expect(document.body.textContent).not.toContain('We could not load your dashboard')
  })

  it('success renders the agency and its summary', async () => {
    getSnapshotMock.mockResolvedValue({ agency: AGENCY, summary: SUMMARY })
    await renderPage()
    const text = document.body.textContent ?? ''
    expect(text).toContain('Gupta Logistics')
    expect(text).toContain('7 vehicles registered')
    expect(text).not.toContain('No Agency Profile Found')
    expect(text).not.toContain('We could not load your dashboard')
  })

  it('a successful answer with no agency shows the registration prompt', async () => {
    getSnapshotMock.mockResolvedValue({ agency: null, summary: SUMMARY })
    await renderPage()
    const text = document.body.textContent ?? ''
    expect(text).toContain('No Agency Profile Found')
    expect(text).toContain('Register Your Agency')
    expect(text).not.toContain('We could not load your dashboard')
  })

  it('a failed call shows a calm error state with a 44px Retry, never the no-agency message', async () => {
    getSnapshotMock.mockRejectedValue(new Error('501'))
    await renderPage()
    const text = document.body.textContent ?? ''
    expect(document.body.querySelector('[data-testid="agency-dashboard-error"]')).not.toBeNull()
    expect(text).toContain('We could not load your dashboard. Try again.')
    expect(text).not.toContain('No Agency Profile Found')
    expect(text).not.toContain('Register Your Agency')
    const retry = retryButtons()
    expect(retry).toHaveLength(1)
    expect(retry[0].className).toContain('min-h-[44px]')
    expect(retry[0].className).toContain('focus-visible:ring-2')
  })

  it('Retry refetches and recovers into the dashboard', async () => {
    getSnapshotMock.mockRejectedValueOnce(new Error('timeout'))
    getSnapshotMock.mockResolvedValueOnce({ agency: AGENCY, summary: SUMMARY })
    await renderPage()
    await act(async () => {
      retryButtons()[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    })
    expect(getSnapshotMock).toHaveBeenCalledTimes(2)
    const text = document.body.textContent ?? ''
    expect(text).toContain('Gupta Logistics')
    expect(text).not.toContain('We could not load your dashboard')
  })
})
