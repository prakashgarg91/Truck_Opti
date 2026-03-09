# BATCH17 — Agent Continuation Prompt

> **Read this entire file before writing a single line of code.**
> Batch number: **17** | Version target: **v54** | Date: 2026-03-09

---

## 1. CONTEXT — WHERE WE ARE

| Field | Value |
|-------|-------|
| Production URL | https://www.truckopti.in |
| Heroku app | `truck-opti-app` |
| Current commit | `db5d4c98` (BATCH16 complete) |
| Current Heroku version | **v53** — deployed 2026-03-09 |
| Stack | React 18 + TypeScript + Vite 5 + Tailwind + Supabase + Zustand + React Router v6 |
| Build status | ✅ 0 TypeScript errors, built in 6.71s |
| npm audit | ✅ **0 vulnerabilities** |
| Open security bugs | **None** — all known vulnerabilities RESOLVED |

### What was completed in BATCH16 (v53)

| Task | Status |
|------|--------|
| Admin payouts nav card on AdminDashboardPage | ✅ DONE |
| RLS created_by audit — all 4 tables verified | ✅ DONE |
| Fix all raw error.message leaks (14 in 7 files) | ✅ DONE |
| ContactPage.tsx — public /contact form | ✅ DONE |
| AdminContactPage.tsx — /admin/contact | ✅ DONE |
| Migration: 20260309000000_contact_inquiries.sql | ✅ DONE |
| Deployed to Heroku v53 | ✅ DONE |

### ⚠️ HUMAN ACTIONS STILL PENDING (BLOCKERS)

These CANNOT be done by an AI agent — require production credentials:

1. **`supabase db push`** — apply 3 pending migrations to production Supabase:
   - `supabase/migrations/20260307000000_fix_rls_ownership.sql`
   - `supabase/migrations/20260308000000_driver_payouts.sql`
   - `supabase/migrations/20260309000000_contact_inquiries.sql`
2. **Razorpay live keys** — `heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXX RAZORPAY_KEY_SECRET=XXX --app truck-opti-app`
3. **Twilio SMS OTP** — configure in Supabase Auth → Phone Providers → Twilio

---

### MANDATORY reads before starting

```
0.dev-matrix/SECURITY.md    — FORBIDDEN patterns (RLS, redirects, error.message exposure)
0.dev-matrix/PATTERNS.md    — Auth, Supabase, bilingual, payment patterns
0.dev-matrix/RULES.md       — Build rules, commit conventions, anti-patterns
```

### Build gate — MUST PASS before any commit

```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build
# Required: 0 TS errors. npm cache on D:\npm-cache if needed.
```

---

## 2. BATCH17 TASKS

### BATCH17-T1 — SEO: meta tags + sitemap (P1, Simple, ~1 hr)

**Files**: `frontend/index.html`, `frontend/public/sitemap.xml`, `frontend/src/pages/LandingPage.tsx` (or the home/pricing pages)

**Task**:
1. Update `frontend/index.html` with complete open-graph and Twitter card meta tags:
   ```html
   <meta property="og:title" content="TruckOpti — India's Smartest Truck Booking Platform" />
   <meta property="og:description" content="AI-powered 3D packing, route optimization, live GPS tracking, and agency dispatch for India logistics." />
   <meta property="og:image" content="https://www.truckopti.in/pwa-512x512.png" />
   <meta property="og:url" content="https://www.truckopti.in" />
   <meta property="og:type" content="website" />
   <meta name="twitter:card" content="summary_large_image" />
   <meta name="twitter:title" content="TruckOpti — India's Smartest Truck Booking" />
   <meta name="twitter:description" content="AI-powered logistics SaaS for India — 3D packing, GPS, route optimization." />
   <meta name="twitter:image" content="https://www.truckopti.in/pwa-512x512.png" />
   <meta name="description" content="TruckOpti is India's all-in-one logistics platform — AI-powered 3D bin packing, route optimization, live GPS tracking, and agency dispatch." />
   <link rel="canonical" href="https://www.truckopti.in" />
   ```
2. Create `frontend/public/sitemap.xml` with all public routes: `/`, `/pricing`, `/contact`, `/terms`, `/privacy`, `/login`, `/signup`
3. Create `frontend/public/robots.txt` pointing to sitemap

**Acceptance criteria**:
- `index.html` has complete og: and twitter: meta tags ✅
- `sitemap.xml` exists at `/sitemap.xml` ✅
- `robots.txt` allows all + references sitemap ✅

---

### BATCH17-T2 — Agency job dispatch (P1, Medium, ~2 hrs)

**File**: `frontend/src/pages/AgencyJobsPage.tsx`

**Task**: Allow agency users to assign a driver to a pending shipment booking.
1. On each pending job card, add an "Assign Driver" button
2. Opens a modal that lists drivers belonging to the agency (`drivers` table, filter by `agency_id`)
3. On assign: create a record in `job_offers` table:
   ```typescript
   await supabase.from('job_offers').insert({
     shipment_id: job.id,
     driver_id: selectedDriverId,
     agency_id: agencyId,
     status: 'offered',
     offered_at: new Date().toISOString()
   })
   ```
4. Show success toast (bilingual)
5. The job card should show assigned driver name after assignment

**Acceptance criteria**:
- Agency can assign a driver to a job ✅
- Only drivers belonging to this agency are shown ✅
- No raw error.message exposed ✅
- Bilingual (EN/HI) ✅
- created_by not needed (no RLS on job_offers table — it uses agency_id + driver_id)

---

### BATCH17-T3 — Driver live location updates (P1, Medium, ~2 hrs)

