# TruckOpti — BATCH 8 Agent Continuation Prompt

> **Use this file as-is as your starting prompt.**
> Project: TruckOpti — SaaS logistics marketplace for India
> Repo: `d:/Github/Truck_Opti`
> Production: `https://www.truckopti.in` (Heroku `truck-opti-app`, latest slug: v41, commit `cbd35bae`)
> Supabase project: `jbxncejtcbpcronndqlx.supabase.co`
> Framework: React 18 + TypeScript + Vite + Tailwind CSS + Supabase + Zustand
> Available tools: Supabase MCP (`mcp_supabase_*`), file tools, terminal

---

## ⚠️ MANDATORY FIRST STEPS

1. Read `0.dev-matrix/STATE.md` — agent registry and latest deployment messages.
2. Read `0.dev-matrix/ROADMAP.md` — current phase status.
3. Read `0.dev-matrix/TESTING_PRINCIPLES.md` — never mark a task done without end-to-end proof.
4. Register yourself in `STATE.md` → **## 🤖 ACTIVE AGENTS** table.
5. After each deployment, leave a message in **## 📝 AGENT MESSAGES** in STATE.md (newest at top).

---

## 🔴 CRITICAL CONTEXT — WHY THE APP IS NOT READY

All three portals (Customer, Driver, Agency) are fully built and deployed (v41). However, **the app cannot be used by real users** because **there is no booking flow**:

```
Customer wants truck → ??? → Driver/Agency gets notified → Trip happens → Customer pays
                       ^^^
                 THIS DOES NOT EXIST
```

Specifically:
- The `dispatch_job_to_drivers(shipment_id, vehicle_type)` PostgreSQL function exists in Supabase but **nothing calls it**.
- Customers have no UI to create a new shipment/booking.
- Drivers will never receive job offers.
- Agencies will always see an empty jobs list.

**This is the single most important thing to build.** Everything else is secondary.

---

## 🎯 TASK LIST (in priority order)

---

### TASK 1 — BOOKING FLOW (P0, Critical) ✋ START HERE

**Goal:** A logged-in customer can book a truck, which triggers job dispatch.

#### 1a. New Shipment / Booking Page

Create `frontend/src/pages/NewShipmentPage.tsx` (or a modal component) at `/booking/new`.

Form fields:
- `origin_city` (text input, required)
- `destination_city` (text input, required)
- `vehicle_type` (select: tata_407, eicher_14ft, eicher_17ft, ashok_19ft, bharatbenz_24ft, bharatbenz_32ft)
- `weight_kg` (number, required)
- `pickup_date` (date, required)
- `goods_description` (text, optional)
- `estimated_value` (number, optional — for e-way bill threshold)

On submit:
1. Insert into `shipments` table:
   ```typescript
   supabase.from('shipments').insert({
     customer_id: user.id,
     origin: formData.origin_city,
     destination: formData.destination_city,
     status: 'pending',
     total_weight: formData.weight_kg,
     // vehicle_type, pickup_date, goods_description, estimated_value
   })
   ```
2. Call `dispatch_job_to_drivers`:
   ```typescript
   supabase.rpc('dispatch_job_to_drivers', {
     p_shipment_id: newShipmentId,
     p_vehicle_type: formData.vehicle_type
   })
   ```
3. Show success toast: "Booking created! Searching for drivers…"
4. Navigate to `/tracking` so they can watch the shipment.

**Before calling `dispatch_job_to_drivers`**, verify the `shipments` table has the columns needed. Use `mcp_supabase_list_tables` and `mcp_supabase_execute_sql` to check. Add any missing columns via `mcp_supabase_apply_migration`.

The `shipments` table likely has: `id, shipment_id (text), customer_id, origin, destination, status, latitude, longitude, driver_name, driver_phone, vehicle_number, updated_at`. May be missing: `vehicle_type, weight_kg, pickup_date, goods_description`.

#### 1b. Add "Book a Truck" entry point

In `frontend/src/pages/Dashboard.tsx` (customer home), add a prominent button:
```
Book a Truck →  /booking/new
```
Also add a quick-action card in the Dashboard grid.

#### 1c. Add route in App.tsx

```typescript
const NewShipmentPage = lazy(() => import('./pages/NewShipmentPage'))
// Inside MobileLayout routes:
<Route path="/booking/new" element={<NewShipmentPage />} />
```

#### 1d. Rate discovery (optional but useful for UX)

