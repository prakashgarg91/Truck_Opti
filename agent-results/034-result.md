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

## Delivery 0 (2026-10-25) — deterministic expiry clock repair

Status: **AWAITING_REVIEW** — recorded and committed by the workflow integrator on `main`; Codex is the independent acceptance authority and no Codex verdict exists yet. Board row: TO-155. Scope is test-only: the time-brittle expiry assertion in the fleet-refresh test is pinned to a deterministic clock; product code untouched (the working tree under this delivery changes only `frontend/src/pages/AgencyFleetPage.test.ts` + docs/board).

### Root cause (read + cited)

The component computes the countdown label in `firstDocAlert` — `frontend/src/pages/AgencyFleetPage.tsx:53`: `const days = Math.ceil((new Date(doc.expiry).getTime() - Date.now()) / 86400000)`; formatted at :59 (`${label} expires in ${days} day(s)`); the same formula drives `expiryStatus` at :36. Rounding is `Math.ceil` over a pure-UTC millisecond delta — `new Date('2026-11-05')` parses date-only ISO as UTC midnight per spec, and both `getTime()` and `Date.now()` are absolute UTC ms, so no local-timezone involvement. The page renders "12 days" iff now ∈ [2026-10-24T00:00:00Z, 2026-10-25T00:00:00Z), so the loaded-card test's real-clock assertion was time-brittle.

### Reproduced red (delivery workflow, pre-fix)

With the fix absent and the real clock on 2026-10-25, `npx vitest run src/pages/AgencyFleetPage.test.ts` failed the loaded-vehicle-card test: expected 'Fitness expires in 12 days' was not present, because real now computes `Math.ceil` = 11 ('Fitness expires in 11 days'). A node arithmetic pre-check (`node -e` evaluating the same `Math.ceil` at candidate instants) confirmed real now → 11 and 2026-10-24T12:00:00Z → 12, matching the reported red output. (Red reproduction and the arithmetic pre-check were run by the delivery workflow; the integrator did not re-run the red state — the working tree already carries the fix.)

### Fix (frontend/src/pages/AgencyFleetPage.test.ts only; +17/−2)

- **Scoped fake clock** — the loaded-vehicle-card test now installs `vi.useFakeTimers({ now: Date.parse('2026-10-24T12:00:00Z'), shouldAdvanceTime: true })` (`frontend/src/pages/AgencyFleetPage.test.ts:156`) before mount. 2026-10-24T12:00:00Z is the midpoint of the 12-day ceil window (fitness_expiry 2026-11-05 is then exactly 11.5 days out → `Math.ceil` = 12), so the result is deterministic regardless of hour-of-day, the machine's local timezone, or hours of suite drift; `shouldAdvanceTime:true` keeps real-time timers firing so the `waitFor`/`setTimeout` polling and React `act` paths keep working. A static `Date.now` spy was not viable: the component reads BOTH `new Date` and `Date.now`, and the test's own `waitFor` helper (`frontend/src/pages/AgencyFleetPage.test.ts:80-89`) uses `Date.now()` for its deadline — spying it out would hang the polling helper. vitest 3.2.4 (`frontend/package.json:65`) supports these options.
- **Restoration** — `afterEach(() => { vi.useRealTimers() })` in the describe (`frontend/src/pages/AgencyFleetPage.test.ts:132-136`; import updated at :6), because vitest.config.ts's `clearMocks`/`restoreMocks`/`unstubEnvs` (`frontend/vitest.config.ts:11-13`) do not restore fake timers. The freeze is scoped to the one affected test; the other eight never see it.
- **Assertion kept meaningful** — `toContain('Fitness expires in 12 days')` retained verbatim (`frontend/src/pages/AgencyFleetPage.test.ts:169`) with a comment explaining the pinned clock — not weakened, skipped, or hardcoded to today's real number.

### Green evidence

Focused (clock repair):

| Command (from `frontend/`) | Result | Exit | Run by |
|---|---|---|---|
| `npx vitest run src/pages/AgencyFleetPage.test.ts` (run 1) | 9/9 passed, 1.46s (17:48:53) | 0 | delivery workflow |
| `npx vitest run src/pages/AgencyFleetPage.test.ts` (run 2) | 9/9 passed, 1.34s (17:49:35) | 0 | delivery workflow |
| `npx vitest run src/pages/AgencyFleetPage.test.ts` (pre-commit re-run) | 9/9 passed, 1.32s (18:48:59) | 0 | integrator (this recording) |

