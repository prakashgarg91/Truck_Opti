/**
 * Agency staff access model for the UI. The DATABASE is the authority: every
 * command RPC resolves the caller through resolve_caller_agency_for_scopes /
 * agency_caller_agencies (20261012000000_staff_scope_enforcement.sql) and every
 * read goes through scope-aware RLS. This module only mirrors those scope lists
 * so the UI can hide or disable what a member can never use. The sets below are
 * derived from the migrations (CREATE POLICY ... agency_caller_agencies(ARRAY[...])
 * and resolve_caller_agency_for_scopes(ARRAY[...]) calls), not guessed:
 *
 *   dispatcher    jobs write, orders import/cancel, load plans, consignments, ERP
 *   fleet_manager trucks, driver employment/invitations, expenses, maintenance
 *   finance       clients/tariffs, invoices, expenses, payroll, driver rates, payouts
 *   viewer        read-only on the four-scope tables; nothing scope-exclusive
 *   owner         every scope plus team management and billing writes
 */

export const AGENCY_SCOPES = ['dispatcher', 'fleet_manager', 'finance', 'viewer'] as const
export type AgencyScope = (typeof AGENCY_SCOPES)[number]

export function isAgencyScope(value: unknown): value is AgencyScope {
  return typeof value === 'string' && (AGENCY_SCOPES as readonly string[]).includes(value)
}

type ScopeList = readonly AgencyScope[] | 'all' | 'owner'

export interface RouteAccess {
  /** Who can read the data behind the page (RLS select scopes). */
  read: ScopeList
  /** Who can use the page's primary actions (command RPC scopes). 'owner' = owner only. */
  act: ScopeList
}

const ALL: ScopeList = 'all'

/** Key = route path (no trailing slash, param routes use their prefix). */
export const ROUTE_ACCESS: Record<string, RouteAccess> = {
  '/agency/dashboard': { read: ALL, act: ALL },
  '/agency/profile': { read: ALL, act: 'owner' },
  '/agency/fleet': { read: ALL, act: ['fleet_manager'] },
  '/agency/drivers': { read: ALL, act: ['fleet_manager'] },
  '/agency/jobs': { read: ALL, act: ['dispatcher'] },
  '/agency/billing': { read: ['finance'], act: ['finance'] },
  '/agency/rates': { read: ['finance'], act: ['finance'] },
  '/agency/team': { read: 'owner', act: 'owner' },
  '/agency/clients': { read: ALL, act: ['finance'] },
  '/agency/orders/import': { read: ALL, act: ['dispatcher'] },
  '/agency/orders/plan': { read: ALL, act: ['dispatcher'] },
  '/agency/consignments': { read: ALL, act: ['dispatcher'] },
  '/agency/invoices': { read: ALL, act: ['finance'] },
  '/agency/expenses': { read: ALL, act: ['fleet_manager', 'finance'] },
  '/agency/tracking': { read: ALL, act: ['dispatcher', 'fleet_manager'] },
  '/agency/payroll': { read: ['finance'], act: ['finance'] },
  '/agency/erp': { read: ['dispatcher'], act: ['dispatcher'] },
  '/subscription': { read: ALL, act: 'owner' },
}

export interface AgencyAccessInput {
  isAgencyOwner: boolean
  agencyScopes: readonly string[]
}

function allows(list: ScopeList, input: AgencyAccessInput): boolean {
  if (input.isAgencyOwner) return true
  if (list === 'owner') return false
  if (list === 'all') return input.agencyScopes.some(isAgencyScope)
  return input.agencyScopes.some((s) => (list as readonly string[]).includes(s))
}

/** The ROUTE_ACCESS entry for a path (longest prefix wins), or undefined. */
export function routeAccessFor(pathname: string): RouteAccess | undefined {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (ROUTE_ACCESS[path]) return ROUTE_ACCESS[path]
  if (path.startsWith('/agency/clients/')) return ROUTE_ACCESS['/agency/clients']
  return undefined
}

export function canReadRoute(pathname: string, input: AgencyAccessInput): boolean {
  const access = routeAccessFor(pathname)
  return access ? allows(access.read, input) : true
}

export function canActOnRoute(pathname: string, input: AgencyAccessInput): boolean {
  const access = routeAccessFor(pathname)
  return access ? allows(access.act, input) : true
}

/** Explicit scope check for actions that differ from their page default. */
export function hasAnyScope(input: AgencyAccessInput, scopes: readonly AgencyScope[]): boolean {
  return input.isAgencyOwner || input.agencyScopes.some((s) => (scopes as readonly string[]).includes(s))
}

const SCOPE_LABEL: Record<AgencyScope, string> = {
  dispatcher: 'Dispatcher',
  fleet_manager: 'Fleet manager',
  finance: 'Finance',
  viewer: 'Viewer',
}

export function describeScopes(scopes: readonly string[]): string {
  const names = scopes.filter(isAgencyScope).map((s) => SCOPE_LABEL[s])
  return names.length ? names.join(', ') : 'staff'
}

export function scopeDeniedTitle(scopes: readonly string[]): string {
  return `Your staff role (${describeScopes(scopes)}) cannot do this. Ask the agency owner to change your access.`
}
