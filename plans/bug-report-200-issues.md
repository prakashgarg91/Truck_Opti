# Verified Bug Backlog

Status: canonical backlog for the former `200 issues` report as of 2026-04-26.

The previous version of this file claimed `200+ verified bugs`. That claim was not evidence-backed. Use this file and `plans/bug-report-200-issues-verified-2026-04-26.md` as the only working source for this audit lane.

## Verified Audit Record

- Full verification note: `plans/bug-report-200-issues-verified-2026-04-26.md`
- Rule: only file-by-file verified issues belong in this backlog. Grouped heuristic buckets do not.

## Fixed In Current Tree

| ID | Area | Status | Notes |
|---|---|---|---|
| VB-001 | Razorpay order persistence | Fixed | `payment_history` pending rows are now server-owned and tied to the authenticated `user_id`. |
| VB-002 | Razorpay webhook activation scope | Fixed | Webhook now reconciles through the matching `payment_history` row and `user_id` instead of updating by order ID alone. |
| VB-003 | Flask auth middleware | Fixed | JWT query-parameter fallback removed; only `Authorization: Bearer` is accepted. |
| VB-004 | Admin contact async handling | Fixed | `AdminContactPage` now handles thrown Supabase failures with logging and `finally` cleanup. |
| VB-005 | Agency dashboard async handling | Fixed | `AgencyDashboardPage` now guards agency/profile summary loads with logging, error handling, and safe fallback state. |
| VB-006 | Desktop bootstrap admin secret | Fixed | Desktop app no longer creates a predictable `admin123` bootstrap admin password. |
| VB-007 | Desktop password storage | Fixed | Desktop app now uses PBKDF2-HMAC-SHA256, keeps legacy hash verification, and upgrades legacy hashes on successful login. |
| VB-008 | Auth callback error visibility | Fixed | `AuthCallbackPage` now surfaces callback failures on its own error UI instead of immediately redirecting away and swallowing the failure state. |
| VB-009 | Reset-password auth cleanup | Fixed | `ResetPasswordPage` no longer silently ignores post-reset sign-out failures; it now surfaces the cleanup failure to the user instead of falsely claiming a complete reset flow. |
| VB-010 | Admin user deletion truthfulness | Fixed | `AdminUsersPage` no longer claims to delete full accounts from a client-only `public.users` delete path that would be recreated on the next sign-in. |
| VB-011 | Desktop account lock handling | Fixed | Desktop login now evaluates lock timestamps with UTC-safe comparisons instead of falling through to a generic login failure. |
| VB-012 | Desktop session transport and loopback hardening | Fixed | Desktop auth now uses a hardened cookie transport, stores hashed session tokens, and rejects non-loopback binds unless explicitly overridden. |

## Verified Follow-Up Queue

These are evidence-backed follow-ups that remain open after the current verified pass:

1. Build a real admin-backed disable or delete path for portal users instead of the current client-side placeholder in `AdminUsersPage`.
2. Enforce authenticated desktop sessions on non-auth desktop API routes before treating the local Flask surface as multi-user secure.
3. Continue desktop auth review beyond transport: remaining bootstrap flows and any privileged local admin actions.

## Validation Snapshot

- `frontend`: `npx tsc --noEmit` completed cleanly after the frontend async fixes.
- `apps/web`: `python -m pytest .\apps\web\tests\unit\test_authentication_middleware.py -q` passed (`2 passed`).
- `apps/desktop`: `python -m pytest .\apps\desktop\TruckOptimum\tests\unit\test_auth_password_storage.py .\apps\desktop\TruckOptimum\tests\unit\test_auth_session_transport.py -q` passed (`8 passed`, `2 warnings`).
