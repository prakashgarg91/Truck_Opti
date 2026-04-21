# TruckOpti — BATCH 12 Agent Continuation Prompt

> **Use this file as-is as your starting prompt.**
> Repo: `d:/Github/Truck_Opti`
> Production: `https://www.truckopti.in` (Heroku `truck-opti-app`, latest: **v50**)
> Supabase project: `jbxncejtcbpcronndqlx.supabase.co`
> Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand (authStore) + React Router v6

---

## ⚠️ MANDATORY FIRST STEPS

1. Read `0.dev-matrix/STATE.md` — register yourself in the ACTIVE AGENTS table.
2. Read `0.dev-matrix/TESTING_PRINCIPLES.md` — never mark done without verifying the actual user flow.
3. After deploy, post a message in STATE.md → **## 📝 AGENT MESSAGES** (newest at top).
4. Update `0.dev-matrix/ROADMAP.md` after completing each task.

---

## 🏆 CURRENT STATUS (post v50)

All 3 portals are fully functional end-to-end. Phase 3 features are complete.

| Portal | Status | Key Features |
|--------|--------|-------------|
| **Customer** | ✅ Ready | Book truck → live tracking → OTP → "Book Another Truck" on delivered |
| **Driver** | ✅ Ready | Realtime job (30s) → accept → 7-step trip → wallet balance + earnings ledger |
| **Agency** | ✅ Ready | Accept job → assign driver → track live → confirm delivery → billing PDF invoices |

**Phase 4 focus**: Payments go-live, SMS OTP, admin analytics, Razorpay webhook security.

---

## 🎯 TASK LIST

---

### TASK 1 — Razorpay Webhook: Order Verification Edge Function (P1)

**Without this, payments cannot be trusted.** Anyone can fake a successful payment callback.

**Context:** When a customer completes a Razorpay payment, Razorpay calls a webhook URL with a signature. The app must verify the HMAC-SHA256 signature before marking the subscription as active.

**File to create:** `supabase/functions/razorpay-webhook/index.ts`

```typescript
import { serve } from 'https://deno.land/std/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js'
import { crypto } from 'https://deno.land/std/crypto/mod.ts'

serve(async (req) => {
  const body = await req.text()
  const signature = req.headers.get('x-razorpay-signature') ?? ''
  const secret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? ''

  // Verify HMAC-SHA256 signature
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const expected = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0')).join('')

  if (expected !== signature) {
    return new Response('Invalid signature', { status: 401 })
  }

  const event = JSON.parse(body)
  if (event.event === 'payment.captured') {
    const { order_id, contact: phone } = event.payload.payment.entity
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    // Activate subscription for the paying user (match by phone or order metadata)
    await supabase.from('subscriptions')
      .update({ status: 'active', razorpay_order_id: order_id })
      .eq('razorpay_order_id', order_id)
  }

  return new Response('ok', { status: 200 })
})
```

**Deploy:**
```bash
supabase functions deploy razorpay-webhook --project-ref jbxncejtcbpcronndqlx
```

**Then configure in Razorpay dashboard**: Settings → Webhooks → Add webhook URL:
`https://jbxncejtcbpcronndqlx.supabase.co/functions/v1/razorpay-webhook`

---

### TASK 2 — Admin Dashboard: Revenue & User Analytics Page (P2)

**File:** `frontend/src/pages/AdminDashboardPage.tsx` (may already exist — check first)

The admin portal needs a real analytics view. Currently it shows static placeholder data.

**Add to admin dashboard:**

1. **Revenue card** — total from `agency_jobs.fare` where `status='delivered'`:
   ```typescript
   const { data } = await supabase.from('agency_jobs').select('fare').eq('status', 'delivered')
   const totalRevenue = data?.reduce((s, r) => s + (r.fare ?? 0), 0) ?? 0
   ```

2. **User counts** — agencies, drivers, customers:
   ```typescript
   const [agenciesRes, driversRes, shipmentsRes] = await Promise.all([
     supabase.from('transport_agencies').select('id', { count: 'exact', head: true }),
     supabase.from('drivers').select('id', { count: 'exact', head: true }),
     supabase.from('shipments').select('id', { count: 'exact', head: true }),
   ])
   ```

3. **Recent jobs table** — last 20 delivered jobs with agency name, fare, route, date.

4. **Platform fee estimate** — show `totalRevenue * 0.10` (10% platform fee, labeled "Est. Platform Revenue").

---

### TASK 3 — Driver Registration: Add Document Upload (P2)

**File:** `frontend/src/pages/DriverRegisterPage.tsx` (check if exists)

Currently drivers register with basic info. Add:
- **Driving Licence photo** upload → `supabase.storage.from('driver-docs').upload(...)`
- **Vehicle RC photo** upload
- Both stored in `driver-docs/{driver_id}/licence.jpg` and `rc.jpg`
- Save public URLs to `drivers.licence_url` and `drivers.rc_url`

**Check if `driver-docs` bucket exists first:**
```sql
SELECT id FROM storage.buckets WHERE id = 'driver-docs';
```
If missing, create it via Supabase migration (similar to `trip-photos` bucket).

**Also add columns to `drivers` table if missing:**
```sql
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS licence_url TEXT;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS rc_url TEXT;
```

---

### TASK 4 — Customer: Shipment History Page (P2)

**File:** `frontend/src/pages/ShipmentHistoryPage.tsx` (create if not exists)

