# TO-135 Result — Prove the dispatch-to-delivery business loop

**Task:** `agent-tasks/025-driver-agency-journey-proof.md`
**Verdict:** **PASS with six reproduced findings and two tiers reported as NOT EXECUTED** (ready for GPT-6 review; no deployment or live change authorized by this work)
**Date:** 2026-10-05 · **Worker:** GLM-5.3 Flash (writer-TO-135) · **Branch:** `main` (no push)
**Evidence level:** **local DB** (real PostgreSQL engine, PGlite WASM, full committed migration chain, real RLS/triggers/RPCs/privileges, two agencies + two drivers + customer) + **fixture-tier browser** (local-first build, device-local PGlite/IndexedDB). The disposable Supabase stack and credentialed staging tiers were **not executable on this machine** and are reported with exact evidence below — no mock was substituted for them.

---

## 1. What was done

The brief's journey — **customer shipment → agency dispatch → fleet/driver assignment → driver offer accept → pickup proof/OTP → transit/tracking → delivery proof/OTP → shipment status/history → agency ledger → driver earnings** — was executed against the strongest locally available persistence engine: PGlite (real PostgreSQL 18.3), replaying all 35 committed migrations and driving the same SQL surfaces the frontend services and agency/admin Edge Functions use: real RLS, real role switching (`SET ROLE authenticated` + `request.jwt.claims`, what PostgREST does), real guard triggers, real SECURITY DEFINER RPCs (`respond_to_job_offer`, `persist_driver_job_offer_progress`, `get_shipment_job_offer_tracking`, `ensure_shipment_document_numbers`) and real table/column privileges.

Coverage per the brief's required checks: **two agencies and two drivers** (plus a third suspended agency for the matrix); **cross-tenant requests rejected** where the policies enforce it and **reproduced where they do not** (finding 5); **pending/approved/suspended matrix** for agencies and drivers; **replayed events** (duplicate accept, duplicate decline, duplicate delivery, replayed agency status); **real document/trip-photo storage** (trip-photos bucket config + object upload under the driver's own folder, `driver-docs` private-bucket re-check); **one complete journey and its stored audit trail** (server timestamps at every trip step, statuses, photos, document numbers); **mobile driver and desktop agency views** at the fixture tier (launch smoke 63/63 incl. driver/agency route gating + local-first device workspace 2/2 viewports).

Six defects/gaps were reproduced (2 are tenant/status crossover vectors). **None were repaired**: every one needs migrations/policies or Edge Function changes, which are outside the brief's allowed file list (`scripts/` harness + two service files + affected pages only). They are recorded in §6 for focused follow-up slices.

## 2. Changed files

| File | Change |
|---|---|
| `scripts/dispatch_delivery_journey.db.test.mjs` | **New.** Dispatch-to-delivery journey + agency/driver isolation proof (allowed scope: new E2E harness under `scripts/`). Exits 1 on any failed case or missing PGlite; findings are separate from passing cases. |
| `agent-results/025-result.md` | This result. |
| `TASKS.md` | TO-135 row → `AWAITING_REVIEW`. |

No product code was changed. Nothing else in the tree was touched (see §10).

## 3. Why the disposable local Supabase stack / staging was not run (exact evidence, all re-verified this session)

| Probe (this session, repo root) | Result |
|---|---|
| `docker --version` | **exit 127** — `/usr/bin/bash: line 2: docker: command not found` |
| `cmd.exe /c "docker ps"`, `where.exe docker` | docker not found (`where` exit 1) |
| PowerShell `Get-Command docker`; `Test-Path '\\.\pipe\docker_engine'` / `dockerDesktopLinuxEngine` | no command; both pipes `False` |
| `C:/Program Files/Docker` | not present (empty/missing) |
| `wsl.exe -l -v` | `docker-desktop` distro **Stopped**; `wsl -- docker ps` → "invoke the docker CLI from the Windows Command Prompt… not supported" |
| `npx --yes supabase --version` | `2.119.0` (CLI fetchable) |
| `npx --yes supabase status` | **exit 1** — `failed to inspect container health: docker: command not found (podman also not found) — install Docker Desktop or Podman and ensure it is on PATH` |

The 2026-10-04 completion verdict sanctions exactly this fallback: "TO-134/135/136 journey+RLS proof batteries — prerequisite: rebuild the disposable Supabase stack … **or extend the PGlite harness**." This result takes the sanctioned harness path and labels its evidence class precisely.

Credentialed **staging** E2E is additionally owner-gated: the historical hosted project is NXDOMAIN (TO-125 §3) and staging identities/hosted access are owner-controlled (`TASKS.md` known owner gates). No hosted request was made.

