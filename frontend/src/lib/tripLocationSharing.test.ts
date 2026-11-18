import { describe, expect, it } from 'vitest'
import {
    MAX_TRANSIENT_BACKOFF_MS,
    PING_INTERVAL_MS,
    RATE_LIMITED_BACKOFF_MS,
    TOO_FREQUENT_BACKOFF_MS,
    applyOutcome,
    createSchedulerState,
    isPingDue,
    isTripActiveForSharing,
    messageForStop,
    offerSample,
    positionToSample,
    takeDueSample,
    type PingSample,
    type SchedulerState,
} from './tripLocationSharing'

const T0 = 1_000_000

function sample(n: number, overrides: Partial<PingSample> = {}): PingSample {
    return {
        lat: 19 + n / 1000,
        lng: 72 + n / 1000,
        speedKmph: 40,
        recordedAt: new Date(T0 + n * 1000).toISOString(),
        ...overrides,
    }
}

function sendOk(state: SchedulerState, now: number): SchedulerState {
    const taken = takeDueSample(state, now)
    if (!taken) throw new Error('expected a due sample')
    return applyOutcome(taken.state, { kind: 'ok' }, now)
}

describe('positionToSample', () => {
    it('takes the timestamp from the position and converts m/s to km/h', () => {
        const s = positionToSample({ coords: { latitude: 19.07, longitude: 72.87, speed: 10 }, timestamp: Date.UTC(2026, 10, 18, 5, 0, 0) })
        expect(s).toEqual({ lat: 19.07, lng: 72.87, speedKmph: 36, recordedAt: '2026-11-18T05:00:00.000Z' })
    })

    it('sends 0 for an unknown speed and clamps to 250', () => {
        expect(positionToSample({ coords: { latitude: 1, longitude: 1, speed: null }, timestamp: T0 })?.speedKmph).toBe(0)
        expect(positionToSample({ coords: { latitude: 1, longitude: 1, speed: 500 }, timestamp: T0 })?.speedKmph).toBe(250)
        expect(positionToSample({ coords: { latitude: 1, longitude: 1, speed: -3 }, timestamp: T0 })?.speedKmph).toBe(0)
    })

    it('rejects unusable coordinates and timestamps', () => {
        expect(positionToSample({ coords: { latitude: 91, longitude: 0, speed: 0 }, timestamp: T0 })).toBeNull()
        expect(positionToSample({ coords: { latitude: 0, longitude: -181, speed: 0 }, timestamp: T0 })).toBeNull()
        expect(positionToSample({ coords: { latitude: NaN, longitude: 0, speed: 0 }, timestamp: T0 })).toBeNull()
        expect(positionToSample({ coords: { latitude: 0, longitude: 0, speed: 0 }, timestamp: NaN })).toBeNull()
    })
})

