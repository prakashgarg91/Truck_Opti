#!/usr/bin/env node
/**
 * Fallback scheduler for the expiry sweeps when pg_cron is not available (Heroku Scheduler,
 * every 10 minutes): calls public.run_expiry_sweeps() through PostgREST with the service key.
 *
 *   SUPABASE_URL=https://<project>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/run-expiry-sweeps.mjs
 *
 * Prints ONLY the sweep counts. Never prints the key or the URL's query. Exit 0 on success,
 * 1 on a refused or failed call (so the scheduler shows the failure).
 */
const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('FAIL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.')
  process.exit(1)
}

try {
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/rpc/run_expiry_sweeps`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body?.ok !== true) {
    console.error(`FAIL: run_expiry_sweeps answered HTTP ${res.status}${body?.message ? ': ' + String(body.message).slice(0, 120) : ''}`)
    process.exit(1)
  }
  console.log(
    `expiry sweeps ok: ${body.invitations_expired} staff invitations, ${body.driver_invitations_expired} driver invitations, ${body.reservations_released} reservations released`
  )
} catch (error) {
  console.error(`FAIL: could not reach the database API (${error && error.code ? error.code : 'network error'})`)
  process.exit(1)
}
