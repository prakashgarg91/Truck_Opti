import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, Download, Pencil, Plus, RefreshCw, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyPayrollApi,
  type AdjustmentRow,
  type DriverDirectoryEntry,
  type DriverRateRow,
  type EmployedDriver,
  type PayrollLineRow,
  type PayrollPeriodRow,
  type PeriodStatus,
} from '../services/agencyPayrollApi'
import { formatInr, rupeesToPaise } from '../lib/invoiceMoney'
import { buildPayrollCsv } from '../lib/payrollCsv'

// TO-150 Driver payroll (ACCOUNTING ONLY, CONFIDENTIAL). TruckOpti never moves
// money: this screen records rates, advances and deductions and closes periods.
// The server computes every closed line; nothing here is the authority.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const MAX_RATE_PAISE = 1_000_000_000
const REASON_MIN = 3
const REASON_MAX = 200

const STATUS_STYLE: Record<PeriodStatus, { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'bg-indigo-50 text-indigo-900 border-indigo-200' },
  closed: { label: 'Closed', tone: 'bg-slate-100 text-slate-700 border-slate-300' },
}

const INPUT = `mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`
const SECONDARY_BTN = `min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`
const PRIMARY_BTN = `min-h-[44px] w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`

function StatusChip({ status }: { status: PeriodStatus }) {
  const { label, tone } = STATUS_STYLE[status]
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
}

