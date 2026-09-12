# AGENTS — Simple Agent Operating Contract

Canonical entry point for every coding agent in Truck_Opti.

## Read order
1. `AGENTS.md`
2. `ARCHITECTURE.md`
3. `TASKS.md`
4. The single assigned file in `agent-tasks/`

`0.dev-matrix/` is legacy/reference material during migration. Do not use it as the operating router unless a current task explicitly links to a specific historical artifact.

## Roles
- **GPT-6 / Codex supervisor:** architecture, task decomposition, difficult debugging, integration, review, final verification, and `TASKS.md` ownership.
- **GLM-5.3 Flash workers:** bounded implementation/test/docs work from one `agent-tasks/NNN-*.md` brief at a time.

## Work contract
1. Claim one `READY` task and mark `IN_PROGRESS`.
2. Read only the relevant brief and code/docs required for that scope.
3. Do not widen scope or redesign architecture without supervisor approval.
4. Run required checks.
5. Write `agent-results/NNN-result.md` with changed files, exact verification, blockers, and next recommendation.
6. GPT-6 reviews before the task becomes `DONE`.

## Guardrails
- Never commit secrets or production credentials.
- No `supabase db push`, real payment, credential rotation, production deploy, destructive database operation, or other live irreversible action without explicit owner authorization.
- Preserve unrelated working-tree changes.
- Prefer the smallest validated fix.
- Do not claim production readiness from unit tests alone; use the task's stated gates.

## Day closure — mandatory
Before stopping:
1. Update `TASKS.md` status.
2. Ensure completed/blocked tasks have a result file.
3. Record exact test/build/runtime evidence.
4. Record human blockers separately from AI-executable work.
5. Record the next smallest task.
6. Check git status and identify pre-existing vs session changes.

The next session must be resumable from the four-item read order alone.
