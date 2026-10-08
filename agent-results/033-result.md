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
