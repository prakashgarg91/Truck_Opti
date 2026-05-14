# WATCH — Live Operational Intelligence Layer
> **Version**: 1.0 | **Integrated**: 2026-04-12
> **Purpose**: The glue that makes 0.dev-matrix a living system, not just documentation.
> **Scope**: All repos in D:\Github, unified under one operational intelligence framework.

---

## What WATCH Does

WATCH is the **always-on meta-operating layer** for the 0.dev-matrix development system.
It binds every repo's VS Code session to the sprint state, Roo bridge retrieval, and close-day discipline automatically.

## Runtime Error Loop

Truck_Opti now exposes a repo-root runtime loop entrypoint:

```powershell
powershell -ExecutionPolicy Bypass -File .\runtime-error-loop.ps1 -Mode latest
```

Current repo-detected paths are `npm run start` for capture and `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\launch-check.ps1` for resolve. Use `latest` before runtime debugging so the next slice starts from the repo's real capture/resolve paths instead of assumptions.
Current repo-detected paths are now `npm run track-errors` for capture and `npm run test:hidden-errors` for resolve. `npm run dev` and `npm test` also exist as lighter root wrappers over the frontend dev and unit-test lanes.

| Layer | Mechanism | What it provides |
|-------|-----------|-----------------|
| **Session Context** | `copilot-instructions.md` per repo | AI auto-loads repo state at every chat start |
| **Semantic Retrieval** | `roo-code-index-bridge` MCP server from `D:\Github\roo-code-index-bridge-mcp` | Code-first semantic search and docs retrieval across repos |
| **Architecture Retrieval** | `graphify` MCP wrapper from `D:\Github\tools\graphify-opencode-mcp.ps1` | Graph-backed architecture/context retrieval using each repo graph when present |
| **AST Graph** | `code-review-graph` MCP server, per repo | Call graph, impact radius, blast-radius analysis, 22 MCP tools |
| **Lifecycle Hooks** | `.github/hooks/watch-session.json` | Session start injects sprint + handoff context |
| **Delivery Intelligence** | `.github/hooks/delivery-intelligence.json` | Session-start/stop reminders tied to the cross-repo delivery hub |
| **OpenHarness Entry** | `0.dev-matrix/openharness.ps1` + `.openharness/skills/launch-revenue/SKILL.md` | Repo-local OpenHarness launcher with Copilot auth, `gpt-5.4`, `effort=max`, and earning-focused execution rules |
| **Optional Terminal Agent** | User-scope `C:\Users\Prakash\.junie\junie-zai.ps1` + `~/.junie/mcp/mcp.json` | Hardened Junie entry using `glm-5.1` for second-opinion reviews, terminal summaries, and optional headless tasks |
| **Close-Day Gate** | `0.dev-matrix/CLOSING-DAY-HOOK.md` | Enforces handoff discipline before each stop |
| **Sprint Truth** | `SPRINT-APRIL-2026.md` + this STATE.md | Single source of what is active, blocked, done |
| **Bridge Validation** | `tools/roo-index-smoke.mjs` | Verifies local MCP registration, collection detection, and search routing |

---

## Architecture

```
D:\Github\
├── .github\
│   ├── copilot-instructions.md      ← Global Watch instructions (every session)
│   └── hooks\
│       ├── watch-session.json       ← SessionStart hook → injects sprint context
│       └── delivery-intelligence.json ← SessionStart + Stop hooks → delivery capture loop
│
├── .vscode\
│   └── mcp.json                     ← Root-level Roo bridge + Graphify + CRG MCP
│
├── 0.dev-matrix\
│   ├── WATCH.md                     ← (this file) System definition
│   ├── START-DAY.md                 ← Canonical repo start-day workflow
│   ├── END-DAY.md                   ← Canonical repo end-day workflow
│   ├── ROO-INDEX-BRIDGE.md          ← Semantic code search usage guide
│   ├── CODE-REVIEW-GRAPH.md         ← Impact-analysis usage guide
│   ├── GRAPHIFY.md                  ← Structural graph usage guide
│   ├── OPENHARNESS.md               ← Repo-local OpenHarness usage guide
│   ├── JUNIE.md                     ← Optional Junie usage guide
│   ├── run-openharness.ps1          ← Shared OpenHarness launcher (Copilot + GPT-5.4 + max effort)
│   ├── install-openharness-project-template.ps1 ← Rolls repo-local OpenHarness launcher + skill
│   ├── update-mcp-configs.ps1       ← Rolls canonical Roo + Graphify + CRG MCP defaults
│   ├── STATE.md                     ← Sprint state: what is active/blocked/done
│   ├── AI-HANDOFF.md                ← Sprint-level handoff for cross-session continuity
│   ├── TASK.md                      ← Active sprint tasks across all repos
│   ├── DISCUSSION.md                ← Sprint decisions log
│   ├── LAUNCH_CHECKLIST.md          ← Cross-repo launch focus
│   ├── CLOSING-DAY-HOOK.md          ← Meta close-day instructions
│   ├── watch-session-start.ps1      ← Script run at session start (surfaces context)
│   ├── install-delivery-intelligence-hook.ps1 ← Repo-local bridge installer
│   ├── DELIVERY-INTELLIGENCE.md     ← Hub integration and usage guide
│   ├── AUTOBE-AGENT-PROMPT.md       ← AutoBE integration prompt
│   └── SPRINT-APRIL-2026.md         ← April 2026 sprint plan
│
├── [repo]\
│   ├── .github\
│   │   ├── copilot-instructions.md  ← Per-repo Watch context (auto-loaded)
│   │   ├── agents\
│   │   │   └── system-reconciler.agent.md
│   │   └── hooks\
│   │       ├── watch-session.json   ← Per-repo session hook
│   │       └── delivery-intelligence.json ← Bridge to central delivery hub
│   ├── .openharness\
│   │   └── skills\
│   │       └── launch-revenue\
│   │           └── SKILL.md         ← Repo-local earning/launch skill for OpenHarness
│   ├── .vscode\
│   │   ├── mcp.json                 ← Roo bridge + Graphify + CRG + repo-specific MCP (auto-configured)
│   │   └── settings.json            ← Standardized Watch settings
│   ├── .code-review-graphignore     ← Excludes build artifacts from AST graph
│   └── 0.dev-matrix\
│       ├── STATE.md                 ← Repo state
│       ├── AI-HANDOFF.md            ← Repo handoff
│       ├── openharness.ps1          ← Repo-local OpenHarness entrypoint
│       └── CLOSING-DAY-HOOK.md      ← Repo close-day trigger
```

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

