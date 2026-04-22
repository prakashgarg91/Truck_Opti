import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Download, ArrowLeft, MessageCircle,
  Truck, MapPin, Package, AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { shipmentsSupabaseApi, type Shipment } from '../services/supabaseApi'
import { useAuthStore } from '../stores/authStore'
import {
  calculateInvoice,
  generateInvoicePDF,
  formatCurrency,
  getSacDescription,
  SAC_CODE,
  type InvoiceData
} from '../utils/invoiceGenerator'
import { shareInvoice } from '../utils/whatsappShare'
import { logger } from '../utils/logger'

// City to state mapping for GST detection
const getState = (location: string): string => {
  const stateMap: Record<string, string> = {
    'mumbai': 'MH', 'pune': 'MH', 'nagpur': 'MH', 'nashik': 'MH', 'thane': 'MH',
    'delhi': 'DL', 'new delhi': 'DL', 'noida': 'UP', 'gurgaon': 'HR', 'gurugram': 'HR',
    'bangalore': 'KA', 'bengaluru': 'KA', 'mysore': 'KA', 'mysuru': 'KA',
    'chennai': 'TN', 'coimbatore': 'TN', 'madurai': 'TN',
    'hyderabad': 'TS', 'kolkata': 'WB', 'ahmedabad': 'GJ', 'surat': 'GJ',
    'jaipur': 'RJ', 'lucknow': 'UP', 'kanpur': 'UP', 'patna': 'BR',
    'bhopal': 'MP', 'indore': 'MP', 'chandigarh': 'CH', 'kochi': 'KL',
    'trivandrum': 'KL', 'thiruvananthapuram': 'KL', 'visakhapatnam': 'AP',
  };
  const city = location.toLowerCase().trim();
  return stateMap[city] || city;
};

const text = {
  title: 'GST Invoice',
  back: 'Back',
  download: 'Download PDF',
  share: 'Share via WhatsApp',
  print: 'Print',
  taxInvoice: 'TAX INVOICE',
  original: 'Original for Recipient',
  company: 'Company',
  shipper: 'Shipper (From)',
  consignee: 'Consignee (To)',
  shipmentDetails: 'Shipment Details',
  itemDescription: 'Description',
  quantity: 'Qty',
  weight: 'Weight',
  dimensions: 'Dimensions',
  charges: 'Charges',
  freight: 'Freight',
  loading: 'Loading',
  unloading: 'Unloading',
  taxableAmount: 'Taxable Amount',
  cgst: 'CGST (9%)',
  sgst: 'SGST (9%)',
  igst: 'IGST (18%)',
  totalGst: 'Total GST',
  grandTotal: 'Grand Total',
  amountInWords: 'Amount in Words',
  declaration: 'Declaration',
  declarationText: 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.',
  authorizedSignatory: 'Authorized Signatory',
  forCompany: 'For',
  lrNumber: 'LR Number',
  ewayBill: 'E-Way Bill',
  sacCode: 'SAC Code',
  gstin: 'GSTIN',
  invoiceDate: 'Invoice Date',
  dueDate: 'Due Date',
  notAvailable: 'N/A'
}

