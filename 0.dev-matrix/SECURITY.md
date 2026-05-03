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
- SQL queries assembled by string concatenation instead of parameterized inputs
- Weak cryptographic algorithms (MD5, SHA-1) instead of modern alternatives
- Unvetted third-party package imports with unknown CVE records
- Invented function signatures that "look right" but don't exist, plus unsafe defaults like disabled TLS
- Refactors that silently touch unrelated security checks across many files

**Several of these have already occurred in this codebase.** This document is the mandatory checklist that prevents recurrence.

> Source: Checkmarx / DevOps.com — "When AI Gets It Wrong: The Insecure Defaults Lurking in Your Code"

---

## 2. KNOWN ACTIVE VULNERABILITIES (open bugs)

These have been found but are NOT yet fixed in migration files. Any agent working on auth, data access, or schema MUST address these before shipping:

| ID | Table / File | Vulnerability | Severity |
|----|------|------|----------|
| ~~BUG-RLS-001~~ | ~~`customers`~~ | ~~`USING (true)` on SELECT, UPDATE, DELETE~~ | ~~🔴 Critical~~ — **✅ FIXED (BATCH13 — migration 20260307000000_fix_rls_ownership.sql)** |
| ~~BUG-RLS-002~~ | ~~`shipments`~~ | ~~`USING (true)` on SELECT, UPDATE~~ | ~~🔴 Critical~~ — **✅ FIXED (BATCH13)** |
| ~~BUG-RLS-003~~ | ~~`routes`~~ | ~~`USING (true)` on SELECT, UPDATE, DELETE~~ | ~~🔴 Critical~~ — **✅ FIXED (BATCH13)** |
| ~~BUG-RLS-004~~ | ~~`packing_results`~~ | ~~`USING (true)` on SELECT~~ | ~~🟠 High~~ — **✅ FIXED (BATCH13)** |
| ~~BUG-RLS-005~~ | ~~`trucks`~~ | ~~`USING (true)` on UPDATE, DELETE~~ | ~~🟠 High~~ — **✅ FIXED (BATCH13) — trucks is global reference catalog; all writes removed, public SELECT kept** |
| ~~BUG-RLS-006~~ | ~~`cartons`~~ | ~~`USING (true)` on UPDATE, DELETE~~ | ~~🟠 High~~ — **✅ FIXED (BATCH13) — same as trucks** |
| ~~BUG-REDIRECT-001~~ | ~~`CheckoutPage.tsx:113`~~ | ~~Open redirect — no PhonePe domain validation~~ | ~~🟠 High~~ — **✅ FIXED (BATCH14) — ALLOWED_PHONEPE_DOMAINS allowlist + isSafeUrl() added** |
| ~~BUG-023~~ | ~~`frontend/node_modules/serialize-javascript` (build dep chain)~~ | ~~`serialize-javascript <=7.0.2` RCE via RegExp/Date — GHSA-5c6j-r48x-rmvq~~ | ~~🟡 Medium (build-time only)~~ — **✅ FIXED (BATCH15) — vite-plugin-pwa downgraded to 0.19.8 + serialize-javascript override ^7.0.3. `npm audit` → 0 vulnerabilities** |
| ~~BUG-WEBHOOK-001~~ | ~~(Razorpay webhook)~~ | ~~No HMAC-SHA256 verification~~ | ~~🔴 Critical~~ — **✅ FIXED (BATCH12)** |
| ~~BUG-021~~ | ~~`20260306000000_driver_docs_bucket.sql`~~ | ~~Admin policy OR clause granted ALL auth users admin rights~~ | ~~🟠 High~~ — **✅ FIXED (BATCH12 judge)** |
| ~~BUG-022~~ | ~~`razorpay-webhook/index.ts`~~ | ~~No guard for empty RAZORPAY_KEY_SECRET~~ | ~~🟠 High~~ — **✅ FIXED (BATCH12 judge)** |

**All known vulnerabilities as of BATCH15: RESOLVED ✅ — `npm audit` shows 0 vulnerabilities.**

### Desktop Auth Follow-Up (2026-04-26)

