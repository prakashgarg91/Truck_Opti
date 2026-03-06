# Batch 6 — Payment Flow Fix + Security Cleanup (10 Tasks)

## Project Context
- **Stack**: React 18 + Vite 5.4 + TypeScript 5.6 + Tailwind 3.4 + Supabase
- **Root**: All frontend code is in `frontend/src/`
- **Supabase Edge Functions**: `supabase/functions/` (Deno runtime)
- **Deployed URL**: `https://truck-opti-app-efabf95bd306.herokuapp.com/`
- **Logger**: Use `import { logger } from '../utils/logger'` — only logs in DEV mode
- **Important**: Do NOT create or modify any markdown documentation files. Do NOT modify migration SQL files.

---

## Task 1: Fix Razorpay Payment — Activate Subscription After Success

**Problem**: After Razorpay payment succeeds, the handler in `razorpayPayment.ts` only updates the local `payment_history` row to `completed`. It **never** calls the `verify-razorpay-payment` Edge Function to activate the subscription. Users who pay via Razorpay get charged but their subscription is never activated.

**File**: `frontend/src/services/razorpayPayment.ts`

**Current code** (the `handler` function in Razorpay options, around line 140-155):
```typescript
handler: async function (response: any) {
  try {
    await supabase
      .from('payment_history')
      .update({
        status: 'completed',
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      })
      .eq('razorpay_order_id', orderId);
  } catch (error) {
    logger.warn('Could not update payment status:', error);
  }

  resolve({
    success: true,
    paymentId: response.razorpay_payment_id,
    orderId: response.razorpay_order_id,
    signature: response.razorpay_signature,
  });
},
```

**Required change**: After updating `payment_history`, call the `verify-razorpay-payment` Edge Function to verify the signature server-side and activate the subscription:

```typescript
handler: async function (response: any) {
  try {
    await supabase
      .from('payment_history')
      .update({
        status: 'completed',
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
      })
      .eq('razorpay_order_id', orderId);
  } catch (error) {
    logger.warn('Could not update payment status:', error);
  }

  // Verify payment and activate subscription server-side
  try {
    await supabase.functions.invoke('verify-razorpay-payment', {
      body: {
        razorpay_order_id: orderId,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature,
        plan_id: request.planId || '',
        billing_cycle: request.billingCycle || 'monthly',
        customer_phone: request.customerPhone,
        customer_email: request.customerEmail,
      },
    });
  } catch (verifyError) {
    logger.warn('Could not verify payment server-side:', verifyError);
  }

  resolve({
    success: true,
    paymentId: response.razorpay_payment_id,
    orderId: response.razorpay_order_id,
    signature: response.razorpay_signature,
  });
},
```

**Acceptance**: After Razorpay success, the Edge Function `verify-razorpay-payment` is called with payment details and plan info.

---

## Task 2: Fix PaymentCallbackPage to Handle Both Razorpay and PhonePe

**Problem**: `PaymentCallbackPage.tsx` only reads `txnId` from search params. When Razorpay redirects to `/payment/success?payment_id=XXX`, the page can't find `txnId` and shows "Invalid payment callback".

**File**: `frontend/src/pages/PaymentCallbackPage.tsx`

**Current code** (lines 12-26):
```tsx
const txnId = searchParams.get('txnId');

const [status, setStatus] = useState<'checking' | 'success' | 'failed' | 'pending'>('checking');
const [message, setMessage] = useState('Verifying payment...');

useEffect(() => {
  document.title = 'Payment Status - TruckOpti'
}, [])

useEffect(() => {
  if (txnId) {
    verifyPayment();
  } else {
    setStatus('failed');
    setMessage('Invalid payment callback');
  }
}, [txnId]);
```

**Required change**: Also read `payment_id` and `status` from search params. If `payment_id` is present (Razorpay flow), show success immediately since verification already happened in `razorpayPayment.ts`. If `txnId` is present (PhonePe flow), run the existing verification logic.

```tsx
const txnId = searchParams.get('txnId');
const paymentId = searchParams.get('payment_id');
const callbackStatus = searchParams.get('status');

const [status, setStatus] = useState<'checking' | 'success' | 'failed' | 'pending'>('checking');
const [message, setMessage] = useState('Verifying payment...');

useEffect(() => {
  document.title = 'Payment Status - TruckOpti'
}, [])

useEffect(() => {
  if (paymentId) {
    // Razorpay flow — payment already verified in razorpayPayment.ts
    if (callbackStatus === 'success' || !callbackStatus) {
      setStatus('success');
      setMessage('Payment successful! Your subscription is now active.');
    } else {
      setStatus('failed');
      setMessage('Payment failed. Please try again.');
    }
  } else if (txnId) {
    // PhonePe flow — verify via Edge Function
    verifyPayment();
  } else {
    setStatus('failed');
    setMessage('Invalid payment callback');
  }
}, [txnId, paymentId]);
```

