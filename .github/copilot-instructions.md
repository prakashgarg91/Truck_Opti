# Truck_Opti Ã¢â‚¬â€ Watch Context

**Repo**: `Truck_Opti` | **Priority**: P0 LAUNCH | **Collection**: `truck-opti-context`
**Stack**: React + Vite + Supabase + Node.js + Razorpay | **Validation**: `npm run launch-check` (17/17 target)

## Session Start

1. Read `0.dev-matrix/AI-HANDOFF.md` (latest entry) Ã¢â‚¬â€ resume from `Continue from:` exactly
2. Read `0.dev-matrix/STATE.md` Ã¢â‚¬â€ check critical alerts before touching code
3. Run: `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\resume-work.ps1`

## Sprint Tasks (April 2026)

| ID | Task | Type | Blocker |
|----|------|------|---------|
| T-116 | Add VITE_SENTRY_DSN to Heroku env vars | Deploy | Human |
| T-127 | Authenticated E2E browser flow | Test | Unblocked after T-111 (human) |
| T-130 | Live returning-user stale SW retest | Test | AI ready |
| T-131 | Review 2 Dependabot alerts manually | Security | Human |

**Human blockers** (do these first): T-110 Razorpay prod keys, T-111 Google OAuth smoke test, T-113 Twilio SMS, T-115 Supabase PITR, T-117 `supabase db push`

## Validation Commands

```powershell
# Frontend build + smoke
cd .\frontend ; npm run build ; npm run test:frontend-smoke

# Full launch check
npm run launch-check  # must pass 17/17

# Roo bridge health check
node D:\Github\tools\roo-index-smoke.mjs --workspace D:\Github\Truck_Opti
```

## Architecture

- `frontend/` Ã¢â‚¬â€ React + Vite + Zustand + React Query + Supabase
- `backend/` Ã¢â‚¬â€ Node.js API (check for auth on every write endpoint)
- `apps/web/` Ã¢â‚¬â€ alternate entrypoint
- Supabase project: `jbxncejtcbpcronndqlx`
- MCP available: roo-index-bridge, supabase, razorpay

## Security Non-Negotiables

- All Supabase tables must have RLS enabled (C11/C12 in gap audit)
- Razorpay: production keys only Ã¢â‚¬â€ never test keys in Heroku env vars
- Auth: use `supabase.auth.getUser()` server-side (never `getSession()` alone)
- Input validation: all form values trimmed/validated before DB insert

\
## Roo Code Index Bridge MCP
Use the global MCP server `roo-code-index-bridge` as the default semantic retrieval surface before falling back to grep or regex.
Do not register legacy `roo-index-bridge` alongside it.

Before planning or coding in this repo, read `0.dev-matrix/INDEX.md` and the newest `0.dev-matrix/AI-HANDOFF.md`.

- `roo-code-index-search`: primary semantic search - pass `workspace_path="D:/Github/Truck_Opti"`
- `roo-code-index-resolve-collection`: verify workspace mapping when results look suspicious
- `roo-code-index-health`: check index health on unfamiliar repos

Preferred retrieval stack for code work:

1. `roo-code-index-bridge_roo-code-index-search` for broad discovery
2. Graphify `graphify_query_graph`, `graphify_graph_stats`, `graphify_get_community`, `graphify_god_nodes`, or `graphify_shortest_path` for structural orientation
3. code-review-graph `code-review-graph_get_minimal_context_tool`, `code-review-graph_get_impact_radius_tool`, `code-review-graph_get_affected_flows_tool`, or `code-review-graph_query_graph_tool` (always pass `repo_root`)
4. grep or regex for exact confirmation

Use only the exact MCP tool names listed above, including the required prefixes and suffixes.

### Knowledge Ledger Gate
Before non-trivial edits:

1. use Graphify or `graphify-out/GRAPH_REPORT.md` to map the owning structure
2. use code-review-graph to assess blast radius and impacted flows
3. return a short `CONTEXT AUDIT` before implementation with:
    - `Slice:`
    - `Files:`
    - `Dependencies:`
    - `Test first:`
    - `Proof:`

### Test-First Gate
For behavior changes, bug fixes, or refactors that change behavior:

1. write or update the narrow automated test first
2. run it and confirm it fails for the expected reason
3. implement the minimum change required
4. rerun the same test until it passes
5. only then widen to the next narrow validation

For parallel isolated subtasks, use `agent-delegator` (`delegate_task` / `batch_tasks`) - not one-liners.

Validation:
```powershell
node D:\Github\tools\roo-index-smoke.mjs --workspace D:\Github\Truck_Opti
node D:\Github\tools\roo-index-sync-mcp.mjs --all --apply
```

## Close-Day

```powershell
npm run close-day
# Update 0.dev-matrix/AI-HANDOFF.md with: Changed, Verified, Operational proof, Continue from, Next step, Blockers
```

## code-review-graph (AST Graph - active MCP server)

Graph is pre-built at .code-review-graph/graph.db. Query it BEFORE reading files.

| Step | Tool / Command |
|------|----------------|
| 1. Get context | `get_minimal_context(task="<description>")` - start every task here |
| 2. Look up symbol | `query_graph` with specific target |
| 3. Blast radius | `get_call_graph` before changing any function/class |
| 4. Review PR | `review_changes` - full diff with impact context |
| 5. Risk check | `detect_changes` - scored risk before merging |

**Daily CLI** (auto-runs at session start):
```powershell
code-review-graph update          # incremental refresh (<2s)
code-review-graph watch           # live auto-update in background
code-review-graph detect-changes  # risk analysis before PR
```

## graphify

Before answering architecture or codebase questions, read `graphify-out/GRAPH_REPORT.md` if it exists.
If `graphify-out/wiki/index.md` exists, navigate it for deep questions.
Type `/graphify` in Copilot Chat to build or update the knowledge graph.