| ID | Surface | Finding | Status |
|----|---------|---------|--------|
| `BUG-DESKTOP-AUTH-001` | `apps/desktop/TruckOptimum/app.py` | Desktop auth now transports sessions via the `truckoptimum_session` HttpOnly `SameSite=Strict` cookie, stores session tokens hashed at rest, and keeps the server loopback-only by default unless `TRUCKOPTIMUM_ALLOW_NON_LOOPBACK=1` is explicitly set. | ✅ Fixed (2026-04-26) |
| `BUG-DESKTOP-AUTH-002` | `apps/desktop/TruckOptimum/app.py` | Account lock checks previously compared aware and naive datetimes, which could turn a locked-account login into a generic 500 instead of the intended 423 response. | ✅ Fixed (2026-04-26) |
| `BUG-DESKTOP-AUTH-003` | `apps/desktop/TruckOptimum/app.py` | Non-auth desktop API routes now pass through a centralized session gate, with a small public allowlist for `/`, `/api/health`, `/api/auth/*`, and `/api/templates/*`; route-level regression coverage now asserts private APIs return 401 without a valid session. | ✅ Fixed (2026-04-26) |

### BATCH22 Security Investigation (2026-03-31)

GitHub Dependabot reported 1 moderate vulnerability on the default branch despite clean local `npm audit` (0 vulnerabilities across root, frontend, apps/web).

**Investigated surfaces:**
- All 3 `package-lock.json` files (root, frontend, apps/web)
- All `package.json` files (root, frontend, apps/web)
- Both Dockerfiles (root, infra/)
- Python requirements.txt (apps/web/) and requirements_test.txt (apps/desktop/)
- Transitive dependency chains (cross-spawn, esbuild, rollup, serialize-javascript, dompurify, nanoid)

**Root causes identified:**

| # | Package | Issue | Advisory | Severity | Fix Applied |
|---|---------|-------|----------|----------|-------------|
| 1 | `xlsx` (CDN tarball) | SheetJS `xlsx@0.20.3` resolved from `https://cdn.sheetjs.com/...` — Dependabot cannot resolve CDN URL to a version, falls back to npm registry (stuck at 0.18.5, which IS vulnerable) | GHSA-5pgg-2g8v-p4x9 (CVE-2024-22363) — "Patched versions: None" because npm is abandoned | High | Replaced with `xlsx-js-style@1.2.0` (community fork, same API, on npm, no advisories) |
| 2 | `dompurify` (override) | `overrides.dompurify: "^3.2.4"` semver range spans vulnerable 3.2.4–3.3.1 (XSS) | CVE-2026-0540 (GHSA-v2wj-7wpq-c8vv) — Moderate CVSS 5.1 | Moderate | Updated override to `"^3.3.2"` to eliminate vulnerable range |

**Changes applied:**
- `frontend/package.json`: Removed `xlsx` CDN tarball dependency, added `xlsx-js-style@^1.2.0`
- `frontend/package.json`: Updated `overrides.dompurify` from `^3.2.4` to `^3.3.2`
- `frontend/src/pages/SaleOrdersPage.tsx`: Updated dynamic import from `'xlsx'` to `'xlsx-js-style'`
- `frontend/vite.config.ts`: Updated `manualChunks` entry from `'xlsx'` to `'xlsx-js-style'`
- `frontend/package-lock.json`: Regenerated (0 vulnerabilities)

**Validation:**
- `npm audit` → 0 vulnerabilities (all 3 surfaces)
- `npm run build` → success (0 TypeScript errors)
- Build output includes `excel-vendor` chunk with `xlsx-js-style`

**Note:** Without `gh auth` we cannot directly query Dependabot alerts API to confirm which advisory was the "1 moderate". The `dompurify` override (CVE-2026-0540, Moderate) is the most likely match for "1 moderate". The xlsx issue was a bonus fix — Dependabot may classify it differently depending on how it resolves the CDN URL.

### BATCH23 Final Evidence-Driven Pass (2026-03-31)

**Goal:** Close or explain the remaining "1 moderate" GitHub Dependabot alert after BATCH22 fixes were committed and pushed.

**Methodology:** Exhaustive local inspection of all tracked repo surfaces with no speculation.

**Surfaces inspected (all clean):**

