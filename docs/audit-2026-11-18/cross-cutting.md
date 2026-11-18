# Cross-cutting frontend audit, 2026-11-18 (read-only)

Scope: `frontend/src` (App.tsx, layouts, pages, components, stores, lib). Evidence is `file:line` against the working tree at the time of audit. No code was changed. Test files were excluded from scans unless noted.

Method notes: link targets were collected with ripgrep over `to=`, `href=`, `navigate(`, `path:` and `action_url`. Button and accessibility counts come from a Python heuristic scan over `pages/`, `layouts/`, `components/` (541 `<button>` tags, 87 icon-only candidates, 114 unassociated input candidates). Heuristic counts are marked as such.

---

## 1. Route table (`frontend/src/App.tsx`)

Guards: `Public` = no wrapper. `Auth` = `ProtectedRoute` with no role list (any signed-in user). `Role:x` = `ProtectedRoute allowedRoles`. Inbound = in-app links (file:line). "external" = reached only from outside the app (email, provider, generated URL).

### 1a. Public and auth routes

| Path | Component (App.tsx line) | Guard | Inbound links | Status |
|---|---|---|---|---|
| `/` | RoleHome (90, 110) | Public; redirects by role | many `to="/"` / `navigate('/')` (LandingPage:123, NotFoundPage:42, PaymentCallbackPage:224) | OK |
| `/auth/callback` | AuthCallbackPage (111) | Public | LoginPage:265, OTPPage:63, SignupPage:84 | OK |
| `/pricing` | PricingPage (112) | Public | LandingPage:162,209,469; CheckoutPage:178; NewShipmentPage:216; PackingPage:713; SubscriptionPage:114; PaymentCallbackPage:218; TestPaymentPage:365 | OK |
| `/checkout` | CheckoutPage (113) | Auth | PricingPage:272 (`/checkout?…`) | OK |
| `/payment/callback` | PaymentCallbackPage (114) | Public | external: `supabase/functions/phonepe-checkout/index.ts:89` (provider return URL); TestPaymentPage:54 | OK (external) |
| `/payment/success` | PaymentCallbackPage (115) | Public | none in app; alias of the line above | ORPHAN alias |
| `/terms` | TermsPage (116) | Public | LandingPage:473, CheckoutPage:286, SubscriptionPage:222, LoginPage:768, SignupPage:383 | OK |
| `/privacy` | PrivacyPage (117) | Public | LandingPage:474, LoginPage:770, SignupPage:385, TermsPage:78 | OK |
| `/contact` | ContactPage (118) | Public | LandingPage:442,472; PricingPage:410,469,505,595; PrivacyPage:94,130; TermsPage:115; PaymentCallbackPage:230,254 | OK |
| `/support` | ContactPage variant=authenticated (119) | Auth | MobileLayout:610; CheckoutPage:223; SubscriptionPage:193 | OK |
| `/subscription` | SubscriptionPage (120) | Auth | MobileLayout:471,479,580; AgencyLayout MORE_NAV:38; AgencyBillingBanner:15; BillingGate:116 (`window.location.assign`); CheckoutPage:206,222; PaymentCallbackPage:207 | OK |
| `/driver/register` | DriverRegisterPage (121) | Public | LandingPage:150,470; DriverDashboardPage:450 | OK |
| `/agency/register` | AgencyRegisterPage (122) | Public | LandingPage:156,471; AgencyDashboardPage:254 | OK |
| `/invite/:token` | AcceptInvitePage (123) | Auth | external: `services/agencyInvitesApi.ts:123` (generated invite URL) | OK (external, dynamic) |
| `/local-start` | LocalSetupPage (124) | Public | LoginPage:450,724; SignupPage:206; AgencyDashboardPage:143 | OK |
| `/test-payment` | TestPaymentPage, DEV only (126); NotFound in prod (40-42) | Public (DEV) | none | ORPHAN (dev-only) |
| `/login` | LoginPage (131) | AuthLayout, Public | many (ProtectedRoute:42, Agency/Driver register `?mode=`, LocalSetup, OTP) | OK |
| `/signup` | SignupPage (132) | AuthLayout, Public | LandingPage:177,202,436; PricingPage:429; LoginPage:758 (`surface.signupHref`) | OK |
| `/otp` | OTPPage (133) | AuthLayout, Public | LoginPage:252; SignupPage:95 | OK |
| `/forgot-password` | ForgotPasswordPage (134) | AuthLayout, Public | LoginPage:499; ResetPasswordPage:128,259 | OK |
| `/reset-password` | ResetPasswordPage (135) | AuthLayout, Public | external: `services/supabaseApi.ts:887` (`redirectTo`, email link) | OK (external) |

