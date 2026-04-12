---
description: Qdrant semantic search and gap audit for Truck_Opti (collection: truck-opti-context)
mode: agent
---
# Qdrant Tool — Truck_Opti

**Collection**: `truck-opti-context` | **Priority**: P0 LAUNCH | **Stack**: React/Supabase/Node
**Script**: `D:\Github\tools\qdrant_gap_audit.py` | **Qdrant**: `http://localhost:6333`

---

## How to use this prompt

Type `/qdrant` followed by your task:
- `/qdrant search payment webhook handler`
- `/qdrant gap audit`
- `/qdrant check auth and RLS security`
- `/qdrant index`

The AI runs the correct command for this repo's index and interprets results.

---

## Commands

### Semantic Search — find code by intent (not exact string)
```powershell
cd D:\Github\Truck_Opti
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py -q "YOUR QUERY" --context-lines 3

# Filter by file extension
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py -q "auth session validation" --lang ts,tsx,py

# Broader results (lower threshold, default is 0.45)
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py -q "retry logic" --score-min 0.35 --top 20

# Search all files (not just src/ subpath)
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py -q "database migration" --all-files
```

### Index this repo (run once, or after major refactor)
```powershell
cd D:\Github\Truck_Opti
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py --auto-index
```

### Full 33-check Gap Audit (run before every deploy)
```powershell
cd D:\Github\Truck_Opti
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py
# Report written to: 0.dev-matrix/QDRANT_GAP_REPORT.md
```

### Critical security checks only (fast pre-commit check)
```powershell
.\.venv\Scripts\python D:\Github\tools\qdrant_gap_audit.py --checks 1,11,12,14,21,27
```

### Search a different repo from here
```powershell
python D:\Github\tools\qdrant_gap_audit.py --workspace D:\Github\OTHER_REPO --src-subpath src -q "your query"
```

---

## Score Guide
| Score | Meaning |
|-------|---------|
| 0.6+ | Strong match — high confidence |
| 0.45–0.6 | Relevant — review suggested |
| < 0.45 | Filtered out by default |

---

## Critical Checks Reference
| Code | Check | Severity | What it finds |
|------|-------|----------|---------------|
| C1 | Auth pattern mismatch | CRIT | getUser vs getSession misuse |
| C11 | Missing RLS on table | CRIT | CREATE TABLE without RLS |
| C12 | Permissive USING(true) policy | CRIT | Open RLS policies |
| C14 | N+1 query pattern | CRIT | Fetch/DB call inside .map() loop |
| C21 | Hardcoded secrets | CRIT | API keys, passwords in source |
| C27 | Unguarded DB write | CRIT | Write endpoint with no auth check |
| C2 | Raw error.message to user | HIGH | Internal errors leaking to UI |
| C3 | DB call without error guard | WARN | Missing try/catch around .from() |
| C7 | TypeScript `any` overuse | INFO | `: any` / `as any` patterns |
| C8 | console.log in production | INFO | Debug logs not removed |
| C9 | Orphan pages | INFO | Pages not in router |
| C13 | select(*) over-fetching | INFO | Wildcard DB selects |
| C16 | useEffect without AbortController | INFO | Async fetch with no cleanup |

---

## Qdrant vs grep — Pick the right tool
| Use Qdrant `-q` | Use grep / ripgrep |
|-----------------|-------------------|
| "where is auth handled?" | exact: find `useAuthStore` |
| "all DB write operations" | exact string: `ENABLE ROW LEVEL SECURITY` |
| "find retry or error recovery logic" | known function: `handleRetry` |
| Concept/behaviour search | Symbol/pattern search |
