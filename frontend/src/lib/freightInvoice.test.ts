import { describe, expect, it } from 'vitest'
import {
  allocatePayment,
  buildUpiLink,
  computeInvoice,
  type ComputeInvoiceInput,
} from './freightInvoice'

// Money is integer paise throughout. Expected values below are worked out by
// hand from the rules: line = qty x rate (half-up to paise);
// CGST = SGST = half-up(subtotal x rate / 200); IGST = half-up(subtotal x rate / 100).

function input(overrides: Partial<ComputeInvoiceInput> = {}): ComputeInvoiceInput {
  return {
    lines: [{ description: 'Freight', quantity: 1, ratePaise: 10000 }],
    supplierStateCode: '27',
    placeOfSupplyStateCode: '27',
    gstRatePct: 18,
    reverseCharge: false,
    roundOff: false,
    ...overrides,
  }
}

describe('computeInvoice: intra-state (CGST + SGST)', () => {
  it('splits 18% into equal CGST and SGST halves', () => {
    const r = computeInvoice(input({ lines: [{ description: 'Freight', quantity: 2, ratePaise: 10000 }] }))
    expect(r.subtotalPaise).toBe(20000)
    expect(r.cgstPaise).toBe(1800)
    expect(r.sgstPaise).toBe(1800)
    expect(r.igstPaise).toBe(0)
    expect(r.totalPaise).toBe(23600)
    expect(r.reverseCharge).toBe(false)
  })

  it('CGST always equals SGST exactly, including odd paise', () => {
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1, ratePaise: 333 }], gstRatePct: 5 }),
    )
    expect(r.subtotalPaise).toBe(333)
    expect(r.cgstPaise).toBe(8)
    expect(r.sgstPaise).toBe(r.cgstPaise)
    expect(r.igstPaise).toBe(0)
    expect(r.totalPaise).toBe(333 + 8 + 8)
  })

  it('rounds a tie (0.5 paise of tax) half-up', () => {
    // subtotal 20 paise x 5% = 1 paise total, 0.5 per half -> rounds to 1
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1, ratePaise: 20 }], gstRatePct: 5 }),
    )
    expect(r.cgstPaise).toBe(1)
    expect(r.sgstPaise).toBe(1)
  })

  it('rounds a sub-half tax amount down', () => {
    // subtotal 10 paise x 5 / 200 = 0.25 paise per half -> 0
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1, ratePaise: 10 }], gstRatePct: 5 }),
    )
    expect(r.cgstPaise).toBe(0)
    expect(r.sgstPaise).toBe(0)
  })

  it('sums multiple lines before taxing', () => {
    const r = computeInvoice(
      input({
        lines: [
          { description: 'a', quantity: 1, ratePaise: 333 },
          { description: 'b', quantity: 2, ratePaise: 1 },
        ],
        gstRatePct: 18,
      }),
    )
    expect(r.subtotalPaise).toBe(335)
    expect(r.cgstPaise).toBe(30) // 335 x 18 / 200 = 30.15 -> 30
    expect(r.sgstPaise).toBe(30)
  })

  it('an empty invoice totals zero', () => {
    const r = computeInvoice(input({ lines: [] }))
    expect(r.subtotalPaise).toBe(0)
    expect(r.totalPaise).toBe(0)
  })
})

describe('computeInvoice: inter-state (IGST)', () => {
  it('charges IGST equal to the full rate when states differ', () => {
    const r = computeInvoice(
      input({
        lines: [{ description: 'Freight', quantity: 2, ratePaise: 10000 }],
        supplierStateCode: '27',
        placeOfSupplyStateCode: '29',
      }),
    )
    expect(r.igstPaise).toBe(3600)
    expect(r.cgstPaise).toBe(0)
    expect(r.sgstPaise).toBe(0)
    expect(r.totalPaise).toBe(23600)
  })

  it('rounds IGST half-up on odd paise', () => {
    // 333 x 5 / 100 = 16.65 -> 17
    const r = computeInvoice(
      input({
        lines: [{ description: 'x', quantity: 1, ratePaise: 333 }],
        gstRatePct: 5,
        supplierStateCode: '07',
        placeOfSupplyStateCode: '27',
      }),
    )
    expect(r.igstPaise).toBe(17)
    expect(r.totalPaise).toBe(333 + 17)
  })
})

