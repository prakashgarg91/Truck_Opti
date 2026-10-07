# Truck_Opti transport-agency pilot: requirements and completion plan

Updated 2026-10-07 after checking the pasted TO-142 report against the current working tree. Owner-requested scope: hosted software for 1–2 Indian goods transport agencies, 5–10 trucks each, managed by 1–2 platform staff.

This is the authoritative product requirements and phased plan. TASKS.md alone owns execution status; ARCHITECTURE.md owns architecture; docs/design-audit.md owns implemented-screen UX evidence. This replaces the June “post-launch/all live” feature claims. Historical roadmaps remain recoverable in Git; they are not current readiness evidence. The October 6 assessment and October 7 update change documentation only; separately authored TO-142 implementation is present but uncommitted and awaiting review.

## 1. Verdict and evidence

**Not ready to sell as a fully functioning transport-company management system.** A paid pilot becomes reasonable only after safe tenant isolation, real shared persistence, one complete order-to-cash journey and hosting/restore proof. Screen existence and local green suites do not establish that gate.

### Current repair checkpoint — 2026-10-07

Checked the owner's pasted TO-142 report, `agent-results/032-result.md`, current migration/function source and freshly executed local tests. Main HEAD before this update is `76ef129a`; fetch exit 0, 0 behind / 1 ahead of origin/main. TO-142 product changes and its result are **uncommitted working-tree work, AWAITING_REVIEW**. This update neither integrates those changes nor certifies their hosted behavior.

| Fresh command (repository root) | Result | Evidence limit |
|---|---|---|
| `node scripts/dispatch_delivery_journey.db.test.mjs` | exit 0, 42/42, 0 findings | SQL/PGlite; not credentialed browser or true concurrent transactions |
| `node scripts/customer_journey_isolation.db.test.mjs` | exit 0, 28/28, 0 findings | SQL/PGlite; not GoTrue/PostgREST HTTP |
| `node scripts/admin_rls_proof.db.test.mjs` | exit 0, 56/56, 1 finding (G4) | SQL plus source checks; not Edge/Storage runtime |
| `node scripts/trip_transition_integrity.db.test.mjs` | exit 0, 21/21 | Ordered/OTP SQL proof; not hosted/device acceptance |

All four replay 39 migrations including `20261006120000_tenant_authority_repair.sql`, `20261006130000_dispatch_producer_and_trip_propagation.sql` and `20261006140000_revoke_setup_status_view_reads.sql`. They verify candidate local repairs; the migration filenames are identifiers, not proof of rollout.

Worker-reported additional evidence in 032-result: 553/553 unit tests, build/lint exit 0, packing 18/18, routing 15/15 and glue 0 gaps. Fresh unit verification for this update is recorded in 031-result's October 7 addendum. Other worker gate claims have not all been independently rerun here. No new hosted/Edge HTTP, signed-link expiry runtime, mobile/desktop or device proof.
Fresh `npm run test:unit` (frontend): exit 0, 553/553, 38 files. Existing React act/GoTrue warnings remain. This confirms the current local suite, not a full independent security review of the patch.

Remaining G4 is use of `user_metadata` for invoice contact/company display, not authorization. The worker assigns it to TO-148; move it to authoritative company/billing snapshots without stripping required invoice particulars. That proposed deferral does not establish owner approval or production readiness.

### Historical baseline — 2026-10-06

Assessment tree: main aba05fc8. Then fetch exit 0; origin/main...HEAD = 0 behind / 0 ahead before the planning commit. There were 13 checkouts including primary, 11 parked awf worktrees and one legacy detached checkout. Pre-existing untracked .serena/, .vscode/mcp.json.bak-qdrant-cleanup and closeout-logs/ remain preserved. Do not create branches/worktrees or discard parked work.

Historical 2026-10-06 evidence (superseded by the current checkpoint where counts/findings differ):
- frontend npm run test:unit: exit 0, 551/551 tests, 38/38 files. React act and repeated GoTrue client warnings remain in test output.
- frontend npm run build: exit 0, includes TypeScript; PGlite/browser-external/eval and large-chunk warnings remain.
- frontend npm run lint: exit 0, zero warnings under the lint gate.
- node scripts/dispatch_delivery_journey.db.test.mjs: exit 0, 35/35 cases, **6 separate findings reproduced**.
- node scripts/customer_journey_isolation.db.test.mjs: exit 0, 25/25 cases, **3 separate findings reproduced**.
- node scripts/admin_rls_proof.db.test.mjs: exit 0, 53/53 cases, **4 separate findings reproduced**.
- These SQL proofs use PGlite/PostgreSQL 18.3, not the entire Supabase HTTP/Auth/Storage/Edge runtime. They are not hosted E2E proof.
- Additional fresh gates: packing 18/18, trip SQL 21/21, routing 15/15, glue 0 gaps, Python auth 6/6, policy suites 62/62 after board alignment (initial pre-queue 61/62). Documentation integrity: 13 new briefs and 33 screen/workflow rows with resolved board references.
- Browser smoke 12/12 and 63/63 and Python 6/6 in the earlier board are historical to this assessment; no fresh credentialed hosted browser test was performed.

Existing evidence: agent-results/024-result.md, 025-result.md, 026-result.md and 029-result.md. agent-results/functional-coverage.md is a historical October 3 inventory, superseded where later task results disagree.

