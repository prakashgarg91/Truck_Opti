# TruckOpti Current Gap Visibility

> Last refresh: 2026-05-18 (Copilot)
> Source surfaces: `graphify-out/GRAPH_REPORT.md`, `frontend/src/App.tsx`, restored role service files, restored agency portal edge functions, `npm run glue:check`, `npm run test:frontend-smoke`

## Current Design Snapshot

- Graphify currently reports `466` nodes, `559` edges, and `77` communities for `frontend/src`.
- Route ownership is now complete across the public, customer, driver, agency, and admin portals in `frontend/src/App.tsx`.
- Page-level Supabase drift is closed: `npm run glue:check` now returns `0 gaps, 0 warnings`.
- Agency jobs, fleet, billing, and rates are now backed by dedicated edge functions through `frontend/src/services/agencyPortalApi.ts`.
- The integrated frontend route smoke now passes `50/50`, including unauthenticated `/subscription` redirecting to `/login` as a protected route.

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

## Remaining Gaps After This Session

### GV-01 Trusted Backend Coverage Is Still Partial

**Why it is still open**

- `frontend/src/pages/AgencyDashboardPage.tsx` still depends on `agencyDashboardApi` from `frontend/src/services/agencySupabaseApi.ts`, which reads agency data directly from the browser service layer.
- `frontend/src/pages/AgencyDriversPage.tsx` uses `agencyDriversApi` from `frontend/src/services/agencyPortalApi.ts`, but that service still reads and writes `transport_agencies`, `agency_trucks`, and `driver_payouts` directly with client Supabase calls.
- Admin dashboards and operations are service-extracted, but `frontend/src/pages/AdminDashboardPage.tsx`, `frontend/src/pages/AdminAgenciesPage.tsx`, `frontend/src/pages/AdminPayoutsPage.tsx`, `frontend/src/pages/AdminContactPage.tsx`, and `frontend/src/pages/AdminDriversPage.tsx` still run through browser-side admin services re-exported from `frontend/src/services/supabaseApi.ts` rather than trusted `admin-portal-*` functions.

**Impact**

- The UI is modular, but trusted backend ownership is inconsistent across privileged portals.
- Future AI edits still have to reason about mixed trust boundaries: some role actions use edge functions, while adjacent role actions still rely on browser-side table access.

### GV-02 Role-Specific Profile Screens Are Still Missing

**Why it is still open**

- `frontend/src/App.tsx` routes both `/driver/profile` and `/agency/profile` to the generic `ProfilePage`.
- `frontend/src/pages/ProfilePage.tsx` updates generic auth metadata and company metadata only; it does not own driver-domain records or agency-domain records.
- Only `/settings/company` has a dedicated owned screen through `frontend/src/pages/CompanyProfilePage.tsx`.

**Impact**

- Driver and agency portals expose profile routes, but those routes do not have role-specific ownership or data contracts.
- From a design perspective this is a missing-screen gap: the route exists, but the dedicated page for that role does not.

## Next Two Steps

1. Complete the trusted backend boundary by adding function-backed portal services for agency dashboard and drivers, then extend the same server-owned pattern to the remaining admin operations.
2. Create dedicated `DriverProfilePage` and `AgencyProfilePage` surfaces, or redirect those routes to explicit owned settings pages, and add route-level smoke coverage for those role-specific profile paths.

## Validation Snapshot

- `cd frontend && npm run build` PASS
- `npm run glue:check` PASS (`0 gaps, 0 warnings`)
- `npm run test:frontend-smoke` PASS (`50/50`)
- `npm run launch-check` currently fails only when the tree itself is dirty; rerun it on a clean commit as the final integrated gate.