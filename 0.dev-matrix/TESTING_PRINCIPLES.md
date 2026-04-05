# 🧪 TESTING PRINCIPLES

> **Mandatory testing rules for all AI agents and developers.**
> **Read this BEFORE marking any feature or task as complete.**
> 
> Last Updated: 2026-04-05 | Authors: SONNET-001 (Claude Sonnet 4.6), GPT-003 (GPT-5.4)
> Trigger: Full button/function audit found 8 critical bugs that were believed to be "working"

---

## ⚠️ THE CORE PRINCIPLE

> **Never assume a button or feature works without verified end-to-end proof.**
> **Do not mark a task complete unless you have confirmed the button works, the API call succeeds, and the user sees the correct outcome.**

This principle was added after a full audit of all 20 frontend pages revealed that:
- 6 CTA buttons on PricingPage had **no `onClick` handlers at all** (code was written, shipped, and believed to be "done")
- Email OTP was **disabled via env var** yet the feature was listed as "complete"
- Phone OTP **silently failed** with `phone_provider_disabled` and showed nothing to the user
- Terms/Privacy links pointed to `href="#"` (JavaScript void link) with no page behind them

---

## ✅ MANDATORY PRE-COMPLETE CHECKLIST

Before moving any task to COMPLETED status, confirm ALL of the following:

### For UI Buttons
- [ ] Button has an `onClick` handler (not missing, not commented out)
- [ ] Clicking the button performs the expected action (navigate, open modal, submit, etc.)
- [ ] Button is not permanently `disabled` due to a missing env var or feature flag
- [ ] Button shows a loading state when an async operation is in progress
- [ ] Button shows an error state/message if the operation fails
- [ ] Button is accessible (has a descriptive label or aria-label)

### For Forms / API Calls
- [ ] Form submission calls the correct API endpoint
- [ ] API endpoint exists and returns expected data in the current environment
- [ ] Error from the API is caught and displayed to the user (not silently swallowed)
- [ ] Success state is shown to the user (toast, redirect, modal close, etc.)
- [ ] Validation prevents invalid data from being submitted

### For Auth / Feature Flags
- [ ] Required env vars are set in BOTH `.env` (dev) AND `.env.production` (prod)
- [ ] Feature is NOT gated behind a flag that is currently set to `false`
- [ ] Third-party services referenced (Twilio, Razorpay, Google Maps) are actually configured
- [ ] If a service is NOT configured, the user sees a helpful error — not a silent failure

### For New Pages / Routes
- [ ] Route is registered in `App.tsx`
- [ ] Page loads without console errors
- [ ] Page is reachable from relevant navigation links
- [ ] Page has a `document.title` set

---

## 🔍 HOW TO AUDIT A PAGE

When testing any page, run through this script:

```
1. OPEN PAGE
   - Does it load without crashing?
   - Are there console errors?

2. FOR EVERY BUTTON ON THE PAGE:
   a. Read the source code — does it have an onClick?
   b. Click it in the browser — does something happen?
   c. If it calls an API — check the Network tab for the actual request
   d. If it shows an error — is the error message helpful?

3. FOR EVERY FORM:
   a. Submit with valid data — does it work?
   b. Submit with invalid data — is an error shown?
   c. What happens if the API is down?

4. FOR EVERY LINK:
   a. Does it navigate to a real page (not href="#")?
   b. Does the target page exist?

5. ENVIRONMENT CHECK:
   a. Are feature flags enabled in .env?
   b. Are third-party service keys real (not placeholders)?
```

---

## 📋 KNOWN BUGS FROM FULL AUDIT (2026-03-03)

| Bug | Page | Severity | Description | Status |
|-----|------|----------|-------------|--------|
| BUG-001 | Login + Signup | HIGH | Terms/Privacy links → `href="#"` (dead) | ✅ FIXED |
| BUG-002 | Login + Signup | CRITICAL | Email OTP fully disabled (`VITE_AUTH_EMAIL_OTP_ENABLED=false`) | ✅ FIXED |
| BUG-003 | Pricing | HIGH | 6 CTA buttons (Start Free, 4× Get Started, Contact Sales, Talk to Us) had no `onClick` | ✅ FIXED |
| BUG-007 | Checkout | CRITICAL | `VITE_RAZORPAY_KEY_ID=rzp_test_XXXXXXXXXXXXXX` placeholder — payment fails | 🔴 OPEN |
| BUG-008 | Login | HIGH | Phone/WhatsApp OTP silently failed (Twilio not configured) — error now shown, but Twilio still needed | ⚠️ PARTIAL |
| BUG-004 | Global | CRITICAL | Heroku deployment 7 commits stale — production runs old code | ✅ FIXED (2026-04-01 `552b424c` / `f8e93f07`) |
| BUG-005 | Auth system | CRITICAL | Supabase Site URL = Heroku URL — OTP emails link to wrong domain | ✅ FIXED (2026-04-01 `70e764c5`) |

---

## 🤖 AI AGENT INSTRUCTIONS

### NEVER do the following:
- Mark a task complete by saying "I added the onClick handler" without TESTING it
- Assume a working implementation from a previous session is still working
- Skip testing because "it worked last time"
- Close a bug as fixed based only on writing code (re-run the flow)

### ALWAYS do the following:
- Start sessions by checking STATE.md KNOWN ISSUES and this document
- After implementing a button, trace the full user flow (UI → API → DB → response → UI update)
- Add new bugs found to STATE.md KNOWN ISSUES table immediately
- If you can't test a feature (e.g., no Twilio keys), document it as "untested" not "working"

### TESTING-FIRST WORKFLOW

```
IMPLEMENT → TEST → DOCUMENT → COMPLETE
    │           │
    │           └─ If broken: fix and re-test before moving on
    │
    └─ Before implementing: check if similar feature already has bugs
```

---

## 📁 RELATED DOCUMENTS

- [STATE.md](STATE.md) — Live bug table and system health
- [TASK.md](TASK.md) — Bug fix tasks queue
- [TEST.md](TEST.md) — Test execution instructions
- [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) — Pre-launch quality gates

---

**This document is REQUIRED READING for any new AI agent joining the project.**
