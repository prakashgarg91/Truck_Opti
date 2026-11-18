# TruckOpti Agency Guide

For owners and staff of a transport agency. It describes the Agency Portal as built on 18 November 2026. Items marked **available after launch** need the hosted launch first.

## 1. Getting started

1. **Create a login**, then open the agency register page. Use `/login?mode=agency` to sign in.
2. **Register your agency** in four steps:
   - Company details: company name, transport licence number and PAN are required. GSTIN is optional here.
   - Contact and address: contact person, 10-digit phone, city and state are required.
   - Bank details: account number and IFSC are required.
   - Press **Submit Application**.
3. **Wait for approval.** Your Home screen shows Verification Pending, Verified, Application Rejected or Account Suspended. Live jobs and payouts open after approval.
4. **Add GSTIN and phone.** Open **Profile** in the top bar, then **Open Company Settings**. Enter GSTIN and phone, the owner also enters state, then press **Save Company Profile**.
5. **Start the 14-day free trial.** The owner opens **Subscription** and presses **Start your 14-day free trial**. No card is needed.

## 2. Roles

The owner can do everything. The server enforces these limits, not only the menu.

| Role | Can do |
|---|---|
| Owner | Everything, including Team, company profile and subscription. |
| Dispatcher | Jobs, order import and cancel, load plans, consignments, tracking, ERP. |
| Fleet manager | Fleet, driver employment and invitations, expenses, maintenance, tracking. |
| Finance | Clients and tariffs, freight invoices, expenses, payroll, driver payments. |
| Viewer | Read-only on operations pages. |

## 3. Inviting staff and drivers

**Staff (owner, Team page):** press **Invite team member**, enter the email, choose a scope and the days valid (default 7). Press **Create invitation**. The code is shown **once**, so press **Copy link** or share on WhatsApp straight away. The staff member opens `/invite/<token>` and signs in with that email. **Revoke access** removes a member.

**Drivers (Drivers page, owner or fleet manager):** under **Driver invitations**, enter the driver's mobile number and press **Create invitation**. Copy the link or send it on WhatsApp. The driver signs in with that phone number and opens the link. Accepted drivers join the driver roster. Use **Assign Truck** to give a driver a vehicle. **End Employment** closes a record.

## 4. Fleet and jobs

- **Fleet:** press **Add Truck**, choose the vehicle type and enter the RC number. The page warns when a document has expired or expires within 30 days.
- **Jobs:** enter the fare on an authorized shipment and press **Create Job**. Press **Accept** or **Decline** on pending jobs, then **Assign Driver**. Use **Track Live** or **Confirm Delivery** for jobs in transit.

## 5. Clients and tariffs

**Clients:** press **Add client agreement** and enter the name, GSTIN and payment terms (0 to 365 days). Add **sites** (bill-to for invoices, ship-to for loading and drop points) and **contacts**. **End agreement** makes it read-only. **Reactivate** undoes it.

**Tariffs:** open a client's tariffs, choose the lane and vehicle type, then the basis (**Per trip**, **Per tonne** or **Per km**), amount and dates. Press **Publish rate**.

## 6. Importing orders by CSV

1. Choose the **Client**. Its agreement must be active.
2. Press **Download template** for the correct column names.
3. Choose your file (up to 5 MB and 2,000 lines).
4. Review each row: **Ready**, **Warning** or **Error**.
5. Fix every Error row. Press **Download errors CSV**, correct the file and upload it again.
6. Press **Import N lines**. Ready rows become draft orders.

**Required columns:** `client_order_ref`, `line_no`, `sku`, `quantity`, `unit`, `pickup_site`, `drop_site`.

**Optional columns:** `description`, `weight_per_unit`, `weight_unit`, `length`, `width`, `height`, `dim_unit`, `pickup_from`, `pickup_to`, `delivery_from`, `delivery_to`, `stackable`, `fragile`.

**Rules:** `unit` is kg, tonne, piece or carton. Dates look like `2026-11-12`. Site names must match the client's sites exactly, and drop sites must be ship-to. An import is all or nothing.

## 7. Load plan and approval

1. Tick the draft orders and the trucks to use.
2. Press **Propose plan**. Lines that do not fit are listed as unplaced and saved as unmet demand.
3. Name the plan (1 to 80 characters) and press **Save draft**.
4. Press **Confirm approval**. A newer approved version with the same name replaces the older one.
5. To stop a plan, press **Confirm cancel**. A cancelled plan cannot be approved again.

Approval locks the plan's order lines to it. Orders in an approved plan cannot be cancelled, and their trucks cannot go to maintenance. Approval does not change order status.

## 8. Consignments (GR and proof)

1. Under **Orders waiting for a GR**, press **Create GR**. The GR gets a number such as `AGY/2026-27/000123`.
2. Record steps in order: **Mark picked up**, **Start transit**, **Mark delivered**, **Confirm receipt**.
3. **Raise dispute** is allowed from pickup until receipt. A note of up to 500 characters is optional.
4. **Show QR** displays and copies the QR payload. A QR image is not built yet.
5. **Show history** lists every step.

## 9. Tracking and incidents

**Driver side (opt-in):** the driver turns on **Share live location with your agency** on the trip page. It runs only during the trip.

> **Check before training drivers:** the switch text says only your agency can see the location, but the status line on the same page says the customer and agency see it. Confirm which is correct.

**Agency side:** each active job shows Reporting, No pings or Stale ping (no position for 30 minutes). To log an incident, choose a type (Long halt, Overspeed, Route deviation, Breakdown, Accident or Other), enter 3 to 500 characters and press **Open incident**. Then **Acknowledge** it, and **Confirm resolved** with a note of 3 to 500 characters.

