import * as Sentry from '@sentry/react'

/**
 * Centralized, sanitized production error reporting (TO-132).
 *
 * Policy enforced here:
 * - Production errors are reportable: caught failures (`logger.error`, error
 *   boundaries) and uncaught `error` / `unhandledrejection` events are
 *   forwarded to the reporting backend through one funnel.
 * - Bounded redaction: passwords, OTPs, bearer/JWT credentials, cookies, query
 *   credentials, payment details (cards, UPI/VPA, bank identifiers) and KYC
 *   identifiers (Aadhaar/PAN/passport/licence/document URLs) are replaced
 *   before an event leaves the browser. Depth, key, array and string sizes are
 *   capped so redaction cannot itself stall the app.
 * - Default PII reporting is off (`sendDefaultPii: false`), the user payload is
 *   reduced to an opaque id, and `ui.input` breadcrumbs are dropped.
 * - Replay is disabled (session and on-error sample rates are 0 and no replay
 *   integration is installed). Enabling it requires explicit approval plus
 *   masking configuration; this module does not do that.
 * - Sentry absent mode: with no DSN, nothing is initialized, no global handlers
 *   are installed and every reporting call is a safe no-op.
 * - Reporting must never break the app: all backend calls are wrapped so a
 *   reporting failure cannot propagate into user flows.
 *
 * The Sentry defaults for `GlobalHandlers` are disabled because this module
 * installs and owns the uncaught-error/unhandled-rejection capture path, which
 * keeps capture behavior identical in enabled and absent mode and makes it
 * testable. `/healthz` and `/readyz` (server.js) are process liveness and
 * artifact readiness only; neither proves Supabase or provider health.
 */

declare global {
  interface Window {
    /** Set after a staging monitoring probe is sent, so tooling can read the event id. */
    __truckoptiMonitoringProbe?: string
  }
}

const REDACTED = '[REDACTED]'
const REDACTED_AADHAAR = '[REDACTED_AADHAAR]'
const REDACTED_CARD = '[REDACTED_CARD]'
const REDACTED_EMAIL = '[REDACTED_EMAIL]'
const REDACTED_PAN = '[REDACTED_PAN]'
const REDACTED_PHONE = '[REDACTED_PHONE]'

const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 20
const MAX_OBJECT_KEYS = 50
const MAX_STRING_LENGTH = 2000
/** Strings longer than this are cut before redaction regexes run (bounded work). */
const MAX_STRING_SCAN_LENGTH = 100_000

const DEFAULT_RELEASE = 'truckopti-web@unknown'

/* -------------------------------------------------------------------------- */
/* Key-based redaction                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Key names whose values are always replaced with `[REDACTED]`, regardless of
 * their content. Keys are split into lowercase tokens (camelCase and
 * separators) before matching so `company_name` is not mistaken for `pan` and
 * `error_code` is not mistaken for an OTP code.
 */
const SENSITIVE_KEY_TOKENS = new Set<string>([
  'password',
  'passwd',
  'pwd',
  'pass',
  'secret',
  'secrets',
  'token',
  'tokens',
  'jwt',
  'otp',
  'passcode',
  'pin',
  'cvv',
  'cvc',
  'cvv2',
  'card',
  'cardnumber',
  'aadhaar',
  'aadhar',
  'pan',
  'passport',
  'licence',
  'license',
  'dl',
  'kyc',
  'document',
  'documents',
  'doc',
  'docs',
  'authorization',
  'auth',
  'cookie',
  'cookies',
  'credential',
  'credentials',
  'signature',
  'apikey',
  'session',
  'refresh',
  'private',
  'bearer',
  'upi',
  'vpa',
  'ifsc',
  'account',
  'iban',
  'email',
  'phone',
  'mobile',
])

/** Tokens that make any `*_key`/`key*` name sensitive (`api_key`, `secretKey`, ...). */
const KEY_PAIR_TOKENS = new Set<string>([
  'api',
  'secret',
  'private',
  'access',
  'signing',
  'encryption',
  'auth',
  'token',
  'password',
])

