# TO-134 Result — Prove the customer cloud business journey

**Task:** `agent-tasks/024-customer-journey-proof.md`
**Verdict:** **PASS with two tiers reported as NOT EXECUTED** (ready for GPT-6 review; no deployment or live change authorized by this work)
**Date:** 2026-10-05 · **Worker:** GLM-5.3 Flash (worker-TO134) · **Branch:** `main` (no push)
**Evidence level:** **local DB** (real PostgreSQL engine, PGlite WASM, full committed migration chain) + **fixture-tier browser** (local-first build; device-local PGlite/IndexedDB). The disposable Supabase stack and credentialed staging tiers were **not executable on this machine** and are reported below with exact evidence — no mock was substituted for them.

---

## 1. What was done

The brief's journey — **signup → profile/company → tenant-owned CRUD → packing run/save/reopen → route selection → booking → shipment history/tracking → invoice + subscription usage** — was executed for **two isolated identities** on the strongest locally available persistence engine: PGlite (real PostgreSQL; 18.3 in this run), replaying all 35 committed migrations, driving the same SQL surfaces the frontend services use with real RLS, real role switching (`SET ROLE authenticated` + `request.jwt.claims`, what PostgREST does), real triggers, real SECURITY DEFINER RPCs and real table/column privileges.

Additionally executed on the real built frontend (local-first, no cloud backend):

- the maintained 63-check launch smoke at mobile + desktop (guest/protected routes, login surfaces, local-workspace entry) — **63/63**;
- a new device-local workspace browser proof (real UI write → reload → read-back for truck + carton at mobile + desktop) — **2/2 viewports**.

Five defects/findings were reproduced (3 DB, 2 console); **none were repaired** because every one of them lives outside the brief's allowed file list (no migrations, no layouts) — per the brief's own rule: stop for a focused subtask if the repair spans new files/subsystems. They are recorded in §7 for a follow-up slice.

## 2. Changed files

| File | Change |
|---|---|
| `scripts/customer_journey_isolation.db.test.mjs` | **New.** Focused customer E2E fixture (allowed scope): two-identity journey + isolation proof at the SQL/RLS layer. Exits 1 on any failed case; missing PGlite is a loud failure. |
| `scripts/customer_local_workspace.browser-proof.mjs` | **New.** Fixture-tier browser proof of the device-local workspace (write → reload → read-back, two viewports), labelled fixture-only in its own header. |
| `agent-results/024-result.md` | This result. |
| `TASKS.md` | TO-134 row → `AWAITING_REVIEW` (board commit). |

No product code was changed. Nothing else in the tree was touched (see §10).

## 3. Why the disposable local Supabase stack was not run (exact evidence)

The run's dependency note said the Docker daemon was up; that is **not** the state of this machine — every probe below was executed in this session:

| Probe | Result |
|---|---|
| `npx supabase start` (repo root, 2026-10-05) | **exit 1** — `failed to inspect container health: docker: command not found (podman also not found) — install Docker Desktop or Podman and ensure it is on PATH` (+ `WARN: config section [inbucket] is deprecated`) |
| `supabase --version` | `command not found` (exit 127); `npx --yes supabase --version` → `2.119.0` (CLI itself is fetchable) |
| `docker`, `podman`, `nerdctl` on PATH / via PowerShell `Get-Command` | none found |
| `Test-Path '\\.\pipe\docker_engine'` / `\\.\pipe\dockerDesktopLinuxEngine` | both `False` |
| Docker processes / services | none (`com.docker.service` absent; no `*docker*` process) |
| `winget list --name Docker` | `No installed package found matching input criteria` |
| `C:\Program Files\Docker` | empty (binaries removed 2026-10-05 08:07) |
| WSL distro `docker-desktop` | distro present; `/usr/local/bin/docker` is a symlink to `wsl-bootstrap`, **no `dockerd`/`containerd`/`runc` anywhere**; no `/var/run/docker.sock` |
| elevation | `IsInRole(Administrator)` = **False** → a Docker Desktop reinstall is not executable here |
| Existing evidence | `agent-results/020-result.md` (TO-130, 2026-10-04) records the same gap: "Docker Desktop (and Podman) are not installed on this machine, so `npx supabase start` cannot run." |

