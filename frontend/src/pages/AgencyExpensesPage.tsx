import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, ShieldAlert, Wrench } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  EXPENSE_CATEGORIES,
  agencyExpensesApi,
  type ExpenseCategory,
  type ExpenseRow,
  type FuelFillRow,
  type MaintenanceItemRow,
  type Refusal,
  type SummaryResult,
  type TruckRow,
} from '../services/agencyExpensesApi'
import { subscriptionInfoFromError } from '../lib/subscriptionGuard'
import type { SubscriptionErrorInfo } from '../lib/billingState'
import { SubscriptionLimitPrompt, useBillingGate } from '../components/billing/BillingGate'
import { fuelMileage, maintenanceDue, type FuelAnomalyReason, type MaintenanceStatus } from '../lib/fleetExpense'
import { formatPaise, optionalRupeesToPaise, rupeesToPaise } from '../lib/rupees'

// TO-149 Expenses, Fuel and Maintenance. Three tabs over one period. Writes go
// only through the agency_* commands (fleet manager or finance); every other
// scope can read. The database re-validates everything; the checks here only
// give faster, plainer feedback. Expenses are never deleted: they are corrected
// by recording, so there is deliberately no delete action.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'
const INPUT = `mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm text-slate-900 disabled:opacity-60 ${FOCUS_RING}`
const PRIMARY_BUTTON = `min-h-[44px] w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`
const SECONDARY_BUTTON = `min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 ${FOCUS_RING}`
const CARD = 'rounded-2xl border border-slate-200 bg-white p-4 space-y-3'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  fuel: 'Fuel',
  toll: 'Toll',
  maintenance: 'Maintenance',
  driver_allowance: 'Driver allowance',
  insurance: 'Insurance',
  permit: 'Permit',
  other: 'Other',
}
const TRUCK_REQUIRED: ReadonlySet<ExpenseCategory> = new Set(['fuel', 'toll', 'maintenance', 'driver_allowance'])

const ANOMALY_TEXT: Record<FuelAnomalyReason, string> = {
  odometer_backwards: 'This reading is lower than the previous fill. Check the odometer.',
  bad_litres: 'The litres do not look right. Check the amount filled.',
  implausible_mileage: 'This works out to an unusual mileage. Check the odometer and litres.',
}

const STATUS_STYLE: Record<MaintenanceStatus, { label: string; tone: string }> = {
  ok: { label: 'OK', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  due_soon: { label: 'Due soon', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  overdue: { label: 'Overdue', tone: 'bg-red-50 text-red-800 border-red-300' },
}

type Tab = 'expenses' | 'fuel' | 'maintenance'
const TABS: { id: Tab; label: string }[] = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'fuel', label: 'Fuel' },
  { id: 'maintenance', label: 'Maintenance' },
]

/** Today's calendar day in India, as YYYY-MM-DD. */
function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function monthStartIso(today: string): string {
  return `${today.slice(0, 8)}01`
}

function parseKm(input: string): number | null {
  const t = input.trim().replace(/,/g, '')
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n < 10_000_000 ? n : null
}

function parseLitres(input: string): number | null {
  const t = input.trim()
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  return n >= 1 && n <= 1000 ? n : null
}

function parseDays(input: string): number | null | 'bad' {
  const t = input.trim()
  if (t === '') return null
  return /^\d{1,5}$/.test(t) && Number(t) > 0 ? Number(t) : 'bad'
}

function StatusChip({ status }: { status: MaintenanceStatus }) {
  const Icon = status === 'ok' ? CheckCircle2 : status === 'due_soon' ? Clock : AlertTriangle
  const { label, tone } = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  )
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  )
}

function Empty({ testId, children }: { testId: string; children: string }) {
  return (
    <p data-testid={testId} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      {children}
    </p>
  )
}

