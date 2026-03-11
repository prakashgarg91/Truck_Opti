# BATCH20 — True Completion Prompt
**Project:** TruckOpti India Logistics SaaS  
**URL:** https://www.truckopti.in | Heroku app: `truck-opti-app`  
**Current Version:** v55 (git HEAD: 25c801c2)  
**Date:** 2026-03-11  
**Goal:** Achieve production-ready, shippable state — no P0/P1 gaps remaining in code.

---

## MANDATORY READING (read BEFORE writing a single line of code)

```
0.dev-matrix/SECURITY.md       — 15-item checklist. Non-negotiable.
0.dev-matrix/PATTERNS.md       — Auth, Supabase, bilingual, toast patterns.
0.dev-matrix/DEPENDENCIES.md   — DB table schemas, file structure, data flows.
0.dev-matrix/RULES.md          — Build rules, anti-patterns, Rule 19-22.
supabase/migrations/           — Read ALL .sql files to know exact column names.
frontend/src/store/authStore.ts — agencyId, driverId, user getters.
frontend/src/hooks/useSubscription.ts — existing hook to reuse.
```

**Verification rule:** Before every `supabase.from('table').select('col')` call, grep `supabase/migrations/` for the column name. If it does not exist in a migration → CREATE the migration first. This is Rule 21.

---

## WHAT "TRUE COMPLETION" MEANS FOR THIS PROJECT

TruckOpti is a 4-portal logistics SaaS (Customer / Agency / Driver / Admin).  
True completion = every user journey works end-to-end + the platform can be handed to a paying customer without embarrassment.

### What IS working (do not touch unless fixing a bug):
- ✅ Full booking flow: Customer books → Agency sees → Driver accepts → Trip photos → OTP delivery
- ✅ Auth: Email OTP + Google OAuth, role-based routing
- ✅ Invoice PDF (jsPDF, GST fields, bilingual)
- ✅ Admin dashboard: revenue trend chart, CSV export, user management, payouts view, contact view
- ✅ RLS policies fixed (BATCH13 — all 6 known bugs resolved)
- ✅ Razorpay webhook HMAC verification
- ✅ Landing page, Terms, Privacy, Contact pages

### What is NOT working (your tasks):
See T1–T8 below.

---

## YOUR TASKS — BATCH20

### T1 — CRITICAL: Add missing photo columns migration (P0)

**Problem:** `TrackingPage.tsx` queries `photo_loading_url` and `photo_delivery_url` from `agency_jobs`, but no migration file adds these columns. These queries silently return `null` for ALL trips — making the photo viewer completely broken.

**Steps:**
1. Search `supabase/migrations/` for `photo_loading_url` → you will find **zero matches**
2. Create `supabase/migrations/20260311000000_add_photo_columns_to_agency_jobs.sql`:

```sql
-- BATCH20 T1: Add trip photo columns to agency_jobs
ALTER TABLE agency_jobs
  ADD COLUMN IF NOT EXISTS photo_loading_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_delivery_url TEXT;
```

3. No RLS change needed (agency_jobs already has correct RLS).
4. Mark done. This unblocks the trip photo feature from BATCH18.

---

### T2 — Driver wallet: real balance from DB (P1)

**File:** `frontend/src/pages/DriverEarningsPage.tsx`

**Problem:** The wallet balance card currently shows a hardcoded or incorrect balance. The real balance must be computed from `driver_payouts` table.

**Steps:**
1. Read the current file to understand the existing state shape.
2. Replace the balance calculation with a real DB query:

```typescript
// In loadData():
const { data: payouts, error: payErr } = await supabase
  .from('driver_payouts')
  .select('amount, status')
  .eq('driver_id', driverId)

if (payErr) {
  console.error('[DriverEarnings] balance:', payErr)
  toast.error(language === 'en' ? 'Failed to load balance' : 'बैलेंस लोड नहीं हुआ')
  return
}

const earned = payouts?.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount ?? 0), 0) ?? 0
const pending = payouts?.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount ?? 0), 0) ?? 0
```

3. Display in the wallet card:
   - Primary: **₹{earned.toLocaleString('en-IN')}** earned (paid)
   - Secondary badge: **₹{pending.toLocaleString('en-IN')} pending** (if pending > 0, show amber badge)
4. Bilingual: "Wallet Balance" / "वॉलेट बैलेंस", "Pending" / "लंबित"

