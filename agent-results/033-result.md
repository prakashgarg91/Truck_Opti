# TO-143-D1 — Production consent writer + consent-gated agency-job creation (round 1)

Date: 2026-10-07 · Writer: serialized GLM worker · Branch: `main` (no commits made; work left uncommitted for supervisor review/integration).

## Precondition (blocking) — resolved via escalation

`agent-tasks/033-dispatch-lifecycle.md:12` requires the multi-delivery split as child briefs on TASKS.md before coding. At session start `TASKS.md:56` showed TO-143 READY with result "—" and no child rows; repo-wide `grep -rn "TO-143-D" --include="*.md"` found nothing. The writer escalated; the supervisor pinned the split (uncommitted board edit) and the writer verified `TASKS.md:57-59` now carries `TO-143-D1` (IN_PROGRESS, this delivery), `TO-143-D2`, `TO-143-D3` (WAITING_DEPENDENCIES). TASKS.md was NOT touched by the writer.

## What changed (files + purpose)

| File | Change |
|---|---|
| `supabase/migrations/20261007120000_consent_writer_and_job_command.sql` (NEW) | `public.authorize_agency_for_shipment(uuid, uuid) RETURNS jsonb` and `public.revoke_agency_for_shipment(uuid, uuid) RETURNS jsonb` — SECURITY DEFINER, `SET search_path = public`, `REVOKE ALL ... FROM PUBLIC, anon`, `GRANT EXECUTE ... TO authenticated` (no service_role — the service path writes BYPASSRLS directly). Guard order: producer-mirrored ownership (NO `is_admin_user` arm) → agency self-grant denial → agency exists → `agency_is_operational` → `status='pending'`. One atomic write per RPC: `INSERT ... ON CONFLICT (shipment_id, agency_id) DO UPDATE ... WHERE revoked_at IS NOT NULL RETURNING` (states granted/already_active/reactivated) and `UPDATE ... WHERE revoked_at IS NULL RETURNING` (revoked/already_revoked). Header carries the REVOCATION-ONLY invariant, the roadmap expectedVersion deviation, deployment order, emergency recovery REVOKE, and the legacy inventory query. No schema/policy/backfill changes. |
| `scripts/dispatch_delivery_journey.db.test.mjs` | Flipped 3 of 4 consent stand-ins (cases 11a, shipment2, shipment3) to `actAs(customerUser)` + real RPC; case 35 keeps service seeding relabelled platform_dispatch/admin_grant. New cases 36-43 (grant happy path+job INSERT, foreign caller, self-grant, non-operational, grant-time lifecycle, duplicate idempotency, revocation 4-effect block, re-consent) + final section-J `recordFinding` (terminal-status cutoff reproduced, not a passing case). 42→50 cases. |
| `scripts/customer_journey_isolation.db.test.mjs` | New section J after case 26b: J1 foreign grant ownership-denied; J2 cross-tenant consent read = 0 rows (grantor consumes RPC response). 28→30 cases. |
| `scripts/admin_rls_proof.db.test.mjs` | New case G8 (SQL+source hybrid beside G7): service INSERT succeeds / anon+authenticated INSERT privilege-denied / non-party authenticated SELECT=0; no Edge references `shipment_agency_consents`; no Edge writes `shipments`; `agency-portal-jobs/index.ts` remains the only `agency_jobs` Edge writer and keeps `requireAgencyContext` + `job.agency_id !== agencyId` + `assertApprovedAgency`/`assertApprovedDriver`/`assertDriverOnAgencyFleet`; both RPCs verified definer+pinned+ACL'd in the migration source. 56→57 cases. |
| `frontend/src/services/customerSupabaseApi.ts` | `customerShipmentsApi.authorizeAgency(shipmentId, agencyId)` → `rpc('authorize_agency_for_shipment')`; controlled server messages mapped verbatim, unmapped internals → 'Failed to authorize agency'; zero-row result treated as failure. `AgencyConsentResult` type. |
| `frontend/src/services/agencySupabaseApi.ts` | `agencyJobsApi.createJob(shipmentId, fare)` on the DIRECT client: `auth.getUser()` → own-agency id via `transport_agencies.user_id` → full payload INSERT `{agency_id, shipment_id, fare, status:'pending'}`; SQLSTATE 23505 (code or unique-violation message) → `{job:null, alreadyExists:true}`; other errors typed. `listAuthorizations()` selects only `shipment_id, granted_via, created_at` (agency-party SELECT policy). Types `AgencyJobCreateResult`, `AgencyShipmentAuthorization`. |
| `frontend/src/services/customerSupabaseApi.test.ts` | +6 tests: RPC params/state mapping, idempotent states, controlled rejections verbatim, unmapped-internals redaction, zero-row failure, NewShipmentPage wiring guard. |
| `frontend/src/services/agencySupabaseApi.test.ts` | +8 tests: listAuthorizations pinned columns/failure; createJob agency-resolution + full payload incl. `agency_id`, 23505→already-exists, no-agency-profile, unauthenticated, other-failure; alias regression guard asserting AgencyJobsPage binds `agencyJobsApi as agencyJobsDirectApi` from `agencySupabaseApi` while keeping the portal import. rpc/auth mocks added. |
| `frontend/src/pages/NewShipmentPage.tsx` | Success-panel "Authorize an agency" control: uuid input, submitting state, granted/reactivated/already_active success copy, error copy from the service; uuid shape validation. Grant-only (revoke RPC-only by supervisor acceptance). |
| `frontend/src/pages/AgencyJobsPage.tsx` | "Authorized Shipments" panel (uuid + grant date only) with per-row fare entry + Create Job via `agencyJobsDirectApi.createJob` (alias-import trap mitigated + unit-guarded); empty/submitting/success/already-exists/error states. |
| `docs/design-audit.md` | 2026-10-07 command-wiring entry: states mapped, proof tier, explicit NOT-verified items (browser widths, keyboard/contrast pass). |

## Red-first evidence (commands + exact outputs)

1. `node scripts/dispatch_delivery_journey.db.test.mjs` (after test edits, before migration) → harness error, exit≠0 via the harness's own exit path:
   `FAIL (harness error): function public.authorize_agency_for_shipment(unknown, unknown) does not exist [SQL: SELECT public.authorize_agency_for_shipment($1, $2)]` — the pinned red-phase shape. (First red run was piped through `tail`, which masked the node exit code; subsequent runs redirect to a file and report the true code.)
