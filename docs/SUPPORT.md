# TruckOpti Support Guide

This guide is for transport agencies and truck drivers using TruckOpti. It explains how to reach support and how to fix the most common problems yourself, in plain words. Every fix below comes from the application code — the file or route is named so your IT person can check it.

Companion guides: `docs/USER-GUIDE-AGENCY.md` (agency portal) and `docs/USER-GUIDE-DRIVER.md` (driver app).

---

## 1. How to contact support

| Channel | Details |
| --- | --- |
| Support phone | **[OWNER TO SET — support phone number]** |
| Support email | **[OWNER TO SET — support email address]** |
| Support hours | **[OWNER TO SET — e.g. Mon–Sat, 10:00–19:00 IST]** |

The app already shows an owner-configured phone number and email on its Support and Contact screens. Those values are maintained in one place, `frontend/src/config/support.ts`, and every screen reads from there — this page must not invent a different number.

Ways to reach us inside the app:

- **Signed-in users (any role):** open **Support** (`/support`). The page has a contact form — name, email and message. If sending fails, your message is saved on the device so you can retry. Source: `frontend/src/pages/ContactPage.tsx`.
- **Driver app:** a **Support** call button appears on Home and on the active trip page. Tapping it dials support directly. Source: `frontend/src/pages/DriverDashboardPage.tsx`, `frontend/src/pages/DriverTripPage.tsx`.
- **Email:** write to the support email above with the details listed in section 3.

## 2. Response times

| Severity | Example | First response |
| --- | --- | --- |
| Blocking — cannot sign in, trip stuck mid-journey | Driver cannot complete delivery | **[OWNER TO SET — e.g. within 2 hours in support hours]** |
| High — cannot work in the portal | Job cannot be assigned | **[OWNER TO SET — e.g. same business day]** |
| Normal — questions, corrections, reports | Profile correction, statement export | **[OWNER TO SET — e.g. within 2 business days]** |

Application and KYC review times are set by the app screens, not by this table: driver applications state a review within 24–48 hours, driver KYC usually completes within 24 hours, and agency approvals usually come within 2–3 business days.

## 3. What to include when you contact support

- Your registered mobile number or email, and your role (agency, driver, staff).
- For agency approval questions: company name and registration date.
- For a specific job: the pickup and drop locations and the date of the offer.
- The exact message the app showed, if any. A photo of the screen helps.
- Do **not** send passwords, OTP codes or bank details. See section 6.

## 4. Before you contact us — two quick checks

1. **Check your internet.** Uploads, offers and cloud pages need a working connection. The driver KYC page warns you when you are offline (`frontend/src/pages/DriverKycPage.tsx`).
2. **Refresh the app.** Close and reopen it, or pull the page to refresh. Pending job offers and active trips are restored from the server — nothing is lost by restarting (`frontend/src/pages/DriverDashboardPage.tsx`).

---

## 5. The twelve most common problems

### 1. Cannot sign in

**What you see:** the login page (`/login`) rejects you, or the method you expect is missing.

**What to do:** TruckOpti sign-in supports **Google**, a **6-digit email OTP**, and password only for office/reviewer accounts provisioned by the platform team. Phone OTP (SMS/WhatsApp) is currently switched off until the platform phone provider is configured — if you try it, the app itself tells you to use Email OTP or Google sign-in instead. Driver, agency, office and partner surfaces each show the methods valid for that role. Source: `frontend/src/pages/auth/LoginPage.tsx`, `frontend/src/services/supabaseApi.ts`.

### 2. Sign-in OTP does not arrive, or is rejected

**What you see:** you requested a code but no email arrived, or the app says the code is wrong.

**What to do:** the code is 6 digits and **expires in 10 minutes** — request a fresh one rather than re-typing an old code. Check the spam folder. If you request too many codes in a short time, the app shows "Too many OTP requests. Please wait a minute and try again." — wait a minute, then use **Resend**. If email OTP still fails, use **Continue with Google** on the login page. Source: `frontend/src/pages/auth/OTPPage.tsx`, `frontend/src/services/supabaseApi.ts`.

