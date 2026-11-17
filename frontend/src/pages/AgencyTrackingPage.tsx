import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, ExternalLink, MapPin, RefreshCw, ShieldAlert } from 'lucide-react'
import toast from 'react-hot-toast'
import { logger } from '../utils/logger'
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import {
  agencyTrackingApi,
  INCIDENT_KINDS,
  type ActiveJobRow,
  type IncidentKind,
  type IncidentRow,
  type IncidentStatus,
  type PingRow,
  type TripLive,
} from '../services/agencyTrackingApi'
import { estimateEta, isStalePing } from '../lib/trackingRules'

// TO-147 Trip tracking and incidents. Active jobs with the last ping time, a
// stale-ping badge, an ETA and the open incident count. Job detail lists the
// recent pings (latitude, longitude and a Google Maps link; no map library) and
// the incidents with acknowledge and resolve actions. The database owns the
// version check and the transition rules; resolving needs a 3 to 500 character
// note. ETA needs a destination, which jobs do not store yet, so the dispatcher
// can type the destination coordinates in the job detail (kept on this page only).

const FOCUS_RING =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

const DENIAL_MESSAGES = new Set([
  'Agency approval is required.',
  'Your access scope does not allow this action.',
  'Sign-in is required.',
])

const DEFAULT_SPEED_KMPH = 40

const JOB_STATUS_LABELS: Record<ActiveJobRow['status'], string> = {
  pending: 'Pending',
  accepted: 'Accepted',
  in_transit: 'In transit',
}

const KIND_LABELS: Record<IncidentKind, string> = {
  long_halt: 'Long halt',
  overspeed: 'Overspeed',
  route_deviation: 'Route deviation',
  breakdown: 'Breakdown',
  accident: 'Accident',
  other: 'Other',
}

