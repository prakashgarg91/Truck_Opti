# 📜 RULES — TruckOpti

> **TruckOpti-specific coding rules and anti-patterns.**
> Read once before starting any task. Security rules are in SECURITY.md.

---

## 🔴 CRITICAL RULES

### 1. Build Must Be Clean Before Every Push
```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build
# Must show 0 TypeScript errors
# Do NOT push if build fails
```

### 1b. Launch-Readiness Gate Check (recommended before every push)
```powershell
# From repo root — checks all 7 gates at once:
.\scripts\launch-readiness.ps1
# Or via npm:
npm run launch-check
```
Gates: frontend build, root npm audit, frontend npm audit, apps/web npm audit, pip-audit, python compileall, git cleanliness. All must pass before pushing.

### 2. Git Push Order
```powershell
git push origin main    ← FIRST (GitHub)
git push heroku main    ← SECOND (Heroku deploy)
```

### 3. Never Mark a Task Done Without Testing the User Flow
See `TESTING_PRINCIPLES.md`. Code that compiles is NOT done. The button must work.

### 4. Register in STATE.md and Post a Summary Message
Before starting: add yourself to `## 🤖 ACTIVE AGENTS`.
After finishing: post to `## 📝 AGENT MESSAGES` (newest at top).

### 5. Security Checklist Before Any Code Generation
Run through `SECURITY.md §6` (15-item checklist). Known violations: `SECURITY.md §2`.

---

## 🟠 TECH STACK RULES

### 6. State Management — Zustand Only
```typescript
// ❌ WRONG — local state for auth
const [user, setUser] = useState(null)

// ✅ RIGHT — use authStore
import { useAuthStore } from '../store/authStore'
const { user, agencyId, driverId } = useAuthStore()
```

### 7. Database Access — Supabase Client Only
```typescript
// All DB access goes through the shared client:
import { supabase } from '../lib/supabase'

// NEVER create a second client in a component
// NEVER use supabaseAdmin in frontend code
```

### 8. Error Handling — Never Expose Raw DB Errors
```typescript
// ❌ WRONG — raw Supabase error to user
toast.error(error.message)  // may leak table/column names

// ✅ RIGHT — log internally, show generic message
console.error('[context]', error)
toast.error('Something went wrong. Please try again.')
```

### 9. Realtime Subscriptions Must Clean Up
```typescript
useEffect(() => {
  const channel = supabase.channel('name').on(...).subscribe()
  return () => { supabase.removeChannel(channel) }  // ← REQUIRED
}, [dependency])
```

### 10. No TODO Comments in Shipped Code
```typescript
// ❌ WRONG — placeholder left in
async handleWithdrawal() { /* TODO: implement */ }

// ✅ RIGHT — toast placeholder OR full implementation
async handleWithdrawal() { toast('Withdrawal coming soon') }
```

---

## 🟡 REACT / UI RULES

### 11. Every Page Must Set document.title
```typescript
useEffect(() => { document.title = 'Page Name - TruckOpti' }, [])
```

### 12. Bilingual Labels (English + Hindi)
All user-facing strings that appear on buttons/toasts/headings must have `language === 'en' ? 'English' : 'Hindi'` variants.

### 13. Mobile-First — Bottom Nav Limited to 5 Items
The mobile bottom nav is crowded at 5 items already. New nav items go in a page (e.g. settings or a “more” sheet), not in the bottom nav.

### 14. Don't Hardcode Business Values (BUG-020 pattern)
```typescript
// ❌ WRONG — ignores the constant
const GST_RATE = 0.05
return amount * 0.18  // ← caused real bug in v49

// ✅ RIGHT
return amount * GST_RATE
```

---

## 🟢 DB / MIGRATION RULES

### 15. New Migration File Naming
```
supabase/migrations/YYYYMMDD000000_description.sql
```
Use today's date. Never reuse a filename that exists.

### 16. Always Enable RLS on New Tables
```sql
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
-- Then create explicit policies (see SECURITY.md §3.1)
```

### 17. Alter Existing Tables via Migration, Not Direct Edit
Never modify `base_schema.sql` directly. Always add a new migration file for schema changes.

### 18. Storage Bucket Paths Must Use auth.uid()
```typescript
// ❌ WRONG — user-supplied name
const path = `uploads/${filename}`

// ✅ RIGHT — deterministic, ownership-scoped
const path = `driver-docs/${driverId}/${docType}.jpg`
//                          ^^^^^^^^ = auth.uid()
```

