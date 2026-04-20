# Services Layer — Developer Guide

> **Location**: `frontend/src/services/`  
> This directory contains all data access and external integration logic.  
> Page components should never import `supabase` directly — always go through a service function.

---

## File Overview

| File | Responsibility | External Dependency |
|------|---------------|---------------------|
| `supabaseApi.ts` | All Supabase DB operations + Supabase Auth | Supabase JS SDK |
| `subscriptionApi.ts` | Plan catalog, subscription lifecycle, invoices | Supabase JS SDK |
| `razorpayPayment.ts` | Razorpay checkout initiation and result handling | Razorpay JS CDN, `/api/razorpay` server route |
| `phonepePayment.ts` | PhonePe checkout initiation | `/api/phonepe` server route |
| `contactInquiry.ts` | Offline-resilient contact form with localStorage draft/retry | Supabase JS SDK, `localStorage` |

---

## When to Add to `supabaseApi.ts` vs Create a New File

**Add to `supabaseApi.ts`** when:
- The operation is a simple CRUD on a Supabase table
- The function count for the new entity stays under 6
- No external API calls (payment gateways, SMS, maps) are involved

**Create a new file** when:
- The feature has >6 service functions (e.g. a rich driver wallet system)
- External APIs are involved (payment, maps, SMS, storage)
- The service has its own types that would clutter `supabaseApi.ts`
- The feature is conceptually self-contained (like subscriptions)

**Naming convention**: `<domainName>Api.ts` or `<domainName>Payment.ts`

---

## `supabaseApi.ts` — Complete Function Reference

### Helper Functions (internal, not exported)

| Function | Purpose |
|----------|---------|
| `getAuthErrorMessage(error, fallback)` | Maps Supabase auth error codes to user-friendly messages |
| `getPasswordAuthErrorMessage(error, fallback)` | Maps password-specific error codes |
| `normalizeEmailAddress(email)` | `trim().toLowerCase()` |
| `resolvePasswordLoginEmail(identifier, opts?)` | Resolves login ID or email via `resolve_login_identifier` RPC |
| `getSafeAuthFailureMessage(error, fallback)` | Catches network/OTP/token errors and returns safe UI strings |

---

### Exported Types

```typescript
// Trucks
interface Truck {
  id: string; name: string; name_hi: string;
  length: number; width: number; height: number;
  capacity: number; cost_per_km: number; available: boolean;
  created_at?: string; updated_at?: string;
}

// Cartons
interface Carton {
  id: string; name: string;
  length: number; width: number; height: number;
  weight: number; fragile: boolean; stackable: boolean;
}

// Customers
interface Customer {
  id: string; name: string; phone: string; email: string | null;
  address: string; city: string; state?: string; pincode?: string;
  gst_number?: string | null; pan_number: string;
  created_at?: string; updated_at?: string; created_by?: string;
}

// Shipments
interface Shipment {
  id: string; shipment_id: string;
  customer_id: string | null; created_by?: string; truck_id: string | null;
  invoice_number?: string | null; lr_number?: string | null;
  origin: string; destination: string;
  status: 'pending' | 'in_transit' | 'delivered' | 'cancelled';
  total_weight: number; total_volume: number; estimated_cost: number;
  driver_name: string | null; driver_phone: string | null;
  vehicle_number: string | null; latitude: number | null; longitude: number | null;
  sale_order_id?: string | null;
}

// Routes
interface Route {
  id: string; name: string; start_location: string;
  destinations: string[]; total_distance: number; total_time: number;
  total_cost: number; toll_cost: number; fuel_cost: number;
  status: 'planned' | 'active' | 'completed'; created_by?: string;
}

// PackingResult
interface PackingResult {
  id: string; shipment_id: string | null; truck_id: string;
  algorithm: string; items_packed: number; total_items: number;
  volume_utilization: number; weight_utilization: number;
  packed_boxes: object; unfit_items: string[];
}

// PackingJob
interface PackingJob {
  id?: string; user_id: string; truck_id?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  items: PackingJobItem[]; volume_utilization: number;
  weight_utilization: number; total_cost: number;
  algorithm: string; optimization_goal: string; result_data?: object;
}

// PackingJobItem
interface PackingJobItem {
  id?: string; job_id?: string; name: string;
  length: number; width: number; height: number;
  weight: number; quantity: number; fragile: boolean; stackable: boolean;
  position_x?: number; position_y?: number; position_z?: number;
  rotation?: string; is_packed?: boolean;
}
```

---

### `trucksSupabaseApi`

