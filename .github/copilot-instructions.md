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
## Roo Bridge MCP
Use the workspace MCP server `roo-index-bridge` as the default semantic retrieval surface before falling back to grep or regex.

- `search_roo_index`: primary code-first semantic search for this repo and sibling repos under `D:\Github`
- `detect_roo_index_collection`: verify workspace mapping when results look suspicious or the repo is newly onboarded
- `list_roo_index_collections`: backend sanity check only

Preferred retrieval stack for code work:

1. Roo bridge targeted search
2. Graphify structure map
3. code-review-graph exact blast radius
4. grep or regex for exact confirmation and registry cleanup

Validation:
```powershell
node D:\Github\tools\roo-index-smoke.mjs --workspace D:\Github\Truck_Opti
node D:\Github\tools\roo-index-sync-mcp.mjs --all --apply
```

> Docs-mode can still rely partly on the shared local markdown fallback when vector recall misses the best chunk, so confirm hits against real files before editing.

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
