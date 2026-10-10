# TO-144 — Agency setup, memberships, client sites and actual fleet — Result

Brief: `agent-tasks/034-agency-client-foundation.md`. Split into D1 (fleet foundation) and D2 (memberships/sites/tariffs). This file records delivery 1; D2 records here after it runs.

---

## TO-144-D1 — Fleet foundation (red-first) — AWAITING_REVIEW

Status: **AWAITING_REVIEW** (implemented, all in-scope focused gates run green by this writer; the run performs the fresh full-gate sweep and supervisor acceptance before DONE per TASKS.md:57).

### What shipped

One forward migration `supabase/migrations/20261008000000_agency_fleet_foundation.sql` (PGlite-replayable, no destructive ops) plus service/UI wiring, pinned contract-first by a new red-first DB battery:

1. **Policy rewrite on `public.agency_trucks`** — both 20260305010000 policies (`agency_truck_owner_all` FOR ALL, `admin_see_all_trucks`) dropped EXPLICITLY first (permissive policies OR-combine; without the drop the fail-closed claim would be dead code), then per-command policies: `agency_trucks_select` (owner via `transport_agencies.user_id = auth.uid()` OR `public.is_admin_user()`), `agency_trucks_insert`/`agency_trucks_update` (owner AND `public.agency_is_operational`), `agency_trucks_delete` (owner only — the TO-142 ownership-only DELETE precedent, pinned by test). All eight policies (both tables) scoped `TO authenticated`; tenant identity derives ONLY from `auth.uid()` — no policy or command RPC accepts a browser-supplied org id.
2. **Catalog separation** — `public.trucks` gains `code TEXT` (UNIQUE index `trucks_code_key`, NOT NULL) backfilled to the exact existing `vehicle_type` vocabulary (`tata_ace, tata_407, eicher_14ft, eicher_17ft, ashok_19ft, bharatbenz_24ft, bharatbenz_32ft, volvo_40ft`); a pre-NOT-NULL guard RAISEs on unmapped hosted catalog rows instead of inventing codes. `agency_trucks.vehicle_type` gains FK `agency_trucks_vehicle_type_catalog_fkey → trucks(code) NOT VALID` (hosted pre-existing rows are unverified; violations surface as replay findings, never silent data). Dispatch producer untouched.
3. **`agency_trucks` additive columns** — `payload_kg NUMERIC(10,2)`, `body_length_m/body_width_m/body_height_m NUMERIC(5,2)`, `puc_expiry DATE`, `maintenance_blocked BOOLEAN NOT NULL DEFAULT false`, `maintenance_block_reason TEXT`, `maintenance_blocked_until TIMESTAMPTZ`, `version INTEGER NOT NULL DEFAULT 1`; `UNIQUE (agency_id, rc_number)` settlement key. Version trigger `trg_agency_trucks_version` bumps ONLY when the statement did not set version itself (`NEW.version IS NOT DISTINCT FROM OLD.version`) — single bump per UPDATE, no double-bump of explicit sets; coexists with `set_updated_at` and the one-truck guard (messages verbatim preserved).
4. **New `public.agency_driver_employment`** — licence number/class/expiry, contact, `status` CHECK (`active`/`ended`), `version`, timestamps; partial UNIQUE index `agency_driver_employment_one_active_per_driver ON (driver_id) WHERE status='active'` (mirrors the one-truck rule); its own updated_at + version triggers; same RLS shape plus `driver_is_approved_for_assignment` on INSERT/UPDATE; added to `supabase_realtime`.
5. **Two free-standing eligibility predicates** (STABLE SECURITY DEFINER, pinned `search_path`): `agency_vehicle_allocation_eligible(p_vehicle_id, p_as_of DEFAULT now())` — available, not maintenance-blocked (flag or future `blocked_until`), every non-null date among insurance/fitness/permit/puc strictly after `p_as_of::date`, owning agency operational; `agency_driver_allocation_eligible(p_driver_id, p_agency_id, p_as_of)` — active employment for the pair + approved driver + licence null-or-future. NULL expiry dates do NOT block (backward compatible; expired blocks). Consumed only by TO-143-D2.
6. **Five command RPCs** (consent-writer conventions: SECURITY DEFINER plpgsql, `SET search_path = public`, RETURNS jsonb, REVOKE from PUBLIC/anon, GRANT to authenticated; predicates additionally to service_role) with a `resolve_caller_agency_id()` helper that fails closed on 0 ('No agency profile found for this account.') and >1 ('Multiple agency profiles found for this account.') — never a LIMIT-1 pick; non-operational agencies raise 'Agency approval is required.'; `agency_vehicle_create` is idempotent on the settlement key (`created` / `idempotent_replay`, body dims default from the trucks catalog); `agency_vehicle_update` / `agency_driver_employment_create/update/end` enforce row ownership (fixed not-found denials) and expected-version: mismatch returns `{ok:false,error:'version_conflict',current_version:N}` (jsonb, never an exception) with the row byte-identical; `end` replays as `already_ended` without a second write.
7. **Services** (`frontend/src/services/agencyPortalApi.ts`) — `FleetVehicle`, `DriverEmployment`, `VehicleCreateInput`, `VehiclePatch`, `VehicleCommandResult`/`EmploymentCommandResult` (typed conflict branch); `agencyFleetApi.listVehicles/createVehicle/updateVehicle`, `agencyDriversApi.listEmployments/endEmployment` over RLS selects and the RPCs (no agency id ever sent); controlled denial message map + `isAgencyDenial`; raw provider errors redacted to stable fallbacks. Existing Edge-backed methods (`list/addTruck/updateTruck`, drivers snapshot/assign/pay) stay live and untouched.
8. **Pages** — `AgencyFleetPage` rewired to `listVehicles`/`createVehicle`/`updateVehicle` (availability toggle; payload/dims/PUC display; distinct loading/empty/error+retry/success/denied states via testids; single-refetch + ONE-message conflict path; `htmlFor`/`id` labels). `AgencyDriversPage` keeps the Edge snapshot untouched and adds an "Employment Records" panel (licence chip + End Employment) with the same state/contract wiring. No new routes, no Stitch generation (mutations 0).
9. **`frontend/src/types/database.types.ts`** — hand-applied delta (TO-130 precedent, header note added): `trucks.code`, `agency_trucks` new columns + catalog FK relationship, full `agency_driver_employment` table entry. Regenerating from a live DB still waits for a Docker machine per the file header.

