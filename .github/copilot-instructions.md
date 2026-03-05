# GitHub Copilot Instructions — TruckOpti

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
| `0.dev-matrix/TASK.md` | Current unclaimed tasks (BATCH12 T1–T5) |

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

## Security rules (summary — see SECURITY.md for full list)

- Every new Supabase table must have RLS enabled + explicit policies
- Never use `USING (true)` on user-owned tables (existing bugs: BUG-RLS-001 to -006)
- Never expose `error.message` to users
- URL redirects: validate domain against allowlist (BUG-REDIRECT-001 pattern)
- Webhook endpoints: verify HMAC-SHA256 signature (BATCH12-T1)
- No `any` type in TypeScript unless unavoidable

---

## BATCH12 pending tasks

| ID | Task | File(s) |
|----|------|---------|
| T1 | Razorpay webhook Edge Function | `supabase/functions/razorpay-webhook/index.ts` |
| T2 | Admin dashboard real analytics | `frontend/src/pages/AdminDashboardPage.tsx` |
| T3 | Driver doc upload (licence + RC) | `frontend/src/pages/DriverRegisterPage.tsx` |
| T4 | Customer shipment history page | `frontend/src/pages/ShipmentHistoryPage.tsx` |
| T5 | Agency notification bell | `frontend/src/layouts/AgencyLayout.tsx` |

---

*Auto-loaded by VS Code Copilot. Last updated: 2026-03-05 | v50*
