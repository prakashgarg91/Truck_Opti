# SECURITY.md — TruckOpti Security Safeguards

> **Audience**: Every AI agent (Claude, GPT, Gemini, etc.) working on TruckOpti.  
> **Status**: Living document. Update when new bug classes are discovered.  
> **Severity codes**: 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## 1. WHY THIS DOCUMENT EXISTS

AI-generated code has well-documented failure modes around security. Claude 3.x, GPT-4, and similar models routinely produce:

- Row-Level Security policies that grant full table access to all authenticated users (`USING (true)`)
- Redirect logic that forwards users to URLs contained in API responses, without domain validation
- Payment webhooks that process callbacks without verifying the event origin (no HMAC)
- File-upload handlers that trust the `Content-Type` header sent by the client
- Constants that are defined but then silently bypassed with hardcoded literals (the BUG-020 pattern)
- Error messages that leak stack traces or raw DB errors to the frontend

**Every one of these has already occurred in this codebase.** This document is the mandatory checklist that prevents recurrence.

---

## 2. KNOWN ACTIVE VULNERABILITIES (open bugs)

These have been found but are NOT yet fixed in migration files. Any agent working on auth, data access, or schema MUST address these before shipping:

| ID | Table / File | Vulnerability | Severity |
|----|------|------|----------|
| BUG-RLS-001 | `customers` (base_schema.sql:158) | `USING (true)` on SELECT, UPDATE, DELETE — every authenticated user can read and modify every other user's customers | 🔴 Critical |
| BUG-RLS-002 | `shipments` (base_schema.sql:164) | `USING (true)` on SELECT, UPDATE — cross-tenant shipment exposure | 🔴 Critical |
| BUG-RLS-003 | `routes` (base_schema.sql:169) | `USING (true)` on SELECT, UPDATE, DELETE — cross-tenant route exposure | 🔴 Critical |
| BUG-RLS-004 | `packing_results` (base_schema.sql:175) | `USING (true)` on SELECT — any user can see any user's packing calculations | 🟠 High |
| BUG-RLS-005 | `trucks` (base_schema.sql + production_setup.sql) | `USING (true)` on UPDATE, DELETE — any authenticated user deletes any truck record | 🟠 High |
| BUG-RLS-006 | `cartons` (base_schema.sql + production_setup.sql) | `USING (true)` on UPDATE, DELETE — any authenticated user deletes any carton record | 🟠 High |
| BUG-REDIRECT-001 | `CheckoutPage.tsx:113` | `window.location.href = phonePeResult.data.instrumentResponse.redirectInfo.url` — open redirect; no domain validation on URL from payment API response | 🟠 High |
| BUG-WEBHOOK-001 | (Razorpay webhook — not yet implemented) | No HMAC-SHA256 `x-razorpay-signature` verification before processing payment event | 🔴 Critical |

**Root cause of BUG-RLS-001 through -004**: The `customers`, `shipments`, `routes`, and `packing_results` tables have no ownership column (`user_id`, `agency_id`, `created_by`). Before RLS can be scoped correctly, a `created_by UUID REFERENCES auth.users(id)` column must be added and backfilled. See Section 4 for the correct pattern.

---

## 3. RULE REFERENCE (quick card)

### 3.1 Supabase Row-Level Security

#### ❌ FORBIDDEN — never generate these

```sql
-- Grants all authenticated users full read/write on entire table
CREATE POLICY "users can read X" ON my_table FOR SELECT TO authenticated USING (true);
CREATE POLICY "users can update X" ON my_table FOR UPDATE TO authenticated USING (true);
CREATE POLICY "users can delete X" ON my_table FOR DELETE TO authenticated USING (true);
```

#### ✅ REQUIRED — always scope to the owning user

```sql
-- User owns their own rows
CREATE POLICY "user reads own X" ON my_table
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user modifies own X" ON my_table
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user deletes own X" ON my_table
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);
```

#### ✅ LEGITIMATE uses of `USING (true)`

Only for **public, read-only reference data** that has no privacy implications:

```sql
-- Pricing plans visible to all (intentional — not user data)
CREATE POLICY "Anyone can read plans" ON subscription_plans FOR SELECT USING (true);

-- Reference catalog data (truck types, carton specs)
CREATE POLICY "Public read access for trucks" ON trucks FOR SELECT USING (true);
```

Multi-tenant data (agency jobs, driver assignments, customer records, shipments, routes) **MUST** use ownership-scoped policies.

#### ✅ REQUIRED — every new table needs RLS enabled

```sql
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
-- Then explicit policies for each operation needed
```

If no policy is created, the table defaults to **deny all**. Never leave tables without RLS enabled.

---

### 3.2 Open Redirects

#### ❌ FORBIDDEN

```typescript
// Redirecting to a URL from an external API without validation
window.location.href = apiResponse.data.redirectUrl;
router.replace(userInputtedRedirectParam);
```

#### ✅ REQUIRED — validate the domain allowlist

