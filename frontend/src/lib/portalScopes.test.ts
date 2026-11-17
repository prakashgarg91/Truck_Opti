import { describe, expect, it } from 'vitest'
import {
  canWriteThroughPortal,
  PORTAL_READ_SCOPES,
  resolvePortalAccess,
  type PortalFunction,
} from '../../../supabase/functions/_shared/portalScopes.ts'

const A = 'agency-a'
const B = 'agency-b'
const PORTALS: PortalFunction[] = ['dashboard', 'jobs', 'billing', 'rates', 'drivers', 'fleet']

function staff(portal: PortalFunction, scope: string, status: string | null = 'approved') {
  return resolvePortalAccess({
    portal,
    requireApproved: false,
    owned: [],
    memberships: [{ agency_id: A, scope }],
    agencies: [{ id: A, status }],
  })
}

describe('portal scope matrix', () => {
  it('lets every active scope read the dashboard and jobs', () => {
    for (const portal of ['dashboard', 'jobs'] as const) {
      for (const scope of ['dispatcher', 'fleet_manager', 'finance', 'viewer']) {
        expect(staff(portal, scope)).toMatchObject({ ok: true, agencyId: A, role: 'staff', scope })
      }
    }
  })

  it('billing is finance only', () => {
    expect(staff('billing', 'finance')).toMatchObject({ ok: true, role: 'staff' })
    for (const scope of ['dispatcher', 'fleet_manager', 'viewer']) {
      expect(staff('billing', scope)).toMatchObject({
        ok: false,
        status: 403,
        message: 'Your access scope does not allow this action.',
      })
    }
  })

  it('rates: finance and dispatcher read', () => {
    expect(staff('rates', 'finance').ok).toBe(true)
    expect(staff('rates', 'dispatcher').ok).toBe(true)
    expect(staff('rates', 'fleet_manager').ok).toBe(false)
    expect(staff('rates', 'viewer').ok).toBe(false)
  })

  it('drivers: dispatcher, fleet_manager, finance read; viewer refused', () => {
    expect(staff('drivers', 'dispatcher').ok).toBe(true)
    expect(staff('drivers', 'fleet_manager').ok).toBe(true)
    expect(staff('drivers', 'finance').ok).toBe(true)
    expect(staff('drivers', 'viewer').ok).toBe(false)
  })

  it('fleet: fleet_manager and dispatcher read', () => {
    expect(staff('fleet', 'fleet_manager').ok).toBe(true)
    expect(staff('fleet', 'dispatcher').ok).toBe(true)
    expect(staff('fleet', 'finance').ok).toBe(false)
    expect(staff('fleet', 'viewer').ok).toBe(false)
  })

  it('declares a non-empty scope list for every portal function', () => {
    for (const portal of PORTALS) {
      expect(PORTAL_READ_SCOPES[portal].length).toBeGreaterThan(0)
    }
  })

  it('unknown scope values never qualify', () => {
    expect(staff('dashboard', 'owner')).toMatchObject({ ok: false, status: 403 })
    expect(staff('dashboard', '')).toMatchObject({ ok: false, status: 403 })
  })
})

describe('owners', () => {
  it('keep full access on every portal function, even for a pending agency when approval is not required', () => {
    for (const portal of PORTALS) {
      const decision = resolvePortalAccess({
        portal,
        requireApproved: false,
        owned: [{ id: A, status: 'pending' }],
        memberships: [],
        agencies: [],
      })
      expect(decision).toMatchObject({ ok: true, agencyId: A, role: 'owner', agencyStatus: 'pending' })
      if (decision.ok) expect(canWriteThroughPortal(decision)).toBe(true)
    }
  })

  it('are blocked when approval is required and the agency is not approved', () => {
    expect(
      resolvePortalAccess({
        portal: 'fleet',
        requireApproved: true,
        owned: [{ id: A, status: 'pending' }],
        memberships: [],
        agencies: [],
      }),
    ).toMatchObject({ ok: false, status: 403, message: 'Agency approval is required.' })
  })

  it('an owner who is also staff of the same agency stays the owner', () => {
    const decision = resolvePortalAccess({
      portal: 'billing',
      requireApproved: false,
      owned: [{ id: A, status: 'approved' }],
      memberships: [{ agency_id: A, scope: 'viewer' }],
      agencies: [{ id: A, status: 'approved' }],
    })
    expect(decision).toMatchObject({ ok: true, role: 'owner' })
  })
})

describe('staff are never writers and unapproved agencies stay blocked', () => {
  it('staff cannot write through the portal functions', () => {
    for (const portal of PORTALS) {
      for (const scope of PORTAL_READ_SCOPES[portal]) {
        const decision = staff(portal, scope)
        expect(decision.ok).toBe(true)
        if (decision.ok) expect(canWriteThroughPortal(decision)).toBe(false)
      }
    }
  })

  it('staff of an unapproved agency are blocked', () => {
    for (const status of ['pending', 'suspended', 'rejected', null]) {
      expect(staff('dashboard', 'dispatcher', status)).toMatchObject({
        ok: false,
        status: 403,
        message: 'Agency approval is required.',
      })
    }
  })
})

describe('no or many agencies', () => {
  it('a caller with nothing gets the agency-required refusal', () => {
    expect(
      resolvePortalAccess({ portal: 'jobs', requireApproved: false, owned: [], memberships: [], agencies: [] }),
    ).toEqual({ ok: false, status: 403, message: 'Agency access is required.' })
  })

  it('two owned agencies are refused with 409, like the SQL resolver', () => {
    expect(
      resolvePortalAccess({
        portal: 'jobs',
        requireApproved: false,
        owned: [
          { id: A, status: 'approved' },
          { id: B, status: 'approved' },
        ],
        memberships: [],
        agencies: [],
      }),
    ).toMatchObject({ ok: false, status: 409, message: 'Multiple agency profiles found for this account.' })
  })

  it('an owner who also staffs another agency is ambiguous (409)', () => {
    expect(
      resolvePortalAccess({
        portal: 'jobs',
        requireApproved: false,
        owned: [{ id: A, status: 'approved' }],
        memberships: [{ agency_id: B, scope: 'viewer' }],
        agencies: [{ id: B, status: 'approved' }],
      }),
    ).toMatchObject({ ok: false, status: 409 })
  })
})
