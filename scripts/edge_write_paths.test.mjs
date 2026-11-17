#!/usr/bin/env node
/**
 * Wave 2 launch blocker guard: the legacy agency Edge functions must no longer expose the
 * service-role write actions that bypassed staff scopes, transition rules, employment
 * authority and reservations. The writes now live in database commands
 * (20261015000000_agency_job_truck_commands.sql).
 *
 * Static source check (no network): node scripts/edge_write_paths.test.mjs
 * Exit 0 only when every case passes.
 */
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(root, p), 'utf8')
const jobs = read('supabase/functions/agency-portal-jobs/index.ts')
const drivers = read('supabase/functions/agency-portal-drivers/index.ts')

const results = []
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && detail ? ' — ' + detail : ''}`)
}

check('W1. agency-portal-jobs no longer accepts update-status', !/'update-status'/.test(jobs))
check('W2. agency-portal-jobs no longer accepts assign-driver', !/'assign-driver'/.test(jobs))
check('W3. agency-portal-jobs never writes agency_jobs (no .update/.insert/.delete/.upsert)', !/agency_jobs'\)\s*\.(update|insert|delete|upsert)/.test(jobs.replace(/\s+/g, ' ')) && !/\.update\(\{/.test(jobs))
check('W4. agency-portal-jobs keeps the read-only list action', /'list'/.test(jobs))
check('W5. agency-portal-drivers no longer accepts assign-truck', !/'assign-truck'/.test(drivers))
check('W6. agency-portal-drivers no longer accepts unassign-truck', !/'unassign-truck'/.test(drivers))
check('W7. agency-portal-drivers never writes agency_trucks', !/agency_trucks'\)\s*\.(update|insert|delete|upsert)/.test(drivers.replace(/\s+/g, ' ')))
check('W8. agency-portal-drivers keeps the read-only snapshot action', /'snapshot'/.test(drivers))
check('W9. the removed actions answer with a clear "moved" refusal, not a silent success', /moved to database commands/i.test(jobs) && /moved to database commands/i.test(drivers))

check('W10. agency-portal-drivers no longer creates payouts (agency_driver_payout_request replaces create-payout)', !/'create-payout'/.test(drivers) && !/driver_payouts/.test(drivers))
const portalFunctions = ['agency-portal-jobs', 'agency-portal-drivers', 'agency-portal-fleet', 'agency-portal-rates', 'agency-portal-billing', 'agency-portal-dashboard']
check('W11. no agency-portal-* Edge function touches driver_payouts', portalFunctions.every((n) => !/driver_payouts/.test(read(`supabase/functions/${n}/index.ts`))))
const payouts = read('supabase/functions/admin-portal-payouts/index.ts')
check('W12. admin payouts is a state machine: approve and reject need pending, mark-paid needs approved, the rejection reason is its own column', /\.eq\('status', 'pending'\)/.test(payouts) && /\.eq\('status', 'approved'\)/.test(payouts) && /rejection_note: body\.rejectionNote/.test(payouts) && !/note: body\.rejectionNote/.test(payouts.replace(/rejection_note: body\.rejectionNote/g, '')))

// Staff scopes (20261012): the portal functions resolve owners AND active staff through one scope resolver.
const portalAuth = read('supabase/functions/_shared/portal-auth.ts')
const portalScopes = read('supabase/functions/_shared/portalScopes.ts')
const portalScopeMap = { 'agency-portal-dashboard': 'dashboard', 'agency-portal-jobs': 'jobs', 'agency-portal-billing': 'billing', 'agency-portal-rates': 'rates', 'agency-portal-drivers': 'drivers', 'agency-portal-fleet': 'fleet' }
check('W13. requireAgencyContext resolves staff through resolvePortalAccess and active agency_memberships, not the owner row alone', /resolvePortalAccess\(/.test(portalAuth) && /from\('agency_memberships'\)/.test(portalAuth) && /\.eq\('status', 'active'\)/.test(portalAuth))
for (const [fn, portal] of Object.entries(portalScopeMap)) {
  check(`W14. ${fn} calls the scope resolver with portal '${portal}'`, new RegExp(`requireAgencyContext\\([\\s\\S]*?portal: '${portal}'`).test(read(`supabase/functions/${fn}/index.ts`)))
}
check('W15. staff are read-only: rate writes call assertPortalWriter, and only owners can write', ['agency-portal-rates'].every((n) => /assertPortalWriter\(context\)/.test(read(`supabase/functions/${n}/index.ts`))) && /role === 'owner'/.test(portalScopes))
const fleetFn = read('supabase/functions/agency-portal-fleet/index.ts').replace(/\s+/g, ' ')
check('W18. agency-portal-fleet is read-only: no add-truck or update-truck action and no agency_trucks write', !/add-truck|update-truck/.test(fleetFn) && !/\.(insert|update|delete|upsert)\(/.test(fleetFn) && /from\('agency_trucks'\) \.select\(/.test(fleetFn))

const erpIngest = read('supabase/functions/erp-ingest/index.ts')
check('W16. erp-ingest calls only erp_event_ingest through the service client and caps the raw body before parsing', /rpc\('erp_event_ingest'/.test(erpIngest) && /readCappedBytes\(req\.body, MAX_ERP_BODY_BYTES/.test(erpIngest) && erpIngest.indexOf('readCappedBytes') < erpIngest.indexOf('parseErpBytes'))
check('W17. erp-ingest never logs the secret or the lines and sends no CORS headers', !/console\.(log|error)\([^)]*(secret|lines|body)/i.test(erpIngest) && !/Access-Control/i.test(erpIngest))

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} cases passed (static Edge source check)`)
process.exit(failed.length ? 1 : 0)
