# Production rehearsal: new migrations on top of OLD data

Date: 2026-11-19. Nothing hosted was touched. Everything ran on a throwaway PostgreSQL 18.6 on this machine
(`scripts/prod/legacy_replay.mjs`). Caveat: Supabase may run an older Postgres major version; the failures below are
data problems, not version problems, but re-check once with the real version (`preflight_inventory.sql` Q03).

## What was tested

1. Built the "old production" database: migrations up to and including **20260501120000** (the last file of the
   20260501 billing group: unique subscription per user, unique invoice payment id). Files dated 2026-05 to 2026-07
   that come AFTER that point and are therefore replayed as pending: 20260517010000, 20260531110000, 20260601223849,
   20260606110000, 20260730110000. Change the assumption with `--cutoff=<version>`; the owner confirms the real one with
   `preflight_inventory.sql` Q01/Q02. `node scripts/prod/legacy_replay.mjs --list` prints every file and the cut-off.
2. Seeded 100 realistic legacy rows (plus the catalogue rows the old migrations seed) (17 users, 9 agencies, 6 drivers, 5 trucks, 7 shipments/jobs/offers,
   10 subscriptions, invoices, payments, payouts, notifications) using only columns that exist at that point.
3. Applied the 51 remaining files one at a time, each in its own transaction (what `db push` does).
4. Compared every legacy table before and after, row by row.

Run modes and their evidence files (all in this folder):

| Mode | File |
|---|---|
| default, stop at first failure (what `db push` does) | `legacy-replay-2026-11-19.json` |
| `--continue-after-failure` (raw: later files cascade-fail because they need the failed one) | `...-continue.json` |
| `--continue-after-failure --remediate` (owner data fixes applied, then retried: finds the rest) | `...-continue-remediated.json` |
| `--drift` (a production whose old status CHECK was lost, with an unknown status and an unmapped catalogue truck) | `...-continue-remediated-drift.json` |
| `--cutoff=20260418005000` (production older than the 20260501 billing fix) | `...-cutoff-20260418005000.json` |
| `--preflight-check` (runs the SQL file against the seeded database) | `preflight-on-seeded-legacy-2026-11-19.json` |

## What would BREAK (the push stops)

The push stops at the first of these. Fix the data, push, and it stops at the next one. Both are in the seed because
the old schema allowed them.

1. **20261008000000_agency_fleet_foundation.sql** fails with SQLSTATE 23505 (unique violation): it adds
   `UNIQUE (agency_id, rc_number)` to `agency_trucks`. Triggered by two trucks of the TransGo agency that carry the same
   RC number `MH12AB1234`. Preflight query: Q40.
2. **20261015000000_agency_job_truck_commands.sql** fails with SQLSTATE P0001 (its own guard): "Duplicate driver truck
   links block the unique index". Triggered by driver Ramesh being attached to two trucks. Preflight query: Q41.
   (20261008 runs first, so this one only shows after the first is fixed. It was found with `--remediate`.)

Everything after those two applied cleanly once the two duplicates were repaired (49 of 51 files ok, 2 needed the
data fix). Of the 28 files that failed in the raw `--continue` run, 26 were knock-on failures (missing tables or functions) of the first one.

Only with `--drift` (not assumed, but cheap to check): 20261008 also refuses (P0001) if the `trucks` catalogue holds any
name outside the 8 known ones, and **20261026000000_agency_subscriptions.sql fails with SQLSTATE 23514** if
`subscriptions.status` holds any value outside trial/active/paused/cancelled/expired (seed: `trialing`).
With the repo's old CHECK still in place no such row can exist, so this only bites if production lost that CHECK.
Preflight: Q20, Q21, Q42.

## What would CHANGE SILENTLY (the push succeeds, rows are different afterwards)

No legacy row disappeared (row counts equal on every table). These columns changed:

| What | Effect | Preflight |
|---|---|---|
| `subscription_plans.price_yearly` rewritten to 10 x monthly | every yearly price drops by 900 paise (Rs 9): 499900 to 499000, 1999900 to 1999000, 4999900 to 4999000, 14999900 to 14999000. Existing subscribers are not repriced, new checkouts are. | Q23 |
| `subscriptions.status` `paused` becomes `cancelled` | and `cancelled` is final: a paused customer can never be resumed | Q21 |
| `job_offers` pickup and delivery OTPs | every NULL, blank or non-4-digit OTP is replaced by a random 4-digit one, on ALL offers including delivered and cancelled history. 6 of 7 seeded offers changed. A customer holding an old 5 or 6 digit code now has a wrong code. | Q44 |
| `drivers.dl_url`, `rc_url`, `selfie_url`, `insurance_url` | set to NULL when they point at the old public `driver-docs` bucket. The files stay in storage but nothing references them, so KYC documents look missing until re-uploaded. | Q45 |
| `subscriptions.agency_id` | every legacy subscription is attached to its owner's agency (the oldest APPROVED one, else the oldest). Seed: Sanjay owns a rejected agency created first and an approved one second: the approved one is chosen. A pending agency (Meena) is also chosen. | Q24 |
| Trial claims table | one claim per attached agency. Seed: Kaveri Freight and Kaveri Freight Services have the same GSTIN (different case and spaces) and the same phone (different format), so the second agency gets NO claim row and is not remembered as having used a trial. A blank GSTIN and a 5-digit phone are stored as NULL. | Q26 |
| Rows left behind by `NOT VALID` constraints | `subscriptions_period_order_check`, `driver_payouts_amount_positive` and the `agency_trucks` catalogue foreign key are added unchecked. Old rows that break them stay (a zero-length billing period, a Rs 0 and a negative payout, free-text vehicle types such as "Mini truck (custom)" and names like "Tata 407" that are not catalogue codes). | Q27, Q43, Q46 |
| Legacy `invoices`, `payment_history`, `addon_purchases` | not moved to the new tenant ledger. They stay as read-only history; the new screens will not show them. | Q29 |

