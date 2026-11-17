import { describe, expect, it } from 'vitest'
import {
  detectIncidents,
  estimateEta,
  haversineKm,
  isStalePing,
  type TrackingPing,
} from './trackingRules'

const BASE_MS = Date.parse('2026-11-17T10:00:00.000Z')
const at = (minutes: number): string => new Date(BASE_MS + minutes * 60_000).toISOString()

const DELHI = { lat: 28.6139, lng: 77.209 }
const MUMBAI = { lat: 19.076, lng: 72.8777 }

const EQUATOR_PICKUP = { lat: 0, lng: 0 }
const EQUATOR_DROP = { lat: 0, lng: 2 }

function ping(minutes: number, speedKmph: number, lat = 0, lng = 0): TrackingPing {
  return { tsIso: at(minutes), lat, lng, speedKmph }
}

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(DELHI, DELHI)).toBe(0)
  })

  it('matches Delhi to Mumbai straight line (~1150 km) within 1%', () => {
    const d = haversineKm(DELHI, MUMBAI)
    expect(d).toBeGreaterThan(1150 * 0.99)
    expect(d).toBeLessThan(1150 * 1.01)
  })

  it('is symmetric', () => {
    expect(haversineKm(DELHI, MUMBAI)).toBeCloseTo(haversineKm(MUMBAI, DELHI), 9)
  })

  it('gives one degree of latitude as about 111.19 km', () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })
    expect(d).toBeCloseTo(111.19, 1)
  })

  it('gives one degree of longitude on the equator as about 111.19 km', () => {
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })
    expect(d).toBeCloseTo(111.19, 1)
  })

  it('matches Paris to London (~343.5 km) within 1%', () => {
    const d = haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 })
    expect(d).toBeGreaterThan(343.5 * 0.99)
    expect(d).toBeLessThan(343.5 * 1.01)
  })

  it('returns a non-negative distance for southern and western coordinates', () => {
    const d = haversineKm({ lat: -33.8688, lng: -151.2093 }, { lat: -41.2865, lng: -174.7762 })
    expect(d).toBeGreaterThan(0)
  })
})

describe('isStalePing', () => {
  it('is fresh when the last ping is 29 minutes old (default threshold 30)', () => {
    expect(isStalePing(at(0), at(29))).toBe(false)
  })

  it('is not stale at exactly the threshold', () => {
    expect(isStalePing(at(0), at(30))).toBe(false)
  })

  it('is stale when the last ping is 31 minutes old', () => {
    expect(isStalePing(at(0), at(31))).toBe(true)
  })

  it('honours a custom threshold', () => {
    expect(isStalePing(at(0), at(6), 5)).toBe(true)
    expect(isStalePing(at(0), at(4), 5)).toBe(false)
  })

  it('is not stale when the ping is in the future relative to now', () => {
    expect(isStalePing(at(10), at(0))).toBe(false)
  })

  it('throws invalid_timestamp for a malformed timestamp', () => {
    expect(() => isStalePing('not-a-date', at(0))).toThrow('invalid_timestamp')
  })
})

describe('estimateEta', () => {
  const nowIso = at(0)

  it('adds straight-line distance times 1.3 divided by speed', () => {
    // 1 degree of longitude on the equator ~ 111.19 km; x1.3 = ~144.55 km; at 60 km/h ~ 2.409 h
    const eta = estimateEta({
      currentLatLng: { lat: 0, lng: 0 },
      destLatLng: { lat: 0, lng: 1 },
      averageSpeedKmph: 60,
      nowIso,
    })
    const addedMs = Date.parse(eta) - BASE_MS
    const expectedMs = (111.19 * 1.3 * 3600_000) / 60
    expect(Math.abs(addedMs - expectedMs)).toBeLessThan(1000)
  })

  it('returns nowIso when the vehicle is already at the destination', () => {
    const eta = estimateEta({
      currentLatLng: DELHI,
      destLatLng: DELHI,
      averageSpeedKmph: 50,
      nowIso,
    })
    expect(eta).toBe(nowIso)
  })

  it('returns a valid ISO 8601 string', () => {
    const eta = estimateEta({
      currentLatLng: DELHI,
      destLatLng: MUMBAI,
      averageSpeedKmph: 55,
      nowIso,
    })
    expect(new Date(eta).toISOString()).toBe(eta)
  })

  it('is later for a longer distance at the same speed', () => {
    const near = estimateEta({ currentLatLng: DELHI, destLatLng: { lat: 28.7, lng: 77.2 }, averageSpeedKmph: 50, nowIso })
    const far = estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: 50, nowIso })
    expect(Date.parse(far)).toBeGreaterThan(Date.parse(near))
  })

  it('is later for a lower speed over the same distance', () => {
    const fast = estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: 80, nowIso })
    const slow = estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: 40, nowIso })
    expect(Date.parse(slow)).toBeGreaterThan(Date.parse(fast))
  })

  it('uses the nowIso argument, not the wall clock', () => {
    const a = estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: 60, nowIso: at(0) })
    const b = estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: 60, nowIso: at(90) })
    expect(Date.parse(b) - Date.parse(a)).toBe(90 * 60_000)
  })

  it('throws when speed is zero', () => {
    expect(() =>
      estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: 0, nowIso }),
    ).toThrow()
  })

  it('throws when speed is negative', () => {
    expect(() =>
      estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: -10, nowIso }),
    ).toThrow()
  })

  it('throws when speed is NaN', () => {
    expect(() =>
      estimateEta({ currentLatLng: DELHI, destLatLng: MUMBAI, averageSpeedKmph: Number.NaN, nowIso }),
    ).toThrow()
  })
})

