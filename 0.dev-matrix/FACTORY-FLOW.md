# FACTORY-FLOW — How AI Work Reaches This Repo

> Stamped 2026-06-10 from the shared matrix. **Do not edit this copy** — the
> source of truth is `D:\Github\0.dev-matrix\docs\factory\FACTORY-FLOW.md`; re-stamp all
> repos with `update-repo-flow-docs.ps1`. Full manuals live in the shared
> matrix: `docs/factory/FACTORY-HIERARCHY.md`, `docs/factory/OPENCODE-MANAGER.md`, `prompts\UNATTENDED-*.md`.
> Master router for ALL manuals: `D:\Github\0.dev-matrix\INDEX.md`.
> Complete MCP toolchain reference: `docs/tools/MCP-STACK.md`.

## The Two Unattended Front-Ends (same plant, same rules)

1. **Factory hierarchy** — Claude-tiered, cross-repo. Fable 5 leader (main
   session) → opus quality gate → sonnet managers (plan + adversarial verify)
   → haiku workers (scout, small builds, opencode orchestration) → free
   opencode models doing bulk codegen. Launched from a Claude Code session via
   the `factory-hierarchy` workflow (`.claude/workflows/factory-hierarchy.js`
   in the shared matrix). Build escalation ladder: opencode → haiku → sonnet;
   failures climb the pyramid as information, opus only gates, never builds.
2. **Unattended pipeline** — PowerShell, single repo:
   `powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\run-unattended-pipeline.ps1 -RepoPath <this repo>`
   Loops one bounded slice per run off `AI-TASKS.json`, then completion
   regression + pre-review + final review gates.

Both lanes: **one bounded validated slice per run**; the review lane is the
only lane allowed to mark a task done; **no commits** — changes stay in the
working tree for human review.

## Control Surfaces In This Repo

- `0.dev-matrix/AI-TASKS.json` — machine queue. Select `active` first, else
  first `queued`/`ready` by order. Never touch `blocked`/`parked`/`human-blocked`.
- `0.dev-matrix/STATE.md`, `TASK.md`, `INDEX.md`, `AI-HANDOFF.md` — truth
  docs. Reconcile every run; append to AI-HANDOFF, never overwrite history.
- Leases: `D:\Github\0.dev-matrix\leases\<repo>\` — one lease per
  repo/task/lane at a time.
- Artifacts: `D:\Github\0.dev-matrix\artifacts\<repo>\<task>\` — factory runs
  write `factory-<stamp>\` including the verifier's `MANAGER-REVIEW.md`.

## Mandatory Tool Stack (context BEFORE raw file reading — in this order)

1. **Roo semantic ownership**: `roo-code-index-bridge_roo-code-index-search`
   (intent/behavior questions; resolve collection / health when unclear).
2. **Graphify structure**: `graphify_query_graph`, `graphify_graph_stats`,
   `graphify_get_community`, `graphify_god_nodes`, `graphify_shortest_path`
   — pass `workspace_path="D:/Github/<repo>"`. Orient around modules and
   clusters before opening files; cut work boundaries along community seams.
3. **code-review-graph blast radius**: `code-review-graph_get_minimal_context_tool`,
   `code-review-graph_get_impact_radius_tool`, `code-review-graph_get_affected_flows_tool`
   — once the owner file is known and impact matters.
4. **Repowise wiki** (indexed repos only): `get_context`, `get_answer`,
   `search_codebase`, `get_risk`. Heed `_meta.stale_warning`.
5. **Fallback**: targeted Read/Grep on the exact files the task names.
   NO repo-wide inventories. NO open exploration.
6. **markitdown ingestion** (non-code documents): never reason over raw
   PDF/Office/image files — convert first with the `markitdown` MCP server
   (`convert_to_markdown`) or CLI
   `D:\Github\0.dev-matrix\.venv\Scripts\markitdown.exe <file> -o <task artifact dir>\ingest\<name>.md`,
   then read the Markdown. Manual: `docs/tools/MARKITDOWN.md` in the shared matrix.

Claude-tier agents load these via ToolSearch; opencode agents have them
registered directly. **Honesty rule:** if a layer is missing or degraded,
record that truthfully in the run artifact or handoff — never pretend it ran.

## AutoBE Principles (non-negotiable)

Full tool manual (five phases, AST-first compilers, SDK, local-model
support, cost model): `docs/factory/AUTOBE.md` in the shared matrix.

- **Spec-first backend gate**: new backend API surface starts from the
  spec/contract (repos using AutoBE generate from it), then implementation.
- **Test first**: when the slice changes behavior, write the narrowest
  failing test before the implementation.
- **Direct action**: once the task boundary is clear, go straight to the
  named files. Do not re-explore.
- **Narrow validation first**: run the narrowest executable proof immediately
  after the first substantive edit, not at the end.
- **Zero-bug posture**: no unhandled promises, silent catches, fake
  placeholders, TODO-stubs sold as done, or unverifiable runtime claims.

## OpenCode (free/flat-rate codegen tier)

- Launcher: `D:\Github\0.dev-matrix\run-opencode-agent.ps1 -RepoRoot <repo> -Agent build|review -Model <id> -PromptPath <file> -Pure -SkipWatch`
- Default models: scout `zai-coding-plan/glm-4.5-air` · build/review
  `zai-coding-plan/glm-4.6` · fallback `opencode-go/deepseek-v4-pro`,
  `opencode/deepseek-v4-flash-free`.
- GLM Coding Plan managed by `coding-helper`; run
  `coding-helper auth reload opencode` after key changes.
- Quality doctrine for this tier: `docs/factory/FREE-MODEL-EXCELLENCE.md`
  in the shared matrix — spec-first, deterministic gates, minimal context,
  cross-model adversarial review. Free models follow the same proof
  pipeline as Claude tiers; quality comes from the harness.
- Quality doctrine for this tier: `docs/factory/