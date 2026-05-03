import { useState, useEffect, useCallback } from 'react'
import { FileText, TrendingUp, Download, Clock, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { formatCurrency } from '../utils/formatters'
import { logger } from '../utils/logger'
import toast from 'react-hot-toast'

interface BillingSummary {
  thisMonth: number
  pending: number
  totalPaid: number
  gstDue: number
}

interface DeliveredJob {
  id: string
  fare: number
  origin: string
  destination: string
  updated_at: string
  shipment_id: string
}

// GST on freight: 5% of taxable value
const GST_RATE = 0.05

export default function AgencyBillingPage() {
  const { user } = useAuthStore()
  const [summary, setSummary] = useState<BillingSummary>({ thisMonth: 0, pending: 0, totalPaid: 0, gstDue: 0 })
  const [loading, setLoading] = useState(true)
  const [deliveredJobs, setDeliveredJobs] = useState<DeliveredJob[]>([])

  const monthlyReports = Array.from({ length: 3 }, (_, index) => {
    const monthDate = new Date()
    monthDate.setMonth(monthDate.getMonth() - (index + 1))

    return {
      key: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      label: `GSTR-1 (${monthDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })})`,
    }
  })

  const fetchBilling = useCallback(async () => {
    if (!user?.id) return
    try {
      const { data: agency, error: agencyErr } = await supabase
        .from('transport_agencies').select('id').eq('user_id', user.id).maybeSingle()
      if (agencyErr) throw agencyErr
      if (!agency?.id) return

      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
      const [monthRes, pendingRes, paidRes, deliveredRes] = await Promise.all([
        supabase.from('agency_jobs').select('fare').eq('agency_id', agency.id)
          .eq('status', 'delivered').gte('updated_at', monthStart),
        supabase.from('agency_jobs').select('fare').eq('agency_id', agency.id)
          .in('status', ['accepted', 'in_transit']),
        supabase.from('agency_jobs').select('fare').eq('agency_id', agency.id).eq('status', 'delivered'),
        supabase.from('agency_jobs').select('id, fare, updated_at, shipments(origin, destination, shipment_id)')
          .eq('agency_id', agency.id).eq('status', 'delivered')
          .order('updated_at', { ascending: false }),
      ])
      const billingError = monthRes.error || pendingRes.error || paidRes.error || deliveredRes.error
      if (billingError) throw billingError

      const sum = (rows: { fare: number | null }[]) =>
        rows.reduce((a, r) => a + (r.fare ?? 0), 0)
      const thisMonth = sum(monthRes.data ?? [])
      const pending = sum(pendingRes.data ?? [])
      const totalPaid = sum(paidRes.data ?? [])

      // Map delivered jobs
      const jobs: DeliveredJob[] = (deliveredRes.data ?? []).map((j: Record<string, unknown>) => {
        const s = (Array.isArray(j.shipments) ? j.shipments[0] : j.shipments) as Record<string, unknown> | null
        return {
          id: j.id as string,
          fare: Number(j.fare ?? 0),
          origin: s?.origin as string ?? '—',
          destination: s?.destination as string ?? '—',
          updated_at: j.updated_at as string,
          shipment_id: (s?.shipment_id as string) ?? '',
        }
      })

      setDeliveredJobs(jobs)
      setSummary({ thisMonth, pending, totalPaid, gstDue: Math.round(thisMonth * GST_RATE) })
    } catch (e) {
      logger.error('[AgencyBillingPage] fetchBilling failed:', e)
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => { fetchBilling() }, [fetchBilling])

  const exportMonthlyCsv = (reportMonth: string) => {
    const reportJobs = deliveredJobs.filter((job) => job.updated_at.slice(0, 7) === reportMonth)

    if (reportJobs.length === 0) {
      toast.error('No delivered jobs found for this report month')
      return
    }

    const headers = ['Shipment ID', 'Origin', 'Destination', 'Delivered Date', 'Taxable Value (INR)', 'GST 5% (INR)', 'Invoice Total (INR)']
    const rows = reportJobs.map((job) => {
      const gstAmount = Number((job.fare * GST_RATE).toFixed(2))
      const totalAmount = Number((job.fare + gstAmount).toFixed(2))

      return [
        job.shipment_id || job.id.slice(-8),
        job.origin,
        job.destination,
        new Date(job.updated_at).toLocaleDateString('en-IN'),
        job.fare,
        gstAmount,
        totalAmount,
      ]
    })

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `truckopti-gstr1-${reportMonth}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success('CSV exported successfully!')
  }

  const generateInvoice = async (job: DeliveredJob) => {
    // Dynamic import to reduce initial bundle size
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF()
    const invoiceNum = `TRK-${job.id.slice(0, 8).toUpperCase()}`
    const date = new Date(job.updated_at).toLocaleDateString('en-IN')
    const gstAmount = job.fare * GST_RATE
    const total = job.fare * (1 + GST_RATE)

    doc.setFontSize(20)
    doc.text('TruckOpti Tax Invoice', 20, 30)

    doc.setFontSize(12)
    doc.text(`Invoice #: ${invoiceNum}`, 20, 50)
    doc.text(`Date: ${date}`, 20, 60)
    doc.text(`Route: ${job.origin} → ${job.destination}`, 20, 70)
    doc.text(`Subtotal: ₹${job.fare.toLocaleString('en-IN')}`, 20, 85)
    doc.text(`GST (5%): ₹${gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 20, 95)
    doc.text(`Total: ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 20, 110)

    doc.setFontSize(10)
    doc.text('Thank you for using TruckOpti!', 20, 130)

    doc.save(`TruckOpti-Invoice-${job.id.slice(0, 8)}.pdf`)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Billing & Invoices</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Revenue overview and invoice management</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'This Month', value: formatCurrency(summary.thisMonth), icon: TrendingUp, color: 'text-green-500' },
          { label: 'In Progress Value', value: formatCurrency(summary.pending), icon: Clock, color: 'text-amber-500' },
          { label: 'Total Paid', value: formatCurrency(summary.totalPaid), icon: FileText, color: 'text-blue-500' },
          { label: 'GST Due (5%)', value: formatCurrency(summary.gstDue), icon: FileText, color: 'text-red-500' },
        ].map(card => (
          <div key={card.label} className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
            <card.icon size={16} className={`${card.color} mb-2`} />
            <p className="text-lg font-bold text-slate-800 dark:text-slate-100">{card.value}</p>
            <p className="text-xs text-slate-400">{card.label}</p>
          </div>
        ))}
      </div>

      {/* GSTR Export */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">GST Reports</h3>
        <div className="space-y-2">
          {monthlyReports.map((report) => (
            <div key={report.key} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-400" />
                <span className="text-sm text-slate-700 dark:text-slate-300">{report.label}</span>
              </div>
              <button
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium"
                onClick={() => exportMonthlyCsv(report.key)}
              >
                <Download size={12} />
                CSV
              </button>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Full GSTR-1 export with SAC 996511 classification coming in Phase 4
        </p>
      </div>

      {/* Delivered Jobs Invoices */}
      {deliveredJobs.length > 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
            <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <FileText size={16} className="text-green-500" />
              Invoices ({deliveredJobs.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700/50">
            {deliveredJobs.map(job => (
              <div key={job.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">
                    {job.origin} → {job.destination}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(job.updated_at).toLocaleDateString('en-IN', {
                      day: '2-digit', month: 'short', year: 'numeric'
                    })} • #{(job.shipment_id || job.id).slice(-8)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-green-600">
                    {formatCurrency(job.fare)}
                  </span>
                  <button
                    onClick={() => generateInvoice(job)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Download size={12} />
                    Invoice
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <FileText size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No invoices yet</p>
          <p className="text-xs text-slate-400 mt-1">
            Invoices will appear here once you complete your first job
          </p>
        </div>
      )}
    </div>
  )
}
