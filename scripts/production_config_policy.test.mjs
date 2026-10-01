import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isPlaceholder,
  isValidBackendUrl,
  shouldRunEmailOtpFallback,
  shouldRunSupabaseHealthCheck,
  summarizeAppUrl,
  summarizeAuthProviders,
  summarizeOfficePassword,
  summarizePhonePe,
  summarizeRazorpay,
  summarizeSupabaseBackendUrl,
  summarizeSupabaseClientKey,
  summarizeViteSecretExposure,
} from './production_config_policy.mjs'

const VALID_BACKEND_URL = 'https://prod-project.supabase.co'
const VALID_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon-key-value.signature'

// --- existing shared helpers -------------------------------------------------

test('detects placeholder configuration values', () => {
  assert.equal(isPlaceholder(''), true)
  assert.equal(isPlaceholder(undefined), true)
  assert.equal(isPlaceholder('replace_me_google_client_id'), true)
  assert.equal(isPlaceholder('your_supabase_anon_key_here'), true)
  assert.equal(isPlaceholder('https://YOUR_PROJECT_ID.supabase.co'), true)
  assert.equal(isPlaceholder('eyJhbGciOi.example.value'), false)
})

test('runs the Email OTP fallback smoke only when the Email channel exists', () => {
  assert.equal(shouldRunEmailOtpFallback({ emailChannelCount: 1 }), true)
  assert.equal(shouldRunEmailOtpFallback({ emailChannelCount: 0 }), false)
})

// --- backend URL validity -----------------------------------------------------

test('backend URL validity requires https and rejects placeholder or localhost backends', () => {
  assert.equal(isValidBackendUrl('https://prod-project.supabase.co'), true)
  assert.equal(isValidBackendUrl('http://prod-project.supabase.co'), false)
  assert.equal(isValidBackendUrl('https://localhost'), false)
  assert.equal(isValidBackendUrl('https://YOUR_PROJECT_ID.supabase.co'), false)
  assert.equal(isValidBackendUrl('not a url'), false)
  assert.equal(isValidBackendUrl(''), false)
  assert.equal(isValidBackendUrl(undefined), false)
})

test('smoke health check runs only for a valid https backend URL, not placeholders', () => {
  assert.equal(shouldRunSupabaseHealthCheck('https://prod-project.supabase.co'), true)
  assert.equal(shouldRunSupabaseHealthCheck('https://YOUR_PROJECT_ID.supabase.co'), false)
  assert.equal(shouldRunSupabaseHealthCheck('http://insecure.example.com'), false)
  assert.equal(shouldRunSupabaseHealthCheck(''), false)
  assert.equal(shouldRunSupabaseHealthCheck(undefined), false)
})

// --- Supabase client key -------------------------------------------------------

test('missing anon key fails the client-key check without logging any value', () => {
  const result = summarizeSupabaseClientKey(undefined)
  assert.equal(result.status, 'fail')
  assert.equal(result.level, 'missing')
})

test('placeholder anon key fails the client-key check', () => {
  const result = summarizeSupabaseClientKey('your_supabase_anon_key_here')
  assert.equal(result.status, 'fail')
  assert.equal(result.level, 'placeholder')
})

test('present anon key passes and never logs the key value', () => {
  const result = summarizeSupabaseClientKey(VALID_ANON_KEY)
  assert.equal(result.status, 'pass')
  assert.equal(JSON.stringify(result).includes(VALID_ANON_KEY), false)
})

// --- Supabase backend URL + reachability ---------------------------------------

test('missing Supabase URL fails as local-first, not as cloud-ready', async () => {
  const result = await summarizeSupabaseBackendUrl(undefined, {})
  assert.equal(result.status, 'fail')
  assert.equal(result.level, 'missing')
})

test('placeholder Supabase URL fails the backend check', async () => {
  const result = await summarizeSupabaseBackendUrl('https://YOUR_PROJECT_ID.supabase.co', {})
  assert.equal(result.status, 'fail')
  assert.equal(result.level, 'placeholder')
})

test('malformed or non-https Supabase URL fails the backend check', async () => {
  const httpResult = await summarizeSupabaseBackendUrl('http://prod-project.supabase.co', {})
  assert.equal(httpResult.status, 'fail')
  assert.equal(httpResult.level, 'invalid')

  const garbage = await summarizeSupabaseBackendUrl('not a url', {})
  assert.equal(garbage.status, 'fail')
  assert.equal(garbage.level, 'invalid')
})