### 1b. Customer shell (MobileLayout, Auth, any role) lines 139-158

| Path | Component (line) | Guard | Inbound links | Status |
|---|---|---|---|---|
| `/dashboard` | Dashboard (144) | Auth | MobileLayout navItems:40; RoleHome default for role `user` (App.tsx:94; authStore/ProtectedRoute.tsx:11-17) | OK |
| `/packing` | PackingPage (145) | Auth | navItems:42; Dashboard:205,295,525; SaleOrdersPage:257,286 | OK |
| `/routes` | RoutesPage (146) | Auth | navItems:43; Dashboard:206,302 | OK |
| `/tracking` | TrackingPage (147) | Auth | navItems:44; Dashboard:207; NewShipmentPage:164,314; PackingPage:689,676 (action_url); InvoicePage:211,226; ShipmentHistoryPage:160; TrackingPage:349 (action_url), 841 (self) | OK |
| `/booking/new` | NewShipmentPage (148) | Auth | Dashboard:208,288; TrackingPage:823 | OK |
| `/profile` | ProfilePage (149) | Auth | MobileLayout:429,600; DriverProfilePage:192,274,332 | OK (also used by drivers) |
| `/management` | ManagementPage (150) | Auth | MobileLayout:26 and 540 (sidebar button); CartonsPage:186; CustomersPage:208; TrucksPage:315 | OK |
| `/management/trucks` | TrucksPage (151) | Auth | ManagementPage:47; AgencyDashboardPage:201 | OK |
| `/management/cartons` | CartonsPage (152) | Auth | ManagementPage:55; AgencyDashboardPage:208 | OK |
| `/management/customers` | CustomersPage (153) | Auth | ManagementPage:63 | OK |
| `/sale-orders` | SaleOrdersPage (154) | Auth | navItems:41; Dashboard:469,484,495 | OK |
| `/invoice/:shipmentId` | InvoicePage (155) | Auth | TrackingPage:316 (dynamic) | OK |
| `/settings/company` | CompanyProfilePage (156) | Auth | MobileLayout:590; ProfilePage:468; InvoicePage:264; AgencyProfilePage:128,187 | OK |
| `/history` | ShipmentHistoryPage (157) | Auth | navItems:45 | OK |

### 1c. Admin (MobileLayout, `Role:admin`) lines 160-173

| Path | Component (line) | Guard | Inbound links | Status |
|---|---|---|---|---|
| `/admin` | AdminDashboardPage (165) | Role:admin | adminNavItems:25; AdminAgenciesPage:157; AdminContactPage:60; AdminPayoutsPage:150; AdminSubscriptionsPage:165; AdminUsersPage:175 | OK |
| `/admin/drivers` | AdminDriversPage (166) | Role:admin | adminNavItems:26; AdminDashboardPage:376; DriverDetailPage:242,249,309 | OK |
| `/admin/drivers/:id` | DriverDetailPage (167) | Role:admin | AdminDriversPage:286 (dynamic) | OK |
| `/admin/agencies` | AdminAgenciesPage (168) | Role:admin | adminNavItems:27; AdminDashboardPage:383 | OK |
| `/admin/payouts` | AdminPayoutsPage (169) | Role:admin | adminNavItems:29; AdminDashboardPage:390 | OK |
| `/admin/contact` | AdminContactPage (170) | Role:admin | adminNavItems:31; AdminDashboardPage:397 | OK |
| `/admin/users` | AdminUsersPage (171) | Role:admin | adminNavItems:28; AdminDashboardPage:369 | OK |
| `/admin/subscriptions` | AdminSubscriptionsPage (172) | Role:admin | adminNavItems:30; AdminDashboardPage:404 | OK |

