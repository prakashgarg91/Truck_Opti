# PATTERNS — TruckOpti

> **Established code patterns for this project.**
> Before writing new code, check if a pattern already exists here.
> After discovering a new pattern, add it.

---

## AUTH PATTERN: Always Use authStore

```typescript
// Every component that needs user context:
import { useAuthStore } from '../stores/authStore'

const { user, agencyId, driverId, isLoading } = useAuthStore()

// Role-based rendering:
const role = user?.role  // resolved by authStore via resolveAppRole() + public.users.role
```

**Never** use local useState for auth. **Never** call supabase.auth.getUser() in a component — authStore already handles the session listener.

---

## AUTH PATTERN: User-Facing Errors Only

```typescript
import { UserFacingError, toUserFacingErrorMessage } from '../utils/userFacingError'

throw new UserFacingError('Unable to send email OTP right now. Please try again later or use Google sign-in.')

toast.error(toUserFacingErrorMessage(error, 'Something went wrong. Please try again.'))
```

Rules:
- Map Supabase/auth/provider failures to `UserFacingError` inside the service layer.
- In pages/components, render `toUserFacingErrorMessage(...)` instead of raw `error.message`.
- Never show raw Supabase, Razorpay, or PhonePe errors directly in a toast.

---

## SUPABASE PATTERN: Data Fetching

```typescript
useEffect(() => {
  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('agency_jobs')
      .select('*, driver:drivers(name), truck:agency_trucks(number_plate)')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[AgencyJobsPage] load:', error)
      toast.error(language === 'en' ? 'Failed to load jobs' : 'काम लोड नहीं हो सका')
      return
    }
    setJobs(data ?? [])
  }
  if (agencyId) load()
}, [agencyId])
```

Rules:
- Always destructure `{ data, error }`. Never ignore `error`.
- Log with `[PageName]` prefix.
- Show bilingual toast on error — never the raw `error.message`.
- Guard the call with the required ID (`agencyId`, `driverId`, etc.).

---

## SUPABASE PATTERN: Realtime Subscription

```typescript
useEffect(() => {
  if (!agencyId) return

  const channel = supabase
    .channel(`agency-jobs-${agencyId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'agency_jobs', filter: `agency_id=eq.${agencyId}` },
      (payload) => {
        setJobs(prev => [payload.new as AgencyJob, ...prev])
      }
    )
    .subscribe()

  return () => { supabase.removeChannel(channel) }   // ALWAYS clean up
}, [agencyId])
```

---

## PAYMENT PATTERN: Razorpay

```typescript
// services/razorpayPayment.ts — keep payment logic out of page components
export async function initiateRazorpayPayment(planId: string, userId: string) {
  // 1. Create order on server
  const res = await fetch('/api/razorpay/order', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, userId })
  })
  const { orderId, amount, currency } = await res.json()

  // 2. Open Razorpay checkout
  const options = {
    key: import.meta.env.VITE_RAZORPAY_KEY_ID,
    order_id: orderId,
    amount,
    currency,
    handler: async (response: RazorpayResponse) => {
      // 3. Verify on server (BATCH12 T1: webhook will also confirm)
      await fetch('/api/razorpay/verify', { method: 'POST', body: JSON.stringify(response) })
    }
  }
  new (window as any).Razorpay(options).open()
}
```

---

## PAYMENT PATTERN: PhonePe Redirect

```typescript
// Only redirect to allowlisted PhonePe domains (BUG-REDIRECT-001 fix)
const ALLOWED_PHONEPE_DOMAINS = ['mercury.phonepe.com', 'api.phonepe.com', 'phonepe.com']

function safePhonePeRedirect(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') throw new Error('Non-HTTPS')
    const parts = parsed.hostname.split('.')
    const domain = parts.slice(-2).join('.')
    if (!ALLOWED_PHONEPE_DOMAINS.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d))) {
      throw new Error('Untrusted domain')
    }
    window.location.href = url
  } catch {
    toast.error('Payment redirect failed. Please try again.')
  }
}
```

Rules:
- Client code may validate external PhonePe redirect URLs before navigating the browser.
- The PhonePe callback return URL is server-owned. Edge functions must build `/payment/callback` from allowlisted TruckOpti app origins and must ignore arbitrary client callback URLs.

## SHIPMENT DOCUMENT IDENTITY PATTERN

```typescript
// Never generate invoice/LR numbers in the page layer.
// The database owns shipment document identity.
const shipment = await shipmentsSupabaseApi.getById(shipmentId)