Also update the transaction ID display section (around line 145) to show whichever ID is available:
```tsx
{(txnId || paymentId) && (
  <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-3 mb-6">
    <p className="text-xs text-gray-500 dark:text-gray-400">Transaction ID</p>
    <p className="text-sm font-mono text-gray-900 dark:text-white">{txnId || paymentId}</p>
  </div>
)}
```

**Acceptance**: PaymentCallbackPage handles both `?txnId=` (PhonePe) and `?payment_id=` (Razorpay) query params correctly.

---

## Task 3: Fix OG Meta Tags — Point to Heroku, Not Vercel

**Problem**: `frontend/index.html` OG tags still point to `https://truckopti.vercel.app/` instead of the actual deployed URL.

**File**: `frontend/index.html`

**Changes**:
1. Line 12: Change `content="https://truckopti.vercel.app/"` → `content="https://truck-opti-app-efabf95bd306.herokuapp.com/"`
2. Line 15: Change `content="https://truckopti.vercel.app/pwa-512x512.png"` → `content="https://truck-opti-app-efabf95bd306.herokuapp.com/pwa-512x512.png"`

**Acceptance**: Both `og:url` and `og:image` point to the Heroku deployment URL.

---

## Task 4: Fix robots.txt — Remove Nonexistent Sitemap Reference

**Problem**: `frontend/public/robots.txt` references `sitemap.xml` which doesn't exist, causing crawler 404s.

**File**: `frontend/public/robots.txt`

**Change**: Remove the `Sitemap:` line entirely. The file should be:
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /auth/
```

**Acceptance**: No sitemap reference in robots.txt.

---

## Task 5: Remove `apps/web/.env` from Git Tracking

**Problem**: `apps/web/.env` is tracked in git and contains `SECRET_KEY=dev-secret-key-change-in-production` and `JWT_SECRET_KEY=dev-jwt-secret-change-in-production`. While these are placeholder values, the `.env` file should never be tracked.

**Actions**:
1. Add `apps/web/.env` to the root `.gitignore` file (add the line `.env` under the existing patterns or add `apps/web/.env` specifically).
2. This is a git operation — the AI coder should note that `git rm --cached apps/web/.env` needs to be run, but since the AI can only edit files, add a comment or just ensure `.gitignore` covers it.

**File**: `.gitignore` (root)

**Acceptance**: `.gitignore` at root includes a pattern that would exclude `apps/web/.env`.

---

## Task 6: Delete Google OAuth Client Secret JSON

**Problem**: File `client_secret_87428468283-vbpi2c3guqg968no40i0k29ivjv3msgn.apps.googleusercontent.com.json` exists in the repo root. It contains Google OAuth client secret.

**Actions**:
1. Ensure the root `.gitignore` has a pattern `client_secret_*.json` to prevent future commits.
2. Note: The file should be deleted from disk, but since the AI can only edit/create files, ensure `.gitignore` covers this pattern.

**File**: `.gitignore` (root)

**Acceptance**: `.gitignore` has `client_secret_*.json` pattern.

---

## Task 7: Fix TestPaymentPage Route Guard

**Problem**: In `App.tsx`, the `TestPaymentPage` component is tree-shaken in production (`() => null`), but the route `<Route path="/test-payment" ...>` still exists. In production, navigating to `/test-payment` renders `null` instead of the 404 page.

**File**: `frontend/src/App.tsx`

**Current code** (lines 63-65):
```tsx
{import.meta.env.DEV && (
  <Route path="/test-payment" element={<TestPaymentPage />} />
)}
```

This is actually already correct — the entire `<Route>` is conditionally rendered, so it won't exist in production. However, confirm the component definition at lines 35-37:
```tsx
const TestPaymentPage = import.meta.env.DEV
  ? React.lazy(() => import('./pages/TestPaymentPage'))
  : () => null
```

The `: () => null` fallback is unnecessary since the route is also gated. But it's harmless. **No change needed** — verify and confirm this is fine as-is.

**Actually**: Change the fallback to return a redirect to 404 for safety:
```tsx
const TestPaymentPage = import.meta.env.DEV
  ? React.lazy(() => import('./pages/TestPaymentPage'))
  : React.lazy(() => import('./pages/NotFoundPage'))
```

**Acceptance**: TestPaymentPage fallback redirects to NotFoundPage in production.

---

## Task 8: Fix InvoicePage Hardcoded Company Info

**Problem**: `InvoicePage.tsx` has hardcoded company details that should come from user profile or be configurable.

**File**: `frontend/src/pages/InvoicePage.tsx`

**Current code** (around lines 140-143):
```tsx
companyName: 'TruckOpti Logistics Pvt Ltd',
companyGstin: '27AABCU9603R1ZX',
companyAddress: 'Mumbai, Maharashtra - 400001',
```

And hardcoded charges (around lines 158-159):
```tsx
loadingCharges: 500,
unloadingCharges: 500,
```

**Change**: Read company info from the user's profile metadata (from Supabase auth). Fall back to generic values if not set. At the top of the function where shipment data is loaded:

```tsx
// Get user profile for company info
const { data: { user } } = await supabase.auth.getUser();
const companyInfo = user?.user_metadata?.company || {};

