# TO-141 — Pilot assessment and implementation handoff

Owner: GPT-6 supervisor. Scope of this request: documentation/audit, not product implementation or hosting deployment.
Spec: docs/PRODUCT_ROADMAP.md (2026-10-06 owner requirements, source evidence, journeys and screen inventory).
Result: agent-results/031-result.md.

## Assessment acceptance

Save the owner's request, distinguish current code/local evidence from future functionality, inspect Serdroid without editing it, prioritize functional/security repair before new screens, define pilot workflows for agency/client/driver/platform staff, and align root architecture/board/design audit without creating another execution board. Preserve unrelated dirty files and every parked checkout.

## Detailed reusable build prompt

You are completing Truck_Opti for a real Indian goods-transport pilot: 1–2 agencies, 5–10 trucks each, 1–2 platform staff. Build working connected journeys, not a collection of mock screens. Read AGENTS.md → ARCHITECTURE.md → TASKS.md → exactly one READY agent-tasks brief; then read docs/PRODUCT_ROADMAP.md as the product specification. It contains the owner request verbatim, current gaps, proposed command interfaces, complete workflows, screen inventory and release gates.

Operate only in D:/Github/Truck_Opti on main with one writer. Fetch and inspect status/branches/worktrees before substantial work; pull only fast-forward-safe. Preserve pre-existing local state and parked content. Never create branches, worktrees, stashes, competing boards or agent routers. Use required semantic/codegraph/context tools before reading unfamiliar code; if unreachable, report the limitation and fall back. Verify graphs against current source/tests. Do not print secrets.

Start with TO-142 (agent-tasks/032-tenant-authority-repair.md), then dependency-ordered READY slices. Before editing reproduce the defect or pin the feature acceptance in a meaningful regression. Inspect existing source and reuse modules; no stack rewrite. Execute one bounded vertical slice at a time, review it and update TASKS.md. Do not mark a task DONE because tests that knowingly report findings exited 0.

First repair unauthorized foreign-shipment claims, suspended-agency writes, usage RPC ownership, unsafe assignment guards and private-document access. Then make customer booking produce an authorized agency/driver assignment and propagate trip status to shipment/job exactly once. Protect vehicle/driver reservation conflicts, cancelled/revised orders, expired/used challenges and direct HTTP/DB attempts. Turn every resolved finding into a failing-on-regression assertion.

Extend existing frontend/src/pages, frontend/src/services, Supabase migrations/functions and apps/web packing modules. Keep React/TypeScript PWA and PostgreSQL/Supabase identity/authority. Product roles require organizations/memberships and explicit client-agency agreement/order authorization, not user-editable metadata or local role spoofing. Fleet/driver records are created by their agency. Cross-tenant foreign IDs must fail everywhere: tables, RPCs, service functions, storage, reports and QR/tracking links.

Deliver these journeys:
1. Platform onboards agency, invites owner and assigns support. Agency configures company/branch, taxes, rates, bank reference, staff, actual trucks, drivers, documents, clients and sites.
2. Client enters/imports sales orders with bill-to and ship-to, quantities/UOM, weight/dimensions, restrictions and pickup/delivery windows. Persist source IDs and revisions, preview errors and prevent duplicate imports.
3. Planner explains eligible truck types/counts, weight/volume/packing constraints, route estimates, availability and unallocated demand. Persist load/order-line allocations, allow partial split and multi-drop compatibility, approve quote and reserve actual truck/driver.
4. Agency dispatches; driver receives/accepts; authorized consignor confirms pickup handover using server challenge and evidence. Generate immutable GR/LR with versioned cargo data and a signed QR verification link. QR exposes a redacted record, never raw OTP/KYC/bank data.
5. Track assigned trips with capture time, server time, accuracy, latest update, offline/stale states and stops. Browser geolocation is limited; do not promise screen-off continuous tracking without real Android/tracker proof.
6. Driver can initiate configured breakdown/emergency phone contact immediately and queue an incident even on network failure. Dispatcher acknowledges and resolves with reassignment/cargo transfer, client notice and evidence.
7. Recipient records material actually received at each stop, name/signature/photos, shortages/damage/rejection and delivery challenge. Partial delivery/dispute/return stays explicit; app must not manufacture successful verification.
8. Accountant issues freight invoice from approved contract/tax snapshot, privately shares it, records partial receipts/allocations, disputes and credit/debit adjustments. Keep freight, client goods invoices and Truck_Opti SaaS invoices distinct. Do not hardcode universal 18% GTA tax.
9. Driver/agency captures expenses, receipts, diesel litres/rate/odometer, advances, toll/loading/repair/detention. Accountant approves and reconciles, then calculates trip profitability and salary with effective agreements, attendance, allowances and no double-counted advances.
10. ERP integration starts with CSV/XLS + normalized versioned API. Implement one first-client connector only after ERP/version/sample discovery. For local Tally use customer-controlled outbound agent; never expose ERP LAN port or persist secrets in the browser. Import/write-back is idempotent, scoped, auditable and opt-in.
11. Your 1–2 admin staff use onboarding/support/provider/backup queues, scoped audited tenant access, subscription/usage/export/offboarding. No fictitious large support hierarchy or guaranteed 24x7 staffed response.

