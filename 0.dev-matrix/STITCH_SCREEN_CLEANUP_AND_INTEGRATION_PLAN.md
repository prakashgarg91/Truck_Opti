# Stitch Screen Cleanup And Integration Plan

Date: 2026-05-06
Source of truth:
- Live Stitch project `projects/817968552986251880`
- `docs/MODULES.md`
- `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md`

## Scope

This plan turns the live Stitch audit into an execution sequence.

The current Stitch project is usable as the base for TruckOpti, but it needs four deliberate passes:

1. Remove exact duplicates and resolve near-duplicate title drift.
2. Bring the prototype to current route parity with the shipped app.
3. Add future-state partner, reviewer, demo, and permission surfaces from the approved roadmap.
4. Add missing exception and degraded-state coverage without creating more duplicate root screens.

## Live Inventory Snapshot

- Current live inventory: `81` total screens.
- Current unique titles: `53`.
- Exact duplicate copies: `28`.
- Duplicate concentration: `26` of the extra copies are in public/auth/common screens.
- Current actor split:
  - Public/Auth/Common: `48` raw / `22` unique / `26` duplicate copies
  - Customer: `5` raw / `5` unique
  - Driver: `8` raw / `7` unique / `1` duplicate copy
  - Agency: `8` raw / `7` unique / `1` duplicate copy
  - Admin: `10` raw / `10` unique
  - Meta: `2` raw / `2` unique

## Stitch Options To Use

Use the Stitch UI and MCP actions deliberately instead of treating every change as a new screen.

- `Change with AI` / `Modify`: use for improving a kept screen that already matches a real route or role surface.
- `Edit text`: use for title cleanup, label cleanup, and variant naming only.
- `Connect to screen`: use for alternate states, success/error branches, role handoffs, and step-to-step workflow transitions.
- `Imagine new screen`: use only for a screen that is genuinely absent from the canonical target inventory below.
- `Preview`: use after each family cleanup to validate flow continuity instead of counting screens.
- `Export`: use only after a screen family is stable enough to map into the frontend.

## Canonical Cleanup Target

After exact-duplicate removal and near-duplicate consolidation, the current base should be reduced from `53` unique titles to a `49`-screen canonical base before adding missing route screens.

### Public, Auth, And Shared Base

Keep these as the canonical public/shared set:

- `Public Landing Page`
- `Pricing Options`
- `Login - TruckOpti`
- `Signup - TruckOpti`
- `OTP Verification - TruckOpti`
- `Forgot Password - TruckOpti`
- `Reset Password - TruckOpti`
- `Auth Callback - TruckOpti`
- `Driver Registration - TruckOpti`
- `Agency Registration - TruckOpti`
- `Payment Success - TruckOpti` (repurpose existing `Checkout & Payment Success`)
- `Contact Support - TruckOpti Public` (rename from `Contact & Support - TruckOpti Public`)
- `Contact Support - TruckOpti` (rename from `Contact & Support - TruckOpti`)
- `Help Center - TruckOpti` (rename from `Support & Help Center - TruckOpti`)
- `Terms of Service - TruckOpti`
- `Privacy Policy - TruckOpti`

### Customer Base

- `Customer Dashboard`
- `Customer: New Shipment Booking`
- `Customer: Live Shipment Tracking - Mobile` (rename from `Customer: Live Shipment Tracking`)
- `Customer Tracking Control Center - TruckOpti` (rename from `Customer: Live Shipment Tracking (Desktop)`)
- `Shipment History - TruckOpti`
- `Shipment Invoice - TruckOpti`
- `Packing Optimizer - TruckOpti`
- `Route Planner - TruckOpti`
- `Management Hub - TruckOpti`
- `Customer Master - TruckOpti`
- `Company Profile & GST Settings`

### Driver Base

- `Driver App Home`
- `Driver: New Job Offer`
- `Driver: Pickup Workflow`
- `Driver: Delivery & Proof`
- `Earnings & Wallet - TruckOpti`
- `Trip History - TruckOpti Driver App`

### Agency Base

- `Agency Operations Dashboard`
- `Agency Dispatch Board`
- `Agency: Fleet Management & Vehicle Status`
- `Agency: Driver Roster & Management`
- `Agency: Rate Card Management`
- `Agency: Billing & Financials Hub`

### Admin Base

- `Admin Health Dashboard`
- `Admin: Agency Management Hub`
- `Admin: Driver Management Hub`
- `Admin: Driver Detail & Compliance Review`
- `Admin: KYC Verification Detail`
- `Admin: Payout Management & Triage`
- `Admin: Settlement Reconciliation`
- `Admin: Subscription Management`
- `Admin: Support & Contact Inbox`
- `Admin: User Management Hub`

### Archive Out Of The Production Prototype Lane

- `TruckOpti Logistics Platform`
- `TruckOpti Product Requirements & Blueprint`
- `Shipment History - TruckOpti Customer Portal`
- `Shipment Invoice - TruckOpti Customer Portal`

## Actor And Journey Workstream Plan

### Public Discovery And Auth

Status:
- Coverage is broad enough for launch-facing marketing and auth.
- The family is badly duplicated and currently wastes most of the prototype surface.

Actions:
- Keep one screen per real route or role surface.
- Split `Checkout & Payment Success` into a dedicated payment-result screen and add a separate dedicated checkout screen.
- Keep legal and support pages only once each.
- Rename any intentional public variants with explicit role labels.

Exit criteria:
- One public marketing root.
- One screen per auth route.
- One contact form screen plus one help-center screen.
- No public/auth title appears more than once.

### Customer Booking And Operations

Status:
- Core booking, tracking, invoice, packing, and route planning are present.
- Master-data and account-management coverage is incomplete.

