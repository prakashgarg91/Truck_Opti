import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart3,
  ChevronLeft,
  CreditCard,
  Download,
  LifeBuoy,
  Receipt,
  RefreshCw,
} from 'lucide-react'
import jsPDF from 'jspdf'
import EmptyState from '../components/EmptyState'
import BillingBanner from '../components/billing/BillingBanner'
import UsageBars from '../components/billing/UsageBars'
import AgencyTrialPanel from '../components/billing/AgencyTrialPanel'
import { BTN_PRIMARY, BTN_SECONDARY, FOCUS_RING } from '../components/billing/styles'
import { useEntitlement } from '../components/billing/useEntitlement'
import { gstInvoicesApi, type SubscriptionInvoice } from '../services/subscriptionApi'
import { formatInr } from '../lib/invoiceMoney'
import { buildInvoiceCopyRows } from '../lib/subscriptionInvoiceCopy'
import { useAuthStore } from '../stores/authStore'
import { logger } from '../utils/logger'

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

function formatDate(value?: string | null) {
  if (!value) return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return dateFormatter.format(date)
}

function formatTier(tier: string | null) {
  if (!tier) return 'No plan'
  return tier.charAt(0).toUpperCase() + tier.slice(1)
}

function downloadInvoice(invoice: SubscriptionInvoice, options: { customerName: string; planName: string }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let cursorY = 18

  const writeLine = (label: string, value: string) => {
    pdf.setFont('helvetica', 'bold')
    pdf.text(label, 14, cursorY)
    pdf.setFont('helvetica', 'normal')
    // The built-in PDF font has no rupee glyph, so print "Rs." there; long values wrap.
    const lines = pdf.splitTextToSize(value.replace(/₹/g, 'Rs. '), 126) as string[]
    pdf.text(lines, 70, cursorY)
    cursorY += 7 * lines.length
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text('TruckOpti Subscription Tax Invoice', 14, cursorY)
  cursorY += 10

  pdf.setFontSize(11)
  const rows = buildInvoiceCopyRows(invoice, { ...options, formatDate })
  let inAmounts = false
  for (const row of rows) {
    if (row.section === 'amounts' && !inAmounts) {
      inAmounts = true
      cursorY += 3
      pdf.setDrawColor(226, 232, 240)
      pdf.line(14, cursorY, 196, cursorY)
      cursorY += 10
    }
    writeLine(row.label, row.value)
  }

  cursorY += 6
  pdf.setFontSize(10)
  pdf.setTextColor(100, 116, 139)
  pdf.text('This copy was generated from your TruckOpti billing records. A signed PDF is not stored for this invoice.', 14, cursorY, { maxWidth: 180 })

  pdf.save(`${invoice.invoice_number.replace(/[^A-Za-z0-9-]/g, '-').toLowerCase()}.pdf`)
}

const CARD = 'rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/95'

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { entitlement, view, isLoading, isError, refetch } = useEntitlement()

  const {
    data: invoices = [],
    isLoading: invoicesLoading,
    isError: invoicesError,
    refetch: refetchInvoices,
  } = useQuery({
    queryKey: ['subscription-invoices'],
    queryFn: () => gstInvoicesApi.list(),
    staleTime: 1000 * 60 * 2,
    retry: 1,
  })

  useEffect(() => {
    document.title = 'Subscription - TruckOpti'
  }, [])

  const isAdmin = user?.role === 'admin'
  const goPricing = () => navigate('/pricing')

  // Payment activation writes GST invoices (agency keyed). The copy is built here from the stored
  // integer-paise figures; no hosted PDF is generated server-side yet.
  const handleInvoiceDownload = (invoice: SubscriptionInvoice) => {
    if (!user) return
    try {
      downloadInvoice(invoice, {
        customerName: user.name || user.email,
        planName: formatTier(entitlement?.planTier ?? null),
      })
    } catch (error) {
      logger.error('[SubscriptionPage] failed to build invoice copy', error)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 md:p-8 dark:from-slate-900 dark:to-slate-800">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center gap-3 pt-4 md:pt-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 ${FOCUS_RING}`}
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Subscription</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Your agency plan, usage and billing history.
            </p>
          </div>
        </div>

        {isAdmin ? (
          <section className={CARD}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Platform admin access</h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Admin accounts are not tied to an agency plan. Use the admin subscriptions hub for oversight.
            </p>
          </section>
        ) : isLoading ? (
          <div role="status" aria-label="Loading subscription" className="flex min-h-[280px] items-center justify-center rounded-3xl border border-slate-200 bg-white/90 shadow-sm dark:border-slate-700 dark:bg-slate-900/90">
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" aria-hidden="true" />
          </div>
        ) : isError || !entitlement || !view ? (
          <div role="alert" className="rounded-3xl border border-red-300 bg-red-50 p-6 text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-100">
            <p className="font-semibold">We could not load your subscription.</p>
            <p className="mt-1 text-sm">Check your connection and try again. Your data is not affected.</p>
            <button type="button" onClick={() => void refetch()} className={`${BTN_SECONDARY} mt-4`}>Try again</button>
          </div>
        ) : (
          <>
            <BillingBanner view={view} onAction={goPricing} />

            <section className={CARD} aria-labelledby="current-plan-heading">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Current plan</p>
                  <h2 id="current-plan-heading" className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">
                    {formatTier(entitlement.planTier)}
                  </h2>
                  <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                    {view.statusLabel}
                  </span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row md:flex-col md:items-end">
                  <button type="button" onClick={goPricing} className={BTN_PRIMARY}>
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    {view.needsPlan ? 'Choose a plan' : view.banner === 'expired' ? 'Renew' : 'Change plan'}
                  </button>
                  <button type="button" onClick={() => navigate('/support')} className={BTN_SECONDARY}>
                    <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                    Billing help
                  </button>
                </div>
              </div>

              <dl className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    {entitlement.status === 'trial' ? 'Trial ends' : 'Current period ends'}
                  </dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {formatDate(entitlement.status === 'trial' ? (entitlement.trialEnd ?? entitlement.periodEnd) : entitlement.periodEnd)}
                  </dd>
                </div>
                {entitlement.graceEnd && (
                  <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Grace period ends</dt>
                    <dd className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{formatDate(entitlement.graceEnd)}</dd>
                  </div>
                )}
                <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/70">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Invoices</dt>
                  <dd className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">{invoices.length}</dd>
                </div>
              </dl>

              <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
                Prices exclude GST (GST extra at 18%). Read our <Link to="/terms" className={`font-semibold text-indigo-700 underline dark:text-indigo-300 ${FOCUS_RING}`}>refund policy</Link>.
              </p>
            </section>

            {view.needsPlan && (
              <section className={CARD} aria-labelledby="no-plan-heading">
                <EmptyState
                  icon={CreditCard}
                  title="No plan yet"
                  description="Start your free trial, or choose a paid plan."
                  actionLabel="View plans"
                  onAction={goPricing}
                  variant="compact"
                />
                <h2 id="no-plan-heading" className="sr-only">Start a plan</h2>
                <div className="mt-2">
                  <AgencyTrialPanel onStarted={refetch} />
                </div>
              </section>
            )}

            {!view.needsPlan && (
              <section className={CARD} aria-labelledby="usage-heading">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                  <h2 id="usage-heading" className="text-lg font-semibold text-slate-900 dark:text-white">Usage against your plan</h2>
                </div>
                <div className="mt-5">
                  <UsageBars entitlement={entitlement} />
                </div>
              </section>
            )}
          </>
        )}

        <section className={CARD} aria-labelledby="invoice-heading">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <h2 id="invoice-heading" className="text-lg font-semibold text-slate-900 dark:text-white">Invoice history</h2>
            </div>
            <button type="button" onClick={() => void refetch()} className={BTN_SECONDARY}>
              Refresh status
            </button>
          </div>

          {invoicesLoading ? (
            <div role="status" aria-label="Loading invoices" className="mt-6 flex items-center justify-center py-10">
              <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" aria-hidden="true" />
            </div>
          ) : invoicesError ? (
            <div role="alert" className="mt-5 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-700 dark:bg-red-900/20 dark:text-red-100">
              We could not load your invoices.
              <button type="button" onClick={() => void refetchInvoices()} className={`${BTN_SECONDARY} ml-3`}>Try again</button>
            </div>
          ) : invoices.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No invoices yet"
              description="Invoices appear here after your first payment."
              className="mt-4"
              variant="compact"
            />
          ) : (
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[640px] divide-y divide-slate-200 dark:divide-slate-700">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-slate-600 dark:text-slate-300">
                    <th scope="col" className="pb-3 pr-4 font-semibold">Invoice</th>
                    <th scope="col" className="pb-3 pr-4 font-semibold">Issued</th>
                    <th scope="col" className="pb-3 pr-4 font-semibold">Amount (incl. GST)</th>
                    <th scope="col" className="pb-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {invoices.map((invoice: SubscriptionInvoice) => (
                    <tr key={invoice.id}>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900 dark:text-white">{invoice.invoice_number}</p>
                      </td>
                      <td className="py-3 pr-4 text-sm text-slate-700 dark:text-slate-200">
                        {formatDate(invoice.issued_at)}
                      </td>
                      <td className="py-3 pr-4 text-sm font-medium text-slate-900 dark:text-white">
                        {formatInr(invoice.total_paise)}
                        {invoice.credit_notes.length > 0 && (
                          <span className="ml-2 text-xs font-normal text-slate-600 dark:text-slate-300">
                            {invoice.credit_notes.length} credit {invoice.credit_notes.length === 1 ? 'note' : 'notes'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-sm">
                        <button
                          type="button"
                          onClick={() => void handleInvoiceDownload(invoice)}
                          className={`inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 font-medium text-indigo-700 hover:text-indigo-900 dark:text-indigo-300 ${FOCUS_RING}`}
                        >
                          <Download className="h-4 w-4" aria-hidden="true" />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
