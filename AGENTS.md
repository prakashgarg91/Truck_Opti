# AGENTS — Simple Agent Operating Contract

Canonical entry point for every coding agent in Truck_Opti.

## Read order
1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `TASKS.md`
4. The single assigned file in `agent-tasks/`

Do not create or revive competing agent routers, generated handoff systems, alternate task boards, provider-specific skill copies, or parallel architecture/status documents. Tool-specific adapters may exist only when required and should point back to the canonical files above.

## Roles
- **GPT-6 / Codex supervisor:** architecture, task decomposition, difficult debugging, integration, review, final verification, repository consolidation, and `TASKS.md` ownership.
- **GLM-5.3 Flash workers:** bounded implementation/test/docs work from one `agent-tasks/NNN-*.md` brief at a time.

## Primary objective: finish the project
Optimize for a maintainable, secure, production-ready product that can deliver real customer/business value. Do not optimize for plans, agent activity, framework complexity, or endless feature expansion.

**Finish-before-expand:** work first on broken core journeys, production blockers, auth/data correctness, payments/revenue readiness, reliability, security, and launch proof. Optional features come later.

When the owner says **"proceed further"**, continue the normal completion loop without asking what to do next: inspect truth -> choose the highest-value AI-executable unfinished slice -> implement -> test -> review -> integrate -> clean repo -> update state -> continue until a meaningful blocker or project-complete gate. This never authorizes owner-gated production actions.

## Work contract
1. Claim one `READY` task and mark `IN_PROGRESS`.
2. Read only the relevant brief and code/docs required for that scope.
3. Do not widen scope or redesign architecture without supervisor approval.
4. Run required checks.
5. Write `agent-results/NNN-result.md` with changed files, exact verification, blockers, and next recommendation.
6. GPT-6 reviews before the task becomes `DONE`.
7. Accepted work must be integrated into the canonical branch and temporary isolation cleaned when safe.

## Repository hygiene and branch/worktree discipline
The default branch is canonical unless `TASKS.md` explicitly declares another integration branch.

Before substantial work inspect `git status --short`, current branch, `git worktree list`, local/remote branches, and remotes. At integration/day-close:
- merge or fast-forward reviewed task work into the canonical branch;
- rerun relevant verification after merge;
- remove temporary worktrees only when clean and their work is integrated or explicitly abandoned;
- delete only branches proven merged/superseded; never force-delete unknown or dirty work;
- park unresolved divergent work in `TASKS.md` with exact branch/worktree, purpose, status, and next action;
- inspect fork/upstream divergence and integrate only intended changes, never a blind wholesale merge;
- keep root professional and minimal; generated reports/logs/screenshots/experiments belong in intentional folders;
- consolidate duplicate status/process docs instead of creating more files;
- when moving files, update references/imports/tests in the same task and verify.

A clean repo means every branch/worktree/file has an understood purpose: integrated, active, parked, or intentionally rejected.

## Guardrails
- Never commit secrets or production credentials.
- No `supabase db push`, real payment, credential rotation, production deploy, destructive database operation, or other live irreversible action without explicit owner authorization.
- Preserve unrelated working-tree changes.
- Prefer the smallest validated fix.
- Do not claim production readiness from unit tests alone; use the task's stated gates.

## Definition of project complete
Core user journey works end-to-end; no known P0/P1 defects remain; security/auth/data-loss risks are resolved or owner-accepted; build/lint/tests and relevant runtime/production checks pass; required deployment actions are verified or explicitly owner-gated; branches/worktrees are consolidated; docs/task state match reality; structure is maintainable; and remaining work is growth/usage rather than unfinished engineering.

## Day closure — mandatory
Before stopping:
1. Update `TASKS.md` status.
2. Ensure completed/blocked tasks have a result file.
3. Record exact test/build/runtime evidence.
4. Record human blockers separately from AI-executable work.
5. Record the next smallest completion-focused task.
6. Inspect and consolidate branch/worktree state; clean merged temporary branches/worktrees when safe.
7. Check git status and identify pre-existing vs session changes.

The next session must be resumable from the four-item read order alone.