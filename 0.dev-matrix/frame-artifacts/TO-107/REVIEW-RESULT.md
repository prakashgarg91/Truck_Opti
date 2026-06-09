# REVIEW-RESULT.md — TO-107 (re-review, 2026-06-07)

- Task: **TO-107 — Restore five production SPA routes on truckopti.in**
- Lane: review (minimax-m3-free, free review lane, re-review after build did not close the user-journey break)
- Date: 2026-06-07 17:55 IST
- Verdict line: `FINAL_REVIEW_VERDICT: changes-required`
- Bounded slice: `frontend/src/App.tsx`, `frontend/src/main.tsx`, `server.js`, `0.dev-matrix/LAST-REVIEW.md`, `0.dev-matrix/AI-HANDOFF.md`
- Re-review trigger: same build submission, same diff, no new in-slice code edit. This is a deterministic re-run of the previous rejection, not a re-queue.
- Proof command (mandated by task): `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py`
- The build artifact gives no narrower executable proof for the same behavior; the same smoke script is the narrowest deterministic LocalBrowserEnvironment probe for steps 04–08.

## 1. Decision

**TO-107 is NOT closed by this build pass (re-confirmed).** The bounded-slice code audit remains correct and the diagnosis (Heroku bundle drift) remains plausible but unproven, and the user-journey break — `TITLE=404 - Page Not Found / H1=Page not found` on `/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy` — still reproduces on `https://www.truckopti.in` after the build's only code edit. Task TO-107 stays `active` in `0.dev-matrix/AI-TASKS.json` (it was already `active` from the prior rejection, so no status transition). Rejection log appended to `0.dev-matrix/LAST-REVIEW.md`.

## 2. What the build actually changed (re-verified)

Direct read of `git diff --stat HEAD -- server.js frontend/src/App.tsx frontend/src/main.tsx`:

```
 server.js | 2 ++
 1 file changed, 2 insertions(+)
```

Full diff:

```diff
diff --git a/server.js b/server.js
index 3758c757..08895bf4 100644
--- a/server.js
+++ b/server.js
@@ -58,6 +58,8 @@ app.get('/{*splat}', (req, res) => {
     return res.status(503).send('App not built. Run npm run build.');
   }
   res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
+  res.setHeader('Pragma', 'no-cache');
+  res.setHeader('Expires', '0');
   res.sendFile(indexPath);
 });
```

`frontend/src/App.tsx` and `frontend/src/main.tsx` are clean against the queue boundary. The only in-slice code change is the 2-line `Pragma: no-cache` + `Expires: 0` addition to the SPA fallback response, alongside the existing `Cache-Control: no-cache, no-store, must-revalidate`. This is a low-risk HTTP/1.0-proxy compatibility improvement; it does not change routing, does not change React Router state, and does not address the 5x 404 user-journey break.

The other dirty files in the working tree (`apps/web/app/cost_engine.py`, `apps/web/app/packer.py`, `apps/web/app/routes.py`, `apps/web/tests/test_drill_down_api.py`, `apps/web/tests/test_enhanced_features.py`, `2-task.md`, the `0.dev-matrix/*.md` set, `0.dev-matrix/test-reports/webwright-full-app-2026-06-01/summary.json`, `graphify-out/graph.html`, `.vscode/mcp.json`, `skills-lock.json`, the `.claude/skills/*` and `.agents/skills/*` and `0.dev-matrix/standards/*` line-ending touches) are outside the queue ownerFiles and per the scout's bounded slice must not be touched by TO-107.

## 3. Bounded-slice code review (re-verified)

### 3.1 `frontend/src/App.tsx` — route declarations ✓

Direct read against `c01d3fc1`:

| Path | Element | Line | Wrapper |
|------|---------|------|---------|
| `/terms` | `<TermsPage />` (React.lazy) | 102 | (top-level public) |
| `/privacy` | `<PrivacyPage />` (React.lazy) | 103 | (top-level public) |
| `/login` | `<LoginPage />` (eager) | 115 | `<AuthLayout />` (parent route, line 114) |
| `/signup` | `<SignupPage />` (eager) | 116 | `<AuthLayout />` (parent route, line 114) |
| `/forgot-password` | `<ForgotPasswordPage />` (eager) | 118 | `<AuthLayout />` (parent route, line 114) |
| catch-all | `<NotFoundPage />` | 188 | (only used when no other route matches) |