Actions:
- Keep both tracking screens only if one is explicitly the desktop control view.
- Merge customer history and invoice duplicates into one canonical screen each.
- Add the missing management/account screens from the shipped app.

Exit criteria:
- Current customer routes from `docs/MODULES.md` all have a matching canonical Stitch screen.
- Customer master-data screens can branch from `Management Hub - TruckOpti` without creating duplicate roots.

### Driver Journey

Status:
- Main mobile driver flow exists.
- The active trip lifecycle is fragmented across separate screens instead of one canonical trip-detail shell with connected states.

Actions:
- Generate one canonical `Driver Trip Detail - TruckOpti` screen.
- Keep `Driver: New Job Offer`, `Driver: Pickup Workflow`, and `Driver: Delivery & Proof` as connected branches or step views, not separate unconnected islands.
- Connect wallet and trip history from the home screen and trip-completion success state.

Exit criteria:
- One connected driver journey: home -> job offer -> trip detail -> pickup -> en route -> delivery -> proof -> earnings/history.

### Agency Journey

Status:
- This is the strongest operational surface after admin.
- One duplicate remains in agency registration.

Actions:
- Remove the duplicate registration screen.
- Keep dispatch as the operational hub.
- Add staff/branch permissions later as a future-state extension, not as duplicate dashboard copies.

Exit criteria:
- One registration screen.
- One dashboard.
- One dispatch board.
- Fleet, driver roster, rate card, and billing connected as distinct agency modules.

### Admin And Backoffice

Status:
- This family is already the cleanest and should remain stable.

Actions:
- Keep the current ten-screen admin set as the launch-shape backoffice base.
- Use future-state additions to represent permission bundles instead of cloning the current admin dashboard.

Exit criteria:
- No duplicate admin root screens.
- Future security, sales, integration, and auditor surfaces branch from permission-specific modules.

### Shared Support

Status:
- Support is present but overlapped.

Actions:
- Keep two intentionally distinct support surfaces only:
  - `Help Center - TruckOpti` for self-serve FAQ, status guidance, and escalation entrypoints.
  - `Contact Support - TruckOpti` for direct inquiry or ticket capture.

Exit criteria:
- The help center is not a duplicate contact form.
- The contact screen is not a duplicate FAQ page.

### Meta And Non-User Screens

Status:
- `TruckOpti Product Requirements & Blueprint` does not belong in the production prototype lane.

Actions:
- Archive it out of the main screen canvas.
- Keep product planning artifacts in repo docs, not in the live prototype used for route and flow validation.

## Exact Duplicate Cleanup Runbook

Delete or archive every discard entry below. Keep the named canonical screen only.

| Title | Keep | Discard | Reason |
|---|---|---|---|
| Reset Password - TruckOpti | `07a60c72d523492497fb07f2ce9d338d` | `b549992c24bc47cbb4d84b1faecfb507`, `58caf7be8b6444c38a636bd673813254`, `c17fea3a2b494ed4952b6e8291217da3`, `7c4251e7e3194a82947130c71255288d`, `33044762984a486c86e42a0032978d37`, `b88f0ebda6814b4ebbb3849bfffe4a56`, `69ffa2895c7d404780dbfb1bd8fdb228` | Audit keep ID becomes the canonical auth reset screen. |
| Signup - TruckOpti | `daab73c1b544424192ec42d50b0a6aa4` | `bea98b0514154e5f99a3666b31e6e546`, `ef6bb1720f734abb84c448a0185ca5f2`, `8b7c64d24a554f659fd8110afc410ff2`, `54367b688816434c867f2f4d1cee64bc`, `68232a95b6fb4e14b47c20016334a5b4`, `2a992152169045caa57261cf9ac9d5a4` | Tallest and richest signup layout should remain the base. |
| Forgot Password - TruckOpti | `b1b215f2d7bf4248bcb0ae5d99a815e8` | `71c89890f92c4b5882d60e63ed711952`, `204aa45f05fa457b9e9046cd61bd781e`, `83b51dd879404991a3ebf0d5c5a9a12e`, `d64346faba314901b3e566b001e0398e` | Keep the most complete variant and stop regenerating this route. |
| Privacy Policy - TruckOpti | `399e6386a48145c0bee793b11252b04f` | `4a20aab3394b42f9b09fa6c0604887e1`, `1ff9199e5d2549008aab21debb00ce11`, `5ce1695be412436ba2079e01a0f3eb57` | Keep the longest complete legal layout. |
| Contact & Support - TruckOpti Public | `b507bf2212ff4131a375ca7c78790702` | `a4130828b679453393d651631016c925`, `d2cce37c79454f3fafe891d07686574f` | Keep the richest public support page and rename it cleanly. |
| Agency Registration - TruckOpti | `efa6bcef996a49d9bfb07cbe389e5d0d` | `7ff19f92e6cd42b2963f1861bb9c953b` | Keep the more complete agency onboarding variant. |
| Contact & Support - TruckOpti | `5b6ac554d7274febb9819b906c3c3598` | `face90061c214e1d8f9f093c05a2027b` | Keep one internal/shared contact surface only. |
| Driver Registration - TruckOpti | `3c30c0e5d017443c91705a0c4ba86bf5` | `77c01056153b4851a97934560163b91f` | Keep the longer driver onboarding screen. |
| OTP Verification - TruckOpti | `d861537534c14e0facf59837edb8d030` | `9d055ce8a46f418c82fa044af079d12d` | Keep one OTP screen only. |
| Support & Help Center - TruckOpti | `28bde00b10274f65b299f83989dede12` | `7c82ceb047bb4e15a1ead2898098a03a` | Keep the richer help-center shell. |
| Terms of Service - TruckOpti | `89025628a81b48fe87a75bc670efdc12` | `c6e9adfc095b49a595a7427cfea5f929` | Keep the longest complete legal layout. |

