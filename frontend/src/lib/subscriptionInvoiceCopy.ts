// Pure content of the client-side subscription tax invoice copy. Every value comes from the stored
// invoice snapshot (integer paise, text as recorded). A row is added only when its value exists:
// nothing is invented, defaulted or recomputed here.

import { formatInr, paiseToWords } from './invoiceMoney'
import type { SubscriptionInvoice } from '../services/subscriptionApi'

export interface InvoiceCopyRow {
  label: string
  value: string
  /** Rows above the rule are identity fields, rows below are amounts. */
  section: 'details' | 'amounts'
}

export interface InvoiceCopyOptions {
  customerName: string
  planName: string
  formatDate: (value?: string | null) => string
}

function present(value: string | null | undefined): string | null {
  const text = typeof value === 'string' ? value.trim() : ''
  return text ? text : null
}

export function buildInvoiceCopyRows(invoice: SubscriptionInvoice, options: InvoiceCopyOptions): InvoiceCopyRow[] {
  const rows: InvoiceCopyRow[] = []
  const detail = (label: string, value: string | null) => {
    if (value) rows.push({ label, value, section: 'details' })
  }
  const amount = (label: string, value: string | null) => {
    if (value) rows.push({ label, value, section: 'amounts' })
  }

  detail('Supplier', present(invoice.supplier_legal_name))
  detail('Supplier GSTIN', present(invoice.supplier_gstin))
  detail('Supplier address', present(invoice.supplier_address))
  detail('Invoice Number', present(invoice.invoice_number))
  detail('Issued On', options.formatDate(invoice.issued_at))
  detail('Plan', present(options.planName))
  detail('Billed To', present(invoice.recipient_name) ?? present(options.customerName))
  detail('Recipient GSTIN', present(invoice.recipient_gstin))
  detail('Recipient address', present(invoice.recipient_address))
  detail('Place of Supply', present(invoice.place_of_supply_state_code))
  detail('SAC', present(invoice.sac_code))

  // Amounts are the stored integer-paise figures; nothing is recomputed here.
  amount('Taxable value', formatInr(invoice.taxable_paise))
  if (invoice.igst_paise > 0) {
    amount('IGST (18%)', formatInr(invoice.igst_paise))
  } else {
    amount('CGST (9%)', formatInr(invoice.cgst_paise))
    amount('SGST (9%)', formatInr(invoice.sgst_paise))
  }
  amount('Total', formatInr(invoice.total_paise))
  amount('Total in words', paiseToWords(invoice.total_paise))
  for (const note of invoice.credit_notes) {
    amount(
      `Credit note ${note.credit_note_number}`,
      `-${formatInr(note.total_paise)} on ${options.formatDate(note.issued_at)}`,
    )
  }
  return rows
}
