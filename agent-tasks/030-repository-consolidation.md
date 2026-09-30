# TO-140 — Consolidate repository state and resolve obsolete tooling

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY_AUDIT_ONLY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** Code completion and review before cleanup; coordinate with GPT-6. Audit may proceed read-only now.

## Goal and evidence

main is 14 commits ahead of origin/main after fetch. There are 13 old worker worktrees, multiple legacy/Stitch branches and two pre-existing untracked targets. TASKS.md contains stale merge/push notes.

## Allowed scope

TASKS.md parked-work section; agent-results/030-result.md; existing docs/ARCHITECTURE.md/AGENT_TASK_EXECUTION_MATRIX.md and other duplicate process docs only when references are reconciled; TO-HYG-009 brief; .gitignore only for intentional evidence paths.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Inventory every local/remote branch and all worktrees: exact path/ref/commit, tracked/untracked/ignored changes, ahead/behind and unique commits. Classify integrated, active, parked or rejected in TASKS.md. Inspect ignored files before removal; preserve user-owned content. A merged commit alone does not establish a clean worktree. Prepare exact safe cleanup operations for GPT-6 review; never force-delete, create stashes/new worktrees, or blindly merge divergent branches. Reconcile unique changes only with supervisor direction. Align active docs with root architecture/task ownership and current React Router/runtime; do not resurrect retired routers. Audit the parked G2G tooling per existing TO-HYG-009: remove only genuinely obsolete code after call-site/dependency proof. Keep historical design/market research separate from launch blockers.

## Required checks

Record git status, worktree list, branch -a, branch --merged, per-worktree dirty/ignored status, exact rev-list counts and intended upstream diff. For file moves/removals verify imports, references, build/tests and script paths. Push main only after accepted verification; pushing/deleting is not required for this assessment-only brief.

## Acceptance

Every branch/worktree/file has an understood disposition; cleanup preserves unintegrated/dirty content and final canonical state matches the reviewed work.

## Handoff

Write agent-results/030-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
