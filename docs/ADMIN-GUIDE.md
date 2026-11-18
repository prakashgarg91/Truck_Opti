# Admin guide (platform owner)

This guide describes the admin area as it is built on 2026-11-18. Routes are under `/admin`. Only users with the
admin role can open these pages. Items marked **[hosted]** depend on the hosted Supabase project, Razorpay or
scheduled jobs. They have not been run on a hosted environment yet (see `TASKS.md`, 2026-11-18 checkpoint).

## 1. Approving agencies (`/admin/agencies`)

Tabs: pending, approved, rejected, suspended.

- **Pending:** Approve, or Reject. Rejection needs a reason; the agency sees it.
- **Approved:** Suspend.
- **Suspended:** Reinstate.
- **Rejected:** no action buttons. Re-registration is not offered from this screen.

Check the GSTIN and PAN shown on each card before approving.

## 2. Driver KYC review (`/admin/drivers`, `/admin/drivers/:id`)

The list has the same four tabs as agencies, with a CSV export of the current tab (bank and Aadhaar details are not
in the export).

On a driver's page there are four documents: RC book, driving licence, Aadhaar and truck photo. For each one:

- **Accept**, or **Reject** with a reason (500 characters at most). A rejected document shows "Review Needed" and the driver can upload a replacement.
- The status reads "N of 4 accepted" until all four are accepted, then "KYC Verified".
- Document previews are short-lived links (about 60 seconds). Open them again if they expire. **[hosted]**
- **Approve Driver** asks for confirmation if any document is not accepted ("Approve Anyway"). **Suspend Driver**
  is available for approved drivers.

A stale review (someone else changed the document first) is refused, so reload the page and decide again. **[hosted]**

## 3. Driver payouts (`/admin/payouts`)

Filters: all, pending, approved, paid, rejected.

- **Pending:** Approve, or Reject with a required reason (saved on the payout).
- **Approved:** Mark Paid, after you have sent the money yourself.
- **Paid** and **Rejected** are final. There is no undo button.

The app records the status change only. It does not move money. Mark Paid only after the transfer is done.
Each transition is checked on the server. **[hosted]**

## 4. Subscriptions (`/admin/subscriptions`)

Statuses: `trial`, `active`, `past_due`, `grace`, `expired`, `cancelled`. The top cards count active, trial,
past due plus grace, and expired plus cancelled.

**Ops attention** lists two things, and needs your action when non-empty:

- Captured payments the system refused (with the Razorpay payment and order ids). Refund them in Razorpay.
- Refunds that could not be credit-noted. Reconcile by hand; never edit the rows.

**Reopen after cancellation:** shown only on the latest cancelled subscription of an agency that has no live
subscription. Confirm, and the agency can buy a plan again.

No admin screen starts a trial. The agency owner starts it from the trial panel on their Subscription page.

## 5. Billing settings (`/admin/billing-settings`)

Enter once, before any subscription payment:

- **Legal name** and **registered address** exactly as they should appear on invoices.
- **GSTIN** (15 characters). The **state code** (01 to 38) must match its first two digits.
- **SAC** (6 to 8 digits). The page suggests 997331; confirm it with your accountant.

Until these are saved, a captured payment is refused with `BILLING_NOT_CONFIGURED` and must be refunded
(TO-152 runbook, section 8).

The **Danger** panel shows whether enforcement is on and how many approved agencies have no live subscription.
It has no switch. Saving the form keeps the current enforcement value.

### What enforcement does

When it is ON, approved agencies with no live subscription become read-only. It is OFF by default. Turning it OFF
restores full access at once. Data and payments are not touched either way.

**Rule before turning it on:** every approved agency must have a trial or a plan. The count on this page must be 0.
Then follow `docs/TO-152-runbook.md` section 4: record the owner sign-off, and only then set enforcement through
the `platform_billing_settings_update` function. Nothing in the app turns it on. **[hosted]**

## 6. Billing operations (`/admin/billing-ops`)

Read-only. It shows:

- Approved agencies without a live subscription.
- Latest webhook events (received time, event type, result, order and payment ids).
- Retry attempts, with the error code for each.
- Sweep runs (trials expired, grace started and expired, reminders created). **[hosted]**
- Coupons, with discount, cycles and redemption counts.

Actions happen elsewhere: refunds in Razorpay, reopen on the subscriptions page.

## 7. Refunds

1. Issue the refund in the Razorpay dashboard, never in the app. **[hosted]**
2. Razorpay sends `refund.processed`. If an invoice exists, a credit note is created automatically.
3. If the credit note fails, the case appears under "Refunds that could not be credit-noted" on the subscriptions
   page. Reconcile it by reviewing the record. The table is append-only.

## 8. Reading the records

- **Webhook events:** `result = failed_recorded` or `orphan` needs a ticket. `orphan` usually means test and live
  (or staging and production) webhooks are mixed up.
- **Retry attempts:** an event that reaches attempt 8 is final and is not retried again. Find the cause in
  runbook section 8 before deciding on a refund.
- **Sweeps:** the latest run should be recent. If not, the scheduled job has stopped. **[hosted]**
- Function logs: Supabase dashboard, Edge Functions, `razorpay-webhook`. Search for `refused:` and `retryable:`.

## 9. Weekly checklist

- [ ] Subscriptions: Ops attention is empty, or every item has a ticket.
- [ ] Billing ops: no `failed_recorded` or `orphan` webhook rows this week. **[hosted]**
- [ ] Billing ops: latest sweep run is recent. **[hosted]**
- [ ] Billing settings: the count of approved agencies without a live subscription is 0 (or a reason is noted).
- [ ] Agencies: the pending tab has been worked through.
- [ ] Drivers: the pending tab and each pending KYC document have been reviewed.
- [ ] Payouts: approved payouts have been paid or the driver told why not.
- [ ] Record what you did, with ids and dates, outside the app.

Never edit payments, invoices, credit notes or subscription rows by hand. Corrections go through the app's functions
or through a Razorpay refund (TO-152 runbook section 8).
