# BUILD-RESULT.md — TO-107

Task: **TO-107 — Restore five production SPA routes on truckopti.in**
Lane: build (minimax-m3-free, free build lane, re-validated cycle)
Date: 2026-06-07 17:46 IST
Mode: bounded-slice validation, no code defect, deploy-drift confirmed.

## 1. Bounded slice and what changed

Owner files in this slice (queue card `0.dev-matrix/AI-TASKS.json` TO-107):
- `frontend/src/App.tsx` — route declarations
- `frontend/src/main.tsx` — SW registration + router bootstrap
- `server.js` — Heroku static server + SPA fallback
- `0.dev-matrix/LAST-REVIEW.md` — pre-review truth surface
- `0.dev-matrix/AI-HANDOFF.md` — handoff log

**No new in-slice code edit in this re-validation cycle.** The 2026-06-07 build lane (entry on top of `AI-HANDOFF.md`) already shipped the only in-slice code change: `server.js` SPA fallback now also sets `Pragma: no-cache` and `Expires: 0` alongside the existing `Cache-Control: no-cache, no-store, must-revalidate`, for HTTP/1.0 intermediate-proxy compatibility. `App.tsx` route table, `main.tsx` SW registration, and the `setStaticCacheHeaders` SW/manifest/assets/default branches were all left unchanged.

`git diff --stat server.js` confirms the only diff in `server.js` is the +2 lines added by the prior build lane; `frontend/src/App.tsx` and `frontend/src/main.tsx` are clean against the queue boundary.

## 2. Falsifying read — local dist vs live host

The scout's falsifying question was: "does the 5x 404 reproduce on a local Vite preview?"

**Local dist evidence (2026-06-07 17:24:12 rebuild — present in this re-validation cycle):**
- `frontend/dist/index.html` rebuilt today.
- `frontend/dist/assets/index-BSupIPtU.js` — main chunk with eager imports for `LoginPage`, `SignupPage`, `OTPPage`, `AuthCallbackPage`, `ForgotPasswordPage`, `ResetPasswordPage`.
- `frontend/dist/assets/TermsPage-yCHmTVku.js` — lazy chunk for `/terms`.
- `frontend/dist/assets/PrivacyPage-ChHSuXaP.js` — lazy chunk for `/privacy`.
- `frontend/dist/sw-v2.js` — versioned service worker.
- All 67 chunks under `frontend/dist/assets/` are timestamped 2026-06-07 17:24:12.
- The local dist has every chunk needed for the five broken routes.

**Live-host evidence (2026-06-07 17:46 IST Webwright rerun):**

Command: `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py`

13/13 step result; the five 404 steps reproduce on the live host. Raw step outputs (truncated to last 2500 chars per step) were captured by the script and persisted to `0.dev-matrix/test-reports/webwright-full-app-2026-06-01/summary.json` with `generated_at: "2026-06-07T17:46:30+0530"` (file timestamp `07-06-2026 17:46:30`):

| Step | Path | TITLE | H1 | Verdict |
|---|---|---|---|---|
| 04-login | `/login` | `404 - Page Not Found` | `Page not found` | 404 on live |
| 05-signup | `/signup` | `404 - Page Not Found` | `Page not found` | 404 on live |
| 06-forgot-password | `/forgot-password` | `404 - Page Not Found` | `Page not found` | 404 on live |
| 07-terms | `/terms` | `404 - Page Not Found` | `Page not found` | 404 on live |
| 08-privacy | `/privacy` | `404 - Page Not Found` | `Page not found` | 404 on live |

The smoke driver still records each as `PASS` because the script asserts the title/H1 and treats `returncode==0` as PASS; it does not treat 404 as a fail. That script lives at `scripts/webwright/full_app_smoke.py` and is **outside the bounded slice**; the scout said not to widen scope to it.

**Conclusion of the falsifying read:** the 5x 404 does **not** reproduce locally (the fresh dist has the chunks, the React tree declares the routes, the SPA fallback is in place) but **does** reproduce on the live host. The pre-review's deploy-drift hypothesis is re-confirmed at 2026-06-07 17:46: the live `frontend/dist` on Heroku is older than the current source.

