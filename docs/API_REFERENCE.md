# TruckOpti API Reference

> **Production**: https://www.truckopti.in  
> **Supabase Project**: `jbxncejtcbpcronndqlx`  
> **Stack**: React 18 + TypeScript + Supabase JS SDK v2  
> **Last Updated**: April 2026

---

## Table of Contents

1. [Database Tables](#database-tables)
2. [Service API: Trucks](#service-api-truckssupabaseapi)
3. [Service API: Cartons](#service-api-cartonssupabaseapi)
4. [Service API: Customers](#service-api-customerssupabaseapi)
5. [Service API: Shipments](#service-api-shipmentssupabaseapi)
6. [Service API: Routes](#service-api-routessupabaseapi)
7. [Service API: Packing Results](#service-api-packingsupabaseapi)
8. [Service API: Packing Jobs](#service-api-packingjobssupabaseapi)
9. [Service API: Auth](#service-api-authsupabaseapi)
10. [Service API: Subscriptions](#service-api-subscriptionapi)
11. [Service API: Contact Inquiries](#service-api-contactinquiry)
12. [Payment Services](#payment-services)
13. [RPC Functions](#rpc-functions)
14. [Error Handling Contract](#error-handling-contract)

---

## Database Tables

All tables live in the `public` schema of the Supabase PostgreSQL database.

### `users`
| Property | Value |
|----------|-------|
| Purpose | Extends `auth.users` with app-specific profile data and role assignment |
| RLS | `auth.uid() = id` — users can only read/update their own row |
| Primary key | `id uuid` (mirrors `auth.users.id`) |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | FK → `auth.users.id` |
| `role` | `text` | `'user' \| 'driver' \| 'agency' \| 'admin'` |
| `login_id` | `text` | Optional short login alias (e.g. `TRK-001`) |
| `name` | `text` | Display name |
| `phone` | `text` | Normalized E.164 phone |
| `phone_verified` | `boolean` | Set after OTP confirmation |
| `google_linked` | `boolean` | True if Google OAuth was used |
| `profile_picture` | `text` | Storage URL |

---

### `subscriptions`
| Property | Value |
|----------|-------|
| Purpose | Tracks each user's active plan, billing cycle, and usage period |
| RLS | `auth.uid() = user_id` |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `plan_id` | `uuid` | FK → `subscription_plans.id` |
| `status` | `text` | `'active' \| 'paused' \| 'cancelled' \| 'expired' \| 'trial'` |
| `billing_cycle` | `text` | `'monthly' \| 'yearly'` |
| `current_period_start` | `timestamptz` | |
| `current_period_end` | `timestamptz` | |
| `trial_end` | `timestamptz` | Nullable; set for new signups |
| `cancel_at_period_end` | `boolean` | If true, cancels at period end |
| `razorpay_subscription_id` | `text` | Nullable; only when Razorpay subscription is used |

---

### `subscription_plans`
| Property | Value |
|----------|-------|
| Purpose | Plan catalog — 4 tiers: Starter, Growth, Professional, Enterprise |
| RLS | Public read; admin write |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `tier` | `text` | `'starter' \| 'growth' \| 'professional' \| 'enterprise'` |
| `price_monthly` | `numeric` | INR, monthly price |
| `price_yearly` | `numeric` | INR, yearly price |
| `trucks_limit` | `int` | -1 = unlimited |
| `shipments_monthly` | `int` | Monthly shipment quota |
| `features` | `jsonb` | Array of feature description strings |
| `is_active` | `boolean` | False = hidden from pricing page |

---

### `transport_agencies`
| Property | Value |
|----------|-------|
| Purpose | Agency profile — registered transport companies using the dispatch portal |
| RLS | `auth.uid() = user_id` |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id` (owner) |
| `name` | `text` | Company name |
| `gstin` | `text` | GST number |
| `address` | `text` | |
| `city` | `text` | |
| `state` | `text` | |

---

### `drivers`
| Property | Value |
|----------|-------|
| Purpose | Driver profile, vehicle info, wallet balance, and document status |
| RLS | `auth.uid() = user_id` |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `agency_id` | `uuid` | Nullable; FK → `transport_agencies.id` (if employed) |
| `name` | `text` | |
| `phone` | `text` | |
| `vehicle_number` | `text` | License plate |
| `wallet_balance` | `numeric` | INR; incremented on delivery |
| `status` | `text` | `'active' \| 'inactive' \| 'suspended'` |

---

### `agency_jobs`
| Property | Value |
|----------|-------|
| Purpose | Central dispatch record — links a shipment request to an agency for fulfillment |
| RLS | Scoped via `agency_id`; driver and customer can read their own jobs |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `agency_id` | `uuid` | FK → `transport_agencies.id` |
| `shipment_id` | `uuid` | FK → `shipments.id` |
| `driver_id` | `uuid` | Nullable; assigned after acceptance |
| `truck_id` | `uuid` | Nullable; FK → `agency_trucks.id` |
| `status` | `text` | `'pending' \| 'accepted' \| 'assigned' \| 'in_transit' \| 'delivered' \| 'cancelled'` |
| `pickup_otp` | `text` | 4-digit OTP for pickup confirmation |
| `delivery_otp` | `text` | 4-digit OTP for delivery confirmation |

---

### `job_offers`
| Property | Value |
|----------|-------|
| Purpose | Per-driver trip record — OTPs, proof photos, GPS milestones, and 7-step delivery flow |
| RLS | Shipment stakeholder read; agency/driver managed |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `job_id` | `uuid` | FK → `agency_jobs.id` |
| `driver_id` | `uuid` | FK → `drivers.id` |
| `step` | `int` | 1–7 trip step |
| `pickup_otp_verified` | `boolean` | |
| `delivery_otp_verified` | `boolean` | |
| `proof_photo_url` | `text` | Storage URL for delivery proof |

---

### `driver_locations`
| Property | Value |
|----------|-------|
| Purpose | Live GPS feed — updated by driver app, read by agency/customer/admin tracking |
| RLS | Driver write own row; shipment stakeholders read |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `driver_id` | `uuid` | PK / FK → `drivers.id` |
| `latitude` | `float8` | |
| `longitude` | `float8` | |
| `updated_at` | `timestamptz` | |

---

### `agency_trucks`
| Property | Value |
|----------|-------|
| Purpose | Fleet management — trucks registered under an agency |
| RLS | Agency-scoped |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `agency_id` | `uuid` | FK → `transport_agencies.id` |
| `number_plate` | `text` | |
| `truck_type` | `text` | e.g. `'14ft'`, `'22ft'` |
| `capacity_kg` | `numeric` | |
| `status` | `text` | `'available' \| 'on_trip' \| 'maintenance'` |

---

### `shipments`
| Property | Value |
|----------|-------|
| Purpose | Core booking record — origin, destination, cargo, status, and document numbers |
| RLS | ⚠️ **BUG-RLS-002**: `USING (true)` — cross-tenant exposure. Fix required before production. |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `shipment_id` | `text` | Human-readable ID (e.g. `SHP-2024-001`) |
| `customer_id` | `uuid` | Nullable; FK → `customers.id` |
| `created_by` | `uuid` | FK → `auth.users.id` |
| `truck_id` | `uuid` | FK → `trucks.id` |
| `invoice_number` | `text` | Auto-generated via RPC |
| `lr_number` | `text` | Lorry receipt number; auto-generated via RPC |
| `origin` | `text` | |
| `destination` | `text` | |
| `status` | `text` | `'pending' \| 'in_transit' \| 'delivered' \| 'cancelled'` |
| `total_weight` | `numeric` | kg |
| `estimated_cost` | `numeric` | INR |
| `latitude` | `float8` | Live location; nullable |
| `longitude` | `float8` | Live location; nullable |

---

### `customers`
| Property | Value |
|----------|-------|
| Purpose | Customer master — used for invoice generation and repeat booking |
| RLS | ⚠️ **BUG-RLS-001**: `USING (true)` — fix required |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `name` | `text` | |
| `phone` | `text` | |
| `pan_number` | `text` | Required for invoices |
| `gst_number` | `text` | Nullable |
| `city` | `text` | |
| `created_by` | `uuid` | FK → `auth.users.id` |

---

### `trucks`
| Property | Value |
|----------|-------|
| Purpose | Platform truck catalog — vehicle specs used in packing optimization |
| RLS | Public read; ⚠️ **BUG-RLS-005**: `USING (true)` for UPDATE/DELETE |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `name` | `text` | English name |
| `name_hi` | `text` | Hindi name |
| `length` \| `width` \| `height` | `numeric` | Dimensions in feet |
| `capacity` | `numeric` | Max load in kg |
| `cost_per_km` | `numeric` | INR/km for route costing |
| `available` | `boolean` | |

---

### `cartons`
| Property | Value |
|----------|-------|
| Purpose | Carton/box specs used in 3D packing algorithm |
| RLS | Public read; ⚠️ **BUG-RLS-006**: `USING (true)` for UPDATE/DELETE |

---

### `routes`
| Property | Value |
|----------|-------|
| Purpose | Saved logistics routes with cost/time breakdowns |
| RLS | ⚠️ **BUG-RLS-003**: `USING (true)` — fix required |

---

### `packing_results`
| Property | Value |
|----------|-------|
| Purpose | Stores results of the 3D bin-packing algorithm runs |
| RLS | ⚠️ **BUG-RLS-004**: `USING (true)` — fix required |

---

### `contact_inquiries`
| Property | Value |
|----------|-------|
| Purpose | Contact form submissions with deduplication |
| RLS | Public INSERT; admin read/update only |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `client_submission_id` | `uuid` | Client-generated UUID for idempotent dedup |
| `name` \| `email` \| `phone` | `text` | |
| `subject` \| `message` | `text` | |
| `status` | `text` | `'pending' \| 'read' \| 'replied'` |

---

### `payment_history`
| Property | Value |
|----------|-------|
| Purpose | Unified payment log for Razorpay and PhonePe transactions |
| RLS | `auth.uid() = user_id` |

Key columns:
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` | PK |
| `user_id` | `uuid` | FK → `auth.users.id` |
| `provider` | `text` | `'razorpay' \| 'phonepe'` |
| `provider_order_id` | `text` | Reused for both providers |
| `status` | `text` | `'pending' \| 'success' \| 'failed' \| 'refunded'` |
| `amount` | `numeric` | INR (not paise) |
| `plan_id` | `uuid` | FK → `subscription_plans.id` |

---

## Service API: `trucksSupabaseApi`

**File**: `frontend/src/services/supabaseApi.ts`  
**Table**: `trucks`

```typescript
import { trucksSupabaseApi } from '../services/supabaseApi'
```

### `trucksSupabaseApi.getAll()`
Returns all trucks ordered by name.
```typescript
const trucks: Truck[] = await trucksSupabaseApi.getAll()
```
- **Returns**: `Truck[]`
- **Throws**: Supabase `PostgrestError` on failure

### `trucksSupabaseApi.getById(id)`
Fetch a single truck by UUID.
```typescript
const truck: Truck | null = await trucksSupabaseApi.getById('uuid-here')
```
- **Params**: `id: string`
- **Returns**: `Truck | null`

### `trucksSupabaseApi.create(truck)`
Insert a new truck record.
```typescript
const created = await trucksSupabaseApi.create({
  name: 'Tata 407', name_hi: 'टाटा 407',
  length: 14, width: 7, height: 6,
  capacity: 2500, cost_per_km: 18, available: true
})
```
- **Params**: `Omit<Truck, 'id' | 'created_at' | 'updated_at'>`
- **Returns**: `Truck`

### `trucksSupabaseApi.update(id, data)`
Partially update a truck record.
- **Params**: `id: string`, `data: Partial<Truck>`
- **Returns**: `Truck`

### `trucksSupabaseApi.delete(id)`
Delete a truck by UUID. Throws on foreign-key constraint violations.
- **Params**: `id: string`
- **Returns**: `void`

---

## Service API: `cartonsSupabaseApi`

**Table**: `cartons`  
Same CRUD shape as `trucksSupabaseApi`: `getAll`, `getById`, `create`, `update`, `delete`.

```typescript
const carton = await cartonsSupabaseApi.create({
  name: 'Standard Medium', length: 40, width: 30, height: 25,
  weight: 15, fragile: false, stackable: true
})
```

---

## Service API: `customersSupabaseApi`

**Table**: `customers`

### `customersSupabaseApi.search(query)`
Full-text style search across name, phone, and city.
```typescript
const results = await customersSupabaseApi.search('Mumbai')
// Uses .or(`name.ilike.%q%,phone.ilike.%q%,city.ilike.%q%`)
```
- **Params**: `query: string`
- **Returns**: `Customer[]`

All standard CRUD methods (`getAll`, `getById`, `create`, `update`, `delete`) follow the same pattern as trucks.

---

## Service API: `shipmentsSupabaseApi`

**Table**: `shipments`

### `shipmentsSupabaseApi.getAll(filters?)`
Fetch shipments, optionally filtered by status.
```typescript
const pending = await shipmentsSupabaseApi.getAll({ status: 'pending' })
```
- **Params**: `filters?: { status?: 'pending' | 'in_transit' | 'delivered' | 'cancelled' }`
- **Returns**: `Shipment[]` ordered by `created_at DESC`

### `shipmentsSupabaseApi.ensureDocumentNumbers(id)`
Calls the Postgres RPC `ensure_shipment_document_numbers` to generate and persist `invoice_number` and `lr_number` if not already set.
```typescript
const { invoice_number, lr_number } = await shipmentsSupabaseApi.ensureDocumentNumbers(shipmentId)
```
- **Returns**: `Pick<Shipment, 'invoice_number' | 'lr_number'>`
- **Note**: Must be called before rendering the invoice page.

### `shipmentsSupabaseApi.updateStatus(id, status)`
```typescript
await shipmentsSupabaseApi.updateStatus(id, 'in_transit')
```

### `shipmentsSupabaseApi.updateLocation(id, lat, lng)`
Updates the live GPS position on a shipment row.
```typescript
await shipmentsSupabaseApi.updateLocation(id, 19.076, 72.877)
```

---

## Service API: `routesSupabaseApi`

**Table**: `routes`  
Standard CRUD: `getAll`, `getById`, `create`, `update`, `delete`.

```typescript
const route = await routesSupabaseApi.create({
  name: 'Mumbai → Pune',
  start_location: 'Mumbai',
  destinations: ['Pune'],
  total_distance: 148, total_time: 180, total_cost: 4200,
  toll_cost: 320, fuel_cost: 1800,
  status: 'planned'
})
```

---

## Service API: `packingSupabaseApi`

**Table**: `packing_results`

### `packingSupabaseApi.saveResult(result)`
Persist a completed packing algorithm run.
```typescript
await packingSupabaseApi.saveResult({
  shipment_id: null, truck_id: truckId,
  algorithm: 'guillotine', items_packed: 12,
  total_items: 14, volume_utilization: 0.84,
  weight_utilization: 0.71, packed_boxes: [...], unfit_items: []
})
```

### `packingSupabaseApi.getHistory(limit?)`
Retrieve recent packing runs.
```typescript
const history = await packingSupabaseApi.getHistory(5)
```
- **Default limit**: 10

---

## Service API: `packingJobsSupabaseApi`

**Tables**: `packing_jobs`, `packing_items`

### `packingJobsSupabaseApi.createJob(job)`
Create a packing optimization job.

### `packingJobsSupabaseApi.addJobItems(items)`
Bulk-insert items associated with a job.

### `packingJobsSupabaseApi.getUserJobs(limit?)`
Fetch the authenticated user's packing job history. Throws if not authenticated.

### `packingJobsSupabaseApi.getJobItems(jobId)`
Retrieve all items for a given job.

### `packingJobsSupabaseApi.updateJob(id, data)`
Update job status or result fields.

### `packingJobsSupabaseApi.deleteJob(id)`
Deletes the job and all associated items (cascades manually via service layer).

---

## Service API: `authSupabaseApi`

**File**: `frontend/src/services/supabaseApi.ts`  
**Note**: All auth methods wrap Supabase Auth and throw `UserFacingError` — safe to display in UI toasts.

### `authSupabaseApi.signInWithEmail(email)`
Sends a magic-link / OTP to existing users only (`shouldCreateUser: false`).
```typescript
await authSupabaseApi.signInWithEmail('user@example.com')
```

### `authSupabaseApi.signUpWithEmail(email, name?)`
Sends a signup OTP. Creates user if not found (`shouldCreateUser: true`).

### `authSupabaseApi.signInWithEmailPassword(identifier, password)`
Accepts email OR short login ID (calls `resolve_login_identifier` RPC for non-email identifiers).
```typescript
await authSupabaseApi.signInWithEmailPassword('TRK-001', 'password')
```

### `authSupabaseApi.signUpWithEmailPassword(email, password, name?)`
Creates a new password-based account.

### `authSupabaseApi.verifyEmailOtp(email, token)`
Verifies a 6-digit OTP received by email.

### `authSupabaseApi.verifyPhoneOtp(phone, token)`
Verifies a 6-digit SMS OTP only when phone OTP is intentionally re-enabled.
Launch default remains Email OTP + Google OAuth; Twilio-backed phone OTP stays
deferred behind `VITE_AUTH_PHONE_OTP_ENABLED=true`.

### `authSupabaseApi.signInWithGoogle()`
Redirects to Google OAuth. Callback handled at `/auth/callback`.

### `authSupabaseApi.signInWithPhone(phone, channel?)`
Optional feature. Sends SMS/WhatsApp OTP only when phone OTP is enabled and
Twilio is configured; otherwise the shipped launch path is Email OTP + Google OAuth.

### `authSupabaseApi.resetPasswordForEmail(identifier)`
Sends password reset email. Silent no-op if email not found (security best practice).

### `authSupabaseApi.updatePassword(password)`
Updates the authenticated user's password.

### `authSupabaseApi.signOut()`
Clears the Supabase session.

### `authSupabaseApi.getUser()`
Returns the server-verified user object (uses `auth.getUser()`, not `getSession()`).

---

## Service API: `subscriptionApi`

**File**: `frontend/src/services/subscriptionApi.ts`  
**Tables**: `subscription_plans`, `subscriptions`, `payment_history`

### `subscriptionPlansApi.getAll()`
Returns all active plans ordered by monthly price ascending.
```typescript
const plans = await subscriptionPlansApi.getAll()
// features field is parsed from JSONB to string[]
```

### `subscriptionPlansApi.getByTier(tier)`
```typescript
const pro = await subscriptionPlansApi.getByTier('professional')
```

### `subscriptionPlansApi.getById(id)`
Returns a single plan or `null`.

### `userSubscriptionApi.getCurrent()`
Fetch the authenticated user's current subscription with plan details.
```typescript
const sub = await userSubscriptionApi.getCurrent()
// Returns Subscription & { plan: SubscriptionPlan } | null
```

### `userSubscriptionApi.create(planId, billingCycle)`
Create a new subscription record (called after successful payment).

### `userSubscriptionApi.cancel()`
Marks `cancel_at_period_end = true`.

### `paymentHistoryApi.create(record)`
Insert a payment record after initiating checkout.

### `paymentHistoryApi.updateStatus(id, status)`
Update payment status after provider webhook/callback.

### `paymentHistoryApi.getUserHistory(limit?)`
Returns the authenticated user's payment records.

---

## Service API: `contactInquiry`

**File**: `frontend/src/services/contactInquiry.ts`  
**Table**: `contact_inquiries`  

This service provides offline-resilient contact form submission with localStorage persistence.

### `getStoredContactDraft()`
Returns any saved draft from `localStorage` (key: `truckopti:contact-draft`).
```typescript
const draft = getStoredContactDraft() // ContactInquiryPayload | null
```

### `getPendingContactInquiry()`
Returns a previously attempted submission that failed (key: `truckopti:contact-pending`).
```typescript
const pending = getPendingContactInquiry() // StoredContactInquiry | null
```

### `saveContactDraft(payload)`
Persists form state to localStorage for recovery on page reload.

### `clearContactDraft()`
Removes the draft from localStorage.

### `submitContactInquiry(payload)`
Submits the inquiry to `contact_inquiries` table. Uses `client_submission_id` for idempotent deduplication — safe to retry on network failure.
```typescript
await submitContactInquiry({
  name: 'Rajesh Kumar', email: 'raj@example.com',
  phone: '+919876543210', subject: 'Partnership',
  message: 'Interested in enterprise plan'
})
```

### `retryPendingContactInquiry()`
Retrieves any stored pending inquiry and re-submits it. Returns `true` on success.

---

## Payment Services

### `razorpayPayment.ts`

**Config env vars**: `VITE_RAZORPAY_KEY_ID`

```typescript
import { initiateRazorpayPayment } from '../services/razorpayPayment'

const result: RazorpayPaymentResult = await initiateRazorpayPayment({
  amount: 99900,          // in paise (₹999)
  description: 'TruckOpti Pro Monthly',
  customerName: 'Rajesh Kumar',
  customerEmail: 'raj@example.com',
  customerPhone: '+919876543210',
  userId: user.id,
  planId: plan.id,
  billingCycle: 'monthly'
})

if (result.success) {
  // result.paymentId, result.orderId, result.signature
}
```

- Dynamically loads Razorpay JS SDK from CDN
- Payment verification must happen server-side via Supabase Edge Function
- Test mode auto-detected from key prefix (`rzp_test_`)
- On live site (`truckopti.in`), rejects test keys at runtime

---

### `phonepePayment.ts`

**Config env vars**: `VITE_PHONEPE_MERCHANT_ID`, `VITE_PHONEPE_API_URL`, `VITE_APP_URL`

```typescript
import { initiatePhonePePayment } from '../services/phonepePayment'

const result = await initiatePhonePePayment({
  amount: 99900,       // in paise
  orderId: 'ORDER-123',
  userId: user.id,
  planId: plan.id,
  billingCycle: 'monthly',
  customerPhone: '+919876543210'
})
```

- Checksum generation happens server-side via Supabase Edge Function (never in browser)
- Redirect URL is validated against `ALLOWED_PHONEPE_DOMAINS` whitelist before use
- On non-production domains, rejects production API URL to prevent accidental live charges

---

## RPC Functions

| Function | Called by | Purpose |
|----------|-----------|---------|
| `resolve_login_identifier(p_identifier)` | `authSupabaseApi.signInWithEmailPassword` | Resolves short login IDs (e.g. `TRK-001`) to email |
| `ensure_shipment_document_numbers(p_shipment_id)` | `shipmentsSupabaseApi.ensureDocumentNumbers` | Generates and persists `invoice_number` + `lr_number` atomically |

---

## Error Handling Contract

All service functions follow this contract:

1. **Auth errors** are wrapped in `UserFacingError` — always safe to render in a toast
2. **Data errors** re-throw the raw `PostgrestError` from Supabase — log and show a generic toast
3. **Network errors** are mapped to friendly messages by `getSafeAuthFailureMessage()`
4. **Never** show raw `error.message` from Supabase or payment providers in the UI

```typescript
// Correct pattern in page components:
import { toUserFacingErrorMessage } from '../utils/userFacingError'

try {
  const data = await someServiceFunction()
} catch (err) {
  toast.error(toUserFacingErrorMessage(err, 'Something went wrong. Please try again.'))
  logger.error('[PageName] operation:', err)
}
```
