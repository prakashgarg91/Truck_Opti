// Generates .fleet/tasks.json (the task-level plan for the ZCode fleet). Re-run after editing.
import { writeFileSync } from 'node:fs'

const tasks = []

const testPages = [
  ['AgencyJobsPage', 'agency job board: list, filters, offers and status actions; services/agencyPortalApi.ts agencyJobsApi and services/agencySupabaseApi.ts'],
  ['AgencyRatesPage', 'agency rate cards (legacy agencyRatesApi): list, add, toggle, delete'],
  ['AgencyBillingPage', 'agency billing summary and delivered jobs (agencyBillingApi)'],
  ['AgencyProfilePage', 'agency profile view and edit'],
  ['AgencyRegisterPage', 'agency registration form and validation'],
  ['DriverEarningsPage', 'driver earnings and payouts'],
  ['DriverHistoryPage', 'driver trip history'],
  ['DriverProfilePage', 'driver profile page (docs/design-audit.md notes Account Center links that self-link; record that as a FINDING if it is still true)'],
  ['DriverRegisterPage', 'driver registration form and validation'],
  ['AdminDashboardPage', 'admin dashboard counters'],
  ['AdminDriversPage', 'admin driver list and approval actions'],
  ['AdminAgenciesPage', 'admin agency list and approval or suspension actions'],
  ['AdminUsersPage', 'admin user list'],
  ['AdminPayoutsPage', 'admin payouts review'],
  ['AdminSubscriptionsPage', 'admin subscriptions list'],
  ['ShipmentHistoryPage', 'customer shipment history'],
  ['CompanyProfilePage', 'company profile and backup section (BackupSection is a child component; mock it)'],
]

for (const [page, desc] of testPages) {
  const slug = page.replace(/Page$/, '').replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()
  const file = `frontend/src/pages/${page}.test.ts`
  tasks.push({
    id: `z-truck-test-${slug}`,
    title: `regression tests for ${page}`,
    kind: 'zcode-test',
    priority: 4,
    allow: [file],
    brief: `Page: frontend/src/pages/${page}.tsx (${desc}). Create ${file}. Read the page first, then every service and store it imports (read its import lines) so your mocks have the right shapes.`,
    check: `cd frontend && npx vitest run src/pages/${page}.test.ts`,
  })
}

const docs = [
  ['agency-guide', 'docs/USER-GUIDE-AGENCY.md', 'User guide for a transport-agency owner and staff: register and approval, fleet (vehicles), drivers (employment, invitations), jobs and offers, clients and tariffs, team and scopes, billing. Reader: a non-technical agency owner. Describe only what exists in the app routes (frontend/src/App.tsx) and say "planned" for TASKS.md modules not built (orders import, GR/LR, tracking, invoices, expenses, payroll).'],
  ['driver-guide', 'docs/USER-GUIDE-DRIVER.md', 'User guide for a truck driver: registration and KYC, going online, receiving and accepting a job offer with OTP, pickup, transit, delivery proof, earnings, history. Reader: a driver on a phone. Source: the frontend driver pages and services. Keep sentences very short.'],
  ['deploy-runbook', 'docs/DEPLOYMENT-RUNBOOK.md', 'Deployment and rollback runbook for the hosted pilot: environments, required settings by NAME only (never values), Supabase migration order, Edge function deploy, Heroku deploy, health checks (/healthz and /readyz), smoke test, rollback steps, backup and restore. Mark every step that only the owner may perform with [OWNER]. Sources: package.json, Procfile, heroku.yml, deploy-heroku.sh, supabase/, docs/QUICK_DEPLOY.md, docs/payment-production-handoff.md, TASKS.md.'],
  ['changelog', 'CHANGELOG.md', 'Keep-a-Changelog style CHANGELOG.md summarising delivered work grouped by date, from git history (git log is available) and TASKS.md. The current package version is in package.json. Facts only.'],
  ['landing-copy', 'docs/sales/LANDING-COPY.md', 'Landing page copy for the subscription: headline, subhead, 6 benefit blocks, how it works in 4 steps, FAQ (8 questions), call to action. Audience: owners of small Indian trucking agencies (5-10 trucks). Claim only features that exist today; mark upcoming ones as "coming soon".'],
  ['sales-checklist', 'docs/sales/SALES-CHECKLIST.md', 'Sales and pilot-onboarding checklist for a human seller: qualification questions, a 10-minute demo script using real routes of the app, data the agency must provide, pilot success measures, objections and answers, what is not yet available. Facts from the repo only.'],
  ['support', 'docs/SUPPORT.md', 'Support policy and first-line troubleshooting guide: how to contact support (leave phone and email as clearly marked placeholders for the owner), response times as placeholders, the 12 most likely problems an agency or driver hits with fixes drawn from the code (login and OTP, approval pending, driver not approved, vehicle not eligible, offer expired, invitation code, version conflict message).'],
]

