# WATCH - Live Operational Intelligence Layer
> **Version**: 1.0 | **Integrated**: 2026-04-12
> **Purpose**: The glue that makes 0.dev-matrix a living system, not just documentation.
> **Scope**: All repos in D:\Github, unified under one operational intelligence framework.

---

## What WATCH Does

WATCH is the **always-on meta-operating layer** for the 0.dev-matrix development system.
It binds every repo's VS Code session to the sprint state, Roo bridge retrieval, and close-day discipline automatically.

| Layer | Mechanism | What it provides |
|-------|-----------|-----------------|
| **Session Context** | `copilot-instructions.md` per repo | AI auto-loads repo state at every chat start |
| **Semantic Retrieval** | `roo-code-index-bridge` MCP server from `D:\Github\roo-code-index-bridge-mcp` | Code-first semantic search and docs retrieval across repos |
| **Architecture Retrieval** | `graphify` MCP wrapper from `D:\Github\tools\graphify-opencode-mcp.ps1` | Graph-backed architecture/context retrieval using each repo graph when present |
| **AST Graph** | `code-review-graph` MCP server, per repo | Call graph, impact radius, blast-radius analysis, 22 MCP tools |
| **Worker Delegation** | `agent-delegator` MCP server from `D:\Github\Telegram-MCP\mcp-agents` | Parallel opencode workers (zaiCoding / opencodeFree) for bounded subtasks |
| **Opencode Manager** | `run-opencode-manager.ps1` + `prompts\` + `leases\` + `artifacts\` | Scout/build/review lane orchestration with repo-scoped leases, shared artifacts, and independent auditor flow |
| **Lifecycle Hooks** | `.github/hooks/watch-session.json` | Session start injects sprint + handoff context |
| **Delivery Intelligence** | `.github/hooks/delivery-intelligence.json` | Session-start/stop reminders tied to the cross-repo delivery hub |
| **OpenHarness Entry** | `0.dev-matrix/openharness.ps1` + `.openharness/skills/launch-revenue/SKILL.md` | Repo-local OpenHarness launcher with Copilot auth, `gpt-5.4`, `effort=max`, and earning-focused execution rules |
| **Optional Terminal Agent** | User-scope `C:\Users\Prakash\.junie\junie-zai.ps1` + `~/.junie/mcp/mcp.json` | Hardened Junie entry using `glm-5.1` for second-opinion reviews, terminal summaries, and optional headless tasks |
| **Browser Control (Optional)** | Per-repo `.<agent>/skills/kimi-webbridge/` skill + local daemon at `http://127.0.0.1:10086` paired with the user's Chrome/Edge extension | Real browser automation through the user's existing logged-in browser — interactive browsing, scraping, login-gated flows that Playwright cannot reach (see `docs/tools/KIMI-WEBBRIDGE.md`) |
| **Web Testing (Optional)** | Per-repo `.<agent>/skills/webwright/` skill + local clone at `D:\Github\Webwright` | Microsoft Research terminal-native web-agent framework — LLM writes Playwright code, replays are deterministic scripts, SOTA on long-horizon web tasks (see `docs/tools/WEBWRIGHT.md`) || **Long-Term Memory (Optional)** | ai-memory Docker container on `http://127.0.0.1:49374/mcp` + per-repo `.vscode/mcp.json` entry | Cross-session memory shared across agent CLIs; auto-capture where lifecycle hooks exist. Call `memory_query`, `memory_briefing`, or `memory_explore` when resuming or searching past work (see `docs/tools/AI-MEMORY.md`) || **Shared Capabilities** | `D:\Github\Office_Scripts\Shared-scripts` | Cross-repo reusable building blocks such as Source Watch, provider fallbacks, and helper adapters without merging product repos |
| **Close-Day Gate** | `0.dev-matrix/CLOSING-DAY-HOOK.md` | Enforces handoff discipline before each stop |
| **Sprint Truth** | `SPRINT-APRIL-2026.md` + this STATE.md | Single source of what is active, blocked, done |
| **Bridge Validation** | `tools/roo-index-smoke.mjs` | Verifies local MCP registration, collection detection, and search routing |

