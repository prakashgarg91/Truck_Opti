import { reportLoggedError } from './monitoring'

// Logger utility.
// Console output remains development-only, but operational failures must be
// reportable in production: `logger.error` now routes through the sanitized
// monitoring funnel (a no-op when no reporting DSN is configured) in addition
// to the development console.
const isDev = import.meta.env.DEV

export const logger = {
  // eslint-disable-next-line no-console
  log: (...args: unknown[]) => isDev && console.log(...args),
  warn: (...args: unknown[]) => isDev && console.warn(...args),
  error: (...args: unknown[]) => {
    if (isDev) {
      console.error(...args)
    }
    reportLoggedError(args)
  },
  // eslint-disable-next-line no-console
  info: (...args: unknown[]) => isDev && console.info(...args),
}
