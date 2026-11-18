import { describe, expect, it } from 'vitest'
import { canActOnRoute, canReadRoute, ROUTE_ACCESS, routeAccessFor, scopeDeniedTitle } from './agencyAccess'

const owner = { isAgencyOwner: true, agencyScopes: [] as string[] }
const staff = (...scopes: string[]) => ({ isAgencyOwner: false, agencyScopes: scopes })

describe('agency staff route access (mirrors the SQL scope lists)', () => {
  it('the owner can read and act everywhere', () => {
    for (const path of Object.keys(ROUTE_ACCESS)) {
      expect(canReadRoute(path, owner)).toBe(true)
      expect(canActOnRoute(path, owner)).toBe(true)
    }
  })

  it('every staff scope reads the shared operational pages', () => {
    for (const scope of ['dispatcher', 'fleet_manager', 'finance', 'viewer']) {
      for (const path of ['/agency/dashboard', '/agency/fleet', '/agency/drivers', '/agency/jobs', '/agency/consignments', '/agency/invoices', '/agency/expenses', '/agency/tracking']) {
        expect(canReadRoute(path, staff(scope))).toBe(true)
      }
    }
  })

  it('dispatcher: acts on jobs, orders, plans, consignments, ERP, not on fleet or invoices', () => {
    const s = staff('dispatcher')
    for (const p of ['/agency/jobs', '/agency/orders/import', '/agency/orders/plan', '/agency/consignments', '/agency/erp', '/agency/tracking']) expect(canActOnRoute(p, s)).toBe(true)
    for (const p of ['/agency/fleet', '/agency/drivers', '/agency/invoices', '/agency/expenses', '/agency/clients']) expect(canActOnRoute(p, s)).toBe(false)
    expect(canReadRoute('/agency/payroll', s)).toBe(false)
    expect(canReadRoute('/agency/rates', s)).toBe(false)
  })

  it('fleet_manager: acts on fleet, drivers, expenses, tracking; cannot read ERP or payroll', () => {
    const s = staff('fleet_manager')
    for (const p of ['/agency/fleet', '/agency/drivers', '/agency/expenses', '/agency/tracking']) expect(canActOnRoute(p, s)).toBe(true)
    for (const p of ['/agency/jobs', '/agency/invoices', '/agency/consignments']) expect(canActOnRoute(p, s)).toBe(false)
    expect(canReadRoute('/agency/erp', s)).toBe(false)
    expect(canReadRoute('/agency/payroll', s)).toBe(false)
  })

  it('finance: acts on invoices, expenses, payroll, clients and tariffs, reads billing and rates', () => {
    const s = staff('finance')
    for (const p of ['/agency/invoices', '/agency/expenses', '/agency/payroll', '/agency/clients', '/agency/clients/abc/tariffs', '/agency/billing', '/agency/rates']) expect(canActOnRoute(p, s)).toBe(true)
    expect(canActOnRoute('/agency/fleet', s)).toBe(false)
    expect(canReadRoute('/agency/erp', s)).toBe(false)
  })

  it('viewer: reads shared pages, acts nowhere, cannot read finance-only or ERP pages', () => {
    const s = staff('viewer')
    for (const p of Object.keys(ROUTE_ACCESS).filter((k) => ROUTE_ACCESS[k].act !== 'all')) expect(canActOnRoute(p, s)).toBe(false)
    for (const p of ['/agency/payroll', '/agency/rates', '/agency/billing', '/agency/erp', '/agency/team']) expect(canReadRoute(p, s)).toBe(false)
  })

  it('the team page is owner-only for every staff scope', () => {
    for (const scope of ['dispatcher', 'fleet_manager', 'finance', 'viewer']) expect(canReadRoute('/agency/team', staff(scope))).toBe(false)
  })

  it('a staff member with no recognised scope reads nothing scoped', () => {
    expect(canReadRoute('/agency/fleet', staff())).toBe(false)
    expect(canReadRoute('/agency/fleet', staff('bogus'))).toBe(false)
  })

  it('unknown paths and param routes resolve safely', () => {
    expect(routeAccessFor('/agency/clients/xyz/tariffs')).toBe(ROUTE_ACCESS['/agency/clients'])
    expect(routeAccessFor('/agency/fleet/')).toBe(ROUTE_ACCESS['/agency/fleet'])
    expect(canReadRoute('/somewhere/else', staff('viewer'))).toBe(true)
  })

  it('the denial title names the role', () => {
    expect(scopeDeniedTitle(['finance'])).toContain('Finance')
  })
})