### 3. Agency approval is still pending

**What you see:** the agency Home screen (`/agency/dashboard`) shows **Verification Pending**, or portal actions say "Action not permitted".

**What to do:** this is normal for the first 2–3 business days after registering (`/agency/register`). Most fleet, driver and billing actions need the **Verified** status. If the status shows **Application Rejected** or **Account Suspended**, or pending has crossed three business days, contact support with your company name and registration date. Do not register a second application for the same company. Source: `frontend/src/pages/AgencyDashboardPage.tsx`, `frontend/src/pages/AgencyRegisterPage.tsx`.

### 4. Driver application not approved yet

**What you see:** driver Home shows **Verification Pending** (or **Application Rejected** / **Account Suspended**).

**What to do:** the platform team reviews driver applications within 24–48 hours of submitting `/driver/register`. Rejections usually come from unclear licence or RC photos — see problem 11 and re-upload better photos. The server blocks job acceptance for any driver whose status is not approved, so waiting or fixing documents is the only path; support can tell you the exact reason. Source: `frontend/src/pages/DriverDashboardPage.tsx`, `frontend/src/pages/DriverRegisterPage.tsx`, `supabase/migrations/20261003010000_atomic_job_offer_response.sql`.

### 5. No job offers coming

**What you see:** driver Home says "Looking for jobs..." but no offer arrives.

**What to do:** check all three gates on your side: status is **Verified**, the **Online/Offline** switch is set to Online, and all **four** KYC documents show **Accepted** — the app states "Jobs unlock once all 4 are approved." Also, you can hold only **one active job at a time**; finish or complete the current trip first. If all four conditions are met and offers still do not come, contact support. Source: `frontend/src/pages/DriverDashboardPage.tsx`, `frontend/src/pages/DriverKycPage.tsx`.

### 6. Job offer expired before accepting

**What you see:** the offer card counted down and closed, or the Trips history (`/driver/history`) shows the status **Expired**.

**What to do:** every offer has a countdown timer (it turns red in the last 10 seconds) and the server refuses late acceptance with "Job offer has expired" — an expired offer cannot be revived. You stay available for the next offer; nothing else is needed. If you accepted but lost internet, the pending offer reappears when you reopen the app. Source: `frontend/src/pages/DriverDashboardPage.tsx`, `frontend/src/pages/DriverHistoryPage.tsx`, `supabase/migrations/20261003010000_atomic_job_offer_response.sql`.

### 7. Trip OTP rejected or locked

**What you see:** at pickup or delivery, the app says "Incorrect OTP" or "Too many incorrect OTP attempts. Please try again in 15 minutes."

**What to do:** the trip OTPs are **4 digits**, shown in the customer's app. Confirm the digits with the sender (pickup) or the recipient (delivery) — do not guess. You get **5 attempts**; after each wrong try the app shows how many remain. After 5 wrong attempts the OTP locks for **15 minutes**; wait, confirm the correct code, then try again. If the customer's code genuinely fails, use the **Support** button on the trip page. Source: `frontend/src/services/driverTripProgress.ts`, `frontend/src/pages/DriverTripPage.tsx`.

### 8. Vehicle or driver "not eligible" for a job assignment

**What you see:** the Assign Driver window on `/agency/jobs` does not list a driver-and-truck pair you expected.

**What to do:** the server only lists pairs that pass fixed checks. For the **vehicle**: marked available, not blocked for maintenance, and insurance, fitness, permit and PUC dates not expired (a blank date does not block). For the **driver**: actively employed with your agency, driving licence not expired, and driver status approved. Your agency must also be approved. Practical fix: open **Fleet** (`/agency/fleet`) — it warns you by name when insurance, fitness, permit or PUC has expired or expires within 30 days — then update the dates or mark the truck available again. Source: `supabase/migrations/20261008000000_agency_fleet_foundation.sql` (functions `agency_vehicle_allocation_eligible`, `agency_driver_allocation_eligible`), `frontend/src/pages/AgencyFleetPage.tsx`.

