# 📋 TASK

> **Task Queue + Claims - Multi-Agent Coordination**
> Claim before working. Update when done.

---

## 🎯 ACTIVE TASKS

> **All repo-side launch work is currently COMPLETE and locally verified.**
> **Evidence:** `npm run launch-check` passed 7/7 gates on 2026-03-31 (build, audits, Python checks, git cleanliness).
> **Remaining tasks require OWNER external action. See `OWNER_ACTION_CHECKLIST.md` for step-by-step instructions.**

| ID | Task | Priority | Type | Status |
|----|------|----------|------|--------|
| T-110 | Production Razorpay keys + test | P0 | 🔑 External | 🟡 Owner: set env vars |
| T-111 | Google OAuth production credentials verification | P0 | 🔑 External | 🟡 Owner: Supabase + Google Console |
| T-113 | SMS/WhatsApp OTP — configure Twilio in Supabase | P1 | 🔑 External | 🟡 Owner: Supabase dashboard |
| T-114 | Smoke test all authenticated pages (post-login) | P1 | 🧪 Manual | 🟡 Owner: browser test with real account |
| T-115 | Verify production DB backup / PITR setup | P1 | 🔑 External | 🟡 Owner: Supabase dashboard |
| T-116 | Sentry DSN configuration | P1 | 🔑 External | 🟡 Owner: heroku config:set VITE_SENTRY_DSN |
| T-117 | Supabase db push (6 pending migrations) | P0 | 🔑 External | 🟡 Owner: run `supabase db push` |
| ~~BATCH21-T1~~ | ~~Admin payout workflow (approve/pay)~~ | ~~P1~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T2~~ | ~~Sentry error tracking~~ | ~~P1~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T3~~ | ~~Driver GPS broadcast on trip~~ | ~~P2~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T4~~ | ~~Subscription upgrade/downgrade~~ | ~~P2~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T5~~ | ~~LAUNCH_CHECKLIST update~~ | ~~P2~~ | Pre-impl | 2026-03-11 | ✅ DONE (verified GLM-001) |
| ~~BATCH21-T1~~ | ~~Supabase db push helper script~~ | ~~P1~~ | UNCLAIMED | - | ⏭️ Superseded by human action item |
| ~~BATCH21-T2~~ | ~~Sentry via @sentry/react~~ | ~~P1~~ | UNCLAIMED | - | ⏭️ Already done in earlier batch |
| ~~BATCH21-T3~~ | ~~Admin payout approve/pay~~ | ~~P1~~ | UNCLAIMED | - | ⏭️ Already done in BATCH20 |
| ~~BATCH21-T4~~ | ~~Driver GPS broadcast~~ | ~~P2~~ | UNCLAIMED | - | ⏭️ Already done in earlier batch |
| ~~BATCH21-T5~~ | ~~Subscription upgrade/downgrade~~ | ~~P2~~ | UNCLAIMED | - | ⏭️ Already done in earlier batch |
| ~~BATCH20-T1~~ | ~~Photo columns migration~~ | ~~P0~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T2~~ | ~~Driver wallet real balance~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T3~~ | ~~Agency payroll Pay button~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T4~~ | ~~Subscription enforcement~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ⚠️ DONE (BUG: isAdmin wrong field fixed by SONNET-006) |
| ~~BATCH20-T5~~ | ~~Admin subscriptions page~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T6~~ | ~~Dependabot vite-plugin-pwa fix~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (0 vulns) |
| ~~BATCH20-T7~~ | ~~E-way bill form stub~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH20-T8~~ | ~~Launch checklist update~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE |
| ~~BATCH19-T0~~ | ~~Dependabot 32 alerts~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T6) |
| ~~BATCH19-T1~~ | ~~Photo column verification~~ | ~~P0~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T1) |
| ~~BATCH19-T2~~ | ~~Driver wallet balance~~ | ~~P1~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T2) |
| ~~BATCH19-T3~~ | ~~Agency payroll page~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T3) |
| ~~BATCH19-T4~~ | ~~FCM push notifications~~ | ~~P2~~ | UNCLAIMED | - | ⏭️ Deferred to BATCH21-T4 variant |
| ~~BATCH19-T5~~ | ~~E-way bill form~~ | ~~P2~~ | BATCH20-AGENT | 2026-03-11 | ✅ DONE (via T7) |
| ~~BATCH18-T1~~ | ~~Driver withdrawal request UI~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ⚠️ DONE (BUG: table fixed by SONNET-006) |
| ~~BATCH18-T2~~ | ~~Admin revenue trend chart~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH18-T3~~ | ~~Invoice GST fields~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ✅ Already existed (pre-BATCH18) |
| ~~BATCH18-T4~~ | ~~Trip photos lightbox~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH18-T5~~ | ~~Admin user management page~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ⚠️ DONE (BUG: full_name→name fixed by SONNET-006) |
| ~~BATCH17-T1~~ | ~~Supabase migration push (human)~~ | ~~P0~~ | MINIMAX-003 | 2026-03-09 | ✅ Skipped (human task) |
| ~~BATCH17-T2~~ | ~~Landing page SEO + meta tags~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH17-T3~~ | ~~Agency job dispatch modal~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ Already existed (v43) |
| ~~BATCH17-T4~~ | ~~Driver live GPS broadcast~~ | ~~P1~~ | MINIMAX-003 | 2026-03-09 | ✅ Already existed (v39/v40) |
| ~~BATCH17-T5~~ | ~~Admin CSV export button~~ | ~~P2~~ | MINIMAX-003 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T1~~ | ~~Admin payouts nav card~~ | P1 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T2~~ | ~~E2E smoke test for RLS created_by~~ | P0 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T3~~ | ~~Fix remaining raw error.message leaks~~ | P1 | SONNET-005 | 2026-03-09 | ✅ DONE (14 in 7 files) |
| ~~BATCH16-T4~~ | ~~Contact page~~ | P2 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH16-T5~~ | ~~Admin contact inquiries view~~ | P2 | SONNET-005 | 2026-03-09 | ✅ DONE |
| ~~BATCH15-T2~~ | ~~BUG-023: vite-plugin-pwa downgrade + serialize-javascript override~~ | ~~P2~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH15-T3~~ | ~~Add created_by to shipment inserts (RLS)~~ | ~~P0~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH15-T4~~ | ~~Add created_by to routes/packing inserts (RLS)~~ | ~~P0~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH15-T5~~ | ~~Add created_by to customer inserts (RLS)~~ | ~~P0~~ | MINIMAX-M2.5 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T1~~ | ~~BUG-REDIRECT-001 PhonePe domain validation~~ | ~~P0~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T2~~ | ~~npm audit fix (40+ vulns)~~ | ~~P0~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE — 4 high remain (build-time only, BUG-023) |
| ~~BATCH14-T3~~ | ~~Driver withdrawal → driver_payouts table~~ | ~~P1~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T4~~ | ~~Admin approve/reject agencies~~ | ~~P1~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T5~~ | ~~Admin approve/reject drivers~~ | ~~P1~~ | MINIMAX-003 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T1~~ | ~~BUG-REDIRECT-001 PhonePe domain validation~~ | ~~P0~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T2~~ | ~~npm audit fix for 45 vulnerabilities~~ | ~~P0~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T3~~ | ~~Driver withdrawal writes to driver_payouts~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T4~~ | ~~Admin approve/reject agencies~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH14-T5~~ | ~~Admin approve/reject drivers~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T1~~ | ~~RLS security fixes (customers, shipments, routes, packing_results)~~ | ~~P0~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T2~~ | ~~SMS OTP via Twilio - error handling~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T3~~ | ~~Subscription upgrade/downgrade flow~~ | ~~P1~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T4~~ | ~~Bundle size optimization (lazy load three, pdf, excel)~~ | ~~P2~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH13-T5~~ | ~~Root directory cleanup~~ | ~~P3~~ | MINIMAX-002 | 2026-03-06 | ✅ DONE |
| ~~BATCH12-T1~~ | ~~Razorpay webhook Edge Function~~ | ~~P1~~ | SONNET-004 (judge) | 2026-03-06 | ✅ DONE |
| ~~BATCH12-T2~~ | ~~Admin dashboard real analytics~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |
| ~~BATCH12-T3~~ | ~~Driver document upload~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |
| ~~BATCH12-T4~~ | ~~Customer shipment history page~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |
| ~~BATCH12-T5~~ | ~~Agency notification bell~~ | ~~P2~~ | MINIMAX-001 | 2026-03-05 | ✅ DONE |

