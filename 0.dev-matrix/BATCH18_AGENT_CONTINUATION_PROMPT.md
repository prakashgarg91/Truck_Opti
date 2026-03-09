# BATCH18 — Agent Continuation Prompt

> **Read this entire file before writing a single line of code.**
> Batch number: **18** | Version target: **v55** | Date: 2026-03-09

---

## 1. CONTEXT — WHERE WE ARE

| Field | Value |
|-------|-------|
| Production URL | https://www.truckopti.in |
| Heroku app | `truck-opti-app` |
| Current Heroku version | **v54** — deployed 2026-03-09 (BATCH17 complete) |
| Stack | React 18 + TypeScript + Vite 5 + Tailwind + Supabase + Zustand + React Router v6 |
| Build command | `cd d:\Github\Truck_Opti\frontend ; npm run build` |
| npm cache | `D:\npm-cache` (use `--cache D:\npm-cache` if slow) |
| npm audit | ✅ **0 vulnerabilities** |
| Open security bugs | **None** |

### What was completed in BATCH17 (v54)

| Task | Status |
|------|--------|
| SEO: Open Graph + Twitter Card meta tags in `frontend/index.html` | ✅ DONE |
| `frontend/public/sitemap.xml` — all public routes | ✅ DONE |
| `frontend/public/robots.txt` — with sitemap reference | ✅ DONE |
| `AdminDashboardPage.tsx` — CSV export button for shipments | ✅ DONE |
| `LandingPage.tsx` + `App.tsx` — non-authenticated users see landing page at `/` | ✅ DONE |
| Agency job dispatch modal — confirmed **already existed** (v43) | ✅ Verified |
| Driver live GPS — confirmed **already existed** (v39/v40) | ✅ Verified |

### ⚠️ HUMAN ACTIONS STILL PENDING

These **cannot** be done by an AI agent — require production credentials:

1. **`supabase db push`** — apply 3 pending migrations to production Supabase:
   - `supabase/migrations/20260307000000_fix_rls_ownership.sql`
   - `supabase/migrations/20260308000000_driver_payouts.sql`
   - `supabase/migrations/20260309000000_contact_inquiries.sql`
2. **Razorpay live keys**: `heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXX RAZORPAY_KEY_SECRET=XXX --app truck-opti-app`
3. **Twilio SMS OTP**: Supabase Dashboard → Auth → Phone Providers → Twilio

---

## 2. MANDATORY READS BEFORE STARTING

```
0.dev-matrix/SECURITY.md    — forbidden patterns (RLS, redirects, error.message exposure)
0.dev-matrix/PATTERNS.md    — Auth, Supabase, bilingual, payment patterns
0.dev-matrix/RULES.md       — build rules, commit conventions, anti-patterns
```

## 3. AGENT REGISTRATION

Before writing any code, add yourself to `0.dev-matrix/STATE.md` active agents table:

```
| `YOUR-ID` | LEAD | Model Name | Full-stack | BATCH18 tasks | 2026-03-09 | ✅ Active |
```

---

## 4. BUILD GATE — MUST PASS BEFORE ANY COMMIT

```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build
# Required: 0 TypeScript errors. Do not commit if there are TS errors.
```

---

## 5. KEY PATTERNS (REQUIRED)

### Auth
```typescript
import { useAuthStore } from '../stores/authStore'
const { user } = useAuthStore()
```

### Supabase queries
```typescript
const { data, error } = await supabase.from('table').select()
if (error) {
  console.error('[Context]', error)
  toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')
  return
}
```

### Error messages — NEVER expose raw error
```typescript
// ❌ FORBIDDEN
toast.error(error.message)

// ✅ CORRECT
toast.error(language === 'en' ? 'Failed to load data' : 'डेटा लोड करने में विफल')
```

### Bilingual pattern
```typescript
const { language } = useLanguageStore()
const label = language === 'en' ? 'English text' : 'हिंदी पाठ'
```

---

## 6. DATABASE SCHEMA (relevant tables)

```sql
-- driver_payouts (exists via migration 20260308000000_driver_payouts.sql)
-- id uuid, driver_id uuid, amount numeric, upi_id text,
-- status: 'pending' | 'approved' | 'paid' | 'rejected'
-- reason text, requested_at timestamptz, processed_at timestamptz

-- profiles (user profiles — query this for admin user management)
-- id uuid, full_name text, phone text, role text,
-- subscription_tier text, created_at timestamptz

-- agency_jobs (for revenue chart)
-- id uuid, agency_id uuid, fare numeric, status text, created_at timestamptz

-- shipments (for trip photos)
-- id uuid, loading_photo_url text, delivery_photo_url text, status text

-- NOTE: Migrations NOT yet applied to production (human pending)
-- All DB queries may fail on production until supabase db push is run
```

---

## 7. BATCH18 TASKS

### BATCH18-T1 — Driver Withdrawal Request UI (P1, Medium, ~2 hr)

**File**: `frontend/src/pages/DriverEarningsPage.tsx`