### 9. "This vehicle was updated elsewhere. Showing the latest version."

**What you see:** after saving a fleet or driver change, this message appears and your edit did not stick.

**What to do:** this is the version-conflict guard, not data loss. Someone else (or you, from another phone or computer) saved a newer version of the same record first. The app refreshes the screen to the latest saved version and never overwrites the other person's change. Read the refreshed record and, if your change is still needed, enter it again on top of the latest version. The same guard protects driver employment records. Source: `frontend/src/pages/AgencyFleetPage.tsx`, `frontend/src/pages/AgencyDriversPage.tsx`, `supabase/migrations/20261008000000_agency_fleet_foundation.sql`.

### 10. Invitation code problems (staff or driver invitations)

**What you see:** an invitation shows **Pending**, **Accepted** or **Expired** on `/agency/team` or the Drivers screen; or the invited person says the code does not work.

**What to do:** each invitation code is a one-time code **shown only once** when created — "It is shown only once and cannot be recovered." If it was lost, simply **revoke** the pending invitation and create a new one; the app also refuses a second pending invitation for the same person until you revoke the first. Clear failure messages are shown for each case: expired, revoked, "not valid", "no longer pending", or "sent to someone else" — the last one means the recipient must sign in with the exact email or phone number the invitation was created for. Note: the in-app screen where a driver redeems an invitation code is still being finished, so a driver who cannot use a code should contact support to be linked manually. Source: `frontend/src/pages/AgencyTeamPage.tsx`, `frontend/src/components/DriverInvitationsPanel.tsx`, `frontend/src/services/agencyOrganizationApi.ts`, `supabase/migrations/20261011000000_agency_members_clients_tariffs.sql`.

### 11. KYC document upload failed or rejected

**What you see:** a document shows **Upload failed**, or **Review Needed** with a rejection reason.

**What to do:** uploads must be JPEG, PNG, WebP or PDF, **under 5 MB** each, taken online with even lighting and all four corners of the document in frame. For **Upload failed**, tap **Try again** after checking your internet. For **Review Needed**, read the reason shown, tap **Re-upload** and send a clearer photo — you can replace a document any time before it is accepted. Once all four are accepted, KYC locks and becomes read-only; further changes go through support. Verification usually completes within 24 hours of submitting. Source: `frontend/src/pages/DriverKycPage.tsx`, `frontend/src/services/driverKycDocuments.ts`.

### 12. Cloud pages empty or "device-only" mode

**What you see:** the agency portal shows only local truck and carton counts, or cloud features are missing.

**What to do:** agency features need a connected cloud account and internet. In device-only (offline) mode the portal deliberately shows only the local summary on `/agency/dashboard`. Sign in with your cloud account and reconnect; if the account is signed in but pages stay empty, check internet, refresh, then contact support. Contact-form drafts survive offline because they are saved on the device. Source: `frontend/src/pages/AgencyDashboardPage.tsx`, `frontend/src/pages/ContactPage.tsx`.

---

## 6. Security note

TruckOpti staff will **never** ask for your password, your sign-in OTP, your trip OTPs or your bank details. If anyone asks for these claiming to be support, refuse and report it to the support email. Bank and payout details are entered only by you in the driver registration form (`/driver/register`) or agency registration form (`/agency/register`).

## 7. If it is not in the app, it may be planned

Some modules in the project plan are not built yet — sales-order import, GR/LR receipts with QR, full trip tracking with stoppages and breakdown handling, the freight invoice book, expense and fuel records, driver payroll and the ERP connector. The full list with task IDs is in `docs/USER-GUIDE-AGENCY.md` section 10. Support cannot switch on a planned module, but will confirm what is available today.
