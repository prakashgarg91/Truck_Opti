# Batch 5 — Launch-Critical Fixes (10 Tasks)

## Project Context
- **Stack**: React 18 + Vite 5.4 + TypeScript 5.6 + Tailwind 3.4 + Supabase (Edge Functions in Deno)
- **Root**: All frontend code is in `frontend/src/`
- **Supabase Edge Functions**: `supabase/functions/` (Deno runtime, TypeScript)
- **DB columns**: `subscription_plans` table has columns `price_monthly`, `price_yearly` (NOT `monthly_price`, `yearly_price`)
- **Existing Edge Functions**: `create-razorpay-order/index.ts`, `verify-razorpay-payment/index.ts`
- **Logger**: Use `import { logger } from '../utils/logger'` instead of `console.*` — it only logs in DEV mode
- **Important**: Do NOT create or modify any `.env` file. Do NOT add any real credentials anywhere in source code.

---

## Task 1: Remove VITE_PHONEPE_SALT_KEY and VITE_RAZORPAY_KEY_SECRET from frontend .env

**Problem**: `frontend/.env` still contains `VITE_PHONEPE_SALT_KEY=099eb0cd-...` and `VITE_RAZORPAY_KEY_SECRET=XXXX...`. Any `VITE_` prefixed variable is bundled into the client-side JavaScript at build time. Salt keys and secret keys are signing secrets that must NEVER be in the browser.

**Files to edit**:
- `frontend/.env` — Remove the lines `VITE_PHONEPE_SALT_KEY=...` and `VITE_PHONEPE_SALT_INDEX=...` and `VITE_RAZORPAY_KEY_SECRET=...`. Keep `VITE_PHONEPE_MERCHANT_ID`, `VITE_PHONEPE_API_URL`, and `VITE_RAZORPAY_KEY_ID` (these are public-facing).
- `frontend/.env.example` — Already correct (no salt key). Verify it does NOT have `VITE_PHONEPE_SALT_KEY` or `VITE_RAZORPAY_KEY_SECRET`. If present, remove them.

**Acceptance**: The `.env` file no longer has `VITE_PHONEPE_SALT_KEY`, `VITE_PHONEPE_SALT_INDEX`, or `VITE_RAZORPAY_KEY_SECRET`. The `.env.example` also does not have them.

---

## Task 2: Create `phonepe-checkout` Supabase Edge Function

**Problem**: `frontend/src/services/phonepePayment.ts` calls `supabase.functions.invoke('phonepe-checkout', ...)` but this function does not exist. All PhonePe payments will fail.

**Create file**: `supabase/functions/phonepe-checkout/index.ts`

**Pattern**: Follow existing `supabase/functions/create-razorpay-order/index.ts` for CORS headers, error handling, and Deno patterns.

