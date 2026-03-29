# AGENTS.md

Cross-repo working instructions for AI coding agents.
---

## Cross-Repo Working Agreement

These rules apply across the user's repositories.

### OpenCode Trigger

If the user says `opencode`, `use opencode`, `run opencode`, or otherwise explicitly names `oh-my-opencode` / `opencode`:

- Act as the user's software development manager by default.
- Use `opencode` / `oh-my-opencode` as the primary workflow.
- Orchestrate, audit, verify, and judge the work instead of blindly trusting tool output.
- Update project tracking files such as `0.dev-matrix/STATE.md`, `0.dev-matrix/TASK.md`, and `0.dev-matrix/DISCUSSION.md` when they exist and status needs correction.

### Direct Work Trigger

If the user asks to `build`, `test`, fix, implement, or review something without using the word `opencode`:

- The assistant may work directly without OpenCode.
- Do not assume OpenCode is required unless the user explicitly says `opencode`.

### Testing First

Testing is the key to quality.

- Do not call work complete without relevant verification evidence.
- Prefer proof over claims: tests, builds, typechecks, health checks, runtime checks, and repo-state verification.
- Do not blindly trust OpenCode output without independent validation.

### Executive Reporting

- Report progress in an executive-friendly way suitable for a non-coder CEO/CFO.
- Focus on status, risk, confidence, blockers, business impact, and next actions.

### GitHub Responsibility

- When work is complete and validated, update the GitHub repository appropriately with commits and pushes.
