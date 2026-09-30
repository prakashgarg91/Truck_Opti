# TO-128 — Complete the admin KYC review loop

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-126 and TO-127 accepted. Follow Stitch workflow for UI integration.

## Goal and evidence

The generated admin verification design is not proof of a working review route. The current KYC screen has no durable admin-driven feedback loop.

## Allowed scope

frontend/src/pages/DriverDetailPage.tsx; frontend/src/pages/AdminDriversPage.tsx; frontend/src/services/adminSupabaseApi.ts (KYC consumer only); supabase/functions/driver-kyc/index.ts (only reviewed contract adjustments); docs/design-audit.md; focused tests.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Integrate document review into the existing /admin/drivers/:id journey rather than introduce a competing admin system. Fetch private signed previews and authoritative document versions. Permit accept/reject only through TO-126 reviewDocument. Require a rejection reason, record reviewer/time and prohibit forged local/admin browser state from authorizing the API. Handle expired signed URLs, unavailable files and concurrent reviews. Compute approved KYC from the reviewed current versions and connect this to the existing driver approval policy; document any additional approval decision rather than making a driver operational silently.

## Required checks

Admin opens a pending submission, accepts and rejects individual documents, reviews a resubmission, sees stale-version conflict, and observes driver-side status after refresh. Non-admin and cross-driver requests fail at the server. Verify mobile/desktop layouts and keyboard flow; run focused tests, full unit suite, lint and build.

## Acceptance

Driver submission -> authorized admin review -> persisted driver outcome works end-to-end on staging/local services.

## Handoff

Write agent-results/018-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
