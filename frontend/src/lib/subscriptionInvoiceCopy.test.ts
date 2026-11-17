import { describe, expect, it } from 'vitest'
import { buildInvoiceCopyRows } from './subscriptionInvoiceCopy'
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
