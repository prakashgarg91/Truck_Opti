# Binding rulings C (architect, 2026-11-18)

Follows `docs/TO-152-rulings.md` and `docs/FABLE-RULINGS-2026-11-17-B.md`.

Owner answers (2026-11-18, in chat):
- The platform seller is NOT registered under GST yet. Subscriptions must be sellable without GST.
- Refunds stay as drafted: pro rata within 7 days of the FIRST purchase only; renewals not refundable.
- Support: email only. The phone number is not shown to customers.
- Staging Supabase project: `truckopti-staging`, ref `ydkhgclfjdksicpwqzmw`, ap-south-1. Production `jbxncejtcbpcronndqlx` is not touched.

## 1. Selling without GST ("unregistered seller" mode)

One switch on the single settings row. Nothing else decides tax.

- `platform_billing_settings.gst_registered boolean NOT NULL DEFAULT true`. Default true keeps every existing behaviour and battery unchanged.
- `platform_billing_settings_update` gains `p_gst_registered boolean` as the LAST argument (7 arguments). The 6-argument function is dropped in the same migration.
  - `p_gst_registered` NULL: `invalid_gst_registered` (22023).
  - true: exactly today's rules.
  - false: `p_gstin` must be NULL or blank, else `gstin_not_allowed_when_unregistered` (22023). `gstin` is stored NULL. Legal name, address, state code and SAC code are still required and validated as today.
- Table check: `gst_registered = false` implies `gstin IS NULL`.
- "Seller configured" (the test that today refuses every sale): registered needs legal name, GSTIN and state code as today; unregistered needs legal name, address and state code.
- Quote (`subscription_quote_order` and anything it calls): when unregistered, taxable = plan price, CGST = SGST = IGST = 0, total = taxable, `gst_rate_pct` = 0. The result carries `gst_registered` (boolean) so the screens do not guess.
- Invoice rows (`subscription_invoices`): when unregistered at the time of sale, `supplier_gstin` NULL, `gst_rate_pct` 0, all tax columns 0, total = taxable. Constraints are relaxed only as far as needed: `gst_rate_pct IN (0, 18)`; `supplier_gstin` may be NULL only when `gst_rate_pct = 0`, and must be present when it is 18. The recipient GSTIN is still stored when the agency gives one. Place of supply is still computed and stored.
- Same number series `TO/26-27/000001`, unbroken. No second series.
- Credit notes follow their invoice: an invoice at rate 0 gets a credit note with zero tax; pro-rata maths on the taxable amount is unchanged.
- Invoices are snapshots. Switching the flag changes only later sales; no stored invoice or credit note is rewritten.
- Razorpay order amount = total, so no tax is collected when unregistered. Activation, webhook and sweeps are otherwise unchanged.
- Public flag: `platform_gst_registered()` returns boolean, `STABLE SECURITY DEFINER`, `search_path = public, pg_temp`, EXECUTE to `anon` and `authenticated`. It exposes the flag only, never the settings row.
- Migration: one file `20261043000000_unregistered_seller_mode.sql`. `CREATE OR REPLACE` with each changed body copied whole from its latest definition. No earlier migration is edited.
- Battery: `scripts/subscription_no_gst.db.test.mjs`, written red-first. Existing batteries are not weakened; calls to the 6-argument settings update are changed to pass `true` as the 7th argument and nothing else.

## 2. Screens

- Admin billing settings: a "Registered under GST" switch. Off hides the GSTIN field and shows "No GST will be charged. Invoices will say the seller is not registered under GST."
- Pricing, checkout, subscription: read `platform_gst_registered()`. Registered: today's "+18% GST" copy. Unregistered: "No GST charged" and totals without tax. While the flag is loading or the call fails, show the price before tax and say "taxes, if any, are shown at checkout"; never show a made-up total.
- Subscription invoice copy: registered prints "Tax Invoice" as today. Unregistered prints "Invoice", no GSTIN line for the seller, no tax rows, and the line "Seller not registered under GST. No GST charged."

## 3. Policy and contact

- Policy draft section 1 and 3: "GST is added only while the seller is registered under GST." Section 5 keeps first-purchase-only refunds; the open question on renewals is closed.
- Terms page refund line is replaced by the policy rule (7 days, first purchase, pro rata).
- `frontend/src/config/support.ts`: the phone is no longer shown or linked anywhere a customer, driver or agency user can see. Email stays.

## 4. Not decided here

GST registration threshold and when to switch the flag on: owner and their accountant. Legal name, address, state: owner types them in the admin screen.
