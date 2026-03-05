# 📋 TASK

> **Task Queue + Claims - Multi-Agent Coordination**
> Claim before working. Update when done.

---

## 🎯 ACTIVE TASKS

> **Tasks currently being worked on.**

| ID | Task | Priority | Claimed By | Started | Status |
|----|------|----------|------------|---------|--------|
| T-110 | Production Razorpay keys + test | P0 | UNCLAIMED | - | 🟡 Ready to claim |
| T-113 | SMS/WhatsApp OTP — configure Twilio in Supabase | P1 | UNCLAIMED | - | 🟡 Ready to claim |
| T-114 | Smoke test all authenticated pages (post-login) | P1 | UNCLAIMED | - | 🟡 Ready to claim |
| T-115 | Upgrade/downgrade subscription flow | P1 | UNCLAIMED | - | 🟡 Ready to claim |
| **BATCH12-T1** | **Razorpay webhook Edge Function (HMAC-SHA256)** | **P1** | UNCLAIMED | - | 🟡 Ready to claim |
| **BATCH12-T2** | **Admin dashboard real analytics** | **P2** | UNCLAIMED | - | 🟡 Ready to claim |
| **BATCH12-T3** | **Driver document upload (licence + RC)** | **P2** | UNCLAIMED | - | 🟡 Ready to claim |
| **BATCH12-T4** | **Customer shipment history page** | **P2** | UNCLAIMED | - | 🟡 Ready to claim |
| **BATCH12-T5** | **Agency notification bell (Realtime)** | **P2** | UNCLAIMED | - | 🟡 Ready to claim |

---

## 📝 TASK QUEUE

> **Available tasks. Claim one before starting.**

| ID | Task | Priority | Complexity | Est. Time | Files |
|----|------|----------|------------|-----------|-------|
| T-107 | Production OAuth/domain canonical verification | P2 | S | 1h | Supabase dashboard |
| T-116 | Set `VITE_RAZORPAY_KEY_ID` to live production key | P0 | S | 30m | frontend/.env.production, Razorpay dashboard |
| T-117 | Create contact/sales inquiry form or page | P2 | M | 2h | frontend/src/pages/ContactPage.tsx |
| T-118 | Add Razorpay production webhook + order verification | P1 | L | 4h | supabase/functions/ |
| BATCH12-T1 | Razorpay webhook Edge Function `supabase/functions/razorpay-webhook/index.ts` — HMAC-SHA256, update subscription to active | P1 | L | 4h | `supabase/functions/razorpay-webhook/` |
| BATCH12-T2 | AdminDashboardPage real analytics — query `agency_jobs`, `transport_agencies`, `drivers` | P2 | M | 2h | `frontend/src/pages/AdminDashboardPage.tsx` |
| BATCH12-T3 | DriverRegisterPage doc upload — add licence + RC photo upload to `driver-docs` bucket, save URLs to `drivers` table | P2 | M | 2h | `frontend/src/pages/DriverRegisterPage.tsx` |
| BATCH12-T4 | Customer ShipmentHistoryPage — `/shipment-history` route showing all shipments for auth user | P2 | M | 2h | `frontend/src/pages/ShipmentHistoryPage.tsx` (create) |
| BATCH12-T5 | AgencyLayout notification bell — Supabase Realtime subscription to `agency_jobs` INSERT | P2 | S | 1h | `frontend/src/layouts/AgencyLayout.tsx` |

### Priority Levels
- 🔴 **P0** - Critical (blocking production)
- 🟠 **P1** - High (needed soon)
- 🟡 **P2** - Medium (should do)
- 🟢 **P3** - Low (nice to have)

### Complexity Levels
- **S** - Simple (1 file, <1 hour)
- **M** - Medium (2-5 files, 1-4 hours)
- **L** - Large (5+ files, 4+ hours)
- **XL** - Extra Large (needs breakdown)

---

## 📖 HOW TO CLAIM A TASK

### Step 1: Check Availability
```
1. Read TASK QUEUE above
2. Find unclaimed task matching your skill level
3. Check STATE.md for any conflicts
```

### Step 2: Claim the Task
```markdown
Move task from QUEUE to ACTIVE TASKS:
| T-001 | Fix login bug | P1 | YOUR-ID | 2026-01-11 16:00 | 🟡 In Progress |
```

### Step 3: Work the Task
```
1. Break into atomic steps (in your notes)
2. Work ONE step at a time
3. Test after each step
4. Update status if blocked
```

### Step 4: Complete the Task
```
1. All tests passing
2. Move to COMPLETED section
3. Add learnings to PATTERNS.md
4. Remove from ACTIVE TASKS
```

---

## ✅ COMPLETED TASKS

> **Recently completed. Archive weekly.**

