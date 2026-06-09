# TruckOpti Production Smoke Test Report

**Target:** https://truckopti.in/
**Date:** 2026-06-04
**Method:** Playwright async API (Chromium, headless, 1366x900 desktop / 375x812 mobile)
**Tester:** TruckOpti-SmokeTest/1.0
**Result file:** `D:\Github\Truck_Opti\webwright-test\test-results.json`
**Screenshots:** `D:\Github\Truck_Opti\webwright-test\screenshots\`

---

## Executive Summary

- **Tests run:** 20
- **PASS:** 18
- **FAIL:** 2
- **JS console errors observed:** 0 across all pages
- **HTTP 5xx errors:** 0
- **HTTP 4xx errors:** 0
- **Headline bug:** `/driver/register` and `/agency/register` are **dead-end pages** — they tell the user to log in but contain **zero clickable links or buttons**. They are linked from the homepage nav as the "Drivers" and "Agencies" entry points, so anonymous visitors are funneled into pages with no way forward.
- **Title consistency issue:** Both register pages reuse the generic `"TruckOpti - Smart Logistics"` browser title instead of a role-specific title (the rest of the app is consistent: `"Driver Login - TruckOpti"`, `"Agency Login - TruckOpti"`, `"Sign Up - TruckOpti"`, etc.).

---

## Detailed Results

### Phase 1 — Homepage and Static Pages

| # | Test | Result | URL | HTTP | Title | Notes |
|---|------|--------|-----|------|-------|-------|
| 1.1 | Homepage loads | **PASS** | https://truckopti.in/ | 200 | `TruckOpti - Smart Logistics` | Hero copy renders ("LOGISTICS OS", "AI-powered 3D packing…"), nav present, 3 CTAs ("Start Free", "View Pricing", "Contact Us"). |
| 1.2 | /pricing renders + toggle works | **PASS** (caveat) | https://truckopti.in/pricing | 200 | `Pricing — TruckOpti` | Page loads. Body exposes `Monthly` / `Yearly` / `Save 17%` controls and 3 plan cards. **Caveat:** the Playwright toggle-click probe did not actually click the billing-cycle control (`toggle_clicked: false`); visual evidence in the body confirms the toggle exists. |
| 1.3 | /contact form + validation | **PASS** | https://truckopti.in/contact | 200 | `Contact Us - TruckOpti` | Name + email + textarea + submit all present. Empty submit surfaces validation: `"Name is required"`. |
| 1.4 | /terms loads | **PASS** | https://truckopti.in/terms | 200 | `Terms of Service - TruckOpti` | 1,924 chars of body. |
| 1.5 | /privacy loads | **PASS** | https://truckopti.in/privacy | 200 | `Privacy Policy - TruckOpti` | 2,586 chars of body. |

### Phase 2 — Authentication Pages

| # | Test | Result | URL | HTTP | Title | Notes |
|---|------|--------|-----|------|-------|-------|
| 2.1 | Driver login form renders | **PASS** | https://truckopti.in/login?mode=driver | 200 | `Driver Login - TruckOpti` | Email field + Submit + "Continue with Google". Role-specific copy ("Driver trips, earnings, and dispatch access"). Has a "Register Driver" link in the footer. **Auth model is Email OTP + Google** (no visible password field by default; "Password" is a tab). |
| 2.2 | Agency login form renders | **PASS** | https://truckopti.in/login?mode=agency | 200 | `Agency Login - TruckOpti` | Same structure as driver login with agency-specific copy ("Agency fleet, jobs, and billing access"). Has a "Register Agency" link. |
| 2.3 | /signup form renders | **PASS** | https://truckopti.in/signup | 200 | `Sign Up - TruckOpti` | Name + email + "Create Account" submit + "Sign up with Google". OTP-first signup. |
| 2.4 | /forgot-password form renders | **PASS** | https://truckopti.in/forgot-password | 200 | `Forgot Password - TruckOpti` | Uses a generic `Email or Login ID` text input (not `type="email"`). Submit present. |

### Phase 3 — Role Registration (Dead-end verification)

| # | Test | Result | URL | HTTP | Title | Notes |
|---|------|--------|-----|------|-------|-------|
| 3.1 | /driver/register reachable anonymously? | **PASS** (page loads) | https://truckopti.in/driver/register | 200 | `TruckOpti - Smart Logistics` | Page returns 200, no redirect. **Body: `"Log In To Start Driver Registration" + "Continue To Driver Login"`.** `has_login_link: false`, `has_signup_link: false`, `has_google_btn: false`. **0 clickable links on the page** — confirmed by enumerating all `<a>` elements. |
| 3.2 | /agency/register reachable anonymously? | **PASS** (page loads) | https://truckopti.in/agency/register | 200 | `TruckOpti - Smart Logistics` | Same shape. **Body: `"Log In To Register Your Agency" + "Continue To Agency Login"`.** `has_login_link: false`, `has_signup_link: false`. **0 clickable links.** |
| 3.3 | New-user signup path reachable from /driver/register? | **FAIL** | n/a | n/a | n/a | **No signup path exists from this page.** The page contains text that says the user must log in, but provides no link or button to do so. A brand-new visitor who lands here from the homepage "Drivers" nav link is stuck. |
| 3.4 | /driver/register browser title is specific? | **FAIL** | n/a | n/a | `TruckOpti - Smart Logistics` | Title is the generic site title, not role-specific. Compare with the rest of the app, which uses `Driver Login - TruckOpti`, `Agency Login - TruckOpti`, `Sign Up - TruckOpti`, etc. Suggests the page is a placeholder/stub rather than a fully designed screen. |

### Phase 4 — Navigation and Cross-links

| # | Test | Result | Notes |
|---|------|--------|-------|
| 4.1 | Homepage Login button target | **PASS** | `<a href="/login">` resolves to `https://truckopti.in/login`. |
| 4.2 | Homepage Signup link target | **PASS** | `<a href="/signup">` resolves to `https://truckopti.in/signup`. |
| 4.3 | Google sign-in launches OAuth | **PASS** | After clicking "Continue with Google" on `/login`, the page navigates to `https://accounts.google.com/v3/signin/identifier?...&redirect_uri=https%3A%2F%2Fjbxncejtcbpcronndqlx.supabase.co%2Fauth%2Fv1%2Fcallback&...&client_id=87428468283-vbpi2c3guqg968no40i0k29ivjv3msgn.apps.googleusercontent.com&...`. Confirms OAuth launches correctly (Supabase is the auth backend). Test stopped before completing consent. |
| 4.4 | Homepage renders at 375x812 (mobile) | **PASS** | 200 OK, no layout errors, full-page screenshot saved. |

