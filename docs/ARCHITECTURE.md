# TruckOpti Architecture

> **Production**: https://www.truckopti.in  
> **Supabase Project ID**: `jbxncejtcbpcronndqlx`  
> **Hosting**: Heroku (Node.js + Vite-built SPA in `dist/`)

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TRUCKOPTI PLATFORM                          │
│                   https://www.truckopti.in                         │
│                                                                     │
│  ┌─────────────────────────────────────┐                           │
│  │         HEROKU NODE.JS HOST         │                           │
│  │  server.js — serves dist/ SPA       │                           │
│  │  /api/razorpay  — order creation    │                           │
│  │  /api/phonepe   — checksum gen      │                           │
│  │  /api/health    — uptime probe      │                           │
│  └──────────────┬──────────────────────┘                           │
│                 │                                                   │
│  ┌──────────────▼──────────────────────┐                           │
│  │       REACT SPA (Vite + TS)         │                           │
│  │                                     │                           │
│  │  React 18 │ React Router v6         │                           │
│  │  Zustand  │ React Hot Toast         │                           │
│  │  Leaflet  │ jsPDF v4.1.0            │                           │
│  │  Lucide   │ Tailwind CSS            │                           │
│  │                                     │                           │
│  │  ┌─────────────────────────────┐   │                           │
│  │  │         STORES              │   │                           │
│  │  │  authStore (session, role)  │   │                           │
│  │  │  languageStore (en/hi)      │   │                           │
│  │  └─────────────────────────────┘   │                           │
│  │                                     │                           │
│  │  ┌─────────────────────────────┐   │                           │
│  │  │        SERVICE LAYER        │   │                           │
│  │  │  supabaseApi.ts             │   │                           │
│  │  │  subscriptionApi.ts         │   │                           │
│  │  │  razorpayPayment.ts         │   │                           │
│  │  │  phonepePayment.ts          │   │                           │
│  │  │  contactInquiry.ts          │   │                           │
│  │  └──────────────┬──────────────┘   │                           │
│  └─────────────────│────────────────── ┘                           │
│                    │                                                │
│  ┌─────────────────▼────────────────────────────────────────────┐  │
│  │                    SUPABASE BACKEND                          │  │
│  │                                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │  PostgreSQL  │  │  Supabase    │  │  Edge Functions  │  │  │
│  │  │  (RLS)       │  │  Auth        │  │  (Deno/TypeScript│  │  │
│  │  │              │  │              │  │  • verify-payment│  │  │
│  │  │  17 tables   │  │  OTP email   │  │  • send-sms      │  │  │
│  │  │  RLS on all  │  │  Google OAuth│  │  • driver-payout │  │  │
│  │  │              │  │  Phone OTP * │  │                  │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────┘  │  │
│  │                                                              │  │
│  │  ┌──────────────┐  ┌──────────────┐                        │  │
│  │  │   Realtime   │  │   Storage    │                        │  │
│  │  │  Channels    │  │  Buckets     │                        │  │
│  │  │ driver_locs  │  │ proof-photos │                        │  │
│  │  │ agency_jobs  │  │ profiles     │                        │  │
│  │  └──────────────┘  └──────────────┘                        │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  * Phone OTP requires Twilio — currently [HUMAN-BLOCKED T-113]     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Entry Point

```
frontend/src/main.tsx
  └── App.tsx  (React Router v6 + Suspense + ErrorBoundary)
        ├── AuthLayout  (auth card pages)
        ├── MobileLayout  (customer + admin — bottom nav)
        ├── DriverLayout  (driver portal — driver bottom nav)
        └── AgencyLayout  (agency portal — sidebar)
```

### Code Splitting

All page-level components are lazy-loaded via `React.lazy()` + `Suspense`. Auth pages (`LoginPage`, `SignupPage`, `OTPPage`, `AuthCallbackPage`) are eagerly loaded for fast auth UX. All other pages load on first navigation.

### Directory Structure

```
frontend/src/
├── App.tsx                    Router: all routes defined here
├── main.tsx                   Vite entry, BrowserRouter wraps App
├── lib/
│   └── supabase.ts            Supabase client singleton (createClient)
├── stores/
│   ├── authStore.ts           Zustand: user, session, role, isLoading
│   └── languageStore.ts       Zustand: language 'en' | 'hi'
├── services/
│   ├── supabaseApi.ts         All DB CRUD + auth operations
│   ├── subscriptionApi.ts     Plan/subscription/invoice operations
│   ├── razorpayPayment.ts     Razorpay checkout flow
│   ├── phonepePayment.ts      PhonePe checkout flow
│   └── contactInquiry.ts     Offline-resilient contact form
├── components/
│   ├── ProtectedRoute.tsx     Auth + role gate (wraps layouts)
│   ├── ErrorBoundary.tsx      App-level error boundary
│   └── ...                   (MapView, EmptyState, etc.)
├── layouts/
│   ├── MobileLayout.tsx       Bottom nav layout
│   ├── AgencyLayout.tsx       Sidebar layout
│   ├── DriverLayout.tsx       Driver bottom nav
│   └── AuthLayout.tsx         Centered auth card
├── pages/
│   ├── auth/                  LoginPage, SignupPage, OTPPage, ...
│   ├── Dashboard.tsx          Customer dashboard
│   ├── AgencyDashboardPage.tsx
│   ├── DriverDashboardPage.tsx
│   ├── AdminDashboardPage.tsx
│   └── ...                   (40+ page files)
├── hooks/
│   └── useSubscription.ts     Trial/plan status, usage limits
└── utils/
    ├── logger.ts              Safe console wrapper (no prod leaks)
    ├── formatters.ts          formatCurrency, formatDate
    └── userFacingError.ts     UserFacingError class + toUserFacingErrorMessage
```

---

## Authentication Flow

```
User visits /login
      │
      ├─► Email OTP path:
      │     1. signInWithEmail(email) → Supabase sends magic link OTP
      │     2. User enters 6-digit code at /otp
      │     3. verifyEmailOtp(email, token) → Supabase returns session
      │     4. authStore.initialize() picks up onAuthStateChange event
      │     5. resolveAppRole() queries users/transport_agencies/drivers
      │     6. user.role set → ProtectedRoute redirects to portal
      │
      ├─► Google OAuth path:
      │     1. signInWithGoogle() → Supabase redirects to Google
      │     2. Google redirects to /auth/callback with code
      │     3. AuthCallbackPage calls supabase.auth.exchangeCodeForSession()
      │     4. authStore.initialize() fires, resolveAppRole() runs
      │     5. Redirect to /dashboard (or role-specific portal)
      │
      ├─► Password path:
      │     1. signInWithEmailPassword(identifier, password)
      │     2. If identifier is not an email, resolvePasswordLoginEmail()
      │        calls RPC resolve_login_identifier to find the email
      │     3. supabase.auth.signInWithPassword({ email, password })
      │     4. Standard session + role resolution flow
      │
      └─► Phone OTP path: [BLOCKED — requires Twilio T-113]
            signInWithPhone(phone) → SMS OTP → verifyPhoneOtp(phone, token)
```

### Session Management

- **`authStore`** holds the single Supabase `Session` object and derived `AppUser`
- `authStore.initialize()` is called once on app mount in `App.tsx`
- `supabase.auth.onAuthStateChange()` listener auto-refreshes tokens and syncs store
- **Never call `supabase.auth.getSession()` alone** for server-side auth checks — always use `supabase.auth.getUser()` which validates the JWT server-side

### Role Resolution

On every auth state change, `resolveAppRole()` runs 3 parallel queries:
1. `users` table — checks for `role = 'admin'`
2. `transport_agencies` table — presence means `role = 'agency'`
3. `drivers` table — presence means `role = 'driver'`
4. Default fallback: `'user'` (customer)

---

## Role-Based Routing

```
ProtectedRoute.tsx
  Props:
    allowedRoles?: string[]   // undefined = any authenticated user
  
  Logic:
    1. if !isAuthenticated → <Navigate to="/login" />
    2. if isLoading → show PageSkeleton
    3. if allowedRoles && !allowedRoles.includes(user.role) → <Navigate to="/" />
    4. else → render children

Route Groups in App.tsx:
  /dashboard, /packing, /routes ...  → ProtectedRoute (any role)
  /admin, /admin/*                   → ProtectedRoute allowedRoles=['admin']
  /driver/dashboard, /driver/trip/*  → ProtectedRoute allowedRoles=['driver']
  /agency/dashboard, /agency/*       → ProtectedRoute allowedRoles=['agency']
```

`getDefaultHomePathForRole(role)` maps:
- `'admin'` → `/admin`
- `'driver'` → `/driver/dashboard`
- `'agency'` → `/agency/dashboard`
- `'user'` or default → `/dashboard`

---

## Database: Row Level Security

RLS is the primary data isolation mechanism. The React service layer does NOT implement tenant filtering — it relies entirely on Postgres RLS policies evaluated on the Supabase server.

### RLS Policy Pattern

```sql
-- Standard user-owned table pattern:
ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;

-- Owner policies (most tables use auth.uid() = user_id)
CREATE POLICY "select_own" ON public.<table>
  FOR SELECT USING (user_id = auth.uid());

-- Agency-scoped tables use a join through transport_agencies:
CREATE POLICY "agency_select" ON public.agency_jobs
  FOR SELECT USING (
    agency_id IN (
      SELECT id FROM public.transport_agencies
      WHERE user_id = auth.uid()
    )
  );
```

### Known RLS Gaps (Must Fix)

| ID | Table | Issue | Risk |
|----|-------|-------|------|
| BUG-RLS-001 | `customers` | `USING (true)` on all policies | Any user can read all customers |
| BUG-RLS-002 | `shipments` | `USING (true)` on all policies | Cross-tenant shipment exposure |
| BUG-RLS-003 | `routes` | `USING (true)` on all policies | Cross-tenant route exposure |
| BUG-RLS-004 | `packing_results` | `USING (true)` | All packing results public |
| BUG-RLS-005 | `trucks` | `USING (true)` on UPDATE/DELETE | Trucks deletable by anyone |
| BUG-RLS-006 | `cartons` | `USING (true)` on UPDATE/DELETE | Cartons deletable by anyone |

---

## State Management

### Zustand Stores

**`authStore`** — the most critical store:
```typescript
{
  user: AppUser | null,       // Resolved user with role
  session: Session | null,    // Supabase session (includes JWT)
  isLoading: boolean,         // True during session init
  isAuthenticated: boolean,   // Derived: !!session
  pendingPhone: string | null // Phone number pending OTP

  // Actions:
  initialize()   // Called once on app mount
  login()        // Sets user + session
  logout()       // Clears state, calls supabase.auth.signOut()
  updateUser()   // Partial update (e.g. after profile edit)
}
```

**`languageStore`**:
```typescript
{
  language: 'en' | 'hi',
  setLanguage: (lang: 'en' | 'hi') => void
}
```

The language store drives bilingual UI across all pages. Error toasts always provide both English and Hindi messages:
```typescript
toast.error(language === 'en' ? 'Failed to load jobs' : 'काम लोड नहीं हो सका')
```

### No Server State Library

React Query / SWR are not used. Data fetching follows the direct `useEffect + useState` pattern. See `PATTERNS.md` for the standard pattern. This is intentional for simplicity at the current scale.

---

## Payment Flow

```
User selects plan on /pricing
          │
          ▼
    /checkout
    User picks: Razorpay | PhonePe
          │
  ┌───────┴────────────────────────────────────────────┐
  │ Razorpay                    PhonePe                 │
  │                                                     │
  │ 1. razorpayPayment.ts       1. phonepePayment.ts    │
  │    → POST /api/razorpay        → POST /api/phonepe  │
  │    (server creates order)      (server creates      │
  │                                 checksum + payload) │
  │ 2. Razorpay JS SDK popup    2. Redirect to PhonePe  │
  │    (loads from CDN)            payment page         │
  │                                                     │
  │ 3. On success:              3. PhonePe redirects to │
  │    paymentId + signature       /payment/callback    │
  │    sent to client              with status params   │
  │                                                     │
  │ 4. POST to Supabase         4. PaymentCallbackPage  │
  │    Edge Function to verify      calls Edge Function │
  │    signature server-side        to verify server-   │
  │                                 side                │
  │ 5. Edge Function creates    5. Same as Razorpay →   │
  │    subscription row              subscription row   │
  └───────────────────────────────────────────────────-─┘
          │
          ▼
  /payment/success
  PaymentCallbackPage confirms
  subscription active
```

**Security invariant**: Payment signature/checksum verification ALWAYS happens in Supabase Edge Functions — never in the browser React code.

---

## Realtime Architecture

Supabase Realtime (WebSocket) is used for live updates in two main flows:

### Driver Location Tracking
```
DriverTripPage.tsx
  → On step 5 (En Route):
    setInterval(1s) → supabase.from('driver_locations').upsert({driver_id, lat, lng})

TrackingPage.tsx (customer)
  → supabase.channel('driver-location-{shipmentId}')
      .on('postgres_changes', { table: 'driver_locations' }, callback)
      .subscribe()
  → Map marker updates in real time
```

### Agency Job Dispatch
```
AgencyJobsPage.tsx
  → supabase.channel('agency-jobs-{agencyId}')
      .on('postgres_changes', { event: 'INSERT', table: 'agency_jobs' }, callback)
      .subscribe()
  → New jobs appear instantly without page refresh
```

**Rule**: Always call `supabase.removeChannel(channel)` in the `useEffect` cleanup function to prevent memory leaks and stale subscriptions.

---

## Build and Deployment

### Build Pipeline
```
npm run build
  └── cd frontend && vite build
        → outputs to frontend/dist/
        → Tree-shaken, code-split, assets hashed

server.js (Node/Express)
  → serves frontend/dist/ as static files
  → all non-API routes serve index.html (SPA routing)
  → /api/* routes proxied to backend handlers
```

### Environment Variables

| Variable | Where Used | Required |
|----------|-----------|---------|
| `VITE_SUPABASE_URL` | `lib/supabase.ts` | ✅ |
| `VITE_SUPABASE_ANON_KEY` | `lib/supabase.ts` | ✅ |
| `VITE_RAZORPAY_KEY_ID` | `razorpayPayment.ts` | ✅ for payments |
| `VITE_PHONEPE_MERCHANT_ID` | `phonepePayment.ts` | ✅ for PhonePe |
| `VITE_PHONEPE_API_URL` | `phonepePayment.ts` | ✅ for PhonePe |
| `VITE_SENTRY_DSN` | Sentry init | Optional (T-116) |
| `VITE_APP_URL` | Payment callbacks | ✅ |

All `VITE_` prefixed vars are embedded at build time by Vite. They are visible in the built JS bundle — never put secrets here. Private keys (Razorpay secret, PhonePe salt) live only in Heroku config vars and are only accessed in `server.js`.

---

## Progressive Web App

TruckOpti is configured as a PWA:
- Service Worker registered in `main.tsx`
- `InstallPrompt.tsx` component triggers the native "Add to Home Screen" prompt
- `OfflineBanner.tsx` shows when network is disconnected
- Contact form drafts survive offline via `contactInquiry.ts` localStorage persistence
