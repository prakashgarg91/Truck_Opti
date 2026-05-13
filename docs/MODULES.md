# TruckOpti Module Map

> **Production**: https://www.truckopti.in  
> All routes defined in `frontend/src/App.tsx`.  
> Role-based access enforced by `frontend/src/components/ProtectedRoute.tsx`.

---

## Role Overview

| Role | Portal Entry | Description |
|------|-------------|-------------|
| `user` (customer) | `/dashboard` | Books shipments, tracks cargo, manages customers/trucks |
| `driver` | `/driver/dashboard` | Accepts trips, completes 7-step delivery flow |
| `agency` | `/agency/dashboard` | Manages dispatch, fleet, drivers, billing |
| `admin` | `/admin` | Platform-wide analytics, user and subscription management |
| Public | `/` | Landing page, pricing, contact, auth pages |

---

## Public / Unauthenticated Pages

| Module | File | Route | Description |
|--------|------|-------|-------------|
| Landing Page | `LandingPage.tsx` | `/` | Marketing page; authenticated users are auto-redirected to their portal |
| Login | `auth/LoginPage.tsx` | `/login` | OTP + Google OAuth sign-in; email/password option |
| Signup | `auth/SignupPage.tsx` | `/signup` | New user registration with email/phone OTP |
| OTP Verification | `auth/OTPPage.tsx` | `/otp` | 6-digit OTP entry shared by phone and email flows |
| Auth Callback | `auth/AuthCallbackPage.tsx` | `/auth/callback` | Google OAuth redirect handler; sets session and routes to portal |
| Forgot Password | `auth/ForgotPasswordPage.tsx` | `/forgot-password` | Sends password reset email |
| Reset Password | `auth/ResetPasswordPage.tsx` | `/reset-password` | Sets new password via reset link token |
| Pricing | `PricingPage.tsx` | `/pricing` | 4-tier plan grid; links to checkout |
| Checkout | `CheckoutPage.tsx` | `/checkout` | Payment gateway selection (Razorpay / PhonePe) |
| Payment Callback | `PaymentCallbackPage.tsx` | `/payment/callback` `/payment/success` | Handles return from payment gateway; verifies and activates subscription |
| Driver Registration | `DriverRegisterPage.tsx` | `/driver/register` | Multi-step driver onboarding (public — no auth required) |
| Agency Registration | `AgencyRegisterPage.tsx` | `/agency/register` | Agency self-registration form |
| Contact | `ContactPage.tsx` | `/contact` | Contact form with offline-resilient submission and draft persistence |
| Terms | `TermsPage.tsx` | `/terms` | Terms of service |
| Privacy | `PrivacyPage.tsx` | `/privacy` | Privacy policy |
| Not Found | `NotFoundPage.tsx` | `*` | 404 catch-all |

---

## Shared Authenticated Utility Pages

| Module | File | Route | Description |
|--------|------|-------|-------------|
| Support | `ContactPage.tsx` | `/support` | Authenticated support intake route that reuses the contact form with support-focused copy and back navigation |

---

## Customer / Logistics Manager Portal

> **Layout**: `MobileLayout.tsx` (bottom navigation)  
> **Auth**: Any authenticated user with role `user`  
> **Key Supabase tables**: `shipments`, `customers`, `trucks`, `cartons`, `routes`, `packing_results`

| Module | File | Route | Key Features | Supabase Tables |
|--------|------|-------|-------------|-----------------|
| Dashboard | `Dashboard.tsx` | `/dashboard` | Overview cards: active shipments, recent bookings, quick actions | `shipments`, `subscriptions` |
| New Shipment | `NewShipmentPage.tsx` | `/booking/new` | Multi-step booking flow: customer selection → truck → route → confirm | `shipments`, `customers`, `trucks`, `routes` |
| Shipment History | `ShipmentHistoryPage.tsx` | `/history` | Full booking history with status filters, search, and export | `shipments` |
| Live Tracking | `TrackingPage.tsx` | `/tracking` | Leaflet map with live driver location via `driver_locations` Realtime | `shipments`, `driver_locations` |
| Invoice | `InvoicePage.tsx` | `/invoice/:shipmentId` | PDF invoice generation (jsPDF); calls `ensureDocumentNumbers` RPC first | `shipments`, `customers` |
| Packing Optimizer | `PackingPage.tsx` | `/packing` | 3D bin-packing UI with truck/carton selection; saves results | `trucks`, `cartons`, `packing_results` |
| Route Planner | `RoutesPage.tsx` | `/routes` | Plan and save logistics routes with cost breakdown | `routes` |
| Management Hub | `ManagementPage.tsx` | `/management` | Navigation hub for trucks, cartons, customers |  |
| Truck Catalog | `TrucksPage.tsx` | `/management/trucks` | CRUD for truck specs used in packing/costing | `trucks` |
| Carton Catalog | `CartonsPage.tsx` | `/management/cartons` | CRUD for box dimensions used in packing | `cartons` |
| Customer Master | `CustomersPage.tsx` | `/management/customers` | Customer list with search; used in shipment booking and invoicing | `customers` |
| Sale Orders | `SaleOrdersPage.tsx` | `/sale-orders` | View and manage sale orders linked to shipments | `shipments` |
| Profile | `ProfilePage.tsx` | `/profile` | User profile: name, phone, notification preferences | `users` |
| Company Profile | `CompanyProfilePage.tsx` | `/settings/company` | Company GSTIN, address, logo — used in invoice header | `users` (user_metadata) |