for (const [slug, file, brief] of docs) {
  tasks.push({
    id: `z-truck-doc-${slug}`,
    title: `documentation: ${slug}`,
    kind: 'zcode-docs',
    priority: 7,
    allow: [file],
    brief,
    check: `node -e "if(require('fs').readFileSync('${file}','utf8').length<2500)process.exit(1)"`,
  })
}


// ---- wave 2: replace the legacy Edge write paths (launch blocker) --------------------
tasks.push({
  id: 'z-truck-w2-rpc-wrappers',
  title: 'service wrappers: job status, driver and truck assignment through database commands',
  kind: 'zcode-ui',
  priority: 2,
  allow: ['frontend/src/services/agencyPortalApi.ts', 'frontend/src/services/agencyPortalApi.test.ts'],
  brief: `Four methods of frontend/src/services/agencyPortalApi.ts still call Supabase Edge functions that write with the service role: agencyJobsApi.updateStatus(jobId,status) and agencyJobsApi.assignDriver(jobId,driverId) (Edge agency-portal-jobs), agencyDriversApi.assignTruckToDriver(truckId,driverId) and agencyDriversApi.unassignTruck(truckId) (Edge agency-portal-drivers). The Edge write actions are being deleted. Re-implement ONLY those four methods on top of new database commands. KEEP the method names, parameters and return type Promise<void> so no page changes; on any failure throw UserFacingError carrying the user-facing message. Do NOT touch createPayout, the list/snapshot methods or any other method.

Database contract (new SECURITY DEFINER RPCs, all return jsonb; business refusals are {ok:false,error:'<code>'}, controlled problems are thrown exceptions with fixed texts; call supabase.rpc as a METHOD of the client, never detached, see how frontend/src/services/agencyOrganizationApi.ts does it with a local cast helper because the generated types do not know these functions yet):
1. rpc('agency_job_set_status', { p_job_id, p_status }) -> {ok:true,state:'updated'|'unchanged',job} or {ok:false,error:'invalid_transition'}.
2. rpc('agency_job_assign_driver', { p_job_id, p_driver_id }) -> {ok:true,state:'assigned'|'unchanged',job} or {ok:false,error:'job_not_assignable'|'driver_not_approved'|'driver_not_employed'|'job_has_reservation'}.
3. rpc('agency_truck_assign_driver', { p_truck_id, p_driver_id, p_expected_version }) -> {ok:true,state:'assigned'|'unchanged',truck,version} or {ok:false,error:'version_conflict'|'driver_not_employed'|'driver_already_assigned'}.
4. rpc('agency_truck_unassign_driver', { p_truck_id, p_expected_version }) -> {ok:true,state:'unassigned'|'unchanged'} or {ok:false,error:'version_conflict'}.
Because the page methods do not carry a version, for methods 3 and 4 FIRST read the truck's current version with supabase.from('agency_trucks').select('version').eq('id', truckId).maybeSingle() (explicit column list, called as a client method), throw UserFacingError('Vehicle not found or access denied.') when no row, then call the RPC with that version; a version_conflict result becomes UserFacingError('This vehicle was updated elsewhere. Reload and try again.').
Message map for refusals (UserFacingError texts): invalid_transition -> 'This job cannot move to that status from its current one.'; job_not_assignable -> 'Only pending or accepted jobs can be given a driver.'; driver_not_approved -> 'This driver is not approved yet.'; driver_not_employed -> 'This driver is not employed by your agency. Add the driver in Drivers first.'; job_has_reservation -> 'This job already has a vehicle and driver reserved. Release the reservation first.'; driver_already_assigned -> 'This driver is already assigned to another truck.'. Controlled exception texts that may be shown verbatim: 'Job not found or access denied.', 'Unknown job status.', 'Your access scope does not allow this action.', 'Agency approval is required.', 'No agency profile found for this account.', 'Vehicle not found or access denied.'. Anything else collapses to the old fallbacks ('Failed to update job status', 'Failed to assign driver', 'Failed to assign truck', 'Failed to unassign truck') and is logged through the existing reportFunctionFailure or logger the file already uses.
Tests: edit frontend/src/services/agencyPortalApi.test.ts: REPLACE the existing tests of these four methods that expect supabase.functions.invoke with tests of the new behaviour (rpcMock and fromMock exist in that file; make the mock enforce that rpc/from are called as methods of the client like agencyOrganizationApi.test.ts does). Cover every refusal code and message above, the version read-then-call, the not-found vehicle, and that nothing calls functions.invoke for these four methods any more. Keep every other existing test untouched and green.`,
  check: 'cd frontend && npx vitest run src/services/agencyPortalApi.test.ts',
});