| Method | Signature | Returns | Table |
|--------|-----------|---------|-------|
| `getAll` | `()` | `Promise<Truck[]>` | `trucks` |
| `getById` | `(id: string)` | `Promise<Truck \| null>` | `trucks` |
| `create` | `(truck: Omit<Truck, 'id'\|'created_at'\|'updated_at'>)` | `Promise<Truck>` | `trucks` |
| `update` | `(id: string, truck: Partial<Truck>)` | `Promise<Truck>` | `trucks` |
| `delete` | `(id: string)` | `Promise<void>` | `trucks` |

```typescript
// Usage example:
import { trucksSupabaseApi } from '../services/supabaseApi'

const trucks = await trucksSupabaseApi.getAll()
const created = await trucksSupabaseApi.create({
  name: 'Tata 407', name_hi: 'टाटा 407',
  length: 14, width: 7, height: 6,
  capacity: 2500, cost_per_km: 18, available: true
})
```

---

### `cartonsSupabaseApi`

| Method | Signature | Returns | Table |
|--------|-----------|---------|-------|
| `getAll` | `()` | `Promise<Carton[]>` | `cartons` |
| `getById` | `(id: string)` | `Promise<Carton \| null>` | `cartons` |
| `create` | `(carton: Omit<Carton, 'id'\|...>)` | `Promise<Carton>` | `cartons` |
| `update` | `(id: string, carton: Partial<Carton>)` | `Promise<Carton>` | `cartons` |
| `delete` | `(id: string)` | `Promise<void>` | `cartons` |

---

### `customersSupabaseApi`

| Method | Signature | Returns | Table |
|--------|-----------|---------|-------|
| `getAll` | `()` | `Promise<Customer[]>` | `customers` |
| `getById` | `(id: string)` | `Promise<Customer \| null>` | `customers` |
| `create` | `(customer: Omit<Customer, 'id'\|...>)` | `Promise<Customer>` | `customers` |
| `update` | `(id: string, customer: Partial<Customer>)` | `Promise<Customer>` | `customers` |
| `delete` | `(id: string)` | `Promise<void>` | `customers` |
| `search` | `(query: string)` | `Promise<Customer[]>` | `customers` |

The `search` method uses `.or()` with `ilike` across `name`, `phone`, and `city` columns.

---

### `shipmentsSupabaseApi`

| Method | Signature | Returns | Table |
|--------|-----------|---------|-------|
| `getAll` | `(filters?: { status?: string })` | `Promise<Shipment[]>` | `shipments` |
| `getById` | `(id: string)` | `Promise<Shipment \| null>` | `shipments` |
| `create` | `(shipment: Omit<Shipment, 'id'\|...>)` | `Promise<Shipment>` | `shipments` |
| `update` | `(id: string, data: Partial<Shipment>)` | `Promise<Shipment>` | `shipments` |
| `updateStatus` | `(id: string, status: Shipment['status'])` | `Promise<Shipment>` | `shipments` |
| `updateLocation` | `(id: string, lat: number, lng: number)` | `Promise<Shipment>` | `shipments` |
| `ensureDocumentNumbers` | `(id: string)` | `Promise<Pick<Shipment, 'invoice_number'\|'lr_number'>>` | RPC |
| `delete` | `(id: string)` | `Promise<void>` | `shipments` |

**`ensureDocumentNumbers`** must be called before rendering any invoice or LR. It calls the `ensure_shipment_document_numbers` Postgres function which atomically generates and persists `invoice_number` and `lr_number` if they are not yet set. Safe to call multiple times — idempotent.

---

### `routesSupabaseApi`

| Method | Signature | Returns | Table |
|--------|-----------|---------|-------|
| `getAll` | `()` | `Promise<Route[]>` | `routes` |
| `getById` | `(id: string)` | `Promise<Route \| null>` | `routes` |
| `create` | `(route: Omit<Route, 'id'\|...>)` | `Promise<Route>` | `routes` |
| `update` | `(id: string, route: Partial<Route>)` | `Promise<Route>` | `routes` |
| `delete` | `(id: string)` | `Promise<void>` | `routes` |

---

### `packingSupabaseApi`

| Method | Signature | Returns | Table |
|--------|-----------|---------|-------|
| `saveResult` | `(result: Omit<PackingResult, 'id'\|'created_at'>)` | `Promise<PackingResult>` | `packing_results` |
| `getHistory` | `(limit?: number)` | `Promise<PackingResult[]>` | `packing_results` |

---

### `packingJobsSupabaseApi`