## 10. Freight invoices

TruckOpti never holds or moves freight money. Clients pay your own account. This page issues invoices and records what you received.

1. Press **New invoice**. Choose the client and fill in each line (description, quantity, rate). Press **Add line** for more.
2. Enter the GST rate and the supplier and place-of-supply state codes. Same codes give CGST and SGST (half the rate each). Different codes give IGST.
3. Press **Issue invoice**. The server recalculates the final amounts.
4. Or, under **Delivered GRs ready to invoice**, press **Create invoice from consignment**.
5. **Record payment** takes the amount, method (UPI, Bank transfer, Cash or Cheque), optional reference and date. Nothing is charged.
6. For a UPI link, enter your UPI ID and payee name, then **Copy pay link** or **Open in UPI app**.
7. **Cancel invoice** works only while no payment is recorded. Enter a reason, then press **Confirm cancel invoice**.

**Statement or tax invoice:** the Earnings page makes a **Statement** PDF per delivered job. It is marked "Not a tax invoice". Create GST invoices on this page.

## 11. Earnings and GST reports

Earnings shows totals and GST Due (5%). GST reports for the last three months export as CSV, Excel or JSON, at 5% of the fare. Confirm with your accountant before filing. A full GSTR-1 export is **not built yet**.

## 12. Expenses, fuel and maintenance

Set the period and press **Apply period**. Three tabs follow:

- **Expenses:** category (Fuel, Toll, Maintenance, Driver allowance, Insurance, Permit, Other) and amount. Fuel, toll, maintenance and driver allowance need a truck. Press **Save expense**.
- **Fuel:** in **Add fuel fill**, enter truck, date, odometer, litres (1 to 1,000) and cost, then press **Save fuel fill**.
- **Maintenance:** press **Add item** with a truck, name and interval in km or days. Each item shows OK, Due soon or Overdue. Press **Service done** after a service.

## 13. Payroll (finance only)

1. **Driver rates:** press **Set rate** or **Edit**. Enter base, per km and per tonne rates, then **Save rate**.
2. **Open period:** enter first and last day, then **Open period**.
3. **Advances and deductions:** choose the driver and type (**Advance (already given)** or **Deduction**), then **Record adjustment**.
4. **Close period:** only after the last day has passed. The server works out earnings from delivered jobs.

**Closing is final.** Lines cannot change afterwards. Download CSV first if you need a copy. If deductions exceed earnings, the net is zero and the gap shows as **Shortfall**. On the Drivers page, **Pay** only records a request for platform review. No money moves through TruckOpti.

## 14. ERP connector (Growth plan and above)

Available after launch: the live receiving address needs the hosted launch.

1. On **ERP**, under **New connection**, choose the client agreement, a name and a type (**Webhook** or **CSV drop**). Press **Create connection**.
2. The secret is shown **once**. Save it before you close the panel.
3. Your system POSTs a JSON body to `SUPABASE_URL/functions/v1/erp-ingest` with `connection_id`, `external_event_id` and `lines`. Send the secret in `Authorization: Bearer` or the `x-truckopti-secret` header.
4. Use a new `external_event_id` per batch. A repeat is recorded as a duplicate.
5. Batches are accepted or rejected whole. **Pause**, **Resume**, **Rotate secret** and **Revoke** manage a connection. Revoke is permanent.

## 15. Subscription and billing

Plans, per month excluding GST (GST at 18% is added): **Starter ₹499**, **Growth ₹1,999**, **Professional ₹4,999**. Yearly costs 10 months. Each plan sets limits for trucks, drivers, staff and orders per month. See **Usage against your plan** on the Subscription page. Online payment is **available after launch**.

| Status | Works | Blocked |
|---|---|---|
| Trial, active, past due | Everything. | Nothing. |
| Grace (read-only) | Viewing, exports, dispatch, payroll close, payments, trips, tracking. | New trucks, drivers, staff, orders and imports. |
| Expired or cancelled | Viewing, payments, trips, tracking, order cancel. | New records, dispatch, payroll close. |

Limits and locks are enforced only once the platform team switches enforcement on at launch.

## 16. Using it on a phone

The bottom bar has Home, Fleet, Drivers, Jobs and Earnings. **More** holds the other pages. Staff see only their pages.

## 17. Troubleshooting

| What the screen says | What to do |
|---|---|
| "Plan limit reached... Upgrade your plan to add more." | Ask the owner to upgrade, or remove an unused item. |
| "Your account is read-only... Renew to continue." | Owner presses **Renew**. |
| "Read-only grace period: N days left." | Renew before grace ends. |
| "Dispatch is locked... Renew to resume dispatch." | Owner presses **Renew**. |
| "Not included in your plan. The ERP connector is included from the Growth plan." | Upgrade to Growth or above. |
| "Your staff role (...) cannot do this." | Ask the owner to change your access. |
| "Agency approval is required." | Wait for approval. |
| "Add your GSTIN and phone in Company Settings first." | Fill both in under Profile, then Open Company Settings. |
| "This client agreement is not active." | Owner presses **Reactivate** on Clients. |
| "Some order references already exist... Nothing was imported." | Change the references or remove those rows. |
| "Some lines were rejected by the server. Nothing was imported." | Fix the lines and upload again. |
| "This order is in an approved load plan. Cancel the plan first." | Cancel the plan, then the order. |
| "This invoice has recorded payments, so it cannot be cancelled." | Keep the invoice. |
| "This invoice changed since you opened it. Reload to continue." | Reload and try again. |

## 18. Getting help

Open **Support** (`/support`). For approval questions, quote your company name and registration date.
