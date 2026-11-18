/** Display-only masking of payout identifiers. Never use the masked value for storage. */

/** "123456784321" -> "****4321". Short or empty values are fully hidden. */
export function maskBankAccount(value: string | null | undefined): string {
    const v = (value ?? '').replace(/\s+/g, '')
    if (!v) return ''
    if (v.length <= 4) return '****'
    return `****${v.slice(-4)}`
}

/** "ravi@okbank" -> "ra***@okbank". Values without a handle keep only the first two characters. */
export function maskUpi(value: string | null | undefined): string {
    const v = (value ?? '').trim()
    if (!v) return ''
    const at = v.indexOf('@')
    if (at <= 0) return `${v.slice(0, 2)}***`
    return `${v.slice(0, Math.min(2, at))}***${v.slice(at)}`
}
