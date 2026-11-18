# TruckOpti Support Desk Guide

For the owner's support desk. Messages are quoted from the app code.

**Contact (from `frontend/src/config/support.ts`):** +91 99993 52050, prakashgarg91@gmail.com.
**Hours and response times:** [OWNER TO SET]

---

## 1. Limits

- Support cannot see passwords, sign-in codes or trip OTPs. Never ask for them.
- Support cannot see ERP secrets (only a hint is stored). Rotate the secret instead.
- Reopening a cancelled subscription is an admin action.
- Refunds are issued by the owner in the payment provider dashboard.

---

## 2. Sign-in

| Message | Cause | Fix |
| --- | --- | --- |
| Incorrect login ID, email, or password. | Wrong details | Retype, or use Google |
| Too many OTP requests. | Rate limit | Wait a minute, resend |
| This verification code has expired. | Over 10 minutes old | New code |
| The verification code is invalid. | Wrong digits | Use latest code |
| Email OTP is not enabled for this project. | Email OTP off | Use Google; owner enables |
| Please confirm your email before signing in. | Unconfirmed email | Confirm first |
| Phone OTP is currently unavailable. | Phone not set up | Use Email OTP or Google |
| Authentication service is currently unreachable. | Network or outage | Check internet, retry |

## 3. Invitations

| Message | Cause | Fix |
| --- | --- | --- |
| Invitation not found | Bad link | New link |
| Invitation expired | Past expiry | Sender re-invites |
| Invitation already used | Used earlier | Check Home |
| Invitation cancelled | Revoked | Sender re-invites |
| Different account | Wrong email or phone | Sign in with invited contact |
| Driver profile needed | No driver profile | Register, reopen link |
| Driver approval pending | Not approved yet | Wait |
| Already employed | Employed elsewhere | Other agency ends employment |
| Profile conflict | Two driver profiles | Owner resolves duplicate |
| You own this agency | Owner joining own agency | None |
| Agency not active | Agency not approved | Owner checks approval |
| The agency has no room right now | SB001 or SB002 | Owner fixes plan |
| Something went wrong | Temporary failure | Try again |

## 4. Subscription codes

| Code | Message | Fix |
| --- | --- | --- |
| SB001 | Plan limit reached (used of limit) | Owner upgrades |
| SB002 | Your account is read-only | Owner renews |
| SB003 | Dispatch is locked (expired) | Owner renews |
| SB004 | Not included in your plan (ERP from Growth) | Owner upgrades |

## 5. Orders, load plans, GRs, invoices

| Area | Message (shortened) | Fix |
| --- | --- | --- |
| Order file | Column 'X' is missing. / No order rows. / Over 2000 lines | Correct file, re-upload |
| Order file | Choose a client agreement first. / Agreement not active | Pick or reactivate |
| Order row (error) | Quantity must be above zero. / Unit not supported / Site not found / Window ends before start / Duplicate line | Fix row, re-upload |
| Order row (warning) | Weight is missing | Add weight if needed |
| Load plan | Orders or trucks changed since saved. | Propose again |
| Load plan | Load heavier than truck. / Line has no weight. | Fix load or weight |
| Load plan | Truck used twice. / Line already in another approved plan | Re-propose or cancel other plan |
| Load plan | This plan changed. / Concurrent change | Reload, retry |
| Load plan | No loads, cannot approve. / GR exists, cannot cancel | Fix plan or accept |
| GR | Not allowed at this stage of the delivery. | Use next valid stage |
| GR | GR already exists. / Order cancelled. | Open existing GR |
| Invoice | GST rate must be 0, 5, 12 or 18. / State codes 01 to 38 | Correct form |
| Invoice | Consignment already has an invoice. | Open it |
| Payment | More than the outstanding balance. | Enter balance or less |
| Payment | Invoice cancelled. / Date in future. | Correct or stop |
| Cancel invoice | Has recorded payments. | Owner decision |
| Any save | Changed since you opened it. | Reload, re-enter |

## 6. Payroll periods

| Message | Fix |
| --- | --- |
| Can only close after its last day has passed. | Wait for end date |
| Dates overlap another payroll period. | Change dates |
| A later period is already closed. | Close in order |
| This period is closed. | Use an open period |
| At most 93 days. | Split period |
| Driver not employed by your agency. | Check employment |
| Amount too large to close. Nothing was changed. | Check adjustments |

## 7. ERP ingest HTTP status

| Status | Meaning | Fix |
| --- | --- | --- |
| 200 | Accepted or duplicate | None |
| 200 | `invalid_lines`, problems listed | Fix listed rows, resend |
| 400 | Missing event ID, no lines, too many lines | Fix body |
| 401 | bad_credentials | Check secret; rotate |
| 403 | connection_not_active / agency_not_operational | Agency reactivates |
| 403 | subscription_limit | Owner fixes plan |
| 409 | event_id_reused | New event ID |
| 413 | payload_too_large (over 1 MB) | Split payload |
| 422 | Other refusal, refs listed | Fix refs, resend |
| 500 | temporarily_unavailable | Retry later |

---

## 8. Escalation checklist

1. Get the exact message or screenshot, and the screen.
2. Get the role and sign-in email or phone. Never a password or code.
3. Get the record: invite, job, invoice or plan number, and time.
4. Apply the fix above; ask the user to retry.
5. Still failing, or data looks wrong: send the owner the steps taken.
6. Blocking first to the owner: cannot sign in, trip stuck, wrong payout or payroll.
7. Refunds and subscription reopening: owner or admin only.
8. Never ask for passwords, OTPs or bank details.
