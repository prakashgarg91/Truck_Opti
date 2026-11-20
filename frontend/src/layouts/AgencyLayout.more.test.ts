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

// Every MORE_NAV page, in sheet order.
const ALL_MORE = ['Team', 'Clients', 'Order import', 'Load plan', 'Consignments', 'Invoices', 'Expenses', 'Tracking', 'Payroll', 'ERP', 'Subscription']

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
            createElement(Route, { path: '/agency/clients', element: page('CLIENTS PAGE') }),
            createElement(Route, { path: '/agency/payroll', element: page('PAYROLL PAGE') }),
          ),
        ),
      ),
    )
  })
}

const text = () => container.textContent ?? ''
const moreButton = () => container.querySelector<HTMLButtonElement>('button[aria-controls="agency-more-sheet"]')!
const dialog = () => container.querySelector<HTMLElement>('[role="dialog"]')!
const sheetLabels = () => Array.from(dialog().querySelectorAll('a')).map((a) => (a.textContent ?? '').trim())
const sheetLinks = () => Array.from(dialog().querySelectorAll<HTMLElement>('a[href]'))

async function openSheet() {
  await act(async () => {
    moreButton().click()
  })
}

async function pressKey(target: Element, key: string, shiftKey = false) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }))
  })
}

describe('AgencyLayout More sheet', () => {
  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  it('owner sees all eleven MORE_NAV pages in the sheet', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/fleet')
    await openSheet()
    expect(sheetLabels()).toEqual(ALL_MORE)
  })

  it('dispatcher sheet keeps only pages the dispatcher scope may read', async () => {
    setAuth('agency', false, ['dispatcher'])
    await renderAt('/agency/fleet')
    await openSheet()
    const labels = sheetLabels()
    expect(labels).toEqual(['Clients', 'Order import', 'Load plan', 'Consignments', 'Invoices', 'Expenses', 'Tracking', 'ERP', 'Subscription'])
    for (const hidden of ['Team', 'Payroll']) expect(labels).not.toContain(hidden)
  })

  it('finance sheet has Payroll but not Team or ERP', async () => {
    setAuth('agency', false, ['finance'])
    await renderAt('/agency/fleet')
    await openSheet()
    const labels = sheetLabels()
    for (const shown of ['Payroll', 'Invoices', 'Clients', 'Subscription']) expect(labels).toContain(shown)
    for (const hidden of ['Team', 'ERP']) expect(labels).not.toContain(hidden)
  })

  it('viewer sheet holds only the shared read pages', async () => {
    setAuth('agency', false, ['viewer'])
    await renderAt('/agency/fleet')
    await openSheet()
    expect(sheetLabels()).toEqual(['Clients', 'Order import', 'Load plan', 'Consignments', 'Invoices', 'Expenses', 'Tracking', 'Subscription'])
  })

  it('exposes dialog semantics, aria-expanded and aria-controls', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/fleet')
    expect(moreButton().getAttribute('aria-expanded')).toBe('false')
    expect(dialog().getAttribute('aria-label')).toBe('More agency pages')
    expect(dialog().hidden).toBe(true)
    await openSheet()
    expect(moreButton().getAttribute('aria-expanded')).toBe('true')
    expect(dialog().hidden).toBe(false)
    expect(dialog().getAttribute('id')).toBe(moreButton().getAttribute('aria-controls'))
  })

  it('focus moves into the sheet on open and returns to More on Escape', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/fleet')
    await openSheet()
    expect(dialog().contains(document.activeElement)).toBe(true)
    await pressKey(dialog(), 'Escape')
    expect(dialog().hidden).toBe(true)
    expect(document.activeElement).toBe(moreButton())
  })

  it('closes on backdrop tap and returns focus to More', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/fleet')
    await openSheet()
    const backdrop = container.querySelector<HTMLElement>('[data-testid="agency-more-backdrop"]')!
    await act(async () => {
      backdrop.click()
    })
    expect(dialog().hidden).toBe(true)
    expect(container.querySelector('[data-testid="agency-more-backdrop"]')).toBeNull()
    expect(document.activeElement).toBe(moreButton())
  })

  it('selecting a link navigates, closes the sheet and returns focus to More', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/fleet')
    await openSheet()
    const clients = sheetLinks().find((a) => a.textContent?.trim() === 'Clients')!
    await act(async () => {
      clients.click()
    })
    expect(text()).toContain('CLIENTS PAGE')
    expect(dialog().hidden).toBe(true)
    expect(document.activeElement).toBe(moreButton())
  })

  it('Tab and Shift+Tab wrap focus inside the sheet', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/fleet')
    await openSheet()
    const links = sheetLinks()
    const first = links[0]
    const last = links[links.length - 1]

    last.focus()
    await pressKey(last, 'Tab')
    expect(document.activeElement).toBe(first)

    await pressKey(first, 'Tab', true)
    expect(document.activeElement).toBe(last)
  })

  it('marks the active route in the sheet and highlights More', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/clients')
    const active = sheetLinks().find((a) => a.textContent?.trim() === 'Clients')
    // The sheet is closed, so the link is present but hidden; the More button still signals the current section.
    expect(active?.getAttribute('aria-current')).toBe('page')
    expect(moreButton().className).toContain('text-indigo-600')
  })

  it('bottom bar keeps the five main tabs (Rates retired) and adds More', async () => {
    setAuth('agency', true, [])
    await renderAt('/agency/fleet')
    const bar = container.querySelector('nav[aria-label="Agency main"]')!
    const labels = Array.from(bar.querySelectorAll('a, button')).map((el) => (el.textContent ?? '').trim())
    expect(labels).toEqual(['Home', 'Fleet', 'Drivers', 'Jobs', 'Earnings', 'More'])
  })
})
