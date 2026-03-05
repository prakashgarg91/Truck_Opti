# 📊 STATE

> **Live System State + AI Agent Registry + Quality Metrics**
> Version: 3.0 | All AIs MUST register here and update regularly.

---

## ⚠️ TESTING MANDATE

> **ALL AI AGENTS MUST READ [TESTING_PRINCIPLES.md](TESTING_PRINCIPLES.md) BEFORE STARTING ANY TASK.**
>
> **Core Rule:** Never assume a button, feature, or API call works without verified end-to-end proof.
> A full audit on 2026-03-03 found 8 bugs in features believed to be "complete":
> - 6 Pricing page CTA buttons with NO `onClick` handler
> - Email OTP completely disabled via env var (FIXED)
> - Phone OTP silently failing with no error shown to user (FIXED)
> - Terms/Privacy links pointing to dead `href="#"` anchors (FIXED)
>
> **Do not mark tasks complete based on code writing alone. Test the actual user flow.**

---

## 🔴 CRITICAL ALERTS

> **High-priority issues requiring immediate attention**

| Alert | Severity | Description | Assigned To |
|-------|----------|-------------|-------------|
| ~~HEROKU-STALE~~ | ✅ RESOLVED | Deployed v22 (slug 337 MB). Added .slugignore; slug was 843 MB. | SONNET-001 (auto) |
| ~~SUPABASE-SITE-URL~~ | ✅ RESOLVED | Site URL updated to https://www.truckopti.in via Management API. Allow-list: www+apex+Heroku. | SONNET-001 (auto) |

---

## 🤖 ACTIVE AGENTS

> **Register here when you start working. Remove when you leave.**

| Agent ID | Type | Model | Specialty | Working On | Since | Status |
|----------|------|-------|-----------|------------|-------|---------|
| `SONNET-003` | LEAD | Claude Sonnet 4.6 | Full-stack | Phase 2 driver app, Phase 3 agency portal | 2026-03-05 | ✅ Active |
| `SONNET-002` | LEAD | Claude Sonnet 4.6 | Full-stack | Gaps+bugs audit, v37-v38 complete | 2026-03-05 | 🔴 Offline |
| `SONNET-001` | LEAD | Claude Sonnet 4.6 | Full-stack + Testing | v35 deploy + UI/UX fixes | 2026-03-04 | 🔴 Offline |
| `OPUS-002` | LEAD | Claude Opus 4.5 | Full-stack | Framework testing | 2026-01-11 | 🔴 Offline |

### How to Register
```markdown
| `YOUR-ID` | TYPE | Model Name | Your specialty | Current task | Timestamp | ✅ Active |
```

### Agent ID Format
```
{MODEL}-{NUMBER}
Examples: OPUS-001, HAIKU-002, GPT-003, GEMINI-004, LLAMA-005
```

---

## 📝 AGENT MESSAGES

> **Leave messages for other AIs here. Newest at top.**

