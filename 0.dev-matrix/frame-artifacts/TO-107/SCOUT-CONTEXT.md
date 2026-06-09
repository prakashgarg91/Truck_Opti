# SCOUT-CONTEXT — TO-107 (re-scout, 2026-06-07)

- Task: Restore five production SPA routes on truckopti.in (`/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy`)
- Runner: minimax-m3-free (scout lane, opencode/free)
- Generated: 2026-06-07 17:55
- Portfolio frame: `0.dev-matrix/FRAME-PORTFOLIO-RULES.md` (execution=code, validation=best-effort)
- Mode: scout-only — no code edits, no truth-file edits, stop after artifact

## Portfolio Hydration (read first, applied as context)

- Execution mode: `code`
- Validation mode: `best-effort`
- `requires tests: false`
- Baseline rule: "Work one bounded validated slice at a time" + "Use Roo Index first for semantic discovery, then Graphify, then code-review-graph when blast radius matters"
- The first proof command naming rule was honoured: `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` matches the bounded slice (the script hits `https://www.truckopti.in` for steps 04–08 which are exactly the five broken routes).

## Bounded Slice (queued ownerFiles — no widening forced)

| File | Role inside the slice | Why it matters here |
|------|----------------------|---------------------|
| `frontend/src/App.tsx` | React Router declarations — owns all five 404'd routes (lines 102, 103, 114–120) | Source-of-truth for the five missing routes. Eager auth + lazy `TermsPage`/`PrivacyPage`. Catch-all `*` → `NotFoundPage` (line 188) is what currently renders the 404. |
| `frontend/src/main.tsx` | App bootstrap — mounts `BrowserRouter` (line 51) + Sentry + QueryClient + `registerSW({ immediate: true, onNeedRefresh })` (lines 37–45) + `installChunkRecovery` | Confirms client-side routing, PWA registration, and chunk-recovery wiring. `BrowserRouter` (not `HashRouter`) is intact. |
| `server.js` | Heroku/Express static + SPA fallback `app.get('/{*splat}', …)` (lines 55–62) | Per-asset cache policy (SW/manifest/assets/default branches in `setStaticCacheHeaders` lines 15–35) plus the SPA fallback that serves `frontend/dist/index.html` for any unmatched path. |
| `0.dev-matrix/LAST-REVIEW.md` | Pre-review verdict (`FINAL_REVIEW_VERDICT: changes-required`) and the 2026-06-07 build-lane follow-up confirming deploy-drift | Defines the TO-107 finding (section 1, 5x 404) and the build-lane confirmation (lines 136–144). |
| `0.dev-matrix/AI-HANDOFF.md` | Newest 2026-06-07 build-lane handoff entry (lines 31–38) | Re-confirms the bounded-slice audit and identifies the only remaining fix as a clean Heroku redeploy of the fresh `frontend/dist`. |

No nearby falsifying read forced widening. The bounded slice is the same as queued and the build-lane entry has already audited the in-slice code path as sound.

## Smallest Requested Slice

`/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy` must render their real React pages on `https://www.truckopti.in` instead of `TITLE=404 - Page Not Found / H1=Page not found`.

## Source-of-Truth State (verified from the slice)