### 1d. Driver (DriverLayout, `Role:driver`) lines 176-187

| Path | Component (line) | Guard | Inbound links | Status |
|---|---|---|---|---|
| `/driver/dashboard` | DriverDashboardPage (181) | Role:driver | DriverLayout nav:9; DriverProfilePage:186; DriverRegisterPage:222; DriverTripPage:447,475,492,952 | OK |
| `/driver/trip/:jobId` | DriverTripPage (182) | Role:driver | DriverDashboardPage:406,848 (dynamic) | OK |
| `/driver/earnings` | DriverEarningsPage (183) | Role:driver | DriverLayout nav:11; DriverProfilePage:282 | OK |
| `/driver/history` | DriverHistoryPage (184) | Role:driver | DriverLayout nav:10; DriverProfilePage:290 | OK |
| `/driver/profile` | DriverProfilePage (185) | Role:driver | DriverLayout nav:12; DriverKycPage:570 | OK |
| `/driver/kyc` | DriverKycPage (186) | Role:driver | DriverProfilePage:339 | OK (not in nav) |

### 1e. Agency (AgencyLayout, `Role:agency`) lines 190-213

Per-page staff read/act rules are in `frontend/src/lib/agencyAccess.ts:36-55`. Routes not in that map default to readable (`canReadRoute`, agencyAccess.ts:77-80), but every agency route is mapped.

| Path | Component (line) | Menu | Inbound links | Status |
|---|---|---|---|---|
| `/agency/dashboard` | AgencyDashboardPage (195) | bottom + sidebar "Home" (NAV:18) | AgencyProfilePage:122,228; AgencyRegisterPage:322; AgencyLayout | OK |
| `/agency/fleet` | AgencyFleetPage (196) | bottom "Fleet" (NAV:19) | AgencyDashboardPage:350,376; AgencyProfilePage:195 | OK |
| `/agency/jobs` | AgencyJobsPage (197) | bottom "Jobs" (NAV:21) | AgencyDashboardPage:369; AgencyLayout:108 (bell) | OK |
| `/agency/billing` | AgencyBillingPage (198) | bottom "Billing" (NAV:22) | AgencyDashboardPage:383; AgencyProfilePage:203 | OK |
| `/agency/drivers` | AgencyDriversPage (199) | bottom "Drivers" (NAV:20) | AgencyFleetPage:422 | OK |
| `/agency/rates` | AgencyRatesPage (200) | bottom "Rates" (NAV:23) | AgencyDashboardPage:390; AgencyProfilePage:211 | OK |
| `/agency/team` | AgencyTeamPage (201) | sidebar only (MORE_NAV:28) | none besides menu | OK, phone-unreachable |
| `/agency/clients` | AgencyClientsPage (202) | sidebar only (MORE_NAV:29) | menu only | OK, phone-unreachable |
| `/agency/clients/:agreementId/tariffs` | AgencyTariffsPage (203) | none | AgencyClientsPage:744 (dynamic `selected.id`) | OK, contextual |
| `/agency/orders/import` | AgencyOrderImportPage (204) | sidebar only (MORE_NAV:30) | menu only | OK, phone-unreachable |
| `/agency/consignments` | AgencyConsignmentsPage (205) | sidebar only (MORE_NAV:32) | menu only | OK, phone-unreachable |
| `/agency/invoices` | AgencyInvoicesPage (206) | sidebar only (MORE_NAV:33) | menu only | OK, phone-unreachable |
| `/agency/expenses` | AgencyExpensesPage (207) | sidebar only (MORE_NAV:34) | menu only | OK, phone-unreachable |
| `/agency/tracking` | AgencyTrackingPage (208) | sidebar only (MORE_NAV:35) | menu only | OK, phone-unreachable |
| `/agency/payroll` | AgencyPayrollPage (209) | sidebar only (MORE_NAV:36) | menu only | OK, phone-unreachable |
| `/agency/erp` | AgencyErpPage (210) | sidebar only (MORE_NAV:37) | menu only | OK, phone-unreachable |
| `/agency/orders/plan` | AgencyLoadPlanPage (211) | sidebar only (MORE_NAV:31) | menu only | OK, phone-unreachable |
| `/agency/profile` | AgencyProfilePage (212) | header and sidebar "Profile" (AgencyLayout:171, 221) | AgencyTrialPanel:72 | OK |

