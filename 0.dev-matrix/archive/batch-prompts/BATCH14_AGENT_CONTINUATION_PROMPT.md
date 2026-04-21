# BATCH14 Agent Continuation Prompt

> **For**: Any capable AI agent (Claude, GPT, Gemini, MiniMax, etc.)
> **Project**: TruckOpti — India logistics SaaS platform
> **Current version**: v54 (Heroku `truck-opti-app`)
> **Production**: https://www.truckopti.in
> **Stack**: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand + React Router v6

---

## 0. MANDATORY FIRST STEPS

1. Read `0.dev-matrix/SECURITY.md` — only 1 open vulnerability remains: **BUG-REDIRECT-001**.
2. Read `0.dev-matrix/PATTERNS.md` — auth, Supabase, bilingual patterns.
3. Read `0.dev-matrix/AUDIT.md` — run daily scan checklist before touching any file.
4. Register yourself in `0.dev-matrix/STATE.md` → ACTIVE AGENTS table.
5. **Build gate — run before and after every change**:
   ```powershell
   cd d:\Github\Truck_Opti\frontend ; npm run build
   ```

---

## 1. BATCH14 TASKS

### T1 — Fix BUG-REDIRECT-001: PhonePe Open Redirect (P0 — SECURITY)
**File**: `frontend/src/pages/CheckoutPage.tsx`
**Problem**: `window.location.href = phonePeResult.data.instrumentResponse.redirectInfo.url` redirects to a URL from the payment API response without validating the domain. An attacker who compromises the API or intercepts the response can redirect users to a phishing site.
**Action**:
1. Add the domain allowlist helper (see SECURITY.md §3.2 for exact code pattern):
   ```typescript
   const ALLOWED_REDIRECT_DOMAINS = [
     'api.phonepe.com',
     'mercury.phonepe.com',
     'api-preprod.phonepe.com',
     'checkout.razorpay.com',
   ]
   function isSafeRedirectUrl(url: string): boolean {
     try {
       const parsed = new URL(url)
       return (
         parsed.protocol === 'https:' &&
         ALLOWED_REDIRECT_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))
       )
     } catch { return false }
   }
   ```
2. Before the redirect, validate:
   ```typescript
   const redirectUrl = phonePeResult.data.instrumentResponse.redirectInfo.url
   if (!isSafeRedirectUrl(redirectUrl)) {
     toast.error(language === 'en' ? 'Payment redirect failed security check' : 'भुगतान रीडायरेक्ट सुरक्षा जांच विफल')
     return
   }
   window.location.href = redirectUrl
   ```
3. Also apply the same check to any other `window.location.href =` assignment that uses external data in the file.

---

### T2 — Dependency Security Audit: `npm audit fix` (P0 — SECURITY)
**Files**: `frontend/package.json`, `frontend/package-lock.json`
**Problem**: GitHub Dependabot reports 44 vulnerabilities (2 critical, 25 high, 15 moderate, 2 low) in `frontend/` dependencies.
**Action**:
1. Run: `cd d:\Github\Truck_Opti\frontend ; npm audit 2>&1 | Select-Object -First 40` — read the output to identify what packages are affected.
2. Run: `npm audit fix` — this auto-upgrades packages with non-breaking fixes.
3. Run: `npm audit fix --force` ONLY if there are remaining critical/high issues AND the package major version bump is safe (check changelog for breaking changes first). Do NOT blindly run `--force` — it can break builds.
4. After any audit fix: run `npm run build` — fix any TypeScript errors caused by upgraded packages before proceeding.
5. Run `npm audit` again — document remaining unresolved vulnerabilities in STATE.md (some may require manual code changes or upstream fixes).

---

### T3 — Driver Withdrawal Request Flow (P1)
**Files**: `frontend/src/pages/DriverDashboardPage.tsx`, new migration
**Problem**: "Request Withdrawal" button on DriverDashboardPage fires a toast placeholder `toast.success('Withdrawal request submitted')` — no actual DB record is created.
**Action**:
1. Create migration `supabase/migrations/20260308000000_driver_payouts.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS driver_payouts (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
     amount DECIMAL(10,2) NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
     requested_at TIMESTAMPTZ DEFAULT NOW(),
     processed_at TIMESTAMPTZ,
     note TEXT
   );
   ALTER TABLE driver_payouts ENABLE ROW LEVEL SECURITY;
   CREATE POLICY "driver_reads_own_payouts" ON driver_payouts FOR SELECT TO authenticated
     USING (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));
   CREATE POLICY "driver_inserts_own_payout" ON driver_payouts FOR INSERT TO authenticated
     WITH CHECK (driver_id IN (SELECT id FROM drivers WHERE user_id = auth.uid()));
   -- Admins can manage all payouts
   CREATE POLICY "admin_manages_payouts" ON driver_payouts FOR ALL TO authenticated
     USING ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');
   ```
