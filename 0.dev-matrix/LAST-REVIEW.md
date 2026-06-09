# LAST-REVIEW.md — Preliminary Completion Pre-Review

- Date: 2026-06-05
- Reviewer: minimax-m3-free (opencode free review lane, pre-DeepSeek-V4-Pro sign-off)
- Mode: pre-completion, low-cost, scope-bounded
- Regression proof submitted: `npm test` (i.e. `cd frontend && npm run test:unit --`) PASS
- Verdict line: `FINAL_REVIEW_VERDICT: changes-required`

## Scope Of This Pre-Review

- Boot docs: `0.dev-matrix/STATE.md`, `0.dev-matrix/INDEX.md`, newest `0.dev-matrix/AI-HANDOFF.md`, `0.dev-matrix/TASK.md`, `0.dev-matrix/AI-TASKS.json`, `0.dev-matrix/LAUNCH_CHECKLIST.md`, `0.dev-matrix/FRAME-PORTFOLIO-RULES.md`.
- Runtime entrypoints named by those docs: `frontend/` (Vite/React), `server.js` (Express, Heroku prod), `apps/web` (Flask + 3D packer), `supabase/functions/*` (edge functions), `apps/desktop/TruckOptimum/app.py` (PyWebView desktop).
- Proof artifacts: `0.dev-matrix/test-reports/launch-check-20260529_220254.log`, `0.dev-matrix/test-reports/live-auth-proof.json`, `0.dev-matrix/test-reports/live-admin-proof.json`, `0.dev-matrix/test-reports/webwright-full-app-2026-06-01.md` (+ `summary.json`), `0.dev-matrix/test-reports/launch-check-status.json`, `0.dev-matrix/test-reports/session-start-maintenance-20260605_202346.log`, `0.dev-matrix/LAST-CLOSEOUT.md`.
- Working tree: `git status` against commit `c01d3fc1` (local-only, not pushed to `origin/main`).

## What The Submitted Regression Actually Proved

`npm test` -> `cd frontend && npm run test:unit --` -> `vitest run`. Three test files exist under `frontend/src/services/`:

- `driverTripProgress.test.ts` (3575 bytes)
- `jobOfferOtpContract.test.ts` (5008 bytes)
- `razorpayPayment.test.ts` (8229 bytes)

Per the 2026-06-01 AI-HANDOFF the last full lane result was `22/22` PASS (16 prior + 6 new for the OTP contract). It is correct that `npm test` is green. It is also correct that this lane is narrow: it covers two risky helpers (`initiateRazorpayPayment` and `persistJobProgress`) and the new OTP contract. It does NOT cover:

- Any React route (`/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy`).
- The deployed host at `https://www.truckopti.in`.
- `apps/web` Python surface.
- `supabase/functions/*` edge functions.
- `server.js` Heroku static + SPA fallback.

## Truth Reconciliation Against The Runnable State

### 1. CRITICAL — Five production routes return 404 on `truckopti.in`

Direct evidence: `0.dev-matrix/test-reports/webwright-full-app-2026-06-01.md` steps 04-08 (run 2026-06-01, 0 console errors, 0 4xx/5xx, deterministic Playwright + Webwright `LocalBrowserEnvironment`). The five routes are:

- `/login`
- `/signup`
- `/forgot-password`
- `/terms`
- `/privacy`

All five returned `TITLE=404 - Page Not Found` and `H1=Page not found`. Source-of-truth mismatch: `frontend/src/App.tsx` lines 102, 103, 115, 116, 118 declare all five routes (`/login`/`/signup`/`/forgot-password` are eagerly imported; `/terms` and `/privacy` are `React.lazy`). The Vite/React shell expects `BrowserRouter` (verified at `frontend/src/main.tsx:51`). The Heroku static server `server.js` has the SPA fallback `app.get('/{*splat}', ...)` and a per-asset cache policy, and the last reported Heroku release is `v91` (2026-05-17).

The most plausible cause is a deployment drift: the live `frontend/dist` predates at least one of these route additions OR the current Heroku `frontend/dist` was rebuilt from a snapshot SHA that did not include the latest `App.tsx` (this matches the historical Heroku release pattern captured in `0.dev-matrix/AI-HANDOFF.md` for `v73`/`v88`/`v90`/`v91`).

