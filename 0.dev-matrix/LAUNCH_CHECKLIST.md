# TruckOpti — Launch Checklist

> Complete this before selling to dealer distributors.
> Updated after each Kimi session. Judge verifies each item.

## Current Launch Focus

- Product outcome: launch TruckOpti as a sellable truck-loading optimization platform for dealer distributors and logistics teams.
- Current launch slice: hold the live payment proof and stale-client recovery proof as the validated sellable launch slice, then shift AI work back to post-launch hardening instead of more launch-proof discovery.
- Current blocker: no open blocker remains inside the current payment/stale-client launch-proof lane. Production Razorpay is live, `npm run test:prod-config` passes `6/6`, the chairman completed a real payment, fresh `npm run test:public-smoke` passes `12/12`, and both `sw-v2.js` plus the root document serve `Cache-Control: no-cache, no-store, must-revalidate`. Deferred follow-up remains AWS SES invoice email setup, the accepted temporary backup/PITR posture, and broader non-launch engineering gaps (`GAP-01` and `GAP-02`).
- Next earning step: use the captured proof to onboard the first paying logistics customers, keep hosted invoice PDFs live, and reopen billing-email automation only when AWS SES setup is worth doing.

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

## Phase 2: Authentication 🟡 LAUNCH-READY, PHONE OTP STILL DEFERRED

| # | Item | Status | Commit |
|---|------|--------|--------|
| 2.1 | OTP login (Email live; phone deferred) | 🟡 | Public auth now defaults to Email OTP + Google; SMS/WhatsApp stay feature-flagged off and may be re-enabled later only through Supabase Phone + Twilio |
| 2.2 | Google OAuth | ✅ | Real Google-authenticated production admin sign-in was observed on `/admin` on 2026-05-01 after the chairman completed the flow in-browser |
| 2.3 | Auth callback page | ✅ | `53827487` |
| 2.4 | Zustand auth store | ✅ | `53827487` |
| 2.5 | Protected routes | ✅ | `53827487` |
| 2.6 | User profile sync to DB | ✅ | Implemented and exercised through the authenticated production proof lanes on 2026-05-01 |

## Phase 3: Frontend Data Wiring ✅ COMPLETE

| # | Item | Status | Depends on |
|---|------|--------|----------|
| 3.1 | Dashboard: Real Supabase counts | ✅ | — |
| 3.2 | Trucks/Cartons/Customers: CRUD via Supabase | ✅ | — |
| 3.3 | ProfilePage: Real user data (phone, avatar) | ✅ | BATCH7 |
| 3.4 | PricingPage: Query subscription_plans from DB | ✅ | BATCH7 |
| 3.5 | MobileLayout: User identity + plan badge in sidebar | ✅ | BATCH7 |
| 3.6 | CheckoutPage: Subscription creation flow | ✅ | — |

## Phase 4: Subscription Lifecycle ✅ COMPLETE

| # | Item | Status | Depends on |
|---|------|--------|----------|
| 4.1 | `useSubscription` hook | ✅ | BATCH7 T-102 |
| 4.2 | Free trial (14-day) tracking | ✅ | 4.1 |
| 4.3 | Usage limit display | ✅ | 4.1 |
| 4.4 | Expired plan detection + isCancelled state | ✅ | 4.1 |
| 4.5 | Upgrade/downgrade flow | ✅ | BATCH21 T4 verified by GLM-001 |
| 4.6 | Razorpay: verify Edge Function called on success | ✅ | BATCH6 T1 |
| 4.7 | Invoice PDF: user metadata for company info | ✅ | BATCH6 T8 |

## Phase 5: Testing ✅ CORE COMPLETE + LOCAL PREFLIGHT VERIFIED

| # | Item | Status | Depends on |
|---|------|--------|----------|
| 5.1 | Supabase integration test script | ✅ 42/42 PASS | BATCH7 T-105 |
| 5.2 | Browser smoke test (14 pages) | 🟡 Expanded to a full 47-route browser audit plus `npm run test:frontend-smoke` = 17/17 PASS for the public/auth shell on 2026-04-10; local desktop browser proof for `/` and `/pricing` was revalidated with screenshots and 0 console errors on 2026-04-16; authenticated production proof for driver/agency/customer/admin was refreshed on 2026-05-01 | Remaining gap is repeatable full driver-trip/business-action proof, not basic auth reachability |
| 5.3 | TypeScript 0 errors | ✅ | `npx tsc --noEmit` → 0 errors |
| 5.4 | Vite build succeeds | ✅ | Built in 6.57s |
| 5.5 | RLS policy verification | ✅ | Validated in test script |
| 5.6 | Repo launch-readiness preflight (`npm run launch-check`) | ✅ 17/17 PASS | 2026-04-10 current-tree verification |

