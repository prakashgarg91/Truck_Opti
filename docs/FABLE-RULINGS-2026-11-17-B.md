# Binding rulings B (architect, 2026-11-17)

Follows `docs/TO-152-rulings.md`; closes contract-audit row 16.

## 1. Subscription guard coverage

- `agency_subscription_assert` gains three actions; no new count limits. An unpaid agency can still finish trips and collect its money.
  - `record_add` (resource `records`): `SB002` in grace, expired, cancelled, none.
  - `settle` (resource `settlement`): open in grace; `SB002` in expired, cancelled, none.
  - `erp` (resource `erp`): the `record_add` matrix, plus `SB004 SUBSCRIPTION_FEATURE_NOT_IN_PLAN` when `subscription_plans.erp_enabled` is false.
- `record_add`: `agency_consignment_create`, `agency_expense_record`, `agency_fuel_fill_record`, `agency_maintenance_item_upsert`, `agency_payroll_open_period`, `agency_driver_rate_set`, `agency_load_plan_save`.
- `settle`: `agency_invoice_issue`, `agency_payroll_close_period`, `agency_payroll_adjust`, `agency_maintenance_service_done`.
- `erp`: `agency_erp_connection_create`, `agency_erp_connection_rotate_secret`, `erp_event_ingest` (before its `agency_order_import` call).
- Never guarded: `agency_invoice_record_payment`, `agency_invoice_cancel`, `agency_consignment_event`, `agency_consignment_qr`, `tracking_ping_record`, `agency_incident_open`, `agency_incident_update`, `agency_job_set_status`, `agency_driver_payout_request`, `agency_order_cancel`, `agency_load_plan_cancel`, `agency_erp_connection_set_status`, `agency_vehicle_update`, `agency_truck_unassign_driver`, all reads, all subscription commands.
- Plan flag: one only. `subscription_plans.erp_enabled boolean NOT NULL DEFAULT false`; true for `growth`, `professional`, `enterprise`. Payroll is on every tier. Entitlement adds `features{erp}`.
- Migration: one file `20261035000000_subscription_write_guards.sql`. `CREATE OR REPLACE` with each body copied whole from its latest definition (20261019 to 20261025, 20261027), plus one `PERFORM public.agency_subscription_assert(v_agency_id, '<action>', 0)` after scope resolution and before any write. Enforcement stays off by default.
- Battery: `scripts/subscription_write_guards.db.test.mjs`.
- Frontend: `throwIfSubscriptionError` in `agencyConsignmentsApi.ts`, `agencyInvoicesApi.ts`, `agencyExpensesApi.ts`, `agencyPayrollApi.ts`, `agencyErpApi.ts`; `BillingGate` on their create buttons; `SB004` in `parseSubscriptionError` ("ERP connector is included from the Growth plan").

## 2. Local full-journey browser test

Ruling: a Node HTTP shim over embedded PostgreSQL 18 (`scripts/race/_realPg.mjs`) and the real Vite frontend, driven by the installed Playwright.

Rejected: PGlite with pglite-socket (single session); supabase CLI (needs Docker); PostgREST/GoTrue binaries (downloads, owner-gated); fetch-layer mocking (never runs the SQL).

- URL: `resolveSupabaseConfig` (`frontend/src/lib/authCapabilities.ts`) rejects http and localhost. The launcher starts Vite with process env `VITE_SUPABASE_URL=https://harness.truckopti.test` and a dummy anon key (beats `.env.local`). Playwright `context.route` forwards that host to the shim on `127.0.0.1` and aborts other hosts; `.test` never resolves.
- Hard stops: launcher exits if a resolved URL contains `supabase.co`; shim binds `127.0.0.1` only.
- Login: `POST /auth/v1/token?grant_type=password` checks an in-memory map of seeded users and returns an HS256 JWT signed with a per-run random secret (`sub`, `role: authenticated`, `email`, `exp`). Also `/auth/v1/user`, `/auth/v1/logout`, refresh.
- Per request: verify the JWT, then `BEGIN; SET LOCAL ROLE authenticated` (or `anon`); `SELECT set_config('request.jwt.claims', $1, true)`; run; `COMMIT`. `auth.uid()` and RLS are real.
- `/rest/v1/rpc/<fn>`: named arguments; SQLSTATE, message, DETAIL in PostgREST error shape.
- `/rest/v1/<table>`: a subset only: column select, `eq neq in is gte lte`, `order`, `limit`, `Range`, `Prefer: count=exact`, `return=representation`, the single-object Accept header, `PGRST116`. Anything else answers 501 and fails the run.
- `/functions/v1/*`: 501. No Deno here, so Edge-backed pages (dashboard, jobs, billing, rates, drivers) and checkout stay a hosted gate. Activation, sweeps and the enforcement flag are driven by the test script over its own `pg` connection as `service_role`; the shim accepts no service key.