```
[2026-03-05 15:00] SONNET-003: 🚀 v38 DEPLOYED — Phase 1 COMPLETE + Phase 2 Core Done

                             SUPABASE MIGRATIONS APPLIED (via MCP):
                             ✅ phase1_drivers: drivers, transport_agencies, driver_locations, job_offers tables + RLS + Realtime
                             ✅ add_driver_online_status: is_online, fleet_size, operating_routes, active_job_id columns

                             NEW FILES CREATED (7):
                             ✅ frontend/src/layouts/DriverLayout.tsx — Driver portal shell (header + bottom nav)
                             ✅ frontend/src/pages/DriverDashboardPage.tsx — Online toggle, Realtime job offers, 30s countdown
                             ✅ frontend/src/pages/AgencyRegisterPage.tsx — 3-step agency registration (public)
                             ✅ frontend/src/pages/AdminAgenciesPage.tsx — Agency approval queue (admin)
                             ✅ frontend/src/pages/DriverDetailPage.tsx — Driver detail + approve/reject (admin)
                             ✅ frontend/src/pages/DriverEarningsPage.tsx — Earnings summary with period selector
                             ✅ frontend/src/pages/DriverHistoryPage.tsx — Trip history with filters

                             FILES UPDATED (3):
                             ✅ App.tsx — RoleHome redirect, 6 new lazy routes, DriverLayout block
                             ✅ MobileLayout.tsx — Agency Approvals link in admin sidebar
                             ✅ AdminDriversPage.tsx — Details button → /admin/drivers/:id

                             STATUS: v38 live at https://www.truckopti.in (Heroku Released 2026-03-05 13:17:27)
───────────────────────────────────────────────────────────────────────
[2026-03-05 14:00] SONNET-002: 🔍 GAPS+BUGS AUDIT → v37 fixes
                             
                             BUGS FOUND & FIXED:
                             ❌ BUG-009: ProfilePage handleSaveCompany overwrites entire company object
                                 → Any save in Profile destroyed address_line1/city/state/pincode/phone/email
                                    that CompanyProfilePage had saved. FIXED: now merges with existing.
                             ❌ BUG-010: TrucksPage volume cell overflow in 4-column grid (no truncate)
                                 → FIXED: `truncate min-w-0` added to Volume + Cost/km cells
                             ❌ BUG-011: TrucksPage cost_per_km shown as raw `₹{value}` (no formatting)
                                 → FIXED: `formatCurrency(truck.cost_per_km || 0)` using formatters.ts
                             ❌ BUG-012: ProfilePage company section showed only `company.address` (old format)
                                 → FIXED: now falls back to composed address from address_line1/city/state/pincode
                             
                             IMPROVEMENTS ADDED:
                             ✅ ProfilePage: "Full Profile →" link added to Company section → /settings/company
                             ✅ ProfilePage: `useNavigate` + `ExternalLink` icon imported
                             ✅ ROADMAP: Phase 0 all items checked off, Phase 1 items updated
                             
                             STATUS: v37 build in progress
                             
                             SHIPPED IN v36:
                             ✅ DriverRegisterPage: 4-step driver onboarding (/driver/register)
                             ✅ CompanyProfilePage: company info → user_metadata (/settings/company)
                             ✅ AdminDriversPage: approve/reject queue, admin-only (/admin/drivers)
                             ✅ DB migration: drivers, transport_agencies, driver_locations, job_offers
                             ✅ formatters.ts: formatPercent/formatCurrency/formatDistance/formatDuration
                             ✅ RoutesPage + PackingPage: formatter utilities applied
                             ✅ MobileLayout: sidebar NavLink close fix + Company Profile + Driver Approvals links
                             ✅ InvoicePage: composite address from profile fields, /settings/company link
                             ✅ App.tsx: 3 new lazy routes added
                             ✅ dev-matrix: REQUIREMENTS.md rewritten, ROADMAP.md Phase 0 checked, STATE.md updated

[2026-03-05 14:00] SONNET-002: ✅ v37 deployed — BUG-009/010/011/012 fixed
───────────────────────────────────────────────────────────────────────
[2026-03-03 20:00] SONNET-001: 🚀 PRODUCTION DEPLOYMENT COMPLETE
                             
                             ALL 3 MANUAL BLOCKERS RESOLVED (MCP-assisted):
                             ✅ Heroku v22 LIVE at https://www.truckopti.in
                                 Root cause: apps/web/node_modules (9869 files) committed — slug was 843 MB
                                 Fix: .slugignore added → slug now 337 MB (limit 500 MB)
                                 Commit: 7fbc727f "fix(heroku): add .slugignore to reduce slug size below 500MB"
                             ✅ Supabase Site URL → https://www.truckopti.in (was Heroku URL)
                                 allow_list: www + apex + Heroku fallback — auth emails now use custom domain
                             ✅ Email templates live in Supabase
                                 magic_link.html (5461 ch) + confirmation.html (5914 ch) uploaded via curl/Management API
                                 Subjects: "Your TruckOpti Login Code" / "Verify your TruckOpti account"
                             
                             HEROKU ENV VARS (also updated this session):
                             ✅ VITE_APP_URL = https://www.truckopti.in (was Heroku sub-domain)
                             ✅ VITE_AUTH_EMAIL_OTP_ENABLED = true (was missing)
                             
                             REMAINING OPEN ISSUES:
                             🟡 BUG-007: Razorpay key — Heroku has REAL key (rzp_test_1DP5mmOlF5G5ag) but local .env still has placeholder
                             🟡 BUG-008: Phone OTP needs Twilio setup in Supabase → Auth → SMS Provider
                             🟡 Slug 337 MB > soft limit 300 MB (warning only; can be reduced by removing apps/ from git tracking)
───────────────────────────────────────────────────────────────────────
[2026-03-03 16:00] SONNET-001: 🐛 FULL BUTTON/FUNCTION AUDIT COMPLETE (20 pages)
                             
                             AUDIT RESULT: NOT EVERYTHING IS WORKING AS INTENDED.
                             Future agents must never assume a button works without verified proof.
                             See TESTING_PRINCIPLES.md for mandatory testing rules.
                             
                             BUGS FOUND AND FIXED THIS SESSION:
                             ✅ BUG-001 FIXED: Terms/Privacy href="#" on Login+Signup → /terms /privacy pages created
                             ✅ BUG-002 FIXED: Email OTP disabled (VITE_AUTH_EMAIL_OTP_ENABLED=false) → now true
                             ✅ BUG-003 FIXED: PricingPage 6 CTA buttons had NO onClick → navigate('/signup') + mailto
                             ✅ BUG-008 PARTIAL: Phone OTP silently failed → now shows friendly error message
                             
                             BUGS STILL OPEN (require human/production action):
                             🔴 BUG-004: Heroku deployment 7 commits stale (deploy: heroku login && git push heroku main)
                             🔴 BUG-005: Supabase Site URL = Heroku URL (fix: supabase dashboard → auth → url config)
                             🔴 BUG-007: Razorpay key placeholder rzp_test_XXXXXXXXXXXXXX (fix: real key from Razorpay dashboard)
                             🔴 BUG-008: Phone OTP needs Twilio setup in Supabase → Auth → SMS Provider
                             
                             PAGES VERIFIED WORKING (onClick handlers confirmed):
                             ✅ Dashboard, PackingPage, RoutesPage, TrackingPage
                             ✅ TrucksPage, CartonsPage, CustomersPage, ManagementPage
                             ✅ SaleOrdersPage, ProfilePage, InvoicePage (print/PDF/WhatsApp)
                             ✅ LoginPage (Google OAuth), SignupPage, OTPPage
                             ⚠️ PricingPage (fixed this session), CheckoutPage (payment broken: placeholder Razorpay key)
───────────────────────────────────────────────────────────────────────
[2026-03-03 14:00] SONNET-001: 🔍 DOMAIN + BROWSER AUDIT COMPLETE
                             ROOT CAUSE FOUND: Heroku URL still appearing because:
                             1. Heroku deployment is STALE (last deployed Feb-16; BATCH5/6/7 never pushed)
                             2. Supabase Dashboard Site URL still = Heroku URL (auth emails go to Heroku)
                             3. index.html og:url/og:image had Heroku URL (now fixed)
                             4. app.json VITE_APP_URL had wrong placeholder (now fixed)
                             
                             FIXES APPLIED (committed + pushed to GitHub):
                             ✅ frontend/index.html: og:url + og:image → https://www.truckopti.in
                             ✅ frontend/index.html: added mobile-web-app-capable meta tag
                             ✅ app.json: VITE_APP_URL → https://www.truckopti.in
                             ✅ All BATCH6/7 commits pushed to origin/main
                             
                             BROWSER SMOKE TEST RESULTS (www.truckopti.in):
                             ✅ F1 /login — Loads OK, no JS errors
                             ✅ F2 / → /login redirect — Auth guard working
                             ✅ F12 /pricing — DB-backed plans load correctly
                             ✅ F13 /checkout → /login redirect — Auth guard working
                             ✅ F14 /auth/callback → /login — Correct without token
                             ✅ 404 /nonexistent — NotFoundPage renders correctly
                             
                             BLOCKERS REQUIRING HUMAN ACTION:
                             🔴 Run `heroku login && git push heroku main` to deploy 6-commit backlog
                             🔴 Supabase Dashboard → https://supabase.com/dashboard/project/jbxncejtcbpcronndqlx/auth/url-configuration
                                 Set Site URL: https://www.truckopti.in
                                 Add Redirect URLs: https://www.truckopti.in/**, https://truckopti.in/**
───────────────────────────────────────────────────────────────────────
[2026-01-11 17:35] HAIKU-002: 🧪 Phase 1 Testing Complete (4/5 PASS)
                             ✅ Environment Setup: Node v22.17.1, npm, 338 tests passing
                             ❌ Phase 2-11 BLOCKED: test-webapp-server.js crashes on startup
                             
                             Full report: test-reports/2026-01-11-phase1-complete.json
───────────────────────────────────────────────────────────────────────
[2026-01-11 17:10] OPUS-001: ✅ Codebase Cleanup Complete
                            - Migrated test reports to JSON format (test-reports/)
                            - Consolidated issues into issues.json
                            - Moved testing docs to docs/testing/
                            - Removed redundant files and duplicate folders
                            - All 338 tests still passing
                            
                            New structure:
                            - test-reports/schema.json (report schema)
                            - test-reports/*.json (individual reports)
                            - issues.json (bug tracking)
                            - docs/testing/ (testing guides)
───────────────────────────────────────────────────────────────────────
[2026-01-11 17:00] HAIKU-001: ✅ Phase 1 Testing Complete (3/5 PASS, 1 PARTIAL, 1 FAIL)
                            Results in test-reports/2026-01-11-manual-test.json
                            Issues documented in issues.json
                            Signing out.
───────────────────────────────────────────────────────────────────────
[2026-01-11 16:25] OPUS-002: ✅ Framework test PASSED! Complete workflow verified:
                            1. Registered as agent ✓
                            2. Claimed file locks ✓
                            3. Created task ✓
                            4. Executed task (fixed folder name) ✓
                            5. Ran tests (338/338 pass) ✓
                            6. Completed task ✓
                            7. Released locks ✓
                            Framework is working correctly!
───────────────────────────────────────────────────────────────────────
[2026-01-11 16:24] OPUS-002: Testing the framework workflow. Will create a test 
                            task, claim it, execute it, and verify the process.
───────────────────────────────────────────────────────────────────────
[2026-01-11 16:30] OPUS-001: Framework restructured for universal use. 
                            Multi-agent coordination added. All AIs please 
                            read INDEX.md before starting work.
───────────────────────────────────────────────────────────────────────
```