React Router v6 layout-route pattern is correct: `<Route element={<AuthLayout />}>` (no `path` prop) is a parent layout, and the five children carry absolute paths. Catch-all `path="*"` is at the bottom of the `<Routes>` block.

### 3.2 `frontend/src/main.tsx` — router bootstrap + SW ✓

Direct read against `c01d3fc1`:

- Line 51: `<BrowserRouter>` — not `HashRouter`. ✓
- Line 37–42: `registerSW({ immediate: true, onNeedRefresh: () => updateServiceWorker?.(true) })` — correct `vite-plugin-pwa` autoUpdate registration.
- Line 44: `installChunkRecovery(updateServiceWorker)` — correct stale-chunk recovery wiring.
- Line 47–67: `<Sentry.ErrorBoundary>` wraps `<QueryClientProvider>` wraps `<BrowserRouter>` wraps `<App />` + `<Toaster>`. Order is correct.

### 3.3 `server.js` — Heroku static + SPA fallback ✓

Direct read against `c01d3fc1` plus the build's working-tree change:

- Lines 18–22: `sw*.js` → `no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /` ✓
- Lines 24–27: `manifest.webmanifest` → `no-cache, must-revalidate` ✓
- Lines 29–32: `assets/*` → `public, max-age=31536000, immutable` ✓
- Line 34: default → `public, max-age=3600` ✓
- Lines 38–44: `*.herokuapp.com` → `301` to `https://www.truckopti.in` ✓ (not a 404 cause for the live host)
- Lines 47–51: `express.static(DIST_DIR, { index: false, setHeaders: setStaticCacheHeaders })` ✓
- Lines 55–64: Express 5 named-wildcard SPA fallback `app.get('/{*splat}', ...)` serves `frontend/dist/index.html` with `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` + `Expires: 0` ✓ (the build's only code edit)

**Bounded-slice verdict: code is sound.** All five routes are declared, the router is a `BrowserRouter`, the SW registration is correct, the chunk recovery is in place, and the SPA fallback with the right cache policy exists. The build's audit of the queue ownerFiles is correct.

## 4. Blast radius (code-review-graph, re-checked this cycle)

Used the canonical MCP names with the full prefix and `_tool` suffix:

- `code-review-graph_get_minimal_context_tool` (changed_files = the 3 ownerFiles) → `4220 nodes, 34688 edges across 340 files. 3 changed file(s) detected. Risk: high (0.80). Key entities: App.tsx, App, AppContent, RoleHome, main.tsx. Communities: truckoptimum-truck, pages-handle, scripts-scan. Flows affected: App, PackingPage, register.` The "high" risk is architectural (App.tsx is the routing god-node) and is not a behavioral regression — the routing code was not edited.
- `code-review-graph_get_impact_radius_tool` (max_depth=2, minimal) → `8 nodes directly changed, 250 nodes impacted within 2 hops, 97 additional files affected. Risk: high.` The high impact is the same architectural reality; the actual change is purely additive (2 response headers on 1 SPA fallback handler).
- `code-review-graph_get_affected_flows_tool` → **`0 flow(s) affected by changes in 3 file(s)`.** CRG-recorded flows do not include the public SPA route entries (`/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy`), so flow analysis cannot constrain TO-107 further.
- `code-review-graph_query_graph_tool file_summary server.js` → `2 nodes: File (server.js) + Function setStaticCacheHeaders`. No in-graph call edges drawn because `server.js` consumes `express` (third-party) and the SPA fallback is the deploy-time boundary.
- `code-review-graph_list_graph_stats_tool` → `Files: 340, Total nodes: 4220, Total edges: 34688. Languages: javascript, powershell, bash, python, tsx, typescript, sql. Last updated: 2026-06-07T17:28:23. Nodes by kind: Class 388, File 340, Function 3245, Test 247. Edges by kind: CALLS 25487, CONTAINS 4106, IMPORTS_FROM 1817, INHERITS 117, REFERENCES 158, TESTED_BY 3003. Embeddings: 0 nodes embedded.` Fresh build; consistent with the prior review cycle.

**Blast radius verdict: acceptable.** The change is two response headers on a single SPA fallback handler. No node-level test coverage exists for this behavior (and none is practical — these are HTTP/1.0-proxy headers that are only meaningful to HTTP/1.0 intermediaries, not to the test harness). The narrow coverage check is: `cd frontend && npm run build` produces the fresh chunks; the smoke script reads the live HTTP response; the response now carries all three cache-busting headers. No narrow unit test is appropriate for this behavior.

## 5. Narrow test coverage check (AutoBE zero-bug)

The changed behavior is: SPA fallback response now sets `Pragma: no-cache` and `Expires: 0` in addition to the existing `Cache-Control: no-cache, no-store, must-revalidate`. Narrow test-coverage candidates:

- **Unit test**: an Express supertest that hits `app.get('/{*splat}', handler)` and asserts the three header values. This is the narrowest executable test for the behavior. *Practical consideration*: `server.js` is the Heroku production entrypoint and is not currently wired into the test harness (no `supertest` dep in root `package.json`; no `tests/server.test.js` or similar). Adding such a test is a small but out-of-scope widening for this review — it does not address the live-host 5x 404.
- **Live HTTP probe**: `curl.exe -sI https://www.truckopti.in/login` and assert the three header values appear on a 200/304 response. This is the actual behavioral test that would prove the cache-busting headers are reaching the wire.
- **Live SPA route resolution**: the smoke script — the queue's mandated proof command — exercises the full SPA render path for steps 04–08 and reads the resolved title/H1. This is the broadest test for the bounded slice and is what the queue card's `definitionOfDone` requires.

The narrowest behavioral probe is the live HTTP header check, but it does NOT prove the user-journey break is closed. The user-journey break is closed only when `https://www.truckopti.in/login` returns `Welcome Back - TruckOpti` (not `404 - Page Not Found`). That is what the smoke script measures. No narrow unit test can replace the live smoke for this queue card.

**Narrow test coverage verdict: appropriate as-is for the bounded slice.** The queue card's `validation` field names the smoke script as the proof, and the smoke script is the right level of coverage for a deploy-drift user-journey break. A new unit test for the SPA fallback cache headers would be a queue-widening follow-up, not a TO-107 closure.

## 6. Proof re-check (narrowest executable proof for the same behavior)

Re-ran `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` at **2026-06-07T17:55:07+0530** (this review's own re-run, after reading the build artifact and the prior review). Raw stdout saved to `0.dev-matrix/test-reports/webwright-full-app-2026-06-07-to107-review-rerun/smoke.log` (3412 bytes, lastwrite 2026-06-07 17:55:07). The script re-wrote `0.dev-matrix/test-reports/webwright-full-app-2026-06-01/summary.json` with `generated_at: "2026-06-07T17:55:07+0530"`.

Per-step result (from the fresh `summary.json`):

| Step | Path | TITLE | H1 | Verdict |
|------|------|-------|----|---------|
| 01-home | `/` | `TruckOpti - Smart Logistics` | `India's Smartest Truck Booking Platform` | 200 ✓ |
| 02-pricing | `/pricing` | `Pricing — TruckOpti` | `Choose Your Plan` | 200 ✓ |
| 03-contact | `/contact` | `Contact Us - TruckOpti` | (3 validation errors after empty submit) | 200 ✓ |
| 04-login | `/login` | `404 - Page Not Found` | `Page not found` | **404 ✗** |
| 05-signup | `/signup` | `404 - Page Not Found` | `Page not found` | **404 ✗** |
| 06-forgot-password | `/forgot-password` | `404 - Page Not Found` | `Page not found` | **404 ✗** |
| 07-terms | `/terms` | `404 - Page Not Found` | `Page not found` | **404 ✗** |
| 08-privacy | `/privacy` | `404 - Page Not Found` | `Page not found` | **404 ✗** |
| 09a-driver-register | `/driver/register` | `TruckOpti - Smart Logistics` | (generic site) | 200 ✓ |
| 09b-agency-register | `/agency/register` | `TruckOpti - Smart Logistics` | (generic site) | 200 ✓ |
| 10-otp-6digit | `/otp` | `Welcome Back - TruckOpti` (via /login) | (Google OAuth) | 200 ✓ (contradicts LAUNCH_CHECKLIST row 2.1) |
| 11-mobile-home | `/` mobile (390x844) | (no menu buttons, no horizontal scroll) | — | 200 ✓ |
| 12-google-launch | `/login` | (1 Google button, redirects to Google OAuth) | — | 200 ✓ |

13/13 PASS at the smoke-driver level, but **steps 04–08 are still the 5x 404**. Output lengths for the 404 pages are 56/57/66/56/58 bytes (small 404 stub with title + h1) versus 839–2511 bytes for the working pages. The smoke script renders real content for the working routes and the catch-all 404 page for the broken routes.

**The narrowest executable proof for the same behavior re-confirms the user-journey break is NOT closed.** The fresh run is at 17:55:07 IST, eight minutes after the build's run at 17:46:30 IST; both runs show identical 404 results on `/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy`.

## 7. Why this is a REJECT (re-confirmed)

The queue card TO-107 has the explicit `definitionOfDone`:

> All five public routes resolve on https://www.truckopti.in to their owned React pages (no 404 title, no Page not found H1), the Webwright full-app smoke step 04-08 evidence is updated, and the result is captured in STATE.md, AI-HANDOFF.md, and LAST-REVIEW.md.

The build's evidence versus the criterion:

| Criterion | Required | Build's evidence (re-run at 17:55) | Met? |
|-----------|----------|-------------------------------------|------|
| `/login` resolves to owned React page | `TITLE=Welcome Back - TruckOpti` (or similar) | `TITLE=404 - Page Not Found` | ✗ |
| `/signup` resolves | `TITLE=Sign Up - TruckOpti` (or similar) | `TITLE=404 - Page Not Found` | ✗ |
| `/forgot-password` resolves | `TITLE=Forgot Password - TruckOpti` (or similar) | `TITLE=404 - Page Not Found` | ✗ |
| `/terms` resolves | `TITLE=Terms - TruckOpti` (or similar) | `TITLE=404 - Page Not Found` | ✗ |
| `/privacy` resolves | `TITLE=Privacy - TruckOpti` (or similar) | `TITLE=404 - Page Not Found` | ✗ |
| Webwright full-app smoke step 04-08 evidence is updated | `summary.json` shows non-404 for steps 04-08 | `summary.json` still shows 404 for steps 04-08 | ✗ |

The build's own conclusion (from `BUILD-RESULT.md` §6) agrees: "TO-107 is **not** marked done by this build pass; the final review gate still needs either a clean redeploy or a smoke-script assertion widening." A review that marks TO-107 `done` while the live host still 404s on all five routes would be a hallucinated completion. The pre-completion pre-review's central lesson — *"a green `npm test` does NOT mean the live host is healthy"* — applies here as well: bounded-slice correctness does NOT mean the user-journey break is closed.

## 8. Diagnosis check (deploy drift hypothesis, re-examined)

The deploy-drift hypothesis remains plausible because:

- `git rev-list --count HEAD ^origin/main` returns `7` local commits never pushed to `origin/main` (verified this cycle)
- 4 of those 7 modified `frontend/src/App.tsx` (route declarations)
- Last Heroku release recorded in `0.dev-matrix/AI-HANDOFF.md` is `v91` on 2026-05-17
- The smoke step 10 (`/otp`) shows the older route shape still works (`/otp` → `/login` → "Welcome Back - TruckOpti"), which means the live bundle DOES know `/otp` and `/login` (the older routes) but does NOT know `/login`/`/signup`/`/forgot-password`/`/terms`/`/privacy` as top-level routes — consistent with the older bundle having a different route shape

But the diagnosis is still **NOT proven**. The build did not:

- Run `cd frontend && npm run preview` to confirm the local dist resolves all five routes (the scout's recommended falsifying read)
- `git push heroku main` + re-smoke to confirm a clean redeploy closes the 5x 404
- Inspect `heroku logs --tail --app truck-opti-app` to confirm Heroku is on a stale SHA

So the diagnosis remains a hypothesis, not a verified root cause. The cheap falsifying check the scout named — `npm run preview` + curl probe — was not run by the build, and would have produced the strongest possible local evidence. The review cannot bless a hypothesis as a fix.

## 9. Recommended next action (reviewer hands back to build)

The build's own recommendation is correct, and the review agrees with it. Two paths, in order of preference:

1. **Preferred path (deploy)**: `git push origin main; git push heroku main` from a reviewed commit, monitor `heroku logs --tail --app truck-opti-app-efabf95bd306` for `Build succeeded` + `State changed from starting to up`, then re-run `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` and confirm steps 04-08 resolve to their owned pages. This is the only path that actually closes the user-journey break on the live host.
2. **Alternative path (script widening)**: widen scope to `scripts/webwright/full_app_smoke.py` so the 5x 404 steps fail loudly (returncode != 0 when the title is `404 - Page Not Found`). This does NOT close the live user-journey break, but it prevents future deploy drift from passing the smoke lane silently. It is also a much smaller change than a Heroku redeploy and does not require owner-side approval.

The review lane cannot do either path itself — it only evaluates the build. The build lane should pick up the rejection, run the chosen path, and re-submit.

## 10. Operational proof and verification labels

- **Changed**: nothing in code beyond the build's existing `server.js` Pragma/Expires addition; this review did not commit any code or repo-truth edits beyond the standard review artifact + truth-surface sync (REVIEW-RESULT.md rewrite, LAST-REVIEW.md rejection log, AI-HANDOFF.md new entry, STATE.md note, TASK.md unchanged because the existing TO-107 row already documents the rejection).
- **Pending**: a clean Heroku redeploy of the fresh `frontend/dist` from a reviewed commit, OR a script-widening edit to `scripts/webwright/full_app_smoke.py` so the 5x 404 steps fail loudly. Both paths require a new build pass that actually closes the user-journey break.
- **Verified**: the bounded-slice code is sound (direct read of all three ownerFiles + git diff of `server.js`); the 5x 404 still reproduces on the live host (this review's own re-run of `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` at `2026-06-07T17:55:07+0530` reproduced the build's result exactly); the build's diagnosis (Heroku bundle drift) is plausible but not proven; the blast radius of the actual change (2 cache headers on 1 SPA fallback handler) is acceptable per `code-review-graph_get_impact_radius_tool` (8 nodes directly changed, 250 within 2 hops, 0 affected flows); narrow test coverage check confirms no appropriate unit test exists for HTTP/1.0-proxy cache headers and the live smoke script is the right level of coverage.
- **Operational proof**: the review's re-run of the narrowest executable proof — `scripts/webwright/full_app_smoke.py` at `2026-06-07T17:55:07+0530` — is the decisive evidence. Steps 04-08 of the updated `summary.json` still return `TITLE=404 - Page Not Found / H1=Page not found` after the build's edit, so the user-journey break is NOT closed. Raw stdout saved at `0.dev-matrix/test-reports/webwright-full-app-2026-06-07-to107-review-rerun/smoke.log`.
- **Continue from**: the build lane should pick up the rejection and either (a) trigger a clean Heroku redeploy from a reviewed commit + re-smoke, or (b) widen scope to fix `scripts/webwright/full_app_smoke.py` so the 5x 404 steps fail loudly. Either path needs a fresh build submission.
- **Next step**: hand this artifact + the appended LAST-REVIEW.md rejection log to the build lane, and let the build lane choose the deploy or the script-widening path.
- **Technical debt**: the smoke script's `PASS (route 404)` labelling is a known gap — it should fail when the title is `404 - Page Not Found`. This is a future-scope widening that becomes the recommended path if the build lane prefers CI guardrails over a redeploy.
- **Blockers**: live Razorpay production keys and `SEED_DEMO_PASSWORD` remain external owner-side blockers; the 5x 404 is an operational/deploy blocker, not a bounded-slice code defect. Neither blocker is on the review lane.

## 11. Reviewer signature

`FINAL_REVIEW_VERDICT: changes-required` — TO-107 stays `active` in `0.dev-matrix/AI-TASKS.json`. The build pass did not close the user-journey break; the live host still 404s on `/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy` per the 2026-06-07 17:55:07 reviewer's re-run. A clean Heroku redeploy or a smoke-script widening is required before TO-107 can move to a terminal status.
