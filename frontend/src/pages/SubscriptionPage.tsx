import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  Calendar,
  ChevronLeft,
  CreditCard,
  Download,
  ExternalLink,
  LifeBuoy,
  Receipt,
  RefreshCw,
} from 'lucide-react'
import jsPDF from 'jspdf'
import EmptyState from '../components/EmptyState'
import { useSubscription } from '../hooks/useSubscription'
import { invoicesApi, type Invoice } from '../services/subscriptionApi'
import { useAuthStore } from '../stores/authStore'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatMoney(amount: number) {
  if (amount > 0 && amount < 1000) {
    return currencyFormatter.format(amount)
  }

  return currencyFormatter.format(amount / 100)
}

function formatDate(value?: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return dateFormatter.format(date)
}

function buildSubscriptionInvoiceFileName(invoice: Invoice) {
  return `${invoice.invoice_number.toLowerCase()}.pdf`
}

function buildCustomerAddress(user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>) {
  const company = user.user_metadata?.company
  const addressParts = [
    company?.address_line1,
    company?.address_line2,
    company?.address,
    company?.city,
    company?.state,
    company?.pincode,
  ].filter(Boolean)

  return addressParts.length > 0 ? addressParts.join(', ') : 'Not provided'
}

function downloadInvoiceFallback(invoice: Invoice, options: {
  customerName: string
  customerEmail: string
  customerPhone?: string | null
  customerGstin?: string
  planName: string
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let cursorY = 18

  const writeLine = (label: string, value: string, indent = 0) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(label, 14 + indent, cursorY)
    pdf.setFont('helvetica', 'normal')
    pdf.text(value, 62 + indent, cursorY)
    cursorY += 7
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('TruckOpti Subscription Invoice', 14, cursorY)
  cursorY += 10

  pdf.setFontSize(11)
  writeLine('Invoice Number', invoice.invoice_number)
  writeLine('Status', invoice.status.toUpperCase())
  writeLine('Paid On', formatDate(invoice.paid_at || invoice.billing_period_start))
  writeLine('Billing Period', `${formatDate(invoice.billing_period_start)} to ${formatDate(invoice.billing_period_end)}`)
  writeLine('Plan', options.planName)
  cursorY += 3

  pdf.setFont('helvetica', 'bold')
  pdf.text('Billed To', 14, cursorY)
  cursorY += 7
  pdf.setFont('helvetica', 'normal')
  pdf.text(options.customerName, 14, cursorY)
  cursorY += 6
  pdf.text(options.customerEmail, 14, cursorY)
  cursorY += 6
  if (options.customerPhone) {
    pdf.text(options.customerPhone, 14, cursorY)
    cursorY += 6
  }
  pdf.text(buildCustomerAddress(useAuthStore.getState().user!), 14, cursorY)
  cursorY += 6
  if (options.customerGstin) {
    pdf.text(`GSTIN: ${options.customerGstin}`, 14, cursorY)
    cursorY += 6
  }

  cursorY += 4
  pdf.setDrawColor(226, 232, 240)
  pdf.line(14, cursorY, 196, cursorY)
  cursorY += 10

  writeLine('Subtotal', formatMoney(invoice.amount))
  writeLine('Tax', formatMoney(invoice.tax_amount))
  writeLine('Total Paid', formatMoney(invoice.total_amount))
  writeLine('Currency', invoice.currency || 'INR')

  cursorY += 6
  pdf.setFontSize(10)
  pdf.setTextColor(100, 116, 139)
  pdf.text('This invoice was generated from your TruckOpti billing history because no hosted PDF was attached to the payment record yet.', 14, cursorY, { maxWidth: 180 })

  pdf.save(buildSubscriptionInvoiceFileName(invoice))
}

function buildStatusLabel(input: {
  isActive: boolean
  isTrial: boolean
  isExpired: boolean
  isCancelled: boolean
}) {
  if (input.isTrial) return 'Trial'
  if (input.isActive) return 'Active'
  if (input.isExpired) return 'Expired'
  if (input.isCancelled) return 'Cancelled'
  return 'Free'
}

function buildStatusClass(input: {
  isActive: boolean
  isTrial: boolean
  isExpired: boolean
  isCancelled: boolean
}) {
  if (input.isTrial) {
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
  }

  if (input.isActive) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
  }

  if (input.isExpired || input.isCancelled) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
  }

  return 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
}

