# TruckOpti Design Gap Map — 2026-05-16

> Historical note (2026-05-18): the original `GAP-01` and `GAP-02` in this file are now code-closed in the restored refactor slice. Use `0.dev-matrix/CURRENT-GAP-VISIBILITY.md` for the current gap picture.

> **Analysis Date:** 2026-05-16 (Copilot Session)  
> **Graph State:** 463 nodes | 560 edges | 73 communities  
> **Graphify Version:** 0.4.18  
> **Launch Status:** Repo-side green (17/17), Blocked only by owner-side Razorpay keys + auth credentials

---

## Current Design State

The Truck_Opti codebase has achieved **full route parity** across four portals (customer, driver, agency, admin) with a shared shell pattern:

- **Public Routes:** `/`, `/pricing`, `/login`, `/signup`, `/reset-password`, `/contact`, `/terms`, `/privacy`
- **Customer Portal:** `/dashboard`, `/management/*`, `/history`, `/tracking`, `/invoice/*`, `/subscription`
- **Driver Portal:** `/driver/dashboard`, `/driver/earnings`, `/driver/history`, `/driver/trip/*`
- **Agency Portal:** `/agency/dashboard`, `/agency/fleet`, `/agency/jobs`, `/agency/drivers`, `/agency/billing`, `/agency/rates`, `/agency/profile`
- **Admin Portal:** `/admin`, `/admin/users`, `/admin/subscriptions`, `/admin/payouts`, `/admin/agencies`, `/admin/contact`

### Closed Design Gaps (2026-05-13)
- ✅ `/subscription` route now owns protected self-serve current-plan surface (was missing)
- ✅ `/support` now routes to protected ContactPage in authenticated mode (was unowned)
- ✅ `/agency/profile` now owned by App.tsx (was orphaned)
- ✅ WhatsApp share links now emit owned tracking/invoice deep links (was dropping context)
- ✅ ProtectedRoute now renders PermissionDeniedState on role mismatch (was silent redirect)

---

## ⚠️ TWO CRITICAL REMAINING NON-HUMAN GAPS

### GAP-01: Service Layer Refactoring Incompleteness

**Severity:** HIGH | **Blocker:** No | **AI-Executable:** Yes

#### Current State
- 23 DIRECT_SUPABASE_IN_PAGE warnings identified in `glue-check-report.json` (2026-05-03)
- Only 3 pages refactored to use service APIs (DriverDetailPage, AdminUsersPage, AdminSubscriptionsPage)
- Remaining **20+ pages** still import and call `supabase.from()` directly:
  - Admin pages: AdminDashboardPage, AdminAgenciesPage, AdminContactPage, AdminPayoutsPage, AdminDriversPage (+2)
  - Agency pages: AgencyJobsPage, AgencyFleetPage, AgencyBillingPage, AgencyRatesPage, AgencyDriversPage (+1)
  - Customer pages: ProfilePage, NewShipmentPage, CartonsPage, etc.
  - Payment pages: CheckoutPage, PaymentCallbackPage

#### Why This Matters
- **Testing:** Pages cannot be unit-tested without mocking Supabase directly; no service layer to intercept
- **Error Handling:** No centralized logging/retry logic; failures are scattered
- **Maintainability:** Adding a new feature to, e.g., job listing means touching 3+ files instead of one service
- **Security:** Easier to accidentally expose sensitive data when queries are scattered across the UI
- **Consistency:** Mixed patterns reduce code familiarity for new developers

#### Definition of Done
- All 23 pages identified in `glue-check-report.json` call Supabase **only** through service APIs
- Service files: `adminSupabaseApi.ts`, `agencySupabaseApi.ts`, `driverSupabaseApi.ts`, `customerSupabaseApi.ts`, `paymentSupabaseApi.ts`
- `npm run glue:check` returns **0 DIRECT_SUPABASE_IN_PAGE** warnings
- `cd frontend && npm run build` passes with **0 TS errors**
- `npm run test:frontend-smoke` passes **17/17**

---

### GAP-02: Missing Protected Agency Portal Edge Functions

**Severity:** HIGH | **Blocker:** No | **AI-Executable:** Yes

#### Current State
- Admin layer has **two** trusted backend functions:
  - `admin-portal-users` (~100 lines) — validates admin role, lists/disables/unban/deletes users
  - `admin-portal-subscriptions` (~80 lines) — validates admin role, lists subscription data
- Agency layer has **ZERO** trusted functions
- AgencyJobsPage, AgencyFleetPage, AgencyBillingPage, AgencyRatesPage all call `supabase.from()` directly
- Result: Agency write operations (create jobs, update rates, assign drivers) lack authorization layer

#### Security/Architecture Gap
- Admin portal properly gates operations through RLS + backend validation
- Agency operations exposed to RLS bypass if client-side validation is patched
- Pattern exists (admin-portal-*) but not rolled out to agency scope
- This is a **consistency gap**, not a missing feature

#### Definition of Done
- Four new edge functions deployed to Supabase:
  - `agency-portal-jobs` — list trips, update trip status/driver assignment
  - `agency-portal-fleet` — list/update truck assignments, capacity
  - `agency-portal-billing` — list invoices, payouts, settlements
  - `agency-portal-rates` — list/update rate cards
