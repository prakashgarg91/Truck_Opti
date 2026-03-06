# BATCH15 Agent Continuation Prompt

> **For**: Any capable AI agent (Claude, GPT, Gemini, MiniMax, etc.)
> **Project**: TruckOpti — India logistics SaaS platform
> **Current version**: v55 (Heroku `truck-opti-app`)
> **Production**: https://www.truckopti.in
> **Stack**: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand + React Router v6

---

## 0. MANDATORY FIRST STEPS

1. Read `0.dev-matrix/SECURITY.md` — only BUG-023 (build-time only) remains open.
2. Read `0.dev-matrix/PATTERNS.md` — auth, Supabase, bilingual patterns.
3. Read `0.dev-matrix/AUDIT.md` — run §8 daily scan before any code.
4. Register yourself in `0.dev-matrix/STATE.md` → ACTIVE AGENTS table.
5. **Build gate — run before and after every change**:
   ```powershell
   cd d:\Github\Truck_Opti\frontend ; npm run build
   ```

---

## 1. BATCH15 TASKS

### T1 — Admin Payout Management Page (P1)
**File**: `frontend/src/pages/AdminDashboardPage.tsx` (or create `frontend/src/pages/AdminPayoutsPage.tsx`)
**Problem**: Drivers can now request withdrawals (stored in `driver_payouts` table), but admins have no UI to see, approve, or mark payouts as paid.
**Action**:
1. Decide: add a "Payouts" tab to `AdminDashboardPage.tsx` OR create `AdminPayoutsPage.tsx` at `/admin/payouts`.
   - If new page: add route in `App.tsx` under the admin protected routes block.
2. Fetch all driver_payouts with `supabase.from('driver_payouts').select('*, drivers(full_name, phone)').order('requested_at', { ascending: false })`
3. Show a table: Driver name | Amount | Status | Requested date | Actions
4. Actions per row (only shown for relevant statuses):
   - pending → **Approve** (sets `status='approved'`) and **Reject** (sets `status='rejected'`, asks for reason)
   - approved → **Mark Paid** (sets `status='paid'`, sets `processed_at=NOW()`)
5. All DB operations: `if (error) { console.error('[AdminPayouts]', error); toast.error(bilingual); return }`
6. Bilingual labels throughout (every user-visible string).

---

### T2 — Fix BUG-023: vite-plugin-pwa Downgrade (P2)
**File**: `frontend/package.json`
**Problem**: `serialize-javascript <=7.0.2` RCE (GHSA-5c6j-r48x-rmvq) in build-time dependency chain. Fix requires downgrading `vite-plugin-pwa` from `0.20.5` → `0.19.8`.
**Action**:
1. Run: `cd d:\Github\Truck_Opti\frontend ; npm audit fix --force`
2. Immediately run: `npm run build` — if there are TypeScript or config errors from the downgrade, fix them.
3. Check if `vite.config.ts` uses any `VitePWA` option that was added in 0.20.x — if yes, remove or replace with a 0.19.x compatible option.
4. Run `npm audit` — verify 0 high/critical remain.
5. Test PWA manifest still generates in build output: `ls dist/*.webmanifest` or check `dist/` for manifest file.

---

### T3 — Critical: Set `created_by` on Shipment Inserts (P0)
**File**: `frontend/src/pages/NewShipmentPage.tsx`
**Problem**: BATCH13 added a `created_by UUID` column to `shipments` and scoped RLS to `auth.uid() = created_by`. But `NewShipmentPage.tsx` inserts new shipments without setting `created_by`. This means ALL new shipment inserts will FAIL with an RLS violation in production once the migration is applied.
**Action**:
1. Read the current file first.
2. Find every `supabase.from('shipments').insert({...})` call.
3. Add `created_by: user?.id` to every insert payload.
   ```typescript
   const { data, error } = await supabase.from('shipments').insert({
     ...shipmentData,
     created_by: user?.id,   // ← required for RLS
   })
   ```
4. Verify `user` comes from `useAuthStore()` — it always should, never local state.

---

