const GOOGLE_CANCELLED_MESSAGE = 'Google sign-in was cancelled or denied. Please try again.'
const GOOGLE_CONFIG_MESSAGE = 'Google sign-in is not configured for this domain yet. Verify Supabase redirect URLs and Google OAuth callback settings.'
const GENERIC_AUTH_MESSAGE = 'Authentication failed. Please try again.'

const normalizeDescription = (description: string) => {
    const normalized = description.replace(/\+/g, ' ').trim()
    if (!normalized) {
        return GENERIC_AUTH_MESSAGE
    }

    return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

export function getAuthCallbackErrorMessage(queryParams: URLSearchParams): string | null {
    const error = queryParams.get('error')?.trim().toLowerCase() || ''
    const errorCode = queryParams.get('error_code')?.trim().toLowerCase() || ''
    const errorDescription = queryParams.get('error_description')?.trim() || queryParams.get('message')?.trim() || ''
    const combined = `${error} ${errorCode} ${errorDescription}`.toLowerCase()

    if (!combined.trim()) {
        return null
    }

    if (
        combined.includes('access_denied') ||
        combined.includes('cancel') ||
        combined.includes('denied') ||
        combined.includes('rejected')
    ) {
        return GOOGLE_CANCELLED_MESSAGE
    }

    if (
        combined.includes('redirect') ||
        combined.includes('callback') ||
        combined.includes('origin') ||
        combined.includes('not configured') ||
        combined.includes('unauthorized')
    ) {
        return GOOGLE_CONFIG_MESSAGE
    }

    return errorDescription ? normalizeDescription(errorDescription) : GENERIC_AUTH_MESSAGE
}

export const authCallbackErrorMessages = {
    GOOGLE_CANCELLED_MESSAGE,
    GOOGLE_CONFIG_MESSAGE,
    GENERIC_AUTH_MESSAGE,
}