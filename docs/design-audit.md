# Design Audit — Truck_Opti × Stitch coverage

Date: 2026-09-19 · Project: Stitch `projects/817968552986251880` ("TruckOpti: India's Logistics Operating System") · Adapter 0.2.0 · Read-only audit (zero mutations).

## Method & sources

- **Screens:** one `stitch_list_screens` call (journaled artifact `…stitch-mcp-state\artifacts\10636db1\817968552986251880\screen.2026-09-19T14-36-43-725Z.json`, 111,696 bytes) + one `stitch_get_screen` for `e72905bab5794849b0fcb495b7c474bc`. All 58 screen HTMLs downloaded to `.stitch-mcp/scratch/audit/*.html` (1.19 MB) and scored by script (`signals.js`, `score.js` — kept for re-runs).
- **Repo:** `frontend/src/App.tsx` (56 routes), `src/layouts/*`, `src/services/*` (API families), page-level navigation/API greps for the customer and driver journeys.
- **Deviations from the `stitch_guide` workflow:** (1) the `stitch_guide` tool is not exposed in this session (known adapter-discovery gap; skill says "prefer `stitch_guide` when exposed"), so the six rubric criteria are declared explicitly in §5 instead of quoted from section 8; (2) the list payload carries **no update-time field**, so the inventory's "Updated" column is n/a; (3) **`stitch_list_screens` under-reports: it returns 57 screens while `stitch_get_screen` still fetches `e72905bab5794849b0fcb495b7c474bc`** (generated 2026-09-19 07:40 UTC). Treat the list as eventually-inconsistent; this audit uses 58 screens.

---

## 1. Screen inventory (58)

ids are 8-char tails of `projects/817968552986251880/screens/<id>`; full ids in `.stitch-mcp/scratch/audit/inventory.json`.