**Implementation**:
```typescript
// supabase/functions/phonepe-checkout/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { encode as base64Encode } from 'https://deno.land/std@0.168.0/encoding/base64.ts'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHONEPE_SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY') || ''
const PHONEPE_SALT_INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || '1'
const PHONEPE_API_URL = Deno.env.get('PHONEPE_API_URL') || 'https://api-preprod.phonepe.com/apis/pg-sandbox'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { merchantId, merchantTransactionId, merchantUserId, amount, redirectUrl, redirectMode, callbackUrl, mobileNumber } = await req.json()

    if (!merchantId || !merchantTransactionId || !amount) {
      throw new Error('Missing required fields: merchantId, merchantTransactionId, amount')
    }

    const payload = {
      merchantId,
      merchantTransactionId,
      merchantUserId,
      amount,
      redirectUrl,
      redirectMode: redirectMode || 'REDIRECT',
      callbackUrl,
      mobileNumber,
      paymentInstrument: { type: 'PAY_PAGE' },
    }

    const payloadBase64 = base64Encode(new TextEncoder().encode(JSON.stringify(payload)))
    const stringToHash = payloadBase64 + '/pg/v1/pay' + PHONEPE_SALT_KEY
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stringToHash))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('') + '###' + PHONEPE_SALT_INDEX

    const response = await fetch(`${PHONEPE_API_URL}/pg/v1/pay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
      },
      body: JSON.stringify({ request: payloadBase64 }),
    })

    const data = await response.json()

    const redirectUrlFromResponse = data?.data?.instrumentResponse?.redirectInfo?.url

    return new Response(JSON.stringify({ success: data.success, redirectUrl: redirectUrlFromResponse, data: data.data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

**Acceptance**: File exists, follows Deno Edge Function patterns, reads `PHONEPE_SALT_KEY` from server env (NOT from client), generates SHA-256 checksum, calls PhonePe API, returns redirect URL.

---

## Task 3: Create `phonepe-status` Supabase Edge Function

**Problem**: `phonepePayment.ts` calls `supabase.functions.invoke('phonepe-status', ...)` but it doesn't exist.

**Create file**: `supabase/functions/phonepe-status/index.ts`

**Implementation**:
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { crypto } from 'https://deno.land/std@0.168.0/crypto/mod.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const PHONEPE_SALT_KEY = Deno.env.get('PHONEPE_SALT_KEY') || ''
const PHONEPE_SALT_INDEX = Deno.env.get('PHONEPE_SALT_INDEX') || '1'
const PHONEPE_API_URL = Deno.env.get('PHONEPE_API_URL') || 'https://api-preprod.phonepe.com/apis/pg-sandbox'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { merchantId, merchantTransactionId } = await req.json()

    if (!merchantId || !merchantTransactionId) {
      throw new Error('Missing required fields')
    }

    const statusUrl = `/pg/v1/status/${merchantId}/${merchantTransactionId}`
    const stringToHash = statusUrl + PHONEPE_SALT_KEY
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stringToHash))
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('') + '###' + PHONEPE_SALT_INDEX

    const response = await fetch(`${PHONEPE_API_URL}${statusUrl}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-VERIFY': checksum,
        'X-MERCHANT-ID': merchantId,
      },
    })

    const data = await response.json()

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ success: false, code: 'STATUS_ERROR', message: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
```

**Acceptance**: Generates checksum for status check endpoint, calls PhonePe status API, returns response.

---

## Task 4: Create `verify-payment` Supabase Edge Function

**Problem**: `phonepePayment.ts` calls `supabase.functions.invoke('verify-payment', ...)` to activate a subscription after PhonePe payment. This function doesn't exist.

**Create file**: `supabase/functions/verify-payment/index.ts`

**Implementation**: This function should:
1. Accept `{ razorpay_payment_id, razorpay_order_id, plan_id, billing_cycle, user_id, payment_provider }` in the body.
2. Initialize Supabase client with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from env.
3. Update `payment_history` table: set `status = 'completed'` where `razorpay_order_id` matches `razorpay_order_id` from body.
4. Create a new row in `subscriptions` table with: `user_id`, `plan_id`, `status = 'active'`, `billing_cycle`, `current_period_start = NOW()`, `current_period_end = NOW() + 1 month or 1 year based on billing_cycle`.
5. Return `{ success: true }`.
6. Use same CORS headers pattern as the other Edge Functions.
7. Use `createClient` from `https://esm.sh/@supabase/supabase-js@2`.

**Acceptance**: Activates subscription after any payment provider (PhonePe or Razorpay). Updates payment history and creates subscription row.

---

## Task 5: Fix PricingPage Column Name Mismatch

**Problem**: `frontend/src/pages/PricingPage.tsx` queries `.order('monthly_price', ...)` and maps `plan.monthly_price` / `plan.yearly_price`, but the actual database columns are `price_monthly` and `price_yearly`.

**File**: `frontend/src/pages/PricingPage.tsx`

**Changes**:
1. Line ~12: Change `.order('monthly_price', { ascending: true })` → `.order('price_monthly', { ascending: true })`
2. Line ~23: Change `monthlyPrice: plan.monthly_price,` → `monthlyPrice: plan.price_monthly,`
3. Line ~24: Change `yearlyPrice: plan.yearly_price,` → `yearlyPrice: plan.price_yearly,`

**Acceptance**: PricingPage queries correct column names. DB-driven pricing will now work instead of always falling back to static tiers.

---

## Task 6: Fix Missing `/payment/success` Route

**Problem**: `CheckoutPage.tsx` line 132 navigates to `/payment/success?payment_id=...` after Razorpay success, but this route doesn't exist in `App.tsx`. Users see a 404 page after successful payment.

**File**: `frontend/src/pages/CheckoutPage.tsx`

**Change**: Replace `navigate('/payment/success?payment_id=' + result.paymentId)` with `navigate('/payment/callback?status=success&txnId=' + result.paymentId)` — the `/payment/callback` route already exists and handles payment success display.

**Acceptance**: After Razorpay payment success, user is redirected to the existing `/payment/callback` page instead of a 404.

---

## Task 7: Fix Razorpay to Use Server-Created Orders

**Problem**: `razorpayPayment.ts` creates a client-side `orderId = order_${Date.now()}` instead of calling the existing `create-razorpay-order` Edge Function. Razorpay requires server-created orders for payment verification in production.

**File**: `frontend/src/services/razorpayPayment.ts`

**Changes**: In the `initiateRazorpayPayment` function, before opening Razorpay checkout:
1. Call `supabase.functions.invoke('create-razorpay-order', { body: { amount, currency, receipt, notes } })` to get a server-created order ID.
2. Use the returned `order.id` as the `order_id` in Razorpay options.
3. Fall back to the current client-generated ID only if the Edge Function call fails (graceful degradation for test mode).

**Current code** (around line 86):
```typescript
const orderId = request.orderId || `order_${Date.now()}`;
```

**New code**:
```typescript
let orderId = request.orderId;
if (!orderId) {
  try {
    const { data, error } = await supabase.functions.invoke('create-razorpay-order', {
      body: {
        amount: request.amount,
        currency: request.currency || 'INR',
        receipt: `rcpt_${Date.now()}`,
        notes: { user_id: request.userId, plan_id: request.planId || '' },
      },
    });
    if (!error && data?.id) {
      orderId = data.id;
    } else {
      logger.warn('Could not create Razorpay order via Edge Function, using fallback:', error);
      orderId = `order_${Date.now()}`;
    }
  } catch (err) {
    logger.warn('Edge Function unavailable, using fallback order ID');
    orderId = `order_${Date.now()}`;
  }
}
```

**Acceptance**: Razorpay payments use server-created order IDs via the existing Edge Function. Falls back gracefully in test mode.

---

## Task 8: Fix `base` in vite.config.ts for Web Deployment

**Problem**: `frontend/vite.config.ts` has `base: './'` which was needed for Electron `file://` protocol but breaks web deployments and PWA. Assets load with relative paths causing issues on non-root routes.

**File**: `frontend/vite.config.ts`

**Change**: Line 6: Change `base: './'` → `base: '/'`

**Also**: Line 142: Change `sourcemap: true` → `sourcemap: false` (don't expose source code in production).

**Acceptance**: `base` is `'/'` and `sourcemap` is `false`.

---

## Task 9: Fix OG Meta Tags — Use Absolute URLs

**Problem**: In `frontend/index.html`, the OG image uses a relative path `/pwa-512x512.png`. Social media platforms require absolute URLs for OG images. Also, `user-scalable=no` in viewport prevents zooming (accessibility concern).

**File**: `frontend/index.html`

**Changes**:
1. Change `<meta property="og:image" content="/pwa-512x512.png" />` → `<meta property="og:image" content="https://truck-opti-app-efabf95bd306.herokuapp.com/pwa-512x512.png" />`
2. Change `user-scalable=no` → `user-scalable=yes` in the viewport meta tag (line 6)

**Acceptance**: OG image has an absolute URL. Viewport allows user zoom.

---

## Task 10: Replace Remaining `console.*` with `logger` in authStore

**Problem**: `frontend/src/stores/authStore.ts` still uses `if (import.meta.env.DEV) console.error(...)` in 6 places instead of the `logger` utility from `../utils/logger.ts`.

**File**: `frontend/src/stores/authStore.ts`

**Changes**:
1. Add `import { logger } from '../utils/logger'` at the top.
2. Replace all instances of `if (import.meta.env.DEV) console.error(...)` with `logger.error(...)`.
3. Replace all instances of `if (import.meta.env.DEV) console.log(...)` with `logger.log(...)`.

The `logger` utility already checks `import.meta.env.DEV` internally, so the outer `if` check becomes redundant.

**Acceptance**: No direct `console.*` calls remain in `authStore.ts`. All logging uses `logger.*`.

---

## Summary

| # | Task | Priority | Type |
|---|------|----------|------|
| 1 | Remove secret keys from frontend `.env` | CRITICAL | Security |
| 2 | Create `phonepe-checkout` Edge Function | CRITICAL | Infrastructure |
| 3 | Create `phonepe-status` Edge Function | CRITICAL | Infrastructure |
| 4 | Create `verify-payment` Edge Function | CRITICAL | Infrastructure |
| 5 | Fix PricingPage column names | HIGH | Bug Fix |
| 6 | Fix `/payment/success` route → use `/payment/callback` | HIGH | Bug Fix |
| 7 | Razorpay: use server-created orders | HIGH | Security/Correctness |
| 8 | Fix `base` and `sourcemap` in vite.config.ts | HIGH | Deployment |
| 9 | Fix OG image absolute URL + viewport zoom | MEDIUM | SEO/Accessibility |
| 10 | Replace `console.*` with `logger` in authStore | MEDIUM | Code Quality |

**Rules**:
- Do NOT create or modify any markdown documentation files
- Do NOT modify any migration SQL files  
- Use `import { logger } from '../utils/logger'` for all logging
- All Edge Functions go in `supabase/functions/<name>/index.ts`
- TypeScript must compile without errors (`npx tsc --noEmit`)
- Vite must build without errors (`npx vite build`)