Make SMS optional. Pilot identity uses trusted password/Google only as configured, safe activation/recovery and protected admin accounts. Transport challenges are distinct from login OTP. Prefer authenticated consignee/consignor confirmation or expiring action link; manual WhatsApp sharing does not imply automated delivery. Keep provider interface/capability state and honest delivery failures. Obtain current quotes and DLT/entity/template onboarding before selecting SMS; do not use consumer SIM bulk sending as a shortcut.

Hosting: maintain a dependable shared primary database/files/auth. Read D:/Github/Serdroid/AGENTS.md and README.md for discovery only: its PocketBase/Termux/cloudflared design is not drop-in Supabase. Treat old phone as optional bounded worker/backup/demo until measured uptime, restart, security, restore and compatibility proof. A full backend replacement needs explicit architectural decision and dedicated migration plan.

Compute: browser Web Worker for small parsing/packing previews; optional Python CLI or server worker with versioned JSON and golden fixtures for larger bounded work. VBA only as optional client import/export adapter. Server validates capacity, money, tenant scope and final transitions; never trust client/phone results as authority. Cache by input/algorithm version, batch GPS and job work, cap retry/timeout/payloads. Avoid premature infrastructure expansion.

For all new or changed screens map every action to its real API; implement loading/empty/error/success/denied/offline states, safe retries, drafts, labels and keyboard navigation. Verify mobile 390×844 and desktop 1280×900. Selected Hindi/English driver journeys must actually render. For UI work read using-stitch-mcp skill, verify stitch_status keyConfigured and canonical repoRoot, call stitch_guide, reuse existing project and update docs/design-audit.md. Never retry ambiguous mutations; follow journal/read-only recovery. Generated HTML is a reference to adapt, not a shipped feature.

Required tests: two agencies, two clients and two drivers; concurrent reservation/offer attempts; foreign reads/writes/claims; suspended and revoked identities; duplicate imports/commands/events; wrong/expired/reused pickup/end challenges; offline/reconnect and stale GPS; partial receipt/shortage/return; wrong units/overweight/nonstackable loads; reviewed tax/rounding; private PDF/QR revocation; expenses/advance/payroll duplication; ERP amendments after dispatch; outage/restore. Keep local SQL proof separate from actual GoTrue/PostgREST/Storage/Edge and credentialed browser proof.

Run maintained gates: frontend npm run lint, npm run build, npm run test:unit and npm run test:packing; root npm run test:server-routing, node --test scripts/*policy.test.mjs, node tools/glue-check.mjs; applicable scripts/*db.test.mjs; Python auth/packing checks when relevant. Record exact exit codes/counts and environment. Add task-specific integration/runtime/device proof; smoke rendering alone is insufficient. Do not log environment secrets.

Write agent-results/NNN-result.md with changed files, regression red/green, verification tier, unresolved findings, owner gates and next smallest task. GPT-6 reviews before DONE. Commit cohesive verified work directly to main, and push only with required checks passing; never deploy automatically.

Continue useful authorized local engineering while live access is pending. Hosted backend restore/provisioning, credentials/SMTP/OAuth, migration/function rollout, production deployment, real payments and irreversible database actions remain owner-gated. Ask only for missing client/device choices or concrete final live approval; don't ask the owner what task to do next when READY work exists.

Completion means the two-agency order-to-cash demonstration in roadmap section 12 works using real shared storage, driver/device and recipient proof, all P0/P1 defects are closed, accountant approves freight/payroll behavior, recovery is demonstrated, support/offboarding are usable and remaining work is growth. State limitations honestly; never claim production readiness from local unit tests.

## Current next action

TO-142 is the first AI-executable repair. Its implementation is a separate turn/slice; the current request prepares the plan. TO-137 provider sandbox and hosted rollout remain separate owner gates.