| Screen id (8-char tail) | Title | Device | HTML bytes | Updated |
|---|---|---|---|---|
| `5141ba81` | Admin Health Dashboard | DESKTOP | 27166 | n/a (payload has no update time) |
| `34b07dd7` | Admin: Agency Management Hub | DESKTOP | 25852 | n/a (payload has no update time) |
| `499ab4be` | Admin: Driver Detail & Compliance Review | DESKTOP | 22893 | n/a (payload has no update time) |
| `595aec8e` | Admin: Driver Management Hub | DESKTOP | 21949 | n/a (payload has no update time) |
| `d9fafd06` | Admin: KYC Verification Detail | DESKTOP | 26721 | n/a (payload has no update time) |
| `e27cd905` | Admin: Payout Management & Triage | DESKTOP | 24877 | n/a (payload has no update time) |
| `c6441e5d` | Admin: Settlement Reconciliation | DESKTOP | 23598 | n/a (payload has no update time) |
| `52aa57b7` | Admin: Subscription Management | DESKTOP | 26554 | n/a (payload has no update time) |
| `142aa41c` | Admin: Support & Contact Inbox | DESKTOP | 25265 | n/a (payload has no update time) |
| `c16aa8ef` | Admin: User Management Hub | DESKTOP | 21919 | n/a (payload has no update time) |
| `a8b23ee2` | Agency Dispatch Board | DESKTOP | 24948 | n/a (payload has no update time) |
| `e18e7ca3` | Agency Operations Dashboard | DESKTOP | 26077 | n/a (payload has no update time) |
| `efa6bcef` | Agency Registration — TruckOpti | DESKTOP | 18153 | n/a (payload has no update time) |
| `76d2e9e6` | Agency: Billing & Financials Hub | DESKTOP | 22576 | n/a (payload has no update time) |
| `f5ac1529` | Agency: Driver Roster & Management | DESKTOP | 27798 | n/a (payload has no update time) |
| `2f54d59c` | Agency: Fleet Management & Vehicle Status | DESKTOP | 23700 | n/a (payload has no update time) |
| `05b1da56` | Agency: Rate Card Management | DESKTOP | 24237 | n/a (payload has no update time) |
| `c7700d0d` | Auth Callback — TruckOpti | DESKTOP | 11042 | n/a (payload has no update time) |
| `f1185d19` | Checkout — TruckOpti | DESKTOP | 17213 | n/a (payload has no update time) |
| `cd34b109` | Company Profile & GST Settings | DESKTOP | 20851 | n/a (payload has no update time) |
| `6ed56451` | Contact & Support — TruckOpti | DESKTOP | 18686 | n/a (payload has no update time) |
| `0b4d18c8` | Contact Support - TruckOpti | DESKTOP | 18678 | n/a (payload has no update time) |
| `37a00a15` | Customer Dashboard | DESKTOP | 24684 | n/a (payload has no update time) |
| `6d6286d4` | Customer Master — TruckOpti | DESKTOP | 22423 | n/a (payload has no update time) |
| `fc97f63d` | Customer Team & Branch Management - TruckOpti | DESKTOP | 24578 | n/a (payload has no update time) |
| `0afcac09` | Customer Tracking Control Center - TruckOpti | DESKTOP | 25577 | n/a (payload has no update time) |
| `141531b6` | Customer: New Shipment Booking | DESKTOP | 16578 | n/a (payload has no update time) |
| `05bf2a23` | Driver App Home | MOBILE | 15726 | n/a (payload has no update time) |
| `3c30c0e5` | Driver Registration — TruckOpti | DESKTOP | 14842 | n/a (payload has no update time) |
| `591699f3` | Driver Trip Detail - TruckOpti | MOBILE | 16363 | n/a (payload has no update time) |
| `180752ea` | Driver: Delivery & Proof | MOBILE | 13157 | n/a (payload has no update time) |
| `e72905ba` | Driver: Documents & KYC Upload | MOBILE | 22138 | n/a (payload has no update time) |
| `202377b7` | Driver: New Job Offer | MOBILE | 12454 | n/a (payload has no update time) |
| `b54728a4` | Driver: Pickup Workflow | MOBILE | 15954 | n/a (payload has no update time) |
| `efcc993e` | Earnings & Wallet — TruckOpti | MOBILE | 16256 | n/a (payload has no update time) |
| `b1b215f2` | Forgot Password — TruckOpti | DESKTOP | 11746 | n/a (payload has no update time) |
| `9f6e7777` | Growth & Sales Account Workspace - TruckOpti | DESKTOP | 22525 | n/a (payload has no update time) |
| `8db564ce` | Help Center - TruckOpti | DESKTOP | 22185 | n/a (payload has no update time) |
| `d7e58516` | Login — TruckOpti | DESKTOP | 14545 | n/a (payload has no update time) |
| `812ce430` | Management Hub - TruckOpti | DESKTOP | 23028 | n/a (payload has no update time) |
| `d8615375` | OTP Verification — TruckOpti | DESKTOP | 12523 | n/a (payload has no update time) |
| `e4a2980a` | Packing Optimizer — TruckOpti | DESKTOP | 20881 | n/a (payload has no update time) |
| `f0e5cc94` | Partner Webhook Logs - TruckOpti | DESKTOP | 23614 | n/a (payload has no update time) |
| `1e1497ab` | Payment Success - TruckOpti | DESKTOP | 11935 | n/a (payload has no update time) |
| `28d39c9a` | Pricing Options | DESKTOP | 21244 | n/a (payload has no update time) |
| `399e6386` | Privacy Policy — TruckOpti | DESKTOP | 19831 | n/a (payload has no update time) |
| `4a7d8f66` | Profile - TruckOpti | DESKTOP | 18716 | n/a (payload has no update time) |
| `9360baca` | Public Landing Page | DESKTOP | 23037 | n/a (payload has no update time) |
| `07a60c72` | Reset Password — TruckOpti | DESKTOP | 11861 | n/a (payload has no update time) |
| `5f312d88` | Route Planner — TruckOpti | DESKTOP | 20106 | n/a (payload has no update time) |
| `08e898da` | Sale Orders — TruckOpti | DESKTOP | 22649 | n/a (payload has no update time) |
| `a89a0c1d` | Shipment History — TruckOpti | DESKTOP | 22330 | n/a (payload has no update time) |
| `d9c0586c` | Shipment Invoice — TruckOpti | DESKTOP | 19552 | n/a (payload has no update time) |
| `daab73c1` | Signup — TruckOpti | DESKTOP | 15463 | n/a (payload has no update time) |
| `89025628` | Terms of Service — TruckOpti | DESKTOP | 17933 | n/a (payload has no update time) |
| `0d032afa` | Trip History — TruckOpti Driver App | MOBILE | 15320 | n/a (payload has no update time) |
| `7479e1a8` | Truck Catalog - TruckOpti | DESKTOP | 21480 | n/a (payload has no update time) |
| `bc073b70` | TruckOpti - India's Logistics Operating System | DESKTOP | 52654 | n/a (payload has no update time) |

## 2. Coverage matrix — routes × auth × screen

Statuses: **COVERED** (one screen maps to the route) · **DUPLICATE** (≥2 screens map to one route) · **STALE** (superseded/empty design) · **MISSING** (no covering screen). "dev-only" gaps are accepted.

