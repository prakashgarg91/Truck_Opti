# TruckOpti — Dev Matrix Index

> **Start here. This folder is the source of truth for every AI agent working on TruckOpti.**
> Repo: `d:/Github/Truck_Opti` | Production: `https://www.truckopti.in`
> Heroku app: `truck-opti-app` | Supabase: `jbxncejtcbpcronndqlx.supabase.co`
> Current version: **v50** (as of 2026-03-05)

---

## 🎯 START HERE (30-Second Orientation)

```
╔══════════════════════════════════════════════════════════════════════════════╗
║  🚀 QUICK START - Do these in order:                                          ║
║                                                                               ║
║  1. SIGN IN     →  Add yourself to DISCUSSION.md                             ║
║  2. CHECK STATE →  Read STATE.md (conflicts? bugs? known issues?)            ║
║  3. READ RULES  →  Read TESTING_PRINCIPLES.md (mandatory)                   ║
║  4. CLAIM TASK  →  Pick from TASK.md, mark as yours                          ║
║  5. WORK        →  Small changes, test after each                            ║
║  6. VALIDATE    →  npm test && npm run deep-scan                             ║
║  7. COMMIT      →  git push origin main                                      ║
║  7. SIGN OUT    →  Update DISCUSSION.md                                      ║
║                                                                               ║
║  📖 Full docs: Read this entire file once                                    ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

---

## 📁 FILE MAP — TruckOpti Dev Matrix

```
0.dev-matrix/
│
├── 🚀 ENTRY POINTS
│   ├── INDEX.md                          ← YOU ARE HERE
│   └── BATCHxx_AGENT_CONTINUATION_PROMPT.md ← Use this to start working
│
├── 📋 LIVE COORDINATION (read every session)
│   ├── STATE.md              ← Current version, active agents, known issues
│   ├── TASK.md               ← All pending tasks; claim before starting
│   └── DISCUSSION.md         ← Agent sign-in/out; handoff notes
│
├── 📖 PROJECT KNOWLEDGE (read once)
│   ├── PRODUCT_VISION.md     ← What TruckOpti is building (4 portals, mission)
│   ├── REQUIREMENTS.md       ← Feature specs and completion status
│   ├── ROADMAP.md            ← Phase-by-phase progress + open items
│   ├── DEPENDENCIES.md       ← Frontend architecture, DB tables, data flow
│   ├── RULES.md              ← TruckOpti-specific coding rules
│   ├── PATTERNS.md           ← React/Supabase/TypeScript patterns for this app
│   └── MENU-CHART.md         ← UI navigation structure, all routes
│
├── 🔒 SECURITY (mandatory)
│   └── SECURITY.md           ← AI insecure-defaults checklist + 15-item pre-commit gate
│
├── 🚀 LAUNCH
│   ├── LAUNCH_CHECKLIST.md   ← Go-live checklist (Phases 1-6)
│   └── PROJECT_COMPLETION_GAPS.md ← Remaining blockers and completion tasks
│
├── 🧪 QUALITY
│   ├── TESTING_PRINCIPLES.md ← ⚠️ MANDATORY before any task is marked done
│   └── TEST.md               ← How to run tests, what to test per portal
│
└── 📚 HISTORY
    └── BATCHxx_AGENT_CONTINUATION_PROMPT.md ← Per-batch history and task specs
```

---

## 🔄 AGENT WORKFLOW

```
  1. Read STATE.md          → know current version, active agents, open bugs
  2. Read TASK.md           → pick an unclaimed task, register your agent ID
  3. Read TESTING_PRINCIPLES.md → mandatory before ANY code change
  4. Read SECURITY.md §6    → 15-item AI safety checklist
  5. Work the task          → small commits, build after each TS change
  6. Validate               → cd frontend && npm run build (must be 0 errors)
  7. Commit                 → git add -A && git commit -m "feat: ..."
  8. Push & deploy          → git push origin main && git push heroku main
  9. Post result            → STATE.md → ## 📝 AGENT MESSAGES (newest at top)
  10. Update TASK.md        → move task to COMPLETED