This is a real user-journey break. The smoke driver marked these as `PASS (route 404)` because it asserts the title/H1 rather than treating 404 as a fail. The smoke gate therefore passes while the live host is broken.

### 2. CRITICAL — Deployed login path contradicts the launch checklist

Direct evidence: webwright step 10 shows `/login` -> "Welcome Back - TruckOpti" -> the only actionable button is the Google OAuth launcher -> `accounts.google.com/v3/signin/identifier?...client_id=...jbxncejtcbpcronndqlx.supabase.co...`. `OTP_INPUT_BOXES=0` on the Google page.

`frontend/src/pages/auth/LoginPage.tsx` (lines 19, 560, 618) shows that the email OTP path is the default (`VITE_AUTH_EMAIL_OTP_ENABLED !== 'false'`) and the page renders explicit copy: "Phone OTP is disabled in this environment. Use Email OTP or Google login." Source: `frontend/src/pages/auth/LoginPage.tsx:618-621`.

Three compatible explanations exist:
- (a) `VITE_AUTH_EMAIL_OTP_ENABLED=false` was set in Heroku at build time.
- (b) The deployed bundle predates the email OTP code.
- (c) The email OTP button is hidden by a runtime condition the smoke driver did not exercise.

`0.dev-matrix/LAUNCH_CHECKLIST.md` row 2.1 says "OTP login (Email live; phone deferred)" and the 2026-05-13 launch audit (`Copilot-073`) treats email OTP as the live launch surface. The webwright 2026-06-01 finding therefore contradicts the public launch checklist, and the repo has not yet picked a path forward.

### 3. Working tree is dirty with unvalidated code changes

`git status --short` against `c01d3fc1` shows the following uncommitted code changes (not governance-doc regeneration):

- `apps/web/app/cost_engine.py` (+8/-8)
- `apps/web/app/packer.py` (+33/-33, 66 total)
- `apps/web/app/routes.py` (+1/-1)
- `apps/web/tests/test_drill_down_api.py` (+5/-3)
- `apps/web/tests/test_enhanced_features.py` (+91/-121, 212 total)

`graphify-out/graph.html` is also dirty (regenerated). The `0.dev-matrix/` dirty set is mostly line-ending (CRLF) and frame-regeneration noise from `0.dev-matrix/FRAME-PORTFOLIO-RULES.md`. Two untracked directories: `outputs/` and `webwright-test/` (`probe_*.py`, `smoke_*.py`, `test_*.py`, `model_minimax_m3.yaml`).

The `apps/web` Python changes are unvalidated. The most recent `apps/web` focused pytest lane was `tests/unit/test_authentication_middleware.py -q` on 2026-05-01 (`6/6` PASS); nothing has rerun against the dirty Python tree. The most recent launch-check `0.dev-matrix/test-reports/launch-check-20260529_220254.log` was a different dirty tree and was `2 GATE(S) FAILED` (root `npm audit` 1 moderate, STATE.md stale >7 days).

### 4. Launch-check status is stale and was already failing before today

`0.dev-matrix/test-reports/launch-check-status.json` last wrote on 2026-05-29 with `state: "failed"`, `exitCode: 2`, and the log shows the 2-gate failure (npm audit + STATE.md freshness at 11 days). The current `STATE.md` was modified 2026-06-01, so the STATE.md gate should now be fresher, but no launch-check has actually rerun on the current tree. The 2026-05-29 failure to launch-check after 2026-06-01 OTP migration work means the most recent verified repo-side gate is at least 7 days old.

### 5. New 4-digit OTP migration is not applied to any real Supabase project

The new `supabase/migrations/20260601223849_fix_job_offer_otp_length_4digit.sql` (`generate_4digit_otp()`, `job_offers_enforce_4digit_otp()` BEFORE INSERT/UPDATE trigger, and two CHECK constraints) is committed in `c01d3fc1` but the AI-HANDOFF explicitly states it has not been applied. The trigger / CHECK / contract exists in the file and in the vitest contract test, but no `public.job_offers` row has yet been exercised against it. Risk: a malformed 4-digit input could still slip into the driver pickup/delivery flow if the database contract is not actually applied to the live project.