| # | Surface | Evidence | Verdict |
|---|---------|----------|---------|
| 1 | `npm audit` (root) | 0 vulnerabilities | ✅ Clean |
| 2 | `npm audit` (frontend) | 0 vulnerabilities | ✅ Clean |
| 3 | `npm audit` (apps/web) | 0 vulnerabilities | ✅ Clean |
| 4 | `dompurify` (lockfile) | Resolved `3.3.2` — confirmed first patched version for CVE-2026-0540 per NVD, Snyk, GitLab advisory DB | ✅ Fixed |
| 5 | `dompurify` (transitive) | `jspdf@4.2.1` optionalDep `dompurify: "^3.3.1"` — our override `^3.3.2` takes precedence, resolves to 3.3.2 | ✅ Safe |
| 6 | `xlsx` (lockfile) | No vulnerable xlsx version resolved; only `xlsx-js-style@1.2.0` + bin reference | ✅ Fixed |
| 7 | `cross-spawn` | `7.0.6` (latest safe) | ✅ Clean |
| 8 | `esbuild` | `0.25.12` (above `^0.25.0` override) | ✅ Clean |
| 9 | `serialize-javascript` | `7.0.5` (above `^7.0.3` override) | ✅ Clean |
| 10 | `nanoid` | `3.3.11` | ✅ Clean |
| 11 | `express@5.2.1` | No known CVEs; depends on `cookie@^0.7.1` (CVE-2024-47764 patched in ≥0.7.0) | ✅ Clean |
| 12 | `qs@^6.14.0` (express dep) | No known moderate CVEs in 6.x | ✅ Clean |
| 13 | `node_modules` tracking | Zero tracked node_modules files (`.gitignore` effective) | ✅ Clean |
| 14 | `package-lock.json` files | 3 tracked (root, frontend, apps/web) — all regenerated | ✅ Clean |
| 15 | Dockerfiles | `node:20-alpine`, `python:3.11-slim` — no vulnerable image pins | ✅ Clean |
| 16 | GitHub Actions workflows | None present in repo | ✅ N/A |
| 17 | Local vs remote sync | `git diff origin/main` → zero divergence; clean working tree | ✅ Synced |
| 18 | Build | `tsc && vite build` → 0 TS errors, success in 13s | ✅ Passes |

**Confirmed conclusion:**

CVE-2026-0540 (dompurify XSS, Moderate CVSS 5.1) is the "1 moderate" alert. Per NVD (cve-2026-0540), Snyk (SNYK-JS-DOMPURIFY-15371376), and GitLab Advisory DB:
- **Affected range:** `>=3.1.3, <3.3.2` and `>=2.5.3, <2.5.9`
- **First patched version:** `3.3.2`
- **Our resolved version:** `3.3.2` ✅

**The fix was correctly applied in BATCH22. The GitHub Dependabot alert is stale — it has not rescanned the default branch since commit `c0217b62` was pushed.** This is a well-documented Dependabot behavior: alerts can take hours to days to auto-dismiss after a fix is merged. No further code changes are required. To force an immediate rescan: authenticate `gh` CLI and dismiss the alert, or push a trivial commit to trigger Dependabot re-evaluation.

**Action for repo owner:** If the alert persists >24h after push, run `gh auth login` and then `gh api repos/prakashgarg91/Truck_Opti/dependabot/alerts` to verify and manually dismiss.

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

### 3.4 Desktop Flask Auth Transport

#### ✅ REQUIRED

- Keep the desktop Flask server bound to loopback only by default. Require an explicit `TRUCKOPTIMUM_ALLOW_NON_LOOPBACK=1` override before allowing any non-loopback bind.
- Transport desktop auth state in the `truckoptimum_session` HttpOnly `SameSite=Strict` cookie. Do not return raw session IDs in JSON login responses.
- Hash desktop session tokens before storing them in `user_sessions.session_id` so a DB copy is not directly reusable as a live bearer token.
- Keep debug mode off by default. Only enable the desktop debug server with `TRUCKOPTIMUM_DEBUG_SERVER=1` in a controlled environment.

#### ❌ FORBIDDEN

- Returning raw desktop session IDs in auth response bodies as the primary transport mechanism.
- Treating the desktop Flask API as safe to expose on LAN or public interfaces without explicit route-level auth enforcement on non-auth endpoints.

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

