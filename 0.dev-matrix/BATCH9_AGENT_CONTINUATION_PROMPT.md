# TruckOpti — BATCH 9 Agent Continuation Prompt

> **Use this file as-is as your starting prompt.**
> Repo: `d:/Github/Truck_Opti`
> Production: `https://www.truckopti.in` (Heroku `truck-opti-app`, latest: v42, commit `cbd35bae` + booking page)
> Supabase project: `jbxncejtcbpcronndqlx.supabase.co`
> Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand (authStore) + React Router v6

---

## ⚠️ MANDATORY FIRST STEPS

1. Read `0.dev-matrix/STATE.md` — register yourself in the ACTIVE AGENTS table.
2. Read `0.dev-matrix/TESTING_PRINCIPLES.md` — never mark done without verifying the actual user flow.
3. After deploy, post a message in STATE.md → **## 📝 AGENT MESSAGES** (newest at top).
4. Update `0.dev-matrix/ROADMAP.md` after completing each task.

---

## 🏆 CURRENT STATUS

The core transaction loop is **now functional** as of v42:
- Customer books truck via `/booking/new` → shipment inserted → `dispatch_job_to_drivers()` called
- Driver receives Realtime job offer → accepts → full 7-step trip flow → complete with photos
- Agency sees jobs in `/agency/jobs` → can accept/decline

**What's left:** polishing the agency workflow, fixing 2 bugs in AgencyJobsPage, creating the Storage bucket, and PWA icons.

---

## 🎯 TASK LIST (all remaining work, in priority order)

---

### TASK 1 — FIX AgencyJobsPage bugs (P1)

**File:** `frontend/src/pages/AgencyJobsPage.tsx`

#### Bug A: vehicle_type shows '—'
The shipments join in `fetchAgency()` does not fetch `vehicle_type`. The column now exists (added in v42 migration). Fix the Supabase query:

```typescript
// Current (wrong — vehicle_type missing):
shipments (
  shipment_id,
  origin,
  destination,
  total_weight,
  estimated_cost
)

// Fix — add vehicle_type:
shipments (
  shipment_id,
  origin,
  destination,
  total_weight,
  estimated_cost,
  vehicle_type
)
```

Then in the mapped object, replace `vehicle_type: '—'` with:
```typescript
vehicle_type: s?.vehicle_type as string ?? '—',
```

#### Bug B: 'accepted' status has no badge label
`STATUS_CONFIG` only has: `pending, active, completed, cancelled`.
When an agency accepts a job, the DB is updated to `status: 'accepted'` but no badge renders.

Fix — add 'accepted' to STATUS_CONFIG:
```typescript
accepted:  { label: 'Accepted', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
```

Also add `'accepted'` as a filter tab option alongside the existing ones, OR map it to show under the 'active' filter tab. Choose whichever is cleaner.

---

### TASK 2 — Agency: Assign Driver to Job (P1)

**File:** `frontend/src/pages/AgencyJobsPage.tsx`

For jobs with `status === 'accepted'` that have no `driver_id` yet, add an **"Assign Driver"** button below the Accept/Decline buttons area.

#### DB query for driver list
```typescript
// Fetch agency's available drivers (trucks with a driver assigned, driver not already on a trip)
const { data: drivers } = await supabase
  .from('agency_trucks')
  .select(`
    id,
    vehicle_type,
    rc_number,
    drivers!agency_trucks_driver_id_fkey (
      id, full_name, phone, is_online, active_job_id, rating
    )
  `)
  .eq('agency_id', agencyId)
  .not('driver_id', 'is', null)
  .eq('is_available', true)
```

