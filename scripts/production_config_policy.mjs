// Production provider-capability policy (TO-124).
//
// One explicit vocabulary for provider capability, shared with the frontend
// model in frontend/src/lib/authCapabilities.ts:
//   intentionally_disabled | missing | placeholder | invalid | configured |
//   reachable | operationally_verified
//
// Statuses used by audits: 'pass' (requirement met at its provable level),
// 'fail' (requirement not met), 'not_applicable' (intentionally disabled).
// Static configuration checks can never report 'operationally_verified' — a
// live round trip (OAuth sign-in, real payment) is always required before a
// production-ready verdict.
//
// Cloud Google sign-in contract (TO-122): Google is provided through the
// configured Supabase backend (signInWithOAuth). A Google Identity Services
// (GIS) client ID alone is device tooling, not cloud sign-in proof.
//
// Secrets policy: checkers may report presence/absence of keys but never echo
// key or secret values, and never log raw HTTP response bodies.

export function isPlaceholder(value) {
  if (!value) return true
  const lowered = String(value).trim().toLowerCase()
  return (
    lowered.length === 0 ||
    lowered.includes('replace_me') ||
    lowered.includes('your_') ||
    lowered.includes('placeholder')
  )
}

export function shouldRunEmailOtpFallback({ emailChannelCount = 0 } = {}) {
  return Number(emailChannelCount) > 0
}

/**
 * A production backend URL is valid when it parses, is https and names a real
 * remote host. Guaranteed-unresolvable hosts (reserved `.invalid` TLD) stay
 * valid so an explicitly configured dead backend is probed and reported as an
 * outage instead of being pre-classified as invalid.
 */
