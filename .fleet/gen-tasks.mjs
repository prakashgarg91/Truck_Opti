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


tasks.push({
  id: 'z-truck-to145-order-parser',
  title: 'TO-145 order import: CSV parser and row validator (pure library)',
  kind: 'zcode-ui',
  priority: 2,
  allow: ['frontend/src/lib/orderImport.ts', 'frontend/src/lib/orderImport.test.ts'],
  brief: `Create a PURE TypeScript library (no React, no network, no Supabase, no dependencies beyond what frontend already has; do not add npm packages) that turns the text of a sales-order CSV into validated, normalized rows. It is the first slice of the Order Import screen (Stitch screen f17f9e265b854a21a9c5d3f394a4b2bb). Write the tests FIRST.

Exports (frontend/src/lib/orderImport.ts):
- type OrderUnit = 'kg' | 'tonne' | 'piece' | 'carton'
- interface KnownSites { pickup: string[]; drop: string[] }   // site LABELS of the chosen client, matched case-insensitively after trimming
- interface NormalizedLine { clientOrderRef: string; lineNo: number; sku: string; description: string | null; quantity: number; unit: OrderUnit; weightPerUnitKg: number | null; lengthM: number | null; widthM: number | null; heightM: number | null; pickupSite: string; dropSite: string; pickupFrom: string | null; pickupTo: string | null; deliveryFrom: string | null; deliveryTo: string | null; stackable: boolean; fragile: boolean }   // dates as ISO strings (YYYY-MM-DD or full ISO as given, validated)
- type RowStatus = 'ready' | 'warning' | 'error'
- interface ParsedRow { rowNumber: number /* 1-based CSV line incl. header = row 1, so first data row is 2 */; status: RowStatus; messages: string[]; line: NormalizedLine | null /* null when status is 'error' */ }
- interface ParseSummary { rows: number; ready: number; warnings: number; errors: number; duplicatesInFile: number }
- interface ParseResult { headerErrors: string[]; rows: ParsedRow[]; summary: ParseSummary }
- parseOrderCsv(text: string, sites: KnownSites): ParseResult
- hashOrderFile(text: string): Promise<string>   // lowercase hex SHA-256 of the UTF-8 text using globalThis.crypto.subtle
- ORDER_CSV_TEMPLATE: string   // header line plus two example rows, valid against parseOrderCsv with matching KnownSites
- orderRowsToCsv(rows: ParsedRow[]): string   // CSV of the NOT-ready rows: columns row_number,status,messages (messages joined with ' | '), quoted correctly

CSV rules: RFC 4180 (quoted fields, doubled quotes, commas and newlines inside quotes), accept CRLF and LF, strip a UTF-8 BOM, ignore completely empty lines (but keep row numbering of the remaining lines true to the file), trim cells. A cell starting with = + - @ must be returned unchanged by the parser (no execution) and orderRowsToCsv must prefix such cells with a single quote when writing (CSV injection guard).
Header: case-insensitive, spaces/hyphens treated as underscores. Required columns: client_order_ref, line_no, sku, quantity, unit, pickup_site, drop_site. Optional: description, weight_per_unit, weight_unit (kg|tonne, default kg), length, width, height, dim_unit (mm|cm|m, default m), pickup_from, pickup_to, delivery_from, delivery_to, stackable (yes/no/true/false/1/0, default yes), fragile (same, default no). A missing required column goes to headerErrors as "Column 'sku' is missing." and then rows is [] .
Row validation (collect ALL messages for a row, exact texts): required cell empty -> "<Column label> is missing." where label is e.g. 'Order reference', 'Line number', 'SKU', 'Quantity', 'Unit', 'Pickup site', 'Drop site'; non-numeric or <= 0 quantity -> "Quantity must be a number greater than zero."; line_no not a positive integer -> "Line number must be a whole number greater than zero."; unit not in the four -> "Unit 'bags' is not supported" (echo the given value); weight_per_unit given but not a number >= 0 -> "Weight must be a number."; when unit is kg or tonne the line weight is the quantity itself so weight_per_unit is not needed; when unit is piece or carton and weight_per_unit is empty -> status warning with "Weight is missing; the load plan will treat this line as unweighted." ; dimension cells given must be numbers > 0 else "Length must be a number greater than zero." (same for Width, Height); pickup_site not in sites.pickup (case-insensitive) -> "Pickup site not found for this client."; drop_site not in sites.drop -> "Drop site not found for this client."; each date given must parse as a valid date else "<Field> is not a valid date." with labels 'Pickup from', 'Pickup to', 'Delivery from', 'Delivery to'; if both pickup_to and delivery_from exist and delivery_from is before pickup_from or any 'to' is before its 'from' -> "Delivery window ends before pickup window." for delivery_to before pickup_from, and "<Window> ends before it starts." for a window whose to precedes its from (labels 'Pickup window', 'Delivery window'). Duplicate (client_order_ref + line_no) within the file: the second and later occurrences are errors "Duplicate line in this file." and counted in summary.duplicatesInFile. Any error message -> status 'error' and line null; otherwise warnings only -> 'warning'; otherwise 'ready'.
Normalization: weights to kg (tonne x 1000; for unit kg/tonne weightPerUnitKg = 1 for kg and 1000 for tonne so that quantity x weightPerUnitKg is the line weight in kg), dimensions to metres (mm /1000, cm /100), trimmed strings, quantity as a JS number.
Tests (>= 30 cases, frontend/src/lib/orderImport.test.ts, vitest, no DOM needed): every message above, BOM, CRLF, quoted commas/newlines/doubled quotes, empty lines keep numbering, unit conversion (tonne, mm, cm), defaults, duplicates, summary counts, header errors, template round-trips with no errors, orderRowsToCsv quoting and injection guard, hashOrderFile known vector (sha256 of 'abc' is ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad) and stability. Do NOT touch any other file.`,
  check: 'cd frontend && npx vitest run src/lib/orderImport.test.ts',
})