The 2026-10-04 completion verdict sanctions exactly this fallback: "rebuild the disposable Supabase stack … **or extend the PGlite harness**". This result takes the sanctioned harness path and labels its evidence class precisely.

Credentialed **staging** E2E is additionally owner-gated: the historical hosted project is NXDOMAIN (TO-125 §3) and staging identities/hosted access are owner-controlled (`TASKS.md` known owner gates). No hosted request was made.

## 4. Local DB journey proof — `node scripts/customer_journey_isolation.db.test.mjs` → **exit 0, 25/25 cases, 3 findings**

Captured log: `logs/to134-db-proof-final.txt` (gitignored). Engine line: `PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten`; migration chain applied 35/35 files (`last=20261005000000_trip_photo_url_correction.sql`).

| # | Case | Result |
|---|---|---|
| 1–3 | Two isolated signups (`auth.users` + app `public.users` sync), role defaults to `user`, self-elevation blocked (`Only admins can change roles`), profile update persists, profiles owner-scoped | PASS |
| 4–6 | Customer CRUD as A: create/read own, PAN contract (`PAN number is required for customers`, `Invalid PAN format`), forged ownership (`created_by=B`) rejected; B sees/updates/deletes none of A's rows; A update/delete own | PASS |
| 7 | Truck/carton catalog: public read (8 trucks / 5 cartons), tenant writes denied by RLS — reference data is not tenant-owned | PASS |
| 8–11 | Packing run saved (job + 3 items using the real `packing-regression.ts` fixture shapes), reopened after fresh session with identical state, B cannot read/write/attach items, owner update + delete cascade | PASS |
| 12 | Route selection persisted and owner-scoped | PASS |
| 13 | Booking persists; `invoice_number`/`lr_number` **server-generated** (`INV-202610-000001` / `LR-202610-000001`) and idempotent via `ensure_shipment_document_numbers` | PASS |
| 14–15 | Shipment isolation: B cannot read/update/forge/document-number A's shipment; anon cannot read shipments and the RPC fails closed | PASS |
| 16–17 | Tracking: stakeholder reads via `get_shipment_job_offer_tracking` (incl. OTPs); B → `Access denied`; anon → privilege denied; shipment history owner-scoped | PASS |
| 18–19 | Subscription + usage created server-side (trigger), A reads own, B cannot; client writes to `invoices`/`subscriptions`/`usage_tracking` are `permission denied` | PASS |
| 20 | **Server billing module executed** (`supabase/functions/_shared/billing.ts` under a Deno shim): GST off → total = plan price; GST on → tax = round(49900 × 0.18) = 8982, total 58882 | PASS |
| 21 | Invoice stored with those server-computed totals; replayed provider payment blocked by the unique index; A reads own invoice, B none | PASS |
| 22 | Usage gate: allowed below the Starter limit, blocked at 50 after `increment_usage` | PASS |
| 24–25 | Relogin re-read (claims re-established): A re-reads exactly its persisted journey; B sees zero A records across every journey table | PASS |

Case 0 (migration chain) PASS accompanies the above: **25 PASS + 3 findings**. See §7 for the findings.

## 5. Browser tier (fixture-labelled)

1. Local-first artifact built with `frontend/.env.local` moved aside (its Supabase URL is NXDOMAIN — verified: `dns_resolves: false`; **set aside and restored**, same recipe as the accepted 2026-10-04 run). Build exit 0; verified `0/79` dist assets embed the dead backend host (local-first artifact).
2. `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/frontend_launch_smoke.mjs` → **63/63 checks passed**, `backendMode: local_first` (`logs/frontend_launch_smoke_report.json`: 63 results, 0 failed) — covers guest/public/protected routes and 10 login surfaces at mobile (390×844) and desktop (1280×900).
3. `PUBLIC_APP_URL=http://127.0.0.1:3000 node scripts/customer_local_workspace.browser-proof.mjs` → **2/2 viewport cases passed, exit 0**; screenshots in `logs/to134-local-workspace/` (10 PNGs). Proves: device identity created (`/local-start` → `/agency/dashboard`), truck added via UI → persists across reload, carton added via UI → persists across reload, at both viewports; 0 page errors, 0 failed HTTP responses.

