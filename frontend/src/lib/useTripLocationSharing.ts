import { useCallback, useEffect, useRef, useState } from 'react'
import {
    SHARING_MESSAGES,
    applyOutcome,
    createSchedulerState,
    messageForStop,
    offerSample,
    positionToSample,
    takeDueSample,
    type PingOutcome,
    type PingSample,
    type SchedulerState,
} from './tripLocationSharing'

/**
 * React binding for the opt-in agency location sharing of the driver trip
 * page. Geolocation permission is requested only inside start(), which the
 * page calls from the driver's explicit toggle. Nothing is stored on the
 * device: the newest position lives in a ref until it is sent or replaced.
 */

export type SharingStatus =
    | 'off'
    | 'starting'
    | 'sharing'
    | 'denied'
    | 'unsupported'
    | 'not_available'
    | 'stopped'

/** How often the loop checks whether a ping is due (the ping gap itself is 60 s). */
const TICK_MS = 5_000

interface GeolocationLike {
    watchPosition: Geolocation['watchPosition']
    clearWatch: Geolocation['clearWatch']
}

export interface UseTripLocationSharingOptions {
    /** False once the trip is over: sharing stops by itself. */
    active: boolean
    /** Resolves the agency job id; null means sharing is not available. */
    resolveJobId: () => Promise<string | null>
    send: (jobId: string, sample: PingSample) => Promise<PingOutcome>
    /** Injectable for tests; defaults to navigator.geolocation. */
    geolocation?: GeolocationLike | null
    now?: () => number
}

export interface TripLocationSharing {
    status: SharingStatus
    message: string
    lastSentAt: number | null
    isSharing: boolean
    start: () => Promise<void>
    stop: () => void
}

export function useTripLocationSharing(options: UseTripLocationSharingOptions): TripLocationSharing {
    const { active } = options
    const optionsRef = useRef(options)
    useEffect(() => {
        optionsRef.current = options
    })

    const [status, setStatus] = useState<SharingStatus>('off')
    const [message, setMessage] = useState('')
    const [lastSentAt, setLastSentAt] = useState<number | null>(null)

    const stateRef = useRef<SchedulerState>(createSchedulerState())
    const watchIdRef = useRef<number | null>(null)
    const geoRef = useRef<GeolocationLike | null>(null)
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
    const jobIdRef = useRef<string | null>(null)
    const sessionRef = useRef(0)
    const mountedRef = useRef(true)

    const startedRef = useRef(false)

    const now = useCallback(() => (optionsRef.current.now ? optionsRef.current.now() : Date.now()), [])

    const teardown = useCallback(() => {
        sessionRef.current += 1
        startedRef.current = false
        if (watchIdRef.current !== null && geoRef.current) {
            geoRef.current.clearWatch(watchIdRef.current)
        }
        watchIdRef.current = null
        if (timerRef.current !== null) clearInterval(timerRef.current)
        timerRef.current = null
        jobIdRef.current = null
        stateRef.current = createSchedulerState()
    }, [])

    const finish = useCallback((next: SharingStatus, text: string) => {
        teardown()
        if (!mountedRef.current) return
        setStatus(next)
        setMessage(text)
    }, [teardown])

    const stop = useCallback(() => finish('off', ''), [finish])

    const pump = useCallback(async () => {
        const taken = takeDueSample(stateRef.current, now())
        const jobId = jobIdRef.current
        if (!taken || !jobId) return
        stateRef.current = taken.state
        const session = sessionRef.current
        const outcome = await optionsRef.current.send(jobId, taken.sample)
        if (session !== sessionRef.current) return
        const finishedAt = now()
        stateRef.current = applyOutcome(stateRef.current, outcome, finishedAt)
        if (stateRef.current.stopped) {
            finish('stopped', messageForStop(stateRef.current.stopped))
            return
        }
        if (outcome.kind === 'ok' && mountedRef.current) {
            setStatus('sharing')
            setMessage('')
            setLastSentAt(finishedAt)
        }
    }, [finish, now])

    const start = useCallback(async () => {
        if (startedRef.current) return
        const geo: GeolocationLike | null =
            optionsRef.current.geolocation !== undefined
                ? optionsRef.current.geolocation
                : typeof navigator !== 'undefined' && navigator.geolocation
                    ? navigator.geolocation
                    : null
        if (!geo) {
            finish('unsupported', SHARING_MESSAGES.unsupported)
            return
        }

        teardown()
        startedRef.current = true
        const session = sessionRef.current
        setStatus('starting')
        setMessage('')

        // Resolve the job BEFORE asking for browser permission: when sharing is
        // not available for this trip the driver is never prompted needlessly.
        const jobId = await optionsRef.current.resolveJobId()
        if (session !== sessionRef.current || !mountedRef.current) return
        if (!jobId) {
            finish('not_available', SHARING_MESSAGES.notAvailableForTrip)
            return
        }
        jobIdRef.current = jobId
        geoRef.current = geo

        watchIdRef.current = geo.watchPosition(
            (position) => {
                if (session !== sessionRef.current) return
                const sample = positionToSample(position)
                if (!sample) return
                stateRef.current = offerSample(stateRef.current, sample)
                void pump()
            },
            (error) => {
                if (session !== sessionRef.current) return
                if (error.code === 1) {
                    finish('denied', SHARING_MESSAGES.permissionDenied)
                } else if (error.code === 3) {
                    setMessage(SHARING_MESSAGES.timeout)
                } else {
                    setMessage(SHARING_MESSAGES.unavailable)
                }
            },
            { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
        )
        timerRef.current = setInterval(() => void pump(), TICK_MS)
    }, [finish, pump, teardown])

    // Trip over -> stop by itself.
    useEffect(() => {
        if (!active && (status === 'starting' || status === 'sharing')) {
            finish('stopped', SHARING_MESSAGES.tripEnded)
        }
    }, [active, status, finish])

    // Page closing / unmount -> stop, without touching state.
    useEffect(() => {
        mountedRef.current = true
        const onPageHide = () => teardown()
        window.addEventListener('pagehide', onPageHide)
        return () => {
            mountedRef.current = false
            window.removeEventListener('pagehide', onPageHide)
            teardown()
        }
    }, [teardown])

    return {
        status,
        message,
        lastSentAt,
        isSharing: status === 'starting' || status === 'sharing',
        start,
        stop,
    }
}
