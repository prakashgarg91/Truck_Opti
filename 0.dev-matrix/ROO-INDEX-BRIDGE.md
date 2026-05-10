# Roo Code Index Bridge

Purpose: use the canonical `roo-code-index-bridge` MCP as the default semantic code-search layer across repos.

This is the first search layer for intent-based code questions.

## What It Is For

Use Roo bridge when you need to answer questions like:

- where is auth/session refresh handled?
- what files own webhook verification?
- where does this repo implement close-day or launch flow?
- what code matches a behavior even if the exact text is unknown?

Use grep only after Roo narrows the search surface.

## Standard MCP Tools

- `roo-code-index-search`
- `roo-code-index-resolve-collection`
- `roo-code-index-health`

Preferred usage:

```text
roo-code-index-health(workspace_path="D:/Github/<repo>")
roo-code-index-search(query="payment verification flow", workspace_path="D:/Github/<repo>")
roo-code-index-resolve-collection(workspace_path="D:/Github/<repo>")
```

## Health First

Before trusting semantic search for a repo, check whether it is on real Qdrant search or degraded fallback mode.

Expected healthy state:

- `workspace.status = ok`
- `resolution_mode = qdrant`

Degraded but usable state:

- `workspace.status = degraded`
- `resolution_mode = roo-local-cache`

Failure state:

- no matching `ws-*` collection
- no Roo local cache manifest
- semantic search is not trustworthy for that repo yet

## Command-Level Validation

Bridge smoke test:

```powershell
node D:\Github\tools\roo-index-smoke.mjs --workspace D:\Github\<repo>
```

Sync workspace mappings when needed:

```powershell
node D:\Github\tools\roo-index-sync-mcp.mjs --all --apply
```

## Search Rules

1. Use Roo bridge first for intent-based discovery.
2. Pass the absolute repo path every time in multi-repo work.
3. Confirm important findings with real files before editing.
4. If the bridge reports fallback mode, call that out in handoff and close-day instead of pretending the repo is fully indexed.

## When Not To Use It

Do not use Roo bridge as the last word when:

- the repo is in fallback mode and results are sparse
- you already know the exact file and symbol
- you need precise caller/callee impact rather than semantic discovery

In those cases, switch to grep, file search, or code-review-graph.

## Operational Rule

For this workspace, there should be one canonical bridge server name only:

- `roo-code-index-bridge`

Do not reintroduce legacy alias names such as `roo-index-bridge` in repo MCP configs.