### Repair status and remaining launch gates

| Gap | Evidence | Required completion |
|---|---|---|
| Unauthorized agency shipment claims | Candidate repaired locally: consent predicate denies foreign agency claim and derived offer; dispatch 42/42 | Supervisor review/integration, production consent creation in the authorized dispatch pipeline and actual HTTP denial proof |
| Suspended agency operational writes | Candidate repaired locally: DB write denials now regression assertions | Audit all operational entry points, service/admin exceptions and existing-session revocation; hosted proof |
| Fleet guard RLS conflict/service bypass | Candidate repaired locally: valid assignments and invalid/cross-agency/duplicate denial tested | Transactional vehicle/driver reservation, race tests and actual Edge assignment journey |
| Missing booking dispatch producer | Function now exists locally; owner-guarded producer covered by dispatch/customer proofs | TO-143 remains: approved-agency/fleet scope, consent production, availability/vehicle reservations, concurrent/replayed booking and real notification/capability behavior |
| Delivered trip left shipment/job pending | Candidate repaired locally: delivery trigger updates dependent records once | TO-143/146: aggregate per-load/per-stop quantities, partial/disputed/return states, simultaneous commands and hosted E2E |
| Foreign usage/plan RPC access | Candidate repaired locally: caller binding/grants and lookup-path regression | Supervisor review, integration and real HTTP own/foreign/service/admin denial matrix |
| Public invoice/trip-proof storage | Local schema now private; signed-link consumers and invoice-view function authored | Actual Storage/Edge HTTP access, existing-file compatibility, expiry/failure UX, support audit and revocation design; not deployed |
| Lookup-path/view/document-RPC privilege hygiene | Candidate repaired locally; anonymous/client view reads denied in fresh admin proof | Final grant/service-consumer review and hosted replay; G4 invoice display source remains TO-148 |
| Cloud-only pages fail in local mode | design-audit D1, 12 endpoint families | Honest connected-account state; no placeholder endpoint traffic; local work cannot masquerade as shared agency data |
| Transport invoice fields/rates are incomplete | InvoicePage.tsx, invoiceGenerator.ts, whatsappShare.ts | Bill-to and ship-to party snapshots, configurable approved tax profile, correct currency rounding; no universal 18% freight rule |
| Hosted identity/storage/function/deployment proof absent | Board and result limitations | Authorized staging replay + GoTrue/PostgREST/Storage/Edge round trips + multi-role E2E + recovery drill |
| Hindi/accessible UI and critical state coverage incomplete | design-audit D2–D4 | Restore selected-language behavior for driver journey, labelled actions/forms, keyboard and mobile verification |

Invoice confidentiality remains a launch requirement. The private-bucket candidate is now present locally, but no hosted policy change was performed. Invoice links are minted for 300 seconds and trip-photo links for 60 seconds according to source/report; an already issued bearer link does not instantly revoke when app access changes. Verify actual expiry and decide controlled revocation before advertising it.

Further TO-142/143 review items: the new booking producer filters approved drivers by vehicle type and does not itself create agency-consent records or reserve specific fleet vehicles. The delivery trigger marks shipment/all agency jobs delivered after an offer completes; this is not the future multi-load/partial-receipt aggregation model. The worker also reports a stale `DriverRegisterPage.tsx` public-URL consumer for private driver documents; verify and fix it in the document-consumer follow-up. These remain review/engineering items, not closed pilot requirements.

## 2. Product boundary and approach

Recommended: retain the React/TypeScript PWA, existing packing engine and Supabase/PostgreSQL authority model; repair them and build connected modules incrementally. Prefer a single maintainable app with role workspaces, not four separate apps. Add a small Android tracking companion only when reliable background tracking is required.

Alternatives:
1. Existing stack + reliable hosted backend: lowest rewrite risk; recurring infrastructure cost; recommended for paid operations.
2. Existing stack + phone for bounded calculation jobs and encrypted backup copies: cheap experiment; phone failure must never block orders, proof or invoices.
3. Full PocketBase/phone backend replacement: potentially inexpensive hardware, but rewrites auth, RLS, migrations, storage, Edge functions and realtime. Separate assessed project, not an implicit pilot requirement.

Initial agency operations focus: contracted clients, owned fleet, optional manually recorded hired vehicles. Do not launch a nationwide marketplace, automatic tender auction or multi-level regional sales hierarchy. The owner has 1–2 staff, so use onboarding, support and exception queues with clear ownership.

Pilot must cover manual/CSV orders, feasible truck plan, quotation approval, allocation, pickup/GR, tracking, delivery/POD, invoice, receipt, expenses, fuel and salary settlement. Generic ERP import and safe Tally/first-client connector follow the same normalized order contract; broad ERP catalog and advanced optimization are later work.

## 3. Users, company boundaries and permissions