### Customer Portal: Detailed Descriptions

**Dashboard (`/dashboard`)**  
Entry point after login for customer role users. Shows KPI cards (total shipments this month, active in-transit, pending bookings). Quick-action buttons for new booking and tracking. Uses subscription guard to gate features above plan limits.

**New Shipment (`/booking/new`)**  
Step-by-step booking wizard:
1. Select or create customer
2. Enter origin and destination with pin-code
3. Select truck type from catalog
4. Review estimated cost and confirm
5. Optionally link to a sale order

Creates a `shipments` row and optionally creates a linked `agency_jobs` row for dispatch.

**Live Tracking (`/tracking`)**  
Displays a Leaflet map. Subscribes to `driver_locations` via Supabase Realtime channel. Markers update in real time as drivers report GPS. Color-coded by shipment status.

**Invoice (`/invoice/:shipmentId`)**  
Calls `ensureDocumentNumbers()` first to guarantee `invoice_number` and `lr_number` are populated. Renders a print-ready invoice using jsPDF with company header, GST breakdown, and LR details.

---

## Driver Portal

> **Layout**: `DriverLayout.tsx` (driver-specific bottom nav)  
> **Auth**: Role must be `driver`  
> **Key Supabase tables**: `job_offers`, `agency_jobs`, `drivers`, `driver_locations`

| Module | File | Route | Key Features | Supabase Tables |
|--------|------|-------|-------------|-----------------|
| Driver Dashboard | `DriverDashboardPage.tsx` | `/driver/dashboard` | Active trip card, wallet balance, quick-accept for pending jobs | `drivers`, `agency_jobs`, `job_offers` |
| Trip Flow | `DriverTripPage.tsx` | `/driver/trip/:jobId` | 7-step delivery: Accept → Pickup OTP → Loading → Departure → En Route → Delivery OTP → Proof Photo | `job_offers`, `driver_locations` |
| Earnings | `DriverEarningsPage.tsx` | `/driver/earnings` | Wallet balance, payout history, bank details | `drivers`, `payment_history` |
| Trip History | `DriverHistoryPage.tsx` | `/driver/history` | Completed and cancelled trips with earnings per trip | `job_offers`, `agency_jobs` |

### Driver Portal: Detailed Descriptions

**Driver Dashboard (`/driver/dashboard`)**  
Shows the current active job (if any) with origin/destination and status. Wallet card with current balance. Incoming job offers appear here for acceptance. Realtime subscription on `agency_jobs` filtered by `driver_id`.

**Trip Flow (`/driver/trip/:jobId`)**  
The core driver workflow. Each step updates `job_offers.step` and triggers specific actions:
- **Step 1** (Accept): Driver accepts the job offer
- **Step 2** (Pickup OTP): Driver enters OTP provided by shipper to confirm pickup
- **Step 3** (Loading): Marks cargo loaded
- **Step 4** (Departure): Sets departure timestamp and begins GPS reporting
- **Step 5** (En Route): Continuous location updates to `driver_locations`
- **Step 6** (Delivery OTP): Driver receives OTP from recipient to confirm delivery
- **Step 7** (Proof Photo): Driver uploads delivery proof photo to Supabase Storage

---

## Agency Portal

> **Layout**: `AgencyLayout.tsx` (agency sidebar)  
> **Auth**: Role must be `agency`  
> **Key Supabase tables**: `agency_jobs`, `agency_trucks`, `drivers`, `transport_agencies`

| Module | File | Route | Key Features | Supabase Tables |
|--------|------|-------|-------------|-----------------|
| Agency Dashboard | `AgencyDashboardPage.tsx` | `/agency/dashboard` | Dispatch overview, today's jobs, revenue analytics | `agency_jobs`, `transport_agencies` |
| Job Board | `AgencyJobsPage.tsx` | `/agency/jobs` | Accept incoming jobs, assign driver + truck, track delivery status in real time | `agency_jobs`, `job_offers`, `drivers`, `agency_trucks` |
| Fleet Management | `AgencyFleetPage.tsx` | `/agency/fleet` | Add/edit trucks, track availability and maintenance status | `agency_trucks` |
| Driver Roster | `AgencyDriversPage.tsx` | `/agency/drivers` | Manage agency drivers, view active assignments | `drivers`, `agency_jobs` |
| Billing | `AgencyBillingPage.tsx` | `/agency/billing` | Generate PDF invoices for completed jobs; download LR copies | `agency_jobs`, `shipments` |
| Rate Card | `AgencyRatesPage.tsx` | `/agency/rates` | Configure per-route and per-truck pricing | `agency_jobs` |