```typescript
const ALLOWED_REDIRECT_DOMAINS = [
  'api.phonepe.com',
  'mercury.phonepe.com',
  'api-preprod.phonepe.com',
  'checkout.razorpay.com',
];

function isSafeRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      ALLOWED_REDIRECT_DOMAINS.some(
        (domain) => parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      )
    );
  } catch {
    return false;
  }
}

// Before any redirect that comes from external data:
if (!isSafeRedirectUrl(phonePeResult.data.instrumentResponse.redirectInfo.url)) {
  throw new Error('Payment redirect URL failed domain validation');
}
window.location.href = phonePeResult.data.instrumentResponse.redirectInfo.url;
```

**Applies to**: `CheckoutPage.tsx` (BUG-REDIRECT-001), any future payment integration, any `?redirect=` query parameter.

---

### 3.3 Payment Webhook HMAC Verification

**Context**: Razorpay (and PhonePe) send a signature header. An attacker can POST fake `payment.captured` events if verification is skipped.

#### ❌ FORBIDDEN

```typescript
// Processing the event without verifying the signature
export async function POST(request: Request) {
  const body = await request.json();
  if (body.event === 'payment.captured') {
    await activateSubscription(body.payload.payment.entity.notes.userId);
  }
}
```

#### ✅ REQUIRED — verify HMAC-SHA256 before processing

```typescript
import crypto from 'crypto';

export async function POST(request: Request) {
  const rawBody = await request.text();              // must be raw bytes, not parsed JSON
  const signature = request.headers.get('x-razorpay-signature');
  const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');

  if (!signature || !webhookSecret) {
    return new Response('Forbidden', { status: 403 });
  }

  const expectedSig = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison prevents timing attacks
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
    return new Response('Forbidden', { status: 403 });
  }

  const event = JSON.parse(rawBody);
  // Safe to process now
}
```

**Key rule**: Parse the body from raw text AFTER validation, never before. Same pattern applies for PhonePe's `x-verify` header.

---

### 3.4 File Uploads (Driver Documents — BATCH12 Task 3)

#### ❌ FORBIDDEN

```typescript
// Trust Content-Type from client
const mime = file.type;                         // Client-supplied, trivially spoofed
const fileName = formData.get('filename');      // User-controlled filename
const path = `uploads/${fileName}`;              // Path traversal risk
```

#### ✅ REQUIRED

```typescript
// 1. Allowlist of MIME types (check file magic bytes on server if possible)
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// 2. Enforce on both client (UX) and server (security)
if (!ALLOWED_MIME_TYPES.includes(file.type)) throw new Error('Invalid file type');
if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('File too large');

// 3. Never use user-supplied filenames — construct deterministic paths
const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
const storagePath = `driver-docs/${driverId}/${docType}.${ext}`;
//                                 ^^^^^^^^ auth.uid(), not user input

await supabase.storage.from('driver-documents').upload(storagePath, file, {
  contentType: file.type,
  upsert: true,
});
```

**Supabase Storage bucket policy** must also restrict uploads:

```sql
-- Only the owning driver can upload to their own folder
CREATE POLICY "driver uploads own docs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

---

### 3.5 Secret and Environment Variable Management

#### ❌ FORBIDDEN

```typescript
// Secrets in source files
const RAZORPAY_KEY = 'rzp_live_xxxxxxxxxxxxxxxx';
const SUPABASE_SERVICE_KEY = 'eyJhb...';
```

```bash
# VITE_ prefix = bundled into client JS = PUBLIC
VITE_RAZORPAY_SECRET=rzp_live_xxx   # ← exposes live secret to every browser
```

#### ✅ REQUIRED

| Secret type | Where to store | Access pattern |
|---|---|---|
| Razorpay key/secret | `heroku config:set` | `process.env.RAZORPAY_KEY_SECRET` (server only) |
| Razorpay webhook secret | `heroku config:set` | `process.env.RAZORPAY_WEBHOOK_SECRET` (server only) |
| PhonePe merchant secret | `heroku config:set` | `process.env.PHONEPE_MERCHANT_SECRET` (server only) |
| Supabase service_role key | `heroku config:set` | `process.env.SUPABASE_SERVICE_ROLE_KEY` (server only) |
| Supabase anon key | `VITE_SUPABASE_ANON_KEY` | Public — safe only because RLS is enforced |

**Never commit** `.env`, `.env.local`, `.env.production` files containing live secrets. Use `.gitignore` (already present).

---

### 3.6 Don't Leak Internal Errors to the Frontend

#### ❌ FORBIDDEN

```typescript
// Full Supabase/Postgres error forwarded to React UI
const { error } = await supabase.from('subscriptions').insert(payload);
toast.error(error.message);  // May contain table names, column names, constraint names
```

#### ✅ REQUIRED

```typescript
const { error } = await supabase.from('subscriptions').insert(payload);
if (error) {
  console.error('[subscription insert]', error);      // Log internally
  toast.error('Failed to save subscription. Please try again.');  // Generic to user
}
```

---

### 3.7 XSS Prevention

#### ❌ ABSOLUTELY FORBIDDEN

```tsx
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

`dangerouslySetInnerHTML` is banned in this codebase. Use React's normal JSX rendering for all user-supplied content — React escapes it automatically. **Current status**: zero instances found ✅