const documentNumbers = shipment?.invoice_number && shipment?.lr_number
  ? shipment
  : await shipmentsSupabaseApi.ensureDocumentNumbers(shipmentId)
```

Rules:
- `shipments.invoice_number` and `shipments.lr_number` are DB-owned fields.
- New rows get document numbers from the shipment trigger.
- Existing rows are backfilled through `ensure_shipment_document_numbers(...)`.
- Do not add new client-side invoice/LR generators.

## DRIVER TRIP PROGRESS PATTERN

```typescript
const result = await supabase.rpc('persist_driver_job_offer_progress', {
  p_job_offer_id: job.id,
  p_status: 'delivery_arrived',
  p_extra: { delivery_arrived_at: new Date().toISOString() }
})
```

Rules:
- Driver trip status changes, milestone timestamps, proof-photo URLs, and final `active_job_id` cleanup belong in the RPC.
- Do not split these writes across separate `job_offers` and `drivers` updates in the page.
- Keep storage upload in the client, but persist the resulting URL through the RPC.

## CONTACT INQUIRY RELIABILITY PATTERN

```typescript
import { submitContactInquiry, queuePendingContactInquiry } from '../services/contactInquiry'

await submitContactInquiry(payload, pendingSubmission?.clientSubmissionId)
```

Rules:
- Contact draft/pending storage lives in `services/contactInquiry.ts`, not in the page.
- Retries must reuse `client_submission_id` so reconnects cannot create duplicate inquiries.
- Treat duplicate-key submission errors as idempotent success.

## PROOF SCRIPT ENV PATTERN

```javascript
// scripts/live-auth-proof.cjs / scripts/live-admin-proof.cjs
const { readEnvValue } = require('./_proofEnv.cjs')

const baseUrl = readEnvValue('PROOF_BASE_URL') || 'https://www.truckopti.in'
const password = readEnvValue('SEED_DEMO_PASSWORD')
```

Rules:
- Authenticated proof scripts load secrets from `.env.proof.local` first, then `.env.local`, `.env`, and frontend env files.
- Shell environment still wins; local files are only the repeatable fallback.
- Keep proof-only secrets out of git and out of page code.

## PAYMENT HISTORY OWNERSHIP PATTERN

```typescript
// Client starts checkout.
await supabase.functions.invoke('create-razorpay-order', { body })
await supabase.functions.invoke('phonepe-checkout', { body })

// Edge functions own payment_history persistence and status transitions.

const status = await paymentSupabaseApi.getRazorpayStatusSnapshot(userId, { orderId, paymentId })
const plan = await subscriptionPlansApi.getById(planId)
const plans = await subscriptionPlansApi.getAll()
```

Rules:
- Page/service code may initiate checkout, but `payment_history` rows are server-owned for Razorpay and PhonePe.
- Payment callback pages must read Razorpay status through `paymentSupabaseApi.getRazorpayStatusSnapshot(...)`, not with direct `supabase.from('payment_history')` queries.
- Pricing and checkout pages must read plans through `subscriptionPlansApi.getAll()` / `subscriptionPlansApi.getById()`, not with direct `supabase.from('subscription_plans')` queries.
- Use the table's real status contract: `pending | success | failed | refunded`.
- Keep subscription activation functions aligned to `subscription_plans.price_monthly`, `price_yearly`, and `billing_cycle = monthly | yearly`.
- Do not insert or update `subscriptions`, `invoices`, `usage_tracking`, or `payment_history` directly from browser code.
- Order-creation edge functions must fetch the selected plan and reject any client amount that does not equal the server-calculated plan total including GST.
- Verification edge functions must resolve plan metadata from the stored `payment_history.metadata` row, never from request-body fallbacks.

---

## PDF PATTERN: Agency Invoice (jsPDF v4.1.0)

```typescript
import jsPDF from 'jspdf'
// v4.1.0 uses named export — NOT default for autoTable:
import autoTable from 'jspdf-autotable'

function generateInvoicePDF(job: AgencyJob) {
  const doc = new jsPDF()
  doc.setFontSize(16)
  doc.text('TruckOpti Invoice', 20, 20)

  autoTable(doc, {
    head: [['Date', 'Route', 'Amount']],
    body: [[job.created_at, job.route, `₹${job.amount}`]],
    startY: 40
  })

  doc.save(`invoice-${job.id}.pdf`)
}
```

**Important**: jsPDF v4 import changed. Do NOT use `doc.autoTable()` (v3 syntax).

---

## BILINGUAL PATTERN

```typescript
// Every user-facing string:
const labels = {
  title: language === 'en' ? 'My Shipments' : 'मेरे शिपमेंट',
  empty: language === 'en' ? 'No shipments yet' : 'अभी तक कोई शिपमेंट नहीं',
  loadError: language === 'en' ? 'Failed to load' : 'लोड नहीं हो सका'
}

