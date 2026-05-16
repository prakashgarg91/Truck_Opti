const DEFAULT_GST_RATE_PERCENT = 18

function parseBooleanFlag(value: string | undefined, defaultValue: boolean): boolean {
  if (typeof value !== 'string') {
    return defaultValue
  }

  const normalized = value.trim().toLowerCase()

  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false
  }

  return defaultValue
}

function parseRatePercent(value: string | undefined, defaultValue: number): number {
  const parsed = Number(value)

  if (!Number.isFinite(parsed) || parsed < 0) {
    return defaultValue
  }

  return parsed
}

export function getBillingConfig() {
  const gstEnabled = parseBooleanFlag(Deno.env.get('BILLING_GST_ENABLED') || undefined, false)
  const gstRatePercent = parseRatePercent(Deno.env.get('BILLING_GST_RATE_PERCENT') || undefined, DEFAULT_GST_RATE_PERCENT)

  return {
    gstEnabled,
    gstRatePercent,
    gstRateFraction: gstEnabled ? gstRatePercent / 100 : 0,
  }
}

export function calculateExpectedAmounts(baseAmount: number) {
  const { gstEnabled, gstRatePercent, gstRateFraction } = getBillingConfig()
  const taxAmount = gstEnabled ? Math.round(baseAmount * gstRateFraction) : 0

  return {
    subtotalAmount: baseAmount,
    taxAmount,
    totalAmount: baseAmount + taxAmount,
    gstEnabled,
    gstRatePercent,
  }
}