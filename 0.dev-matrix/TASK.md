# 📋 TASK

> **Task Queue + Claims - Multi-Agent Coordination**
> Claim before working. Update when done.
> **2026-05-11 (Copilot-059)**: the repo now has a verified MCP-completion audit instead of only a launch audit. Roo bridge health is good (`qdrant`), Graphify is refreshed (`433/506/73`), and 0.dev-matrix workflow docs are reconciled to current repo truth. Remaining verified blockers before calling the project complete are now explicit: clean-tree launch proof (`16/17` -> `17/17`), owner-side live Razorpay, Graphify install drift warning, and the still-open repo task board (`54%`, `30/56` tasks via `project-progress.ps1`).
> **2026-05-11 (Copilot-058)**: T-151 is now landed locally. `frontend` has a new Vitest unit lane, `razorpayPayment.test.ts` covers missing config/live-site gating/success/pending flows for `initiateRazorpayPayment`, and `driverTripProgress.test.ts` covers the extracted driver-trip persistence helper that now owns the risky `persistJobProgress` RPC/state-patch logic. Validation on this slice: `cd frontend && npm run test:unit` -> `7/7` passing, `cd frontend && npm run build` PASS, and `npm run launch-check` remains `16/17` with only working-tree cleanliness failing.
> **2026-05-11 (Copilot-057)**: the MCP audit moved the launch-flow picture from broad suspicion to exact next work. Roo index, code-review-graph, and Graphify all confirm the repo already has strong launch/readiness orchestration, and the repo-side technical gate is now back to `16/17` after clearing the dependency audit failures in `frontend` and `apps/web`. Remaining repo-side launch-check failure is only working-tree cleanliness. The next AI-executable quality task is focused regression coverage for `initiateRazorpayPayment` and `persistJobProgress`, which currently have real callers but no linked tests in code-review-graph.
> **2026-05-10 (Copilot-056)**: the Stitch work is now split cleanly between reference coverage and prototype proof. For reference-only use, a 16-screen current-route pack now exists conceptually and six missing parity screens were generated with `GEMINI_3_1_PRO`: checkout, not found, carton catalog, profile, desktop tracking control center, and driver trip detail. Remaining reference-only backlog is the future-gap set (`Customer: Live Shipment Tracking - Mobile`, `Partner Console Home`, `Demo Workspace`, `Reviewer Workspace`, `Auditor Workspace`, `Cancellation Center`, `Refund & Dispute Center`) plus support-title drift cleanup.
> **2026-05-10 (Copilot-055)**: the Stitch proof attempt has now been reduced to a reproducible two-screen subset. `Ctrl+A` plus chip `Remove` buttons can leave only `Public Landing Page` and `Pricing Options`, but both discovered export paths still converge to the same AI Studio-only panel, `Share` keeps `Copy link` disabled until public sharing/remixing is enabled, and the node-level `play_circle` menu exposed `New Tab` / `Show QR Code` without yielding a captured preview surface under automation. Remaining Stitch task: finish the proof through an approved public-share link or a manual live preview action on that same two-screen subset.
> **2026-05-10 (Copilot-054)**: the live Stitch project now shows `Prototype created`, so the state has advanced beyond the earlier no-prototype checkpoint. But the same machine-verifiable DOM snapshot still reports `0` rendered edge paths on the visible canvas, and the repo-side exported HTML artifacts remain static/unconnected. Remaining Stitch task: prove real navigation inside preview/share or via a fresh `Instant prototypes` export on a tiny subset before treating relationship wiring as done.
> **2026-05-08 (Copilot-053)**: the last stale internal support duplicate in Stitch is now deleted from the live canvas. The remaining Stitch task is prototype edge creation only. A `GEMINI_3_1_PRO` prompt that explicitly asked for existing-screen-only public/customer wiring completed with an acknowledgment but still produced `0` persisted edges, so the next pass must find a deterministic `Connect to screen` or manual edge-creation path instead of reopening cleanup.
> **2026-05-08 (Copilot-052)**: a full Stitch completeness reassessment is now finished. The list surface was proven incomplete, but exact-id verification confirms the eight route-parity screens, five rename replacements, and all fifteen future/exception root screens are still present. The two actually missing canonical hubs were regenerated with `GEMINI_3_1_PRO`: `Management Hub - TruckOpti` (`812ce430430f4856a97142c2f07d0efe`) and `Admin: Driver Management Hub` (`595aec8e180f47bcb0875f67dedc589c`). Remaining Stitch work is now only deleting the stale old internal support node `6ed5645152fc4076984a0239ca5dfe01` and wiring prototype flows; no further root-screen generation is pending.
> **2026-05-07 (Copilot-051)**: the remaining planned Stitch root-screen backlog is now fully executed. The last `15` future-state and exception-state root screens from `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md` are now live, so there is no remaining planned root generation work. Canonical renamed replacements also now exist for support/help and the tracking device pair, and the stale visible source titles for `Support & Help Center - TruckOpti`, `Contact & Support - TruckOpti Public`, `Customer: Live Shipment Tracking`, and `Customer: Live Shipment Tracking (Desktop)` have been deleted from the live canvas. Remaining Stitch work is now hidden-source cleanup plus prototype wiring, with browser automation still blocked on reliable multi-select for `Generate -> Instant prototype`.
> **2026-05-07 (Copilot-050)**: live Stitch duplicate cleanup is now executed, not just planned. The authenticated browser editor removed the exact duplicate auth/legal/support discard set from project `817968552986251880`, archived the near-duplicate marketing-root and customer-portal history/invoice variants, removed the stale `Management Hub - TruckOpti`, mixed `Checkout & Payment Success`, and blueprint artifact screens, and restored the canonical internal support surface as new live screen `6ed5645152fc4076984a0239ca5dfe01` (`Contact & Support - TruckOpti`). Effective live prototype base is now `49` screens even though `list_screens` is still lagging and currently reports `48`. Remaining Stitch work is rename plus flow wiring, not more duplicate cleanup.
> **2026-05-06 (Copilot-049)**: the current-route Stitch parity pass is now executed and confirmed live. Eight screens are now retrievable from the live Stitch project: `Payment Success - TruckOpti`, `Checkout - TruckOpti`, `Not Found - TruckOpti`, `Truck Catalog - TruckOpti`, `Carton Catalog - TruckOpti`, `Sale Orders - TruckOpti`, `Profile - TruckOpti`, and `Driver Trip Detail - TruckOpti`. There is no remaining pending screen generation in the Phase 1 parity batch. Remaining Stitch cleanup still requires manual deletion/archive of the old duplicate screens because the current MCP surface cannot remove them.
> **2026-05-06 (Copilot-048)**: the live TruckOpti Stitch project now has a repo-side cleanup and integration runbook at `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md`. That plan reduces the current prototype to a `49`-screen canonical base after duplicate and near-duplicate cleanup, repurposes the existing mixed payment-result screen, adds `7` missing current-route parity screens, then stages the future-state (`13`) and exception/degraded-state (`10`) surfaces without recreating duplicate auth/legal/support roots. No live screen delete/archive operations were executed from this workspace because the current Stitch MCP surface does not expose them.
> **2026-05-03 (Copilot-045)**: launch blockers remain owner-side, but repo-side closure work is not fully exhausted. Payment callback ownership is now hardened (`supabase/functions/phonepe-checkout/index.ts` ignores arbitrary client callback URLs and builds an allowlisted `/payment/callback` itself), `frontend/src/pages/PaymentCallbackPage.tsx` now routes success to role-home instead of always `/dashboard`, `frontend/src/pages/AdminDriversPage.tsx` now uses `driverSupabaseApi` for approve/reject/suspend, `cd frontend && npm run build` still passes after both edit slices, and `npm audit --omit=dev` still reports `0 vulnerabilities`. Remaining AI-executable closure work is now narrow: shared-service reads for the admin driver list, `apps/web` write-endpoint auth-guard verification, and a repeatable full driver-trip proof lane.
> **2026-05-01 (Copilot-044)**: first service-layer reduction + first CI lane landed locally. `DriverDetailPage` now reads/writes through `driverSupabaseApi` instead of direct page-level Supabase calls, authenticated proof scripts now auto-load `.env.proof.local` / `.env.local` / `.env`, and `.github/workflows/frontend-ci.yml` now runs frontend build + public smoke + frontend smoke + a bounded `apps/web` auth middleware test. Local validation: `cd frontend && npm run build` PASS, local preview smoke PASS (`12/12` public, `50/50` frontend), and `cd apps/web && d:/Github/Truck_Opti/.venv/Scripts/python.exe -m pytest tests/unit/test_authentication_middleware.py -q -o addopts=` PASS (`6/6`). Remaining blockers are still live Razorpay credentials and the broader admin/agency/driver service migration backlog.
> **2026-05-01 (Copilot-042)**: authenticated reviewer proof is now refreshed and green on production. Demo accounts were reseeded, `npm run test:live-auth` now covers driver, agency, customer management, customer dashboard, and customer history with 0 console errors, `npm run test:live-admin` passes all 7 admin routes, and a real Google-authenticated admin session was observed on `/admin`. Remaining launch blockers are now only live Razorpay credentials and PITR/backups confirmation.
> **2026-05-01 (Copilot-041)**: production parity deploy is now complete. Current payment/admin Supabase functions are live on `jbxncejtcbpcronndqlx`, Heroku release `v73` is serving the current frontend/server snapshot, `npm run test:frontend-smoke` now passes `50/50`, `npm run test:public-smoke` passes `12/12`, and `npm run test:prod-config` remains `5/6` with only live Razorpay readiness failing. Remaining launch blockers are purely owner-side: live Razorpay credentials, real Google sign-in proof, and PITR evidence.
> **2026-04-23 (Copilot-036)**: the full executable flow suite has been rerun on the current clean tree before close-day. `npm run test:packing` PASS (`11/11`), `npm run test:public-smoke` PASS (`7/7`), `npm run test:live-buttons` PASS (`7/7`), `npm run test:frontend-smoke` PASS (`17/17`), and `npm run test:prod-config` remains `5/6` with only live Razorpay readiness failing. `npm run test:live-auth` and `npm run test:live-admin` are still blocked by missing `SEED_DEMO_PASSWORD`, so the remaining end-to-end gap is credentialed proof rather than repo regressions.
> **2026-04-23 (Copilot-035)**: repo-side delivery-readiness cleanup is now committed in `b2e64333`. The current committed tree passes `npm run launch-check` (`17/17`) and `npm run test:frontend-smoke` (`17/17`); `npm run test:prod-config` remains `5/6` with only live Razorpay readiness failing. Remaining launch blockers are external credentials and authenticated real-account proof, not repo code or hygiene drift.
> **2026-04-23 (Copilot-034)**: the non-blocking PWA `manualChunks` warning is resolved locally. `frontend/vite.config.ts` now uses `workbox.inlineWorkboxRuntime: true`, which removes the Workbox/Rollup 4 warning on `cd frontend && npm run build`; `scripts/frontend_launch_smoke.mjs` now targets the contact phone field by input type so local preview smoke stays stable when placeholder text changes; and local preview proof with `PUBLIC_APP_URL=http://127.0.0.1:4173` passes `npm run test:public-smoke` (`7/7`) plus `npm run test:frontend-smoke` (`17/17`). Remaining launch blockers are now owner credentials and authenticated proof, not repo-side build noise.
> **2026-04-22 (Copilot-033)**: remaining Packing/Profile/shared-type translation cleanup complete. Removed dead `nameHi` fields from shared pricing/packing types and defaults, flattened `PackingPage` + `ProfilePage` to single live English label sets, and revalidated `cd frontend && npm run build` PASS (`6.93s`) plus `npm run test:frontend-smoke` PASS (`17/17`). The remaining technical follow-up is the still-non-blocking PWA `manualChunks` warning.
> **2026-04-22 (Copilot-032)**: dormant translation cleanup. Removed dead English-only translation branches from `SaleOrdersPage`, `InvoicePage`, `LandingPage`, and `PricingPage`; `cd frontend && npm run build` PASS (`6.66s`). The residual `Unknown input options: manualChunks` warning still appears after successful build and remains the main non-blocking cleanup follow-up.
> **2026-04-22 (Copilot-025)**: launch audit + flow verification. Restored 13 blank helper/status messages across 7 frontend pages, then revalidated `cd frontend && npm run build` PASS (`7.58s`), `npm run test:frontend-smoke` PASS (`17/17`), `npm run test:public-smoke` PASS (`7/7`), `npm run test:prod-config` (`5/6`, only Razorpay failing), and `npm run launch-check` PASS (`17/17`). Follow-up: rerun authenticated proof once `SEED_DEMO_PASSWORD` is available and decide whether to delete dormant translation tables / suppress or document the PWA `manualChunks` warning.
> **2026-04-22 (Copilot-031)**: performance + language cleanup. PWA precache dropped to `1479.01 KiB` after excluding the large vendor bundles from Workbox precache; the remaining live English/Hindi toggles were removed from the app shell plus `PricingPage`, `PackingPage`, and `ProfilePage`; `cd frontend && npx tsc --noEmit` PASS and `cd frontend && npm run build` PASS (`6.88s`). Follow-up: clean dormant translation data and investigate the residual build warning `Unknown input options: manualChunks`.
> **2026-04-21 (Copilot-028)**: health check + code quality + desktop layout. 17/17 launch-check PASS, 17/17 smoke PASS. Fixed TestPaymentPage 2x console.error → logger.error. Desktop layout upgraded on 11 pages (max-w-7xl + lg:p-8). Commit `d5a029e9`. All AI-executable page layout work now done. Remaining: T-127 authenticated E2E, T-130/T-131 sprint tasks, human-blocked prod config.
> **2026-04-21 close-day (Copilot-027)**: professional codetree cleanup complete. Root reduced to 22 essential files. 21 BATCH prompt history files archived. Legacy test scripts and stale report MDs moved to proper dirs. `dist/`, `app/logs/`, `.specify/` removed from git tracking. `.gitignore` hardened. Build green (7.71s, 0 errors). Next: desktop layout upgrades for PackingPage, SaleOrdersPage, RoutesPage, DriverHistoryPage, DriverEarningsPage, AgencyBillingPage; sprint tasks T-127/T-130/T-131.
> **2026-04-20 close-day (Copilot-026)**: desktop modernization complete across 9 pages; API/module docs created (5 files, ~1370 lines); Dashboard.tsx JSX nesting fixed; build 0 errors. Next: ProfilePage + AgencyRegisterPage error-handling cleanup; T-130 retest.

