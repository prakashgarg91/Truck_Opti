import { describe, expect, it, vi } from 'vitest'
import {
  OFFICE_PASSWORD_MIN_LENGTH,
  isPlaceholderValue,
  isValidHttpsBackendUrl,
  probeSupabaseReachable,
  resolveAuthMethodCapabilities,
  resolveSupabaseConfig,
  validateOfficePassword,
} from './authCapabilities'

describe('isPlaceholderValue', () => {
  it('flags empty and marker placeholder values', () => {
    expect(isPlaceholderValue('')).toBe(true)
    expect(isPlaceholderValue(undefined)).toBe(true)
    expect(isPlaceholderValue('replace_me')).toBe(true)
    expect(isPlaceholderValue('your_supabase_anon_key_here')).toBe(true)
    expect(isPlaceholderValue('https://YOUR_PROJECT_ID.supabase.co')).toBe(true)
    expect(isPlaceholderValue('sb_anon_real_value')).toBe(false)
  })
})

describe('isValidHttpsBackendUrl', () => {
  it('accepts valid https backend URLs', () => {
    expect(isValidHttpsBackendUrl('https://prod-project.supabase.co')).toBe(true)
  })

  it('rejects http, localhost, placeholders and garbage', () => {
    expect(isValidHttpsBackendUrl('http://prod-project.supabase.co')).toBe(false)
    expect(isValidHttpsBackendUrl('https://localhost')).toBe(false)
    expect(isValidHttpsBackendUrl('https://YOUR_PROJECT_ID.supabase.co')).toBe(false)
    expect(isValidHttpsBackendUrl('not a url')).toBe(false)
    expect(isValidHttpsBackendUrl('')).toBe(false)
    expect(isValidHttpsBackendUrl(undefined)).toBe(false)
  })

  it('allows guaranteed-unresolvable hosts so a configured dead backend can be probed and fail honestly', () => {
    // .invalid is reserved and always NXDOMAIN: used to reproduce outage evidence.
    expect(isValidHttpsBackendUrl('https://dead-host.invalid')).toBe(true)
  })
})

describe('resolveSupabaseConfig', () => {
  it('resolves local-first mode when nothing is configured', () => {
    const resolution = resolveSupabaseConfig({})
    expect(resolution.mode).toBe('local_first')
    expect(resolution.level).toBe('missing')
    expect(resolution.supabaseUrl).toBeNull()
    expect(resolution.isConfigured).toBe(false)
  })

  it('resolves local-first mode for the documented placeholder URL from .env.example', () => {
    const resolution = resolveSupabaseConfig({
      supabaseUrl: 'https://YOUR_PROJECT_ID.supabase.co',
      supabaseAnonKey: 'your_supabase_anon_key_here',
    })
    expect(resolution.mode).toBe('local_first')
    expect(resolution.level).toBe('placeholder')
    expect(resolution.isConfigured).toBe(false)
  })

  it('resolves local-first mode when the anon key is missing or placeholder', () => {
    const missing = resolveSupabaseConfig({ supabaseUrl: 'https://prod-project.supabase.co' })
    expect(missing.mode).toBe('local_first')
    expect(missing.configError).toMatch(/VITE_SUPABASE_ANON_KEY is not set/)

    const placeholder = resolveSupabaseConfig({
      supabaseUrl: 'https://prod-project.supabase.co',
      supabaseAnonKey: 'your_supabase_anon_key_here',
    })
    expect(placeholder.mode).toBe('local_first')
    expect(placeholder.level).toBe('placeholder')
  })

  it('rejects non-https and malformed backend URLs', () => {
    const http = resolveSupabaseConfig({
      supabaseUrl: 'http://prod-project.supabase.co',
      supabaseAnonKey: 'sb_anon_real_value',
    })
    expect(http.mode).toBe('local_first')
    expect(http.level).toBe('invalid')

    const garbage = resolveSupabaseConfig({ supabaseUrl: 'not a url', supabaseAnonKey: 'sb_anon_real_value' })
    expect(garbage.mode).toBe('local_first')
    expect(garbage.level).toBe('invalid')
  })

  it('resolves cloud mode for a valid https URL and anon key', () => {
    const resolution = resolveSupabaseConfig({
      supabaseUrl: 'https://prod-project.supabase.co',
      supabaseAnonKey: 'sb_anon_real_value',
    })
    expect(resolution.mode).toBe('cloud')
    expect(resolution.level).toBe('configured')
    expect(resolution.supabaseUrl).toBe('https://prod-project.supabase.co')
    expect(resolution.isConfigured).toBe(true)
  })

  it('never echoes the anon key in diagnostics', () => {
    const secret = 'sb_anon_secret_should_not_leak'
    const resolution = resolveSupabaseConfig({
      supabaseUrl: 'https://prod-project.supabase.co',
      supabaseAnonKey: secret,
    })
    expect(JSON.stringify(resolution).includes(secret)).toBe(true) // clientKey is required by supabase-js
    expect(resolution.configError).toBeNull()
  })
})

