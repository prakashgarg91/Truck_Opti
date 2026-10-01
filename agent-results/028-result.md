# TO-138 Result — Align supported Node runtime and close quality warnings

**Verdict: PASS** (ready for GPT-6 review; does not authorize DONE, deployment or live changes)
**Date:** 2026-10-01 · **Worker:** GLM-5.3 Flash (TO138) · **Branch:** `main` (single writer, no push)

## Summary

Build, CI and container now select one supported runtime — Node 24 LTS (engines `24.x` in `package.json` + lockfile, `node:24-alpine` in the Dockerfile, `node-version: 24` in CI) — enforced by a new `scripts/supported_runtime_policy.test.mjs` policy gate added to CI. All 26 recorded lint warnings were resolved with real types/deps (no rule disables, cap lowered 80 → 0), and remaining build warnings carry evidence-backed vendor dispositions. Along the way a surfaced defect in `driverEarningsApi.getEarnings` (30-day earnings silently always 0) was fixed red/green, and a new dompurify DOM-XSS advisory (advisory-DB drift after the 2026-09-30 clean audit) was patched 3.4.14 → 3.4.16.

## Node runtime decision (evidence)

Fetched https://raw.githubusercontent.com/nodejs/Release/main/schedule.json (2026-10-01):

| Line | LTS start | Maintenance | End of life |
|---|---|---|---|
| v20 | 2023-10-24 | 2024-10-22 | **2026-04-30 (already EOL at execution date)** |
| v22 | 2024-10-29 | 2025-10-21 | 2027-04-30 |
| **v24** | **2025-10-28** | 2026-10-20 | **2028-04-30** |

Local checks already run on Node 24.14.0; Node 20 selection was a live EOL risk, so v24 is aligned everywhere it is selected. `heroku.yml` needed no change: it builds `Dockerfile` and `run: web: node server.js` executes inside that image (verified below at v24.21.0).

## Changed files

**Runtime alignment**
- `package.json` — `engines.node`: `20.x` → `24.x`
- `package-lock.json` — root entry `engines.node` synced to `24.x` (npm ci would otherwise fail)
- `Dockerfile` — `FROM node:20-alpine` → `node:24-alpine`
- `.github/workflows/frontend-ci.yml` — `node-version: 20` → `24`; new step `Test supported runtime policy`
- `scripts/supported_runtime_policy.test.mjs` — NEW: 4-assertion policy gate (engines, lockfile sync, Dockerfile, CI)

**Lint warning closure (all 26)**
- `frontend/src/pages/AdminContactPage.tsx` — `useCallback` deps `[language]` → `[]` (`language` never used in callback)
- `frontend/src/pages/AdminDriversPage.tsx` — deps `[tab, language]` → `[tab]`; removed now-unused `useLanguageStore` import/subscription
- `frontend/src/pages/AdminPayoutsPage.tsx` — deps `[authLoading, language, user?.role]` → `[authLoading, user?.role]`; removed unused store import
- `frontend/src/pages/DriverEarningsPage.tsx` — `loadData` deps `[language]` → `[]`; removed unused store import
- `frontend/src/services/customerSupabaseApi.ts` — 16 `any` replaced with real types: new `TruckRow` (from `database.types.ts`), `ShipmentJobOfferTrackingRow` (matches the `get_shipment_job_offer_tracking` RETURNS TABLE in `supabase/migrations/20260730110000`), `DriverTripRow` + shared `toDriverTrip` normalizer, `DriverEarningsJobRow`; typed `{ status; delivered_at? }` update payload
- `frontend/src/pages/AgencyJobsPage.tsx` — `j: any` replaced with a page-local `AgencyPortalJobRow` describing the actual `agency-portal-jobs` edge-function payload
- `frontend/src/pages/DriverDashboardPage.tsx` — dropped 2 redundant `as Record<string, any>` casts (value already `Record<string, unknown>`)
- `frontend/src/pages/TrackingPage.tsx` — necessary consumer ripple of the typed RPC: `photo_*_url` now `string | null`, so `?? undefined` on the `jobPhotos` state assignment
- `frontend/src/services/contactInquiry.test.ts` — removed unnecessary `as any` (literal already satisfies `StoredContactInquiry`)
- `frontend/src/services/customerSupabaseApi.test.ts` — complete typed `Omit<ShipmentDetail, 'id'|'created_at'|'updated_at'>` fixture replaces 2 `as any`; new regression test (below)
- `frontend/package.json` — lint cap `--max-warnings 80` → `0` (lowered, not raised)