---

## Architecture

```
D:\Github\
+-- .github\
|   +-- copilot-instructions.md      <- Global Watch instructions (every session)
|   `-- hooks\
|       +-- watch-session.json       <- SessionStart hook -> injects sprint context
|       `-- delivery-intelligence.json <- SessionStart + Stop hooks -> delivery capture loop
|
+-- .vscode\
|   `-- mcp.json                     <- Root-level Roo bridge + Graphify + CRG MCP
|
+-- 0.dev-matrix\
|   +-- docs/tools/WATCH.md                     <- (this file) System definition
|   +-- docs/process/START-DAY.md                 <- Canonical repo start-day workflow
|   +-- docs/process/END-DAY.md                   <- Canonical repo end-day workflow
|   +-- docs/tools/ROO-INDEX-BRIDGE.md          <- Semantic code search usage guide
|   +-- docs/tools/CODE-REVIEW-GRAPH.md         <- Impact-analysis usage guide
|   +-- docs/tools/GRAPHIFY.md                  <- Structural graph usage guide
|   +-- docs/factory/OPENHARNESS.md               <- Repo-local OpenHarness usage guide
|   +-- docs/tools/JUNIE.md                     <- Optional Junie usage guide
|   +-- run-openharness.ps1          <- Shared OpenHarness launcher (Copilot + GPT-5.4 + max effort)
|   +-- install-openharness-project-template.ps1 <- Rolls repo-local OpenHarness launcher + skill
|   +-- update-mcp-configs.ps1       <- Rolls canonical Roo + Graphify + CRG MCP defaults
|   +-- STATE.md                     <- Sprint state: what is active/blocked/done
|   +-- AI-HANDOFF.md                <- Sprint-level handoff for cross-session continuity
|   +-- TASK.md                      <- Active sprint tasks across all repos
|   +-- DISCUSSION.md                <- Sprint decisions log
|   +-- docs/business/LAUNCH_CHECKLIST.md          <- Cross-repo launch focus
|   +-- docs/process/CLOSING-DAY-HOOK.md          <- Meta close-day instructions
|   +-- watch-session-start.ps1      <- Script run at session start (surfaces context)
|   +-- install-delivery-intelligence-hook.ps1 <- Repo-local bridge installer
|   +-- docs/tools/DELIVERY-INTELLIGENCE.md     <- Hub integration and usage guide
|   +-- docs/factory/AUTOBE-AGENT-PROMPT.md       <- AutoBE integration prompt
|   `-- SPRINT-APRIL-2026.md         <- April 2026 sprint plan
|
+-- Office_Scripts\
|   `-- Shared-scripts\             <- Canonical shared capability home
|       +-- source-watch\           <- Website monitoring, RSS, dedupe, normalized items
|       +-- github-copilot-bridge\  <- Existing shared integration helpers
|       `-- Skills\                 <- Reusable capability skills and docs
|
`-- [repo]\
	+-- .github\
	|   +-- copilot-instructions.md  <- Per-repo Watch context (auto-loaded)
	|   +-- agents\
	|   |   `-- system-reconciler.agent.md
	|   `-- hooks\
	|       +-- watch-session.json   <- Per-repo session hook
	|       `-- delivery-intelligence.json <- Bridge to central delivery hub
	+-- .openharness\
	|   `-- skills\
	|       `-- launch-revenue\
	|           `-- SKILL.md         <- Repo-local earning/launch skill for OpenHarness
	+-- .vscode\
	|   +-- mcp.json                 <- Roo bridge + Graphify + CRG + repo-specific MCP (auto-configured)
	|   `-- settings.json            <- Standardized Watch settings
	+-- .code-review-graphignore     <- Excludes build artifacts from AST graph
	`-- 0.dev-matrix\
		+-- STATE.md                 <- Repo state
		+-- AI-HANDOFF.md            <- Repo handoff
		+-- openharness.ps1          <- Repo-local OpenHarness entrypoint
		`-- docs/process/CLOSING-DAY-HOOK.md      <- Repo close-day trigger
```

## Shared Capability Home