const splitKeyTokens = (key: string): string[] =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean)

/** Returns true when a payload key name is treated as carrying a secret or PII. */
export function isSensitiveKey(key: string): boolean {
  const tokens = splitKeyTokens(key)
  if (tokens.some((token) => SENSITIVE_KEY_TOKENS.has(token))) {
    return true
  }
  return tokens.includes('key') && tokens.some((token) => KEY_PAIR_TOKENS.has(token))
}

/* -------------------------------------------------------------------------- */
/* Value-based redaction                                                      */
/* -------------------------------------------------------------------------- */

const AUTH_SCHEME_RE = /\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{6,}/gi
const JWT_RE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/g
const PROVIDER_KEY_RE = /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{6,}\b/g
const GOOGLE_KEY_RE = /\bAIza[0-9A-Za-z_-]{30,}\b/g
/** `name=value` pairs whose name looks credential-ish (queries, cookies, k=v logs). */
const KEY_VALUE_RE =
  /\b([A-Za-z0-9_.-]*(?:token|auth|session|secret|password|passwd|pwd|otp|signature|sig|apikey|api_key|access_key|private_key)[A-Za-z0-9_.-]*)=([^\s;&"'<>]{1,})/gi
const USERINFO_RE = /([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi
const AADHAAR_SPACED_RE = /(?<![0-9][ -])(?<![0-9])[2-9]\d{3}\s\d{4}\s\d{4}(?![0-9])(?![ -]\d)/g
const AADHAAR_RE = /\b[2-9]\d{11}\b/g
const PAN_RE = /\b[A-Z]{5}\d{4}[A-Z]\b/g
const CARD_CANDIDATE_RE = /\b(?:\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}|\d{4}[ -]\d{6}[ -]\d{5}|\d{13,19})\b/g
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
const PHONE_RE = /\b(?:\+91[-\s]?)?[6-9]\d{9}\b/g

function luhnValid(digits: string): boolean {
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = digits.charCodeAt(index) - 48
    if (double) {
      digit *= 2
      if (digit > 9) {
        digit -= 9
      }
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

/** Redacts secret/PII shapes found inside a free-text string. */
export function sanitizeText(text: string): string {
  const bounded = text.length > MAX_STRING_SCAN_LENGTH ? text.slice(0, MAX_STRING_SCAN_LENGTH) : text

  let result = bounded
    .replace(AUTH_SCHEME_RE, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(JWT_RE, REDACTED)
    .replace(PROVIDER_KEY_RE, REDACTED)
    .replace(GOOGLE_KEY_RE, REDACTED)
    .replace(KEY_VALUE_RE, (_match, name: string) => `${name}=${REDACTED}`)
    .replace(USERINFO_RE, `$1${REDACTED}@`)
    // Cards before Aadhaar: a valid card must not be partially relabelled, and
    // a Luhn-invalid card-shaped run is kept by the replacer below.
    .replace(CARD_CANDIDATE_RE, (candidate) =>
      luhnValid(candidate.replace(/[ -]/g, '')) ? REDACTED_CARD : candidate,
    )
    .replace(AADHAAR_SPACED_RE, REDACTED_AADHAAR)
    .replace(AADHAAR_RE, REDACTED_AADHAAR)
    .replace(PAN_RE, REDACTED_PAN)
    .replace(EMAIL_RE, REDACTED_EMAIL)
    .replace(PHONE_RE, REDACTED_PHONE)

  if (result.length > MAX_STRING_LENGTH) {
    result = `${result.slice(0, MAX_STRING_LENGTH)}…[truncated]`
  }

  return result
}

function sanitizeError(error: Error): Record<string, unknown> {
  return {
    name: error.name,
    message: sanitizeText(error.message),
    stack: error.stack ? sanitizeText(error.stack) : undefined,
  }
}

function sanitizeInternal(value: unknown, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) {
    return value
  }

  switch (typeof value) {
    case 'string':
      return sanitizeText(value)
    case 'number':
    case 'boolean':
    case 'bigint':
      return value
    case 'function':
    case 'symbol':
      return '[OMITTED]'
    case 'object':
      break
    default:
      return '[OMITTED]'
  }

  const record = value as object

  if (seen.has(record)) {
    return '[CIRCULAR]'
  }
  if (depth >= MAX_DEPTH) {
    return '[TRUNCATED_DEPTH]'
  }

  seen.add(record)
  try {
    if (value instanceof Error) {
      return sanitizeError(value)
    }
    if (value instanceof Date) {
      return value.toISOString()
    }
    if (typeof URL !== 'undefined' && value instanceof URL) {
      return sanitizeText(value.toString())
    }
    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => sanitizeInternal(item, depth + 1, seen))
      if (value.length > MAX_ARRAY_ITEMS) {
        items.push(`[TRUNCATED_${value.length - MAX_ARRAY_ITEMS}_ITEMS]`)
      }
      return items
    }

    const source = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(source).slice(0, MAX_OBJECT_KEYS)) {
      result[key] = isSensitiveKey(key) ? REDACTED : sanitizeInternal(source[key], depth + 1, seen)
    }
    return result
  } finally {
    seen.delete(record)
  }
}

/**
 * Returns a bounded, sanitized copy of any value: sensitive keys are replaced,
 * strings are scrubbed, depth/array/key sizes are capped and cycles are cut.
 */
export function sanitizeValue(value: unknown, depth = 0, seen?: WeakSet<object>): unknown {
  return sanitizeInternal(value, depth, seen ?? new WeakSet<object>())
}

/* -------------------------------------------------------------------------- */
/* Sentry event / breadcrumb policy                                           */
/* -------------------------------------------------------------------------- */

/**
 * `beforeSend` policy: sanitize the whole event (request headers, the cookie
 * map, query strings and URLs are redacted by the shared key/value rules) and
 * reduce the user payload to an opaque id under the default-PII-off policy.
 */
export function sanitizeErrorEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const clean = sanitizeValue(event) as Sentry.ErrorEvent

  if (clean.user) {
    const id = clean.user.id
    clean.user = id === undefined || id === null ? undefined : { id: String(id) }
  }

  return clean
}

/**
 * `beforeBreadcrumb` policy: `ui.input` breadcrumbs can carry typed values
 * (including credentials), so they are dropped; every remaining breadcrumb is
 * sanitized with the same rules as event payloads.
 */
export function sanitizeBreadcrumb(breadcrumb: Sentry.Breadcrumb): Sentry.Breadcrumb | null {
  if (breadcrumb.category === 'ui.input') {
    return null
  }
  return sanitizeValue(breadcrumb) as Sentry.Breadcrumb
}

/* -------------------------------------------------------------------------- */
/* Initialization and reporting                                               */
/* -------------------------------------------------------------------------- */

export interface MonitoringConfig {
  dsn?: string
  environment?: string
  release?: string
  tracesSampleRate?: number
}

let monitoringInitialized = false
let monitoringEnabled = false
let globalHandlersInstalled = false

/** True when a reporting backend is configured and initialized. */
export function isMonitoringEnabled(): boolean {
  return monitoringEnabled
}

function describeUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}`
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

function redactContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context || Object.keys(context).length === 0) {
    return undefined
  }
  return sanitizeValue(context) as Record<string, unknown>
}

/**
 * Reports one operational failure through the sanitized funnel. Returns the
 * backend event id, or `undefined` in Sentry absent mode or when reporting
 * itself fails. Never throws.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): string | undefined {
  if (!monitoringEnabled) {
    return undefined
  }

  try {
    const extra = redactContext(context)

    if (error instanceof Error) {
      return Sentry.captureException(error, extra ? { extra } : undefined)
    }

    const message = sanitizeText(describeUnknown(error))
    return Sentry.captureMessage(message, {
      level: 'error',
      ...(extra ? { extra } : {}),
    })
  } catch {
    return undefined
  }
}

/**
 * Funnel for `logger.error(...)` calls. An Error argument becomes the reported
 * exception; remaining arguments are attached as bounded, sanitized context.
 * Message-only calls become error-level messages.
 */
export function reportLoggedError(args: readonly unknown[]): string | undefined {
  if (args.length === 0) {
    return undefined
  }

  const [first, ...rest] = args
  if (first instanceof Error) {
    return reportError(first, rest.length > 0 ? { loggedArguments: rest } : undefined)
  }

  const errorArg = args.find((arg): arg is Error => arg instanceof Error)
  if (errorArg) {
    const others = args.filter((arg) => arg !== errorArg)
    return reportError(errorArg, others.length > 0 ? { loggedArguments: others } : undefined)
  }

  const message = args
    .map((arg) => describeUnknown(arg))
    .join(' ')
    .trim()

  return message ? reportError(message) : undefined
}

function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') {
    return
  }
  globalHandlersInstalled = true

  window.addEventListener('error', (event) => {
    // Resource-load errors dispatch a plain Event and carry no error data.
    if (!(event instanceof ErrorEvent)) {
      return
    }
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'Uncaught error')
    reportError(error)
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason as unknown
    reportError(reason instanceof Error ? reason : new Error(describeUnknown(reason)))
  })
}

/**
 * Initializes sanitized reporting. Without a DSN (Sentry absent mode) nothing
 * is initialized and all reporting calls are no-ops. Idempotent.
 */
export function initMonitoring(config: MonitoringConfig = {}): boolean {
  if (monitoringInitialized) {
    return monitoringEnabled
  }
  monitoringInitialized = true

  const dsn = String(config.dsn ?? import.meta.env.VITE_SENTRY_DSN ?? '').trim()
  if (!dsn) {
    return false
  }

  const release = String(
    config.release ?? import.meta.env.VITE_SENTRY_RELEASE ?? import.meta.env.VITE_APP_VERSION ?? '',
  ).trim()
  const environment = String(config.environment ?? import.meta.env.MODE ?? '').trim() || 'production'

  try {
    Sentry.init({
      dsn,
      environment,
      release: release || DEFAULT_RELEASE,
      sendDefaultPii: false,
      tracesSampleRate: config.tracesSampleRate ?? 0.1,
      // Replay stays disabled unless the owner approves it with masking.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend: sanitizeErrorEvent,
      beforeBreadcrumb: sanitizeBreadcrumb,
      // This module owns uncaught capture (see module doc comment).
      integrations: (defaults) => defaults.filter((integration) => integration.name !== 'GlobalHandlers'),
    })
  } catch {
    console.error('[monitoring] reporting disabled: Sentry init failed')
    return false
  }

  monitoringEnabled = true
  installGlobalErrorHandlers()
  return true
}

/** Message used by the controlled staging probe. */
export const STAGING_PROBE_MESSAGE = 'monitoring staging probe'

/**
 * Sends one controlled staging event whose payload carries obviously fake
 * secrets. Receipt in the backend with those values shown as `[REDACTED]` is
 * the end-to-end proof that the sanitizer runs on real events. Requires a DSN
 * and owner access; returns the event id, or `undefined` in absent mode.
 */
export function sendStagingMonitoringProbe(): string | undefined {
  if (!monitoringEnabled) {
    return undefined
  }

  const probe = new Error(STAGING_PROBE_MESSAGE)
  probe.name = 'MonitoringStagingProbe'

  return reportError(probe, {
    probe: 'staging',
    redactionSelfTest: {
      // Free-text shapes are redacted by content rules (card/Aadhaar/email/bearer).
      note: 'free-text secrets: card 4111 1111 1111 1111 aadhaar 2345 6789 0123 email probe.user@example.invalid bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abc12345',
      // Key-based secrets are redacted by key name.
      password: 'probe-password-value',
      otp: '482913',
      authorization: 'Bearer probe-bearer-token-value',
      queryString: '?token=probe-query-token&order=1',
      aadhaarNumber: '2345 6789 0123',
      cardNumber: '4111 1111 1111 1111',
      email: 'probe.user@example.invalid',
    },
  })
}