2. `node scripts/customer_journey_isolation.db.test.mjs` → **EXIT=1**:
   `FAIL (harness error): expected error containing "Shipment not found or access denied", got: "function public.authorize_agency_for_shipment(unknown, unknown) does not exist ..."` (J1 red). One fixture iteration during red: agency INSERT initially missed `gstin`/`pan_number` (PAN-contract trigger `20260418004000`); fixed in the test fixture.
3. `node scripts/admin_rls_proof.db.test.mjs` → **EXIT=1, 56/57**:
   `FAIL G8. consent-writer audit ... rpc posture issues=[migration file missing]` (everything else in G8 already true).
4. `npx vitest run src/services/agencySupabaseApi.test.ts src/services/customerSupabaseApi.test.ts` (frontend/) → **2 files failed, 14 failed | 84 passed (98)** — all 14 new tests red (methods/page wiring absent), all pre-existing tests untouched.

## Green evidence (all executed this round)

| Command (from repo root unless noted) | Result | Exit |
|---|---|---|
| `node scripts/dispatch_delivery_journey.db.test.mjs` | **50/50 cases passed**, 1 FINDING recorded | 0 |
| `node scripts/customer_journey_isolation.db.test.mjs` | **30/30 cases passed** (J1/J2 green) | 0 |
| `node scripts/admin_rls_proof.db.test.mjs` | **57/57 cases passed** (G8 green; only pre-existing G4 invoice display-source finding) | 0 |
| `node scripts/trip_transition_integrity.db.test.mjs` | **21/21 cases passed** | 0 |
| `npx vitest run src/services/agencySupabaseApi.test.ts src/services/customerSupabaseApi.test.ts` (frontend/) | **98/98 passed** (14 new + 84 existing) | 0 |
| `npm run lint` (frontend/) | clean (`eslint . --report-unused-disable-directives --max-warnings 0`) | 0 |
| `npm run build` (frontend/) | built (PWA precache 87 entries) | 0 |