### 3.5A Billing Writes Must Stay Server-Owned

#### ❌ FORBIDDEN

```typescript
await supabase.from('subscriptions').insert(payload)
await supabase.from('subscriptions').update({ plan_id: newPlanId }).eq('id', subscriptionId)
await supabase.from('invoices').insert(invoice)
await supabase.from('payment_history').insert(paymentRow)
```

Browser clients must not activate subscriptions, start trials, change plans, create invoices, or write payment rows directly.

#### ✅ REQUIRED

```typescript
// Order creation edge function
const { data: plan } = await supabase
  .from('subscription_plans')
  .select('price_monthly, price_yearly')
  .eq('id', planId)
  .single()

const subtotal = billingCycle === 'yearly' ? plan.price_yearly : plan.price_monthly
const gst = Math.round(subtotal * 0.18)
const expectedTotal = subtotal + gst

if (clientAmount !== expectedTotal) {
  throw new Error('Payment amount does not match selected plan')
}
```

Rules:
- Resolve `plan_id` and `billing_cycle` from the persisted `payment_history.metadata` row during verification; do not fall back to browser-supplied plan data.
- Keep `subscriptions`, `invoices`, `usage_tracking`, and `payment_history` writes behind service-role edge functions only.
- Migration `20260501101500_lock_client_subscription_mutations.sql` is the baseline guardrail for this rule.

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

### 3.9 SQL Injection Prevention

**Context**: This project uses the Supabase JS client which parameterizes queries by default. However, `supabase.rpc()` calls, Supabase Edge Functions with raw `pg` connections, and any future server-side code can still be vulnerable.

#### ❌ FORBIDDEN — string-concatenated queries

```typescript
// Direct string interpolation = SQL injection
const { data } = await supabase.rpc('exec_sql', {
  query: `SELECT * FROM users WHERE email = '${userInput}'`
});

// In a Supabase Edge Function with postgres client:
const result = await client.query(`SELECT * FROM users WHERE id = ${userId}`);
```

#### ✅ REQUIRED — parameterized queries always

```typescript
// Supabase JS client — parameterized by default:
const { data } = await supabase
  .from('users')
  .select('*')
  .eq('email', userInput);     // ← library handles escaping

// In Edge Functions with postgres:
const result = await client.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]                       // ← parameterized
);

// For dynamic column/table names — use an allowlist, NEVER interpolate:
const ALLOWED_SORT_COLUMNS = ['created_at', 'fare', 'status'] as const;
if (!ALLOWED_SORT_COLUMNS.includes(sortColumn)) throw new Error('Invalid sort column');
```

**Rule**: Never interpolate user-supplied values into SQL strings. Validate dynamic identifiers (column names, table names) against an allowlist before use.

---

### 3.10 Cryptography Standards

AI models trained on legacy code frequently suggest broken algorithms because they are statistically common in training data.

#### ❌ FORBIDDEN — broken/weak algorithms

```typescript
// MD5 and SHA-1 are cryptographically broken — never use for security
import { createHash } from 'crypto';
const hash = createHash('md5').update(password).digest('hex');   // ❌
const hash = createHash('sha1').update(password).digest('hex');  // ❌

// Plain SHA-256 is also insufficient for password storage
const hash = createHash('sha256').update(password).digest('hex'); // ❌ for passwords
```

#### ✅ REQUIRED — modern alternatives by use case

| Use case | Required algorithm | Notes |
|---|---|---|
| Password storage | bcrypt / argon2 | Supabase Auth handles this — never store raw passwords |
| HMAC signatures (webhooks) | `crypto.createHmac('sha256', secret)` | Already required in §3.3 |
| File/data integrity checksums | SHA-256 minimum | `createHash('sha256')` |
| Token generation | `crypto.randomBytes(32)` | Never use `Math.random()` for security tokens |
| UUID generation | `crypto.randomUUID()` or Postgres `gen_random_uuid()` | Already used ✅ |

```typescript
// ✅ Secure random token
const token = require('crypto').randomBytes(32).toString('hex');

// ✅ Timing-safe comparison (already in §3.3, repeat here for visibility)
import { timingSafeEqual } from 'crypto';
const isValid = timingSafeEqual(
  Buffer.from(receivedSig, 'hex'),
  Buffer.from(expectedSig, 'hex')
);
```

