# Fleet handoff: truck-opti

Written 2026-11-08T07:07:29.326Z. A new session resumes by itself (the agent-fleet mod runs fleet-resume.mjs at start); manually: node ~/.claude/fleet/fleet.mjs resume D:/Github/Truck_Opti

| State | Count | Jobs |
|---|---|---|
| LANDED | 24 | z-truck-test-agency-jobs (landed on main (commit exists); state corrected by the vibe-), z-truck-test-agency-rates (recovered by the vibe-code director: the worker finished, jo), z-truck-test-agency-billing (landed on main (commit exists); state corrected by the vibe-), z-truck-test-agency-profile (recovered by the vibe-code director: the worker finished, jo), z-truck-test-agency-register (recovered by the vibe-code director: the worker finished, jo), z-truck-test-driver-earnings (recovered by the vibe-code director: the worker finished, jo), z-truck-test-driver-history (recovered by the vibe-code director: the worker finished, jo), z-truck-test-driver-profile (CHECK_FAILED), ... |
| FAILED_FINAL | 1 | z-truck-test-company-profile (worker turn failed 3 times ('Turn execution failed' from the) |

Durable facts: landed work is in git (commit subjects carry [task-id]); lessons in .fleet/lessons.md; task plan in .fleet/tasks.json; outcomes in .fleet/ledger.jsonl.
Needs you (agents cannot do these): see the Needs-you list in TASKS.md.


## 2026-11-17 day close
All TO-145..152 work is on main (see TASKS.md day-close checkpoint). ZCode plan out of balance: workers were Haiku/Sonnet/Opus agents. Resume: read TASKS.md checkpoint, docs/FABLE-RULINGS-2026-11-17-B.md, then build the local full-journey harness and guard-coverage migration. Owner-only items listed in TASKS.md.


## 2026-11-18 day close
Main at 3b6e3816 and later. READY FOR STAGING, NOT READY FOR CUSTOMERS. Run: npm run release:gates (gates 1-6; report in logs/release-gates/), then docs/STAGING-SMOKE-CHECKLIST.md for hosted gates 7-11 once an owner-created staging project exists. Local full journey: RACE_MODULES=D:/tmp/pgrace npm run test:journey (47 passed, 2 hosted-only). Known failing gate locally: test:prod-config (production VITE values: owner/hosted). Owner-only list: TASKS.md 2026-11-18 checkpoint. Next session: open with the owner-pending list, then hosted gates if staging exists.


## 2026-11-18 evening close
See TASKS.md evening checkpoint: landed work, gates, the known-defect list for the next pass, open owner decisions and billing routes. Next session: open with the owner-pending list, then fix the known defects (start with Dashboard.tsx truck-type quote), then the hosted gates if a staging project exists.

## 2026-11-18 late: in flight
- Staging Supabase project created (free): name truckopti-staging, ref ydkhgclfjdksicpwqzmw, region ap-south-1. Old production project jbxncejtcbpcronndqlx is paused and must not be touched.
- Owner answers: seller is NOT GST-registered (build a no-GST selling mode); refunds as drafted (first purchase only, 7 days, pro rata); support = email only, hide phone.
- Next: push 73 migrations and Edge functions to staging, then hosted checks; Razorpay webhook needs the owner to type the secret.
- Day closed 2026-11-18 late. Last verified code on GitHub main: c63c0a91 (all local gates green). Supabase CLI is logged in (npx supabase 3.2.0); supabase/.temp/project-ref still points at PRODUCTION: link to ydkhgclfjdksicpwqzmw and confirm the ref before any db push.
- UNCOMMITTED and UNVERIFIED in the working tree (builders were mid-run at close): migration 20261043 (no-GST mode) with battery scripts/subscription_no_gst.db.test.mjs, 7-arg settings update in older batteries, support phone removal, refund wording, ContactPage/TermsPage tests. Design: docs/FABLE-RULINGS-2026-11-18-C.md. Next session: run full gates on this tree, review, then commit; then the no-GST screens (ruling section 2); then push migrations and Edge functions to staging.
- Claude API key still "not scoped to a workspace"; ZCode still "Insufficient Balance" (checked 2026-11-18 evening).