**Quality warnings / audit drift**
- `frontend/package-lock.json` — bounded 3-package diff: `caniuse-lite` 1.0.30001762 → 1.0.30001814 + `baseline-browser-mapping` 2.9.11 → 2.11.26 (refresh via `npx update-browserslist-db@latest`; tool reported "No target browser changes"), and `dompurify` 3.4.14 → 3.4.16 (targeted security patch, see surfaced findings)

## Red/green regression evidence

1. **Runtime policy** — `scripts/supported_runtime_policy.test.mjs` written first: RED against Node 20 config (`node --test scripts/supported_runtime_policy.test.mjs`, repo root, exit 1: engines/Dockerfile/CI assertions failed against `20.x`/`node:20-alpine`/`node-version: 20`), GREEN after alignment (exit 0, 4 pass / 0 fail).
2. **getEarnings 30-day window** — `customerSupabaseApi.test.ts > driverEarningsApi.getEarnings > selects created_at and computes last_thirty_days from it (regression TO138)` written first: RED (`npx vitest run -t "regression TO138"`, frontend, exit 1: `expected 'shipments(estimated_cost)' to contain 'created_at'`), GREEN after adding `created_at` to the select (full suite pass). Root cause: the query selected only `shipments(estimated_cost)` but filtered `trip.created_at >= thirtyDaysAgo` — against real Supabase `created_at` was always `undefined`, so `last_thirty_days` was silently 0 in production.

## Build-warning dispositions (evidence-backed; no suppression, no vendor rewrites)

- **PGlite nodefs browser-external (4 warnings)** — measured: `@electric-sql/pglite@0.5.8` `dist/index.js` dynamically imports `./fs/nodefs.js` only when the dataDir is a filesystem path (`file://`), per its own protocol detection (`idb://`/`opfs-ahp://`/`memory://` otherwise). The app uses the documented browser entry already (`frontend/src/lib/localDb.ts:4,89` — default import with `idb://truckopti-v1`, `memory://` in tests) and never passes `file://`. The module lands as an unreachable 0.46 kB stub chunk; PGlite 0.5.8's exports map has no browser condition to select instead. Disposition: keep app imports as documented; no config alias hack (brittle across vendor upgrades); fixed upstream by a browser export condition. Risk: none reachable from app code.
- **PGlite eval (4 warnings)** — `eval` occurrences are in PGlite's dist (`chunk-DDJLRBDX.js`, `index.js`) — emscripten/WASM glue for the bundled Postgres. Vendor-generated; not removable without rewriting vendor files. The engine is lazily loaded (`pglite-vendor` chunk) and runs a local WASM Postgres; supply-chain risk is covered by the production npm audit (0 vulnerabilities). Disposition: attribute to vendor, monitor via audits, no suppression.
- **Chunk size (4 chunks > 500 kB)** — `three-vendor` 1,033.85 kB (gzip 290.39), `excel-vendor` 890.20 (330.53), `pdf-vendor` 589.16 (174.42), `pglite-vendor` 532.69 (130.46). All are vendor `manualChunks`, all lazy-loaded behind `React.lazy` route pages (`App.tsx:25+`) / dynamic import (`localDb.ts`), all excluded from PWA precache (`globIgnores`) and runtime-cached CacheFirst (90 days, content-hashed). The initial-route JS (`index` chunk) is 429.79 kB (gzip 113.72) — below the 500 kB threshold. Disposition: keep the warning as an honest signal; do not raise `chunkSizeWarningLimit`; splitting further would break vendor chunking without user-visible benefit.
- **Browserslist (1 warning)** — resolved properly, not suppressed: caniuse-lite data refreshed with zero target-browser changes.
- **PWA sizes** — precache 85 entries, 1,650.77 KiB (baseline 1,651.13 KiB); large vendor chunks remain out of precache by design.

## Verification (all executed this session)