---

## 🎯 ACTIVE TASKS

> **Repo-side preflight/security work is green and production parity is now re-proved on the live site, but launch is still blocked by owner-side production credentials and proof.**
> **Evidence:** `cd frontend && npm run build` passes inside `npm run launch-check`; `cd frontend && npm audit` passes 0 vulnerabilities; `cd apps/web && npm audit` passes 0 vulnerabilities; `python -m pip_audit -r .\apps\web\requirements.txt` is at 0 known vulnerabilities; `npm run test:frontend-smoke` passes 50/50 on 2026-05-01; `npm run test:public-smoke` passes 12/12 on 2026-05-01; local preview `npm run test:public-smoke` also passes 12/12 and local preview `npm run test:frontend-smoke` passes 50/50 on 2026-05-01; the bounded `apps/web` auth middleware test now passes 6/6; `npm run test:prod-config` remains 5/6 on 2026-05-01 with only Razorpay live readiness still failing; the Google sign-in button redirects correctly to `accounts.google.com` via the Supabase callback; and the current production site is serving Heroku release `v74`.
> **2026-04-09 update:** repo-side dependency drift in `apps/web` is fixed again. The refreshed background `launch-check` status is back to PASS for close-day, and the remaining external launch blockers are Razorpay test keys, missing `VITE_SENTRY_DSN`, pending migration push, and unverified authenticated browser flows.
> **2026-04-10 security note:** the local audit surface is green across root, `frontend`, and `apps/web`, including after removing unused `frontend` Electron packaging. GitHub's default-branch alert count is now down to 1 moderate alert after push, and the final alert still needs manual GitHub Security-tab review because `gh` is not authenticated in this workspace. Local `frontend` resolution currently shows `jspdf@4.2.1` -> `dompurify@3.3.2`, so the remaining alert looks more like an authenticated-review/stale-scan problem than a confirmed live npm vulnerability.
> **2026-04-11 security + code quality pass note:** 5 code fixes applied: CheckoutPage auth violation fixed (HIGH — `useState<any>` for user replaced with `useAuthStore()`), Dashboard loadError blank renders replaced with bilingual error UI, PackingPage truck fetchTrucks now filters out zero-dimension trucks, PackingPage state-injected sale order items now validated, packingWorker no longer forwards `error.message` in postMessage. All changes compile with 0 TS errors and all 17 smoke checks still pass on 2026-04-11. Production browser smoke PASS on 6/6 public routes.
> **2026-04-13 packing note:** the old BATCH23 skyline boundary-fit target is already fixed on this tree; the newly verified skyline gap was a mixed load where one 50×150×100 panel plus three 200×50×50 beams fit 4/4 with `extreme_points` but only 3/4 with skyline. The shared skyline engine now evaluates all valid lowest-layer candidates across rotations, and `npm run test:packing` passes 10/10 with the new mixed-load fixture.
> **2026-04-13 security note:** GitHub CLI is now authenticated, the live Dependabot query filtered to `state=open` returns no open alerts, and the earlier 17-alert inventory was historical fixed-state data rather than an active repo mismatch. Local npm/pip audits remain green; Docker Scout base-image CVEs stay tracked separately as container hygiene rather than a current default-branch Dependabot blocker.
> **2026-04-15 repo-side note:** the committed tree is green again after launch hardening in `85e78615`: frontend `follow-redirects` is hardened, `apps/web` declares `py3dbp`, the advanced packer bridge no longer crashes when Socket.IO is uninitialized, and the tracked generated log SQLite DB was removed. Validation now reads `npm run launch-check` PASS (17/17), focused apps/web pytest PASS (8/8), `npm run test:frontend-smoke` PASS (17/17), and `npm run test:live-buttons` PASS (7/7). Remaining blockers are external production config and manual real-account verification only.
> **2026-04-03 repo-side note:** T-130 mitigation landed locally and the smoke evidence is stronger now. `frontend/src/main.tsx`, `frontend/src/utils/runtimeRecovery.ts`, and `frontend/src/components/ErrorBoundary.tsx` recover stale lazy-chunk failures by forcing a safe reload path; `frontend/vite.config.ts` enables Workbox `cleanupOutdatedCaches` and `navigateFallback: '/index.html'`; and `npm run test:frontend-smoke` now exercises 17 checks with 16 passing, including contact-page degraded-mode fallback, login-page auth fallback, and both public onboarding wizards progressing to their next major steps without creating live backend side effects. Live returning-user retest is still pending.
> **2026-04-04 repo-side note:** the duplicated client-side packer has now been consolidated into `frontend/src/lib/packing.ts`, with `PackingPage.tsx`, `packingWorker.ts`, and `usePackingWorker.ts` all using the shared engine/types. The frontend build still passes, and public frontend smoke still lands at 16/17 with only the external `auth-service` check failing.
> **2026-04-04 packing proof note:** `frontend/scripts/packing-regression.ts` now gives deterministic proof for skyline, extreme points, recommendation ranking, and seeded genetic behavior. It also exposed the next quality target: skyline still under-packs boundary-aligned 1m cubes in a 2x2x1 truck while `extreme_points` fits all 4.
> **2026-04-05 packing quality note:** skyline boundary placement is now fixed in the shared client-side engine. `npm run test:packing` now passes 5/5, including a regression that proves skyline packs four 1m cubes into a 2x2x1 truck at exact `x/z = 1` boundaries instead of stalling after the first cube because of floating-step drift.
> **2026-04-05 apps/web verification note:** the legacy `apps/web` Jest/Puppeteer coverage harness now fails fast and explicitly instead of crashing during teardown. `cd apps/web && npm run test:coverage` still fails, but it now reports the real prerequisite: no server is listening on `http://localhost:5000` (or `TRUCKOPTI_E2E_BASE_URL`) rather than throwing a confusing post-teardown Puppeteer import error.
> **2026-04-05 auth/payment hardening note:** auth pages now render only `UserFacingError` messages from the service layer instead of raw provider error text, and PhonePe launch-readiness checks now treat both `sandbox` and `preprod` URLs as non-production in the frontend and the production-config audit.
> **2026-04-04 close-day note:** governance rollout now requires `Operational proof:` in `AI-HANDOFF.md`, ignores generated closeout/coverage artifacts, and keeps Node vulnerability sweeps non-mutating. The next close-day rerun should isolate the real remaining deep-verification failure in `apps/web` coverage.
> **2026-04-16 Graphify note:** the latest Graphify gap sweep is now persisted in `0.dev-matrix/GRAPHIFY_GAPS.md`. Shipment document identity, driver trip progress ownership, payment-history contract cleanup, contact inquiry dedupe, Graphify output-path sync, packing entry-point decomposition, and manual packing summary ownership have all been implemented and revalidated locally. The refreshed graph is now led by stable service/algorithm-core nodes (`initiatePhonePePayment()`, `sendInquiry()`, `initiateRazorpayPayment()`, `createExtremePointPackingAttempt()`, `packSkylineBL()`, `packExtremePoints()`) rather than a clear remaining AI-owned architecture gap.
> **2026-04-16 Supabase rollout note:** the linked remote project `jbxncejtcbpcronndqlx` is now live on the April 16 contract changes. `npx supabase db push` applied `20260416000000_sync_trip_offer_tracking.sql` and `20260416010000_graphify_gap_contract_fixes.sql` after repairing ambiguous RLS references and making the contact-inquiries migration self-heal remote drift; `npx supabase db push --dry-run --yes` now reports `Remote database is up to date`; and `phonepe-checkout`, `phonepe-status`, `verify-payment`, and `verify-razorpay-payment` are deployed.
> **2026-04-16 packing-architecture note:** the graph-driven packing cleanup is complete for now. `frontend/src/lib/packing.ts` now owns shared recommendation summarization via `createTruckRecommendation(...)`, and `PackingPage.tsx` no longer duplicates or miscomputes manual-pack metrics. Verification: `cd frontend && npm run test:packing` PASS (11/11), `cd frontend && npm run build` PASS, `npm run test:frontend-smoke` PASS (17/17), `npm run graph:update` PASS (`398 nodes`, `453 edges`, `76 communities`), `npm run launch-check` -> 16 passed / 1 failed (git cleanliness only).
> **2026-04-16 marketing note:** the public marketing shell is stronger on desktop now. `LandingPage.tsx` and `PricingPage.tsx` received a second-pass typography/spacing treatment, and the remaining public pages (`CheckoutPage`, `ContactPage`, `DriverRegisterPage`, `AgencyRegisterPage`, `TermsPage`, `PrivacyPage`, `PaymentCallbackPage`, `AuthCallbackPage`) were re-audited to confirm they still own standalone full-page layouts outside `AuthLayout`. Verification: `cd frontend && npm run build` PASS; `npm run test:frontend-smoke` PASS (17/17). Pending proof: a local browser screenshot pass still needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` because preview boot currently crashes without them.
> **2026-04-16 launch-execution note:** the local public-browser gap is now closed. An ignored `frontend/.env.local` let preview boot against the documented public Supabase URL/anon key; `/` and `/pricing` were revalidated at desktop width with zero console errors and screenshots; Sentry project `light9/truck-opti` was created; Heroku `VITE_SENTRY_DSN` is now set; and `npm run test:prod-config` now passes 5/6 with only Razorpay live-readiness still failing because Heroku still serves `rzp_test_*`.
> **2026-04-16 auth-scope note:** launch-safe auth is now enforced in the public UI. `LoginPage.tsx` defaults to Email OTP + Google, hides SMS/WhatsApp unless `VITE_AUTH_PHONE_OTP_ENABLED=true`, and `SignupPage.tsx` now treats Email OTP as on unless explicitly disabled. Verification: `cd frontend && npm run build` PASS, `npm run test:frontend-smoke` PASS (17/17), Playwright preview on `/login` shows Email OTP + Google with phone OTP deferred. If phone OTP is re-enabled later, the supported path is Supabase Phone + Twilio/Twilio Verify only.
> **2026-04-17 repo-side note:** transitive `basic-ftp@5.2.2` drift reappeared in `apps/web` through Puppeteer's test stack; `cd apps/web && npm audit fix` refreshed one package and restored `cd apps/web && npm audit` to 0 vulnerabilities. Current-tree verification is `cd frontend && npm run build` PASS, `npm run test:frontend-smoke` PASS (17/17), `npm run test:prod-config` PASS (5/6) with only Razorpay failing, and `npm run launch-check` now fails only on git working-tree cleanliness (16 passed, 1 failed).
> **2026-04-17 strategy note:** the canonical future-state plan for password login, role-specific demo IDs, onboarding tracks, partner/internal API flows, and TruckOpti office-team permissions now lives in `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md`. Current launch-safe auth remains Email OTP + Google; password auth is now an approved next-stage roadmap item rather than an ad-hoc request.
> **2026-04-17 tooling note:** native `opencode` on this machine now runs directly on `zai-coding-plan/glm-5.1` without the `oh-my-opencode` plugin and without `--pure`, so parallel native `opencode` lanes are available again for AI-executable repo work.

| ID | Task | Priority | Type | Status |
|----|------|----------|------|--------|
| T-124 | Frontend testing pass for key user-facing pages | P0 | 🧪 Product | 🟡 Full browser route audit completed: 47 routes exercised, and automated frontend smoke now passes 17/17 checks for the public/auth shell; remaining product-side gap is authenticated real-account verification |
| T-125 | Improve advanced 3D bin-packing algorithm quality | P0 | 🧠 Product | 🟡 Shared client-side packer extraction is done; skyline boundary under-packing and the next mixed-load skyline rotation gap are both fixed, and deterministic packing proof is now 10/10. Next quality step is broader heuristic benchmarking beyond these repaired heuristics. |
| T-126 | Move packing algorithm execution to client side where required UX/perf needs it | P0 | 🏗️ Architecture | 🟡 Client-side execution is now cleaner: both the page fallback and the Web Worker use the shared frontend packing module, and regression proof exists; remaining work is deeper perf evidence rather than architectural duplication |
| T-127 | Test all major paths and end-to-end flows, not just preflight gates | P0 | 🧪 Product | ✅ EXTENDED 2026-05-01: authenticated proof scripts now auto-load `.env.proof.local` / `.env.local` / `.env` through `scripts/_proofEnv.cjs`, so repeat runs no longer depend on one-off shell export; `test:live-auth` + `test:live-admin` stay credential-gated by `SEED_DEMO_PASSWORD`, but the injection path is now standardized. Earlier proof: authenticated E2E 2026-05-01 for admin+driver+agency+customer. |
| T-128 | Restore live Supabase auth/backend reachability for production frontend | P0 | 🔑 External | ✅ Reachability restored on 2026-04-05 after the Supabase project was resumed; next step is authenticated E2E verification rather than DNS recovery |
| T-110 | Production Razorpay keys + test | P0 | 🔑 External | 🔴 Blocking: post-`v73` prod-config on 2026-05-01 still shows `VITE_RAZORPAY_KEY_ID=rzp_test_1DP5mmOlF5G5ag` on Heroku; set live public key on Heroku plus matching `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in the linked Supabase project, then rerun the config audit |
| T-111 | Google OAuth production credentials verification | P0 | 🔑 External | ✅ DONE — real Google-authenticated production admin session observed on `/admin` on 2026-05-01 after the chairman completed sign-in in the integrated browser |
| T-113 | SMS/WhatsApp OTP — configure Twilio in Supabase | P2 | 🔑 External | 🟡 Deferred optional feature: public auth now launches on Email OTP + Google by default, and phone OTP stays hidden unless `VITE_AUTH_PHONE_OTP_ENABLED=true`. If re-enabled later, use Supabase Phone with Twilio Verify or Twilio Programmable Messaging only. |
| T-114 | Smoke test all authenticated pages (post-login) | P1 | 🧪 Manual | ✅ DONE — `npm run test:live-auth` plus `npm run test:live-admin` are green on 2026-05-01, covering driver/agency/customer/admin review paths with refreshed demo accounts |
| T-115 | Verify production DB backup / PITR setup | P1 | 🔑 External | 🟡 ACCEPTED TEMPORARY STRATEGY — Supabase dashboard evidence captured on 2026-05-01 shows the current project is on a Free plan: Scheduled Backups says `Free Plan does not include project backups`, and Point in Time says `Point in Time Recovery is a Pro Plan add-on`. Owner decision: use the current Telegram private-channel external logical backup posture for launch and defer native Supabase backups/PITR until the project is earning and can justify the paid plan. |
| T-116 | Sentry DSN configuration | P1 | 🔑 External | ✅ DONE — created Sentry project `light9/truck-opti` and set Heroku `VITE_SENTRY_DSN` on 2026-04-16; `npm run test:prod-config` now passes the Sentry check |
| T-117 | Supabase db push (linked live rollout) | P0 | 🔑 External | ✅ DONE — linked project `jbxncejtcbpcronndqlx` is up to date on 2026-04-16 after applying `20260416000000_sync_trip_offer_tracking.sql` and `20260416010000_graphify_gap_contract_fixes.sql` |
| T-129 | PhonePe production configuration | P1 | 🔑 External | ✅ PhonePe sandbox was disabled in Heroku on 2026-04-09 for launch; only reopen if PhonePe must ship with production credentials |
| T-131 | Reconcile GitHub Dependabot alert count with local audits | P1 | 🔐 Security | ✅ DONE — authenticated `gh api` verification on 2026-04-13 shows `state=open` returns no open Dependabot alerts; the earlier 17-alert inventory was historical fixed-state data, not a live repo mismatch |
| T-140 | Decompose packing algorithm hotspots | P1 | 🏗️ Architecture | ✅ DONE — wrapper, dispatch, and page-layer summary ownership drift are closed; current Graphify hotspots are stable service/algorithm-core nodes rather than a clear remaining AI-owned architecture gap |
| T-130 | Fix stale service-worker chunk invalidation for returning users | P1 | 🧪 Product | ✅ DONE — live Playwright retest 2026-04-12: all 6 public routes clean, 0 chunk errors, 0 page errors, Workbox precache 69 entries, SW `activated` state |
| T-149 | Verify Stitch prototype relationship proof | P1 | 🧪 Product | 🟡 Two-screen subset is now reproducible (`Public Landing Page`, `Pricing Options`), but both export paths converge to the same AI Studio-only panel, `Share` is gated by the public-toggle path, and node-level `New Tab` / `Show QR Code` surfaced without a captured preview proof |
| T-150 | Build Stitch reference pack for route and flow gaps | P1 | 🧩 Product | 🟡 Current 16-screen reference pack is now defined and six missing current-route screens were generated with `GEMINI_3_1_PRO`; remaining optional backlog is the future-gap/reference set (`Customer: Live Shipment Tracking - Mobile`, partner/demo/reviewer/auditor, cancellation, refund/dispute) |
| T-151 | Add focused payment and trip tests | P1 | 🧪 Quality | ✅ DONE locally — added `frontend` Vitest lane plus focused regression coverage for `frontend/src/services/razorpayPayment.ts::initiateRazorpayPayment` and the extracted driver-trip progress helper now used by `frontend/src/pages/DriverTripPage.tsx`; validated with `cd frontend && npm run test:unit` (`7/7`) and `cd frontend && npm run build` PASS |
| T-152 | Reconcile MCP workflow docs with repo truth | P1 | 🧭 Governance | ✅ DONE locally — fixed AI-HANDOFF contract drift, AGENTS / `.github/instructions` ownership references, start-day retrieval guidance, Graphify raw-file behavior, and the code-review-graph untracked-file caveat |
| T-153 | Clear Graphify install drift warning | P2 | 🛠️ Tooling | 🟡 `npm run graph:update` warns `skill is from graphify 0.4.15, package is 0.4.18`; run `graphify install` and verify the warning disappears |
| T-154 | Restore clean-tree launch proof | P0 | 🧼 Governance | 🟡 Current repo-side readiness is still `16/17` because `Git working tree cleanliness` fails; package or clean the current readiness batch and rerun `npm run launch-check` |
| ~~BATCH21-T1~~ | ~~Admin payout workflow (approve/pay)~~ | ~~P1~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T2~~ | ~~Sentry error tracking~~ | ~~P1~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T3~~ | ~~Driver GPS broadcast on trip~~ | ~~P2~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T4~~ | ~~Subscription upgrade/downgrade~~ | ~~P2~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T5~~ | ~~LAUNCH_CHECKLIST update~~ | ~~P2~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T1~~ | ~~Supabase db push helper script~~ | ~~P1~~ | UNCLAIMED | - | ⏭️ Superseded by human action item |
| ~~BATCH21-T2~~ | ~~Sentry via @sentry/react~~ | ~~P1~~ | UNCLAIMED | - | ⏭️ Already done in earlier batch |
| ~~BATCH21-T3~~ | ~~Admin payout approve/pay~~ | ~~P1~~ | UNCLAIMED | - | ⏭️ Already done in BATCH20 |
| ~~BATCH21-T4~~ | ~~Driver GPS broadcast~~ | ~~P2~~ | UNCLAIMED | - | ⏭️ Already done in earlier batch |
| ~~BATCH21-T5~~ | ~~Subscription upgrade/downgrade~~ | ~~P2~~ | UNCLAIMED | - | ⏭️ Already done in earlier batch |
| ~~BATCH20-T1~~ | ~~Photo columns migration~~ | ~~P0~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T2~~ | ~~Driver wallet real balance~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T3~~ | ~~Agency payroll Pay button~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T4~~ | ~~Subscription enforcement~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ⚠️ DONE (BUG: isAdmin wrong field fixed by SONNET-006) |
| ~~BATCH20-T5~~ | ~~Admin subscriptions page~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T6~~ | ~~Dependabot vite-plugin-pwa fix~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (0 vulns) |
| ~~BATCH20-T7~~ | ~~E-way bill form stub~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T8~~ | ~~Launch checklist update~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH19-T0~~ | ~~Dependabot 32 alerts~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T6) |
| ~~BATCH19-T1~~ | ~~Photo column verification~~ | ~~P0~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T1) |
| ~~BATCH19-T2~~ | ~~Driver wallet balance~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T2) |
| ~~BATCH19-T3~~ | ~~Agency payroll page~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T3) |
| ~~BATCH19-T4~~ | ~~FCM push notifications~~ | ~~P2~~ | UNCLAIMED | - | ⏭️ Deferred to BATCH21-T4 variant |
| ~~BATCH19-T5~~ | ~~E-way bill form~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T7) |
| ~~BATCH18-T1~~ | ~~Driver withdrawal request UI~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ⚠️ DONE (BUG: table fixed by SONNET-006) |
| ~~BATCH18-T2~~ | ~~Admin revenue trend chart~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH18-T3~~ | ~~Invoice GST fields~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ✅ Already existed (pre-BATCH18) |
| ~~BATCH18-T4~~ | ~~Trip photos lightbox~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH18-T5~~ | ~~Admin user management page~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ⚠️ DONE (BUG: full_name→name fixed by SONNET-006) |
| ~~BATCH17-T1~~ | ~~Supabase migration push (human)~~ | ~~P0~~ | MINIMAX-003 | 2026-03-09 | ✅ Skipped (human task) |
| ~~BATCH17-T2~~ | ~~Landing page SEO + meta tags~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH17-T3~~ | ~~Agency job dispatch modal~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ Already existed (v43) |
| ~~BATCH17-T4~~ | ~~Driver live GPS broadcast~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ Already existed (v39/v40) |
| ~~BATCH17-T5~~ | ~~Admin CSV export button~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T1~~ | ~~Admin payouts nav card~~ | P1 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T2~~ | ~~E2E smoke test for RLS created_by~~ | P0 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T3~~ | ~~Fix remaining raw error.message leaks~~ | P1 | SONNET-005 | 2026-03-09 | ✅ DONE (14 in 7 files) |
| ~~BATCH16-T4~~ | ~~Contact page~~ | P2 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T5~~ | ~~Admin contact inquiries view~~ | P2 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH15-T2~~ | ~~BUG-023: vite-plugin-pwa downgrade + serialize-javascript override~~ | ~~P2~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH15-T3~~ | ~~Add created_by to shipment inserts (RLS)~~ | ~~P0~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH15-T4~~ | ~~Add created_by to routes/packing inserts (RLS)~~ | ~~P0~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH15-T5~~ | ~~Add created_by to customer inserts (RLS)~~ | ~~P0~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T1~~ | ~~BUG-REDIRECT-001 PhonePe domain validation~~ | ~~P0~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T2~~ | ~~npm audit fix (40+ vulns)~~ | ~~P0~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE — 4 high remain (build-time only, BUG-023) |
| ~~BATCH14-T3~~ | ~~Driver withdrawal → driver_payouts table~~ | ~~P1~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T4~~ | ~~Admin approve/reject agencies~~ | ~~P1~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T5~~ | ~~Admin approve/reject drivers~~ | ~~P1~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T1~~ | ~~BUG-REDIRECT-001 PhonePe domain validation~~ | ~~P0~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T2~~ | ~~npm audit fix for 45 vulnerabilities~~ | ~~P0~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T3~~ | ~~Driver withdrawal writes to driver_payouts~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T4~~ | ~~Admin approve/reject agencies~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T5~~ | ~~Admin approve/reject drivers~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T1~~ | ~~RLS security fixes (customers, shipments, routes, packing_results)~~ | ~~P0~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T2~~ | ~~SMS OTP via Twilio - error handling~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T3~~ | ~~Subscription upgrade/downgrade flow~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T4~~ | ~~Bundle size optimization (lazy load three, pdf, excel)~~ | ~~P2~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T5~~ | ~~Root directory cleanup~~ | ~~P3~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH12-T1~~ | ~~Razorpay webhook Edge Function~~ | ~~P1~~ | SONNET-004 (judge) | 2026-03-06 | ✅ DONE |
| ~~BATCH12-T2~~ | ~~Admin dashboard real analytics~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |
| ~~BATCH12-T3~~ | ~~Driver document upload~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |
| ~~BATCH12-T4~~ | ~~Customer shipment history page~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |
| ~~BATCH12-T5~~ | ~~Agency notification bell~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |

---

## 🧭 FUTURE STRATEGY BACKLOG

| ID | Task | Priority | Type | Status |
|----|------|----------|------|--------|
| T-142 | Add password auth as a secondary login path for demo, reviewer, partner, and office accounts | P0 | 🏗️ Architecture | 🟡 IN PROGRESS — password login/signup/reset now ships behind `VITE_AUTH_PASSWORD_ENABLED`, the April 18 Supabase migrations are live through `20260418005000`, and live production proof is complete for seeded driver/agency/customer login-ID flows on `www.truckopti.in`; remaining scope is safe admin plus reviewer/partner/office persona coverage and real email OTP / Google verification |
| T-143 | Provision role-scoped demo IDs and reviewer identities for each major interface | P1 | 🧪 Product | 🟡 IN PROGRESS — first live demo identities now exist for `demo.driver`, `demo.agency`, and `demo.customer` with linked `user_id` ownership and working password/login-ID proof; remaining scope is second demo accounts per interface family plus reviewer/admin/partner/office personas, with credentials kept outside git |
| T-144 | Introduce office-permission bundles and partner-console access model | P1 | 🏗️ Platform | 🟡 PLANNED — refined bundle targets now include `security_admin`, `support_lead`, and `demo_operator`; partner API onboarding and office-team rights stay defined in `0.dev-matrix/PLATFORM-ROLE-INTERFACE-PLAN.md` |
| T-145 | Define onboarding-track and tenant-boundary contract for customer, driver, agency, partner, and office users | P1 | 🏗️ Architecture | 🟡 PLANNED — formalize `organization_id`, `branch_id`, `booking_type`, `delegated_by`, `source_system`, and onboarding-track ownership before portal expansion |
| T-146 | Define internal API and typed event taxonomy for partner, agency, customer, and office flows | P1 | 🏗️ Platform | 🟡 PLANNED — establish the canonical service and event contract before building the partner console or deeper office workflow automation |

