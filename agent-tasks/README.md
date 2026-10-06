# Agent task briefs

Use `NNN-short-name.md`. Each brief must state objective, allowed scope, forbidden scope, acceptance criteria, required verification, dependencies/owner gates, and expected result file.

Workers do not widen scope. Return architectural uncertainty to GPT-6.

## Current pilot sequence (2026-10-06)

Owner requirements/journeys: `docs/PRODUCT_ROADMAP.md`. Brief 031 contains the assessment and detailed reusable build prompt. Briefs 032–043 define dependency-ordered pilot slices; TASKS.md alone determines READY/blocked/DONE. Start at TO-142/032, not the historical September sequence below. These handoffs do not claim features were built. One writer on main; hosted actions remain owner-gated.
## Completion-task execution contract (2026-09-30)

The remaining briefs 011-030 were prepared by GPT-6 after current repository checks. They refine TO-112, not a new task board. Read AGENTS.md -> ARCHITECTURE.md -> TASKS.md -> your single assigned brief. This README supplies the shared execution rules.

- Execute exactly one assigned task at a time as GLM-5.3 Flash. Mark only that task IN_PROGRESS if its dependencies are accepted. Do not change other tasks' status. GPT-6 owns architecture, review, integration and DONE decisions.
- Main is the only persistent branch/worktree. One writer at a time. Inspect status/worktrees/remotes, fetch, and pull only when fast-forward-safe. Never create branches/worktrees/stashes, force-push, or overwrite unrelated changes. Stop on concurrent writes.
- Search the semantic index first; use CodeGraph first when .codegraph exists. Read the actual source before trusting old results. Do not regenerate/rebuild/delete indexes automatically.
- Stay inside the brief's allowed files. New small helpers/tests within the stated subsystem are allowed; report any cross-subsystem redesign to GPT-6. Start behavior changes with a failing regression test. Preserve existing successful work.
- UI work follows Stitch: check status/key/canonical repo, call guide, reuse the existing project, audit actual routes, recover ambiguous mutations read-only, never auto-retry a mutation. P0 fixes may proceed; P1/P2 design changes need owner selection. No Stitch mutation for backend-only work.
- No production deployment, hosted db push, real payment, credential rotation or destructive database operation without explicit owner authorization. Local tests use disposable databases. Do not request secrets in chat; use approved secure configuration and report presence only.
- Verify appropriate focused tests plus build/lint and relevant runtime checks. Record command, directory, exit code, counts, artifact and whether evidence is mock, local DB, staging or production. An unavailable mandatory check is BLOCKED, not PASS. Never silently remove assertions, ignore app errors or count mocked role injection as live auth proof.
- Write agent-results/NNN-result.md using PASS (ready for review), CHANGES_REQUIRED or BLOCKED; include changed files, red/green evidence, runtime proof, assumptions, owner blockers, next smallest step and git state. Use AWAITING_REVIEW in TASKS.md on worker completion. Only GPT-6 may mark DONE after review.
- Commit only cohesive verified assigned changes on main; do not stage unrelated files or publish without required gates. Preserve owner-gated work as CODE_DONE_OWNER_BLOCKED, never FULLY_OPERATIONAL.

The approved mission scope is supported customer, driver, agency and admin journeys; safe local mode; auth/data/privacy; the selected payment path; monitoring/recovery; reproducible verification and repository consolidation. Optional marketplace/Android/design expansion is outside these completion tasks.
