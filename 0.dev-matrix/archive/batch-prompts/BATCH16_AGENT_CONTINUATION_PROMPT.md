# BATCH16 — Agent Continuation Prompt

> **Read this entire file before writing a single line of code.**
> Batch number: **16** | Version target: **v57** | Date: 2026-03-07

---

## 1. CONTEXT — WHERE WE ARE

| Field | Value |
|-------|-------|
| Production URL | https://www.truckopti.in |
| Heroku app | `truck-opti-app` |
| Current commit | `b12c940b` (post BATCH15 judgment bonus fixes) |
| Stack | React 18 + TypeScript + Vite 5 + Tailwind + Supabase + Zustand + React Router v6 |
| Build status | ✅ 0 TypeScript errors, built in 5.74s |
| npm audit | ✅ **0 vulnerabilities** |
| Open security bugs | **None** — all BUG-RLS-001 through -006, BUG-REDIRECT-001, BUG-WEBHOOK-001, BUG-021, BUG-022, BUG-023 are ✅ FIXED |

### MANDATORY reads before starting

```
0.dev-matrix/SECURITY.md    — FORBIDDEN patterns (RLS, redirects, error.message exposure)
0.dev-matrix/PATTERNS.md    — Auth, Supabase, bilingual, payment patterns
0.dev-matrix/RULES.md       — Build rules, commit conventions, anti-patterns
```

### Build gate — MUST PASS before any commit

```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build
# Required: 0 TS errors. If ENOSPC error: npm cache is on D:\npm-cache (already configured).
```

---

## 2. BATCH16 TASKS

### BATCH16-T1 — Admin payouts nav card (P1, Simple, ~30 min)

**File**: `frontend/src/pages/AdminDashboardPage.tsx`

**Problem**: `AdminPayoutsPage` (created in BATCH15) is properly routed at `/admin/payouts` in App.tsx, but there is no way for an admin to navigate to it from the dashboard. The admin dashboard has clickable nav cards at lines ~271 and ~278 for Drivers and Agencies.

**Task**: Add a third nav card `"Driver Payouts"` (English) / `"चालक भुगतान"` (Hindi) that calls `navigate('/admin/payouts')`. Follow the exact same pattern as the Drivers/Agencies cards. Use a relevant Lucide icon (e.g. `Wallet` or `DollarSign` or `CreditCard`).

**Patterns to follow**:
```tsx
// Existing pattern in AdminDashboardPage.tsx
onClick={() => navigate('/admin/drivers')}
// Bilingual label
{language === 'en' ? 'Manage Drivers' : 'चालक प्रबंधन'}
```

**Acceptance criteria**:
- Admin dashboard shows "Driver Payouts" / "चालक भुगतान" card ✅
- Click navigates to `/admin/payouts` ✅
- Icon is from lucide-react ✅
- No raw error.message ✅

---

### BATCH16-T2 — E2E smoke test for created_by RLS (P0, Medium, ~2 hrs)

**Context**: BATCH13 added `created_by` column to `customers`, `shipments`, `routes`, `packing_results` with ownership-based RLS. BATCH15 added `created_by: user.id` to all insert calls. But none of the migrations have been pushed to production Supabase yet — this is a human action item. However, the agent can verify the frontend wiring is correct end-to-end.

**Task**: 
1. Audit every Supabase `.insert()` call across the frontend for these four tables:
   - `customers` → must have `created_by: user.id` or `user?.id`
   - `shipments` → must have `created_by: user.id`
   - `routes` → must have `created_by: user?.id`
   - `packing_results` → must have `created_by: user.id`
2. Find any insert that is **missing** `created_by` and add it.
3. Also check: any `.update()` on these tables must NOT overwrite `created_by` with `undefined` (only set `created_by` on `.insert()`, never on `.update()`).
4. Report your findings as comments in STATE.md agent message.

**Files to check**:
```
frontend/src/pages/NewShipmentPage.tsx       — shipments insert (BATCH15 ✅)
frontend/src/pages/RoutesPage.tsx            — routes insert (BATCH15 ✅)
frontend/src/pages/PackingPage.tsx           — packing_results insert (BATCH15 ✅)
frontend/src/pages/CustomersPage.tsx         — customers insert (BATCH15 ✅)
frontend/src/services/supabaseApi.ts         — any API wrapper inserts
frontend/src/pages/*.tsx                      — any other page with inserts
```

**Acceptance criteria**:
- All 4 tables have `created_by` on every insert ✅
- No `.update()` passes `created_by` ✅
- STATE.md updated with findings ✅

---

### BATCH16-T3 — Fix any remaining raw error.message leaks (P1, Simple, ~1 hr)

**Context**: BATCH15 judge found and fixed 3 `toast.error(error.message || '...')` leaks in `CustomersPage.tsx`. This pattern may exist elsewhere in the codebase. Per `SECURITY.md` rule: **NEVER expose raw `error.message` to users** — it leaks DB internals.

**Task**:
1. Search for the pattern `toast.error(error.message` or `toast.error(err.message` or `.message || '` across all `frontend/src/pages/` and `frontend/src/layouts/` files.
2. For each occurrence, replace with bilingual safe messages:
   ```tsx
   // WRONG (leaks DB errors)
   toast.error(error.message || 'Something failed')
   
   // RIGHT (safe, bilingual)
   toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')
   ```
