import { useMemo } from 'react'
import { useAuthStore } from '../stores/authStore'
import {
  canActOnRoute,
  canReadRoute,
  hasAnyScope,
  scopeDeniedTitle,
  type AgencyScope,
} from '../lib/agencyAccess'

const EMPTY_SCOPES: string[] = []

/**
 * Agency staff access of the signed-in user. Owners (and device-local sessions)
 * have every scope. For any other role the helpers are permissive: they only
 * restrict an active staff member, and the server stays the authority.
 */
export function useAgencyAccess() {
  const state = useAuthStore()
  const role = state.user?.role
  const ownerFlag = state.isAgencyOwner
  const agencyScopes = state.agencyScopes ?? EMPTY_SCOPES
  return useMemo(() => {
    // Only an explicit `false` marks a staff member; an unknown flag is treated as the owner (server still enforces).
    const isStaff = role === 'agency' && ownerFlag === false
    const input = { isAgencyOwner: !isStaff, agencyScopes }
    return {
      isStaff,
      isAgencyOwner: !isStaff,
      agencyScopes,
      canRead: (path: string) => canReadRoute(path, input),
      canAct: (path: string) => canActOnRoute(path, input),
      hasScope: (scopes: readonly AgencyScope[]) => hasAnyScope(input, scopes),
      deniedTitle: scopeDeniedTitle(agencyScopes),
    }
  }, [role, ownerFlag, agencyScopes])
}
