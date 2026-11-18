import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, RefreshCw, ShieldAlert, Truck as TruckIcon, Wand2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import { subscriptionInfoFromError } from '../lib/subscriptionGuard'
import type { SubscriptionErrorInfo } from '../lib/billingState'
import { vehicleTypeLabel } from '../lib/vehicleLabels'
import { SubscriptionLimitPrompt, useBillingGate } from '../components/billing/BillingGate'
import {
  agencyLoadPlansApi,
  describeProblem,
  type DraftOrderRow,
  type OrderLineRow,
  type PlanDetail,
  type PlanProblem,
  type PlanRow,
  type PlanStatus,
  type TruckRow,
} from '../services/agencyLoadPlansApi'
import {
  planLoads,
  type OrderLine as PlannerLine,
  type PlannedLoad,
  type Truck as PlannerTruck,
  type UnmetLine,
  type UnmetReason,
} from '../lib/loadPlanner'

// TO-145 Load Plan and Approval. Pick draft orders and available trucks, propose a plan
// locally with planLoads, name and save it as a draft, then approve (superseding the
// earlier approved plan of the same name) or cancel. The database re-validates every
// save and approval; this page only explains the typed refusals in plain language.
// Volume is not planned: the server checks weight only, so no volume is sent to the planner.

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const STATUS_STYLE: Record<PlanStatus, { label: string; tone: string }> = {
  draft: { label: 'Draft', tone: 'bg-slate-100 text-slate-800 border-slate-300' },
  approved: { label: 'Approved', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  superseded: { label: 'Superseded', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  cancelled: { label: 'Cancelled', tone: 'bg-red-50 text-red-800 border-red-300' },
}

const UNMET_TEXT: Record<UnmetReason, string> = {
  too_heavy: 'Heavier than any selected truck can carry',
  no_truck: 'No free truck was left for this route',
}

const kg = (n: number) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
}

/** Weight of a whole order line; mirrors the server rule (agency_load_plan_weight). */
function lineWeightKg(line: OrderLineRow): number | null {
  if (line.weight_per_unit_kg !== null) return line.quantity * line.weight_per_unit_kg
  if (line.unit === 'kg') return line.quantity
  if (line.unit === 'tonne') return line.quantity * 1000
  return null
}

const truckLabel = (t: TruckRow) => `${vehicleTypeLabel(t.vehicle_type)} · ${t.rc_number}`

function truckIneligibleReason(t: TruckRow): string | null {
  if (t.maintenance_blocked) return 'Blocked for maintenance'
  if (t.is_available === false) return 'Marked unavailable'
  if (t.payload_kg === null || t.payload_kg <= 0) return 'No payload set'
  return null
}

// Site names are not loaded on this page, so a site id never shows as text.
const siteLabel = (id: string | null) => (id ? 'Unnamed site' : 'No site set')

interface Proposal {
  id: number
  loads: PlannedLoad[]
  unmet: UnmetLine[]
  skipped: OrderLineRow[]
}

interface Loaded {
  orders: DraftOrderRow[]
  lines: OrderLineRow[]
  trucks: TruckRow[]
  plans: PlanRow[]
}

interface PlanNotice {
  id: string
  text: string
  problems: PlanProblem[]
  staleLineIds: string[]
  stale: boolean
}

function StatusChip({ status }: { status: PlanStatus }) {
  const { label, tone } = STATUS_STYLE[status]
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{label}</span>
  )
}

