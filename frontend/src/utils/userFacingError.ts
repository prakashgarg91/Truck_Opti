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