### 6. CRG incremental update reported zero structural changes

`session-start-maintenance-20260605_202346.log` reports: `Incremental: 26 files updated, 0 nodes, 0 edges (postprocess=full)`. The 26 files are dev-matrix docs and `apps/web` Python files; CRG does not index those by default. This is expected behaviour for the current touched set, but it does mean the review cannot lean on CRG for blast-radius confirmation of the uncommitted `apps/web` Python edits.

### 7. `npm test` does NOT cover the user-journey breaks

`npm test` covers two helpers and the OTP contract. The two real production breaks (5x 404 routes; Google-OAuth-only login) are entirely outside this lane. A green `npm test` therefore does NOT mean the live host is healthy.

## Items That Are NOT Issues

- `0.dev-matrix/AI-TASKS.json` shows `TO-101`..`TO-106` as `completed`. The sellable launch-proof queue is genuinely closed.
- `frontend/src/lib/packing.ts` 4-digit contract (`DriverTripPage.tsx` 4-digit UI vs `OTPPage.tsx` 6-digit email UI) is correct as two distinct flows.
- `npm test` actually passes. The reported counts (22/22) match the 3 test files.
- Webwright full-app smoke 2026-06-01 was deterministic (`0 console errors`, `0 4xx/5xx`). The smoke driver is a sound Playwright harness; it just does not assert that a 404 is a fail.
- `LAST-CLOSEOUT.md` (2026-05-18) records `10 pass, 0 fail` for that day's close-day path. The reviewer's concern is the 18 days between then and now, not that closeout was wrong on the day.

## Decision

The repo is NOT ready to escalate to the configured final DeepSeek-V4-Pro sign-off. The launch slice is technically complete on the queue, but the live hosted surface has at least two user-journey breaks that the `npm test` lane does not catch and that have not yet been reopened as queue work. Recording the verdict as `pass` would let the final review gate bless a broken production state.

`FINAL_REVIEW_VERDICT: changes-required`

## Follow-up Work To Reopen In The Queue (Truth Reconciliation)

The exact follow-up work has been written back into the repo truth:

- `0.dev-matrix/AI-TASKS.json` — new tasks `TO-107`, `TO-108`, `TO-109`, `TO-110` (see JSON).
- `0.dev-matrix/TASK.md` — `TO-107..TO-110` queued and `Last-Cycle Truth` block updated to reflect the 2026-06-05 pre-review.
- `0.dev-matrix/STATE.md` — current-truth note at the top calling out the 5x 404 routes, the Google-OAuth-only login, the dirty `apps/web` tree, the stale launch-check, and the unapplied 4-digit migration.
- `0.dev-matrix/AI-HANDOFF.md` — new pre-review handoff entry dated 2026-06-05 with `Changed:`, `Verified:`, `Operational proof:`, `Continue from:`, `Next step:`, `Blockers:`.

## Owner-Side Reminder

These are the two external blockers the pre-review does NOT change (carried forward from prior handoffs):

- Live Razorpay production keys (T-110 in `TASK.md`).
- Auth proof credentials/session for repeatable authenticated live proof (T-127).

Both are owner-side and intentionally outside AI scope.

## User-Side Recommendation

Before any `FINAL_REVIEW_VERDICT: pass` is recorded, the next AI session should:

1. Pick `TO-107` and reproduce the 5x 404 on a local preview (`cd frontend && npm run preview`) to confirm whether the cause is Heroku bundle drift or a code regression. If it reproduces locally, the cause is a code regression in `App.tsx`; if it does not, the cause is a Heroku bundle drift and a clean redeploy is the fix.
2. Pick `TO-108` and read the Heroku build env (`heroku config --app truck-opti-app-efabf95bd306`) to confirm whether `VITE_AUTH_EMAIL_OTP_ENABLED` is set to `false` in production, or whether the deployed bundle predates the email OTP code.
3. Pick `TO-109` and apply the new migration to a non-prod Supabase project, insert a `public.job_offers` row with NULL OTPs, and confirm the trigger fills 4-digit values and the CHECK constraints reject malformed inputs.
4. Pick `TO-110` and either commit or explicitly park the 5 uncommitted `apps/web` Python changes after a focused pytest rerun.