describe('scheduler', () => {
    it('holds only the latest position, never a queue', () => {
        let state = createSchedulerState()
        state = offerSample(state, sample(1))
        state = offerSample(state, sample(2))
        state = offerSample(state, sample(3))
        expect(state.latest).toEqual(sample(3))
        // An older position arriving late never replaces a newer one.
        state = offerSample(state, sample(2))
        expect(state.latest).toEqual(sample(3))
    })

    it('sends the first position immediately, then at most once per 60 s', () => {
        let state = offerSample(createSchedulerState(), sample(1))
        expect(isPingDue(state, T0)).toBe(true)
        state = sendOk(state, T0)

        state = offerSample(state, sample(10))
        expect(isPingDue(state, T0 + 1_000)).toBe(false)
        expect(isPingDue(state, T0 + PING_INTERVAL_MS - 1)).toBe(false)
        expect(isPingDue(state, T0 + PING_INTERVAL_MS)).toBe(true)

        // Many positions in between: only the newest is ever sent.
        for (let i = 11; i < 30; i++) state = offerSample(state, sample(i))
        const taken = takeDueSample(state, T0 + PING_INTERVAL_MS)
        expect(taken?.sample).toEqual(sample(29))
        expect(taken?.state.latest).toBeNull()
    })

    it('does not send while a ping is in flight', () => {
        const state = offerSample(createSchedulerState(), sample(1))
        const taken = takeDueSample(state, T0)!
        const next = offerSample(taken.state, sample(2))
        expect(isPingDue(next, T0 + 10 * PING_INTERVAL_MS)).toBe(false)
    })

    it('never resends a position that was already sent (no ping_conflict)', () => {
        let state = offerSample(createSchedulerState(), sample(1))
        state = sendOk(state, T0)
        const again = offerSample(state, sample(1))
        expect(again.latest).toBeNull()
    })

    it('backs off 10 minutes on rate_limited and widens spacing on too_frequent', () => {
        let state = offerSample(createSchedulerState(), sample(1))
        let taken = takeDueSample(state, T0)!
        state = applyOutcome(taken.state, { kind: 'refused', code: 'rate_limited' }, T0)
        expect(state.stopped).toBeNull()
        expect(state.nextAllowedAt).toBe(T0 + RATE_LIMITED_BACKOFF_MS)

        state = offerSample(state, sample(5))
        expect(isPingDue(state, T0 + RATE_LIMITED_BACKOFF_MS - 1)).toBe(false)
        expect(isPingDue(state, T0 + RATE_LIMITED_BACKOFF_MS)).toBe(true)

        const now = T0 + RATE_LIMITED_BACKOFF_MS
        taken = takeDueSample(state, now)!
        state = applyOutcome(taken.state, { kind: 'refused', code: 'too_frequent' }, now)
        expect(state.nextAllowedAt).toBe(now + TOO_FREQUENT_BACKOFF_MS)
        expect(state.stopped).toBeNull()
    })

    it.each([
        ['job_not_active', 'job_not_active'],
        ['not_assigned', 'not_assigned'],
        ['not_found', 'not_assigned'],
        ['agency_not_operational', 'unavailable'],
        ['ping_cap_reached', 'unavailable'],
    ])('stops for good on %s', (code, reason) => {
        let state = offerSample(createSchedulerState(), sample(1))
        const taken = takeDueSample(state, T0)!
        state = applyOutcome(taken.state, { kind: 'refused', code }, T0)
        expect(state.stopped).toBe(reason)
        expect(state.latest).toBeNull()
        // Once stopped nothing is accepted or due any more.
        state = offerSample(state, sample(9))
        expect(state.latest).toBeNull()
        expect(isPingDue(state, T0 + 10 * PING_INTERVAL_MS)).toBe(false)
        expect(messageForStop(state.stopped!).length).toBeGreaterThan(10)
    })

    it.each(['invalid_coordinates', 'future_timestamp', 'too_old', 'ping_conflict', 'invalid_speed'])(
        'drops the bad sample on %s and carries on after the normal interval',
        (code) => {
            let state = offerSample(createSchedulerState(), sample(1))
            const taken = takeDueSample(state, T0)!
            state = applyOutcome(taken.state, { kind: 'refused', code }, T0)
            expect(state.stopped).toBeNull()
            expect(state.latest).toBeNull()
            expect(state.nextAllowedAt).toBe(T0 + PING_INTERVAL_MS)
        }
    )

    it('backs off exponentially on transient failures, capped, and resets after a success', () => {
        let state = createSchedulerState()
        let now = T0
        const waits: number[] = []
        for (let i = 0; i < 6; i++) {
            state = offerSample(state, sample(i + 1))
            const taken = takeDueSample(state, now)!
            state = applyOutcome(taken.state, { kind: 'error' }, now)
            waits.push(state.nextAllowedAt - now)
            now = state.nextAllowedAt
        }
        expect(waits).toEqual([
            PING_INTERVAL_MS,
            2 * PING_INTERVAL_MS,
            4 * PING_INTERVAL_MS,
            MAX_TRANSIENT_BACKOFF_MS,
            MAX_TRANSIENT_BACKOFF_MS,
            MAX_TRANSIENT_BACKOFF_MS,
        ])
        state = offerSample(state, sample(50))
        state = sendOk(state, now)
        expect(state.consecutiveFailures).toBe(0)
        expect(state.nextAllowedAt).toBe(now + PING_INTERVAL_MS)
    })

    it('treats an unknown refusal like a transient failure', () => {
        let state = offerSample(createSchedulerState(), sample(1))
        const taken = takeDueSample(state, T0)!
        state = applyOutcome(taken.state, { kind: 'refused', code: 'unknown' }, T0)
        expect(state.stopped).toBeNull()
        expect(state.consecutiveFailures).toBe(1)
    })
})

describe('isTripActiveForSharing', () => {
    it('is true only while the trip is underway', () => {
        for (const s of ['accepted', 'pickup_arrived', 'in_transit', 'delivery_arrived']) expect(isTripActiveForSharing(s)).toBe(true)
        for (const s of ['delivered', 'declined', 'expired', 'cancelled', 'pending', '', null, undefined]) expect(isTripActiveForSharing(s)).toBe(false)
    })
})
