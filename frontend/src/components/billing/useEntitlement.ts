import { useQuery, useQueryClient } from '@tanstack/react-query'
import { entitlementApi } from '../../services/subscriptionApi'
import { deriveBillingView, type BillingView, type Entitlement } from '../../lib/billingState'

export const ENTITLEMENT_QUERY_KEY = ['agency-subscription-entitlement'] as const

/**
 * Reads the entitlement RPC (the only read path). Other pages can use
 * `view.canCreate` to disable their create buttons; the server still enforces.
 */
export function useEntitlement(): {
  entitlement: Entitlement | undefined
  view: BillingView | null
  isLoading: boolean
  isError: boolean
  refetch: () => Promise<unknown>
} {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ENTITLEMENT_QUERY_KEY,
    queryFn: () => entitlementApi.get(),
    staleTime: 30_000,
    retry: 1,
  })
  return {
    entitlement: query.data,
    view: query.data ? deriveBillingView(query.data) : null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => queryClient.invalidateQueries({ queryKey: ENTITLEMENT_QUERY_KEY }),
  }
}
