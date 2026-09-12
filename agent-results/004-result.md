# TO-115 — Provider configuration and audit policy result

Date: 2026-09-12

## Repairs completed
- Added explicit production authentication-provider policy tests.
- Updated production config validation so intended Google-only auth is accepted when Google is genuinely configured.
- Production auth validation still fails closed when no real provider is enabled or the Google client ID is a placeholder.
- Made the Email OTP fallback smoke feature-aware: it runs only when the Email channel is actually present.
- Made Supabase health verification explicit: cloud health is required when `SUPABASE_PUBLIC_URL` is supplied; local-first CI does not fabricate a dead default project URL.

## TDD evidence
- First RED run for provider-policy work failed because the new policy implementation did not exist.
- First RED run for feature-aware Email OTP smoke failed because `shouldRunEmailOtpFallback` did not exist.
- First RED run for optional Supabase health gating failed because `shouldRunSupabaseHealthCheck` did not exist.
- Each behavior was implemented minimally after its expected red failure and then verified through the full CI path.

## Fresh verification
From PR #43 / GitHub Actions run `34682597700`:
- Production config policy tests: 6/6 PASS.
- Production frontend build: PASS.
- Frontend unit suite: 329/329 PASS.
- Packing regression: 18/18 PASS.
- Public browser smoke: 12/12 PASS.
- Core local-first launch smoke: 52/52 PASS.
- `apps/web` auth unit job: PASS.

## Provider policy conclusion
The repository no longer treats disabled Email OTP or an absent cloud backend as proof that the application itself is broken. At the same time, configured external providers remain explicit verification boundaries and are not silently treated as successful.

## Remaining owner gates
- Production Google OAuth client ID/redirect configuration.
- Production Supabase project URL/public anon key.
- Payment provider production credentials and approved verification procedure.
- Sentry/observability production credentials where desired.
- Any `VITE_*` production mutation requires coordinated redeploy; none was performed here.

## Acceptance
TO-115 code-side provider policy and failure behavior are complete. Production secret values and live provider proofs remain owner-controlled and must be verified after approved configuration/redeploy.