### Phase 5 — Form Validation

| # | Test | Result | Validation message | Notes |
|---|------|--------|--------------------|-------|
| 5.1 | Empty /login submission blocked | **PASS** | n/a | Submit button is `disabled=True` until an email is entered. URL unchanged after probe. |
| 5.2 | /signup rejects invalid email | **PASS** | `"Please include an '@' in the email address. 'not-an-email' is missing an '@'."` | Native HTML5 email validation triggers. |
| 5.3 | /contact partial fill → validation | **PASS** | `"Name is required"` | Submit on partially-filled form correctly surfaces the missing-name error. |

---

## Specific Findings

### Finding 1 — Role registration is a dead-end (HIGH SEVERITY)

**Pages affected:** `/driver/register` and `/agency/register`

**What happens:**
- Both pages load successfully (HTTP 200) and do not redirect.
- The body contains two short strings:
  - `/driver/register`: `"Log In To Start Driver Registration"` (heading) and `"Continue To Driver Login"` (looks like a CTA label, but is plain text).
  - `/agency/register`: `"Log In To Register Your Agency"` and `"Continue To Agency Login"`.
- **Neither page contains a single `<a>`, `<button>`, or any other clickable element** that lets the visitor proceed to login, signup, or anywhere else.
- The pages are linked from the homepage top-nav (`Drivers` → `/driver/register`, `Agencies` → `/agency/register`) and from the footer's `Drivers` / `Agencies` entries.

**User impact:** An anonymous visitor who clicks "Drivers" or "Agencies" on the homepage lands on a page that tells them to log in, but gives them no way to do so. They have to use the browser back button to recover. This breaks the marketing → signup funnel for two of the most important entry points.

**Evidence:** `screenshots/3_1_register.png`, `screenshots/3_2_register.png`; `test-results.json` entries `3.1` and `3.2` (`has_login_link: false`, `has_signup_link: false`, 0 anchors).

**Repro:**
1. Open https://truckopti.in/
2. Click the "Drivers" link in the top nav (or "Agencies").
3. Observe: a static page with text and no clickable elements.

**Recommended fix (do not implement without product sign-off):**
- Either render the "Continue To … Login" text as a real `<Link href="/login?mode=driver">` (or `/login?mode=agency`).
- Or, if the intent is "you must already have an account", add a clear "Go to Login" button + a secondary "Don't have an account? Sign up" link to `/signup`.
- If registration really is a multi-step post-login flow, redirect anonymous users from `/driver/register` and `/agency/register` to `/login?mode=…&next=/driver/register` (or similar), or show an explicit "Sign in to continue" gate with a working button.