### Agency Portal: Detailed Descriptions

**Job Board (`/agency/jobs`)**  
The primary dispatch interface. Incoming jobs arrive via Realtime subscription (`agency_jobs` INSERT). Agency staff can:
1. Accept a job (sets `status = 'accepted'`)
2. Assign a driver and truck (sets `status = 'assigned'`)
3. Monitor real-time trip status
4. Confirm final delivery

Uses bilingual (English/Hindi) toast notifications for errors.

**Billing (`/agency/billing`)**  
Generates PDF invoices using jsPDF for completed `agency_jobs`. Includes GST-compliant formatting with lorry receipt numbers. Calls `ensureDocumentNumbers()` to guarantee LR number before PDF generation.

---

## Admin Portal

> **Layout**: `MobileLayout.tsx`  
> **Auth**: Role must be `admin`  
> **Key Supabase tables**: All tables (platform-wide read access)

| Module | File | Route | Key Features | Supabase Tables |
|--------|------|-------|-------------|-----------------|
| Admin Dashboard | `AdminDashboardPage.tsx` | `/admin` | Platform KPIs: total users, revenue, active agencies, shipments today | All |
| Driver Management | `AdminDriversPage.tsx` | `/admin/drivers` | List all drivers, view status, suspend/activate | `drivers` |
| Driver Detail | `DriverDetailPage.tsx` | `/admin/drivers/:id` | Individual driver profile, trip history, wallet, documents | `drivers`, `job_offers` |
| Agency Management | `AdminAgenciesPage.tsx` | `/admin/agencies` | All registered agencies, activation status | `transport_agencies` |
| Payout Management | `AdminPayoutsPage.tsx` | `/admin/payouts` | Driver wallet payouts, batch approve/reject | `drivers`, `payment_history` |
| Contact Inbox | `AdminContactPage.tsx` | `/admin/contact` | Read and reply to contact form submissions | `contact_inquiries` |
| User Management | `AdminUsersPage.tsx` | `/admin/users` | All platform users, role assignment, account status | `users` |
| Subscription Management | `AdminSubscriptionsPage.tsx` | `/admin/subscriptions` | All subscriptions, manual overrides, expired plan handling | `subscriptions`, `subscription_plans` |

---

## Shared Components

| Component | File | Purpose |
|-----------|------|---------|
| `ProtectedRoute` | `components/ProtectedRoute.tsx` | Auth + role guard for route groups; redirects unauthenticated users to `/login` and renders a permission-denied state on role mismatch |
| `ErrorBoundary` | `components/ErrorBoundary.tsx` | Wraps the entire app; catches unhandled React render errors |
| `PageSkeleton` | `components/PageSkeleton.tsx` | Suspense fallback shown during lazy-loaded page import |
| `MapView` | `components/MapView.tsx` | Leaflet map wrapper; used in TrackingPage |
| `MapViewWrapper` | `components/MapViewWrapper.tsx` | SSR-safe wrapper ensuring Leaflet only loads in browser |
| `GoogleMapView` | `components/GoogleMapView.tsx` | Alternative Google Maps integration |
| `EmptyState` | `components/EmptyState.tsx` | Reusable empty-list placeholder with icon and CTA |
| `OfflineBanner` | `components/OfflineBanner.tsx` | Shows a banner when network connectivity is lost |
| `InstallPrompt` | `components/InstallPrompt.tsx` | PWA install banner |
| `TruckViewer` | `components/TruckViewer.tsx` | 3D truck visualization for packing optimizer |

---

## Layouts

| Layout | File | Used By |
|--------|------|---------|
| `MobileLayout` | `layouts/MobileLayout.tsx` | Customer and Admin portals — bottom tab navigation |
| `DriverLayout` | `layouts/DriverLayout.tsx` | Driver portal — driver-specific bottom nav with trip quick-access |
| `AgencyLayout` | `layouts/AgencyLayout.tsx` | Agency portal — sidebar navigation |
| `AuthLayout` | `layouts/AuthLayout.tsx` | Auth pages — centered card layout |

---

## Zustand Stores

| Store | File | State |
|-------|------|-------|
| `authStore` | `stores/authStore.ts` | `user`, `session`, `isLoading`, `isAuthenticated`, `pendingPhone` |
| `languageStore` | `stores/languageStore.ts` | `language: 'en' \| 'hi'` — bilingual toggle |

The `authStore` is the **single source of truth for auth state**. It initializes on app mount, listens to Supabase auth state changes, and resolves the user's app role by checking `users`, `transport_agencies`, and `drivers` tables in parallel.
