// Freight invoice, GST and UPI link maths. Pure library: no React, no network,
// no clock or randomness. All money is integer paise; floats are only accepted
// for quantities (up to 3 decimal places) and converted to integers immediately.
// This module never moves funds: it only computes figures and builds a link.

export type GstRatePct = 0 | 5 | 12 | 18

const SUPPORTED_GST_RATES: readonly GstRatePct[] = [0, 5, 12, 18]

export interface InvoiceLine {
  description: string
  quantity: number
  ratePaise: number
}

export interface ComputeInvoiceInput {
  lines: InvoiceLine[]
  supplierStateCode: string
  placeOfSupplyStateCode: string
  gstRatePct: GstRatePct
  reverseCharge: boolean
  roundOff: boolean
}

export interface InvoiceResult {
  subtotalPaise: number
  cgstPaise: number
  sgstPaise: number
  igstPaise: number
  roundOffPaise: number
  totalPaise: number
  reverseCharge: boolean
}

export interface UpiLinkInput {
  payeeVpa: string
  payeeName: string
  amountPaise: number
  invoiceNumber: string
}

export type PaymentStatus = 'paid' | 'partial'

export interface PaymentAllocation {
  appliedPaise: number
  overpaymentPaise: number
  status: PaymentStatus
}

const VPA_PATTERN = /^[A-Za-z0-9._-]{1,256}@[A-Za-z0-9]{2,64}$/

function assertSafeNonNegativeInt(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer number of paise`)
  }
}

/** Integer n / d rounded half-up for non-negative n and positive integer d. */
function roundDivHalfUp(n: number, d: number): number {
  return Math.floor((2 * n + d) / (2 * d))
}

function lineAmountPaise(quantity: number, ratePaise: number): number {
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new RangeError('quantity must be a finite, non-negative number')
  }
  const quantityMilli = Math.round(quantity * 1000)
  if (Math.abs(quantityMilli - quantity * 1000) > 1e-6) {
    throw new RangeError('quantity may have at most 3 decimal places')
  }
  assertSafeNonNegativeInt(ratePaise, 'ratePaise')
  const product = quantityMilli * ratePaise
  if (!Number.isSafeInteger(product)) {
    throw new RangeError('line amount exceeds safe integer range')
  }
  return roundDivHalfUp(product, 1000)
}

export function computeInvoice(input: ComputeInvoiceInput): InvoiceResult {
  if (!SUPPORTED_GST_RATES.includes(input.gstRatePct)) {
    throw new RangeError(`unsupported GST rate: ${String(input.gstRatePct)}`)
  }

  let subtotalPaise = 0
  for (const line of input.lines) {
    subtotalPaise += lineAmountPaise(line.quantity, line.ratePaise)
  }
  if (!Number.isSafeInteger(subtotalPaise)) {
    throw new RangeError('invoice subtotal exceeds safe integer range')
  }

  let cgstPaise = 0
  let sgstPaise = 0
  let igstPaise = 0
  if (!input.reverseCharge && input.gstRatePct > 0) {
    if (input.supplierStateCode === input.placeOfSupplyStateCode) {
      cgstPaise = roundDivHalfUp(subtotalPaise * input.gstRatePct, 200)
      sgstPaise = cgstPaise
    } else {
      igstPaise = roundDivHalfUp(subtotalPaise * input.gstRatePct, 100)
    }
  }

  const beforeRoundOff = subtotalPaise + cgstPaise + sgstPaise + igstPaise
  let roundOffPaise = 0
  if (input.roundOff) {
    // Nearest whole rupee; exactly 50 paise rounds up.
    const roundedPaise = Math.floor((beforeRoundOff + 50) / 100) * 100
    roundOffPaise = roundedPaise - beforeRoundOff
  }

  return {
    subtotalPaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    roundOffPaise,
    totalPaise: beforeRoundOff + roundOffPaise,
    reverseCharge: input.reverseCharge,
  }
}

function formatRupees(amountPaise: number): string {
  const rupees = Math.floor(amountPaise / 100)
  const paise = amountPaise % 100
  return `${rupees}.${String(paise).padStart(2, '0')}`
}

export function buildUpiLink(input: UpiLinkInput): string {
  if (!VPA_PATTERN.test(input.payeeVpa)) {
    throw new RangeError('payeeVpa must look like name@bank')
  }
  if (!Number.isSafeInteger(input.amountPaise) || input.amountPaise <= 0) {
    throw new RangeError('amountPaise must be a positive integer number of paise')
  }
  if (input.payeeName.trim().length === 0) {
    throw new RangeError('payeeName is required')
  }
  if (input.invoiceNumber.trim().length === 0) {
    throw new RangeError('invoiceNumber is required')
  }

  const params = [
    ['pa', input.payeeVpa],
    ['pn', input.payeeName],
    ['am', formatRupees(input.amountPaise)],
    ['tn', input.invoiceNumber],
    ['cu', 'INR'],
  ] as const

  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  return `upi://pay?${query}`
}

export function allocatePayment(
  invoiceOutstandingPaise: number,
  paymentPaise: number,
): PaymentAllocation {
  assertSafeNonNegativeInt(invoiceOutstandingPaise, 'invoiceOutstandingPaise')
  assertSafeNonNegativeInt(paymentPaise, 'paymentPaise')

  const appliedPaise = Math.min(invoiceOutstandingPaise, paymentPaise)
  const overpaymentPaise = paymentPaise - appliedPaise
  const status: PaymentStatus =
    appliedPaise === invoiceOutstandingPaise ? 'paid' : 'partial'

  return { appliedPaise, overpaymentPaise, status }
}