### Message Format
```
[TIMESTAMP] AGENT-ID: Your message here.
                      Continue on next line if needed.
───────────────────────────────────────────────────────────────────────
```

---

## 🔒 FILE LOCKS

> **Claim files before editing to prevent conflicts.**

| File | Claimed By | Since | Purpose |
|------|------------|-------|---------|
| | | | |
| | | | |

### To Claim
```
Add row: | path/to/file.js | YOUR-ID | timestamp | what you're doing |
```

### To Release
```
Remove your row when done editing
```

---

## 📋 PROJECT STATE

| Field | Value |
|-------|-------|
| **Project** | TruckOpti |
| **Type** | Complex (SaaS Logistics Platform) |
| **Version** | 2.0.0 |
| **Tests** | Live interaction + build checks passing |
| **Status** | ✅ DEPLOYED |

---

## 🎯 CURRENT SPRINT

```
SPRINT: Launch Readiness + Subscription Completion
GOAL: Complete launch blockers, production auth/domain hardening, and subscription lifecycle
STATUS: 🟡 IN PROGRESS
```

### Sprint Tasks
- [x] Production deploy on Heroku
- [x] Custom domains configured (`truckopti.in`, `www.truckopti.in`)
- [x] SSL certificates issued via Heroku ACM for both domains
- [x] Added live button audit scripts and npm runner
- [x] Complete subscription lifecycle hook + expiry/usage UX
- [x] `useSubscription` hook 235 lines — trial/expiry/usage count
- [x] MobileLayout integrates plan badge
- [x] PricingPage DB-backed (Supabase subscription_plans)
- [x] Supabase integration test script 42/42 PASS
- [x] BATCH6 all 10 tasks: Razorpay fix, PaymentCallback, OG tags, robots, InvoicePage GST, security
- [x] **[DONE]** Re-deploy Heroku: v22 deployed (337 MB slug) — `.slugignore` added to fix 843 MB overflow
- [x] **[DONE]** Supabase Site URL → `https://www.truckopti.in` (Management API, allow-list includes apex + www + Heroku)
- [x] **[DONE]** Email templates live: magic_link + confirmation uploaded via curl (5.5 KB + 6 KB)
- [ ] Complete launch checklist Phase 6 (production keys, ToS, privacy policy)

