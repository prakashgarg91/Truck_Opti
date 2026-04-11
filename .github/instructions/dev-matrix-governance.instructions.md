---
description: "Use when editing 0.dev-matrix docs, scripts, templates, standards, or rollout rules. Keeps the repo aligned with the official Copilot customization model while preserving 0.dev-matrix as deep source-of-truth governance."
name: "Dev Matrix Governance"
applyTo: "0.dev-matrix/**"
---
# Dev Matrix Governance

- `Github-manager/0.dev-matrix` is the source of truth for shared governance behavior. Update shared behavior here first.
- If a change affects more than this repo, update the corresponding `0.dev-matrix/master-template` content and any canonical docs that describe rollout shape.
- Keep `0.dev-matrix` as deep repo-operating truth. Keep `AGENTS.md` concise and always-on, and put targeted Copilot guidance in `.github/instructions` or `.github/agents` instead of duplicating large docs.
- Use `AGENTS.md` as the single workspace-wide instruction file for this repo. Do not create a parallel `copilot-instructions.md`.
- Preserve the handoff-first, background launch-check, evidence-based launch-check, and close-day rules unless the task is explicitly redesigning them.
- When changing governance or quality policy, update both the enforcing script and the explanatory doc that tells future agents how the policy works.