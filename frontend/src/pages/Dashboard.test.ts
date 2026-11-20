import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Customer dashboard (/dashboard). Covers loading, error, empty first-run, populated,
// every navigation target, the quick cost estimate, signed-in vs device-local identity,
// and missing optional data. Cases marked it.fails pin confirmed defects in Dashboard.tsx
// (see the comment on each); they flip to failing once the defect is fixed, at which point
// the marker should be changed back to a normal it().

const api = vi.hoisted(() => ({
  getDashboardStats: vi.fn(),
  getPendingOptimizationsCount: vi.fn(),
  getWeeklyPackingCounts: vi.fn(),
  getUserJobs: vi.fn(),
  getRecent: vi.fn(),
}))

const authState = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
}))

const supabaseFlag = vi.hoisted(() => ({ configured: true }))

vi.mock('../services/supabaseApi', () => ({
  customerDashboardApi: {
    getDashboardStats: api.getDashboardStats,
    getPendingOptimizationsCount: api.getPendingOptimizationsCount,
  },
  analyticsSupabaseApi: { getWeeklyPackingCounts: api.getWeeklyPackingCounts },
  packingJobsSupabaseApi: { getUserJobs: api.getUserJobs },
  saleOrdersSupabaseApi: { getRecent: api.getRecent },
}))

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => authState,
}))

vi.mock('../lib/supabase', () => ({
  get isSupabaseConfigured() {
    return supabaseFlag.configured
  },
}))

import Dashboard from './Dashboard'
import { calculateShipmentCost, formatCost } from '../utils/costEngine'

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STATS = { activeShipments: 4, trucksCount: 3, routesToday: 2, deliveriesDone: 9 }
const ZERO_STATS = { activeShipments: 0, trucksCount: 0, routesToday: 0, deliveriesDone: 0 }

let container: HTMLDivElement | null = null
let root: Root | null = null

function LocationProbe() {
  const location = useLocation()
  return createElement('div', { 'data-testid': 'location-probe' }, location.pathname)
}

function currentPath(): string {
  return document.querySelector('[data-testid="location-probe"]')?.textContent ?? ''
}

async function flush(ms = 0) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

async function waitFor(predicate: () => boolean, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    if (predicate()) return
    await flush(5)
  }
}

async function mount(): Promise<HTMLElement> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(
          MemoryRouter,
          { initialEntries: ['/dashboard'] },
          createElement(Dashboard),
          createElement(LocationProbe),
        ),
      ),
    )
  })
  return container
}

function text(): string {
  return document.body.textContent ?? ''
}

function buttonByText(label: string): HTMLButtonElement {
  const match = Array.from(document.body.querySelectorAll('button')).find(
    (b) => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label,
  )
  if (!match) throw new Error(`button not found: ${label}`)
  return match as HTMLButtonElement
}

