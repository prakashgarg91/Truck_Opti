# Verified Review Of `bug-report-200-issues.md`

Date: 2026-04-26

This note verifies the external report against the current repository state. The original file claims `200+ verified bugs`, but the critical section mixes real defects, stale defects that are already fixed in the current tree, false positives, and broad heuristic buckets that are not individually verified issues.

## Critical Section Verdict

| Report ID | Claim | Verdict | Notes |
|---|---|---|---|
| BUG-001 | Missing `user_id` in `payment_history` insert | Fixed | `supabase/functions/create-razorpay-order/index.ts` now resolves the authenticated user and persists `user_id` server-side before writing `payment_history`. |
| BUG-002 | Webhook activates subscriptions by `razorpay_order_id` alone | Fixed | `supabase/functions/razorpay-webhook/index.ts` now looks up the matching `payment_history` row, resolves the user, and upserts the subscription by `user_id`. |
| BUG-003 | `subscription_plans` table name typo | False positive | The report says `subscription_plans` should be `subscription_plans`, which is the same table name. The current code in `frontend/src/services/subscriptionApi.ts` is correct. |
| BUG-004 | Same table-name typo at another line | False positive | Same false-positive claim as BUG-003. |
| BUG-005 | Same table-name typo at another line | False positive | Same false-positive claim as BUG-003. |
| BUG-006 | `VITE_SUPABASE_ANON_KEY` is a typo | False positive / stale | `VITE_SUPABASE_ANON_KEY` is the normal Vite public anon-key env name. The current Razorpay client no longer uses the manual fetch path the report quoted. |
| BUG-007 | Hardcoded Razorpay test cards exposed in production | Not verified as a production bug | The test-payment route is dev-only in `frontend/src/App.tsx`; the report overstates this as a production exposure. |
| BUG-008 | Desktop SHA-256 vs web bcrypt is a cross-app auth bug | Not verified | Current evidence shows separate desktop and web auth implementations, not a shared credential store bug. |
| BUG-009 | Missing rollback in `apps/web/app/repositories/base.py` delete path | Not verified | The report does not establish a real transactional defect. The repository uses `flush()` with rollback on exceptions; more proof is needed before changing that pattern. |
| BUG-010 | JWT accepted from query string | Fixed | `apps/web/app/middleware/authentication.py` now accepts JWTs only from the `Authorization: Bearer` header. |

## Additional Review Notes

- The grouped sections `BUG-011` onward are mostly category buckets such as `BUG-011 to BUG-045: Missing error handling in async operations`. Those are not 35 separately verified bugs; they are audit themes that still require file-by-file verification.
- The report should not be treated as a literal backlog of `200 verified issues`.
- The current high-confidence fixes landed from this verification pass are the Razorpay ownership/webhook fixes plus the JWT query-parameter auth removal.

## Validation Evidence

- `frontend`: `npx tsc --noEmit` completed cleanly after the Razorpay changes.
- `apps/web`: `python -m pytest .\apps\web\tests\unit\test_authentication_middleware.py -q` passed (`2 passed`).
- VS Code file diagnostics are clean for the touched files in this pass.

## Newly Verified In This Pass

| Verified ID | Area | Status | Notes |
|---|---|---|---|
| VF-011 | `frontend/src/pages/AdminContactPage.tsx` | Fixed | Confirmed real async error-handling gap: thrown Supabase failures could skip logging and leave resolve/load state transitions opaque. The page now logs failures and clears loading/updating state in `finally`. |
| VF-012 | `frontend/src/pages/AgencyDashboardPage.tsx` | Fixed | Confirmed real async error-handling gap: agency/profile summary queries had no thrown-error guard and could fail silently. The page now wraps both loads in `try/catch` with safe fallback summary state. |
| VF-013 | `apps/desktop/TruckOptimum/app.py` bootstrap admin | Fixed | Confirmed real desktop auth issue: first-run bootstrap admin used the predictable password `admin123`. The app now uses `TRUCKOPTIMUM_BOOTSTRAP_ADMIN_PASSWORD` when set, otherwise generates a one-time random password. |
| VF-014 | `apps/desktop/TruckOptimum/app.py` password storage | Fixed | Confirmed real desktop auth issue: local passwords used single-round salted SHA-256. The app now stores PBKDF2-HMAC-SHA256 hashes, still verifies legacy hashes, and upgrades them on successful login. |
| VF-015 | `frontend/src/pages/auth/AuthCallbackPage.tsx` | Fixed | Confirmed real auth-flow issue: callback errors and missing-session outcomes were immediately redirecting back to login, so the existing error UI never rendered. The page now keeps the user on the callback error state and shows an actionable failure message. |
| VF-016 | `frontend/src/pages/auth/ResetPasswordPage.tsx` | Fixed | Confirmed real auth cleanup issue: password reset success silently swallowed sign-out failures and still redirected to login. The page now surfaces cleanup failures instead of falsely reporting a complete reset flow. |
| VF-017 | `frontend/src/pages/AdminUsersPage.tsx` | Fixed | Confirmed real admin UX/security issue: deleting only the `public.users` profile row was reported as full account deletion even though auth sync would recreate it on the next sign-in. The page now blocks that false-success destructive action until a server-side admin delete path exists. |
| VF-018 | `apps/desktop/TruckOptimum/app.py` session transport | Fixed | Confirmed real desktop auth issue: auth returned raw session IDs in JSON and stored them directly in SQLite. The desktop app now transports sessions via the `truckoptimum_session` HttpOnly strict cookie and stores session tokens hashed at rest with legacy session fallback. |
| VF-019 | `apps/desktop/TruckOptimum/app.py` lock and loopback hardening | Fixed / follow-up recorded | Confirmed real desktop auth issue: account lock evaluation mixed aware and naive datetimes, and the desktop server relied on an implicit loopback assumption. The app now uses UTC-safe lock comparisons, enforces loopback-only binds by default, and records remaining non-auth route enforcement as a tracked security follow-up. |

## Additional Validation Evidence

- `frontend`: `npx tsc --noEmit` completed cleanly after the `AdminContactPage` and `AgencyDashboardPage` fixes.
- `frontend`: `npx tsc --noEmit` completed cleanly after the `AdminUsersPage`, `AuthCallbackPage`, and `ResetPasswordPage` fixes.
- `apps/desktop`: `python -m pytest .\apps\desktop\TruckOptimum\tests\unit\test_auth_password_storage.py .\apps\desktop\TruckOptimum\tests\unit\test_auth_session_transport.py -q` passed (`8 passed`, `2 warnings`).