## Phase 6: Production Readiness 🟡 PARTIAL

| # | Item | Status | Priority |
|---|------|--------|----------|
| 6.1 | Razorpay production keys + env integration | ✅ | P0 — live Razorpay public/backend keys are installed in Heroku + Supabase, `npm run test:prod-config` now passes `6/6`, and the live checkout bundle serves the production key path |
| 6.2 | Google OAuth production credentials | ✅ | P0 — real Google-authenticated production admin sign-in was observed on 2026-05-01 |
| 6.2b | Live Supabase auth/backend reachability | ✅ | P0 — restored on 2026-04-05 after the project was resumed |
| 6.3 | Google Maps API key | ❌ | P1 — Leaflet fallback works |
| 6.4 | Custom domain + SSL | ✅ | P0 — `truckopti.in` + `www.truckopti.in` live |
| 6.5 | PWA icons (missing from public/) | ✅ | BATCH9 verified — pwa-192x192.png, pwa-512x512.png, apple-touch-icon.png exist |
| 6.6 | Error tracking (Sentry or similar) | ✅ | Heroku `VITE_SENTRY_DSN` now points at `light9/truck-opti` as of 2026-04-16 |
| 6.7 | Terms of Service / Privacy Policy pages | ✅ | BATCH6 T9 — `/terms` and `/privacy` pages live |
| 6.8 | Admin panel for subscriber management | ✅ | AdminSubscriptionsPage |
| 6.9 | Database backups (PITR) | 🟡 | P1 — native Supabase scheduled backups/PITR are deferred while the project stays on the Free plan; launch uses the current Telegram private-channel external logical backup posture until the paid upgrade is justified |
| 6.10 | Remove socket.io-client dead dep | ✅ | GLM-001 |
| 6.11 | Photo columns migration (photo_loading_url, photo_delivery_url) | ✅ | BATCH20 T1-T8 |
| 6.12 | Subscription enforcement on booking page | ✅ | BATCH20 T1-T8 |
| 6.13 | Driver GPS broadcast during trip | ✅ | BATCH21 T3 |
| 6.14 | Subscription upgrade/downgrade UI | ✅ | BATCH21 T4 |
| 6.15 | Admin payout workflow (approve/pay) | ✅ | BATCH21 T1 |
| 6.16 | Supabase migration push (6 pending) | ✅ | Linked project `jbxncejtcbpcronndqlx` is up to date on 2026-04-16 |
| 6.17 | Sentry DSN env var configuration | ✅ | Heroku `VITE_SENTRY_DSN` set on 2026-04-16 |
| 6.18 | Auth launch alternatives documented | ✅ | GLM-005 — See `docs/AUTH_ARCHITECTURE_DECISIONS.md`. Twilio optional if Email OTP + Google OAuth accepted |

---

## Progress Summary

| Phase | Total | Done | Remaining |
|-------|-------|------|-----------|
| 1. Infrastructure | 6 | 6 | 0 |
| 2. Authentication | 6 | 5 | 1 |
| 3. Frontend Wiring | 6 | 6 | 0 |
| 4. Subscriptions | 7 | 7 | 0 |
| 5. Testing | 6 | 5 | 1 |
| 6. Production | 19 | 16 | 3 |
| **TOTAL** | **50** | **45** | **5** |

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
| Mar 03 | `975910fb` | BATCH6: T1-T9 fixes (Razorpay, PaymentCallback, OG tags, robots.txt, .gitignore security, TestPaymentPage, InvoicePage GST) | 0 |
| Mar 03 | `e3ed5088` | BATCH7: useSubscription hook, MobileLayout plan badge, Supabase test script 42/42 | 0 |
| Mar 11 | `67e290ae` | BATCH20: T1-T8 photo migration (photo_loading_url, photo_delivery_url), wallet, payroll, subscription enforcement, admin subscriptions, eway bill | 0 |
| Mar 11 | _pending_ | BATCH21: Sentry integration, Driver GPS broadcast, Subscription upgrade/downgrade, Admin payout approve/pay | 0 |
| Mar 29 | `de2840ea` / `48e55427` / `cb0daa1a` | GLM-001: security cleanup, dead dependency removal, safer UI error handling, dev-matrix audit update | 0 |
| Mar 30 | _no code change_ | GLM-002: Full launch audit — build+vuln+route+security verified, dev-matrix synced, OWNER_ACTION_CHECKLIST.md created | 0 |
| Mar 30-31 | `756285a0` / `0599fa53` / `92eb6324` / `50e519db` | Manager/OpenCode: apps/web dependency hardening + repeatable 7-gate launch preflight | 0 |