Before the booking form, show a "See rates" section that queries:
```typescript
supabase.from('agency_rate_cards')
  .select('*, transport_agencies(company_name)')
  .eq('is_active', true)
  .eq('origin_city', formData.origin_city)
  .eq('dest_city', formData.destination_city)
```
Display as a simple list so the customer can see pricing before confirming.

---

### TASK 2 — AGENCY: ASSIGN DRIVER TO JOB (P1)

**File:** `frontend/src/pages/AgencyJobsPage.tsx`

On an accepted job (`status = 'accepted'`), add an "Assign Driver" button that opens a modal:
- Lists the agency's drivers from `agency_trucks` where `driver_id IS NOT NULL`
- On select: `supabase.from('agency_jobs').update({ driver_id: selectedDriverId }).eq('id', jobId)`
- Also update `agency_trucks.is_available = false` for that truck
- Also update `drivers.active_job_id = shipment_id` for that driver

After assigning, the driver will see the job on their dashboard (as an active job offer or direct assignment — your choice, consistent with existing `job_offers` flow).

---

### TASK 3 — SUPABASE STORAGE: trip-photos BUCKET (P1)

The photo upload in `DriverTripPage.tsx` uploads to a bucket called `trip-photos`. This bucket may not exist. Create it via Supabase MCP:

```typescript
// Use mcp_supabase_execute_sql to verify first:
// SELECT * FROM storage.buckets WHERE id = 'trip-photos';
// If missing, create via Supabase Dashboard or MCP storage API.
```

If the MCP doesn't support storage bucket creation directly, add a fallback in `DriverTripPage.tsx` so that if the upload fails, the trip can still proceed (photo is optional). The current code should already handle this — verify it does.

---

### TASK 4 — FIX: AGENCY BILLING PAGE accessible from nav (P1)

In v41, the Agency bottom nav was changed to: Home, Fleet, Drivers, Jobs, Rates.
**Billing was removed from the nav.** The page still exists at `/agency/billing` but there is no way to reach it.

Fix: Add a "Billing" link somewhere accessible — either:
- As a sixth item in the nav (may be too crowded), OR
- As a quick-action on the Agency Dashboard (preferred): add a "Billing →" card next to existing KPI cards on `AgencyDashboardPage.tsx`

---

### TASK 5 — PWA ICONS (P1)

**File:** `frontend/public/`

The PWA install prompt fails because icons referenced in `frontend/public/manifest.webmanifest` are missing.

Check what icons are referenced:
```powershell
cat frontend/public/manifest.webmanifest
```

Create missing icons. The minimum needed:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `apple-touch-icon.png` (180×180)