---

## 📝 TASK QUEUE

> **Hard launch blockers are now concrete external production-config and owner-action items, but a small amount of non-blocking AI-executable closure work still remains around service-layer drift, payment-flow hardening follow-up, and deeper authenticated proof.**
> **See `0.dev-matrix/OWNER_ACTION_CHECKLIST.md` for precise instructions.**

| ID | Task | Priority | Nature | Owner Action |
|----|------|----------|--------|--------------|
| T-110 | Production Razorpay keys + test | P0 | External | Heroku config:set + Supabase secrets |
| T-111 | Google OAuth production credentials | P0 | External | Supabase dashboard + Google Console |
| T-113 | SMS/WhatsApp OTP via Twilio | P2 | External | Optional after launch unless SMS/WhatsApp auth must be re-enabled; use Supabase Phone with Twilio Verify or Twilio Programmable Messaging, then set `VITE_AUTH_PHONE_OTP_ENABLED=true` |
| T-115 | Verify production DB backup / PITR | P1 | External | Supabase dashboard → Backups |
| T-114 | Authenticated smoke test (all pages) | P1 | Manual | Driver/agency/customer password proof is done on production; remaining manual proof is safe admin plus real email OTP / Google-account sign-in |
| T-131 | Reconcile GitHub Dependabot alert count with local audits | P1 | Security | RESOLVED 2026-04-13: authenticated `gh api` query with `state=open` returned no open alerts; the larger alert inventory was historical fixed-state data |
| T-107 | Google Maps API key (optional) | P2 | External | Leaflet fallback works; nice-to-have |

