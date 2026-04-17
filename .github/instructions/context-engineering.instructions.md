description: "Use when handling large or modular codebases, cross-repo changes, semantic retrieval, Roo bridge discovery, or tasks where too much raw context would slow or confuse the agent. Adapts AutoBe-style context engineering to this workspace."
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
- If the Roo bridge MCP server is available, use it as the default semantic retrieval layer before grep or regex search. Prefer it for code chunks, scoped semantic file discovery, quick cross-repo code lookups, and docs retrieval.
- If `graphify-out/GRAPH_REPORT.md` exists, read it before raw-file search for architecture or cross-module questions. Use Graphify as the structure-map layer after Roo bridge narrows the semantic search surface.
- Prefer `graphify update .` for zero-token AST refresh after structural code changes. Use `/graphify .` in Copilot Chat only when docs, images, markdown, or other non-code corpus files need to shape the graph.
- For large navigation tasks, the preferred stack is: Roo bridge targeted search -> Graphify structure map -> code-review-graph precision -> exact file search.
- For modular refactors, stabilize interfaces and shared contracts before changing consumers. Update producers, registries, and validators before broad fan-out edits.
- When a change touches imports, exports, or module boundaries, combine semantic retrieval with exact file search and then validate with the repo's strongest structural reconciliation command plus the narrowest relevant build or test command.