**This is fixture-tier evidence**: device-local PGlite/IndexedDB only, no cloud backend, no cross-identity isolation in the browser. It never substitutes for the staging journey.

## 6. Required-check ledger (all run in this session)

| Brief check | Command / method | Result | Evidence class |
|---|---|---|---|
| Signup/login, profile, tenant CRUD, packing save/reopen, route, booking, history/tracking, invoice, subscription usage with two customers | `node scripts/customer_journey_isolation.db.test.mjs` | **PASS** 25/25, exit 0 | local DB (PGlite) |
| Cross-customer forbidden direct requests | same harness (cases 3, 5, 10, 12, 14, 16, 17, 25) + findings 23/26 | **PASS** for the mapped RLS surfaces; 2 API-surface gaps recorded (§7) | local DB |
| Server-generated invoice/usage authority | harness case 13/20/21/22 (real `_shared/billing.ts` executed) | **PASS** | local DB + server module |
| Database reads after UI writes | browser proof (add → reload → assert) + DB harness (write → read-back) | **PASS** (2/2 viewports) | fixture browser + local DB |
| Fresh and returning sessions at mobile/desktop | launch smoke 63/63; browser proof 2/2 (reload = returning session) | **PASS** for route rendering/persistence | fixture browser |
| No uncaught error or unexpected failed request | launch smoke 63/63 (0 console/page errors on its routes); browser proof: **0 page errors, 0 failed responses, but 4 console-error findings** | **FAIL (partial)** — 2 reproduced console defects (§7) | fixture browser |
| Affected unit tests | `cd frontend && npm run test:unit` | **PASS** 545/545 (36 files), exit 0 | local |
| Full build | `cd frontend && npm run build` (local-first env) | **PASS** exit 0 (built in 11.12s) | local |
| Lint | `cd frontend && npm run lint` | **PASS** exit 0, 0 warnings | local |
| Packing | `cd frontend && npm run test:packing` | **PASS** 18/18 checks, exit 0 | local |
| DB regression (TO-130) | `node scripts/trip_transition_integrity.db.test.mjs` | **PASS** 21/21, exit 0 | local DB |
| Credentialed staging E2E | not run | **BLOCKED** — hosted project NXDOMAIN + staging identities owner-gated; local stack unavailable (Docker absent) | n/a |

## 7. Defects reproduced (recorded, NOT repaired — all outside the brief's allowed files)

1. **Cross-customer billing RPC exposure (security).** As authenticated A, `increment_usage(B_user_id, 'shipments', 7)` was **accepted** and B's counter moved **0 → 7**; `get_user_plan(B)` returned `Starter/active`. `increment_usage`/`check_usage_limit`/`has_active_subscription`/`get_user_plan` are SECURITY DEFINER with default PUBLIC/authenticated EXECUTE and take an arbitrary `p_user_id`; no migration revokes or scopes them (`supabase/migrations/20260108000000_subscriptions.sql:162-270`, `20260501101500` revokes table DML only). Fix = a migration (out of allowed scope; recommend TO-136 or a focused slice).
2. **Booking dispatch RPC missing.** `frontend/src/pages/NewShipmentPage.tsx:93` calls `dispatch_job_to_drivers`; DB: `function public.dispatch_job_to_drivers(unknown, unknown) does not exist`. The success toast "Notified N drivers" is unreachable (already tracked in `agent-results/functional-coverage.md:143`, re-confirmed here).
3. **`ensure_shipment_document_numbers` EXECUTE not revoked from PUBLIC** — `has_function_privilege('anon', …, 'EXECUTE') = true`; the call fails closed only via the internal guard (`Shipment not found or access denied`). `20260416010000_graphify_gap_contract_fixes.sql:90` grants to `authenticated` without revoking PUBLIC.
4. **React error #31 on signed-in pages (`/agency/dashboard`).** `frontend/src/layouts/AgencyLayout.tsx:84,162` render `user_metadata.company` (an object `{name: …}`) as a React child — reproducible in local-first mode, and the same metadata shape is set at cloud signup (`authStore.ts:139-148`), so agency users with company metadata are affected. Crashes the render subtree (caught by the app error boundary after React logs the error).
5. **Realtime WebSocket to the placeholder host in local-first mode.** `wss://localhost.invalid/realtime/v1/websocket?apikey=local-mode-no-key…` fails with `ERR_NAME_NOT_RESOLVED` on every signed-in local-first page; source `frontend/src/layouts/AgencyLayout.tsx:40` subscribes unconditionally (same class exists in `supabaseApi.ts:1199` / `TrackingPage.tsx:193` are guarded by page usage).