3. Make sure `language` is imported from `useLanguageStore()` in every file you modify.

**Acceptance criteria**:
- Zero occurrences of `toast.error(error.message` or `toast.error(err.message` in production code ✅
- All error toasts are bilingual ✅
- `language` imported from `useLanguageStore()` in every modified file ✅

---

### BATCH16-T4 — Contact page (P2, Medium, ~2 hrs)

**File**: `frontend/src/pages/ContactPage.tsx`

**Task**: Create a `/contact` public-facing page with:
- Heading: "Contact Us" / "हमसे संपर्क करें"
- Form fields: Full Name, Email, Phone (optional), Subject (dropdown: General / Support / Sales / Partnership), Message (textarea)
- On submit: insert into Supabase `contact_inquiries` table (see schema below)
- Success: show bilingual confirmation toast
- Error: show bilingual generic error toast (no raw error.message)

**Table schema** (create migration):
```sql
-- supabase/migrations/20260309000000_contact_inquiries.sql
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL DEFAULT 'General',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can insert a contact inquiry
CREATE POLICY "public can submit inquiry" ON contact_inquiries
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read/manage inquiries
CREATE POLICY "admin reads inquiries" ON contact_inquiries
  FOR SELECT TO authenticated
  USING (auth.jwt()->> 'role' = 'admin' OR (auth.jwt()-> 'user_metadata'->>'role') = 'admin');
```

**Add to App.tsx** — public route (no auth required):
```tsx
<Route path="/contact" element={<ContactPage />} />
```

**Add link from PricingPage** — the "Contact Sales" button should navigate to `/contact` if not already.

**Acceptance criteria**:
- `/contact` renders without auth ✅
- Form validates (required fields) ✅
- Successful submit inserts to `contact_inquiries` ✅
- No raw error.message ✅
- Bilingual (EN/HI) ✅
- Migration file created ✅

---

### BATCH16-T5 — Admin contact inquiries view (P2, Simple, ~1 hr)

**File**: `frontend/src/pages/AdminContactPage.tsx`

**Task**: Create `/admin/contact` page that lists `contact_inquiries` (name, email, subject, message, date). Allow admin to mark as "resolved". Add nav card to AdminDashboardPage.

**Acceptance criteria**:
- Admin can see all contact inquiries ✅
- Admin can mark inquiry as resolved ✅
- Status badge: open (yellow) / resolved (green) ✅
- Nav card added to AdminDashboardPage ✅
- No raw error.message ✅

---

## 3. SECURITY RULES — MANDATORY

Before writing any code, re-read `0.dev-matrix/SECURITY.md`. Key rules:

### 🔴 NEVER do these

```tsx
// ❌ ALWAYS forbidden — leaks DB internals
toast.error(error.message)
toast.error(error.message || 'fallback')

// ❌ FORBIDDEN RLS pattern
CREATE POLICY "..." ON my_table FOR DELETE TO authenticated USING (true);

// ❌ FORBIDDEN redirect pattern  
window.location.href = userSuppliedUrl;
```

### ✅ ALWAYS do these

```tsx
// ✅ Safe bilingual error
toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')

// ✅ Safe Supabase call
const { data, error } = await supabase.from('table').select()
if (error) { console.error('[Context]', error); toast.error(language === 'en' ? '...' : '...'); return }

// ✅ Auth always from store
const { user } = useAuthStore()

// ✅ created_by on every insert to owned tables
.insert({ ...data, created_by: user.id })
```

---

## 4. COMMIT FORMAT

One commit at the end, after build passes:

```
feat: BATCH16 - admin payouts nav + RLS audit + error.message fixes + contact page

- T1: AdminDashboardPage - add Driver Payouts nav card
- T2: Verified created_by on all 4 owned-table inserts
- T3: Fixed N raw error.message leaks in M files  
- T4: ContactPage + migration 20260309000000_contact_inquiries.sql
- T5: AdminContactPage + /admin/contact route + nav card
```

---

## 5. HUMAN ACTION ITEMS (not for agent)

These cannot be done by an AI agent — flag them in your STATE.md message:

| Action | Command |
|--------|---------|
| Push migrations to production Supabase | `supabase db push` (run from workspace root) |
| Set Razorpay live keys | `heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXX RAZORPAY_KEY_SECRET=XXX --app truck-opti-app` |
| Configure Twilio SMS for production | Supabase dashboard → Auth → SMS provider → Twilio |
| Verify Google OAuth domain | Google Cloud Console → OAuth consent screen → Authorized domains: add `truckopti.in` |

---

## 6. DONE WHEN

- [ ] `npm run build` → 0 TS errors ✅
- [ ] `npm audit` → 0 vulnerabilities ✅  
- [ ] All 5 tasks complete or skipped with explanation
- [ ] STATE.md updated with agent message (newest at top)
- [ ] TASK.md updated (BATCH16 tasks → ✅ DONE)
- [ ] Single commit pushed to origin/main
- [ ] Human action items listed in STATE.md message

---

*BATCH16 prompt created by SONNET-004 (JUDGE) | 2026-03-07*