export function isValidBackendUrl(value) {
  if (!value || isPlaceholder(value)) return false
  let parsed
  try {
    parsed = new URL(String(value).trim())
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const hostname = parsed.hostname
  return (
    hostname.length > 0 &&
    hostname !== 'localhost' &&
    !hostname.endsWith('.localhost') &&
    !hostname.endsWith('.local')
  )
}

export function shouldRunSupabaseHealthCheck(supabaseUrl) {
  return isValidBackendUrl(supabaseUrl)
}

// --- Supabase client key -------------------------------------------------------

export function summarizeSupabaseClientKey(anonKey) {
  if (!anonKey) {
    return {
      status: 'fail',
      level: 'missing',
      detail: 'missing VITE_SUPABASE_ANON_KEY; the cloud auth backend cannot authenticate client requests',
    }
  }
  if (isPlaceholder(anonKey)) {
    return {
      status: 'fail',
      level: 'placeholder',
      detail: 'VITE_SUPABASE_ANON_KEY is a placeholder value; configure the real public anon key',
    }
  }
  return {
    status: 'pass',
    level: 'configured',
    detail: 'Supabase anon key present (public client key; value not logged)',
  }
}

// --- Supabase backend URL + reachability ----------------------------------------

/**
 * Validate the backend URL, resolve DNS, then run a bounded health request.
 * DNS-only reachability is NOT sufficient: the backend must answer its health
 * endpoint. Failure details never include key values or response bodies.
 */
export async function summarizeSupabaseBackendUrl(
  url,
  { dnsLookup, fetchHealth, healthTimeoutMs = 10000 } = {}
) {
  if (!url) {
    return {
      status: 'fail',
      level: 'missing',
      detail: 'missing VITE_SUPABASE_URL; cloud auth backend is not configured (local-first mode)',
    }
  }
  if (isPlaceholder(url)) {
    return {
      status: 'fail',
      level: 'placeholder',
      detail: 'VITE_SUPABASE_URL is a placeholder value; configure the real Supabase project URL',
    }
  }
  if (!isValidBackendUrl(url)) {
    return {
      status: 'fail',
      level: 'invalid',
      detail: 'VITE_SUPABASE_URL must be a valid https backend URL (no http/localhost)',
    }
  }

  const hostname = new URL(url.trim()).hostname

  if (typeof dnsLookup === 'function') {
    try {
      await dnsLookup(hostname)
    } catch (error) {
      return {
        status: 'fail',
        level: 'configured',
        detail: `DNS lookup failed for ${hostname}: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }

  try {
    const doFetch =
      typeof fetchHealth === 'function'
        ? fetchHealth
        : (target) => fetch(target, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(healthTimeoutMs) })
    const response = await doFetch(`${url.trim().replace(/\/+$/, '')}/auth/v1/health`)
    if (response && response.ok) {
      return {
        status: 'pass',
        level: 'reachable',
        detail: 'Supabase auth backend reachable (health check passed)',
      }
    }
    return {
      status: 'fail',
      level: 'configured',
      detail: `Supabase auth health check returned HTTP ${response ? response.status : 'unknown'}; backend is configured but not healthy`,
    }
  } catch (error) {
    return {
      status: 'fail',
      level: 'configured',
      detail: `Supabase auth health request failed: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

// --- auth provider configuration --------------------------------------------------

function isSupabaseBackendConfigured(config = {}) {
  return isValidBackendUrl(config.VITE_SUPABASE_URL) && !isPlaceholder(config.VITE_SUPABASE_ANON_KEY)
}

/**
 * Count only cloud sign-in methods that are BOTH explicitly enabled and backed
 * by a configured Supabase backend. Google is cloud sign-in via the Supabase
 * backend (TO-122); a GIS client ID alone is never sufficient proof. Office
 * password login is intentionally excluded here (see summarizeOfficePassword).
 */
export function summarizeAuthProviders(config = {}) {
  const backendConfigured = isSupabaseBackendConfigured(config)
  const cloudMethods = []
  const notes = []

  if (config.VITE_AUTH_EMAIL_OTP_ENABLED === 'true') {
    if (backendConfigured) {
      cloudMethods.push('email OTP (Supabase)')
    } else {
      notes.push('VITE_AUTH_EMAIL_OTP_ENABLED=true but the Supabase backend is not configured')
    }
  }

  if (config.VITE_AUTH_PHONE_OTP_ENABLED === 'true') {
    if (backendConfigured) {
      cloudMethods.push('phone OTP (Supabase)')
    } else {
      notes.push('VITE_AUTH_PHONE_OTP_ENABLED=true but the Supabase backend is not configured')
    }
  }

  if (backendConfigured) {
    cloudMethods.push('Google (via Supabase OAuth)')
  }

  const gisClientIdPresent = !isPlaceholder(config.VITE_GOOGLE_CLIENT_ID)
  if (gisClientIdPresent && !backendConfigured) {
    notes.push('a GIS client ID alone is not cloud sign-in proof; cloud Google sign-in requires the configured Supabase backend')
  }

  if (cloudMethods.length === 0) {
    return {
      status: 'fail',
      level: 'missing',
      cloudMethods,
      detail: `no production cloud authentication method is configured${notes.length ? `; ${notes.join('; ')}` : ''}`,
    }
  }

  return {
    status: 'pass',
    level: 'configured',
    cloudMethods,
    liveProofRequired: true,
    detail: `configured production cloud authentication methods: ${cloudMethods.join(', ')}; hosted provider enablement and a live sign-in round trip are required before operational readiness`,
  }
}

// --- office password policy ---------------------------------------------------------

export const OFFICE_PASSWORD_MIN_LENGTH = 8

/**
 * Office password login is a separate capability, never a cloud sign-in
 * method. Disabled => not_applicable. Enabled => the approved Supabase hosted
 * password policy (minimum_password_length = 8, supabase/config.toml) and
 * office account provisioning must be verified live; a static config audit
 * cannot prove either, so it fails closed.
 */
export function summarizeOfficePassword(config = {}) {
  if (config.VITE_AUTH_PASSWORD_ENABLED !== 'true') {
    return {
      status: 'not_applicable',
      level: 'intentionally_disabled',
      detail: 'office password login is disabled (approved Google-only launch path); it is not a cloud sign-in method',
    }
  }
  return {
    status: 'fail',
    level: 'configured',
    liveProofRequired: true,
    detail: `office password login is enabled; the approved Supabase password policy (minimum ${OFFICE_PASSWORD_MIN_LENGTH} characters) and office account provisioning must be verified live before production`,
  }
}

// --- payments -------------------------------------------------------------------------

export function summarizeRazorpay(keyId, clientExposedSecret) {
  if (!keyId) {
    return {
      status: 'fail',
      level: 'missing',
      detail: 'missing VITE_RAZORPAY_KEY_ID; Razorpay is the selected production payment provider',
    }
  }
  if (clientExposedSecret && !isPlaceholder(clientExposedSecret)) {
    return {
      status: 'fail',
      level: 'invalid',
      detail: 'client-exposed VITE_RAZORPAY_KEY_SECRET must be removed; keep RAZORPAY_KEY_SECRET server-side only',
    }
  }
  if (String(keyId).startsWith('rzp_live_')) {
    return {
      status: 'pass',
      level: 'configured',
      liveProofRequired: true,
      detail: 'live Razorpay public key present; verify server-side RAZORPAY_KEY_SECRET via real payment flow before launch',
    }
  }
  if (String(keyId).startsWith('rzp_test_')) {
    return {
      status: 'fail',
      level: 'invalid',
      detail: 'test Razorpay key is still configured; test keys are prohibited in production',
    }
  }
  return { status: 'fail', level: 'invalid', detail: 'Razorpay public key is not launch-ready' }
}

const ALLOWED_PHONEPE_HOSTS = ['api.phonepe.com', 'mercury.phonepe.com', 'api-preprod.phonepe.com']
const PHONEPE_PRODUCTION_HOSTS = ['api.phonepe.com', 'mercury.phonepe.com']

/**
 * PhonePe is optional: fully absent configuration is an intentionally disabled
 * capability (not_applicable), never a false pass and never a launch proof.
 * Partial configuration is a failure. A sandbox/preprod URL selected for
 * production is a failure.
 */
export function summarizePhonePe({ merchantId, apiUrl } = {}) {
  const merchantConfigured = Boolean(merchantId) && !isPlaceholder(merchantId)
  const apiConfigured = Boolean(apiUrl) && !isPlaceholder(apiUrl)

  if (!merchantConfigured && !apiConfigured) {
    return {
      status: 'not_applicable',
      level: 'intentionally_disabled',
      detail: 'PhonePe is not configured and is treated as intentionally disabled; it is not launch-verified',
    }
  }

  if (!merchantConfigured || !apiConfigured) {
    return {
      status: 'fail',
      level: 'missing',
      detail: 'PhonePe is partially configured; set both VITE_PHONEPE_MERCHANT_ID and VITE_PHONEPE_API_URL or remove both',
    }
  }

  let parsed
  try {
    parsed = new URL(String(apiUrl).trim())
  } catch {
    return { status: 'fail', level: 'invalid', detail: 'VITE_PHONEPE_API_URL is not a valid URL' }
  }

  if (parsed.protocol !== 'https:') {
    return { status: 'fail', level: 'invalid', detail: 'VITE_PHONEPE_API_URL must be https' }
  }

  const host = parsed.hostname
  if (!ALLOWED_PHONEPE_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))) {
    return { status: 'fail', level: 'invalid', detail: `unexpected PhonePe API URL host: ${host}` }
  }

  const lowered = String(apiUrl).toLowerCase()
  if (lowered.includes('sandbox') || lowered.includes('preprod')) {
    return {
      status: 'fail',
      level: 'configured',
      detail: 'PhonePe is configured with a sandbox/preprod URL; production launch requires the api.phonepe.com production endpoint',
    }
  }

  if (!PHONEPE_PRODUCTION_HOSTS.includes(host)) {
    return {
      status: 'fail',
      level: 'configured',
      detail: `PhonePe host ${host} is not the production endpoint (api.phonepe.com)`,
    }
  }

  return {
    status: 'pass',
    level: 'configured',
    liveProofRequired: true,
    detail: 'PhonePe production API URL configured; live provider verification is required before launch',
  }
}

// --- app URL and secret exposure ----------------------------------------------------------

export function summarizeAppUrl(appUrl) {
  if (!appUrl) {
    return { status: 'fail', level: 'missing', detail: 'missing VITE_APP_URL' }
  }
  if (!isValidBackendUrl(appUrl)) {
    return {
      status: 'fail',
      level: 'invalid',
      detail: 'VITE_APP_URL must be a valid https URL for production (http/localhost is not launch-ready)',
    }
  }
  return { status: 'pass', level: 'configured', detail: appUrl }
}

const VITE_SECRET_NAME_PATTERN = /(SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|_TOKEN)/i
// Boolean capability flags (e.g. VITE_AUTH_PASSWORD_ENABLED) are not secrets.
const VITE_FLAG_NAME_PATTERN = /_ENABLED$/i

/**
 * Fail when any VITE_-exposed variable is secret-shaped with a real value.
 * Offender NAMES are reported; values are never echoed.
 */
export function summarizeViteSecretExposure(config = {}) {
  const offenders = Object.keys(config)
    .filter((name) => !VITE_FLAG_NAME_PATTERN.test(name))
    .filter((name) => name.startsWith('VITE_') && VITE_SECRET_NAME_PATTERN.test(name))
    .filter((name) => config[name] && !isPlaceholder(config[name]))

  if (offenders.length > 0) {
    return {
      status: 'fail',
      level: 'invalid',
      offenders,
      detail: `secret-shaped values are exposed to the client bundle: ${offenders.join(', ')}; remove them from VITE_ configuration and keep secrets server-side`,
    }
  }
  return {
    status: 'pass',
    level: 'configured',
    offenders: [],
    detail: 'no secret-shaped VITE_ variables are exposed',
  }
}