| Actor | Permitted work | Must be denied |
|---|---|---|
| Platform owner/admin | Agency onboarding/suspension, staff management, subscription invoices, support, deployment/provider health | Unlogged tenant data edits; automatic access to every confidential document |
| Platform support (1–2 staff) | Assigned cases and onboarding, time-bounded justified tenant access with audit | Granting own admin rights, deleting settled records, unrestricted impersonation |
| Agency owner | Own company, branches, staff, fleet, drivers, clients, commercial settings, approvals/reports | Other agencies' orders, vehicles, contacts or earnings |
| Agency dispatcher | Orders, capacity plans, assignment, trip exceptions, GR | Tax settings, payroll approval or unrestricted finance exports |
| Agency accountant | Freight invoices, receipts, expense/fuel approvals, salary runs | Dispatch/security grants unless explicitly assigned |
| Client planner | Own company orders/sites/SKUs, transport requests, plan/quote approvals, trip/POD view | Agency salaries, unrelated clients, driver personal documents |
| Client accounts | Own freight invoices, disputes and receipts | Other client financial records |
| Driver | Assigned vehicle/trips, offer response, trip checkpoints, expense/fuel submissions, own salary statement | Other drivers' salaries or reading pickup/delivery secrets |
| Site receiver/consignor | One shipment/stop-specific signed link for handover/receipt | Fleet/client browsing or full tenant login rights |

Support multiple agency staff without abusing the global role field. Model organizations, memberships, agency-client agreements and site contacts. One client may use multiple agencies: explicitly grant an order to selected agency; this does not give that agency all of the client's orders. Test both directions of isolation using two agencies and two clients.

## 4. Complete journeys and exception handling

### Agency onboarding
Platform creates invitation → agency owner accepts/sets verified credential → company/branch/tax/bank/support settings → fleet and driver setup → staff invitations → client/sites/rates → trial order → onboarding checklist complete. Agency creates trucks/drivers; platform reviews necessary approvals and provides support. No fabricated “verified” badge.

Fleet: registration, ownership/hired status, body/length/width/height, legal payload, tare/gross limits, axle constraints if known, permits/fitness/PUC/insurance dates, availability, maintenance block, assigned driver and actual GPS source. Vehicle type catalog is separate from agency vehicle instances.

Driver: licence/expiry/class, contact, emergency contact, employment type, document access, assigned vehicle, shift/availability, bank reference as necessary, salary agreement and approval status. Minimize stored identity data; no unnecessary Aadhaar collection.

### Client order → truck requirement → dispatch
Planner creates/imports sales order with client/source ID, revision, item/SKU, UOM/quantity, dimensions/weight, packing/stackability, fragile/hazardous/refrigeration requirements, pickup warehouse/window and ship-to contacts/window; bill-to may be different.

Validate units/missing dimensions/address coordinates → preview and resolve invalid rows → persist draft → group compatible pickups/drops and delivery dates → estimate count/types of trucks → show packing feasibility, weight/volume utilization, unmet demand and assumptions → compare eligible actual fleet → cost/rate quote → client/agency approval → reserve trucks and drivers transactionally → issue dispatch/manifest and GR/LR → notify assigned drivers.

One sales order can require multiple trucks, and one truck can carry several compatible orders. Persist allocation lines: order line, truck/load/trip, quantity, weight and destination stop. Protect remaining quantity against duplicate dispatch, amendments and cancellation. A client may request a vehicle without knowing dimensions: planner must show an estimate needing confirmation, not a certified 3D result.

Route plan uses road distances/truck restrictions when available. Current RoutesPage uses Haversine and fixed average costs: display estimate provenance, not guaranteed road routing/ETA. Configure depot, return legs, loading/unloading duration, customer delivery windows, no-entry restrictions and multi-stop unload order. Never infer feasible/legal load from volume alone.

### Driver pickup → transit → delivery
Offer/assignment → driver accept/decline → report to pickup → record arrival → load verification/photos/item counts → authorized consignor confirms handover/start challenge → departure → timestamped location points and checkpoints → destination arrival → recipient records actual received quantities, shortage/damage/rejection plus photos/signature/name → authorized completion challenge → delivered/partially delivered/disputed/return-required → agency review → finance eligibility.

Use distinct pickup and delivery challenges, bound to shipment + stop + action + actor. Server generates/verifies; persist hash/expiry/attempt limits/used time; raw challenge absent from driver reads/logs/QR. Preserve existing ordering/lockout/idempotency protections. An OTP only confirms a handover action; it is not sufficient proof of physical receipt by itself.

Offline: save draft events/photos encrypted where supported; mark pending sync visibly. Authoritative start/end remains server-verified. Offline emergency override needs dispatcher approval, reason, evidence and reconciliation; it never silently marks OTP verified. On reconnect, replay idempotently and retain device capture time plus server receipt time.

### Breakdown, emergency, delay, diversion and returns
Driver taps phone contact immediately → report trip, location/accuracy, issue type, evidence → dispatcher acknowledgment/assignment → replacement vehicle/cargo transfer or recovery → client notification → resolution and costs. Phone-call initiation works even if API submit fails; queue incident draft. Never display an invented emergency/help number; configure agency support and verify any public emergency number before use. Do not promise 24×7 monitored response with only 1–2 staff.

Handle loading cancellation, truck no-show, driver absence, accident, signal loss, late arrival, additional stop, return goods, POD dispute and document expiry. Reassign only with audited authorization; revoke old driver's access; preserve custody/GR history.

### Delivery → invoice → collections → agency closure
Accepted POD/approved billable event → freight draft with contract tariff and actual permitted extras → accountant approval → immutable numbered invoice snapshot → private PDF/share → due date/outstanding → recorded bank/UPI/cash receipt → allocation/partial payments → dispute or credit/debit note → reconciliation. Final invoices are amended by adjustment documents, not overwritten.

