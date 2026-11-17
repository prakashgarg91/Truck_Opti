// Rupees <-> integer paise without floating point. The text is parsed digit by
// digit, so 19.99 is exactly 1999 paise (19.99 * 100 would give 1998.9999...).

const MAX_PAISE = 100_000_000 // matches the database limit (10,00,000 rupees)

/** "1,250.5" -> 125050. Returns null for blank, negative, >2 decimals or too large input. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '')
  const match = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return paise > 0 && paise <= MAX_PAISE ? paise : null
}

/** Like rupeesToPaise but a blank value means zero (an optional cost). */
export function optionalRupeesToPaise(input: string): number | null {
  return input.trim() === '' ? 0 : rupeesToPaise(input)
}

export function formatPaise(paise: number): string {
  const sign = paise < 0 ? '-' : ''
  const abs = Math.abs(paise)
  const rupees = Math.floor(abs / 100)
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${rest}`
}