function clickButton(label: string) {
  const btn = buttonByText(label)
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function setInputValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  setter.call(el, value)
  act(() => {
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
}

function totalEstimateText(): string {
  return document.querySelector('.text-2xl.font-bold.text-primary-600')?.textContent ?? ''
}

function expectedTotal(distanceKm: number, truckType: string, weightKg: number): string {
  const result = calculateShipmentCost({
    distanceKm,
    truckType,
    weightKg,
    volumeM3: weightKg / 100,
  })
  return formatCost(result.totalCost)
}

beforeEach(() => {
  authState.user = { id: 'u1', name: 'Asha Rao', email: 'asha@example.com', role: 'user' }
  supabaseFlag.configured = true
  api.getDashboardStats.mockReset().mockResolvedValue({ ...STATS })
  api.getPendingOptimizationsCount.mockReset().mockResolvedValue(0)
  api.getWeeklyPackingCounts.mockReset().mockResolvedValue(DAYS.map((day) => ({ day, count: 0 })))
  api.getUserJobs.mockReset().mockResolvedValue([])
  api.getRecent.mockReset().mockResolvedValue([])
})

afterEach(async () => {
  await act(async () => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
})

describe('Dashboard loading and error states', () => {
  it('shows the skeleton with a screen-reader heading while data is pending', async () => {
    api.getDashboardStats.mockReturnValue(new Promise(() => {}))
    await mount()

    expect(document.body.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0)
    expect(document.querySelector('h1.sr-only')?.textContent).toBe('Dashboard')
    expect(text()).not.toContain('Quick Actions')
    expect(text()).not.toContain('Active Shipments')
  })

  it('shows the error state and no stats or actions when the stats call fails', async () => {
    api.getDashboardStats.mockRejectedValue(new Error('network down'))
    await mount()
    await waitFor(() => text().includes('Failed to load dashboard'))

    expect(text()).toContain('Failed to load dashboard')
    expect(text()).toContain('Please check your connection and try again')
    expect(text()).not.toContain('Quick Actions')
    expect(document.querySelector('[role="status"]')).toBeNull()
  })
})

describe('Dashboard empty first-run state', () => {
  beforeEach(() => {
    api.getDashboardStats.mockResolvedValue({ ...ZERO_STATS })
  })

  it('shows zero counts for all four stat cards', async () => {
    await mount()
    await waitFor(() => text().includes('Active Shipments'))

    const cards = Array.from(document.querySelectorAll('[role="status"]'))
    expect(cards.map((c) => c.getAttribute('aria-label'))).toEqual([
      'Active Shipments',
      'Vehicles available',
      'Routes Today',
      'Deliveries Done',
    ])
    expect(cards.every((c) => c.querySelector('p.text-3xl')?.textContent === '0')).toBe(true)
  })

  it('shows the no-orders prompt with an import action that opens sale orders', async () => {
    await mount()
    await waitFor(() => text().includes('No sale orders yet'))

    clickButton('Import orders →')
    expect(currentPath()).toBe('/sale-orders')
  })

  it('falls back to the three built-in activity rows when there are no packing jobs', async () => {
    await mount()
    await waitFor(() => text().includes('System ready for packing'))

    expect(text()).toContain('System ready for packing')
    expect(text()).toContain('0 trucks loaded in database')
    expect(text()).toContain('Route optimization ready')
  })

  it('shows no pending-optimizations badge and seven empty chart bars', async () => {
    await mount()
    await waitFor(() => text().includes('Weekly Performance'))

    expect(text()).not.toMatch(/pending optimization/)
    const bars = Array.from(document.querySelectorAll('.h-44 div.group')) as HTMLElement[]
    expect(bars).toHaveLength(7)
    expect(bars.every((b) => b.style.height === '0%')).toBe(true)
  })
})

describe('Dashboard populated state', () => {
  it('renders each stat value with its label', async () => {
    await mount()
    await waitFor(() => text().includes('Deliveries Done'))

    const values = Array.from(document.querySelectorAll('[role="status"] p.text-3xl')).map((p) => p.textContent)
    expect(values).toEqual(['4', '3', '2', '9'])
  })

  it('uses singular wording for exactly one pending optimization', async () => {
    api.getPendingOptimizationsCount.mockResolvedValue(1)
    await mount()
    await waitFor(() => text().includes('1 pending optimization'))

    expect(text()).toContain('1 pending optimization')
    expect(text()).not.toContain('1 pending optimizations')
  })

  it('uses plural wording for several pending optimizations', async () => {
    api.getPendingOptimizationsCount.mockResolvedValue(3)
    await mount()
    await waitFor(() => text().includes('3 pending optimizations'))

    expect(text()).toContain('3 pending optimizations')
  })

  it('lists recent sale orders with item count, city and status', async () => {
    api.getRecent.mockResolvedValue([
      { id: 'so-1', order_number: 'SO-1001', total_items: 5, delivery_city: 'Pune', status: 'completed' },
      { id: 'so-2', order_number: 'SO-1002', total_items: 2, delivery_city: 'Nashik', status: 'processing' },
    ])
    await mount()
    await waitFor(() => text().includes('SO-1001'))

    expect(text()).toContain('SO-1001')
    expect(text()).toContain('5 items • Pune')
    expect(text()).toContain('SO-1002')
    expect(text()).toContain('2 items • Nashik')
    const completed = Array.from(document.querySelectorAll('span')).find((s) => s.textContent === 'completed')
    expect(completed?.className).toContain('bg-green-100')
  })

  it('renders packing job activity with its volume percentage and relative time', async () => {
    api.getUserJobs.mockResolvedValue([
      {
        id: 'j1',
        status: 'completed',
        volume_utilization: 80,
        created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
      },
    ])
    await mount()
    await waitFor(() => text().includes('80% volume utilized'))

    expect(text()).toContain('Packing job completed - 80% volume utilized')
    expect(text()).toContain('2 min ago')
    expect(text()).not.toContain('System ready for packing')
  })

  it('scales weekly counts to percentages of the busiest day', async () => {
    api.getWeeklyPackingCounts.mockResolvedValue(
      DAYS.map((day, i) => ({ day, count: [2, 4, 0, 1, 0, 0, 0][i] })),
    )
    await mount()
    await waitFor(() => text().includes('Weekly Performance'))

    const bars = Array.from(document.querySelectorAll('.h-44 div.group')) as HTMLElement[]
    expect(bars.map((b) => b.style.height)).toEqual(['50%', '100%', '0%', '25%', '0%', '0%', '0%'])
  })

  it('highlights the current weekday label in the chart axis', async () => {
    vi.spyOn(Date.prototype, 'getDay').mockReturnValue(3)
    await mount()
    await waitFor(() => text().includes('Weekly Performance'))

    const labels = Array.from(document.querySelectorAll('.text-xs.font-medium span'))
    const wed = labels.find((s) => s.textContent === 'Wed')
    expect(wed?.className).toContain('font-bold')
    expect(labels.filter((s) => s.className.includes('font-bold'))).toHaveLength(1)
  })
})

describe('Dashboard greeting and title', () => {
  it.each([
    [9, 'Good Morning'],
    [13, 'Good Afternoon'],
    [20, 'Good Evening'],
  ])('greets for hour %i with %s', async (hour, greeting) => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(hour)
    await mount()
    await waitFor(() => text().includes(greeting))

    expect(text()).toContain(greeting)
  })

  it('sets the document title', async () => {
    await mount()
    await waitFor(() => text().includes('Quick Actions'))

    expect(document.title).toBe('Dashboard - TruckOpti')
  })
})

describe('Dashboard display name fallback', () => {
  it.each([
    [{ name: 'Asha Rao', email: 'asha@example.com' }, 'Asha Rao'],
    [{ name: '', email: 'ravi.k@example.com' }, 'ravi.k'],
    [{ name: '', email: '' }, 'User'],
  ])('shows %j as "%s"', async (identity, expected) => {
    authState.user = { id: 'u2', role: 'user', ...identity }
    await mount()
    await waitFor(() => text().includes('Quick Actions'))

    expect(document.querySelector('h1.text-2xl')?.textContent).toBe(expected)
  })
})

describe('Dashboard navigation targets', () => {
  it.each([
    ['Book a Truck', '/booking/new'],
    ['New Packing', '/packing'],
    ['Plan Route', '/routes'],
    ['Packing', '/packing'],
    ['Routes', '/routes'],
    ['Track', '/tracking'],
    ['Book Truck', '/booking/new'],
  ])('"%s" navigates to %s', async (label, path) => {
    await mount()
    await waitFor(() => text().includes('Quick Actions'))

    clickButton(label)
    expect(currentPath()).toBe(path)
  })

  it('"View all" in recent orders and a sale-order row both open sale orders', async () => {
    api.getRecent.mockResolvedValue([
      { id: 'so-9', order_number: 'SO-9', total_items: 1, delivery_city: 'Delhi', status: 'pending' },
    ])
    await mount()
    await waitFor(() => text().includes('SO-9'))

    const viewAll = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.includes('View all'))!
    act(() => {
      viewAll.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(currentPath()).toBe('/sale-orders')

    // Re-mount on the dashboard path before testing the row click.
    await act(async () => root?.unmount())
    container?.remove()
    root = null
    await mount()
    await waitFor(() => text().includes('SO-9'))
    const row = Array.from(document.querySelectorAll('p')).find((p) => p.textContent === 'SO-9')!.closest('div.card')!
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(currentPath()).toBe('/sale-orders')
  })

  it('"View all" in recent activity opens packing', async () => {
    await mount()
    await waitFor(() => text().includes('Recent Activity'))

    const activityHeader = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent === 'Recent Activity')!
    const viewAll = activityHeader.parentElement!.querySelector('button')!
    act(() => {
      viewAll.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(currentPath()).toBe('/packing')
  })
})

describe('Dashboard quick cost estimate', () => {
  it('shows the default estimate for 500 km, Eicher 14ft, 1000 kg', async () => {
    await mount()
    await waitFor(() => text().includes('Quick Cost Estimate'))

    expect(totalEstimateText()).toBe(expectedTotal(500, 'Eicher 14ft', 1000))
  })

  it('recalculates the total on blur after the distance changes', async () => {
    await mount()
    await waitFor(() => text().includes('Quick Cost Estimate'))

    const distance = document.querySelector('input[type="number"]') as HTMLInputElement
    setInputValue(distance, '1200')
    act(() => {
      distance.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    await flush()

    expect(totalEstimateText()).toBe(expectedTotal(1200, 'Eicher 14ft', 1000))
  })

  // Dashboard.tsx updateCostEstimate. Previously a truck change ran the pre-change closure via
  // setTimeout, so the quote used the previous truck type. Fixed: the new truck type is passed in
  // directly and the quote is recalculated from it.
  it('recalculates the total for the newly selected truck type', async () => {
    await mount()
    await waitFor(() => text().includes('Quick Cost Estimate'))

    const select = document.querySelector('select') as HTMLSelectElement
    setInputValue(select, 'BharatBenz 32ft')
    await flush(10)

    expect(totalEstimateText()).toBe(expectedTotal(500, 'BharatBenz 32ft', 1000))
    expect(totalEstimateText()).not.toBe(expectedTotal(500, 'Eicher 14ft', 1000))
  })

  it('uses the newly selected truck type for a later weight change', async () => {
    await mount()
    await waitFor(() => text().includes('Quick Cost Estimate'))

    const select = document.querySelector('select') as HTMLSelectElement
    setInputValue(select, 'Tata Ace')
    await flush(10)
    const weight = document.querySelectorAll('input[type="number"]')[1] as HTMLInputElement
    setInputValue(weight, '2500')
    act(() => {
      weight.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    await flush()

    expect(totalEstimateText()).toBe(expectedTotal(500, 'Tata Ace', 2500))
  })
})

describe('Dashboard signed-in and device-local identity', () => {
  it('signed-in: loads every cloud query once and shows the signed-in user name', async () => {
    await mount()
    await waitFor(() => text().includes('Quick Actions'))

    expect(api.getDashboardStats).toHaveBeenCalledTimes(1)
    expect(api.getPendingOptimizationsCount).toHaveBeenCalledTimes(1)
    expect(api.getWeeklyPackingCounts).toHaveBeenCalledTimes(1)
    expect(api.getUserJobs).toHaveBeenCalledWith(5)
    expect(api.getRecent).toHaveBeenCalledWith(3)
    expect(document.querySelector('h1.text-2xl')?.textContent).toBe('Asha Rao')
  })

  it('device-local without a backend: the cloud error state is shown when the cloud calls fail', async () => {
    supabaseFlag.configured = false
    authState.user = { id: 'local:abc', role: 'user', name: 'Ravi', email: '' }
    api.getDashboardStats.mockRejectedValue(new Error('no backend'))
    await mount()
    await waitFor(() => text().includes('Failed to load dashboard'))

    expect(text()).toContain('Failed to load dashboard')
    expect(text()).not.toContain('Quick Actions')
  })

  // Dashboard.tsx:77-79 and :109. The page never checks isSupabaseConfigured (unlike
  // AgencyDashboardPage and TrackingPage), so a device-local profile with no backend still
  // calls the cloud APIs and ends up on the cloud error page instead of a device-local view.
  it.fails('device-local without a backend: does not call the cloud APIs (defect: no local-first branch)', async () => {
    supabaseFlag.configured = false
    authState.user = { id: 'local:abc', role: 'user', name: 'Ravi', email: '' }
    await mount()
    await waitFor(() => text().includes('Quick Actions') || text().includes('Failed to load dashboard'))

    expect(api.getDashboardStats).not.toHaveBeenCalled()
    expect(api.getRecent).not.toHaveBeenCalled()
  })

  it('device-local profile still shows its contact name in the greeting header', async () => {
    supabaseFlag.configured = false
    authState.user = { id: 'local:abc', role: 'user', name: 'Ravi', email: '' }
    await mount()
    await waitFor(() => text().includes('Quick Actions'))

    expect(document.querySelector('h1.text-2xl')?.textContent).toBe('Ravi')
  })
})

describe('Dashboard missing optional data', () => {
  it('renders without crashing when packing jobs lack a created_at timestamp', async () => {
    api.getUserJobs.mockResolvedValue([
      { id: 'j2', status: 'pending', volume_utilization: 40 },
    ])
    await mount()
    await waitFor(() => text().includes('40% volume utilized'))

    expect(text()).toContain('Packing job pending - 40% volume utilized')
    expect(text()).not.toContain('Packing job completed')
    expect(text()).toContain('Just now')
  })

  it('labels processing packing jobs as in progress rather than completed', async () => {
    api.getUserJobs.mockResolvedValue([
      { id: 'j5', status: 'processing', volume_utilization: 55, created_at: new Date().toISOString() },
    ])
    await mount()
    await waitFor(() => text().includes('55% volume utilized'))

    expect(text()).toContain('Packing job in progress - 55% volume utilized')
    expect(text()).not.toContain('Packing job completed')
  })

  it('renders sale orders with an unknown status using the fallback badge colour', async () => {
    api.getRecent.mockResolvedValue([
      { id: 'so-x', order_number: 'SO-X', total_items: 0, delivery_city: '', status: 'cancelled' },
    ])
    await mount()
    await waitFor(() => text().includes('SO-X'))

    const badge = Array.from(document.querySelectorAll('span')).find((s) => s.textContent === 'cancelled')
    expect(badge?.className).toContain('bg-amber-100')
    expect(text()).toContain('0 items •')
  })

  it('treats an empty weekly series as seven zero bars', async () => {
    api.getWeeklyPackingCounts.mockResolvedValue([])
    await mount()
    await waitFor(() => text().includes('Weekly Performance'))

    const bars = Array.from(document.querySelectorAll('.h-44 div.group')) as HTMLElement[]
    expect(bars).toHaveLength(7)
  })

  // Dashboard.tsx activity mapping. Previously every job said "Packing job completed". Fixed: the
  // label follows the job status, and a failed job is shown as failed with warning styling.
  it('reports a failed packing job as failed, not completed', async () => {
    api.getUserJobs.mockResolvedValue([
      { id: 'j3', status: 'failed', volume_utilization: 0, created_at: new Date().toISOString() },
    ])
    await mount()
    await waitFor(() => text().includes('volume utilized'))

    expect(text()).toContain('Packing job failed - 0% volume utilized')
    expect(text()).not.toContain('Packing job completed')
    const icon = document.querySelector('.bg-orange-100')
    expect(icon).not.toBeNull()
  })

  // Dashboard.tsx relative time now uses lib/relativeTime.ts. Hour counts are pluralised.
  it('pluralises relative time in hours ("3 hours ago")', async () => {
    api.getUserJobs.mockResolvedValue([
      {
        id: 'j4',
        status: 'completed',
        volume_utilization: 10,
        created_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
      },
    ])
    await mount()
    await waitFor(() => text().includes('volume utilized'))

    expect(text()).toContain('3 hours ago')
  })
})