Distinguish agency freight invoices from Truck_Opti SaaS subscription invoices and from the client's sales-of-goods invoice. Manual receipt recording does not mean bank verification or gateway settlement. SaaS pilot subscription can use manually invoiced, reconciled bank/UPI payment; payment gateways remain owner/provider-gated.

### Expenses, fuel, payroll
Driver/dispatcher submits expense (trip/truck, category, date, amount, receipt, advance/payment mode) → accountant validates/rejects → approval ledger → trip P&L/cash advance settlement. Track diesel, toll/FASTag, parking, loading, unloading, repairs, detention and miscellaneous separately.

Fuel entry records litres, rate, total, odometer, station, full/partial fill, receipt and payer; detect duplicate/impossible odometer and quantities; manual versus sensor evidence labelled. Mileage requires enough comparable data; app cannot claim automatic fuel theft detection from manual logs. Stops use configured speed/dwell thresholds, GPS uncertainty, authorized stop reasons and detention rules.

Salary agreement: fixed/monthly or trip/daily/km component; effective dates, attendance/leave, trip allowances, overtime/incentives, approved advances and deductions. Freeze a monthly run with itemized formula inputs, review, payslip and payment reference. Salary and trip earnings are different concepts; prevent double-paying advances/allowances. Statutory payroll treatment requires accountant validation before automation.

## 5. Screen backlog: existing versus pending

Existing App.tsx routes include booking, sale orders, packing, routes, tracking, invoice/history, agency dashboard/fleet/jobs/billing/drivers/rates/profile, driver dashboard/trip/earnings/history/profile/KYC and admin agencies/drivers/users/payouts/subscriptions/contact. These are reuse candidates, not all-complete claims.

“New” below means no dedicated route found in App.tsx or feature file inventory; some logic may be reusable. Proposed route names are design targets, not current URLs. Screens may share tabs/drawers where appropriate.

| Workspace / screen | Current baseline | Required delivery | Phase/task |
|---|---|---|---|
| Agency onboarding checklist/company settings | /agency/register, /agency/profile | Resume setup, branch/tax/bank/contact settings, completion proof | TO-144 |
| Agency staff/roles/invitations | No dedicated route | /agency/team, roles and access review | TO-144 |
| Fleet/docs/availability | /agency/fleet | Real vehicle specifications, ownership, expiry, service blocks | TO-144 |
| Drivers/employment/assignment | /agency/drivers | Agency-created drivers, safe invitation, shifts/salary agreement | TO-144 |
| Client/site/contract master | /management/customers, /agency/rates partial | /agency/clients, bill-to/ship-to, tariffs and credit terms | TO-144 |
| Client order register/editor | /sale-orders | Sales order headers/lines/revisions, sites/windows, persistent draft | TO-145 |
| Import preview/errors/mapping | CSV/XLS parser in SaleOrdersPage | Unit/SKU/site mapping, duplicates, invalid rows, resumable batches | TO-145 |
| Requirements/plan comparison | /packing, /routes partial | /planning, truck count/types, unmet quantities, availability | TO-145 |
| Client transport requests/quotes | /booking/new partial | /requests, approvals and agency selection | TO-145/146 |
| Agency dispatch board/detail | /agency/jobs; candidate booking producer and delivery propagation now locally tested | /agency/dispatch, consent pipeline, reservations, manifest, exceptions and real multi-role runtime proof | TO-143/146 |
| GR/LR register/editor/print | LR number on invoice only | /agency/gr, revision/void controls, PDF and QR | TO-146 |
| QR verification | No dedicated route | /verify/gr/:token, redacted authenticity/custody status | TO-146 |
| Driver trip checkpoints | /driver/trip/:jobId | Quantity/custody verification, retry/offline/permissions | TO-143/146 |
| Recipient POD/handover | Photos/OTP in current trip | /receive/:token, actual lines/shortage/signature/evidence | TO-146 |
| Live fleet map/trip timeline | /tracking and browser GPS | /agency/tracking, stale state, stops, restricted client view | TO-147 |
| Tracking permissions/device diagnostics | Basic GPS message | /driver/tracking-status, last sync, battery/permissions | TO-147 |
| Incident report/dispatcher queue | No dedicated route | /driver/incidents, /agency/incidents, call + assignment | TO-147 |
| Driver expense submission | No dedicated route | /driver/expenses, receipt and advance linkage | TO-149 |
| Agency expenses/approval/cashbook | No dedicated route | /agency/expenses, /agency/advances, approvals/reconciliation | TO-149 |
| Fuel log/consumption/stops | No dedicated route | /driver/fuel, /agency/fuel, evidence and alerts | TO-149 |
| Maintenance/doc renewals | Fleet partial | /agency/maintenance, service due, availability block | TO-149 |
| Freight invoice register/editor | /invoice/:shipmentId partial | /agency/invoices, contract charges/tax profile/version | TO-148 |
| Receivables/receipts/adjustments | /agency/billing partial | /agency/receivables, receipt allocation, disputes/credit notes | TO-148 |
| Client finance/documents | Generic invoice/history | /client/invoices, POD/GR/download/dispute by company | TO-148 |
| Driver salary agreements/attendance | /driver/earnings is trip earnings | /agency/payroll, attendance, run/approve/statement | TO-150 |
| Driver salary/advance statement | /driver/earnings partial | /driver/salary, payslip and reconciliation | TO-150 |
| Agency ERP/API integration center | No dedicated route | /integrations, connector credentials/mapping/sync/retry | TO-151 |
| Client integration/order-sync history | No dedicated route | /client/integrations, duplicate/conflict resolution | TO-151 |
| Agency performance/finance reports | Dashboards partial | /agency/reports: utilization, trip P&L, overdue, fuel/driver | TO-150 |
| Platform onboarding/support console | /admin/agencies, /admin/contact partial | /admin/onboarding, assigned checklist/cases/access audit | TO-152 |
| Platform tenant plan/usage/billing | /admin/subscriptions, /admin/users | Pilot limits, own SaaS invoice, suspension/export | TO-152 |
| Platform health/backups/jobs/providers | No dedicated route | /admin/operations, health, restore/queues/alerts/config capability | TO-152/153 |
| Company export/offboarding/privacy | Backup utilities partial | Tenant export, retention and role revocation workflow | TO-152/153 |