describe('computeInvoice: GST rate table', () => {
  const subtotal = 10000
  const cases: Array<[0 | 5 | 12 | 18, number]> = [
    [0, 0],
    [5, 250],
    [12, 600],
    [18, 900],
  ]

  for (const [rate, halfTax] of cases) {
    it(`intra-state at ${rate}% gives ${halfTax} paise per half`, () => {
      const r = computeInvoice(
        input({ lines: [{ description: 'x', quantity: 1, ratePaise: subtotal }], gstRatePct: rate }),
      )
      expect(r.cgstPaise).toBe(halfTax)
      expect(r.sgstPaise).toBe(halfTax)
      expect(r.totalPaise).toBe(subtotal + 2 * halfTax)
    })

    it(`inter-state at ${rate}% gives ${2 * halfTax} paise IGST`, () => {
      const r = computeInvoice(
        input({
          lines: [{ description: 'x', quantity: 1, ratePaise: subtotal }],
          gstRatePct: rate,
          placeOfSupplyStateCode: '29',
        }),
      )
      expect(r.igstPaise).toBe(2 * halfTax)
      expect(r.totalPaise).toBe(subtotal + 2 * halfTax)
    })
  }

  it('rejects an unsupported GST rate', () => {
    expect(() => computeInvoice(input({ gstRatePct: 7 as unknown as 18 }))).toThrow()
  })
})

describe('computeInvoice: reverse charge', () => {
  it('zeroes all tax and flags reverse charge (intra-state)', () => {
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 2, ratePaise: 10000 }], reverseCharge: true }),
    )
    expect(r.cgstPaise).toBe(0)
    expect(r.sgstPaise).toBe(0)
    expect(r.igstPaise).toBe(0)
    expect(r.subtotalPaise).toBe(20000)
    expect(r.totalPaise).toBe(20000)
    expect(r.reverseCharge).toBe(true)
  })

  it('zeroes IGST too for an inter-state reverse-charge invoice', () => {
    const r = computeInvoice(
      input({
        lines: [{ description: 'x', quantity: 2, ratePaise: 10000 }],
        placeOfSupplyStateCode: '29',
        reverseCharge: true,
      }),
    )
    expect(r.igstPaise).toBe(0)
    expect(r.totalPaise).toBe(20000)
    expect(r.reverseCharge).toBe(true)
  })
})

describe('computeInvoice: line amounts', () => {
  it('rounds a fractional quantity x rate half-up to the paisa', () => {
    // 1.5 x 333 = 499.5 paise -> 500
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1.5, ratePaise: 333 }], gstRatePct: 0 }),
    )
    expect(r.subtotalPaise).toBe(500)
  })

  it('rounds a 3-decimal quantity correctly', () => {
    // 0.001 x 1 = 0.001 paise -> 0
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 0.001, ratePaise: 1 }], gstRatePct: 0 }),
    )
    expect(r.subtotalPaise).toBe(0)
  })

  it('does not drift with decimal quantities (0.1 x 3 is exactly 0.3 paise -> 0)', () => {
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 0.1, ratePaise: 3 }], gstRatePct: 0 }),
    )
    expect(r.subtotalPaise).toBe(0)
  })

  it('rejects a non-integer rate in paise', () => {
    expect(() =>
      computeInvoice(input({ lines: [{ description: 'x', quantity: 1, ratePaise: 10.5 }] })),
    ).toThrow()
  })

  it('rejects a negative rate in paise', () => {
    expect(() =>
      computeInvoice(input({ lines: [{ description: 'x', quantity: 1, ratePaise: -1 }] })),
    ).toThrow()
  })
})

describe('computeInvoice: round-off to the nearest rupee', () => {
  it('leaves an already-whole total untouched', () => {
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 2, ratePaise: 10000 }], roundOff: true }),
    )
    expect(r.totalPaise).toBe(23600)
    expect(r.roundOffPaise).toBe(0)
  })

  it('rounds 40 paise up to the next rupee and reports the difference', () => {
    // 10050 + 905 + 905 = 11860 -> 11900
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1, ratePaise: 10050 }], roundOff: true }),
    )
    expect(r.cgstPaise).toBe(905)
    expect(r.totalPaise).toBe(11900)
    expect(r.roundOffPaise).toBe(40)
  })

  it('rounds exactly 50 paise up', () => {
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1, ratePaise: 11850 }], gstRatePct: 0, roundOff: true }),
    )
    expect(r.totalPaise).toBe(11900)
    expect(r.roundOffPaise).toBe(50)
  })

  it('rounds 49 paise down and reports a negative difference', () => {
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1, ratePaise: 11849 }], gstRatePct: 0, roundOff: true }),
    )
    expect(r.totalPaise).toBe(11800)
    expect(r.roundOffPaise).toBe(-49)
  })

  it('reports zero round-off when roundOff is off, even with paise', () => {
    const r = computeInvoice(
      input({ lines: [{ description: 'x', quantity: 1, ratePaise: 11849 }], gstRatePct: 0, roundOff: false }),
    )
    expect(r.roundOffPaise).toBe(0)
    expect(r.totalPaise).toBe(11849)
  })

  it('applies round-off to a reverse-charge invoice', () => {
    const r = computeInvoice(
      input({
        lines: [{ description: 'x', quantity: 1, ratePaise: 10050 }],
        reverseCharge: true,
        roundOff: true,
      }),
    )
    expect(r.totalPaise).toBe(10100)
    expect(r.roundOffPaise).toBe(50)
  })
})

