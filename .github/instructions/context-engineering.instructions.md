---
description: "Use when handling large or modular codebases, cross-repo changes, semantic retrieval, RAG, Qdrant context memory, or tasks where too much raw context would slow or confuse the agent. Adapts AutoBe-style context engineering to this workspace."
name: "Context Engineering"
---
# Context Engineering

- Structure first: convert the user request into explicit affected modules, contracts, registries, validation surfaces, and handoff outputs before editing.
- Validate continuously: after each structural change, run the smallest meaningful static or runtime check instead of waiting until the end.
- Generate deterministically: prefer typed inputs, schema-shaped data, registries, manifests, and exact diagnostics over open-ended prose.
- Curate context, do not dump it. Retrieve only the docs, files, symbols, and evidence needed for the current step.
- Follow the RPI loop for large tasks:
  - Research: inspect code and canonical docs as truth.
  - Plan: compress intent into a concrete sequence of edits and validations.
  - Implement: execute in a narrow context with the plan already fixed.
- Keep always-on instructions small. Put durable rules in `AGENTS.md`, targeted guidance here, and deep repo truth in `0.dev-matrix`.
- If Qdrant MCP is available, use it as a semantic reference layer to shortlist likely context. Never treat vector hits as final truth; read the real files before editing.
- For modular refactors, stabilize interfaces and shared contracts before changing consumers. Update producers, registries, and validators before broad fan-out edits.
- When a change touches imports, exports, or module boundaries, combine semantic retrieval with exact file search and then validate with the repo's strongest structural reconciliation command plus the narrowest relevant build or test command.