describe('detectIncidents', () => {
  const opts = { pickup: EQUATOR_PICKUP, drop: EQUATOR_DROP }

  describe('input handling', () => {
    it('returns an empty list for no pings', () => {
      expect(detectIncidents([], opts)).toEqual([])
    })

    it('throws unsorted_pings when timestamps go backwards', () => {
      expect(() => detectIncidents([ping(10, 40), ping(5, 40)], opts)).toThrow('unsorted_pings')
    })

    it('accepts equal timestamps as sorted', () => {
      expect(() => detectIncidents([ping(5, 40), ping(5, 40)], opts)).not.toThrow()
    })

    it('throws invalid_timestamp for a malformed timestamp', () => {
      expect(() =>
        detectIncidents([{ tsIso: 'bogus', lat: 0, lng: 0, speedKmph: 10 }], opts),
      ).toThrow('invalid_timestamp')
    })

    it('reports nothing for a normal trip on the line', () => {
      const pings = [ping(0, 40, 0, 0), ping(10, 50, 0, 0.5), ping(20, 60, 0, 1), ping(30, 45, 0, 1.5)]
      expect(detectIncidents(pings, opts)).toEqual([])
    })
  })

  describe('overspeed', () => {
    it('flags a single ping above the default 80 km/h', () => {
      const incidents = detectIncidents([ping(0, 40), ping(5, 90), ping(10, 40)], opts)
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ type: 'overspeed', startIndex: 1, endIndex: 1 })
    })

    it('does not flag speed exactly at the limit', () => {
      expect(detectIncidents([ping(0, 80), ping(5, 80)], opts)).toEqual([])
    })

    it('spans consecutive overspeed pings with start and end index', () => {
      const incidents = detectIncidents(
        [ping(0, 40), ping(5, 90), ping(10, 95), ping(15, 85), ping(20, 40)],
        opts,
      )
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ type: 'overspeed', startIndex: 1, endIndex: 3 })
    })

    it('honours a custom maxKmph', () => {
      const incidents = detectIncidents([ping(0, 60), ping(5, 65)], { ...opts, maxKmph: 60 })
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ type: 'overspeed', startIndex: 1, endIndex: 1 })
    })

    it('reports two separate overspeed runs when separated by a normal ping', () => {
      const incidents = detectIncidents(
        [ping(0, 90), ping(5, 40), ping(10, 90)],
        opts,
      )
      expect(incidents.filter((i) => i.type === 'overspeed')).toHaveLength(2)
    })
  })

  describe('long_halt', () => {
    it('flags a halt that lasts exactly the default 60 minutes', () => {
      const pings = [ping(0, 0), ping(20, 0), ping(40, 0), ping(60, 0)]
      const incidents = detectIncidents(pings, opts)
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ type: 'long_halt', startIndex: 0, endIndex: 3 })
    })

    it('does not flag a halt shorter than 60 minutes', () => {
      const pings = [ping(0, 0), ping(20, 0), ping(50, 0), ping(55, 40)]
      expect(detectIncidents(pings, opts).filter((i) => i.type === 'long_halt')).toEqual([])
    })

    it('ends the halt at the last zero-speed ping before movement resumes', () => {
      const pings = [ping(0, 0), ping(30, 0), ping(70, 0), ping(80, 40), ping(90, 40)]
      const incidents = detectIncidents(pings, opts)
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ type: 'long_halt', startIndex: 0, endIndex: 2 })
    })

    it('counts a halt still ongoing at the end of the data', () => {
      const pings = [ping(0, 40), ping(10, 0), ping(40, 0), ping(75, 0)]
      const incidents = detectIncidents(pings, opts)
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ type: 'long_halt', startIndex: 1, endIndex: 3 })
    })

    it('honours a custom haltMinutes', () => {
      const pings = [ping(0, 0), ping(15, 0)]
      expect(detectIncidents(pings, { ...opts, haltMinutes: 15 })).toHaveLength(1)
      expect(detectIncidents(pings, opts)).toEqual([])
    })

    it('reports two halts that are each long enough separately', () => {
      const pings = [ping(0, 0), ping(60, 0), ping(61, 40), ping(62, 0), ping(125, 0)]
      const halts = detectIncidents(pings, opts).filter((i) => i.type === 'long_halt')
      expect(halts).toHaveLength(2)
      expect(halts[0]).toMatchObject({ startIndex: 0, endIndex: 1 })
      expect(halts[1]).toMatchObject({ startIndex: 3, endIndex: 4 })
    })
  })

  describe('route_deviation', () => {
    it('does not flag a ping on the pickup-drop line', () => {
      expect(detectIncidents([ping(0, 40, 0, 1)], opts)).toEqual([])
    })

    it('does not flag a ping 11 km off the line when the limit is 25 km', () => {
      expect(detectIncidents([ping(0, 40, 0.1, 1)], opts)).toEqual([])
    })

    it('flags a ping about 111 km off the line', () => {
      const incidents = detectIncidents([ping(0, 40, 0, 1), ping(5, 40, 1, 1), ping(10, 40, 0, 1.5)], opts)
      expect(incidents).toHaveLength(1)
      expect(incidents[0]).toMatchObject({ type: 'route_deviation', startIndex: 1, endIndex: 1 })
    })

    it('honours a custom deviationKm', () => {
      const incidents = detectIncidents([ping(0, 40, 0.3, 1)], { ...opts, deviationKm: 10 })
      expect(incidents).toHaveLength(1)
      expect(incidents[0].type).toBe('route_deviation')
    })

    it('treats a degenerate pickup equal to drop as a point', () => {
      const same = { pickup: EQUATOR_PICKUP, drop: EQUATOR_PICKUP }
      expect(detectIncidents([ping(0, 40, 0.5, 0)], same)).toHaveLength(1)
      expect(detectIncidents([ping(0, 40, 0.1, 0)], same)).toEqual([])
    })
  })

  describe('overlap and dedupe keys', () => {
    it('reports overlapping overspeed and deviation with distinct keys', () => {
      const incidents = detectIncidents([ping(0, 40, 0, 1), ping(5, 95, 1, 1), ping(10, 40, 0, 1)], opts)
      const types = incidents.map((i) => i.type).sort()
      expect(types).toEqual(['overspeed', 'route_deviation'])
      expect(new Set(incidents.map((i) => i.key)).size).toBe(2)
    })

    it('gives each incident a non-empty key', () => {
      const incidents = detectIncidents([ping(0, 95)], opts)
      expect(incidents[0].key.length).toBeGreaterThan(0)
    })

    it('keeps the same key when later pings extend the same incident', () => {
      const short = detectIncidents([ping(0, 40, 0, 1), ping(5, 95)], opts)
      const long = detectIncidents([ping(0, 40, 0, 1), ping(5, 95), ping(10, 97), ping(15, 40)], opts)
      const shortKey = short.find((i) => i.type === 'overspeed')?.key
      const longKey = long.find((i) => i.type === 'overspeed')?.key
      expect(shortKey).toBeDefined()
      expect(longKey).toBe(shortKey)
    })

    it('gives a new key to an incident that starts later', () => {
      const first = detectIncidents([ping(0, 95)], opts)[0].key
      const second = detectIncidents([ping(0, 95), ping(20, 40), ping(25, 95)], opts)
      const keys = second.filter((i) => i.type === 'overspeed').map((i) => i.key)
      expect(keys).toContain(first)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('never returns two incidents with the same key for one input', () => {
      const pings = [ping(0, 0), ping(60, 0), ping(61, 95), ping(62, 0), ping(70, 0), ping(130, 0)]
      const incidents = detectIncidents(pings, opts)
      const keys = incidents.map((i) => i.key)
      expect(new Set(keys).size).toBe(keys.length)
    })

    it('makes the key depend on the incident type when both start at the same ping', () => {
      const incidents = detectIncidents([ping(0, 95, 1, 1), ping(5, 40, 0, 1)], opts)
      const overspeed = incidents.find((i) => i.type === 'overspeed')
      const deviation = incidents.find((i) => i.type === 'route_deviation')
      expect(overspeed).toBeDefined()
      expect(deviation).toBeDefined()
      expect(overspeed?.key).not.toBe(deviation?.key)
    })
  })
})
