import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeAuthProviders } from './production_config_policy.mjs'

test('accepts intended Google-only production auth', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_AUTH_PHONE_OTP_ENABLED: 'false',
    VITE_AUTH_PASSWORD_ENABLED: 'false',
    VITE_GOOGLE_CLIENT_ID: '1234567890-example.apps.googleusercontent.com',
  })

  assert.equal(result.status, 'pass')
  assert.match(result.detail, /Google/i)
})

test('accepts email OTP when explicitly enabled', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_EMAIL_OTP_ENABLED: 'true',
  })

  assert.equal(result.status, 'pass')
  assert.match(result.detail, /email OTP/i)
})

test('fails when no production auth provider is configured', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_AUTH_PHONE_OTP_ENABLED: 'false',
    VITE_AUTH_PASSWORD_ENABLED: 'false',
  })

  assert.equal(result.status, 'fail')
  assert.match(result.detail, /no enabled production authentication provider/i)
})

test('does not count placeholder Google client IDs as configured', () => {
  const result = summarizeAuthProviders({
    VITE_AUTH_EMAIL_OTP_ENABLED: 'false',
    VITE_GOOGLE_CLIENT_ID: 'replace_me_google_client_id',
  })

  assert.equal(result.status, 'fail')
})