2. In `DriverDashboardPage.tsx`: replace the toast-only handler with:
   - Get the driver's `walletBalance` (already fetched)
   - Show an input modal: "Enter withdrawal amount" (max = walletBalance)
   - On confirm: `supabase.from('driver_payouts').insert({ driver_id, amount, status: 'pending' })`
   - On success: `toast.success(language === 'en' ? 'Withdrawal request submitted' : 'निकासी अनुरोध सबमिट किया')`
   - On error: show bilingual error toast (NEVER raw error.message)
3. Add a "Payout History" mini-list below the wallet card showing last 5 payout requests with status badges.

---

### T4 — Admin: Approve/Reject Pending Agencies (P1)
**File**: `frontend/src/pages/AdminAgenciesPage.tsx`
**Problem**: The page displays all agencies but has no way for the admin to approve or reject a pending registration. The `transport_agencies.status` column exists but the UI is read-only.
**Action**:
1. Read the current file first to understand the existing table structure.
2. Add status filter tabs: "All" | "Pending" | "Active" | "Suspended"
3. On each pending agency row, add two buttons:
   - ✅ Approve → `supabase.from('transport_agencies').update({ status: 'active' }).eq('id', agencyId)`
   - ❌ Reject → `supabase.from('transport_agencies').update({ status: 'rejected' }).eq('id', agencyId)`
4. After update: refetch the list and show bilingual success/error toast.
5. Only show approve/reject buttons when `status === 'pending'`.

---

### T5 — Admin: Approve/Reject Pending Drivers (P1)
**File**: `frontend/src/pages/AdminDriversPage.tsx`
**Problem**: Same as T4 but for drivers. `drivers.status` exists but no approve/reject UI.
**Action**: Same pattern as T4 — add filter tabs + Approve/Reject buttons scoped to pending drivers.

---

## 2. HUMAN ACTIONS REQUIRED (do these yourself — agents cannot)

| Action | Why | How |
|--------|-----|-----|
| Run Supabase migrations | Apply 20260306 + 20260307 migrations to production DB | `supabase db push` OR paste SQL into Supabase SQL editor |
| Configure Twilio for SMS OTP | Enable phone auth in Supabase | Supabase Dashboard → Auth → Phone → Twilio |
| Generate live Razorpay keys | T-110 — production payments | Razorpay Dashboard → API Keys → Live mode |
| Set Heroku env vars | Live keys active in app | `heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXX --app truck-opti-app` |

---

## 3. BUILD & DEPLOY

```powershell
# After each task:
cd d:\Github\Truck_Opti\frontend ; npm run build   # 0 TS errors required

# Commit and push after EACH task (not all at end):
git add -A
git commit -m "fix: BATCH14-T1 — BUG-REDIRECT-001 PhonePe domain validation"
git push origin main
```

---

## 4. SECURITY RULES

- **BUG-REDIRECT-001 is the last open vulnerability** — fix it in T1 before anything else.
- NEVER `toast.error(error.message)` — always bilingual generic message.
- Every new table MUST have `ALTER TABLE x ENABLE ROW LEVEL SECURITY` + explicit policies.
- New RLS policies must NOT use `USING (true)` on user-owned tables.
- No `any` TypeScript type unless absolutely unavoidable.

---

## 5. PATTERNS REFERENCE

```typescript
// Auth — always authStore
import { useAuthStore } from '../store/authStore'
const { user, agencyId, driverId } = useAuthStore()

// Supabase — always handle error
const { data, error } = await supabase.from('table').select()
if (error) { console.error('[Context]', error); toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ'); return }

// Bilingual — every user-visible string
{language === 'en' ? 'English text' : 'हिन्दी पाठ'}
```

---

## 6. AFTER COMPLETING EACH TASK

1. `npm run build` → 0 errors
2. `0.dev-matrix/STATE.md` → add agent message (newest at top)
3. `0.dev-matrix/TASK.md` → mark BATCH14-Tx ✅ DONE
4. `0.dev-matrix/AUDIT.md §9` → add audit history row
5. Commit + push

---

## 7. DEFINITION OF DONE — BATCH14

- [ ] `npm run build` → 0 TypeScript errors ✅
- [ ] BUG-REDIRECT-001 fixed in CheckoutPage.tsx (T1) ✅
- [ ] `npm audit` vulnerabilities reduced (T2) ✅
- [ ] Driver withdrawal writes to `driver_payouts` table (T3) ✅
- [ ] Admin can approve/reject agencies (T4) ✅
- [ ] Admin can approve/reject drivers (T5) ✅
- [ ] STATE.md BATCH14 agent message ✅
- [ ] Heroku deploy confirmed ✅

*Created: 2026-03-06 by SONNET-004 (post-BATCH13 judge)*