---

## 📝 TASK QUEUE

> **All repo-side code tasks are COMPLETE and preflight-verified. Remaining items require external owner action.**
> **See `0.dev-matrix/OWNER_ACTION_CHECKLIST.md` for precise instructions.**

| ID | Task | Priority | Nature | Owner Action |
|----|------|----------|--------|--------------|
| T-117 | Supabase db push (6 pending migrations) | P0 | External | `supabase db push` from project root |
| T-110 | Production Razorpay keys + test | P0 | External | Heroku config:set + Supabase secrets |
| T-111 | Google OAuth production credentials | P0 | External | Supabase dashboard + Google Console |
| T-113 | SMS/WhatsApp OTP via Twilio | P1 | External | Supabase Auth → Phone Providers |
| T-116 | Sentry DSN configuration | P1 | External | `heroku config:set VITE_SENTRY_DSN=...` |
| T-115 | Verify production DB backup / PITR | P1 | External | Supabase dashboard → Backups |
| T-114 | Authenticated smoke test (all pages) | P1 | Manual | Browser test with real account |
| T-107 | Google Maps API key (optional) | P2 | External | Leaflet fallback works; nice-to-have |

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
| T-121 | Harden `apps/web` dependency surfaces | GLM-002 / OpenCode | 2026-03-30 | `756285a0` + `0599fa53`; apps/web npm audit clean, pip-audit clean, compileall pass |
| T-122 | Add repeatable launch-readiness preflight | GLM-003 / OpenCode | 2026-03-31 | `92eb6324` + `50e519db`; `npm run launch-check` passes 7/7 gates |
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

**Last Updated:** 2026-03-31 | **Framework Version:** 2.0
