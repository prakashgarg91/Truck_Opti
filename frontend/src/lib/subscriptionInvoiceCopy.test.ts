import { describe, expect, it } from 'vitest'
import { buildInvoiceCopyRows, invoiceTitle, isUnregisteredInvoice, UNREGISTERED_SELLER_NOTICE } from './subscriptionInvoiceCopy'
import type { SubscriptionInvoice } from '../services/subscriptionApi'

const BASE: SubscriptionInvoice = {
  id: 'inv-1',
  invoice_number: 'TO/26-27/000001',
  issued_at: '2026-07-15T06:00:00Z',
  taxable_paise: 49900,
  cgst_paise: 4491,
  sgst_paise: 4491,
  igst_paise: 0,
  total_paise: 58882,
  place_of_supply_state_code: '27',
  sac_code: '997331',
  recipient_name: 'Alpha Freight',
  recipient_gstin: '27AAAPL1234C1ZV',
  recipient_address: '9 Ring Road, Pune',
  supplier_legal_name: 'TruckOpti Technologies Pvt Ltd',
  supplier_address: '1 MG Road, Pune',
  supplier_gstin: '27ABCDE1234F1Z5',
  credit_notes: [],
}
const OPTIONS = { customerName: 'Fallback Co', planName: 'Growth', formatDate: (v?: string | null) => `D(${v ?? '-'})` }
const get = (rows: ReturnType<typeof buildInvoiceCopyRows>, label: string) => rows.find((r) => r.label === label)?.value

describe('buildInvoiceCopyRows', () => {
  it('prints every legal field present on the snapshot', () => {
    const rows = buildInvoiceCopyRows(BASE, OPTIONS)
    expect(get(rows, 'Supplier')).toBe('TruckOpti Technologies Pvt Ltd')
    expect(get(rows, 'Supplier GSTIN')).toBe('27ABCDE1234F1Z5')
    expect(get(rows, 'Supplier address')).toBe('1 MG Road, Pune')
    expect(get(rows, 'Invoice Number')).toBe('TO/26-27/000001')
    expect(get(rows, 'Recipient address')).toBe('9 Ring Road, Pune')
    expect(get(rows, 'Place of Supply')).toBe('27')
    expect(get(rows, 'SAC')).toBe('997331')
    expect(get(rows, 'Taxable value')).toBe('₹499.00')
    expect(get(rows, 'CGST (9%)')).toBe('₹44.91')
    expect(get(rows, 'SGST (9%)')).toBe('₹44.91')
    expect(get(rows, 'IGST (18%)')).toBeUndefined()
    expect(get(rows, 'Total')).toBe('₹588.82')
    expect(get(rows, 'Total in words')).toBe('Indian Rupees Five Hundred Eighty Eight and Eighty Two Paise Only')
  })

  it('shows IGST instead of CGST and SGST for an inter-state supply', () => {
    const rows = buildInvoiceCopyRows({ ...BASE, cgst_paise: 0, sgst_paise: 0, igst_paise: 8982 }, OPTIONS)
    expect(get(rows, 'IGST (18%)')).toBe('₹89.82')
    expect(get(rows, 'CGST (9%)')).toBeUndefined()
    expect(get(rows, 'SGST (9%)')).toBeUndefined()
  })

  it('omits fields the snapshot does not have instead of inventing them', () => {
    const rows = buildInvoiceCopyRows(
      { ...BASE, supplier_legal_name: null, supplier_address: undefined, supplier_gstin: '  ', recipient_address: null, recipient_gstin: null, recipient_name: null },
      OPTIONS,
    )
    const labels = rows.map((r) => r.label)
    for (const absent of ['Supplier', 'Supplier address', 'Supplier GSTIN', 'Recipient address', 'Recipient GSTIN']) {
      expect(labels).not.toContain(absent)
    }
    expect(get(rows, 'Billed To')).toBe('Fallback Co')
  })

  it('lists credit notes as negative amounts', () => {
    const rows = buildInvoiceCopyRows(
      { ...BASE, credit_notes: [{ id: 'c1', credit_note_number: 'CN/26-27/000001', issued_at: '2026-08-01T00:00:00Z', total_paise: 2360 }] },
      OPTIONS,
    )
    expect(get(rows, 'Credit note CN/26-27/000001')).toBe('-₹23.60 on D(2026-08-01T00:00:00Z)')
  })
})