Staff note: `/subscription` is also in MORE_NAV (AgencyLayout:38), which staff can reach, and `AgencyLayout.tsx:47-48` filters menus by `canRead`.

### 1f. Summary

- Routed paths: 67, plus the `*` catch-all to NotFoundPage (App.tsx:216).
- ORPHAN (no in-app inbound link): `/payment/success` (App.tsx:115, alias), `/test-payment` (App.tsx:126, DEV only).
- External-only inbound (not orphans): `/payment/callback`, `/invite/:token`, `/reset-password`.
- BROKEN links: none found. Every literal, template and `action_url` target resolves to a route. Hash targets `#features` and `#how-it-works` exist (LandingPage.tsx:289, 357). Dynamic targets checked: `/admin/drivers/${id}`, `/driver/trip/${id}`, `/invoice/${shipmentId}`, `/agency/clients/${id}/tariffs`, `/tracking?shipment=`, `/checkout?…`, `/login?mode=`, `action.path` (Dashboard.tsx:360) and `card.path` (ManagementPage.tsx:93), all valid.
- Phone-unreachable (agency, see section 5): 11 MORE_NAV routes.

---

## 2. Dead pages and broken lazy imports

- Lazy imports: all 66 `React.lazy(() => import('./pages/…'))` targets exist (App.tsx:25-86). Eager imports of `pages/auth/*` (App.tsx:12-17) exist. No missing file.
- Unrouted pages: none. Every `frontend/src/pages/*.tsx` and `pages/auth/*.tsx` is imported by App.tsx. Test files (`*.test.ts`) are excluded and are not routes.
- Routed but not reachable from any menu or in-app link: `/payment/success` (App.tsx:115), `/test-payment` (App.tsx:126). Remove the alias or keep it documented for the provider.
- `TestPaymentPage.tsx` is a dev harness. Production maps it to NotFound (App.tsx:40-42), so it is not shipped as a user page. It contains user-visible PhonePe text, but only in the DEV build.

---

## 3. Role redirects and cross-area access

### 3a. Where each role lands

Role is resolved in `frontend/src/stores/authStore.ts:108-160` (`resolveAppAccess`). Priority order: admin (`users.role='admin'`, line 74), agency owner (`transport_agencies.user_id`, line 78), agency staff (active `agency_memberships` with a scope, line 87), driver (`drivers.user_id` or `users.role='driver'`, line 91), else `user`.

Post-login landing: `AuthCallbackPage.tsx:103` navigates to `consumeAuthReturnTo() || '/'`. `/` runs `RoleHome` (App.tsx:90-95), which calls `getDefaultHomePathForRole` (`components/ProtectedRoute.tsx:11-17`).

| Identity | Role in store | Lands on | Sensible? |
|---|---|---|---|
| Agency owner | `agency`, isAgencyOwner=true | `/agency/dashboard` | Yes |
| Agency staff (dispatcher, fleet, finance, viewer) | `agency`, isAgencyOwner=false | `/agency/dashboard` (ALL read, agencyAccess.ts:37) | Yes. Nav and actions are scope-filtered in AgencyLayout.tsx:47-50 and the staff read-only note (AgencyLayout.tsx:111-119) |
| Driver | `driver` | `/driver/dashboard` | Yes |
| Customer (`user`) | `user` | `/dashboard` (customer shell) | Yes |
| Admin | `admin` | `/admin` | Yes |
| Guest | none | LandingPage (`/`) | Yes |

Edge: an identity that is both driver and agency owner resolves to `agency` (driver check is after agency at authStore.ts:91), so the driver portal is unreachable for them. Document or confirm this is intended.

### 3b. Can each identity reach the other areas?