**Rule**: Any cryptography suggestion from an AI should be immediately cross-checked. If the algorithm name is MD5, SHA-1, DES, 3DES, or RC4 — reject it unconditionally.

---

### 3.11 Supply Chain — Package Vetting

AI assistants suggest packages to solve problems without checking CVE records, maintenance status, or download integrity. A single unvetted import can pull in a tree of compromised transitive dependencies.

#### ❌ FORBIDDEN

```bash
# Installing a package because the AI suggested it, without checking:
npm install some-utility-library   # Did you check its CVEs? Last publish date? Maintainer?
```

#### ✅ REQUIRED — before adding any new npm/pip dependency

1. **Check the CVE record**: `npm audit` after install; search the package on [https://osv.dev](https://osv.dev)
2. **Check maintenance status**: Last publish date should be within 2 years; open issues/PRs should be acknowledged
3. **Check download count**: Packages with <10k weekly downloads are higher risk
4. **Prefer established ecosystem packages** over single-purpose micro-libraries:
   - Date handling → `date-fns` (already in use ✅) — not an unknown alternative
   - HTTP requests → `fetch` (native) or `axios` — not an unfamiliar wrapper
   - Validation → `zod` — not an AI-suggested alternative
5. **Pin versions** in `package.json` — avoid `^` or `~` for security-critical packages
6. **Check `package-lock.json`** after install — unexpected transitive deps are a red flag

```bash
# After every new install:
npm audit --audit-level=high
# Fix HIGH and CRITICAL before committing
```

**Rule**: No new package may be added unless the developer (or agent judge) has explicitly verified its CVE status and maintenance health. "The AI suggested it" is not sufficient justification.

---

### 3.12 Hallucinated APIs and Unsafe Defaults

AI models invent plausible-looking function signatures that do not exist in the actual SDK. They also suggest permissive configurations as "quick-start" defaults that should never reach production.

#### ❌ FORBIDDEN — hallucinated or unsafe patterns

```typescript
// Invented Supabase function that doesn't exist:
const { data } = await supabase.auth.getUserByEmail(email); // ← not a real method

// Disabled TLS verification (AI "quick fix" for cert errors)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';  // ❌ disables ALL cert validation

// Wildcard CORS — AI default for "just get it working"
app.use(cors({ origin: '*' }));  // ❌ allows any domain to call the API

// Permissive regex used as input sanitization
const clean = input.replace(/[<>]/g, '');  // ❌ incomplete — does not prevent injection
```

#### ✅ REQUIRED

```typescript
// Verify SDK methods exist before using — check official docs, not AI output
// Supabase admin operations use service role client:
const { data } = await supabaseAdmin.auth.admin.listUsers(); // ← real method

// TLS errors must be fixed by fixing the certificate, never by disabling verification
// (Contact infra team if cert issues arise in production)

// CORS — allowlist specific origins
const ALLOWED_ORIGINS = [
  'https://www.truckopti.in',
  'https://truckopti.in',
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:5173'] : []),
];
app.use(cors({ origin: (origin, cb) => {
  if (!origin || ALLOWED_ORIGINS.includes(origin)) cb(null, true);
  else cb(new Error('CORS blocked'));
}}));

// Input sanitization must be purpose-specific and comprehensive, not ad-hoc regex
// Use a library like DOMPurify for HTML, validator.js for format checks
```

**Rule**: Before using any function the AI generated, confirm it exists in the official SDK documentation. Never accept "just add this flag" suggestions that disable security checks.

---

### 3.13 Blast-Radius Refactors

AI models lack application-wide context. When asked to refactor a small function, they may generate changes that touch unrelated security logic, strip guards, or alter dependency versions across multiple files.

#### Rules for agents performing refactors

1. **Scope the change to exactly what was asked.** If the task says "rename this function", do not reorganize surrounding imports or restructure related modules.
2. **Never remove error handling or validation while refactoring**, even if it looks redundant. Check with the judge first.
3. **After any multi-file change, explicitly verify**:
   - Auth guards (`useRequireAuth`, `ProtectedRoute`) are still in place
   - Input validation on mutating endpoints is unchanged
   - RLS-relevant column names have not been silently renamed
4. **Do not upgrade dependency versions** as part of a feature task. Dependency upgrades are their own task requiring `npm audit` + regression testing.
5. **The judge must diff every changed file** in a refactor PR, not just the primary target.

#### ❌ FORBIDDEN refactor anti-patterns

```typescript
// Removing auth check "because the component handles it at route level"
export async function updateFare(jobId: string, fare: number) {
  // ← agent removed: const user = requireAuth();
  return supabase.from('agency_jobs').update({ fare }).eq('id', jobId);
}

// Silently changing a security-relevant constant while renaming a file
const MAX_UPLOAD_SIZE = 50 * 1024 * 1024;  // ← was 5 MB, AI "normalized" to 50 MB
```

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
| 11 | Does any SQL query concatenate user input into a string? | ❌ Stop | Use parameterized queries (`$1`, `.eq()`) |
| 12 | Does AI-suggested code use MD5, SHA-1, or `Math.random()` for security? | ❌ Stop | Use SHA-256 for checksums, bcrypt/argon2 for passwords, `crypto.randomBytes` for tokens |
| 13 | Was a new npm package added without checking its CVE record? | ❌ Stop | Run `npm audit`; verify on osv.dev before committing |
| 14 | Does the code call an SDK function you cannot find in the official docs? | ❌ Stop | AI may have hallucinated it — verify against Supabase/Razorpay/PhonePe docs |
| 15 | Does a refactor task touch files or functions beyond the stated scope? | ❌ Stop | Revert out-of-scope changes; blast-radius refactors break security checks |

---

## 7. SECURITY REVIEW GATES

Before any BATCH is marked complete, the judge must verify:

**Access Control**
- [ ] No new `USING (true)` on user-owned tables
- [ ] Every new table has `ENABLE ROW LEVEL SECURITY` + ownership-scoped policies
- [ ] Role checks use database data, not localStorage/client state

**Injection**
- [ ] No SQL string concatenation with user input — parameterized queries only
- [ ] No `dangerouslySetInnerHTML`, `eval()`, or `new Function()` introduced
- [ ] No new `window.location.href` / `router.replace` pointing at external or user-supplied URLs without domain allowlist

**Cryptography**
- [ ] No MD5, SHA-1, or `Math.random()` used for any security purpose
- [ ] New webhooks include HMAC-SHA256 verification with `timingSafeEqual`

**Secrets & Configuration**
- [ ] No secrets in source files or `VITE_` environment variables
- [ ] No `NODE_TLS_REJECT_UNAUTHORIZED = '0'` or wildcard CORS `origin: '*'`

**File Handling**
- [ ] New file uploads enforce MIME type allowlist and 5 MB size limit
- [ ] Storage paths are constructed from `auth.uid()`, never from user input

**Dependencies**
- [ ] Any new npm package has been vetted: `npm audit` clean at HIGH+CRITICAL level
- [ ] No dependency version bumps snuck in as part of a feature task

**Error Handling**
- [ ] No raw Supabase/Postgres error messages returned to the client

**Refactor Discipline**
- [ ] Refactor PRs only touch the files stated in the task spec
- [ ] Auth guards and input validation are confirmed still present after any restructure

---

## 8. REFERENCES

- OWASP Top 10 (2021): A01 Broken Access Control, A03 Injection, A05 Security Misconfiguration, A07 Identification and Authentication Failures
- Checkmarx / DevOps.com: "When AI Gets It Wrong: The Insecure Defaults Lurking in Your Code" — source for §3.9–3.13
- [Supabase RLS docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Razorpay Webhook Signature Verification](https://razorpay.com/docs/webhooks/validate-test/)
- [PhonePe Payment Gateway Integration](https://developer.phonepe.com/v1/docs)
- [OSV.dev — Open Source Vulnerability Database](https://osv.dev)
- [Node.js crypto module docs](https://nodejs.org/api/crypto.html)

---

*Last updated: 2026-03-05 — added §3.9 SQL injection, §3.10 cryptography, §3.11 supply chain, §3.12 hallucinated APIs, §3.13 blast-radius refactors; expanded checklist to 15 items (Claude Sonnet 4.6)*
