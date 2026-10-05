# TO-132 result — Complete safe error reporting and health proof

**Verdict: PASS** (worker level — ready for GPT-6 review; does not authorize DONE, deployment or live changes).
**Date:** 2026-10-05 · **Branch:** `main` (single writer; no push) · **Brief:** `agent-tasks/022-sanitized-observability.md`
**Implementation commit:** `33c8b799` — `feat(monitoring): sanitized production error reporting and health drift check (TO-132)`

## What changed and why

Assessment item 10 found three gaps: `logger.error` was compiled out of production, Sentry was initialized with no sanitizer/release policy and `replaysOnErrorSampleRate: 1.0` (replay not actually integrated but not explicitly disabled), and the live deployment answers `/healthz` and `/readyz` with SPA HTML instead of JSON. This slice closes the two code gaps and adds a detection tool for the third.

### `frontend/src/utils/monitoring.ts` (new) — sanitized reporting funnel

- **Bounded redaction** (depth 6, ≤20 array items, ≤50 object keys, strings scanned to 100k and truncated to 2k, cycle-safe):
  - key-name rules on tokenized keys (`password`, `pwd`, `secret`, `token`, `jwt`, `otp`, `passcode`, `pin`, `cvv/cvc`, `card`, `aadhaar/aadhar/pan/passport/licence/dl/kyc`, `document(s)`, `authorization`, `cookie(s)`, `credential(s)`, `signature`, `apiKey`/`*_key` pairs, `session`, `refresh`, `private`, `bearer`, `upi/vpa/ifsc/account/iban`, `email/phone/mobile`) — tokenization avoids false hits like `company_name`/`error_code`/`panelId`;
  - content rules for `Bearer/Basic/Token <credential>`, JWTs, Razorpay `sk|pk|rk_live|test_*`, Google `AIza*`, `name=value` credential pairs (queries/cookies/kv logs), URL userinfo (`https://user:pass@host`), Aadhaar (spaced/contiguous), PAN, Luhn-valid card shapes, emails, Indian mobile numbers.
- **Sentry policy:** `sendDefaultPii: false`; `beforeSend = sanitizeErrorEvent` (whole event walk; `user` reduced to `{ id }`; headers/cookies/query/URL handled by the shared rules); `beforeBreadcrumb = sanitizeBreadcrumb` (drops `ui.input` breadcrumbs, which can carry typed credentials; sanitizes the rest); replay explicitly disabled (`replaysSessionSampleRate: 0`, `replaysOnErrorSampleRate: 0`, no replay integration installed); `traceSampleRate` 0.1 unchanged; `release` from `VITE_SENTRY_RELEASE`/`VITE_APP_VERSION` (fallback `truckopti-web@unknown`), `environment` from `import.meta.env.MODE`.
- **Owned uncaught capture:** Sentry's default `GlobalHandlers` integration is filtered out and this module installs `window` `error` + `unhandledrejection` handlers, so capture behavior is identical in enabled/absent mode, testable, and not double-reported.
- **Sentry absent mode:** no DSN → no SDK init, no handlers, every reporting call is a safe no-op. Reporting failures are swallowed so they can never break a user flow.
- **Staging probe:** `sendStagingMonitoringProbe()` sends one obviously-fake `MonitoringStagingProbe` event whose payload exercises key-based and content-based redaction; it is only reachable when `VITE_SENTRY_STAGING_PROBE=1` is baked into a build.

### Routed reporting

- `frontend/src/utils/logger.ts` — `log/warn/info` stay dev-only; `error` now reports through `reportLoggedError` (Error argument → exception, remaining arguments → bounded sanitized context; message-only calls → error-level message) in addition to the development console.
- `frontend/src/components/ErrorBoundary.tsx` — comment corrected; the caught error and component stack already flow through `logger.error` into the funnel. Public fallback UI unchanged.
- `frontend/src/main.tsx` — raw `Sentry.init` replaced by `initMonitoring()`; the opt-in staging probe hook sets `window.__truckoptiMonitoringProbe`. A clean production build tree-shakes the probe branch entirely (verified: `MonitoringStagingProbe` absent from `frontend/dist/assets`).

### `scripts/check-deployment-health.mjs` (new) + `server.js` comment

- Validates `/healthz` and `/readyz` response **status, `application/json` content type and body shape**; verdicts: `healthy`, `spa-fallback`, `redirect`, `http-status`, `content-type`, `unparseable-json`, `payload-shape`, `payload-value`, `not-ready`, `unreachable`. Exit 0/1/2; `--timeout=ms`, `--json`, base URLs (default `HEALTH_BASE_URL` or `http://127.0.0.1:3000`).
- `server.js` gained a comment stating `/healthz` is process liveness and `/readyz` is frontend-artifact readiness, that neither proves Supabase/auth/payment availability, and pointing at the drift check. No behavior change.

### Tests