## 4. Local DB journey proof — `node scripts/dispatch_delivery_journey.db.test.mjs` → **exit 0, 35/35 cases + 6 findings**

Captured log: `logs/to135-db-proof-final.txt` (gitignored). Engine line: `PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten`; migration chain applied **35/35 files** (`last=20261005000000_trip_photo_url_correction.sql`).

| # | Case | Result |
|---|---|---|
| 0 | Full migration chain replays cleanly (newest last) | PASS |
| 1–4 | Six identities sign up (role `user`); agency A registers → forced `pending`, self-approval blocked; A+B approved / C suspended; suspended agency fails the Edge approval contract | PASS |
| 5–7 | Portal authority assigns approved driver to fleet; portal contract rejects pending/cross-agency/out-of-fleet; fleet rows tenant-isolated | PASS |
| 8–10 | Customer booking with server `INV-`/`LR-` identity; pending driver cannot respond to an offer (RPC approval gate); driver pending→approved | PASS |
| 11–13 | Agency dispatch job created under own-agency RLS; duplicate (agency, shipment) rejected by unique key; portal authority assigns fleet driver; agency jobs tenant-isolated | PASS |
| 14–17 | Offer dispatched by owning agency (RLS), OTP columns unreadable, cross-agency offer denied; expired offer rejected; decline persisted + idempotent replay (reason not rewritten); cross-driver accept denied | PASS |
| 18–20 | Accept atomic + idempotent replay, direct `UPDATE` denied; second accept while active rejected ("Driver already has an active trip"); customer tracking RPC returns accepted offer + OTPs | PASS |
| 21–25 | Ordered/OTP-gated trip: jump and missing/wrong OTP rejected with attempt count; foreign-driver photo path rejected; server timestamps; full OTP completion with both photos (`total_trips` 0→1); duplicate delivery exactly-once (timestamp/counter/active job unchanged); post-delivery photo immutable; cross-driver progress denied | PASS |
| 26 | Trip-photo storage: bucket config (public, 5 MB, jpeg/png/webp), owner-folder upload, cross-driver upload denied; `driver-docs` private re-verified | PASS |
| 27–29 | Shipment status/history on the customer surface only (agency cannot write it); agency ledger counts one delivered fare with cross-agency isolation and replay safety; driver earnings/history = one trip with the correct amount | PASS |
| 30–32 | Driver withdrawal request pending, cross-driver read/write denied; agency payout via portal authority with cross-fleet/suspended rejection; admin release is status-only, balance sums exact, **no payment/invoice rows created (no money moved)** | PASS |
| 33 | Relogin/refresh: every role re-reads exactly its own journey state; cross-tenant sweeps empty | PASS |

**Exactly-once effects proven:** duplicate offer accept (case 18), duplicate delivery replay (`total_trips`/`delivered_at`/`active_job_id` unchanged, case 24), duplicate agency settlement blocked by the `(agency_id, shipment_id)` unique key (case 11b) and replay-safe ledger counting (case 28), duplicate driver-payout requests stay `pending` with no provider/payment rows (cases 30–32).

## 5. Browser tier (fixture-labelled)