/** One idempotency key per intent: a changed payload starts a new intent. */
function intentKey(ref: { current: { sig: string; key: string } | null }, sig: string): string {
  if (!ref.current || ref.current.sig !== sig) ref.current = { sig, key: crypto.randomUUID() }
  return ref.current.key
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function driverLabel(
  drivers: Map<string, EmployedDriver>,
  id: string,
  directory: Map<string, DriverDirectoryEntry> = new Map()
): string {
  const named = directory.get(id)
  if (named) return `${named.name}${named.phone_last4 ? ` (ends ${named.phone_last4})` : ''}`
  const phone = drivers.get(id)?.contact_phone
  return `Driver ${id.slice(0, 8)}${phone ? ` (${phone})` : ''}`
}

const rateToRupees = (paise: number) => `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`

/** Rate field: zero is allowed (unlike rupeesToPaise callers elsewhere), upper bound is the database limit. */
function parseRate(text: string): number | null {
  const paise = rupeesToPaise(text)
  return paise !== null && paise <= MAX_RATE_PAISE ? paise : null
}

export default function AgencyPayrollPage() {
  useEffect(() => {
    document.title = 'Driver payroll - TruckOpti'
  }, [])

  const [rates, setRates] = useState<DriverRateRow[]>([])
  const [drivers, setDrivers] = useState<EmployedDriver[]>([])
  const [directory, setDirectory] = useState<DriverDirectoryEntry[]>([])
  const [periods, setPeriods] = useState<PayrollPeriodRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  // Rate editing
  const [editingId, setEditingId] = useState<string | null>(null)
  const [rateBase, setRateBase] = useState('')
  const [ratePerKm, setRatePerKm] = useState('')
  const [ratePerTonne, setRatePerTonne] = useState('')
  const [savingRate, setSavingRate] = useState(false)
  const [rateRefusal, setRateRefusal] = useState<string | null>(null)

  // Open period
  const [newStart, setNewStart] = useState('')
  const [newEnd, setNewEnd] = useState('')
  const [opening, setOpening] = useState(false)
  const [openRefusal, setOpenRefusal] = useState<string | null>(null)
  const openIntent = useRef<{ sig: string; key: string } | null>(null)

  // Selected period
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [lines, setLines] = useState<PayrollLineRow[]>([])
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Adjustment form
  const [adjDriver, setAdjDriver] = useState('')
  const [adjKind, setAdjKind] = useState<'advance' | 'deduction'>('advance')
  const [adjAmount, setAdjAmount] = useState('')
  const [adjReason, setAdjReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjRefusal, setAdjRefusal] = useState<string | null>(null)

  // Close
  const [confirmClose, setConfirmClose] = useState(false)
  const [closing, setClosing] = useState(false)
  const [closeRefusal, setCloseRefusal] = useState<string | null>(null)
  const [closedNote, setClosedNote] = useState<string | null>(null)
  const closeIntent = useRef<{ sig: string; key: string } | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const [r, p] = await Promise.all([agencyPayrollApi.listRates(), agencyPayrollApi.listPeriods()])
      setRates(r)
      setPeriods(p)
      // Employment is readable by the owner; if it is not, rates alone still list the drivers.
      try {
        setDrivers(await agencyPayrollApi.listEmployedDrivers())
      } catch (e) {
        logger.warn('[AgencyPayrollPage] drivers load failed:', e)
        setDrivers([])
      }
      // Names are optional: on any failure the 'Driver <id> (phone)' text stays.
      try {
        setDirectory(await agencyPayrollApi.listDriverDirectory())
      } catch (e) {
        logger.warn('[AgencyPayrollPage] driver names load failed:', e)
        setDirectory([])
      }
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyPayrollPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load payroll')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (period: PayrollPeriodRow) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      if (period.status === 'closed') {
        setLines(await agencyPayrollApi.listLines(period.id))
        setAdjustments([])
      } else {
        setAdjustments(await agencyPayrollApi.listAdjustments(period.id))
        setLines([])
      }
    } catch (e) {
      logger.error('[AgencyPayrollPage] detail load failed:', e)
      setDetailError(toUserFacingErrorMessage(e, 'Failed to load the period'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const selected = useMemo(() => periods.find((p) => p.id === selectedId) ?? null, [periods, selectedId])
  const selectedKey = selected ? `${selected.id}:${selected.status}` : null

  useEffect(() => {
    if (selected) fetchDetail(selected)
    // Reload only when the selection or its status changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, fetchDetail])

  const directoryMap = useMemo(() => new Map(directory.map((d) => [d.driver_id, d])), [directory])
  const driverMap = useMemo(() => new Map(drivers.map((d) => [d.driver_id, d])), [drivers])
  const rateMap = useMemo(() => new Map(rates.map((r) => [r.driver_id, r])), [rates])
  const activeDriverIds = useMemo(() => {
    const ids = new Set<string>()
    for (const d of drivers) if (d.status === 'active') ids.add(d.driver_id)
    for (const r of rates) ids.add(r.driver_id)
    return Array.from(ids)
  }, [drivers, rates])
  const label = (id: string) => driverLabel(driverMap, id, directoryMap)

  // ---- Rates ---------------------------------------------------------------
  const startEdit = (driverId: string) => {
    const r = rateMap.get(driverId)
    setEditingId(driverId)
    setRateBase(r ? rateToRupees(r.base_paise) : '0')
    setRatePerKm(r ? rateToRupees(r.per_km_paise) : '0')
    setRatePerTonne(r ? rateToRupees(r.per_tonne_paise) : '0')
    setRateRefusal(null)
  }

  const baseP = parseRate(rateBase)
  const kmP = parseRate(ratePerKm)
  const tonneP = parseRate(ratePerTonne)
  const rateBlocker: string | null = savingRate
    ? 'submitting'
    : baseP === null || kmP === null || tonneP === null
      ? 'Enter each rate in rupees (up to 2 decimals), zero or more, at most 10,00,000.'
      : null

  const handleSaveRate = async (event: FormEvent) => {
    event.preventDefault()
    if (rateBlocker !== null || !editingId || baseP === null || kmP === null || tonneP === null) return
    setSavingRate(true)
    setRateRefusal(null)
    try {
      const result = await agencyPayrollApi.setRate({
        driverId: editingId,
        basePaise: baseP,
        perKmPaise: kmP,
        perTonnePaise: tonneP,
        expectedVersion: rateMap.get(editingId)?.version ?? 0,
      })
      if (result.ok) {
        toast.success('Rate saved')
        setEditingId(null)
      } else {
        setRateRefusal(result.message)
        toast.error(result.message)
      }
      // One refetch in every completed outcome; never an automatic retry.
      await fetchAll()
    } catch (e) {
      logger.error('[AgencyPayrollPage] rate save failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to save the rate'))
    } finally {
      setSavingRate(false)
    }
  }

  // ---- Open period ---------------------------------------------------------
  const openBlocker: string | null = opening
    ? 'submitting'
    : !ISO_DATE.test(newStart) || !ISO_DATE.test(newEnd)
      ? 'Choose the first and last day of the period.'
      : newEnd < newStart
        ? 'The last day cannot be before the first day.'
        : null

  const handleOpenPeriod = async (event: FormEvent) => {
    event.preventDefault()
    if (openBlocker !== null) return
    const key = intentKey(openIntent, `${newStart}|${newEnd}`)
    setOpening(true)
    setOpenRefusal(null)
    try {
      const result = await agencyPayrollApi.openPeriod({ periodStart: newStart, periodEnd: newEnd, idempotencyKey: key })
      if (result.ok) {
        toast.success(result.replay ? 'Period already opened' : 'Period opened')
        openIntent.current = null
        setNewStart('')
        setNewEnd('')
        setSelectedId(result.periodId)
        resetPeriodForms()
      } else {
        if (result.error === 'idempotency_key_reused') openIntent.current = null
        setOpenRefusal(result.message)
        toast.error(result.message)
      }
      await fetchAll()
    } catch (e) {
      logger.error('[AgencyPayrollPage] open period failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to open the payroll period'))
    } finally {
      setOpening(false)
    }
  }

  function resetPeriodForms() {
    setAdjDriver('')
    setAdjKind('advance')
    setAdjAmount('')
    setAdjReason('')
    setAdjRefusal(null)
    setConfirmClose(false)
    setCloseRefusal(null)
    setClosedNote(null)
    closeIntent.current = null
  }

  const selectPeriod = (id: string) => {
    setSelectedId(id)
    setLines([])
    setAdjustments([])
    resetPeriodForms()
  }

  // ---- Adjustments ---------------------------------------------------------
  const adjPaise = rupeesToPaise(adjAmount)
  const adjReasonTrim = adjReason.trim()
  const adjBlocker: string | null = adjusting
    ? 'submitting'
    : !adjDriver
      ? 'Choose the driver.'
      : adjPaise === null || adjPaise <= 0
        ? 'Enter the amount in rupees, for example 2000 or 2000.50.'
        : adjReasonTrim.length < REASON_MIN || adjReasonTrim.length > REASON_MAX
          ? `Give a reason of ${REASON_MIN} to ${REASON_MAX} characters.`
          : null

  const handleAdjust = async (event: FormEvent) => {
    event.preventDefault()
    if (adjBlocker !== null || !selected || adjPaise === null) return
    setAdjusting(true)
    setAdjRefusal(null)
    try {
      const result = await agencyPayrollApi.adjust({
        periodId: selected.id,
        driverId: adjDriver,
        kind: adjKind,
        amountPaise: adjPaise,
        reason: adjReasonTrim,
      })
      if (result.ok) {
        toast.success(adjKind === 'advance' ? 'Advance recorded' : 'Deduction recorded')
        setAdjAmount('')
        setAdjReason('')
      } else {
        setAdjRefusal(result.message)
        toast.error(result.message)
      }
      await Promise.all([fetchAll(), fetchDetail(selected)])
    } catch (e) {
      logger.error('[AgencyPayrollPage] adjustment failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to record the adjustment'))
    } finally {
      setAdjusting(false)
    }
  }

  // ---- Close ---------------------------------------------------------------
  const handleClose = async () => {
    if (!selected || selected.status !== 'open') return
    const key = intentKey(closeIntent, `${selected.period_start}|${selected.period_end}`)
    setClosing(true)
    setCloseRefusal(null)
    try {
      const result = await agencyPayrollApi.closePeriod({
        periodStart: selected.period_start,
        periodEnd: selected.period_end,
        idempotencyKey: key,
      })
      if (result.ok) {
        toast.success(result.replay ? 'Period already closed' : 'Period closed')
        closeIntent.current = null
        setConfirmClose(false)
        setClosedNote(
          result.replay
            ? 'This period was already closed. Nothing new was written.'
            : `Period closed. ${result.lines ?? 0} driver line${result.lines === 1 ? '' : 's'} written.`
        )
      } else {
        if (result.error === 'idempotency_key_reused') closeIntent.current = null
        setCloseRefusal(result.message)
        setConfirmClose(false)
        toast.error(result.message)
      }
      await fetchAll()
    } catch (e) {
      logger.error('[AgencyPayrollPage] close failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to close the payroll period'))
    } finally {
      setClosing(false)
    }
  }

  // ---- CSV -----------------------------------------------------------------
  const handleDownload = () => {
    if (!selected || lines.length === 0) return
    try {
      const csv = buildPayrollCsv(
        lines.map((l) => ({
          driverLabel: label(l.driver_id),
          tripCount: l.trip_count,
          basePaise: l.base_paise,
          tripsPaise: l.trips_paise,
          advancesPaise: l.advances_paise,
          deductionsPaise: l.deductions_paise,
          carriedInPaise: l.carried_in_paise,
          netPaise: l.net_paise,
          shortfallPaise: l.shortfall_paise,
        }))
      )
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `payroll-${selected.period_start}-to-${selected.period_end}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      logger.error('[AgencyPayrollPage] csv failed:', e)
      toast.error('Could not create the download.')
    }
  }

  // ---- Render --------------------------------------------------------------
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="payroll-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading payroll…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="payroll-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to payroll</h1>
          <p className="mt-1 text-sm text-slate-700">Payroll is confidential. Ask the agency owner for finance access.</p>
        </div>
      </div>
    )
  }

  const totals = lines.reduce(
    (acc, l) => ({ net: acc.net + l.net_paise, shortfall: acc.shortfall + l.shortfall_paise }),
    { net: 0, shortfall: 0 }
  )

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Driver payroll</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Confidential. This is accounting only: TruckOpti does not pay drivers or move money. Pay them from your own account.
        </p>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
            onClick={() => {
              setLoading(true)
              fetchAll()
            }}
            className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
          >
            Retry
          </button>
        </div>
      )}

      {/* ---- Rate card ---- */}
      <section aria-labelledby="rates-title" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="rates-section">
        <h2 id="rates-title" className="text-base font-bold text-slate-900">Driver rates</h2>
        {activeDriverIds.length === 0 ? (
          <p data-testid="rates-empty" className="text-sm text-slate-700">No drivers yet. Add a driver on the Drivers page to set a rate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Pay rates per driver</caption>
              <thead>
                <tr className="border-b border-slate-200 text-slate-700">
                  <th scope="col" className="py-2 pr-3">Driver</th>
                  <th scope="col" className="py-2 pr-3 text-right">Base</th>
                  <th scope="col" className="py-2 pr-3 text-right">Per km</th>
                  <th scope="col" className="py-2 pr-3 text-right">Per tonne</th>
                  <th scope="col" className="py-2 pr-3 text-right">Version</th>
                  <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {activeDriverIds.map((id) => {
                  const r = rateMap.get(id)
                  return (
                    <tr key={id} className="border-b border-slate-100" data-testid={`rate-row-${id}`}>
                      <th scope="row" className="py-2 pr-3 font-medium text-slate-900">{label(id)}</th>
                      <td className="py-2 pr-3 text-right">{r ? formatInr(r.base_paise) : 'Not set'}</td>
                      <td className="py-2 pr-3 text-right">{r ? formatInr(r.per_km_paise) : 'Not set'}</td>
                      <td className="py-2 pr-3 text-right">{r ? formatInr(r.per_tonne_paise) : 'Not set'}</td>
                      <td className="py-2 pr-3 text-right">{r ? r.version : 0}</td>
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          onClick={() => startEdit(id)}
                          aria-label={`Edit rate for ${label(id)}`}
                          className={`inline-flex items-center gap-1 ${SECONDARY_BTN}`}
                        >
                          <Pencil size={14} aria-hidden="true" /> {r ? 'Edit' : 'Set rate'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {editingId && (
          <form onSubmit={handleSaveRate} noValidate aria-labelledby="rate-form-title" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="rate-form">
            <h3 id="rate-form-title" className="text-sm font-semibold text-slate-900">Rate for {label(editingId)}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="rate-base" className="block text-sm font-medium text-slate-800">Base per period (₹)</label>
                <input id="rate-base" inputMode="decimal" value={rateBase} onChange={(e) => setRateBase(e.target.value)} disabled={savingRate} className={INPUT} />
              </div>
              <div>
                <label htmlFor="rate-km" className="block text-sm font-medium text-slate-800">Per km (₹)</label>
                <input id="rate-km" inputMode="decimal" value={ratePerKm} onChange={(e) => setRatePerKm(e.target.value)} disabled={savingRate} className={INPUT} />
              </div>
              <div>
                <label htmlFor="rate-tonne" className="block text-sm font-medium text-slate-800">Per tonne (₹)</label>
                <input id="rate-tonne" inputMode="decimal" value={ratePerTonne} onChange={(e) => setRatePerTonne(e.target.value)} disabled={savingRate} className={INPUT} />
              </div>
            </div>
            {rateBlocker && rateBlocker !== 'submitting' && <p data-testid="rate-hint" className="text-sm text-slate-700">{rateBlocker}</p>}
            {rateRefusal && (
              <div role="alert" data-testid="rate-refused" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{rateRefusal}</div>
            )}
            <div className="flex flex-col gap-2 sm:flex-row">
              <button type="submit" disabled={rateBlocker !== null} className={PRIMARY_BTN}>{savingRate ? 'Saving…' : 'Save rate'}</button>
              <button type="button" onClick={() => setEditingId(null)} disabled={savingRate} className={SECONDARY_BTN}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      {/* ---- Periods ---- */}
      <section aria-labelledby="periods-title" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="periods-section">
        <h2 id="periods-title" className="text-base font-bold text-slate-900">Payroll periods</h2>

        <form onSubmit={handleOpenPeriod} noValidate aria-label="Open a payroll period" className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" data-testid="open-period-form">
          <div>
            <label htmlFor="period-start" className="block text-sm font-medium text-slate-800">First day</label>
            <input id="period-start" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} disabled={opening} className={INPUT} />
          </div>
          <div>
            <label htmlFor="period-end" className="block text-sm font-medium text-slate-800">Last day</label>
            <input id="period-end" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} disabled={opening} className={INPUT} />
          </div>
          <button type="submit" disabled={openBlocker !== null} className={`flex items-center justify-center gap-1 ${PRIMARY_BTN}`}>
            <Plus size={16} aria-hidden="true" /> {opening ? 'Opening…' : 'Open period'}
          </button>
        </form>
        {openBlocker && openBlocker !== 'submitting' && newStart !== '' && newEnd !== '' && (
          <p className="text-sm text-slate-700">{openBlocker}</p>
        )}
        {openRefusal && (
          <div role="alert" data-testid="open-refused" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{openRefusal}</div>
        )}

        {periods.length === 0 ? (
          <p data-testid="periods-empty" className="text-sm text-slate-700">No payroll periods yet. Open one above to record advances and deductions.</p>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="periods-list">
            {periods.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => selectPeriod(p.id)}
                  aria-pressed={p.id === selectedId}
                  aria-label={`Open period ${p.period_start} to ${p.period_end}`}
                  className={`flex min-h-[44px] w-full items-center justify-between gap-3 px-2 py-2 text-left text-sm ${FOCUS_RING} ${p.id === selectedId ? 'bg-indigo-50' : ''}`}
                >
                  <span className="font-medium text-slate-900">{p.period_start} to {p.period_end}</span>
                  <StatusChip status={p.status} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---- Selected period ---- */}
      {selected && (
        <section aria-labelledby="period-title" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-4" data-testid="period-detail">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="period-title" className="text-base font-bold text-slate-900">Period {selected.period_start} to {selected.period_end}</h2>
            <StatusChip status={selected.status} />
          </div>

          {closedNote && (
            <div role="status" data-testid="period-closed-note" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
              <span>{closedNote}</span>
            </div>
          )}

          {detailLoading && (
            <p role="status" aria-busy="true" data-testid="period-loading" className="text-sm text-slate-700">Loading the period…</p>
          )}
          {detailError && (
            <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span>{detailError}</span>
              <button type="button" onClick={() => fetchDetail(selected)} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>Retry</button>
            </div>
          )}

          {selected.status === 'open' && !detailLoading && (
            <>
              <form onSubmit={handleAdjust} noValidate aria-labelledby="adjust-title" className="space-y-3" data-testid="adjust-form">
                <h3 id="adjust-title" className="text-sm font-semibold text-slate-900">Add an advance or deduction</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="adj-driver" className="block text-sm font-medium text-slate-800">Driver</label>
                    <select id="adj-driver" value={adjDriver} onChange={(e) => setAdjDriver(e.target.value)} disabled={adjusting} className={INPUT}>
                      <option value="">Choose a driver</option>
                      {activeDriverIds.map((id) => (
                        <option key={id} value={id}>{label(id)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="adj-kind" className="block text-sm font-medium text-slate-800">Type</label>
                    <select id="adj-kind" value={adjKind} onChange={(e) => setAdjKind(e.target.value as 'advance' | 'deduction')} disabled={adjusting} className={INPUT}>
                      <option value="advance">Advance (already given)</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="adj-amount" className="block text-sm font-medium text-slate-800">Amount (₹)</label>
                    <input id="adj-amount" inputMode="decimal" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} disabled={adjusting} className={INPUT} />
                  </div>
                </div>
                <div>
                  <label htmlFor="adj-reason" className="block text-sm font-medium text-slate-800">Reason ({REASON_MIN} to {REASON_MAX} characters)</label>
                  <input id="adj-reason" value={adjReason} maxLength={REASON_MAX + 50} onChange={(e) => setAdjReason(e.target.value)} disabled={adjusting} className={INPUT} />
                </div>
                {adjBlocker && adjBlocker !== 'submitting' && <p data-testid="adjust-hint" className="text-sm text-slate-700">{adjBlocker}</p>}
                {adjRefusal && (
                  <div role="alert" data-testid="adjust-refused" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{adjRefusal}</div>
                )}
                <button type="submit" disabled={adjBlocker !== null} className={PRIMARY_BTN}>{adjusting ? 'Recording…' : 'Record adjustment'}</button>
              </form>

              <div>
                <h3 className="text-sm font-semibold text-slate-900">Recorded in this period</h3>
                {adjustments.length === 0 ? (
                  <p data-testid="adjustments-empty" className="mt-1 text-sm text-slate-700">No advances or deductions yet.</p>
                ) : (
                  <ul className="mt-1 divide-y divide-slate-100 text-sm" data-testid="adjustments-list">
                    {adjustments.map((a) => (
                      <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>{label(a.driver_id)}: {a.kind === 'advance' ? 'Advance' : 'Deduction'}, {a.reason}</span>
                        <span className="font-semibold">{formatInr(a.amount_paise)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3" data-testid="close-section">
                <h3 className="text-sm font-semibold text-slate-900">Close this period</h3>
                <p className="text-sm text-slate-700">
                  The server works out each driver&apos;s earnings from delivered jobs. You can only close after the last day has passed.
                </p>
                {closeRefusal && (
                  <div role="alert" data-testid="close-refused" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{closeRefusal}</div>
                )}
                {!confirmClose ? (
                  <button type="button" onClick={() => setConfirmClose(true)} className={SECONDARY_BTN}>Close period</button>
                ) : (
                  <div role="alertdialog" aria-labelledby="close-confirm-title" data-testid="close-confirm" className="space-y-2 rounded-xl border border-amber-300 bg-amber-50 p-3">
                    <p id="close-confirm-title" className="text-sm font-semibold text-amber-900">
                      Closing is final. Lines, advances and deductions can never be changed afterwards.
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button type="button" onClick={handleClose} disabled={closing} className={PRIMARY_BTN}>
                        {closing ? 'Closing…' : 'Confirm close period'}
                      </button>
                      <button type="button" onClick={() => setConfirmClose(false)} disabled={closing} className={SECONDARY_BTN}>Keep open</button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {selected.status === 'closed' && !detailLoading && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Closed lines (final)</h3>
                <button type="button" onClick={handleDownload} disabled={lines.length === 0} className={`inline-flex items-center gap-1 ${SECONDARY_BTN}`}>
                  <Download size={16} aria-hidden="true" /> Download CSV
                </button>
              </div>
              {lines.length === 0 ? (
                <p data-testid="lines-empty" className="text-sm text-slate-700">No driver had earnings or amounts owed in this period.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm" data-testid="lines-table">
                    <caption className="sr-only">Closed payroll lines</caption>
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-700">
                        <th scope="col" className="py-2 pr-3">Driver</th>
                        <th scope="col" className="py-2 pr-3 text-right">Earnings</th>
                        <th scope="col" className="py-2 pr-3 text-right">Advances</th>
                        <th scope="col" className="py-2 pr-3 text-right">Deductions</th>
                        <th scope="col" className="py-2 pr-3 text-right">Carried in</th>
                        <th scope="col" className="py-2 pr-3 text-right">Net</th>
                        <th scope="col" className="py-2 text-right">Shortfall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l) => (
                        <tr key={l.id} className="border-b border-slate-100" data-testid={`line-row-${l.driver_id}`}>
                          <th scope="row" className="py-2 pr-3 font-medium text-slate-900">{label(l.driver_id)}</th>
                          <td className="py-2 pr-3 text-right">{formatInr(l.base_paise + l.trips_paise)}</td>
                          <td className="py-2 pr-3 text-right">{formatInr(l.advances_paise)}</td>
                          <td className="py-2 pr-3 text-right">{formatInr(l.deductions_paise)}</td>
                          <td className="py-2 pr-3 text-right">{formatInr(l.carried_in_paise)}</td>
                          <td className="py-2 pr-3 text-right font-semibold">{formatInr(l.net_paise)}</td>
                          <td className="py-2 text-right">{formatInr(l.shortfall_paise)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" className="py-2 pr-3" colSpan={5}>Totals</th>
                        <td className="py-2 pr-3 text-right font-bold" data-testid="total-net">{formatInr(totals.net)}</td>
                        <td className="py-2 text-right font-bold" data-testid="total-shortfall">{formatInr(totals.shortfall)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-600">A shortfall is carried into the driver&apos;s next closed period as &quot;Carried in&quot;.</p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