**Column check:** `driver_payouts` has columns: `id, driver_id, amount, status, requested_at, processed_at, note` (see migration `20260308000000_driver_payouts.sql`). No `agency_id` or `type` column yet.

---

### T3 — Agency payroll: "Pay Driver" button (P2)

**File:** `frontend/src/pages/AgencyDriversPage.tsx`

**Problem:** Agency has no way to record paying a driver. This is needed for financial tracking.

**Steps:**

**Step 3a — Create migration** `supabase/migrations/20260311000001_driver_payouts_agency_columns.sql`:

```sql
-- BATCH20 T3: Add agency_id and type to driver_payouts for agency-initiated payments
ALTER TABLE driver_payouts
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES transport_agencies(id),
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'withdrawal'
    CHECK (type IN ('withdrawal', 'agency_pay'));

-- Agency can read payouts for their drivers
CREATE POLICY "agency_reads_driver_payouts" ON driver_payouts
  FOR SELECT TO authenticated
  USING (
    agency_id IN (
      SELECT id FROM transport_agencies WHERE user_id = auth.uid()
    )
  );

-- Agency can insert payments to their drivers
CREATE POLICY "agency_inserts_driver_payout" ON driver_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    agency_id IN (
      SELECT id FROM transport_agencies WHERE user_id = auth.uid()
    )
    AND type = 'agency_pay'
  );
```

**Step 3b — Add UI to AgencyDriversPage.tsx:**

1. Read the current file first.
2. Add a "Pay" button (green, `Wallet` icon from lucide-react) next to each driver row.
3. On click: open a modal with:
   - Amount field (number, required, min 1)
   - Note field (text, optional, placeholder: "Monthly salary / मासिक वेतन")
   - Submit button: "Record Payment" / "भुगतान दर्ज करें"
4. On submit:

```typescript
const { error } = await supabase.from('driver_payouts').insert({
  driver_id: selectedDriver.id,
  agency_id: agencyId,
  amount: payAmount,
  type: 'agency_pay',
  status: 'paid',
  note: payNote || null
})
if (error) {
  console.error('[AgencyDrivers] pay:', error)
  toast.error(language === 'en' ? 'Payment failed' : 'भुगतान विफल')
  return
}
toast.success(language === 'en' ? 'Payment recorded' : 'भुगतान दर्ज किया गया')
```

5. Close modal on success.

---

### T4 — Subscription enforcement: block expired users (P1)

**Problem:** `useSubscription` hook exists and `MobileLayout` shows trial/expired banners — but **no page actually blocks the user from using core features when their trial expires**. A customer with an expired plan can still book trucks. This is a revenue leak.

**Pages to add enforcement to:**

| Page | Block condition | What to show |
|------|----------------|--------------|
| `NewShipmentPage.tsx` | `isExpired && !isAdmin` | Full-page upgrade wall (not just a toast) |
| `RoutesPage.tsx` | already has `checkLimit` — verify it's wired correctly | Already done if present |
| `PackingPage.tsx` | `isExpired && !isAdmin` | Upgrade prompt overlay |

**Pattern to follow (read `RoutesPage.tsx` first for the existing pattern, then replicate):**

```typescript
import { useSubscription } from '../hooks/useSubscription'

const { isExpired, isActive, isTrial, showUpgradePrompt } = useSubscription()
const { user } = useAuthStore()
const isAdmin = user?.user_metadata?.role === 'admin'

// At top of JSX return, before any real content:
if (!isAdmin && isExpired) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-2xl font-bold text-red-600 mb-2">
        {language === 'en' ? 'Subscription Expired' : 'सदस्यता समाप्त'}
      </h2>
      <p className="text-gray-600 mb-6">
        {language === 'en'
          ? 'Your trial has ended. Upgrade to continue booking trucks.'
          : 'आपका परीक्षण समाप्त हो गया है। ट्रक बुकिंग जारी रखने के लिए अपग्रेड करें।'}
      </p>
      <button
        onClick={() => navigate('/pricing')}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold"
      >
        {language === 'en' ? 'View Plans' : 'प्लान देखें'}
      </button>
    </div>
  )
}
```

---

### T5 — Admin subscriber management page (P1)

