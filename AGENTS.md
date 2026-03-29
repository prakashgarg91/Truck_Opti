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
