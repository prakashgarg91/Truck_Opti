# Context Engineering Standard

Purpose: keep AI context lean, exact, and maintainable so modular systems stay correct under repeated changes.

## Core Principles

### 1. Structure First

- Translate open-ended requests into explicit structures before coding: affected modules, shared contracts, registries, validation commands, and expected outputs.
- Prefer changing stable boundaries once instead of duplicating the same fix across many leaf files.
- For modular systems, define or confirm interface shape first, then generate or update implementations that consume it.

### 2. Validate Continuously

- Do not wait for end-of-session validation.
- After each structural edit, run the smallest strong check that can falsify the change:
  - structure layer: manifests, docs, schema files, registries, dependency maps
  - static layer: lint, import or export checks, deep scan, symbol usage checks
  - runtime layer: launch-check, health checks, tests, close-day
- Feed exact diagnostics forward. Error text is part of the context system.

### 3. Generate Deterministically

- Keep always-on prose short. Move precision into typed structures, manifests, schemas, registries, and diagnostics.
- Prefer closed shapes over free-form summaries when the system needs to reconcile modules.
- If a rule can be encoded in a file contract, schema, or validator, do that instead of depending only on natural-language memory.

### 4. Research, Plan, Implement

- Research: inspect code and canonical docs as truth. Code beats stale prose.
- Plan: compress intent into a small ordered sequence with validation after each step.
- Implement: work from the plan in a narrowed context window so unrelated material does not pollute execution.

### 5. Stress Test the Context System

- Prefer discovering ambiguity with weaker models, narrower context windows, or stricter validators.
- If a task only succeeds with a frontier model and a bloated prompt, the context system is under-specified.
- Every failure mode should become either a clearer schema, a better validator, or a sharper retrieval rule.

## Three Validation Layers For Dev Matrix Repos

### Layer 1: Structural Truth

- `0.dev-matrix/AI-HANDOFF.md`
- `0.dev-matrix/STATE.md`
- `0.dev-matrix/TASK.md`
- `0.dev-matrix/DEPENDENCIES.md`
- `0.dev-matrix/PATTERNS.md`
- `package.json`, workflow files, `.github` customizations, and repo registries

Use this layer to confirm what exists, what depends on what, and what commands or hooks define the system.

### Layer 2: Static Reconciliation

- linting
- import and export integrity
- deep scan
- symbol usage and rename safety
- hook, plugin, MCP, skill, and agent registration checks

Use this layer to catch module mismatches before runtime.

### Layer 3: Runtime Proof

- launch-check
- targeted tests
- builds, health checks, and smoke tests
- close-day handoff continuity

Use this layer to prove the changed path still works as a system.

## Qdrant As Optional Semantic Memory

Qdrant is an accelerator, not the source of truth.

- Store curated context, not the whole repo.
- Use semantic search to shortlist likely evidence, then confirm with actual files.
- Do not store secrets, raw credentials, or transient logs.

### Recommended Use Cases

- recent handoff checkpoints across repos
- stable dependency and module descriptions
- validated implementation patterns and code snippets
- recurring failure diagnostics and their proven fixes
- cross-repo standards and template references

### Recommended Payload Metadata

- `repo`
- `filePath`
- `startLine`
- `endLine`
- `symbol`
- `type`
- `module`
- `pathSegments`
- `validatedBy`
- `validatedAt`

### Retrieval Rule

1. Query Qdrant to shortlist context.
2. Read the actual files the hits point to.
3. Edit only after file truth and vector hints agree.
4. Re-validate and only then store updated curated context if it is durable.

## Roo-Code-Inspired Operational Patterns

- Use one stable collection per workspace or per repo family, not one giant unbounded dump.
- Filter search by repo and path segments where possible.
- Preserve path metadata so semantic hits can be narrowed to a directory or module.
- Exclude metadata-only points from top-k result ranking.
- Expect embedding model changes to require dimension-aware collection handling.

## Success Criteria

- Agents retrieve less context but make fewer integration mistakes.
- Import or export mismatches are caught at the static layer before runtime.
- Large tasks are executed as research, plan, implement loops rather than one bloated context window.
- Qdrant speeds discovery without replacing canonical file verification.