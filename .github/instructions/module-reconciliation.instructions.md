---
description: "Use when editing imports, exports, module boundaries, file moves, service registration, hooks, plugins, skills, agents, or cross-file integration. Keeps modular designs reconciled as one system and prevents import/export drift."
name: "Module Reconciliation"
---
# Module Reconciliation

- Treat the repo as one reconciled system: source files, exports, registries, scripts, docs, hooks, agents, and validation must agree in the same change.
- Before editing, trace both directions: who imports, calls, or registers the target file, and what that file imports, exports, configures, or declares.
- When moving or renaming a module, update imports, exports, command registration, menu wiring, hook or plugin references, custom agent references, docs, and tests together.
- Check declared registries and integration maps when they are relevant to the change: `package.json`, `0.dev-matrix/DEPENDENCIES.md`, `0.dev-matrix/FRAMEWORK.md`, `0.dev-matrix/features.json`, `0.dev-matrix/init.ps1`, and `.github` customizations.
- Prefer symbol-aware rename and usages tools when available. If they are not available for the surface you are changing, do a full-text search before and after the edit.
- Validate with the repo's strongest lint, type, or static-structure checks. When available, use dedicated import or export reconciliation commands such as `npm run deep-scan`. If startup, workflow wiring, or verification flow changed, also run the narrowest relevant runtime command.
- Do not claim completion while any import target, export consumer, hook command, agent reference, or registry entry points at a missing, renamed, or stale path.