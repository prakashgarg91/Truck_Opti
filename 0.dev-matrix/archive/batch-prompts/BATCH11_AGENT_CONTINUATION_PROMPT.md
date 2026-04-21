# TruckOpti — BATCH 11 Agent Continuation Prompt

> **Use this file as-is as your starting prompt.**
> Repo: `d:/Github/Truck_Opti`
> Production: `https://www.truckopti.in` (Heroku `truck-opti-app`, latest: **v47**)
> Supabase project: `jbxncejtcbpcronndqlx.supabase.co`
> Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand (authStore) + React Router v6

---

## ⚠️ MANDATORY FIRST STEPS

1. Read `0.dev-matrix/STATE.md` — register yourself in the ACTIVE AGENTS table.
2. Read `0.dev-matrix/TESTING_PRINCIPLES.md` — never mark done without verifying the actual user flow.
3. After deploy, post a message in STATE.md → **## 📝 AGENT MESSAGES** (newest at top).
4. Update `0.dev-matrix/ROADMAP.md` after completing each task.

---

## 🏆 CURRENT STATUS (post v47)

All 3 portals are fully functional end-to-end:

| Portal | Status | Notes |
|--------|--------|-------|
| **Customer** | ✅ Ready | Book truck → track in real-time → OTP → "Book Another Truck" CTA on delivered |
| **Driver** | ✅ Ready | Realtime job offer (30s) → accept → 7-step trip (GPS, OTPs, photos, earnings) |
| **Agency** | ✅ Ready | Accept job → assign driver → track driver live on map → 30-day earnings summary |

**What's left**: Phase 4 (payments go-live), driver wallet UI, agency billing/invoicing, and P2 polish items.

---

## 🎯 TASK LIST

---

### TASK 1 — Razorpay: Switch to Live Production Keys (P0 — BLOCKING PAYMENTS)

The app currently runs with Razorpay **test** keys. No real payments can be collected until this is done.

**How to do it:**
1. Log in to Razorpay dashboard → Settings → API Keys → Generate Live Key
2. Set the live key in Heroku config:
   ```
   heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXXXX --app truck-opti-app
   ```
   *(Or update `frontend/.env.production` and redeploy)*
3. Add the live **key secret** to Supabase edge function secrets (for order verification):
   ```
   supabase secrets set RAZORPAY_KEY_SECRET=your_live_secret
   ```
4. Verify in production: open `/pricing` → tap a plan → complete a ₹1 test transaction.

> ⚠️ **Do NOT hardcode secrets in source files.** Use Heroku config vars + Supabase secrets only.

---

### TASK 2 — Driver Wallet: Balance Display on Driver Dashboard (P1)

**File:** `frontend/src/pages/DriverDashboard.tsx` (or create `DriverWalletPage.tsx` if preferred)

Drivers earn via completed trips. Their earnings are stored in `driver_earnings` table (or `agency_jobs.fare`). Add a wallet card on the driver dashboard:

```
┌──────────────────────────────────────┐
│  💰 My Wallet                        │
│  ₹ 4,250  available balance          │
│  ₹12,750  total earned (all time)    │
│  [Request Withdrawal →]              │
└──────────────────────────────────────┘
```

**Implementation:**
1. Fetch from `driver_earnings` or sum `job_offers.fare` where `status='delivered'` and `driver_id=current`:
   ```typescript
   const { data } = await supabase
     .from('job_offers')
     .select('fare')
     .eq('driver_id', driverId)
     .eq('status', 'delivered')
   const totalEarned = data?.reduce((s, r) => s + (r.fare ?? 0), 0) ?? 0
   ```
2. "Request Withdrawal" button → show a toast: `'Withdrawal requests coming soon — contact support'` (placeholder until bank transfer is wired up in Phase 5).
3. Show last 5 completed trips as a mini ledger below the balance card.

**Schema note:** Check if `job_offers` has a `fare` column. If not, join through `agency_jobs` via `shipment_id`.

---

### TASK 3 — Agency Billing: Generate PDF Invoice for Completed Job (P2)

**File:** `frontend/src/pages/AgencyBillingPage.tsx`

Currently the billing page shows a table of jobs. Add a "Download Invoice" button per row that generates a simple PDF.