tasks.push({
  "id": "z-truck-to145-load-planner",
  "title": "TO-145 deterministic load planner (pure library)",
  "kind": "zcode-ui",
  "priority": 2,
  "allow": [
    "frontend/src/lib/loadPlanner.ts",
    "frontend/src/lib/loadPlanner.test.ts"
  ],
  "brief": "PURE TypeScript library: no React, no network, no Supabase, no new npm packages, no Date.now()/Math.random() inside logic (take time/ids as arguments so results are deterministic). Write the vitest tests FIRST (red), then the code. Do NOT touch any other file. Money is integer paise, never floats.\nCreate frontend/src/lib/loadPlanner.ts + loadPlanner.test.ts. planLoads(orders, trucks, options) -> { loads, unmet }.\nInput order line: { orderId, lineNo, weightKg, volumeM3 (optional), pickupSite, dropSite, pickupTo (ISO|null), stackable, fragile }. Truck: { truckId, label, capacityKg, capacityM3 (optional), available (boolean) }.\nRules: group lines by (pickupSite, dropSite); within a group sort by pickupTo ascending (null last) then orderId then lineNo, so output is stable; first-fit-decreasing by weight into available trucks sorted by capacityKg ascending then truckId; never exceed capacityKg or capacityM3 (when both given); a fragile line is never placed with more than its own group's non-stackable weight above it (just: fragile lines go into a load only if the load has no non-stackable heavier line; otherwise a new load); a line heavier than every truck, or with no trucks left, goes to unmet with reason 'too_heavy' | 'no_truck'. Each load returns { truckId, lines, totalKg, utilizationPct (rounded to 1 decimal) , pickupSite, dropSite }. Same input always gives byte-identical output (test with JSON.stringify twice and with shuffled input order). >= 25 cases: empty input, exact fit, overflow, split by route, unmet reasons, fragile rule, determinism, volume limit, unavailable trucks ignored.",
  "check": "cd frontend && npx vitest run src/lib/loadPlanner.test.ts"
})