UI production requirements for every entry: real action-to-API mapping, server permissions, loading/empty/error/success/permission states, drafts/retry, mobile 390×844 + desktop 1280×900, keyboard/accessibility and selected Hindi/English driver labels. Existing missing Stitch designs (/subscription, /agency/profile, /management/cartons, /driver/profile) are different from missing product functionality. Do not count a generated design as a shipped screen. This documentation task performed no Stitch mutations; actual UI work must follow current stitch_guide and the repository policy.

## 6. Persistence, business model and interfaces

Reuse current tables after inspecting final migrations. Introduce normalized structures only where no equivalent exists:
- organizations/memberships/agency-client agreements/sites/contacts;
- agency-owned fleet/driver employment/availability and tariff versions;
- sales orders/lines/import batches/allocations/plans/loads/stops;
- shipments/agency jobs/offers/trip events (existing boundaries reconciled);
- consignment notes/versioned manifests/challenges/POD and POD lines;
- freight invoices/lines/tax snapshots/receipts/allocations/adjustments;
- expenses/advances/fuel/attendance/salary agreements/payroll runs/lines;
- incidents/actions, GPS device bindings/points/stop events;
- integration connections/sync cursors/external references/job outbox/audit events.

Use tenant keys, membership predicates and cross-table foreign/unique constraints. Server assigns tenant, document numbers, authoritative timestamps and approval transitions; never trust browser-supplied tenant/price/role. Object files are private with tenant ownership checks and narrow signed links. Avoid exposing KYC/bank data through QR or client map.

Money: integer paise for stored totals or precise decimal with a documented rounding policy; quantity/unit conversion explicit (kg/tonne/mm/metre). Dates stored UTC, displayed Asia/Kolkata; fiscal-year document sequences and local reporting dates explicit. Transport-tax profile and approved rates/effective dates must be snapshotted at issue time.

Proposed command contracts (implementation must first map these to existing services/RPCs):
- planTransport(request): returns versioned plan, truck suggestions/count, allocations, route estimates, unmet demand and warnings.
- authorizeAgency(orderId, agencyId, expectedVersion): creates scoped permission, not global client access.
- dispatchLoad(loadId, vehicleId, driverId, expectedVersion, idempotencyKey): verifies tenant/capacity/approval/availability, reserves and creates authorized offer atomically.
- advanceTrip(tripId, stopId, action, expectedVersion, proofRef, challengeResponse, idempotencyKey): verifies permitted state and updates dependent statuses once.
- issueConsignmentNote(loadId, expectedVersion, idempotencyKey): freezes cargo/custody snapshot and creates scoped verification token.
- recordPOD(stopId, lines, receiver, evidenceRefs, expectedVersion, idempotencyKey): records actual received/exception quantities and invoice eligibility.
- issueFreightInvoice(draftId, expectedVersion, idempotencyKey): recomputes from approved tariff/tax profile; immutable issued document.
- importOrders(connectionId, batchId, normalizedOrders): deterministic validate/upsert with source-company/order/line/revision identity.

All mutations return typed results with correlation IDs, not raw SQL/provider errors. Jobs use a persisted outbox, bounded retry/backoff/dead-letter queue and idempotency; no delivery state fabricated by optimistic UI.

State machines:
- Order: draft → validated → approved → allocated/partially allocated → dispatched → fulfilled/partial/returned/cancelled.
- Trip: offered → accepted → arrived_pickup → loaded/pickup_verified → in_transit → arrived_delivery → received/partial/disputed → closed (incident path explicit).
- Freight invoice: draft → approved → issued → partly_paid/paid/disputed → credited/void subject to accounting rules.
- Expense/payroll: submitted/draft → reviewed → approved → posted/paid; settled lines immutable.

Detailed transition permissions/version rules are pinned in each bounded implementation brief; do not create two competing state engines.

## 7. OTP/SMS and communication without a provider

Login authentication is independent from physical pickup/delivery challenges. Pilot login can use existing server-verified password auth and Google only when configured. Agency-created driver credentials use secure invitations or expiring one-use activation; no shared/default passwords. Verify account recovery and privileged-admin protection. Email OTP requires functioning email delivery; do not label it operational until tested.