**Use `jsPDF` (already may be installed, check `package.json`):**
```typescript
import jsPDF from 'jspdf'

const generateInvoice = (job: AgencyJob) => {
  const doc = new jsPDF()
  doc.setFontSize(20)
  doc.text('TruckOpti Tax Invoice', 20, 30)
  doc.setFontSize(12)
  doc.text(`Invoice #: TRK-${job.id.slice(0, 8).toUpperCase()}`, 20, 50)
  doc.text(`Date: ${new Date(job.updated_at).toLocaleDateString('en-IN')}`, 20, 60)
  doc.text(`Route: ${job.origin} → ${job.destination}`, 20, 70)
  doc.text(`Fare: ₹${job.fare}`, 20, 80)
  doc.text(`GST (18%): ₹${(job.fare * 0.18).toFixed(2)}`, 20, 90)
  doc.text(`Total: ₹${(job.fare * 1.18).toFixed(2)}`, 20, 100)
  doc.save(`TruckOpti-Invoice-${job.id.slice(0, 8)}.pdf`)
}
```

If `jsPDF` is not installed: `npm install jspdf --prefix frontend`

Only add this button to jobs with `status === 'delivered'`.

---

### TASK 4 — Agency Jobs: Confirm Delivery Button (P1)

**File:** `frontend/src/pages/AgencyJobsPage.tsx`

When a job reaches `status = 'in_transit'` and the driver has completed delivery (driver marks `status = 'delivery_arrived'` in their trip flow), the agency should be able to confirm final delivery.

Currently there is **no way** for the agency to move a job from `in_transit` → `delivered`.

Add a "Confirm Delivery" button on `in_transit` job cards:
```tsx
{job.status === 'in_transit' && (
  <button
    onClick={() => confirmDelivery(job.id)}
    className="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
  >
    <CheckCircle2 size={14} /> Confirm Delivery
  </button>
)}
```

```typescript
const confirmDelivery = async (jobId: string) => {
  await supabase
    .from('agency_jobs')
    .update({ status: 'delivered', updated_at: new Date().toISOString() })
    .eq('id', jobId)
  fetchAgency() // refresh
  toast.success('Job marked as delivered')
}
```

---

### TASK 5 — Customer Notifications: In-App Notification Bell (P2)

**Files:** `frontend/src/components/MobileLayout.tsx`, `frontend/src/pages/NotificationsPage.tsx` (may exist)

Currently notifications are only shown via `react-hot-toast`. Add a persistent notification bell in the top bar of MobileLayout:

1. Show a red badge count on the bell icon when there are unread notifications.
2. Fetching from `notifications` table filtered by the logged-in `customer_id`.
3. Tapping the bell opens a slide-in drawer or navigates to `/notifications`.
4. Mark-as-read on tap.

**Check if `NotificationsPage.tsx` exists** — if yes, just add the bell to MobileLayout pointing at it. If not, create a simple list page.

---

## 📁 KEY FILES

```
frontend/src/pages/
  DriverDashboard.tsx          ← Task 2 (wallet balance card)
  AgencyBillingPage.tsx        ← Task 3 (PDF invoice download)
  AgencyJobsPage.tsx           ← Task 4 (confirm delivery button)
  NotificationsPage.tsx        ← Task 5 (may need to create)

frontend/src/components/
  MobileLayout.tsx             ← Task 5 (notification bell)
  AgencyLayout.tsx             ← Task 4 (if nav changes needed)
```

---

## 🗄️ DB REFERENCE

```sql
-- Tables relevant for this batch:
job_offers         — id, shipment_id, driver_id, status, fare, pickup_otp, delivery_otp,
                     photo_loading_url, photo_delivery_url
agency_jobs        — id, agency_id, shipment_id, driver_id, truck_id, status, fare,
                     origin, destination, vehicle_type, created_at, updated_at
driver_locations   — driver_id, latitude, longitude, updated_at, speed_kmh, heading
notifications      — id, user_id, title, message, type, read, created_at, action_url

-- Storage:
trip-photos bucket — {driver_id}/{job_id}/{field}.{ext}  (public=true)
```

---

## 🚀 DEPLOYMENT

```powershell
# Build first — ALWAYS verify no TS errors before deploying
cd d:\Github\Truck_Opti\frontend; npm run build

# Commit & deploy
cd d:\Github\Truck_Opti
git add -A
git commit -m "feat: driver wallet balance, agency invoice PDF, confirm delivery"
git push heroku main
git push origin main
```

---

## ✅ DEFINITION OF DONE FOR BATCH 11

1. Razorpay live keys configured in Heroku — real payments now accepted (if owner provides live keys)
2. Driver wallet card shows balance + total earned + withdrawal placeholder
3. Agency billing table has "Download Invoice" per delivered job (generates PDF)
4. Agency can tap "Confirm Delivery" on in-transit jobs to mark them delivered
5. Notification bell in MobileLayout shows unread count; tapping navigates to notifications

---

## 🔮 AFTER BATCH 11 — REMAINING WORK

| Feature | Priority | Notes |
|---------|----------|-------|
| Razorpay webhook order verification (Supabase Edge Fn) | P1 | Prevents payment fraud |
| SMS/WhatsApp OTP via Twilio | P1 | Currently email OTP only |
| Driver bank account + payout (Razorpay X or manual) | P2 | Phase 5 |
| Admin dashboard: revenue analytics, user management | P2 | Phase 5 |
| Multi-language: complete Hindi strings audit | P3 | Some pages still en-only |
| Contact / sales inquiry page | P3 | `/contact` |

---

## ⚠️ KNOWN CONSTRAINTS

- **Do NOT run Supabase migrations without verifying they are needed** — check if column/table exists first.
- **Environment secrets**: Never hardcode API keys. Use `heroku config:set` and Supabase secrets.
- **Build must pass** before every deploy: `cd frontend; npm run build`
- **After every deploy**, post a message in `STATE.md` AGENT MESSAGES section.
- **Judge rule**: The next judge session (BATCH12) will re-read every file you touch. Write clean, complete code.
