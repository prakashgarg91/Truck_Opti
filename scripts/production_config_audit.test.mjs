import test from 'node:test'
import assert from 'node:assert/strict'
import { runAudit } from './production_config_audit.mjs'

const VALID_BACKEND_URL = 'https://prod-project.supabase.co'
const VALID_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.anon-key-value.signature'
const SECRET_VALUE = 'super-secret-do-not-log'

const reachableDeps = {
  dnsLookup: async () => [{ address: '203.0.113.10' }],
  fetchHealth: async () => ({ ok: true, status: 200 }),
}

const nxdomainDeps = {
  dnsLookup: async () => {
    throw new Error('getaddrinfo ENOTFOUND dead-host.invalid')
  },
}

function fullCloudConfig(overrides = {}) {
  return {
    VITE_APP_URL: 'https://www.truckopti.in',
    VITE_SUPABASE_URL: VALID_BACKEND_URL,
    VITE_SUPABASE_ANON_KEY: VALID_ANON_KEY,
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_AUTH_PHONE_OTP_ENABLED: 'false',
    VITE_AUTH_PASSWORD_ENABLED: 'false',
    VITE_RAZORPAY_KEY_ID: 'rzp_live_1234567890',
    VITE_SENTRY_DSN: 'https://public@example.com/1',
    ...overrides,
  }
}

test('local-first configuration is reported as local_only and never cloud-ready', async () => {
  const report = await runAudit({}, {})
  assert.equal(report.verdict, 'local_only')
  assert.equal(report.productionReady, false)
  assert.equal(report.auditKind, 'static_configuration')

  const backend = report.checks.find((check) => check.name === 'supabase_auth_backend')
  assert.equal(backend.status, 'fail')
})

test('reachable cloud backend with Google-via-Supabase and live Razorpay reaches config_ready, not production-ready', async () => {
  const report = await runAudit(fullCloudConfig(), reachableDeps)
  assert.equal(report.verdict, 'config_ready')
  assert.equal(report.productionReady, false)
  assert.match(report.productionReadyBlockers.join(' '), /live operational verification/i)

  const backend = report.checks.find((check) => check.name === 'supabase_auth_backend')
  assert.equal(backend.status, 'pass')
  assert.equal(backend.level, 'reachable')

  const providers = report.checks.find((check) => check.name === 'auth_provider_configuration')
  assert.equal(providers.status, 'pass')

  const phonePe = report.checks.find((check) => check.name === 'phonepe_mode')
  assert.equal(phonePe.status, 'not_applicable')

  const password = report.checks.find((check) => check.name === 'office_password_policy')
  assert.equal(password.status, 'not_applicable')
})

test('NXDOMAIN backend keeps the verdict out of any cloud-ready state', async () => {
  const report = await runAudit(fullCloudConfig({ VITE_SUPABASE_URL: 'https://dead-host.invalid' }), nxdomainDeps)
  assert.equal(report.verdict, 'not_ready')
  assert.equal(report.productionReady, false)

  const backend = report.checks.find((check) => check.name === 'supabase_auth_backend')
  assert.equal(backend.status, 'fail')
  assert.match(backend.detail, /DNS lookup failed/)
})

test('PhonePe sandbox selected for production fails the audit', async () => {
  const report = await runAudit(
    fullCloudConfig({
      VITE_PHONEPE_MERCHANT_ID: 'MERCHANT123',
      VITE_PHONEPE_API_URL: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
    }),
    reachableDeps
  )
  assert.equal(report.verdict, 'not_ready')
  const phonePe = report.checks.find((check) => check.name === 'phonepe_mode')
  assert.equal(phonePe.status, 'fail')
})

test('missing Razorpay key fails the selected provider requirement', async () => {
  const report = await runAudit(fullCloudConfig({ VITE_RAZORPAY_KEY_ID: undefined }), reachableDeps)
  assert.equal(report.verdict, 'not_ready')
  const razorpay = report.checks.find((check) => check.name === 'razorpay_launch_readiness')
  assert.equal(razorpay.status, 'fail')
})

test('VITE secret leakage fails the audit and the report never contains the secret value', async () => {
  const report = await runAudit(
    fullCloudConfig({ VITE_RAZORPAY_KEY_SECRET: SECRET_VALUE }),
    reachableDeps
  )
  assert.equal(report.verdict, 'not_ready')
  const exposure = report.checks.find((check) => check.name === 'vite_secret_exposure')
  assert.equal(exposure.status, 'fail')
  assert.equal(JSON.stringify(report).includes(SECRET_VALUE), false)
})

test('office password enabled surfaces the approved-policy gate without counting as a cloud method', async () => {
  const report = await runAudit(fullCloudConfig({ VITE_AUTH_PASSWORD_ENABLED: 'true' }), reachableDeps)
  const password = report.checks.find((check) => check.name === 'office_password_policy')
  assert.equal(password.status, 'fail')
  assert.equal(password.liveProofRequired, true)

  const providers = report.checks.find((check) => check.name === 'auth_provider_configuration')
  assert.equal(providers.status, 'pass')
})

test('placeholder Google-only configuration stays local_only (GIS ID is not a backend)', async () => {
  const report = await runAudit(
    {
      VITE_GOOGLE_CLIENT_ID: '1234567890-example.apps.googleusercontent.com',
    },
    {}
  )
  assert.equal(report.verdict, 'local_only')
  const providers = report.checks.find((check) => check.name === 'auth_provider_configuration')
  assert.equal(providers.status, 'fail')
})
