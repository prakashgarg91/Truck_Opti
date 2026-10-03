/**
 * Surface-level sign-in method availability (TO-123).
 *
 * Single binding between the build-time environment and the canonical
 * capability model (`resolveAuthMethodCapabilities`), so every auth page
 * renders exactly the methods the model calls enabled — never a page-local
 * reinterpretation of the flags. A missing flag means "not enabled" (fail
 * closed), matching `summarizeAuthProviders` in scripts/production_config_policy.mjs:
 * cloud methods additionally require a configured Supabase backend, and
 * office password login stays a separate capability that never counts as a
 * cloud method.
 */
import { resolveAuthMethodCapabilities, type AuthMethodCapabilities } from './authCapabilities'
import { isSupabaseConfigured } from './supabase'

export const authSurfaceMethods: AuthMethodCapabilities = resolveAuthMethodCapabilities({
  supabaseConfigured: isSupabaseConfigured,
  emailOtpEnabled: import.meta.env.VITE_AUTH_EMAIL_OTP_ENABLED,
  phoneOtpEnabled: import.meta.env.VITE_AUTH_PHONE_OTP_ENABLED,
  passwordEnabled: import.meta.env.VITE_AUTH_PASSWORD_ENABLED,
})