Effort: 6 serial agent tasks.

| Task | Worker | Allowed files | Check |
|---|---|---|---|
| H1 | Haiku, read-only | none (report every rpc, `.from` shape and auth call on agency pages) | none |
| H2 | Sonnet | `scripts/harness/server.mjs`, `scripts/harness/server.test.mjs` | `node scripts/harness/server.test.mjs` |
| H3 | Sonnet | `scripts/harness/rest.mjs`, `scripts/harness/rest.test.mjs` | `node scripts/harness/rest.test.mjs` |
| H4 | Haiku | `scripts/harness/seed.mjs` | H2 and H3 tests |
| H5 | Sonnet | `scripts/harness/run.mjs`, `scripts/harness/journey.browser.mjs`, `package.json` (`test:journey`) | `npm run test:journey` |
| H6 | Haiku under Sonnet | `journey.browser.mjs`: grace, expired, renew, 375 px, screenshots in `evidence/journey/` | `npm run test:journey` |

Journey: sign in, trial, truck, staff, driver, order import, plan approve, consignment, ping, invoice, payment, expense, payroll, grace (SB002), expired (SB003, payment still recorded), activate.

## 3. Release gates

"Ready for staging": 1 to 6. "Ready for the first sale": all.

1. `cd frontend && npx tsc --noEmit && npm run lint && npx vitest run && npm run build`
2. Every `node scripts/*.db.test.mjs`, including the 20261035 battery.
3. `npm run test:race`
4. `npm run test:edge-writes && npm run types:drift && npm run test:prod-config`
5. `npm run test:journey`, desktop and 375 px, screenshots kept.
6. Independent Codex review of the diff; `node scripts/razorpay_sandbox_proof.mjs --dry-run`.
7. Staging: `db push` through 20261035; Edge functions deployed; the journey hosted, Edge pages included.
8. Razorpay test mode on staging: order, capture, duplicate webhook, failed payment, refund (`docs/TO-152-runbook.md`).
9. `cron.job` lists `truckopti-subscription-sweeps`.
10. Backup taken; rollback rehearsed (`enforcement_enabled` false, restore).
11. Every approved agency has a live subscription row before enforcement goes on.

Owner-only: creating hosted projects, `db push`, Edge deploy and secrets, Razorpay KYC, keys and webhook secret, live-money payments, `platform_billing_settings` legal name, GSTIN and SAC, switching `enforcement_enabled` on in production, Heroku deploy, Sentry DSN, first client's ERP access, prices, refund policy, terms.

## 4. Five riskiest gaps, in order

1. Edge money path has never executed: `create-razorpay-order/index.ts`, `verify-razorpay-payment/index.ts`, `razorpay-webhook/index.ts`, `_shared/activation.ts`, `_shared/razorpay.ts`. Not even typechecked; signature checks are unproven.
2. The 20261008 to 20261034 chain has only run on the stub schema in `scripts/_pgliteBootstrap.mjs`. Real `auth` and `storage`, the `subscriptions.agency_id` backfill on existing rows and the pg_cron block in 20261031 are unproven.
3. The enforcement switch: `agency_subscription_assert` makes an agency with no subscription row read-only the moment it is on,; `run_subscription_sweeps` expires trials while it is off.
4. `requireAgencyContext` in `_shared/portal-auth.ts` and the pages behind it (`AgencyJobsPage.tsx`, dashboard, billing, rates, drivers): staff-scope resolution, rewritten in d159a9a4, has never run and the local harness cannot cover it.
5. The subscription tax invoice is client-built (`frontend/src/lib/subscriptionInvoiceCopy.ts`) with no stored server copy; `subscription_quote_order` refuses every sale until `platform_billing_settings` holds legal name, GSTIN and state code.
