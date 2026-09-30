# TO-127 — Replace simulated driver KYC with real uploads

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-122 and TO-126 accepted. Follow Stitch guide and reuse the integrated KYC screen.

## Goal and evidence

DriverKycPage uses intervals for fake upload progress and timers to accept documents after submission. Its KYC Verified message is not backed by Storage or admin review.

## Allowed scope

frontend/src/pages/DriverKycPage.tsx; frontend/src/services/driverKycDocuments.ts and tests; frontend/src/services/driverKycApi.ts (consumer-level changes only); frontend/src/pages/DriverProfilePage.tsx; docs/design-audit.md.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Consume the TO-126 getState/uploadDocument/submit contract. Load persisted state on navigation and refresh. Upload actual bytes and display real measurable progress or an honest indeterminate transfer state; do not invent percentage completion. Delete simulated acceptance timers. Pending/rejected/accepted states come from the backend. Preserve retry, cancellation and accessible validation. Use signed previews; revoke object URLs. Restrict demo fixtures to development/testing and do not let production query strings fabricate verification. Offline/local users cannot upload or report KYC verified. The profile entry must reflect the authoritative status.

## Required checks

Prove refresh retains uploaded documents; failed upload leaves retryable state; submit remains pending until actual admin decision; rejection/resubmission works; changed document version invalidates previous acceptance; local/unauthenticated access is denied. Browser checks at 390x844 and 1280x900 plus build, lint, focused and full unit tests.

## Acceptance

A real driver can upload/submit documents and see persisted outcomes without automatic client approval.

## Handoff

Write agent-results/017-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