1. Local-first artifact built with `frontend/.env.local` **set aside and restored** (sha256 prefix `6433136d9f65389a` identical before/after): `npm --prefix frontend run build` → **exit 0**; `83` dist assets, **0** embed the configured (dead) backend host — local-first artifact confirmed.
2. `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/frontend_launch_smoke.mjs` → **63/63 checks passed**, `Backend mode: local_first`- covers guest/public/protected routes (incl. `/driver/*` and `/agency/*` gating) and 10 login surfaces at mobile (390×844) and desktop (1280×900).
3. `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/customer_local_workspace.browser-proof.mjs` → **2/2 viewport cases passed, exit 0** (TO-134 harness re-run as regression; device-local write → reload → read-back for truck + carton), with the **same 4 console-error findings TO-134 recorded** (React #31 agency company render; local-first realtime WSS to the placeholder host) — unchanged, outside this brief's allowed files.

**This is fixture-tier evidence** for *view rendering/route protection* (mobile driver surfaces + desktop agency surfaces), not a signed-in driver/agency UI journey: device-local mode has no cloud backend, so offer accept/trip UI against real data requires the stack (NOT RUN). It never substitutes for the staging journey.

## 6. Defects/gaps reproduced (recorded, NOT repaired — all outside the brief's allowed files)

1. **Cross-tenant dispatch claim (security, tenant crossover).** As approved agency B, `INSERT agency_jobs(B, <customer-A shipment>)` was **accepted**; agency B could then **insert a `job_offers` row for that shipment** (accepted) because the offer policy only requires that *some* agency job exists for the shipment owned by the caller. Unlike case 14 (B without a job row), this lets a foreign agency attach itself to any customer's shipment, dispatch its own driver, and read the shipment through the service-backed portal list. Root cause: `agency_job_owner_all` checks only the supplied `agency_id`; no policy ties the shipment to the agency (`20260305011000_create_agency_jobs.sql:38-45`, `20260416000000_sync_trip_offer_tracking.sql:43-54`). Fix = migration policy change (out of scope).
2. **Suspended agency still operational at the DB layer.** Agency C (`status='suspended'`) `INSERT agency_jobs` → **accepted**. The only status gate is the Edge Function predicate `assertApprovedAgency` (`portal-auth.ts:128-132`); RLS/triggers carry no status predicate.
3. **DB-layer fleet/driver assignment guards are inert in both deployed paths.** (a) Authenticated agency A `UPDATE agency_trucks.driver_id = driver1(approved)` → `Driver is not approved for assignment.` — the trigger's `SELECT … FROM public.drivers` is RLS-filtered and `"Drivers: own record"` (own/admin only) is the sole policy, so agency users cannot see any driver row (`20260606110000_fix_agency_driver_security_guards.sql:44-60`). (b) A service-role write (auth.uid() NULL) **skips the trigger entirely** — demonstrated by a deliberate cross-agency double assignment that landed (then cleaned up). The portal works only because the Edge Functions use the service client *and* re-implement the checks (`assertApprovedDriver`, `assertDriverAvailableForAgencyTruck`, `assertDriverOnAgencyFleet`).
4. **`dispatch_job_to_drivers` still missing (booking dispatch producer).** `NewShipmentPage.tsx:93` calls it; DB: `function public.dispatch_job_to_drivers(unknown, unknown) does not exist`. Re-confirms TO-134 finding 2; the customer→driver dispatch leg has no producer.
5. **No server-side status propagation along the loop.** After a fully delivered, OTP-verified trip: `shipments.status` returned to `pending` and `agency_jobs.status` stayed `pending`. Both sides move their own status manually (customer shipment page / agency portal). The revenue-producing loop's status handoffs are human-driven, with no trigger or function linking trip completion → shipment → agency job (and thus no automatic ledger recognition).
6. **Trip-completion/earnings linkage note (verified, not a defect by itself).** Driver earnings/ledger queries read `job_offers.status='delivered'` + `shipments.estimated_cost` / `agency_jobs.fare='delivered'` — the amounts are authoritative once the manual status writes land; TO-134's cross-customer billing RPC finding is unchanged and out of this brief's scope.

## 7. Required-check ledger (all run in this session)

| Brief check | Command / method | Result | Evidence class |
|---|---|---|---|
| Dispatch→delivery journey across roles, two agencies + two drivers | `node scripts/dispatch_delivery_journey.db.test.mjs` | **PASS** 35/35, exit 0, 6 findings | local DB (PGlite) |
| Cross-tenant requests rejected | same harness (cases 7, 13, 14, 17, 20, 26, 30–31, 33) + findings 1–2 | **PASS** for the mapped RLS/RPC surfaces; 2 crossover vectors recorded | local DB |
| Pending/approved/suspended matrix | cases 2–6, 9–10, 31 (agency + driver rows, RPC gate, portal contract) | **PASS** | local DB |
| Replayed events / duplicate realtime delivery | cases 16, 18, 24, 28 | **PASS** (idempotent, exactly-once) | local DB |
| Real document/trip-photo storage | case 26 + valid/foreign photo-URL cases 22–23 | **PASS** | local DB |
| One complete journey + stored audit trail | cases 8–29 (timestamps, statuses, photos, document numbers, history) | **PASS** | local DB |
| Mobile driver / desktop agency views | launch smoke 63/63 (mobile+desktop route gating) + device-local workspace 2/2 viewports | **PASS (fixture tier)**; signed-in driver/agency UI NOT RUN | fixture browser |
| Service/trip tests | `cd frontend && npx vitest run src/services/customerSupabaseApi.test.ts src/services/driverTripProgress.test.ts src/services/agencyPortalApi.test.ts src/services/agencySupabaseApi.test.ts` | **PASS** 156/156, 4 files, exit 0 | local |
| Full unit suite | `npm test` | **PASS** 545/545, 36 files, exit 0 | local |
| Full build | `npm --prefix frontend run build` (local-first env) | **PASS** exit 0 | local |
| Lint | `npm --prefix frontend run lint` | **PASS** exit 0, 0 warnings | local |
| Trip DB regression (TO-130) | `node scripts/trip_transition_integrity.db.test.mjs` | **PASS** 21/21, exit 0 | local DB |
| Customer DB regression (TO-134) | `node scripts/customer_journey_isolation.db.test.mjs` | **PASS** 25/25, exit 0 | local DB |
| Packing | `npm run test:packing` | **PASS** 18/18, exit 0 | local |
| Server routing | `npm run test:server-routing` | **PASS** 15/15, 0 fail, exit 0 | local |
| Policy suites | `node --test scripts/{production_config_policy,deployment_safety,payment_readiness_policy,security_boundary_policy,supported_runtime_policy,production_config_audit,launch_gate_policy}.test.mjs` | **PASS** 70/70, 0 fail, exit 0 | local |
| Glue check | `node tools/glue-check.mjs` | **PASS** 0 gaps, 0 warnings, exit 0 | local |
| Disposable Supabase stack | `npx --yes supabase status` | **BLOCKED** — exit 1, `docker: command not found` (Docker/Podman absent) | n/a |
| Credentialed staging E2E | not run | **BLOCKED (owner)** — hosted project NXDOMAIN + staging identities owner-gated | n/a |

## 8. Authority record (what the harness proved, by layer)

- **Customer:** direct authenticated RLS (booking, own shipment update, history) + `get_shipment_job_offer_tracking` (stakeholder OTP read).
- **Driver:** direct RLS for own offer/shipment read + SECURITY DEFINER RPCs for accept/decline (`respond_to_job_offer`) and ordered OTP progress/photos (`persist_driver_job_offer_progress`); direct `job_offers` UPDATE and OTP column reads are privilege-denied.
- **Agency:** direct RLS for own `agency_jobs` read + status update; **operational mutations (fleet assignment, job driver assignment, payouts) run at the service authority inside the Edge Functions** with `portal-auth.ts` predicates replicated as assertions in the harness.
- **Admin/service:** status approvals (agency/driver), payout release — status transitions only, no payment provider call at the DB layer.

## 9. Limitations and not-run items

- No PostgREST/GoTrue/Storage HTTP round trip, no GoTrue-issued token, no true concurrent DB sessions (exactly-once rests on row locking + idempotent replay paths, exercised sequentially; true two-connection concurrency remains open — same limitation TO-130/134 recorded).
- Edge Functions were not executed (no Deno runtime): their SQL authority path and their guard predicates were exercised, labelled, and separated from the DB-trigger behaviour (finding 3); HTTP status mapping is not proven here.
- PGlite is PostgreSQL 18.3 while `supabase/config.toml:34` pins `version = 17`. Same engine class, minor-version difference; the disposable-stack tier remains platform-faithful.
- Signed-in driver and agency **cloud** UI journeys were not executed; the browser tier is fixture-only (route gating + device-local persistence).
- `logs/` artifacts are gitignored working evidence, not committed.

## 10. Owner gates

1. **Docker/Podman unavailable**: reinstall Docker Desktop (needs elevation) to enable `npx supabase start`, the disposable-stack journey tier and signed-in browser journeys (TO-134/135/136).
2. **Hosted staging**: restore/replace the historical Supabase project and provision staging identities (TO-125 owner blockers unchanged; host NXDOMAIN) — required for the "real staging E2E" acceptance.
3. Findings 1–5 are DB-policy/product gaps needing an owner-visible follow-up (migrations + dispatch producer + status propagation); none is repairable inside this brief's allowed files.

## 11. Next smallest recommendation

Focused repair slice (proposed TO-136 or a new migration-only task): (a) one migration that ties `agency_jobs` INSERT/UPDATE to a customer-consented dispatch (or at least denies foreign-shipment claims and adds an agency-status predicate); (b) make the fleet/payout guard triggers RLS-safe (SECURITY DEFINER helper for the drivers lookup) or delete them in favour of the Edge contract; (c) implement `dispatch_job_to_drivers` (or remove the unreachable toast); (d) decide automatic trip→shipment→agency-job status propagation. Then re-run `scripts/dispatch_delivery_journey.db.test.mjs`; findings 1–3 should flip to passing cases.

## 12. Git state at completion

- Branch `main`, single canonical checkout; no branches/worktrees/stashes created. **Not pushed.**
- Commit: the new harness + this result + the TO-135 board row (hash recorded in `TASKS.md` and git log).
- Working tree before commit contained only pre-existing untracked items (`.ai-work-factory/`, `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`) — preserved, not staged. `frontend/.env.local` restored (hash-verified); the local static server was stopped; `logs/` and `frontend/dist/` are gitignored.
