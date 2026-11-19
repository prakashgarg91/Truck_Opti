import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Whether the platform seller is registered under GST. One read of platform_gst_registered(),
// which exposes the flag only. Screens show GST copy from this answer and never guess it.

export type SellerGstStatus = 'loading' | 'ready' | 'error'

export interface SellerGstState {
  status: SellerGstStatus
  registered: boolean | null
}

/** registered / unregistered when the answer is known; unknown while loading or after a failure. */
export type TaxMode = 'registered' | 'unregistered' | 'unknown'

export const SELLER_GST_QUERY_KEY = ['platform-gst-registered'] as const

export async function fetchSellerGstRegistered(): Promise<boolean> {
  const { data, error } = await supabase.rpc('platform_gst_registered')
  if (error) throw error
  if (typeof data !== 'boolean') throw new Error('platform_gst_registered returned no boolean flag')
  return data
}

export function useSellerGstRegistered(): SellerGstState {
  const query = useQuery({
    queryKey: SELLER_GST_QUERY_KEY,
    queryFn: fetchSellerGstRegistered,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })

  if (query.isSuccess) return { status: 'ready', registered: query.data }
  if (query.isError) return { status: 'error', registered: null }
  return { status: 'loading', registered: null }
}

export function taxModeOf(state: SellerGstState): TaxMode {
  if (state.status !== 'ready' || state.registered === null) return 'unknown'
  return state.registered ? 'registered' : 'unregistered'
}