export default function InvoicePage() {
  const { shipmentId } = useParams<{ shipmentId: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const invoiceRef = useRef<HTMLDivElement>(null)

  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [invoiceData, setInvoiceData] = useState<ReturnType<typeof calculateInvoice> | null>(null)

  useEffect(() => {
    if (shipmentId) {
      fetchShipment()
    }
    // fetchShipment only uses shipmentId which is already the dep trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipmentId])

  useEffect(() => {
    document.title = invoiceData?.invoiceNumber
      ? `Invoice ${invoiceData.invoiceNumber} - TruckOpti`
      : 'Invoice - TruckOpti'
  }, [invoiceData])

  const fetchShipment = async () => {
    try {
      setLoading(true)
      const data = await shipmentsSupabaseApi.getById(shipmentId!)

      if (!data) {
        setShipment(null)
        setInvoiceData(null)
        return
      }

      const documentNumbers = data.invoice_number && data.lr_number
        ? {
          invoice_number: data.invoice_number,
          lr_number: data.lr_number,
        }
        : await shipmentsSupabaseApi.ensureDocumentNumbers(data.id)

      const shipmentWithDocuments: Shipment = {
        ...data,
        invoice_number: documentNumbers.invoice_number,
        lr_number: documentNumbers.lr_number,
      }

      setShipment(shipmentWithDocuments)

      // Get company info from auth store (populated at login)
      const companyInfo = user?.user_metadata?.company || {};

      const invoiceInput: InvoiceData = {
        invoiceNumber: shipmentWithDocuments.invoice_number || 'INV-PENDING',
        lrNumber: shipmentWithDocuments.lr_number || 'LR-PENDING',
        date: new Date().toISOString(),
        companyName: companyInfo.name || 'Your Company Name',
        companyGstin: companyInfo.gstin || '',
        companyAddress: companyInfo.address ||
          [companyInfo.address_line1, companyInfo.address_line2, companyInfo.city, companyInfo.state, companyInfo.pincode]
            .filter(Boolean).join(', ') || '',
        shipperName: shipmentWithDocuments.origin || 'Unknown',
        shipperAddress: shipmentWithDocuments.origin || '',
        consigneeName: shipmentWithDocuments.destination || 'Unknown',
        consigneeAddress: shipmentWithDocuments.destination || '',
        shipmentId: shipmentWithDocuments.shipment_id,
        origin: shipmentWithDocuments.origin,
        destination: shipmentWithDocuments.destination,
        items: [{
          description: `Transportation of goods from ${shipmentWithDocuments.origin} to ${shipmentWithDocuments.destination}`,
          quantity: 1,
          weight: shipmentWithDocuments.total_weight,
          dimensions: `${shipmentWithDocuments.total_volume.toFixed(2)} m³`
        }],
        freightCharges: shipmentWithDocuments.estimated_cost || 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loading/unloading_charges are optional DB columns not in the base Shipment type
        loadingCharges: (shipmentWithDocuments as any).loading_charges || 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unloadingCharges: (shipmentWithDocuments as any).unloading_charges || 0,
        isInterState: getState(shipmentWithDocuments.origin || '') !== getState(shipmentWithDocuments.destination || ''),
        gstRate: 18
      }

      setInvoiceData(calculateInvoice(invoiceInput))
    } catch (error) {
      logger.error('Failed to fetch shipment:', error)
      toast.error('Failed to load shipment')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadPDF = async () => {
    try {
      await generateInvoicePDF('invoice-content', `invoice-${invoiceData?.invoiceNumber}.pdf`)
      toast.success('Invoice downloaded!')
    } catch (_error) {
      toast.error('Failed to download PDF')
    }
  }

  const handleShareWhatsApp = () => {
    if (invoiceData) {
      shareInvoice({
        invoiceNumber: invoiceData.invoiceNumber,
        shipmentId: invoiceData.shipmentId,
        totalAmount: invoiceData.taxableAmount,
        gstAmount: invoiceData.totalGst,
        customerName: invoiceData.consigneeName,
        origin: invoiceData.origin,
        destination: invoiceData.destination
      })
    }
  }

  const handlePrint = () => {
    window.print()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!shipment || !invoiceData) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">{text.notAvailable}</p>
        <button
          onClick={() => navigate('/tracking')}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg"
        >
          {text.back}
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4 sticky top-0 z-10 no-print">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <button
            onClick={() => navigate('/tracking')}
            className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-slate-900"
          >
            <ArrowLeft className="w-5 h-5" />
            {text.back}
          </button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{text.title}</h1>
          <div className="flex gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{text.share}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            >
              <span className="hidden sm:inline">{text.print}</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{text.download}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Company Profile Incomplete Banner */}
      {invoiceData.companyName === 'Your Company Name' && (
        <div className="mx-4 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 print:hidden">
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Company profile incomplete</p>
            <p className="text-xs text-amber-600 mt-0.5">Your company name, GSTIN and address will appear on all invoices. <button onClick={() => navigate('/settings/company')} className="underline font-medium">Complete your profile →</button></p>
          </div>
        </div>
      )}

      {/* Invoice Content */}
      <div className="p-4 max-w-5xl mx-auto">
        <div
          id="invoice-content"
          ref={invoiceRef}
          className="bg-white rounded-xl shadow-lg p-8 print:shadow-none"
        >
          {/* Invoice Header */}
          <div className="border-b-2 border-slate-200 pb-6 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{text.taxInvoice}</h2>
                <p className="text-sm text-slate-500 mt-1">{text.original}</p>
              </div>
              <div className="text-right">
                <div className="w-24 h-24 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Truck className="w-12 h-12 text-primary-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Company & Invoice Details */}
          <div className="grid grid-cols-2 gap-8 mb-6">
            <div>
              <h3 className="font-bold text-slate-900 mb-2">{invoiceData.companyName}</h3>
              <p className="text-sm text-slate-600">{invoiceData.companyAddress}</p>
              <p className="text-sm text-slate-600 mt-1">{text.gstin}: {invoiceData.companyGstin}</p>
            </div>
            <div className="text-right">
              <div className="space-y-1">
                <p className="text-sm"><span className="text-slate-500">{text.taxInvoice} #:</span> <span className="font-semibold">{invoiceData.invoiceNumber}</span></p>
                <p className="text-sm"><span className="text-slate-500">{text.lrNumber}:</span> <span className="font-semibold">{invoiceData.lrNumber}</span></p>
                <p className="text-sm"><span className="text-slate-500">{text.sacCode}:</span> <span className="font-semibold">{SAC_CODE}</span></p>
                <p className="text-sm"><span className="text-slate-500">{text.invoiceDate}:</span> <span className="font-semibold">{new Date(invoiceData.date).toLocaleDateString()}</span></p>
              </div>
            </div>
          </div>

          {/* Shipper & Consignee */}
          <div className="grid grid-cols-2 gap-8 mb-6 bg-slate-50 p-4 rounded-lg">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">{text.shipper}</h4>
              <p className="font-medium">{invoiceData.shipperName}</p>
              <p className="text-sm text-slate-600">{invoiceData.shipperAddress}</p>
              {invoiceData.shipperGstin && (
                <p className="text-sm text-slate-600">{text.gstin}: {invoiceData.shipperGstin}</p>
              )}
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">{text.consignee}</h4>
              <p className="font-medium">{invoiceData.consigneeName}</p>
              <p className="text-sm text-slate-600">{invoiceData.consigneeAddress}</p>
              {invoiceData.consigneeGstin && (
                <p className="text-sm text-slate-600">{text.gstin}: {invoiceData.consigneeGstin}</p>
              )}
            </div>
          </div>

          {/* Shipment Details */}
          <div className="mb-6">
            <h4 className="font-semibold text-slate-900 mb-3">{text.shipmentDetails}</h4>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary-500" />
                <span>{invoiceData.origin}</span>
              </div>
              <span className="text-slate-400">→</span>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-green-500" />
                <span>{invoiceData.destination}</span>
              </div>
              <span className="text-slate-400">|</span>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-slate-500" />
                <span>{shipment.total_weight} kg</span>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full mb-6">
            <thead className="bg-slate-100">
              <tr>
                <th className="text-left p-3 text-sm font-semibold">{text.itemDescription}</th>
                <th className="text-center p-3 text-sm font-semibold">{text.quantity}</th>
                <th className="text-center p-3 text-sm font-semibold">{text.weight}</th>
                <th className="text-right p-3 text-sm font-semibold">{text.charges}</th>
              </tr>
            </thead>
            <tbody>
              {invoiceData.items.map((item, idx) => (
                <tr key={idx} className="border-b">
                  <td className="p-3">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-xs text-slate-500">{getSacDescription()}</p>
                  </td>
                  <td className="p-3 text-center">{item.quantity}</td>
                  <td className="p-3 text-center">{item.weight} kg</td>
                  <td className="p-3 text-right">{formatCurrency(invoiceData.freightCharges)}</td>
                </tr>
              ))}
              <tr className="border-b">
                <td className="p-3" colSpan={3}>{text.loading}</td>
                <td className="p-3 text-right">{formatCurrency(invoiceData.loadingCharges)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-3" colSpan={3}>{text.unloading}</td>
                <td className="p-3 text-right">{formatCurrency(invoiceData.unloadingCharges)}</td>
              </tr>
            </tbody>
          </table>

          {/* Tax Summary */}
          <div className="border-t-2 border-slate-200 pt-4">
            <div className="w-full max-w-md ml-auto space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">{text.taxableAmount}</span>
                <span className="font-medium">{formatCurrency(invoiceData.taxableAmount)}</span>
              </div>

              {invoiceData.isInterState ? (
                <div className="flex justify-between">
                  <span className="text-slate-600">{text.igst}</span>
                  <span className="font-medium">{formatCurrency(invoiceData.igstAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{text.cgst}</span>
                    <span className="font-medium">{formatCurrency(invoiceData.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{text.sgst}</span>
                    <span className="font-medium">{formatCurrency(invoiceData.sgstAmount)}</span>
                  </div>
                </>
              )}

              <div className="flex justify-between pt-2 border-t">
                <span className="text-slate-600">{text.totalGst}</span>
                <span className="font-medium">{formatCurrency(invoiceData.totalGst)}</span>
              </div>

              <div className="flex justify-between pt-2 border-t-2 border-slate-300">
                <span className="text-lg font-bold text-slate-900">{text.grandTotal}</span>
                <span className="text-lg font-bold text-slate-900">{formatCurrency(invoiceData.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">{text.amountInWords}</p>
            <p className="font-medium text-slate-900">{invoiceData.amountInWords}</p>
          </div>

          {/* Declaration & Signature */}
          <div className="mt-8 grid grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">{text.declaration}</h4>
              <p className="text-xs text-slate-600">{text.declarationText}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-900">{text.forCompany} {invoiceData.companyName}</p>
              <div className="mt-8 pt-4 border-t border-slate-300 inline-block">
                <p className="text-sm text-slate-600">{text.authorizedSignatory}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          #invoice-content { box-shadow: none !important; }
        }
      `}</style>
    </div>
  )
}
