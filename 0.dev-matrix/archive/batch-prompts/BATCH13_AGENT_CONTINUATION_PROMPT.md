# BATCH13 Agent Continuation Prompt

> **For**: Any capable AI agent (Claude, GPT, Gemini, MiniMax, etc.)
> **Project**: TruckOpti — India logistics SaaS platform
> **Current version**: v53 (Heroku `truck-opti-app`)
> **Production**: https://www.truckopti.in
> **Stack**: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand + React Router v6

---

## 0. MANDATORY FIRST STEPS (do these before ANY code)

1. Read `0.dev-matrix/SECURITY.md` — full checklist, forbidden patterns, open RLS bugs.
2. Read `0.dev-matrix/PATTERNS.md` — auth pattern, Supabase pattern, bilingual pattern.
3. Read `0.dev-matrix/AUDIT.md` — integration health scan (check §5 orphaned files, §6 RLS open bugs).
4. Register yourself in `0.dev-matrix/STATE.md` → ACTIVE AGENTS table.
5. **Run build gate before and after every change**: `cd d:\Github\Truck_Opti\frontend ; npm run build`

---

## 1. BATCH13 TASKS

### T1 — RLS Security Fixes (P0 — SECURITY CRITICAL)
**Files**: `supabase/migrations/` (new migration file)
**Problem**: BUG-RLS-001 through BUG-RLS-006 — 6 tables with `USING (true)` policies that expose all user data cross-tenant. See `0.dev-matrix/SECURITY.md` §2 for exact details.
**Action**:
1. Create a new migration file: `supabase/migrations/20260307000000_fix_rls_ownership.sql`
2. For `customers`, `shipments`, `routes`, `packing_results`: these tables lack a `user_id`/`created_by` column. You MUST:
   - `ALTER TABLE x ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid();`
   - Drop the existing `USING (true)` policies
   - Create new user-scoped policies: `USING (auth.uid() = created_by)`
3. For `trucks` and `cartons`: only UPDATE/DELETE are overly permissive; scope them to the owning agency. Check if `agency_id` column exists — if so, use `USING (agency_id IN (SELECT id FROM transport_agencies WHERE owner_id = auth.uid()))`
4. Do NOT break public read access for reference data (trucks/cartons SELECT can stay as-is)

**Do not ship this batch without fixing at least BUG-RLS-001 and BUG-RLS-002 (customers + shipments). These are critical data isolation failures.**

---

### T2 — SMS OTP via Twilio (P1)
**Files**: Supabase dashboard (human step) + `frontend/src/pages/OTPPage.tsx` + `frontend/src/pages/LoginPage.tsx`
**Context**: Supabase Auth supports SMS OTP via Twilio. Currently phone OTP may be failing silently with no visible error.
**Action**:
1. Supabase dashboard → Authentication → Phone → Enable SMS → Twilio provider
   - HUMAN must add: Twilio Account SID, Auth Token, Message Service SID or Phone number
   - After config: test `supabase.auth.signInWithOtp({ phone: '+91XXXXXXXXXX' })`
2. In `OTPPage.tsx` and `LoginPage.tsx`: ensure error from `signInWithOtp` is caught and shown as a toast in Hindi/English (never raw error.message)
3. Verify the OTP entry flow works end-to-end: enter phone → receive SMS → enter code → redirect to dashboard

---

### T3 — Subscription Upgrade/Downgrade Flow (P1)
**Files**: `frontend/src/pages/CheckoutPage.tsx`, `frontend/src/pages/PricingPage.tsx`, Supabase `subscriptions` table
**Context**: Users can buy a plan (Basic/Pro/Enterprise) but cannot currently upgrade or downgrade. The `subscriptions` table tracks `plan_id` and `status`.
**Action**:
1. In `PricingPage.tsx`: if user already has an active subscription, show "Current Plan" badge on their plan and "Upgrade"/"Downgrade" CTA on others
2. In `CheckoutPage.tsx`: before creating a new Razorpay order, check if user has an existing active subscription
   - If upgrading: prorate remaining days or show simple "switch plan" message
   - If downgrading: inform user the change takes effect at next renewal