---

## ✅ RECENTLY COMPLETED

| Date | Agent | Task | Result |
|------|-------|------|--------|
| Mar 03 | SONNET-001 | Full button/function audit (20 pages) | ✅ B1-B8 found; 6 critical fixed this session |
| Mar 03 | SONNET-001 | Fix: Email OTP disabled | ✅ VITE_AUTH_EMAIL_OTP_ENABLED=true in both .env files |
| Mar 03 | SONNET-001 | Fix: Silent phone OTP failure | ✅ user-friendly error message for phone_provider_disabled |
| Mar 03 | SONNET-001 | Fix: PricingPage 6 dead CTA buttons | ✅ All have onClick; navigate('/signup') + mailto: |
| Mar 03 | SONNET-001 | Fix: Terms/Privacy href="#" | ✅ TermsPage.tsx + PrivacyPage.tsx + App.tsx routes |
| Mar 03 | SONNET-001 | Branded OTP email templates | ✅ magic_link.html + confirmation.html committed |
| Mar 03 | SONNET-001 | BATCH6 + BATCH7 full implementation | ✅ Complete; committed + pushed to GitHub |
| Mar 03 | SONNET-001 | Heroku deploy v22 | ✅ .slugignore added (843→337 MB); BATCH5/6/7 live |
| Mar 03 | SONNET-001 | Supabase Site URL | ✅ Set to https://www.truckopti.in via Management API |
| Mar 03 | SONNET-001 | Email templates live | ✅ magic_link + confirmation uploaded (5.5 KB + 6 KB) |
| Mar 03 | SONNET-001 | Browser smoke test + domain audit | ✅ Heroku stale deploy root cause found |
| Mar 03 | SONNET-001 | index.html OG tags + app.json URL fix | ✅ Fixed; committed |
| Feb 22 | GPT-5.3-Codex | Cloudflare + Heroku domain validation | ✅ Complete |

