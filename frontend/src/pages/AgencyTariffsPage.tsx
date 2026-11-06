import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { CalendarClock, Check, History, Lock, Plus, RefreshCw, Search, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyClientsApi,
  agencyTariffApi,
  type AgreementRow,
  type RateBasis,
  type TariffRow,
} from '../services/agencyOrganizationApi'

// TO-144-D2 Tariff Versions (Stitch screen 20944736a6414) for one client
// agreement. The server (RLS + agency_tariff_version_publish) is the
// authority: this page groups published versions into lanes, marks which
// version covers today, and never re-implements pricing rules itself.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const RATE_BASES: ReadonlyArray<{ value: RateBasis; label: string; suffix: string }> = [
  { value: 'per_trip', label: 'Per trip', suffix: 'per trip' },
  { value: 'per_tonne', label: 'Per tonne', suffix: 'per tonne' },
  { value: 'per_km', label: 'Per km', suffix: 'per km' },
]
const BASIS_LABEL: Record<string, string> = Object.fromEntries(RATE_BASES.map((b) => [b.value, b.label]))
const BASIS_SUFFIX: Record<string, string> = Object.fromEntries(RATE_BASES.map((b) => [b.value, b.suffix]))

const DENIAL_MESSAGES = new Set(['Agency approval is required.', 'Sign-in is required.'])
const INACTIVE_MESSAGE = 'This client agreement is inactive. Reactivate it to make changes.'

type VersionChip = 'current' | 'upcoming' | 'past'

interface Lane {
  key: string
  origin: string
  destination: string
  vehicleType: string | null
  versions: TariffRow[]
  current: TariffRow | null
  upcoming: TariffRow[]
  past: TariffRow[]
}

// Effective windows are plain dates ('YYYY-MM-DD'); compare as strings.
const day = (value: string): string => value.slice(0, 10)