Findings 1–3 came from the DB harness (recorded separately from the 25 passing security cases); findings 4–5 from the browser proof (4 console-error records = 2 classes × 2 viewports).

## 8. Authority record (which invoice/customer data is authoritative)

- **Shipment document identity** (`invoice_number`, `lr_number` on `shipments`): server-generated by trigger `trg_set_shipment_document_numbers` and re-assertable by the guarded RPC `ensure_shipment_document_numbers`; proven idempotent. The InvoicePage's displayed amounts are **client-rendered** (`frontend/src/utils/invoiceGenerator.ts:60-91`, taxable = freight + optional charges, GST 18%) from the server-stored `shipments.estimated_cost` — so `estimated_cost` in the DB is the authoritative amount; the PDF is presentation.
- **Subscription invoice amounts**: server-computed by `supabase/functions/_shared/billing.ts` (`calculateExpectedAmounts`), written only by payment Edge Functions with the service role; authenticated clients have `INSERT/UPDATE/DELETE` revoked on `invoices`/`subscriptions`/`usage_tracking`/`payment_history` (proven `permission denied`), and a provider-payment replay cannot create a second invoice (unique index proven).
- **Customer/ownership authority**: `customers.created_by` (and `shipments.created_by`; customer ownership also gates the tracking RPC) are the tenant authority — forged ownership is rejected by RLS WITH CHECK.

## 9. Limitations and not-run items

- No PostgREST/GoTrue/Storage HTTP round trip, no GoTrue-issued token, no true concurrent DB sessions: "relogin" is proven by re-establishing JWT claims and re-reading persisted state, not by a second connection. REST error codes are represented by the same SQL privilege/RLS errors PostgREST maps.
- No cloud customer journey in a browser (needs the local Supabase stack: blocked by Docker absence) and no signed-in UI journey for customers/booking/tracking/invoice; the browser tier covers local-first routes and device-local persistence only.
- Offline/backend-failure UX was not executed at runtime in this session (TO-124's local-first behaviour has its own unit coverage, which passed in the 545/545 run; no separate live outage run was performed).
- PGlite here is PostgreSQL 18.3 while `supabase/config.toml:34` pins `major_version = 17` — same engine class, minor-version difference noted; the disposable-stack tier remains the platform-faithful one.
- `logs/` artifacts (DB proof transcript, smoke report, browser report, screenshots) are gitignored working evidence, not committed.

## 10. Owner gates

1. **Docker/Podman unavailable** (uninstalled, not elevated): reinstall Docker Desktop to enable `npx supabase start` and the disposable-stack + signed-in browser tiers (TO-134/135/136).
2. **Hosted staging**: restore/replace the historical Supabase project and provision staging identities/credentials (TO-125 owner blockers unchanged; host NXDOMAIN) — required for the "real staging customer journey" acceptance.
3. Findings 1–3 are DB-security/product gaps that need an owner-visible follow-up task (migration + dispatch producer); none is repairable inside this brief's allowed files.

## 11. Next smallest recommendation

Focused repair slice: (a) one migration revoking PUBLIC EXECUTE and scoping the billing/usage RPCs to their own user (`increment_usage`/`check_usage_limit`/`has_active_subscription`/`get_user_plan`) plus revoking PUBLIC on `ensure_shipment_document_numbers`; (b) either implement `dispatch_job_to_drivers` or remove the unreachable toast; (c) `AgencyLayout.tsx` company render + local-first realtime guard. Then TO-135 can reuse `scripts/customer_journey_isolation.db.test.mjs` as the isolation-proof template.

## 12. Git state at completion

- Branch `main`; single cohesive commit for the two new scripts + this result + the board row (hash recorded in `TASKS.md` / git log). **Not pushed.**
- Working tree before commit contained only pre-existing untracked items (`.ai-work-factory/`, `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`) — preserved, not staged. Temporary probe scripts created during this session were deleted; `frontend/.env.local` restored to its original content; the local static server was stopped.
