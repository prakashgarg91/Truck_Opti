# TruckOpti — Launch Checklist

> Complete this before selling to dealer distributors.
> Updated after each Kimi session. Judge verifies each item.

---

## Phase 1: Core Infrastructure ✅ COMPLETE

| # | Item | Status | Commit |
|---|------|--------|--------|
| 1.1 | Supabase client configured | ✅ | — |
| 1.2 | 17 DB tables created | ✅ | — |
| 1.3 | 52 RLS policies | ✅ | `4c528a58` |
| 1.4 | 12 performance indexes | ✅ | — |
| 1.5 | 5 realtime tables | ✅ | — |
| 1.6 | Seed data (8 trucks, 4 plans) | ✅ | — |

## Phase 2: Authentication ✅ COMPLETE

| # | Item | Status | Commit |
|---|------|--------|--------|
| 2.1 | OTP login (SMS/WhatsApp/Telegram) | ✅ | — |
| 2.2 | Google OAuth | ✅ | `53827487` |
| 2.3 | Auth callback page | ✅ | `53827487` |
| 2.4 | Zustand auth store | ✅ | `53827487` |
| 2.5 | Protected routes | ✅ | `53827487` |
| 2.6 | User profile sync to DB | ✅ | `53827487` |

## Phase 3: Frontend Data Wiring 🔄 IN PROGRESS

| # | Item | Status | Depends on |
|---|------|--------|-----------|
| 3.1 | Dashboard: Real Supabase counts | ✅ | — |
| 3.2 | Trucks/Cartons/Customers: CRUD via Supabase | ✅ | — |
| 3.3 | ProfilePage: Real user data (phone, avatar) | ❌ Hardcoded | Kimi Task 2 |
| 3.4 | PricingPage: Query subscription_plans from DB | ❌ Static config | Kimi Task 3 |
| 3.5 | MobileLayout: User identity in sidebar | ❌ Brand only | Kimi Task 4 |
| 3.6 | CheckoutPage: Subscription creation flow | ✅ | — |

## Phase 4: Subscription Lifecycle ❌ NOT STARTED

| # | Item | Status | Depends on |
|---|------|--------|-----------|
| 4.1 | `useSubscription` hook | ❌ | Kimi Task 5 |
| 4.2 | Free trial (14-day) tracking | ❌ | 4.1 |
| 4.3 | Usage limit display | ❌ | 4.1 |
| 4.4 | Expired plan banner + redirect to pricing | ❌ | 4.1 |
| 4.5 | Upgrade/downgrade flow | ❌ | 4.1 |
| 4.6 | Razorpay webhook for payment confirmation | ❌ | Backend needed |
| 4.7 | Invoice PDF generation (GST compliant) | ❌ | Backend needed |

## Phase 5: Testing ❌ NOT STARTED

| # | Item | Status | Depends on |
|---|------|--------|-----------|
| 5.1 | Supabase integration test script | ❌ | Kimi Task 1 |
| 5.2 | Browser smoke test (14 pages) | ❌ | Kimi Task 6 |
| 5.3 | TypeScript 0 errors | ❌ | Kimi Task 7 |
| 5.4 | Vite build succeeds | ❌ | Kimi Task 7 |
| 5.5 | RLS policy verification | ❌ | Task 1 |

## Phase 6: Production Readiness ❌ NOT STARTED

| # | Item | Status | Priority |
|---|------|--------|----------|
| 6.1 | Razorpay production keys | ❌ | P0 — blocks payments |
| 6.2 | Google OAuth production credentials | ❌ | P0 — blocks login |
| 6.3 | Google Maps API key | ❌ | P1 — Leaflet fallback works |
| 6.4 | Custom domain + SSL | ❌ | P0 — needed for OAuth redirect |
| 6.5 | PWA icons (missing from public/) | ❌ | P1 — install prompt fails |
| 6.6 | Error tracking (Sentry or similar) | ❌ | P1 |
| 6.7 | Terms of Service / Privacy Policy pages | ❌ | P0 — legal requirement |
| 6.8 | Admin panel for subscriber management | ❌ | P1 |
| 6.9 | Database backups (PITR) | ❌ | P1 |
| 6.10 | Remove socket.io-client dead dep | ❌ | P2 |

---

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 1. Infrastructure | 6 | 6 | 0 |
| 2. Authentication | 6 | 6 | 0 |
| 3. Frontend Wiring | 6 | 3 | 3 |
| 4. Subscriptions | 7 | 0 | 7 |
| 5. Testing | 5 | 0 | 5 |
| 6. Production | 10 | 0 | 10 |
| **TOTAL** | **40** | **15** | **25** |

---

## Kimi Session History

| Date | Commit | Tasks Completed | Bugs Fixed (by Judge) |
|------|--------|----------------|----------------------|
| Feb 8 | — | KIMI_COMPLETION_PLAN.md created | — |
| Feb 9 | `282088e6` | Phase 0-1 verified | 1 (unsubscribe method) |
| Feb 11 | `2b630126` | Phase 2 (Maps) | 1 (popup→popupContent) |
| Feb 11 | `cfbccbf1` | Phase 3 (Business) | 1 (language crash) |
| Feb 11 | `43d535e9` | Phase 4 (Production) | 2 (import order, ErrorBoundary) |
| Feb 11 | `376380a1` | Phase 5 (Modular) | 0 |
| Feb 12 | `fd5879a9` | Phase 6 (Security) | 0 |
| Feb 12 | `d1bd9180` | Testing: isError handling | 5 (all React Query pages) |
| Feb 12 | `0724fd3e` | Testing: Zod + translations | 4 (TrucksPage, Dashboard) |
| Feb 12 | `4c528a58` | Infra: DB + OAuth + Maps | 3 (RLS policies) |
| Feb 12 | `53827487` | Auth: Full flow | 1 (phone_number→phone) |
| Feb 12 | — | DB migration executed on live | 0 |
| Feb 12 | _pending_ | Launch readiness tasks | _pending_ |
