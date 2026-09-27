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
## Stitch design work — standing instruction
- stitch_* tools are approved for this repository. Any session doing UI work calls the stitch_guide tool first and follows it as the workflow of record.
- Audit-first (automatic): keep docs/design-audit.md current. If it is missing or older than the latest route changes, run the stitch_guide app audit UNPROMPTED before any design task, then propose the prioritized backlog. After every integrated screen, update the audit/backlog and propose the next item with one line of evidence.
- Standing approval to execute: work the backlog one item at a time — generate -> checkpoint -> integrate -> verify (typecheck, tests, browser at mobile AND desktop widths) -> update audit -> report after each item. P0 items (journey-breaking gaps) proceed without asking; P1/P2 wait for owner selection. Mutation rules from stitch_guide never relax: one attempt per screen, never auto-retried, journal/poll recovery on ambiguity.

<!-- STITCH_MCP_POLICY_START -->
### Stitch MCP policy (managed)

- Stitch MCP is the preferred design tool for UI/UX work when it is available. It is
  not called for backend-only, documentation-only, or non-visual work.
- Before any Stitch work: read this repository's instructions; inspect dirty state;
  understand the UI stack and the existing design system; call `stitch_status` and
  require `keyConfigured=true`; require `repoRoot` to equal this canonical repository.
- Call `stitch_guide` and follow its current workflow before the first design task in
  a session.
- List and reuse existing Stitch projects before creating new ones.
- One repository owns one Stitch project. Confirm project identity before mapping.
- Never expose credentials, including `STITCH_API_KEY`.
- Never retry a mutating call automatically (create, edit, delete, generate, variants,
  design-system mutations, delete_project, map). For ambiguous or timed-out mutations,
  recover through read-only inspection (`stitch_list_projects`, `stitch_list_screens`,
  `stitch_get_project`, `stitch_get_screen`).
- Retrieve journaled artifacts instead of repeatedly fetching or pasting oversized
  payloads.
- Adapt generated designs to this repository's existing components, design tokens,
  routing, APIs, state management, authentication, and accessibility requirements.
  Never paste generated code unchanged.
- Professional completion requires: route/screen coverage; action/button mapping; API
  mapping; loading, empty, error, success, and permission states; responsive behavior;
  keyboard navigation; contrast and semantic accessibility; typecheck; tests; and
  browser verification at desktop and mobile sizes.
- Repository restrictions override global standing permissions.
- Do not claim application completion merely because a design was generated.
- Report project IDs, screen IDs, artifact paths, mutation count, retry count, changed
  files, test evidence, and screenshots.
- Do not modify Stitch projects for non-UI tasks.
<!-- STITCH_MCP_POLICY_END -->

<!-- MAIN_ONLY_POLICY_START -->
### Main-only Git policy (managed)

- `main` is the only persistent branch; the primary checkout is the only persistent
  worktree.
- Do not create forks, feature branches, or worktrees without explicit owner approval.
- Writing agents are serialized on `main`: one writer at a time.
- Inspect dirty state before editing; never overwrite another agent's changes.
- Commit cohesive, verified changes directly to `main`.
- Fetch before work; pull only when fast-forward-safe.
- Never force-push.
- Push `main` only after tests pass.
- If concurrent writes are detected, stop rather than creating an automatic worktree.
- Temporary isolation (extra branches, worktrees, stashes) is prohibited unless the
  owner explicitly changes this policy.
<!-- MAIN_ONLY_POLICY_END -->
