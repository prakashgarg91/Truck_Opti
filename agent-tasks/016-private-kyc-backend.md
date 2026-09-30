# TO-126 — Implement private KYC storage and authoritative state

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** Local schema from TO-125; trusted cloud identity contract from TO-122. Hosted rollout is owner-gated.

## Goal and evidence

driver-docs is created public with a public SELECT policy. The later role-hardening migration replaces admin authority but does not privatize that bucket. KYC kinds include PDF, while the original bucket allows images only. UI state has no durable review record.

## Allowed scope

supabase/migrations/ (new forward migration via CLI); supabase/functions/driver-kyc/index.ts (new); relevant _shared authorization helpers; frontend/src/services/driverKycApi.ts (new); frontend/src/types/database.types.ts; backend/adapter tests.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Use private driver-docs storage; remove public reads through a forward migration and handle existing URL references before rollout. Enforce owner/admin access using trusted server authority, never user_metadata. Add the smallest durable document/submission records needed for rc_book, driving_license, aadhaar and truck_photo, with file version, status, rejection reason, reviewer and timestamps. Validate 5 MiB maximum and JPEG/PNG/WebP/PDF bytes server-side; use randomized owner-scoped paths. Return short-lived signed access only to permitted users. Drivers may upload/submit; only authorized admins may accept/reject. Submission and review must check the current version, and all accepted must be computed server-side.

## Required checks

Run disposable DB/Storage tests: anonymous read denied, other-driver read/update denied, spoofed role denied, admin permitted, oversized/spoofed file rejected, PDF accepted as intended, replacement invalidates old review, conflicting review rejected. Export adapter methods getState(): Promise<KycSubmissionState>, uploadDocument(kind,file): Promise<KycSubmissionState>, submit(): Promise<KycSubmissionState>, reviewDocument(driverId,kind,version,decision,reason?): Promise<KycSubmissionState>. Use existing KycDocKind/KycSubmissionState; extend metadata deliberately.

## Acceptance

Private storage and versioned server-authoritative review are implemented and tested locally; no production bucket or database is changed.

## Handoff

Write agent-results/016-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