The suite passing proves the async paths did not freeze: every test relies on `waitFor` terminating via `Date.now()` deadlines and real `setTimeout` sleeps, and all completed. Pre-existing stderr noise (`The current testing environment is not configured to support act(...)`) appears on every test including unmodified ones — pre-existing, not introduced by this change, not failures. Git prints an LF→CRLF autocrlf notice for the file — cosmetic; the diff is +17/−2.

Full battery (fresh run by the delivery workflow on the integrated candidate; not re-run by the integrator per the delivery instructions):

| # | Gate | Result | Exit |
|---|---|---|---|
| 1 | dispatch journey DB battery (`node scripts/dispatch_delivery_journey.db.test.mjs`) | 52/52 PASS | 0 |
| 2 | customer isolation DB battery (`node scripts/customer_journey_isolation.db.test.mjs`) | 30/30 PASS | 0 |
| 3 | admin RLS proof DB battery (`node scripts/admin_rls_proof.db.test.mjs`) | 57/57 PASS | 0 |
| 4 | trip integrity DB battery (`node scripts/trip_transition_integrity.db.test.mjs`) | 21/21 PASS | 0 |
| 5 | agency fleet foundation DB battery (`node scripts/agency_fleet_foundation.db.test.mjs`) | 32/32 PASS | 0 |
| 6 | policy suites (5) | PASS | 0 |
| 7 | server routing | PASS | 0 |
| 8 | glue check | PASS | 0 |
| 9 | packing regression | 32/32 PASS | 0 |
| 10 | frontend lint (zero warnings) | PASS | 0 |
| 11 | frontend unit tests | PASS | 0 |
| 12 | frontend build incl. tsc | PASS | 0 |

### Proof-tier reconciliation (2026-10-25; docs/design-audit.md +19/−12, committed with this delivery)

An evidence-tier reconciliation annotated 8 claims across `docs/design-audit.md`:

