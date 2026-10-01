import { logger } from './logger'

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export function toUserFacingErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) {
    return error.message
  }

  return fallback
}

/**
 * Approved server status codes that may influence the user-facing message for
 * admin/agency portal Edge Function failures. The mapping is finite: any other
 * status, or any unapproved payload/error string, falls back to the caller's
 * context-specific message so provider internals (SQL details, JWTs, HTML
 * error pages, stack traces) can never reach the UI.
 */
export const APPROVED_FUNCTION_STATUS_MESSAGES: Readonly<Record<number, string>> = Object.freeze({
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to perform this action.',
  409: 'This account cannot be modified from this screen.',
})

function getFunctionResponseStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object' || !('context' in error)) {
    return null
  }

  const response = (error as { context?: unknown }).context

  if (response instanceof Response && Number.isInteger(response.status)) {
    return response.status
  }

  return null
}

/**
 * Resolves the user-facing message for an Edge Function failure using only the
 * approved typed status codes above. Raw `error.message` values and response
 * payload strings are never trusted; `fallbackMessage` must be a stable,
 * context-specific string supplied by the call site.
 */
export function resolveFunctionUserMessage(error: unknown, fallbackMessage: string): string {
  const status = getFunctionResponseStatus(error)

  if (status !== null && Object.prototype.hasOwnProperty.call(APPROVED_FUNCTION_STATUS_MESSAGES, status)) {
    return APPROVED_FUNCTION_STATUS_MESSAGES[status]
  }

  return fallbackMessage
}

/**
 * Reports bounded internal diagnostics for a failed Edge Function call through
 * the sanitized logging contract: scope, error kind and status only. Never
 * logs raw error messages, response bodies, headers or tokens.
 */
export function reportFunctionFailure(scope: string, error: unknown): void {
  const status = getFunctionResponseStatus(error)
  const kind = error instanceof Error && error.name ? error.name : typeof error

  logger.error(`[portal-api] ${scope}: ${kind}${status !== null ? ` (status ${status})` : ''}`)
}
