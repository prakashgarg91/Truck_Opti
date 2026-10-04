# TO-130 — Verify and repair trip transitions and OTP enforcement — result

**Status:** AWAITING_REVIEW (implementation complete on the working tree and committed; browser-journey re-verification deferred — see limitations)
**Date:** 2026-10-04 · **Writer:** GLM-5.3 Flash worker (interrupted mid-task by run stop; closeout completed by session supervisor) · **Brief:** `agent-tasks/020-trip-transition-integrity.md`

## Problem and resulting behavior

`persist_driver_job_offer_progress` (migration `20260730110000`) had five proven defects:

1. **Replay double-count** — `total_trips` incremented on every call whose resulting status was `delivered`, so replays inflated payout/earnings counters.
2. **No ordering** — any status could be written in any order (skips, reruns, backward moves).
3. **Unlimited OTP guessing** — no attempt bound on the 4-digit pickup/delivery codes.
4. **Forgeable chronology** — client-supplied timestamps in `p_extra` were written verbatim and doubled as undocumented transition triggers.
5. **Unrestricted photo paths** — `photo_loading_url`/`photo_delivery_url` accepted arbitrary strings.

Resulting behavior was an unauthorized, unordered, replay-amplifiable lifecycle that the board queue (2026-10-02 review, carried defect from `6f15554f`) required closed.

## Changed files (working tree → committed this run)

- `supabase/migrations/20261004000000_trip_transition_integrity.sql` (new) — ordered single-step transitions, durable per-code attempt counters reported via `result_code` (failure path commits instead of raising), server-clock timestamps only (`p_extra` timestamps ignored), photo URLs restricted to this job's own `trip-photos/<driver user>/<job>/` storage path, exactly-once delivery effects (idempotent replay returns the same terminal row without re-incrementing).
- `scripts/trip_transition_integrity.db.test.mjs` (new) — behavioral proof on PGlite (PostgreSQL 18.3 WASM): replays the full 34-file migration chain, drives the real SECURITY DEFINER RPCs under `SET ROLE authenticated` with real RLS/privilege checks. Closeout fix: `expectError` now matches the message prefix (PGlite appends `" [SQL: ...]"` engine context to driver-level errors).
- `frontend/src/services/driverTripProgress.ts` — server `result_code` protocol (`OK` / `OTP_INCORRECT` / `OTP_LOCKED`), `isJobProgressOk`, bounded failure copy (`resolveJobProgressFailureMessage`); raw server text never shown.
- `frontend/src/services/driverTripProgress.test.ts` — tests for the result-code protocol and copy.
- `frontend/src/pages/DriverTripPage.tsx` — consumes result codes; OTP failure renders attempt-bounded copy, never patches local state on rejection. Closeout fix: explicit null narrowing before `buildJobProgressStatePatch` (TS2345 from the interrupted writer).
- `frontend/src/pages/TrackingPage.tsx` — customer tracking reads the authoritative progress/result fields.
- `frontend/src/services/customerSupabaseApi.ts` + `.test.ts` — tracking/service types carry `result_code`/`otp_attempts_remaining`.
- `frontend/src/types/database.types.ts` — regenerated for the new RPC shape.

## Exact verification (commands → exit codes/counts)

Run on the tree including this work (2026-10-04):

| Check | Command | Result |
|---|---|---|
| Unit suite | `npm test` | exit 0 — **529/529 passed** (35 files) |
| Lint | `npm --prefix frontend run lint` (`--max-warnings 0`) | exit 0 |
| Build+typecheck | `npm --prefix frontend run build` | first run exit 2 (TS2345 above) → fixed → **exit 0** |
| Packing regression | `npm run test:packing` | exit 0 — 18/18 checks |
| Server routing | `npm run test:server-routing` | exit 0 |
| Policy suites | `node --test scripts/{production_config_policy,deployment_safety,payment_readiness_policy,security_boundary_policy,supported_runtime_policy}.test.mjs` | exit 0 (ran via workflow `world.run` on parent tree `1a7af17d`) |
| Glue check | `node tools/glue-check.mjs` | exit 0 (parent tree `1a7af17d`) |
| Prod audits | `npm audit --omit=dev --audit-level=high` (root, frontend) | exit 0 / exit 0 |
| TO-130 DB proof | `node scripts/trip_transition_integrity.db.test.mjs` | **14/15 PASS**; test 15 FAILS — see open finding |

Browser-tier evidence on the parent tree (`1a7af17d`, pre-TO-130), recorded by the run's runtime prover: public smoke **12/12 exit 0**, launch smoke **63/63 exit 0** (local-first verdict; the dead `.env.local` set-aside recipe was applied and restored), apps/web Python auth tests **6/6 exit 0**.

## Remaining limitations

- **Open finding for supervisor review (test 15):** the photo-URL acceptance case raises `Invalid trip photo reference` where the test expects a job-scoped `trip-photos/<user>/<job>/` URL to be accepted. 14/15 behavioral checks PASS — ordered happy path, skip/backward rejection, wrong/missing/locked OTP handling with 5-attempt/15-minute bound and success reset, pickup-before-delivery, duplicate-completion exactly-once (sequential and `FOR UPDATE`-ordered), forged `p_extra` and client-timestamp immunity, own-vs-other driver ownership, terminal cancellations, post-delivery immutability. The failing case is either a fixture mismatch (URL built against `drivers.id` instead of the driver's `user_id`) or an `is_job_trip_photo_url` strictness bug; unresolved in this run's closure budget.
- Two closeout fixes were made by the supervisor to land the writer's interrupted work: harness prefix-matching in the DB test (`expectError`), explicit null narrowing in `DriverTripPage.tsx`, and the missing `result_code`/`otp_attempts_remaining` OUT-param assignment in the migration's OTP-failure return (proven by tests 4-5 going green).
- The TO-130 DB proof is **PGlite-tier** (real Postgres engine, real RLS/privileges, full 34-migration replay) — not the disposable Supabase stack (no PostgREST/GoTrue; the stack is currently absent from this machine: no containers, `supabase` CLI not installed). Labeled as such in the test header.
- Browser journey for the OTP-gated trip flow was not re-verified in a browser after the service change (run budget closed); smokes on the parent tree plus unit-tier coverage stand in until TO-134/TO-135 journey proofs.
- Supervisor review pending — status is deliberately AWAITING_REVIEW, not DONE.

## Next smallest recommendation

Supervisor review of the migration + DB proof; then TO-132 (`agent-tasks/022-sanitized-observability.md`) per the queue.
