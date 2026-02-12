import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  FileSpreadsheet, AlertCircle, CheckCircle2, 
  Package, Trash2, ArrowRight, Loader2,
  FileText, Download, RefreshCw
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import { saleOrdersSupabaseApi, type SaleOrder } from '../services/supabaseApi'
import { useLanguageStore } from '../stores/languageStore'
import { saleOrderItemSchema, validateWithZod, type SaleOrderItemInput } from '../utils/validators'

// Translations
const t = {
  en: {
    title: 'Sale Orders',
    subtitle: 'Import orders from CSV/Excel and optimize packing',
    uploadCsv: 'Upload CSV/Excel',
    dragDrop: 'Drag and drop or click to browse',
    supportedFormats: 'Supports .csv, .xlsx, .xls',
    preview: 'Preview',
    import: 'Import & Optimize',
    cancel: 'Cancel',
    rowErrors: 'Row Errors',
    productName: 'Product Name',
    dimensions: 'Dimensions (L×W×H cm)',
    weight: 'Weight (kg)',
    quantity: 'Qty',
    deliveryCity: 'Delivery City',
    validRows: 'Valid Rows',
    invalidRows: 'Invalid Rows',
    pastOrders: 'Past Orders',
    status: 'Status',
    pending: 'Pending',
    processing: 'Processing',
    completed: 'Completed',
    totalItems: 'Total Items',
    actions: 'Actions',
    view: 'View',
    delete: 'Delete',
    noOrders: 'No orders yet. Import your first sale order!',
    importing: 'Importing...',
    importSuccess: 'Order imported successfully!',
    importError: 'Failed to import order',
    confirmDelete: 'Delete this order?',
    deleteSuccess: 'Order deleted',
    downloadTemplate: 'Download Template'
  },
  hi: {
    title: 'सेल ऑर्डर्स',
    subtitle: 'CSV/Excel से ऑर्डर्स आयात करें और पैकिंग ऑप्टिमाइज़ करें',
    uploadCsv: 'CSV/Excel अपलोड',
    dragDrop: 'खींचें और छोड़ें या ब्राउज़ करें',
    supportedFormats: '.csv, .xlsx, .xls समर्थित',
    preview: 'पूर्वावलोकन',
    import: 'आयात और ऑप्टिमाइज़',
    cancel: 'रद्द',
    rowErrors: 'पंक्ति त्रुटियां',
    productName: 'उत्पाद नाम',
    dimensions: 'आयाम (L×W×H cm)',
    weight: 'वजन (kg)',
    quantity: 'मात्रा',
    deliveryCity: 'डिलीवरी शहर',
    validRows: 'वैध पंक्तियां',
    invalidRows: 'अमान्य पंक्तियां',
    pastOrders: 'पिछले ऑर्डर्स',
    status: 'स्थिति',
    pending: 'लंबित',
    processing: 'प्रसंस्करण',
    completed: 'पूर्ण',
    totalItems: 'कुल आइटम',
    actions: 'कार्रवाई',
    view: 'देखें',
    delete: 'हटाएं',
    noOrders: 'अभी तक कोई ऑर्डर नहीं। अपना पहला सेल ऑर्डर आयात करें!',
    importing: 'आयात हो रहा है...',
    importSuccess: 'ऑर्डर सफलतापूर्वक आयातित!',
    importError: 'ऑर्डर आयात करने में विफल',
    confirmDelete: 'यह ऑर्डर हटाएं?',
    deleteSuccess: 'ऑर्डर हटा दिया गया',
    downloadTemplate: 'टेम्पलेट डाउनलोड'
  }
}

interface ParsedItem {
  product_name: string
  length: number
  width: number
  height: number
  weight: number
  quantity: number
  delivery_city: string
  row: number
  errors: string[]
  isValid: boolean
}

