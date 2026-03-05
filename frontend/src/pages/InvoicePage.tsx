import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Download, ArrowLeft, MessageCircle,
  Truck, MapPin, Package, AlertCircle
} from 'lucide-react'
import toast from 'react-hot-toast'
import { shipmentsSupabaseApi, type Shipment } from '../services/supabaseApi'
import { supabase } from '../lib/supabase'
import {
  calculateInvoice,
  generateInvoiceNumber,
  generateLRNumber,
  generateInvoicePDF,
  formatCurrency,
  getSacDescription,
  SAC_CODE,
  type InvoiceData
} from '../utils/invoiceGenerator'
import { shareInvoice } from '../utils/whatsappShare'
import { useLanguageStore } from '../stores/languageStore'
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

// Translations
const t = {
  en: {
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
  },
  hi: {
    title: 'GST इनवॉइस',
    back: 'वापस',
    download: 'PDF डाउनलोड',
    share: 'WhatsApp से साझा करें',
    print: 'प्रिंट',
    taxInvoice: 'कर चालान',
    original: 'प्राप्तकर्ता के लिए मूल',
    company: 'कंपनी',
    shipper: 'प्रेषक (से)',
    consignee: 'प्राप्तकर्ता (को)',
    shipmentDetails: 'शिपमेंट विवरण',
    itemDescription: 'विवरण',
    quantity: 'मात्रा',
    weight: 'वजन',
    dimensions: 'आयाम',
    charges: 'शुल्क',
    freight: 'माल ढुलाई',
    loading: 'लोडिंग',
    unloading: 'अनलोडिंग',
    taxableAmount: 'कर योग्य राशि',
    cgst: 'CGST (9%)',
    sgst: 'SGST (9%)',
    igst: 'IGST (18%)',
    totalGst: 'कुल GST',
    grandTotal: 'कुल योग',
    amountInWords: 'शब्दों में राशि',
    declaration: 'घोषणा',
    declarationText: 'हम घोषणा करते हैं कि यह चालान वर्णित वस्तुओं का वास्तविक मूल्य दर्शाता है और सभी विवरण सत्य और सही हैं।',
    authorizedSignatory: 'अधिकृत हस्ताक्षरकर्ता',
    forCompany: 'के लिए',
    lrNumber: 'LR नंबर',
    ewayBill: 'E-Way बिल',
    sacCode: 'SAC कोड',
    gstin: 'GSTIN',
    invoiceDate: 'चालान तिथि',
    dueDate: 'देय तिथि',
    notAvailable: 'उपलब्ध नहीं'
  }
}