Customers currently only see live/active shipments on `/tracking`. They need a history view of all past shipments.

1. Fetch all shipments for the logged-in customer (including delivered + cancelled):
   ```typescript
   const { data } = await supabase.from('shipments')
     .select('*').eq('customer_id', userId).order('created_at', { ascending: false })
   ```

2. Show a filterable list (All / Delivered / Cancelled) with route, date, status, shipment ID.

3. Each row taps to open the existing TrackingPage detail modal (reuse the component) or a simple detail sheet.

4. **Add route** to `App.tsx` MobileLayout: `/history` → `ShipmentHistoryPage`

5. **Add link** in the customer's bottom nav or Dashboard page: "View History" button.

---

### TASK 5 — Agency: Notification Bell (P2)

**File:** `frontend/src/components/AgencyLayout.tsx`

The agency portal has no notification system. When a new job is dispatched to them (`agency_jobs` INSERT), they need a visual indicator.

1. Subscribe to `agency_jobs` Realtime for the logged-in agency's new pending jobs.
2. Show a badge count on a bell icon in the AgencyLayout top bar.
3. Tapping the bell navigates to `/agency/jobs` (which already exists).

```typescript
// In AgencyLayout
const [newJobCount, setNewJobCount] = useState(0)

useEffect(() => {
  if (!agencyId) return
  const channel = supabase.channel('agency-new-jobs')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'agency_jobs',
      filter: `agency_id=eq.${agencyId}`
    }, () => setNewJobCount(c => c + 1))
    .subscribe()
  return () => { supabase.removeChannel(channel) }
}, [agencyId])
```

---

## 📁 KEY FILES

```
frontend/src/pages/
  AdminDashboardPage.tsx       ← Task 2 (read first — may already have analytics)
  DriverRegisterPage.tsx       ← Task 3 (add document upload)
  ShipmentHistoryPage.tsx      ← Task 4 (create new)
  TrackingPage.tsx             ← Task 4 (reuse detail modal logic)

frontend/src/components/
  AgencyLayout.tsx             ← Task 5 (notification bell)

supabase/functions/
  razorpay-webhook/index.ts    ← Task 1 (create new)
```

---

## 🗄️ DB REFERENCE

```sql
-- Tables relevant for this batch:
agency_jobs        — id, agency_id, shipment_id, driver_id, truck_id, status, fare,
                     origin, destination, vehicle_type, created_at, updated_at
shipments          — id, customer_id, shipment_id, origin, destination, status,
                     vehicle_type, total_weight, created_at
drivers            — id, user_id, full_name, phone, rating, licence_url, rc_url
transport_agencies — id, user_id, company_name, status, rating, total_jobs
subscriptions      — id, user_id, plan, status, razorpay_order_id

-- Storage:
trip-photos        — {driver_id}/{job_id}/{field}.{ext} (public)
driver-docs        — {driver_id}/licence.jpg, {driver_id}/rc.jpg
                     (check if exists before creating)
```

---

## 🚀 DEPLOYMENT

```powershell
# Build first — ALWAYS verify no TS errors before deploying
cd d:\Github\Truck_Opti\frontend; npm run build

# Commit & deploy
cd d:\Github\Truck_Opti
git add -A
git commit -m "feat: razorpay webhook, admin analytics, shipment history"
git push heroku main
git push origin main
```

---

## ✅ DEFINITION OF DONE FOR BATCH 12

1. Razorpay webhook edge function deployed and verified signature check works
2. Admin dashboard shows real user/revenue counts + recent job table
3. Driver registration has document upload (licence + RC) with storage path correct
4. Customer can navigate to `/history` and see all past shipments (delivered + cancelled)
5. Agency layout has notification bell that animates when new jobs arrive

---

## ⚠️ HUMAN ACTION REQUIRED (owner task — not agent task)

**Razorpay Live Keys** (Task 1 prerequisite):
```
heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXXXXXXXXXXXXXXX --app truck-opti-app
supabase secrets set RAZORPAY_KEY_SECRET=your_live_key_secret --project-ref jbxncejtcbpcronndqlx
```
Then configure the webhook URL in Razorpay dashboard.

---

## 🔮 AFTER BATCH 12 — REMAINING WORK

| Feature | Priority | Notes |
|---------|----------|-------|
| SMS/WhatsApp OTP via Twilio | P1 | Supabase Auth Settings → Phone provider |
| Driver bank account + payout (Razorpay X) | P2 | Phase 5 |
| Multi-language: full Hindi audit | P3 | Some pages still English-only |
| PWA offline caching strategy | P3 | Service worker config |
| Contact / sales inquiry page | P3 | `/contact` route |
| Performance: RLS index on driver_locations | P2 | Check EXPLAIN ANALYZE |

---

## ⚠️ KNOWN CONSTRAINTS

- **Never hardcode secrets.** Use `heroku config:set` and `supabase secrets set` only.
- **jsPDF v4.1.0 is installed** in `frontend/package.json` — do NOT reinstall.
- **GST rate for freight (SAC 9965) = 5%** — do NOT use 18% anywhere in billing code.
- **Build must pass** before every deploy: `cd frontend; npm run build`
- **After every deploy**, post a message in `STATE.md` AGENT MESSAGES section.
- **Judge rule**: The next judge session (BATCH13) will re-read every file you touch. Write clean, complete code.