---

## 📖 HOW TO CLAIM A TASK

### Step 1: Check Availability
```
1. Read TASK QUEUE above
2. Find unclaimed task matching your skill level
3. Check STATE.md for any conflicts
```

### Step 2: Claim the Task
```markdown
Move task from QUEUE to ACTIVE TASKS:
| T-001 | Fix login bug | P1 | YOUR-ID | 2026-01-11 16:00 | 🟡 In Progress |
```

### Step 3: Work the Task
```
1. Break into atomic steps (in your notes)
2. Work ONE step at a time
3. Test after each step
4. Update status if blocked
```

### Step 4: Complete the Task
```
1. All tests passing
2. Move to COMPLETED section
3. Add learnings to PATTERNS.md
4. Remove from ACTIVE TASKS
```

---

## ✅ COMPLETED TASKS

> **Recently completed. Archive weekly.**

| ID | Task | Completed By | Date | Notes |
|----|------|--------------|------|-------|
| T-148 | Harden PhonePe callback ownership in the payment edge flow | Copilot / GitHub Copilot | 2026-05-03 | `phonepe-checkout` now builds an allowlisted `/payment/callback` server-side, the browser client no longer sends `callbackUrl`, payment success now routes to role-home, and validation stayed green (`get_errors`, frontend build, root prod audit) |
| T-147 | Reconcile AdminDriversPage moderation with the shared driver service | Copilot / GitHub Copilot | 2026-05-03 | approve/reject/suspend now use `driverSupabaseApi` just like `DriverDetailPage`, eliminating the mutation drift while keeping the list query unchanged; frontend build PASS |
| T-141 | Restore `apps/web` audit gate after transitive `basic-ftp` drift | GPT-020 / GitHub Copilot | 2026-04-17 | `npm audit fix` refreshed one package in `apps/web`; `npm audit` is back to 0 vulnerabilities and launch-check now fails only git cleanliness |
| T-130 | Qdrant semantic gap audit (16 checks, 44 issues) | COP-003 / Copilot | 2026-04-11 | tools/qdrant_gap_audit.py; QDRANT_GAP_REPORT.md; live Qdrant index ws-6df6af38d373c83b |
| T-117 | Supabase linked live rollout | GPT-014 / GitHub Copilot | 2026-04-16 | authenticated CLI, repaired the April 16 migrations for remote drift, pushed the linked DB to current state, and deployed `phonepe-checkout`, `phonepe-status`, `verify-payment`, and `verify-razorpay-payment` |
| T-139 | Graphify refresh workflow + gap ledger | GPT-014 / GitHub Copilot | 2026-04-16 | `npm run graph:update` now refreshes `frontend/src` and syncs root `graphify-out/`; gap backlog persisted in `0.dev-matrix/GRAPHIFY_GAPS.md` |
| T-138 | Contact inquiry dedupe + service extraction | GPT-014 / GitHub Copilot | 2026-04-16 | `contactInquiry.ts` owns draft/pending storage + stable `client_submission_id`; build PASS, smoke PASS 17/17 |
| T-137 | Payment history contract cleanup | GPT-014 / GitHub Copilot | 2026-04-16 | PhonePe client/server ownership unified, provider status normalized to `success`, subscription activation updated to current schema |
| T-136 | Driver trip progress RPC consolidation | GPT-014 / GitHub Copilot | 2026-04-16 | `persist_driver_job_offer_progress(...)` owns status/timestamp/photo/finalize flow; build PASS, smoke PASS 17/17 |
| T-135 | Shipment document identity persistence | GPT-014 / GitHub Copilot | 2026-04-16 | `shipments.invoice_number/lr_number` now DB-owned with trigger + backfill RPC; InvoicePage reads persisted values |
| T-131 | Auth mismatch fixes (5 pages) | COP-003 / Copilot | 2026-04-11 | InvoicePage, CompanyProfilePage, TrucksPage, PaymentCallbackPage, DriverRegisterPage |
| T-132 | Error handling fixes (3 pages) | COP-003 / Copilot | 2026-04-11 | Dashboard Promise.all, AgencyBillingPage try/catch, AgencyFleetPage try/catch |
| T-133 | Error UI fixes (3 pages) | COP-003 / Copilot | 2026-04-11 | RoutesPage + ManagementPage toast.error; AgencyRatesPage try/catch |
| T-111 | ToS/Privacy Policy pages | SONNET-001 | 2026-03-03 | TermsPage.tsx + PrivacyPage.tsx created; routes added; links fixed in Login/Signup |
| T-109 | Browser smoke test all public pages | SONNET-001 | 2026-03-03 | B1-B8 bugs found and documented; see KNOWN ISSUES in STATE.md |
| T-112 | Enable Email OTP | SONNET-001 | 2026-03-03 | VITE_AUTH_EMAIL_OTP_ENABLED=true in .env + .env.production |
| T-119 | Fix silent phone OTP failure (no error shown) | SONNET-001 | 2026-03-03 | supabaseApi.ts signInWithPhone: added phone_provider_disabled friendly error |
| T-120 | Fix PricingPage dead CTA buttons (Start Free, Get Started ×4, Contact Sales, Talk to Us) | SONNET-001 | 2026-03-03 | All 6 CTA buttons now have onClick; navigate('/signup') or mailto: |
| T-121 | Harden `apps/web` dependency surfaces | GLM-002 / OpenCode | 2026-03-30 | `756285a0` + `0599fa53`; apps/web npm audit clean, pip-audit clean, compileall pass |
| T-123 | Auth architecture decision doc + launch checklist updates | GLM-005 / GLM-5.1 | 2026-03-31 | docs/AUTH_ARCHITECTURE_DECISIONS.md; Telegram-as-DB analysis; OTP migration options |
| T-122 | Add repeatable launch-readiness preflight | GLM-003 / OpenCode | 2026-03-31 | `92eb6324` + `50e519db`; later extended to 14/14 checks including deep scan, glue check, and tree/state hygiene |
| T-100 | Cloudflare + Heroku dual-domain SSL validation | GPT-5.3-Codex | 2026-02-22 | `truckopti.in` + `www` live |
| T-101 | Launch readiness continuation (BATCH6+7) | Copilot (Claude Sonnet) | 2026-03-03 | 10 BATCH6 tasks + 5 BATCH7 tasks done |
| T-102 | Build `useSubscription` hook + trial/expiry logic | Copilot (Claude Sonnet) | 2026-03-03 | `useSubscription.ts` — 235 lines, 42/42 tests |
| T-103 | Pricing page DB source of truth + fallback | Copilot (Claude Sonnet) | 2026-03-03 | Already implemented; verified |
| T-104 | Profile auth data cleanup | Copilot (Claude Sonnet) | 2026-03-03 | No hardcoded data found; verified clean |
| T-105 | Supabase integration script + run report | Copilot (Claude Sonnet) | 2026-03-03 | 42/42 PASS |
| T-106 | Full smoke + launch tracker completion | Copilot (Claude Sonnet) | 2026-03-03 | Tracker + Checklist updated with real results |
| T-001 | Update folder reference | OPUS-002 | 2026-01-11 | Framework test ✅ |
| T-000 | Universal framework setup | OPUS-001 | 2026-01-11 | Multi-agent ready |

