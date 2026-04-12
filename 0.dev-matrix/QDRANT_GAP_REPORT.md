# Qdrant Gap & Mismatch Audit  v3
Generated  : 2026-04-12 12:11
Workspace  : `D:\Github\Truck_Opti`
Collection : `ws-6df6af38d373c83b` (http://localhost:6335)
Embedding  : `nomic-embed-text-v2-moe` (http://localhost:11434)
Checks run : 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34
Source path: `frontend/src` -- 88 files indexed

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

## Check 6: Bilingual / i18n Gaps
- OK No issues found.

## Check 7: TypeScript any Overuse
- OK No issues found.

## Check 8: console.log in Production
- OK No issues found.

## Check 9: Orphan Pages Not in Router
- OK No issues found.

## Check 10: Unused Zustand / Pinia Stores
- OK No issues found.

## Check 11: Migrations Missing RLS
- OK No issues found.

## Check 12: Banned USING(true) RLS Policies
- OK No issues found.

## Check 13: select(*) Over-fetching
- OK No issues found.

## Check 14: N+1 Query Pattern
- OK No issues found.

## Check 15: Missing Pagination on Queries
- OK No issues found.

## Check 16: useEffect Without AbortController
- OK No issues found.

## Check 17: Event Listener Without Cleanup
- OK No issues found.

## Check 18: Magic Numbers
- OK No issues found.

## Check 21: Hardcoded Secrets / Credentials
- OK No issues found.

## Check 22: TODO / FIXME / Stub Code
- OK No issues found.

## Check 23: Direct DOM Mutation
- OK No issues found.

## Check 24: Unvalidated Form Submit
- OK No issues found.

## Check 25: Polling Anti-Pattern
- OK No issues found.

## Check 26: Large Commented-Out Dead Code
- OK No issues found.

## Check 27: Missing RBAC Before Write
- OK No issues found.

## Check 28: Unhandled / Fire-and-Forget Promise
- OK No issues found.

## Check 29: Input Sanitization Missing
- OK No issues found.

## Check 30: Timezone-Naive Date Operations
- OK No issues found.

## Check 31: No Retry on Critical Operations
- OK No issues found.

## Check 32: Missing Accessibility Attributes
- OK No issues found.

## Check 33: Prop Drilling Antipattern
- OK No issues found.

---
Next steps:
- Fix all [CRIT] issues before launch
- Create TASK.md entries for [WARN] findings
- Review [INFO] advisories in next sprint
- Re-run: python D:/Github/tools/qdrant_gap_audit.py