| Route | Auth scope | Covering screen(s) | Status |
|---|---|---|---|
| `/` | public | Public Landing Page `9360baca` | COVERED |
| — (landing dup) | — | TruckOpti – India's LOS `bc073b70` | STALE (46-char husk; superseded by `9360baca`) |
| `/auth/callback` | public | Auth Callback `c7700d0d` | COVERED |
| `/login` | public | Login `d7e58516` | COVERED |
| `/signup` | public | Signup `daab73c1` | COVERED |
| `/otp` | public | OTP Verification `d8615375` | COVERED |
| `/forgot-password` | public | Forgot Password `b1b215f2` | COVERED |
| `/reset-password` | public | Reset Password `07a60c72` | COVERED |
| `/pricing` | public | Pricing Options `28d39c9a` | COVERED |
| `/terms` | public | Terms of Service `89025628` | COVERED |
| `/privacy` | public | Privacy Policy `399e6386` | COVERED |
| `/contact` | public | Contact & Support `6ed56451` | COVERED |
| — (contact dup) | — | Contact Support `0b4d18c8` | DUPLICATE (byte-identical text content, 1,082 ch) |
| `/support` | auth | Contact & Support `6ed56451` (authenticated variant) | COVERED |
| `/checkout` | auth | Checkout `f1185d19` | COVERED |
| `/payment/callback` | public | Payment Success `1e1497ab` | COVERED (pending/failure states undesigned — note) |
| `/payment/success` | public | Payment Success `1e1497ab` | COVERED |
| `/subscription` | auth | — | **MISSING** (customer subscription management has no design) |
| `/driver/register` | public | Driver Registration `3c30c0e5` | COVERED (device mismatch: DESKTOP design for a mobile-first signup) |
| `/agency/register` | public | Agency Registration `efa6bcef` | COVERED |
| `/dashboard` | user | Customer Dashboard `37a00a15` | COVERED |
| `/booking/new` | user | Customer: New Shipment Booking `141531b6` | COVERED |
| `/packing` | user | Packing Optimizer `e4a2980a` | COVERED |
| `/routes` | user | Route Planner `5f312d88` | COVERED |
| `/tracking` | user | Customer Tracking Control Center `0afcac09` | COVERED |
| `/history` | user | Shipment History `a89a0c1d` | COVERED |
| `/invoice/:shipmentId` | user | Shipment Invoice `d9c0586c` | COVERED |
| `/profile` | user | Profile `4a7d8f66` | COVERED (drivers are linked here from Driver Profile — cross-role, see §3) |
| `/settings/company` | user | Company Profile & GST Settings `cd34b109` | COVERED |
| `/management` | user | Management Hub `812ce430` | COVERED |
| `/management/trucks` | user | Truck Catalog `7479e1a8` | COVERED |
| `/management/cartons` | user | — | **MISSING** |
| `/management/customers` | user | Customer Master `6d6286d4` | COVERED |
| — (customer dup) | — | Customer Team & Branch Mgmt `fc97f63d` | DUPLICATE (no distinct route; overlaps `/management/customers`) |
| `/sale-orders` | user | Sale Orders `08e898da` | COVERED |
| `/admin` | admin | Admin Health Dashboard `5141ba81` | COVERED (title↔page mapping assumed; verify intent) |
| `/admin/drivers` | admin | Admin: Driver Management Hub `595aec8e` | COVERED |
| `/admin/drivers/:id` | admin | Admin: Driver Detail `499ab4be` + Admin: KYC Verification Detail `d9fafd06` | DUPLICATE (detail page + KYC review; the KYC screen was the terminology source for `e72905ba`, not a 1:1 page) |
| `/admin/agencies` | admin | Admin: Agency Management Hub `34b07dd7` | COVERED |
| `/admin/payouts` | admin | Admin: Payout Management & Triage `e27cd905` | COVERED |
| `/admin/contact` | admin | Admin: Support & Contact Inbox `142aa41c` | COVERED |
| `/admin/users` | admin | Admin: User Management Hub `c16aa8ef` | COVERED |
| `/admin/subscriptions` | admin | Admin: Subscription Management `52aa57b7` | COVERED |
| `/driver/dashboard` | driver | Driver App Home `05bf2a23` | COVERED (MOBILE ✔) |
| `/driver/trip/:jobId` | driver | Driver Trip Detail `591699f3` + Driver: Pickup Workflow `b54728a4` + Driver: Delivery & Proof `180752ea` | DUPLICATE (one page implements both stage flows; stage screens are sub-flows) |
| `/driver/earnings` | driver | Earnings & Wallet `efcc993e` | COVERED (device mismatch: DESKTOP design for a driver screen) |
| `/driver/history` | driver | Trip History `0d032afa` | COVERED (MOBILE ✔) |
| `/driver/profile` | driver | — | **MISSING** (no driver-profile design) |
| `/driver/kyc` | driver | Driver: Documents & KYC Upload `e72905ba` | COVERED (integrated 2026-09-19, `d66f10db`) |
| `/agency/dashboard` | agency | Agency Operations Dashboard `e18e7ca3` | COVERED |
| — (agency dup) | — | Agency Dispatch Board `a8b23ee2` | DUPLICATE (could equally be the `/agency/dashboard` design; ambiguous) |
| `/agency/fleet` | agency | Agency: Fleet Management `2f54d59c` | COVERED |
| `/agency/jobs` | agency | Agency Dispatch Board `a8b23ee2` | COVERED (ambiguous pairing — verify intent) |
| `/agency/billing` | agency | Agency: Billing & Financials Hub `76d2e9e6` | COVERED |
| `/agency/drivers` | agency | Agency: Driver Roster & Management `f5ac1529` | COVERED |
| `/agency/rates` | agency | Agency: Rate Card Management `05b1da56` | COVERED |
| `/agency/profile` | agency | — | **MISSING** |
| `/local-start` | dev-only | — | MISSING (accepted, dev tooling) |
| `/test-payment` | dev-only | — | MISSING (accepted, dev tooling) |
| `*` (404) | any | — | MISSING (accepted — NotFoundPage is utilitarian) |

