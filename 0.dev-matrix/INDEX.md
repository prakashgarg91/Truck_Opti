# INDEX — 0.dev-matrix Operating Index (Master Router)

One canonical entrypoint for EVERY agent — Claude Code, opencode, VS Code /
Copilot, Codex, JetBrains Junie, local LLMs. If you are an AI reading this:
follow the read order, then use the routing table. Do not explore beyond it.

## Folder Map (stable contract)

```
D:\Github\0.dev-matrix\
├── INDEX.md, STATE.md, TASK.md, AI-HANDOFF.md,      <- truth docs (root, never move)
│   MORNING-QUEUE.md, LAST-CLOSEOUT.md, AGENTS.md
├── *.ps1 *.py *.bat *.json                          <- operational scripts + configs (root, never move;
│                                                       scheduled tasks & 23 repos point here by absolute path)
├── docs\factory\    <- how AI work reaches repos (flow, hierarchy, opencode, AutoBE)
├── docs\tools\      <- per-tool manuals (MCP stack, graphify, CRG, roo-bridge, markitdown, browsers)
├── docs\process\    <- discipline (start/end day, testing, rules, quality, security)
├── docs\business\   <- ecosystem map, launch focus, earning prompts
├── prompts\         <- lane prompts (scout/build/review, unattended)
├── scripts\         <- shared PowerShell libraries
├── leases\ artifacts\ logs\ closeout-logs\          <- runtime state (never hand-edit)
└── archive\         <- dated/stale docs (do not read for current truth)
```

## Required Read Order (every session, any tool)

1. `STATE.md` — current blockers, alerts, active systems
2. `AI-HANDOFF.md` — newest truthful restart point
3. `TASK.md` — active queue and owner/slice alignment
4. `INDEX.md` — this router

Claude Code sessions get 1–3 injected automatically by the SessionStart
brief (`docs/process/DAY-AUTOMATION.md`). Other tools: read them yourself.

## Routing Table — "I need to..." → read this

| Need | Read |
|------|------|
| Understand how AI work flows into any repo | `docs/factory/FACTORY-FLOW.md` (canonical; stamped into every repo) |
| Run the tiered Claude factory | `docs/factory/FACTORY-HIERARCHY.md` |
| Run opencode lanes / free models | `docs/factory/OPENCODE-MANAGER.md` |
| Run the single-repo unattended pipeline | `docs/factory/MASTER-REPO-RUNNER.md` + `prompts/UNATTENDED-*.md` |
| Generate a NEW backend from requirements | `docs/factory/AUTOBE.md` (tool) + `docs/factory/AUTOBE-AGENT-PROMPT.md` (principles) |
| Get top-quality output from free/local models | `docs/factory/FREE-MODEL-EXCELLENCE.md` |
| Bootstrap ANY LLM (no tool integration) into the system | `prompts/ANY-AGENT-BOOTSTRAP.md` (paste as system prompt) |
| Know which MCP server to call, in what order | `docs/tools/MCP-STACK.md` |
| Semantic code search | `docs/tools/ROO-INDEX-BRIDGE.md` |
| Architecture/structure questions | `docs/tools/GRAPHIFY.md` |
| Blast radius before an edit | `docs/tools/CODE-REVIEW-GRAPH.md` |
| Convert PDF/Office/images to Markdown | `docs/tools/MARKITDOWN.md` |
| Browser testing (scripted) / browsing (interactive) | `docs/tools/WEBWRIGHT.md` / `docs/tools/KIMI-WEBBRIDGE.md` |
| Long-term memory across agent sessions | `docs/tools/AI-MEMORY.md` |
| Session boot / closeout ceremony | `docs/process/START-DAY.md` / `docs/process/END-DAY.md` |
| Scheduled zero-token shifts | `docs/process/DAY-AUTOMATION.md` |
| Testing & proof standard | `docs/process/TESTING_PRINCIPLES.md` |
| Baseline rules / quality bar / security | `docs/process/RULES.md`, `docs/process/QUALITY-BASELINE.md`, `docs/process/SECURITY.md` |
| Runtime error handling loop | `docs/process/RUNTIME-ERROR-LOOP.md` |
| What this portfolio IS (repos, revenue paths) | `docs/business/ECOSYSTEM.md` |
| Current launch focus | `docs/business/LAUNCH_CHECKLIST.md` |
| Repo-level AI contract (all tools) | `AGENTS.md` |

## Non-Negotiable Gates

- Zero-guessing: no non-trivial code change before Graphify and
  code-review-graph map structure and blast radius.
- Context audit first: every change starts with a short report of likely
  files, dependency risk, first failing check, and proof command.
- Test-driven: failing test first, confirm red, minimum code to green.
- Micro-scoping: one bounded transaction, one owner, one proof command.
- Reconciliation: every session ends with changed/pending/proof/blockers/debt
  captured in `AI-HANDOFF.md`.

## Context Audit Template

```text
CONTEXT AUDIT
Slice: <smallest transaction>
Files: <likely files or modules>
Dependencies: <what could break>
Test first: <test to write or failing check to run>
Proof: <command or executable validation>
```

## Prompt Order For Behavior Changes

1. Ask for the narrow test first.
2. Run it and capture the expected failure.
3. Ask for the minimum implementation.
4. Re-run the same test.
5. Run the next narrow build, lint, typecheck, or impact check.

## Maintenance

- Canonical flow doc changed? Re-stamp all repos:
  `powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\update-repo-flow-docs.ps1`
- New MCP server portfolio-wide? Extend `update-mcp-configs.ps1` only.
- New doc? Put it in the right `docs\` category and add ONE routing row here.
- Stale/dated report? Move to `archive\`. Root stays clean.