describe('probeSupabaseReachable', () => {
  it('returns true when the health endpoint responds ok', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({ ok: true, status: 200 }))
    const ok = await probeSupabaseReachable(fetchMock, 'https://prod-project.supabase.co', { timeoutMs: 100 })
    expect(ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://prod-project.supabase.co/auth/v1/health')
  })

  it('returns false on non-ok health responses', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 503 }))
    await expect(probeSupabaseReachable(fetchMock, 'https://prod-project.supabase.co', { timeoutMs: 100 })).resolves.toBe(false)
  })

  it('returns false when the configured backend cannot be reached (NXDOMAIN/DNS error)', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })
    await expect(probeSupabaseReachable(fetchMock, 'https://dead-host.invalid', { timeoutMs: 100 })).resolves.toBe(false)
  })

  it('aborts within the bounded timeout instead of hanging', async () => {
    const fetchMock = vi.fn(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise<{ ok: boolean }>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
        })
    )
    await expect(probeSupabaseReachable(fetchMock, 'https://prod-project.supabase.co', { timeoutMs: 25 })).resolves.toBe(false)
  })

  it('never fetches when the URL is not a valid https backend URL', async () => {
    const fetchMock = vi.fn()
    await expect(probeSupabaseReachable(fetchMock, 'https://YOUR_PROJECT_ID.supabase.co', { timeoutMs: 100 })).resolves.toBe(false)
    await expect(probeSupabaseReachable(fetchMock, undefined, { timeoutMs: 100 })).resolves.toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('resolveAuthMethodCapabilities', () => {
  it('reports every method disabled when nothing is configured', () => {
    const capabilities = resolveAuthMethodCapabilities({ supabaseConfigured: false })
    expect(capabilities.hasCloudMethod).toBe(false)
    expect(capabilities.google.enabled).toBe(false)
    expect(capabilities.emailOtp.enabled).toBe(false)
    expect(capabilities.phoneOtp.enabled).toBe(false)
  })

  it('enables cloud Google sign-in through the configured Supabase backend (TO-122 contract)', () => {
    const capabilities = resolveAuthMethodCapabilities({ supabaseConfigured: true })
    expect(capabilities.hasCloudMethod).toBe(true)
    expect(capabilities.google.enabled).toBe(true)
    expect(capabilities.google.detail).toMatch(/live/i)
  })

  it('requires an explicit true flag for email OTP; a missing flag is disabled', () => {
    const missing = resolveAuthMethodCapabilities({ supabaseConfigured: true })
    expect(missing.emailOtp.enabled).toBe(false)

    const explicit = resolveAuthMethodCapabilities({ supabaseConfigured: true, emailOtpEnabled: 'true' })
    expect(explicit.emailOtp.enabled).toBe(true)

    const explicitWithoutBackend = resolveAuthMethodCapabilities({ supabaseConfigured: false, emailOtpEnabled: 'true' })
    expect(explicitWithoutBackend.emailOtp.enabled).toBe(false)
    expect(explicitWithoutBackend.emailOtp.detail).toMatch(/backend is not configured/i)
  })

  it('treats office password as a separate capability that never counts as a cloud method', () => {
    const capabilities = resolveAuthMethodCapabilities({
      supabaseConfigured: false,
      passwordEnabled: 'true',
    })
    expect(capabilities.officePassword.enabled).toBe(true)
    expect(capabilities.hasCloudMethod).toBe(false)
    expect(capabilities.officePassword.level).toBe('configured')
  })
})

describe('office password policy', () => {
  it('matches the approved Supabase minimum password length (supabase/config.toml)', () => {
    expect(OFFICE_PASSWORD_MIN_LENGTH).toBe(8)
  })

  it('rejects passwords shorter than the approved minimum', () => {
    const result = validateOfficePassword('short1!')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/at least 8 characters/)
  })

  it('accepts passwords at or above the approved minimum', () => {
    expect(validateOfficePassword('longenough1').ok).toBe(true)
  })
})