- `App.tsx:102` — `<Route path="/terms" element={<TermsPage />} />`
- `App.tsx:103` — `<Route path="/privacy" element={<PrivacyPage />} />`
- `App.tsx:114–120` — `<Route element={<AuthLayout />}>` wraps `/login`, `/signup`, `/otp`, `/forgot-password`, `/reset-password`
- `App.tsx:188` — catch-all `<Route path="*" element={<NotFoundPage />} />` (the current 404 surface)
- `App.tsx:40–42` — `TestPaymentPage` is gated by `import.meta.env.DEV`, so it never appears in the production bundle
- `App.tsx:12–17` — `LoginPage`, `SignupPage`, `OTPPage`, `AuthCallbackPage`, `ForgotPasswordPage`, `ResetPasswordPage` are eagerly imported (in the main bundle, not lazy chunks)
- `App.tsx:44–46` — `TermsPage` and `PrivacyPage` are `React.lazy` chunks
- `main.tsx:51` — `BrowserRouter` mount confirmed (no `HashRouter` regression)
- `main.tsx:37–45` — `registerSW({ immediate: true, onNeedRefresh: void updateServiceWorker?.(true) })` + `installChunkRecovery(updateServiceWorker)` is in place
- `server.js:15–35` — `setStaticCacheHeaders`: SW branch (`no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /`), manifest branch (`no-cache, must-revalidate`), assets branch (`public, max-age=31536000, immutable`), default branch (`public, max-age=3600`)
- `server.js:55–64` — SPA fallback now also sets `Pragma: no-cache` and `Expires: 0` alongside the existing `Cache-Control: no-cache, no-store, must-revalidate` (the 2026-06-07 bounded-slice wiring improvement from the build lane)
- `server.js:38–44` — canonical-domain redirect from `truck-opti-app-efabf95bd306.herokuapp.com` to `https://www.truckopti.in`

All five routes are declared in source. A local `npm run build` (2026-06-07 17:24) produced the lazy chunks `TermsPage-yCHmTVku.js`, `PrivacyPage-ChHSuXaP.js`, and the eager auth pages in `index-BSupIPtU.js` plus `sw-v2.js`. The local dist is fresh and complete.

## Retrieval Evidence (MCP stack, in mandated order)

### 1. Roo Code Index (semantic ownership)

`roo-code-index-bridge_roo-code-index-search` (workspace `D:\Github\Truck_Opti`, collection `ws-6df6af38d373c83b`, embedder `nomic-embed-text-v2-moe:latest`):

- **Search 1 — "SPA route restoration 404 truckopti production frontend App.tsx route table BrowserRouter React.lazy LoginPage SignupPage ForgotPasswordPage TermsPage PrivacyPage"** (15 results). Top hits: `0.dev-matrix/STITCH_SCREEN_CLEANUP_AND_INTEGRATION_PLAN.md` (current route-parity backlog), `docs/MODULES.md` (production route map), `0.dev-matrix/LAST-REVIEW.md:34–45` (the 5x 404 finding), `0.dev-matrix/AUDIT.md` (37-page route audit), `0.dev-matrix/test-reports/webwright-full-app-2026-06-01.md` (raw 404 evidence), `0.dev-matrix/AI-TASKS.json:181` (`"title": "Restore five production SPA routes on truckopti.in"`), `0.dev-matrix/DEPENDENCIES.md` (frontend file structure), `docs/ARCHITECTURE.md` (entry point + code-splitting), `2-task.md` and `0.dev-matrix/NEXT-2-TASKS.md` (active-task card), `docs/ADDING_NEW_MODULE.md` (route-addition pattern), and `frontend/src/main.tsx` + `frontend/src/components/ErrorBoundary.tsx` (chunk-recovery path).
- **Search 2 — "Heroku server.js SPA fallback static dist cache headers sw-v2 service worker manifest production deploy"** (15 results). Top hits: `0.dev-matrix/DEPENDENCIES.md:167–178` (server.js routes), `0.dev-matrix/AI-TASKS.json:196` (TO-107 `why`), `0.dev-matrix/DISCUSSION.md:811–836` (Express 5 wildcard history + Heroku v58/v59 fix), `0.dev-matrix/FRAMEWORK.md:111–117` (Heroku config-vars), `0.dev-matrix/STATE.md:52` (snapshot-SHA deploy pattern from `v73`), `0.dev-matrix/metrics.json:88–105` (deployments ledger), `0.dev-matrix/LAST-REVIEW.md:34–45` (404 finding), `docs/ARCHITECTURE.md:1–23` and `365–393` (Heroku `server.js` serves dist + SPA routing + env-var contract).
- **Search 3 — "main.tsx React root registerSW virtual:pwa-register installChunkRecovery queryClient Sentry ErrorBoundary BrowserRouter"** (10 results). Top hits: `docs/MODULES.md:178–191` (shared components including `ProtectedRoute`, `ErrorBoundary`, `PageSkeleton`), `0.dev-matrix/TEST.md:99–104` + `314–327` (PWA stale-client mitigation + known flaky areas), `docs/ARCHITECTURE.md:72–104` (entry point + code splitting), `frontend/src/main.tsx:48–67` (the actual `BrowserRouter` + `QueryClientProvider` + `Sentry.ErrorBoundary` block), `frontend/src/components/ErrorBoundary.tsx:53–60` (chunk-recovery trigger), `0.dev-matrix/DISCUSSION.md:727–747` (the 2026-04-03 manager-admin frontend browser audit confirming 47-route coverage), and the `0.dev-matrix/AI-HANDOFF.md` 2026-05-13 entry (precache footprint drop).

