# TruckOpti — BATCH 10 Agent Continuation Prompt

> **Use this file as-is as your starting prompt.**
> Repo: `d:/Github/Truck_Opti`
> Production: `https://www.truckopti.in` (Heroku `truck-opti-app`, latest: v43 + judge hotfixes)
> Supabase project: `jbxncejtcbpcronndqlx.supabase.co`
> Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand (authStore) + React Router v6

---

## ⚠️ MANDATORY FIRST STEPS

1. Read `0.dev-matrix/STATE.md` — register yourself in the ACTIVE AGENTS table.
2. Read `0.dev-matrix/TESTING_PRINCIPLES.md` — never mark done without verifying the actual user flow.
3. After deploy, post a message in STATE.md → **## 📝 AGENT MESSAGES** (newest at top).
4. Update `0.dev-matrix/ROADMAP.md` after completing each task.

---

## 🏆 CURRENT STATUS (post v43)

All 3 portals are functionally complete for end-to-end use:
- **Customer**: books truck → sees pending status + "Searching for drivers…" → sees OTP when driver assigned
- **Driver**: receives job offer (Realtime, 30s countdown) → accepts → 7-step trip flow → photos → OTP verify
- **Agency**: sees incoming jobs → accepts → assigns available driver → driver sees job offer on dashboard

**Remaining**: secondary UX improvements, agency map tracking, and Phase 4/5 features.

---

## 🎯 TASK LIST

---

### TASK 1 — Agency: Track Active Job on Map (P1)

**File:** `frontend/src/pages/AgencyJobsPage.tsx`

The "Track Live" button currently shows a toast: `toast('Track job flow coming soon', { icon: 'ℹ️' })`.

Replace it with a real map modal showing the driver's current location for `status === 'active'` jobs.

#### Implementation

When the "Track Live" button is tapped:
1. Fetch `driver_locations` for the job's `driver_id`:
```typescript
const { data: loc } = await supabase
  .from('driver_locations')
  .select('latitude, longitude, updated_at, speed_kmh')
  .eq('driver_id', job.driver_id)
  .order('updated_at', { ascending: false })
  .limit(1)
  .maybeSingle()
```

2. Open a bottom-sheet modal showing:
   - Route: `job.origin → job.destination`
   - Driver name (stored on the job card — fetch from `drivers` if needed)
   - Last known location timestamp (`loc.updated_at`)
   - Speed if available
   - An embedded `MapViewWrapper` with a single truck marker at `[loc.latitude, loc.longitude]`

3. If no location found: show "Driver hasn't started sharing location yet" message.

4. Subscribe to real-time updates inside the modal:
```typescript
const channel = supabase.channel(`driver-loc-${job.driver_id}`)
  .on('postgres_changes', {
    event: '*', schema: 'public', table: 'driver_locations',
    filter: `driver_id=eq.${job.driver_id}`
  }, (payload) => {
    // update marker position
  })
  .subscribe()
// cleanup on modal close
```

**Import `MapViewWrapper` from `'../components/MapViewWrapper'`** — already used in TrackingPage.

---

### TASK 2 — Driver: Show Assigned Driver Name on Agency Jobs Card (P1)

**File:** `frontend/src/pages/AgencyJobsPage.tsx`

When `job.status === 'accepted'` and `job.driver_id` is set, we show "Driver assigned" but not the driver's name.

The `AgencyJob` interface currently only stores `driver_id`, not `driver_name`. Fix:

1. In the `fetchAgency()` Supabase query, add a join to get driver name:
```typescript
// In the agency_jobs select, add:
drivers!agency_jobs_driver_id_fkey (
  id, full_name, phone
)
```

2. In the mapped object, add:
```typescript
driver_name: (j.driver_info as { full_name?: string } | null)?.full_name ?? undefined,
driver_phone: (j.driver_info as { phone?: string } | null)?.phone ?? undefined,
```
(where `driver_info` is the aliased `drivers` join result)

3. Update the "Driver assigned" UI to show the name:
```tsx
{job.status === 'accepted' && job.driver_id && (
  <div className="mt-3 p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg text-xs flex items-center gap-2">
    <UserCheck size={14} className="text-indigo-600 dark:text-indigo-400" />
    <span className="text-indigo-600 dark:text-indigo-400">
      Assigned: {job.driver_name || 'Driver assigned'}
    </span>
  </div>
)}
```

Import `UserCheck` from `lucide-react`.

---

### TASK 3 — Customer: "Book Another Truck" Quick Action on Delivered Shipments (P2)

**File:** `frontend/src/pages/TrackingPage.tsx`

Currently after a shipment is delivered the detail view is minimal. Add a subtle call-to-action:

In the shipment detail modal, when `selectedShipment.status === 'delivered'`, below the route info block, add:
```tsx
<button
  onClick={() => { setShowDetailModal(false); navigate('/booking/new') }}
  className="w-full py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
>
  <Truck className="w-4 h-4" />
  {language === 'en' ? 'Book Another Truck' : 'एक और ट्रक बुक करें'}
</button>
```

---

### TASK 4 — Agency: Show Billing Summary on Dashboard (P2)

**File:** `frontend/src/pages/AgencyDashboardPage.tsx`

The agency dashboard currently shows generic quick actions. Add a real-time earnings summary card above quick actions:

```typescript
// Fetch last 30 days earnings from agency_jobs
const { data } = await supabase
  .from('agency_jobs')
  .select('fare, status, created_at')
  .eq('agency_id', agencyId)
  .eq('status', 'completed')
  .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
```

Show as a card:
```
┌─────────────────────────────────────┐
│  📊 Last 30 Days                    │
│  ₹ XX,XXX  total earnings           │
│  N jobs completed                   │
└─────────────────────────────────────┘
```

---

### TASK 5 — DriverTripPage: Verify Photo Upload Uses Correct Storage Path (P1)

**File:** `frontend/src/pages/DriverTripPage.tsx`

The `trip-photos` bucket now exists (created by judge in v43-judge). Verify the upload path matches the bucket policies.

Check that the photo upload code uses a path like:
```typescript
const fileName = `${driverId}/${jobOfferId}/${stepName}_${Date.now()}.jpg`
const { data, error } = await supabase.storage
  .from('trip-photos')
  .upload(fileName, file, { upsert: true })
```

Common failure modes to check:
1. If `fileName` starts with `/` it will fail — paths must NOT start with `/`
2. If the bucket name is wrong (e.g. `trip_photos` vs `trip-photos`) it will silently fail
3. After upload, `supabase.storage.from('trip-photos').getPublicUrl(fileName)` returns the URL — verify this is saved to `job_offers.photo_loading_url` or `photo_delivery_url`

If any of these are wrong, fix them.

---

## 📁 KEY FILES

```
frontend/src/pages/
  AgencyJobsPage.tsx          ← Tasks 1 + 2 (live tracking modal, driver name on card)
  TrackingPage.tsx            ← Task 3 (Book Another Truck CTA)
  AgencyDashboardPage.tsx     ← Task 4 (billing summary card)
  DriverTripPage.tsx          ← Task 5 (photo upload path verification)

frontend/src/components/
  MapViewWrapper.tsx          ← Already used in TrackingPage; import for Task 1
```

---

## 🗄️ DB REFERENCE

```sql
-- Tables used in this batch:
driver_locations  — driver_id, latitude, longitude, updated_at, speed_kmh, heading
agency_jobs       — id, agency_id, shipment_id, driver_id, truck_id, status, fare
drivers           — id, user_id, full_name, phone, rating
job_offers        — id, shipment_id, driver_id, status, pickup_otp, photo_loading_url, photo_delivery_url

-- Storage (now exists):
storage.buckets   — trip-photos (public=true) ← confirmed created v43-judge
storage.objects   — trip-photos/{driver_id}/{job_offer_id}/{step}_{timestamp}.jpg
```

---

## 🚀 DEPLOYMENT

```powershell
# Build first
cd d:\Github\Truck_Opti\frontend; npm run build

# Commit & deploy
cd d:\Github\Truck_Opti
git add -A
git commit -m "feat(agency): live job tracking map; show assigned driver name"
git push heroku main
git push origin main
```

---

## ✅ DEFINITION OF DONE FOR BATCH 10

1. Agency can tap "Track Live" on an active job and see driver's real-time location on a map
2. Accepted jobs show the assigned driver's name (not just "Driver assigned")
3. Delivered shipments show "Book Another Truck" CTA in detail modal
4. Agency dashboard shows 30-day earnings summary
5. DriverTripPage photo upload confirmed to use correct bucket name + path format

---

## 🔮 AFTER BATCH 10 — REMAINING WORK

| Feature | Priority | Effort | Notes |
|---|---|---|---|
| Razorpay live keys | P0 | Config only | Owner must set `VITE_RAZORPAY_KEY_ID` on Heroku |
| Twilio phone OTP | P0 | Config only | Owner must configure in Supabase Auth dashboard |
| Driver wallet + UPI withdrawal | P2 | High | Needs payment integration first |
| GST invoice generation | P2 | Medium | Agency → customer, GSTIN + SAC 996511 |
| E-way bill NIC API | P3 | High | Required for shipments > ₹50K |
| FCM push notifications | P2 | High | Job offers when driver app is backgrounded |
| Proximity-based dispatch | P3 | Medium | Score by drive distance, not just city |
| ERP REST API | P3 | High | `/api/v1/*` with API key auth |
