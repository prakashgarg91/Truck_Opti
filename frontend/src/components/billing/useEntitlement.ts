import { useQuery, useQueryClient } from '@tanstack/react-query'
import { entitlementApi, isAgencyMember } from '../../services/subscriptionApi'
import { useAuthStore } from '../../stores/authStore'
import { deriveBillingView, type BillingView, type Entitlement } from '../../lib/billingState'

export const ENTITLEMENT_QUERY_KEY = ['agency-subscription-entitlement'] as const

/**
 * Reads the entitlement RPC (the only read path). Other pages can use
 * `view.canCreate` to disable their create buttons; the server still enforces.
 *
 * The RPC is agency-only (an admin has no agency and gets a 400), so it is requested only for an
 * agency owner or staff member. While the auth store is still resolving access the query waits
 * and the hook reports loading. Everyone else gets the idle state: no entitlement, no view, not loading.
 */
export function useEntitlement(): {
  entitlement: Entitlement | undefined
  view: BillingView | null
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
} {
  const queryClient = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const isAgencyOwner = useAuthStore((s) => s.isAgencyOwner)
  const agencyScopes = useAuthStore((s) => s.agencyScopes)
  const accessResolving = useAuthStore((s) => s.isLoading)
  const isAgency = isAgencyMember({ role, isAgencyOwner, agencyScopes })
  const query = useQuery({
    queryKey: ENTITLEMENT_QUERY_KEY,
    queryFn: () => entitlementApi.get(),
    enabled: isAgency && !accessResolving,
    staleTime: 30_000,
    retry: 1,
  })
  return {
    entitlement: query.data,
    view: query.data ? deriveBillingView(query.data) : null,
    // A disabled query is not loading, so report the pending access resolution explicitly.
    isLoading: accessResolving || query.isLoading,
    isError: query.isError,
    refetch: () => queryClient.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY }),
  }
}