No `eval()`, `new Function()`, or `document.write()` allowed.

---

### 3.8 Constants Must Not Be Bypassed (the BUG-020 pattern)

**History**: `AgencyBillingPage.tsx` defined `GST_RATE = 0.05` but `generateInvoice()` hardcoded `0.18`. Fixed in v50.

#### ❌ FORBIDDEN

```typescript
const GST_RATE = 0.05;

function calculateTax(amount: number) {
  return amount * 0.18;   // ← ignores the constant
}
```

#### ✅ REQUIRED

```typescript
const GST_RATE = 0.05;

function calculateTax(amount: number) {
  return amount * GST_RATE;
}
```

**Rule**: Any numeric business rule (tax rate, commission %, late fee, minimum fare) MUST be defined as a named constant OR fetched from the database. Inline literals for business rules are forbidden.

---

## 4. SCHEMA SECURITY — ARCHITECTURE RULES

### 4.1 Every user-data table MUST have an ownership column

Before creating a new table that stores per-user or per-agency data:

```sql
CREATE TABLE new_resource (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- REQUIRED: ties this row to an owner
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- or for agency-owned:
  agency_id UUID NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  -- ... other columns
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE new_resource ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner reads own" ON new_resource
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "owner inserts own" ON new_resource
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner updates own" ON new_resource
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner deletes own" ON new_resource
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

### 4.2 The `customers`, `shipments`, `routes`, `packing_results` tables are BROKEN

These tables in `base_schema.sql` have no `user_id` ownership column. Before any feature that exposes this data to multi-tenant users:

1. Add migration: `ALTER TABLE customers ADD COLUMN created_by UUID REFERENCES auth.users(id);`
2. Drop the `USING (true)` policies
3. Create ownership-scoped policies using `created_by`

**Until this is fixed, these tables are shared across ALL authenticated users.** No new feature should reference these tables in a context where data isolation matters.

---

## 5. AUTHENTICATION RULES

### 5.1 Rate limiting on OTP/auth flows

Supabase Auth has built-in rate limits, but application-level flows must not call `signInWithOtp()` in a loop or without exponential backoff in the UI. See `OtpVerificationPage.tsx` — the resend button must have a cooldown timer (already implemented). Do not remove it.

### 5.2 Role checks must use database role, not local state

```typescript
// ❌ WRONG — role from localStorage or client-side state can be tampered with
if (localStorage.getItem('role') === 'admin') { showAdminPanel(); }

// ✅ CORRECT — role from authenticated Supabase user profile
const { data: profile } = await supabase
  .from('users')
  .select('role')
  .eq('id', user.id)
  .single();
if (profile?.role === 'admin') { showAdminPanel(); }
```

---

## 6. AI AGENT INSECURE DEFAULTS — CHECKLIST

Print this mentally before every code generation:

| # | Pattern to check | Safe? | Notes |
|---|------|-----|-------|
| 1 | Does any new RLS policy use `USING (true)` on a user-data table? | ❌ Stop | Rewrite with `auth.uid() = owner_col` |
| 2 | Does new code redirect to a URL from an API response or user input? | ❌ Stop | Add domain allowlist check first |
| 3 | Does a new webhook handler read the body BEFORE verifying HMAC? | ❌ Stop | Verify first, parse after |
| 4 | Does a new file upload trust `file.type` without size/extension enforcement? | ❌ Stop | Add allowlist + size cap |
| 5 | Does a new function hardcode a value that already has a named constant? | ❌ Stop | Use the constant |
| 6 | Does error handling forward `error.message` from Supabase to the UI? | ❌ Stop | Log internally, show generic message |
| 7 | Does any JSX render user content via `dangerouslySetInnerHTML`? | ❌ Stop | Use React JSX rendering |
| 8 | Does any backend file contain a live API secret? | ❌ Stop | Move to Heroku Config Vars |
| 9 | Is RLS enabled on every new table? | Check | Run `ALTER TABLE … ENABLE ROW LEVEL SECURITY` |
| 10 | Does a new table store user data but have no `user_id`/`agency_id` column? | ❌ Stop | Add ownership FK before writing policies |

---

## 7. SECURITY REVIEW GATES

Before any BATCH is marked complete, the judge must verify:

- [ ] No new `USING (true)` on user-owned tables
- [ ] No new external URL redirect without domain validation
- [ ] New webhooks include HMAC verification
- [ ] New file uploads enforce MIME type allowlist and size limit
- [ ] No raw Supabase errors returned to the client
- [ ] No secrets in source files or `VITE_` environment variables
- [ ] Every new table has `ENABLE ROW LEVEL SECURITY` + scoped policies

---

## 8. REFERENCES

- OWASP Top 10 (2021): A01 Broken Access Control, A03 Injection, A05 Security Misconfiguration, A07 Identification and Authentication Failures
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Razorpay Webhook Signature Verification](https://razorpay.com/docs/webhooks/validate-test/)
- [PhonePe Payment Gateway Integration](https://developer.phonepe.com/v1/docs)

---

*Last updated: BATCH12 prep — security audit by judge (Claude Sonnet 4.6)*