test('NXDOMAIN backend fails with a DNS detail instead of passing', async () => {
  const result = await summarizeSupabaseBackendUrl('https://dead-host.invalid', {
    dnsLookup: async () => {
      throw new Error('getaddrinfo ENOTFOUND dead-host.invalid')
    },
  })
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /DNS lookup failed/)
  assert.match(result.detail, /dead-host\.invalid/)
})

test('resolving backend that fails its health check does not pass', async () => {
  const result = await summarizeSupabaseBackendUrl(VALID_BACKEND_URL, {
    dnsLookup: async () => [{ address: '203.0.113.10' }],
    fetchHealth: async () => ({ ok: false, status: 503 }),
  })
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /503/)
})

test('reachable backend passes at the reachable proof level', async () => {
  const result = await summarizeSupabaseBackendUrl(VALID_BACKEND_URL, {
    dnsLookup: async () => [{ address: '203.0.113.10' }],
    fetchHealth: async () => ({ ok: true, status: 200 }),
  })
  assert.equal(result.status, 'pass')
  assert.equal(result.level, 'reachable')
})

test('backend failures never include the anon key value', async () => {
  const result = await summarizeSupabaseBackendUrl(VALID_BACKEND_URL, {
    dnsLookup: async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    },
  })
  assert.equal(JSON.stringify(result).includes(VALID_ANON_KEY), false)
})

// --- auth provider configuration ------------------------------------------------

test('fails when every cloud auth method is disabled', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_AUTH_PHONE_OTP_ENABLED: 'false',
    VITE_AUTH_PASSWORD_ENABLED: 'false',
  })
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /no production cloud authentication method/i)
})

test('does not count placeholder Google client IDs as configured', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_GOOGLE_CLIENT_ID: 'replace_me_google_client_id',
  })
  assert.equal(result.status, 'fail')
})

test('a GIS client ID alone is not cloud sign-in proof (TO-122 contract)', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_GOOGLE_CLIENT_ID: '1234567890-example.apps.googleusercontent.com',
  })
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /GIS client ID alone is not cloud sign-in proof/)
})

test('valid Google cloud settings pass via the Supabase backend contract', () => {
  const result = summarizeAuthProviders({
    VITE_SUPABASE_URL: VALID_BACKEND_URL,
    VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_AUTH_PHONE_OTP_ENABLED: 'false',
    VITE_AUTH_PASSWORD_ENABLED: 'false',
    VITE_GOOGLE_CLIENT_ID: '1234567890-example.apps.googleusercontent.com',
  })
  assert.equal(result.status, 'pass')
  assert.deepEqual(result.cloudMethods, ['Google (via Supabase OAuth)'])
  assert.equal(result.liveProofRequired, true)
})

test('accepts email OTP only when explicitly enabled and the backend is configured', () => {
  const withoutBackend = summarizeAuthProviders({ VITE_AUTH_EMAIL_OTP_ENABLED: 'true' })
  assert.equal(withoutBackend.status, 'fail')

  const withBackend = summarizeAuthProviders({
    VITE_SUPABASE_URL: VALID_BACKEND_URL,
    VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
    VITE_AUTH_EMAIL_OTP_ENABLED: 'true',
  })
  assert.equal(withBackend.status, 'pass')
  assert.match(withBackend.detail, /email OTP/i)
})

test('an enabled flag without a configured backend does not count as a cloud method', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_PHONE_OTP_ENABLED: 'true',
  })
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /VITE_AUTH_PHONE_OTP_ENABLED=true but the Supabase backend is not configured/)
})

test('office password is never counted as a cloud method', () => {
  const result = summarizeAuthProviders({
    VITE_SUPABASE_URL: VALID_BACKEND_URL,
    VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
    VITE_AUTH_PASSWORD_ENABLED: 'true',
  })
  // backend configured => Google counts, so provider check passes; password is separate
  assert.equal(result.status, 'pass')
  assert.deepEqual(result.cloudMethods, ['Google (via Supabase OAuth)'])
})

// --- office password policy -------------------------------------------------------

test('office password off is intentionally disabled, not a failure and not a cloud method', () => {
  const result = summarizeOfficePassword({ VITE_AUTH_PASSWORD_ENABLED: 'false' })
  assert.equal(result.status, 'not_applicable')
  assert.equal(result.level, 'intentionally_disabled')
})

test('office password off by default (missing flag) is also not_applicable', () => {
  const result = summarizeOfficePassword({})
  assert.equal(result.status, 'not_applicable')
})

