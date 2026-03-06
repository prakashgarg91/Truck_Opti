# AUDIT.md — TruckOpti Daily Project Health Scan

> **Purpose**: Run this checklist before every BATCH to detect drift, orphaned files, broken integrations, and security regressions.
> **Owner**: Any AI agent starting a new BATCH session.
> **Last full audit**: 2026-03-06 by SONNET-004 (post-BATCH12)

---

## 1. Quick Build Gate

```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build
```

**Pass criteria**: 0 TypeScript errors. Warnings are acceptable but should be noted.

**Current status**: ✅ 0 errors, built in 6.33s (2026-03-06)

**Bundle size warnings** (not errors — track for lazy-load optimization):
| Chunk | Size raw | Size gzip | Status |
|-------|----------|-----------|--------|
| `three-vendor` | 1,042 kB | 292 kB | ⚠️ Should lazy-load (PackingPage only) |
| `pdf-vendor` | 591 kB | 176 kB | ⚠️ Should lazy-load (billing pages only) |
| `excel-vendor` | 385 kB | 130 kB | ⚠️ Should lazy-load (packing/export pages only) |

---

## 2. Page ↔ Route Connection Audit

Run to verify all pages have routes:
```powershell
# Count pages
(Get-ChildItem frontend/src/pages/*.tsx).Count   # must match route count in App.tsx
```

**Verified 2026-03-06**: All **37 pages** connected to routes in `frontend/src/App.tsx` ✅

| Portal | Page | Route | Connected |
|--------|------|-------|-----------|
| Customer | Dashboard.tsx | `/dashboard` | ✅ |
| Customer | TrackingPage.tsx | `/tracking` | ✅ |
| Customer | NewShipmentPage.tsx | `/booking/new` | ✅ |
| Customer | ShipmentHistoryPage.tsx | `/history` | ✅ |
| Customer | PackingPage.tsx | `/packing` | ✅ |
| Customer | RoutesPage.tsx | `/routes` | ✅ |
| Customer | SaleOrdersPage.tsx | `/orders` | ✅ |
| Customer | InvoicePage.tsx | `/invoice` | ✅ |
| Driver | DriverDashboardPage.tsx | `/driver/dashboard` | ✅ |
| Driver | DriverTripPage.tsx | `/driver/trip` | ✅ |
| Driver | DriverEarningsPage.tsx | `/driver/earnings` | ✅ |
| Driver | DriverHistoryPage.tsx | `/driver/history` | ✅ |
| Driver | DriverRegisterPage.tsx | `/driver/register` | ✅ |
| Agency | AgencyDashboardPage.tsx | `/agency/dashboard` | ✅ |
| Agency | AgencyJobsPage.tsx | `/agency/jobs` | ✅ |
| Agency | AgencyBillingPage.tsx | `/agency/billing` | ✅ |
| Agency | AgencyFleetPage.tsx | `/agency/fleet` | ✅ |
| Agency | AgencyDriversPage.tsx | `/agency/drivers` | ✅ |
| Agency | AgencyRatesPage.tsx | `/agency/rates` | ✅ |
| Agency | AgencyRegisterPage.tsx | `/agency/register` | ✅ |
| Admin | AdminDashboardPage.tsx | `/admin` | ✅ |
| Admin | AdminDriversPage.tsx | `/admin/drivers` | ✅ |
| Admin | AdminAgenciesPage.tsx | `/admin/agencies` | ✅ |
| Admin | DriverDetailPage.tsx | `/admin/drivers/:id` | ✅ |
| Shared | LoginPage | `/login` | ✅ |
| Shared | SignupPage | `/signup` | ✅ |
| Shared | OTPPage | `/otp` | ✅ |
| Shared | PricingPage | `/pricing` | ✅ |
| Shared | CheckoutPage | `/checkout` | ✅ |
| Shared | ProfilePage | `/profile` | ✅ |
| Shared | CompanyProfilePage | `/company-profile` | ✅ |
| Shared | TermsPage | `/terms` | ✅ |
| Shared | PrivacyPage | `/privacy` | ✅ |
| Shared | NotFoundPage | `*` | ✅ |
| Shared | PaymentCallbackPage | `/payment/callback` | ✅ |
| Dev | TestPaymentPage | `/test-payment` | ✅ |

---

## 3. Edge Function ↔ Service Integration Audit

**Verified 2026-03-06**: All **6 Edge Functions** connected ✅

| Edge Function | Called By | Purpose | Status |
|---------------|-----------|---------|--------|
| `razorpay-webhook` | Razorpay dashboard (external) | HMAC-verified subscription activation | ✅ |
| `verify-razorpay-payment` | `frontend/src/services/razorpayPayment.ts` L187 | Verify payment signature on checkout | ✅ |
| `create-razorpay-order` | `frontend/src/services/razorpayPayment.ts` L73 | Create Razorpay order server-side | ✅ |
| `verify-payment` | `frontend/src/services/phonepePayment.ts` L182 | PhonePe payment verification | ✅ |
| `phonepe-checkout` | `frontend/src/services/phonepePayment.ts` L86 | Initiate PhonePe checkout session | ✅ |
| `phonepe-status` | `frontend/src/services/phonepePayment.ts` L133 | PhonePe payment status polling | ✅ |

---

## 4. Frontend Directory Inventory

Current counts (2026-03-06 baseline):

