# TO-130 — Verify and repair trip transitions and OTP enforcement — result

**Status:** AWAITING_REVIEW (implementation + repair complete on the working tree and committed)
**Date:** 2026-10-05 (repair run) · 2026-10-04 (initial implementation) · **Writer:** GLM-5.3 Flash worker · **Brief:** `agent-tasks/020-trip-transition-integrity.md`

## Problem and resulting behavior

`persist_driver_job_offer_progress` (migration `20260730110000`) had five proven defects, all
repaired by the initial TO-130 implementation (`023a2654`):

1. **Replay double-count** — `total_trips` incremented whenever the resulting status was
   `delivered`, including replays (double click / retry), inflating trip counters, payout
   entitlement and every earnings figure derived from them.
2. **No ordering** — any status could be written in any order (skips, reruns, backward moves).
3. **Unlimited OTP guessing** — the 4-digit pickup/delivery codes had no attempt bound.
4. **Forgeable chronology** — client-supplied `p_extra` timestamps were written verbatim and
   doubled as an undocumented transition trigger.
5. **Unrestricted photo paths** — `photo_loading_url`/`photo_delivery_url` accepted arbitrary
   strings.

The resulting lifecycle is now ordered (`accepted -> pickup_arrived -> in_transit ->
delivery_arrived -> delivered`), OTP-gated (pickup OTP for transit, delivery OTP for completion
with prior pickup verification), replay-safe (identical status returns the authoritative row and
writes nothing, so `total_trips`/payout/revenue change exactly once), attempt-bounded
(5 attempts per code, 15-minute lock, reset on success), server-timestamped (`p_extra` timestamps
ignored) and photo-reference restricted to this job's own `trip-photos/<driver user>/<job>/`
storage path. Direct driver `UPDATE`/OTP `SELECT` is denied by table revocation + column grants.

## This repair run

Two items from the review/handoff were closed:

1. **Photo-URL acceptance case (was the only red DB case).** The initial implementation's
   `is_job_trip_photo_url` regex matched exactly two path segments after `/trip-photos/`
   (`<user>/<job>`), but the driver UI uploads to `${user.id}/${job.id}/${field}.${ext}`
   (`frontend/src/pages/DriverTripPage.tsx:354`) and the migration's own comment describes
   `<auth user>/<job offer>/<file>`. Every legitimate upload reference was therefore rejected by
   the RPC with `Invalid trip photo reference` — a real functional defect, not only a test
   fixture mismatch. Fixed by new correction migration
   `supabase/migrations/20261005000000_trip_photo_url_correction.sql` (regex now requires
   `<user>/<job>/<file>`; ownership position check and signature unchanged; ACL re-asserted).
   Red/green below.
2. **Latent `job_offers.created_at` defect (traced to `6f15554f` / TO-138).** Audited at HEAD:
   the files added/changed by that commit are already repaired by the TO-130 implementation
   commit — `023a2654` rewrote the earnings and trip selects to `offered_at`/`delivered_at`
   (`frontend/src/services/customerSupabaseApi.ts:379-382,477,486,506,526,556,579,665,679,697`)
   and added the regression test `selects delivered_at and computes last_thirty_days from it
   (regression TO130)` (`customerSupabaseApi.test.ts:526`, green). A repo-wide audit of every
   `.select(` containing `created_at` found no remaining select against `job_offers` (remaining
   hits are `agency_jobs`, `shipments`, `packing_jobs`, `subscriptions`, `users`, `drivers`,
   which do have the column) — exact command in the checks table.

## Changed files (this repair run)

- `supabase/migrations/20261005000000_trip_photo_url_correction.sql` (new) — corrected
  `public.is_job_trip_photo_url(TEXT, UUID, UUID)` shape regex to accept the third path segment
  (the uploaded file) while keeping the `<user>/<job>/` ownership position check.
- `TASKS.md` — TO-130 row status only.
- `agent-results/020-result.md` — this file.

Initial implementation commit `023a2654` (unchanged by this run): the integrity migration,
`scripts/trip_transition_integrity.db.test.mjs`, `driverTripProgress.ts`/`.test.ts`,
`DriverTripPage.tsx`, `TrackingPage.tsx`, `customerSupabaseApi.ts`/`.test.ts`,
`database.types.ts`.

## Exact verification (commands → exit codes/counts, run 2026-10-05 on this tree)

