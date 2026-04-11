# PATTERNS — TruckOpti

> **Established code patterns for this project.**
> Before writing new code, check if a pattern already exists here.
> After discovering a new pattern, add it.

---

## AUTH PATTERN: Always Use authStore

```typescript
// Every component that needs user context:
import { useAuthStore } from '../store/authStore'

const { user, agencyId, driverId, isLoading } = useAuthStore()

// Role-based rendering:
const role = user?.user_metadata?.role  // 'customer' | 'driver' | 'agency' | 'admin'
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
// useRequireAuth hook (already exists):
import { useRequireAuth } from '../hooks/useRequireAuth'

function AgencyDashboardPage() {
  useRequireAuth('agency')  // redirects to /login if wrong role
  // ...
}
```

Roles: `'customer'` | `'driver'` | `'agency'` | `'admin'`

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