## Shared Asset Intake

For repo-operations reuse, audit `D:\Github\Office_Scripts\Shared-scripts\` as an optional secondary source, not as the canonical automation root.

Current audit snapshot (`2026-05-14`):

- `openrouter-free-model-fallbacks.ts` is executable code and can help AI runtime model selection, but it belongs to product/provider fallback logic rather than 0.dev-matrix operations.
- `Skills/canva-professional-book-editing/` is guidance-only and design-specific.
- `Skills/chatgpt-nano-banana-image-generation/` is guidance-only and asset-pipeline-specific.

Operational rule:

- Prefer shared repo-operations helpers from `D:\Github\0.dev-matrix\` first.
- Treat `Shared-scripts` skills as guidance only unless they directly automate handoff, close-day, resume/start-day, validation, guardrails, or repo-status work.
- Treat shared AI/model-selection utilities such as `openrouter-free-model-fallbacks.ts` as product-runtime helpers, not governance helpers.
- Do not copy non-operational helpers into repo governance just because they are shared.
- Re-audit `Shared-scripts` only when new repo-operations assets land there.

This keeps repo governance aligned to the actual shared automation root while still leaving a clear intake path for future reusable automation.

## Session Start Protocol

See `START-DAY.md` for the repo-local operating version of this checklist.

Every AI session in any D:\Github repo should:

1. **Read this repo's `AI-HANDOFF.md`** — find the latest entry, know the exact resume point
2. **Read `STATE.md`** — check for CRITICAL ALERTS and active blockers
3. **Read `SPRINT-APRIL-2026.md`** (if not done in this session) — understand sprint priority
4. **Check git status** — confirm clean tree before major work
5. **`code-review-graph update`** — incremental graph refresh (auto-runs in `watch-session-start.ps1`)
6. **If `resume-work.ps1` exists** — run it: `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\resume-work.ps1`

For multi-repo work: read `D:\Github\0.dev-matrix\AI-HANDOFF.md` instead.

---

## OpenHarness Standard Entry

See `OPENHARNESS.md` for the focused launcher and prompt guide.

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

See `JUNIE.md` for setup details, use cases, and repo-local policy.

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

## code-review-graph Daily Workflow

See `CODE-REVIEW-GRAPH.md` for the focused daily workflow and MCP usage pattern.

```powershell
# One-time: build graph for a repo (already done for all repos)
code-review-graph build --repo D:\Github\<repo>

# Daily: incremental update after coding (faster than full build, <2s)
# Auto-runs in watch-session-start.ps1 — also run manually after pulling changes:
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
get_minimal_context_tool(task="...", repo_root="D:/Github/<repo>")
query_graph_tool(..., repo_root="D:/Github/<repo>")
detect_changes_tool(..., repo_root="D:/Github/<repo>")
```

### Cursor / VS Code AI usage after graph is built
```
Review the changes I just made to <file>        → context-precise review
What else is affected if I change <Module>?     → blast-radius analysis
Do a full review of the changes in this PR      → pre-merge check
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

See `D:\Github\0.dev-matrix\DELIVERY-INTELLIGENCE.md` for the central hub workflow.

---

## Roo Bridge Integration

See `ROO-INDEX-BRIDGE.md` for the focused MCP usage and health-check guide.

Direct Qdrant MCP is retired from the default WATCH retrieval path. Use `roo-code-index-bridge` for semantic discovery in every repo.

### Default MCP workflow
- `detect_roo_index_collection` once per repo when the workspace mapping is new or suspicious
- `search_roo_index` with `workspace="D:/Github/<repo>"` and `scope="code"` for implementation work
- `search_roo_index` with `scope="docs"` for handoffs, runbooks, and markdown
- use grep or regex only after Roo narrows the search surface

### Validation
```powershell
node D:\Github\tools\roo-index-smoke.mjs --workspace D:\Github\<repo>
node D:\Github\tools\roo-index-sync-mcp.mjs --all --apply
```

### Legacy note
`qdrant_gap_audit.py` may still exist in some repos for older audit flows, but it is no longer the default MCP search layer and should not be treated as the primary retrieval path.

---

## Close-Day Protocol (every session ending)

See `END-DAY.md` for the repo-local close-day operating guide.

1. Run `npm run close-day` (or `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\close-day.ps1`)
2. Update `AI-HANDOFF.md` with: Changed, Verified, Operational proof, Continue from, Next step, Blockers
3. Verify `LAUNCH_CHECKLIST.md` has current focus fields filled
4. Check `git status` is clean before stopping

---

## AutoBE Gate

Before implementing any new feature or endpoint:
```powershell
cd D:\Github\AutoBE
pnpm run playground
# → http://localhost:5713
# Describe feature → get spec + implementation
# Copy docs/openapi.json → project's 0.dev-matrix/SPEC.json
```

---

## WATCH Status Check
```powershell
# Run from any repo or the root
powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\watch-session-start.ps1
```