For transport verification, prefer authenticated consignor/receiver approval or an expiring stop-scoped link delivered by verified email/manual assisted contact. If numeric OTP is used, expose it only to the authorized consignor/receiver—not driver—and verify server-side. A manually shared message is not automated SMS delivery. Supervisor override has separate authority, reason and evidence; receiver confirmation still records material quantities.

Implement NotificationGateway with capability/status, channel, recipient, template, deduplication key, attempts and delivery outcome. Initially in-app inbox + manual WhatsApp share/email as actually configured. User-triggered wa.me sharing is not a WhatsApp Business API integration and provides no delivery proof.

Later compare SMS quotes on effective pilot cost: setup/DLT/entity/header/template costs, minimum recharge, per segment, taxes, retries, sender support and delivery reports. SMS is optional for the core pilot; select a provider only after current quotes. Do not use the old phone's consumer SIM as an assumed compliant bulk gateway or claim a provider is cheapest without evidence.

Capacity example, not forecast: 20 trucks × 2 trips/day × 30 days = 1,200 trips/month; two codes each = 2,400 challenge deliveries before retries. Daily actual activity may be much lower. Budget notifications separately from SaaS revenue.

## 8. ERP and client-side computation

Start with canonical CSV/XLS import/export and documented API; client may export orders from any ERP. Persist source company, external order/line IDs, version, requested date, bill-to, ship-to, SKU/UOM, qty, weight/dimensions, requirements and cancellation status.

Then implement one connector for the first real client's ERP and version, preferably Tally where applicable. Tally exposes integration mechanisms; desktop/local ERP requires a customer-controlled outbound connector. Never expose its LAN port publicly. Scope secrets per client, encrypt server-side, rotate/revoke, and never log credentials.

Connector screen: test connection/read permissions, map company/sites/SKUs/UOM, preview sync, approve import, view last success/errors, retry/dead-letter and revoke. Poll/webhook/agent jobs are idempotent, checkpointed and replayable. Write-back of dispatch/POD/invoice is opt-in and reconciled, not silently enabled. ERP remains authority for sales order changes; Truck_Opti owns dispatch/custody/transport invoices. Revisions after dispatch need explicit quantity/return reconciliation.

Processing:
- Browser worker: input normalization, CSV/XLS parsing, deterministic packing preview for small jobs; cache by data hash+algorithm version. Never authorize final price/dispatch/payroll in a browser.
- Python CLI: optional portable calculation tool using the same versioned JSON input/output and golden fixtures; bounded runtime/memory, cancellation, no production credentials. Reuse existing apps/web packing code before duplicating it.
- VBA: optional Excel import/export template only, if first client needs it; macros are not a required platform backend.
- Server: persist, authorize, verify feasible capacity and money, number documents and finalize transitions. Use bounded asynchronous heavy jobs; validate any untrusted browser/phone result before accepting.
- Avoid premature optimizer microservices: pilot heuristic first, measure count/latency/packing quality, only then add a Python worker when it improves a measured bottleneck.

Planning tests: mixed UOM; weight-limited versus volume-limited loads; nonstackable cargo; multi-drop unload sequence; impossible cargo; unavailable vehicles; partial orders; duplicate imports; cancelled/amended order; no eligible truck; road-distance provider outage.

## 9. Serdroid hosting assessment

Inspected D:/Github/Serdroid/AGENTS.md and README.md. Documented design: Kotlin control app → Go supervisor on localhost:8401 → PocketBase on localhost:8090 + cloudflared/Termux + deployed services. This is source/documentation evidence only: no phone, deployment, load test or backup restore was verified.

Truck_Opti currently depends on Supabase Auth, PostgreSQL RLS/RPCs, Storage, Realtime and Edge Functions; PocketBase is not a drop-in replacement. Avoid accepting README memory/cost/uptime claims as benchmarks. PocketBase's own docs warn about production-critical use before stability guarantees.

Recommended role for old phone: non-authoritative calculation worker, encrypted backup replica or supervised demonstration. Keep primary shared data on a dependable host. Phone loss/heat/reboot/network outage must not lose invoices/POD or halt operations. It is not a substitute for SMS onboarding.

If owner insists on phone as primary host: separate explicit architecture choice and measured trial. Require actual ARM64 runtime compatibility; authenticated tunnel; admin surface restricted; TLS; auth/storage/RLS replacement plan; power/thermal/reboot tests; off-device encrypted backup and clean-device restore; outage-visible UI; patch/recovery runbook and an exit migration. Do not run an entire self-hosted Supabase Docker stack on the current Serdroid design without a demonstrated compatible environment.

Provisional pilot targets (requirements to measure, not achieved claims): shared persistence survives restart; recovery point ≤24h with an immediate backup after critical setup/settlement; recovery time ≤4h; 7-day uptime/power/network rehearsal; 20 vehicle feeds for 10h/day; no loss/duplication on retries; documented outage contact. Tighten recovery point before accepting daily volume beyond pilot limits.

GPS sizing assumption: 20 trucks × 10h × 120 points/hour at 30-second sampling = 24,000 points/day, 720,000/month; raw payload storage excludes indexes/photos/backups. Batch/compress/filter redundant points, keep a current-location row separate, configure active-trip retention and archive. Do not perform road geocoding on every point. Capture quality/time and show last-seen; a stale position must not be labelled live.

