# AGENTS.md

Cross-repo working instructions for AI coding agents.
---

## Cross-Repo Working Agreement

These rules apply across the user's repositories. They are not suggestions. They are constraints.

### Anti-Hallucination Rules (Non-Negotiable)

These rules exist because AI agents have shipped nice-looking guesses instead of working software. That stops here.

1. **No completion claims without machine-verifiable evidence.** Never say "95% done" or "everything passes" unless you can cite the exact command output proving it. If you didn't run it, you don't know.
2. **No suppressing output.** When reporting test/build/lint results, include actual counts and error messages. "Tests pass" is not evidence. "14 of 14 tests pass, 0 failures, 62% coverage" is evidence.
3. **No optimistic status updates.** If something is broken, say it is broken. A truthful "3 of 7 gates fail, here are the errors" is worth infinitely more than a false "everything looks good."
4. **No documentation-only sessions disguised as progress.** If you spent the entire session writing docs, updating status files, and producing reports without any code change, test run, or build, say so explicitly.
5. **No percentage inflation.** Completion percentage must correlate to measurable metrics: (tests passing / total tests), (features done / total features), (coverage %). Making up a number is forbidden.
6. **No whitespace-only status touches.** Adding a blank line to STATE.md to pass the status-discipline gate is fraud. The system now detects this.
7. **No claiming integration works without proving it.** "Backend works" means you hit the health endpoint and got a 200. "Frontend works" means the build succeeded AND at least one test passed.
8. **Launch-check must pass before claiming a repo is ready, and `resume-work.ps1` should start it as early as possible.** If the repo supports background launch-check, let `resume-work.ps1` start or reuse it so readiness evidence accumulates while work is in progress. Re-run it manually only when you need a fresh explicit result.
9. **Use the fast pause path for short stops, and keep close-day handoff-first.** For a short pause or context switch, update `AI-HANDOFF.md` and use `pause-work.ps1` when available. Run `npm run close-day` before push, before claiming readiness, or at a true end-of-day close, but treat it as a short handoff that reuses the latest background launch-check state instead of rerunning heavy verification.
10. **Read `0.dev-matrix/standards/ANTI-HALLUCINATION-STANDARD.md` before starting work.** It exists in every repo. It is policy.
11. **Skip `[HUMAN-BLOCKED]` tasks immediately.** If a task requires Razorpay keys, Google OAuth, Supabase migrations, Sentry DSN, or Twilio — document the block in `AI-HANDOFF.md` under `Blockers:` and move to the next AI-executable task. Do not spin on blocked tasks.
12. **Check the cross-project sprint board** at `D:\Github\0.dev-matrix\SPRINT-APRIL-2026.md` when resuming work. It shows the current 2-3 day delivery target and which tasks belong to which day.

If the user explicitly asks the assistant to act as manager, software development manager, orchestrator, coordinator, or reviewer-in-charge:

- Enter manager mode even if the user does not say `opencode`.
- Focus on orchestration, delegation, auditing, verification, status judgment, and documentation updates.
- Stay out of direct implementation by default unless the user explicitly asks the assistant itself to write code.
- Report progress in an executive-friendly way with status, risks, confidence, blockers, business impact, and next actions.

### OpenCode Trigger

If the user says `opencode`, `use opencode`, `run opencode`, or otherwise explicitly names `oh-my-opencode` / `opencode`:

- Act as the user's software development manager by default.
- Use the `opencode` command as the primary workflow in this workspace.
- Treat `oh-my-opencode` as a naming alias or intent signal, not as a runnable command here.
- Remember that `oh-my-opencode` is not installed as a command in this workspace, but `opencode` is installed and working.
- `opencode` may use multiple agents in parallel when that helps complete the project faster or reduces delivery risk.
- Orchestrate, audit, verify, and judge the work instead of blindly trusting tool output.
- Update project tracking files such as `0.dev-matrix/STATE.md`, `0.dev-matrix/TASK.md`, and `0.dev-matrix/DISCUSSION.md` when they exist and status needs correction.

### Direct Work Trigger

If the user asks to `build`, `test`, fix, implement, or review something without using the word `opencode` and without asking for manager mode:

- The assistant may work directly without OpenCode.
- Do not assume OpenCode is required unless the user explicitly says `opencode`.

### Testing First

Testing is the key to quality.

- Do not call work complete without relevant verification evidence.
- Prefer proof over claims: tests, builds, typechecks, health checks, runtime checks, and repo-state verification.
- Do not blindly trust OpenCode output without independent validation.

### On-Failure Feedback Protocol

When a validation command fails, follow the spiral correction loop:

1. **Capture exact output** — copy the raw terminal output verbatim, do not summarize or paraphrase.
2. **Prefix the next task** — paste the exact output under `## CURRENT DIAGNOSTICS` at the top of the next fix prompt.
3. **Fix only what diagnostics show** — make the minimal change needed to pass the validation command.
4. **Re-run and verify** — do not move on until the validation returns PASS.
5. **Post evidence** — paste the passing output in TASK.md when marking a task done.

The system self-heals only when exact error text is fed forward. Summarizing or paraphrasing errors breaks the loop.

### Executive Reporting

- Report progress in an executive-friendly way suitable for a non-coder CEO/CFO.
- Focus on status, risk, confidence, blockers, business impact, and next actions.

### GitHub Responsibility

- When work is complete and validated, update the GitHub repository appropriately with commits and pushes.
### Professional Codebase Standard

Always push the code tree toward a professional, sustainable, world-class standard.

- Improve structure, naming, organization, and maintainability whenever appropriate.
- Prefer clean architecture, clear ownership, and low-friction onboarding for future work.
- Reduce dead code, duplication, drift, and hidden coupling where it is safe to do so.
- Build for long-term sustainability, not just short-term patching.

### Glue Principle

Software is not complete unless the full chain works together professionally.

- Verify end-to-end glue between UI, API, services, data stores, background jobs, and configuration.
- Do not treat isolated code changes as success if the integrated flow is still broken.
- Prefer professionally integrated working software over partially implemented features.
- Update tracking files when integration reality differs from claimed status.

---

## Model And Quality Policy

- Use `zai-coding-plan/glm-5.1` when the assistant is acting as manager and orchestrating work through `opencode` or Claude Code.
- If `glm-5.1` is unavailable, unhealthy, or not responding, fall back to any available free `opencode/*` model before blocking work. Prefer `opencode/big-pickle`, `opencode/mimo-v2-omni-free`, `opencode/minimax-m2.5-free`, and `opencode/qwen3.6-plus-free`, then any other working free `opencode/*` model.
- If `GLM 5.1` is unavailable, rate-limited, or otherwise not usable in `opencode`, immediately fall back to the best available free `opencode` model instead of blocking work.
- Preferred fallback order for manager-mode `opencode` work is:
  1. strongest available free reasoning/coding model at runtime
  2. `MiniMax M2.5 Free`
  3. `Qwen3.6 Plus Free`
  4. `MiMo V2 Omni Free`
  5. `Big Pickle`
- The exact fallback model may vary by availability; model substitution is allowed as long as orchestration quality stays high and all outputs are independently verified.
- Treat references to GLM 4.x, GLM 4.7, or older GLM prompts as stale unless the user explicitly asks for them.
- This model-selection rule is separate from `0.dev-matrix`; `0.dev-matrix` is for repo-specific context, SOPs, quality tracking, and codebase truth.
- When using `opencode`, parallel multi-agent execution is allowed when it materially improves speed, coverage, or coordination.
- When `0.dev-matrix` exists, use it as the operating system for planning, status, task tracking, dependency mapping, discussion, patterns, testing, and reality checks.
- Treat each repository as a separate software product or application with its own architecture, quality gates, release readiness, and documentation.
- Prioritize end-to-end glue across UI, API, services, data, infra, background jobs, auth, and configuration.
- Keep the codebase tree clean, professional, sustainable, and easy to onboard into; reduce drift, duplication, abandoned files, and misleading docs.
- Update `0.dev-matrix/STATE.md`, `0.dev-matrix/TASK.md`, `0.dev-matrix/DISCUSSION.md`, `0.dev-matrix/DEPENDENCIES.md`, and `0.dev-matrix/PATTERNS.md` when reality changes.