| Check | Command (dir) | Exit | Counts / result | Evidence class |
|---|---|---|---|---|
| Clean root install | `npm ci` (root) | 0 | 25 packages, 0 vulnerabilities | local |
| Clean frontend install | `npm ci --prefix frontend` (root) | 0 | 768 packages | local |
| Runtime policy | `node --test scripts/supported_runtime_policy.test.mjs` (root) | 0 | 4 pass / 0 fail (RED exit 1 before changes) | static config |
| Other policy gates | `node --test scripts/{production_config_policy,deployment_safety,payment_readiness_policy,security_boundary_policy}.test.mjs` (root) | 0 each | 37/4/1/2 pass, 0 fail | static config |
| Lint (zero-warning cap) | `npm --prefix frontend run lint` (root) | 0 | 0 errors / **0 warnings** (baseline: 0/26) | static |
| Typecheck | `npx tsc --noEmit` (frontend) | 0 | 0 errors | static |
| Build + PWA | `npm --prefix frontend run build` (root) | 0 | 3042 modules; precache 85 entries / 1650.77 KiB; browserslist warning gone | local |
| Unit tests | `npx vitest run` (frontend) | 0 | **454/454** across 28 files (incl. new regression test) | mock |
| Packing regression | `npm run test:packing` (root) | 0 | 18/18 checks | local deterministic |
| Server routing | `npm run test:server-routing` (root) | 0 | 10/10 (node:test) | local |
| Start health | `node server.js` + `curl /healthz` (root) | 0 | `/healthz` HTTP 200, root 200 | local (Node 24.14.0) |
| Container build | `docker build -t truckopti:to138 .` (root) | 0 | image built from `node:24-alpine` | local |
| Container health | `docker run … -p 3100:3000` + `curl /healthz` + `node --version` | 0 | healthz HTTP 200; **node v24.21.0 inside container** | local |
| Public browser smoke | `npm run test:public-smoke` (root, preview :4173) | 0 | 12/12 routes | local browser (Playwright, local-first) |
| Launch smoke | `npm run test:frontend-smoke` (root, preview :4173) | 0 | 52/52 checks, verdict `local_first_smoke` | local browser (Playwright, local-first) |
| Root production audit | `npm audit --omit=dev` (root) | 0 | 0 vulnerabilities | live advisory DB |
| Frontend production audit | `npm audit --prefix frontend --omit=dev` (root) | 0 | 0 vulnerabilities (1 low found before the dompurify patch) | live advisory DB |
| Legacy/Python audit | `python -m pip_audit -r requirements.txt` (apps/web) | 0 | no known vulnerabilities | live advisory DB |
| Engines compatibility | scan of all installed `engines.node` vs 24.14.0 (root + frontend) | 0 | 489 declaring packages, 0 incompatible | local |

CI itself (`frontend-ci.yml`) now runs `npm ci` on Node 24 plus the new runtime-policy step, but executing that workflow requires a GitHub push — owner-gated, see below.

## Assumptions and surfaced findings (for review)

1. **Behavior changes (small, disclosed):**
   - The three admin/driver pages no longer refetch on language toggle; the fetched data is language-independent (no language parameter reaches those API calls), so this removes redundant network work only.
   - `getEarnings` now selects `created_at`, so `last_thirty_days` reflects real data instead of always 0 (red/green above).
   - `driverTripsApi` mappings now coerce `estimated_cost` through `Number()` to honor the declared `number` type (numeric columns arrive as JSON numbers; string numerics convert).
   - `AgencyJobsPage`: `driver_id` null → `undefined` (falsy-equivalent for all consumers) and `shipment_id` null → `''` (prevents a `.slice()` crash on null).
2. **`agencyJobsApi.list()` declares `AgencyJob[]` but the edge function returns raw un-mapped rows** (`agency-portal-jobs` GET). Fixed page-locally with an honest row type; the service-level return type should be corrected when the agency subsystem is next touched (out of TO-138 scope). Related gap: the edge function does not select `shipments.vehicle_type`, so the page's `vehicle_type` is always `—` (pre-existing; reported, not changed).
3. **dompurify advisory drift:** HEAD's lockfile already pinned 3.4.14 (in the newly-published vulnerable range 3.4.13–3.4.15); the 2026-09-30 "0 vulnerabilities" audit predated the advisory. Patched to 3.4.16 within the existing `>=3.4.11` override — targeted, not a blanket upgrade.
4. A stale `vite preview` server from a previous session (port 4173) and its `esbuild.exe` service were stopped to unblock `npm ci` (Windows file locks); no other processes touched.
5. Pre-existing untracked items `.vscode/mcp.json.bak-qdrant-cleanup` and `closeout-logs/` were preserved untouched (TO-140 scope).

## Owner gates (not executed)

- GitHub CI run on Node 24 (requires push — not performed per policy).
- Heroku/config production deploy of the `node:24-alpine` image (owner-gated; Heroku CLI previously required login).
- No hosted Supabase, payment, credential or production-database actions were taken or needed.

## Next smallest step

Supervisor review of this result; after acceptance, push `main` so GitHub CI executes the Node 24 pipeline, then update TO-118's status (TO-138 was one of its waiting children). If the supervisor prefers `last_thirty_days` unchanged, revert the one-line select fix and the regression test — everything else stands alone.

## Git state at writing

- Branch `main` at `015088f4` + this task's commit (staged: the 17 files listed above; pre-existing untracked `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/` untouched and unstaged).
- Not pushed; no branches/worktrees/stashes created.