3. When Razorpay webhook fires (`supabase/functions/razorpay-webhook/index.ts`): if user already has a subscription row, UPDATE it (don't INSERT a duplicate)
4. Add `updated_at` column to `subscriptions` table if missing

---

### T4 — Bundle Size Optimization (P2)
**Files**: `frontend/src/pages/PackingPage.tsx`, `frontend/vite.config.ts`
**Context**: Three.js (`three-vendor`) loads on every page at 1,042 kB raw. It is only used in `PackingPage.tsx` for 3D bin packing visualization. PDF and Excel loaders have similar issues.
**Action**:
1. In `frontend/src/pages/PackingPage.tsx`: change the 3D viewer import to `React.lazy()` + `Suspense`:
   ```typescript
   const BinPackingViewer3D = React.lazy(() => import('../components/BinPackingViewer3D'))
   ```
2. Wrap in `<Suspense fallback={<div>Loading 3D view...</div>}>` — bilingual fallback text
3. Similarly, `jsPDF` in `AgencyBillingPage.tsx` should be dynamically imported inside `generateInvoice()`:
   ```typescript
   const { jsPDF } = await import('jspdf')
   ```
4. Same for XLSX in any export function — dynamic import inside the handler function
5. Run `npm run build` after changes — verify `three-vendor` does NOT appear in initial bundle chunks

---

### T5 — Root Directory Cleanup (P3)
**Files**: Root `*.py`, root `*.md` reports, `BATCH5_PROMPT.md`, `BATCH6_PROMPT.md`
**Context**: The workspace root has 10 Python test scripts and 35+ old report MDs that are not connected to any CI, build, or runtime system. See `0.dev-matrix/AUDIT.md §5` for full list.
**Action**:
1. Move Python test scripts into `scripts/archive/` — do not delete (may have historical value)
2. Move `BATCH5_PROMPT.md` and `BATCH6_PROMPT.md` into `0.dev-matrix/`
3. Move screenshot notes (`login-email-entered.md`, `login-mobile-375px.md`, `login-page-otp-ready.md`) into `docs/`
4. Move the 35+ old report MDs into `docs/archive/` — do not delete
5. Update `.gitignore` to exclude `scripts/archive/` and `docs/archive/` so they don't inflate the repo
6. Run `git add -A ; git status` to verify nothing important was lost

---

## 2. NON-AGENT ACTIONS REQUIRED (human must do before T2 and some of T3)

| Action | Who | Why |
|--------|-----|-----|
| Razorpay: generate live keys from dashboard | Owner | T-110, T3 — `rzp_live_XXX` |
| Set Heroku env: `heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXX --app truck-opti-app` | Owner | Production payments |
| Set Supabase secret: `supabase secrets set RAZORPAY_KEY_SECRET=<live_secret>` | Owner | Webhook HMAC verify |
| Twilio: create account + get phone number or message SID | Owner | T2 SMS OTP |
| Supabase: enable Phone auth provider with Twilio credentials | Owner | T2 SMS OTP |

---

## 3. BUILD & TEST REQUIREMENTS

```powershell
# Build gate — must pass before every push (0 TypeScript errors)
cd d:\Github\Truck_Opti\frontend ; npm run build

# Deploy after completion
git add -A
git commit -m "feat: BATCH13 — RLS fixes + SMS OTP + subscription flow + bundle optimization"
git push origin main
# Heroku auto-deploys from main branch
```

---

## 4. PATTERNS REFERENCE

### Auth (always use authStore — never useState for auth)
```typescript
import { useAuthStore } from '../store/authStore'
const { user, agencyId, driverId } = useAuthStore()
```

### Supabase (always handle errors before using data)
```typescript
const { data, error } = await supabase.from('table').select()
if (error) { console.error('[Context]', error); toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ'); return }
```

### Never expose raw error to user
```typescript
// ❌ FORBIDDEN
toast.error(error.message)
// ✅ REQUIRED
toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')
```

### Bilingual strings (every user-visible string)
```typescript
{language === 'en' ? 'English text' : 'हिन्दी पाठ'}
```

---

## 5. SECURITY RULES SUMMARY

- Every new Supabase table must have RLS enabled + explicit policies (rule §3.1)
- NEVER use `USING (true)` on user-owned tables — see BUG-RLS-001 through -006
- NEVER expose `error.message` to users — leaks DB internals
- URL redirects: validate against domain allowlist (BUG-REDIRECT-001 pattern)
- Webhook endpoints: HMAC-SHA256 always (already done in razorpay-webhook)
- New storage bucket policies: admin OR clause is forbidden — use role check only (BUG-021 pattern)
- No `any` type in TypeScript unless absolutely unavoidable

---

## 6. AFTER COMPLETING EACH TASK

1. Run `npm run build` — fix any TypeScript errors before proceeding
2. Update `0.dev-matrix/STATE.md` — add message to AGENT MESSAGES (newest at top)
3. Update `0.dev-matrix/TASK.md` — mark completed tasks ✅ DONE, add new task IDs as BATCH13-Tx
4. Update `0.dev-matrix/AUDIT.md` §9 audit history row
5. Commit and push after every task (not just at the end)

---

## 7. DEFINITION OF DONE — BATCH13

- [ ] `npm run build` → 0 TypeScript errors ✅
- [ ] BUG-RLS-001 and BUG-RLS-002 fixed in new migration ✅
- [ ] STATE.md updated with BATCH13 agent message ✅
- [ ] TASK.md updated (BATCH13 tasks marked complete) ✅
- [ ] Heroku deploy confirmed ✅

*Created: 2026-03-06 by SONNET-004 (post-BATCH12 judge)*
