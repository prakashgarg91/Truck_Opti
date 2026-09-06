import { createClient } from '@supabase/supabase-js'

// Supabase configuration - Environment variables REQUIRED
// No hardcoded fallback values for security
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Validate environment variables are set
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables. ' +
    'Please ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in your .env file.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Backend reachability probe for offline-first UX. Cached per session; never
// throws. SupabaseUrl NXDOMAIN / timeout => false (drives "Continue offline").
let reachabilityCache: boolean | null = null

export async function isSupabaseReachable(timeoutMs = 8000): Promise<boolean> {
  if (reachabilityCache !== null) return reachabilityCache
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${supabaseUrl}/auth/v1/health`, { signal: ctrl.signal })
      reachabilityCache = res.ok
    } finally {
      clearTimeout(timer)
    }
  } catch {
    reachabilityCache = false
  }
  return reachabilityCache
}