// Then use in invoice:
companyName: companyInfo.name || 'Your Company Name',
companyGstin: companyInfo.gstin || '',
companyAddress: companyInfo.address || '',
```

For loading/unloading charges, replace hardcoded `500` with `data.loading_charges || 0` and `data.unloading_charges || 0`.

**Acceptance**: Company info comes from user metadata with empty/generic fallbacks. Loading charges come from shipment data with `0` fallback.

---

## Task 9: Fix InterState GST Detection in InvoicePage

**Problem**: `InvoicePage.tsx` line ~159 compares city names to determine inter-state:
```tsx
isInterState: data.origin?.toLowerCase() !== data.destination?.toLowerCase(),
```
This is wrong — "Mumbai" vs "Pune" would be inter-state even though both are in Maharashtra.

**File**: `frontend/src/pages/InvoicePage.tsx`

**Change**: Extract state from city names using a helper. Indian city-state mapping would be complex, so a simpler approach: check if both contain the same state keyword. Or just default to intra-state (CGST+SGST) and let users override:

```tsx
// Simple heuristic: check if origin and destination share same state keyword
const getState = (location: string): string => {
  const stateMap: Record<string, string> = {
    'mumbai': 'MH', 'pune': 'MH', 'nagpur': 'MH', 'nashik': 'MH', 'thane': 'MH',
    'delhi': 'DL', 'new delhi': 'DL', 'noida': 'UP', 'gurgaon': 'HR', 'gurugram': 'HR',
    'bangalore': 'KA', 'bengaluru': 'KA', 'mysore': 'KA', 'mysuru': 'KA',
    'chennai': 'TN', 'coimbatore': 'TN', 'madurai': 'TN',
    'hyderabad': 'TS', 'kolkata': 'WB', 'ahmedabad': 'GJ', 'surat': 'GJ',
    'jaipur': 'RJ', 'lucknow': 'UP', 'kanpur': 'UP', 'patna': 'BR',
    'bhopal': 'MP', 'indore': 'MP', 'chandigarh': 'CH', 'kochi': 'KL',
    'trivandrum': 'KL', 'thiruvananthapuram': 'KL', 'visakhapatnam': 'AP',
  };
  const city = location.toLowerCase().trim();
  return stateMap[city] || city;
};

// Use in invoice:
isInterState: getState(data.origin || '') !== getState(data.destination || ''),
```

Place this helper function inside the component or as a module-level utility above the component.

**Acceptance**: Inter-state GST detection uses state-level comparison via city-to-state mapping. Falls back to string comparison for unmapped cities.

---

## Task 10: Remove Unnecessary `React` Import from Files Using New JSX Transform

**Problem**: Several files import `React` when it's not needed (React 18 + Vite automatic JSX transform handles this).

**Files to check and fix**:
1. `frontend/src/pages/CheckoutPage.tsx` — line 1: `import React, { useState, useEffect } from 'react'` → `import { useState, useEffect } from 'react'`
2. `frontend/src/pages/PaymentCallbackPage.tsx` — line 1: `import React, { useEffect, useState } from 'react'` → `import { useEffect, useState } from 'react'`
3. `frontend/src/pages/TestPaymentPage.tsx` — line 1: if it has `import React, ...` → remove `React,`

**Note**: ONLY remove `React` from the import if `React` is not used elsewhere in the file (e.g., `React.memo`, `React.useState`). If the file uses `React.` anywhere, keep the import.

**Important**: `App.tsx` uses `React.lazy()` — do NOT remove `React` from `App.tsx`.

**Acceptance**: Files that don't use `React.` no longer import `React` default.

---

## Summary

| # | Task | Priority | Type |
|---|------|----------|------|
| 1 | Razorpay: call verify Edge Function after payment | CRITICAL | Payment Flow |
| 2 | PaymentCallbackPage: handle both Razorpay + PhonePe params | CRITICAL | Payment Flow |
| 3 | OG meta tags: Vercel → Heroku URL | HIGH | SEO |
| 4 | robots.txt: remove nonexistent sitemap | HIGH | SEO |
| 5 | Remove `apps/web/.env` from git tracking (update .gitignore) | HIGH | Security |
| 6 | Add `client_secret_*.json` to .gitignore | HIGH | Security |
| 7 | TestPaymentPage: fallback to NotFoundPage in prod | MEDIUM | UX |
| 8 | InvoicePage: use user profile instead of hardcoded company | MEDIUM | UX |
| 9 | InvoicePage: fix inter-state GST detection | MEDIUM | Bug Fix |
| 10 | Remove unnecessary `React` imports | LOW | Code Quality |

**Rules**:
- Do NOT create or modify any markdown documentation files
- Do NOT modify any migration SQL files
- Use `import { logger } from '../utils/logger'` for all logging
- TypeScript must compile without errors (`npx tsc --noEmit`)
- Vite must build without errors (`npx vite build`)