---

## 📊 SYSTEM HEALTH

| Component | Status | Last Check | Deep Scan |
|-----------|--------|------------|-----------|
| Domain DNS | ✅ Active | 2026-03-03 | Cloudflare NS live |
| SSL (Heroku ACM) | ✅ Active | 2026-03-03 | Both domains cert issued |
| Live App (truckopti.in) | ✅ 200 OK | 2026-03-03 | Login/Pricing/404 all load |
| Heroku Deployment | ✅ v22 LIVE | 2026-03-03 | .slugignore added; 843→337 MB; BATCH5/6/7 deployed |
| Heroku Redirect (to truckopti.in) | ✅ WORKING | 2026-03-03 | Code now in deployed bundle (v22) |
| Supabase Site URL | ✅ FIXED | 2026-03-03 | https://www.truckopti.in — auth emails use custom domain |
| Frontend Build | ✅ Passing | 2026-03-03 | Built in 6.57s, 0 TS errors |
| Supabase Integration | ✅ 42/42 | 2026-03-03 | All 17 tables, RLS, realtime |
| OG Meta Tags | ✅ Fixed | 2026-03-03 | Now www.truckopti.in (was Heroku) |
| Launch Checklist | ⚠️ 29/40 | 2026-03-03 | Phase 3/4/5 done; Phase 6 pending |

### Quality Metrics Dashboard
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Apex Domain HTTPS | 200 | 200 | ✅ |
| WWW Domain HTTPS | 200 | 200 | ✅ |
| Heroku ACM Coverage | 2/2 | 2/2 | ✅ |
| Heroku Code Sync | v38 | Latest | ✅ Deployed 2026-03-05 |
| Supabase Auth Site URL | truckopti.in | truckopti.in | ✅ Fixed (v22 session) |
| OG Tags Domain | truckopti.in | truckopti.in | ✅ |
| Launch Checklist Completion | 35/40 | 40/40 | ⚠️ Phase 2 active trip + Phase 3 pending |

---

## ⚠️ KNOWN ISSUES

> **Full issue details in `issues.json`**