- `frontend/src/utils/monitoring.test.ts` (new, 16 tests): nested secrets, exception message/stack scrubbing, request headers/cookies, breadcrumbs (`ui.input` dropped, console scrubbed), URL credentials/query, card/PAN/Aadhaar/phone shapes, non-Luhn reference preserved, depth/array/cycle bounds, key classification, full `beforeSend` policy, absent mode (no init, no handlers, no-ops), init-throw fail-closed, init policy + idempotency + caught reporting, uncaught error/unhandled-rejection capture, `logger.error` routing, staging probe redaction.
- `scripts/test-server-routing.mjs`: explicit JSON content-type assertions; readiness 503 `{status:"not_ready"}` when `index.html` is absent; drift check passes against the real server; drift classifier rejects `not_ready` and wrong 200 payloads; **drift check detects SPA fallback HTML pretending to be health** (fake HTTP server serving HTML).

### Docs

- `docs/payment-production-handoff.md` — added the operational links section: drift-check command, monitoring policy summary, staging-probe runbook, and the note that `VITE_SENTRY_*` are build-time values not yet forwarded by `deploy-heroku.sh` (out of scope here).

## Changed files (all inside the brief's allowed scope)

| File | Change |
| --- | --- |
| `frontend/src/utils/monitoring.ts` | New: sanitizer, Sentry init policy, reporting funnel, owned uncaught capture, staging probe. |
| `frontend/src/utils/monitoring.test.ts` | New: 16 tests (fixtures, absent mode, caught/uncaught, policy wiring). |
| `frontend/src/utils/logger.ts` | `error` routes to sanitized reporting. |
| `frontend/src/components/ErrorBoundary.tsx` | Comment corrected; fallback UI untouched. |
| `frontend/src/main.tsx` | `initMonitoring()` + opt-in staging probe. |
| `server.js` | Comment: liveness vs readiness scope; drift-check pointer. |
| `scripts/check-deployment-health.mjs` | New: JSON content-type/body health drift check CLI. |
| `scripts/test-server-routing.mjs` | +5 tests, +2 content-type assertions. |
| `docs/payment-production-handoff.md` | Operational verification/runbook links only. |
| `TASKS.md` | TO-132 IN_PROGRESS (this commit), AWAITING_REVIEW (board commit). |

## Evidence

| Check | Command | Directory | Exit | Counts | Level |
| --- | --- | --- | --- | --- | --- |
| Monitoring unit tests | `npx vitest run src/utils/monitoring.test.ts` | `frontend/` | 0 | 16 passed / 16 | mock (`@sentry/react` mocked) |
| Full unit suite | `npm test` | repo root | 0 | 36 files, 545 passed / 545 (TO-130 baseline 529 + 16 new) | mock |
| Routing/readiness/drift tests | `npm run test:server-routing` | repo root | 0 | 15 passed / 15 (was 10; +5) | local (real express server + real fetch) |
| Lint | `npm --prefix frontend run lint` | repo root | 0 | 0 errors, 0 warnings | local |
| Build | `npm --prefix frontend run build` (`tsc && vite build`) | repo root | 0 | built; pre-existing large-chunk/rollup warnings only | local |
| Root policy suite | `node --test scripts/production_config_policy.test.mjs scripts/deployment_safety.test.mjs scripts/payment_readiness_policy.test.mjs scripts/security_boundary_policy.test.mjs scripts/supported_runtime_policy.test.mjs` | repo root | 0 | 48 passed / 48 | local (source-level) |
| Glue check | `npm run glue:check` | repo root | 0 | 0 gaps, 0 warnings | local |
| Drift check CLI — healthy local release | `PORT=3117 node server.js` then `node scripts/check-deployment-health.mjs http://127.0.0.1:3117` | repo root | 0 | `/healthz` and `/readyz` both `healthy` (200 `application/json`) | local |
| Drift check CLI — live deployment (read-only) | `node scripts/check-deployment-health.mjs --timeout=15000 https://www.truckopti.in` | repo root | 1 | both probes `spa-fallback`: 200 `text/html`, body `<!DOCTYPE html>` — reproduces the assessment finding and proves detection | production (read-only GET, no change) |
| Drift check CLI — usage / unreachable | `node scripts/check-deployment-health.mjs --bogus`; `node scripts/check-deployment-health.mjs --timeout=3000 http://127.0.0.1:1` | repo root | 2 / 1 | usage error / `unreachable` verdict for both probes | local |
| End-to-end with the real SDK (local sink) | probe build (`VITE_SENTRY_DSN=http://public@127.0.0.1:3131/1 VITE_SENTRY_STAGING_PROBE=1 npm --prefix frontend run build`), local HTTP sink + headless Chromium | `frontend/`, repo root | 0 | 5 envelopes received by the sink; `MonitoringStagingProbe` event and deliberate uncaught `uncaught-from-browser-check` both present; 0 of 7 fake secrets leaked; `[REDACTED]`, `[REDACTED_CARD]`, `[REDACTED_AADHAAR]`, `[REDACTED_EMAIL]` present in the transmitted envelope; release `truckopti-web@unknown`, environment `production` | local + mocked transport endpoint (real `@sentry/react` 10.43.0, no Sentry backend) |
| Absent-mode browser smoke | clean build (`npm --prefix frontend run build`) served by `node server.js`, headless Chromium | repo root | 0 | app mounted, `window.__truckoptiMonitoringProbe` absent, 0 monitoring/Sentry console messages, 0 page errors | local |
| Reference-capture bundle check | `grep -rl "MonitoringStagingProbe" frontend/dist/assets` | repo root | 1 (no match) | probe branch tree-shaken from a clean production build | local |