Use a simple truck/logistics icon. You can create placeholder PNG files programmatically with a script, or use an online tool. The logo is an indigo (#4f46e5) truck. Even a solid-color PNG with a letter "T" is better than a broken install prompt.

---

### TASK 6 — BUG-007: RAZORPAY LIVE KEYS (P0, Config — requires owner action)

The current Razorpay key (`rzp_test_1DP5mmOlF5G5ag`) is a test key. Real payments will fail with test keys in production.

**This is a config task, not a code task.** The owner (Prakash) must:
1. Log in to Razorpay dashboard → Settings → API Keys → Generate Live Keys
2. Set Heroku env var: `heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXXXX`
3. Update Supabase Edge Function secrets with the live secret key for server-side verification

Document the required env vars here so the owner knows what to set:
- `VITE_RAZORPAY_KEY_ID` — public key (safe in frontend)
- `RAZORPAY_KEY_SECRET` — private key (Supabase Edge Function only, never frontend)

---

### TASK 7 — BUG-008: PHONE OTP (P0, Config — requires owner action)

Phone OTP silently fails because Twilio is not configured in Supabase.

**This is a config task.** The owner must:
1. Supabase Dashboard → Authentication → Providers → Phone → Enable
2. Select Twilio as provider
3. Enter Account SID, Auth Token, and Messaging Service SID from Twilio

**Code fix needed:** In the login UI, show a clear error message when phone OTP fails instead of silent failure. Find where phone OTP is sent in `frontend/src/pages/` (likely `LoginPage.tsx`) and add an error toast for non-200 responses.

---

## 📁 KEY FILES REFERENCE

```
frontend/src/
  App.tsx                          — All routes (lazy imports)
  stores/authStore.ts              — Zustand auth (user, role, initialize)
  lib/supabase.ts                  — Supabase client
  utils/formatters.ts              — formatCurrency, formatDistance, etc.
  pages/
    Dashboard.tsx                  — Customer home (add "Book a Truck" here)
    TrackingPage.tsx               — Live shipment tracking (Realtime)
    NewShipmentPage.tsx            — ← CREATE THIS (Task 1)
    DriverDashboardPage.tsx        — Driver home (job offers via Realtime)
    DriverTripPage.tsx             — 7-step trip flow
    AgencyDashboardPage.tsx        — Agency KPI cards
    AgencyFleetPage.tsx            — Fleet management
    AgencyDriversPage.tsx          — Driver management (v41, NEW)
    AgencyJobsPage.tsx             — Job list + accept/decline (add assign here)
    AgencyBillingPage.tsx          — Revenue + GST summary
    AgencyRatesPage.tsx            — Rate card management (v41, NEW)
  layouts/
    MobileLayout.tsx               — Customer portal shell
    DriverLayout.tsx               — Driver portal shell
    AgencyLayout.tsx               — Agency portal shell (5-item bottom nav)
```

---

## 🗄️ DATABASE REFERENCE (key tables)

```sql
-- Core booking tables
shipments           — id, customer_id, origin, destination, status, lat/lng, driver_name, etc.
job_offers          — id, shipment_id, driver_id, status, pickup_otp, delivery_otp, photo URLs
driver_locations    — id, driver_id, lat, lng, updated_at (triggers sync to shipments)

-- Driver tables
drivers             — id, user_id, full_name, phone, is_online, is_approved, active_job_id,
                      total_trips, rating, vehicle_type, rc_number, bank details

-- Agency tables
transport_agencies  — id, user_id, company_name, gstin, is_approved, fleet_size
agency_trucks       — id, agency_id, vehicle_type, rc_number, driver_id, is_available
agency_jobs         — id, agency_id, shipment_id, driver_id, truck_id, status, fare
agency_rate_cards   — id, agency_id, vehicle_type, origin_city, dest_city, rate_per_km, flat_rate

-- DB Function (call with supabase.rpc):
dispatch_job_to_drivers(p_shipment_id UUID, p_vehicle_type TEXT) → INTEGER
  Finds top-3 online+approved+available drivers, inserts job_offers, returns count inserted.
```

---

## 🚀 DEPLOYMENT PROCESS

```powershell
# 1. Build locally first
cd d:\Github\Truck_Opti\frontend; npm run build

# 2. Commit and deploy
cd d:\Github\Truck_Opti
git add -A
git commit -m "feat(booking): add new shipment page and booking flow"
git push heroku main
git push origin main
```

Heroku auto-builds the frontend via `heroku-postbuild` in `package.json`. Deploy takes ~2 minutes.

---

## ✅ DEFINITION OF DONE FOR BATCH 8

The batch is complete when a user can:
1. **Log in** as a customer, tap "Book a Truck", fill in origin/destination/weight/vehicle, submit → shipment created and dispatched to drivers.
2. **Log in** as a driver, go online, receive the job offer card (Realtime), accept it, start the trip, complete it with photos.
3. **Log in** as an agency, see the job in their jobs list, accept it, assign a driver to it.

This closes the core transaction loop. Everything else (payments, GST invoicing, e-way bill) is Phase 4 and can follow.

---

## 🧪 VALIDATION AFTER EACH TASK

After implementing Task 1 (booking flow):
```powershell
# Build check
cd d:\Github\Truck_Opti\frontend; npm run build

# Functional test — verify:
# 1. Create a shipment via the new booking page (use a test account)
# 2. Confirm the row appears in Supabase shipments table
# 3. Confirm dispatch_job_to_drivers() inserted rows in job_offers
# 4. Log in as a driver → confirm job offer appears on dashboard
```

Use `mcp_supabase_execute_sql` to inspect DB state:
```sql
-- Check shipment was created
SELECT id, origin, destination, status, customer_id FROM shipments ORDER BY created_at DESC LIMIT 5;

-- Check job offers were dispatched
SELECT jo.id, jo.status, d.full_name, d.is_online FROM job_offers jo
JOIN drivers d ON d.id = jo.driver_id
WHERE jo.shipment_id = '<new-shipment-id>';
```

---

## 📊 CURRENT READINESS SCORECARD

| User | Signup/Login | Core Feature | Can use today? |
|---|---|---|---|
| Customer | ✅ | ❌ No booking flow | **NO** |
| Driver | ✅ | ❌ No jobs dispatched | **NO** |
| Agency | ✅ | ❌ No jobs arriving | **NO** |

After BATCH 8 Task 1 is done:

| User | Can use today? |
|---|---|
| Customer | ✅ YES (can book) |
| Driver | ✅ YES (receives jobs) |
| Agency | ⚠️ PARTIAL (needs Task 2 to assign driver) |