| Identity | `/agency/*` | `/driver/*` | `/admin/*` | Customer shell (`/dashboard`, `/packing`, `/management`, `/sale-orders`, `/profile` …) |
|---|---|---|---|---|
| Agency owner / staff | allowed (role gate) | blocked: PermissionDeniedState (App.tsx:190-193, ProtectedRoute.tsx:45-52) | blocked | **allowed, no role gate** (App.tsx:139-143) |
| Driver | blocked | allowed | blocked | **allowed, no role gate** |
| Customer | blocked | blocked | blocked | allowed (intended) |
| Admin | blocked (role mismatch) | blocked | allowed | allowed, no role gate |

Findings:

- **Leak (medium): the customer shell has no role gate.** App.tsx:139-143 wraps the customer routes in `<ProtectedRoute>` with no `allowedRoles`. Agency members and drivers can open `/dashboard`, `/packing`, `/management/*`, `/sale-orders`, `/invoice/:id`, `/settings/company`. Whether data is protected depends on RLS, which this audit did not verify. Fix: `allowedRoles={['user','admin']}` on that group. Caveat: the driver profile links to `/profile` (DriverProfilePage:192,274,332), so either keep `driver` in the list for `/profile` or change those links to `/driver/profile`.
- Agency staff and owners are blocked from `/driver/*` and `/admin/*`, and `/subscription` is open to staff in read mode. These are correct.
- Denied pages show `PermissionDeniedState` with the caller's own home path, which is correct.

---

## 4. Consistency scan (pages, layouts, components; tests excluded)

Counts are from `grep`, unless noted.

| Pattern | Hits | Location (file:line) | Severity |
|---|---|---|---|
| `TODO` | 1 | `pages/AdminDashboardPage.tsx:93`. The next two lines set `revenueTrend` and `driverLeaderboard` to `[]` permanently (lines 95-96), so those dashboard sections are always empty | Medium (dead UI) |
| `FIXME`, `lorem` | 0 | — | — |
| `Coming soon` / `coming soon` | 1 | `pages/NewShipmentPage.tsx:163` (toast: "NIC API integration coming soon" after saving an e-way bill) | Medium (user-visible unfinished feature) |
| `not implemented`, `placeholder` (non-attribute) | 0 user-visible | comments only: PageSkeleton.tsx:13,67,70,76; TrackingPage.tsx:192; MobileLayout.tsx:95 | Info |
| `alert(` | 0 | — | — |
| `console.log(` | 0 | — | — |
| `window.confirm(` | 3 | `pages/CartonsPage.tsx:171`, `pages/CustomersPage.tsx:192`, `pages/TrucksPage.tsx:295`. Native dialog, inconsistent with app dialogs | Low-medium |
| hard-coded `localhost` | 0 | — | — |
| hard-coded phone/email | 3 real | `config/support.ts:12,14`: `SUPPORT_PHONE_TEL='+919999352050'`, `SUPPORT_EMAIL='prakashgarg91@gmail.com'` (a personal address shown to all users via ContactPage:15-18, ErrorBoundary:141, DriverDashboardPage:629,854, DriverTripPage:505). Also `privacy@truckopti.in` (PrivacyPage:95,131) and `legal@truckopti.in` (TermsPage:116) | **High** (personal contact in production config; owner decision needed) |
| hard-coded phone/email placeholders | many | input placeholders only (e.g. CompanyProfilePage:251,256; CustomersPage:366,379; AgencyRegisterPage:249,253); `LoginPage.tsx:474` and `ForgotPasswordPage.tsx:103` use `demo.driver` as an example login | Low |
| hard-coded `₹` amounts | 3 | `pages/RoutesPage.tsx:200-201` (`distance * 12` diesel, `distance * 1.5` toll; estimator constants in code). `pages/AgencyDriversPage.tsx:172` "min ₹1" validation text. Pricing prices are in `lib/billingState` (`FALLBACK_PLAN_PRICES_PAISE`, imported at PricingPage.tsx:9) and are display fallbacks | Medium (RoutesPage constants should move to config) |
| `PhonePe` visible to users | 2 | `pages/PrivacyPage.tsx:77` (processor disclosure, legally expected; keep). `pages/TestPaymentPage.tsx:165,298,305,332-356` (DEV-only page) | Low (disclosure fine) |
| `href="#"` | 0 literal | Anchors `#features`, `#how-it-works` at `pages/LandingPage.tsx:138,144` resolve to ids (289, 357) | OK |
| `<button>` with no onClick and no `type="submit"` | 0 of 541 | scan result | OK |
| `disabled` buttons | 200 | 154 have no `title` or `aria-describedby` (heuristic; nearby helper text not checked). Top offenders: `pages/DriverDetailPage.tsx` (12: 382, 485, 499, 509, 523, 532, 573, 597, 623, 653, 661, 672), `pages/AgencyClientsPage.tsx` (6), `pages/AgencyLoadPlanPage.tsx` (7), `pages/AgencyInvoicesPage.tsx` (4), `pages/DriverTripPage.tsx` (8), `pages/AdminAgenciesPage.tsx` (5), `pages/AdminPayoutsPage.tsx` (5), `pages/AdminUsersPage.tsx` (4), `pages/AgencyPayrollPage.tsx` (3), `pages/AgencyTrackingPage.tsx` (3) | Medium (disabled with no reason) |

