import { FileText, TrendingUp, Download, Clock } from 'lucide-react'
import { formatCurrency } from '../utils/formatters'

export default function AgencyBillingPage() {
  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Billing & Invoices</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Revenue overview and invoice management</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'This Month', value: formatCurrency(0), icon: TrendingUp, color: 'text-green-500' },
          { label: 'Pending', value: formatCurrency(0), icon: Clock, color: 'text-amber-500' },
          { label: 'Total Paid', value: formatCurrency(0), icon: FileText, color: 'text-blue-500' },
          { label: 'GST Due', value: formatCurrency(0), icon: FileText, color: 'text-red-500' },
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
          {['GSTR-1 (March 2026)', 'GSTR-1 (February 2026)', 'GSTR-1 (January 2026)'].map(report => (
            <div key={report} className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-slate-400" />
                <span className="text-sm text-slate-700 dark:text-slate-300">{report}</span>
              </div>
              <button
                className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-medium"
                onClick={() => {}}
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

      {/* Invoices Placeholder */}
      <div className="text-center py-8">
        <FileText size={40} className="text-slate-300 mx-auto mb-3" />
        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">No invoices yet</p>
        <p className="text-xs text-slate-400 mt-1">
          Invoices will appear here once you complete your first job
        </p>
      </div>
    </div>
  )
}