Use `D:\Github\Office_Scripts\Shared-scripts\` as the canonical home for reusable cross-repo capabilities that should stay outside product repos.

Put generic building blocks here, not product-specific business logic. Good candidates include:

- Source Watch: website monitoring, RSS/feed polling, dedupe, normalized items
- provider fallbacks and model-selection helpers
- shared adapters, contracts, and thin wrappers over official APIs

If a shared capability becomes stateful, long-running, or language-mixed, promote it to a small service and keep thin client wrappers or contract docs in `Shared-scripts`.

The first canonical shared capability is `Source Watch`. Its job is to emit normalized source items that multiple repos can consume independently without importing each other's code.

---

## Repo Registry

| Repo | Stack | Sprint Priority | Status |
|------|-------|-----------------|--------|
| `0.dev-matrix` (meta) | meta/orchestration | META | Active |
| `AI_accounting_v1` | Python/AI/Node | P2 | Dev |
| `AutoBE` | TypeScript/NestJS | TOOL | Active |
| `Blogger-MCP` | Python/MCP | P1 | Dev |
| `Github-manager` | Node/Automation | **SOURCE-OF-TRUTH** | Active |
| `Job-360` | Next.js/Ollama | P1 | Dev |
| `Office_Scripts` | TypeScript/Office | P2 | Low |
| `Other-backup` | various | P3 | Archive |
| `Telegram-MCP` | Python/MCP | P1 | Dev |
| `trading-rex-ai` | Python/AI | P1 | Dev |
| `Truck_Opti` | React/Supabase/Node | **P0 LAUNCH** | Launch |
| `Truck_Opti_verify_packing` | Python | P0 Support | Launch |

---

## Session Start Protocol

See `docs/process/START-DAY.md` for the repo-local operating version of this checklist.

Every AI session in any D:\Github repo should:

1. **Read this repo's `AI-HANDOFF.md`** - find the latest entry, know the exact resume point
2. **Read `STATE.md`** - check for CRITICAL ALERTS and active blockers
3. **Read repo-local portfolio rules when they exist** - for example `FRAME-PORTFOLIO-docs/process/RULES.md`; understand priority without leaving the repo sandbox
4. **Check git status** - confirm clean tree before major work
5. **`code-review-graph update`** - incremental graph refresh (auto-runs in `watch-session-start.ps1`)
6. **If `resume-work.ps1` exists** - run it: `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\resume-work.ps1`

For multi-repo work inside opencode, stay on repo-local truth files unless the user explicitly approves external-directory reads.

---

## OpenHarness Standard Entry

See `docs/factory/OPENHARNESS.md` for the focused launcher and prompt guide.

Use OpenHarness as the default repo harness when you want agentic execution with the same portfolio rules:

```powershell
# From inside a repo
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1

# One-shot prompt
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -Prompt "What is the next validated slice that moves this repo toward launch or revenue?"

# Safe preview
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -DryRun -Prompt "Review the launch blockers in this repo"
```

The launcher runs `watch-session-start.ps1` first, then starts OpenHarness with GitHub Copilot, `gpt-5.4`, and `effort=max`. The repo-local `launch-revenue` skill gives OpenHarness the same backlog triage and next-earning-step discipline used by `0.dev-matrix`.

---

## Junie Optional Entry

See `docs/tools/JUNIE.md` for setup details, use cases, and repo-local policy.

Junie is supported in this dev-matrix as an **optional secondary terminal agent**. It is useful for second-opinion reviews, prompt-driven repo triage, and optional headless tasks, but it is not the default editing surface.

Standard entry:

```powershell
$env:JUNIE_ZAI_API_KEY = "<key>"
powershell -ExecutionPolicy Bypass -File C:\Users\Prakash\.junie\junie-zai.ps1 --project D:\Github\<repo>
```

One-shot entry:

```powershell
$env:JUNIE_ZAI_API_KEY = "<key>"
powershell -ExecutionPolicy Bypass -File C:\Users\Prakash\.junie\junie-zai.ps1 --project D:\Github\<repo> "Review the current changes and list the top risks"
```

Policy:

- root `AGENTS.md` remains the primary repo guidance source unless a repo explicitly needs `.junie/AGENTS.md`
- user-scope Junie MCP remains the default MCP layer for Junie on this machine
- repo-local `.junie/` is optional and should only be added when a repo genuinely needs Junie-specific shared behavior

## Kimi WebBridge Optional Entry

See `docs/tools/KIMI-WEBBRIDGE.md` for setup, health check, daemon usage, and per-repo rollout.

Kimi WebBridge is supported in this dev-matrix as an **optional browser-control layer** that lets AI agents drive the user's real Chrome or Edge through Chrome DevTools Protocol — including login sessions that cloud-based browser agents cannot see.

Standard entry:

```powershell
# Per-repo rollout (24 git repos x 3 agent runtimes)
powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\install-kimi-webbridge.ps1 -All