Migration-iteration note (honest): the first migration version used `SELECT * INTO ... FROM (INSERT ... RETURNING)` which Postgres rejects (syntax error at "INTO", caught by the dispatch battery's migration replay); rewritten as data-modifying CTEs (`WITH written AS (INSERT/UPDATE ... RETURNING id) SELECT w.id INTO ...`) — the write remains the single atomic statement.

## Case-43 design note (deviation from the literal contract, reasoned)

Case 42(iv) delivers shipment5 via the real offer journey, so the server-side propagation leaves it `delivered`; a literal immediate re-grant would rightly hit the grant-time lifecycle guard. Case 43 therefore reopens shipment5 through the owner's own shipment-status write (the case-27b customer capability) before re-consenting — guard (d) then admits it exactly as for any reopened booking. All pinned assertions hold: state `reactivated`, same row id, `revoked_at IS NULL`, INSERT/UPDATE path restored.

## Evidence classes (labelled honestly)

- **PGlite WASM (PostgreSQL 18.3 vs pinned 17)**: all four DB batteries — real RLS, triggers, SECURITY DEFINER RPCs, role switching. No GoTrue/PostgREST/Storage/Edge HTTP round-trip.
- **Source-level assertions**: G8's Edge-file checks (grep-backed); Edge guards NOT executed (no Deno runtime).
- **Mocked unit tier**: frontend service tests mock `supabase`/`supabase.auth`; no live DB.
- **Hosted-absent**: legacy inventory query (recorded in the migration header) NOT executed — no hosted DB access on this machine; TO-153 owner-gated. No `supabase db push` run. NO consent backfill performed.
- **NOT run this round** (workflow sweep owns the full gate): `npm run test:packing`, `npm run test:server-routing`, `npm run glue:check`, the 5 policy suites; `node --test scripts/atomic_job_offer_response.rls.test.mjs` stays not-runnable here (Docker absent, pre-existing). **Browser verification** (mobile 390×844 + desktop 1280×900, keyboard/contrast on the two new controls) NOT performed — recorded in docs/design-audit.md as the pre-acceptance gap.

## Accepted gaps / findings (open, owner-deferred)

1. **terminal-status consent cutoff missing** — reproduced as dispatch-battery FINDING (section J): service-seeded `platform_dispatch` consent for agencyB permitted a NEW `agency_jobs` INSERT on delivered shipment1 (INSERT SUCCEEDED, job id captured in the run output). Consent validity is REVOCATION-ONLY; no status cutoff is enforced and none was added. Remediation options (policy status predicate, or consent auto-revoke trigger) are outside this delivery's fences.
2. **Revocation fail-closes the agency's own in-flight browser updates by design** (UPDATE WITH CHECK needs active consent) while the agency-portal-jobs Edge service-role path continues (BYPASSRLS) — pre-existing TO-142-R asymmetry, pinned by case 42(i)-(iii).
3. **Revoke ships RPC-only** — no UI surface in delivery 1 (explicit supervisor acceptance in the pinned contract).
4. **No expected_version** — documented deviation against roadmap :201; idempotency carried by the two unique keys; versioned commands belong to TO-143-D2/D3.
5. **Agency id travels out-of-band** — no agency discovery for customers (TO-144 owns master data).

## Next recommendation

Supervisor review → integrate; the workflow gate sweep re-runs the full gate set. Smallest follow-ups: (a) browser pass on the two wired controls at both widths (pre-acceptance, recorded in design-audit); (b) TO-143-D2 (fleet reservations/dispatchLoad) after D1 acceptance.

## Verification (round 2)

Date: 2026-10-08 · Verifier: independent GLM verification pass in a fresh worktree at HEAD `dfbb01c4` + this WIP applied via `git apply` (clean; 12 files). Nothing from the round-1 report was trusted without re-running.

### Command battery (executed in the pinned order; exact results)

| # | Command | Result | Exit |
|---|---|---|---|
| 0 | `npm --prefix frontend install` | required — fresh worktree had NO `frontend/node_modules` and no link; added 768 packages in 19s | 0 |
| 1 | `npm --prefix frontend run lint` | clean (`--max-warnings 0`); re-run after the round-2 page fixes: still clean | 0 |
| 2 | `npm --prefix frontend run build` | tsc + vite built, PWA precache 87 entries; re-run after fixes: 87 entries | 0 |
| 3 | `npm test` (root → frontend vitest) | 38 files / **567 tests passed**, 0 failed; re-run after fixes: **567/567** again | 0 |
| 4 | `npm run test:packing` | **18/18 checks passed** (incl. genetic mixed-load, oversized, rotation, weight-filter fixtures) | 0 |
| 5 | `npm run test:server-routing` | node --test: **15 pass / 0 fail** | 0 |
| 6 | `node tools/glue-check.mjs` | **GLUE SEALED — 0 gaps, 0 warnings** (3 express routes) | 0 |
| 7 | `node --test` 6 policy suites (production_config, deployment_safety, payment_readiness, security_boundary, supported_runtime, launch_gate) | **62 pass / 0 fail** | 0 |
| 8 | `node scripts/trip_transition_integrity.db.test.mjs` | **21/21 cases passed** (PGlite full-chain replay) | 0 |
| 9 | `node scripts/customer_journey_isolation.db.test.mjs` | **30/30 cases passed** (J1/J2 consent cases green) | 0 |
| 10 | `node scripts/dispatch_delivery_journey.db.test.mjs` | round-1 shape: 50/50 + 1 recorded FINDING; **after the round-2 additions below: 52/52 + the same FINDING** | 0 |
| 11 | `node scripts/admin_rls_proof.db.test.mjs` | **57/57 cases, 0 defects**, 1 pre-existing G4 finding (invoice display-source, P3); run twice — G8 green both before and after the round-2 migration red-drill/restore | 0 |

### Migration authorization review (independent, against `20261007120000_consent_writer_and_job_command.sql`)

RPC posture — VERIFIED, no hole found in the listed categories:

- **Definer, strictly checked, search_path pinned**: both RPCs are `SECURITY DEFINER SET search_path = public` and every relation/function reference in the bodies is schema-qualified (`public.shipments`, `public.transport_agencies`, `public.agency_is_operational`, `public.shipment_agency_consents`, `auth.uid()`), so there is no unqualified-lookup shadowing vector (incl. pg_temp). G8 asserts the definer+pinned posture in the migration source.
- **Caller ownership**: guard (a) mirrors the dispatch producer's predicate (customer_id / created_by / customers.created_by = auth.uid()), no `is_admin_user` arm — SQL-proven by dispatch cases 37 + J1 (foreign caller denied).
- **Role checks**: agency self-grant denied even for a shipment-owning agency owner (case 38); agency must exist and be operational (case 39); grant-time `status='pending'` lifecycle guard (case 40).
- **Idempotent**: grant replay `already_active` with no second write (case 41), reactivation `reactivated` same row (case 43); revoke replay — was UNTESTED in round 1 → **case 45 added** (see defects).
- **anon cannot execute**: `REVOKE ALL ... FROM PUBLIC, anon` present; round 1 had only source-level proof (G8) → **case 44 added with a red-first drill** (see defects).
- **Cross-tenant reads/writes**: grantor reads 0 consent rows (J2 — consumes the RPC response); consent-table interactive writes stay privilege-denied for anon+authenticated (G8 SQL-level); agency-party SELECT is limited to the pinned `listAuthorizations` column set.
- **service_role note (reviewed, no change)**: the harness (and hosted Supabase) grant service_role default EXECUTE on new public functions, so the RPCs' `REVOKE FROM PUBLIC, anon` does not strip it. This is harmless by construction: a service_role call carries no user JWT, so `auth.uid()` is null and guard (a) denies with 'Shipment not found or access denied'. The service path intentionally writes BYPASSRLS directly. Documented here rather than churned.

Holes/gaps found and their disposition:

1. **No SQL-level anon EXECUTE proof (proof gap — FIXED)**. The round-1 batteries never called either RPC as `anon`; only G8's source grep pinned the REVOKE lines. Added dispatch battery **case 44** (trip-battery case-19 pattern). Red-first drill: temporarily weakened the migration to `REVOKE ... FROM PUBLIC` only (keeping the harness default-privilege anon grant) → battery **FAILED, exit 1**, `expected error containing "permission denied", got: "Shipment not found or access denied"` — proving the case discriminates a missing anon revoke from an executed-but-guard-denied call. Migration restored byte-identically (backup copy; G8 re-run green afterwards) → **52/52, exit 0**.
2. **Revoke RPC `already_revoked` branch untested (coverage gap — FIXED)**. Round 1 revoked once per pair and never replayed. Added dispatch battery **case 45**: second revoke returns `already_revoked` with the same row id and does NOT rewrite `revoked_at` (captured before/after under the service authority). Passes against the shipped implementation (coverage completion, not a fix).
3. **Terminal-status consent cutoff missing (REAL authorization hole — pre-existing, NOT fixed, owner-deferred)**. An active consent still admits a NEW `agency_jobs` INSERT after the shipment reaches a terminal status (reproduced in section J: INSERT SUCCEEDED on delivered shipment1). This lives in the `agency_jobs` INSERT/UPDATE policies of `20261006120000` (TO-142's accepted fail-closed gate), NOT in this migration; the round-1 header/report already records it with two remediation options (status predicate on the policies, or a consent auto-revoke trigger). Changing TO-142's accepted policy semantics is outside this verification's fences, so it remains a recorded FINDING (battery exit 0) for owner decision.

### Frontend review (states / keyboard / secrets)

- **Secrets**: `git diff frontend/src/ | grep -inE "service_role|SUPABASE_SERVICE|secret|apikey|api_key"` → **no matches**. Both new service methods use the shared anon Supabase client; no service-role key or token is referenced from frontend code.
- **States**: empty copy (both panels), per-row/per-action submitting states (`Creating...`, `Authorizing...` + disabled), success copy for all three grant states + `already_exists` info toast, typed/redacted error messages. **Defect found & fixed**: `AgencyJobsPage.fetchAuthorizations` failures were logger-only, indistinguishable from the empty state → added `authorizationsFailed` state and a visible `role="alert"` error line (refresh-to-retry copy).
- **Keyboard/a11y**: all new controls are native `<input>`/`<button>` (Enter submits the authorize form via `type="submit"`); fare inputs carry `aria-label`s. **Defect found & fixed**: the NewShipmentPage agency-id input's `<label>` was not associated with it (no `htmlFor`/`id` → input had no accessible name) → added `htmlFor="authorize-agency-input"` + matching `id`.
- After both fixes: lint 0, vitest **567/567**, build 0 (all re-run; the alias-binding regression guard still passes against the edited page).

### Files changed by round 2 (this verification)

- `scripts/dispatch_delivery_journey.db.test.mjs` — new cases 44 (anon EXECUTE revoked on both consent RPCs, red-first proven) and 45 (revoke replay idempotency); battery now 52/52.
- `frontend/src/pages/NewShipmentPage.tsx` — label/input association (`htmlFor`/`id`) on the agency-id input.
- `frontend/src/pages/AgencyJobsPage.tsx` — visible fetch-error state for the authorizations panel.
- `agent-results/033-result.md` — this section; `TASKS.md` — verification line on TO-143-D1 only; `docs/design-audit.md` — round-2 addendum line.

### NOT verified (round 2)

- **Browser rendering** at mobile 390×844 and desktop 1280×900, real keyboard tab-through, and contrast on the two wired controls (source-level a11y/labels verified only) — still the pre-acceptance gap recorded in docs/design-audit.md.
- **Hosted Supabase** — no network contact of any kind (no db push, no provider APIs); PGlite WASM (PostgreSQL 18.3 vs pinned 17) remains the only DB tier; legacy consent inventory query still owner-gated (TO-153).
- **Edge Function execution** (no Deno runtime) — G8's Edge assertions stay source-level; GoTrue/PostgREST/Storage HTTP round-trips not exercised.
- `node --test scripts/atomic_job_offer_response.rls.test.mjs` — not in the round-2 command list and Docker-dependent (pre-existing, unchanged).

## Independent review (gpt-6.1-sol, 2026-10-08)

Verdict NEEDS_CHANGES with 0 P1 and 2 P2: (1) listAuthorizations listed revoked consents - FIXED (`.is("revoked_at", null)` + test); (2) OPEN P2: in `authorize_agency_for_shipment` the pending-status guard runs before active-consent replay detection, so if a grant succeeds but its response is lost and dispatch then advances the shipment, a retry fails although the consent is already active. Remediation: after the ownership and self-grant checks, return the existing active consent before applying lifecycle checks to a fresh grant. Also still open (owner decision): terminal-status consent cutoff on agency_jobs INSERT (TO-142 policy).

## Supervisor acceptance addendum (2026-10-07)

Supervisor acceptance of TO-143-D1, recorded 2026-10-08. Two evidence tiers, both freshly executed by this acceptance run against HEAD `b362e83e` — the TO-143 implementer commit, which absorbed the round-2 working-tree changes during the browser session (the label association verified live in the pass is from that commit: `frontend/src/pages/NewShipmentPage.tsx:321,328`; the reviewed revoked-consent list fix is `frontend/src/services/agencySupabaseApi.ts:175`).

### Fresh gate table (workflow gate sweep, all exit 0)

| # | Gate | Result | Exit |
|---|---|---|---|
| 1 | dispatch journey DB battery (`node scripts/dispatch_delivery_journey.db.test.mjs`) | 52/52 PASS | 0 |
| 2 | customer isolation DB battery (`node scripts/customer_journey_isolation.db.test.mjs`) | 30/30 PASS | 0 |
| 3 | admin RLS proof DB battery (`node scripts/admin_rls_proof.db.test.mjs`) | 57/57 PASS | 0 |
| 4 | trip integrity DB battery (`node scripts/trip_transition_integrity.db.test.mjs`) | 21/21 PASS | 0 |
| 5 | policy suites (5) | PASS | 0 |
| 6 | server routing | PASS | 0 |
| 7 | glue check | PASS | 0 |
| 8 | packing regression | 32/32 PASS | 0 |
| 9 | frontend lint (zero warnings) | PASS | 0 |
| 10 | frontend unit tests | PASS | 0 |
| 11 | frontend build incl. tsc | PASS | 0 |

### Pre-acceptance browser pass — verdict PASS

Headless Playwright against `npm run dev` (vite on :5173), env files set aside for the run and restored byte-exact afterwards, Supabase calls mocked on `https://localhost.invalid` per `frontend/src/lib/authCapabilities.ts:47`. **58/58 scripted checks passed at BOTH 390×844 (mobile) and 1280×900 (desktop).**

Exercised — customer "Authorize an agency" (`frontend/src/pages/NewShipmentPage.tsx`): uuid shape validation with zero rpc calls; controlled server rejection mapped verbatim; granted / reactivated / already_active success copy; `role="status"`; `Authorizing...` disabled submit state; double-submit suppressed (rpcCalls=1); keyboard-only Tab→type→Enter fires the rpc; label programmatically associated via `htmlFor`/`id`.

Exercised — agency "Authorized Shipments" (`frontend/src/pages/AgencyJobsPage.tsx`): empty copy; uuid + grant-date rows; `aria-label`led fare inputs; empty-fare and zero-fare toasts with no insert; `Creating...` disabled row state; double-submit suppressed (posts=1); success toast + fare cleared + list refresh GET; SQLSTATE 23505 → already-exists info toast; error toast; keyboard-only job create.

Recorded as NOT exercisable in this browser tier: hosted Supabase round-trips (GoTrue/PostgREST/RLS/RPC — the DB-tier guarantees remain the PGlite batteries' domain above); the revoke RPC (ships RPC-only, no UI surface by supervisor acceptance); programmatic contrast measurement (not part of the 58 scripted checks — the historical contrast sample in this audit stays open).

Artifacts: 20 screenshots + per-step evidence JSON under `agent-results/browser-evidence/` (kept untracked per repo practice, not committed). Screenshots: `to143-customer-mobile-success-panel-mobile.png`, `to143-customer-mobile-authorizing-mobile.png`, `to143-customer-mobile-error-mobile.png`, `to143-customer-mobile-uuid-invalid-mobile.png`, `to143-customer-desktop-success-panel-desktop.png`, `to143-customer-desktop-authorizing-desktop.png`, `to143-customer-desktop-error-desktop.png`, `to143-customer-desktop-uuid-invalid-desktop.png`, `to143-agency-mobile-empty-mobile.png`, `to143-agency-mobile-rows-mobile.png`, `to143-agency-mobile-creating-mobile.png`, `to143-agency-mobile-success-toast-mobile.png`, `to143-agency-mobile-already-exists-mobile.png`, `to143-agency-mobile-error-mobile.png`, `to143-agency-desktop-empty-desktop.png`, `to143-agency-desktop-rows-desktop.png`, `to143-agency-desktop-creating-desktop.png`, `to143-agency-desktop-success-toast-desktop.png`, `to143-agency-desktop-already-exists-desktop.png`, `to143-agency-desktop-error-desktop.png`.

Run hygiene: dev server stopped (PID 48576 killed), `.env`/`.env.local` restored byte-exact, debug scripts removed. The 10 console errors observed are the intentional error-state exercises (400/409 responses plus the components' own `logger.error` lines at `frontend/src/pages/NewShipmentPage.tsx:193` and `frontend/src/pages/AgencyJobsPage.tsx:140`); no page errors.

### Acceptance decision

**TO-143-D1 ACCEPTED and integrated to `main`** in this acceptance's feat commit (hash recorded on the TO-143-D1 board row and in the follow-up board commit). The open gpt-6.1-sol P2 (consent replay order after a lost grant response + dispatch advance) stays open exactly as recorded in the Independent review section above and is carried as design input to TO-143-D2/D3.

### Open owner-deferred findings (unchanged by acceptance)

1. **Terminal-status consent cutoff** — consent validity remains REVOCATION-ONLY (dispatch battery section-J FINDING: new `agency_jobs` INSERT succeeds on a delivered shipment with an active consent); remediation fenced to TO-143-D3.
2. **Revoke ships RPC-only** — no UI surface in delivery 1, by explicit supervisor acceptance.
3. **No expected_version** on the consent commands — idempotency carried by the two unique keys; versioned commands deferred to TO-143-D2/D3.
4. **Agency id travels out-of-band** — no customer-facing agency discovery; owned by TO-144.

## TO-143-D2 pre-edit plan (prepared 2026-10-25; NOT implemented — awaiting Codex acceptance of delivery 0)

The review-approved pre-edit plan for TO-143-D2, pinned verbatim below so implementation starts from exactly this text. It is a plan only: no file named in it has been created or edited, and implementation is gated on Codex acceptance of delivery 0 (TO-155 in `TASKS.md`; the delivery addendum lives in `agent-results/034-result.md`). "Pinned answer" references below mark contract clauses that still need a supervisor decision (see Unresolved contracts).

### Flow map

Planning only; nothing edited. Repo state verified at planning time: `git status --short` = M docs/design-audit.md, M frontend/src/pages/AgencyFleetPage.test.ts, ?? .serena/ ?? .vscode/mcp.json.bak-qdrant-cleanup ?? agent-results/browser-evidence/ ?? closeout-logs/ (all pre-existing, untouched); HEAD e07bd64c on main.

**A. AGENCY ASSIGNMENT PATH (the D2 slice — new):**

1. UI: frontend/src/pages/AgencyJobsPage.tsx — today the assign flow is `getAssignableDrivers()` at AgencyJobsPage.tsx:187 feeding driver cards with an assign button at :578, `handleAssignDriver` at :215-220 calling legacy `agencyJobsApi.assignDriver`; manual status buttons at :237 ('accepted'), :251 ('cancelled'), :265 ('delivered'). D2 rewires the assign flow to vehicle+driver selection over the NEW command and adds conflict/denial/release states. NO other page changes.
2. Service: frontend/src/services/agencyPortalApi.ts — new typed method (e.g. agencyDispatchApi.dispatchAssignment(jobId, vehicleId, driverId, expectedVersion, idempotencyKey)) + envelope mapping in the style of mapVehicleCommandEnvelope (agencyPortalApi.ts:542) and the isAgencyDenial helper (:239). The legacy methods agencyJobsApi.assignDriver (agencyPortalApi.ts:328-347) and updateStatus (:307-326) invoke the legacy Edge function (supabase/functions/agency-portal-jobs/index.ts:97-154 — service-role BYPASSRLS, unguarded status strings, no version/idempotency/reservation) and are NOT activated as the D2 implementation; the Edge file is left untouched by D2.
3. RPC: NEW `public.agency_dispatch_job_assignment(p_job_id uuid, p_vehicle_id uuid, p_driver_id uuid, p_expected_version integer, p_idempotency_key uuid) RETURNS jsonb` in NEW migration supabase/migrations/20261025000000_agency_dispatch_reservations.sql — the roadmap dispatchLoad contract (docs/PRODUCT_ROADMAP.md:202) mapped onto the existing agency_jobs row (no loads table exists yet; TO-145/146 own loads/allocation — roadmap:199 says implementation must first map these to existing services/RPCs). Plus a NEW read RPC `public.agency_dispatch_candidates(p_job_id uuid) RETURNS jsonb` returning agency-owned vehicles/drivers filtered server-side by the two eligibility predicates (UI never gates on client-side eligibility; server re-verifies in the command).
4. Tables: writes agency_jobs (UPDATE: driver_id, truck_id, status per pinned answer, version CAS), NEW public.agency_resource_reservations (INSERT status='reserved'; command_key UNIQUE; payload fingerprint; offer_id), job_offers (INSERT one targeted offer, status='pending', expires_at now()+1h matching the producer's 20261006130000:100). Reads agency_trucks, agency_driver_employment, drivers, shipments, shipment_agency_consents, transport_agencies.
5. Reused predicates/conventions: public.resolve_caller_agency_id (20261008000000:356-388), agency_is_operational, agency_vehicle_allocation_eligible (20261008000000:394-417), agency_driver_allocation_eligible (20261008000000:419-439), driver_is_approved_for_assignment, version-conflict envelope + byte-identical row pattern (20261008000000:560-597), SECURITY DEFINER + SET search_path=public + REVOKE FROM PUBLIC/anon + GRANT TO authenticated (20261007120000:213-214 convention).
6. Release: NEW trigger AFTER UPDATE OF status ON job_offers — NEW.status IN ('declined','expired','cancelled','delivered') AND OLD.status IS DISTINCT FROM NEW.status -> UPDATE agency_resource_reservations SET status='released', released_reason=NEW.status WHERE offer_id=NEW.id AND status='reserved'; no-op when no reservation exists (producer-created offers are unaffected). SECURITY DEFINER + pinned search_path, mirroring the propagation trigger posture (20261006130000:117-146). job_offers status vocabulary pinned by 20260416000000:13-17 (CHECK: pending, accepted, declined, expired, cancelled, pickup_arrived, in_transit, delivery_arrived, delivered).

**B. DRIVER OFFER PATH (REUSED, byte-unchanged):** DriverDashboardPage.tsx:392 -> driverDashboardApi.respondToJobOffer (frontend/src/services/customerSupabaseApi.ts:808-831, typed controlled-message map :704-714) -> public.respond_to_job_offer (20261003010000:22-171: locks offer then driver FOR UPDATE :66-82, pending+expired raises 'Job offer has expired' :88-92, accept writes job_offers.status='accepted' + drivers.active_job_id :123-132, decline writes 'declined' :152-159, idempotent replays return authoritative state :97-107/:136-143). drivers.active_job_id column added 20260416010000:94 (FK job_offers ON DELETE SET NULL). Driver offer READ visibility: 20261003020000:21-36 (is_shipment_driver helper + shipments policy); job_offers direct table UPDATE/SELECT revoked from authenticated (20261004000000:478-486).

**C. DELIVERED PROPAGATION (REUSED, byte-unchanged):** persist_driver_job_offer_progress (20261004000000 — the only writer that can reach offer status 'delivered', per 20261006130000:33-35; clears drivers.active_job_id at 20261004000000:399-400) -> trigger trg_job_offers_delivery_propagation (20261006130000:142-146) -> propagate_trip_delivery_status (20261006130000:117-140) sets shipments.status and agency_jobs.status to 'delivered' exactly once (OLD.status IS DISTINCT FROM 'delivered'). D2's release trigger extends this family: on 'delivered' the reservation releases, freeing the vehicle/driver.

**D. CONSENT GATE (REUSED):** shipment_agency_consents (20261006120000:322-332, UNIQUE(shipment_id, agency_id), revocation-only invariant 20261007120000:52-62); agency_jobs INSERT/UPDATE policies require active consent + operational agency (20261006120000:382-421). The SECURITY DEFINER command BYPASSRLS, so it MUST re-verify active consent explicitly inside the body (parity with the policy predicate) — pinned as a required guard.

**E. EXISTING BATTERIES:** scripts/dispatch_delivery_journey.db.test.mjs (52/52), scripts/trip_transition_integrity.db.test.mjs (21/21) — brief-listed files; D2 adds only compatibility/new-case sections. NEW battery scripts/agency_dispatch_reservations.db.test.mjs mirrors the 034 pattern (full-chain PGlite replay, actAs() role switching, catalog introspection).

### Authoritative state

Server-side authority (no browser-supplied tenant/org id anywhere; all identity from auth.uid()):

1. CALLER AGENCY: transport_agencies.user_id = auth.uid(), resolved ONLY by public.resolve_caller_agency_id (20261008000000:356-388) — 0 rows raises 'No agency profile found for this account.', >1 raises 'Multiple agency profiles found for this account.' (UNIQUE(user_id) deliberately absent — recorded finding, 034-result.md:129).
2. AGENCY OPERATIONALITY: agency_is_operational (status='approved' semantics; non-operational raises 'Agency approval is required.' — 20261007120000:157-158 parity).
3. CONSENT: shipment_agency_consents row for (shipment_id, agency_id) with revoked_at IS NULL (20261006120000:322-332). Revocation-only; no terminal-status cutoff (open D3 finding). Decides whether the agency may write the job at all.
4. JOB: agency_jobs row — agency_id decides ownership; status CHECK ('pending','accepted','in_transit','delivered','cancelled') (20260305011000); driver_id/truck_id (20260305011000:11-12 columns); UNIQUE(agency_id, shipment_id) (20260305011000) is the one-job-per-agency-per-shipment settlement key; NEW version column + trigger (fleet pattern 20261008000000:204-223: bump only when the statement did not set version) is the expected-version authority for the assignment command.
5. VEHICLE ELIGIBILITY: decided ONLY by agency_vehicle_allocation_eligible (20261008000000:394-417): agency_trucks.is_available, NOT maintenance_blocked, maintenance_blocked_until NULL-or-past, insurance/fitness/permit/puc expiry NULL-or-future (NULL never blocks, expired blocks), owning agency operational. Vehicle must additionally belong to the caller's agency (agency_id match).
6. DRIVER ELIGIBILITY: decided ONLY by agency_driver_allocation_eligible (20261008000000:419-439): active employment row for the (driver, agency) pair with licence_expiry NULL-or-future + driver_is_approved_for_assignment (drivers.status='approved'). Legacy agency_trucks.driver_id binding (20260305010000:12) is a DIFFERENT model used only by the legacy Edge guards (portal-auth.ts:158-179) — employment is the D2 authority; divergence documented, not silently reconciled.
7. DRIVER COMMITMENT: drivers.active_job_id IS NOT NULL (written only by respond_to_job_offer 20261003010000:129-132) blocks new assignment ('Driver already has an active trip.' parity with :117-119).
8. OFFER: job_offers.status/.expires_at — respond_to_job_offer is the sole accept/decline authority; expires_at is enforced lazily at respond time (no sweeper writes 'expired' anywhere in the chain — grep verified across all migrations).
9. RESERVATION EXCLUSION (NEW, decisive): agency_resource_reservations with partial UNIQUE indexes on active rows — UNIQUE(vehicle_id) WHERE status='reserved' and UNIQUE(driver_id) WHERE status='reserved' — plus typed pre-checks; the indexes are the hard DB-level exclusion authority; reservation.command_key UNIQUE + payload fingerprint is the idempotency-replay authority.
10. SHIPMENT: shipments.status ('pending' guard — see unresolved contract #4) and shipments.vehicle_type (requested type — see unresolved #8); ownership predicate customer_id/created_by/customers.created_by = auth.uid() (20261006130000:60-70).

### Contracts

1. REQUEST: agency_dispatch_job_assignment(p_job_id uuid, p_vehicle_id uuid, p_driver_id uuid, p_expected_version integer, p_idempotency_key uuid) -> jsonb. The idempotency key is client-generated per user intent (uuid) and REUSED on retry of the same intent.
2. RESPONSE (success): {ok:true, state:'assigned'|'idempotent_replay', job:{id,version,status,driver_id,truck_id}, reservation:{id,status:'reserved'}, offer:{id,expires_at}}. Replay of the same key + identical payload fingerprint (job_id, vehicle_id, driver_id) returns the recorded result verbatim with NO second write (no second offer, no version bump) — 'replay one effect'. Same key with a DIFFERENT fingerprint -> {ok:false, error:'conflicting_idempotency_key'} and zero state change — 'conflicting payload reuse rejected'.
3. EXPECTED-VERSION: CAS WHERE agency_jobs.id=p_job_id AND agency_id=caller AND version=p_expected_version inside the UPDATE; zero rows -> {ok:false, error:'version_conflict', current_version:N} with the row byte-identical (fleet envelope convention 20261008000000:560-597). Version bumped once per UPDATE by the new agency_jobs version trigger (fleet single-bump pattern 20261008000000:204-223).
4. TYPED DENIALS (RAISE, controlled strings mapped verbatim in the service layer, unmapped internals redacted — TO-131 convention): 'Job not found or access denied.', 'Agency approval is required.', 'No agency profile found for this account.', 'Multiple agency profiles found for this account.', 'Shipment is not open for dispatch.' (if the pending guard is pinned), 'Vehicle is not available for assignment.', 'Driver is not available for assignment.', 'Driver already has an active trip.', 'An active assignment already exists for this vehicle or driver.', 'Agency consent for this shipment is not active.' Consent is re-verified inside the definer body (policy parity 20261006120000:382-421).
5. ATOMIC RESERVATION ACQUIRE: one RPC = one transaction. Order: lock agency_jobs FOR UPDATE -> all guards (ownership, consent, lifecycle, version CAS, vehicle+driver eligibility, active trip, existing non-terminal offer for (shipment,driver) mirroring the producer's predicate 20261006130000:90-96) -> INSERT job_offers (targeted offer) -> INSERT agency_resource_reservations (offer_id, command_key, fingerprint) -> UPDATE agency_jobs (version CAS). Any failure rolls back ALL writes; the battery proves all-or-nothing by forcing a mid-command failure and asserting agency_jobs byte-identical.
6. ATOMIC RELEASE: trigger AFTER UPDATE OF status ON job_offers; terminal set {declined, expired, cancelled, delivered} releases (status='released', released_reason=NEW.status); 'accepted' keeps the reservation active (driver committed; drivers.active_job_id also blocks re-assignment); exactly-once via OLD.status IS DISTINCT FROM NEW.status; no-op when no reservation (producer offers). Delivered release aligns with active_job_id clearing (20261004000000:399-400), so the resource frees on trip completion.
7. OFFER LIFECYCLE (REUSED, byte-unchanged): respond_to_job_offer (20261003010000:88-160) — accept/decline semantics, expiry at respond time, driver-approval and active-trip guards, idempotent replays return authoritative state. D2 adds NO competing offer-response path (roadmap:217 'do not create two competing state engines').
8. ACL: REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon; GRANT EXECUTE TO authenticated (consent-writer convention 20261007120000:213-214); predicates additionally executable by service_role per fleet convention (20261008000000 header item 6).
9. SCOPE FENCES: driver/customer surfaces byte-unchanged (NewShipmentPage, DriverDashboardPage, DriverTripPage, respond_to_job_offer, dispatch_job_to_drivers, propagate_trip_delivery_status all REUSED not modified); legacy Edge agency-portal-jobs untouched in D2; no supabase db push, no hosted actions, no branches/worktrees/stashes.

### Allowed files (writer scope)

- frontend/src/pages/AgencyJobsPage.tsx
- frontend/src/services/agencyPortalApi.ts
- frontend/src/services/agencyPortalApi.test.ts
- frontend/src/types/database.types.ts
- scripts/dispatch_delivery_journey.db.test.mjs
- scripts/trip_transition_integrity.db.test.mjs
- docs/design-audit.md
- TASKS.md
- agent-results/033-result.md

### New files (planned, none created yet)

- supabase/migrations/20261025000000_agency_dispatch_reservations.sql
- scripts/agency_dispatch_reservations.db.test.mjs

### Unresolved contracts (for supervisor clarification before implementation)

1. Offer-expiry writer: NOTHING in the migration chain writes job_offers.status='expired' (CHECK allows it since 20260416000000:17; expiry is enforced only lazily at respond time 20261003010000:88-92; no cron/sweeper exists and a trigger cannot fire on clock passage). For 'expiry -> terminal release' D2 needs a supervisor decision: (a) lazy release on next command touch, (b) an explicit expire RPC with no scheduler, (c) defer the sweep to a later delivery. Blocks the release-trigger design.
2. agency_jobs.status written by the assignment command: 'pending' (assignment != acceptance; driver accept later advances it) vs 'accepted' (agency dispatch counts as acceptance). Related: nothing in the chain syncs offer-accepted -> agency_jobs.status (verified: 20260416000000 only READS agency_jobs; no accept-sync trigger exists; only the legacy Edge update-status writes 'accepted' today) — is that sync D2 (trigger) or D3 lifecycle scope?
3. Agency cancel semantics: the new cancel-to-release command's target agency_jobs.status ('cancelled' terminal vs back to 'pending' re-dispatchable), cancel authority (agency owner only, or an is_admin_user arm), and whether customer consent revocation (revoke_agency_for_shipment, RPC-only, 20261007120000:220-275) must also release live reservations. The revocation-only consent invariant (20261007120000:52-62) is silent on reservations.
4. Shipment-status guard: producer requires shipments.status='pending' (20261006130000:76-83) but consent is revocation-only with a known terminal-cutoff hole fenced to D3 (033-result.md finding 1 / 033-result.md:63). Should the D2 command enforce strict 'pending' (my recommendation) or consent-only, given the interplay with the recorded D1 finding?
5. Legacy Edge actions: agency-portal-jobs update-status/assign-driver (index.ts:97-154) are unguarded BYPASSRLS writers (arbitrary status strings, no reservations) and the brief's allowed scope includes the function. D2 supersedes assign-driver at the UI call-site only; does the supervisor want the legacy actions removed/guarded in D2 or deferred to D3? (Roadmap:217 cuts both ways.)
6. Idempotency-key persistence shape: fleet header pinned 'Expected-version is the replay guard for updates — no command-log table' (20261008000000:71-72), but assignment is a CREATE-style command needing a persisted replay key. Plan pins command_key UNIQUE + payload fingerprint ON the reservation row (no separate command-log table); supervisor to confirm this reading of the no-command-log convention.
7. Blanket-producer interplay: dispatch_job_to_drivers may already have created a non-terminal offer for (shipment, driver); the agency command inserts offers directly. Deny when a non-terminal offer already exists for the pair (mirror the producer's predicate — my recommendation), or cancel/replace the blanket offer? Decides the guard in contract 5.
8. Vehicle-type match: must agency_trucks.vehicle_type equal shipments.vehicle_type for assignment (the producer matches by vehicle_type 20261006130000:88-89)? The D1 eligibility predicates do NOT compare types. Pin yes/no (and whether 'compare eligible actual fleet' roadmap:108 requires it) before implementation.

### Concurrency strategy

VERIFIED 2026-10-25 in the planning session (exact commands + outputs): `docker --version` / `docker info` -> 'docker: command not found'; `podman --version` -> 'podman: command not found'; `which psql pg_ctl initdb postgres` -> none on PATH; `Get-Service | Where Name -like *postgres*/*pgsql*` -> empty (no Windows service); `/c/Program Files/PostgreSQL` -> does not exist; scoop/choco -> not installed; `winget list --name PostgreSQL` -> 'No installed package found matching input criteria'. Installed PGlite is @electric-sql/pglite 0.5.8 (frontend/node_modules/@electric-sql/pglite/package.json; no pglite-socket sibling installed) — embedded WASM, single backend; the maintained battery's own header states 'there is no PostgREST, no GoTrue, no Storage HTTP API and no second connection' (scripts/dispatch_delivery_journey.db.test.mjs:24-26) and records Docker/Podman absence (exit 1, re-verified 2026-10-05). **CONCURRENCY_NOT_VERIFIED**: true overlapping-transaction concurrency (two sessions holding row locks, blocked second session, snapshot-isolation races on the partial unique index and the version CAS) CANNOT be tested on this machine. That brief acceptance stays OPEN (owner-gated: Docker machine, native PostgreSQL, or supervisor-accepted constraint-tier proof). What IS locally testable and pinned: (a) catalog introspection that both partial UNIQUE indexes and the version trigger exist (pg_indexes/pg_get_constraintdef/pg_trigger); (b) sequential contention — reserve, then a second command for the same vehicle or driver must fail with the typed denial / unique-violation; (c) version-CAS serialization semantics; (d) FOR UPDATE lock ORDERING verified by code review + the same lock order as respond_to_job_offer (offer->driver, 20261003010000:63-82). The new battery documents this tier honestly per its header, like all existing batteries.

### Red tests

NEW scripts/agency_dispatch_reservations.db.test.mjs, red-first (0/N against the absent migration, mirroring the 034 red phase: 'function public.agency_dispatch_job_assignment(unknown, ...) does not exist'), each case naming the behavior it pins:

1. R1 authorized-assignment-persisted: operational agency A with active consent assigns its eligible vehicle+driver to its pending job -> reservation 'reserved', agency_jobs.driver_id/truck_id set + version bumped exactly once, one pending offer with 1h expiry; fresh re-reads (and re-established JWT claims) return identical state (reload-equivalent at this tier).
2. R2 foreign/suspended actors: agency B assigns A's job -> fixed 'Job not found or access denied.', zero writes; suspended/pending agency -> 'Agency approval is required.'; suspended driver (driver_is_approved_for_assignment false) -> denial; ended employment -> denial; anon EXECUTE revoked (case-44 pattern, red-drill proven in the 033 round-2 precedent).
3. R3 unavailable/expired/maintenance/committed resources: is_available=false, maintenance_blocked=true, maintenance_blocked_until future, expired insurance/fitness/permit/puc each deny vehicle; expired licence denies driver; drivers.active_job_id set denies ('Driver already has an active trip.'); driver or vehicle already holding an active reservation denies; NULL dates do NOT block (D1 NULL-does-not-block parity).
4. R4 replay + conflicting idempotency: same key + same fingerprint after success -> state 'idempotent_replay', exactly one reservation row/offer/job write (before/after byte comparison), no version bump; same key + different vehicle -> {ok:false,error:'conflicting_idempotency_key'}, zero state change.
5. R5 stale version/rollback/terminal release: wrong p_expected_version -> {ok:false,error:'version_conflict',current_version:N} with agency_jobs byte-identical; forced mid-command failure (e.g. driver reservation unique-violation injected between writes by pre-seeding) proves atomicity — agency_jobs unchanged, no orphan offer/reservation; decline via respond_to_job_offer -> reservation released + vehicle/driver assignable to a second job; agency cancel command (if pinned) -> offer 'cancelled' + released; delivered trip (via persist_driver_job_offer_progress path) -> released exactly once (replay no-ops).
6. R6 contention (constraint tier, honest): sequential contending assignments — second command for the same vehicle and for the same driver each fails with typed denial; catalog introspection pins both partial UNIQUE indexes and the version trigger. True overlap NOT exercised (CONCURRENCY_NOT_VERIFIED recorded; the clause stays open).
7. Compatibility sections in the two brief-listed batteries: dispatch battery — producer/propagation byte-unchanged, new release trigger no-ops on producer offers; trip battery — offer/trip transitions unchanged. Focused vitest additions in agencyPortalApi.test.ts (typed envelopes: version_conflict, conflicting_idempotency_key, denial map, replay) red before the service methods exist. Gates after green: the four DB batteries + frontend lint/build/unit per the maintained gate set.

### UI scope

UI does NOT materially change -> Stitch NOT applied (Stitch mutations 0 planned). Rationale: D2 is command/state wiring on the EXISTING /agency/jobs screen — replacing the assign action's call target (legacy Edge assign-driver, AgencyJobsPage.tsx:215-220) with the new RPC, adding vehicle+driver selection inside the existing panel and the standard five states (loading/empty/success/error/denied) plus conflict messaging — exactly the TO-144-D1 posture (034-result.md:22: 'No new routes, no Stitch generation (mutations 0)'). No new route, no new screen, no layout change. Standing Stitch obligations still honored: docs/design-audit.md updated after integration (audit-first), and a browser pass at 390x844 AND 1280x900 on the changed controls (assignment action, conflict/denial states, release feedback) following the D1 battery pattern; selected-Hi rendering no-crash check; keyboard-walk on new controls (closing the nicety D1 deferred). Recommendation to keep unresolvedContracts #5 (legacy Edge action removal) out of D2 preserves this posture.
