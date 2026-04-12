# Truck_Opti — Watch Context

**Repo**: `Truck_Opti` | **Priority**: P0 LAUNCH | **Collection**: `truck-opti-context`
**Stack**: React + Vite + Supabase + Node.js + Razorpay | **Validation**: `npm run launch-check` (17/17 target)

## Session Start

1. Read `0.dev-matrix/AI-HANDOFF.md` (latest entry) — resume from `Continue from:` exactly
2. Read `0.dev-matrix/STATE.md` — check critical alerts before touching code
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

# Qdrant gap audit (run before deploy)
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py
```

## Architecture

- `frontend/` — React + Vite + Zustand + React Query + Supabase
- `backend/` — Node.js API (check for auth on every write endpoint)
- `apps/web/` — alternate entrypoint
- Supabase project: `jbxncejtcbpcronndqlx`
- MCP available: qdrant (truck-opti-context), supabase, razorpay

## Security Non-Negotiables

- All Supabase tables must have RLS enabled (C11/C12 in gap audit)
- Razorpay: production keys only — never test keys in Heroku env vars
- Auth: use `supabase.auth.getUser()` server-side (never `getSession()` alone)
- Input validation: all form values trimmed/validated before DB insert

## Qdrant Search

**Collection**: `truck-opti-context` | Use `/qdrant` prompt for full reference.

```powershell
# Semantic search (intent-based — better than grep for concepts)
cd D:\Github\Truck_Opti
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py -q "YOUR QUERY" --context-lines 3

# Index this repo (required before first search)
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py --auto-index

# Full 33-check gap audit (run before deploy)
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py
# → writes 0.dev-matrix/QDRANT_GAP_REPORT.md

# Critical security checks only (C1 auth, C11/C12 RLS, C14 N+1, C21 secrets, C27 unguarded write)
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py --checks 1,11,12,14,21,27
```

> Use `/qdrant` in chat for the complete guide with score interpretation and check catalog.

## Close-Day

```powershell
npm run close-day
# Update 0.dev-matrix/AI-HANDOFF.md with: Changed, Verified, Operational proof, Continue from, Next step, Blockers
```

## code-review-graph (AST Graph — active MCP server)

Graph is pre-built at .code-review-graph/graph.db. Query it BEFORE reading files.

| Step | Tool / Command |
|------|----------------|
| 1. Get context | get_minimal_context(task="<description>") — start every task here |
| 2. Look up symbol | query_graph with specific target |
| 3. Blast radius | get_call_graph before changing any function/class |
| 4. Review PR | eview_changes — full diff with impact context |
| 5. Risk check | detect_changes — scored risk before merging |

**Daily CLI** (auto-runs at session start):
```powershell
code-review-graph update          # incremental refresh (<2s)
code-review-graph watch           # live auto-update in background
code-review-graph detect-changes  # risk analysis before PR
```