Only after all four are GREEN should this repo be reconsidered for the final review gate.

## TO-107 Build-Lane Follow-up (2026-06-07 — minimax-m3-free)

The build lane executed the TO-107 queue card against the bounded slice and confirmed the pre-review's deploy-drift hypothesis. The full evidence and audit live in `0.dev-matrix/frame-artifacts/TO-107/BUILD-RESULT.md`; the key points are:

- **Falsifying read (local vs live)**: `frontend/dist` was rebuilt locally on 2026-06-07 17:24 and contains the fresh route chunks `index-BSupIPtU.js` (eager auth), `TermsPage-yCHmTVku.js`, `PrivacyPage-ChHSuXaP.js`, plus `sw-v2.js`. The local dist has every chunk needed for the five broken routes; the React tree in `frontend/src/App.tsx` declares all five; the SPA fallback in `server.js` is in place. The bounded-slice code path is sound.
- **Live-host confirmation**: re-running `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` against `https://www.truckopti.in` on 2026-06-07 reproduced the 5x 404 in steps 04-08 (`TITLE=404 - Page Not Found` / `H1=Page not found` for `/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy`). The 13/13 step count is unchanged from the 2026-06-01 pre-review baseline.
- **Bounded-slice edit**: the only code change inside the queue ownerFiles slice was a tiny wiring improvement in `server.js` — adding `Pragma: no-cache` and `Expires: 0` to the SPA fallback response alongside the existing `Cache-Control: no-cache, no-store, must-revalidate`, for HTTP/1.0 intermediate-proxy compatibility. The `setStaticCacheHeaders` SW/manifest/assets/default branches were not modified; the `App.tsx` route table was not modified; the `main.tsx` SW registration was not modified.
- **Conclusion**: the live-host 5x 404 is an operational/deploy blocker (Heroku bundle drift), not a bounded-slice code defect. The repo-side action is a clean Heroku redeploy of the fresh `frontend/dist` from a reviewed commit. The smoke script still marks the 5x 404 steps as `PASS (route 404)` because it asserts the title/H1 rather than treating 404 as a fail, but that script is outside the bounded slice and the scout said not to widen scope to it.

The `FINAL_REVIEW_VERDICT: changes-required` line above remains correct — the live hosted surface is still broken — but the TO-107 follow-up narrowed the cause to deploy drift and recorded the bounded-slice audit result. Final review sign-off is still gated on a clean redeploy closing the 5x 404 on `https://www.truckopti.in`.

## TO-107 Review-Lane Rejection (2026-06-07 — minimax-m3-free)

Reviewer ran the narrowest executable proof (`d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py`) at `2026-06-07T17:46:30+0530` after reading the build artifact. Result: 13/13 PASS at the smoke-driver level, but **steps 04-08 (login, signup, forgot-password, terms, privacy) STILL return `TITLE=404 - Page Not Found / H1=Page not found` on `https://www.truckopti.in`**. The bounded-slice code audit (App.tsx, main.tsx, server.js) is correct — all five routes are declared, `BrowserRouter` is in place, and the SPA fallback with cache headers is sound. The blast radius of the build's actual change (2 cache headers on 1 SPA fallback handler) is minimal. But the user-journey break is NOT closed because no Heroku redeploy or smoke-script widening was performed. Diagnosis of Heroku bundle drift is plausible (7 unpushed local commits, last Heroku release v91 on 2026-05-17) but not proven — the build did not run `npm run preview` to confirm local resolution or `git push heroku main` to confirm a clean redeploy closes the 5x 404. The build's own conclusion agrees: "TO-107 is **not** marked done by this build pass; the final review gate still needs either a clean redeploy or a smoke-script assertion widening." Review verdict: **REJECT** (changes-required). TO-107 stays `active` in `0.dev-matrix/AI-TASKS.json`. Build lane must either (a) trigger a clean Heroku redeploy from a reviewed commit + re-run the smoke script and confirm steps 04-08 resolve to owned pages, or (b) widen scope to fix `scripts/webwright/full_app_smoke.py` so the 5x 404 steps fail loudly. Full review artifact: `0.dev-matrix/frame-artifacts/TO-107/REVIEW-RESULT.md`. `FINAL_REVIEW_VERDICT: changes-required` remains correct; final review sign-off is still gated on closing the 5x 404 on the live host.

