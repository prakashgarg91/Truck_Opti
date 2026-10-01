/**
 * Canonical provider-capability model (TO-124).
 *
 * One explicit vocabulary for what a provider (cloud sign-in backend, cloud
 * sign-in method, office password login) actually supports, so that
 * "configured", "reachable", "operationally verified" and "intentionally
 * disabled" can never be conflated:
 *
 * - `intentionally_disabled` — deliberately off (explicit flag false / absent).
 *   NOT a pass and NOT a failure: reported as not applicable.
 * - `missing`                — nothing configured at all.
 * - `placeholder`            — configured with a documented placeholder value.
 * - `invalid`                — configured but malformed (e.g. non-https URL).
 * - `configured`             — valid-looking configuration is present. This
 *                              alone is never launch proof.
 * - `reachable`              — configured AND a bounded health probe succeeded.
 * - `operationally_verified` — a real end-to-end round trip (live OAuth sign-in,
 *                              live payment) succeeded. Only a live journey run
 *                              can claim this; static checks never report it.
 *
 * Cloud Google sign-in contract (TO-122): the Google button starts a trusted
 * Supabase OAuth round trip and is gated on the configured Supabase backend. A
 * Google Identity Services (GIS) client ID alone is device tooling, not cloud
 * sign-in proof.
 *
 * Office password login is a separate capability and never counts as a cloud
 * sign-in method. The approved policy is Supabase's configured minimum
 * password length (supabase/config.toml `minimum_password_length = 8`).
 *
 * This module is pure: no network calls except through the fetch function
 * passed to `probeSupabaseReachable`, and no logging of key values.
 */

export type CapabilityLevel =
  | 'intentionally_disabled'
  | 'missing'
  | 'placeholder'
  | 'invalid'
  | 'configured'
  | 'reachable'
  | 'operationally_verified'

/** Approved office password policy: supabase/config.toml minimum_password_length. */
export const OFFICE_PASSWORD_MIN_LENGTH = 8

/** Placeholder client used in local-first mode; never requested by our probes. */
export const LOCAL_FIRST_SUPABASE_URL = 'https://localhost.invalid'
export const LOCAL_FIRST_SUPABASE_KEY = 'local-mode-no-key'

export function isPlaceholderValue(value: string | undefined | null): boolean {
  if (!value) return true
  const lowered = String(value).trim().toLowerCase()
  return (
    lowered.length === 0 ||
    lowered.includes('replace_me') ||
    lowered.includes('your_') ||
    lowered.includes('placeholder')
  )
}

/**
 * A backend URL is valid when it parses, is https, and names a real remote
 * host. Placeholder values are rejected. Guaranteed-unresolvable hosts (e.g.
 * the reserved `.invalid` TLD) stay valid on purpose: an explicitly configured
 * dead backend must be probeable so the outage is reported honestly instead of
 * being pre-classified as a configuration typo.
 */
export function isValidHttpsBackendUrl(value: string | undefined | null): boolean {
  if (!value || isPlaceholderValue(value)) return false
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:') return false
    const hostname = parsed.hostname
    return (
      hostname.length > 0 &&
      hostname !== 'localhost' &&
      !hostname.endsWith('.localhost') &&
      !hostname.endsWith('.local')
    )
  } catch {
    return false
  }
}

export interface SupabaseConfigInput {
  supabaseUrl?: string
  supabaseAnonKey?: string
}

export interface SupabaseConfigResolution {
  /** `cloud` only when URL and key are both present, non-placeholder and valid. */
  mode: 'local_first' | 'cloud'
  level: CapabilityLevel
  /** Human-readable reason for local-first mode; never contains key values. */
  configError: string | null
  /** Sanitized backend URL in cloud mode, null in local-first mode. */
  supabaseUrl: string | null
  anonKeyPresent: boolean
  isConfigured: boolean
  /** Values handed to supabase-js; safe placeholders in local-first mode. */
  clientUrl: string
  clientKey: string
}

/**
 * Resolve the Supabase backend configuration. Any missing, placeholder or
 * invalid piece resolves to local-first mode with a safe placeholder client so
 * that auth initialization makes no requests to an absent backend.
 */
export function resolveSupabaseConfig(input: SupabaseConfigInput): SupabaseConfigResolution {
  const url = input.supabaseUrl?.trim() ?? ''
  const key = input.supabaseAnonKey?.trim() ?? ''
  const anonKeyPresent = key.length > 0 && !isPlaceholderValue(key)

  let configError: string | null = null
  let level: CapabilityLevel = 'configured'

  if (!url) {
    configError = 'VITE_SUPABASE_URL is not set; running in local-first mode'
    level = 'missing'
  } else if (isPlaceholderValue(url)) {
    configError = 'VITE_SUPABASE_URL is a placeholder value; running in local-first mode'
    level = 'placeholder'
  } else if (!isValidHttpsBackendUrl(url)) {
    configError = 'VITE_SUPABASE_URL must be a valid https backend URL; running in local-first mode'
    level = 'invalid'
  } else if (!key) {
    configError = 'VITE_SUPABASE_ANON_KEY is not set; running in local-first mode'
    level = 'missing'
  } else if (isPlaceholderValue(key)) {
    configError = 'VITE_SUPABASE_ANON_KEY is a placeholder value; running in local-first mode'
    level = 'placeholder'
  }

  if (configError !== null) {
    return {
      mode: 'local_first',
      level,
      configError,
      supabaseUrl: null,
      anonKeyPresent,
      isConfigured: false,
      clientUrl: LOCAL_FIRST_SUPABASE_URL,
      clientKey: LOCAL_FIRST_SUPABASE_KEY,
    }
  }

  return {
    mode: 'cloud',
    level: 'configured',
    configError: null,
    supabaseUrl: url,
    anonKeyPresent: true,
    isConfigured: true,
    clientUrl: url,
    clientKey: key,
  }
}

