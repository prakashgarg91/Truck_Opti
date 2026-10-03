# TO-129 Result — Make driver offer acceptance atomic and reachable

**Date:** 2026-10-03
**Worker:** GLM-5.3 Flash (bounded slice, primary checkout `D:/Github/Truck_Opti`, branch `main`)
**Status:** implementation complete; AWAITING_REVIEW (GPT-6). A worker PASS does not authorize DONE, deployment or live changes.
**Evidence level:** **local DB (real RLS + real browser)** for the offer-acceptance journey; **mock (vitest/jsdom)** for frontend units. No staging/production evidence was produced or claimed.

## What changed and why

The OTP-hardening migration `20260730110000` dropped the driver UPDATE policy on `job_offers`, so the shipped browser flow — a direct `job_offers` UPDATE followed by a second direct `drivers.active_job_id` UPDATE — was both unauthorized and non-atomic. This slice replaces both browser writes with one trusted server transaction and repairs the RLS read path that made the offer modal unreachable in the first place.

### 1. `supabase/migrations/20261003010000_atomic_job_offer_response.sql` (new)

`respond_to_job_offer(p_job_offer_id uuid, p_accept boolean, p_decline_reason text default null)` — `SECURITY DEFINER`, `EXECUTE` to `authenticated` (platform default privileges also grant `anon`/`service_role`, same as the sibling RPCs; the in-function `auth.uid()` driver lookup is the functional boundary — anon gets a rejection with no side effects, proven in RLS case 13).

Inside one transaction it:
- resolves the signed-in driver from `auth.uid()` (ownership never from client input);
- locks the offer row `FOR UPDATE` first, then the driver row (same order as `persist_driver_job_offer_progress`, avoiding deadlock interleaving);
- verifies driver approval, pending state, expiry (`expires_at <= now()` → rejection), and conflicting active trip (`drivers.active_job_id` for a different offer → rejection);
- on accept: writes `job_offers.status='accepted'`, `responded_at` and `drivers.active_job_id` together;
- on decline: writes `status='declined'`, `responded_at`, optional `decline_reason` (UI does not send a reason; parameter kept nullable for forward use);
- is idempotent: duplicate accept (offer accepted AND still the active job) and duplicate decline return the authoritative state without writing; decline-after-accept and accept-after-decline raise distinct controlled errors;
- returns `(offer_id, offer_status, responded_at, active_job_id)` — the authoritative state;
- every rejected path raises a controlled exception, so a zero-row result can never be reported as success by a caller.

### 2. `supabase/migrations/20261003020000_driver_offer_read_visibility.sql` (new — blocker discovered and repaired)

**Discovery (red evidence):** the live shipments read policy was `shipments_select_own (auth.uid() = created_by)` only, and the `job_offers` stakeholders policy EXISTS-checks over `shipments` with RLS applied inside the policy subquery. Proven on the local stack: a driver's own pending-offer query returned `[]` and the browser dashboard never showed the modal — acceptance was unreachable regardless of the response transaction. This confirms the coverage row "no executed or DB/RLS-level evidence that a pending offer is actually visible to its driver" as a real defect, not just missing evidence.

**Fix:** `is_shipment_driver(p_shipment_id)` — `LANGUAGE sql STABLE SECURITY DEFINER` (house pattern, cf. `is_admin_user`) — plus a `shipments` SELECT policy `USING (public.is_shipment_driver(id))`. Because the helper bypasses RLS inside, the shipments↔job_offers policy pair does not recurse: a naive policy that subqueries `job_offers` directly was tried first and failed with SQLSTATE 42P17 "infinite recursion detected in policy" (reproduced, then rejected — kept out of the tree).

### 3. `frontend/src/services/customerSupabaseApi.ts`