| Check | Command | Result |
|---|---|---|
| TO-130 DB proof (red, before fix) | `node scripts/trip_transition_integrity.db.test.mjs` | **exit 1** — cases 1–14 PASS, then harness abort: `Invalid trip photo reference [SQL: ...persist_driver_job_offer_progress...]` on the valid job-scoped URL; cases 16–20 never reached |
| TO-130 DB proof (green, after fix) | `node scripts/trip_transition_integrity.db.test.mjs` | **exit 0 — 21/21 cases** (order/skip/backward, wrong/missing/locked OTP both codes, pickup-before-delivery, duplicate + serialized completion with one counter effect, forged `p_extra`/timestamps, ownership, cancellations, post-delivery immutability, photo scoping, direct OTP SELECT/UPDATE denial, privilege composition healing, customer-only code visibility, anon EXECUTE denial) |
| Unit suite | `npm test` | **exit 0 — 529/529 passed, 35 files** |
| Trip/earnings service tests | `npx vitest run src/services/customerSupabaseApi.test.ts src/services/driverTripProgress.test.ts` (cwd `frontend`) | **exit 0 — 64/64 passed** |
| Lint | `npm --prefix frontend run lint` | **exit 0** (`--max-warnings 0`) |
| Build+typecheck | `npm --prefix frontend run build` | **exit 0** |
| Packing regression | `npm run test:packing` | **exit 0 — 18 checks passed** |
| Server routing | `npm run test:server-routing` | **exit 0 — 10/10 pass** |
| Policy suites | `node --test scripts/{production_config_policy,deployment_safety,payment_readiness_policy,security_boundary_policy,supported_runtime_policy,production_config_audit,launch_gate_policy}.test.mjs` | **exit 0 — 70/70 pass, 0 fail** |
| Glue check | `node tools/glue-check.mjs` | **exit 0 — 0 gaps, 0 warnings** |
| Root production audit | `npm audit --omit=dev --audit-level=high` | **exit 0 — 0 vulnerabilities** |
| Frontend production audit | `npm audit --prefix frontend --omit=dev --audit-level=high` | **exit 0 — 0 vulnerabilities** |
| `created_at` audit | repo-wide scan of every `.select(` containing `created_at` + per-file review of the TO-138 commit | no `job_offers` hit remains (see above) |

## Evidence level

- **DB proof: PGlite tier — real PostgreSQL 18.3 (WASM) engine, real RLS, real `SET ROLE
  authenticated` + JWT-claims role switching, real table/column privilege checks, full
  35-migration chain replayed (now ending in the correction migration).** NOT the disposable
  Supabase stack: Docker is absent on this machine — `docker --version` → `command not found`;
  `where docker` (cmd) → no result; `C:\Program Files\Docker\Docker\resources\bin\docker.exe`
  → not found; `npx supabase status` → `failed to inspect container health: docker: command not
  found (podman also not found) — install Docker Desktop or Podman and ensure it is on PATH`
  (WSL `docker-desktop` distro is Stopped, no engine/CLI). Consequences, stated plainly:
  no PostgREST/GoTrue round-trips, no second connection (true concurrent transactions are
  covered by the sequential replay + `FOR UPDATE` case only), no browser trip proof.
- **Frontend: unit/vitest (jsdom) + typecheck/build.** No browser run this session.
- **Browser trip proof (brief-required): NOT RUN.** The TO-129 browser harness
  (`scripts/atomic_job_offer_response.browser-proof.mjs:26-27`) and the TO-129 RLS test
  (`scripts/atomic_job_offer_response.rls.test.mjs:8-10`) both require `npx supabase start`,
  which cannot run without Docker. No browser journey was faked or substituted.

## Remaining limitations / risks

- The photo-URL correction is proven at the SQL/RPC layer; the browser upload → persist flow was
  not re-run end-to-end (needs the local stack).
- The DB proof cannot execute two true concurrent transactions; the exactly-once guarantee rests
  on row locking (`FOR UPDATE OF jo`, then driver) plus the identical-status replay path, proven
  by the sequential case. A true two-connection concurrency run remains part of TO-134/TO-135.
- `TASKS.md` 2026-10-04 records the local disposable stack as absent; unchanged by this run.
- Not re-run by this worker: public/launch browser smokes, apps/web pytest, `scripts/
  atomic_job_offer_response.rls.test.mjs` (stack-gated). Prior-run parent-tree smoke evidence
  stands in `agent-results/020-result.md` history (commit `366a1e7b`).
- Untracked local state preserved and untouched: `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`,
  `closeout-logs/`, `.ai-work-factory/quality.json` (factory-managed file created during this
  session; not product code).

## Owner gates

None new. No hosted/production action was taken; no `supabase db push`; no secrets touched.

## Next smallest recommendation

GPT-6/supervisor review of the correction migration + 21/21 DB proof. Then TO-132 per the board
queue. When the disposable stack is rebuilt (TO-134/135/136), re-run
`scripts/atomic_job_offer_response.rls.test.mjs` and a trip browser proof to lift the two
stack-gated checks.

## Git state

- Branch `main`, single canonical checkout; no worktrees/branches created.
- This run: correction migration + `TASKS.md` row + this result file, committed together;
  TO-130 row set to AWAITING_REVIEW.
- Initial implementation remains at `023a2654` (already on `main`).