## Near-Duplicate Decisions

| Family | Decision | Action |
|---|---|---|
| Public Landing Page vs TruckOpti Logistics Platform | Keep one public marketing root | Keep `Public Landing Page`, archive `TruckOpti Logistics Platform` |
| Customer: Live Shipment Tracking vs Customer: Live Shipment Tracking (Desktop) | Keep both only as explicitly named device variants | Rename to `Customer: Live Shipment Tracking - Mobile` and `Customer Tracking Control Center - TruckOpti` |
| Shipment History - TruckOpti vs Shipment History - TruckOpti Customer Portal | Merge | Keep `Shipment History - TruckOpti`, archive the portal variant |
| Shipment Invoice - TruckOpti vs Shipment Invoice - TruckOpti Customer Portal | Merge | Keep `Shipment Invoice - TruckOpti`, archive the portal variant |
| Contact & Support - TruckOpti vs Support & Help Center - TruckOpti | Keep both only if roles differ | Rename to `Contact Support - TruckOpti` and `Help Center - TruckOpti` with distinct responsibilities |
| Checkout & Payment Success | Split the mixed intent | Repurpose to `Payment Success - TruckOpti`; generate a dedicated checkout screen |
| TruckOpti Product Requirements & Blueprint | Remove from production lane | Archive out of the live prototype canvas |

## Phase 1: Current Route Parity Backlog

After cleanup, the base goes from `49` canonical kept screens to `56` route-parity screens.

### Repurpose One Existing Screen

| Canonical screen | Current source | Stitch action | Frontend target |
|---|---|---|---|
| `Payment Success - TruckOpti` | `Checkout & Payment Success` | `Change with AI` / `Edit text` | `/payment/callback`, `/payment/success` -> `PaymentCallbackPage.tsx` |

### Generate These Missing Current-Route Screens

| Missing screen | Stitch action | Branch from | Frontend target | Must include |
|---|---|---|---|---|
| `Checkout - TruckOpti` | `Imagine new screen` | `Pricing Options` | `/checkout` -> `CheckoutPage.tsx` | billing cycle, plan summary, payment method choice, trust copy, fallback payment states |
| `Not Found - TruckOpti` | `Imagine new screen` | `Public Landing Page` | `*` -> `NotFoundPage.tsx` | error heading, route recovery links, role-home shortcuts |
| `Truck Catalog - TruckOpti` | `Imagine new screen` | `Management Hub - TruckOpti` | `/management/trucks` -> `TrucksPage.tsx` | table/card toggle, add truck CTA, search/filter, empty state |
| `Carton Catalog - TruckOpti` | `Imagine new screen` | `Management Hub - TruckOpti` | `/management/cartons` -> `CartonsPage.tsx` | carton list, dimensions, add/edit CTA, empty state |
| `Sale Orders - TruckOpti` | `Imagine new screen` | `Shipment History - TruckOpti` | `/sale-orders` -> `SaleOrdersPage.tsx` | order list, link-to-shipment status, filters, export |
| `Profile - TruckOpti` | `Imagine new screen` | `Company Profile & GST Settings` | `/profile` -> `ProfilePage.tsx` | account info, login ID, notification prefs, security actions |
| `Driver Trip Detail - TruckOpti` | `Imagine new screen` | `Driver App Home` | `/driver/trip/:jobId` -> `DriverTripPage.tsx` | 7-step timeline, OTP steps, live status, proof upload, failure handling |

## Phase 2: Future-State Expansion Backlog

These screens come from `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md` and the role strategy memory. They should be added only after route parity cleanup is done.

| Screen | Stitch action | Branch from | Purpose |
|---|---|---|---|
| `Partner Console Home - TruckOpti` | `Imagine new screen` | `Admin Health Dashboard` | API-first partner operating hub |
| `Partner API Keys - TruckOpti` | `Imagine new screen` | `Partner Console Home - TruckOpti` | key issuance, revoke, rotate, scoped access |
| `Partner Webhook Logs - TruckOpti` | `Imagine new screen` | `Partner Console Home - TruckOpti` | delivery history, retry, payload visibility |
| `Partner Tenant Mapping - TruckOpti` | `Imagine new screen` | `Partner Console Home - TruckOpti` | partner-to-organization mapping and delegated ownership |
| `Demo Workspace - TruckOpti` | `Imagine new screen` | `Public Landing Page` | safe seeded demo chooser and scenario reset surface |
| `Reviewer Workspace - TruckOpti` | `Imagine new screen` | `Demo Workspace - TruckOpti` | evaluator-specific demo environment with flow links |
| `Auditor Workspace - TruckOpti` | `Imagine new screen` | `Admin Health Dashboard` | time-scoped read-only operational audit view |
| `Customer Team & Branch Management - TruckOpti` | `Imagine new screen` | `Customer Master - TruckOpti` | enterprise customer users, branches, delegation |
| `Consignee Tracking Portal - TruckOpti` | `Imagine new screen` | `Customer: Live Shipment Tracking - Mobile` | destination-side read-only tracking and receipt view |
| `Agency Staff & Branch Permissions - TruckOpti` | `Imagine new screen` | `Agency Operations Dashboard` | dispatcher, branch manager, finance, viewer rights |
| `Security Admin & Permission Bundle Editor - TruckOpti` | `Imagine new screen` | `Admin: User Management Hub` | bundle assignment, audit log, security approvals |
| `Growth & Sales Account Workspace - TruckOpti` | `Imagine new screen` | `Admin Health Dashboard` | lead, account, pricing visibility, growth pipeline |
| `Integration Manager & ERP Onboarding - TruckOpti` | `Imagine new screen` | `Partner Console Home - TruckOpti` | API onboarding, source-system mapping, webhook setup |