#### On assign:
```typescript
// 1. Update agency_jobs with selected driver
await supabase.from('agency_jobs')
  .update({ driver_id: selectedDriverId, truck_id: selectedTruckId })
  .eq('id', job.id)

// 2. Mark truck as not available
await supabase.from('agency_trucks')
  .update({ is_available: false })
  .eq('id', selectedTruckId)

// 3. Insert/upsert job_offer so driver sees it on DriverDashboard
// Check if a job_offer already exists for this shipment+driver first
const { data: existing } = await supabase
  .from('job_offers')
  .select('id')
  .eq('shipment_id', job.shipment_id)
  .eq('driver_id', selectedDriverId)
  .maybeSingle()

if (!existing) {
  await supabase.from('job_offers').insert({
    shipment_id: job.shipment_id,
    driver_id: selectedDriverId,
    status: 'pending',  // driver will see offer on dashboard
  })
}
```

#### UI pattern:
- Show "Assign Driver" button on accepted jobs (same card, below accept/decline area)
- Opens a modal/sheet with `<select>` listing available drivers (name + vehicle type)
- On confirm: call the above sequence, toast success, re-fetch jobs

---

### TASK 3 — Create trip-photos Supabase Storage Bucket (P1)

The `DriverTripPage.tsx` uploads photos to a bucket named `trip-photos`. This bucket may not exist, causing silent upload failures.

**Check first:**
```sql
-- Run via mcp_supabase_execute_sql:
SELECT id, public FROM storage.buckets WHERE id = 'trip-photos';
```

If the result is empty, create the bucket. Use `mcp_supabase_execute_sql` with:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('trip-photos', 'trip-photos', true)
ON CONFLICT (id) DO NOTHING;
```

Then add a storage policy so authenticated users can upload:
```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Drivers can upload trip photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'trip-photos');

CREATE POLICY "Trip photos are publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'trip-photos');
```

Apply via `mcp_supabase_apply_migration` with name `create_trip_photos_bucket`.

---

### TASK 4 — PWA Icons (P1)

**Location:** `frontend/public/`

The PWA install prompt fails because icon files referenced in `manifest.webmanifest` are missing.

First check what icons are declared:
```powershell
cat frontend/public/manifest.webmanifest
```

You need to create the missing PNG files. Since you can't generate binary images directly, use this approach:

Create a Node script at `scripts/generate-icons.mjs`:
```javascript
import { createCanvas } from 'canvas';
import { writeFileSync } from 'fs';

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  // Background
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(0, 0, size, size);
  // Letter T
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.floor(size * 0.6)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('T', size / 2, size / 2);
  return canvas.toBuffer('image/png');
}

writeFileSync('frontend/public/icon-192.png', createIcon(192));
writeFileSync('frontend/public/icon-512.png', createIcon(512));
writeFileSync('frontend/public/apple-touch-icon.png', createIcon(180));
console.log('Icons created');
```

Install canvas if needed: `npm install canvas --save-dev` in root package.json, then `node scripts/generate-icons.mjs`.

**Alternative if canvas won't install:** Create minimal 1x1 transparent PNG files using base64 — just enough to stop the manifest error:
```powershell
# PowerShell one-liner to write a minimal valid 192x192 PNG
# (copy the smallest valid PNG you can find or use a placeholder)
```

If neither works, check if there are any existing icon files anywhere in the repo:
```powershell
Get-ChildItem -Recurse -Include "*.png","*.ico" frontend/public/ | Select-Object FullName
```

---

### TASK 5 — Show Booking Status on Customer Tracking Page (P1)

**File:** `frontend/src/pages/TrackingPage.tsx`

Currently the tracking page shows all non-cancelled shipments. For a customer who just booked, their new `pending` shipment appears in the list but shows no driver info (since no driver has accepted yet).

Improve the UX for pending shipments:
- If `status === 'pending'` and `latitude === null`: show a "Searching for drivers…" card with an animated spinner instead of a blank map marker
- If `status === 'pending'` and dispatch returned 0 drivers: show "No drivers available right now. We'll keep searching."
- The map should not show a marker for pending shipments (they have no location yet)

The `fetchActiveShipments` function already fetches pending shipments. Just update the JSX rendering logic to differentiate `pending` from `in_transit`.

---

### TASK 6 — Customer: View Pickup OTP (P1)

When a booking is created and a driver accepts, an OTP is auto-generated in `job_offers.pickup_otp` (4-digit). The customer needs to show this OTP to the driver when they arrive.

**Currently:** There is no way for the customer to see their OTP.

**Fix:** In the TrackingPage shipment detail modal (where it shows driver name, vehicle, route), add a section:

```typescript
// Fetch OTP for this shipment from job_offers
const { data: offer } = await supabase
  .from('job_offers')
  .select('pickup_otp, delivery_otp, status')
  .eq('shipment_id', shipment.id)
  .in('status', ['pending', 'accepted', 'pickup_arrived', 'in_transit', 'delivery_arrived'])
  .maybeSingle()