**Context:** LAUNCH_CHECKLIST item 6.8 — "Admin panel for subscriber management" is marked ❌.  
The admin already has `/admin/users`, `/admin/payouts`, `/admin/contact`. Add `/admin/subscriptions`.

**File to create:** `frontend/src/pages/AdminSubscriptionsPage.tsx`

**Data query:**
```typescript
// Join subscriptions with users table
const { data, error } = await supabase
  .from('subscriptions')
  .select('id, user_id, plan_id, status, trial_ends_at, created_at, users!inner(name, email)')
  .order('created_at', { ascending: false })
```

**Display columns:**
- User name + email
- Plan (free/pro/business/enterprise)
- Status badge: active (green), trial (amber), expired (red), cancelled (gray)
- Trial end date (if applicable)
- Subscription created date

**Actions:**
- None needed yet — read-only view is sufficient for completion

**Route:** Add to `frontend/src/App.tsx`:
```tsx
<Route path="/admin/subscriptions" element={<AdminSubscriptionsPage />} />
```

**Nav card:** Add to `AdminDashboardPage.tsx` nav cards grid:
```tsx
{ icon: CreditCard, label: language === 'en' ? 'Subscriptions' : 'सदस्यता', path: '/admin/subscriptions', color: 'text-purple-600 bg-purple-50' }
```

Import `CreditCard` from lucide-react (already used elsewhere — verify before adding import).

---

### T6 — Fix Dependabot 32 alerts: upgrade vite-plugin-pwa (P1)

**Problem:** `vite-plugin-pwa@0.19.8` uses `workbox-build@7.4.0` which pulls in `rollup@2.80.0` — a version with known CVEs. GitHub Dependabot flags 32 alerts because of this transitive dep.

**Steps:**
1. Check latest vite-plugin-pwa version: look at package.json `vite` peer requirements
2. Run: `cd d:\Github\Truck_Opti\frontend ; npm install vite-plugin-pwa@latest --save-dev`
3. Run: `npm run build` — verify 0 TS errors AND PWA still generates `dist/sw.js` correctly
4. Run: `npm audit` — must show 0 vulnerabilities
5. If build breaks due to vite-plugin-pwa API changes (VitePWA config options), read the plugin docs and fix `frontend/vite.config.ts` accordingly.
6. If `npm install vite-plugin-pwa@latest` breaks the build and cannot be fixed in <30 minutes, **skip this task** and add a note in RULES.md §19 that this is blocked.

---

### T7 — E-way bill form stub (P2)

**File:** `frontend/src/pages/NewShipmentPage.tsx`

**Problem:** After successful truck booking, there is no way for the customer to optionally fill e-way bill details (required by GST law in India for goods > ₹50,000).

**Steps:**

**Step 7a — Create migration** `supabase/migrations/20260311000002_eway_bill_column.sql`:
```sql
-- BATCH20 T7: Add e-way bill data column to shipments
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS eway_bill_data JSONB;
```

**Step 7b — Add UI to NewShipmentPage.tsx:**

