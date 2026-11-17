// Pure tracking rules for TO-147: ETA, stale-ping and incident detection.
// No React, no network, no storage, no wall-clock reads. Callers pass the
// current time (nowIso) so every result is deterministic. Money is never
// handled here (all values are distances, speeds and durations).

export interface LatLng {
  lat: number
  lng: number
}

export interface TrackingPing {
  tsIso: string
  lat: number
  lng: number
  speedKmph: number
}

export type IncidentType = 'long_halt' | 'overspeed' | 'route_deviation'

export interface TrackingIncident {
  type: IncidentType
  /** Stable identity: type plus the start timestamp. Unchanged as the incident grows. */
  key: string
  startIndex: number
  endIndex: number
  startTsIso: string
  endTsIso: string
}

export interface DetectIncidentOptions {
  pickup: LatLng
  drop: LatLng
  haltMinutes?: number
  maxKmph?: number
  deviationKm?: number
}

const EARTH_RADIUS_KM = 6371.0088
const ROAD_FACTOR = 1.3
const KM_PER_DEGREE = (Math.PI * EARTH_RADIUS_KM) / 180
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000

function parseIso(iso: string): number {
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) {
    throw new Error('invalid_timestamp')
  }
  return ms
}

/** Great-circle distance in kilometres (haversine, mean Earth radius). */
export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** True when the last ping is strictly older than the threshold (default 30 minutes). */
export function isStalePing(lastPingIso: string, nowIso: string, thresholdMinutes = 30): boolean {
  const elapsedMs = parseIso(nowIso) - parseIso(lastPingIso)
  return elapsedMs > thresholdMinutes * MS_PER_MINUTE
}

export interface EstimateEtaInput {
  currentLatLng: LatLng
  destLatLng: LatLng
  averageSpeedKmph: number
  nowIso: string
}

/**
 * ETA = now + (straight-line km x 1.3 road factor) / average speed.
 * Throws when the speed is not a positive number.
 */
export function estimateEta({ currentLatLng, destLatLng, averageSpeedKmph, nowIso }: EstimateEtaInput): string {
  if (!(averageSpeedKmph > 0)) {
    throw new Error('invalid_speed')
  }
  const nowMs = parseIso(nowIso)
  const roadKm = haversineKm(currentLatLng, destLatLng) * ROAD_FACTOR
  if (roadKm === 0) {
    return nowIso
  }
  const hours = roadKm / averageSpeedKmph
  return new Date(nowMs + Math.round(hours * MS_PER_HOUR)).toISOString()
}

/** Distance from point p to the segment a-b, in kilometres (local equirectangular projection). */
function distanceToSegmentKm(p: LatLng, a: LatLng, b: LatLng): number {
  const cosLat = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180)
  const project = (q: LatLng) => ({
    x: (q.lng - a.lng) * KM_PER_DEGREE * cosLat,
    y: (q.lat - a.lat) * KM_PER_DEGREE,
  })
  const pt = project(p)
  const end = project(b)
  const lenSq = end.x * end.x + end.y * end.y
  if (lenSq === 0) {
    return Math.hypot(pt.x, pt.y)
  }
  const t = Math.min(1, Math.max(0, (pt.x * end.x + pt.y * end.y) / lenSq))
  return Math.hypot(pt.x - t * end.x, pt.y - t * end.y)
}

/** Groups consecutive indices where the predicate holds into [start, end] pairs. */
function contiguousRuns(length: number, predicate: (index: number) => boolean): Array<[number, number]> {
  const runs: Array<[number, number]> = []
  let start = -1
  for (let i = 0; i < length; i += 1) {
    if (predicate(i)) {
      if (start === -1) start = i
    } else if (start !== -1) {
      runs.push([start, i - 1])
      start = -1
    }
  }
  if (start !== -1) runs.push([start, length - 1])
  return runs
}

/**
 * Detects long halts, overspeed and route deviation from ordered pings.
 * Pings must be sorted by timestamp (non-decreasing), otherwise throws 'unsorted_pings'.
 * Each incident is a maximal contiguous run; its key stays the same when later
 * pings extend it, so the same incident is never reported under a new key.
 */
export function detectIncidents(pings: TrackingPing[], opts: DetectIncidentOptions): TrackingIncident[] {
  const times = pings.map((p) => parseIso(p.tsIso))
  for (let i = 1; i < times.length; i += 1) {
    if (times[i] < times[i - 1]) {
      throw new Error('unsorted_pings')
    }
  }

  const haltMs = (opts.haltMinutes ?? 60) * MS_PER_MINUTE
  const maxKmph = opts.maxKmph ?? 80
  const deviationKm = opts.deviationKm ?? 25

  const incidents: TrackingIncident[] = []
  const add = (type: IncidentType, startIndex: number, endIndex: number) => {
    const startTsIso = pings[startIndex].tsIso
    incidents.push({
      type,
      key: `${type}@${startTsIso}`,
      startIndex,
      endIndex,
      startTsIso,
      endTsIso: pings[endIndex].tsIso,
    })
  }

  for (const [start, end] of contiguousRuns(pings.length, (i) => pings[i].speedKmph > maxKmph)) {
    add('overspeed', start, end)
  }

  for (const [start, end] of contiguousRuns(pings.length, (i) => pings[i].speedKmph <= 0)) {
    if (times[end] - times[start] >= haltMs) {
      add('long_halt', start, end)
    }
  }

  for (const [start, end] of contiguousRuns(
    pings.length,
    (i) => distanceToSegmentKm(pings[i], opts.pickup, opts.drop) > deviationKm,
  )) {
    add('route_deviation', start, end)
  }

  return incidents.sort((x, y) => x.startIndex - y.startIndex || x.type.localeCompare(y.type))
}