## Phase 3: Exception And Degraded-State Coverage

These should be added mostly as connected states from the owning screen rather than new duplicate root pages.

| Missing state or screen | Preferred Stitch action | Owning canonical screen |
|---|---|---|
| `Booking Failure / Retry - TruckOpti` | `Connect to screen` | `Customer: New Shipment Booking` |
| `Payment Failed / Pending - TruckOpti` | `Connect to screen` | `Checkout - TruckOpti` and `Payment Success - TruckOpti` |
| `Cancellation Center - TruckOpti` | `Imagine new screen` | `Shipment History - TruckOpti` |
| `Refund & Dispute Center - TruckOpti` | `Imagine new screen` | `Contact Support - TruckOpti` |
| `Permission Denied - TruckOpti` | `Connect to screen` | route-guarded entry screens across customer, agency, admin |
| `Offline Tracking / Reconnect - TruckOpti` | `Connect to screen` | `Customer Tracking Control Center - TruckOpti` |
| `GPS Off / Driver Unreachable - TruckOpti` | `Connect to screen` | `Customer Tracking Control Center - TruckOpti` and `Driver Trip Detail - TruckOpti` |
| `KYC Rejected / Document Expired - TruckOpti` | `Connect to screen` | `Driver Registration - TruckOpti`, `Agency Registration - TruckOpti`, `Admin: KYC Verification Detail` |
| `Subscription Expired / Upgrade Gate - TruckOpti` | `Connect to screen` | `Customer Dashboard`, `Pricing Options` |
| `Empty Dashboard State Pack - TruckOpti` | `Connect to screen` | customer, agency, driver, and admin dashboards |

## Prototype Wiring Plan

### Public To Customer Flow

- `Public Landing Page` -> `Pricing Options` -> `Signup - TruckOpti` or `Login - TruckOpti` -> `OTP Verification - TruckOpti` or `Auth Callback - TruckOpti` -> `Customer Dashboard`
- `Customer Dashboard` -> `Customer: New Shipment Booking` -> `Checkout - TruckOpti` -> `Payment Success - TruckOpti` -> `Shipment History - TruckOpti` -> `Shipment Invoice - TruckOpti`
- `Customer Dashboard` -> `Customer Tracking Control Center - TruckOpti` -> `Contact Support - TruckOpti` or `Help Center - TruckOpti`

### Driver Flow

- `Driver Registration - TruckOpti` -> `Driver App Home` -> `Driver: New Job Offer` -> `Driver Trip Detail - TruckOpti`
- From `Driver Trip Detail - TruckOpti`, connect step states to `Driver: Pickup Workflow`, live transit states, `Driver: Delivery & Proof`, and completion -> `Trip History - TruckOpti Driver App` / `Earnings & Wallet - TruckOpti`

### Agency Flow

- `Agency Registration - TruckOpti` -> `Agency Operations Dashboard`
- `Agency Operations Dashboard` -> `Agency Dispatch Board` -> `Agency: Driver Roster & Management` / `Agency: Fleet Management & Vehicle Status`
- `Agency Operations Dashboard` -> `Agency: Rate Card Management` and `Agency: Billing & Financials Hub`

### Admin Flow

- `Admin Health Dashboard` -> `Admin: Agency Management Hub`, `Admin: Driver Management Hub`, `Admin: User Management Hub`, `Admin: Subscription Management`, `Admin: Payout Management & Triage`, `Admin: Support & Contact Inbox`
- `Admin: Driver Management Hub` -> `Admin: Driver Detail & Compliance Review` and `Admin: KYC Verification Detail`
- `Admin: Payout Management & Triage` -> `Admin: Settlement Reconciliation`

### Future-State Expansion Flow

- `Demo Workspace - TruckOpti` -> `Reviewer Workspace - TruckOpti`
- `Partner Console Home - TruckOpti` -> `Partner API Keys - TruckOpti`, `Partner Webhook Logs - TruckOpti`, `Partner Tenant Mapping - TruckOpti`, `Integration Manager & ERP Onboarding - TruckOpti`
- `Admin: User Management Hub` -> `Security Admin & Permission Bundle Editor - TruckOpti`
- `Agency Operations Dashboard` -> `Agency Staff & Branch Permissions - TruckOpti`
- `Customer Master - TruckOpti` -> `Customer Team & Branch Management - TruckOpti`

## Naming Rules That Prevent Duplicate Regeneration

Apply these rules before any more Stitch generation work:

- Every intentional device variant must be named explicitly: `- Mobile`, `- Desktop`, or `Control Center`.
- Every role-specific screen must carry the role in the title: `Customer`, `Driver`, `Agency`, `Admin`, `Partner`, `Reviewer`, `Auditor`.
- Never generate a new screen using a title that already exists in the canonical base.
- If improving an existing screen, use `Change with AI` on the kept screen instead of `Imagine new screen`.
- If creating a state, prefer `Connect to screen` from the owning route surface.

## Execution Order

1. Remove all exact duplicates listed in the duplicate cleanup runbook.
2. Resolve the near-duplicate decisions and rename the kept variants.
3. Repurpose `Checkout & Payment Success` into `Payment Success - TruckOpti`.
4. Generate the seven missing current-route parity screens.
5. Wire the current-route flows with `Connect to screen`.
6. Add future-state partner/demo/permissions screens.
7. Add exception and degraded-state coverage as connected states.
8. Export only the stabilized current-route parity family that maps directly to the shipped frontend.

