import { describe, expect, it } from 'vitest'

import { authCallbackErrorMessages, getAuthCallbackErrorMessage } from './authCallbackError'

describe('getAuthCallbackErrorMessage', () => {
    it('returns null when the callback has no provider error params', () => {
        expect(getAuthCallbackErrorMessage(new URLSearchParams('code=abc123'))).toBeNull()
    })

    it('maps cancelled Google sign-ins to a user-facing retry message', () => {
        const params = new URLSearchParams('error=access_denied&error_description=User+denied+access')

        expect(getAuthCallbackErrorMessage(params)).toBe(authCallbackErrorMessages.GOOGLE_CANCELLED_MESSAGE)
    })

    it('maps redirect and callback misconfiguration hints to the domain-setup message', () => {
        const params = new URLSearchParams('error=server_error&error_description=Redirect+URL+is+not+configured')

        expect(getAuthCallbackErrorMessage(params)).toBe(authCallbackErrorMessages.GOOGLE_CONFIG_MESSAGE)
    })

    it('falls back to the provider description when no special mapping applies', () => {
        const params = new URLSearchParams('error=server_error&error_description=oauth+provider+temporarily+unavailable')

        expect(getAuthCallbackErrorMessage(params)).toBe('Oauth provider temporarily unavailable')
    })
})