## TO-107 Review-Lane Re-Rejection (2026-06-07T17:55 IST — minimax-m3-free)

Re-ran the same review lane against the unchanged build submission (no new in-slice code edit since the prior rejection at 17:46 IST). Diff re-checked: `git diff --stat HEAD -- server.js frontend/src/App.tsx frontend/src/main.tsx` still shows only `server.js | 2 ++` (the `Pragma: no-cache` + `Expires: 0` additions). `App.tsx` and `main.tsx` are clean against the queue boundary. The freshest proof re-run: `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` at `2026-06-07T17:55:07+0530` (raw stdout at `0.dev-matrix/test-reports/webwright-full-app-2026-06-07-to107-review-rerun/smoke.log`, `summary.json` re-written with `generated_at: "2026-06-07T17:55:07+0530"`) returned 13/13 PASS at the smoke-driver level but **steps 04-08 STILL return `TITLE=404 - Page Not Found / H1=Page not found` on `https://www.truckopti.in`**. The bounded-slice code audit (App.tsx routes declared, main.tsx BrowserRouter, server.js SPA fallback with the corrected cache headers) is still correct. The blast radius of the build's actual change (2 cache headers on 1 SPA fallback handler) is still minimal. But the user-journey break is NOT closed because no Heroku redeploy or smoke-script widening was performed. MCP re-check (canonical names with full prefix and `_tool` suffix): `code-review-graph_get_minimal_context_tool` → `Risk: high (0.80), 3 changed files, key entities App/AppContent/RoleHome/App.tsx/main.tsx, flows affected: App/PackingPage/register` (architectural, not behavioral — App.tsx was not edited); `code-review-graph_get_impact_radius_tool` (max_depth=2, minimal) → `8 nodes directly changed, 250 nodes impacted within 2 hops, 97 additional files affected, risk high` (architectural reality of touching the SPA fallback, not a behavioral regression); `code-review-graph_get_affected_flows_tool` → `0 flow(s) affected by changes in 3 file(s)` (the five public SPA route entries are not in any CRG-recorded entry-point flow); `code-review-graph_query_graph_tool file_summary server.js` → 2 nodes (File + `setStaticCacheHeaders`); `code-review-graph_list_graph_stats_tool` → `340 files, 4220 nodes, 34688 edges, 247 tests, last updated 2026-06-07T17:28:23`. Narrow test coverage check: no appropriate unit test exists for HTTP/1.0-proxy cache headers and the live smoke script is the right level of coverage for a deploy-drift user-journey break; a new unit test would be a queue-widening follow-up, not a TO-107 closure. Diagnosis of Heroku bundle drift is still plausible (7 unpushed local commits, last Heroku release v91 on 2026-05-17) but still not proven — the build did not run `npm run preview` to confirm local resolution or `git push heroku main` to confirm a clean redeploy closes the 5x 404. Review verdict: **REJECT** (changes-required), same as the prior cycle. TO-107 stays `active` in `0.dev-matrix/AI-TASKS.json`. Build lane must either (a) trigger a clean Heroku redeploy from a reviewed commit + re-run the smoke script and confirm steps 04-08 resolve to owned pages, or (b) widen scope to fix `scripts/webwright/full_app_smoke.py` so the 5x 404 steps fail loudly. Full review artifact (this cycle): `0.dev-matrix/frame-artifacts/TO-107/REVIEW-RESULT.md` (re-written 2026-06-07 17:55 IST). `FINAL_REVIEW_VERDICT: changes-required` remains correct; final review sign-off is still gated on closing the 5x 404 on the live host.
