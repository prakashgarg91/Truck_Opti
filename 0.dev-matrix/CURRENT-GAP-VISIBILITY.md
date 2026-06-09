# TruckOpti Current Gap Visibility

> Last refresh: 2026-05-18 (Copilot)
> Source surfaces: `graphify-out/GRAPH_REPORT.md`, `frontend/src/App.tsx`, `frontend/src/services/agencyPortalApi.ts`, `frontend/src/services/adminSupabaseApi.ts`, `supabase/functions/agency-portal-*`, `supabase/functions/admin-portal-*`, `npm run test:frontend-smoke`, `npm run launch-check`

## Current Design Snapshot

- Graphify currently reports `466` nodes, `559` edges, and `77` communities for `frontend/src`.
- Route ownership is now complete across the public, customer, driver, agency, and admin portals in `frontend/src/App.tsx`.
- Page-level Supabase drift is closed: `npm run glue:check` now returns `0 gaps, 0 warnings`.
- Agency dashboard, drivers, jobs, fleet, billing, and rates are now backed by dedicated edge functions through `frontend/src/services/agencyPortalApi.ts`, including assignable-driver and driver-location reads for `AgencyJobsPage`.
- Admin dashboard, agencies, payouts, contact, drivers, users, and subscriptions now run through trusted `admin-portal-*` functions via `frontend/src/services/adminSupabaseApi.ts`.
- The integrated frontend route smoke now passes `52/52`, including unauthenticated `/subscription`, `/driver/profile`, and `/agency/profile` route coverage.

## Closed In This Session

### Closed: GAP-01 Service Layer Refactoring Incompleteness

- The parked refactor from `stash@{0}` is restored.
- Role-specific service files now exist for admin, agency, and customer flows.
- Pages no longer call `supabase.from()` directly from the page layer.
- Validation: `cd frontend && npm run build` PASS, `npm run glue:check` PASS (`0 gaps, 0 warnings`).

### Closed: GAP-02 Missing Protected Agency Portal Edge Functions

- `supabase/functions/agency-portal-jobs/index.ts` now owns agency job actions.
- `supabase/functions/agency-portal-fleet/index.ts` now owns agency fleet actions.
- `supabase/functions/agency-portal-billing/index.ts` now owns agency billing reads.
- `supabase/functions/agency-portal-rates/index.ts` now owns agency rate-card actions.
- `AgencyJobsPage`, `AgencyFleetPage`, `AgencyBillingPage`, and `AgencyRatesPage` now call `agencyPortalApi` instead of querying from the page layer.
- Validation: `npm run test:frontend-smoke` PASS (`50/50`).

### Closed: GV-01 Trusted Backend Coverage Was Partial

- `supabase/functions/_shared/portal-auth.ts` now owns shared trusted portal auth/error handling for privileged edge functions.
- `supabase/functions/agency-portal-dashboard/index.ts` and `supabase/functions/agency-portal-drivers/index.ts` now own agency dashboard/drivers snapshots and mutations.
- `supabase/functions/agency-portal-jobs/index.ts` now also owns assignable-driver lookup and latest-driver-location reads, so `AgencyJobsPage` no longer queries `transport_agencies`, `agency_trucks`, or `driver_locations` from the browser.
- `supabase/functions/admin-portal-dashboard/index.ts`, `admin-portal-agencies/index.ts`, `admin-portal-payouts/index.ts`, `admin-portal-contact/index.ts`, and `admin-portal-drivers/index.ts` now own the remaining admin privileged reads and moderation flows.
- `frontend/src/services/adminSupabaseApi.ts` now owns users and subscriptions wrappers for `admin-portal-users` and `admin-portal-subscriptions`, so `AdminUsersPage` and `AdminSubscriptionsPage` no longer invoke edge functions directly.
- `AgencyDashboardPage`, `AgencyDriversPage`, `AgencyJobsPage`, `AdminDashboardPage`, `AdminAgenciesPage`, `AdminPayoutsPage`, `AdminContactPage`, `AdminDriversPage`, `AdminUsersPage`, `AdminSubscriptionsPage`, and `DriverDetailPage` now call function-backed portal services instead of browser-side privileged table access.

### Closed: GV-02 Role-Specific Profile Ownership Was Missing

- `frontend/src/pages/DriverProfilePage.tsx` now owns `/driver/profile` with driver-record specific summary, compliance, and navigation actions.
- `frontend/src/pages/AgencyProfilePage.tsx` now owns `/agency/profile` with agency snapshot, business metadata, and owned settings links.
- `frontend/src/App.tsx` now routes `/driver/profile` and `/agency/profile` to dedicated role-owned pages instead of the generic `ProfilePage`.
- `scripts/frontend_launch_smoke.mjs` now covers both protected role-specific profile routes.

## Remaining Gaps After This Session

### AI-Executable Architecture Gaps

- None currently verified in the portal/service ownership slice tracked here.

### Operational / External Follow-Ups

- `npm run launch-check` currently returns `17 passed, 1 failed`; the only failing gate is git working tree cleanliness on the uncommitted patch set.
- `T-155` AWS SES sender/domain setup is still intentionally deferred; hosted invoice delivery works, but outbound invoice email remains environment-dependent.
- Launch-only external blockers remain owner-side credentials/proof items such as live Razorpay ownership and any optional future auth/provider changes.


## Next Two Steps

1. Commit or explicitly park the current validated agency/admin closure, then rerun `npm run launch-check` from the clean tree so the git-cleanliness gate returns to green evidence.
2. If billing email is worth resuming, complete `T-155` by configuring AWS SES sender/domain secrets and rerunning invoice-delivery proof; otherwise move to the next credentialed/browser proof slice without reopening portal ownership work.

## Validation Snapshot

- `cd frontend && npm run build` PASS
- `npm run test:frontend-smoke` PASS (`52/52`)
- `npm run launch-check` FAIL (`17 passed, 1 failed`) with Gate 8 git cleanliness as the only failing gate