/** Minimal structural fetch contract the probe needs (satisfied by global fetch). */
export type ReachabilityFetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean }>

/**
 * Bounded reachability probe for an explicitly configured backend. Never
 * throws, never logs responses; an invalid or absent URL never triggers a
 * request. A non-ok health response counts as unreachable (fail closed).
 */
export async function probeSupabaseReachable(
  fetchFn: ReachabilityFetch,
  supabaseUrl: string | undefined | null,
  { timeoutMs = 8000 }: { timeoutMs?: number } = {}
): Promise<boolean> {
  if (!isValidHttpsBackendUrl(supabaseUrl)) return false
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchFn(`${supabaseUrl}/auth/v1/health`, { signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export type AuthMethodId = 'google' | 'email_otp' | 'phone_otp' | 'office_password'

export interface AuthMethodCapability {
  id: AuthMethodId
  enabled: boolean
  level: CapabilityLevel
  /** Human-readable state; safe for display, contains no secret values. */
  detail: string
}

export interface AuthMethodCapabilities {
  google: AuthMethodCapability
  emailOtp: AuthMethodCapability
  phoneOtp: AuthMethodCapability
  officePassword: AuthMethodCapability
  /** True only when at least one cloud sign-in method is usable. */
  hasCloudMethod: boolean
}

export interface AuthMethodInput {
  supabaseConfigured: boolean
  /** Explicit flag values; a missing flag means "not enabled" (fail closed). */
  emailOtpEnabled?: string
  phoneOtpEnabled?: string
  passwordEnabled?: string
}

/**
 * Resolve per-method sign-in capabilities. Cloud methods (Google via Supabase
 * OAuth, email OTP, phone OTP) all require the configured Supabase backend;
 * flags alone are not enough. Office password login is tracked separately and
 * never counts toward `hasCloudMethod`.
 */
export function resolveAuthMethodCapabilities(input: AuthMethodInput): AuthMethodCapabilities {
  const flagOn = (value?: string) => value === 'true'

  const google: AuthMethodCapability = input.supabaseConfigured
    ? {
        id: 'google',
        enabled: true,
        level: 'configured',
        detail:
          'Google sign-in runs as a trusted Supabase OAuth round trip; hosted provider enablement and a live sign-in are still required for operational verification',
      }
    : {
        id: 'google',
        enabled: false,
        level: 'missing',
        detail: 'Google sign-in requires a configured Supabase backend (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY)',
      }

  const emailOtp: AuthMethodCapability = flagOn(input.emailOtpEnabled)
    ? input.supabaseConfigured
      ? { id: 'email_otp', enabled: true, level: 'configured', detail: 'Email OTP is enabled against the configured Supabase backend' }
      : { id: 'email_otp', enabled: false, level: 'missing', detail: 'Email OTP flag is set to true but the Supabase backend is not configured' }
    : {
        id: 'email_otp',
        enabled: false,
        level: 'intentionally_disabled',
        detail: 'Email OTP is disabled (explicit flag required to enable it)',
      }

  const phoneOtp: AuthMethodCapability = flagOn(input.phoneOtpEnabled)
    ? input.supabaseConfigured
      ? { id: 'phone_otp', enabled: true, level: 'configured', detail: 'Phone OTP is enabled against the configured Supabase backend' }
      : { id: 'phone_otp', enabled: false, level: 'missing', detail: 'Phone OTP flag is set to true but the Supabase backend is not configured' }
    : {
        id: 'phone_otp',
        enabled: false,
        level: 'intentionally_disabled',
        detail: 'Phone OTP is disabled (explicit flag required to enable it)',
      }

  const officePassword: AuthMethodCapability = flagOn(input.passwordEnabled)
    ? {
        id: 'office_password',
        enabled: true,
        level: 'configured',
        detail: `Office password login is enabled; the approved Supabase password policy (minimum ${OFFICE_PASSWORD_MIN_LENGTH} characters) and office account provisioning must be verified live`,
      }
    : {
        id: 'office_password',
        enabled: false,
        level: 'intentionally_disabled',
        detail: 'Office password login is disabled (explicit flag required to enable it)',
      }

  return {
    google,
    emailOtp,
    phoneOtp,
    officePassword,
    hasCloudMethod: google.enabled || emailOtp.enabled || phoneOtp.enabled,
  }
}

export interface OfficePasswordValidation {
  ok: boolean
  error: string | null
}

/** Enforce the approved office password policy (minimum length from supabase/config.toml). */
export function validateOfficePassword(password: string): OfficePasswordValidation {
  if (!password || password.length < OFFICE_PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      error: `Office passwords must be at least ${OFFICE_PASSWORD_MIN_LENGTH} characters.`,
    }
  }
  return { ok: true, error: null }
}
