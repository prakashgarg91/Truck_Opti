# TO-134 — Prove the customer cloud business journey

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-122/123/124/125 and accepted backend corrections. Staging test identities required.

## Goal and evidence

TO-116 records local-first/protected-route smoke. Those checks do not establish persistence, billing, tracking or cross-customer isolation under real Supabase identities.

## Allowed scope

scripts/live-auth-proof.cjs; scripts/_proofEnv.cjs; focused new customer E2E fixture under scripts/; frontend/src/pages/{Dashboard,CustomersPage,TrucksPage,CartonsPage,PackingPage,NewShipmentPage,TrackingPage,ShipmentHistoryPage,InvoicePage,CompanyProfilePage}.tsx and their service methods only for reproduced defects.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Extend the maintained harness to prove customer signup/login, profile/company data, tenant-owned customer/truck/carton CRUD, packing run/save/reopen, route selection, booking, shipment history/tracking, invoice and subscription usage with two separate customers. At each persistence boundary query the stored record and verify ownership. Refresh/relogin and repeat reads. Test forbidden cross-customer direct API requests and offline/backend failure. Use the existing 18 packing fixtures rather than rewrite algorithms. Record which invoice/customer data is authoritative and verify server-generated totals. Fix only reproduced journey defects; stop for a focused subtask if repair spans a new subsystem.

## Required checks

Fresh and returning sessions at mobile/desktop; database reads after UI writes; user B denied user A IDs; valid form and validation/error/retry states; generated invoice amount/owner; no uncaught error or unexpected failed request. Run affected unit tests, full build/lint/packing plus credentialed staging E2E.

## Acceptance

A real staging customer journey persists correctly and isolation is enforced; mocks/localStorage injection are labelled fixture evidence, never live proof.

## Handoff

Write agent-results/024-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