- `respondToJobOffer(jobId, accept, declineReason?)` now calls the RPC and returns a typed `JobOfferResponse` (`offerId`, `offerStatus`, `respondedAt`, `activeJobId`). A PostgREST error or a zero-row/empty payload both throw `UserFacingError` — never silent success.
- Controlled server exceptions map to approved user-facing messages (`JOB_OFFER_RESPONSE_ERROR_MESSAGES`); unmapped provider internals fall back to "Failed to respond to job" (TO-131 contract — raw SQL errors never reach the UI).
- Removed `setActiveJob` (the second browser write); it had no remaining callers.

### 4. `frontend/src/pages/DriverDashboardPage.tsx`

`respondToJob` performs ONE authorized RPC call, toasts the outcome via `toUserFacingErrorMessage`, refreshes driver/history, and on acceptance navigates to the existing trip route `/driver/trip/${result.activeJobId}` (authoritative id from the server). No extra job-offer page was built; realtime subscription and modal dismiss behavior are untouched.

### 5. Tests

- `frontend/src/services/customerSupabaseApi.test.ts` — `respondToJobOffer` block rewritten (6 cases): RPC call shape, accept/decline authoritative return, decline reason passthrough, controlled-message mapping, unmapped-internals fallback, zero-row-as-failure; also asserts `from()` is no longer called for responses.
- `frontend/src/pages/DriverDashboardPage.test.ts` (new, jsdom, real component + router): pending offer modal renders with pickup/fare; Accept calls the response once and lands on `/driver/trip/offer-777`; Decline calls with `accept=false` and never navigates.
- `scripts/atomic_job_offer_response.rls.test.mjs` (new) — behavioral suite against the disposable local Supabase (real GoTrue sign-ins, real PostgREST, real RLS): 15/15 cases (matrix below).
- `scripts/atomic_job_offer_response.browser-proof.mjs` (new) — full browser journey against the local stack: 4/4 steps + screenshots (`screenshots/to129-atomic-accept/01..03*.png`).
- `frontend/src/types/database.types.ts` — regenerated from the verified local schema (`npx supabase gen types typescript --local`; adds `respond_to_job_offer`, `is_shipment_driver`); provenance header updated.

## Required-check matrix (brief) → executed evidence