- Each function validates `caller.agency_id` matches the resource's `agency_id`
- Each function guards write operations with RLS triggers
- AgencyJobsPage, AgencyFleetPage, AgencyBillingPage, AgencyRatesPage refactored to call these
- `npx supabase functions deploy agency-portal-*` succeeds
- `npm run build` passes with **0 TS errors**

---

## TWO REMAINING STEPS

### Step 1: Systematically Refactor Remaining 20+ Pages to Use Dedicated Service APIs

**Target:** GAP-01 (Service Layer Consistency)

#### Concrete Action
1. Create/extend the following service files:
   - `frontend/src/services/adminSupabaseApi.ts` (8 admin pages → 50+ wrapper functions)
   - `frontend/src/services/agencySupabaseApi.ts` (5 agency pages → 30+ wrapper functions)
   - `frontend/src/services/customerSupabaseApi.ts` (customer pages)
   - `frontend/src/services/paymentSupabaseApi.ts` (payment/checkout pages)

2. Extract wrapper functions following the existing `driverSupabaseApi` pattern:
   ```typescript
   // Example pattern from driverSupabaseApi.ts
   export const fetchDriverTrips = async (driverId: string) => {
     try {
       const { data, error } = await supabase
         .from('driver_trips')
         .select('*')
         .eq('driver_id', driverId);
       if (error) throw error;
       return data;
     } catch (error) {
       logger.error('Failed to fetch driver trips', error);
       throw new UserFacingError('Could not load trip history');
     }
   };
   ```

3. Refactor pages in batches (8 admin → 5 agency → 8 customer → 2 payment):
   - Replace all `supabase.from()` calls with service function imports
   - Retest after each batch with `npm run glue:check`

#### Validation
- `npm run glue:check` → **0 DIRECT_SUPABASE_IN_PAGE** warnings (down from 23)
- `cd frontend && npm run build` → PASS, **0 TS errors**
- `npm run test:frontend-smoke` → **17/17 PASS**
- Git log shows batch commits: `refactor: extract admin service APIs`, `refactor: extract agency service APIs`, etc.

**Estimated effort:** 4–6 AI hours (parallel refactoring of 4 service layers + 20+ page imports)

---

### Step 2: Create Four Missing Agency Portal Edge Functions and Wire Pages

**Target:** GAP-02 (Agency Authorization Layer)

#### Concrete Action
1. Create Supabase edge functions in `supabase/functions/`:
   ```
   supabase/functions/agency-portal-jobs/index.ts
   supabase/functions/agency-portal-fleet/index.ts
   supabase/functions/agency-portal-billing/index.ts
   supabase/functions/agency-portal-rates/index.ts
   ```

2. Each function follows the admin-portal pattern:
   ```typescript
   // Example: agency-portal-jobs/index.ts
   export default async (req: Request) => {
     const authHeader = req.headers.get('authorization');
     const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
     
     if (authError || !user) return new Response('Unauthorized', { status: 401 });
     
     const { data: agency } = await supabase
       .from('agencies')
       .select('id')
       .eq('owner_id', user.id)
       .single();
     
     if (!agency) return new Response('Forbidden', { status: 403 });
     
     // Fetch/update trips for this agency only
     const { data, error } = await supabase
       .from('trips')
       .select('*')
       .eq('agency_id', agency.id);
     
     return new Response(JSON.stringify(data), { status: 200 });
   };
   ```

3. Refactor four agency pages:
   - `AgencyJobsPage.tsx` → call `agency-portal-jobs`
   - `AgencyFleetPage.tsx` → call `agency-portal-fleet`
   - `AgencyBillingPage.tsx` → call `agency-portal-billing`
   - `AgencyRatesPage.tsx` → call `agency-portal-rates`

4. Deploy to production:
   ```bash
   npx supabase functions deploy agency-portal-jobs agency-portal-fleet agency-portal-billing agency-portal-rates --project-ref jbxncejtcbpcronndqlx
   ```

#### Validation
- All 4 functions deploy without errors
- `cd frontend && npm run build` → PASS, **0 TS errors**
- Local preview: load `/agency/jobs`, verify list renders and operations use edge function (Network tab in DevTools)
- Git diff shows 4 new function files + 4 pages refactored from direct `supabase.from()` to edge function calls

**Estimated effort:** 3–4 AI hours (4 edge functions ~300 lines total + 4 page refactors)

---

## Summary

TruckOpti has achieved **all documented design goals** and closed **all previous design gaps** as of 2026-05-13. The codebase is **repo-side launch-ready** with 17/17 passing tests.

The **two remaining non-human gaps** are **architectural consistency issues**, not missing features:

1. **GAP-01: Service Layer Refactoring Incompleteness**  
   - 20+ pages still call Supabase directly instead of through service APIs
   - Blocks testing, error handling, and maintainability
   - **Total work:** Extract 4 service files + refactor 20+ page imports

2. **GAP-02: Missing Agency Portal Edge Functions**  
   - Agency operations lack the trusted authorization layer that admin has
   - Security/consistency gap, not a feature gap
   - **Total work:** Create 4 agency-portal edge functions + refactor 4 pages

Both gaps are **AI-executable, follow established patterns**, and have **clear validation paths**. Closing them will improve maintainability and security while keeping the codebase professional and future-ready for larger teams.

**Next session should focus on:** Step 1 (service layer refactoring) in parallel batches, then Step 2 (agency edge functions), then rerun `npm run glue:check` to confirm 0 warnings and `npm run test:frontend-smoke` to confirm 17/17 PASS.

