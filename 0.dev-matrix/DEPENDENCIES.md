# 🔗 DEPENDENCIES — TruckOpti Architecture

> **TruckOpti frontend/backend module map and data flow.**
> Check here before modifying cross-cutting concerns.

---

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUCKOPTI PLATFORM                      │
│                                                            │
│  www.truckopti.in  (Heroku — Node.js server.js serving    │
│                    Vite-built React SPA in dist/)          │
│                                                            │
│   React 18 + TypeScript + Vite + Tailwind CSS             │
│   React Router v6  │  Zustand (authStore)                 │
│   Supabase JS SDK  │  React Hot Toast                     │
│   Lucide React     │  Leaflet (maps)                      │
│   jsPDF v4.1.0     │  Razorpay JS SDK                     │
│                                                            │
│               ▼ Supabase ▼                                  │
│   PostgreSQL DB (RLS)  │  Realtime Channels               │
│   Auth (OTP + OAuth)   │  Storage Buckets                 │
│   Edge Functions (Deno)│  Row-Level Security              │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 FRONTEND FILE STRUCTURE

```
frontend/src/
├── main.tsx                     Entry point
├── App.tsx                      Router (all routes defined here)
├── lib/
│   └── supabase.ts               Supabase client singleton
├── store/
│   └── authStore.ts             Zustand: user, role, agencyId, driverId
├── hooks/
│   ├── useSubscription.ts       Trial/plan status, usage limits
│   └── useRequireAuth.ts        Route protection
├── services/
│   ├── razorpayPayment.ts       Razorpay checkout → server /api/razorpay
│   └── phonepePayment.ts        PhonePe checkout → server /api/phonepe
├── utils/
│   ├── logger.ts                Safe console wrapper (no prod leaks)
│   └── formatters.ts            formatCurrency, formatDate, formatDistance
├── layouts/
│   ├── MobileLayout.tsx         Customer + driver bottom nav layout
│   └── AgencyLayout.tsx         Agency sidebar layout
└── pages/
    ├── LoginPage.tsx            OTP + Google OAuth
    ├── DashboardPage.tsx        Customer home
    ├── TrackingPage.tsx         Live shipment tracking
    ├── NewShipmentPage.tsx      Book truck flow
    ├── ShipmentHistoryPage.tsx  Customer history (BATCH12 T4 — create if missing)
    ├── CheckoutPage.tsx         Subscription payment
    ├── PricingPage.tsx          Plan selection
    ├── DriverDashboardPage.tsx  Driver home + wallet card
    ├── DriverTripPage.tsx       7-step trip flow + photo upload
    ├── DriverEarningsPage.tsx   Earnings history
    ├── DriverHistoryPage.tsx    Trip history
    ├── DriverRegisterPage.tsx   Multi-step registration (BATCH12 T3: add doc upload)
    ├── AgencyDashboardPage.tsx  Agency home + analytics
    ├── AgencyJobsPage.tsx       Accept jobs, assign drivers, confirm delivery
    ├── AgencyBillingPage.tsx    Invoice PDF generation (jsPDF)
    ├── AgencyDriversPage.tsx    Driver roster
    ├── AgencyFleetPage.tsx      Truck fleet
    ├── AdminDashboardPage.tsx   Platform analytics (BATCH12 T2: add real data)
    └── ... (see MENU-CHART.md for all routes)
```

---

## 🗄️ DATABASE TABLES