| ID | Severity | Description | Status |
|----|----------|-------------|--------|
| BUG-004 | ✅ FIXED | Heroku v35 deployed 2026-03-04 — all Phase 0 fixes live | Fixed |
| BUG-005 | ✅ FIXED | Supabase Site URL = https://www.truckopti.in — fixed in v22 session | Fixed |
| BUG-007 | 🔴 CRITICAL | `VITE_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX` placeholder — payment flow non-functional | Open |
| BUG-008 | 🟠 HIGH | SMS/WhatsApp OTP non-functional — Twilio not configured in Supabase. Error now shown to user (fixed), but Twilio setup needed | Partial |
| BUG-006 | 🟡 LOW | apple-mobile-web-app-capable meta tag deprecated (mobile-web-app-capable added as fallback) | Fixed |
| BUG-001 | ✅ FIXED | Terms/Privacy links `href="#"` on Login + Signup pages | Fixed - /terms + /privacy pages created |
| BUG-002 | ✅ FIXED | Email OTP disabled (`VITE_AUTH_EMAIL_OTP_ENABLED=false`) | Fixed - enabled in .env + .env.production |
| BUG-003 | ✅ FIXED | PricingPage: 6 CTA buttons had no `onClick` handler | Fixed - navigate('/signup') + mailto |

📋 **See:** [issues.json](issues.json) for full details

---

## 🔧 ENVIRONMENT

```yaml
# Project Config
project: truckopti
type: complex
language: typescript + python
runtime: node 20.x
database: postgresql (supabase)
hosting: heroku + cloudflare dns

# Test Config
framework: vitest + live browser audit scripts
tests: build + route + button interaction checks
coverage: pending formal refresh

# Deploy Config
github: prakashgarg91/Truck_Opti
heroku: truck-opti-app
production: https://www.truckopti.in/
```

### Validation Commands
```bash
npm --prefix frontend run build
npm run test:live-buttons
python test_e2e.py
python interactive_webapp_test.py
```

---

## 📈 DEPLOYMENT HISTORY

| Version | Date | Deployer | Status | Notes |
|---------|------|----------|--------|-------|
| v38 (62f56dab) | 2026-03-05 | SONNET-002/003 | ✅ Success | Phase 1 complete + Phase 2 core: Driver portal, Agency reg, Admin agencies, DriverLayout |
| v37 (8d62d725) | 2026-03-05 | SONNET-002 | ✅ Success | ProfilePage merge bug, TrucksPage overflow, formatCurrency, ROADMAP updates |
| v36 (671834b5) | 2026-03-05 | SONNET-002 | ✅ Success | Phase 1: driver module, company profile, admin queue, formatters |
| v35 (9a3de66d) | 2026-03-04 | SONNET-001/002 | ✅ Success | SW skipWaiting, route duration fix, packing vol%, invoice company banner |
| v34 (780bd70a) | 2026-03-04 | SONNET-001 | ✅ Success | sale_order_items order_id fix, auto product_code |
| v33 | 2026-03-04 | SONNET-001 | ✅ Success | JWT admin role detection |
| v22 | 2026-03-03 | SONNET-001 | ✅ Success | .slugignore (843→337 MB), BATCH5/6/7 live |
| 9fa22858 | 2026-02-22 | GPT-5.3-Codex | ✅ Success | Added bug-mapper utilities |
| 212c5325 | 2026-02-22 | GPT-5.3-Codex | ✅ Success | Profile page company info enhancements |

---

## 📌 HANDOFF NOTES

> **Leave notes here for the next AI taking over.**

```
[2026-02-22] GPT-5.3-Codex → Next AI:
- Production app is reachable on both `truckopti.in` and `www.truckopti.in`
- Heroku ACM certificates are issued for both custom domains
- Launch readiness still blocked by incomplete subscription lifecycle and checklist items
- Use `0.dev-matrix/BATCH7_AGENT_CONTINUATION_PROMPT.md` as the execution prompt
- Keep commits clean: avoid local DB and machine-specific files
```

---

## 🚨 EMERGENCY CONTACTS

```
If stuck:
1. Read INDEX.md again
2. Check PATTERNS.md for similar solutions
3. Ask Lead AI (if present)
4. Flag in Agent Messages for help
```

---

**Last Updated:** 2026-03-05 by SONNET-003 (v38: Phase 1 COMPLETE + Phase 2 core deployed; Phase 2.3 Active Trip + Phase 3 Agency Portal in progress)