---

## 🚫 BLOCKED TASKS

> **Tasks that cannot proceed. Include blocker reason.**

| ID | Task | Blocked By | Blocker | Since |
|----|------|------------|---------|-------|
| | None currently | | | |

---

## 📝 TASK TEMPLATES

### Bug Fix Task
```markdown
| ID | Task | Priority | Complexity | Est. Time | Files |
|----|------|----------|------------|-----------|-------|
| T-XXX | Fix: [error message or symptom] | P1 | S | 30min | path/file.js |

**Description:**
[What's broken]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]

**Expected:** [What should happen]
**Actual:** [What happens instead]

**Acceptance Criteria:**
- [ ] Error no longer occurs
- [ ] Tests pass
- [ ] No regression
```

### Feature Task
```markdown
| ID | Task | Priority | Complexity | Est. Time | Files |
|----|------|----------|------------|-----------|-------|
| T-XXX | Add: [feature name] | P2 | M | 2h | multiple |

**Description:**
[What to build]

**User Story:**
As a [user type], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Feature works as described
- [ ] Tests added
- [ ] Documentation updated
```

### Refactor Task
```markdown
| ID | Task | Priority | Complexity | Est. Time | Files |
|----|------|----------|------------|-----------|-------|
| T-XXX | Refactor: [area] | P3 | M | 2h | multiple |

**Description:**
[What to improve]

**Reason:**
[Why this refactor is needed]

**Acceptance Criteria:**
- [ ] Code improved
- [ ] Behavior unchanged
- [ ] Tests still pass
- [ ] No performance regression
```

