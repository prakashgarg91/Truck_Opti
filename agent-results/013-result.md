# TO-123 — Result: Make every login surface usable and consistent

**Date:** 2026-10-03 · **Worker:** GLM-5.3 Flash · **Verdict: PASS (ready for GPT-6 review)** — worker PASS does not authorize DONE, deployment or live changes.
**Brief:** `agent-tasks/013-usable-auth-surfaces.md` · **Branch:** `main` (single writer, no push) · **Evidence level:** local (local-first browser run + unit tests on real page components). Live hosted sign-in remains owner-gated and was NOT executed.

## Problem (from the brief and coverage rows)

LoginPage rendered the OTP form with both OTP flags false, displayed `VITE_AUTH_PASSWORD_ENABLED` to users, GoogleSignInButton rendered "(needs setup)" with env-var copy, office login could expose no usable cloud method, and `LoginPage.tsx:21`/`SignupPage.tsx:18` treated a missing email-OTP flag as enabled (`!== 'false'`), diverging from the canonical TO-124 capability model (`frontend/src/lib/authCapabilities.ts:219-280`, requires explicit `'true'` + configured backend). None of the five surfaces had executed rendering tests.

## Changed files

| File | Change |
|---|---|
| `frontend/src/lib/authSurfaceMethods.ts` | **New.** Single binding of build env → `resolveAuthMethodCapabilities`; missing flag = disabled (fail-closed), matching `summarizeAuthProviders` in `scripts/production_config_policy.mjs:179` |
| `frontend/src/lib/authSurfaceMethods.test.ts` | **New.** 5 tests incl. the legacy `!== 'false'` divergence regression |
| `frontend/src/pages/auth/LoginPage.tsx` | Canonical flags; no-env-copy honest notices; maintenance state + separate `/local-start` entry when no method exists; form/chooser/divider hidden per availability; `aria-pressed`, `role="alert"`, `aria-describedby`, `autoComplete` |
| `frontend/src/pages/auth/SignupPage.tsx` | Same canonical flags; honest no-signup-method states; removed "Email Signup Disabled" dead button; a11y attributes |
| `frontend/src/pages/auth/ForgotPasswordPage.tsx` | Reset form renders only when password auth is enabled; honest notice otherwise |
| `frontend/src/components/GoogleSignInButton.tsx` | Unconfigured backend → renders nothing (was: disabled "(needs setup)" button with `VITE_SUPABASE_URL` title copy) |
| `frontend/src/components/GoogleSignInButton.test.ts` | Unconfigured-state test updated to the new contract (renders nothing; no "needs setup", no `VITE_`), still asserts no mutation call |
| `frontend/src/pages/auth/LoginPage.test.ts` | **New.** 16 tests: method matrix (no-provider/Google-only/password-only/email-only/phone-only/all), five surfaces, office blocked state, offline → `/local-start` navigation (both entries), disabled-submit guard, enumeration-safe wrong-password toast |
| `frontend/src/pages/auth/SignupPage.test.ts` | **New.** 5 tests: email-only, password-only, both (chooser pressed-state), Google-only, no-method → `/local-start` |
| `scripts/frontend_launch_smoke.mjs` | New `login-surface` checks: 5 surfaces × 390×844 + 1280×900 with forbidden-copy assertions and screenshots; new keyboard-driven `login-local-workspace` check (Tab→Enter → `/local-start`) |
| `docs/design-audit.md` | Dated 2026-10-03 addendum: per-surface before/after, executed route evidence, backlog update, next item |
| `TASKS.md` | TO-123 → AWAITING_REVIEW |

Untouched by design: `ResetPasswordPage.tsx` (recovery-session flow fails closed already; gating it would break in-flight recovery), `OTPPage.tsx` (outside allowed scope).

## Red/green evidence

- **Red (pre-fix divergence captured by the new tests):** `authSurfaceMethods.test.ts` "treats a missing email-OTP flag as disabled — never the legacy default-on" and the LoginPage "no-provider" test assert exactly the behaviors the old code violated (old code: `LoginPage.tsx:21` `!== 'false'`; env-name notice at old `:349-351`; Google "(needs setup)"). The google-only test also caught a real bug in my first rework (dead "Send Email OTP" submit button still rendered) — fixed in `LoginPage.tsx` (form guard `authMode === 'password' || hasOtpChannel`).
- **Green:** all checks below executed this session, exit 0.

