# TruckOpti — Launch Readiness: Kimi Task Prompt

> **Reference**: This file is the single source of truth for remaining work.
> **Test Tracker**: Update results in `0.dev-matrix/LAUNCH_TEST_TRACKER.md`
> **Checklist**: Full launch checklist at `0.dev-matrix/LAUNCH_CHECKLIST.md`

---

## Project Context

- **App**: TruckOpti — SaaS logistics platform for Indian dealer distributors
- **Stack**: React 18 + Vite + TypeScript + Supabase + Zustand + React Query
- **Supabase**: `jbxncejtcbpcronndqlx.supabase.co` (anon key in `frontend/src/lib/supabase.ts`)
- **Database**: 17 tables, 52 RLS policies, 8 trucks seeded, 4 subscription plans seeded
- **Auth**: Google OAuth + OTP via Supabase Auth, Zustand `authStore`, `ProtectedRoute`
- **Maps**: `MapViewWrapper` (Google Maps if key set, Leaflet fallback)
- **Payments**: Razorpay (test mode) + PhonePe (sandbox)
- **Languages**: 6 (en, hi, gu, mr, ta, te)

### What's Already Done
- ✅ All 17 DB tables created with RLS
- ✅ Auth flow: Google OAuth + OTP + callback + protected routes
- ✅ Auth store: Zustand with `initialize()`, `syncUserProfile()`, `onAuthStateChange`
- ✅ Dashboard: Queries real Supabase data (trucks/shipments/routes counts)
- ✅ MobileLayout: Notifications via Supabase realtime
- ✅ CheckoutPage: Queries `subscription_plans` from DB + Razorpay integration
- ✅ All CRUD pages (Trucks, Cartons, Customers) use `supabaseApi.ts`

### What's Broken / Incomplete
- ❌ ProfilePage: Phone hardcoded as `+91 98765 43210`, location hardcoded as `Mumbai, Maharashtra`
- ❌ PricingPage: Uses static `config/pricing.ts` instead of DB `subscription_plans` table
- ❌ MobileLayout sidebar: Shows brand only, no user name/avatar
- ❌ No Supabase integration test script exists
- ❌ No subscription lifecycle (expiry, usage limits, trial tracking)
- ❌ No admin panel for managing subscribers

---

## Workflow

```
1. Read this prompt fully
2. Execute tasks in order (Task 1 → Task 7)
3. After EACH task, update the test tracker file: 0.dev-matrix/LAUNCH_TEST_TRACKER.md
4. Mark each test as ✅ PASS, ❌ FAIL (with error), or ⏭️ SKIP (with reason)
5. At the end, run Task 7 (build verification) and paste output
6. Final report: summary table of all tasks
```

---

## Task 1: Supabase Integration Test Script

**Goal**: Create an automated test that verifies every database aspect works.

**Create file**: `scripts/test-supabase-connection.mjs`

```
import { createClient } from '@supabase/supabase-js'
// Use URL + anon key from frontend/src/lib/supabase.ts
```

### Test Suite (update results in LAUNCH_TEST_TRACKER.md Section A):

| # | Test | What to verify |
|---|------|---------------|
| A1 | Connection | `supabase.from('trucks').select('count')` returns without error |
| A2 | All 17 tables exist | SELECT count from each table doesn't error |
| A3 | Trucks seed data | 8 rows, Tata Ace exists with length=2.2, width=1.5, height=1.2 |
| A4 | Subscription plans seed | 4 rows, Starter price_monthly=49900 |
| A5 | RLS: Public read | SELECT from trucks works with anon key |
| A6 | RLS: Block unauth write | INSERT into trucks FAILS with anon key (no auth session) |
| A7 | RLS: Block user table read | SELECT from users FAILS with anon key (own-only policy) |
| A8 | Auth: Anon has no session | `supabase.auth.getSession()` returns null session |
| A9 | Realtime: Subscribe | Subscribe to trucks channel, verify connection event, unsubscribe |
| A10 | Schema: trucks columns | Verify id(uuid), name(text), length(numeric), capacity(numeric) exist |
| A11 | Schema: users columns | Verify id(uuid), email(text), phone(text), google_linked(boolean), role(text) |
| A12 | Schema: subscriptions columns | Verify user_id, plan_id, status, billing_cycle, current_period_start, current_period_end |
| A13 | Plans features JSON | All 4 plans have valid JSON in features column |
| A14 | Indexes exist | Query pg_indexes for idx_shipments_status, idx_customers_phone, etc. |

**Run command**: `node --experimental-vm-modules scripts/test-supabase-connection.mjs`

**Output format**: Each test prints `✅ A1 PASS: Connection successful` or `❌ A1 FAIL: <error>`. End with `X/14 tests passed`.

---

## Task 2: Fix ProfilePage — Real Data

**File**: `frontend/src/pages/ProfilePage.tsx`

### Bugs to fix:
| # | Bug | Fix |
|---|-----|-----|
| B1 | Phone hardcoded `+91 98765 43210` | Use `user?.phone \|\| 'Not set'` |
| B2 | Location hardcoded `Mumbai, Maharashtra` | Remove hardcoded location OR add location field to `public.users` table and use it |
| B3 | Camera button is a no-op | Either implement photo upload via `supabase.storage` or remove the button |
| B4 | No Google-linked badge | Show badge/icon if `user?.google_linked === true` |
| B5 | No "Link Google Account" button | If `user?.google_linked === false`, show button that calls `authSupabaseApi.signInWithGoogle()` |
| B6 | No subscription status display | Query `subscriptions` joined with `subscription_plans` for current user, show plan name + status |