describe('buildUpiLink', () => {
  it('builds a UPI pay link with amount formatted from paise', () => {
    const link = buildUpiLink({
      payeeVpa: 'merchant@okhdfcbank',
      payeeName: 'Truck Opti Logistics',
      amountPaise: 123450,
      invoiceNumber: 'INV-2026-001',
    })
    expect(link).toBe(
      'upi://pay?pa=merchant%40okhdfcbank&pn=Truck%20Opti%20Logistics&am=1234.50&tn=INV-2026-001&cu=INR',
    )
  })

  it('encodes an ampersand in the payee name', () => {
    const link = buildUpiLink({
      payeeVpa: 'a.b@ybl',
      payeeName: 'Ram & Sons',
      amountPaise: 100,
      invoiceNumber: 'INV1',
    })
    expect(link).toContain('pn=Ram%20%26%20Sons')
    expect(link).not.toContain('Ram & Sons')
  })

  it('formats one paisa as 0.01', () => {
    const link = buildUpiLink({
      payeeVpa: 'a@ybl',
      payeeName: 'X',
      amountPaise: 1,
      invoiceNumber: 'INV1',
    })
    expect(link).toContain('am=0.01')
  })

  it('formats whole rupees with two decimals', () => {
    const link = buildUpiLink({
      payeeVpa: 'a@ybl',
      payeeName: 'X',
      amountPaise: 100000,
      invoiceNumber: 'INV1',
    })
    expect(link).toContain('am=1000.00')
  })

  it('always sets currency to INR', () => {
    const link = buildUpiLink({
      payeeVpa: 'a@ybl',
      payeeName: 'X',
      amountPaise: 5,
      invoiceNumber: 'INV1',
    })
    expect(link.endsWith('&cu=INR')).toBe(true)
    expect(link.startsWith('upi://pay?')).toBe(true)
  })

  it('rejects a VPA without an @ handle', () => {
    expect(() =>
      buildUpiLink({ payeeVpa: 'merchantbank', payeeName: 'X', amountPaise: 100, invoiceNumber: 'INV1' }),
    ).toThrow()
  })

  it('rejects a VPA with a space or empty handle', () => {
    expect(() =>
      buildUpiLink({ payeeVpa: 'a b@okhdfc', payeeName: 'X', amountPaise: 100, invoiceNumber: 'INV1' }),
    ).toThrow()
    expect(() =>
      buildUpiLink({ payeeVpa: '@okhdfc', payeeName: 'X', amountPaise: 100, invoiceNumber: 'INV1' }),
    ).toThrow()
  })

  it('rejects zero, negative, and fractional amounts', () => {
    const base = { payeeVpa: 'a@ybl', payeeName: 'X', invoiceNumber: 'INV1' }
    expect(() => buildUpiLink({ ...base, amountPaise: 0 })).toThrow()
    expect(() => buildUpiLink({ ...base, amountPaise: -1 })).toThrow()
    expect(() => buildUpiLink({ ...base, amountPaise: 1.5 })).toThrow()
  })

  it('rejects an empty payee name or invoice number', () => {
    expect(() =>
      buildUpiLink({ payeeVpa: 'a@ybl', payeeName: '', amountPaise: 100, invoiceNumber: 'INV1' }),
    ).toThrow()
    expect(() =>
      buildUpiLink({ payeeVpa: 'a@ybl', payeeName: 'X', amountPaise: 100, invoiceNumber: '' }),
    ).toThrow()
  })
})

describe('allocatePayment', () => {
  it('applies a partial payment', () => {
    expect(allocatePayment(10000, 4000)).toEqual({
      appliedPaise: 4000,
      overpaymentPaise: 0,
      status: 'partial',
    })
  })

  it('marks an exact payment as paid', () => {
    expect(allocatePayment(10000, 10000)).toEqual({
      appliedPaise: 10000,
      overpaymentPaise: 0,
      status: 'paid',
    })
  })

  it('reports overpayment beyond the outstanding balance', () => {
    expect(allocatePayment(10000, 12000)).toEqual({
      appliedPaise: 10000,
      overpaymentPaise: 2000,
      status: 'paid',
    })
  })

  it('a zero payment leaves an open invoice partial with nothing applied', () => {
    expect(allocatePayment(10000, 0)).toEqual({
      appliedPaise: 0,
      overpaymentPaise: 0,
      status: 'partial',
    })
  })

  it('a payment against a zero balance is all overpayment', () => {
    expect(allocatePayment(0, 500)).toEqual({
      appliedPaise: 0,
      overpaymentPaise: 500,
      status: 'paid',
    })
  })

  it('zero against zero is paid with nothing moved', () => {
    expect(allocatePayment(0, 0)).toEqual({
      appliedPaise: 0,
      overpaymentPaise: 0,
      status: 'paid',
    })
  })

  it('rejects negative or fractional inputs', () => {
    expect(() => allocatePayment(-1, 100)).toThrow()
    expect(() => allocatePayment(100, -1)).toThrow()
    expect(() => allocatePayment(100.5, 100)).toThrow()
    expect(() => allocatePayment(100, 0.5)).toThrow()
  })
})