### Orphan screens (no route consumes them)

| Screen | id | Assessment |
|---|---|---|
| Help Center | `8db564ce` | No `/help` route; candidate for a public help entry linked from footer/contact |
| Growth & Sales Account Workspace | `9f6e7777` | No matching route or page |
| Partner Webhook Logs | `f0e5cc94` | No matching route (admin-adjacent; no consumer) |
| Settlement Reconciliation | `c6441e5d` | No matching route (admin-adjacent; no consumer) |
| Customer Team & Branch Management | `fc97f63d` | No distinct route; overlaps `/management/customers` |
| TruckOpti – India's LOS landing | `bc073b70` | STALE husk (46 chars of text) |
| Contact Support | `0b4d18c8` | Identical content to `6ed56451`; keep one |
| Admin: KYC Verification Detail | `d9fafd06` | Intentional: terminology pairing for `e72905ba`; no 1:1 route |
| Driver: Pickup Workflow / Delivery & Proof | `b54728a4` / `180752ea` | Intentional: stage designs inside `/driver/trip/:jobId` |

### Near-duplicate clusters

1. **Landing ×2** — `9360baca` (2,342 ch) vs `bc073b70` (46 ch husk). Keep `9360baca`, delete/retire `bc073b70`.
2. **Contact ×2** — `6ed56451` vs `0b4d18c8`: **identical 1,082-char text**. Pure duplicate.
3. **Agency dashboard ×2** — `e18e7ca3` (ops dashboard) vs `a8b23ee2` (dispatch board): overlapping purpose; needs an explicit route pairing decision.
4. **Customer master ×2** — `6d6286d4` vs `fc97f63d`: overlapping `/management/customers` scope.
5. **Admin KYC ×2** — `499ab4be` vs `d9fafd06` both map onto `/admin/drivers/:id` (defensible if KYC becomes its own tab/page).

## 3. Button & action map

### Customer journey

| Screen/page | Action | Target | Status |
|---|---|---|---|
| Landing `9360baca` | Sign Up / Get Started, Login, Pricing, Drivers, Agencies, Contact | `/signup`, `/login`, `/pricing`, `/driver/register`, `/agency/register`, `/contact` | OK |
| Landing | "Features" / "How it works" | `#features`, `#how-it-works` anchors | OK (in-page) |
| Login/Signup/OTP/Forgot/Reset | auth submit, OTP verify, reset | supabase.auth + `/auth/callback` | OK |
| Dashboard `/dashboard` | "New Booking" | `/booking/new` | OK |
| Dashboard | "Optimize Packing", "Plan Routes" | `/packing`, `/routes` | OK |
| Dashboard | Sale-order cards / "view all" (×3) | `/sale-orders` | OK |
| New Shipment `/booking/new` | estimate pricing | `/pricing` | OK |
| New Shipment | submit booking | `customerShipmentsApi` (shipments) → redirect `/tracking` | OK |
| New Shipment | cancel/back | `navigate(-1)` | OK |
| Tracking `/tracking` | "View invoice" | `/invoice/:shipmentId` | OK |
| Tracking | "Book another" | `/booking/new` | OK |
| Tracking | history item | `/tracking?shipment=:id` (from `/history`) | OK |
| Checkout `/checkout` | pay (Razorpay) | `initiateRazorpayPayment` → `verify-payment` edge → `/payment/success` | OK |
| Checkout | pay (PhonePe) | `initiatePhonePePayment` → `/payment/callback` (polls `phonepe-status`) | OK |
| Checkout | unauthenticated / no plan | redirect `/login`, `/pricing` | OK |
| Invoice | back to tracking; "complete your profile" | `/tracking`, `/settings/company` | OK |
| Shipment History | open tracking | `/tracking?shipment=:id` | OK |
| Profile | company settings | `/settings/company` | OK |
| Contact `/contact` | submit inquiry | `contact_inquiries` via `contactInquiry` service | OK |

**Customer dead ends: none found.** Notes: `/payment/callback` covers pending/success but no designed failure state; `/subscription` route exists without a design (nav reachability depends on plan state).

### Driver journey