## Verification (exact commands, run from `D:/Github/Truck_Opti`)

| Command | Result |
|---|---|
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run build` | exit 0 (tsc clean; pre-existing chunk-size advisories only) |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run lint` | exit 0, 0 errors / 0 warnings (max-warnings 0 gate) |
| `node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" --prefix frontend run test:unit` | exit 0, **481/481 tests, 31/31 files** (454 recorded pre-slice + 27 new) |
| `PUBLIC_APP_URL=http://localhost:4173 npm run test:frontend-smoke` | exit 0, **63/63 checks**, verdict `local_first_smoke` (`logs/frontend_launch_smoke_report.json`) |
| `node --test scripts/production_config_policy.test.mjs` | exit 0, 37/37 |
| `node tools/glue-check.mjs` | exit 0, "GLUE SEALED — 0 gaps, 0 warnings" |

Browser-evidence handling per the local-env trap: `frontend/.env.local` and `frontend/.env` were renamed to `*.sync-hold`, dist rebuilt local-first, preview served on port 4173, then both files restored byte-for-byte (1749 B / 291 B, original mtimes). They were never edited, committed or deleted. Note: `vite preview` bound IPv6-only, so the smoke used `http://localhost:4173` (127.0.0.1 refused — recorded verbatim).

### Browser surface evidence (new checks, all passed)

- 10 × `login-surface` (5 surfaces × 390×844 and 1280×900): correct surface title, zero console/page errors, zero failed responses, forbidden copy absent: `VITE_`, `needs setup`, `in this environment`. Screenshots: `logs/auth-surface-smoke/login-{default,driver,agency,office,partner}-{mobile-390x844,desktop-1280x900}.png` (visually verified `login-office-mobile-390x844.png`: honest administrator notice + separate device-local card, no env copy).
- 1 × `login-local-workspace` (390×844): Tab-focused the workspace entry, Enter navigated to `/local-start` (`focusedViaKeyboard=true`) — closes the coverage-row gap "no executed test asserts the offline button navigates to /local-start" (unit-level equivalent also added).
- `auth-fallback` now reports `skipped: Email OTP is disabled` in the local-first build — correct behavior of the pre-existing `shouldRunEmailOtpFallback` policy guard, previously exercised only because the divergent page flag falsely rendered the email channel.

### Honest scope note on the required "combination matrix at two viewports" check

Env flags are baked at build time, so the five flag combinations (no-provider / Google-only / password-only / email-only / phone-only) are exercised by unit tests against the real page components (`LoginPage.test.ts`), while the browser sweep proves all five surfaces × both required viewports on the actually-built (no-provider) configuration. This split is recorded rather than silently substituted.

## Assumptions

- Office "working configured path" = the password form + `resolvePasswordLoginEmail` RPC flow (implemented; client mutation proven at unit tier, end-to-end only on the disposable local DB per `agent-results/015-result.md:64`).
- The no-method maintenance copy intentionally avoids promising dates; it points to the device-local workspace as the only usable path.

## Unresolved risks / owner gates (unchanged by this slice, not blockers for this UI slice)

1. **Hosted proof owner-blocked:** live Google OAuth round trip, real email/SMS OTP delivery, hosted SMTP/Twilio and seeded office credentials on a recovered Supabase project. Code paths are wired; no operational proof exists (`test:live-auth` unrun).
2. Server-side wrong-password verification, RPC identifier resolution and role-guard denials remain covered only by the recorded local-DB rehearsal (TO-125) and queued TO-136 — outside this brief's allowed files.
3. When the owner provisions OTP/password, the pages need no code change — flags alone drive the surfaces (validated per-combination by unit tests).

## Git state

`main`; commit recorded below (single cohesive commit). Pre-existing untracked items untouched: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`, plus unexpected pre-existing untracked `.serena/`, `agent-results/completion-truth-20261002.md`, `agent-results/functional-coverage.md` (left alone, not staged). No push (orchestrator pushes in the release phase).

## Next recommendation

GPT-6 review of this slice; then the queue continues with TO-126 (private KYC storage). The new surface checks are already wired into the maintained `test:frontend-smoke` gate, so no additional CI work is required to keep them running.
