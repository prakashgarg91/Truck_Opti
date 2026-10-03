import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthMethodCapabilities } from './authCapabilities'

// TO-123 regression guard: the surface-level flag binding must match the
// canonical capability model exactly. A missing flag means "not enabled"
// (fail closed) — the pre-TO-123 pages treated a missing email-OTP flag as
// enabled (`!== 'false'`), which let a surface suggest an unconfigured method.
const h = vi.hoisted(() => ({
    configured: true,
}))

vi.mock('./supabase', () => ({
    // Getter: the mock registry survives vi.resetModules(), so the flag must
    // be evaluated at import/use time to let tests flip it.
    get isSupabaseConfigured() {
        return h.configured
    },
}))

async function freshSurfaceMethods(): Promise<AuthMethodCapabilities> {
    vi.resetModules()
    const mod = await import('./authSurfaceMethods')
    return mod.authSurfaceMethods
}

afterEach(() => {
    vi.unstubAllEnvs()
    h.configured = true
})

describe('authSurfaceMethods (TO-123 canonical flag binding)', () => {
    it('treats missing flags as disabled even with a configured backend (fail closed)', async () => {
        const methods = await freshSurfaceMethods()
        expect(methods.emailOtp.enabled).toBe(false)
        expect(methods.phoneOtp.enabled).toBe(false)
        expect(methods.officePassword.enabled).toBe(false)
        expect(methods.google.enabled).toBe(true)
        expect(methods.hasCloudMethod).toBe(true)
    })

    it('treats a missing email-OTP flag as disabled — never the legacy default-on', async () => {
        vi.stubEnv('VITE_AUTH_EMAIL_OTP_ENABLED', '')
        const methods = await freshSurfaceMethods()
        expect(methods.emailOtp.enabled).toBe(false)
        expect(methods.emailOtp.level).toBe('intentionally_disabled')
    })

    it('enables email OTP only with an explicit true flag and a configured backend', async () => {
        vi.stubEnv('VITE_AUTH_EMAIL_OTP_ENABLED', 'true')
        const configured = await freshSurfaceMethods()
        expect(configured.emailOtp.enabled).toBe(true)

        h.configured = false
        const unconfigured = await freshSurfaceMethods()
        expect(unconfigured.emailOtp.enabled).toBe(false)
        expect(unconfigured.hasCloudMethod).toBe(false)
    })

    it('keeps office password a separate capability that never counts as a cloud method', async () => {
        vi.stubEnv('VITE_AUTH_PASSWORD_ENABLED', 'true')
        h.configured = false
        const methods = await freshSurfaceMethods()
        expect(methods.officePassword.enabled).toBe(true)
        expect(methods.hasCloudMethod).toBe(false)
    })

    it('enables phone OTP only with an explicit true flag and a configured backend', async () => {
        vi.stubEnv('VITE_AUTH_PHONE_OTP_ENABLED', 'true')
        h.configured = false
        const methods = await freshSurfaceMethods()
        expect(methods.phoneOtp.enabled).toBe(false)
        expect(methods.phoneOtp.level).toBe('missing')
    })
})
