# BATCH21 Agent Continuation Prompt
**Project:** TruckOpti India Logistics SaaS  
**URL:** https://www.truckopti.in | Heroku app: `truck-opti-app`  
**Current Version:** v56 (post-BATCH20)  
**Previous Batch:** BATCH20 ✅ NEAR-PASS (all 8 tasks done; 1 bug found+fixed by SONNET-006 judge)  
**Date:** 2026-03-11

---

## MANDATORY READING (read before writing any code)

```
0.dev-matrix/SECURITY.md        — 15-item checklist. Non-negotiable.
0.dev-matrix/PATTERNS.md        — Auth, Supabase, bilingual patterns.
0.dev-matrix/DEPENDENCIES.md    — DB table schemas, data flows.
supabase/migrations/            — Read ALL .sql files before using any column name.
frontend/src/store/authStore.ts — Always use user?.role === 'admin' (NOT user?.user_metadata?.role)
frontend/src/hooks/useSubscription.ts — reuse this hook for subscription state
```

**Rule 21 enforced:** Before every `supabase.from('table').select('col')`, grep `supabase/migrations/` for the column name. If absent → create the migration first.

---

## CONTEXT — What BATCH20 completed

| Task | Status | Notes |
|------|--------|-------|
| Trip photo columns migration | ✅ | `20260311000000_add_photo_columns_to_agency_jobs.sql` |
| Driver wallet real balance | ✅ | DriverEarningsPage queries driver_payouts SUM |
| Agency payroll Pay button | ✅ | AgencyDriversPage + migration with agency_id/type |
| Subscription enforcement (booking + packing) | ✅ | Fixed: `user?.role` not `user_metadata.role` |
| Admin subscriptions page | ✅ | `/admin/subscriptions`, lazily loaded, admin guard |
| vite-plugin-pwa v1.2.0 | ✅ | 0 vulnerabilities, 0 GitHub Dependabot alerts |
| E-way bill form stub | ✅ | GSTIN validation, JSONB column, NIC coming-soon toast |
| LAUNCH_CHECKLIST updated | ✅ | Items 6.8, 6.11, 6.12 marked done |

**BATCH20 bug fixed by SONNET-006 (post-judge):**
- `NewShipmentPage.tsx` + `PackingPage.tsx`: `isAdmin` used `user_metadata.role` (wrong) → fixed to `user?.role`

---

## YOUR TASKS — BATCH21 (T1–T5)

### T1 — Admin: approve and pay driver withdrawals (P1)

**File:** `frontend/src/pages/AdminPayoutsPage.tsx`

**Current state:** AdminPayoutsPage exists — read it first to understand the current table and action buttons.

**Goal:** Each pending withdrawal row needs two action buttons:
- "Approve" button (amber) → `supabase.from('driver_payouts').update({ status: 'approved' }).eq('id', payoutId)`
- "Mark Paid" button (green, only shown if status = 'approved') → `supabase.from('driver_payouts').update({ status: 'paid', processed_at: new Date().toISOString() }).eq('id', payoutId)`

**Column check:** `driver_payouts` has: `id, driver_id, amount, status, requested_at, processed_at, note, agency_id, type` — all present.

**RLS note:** The existing `admin_manages_payouts` policy (`FOR ALL ... USING (role = 'admin')`) already allows admin updates.

**Pattern:**
```typescript
const handleApprove = async (id: string) => {
  const { error } = await supabase
    .from('driver_payouts')
    .update({ status: 'approved' })
    .eq('id', id)
  if (error) {
    console.error('[AdminPayouts] approve:', error)
    toast.error(language === 'en' ? 'Failed to approve' : 'अनुमोदन विफल')
    return
  }
  toast.success(language === 'en' ? 'Approved' : 'अनुमोदित')
  fetchPayouts() // refresh
}
```

**Status badge colours:**
- `pending` → amber
- `approved` → blue  
- `paid` → green
- `rejected` → red

---

### T2 — Sentry error tracking (P1)

**Goal:** Add `@sentry/react` for production error monitoring. This is LAUNCH_CHECKLIST item 6.6.

**Steps:**
1. `npm install @sentry/react --save` (in `frontend/`)
2. In `frontend/src/main.tsx`, add before `createRoot`:
```typescript
import * as Sentry from '@sentry/react'

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  })
}
```
3. Wrap `<App />` in `Sentry.ErrorBoundary`:
```tsx
<Sentry.ErrorBoundary fallback={<div>Something went wrong. Please refresh.</div>}>
  <App />
</Sentry.ErrorBoundary>
```
4. Add to `frontend/.env.example`: `VITE_SENTRY_DSN=`
5. Do NOT add a real DSN to `.env` — it must stay in environment config only.
6. Mark LAUNCH_CHECKLIST 6.6 as ✅.

---

### T3 — Driver GPS broadcast during trip (P2)

**File:** `frontend/src/pages/DriverTripPage.tsx`