| Brief case | Evidence (all against real local RLS unless noted) |
|---|---|
| valid accept | RLS case 1 (+ browser step 3/4 end-to-end) |
| valid reject/decline | RLS case 4 (reason persisted) |
| unauthorized driver | RLS case 5 (rejected, offer untouched) |
| expired offer | RLS case 6 (server-side, not the client countdown) |
| suspended/unapproved driver | RLS case 7 (accept AND decline rejected) |
| duplicate click / realtime duplicate | RLS cases 2, 4 (sequential replay) and 12 (concurrent same-offer accepts: both succeed idempotently, single write). The realtime websocket itself was not driven; the client-side realtime dismiss logic is unchanged, and the server contract for a duplicate response is the idempotent replay proven here. |
| two concurrent accepts | RLS case 11 (different offers, same driver: exactly one wins with active-trip conflict) and case 12 (same offer) |
| zero-row result | RLS case 8 (unknown id → rejection) + service-level zero-row test |
| active-trip conflict | RLS case 10 (+ case 11's loser) |
| driver offer visibility | RLS cases 14–15 (own offer + shipment readable, others' not; no 42P17 recursion) |
| old direct-UPDATE path stays dead | RLS case 3 (driver-token PATCH `job_offers` → 403) |

## Exact commands and exit codes

All run in this session on the primary checkout (frontend via repo root):

| Command | Result |
|---|---|
| `npx --yes supabase@2.119.0 start` | exit 0 (disposable local stack) |
| `npx --yes supabase@2.119.0 db reset` | exit 0, **33/33 migrations applied** incl. both new ones (ran twice: before/after visibility migration) |
| `node scripts/atomic_job_offer_response.rls.test.mjs` | exit 0, **15/15 cases PASS** (final run) |
| `node scripts/atomic_job_offer_response.browser-proof.mjs` | exit 0, **4/4 steps PASS** (env files held as `*.sync-hold` during run, sha256-verified byte-identical restore; git status clean for both after) |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run lint` | exit 0 |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run test:unit` | exit 0, **35 files / 527 tests passed** |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run build` | exit 0 |
| `npx --yes supabase@2.119.0 gen types typescript --local` | exit 0 (types regenerated from verified schema) |
| `npx --yes supabase@2.119.0 stop --no-backup` | exit 0 (disposable volume destroyed; nothing shared touched) |

Red→green regression evidence for the visibility blocker: driver pending-offer query returned `[]` before `20261003020000` (probe transcript in session) and exactly the driver's own row with shipment summary after; browser debug screenshot `screenshots/to129-atomic-accept/debug-modal-timeout.png` shows the pre-fix dashboard with no modal, `02-offer-modal.png`/`03-trip-page.png` show the post-fix journey (modal with pickup/drop/800 kg/₹3,600/countdown; toast "Job Accepted!" + Active Trip page with real shipment details).

## Browser transport note

The app is https-only by design (`authCapabilities.ts` rejects http/localhost/`.local`; TO-124 fail-closed), so the browser proof serves a local self-signed TLS reverse proxy on `127.0.0.1:5443` forwarding to local Kong (`127.0.0.1:54321`); `VITE_SUPABASE_URL=https://127.0.0.1:5443` is accepted by the validator. Application code, schema, RLS, GoTrue and data are all the real local ones. Realtime websockets are not proxied, so the modal appears via the mount/focus hydration path (same read, same data). The proof script is self-contained and rerunnable when a hosted staging backend exists.

## Unresolved risks / honest notes

1. **Platform EXECUTE grants:** Supabase default privileges grant EXECUTE on every new function to `anon`/`authenticated`/`service_role`; `REVOKE ... FROM PUBLIC` does not remove them. Identical to the verified sibling RPCs; the functions reject unauthenticated callers internally (case 13). A `REVOKE EXECUTE FROM anon` hardening pass could cover all RPCs uniformly — left out to match the house pattern (TO-130 may consolidate).
2. **Drivers "own record" FOR ALL policy** still lets a driver client self-update any drivers column (e.g. `status`, `total_trips`). Pre-existing, outside this brief; flagged for the owner/TO-136 (admin authority and final database policies).
3. **No production path creates `job_offers`** (agency dispatch writes `agency_jobs` only) — pre-existing coverage gap on its own board row (TO-135 dispatch loop). This slice makes acceptance work for any offer row that exists.
4. RPC arg matching: right after `db reset`, a 2-arg RPC call once hit a stale PostgREST schema cache (PGRST202); the shipped client always sends all three arguments, and every harness case passes on a warm cache. Noted as an operator nuance, not a defect.
5. `decline_reason` is accepted server-side but the UI does not collect it (no such requirement in the brief).

## Owner gates (not executed, per contract)

- Applying the two new migrations to the hosted Supabase project (`supabase db push`) — production change, owner-authorized only. The migration chain was verified by full local replay instead.
- Any hosted/staging browser evidence beyond the local stack.

## Git state at handoff

Branch `main`, one cohesive commit (see commit SHA in the slice result), pushed nowhere (orchestrator pushes). Untracked/non-task items left untouched as instructed: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`, plus pre-existing `.serena/`, `agent-results/completion-truth-20261002.md`, `agent-results/functional-coverage.md`. Local Supabase stack stopped; no worktrees/branches/stashes created; env files `frontend/.env` / `frontend/.env.local` verified byte-identical after the browser run.

## Next recommendation

GPT-6 review of the two migrations (especially the SECURITY DEFINER read helper vs. the dropped naive approach) and the removed `setActiveJob` surface. Then TO-130 (trip transition integrity + OTP enforcement) can reuse `scripts/atomic_job_offer_response.rls.test.mjs` as the harness pattern; TO-135 still owns the missing production offer-creation path.