Severity key: High = data or safety; Medium = user-visible gap; Low = polish.

---

## 5. Navigation UX by layout

### 5a. AgencyLayout (`layouts/AgencyLayout.tsx`)

- Bottom bar, mobile, 6 items (NAV, lines 17-24; bottom bar mapping near line 261): Home, Fleet, Drivers, Jobs, Billing, Rates. Filtered by `canRead` for staff.
- Sidebar, desktop, NAV + MORE_NAV (lines 27-39, rendered at ~151): Home, Fleet, Drivers, Jobs, Billing, Rates, then Team, Clients, Orders (import), Load plan, Consignments, Invoices, Expenses, Tracking, Payroll, ERP, Subscription. Plus Profile and Sign out (lines 171, 221).
- Header on phone (lines 130-220): bell (jobs), Profile link, sign out. No menu to MORE_NAV.
- Phone-unreachable (11): Team (`/agency/team`), Clients (`/agency/clients`), Orders import, Load plan, Consignments, Invoices, Expenses, Tracking, Payroll, ERP, Subscription. Only Clients → Tariffs (AgencyClientsPage:744) and the billing banner link to Subscription are reachable on phone.

Proposed minimal "More" sheet (effort S, one file):
1. In `AgencyLayout.tsx`, add state `moreOpen`.
2. Add a 7th bottom button "More" (lucide `MoreHorizontal`, `aria-expanded={moreOpen}`) that toggles it. Use `px-3` on the bar so seven items fit at 390 px.
3. Render a fixed sheet above the bottom bar (`z-50`, `bottom-16`) with `moreNav` as `NavLink`s, `onClick={() => setMoreOpen(false)}`, plus Profile and Sign out. Reuse the same class names as the sidebar.
4. Close on `location.pathname` change, on Escape, and on backdrop click.
Alternative: keep six tabs and move Billing into the sheet.

### 5b. DriverLayout (`layouts/DriverLayout.tsx`)

- Bottom bar and sidebar both use `driverNavItems` (lines 8-13): Home, Trips (`/driver/history`), Earnings, Profile. All reachable on phone.
- Not in nav but reached in context: `/driver/trip/:jobId` (from dashboard), `/driver/kyc` (from profile). No change needed.

### 5c. MobileLayout (`layouts/MobileLayout.tsx`) for customer and admin

- Bottom bar (line 667), 6 items from `navItems` (lines 39-46): Home, Orders, Pack, Routes, Track, History.
- Hamburger drawer (sidebar, lines ~514-650): `navItems`, a Management button (`navigate('/management')`, line 540), admin items when `role==='admin'` (`adminNavItems`, lines 48-55, rendered 549-560), Profile (line 600), Support (line 610), dark toggle, Sign out (line 650). Subscription is reached via lines 471/479/580.
- Phone-unreachable: none in the drawer. Contextual only: `/booking/new` (Dashboard CTA), `/invoice/:id` (tracking). There is no `MORE_NAV` on this layout.
- Admin on phone has no bottom tabs, only the drawer. Acceptable, but the drawer is the only way to reach admin pages.