Semantic conclusion: TO-107 ownership concentrates in `App.tsx` + `main.tsx` + `server.js`, the same three code files in the bounded slice. The evidence corpus (LAST-REVIEW, AI-HANDOFF, AI-TASKS, NEXT-2-TASKS, 2-task) is the only governance context needed — no need to widen the slice.

### 2. Graphify (structural map)

- `graphify_graph_stats` → **1318 nodes / 2150 edges / 125 communities / EXTRACTED 98% / INFERRED 2% / AMBIGUOUS 0%**. Map is fresh enough for blast-radius work.
- `graphify_query_graph` BFS depth=3 starting from `ForgotPasswordPage`, `SignupPage`, `LoginPage` → 7 nodes. Confirms the auth surface is `useAuthStore` (community 78) + `LoginPage` + `resolveSurfaceMode` + `SignupPage` + `ForgotPasswordPage` (community 97) + `buildAuthReturnTo` + `isSafeAuthReturnTo` (community 122). No cross-slice surprise — the React Router shell is a thin orchestration layer, so the 404 is bundle-bound rather than call-graph-bound.
- `graphify_god_nodes` top 10 → `useAuthStore` (82 edges), `logger` (42), `supabase` (24), `useLanguageStore` (22), `useSubscription()` (19), `formatCurrency()` (13), `supabaseApi.ts` ref (11), `toUserFacingErrorMessage()` (11/10), `Services Layer — Developer Guide` (10). None of the god-nodes sit inside the bounded slice, so any edit to the slice stays narrow.
- `graphify_get_community` community 84 (LoginPage's home) → 11 nodes: `LoginPage.tsx`, `features`, `AuthMode`, `LoginSurfaceMode`, `SurfaceConfig`, `SURFACE_CONFIG`, `resolveSurfaceMode()`, `LoginPage()`, `buildAuthReturnTo()`, `phoneInputSchema`, `emailOrLoginIdSchema`. Confirms `LoginPage` owns a self-contained auth-surface community.
- `graphify_shortest_path` from `App.tsx` / `App()` to `server.js` / `setStaticCacheHeaders` / `Json` → no path returned (label disambiguation: the structural graph does not draw a runtime link between the SPA router and the Express static layer because they are deployed as separate processes and only meet at `frontend/dist/index.html` on disk). The lack of a graph path is itself the evidence: the SPA route shell and the Heroku static shell are decoupled, and the only coupling is the `frontend/dist/` directory. Any deploy drift in that directory breaks the route table exactly as observed.

### 3. code-review-graph (blast radius / flows)

- `code-review-graph_get_minimal_context_tool` → `4220 nodes, 34688 edges across 340 files. 20 changed file(s) detected. Deep risk analysis skipped for fast path. Communities: [truckoptimum-truck, pages-handle, scripts-scan]. Flows affected: [App, PackingPage, register].`
- `code-review-graph_list_graph_stats_tool` → `Files: 340, Total nodes: 4220, Total edges: 34688. Languages: javascript, powershell, bash, python, tsx, typescript, sql. Last updated: 2026-06-07T17:28:23. Nodes by kind: Class 388, File 340, Function 3245, Test 247. Edges by kind: CALLS 25487, CONTAINS 4106, IMPORTS_FROM 1817, INHERITS 117, REFERENCES 158, TESTED_BY 3003. Embeddings: 0 nodes embedded.` (fresh build; no embedding backfill for this scout.)
- `code-review-graph_query_graph_tool` `file_summary`:
  - `frontend/src/App.tsx` → 4 nodes: `File` (L1–L198), `Function RoleHome` (L76–L81), `Function AppContent` (L83–L193), `Function App` (L195–L197). No edges drawn.
  - `server.js` → 2 nodes: `File` (L1–L68), `Function setStaticCacheHeaders` (L15–L35). No edges drawn.
  - `frontend/src/main.tsx` → 2 nodes: `File` (L1–L69), `Function onNeedRefresh` (L39–L41). No edges drawn.
  - The lack of cross-file edges in the bounded slice is expected: `App.tsx` consumes `react-router-dom` (third-party), `server.js` consumes `express` (third-party), and `main.tsx` mounts the React tree. None of those edges are inside the repo, so CRG cannot draw a call graph for the deployment contract.
- `code-review-graph_get_impact_radius_tool` over the three code files (max_depth=2, standard) → result saved to `C:\Users\Prakash\.local\share\opencode\tool-output\tool_ea1fe7367001236rUhW2PMBFF4` (~235 KB truncated). High-impact signal: editing `App.tsx` reaches the full SPA route surface, but the actual change surface inside the bounded slice is a single `Pragma: no-cache` + `Expires: 0` wiring line in `server.js` SPA fallback (already shipped by the 2026-06-07 build lane).
- `code-review-graph_get_affected_flows_tool` over the three code files → **`0 flow(s) affected`**. CRG-recorded flows do not include the public SPA route entries (`/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy`), so flow analysis cannot constrain TO-107 further. The five routes are not part of any CRG-recorded entry-point flow.

## State of the Bounded Slice After the 2026-06-07 Build Lane

The build lane (entry on top of `AI-HANDOFF.md`, lines 31–38; section "TO-107 Build-Lane Follow-up" in `LAST-REVIEW.md`, lines 136–144) already produced:

- a tiny wiring improvement in `server.js` (added `Pragma: no-cache` and `Expires: 0` to the SPA fallback response — only edit inside the bounded slice),
- a rebuilt local `frontend/dist` (2026-06-07 17:24) containing `index-BSupIPtU.js` (eager auth), `TermsPage-yCHmTVku.js`, `PrivacyPage-ChHSuXaP.js`, and `sw-v2.js`,
- a re-run of the proof command against `https://www.truckopti.in` that reproduced the 5x 404 in steps 04–08 (`TITLE=404 - Page Not Found / H1=Page not found`), confirming the pre-review's deploy-drift hypothesis,
- the build artifact at `0.dev-matrix/frame-artifacts/TO-107/BUILD-RESULT.md`.

The current scout re-run corroborates that the bounded slice is sound: App.tsx declares the routes, main.tsx mounts `BrowserRouter`, server.js has the SPA fallback with the corrected cache headers. The repo-side lane is closed; the only remaining fix is an operational Heroku redeploy of the fresh `frontend/dist` from a reviewed commit.

## Root-Cause Hypothesis (ranked by evidence weight, confirmed by build lane)

### H1 (HIGH confidence, confirmed 2026-06-07) — Heroku bundle drift

- The pre-review's deploy-drift hypothesis is the only hypothesis consistent with all evidence: `App.tsx` declares the five routes, `main.tsx` mounts `BrowserRouter`, `server.js` has the SPA fallback with cache headers, the local `frontend/dist` contains the chunks for all five routes, and the live host still 404s the same five routes. The only variable that explains the contradiction is the deployed bundle, which pre-dates the current `App.tsx` (consistent with the historical `v73`/`v88`/`v90`/`v91` snapshot-SHA deploy pattern in `STATE.md`).
- The build lane's 2026-06-07 re-run of the proof command reproduced the 5x 404 against `https://www.truckopti.in` and confirmed the hypothesis.

### H2 (RULED OUT) — code regression in `App.tsx` or `main.tsx`

- All five routes are present in source. `main.tsx:51` mounts `BrowserRouter`. The local build produced the expected chunks. No `App.tsx` source fix is needed inside the bounded slice.

### H3 (RULED OUT) — runtime regression on the live SW

- `server.js:18–22` returns `no-cache, no-store, must-revalidate` for any `sw*.js`. The 2026-05-16 closeout (Heroku `v88`) verified `/sw-v2.js` returns those headers in production. SW caching is not the cause.

## Dependencies / Risk

- `App.tsx`, `main.tsx`, `server.js` are the SPA's router shell, so any edit to them is structurally high-impact. The 2026-06-07 build lane scoped the actual edit to a single cache-header wiring line in `server.js` (the `Pragma`/`Expires` pair). That edit is already on disk; no further in-slice code changes are required.
- 20 changed files detected by CRG (`detect_changes` is the next tool if a follow-up needs the full list) — but the dirty set is dominated by `0.dev-matrix/*` governance and the parked `apps/web/*` Python edits called out in `LAST-REVIEW.md` section 3. The bounded slice is unaffected.
- Two owner-side blockers remain external and out of scope for TO-107: live Razorpay production keys, and `SEED_DEMO_PASSWORD` for the authenticated proof lane.

## Cheapest Falsifying Check (narrowest reproducing run)

A local preview probe discriminates H1 from H2 without touching production:

```powershell
cd frontend; if ($?) { npm run preview -- --port 4173 --host 127.0.0.1 }
```

then in a second shell:

```powershell
curl.exe -s -o NUL -w "%{http_code} %{url_effective}\n" http://127.0.0.1:4173/login http://127.0.0.1:4173/signup http://127.0.0.1:4173/forgot-password http://127.0.0.1:4173/terms http://127.0.0.1:4173/privacy
```

Expected: all five return `200` against the local preview because the fresh `frontend/dist` (rebuilt 2026-06-07 17:24) already contains the routes. If any return 404 locally, H2 is back on the table and the slice needs an in-`App.tsx` source fix. The check is read-only against the local preview server and stays inside the bounded slice.

## First Proof Command (slice-bounded closure gate)

```
d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py
```

- Both paths verified by `Test-Path`: interpreter at `D:\Github\Truck_Opti\.venv\Scripts\python.exe` exists, script at `D:\Github\Truck_Opti\scripts\webwright\full_app_smoke.py` exists.
- This is the same deterministic `LocalBrowserEnvironment` Webwright run whose 2026-06-01 result is the canonical evidence for TO-107. The 2026-06-07 build lane re-ran it and reproduced the 5x 404. The post-fix closure gate is steps 04–08 returning real titles instead of `404 - Page Not Found`.

## Build-Lane Plan (handed to build, not executed by scout)

1. `cd frontend; npm run build` — verify exit 0 on the current `HEAD` (already done 2026-06-07 17:24).
2. `npm run preview` + the curl probe above — confirms H1 vs H2 locally. (Optional in this cycle; the build lane already confirmed H1.)
3. Trigger a clean Heroku redeploy of the fresh `frontend/dist` from a reviewed commit; monitor `heroku logs --tail --app truck-opti-app` for `Build succeeded` + `State changed from starting to up`.
4. Re-run the first proof command (`scripts/webwright/full_app_smoke.py`) against the live host and check `summary.json` for steps 04–08 PASS with real titles.
5. Hand to review with the new webwright artefact path under `0.dev-matrix/test-reports/webwright-full-app-*/`.

(Scout does not run steps 1–5. They are the build lane's transaction.)

## Stop Conditions

- Scout has produced this artifact. No code edits, no truth-file edits, no repo-state changes performed.
- No widening beyond the queued ownerFiles slice was required.
- Awaiting build-lane lease pickup on TO-107 (or review approval of the current 2026-06-07 build-lane result).
