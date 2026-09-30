# TO-122 — Connect Google login to trusted Supabase sessions

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** None for local implementation. Live proof needs TO-125 and owner credentials.

## Goal and evidence

GoogleSignInButton calls agencyProfileLocalApi.linkGoogle then loginLocal; googleAuth.ts only decodes the ID-token payload. The existing authSupabaseApi.signInWithGoogle already starts Supabase OAuth. ProtectedRoute currently checks browser authentication/role state.

## Allowed scope

frontend/src/components/GoogleSignInButton.tsx; frontend/src/lib/googleAuth.ts; frontend/src/stores/authStore.ts; frontend/src/pages/auth/AuthCallbackPage.tsx; frontend/src/services/supabaseApi.ts (auth methods only); frontend/src/utils/authReturnTo.ts; frontend/src/components/ProtectedRoute.tsx; focused auth tests.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Use the existing Supabase Google OAuth method for cloud login and the existing /auth/callback route; choose the flow supported by the configured SPA client and verify its completion. Preserve safe return-to behavior. Cloud identity and roles must come from a verified Supabase user and protected server data. Keep local identity explicitly distinct: it may open authorized device-local functionality but cannot confer cloud/admin/reviewer/driver authority or enable payments. Handle session refresh, expired/revoked credentials, delayed initialization, logout, account switching and local-session restoration. Preserve already-added authMode persistence rather than reimplementing it. Server APIs retain their independent authorization checks; route guards are UX, not the final security boundary.

## Required checks

Add behavioral tests for OAuth initiation/callback, safe return-to, spoofed client claims, expired session, missing backend, local refresh, cloud/local switching and offline logout. Run frontend auth tests, full unit suite, build and lint. Record live OAuth as BLOCKED until tested with the approved provider.

## Acceptance

The production Google entry no longer grants cloud access through client-decoded GIS identity; local workspaces remain isolated and session tests pass.

## Handoff

Write agent-results/012-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
