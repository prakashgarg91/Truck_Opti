# 036 - TO-146..151 database commands (2026-11-17)

Red-first batteries written by Haiku workers, migrations written by Sonnet workers, Opus reviewed money and security code.

| Module | Migration | Battery | Opus review |
|---|---|---|---|
| TO-146 consignments (GR/LR, proof state) | 20261019000000 | 56/56 | not yet reviewed |
| TO-147 tracking and incidents | 20261020000000 | 63/63 | not yet reviewed |
| TO-148 freight invoices (record-only) | 20261021000000 | 74/74 | no HIGH; MED fixes applied (append-only, CGST=SGST, replay). Deferred ledger check on payments not attachable (battery seeds paid_paise 0) |
| TO-149 expenses, fuel, maintenance | 20261022000000 | 97/97 | not yet reviewed |
| TO-150 payroll | 20261023000000 | 114/114 | HIGH (forgeable job inputs) + 4 MED fixed, 19 cases appended |
| TO-151 ERP connector | 20261024000000 | 67/67 | no HIGH; payload cap, retry, claim restore applied |

Battery fixture bugs fixed by their authors (assertions unchanged): tracking T22/T59/T61, expenses E35/E41/E78. One assertion changed on purpose: invoices I40 (odd paisa now split CGST=SGST).
Gates at commit: 21 PGlite batteries pass, edge guard 12/12, tsc clean, types drift PASS.
Not done: UI for TO-146..151, race test on real PostgreSQL for the new commands, review of consignments/tracking/expenses by Opus. ZCode plan out of balance (owner action).

## Addendum 2026-11-17 (later): load plans, screens, review fixes
- TO-145 slice 3: 20261025000000_agency_load_plans.sql, battery 98/98, Opus review (no HIGH; MED fixed: typed invalid payloads, order cancel refuses orders in an approved plan, approve repeats weight check). Partial: no truck-maintenance refusal for approved plans; trigger-depth bypass narrowed for DELETE only.
- Review fixes applied to consignments (64), tracking (74), expenses (107), invoices (74), payroll (114), ERP (67).
- Screens built and routed (not viewed in a browser): Order Import, Load Plan, Consignments, Invoices, Expenses, Tracking, Payroll, ERP.
- Real PostgreSQL race test scripts/race/new_commands.race.mjs: 9 scenarios pass (8 parallel x 5 rounds). R6 odometer scenario is weak.
- Gates at commit: 22 PGlite suites pass, edge guard 12/12, tsc and eslint clean, frontend 1853 tests, types drift PASS.
- Owner-open: ZCode plan out of balance; hosted project, db push, Razorpay keys (TO-152), deploy (TO-153), browser verification.