PWA browser geolocation exists but screen-off/background behavior is not proven. Continuous tracking requires an Android foreground tracking design or tested dedicated tracker, permission disclosure, device binding, battery/reboot tests and offline buffering. Public client links expose only their trip with token expiry/revocation, not driver's off-duty history.

## 10. India-specific requirements and reviewed sources

This is an engineering scope, not a tax/legal certification. Accountant/owner must confirm each agency's actual registrations, GTA election/charge model, exemptions, invoicing regime and statutory payroll before real issue.

- Freight tax cannot universally be 18%; separate SaaS tax from transport tax and support reviewed forward/reverse-charge profiles with effective dates. CBIC rules specify additional particulars for transport invoices (including consignor/consignee and goods/vehicle/route information). Verify current notifications at implementation; some CBIC pages are archival.
- GR/LR/consignment note: agency/branch sequence, date, consignor/consignee, bill-to/ship-to, goods/packages/weight, vehicle, origin/destination, freight payer/basis, declared value, source invoice/e-way reference, liability/remarks, signatures/custody and revisions. QR proves access to a redacted versioned record, not tax compliance.
- E-way bill: store number/expiry/transporter/vehicle and uploaded authoritative document; warn/block per approved operational rules. Official generation/Part-B update/API requires eligible credentials/authorization. App QR is not an official e-way or e-invoice IRN QR.
- Driver/fleet: document expiry, commercial class, insurance/permits/fitness/PUC, lawful capacity, maintenance lock and hired-vehicle agreements.
- Data: privacy notice/purpose/retention, driver location disclosure, narrow support access, export/deletion workflows consistent with accounting retention. MeitY notified DPDP Rules in 2025 with phased implementation; confirm exact applicable provisions at launch.