tasks.push({
  "id": "z-truck-to146-grlr-lib",
  "title": "TO-146 GR/LR number, QR payload and proof state (pure library)",
  "kind": "zcode-ui",
  "priority": 2,
  "allow": [
    "frontend/src/lib/grLr.ts",
    "frontend/src/lib/grLr.test.ts"
  ],
  "brief": "PURE TypeScript library: no React, no network, no Supabase, no new npm packages, no Date.now()/Math.random() inside logic (take time/ids as arguments so results are deterministic). Write the vitest tests FIRST (red), then the code. Do NOT touch any other file. Money is integer paise, never floats.\nCreate frontend/src/lib/grLr.ts + grLr.test.ts. Exports: formatGrNumber(prefix, sequence, financialYearStart) -> e.g. 'AGY/2026-27/000123' (Indian financial year April-March; sequence zero-padded to 6; prefix upper-cased, 2-6 letters/digits else throws); financialYear(dateIso) -> '2026-27'; buildQrPayload({grNumber, consignmentId, token}) -> string 'TRKOPT:v1:<grNumber>:<consignmentId>:<token>'; parseQrPayload(text) -> {ok:true,...}|{ok:false,error:'bad_format'|'bad_version'}; nextProofState(current, event) a pure state machine over 'created'|'picked_up'|'in_transit'|'delivered'|'receipt_confirmed'|'disputed' with events 'pickup_scanned'|'transit_started'|'delivery_scanned'|'receipt_signed'|'dispute_raised'; illegal transitions return {ok:false,error:'illegal_transition'}; disputed is reachable from picked_up, in_transit, delivered; receipt_confirmed is terminal. Tests >= 30 incl. FY boundary 31 Mar vs 1 Apr, padding, bad prefix, QR round trip, every legal and illegal transition.",
  "check": "cd frontend && npx vitest run src/lib/grLr.test.ts"
})

tasks.push({
  "id": "z-truck-to148-invoice-calc",
  "title": "TO-148 freight invoice, GST and UPI link maths (pure library)",
  "kind": "zcode-ui",
  "priority": 2,
  "allow": [
    "frontend/src/lib/freightInvoice.ts",
    "frontend/src/lib/freightInvoice.test.ts"
  ],
  "brief": "PURE TypeScript library: no React, no network, no Supabase, no new npm packages, no Date.now()/Math.random() inside logic (take time/ids as arguments so results are deterministic). Write the vitest tests FIRST (red), then the code. Do NOT touch any other file. Money is integer paise, never floats.\nCreate frontend/src/lib/freightInvoice.ts + freightInvoice.test.ts. computeInvoice({lines:[{description,quantity,ratePaise}], supplierStateCode, placeOfSupplyStateCode, gstRatePct (0|5|12|18), reverseCharge:boolean, roundOff:boolean}) -> {subtotalPaise, cgstPaise, sgstPaise, igstPaise, roundOffPaise, totalPaise}. Same state -> CGST+SGST each half (CGST must equal SGST exactly: each = round-half-up of subtotal x rate / 200, and IGST = round-half-up of subtotal x rate / 100; round-off absorbs any difference), different state -> IGST; reverseCharge true -> all tax 0 and a flag reverseCharge in the result; line amount = quantity x ratePaise rounded half-up to paise; roundOff rounds the total to the nearest rupee (50 paise rounds up) and reports the difference. Also: buildUpiLink({payeeVpa, payeeName, amountPaise, invoiceNumber}) -> 'upi://pay?pa=...&pn=...&am=1234.50&tn=INV...&cu=INR' with proper URI encoding and amount formatted from paise with 2 decimals (throws on bad VPA 'name@bank' pattern or amount <= 0); allocatePayment(invoiceOutstandingPaise, paymentPaise) -> {appliedPaise, overpaymentPaise, status:'paid'|'partial'}. Platform never holds money: no function here moves funds. Tests >= 30: intra/inter state, odd paise, reverse charge, round-off boundary, each GST rate, UPI encoding of spaces and '&', invalid VPA, allocation edges.",
  "check": "cd frontend && npx vitest run src/lib/freightInvoice.test.ts"
})

tasks.push({
  "id": "z-truck-to149-expense-lib",
  "title": "TO-149 fuel mileage and maintenance due maths (pure library)",
  "kind": "zcode-ui",
  "priority": 2,
  "allow": [
    "frontend/src/lib/fleetExpense.ts",
    "frontend/src/lib/fleetExpense.test.ts"
  ],
  "brief": "PURE TypeScript library: no React, no network, no Supabase, no new npm packages, no Date.now()/Math.random() inside logic (take time/ids as arguments so results are deterministic). Write the vitest tests FIRST (red), then the code. Do NOT touch any other file. Money is integer paise, never floats.\nCreate frontend/src/lib/fleetExpense.ts + fleetExpense.test.ts. fuelMileage(fills:[{odometerKm,litres,fullTank:boolean}]) -> {kmPerLitre|null, anomalies:[{index,reason}]} using the full-tank-to-full-tank method (partial fills accumulate litres until the next full tank; first fill only sets the baseline); anomalies: odometer going backwards ('odometer_backwards'), litres <= 0 ('bad_litres'), implied mileage below 1 or above 15 km/l ('implausible_mileage'). maintenanceDue(items:[{name,lastServiceKm,intervalKm,lastServiceDateIso,intervalDays}], currentKm, todayIso) -> items with {dueInKm, dueInDays, status:'ok'|'due_soon'|'overdue'} where due_soon = within 10% of the interval or 14 days, whichever applies first, overdue when either limit passed. expenseSummary(expenses:[{category,amountPaise,dateIso,truckId}], fromIso, toIso) -> per-category and per-truck totals in paise, sorted by total descending then name. Tests >= 30 incl. empty input, partial fills, backwards odometer, boundaries of due_soon, date range inclusivity.",
  "check": "cd frontend && npx vitest run src/lib/fleetExpense.test.ts"
})