tasks.push({
  id: 'z-truck-w2-payout-wrapper',
  deps: ['z-truck-w2-rpc-wrappers'],
  title: 'agency payout request through the database command',
  kind: 'zcode-ui',
  priority: 2,
  allow: ['frontend/src/services/agencyPortalApi.ts', 'frontend/src/services/agencyPortalApi.test.ts', 'frontend/src/pages/AgencyDriversPage.tsx'],
  brief: `agencyDriversApi.createPayout(driverId, amount, note?) in frontend/src/services/agencyPortalApi.ts still calls the Edge function agency-portal-drivers action create-payout, which is being deleted. Re-implement ONLY that method on the new database command and update the one page that calls it. Do NOT touch any other method.

Database contract: supabase.rpc('agency_driver_payout_request', { p_driver_id, p_amount, p_note, p_idempotency_key }) returns jsonb: {ok:true,state:'created'|'idempotent_replay',payout:{id,amount,status,requested_at}} or {ok:false,error:'driver_not_approved'|'driver_not_employed'|'idempotency_key_reused'}. Controlled exceptions with FIXED texts that may be shown verbatim: 'Idempotency key is required.', 'Payout amount must be greater than zero.', 'Payout amount must have at most two decimal places.', 'Payout amount exceeds the per-request limit.', 'Payout note is too long.', 'Your access scope does not allow this action.', 'Agency approval is required.', 'No agency profile found for this account.'. Call supabase.rpc as a METHOD of the client (never detached) with the same local cast helper style used by the other RPC wrappers in that file because the generated types may not list the function.

Service: new signature createPayout(driverId: string, amount: number, note: string | undefined, idempotencyKey: string): Promise<void>. Refusal messages (UserFacingError): driver_not_approved -> 'This driver is not approved yet.'; driver_not_employed -> 'This driver is not employed by your agency. Add the driver in Drivers first.'; idempotency_key_reused -> 'This payment request was already used for different details. Start again.'. state idempotent_replay is a success. Anything else collapses to 'Failed to submit payment request' and is logged like the other methods in the file.

Page frontend/src/pages/AgencyDriversPage.tsx handlePayDriver (around line 160): keep one idempotency key per payment dialog OPEN: create it with crypto.randomUUID() when the pay modal opens (a useRef, reset to null when the modal closes or the request succeeds), pass it to createPayout, and on failure keep the same key so a retry is safe. Show the thrown UserFacingError message in the error toast instead of the fixed 'Payment failed' when it is a UserFacingError (use the toUserFacingErrorMessage helper already imported in that file). Validate in the page: amount at least 1, at most two decimals (message 'Enter an amount with at most two decimals'). Change nothing else on the page.

Tests: edit frontend/src/services/agencyPortalApi.test.ts: replace the existing createPayout tests (they expect functions.invoke) with tests of the new behaviour (rpcMock exists; keep the method-binding guard style used by the neighbouring wrapper tests), covering created, replay, each refusal code and message, the controlled exception texts, argument mapping (p_note undefined -> null), and that functions.invoke is no longer used. All other tests stay untouched and green.`,
  check: 'cd frontend && npx vitest run src/services/agencyPortalApi.test.ts',
})

writeFileSync(new URL('./tasks.json', import.meta.url), JSON.stringify(tasks, null, 2))
console.log(tasks.length, 'tasks written')
