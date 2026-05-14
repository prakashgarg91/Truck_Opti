# code-review-graph

Purpose: use code-review-graph as the precise impact-analysis layer in the dev-matrix workflow.

It is not a replacement for Roo bridge or Graphify.

- Roo bridge answers: where is the intent or behavior handled?
- Graphify answers: how is the repo structurally shaped?
- code-review-graph answers: what calls what, what changed, and what else breaks if this changes?

## Best Use Cases

Use code-review-graph when you need:

- blast radius before editing a risky file
- call graph understanding around a function, class, or route
- review-risk analysis after a change
- change detection scoped to one repo
- architecture checks grounded in actual code relationships

## Daily Commands

Initial build for a repo:

```powershell
code-review-graph build --repo D:\Github\<repo>
```

Incremental refresh during normal work:

```powershell
code-review-graph update --repo D:\Github\<repo>
```

Keep the graph live while coding:

```powershell
code-review-graph watch --repo D:\Github\<repo>
```

Check graph health:

```powershell
code-review-graph status --repo D:\Github\<repo>
```

Inspect current change risk:

```powershell
code-review-graph detect-changes --repo D:\Github\<repo>
```

## MCP Usage Standard

In this `D:\Github` multi-repo workspace, always pass the target repo explicitly.

Preferred pattern:

```text
detect_changes_tool(repo_root="D:/Github/<repo>")
get_review_context_tool(repo_root="D:/Github/<repo>")
get_impact_radius_tool(repo_root="D:/Github/<repo>")
get_affected_flows_tool(repo_root="D:/Github/<repo>")
```

Do not rely on implicit workspace detection when multiple repos are open or when the active terminal is in a different repo.

## Recommended Workflow

1. Run `update --repo` at start-day or after pulling changes.
2. Use Roo bridge first when the question is semantic or behavior-based.
3. Use code-review-graph once the likely owning file or module is known.
4. Before committing, run `detect-changes --repo` or the equivalent MCP tool for review risk.

## Failure Signals

- graph is stale after major refactor
- repo path was omitted in a multi-repo session
- review was done from grep only with no impact check on risky code
- a cross-module change shipped without a blast-radius check

## Operational Rule

If a change can affect auth, routing, payments, queueing, orchestration, or external integration behavior, use code-review-graph before calling the slice ready.