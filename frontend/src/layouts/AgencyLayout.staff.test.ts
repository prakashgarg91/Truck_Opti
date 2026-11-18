import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '../stores/authStore'

vi.mock('../lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() }, from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() },
  isSupabaseConfigured: false,
}))
vi.mock('../components/billing/useEntitlement', () => ({
  useEntitlement: () => ({ entitlement: undefined, view: null, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('../components/billing/AgencyBillingBanner', () => ({ default: () => null }))

import AgencyLayout from './AgencyLayout'
import ProtectedRoute from '../components/ProtectedRoute'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function setAuth(role: string, isAgencyOwner: boolean, agencyScopes: string[]) {
  useAuthStore.setState({
    user: { id: 'u1', email: 'a@b.c', name: 'N', phone: null, phone_verified: false, google_linked: false, profile_picture: null, role },
    isAuthenticated: true,
    isLoading: false,
    isAgencyOwner,
    agencyScopes,
  })
}

async function renderAt(path: string) {
  const page = (text: string) => createElement('div', null, text)
  await act(async () => {
    root.render(
      createElement(
        MemoryRouter,
        { initialEntries: [path] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(ProtectedRoute, { allowedRoles: ['agency'], children: createElement(AgencyLayout) }) },
            createElement(Route, { path: '/agency/fleet', element: page('FLEET PAGE') }),
            createElement(Route, { path: '/agency/payroll', element: page('PAYROLL PAGE') }),
            createElement(Route, { path: '/agency/team', element: page('TEAM PAGE') }),
          ),
        ),
      ),
    )
  })
}

const text = () => container.textContent ?? ''
const linkLabels = () => Array.from(container.querySelectorAll('a')).map((a) => (a.textContent ?? '').trim())

describe('AgencyLayout for staff', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('route guard: an active staff member (agency role) reaches the agency area', async () => {
    setAuth('agency', false, ['dispatcher'])
    await renderAt('/agency/fleet')
    expect(text()).toContain('FLEET PAGE')
    expect(text()).not.toMatch(/Permission denied/i)
  })

  it('a plain user is still refused at the route guard', async () => {
    setAuth('user', true, [])
    await renderAt('/agency/fleet')
    expect(text()).toMatch(/Permission denied/i)
    expect(text()).not.toContain('FLEET PAGE')
  })

  it('nav filtering: dispatcher sees Jobs and ERP, not Payroll, Team or Rates', async () => {
    setAuth('agency', false, ['dispatcher'])
    await renderAt('/agency/fleet')
    const labels = linkLabels()
    expect(labels).toContain('Jobs')
    expect(labels).toContain('ERP')
    for (const hidden of ['Payroll', 'Team', 'Rates']) expect(labels).not.toContain(hidden)
  })

  it('nav filtering: viewer sees shared pages only', async () => {
    setAuth('agency', false, ['viewer'])
    await renderAt('/agency/fleet')
    const labels = linkLabels()
    expect(labels).toContain('Fleet')
    expect(labels).toContain('Invoices')
    for (const hidden of ['Payroll', 'ERP', 'Team', 'Earnings', 'Rates']) expect(labels).not.toContain(hidden)
  })

  it('a page the scope cannot read shows permission denied instead of the page', async () => {
    setAuth('agency', false, ['dispatcher'])
    await renderAt('/agency/payroll')
    expect(text()).toMatch(/Permission denied/i)
    expect(text()).not.toContain('PAYROLL PAGE')
  })

  it('read-only note on a readable page whose actions the scope cannot use', async () => {
    setAuth('agency', false, ['viewer'])
    await renderAt('/agency/fleet')
    expect(container.querySelector('[data-testid="staff-read-only-note"]')).not.toBeNull()
  })

  it('owner behaviour is unchanged: every item, no note', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/team')
    const labels = linkLabels()
    for (const shown of ['Team', 'Payroll', 'ERP', 'Earnings', 'Subscription']) expect(labels).toContain(shown)
    expect(labels).not.toContain('Rates')
    expect(container.querySelector('[data-testid="staff-read-only-note"]')).toBeNull()
    expect(text()).toContain('TEAM PAGE')
  })
})