```

Show the `pickup_otp` in a large, prominent box:
```
┌─────────────────────────────┐
│  📋 Pickup OTP              │
│  ┌───────────────────────┐  │
│  │        4823           │  │  ← large font, easy to read
│  └───────────────────────┘  │
│  Share this with the driver │
│  when they arrive.          │
└─────────────────────────────┘
```

Only show if there's an active/accepted job offer for this shipment.

---

## 📁 KEY FILES

```
frontend/src/pages/
  AgencyJobsPage.tsx          ← Tasks 1 + 2 (bugs + assign driver)
  TrackingPage.tsx            ← Tasks 5 + 6 (pending status + OTP)
  AgencyDashboardPage.tsx     ← Has Billing quick-action (already works)

frontend/public/
  manifest.webmanifest        ← Check icon paths
  icon-192.png                ← Missing (Task 4)
  icon-512.png                ← Missing (Task 4)

scripts/
  generate-icons.mjs          ← Create (Task 4)
```

---

## 🗄️ DB REFERENCE

```sql
-- Tables used in this batch:
agency_jobs   — id, agency_id, shipment_id, driver_id, truck_id, status, assigned_at, fare
agency_trucks — id, agency_id, vehicle_type, rc_number, driver_id (FK→drivers), is_available
drivers       — id, user_id, full_name, phone, is_online, active_job_id, rating
job_offers    — id, shipment_id, driver_id, status, pickup_otp, delivery_otp, photo_loading_url, photo_delivery_url
shipments     — id, customer_id, origin, destination, status, vehicle_type, total_weight, pickup_date

-- Storage:
storage.buckets  — trip-photos (may not exist yet — Task 3)
storage.objects  — trip-photos/{driver_id}/{job_id}/photo_loading_url.{ext}
```

---

## 🚀 DEPLOYMENT

```powershell
# Build first
cd d:\Github\Truck_Opti\frontend; npm run build

# Commit & deploy
cd d:\Github\Truck_Opti
git add -A
git commit -m "feat(agency): assign driver to job, fix vehicle_type display"
git push heroku main
git push origin main
```

---

## ✅ DEFINITION OF DONE FOR BATCH 9

1. AgencyJobsPage shows correct vehicle_type and 'Accepted' status badge — no more '—'
2. Agency can assign one of their drivers to an accepted job; driver sees it on their dashboard
3. `trip-photos` bucket confirmed to exist in Supabase (verified by SQL query)
4. PWA icons exist in `frontend/public/` — install prompt no longer shows broken icon
5. Pending shipments show "Searching for drivers…" UI instead of blank tracking card
6. Customer can see their pickup OTP in the shipment detail modal

---

## 🔮 AFTER BATCH 9 — WHAT REMAINS

| Feature | Priority | Effort |
|---|---|---|
| Razorpay live keys | P0 | Config (owner) |
| Twilio phone OTP | P0 | Config (owner) |
| FCM push notifications (job offers when app is backgrounded) | P1 | High |
| Driver wallet + UPI withdrawal | P2 | High |
| GST invoice generation (agency → customer) | P2 | Medium |
| E-way bill NIC API | P3 | High |
| GSTR-1 export | P3 | Medium |
| Biometric login (WebAuthn) | P3 | Medium |