## 3. Bounded-slice wiring audit (re-checked this cycle)

| Concern | File:line | Current behavior | Audit result |
|---|---|---|---|
| SW cache headers | `server.js:18-22` | `sw*.js` → `no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /` | Correct. |
| Manifest cache headers | `server.js:24-27` | `manifest.webmanifest` → `no-cache, must-revalidate` | Correct. |
| Assets cache headers | `server.js:29-32` | `assets/*` → `public, max-age=31536000, immutable` | Correct. Vite emits content-hashed asset filenames. |
| Default cache headers | `server.js:34` | default → `public, max-age=3600` | Correct; the SPA fallback bypasses this path because `index: false` is set. |
| SPA fallback | `server.js:55-64` | `app.get('/{*splat}', ...)` → `index.html` with `Cache-Control: no-cache, no-store, must-revalidate` + `Pragma: no-cache` + `Expires: 0` | Correct after the 2026-06-07 build-lane edit. Express 5 named-wildcard syntax preserved. |
| Canonical redirect | `server.js:38-44` | `*.herokuapp.com` → `https://www.truckopti.in` (301) | Correct; not a 404 cause for `truckopti.in` traffic. |
| SW registration | `main.tsx:37-42` | `registerSW({ immediate: true, onNeedRefresh: () => updateServiceWorker(true) })` | Correct. `immediate: true` = `registerType: 'autoUpdate'`, which uses `skipWaiting` + `clients.claim` by default in `vite-plugin-pwa`. |
| Chunk recovery | `main.tsx:44` | `installChunkRecovery(updateServiceWorker)` | Correct. Forces reload on stale lazy-chunk failure. |
| Route declarations | `App.tsx:102,103,115,116,118` | `/terms`, `/privacy`, `/login`, `/signup`, `/forgot-password` all declared | Correct. `/login`/`/signup`/`/forgot-password` are eagerly imported; `/terms`/`/privacy` are `React.lazy` with chunks present in dist. |
| Catch-all order | `App.tsx:188` | `<Route path="*" element={<NotFoundPage />} />` after all other routes | Correct. |
| AuthLayout wrapping | `App.tsx:114-120` | `/login`, `/signup`, `/otp`, `/forgot-password`, `/reset-password` inside `<AuthLayout />` parent route (no `path` prop, so child paths stay absolute) | Correct. React Router v6 layout-route pattern. |

**No code defect found in the bounded slice.** The 5x 404 on the live host is caused by Heroku bundle drift, not a regression in the queue ownerFiles. No new in-slice code edit is required for this re-validation cycle.

## 4. Validation evidence (this cycle)

`d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` ran end-to-end on 2026-06-07 17:46 IST against `https://www.truckopti.in`:

```
01-home: PASS (output_len=1122, exc_len=0)
02-pricing: PASS (output_len=839, exc_len=0)
03-contact: PASS (output_len=72, exc_len=0)
04-login: PASS (output_len=56, exc_len=0)
05-signup: PASS (output_len=57, exc_len=0)
06-forgot-password: PASS (output_len=66, exc_len=0)
07-terms: PASS (output_len=56, exc_len=0)
08-privacy: PASS (output_len=58, exc_len=0)
09a-driver-register: PASS (output_len=195, exc_len=0)
09b-agency-register: PASS (output_len=196, exc_len=0)
10-otp-6digit: PASS (output_len=2507, exc_len=0)
11-mobile-home: PASS (output_len=35, exc_len=0)
12-google-launch: PASS (output_len=1526, exc_len=0)
```

Steps 04-08 return `TITLE=404 - Page Not Found` / `H1=Page not found` (the 5x 404 the pre-review caught). The script marks them as `PASS` because it asserts title/H1, not 404 status. Full output (per-step `output`, `exception`, and `accumulators_raw`) captured in `0.dev-matrix/test-reports/webwright-full-app-2026-06-01/summary.json` with `generated_at: "2026-06-07T17:46:30+0530"`.