| Method | Signature | Returns | Tables |
|--------|-----------|---------|-------|
| `createJob` | `(job: Omit<PackingJob, 'id'\|...>)` | `Promise<PackingJob>` | `packing_jobs` |
| `addJobItems` | `(items: Omit<PackingJobItem, 'id'>[])` | `Promise<PackingJobItem[]>` | `packing_items` |
| `getUserJobs` | `(limit?: number)` | `Promise<PackingJob[]>` | `packing_jobs` |
| `getJobItems` | `(jobId: string)` | `Promise<PackingJobItem[]>` | `packing_items` |
| `updateJob` | `(id: string, data: Partial<PackingJob>)` | `Promise<PackingJob>` | `packing_jobs` |
| `deleteJob` | `(id: string)` | `Promise<void>` | `packing_jobs`, `packing_items` |

`deleteJob` deletes items first, then deletes the job (manual cascade since `ON DELETE CASCADE` may not exist on `packing_items`).

---

### `authSupabaseApi`

All methods throw `UserFacingError` — the message is always safe to display in a toast.

| Method | Signature | Returns | Notes |
|--------|-----------|---------|-------|
| `signInWithEmail` | `(email: string)` | `Promise<void>` | Login only (no new users) |
| `signUpWithEmail` | `(email: string, name?: string)` | `Promise<void>` | New user signup |
| `signInWithEmailPassword` | `(identifier: string, password: string)` | `Promise<AuthResponse>` | Accepts email or login ID |
| `signUpWithEmailPassword` | `(email: string, password: string, name?: string)` | `Promise<AuthResponse>` | |
| `verifyEmailOtp` | `(email: string, token: string)` | `Promise<AuthResponse>` | |
| `verifyPhoneOtp` | `(phone: string, token: string)` | `Promise<AuthResponse>` | Requires Twilio |
| `signInWithPhone` | `(phone: string, channel?)` | `Promise<void>` | Requires Twilio |
| `signInWithGoogle` | `()` | `Promise<OAuthResponse>` | Redirects to Google |
| `resetPasswordForEmail` | `(identifier: string)` | `Promise<void>` | Silent no-op if not found |
| `updatePassword` | `(password: string)` | `Promise<void>` | Must be authenticated |
| `signOut` | `()` | `Promise<void>` | |
| `getUser` | `()` | `Promise<User>` | Server-verified (uses `getUser()`) |
| `getSession` | `()` | `Promise<Session \| null>` | |
| `onAuthStateChange` | `(callback)` | `Subscription` | |

---

## `subscriptionApi.ts` — Function Reference

### `subscriptionPlansApi`

| Method | Signature | Returns | Table |
|--------|-----------|---------|-------|
| `getAll` | `()` | `Promise<SubscriptionPlan[]>` | `subscription_plans` |
| `getByTier` | `(tier: string)` | `Promise<SubscriptionPlan \| null>` | `subscription_plans` |
| `getById` | `(id: string)` | `Promise<SubscriptionPlan \| null>` | `subscription_plans` |

The `features` column is stored as JSONB and is automatically parsed to `string[]` by all methods.

### Types

```typescript
interface SubscriptionPlan {
  id: string; name: string; name_hi: string;
  tier: 'starter' | 'growth' | 'professional' | 'enterprise';
  price_monthly: number; price_yearly: number;
  trucks_limit: number; shipments_monthly: number; users_limit: number;
  storage_gb: number; api_calls_monthly: number; sms_included: number;
  maps_requests_monthly: number;
  support_level: 'email' | 'chat' | 'priority' | 'dedicated';
  features: string[]; is_active: boolean;
}

interface Subscription {
  id: string; user_id: string; plan_id: string;
  status: 'active' | 'paused' | 'cancelled' | 'expired' | 'trial';
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: string; current_period_end: string;
  trial_end?: string; cancel_at_period_end: boolean;
  razorpay_subscription_id?: string; razorpay_customer_id?: string;
}

interface Invoice {
  id: string; subscription_id: string; user_id: string;
  invoice_number: string; amount: number; tax_amount: number;
  total_amount: number; currency: string;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  billing_period_start: string; billing_period_end: string;
  razorpay_invoice_id?: string; razorpay_payment_id?: string;
  paid_at?: string; pdf_url?: string;
}
```

---

## `razorpayPayment.ts` — Function Reference

### `initiateRazorpayPayment(request)`

```typescript
interface RazorpayPaymentRequest {
  amount: number;          // in paise (₹1 = 100 paise)
  currency?: string;       // default 'INR'
  orderId?: string;        // pre-created Razorpay order ID (optional)
  description: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone: string;   // required
  userId: string;
  planId?: string;
  billingCycle?: 'monthly' | 'yearly';
}

interface RazorpayPaymentResult {
  success: boolean;
  paymentId?: string;    // razorpay_payment_id
  orderId?: string;      // razorpay_order_id
  signature?: string;    // razorpay_signature (must verify server-side)
  error?: string;
}
```