**Red/green evidence.** (1) Drift detection red/green: the fake SPA server returns 200 `text/html` for both probes → `spa-fallback`, exit 1; the real local server → `healthy`, exit 0; the live deployment reproduces the red case. (2) Readiness red/green: `index.html` absent → 503 JSON `not_ready`; present → 200 JSON `ready`. (3) Dev-time red runs while writing the sanitizer (4/16 failing: card-vs-Aadhaar rule ordering, jsdom uncaught-error dispatch) were fixed to reach 16/16 — no pre-implementation red was captured for the module itself, so the sanitizer's safety is evidenced by fixtures and the real-SDK sink run, not by a failing-first test.

## Acceptance mapping

- **Operational errors are reportable without secret/PII leakage** — `logger.error`/boundary/uncaught paths funnel into sanitized reporting; 16 fixture tests; real-SDK local sink run shows both a controlled probe and an uncaught error arriving with every fake secret redacted and no leakage. ✅ (local/mock evidence)
- **Release/health verification detects SPA fallback pretending to be a health endpoint** — classifier + test with a fake SPA server, and the real live deployment is detected as drifted. ✅ (local test + production read-only detection)
- **`/healthz` liveness separate from `/readyz` artifact readiness; no claim they prove Supabase/providers** — server behavior unchanged, documented in code and docs; readiness fails closed (503 JSON) when the artifact is missing. ✅

## Not run / owner gates

- **Live staging Sentry event receipt: NOT RUN.** No staging DSN and no Sentry access exist in this environment; per the brief this check cannot be marked passed from a mocked call. Prepared: probe code (unit-tested), runbook in `docs/payment-production-handoff.md`, exact command buildable by the owner.
- **Production health fix: NOT DONE.** Live `/healthz`/`/readyz` still return SPA HTML (re-verified 2026-10-05). Moving them to JSON requires an owner-approved redeploy — outside worker authority.
- `VITE_SENTRY_DSN`/`VITE_SENTRY_RELEASE`/`VITE_SENTRY_STAGING_PROBE` are build-time; `deploy-heroku.sh` forwards only Supabase/app-URL values. Wiring it is out of this brief's scope, so production release tags will read `truckopti-web@unknown` until the owner extends the approved config set.

## Unresolved risks / limitations

1. **Heuristic, not a DLP:** unkeyed free-form values with no recognizable shape (e.g. a bare OTP `482913` inside a message) are not detectable without unacceptable false positives; card redaction requires a Luhn-valid 13–19 digit shape, so a mistyped card number is kept; a key like `value` holding a token is redacted only if the content matches a rule.
2. **Bounded caps drop context:** max 20 breadcrumbs/array items, 50 object keys, depth 6, 2k-char strings after a 100k scan bound. Deliberate; reduces debuggability slightly.
3. **Event volume:** all 109 `logger.error` call sites become events once a DSN is configured — expected by the brief, but quota/noise should be watched and filtered at the Sentry project level.
4. **Session envelopes:** Sentry's default session tracking also transmits session envelopes (observed: release, environment, user agent). No PII observed, but it is extra browser data leaving the site; disable `browserSessionIntegration` if the owner wants a minimal payload.
5. **Replay stays disabled** (rates 0, no integration). Enabling it needs explicit approval plus masking.
6. **Release identity** depends on the unwired build-time env var (above), so regression tracking is weak until then.

## Next smallest recommendation

1. GPT-6 review of this slice (code + tests + drift check).
2. Owner: run the prepared staging probe (staging DSN + `VITE_SENTRY_STAGING_PROBE=1`, verify one redacted event, unset the flag) and, separately, approve a redeploy to move production health probes to JSON — then re-run `node scripts/check-deployment-health.mjs https://www.truckopti.in` for the green.
3. Continue the completion queue with TO-134 (`agent-tasks/024-customer-journey-proof.md`).

## Git state

- Branch `main`, single writer, no push (push prohibited). Commits: `33c8b799` (implementation) + this board/result commit.
- Pre-existing untracked items preserved and untouched: `.ai-work-factory/`, `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`.
- `frontend/dist` rebuild is gitignored; final clean build (no staging probe) is the one on disk.
