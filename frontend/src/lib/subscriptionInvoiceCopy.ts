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

export const UNREGISTERED_SELLER_NOTICE = 'Seller not registered under GST. No GST charged.'

/**
 * True when the invoice was issued with no GST: gst_rate_pct 0, or no supplier GSTIN on the snapshot.
 * Decided per invoice from the stored snapshot, never from the current settings.
 */
export function isUnregisteredInvoice(invoice: SubscriptionInvoice): boolean {
  return invoice.gst_rate_pct === 0 || !present(invoice.supplier_gstin)
}

/** Document title: "Tax Invoice" for GST invoices, "Invoice" when no GST was charged. */
export function invoiceTitle(invoice: SubscriptionInvoice): 'Tax Invoice' | 'Invoice' {
  return isUnregisteredInvoice(invoice) ? 'Invoice' : 'Tax Invoice'
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
  const unregistered = isUnregisteredInvoice(invoice)
  if (!unregistered) detail('Supplier GSTIN', present(invoice.supplier_gstin))
  detail('Supplier address', present(invoice.supplier_address))
  detail('Invoice Number', present(invoice.invoice_number))
  detail('Issued On', options.formatDate(invoice.issued_at))
  detail('Plan', present(options.planName))
  detail('Billed To', present(invoice.recipient_name) ?? present(options.customerName))
  detail('Recipient GSTIN', present(invoice.recipient_gstin))
  detail('Recipient address', present(invoice.recipient_address))
  detail('Place of Supply', present(invoice.place_of_supply_state_code))
  detail('SAC', present(invoice.sac_code))
  if (unregistered) detail('GST status', UNREGISTERED_SELLER_NOTICE)

  // Amounts are the stored integer-paise figures; nothing is recomputed here.
  amount('Taxable value', formatInr(invoice.taxable_paise))
  if (!unregistered) {
    if (invoice.igst_paise > 0) {
      amount('IGST (18%)', formatInr(invoice.igst_paise))
    } else {
      amount('CGST (9%)', formatInr(invoice.cgst_paise))
      amount('SGST (9%)', formatInr(invoice.sgst_paise))
    }
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