- **NEW tranche-level section** '2026-10-25 evidence-tier reconciliation — TO-154 screen tranche (Delivery-0 req 6)' (`docs/design-audit.md:3-7`): defines the five tiers (MOCKED BROWSER / JSDOM-VITEST / SQL-PGlite / HOSTED HTTP / PHYSICAL DEVICE), corrects the tranche-wide 'NOT run this tier: browser pass' claims — a scripted MOCKED BROWSER pass DID run per item (`.stitch-mcp/verify-{driver-offer,wcag-contrast,driver-home-refresh,trip-refresh,proof-refresh,fleet-refresh}-20261024.mjs` + `contrast-recheck.mjs`, Playwright vs dev server :5173 with route mocks on **localhost.invalid/** AND **/*.supabase.co/**) — and states plainly that the 104 gitignored PNGs + console-only scripts are provisional mocked-tier verification, not a durable acceptance record and not evidence of any fresh hosted or physical-device pass.
- **fleet-management-refresh** (2f54d59c→cfafbe06, `docs/design-audit.md:27-28`): vitest bullet re-labelled 'JSDOM/VITEST unit tier'; the old 'NOT run this tier: browser pass … owner-gated follow-up' claim was FALSE (verify-fleet-refresh-20261024.mjs + 14 fleet-*.png ran 10:37, minutes before commit feb783f1 10:39) and was replaced with a tier record (mocked-browser pass existed but is console-output-only/gitignored/not integrated into `agent-results/browser-evidence/`; the durable browser record remains the TO-144-D1 battery 46/46 against PRE-refresh markup only, re-counted ok:true 46/false 0); 'Hosted RLS/RPC round-trips stay covered by the PGlite battery' re-labelled (PGlite is in-process Postgres, not a hosted round-trip); HOSTED HTTP / PHYSICAL DEVICE: none — absent.
- **fleet state table** (`docs/design-audit.md:24`): 'empty/error(Retry)/denied/loaded verified again this run' now reads '(JSDOM/VITEST tier — see the proof bullets below)' so it cannot be read as browser verification.
- **driver-delivery-proof-refresh** (180752ea→c241f6c1, `docs/design-audit.md:48-49`): vitest 18/18 re-labelled JSDOM/VITEST (its mocked supabase.storage client explicitly unit-tier, not a real upload); old 'NOT run this tier: browser pass' replaced — verify-proof-refresh-20261024.mjs + 8 driver-proof-*.png ran 10:09 (before commit 03d5b8f4 10:10) with a mocked storage-upload success/failure path at the HTTP boundary; provisional mocked-tier only; HOSTED HTTP / PHYSICAL DEVICE: none — absent (camera `capture="environment"`/geolocation not exercised in any tier).
- **driver-trip-detail-refresh** (591699f3→98648447, `docs/design-audit.md:68-69`): vitest 15/15 re-labelled; old 'browser pass NOT run — the local-first tier cannot render a signed-in approved-driver trip' was FALSE (verify-trip-refresh-20261024.mjs + 18 driver-trip-*.png ran 09:42, before commit b5eb0fb5 09:44, via fake-session seeding + HTTP mocks); 'Realtime/RPC behavior against hosted Supabase is covered by the TO-130 DB batteries' re-labelled (PGlite ≠ hosted Supabase); cloud-credentialed real-session journeys remain owner-gated; HOSTED / DEVICE: none — absent.
- **driver-app-home-refresh** (05bf2a23→96715dd2, `docs/design-audit.md:89-90`): vitest 10/10 re-labelled; old 'cannot sign in as an approved driver' claim was FALSE (verify-driver-home-refresh-20261024.mjs + 22 driver-home-*.png ran 09:14–09:15, before commit 9c6f4312 09:17); hosted realtime offer channel marked not exercised in any tier; HOSTED / DEVICE: none — absent.
- **wcag-aa-contrast-fixes-shipment-agency-jobs** (`docs/design-audit.md:106-107`): vitest contract-test bullet re-labelled JSDOM/VITEST, node one-liner ratios marked 'static math, not a rendered-page measurement'; ADDED the previously undocumented mocked-browser tier (verify-wcag-contrast-20261024.mjs + contrast-recheck.mjs, 18 wcag-contrast-*.png @08:42, before commit fa5b9ef1 08:45; `/booking/new` customer panels form/error/success light+dark and `/agency/jobs` agency panels empty/rows light+dark + error, both viewports); console-output-only, gitignored; HOSTED / DEVICE: none — absent.
- **driver-job-offer-acceptance** (screen 202377b7 RETIRED, `docs/design-audit.md:129,134`): proof heading re-labelled JSDOM/VITEST unit tier; old 'NOT run this item: browser pass' was FALSE (verify-driver-offer-20261024.mjs + 24 driver-offer-*.png ran 08:21, before commit c310879b 08:28); the tier record carries the script-header caveat (verify-driver-offer-20261024.mjs:11-18: an external process restored `frontend/.env` mid-pass so the app booted in cloud mode against the configured project host, but every request was intercepted by mocks — nothing reached the network, so it remains MOCKED BROWSER); durable record remains the tracked `scripts/atomic_job_offer_response.browser-proof.mjs` (TO-129/TO-130); HOSTED / DEVICE: none — absent.

Reconciliation notes (evidence established by the reconciling workflow; it re-ran no verify script, battery or browser pass): (1) `agent-results/browser-evidence/` holds only Oct 8/10 TO-143/TO-144 scripts + results JSONs + PNGs — no TO-154-era files; (2) `.stitch-mcp/screenshots/` holds 104 PNGs in six state batches (driver-offer 24 @08:21, wcag-contrast 18 @08:42, driver-home 22 @09:14–09:15, driver-trip 18 @09:42, driver-proof 8 @10:09, fleet 14 @10:37) with zero results JSONs; (3) each batch landed minutes before its item's commit (c310879b 08:28 … feb783f1 10:39); (4) the six verify scripts + contrast-recheck.mjs live in the gitignored `.stitch-mcp/` tree (`.gitignore:91`), all Playwright vs :5173 with `**localhost.invalid/**` + `**/*.supabase.co/**` route mocks and fake-session seeding — grep confirmed no writeFile, PNG-only persistence; (5) results JSONs re-counted: to143 ok:true 58/false 0, to144 ok:true 46/false 0. Because the six scripts persist no results, their pass/fail outcomes are not auditable from the repo — stated as such in the doc rather than claimed.

Findings carried to the integrator (recorded here and acted on in this delivery's board edit): TASKS.md's TO-154-row wording 'browser passes against the refreshed markup are owner-gated' is superseded for the MOCKED tier by the discovered throwaway passes (it remains accurate for HOSTED/DEVICE tiers); and if the mocked-tier passes are to count as acceptance evidence, the verify scripts and a results JSON should be integrated into `agent-results/browser-evidence/` (currently they are console-only and gitignored).

### Honest caveats

- The broader frontend suite was NOT re-run for the clock repair itself — the delivery's named check was this one file, and the change touches no shared code; the full battery above was run by the delivery workflow on the integrated candidate.
- Not accepted: this delivery is recorded **AWAITING_REVIEW** — Codex review is the next step, and TO-143-D2 implementation waits on that acceptance (its pre-edit plan is pinned in `agent-results/033-result.md`).

## Delivery 0 — review correction (2026-10-27)

Codex verdict (relayed by the director 2026-10-25): deterministic clock repair acceptable; TO-143-D2 pre-edit plan NEEDS_CHANGES; D2 implementation not authorized from it. This correction cycle delivered two things and changed no product code.

### 1. Frontend suite diagnostic (correction point 1)

Five complete retained runs in `agent-results/to155-suite-logs/`: run-1 and run-2 full `npm test` green 618/618 (exit 0); run-3 poll-loop page trio (AgencyFleetPage/DriverDashboardPage/DriverTripPage) 5x green in isolation (155/155 per pass); run-4 the pre-fix demonstration (exit 1); run-5 full suite under 20 CPU-saturating busy-loops — green 618/618 at 2.4x normal duration (Duration 4.12s→8.19s, tests 17.16s→42.05s).

Result: the 597/21-vs-618/618 signature did NOT reproduce at HEAD. The only demonstrated defect in the tree's history is the PRE-fix real-clock assertion in `AgencyFleetPage.test.ts` (parent commit feb783f1): run-4 reproduces it failing today ("expected 'BharatBenz 32ft (15T)AvailableRC: MH1…' to contain 'Fitness expires in 12 days'") because `AgencyFleetPage.tsx:36,53` computes `Math.ceil((new Date(expiry).getTime() - Date.now())/86400000)` and the assertion only holds inside UTC 2026-10-23T12:00Z..2026-10-24T12:00Z — commit 9c585895 (the commit under review) repairs exactly this. At HEAD the surface is order-stable: vitest `pool='forks'` + `isolate=true` (fresh worker per file — no cross-file pollution), `sequence.shuffle` off with an inert seed (verified in the installed vitest 3.2.6 source; note the superseded plan recorded 3.2.4).

Zero repairs applied (the demonstrated defect was already repaired at HEAD); zero modified tracked files; the supervisor gate re-ran the full suite green (41 test files, exit 0, zero repair rounds). Honest unproven candidates, left untouched per the repair-only-demonstrated-defects rule: (a) `DriverDashboardPage.test.ts:85` fixture `expires_at = Date.now()+60_000` vs the product's 1s auto-dismiss countdown (`DriverDashboardPage.tsx:342-363`) — would fail its 5 offer-modal tests only after a >60s mid-test stall, not demonstrated (file completes <0.5s; saturated full run 8.19s); (b) 5s real-timer `waitFor` poll deadlines failing under CPU contention harsher than the demonstrated 2.4x — refuted at demonstrated magnitude, not excludable beyond it; (c) reviewer-side variables (non-default flags such as --sequence.shuffle, the parent revision or a pre-fix dirty tree, timezone, load beyond 2.4x) — none verifiable from this tree. No test was skipped, no timeout was raised, no retry masking added.

### 2. Revised TO-143-D2 contract (correction points 2-8)

`agent-results/to155-d2-contract-draft.md` (revision 2, 246 lines) — built from a fresh read-only mutation-path map of every reachable writer (legacy Edge `agency-portal-jobs`, broadcast producer `dispatch_job_to_drivers`, `respond_to_job_offer`, `persist_driver_job_offer_progress` + delivery propagation, consent grant/revoke RPCs, agency direct `createJob`, customer writers), drafted against the eight correction requirements, then reviewed by an independent fresh-eyes reviewer (2 blocking issues, 9 requirement gaps, 4 unsupported claims, 6 wording fixes — ALL applied, none declined; >=8 load-bearing citations spot-checked against the working tree). Key pins: legacy Edge `update-status`/`assign-driver` SUPERSEDED (removed in D2, `list` kept — deferral ruled unsafe); invariants I1-I6 enforced at the accept transition via a per-shipment partial unique + accept-guard trigger with `respond_to_job_offer` byte-unchanged; server-authoritative expiry sweep RPC callable from assignment/candidate commands (accepted commitments never expire as pending offers); consent-revocation release trigger; authorized cancellation; idempotent retries and terminal-replay responses; ONE lock order compatible with the existing commands; seven acquisition preconditions including vehicle-type compatibility and server-side capacity validation; PGlite sequential tests remain supporting evidence only with true-overlap concurrency acceptance OPEN; "approved/review-approved" wording purged; all 8 unresolved contracts of the superseded plan answered (its §14). Summarized in `agent-results/033-result.md`, which the revision supersedes (old plan verbatim in git history at 9c585895).

Evidence: dynamic workflow chain (final run dwfrun-1084d303; predecessors dwfrun-f0f782c1 → 5825c181 → ccc44a58 → 1f77ff94 cached the diagnostic/surface/draft work); fresh-eyes review independently verified; full-suite gate exit 0. Not covered: true overlapping-transaction concurrency (no Docker/native PostgreSQL on this machine — external prerequisite for D2 acceptance), hosted HTTP and physical-device tiers (owner-gated). Status: AWAITING_REVIEW (Codex re-review next). TO-143-D2 implementation remains NOT authorized.

Note: untracked `frontend/src/lib/backupRestoreRoundtrip.test.ts` (296 lines, backup→Drive→restore golden-path test) appeared from a concurrent owner session during this cycle (the same session made the owner R-0689 evidence commit 91b50f76); it is NOT part of this delivery and is preserved untracked.

---

## TO-144-D2 backend candidate

Status: **CANDIDATE, not accepted.** Backend only: no UI, no Stitch, no design generation, no frontend or service changes. Working tree only (no commit, no push, no branch or worktree). `TASKS.md` is not edited, so the TO-144-D2 row still reads WAITING_DEPENDENCIES.

**Proof tier: PGlite (PostgreSQL 18.3 WASM), single session, full supabase/migrations chain replayed in-chain.** Hosted GoTrue, PostgREST, Storage and Edge were NOT exercised, so hosted behaviour is unverified. Browser proof is not applicable (no UI).

### What shipped (one forward migration)

`supabase/migrations/20261011000000_agency_members_clients_tariffs.sql`, sorted after the reservation migration, additive only, pinned search_path, no PUBLIC/anon EXECUTE. Reuses `transport_agencies.user_id` as the owner, `resolve_caller_agency_id()`, `agency_is_operational()`, `driver_is_approved_for_assignment()`, `is_admin_user()`, `set_updated_at()`, D1 `agency_driver_employment` and `trucks.code`. No duplicate party table.

1. **Memberships and invitations.** Scopes are `dispatcher`, `fleet_manager`, `finance`, `viewer`; `owner` is not a scope. RPCs: `agency_member_invite`, `agency_member_invitation_revoke`, `agency_member_accept`, `agency_member_revoke`, `agency_member_change_scope`, plus the read predicate `agency_member_has_scope(agency, scope)`. Tokens are 64-hex, returned once, and stored only as SHA-256. Accept requires the caller's auth email to equal the invited email. Expired, revoked, reused and mismatched tokens are refused. An existing active member's scope is never changed by a fresh invitation. An owner can be neither invited to nor accept into its own agency.
2. **Client agreements, sites, contacts.** `agency_client_agreement_create/update`, `agency_client_site_create/update`, `agency_client_contact_create/update`. Versioned with expected_version. One active bill-to per agreement (partial unique); any number of ship-to. Sites and contacts use composite (id, agency_id) FKs, so a cross-agency reference is impossible even for a superuser.
3. **Tariff effective versions.** `agency_tariff_version_publish` plus the service-only lookup `agency_tariff_rate_at`. Rows are append-only (trigger rejects UPDATE and DELETE for every role). Lane = agreement, origin, destination, vehicle key. Supersession requires the current head id (else `version_conflict`). Overlap is rejected (`tariff_overlap`). Ranges are [from, to), with a NULL end meaning open. A superseded open version is never mutated; its end is the successor's start.
4. **Driver invitations.** `agency_driver_invitation_create/revoke/accept`. Token-hashed, phone-bound, expiring, one-use. Accept requires a caller-owned driver profile with matching phone and an approved driver, refuses an active employment with another agency, and creates or reuses the D1 `agency_driver_employment` row, linked from the invitation.

RLS: all seven tables are owner-or-admin SELECT only. Authenticated holds no write privilege, and `token_hash` is not granted to it at all.

### Red-first evidence (exact)

- `scripts/agency_members_clients_tariffs.db.test.mjs` written before the migration: **1/99**, exit 1. The single pass is J3, a regression guard over existing D1/reservation policies, which passes pre-migration by design.
- Two harness defects surfaced and were fixed before green (test bugs, not weakened assertions): the employment fixture used a user id where `drivers.id` was required (surfaced as an FK error in I11), and the A4 column check used `invited_email` on the phone-bound driver table.
- Green: **99/99**, exit 0 (`node scripts/agency_members_clients_tariffs.db.test.mjs`).

### Coverage per command (battery cases)

- Invite: success (C1, token hashed C2), cross-agency (C4), non-owner (C13), self-escalation (C5), unknown scope (C6, C7), idempotent replay (C8), key reuse (C9), duplicate pending (C10), suspended owner (C12), expiry bounds (C11).
- Accept: success (D1), replay (D3), reused token by another user (D4), recipient mismatch (D5), expired (D6), revoked (D7), unknown token (D8), owner self-accept (D9), already-member no escalation (D10), suspended agency (D11).
- Revoke/scope: stale version (E2, E6), cross-agency (E5), unknown scope (E3), non-owner and self-escalation (E4), exactly-once revoke replay (E8), revoked membership (E9), revoked staff old session (E10, E11).
- Agreements/sites/contacts: create/replay/reuse (F1-F3), cross-agency (F5, G5, G12), non-owner (F6), stale version (F7, G6, G11), status and pincode validation (F4, F8, G4), bill-to exclusivity (G3, G7), cross-agreement site reference (G8), ended agreement (G13).
- Tariffs: success v1/v2/v3 (H1, H3, H6), overlap rejected (H2, H4), stale head `version_conflict` (H5), idempotent replay and key reuse (H7), past-version immutability for superuser and authenticated (H8, H9), effective lookup in gap and before first (H10), lane independence (H11), cross-agency (H12), non-owner (H13), validation (H14), ended agreement (H15), suspended owner (H16).
- Driver invitations: create, replay and reuse (I1, I2), duplicate and malformed phone (I3), cross-agency (I4), non-owner and driver-as-staff (I5), no driver profile (I6), phone mismatch (I7), unapproved driver (I8), success linking D1 employment (I9), replay and second-user refusal (I10), employed elsewhere (I11), stale revoke and revoked token (I12), expired (I13), suspended agency (I14).
- Chain and schema: D2 sorts after reservations (A1), 7 tables with RLS (A2), no direct write privilege (A3), token column hygiene (A4), no agency/org id argument on any RPC (A5), SECURITY DEFINER and pinned search_path with no anon EXECUTE (A6), owner-scope CHECK (C7), read isolation (J1), admin read (J2), no D1 policy regression (J3).

### Gate results (exact commands; all run in this session)

| Command | Result | Exit |
|---|---|---|
| `node scripts/agency_members_clients_tariffs.db.test.mjs` | 99/99 | 0 |
| `node scripts/agency_fleet_foundation.db.test.mjs` | 32/32 | 0 |
| `node scripts/fleet_assignment_reservations.db.test.mjs` | 42/42, 0 findings | 0 |
| `node scripts/dispatch_delivery_journey.db.test.mjs` | 52/52 | 0 |
| `node scripts/customer_journey_isolation.db.test.mjs` | 30/30 | 0 |
| `node scripts/admin_rls_proof.db.test.mjs` | 57/57 | 0 |
| `node scripts/trip_transition_integrity.db.test.mjs` | 21/21 | 0 |
| `cd frontend && npx tsc --noEmit` | clean | 0 |
| `cd frontend && npm run lint` | clean | 0 |
| `cd frontend && npx vitest run` | Test Files 39 passed (39); Tests 585 passed (585) | 0 |
| `npm run test:server-routing` | 15 pass, 0 fail | 0 |
| `npm run glue:check` | GLUE SEALED, 0 gaps, 0 warnings | 0 |

Note on vitest: the D1 record says 38 files and 584 tests. This candidate changed no frontend file (`git status` shows only the two new files below), so the current count comes from the HEAD tree. The cause of the delta was not investigated.

### Changed files

- `supabase/migrations/20261011000000_agency_members_clients_tariffs.sql` (new)
- `scripts/agency_members_clients_tariffs.db.test.mjs` (new)
- `agent-results/034-result.md` (this section)

Not changed: `TASKS.md`, all frontend and service code, `database.types.ts`, Edge functions, D1 policies and functions. Stitch calls: 0. Hosted mutations or pushes: 0. Retries: 0.

### Open findings (honest)

1. **Staff scope is not yet consumed.** D1 fleet and driver RLS and the reservation policies remain owner-only. Staff memberships grant nothing on existing tables until TO-145/148/149 call `agency_member_has_scope`.
2. **Expiry is lazy.** An invitation past `expires_at` stays `pending` until a same-email re-invite or an accept sweeps it. There is no scheduled sweep. Readers must compare `expires_at`.
3. **Token delivery is out of band.** The raw token is returned once to the owner. No email or SMS. The UI must show it once.
4. **Client parties are agency-owned.** The legacy `public.customers` table has no tenant column and is not linked. Owner decision needed on linking to platform customers.
5. **Tariff policy to confirm.** Amounts with more than two decimals are refused, not rounded. Currency is INR only. Rate basis vocabulary is `per_trip`, `per_tonne`, `per_km`.
6. **Append-only FKs.** RESTRICT FKs mean agency deletion is blocked while agreement, site, contact or tariff history exists. This is deliberate.
7. **Column-level grant.** `token_hash` is hidden from authenticated. A PostgREST `select=*` by an authenticated client will fail with permission denied, so clients must list columns (UI tier).
8. **Concurrency unproven.** Advisory lock and `FOR UPDATE` are in place, but the battery is single-session only.
9. **Types not updated.** `frontend/src/types/database.types.ts` lacks the seven new tables. A hand-applied delta is needed before any UI.
10. **Hosted gates.** No `supabase db push`, no hosted round-trip. Hosted proof stays with TO-153, owner-gated.
11. **Owner self-accept path (D9) is defense in depth.** It is seeded by superuser because the public invite API already refuses the owner's own email.

### Next smallest task

Owner review of the policy items (2, 4, 5). Then a TO-144-D2 UI delivery consuming these RPCs, which needs the database.types delta (item 9) and the browser pass with a token-delivery decision (item 3).

## TO-144-D2 policy decisions and types delta (2026-11-04)

Owner delegated three policy questions to the Opus advisor in chat ("ask the opus 5.5"); its recommendations are adopted below and remain overridable by the owner.

- **Client parties (open finding 4): keep agency-owned.** Do not link to the legacy `public.customers` table (global, no tenant column, seed rows). Deferred: an optional `platform_customer_id` link column as a separate forward migration if the same client must be reconciled.
- **Tariff policy (open finding 5): confirmed as built.** INR only, NUMERIC(12,2), more than two decimals refused (UI uses `step=0.01`), basis `per_trip` / `per_tonne` / `per_km`. `rate_amount` excludes GST (GST belongs at invoicing). Deferred, each a single nullable forward column or vocabulary addition: `per_kg`, detention, minimum charge / minimum weight. Never rename an existing basis value (append-only table).
- **Token delivery (open finding 3): UI shows the raw token once, owner shares it out of band.** Automated WhatsApp delivery is deferred behind a delivery interface; the gateway or official-API choice and any credentials are owner decisions.
- **Types (open finding 9): delta applied, machine-checked.** `scripts/db_types_drift.check.mjs` (`npm run types:drift`) replays the migration chain in PGlite, introspects objects added since 20261010000000 and fails on any difference from `frontend/src/types/database.types.ts`; `--write` inserts missing entries only. Result: 8 tables (`fleet_assignment_reservations` plus the seven D2 tables) and 23 public functions added, 313 insertions / 0 deletions, `tsc` clean. Proof tier: local PGlite only; regenerate with the real generator on a Docker machine before hosted proof (TO-153).
- Known, out of scope: run with `--since 20260101000000`, 9 pre-existing table/function entries (analytics_events, packing_results, routes, subscription_plans, trucks, and four job-offer functions) differ from the replayed schema, and D1 `agency_driver_*` / `shipment_agency_consents` entries are absent. Not touched here.

## Owner launch decisions recorded 2026-11-04 (TO-144-D2 follow-up)

Full scope kept; real Razorpay/PhonePe payments; staff scopes enforced now (open finding 1 of the D2 backend is therefore scheduled, not deferred); driver model = `agency_driver_employment` authority (advisor). Details and the open owner decisions are in the TASKS.md 2026-11-04 launch-decision paragraph.

## Staff scope enforcement (owner decision 2026-11-04) — candidate, not accepted

Status: **CANDIDATE, not accepted, not DONE.** Proof tier: PGlite (PostgreSQL 18.3 WASM), single session. Hosted GoTrue/PostgREST/RLS and realtime policy cost are NOT exercised (TO-153).

- Migration `supabase/migrations/20261012000000_staff_scope_enforcement.sql` is GENERATED by `scripts/gen_staff_scope_migration.mjs` (`--check` fails if the file drifts) from the current text of each object; only the authority expression is substituted. New helpers: `agency_caller_agencies(text[])` (owner agencies plus operational agencies where the caller holds an active membership in the listed scopes) and `resolve_caller_agency_for_scopes(text[])` (single acting agency; no agency-id argument). Partial index `agency_memberships_active_by_user`.
- Matrix: `fleet_manager` writes vehicles, driver employment, driver invitations; `dispatcher` writes reservations (reserve/release) and `agency_jobs`; `finance` writes client agreements/sites/contacts and publishes tariffs; every scope reads trucks, employment, reservations, jobs, consents, client records and tariffs; owner only for DELETE, memberships and staff-invitation commands. 16 policies and 20 RPCs regenerated.
- Error wording: insufficient scope raises `Your access scope does not allow this action.`; active staff of a non-approved agency get `Agency approval is required.`; users with no agency keep `No agency profile found for this account.`
- Red-first: two new batteries written by Haiku workers and supervised here — `scripts/staff_scope_fleet_clients.db.test.mjs` (89 cases; 42 pass / 47 fail before the migration) and `scripts/staff_scope_dispatch.db.test.mjs` (50 cases; 40 pass / 10 fail before). After the migration: 89/89 and 50/50. Mutation check: swapping the finance and dispatcher scopes in the migration made both batteries fail (D2/D3/D5/D6, W2/W5) and the generator restored it.
- Existing batteries after the migration: members/clients/tariffs 99/99, reservations 42/42, fleet foundation 32/32, dispatch journey 52/52, customer isolation 30/30, admin RLS 57/57, trip integrity 21/21. Frontend `tsc`/lint/build clean, vitest 659/659, routing 15/15, glue sealed, `types:drift` PASS.
- Deliberate assertion changes (not weakened): `agency_members_clients_tariffs` E4, F6, H13, I5 expected `No agency profile found for this account.` for a staff dispatcher; they now expect the more precise scope message (the denial itself is unchanged; the I5 driver half keeps the old message). `anon` was granted EXECUTE on `agency_caller_agencies` because policies without a TO clause (e.g. agency_jobs read) are evaluated for anon (found by admin_rls_proof); it returns no rows with `auth.uid()` NULL.
- Known gaps: legacy Edge functions (`agency-portal-jobs`, `-drivers`, `-fleet`) still authenticate the owner only, so staff gain nothing through them; one active membership per user is assumed for command RPCs (a user in two agencies gets the multiple-agency error); the Team page "Change scope" UI and per-scope UI hiding are not built; realtime/RLS cost unmeasured.

## Advisor acceptance of the staff-scope candidate (2026-11-04)

Owner delegated the accept/reject call to the Opus advisor. Verdict: ACCEPT after one change, done: `agency_jobs` policies are now `TO authenticated` (generator-enforced) and the `anon` EXECUTE grant on `agency_caller_agencies` was removed. Re-run green: staff-scope 89/89 and 50/50, admin RLS 57/57, members 99/99, journey 53/53, all other batteries unchanged. Open follow-up (launch blocker): remove the legacy Edge `agency-portal-jobs` `update-status`/`assign-driver` (and `assign-truck`) write paths and route the UI through the RPCs.
