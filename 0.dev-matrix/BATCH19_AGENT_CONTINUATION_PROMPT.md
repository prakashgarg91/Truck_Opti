# BATCH19 Agent Continuation Prompt
**Project:** TruckOpti India Logistics SaaS  
**Current Version:** v55 (Heroku: truck-opti-app)  
**Previous Batch:** BATCH18 ⚠️ PARTIAL (2 bugs found & fixed by SONNET-006 post-deploy)  
**Date:** 2026-03-10

---

## CONTEXT — What happened in BATCH18

BATCH18 was deployed by MINIMAX-003. Post-deploy audit by SONNET-006 found:

| Bug | File | Issue | Fix Applied |
|-----|------|-------|-------------|
| BUG-BATCH18-T1 | `DriverEarningsPage.tsx` | Insert used `withdrawal_requests` table (non-existent); reader (`AdminPayoutsPage`) uses `driver_payouts` | ✅ Fixed: table name changed |
| BUG-021 | `AdminUsersPage.tsx` | Selected `full_name` from `users` table but column is `name` → blank names in UI | ✅ Fixed: 4 occurrences updated |

**T3 note:** Invoice GST fields were already present pre-BATCH18. Claim "already present" was accurate.

---

## YOUR TASKS — BATCH19 (T1–T5)

### T1 — Verify photo columns in agency_jobs (P0)
**File:** `frontend/src/pages/TrackingPage.tsx`  
**Risk:** BATCH18-T4 added `photo_loading_url` and `photo_delivery_url` columns to the `agency_jobs` select query. Verify these columns exist in the actual migration files under `supabase/migrations/`. If they don't exist, create a new migration to add them.

**Steps:**
1. Search `supabase/migrations/` for `photo_loading_url` and `photo_delivery_url`
2. If MISSING → create `supabase/migrations/20260310000000_add_photo_columns_to_agency_jobs.sql`:
   ```sql
   ALTER TABLE agency_jobs
     ADD COLUMN IF NOT EXISTS photo_loading_url TEXT,
     ADD COLUMN IF NOT EXISTS photo_delivery_url TEXT;
   ```
3. If PRESENT → no action needed, mark done.

### T2 — Driver wallet balance display (P1)
**File:** `frontend/src/pages/DriverEarningsPage.tsx`  
**Current:** Earnings list shows individual rows from `driver_payouts`. Wallet balance is `currentBalance` state, hardcoded or calculated incorrectly.  
**Goal:** Show real balance = SUM of `driver_payouts.amount WHERE status='paid' AND driver_id=X` minus SUM of withdrawals processed. Add a "Pending" badge for withdrawals with `status='pending'`.

**Pattern to follow:**
```typescript
const { data: payouts, error } = await supabase
  .from('driver_payouts')
  .select('amount, status')
  .eq('driver_id', driverId)

if (error) { console.error('[DriverEarnings]', error); toast.error(language === 'en' ? 'Failed to load earnings' : 'कमाई लोड नहीं हुई'); return }

const paid = payouts?.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0) ?? 0
const pending = payouts?.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0) ?? 0
```

### T3 — Agency payroll page (P2)
**File:** `frontend/src/pages/AgencyDriversPage.tsx`  
**Goal:** Add a "Pay Driver" button per driver. Opens a modal with:
- Amount (number input)
- Pay period (month/year selector)
- UPI ID (text input)
- Note (optional)

On submit: `supabase.from('driver_payouts').insert({ agency_id, driver_id, amount, type: 'agency_pay', status: 'paid', created_at: new Date() })`

**Check first:** Does `driver_payouts` have `type` and `agency_id` columns? If not, create migration:
```sql
ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'withdrawal',
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES agencies(id);
```

### T4 — FCM push notifications (P2)
**Files:** `frontend/public/firebase-messaging-sw.js` (new), `frontend/src/main.tsx`, `frontend/src/store/authStore.ts`

**Goal:** When a new row is inserted into `job_offers` with `driver_id = currentDriver`, show a browser push notification:
- Title: "New Job Offer" / "नई जॉब ऑफर"  
- Body: Show pickup city → drop city, distance

**Steps:**
1. Add Firebase to `frontend/package.json`: `firebase` (already likely present — check first)
2. Create `frontend/public/firebase-messaging-sw.js` service worker
3. In `authStore.ts`, request notification permission on driver login
4. In `DriverJobsPage.tsx`, subscribe to Supabase Realtime on `job_offers` and trigger notification

**Do NOT block login if notification permission denied.**

### T5 — E-way bill form stub (P2)
**File:** `frontend/src/pages/NewShipmentPage.tsx`  
**Goal:** After shipment booking success, show optional "E-Way Bill" section:
- Consignor GSTIN (15-char text, validate with regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`)
- Consignee GSTIN
- Invoice value (₹)
- HSN code
- Submit: For now, just show toast: `"E-way bill saved — NIC API integration pending"` / `"ई-वे बिल सेव किया — NIC API एकीकरण बाकी है"`
- Save data to `shipments` table in a `eway_bill_data` JSONB column (add migration if needed)

---

## FILES TO READ BEFORE CODING

```
0.dev-matrix/SECURITY.md        — 15-item checklist (MANDATORY)
0.dev-matrix/PATTERNS.md        — Auth, Supabase, bilingual patterns
0.dev-matrix/DEPENDENCIES.md    — DB table reference
supabase/migrations/            — All current table schemas
frontend/src/store/authStore.ts — agencyId, driverId, user getters
```

---

## SECURITY CHECKLIST (non-negotiable)

- [ ] Every new Supabase table → RLS enabled + policies (no `USING (true)` on user tables)
- [ ] Never read/display `error.message` — use friendly bilingual toast
- [ ] Every `supabase.from()` → destructure `{ data, error }` and handle error
- [ ] TypeScript: no `any` type unless absolutely required
- [ ] New env vars → `.env.example` updated (never commit real secrets)

---

## BUILD GATE — MUST PASS

```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build   # 0 TypeScript errors required
```

---

## DEPLOY CHECKLIST

```bash
# 1. Build passes (0 TS errors)
# 2. Run new SQL migrations in Supabase dashboard (if any)
# 3. git add -A && git commit -m "feat: BATCH19 vXX — T1-T5 description"
# 4. git push origin main
# 5. git push heroku main
# 6. Verify on https://www.truckopti.in
# 7. npm audit — must show 0 vulnerabilities
```

---

## AGENT OUTPUT FORMAT

When you finish, paste your result in this format so the lead agent (SONNET-006) can judge:

```
## BATCH19 AGENT COMPLETION REPORT
- T1: [DONE/SKIP/PARTIAL] — description
- T2: [DONE/SKIP/PARTIAL] — description
- T3: [DONE/SKIP/PARTIAL] — description
- T4: [DONE/SKIP/PARTIAL] — description
- T5: [DONE/SKIP/PARTIAL] — description
- Build: [PASS/FAIL] — errors if any
- Deploy: v[XX] deployed at [timestamp]
- NPM audit: [N vulnerabilities]
- Migrations run: [list or NONE]
- New bugs found: [list or NONE]
```

---

*Created by SONNET-006 | 2026-03-10 | BATCH19 T1-T5*