```

### Build command (mandatory before any push)
```powershell
cd d:\Github\Truck_Opti\frontend ; npm run build
# Must complete with 0 TypeScript errors
```

### Deploy commands
```powershell
cd d:\Github\Truck_Opti
git add -A
git commit -m "feat: description"
git push origin main     # GitHub first
git push heroku main     # Heroku second
```

---

## 🛡️ ERROR PREVENTION — TruckOpti

| Check | Command | When |
|---|---|---|
| TypeScript errors | `cd frontend && npm run build` | Before every commit |
| Lint | `cd frontend && npm run lint` | Before every commit |
| Security checklist | Read `SECURITY.md §6` | Before generating any code |
| RLS policy audit | Check `SECURITY.md §2` open bugs | When touching DB schema |

---

## 🚨 MANDATORY GIT PUSH PROTOCOL

```
BEFORE GIT PUSH:
  1. cd frontend && npm run build  → 0 TypeScript errors required
  2. git add -A
  3. git commit -m "feat: description"
  4. git push origin main    ← GitHub FIRST
  5. git push heroku main    ← Heroku SECOND
  6. Post in STATE.md → ## 📝 AGENT MESSAGES with version bump and task summary

COMMIT TYPES:
  feat:     New feature
  fix:      Bug fix
  security: Security improvement
  refactor: Code restructure (no new behaviour)
  chore:    Package/config updates
  docs:     Documentation only
```

---

## 👥 MULTI-AI COORDINATION — TRUCKOPTI

### Agent Types

| Type | Role | Example ID |
|------|------|------------|
| **LEAD** | Implements batch tasks | `SONNET-005`, `GPT-004` |
| **JUDGE** | Verifies LEAD output, fixes bugs, deploys | `SONNET-004` (current judge) |

### Communication Protocol

```
1. Register   → Add row to STATE.md → ## 🤖 ACTIVE AGENTS
2. Announce   → Post to STATE.md → ## 📝 AGENT MESSAGES
3. Claim task → Move from TASK.md queue to Active Tasks section
4. Complete   → Move to TASK.md COMPLETED, bump Heroku version
5. Message    → Post judgment/result in STATE.md AGENT MESSAGES
6. Deregister → Remove from ACTIVE AGENTS
```

### Agent ID Format
```
{MODEL}-{NUMBER}
Examples: SONNET-005, GPT-004, GEMINI-002, LLAMA-003
```

---

## ✅ SUCCESS CRITERIA FOR EACH BATCH

```
✅ BATCH DONE =
  - Build passes (0 TS errors)
  - Each task manually verified in running app (see TESTING_PRINCIPLES.md)
  - Security checklist passed (SECURITY.md §6)
  - STATE.md updated with agent message
  - TASK.md updated (tasks moved to COMPLETED)
  - Heroku deployment confirmed (heroku logs --tail shows no startup errors)
```

---

## 🔮 CURRENT FOCUS — BATCH 12 (unclaimed)

See `BATCH12_AGENT_CONTINUATION_PROMPT.md` for full task specs.

| Task | File | Priority |
|------|------|----------|
| T1: Razorpay webhook Edge Function + HMAC verify | `supabase/functions/razorpay-webhook/index.ts` | P1 |
| T2: Admin dashboard real analytics | `frontend/src/pages/AdminDashboardPage.tsx` | P2 |
| T3: Driver registration document upload | `frontend/src/pages/DriverRegisterPage.tsx` | P2 |
| T4: Customer shipment history page | `frontend/src/pages/ShipmentHistoryPage.tsx` (new) | P2 |
| T5: Agency notification bell | `frontend/src/components/AgencyLayout.tsx` | P2 |

**HUMAN ACTION REQUIRED before T1 works:**
```
heroku config:set VITE_RAZORPAY_KEY_ID=rzp_live_XXXXXXXX --app truck-opti-app
supabase secrets set RAZORPAY_KEY_SECRET=your_live_secret --project-ref jbxncejtcbpcronndqlx
```

---

*Last updated: 2026-03-05 | v50 | SONNET-004 (judge)*
## Quality Baseline

Read `QUALITY-BASELINE.md` alongside this index. It defines the repo-local quality bar, integration expectations, documentation discipline, and sustainable codebase standards for this specific software product.