### T4 — Critical: Set `created_by` on Routes and Packing Inserts (P0)
**Files**: `frontend/src/pages/RoutesPage.tsx`, `frontend/src/pages/PackingPage.tsx`
**Problem**: Same as T3 but for `routes` and `packing_results` tables.
**Action**:
1. In `RoutesPage.tsx`: find all `.from('routes').insert({...})` — add `created_by: user?.id`.
2. In `PackingPage.tsx`: find all `.from('packing_results').insert({...})` — add `created_by: user?.id`.
3. Also check `supabaseApi.ts` — if it has wrapper functions for these inserts, add `created_by` there.

---

### T5 — Critical: Set `created_by` on Customer Inserts (P0)
**Files**: Search all pages that insert into `customers` table.
**Problem**: Same RLS issue as T3/T4 for the `customers` table.
**Action**:
1. Run: `Select-String -Path "frontend/src/**/*.tsx","frontend/src/**/*.ts" -Pattern "from\('customers'\).*insert" -Recurse`
2. For each insert found: add `created_by: user?.id` to the payload.
3. If `NewShipmentPage` does customer lookup + create, make sure the create path sets `created_by`.

---

## 2. HUMAN ACTIONS REQUIRED

| Action | Why | Urgency |
|--------|-----|---------|
| Run `supabase db push` | Apply migrations 20260306, 20260307, 20260308 to production | 🔴 BEFORE T3/T4/T5 go live — without this, the `created_by` column doesn't exist and the frontend fix is premature |
| Configure Twilio in Supabase Dashboard | SMS OTP | P1 |
| Generate live Razorpay keys | Production payments | P0 |

> **IMPORTANT**: T3/T4/T5 fixes are needed BEFORE deploying the BATCH13 migration to production. The order is: 1) Apply T3+T4+T5 frontend fixes, 2) Then run `supabase db push` to apply migrations. If migrations are applied first without T3/T4/T5, ALL customer inserts will silently fail.

---

## 3. BUILD & DEPLOY

```powershell
# Build gate after each task
cd d:\Github\Truck_Opti\frontend ; npm run build   # 0 TS errors required

# Commit after each task
git add -A
git commit -m "fix: BATCH15-T3 — set created_by on shipment inserts (RLS compliance)"
git push origin main
```

---

## 4. PATTERNS REFERENCE

```typescript
// Auth — always authStore
import { useAuthStore } from '../store/authStore'
const { user, agencyId, driverId } = useAuthStore()

// Supabase insert with RLS-required created_by
const { data, error } = await supabase.from('shipments').insert({
  ...payload,
  created_by: user?.id,   // REQUIRED — RLS policy checks this
})
if (error) { console.error('[Context]', error); toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ'); return }

// Bilingual
{language === 'en' ? 'English text' : 'हिन्दी पाठ'}
```

---

## 5. SECURITY RULES

- NEVER `toast.error(error.message)` — raw DB errors must never reach the user.
- Every table insert on `customers`, `shipments`, `routes`, `packing_results` MUST include `created_by: user?.id` (RLS requires it after BATCH13 migration).
- New tables MUST have `ALTER TABLE x ENABLE ROW LEVEL SECURITY` + scoped policies.
- No `USING (true)` on user-owned tables.

---

## 6. AFTER EACH TASK

1. `npm run build` → 0 errors
2. `0.dev-matrix/STATE.md` → add agent message
3. `0.dev-matrix/TASK.md` → mark BATCH15-Tx ✅ DONE
4. `0.dev-matrix/AUDIT.md §9` → add audit history row
5. Commit + push

---

## 7. DEFINITION OF DONE — BATCH15

- [ ] `npm run build` → 0 TypeScript errors ✅
- [ ] T1: Admin payout management UI showing + approve/reject/paid actions ✅
- [ ] T2: `npm audit` → 0 high/critical ✅
- [ ] T3: All `shipments` inserts include `created_by: user?.id` ✅
- [ ] T4: All `routes` + `packing_results` inserts include `created_by: user?.id` ✅
- [ ] T5: All `customers` inserts include `created_by: user?.id` ✅
- [ ] STATE.md BATCH15 agent message ✅
- [ ] Heroku deploy confirmed ✅

*Created: 2026-03-06 by SONNET-004 (post-BATCH14 judge)*
