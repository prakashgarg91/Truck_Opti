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

export function shouldRunSupabaseHealthCheck(supabaseUrl) {
  return typeof supabaseUrl === 'string' && supabaseUrl.trim().length > 0
}

export function summarizeAuthProviders(config = {}) {
  const enabled = []

  if (config.VITE_AUTH_EMAIL_OTP_ENABLED === 'true') {
    enabled.push('email OTP')
  }

  if (config.VITE_AUTH_PHONE_OTP_ENABLED === 'true') {
    enabled.push('phone OTP')
  }

  if (config.VITE_AUTH_PASSWORD_ENABLED === 'true') {
    enabled.push('password')
  }

  if (!isPlaceholder(config.VITE_GOOGLE_CLIENT_ID)) {
    enabled.push('Google')
  }

  if (enabled.length === 0) {
    return {
      status: 'fail',
      detail: 'no enabled production authentication provider is configured',
    }
  }

  return {
    status: 'pass',
    detail: `enabled production authentication providers: ${enabled.join(', ')}`,
  }
}
