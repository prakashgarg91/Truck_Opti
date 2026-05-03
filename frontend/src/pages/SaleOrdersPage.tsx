import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FileSpreadsheet, AlertCircle, CheckCircle2,
  Package, Trash2, ArrowRight, Loader2,
  FileText, Download, RefreshCw
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import Papa from 'papaparse'
import toast from 'react-hot-toast'
import { saleOrdersSupabaseApi, type SaleOrder } from '../services/supabaseApi'
import { saleOrderItemSchema, validateWithZod, type SaleOrderItemInput } from '../utils/validators'
import { logger } from '../utils/logger'
import { useSubscription } from '../hooks/useSubscription'

const text = {
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
  const { checkLimit, showUpgradePrompt } = useSubscription()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [orders, setOrders] = useState<SaleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [importing, setImporting] = useState(false)
  const [reoptimizing, setReoptimizing] = useState<string | null>(null)

  useEffect(() => {
    fetchOrders()
  }, [])

  useEffect(() => {
    document.title = 'Sale Orders - TruckOpti'
  }, [])

  const fetchOrders = async () => {
    try {
      setLoading(true)
      const data = await saleOrdersSupabaseApi.getAll()
      setOrders(data)
    } catch (error) {
      logger.error('Failed to fetch orders:', error)
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
        // Parse Excel - dynamic import to reduce bundle size
        const XLSX = await import('xlsx-js-style')
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
      // Filter out completely empty rows (all fields empty/null/undefined)
      const nonEmptyRows = data.filter((row) => {
        // Check if row has any non-empty value
        return Object.values(row).some(val => {
          if (val === null || val === undefined) return false
          const strVal = String(val).trim()
          return strVal !== '' && strVal !== '0'
        })
      })

      const items: ParsedItem[] = nonEmptyRows.map((row, index) => {
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
      logger.error('Parse error:', error)
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

    // Check subscription limit before importing
    const allowed = await checkLimit('sale_order_imports')
    if (!allowed) {
      showUpgradePrompt('sale order imports')
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

      toast.success(text.importSuccess)
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
      logger.error('Import error:', error)
      toast.error(text.importError)
    } finally {
      setImporting(false)
    }
  }

  const handleReoptimize = async (orderId: string) => {
    setReoptimizing(orderId)
    try {
      const orderWithItems = await saleOrdersSupabaseApi.getById(orderId)
      if (!orderWithItems || !orderWithItems.items?.length) {
        toast.error('No items found for this order')
        return
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- saleOrdersApi returns untyped item rows
      const packingItems = orderWithItems.items.map((item: any) => ({
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
      navigate('/packing', { state: { saleOrderItems: packingItems, saleOrderId: orderId } })
    } catch (error) {
      logger.error('Re-optimize error:', error)
      toast.error('Failed to load order items')
    } finally {
      setReoptimizing(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm(text.confirmDelete)) return

    try {
      await saleOrdersSupabaseApi.delete(id)
      toast.success(text.deleteSuccess)
      fetchOrders()
    } catch (_error) {
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
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 pb-8 md:pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{text.title}</h1>
        <p className="text-slate-500 dark:text-slate-400">{text.subtitle}</p>
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
              {text.uploadCsv}
            </h3>
            <p className="text-sm text-slate-500">{text.dragDrop}</p>
            <p className="text-xs text-slate-400 mt-2">{text.supportedFormats}</p>
          </div>

          <button
            onClick={downloadTemplate}
            className="mt-4 flex items-center gap-2 text-sm text-primary-600 hover:text-primary-700"
          >
            <Download className="w-4 h-4" />
            {text.downloadTemplate}
          </button>
        </div>
      )}

      {/* Preview Section */}
      {showPreview && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">{text.preview}</h3>
              <div className="flex gap-4 text-sm mt-1">
                <span className="text-green-600">
                  <CheckCircle2 className="w-4 h-4 inline mr-1" />
                  {validItems.length} {text.validRows}
                </span>
                {invalidItems.length > 0 && (
                  <span className="text-red-600">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    {invalidItems.length} {text.invalidRows}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowPreview(false); setParsedItems([]) }}
                className="px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-700 dark:text-slate-300"
              >
                {text.cancel}
              </button>
              <button
                onClick={handleImport}
                disabled={validItems.length === 0 || importing}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {text.import}
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="overflow-x-auto max-h-96">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-700 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left">{text.productName}</th>
                  <th className="px-4 py-2 text-left">{text.dimensions}</th>
                  <th className="px-4 py-2 text-left">{text.weight}</th>
                  <th className="px-4 py-2 text-left">{text.quantity}</th>
                  <th className="px-4 py-2 text-left">{text.deliveryCity}</th>
                  <th className="px-4 py-2 text-left">{text.rowErrors}</th>
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
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{text.pastOrders}</h2>
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
            title="No orders found"
            description="Import your first sale order from CSV or Excel file"
            actionLabel="Upload File"
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
                      <span className={`text-xs px-2 py-0.5 rounded-full ${order.status === 'completed' ? 'bg-green-100 text-green-700' :
                        order.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                        {text[order.status as keyof typeof text] || order.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {order.total_items} {text.totalItems} • {order.delivery_city}
                    </p>
                    <p className="text-xs text-slate-400">
                      {new Date(order.created_at || '').toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleReoptimize(order.id)}
                      disabled={reoptimizing === order.id}
                      title="Re-optimize packing"
                      className="p-2 text-primary-500 hover:text-primary-700 disabled:opacity-50"
                    >
                      {reoptimizing === order.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : <RefreshCw className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(order.id)}
                      className="p-2 text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
