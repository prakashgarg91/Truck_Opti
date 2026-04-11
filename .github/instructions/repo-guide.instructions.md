---
description: Repository-specific architecture, Supabase rules, closing hooks, and quality gates preserved from the legacy Copilot workspace instructions. Consult when working broadly across Truck_Opti.
---

# TruckOpti Repository Guide

## What is this project?

TruckOpti is an India logistics SaaS platform (truck booking, agency dispatch, driver app, admin).
Production: **https://www.truckopti.in** | Heroku app: **truck-opti-app** | Current: **v50**

Stack: React 18 + TypeScript + Vite + Tailwind + Supabase + Zustand + React Router v6

---

## Before suggesting any code, read these files

| File | What it contains |
|------|-----------------|
| `0.dev-matrix/STATE.md` | Current version, active bugs, last agent messages |
| `0.dev-matrix/SECURITY.md` | **Mandatory** — 15-item checklist, forbidden patterns, known RLS bugs |
| `0.dev-matrix/PATTERNS.md` | Auth, Supabase, payment, PDF, bilingual patterns used in this project |
| `0.dev-matrix/DEPENDENCIES.md` | DB tables, file structure, data flows |
| `0.dev-matrix/RULES.md` | Build rules, commit conventions, anti-patterns |
| `0.dev-matrix/TASK.md` | Current unclaimed tasks (BATCH19 T1–T5) |

---

## Key conventions

### Auth
```typescript
// Always use authStore — never local useState for auth
import { useAuthStore } from '../store/authStore'
const { user, agencyId, driverId } = useAuthStore()
```

### Supabase
```typescript
// Always destructure { data, error }. Never ignore error.
const { data, error } = await supabase.from('table').select()
if (error) { console.error('[Context]', error); toast.error('...friendly message...'); return }
```

### Error messages to user
```typescript
// NEVER show raw error.message — it leaks DB internals
toast.error(language === 'en' ? 'Something went wrong' : 'कुछ गलत हुआ')
```

### Build check (must pass before every push)
```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build   # 0 TS errors required
```

---

## Standing Behavior Hooks

### Hook 1 — Dependabot Closure Rule
Every session that touches `package.json` or pushes to GitHub **must** close out Dependabot alerts:
1. Run `npm audit fix` inside `d:\Github\Truck_Opti\frontend` and check if root `package.json` dependencies (`express`, etc.) need upgrading.
2. If Dependabot reports vulnerabilities on `git push`, add a task to the next BATCH to resolve them — never leave them open across >1 batch.
3. Include in the commit message: `security: fix Dependabot CVE-XXX` if a package was upgraded.
4. The BATCH completion checklist is NOT done until `npm audit` (frontend) shows 0 vulnerabilities AND root `package.json` packages are on non-vulnerable versions.

### Hook 2 — Judge External Agent Output
When the user pastes output from another AI agent (e.g. "BATCH17 deployed!"), automatically:
1. **Verify** each claimed task against the actual files — read the file, confirm the feature is really there.
2. **Flag bugs** — check for table mismatches, wrong imports, missing routes, raw `error.message` leaks, broken RLS.
3. **Update dev-matrix** — update `STATE.md` (register agent, post judgment message), `TASK.md` (mark done / flag issues), and create the next `BATCHNN_AGENT_CONTINUATION_PROMPT.md`.
4. **Output** a single-line statement summarising completion & next action.
5. Never skip the file-read verification step — "already present" claims from agents are frequently wrong.

### Hook 3 — Skill / Pattern Drift Update
Whenever an AI agent introduces a **new pattern** used in 2+ files, or discovers a pattern being used inconsistently:
1. Update `0.dev-matrix/PATTERNS.md` — add a code snippet showing the correct pattern.
2. If the pattern is security-related, also add to `0.dev-matrix/SECURITY.md`.
3. If a new Supabase table/column is added, update `0.dev-matrix/DEPENDENCIES.md`.
4. Examples that MUST trigger a PATTERNS.md update: new auth flow, new Supabase query shape, new bilingual string pattern, new toast pattern, new RLS approach.
5. Do NOT invent new patterns that conflict with existing ones in PATTERNS.md — resolve conflicts by updating the doc.

### Hook 4 — End-of-Day / Session Close Checklist
At the end of every session (or when the user says "close the day" / "update dev-matrix"):
1. Run `npm audit` in `frontend/` and root — flag if non-zero.
2. Run `npm run build` in `frontend/` — must show 0 TS errors.
3. Update `0.dev-matrix/STATE.md`: add AGENT MESSAGES entry, update current version.
4. Update `0.dev-matrix/TASK.md`: mark completed tasks done, add next BATCH queue.
5. Create `0.dev-matrix/BATCHNN_AGENT_CONTINUATION_PROMPT.md` for the next batch.
6. Answer the 4 closing questions (see RULES.md §22) and include in the commit message summary.
7. `git add -A && git commit && git push origin main` — always push to GitHub before ending.
8. If this checklist will take >5 minutes, create a `CLAUDE_CODE_CLOSING_PROMPT.md` file with all tasks itemized and tell the user to run it in Claude Code — then judge the output on return.

---

## Security rules (summary — see SECURITY.md for full list)

- Every new Supabase table must have RLS enabled + explicit policies
- Never use `USING (true)` on user-owned tables (existing bugs: BUG-RLS-001 to -006)
- Never expose `error.message` to users
- URL redirects: validate domain against allowlist (BUG-REDIRECT-001 pattern)
- Webhook endpoints: verify HMAC-SHA256 signature (BATCH12-T1)
- No `any` type in TypeScript unless unavoidable

---

*Legacy repo guide preserved during the AGENTS and .github/instructions migration. Last updated: 2026-03-10 | v55*