Sources reviewed 2026-10-06:
- [TRAI advice to senders](https://www.trai.gov.in/advice-to-senders) — registration/header/template responsibilities.
- [MSG91 official OTP pricing](https://msg91.com/in/pricing/otp) and [SMS pricing](https://msg91.com/in/pricing/sms/pricing-india); [Exotel SMS billing](https://docs.exotel.com/messaging-apis/how-is-sms-billed-charged) — quote comparison, no lowest-price claim.
- [Android background location](https://developer.android.com/develop/sensors-and-location/location/background) — permissions and update limits.
- [PocketBase introduction](https://pocketbase.io/docs/) and [production guide](https://pocketbase.io/docs/going-to-production/) — phone migration/reliability considerations.
- [Tally developer hub](https://developer.tallysolutions.com/) — supported connector mechanisms; client version still to confirm.
- [NIC e-way bill documentation](https://docs.ewaybillgst.gov.in/) and [FAQ](https://docs.ewaybillgst.gov.in/html/faq_new.html) — document/API distinction.
- [CBIC invoice rules](https://cbic-gst.gov.in/gst-invoice-rules.html) and [services rates](https://cbic-gst.gov.in/hindi/gst-goods-services-rates.html) — tax must be validated against current notifications.
- [MeitY annual report](https://www.meity.gov.in/static/uploads/2026/04/46face7d48c8f6a97030f713ad5fdab4.pdf) — DPDP Rules notification; obtain actual commencement notifications before compliance claims.
- [Supabase pricing](https://supabase.com/pricing) and [free-plan pause policy](https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days) — assess availability/backup budget; no free-production guarantee.

## 11. Dependency-ordered delivery plan

TASKS.md contains the rows and each task has one agent-tasks brief. Run one writer on main. Scope selected by owner is this pilot; no deployment/credential/payment approval is implied.

| Task | Deliverable | Depends on | Acceptance proof |
|---|---|---|---|
| TO-141 | This assessment, saved requirements and aligned documents | — | Sources, route/gap inventory, linked briefs, verification result |
| TO-142 | Tenant/usage/storage authority repair — candidate implemented, uncommitted, awaiting review | — | Fresh local regressions green; still requires supervisor scope/consumer review, integration and honest runtime limits |
| TO-143 | Authorized agency dispatch/lifecycle — basic producer/propagation authored within TO-142, broader scope pending | TO-142 acceptance | Agency consent producer, actual eligible fleet/reservations, concurrency and partial-delivery lifecycle; no duplicate rewrite of the new functions |
| TO-144 | Agency/client/sites/team/fleet setup | TO-142 | Agency adds own truck/driver, invites staff/client; isolation and expiry blocks |
| TO-145 | Orders → capacity plan → approval | TO-143/144 | 2-client CSV/manual orders; correct count/types/allocations, invalid inputs and revisions |
| TO-146 | GR QR + checkpoint/POD custody | TO-143/145 | Start/end approval, signed QR, actual quantities/partial delivery, immutable evidence |
| TO-147 | Live tracking + incidents | TO-143/144 | Device/browser limitations explicit; real mobile screen-off proof for live promise; call+queue |
| TO-148 | Freight invoices/collections | TO-144/146 | Reviewed tax snapshots, money authority, private PDF, partial receipt/dispute/credit |
| TO-149 | Expenses/fuel/advances/maintenance | TO-144/146 | Approved costs and mileage evidence, advance reconciliation, vehicle service block |
| TO-150 | Salary runs + management reports | TO-148/149 | Effective salary rules, frozen run, no double advance, cross-driver isolation |
| TO-151 | First-client ERP connector | TO-145/146/148 | CSV/API contract first; one real sandbox/version connector; duplicate/replay/amendment tests |
| TO-152 | Platform onboarding/support/tenant ops | TO-144/148 | 1–2 staff can onboard/manage cases, scoped support access, limits/export |
| TO-153 | Hosted pilot release and recovery proof | All pilot tasks | Credentialed two-agency full journey + hosting/restore/device/accountant acceptance |

Next action: supervisor review/integration of TO-142 and its limited TO-143 overlap; do not reimplement already-authored producer/propagation blindly. Then complete the remaining TO-143 scope and unlock dependency-ready modules. TASKS.md is authoritative; no task becomes DONE from this documentation update.

Tasks are vertical deliveries; split a broad module into one bounded follow-up brief before coding if needed, without inventing another board. TO-147 native companion and TO-151 live connector need device/client discovery before their final implementation spec. TO-153 live steps are owner-gated; execute independent local preparation while access is pending.

## 12. Selling gate and pilot script

Minimum honest demo: agency creates truck/driver/client → client imports 2 orders with different ship-to sites → planner explains vehicle count/constraints → client approves → agency allocates → driver receives/accepts → pickup handover + GR QR → permitted tracking → receiver acknowledges actual goods and exceptions → invoice → partial receipt → expenses/fuel → driver monthly statement → agency margin/outstanding report. Platform staff demonstrate onboarding and support access audit.

Repeat as a second agency/client and attempt foreign IDs at UI/API/DB/storage; all forbidden access denied. Test bad connectivity, duplicate commands, cancellation, stale GPS, driver replacement, receiver without account, document expiry, shortages and dispute. Restart services, restore backup onto a clean target and match record/document counts.

Hosted staging must use GoTrue-issued identities, real HTTP Storage/PostgREST/Edge round trips and actual devices. Local green tests alone do not meet this gate. No P0/P1 journeys/security/data-loss gaps outstanding. Verify current build/lint/unit/packing/policy/routing/glue and relevant integration tests; retain exact exit codes and evidence tiers.

Business readiness: agency-reviewed terms/rate/tax profiles, onboarding instructions, support hours, data backup/exit policy, pricing/caps and invoice collection process. Commercial pilot is not a promise of nationwide marketplace coverage, automatic bank settlement, official GST API generation, fuel sensors or always-on PWA tracking.

## 13. Decisions still needing owner/client input

Proceed with no-SMS login, manual order/CSV support, existing-stack repair and private B2B data as proposed. Before dependent deployment/integration work obtain:
- first agency and client's operating model: FTL/LTL/hired trucks, cargo, branches, daily order/trip count;
- first ERP/version, sample sanitized order and company/site mapping;
- accountant-approved freight/GST and salary examples;
- old phone model/RAM/Android version, power/network and willingness to use it only as optional worker;
- actual hosting spend cap, recovery/support-hours commitments;
- authorized staging/backend and live rollout access, SMTP/OAuth configuration if used;
- GPS promise: visible-app updates for trial versus continuous Android/tracker coverage.

These are discovery or owner gates, not reasons to leave autonomous local repairs undone.

## 14. Saved owner request (verbatim, 2026-10-06)

check what is remaining for fully functioning, and what screens are still pending to be created for selling this project to Goods transport companies in India, including Invoicing, expenses tracking, driver tracking, linking of ERPs for clients to connect their software for fast ordering of trucks based on requirements from their sales order planning e.g. total trucks required, location etc, and our system will help them plan routes, bill to ship to, right trucks, number of trucks etc, live location tracking, GR copy creating with QR code, OTP while starting and ending, acknowlegement of material received at the end, breakdown call, emergency call, fuel tracking and stopage, driver salary calculations, full company management for goods transport agencies, client side, admin of software side, all user journey to be thought of completely and also save this message so that we know what we discussed and what we built, we'll host the app on our side, for calculation we can create python scripts, or VBA so that client side can be use or if host is to be use for processing then it takes less processing,

give me detailed prompt so that rest of the part can be built, for now many part still not working, as I'm unable to find sms partner (cheap) we need to store the data, I was hoping to use my old android phone as server (another project serdroid in d drive github you can find) we'll manage 1-2 agencies with 5-10 trucks per agency and 1-2 person from my side i.e. admin side for managing onboarding etc, trucks will be added by agency, truck drivers info will be added by them, check more things that we need in this app, plan and save and consolidate all documentation so that every thing is aligned

## 15. What was built versus planned

Baseline before the October 6 request: existing routed UI/auth/packing/portal/KYC/offer/OTP code at aba05fc8. October 6 delivered documentation at 76ef129a. Since then: separately authored, uncommitted TO-142 migrations/functions/document consumers and basic dispatch/delivery propagation, locally rechecked October 7 and awaiting review/integration. October 7 work in this chat updates documentation only and preserves all candidate product changes.

Still planned/unaccepted: remaining TO-143 agency allocation/consent/concurrency/partial-delivery work and TO-144–153 modules/runtime acceptance. No new expenses, fuel, payroll, GR QR, ERP or admin-ops screens were delivered by this update. Nothing here changes a local candidate into accepted or deployed functionality; acceptance evidence is recorded only in TASKS.md and agent-results.
