# 📜 RULES — Universal Dev Standards
> **Applies to every repo in D:\Github without exception.**
> Per-repo RULES.md adds stack-specific rules on top of this baseline.
> Security rules are in SECURITY.md. Testing rules are in TESTING_PRINCIPLES.md.

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
See `TESTING_PRINCIPLES.md` for the full mandatory checklist.

### 3. Register in STATE.md and Post a Summary Message
- Before starting: add yourself to `## 🤖 ACTIVE AGENTS` in the repo's STATE.md or TASK.md.
- After finishing: post to `## 📝 AGENT MESSAGES` (newest at top) with a summary.
- After a session: update `AI-HANDOFF.md` so the next session resumes from an exact checkpoint.

### 4. Security Checklist Before Any Code Generation
Run through `SECURITY.md §CHECKLIST` before writing code that touches:
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

### 14. Code-Review-Graph: Check Before Edit
Before any non-trivial task, run:
```
get_minimal_context(task="<what you're about to do>")
```
This costs ~100 tokens and prevents wasted work on call graph / blast radius surprises.

### 15. Roo Bridge Semantic Search Before grep
When looking for code by intent or behaviour, use the Roo bridge MCP tools first.
Start with `search_roo_index`; use `detect_roo_index_collection` when workspace mapping needs confirmation.
Reserve grep/file_search for exact string matching after Roo has narrowed the candidates.

### 16. Junie Stays User-Scope By Default
If Junie is used in a repo, prefer the hardened user-scope wrapper and config on this machine:

```powershell
powershell -ExecutionPolicy Bypass -File C:\Users\Prakash\.junie\junie-zai.ps1 --project D:\Github\<repo>
```

Do not create or commit repo-local `.junie/` just because Junie offers to import AGENTS, MCP, or skills on first run. Only add repo-local `.junie/` when the repo truly needs Junie-specific shared behavior that cannot be handled by root `AGENTS.md`, existing repo docs, or user-scope Junie MCP.

---

## 📎 SEE ALSO

| File | Purpose |
|------|---------|
| `SECURITY.md` | Security safeguards & pre-commit checks |
| `TESTING_PRINCIPLES.md` | Mandatory DoD checklist for every feature |
| `QUALITY-BASELINE.md` | Definition of Done + evidence requirements |
| `CONTEXT-ENGINEERING.md` | How to keep AI context accurate and efficient |
| `PATTERNS.md` | Approved implementation patterns |
| `TREE-HYGIENE.md` | Repo cleanliness standard |
| `JUNIE.md` | Junie role, use cases, setup, and repo-local `.junie` policy |
