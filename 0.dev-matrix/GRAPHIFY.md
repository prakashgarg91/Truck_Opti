# Graphify

Purpose: use Graphify as the structural map layer inside the 0.dev-matrix workflow.

Graphify is not a replacement for Roo bridge or code-review-graph.
It fills a different gap:

- Roo bridge: semantic intent search and cross-repo code discovery
- Graphify: structural orientation across the repo via communities, hubs, paths, surprising connections, and a persistent graph report
- code-review-graph: precise caller/callee impact, review blast radius, and change-risk analysis
- grep/file search: exact text confirmation after the graph layer narrows the search surface

## Best-Fit Usage In This Repo

Use Graphify when you need one or more of these:

- a fast architecture summary before reading raw files
- a map of which modules cluster together
- a shortest path between concepts, files, classes, or functions
- a persistent graph you can query across sessions
- a code-only graph refresh after structural edits with zero model-token cost
- a way to spot structural gaps via isolated communities, god nodes, or surprising connections

Do not default to a full Graphify corpus rebuild every session.
For daily work, the AST refresh is usually the fastest path.

## Recommended Retrieval Stack

1. Roo bridge first for semantic shortlist when the task is intent-based.
2. If `graphify-out/GRAPH_REPORT.md` exists, read it before raw-file search for architecture or cross-module questions.
3. Use Graphify query/path/explain to navigate the narrowed graph.
4. Use code-review-graph for exact call graphs, blast radius, and review-risk analysis.
5. Use grep/file search only after the graph layer points you at the right files.

## Standard Operating Modes

### 1. Daily code graph refresh

Use this after code-only changes or when you want a fresh structural map with no LLM or multimodal pass:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Refresh
```

This runs:

```powershell
d:\Github\Truck_Opti\.venv\Scripts\python.exe -m graphify update .
```

Outputs:

- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.json`
- `graphify-out/graph.html`

If you also want a local agent-readable wiki from the current graph:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Refresh -Wiki
```

This adds:

- `graphify-out/wiki/index.md`
- `graphify-out/wiki/*.md`

### 2. Architecture-first session start

If a graph already exists:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Status
```

Then read:

- `graphify-out/GRAPH_REPORT.md`

This should happen before raw-file search for architecture questions.

### 3. Targeted graph navigation

Query the current graph without rebuilding it:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Query "auth flow"
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Explain "MainRouter"
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -PathFrom "MainRouter" -PathTo "WebhookHandler"
```

Use these for navigation, not as final truth. Confirm important findings against real files.

### 4. Rich multimodal refresh

When code plus docs, markdown, images, screenshots, or other corpus files matter, use Copilot Chat:

```text
/graphify .
```

Use this sparingly because it is heavier than the AST-only refresh.

For a deeper agent-navigable graph wiki:

```text
/graphify . --wiki
```

For a local wiki generated from the current AST graph without a heavier multimodal rebuild:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Wiki
```

### 5. Optional MCP server

If you want the graph exposed over MCP, serve the current graph JSON:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -Serve
```

Suggested MCP server snippet for a user-managed `.vscode/mcp.json`:

```json
{
  "graphify": {
    "type": "stdio",
    "command": "d:/Github/Truck_Opti/.venv/Scripts/python.exe",
    "args": [
      "-m",
      "graphify.serve",
      "d:/Github/Truck_Opti/graphify-out/graph.json"
    ]
  }
}
```

Do not overwrite `.vscode/mcp.json` blindly in this repo because it may carry other MCP wiring.

### 6. Optional git hooks

Graphify can auto-refresh the graph after commits and branch changes:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -InstallHooks
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\graphify.ps1 -HooksStatus
```

This is optional. Enable it only if the graph becomes part of your normal review and navigation loop.

## Repo-Specific Rules

- Prefer AST-only refresh for daily work in this repo.
- Use full `/graphify .` only when non-code context materially changes the answer.
- Refresh the graph after module-boundary, routing, automation, infrastructure, or cross-file integration changes.
- Read `graphify-out/GRAPH_REPORT.md` before architecture/codebase questions when it exists.
- Use Graphify report sections such as God Nodes and Surprising Connections to spot structural gaps before deeper review.
- Treat Graphify as context acceleration, not source-of-truth evidence.

## Current Outputs

The repo graph lives under `graphify-out/` and can be refreshed with the helper script above.