function todayStr(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function formatDay(value: string): string {
  const [y, m, d] = day(value).split('-').map(Number)
  if (!y || !m || !d) return value
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

const money = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function groupLanes(rows: TariffRow[], today: string): Lane[] {
  const byLane = new Map<string, TariffRow[]>()
  for (const row of rows) {
    const key = `${row.origin_label}|${row.destination_label}|${row.vehicle_type ?? ''}`
    const bucket = byLane.get(key)
    if (bucket) bucket.push(row)
    else byLane.set(key, [row])
  }
  const lanes: Lane[] = []
  for (const [key, versions] of byLane) {
    const sorted = [...versions].sort((a, b) => a.version_no - b.version_no)
    const active = sorted.filter(
      (v) => day(v.effective_from) <= today && (v.effective_to == null || day(v.effective_to) > today)
    )
    lanes.push({
      key,
      origin: sorted[0].origin_label,
      destination: sorted[0].destination_label,
      vehicleType: sorted[0].vehicle_type,
      versions: sorted,
      current: active.length > 0 ? active[active.length - 1] : null,
      upcoming: sorted.filter((v) => day(v.effective_from) > today),
      past: sorted.filter((v) => v.effective_to != null && day(v.effective_to) <= today),
    })
  }
  return lanes.sort((a, b) =>
    `${a.origin}|${a.destination}|${a.vehicleType ?? ''}`.localeCompare(`${b.origin}|${b.destination}|${b.vehicleType ?? ''}`)
  )
}

const vehicleLabel = (vehicleType: string | null): string => vehicleType ?? 'Any vehicle'

export default function AgencyTariffsPage() {
  const { agreementId } = useParams<{ agreementId: string }>()

  useEffect(() => {
    document.title = 'Tariffs - TruckOpti'
  }, [])

  const [rows, setRows] = useState<TariffRow[]>([])
  const [agreements, setAgreements] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const [chip, setChip] = useState<VersionChip>('current')
  const [search, setSearch] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [openHistory, setOpenHistory] = useState<string[]>([])

  const [showForm, setShowForm] = useState(false)
  const [reviseOf, setReviseOf] = useState<{ laneTitle: string; supersedesVersionId: string | null } | null>(null)
  const [origin, setOrigin] = useState('')
  const [destination, setDestination] = useState('')
  const [vehicle, setVehicle] = useState('')
  const [rateBasis, setRateBasis] = useState<RateBasis>('per_trip')
  const [amount, setAmount] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [effectiveTo, setEffectiveTo] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // One idempotency key per publish intent; a failed submit can be retried safely.
  const publishKey = useRef<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!agreementId) {
      setError('Client agreement not found or access denied.')
      setLoading(false)
      return
    }
    try {
      setError(null)
      const [t, a] = await Promise.all([agencyTariffApi.list(agreementId), agencyClientsApi.listAgreements()])
      setRows(t)
      setAgreements(a)
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyTariffsPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load rates')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [agreementId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const lanes = useMemo(() => groupLanes(rows, todayStr()), [rows])
  const agreement = agreements.find((a) => a.id === agreementId)
  const clientName = agreement?.client_name ?? 'Client'
  const vehicleCodes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.vehicle_type).filter((v): v is string => v != null))).sort(),
    [rows]
  )
  const currentLanes = lanes.filter((l) => l.current)
  const upcomingCount = lanes.reduce((n, l) => n + l.upcoming.length, 0)
  const pastCount = lanes.reduce((n, l) => n + l.past.length, 0)

  const visibleLanes = lanes.filter((lane) => {
    if (chip === 'current' && !lane.current) return false
    if (chip === 'upcoming' && lane.upcoming.length === 0) return false
    if (chip === 'past' && lane.past.length === 0) return false
    if (vehicleFilter && lane.vehicleType !== vehicleFilter) return false
    const query = search.trim().toLowerCase()
    if (query && !`${lane.origin} ${lane.destination} ${vehicleLabel(lane.vehicleType)}`.toLowerCase().includes(query))
      return false
    return true
  })

  const resetForm = () => {
    setOrigin('')
    setDestination('')
    setVehicle('')
    setRateBasis('per_trip')
    setAmount('')
    setEffectiveFrom('')
    setEffectiveTo('')
    setFormError(null)
  }

  const openPublish = () => {
    resetForm()
    setReviseOf(null)
    setShowForm(true)
  }

  const openRevise = (lane: Lane, row: TariffRow) => {
    setOrigin(lane.origin)
    setDestination(lane.destination)
    setVehicle(lane.vehicleType ?? '')
    setRateBasis(row.rate_basis)
    setAmount(String(row.rate_amount))
    setEffectiveFrom('')
    setEffectiveTo('')
    setFormError(null)
    setReviseOf({ laneTitle: `${lane.origin} → ${lane.destination}`, supersedesVersionId: lane.current?.id ?? null })
    setShowForm(true)
  }

  const closeForm = () => {
    if (busy) return
    setShowForm(false)
    setReviseOf(null)
  }

  const toggleHistory = (key: string) =>
    setOpenHistory((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]))

  // The amount input carries step/min, so browsers may block submit natively;
  // surface the two-decimal refusal inline as the amount is typed.
  const handleAmountChange = (value: string) => {
    setAmount(value)
    const trimmed = value.trim()
    if (/^\d+(\.\d+)?$/.test(trimmed) && !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      setFormError('Rate amount must have at most two decimal places.')
    } else if (formError === 'Rate amount must have at most two decimal places.') {
      setFormError(null)
    }
  }

  // Plain input checks with the server's own wording; the database stays the authority.
  const validate = (): string | null => {
    if (!origin.trim() || !destination.trim()) return 'Lane origin and destination are required.'
    const value = amount.trim()
    if (!/^\d+(\.\d+)?$/.test(value)) return 'Enter the rate amount as a number.'
    if (Number(value) <= 0) return 'Rate amount must be greater than zero.'
    if (!/^\d+(\.\d{1,2})?$/.test(value)) return 'Rate amount must have at most two decimal places.'
    if (!effectiveFrom) return 'Effective start is required.'
    if (effectiveTo && effectiveTo <= effectiveFrom) return 'Effective end must be after effective start.'
    return null
  }

  const handlePublish = async (event: FormEvent) => {
    event.preventDefault()
    const invalid = validate()
    if (invalid) {
      setFormError(invalid)
      return
    }
    if (!publishKey.current) publishKey.current = crypto.randomUUID()
    setBusy(true)
    setFormError(null)
    try {
      const result = await agencyTariffApi.publish({
        agreementId: agreementId ?? '',
        origin: origin.trim(),
        destination: destination.trim(),
        vehicleType: vehicle || null,
        rateBasis,
        rateAmount: Number(amount),
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        supersedesVersionId: reviseOf?.supersedesVersionId ?? null,
        idempotencyKey: publishKey.current,
      })
      if (!result.ok) {
        toast.error(result.message)
        if (result.error === 'idempotency_key_reused') publishKey.current = null
        setFormError(result.message)
        // A single refetch in every outcome; never an automatic retry.
        await fetchData()
        return
      }
      toast.success('Rate published')
      publishKey.current = null
      setShowForm(false)
      setReviseOf(null)
      resetForm()
      await fetchData()
    } catch (e) {
      logger.error('[AgencyTariffsPage] publish failed:', e)
      toast.error(toUserFacingErrorMessage(e, 'Failed to publish rate'))
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="tariffs-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading rates…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="tariffs-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">Only the agency owner can manage rates</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the owner of your agency to publish or revise rates for this client.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Tariffs</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Rate versions for {clientName}. Older versions lock automatically when a newer one takes effect.
          </p>
        </div>
        <button
          onClick={openPublish}
          className={`flex items-center gap-2 min-h-[44px] bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-semibold ${FOCUS_RING}`}
        >
          <Plus size={16} aria-hidden="true" /> Publish rate
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button onClick={() => { setLoading(true); fetchData() }} className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}>
            Retry
          </button>
        </div>
      )}

      {agreement && agreement.status !== 'active' && (
        <div role="note" data-testid="tariffs-inactive" className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <ShieldAlert size={16} aria-hidden="true" /> {INACTIVE_MESSAGE}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        {[
          ['Current lanes', currentLanes.length],
          ['Upcoming versions', upcomingCount],
          ['Past versions', pastCount],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-xs text-slate-600">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} aria-hidden="true" />
          <label htmlFor="tariff-search" className="sr-only">Search lanes</label>
          <input
            id="tariff-search"
            name="tariff-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search origin, destination or vehicle"
            className={`w-full min-h-[44px] rounded-xl border border-slate-300 pl-9 pr-3 ${FOCUS_RING}`}
          />
        </div>
        <div>
          <label htmlFor="tariff-vehicle-filter" className="block text-xs font-medium text-slate-600">Vehicle</label>
          <select
            id="tariff-vehicle-filter"
            name="tariff-vehicle-filter"
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className={`mt-1 min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
          >
            <option value="">All vehicles</option>
            {vehicleCodes.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </div>
        <div role="group" aria-label="Filter versions" className="flex flex-wrap gap-2">
          {([
            ['current', `Current (${currentLanes.length})`],
            ['upcoming', `Upcoming (${upcomingCount})`],
            ['past', `Past (${pastCount})`],
          ] as ReadonlyArray<[VersionChip, string]>).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setChip(value)}
              aria-pressed={chip === value}
              className={`min-h-[44px] rounded-full border px-4 text-sm font-semibold ${
                chip === value ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-slate-700'
              } ${FOCUS_RING}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div data-testid="tariffs-empty" className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">No rates yet. Publish the first rate for this client.</p>
        </div>
      ) : visibleLanes.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          No rates match your filters.
        </p>
      ) : (
        visibleLanes.map((lane, index) => (
          <section key={lane.key} data-testid="tariff-lane" aria-labelledby={`tariff-lane-${index}`} className="rounded-2xl border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
              <div>
                <h2 id={`tariff-lane-${index}`} className="text-base font-bold text-slate-900">
                  {lane.origin} → {lane.destination}
                </h2>
                <p className="text-xs text-slate-600">{vehicleLabel(lane.vehicleType)}</p>
              </div>
              <button
                onClick={() => toggleHistory(lane.key)}
                aria-expanded={openHistory.includes(lane.key)}
                className={`flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold ${FOCUS_RING}`}
              >
                <History size={14} aria-hidden="true" /> {openHistory.includes(lane.key) ? 'Hide history' : 'View history'}
              </button>
            </div>
            <ul className="divide-y divide-slate-100 p-2">
              {(chip === 'current'
                ? lane.current
                  ? [lane.current]
                  : []
                : chip === 'upcoming'
                  ? lane.upcoming
                  : lane.past
              ).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-2 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-xs font-semibold text-indigo-900">
                        {BASIS_LABEL[row.rate_basis] ?? row.rate_basis}
                      </span>
                      <span className="text-xs font-semibold text-slate-600">v{row.version_no}</span>
                      {chip === 'past' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                          <Lock size={12} aria-hidden="true" /> Superseded
                        </span>
                      )}
                      {chip === 'upcoming' && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-900">
                          <CalendarClock size={12} aria-hidden="true" /> Upcoming
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {chip === 'upcoming' ? `Starts ${formatDay(row.effective_from)}` : `Effective ${formatDay(row.effective_from)}`}
                      {row.effective_to ? ` – ${formatDay(row.effective_to)}` : ' onwards'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-right text-base font-bold text-slate-900">
                      <span className="tabular-nums">{money.format(row.rate_amount)}</span>{' '}
                      <span className="text-xs font-medium text-slate-600">{BASIS_SUFFIX[row.rate_basis] ?? row.rate_basis}</span>
                    </p>
                    {chip !== 'past' && (
                      <button
                        onClick={() => openRevise(lane, row)}
                        className={`flex items-center gap-1 min-h-[44px] rounded-xl border border-slate-300 px-3 text-sm font-semibold ${FOCUS_RING}`}
                      >
                        <RefreshCw size={14} aria-hidden="true" /> Revise rate
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {openHistory.includes(lane.key) && (
              <div data-testid="tariff-history" className="border-t border-slate-100 px-4 py-3">
                <h3 className="text-sm font-bold text-slate-900">Version history</h3>
                <ol className="mt-2 space-y-2">
                  {[...lane.versions].reverse().map((row) => {
                    const isCurrent = lane.current?.id === row.id
                    return (
                      <li
                        key={row.id}
                        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                          isCurrent ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-slate-50'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                          {isCurrent ? (
                            <Check size={14} className="text-emerald-700" aria-hidden="true" />
                          ) : (
                            <Lock size={14} className="text-slate-500" aria-hidden="true" />
                          )}
                          v{row.version_no}
                          <span className={isCurrent ? 'text-emerald-800' : 'text-slate-600'}>
                            {isCurrent ? 'Current' : 'Superseded'}
                          </span>
                        </span>
                        <span className="text-sm text-slate-700 tabular-nums">
                          {money.format(row.rate_amount)} {BASIS_SUFFIX[row.rate_basis] ?? row.rate_basis}
                        </span>
                        <span className="text-xs text-slate-600">
                          {formatDay(row.effective_from)} – {row.effective_to ? formatDay(row.effective_to) : 'ongoing'}
                        </span>
                      </li>
                    )
                  })}
                </ol>
              </div>
            )}
          </section>
        ))
      )}

      {showForm && (
        <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={closeForm}>
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="tariff-form-title"
            onSubmit={handlePublish}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && closeForm()}
            className="h-full w-full max-w-md space-y-4 overflow-y-auto bg-white p-6 shadow-xl"
          >
            <h2 id="tariff-form-title" className="text-lg font-bold text-slate-900">
              {reviseOf ? `Revise rate — ${reviseOf.laneTitle}` : 'Publish rate'}
            </h2>
            {reviseOf && (
              <p className="text-sm text-slate-600">
                The current version stays in force until the revised rate takes effect.
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tariff-origin" className="block text-sm font-medium text-slate-800">Origin</label>
                <input
                  id="tariff-origin"
                  name="tariff-origin"
                  type="text"
                  required
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                />
              </div>
              <div>
                <label htmlFor="tariff-destination" className="block text-sm font-medium text-slate-800">Destination</label>
                <input
                  id="tariff-destination"
                  name="tariff-destination"
                  type="text"
                  required
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                />
              </div>
            </div>
            <div>
              <label htmlFor="tariff-vehicle" className="block text-sm font-medium text-slate-800">Vehicle type</label>
              <select
                id="tariff-vehicle"
                name="tariff-vehicle"
                value={vehicle}
                onChange={(e) => setVehicle(e.target.value)}
                className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
              >
                <option value="">Any vehicle</option>
                {vehicleCodes.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tariff-basis" className="block text-sm font-medium text-slate-800">Rate basis</label>
                <select
                  id="tariff-basis"
                  name="tariff-basis"
                  value={rateBasis}
                  onChange={(e) => setRateBasis(e.target.value as RateBasis)}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                >
                  {RATE_BASES.map((b) => (
                    <option key={b.value} value={b.value}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="tariff-amount" className="block text-sm font-medium text-slate-800">Amount (₹)</label>
                <input
                  id="tariff-amount"
                  name="tariff-amount"
                  type="number"
                  step={0.01}
                  min={0.01}
                  required
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="tariff-from" className="block text-sm font-medium text-slate-800">Effective from</label>
                <input
                  id="tariff-from"
                  name="tariff-from"
                  type="date"
                  required
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                />
              </div>
              <div>
                <label htmlFor="tariff-to" className="block text-sm font-medium text-slate-800">Effective to (optional)</label>
                <input
                  id="tariff-to"
                  name="tariff-to"
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  className={`mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3 ${FOCUS_RING}`}
                />
              </div>
            </div>
            <p className="text-xs text-slate-600">Rates exclude GST. GST is added at invoicing.</p>
            {formError && (
              <p role="alert" data-testid="tariff-form-error" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
                {formError}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={`min-h-[44px] flex-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}>
                {busy ? 'Publishing…' : 'Publish rate'}
              </button>
              <button type="button" onClick={closeForm} className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold ${FOCUS_RING}`}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
