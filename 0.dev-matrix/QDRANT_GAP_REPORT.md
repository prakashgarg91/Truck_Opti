# Qdrant Gap & Mismatch Audit  v3
Generated  : 2026-04-28 08:32
Workspace  : `D:\Github\Truck_Opti`
Collection : `truck-opti-verify-packing-context` (http://localhost:6333)
Embedding  : `nomic-embed-text-v2-moe` (http://localhost:11434)
Checks run : 1, 2, 3, 4, 5, 11, 12, 14, 21, 22, 27, 28, 29, 31
Source path: `frontend/src` -- 0 files indexed

C1-C18   Structural: Qdrant semantic search finds candidates -> regex confirms.
C21-C26  Classic semantic: pure Qdrant vector similarity.
C27-C33  New v3: RBAC, promise safety, sanitization, timezone, retry, a11y, prop drilling.

**Workspace:** `Truck_Opti`
**Issues:** CRIT=0  WARN=0  INFO=0  = **0 total**

## Check 1: Auth Pattern Mismatch
- OK No issues found.

## Check 2: Raw error.message Leaked to User
- OK No issues found.

## Check 3: DB Calls Without Error Guard
- OK No issues found.

## Check 4: Data Fetch Without Loading State
- OK No issues found.

## Check 5: Supabase Page No Error Fallback UI
- OK No issues found.

## Check 11: Migrations Missing RLS
- OK No issues found.

## Check 12: Banned USING(true) RLS Policies
- OK No issues found.

## Check 14: N+1 Query Pattern
- OK No issues found.

## Check 21: Hardcoded Secrets / Credentials
- OK No issues found.

## Check 22: TODO / FIXME / Stub Code
- OK No issues found.

## Check 27: Missing RBAC Before Write
- OK No issues found.

## Check 28: Unhandled / Fire-and-Forget Promise
- OK No issues found.

## Check 29: Input Sanitization Missing
- OK No issues found.

## Check 31: No Retry on Critical Operations
- OK No issues found.

---
Next steps:
- Fix all [CRIT] issues before launch
- Create TASK.md entries for [WARN] findings
- Review [INFO] advisories in next sprint
- Re-run: python D:/Github/tools/qdrant_gap_audit.py
