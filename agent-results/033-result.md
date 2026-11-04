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

## TO-143-D2 contract (revised 2026-10-27 — supersedes the 2026-10-25 pre-edit plan; AWAITING_REVIEW)

Codex verdict on delivery 0/TO-155 (relayed by the director 2026-10-25): the deterministic AgencyFleetPage clock repair is acceptable; the 2026-10-25 pre-edit plan formerly pinned here received NEEDS_CHANGES; D2 implementation was not authorized from that plan. The revision answering the verdict is the tracked standalone document **`agent-results/to155-d2-contract-draft.md`** (revision 2, 246 lines; archived by the owner's evidence commit 91b50f76, then finalized with the fresh-eyes review fixes in this delivery) — it is the contract of record despite the "draft" name carried over from the run. The superseded 2026-10-25 plan remains verbatim in git history at 9c585895.

What the revision pins (full detail in the standalone document):

- **Scope fences now INCLUDE the legacy write paths** (correction R1): the Edge `agency-portal-jobs` `update-status` and `assign-driver` handlers are superseded — removed in D2, `list` kept — because deferral was ruled unsafe (service-role BYPASSRLS, arbitrary client status strings, no consent/eligibility/reservation/active-trip checks, fetch-then-write TOCTOU); the dead `assignable-drivers` read is replaced by the new candidates RPC.
- **Invariants I1-I6** (one winning assignment per shipment; vehicle exclusion; driver exclusion; active consent; eligibility + vehicle-type + capacity; idempotent replay) with an enforcement table covering every reachable mutation path; the single-winner rule is closed at the accept transition by a per-shipment partial unique plus an accept-guard trigger, with `respond_to_job_offer` reused byte-unchanged.
- **Server-authoritative expiry** with an explicit sweep RPC callable from assignment/candidate commands; accepted commitments never expire as pending offers.
- **Assignment/acceptance/cancellation/completion state machine** (correction R4): consent-revocation release trigger, authorized cancellation, idempotent retries, replay responses after a reservation becomes terminal, and ONE lock order (drivers first, offers last) compatible with `respond_to_job_offer` and the producer.
- **Seven preconditions before acquisition** (R5): active consent, operational agency, pending dispatchable shipment, eligible employment/vehicle, requested vehicle-type compatibility, server-side capacity validation.
- **Concurrency tiers kept honest** (R6): PGlite sequential tests are supporting evidence only; real concurrency acceptance stays OPEN until separate PostgreSQL sessions exercise overlapping transactions (environment absent on this machine).
- All 8 unresolved contracts of the superseded plan are answered in §14 of the document; "approved/review-approved" wording is purged (R7); UI obligations follow the Stitch policy (status/guide first, design-audit update, mobile+desktop browser verification, generation only if warranted).

Status: **AWAITING_REVIEW** — Codex re-review is the acceptance authority and TO-143-D2 implementation remains NOT authorized. The suite-diagnostic evidence backing correction point 1 (the 597/21-vs-618/618 inconsistency) is retained in `agent-results/to155-suite-logs/` and recorded in `agent-results/034-result.md` (Delivery 0 — review correction).

## TO-143-D2 — Verification (candidate)

Status: **CANDIDATE, not accepted, not DONE** (TASKS.md untouched). Proof tier: **PGlite (PostgreSQL 18.3 WASM) only, single session**. Hosted Supabase (GoTrue/PostgREST/RLS over HTTP, `supabase db push`) is **unverified**, owner-gated under TO-153. Changes are left uncommitted in the working tree on `claude/compassionate-mccarthy-cymfwp`; no branch, worktree, stash, commit or push.

### Changed files

- `supabase/migrations/20261010000000_fleet_assignment_reservations.sql` (new, forward-only, additive): `fleet_assignment_reservations` table with RLS (SELECT only for authenticated; no direct write privilege); overlap guard trigger (vehicle then driver row locks + `tstzrange` overlap check; no btree_gist dependency); one active reservation per agency job (partial unique); `reserve_fleet_assignment` and `release_fleet_assignment` jsonb commands; `release_stale_fleet_reservations` (service_role sweep); automatic release on offer declined/expired/cancelled, consume on delivered, release on agency job cancelled.
- `scripts/fleet_assignment_reservations.db.test.mjs` (new, red-first battery, 42 cases).
- `scripts/agency_fleet_foundation.db.test.mjs` (one assertion changed, see Deviations).
- `agent-results/033-result.md` (this section).

### Red-first evidence

- `node scripts/fleet_assignment_reservations.db.test.mjs` before the migration existed: **0/42 passed, exit 1** (every case failed on the missing schema or function).

### Green evidence (exact commands, run from `/home/user/Truck_Opti`)

| Command | Result | Exit |
|---|---|---|
| `node scripts/fleet_assignment_reservations.db.test.mjs` | 42/42 cases passed | 0 |
| `node scripts/agency_fleet_foundation.db.test.mjs` | 32/32 | 0 |
| `node scripts/dispatch_delivery_journey.db.test.mjs` | 52/52 | 0 |
| `node scripts/customer_journey_isolation.db.test.mjs` | 30/30 | 0 |
| `node scripts/admin_rls_proof.db.test.mjs` | 57/57 passed, 0 failed | 0 |
| `node scripts/trip_transition_integrity.db.test.mjs` | 21/21 | 0 |
| `cd frontend && npx tsc --noEmit` | no errors | 0 |
| `cd frontend && npm run lint` | clean | 0 |
| `cd frontend && npx vitest run` | Test Files 38 passed (38); Tests 584 passed (584) | 0 |
| `npm run test:server-routing` | pass 15, fail 0 | 0 |
| `npm run glue:check` | GLUE SEALED, 0 gaps, 0 warnings | 0 |

All five DB batteries replay the whole migrations directory, so they ran with the new migration in the chain.

### Deviations (disclosed, not weakened)

1. **D1 battery A1 assertion changed.** It required the fleet-foundation migration to sort last, which any later migration breaks by design. It now requires the fleet migration to sit after the consent writer and only migrations at or after it to follow. The intent (no older migration appears after the fleet foundation) is kept.
2. **agency_jobs truck/driver columns are not written by reservations.** The first draft wrote `agency_jobs.truck_id/driver_id`, and the pre-existing TO-142 guard `trg_agency_jobs_driver_assignment` (20261006120000:270-274) rejected the write, because it only admits a driver already linked through legacy `agency_trucks.driver_id`. The guard was not weakened. The reservation table is the allocation authority; projecting it onto `agency_jobs` is open (see findings).
3. **Test-only fixes during green:** D5/F2 fixtures corrected (a helper that counted zero rows for a job already holding its first reservation, and a replay that used a fresh idempotency key). Both were defects in my test, not the contract.

### Honest limits of this proof

- PGlite is one session. **Concurrent double-reserve was not raced.** The battery proves sequential double-reserve, a direct-INSERT bypass blocked by the trigger, and idempotent replay. The concurrent-transaction guarantee rests on the row-lock order (vehicle, then driver) plus READ COMMITTED statement snapshots, which is reasoned, not observed.
- Offer expiry is lazy in the existing schema (no writer sets `expired`). It is covered by the service-role sweep, which is not scheduled anywhere. Nothing calls it on a timer yet.
- Hosted behaviour (PostgREST role switching, the btree-free trigger under the hosted pool, `service_role` scheduling) is not verified.

### Open findings (not closed by this candidate)

1. **Two driver-to-agency models coexist.** Legacy `agency_trucks.driver_id` (gates `agency_jobs.driver_id` writes) and the D1 `agency_driver_employment` (gates reservations). Reconciling them and projecting reservations onto `agency_jobs` is the TO-143-D3 / owner decision.
2. **`release_stale_fleet_reservations` has no scheduler.** It needs a service-side trigger (cron or Edge schedule) before stale holds release on their own.
3. **`frontend/src/types/database.types.ts` not updated** for `fleet_assignment_reservations` (backend-only scope; regeneration waits for the Docker machine noted in the file header).
4. **No UI and no service methods** for reserve/release. Out of scope for this delivery.
5. **Pre-existing open items from TO-143-D1 / TO-144-D1 unchanged** (terminal-status consent cutoff, `UNIQUE(transport_agencies.user_id)` deferral, catalog FK NOT VALID).

### Next smallest task

Decide the driver-allocation authority (legacy `agency_trucks.driver_id` vs `agency_driver_employment`) and, if reservations should project to `agency_jobs`, specify that as TO-143-D3 with a red-first test for the guard interaction. Separately, schedule `release_stale_fleet_reservations` in service context.

## TO-143-D3 driver-model slice (2026-11-04) — candidate, not accepted

Status: **CANDIDATE, not accepted, not DONE.** This is ONE slice of TO-143-D3 (driver authority + reservation projection). Proof tier: PGlite (PostgreSQL 18.3 WASM), single session. Hosted data, concurrency and the legacy Edge functions are NOT exercised.

Decision (owner delegated to the Opus advisor, 2026-11-04): `agency_driver_employment` is the single driver-to-agency authority; `agency_trucks.driver_id` remains only a default truck-driver pairing.

- Migration `20261013000000_driver_model_authority.sql`, GENERATED by `scripts/gen_driver_model_migration.mjs` (`--check` fails on drift) from the current function text with asserted-anchor patches:
  1. Backfill: an ACTIVE employment row for every approved truck-linked driver without one. Stop-and-list (`Driver model backfill blocked: ...`, atomic) when the driver is unapproved or actively employed by another agency.
  2. `driver_is_assigned_to_agency()` now means active employment in that agency; the `agency_jobs` and `agency_pay` payout guards switch with it.
  3. Truck trigger: after the existing duplicate/approval rules, a driver may be linked to a truck only with active employment in that agency (`Driver is not employed by this agency.`).
  4. `reserve_fleet_assignment` projects `truck_id`/`driver_id` onto `agency_jobs`; `release_fleet_assignment` and offer decline/expire/cancel clear them only while they still match the reservation; a consumed reservation keeps them.
  5. `agency_driver_employment_end` returns `{ok:false,error:'driver_has_active_assignment'}` while an active reservation exists and clears the truck pairing on success. Frontend: typed refusal in `agencyPortalApi` plus a Drivers-page message (+1 test).
- Red-first: `scripts/driver_model_authority.db.test.mjs` (19 cases, written by a Haiku worker under supervision): 3/19 before the migration, 19/19 after (backfill B1-B5 on fresh instances, authority J1-J4, reservation projection R1-R5, employment end E1-E4).
- Existing batteries after the migration: members 99/99, reservations 42/42, foundation 32/32, dispatch journey 52/52, customer isolation 30/30, admin RLS 57/57, trip integrity 21/21, staff-scope 89/89 and 50/50. Frontend tsc/lint/build clean, vitest 660/660, routing 15/15, glue sealed, `types:drift` PASS.
- Fixture-only test changes (no assertion or message touched; reviewed by the supervisor): `agency_fleet_foundation` (existing employment call moved before the truck link), `dispatch_delivery_journey` (two idempotent employment inserts before intended-success links), `admin_rls_proof` (one employment insert before the truck link). They were needed because the new truck guard requires employment first.
- STILL OPEN in D3: terminal-status consent cutoff (the journey battery still prints this FINDING: an active consent permits a new agency_jobs INSERT on a delivered shipment); replay/duplicate-delivery safety audit; the real two-session Postgres race test; the scheduler for stale reservations/offers/invitations; the legacy Edge `assign-truck`/`assign-driver` paths still write `agency_trucks.driver_id` with owner-only authority; running the backfill inventory SQL on the hosted data before any `db push`.

## TO-143-D3 terminal-status consent cutoff (2026-11-04) — candidate, not accepted

Fixes the owner-deferred finding (033 open finding 1; dispatch battery section J). Migration `20261014000000_agency_job_terminal_cutoff.sql`: the `agency_jobs` INSERT policy now also requires `public.shipment_accepts_agency_jobs(shipment_id)` (SECURITY DEFINER boolean, true unless the shipment is `delivered` or `cancelled`; `anon` EXECUTE is granted because WITH CHECK is evaluated for any role, the helper exposes only a boolean). INSERT only: existing jobs on a delivered shipment stay updatable. `in_transit` still admits new jobs (pending re-dispatch); pending the advisor's view.
Red-first: `scripts/agency_job_terminal_cutoff.db.test.mjs` (10 cases, Haiku-written, supervised) 5/10 before, 10/10 after. The journey battery's section J finding became asserted case J1 (53/53); it re-opens as a FINDING if the cutoff regresses. All other batteries unchanged green (members 99, reservations 42, foundation 32, customer 30, admin 57, trip 21, staff-scope 89+50, driver model 19); vitest 660/660, tsc clean, routing 15/15, glue sealed, `types:drift` PASS. PGlite proof only.

## Advisor acceptance of the driver-model candidate and cutoff hardening (2026-11-04)

Owner delegated the accept/reject call to the Opus advisor. Driver model: ACCEPT after one fix, done — `reserve_fleet_assignment` now reads the employment row `FOR SHARE` and `agency_driver_employment_end` takes it `FOR UPDATE` before the active-reservation check, closing the end-vs-reserve race on paper; it is NOT yet proven by a concurrent test (PGlite is single-session). The two-session race test (embedded-postgres, two `pg` connections, advisory locks, 200+ iterations covering double-reserve, end-vs-reserve, release-vs-re-reserve) remains open and is required before hosted proof. Cutoff hardening: the INSERT policy helper now accepts only `pending` shipments (`in_transit` no longer admits new jobs), the policy is `TO authenticated` and the helper has no anon EXECUTE; cutoff battery T2/T9 updated to this ruling (10/10), journey 53/53. All batteries green: driver model 19, members 99, reservations 42, foundation 32, customer 30, admin 57, trip 21, staff-scope 89+50, cutoff 10; vitest 660/660; `types:drift` PASS.