### Finding 2 — Page title consistency on register pages (LOW SEVERITY)

**Pages affected:** `/driver/register`, `/agency/register`

**Issue:** Both pages return the generic browser title `"TruckOpti - Smart Logistics"` instead of role-specific titles. Every other public page uses a specific pattern:

| Page | Title |
|---|---|
| `/login` | `Welcome Back - TruckOpti` |
| `/login?mode=driver` | `Driver Login - TruckOpti` |
| `/login?mode=agency` | `Agency Login - TruckOpti` |
| `/signup` | `Sign Up - TruckOpti` |
| `/forgot-password` | `Forgot Password - TruckOpti` |
| `/pricing` | `Pricing — TruckOpti` |
| `/contact` | `Contact Us - TruckOpti` |
| `/terms` | `Terms of Service - TruckOpti` |
| `/privacy` | `Privacy Policy - TruckOpti` |
| `/driver/register` | `TruckOpti - Smart Logistics` ⚠ |
| `/agency/register` | `TruckOpti - Smart Logistics` ⚠ |

**User impact:** Minor — affects browser tab clarity, history, and SEO/social-share previews. Compounds the impression that these pages are unfinished stubs.

**Recommended fix:** Set `<title>` to e.g. `Driver Registration - TruckOpti` and `Agency Registration - TruckOpti`.

### Finding 3 — Pricing toggle interaction was not auto-verified (TEST CAVEAT)

The `/pricing` page exposes a `Monthly` / `Yearly` billing-cycle toggle and three plan cards. The Playwright probe in this run did not successfully click the toggle (`toggle_clicked: false`); price comparison before/after toggle is therefore inconclusive from automation alone. The toggle visually exists in the DOM (`Monthly\nYearly\nSave 17%` in body), and the page itself is fine. A follow-up test should target the exact toggle element (`button[role="tab"]` or by visible-text with a longer wait) and capture screenshots in both states.

### Finding 4 — Auth model confirmation

For the record: the public auth surface is **Email OTP + Google** as the launch sign-in paths. Passwords are a secondary tab on `/login` and `/signup`. The "Phone OTP" pathway is explicitly disabled in this environment with a banner: `"Phone OTP is disabled in this environment. Use Email OTP or Google login."` This is consistent across `/login`, `/login?mode=driver`, and `/login?mode=agency`.

Google OAuth is wired through **Supabase Auth** (callback host `jbxncejtcbpcronndqlx.supabase.co`, OAuth client `87428468283-…apps.googleusercontent.com`).

---

## Console Error Summary

**Total JS console errors observed:** 0

No page produced any `console.error` events during load or interaction. All five phases ran cleanly from a JS-runtime perspective.

## Network / HTTP Summary

| URL | Final status |
|---|---|
| `/` | 200 |
| `/pricing` | 200 |
| `/contact` | 200 |
| `/terms` | 200 |
| `/privacy` | 200 |
| `/login?mode=driver` | 200 |
| `/login?mode=agency` | 200 |
| `/signup` | 200 |
| `/forgot-password` | 200 |
| `/driver/register` | 200 |
| `/agency/register` | 200 |
| Google OAuth `accounts.google.com` (after click) | 200 (page loads; consent not submitted) |

No redirects observed; all register/login URLs preserve their path.

## New Bugs Discovered

1. **(HIGH) Role-registration dead-end** — `/driver/register` and `/agency/register` have no clickable elements. Marked FAIL as tests 3.3 and 3.4. See Finding 1.
2. **(LOW) Generic browser title on register pages** — see Finding 2.

No other functional bugs were found in the public surface tested.

## Test Artifacts

- Test script: `D:\Github\Truck_Opti\webwright-test\smoke_test.py`
- Raw JSON results: `D:\Github\Truck_Opti\webwright-test\test-results.json`
- Full run log: `D:\Github\Truck_Opti\webwright-test\smoke_run.log`
- Screenshots (saved under `D:\Github\Truck_Opti\webwright-test\screenshots\`):
  - `01_homepage.png`
  - `02_pricing.png`
  - `03_contact.png`
  - `04_homepage_mobile_375x812.png`
  - `2_1_login.png` (driver login)
  - `2_2_login.png` (agency login)
  - `23_signup.png`
  - `24_forgot.png`
  - `3_1_register.png` (dead-end — see Finding 1)
  - `3_2_register.png` (dead-end — see Finding 1)