const INCIDENT_STYLE: Record<IncidentStatus, { label: string; tone: string }> = {
  open: { label: 'Open', tone: 'bg-red-50 text-red-800 border-red-300' },
  acknowledged: { label: 'Acknowledged', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  resolved: { label: 'Resolved', tone: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
}

type LiveState = { kind: 'ok'; data: TripLive } | { kind: 'unavailable'; message: string }

function formatWhen(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function mapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

function incidentNote(details: Record<string, unknown>): string | null {
  const note = details?.note
  return typeof note === 'string' && note.trim() ? note : null
}

function parseCoord(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function Badge({ tone, children }: { tone: string; children: string }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>
}

export default function AgencyTrackingPage() {
  useEffect(() => {
    document.title = 'Trip tracking - TruckOpti'
  }, [])

  const [jobs, setJobs] = useState<ActiveJobRow[]>([])
  const [live, setLive] = useState<Map<string, LiveState>>(new Map())
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [denied, setDenied] = useState(false)

  const [selected, setSelected] = useState<string | null>(null)
  const [pings, setPings] = useState<PingRow[]>([])
  const [incidents, setIncidents] = useState<IncidentRow[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)

  // Destination per job (typed by the dispatcher) so an ETA can be estimated.
  const [dest, setDest] = useState<Record<string, { lat: string; lng: string }>>({})

  // One idempotency key per intent. A failed request is retried with the same
  // key; a completed one (success or typed refusal) starts a new intent next time.
  const keys = useRef<Map<string, string>>(new Map())
  const keyFor = (intent: string) => {
    let key = keys.current.get(intent)
    if (!key) {
      key = crypto.randomUUID()
      keys.current.set(intent, key)
    }
    return key
  }

  const [busy, setBusy] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [incidentMessage, setIncidentMessage] = useState<{ id: string; text: string } | null>(null)

  const [kind, setKind] = useState<IncidentKind>('breakdown')
  const [details, setDetails] = useState('')
  const [resolveFor, setResolveFor] = useState<string | null>(null)
  const [resolveNote, setResolveNote] = useState('')

  const fetchAll = useCallback(async () => {
    try {
      setError(null)
      const rows = await agencyTrackingApi.listActiveJobs()
      const results = await Promise.allSettled(rows.map((j) => agencyTrackingApi.getTripLive(j.id)))
      const next = new Map<string, LiveState>()
      let denial = false
      results.forEach((r, i) => {
        const id = rows[i].id
        if (r.status === 'fulfilled') {
          next.set(id, r.value.ok ? { kind: 'ok', data: r.value } : { kind: 'unavailable', message: r.value.message })
        } else {
          const message = toUserFacingErrorMessage(r.reason, 'Failed to load live trip data')
          if (DENIAL_MESSAGES.has(message)) denial = true
          next.set(id, { kind: 'unavailable', message })
        }
      })
      if (denial) {
        setDenied(true)
        return
      }
      setJobs(rows)
      setLive(next)
      setNowIso(new Date().toISOString())
      setDenied(false)
    } catch (e) {
      logger.error('[AgencyTrackingPage] load failed:', e)
      const message = toUserFacingErrorMessage(e, 'Failed to load active jobs')
      if (DENIAL_MESSAGES.has(message)) setDenied(true)
      else setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchDetail = useCallback(async (jobId: string) => {
    setDetailLoading(true)
    setDetailError(null)
    try {
      const [p, i] = await Promise.all([agencyTrackingApi.listPings(jobId), agencyTrackingApi.listIncidents(jobId)])
      setPings(p)
      setIncidents(i)
    } catch (e) {
      logger.error('[AgencyTrackingPage] detail load failed:', e)
      setDetailError(toUserFacingErrorMessage(e, 'Failed to load trip details'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  const selectedJob = useMemo(() => jobs.find((j) => j.id === selected) ?? null, [jobs, selected])

  const etaFor = (jobId: string, state: LiveState | undefined): string | null => {
    if (state?.kind !== 'ok' || !state.data.lastPing) return null
    const d = dest[jobId]
    if (!d) return null
    const lat = parseCoord(d.lat, -90, 90)
    const lng = parseCoord(d.lng, -180, 180)
    if (lat === null || lng === null) return null
    const speed = state.data.lastPing.speedKmph
    try {
      return estimateEta({
        currentLatLng: { lat: state.data.lastPing.lat, lng: state.data.lastPing.lng },
        destLatLng: { lat, lng },
        averageSpeedKmph: speed !== null && speed > 0 ? speed : DEFAULT_SPEED_KMPH,
        nowIso,
      })
    } catch {
      return null
    }
  }

  const staleFor = (state: LiveState | undefined): boolean => {
    if (state?.kind !== 'ok' || !state.data.lastPing) return false
    try {
      return isStalePing(state.data.lastPing.recordedAt, nowIso)
    } catch {
      return false
    }
  }

  const openDetail = (jobId: string) => {
    if (selected === jobId) {
      setSelected(null)
      return
    }
    setSelected(jobId)
    setPings([])
    setIncidents([])
    setFormMessage(null)
    setIncidentMessage(null)
    setResolveFor(null)
    setResolveNote('')
    fetchDetail(jobId)
  }

  const refreshAfterChange = async (jobId: string) => {
    await fetchAll()
    await fetchDetail(jobId)
  }

  const handleOpenIncident = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedJob) return
    const text = details.trim()
    if (text.length < 3 || text.length > 500) {
      setFormMessage('Describe what happened in 3 to 500 characters.')
      return
    }
    const intent = `open:${selectedJob.id}:${kind}:${text}`
    setBusy(intent)
    setFormMessage(null)
    try {
      const result = await agencyTrackingApi.openIncident({
        jobId: selectedJob.id,
        kind,
        details: { note: text },
        idempotencyKey: keyFor(intent),
      })
      keys.current.delete(intent)
      if (result.ok) {
        toast.success(result.replay ? 'This incident was already opened' : 'Incident opened')
        setDetails('')
      } else {
        setFormMessage(result.message)
        toast.error(result.message)
      }
      await refreshAfterChange(selectedJob.id)
    } catch (err) {
      logger.error('[AgencyTrackingPage] open incident failed:', err)
      const message = toUserFacingErrorMessage(err, 'Failed to open the incident')
      setFormMessage(message)
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  const handleUpdate = async (incident: IncidentRow, toStatus: 'acknowledged' | 'resolved', note?: string) => {
    if (!selectedJob) return
    if (toStatus === 'resolved') {
      const trimmed = (note ?? '').trim()
      if (trimmed.length < 3 || trimmed.length > 500) {
        setIncidentMessage({ id: incident.id, text: 'Add a resolution note of 3 to 500 characters.' })
        return
      }
    }
    const intent = `update:${incident.id}:${toStatus}:${incident.version}`
    setBusy(intent)
    setIncidentMessage(null)
    try {
      const result = await agencyTrackingApi.updateIncident({
        incidentId: incident.id,
        toStatus,
        expectedVersion: incident.version,
        note: toStatus === 'resolved' ? (note ?? '').trim() : null,
      })
      if (result.ok) {
        toast.success(toStatus === 'resolved' ? 'Incident resolved' : 'Incident acknowledged')
        setResolveFor(null)
        setResolveNote('')
      } else {
        setIncidentMessage({ id: incident.id, text: result.message })
        toast.error(result.message)
      }
      await refreshAfterChange(selectedJob.id)
    } catch (err) {
      logger.error('[AgencyTrackingPage] incident update failed:', err)
      const message = toUserFacingErrorMessage(err, 'Failed to update the incident')
      setIncidentMessage({ id: incident.id, text: message })
      toast.error(message)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div role="status" aria-busy="true" className="min-h-screen flex items-center justify-center" data-testid="tracking-loading">
        <RefreshCw className="animate-spin text-indigo-600" size={32} aria-hidden="true" />
        <span className="sr-only">Loading trip tracking…</span>
      </div>
    )
  }

  if (denied) {
    return (
      <div className="p-4 md:p-8 max-w-2xl mx-auto" data-testid="tracking-denied">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <ShieldAlert className="mx-auto text-amber-700" size={32} aria-hidden="true" />
          <h1 className="mt-3 text-lg font-bold text-slate-900">You do not have access to trip tracking</h1>
          <p className="mt-1 text-sm text-slate-700">Ask the agency owner for dispatcher or viewer access.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl md:max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Trip tracking and incidents</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          See where active trips last reported from, spot trips that have gone quiet, and handle incidents.
        </p>
      </div>

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

      <section aria-labelledby="trk-jobs" className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3" data-testid="tracking-jobs">
        <h2 id="trk-jobs" className="text-base font-bold text-slate-900">Active jobs</h2>
        {jobs.length === 0 ? (
          <p data-testid="tracking-empty" className="text-sm text-slate-700">
            No jobs are active right now. Jobs appear here while they are pending, accepted or in transit.
          </p>
        ) : (
          <ul className="space-y-3">
            {jobs.map((j) => {
              const state = live.get(j.id)
              const last = state?.kind === 'ok' ? state.data.lastPing : null
              const stale = staleFor(state)
              const eta = etaFor(j.id, state)
              const open = state?.kind === 'ok' ? state.data.openIncidents : null
              return (
                <li key={j.id} data-testid={`tracking-job-${j.id}`} className="rounded-xl border border-slate-200 p-3 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-slate-900 break-words">
                        Job {j.id.slice(0, 8)} · {JOB_STATUS_LABELS[j.status]}
                      </p>
                      {j.notes && <p className="text-xs text-slate-600 break-words">{j.notes}</p>}
                      <p className="text-sm text-slate-800" data-testid={`tracking-last-${j.id}`}>
                        {state?.kind === 'unavailable'
                          ? state.message
                          : last
                            ? `Last ping ${formatWhen(last.recordedAt)}`
                            : 'No location received yet'}
                      </p>
                      <p className="text-sm text-slate-800" data-testid={`tracking-eta-${j.id}`}>
                        {eta ? `ETA ${formatWhen(eta)}` : 'ETA: set a destination in details'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {state?.kind === 'ok' && !last && <Badge tone="bg-slate-100 text-slate-800 border-slate-300">No pings</Badge>}
                      {stale && <Badge tone="bg-amber-50 text-amber-900 border-amber-300">Stale ping</Badge>}
                      {last && !stale && <Badge tone="bg-emerald-50 text-emerald-800 border-emerald-200">Reporting</Badge>}
                      {open !== null && (
                        <Badge tone={open > 0 ? 'bg-red-50 text-red-800 border-red-300' : 'bg-slate-100 text-slate-800 border-slate-300'}>
                          {`${open} open ${open === 1 ? 'incident' : 'incidents'}`}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDetail(j.id)}
                    aria-expanded={selected === j.id}
                    aria-label={`${selected === j.id ? 'Hide' : 'View'} details for job ${j.id.slice(0, 8)}`}
                    className={`min-h-[44px] w-full rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 sm:w-auto ${FOCUS_RING}`}
                  >
                    {selected === j.id ? 'Hide details' : 'View details'}
                  </button>

                  {selected === j.id && selectedJob && (
                    <div data-testid={`tracking-detail-${j.id}`} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      {detailError && (
                        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-red-800">
                          <span>{detailError}</span>
                          <button
                            type="button"
                            onClick={() => fetchDetail(j.id)}
                            className={`min-h-[44px] rounded-xl border border-red-300 px-4 font-semibold ${FOCUS_RING}`}
                          >
                            Retry details
                          </button>
                        </div>
                      )}
                      {detailLoading ? (
                        <div role="status" aria-busy="true" className="py-2 text-center" data-testid="tracking-detail-loading">
                          <RefreshCw className="mx-auto animate-spin text-indigo-600" size={20} aria-hidden="true" />
                          <span className="sr-only">Loading trip details…</span>
                        </div>
                      ) : (
                        <>
                          <fieldset className="space-y-2">
                            <legend className="text-sm font-semibold text-slate-900">Destination for ETA (optional)</legend>
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <div className="flex-1">
                                <label htmlFor={`dest-lat-${j.id}`} className="block text-xs font-medium text-slate-800">Latitude</label>
                                <input
                                  id={`dest-lat-${j.id}`}
                                  inputMode="decimal"
                                  value={dest[j.id]?.lat ?? ''}
                                  onChange={(e) => setDest((d) => ({ ...d, [j.id]: { lat: e.target.value, lng: d[j.id]?.lng ?? '' } }))}
                                  className={`min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm ${FOCUS_RING}`}
                                />
                              </div>
                              <div className="flex-1">
                                <label htmlFor={`dest-lng-${j.id}`} className="block text-xs font-medium text-slate-800">Longitude</label>
                                <input
                                  id={`dest-lng-${j.id}`}
                                  inputMode="decimal"
                                  value={dest[j.id]?.lng ?? ''}
                                  onChange={(e) => setDest((d) => ({ ...d, [j.id]: { lat: d[j.id]?.lat ?? '', lng: e.target.value } }))}
                                  className={`min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm ${FOCUS_RING}`}
                                />
                              </div>
                            </div>
                            <p className="text-xs text-slate-600">
                              The ETA uses the last reported speed (or {DEFAULT_SPEED_KMPH} km/h if it was zero) and a road factor.
                            </p>
                          </fieldset>

                          <div className="space-y-2" data-testid="tracking-pings">
                            <h3 className="text-sm font-bold text-slate-900">Recent locations</h3>
                            {pings.length === 0 ? (
                              <p data-testid="tracking-no-pings" className="text-sm text-slate-700">No locations have been reported for this job yet.</p>
                            ) : (
                              <ol className="space-y-2">
                                {pings.map((p) => (
                                  <li key={p.id} className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <p className="font-medium text-slate-900">{formatWhen(p.recorded_at)}</p>
                                      <p className="text-xs text-slate-700 break-all">
                                        Lat {p.lat.toFixed(6)}, Lng {p.lng.toFixed(6)}
                                        {p.speed_kmph !== null ? ` · ${p.speed_kmph} km/h` : ''}
                                      </p>
                                    </div>
                                    <a
                                      href={mapsUrl(p.lat, p.lng)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      aria-label={`Open ${formatWhen(p.recorded_at)} location in Google Maps`}
                                      className={`flex min-h-[44px] items-center justify-center gap-1 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                                    >
                                      <MapPin size={16} aria-hidden="true" />
                                      Open in Google Maps
                                      <ExternalLink size={14} aria-hidden="true" />
                                    </a>
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>

                          <div className="space-y-2" data-testid="tracking-incidents">
                            <h3 className="text-sm font-bold text-slate-900">Incidents</h3>
                            {incidents.length === 0 ? (
                              <p data-testid="tracking-no-incidents" className="text-sm text-slate-700">No incidents have been recorded for this job.</p>
                            ) : (
                              <ul className="space-y-2">
                                {incidents.map((inc) => {
                                  const style = INCIDENT_STYLE[inc.status]
                                  const note = incidentNote(inc.details)
                                  return (
                                    <li key={inc.id} data-testid={`incident-${inc.id}`} className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="flex items-center gap-1 font-semibold text-slate-900">
                                          <AlertTriangle size={16} aria-hidden="true" />
                                          {KIND_LABELS[inc.kind]}
                                        </p>
                                        <Badge tone={style.tone}>{style.label}</Badge>
                                      </div>
                                      <p className="text-xs text-slate-600">Opened {formatWhen(inc.created_at)}</p>
                                      {note && <p className="text-sm text-slate-800 break-words">{note}</p>}
                                      {inc.resolution_note && (
                                        <p className="text-sm text-slate-800 break-words">Resolution: {inc.resolution_note}</p>
                                      )}

                                      {inc.status !== 'resolved' && (
                                        <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label={`Actions for ${KIND_LABELS[inc.kind]} incident`}>
                                          {inc.status === 'open' && (
                                            <button
                                              type="button"
                                              onClick={() => handleUpdate(inc, 'acknowledged')}
                                              disabled={busy !== null}
                                              className={`min-h-[44px] rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                                            >
                                              {busy === `update:${inc.id}:acknowledged:${inc.version}` ? 'Saving…' : 'Acknowledge'}
                                            </button>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setResolveFor(resolveFor === inc.id ? null : inc.id)
                                              setResolveNote('')
                                              setIncidentMessage(null)
                                            }}
                                            disabled={busy !== null}
                                            aria-expanded={resolveFor === inc.id}
                                            className={`min-h-[44px] rounded-xl border border-emerald-300 px-4 text-sm font-semibold text-emerald-900 disabled:opacity-60 ${FOCUS_RING}`}
                                          >
                                            Resolve
                                          </button>
                                        </div>
                                      )}

                                      {resolveFor === inc.id && inc.status !== 'resolved' && (
                                        <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                                          <label htmlFor={`resolve-note-${inc.id}`} className="block text-sm font-medium text-slate-900">
                                            How was it resolved? <span className="font-normal text-slate-700">(required, 3 to 500 characters)</span>
                                          </label>
                                          <textarea
                                            id={`resolve-note-${inc.id}`}
                                            value={resolveNote}
                                            onChange={(e) => setResolveNote(e.target.value)}
                                            maxLength={500}
                                            rows={3}
                                            className={`w-full rounded-xl border border-slate-300 p-2 text-sm ${FOCUS_RING}`}
                                          />
                                          <div className="flex flex-col gap-2 sm:flex-row">
                                            <button
                                              type="button"
                                              onClick={() => handleUpdate(inc, 'resolved', resolveNote)}
                                              disabled={busy !== null}
                                              className={`min-h-[44px] rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-60 ${FOCUS_RING}`}
                                            >
                                              {busy === `update:${inc.id}:resolved:${inc.version}` ? 'Saving…' : 'Confirm resolved'}
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => setResolveFor(null)}
                                              disabled={busy !== null}
                                              className={`min-h-[44px] rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 ${FOCUS_RING}`}
                                            >
                                              Keep open
                                            </button>
                                          </div>
                                        </div>
                                      )}

                                      {incidentMessage?.id === inc.id && (
                                        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{incidentMessage.text}</p>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>

                          <form onSubmit={handleOpenIncident} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3" data-testid="tracking-open-form">
                            <h3 className="text-sm font-bold text-slate-900">Open an incident</h3>
                            <div>
                              <label htmlFor={`incident-kind-${j.id}`} className="block text-sm font-medium text-slate-900">Type</label>
                              <select
                                id={`incident-kind-${j.id}`}
                                value={kind}
                                onChange={(e) => setKind(e.target.value as IncidentKind)}
                                className={`min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm ${FOCUS_RING}`}
                              >
                                {INCIDENT_KINDS.map((k) => (
                                  <option key={k} value={k}>{KIND_LABELS[k]}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label htmlFor={`incident-details-${j.id}`} className="block text-sm font-medium text-slate-900">
                                What happened? <span className="font-normal text-slate-700">(3 to 500 characters)</span>
                              </label>
                              <textarea
                                id={`incident-details-${j.id}`}
                                value={details}
                                onChange={(e) => setDetails(e.target.value)}
                                maxLength={500}
                                rows={3}
                                className={`w-full rounded-xl border border-slate-300 p-2 text-sm ${FOCUS_RING}`}
                              />
                            </div>
                            {formMessage && (
                              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formMessage}</p>
                            )}
                            <button
                              type="submit"
                              disabled={busy !== null}
                              className={`min-h-[44px] w-full rounded-xl bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto ${FOCUS_RING}`}
                            >
                              {busy?.startsWith('open:') ? 'Opening…' : 'Open incident'}
                            </button>
                          </form>
                        </>
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
