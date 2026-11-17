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

const WORD_UNITS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
const WORD_TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const WORD_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function wordsBelowThousand(n: number): string {
  const parts: string[] = []
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  if (hundreds > 0) parts.push(`${WORD_UNITS[hundreds]} Hundred`)
  if (rest >= 20) parts.push(WORD_TENS[Math.floor(rest / 10)] + (rest % 10 ? ` ${WORD_UNITS[rest % 10]}` : ''))
  else if (rest >= 10) parts.push(WORD_TEENS[rest - 10])
  else if (rest > 0) parts.push(WORD_UNITS[rest])
  return parts.join(' ')
}

/** Indian-system words (Crore, Lakh, Thousand) for a non-negative integer below 100 crore crore. */
function wordsIndian(n: number): string {
  const crore = Math.floor(n / 10_000_000)
  const lakh = Math.floor((n % 10_000_000) / 100_000)
  const thousand = Math.floor((n % 100_000) / 1000)
  const rest = n % 1000
  const parts: string[] = []
  if (crore > 0) parts.push(`${wordsIndian(crore)} Crore`)
  if (lakh > 0) parts.push(`${wordsBelowThousand(lakh)} Lakh`)
  if (thousand > 0) parts.push(`${wordsBelowThousand(thousand)} Thousand`)
  if (rest > 0) parts.push(wordsBelowThousand(rest))
  return parts.join(' ')
}

/**
 * Integer paise -> "Indian Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only".
 * Integer arithmetic only. Returns null for a negative, non-integer or unsafe value.
 */
export function paiseToWords(paise: number): string | null {
  if (!Number.isSafeInteger(paise) || paise < 0) return null
  const rupees = Math.floor(paise / 100)
  const rem = paise % 100
  if (rupees === 0 && rem === 0) return 'Indian Rupees Zero Only'
  const parts: string[] = []
  if (rupees > 0) parts.push(`${wordsIndian(rupees)}`)
  const rupeeText = rupees > 0 ? `Indian Rupees ${parts[0]}` : 'Indian Rupees Zero'
  const paiseText = rem > 0 ? ` and ${wordsBelowThousand(rem)} Paise` : ''
  return `${rupeeText}${paiseText} Only`
}
