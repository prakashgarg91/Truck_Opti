import { createClient } from '@supabase/supabase-js'
import {
  probeSupabaseReachable,
  resolveSupabaseConfig,
  type SupabaseConfigResolution,
} from './authCapabilities'

// Supabase configuration - Environment variables REQUIRED for cloud features.
// Capability resolution (TO-124): missing, placeholder or invalid values
// (e.g. the documented .env.example placeholders) resolve to local-first mode
// with a safe placeholder client, so auth initialization never sends requests
// to an absent backend. In cloud mode an explicitly configured but unreachable
// backend is handled with a bounded reachability probe that fails closed.
const resolution: SupabaseConfigResolution = resolveSupabaseConfig({
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
})

/** True only when a valid https backend URL and a real anon key are configured. */
export const isSupabaseConfigured = resolution.isConfigured

/** Human-readable local-first reason (missing/placeholder/invalid); never contains key values. */
export const supabaseConfigError = resolution.configError

/** Full capability resolution for callers that need the proof level. */
export const supabaseConfigResolution = resolution

export const supabase = createClient(resolution.clientUrl, resolution.clientKey)

// Backend reachability probe for offline-first UX. Cached per session; never
// throws and never requests a placeholder backend. A configured but
// unreachable backend (NXDOMAIN / timeout) => false (drives "Continue offline")
// within the bounded timeout.
let reachabilityCache: boolean | null = null

export async function isSupabaseReachable(timeoutMs = 8000): Promise<boolean> {
  if (!isSupabaseConfigured || !resolution.supabaseUrl) return false
  if (reachabilityCache !== null) return reachabilityCache
  reachabilityCache = await probeSupabaseReachable(fetch, resolution.supabaseUrl, { timeoutMs })
  return reachabilityCache
}