tasks.push({
  "id": "z-truck-to150-payroll-lib",
  "title": "TO-150 driver pay and report aggregation (pure library)",
  "kind": "zcode-ui",
  "priority": 2,
  "allow": [
    "frontend/src/lib/driverPayroll.ts",
    "frontend/src/lib/driverPayroll.test.ts"
  ],
  "brief": "PURE TypeScript library: no React, no network, no Supabase, no new npm packages, no Date.now()/Math.random() inside logic (take time/ids as arguments so results are deterministic). Write the vitest tests FIRST (red), then the code. Do NOT touch any other file. Money is integer paise, never floats.\nCreate frontend/src/lib/driverPayroll.ts + driverPayroll.test.ts. computeDriverPay({basePaise, trips:[{tripId,distanceKm,loadedKg,dateIso}], perKmPaise, perTonnePaise, advancesPaise, deductions:[{reason,amountPaise}], periodStartIso, periodEndIso}) -> {earningsPaise, deductionsPaise, advancesPaise, netPaise, shortfallPaise, lines:[...]} ; trips outside the period are ignored and reported in 'ignoredTripIds'; per-tonne uses loadedKg/1000 rounded half-up per trip; net never below zero, the shortfall (what advances/deductions exceed earnings) is reported as shortfallPaise and carried, not lost. tripsByDriverReport(trips, groupBy:'driver'|'truck'|'month') -> sorted stable aggregates {key,tripCount,distanceKm,loadedKg}. Tests >= 30 incl. period boundary inclusive, shortfall carry, zero trips, rounding half-up, sort stability.",
  "check": "cd frontend && npx vitest run src/lib/driverPayroll.test.ts"
})

tasks.push({
  "id": "z-truck-to147-tracking-lib",
  "title": "TO-147 tracking ETA, stale-ping and incident rules (pure library)",
  "kind": "zcode-ui",
  "priority": 2,
  "allow": [
    "frontend/src/lib/trackingRules.ts",
    "frontend/src/lib/trackingRules.test.ts"
  ],
  "brief": "PURE TypeScript library: no React, no network, no Supabase, no new npm packages, no Date.now()/Math.random() inside logic (take time/ids as arguments so results are deterministic). Write the vitest tests FIRST (red), then the code. Do NOT touch any other file. Money is integer paise, never floats.\nCreate frontend/src/lib/trackingRules.ts + trackingRules.test.ts. haversineKm(a,b); isStalePing(lastPingIso, nowIso, thresholdMinutes=30); estimateEta({currentLatLng, destLatLng, averageSpeedKmph, nowIso}) -> ISO string using straight-line distance x 1.3 road factor, throws if speed <= 0; detectIncidents(pings:[{tsIso,lat,lng,speedKmph}], opts) -> incidents: 'long_halt' (speed 0 for >= haltMinutes, default 60, outside no site), 'overspeed' (> maxKmph default 80), 'route_deviation' (distance from the straight pickup-drop line > deviationKm default 25), each with start index, end index, and a stable key string so the same incident is never reported twice; pings must be sorted, unsorted input throws 'unsorted_pings'. Tests >= 30 incl. antimeridian-free distances against known values (Delhi-Mumbai ~1150 km straight line within 1%), halts that end, overlapping incidents, dedupe keys.",
  "check": "cd frontend && npx vitest run src/lib/trackingRules.test.ts"
})

writeFileSync(new URL('./tasks.json', import.meta.url), JSON.stringify(tasks, null, 2))
console.log(tasks.length, 'tasks written')