| Table | Owner Scoping | Notes |
|-------|--------------|-------|
| `users` | `auth.uid() = id` | Extends auth.users |
| `subscriptions` | `auth.uid() = user_id` | Trial/paid plans |
| `subscription_plans` | Public read | 4 tiers: Free/Pro/Business/Enterprise |
| `transport_agencies` | `auth.uid() = user_id` | Agency profile |
| `drivers` | `auth.uid() = user_id` | Driver profile + wallet |
| `agency_jobs` | `auth.uid() via agency_id` | Main job dispatch table |
| `job_offers` | driver-scoped | Realtime job offers |  
| `driver_locations` | driver-scoped | GPS updates from driver |
| `agency_trucks` | agency-scoped | Truck assignments |
| `shipments` | **⚠️ BUG-RLS-002** `USING (true)` | Cross-tenant exposure — fix needed |
| `customers` | **⚠️ BUG-RLS-001** `USING (true)` | Cross-tenant exposure — fix needed |
| `routes` | **⚠️ BUG-RLS-003** `USING (true)` | Cross-tenant exposure — fix needed |
| `trucks` | Public read +⚠️ `USING (true)` UPDATE/DELETE | BUG-RLS-005 |
| `cartons` | Public read +⚠️ `USING (true)` UPDATE/DELETE | BUG-RLS-006 |
| `packing_results` | **⚠️ BUG-RLS-004** `USING (true)` | See SECURITY.md |

### Storage Buckets
| Bucket | Access | Path pattern |
|--------|--------|--------------|
| `trip-photos` | Public read | `{driver_id}/{job_id}/{field}.{ext}` |
| `driver-docs` | Private | `{driver_id}/licence.jpg`, `{driver_id}/rc.jpg` |

---

## 🔄 DATA FLOWS

### Customer Books a Truck
```
DashboardPage "Book a Truck" button
    → /booking/new (NewShipmentPage)
    → supabase.from('shipments').insert()
    → supabase.rpc('dispatch_job_to_drivers', { shipment_id })
    → agency_jobs row inserted (status: 'pending')
    → AgencyJobsPage Realtime subscription fires → agency sees new job
```

### Driver Accepts a Job
```
DriverDashboardPage Realtime subscription on job_offers
    → 30-second countdown card appears
    → Driver taps Accept → agency_jobs update (status: 'accepted', driver_id)
    → DriverTripPage: 7-step flow (Load → Start → Photos → OTP → Done)
    → On OTP match: agency_jobs status → 'delivered'
    → AgencyJobsPage shows Confirm Delivery button
```

### Payment Flow
```
PricingPage → CheckoutPage
    → initiatePhonePePayment() → domain-validated redirect (BUG-REDIRECT-001 fixed)
    → OR initiateRazorpayPayment() → Razorpay SDK popup
    → supabase.from('subscriptions').insert()
    → [PENDING] razorpay-webhook Edge Function (BATCH12 T1)
       verifies HMAC → updates subscription to 'active'
```

### Auth Flow
```
LoginPage
    → Email OTP (supabase.auth.signInWithOtp)
    → OR Google OAuth (supabase.auth.signInWithOAuth)
    → /auth/callback → AuthCallbackPage
    → authStore populated (user, role, agencyId, driverId)
    → role-based redirect: /dashboard | /driver/dashboard | /agency/dashboard | /admin
```

---

## 📦 SERVER SIDE (server.js — Heroku)

```
server.js (Express)
    ├── POST /api/phonepe/initiate   ← PhonePe payment initiation
    ├── POST /api/razorpay/order    ← Razorpay order creation
    ├── POST /api/razorpay/verify   ← Basic signature check (BATCH12 T1: full webhook)
    └── GET  /*                     ← Serve dist/ (React SPA)
```

---

## 👀 KEY DEPENDENCIES TO WATCH

| Package | Version | Used For | Risk |
|---------|---------|----------|------|
| `@supabase/supabase-js` | latest | All DB + Auth + Realtime | Keep updated |
| `jspdf` | 4.1.0 | Invoice PDF generation | Fixed version |
| `razorpay` | latest | Payment SDK | Keep updated |
| `leaflet` | latest | Maps on tracking pages | Keep updated |
| `react-router-dom` | v6 | Routing | Don't downgrade to v5 |
| `zustand` | latest | State management | Keep updated |

---

*Last updated: 2026-03-05 | v50 | SONNET-004*