| Screen/page | Action | Target | Status |
|---|---|---|---|
| Driver Register `/driver/register` | multi-step register | `driverSupabaseApi.register` → `/login?mode=driver` | OK |
| Driver App Home `/driver/dashboard` | active-job card | `/driver/trip/:active_job_id` | OK |
| Driver App Home | "complete registration" (no profile) | `/driver/register` | OK |
| Driver App Home | incoming `job_offers` realtime events | **no acceptance UI exists** | **DEAD END (P0)** — offer arrives, driver has no way to accept/decline in-app; `jobOfferOtpContract` service (OTP acceptance contract) is **unused by any page**; Stitch screen `202377b7` "Driver: New Job Offer" has no route/page |
| Driver Trip `/driver/trip/:jobId` | stage progression (arrived→loaded→in transit→delivered+POD) | `persist_driver_job_offer_progress` rpc + `driverTripsApi` | OK |
| Driver Trip | location tracking | `driverSupabaseApi.upsertLocation` (driver_locations) | OK |
| Driver Trip | "call support" | `tel:18001234567` — **hardcoded, unverified number** | **FLAG (P1)** buttons-to-nowhere risk if the number is not live |
| Driver Trip | back | `/driver/dashboard` | OK |
| Earnings `/driver/earnings` | balance snapshot, trips, withdraw | `driverEarningsApi.getBalanceSnapshot/getDeliveredTrips/requestPayout` (driver_payouts) | OK |
| Trip History `/driver/history` | filter + list | `driverTripsApi.getHistory` | OK |
| Driver Profile `/driver/profile` | doc "View" links | `dl_url`/`rc_url`/`insurance_url`/`selfie_url` or "Missing" | OK (missing docs render inert label — acceptable) |
| Driver Profile | "Earnings", "Trip History" quick actions | `/driver/earnings`, `/driver/history` | OK |
| Driver Profile | "Account Center", "Refresh Settings" | `/profile` (customer MobileLayout!) | **FLAG (P2)** — cross-role navigation leaves DriverLayout mid-session |
| Driver Profile | "Documents & KYC" | `/driver/kyc` | OK (integrated) |
| Driver KYC `/driver/kyc` | uploads, submit | **client-simulated only** | **FLAG (P0, see §4)** |

**Driver dead ends: 1 P0** (job-offer acceptance), **1 P1** (hardcoded support number), **1 P2** (cross-role `/profile` links).

## 4. API map — endpoints ↔ screen actions

| API family (service) | Endpoints / tables | Consumed by (screens/actions) | Gaps |
|---|---|---|---|
| auth (`lib/supabase`) | supabase.auth | Login, Signup, OTP, Forgot/Reset, AuthCallback | — |
| shipments (`customerShipmentsApi` etc., 19×) | `shipments`, `invoices`, `ensure_shipment_document_numbers` rpc | New Shipment create; Tracking; History; Invoice | — |
| dashboard (`customerDashboardApi`, `packingJobsSupabaseApi`, `saleOrdersSupabaseApi`, `analyticsSupabaseApi`) | `packing_jobs`, `sale_orders`, `analytics_events` | Customer Dashboard cards/stats | — |
| tracking (`customerTrackingApi`, `notificationsSupabaseApi`) | `shipments`, `notifications`, `routes` | Tracking | — |
| payments (`razorpayPayment`, `phonepePayment`) | `verify-payment`, `phonepe-status` edges; `payment_history` | Checkout, PaymentCallback | failure-state design missing |
| subscription (`subscriptionApi`) | `subscription_plans`, `subscriptions`, `usage_tracking`, `check_usage_limit`/`increment_usage`/`has_active_subscription` rpcs | Checkout, `/subscription` | `/subscription` has **no design** |
| contact (`contactInquiry`) | `contact_inquiries` | Contact/Support | — |
| driver core (`driverSupabaseApi`) | `drivers` | DriverRegister, DriverProfile, DriverDashboard, DriverTrip | — |
| driver trips (`driverTripsApi`, `driverTripProgress`) | `job_offers`, `persist_driver_job_offer_progress` rpc, `driver_locations` | DriverTrip, DriverHistory, DriverDashboard (realtime) | **inbound job-offer acceptance has no UI** (see §3) |
| driver earnings (`driverEarningsApi`) | `driver_payouts` | DriverEarnings | — |
| **driver KYC (`driverKycDocuments`)** | **none — client-simulated state machine** | `/driver/kyc` uploads, review states, submit | **UNMAPPED BOTH DIRECTIONS (P0):** uploads never persist (no storage upload, no `drivers` column writes); `pending_review`/`rejected`/`accepted` are mock transitions; admin KYC screen `d9fafd06` has no API link to these documents either. Demo seed via `?demo=midflow` is client-side by design |
| **OTP job-offer contract (`jobOfferOtpContract`)** | contract for `job_offers` OTP acceptance | **nothing — service is dead code** | **UNMAPPED BOTH DIRECTIONS (P0):** the screen (`202377b7`), the data (`job_offers`), and the contract service exist; no page ties them together |
| admin (`adminSupabaseApi`) | `users`, `drivers`, `agencies`, `contact_inquiries` | `/admin/*` pages | admin KYC review does not read the KYC screen's (simulated) documents |
| agency portal (`agencyPortalApi`, `agencySupabaseApi`) | `agency-portal-{rates,jobs,fleet,drivers,billing}` edges, `agency_jobs`, `transport_agencies` | `/agency/*` pages | — |
| local-first (`localApi`, PGlite) | local db | packing/dashboard local mode | — |

**Summary of unmapped (both directions):** `driverKycDocuments` (simulated by design — needs storage + review wiring) and `jobOfferOtpContract` (dead code awaiting its page). Single-direction gaps: 4 routes without designs (`/subscription`, `/agency/profile`, `/management/cartons`, `/driver/profile`), 5 orphan screens without routes, 2 duplicate clusters needing dedupe.