## Project Integration Plan

Use the Stitch project as the visual and journey reference for the shipped React app. Do not import Stitch HTML directly into production. The implementation source of truth stays in the existing frontend routes, layouts, auth guards, and Supabase-backed page logic.

### Pre-Integration Prerequisites

- Remove the remaining hidden old internal support source `6ed5645152fc4076984a0239ca5dfe01` so the support lane has one canonical internal screen.
- Finish minimum root wiring in Stitch for the public -> customer, driver, agency, and admin journeys before exporting references.
- Freeze canonical screen titles before frontend implementation so route owners are not chasing rename drift.

### Integration Rules

- If a Stitch screen already maps to a route in `frontend/src/App.tsx`, redesign that page in place instead of creating a new route.
- If a Stitch item is an error, degraded, or alternate state, implement it inside the owning route as a state view, modal, panel, empty state, or guarded redirect.
- If a Stitch screen has no current route and no supporting backend/data model, keep it in backlog and do not start frontend implementation yet.
- Keep role boundaries aligned with the current layout and route-guard structure:
  - `AuthLayout` for login/signup/OTP/reset flows.
  - `MobileLayout` for customer and admin shells.
  - `DriverLayout` for driver surfaces.
  - `AgencyLayout` for agency surfaces.

### Wave 1: Route-Parity Screens Into Existing Pages

| Integration lane | Stitch screens | Frontend targets | Implementation rule |
|---|---|---|---|
| Public discovery and auth | `Public Landing Page`, `Pricing Options`, `Login - TruckOpti`, `Signup - TruckOpti`, `OTP Verification - TruckOpti`, `Forgot Password - TruckOpti`, `Reset Password - TruckOpti`, `Auth Callback - TruckOpti`, `Checkout - TruckOpti`, `Payment Success - TruckOpti`, `Not Found - TruckOpti` | `/`, `/pricing`, `/login`, `/signup`, `/otp`, `/forgot-password`, `/reset-password`, `/auth/callback`, `/checkout`, `/payment/callback`, `/payment/success`, `*` -> `LandingPage.tsx`, auth pages, `PricingPage.tsx`, `CheckoutPage.tsx`, `PaymentCallbackPage.tsx`, `NotFoundPage.tsx` | Restyle and restructure the existing pages in place. Preserve current auth redirects, payment verification, and route ownership. |
| Support and legal | `Contact Support - TruckOpti Public`, `Contact Support - TruckOpti`, `Help Center - TruckOpti`, `Terms of Service - TruckOpti`, `Privacy Policy - TruckOpti` | `/contact`, `/terms`, `/privacy`, plus optional `/help` only if FAQ content cannot live inside the current support IA | Keep one support intake flow. Prefer extending `ContactPage.tsx` with public/authenticated modes and add a dedicated help route only if the information architecture demands it. |
| Customer operations | `Customer Dashboard`, `Customer: New Shipment Booking`, `Customer: Live Shipment Tracking - Mobile`, `Customer Tracking Control Center - TruckOpti`, `Shipment History - TruckOpti`, `Shipment Invoice - TruckOpti`, `Packing Optimizer - TruckOpti`, `Route Planner - TruckOpti` | `/dashboard`, `/booking/new`, `/tracking`, `/history`, `/invoice/:shipmentId`, `/packing`, `/routes` -> `Dashboard.tsx`, `NewShipmentPage.tsx`, `TrackingPage.tsx`, `ShipmentHistoryPage.tsx`, `InvoicePage.tsx`, `PackingPage.tsx`, `RoutesPage.tsx` | Treat mobile tracking and desktop control center as responsive variants of `TrackingPage.tsx`, not separate routes. Keep booking, history, invoice, packing, and route planner on the current route map. |
| Customer management and account | `Management Hub - TruckOpti`, `Truck Catalog - TruckOpti`, `Carton Catalog - TruckOpti`, `Customer Master - TruckOpti`, `Sale Orders - TruckOpti`, `Profile - TruckOpti`, `Company Profile & GST Settings` | `/management`, `/management/trucks`, `/management/cartons`, `/management/customers`, `/sale-orders`, `/profile`, `/settings/company` -> `ManagementPage.tsx`, `TrucksPage.tsx`, `CartonsPage.tsx`, `CustomersPage.tsx`, `SaleOrdersPage.tsx`, `ProfilePage.tsx`, `CompanyProfilePage.tsx` | Keep the management hub as the navigation shell and refactor the existing CRUD/account pages to match the approved Stitch surface. |
| Driver journey | `Driver App Home`, `Driver: New Job Offer`, `Driver Trip Detail - TruckOpti`, `Driver: Pickup Workflow`, `Driver: Delivery & Proof`, `Earnings & Wallet - TruckOpti`, `Trip History - TruckOpti Driver App` | `/driver/dashboard`, `/driver/trip/:jobId`, `/driver/earnings`, `/driver/history`, `/driver/profile` -> `DriverDashboardPage.tsx`, `DriverTripPage.tsx`, `DriverEarningsPage.tsx`, `DriverHistoryPage.tsx`, `ProfilePage.tsx` | Fold the job offer, pickup, en route, delivery, and proof states into the existing `DriverTripPage.tsx` state machine. Keep dashboard, earnings, and history as distinct routes. |
| Agency operations | `Agency Operations Dashboard`, `Agency Dispatch Board`, `Agency: Fleet Management & Vehicle Status`, `Agency: Driver Roster & Management`, `Agency: Rate Card Management`, `Agency: Billing & Financials Hub` | `/agency/dashboard`, `/agency/jobs`, `/agency/fleet`, `/agency/drivers`, `/agency/rates`, `/agency/billing` -> `AgencyDashboardPage.tsx`, `AgencyJobsPage.tsx`, `AgencyFleetPage.tsx`, `AgencyDriversPage.tsx`, `AgencyRatesPage.tsx`, `AgencyBillingPage.tsx` | Keep dispatch as the operational center and reshape the existing route set instead of splitting agency flow across extra roots. |
| Admin and backoffice | `Admin Health Dashboard`, `Admin: Agency Management Hub`, `Admin: Driver Management Hub`, `Admin: Driver Detail & Compliance Review`, `Admin: KYC Verification Detail`, `Admin: Payout Management & Triage`, `Admin: Settlement Reconciliation`, `Admin: Subscription Management`, `Admin: Support & Contact Inbox`, `Admin: User Management Hub` | `/admin`, `/admin/agencies`, `/admin/drivers`, `/admin/drivers/:id`, `/admin/payouts`, `/admin/contact`, `/admin/subscriptions`, `/admin/users` -> `AdminDashboardPage.tsx`, `AdminAgenciesPage.tsx`, `AdminDriversPage.tsx`, `DriverDetailPage.tsx`, `AdminPayoutsPage.tsx`, `AdminContactPage.tsx`, `AdminSubscriptionsPage.tsx`, `AdminUsersPage.tsx` | Integrate the current routed screens directly. Treat `Admin: KYC Verification Detail` as a detail state inside `DriverDetailPage.tsx` and `Admin: Settlement Reconciliation` as a drill-down state inside `AdminPayoutsPage.tsx` until dedicated admin routes are justified. |