The `summary.json` was re-written by the re-run (file timestamp `07-06-2026 17:46:30`); the prior 2026-06-01 evidence in the same file was overwritten by this cycle's run. All per-step PNG screenshots under the same directory were also re-captured at `07-06-2026 17:46:09` to `07-06-2026 17:46:25` (10-otp-6digit.png, 02b-pricing-toggled.png, 10a-otp-direct.png, etc. kept their 01-06-2026 timestamps because that step had no DOM change triggered by this run).

## 5. Blast radius and out-of-scope confirmation

- **No code change this cycle.** The only diff in the bounded slice is the 2-line `Pragma/Expires` wiring from the 2026-06-07 build lane.
- **CRG/blast radius**: unchanged from the 2026-06-07 build lane; `code-review-graph_get_affected_flows_tool` previously reported 0 affected flows for the bounded slice.
- **Out of scope** (per scout §8): `apps/web` Python, migration `20260601223849` apply, live Razorpay probe, `npm run launch-check`, commit/push, `scripts/webwright/full_app_smoke.py` edits.
- **No new code blockers introduced.**
- **No new owner-side blockers introduced.**

## 6. Next action (review-gated, not build-gated)

The build lane cannot close the 5x 404 from the repo alone. The next action is review-gated:

1. **Preferred path (deploy)**: trigger a clean Heroku redeploy of the current `frontend/dist` from a reviewed commit on `main`, then re-run `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` to confirm steps 04-08 resolve to their owned pages (`Welcome Back - TruckOpti` for `/login`, etc.) instead of `404 - Page Not Found`.
2. **Alternative path (script widening)**: if the review lane prefers CI guardrails over a redeploy, widen scope to `scripts/webwright/full_app_smoke.py` so the 5x 404 steps fail loudly (returncode != 0) when the title is `404 - Page Not Found`. This is a script-only change and would prevent a future deploy drift from passing the smoke lane.

The `FINAL_REVIEW_VERDICT: changes-required` line in `LAST-REVIEW.md` remains correct. TO-107 is **not** marked done by this re-validation; the final review gate still needs either a clean redeploy or a smoke-script assertion widening.

## 7. Operational proof and verification labels

- **Changed**: this re-validation cycle made no code edits inside the queue ownerFiles slice. Out-of-slice: a new `0.dev-matrix/frame-artifacts/TO-107/BUILD-RESULT.md` (this file) with the freshest 2026-06-07 17:46 proof evidence, and a `0.dev-matrix/test-reports/webwright-full-app-2026-06-07-to107-build/smoke.log` capturing the raw proof stdout.
- **Pending**: a clean Heroku redeploy of the fresh `frontend/dist`, or a script-widening edit to `scripts/webwright/full_app_smoke.py` so the 5x 404 steps fail loudly. Both paths are review-gated.
- **Verified**: local `frontend/dist` is fresh (rebuilt 2026-06-07 17:24:12) with all route chunks; `d:/Github/Truck_Opti/.venv/Scripts/python.exe scripts/webwright/full_app_smoke.py` re-ran 13/13 at 2026-06-07 17:46:30 IST with 0 console errors / 0 4xx-5xx captured in `accumulators_raw`, but steps 04-08 still return the pre-review 404 title/h1.
- **Operational proof**: the falsifying read at 2026-06-07 17:46 re-confirms the pre-review's deploy-drift hypothesis — the bounded-slice code is sound, the live host is stale, and the 5x 404 will persist until a clean redeploy ships the current `frontend/dist`.
- **Continue from**: read this artifact, then hand to the review lane for the deploy-vs-script decision.
- **Next step**: run `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\resume-work.ps1`, present this artifact and the unchanged `LAST-REVIEW.md` build-lane section to review, and let review pick the deploy or the script-widening path.
- **Technical debt**: the smoke script's `PASS (route 404)` labelling is a known gap — it should fail when the title is `404 - Page Not Found`. This is a future-scope widening, not a TO-107 fix.
- **Blockers**: live Razorpay production keys and `SEED_DEMO_PASSWORD` remain external owner-side blockers; the 5x 404 is an operational/deploy blocker, not a bounded-slice code defect.