### 5d. AuthLayout (`layouts/AuthLayout.tsx`)

- No navigation. Header and footer only, with a centered card (`<Outlet/>`). No back-to-home link on login, signup, OTP, forgot or reset. Add one `Link to="/"` in the header (S), or rely on the browser back.

---

## 6. Terminology (glossary recommendation)

| Concept | Current labels (file:line) | Recommendation |
|---|---|---|
| Consignment vs GR/LR | "Consignments" nav (AgencyLayout:32), page title "Consignments (GR/LR)" (AgencyConsignmentsPage), "GR created", "Orders waiting for a GR" | Use **Consignment** as the record everywhere. Use **Lorry Receipt (LR)** or **GR** only in the document name, once per page. Drop "(GR/LR)" from headings |
| Rates vs Tariffs | "Rates" (AgencyLayout:23, `/agency/rates`), "Tariffs" button on Clients (AgencyClientsPage:744), "Rate per km (₹)" | **Rates** = agency default rate card. **Client tariffs** = per-client overrides. Rename the Clients button to "Client tariffs" |
| Billing vs Invoices vs Subscription | "Billing" nav (AgencyLayout:22), page heading "Billing & Invoices" (×2), "Invoices" nav (MORE_NAV:33), "Subscription" (MORE_NAV:38, `/subscription`), "Subscriptions" (admin, MobileLayout:30) | **Subscription** = the TruckOpti plan. **Invoices** = customer invoices. Rename the agency "Billing" tab to "Subscription & billing" only after reading AgencyBillingPage content (not verified here), or make it "Billing" and drop "& Invoices" from its heading to avoid duplicating the Invoices page |
| Jobs vs Trips vs Orders | Agency "Jobs" (AgencyLayout:21, "New Jobs" bell), driver "Trips" (DriverLayout:10, "Trip History"), agency "Orders" = import (AgencyLayout:30), customer "Orders" = sale orders (MobileLayout:40), "Booking" (`/booking/new`) | **Order** = a customer request (customer "Sale orders", agency "Order import"). **Job** = an agency assignment offered to a driver. **Trip** = a job the driver is executing or has done. Rename customer "Orders" to "Sale orders" and agency "Orders" to "Order import" |
| Shipment vs Booking | "Shipment" (13 files), "Book shipment" (`/booking/new`), "Direct App Bookings" | Customer side: **Shipment** (record), **Book shipment** (action) |
| Pack vs Packing | Nav "Pack" (MobileLayout:41), "Packing", "3D Pack" | Nav "Packing" (short label fits if the bottom bar allows) |
| Load plan vs Routes | "Routes" (customer nav), "Load plan" (agency MORE_NAV:31), "Load planning" (label) | Keep **Routes** for the customer route planner and **Load plan** for agency truck loading. Rename "Load planning" to "Load plan" |

Glossary to adopt: Order (request), Job (assignment), Trip (executed), Consignment (record), LR/GR (document), Rate card (default rates), Client tariff (override), Subscription (plan), Invoice (bill), Shipment (customer record), Load plan (loading), Route (planner).

---

## 7. Accessibility quick scan (heuristic counts)

| Check | Result | Top offenders |
|---|---|---|
| `<img>` without `alt` | 0 | — |
| Icon-only `<button>` without `aria-label` or `title` | 87 | `pages/PackingPage.tsx` (9), `layouts/MobileLayout.tsx` (8), `pages/ProfilePage.tsx` (7), `pages/TrackingPage.tsx` (6), `pages/DriverTripPage.tsx` (4), `pages/InvoicePage.tsx` (4), `pages/PricingPage.tsx` (4), `pages/AdminDriversPage.tsx` (3), `pages/ContactPage.tsx` (3), `pages/DriverRegisterPage.tsx` (3), `pages/auth/ResetPasswordPage.tsx` (3) |
| Inputs without an associated label (`htmlFor`/`id`, `aria-label`, or wrapping `<label>`) | 114 candidates; spot-checked CustomersPage:362-366 has a `<label>` with no `htmlFor`, so the count is real | `pages/AgencyRegisterPage.tsx` (15), `pages/DriverRegisterPage.tsx` (13), `pages/CustomersPage.tsx` (10), `pages/AgencyRatesPage.tsx` (9), `pages/PackingPage.tsx` (9), `pages/TrucksPage.tsx` (8), `pages/ProfilePage.tsx` (7), `pages/CartonsPage.tsx` (6) |
| `role="tab"` / `aria-selected` used | yes, e.g. AgencyClientsPage:735-741 | OK |