1. Read the current success state in the file (after booking is confirmed).
2. After the booking success message, add a collapsible section "E-Way Bill (Optional)" / "ई-वे बिल (वैकल्पिक)".
3. Fields:
   - Consignor GSTIN (validate: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`)
   - Consignee GSTIN (same validation)
   - Invoice value ₹ (number, min 1)
   - HSN Code (6-char number string)
4. Submit handler:
```typescript
const isValidGSTIN = (g: string) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(g)

// on submit:
if (consignorGSTIN && !isValidGSTIN(consignorGSTIN)) {
  toast.error(language === 'en' ? 'Invalid Consignor GSTIN format' : 'अमान्य GSTIN प्रारूप')
  return
}

const { error } = await supabase
  .from('shipments')
  .update({ eway_bill_data: { consignor_gstin: consignorGSTIN, consignee_gstin: consigneeGSTIN, invoice_value: invoiceValue, hsn_code: hsnCode } })
  .eq('id', newShipmentId)

if (error) {
  console.error('[NewShipment] eway:', error)
  toast.error(language === 'en' ? 'Failed to save e-way bill' : 'ई-वे बिल सेव नहीं हुआ')
  return
}
toast.success(language === 'en' ? 'E-way bill saved — NIC API integration coming soon' : 'ई-वे बिल सेव किया — NIC API जल्द आएगा')
```

---

### T8 — Update LAUNCH_CHECKLIST.md to reflect true state (P2)

After completing T1–T7, update `0.dev-matrix/LAUNCH_CHECKLIST.md`:

- Phase 6.8: mark ✅ (AdminSubscriptionsPage done)
- Add Phase 6.11: "Photo columns migration" ✅ (T1)
- Add Phase 6.12: "Subscription enforcement on booking page" ✅ (T4)
- Leave 6.1/6.2/6.9 as ❌ with note "requires owner action"

---

## HUMAN-REQUIRED STEPS (you CANNOT do these — log them clearly)

These are production secrets / external service configurations that only the repo owner can do:

| # | Action | Why it's blocking |
|---|--------|-------------------|
| H1 | `supabase db push` — apply 3 pending migrations to production | `20260307`, `20260308`, `20260309` not yet in Supabase prod DB. RLS fixes and driver_payouts table not live. |
| H2 | Apply your new BATCH20 migrations (T1, T3, T7) to Supabase prod | Same as above — run `supabase db push` after this batch |
| H3 | `heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXX RAZORPAY_KEY_SECRET=XXX --app truck-opti-app` | Real payments broken |
| H4 | Configure Twilio SMS in Supabase Auth → Phone Providers | Phone OTP silently fails |
| H5 | Enable PITR backups in Supabase dashboard (free tier may not support) | Data protection |
| H6 | Set Firebase project + `VITE_FIREBASE_CONFIG` env var if FCM notifications are needed | Required for BATCH19-T4 |

---

## SECURITY RULES (non-negotiable)

- Every new table: RLS `ENABLE ROW LEVEL SECURITY` + policies. **Never `USING (true)`** on user data.
- Never show `error.message` to users — use bilingual toast only.
- Every `supabase.from()` — destructure `{ data, error }` and handle the error case.
- All user-facing strings: bilingual (English + Hindi). Pattern: `language === 'en' ? '...' : '...'`
- TypeScript: no `any` unless unavoidable. No unused imports left behind.

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
# After all tasks complete:
git add -A
git commit -m "feat: BATCH20 vXX — photo columns migration, driver wallet, agency payroll, subscription enforcement, admin subscriptions, eway bill stub"
git push origin main
git push heroku main

# Then tell owner to run:
# supabase db push   ← to apply all pending migrations to prod
```

---

## AGENT OUTPUT FORMAT

When done, paste this report so SONNET (judge) can verify:

```
## BATCH20 AGENT COMPLETION REPORT
Version deployed: vXX
- T1 photo migration:         [DONE/SKIP] — filename created
- T2 driver wallet balance:   [DONE/SKIP] — what changed
- T3 agency payroll:          [DONE/SKIP] — migration + UI
- T4 subscription enforcement:[DONE/SKIP] — which pages
- T5 admin subscriptions page:[DONE/SKIP] — route added?
- T6 Dependabot vite-pwa fix: [DONE/SKIP/BLOCKED] — reason
- T7 eway bill form:          [DONE/SKIP] — migration + UI
- T8 launch checklist update: [DONE/SKIP]
- Build:    [PASS/FAIL]
- npm audit: [N vulnerabilities]
- Migrations created: [list .sql filenames]
- Human blockers documented: [YES/NO]
- New bugs found: [list or NONE]
```

---

## COMPLETION CRITERIA — Project is "truly complete" when:

- [ ] All 4 portal journeys work end-to-end without null data: Customer, Agency, Driver, Admin
- [ ] Photo columns migration exists → trip photos visible in TrackingPage
- [ ] Expired subscription users cannot book trucks (subscription enforcement)
- [ ] Admin can view all subscribers at `/admin/subscriptions`
- [ ] Driver earnings page shows real calculated balance
- [ ] Agency can record driver payments
- [ ] E-way bill stub present (saves data, shows coming-soon toast)
- [ ] `npm audit` shows 0 vulnerabilities
- [ ] `npm run build` shows 0 TypeScript errors
- [ ] All 3 pending Supabase migrations pushed to prod (human step)
- [ ] Razorpay live keys configured (human step)

---

*Created by SONNET-006 (Claude Sonnet 4.6) | 2026-03-11 | For BATCH20 execution*  
*Previous batch prompt: `0.dev-matrix/BATCH19_AGENT_CONTINUATION_PROMPT.md` (superseded by this file)*