**Flow:**
1. Dynamically loads Razorpay SDK from `https://checkout.razorpay.com/v1/checkout.js`
2. Calls `POST /api/razorpay` on the Node server to create an order
3. Opens Razorpay checkout modal
4. On `success`, returns `{ success: true, paymentId, orderId, signature }`
5. Caller must POST these to Supabase Edge Function for server-side signature verification

**Safety checks:**
- If `VITE_RAZORPAY_KEY_ID` is unset or contains `REPLACE_ME`, throws before loading SDK
- On `truckopti.in`, rejects test-mode keys (`rzp_test_`) to prevent test transactions in production

---

## `phonepePayment.ts` — Function Reference

### `initiatePhonePePayment(request)`

```typescript
interface PhonePePaymentRequest {
  amount: number;         // in paise
  orderId: string;
  userId: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
  customerPhone: string;
}
```

**Flow:**
1. Validates `VITE_PHONEPE_MERCHANT_ID` and `VITE_PHONEPE_API_URL` are set
2. Calls `POST /api/phonepe` on the Node server (server generates checksum)
3. Validates the redirect URL against `ALLOWED_PHONEPE_DOMAINS` whitelist
4. Redirects the browser to PhonePe's payment page
5. PhonePe redirects back to `/payment/callback` with status params

**Safety checks:**
- Sandbox/preprod API URL is blocked on `truckopti.in` production domain
- Redirect URL validated: only `api.phonepe.com`, `mercury.phonepe.com`, `api-preprod.phonepe.com` are allowed
- All checksum computation happens server-side — never in browser code

---

## `contactInquiry.ts` — Function Reference

Provides offline-resilient contact form submission using localStorage for draft and pending-retry state.

| Function | Signature | Returns | Description |
|----------|-----------|---------|-------------|
| `getStoredContactDraft` | `()` | `ContactInquiryPayload \| null` | Reads saved form state from localStorage |
| `saveContactDraft` | `(payload)` | `void` | Saves form state for recovery on reload |
| `clearContactDraft` | `()` | `void` | Removes draft after successful submit |
| `getPendingContactInquiry` | `()` | `StoredContactInquiry \| null` | Returns a failed submission that should be retried |
| `submitContactInquiry` | `(payload)` | `Promise<void>` | Inserts to `contact_inquiries` table with idempotency key |
| `retryPendingContactInquiry` | `()` | `Promise<boolean>` | Retries stored pending submission; returns `true` on success |

```typescript
interface ContactInquiryPayload {
  name: string; email: string; phone: string;
  subject: string; message: string;
}

interface StoredContactInquiry extends ContactInquiryPayload {
  clientSubmissionId: string;   // UUID for dedup in contact_inquiries table
}
```

**Deduplication**: Each submission gets a `clientSubmissionId` (UUID). The Supabase `contact_inquiries` table has a unique constraint on this column. Re-submitting the same form (on retry) is a safe no-op.

---

## Error Handling Pattern

All service functions should follow this contract:

```typescript
// In service files:
import { UserFacingError } from '../utils/userFacingError'

// For auth errors — wrap in UserFacingError:
throw new UserFacingError('Too many OTP requests. Please wait a minute.')

// For data errors — let PostgrestError bubble up:
if (error) throw error   // Caller handles with toUserFacingErrorMessage
```

```typescript
// In page components:
import { toUserFacingErrorMessage } from '../utils/userFacingError'
import { logger } from '../utils/logger'

try {
  await someServiceFunction()
} catch (err) {
  logger.error('[PageName] operation name:', err)
  toast.error(toUserFacingErrorMessage(err, 'Something went wrong. Please try again.'))
}
```

The `toUserFacingErrorMessage` helper:
- Returns `err.message` if `err` is a `UserFacingError`
- Returns the `fallback` string for all other errors
- Never exposes raw Supabase or payment error messages to the user

---

## Adding a New Service File

1. Create `frontend/src/services/yourFeatureApi.ts`
2. Import `supabase` from `'../lib/supabase'`
3. Import `UserFacingError` from `'../utils/userFacingError'` if wrapping auth errors
4. Export named API objects and types (no default export)
5. Add an entry to this README table above
6. Add usage examples to `docs/API_REFERENCE.md`

```typescript
// Template for a new service file:
import { supabase } from '../lib/supabase'

export interface YourEntity {
  id: string
  // ...fields
  created_at?: string
}

export const yourEntityApi = {
  async getAll(): Promise<YourEntity[]> {
    const { data, error } = await supabase
      .from('your_table')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data as YourEntity[]) || []
  },
  // ... more methods
}
```