Contrast and keyboard checks were not run here (no browser pass).

---

## 8. Ranked top-15 fix list (smallest safe first)

| # | Fix | Files | Effort |
|---|---|---|---|
| 1 | Replace the personal `SUPPORT_EMAIL` with the company support address (owner must confirm the address) | `frontend/src/config/support.ts:14` | S |
| 2 | Remove the `/payment/success` alias or document it for the provider | `frontend/src/App.tsx:115` | S |
| 3 | Replace "NIC API integration coming soon" toast with a disabled control and reason, or hide the action | `frontend/src/pages/NewShipmentPage.tsx:163` | S |
| 4 | Add `aria-label` to the 87 icon-only buttons, starting with the top 4 files | `pages/PackingPage.tsx`, `layouts/MobileLayout.tsx`, `pages/ProfilePage.tsx`, `pages/TrackingPage.tsx` | S |
| 5 | Add a "More" sheet to expose the 11 phone-unreachable agency routes | `frontend/src/layouts/AgencyLayout.tsx` (lines 17-39, bottom bar near 261) | S |
| 6 | Rename customer "Orders" to "Sale orders" and agency "Orders" to "Order import" (glossary) | `layouts/MobileLayout.tsx:40`, `layouts/AgencyLayout.tsx:30` | S |
| 7 | Add explanations (`title` or helper text) to the top disabled-button files | `pages/DriverDetailPage.tsx`, `pages/AgencyClientsPage.tsx`, `pages/AgencyLoadPlanPage.tsx`, `pages/AdminAgenciesPage.tsx` | S-M |
| 8 | Associate labels with inputs (`htmlFor`/`id`) on the register and master-data forms | `pages/AgencyRegisterPage.tsx`, `pages/DriverRegisterPage.tsx`, `pages/CustomersPage.tsx`, `pages/TrucksPage.tsx`, `pages/CartonsPage.tsx` | M |
| 9 | Move the RoutesPage fuel and toll constants (₹12/km, ₹1.5/km) to config | `pages/RoutesPage.tsx:200-201` | S |
| 10 | Replace the three native `window.confirm` deletes with the app's confirm dialog | `pages/CartonsPage.tsx:171`, `pages/CustomersPage.tsx:192`, `pages/TrucksPage.tsx:295` | S-M |
| 11 | Gate the customer shell by role (`allowedRoles={['user','admin']}`), keeping `/profile` open to drivers or moving driver links to `/driver/profile` | `frontend/src/App.tsx:139-143`; links at `pages/DriverProfilePage.tsx:192,274,332` | S-M |
| 12 | Fix the always-empty revenue trend and driver leaderboard (implement or remove the sections) | `pages/AdminDashboardPage.tsx:93-96` | M |
| 13 | Replace the `demo.driver` placeholder with a neutral example | `pages/auth/LoginPage.tsx:474`, `pages/auth/ForgotPasswordPage.tsx:103` | S |
| 14 | Add a home link to AuthLayout header | `frontend/src/layouts/AuthLayout.tsx:8-14` | S |
| 15 | Adopt the glossary for Consignment/LR and Rates/Client tariffs labels | `pages/AgencyConsignmentsPage.tsx`, `layouts/AgencyLayout.tsx:32`, `pages/AgencyClientsPage.tsx:744` | M |

Not verified in this audit: RLS behavior behind the customer shell (item 11), AgencyBillingPage content (section 6), keyboard and contrast behavior in a browser, and the 154 disabled-button explanations, which were counted only by attribute, not by reading nearby text.
