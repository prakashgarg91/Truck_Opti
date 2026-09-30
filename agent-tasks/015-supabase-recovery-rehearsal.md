# TO-125 — Prepare a reproducible Supabase recovery and staging backend

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY_LOCAL_OWNER_BLOCKED_HOSTED.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** Owner login is required to determine restore versus replace. Local schema rehearsal can proceed independently.

## Goal and evidence

The historical project hostname remains NXDOMAIN on 2026-09-30. Current live project/config cannot be established from historical reports; Heroku CLI login is expired.

## Allowed scope

supabase/config.toml; supabase/migrations/; supabase/functions/ inventory; frontend/src/types/database.types.ts (regenerate only after verified schema); scripts/test-supabase-connection.mjs; scripts/_proofEnv.cjs; agent-results/015-result.md.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Inventory migration order, expected schema, reference data, buckets, Edge Functions, secrets and API grants. Use current Supabase CLI --help and official docs. Rehearse applying the committed migrations to a disposable local database; report Docker/CLI prerequisites if absent. Do not reset any shared/existing database. Produce exact schema/function/bucket differences and test-data requirements in the result. Obtain the owner's restore-versus-replace decision based on dashboard status and recoverable backups. Preserve old data and prepare a staged migration/cutover if replacement is necessary. Keep URL/public key and secret provisioning distinct. Record selected project identity, environment and function versions without credentials. Include backup/recovery verification and migration rollout order, especially OTP/security changes.

## Required checks

Rebuild an empty disposable local schema using documented commands, run a read/write query under appropriate test identities, inspect RLS/grants, enumerate expected functions and buckets, and verify generated types against the schema. Hosted DNS/auth health checks need owner-provided project access. Document the exact executable setup; do not claim success when prerequisites are unavailable.

## Acceptance

The backend can be recreated locally and its production recovery/cutover steps are concrete. Hosted recovery stays owner-blocked until executed and verified.

## Handoff

Write agent-results/015-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