| Directory | Count | Notes |
|-----------|-------|-------|
| `frontend/src/pages/` | 37 | All connected to routes |
| `frontend/src/components/` | 10 | MapViewWrapper, ProtectedRoute, bilingual UI |
| `frontend/src/layouts/` | 4 | MobileLayout, AgencyLayout, AdminLayout, DriverLayout |
| `frontend/src/hooks/` | 3 | useLanguage, useAuth, useLocation |
| `frontend/src/stores/` | 2 | authStore (Zustand), langStore |
| `frontend/src/services/` | 4 | supabaseApi, razorpayPayment, phonepePayment, pdfExport |
| `frontend/src/utils/` | 6 | binPacking3D, priceCalculator, validation, etc. |
| `frontend/src/workers/` | 1 | binPackingWorker.ts |
| `supabase/functions/` | 6 | All connected — see §3 above |
| `supabase/migrations/` | 6 | base_schema, production_setup, driver_docs_bucket, etc. |

---

## 5. Orphaned / Excessive Files Tracker

### Known Orphaned Files (Root Level) — Action: Move or Archive

These files exist at the workspace root and are not referenced by any build system, CI pipeline, or runtime code. Every BATCH agent should check if these have been cleaned up.

#### Python test scripts (10 files) — Move to `scripts/archive/`
```
comprehensive_user_test.py
execute_every_function_test.py
feature_by_feature_test.py
function_by_function_test.py
interactive_webapp_test.py
quick_functionality_test.py
simple_function_validator.py
simple_webapp_test.py
sitecustomize.py
test_e2e.py
webapp_button_click_test.py
```
These are legacy Selenium/Playwright test artifacts. Not connected to CI. Not in .gitignore.

#### Old batch prompt MDs at root — Move to `0.dev-matrix/`
```
BATCH5_PROMPT.md
BATCH6_PROMPT.md
```

#### Screenshot notes at root — Delete or move to `docs/`
```
login-email-entered.md
login-mobile-375px.md
login-page-otp-ready.md
```

#### Old test report archives (35+ files) — Move to `docs/archive/` or delete
```
COMPLETE_FUNCTION_ANALYSIS_REPORT.md
COMPLETE_FUNCTION_EXECUTION_ANALYSIS.md
COMPREHENSIVE_END_USER_TEST_RESULTS.md
COMPREHENSIVE_FUNCTION_TEST_REPORT.md
DEPLOYMENT_TEST_REPORT.md
DETAILED_FEATURE_ANALYSIS.md
END_USER_TESTING_REPORT_2026.md
FINAL_COMPREHENSIVE_TEST_REPORT.md
FINAL_END_USER_TEST_VALIDATION.md
FINAL_FUNCTION_EXECUTION_TEST.md
KIMI_COMPLETION_PLAN.md
KIMI_PROMPT_LAUNCH_READINESS.md
RESOLVED_FUNCTION_TEST_ANALYSIS.md
RESOLVED_FUNCTION_TEST_REPORT.md
WEBAPP_INTERACTIVE_TEST_REPORT.md
...and others
```

---

## 6. Security Policy Scan Checklist

Run before every BATCH that touches database or storage:

```sql
-- Check for USING (true) on user-owned tables (should return 0 rows for protected tables)
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE qual = 'true'
  AND tablename NOT IN ('trucks', 'cartons', 'subscription_plans');
-- trucks + cartons: USING(true) on SELECT is acceptable (reference data)
-- subscription_plans: USING(true) on SELECT is acceptable (pricing reference)
```

### Open RLS Bugs (as of BATCH12 judge)
| ID | Table | Fix Required |
|----|-------|-------------|
| BUG-RLS-001 | `customers` | Add `user_id` column, scope SELECT/UPDATE/DELETE to `auth.uid() = user_id` |
| BUG-RLS-002 | `shipments` | Same pattern |
| BUG-RLS-003 | `routes` | Same pattern |
| BUG-RLS-004 | `packing_results` | Same pattern |
| BUG-RLS-005 | `trucks` UPDATE/DELETE | Scope to agency owner |
| BUG-RLS-006 | `cartons` UPDATE/DELETE | Scope to agency owner |

See `0.dev-matrix/SECURITY.md` §2 for full details.

---

## 7. Data Access Pattern Consistency

**Pattern**: The project uses a mixed approach — acceptable, but track:
- `frontend/src/services/supabaseApi.ts` — 43 usages across pages (abstraction layer)
- Direct `supabase.from()` calls in some pages (DriverRegisterPage, AgencyDash, etc.)

**Rule**: Both patterns are acceptable. Do NOT refactor working code to consolidate.
For new code: use the pattern already used in the same file.

---

## 8. Daily Scan Procedure

1. **Build gate** → `npm run build` (0 errors required)
2. **Page count** → `(Get-ChildItem frontend/src/pages/*.tsx).Count` — compare to App.tsx route count
3. **Edge function list** → `Get-ChildItem supabase/functions/ -Directory` — each should be in §3 table
4. **Migration count** → `Get-ChildItem supabase/migrations/*.sql` — any new files must have corresponding RLS policies documented in SECURITY.md
5. **Root clutter** → Check §5 list — are orphaned files still there? Note in BATCH log.
6. **Security diff** → Any file in `supabase/migrations/` changed? Run §6 SQL check.

---

## 9. Audit History

| Date | Agent | Build | Pages | EdgeFns | Bugs Found | Action |
|------|-------|-------|-------|---------|------------|--------|
| 2026-03-06 | SONNET-004 | ✅ | 37/37 | 6/6 | BUG-021 (storage policy), BUG-022 (webhook secret) | Both fixed |