### Changed files

- `supabase/migrations/20261008000000_agency_fleet_foundation.sql` (new)
- `scripts/agency_fleet_foundation.db.test.mjs` (new)
- `frontend/src/services/agencyPortalApi.ts` (fleet foundation types + methods + denial map; existing exports unchanged)
- `frontend/src/services/agencyPortalApi.test.ts` (mock factory gains `rpc`; 17 new tests)
- `frontend/src/pages/AgencyFleetPage.tsx` (rewired: RLS list, RPC create/toggle, five states, conflict path)
- `frontend/src/pages/AgencyDriversPage.tsx` (additive employment panel; edge snapshot untouched)
- `frontend/src/types/database.types.ts` (hand-applied delta + header)
- `docs/design-audit.md` (TO-144-D1 entry)
- `TASKS.md` (checkpoint line; TO-144 split rows)
- `agent-results/034-result.md` (this file)
- Browser evidence (untracked): `agent-results/browser-evidence/to144-d1-browser-pass.mjs`, `to144-d1-browser-pass-results.json`, 28 `to144-*.png` screenshots

### Red-first evidence (exact commands + outputs)

1. `node scripts/agency_fleet_foundation.db.test.mjs` (before the migration existed):
   `engine: PostgreSQL 18.3 (PGlite 0.5.8) on wasm32-unknown-emscripten` — **0/32 cases passed**, exit 1. Every contract clause failed with its exact reason, e.g. `A1 … fleet-foundation migration missing from chain (last=20261007120000_consent_writer_and_job_command.sql)`, `A2 … column "code" does not exist`, `A5 … agency_truck_owner_all must be dropped (…) found: ["admin_see_all_trucks","agency_truck_owner_all"]`, `C1/C2/E1 … function public.agency_vehicle_create(unknown, unknown) does not exist`, `F1 … expected an error "new row violates row-level security policy", but the call succeeded`, `H1 … relation "public.agency_driver_employment" does not exist`.
2. `cd frontend && npx vitest run src/services/agencyPortalApi.test.ts` (before the service methods existed): **17 failed | 67 passed (84)**, exit 1 — all 17 new tests failing (`TypeError: agencyFleetApi.createVehicle is not a function`, `…endEmployment is not a function`, etc.).

### Green evidence (focused gates run by this writer, exact commands)