**Goal:** When the trip step changes to `'driving'` (step 2 or after "Start Journey"), begin broadcasting the driver's GPS location to `driver_locations` table every 15 seconds.

**Column check on `driver_locations`:** Read `supabase/migrations/20260305000000_phase1_drivers.sql` to confirm columns before using them.

**Pattern:**
```typescript
const watchId = useRef<number | null>(null)

// Start GPS on trip start:
const startGPSBroadcast = (driverId: string) => {
  if (!('geolocation' in navigator)) return
  watchId.current = navigator.geolocation.watchPosition(
    async (pos) => {
      await supabase.from('driver_locations').upsert({
        driver_id: driverId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        updated_at: new Date().toISOString()
      }, { onConflict: 'driver_id' })
    },
    (err) => console.error('[DriverTrip] GPS:', err),
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  )
}

// Stop GPS on trip end (or component unmount):
const stopGPSBroadcast = () => {
  if (watchId.current !== null) {
    navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
  }
}

// useEffect cleanup:
useEffect(() => {
  return () => stopGPSBroadcast()
}, [])
```

**Do NOT block the trip flow if geolocation is denied** — log a warning and continue.

---

### T4 — Subscription upgrade/downgrade (P2)

**File:** `frontend/src/pages/PricingPage.tsx`

**Goal:** When a user already has a subscription, make the pricing UI reactive:
1. Read current `useSubscription()` to get `subscription` + `plan`
2. For each plan card:
   - If it's the current plan → show "Current Plan" badge (gray, non-clickable)
   - If it's a higher tier → show "Upgrade" button (blue)
   - If it's a lower tier → show "Downgrade" button (outlined, amber)
3. On "Upgrade"/"Downgrade" click → call `supabase.from('subscriptions').update({ plan_id: newPlanId }).eq('id', subscription.id)` then refetch.
4. If user has **no subscription** → show "Start Trial" (current behavior — preserve it).

**RLS check:** Subscriptions table has `auth.uid() = user_id` policy — user can update their own subscription row.

---

### T5 — Update LAUNCH_CHECKLIST (P2)

After completing T1–T4, update `0.dev-matrix/LAUNCH_CHECKLIST.md`:
- Phase 6.6: mark ✅ (Sentry — T2)
- Add Phase 6.13: Driver GPS broadcast ✅ (T3)
- Add Phase 6.14: Subscription upgrade/downgrade ✅ (T4)
- Add Phase 6.15: Admin payout workflow (approve/pay) ✅ (T1)
- Update progress totals.

---

## SECURITY RULES (non-negotiable)

- **NEVER** `user?.user_metadata?.role` → use `user?.role` (BUG-BATCH20-T4 lesson)
- **NEVER** display `error.message` to users — bilingual toast only
- Every `supabase.from()` → destructure `{ data, error }` and handle error
- New env vars → `.env.example` updated, never commit real values
- RLS required on every new table; never `USING (true)` on user data

---

## BUILD GATE (must pass before every commit)

```powershell
cd d:\Github\Truck_Opti\frontend
npm run build          # 0 TypeScript errors, dist/sw.js present
npm audit              # 0 vulnerabilities
```

---

## DEPLOY CHECKLIST

```bash
git add -A
git commit -m "feat: BATCH21 vXX — admin payouts workflow, Sentry, GPS broadcast, subscription upgrade"
git push origin main
git push heroku main

# Remind owner: supabase db push (6 pending migrations not yet in production)
```

---

## PENDING MIGRATIONS (owner must run `supabase db push`)

These are in `supabase/migrations/` but NOT yet applied to production database:

| Migration file | Contents |
|---------------|----------|
| `20260307000000_fix_rls_ownership.sql` | RLS fixes for customers/shipments/routes |
| `20260308000000_driver_payouts.sql` | driver_payouts table creation |
| `20260309000000_contact_inquiries.sql` | contact_inquiries table |
| `20260311000000_add_photo_columns_to_agency_jobs.sql` | photo columns (BATCH20 T1) |
| `20260311000001_driver_payouts_agency_columns.sql` | agency_id + type on driver_payouts |
| `20260311000002_eway_bill_column.sql` | eway_bill_data JSONB on shipments |

**Until these are pushed, trips show no photos, driver payouts don't work, and contact form fails in production.**

---

## AGENT OUTPUT FORMAT

```
## BATCH21 AGENT COMPLETION REPORT
Version deployed: vXX
- T1 admin payout workflow: [DONE/SKIP] — what changed
- T2 Sentry integration:    [DONE/SKIP] — main.tsx updated?
- T3 GPS broadcast:         [DONE/SKIP] — which step triggers it
- T4 subscription upgrade:  [DONE/SKIP] — PricingPage updated?
- T5 checklist update:      [DONE/SKIP]
- Build:     [PASS/FAIL]
- npm audit: [N vulnerabilities]
- New bugs found: [list or NONE]
```

---

*Created by SONNET-006 (Claude Sonnet 4.6) | 2026-03-11 | BATCH21 T1-T5*
