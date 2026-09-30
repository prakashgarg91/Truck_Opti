# TO-122 result — Connect Google login to trusted Supabase sessions

**Verdict: PASS** (worker level — ready for GPT-6 review; does not authorize DONE, deployment or live changes).
**Date:** 2026-09-30 · **Branch:** `main` (single writer; no push) · **Brief:** `agent-tasks/012-trusted-cloud-auth.md`

## What changed and why

The production Google entry previously decoded a GIS ID token client-side, linked the result into the device-local agency profile store (`agencyProfileLocalApi.linkGoogle` — which hardcodes `role: 'agency'`, `frontend/src/services/localApi.ts:234-238`) and called `loginLocal`. That conflated an unverifiable, client-decoded identity with a privileged local role. The Google button now starts the existing trusted `supabase.auth.signInWithOAuth({ provider: 'google' })` round trip instead, and cloud identity/role keep coming from the verified Supabase user plus protected server tables (`users`, `transport_agencies`, `drivers`) in `resolveAppRole` — never from client claims.

Flow choice: the configured SPA client (`frontend/src/lib/supabase.ts:12-15`) passes no `auth` options, so supabase-js 2.90.0 uses its default **implicit flow** (`flowType: 'implicit'`, verified in `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:24`). `AuthCallbackPage` completes it via the URL-fragment `setSession` branch; the PKCE `code` branch remains supported and is tested too.

### Changed files (all inside the brief's allowed scope)

| File | Change |
| --- | --- |
| `frontend/src/components/GoogleSignInButton.tsx` | Rewired: renders an enabled button when Supabase is configured, click probes `isSupabaseReachable()` (honest offline message, fail-closed) and calls `authSupabaseApi.signInWithGoogle(returnTo)`; no GIS decode, no local profile link, no `loginLocal`. Disabled "needs setup" state now keyed on `isSupabaseConfigured`. |
| `frontend/src/services/supabaseApi.ts` (auth methods only) | `signInWithGoogle(returnTo?)` attaches the safe return-to to the `${origin}/auth/callback` redirect target via `isSafeAuthReturnTo`; unsafe values are dropped (and re-validated on receipt by `storeAuthReturnTo`). |
| `frontend/src/stores/authStore.ts` | `SIGNED_IN`/`TOKEN_REFRESHED` now set `authMode: 'supabase'` (cloud sign-in replaces an active local identity instead of leaving a mixed state). `SIGNED_OUT` no longer evicts an active device-local session, and resets cloud state otherwise. `initialize()` treats a failed `getSession()` (unreachable backend / expired-refresh failure) as "no verified cloud session" and still restores a persisted local session — previously it early-returned and also skipped the `onAuthStateChange` subscription. `logout()` now decides by session presence (mixed local+cloud state revokes the cloud session too) and on sign-out failure clears the persisted Supabase storage keys (`sb-*-auth-token`, `sb-*-code-verifier`) — supabase-js 2.90.0 skips `_removeSession()` when the revoke call fails on network (verified in installed `GoTrueClient.js` `_signOut`: only 401/403/404 are tolerated). |
| `frontend/src/pages/auth/AuthCallbackPage.tsx` | After the session is verified, waits (bounded ~2 s) for the auth store to absorb `SIGNED_IN` and set `isAuthenticated` before navigating, so the landing route doesn't bounce to `/login` while the role resolves server-side. |
| `frontend/src/lib/googleAuth.ts` | Header comment updated: helpers are device-local tooling only, no longer part of production sign-in. Code unchanged. |
| `frontend/src/lib/googleAuth.test.ts` | New test: a forged payload carrying `role`/`app_metadata`/`user_metadata` authorization-shaped claims decodes to display-profile fields only. |

New focused test files: `src/stores/authStore.test.ts` (12 tests), `src/components/GoogleSignInButton.test.ts` (4), `src/services/authSupabaseApi.test.ts` (4), `src/pages/auth/AuthCallbackPage.test.ts` (5). All are plain `.ts` (React via `createElement`/`createRoot`) because vitest `include` is `src/**/*.test.ts` only; `vitest.config.ts` was not touched.

### Required behaviors covered by tests

