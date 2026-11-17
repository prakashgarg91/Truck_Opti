// Display and input helpers for freight-invoice money. Pure: no React, no network.
// All money is integer paise; text typed by a person is converted with string
// arithmetic only, so there are no floating point errors.

/** Indian digit grouping (12,34,567) of a non-negative integer string. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) return digits
  const last3 = digits.slice(-3)
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${rest},${last3}`
}

/** 123456789 paise -> "₹12,34,567.89". Negative amounts keep a leading minus. */
export function formatInr(paise: number): string {
  const negative = paise < 0
  const abs = Math.abs(Math.trunc(paise))
  const rupees = Math.floor(abs / 100)
  const rem = abs % 100
  return `${negative ? '-' : ''}₹${groupIndian(String(rupees))}.${String(rem).padStart(2, '0')}`
}

const RUPEES_PATTERN = /^\d{1,13}(\.\d{1,2})?$/

/**
 * "1,234.5" -> 123450. Returns null for empty, negative, more than two decimal
 * places, or non-numeric text. Zero is returned as 0 (callers decide if it is allowed).
 */
export function rupeesToPaise(text: string): number | null {
  const cleaned = text.trim().replace(/,/g, '')
  if (!RUPEES_PATTERN.test(cleaned)) return null
  const [whole, frac = ''] = cleaned.split('.')
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'))
}

const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/

/** Quantity with at most 3 decimal places, greater than zero; otherwise null. */
export function parseQuantity(text: string): number | null {
  const cleaned = text.trim()
  if (!QUANTITY_PATTERN.test(cleaned)) return null
  const value = Number(cleaned)
  return value > 0 ? value : null
}

export const STATE_CODE_PATTERN = /^(0[1-9]|[12][0-9]|3[0-8])$/
