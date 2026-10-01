# TO-131 result — Restore safe admin and agency error boundaries

**Verdict: PASS** (worker level — ready for GPT-6 review; does not authorize DONE, deployment or live changes).
**Date:** 2026-10-01 · **Branch:** `main` (single writer; no push) · **Brief:** `agent-tasks/021-safe-service-errors.md`

## What changed and why

Commit `04cf579c` ("Revert \"fix(services): stop surfacing raw provider error messages\"") restored the revert of `07fb8756`, re-opening two leak paths in the admin/agency portal service helpers (`getFunctionErrorMessage` in both files):

1. **Raw `error.message` passthrough** — any thrown error's message was surfaced to the user. Concretely, `FunctionsHttpError`'s message ("Edge Function returned a non-2xx status code"), `FunctionsFetchError`'s network message ("Failed to send a request to the Edge Function"), and any other error object's message reached `UserFacingError`, which UI helpers (`toUserFacingErrorMessage`) intentionally display via `toast.error(...)` (e.g. `frontend/src/pages/AdminUsersPage.tsx:97`).
2. **Arbitrary JSON `payload.error` passthrough** — the response body `error` string was trusted verbatim, so a misbehaving intermediate or non-portal JSON error body could inject SQL details, JWT-like strings, or provider internals into the UI.

**Why the approved tests expected provider messages:** the pre-revert test suites pinned the implemented passthrough contract — e.g. `adminSupabaseApi.test.ts` asserted `{ message: 'Function error' }` mock errors surface as `'Function error'` (15 assertions), and `agencyPortalApi.test.ts` did the same at its 7 `getFunctionErrorMessage` call sites. These messages were generic mock strings, not real provider payloads; the tests asserted behavior, not safety. The hardening commit `07fb8756` was reverted because it failed exactly those tests. Per the brief, only the unsafe assertions were updated (to pin the safe fallback contract); all other expectations were preserved. A red run before the implementation change proved the leak (18 failing new boundary tests showing e.g. `SQLSTATE 42703: relation "public.agency_jobs" does not exist...` as the thrown user message).

### Shared typed-code boundary — `frontend/src/utils/userFacingError.ts`

- `APPROVED_FUNCTION_STATUS_MESSAGES` — a finite, frozen mapping of approved server **typed codes** (HTTP status) to stable user messages:
  - `401` → `Your session has expired. Please sign in again.` (server: `Authentication is required.`, 401)
  - `403` → `You do not have permission to perform this action.` (server: `Access denied.` / `Admin access is required.`, 403)
  - `409` → `This account cannot be modified from this screen.` (server: `Portal admins cannot be disabled or deleted from this screen.` / `You cannot modify your own account from this screen.`, 409)
- `resolveFunctionUserMessage(error, fallbackMessage)` — returns the approved message **only** for an approved status on `error.context` (a `Response`); everything else returns the call site's context-specific fallback. Raw `error.message` and body `payload.error` strings are never trusted. Server 4xx validation strings (e.g. `agencyId is required.`) are developer diagnostics, not user actions — they fall back too (documented in-code).
- `reportFunctionFailure(scope, error)` — bounded diagnostics through the existing sanitized logging contract (`utils/logger.ts`, dev-only): logs only `[portal-api] <scope>: <ErrorName> (status N)`. Never logs messages, bodies, headers, or tokens. TO-132 will centralize production reporting on top of this contract.

### Service changes

- `frontend/src/services/adminSupabaseApi.ts` — deleted the local `getFunctionErrorMessage`; `invokeAdminFunction` now reports bounded diagnostics once per failure and resolves the user message via `resolveFunctionUserMessage(error, fallbackMessage)`. The catch path keeps its stable fallback for non-`UserFacingError` throws (network failures stay safe).
- `frontend/src/services/agencyPortalApi.ts` — same replacement at all 7 `getFunctionErrorMessage` call sites (`agencyDashboardApi.getSnapshot`, `agencyJobsApi.getAssignableDrivers`, `agencyJobsApi.getDriverLatestLocation`, `agencyDriversApi.getSnapshot/assignTruckToDriver/unassignTruck/createPayout`); all 20 `logger.error('[...]', rawError)` calls replaced with `reportFunctionFailure('<edge-function-name>', error)` and catches no longer double-log by re-reporting a rethrown `UserFacingError`. User-visible fallback strings are unchanged. `agencyRegistrationApi.register` already returned a fixed message and is untouched.
- **Direct-caller inventory** (per brief): all 15 consuming pages (`AdminAgenciesPage`, `AdminContactPage`, `AdminDashboardPage`, `AdminDriversPage`, `AdminPayoutsPage`, `AdminSubscriptionsPage`, `AdminUsersPage`, `AgencyBillingPage`, `AgencyDashboardPage`, `AgencyDriversPage`, `AgencyFleetPage`, `AgencyJobsPage`, `AgencyProfilePage`, `AgencyRatesPage`, `DriverDetailPage`) render errors via `toUserFacingErrorMessage(error, <their own fallback>)` or fixed strings; none branches on server message text (grepped for `error.message`/`.includes(` on error paths). No legitimate form depends on the removed passthrough.

### Regression gate

`scripts/security_boundary_policy.test.mjs` (allowed "if needed" — justified by the revert history) gains a source-level policy test: both service files must not contain `return payload.error` or `return error.message`, and must resolve messages through `resolveFunctionUserMessage`. This keeps the boundary from being silently re-reverted (mirrors the existing payment-boundary pattern).