## 5. Quality rubric

`stitch_guide` §8 was unavailable (tool not exposed this session), so the six criteria are declared here; each screen scored 1–5 mechanically from its HTML (script kept at `.stitch-mcp/scratch/audit/{signals,score}.js`):

1. **St — Semantic structure**: viewport meta, exactly one `h1`, main/header/nav/section landmarks.
2. **C — Content richness**: text volume bands (empty → overstuffed).
3. **I — Interaction affordances**: count/variety of labeled buttons, inputs, links.
4. **A — Accessibility**: `aria-*`, `alt`, `label`, focus styles, ≥44 px touch hints.
5. **R — Responsive**: media queries / breakpoint classes (for DESKTOP boards a low R means "fixed layout, no adaptive breakpoints" — moderate severity; the real-world issue is device *mismatch*, called out in §2).
6. **Cn — Consistency**: Tailwind usage, app-blue palette presence, Inter, sane color count.

**POOR verdict** = average < 3.0 or any criterion scored 1.

| id | Screen | St | C | I | A | R | Cn | Avg | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `5141ba81` | Admin Health Dashboard | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `34b07dd7` | Admin: Agency Management Hub | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `499ab4be` | Admin: Driver Detail & Compliance Review | 5 | 5 | 5 | 2 | 1 | 3 | 3.5 | **POOR** |
| `595aec8e` | Admin: Driver Management Hub | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `d9fafd06` | Admin: KYC Verification Detail | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `e27cd905` | Admin: Payout Management & Triage | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `c6441e5d` | Admin: Settlement Reconciliation | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `52aa57b7` | Admin: Subscription Management | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `142aa41c` | Admin: Support & Contact Inbox | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `c16aa8ef` | Admin: User Management Hub | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `a8b23ee2` | Agency Dispatch Board | 3 | 5 | 5 | 2 | 3 | 3 | 3.5 | ok |
| `e18e7ca3` | Agency Operations Dashboard | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `efa6bcef` | Agency Registration — TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `76d2e9e6` | Agency: Billing & Financials Hub | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `f5ac1529` | Agency: Driver Roster & Management | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `2f54d59c` | Agency: Fleet Management & Vehicle Status | 5 | 5 | 4 | 3 | 1 | 3 | 3.5 | **POOR** |
| `05b1da56` | Agency: Rate Card Management | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `c7700d0d` | Auth Callback — TruckOpti | 5 | 3 | 3 | 2 | 1 | 3 | 2.83 | **POOR** |
| `f1185d19` | Checkout — TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `cd34b109` | Company Profile & GST Settings | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `6ed56451` | Contact & Support — TruckOpti | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `0b4d18c8` | Contact Support - TruckOpti | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `37a00a15` | Customer Dashboard | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `6d6286d4` | Customer Master — TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `fc97f63d` | Customer Team & Branch Management - TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `0afcac09` | Customer Tracking Control Center - TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `141531b6` | Customer: New Shipment Booking | 5 | 3 | 5 | 3 | 3 | 3 | 3.67 | ok |
| `05bf2a23` | Driver App Home | 4 | 3 | 5 | 2 | 1 | 3 | 3 | **POOR** |
| `3c30c0e5` | Driver Registration — TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `591699f3` | Driver Trip Detail - TruckOpti | 5 | 3 | 5 | 1 | 1 | 3 | 3 | **POOR** |
| `180752ea` | Driver: Delivery & Proof | 5 | 3 | 5 | 2 | 1 | 3 | 3.17 | **POOR** |
| `e72905ba` | Driver: Documents & KYC Upload | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `202377b7` | Driver: New Job Offer | 4 | 3 | 3 | 1 | 1 | 3 | 2.5 | **POOR** |
| `b54728a4` | Driver: Pickup Workflow | 5 | 3 | 5 | 3 | 1 | 3 | 3.33 | **POOR** |
| `efcc993e` | Earnings & Wallet — TruckOpti | 5 | 3 | 5 | 2 | 1 | 3 | 3.17 | **POOR** |
| `b1b215f2` | Forgot Password — TruckOpti | 5 | 3 | 5 | 3 | 3 | 3 | 3.67 | ok |
| `9f6e7777` | Growth & Sales Account Workspace - TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `8db564ce` | Help Center - TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `d7e58516` | Login — TruckOpti | 5 | 3 | 5 | 3 | 3 | 3 | 3.67 | ok |
| `812ce430` | Management Hub - TruckOpti | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `d8615375` | OTP Verification — TruckOpti | 4 | 3 | 5 | 1 | 3 | 3 | 3.17 | **POOR** |
| `e4a2980a` | Packing Optimizer — TruckOpti | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `f0e5cc94` | Partner Webhook Logs - TruckOpti | 5 | 5 | 4 | 2 | 3 | 3 | 3.67 | ok |
| `1e1497ab` | Payment Success - TruckOpti | 5 | 3 | 3 | 1 | 1 | 3 | 2.67 | **POOR** |
| `28d39c9a` | Pricing Options | 5 | 5 | 3 | 2 | 3 | 3 | 3.5 | ok |
| `399e6386` | Privacy Policy — TruckOpti | 5 | 4 | 5 | 1 | 3 | 3 | 3.5 | **POOR** |
| `4a7d8f66` | Profile - TruckOpti | 5 | 5 | 5 | 3 | 3 | 3 | 4 | ok |
| `9360baca` | Public Landing Page | 5 | 5 | 5 | 2 | 3 | 3 | 3.83 | ok |
| `07a60c72` | Reset Password — TruckOpti | 4 | 3 | 5 | 3 | 3 | 3 | 3.5 | ok |
| `5f312d88` | Route Planner — TruckOpti | 5 | 5 | 5 | 3 | 1 | 3 | 3.67 | **POOR** |
| `08e898da` | Sale Orders — TruckOpti | 5 | 5 | 4 | 2 | 1 | 3 | 3.33 | **POOR** |
| `a89a0c1d` | Shipment History — TruckOpti | 5 | 5 | 4 | 3 | 3 | 3 | 3.83 | ok |
| `d9c0586c` | Shipment Invoice — TruckOpti | 5 | 5 | 5 | 2 | 1 | 3 | 3.5 | **POOR** |
| `daab73c1` | Signup — TruckOpti | 4 | 3 | 5 | 3 | 1 | 3 | 3.17 | **POOR** |
| `89025628` | Terms of Service — TruckOpti | 5 | 4 | 5 | 1 | 3 | 3 | 3.5 | **POOR** |
| `0d032afa` | Trip History — TruckOpti Driver App | 5 | 3 | 5 | 1 | 1 | 3 | 3 | **POOR** |
| `7479e1a8` | Truck Catalog - TruckOpti | 4 | 5 | 4 | 2 | 1 | 3 | 3.17 | **POOR** |
| `bc073b70` | TruckOpti - India's Logistics Operating System | 3 | 1 | 5 | 2 | 3 | 3 | 2.83 | **POOR** |