// Unregistered seller: the invoice was issued with gst_rate_pct 0, no supplier GSTIN and zero tax.
const UNREGISTERED: SubscriptionInvoice = {
  ...BASE,
  gst_rate_pct: 0,
  supplier_gstin: null,
  cgst_paise: 0,
  sgst_paise: 0,
  igst_paise: 0,
  total_paise: 49900,
}

describe('invoice copy for a GST invoice (registered seller)', () => {
  it('is titled Tax Invoice and keeps the supplier GSTIN and tax rows', () => {
    expect(isUnregisteredInvoice(BASE)).toBe(false)
    expect(invoiceTitle(BASE)).toBe('Tax Invoice')
    const rows = buildInvoiceCopyRows({ ...BASE, gst_rate_pct: 18 }, OPTIONS)
    expect(get(rows, 'Supplier GSTIN')).toBe('27ABCDE1234F1Z5')
    expect(get(rows, 'CGST (9%)')).toBe('₹44.91')
    expect(get(rows, 'GST status')).toBeUndefined()
  })

  it('treats a missing gst_rate_pct with a supplier GSTIN as registered (older snapshots)', () => {
    expect(isUnregisteredInvoice({ ...BASE, gst_rate_pct: undefined })).toBe(false)
  })
})

describe('invoice copy for an invoice with no GST (unregistered seller)', () => {
  it('is titled Invoice when gst_rate_pct is 0', () => {
    expect(isUnregisteredInvoice(UNREGISTERED)).toBe(true)
    expect(invoiceTitle(UNREGISTERED)).toBe('Invoice')
  })

  it('is titled Invoice when the supplier GSTIN is missing, even if the rate is 18', () => {
    const invoice = { ...BASE, gst_rate_pct: 18, supplier_gstin: null }
    expect(isUnregisteredInvoice(invoice)).toBe(true)
    expect(invoiceTitle(invoice)).toBe('Invoice')
  })

  it('prints no seller GSTIN line and no CGST, SGST or IGST rows', () => {
    const rows = buildInvoiceCopyRows(UNREGISTERED, OPTIONS)
    const labels = rows.map((r) => r.label)
    expect(labels).not.toContain('Supplier GSTIN')
    expect(labels).not.toContain('CGST (9%)')
    expect(labels).not.toContain('SGST (9%)')
    expect(labels).not.toContain('IGST (18%)')
  })

  it('prints the no-GST line and keeps the other seller and recipient fields', () => {
    const rows = buildInvoiceCopyRows(UNREGISTERED, OPTIONS)
    expect(get(rows, 'GST status')).toBe(UNREGISTERED_SELLER_NOTICE)
    expect(UNREGISTERED_SELLER_NOTICE).toBe('Seller not registered under GST. No GST charged.')
    expect(get(rows, 'Supplier')).toBe('TruckOpti Technologies Pvt Ltd')
    expect(get(rows, 'Recipient GSTIN')).toBe('27AAAPL1234C1ZV')
    expect(get(rows, 'Taxable value')).toBe('₹499.00')
  })

  it('totals equal the taxable amount', () => {
    const rows = buildInvoiceCopyRows(UNREGISTERED, OPTIONS)
    expect(get(rows, 'Taxable value')).toBe('₹499.00')
    expect(get(rows, 'Total')).toBe('₹499.00')
    expect(get(rows, 'Total in words')).toBe('Indian Rupees Four Hundred Ninety Nine Only')
  })
})
