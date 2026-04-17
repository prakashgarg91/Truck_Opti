# Context Engineering

Purpose: keep AI context focused enough that modular changes remain accurate, maintainable, and fast.

## Working Rules

- Structure first: identify affected modules, contracts, registries, and validation commands before editing.
- Use the RPI loop for large tasks:
  - Research: inspect code and canonical docs as truth.
  - Plan: compress intent into a short ordered sequence.
  - Implement: execute in focused context and validate continuously.
- Prefer typed structures, manifests, and exact diagnostics over long prose instructions.
- For modular systems, update interfaces and shared contracts before broad consumer edits.

## Semantic Retrieval

If Roo bridge MCP is available:

- use `search_roo_index` as the default semantic retrieval layer for code, docs, and handoff references
- use `detect_roo_index_collection` when workspace mapping needs confirmation
- treat results as hints, not source of truth
- confirm every hit against real files before editing
- store only curated, durable context after validation

## Good Candidates For Curated Context

- latest handoff checkpoints
- dependency and module summaries
- validated implementation snippets
- recurring failure diagnostics and verified fixes
- cross-repo standards and template references

## Validation Order

1. structural truth: docs, manifests, registries
2. static reconciliation: lint, import or export checks, deep scan
3. runtime proof: launch-check, tests, health checks

If a change passes only with huge prompts and weak validation, the context system is still too noisy.