### Wave 2: Shared Design-System Bridge

- Extract shared tokens from the stabilized public, customer, and admin screens into one frontend theme layer instead of page-local CSS forks.
- Standardize recurring Stitch patterns as reusable React building blocks: KPI cards, section headers, timeline steps, table-toolbars, status chips, and empty/error states.
- Use the first integrated lanes to define the reusable primitives, then roll them forward into the other role portals.

### Wave 3: Exception States Inside Existing Routes

Treat the Phase 3 backlog as implementation states owned by the existing route pages.

| Stitch state | Owning frontend surface | Integration rule |
|---|---|---|
| `Booking Failure / Retry - TruckOpti` | `NewShipmentPage.tsx` | Failed booking and retry view inside the booking flow, not a separate top-level route. |
| `Payment Failed / Pending - TruckOpti` | `CheckoutPage.tsx`, `PaymentCallbackPage.tsx` | Pending, failed, retry, and verification states stay inside checkout/callback logic. |
| `Permission Denied - TruckOpti` | `ProtectedRoute.tsx` plus guarded pages | Unauthorized access becomes a guard-managed state or redirect, not a new role-neutral page. |
| `Offline Tracking / Reconnect - TruckOpti` | `TrackingPage.tsx` | Implement as offline/reconnect UI within tracking. |
| `GPS Off / Driver Unreachable - TruckOpti` | `TrackingPage.tsx`, `DriverTripPage.tsx` | Show contextual status degradation inside live-trip surfaces. |
| `KYC Rejected / Document Expired - TruckOpti` | driver/agency onboarding plus admin compliance review | Implement as application status panels and resolution flows on the owning screens. |
| `Subscription Expired / Upgrade Gate - TruckOpti` | `Dashboard.tsx`, `PricingPage.tsx`, checkout/subscription guard surfaces | Keep as gated state and upgrade CTA, not a freestanding route. |
| `Empty Dashboard State Pack - TruckOpti` | dashboard pages across customer, driver, agency, admin | Standardize as shared empty states per role shell. |

`Cancellation Center - TruckOpti` and `Refund & Dispute Center - TruckOpti` are the only Phase 3 items that can justify discrete pages, but they should land only after the underlying cancellation, refund, and dispute workflow exists in the product model.

### Wave 4: Future-State Screens That Stay In Backlog Until Platform Support Exists

These screens should remain planned-only until the project has the right route family, data model, and permission surface.

| Future-state screen set | Project dependency before implementation |
|---|---|
| `Customer Team & Branch Management - TruckOpti`, `Agency Staff & Branch Permissions - TruckOpti`, `Security Admin & Permission Bundle Editor - TruckOpti` | organization/branch membership model, permission bundles, audit trail, and server-side enforcement |
| `Partner Console Home - TruckOpti`, `Partner API Keys - TruckOpti`, `Partner Webhook Logs - TruckOpti`, `Partner Tenant Mapping - TruckOpti`, `Integration Manager & ERP Onboarding - TruckOpti` | partner account model, API credential storage, webhook delivery logs, tenant mapping service, and admin approval flow |
| `Demo Workspace - TruckOpti`, `Reviewer Workspace - TruckOpti`, `Auditor Workspace - TruckOpti` | seeded demo data, environment isolation, read-only/reviewer permissions, and reset tooling |
| `Growth & Sales Account Workspace - TruckOpti` | CRM or internal account-pipeline source of truth |
| `Consignee Tracking Portal - TruckOpti` | public/tokenized read-only tracking access and consignee-facing acknowledgment model |
| `Cancellation Center - TruckOpti`, `Refund & Dispute Center - TruckOpti` | cancellation policy engine, payment reversal workflow, dispute lifecycle, and support ownership |

### Recommended Code Execution Order

1. Finish the remaining Stitch cleanup and minimum root-flow wiring.
2. Export/reference the stable public/auth/current-route parity screens.
3. Integrate public/auth/checkout/not-found pages first because they shape the app shell and acquisition funnel.
4. Integrate customer operations and management pages next because they map directly to the current customer route tree.
5. Integrate driver and agency lanes after the shared primitives are established.
6. Integrate admin current-route pages and fold KYC/settlement detail states into existing admin screens.
7. Layer exception/degraded states into the owning pages.
8. Open separate epics for future-state screens only after backend and permission prerequisites are ready.