**Systemic findings (averages):** structure 4.83 · content 4.38 · interactions 4.66 · **accessibility 2.43** · **responsive 2.14** · consistency 3.00.

- **Accessibility is the systemic failure:** average **0.2 `aria-*` attributes per screen** across all 58; 20 screens have zero focus styles; alt/label usage is near-zero. Screen-level a11y must come from the app implementation (as done in `DriverKycPage`, which adds aria-labels, focus rings and 48 px targets the generated screen lacked) **and** from briefs (add explicit a11y requirements to every future generation brief).
- **Responsive** failures are mostly DESKTOP boards with fixed layouts (moderate), plus genuine device mismatches: driver-journey screens designed as DESKTOP (`efcc993e` earnings, `3c30c0e5` registration) although drivers work on phones.
- **POOR set (29):** `05bf2a23` `08e898da` `0d032afa` `142aa41c` `180752ea` `1e1497ab` `202377b7` `2f54d59c` `399e6386` `3c30c0e5` `499ab4be` `52aa57b7` `591699f3` `5f312d88` `6d6286d4` `7479e1a8` `76d2e9e6` `89025628` `9f6e7777` `b54728a4` `bc073b70` `c7700d0d` `d8615375` `d9c0586c` `daab73c1` `e72905ba` `efcc993e` `f5ac1529` `fc97f63d`. (Includes the freshly integrated KYC screen `e72905ba` — its app implementation mitigates A/R; the *screen* still scores as generated.)

## 6. Prioritized backlog

### P0 — core-journey gaps (block the driver revenue loop)

1. **Driver job-offer acceptance is unreachable.** Screen `202377b7` (MOBILE) exists; `job_offers` table + realtime channel exist; `jobOfferOtpContract` service exists and is unused. Build `/driver/job-offer/:offerId` (accept → OTP verify → trip start) wiring screen ↔ service ↔ table. *Evidence: §3 dead end, §4 unmapped.*
2. **KYC uploads are client-simulated.** `/driver/kyc` needs storage uploads + `drivers` document columns + admin review outcome feed (close the loop with admin screen `d9fafd06`). Until then driver onboarding cannot complete for real. *Evidence: §4 unmapped both directions.*
3. **`stitch_list_screens` under-reports** (57 listed vs 58 fetchable; no update timestamps). Adapter/upstream consistency issue — blocks reliable audits/automation. Escalate to the adapter owner; not a repo code change.

### P1 — POOR screens on live journeys + missing designs