function CapacityMeter({ pct, label }: { pct: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const tone = pct >= 95 ? 'bg-amber-600' : 'bg-indigo-600'
  return (
    <div className="space-y-1">
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        aria-valuetext={`${pct}% full`}
        className="h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className={`h-full ${tone}`} style={{ width: `${clamped}%` }} />
      </div>
      <p className="text-xs font-medium text-slate-800">{pct}% full</p>
    </div>
  )
}

export default function AgencyLoadPlanPage() {
  useEffect(() => {
    document.title = 'Load plan - TruckOpti'
  }, [])

  const [orders, setOrders] = useState<DraftOrderRow[]>([])
  const [lines, setLines] = useState<OrderLineRow[]>([])
  const [trucks, setTrucks] = useState<TruckRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const [pickedOrders, setPickedOrders] = useState<Set<string>>(new Set())
  const [pickedTrucks, setPickedTrucks] = useState<Set<string>>(new Set())
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const proposalCounter = useRef(0)
  const [pickMessage, setPickMessage] = useState<string | null>(null)

  const [planName, setPlanName] = useState('')
  const [saveMessage, setSaveMessage] = useState<{ text: string; problems: PlanProblem[] } | null>(null)

  // One idempotency key per intent (one save of one proposal under one name). A failed
  // request is retried with the same key; a completed one (success or typed refusal)
  // starts a new intent next time.
  const keys = useRef<Map<string, string>>(new Map())
  const keyFor = (intent: string) => {
    let key = keys.current.get(intent)
    if (!key) {
      key = crypto.randomUUID()
      keys.current.set(intent, key)
    }
    return key
  }

  const gate = useBillingGate()
  const [limitInfo, setLimitInfo] = useState<SubscriptionErrorInfo | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<{ id: string; kind: 'approve' | 'cancel' } | null>(null)
  const [notice, setNotice] = useState<PlanNotice | null>(null)

  const [openDetail, setOpenDetail] = useState<string | null>(null)
  const [detail, setDetail] = useState<PlanDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  const fetchAll = useCallback(async (): Promise<Loaded | null> => {
    try {
      setError(null)
      const [o, t, p] = await Promise.all([
        agencyLoadPlansApi.listDraftOrders(),
        agencyLoadPlansApi.listTrucks(),
        agencyLoadPlansApi.listPlans(),
      ])
      const l = await agencyLoadPlansApi.listOrderLines(o.map((x) => x.id))
      setOrders(o)
      setTrucks(t)
      setPlans(p)
      setLines(l)
      setDenied(false)
      return { orders: o, lines: l, trucks: t, plans: p }
    } catch (e) {
      logger.error('[AgencyLoadPlanPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load the load plan screen')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const fetchDetail = useCallback(async (planId: string) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      setDetail(await agencyLoadPlansApi.getPlanDetail(planId))
    } catch (e) {
      logger.error('[AgencyLoadPlanPage] detail load failed:', e)
      setDetailError(toUserFacingErrorMessage(e, 'Failed to load plan details'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const truckById = useMemo(() => new Map(trucks.map((t) => [t.id, t])), [trucks])
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const lineById = useMemo(() => new Map(lines.map((l) => [l.id, l])), [lines])
  const linesByOrder = useMemo(() => {
    const map = new Map<string, OrderLineRow[]>()
    for (const l of lines) map.set(l.order_id, [...(map.get(l.order_id) ?? []), l])
    return map
  }, [lines])

  const lineName = useCallback(
    (lineId: string) => {
      const l = lineById.get(lineId)
      if (!l) return 'An order line'
      return `Order ${orderById.get(l.order_id)?.client_order_ref ?? 'unknown'} line ${l.line_no}`
    },
    [lineById, orderById]
  )

  // Runs the local planner for the given picks against the given data.
  const buildProposal = (data: Loaded, orderIds: Set<string>, truckIds: Set<string>): Proposal => {
    const plannerLines: PlannerLine[] = []
    const skipped: OrderLineRow[] = []
    for (const l of data.lines) {
      if (!orderIds.has(l.order_id)) continue
      const weight = lineWeightKg(l)
      if (weight === null) {
        skipped.push(l)
        continue
      }
      plannerLines.push({
        orderId: l.order_id,
        lineNo: l.line_no,
        weightKg: weight,
        pickupSite: l.pickup_site_id ?? '',
        dropSite: l.drop_site_id ?? '',
        pickupTo: l.pickup_to,
        stackable: l.stackable,
        fragile: l.fragile,
      })
    }
    const plannerTrucks: PlannerTruck[] = data.trucks
      .filter((t) => truckIds.has(t.id) && truckIneligibleReason(t) === null)
      .map((t) => ({ truckId: t.id, label: truckLabel(t), capacityKg: t.payload_kg ?? 0, available: true }))
    const result = planLoads(plannerLines, plannerTrucks)
    proposalCounter.current += 1
    return { id: proposalCounter.current, loads: result.loads, unmet: result.unmet, skipped }
  }

  const runPropose = (data: Loaded, orderIds: Set<string>, truckIds: Set<string>) => {
    setSaveMessage(null)
    if (orderIds.size === 0 || truckIds.size === 0) {
      setProposal(null)
      setPickMessage('Pick at least one draft order and one available truck first.')
      return
    }
    setPickMessage(null)
    setProposal(buildProposal(data, orderIds, truckIds))
  }

  const toggle = (set: Set<string>, id: string, apply: (next: Set<string>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    apply(next)
    // A proposal belongs to the picks it was made from.
    setProposal(null)
    setSaveMessage(null)
    setPickMessage(null)
  }

  const findLine = (orderId: string, lineNo: number) =>
    (linesByOrder.get(orderId) ?? []).find((l) => l.line_no === lineNo)

  const handleSave = async () => {
    if (!proposal) return
    const name = planName.trim()
    if (name.length < 1 || name.length > 80) {
      setSaveMessage({ text: 'Give the plan a name of 1 to 80 characters.', problems: [] })
      return
    }
    const intent = `save:${proposal.id}:${name}`
    setBusy(intent)
    setSaveMessage(null)
    setLimitInfo(null)
    try {
      const result = await agencyLoadPlansApi.savePlan({
        name,
        idempotencyKey: keyFor(intent),
        loads: proposal.loads.map((load) => ({
          truckId: load.truckId,
          lines: load.lines.flatMap((pl) => {
            const row = findLine(pl.orderId, pl.lineNo)
            return row ? [{ orderLineId: row.id, quantity: row.quantity }] : []
          }),
        })),
        unmet: proposal.unmet.flatMap((u) => {
          const row = findLine(u.orderId, u.lineNo)
          return row ? [{ orderLineId: row.id, reason: u.reason }] : []
        }),
      })
      keys.current.delete(intent)
      if (result.ok) {
        toast.success(
          result.replay ? `Plan "${name}" was already saved` : `Plan "${name}" saved as draft version ${result.planVersion}`
        )
        setProposal(null)
        setPlanName('')
      } else {
        setSaveMessage({ text: result.message, problems: result.problems })
        toast.error(result.message)
      }
      await fetchAll()
    } catch (e) {
      logger.error('[AgencyLoadPlanPage] save failed:', e)
      const limit = subscriptionInfoFromError(e)
      if (limit) {
        setLimitInfo(limit)
        return
      }
      const message = toUserFacingErrorMessage(e, 'Failed to save the plan')
      setSaveMessage({ text: message, problems: [] })
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const handleTransition = async (plan: PlanRow, kind: 'approve' | 'cancel') => {
    const intent = `${kind}:${plan.id}:${plan.version}`
    setBusy(intent)
    setNotice(null)
    setLimitInfo(null)
    try {
      const result =
        kind === 'approve'
          ? await agencyLoadPlansApi.approvePlan(plan.id, plan.version)
          : await agencyLoadPlansApi.cancelPlan(plan.id, plan.version)
      setConfirm(null)
      if (result.ok) {
        toast.success(kind === 'approve' ? `Plan "${plan.name}" approved` : `Plan "${plan.name}" cancelled`)
      } else {
        setNotice({
          id: plan.id,
          text: result.message,
          problems: result.problems,
          staleLineIds: result.orderLineIds,
          stale: result.error === 'stale_plan',
        })
        toast.error(result.message)
      }
      await fetchAll()
      if (openDetail === plan.id) await fetchDetail(plan.id)
    } catch (e) {
      logger.error('[AgencyLoadPlanPage] transition failed:', e)
      const limit = subscriptionInfoFromError(e)
      if (limit) {
        setConfirm(null)
        setLimitInfo(limit)
        return
      }
      const message = toUserFacingErrorMessage(e, kind === 'approve' ? 'Failed to approve the plan' : 'Failed to cancel the plan')
      setNotice({ id: plan.id, text: message, problems: [], staleLineIds: [], stale: false })
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const handleRepropose = async () => {
    setNotice(null)
    setConfirm(null)
    const data = await fetchAll()
    if (!data) return
    const stillOrders = new Set([...pickedOrders].filter((id) => data.orders.some((o) => o.id === id)))
    const stillTrucks = new Set([...pickedTrucks].filter((id) => data.trucks.some((t) => t.id === id)))
    setPickedOrders(stillOrders)
    setPickedTrucks(stillTrucks)
    runPropose(data, stillOrders, stillTrucks)
    document.getElementById('plan-pick')?.scrollIntoView?.({ behavior: 'smooth' })
  }

  const toggleDetail = (id: string) => {
    if (openDetail === id) {
      setOpenDetail(null)
      return
    }
    setOpenDetail(id)
    setDetail(null)
    fetchDetail(id)
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="loadplan-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading load plans…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="loadplan-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to load plans</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for dispatcher access.</p>
        </div>
      </div>
    )
  }

  const approvedByName = (plan: PlanRow) =>
    plans.find((p) => p.name === plan.name && p.status === 'approved' && p.id !== plan.id)

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Load plan and approval</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Pick draft orders and trucks, propose how the lines fit on each truck, then save, approve or cancel the plan.
        </p>
      </div>

      {limitInfo && <SubscriptionLimitPrompt info={limitInfo} onDismiss={() => setLimitInfo(null)} />}

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <span>{error}</span>
          <button
            type="button"
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

      <section id="plan-pick" aria-labelledby="lp-orders" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="loadplan-orders">
        <h2 id="lp-orders" className="text-base font-bold text-slate-900">1. Draft orders to plan</h2>
        {orders.length === 0 ? (
          <p data-testid="loadplan-no-orders" className="text-sm text-slate-700">
            There are no draft orders. Import orders first, then come back to plan them.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {orders.map((o) => {
              const count = (linesByOrder.get(o.id) ?? []).length
              return (
                <li key={o.id} data-testid={`loadplan-order-${o.id}`}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={pickedOrders.has(o.id)}
                      onChange={() => toggle(pickedOrders, o.id, setPickedOrders)}
                      className={`h-5 w-5 rounded border-slate-400 ${FOCUS_RING}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900 break-words">{o.client_order_ref}</span>
                      <span className="block text-xs text-slate-600">
                        {count} {count === 1 ? 'line' : 'lines'} · created {formatWhen(o.created_at)}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="lp-trucks" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="loadplan-trucks">
        <h2 id="lp-trucks" className="text-base font-bold text-slate-900">2. Trucks to use</h2>
        {trucks.length === 0 ? (
          <p data-testid="loadplan-no-trucks" className="text-sm text-slate-700">
            There are no trucks yet. Add trucks to your fleet first.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {trucks.map((t) => {
              const reason = truckIneligibleReason(t)
              return (
                <li key={t.id} data-testid={`loadplan-truck-${t.id}`}>
                  <label className={`flex min-h-[44px] items-center gap-3 py-2 ${reason ? 'opacity-70' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={pickedTrucks.has(t.id)}
                      disabled={reason !== null}
                      onChange={() => toggle(pickedTrucks, t.id, setPickedTrucks)}
                      className={`h-5 w-5 rounded border-slate-400 ${FOCUS_RING}`}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-900 break-words">{truckLabel(t)}</span>
                      <span className="block text-xs text-slate-600">
                        {reason ?? `Carries ${kg(t.payload_kg ?? 0)}`}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => runPropose({ orders, lines, trucks, plans }, pickedOrders, pickedTrucks)}
            disabled={busy !== null}
            className={`flex min-h-[44px] w-full items-center justify-center gap-1 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`}
          >
            <Wand2 size={16} aria-hidden="true" />
            Propose plan
          </button>
          {pickMessage && (
            <p role="alert" data-testid="loadplan-pick-message" className="text-sm text-amber-900">{pickMessage}</p>
          )}
        </div>
      </section>

      {proposal && (
        <section aria-labelledby="lp-proposal" className="rounded-2xl border border-indigo-200 bg-white p-4 space-y-4" data-testid="loadplan-proposal">
          <h2 id="lp-proposal" className="text-base font-bold text-slate-900">3. Proposed plan</h2>

          {proposal.loads.length === 0 ? (
            <p data-testid="loadplan-no-loads" className="text-sm text-slate-700">
              No load could be made from these picks. Check the unplaced lines below, or pick more trucks.
            </p>
          ) : (
            <ul className="space-y-3">
              {proposal.loads.map((load, i) => {
                const truck = truckById.get(load.truckId)
                return (
                  <li key={load.truckId} data-testid={`loadplan-load-${load.truckId}`} className="space-y-2 rounded-xl border border-slate-200 p-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <p className="flex items-center gap-2 font-semibold text-slate-900 break-words">
                        <TruckIcon size={16} aria-hidden="true" />
                        Load {i + 1}: {truck ? truckLabel(truck) : 'Truck'}
                      </p>
                      <p className="text-sm text-slate-800">
                        {kg(load.totalKg)} of {kg(truck?.payload_kg ?? 0)}
                      </p>
                    </div>
                    <p className="text-xs text-slate-600 break-words">
                      {siteLabel(load.pickupSite || null)} to {siteLabel(load.dropSite || null)}
                    </p>
                    <CapacityMeter pct={load.utilizationPct} label={`Load ${i + 1} capacity used`} />
                    <ul className="divide-y divide-slate-100 text-sm">
                      {load.lines.map((pl) => (
                        <li key={`${pl.orderId}-${pl.lineNo}`} className="flex justify-between gap-3 py-1">
                          <span className="min-w-0 break-words text-slate-900">
                            Order {orderById.get(pl.orderId)?.client_order_ref ?? 'unknown'} line {pl.lineNo}
                          </span>
                          <span className="shrink-0 text-slate-700">{kg(pl.weightKg)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                )
              })}
            </ul>
          )}

          {(proposal.unmet.length > 0 || proposal.skipped.length > 0) && (
            <div data-testid="loadplan-unmet" className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <h3 className="text-sm font-bold text-amber-900">Not placed on any truck</h3>
              <ul className="space-y-1 text-sm text-amber-900">
                {proposal.unmet.map((u) => (
                  <li key={`${u.orderId}-${u.lineNo}`}>
                    Order {orderById.get(u.orderId)?.client_order_ref ?? 'unknown'} line {u.lineNo}: {UNMET_TEXT[u.reason]}.
                  </li>
                ))}
                {proposal.skipped.map((l) => (
                  <li key={l.id}>
                    Order {orderById.get(l.order_id)?.client_order_ref ?? 'unknown'} line {l.line_no}: no weight is known, so it
                    was left out. Add a weight per unit to include it.
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-900">Lines left out are saved with the plan as unmet demand.</p>
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="plan-name" className="block text-sm font-medium text-slate-900">
              Plan name <span className="font-normal text-slate-700">(up to 80 characters)</span>
            </label>
            <input
              id="plan-name"
              type="text"
              value={planName}
              maxLength={80}
              onChange={(e) => setPlanName(e.target.value)}
              aria-describedby="plan-name-hint"
              className={`min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm ${FOCUS_RING}`}
            />
            <p id="plan-name-hint" className="text-xs text-slate-600">
              Saving a name that already exists creates the next version of that plan.
            </p>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy !== null || proposal.loads.length === 0 || planName.trim() === '' || !gate.canWrite}
              title={gate.writeTitle}
              className={`min-h-[44px] w-full rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`}
            >
              {busy?.startsWith('save:') ? 'Saving…' : 'Save draft'}
            </button>
            {saveMessage && (
              <div role="alert" data-testid="loadplan-save-message" className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <p>{saveMessage.text}</p>
                {saveMessage.problems.length > 0 && (
                  <ul className="list-disc pl-5">
                    {saveMessage.problems.map((p, i) => (
                      <li key={i}>{describeProblem(p)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="lp-plans" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="loadplan-list">
        <h2 id="lp-plans" className="text-base font-bold text-slate-900">Saved plans</h2>
        {plans.length === 0 ? (
          <p data-testid="loadplan-empty" className="text-sm text-slate-700">No plan has been saved yet.</p>
        ) : (
          <ul className="space-y-3">
            {plans.map((p) => {
              const prior = approvedByName(p)
              const confirming = confirm?.id === p.id ? confirm.kind : null
              const planNotice = notice?.id === p.id ? notice : null
              return (
                <li key={p.id} data-testid={`loadplan-plan-${p.id}`} className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 break-words">
                        {p.name} <span className="font-normal text-slate-700">· Version {p.plan_version}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        Saved {formatWhen(p.created_at)}
                        {p.approved_at ? ` · approved ${formatWhen(p.approved_at)}` : ''}
                      </p>
                    </div>
                    <StatusChip status={p.status} />
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {p.status === 'draft' && (
                      <button
                        type="button"
                        onClick={() => setConfirm({ id: p.id, kind: 'approve' })}
                        disabled={busy !== null || !gate.canDispatch}
                        title={gate.dispatchTitle}
                        aria-label={`Approve ${p.name} version ${p.plan_version}`}
                        className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" /> Approve
                      </button>
                    )}
                    {(p.status === 'draft' || p.status === 'approved') && (
                      <button
                        type="button"
                        onClick={() => setConfirm({ id: p.id, kind: 'cancel' })}
                        disabled={busy !== null}
                        aria-label={`Cancel ${p.name} version ${p.plan_version}`}
                        className={`min-h-[44px] rounded-xl border border-red-300 px-4 text-sm font-semibold text-red-800 disabled:opacity-60 ${FOCUS_RING}`}
                      >
                        Cancel plan
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleDetail(p.id)}
                      aria-expanded={openDetail === p.id}
                      className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                    >
                      {openDetail === p.id ? 'Hide loads' : 'Show loads'}
                    </button>
                  </div>

                  {confirming === 'approve' && (
                    <div
                      role="group"
                      aria-label={`Confirm approval of ${p.name}`}
                      data-testid={`loadplan-confirm-${p.id}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setConfirm(null)
                      }}
                      className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                    >
                      <p className="text-sm text-slate-900">
                        {prior
                          ? `Approving version ${p.plan_version} of "${p.name}" supersedes the earlier approved plan of the same name (version ${prior.plan_version}). That plan will no longer be in force.`
                          : `Approve version ${p.plan_version} of "${p.name}"? No earlier approved plan of this name will be replaced.`}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleTransition(p, 'approve')}
                          disabled={busy !== null}
                          autoFocus
                          className={`min-h-[44px] rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                        >
                          {busy === `approve:${p.id}:${p.version}` ? 'Approving…' : 'Confirm approval'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm(null)}
                          disabled={busy !== null}
                          className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                        >
                          Not yet
                        </button>
                      </div>
                    </div>
                  )}

                  {confirming === 'cancel' && (
                    <div
                      role="group"
                      aria-label={`Confirm cancelling ${p.name}`}
                      data-testid={`loadplan-confirm-${p.id}`}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setConfirm(null)
                      }}
                      className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3"
                    >
                      <p className="text-sm text-slate-900">
                        Cancel version {p.plan_version} of &quot;{p.name}&quot;? A cancelled plan cannot be approved again.
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleTransition(p, 'cancel')}
                          disabled={busy !== null}
                          autoFocus
                          className={`min-h-[44px] rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                        >
                          {busy === `cancel:${p.id}:${p.version}` ? 'Cancelling…' : 'Confirm cancel'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirm(null)}
                          disabled={busy !== null}
                          className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                        >
                          Keep plan
                        </button>
                      </div>
                    </div>
                  )}

                  {planNotice && (
                    <div role="alert" data-testid={`loadplan-notice-${p.id}`} className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      <p>{planNotice.text}</p>
                      {planNotice.staleLineIds.length > 0 && (
                        <div>
                          <p className="font-semibold">Order lines that need attention</p>
                          <ul className="list-disc pl-5" data-testid={`loadplan-stale-lines-${p.id}`}>
                            {planNotice.staleLineIds.map((id) => (
                              <li key={id}>{lineName(id)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {planNotice.problems.length > 0 && (
                        <ul className="list-disc pl-5">
                          {planNotice.problems.map((pr, i) => (
                            <li key={i}>{describeProblem(pr)}</li>
                          ))}
                        </ul>
                      )}
                      {planNotice.stale && (
                        <button
                          type="button"
                          onClick={handleRepropose}
                          disabled={busy !== null}
                          className={`min-h-[44px] rounded-xl border border-red-300 bg-white px-4 font-semibold ${FOCUS_RING}`}
                        >
                          Refresh and propose again
                        </button>
                      )}
                    </div>
                  )}

                  {openDetail === p.id && (
                    <div data-testid={`loadplan-detail-${p.id}`} className="rounded-xl border border-slate-200 p-3 space-y-2">
                      {detailError && (
                        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800">
                          <span>{detailError}</span>
                          <button
                            type="button"
                            onClick={() => fetchDetail(p.id)}
                            className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
                          >
                            Retry
                          </button>
                        </div>
                      )}
                      {detailLoading ? (
                        <div role="status" aria-busy="true" className="py-2 text-center">
                          <RefreshCw className="mx-auto animate-spin text-indigo-600" size={20} aria-hidden="true" />
                          <span className="sr-only">Loading loads…</span>
                        </div>
                      ) : detail && detail.loads.length === 0 && detail.unmet.length === 0 ? (
                        <p className="text-sm text-slate-700">This plan has no loads.</p>
                      ) : (
                        detail && (
                          <>
                            <ul className="space-y-3">
                              {detail.loads.map((l) => {
                                const truck = truckById.get(l.truck_id)
                                return (
                                  <li key={l.id} className="space-y-1">
                                    <p className="text-sm font-medium text-slate-900 break-words">
                                      {truck ? truckLabel(truck) : 'Truck'} · {kg(l.total_kg)}
                                    </p>
                                    <CapacityMeter pct={l.utilization_pct} label={`${truck ? truckLabel(truck) : 'Truck'} capacity used`} />
                                    <ul className="text-xs text-slate-700">
                                      {detail.lines
                                        .filter((x) => x.load_id === l.id)
                                        .map((x) => (
                                          <li key={x.id} className="break-words">
                                            {lineById.has(x.order_line_id) ? lineName(x.order_line_id) : 'Order line not loaded'} · quantity {x.quantity}
                                          </li>
                                        ))}
                                    </ul>
                                  </li>
                                )
                              })}
                            </ul>
                            {detail.unmet.length > 0 && (
                              <div className="space-y-1 text-sm text-amber-900">
                                <p className="font-semibold">Not placed</p>
                                <ul className="list-disc pl-5">
                                  {detail.unmet.map((u) => (
                                    <li key={u.id}>
                                      {lineById.has(u.order_line_id) ? lineName(u.order_line_id) : 'Order line not loaded'}: {UNMET_TEXT[u.reason]}.
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </>
                        )
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
