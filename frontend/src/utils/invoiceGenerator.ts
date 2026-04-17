// GST Invoice Generator Utility
// Generates GST-compliant transport invoices

import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

export interface InvoiceData {
  invoiceNumber: string
  lrNumber: string
  ewayBillNumber?: string
  date: string
  // Company details
  companyName: string
  companyGstin: string
  companyAddress: string
  // Shipper details
  shipperName: string
  shipperAddress: string
  shipperGstin?: string
  // Consignee details
  consigneeName: string
  consigneeAddress: string
  consigneeGstin?: string
  // Shipment details
  shipmentId: string
  origin: string
  destination: string
  items: Array<{
    description: string
    quantity: number
    weight: number
    dimensions: string
  }>
  // Charges
  freightCharges: number
  loadingCharges: number
  unloadingCharges: number
  insuranceCharges?: number
  otherCharges?: number
  // GST
  isInterState: boolean
  gstRate: number // 18 for transport
}

export interface GeneratedInvoice extends InvoiceData {
  taxableAmount: number
  cgstAmount: number
  sgstAmount: number
  igstAmount: number
  totalGst: number
  grandTotal: number
  amountInWords: string
}

export const SAC_CODE = '996511' // Goods transport services

/**
 * Calculate GST and totals for invoice
 */
export function calculateInvoice(data: InvoiceData): GeneratedInvoice {
  const taxableAmount =
    data.freightCharges +
    data.loadingCharges +
    data.unloadingCharges +
    (data.insuranceCharges || 0) +
    (data.otherCharges || 0)

  const gstAmount = Math.round(taxableAmount * data.gstRate / 100)

  let cgstAmount = 0
  let sgstAmount = 0
  let igstAmount = 0

  if (data.isInterState) {
    igstAmount = gstAmount
  } else {
    cgstAmount = Math.round(gstAmount / 2)
    sgstAmount = Math.round(gstAmount / 2)
  }

  const grandTotal = taxableAmount + gstAmount

  return {
    ...data,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalGst: gstAmount,
    grandTotal,
    amountInWords: numberToWords(grandTotal)
  }
}

/**
 * Convert number to words for Indian currency
 */
function numberToWords(num: number): string {
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

  function convert(n: number): string {
    if (n === 0) return ''
    if (n < 10) return units[n]
    if (n < 20) return teens[n - 10]
    if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + units[n % 10] : '')
    if (n < 1000) return units[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '')
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '')
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '')
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '')
  }

  if (num === 0) return 'Zero Rupees Only'

  const rupees = Math.floor(num)
  const paise = Math.round((num - rupees) * 100)

  let result = convert(rupees) + ' Rupees'
  if (paise > 0) {
    result += ' and ' + convert(paise) + ' Paise'
  }
  result += ' Only'

  return result
}

/**
 * Generate PDF from invoice element
 */
export async function generateInvoicePDF(elementId: string, fileName?: string): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) {
    throw new Error('Invoice element not found')
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    logging: false
  })

  const imgData = canvas.toDataURL('image/png')

  // A4 dimensions in mm
  const pdf = new jsPDF('p', 'mm', 'a4')
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()

  const imgWidth = canvas.width
  const imgHeight = canvas.height
  const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight)

  const imgX = (pdfWidth - imgWidth * ratio) / 2
  const imgY = 10

  pdf.addImage(imgData, 'PNG', imgX, imgY, imgWidth * ratio, imgHeight * ratio)
  pdf.save(fileName || 'invoice.pdf')
}

/**
 * Format currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2
  }).format(amount)
}

/**
 * Get SAC code description
 */
export function getSacDescription(): string {
  return 'Goods Transport Services (GST SAC 996511)'
}
