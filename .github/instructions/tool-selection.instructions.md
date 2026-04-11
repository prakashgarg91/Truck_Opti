---
description: "Use when choosing tools, plugins, hooks, skills, custom agents, or validation flow for implementation, review, or repo-governance work. Keeps Copilot aligned with the official customization model and the repo's 0.dev-matrix system."
name: "Tool Selection And Validation"
---
# Tool Selection And Validation

- Use `AGENTS.md` for always-on workspace rules. Do not create a second workspace-wide `copilot-instructions.md` in this repo.
- Use `.github/instructions/*.instructions.md` for targeted guidance, `.github/agents/*.agent.md` for specialist subagents, and `.github/hooks/*.json` only for short deterministic automation.
- Prefer dedicated workspace tools over shell shortcuts when they exist:
  - use file, search, and symbol tools for codebase context and exact references
  - use symbol-aware rename and usages tools for public API or export renames
  - use diagnostics tools for compile or lint errors
  - use patch-based file edits for manual changes
  - use terminal commands for builds, tests, audits, and git operations
- Before changing architecture, launch flow, or governance behavior, read the relevant `0.dev-matrix` docs instead of inferring intent from filenames alone.
- After edits that affect public APIs, module boundaries, repo workflow, or validation scripts, run the strongest relevant repo checks and record exact evidence.
- If the task mentions imports, exports, modules, hooks, plugins, skills, agents, or registration drift, also load the module reconciliation instruction or use the `System Reconciler` agent.