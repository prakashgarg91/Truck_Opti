// Carries a parsed SB001/SB002/SB003 limit-guard error from the service layer
// to a page without losing it to the generic "Failed to ..." fallback.
// Pure: no React, no network. The server is the only authority.

import { parseSubscriptionError, type SubscriptionErrorInfo } from './billingState'
import { UserFacingError } from '../utils/userFacingError'

export class SubscriptionLimitError extends UserFacingError {
  info: SubscriptionErrorInfo
  constructor(info: SubscriptionErrorInfo) {
    super(info.message)
    this.name = 'SubscriptionLimitError'
    this.info = info
  }
}

/** Call with the raw RPC error: throws a SubscriptionLimitError for SB001/2/3, else returns. */
export function throwIfSubscriptionError(error: unknown): void {
  const info = parseSubscriptionError(error)
  if (info) throw new SubscriptionLimitError(info)
}

/** Prompt info for a caught error, or null when it is not a subscription error. */
export function subscriptionInfoFromError(error: unknown): SubscriptionErrorInfo | null {
  if (error instanceof SubscriptionLimitError) return error.info
  return parseSubscriptionError(error)
}