**Task**:
1. Read current `DriverEarningsPage.tsx` first — it already shows total earnings, weekly/monthly summaries, and uses `useAuthStore` + `useLanguageStore`.
2. Add a **"Request Withdrawal"** button at the top of the page (next to the total earnings card).
3. Clicking the button opens a **modal** (inline, no separate page) with:
   - Amount input (number, min ₹100, max = available balance)
   - UPI ID text input (e.g. `driver@ybl`)
   - Submit / Cancel buttons
4. On submit → `supabase.from('driver_payouts').insert({ driver_id: user.id, amount, upi_id, status: 'pending', requested_at: new Date().toISOString() })`
5. Success toast (bilingual). Close modal. Refresh page data.
6. Add a section below the earnings summary showing "Pending Withdrawal Requests" — query `driver_payouts` where `driver_id = user.id`, show date, amount, status badge.

**Acceptance criteria**:
- [x] "Request Withdrawal" button visible on DriverEarningsPage
- [x] Modal opens with amount + UPI ID fields
- [x] Insert to `driver_payouts` with status = 'pending'
- [x] Admin can see pending requests in `/admin/payouts` (AdminPayoutsPage already exists ✅)
- [x] No raw `error.message` exposed
- [x] Bilingual EN/HI labels
- [x] TypeScript strict — no `any` unless unavoidable
- [x] 0 TS build errors

---

### BATCH18-T2 — Admin Revenue Trend Chart (P1, Medium, ~2 hr)

**File**: `frontend/src/pages/AdminDashboardPage.tsx`

**Context**: AdminDashboardPage already shows `Analytics` summary cards (totalRevenue, totalAgencies, totalDrivers, totalShipments). It now also has a CSV export button (from BATCH17-T4). Read the existing file before editing.

**Task**:
1. Add a **"Revenue Trend (Last 6 Months)"** section below the summary cards.
2. Query `agency_jobs` for the last 6 full months:
   ```sql
   SELECT DATE_TRUNC('month', created_at), COUNT(*), SUM(fare)
   FROM agency_jobs
   WHERE created_at >= NOW() - INTERVAL '6 months'
   GROUP BY 1 ORDER BY 1
   ```
   Use Supabase's `.select()` with `.gte()` and `.lte()` — not raw SQL. Group client-side.
3. Render as a **pure Tailwind CSS bar chart** — **do NOT add recharts or any charting npm package** (recharts is not in `frontend/package.json`). Use `<div>` height proportional to value, inline style `height: ${pct}%` or similar.
4. Show: month label (Jan, Feb, etc.), shipment count, revenue (₹ formatted).
5. Two bars per month: one for count (blue), one for revenue scaled to 1/100 (green).

**Acceptance criteria**:
- [x] 6-month bar chart visible on AdminDashboardPage
- [x] No new npm packages added
- [x] Bars proportional to data
- [x] Shows month label + tooltip/label with count and revenue
- [x] Bilingual section header
- [x] 0 TS build errors

---

### BATCH18-T3 — Invoice GST Improvements (P2, Medium, ~2 hr)

**File**: `frontend/src/pages/InvoicePage.tsx`

**Task**:
1. Read `InvoicePage.tsx` first to understand current PDF generation (uses `@react-pdf/renderer` or `jsPDF` — check the imports).
2. Add the following fields to the invoice:
   - **GSTIN** input (editable, 15 chars, `[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}` format)
   - **SAC Code**: 996511 (Transport of goods by road) — displayed as a static label
   - **Tax breakdown**: CGST (9%) + SGST (9%) for intra-state OR IGST (18%) for inter-state
     - Add a dropdown: "Intra-state (CGST + SGST)" / "Inter-state (IGST)"
     - Calculate and show the tax rows on the invoice
3. Bilingual field labels.
4. Store GSTIN in localStorage per agency (so it persists across invoice generations): `localStorage.setItem('agency_gstin', gstin)`.

**Acceptance criteria**:
- [x] GSTIN field on invoice with validation (or relaxed to just 15 chars)
- [x] SAC code 996511 displayed
- [x] Tax type selector (intra/inter-state) with correct rate breakdown
- [x] Tax amounts calculated and shown on invoice
- [x] GSTIN persists in localStorage between sessions
- [x] Bilingual labels
- [x] 0 TS build errors

---

### BATCH18-T4 — Trip Photos Viewer in Tracking (P2, Simple, ~1 hr)

**File**: `frontend/src/pages/TrackingPage.tsx`

**Context**: TrackingPage shows shipment status. When status is 'delivered', the shipment/job may have `loading_photo_url` and `delivery_photo_url` populated by the driver from DriverTripPage.

**Task**:
1. Read `TrackingPage.tsx` first — find where the shipment detail is rendered.
2. In the shipment detail section, after the status badge, add a "Trip Photos" section that:
   - Shows **only if** `loading_photo_url` or `delivery_photo_url` are non-null
   - Displays two thumbnail images (80×80px or similar) with labels "Loading Photo / लोडिंग फोटो" and "Delivery Photo / डिलीवरी फोटो"
   - Clicking a thumbnail opens a **fullscreen lightbox overlay** (`fixed inset-0 bg-black/80 z-50 flex items-center justify-center`) with the full image and an X close button