1. `node scripts/agency_fleet_foundation.db.test.mjs` → **32/32 cases passed**, exit 0 (PGlite full-chain replay; sections: A chain/catalog/columns/policies/signatures, C two-agency isolation + catalog FK + verbatim one-truck guards, D eligibility matrix incl. NULL-does-not-block and suspended-owner, E version conflict/idempotent replay/single-bump/partial unique, F suspended/pending/rejected fail-closed + ownership-only DELETE + status-flip guard, G deterministic agency resolution, H anon/admin regression guards). During implementation three real defects were caught and fixed by this battery: no `min(uuid)` aggregate in Postgres (resolve helper rewritten to count + single-row select), a three-valued-logic bug (`NOT (NULL > x)` silently falsified eligibility for `maintenance_blocked_until` NULL → `IS NULL OR <=`), and policies now scoped `TO authenticated` so anon gets the deterministic RLS denial rather than a function-ACL artifact.
2. `cd frontend && npm run lint` → exit 0 (`eslint . --report-unused-disable-directives --max-warnings 0`).
3. `cd frontend && npm run build` → exit 0 (tsc + vite; this is the gate that proves the hand-applied database.types.ts delta compiles).
4. `cd frontend && npm run test:unit` → **Test Files 38 passed (38); Tests 584 passed (584)**, exit 0 (567 baseline + 17 new).
5. Browser pass: `node agent-results/browser-evidence/to144-d1-browser-pass.mjs` (headless Playwright against `npm run dev` vite :5173; the configured backend `*.supabase.co` AND the local-first placeholder host mocked at the HTTP boundary; boot auth seeded via the supabase-js localStorage session) → **46/46 scripted checks PASS at BOTH 390×844 and 1280×900, 0 console errors, 0 page errors, exit 0.** Coverage: all five states on both pages (loading/empty/error+retry-recovery/success/denied), create `created` + `idempotent_replay` copy, end `ended` + `already_ended`, BOTH expected-version conflict paths (route counters prove exactly one command call + exactly one list refetch + ONE conflict message — no auto-retry), both denial banners with the verbatim controlled copy ('Agency approval is required.'), and selected-Hindi rendering on both pages (fleet/driver surfaces are English strings; hi selection renders without crash — no new Hindi strings added, consistent with the TO-143-D1 posture). 28 screenshots + results JSON under `agent-results/browser-evidence/` (untracked).

### NOT run here (owned by the run/supervisor, per the slice instructions)