### Update in LAUNCH_TEST_TRACKER.md Section B after fixing.

---

## Task 3: Fix PricingPage — Query Database

**File**: `frontend/src/pages/PricingPage.tsx`

### Current problem:
PricingPage imports `PRICING_TIERS` from `config/pricing.ts` (static). CheckoutPage queries `subscription_plans` from DB. This creates a mismatch risk — if DB prices change, PricingPage shows stale data.

### Fix:
| # | Task | Details |
|---|------|---------|
| C1 | Add React Query | `useQuery` to fetch `subscription_plans` from Supabase |
| C2 | Fallback to static | If query fails, fall back to `PRICING_TIERS` config (offline support) |
| C3 | Map DB fields to UI | `price_monthly` (paisa) → display as ₹ (divide by 100), `features` JSON → feature list |
| C4 | Keep translations | Maintain en/hi support using `name` and `name_hi` from DB |

---

## Task 4: MobileLayout — User Identity in Sidebar

**File**: `frontend/src/layouts/MobileLayout.tsx`

### Fix:
| # | Task | Details |
|---|------|---------|
| D1 | Import authStore | `useAuthStore` → read `user`, `isAuthenticated` |
| D2 | Show user avatar | Google profile picture if available, else initials circle |
| D3 | Show user name | Display `user?.name` or `user?.email` in sidebar header |
| D4 | Show plan badge | If user has active subscription, show plan name as badge |

---

## Task 5: Subscription Lifecycle Basics

**Files**: Create new or modify existing

### Minimum viable subscription management:
| # | Task | Details |
|---|------|---------|
| E1 | Free trial tracking | When user signs up (no subscription), treat as 14-day trial. Add `trial_end` field logic in auth store or a new `useSubscription` hook |
| E2 | Usage limit display | In Dashboard or a new component, show: "X/50 shipments used this month" based on `usage_tracking` table |
| E3 | Expired plan handling | If `current_period_end < now()` and `status != 'active'`, show "Plan Expired" banner with link to pricing page |
| E4 | Plan info hook | Create `frontend/src/hooks/useSubscription.ts` that queries user's active subscription + plan details. Export: `plan`, `isTrialing`, `isExpired`, `usage` |

---

## Task 6: Browser Smoke Test — Every Page

**Run**: `cd frontend && npm run dev` → open `http://localhost:5173`

### Test each page and update LAUNCH_TEST_TRACKER.md Section F:

| # | URL | What to verify |
|---|-----|---------------|
| F1 | `/login` | Google button visible, OTP form validates phone, no console errors |
| F2 | `/` (unauth) | Redirects to `/login` |
| F3 | `/` (auth) | Dashboard loads, shows real truck/shipment counts or empty states |
| F4 | `/management/trucks` | Lists 8 trucks from Supabase (Tata Ace → Volvo 40ft) |
| F5 | `/management/cartons` | Opens without errors (may show empty state) |
| F6 | `/management/customers` | Opens without errors (may show empty state) |
| F7 | `/routes` | Map loads (Leaflet), route planning UI works |
| F8 | `/tracking` | Map + tracking UI loads without crash |
| F9 | `/profile` | Shows real user data, phone from DB (not hardcoded), sign out works |
| F10 | `/sale-orders` | Opens, CRUD UI visible |
| F11 | `/packing` | 3D Three.js visualization loads |
| F12 | `/pricing` | Shows 4 plans from database (not static config) |
| F13 | `/checkout` | Plan selection works, Razorpay integration visible |
| F14 | `/auth/callback` | Shows loading spinner (or redirects if no auth hash) |

For each: **✅ PASS** or **❌ FAIL: <exact error from console>**

---

## Task 7: Build Verification

```bash
cd frontend
npx tsc --noEmit      # Must be 0 errors
npx vite build         # Must succeed
```

**Paste complete output** of both commands.

### Update LAUNCH_TEST_TRACKER.md Section G.

---

## Rules

1. **TypeScript strict** — no `any` type anywhere
2. **Existing patterns** — use React Query `useQuery`, Zustand stores, `react-hot-toast` for toasts
3. **Error handling** — all Supabase queries must catch errors + show toast, never crash
4. **Don't break working code** — test before and after each change
5. **PWA compatible** — app must still work offline (cache strategies intact)
6. **6 languages** — any new user-facing text needs all 6 translations (en, hi, gu, mr, ta, te)
7. **`npx tsc --noEmit`** must pass with 0 errors after every task
8. **Update test tracker** after EVERY task — `0.dev-matrix/LAUNCH_TEST_TRACKER.md`

---

## Report Format

For each task state **DONE / PARTIAL / SKIP**:

```
| Task | Status | Files Modified | Bugs Found | Bugs Fixed |
|------|--------|---------------|------------|------------|
| 1    | DONE   | scripts/test-supabase-connection.mjs | 0 | 0 |
| 2    | DONE   | ProfilePage.tsx | 6 | 6 |
| ...  | ...    | ...           | ... | ... |
```

- Task 1: Paste complete test script output
- Task 2-5: List files modified + paste key code changes
- Task 6: Page-by-page PASS/FAIL (update tracker file)
- Task 7: Paste build output

**Flag anything you were unsure about.**