function UsageMeter({ label, used, limit, percent }: { label: string; used: number; limit: number; percent: number }) {
  const capLabel = limit <= 0 ? 'Unlimited' : limit.toLocaleString('en-IN')

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/70">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {used.toLocaleString('en-IN')} / {capLabel}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all"
          style={{ width: `${Math.max(4, Math.min(percent || 0, 100))}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{percent}% used</p>
    </div>
  )
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const {
    subscription,
    plan,
    usage,
    isActive,
    isTrial,
    isExpired,
    isCancelled,
    isLoading,
    trialDaysRemaining,
    daysRemaining,
    usagePercent,
    refetch,
  } = useSubscription()

  const { data: invoices = [], isLoading: invoicesLoading } = useQuery({
    queryKey: ['subscription-invoices'],
    queryFn: () => invoicesApi.getAll(),
    staleTime: 1000 * 60 * 2,
    retry: 1,
  })

  useEffect(() => {
    document.title = 'Subscription - TruckOpti'
  }, [])

  const isAdmin = user?.role === 'admin'
  const status = {
    isActive,
    isTrial,
    isExpired,
    isCancelled,
  }
  const statusLabel = isAdmin ? 'Admin Access' : buildStatusLabel(status)
  const planName = isAdmin ? 'Platform Admin Access' : plan?.name || 'Free Plan'
  const invoiceHistory = invoices

  const handleInvoiceDownload = (invoice: Invoice) => {
    if (!user) return

    if (invoice.pdf_url) {
      window.open(invoice.pdf_url, '_blank', 'noopener,noreferrer')
      return
    }

    downloadInvoiceFallback(invoice, {
      customerName: user.name || user.email,
      customerEmail: user.email,
      customerPhone: user.phone,
      customerGstin: user.user_metadata?.company?.gstin,
      planName: plan?.name || plan?.tier || 'Subscription plan',
    })
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 p-4 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3 pt-4 md:pt-0">
          <button
            onClick={() => navigate(-1)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 shadow-sm"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscription</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Review your current plan, usage, renewal state, and billing history.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 shadow-sm">
            <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
              <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Current plan</p>
                    <h2 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">{planName}</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${isAdmin ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' : buildStatusClass(status)}`}>
                        {statusLabel}
                      </span>
                      {subscription?.billing_cycle && !isAdmin && (
                        <span className="inline-flex rounded-full bg-slate-100 dark:bg-slate-700 px-3 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {subscription.billing_cycle === 'yearly' ? 'Yearly billing' : 'Monthly billing'}
                        </span>
                      )}
                      {subscription?.cancel_at_period_end && (
                        <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-900/30 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
                          Ends at period close
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row md:flex-col md:items-end">
                    <button
                      onClick={() => navigate('/pricing')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                    >
                      <CreditCard className="h-4 w-4" />
                      {plan ? 'Change plan' : 'Choose a plan'}
                    </button>
                    <button
                      onClick={() => navigate('/support')}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <LifeBuoy className="h-4 w-4" />
                      Billing help
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Renewal</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{formatDate(subscription?.current_period_end)}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                      {isTrial && trialDaysRemaining !== null
                        ? `${trialDaysRemaining} trial day(s) left`
                        : `${daysRemaining} day(s) left in period`}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Plan tier</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{plan?.tier || (isAdmin ? 'admin' : 'free')}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{plan ? 'From the active subscription plan' : 'No active paid subscription detected'}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Support level</p>
                    <p className="mt-2 text-lg font-semibold capitalize text-slate-900 dark:text-white">{plan?.support_level || (isAdmin ? 'Internal admin' : 'Community')}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Use support for billing questions or plan changes</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Invoice history</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{invoices.length}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tracked invoices visible on this account</p>
                  </div>
                </div>

                <div className="mt-6 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/70 dark:bg-slate-800/40 p-4 text-sm text-slate-600 dark:text-slate-300">
                  {isAdmin
                    ? 'Admin accounts bypass customer subscription limits. Use the admin subscriptions hub for cross-user subscription oversight.'
                    : 'Secure checkout still owns billing mutations. Use this page to review your current plan and route plan changes through pricing or support.'}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Plan limits</h2>
                </div>
                {plan ? (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Users</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{plan.users_limit}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Trucks</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{plan.trucks_limit}</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Storage</p>
                      <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{plan.storage_gb} GB</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-4">
                      <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Features</p>
                      <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 line-clamp-4">
                        {plan.features.join(' • ') || 'Plan features are configured through the active plan.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={CreditCard}
                    title="No active paid plan"
                    description="Choose a plan when you need higher shipment, route, or storage limits."
                    actionLabel="View plans"
                    onAction={() => navigate('/pricing')}
                    className="mt-4"
                    variant="compact"
                  />
                )}
              </section>
            </div>

            {!isAdmin && plan && usage && (
              <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Current usage</h2>
                </div>
                <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
                  <UsageMeter label="Shipments" used={usage.shipments_used} limit={plan.shipments_monthly} percent={usagePercent.shipments} />
                  <UsageMeter label="API calls" used={usage.api_calls_used} limit={plan.api_calls_monthly} percent={usagePercent.api_calls} />
                  <UsageMeter label="SMS" used={usage.sms_sent} limit={plan.sms_included} percent={usagePercent.sms} />
                  <UsageMeter label="Maps" used={usage.maps_requests} limit={plan.maps_requests_monthly} percent={usagePercent.maps} />
                </div>
              </section>
            )}

            <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-primary-600" />
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Invoice history</h2>
                </div>
                <button
                  onClick={() => refetch()}
                  className="rounded-xl border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Refresh status
                </button>
              </div>

              {invoicesLoading ? (
                <div className="mt-6 flex items-center justify-center py-10">
                  <RefreshCw className="h-6 w-6 animate-spin text-primary-600" />
                </div>
              ) : invoiceHistory.length === 0 ? (
                <EmptyState
                  icon={Receipt}
                  title="No invoices yet"
                  description="Invoices will appear here after a paid billing cycle is created for this account."
                  className="mt-4"
                  variant="compact"
                />
              ) : (
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[640px] divide-y divide-slate-200 dark:divide-slate-700">
                    <thead>
                      <tr className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        <th className="pb-3 pr-4 font-semibold">Invoice</th>
                        <th className="pb-3 pr-4 font-semibold">Status</th>
                        <th className="pb-3 pr-4 font-semibold">Period</th>
                        <th className="pb-3 pr-4 font-semibold">Amount</th>
                        <th className="pb-3 font-semibold">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {invoiceHistory.map((invoice: Invoice) => (
                        <tr key={invoice.id}>
                          <td className="py-3 pr-4">
                            <p className="font-medium text-slate-900 dark:text-white">{invoice.invoice_number}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{invoice.currency || 'INR'}</p>
                          </td>
                          <td className="py-3 pr-4">
                            <span className="inline-flex rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-xs font-medium capitalize text-slate-700 dark:text-slate-200">
                              {invoice.status}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-slate-600 dark:text-slate-300">
                            {formatDate(invoice.billing_period_start)} → {formatDate(invoice.billing_period_end)}
                          </td>
                          <td className="py-3 pr-4 text-sm font-medium text-slate-900 dark:text-white">
                            {formatMoney(invoice.total_amount)}
                          </td>
                          <td className="py-3 text-sm">
                            <button
                              onClick={() => handleInvoiceDownload(invoice)}
                              className="inline-flex items-center gap-1 font-medium text-primary-600 hover:text-primary-700"
                            >
                              {invoice.pdf_url ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                              {invoice.pdf_url ? 'Open' : 'Download'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}