- The four existing batteries as the full-gate sweep: `node scripts/dispatch_delivery_journey.db.test.mjs`, `node scripts/trip_transition_integrity.db.test.mjs`, `node scripts/customer_journey_isolation.db.test.mjs`, `node scripts/admin_rls_proof.db.test.mjs` — the run executes these fresh on the integrated candidate. (Compatibility was designed for: fleet seeds use catalog codes `eicher_14ft`; the customer battery's trucks-catalog negative-RLS case is unaffected because RLS WITH CHECK precedes NOT NULL evaluation; admin visibility is preserved via the SELECT policy; the one-truck guard messages are pinned verbatim by my battery.)
- No commit (the run gates and integrates), no `supabase db push`, no hosted actions.
- Stitch: no stitch_* tools were invoked; no screen generation or mutation (no new screens — state wiring on existing pages only, per the plan).

### Findings / open notes (honest)

- **FINDING (owner-deferred, recorded in the plan): `UNIQUE(transport_agencies.user_id)` deliberately NOT added** — hosted duplicates would break replay and PG 17 lacks NOT VALID unique; the RPC duplicate denial ('Multiple agency profiles found for this account.') is the containment. Hosted duplicate check belongs in TO-153's hosted inventory.
- **Hosted fleet-row verification**: the catalog FK is NOT VALID by design; any hosted `agency_trucks.vehicle_type` values outside the 8 codes will surface as violations on replay/next write. Needs the TO-153 hosted inventory query; no data was invented here.
- **Hosted catalog drift guard**: the migration RAISEs if any `trucks` row has no stable code mapping (fails loudly, never invents).
- **Employment RLS WITH CHECK includes `driver_is_approved_for_assignment` on UPDATE per the plan** — direct-UPDATE paths cannot end the employment of a driver later suspended; the SECURITY DEFINER end RPC is the working exit (it gates on agency operationality only). Pinned by battery; flagged so TO-144-D2 reuses the convention knowingly.
- **Hindi strings**: none added (command/state wiring only); the browser pass pins no-crash rendering under `hi`, not translated copy. Translation of these surfaces stays with the existing backlog.
- **Keyboard navigation**: new controls are native buttons/inputs with labels/aria-labels (no custom widgets); a scripted keyboard-walk transcript like TO-143-D1's was NOT captured this round — listed as an open verification nicety for the supervisor round.
- **Programmatic contrast measurement**: not part of this pass; the historical open sample in the audit remains open.
- Test-script-only iterations during the browser pass (mock host coverage for the configured `*.supabase.co` backend, counter/race fixes) are visible in the pass script comments; the page code was not modified by them.

### Next smallest completion-focused task

1. Run the fresh full gate sweep (4 DB batteries + policy/routing/glue/packing + unit/lint/build) on the integrated candidate, then supervisor acceptance of TO-144-D1 (acceptance unblocks TO-143-D2).
2. Then TO-143-D2 consumes `agency_vehicle_allocation_eligible` / `agency_driver_allocation_eligible` + the version/idempotency conventions.
3. TO-144-D2 (memberships/sites/tariffs) after D1 acceptance.

## Supervisor acceptance addendum (2026-10-10)

Supervisor acceptance of TO-144-D1, recorded 2026-10-10 at the post-TO-143-D1 chain (`b595badf` + the D1 working-tree slice). Two evidence tiers: the fresh 11-gate sweep re-run by the acceptance workflow on this exact chain, and the charter review that read every slice artifact. The slice-specific gates below are the writer's focused evidence recorded in the sections above (the acceptance run did not re-execute them).

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

The four existing batteries readdir the migrations directory, so this sweep replayed `20261008000000_agency_fleet_foundation.sql` in-chain — the green 52/30/57/21 counts are compatibility proof for the policy rewrite, catalog FK, new table and RPCs.

Slice-specific gates (writer's focused evidence, above): D1 battery 32/32 exit 0 (red-first 0/32), vitest 584/584 (17 new), lint 0, build (tsc+vite) 0, browser pass 46/46 at both widths.

### Charter review — verdict ACCEPT

Audited the `c0e2bc7e..working-tree` slice (1 committed docs change `b595badf` + 7 modified + 3 new files, exactly the allowedFiles/newFiles set) by reading every artifact: the full migration (824 lines by `wc -l`), the full battery (917 lines), all frontend diffs, the result file, the design-audit entry, and the cited pre-existing code. All 11 charter items verify:

1. **Two-agency isolation** — per-command policies replace the two dropped OR-combining policies on both tables (migration:84-138,251-306; originals confirmed at `20260305010000:22-42`); battery C1-C4 pins cross-tenant SELECT/UPDATE/DELETE 0-rows plus the fixed not-found RPC denials.
2. **Eligibility** — `agency_vehicle_allocation_eligible` / `agency_driver_allocation_eligible` implement exactly the contracted semantics incl. the NULL-does-not-block rule and suspended-owner denial (migration:394-439; battery D1-D5 covers one case per document, both maintenance forms, non-approved driver, cross-agency pair).
3. **Expected-version/idempotency** — settlement `UNIQUE(agency_id, rc_number)`, ON CONFLICT DO NOTHING replay, `WHERE version = expected` updates returning jsonb conflict envelopes with byte-identical rows, `already_ended` exactly-once replay, and the `IS NOT DISTINCT FROM` single-bump trigger (migration:180-223,322-338,445-798; battery E1-E6).
4. **Fail-closed membership** — mid-session suspended/pending/rejected deny at RLS AND all five RPCs with reads preserved; owner status-flip reverted by the `20260531110000` guard; ownership-only DELETE pinned as deliberate (battery F1-F5; precedent verified at `20261006120000:29-33`).
5. **Server-side authority** — pg_proc introspection pins all seven signatures with no agency/org id argument; no policy or RPC accepts one; the service layer sends none; error strings verified distinct from `portal-auth.ts:286/:130`.
6. **Catalog separation** — backfill CASE names match the base_schema and `20260212000000` reseed catalogs exactly (all 8); NOT VALID catalog FK; loud RAISE on unmapped hosted rows.
7. **UI** — both pages carry five distinct testid states plus single-refetch/ONE-message conflict paths; the browser-pass results JSON aggregates 46/46 ok steps across both pages at both widths incl. both conflict paths and hi no-crash (independently re-aggregated by the integrator from `to144-d1-browser-pass-results.json`: fleet 12+12, drivers 11+11); 28 screenshots present.
8. **Red-first coherent** — every reported red-run message is verbatim a battery assertion template; F1/F5's red reason is precisely the pre-rewrite policy behavior; 17 vitest red failures match the 17 new `it()` blocks.
9. **No duplication** — the migration defines only new functions and reuses `agency_is_operational`/`driver_is_approved_for_assignment`/`is_admin_user`/`set_updated_at` and the one-truck guard without redefining any TO-142/TO-143 producer, propagation or consent code; symbol-collision grep over sql/ts/tsx/mjs finds the new names only in slice files + the browser-pass evidence script.
10. **Fence respected** — zero `supabase/functions` diffs, no consent/membership/tariff/site changes, no Stitch calls claimed and no new screens, legacy Edge-backed methods (`agencyPortalApi.ts:402-456`) untouched.
11. **Evidence tiers honest** — PGlite labelled as such, hosted deferred to TO-153, NOT-run items listed, keyboard-walk/contrast gaps admitted (034-result.md:53-67 above and design-audit).

### Evidence classes (labelled honestly)

- **PGlite WASM (PostgreSQL 18.3 vs pinned 17)**: the new D1 battery (32/32) — real RLS, per-command policies, SECURITY DEFINER RPCs, triggers, version bumps. The four existing batteries re-run fresh by the orchestrator on this exact chain (in-chain migration replay). No GoTrue/PostgREST/Storage/Edge HTTP round-trip.
- **Mocked unit tier**: vitest 584/584 with `supabase`/`supabase.auth` mocks; no live DB.
- **Browser tier**: headless Playwright against `npm run dev` (vite :5173) with the configured `*.supabase.co` backend AND the `localhost.invalid` placeholder mocked at the HTTP boundary; boot auth seeded via the supabase-js localStorage session. 46/46 steps, 0 console errors, 0 page errors; screenshots + results JSON untracked under `agent-results/browser-evidence/`.
- **Hosted-absent**: no `supabase db push`, no hosted round-trip of any kind; TO-153 owner-gated. Edge guards remain source-level (no Deno runtime).

### Acceptance decision

**TO-144-D1 ACCEPTED and integrated to `main`** in this acceptance's feat commit (hash recorded on the TO-144-D1 board row and in the follow-up board commit). This unblocks **TO-143-D2**, which becomes the next task.

### Findings still open (documented deferrals, owner/supervisor-visible)

1. `UNIQUE(transport_agencies.user_id)` deliberately NOT added per plan — hosted duplicates would break replay (PG 17 lacks NOT VALID unique); the RPC "Multiple agency profiles found for this account." denial is the containment; hosted duplicate inventory belongs to TO-153.
2. Catalog FK is NOT VALID: hosted `agency_trucks.vehicle_type` values outside the 8 codes will surface as violations on replay/next write — needs the TO-153 hosted inventory; no data invented.
3. The migration RAISES loudly on hosted `trucks` rows without a stable code mapping (never invents codes).
4. Employment RLS WITH CHECK includes `driver_is_approved_for_assignment` on UPDATE per the plan — a direct UPDATE cannot end employment of a driver later suspended; the SECURITY DEFINER end RPC (agency-operational gate only) is the working exit; pinned by battery, TO-144-D2 must reuse the convention knowingly.
5. No Hindi strings added (command/state wiring only; hi-selection no-crash pinned in the browser pass) — consistent with the TO-143-D1 posture.
6. Keyboard-walk transcripts on the new controls and programmatic contrast measurement were NOT captured (native inputs/buttons with labels/aria-labels only); open verification niceties (034-result.md:66-67 above, design-audit).
7. Edge functions agency-portal-fleet/-drivers remain live and untouched; existing Edge-backed service methods unchanged (pre-existing TO-142-R DriverRegisterPage stale-URL deferral unchanged).
8. Browser-pass test-script iterations (mock host coverage, counter/race fixes) touched only `agent-results/browser-evidence/to144-d1-browser-pass.mjs`.

### Owner blockers (unchanged by acceptance)

Hosted Supabase project/credentials, `supabase db push` approval, migration/function rollout, hosted duplicate-agency + catalog-drift inventory (TO-153), hosted/device browser proof, production deploy and real payments — all owner-gated. No push performed; parked checkouts and the pre-existing untracked paths untouched.

### Next smallest completion-focused task (post-acceptance)

**TO-143-D2** — actual fleet assignment and transactional reservations (`agent-tasks/033-dispatch-lifecycle.md` delivery 2), now READY: it consumes `agency_vehicle_allocation_eligible` / `agency_driver_allocation_eligible` and the version/idempotency conventions landed here. TO-144-D2 (memberships/sites/tariffs) follows after.