### Verification Gates For Each Integration Wave

- `cd frontend && npm run build`
- `npm run test:public-smoke` after public/auth/support changes
- `npm run test:frontend-smoke` after any shared route or layout change
- `npm run test:live-auth` when customer, driver, or agency auth flows are materially changed
- `npm run test:live-admin` when admin route surfaces are materially changed
- `npm run launch-check` before claiming the full screen-integration program is green

## 2026-05-08 Flow Audit Status

### Comprehensive Reassessment Result

- `mcp_stitch_list_screens` is not a completeness source for this project. It can omit valid screens entirely, not just lag after edits.
- Exact-id verification confirms the current Stitch project contains the previously generated route-parity screens, the rename replacements, and the future-state and exception-state root screens even when they are absent from the list surface.
- The only genuinely missing canonical screens after reassessment were `Management Hub - TruckOpti` and `Admin: Driver Management Hub`, which were regenerated with `GEMINI_3_1_PRO` as screen ids `812ce430430f4856a97142c2f07d0efe` and `595aec8e180f47bcb0875f67dedc589c`.
- There is no remaining planned or canonical root-screen generation gap after those two recoveries.

### Current Live Flow Gaps

- Stale duplicate cleanup is complete: old internal support screen `6ed5645152fc4076984a0239ca5dfe01` was deleted from the shared live canvas, while canonical `Contact Support - TruckOpti` remains.
- Prototype edges still missing: current flow wiring is not started, so the existing screens remain isolated roots instead of connected journeys.
- A `GEMINI_3_1_PRO` prompt that explicitly requested existing-screen-only public/customer wiring completed with an acknowledgment message, but it still produced `0` persisted `rf__edge-*` elements on the live canvas.
- The first deterministic manual-edge attempt also failed: `Public Landing Page` -> context menu `Show connections` -> click `Pricing Options` still produced `0` persisted `rf__edge-*` elements.
- First flow to wire after cleanup:
  - `Public Landing Page` -> `Pricing Options`
  - `Pricing Options` -> `Signup - TruckOpti` and `Login - TruckOpti`
  - `Signup - TruckOpti` / `Login - TruckOpti` -> `OTP Verification - TruckOpti`
  - `OTP Verification - TruckOpti` -> `Auth Callback - TruckOpti` -> `Customer Dashboard`
  - `Pricing Options` or `Customer Dashboard` -> `Checkout - TruckOpti` -> `Payment Success - TruckOpti` -> `Customer Dashboard`
- Remaining actor flows after the first public/customer path:
  - Driver: `Driver App Home` -> `Driver: New Job Offer` -> `Driver Trip Detail - TruckOpti` -> `Driver: Pickup Workflow` -> `Driver: Delivery & Proof` -> `Trip History - TruckOpti Driver App` / `Earnings & Wallet - TruckOpti`
  - Agency: `Agency Operations Dashboard` -> `Agency Dispatch Board` -> `Agency: Fleet Management & Vehicle Status` / `Agency: Driver Roster & Management` / `Agency: Rate Card Management` / `Agency: Billing & Financials Hub`
  - Admin: `Admin Health Dashboard` -> `Admin: Agency Management Hub` / `Admin: Driver Management Hub` / `Admin: User Management Hub` / `Admin: Subscription Management` / `Admin: Payout Management & Triage` / `Admin: Support & Contact Inbox`

### 2026-05-10 Prototype And Export Checkpoint

- The live shared Stitch editor now machine-verifiably shows `Prototype created` alongside `Share` and `Export`, so a prototype artifact does exist in project `817968552986251880`.
- Do not overclaim from that alone: the same DOM snapshot still reports `0` rendered edge paths on the visible canvas, so relationship wiring is still not independently proved by the current editor DOM.
- A reliable export-capable editor path now exists: `Ctrl+A` enters multi-select mode and unlocks the export panel from the current authenticated editor surface.
- Export scope is constrained by Stitch itself: the export panel reports `Export is limited to 16 screens`, so future proof/export passes must work on a deliberately small subset instead of the whole canvas.
- The subset-reduction path is now reproducible: after `Ctrl+A`, the selected-chip `Remove` buttons can safely trim the live selection down to exactly `Public Landing Page` and `Pricing Options`.
- Both discovered export entry points currently converge to the same panel: the top `Export` button and the selection-toolbar `More -> Export` action both open the AI Studio-centered export surface in this editor state.
- The `Share` surface is real but gated: `Share project` opens successfully, yet `Copy link` stays disabled until `Enable sharing and remixing` is turned on, so public-share approval is now the main decision point for link-based proof.
- The selected landing-page node exposes a concrete preview-oriented menu via its `play_circle` title row: `New Tab`, `Show QR Code`, device presets, `View Code`, `Export`, `Download`, and `Delete`. Automated `New Tab` capture did not surface a popup from this workspace, so that preview path still needs either manual confirmation or another UI route.
- The repo-side exported HTML artifacts under `0.dev-matrix/stitch folder/` remain static with `href="#"`; they are useful for visual/code inspection but not as proof that Stitch relationships were preserved.
- Export rules for the next pass:
  - `Instant prototypes`: use when the goal is preserving or sharing screen-to-screen flow relationships.
  - `Stitch React app`: use when the goal is code-side interaction structure and implementation handoff.
  - `MCP`: use for IDE or agent integration, not as a relationship-preserving export artifact.