# Health check (must show extension_connected: true)
~/.kimi-webbridge/bin/kimi-webbridge status
```

Policy:
- WebBridge is for interactive browser work with login sessions; use Playwright/Webwright for headless testing
- Each repo can opt out by deleting its `.<agent>/skills/kimi-webbridge/` folder — re-run with `-Force` to restore
- The user-scope install (`~/.claude/skills/kimi-webbridge/`) is the source of truth; per-repo copies are read-only mirrors for repo-local AI awareness
- When pairing WebBridge with Webwright, prefer Webwright for replayable tests and WebBridge for one-off interactive runs

## Microsoft Webwright Optional Entry

See `docs/tools/WEBWRIGHT.md` for setup, backend configuration, trajectory dashboard, and Webwright vs Kimi WebBridge guidance.

Webwright is supported in this dev-matrix as an **optional web-testing layer** that gives the AI in any repo a terminal-native browser-agent framework: the LLM writes Playwright code, the script is the artifact, and re-runs are deterministic.

Standard entry:

```powershell
# Per-repo rollout (24 git repos x 3 agent runtimes)
powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\install-webwright.ps1 -All

# One-time runtime deps
pip install -e D:\Github\Webwright
playwright install chromium
```

Policy:
- Webwright is for replayable headless tests; use Kimi WebBridge for interactive real-browser flows
- The source of truth is `D:\Github\Webwright\skills\webwright`; per-repo copies are read-only mirrors. Re-run with `-Force` after pulling upstream
- API keys (OpenAI / Anthropic / OpenRouter) live in the env, not in the skill — never commit them
- Webwright's vendor install path is the Claude Code plugin marketplace (`/plugin install webwright@webwright`); the per-repo skill copy is a fallback for hosts that don't read marketplaces

## code-review-graph Daily Workflow

See `docs/tools/CODE-REVIEW-GRAPH.md` for the focused daily workflow and MCP usage pattern.

```powershell
# One-time: build graph for a repo (already done for all repos)
code-review-graph build --repo D:\Github\<repo>

# Daily: incremental update after coding (faster than full build, <2s)
# Auto-runs in watch-session-start.ps1 - also run manually after pulling changes:
code-review-graph update --repo D:\Github\<repo>

# In-session: keep graph live auto-updating on every file save
# Open a dedicated terminal and leave running:
code-review-graph watch --repo D:\Github\<repo>

# Check graph health
code-review-graph status --repo D:\Github\<repo>

# Interactive visualisation (blast-radius map in browser)
code-review-graph visualize --repo D:\Github\<repo>

# Risk-scored change analysis (use before PR / sprint review)
code-review-graph detect-changes --repo D:\Github\<repo>
```

Multi-repo rule for `D:\Github`: keep one global CRG server and always pass `repo_root`
explicitly on MCP tool calls. Do not rely on workspace auto-detection in this mono-workspace,
because the active chat session may not have the same cwd as the repo whose graph you want.

Preferred MCP pattern:
```text
code-review-graph_get_minimal_context_tool(task="...", repo_root="D:/Github/<repo>")
code-review-graph_query_graph_tool(query="...", repo_root="D:/Github/<repo>")
code-review-graph_detect_changes_tool(repo_root="D:/Github/<repo>")
```

Do not drop the `code-review-graph_` prefix or `_tool` suffix in repo-scoped opencode runs.

### Cursor / VS Code AI usage after graph is built
```
Review the changes I just made to <file>        -> context-precise review
What else is affected if I change <Module>?     -> blast-radius analysis
Do a full review of the changes in this PR      -> pre-merge check
```

### New repo bootstrap (register Roo bridge, then build)
```powershell
# 1. Refresh shared repo MCP defaults, .code-review-graphignore files,
#    delivery-intelligence hook files, and OpenHarness launchers/skills for all git repos under D:\Github
powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\update-mcp-configs.ps1

