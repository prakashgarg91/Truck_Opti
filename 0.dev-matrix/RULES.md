# 📜 RULES — Universal Dev Standards
> **Applies to every repo in D:\Github without exception.**
> Per-repo docs/process/RULES.md adds stack-specific rules on top of this baseline.
> Security rules are in docs/process/SECURITY.md. Testing rules are in docs/process/TESTING_PRINCIPLES.md.

---

## 🔴 CRITICAL RULES

### 1. Build Must Be Clean Before Every Push
The CI gate is never optional. Run the project's validation command before pushing.
If no `launch-check` script exists, at minimum run lint + type-check + tests.
```
# Do NOT push if validation fails.
# "It works on my machine" is not a passing gate.
```

### 2. Never Mark a Task Done Without Testing the User Flow
Code that compiles is NOT done.
The button/endpoint/function must work end-to-end and produce the correct outcome.
See `docs/process/TESTING_PRINCIPLES.md` for the full mandatory checklist.

### 3. Register in STATE.md and Post a Summary Message
- Before starting: add yourself to `## 🤖 ACTIVE AGENTS` in the repo's STATE.md or TASK.md.
- After finishing: post to `## 📝 AGENT MESSAGES` (newest at top) with a summary.
- After a session: update `AI-HANDOFF.md` so the next session resumes from an exact checkpoint.

### 4. Security Checklist Before Any Code Generation
Run through `docs/process/SECURITY.md §CHECKLIST` before writing code that touches:
auth, DB access, payments, file uploads, HTTP redirects, env vars, or secrets.

### 5. No TODO Comments in Shipped Code
Either implement the feature fully, or add a visible toast placeholder — never leave `// TODO` in code that is pushed to main.

---

## 🟠 UNIVERSAL CODING RULES

### 6. Parameterized Queries — Never String-Concatenate SQL

```python
# ❌ WRONG — exploitable
query = f"SELECT * FROM users WHERE id = '{user_id}'"

# ✅ RIGHT — parameterized
db.execute("SELECT * FROM users WHERE id = ?", (user_id,))
```
```typescript
// ✅ RIGHT — ORM / Supabase client
const { data } = await supabase.from('users').select('*').eq('id', userId)
```

### 7. Config Access via Config Module — Never Hardcode Secrets
```python
# ✅ Python
from app.core.config import Config
config = Config()
api_key = config.service.api_key

# ✅ TypeScript / Node
import { env } from '../config/env'
const apiKey = env.SERVICE_API_KEY
```
```
# ❌ NEVER — in any file
API_KEY = "sk-prod-live-abc123"
```

### 8. Never Expose Raw DB / Provider Errors to Users
```typescript
// ❌ WRONG — may leak table/column names or stack traces
toast.error(error.message)

// ✅ RIGHT — log internally, show generic message
console.error('[context] DB error:', error)
toast.error('Something went wrong. Please try again.')
```

### 9. Subscriptions and Listeners Must Clean Up
```typescript
useEffect(() => {
  const channel = supabase.channel('name').on(...).subscribe()
  return () => { supabase.removeChannel(channel) }  // ← REQUIRED
}, [dep])
```
```python
# cleanup in __del__ or context manager
```

### 10. Don't Hardcode Business Constants in Logic
```typescript
// ❌ WRONG — bypasses the constant definition
const GST_RATE = 0.05
return amount * 0.18    // ← caused BUG-020 in Truck_Opti

// ✅ RIGHT
return amount * GST_RATE
```

---

## 🟡 STATE MANAGEMENT RULES

### 11. Use the Designated State Store — Not Scattered Local State
- Each project designates ONE state management pattern (Zustand, Redux, Pinia, context, etc.).
- Cross-component shared state ALWAYS goes through the store.
- API auth state is never held in `useState` within a component.

### 12. Functional Components: Prefer Derivation Over Sync
Derive values from state instead of syncing with `useEffect`. Use `useMemo`/`computed` for derived values.

---

## 🟢 GIT / PROCESS RULES

### 13. Git Push Order (for repos with multi-remote deploy)
```powershell
git push origin main    # FIRST — source of truth
git push heroku main    # SECOND — deploy (if applicable)
```

### 14. Knowledge Ledger: Graphify + code-review-graph Before Edit
Before any non-trivial task:

- use Graphify or the current `graphify-out/GRAPH_REPORT.md` to map the owning structure
- run `code-review-graph_get_minimal_context_tool(repo_root="D:/Github/<repo>", task="<what you're about to do>")`
- state a short context audit before editing: slice, likely files, dependencies, first failing check, proof command

This prevents wasted work caused by context rot, hidden module coupling, and blast-radius surprises.

### 15. Roo Bridge Semantic Search Before grep
When looking for code by intent or behaviour, use the Roo bridge MCP tools first.
Start with `roo-code-index-search`; use `roo-code-index-resolve-collection` when workspace mapping needs confirmation.
Reserve grep/file_search for exact string matching after Roo has narrowed the candidates.

### 16. Junie Stays User-Scope By Default
If Junie is used in a repo, prefer the hardened user-scope wrapper and config on this machine:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Prakash\.junie\junie-zai.ps1 --project D:\Github\<repo>
```

Do not create or commit repo-local `.junie/` just because Junie offers to import AGENTS, MCP, or skills on first run. Only add repo-local `.junie/` when the repo truly needs Junie-specific shared behavior that cannot be handled by root `AGENTS.md`, existing repo docs, or user-scope Junie MCP.

### 17. Open-Source And Shared Capability First
Before building new cross-repo infrastructure from scratch, AI and humans must check for an existing solution in this order:

1. the current repo
2. `D:\Github\Office_Scripts\Shared-scripts`
3. other repos already owned in `D:\Github`
4. vendor SDKs, official APIs, and maintained open-source projects online

This rule applies especially to website monitoring, RSS/feed ingestion, dedupe, scraping, scheduler/webhook plumbing, auth wrappers, OCR helpers, and LLM-routing code.

If an available solution covers the need well enough, reuse, wrap, or adapt it instead of rebuilding it. Build custom code only for domain-specific gaps, thin adapters, or missing contract glue.

Keep product repos separate. Share capabilities through a stable shared folder, package, or service instead of copying business logic between repos.

---

## 📎 SEE ALSO

| File | Purpose |
|------|---------|
| `docs/process/SECURITY.md` | Security safeguards & pre-commit checks |
| `docs/process/TESTING_PRINCIPLES.md` | Mandatory DoD checklist for every feature |
| `docs/process/QUALITY-BASELINE.md` | Definition of Done + evidence requirements |
| `docs/tools/CONTEXT-ENGINEERING.md` | How to keep AI context accurate and efficient |
| `docs/process/PATTERNS.md` | Approved implementation patterns |
| `docs/process/TREE-HYGIENE.md` | Repo cleanliness standard |
| `docs/tools/JUNIE.md` | Junie role, use cases, setup, and repo-local `.junie` policy |