OAuth initiation (button → `signInWithOAuth`, return-to in redirect) · callback completion (implicit hash + PKCE code, provider-error mapping, exchange failure) · safe return-to (unit + component + callback round trip; unsafe `//evil.com` refused at all three points) · spoofed client claims (forged ID-token claims dropped; server-table role wins over spoofed `user_metadata`) · expired/revoked session (`SIGNED_OUT` clears) · missing backend (reachability probe fails closed; `initialize` session error restores local access but never a persisted cloud identity) · local refresh (persisted local session restored after reboot) · cloud/local switching (sign-in switches `authMode`; revoked cloud token doesn't evict local) · offline logout (state cleared **and** persisted `sb-*` keys removed).

## Verification (all run this session, Node v24 host)

| # | Check | Command (dir `frontend/`) | Result | Evidence class |
| --- | --- | --- | --- | --- |
| 1 | Red regression run (pre-implementation) | `npx vitest run src/stores/authStore.test.ts src/components/GoogleSignInButton.test.ts src/services/authSupabaseApi.test.ts src/pages/auth/AuthCallbackPage.test.ts src/lib/googleAuth.test.ts` | 9 failed / 22 passed — exactly the behaviors the brief requires (e.g. `initialize restores device-local access when the backend cannot be reached` expected true got false; offline logout expected `sb-demo-ref-auth-token` null got `'stored-session'`) | Mock (jsdom) |
| 2 | Focused auth suite (post-implementation, run twice for flake check) | same command + `src/utils/authReturnTo.test.ts src/utils/authCallbackError.test.ts` | **46/46 passed, 7 files**, both runs | Mock (jsdom) |
| 3 | Full unit suite | `npm run test:unit` | **385/385 passed, 26 files** (baseline was 358/358) | Mock (jsdom) |
| 4 | Build + typecheck | `npm run build` (`tsc && vite build`) | exit 0, built in 7.61 s; pre-existing chunk-size/PWA warnings only | Local build |
| 5 | Lint | `npm run lint` (`eslint . --report-unused-disable-directives --max-warnings 80`) | 0 errors, 26 warnings — identical to the TO-ASSESS-010 baseline; direct `npx eslint <changed files>` clean | Local |

## Assumptions

- The Google button's enabled/disabled gate moved from `VITE_GOOGLE_CLIENT_ID` to `isSupabaseConfigured`; Google cloud sign-in fundamentally requires the Supabase project, so this is the honest capability signal. The GIS helpers stay for device-local tooling only (documented in-file).
- Local identity remains reachable via the explicit `/local-start` device setup (hardcodes `role: 'agency'` for the offline workspace) — this satisfies "local identity may open authorized device-local functionality" while GIS is no longer a hidden path into it.
- `AuthCallbackPage` settle loop is additive; existing behavior (provider-error mapping, return-to storage/re-validation, 8 s timeout fallback) untouched.

## Unresolved risks / notes for review

- `src/pages/auth/LoginPage.tsx:678` still carries the stale comment `Google Login (GIS, no Supabase, no OTP)` — LoginPage is outside this brief's allowed scope; recommend fixing the comment in TO-123 (which owns login-surface consistency).
- Route guards (`ProtectedRoute`) remain UX-only by design; server APIs keep independent authorization. Nothing here changes server-side authority (TO-136 verifies final DB policies).
- `GoogleSignInButton` still lacks a spinner library affordance — it uses a text swap ("Redirecting to Google…") which is honest but minimal; TO-123/TO-139 can polish.

## Owner gates (live OAuth remains BLOCKED)

- **Live Google/Supabase OAuth proof is BLOCKED**: needs the recovered/verified Supabase project (TO-125, historical host NXDOMAIN), Google OAuth client with this domain's origins/callbacks whitelisted, and the Google provider enabled in Supabase Auth — all owner-controlled. No live OAuth was executed.
- No production deploy, no `VITE_*` change coordination, no hosted configuration was touched.

## Next smallest step

GPT-6 review of this slice; then TO-124 (provider capability audit) which coordinates the cloud Google capability contract, then TO-123 (login surfaces) which can also pick up the stale LoginPage comment.

## Git state

- `main` at `d27a4324` + this task's single cohesive commit (code, tests, result file, TASKS.md row → AWAITING_REVIEW). Not pushed (main-only policy: push only after tests pass and per owner flow).
- Pre-existing untracked items preserved untouched: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`.
