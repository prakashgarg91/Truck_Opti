import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Copy, Download, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyInvoicesApi,
  type InvoiceableGr,
  type InvoiceClient,
  type InvoiceDetail,
  type InvoiceRow,
  type InvoiceStatus,
  type IssueResult,
  type PaymentMethod,
} from '../services/agencyInvoicesApi'
import { subscriptionInfoFromError } from '../lib/subscriptionGuard'
import type { SubscriptionErrorInfo } from '../lib/billingState'
import { SubscriptionLimitPrompt, useBillingGate } from '../components/billing/BillingGate'
import { allocatePayment, buildUpiLink, computeInvoice, type GstRatePct } from '../lib/freightInvoice'
import { STATE_CODE_PATTERN, formatInr, parseQuantity, rupeesToPaise } from '../lib/invoiceMoney'
import { csvCell, paiseToPlain } from '../lib/payrollCsv'

// TO-148 Freight Invoices (RECORD-ONLY). The platform never holds freight
// money: the agency collects into its own account and records receipts here.
// The live preview is a convenience; the server recomputes every total and the
// figures shown for an issued invoice always come from the server.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const GST_RATES: GstRatePct[] = [0, 5, 12, 18]
const MAX_LINES = 100

const STATUS_STYLE: Record<InvoiceStatus, { label: string; tone: string }> = {
  issued: { label: 'Issued', tone: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  partly_paid: { label: 'Partly paid', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  paid: { label: 'Paid', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  cancelled: { label: 'Cancelled', tone: 'bg-slate-100 text-slate-700 border-slate-300' },
}

const METHOD_LABELS: Record<PaymentMethod, string> = { upi: 'UPI', bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' }

function StatusChip({ status }: { status: InvoiceStatus }) {
  const { label, tone } = STATUS_STYLE[status]
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
}

const outstandingOf = (inv: InvoiceRow) => (inv.status === 'cancelled' ? 0 : inv.total_paise - inv.paid_paise)

const CSV_HEADER = ['Invoice', 'Client', 'Status', 'Issued on', 'Total (INR)', 'Received (INR)', 'Outstanding (INR)']

/** CSV of the invoice list as shown. Every cell goes through csvCell (formula-injection guard). */
function invoicesCsv(rows: InvoiceRow[], clientName: ReadonlyMap<string, string>): string {
  const body = rows.map((inv) =>
    [
      inv.invoice_number,
      clientName.get(inv.client_id) ?? 'Client',
      STATUS_STYLE[inv.status].label,
      inv.created_at.slice(0, 10),
      paiseToPlain(inv.total_paise),
      paiseToPlain(inv.paid_paise),
      paiseToPlain(outstandingOf(inv)),
    ].map(csvCell).join(',')
  )
  return [CSV_HEADER.map(csvCell).join(','), ...body].join('\r\n') + '\r\n'
}

function todayLocal(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** One idempotency key per intent: a changed payload starts a new intent. */
function intentKey(ref: { current: { sig: string; key: string } | null }, sig: string): string {
  if (!ref.current || ref.current.sig !== sig) ref.current = { sig, key: crypto.randomUUID() }
  return ref.current.key
}

interface FormLine {
  id: number
  description: string
  quantity: string
  rate: string
}

const INPUT = `mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`
const SECONDARY_BTN = `min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`
const PRIMARY_BTN = `min-h-[44px] w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-sm text-slate-700">{label}</dt>
      <dd className={`text-sm ${strong ? 'font-bold text-slate-900' : 'text-slate-900'}`}>{value}</dd>
    </div>
  )
}

export default function AgencyInvoicesPage() {
  useEffect(() => {
    document.title = 'Freight invoices - TruckOpti'
  }, [])

  const [clients, setClients] = useState<InvoiceClient[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [grs, setGrs] = useState<InvoiceableGr[]>([])
  const [grNote, setGrNote] = useState<string | null>(null)
  // The consignment the form in progress bills (set by the GR shortcut). Sent only while the form's client is the GR's client.
  const [linkedGrId, setLinkedGrId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)
  const gate = useBillingGate()
  const [limitInfo, setLimitInfo] = useState<SubscriptionErrorInfo | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<InvoiceDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // New invoice form
  const [showForm, setShowForm] = useState(false)
  const lineSeq = useRef(1)
  const [clientId, setClientId] = useState('')
  const [lines, setLines] = useState<FormLine[]>([{ id: 0, description: '', quantity: '1', rate: '' }])
  const [gstRate, setGstRate] = useState<GstRatePct>(18)
  const [supplierState, setSupplierState] = useState('')
  const [placeState, setPlaceState] = useState('')
  const [reverseCharge, setReverseCharge] = useState(false)
  const [roundOff, setRoundOff] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [issueRefusal, setIssueRefusal] = useState<Extract<IssueResult, { ok: false }> | null>(null)
  const [issued, setIssued] = useState<{ id: string; number: string; replay: boolean } | null>(null)
  const issueIntent = useRef<{ sig: string; key: string } | null>(null)

  // Record payment form
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<PaymentMethod>('upi')
  const [payReference, setPayReference] = useState('')
  const [payDate, setPayDate] = useState(todayLocal())
  const [paying, setPaying] = useState(false)
  const [payRefusal, setPayRefusal] = useState<string | null>(null)
  const [paidNote, setPaidNote] = useState<string | null>(null)
  const payIntent = useRef<{ sig: string; key: string } | null>(null)

  // Cancel
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)
  const [cancelRefusal, setCancelRefusal] = useState<string | null>(null)

  // UPI pay link: typed on this screen only, never stored or sent anywhere.
  const [vpa, setVpa] = useState('')
  const [payeeName, setPayeeName] = useState('')

  const fetchInvoices = useCallback(async () => {
    try {
      setError(null)
      const [c, i, g] = await Promise.all([
        agencyInvoicesApi.listClients(),
        agencyInvoicesApi.listInvoices(),
        agencyInvoicesApi.listInvoiceableGrs(),
      ])
      setClients(c)
      setInvoices(i)
      setGrs(g)
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyInvoicesPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load invoices')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      setDetail(await agencyInvoicesApi.getInvoiceDetail(id))
    } catch (e) {
      logger.error('[AgencyInvoicesPage] detail load failed:', e)
      setDetailError(toUserFacingErrorMessage(e, 'Failed to load invoice details'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchInvoices()
  }, [fetchInvoices])

  useEffect(() => {
    if (selectedId) fetchDetail(selectedId)
  }, [selectedId, fetchDetail])

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.client_name])), [clients])
  const selected = useMemo(() => invoices.find((i) => i.id === selectedId) ?? null, [invoices, selectedId])

  // The one live (not cancelled) invoice that bills each consignment; a cancelled invoice frees its GR.
  const invoiceByGr = useMemo(() => {
    const map = new Map<string, InvoiceRow>()
    for (const inv of invoices) {
      if (inv.consignment_id && inv.status !== 'cancelled' && !map.has(inv.consignment_id)) map.set(inv.consignment_id, inv)
    }
    return map
  }, [invoices])

  const linkedGr = linkedGrId ? (grs.find((g) => g.consignmentId === linkedGrId) ?? null) : null
  const consignmentId = linkedGr && linkedGr.clientId === clientId ? linkedGr.consignmentId : null

  // Outstanding per client from the loaded invoices: issued and partly paid only.
  const outstandingRows = useMemo(() => {
    const byClient = new Map<string, number>()
    for (const inv of invoices) {
      if (inv.status !== 'issued' && inv.status !== 'partly_paid') continue
      byClient.set(inv.client_id, (byClient.get(inv.client_id) ?? 0) + (inv.total_paise - inv.paid_paise))
    }
    return [...byClient.entries()]
      .map(([id, paise]) => ({ id, name: clientName.get(id) ?? 'Client', paise }))
      .sort((a, b) => b.paise - a.paise)
  }, [invoices, clientName])
  const outstandingTotal = outstandingRows.reduce((sum, r) => sum + r.paise, 0)

  // ---- Form parsing and live preview -------------------------------------
  const parsedLines = useMemo(
    () =>
      lines.map((l) => ({
        description: l.description.trim(),
        quantity: parseQuantity(l.quantity),
        ratePaise: rupeesToPaise(l.rate),
      })),
    [lines]
  )
  const linesValid = parsedLines.every((l) => l.description !== '' && l.quantity !== null && l.ratePaise !== null)

  const preview = useMemo(() => {
    if (!linesValid) return null
    try {
      return computeInvoice({
        lines: parsedLines.map((l) => ({ description: l.description, quantity: l.quantity as number, ratePaise: l.ratePaise as number })),
        supplierStateCode: supplierState,
        placeOfSupplyStateCode: placeState,
        gstRatePct: gstRate,
        reverseCharge,
        roundOff,
      })
    } catch {
      return null
    }
  }, [linesValid, parsedLines, supplierState, placeState, gstRate, reverseCharge, roundOff])

  const issueBlocker: string | null = issuing
    ? 'submitting'
    : !clientId
      ? 'Choose the client to bill.'
      : !linesValid
        ? 'Every line needs a description, a quantity above zero (up to 3 decimals) and a rate in rupees (up to 2 decimals).'
        : !STATE_CODE_PATTERN.test(supplierState) || !STATE_CODE_PATTERN.test(placeState)
          ? 'Enter two-digit state codes (01 to 38) for the supplier and the place of supply.'
          : preview && preview.subtotalPaise <= 0
            ? 'The invoice total must be more than zero.'
            : preview === null
              ? 'These amounts are too large to invoice. Check the quantities and rates.'
              : null

  const updateLine = (id: number, patch: Partial<FormLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)))
  const addLine = () => setLines((prev) => [...prev, { id: lineSeq.current++, description: '', quantity: '1', rate: '' }])
  const removeLine = (id: number) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev))

  /**
   * Shortcut from a delivered or receipt-confirmed GR: opens the form with its client and
   * one "Freight for GR" line. The amount stays empty for the user. Typed lines for another
   * client are never overwritten; the shortcut refuses and says why.
   */
  const prefillFromGr = (gr: InvoiceableGr) => {
    const billedBy = invoiceByGr.get(gr.consignmentId)
    if (billedBy) {
      setGrNote(`GR ${gr.grNumber} already has invoice ${billedBy.invoice_number}. Open that invoice instead of issuing another.`)
      return
    }
    const description = `Freight for GR ${gr.grNumber}`
    const typed = lines.some((l) => l.description.trim() !== '' || l.rate.trim() !== '')
    if (typed && clientId !== '' && clientId !== gr.clientId) {
      setGrNote(`The invoice in progress is for another client. Issue it or clear its lines first, then choose GR ${gr.grNumber} again.`)
      return
    }
    if (!clients.some((c) => c.id === gr.clientId)) {
      setGrNote(`GR ${gr.grNumber} belongs to a client with no agreement on the Clients page.`)
      return
    }
    if (consignmentId && consignmentId !== gr.consignmentId) {
      setGrNote(`One invoice bills one GR. Issue the invoice in progress or clear its lines first, then choose GR ${gr.grNumber} again.`)
      return
    }
    setGrNote(null)
    setIssueRefusal(null)
    setClientId(gr.clientId)
    setLinkedGrId(gr.consignmentId)
    setLines((prev) => {
      if (prev.some((l) => l.description.trim() === description)) return prev
      if (!typed) return [{ id: lineSeq.current++, description, quantity: '1', rate: '' }]
      return prev.length < MAX_LINES ? [...prev, { id: lineSeq.current++, description, quantity: '1', rate: '' }] : prev
    })
    setShowForm(true)
  }

  const handleExportCsv = () => {
    // A UTF-8 byte order mark lets spreadsheets read non-ASCII client names correctly.
    const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), invoicesCsv(invoices, clientName)], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `freight-invoices-${todayLocal()}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  const resetForm = () => {
    setClientId('')
    setLinkedGrId(null)
    setLines([{ id: lineSeq.current++, description: '', quantity: '1', rate: '' }])
    setGstRate(18)
    setReverseCharge(false)
    setRoundOff(false)
    setIssueRefusal(null)
    issueIntent.current = null
  }

  const handleIssue = async (event: FormEvent) => {
    event.preventDefault()
    if (issueBlocker !== null) return
    const payload = {
      clientId,
      lines: parsedLines.map((l) => ({ description: l.description, quantity: l.quantity as number, ratePaise: l.ratePaise as number })),
      supplierState,
      placeOfSupplyState: placeState,
      gstRatePct: gstRate,
      reverseCharge,
      roundOff,
      consignmentId,
    }
    const key = intentKey(issueIntent, JSON.stringify(payload))
    setIssuing(true)
    setIssueRefusal(null)
    setIssued(null)
    setLimitInfo(null)
    try {
      const result = await agencyInvoicesApi.issueInvoice({ ...payload, idempotencyKey: key })
      if (result.ok) {
        toast.success(result.replay ? 'Invoice already issued' : 'Invoice issued')
        issueIntent.current = null
        setIssued({ id: result.invoiceId, number: result.invoiceNumber, replay: result.replay })
        resetForm()
        setShowForm(false)
        setSelectedId(result.invoiceId)
        // Single refetch; the new invoice's detail loads from the selection.
        await fetchInvoices()
      } else {
        if (result.error === 'idempotency_key_reused') issueIntent.current = null
        setIssueRefusal(result)
        if (result.error === 'consignment_already_invoiced') {
          // Calm path: the inline notice below is the message, no error toast. Refresh so the GR list shows the invoice that already bills it.
          issueIntent.current = null
          await fetchInvoices()
        } else {
          toast.error(result.message)
        }
      }
    } catch (e) {
      logger.error('[AgencyInvoicesPage] issue failed:', e)
      const limit = subscriptionInfoFromError(e)
      if (limit) {
        setLimitInfo(limit)
        return
      }
      toast.error(toUserFacingErrorMessage(e, 'Failed to issue invoice'))
    } finally {
      setIssuing(false)
    }
  }

  const selectInvoice = (id: string) => {
    setSelectedId(id)
    setDetail(null)
    setPayAmount('')
    setPayReference('')
    setPayMethod('upi')
    setPayDate(todayLocal())
    setPayRefusal(null)
    setPaidNote(null)
    setConfirmCancel(false)
    setCancelReason('')
    setCancelRefusal(null)
    payIntent.current = null
  }

  // ---- Payments -----------------------------------------------------------
  const payPaise = rupeesToPaise(payAmount)
  const selectedOutstanding = selected ? outstandingOf(selected) : 0
  const payBlocker: string | null = paying
    ? 'submitting'
    : payPaise === null || payPaise <= 0
      ? 'Enter the amount received in rupees, for example 12500 or 12500.50.'
      : payPaise > selectedOutstanding && allocatePayment(selectedOutstanding, payPaise).overpaymentPaise > 0
        ? `This is more than the outstanding ${formatInr(selectedOutstanding)}.`
        : !payDate
          ? 'Enter the date the money was received.'
          : payDate > todayLocal()
            ? 'The received date cannot be in the future.'
            : payReference.trim().length > 100
              ? 'The reference can be at most 100 characters.'
              : null

  const handleRecordPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (payBlocker !== null || !selected || payPaise === null) return
    const payload = {
      invoiceId: selected.id,
      amountPaise: payPaise,
      method: payMethod,
      reference: payReference.trim(),
      receivedOn: payDate,
      expectedVersion: selected.version,
    }
    const key = intentKey(payIntent, JSON.stringify(payload))
    setPaying(true)
    setPayRefusal(null)
    setPaidNote(null)
    try {
      const result = await agencyInvoicesApi.recordPayment({ ...payload, idempotencyKey: key })
      if (result.ok) {
        toast.success(result.replay ? 'Payment already recorded' : 'Payment recorded')
        payIntent.current = null
        setPayAmount('')
        setPayReference('')
        setPaidNote(result.replay ? 'This payment was already recorded. Nothing new was added.' : `Payment recorded. Total received is now ${formatInr(result.paidPaise)}.`)
      } else {
        if (result.error === 'idempotency_key_reused') payIntent.current = null
        const extra = result.error === 'overpayment' && result.outstandingPaise !== undefined ? ` Outstanding is ${formatInr(result.outstandingPaise)}.` : ''
        setPayRefusal(`${result.message}${extra}`)
        toast.error(result.message)
      }
      // Single refetch in every completed outcome; never an automatic retry.
      await Promise.all([fetchInvoices(), fetchDetail(selected.id)])
    } catch (e) {
      logger.error('[AgencyInvoicesPage] payment failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to record payment'))
    } finally {
      setPaying(false)
    }
  }

  const handleCancel = async () => {
    if (!selected) return
    const reason = cancelReason.trim()
    if (!reason) {
      setCancelRefusal('Enter a reason for cancelling (up to 300 characters).')
      return
    }
    setCancelling(true)
    setCancelRefusal(null)
    try {
      const result = await agencyInvoicesApi.cancelInvoice(selected.id, selected.version, reason)
      if (result.ok) {
        toast.success('Invoice cancelled')
        setConfirmCancel(false)
        setCancelReason('')
      } else {
        setCancelRefusal(result.message)
        toast.error(result.message)
      }
      await Promise.all([fetchInvoices(), fetchDetail(selected.id)])
    } catch (e) {
      logger.error('[AgencyInvoicesPage] cancel failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to cancel invoice'))
    } finally {
      setCancelling(false)
    }
  }

  // ---- UPI pay link (optional, never persisted) ---------------------------
  const upi = useMemo(() => {
    if (!selected || selectedOutstanding <= 0 || vpa.trim() === '') return { link: null as string | null, problem: null as string | null }
    try {
      return {
        link: buildUpiLink({ payeeVpa: vpa.trim(), payeeName: payeeName.trim(), amountPaise: selectedOutstanding, invoiceNumber: selected.invoice_number }),
        problem: null,
      }
    } catch {
      return {
        link: null,
        problem: payeeName.trim() === '' ? 'Enter the payee name to build the link.' : 'Enter a UPI ID like name@bank.',
      }
    }
  }, [selected, selectedOutstanding, vpa, payeeName])

  const handleCopy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Pay link copied')
    } catch (e) {
      logger.error('[AgencyInvoicesPage] copy failed:', e)
      toast.error('Could not copy the link. Select it and copy it manually.')
    }
  }

  // ---- Render --------------------------------------------------------------
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="invoices-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading invoices…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="invoices-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to invoices</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for finance access.</p>
        </div>
      </div>
    )
  }

  const canPay = selected !== null && (selected.status === 'issued' || selected.status === 'partly_paid')
  const canCancel = selected !== null && selected.status === 'issued'

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Freight invoices</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Issue invoices and record the money you collect. TruckOpti does not hold or move freight money: clients pay your own account.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          aria-expanded={showForm}
          aria-controls="new-invoice-form"
          disabled={!showForm && !gate.canSettle}
          title={showForm ? undefined : gate.settleTitle}
          className={`flex items-center gap-1 ${PRIMARY_BTN}`}
        >
          <Plus size={16} aria-hidden="true" /> {showForm ? 'Close form' : 'New invoice'}
        </button>
      </div>

      {limitInfo && <SubscriptionLimitPrompt info={limitInfo} onDismiss={() => setLimitInfo(null)} />}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
            onClick={() => {
              setLoading(true)
              fetchInvoices()
            }}
            className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
          >
            Retry
          </button>
        </div>
      )}

      {issued && (
        <div role="status" data-testid="invoice-issued" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <span>
            {issued.replay ? 'Invoice ' : 'Issued invoice '}
            <strong>{issued.number}</strong>
            {(() => {
              const row = invoices.find((i) => i.id === issued.id)
              return row ? `. Server total ${formatInr(row.total_paise)}.` : '.'
            })()}
          </span>
        </div>
      )}

      {showForm && (
        <form
          id="new-invoice-form"
          onSubmit={handleIssue}
          noValidate
          aria-labelledby="new-invoice-title"
          className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4"
          data-testid="invoice-form"
        >
          <h2 id="new-invoice-title" className="text-base font-bold text-slate-900">New invoice</h2>

          {clients.length === 0 ? (
            <p data-testid="invoice-no-clients" className="text-sm text-slate-700">
              No client agreements yet. Add a client on the Clients page before issuing an invoice.
            </p>
          ) : (
            <div>
              <label htmlFor="inv-client" className="block text-sm font-medium text-slate-800">Client</label>
              <select id="inv-client" name="inv-client" value={clientId} onChange={(e) => setClientId(e.target.value)} disabled={issuing} className={INPUT}>
                <option value="">Choose a client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.client_name}
                    {c.status === 'active' ? '' : ` (${c.status})`}
                  </option>
                ))}
              </select>
            </div>
          )}

          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold text-slate-900">Line items</legend>
            {lines.map((l, idx) => (
              <div key={l.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_7rem_9rem_auto] sm:items-end" data-testid={`invoice-line-${idx}`}>
                <div>
                  <label htmlFor={`line-desc-${l.id}`} className="block text-sm font-medium text-slate-800">Description</label>
                  <input id={`line-desc-${l.id}`} value={l.description} maxLength={500} onChange={(e) => updateLine(l.id, { description: e.target.value })} disabled={issuing} className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`line-qty-${l.id}`} className="block text-sm font-medium text-slate-800">Quantity</label>
                  <input id={`line-qty-${l.id}`} inputMode="decimal" value={l.quantity} onChange={(e) => updateLine(l.id, { quantity: e.target.value })} disabled={issuing} className={INPUT} />
                </div>
                <div>
                  <label htmlFor={`line-rate-${l.id}`} className="block text-sm font-medium text-slate-800">Rate (₹)</label>
                  <input id={`line-rate-${l.id}`} inputMode="decimal" value={l.rate} onChange={(e) => updateLine(l.id, { rate: e.target.value })} disabled={issuing} className={INPUT} />
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(l.id)}
                  disabled={issuing || lines.length === 1}
                  aria-label={`Remove line ${idx + 1}`}
                  className={`flex items-center justify-center gap-1 ${SECONDARY_BTN} text-red-800`}
                >
                  <Trash2 size={16} aria-hidden="true" /> Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={addLine} disabled={issuing || lines.length >= MAX_LINES} className={`flex items-center gap-1 ${SECONDARY_BTN}`}>
              <Plus size={16} aria-hidden="true" /> Add line
            </button>
          </fieldset>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="inv-gst" className="block text-sm font-medium text-slate-800">GST rate</label>
              <select id="inv-gst" value={gstRate} onChange={(e) => setGstRate(Number(e.target.value) as GstRatePct)} disabled={issuing} className={INPUT}>
                {GST_RATES.map((r) => (
                  <option key={r} value={r}>{r}%</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="inv-supplier" className="block text-sm font-medium text-slate-800">Supplier state code</label>
              <input id="inv-supplier" inputMode="numeric" maxLength={2} placeholder="27" value={supplierState} onChange={(e) => setSupplierState(e.target.value.trim())} disabled={issuing} className={INPUT} />
            </div>
            <div>
              <label htmlFor="inv-place" className="block text-sm font-medium text-slate-800">Place of supply state code</label>
              <input id="inv-place" inputMode="numeric" maxLength={2} placeholder="07" value={placeState} onChange={(e) => setPlaceState(e.target.value.trim())} disabled={issuing} className={INPUT} />
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={reverseCharge} onChange={(e) => setReverseCharge(e.target.checked)} disabled={issuing} className={`h-5 w-5 ${FOCUS_RING}`} />
              Reverse charge (no GST on this invoice)
            </label>
            <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-800">
              <input type="checkbox" checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} disabled={issuing} className={`h-5 w-5 ${FOCUS_RING}`} />
              Round off to the nearest rupee
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="invoice-preview">
            <h3 className="text-sm font-semibold text-slate-900">Preview (the server recomputes the final amounts)</h3>
            {preview ? (
              <dl className="mt-1">
                <Row label="Subtotal" value={formatInr(preview.subtotalPaise)} />
                {preview.cgstPaise > 0 && <Row label={`CGST ${gstRate / 2}%`} value={formatInr(preview.cgstPaise)} />}
                {preview.sgstPaise > 0 && <Row label={`SGST ${gstRate / 2}%`} value={formatInr(preview.sgstPaise)} />}
                {preview.igstPaise > 0 && <Row label={`IGST ${gstRate}%`} value={formatInr(preview.igstPaise)} />}
                {preview.roundOffPaise !== 0 && <Row label="Round off" value={formatInr(preview.roundOffPaise)} />}
                <Row label="Total" value={formatInr(preview.totalPaise)} strong />
              </dl>
            ) : (
              <p className="mt-1 text-sm text-slate-700">Fill in every line to see the totals.</p>
            )}
          </div>

          {issueRefusal && (
            <div
              role="alert"
              data-testid="invoice-issue-refused"
              className={`rounded-xl border p-4 text-sm ${issueRefusal.error === 'consignment_already_invoiced' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800'}`}
            >
              <p className="font-semibold">{issueRefusal.message}</p>
              {issueRefusal.error === 'consignment_already_invoiced' && issueRefusal.invoiceId && (
                <button
                  type="button"
                  data-testid="open-existing-invoice"
                  onClick={() => {
                    const existing = issueRefusal.invoiceId as string
                    resetForm()
                    setShowForm(false)
                    selectInvoice(existing)
                  }}
                  className={`mt-2 min-h-[44px] rounded-xl border border-amber-300 px-4 font-semibold underline ${FOCUS_RING}`}
                >
                  {`Open invoice ${issueRefusal.invoiceNumber ?? ''}`.trim()}
                </button>
              )}
              {issueRefusal.problems.length > 0 && (
                <ul className="mt-1 list-disc pl-5">
                  {issueRefusal.problems.map((p, i) => (
                    <li key={`${p.index}-${i}`}>Line {p.index + 1}: {p.message}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="space-y-2">
            <button type="submit" disabled={issueBlocker !== null} aria-describedby={issueBlocker && issueBlocker !== 'submitting' ? 'invoice-blocker' : undefined} className={PRIMARY_BTN}>
              {issuing ? 'Issuing…' : 'Issue invoice'}
            </button>
            {issueBlocker && issueBlocker !== 'submitting' && (
              <p id="invoice-blocker" className="text-xs text-slate-700">{issueBlocker}</p>
            )}
          </div>
        </form>
      )}

      {grs.length > 0 && (
        <section aria-labelledby="gr-ready-title" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="invoice-from-gr">
          <h2 id="gr-ready-title" className="text-base font-bold text-slate-900">Delivered GRs ready to invoice</h2>
          <p className="text-xs text-slate-600">
            Opens the New invoice form with the client and a Freight line for the GR. You type the rate; nothing is priced for you.
          </p>
          {grNote && (
            <p role="alert" data-testid="invoice-from-gr-note" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{grNote}</p>
          )}
          <ul className="divide-y divide-slate-100">
            {grs.map((gr) => (
              <li key={gr.consignmentId} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900 break-all">{gr.grNumber}</span>
                  <span className="block text-xs text-slate-600">
                    {clientName.get(gr.clientId) ?? 'Client'} · {gr.status === 'receipt_confirmed' ? 'Receipt confirmed' : 'Delivered'}
                  </span>
                </span>
                {invoiceByGr.get(gr.consignmentId) ? (
                  <span className="flex flex-wrap items-center gap-2" data-testid="gr-invoiced">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Invoiced</span>
                    <button
                      type="button"
                      onClick={() => selectInvoice((invoiceByGr.get(gr.consignmentId) as InvoiceRow).id)}
                      aria-label={`Open invoice ${(invoiceByGr.get(gr.consignmentId) as InvoiceRow).invoice_number} for GR ${gr.grNumber}`}
                      className={`min-h-[44px] rounded-xl px-3 text-sm font-semibold text-indigo-700 underline ${FOCUS_RING}`}
                    >
                      {(invoiceByGr.get(gr.consignmentId) as InvoiceRow).invoice_number}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => prefillFromGr(gr)}
                    disabled={!gate.canSettle}
                    title={gate.settleTitle}
                    aria-label={`Create invoice from consignment ${gr.grNumber}`}
                    className={`flex items-center justify-center gap-1 ${SECONDARY_BTN}`}
                  >
                    <Plus size={16} aria-hidden="true" /> Create invoice from consignment
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="invoice-list-title" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="invoice-list">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="invoice-list-title" className="text-base font-bold text-slate-900">Invoices</h2>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={invoices.length === 0}
            className={`flex items-center gap-1 ${SECONDARY_BTN}`}
          >
            <Download size={16} aria-hidden="true" /> Export CSV
          </button>
        </div>
        {invoices.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="outstanding-by-client">
            <h3 className="text-sm font-semibold text-slate-900">Outstanding by client</h3>
            {outstandingRows.length === 0 ? (
              <p className="mt-1 text-sm text-slate-700">Nothing is outstanding.</p>
            ) : (
              <>
                <ul className="mt-1 space-y-1">
                  {outstandingRows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="break-words text-slate-900">{r.name}</span>
                      <span className="font-semibold text-slate-900">{formatInr(r.paise)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex items-center justify-between gap-3 border-t border-slate-200 pt-2 text-sm font-bold text-slate-900">
                  <span>Total outstanding</span>
                  <span data-testid="outstanding-total">{formatInr(outstandingTotal)}</span>
                </p>
              </>
            )}
          </div>
        )}
        {invoices.length === 0 && !error ? (
          <p data-testid="invoices-empty" className="text-sm text-slate-700">No invoices yet. Choose New invoice to issue the first one.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invoices.map((inv) => (
              <li key={inv.id} className="py-2">
                <button
                  type="button"
                  onClick={() => selectInvoice(inv.id)}
                  aria-pressed={selectedId === inv.id}
                  aria-label={`Open invoice ${inv.invoice_number}`}
                  className={`flex min-h-[44px] w-full flex-col gap-1 rounded-xl px-2 py-2 text-left sm:flex-row sm:items-center sm:justify-between ${selectedId === inv.id ? 'bg-indigo-50' : ''} ${FOCUS_RING}`}
                >
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 break-words">{inv.invoice_number}</span>
                    <span className="block text-xs text-slate-600">
                      {clientName.get(inv.client_id) ?? 'Client'} · {new Date(inv.created_at).toLocaleDateString()}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3 text-sm">
                    <StatusChip status={inv.status} />
                    <span className="text-slate-900">Total {formatInr(inv.total_paise)}</span>
                    <span className="font-semibold text-slate-900">Outstanding {formatInr(outstandingOf(inv))}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <section aria-labelledby="invoice-detail-title" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4" data-testid="invoice-detail">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="invoice-detail-title" className="text-base font-bold text-slate-900 break-all">{selected.invoice_number}</h2>
            <StatusChip status={selected.status} />
          </div>
          <p className="text-sm text-slate-700">
            {clientName.get(selected.client_id) ?? 'Client'} · supplier state {selected.supplier_state_code}, place of supply {selected.place_of_supply_state_code}
            {selected.reverse_charge ? ' · reverse charge' : ''}
          </p>

          <dl className="rounded-xl border border-slate-200 p-3" data-testid="invoice-totals">
            <Row label="Subtotal" value={formatInr(selected.subtotal_paise)} />
            {selected.cgst_paise > 0 && <Row label={`CGST ${selected.gst_rate_pct / 2}%`} value={formatInr(selected.cgst_paise)} />}
            {selected.sgst_paise > 0 && <Row label={`SGST ${selected.gst_rate_pct / 2}%`} value={formatInr(selected.sgst_paise)} />}
            {selected.igst_paise > 0 && <Row label={`IGST ${selected.gst_rate_pct}%`} value={formatInr(selected.igst_paise)} />}
            {selected.round_off_paise !== 0 && <Row label="Round off" value={formatInr(selected.round_off_paise)} />}
            <Row label="Total" value={formatInr(selected.total_paise)} strong />
            <Row label="Received" value={formatInr(selected.paid_paise)} />
            <Row label="Outstanding" value={formatInr(outstandingOf(selected))} strong />
          </dl>

          {selected.status === 'cancelled' && selected.cancelled_reason && (
            <p role="note" className="rounded-xl border border-slate-300 bg-slate-50 p-3 text-sm text-slate-800">Cancelled: {selected.cancelled_reason}</p>
          )}

          {detailError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <span>{detailError}</span>
              <button onClick={() => fetchDetail(selected.id)} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>Retry</button>
            </div>
          )}

          {detailLoading ? (
            <div role="status" aria-busy="true" className="py-4 text-center" data-testid="invoice-detail-loading">
              <RefreshCw className="mx-auto animate-spin text-indigo-600" size={20} aria-hidden="true" />
              <span className="sr-only">Loading invoice details…</span>
            </div>
          ) : (
            detail && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Line items</h3>
                  <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Invoice lines">
                    {detail.lines.map((l) => (
                      <li key={l.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <span className="break-words text-slate-900">{l.line_no}. {l.description}</span>
                        <span className="text-slate-700">{l.quantity} × {formatInr(l.rate_paise)} = <strong>{formatInr(l.amount_paise)}</strong></span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Payments recorded</h3>
                  {detail.payments.length === 0 ? (
                    <p data-testid="invoice-no-payments" className="mt-1 text-sm text-slate-700">No payments recorded yet.</p>
                  ) : (
                    <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Recorded payments" data-testid="invoice-payments">
                      {detail.payments.map((p) => (
                        <li key={p.id} className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <span className="text-slate-900">{formatInr(p.amount_paise)} · {METHOD_LABELS[p.method]}{p.reference ? ` · ${p.reference}` : ''}</span>
                          <span className="text-slate-600">Received {p.received_on}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )
          )}

          {canPay && (
            <form onSubmit={handleRecordPayment} noValidate aria-labelledby="record-payment-title" className="rounded-xl border border-slate-200 p-3 space-y-3" data-testid="payment-form">
              <h3 id="record-payment-title" className="text-sm font-semibold text-slate-900">Record payment</h3>
              <p className="text-xs text-slate-600">Record money you have already received in your own account. Nothing is charged here.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="pay-amount" className="block text-sm font-medium text-slate-800">Amount received (₹)</label>
                  <input id="pay-amount" inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} disabled={paying} className={INPUT} />
                </div>
                <div>
                  <label htmlFor="pay-method" className="block text-sm font-medium text-slate-800">Method</label>
                  <select id="pay-method" value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)} disabled={paying} className={INPUT}>
                    {(Object.keys(METHOD_LABELS) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>{METHOD_LABELS[m]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pay-reference" className="block text-sm font-medium text-slate-800">Reference <span className="font-normal text-slate-600">(optional)</span></label>
                  <input id="pay-reference" value={payReference} maxLength={100} onChange={(e) => setPayReference(e.target.value)} disabled={paying} className={INPUT} />
                </div>
                <div>
                  <label htmlFor="pay-date" className="block text-sm font-medium text-slate-800">Received on</label>
                  <input id="pay-date" type="date" value={payDate} max={todayLocal()} onChange={(e) => setPayDate(e.target.value)} disabled={paying} className={INPUT} />
                </div>
              </div>
              {payRefusal && (
                <p role="alert" data-testid="payment-refused" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{payRefusal}</p>
              )}
              {paidNote && (
                <p role="status" data-testid="payment-success" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{paidNote}</p>
              )}
              <div className="space-y-2">
                <button type="submit" disabled={payBlocker !== null} aria-describedby={payBlocker && payBlocker !== 'submitting' ? 'payment-blocker' : undefined} className={PRIMARY_BTN}>
                  {paying ? 'Recording…' : 'Record payment'}
                </button>
                {payBlocker && payBlocker !== 'submitting' && payAmount !== '' && (
                  <p id="payment-blocker" className="text-xs text-slate-700">{payBlocker}</p>
                )}
              </div>
            </form>
          )}

          {canPay && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-3" data-testid="upi-section">
              <h3 className="text-sm font-semibold text-slate-900">UPI pay link (optional)</h3>
              <p className="text-xs text-slate-600">
                Type your UPI ID to build a link for the outstanding {formatInr(selectedOutstanding)}. It is used on this screen only and is never saved.
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="upi-vpa" className="block text-sm font-medium text-slate-800">Your UPI ID</label>
                  <input id="upi-vpa" autoComplete="off" placeholder="name@bank" value={vpa} onChange={(e) => setVpa(e.target.value)} className={INPUT} />
                </div>
                <div>
                  <label htmlFor="upi-name" className="block text-sm font-medium text-slate-800">Payee name</label>
                  <input id="upi-name" autoComplete="off" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} className={INPUT} />
                </div>
              </div>
              {upi.problem && <p role="note" className="text-xs text-amber-900">{upi.problem}</p>}
              {upi.link && (
                <div className="space-y-2">
                  <p data-testid="upi-link" className="break-all rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-900">{upi.link}</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleCopy(upi.link as string)} className={`flex items-center gap-1 ${SECONDARY_BTN}`}>
                      <Copy size={16} aria-hidden="true" /> Copy pay link
                    </button>
                    <a href={upi.link} className={`flex items-center ${SECONDARY_BTN}`}>Open in UPI app</a>
                  </div>
                </div>
              )}
            </div>
          )}

          {canCancel && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-3" data-testid="cancel-section">
              {confirmCancel ? (
                <>
                  <div>
                    <label htmlFor="cancel-reason" className="block text-sm font-medium text-slate-800">Reason for cancelling</label>
                    <textarea
                      id="cancel-reason"
                      value={cancelReason}
                      maxLength={300}
                      rows={2}
                      onChange={(e) => setCancelReason(e.target.value)}
                      disabled={cancelling}
                      className={`mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 ${FOCUS_RING}`}
                    />
                  </div>
                  {cancelRefusal && <p role="alert" data-testid="cancel-refused" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{cancelRefusal}</p>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={handleCancel} disabled={cancelling} className={`min-h-[44px] rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                      {cancelling ? 'Cancelling…' : 'Confirm cancel invoice'}
                    </button>
                    <button type="button" onClick={() => { setConfirmCancel(false); setCancelRefusal(null) }} disabled={cancelling} className={SECONDARY_BTN}>
                      Keep invoice
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} className={`${SECONDARY_BTN} text-red-800`}>
                  Cancel invoice
                </button>
              )}
              <p className="text-xs text-slate-600">An invoice can be cancelled only while no payment is recorded.</p>
            </div>
          )}
          {selected.status === 'partly_paid' && (
            <p className="text-xs text-slate-600">This invoice has recorded payments, so it cannot be cancelled.</p>
          )}
        </section>
      )}
    </div>
  )
}