export default function AgencyExpensesPage() {
  useEffect(() => {
    document.title = 'Expenses, fuel and maintenance - TruckOpti'
  }, [])

  const today = useMemo(() => todayIso(), [])
  const [tab, setTab] = useState<Tab>('expenses')
  const [from, setFrom] = useState(() => monthStartIso(today))
  const [to, setTo] = useState(today)

  const [trucks, setTrucks] = useState<TruckRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [fills, setFills] = useState<FuelFillRow[]>([])
  const [items, setItems] = useState<MaintenanceItemRow[]>([])
  const [summary, setSummary] = useState<SummaryResult | null>(null)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [limitInfo, setLimitInfo] = useState<SubscriptionErrorInfo | null>(null)

  const fetchAll = useCallback(async (rangeFrom: string, rangeTo: string) => {
    try {
      setError(null)
      const [t, e, f, m, s] = await Promise.all([
        agencyExpensesApi.listTrucks(),
        agencyExpensesApi.listExpenses(rangeFrom, rangeTo),
        agencyExpensesApi.listFuelFills(),
        agencyExpensesApi.listMaintenanceItems(),
        agencyExpensesApi.expenseSummary(rangeFrom, rangeTo),
      ])
      setTrucks(t)
      setExpenses(e)
      setFills(f)
      setItems(m)
      if (s.ok) {
        setSummary(s)
        setSummaryError(null)
      } else {
        setSummary(null)
        setSummaryError(s.message)
      }
      setDenied(false)
    } catch (err) {
      logger.error('[AgencyExpensesPage] load failed:', err)
      const message = toUserFacingErrorMessage(err, 'Failed to load expenses')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll(from, to)
    // Reload when the period changes; edits inside the date inputs are applied by the Apply button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchAll])

  const [periodError, setPeriodError] = useState<string | null>(null)
  const applyPeriod = () => {
    if (!from || !to || from > to) {
      setPeriodError('The start date must be on or before the end date.')
      return
    }
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 + 1 > 366) {
      setPeriodError('Choose a period of at most 366 days.')
      return
    }
    setPeriodError(null)
    setLoading(true)
    fetchAll(from, to)
  }

  const truckLabel = useCallback(
    (id: string | null) => {
      if (!id) return 'No truck'
      const t = trucks.find((x) => x.id === id)
      return t ? `${t.rc_number} · ${t.vehicle_type}` : 'Unknown truck'
    },
    [trucks]
  )

  /** Run one command, show its typed outcome, then refetch exactly once. */
  const runCommand = async <R extends { ok: boolean }>(
    run: () => Promise<R | Refusal>,
    successText: (r: R) => string,
    fallback: string,
    onRefusal: (r: Refusal) => void
  ): Promise<boolean> => {
    setSubmitting(true)
    setLimitInfo(null)
    try {
      const result = await run()
      if (result.ok) {
        toast.success(successText(result as R))
        await fetchAll(from, to)
        return true
      }
      const refused = result as Refusal
      toast.error(refused.message)
      onRefusal(refused)
      return false
    } catch (e) {
      logger.error('[AgencyExpensesPage] command failed:', e)
      const limit = subscriptionInfoFromError(e)
      if (limit) {
        setLimitInfo(limit)
        return false
      }
      toast.error(toUserFacingErrorMessage(e, fallback))
      return false
    } finally {
      setSubmitting(false)
    }
  }

  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ expenses: null, fuel: null, maintenance: null })
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    else if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = TABS.length - 1
    else return
    event.preventDefault()
    setTab(TABS[next].id)
    tabRefs.current[TABS[next].id]?.focus()
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="expenses-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading expenses…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="expenses-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to expenses</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for fleet manager or finance access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Expenses, fuel and maintenance</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Record what each truck costs, track mileage and keep services on schedule. Entries cannot be deleted; record a correction instead.
        </p>
      </div>

      {limitInfo && <SubscriptionLimitPrompt info={limitInfo} onDismiss={() => setLimitInfo(null)} />}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
            onClick={() => {
              setLoading(true)
              fetchAll(from, to)
            }}
            className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
          >
            Retry
          </button>
        </div>
      )}

      <section aria-labelledby="period-heading" className={CARD}>
        <h2 id="period-heading" className="text-base font-bold text-slate-900">Period</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
          <div>
            <label htmlFor="period-from" className="block text-sm font-medium text-slate-800">From</label>
            <input id="period-from" type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
          </div>
          <div>
            <label htmlFor="period-to" className="block text-sm font-medium text-slate-800">To</label>
            <input id="period-to" type="date" value={to} max={today} onChange={(e) => setTo(e.target.value)} className={INPUT} />
          </div>
          <button type="button" onClick={applyPeriod} className={SECONDARY_BUTTON}>
            Apply period
          </button>
        </div>
        <FormError message={periodError} />
      </section>

      <div role="tablist" aria-label="Expenses sections" className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => handleTabKey(e, i)}
            className={`min-h-[44px] flex-1 whitespace-nowrap rounded-xl px-4 text-sm font-semibold ${FOCUS_RING} ${
              tab === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'expenses' && (
        <div role="tabpanel" id="panel-expenses" aria-labelledby="tab-expenses" className="space-y-6">
          <ExpenseForm
            trucks={trucks}
            today={today}
            submitting={submitting}
            runCommand={runCommand}
            truckLabel={truckLabel}
          />
          <SummarySection summary={summary} summaryError={summaryError} truckLabel={truckLabel} />
          <ExpenseList expenses={expenses} truckLabel={truckLabel} />
        </div>
      )}

      {tab === 'fuel' && (
        <div role="tabpanel" id="panel-fuel" aria-labelledby="tab-fuel" className="space-y-6">
          <FuelSection trucks={trucks} fills={fills} today={today} submitting={submitting} runCommand={runCommand} truckLabel={truckLabel} />
        </div>
      )}

      {tab === 'maintenance' && (
        <div role="tabpanel" id="panel-maintenance" aria-labelledby="tab-maintenance" className="space-y-6">
          <MaintenanceSection
            trucks={trucks}
            items={items}
            fills={fills}
            today={today}
            submitting={submitting}
            runCommand={runCommand}
            truckLabel={truckLabel}
          />
        </div>
      )}
    </div>
  )
}

type RunCommand = <R extends { ok: boolean }>(
  run: () => Promise<R | Refusal>,
  successText: (r: R) => string,
  fallback: string,
  onRefusal: (r: Refusal) => void
) => Promise<boolean>

interface SectionProps {
  trucks: TruckRow[]
  today: string
  submitting: boolean
  runCommand: RunCommand
  truckLabel: (id: string | null) => string
}

function TruckSelect({
  id,
  trucks,
  value,
  onChange,
  optional,
}: {
  id: string
  trucks: TruckRow[]
  value: string
  onChange: (v: string) => void
  optional?: boolean
}) {
  return (
    <select id={id} name={id} value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
      <option value="">{optional ? 'No truck' : 'Choose a truck'}</option>
      {trucks.map((t) => (
        <option key={t.id} value={t.id}>
          {t.rc_number} · {t.vehicle_type}
        </option>
      ))}
    </select>
  )
}

function ExpenseForm({ trucks, today, submitting, runCommand }: SectionProps) {
  const gate = useBillingGate()
  const [category, setCategory] = useState<ExpenseCategory>('fuel')
  const [truckId, setTruckId] = useState('')
  const [amount, setAmount] = useState('')
  const [spentOn, setSpentOn] = useState(today)
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // One idempotency key per expense intent: a retry of the same details reuses it,
  // any edit starts a new intent.
  const key = useRef<string | null>(null)
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    key.current = null
    setFormError(null)
    set(v)
  }

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (submitting) return
    const amountPaise = rupeesToPaise(amount)
    if (amountPaise === null) {
      setFormError('Enter the amount in rupees, for example 1250 or 1250.50. It must be above zero and up to 10,00,000.')
      return
    }
    if (!spentOn || spentOn > today) {
      setFormError('Choose a date that is not in the future.')
      return
    }
    if (TRUCK_REQUIRED.has(category) && !truckId) {
      setFormError(`Choose a truck for ${CATEGORY_LABEL[category].toLowerCase()} expenses.`)
      return
    }
    if (note.trim().length > 300) {
      setFormError('The note is too long. Keep it within 300 characters.')
      return
    }
    if (!key.current) key.current = crypto.randomUUID()
    const idempotencyKey = key.current
    const ok = await runCommand(
      () =>
        agencyExpensesApi.recordExpense({
          truckId: truckId || null,
          category,
          amountPaise,
          spentOn,
          note,
          idempotencyKey,
        }),
      (r) => (r.replay ? 'Expense was already saved' : 'Expense saved'),
      'Failed to save expense',
      (r) => {
        if (r.error === 'idempotency_key_reused') key.current = null
        setFormError(r.message)
      }
    )
    if (ok) {
      key.current = null
      setAmount('')
      setNote('')
    }
  }

  return (
    <section aria-labelledby="add-expense-heading" className={CARD}>
      <h2 id="add-expense-heading" className="text-base font-bold text-slate-900">Add expense</h2>
      <form onSubmit={handleSubmit} noValidate className="space-y-3" data-testid="expense-form">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="expense-category" className="block text-sm font-medium text-slate-800">Category</label>
            <select
              id="expense-category"
              value={category}
              onChange={(e) => edit<ExpenseCategory>(setCategory)(e.target.value as ExpenseCategory)}
              className={INPUT}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="expense-truck" className="block text-sm font-medium text-slate-800">
              Truck{TRUCK_REQUIRED.has(category) ? '' : ' (optional)'}
            </label>
            <TruckSelect id="expense-truck" trucks={trucks} value={truckId} onChange={edit(setTruckId)} optional />
          </div>
          <div>
            <label htmlFor="expense-amount" className="block text-sm font-medium text-slate-800">Amount (rupees)</label>
            <input
              id="expense-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amount}
              onChange={(e) => edit(setAmount)(e.target.value)}
              placeholder="1250.50"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="expense-date" className="block text-sm font-medium text-slate-800">Date</label>
            <input id="expense-date" type="date" value={spentOn} max={today} onChange={(e) => edit(setSpentOn)(e.target.value)} className={INPUT} />
          </div>
        </div>
        <div>
          <label htmlFor="expense-note" className="block text-sm font-medium text-slate-800">
            Note <span className="font-normal text-slate-600">(optional, up to 300 characters)</span>
          </label>
          <textarea
            id="expense-note"
            rows={2}
            maxLength={300}
            value={note}
            onChange={(e) => edit(setNote)(e.target.value)}
            className={`${INPUT} py-2`}
          />
        </div>
        <FormError message={formError} />
        <button type="submit" disabled={submitting || !gate.canWrite} title={gate.writeTitle} className={PRIMARY_BUTTON}>
          {submitting ? 'Saving…' : 'Save expense'}
        </button>
      </form>
    </section>
  )
}

function SummarySection({
  summary,
  summaryError,
  truckLabel,
}: {
  summary: SummaryResult | null
  summaryError: string | null
  truckLabel: (id: string | null) => string
}) {
  return (
    <section aria-labelledby="summary-heading" className={CARD} data-testid="expense-summary">
      <h2 id="summary-heading" className="text-base font-bold text-slate-900">Summary for the period</h2>
      {summaryError ? (
        <FormError message={summaryError} />
      ) : !summary || summary.totalPaise === 0 ? (
        <Empty testId="expense-summary-empty">No expenses were recorded in this period.</Empty>
      ) : (
        <>
          <p className="text-2xl font-bold text-slate-900" data-testid="expense-total">{formatPaise(summary.totalPaise)}</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-800">By category</h3>
              <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Total by category">
                {summary.byCategory.map((c) => (
                  <li key={c.category} className="flex justify-between gap-2 px-3 py-2 text-sm">
                    <span>{CATEGORY_LABEL[c.category as ExpenseCategory] ?? c.category}</span>
                    <span className="font-medium">{formatPaise(c.totalPaise)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">By truck</h3>
              {summary.byTruck.length === 0 ? (
                <p className="mt-1 text-sm text-slate-700">No truck-specific expenses in this period.</p>
              ) : (
                <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Total by truck">
                  {summary.byTruck.map((t) => (
                    <li key={t.truckId} className="flex justify-between gap-2 px-3 py-2 text-sm">
                      <span className="min-w-0 break-words">{truckLabel(t.truckId)}</span>
                      <span className="font-medium">{formatPaise(t.totalPaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function ExpenseList({ expenses, truckLabel }: { expenses: ExpenseRow[]; truckLabel: (id: string | null) => string }) {
  return (
    <section aria-labelledby="expense-list-heading" className={CARD}>
      <h2 id="expense-list-heading" className="text-base font-bold text-slate-900">Expenses in this period</h2>
      {expenses.length === 0 ? (
        <Empty testId="expense-list-empty">No expenses recorded in this period yet. Add the first one above.</Empty>
      ) : (
        <ul aria-labelledby="expense-list-heading" className="divide-y divide-slate-100" data-testid="expense-list">
          {expenses.map((e) => (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="font-medium text-slate-900">{CATEGORY_LABEL[e.category] ?? e.category}</p>
                <p className="text-xs text-slate-600 break-words">
                  {e.spent_on} · {truckLabel(e.truck_id)}
                  {e.note ? ` · ${e.note}` : ''}
                </p>
              </div>
              <p className="font-semibold text-slate-900">{formatPaise(e.amount_paise)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function FuelSection({
  trucks,
  fills,
  today,
  submitting,
  runCommand,
  truckLabel,
}: SectionProps & { fills: FuelFillRow[] }) {
  const gate = useBillingGate()
  const [truckId, setTruckId] = useState('')
  const [odometer, setOdometer] = useState('')
  const [litres, setLitres] = useState('')
  const [fullTank, setFullTank] = useState(true)
  const [amount, setAmount] = useState('')
  const [filledOn, setFilledOn] = useState(today)
  const [formError, setFormError] = useState<string | null>(null)
  const key = useRef<string | null>(null)
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    key.current = null
    setFormError(null)
    set(v)
  }

  const truckFills = useMemo(() => fills.filter((f) => f.truck_id === truckId), [fills, truckId])
  const odometerKm = parseKm(odometer)
  const litresValue = parseLitres(litres)

  // Live feedback: mileage of the saved fills, and whether the draft fill looks wrong.
  const live = useMemo(() => {
    if (!truckId) return null
    const saved = truckFills.map((f) => ({ odometerKm: f.odometer_km, litres: f.litres, fullTank: f.full_tank }))
    const base = fuelMileage(saved)
    if (odometerKm === null || litresValue === null) return { kmPerLitre: base.kmPerLitre, warning: null as string | null }
    const withDraft = fuelMileage([...saved, { odometerKm, litres: litresValue, fullTank }])
    const draftIndex = saved.length
    const anomaly = withDraft.anomalies.find((a) => a.index === draftIndex)
    return { kmPerLitre: withDraft.kmPerLitre, warning: anomaly ? ANOMALY_TEXT[anomaly.reason] : null }
  }, [truckId, truckFills, odometerKm, litresValue, fullTank])

  const lastFill = truckFills.length > 0 ? truckFills[truckFills.length - 1] : null

  const handleSubmit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (submitting) return
    if (!truckId) return setFormError('Choose a truck.')
    if (odometerKm === null) return setFormError('Enter the odometer reading in km, for example 125430.')
    if (litresValue === null) return setFormError('Litres must be between 1 and 1,000, with at most 2 decimals.')
    const amountPaise = rupeesToPaise(amount)
    if (amountPaise === null) return setFormError('Enter the fuel cost in rupees, for example 4500 or 4500.50.')
    if (!filledOn || filledOn > today) return setFormError('Choose a date that is not in the future.')
    if (!key.current) key.current = crypto.randomUUID()
    const idempotencyKey = key.current
    const ok = await runCommand(
      () =>
        agencyExpensesApi.recordFuelFill({
          truckId,
          odometerKm,
          litres: litresValue,
          fullTank,
          amountPaise,
          filledOn,
          idempotencyKey,
        }),
      (r) => (r.replay ? 'Fuel fill was already saved' : 'Fuel fill saved'),
      'Failed to save fuel fill',
      (r) => {
        if (r.error === 'idempotency_key_reused') key.current = null
        setFormError(r.message)
      }
    )
    if (ok) {
      key.current = null
      setOdometer('')
      setLitres('')
      setAmount('')
    }
  }

  return (
    <>
      <section aria-labelledby="fuel-form-heading" className={CARD}>
        <h2 id="fuel-form-heading" className="text-base font-bold text-slate-900">Add fuel fill</h2>
        {trucks.length === 0 ? (
          <Empty testId="fuel-no-trucks">No vehicles yet. Add a vehicle on the Fleet page before recording fuel.</Empty>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-3" data-testid="fuel-form">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="fuel-truck" className="block text-sm font-medium text-slate-800">Truck</label>
                <TruckSelect id="fuel-truck" trucks={trucks} value={truckId} onChange={edit(setTruckId)} />
              </div>
              <div>
                <label htmlFor="fuel-date" className="block text-sm font-medium text-slate-800">Date</label>
                <input id="fuel-date" type="date" value={filledOn} max={today} onChange={(e) => edit(setFilledOn)(e.target.value)} className={INPUT} />
              </div>
              <div>
                <label htmlFor="fuel-odometer" className="block text-sm font-medium text-slate-800">Odometer (km)</label>
                <input
                  id="fuel-odometer"
                  inputMode="decimal"
                  autoComplete="off"
                  value={odometer}
                  onChange={(e) => edit(setOdometer)(e.target.value)}
                  aria-describedby="fuel-last"
                  className={INPUT}
                />
                <p id="fuel-last" className="mt-1 text-xs text-slate-600">
                  {lastFill ? `Last fill: ${lastFill.odometer_km.toLocaleString('en-IN')} km on ${lastFill.filled_on}.` : truckId ? 'No fills recorded for this truck yet.' : 'Choose a truck first.'}
                </p>
              </div>
              <div>
                <label htmlFor="fuel-litres" className="block text-sm font-medium text-slate-800">Litres</label>
                <input
                  id="fuel-litres"
                  inputMode="decimal"
                  autoComplete="off"
                  value={litres}
                  onChange={(e) => edit(setLitres)(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="fuel-amount" className="block text-sm font-medium text-slate-800">Cost (rupees)</label>
                <input
                  id="fuel-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amount}
                  onChange={(e) => edit(setAmount)(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div className="flex items-center gap-2 sm:pt-6">
                <input
                  id="fuel-full"
                  type="checkbox"
                  checked={fullTank}
                  onChange={(e) => edit(setFullTank)(e.target.checked)}
                  className={`h-5 w-5 rounded border-slate-300 ${FOCUS_RING}`}
                />
                <label htmlFor="fuel-full" className="min-h-[44px] flex items-center text-sm font-medium text-slate-800">Tank was filled to full</label>
              </div>
            </div>

            {live && (
              <div className="space-y-2" aria-live="polite" data-testid="fuel-live">
                <p className="text-sm text-slate-800" data-testid="fuel-mileage">
                  {live.kmPerLitre !== null
                    ? `Mileage including this fill: ${live.kmPerLitre} km per litre.`
                    : 'Mileage needs at least two full-tank fills for this truck.'}
                </p>
                {live.warning && (
                  <p role="note" data-testid="fuel-warning" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    {live.warning}
                  </p>
                )}
              </div>
            )}

            <FormError message={formError} />
            <button type="submit" disabled={submitting || !gate.canWrite} title={gate.writeTitle} className={PRIMARY_BUTTON}>
              {submitting ? 'Saving…' : 'Save fuel fill'}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="fuel-history-heading" className={CARD}>
        <h2 id="fuel-history-heading" className="text-base font-bold text-slate-900">Fuel fills</h2>
        {fills.length === 0 ? (
          <Empty testId="fuel-empty">No fuel fills recorded yet.</Empty>
        ) : (
          <ul aria-labelledby="fuel-history-heading" className="divide-y divide-slate-100" data-testid="fuel-list">
            {[...fills]
              .sort((a, b) => (a.filled_on < b.filled_on ? 1 : a.filled_on > b.filled_on ? -1 : b.odometer_km - a.odometer_km))
              .map((f) => (
                <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 break-words">{truckLabel(f.truck_id)}</p>
                    <p className="text-xs text-slate-600">
                      {f.filled_on} · {f.odometer_km.toLocaleString('en-IN')} km · {f.litres} L{f.full_tank ? ' · full tank' : ' · part fill'}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  )
}

function MaintenanceSection({
  trucks,
  items,
  fills,
  today,
  submitting,
  runCommand,
  truckLabel,
}: SectionProps & { items: MaintenanceItemRow[]; fills: FuelFillRow[] }) {
  const gate = useBillingGate()
  const [truckId, setTruckId] = useState('')
  const [name, setName] = useState('')
  const [intervalKm, setIntervalKm] = useState('')
  const [intervalDays, setIntervalDays] = useState('')
  const [lastKm, setLastKm] = useState('')
  const [lastOn, setLastOn] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const [serviceFor, setServiceFor] = useState<string | null>(null)
  const [svcKm, setSvcKm] = useState('')
  const [svcOn, setSvcOn] = useState(today)
  const [svcCost, setSvcCost] = useState('')
  const [svcError, setSvcError] = useState<string | null>(null)
  const serviceKey = useRef<string | null>(null)

  const currentKmFor = useCallback(
    (item: MaintenanceItemRow): number => {
      const odos = fills.filter((f) => f.truck_id === item.truck_id).map((f) => f.odometer_km)
      return Math.max(item.last_service_km ?? 0, ...odos)
    },
    [fills]
  )

  const rows = useMemo(
    () =>
      items.map((item) => {
        const currentKm = currentKmFor(item)
        const lastDate = item.last_service_on ?? item.created_at.slice(0, 10)
        const [due] = maintenanceDue(
          [
            {
              name: item.name,
              lastServiceKm: item.last_service_km ?? currentKm,
              intervalKm: item.interval_km ?? Number.POSITIVE_INFINITY,
              lastServiceDateIso: lastDate,
              intervalDays: item.interval_days ?? Number.POSITIVE_INFINITY,
            },
          ],
          currentKm,
          today
        )
        return { item, currentKm, due }
      }),
    [items, currentKmFor, today]
  )

  const handleAdd = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (submitting) return
    if (!truckId) return setFormError('Choose a truck.')
    if (name.trim() === '') return setFormError('Enter a name, for example Engine oil change.')
    if (name.trim().length > 100) return setFormError('The item name is too long. Keep it within 100 characters.')
    const kmInterval = intervalKm.trim() === '' ? null : parseKm(intervalKm)
    const dayInterval = parseDays(intervalDays)
    if (kmInterval === 0 || (intervalKm.trim() !== '' && kmInterval === null) || dayInterval === 'bad') {
      return setFormError('Intervals must be whole numbers above zero.')
    }
    if (kmInterval === null && dayInterval === null) return setFormError('Enter a service interval in km, days, or both.')
    const lastServiceKm = lastKm.trim() === '' ? null : parseKm(lastKm)
    if (lastKm.trim() !== '' && lastServiceKm === null) return setFormError('Enter the last service km as a number, or leave it blank.')
    if (lastOn && lastOn > today) return setFormError('The last service date cannot be in the future.')
    // Item creation needs no idempotency key: the name is unique per truck (name_exists).
    const ok = await runCommand(
      () =>
        agencyExpensesApi.upsertMaintenanceItem({
          truckId,
          name: name.trim(),
          intervalKm: kmInterval === null ? null : Math.round(kmInterval),
          intervalDays: dayInterval,
          lastServiceKm,
          lastServiceOn: lastOn || null,
          expectedVersion: null,
        }),
      () => 'Maintenance item added',
      'Failed to save maintenance item',
      (r) => setFormError(r.message)
    )
    if (ok) {
      setName('')
      setIntervalKm('')
      setIntervalDays('')
      setLastKm('')
      setLastOn('')
    }
  }

  const openService = (item: MaintenanceItemRow, currentKm: number) => {
    serviceKey.current = null
    setServiceFor(item.id)
    setSvcKm(String(currentKm))
    setSvcOn(today)
    setSvcCost('')
    setSvcError(null)
  }
  const editSvc = (set: (v: string) => void) => (v: string) => {
    serviceKey.current = null
    setSvcError(null)
    set(v)
  }

  const handleServiceDone = async (item: MaintenanceItemRow) => {
    if (submitting) return
    const serviceKm = parseKm(svcKm)
    if (serviceKm === null) return setSvcError('Enter the odometer reading at service in km.')
    if (!svcOn || svcOn > today) return setSvcError('Choose a date that is not in the future.')
    const costPaise = optionalRupeesToPaise(svcCost)
    if (costPaise === null) return setSvcError('Enter the cost in rupees, or leave it blank.')
    if (!serviceKey.current) serviceKey.current = crypto.randomUUID()
    const idempotencyKey = serviceKey.current
    const ok = await runCommand(
      () =>
        agencyExpensesApi.markServiceDone({
          itemId: item.id,
          serviceKm,
          serviceOn: svcOn,
          expectedVersion: item.version,
          costPaise,
          idempotencyKey,
        }),
      (r) => (r.replay ? 'Service was already recorded' : 'Service recorded'),
      'Failed to record service',
      (r) => {
        if (r.error === 'idempotency_key_reused') serviceKey.current = null
        setSvcError(r.message)
      }
    )
    if (ok) {
      serviceKey.current = null
      setServiceFor(null)
    }
  }

  const remaining = (v: number, unit: string) => (Number.isFinite(v) ? `${v < 0 ? `${Math.abs(v).toLocaleString('en-IN')} ${unit} over` : `${v.toLocaleString('en-IN')} ${unit} left`}` : null)

  return (
    <>
      <section aria-labelledby="maint-form-heading" className={CARD}>
        <h2 id="maint-form-heading" className="text-base font-bold text-slate-900">Add maintenance item</h2>
        {trucks.length === 0 ? (
          <Empty testId="maint-no-trucks">No vehicles yet. Add a vehicle on the Fleet page before scheduling maintenance.</Empty>
        ) : (
          <form onSubmit={handleAdd} noValidate className="space-y-3" data-testid="maint-form">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="maint-truck" className="block text-sm font-medium text-slate-800">Truck</label>
                <TruckSelect id="maint-truck" trucks={trucks} value={truckId} onChange={(v) => { setFormError(null); setTruckId(v) }} />
              </div>
              <div>
                <label htmlFor="maint-name" className="block text-sm font-medium text-slate-800">Item name</label>
                <input id="maint-name" value={name} maxLength={100} onChange={(e) => { setFormError(null); setName(e.target.value) }} placeholder="Engine oil change" className={INPUT} />
              </div>
              <div>
                <label htmlFor="maint-interval-km" className="block text-sm font-medium text-slate-800">Every (km)</label>
                <input id="maint-interval-km" inputMode="numeric" value={intervalKm} onChange={(e) => { setFormError(null); setIntervalKm(e.target.value) }} className={INPUT} />
              </div>
              <div>
                <label htmlFor="maint-interval-days" className="block text-sm font-medium text-slate-800">Every (days)</label>
                <input id="maint-interval-days" inputMode="numeric" value={intervalDays} onChange={(e) => { setFormError(null); setIntervalDays(e.target.value) }} className={INPUT} />
              </div>
              <div>
                <label htmlFor="maint-last-km" className="block text-sm font-medium text-slate-800">Last service (km, optional)</label>
                <input id="maint-last-km" inputMode="decimal" value={lastKm} onChange={(e) => { setFormError(null); setLastKm(e.target.value) }} className={INPUT} />
              </div>
              <div>
                <label htmlFor="maint-last-on" className="block text-sm font-medium text-slate-800">Last service date (optional)</label>
                <input id="maint-last-on" type="date" value={lastOn} max={today} onChange={(e) => { setFormError(null); setLastOn(e.target.value) }} className={INPUT} />
              </div>
            </div>
            <FormError message={formError} />
            <button type="submit" disabled={submitting || !gate.canWrite} title={gate.writeTitle} className={PRIMARY_BUTTON}>
              {submitting ? 'Saving…' : 'Add item'}
            </button>
          </form>
        )}
      </section>

      <section aria-labelledby="maint-list-heading" className={CARD}>
        <h2 id="maint-list-heading" className="flex items-center gap-2 text-base font-bold text-slate-900">
          <Wrench size={16} aria-hidden="true" /> Service schedule
        </h2>
        {rows.length === 0 ? (
          <Empty testId="maint-empty">No maintenance items yet. Add one above to start tracking services.</Empty>
        ) : (
          <ul aria-labelledby="maint-list-heading" className="divide-y divide-slate-100" data-testid="maint-list">
            {rows.map(({ item, currentKm, due }) => (
              <li key={item.id} className="space-y-2 py-3" data-testid={`maint-item-${item.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 break-words">
                      {item.name} <StatusChip status={due.status} />
                    </p>
                    <p className="text-xs text-slate-600 break-words">
                      {truckLabel(item.truck_id)} · {[remaining(due.dueInKm, 'km'), remaining(due.dueInDays, 'days')].filter(Boolean).join(' · ') || 'No interval set'}
                    </p>
                  </div>
                  {serviceFor !== item.id && (
                    <button
                      type="button"
                      onClick={() => openService(item, currentKm)}
                      aria-label={`Service done for ${item.name}`}
                      disabled={!gate.canSettle}
                      title={gate.settleTitle}
                      className={SECONDARY_BUTTON}
                    >
                      Service done
                    </button>
                  )}
                </div>
                {serviceFor === item.id && (
                  <form
                    aria-label={`Service for ${item.name}`}
                    onSubmit={(e) => {
                      e.preventDefault()
                      handleServiceDone(item)
                    }}
                    noValidate
                    className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <label htmlFor={`svc-km-${item.id}`} className="block text-sm font-medium text-slate-800">Odometer (km)</label>
                        <input id={`svc-km-${item.id}`} inputMode="decimal" value={svcKm} onChange={(e) => editSvc(setSvcKm)(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <label htmlFor={`svc-on-${item.id}`} className="block text-sm font-medium text-slate-800">Date</label>
                        <input id={`svc-on-${item.id}`} type="date" value={svcOn} max={today} onChange={(e) => editSvc(setSvcOn)(e.target.value)} className={INPUT} />
                      </div>
                      <div>
                        <label htmlFor={`svc-cost-${item.id}`} className="block text-sm font-medium text-slate-800">Cost (rupees, optional)</label>
                        <input id={`svc-cost-${item.id}`} inputMode="decimal" value={svcCost} onChange={(e) => editSvc(setSvcCost)(e.target.value)} className={INPUT} />
                      </div>
                    </div>
                    <FormError message={svcError} />
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={submitting || !gate.canSettle} title={gate.settleTitle} className={PRIMARY_BUTTON}>
                        {submitting ? 'Saving…' : 'Save service'}
                      </button>
                      <button type="button" disabled={submitting} onClick={() => setServiceFor(null)} className={SECONDARY_BUTTON}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