## Backfill conflicts (table `subscription_backfill_conflicts`, 4 rows in the rehearsal)

| Reason | Who | Outcome |
|---|---|---|
| `multiple_agencies` | Sanjay (two agencies) | attached to the approved one, both candidates logged |
| `no_agency` | Mohan, a customer with an ACTIVE paid enterprise yearly plan | row kept, `agency_id` NULL, **never entitles: he loses what he paid for** |
| `no_agency` | Riya, a customer on a live trial | same |
| `no_agency` | Ramesh, a driver account holding an active professional plan | same |

`live_collision` (two users of one agency, each with a live subscription) could not be produced. On the old schema the only
link between a user and an agency is `transport_agencies.user_id` (one user per agency) and `subscriptions.user_id` is unique,
so that branch is unreachable from legacy data. With a cut-off before 20260501113000 the same user can hold two subscription
rows, and that file DELETES the lower-ranked one (seen with `--cutoff=20260418005000`: 11 rows before, 10 after; its invoices and
usage rows are moved to the survivor). Preflight confirms with Q20.

## What the sweeps would do (`run_subscription_sweeps`, run once inside a rolled-back transaction)

1. **As is, it fails.** The seed has one active subscription whose billing period starts and ends at the same instant
   (Blue Bay Movers). The new period CHECK is `NOT VALID`, but the sweep updates that row and the CHECK is enforced on every
   updated row, so the whole function raises 23514. The hourly cron would fail on every run, and no trial or subscription
   would ever be expired or reminded until that row is repaired. Preflight: Q27.
2. With the bad row out of the way, one run would: expire the Speedline trial (its trial_end passed), and move two active
   subscriptions whose period already ended (Lone Star Haulage, Blue Bay Movers) to `grace` (7 days of access, then `expired`
   on the next run). Active rows with a future period end, the customer and driver rows with no agency, and the rest are
   untouched. A `trial` row with NO `trial_end` is never swept. Preflight: Q28. Expect the real production figures to differ:
   it is time-dependent, so run Q28 on the day of the push.

## What the owner must decide

1. **Real cut-off.** Run Q01 and Q02 and tell me the highest applied version. If it is below 20260501120000 the
   duplicate-subscription DELETE applies too.
2. **Duplicate RC numbers and driver links (Q40, Q41).** Which truck keeps the RC and which keeps the driver? Repair in
   production before the push (`--remediate` only shows a mechanical fix: suffix `-DUP-xxxx` on the newer truck, detach the driver
   from the newer truck).
3. **Subscribers with no agency (Q25).** Each paid row listed will stop entitling. Decide per row: create or link an agency first,
   or accept it and refund or comp. Do not push with active paid rows unresolved.
4. **Yearly price (Q23).** Accept the Rs 9 reduction, or change the plan row after the push.
5. **Subscriptions that the first sweep will move (Q28) and any zero-length period (Q27).** Repair the period dates first.
6. **OTP and KYC link loss (Q44, Q45).** Accept that in-flight trips get new OTPs, and that driver documents need re-linking or
   re-upload. Tell active drivers before the push.
7. **Paused subscribers (Q21).** `paused` becomes final `cancelled`.
8. **Shared GSTIN or phone across agencies (Q26).** Decide which agency owns the trial claim.
9. **Fresh project or push.** See the recommendation in the final report. A pre-push backup (Supabase dashboard, "Backups", or
   a `pg_dump` taken by you) is required either way, together with the Q06 row counts as the "before" figure.

## How to use the SQL file

`scripts/prod/preflight_inventory.sql`: 34 blocks, each a single plain SELECT (verified by `--preflight-check`, which also runs them
in READ ONLY transactions). Paste one block at a time into the production SQL editor ("Run selected"): the editor only shows the
last statement's result. Save the results here. Blocks tagged `[HAZARD]` should return zero rows.

## Limits of this rehearsal

The seed is invented: it contains each hazard pattern once. A real production database may hold others, which is exactly what
the preflight blocks are for. Edge functions, storage objects and Razorpay state were not exercised. Postgres 18.6 locally;
`pg_cron` is not available locally, so the schedule branch of 20261031 was not run (the sweep function itself was).