---

## 🔄 TASK LIFECYCLE

```
CREATED → QUEUED → CLAIMED → IN PROGRESS → COMPLETED
                      │
                      ├──→ BLOCKED → (resolved) → IN PROGRESS
                      │
                      └──→ ABANDONED → QUEUED (unclaim)
```

---

## 👥 MULTI-AGENT TASK RULES

### Rule 1: One Task Per Agent
```
Each agent works on ONE task at a time.
Complete or park before claiming another.
```

### Rule 2: Claim Before Work
```
NEVER start working without claiming.
Check STATE.md for file conflicts.
```

### Rule 3: Update Regularly
```
Update status every significant step.
If blocked >1 hour, add to BLOCKED section.
```

### Rule 4: No Duplicate Claims
```
If task is claimed, pick another.
If urgent, coordinate via STATE.md messages.
```

### Rule 5: Clean Handoff
```
If abandoning task, add notes.
Move back to QUEUE, not delete.
```

---

## 🤖 AI-SPECIFIC GUIDELINES

### For Small LLMs (7B-13B)
```
✓ Claim S-complexity tasks
✓ Prefer bug fixes and text changes
✓ One file at a time
✓ Ask for help if stuck >30min
```

### For Medium LLMs (30B-70B)
```
✓ Can handle M-complexity tasks
✓ Can work on features
✓ Multiple related files OK
✓ Can break down L tasks
```

### For Large LLMs (70B+)
```
✓ Can handle L/XL tasks
✓ Can create new tasks
✓ Can resolve blocked tasks
✓ Can mentor smaller AIs
```

---

## 📌 QUICK REFERENCE

### Claim a Task
```
1. Copy task from QUEUE
2. Paste to ACTIVE TASKS
3. Add your ID and timestamp
4. Start working
```

### Complete a Task
```
1. Verify all acceptance criteria
2. Run all tests
3. Move to COMPLETED
4. Add to PATTERNS.md if learned something
```

### Block a Task
```
1. Move to BLOCKED section
2. Describe the blocker clearly
3. Post in STATE.md messages
4. Work on different task
```

---

**Last Updated:** 2026-04-17 | **Framework Version:** 2.0