**File**: `frontend/src/pages/DriverTripPage.tsx`

**Task**: When driver is on an active trip, continuously broadcast their GPS location to Supabase.
1. When trip status is `in_transit`, start a location watchdog using `navigator.geolocation.watchPosition`
2. Every position update: call `supabase.from('shipments').update({ latitude: coords.latitude, longitude: coords.longitude, updated_at: new Date().toISOString() }).eq('id', shipmentId)`
3. Show a "Live" indicator when broadcasting
4. Stop watchdog on component unmount or when trip is delivered/cancelled
5. Graceful fallback if geolocation is denied (show error message, don't crash)

**Acceptance criteria**:
- Location updates every GPS position change ✅
- Cleanup on unmount ✅
- No crash if geolocation denied ✅
- No raw error.message ✅
- Bilingual status text ✅

---

### BATCH17-T4 — Admin reports CSV export (P2, Simple, ~1 hr)

**File**: `frontend/src/pages/AdminDashboardPage.tsx`

**Task**: Add a "Export Report" button to the admin dashboard.
1. Button: "Export CSV" / "CSV निर्यात" — appears near the recent jobs section
2. On click: query all shipments for current month from Supabase
3. Generate CSV with columns: shipment_id, origin, destination, status, fare, created_at, agency_name
4. Download file as `truckopti-report-YYYY-MM.csv`
5. Use existing `excel-vendor` dynamic import pattern (or `Papa.unparse` / manual CSV string)

**Acceptance criteria**:
- CSV downloads on click ✅
- Filename includes month ✅
- No empty/null columns ✅
- No raw error.message ✅
- Bilingual button label ✅

---

### BATCH17-T5 — Landing page improvements (P2, Medium, ~2 hrs)

**Check if LandingPage.tsx exists** (`frontend/src/pages/LandingPage.tsx` or the public `/` page when not logged in).

**Task**: If no landing page exists (Dashboard is shown to all), create a public marketing landing page at `/` for non-logged-in users that includes:
- Hero section: "India's Smartest Truck Booking Platform" + CTA "Start Free" → /signup
- Feature grid: 3D Packing, Route Optimization, GPS Tracking, Agency Dispatch (Hindi subtitles)
- Testimonials placeholder section (2-3 cards)
- CTA banner linking to /pricing and /contact

**If LandingPage already exists**: Add a "Contact Us" link in the nav/footer pointing to /contact.

**Acceptance criteria**:
- Non-logged-in users see marketing page ✅
- CTAs link to /signup, /pricing, /contact ✅
- Mobile responsive ✅
- Bilingual toggle works ✅

---

## 3. SECURITY RULES — MANDATORY

### 🔴 NEVER do these

```tsx
// ❌ ALWAYS forbidden — leaks DB internals
toast.error(error.message)
toast.error(error.message || 'fallback')
toast.error(err.message || 'Something went wrong')

// ❌ FORBIDDEN RLS pattern
CREATE POLICY "..." ON my_table FOR DELETE TO authenticated USING (true);
CREATE POLICY "..." ON my_table FOR UPDATE TO authenticated USING (true);

// ❌ FORBIDDEN redirect without validation
window.location.href = data.redirect_url  // must validate domain first

// ❌ FORBIDDEN TypeScript
const data: any = ...  // use proper types
```

### ✅ ALWAYS do these

```tsx
// ✅ Safe bilingual error messages
toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')

// ✅ Always destructure Supabase calls
const { data, error } = await supabase.from('table').select()
if (error) { toast.error(language === 'en' ? '...' : '...'); return }

// ✅ Auth from store
const { user } = useAuthStore()

// ✅ Language from store
const { language } = useLanguageStore()
```

---

## 4. COMMIT CONVENTION

```
feat: BATCH17 - [list changes]

BATCH17-T1: SEO meta tags + sitemap
BATCH17-T2: Agency job dispatch modal
...
Build: 0 TS errors
```

---

## 5. DEPLOY CHECKLIST

Before pushing to Heroku:
- [ ] `cd d:\Github\Truck_Opti\frontend && npm run build` → 0 TS errors
- [ ] No `toast.error(error.message` or `toast.error(err.message` in new code
- [ ] Every new Supabase table has RLS enabled + correct policies
- [ ] `git push heroku main` → watch for successful deploy

---

## 6. WHAT'S LEFT TO LAUNCH (FULL PICTURE)

| Category | Status |
|----------|--------|
| Core frontend (packing, routing, tracking) | ✅ Complete |
| Auth (email OTP, Google OAuth) | ✅ Complete |
| Agency portal (dashboard, fleet, jobs, billing, rates) | ✅ Complete |
| Driver portal (dashboard, trip, earnings, history) | ✅ Complete |
| Admin portal (dashboard, drivers, agencies, payouts, contacts) | ✅ Complete |
| Payment (Razorpay webhook, subscription) | ✅ Code complete — needs live keys |
| RLS security (all 6 known bugs) | ✅ Fixed in migrations — **needs `supabase db push`** |
| SEO / meta tags | ❌ Missing — BATCH17-T1 |
| Agency dispatch | ❌ Missing — BATCH17-T2 |
| Driver live GPS | ❌ Missing — BATCH17-T3 |
| Contact page | ✅ Complete (BATCH16) |
| SMS OTP | ✅ Code — needs Twilio credentials |
| Razorpay live keys | ⚠️ Needs human action |

**Estimated remaining work**: 2-3 more BATCH cycles (BATCH17, BATCH18) to reach full production-ready state.

---

*BATCH17 prompt created by SONNET-005 | 2026-03-09 | v53*
