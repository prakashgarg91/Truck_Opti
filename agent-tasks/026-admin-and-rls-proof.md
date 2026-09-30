# TO-136 — Verify admin authority and final database policies

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-125 and schema-changing tasks accepted. Use the fully migrated local/staging schema.

## Goal and evidence

Old migrations contain unsafe user_metadata role policies, some replaced by later migrations. Only the final installed policy/grant state can establish authority. Existing TO-114 review did not run a full live tenant/role matrix.

## Allowed scope

scripts/live-admin-proof.cjs; scripts/seed-portal-demo-accounts.cjs; local/staging SQL integration tests; supabase/functions/_shared/portal-auth.ts and affected portal functions only for proven defects; forward migrations when necessary; frontend admin pages only for reproduced errors.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Enumerate the final RLS policies, table/column grants, views, SECURITY DEFINER function ACLs and Storage access after all migrations. Test normal customer, driver, agency, pending/suspended accounts, admin and anonymous callers. Attempt self-role changes and forged metadata/localStorage. Verify privileged Edge Functions authenticate with trusted Supabase authority and enforce permissions before service-role operations. Prove user management, driver/agency approval, contact inbox, subscriptions and payout review using controlled fixtures. Preserve valid public catalog policies; do not replace every legitimate public policy with ownership blindly. Seed unique credentials securely; never write them to results.

## Required checks

Direct REST/RPC/function requests for foreign IDs, metadata role escalation, view reads, function execution, document access, suspended identity and admin-only mutations. Full local DB denial matrix plus credentialed admin staging browser proof. Record queries, actors and sanitized outcomes. Static grep/source-policy tests are supplementary.

## Acceptance

Final-schema role and tenant denials pass behaviorally; no known P0/P1 authorization/data exposure remains unowned. A production security claim still needs authorized deployed-state verification.

## Handoff

Write agent-results/026-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