// Or inline:
<h1>{language === 'en' ? 'Dashboard' : 'डैशबोर्ड'}</h1>
```

Language comes from authStore or a language context — do NOT fetch from Supabase per component.

---

## ROUTE GUARD PATTERN

```typescript
// Route groups live in App.tsx and use the shared ProtectedRoute wrapper:
import ProtectedRoute from '../components/ProtectedRoute'

<Route element={
  <ProtectedRoute allowedRoles={['agency']}>
    <AgencyLayout />
  </ProtectedRoute>
}>
  <Route path="/agency/dashboard" element={<AgencyDashboardPage />} />
</Route>
```

Roles: `'customer'` | `'driver'` | `'agency'` | `'admin'`

Rules:
- Enforce role access at the route layer first; do not rely on page-local redirect guards.
- Use `allowedRoles` for admin, driver, and agency route groups.
- Shared customer routes can use `ProtectedRoute` without `allowedRoles`.
- Use `getDefaultHomePathForRole(...)` for consistent post-auth and wrong-role redirects.

---

## STORAGE UPLOAD PATTERN

```typescript
async function uploadDocument(file: File, driverId: string, docType: 'licence' | 'rc') {
  const ext = file.name.split('.').pop()
  const path = `${driverId}/${docType}.${ext}`  // ownership-scoped path

  const { error } = await supabase.storage
    .from('driver-docs')
    .upload(path, file, { upsert: true })

  if (error) {
    console.error('[DriverRegisterPage] upload:', error)
    throw new Error('Upload failed')  // caller shows toast
  }

  const { data } = supabase.storage.from('driver-docs').getPublicUrl(path)
  return data.publicUrl
}
```

---

## CONSTANTS PATTERN (Anti-BUG-020)

```typescript
// frontend/src/utils/constants.ts
export const GST_RATE = 0.05          // 5% for logistics services
export const TRIAL_DAYS = 14         // Free trial duration
export const MAX_TRUCKS_FREE = 2     // Free plan truck limit
export const OTP_EXPIRY_SECONDS = 300

// NEVER hardcode these values inline — always import from constants.ts
```

---

## PACKING PATTERN: Shared Client-Side Engine

```typescript
import {
  AdvancedBinPacker,
  recommendTrucks,
  type PackedBox,
  type SaleOrderItem,
  type TruckRecommendation,
  type TruckType,
} from '../lib/packing'
```

Rules:
- Keep the packing heuristics in `frontend/src/lib/packing.ts` as the single source of truth.
- `PackingPage.tsx` and `packingWorker.ts` should import the shared engine instead of carrying their own algorithm copies.
- After changing packing heuristics, run `npm run test:packing` in `frontend/` for deterministic regression proof before relying only on browser smoke or build output.
- Do not scan truck coordinates by repeated floating increments alone; generate snapped axis positions that explicitly include the exact boundary limit, or skyline-style packers will miss edge-aligned placements such as `x = 1` / `z = 1` in a `2x2x1` truck.

---

*Last updated: 2026-04-05 | packing boundary-scan rule synced by MANAGER-ADMIN*

---

## TOOLING PATTERN: Qdrant Semantic Search

Use `D:\Github\tools\qdrant_gap_audit.py` when you want to find code by **concept or behaviour**:

```powershell
# Search by meaning — better than grep for intent-based queries
python D:\Github\tools\qdrant_gap_audit.py -q "your query here" --workspace .

# With file context (shows real source lines)
python D:\Github\tools\qdrant_gap_audit.py -q "your query here" --context-lines 3 --workspace .

# Full gap audit — writes 0.dev-matrix/QDRANT_GAP_REPORT.md
python D:\Github\tools\qdrant_gap_audit.py --workspace .
```

| When | Use |
|------|-----|
| Exact function/string known | `grep` / `ripgrep` |
| Searching by intent/concept | Qdrant `-q` |
| Full codebase health check | Qdrant gap audit (no `-q`) |

Collection is auto-discovered. Requires `pip install requests` in project venv.