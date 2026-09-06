import { createClient } from '@supabase/supabase-js'

// Supabase configuration - Environment variables REQUIRED for server features.
// When unset (local-first mode), the client points at an unroutable placeholder
// so the app boots and every Supabase call fails fast as an ordinary network
// error (already handled everywhere with friendly messages). Nothing throws.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = createClient(
  supabaseUrl || 'https://localhost.invalid',
  supabaseAnonKey || 'local-mode-no-key'
)

// Backend reachability probe for offline-first UX. Cached per session; never
// throws. SupabaseUrl NXDOMAIN / timeout => false (drives "Continue offline").
let reachabilityCache: boolean | null = null

export async function isSupabaseReachable(timeoutMs = 8000): Promise<boolean> {
  if (!isSupabaseConfigured) return false
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
