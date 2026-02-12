# TruckOpti — Launch Test Tracker

> **Updated by**: Kimi K2.5 (AI collaborator)
> **Prompt reference**: `0.dev-matrix/KIMI_PROMPT_LAUNCH_READINESS.md`
> **Last updated**: _PENDING — Kimi to fill_

---

## Summary

| Section | Tests | Passed | Failed | Skipped |
|---------|-------|--------|--------|---------|
| A. Supabase Integration | 14 | — | — | — |
| B. ProfilePage Fixes | 6 | — | — | — |
| C. PricingPage Fixes | 4 | — | — | — |
| D. MobileLayout Fixes | 4 | — | — | — |
| E. Subscription Lifecycle | 4 | — | — | — |
| F. Browser Smoke Test | 14 | — | — | — |
| G. Build Verification | 2 | — | — | — |
| **TOTAL** | **48** | **—** | **—** | **—** |

---

## Section A: Supabase Integration Tests

> Script: `scripts/test-supabase-connection.mjs`
> Run: `node --experimental-vm-modules scripts/test-supabase-connection.mjs`

| # | Test | Status | Details |
|---|------|--------|---------|
| A1 | Connection to Supabase | ⬜ | |
| A2 | All 17 tables exist | ⬜ | |
| A3 | Trucks seed: 8 rows, Tata Ace dimensions correct | ⬜ | |
| A4 | Subscription plans: 4 rows, Starter=49900 | ⬜ | |
| A5 | RLS: Public read on trucks | ⬜ | |
| A6 | RLS: Block unauth write on trucks | ⬜ | |
| A7 | RLS: Block anon read on users table | ⬜ | |
| A8 | Auth: Anon has no session | ⬜ | |
| A9 | Realtime: Subscribe + unsubscribe | ⬜ | |
| A10 | Schema: trucks columns correct | ⬜ | |
| A11 | Schema: users columns correct | ⬜ | |
| A12 | Schema: subscriptions columns correct | ⬜ | |
| A13 | Plans features JSON valid | ⬜ | |
| A14 | Performance indexes exist | ⬜ | |

**Script output**:
```
(Kimi: paste complete output here)
```

---

## Section B: ProfilePage Fixes

> File: `frontend/src/pages/ProfilePage.tsx`

| # | Fix | Status | Notes |
|---|-----|--------|-------|
| B1 | Phone uses `user?.phone` not hardcoded | ⬜ | |
| B2 | Location not hardcoded | ⬜ | |
| B3 | Camera button works or removed | ⬜ | |
| B4 | Google-linked badge shown | ⬜ | |
| B5 | "Link Google Account" button | ⬜ | |
| B6 | Subscription status displayed | ⬜ | |

**Key code changes**:
```tsx
(Kimi: paste relevant code here)
```

---

## Section C: PricingPage Fixes

> File: `frontend/src/pages/PricingPage.tsx`

| # | Fix | Status | Notes |
|---|-----|--------|-------|
| C1 | React Query fetches subscription_plans | ⬜ | |
| C2 | Fallback to static config if query fails | ⬜ | |
| C3 | DB price (paisa) → ₹ display | ⬜ | |
| C4 | Uses name_hi from DB for Hindi | ⬜ | |

**Key code changes**:
```tsx
(Kimi: paste relevant code here)
```

---

## Section D: MobileLayout Fixes

> File: `frontend/src/layouts/MobileLayout.tsx`

| # | Fix | Status | Notes |
|---|-----|--------|-------|
| D1 | Imports authStore | ⬜ | |
| D2 | Shows user avatar/initials | ⬜ | |
| D3 | Shows user name in sidebar | ⬜ | |
| D4 | Shows plan badge if subscribed | ⬜ | |

**Key code changes**:
```tsx
(Kimi: paste relevant code here)
```

---

## Section E: Subscription Lifecycle

> Files: New hook + modifications

| # | Task | Status | Notes |
|---|------|--------|-------|
| E1 | Free trial tracking (14 days) | ⬜ | |
| E2 | Usage limit display | ⬜ | |
| E3 | Expired plan banner | ⬜ | |
| E4 | `useSubscription` hook created | ⬜ | |

**Files created/modified**:
```
(Kimi: list files here)
```

**Key code**:
```tsx
(Kimi: paste useSubscription hook here)
```

---

## Section F: Browser Smoke Test

> Run: `cd frontend && npm run dev` → `http://localhost:5173`

| # | Page | URL | Status | Console Errors |
|---|------|-----|--------|---------------|
| F1 | Login | `/login` | ⬜ | |
| F2 | Redirect (unauth) | `/` | ⬜ | |
| F3 | Dashboard (auth) | `/` | ⬜ | |
| F4 | Trucks | `/management/trucks` | ⬜ | |
| F5 | Cartons | `/management/cartons` | ⬜ | |
| F6 | Customers | `/management/customers` | ⬜ | |
| F7 | Routes | `/routes` | ⬜ | |
| F8 | Tracking | `/tracking` | ⬜ | |
| F9 | Profile | `/profile` | ⬜ | |
| F10 | Sale Orders | `/sale-orders` | ⬜ | |
| F11 | Packing (3D) | `/packing` | ⬜ | |
| F12 | Pricing | `/pricing` | ⬜ | |
| F13 | Checkout | `/checkout` | ⬜ | |
| F14 | Auth Callback | `/auth/callback` | ⬜ | |

---

## Section G: Build Verification

| # | Command | Status | Output |
|---|---------|--------|--------|
| G1 | `npx tsc --noEmit` | ⬜ | |
| G2 | `npx vite build` | ⬜ | |

**tsc output**:
```
(Kimi: paste here)
```

**vite build output**:
```
(Kimi: paste here)
```

---

## Issues Found During Testing

| # | Severity | Description | File | Fixed? |
|---|----------|-------------|------|--------|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

---

## Files Modified in This Session

| File | Action | Task |
|------|--------|------|
| | | |

---

_Legend: ⬜ Not tested · ✅ PASS · ❌ FAIL · ⏭️ SKIPPED_
