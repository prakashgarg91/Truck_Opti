# TO-116 — Core workflow verification and repair result

Date: 2026-09-12

## Scope verified
- Packing/truck recommendation regression path.
- Public frontend route health.
- Protected-route redirects in unauthenticated/local-first mode.
- Contact-service fallback behavior.
- Authentication fallback behavior with feature-aware Email OTP handling.
- Driver and agency registration login gates.
- Local-first launch behavior without falsely requiring an unconfigured Supabase backend.

## Fresh verification evidence
PR #43 / GitHub Actions run `34682597700` completed successfully with:
- Production frontend build: PASS.
- Frontend unit suite: 329/329 PASS across 19 test files.
- Packing regression: 18/18 PASS.
- Public browser smoke: 12/12 PASS.
- Core local-first launch smoke: 52/52 PASS.
- `apps/web` bounded authentication middleware test: PASS.

The 52-check launch smoke includes public routes, protected-route redirects, contact fallback, auth fallback behavior, driver registration gate, agency registration gate and the cloud-auth-service boundary. When `SUPABASE_PUBLIC_URL` is not supplied for a local-first run, cloud health is explicitly recorded as skipped/passed rather than probing a stale default project. When a Supabase URL is supplied, cloud health remains a required check.

## Repair performed
The broader `npm run test:frontend-smoke` path is now a permanent GitHub Actions gate and its report is uploaded with the public smoke artifact. This prevents future changes from regressing protected/fallback launch journeys while preserving the supported local-first execution mode.

## Residual production blockers
- Credentialed authenticated customer workflow against the real production Supabase project is not yet verified.
- Credentialed admin/agency live workflow is not yet verified.
- Production cloud persistence cannot be claimed until the Supabase project and build-time environment values are restored/confirmed.
- Real-money payment execution is outside this task and remains prohibited without explicit approval.

## P0/P1 conclusion
No known P0/P1 break remains in the verified local-first/public core scope. Cloud-auth/data production readiness remains an external owner-controlled blocker, not a hidden code success claim.

## Acceptance
TO-116 is complete for the code-verifiable/local-first core scope. Its maintained CI gates are now production build + unit tests + packing regression + public browser smoke + broader core launch smoke + bounded Python auth tests.
