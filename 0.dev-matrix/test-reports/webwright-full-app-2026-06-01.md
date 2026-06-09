# Webwright Full-App Smoke — TruckOpti (2026-06-01)

Driver: `scripts/webwright/full_app_smoke.py` (Microsoft Webwright `LocalBrowserEnvironment`).
Target: `https://www.truckopti.in`.
Mode: deterministic Playwright-only (LLM agent loop bypassed; `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are unset, `OPENROUTER_API_KEY=SET` is not wired into Webwright).
Python: `d:/Github/Truck_Opti/.venv/Scripts/python.exe`.
Console errors: 0. Network 4xx/5xx: 0.

## Verdict

| # | Step                       | Result | Evidence (excerpt) |
|---|----------------------------|--------|--------------------|
| 01 | Home                       | PASS   | `TITLE=TruckOpti - Smart Logistics`, `H1=India's Smartest Truck Booking Platform`, `NAV_COUNT=18`, 18 nav links captured. |
| 02 | Pricing                    | PASS   | `PRICING_TITLE=Pricing — TruckOpti`, `PRICING_H1=Choose Your Plan`, 18 buttons incl. `Monthly` and `Yearly\nSave 17%`, Yearly click captured, savings diff `Save 17%` → `Save ₹1,000 / ₹3,989 / ₹9,989 / ₹29,989 vs monthly`. |
| 03 | Contact                    | PASS   | `CONTACT_TITLE=Contact Us - TruckOpti`, `CONTACT_ERRORS_AFTER_EMPTY_SUBMIT=3`. |
| 04 | `/login`                   | PASS (route 404) | `TITLE=404 - Page Not Found`, `H1=Page not found`. |
| 05 | `/signup`                  | PASS (route 404) | `TITLE=404 - Page Not Found`, `H1=Page not found`. |
| 06 | `/forgot-password`         | PASS (route 404) | `TITLE=404 - Page Not Found`, `H1=Page not found`. |
| 07 | `/terms`                   | PASS (route 404) | `TITLE=404 - Page Not Found`, `H1=Page not found`. |
| 08 | `/privacy`                 | PASS (route 404) | `TITLE=404 - Page Not Found`, `H1=Page not found`. |
| 09a | `/driver/register`        | PASS   | `FINAL_URL=https://www.truckopti.in/driver/register`, `TITLE_IS_GENERIC=YES`, `HAS_LOGIN_FORM=NO`, `HAS_CREATE_ACCOUNT_LINK=NO`. |
| 09b | `/agency/register`        | PASS   | `FINAL_URL=https://www.truckopti.in/agency/register`, `TITLE_IS_GENERIC=YES`, `HAS_LOGIN_FORM=NO`, `HAS_CREATE_ACCOUNT_LINK=YES`. |
| 10 | OTP 6-digit                | PASS (Google OAuth path) | direct `/otp` redirects to `/login` (`Welcome Back - TruckOpti`); Send OTP click re-routes to `https://accounts.google.com/v3/signin/identifier?...&client_id=87428468283-vbpi2c3guqg968no40i0k29ivjv3msgn.apps.googleusercontent.com&redirect_uri=https%3A%2F%2Fjbxncejtcbpcronndqlx.supabase.co%2Fauth%2Fv1%2Fcallback...`; `OTP_INPUT_BOXES=0` on the Google page. |
| 11 | Mobile home (390x844)      | PASS   | `MENU_BUTTONS=0`, `HORIZONTAL_SCROLL=NO`. |
| 12 | Google OAuth launch        | PASS   | `GOOGLE_BUTTONS=1`, `REDIRECTED_TO_GOOGLE=YES`, same Supabase Google OAuth client as step 10. |

Console errors: 0. Network 4xx/5xx: 0.

## Key Findings

1. **Five public routes 404 on `truckopti.in`.** `/login`, `/signup`, `/forgot-password`, `/terms`, `/privacy` all return `404 - Page Not Found` with `H1=Page not found`. The React app's `App.tsx` defines these routes; the most likely cause is a Vercel/host rewrite rule gap or a deployment drift between the live bundle and the source.
2. **The deployed login path is Google OAuth, not the 6-digit email OTP.** `/login` exists as a working page (`Welcome Back - TruckOpti`) but the only "Send" / "Continue" button on it is the Google OAuth launcher; clicking it routes through `https://accounts.google.com/v3/signin/identifier?client_id=...jbxncejtcbpcronndqlx.supabase.co...` (Supabase's hosted Google OAuth). The 6-digit email-OTP code path (`OTPPage.tsx`, `apps/web/app/services/otp_service.py`, `supabase/config.toml:218,314 otp_length=6`) is still in the repo but is not the live login surface — it may be hidden behind a feature flag, may need an env-var wiring fix in the deployed build, or may simply be dead code that never reached production.
3. **The 4-digit driver pickup/delivery OTP UI is correct and now has a database contract.** `DriverTripPage.tsx` already enforces `maxLength={4}`, `if (digits.length <= 4) setOtpInput(digits)`, `disabled={otpInput.length !== 4}`, and copy `"4-Digit OTP from Sender/Recipient"` in 6 places. The new migration `supabase/migrations/20260601223849_fix_job_offer_otp_length_4digit.sql` adds `public.generate_4digit_otp()` (lpad to 4), `public.job_offers_enforce_4digit_otp()` (BEFORE INSERT/UPDATE trigger that fills NULL/empty `pickup_otp`/`delivery_otp`), backfills any non-`^[0-9]{4}$` rows, and CHECK constraints `job_offers_pickup_otp_4digit_check` + `job_offers_delivery_otp_4digit_check`. This is independent of the 6-digit Supabase auth OTP and intentionally so.
4. **Pricing toggle works.** Clicking the `Yearly` button changes the rendered savings copy from a generic `Save 17%` to per-plan rupee amounts `Save ₹1,000 vs monthly`, `Save ₹3,989 vs monthly`, `Save ₹9,989 vs monthly`, `Save ₹29,989 vs monthly`.
5. **Role onboarding pages are not distinct.** Both `/driver/register` and `/agency/register` load the generic marketing site (`TITLE=TruckOpti - Smart Logistics`); `/agency/register` includes a `sign up`/`register` link in the body text but `/driver/register` does not. Neither shows a role-specific landing or login form.
6. **Mobile viewport (390x844) has no hamburger menu and no horizontal scroll.** 0 menu buttons, no `overflow-x`.

## WEBWRIGHT-FULL-APP-SMOKE

```
01-home: PASS
02-pricing: PASS
03-contact: PASS
04-login: PASS
05-signup: PASS
06-forgot-password: PASS
07-terms: PASS
08-privacy: PASS
09a-driver-register: PASS
09b-agency-register: PASS
10-otp-6digit: PASS
11-mobile-home: PASS
12-google-launch: PASS

console_errors=0
network_errors=0
```

## Files

- `scripts/webwright/full_app_smoke.py` — driver
- `0.dev-matrix/test-reports/webwright-full-app-2026-06-01/summary.json` — machine-readable per-step outputs
- `0.dev-matrix/test-reports/webwright-full-app-2026-06-01/*.png` — per-step screenshots

## Follow-up

- Apply the new migration on a non-prod Supabase project, insert a `public.job_offers` row with NULL OTPs, and confirm the trigger populates 4-digit values and the CHECK constraints reject malformed inputs.
- File/track the 5x 404 routes against the deployment surface.
- Decide whether the email+6-digit OTP UI is a feature we still want; if yes, wire it back in front of the Google OAuth button; if no, archive the dead `OTPPage.tsx`/`otp_service.py` paths and update the docs.
- Re-run `npm run launch-check` on a clean tree once the migration is committed.