3. Use regular `<img>` tags with `src={url}` — the URLs come from Supabase Storage (already valid signed URLs or public URLs).

**Acceptance criteria**:
- [x] Photos section appears only when url is non-null
- [x] Thumbnails render correctly
- [x] Lightbox modal opens on click
- [x] Lightbox closes on X button or backdrop click
- [x] Bilingual photo labels
- [x] 0 TS build errors

---

### BATCH18-T5 — Admin User Management Page (P2, Medium, ~2 hr)

**Files**:
- Create: `frontend/src/pages/AdminUsersPage.tsx`
- Edit: `frontend/src/App.tsx` (add lazy import + route `/admin/users`)
- Edit: `frontend/src/pages/AdminDashboardPage.tsx` (add nav card "Users / उपयोगकर्ता")

**Task**:
1. **`AdminUsersPage.tsx`**: 
   - Query `profiles` table: `supabase.from('profiles').select('id, full_name, phone, role, subscription_tier, created_at').order('created_at', { ascending: false })`
   - Display as a table with columns: Name, Phone, Role (badge), Plan (badge), Joined Date
   - Role badges: `admin`=purple, `agency`=blue, `driver`=green, `customer`=gray
   - Plan badges: `free`=gray, `basic`=blue, `pro`=orange, `enterprise`=purple
   - Add a search bar (filter by name/phone client-side)
   - Admin-only guard: check `user?.role !== 'admin'` → redirect to `/`

2. **App.tsx**: Add lazy import + route:
   ```typescript
   const AdminUsersPage = React.lazy(() => import('./pages/AdminUsersPage'))
   // Route: <Route path="/admin/users" element={<AdminUsersPage />} />
   // Place inside the protected admin routes section
   ```

3. **AdminDashboardPage.tsx**: Add a 5th nav card:
   - Icon: `Users` (already imported)
   - Label: `language === 'en' ? 'User Management' : 'उपयोगकर्ता प्रबंधन'`
   - Route: `/admin/users`
   - Color style: purple/indigo theme

**Acceptance criteria**:
- [x] `/admin/users` route exists and renders
- [x] Shows all profiles with role + plan badges
- [x] Search bar filters client-side
- [x] Admin-only guard (non-admin redirected)
- [x] Nav card on AdminDashboardPage
- [x] No raw `error.message` exposed
- [x] Bilingual labels
- [x] 0 TS build errors

---

## 8. SECURITY CHECKLIST — VERIFY BEFORE COMMITTING

Run a final audit on every file you touch:

| Check | Files |
|-------|-------|
| No `toast.error(error.message)` or `toast.error(err.message)` | All modified files |
| No `USING (true)` in any RLS policy (new migrations) | Any `.sql` files |
| No `any` TypeScript type except last resort | All `.tsx` files |
| No `window.location.href` with user-supplied URL | All modified files |
| No hardcoded API keys or secrets | All files |
| All Supabase queries destructure `{ data, error }` and check error | All modified files |

---

## 9. COMMIT CONVENTION

```
feat: BATCH18 complete — driver withdrawal, admin chart, invoice GST, photos, user mgmt
```

Or per-task:
```
feat(driver): withdrawal request UI in DriverEarningsPage
feat(admin): 6-month revenue chart in AdminDashboardPage
feat(invoice): GST fields + tax breakdown in InvoicePage
feat(tracking): trip photos lightbox viewer
feat(admin): AdminUsersPage + user management nav card
```

---

## 10. DEPLOY CHECKLIST

```powershell
# 1. Build gate (must pass)
cd d:\Github\Truck_Opti\frontend ; npm run build

# 2. Commit
git add -A
git commit -m "feat: BATCH18 complete — driver withdrawal, revenue chart, invoice GST, trip photos, user mgmt"

# 3. Push to GitHub + Heroku
git push origin main
git push heroku main

# 4. Verify deployment
heroku logs --tail --app truck-opti-app
```

---

## 11. REMAINING WORK AFTER BATCH18

| Feature | Priority | Notes |
|---------|----------|-------|
| FCM push notifications for driver job offers | P2 | Service worker + Firebase Cloud Messaging |
| E-way bill generation (NIC API integration) | P2 | GST compliance |
| Agency payroll — mark driver payments | P2 | AgencyDriversPage |
| Payment split — escrow + release on delivery | P2 | Razorpay needs live keys first |
| GSTR-1 export CSV for agencies | P3 | Tax compliance |
| ERP integration REST API | P3 | Future |
| Biometric login (WebAuthn) | P3 | Future |
| Full offline capability (IndexedDB) | P3 | Future |

---

*Auto-generated by SONNET-006 (Claude Sonnet 4.6) | 2026-03-09 | BATCH17 → v54 → BATCH18*