# 2. Or, inside one repo after copying 0.dev-matrix, install the delivery hook
#    plus the OpenHarness launcher/skill before git init or when onboarding a non-git workspace
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\install-delivery-intelligence-hook.ps1
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\install-openharness-project-template.ps1

# 3. Build graph once for the new repo
code-review-graph build --repo D:\Github\<new-repo>
```

See `0.dev-matrix/DELIVERY-INTELLIGENCE.md` for the central hub workflow.

---

## Roo Bridge Integration

See `docs/tools/ROO-INDEX-BRIDGE.md` for the focused MCP usage and health-check guide.

Direct Qdrant MCP is retired from the default WATCH retrieval path. Use `roo-code-index-bridge` for semantic discovery in every repo.

### Default MCP workflow
- `roo-code-index-health` once per repo when the workspace mapping is new or suspicious
- `roo-code-index-search` with `workspace_path="D:/Github/<repo>"` for implementation work
- `roo-code-index-resolve-collection` when collection mapping looks wrong
- use grep or regex only after Roo narrows the search surface

### Legacy note
Do not register `roo-index-bridge` alongside `roo-code-index-bridge` in Cursor config.
`qdrant_gap_audit.py` may still exist in some repos for older audit flows, but it is no longer the default MCP search layer.

---

## Vibe Coding Playbook

Use the four global MCP servers proactively - prefer MCP over brute-force grep when semantic or structural context helps.

| Step | MCP | Tool / action |
|------|-----|---------------|
| 1. Broad discovery | `roo-code-index-bridge` | `roo-code-index-bridge_roo-code-index-search(query, workspace_path="D:/Github/<repo>")` |
| 2. Structural impact | `code-review-graph` | `code-review-graph_get_minimal_context_tool` -> `code-review-graph_query_graph_tool` / `code-review-graph_get_impact_radius_tool`; `code-review-graph_build_or_update_graph_tool` if graph empty |
| 3. Architecture map | `graphify` | `graphify_query_graph(question=...)`, `graphify_graph_stats`, `graphify_get_community`, `graphify_god_nodes`, `graphify_shortest_path` |
| 4. Parallel work | `agent-delegator` | `delegate_task` / `batch_tasks` for isolated subtasks - not one-liners |
| 5. Confirm | grep/read | Only after MCP narrows the candidate set |

**Multi-repo rule**: always pass explicit `repo_root` or `workspace_path` - do not rely on workspace cwd alone.

**Controller + worker split**: lead agent plans/reviews/validates; `agent-delegator` workers implement bounded slices via opencode.

Use only the exact MCP tool names listed above. Do not invent shortened, legacy, or suffix-less variants.

---

## Close-Day Protocol (every session ending)

See `docs/process/END-DAY.md` for the repo-local close-day operating guide.

1. Run `npm run close-day` (or `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\close-day.ps1`)
2. Update `AI-HANDOFF.md` with: Changed, Verified, Operational proof, Continue from, Next step, Blockers
3. Verify `docs/business/LAUNCH_CHECKLIST.md` has current focus fields filled
4. Check `git status` is clean before stopping

---

## AutoBE Gate

Before implementing any new feature or endpoint:
```powershell
cd D:\Github\AutoBE
pnpm run playground
# -> http://localhost:5713
# Describe feature -> get spec + implementation
# Copy docs/openapi.json -> project's 0.dev-matrix/SPEC.json
```

---

## WATCH Status Check
```powershell
# Run from any repo or the root
powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\watch-session-start.ps1
```