- Proof order for the next execution pass:
  1. Use the working `Ctrl+A` path, then deselect down to a tiny subset such as `Public Landing Page` plus `Pricing Options`.
  2. Try the node-level `New Tab` or `Show QR Code` actions from the selected landing-page preview before widening scope.
  3. If link-based proof is acceptable, enable `Share project` and capture the resulting share evidence for the same two-screen subset.
  4. Export the same subset only after relationship proof exists; note that the currently exposed export surface is the AI Studio-centered panel rather than a distinct relationship-proof export.

### 2026-05-10 3.1 Reference Pack For App Gap Review

- This pass is reference-only. The objective is to make Stitch more useful for route-by-route UI comparison and minor flow-gap detection, not to prove prototype navigation.
- The TruckOpti design system asset `assets/039d7f7b6b7747e8a76dedad4464c9cb` works cleanly with `GEMINI_3_1_PRO` generation and should be reused for future reference screens.
- Newly generated current-route parity reference screens from this pass:
  - `Checkout - TruckOpti` -> `f1185d1971b54a6292d4a49b2dc1c93e`
  - `Not Found - TruckOpti` -> `b0d5e3711c754465b7c3a7a306f2b003`
  - `Carton Catalog - TruckOpti` -> `e6d3ed24d299415998e8b126e50dd1a0`
  - `Profile - TruckOpti` -> `4a7d8f667a8342a684f9a28bcff82cd5`
  - `Customer Tracking Control Center - TruckOpti` -> `0afcac095d1c417b917d7ca9801a2836`
  - `Driver Trip Detail - TruckOpti` -> `591699f3ceaf4f4782ffc581b2db9fc5`
- Recommended current reference pack (`16` screens max) for code-review and app-gap comparison:
  1. `Public Landing Page` -> `9360baca69664286b7e855bd01475fb8`
  2. `Pricing Options` -> `28d39c9adf1f481d973eaf960bf69f16`
  3. `Login - TruckOpti` -> `d7e585161ac04d44a59ce55f704854fb`
  4. `Signup - TruckOpti` -> `daab73c1b544424192ec42d50b0a6aa4`
  5. `OTP Verification - TruckOpti` -> `d861537534c14e0facf59837edb8d030`
  6. `Auth Callback - TruckOpti` -> `c7700d0dd56643b48672c4edd55a3fe7`
  7. `Customer Dashboard` -> `37a00a1507b04b19b54233b89a74af5e`
  8. `Customer: New Shipment Booking` -> `141531b66eaa4bc09d4a9d5f80ad181b`
  9. `Management Hub - TruckOpti` -> `812ce430430f4856a97142c2f07d0efe`
  10. `Payment Success - TruckOpti` -> `1e1497ab607841d4b4fdb40345964e66`
  11. `Checkout - TruckOpti` -> `f1185d1971b54a6292d4a49b2dc1c93e`
  12. `Not Found - TruckOpti` -> `b0d5e3711c754465b7c3a7a306f2b003`
  13. `Carton Catalog - TruckOpti` -> `e6d3ed24d299415998e8b126e50dd1a0`
  14. `Profile - TruckOpti` -> `4a7d8f667a8342a684f9a28bcff82cd5`
  15. `Customer Tracking Control Center - TruckOpti` -> `0afcac095d1c417b917d7ca9801a2836`
  16. `Driver Trip Detail - TruckOpti` -> `591699f3ceaf4f4782ffc581b2db9fc5`
- This pack is the best current bridge between the shipped frontend and the Stitch project because it covers acquisition, auth, checkout, dashboard, booking, management, tracking, error handling, and the driver trip state machine without crossing the 16-screen export/reference limit.
- Remaining reference-only gaps after this pass:
  - `Customer: Live Shipment Tracking - Mobile`
  - `Partner Console Home - TruckOpti`
  - `Demo Workspace - TruckOpti`
  - `Reviewer Workspace - TruckOpti`
  - `Auditor Workspace - TruckOpti`
  - `Cancellation Center - TruckOpti`
  - `Refund & Dispute Center - TruckOpti`
- Current drift still visible on the live canvas: old `Contact & Support - TruckOpti` remains present next to canonical `Contact Support - TruckOpti`, so support reference cleanup is still incomplete.

### Flow Creation Rules After Reassessment

- Do not create more root screens for exception and degraded states that already belong to an owning route surface.
- Add exception/degraded behavior as connected states from the owning route screens defined earlier in this plan.
- Keep future-state partner/demo/auditor/reviewer/team/permission flows in the prototype backlog until backend, role, and data-model support exists in the project.

### Live Editor Constraint

- Browser-based delete and `Connect to screen` work require an authenticated shared Stitch editor page.
- On a valid shared editor page, stale-node deletion works through `select node -> Delete`, so cleanup is no longer the blocker.
- The current shared-editor DOM exposes no global React Flow handle elements for direct browser automation, and the completed `GEMINI_3_1_PRO` wiring prompt acknowledged the requested public/customer flow without creating persisted edges.
- The current shared-editor `Show connections` context-menu path can be activated on a source screen, but it still does not persist an edge when the intended target screen is clicked.
- A freshly opened Stitch page in the prior attempt loaded an inner `404` state (`This page doesn't exist or isn't shared with you.`), so page-share quality still matters when resuming browser-driven work.

## Constraints And Blockers

- The current Stitch MCP surface in this workspace supports project inspection and generation/edit flows, but it does not expose delete or archive operations for existing screens.
- Exact duplicate removal therefore needs to be performed in the Stitch UI unless a delete/archive tool becomes available.
- The prototype should be treated as a design system and route-validation artifact, not as a place to store requirement documents or planning notes.