---

## 🔒 DEPENDENCY / SECURITY RULES

### 19. Dependabot Closure Rule — Every Push
Run `npm audit` in `d:\Github\Truck_Opti\frontend` before and after changing any package:
```powershell
cd d:\Github\Truck_Opti\frontend ; npm audit
```
- If 0 vulnerabilities → proceed.
- If vulnerabilities exist → run `npm audit fix` and commit with `security: fix Dependabot CVE-XXX`.
- Also check root `package.json` (`express`, `dotenv`, etc.). Upgrade to latest non-vulnerable minor:
  ```powershell
  cd d:\Github\Truck_Opti ; npm audit fix
  ```
- **BATCH is NOT complete while `npm audit` reports vulnerabilities in either package.json.**
- GitHub Dependabot alerts must be resolved within the same batch that introduced them — never carry over >1 batch.

### 21. Column Name Verification Before Shipping
When a page selects or displays a column from a Supabase table, verify the column name against the migration file before committing:
```
# grep column name in all migrations
python -c "import os; [print(f, l.strip()) for f in os.listdir('supabase/migrations') for i,l in enumerate(open(f'supabase/migrations/{f}').readlines(),1) if 'col_name' in l]"
```
- ❌ Selecting `full_name` when the column is `name` → silent nulls in UI (BUG-021 pattern)
- ✅ Always cross-check selected column names against migration DDL

### 22. End-of-Day Closing Questions
Answer these 4 questions every time you close a batch or a day's work:
1. **Are there deep hidden bugs?** — grep `error.message`, wrong table names, missing routes, broken RLS.
2. **Is codebase clean?** — 0 TS errors, 0 `npm audit` vulnerabilities, no TODO comments, no dead code.
3. **Is every bug resolved?** — Check ROADMAP.md open bugs section; all P0/P1 must be fixed or tracked.
4. **Is everything glued together?** — Every new page has a route in App.tsx, a nav card, and a Supabase migration applied.

### 21. When User Pastes External Agent Output
When the user provides output from another AI agent (claiming tasks complete/deployed), you MUST:
1. **Read** each claimed file — never trust strings like "already present" or "already existed" without verifying.
2. **Check table names** — grep `supabase.from(` in every modified file and confirm the table names match migration files.
3. **Check for raw error.message** — grep `error.message` and `err.message` in every modified file.
4. **Register** the reporting agent in `STATE.md`, post judgment message (newest at top).
5. **Mark** tasks ✅ DONE or 🔴 BUG in `TASK.md` with evidence.
6. **Create** the next `BATCHNN_AGENT_CONTINUATION_PROMPT.md` with any bugs as P0 tasks.
7. **Output** exactly one single-line summary: `"BATCHXX ✅ PASS / ⚠️ PARTIAL: [issue]. Next: BATCHYY prompt at 0.dev-matrix/BATCHYY_AGENT_CONTINUATION_PROMPT.md"`

### 17. Alter Existing Tables via Migration, Not Direct Edit
Never modify `base_schema.sql` directly. Always add a new migration file for schema changes.

### 18. Storage Bucket Paths Must Use auth.uid()
```typescript
// ❌ WRONG — user-supplied name
const path = `uploads/${filename}`

// ✅ RIGHT — deterministic, ownership-scoped
const path = `driver-docs/${driverId}/${docType}.jpg`
//                          ^^^^^^^^ = auth.uid()
```

---

## 💫 COMMIT CONVENTIONS

```
feat:      New user-visible feature
fix:       Bug fix
security:  Security patch
refactor:  Code restructure (no behaviour change)
migration: DB schema change
chore:     Config, dependencies
docs:      Documentation only
```

Examples:
```
feat: add shipment history page for customer portal
fix: BUG-020 GST rate uses constant not hardcoded value
security: BUG-REDIRECT-001 PhonePe URL domain validation
migration: add licence_url and rc_url columns to drivers table
```

---

*Last updated: 2026-03-05 | v50 | SONNET-004*
## Baseline Reference

Use `QUALITY-BASELINE.md` as the standing companion to these rules. It captures the repo-local software quality bar, integration expectations, and documentation discipline for this application.
