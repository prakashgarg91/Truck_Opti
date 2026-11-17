/**
 * Agency portal access decisions: pure, no Deno globals, no network, no secrets.
 *
 * Mirrors the database rule in 20261012000000_staff_scope_enforcement.sql
 * (agency_caller_agencies / resolve_caller_agency_for_scopes): an agency OWNER always
 * qualifies; an ACTIVE staff member qualifies only for an APPROVED agency and only when
 * the member scope is in the list allowed for the portal function. Staff never gain
 * write access through the portal functions: writes require the owner.
 */

export type StaffScope = 'dispatcher' | 'fleet_manager' | 'finance' | 'viewer'

export type PortalFunction = 'dashboard' | 'jobs' | 'billing' | 'rates' | 'drivers' | 'fleet'

/** Minimum scopes that may READ each portal function (owners are always allowed). */
export const PORTAL_READ_SCOPES: Readonly<Record<PortalFunction, readonly StaffScope[]>> = {
  dashboard: ['dispatcher', 'fleet_manager', 'finance', 'viewer'],
  jobs: ['dispatcher', 'fleet_manager', 'finance', 'viewer'],
  billing: ['finance'],
  rates: ['finance', 'dispatcher'],
  drivers: ['dispatcher', 'fleet_manager', 'finance'],
  fleet: ['fleet_manager', 'dispatcher'],
}

export interface OwnedAgencyRow {
  id: string
  status: string | null
}

export interface MembershipRow {
  agency_id: string
  scope: string
}

export interface AgencyStatusRow {
  id: string
  status: string | null
}

export type PortalAccess =
  | { ok: true; agencyId: string; agencyStatus: string | null; role: 'owner' }
  | { ok: true; agencyId: string; agencyStatus: string | null; role: 'staff'; scope: StaffScope }

export type PortalDenied = { ok: false; status: number; message: string }

export type PortalDecision = PortalAccess | PortalDenied

const STAFF_SCOPES: readonly string[] = ['dispatcher', 'fleet_manager', 'finance', 'viewer']

export function isStaffScope(value: unknown): value is StaffScope {
  return typeof value === 'string' && STAFF_SCOPES.includes(value)
}

export const PORTAL_MESSAGES = {
  agencyRequired: 'Agency access is required.',
  approvalRequired: 'Agency approval is required.',
  scopeDenied: 'Your access scope does not allow this action.',
  multipleAgencies: 'Multiple agency profiles found for this account.',
  ownerOnlyWrite: 'Only the agency owner can make changes here.',
} as const

function deny(status: number, message: string): PortalDenied {
  return { ok: false, status, message }
}

/**
 * Decides which agency the caller acts for on one portal function.
 *
 * owned        agencies the caller owns (transport_agencies.user_id = caller)
 * memberships  the caller's ACTIVE memberships (the caller filters status = 'active')
 * agencies     status rows for the membership agencies
 */
export function resolvePortalAccess(input: {
  portal: PortalFunction
  requireApproved: boolean
  owned: readonly OwnedAgencyRow[]
  memberships: readonly MembershipRow[]
  agencies: readonly AgencyStatusRow[]
}): PortalDecision {
  const allowed = PORTAL_READ_SCOPES[input.portal]
  const statusById = new Map<string, string | null>()
  for (const agency of input.agencies) {
    statusById.set(agency.id, agency.status)
  }

  const candidates = new Map<string, PortalAccess>()

  for (const agency of input.owned) {
    candidates.set(agency.id, {
      ok: true,
      agencyId: agency.id,
      agencyStatus: agency.status,
      role: 'owner',
    })
  }

  let staffOfUnapproved = false

  for (const membership of input.memberships) {
    if (candidates.has(membership.agency_id)) {
      continue
    }
    if (!isStaffScope(membership.scope)) {
      continue
    }
    const status = statusById.get(membership.agency_id) ?? null
    if (status !== 'approved') {
      staffOfUnapproved = true
      continue
    }
    if (!allowed.includes(membership.scope)) {
      continue
    }
    candidates.set(membership.agency_id, {
      ok: true,
      agencyId: membership.agency_id,
      agencyStatus: status,
      role: 'staff',
      scope: membership.scope,
    })
  }

  if (candidates.size === 0) {
    if (staffOfUnapproved) {
      return deny(403, PORTAL_MESSAGES.approvalRequired)
    }
    if (input.owned.length > 0 || input.memberships.length > 0) {
      return deny(403, PORTAL_MESSAGES.scopeDenied)
    }
    return deny(403, PORTAL_MESSAGES.agencyRequired)
  }

  if (candidates.size > 1) {
    return deny(409, PORTAL_MESSAGES.multipleAgencies)
  }

  const access = [...candidates.values()][0]

  if (input.requireApproved && access.agencyStatus !== 'approved') {
    return deny(403, PORTAL_MESSAGES.approvalRequired)
  }

  return access
}

/** Staff are read-only through the portal functions; any write needs the owner. */
export function canWriteThroughPortal(access: PortalAccess): boolean {
  return access.role === 'owner'
}
