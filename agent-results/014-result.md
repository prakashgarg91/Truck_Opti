# TO-124 result — Audit real provider capability and fail closed

**Verdict: PASS** (worker level — ready for GPT-6 review; does not authorize DONE, deployment or live changes).
**Date:** 2026-10-01 · **Branch:** `main` (single writer; no push) · **Brief:** `agent-tasks/014-provider-capability-audits.md`

## What changed and why

The previous tooling had three fail-open holes: `summarizeAuthProviders` counted a GIS client ID as a production auth provider even though the button now creates a trusted Supabase OAuth round trip (TO-122 contract); `summarizeSupabase` passed on DNS resolution alone (a resolved but dead backend was "production ready"); `phonepe_mode` reported **PASS when its URL was missing** (`scripts/production_config_audit.mjs:127` — `isPhonePeNonProduction(undefined) ? 'fail' : 'pass'`). Frontend and policy also disagreed on defaults: `LoginPage.tsx:21` treats a missing `VITE_AUTH_EMAIL_OTP_ENABLED` as enabled (`!== 'false'`) while the policy required `'true'`; and `frontend/src/lib/supabase.ts` treated *any* non-empty URL/key — including the documented `.env.example` placeholders — as configured, so a copied `.env.example` produced live requests to a placeholder backend (the same class as the assessment's `ERR_NAME_NOT_RESOLVED` evidence against the dead configured host).

### One explicit capability model

`frontend/src/lib/authCapabilities.ts` (new) defines the shared vocabulary — `intentionally_disabled | missing | placeholder | invalid | configured | reachable | operationally_verified` — with pure, tested helpers:

- `resolveSupabaseConfig` — missing/placeholder/invalid URL or key ⇒ **local-first mode** with the safe placeholder client; `configError` diagnostics never echo key values.
- `probeSupabaseReachable(fetchFn, url, {timeoutMs})` — bounded health probe; never fetches an invalid/absent URL; non-ok health ⇒ unreachable (fail closed).
- `resolveAuthMethodCapabilities` — cloud methods (Google-via-Supabase, email OTP, phone OTP) require an **explicit `'true'` flag AND a configured Supabase backend**; Google is enabled by the backend per the TO-122 contract (a GIS client ID alone is device tooling, never cloud sign-in proof); office password is tracked separately and never counts as a cloud method.
- `validateOfficePassword` / `OFFICE_PASSWORD_MIN_LENGTH = 8` — the approved policy from `supabase/config.toml:178` (`minimum_password_length = 8`), enforced separately from cloud methods.

`frontend/src/lib/supabase.ts` is now a thin adapter over it: same public exports (`supabase`, `isSupabaseConfigured`, `isSupabaseReachable` — no consumer changes needed), plus `supabaseConfigError`/`supabaseConfigResolution`. Offline/auth initialization makes **no requests to an absent placeholder backend**; an **explicitly configured unreachable backend** gets bounded outage handling (probe fails closed within `timeoutMs`, cached per session) instead of unbounded or placeholder traffic.

### Fail-closed audits (scripts/)

`scripts/production_config_policy.mjs` now exports testable capability summarizers; `scripts/production_config_audit.mjs` composes them into 9 checks (`app_url`, `supabase_client_key`, `supabase_auth_backend`, `auth_provider_configuration`, `office_password_policy`, `razorpay_launch_readiness`, `phonepe_mode`, `sentry_dsn`, `vite_secret_exposure`) and gains an `AUDIT_CONFIG_JSON` env input so the audit can be dry-run without Heroku (the default remains `heroku config --json`; `launch-readiness.ps1` only checks exit code + report existence, so it is unaffected).

- **Supabase backend**: URL must be valid https non-placeholder; DNS failure, non-ok health, or health-request failure all fail; pass requires `reachable`. Key presence is its own check; key values and response bodies are never logged.
- **Auth providers**: needs ≥1 cloud method = explicit flag + configured backend. GIS-only or flag-without-backend ⇒ fail with the reason stated. `operationally_verified` is never claimable by a static check (`liveProofRequired: true`).
- **Office password**: flag off ⇒ `not_applicable` (intentionally disabled); flag on ⇒ fail with the approved minimum-8 policy named and live verification required — never counted as a cloud method.
- **Payments**: Razorpay stays the **selected** provider (missing ⇒ fail; `rzp_test_` ⇒ fail — the production prohibition is retained; live key ⇒ configured + live proof required). PhonePe absent ⇒ **`not_applicable` (intentionally disabled, not falsely verified)**; partial config ⇒ fail; sandbox/preprod selected for production ⇒ fail; unexpected host ⇒ fail; production URL ⇒ configured + live proof required.
- **Secret leakage (new)**: any `VITE_` var whose name is secret-shaped (`SECRET|SERVICE_ROLE|PRIVATE_KEY|PASSWORD|_TOKEN`, excluding `*_ENABLED` flags) with a non-placeholder value ⇒ fail, listing **names only**.
- **Verdict**: `local_only` (no backend configured) / `not_ready` (any failed check) / `config_ready`; `productionReady` is **always false** from this static audit, with explicit blockers — a passing local smoke can never leak into a cloud-ready claim.

`scripts/frontend_launch_smoke.mjs`: health check skips placeholder URLs with an explicit reason, stops logging the raw health body (`bodyIndicatesMissingApiKey` boolean instead), and the report now carries `backendMode` + `verdict` (`local_first_smoke` vs `cloud_config_smoke_ok_pending_live_proof` vs `failed`) with a note that a local-first pass is **not** a cloud-ready verdict. Genuine cloud failures still fail the run.

`frontend/.env.example`: documents the TO-122 Google contract (GIS client ID no longer used for sign-in), placeholder detection, PhonePe disabled-by-default semantics, and the office password policy.

### Changed files (all inside the brief's allowed scope)

| File | Change |
| --- | --- |
| `frontend/src/lib/authCapabilities.ts` | New: canonical capability model (levels, config resolution, bounded probe, method capabilities, office password policy). |
| `frontend/src/lib/authCapabilities.test.ts` | New: 16 tests over the model. |
| `frontend/src/lib/supabase.test.ts` | New: 6 env-wiring tests (`stubEnv` + `resetModules` pattern from `phonepePayment.test.ts`). |
| `frontend/src/lib/supabase.ts` | Rewritten as adapter over `resolveSupabaseConfig`/`probeSupabaseReachable`; placeholder values no longer "configured"; exports preserved. |
| `scripts/production_config_policy.mjs` | Capability summarizers; hardened `shouldRunSupabaseHealthCheck`; rewritten `summarizeAuthProviders`; new Supabase key/backend, office-password, PhonePe, app-URL, secret-exposure summarizers; `summarizeRazorpay` moved here from the audit. |
| `scripts/production_config_policy.test.mjs` | Rewritten: 37 tests covering every required fixture. |
| `scripts/production_config_audit.mjs` | Composed checks + verdict/proof-level report; `AUDIT_CONFIG_JSON` dry-run input; `runAudit(config, deps)` exported with injectable DNS/health. |
| `scripts/production_config_audit.test.mjs` | New (small test within the stated scripts subsystem): 8 report-level fixture tests. |
| `scripts/frontend_launch_smoke.mjs` | No raw body logging; placeholder skip reason; `backendMode`/`verdict`/note in report and console. |
| `frontend/.env.example` | TO-122 Google contract + capability semantics documented. |

## Red/green regression evidence

- **Red — policy suite**: new `scripts/production_config_policy.test.mjs` against the old module ⇒ file-level failure `SyntaxError: The requested module './production_config_policy.mjs' does not provide an export named 'isValidBackendUrl'` (0 pass / 1 fail). Implementing the module ⇒ **37/37 pass**.
- **Red — frontend capability suites**: `npx vitest run src/lib/authCapabilities.test.ts src/lib/supabase.test.ts` before implementation ⇒ **2 files failed, 4 failed / 2 passed** (failures exactly on placeholder-detection, `supabaseConfigError`, and explicit-flag semantics; the 2 passes are behaviors that already held, e.g. no fetch when unconfigured). After implementation ⇒ **28/28 pass**.
- **Red — audit report tests**: `production_config_audit.test.mjs` caught a real defect in my first implementation — `VITE_AUTH_PASSWORD_ENABLED` matched the secret-name pattern, failing the clean fixture with `expected 'config_ready' … actual 'not_ready'`. Fixed with the `*_ENABLED` flag exclusion + a new regression case ⇒ **8/8 pass**. (`tsc` additionally caught two loosely-typed fetch mocks in the new tests; fixed.)

## Required-fixture coverage (brief's list → where proven)

| Fixture | Proven by |
| --- | --- |
| missing anon key | `summarizeSupabaseClientKey(undefined)` + `resolveSupabaseConfig` missing-key cases (policy test + frontend test) |
| NXDOMAIN / health failure | policy tests with injected failing `dnsLookup` / 503 `fetchHealth`; audit tests (`nxdomainDeps`); live CLI dry-run below |
| placeholder Google ID | policy tests (placeholder + GIS-only cases) |
| all methods disabled | policy + audit tests (`no production cloud authentication method`) |
| valid Google cloud settings | policy + audit tests (Google-via-Supabase counted, GIS id also present) |
| office password off | policy + audit tests (`not_applicable`) |
| disabled PhonePe | policy + audit tests (`not_applicable`, never a false pass) |
| sandbox selected for production | policy + audit tests (fail) |
| VITE secret leakage | policy + audit tests (fail; names only; value never in report JSON) |
| localhost browser DNS-error reproduction | launch smoke against dead-host build (below) |

## Verification (all run this session, Node v24.14.0 host, Windows)

| # | Check | Command (dir) | Result | Evidence class |
| --- | --- | --- | --- | --- |
| 1 | Production provider policy | `node --test scripts/production_config_policy.test.mjs` (repo root) | exit 0 — **37/37** | Mock fixtures |
| 2 | Audit report policy | `node --test scripts/production_config_audit.test.mjs` (repo root) | exit 0 — **8/8** | Mock fixtures (injected DNS/health) |
| 3 | Remaining policy suites (regression) | `node --test scripts/{deployment_safety,payment_readiness_policy,security_boundary_policy,launch_gate_policy}.test.mjs` (root) | exit 0 — **4/4, 1/1, 1/1, 14/14** | Static/source |
| 4 | Build + typecheck | `npm --prefix frontend run build` (`tsc && vite build`) (root) | exit 0; built in 12.96 s; pre-existing warnings only | Local build |
| 5 | Full unit suite | `npm test` (root) | exit 0 — **413/413 passed, 28 files** (baseline 385/385, 26 files + 28 new tests in 2 new files) | Mock (jsdom) |
| 6 | Public browser smoke (local-first) | `PUBLIC_APP_URL=http://127.0.0.1:4173 npm run test:public-smoke` (root, preview server) | exit 0 — **12/12 routes** | Local build, no backend |
| 7 | Core launch smoke (local-first) | `PUBLIC_APP_URL=http://127.0.0.1:4173 npm run test:frontend-smoke` (root, preview server) | exit 0 — **52/52**, report `backendMode: local_first`, `verdict: local_first_smoke` | Local build, no backend |
| 8 | Lint | `npm --prefix frontend run lint` (root) | exit 0 — **0 errors, 26 warnings** (identical to baseline) | Local |
| 9 | DNS-error reproduction | local-first dist rebuilt with `VITE_SUPABASE_URL=https://to124-dead-backend.invalid`; then `PUBLIC_APP_URL=http://127.0.0.1:4173 SUPABASE_PUBLIC_URL=https://to124-dead-backend.invalid npm run test:frontend-smoke` | **exit 1 — 39/52**; `/login` console error exactly `net::ERR_NAME_NOT_RESOLVED` with **0 page errors** (graceful offline handling); auth-service check `DNS lookup failed: getaddrinfo ENOTFOUND`; `verdict: failed`, `backendMode: cloud` — genuine cloud failure surfaced, not suppressed | Local build vs reserved `.invalid` host (deterministic NXDOMAIN; no real service contacted) |
| 10 | Audit dry-run, local-first | `AUDIT_CONFIG_JSON='{}' node scripts/production_config_audit.mjs` (root) | exit 1 — `Verdict: local_only (productionReady=false)`; 6 FAIL / 2 N/A | Configuration fixture (mock) |
| 11 | Audit dry-run, cloud + dead host + sandbox PhonePe + leaked secret | `AUDIT_CONFIG_JSON='{...fixture...}' node scripts/production_config_audit.mjs` (root) | exit 1 — `Verdict: not_ready`; backend DNS FAIL, razorpay client-secret FAIL, phonepe sandbox FAIL, secret-exposure FAIL; report JSON does **not** contain the secret value | Configuration fixture (mock) |

Note on #9 vs #7: a dead-backend build fails every public-route check because the smoke's `resetSession` visits `/login` first and LoginPage's reachability probe (`LoginPage.tsx:152`) logs the DNS error into each subsequent route's accumulated console-error list. This over-attributes failures per route but is fail-closed-safe; the local-first baseline (#7) is clean. No failures were suppressed anywhere.

## Assumptions

- Razorpay remains the selected production payment provider (per `docs/payment-production-handoff.md` and TO-117); PhonePe is optional — its absence is reported as intentionally disabled, never as verified. If the owner selects PhonePe as primary instead, the policy constants change in one place (`summarizePhonePe`/`summarizeRazorpay`).
- `AUDIT_CONFIG_JSON` on the audit script is for dry-runs/tests; CI and `launch-readiness.ps1` keep using live Heroku config. A dry-run's evidence class is fixture/mock, never live production configuration.
- The reserved `.invalid` TLD is treated as a *valid-shaped* URL (probeable) precisely so an explicitly configured dead backend is reported as an outage rather than pre-classified as invalid — that is what makes check #9 possible.
- Host Node v24 ran the checks; repository engines/CI still select Node 20 (TO-138 owns runtime alignment).

## Unresolved risks / handoff notes for review

- **LoginPage/SignupPage default divergence remains (out of scope).** `frontend/src/pages/auth/LoginPage.tsx:21` and `SignupPage.tsx:18` still treat a missing `VITE_AUTH_EMAIL_OTP_ENABLED` as enabled (`!== 'false'`), while the canonical model (`authCapabilities.resolveAuthMethodCapabilities`) and the policy now require an explicit `'true'`. Both files are outside this brief's allowed scope; **TO-123 should adopt `resolveAuthMethodCapabilities`/`isSupabaseConfigured` on those surfaces** (its brief already owns login-surface consistency).
- The smoke's per-route console-error accumulation across `resetSession` (see note above) could be tightened to per-navigation attribution in a later pass; current behavior over-fails rather than hides failures.
- `VITE_GOOGLE_CLIENT_ID` is now documented as device-local tooling only; no runtime file was changed to remove its remaining consumers (out of scope; none gate sign-in anymore per TO-122).

## Owner gates (unchanged; nothing executed)

- Live Supabase/auth/Google OAuth proof: needs recovered production project (TO-125), OAuth origins/callbacks and provider enablement — owner-controlled. No live OAuth executed.
- Heroku production config audit against the real app: needs authenticated Heroku CLI (`heroku config --json`); the audit script is ready but was not run against live config.
- Razorpay/PhonePe live or sandbox provider proof, production deploy, `VITE_*` redeploy coordination, credential operations: owner-gated as before.

## Next smallest step

GPT-6 review of this slice. TO-123 (login surfaces) then adopts the canonical capability model on LoginPage/SignupPage (closing the flag-default divergence) and fixes the stale LoginPage GIS comment. TO-137 reuses `summarizePhonePe`/`summarizeRazorpay` statuses for its sandbox convergence harness.

## Git state

- `main` at `9cd28fad` + this task's single cohesive commit (code, tests, result file, TASKS.md row → AWAITING_REVIEW). Not pushed (main-only policy).
- Pre-existing untracked items preserved untouched: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`.
- `frontend/dist/` and `logs/` are gitignored; the working tree contains no scratch edits outside the listed files.