### Changed files (all inside the brief's allowed scope)

| File | Change |
| --- | --- |
| `frontend/src/utils/userFacingError.ts` | New: approved typed-status mapping, `resolveFunctionUserMessage`, `reportFunctionFailure` (bounded diagnostics via `utils/logger`). |
| `frontend/src/services/adminSupabaseApi.ts` | Replaced raw passthrough with typed-code resolution; bounded single reporting. |
| `frontend/src/services/agencyPortalApi.ts` | Same at all 7 call sites; 20 raw-object log calls converted to bounded diagnostics; no double logging. |
| `frontend/src/services/adminSupabaseApi.test.ts` | New `safe error boundary (TO-131)` block (11 tests); 15 unsafe raw-message assertions updated to safe fallbacks. |
| `frontend/src/services/agencyPortalApi.test.ts` | New `safe error boundary (TO-131)` block (11 tests); 7 unsafe raw-message assertions updated to safe fallbacks. |
| `frontend/src/utils/userFacingError.test.ts` | Extended with `resolveFunctionUserMessage` coverage (approved codes map; arbitrary payload strings, raw messages, unknown shapes, non-Response contexts all fall back). |
| `scripts/security_boundary_policy.test.mjs` | New policy test: portal services must not pass raw strings to users. |

## Required-check evidence (brief: "Feed a SQL table/column detail, stack trace, JWT-like text, HTML provider response, malformed JSON, network failure and unknown error; none appears in the user message. Approved authorization/validation codes still map correctly.")

| Check | Command | Directory | Exit | Counts | Evidence class |
| --- | --- | --- | --- | --- | --- |
| RED (pre-fix) — new boundary tests fail against reverted code | `npx vitest run src/services/adminSupabaseApi.test.ts src/services/agencyPortalApi.test.ts` | `frontend/` | 1 | 18 failed / 100 passed (118); failures show SQL detail, JWT-like text, raw server messages thrown as user messages | mock |
| GREEN focused suites | `npx vitest run src/services/adminSupabaseApi.test.ts src/services/agencyPortalApi.test.ts src/utils/userFacingError.test.ts` | `frontend/` | 0 | 129 passed / 129 (51 + 67 + 11) | mock |
| Full unit suite | `npm test` (→ `cd frontend && npm run test:unit` / `vitest run`) | repo root | 0 | 28 files, 439 passed / 439 | mock |
| Build | `npm run build` (tsc && vite build) | `frontend/` | 0 | built; PWA precache 85 entries | local |
| Lint | `npm run lint` (eslint) | `frontend/` | 0 | 0 errors, 26 warnings (matches 2026-09-30 baseline; all warnings pre-existing `no-explicit-any` elsewhere) | local |
| Security policy tests | `node --test scripts/security_boundary_policy.test.mjs` | repo root | 0 | 2 pass / 0 fail (payment boundary + new portal boundary) | local (source-level) |

Threat-fixture coverage in the new tests (both services + utils): SQL table/column detail, stack-trace error message, JWT-like text, HTML provider response (`text/html` 502), malformed JSON body, network failure (`FunctionsFetchError`-style), unknown error shape (`{ code, details }`), non-Response context, and approved 401/403/409 codes mapping to the stable messages; a logging test asserts the dev log contains only scope + error kind + status and never the SQL detail/JWT/HTTP-error message. All unit evidence is mock-level (mocked `supabase.functions.invoke`); no staging or production claims are made.

## Assumptions

- The finite mapping keys on HTTP status (the typed code the portal Edge Functions actually emit, via `RequestError`/`handleRequestError` in `supabase/functions/_shared/portal-auth.ts:276-289`). If the server later adds explicit payload `code` fields, `APPROVED_FUNCTION_STATUS_MESSAGES` is the extension point.
- 409's stable client message is a deliberate paraphrase of the two server self-guard messages; 400 validation strings intentionally fall back (developer diagnostics, not user actions).
- Live behavior against deployed Edge Functions was **not** verified — no hosted Supabase project is available (standing owner gate, TO-114/TO-119).

## Unresolved risks / notes for reviewer

- Out-of-brief raw-message paths remain in other services — notably `frontend/src/services/supabaseApi.ts:96` (returns `error.message` in a legacy/local-mode helper) — outside this brief's allowed scope; recommend the supervisor decide whether TO-132's sanitized reporting covers them.
- `toUserFacingErrorMessage` still returns the message of trusted `UserFacingError` instances by design (that is its contract); safety now rests on services constructing `UserFacingError` only from approved codes/fallbacks, enforced by the new policy test for these two files.

## Owner gates

- No new owner gates were created by this task; none were executed. Live portal-function verification remains owner-blocked pending a hosted Supabase project (existing gate; not exercised here).

## Next smallest step

GPT-6 review of this result; on acceptance, TO-132 (safe error reporting/health proof) is unblocked — its reporting module can consume `reportFunctionFailure` as the caught-failure entry point.

## Git state at handoff

- Branch `main` at `8163bbc0` + 1 commit (this task; not pushed — push is owner-gated per policy).
- Commit: `fix(services): restore safe admin/agency error boundaries via approved typed codes (TO131)`.
- Pre-existing untracked items preserved untouched: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/` (recorded in TASKS.md as parked for TO-140).
- No other working-tree changes; no branches, worktrees, or stashes created.