export default function InvoicePage() {
  const { shipmentId } = useParams<{ shipmentId: string }>()
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const lang = (language === 'hi' ? 'hi' : 'en') as 'en' | 'hi'
  const invoiceRef = useRef<HTMLDivElement>(null)
  
  const [shipment, setShipment] = useState<Shipment | null>(null)
  const [loading, setLoading] = useState(true)
  const [invoiceData, setInvoiceData] = useState<ReturnType<typeof calculateInvoice> | null>(null)

  useEffect(() => {
    if (shipmentId) {
      fetchShipment()
    }
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
      setShipment(data)

      if (data) {
        // Get user profile for company info
        const { data: { user } } = await supabase.auth.getUser();
        const companyInfo = user?.user_metadata?.company || {};

        // Generate invoice from shipment data
        const invoiceInput: InvoiceData = {
          invoiceNumber: generateInvoiceNumber(),
          lrNumber: generateLRNumber(),
          date: new Date().toISOString(),
          companyName: companyInfo.name || 'Your Company Name',
          companyGstin: companyInfo.gstin || '',
          companyAddress: companyInfo.address ||
            [companyInfo.address_line1, companyInfo.address_line2, companyInfo.city, companyInfo.state, companyInfo.pincode]
              .filter(Boolean).join(', ') || '',
          shipperName: data.origin || 'Unknown',
          shipperAddress: data.origin || '',
          consigneeName: data.destination || 'Unknown',
          consigneeAddress: data.destination || '',
          shipmentId: data.shipment_id,
          origin: data.origin,
          destination: data.destination,
          items: [{
            description: `Transportation of goods from ${data.origin} to ${data.destination}`,
            quantity: 1,
            weight: data.total_weight,
            dimensions: `${data.total_volume.toFixed(2)} m³`
          }],
          freightCharges: data.estimated_cost || 0,
          loadingCharges: (data as any).loading_charges || 0,
          unloadingCharges: (data as any).unloading_charges || 0,
          isInterState: getState(data.origin || '') !== getState(data.destination || ''),
          gstRate: 18
        }

        setInvoiceData(calculateInvoice(invoiceInput))
      }
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
    } catch (error) {
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
        <p className="text-slate-500">{t[lang].notAvailable}</p>
        <button 
          onClick={() => navigate('/tracking')}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg"
        >
          {t[lang].back}
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
            {t[lang].back}
          </button>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">{t[lang].title}</h1>
          <div className="flex gap-2">
            <button
              onClick={handleShareWhatsApp}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <MessageCircle className="w-4 h-4" />
              <span className="hidden sm:inline">{t[lang].share}</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            >
              <span className="hidden sm:inline">{t[lang].print}</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">{t[lang].download}</span>
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
                <h2 className="text-2xl font-bold text-slate-900">{t[lang].taxInvoice}</h2>
                <p className="text-sm text-slate-500 mt-1">{t[lang].original}</p>
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
              <p className="text-sm text-slate-600 mt-1">{t[lang].gstin}: {invoiceData.companyGstin}</p>
            </div>
            <div className="text-right">
              <div className="space-y-1">
                <p className="text-sm"><span className="text-slate-500">{t[lang].taxInvoice} #:</span> <span className="font-semibold">{invoiceData.invoiceNumber}</span></p>
                <p className="text-sm"><span className="text-slate-500">{t[lang].lrNumber}:</span> <span className="font-semibold">{invoiceData.lrNumber}</span></p>
                <p className="text-sm"><span className="text-slate-500">{t[lang].sacCode}:</span> <span className="font-semibold">{SAC_CODE}</span></p>
                <p className="text-sm"><span className="text-slate-500">{t[lang].invoiceDate}:</span> <span className="font-semibold">{new Date(invoiceData.date).toLocaleDateString()}</span></p>
              </div>
            </div>
          </div>

          {/* Shipper & Consignee */}
          <div className="grid grid-cols-2 gap-8 mb-6 bg-slate-50 p-4 rounded-lg">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">{t[lang].shipper}</h4>
              <p className="font-medium">{invoiceData.shipperName}</p>
              <p className="text-sm text-slate-600">{invoiceData.shipperAddress}</p>
              {invoiceData.shipperGstin && (
                <p className="text-sm text-slate-600">{t[lang].gstin}: {invoiceData.shipperGstin}</p>
              )}
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">{t[lang].consignee}</h4>
              <p className="font-medium">{invoiceData.consigneeName}</p>
              <p className="text-sm text-slate-600">{invoiceData.consigneeAddress}</p>
              {invoiceData.consigneeGstin && (
                <p className="text-sm text-slate-600">{t[lang].gstin}: {invoiceData.consigneeGstin}</p>
              )}
            </div>
          </div>

          {/* Shipment Details */}
          <div className="mb-6">
            <h4 className="font-semibold text-slate-900 mb-3">{t[lang].shipmentDetails}</h4>
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
                <th className="text-left p-3 text-sm font-semibold">{t[lang].itemDescription}</th>
                <th className="text-center p-3 text-sm font-semibold">{t[lang].quantity}</th>
                <th className="text-center p-3 text-sm font-semibold">{t[lang].weight}</th>
                <th className="text-right p-3 text-sm font-semibold">{t[lang].charges}</th>
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
                <td className="p-3" colSpan={3}>{t[lang].loading}</td>
                <td className="p-3 text-right">{formatCurrency(invoiceData.loadingCharges)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-3" colSpan={3}>{t[lang].unloading}</td>
                <td className="p-3 text-right">{formatCurrency(invoiceData.unloadingCharges)}</td>
              </tr>
            </tbody>
          </table>

          {/* Tax Summary */}
          <div className="border-t-2 border-slate-200 pt-4">
            <div className="w-full max-w-md ml-auto space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">{t[lang].taxableAmount}</span>
                <span className="font-medium">{formatCurrency(invoiceData.taxableAmount)}</span>
              </div>
              
              {invoiceData.isInterState ? (
                <div className="flex justify-between">
                  <span className="text-slate-600">{t[lang].igst}</span>
                  <span className="font-medium">{formatCurrency(invoiceData.igstAmount)}</span>
                </div>
              ) : (
                <>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t[lang].cgst}</span>
                    <span className="font-medium">{formatCurrency(invoiceData.cgstAmount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t[lang].sgst}</span>
                    <span className="font-medium">{formatCurrency(invoiceData.sgstAmount)}</span>
                  </div>
                </>
              )}
              
              <div className="flex justify-between pt-2 border-t">
                <span className="text-slate-600">{t[lang].totalGst}</span>
                <span className="font-medium">{formatCurrency(invoiceData.totalGst)}</span>
              </div>
              
              <div className="flex justify-between pt-2 border-t-2 border-slate-300">
                <span className="text-lg font-bold text-slate-900">{t[lang].grandTotal}</span>
                <span className="text-lg font-bold text-slate-900">{formatCurrency(invoiceData.grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Amount in Words */}
          <div className="mt-6 p-4 bg-slate-50 rounded-lg">
            <p className="text-sm text-slate-500">{t[lang].amountInWords}</p>
            <p className="font-medium text-slate-900">{invoiceData.amountInWords}</p>
          </div>

          {/* Declaration & Signature */}
          <div className="mt-8 grid grid-cols-2 gap-8">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">{t[lang].declaration}</h4>
              <p className="text-xs text-slate-600">{t[lang].declarationText}</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-900">{t[lang].forCompany} {invoiceData.companyName}</p>
              <div className="mt-8 pt-4 border-t border-slate-300 inline-block">
                <p className="text-sm text-slate-600">{t[lang].authorizedSignatory}</p>
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