| ID | Task | Completed By | Date | Notes |
|----|------|--------------|------|-------|
| T-111 | ToS/Privacy Policy pages | SONNET-001 | 2026-03-03 | TermsPage.tsx + PrivacyPage.tsx created; routes added; links fixed in Login/Signup |
| T-109 | Browser smoke test all public pages | SONNET-001 | 2026-03-03 | B1-B8 bugs found and documented; see KNOWN ISSUES in STATE.md |
| T-112 | Enable Email OTP | SONNET-001 | 2026-03-03 | VITE_AUTH_EMAIL_OTP_ENABLED=true in .env + .env.production |
| T-119 | Fix silent phone OTP failure (no error shown) | SONNET-001 | 2026-03-03 | supabaseApi.ts signInWithPhone: added phone_provider_disabled friendly error |
| T-120 | Fix PricingPage dead CTA buttons (Start Free, Get Started ×4, Contact Sales, Talk to Us) | SONNET-001 | 2026-03-03 | All 6 CTA buttons now have onClick; navigate('/signup') or mailto: |
| T-100 | Cloudflare + Heroku dual-domain SSL validation | GPT-5.3-Codex | 2026-02-22 | `truckopti.in` + `www` live |
| T-101 | Launch readiness continuation (BATCH6+7) | Copilot (Claude Sonnet) | 2026-03-03 | 10 BATCH6 tasks + 5 BATCH7 tasks done |
| T-102 | Build `useSubscription` hook + trial/expiry logic | Copilot (Claude Sonnet) | 2026-03-03 | `useSubscription.ts` — 235 lines, 42/42 tests |
| T-103 | Pricing page DB source of truth + fallback | Copilot (Claude Sonnet) | 2026-03-03 | Already implemented; verified |
| T-104 | Profile auth data cleanup | Copilot (Claude Sonnet) | 2026-03-03 | No hardcoded data found; verified clean |
| T-105 | Supabase integration script + run report | Copilot (Claude Sonnet) | 2026-03-03 | 42/42 PASS |
| T-106 | Full smoke + launch tracker completion | Copilot (Claude Sonnet) | 2026-03-03 | Tracker + Checklist updated with real results |
| T-001 | Update folder reference | OPUS-002 | 2026-01-11 | Framework test ✅ |
| T-000 | Universal framework setup | OPUS-001 | 2026-01-11 | Multi-agent ready |

---

## 🚫 BLOCKED TASKS

> **Tasks that cannot proceed. Include blocker reason.**

| ID | Task | Blocked By | Blocker | Since |
|----|------|------------|---------|-------|
| | None currently | | | |

---

## 📝 TASK TEMPLATES

### Bug Fix Task
```markdown
| ID | Task | Priority | Complexity | Est. Time | Files |
|----|------|----------|------------|-----------|-------|
| T-XXX | Fix: [error message or symptom] | P1 | S | 30min | path/file.js |

**Description:**
[What's broken]

**Steps to Reproduce:**
1. [Step 1]
2. [Step 2]

**Expected:** [What should happen]
**Actual:** [What happens instead]

**Acceptance Criteria:**
- [ ] Error no longer occurs
- [ ] Tests pass
- [ ] No regression
```

### Feature Task
```markdown
| ID | Task | Priority | Complexity | Est. Time | Files |
|----|------|----------|------------|-----------|-------|
| T-XXX | Add: [feature name] | P2 | M | 2h | multiple |

**Description:**
[What to build]

**User Story:**
As a [user type], I want [feature] so that [benefit].

**Acceptance Criteria:**
- [ ] Feature works as described
- [ ] Tests added
- [ ] Documentation updated
```

### Refactor Task
```markdown
| ID | Task | Priority | Complexity | Est. Time | Files |
|----|------|----------|------------|-----------|-------|
| T-XXX | Refactor: [area] | P3 | M | 2h | multiple |

**Description:**
[What to improve]

**Reason:**
[Why this refactor is needed]

**Acceptance Criteria:**
- [ ] Code improved
- [ ] Behavior unchanged
- [ ] Tests still pass
- [ ] No performance regression
```

---

## 🔄 TASK LIFECYCLE

```
CREATED → QUEUED → CLAIMED → IN PROGRESS → COMPLETED
                      │
                      ├──→ BLOCKED → (resolved) → IN PROGRESS
                      │
                      └──→ ABANDONED → QUEUED (unclaim)
```

---

## 👥 MULTI-AGENT TASK RULES

### Rule 1: One Task Per Agent
```
Each agent works on ONE task at a time.
Complete or park before claiming another.
```

### Rule 2: Claim Before Work
```
NEVER start working without claiming.
Check STATE.md for file conflicts.
```

### Rule 3: Update Regularly
```
Update status every significant step.
If blocked >1 hour, add to BLOCKED section.
```

### Rule 4: No Duplicate Claims
```
If task is claimed, pick another.
If urgent, coordinate via STATE.md messages.
```

### Rule 5: Clean Handoff
```
If abandoning task, add notes.
Move back to QUEUE, not delete.
```

---

## 🤖 AI-SPECIFIC GUIDELINES

### For Small LLMs (7B-13B)
```
✓ Claim S-complexity tasks
✓ Prefer bug fixes and text changes
✓ One file at a time
✓ Ask for help if stuck >30min
```

### For Medium LLMs (30B-70B)
```
✓ Can handle M-complexity tasks
✓ Can work on features
✓ Multiple related files OK
✓ Can break down L tasks
```

### For Large LLMs (70B+)
```
✓ Can handle L/XL tasks
✓ Can create new tasks
✓ Can resolve blocked tasks
✓ Can mentor smaller AIs
```

---

## 📌 QUICK REFERENCE

### Claim a Task
```
1. Copy task from QUEUE
2. Paste to ACTIVE TASKS
3. Add your ID and timestamp
4. Start working
```

### Complete a Task
```
1. Verify all acceptance criteria
2. Run all tests
3. Move to COMPLETED
4. Add to PATTERNS.md if learned something
```

### Block a Task
```
1. Move to BLOCKED section
2. Describe the blocker clearly
3. Post in STATE.md messages
4. Work on different task
```

---

**Last Updated:** 2026-01-11 | **Framework Version:** 2.0