export default function SaleOrdersPage() {
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const lang = (language === 'hi' ? 'hi' : 'en') as 'en' | 'hi'
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    fetchOrders()
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const data = await saleOrdersSupabaseApi.getAll()
      setOrders(data)
    } catch (error) {
      console.error('Failed to fetch orders:', error)
      toast.error('Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    
    try {
      let data: Record<string, unknown>[] = []
      
      if (file.name.endsWith('.csv')) {
        // Parse CSV
        const text = await file.text()
        const result = Papa.parse(text, { header: true, skipEmptyLines: true })
        data = result.data as Record<string, unknown>[]
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        // Parse Excel
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer)
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        data = XLSX.utils.sheet_to_json(sheet)
      } else {
        toast.error('Unsupported file format')
        setUploading(false)
        return
      }

      // Validate and parse items using Zod
      const items: ParsedItem[] = data.map((row, index) => {
        // Extract fields with flexible column names
        const product_name = String(row.product_name || row['Product Name'] || row['product name'] || '').trim()
        const length = parseFloat(String(row.length_cm || row['Length (cm)'] || row.length || 0))
        const width = parseFloat(String(row.width_cm || row['Width (cm)'] || row.width || 0))
        const height = parseFloat(String(row.height_cm || row['Height (cm)'] || row.height || 0))
        const weight = parseFloat(String(row.weight_kg || row['Weight (kg)'] || row.weight || 0))
        const quantity = parseInt(String(row.quantity || row.Qty || row.qty || 1))
        const delivery_city = String(row.delivery_city || row['Delivery City'] || row.city || '').trim()

        // Prepare data for Zod validation
        const itemData: Partial<SaleOrderItemInput> = {
          product_name,
          length,
          width,
          height,
          weight,
          quantity,
          delivery_city
        }

        // Validate with Zod
        const validation = validateWithZod(saleOrderItemSchema, itemData)
        
        // Format errors for display
        const errors = validation.errors?.map(err => {
          // Extract just the message part (remove field path)
          return err.includes(':') ? err.split(': ')[1] : err
        }) || []

        return {
          product_name,
          length,
          width,
          height,
          weight,
          quantity,
          delivery_city,
          row: index + 2, // +2 for header row and 1-based indexing
          errors,
          isValid: validation.success
        }
      })

      setParsedItems(items)
      setShowPreview(true)
      
      const validCount = items.filter(i => i.isValid).length
      toast.success(`Parsed ${validCount} valid items`)
    } catch (error) {
      console.error('Parse error:', error)
      toast.error('Failed to parse file')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImport = async () => {
    const validItems = parsedItems.filter(i => i.isValid)
    if (validItems.length === 0) {
      toast.error('No valid items to import')
      return
    }

    setImporting(true)
    
    try {
      // Calculate totals
      const totalItems = validItems.reduce((sum, item) => sum + item.quantity, 0)
      const totalWeight = validItems.reduce((sum, item) => sum + (item.weight * item.quantity), 0)
      const totalVolume = validItems.reduce((sum, item) => 
        sum + ((item.length * item.width * item.height * item.quantity) / 1000000), 0
      )
      const deliveryCity = validItems[0]?.delivery_city || 'Unknown'

      // Create order with items
      const order = await saleOrdersSupabaseApi.create(
        {
          order_number: `SO-${Date.now()}`,
          customer_id: null,
          status: 'pending',
          total_items: totalItems,
          total_weight: totalWeight,
          total_volume: totalVolume,
          delivery_city: deliveryCity
        },
        validItems.map(item => ({
          product_name: item.product_name,
          length: item.length,
          width: item.width,
          height: item.height,
          weight: item.weight,
          quantity: item.quantity
        }))
      )

      toast.success(t[lang].importSuccess)
      setShowPreview(false)
      setParsedItems([])
      
      // Navigate to packing with pre-loaded items
      const packingItems = validItems.map(item => ({
        id: `item-${Date.now()}-${Math.random()}`,
        name: item.product_name,
        length: item.length,
        width: item.width,
        height: item.height,
        weight: item.weight,
        quantity: item.quantity,
        stackable: true,
        fragile: false
      }))
      
      navigate('/packing', { state: { saleOrderItems: packingItems, saleOrderId: order.id } })
    } catch (error) {
      console.error('Import error:', error)
      toast.error(t[lang].importError)
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(t[lang].confirmDelete)) return
    
    try {
      await saleOrdersSupabaseApi.delete(id)
      toast.success(t[lang].deleteSuccess)
      fetchOrders()
    } catch (error) {
      toast.error('Failed to delete')
    }
  }

  const downloadTemplate = () => {
    const template = `product_name,length_cm,width_cm,height_cm,weight_kg,quantity,delivery_city
Box A,50,40,30,5,10,Mumbai
Box B,60,50,40,8,5,Delhi
Carton C,30,20,15,2,20,Bangalore`
    
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'sale_order_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const validItems = parsedItems.filter(i => i.isValid)
  const invalidItems = parsedItems.filter(i => !i.isValid)

  return (
    <div className="p-4 space-y-6 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t[lang].title}</h1>
        <p className="text-slate-500 dark:text-slate-400">{t[lang].subtitle}</p>
      </div>

      {/* Upload Section */}
      {!showPreview && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
          <div 
            className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-8 text-center hover:border-primary-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
            />
            <FileSpreadsheet className="w-12 h-12 text-slate-400 mx-auto mb-4" />
            <h3 className="font-semibold text-slate-900 dark:text-white mb-1">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> : null}
              {t[lang].uploadCsv}
            </h3>
            <p className="text-sm text-slate-500">{t[lang].dragDrop}</p>
            <p className="text-xs text-slate-400 mt-2">{t[lang].supportedFormats}</p>
          </div>

          <button
            onClick={downloadTemplate}
            className="mt-4 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
          >
            <Download className="w-4 h-4" />
            {t[lang].downloadTemplate}
          </button>
        </div>
      )}

      {/* Preview Section */}
      {showPreview && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{t[lang].preview}</h3>
              <div className="flex gap-4 text-sm mt-1">
                <span className="text-green-600">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                  {validItems.length} {t[lang].validRows}
                </span>
                {invalidItems.length > 0 && (
                  <span className="text-red-600">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    {invalidItems.length} {t[lang].invalidRows}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPreview(false); setParsedItems([]) }}
                className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300"
              >
                {t[lang].cancel}
              </button>
              <button
                onClick={handleImport}
                disabled={validItems.length === 0 || importing}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {t[lang].import}
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">{t[lang].productName}</th>
                  <th className="px-4 py-2 text-left">{t[lang].dimensions}</th>
                  <th className="px-4 py-2 text-left">{t[lang].weight}</th>
                  <th className="px-4 py-2 text-left">{t[lang].quantity}</th>
                  <th className="px-4 py-2 text-left">{t[lang].deliveryCity}</th>
                  <th className="px-4 py-2 text-left">{t[lang].rowErrors}</th>
                </tr>
              </thead>
              <tbody>
                {parsedItems.map((item, idx) => (
                  <tr key={idx} className={item.isValid ? '' : 'bg-red-50 dark:bg-red-900/20'}>
                    <td className="px-4 py-2">{item.product_name || '-'}</td>
                    <td className="px-4 py-2">{item.length}×{item.width}×{item.height}</td>
                    <td className="px-4 py-2">{item.weight}</td>
                    <td className="px-4 py-2">{item.quantity}</td>
                    <td className="px-4 py-2">{item.delivery_city}</td>
                    <td className="px-4 py-2 text-red-600 text-xs">
                      {item.errors.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Past Orders */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t[lang].pastOrders}</h2>
          <button 
            onClick={fetchOrders}
            className="p-2 text-slate-400 hover:text-slate-600"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
          </div>
        ) : orders.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={lang === 'en' ? 'No orders found' : 'कोई ऑर्डर नहीं मिला'}
            description={
              lang === 'en'
                ? 'Import your first sale order from CSV or Excel file'
                : 'CSV या Excel फाइल से अपना पहला सेल ऑर्डर आयात करें'
            }
            actionLabel={lang === 'en' ? 'Upload File' : 'फाइल अपलोड करें'}
            onAction={() => fileInputRef.current?.click()}
          />
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <div 
                key={order.id}
                className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-primary-500" />
                      <span className="font-semibold text-slate-900 dark:text-white">{order.order_number}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        order.status === 'completed' ? 'bg-green-100 text-green-700' :
                        order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {t[lang][order.status as keyof typeof t.en] || order.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {order.total_items} {t[lang].totalItems} • {order.delivery_city}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(order.created_at || '').toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(order.id)}
                    className="p-2 text-red-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
