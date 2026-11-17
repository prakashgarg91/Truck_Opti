#!/usr/bin/env node
/**
 * Fallback scheduler for the expiry sweeps when pg_cron is not available (Heroku Scheduler).
 * Calls, through PostgREST with the service key, BOTH sweeps independently, in order:
 *   1. public.run_expiry_sweeps()        (staff/driver invitations, fleet reservations)
 *   2. public.run_subscription_sweeps()  (trial/grace transitions and in-app reminders)
 * A failure of the first never skips the second. Heroku Scheduler's finest cadence is every
 * 10 minutes; the sweeps are idempotent, so run it at that cadence or hourly (the pg_cron
 * job for subscriptions is hourly). Choose the cadence by how late an expiry may be applied.
 *
 *   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/run-expiry-sweeps.mjs
 *
 * Prints one line per call: the HTTP status and the response code only (never the raw body,
 * the key or the URL). Exit 0 when both calls succeeded, 1 when either failed, so the
 * scheduler shows the failure. Each call times out after 30 seconds.
 */
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.')
  process.exit(1)
}

/** Never throws and never exits: returns { ok, status, code, body }. */
const callRpc = async (name) => {
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(30000),
    })
    const body = await res.json().catch(() => ({}))
    const code = typeof body?.code === 'string' ? body.code.slice(0, 40) : null
    return { ok: res.ok && body?.ok === true, status: res.status, code, body }
  } catch (error) {
    const code = error && typeof error.name === 'string' ? error.name.slice(0, 40) : 'network_error'
    return { ok: false, status: 0, code, body: {} }
  }
}

const line = (name, r) => `${name} ${r.ok ? 'ok' : 'FAIL'}: HTTP ${r.status}${r.code ? ` code=${r.code}` : ''}`

const first = await callRpc('run_expiry_sweeps')
console.log(line('run_expiry_sweeps', first))
const second = await callRpc('run_subscription_sweeps')
console.log(line('run_subscription_sweeps', second))
if (second.ok) {
  const b = second.body
  console.log(
    `subscription sweeps: ${b.trials_expired} trials expired, ${b.grace_started} to grace, ${b.grace_expired} grace expired, ${b.reminders_created} reminders, more_pending=${b.more_pending === true}`
  )
}
process.exit(first.ok && second.ok ? 0 : 1)
