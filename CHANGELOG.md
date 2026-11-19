# Changelog

All notable delivered changes to **TruckOpti** — "3D Smart Packing & Logistics for India" (package `truckopti`, current version `1.1.0` in `package.json`).

This file follows the [Keep a Changelog](https://keepachangelog.com/) style. The repository does not tag semver releases, so entries are grouped by delivery date, newest first. Sources: git history and `TASKS.md`; per-task evidence lives in `agent-results/` and briefs in `agent-tasks/`.

Scope note (facts only): the database work in the 2026-09 to 2026-11 entries was proven on the local PGlite tier only. Hosted rollout, `supabase db push`, real-money payment execution and production deploy remain owner-gated, as recorded in `TASKS.md` under "Known owner gates".

## 2026-11-19

### Added

- Staging Supabase project `truckopti-staging` (ref `ydkhgclfjdksicpwqzmw`, ap-south-1). Migrations through `20261045000000` applied; 23 Edge functions deployed; cron jobs `truckopti-expiry-sweeps` and `truckopti-subscription-sweeps` registered. The old production project was not touched.
- Hosted checks: API smoke 135 of 135 pass; Razorpay TEST-mode payment through the app; webhook proof 14 of 14 checks (signatures, replay, duplicate, wrong amount, refund to credit note `CN/26-27/000001`). Evidence in `evidence/staging/`.
- Admin > Billing settings: "Registered under GST" switch, with an operating procedure in the admin guide and runbook (not yet rehearsed).

### Fixed (found on hosted staging)

- An old migration used `uuid_generate_v4()`; now `gen_random_uuid()`. `agency_rate_cards` and the `avatars` bucket were never created by a migration (added in `20261045`).
- `verify_jwt = false` set for `razorpay-webhook` and `erp-ingest` in `supabase/config.toml`; the gateway blocked both without it.
- 20 functions had no fixed search path, and two were callable signed-out without need (`20261044`). `[inbucket]` renamed to `[local_smtp]`.

### Not done

- Production deploy; live Razorpay keys and dashboard webhook; backup and restore rehearsal; failed-payment proof; enforcement stays off.

### Added

- Agency menu sheet for phone navigation, with error and retry states on the driver and admin pages (commit `b4e62559`).
- Driver live location sharing, opt-in per trip, and a driver trip link to the agency job (migration `20261039`).
- Admin billing settings screen for the invoice issuer: legal name, GSTIN, registered address, state code and SAC (`/admin/billing-settings`).
- Local browser journey test (`npm run test:journey`) and a release gates runner (`npm run release:gates`) with a staging smoke checklist for the hosted gates.
- Node harness that type-checks and runs the Razorpay, ERP and portal Edge functions without Deno (86 tests).

### Changed

- Subscription write guards added to 14 more database commands (record add, settle, ERP and the ERP plan flag) with matching frontend wiring (migration `20261035`).
- Agency dashboard, jobs, billing and rates pages show an error state with a Retry button when the Edge call fails, instead of the misleading "No Agency Profile Found".

### Fixed

- Active agency staff (dispatcher, finance, viewer) can enter the agency area; before this only owners could (found by the local journey test).
- Agency pages show the scope-aware buttons and navigation for each staff role.

### Security

- Agency owners could edit their own rating and approval fields and delete their agency row directly. Closed by the agency row guard (migration `20261040`, 50 test cases).
- Least-privilege hardening: trigger-function execute rights and anonymous data-change grants revoked (migration `20261036`); privilege matrix 15 of 15.
- Driver CSV export no longer includes bank or Aadhaar details.
- Secrets audit of the source and the built bundle: pass.

## 2026-11-17

### Added

- Orders and load plans: normalised orders, an atomic CSV order import with row validation, and load plans with versioned approval (TO-145).
- Consignments with goods receipts and lorry receipts (TO-146), tracking with ping rules (TO-147), freight invoices (record only, no payment flow) (TO-148), expenses, fuel and maintenance records (TO-149), payroll (TO-150) and an ERP connector with an ingest Edge function (TO-151).
- Agency-level subscriptions with a plan limit guard on nine commands, GST invoicing for subscription payments, activation, refunds and credit notes, an expiry sweep with reminders, and a Razorpay webhook (TO-152). Enforcement is off by default.
- Subscription billing screens: trial, past due, grace, expired and limit states, a trial panel and entitlement gating across agency pages. Admin subscriptions use the agency model.

### Changed

- Review fixes on the consignment, tracking and expense work: append-only history, a ping rate guard, odometer bounds and the Indian financial year (IST) for expense totals.
- Plan approval marks orders as planned, and cancelling returns them.

### Fixed

- ERP receiver, invitation acceptance, staff access on portal functions, invoice read path and usage-count parity (contract audit, `docs/CONTRACT-AUDIT-2026-11-17.md`).
- Legacy payment verification endpoint now returns 410 Gone; the Razorpay flow uses the server-side activation path.
- Truck-maintenance guard for approved plans and a stronger odometer race check.

### Security

- Order amounts for subscription payments are set by the server, never taken from the client, and webhook events are deduplicated by event id (checked by the local Edge harness; not run against Razorpay).
- Subscription money and limit commands were tested against real PostgreSQL race scenarios (8 scenarios, no bug found).

### Not yet verified

- Hosted Supabase (auth, storage, pg_cron, migrations on a hosted project).
- Real Deno runs of the Edge functions (never executed in Deno).
- Real Razorpay runs, in test or live mode.
- The new 2026-11-17 screens have not been viewed in a browser.

## 2026-11-07

### Added

- Regression test suites for 13 agency, driver and admin pages, landed by the ZCode fleet queue: AgencyJobs, AgencyRates, AgencyBilling, AgencyProfile, AgencyRegister, DriverProfile, DriverRegister, DriverEarnings, DriverHistory, AdminUsers, AdminDashboard, AdminSubscriptions and AdminPayouts (see the `test(fleet)` commits of this date and the 2026-11-06 day-close note in `TASKS.md`).

## 2026-11-06

### Added

- Clients and Tariffs pages and the Team change-scope action for the agency portal (commit `feat(TO-144-D2): Clients, Tariffs pages and Team change-scope`); 709 frontend tests at day close (`TASKS.md`).
- Per-repository ZCode fleet scheduler with a 24-task queue (17 page regression-test suites and 7 documentation tasks) and the pilot completion plan in `docs/PILOT-COMPLETION-PLAN.md` (day-close note in `TASKS.md`).

## 2026-11-04

### Added

- Team & Access page at `/agency/team` and a driver invitations panel on `/agency/drivers` (Stitch screens `0691bdff` and `eac990fe`).
- Typed service layer for team, client, tariff and driver-invitation commands; types delta for reservations and agency member/client/tariff tables with a drift check (`npm run types:drift`, local tier).

### Changed

- Staff scopes enforced in the fleet foundation (D1) and reservation policies and command RPCs: dispatcher / fleet_manager / finance / viewer, owner always allowed.
- `agency_driver_employment` became the single driver authority; reservations project onto `agency_jobs`.
- Consent cutoff hardened to pre-dispatch only (shipment status `pending`); anonymous EXECUTE on the helper removed. Rulings recorded in `TASKS.md`.

## 2026-11-03

### Added

- Fleet assignment reservations with overlap guard and offer-driven release (TO-143-D2; reservations battery 42/42, `agent-results/033-result.md`).
- Agency memberships, client agreements and tariff versions backend (TO-144-D2; battery 99/99).

### Fixed

- Accessibility repairs: accessible names, label associations, heading structure and page titles.

## 2026-10-24

### Changed

- Screen-completion tranche (TO-154, six design-audit items): driver job-offer acceptance moved into the live inline offer flow (Stitch screen `202377b7` retired), WCAG AA contrast repairs on NewShipmentPage and AgencyJobsPage, and refreshed Driver App Home, Driver Trip Detail, Driver: Delivery & Proof and Fleet Management screens. Item evidence in `docs/design-audit.md` and the TO-154 row in `TASKS.md`.

## 2026-10-10

### Added

- Agency fleet foundation (TO-144-D1): catalog-separated owned vehicles and driver employment records with document expiry and maintenance blocks, typed expected-version and idempotent command RPCs, and eligibility predicates (battery 32/32; `agent-results/034-result.md`).

## 2026-10-08

### Added

- Production consent writer RPCs and consent-gated agency job creation (TO-143-D1; dispatch battery 52/52, `agent-results/033-result.md`).

## 2026-10-07

### Fixed

- Tenant, usage and private-document authority repaired, with a dispatch producer (`dispatch_job_to_drivers`) and delivered-trip propagation (TO-142, accepted after the TO-142-R supervisor review; `agent-results/032-result.md`).

## 2026-10-02 – 2026-10-05

### Added

- Two-identity customer journey and tenant isolation proof on PGlite (TO-134, 25/25) and the dispatch-to-delivery journey proof with exactly-once accept/delivery/settlement (TO-135, 35/35).
- Final-schema admin/RLS denial matrix (TO-136): 53/53 checks across 28 tables and 83 policies; a forged-`user_metadata` Storage escalation on billing documents was reproduced and fixed by migration `20261005010000`.
- Sanitized production error reporting with secret/PII redaction and a deployment health drift check via `scripts/check-deployment-health.mjs` (TO-132).

### Changed

- Google sign-in routed through trusted Supabase OAuth sessions (TO-122); every login surface renders only enabled, configured sign-in methods (TO-123); provider capability audit fails closed (TO-124); Node runtime aligned to 24 LTS across build, CI and container, with all lint warnings closed (TO-138).
- Canonical launch and closure gates repaired to validate the current control plane (TO-121).

### Fixed

- Ordered OTP-enforced trip transitions with exactly-once delivery and bounded attempt lockout; job-scoped trip-photo URLs accepted with uploaded file segments (TO-130, DB proof 21/21).
- Safe admin and agency error boundaries restored via approved typed codes (TO-131); local backup restore made safe and complete via a self-contained envelope (TO-133).
- Driver KYC made real: private storage and server-authoritative versioned states (TO-126), real upload bytes (TO-127) and admin per-document review with signed previews on `/admin/drivers/:id` (TO-128).
- Atomic authorized driver offer response via the `respond_to_job_offer` RPC (TO-129).
- Actual-app UX/accessibility audit across every route (TO-139): 104 checks with 0 hard failures; five defects fixed, including the agency company-object render crash and an invented support number replaced by the owner-configured contact in `config/support.ts`. Open P1/P2 backlog in `docs/design-audit.md`.

## 2026-10-06

### Fixed

- Full verification day at HEAD `fbd165d5`: every maintained gate re-run green — unit 551/551, packing 18/18, launch smoke 63/63 and all four DB proof batteries; `proxy-addr` bumped to 2.0.8 past the IP-spoofing advisory GHSA-jqcg-44mw-7w3h (day-close log in `TASKS.md`).

## 2026-10-01

### Fixed

- Supabase migration chain made replayable and OTP column exposure closed (TO-125).

## 2026-09-30

### Fixed

- Google sign-in connected to trusted Supabase OAuth sessions; client-decoded identity and local-role linking removed (TO-122 wave landing).

## 2026-09-19

### Added

- Driver "Documents & KYC Upload" screen integrated from a Stitch design (TO-120, merged `0f91bfe5`; vitest 347/347). Uploads were client-simulated at this stage; the real backend arrived with TO-126/TO-127 above.

## 2026-09-11 – 2026-09-12

### Fixed

- Production incident repair: canonical-host 301 routing in `server.js` with focused routing tests; the live site was restored.
- Razorpay webhook authenticity hardened with a dedicated fail-closed webhook secret (TO-117); payment Edge Function error boundaries, readiness probes and a production dependency audit gate added; Heroku deployment paths made fail-safe; React Router upgraded to patched 7.18.3.

### Changed

- Production-readiness mission (TO-112) decomposed into bounded tasks TO-113 to TO-119 (`agent-tasks/001-production-readiness.md`); the broader launch smoke added to CI (329/329 unit tests at merge).

## 2026-09-06

### Added

- Local-first tier: PGlite packing slice, offline identity, Drive backup engine and a dormant sync client; Supabase-optional client with Google-only GIS login and OTP off by default.

### Fixed

- Security and quality sweep: 0 npm/Python audit vulnerabilities across root and web app, 65 service tests repaired, auth return-to hardened.

## 2026-07

### Fixed

- Server-side job-offer OTP verification enforced; six-character shipment IDs guaranteed; dense mixed-load packing placement improved; empty contact drafts ignored; zero-usage subscription limits handled; smoke tests now fail hard on 404 route renders; tests added for safe user-facing error fallbacks.

### Changed

- Public trust and accessibility improvements on the public surfaces; a support-expectations rail added to the contact page (adapted from a Stitch design).

## 2026-05 – 2026-06

### Added

- Referral program: service plus `api/v1` endpoints with 24 tests; rate estimate, carbon estimator and emissions UI; earnings exports and revenue breakdowns; configurable GST toggle for subscription billing; hosted invoice delivery flow.
- Market-survival feature studies: competitor analysis and roadmap documents in `docs/COMPETITOR_ANALYSIS.md` and `docs/MARKET_SURVIVAL_FEATURES.md` (TO-111); 4-digit OTP and demo accounts (TO-109).

### Fixed

- Security: agency payout bypass via forged driver links closed; fleet update-truck cross-agency driver bypass and driver guard gaps closed; unapproved agencies blocked from portal write actions and Edge Functions.

## 2026-03 – 2026-04

### Added

- Agency/admin web platform feature batches (git log, March 2026): RLS security fixes, subscription flow, driver payouts, admin payout management, admin contact page, SEO meta tags, agency dispatch, driver GPS, admin CSV export, landing page, driver withdrawal, revenue chart, GST invoice, photo lightbox and user management.
- Repeatable launch-readiness verification script with six gates, later extended with a git-cleanliness Gate 7 (`scripts/launch-readiness.ps1`); frontend launch smoke and a production config audit for launch blockers.

### Changed

- Express upgraded from 4.x to 5.2.1; PWA precache reduced from 4 MB to 1.5 MB; frontend packing engine consolidated into one shared engine; login-id and PAN sign-in rollout completed; 29 defects fixed from the deep audit of 2026-04-21.

### Security

- Committed `node_modules` removed from the web app; dompurify, xlsx tarball, rollup, vite-plugin-pwa and other Dependabot CVEs cleared; hardcoded Supabase admin credentials removed; raw `error.message` leaks eliminated across frontend pages.

## 2025-08 – 2025-11

### Added

- Initial commit 2025-08-02. Flask-based core with 3D bin packing (py3dbp), carton CRUD, smart truck recommendation, multi-truck fleet optimisation, sale-order optimisation, CSV bulk-upload templates, analytics dashboards and 3D visualisation (see `README.md` and `apps/web/app`).
- Desktop executables under `apps/desktop/` (Python 3.13 executable compatibility fixed on 2025-08-15); Optioryx-inspired advanced 3D packing algorithms (November 2025) and a modular architecture refactor with production-readiness assessment.

### Note

- The desktop applications are legacy. `TASKS.md` records archiving `apps/desktop` as an open owner decision; nothing has been deleted.

## Not delivered (owner-gated or waiting on dependencies)

Listed here so the changelog is not read as claiming more than exists (`TASKS.md`): payment sandbox proof (TO-137, awaiting provider credentials), hosted pilot runtime and restore proof (TO-153), sales-order import and load planning (TO-145), GR/LR QR and custody proof (TO-146), trip tracking and incidents (TO-147), freight invoices and collections (TO-148), expenses/fuel/maintenance (TO-149), payroll and reports (TO-150), ERP connector (TO-151) and platform billing (TO-152). Real Razorpay/PhonePe collection, hosted Supabase rollout and production deploy all remain owner-gated.
