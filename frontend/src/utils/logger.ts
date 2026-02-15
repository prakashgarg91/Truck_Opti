// Logger utility - only logs in development mode
const isDev = import.meta.env.DEV

export const logger = {
  log: (...args: unknown[]) => isDev && console.log(...args),
  warn: (...args: unknown[]) => isDev && console.warn(...args),
  error: (...args: unknown[]) => isDev && console.error(...args),
  info: (...args: unknown[]) => isDev && console.info(...args),
}