4. Regenerate/fix driver MOBILE screens in the POOR set with a11y + true MOBILE device: `05bf2a23` (home), `591699f3` (trip), `b54728a4` (pickup), `180752ea` (delivery+POD), `0d032afa` (history), `202377b7` (job offer — with #1), and redesign `efcc993e` (earnings) + `3c30c0e5` (registration) as MOBILE (device mismatch).
5. Design the four MISSING screens: `/driver/profile`, `/subscription`, `/agency/profile`, `/management/cartons`.
6. Fix driver dead ends: replace hardcoded `tel:18001234567` with the real support number (or a config), and stop linking drivers into the customer `/profile` layout (driver-scoped account section).
7. Auth/public POOR screens (`d8615375` OTP, `daab73c1` signup, `c7700d0d` auth-callback, `1e1497ab` payment success + failure states): add error/empty/loading states and a11y before next regeneration cycle.

### P2 — polish & dedupe

8. Retire `bc073b70` (stale landing husk) and one of the identical contact pair (`0b4d18c8`/`6ed56451`).
9. Decide agency pairing: `e18e7ca3` ↔ `/agency/dashboard`, `a8b23ee2` ↔ `/agency/jobs` (or merge); decide `fc97f63d` vs `6d6286d4` for `/management/customers`.
10. Judge orphan value: `8db564ce` Help Center (candidate for a public route), `9f6e7777`, `f0e5cc94`, `c6441e5d` (park or delete with owner sign-off).
11. Consistency pass on high-traffic screens: Material-style hexes → app token equivalents in briefs; add a standing a11y clause (aria labels, focus styles, 48 px targets, alt text) to the generation-brief template.

---

*Audit artifacts kept for re-runs: `.stitch-mcp/scratch/audit/` (inventory.json, signals.json, rubric.json, 58 HTMLs, scripts). Stitch calls used: `stitch_status` ×1, `stitch_list_screens` ×1, `stitch_get_screen` ×1 — all read-only.*

---

## 2026-10-03 addendum — TO-123 auth-surface usability pass (no Stitch mutations)

Scope: the five auth routes (`/login` + `?mode=driver|agency|office|partner`, `/signup`, `/forgot-password`) were repaired in code, not regenerated — P0 journey fix (login surfaces could render unusable/dead methods). No new screens; coverage table above is unchanged. Zero Stitch mutations this session (read-only `stitch_status` + `stitch_guide` only).

### What changed on each surface (actual route evidence)

| Route | Before | After (verified in browser, see evidence below) |
|---|---|---|
| `/login` (any surface mode) | OTP form rendered even with zero OTP channels; Google rendered "(needs setup)" with env-var copy; office blocked state leaked `VITE_AUTH_PASSWORD_ENABLED=true` | Method availability now comes from the canonical capability model (`frontend/src/lib/authSurfaceMethods.ts`): only enabled+configured methods render; no-method state shows honest maintenance copy plus a clearly separate device-local workspace entry |
| `/login?mode=office|partner` | Dead end when password flag off (env-name notice, no usable path) | Working password path when provisioned; honest administrator-notice blocked state otherwise; keyboard focus lands on the identifier field |
| `/signup` | "Email Signup Disabled" button rendered when flags off | Honest notice + Google path when available, or maintenance card with device-local entry; chooser only when both email-OTP and password exist |
| `/forgot-password` | Reset form reachable even with password auth disabled | Honest "resets unavailable" notice; form only renders when password sign-in is enabled |

Accessibility added: `aria-pressed` on the sign-in/signup method toggles and OTP channel buttons, `role="alert"` + `aria-describedby` on inline errors, `autoComplete` on identifier/password/email/tel/name inputs, pending/disabled submit states preserved, keyboard flow to the local workspace verified by script.

### Route evidence (executed 2026-10-03)

- Command: `PUBLIC_APP_URL=http://localhost:4173 npm run test:frontend-smoke` (local-first build) → exit 0, **63/63 checks** (`logs/frontend_launch_smoke_report.json`). New checks this pass: 5 login surfaces × 2 viewports (390×844, 1280×900) asserting surface titles, zero console/page errors and forbidden copy (`VITE_`, `needs setup`, `in this environment`), plus a keyboard-driven check (Tab → Enter) from `/login` to `/local-start`.
- Screenshots: `logs/auth-surface-smoke/login-{default,driver,agency,office,partner}-{mobile-390x844,desktop-1280x900}.png` (10 files; gitignored artifact folder).
- Method-combination matrix (no-provider / Google-only / password-only / email-only / phone combos) is proven by unit tests on the real page components because env flags are baked at build time: `frontend/src/pages/auth/LoginPage.test.ts` (16 tests), `SignupPage.test.ts` (5), `lib/authSurfaceMethods.test.ts` (5); full suite 481/481.

### Backlog update

- Resolved from §2/§3: `/login`, `/signup`, `/forgot-password` honest-state gaps and the §5 accessibility systemic finding **for the auth surfaces only** (auth pages now carry labels, error semantics and focus behavior the generated screens lacked).
- Still open (P1, unchanged): §6 item 7's non-auth POOR screens (`d8615375` OTP, `c7700d0d` auth-callback, `1e1497ab` payment success/failure states) and the §2 MISSING designs (`/subscription`, `/agency/profile`, `/management/cartons`, `/driver/profile`).
- Next proposed item (one-line evidence): OTP screen `d8615375` remains the only auth-adjacent POOR screen with no error-state design — fold its error/loading states into TO-139 (UX audit) rather than a new generation.
