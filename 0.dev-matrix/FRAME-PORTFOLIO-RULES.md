# Frame Hydration

Generated: 2026-06-09 21:26:01
Source: D:\Github\Frame\PORTFOLIO-RULES.md
Project: Truck_Opti
Runner: manager
Execution mode: code
Validation mode: best-effort
Requires tests: false

Read this file before planning or editing during portfolio-triggered runs.
- If execution mode is text-only, stop after repository truth, docs, or planning updates and do not force code execution.
- If validation mode is best-effort, prefer the narrowest available proof and do not invent missing compilers or test harnesses.
- If validation mode is skip, do not block on compiler or test execution; keep changes limited to text/governance surfaces.

# Portfolio Rules

These rules are hydrated into governed repos before unattended execution.

## Baseline Rules

- Work one bounded validated slice at a time.
- Use Roo Index first for semantic discovery, then Graphify, then code-review-graph when blast radius matters.
- Validate immediately after the first substantive edit before widening scope.
- Review is the only lane allowed to mark a task done in the scout/build/review flow.
- Record repeated runtime failures as durable lessons instead of rediscovering them.
- Prefer MiniMax M3 Free first for the working lanes: use it for scout, build, planning, exploration, and general execution unless a concrete limitation forces a different lane.
- Use a free review lane for normal scout/build/review flow, and reserve DeepSeek V4 Pro for the final completion review gate after the free review lane has finished.
- To save tokens and money, use Roo Index, Graphify, and code-review-graph before broad file reads, repo inventories, or repeated grep passes.
- In unattended OpenCode work, use the exact MCP retrieval stack while working: `roo-code-index-bridge_roo-code-index-search` first for semantic ownership, Graphify MCP tools second for structure, and `code-review-graph_*_tool` calls third for blast radius and affected flows.
- Pass explicit repo roots to Roo bridge and code-review-graph in multi-repo work so OpenCode does not waste tokens on the wrong workspace.

## Learned Rules