test('office password enabled requires the approved policy (minimum 8) to be verified live', () => {
  const result = summarizeOfficePassword({ VITE_AUTH_PASSWORD_ENABLED: 'true' })
  assert.equal(result.status, 'fail')
  assert.equal(result.liveProofRequired, true)
  assert.match(result.detail, /minimum 8 characters/)
  assert.match(result.detail, /live/)
})

// --- payments ----------------------------------------------------------------------

test('Razorpay is the selected provider: missing key fails', () => {
  const result = summarizeRazorpay(undefined, undefined)
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /missing VITE_RAZORPAY_KEY_ID/)
})

test('test Razorpay keys are still prohibited in production', () => {
  const result = summarizeRazorpay('rzp_test_1234567890', undefined)
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /test Razorpay key/)
})

test('live Razorpay key passes at configured level with live proof still required', () => {
  const result = summarizeRazorpay('rzp_live_1234567890', undefined)
  assert.equal(result.status, 'pass')
  assert.equal(result.liveProofRequired, true)
})

test('client-exposed Razorpay secret fails', () => {
  const result = summarizeRazorpay('rzp_live_1234567890', 'real-secret-value')
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /client-exposed VITE_RAZORPAY_KEY_SECRET/)
})

test('disabled PhonePe is NOT_APPLICABLE instead of falsely verified', () => {
  const result = summarizePhonePe({ merchantId: undefined, apiUrl: undefined })
  assert.equal(result.status, 'not_applicable')
  assert.equal(result.level, 'intentionally_disabled')
  assert.match(result.detail, /intentionally disabled/)
})

test('partially configured PhonePe fails instead of passing', () => {
  const merchantOnly = summarizePhonePe({ merchantId: 'MERCHANT123', apiUrl: undefined })
  assert.equal(merchantOnly.status, 'fail')

  const urlOnly = summarizePhonePe({ merchantId: undefined, apiUrl: 'https://api.phonepe.com/apis/hermes' })
  assert.equal(urlOnly.status, 'fail')
})

test('PhonePe sandbox selected for production fails', () => {
  const result = summarizePhonePe({
    merchantId: 'MERCHANT123',
    apiUrl: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  })
  assert.equal(result.status, 'fail')
  assert.match(result.detail, /sandbox|preprod/i)
})

test('PhonePe production URL passes at configured level with live proof still required', () => {
  const result = summarizePhonePe({
    merchantId: 'MERCHANT123',
    apiUrl: 'https://api.phonepe.com/apis/hermes',
  })
  assert.equal(result.status, 'pass')
  assert.equal(result.liveProofRequired, true)
})

test('PhonePe URLs outside the allowed provider hosts fail', () => {
  const result = summarizePhonePe({ merchantId: 'MERCHANT123', apiUrl: 'https://evil.example.com/apis/pg' })
  assert.equal(result.status, 'fail')
})

// --- app URL and secret exposure -----------------------------------------------------

test('app URL must be a valid https URL for production', () => {
  assert.equal(summarizeAppUrl(undefined).status, 'fail')
  assert.equal(summarizeAppUrl('http://localhost:5173').status, 'fail')
  const ok = summarizeAppUrl('https://www.truckopti.in')
  assert.equal(ok.status, 'pass')
})

test('VITE secret leakage fails and lists names without values', () => {
  const secretValue = 'super-secret-do-not-log'
  const result = summarizeViteSecretExposure({
    VITE_RAZORPAY_KEY_SECRET: secretValue,
    VITE_SUPABASE_SERVICE_ROLE_KEY: secretValue,
    VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
    VITE_SENTRY_DSN: 'https://public@example.com/1',
  })
  assert.equal(result.status, 'fail')
  assert.deepEqual(result.offenders.sort(), ['VITE_RAZORPAY_KEY_SECRET', 'VITE_SUPABASE_SERVICE_ROLE_KEY'])
  assert.equal(JSON.stringify(result).includes(secretValue), false)
})

test('placeholder secret values are not treated as live leaks', () => {
  const result = summarizeViteSecretExposure({
    VITE_RAZORPAY_KEY_SECRET: 'replace_me',
  })
  assert.equal(result.status, 'pass')
})

test('clean configuration passes the secret exposure check', () => {
  const result = summarizeViteSecretExposure({
    VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
    VITE_RAZORPAY_KEY_ID: 'rzp_live_1234567890',
    VITE_AUTH_PASSWORD_ENABLED: 'true',
  })
  assert.equal(result.status, 'pass')
})
