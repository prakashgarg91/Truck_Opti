# TO-119 — Final production gates and launch handoff

## Objective
Convert accepted child-task evidence into one truthful production-readiness decision.

## Depends on
TO-113 through TO-118 accepted or explicitly owner-blocked.

## 2026-09-30 final review contract
Also requires review/disposition of TO-121 through TO-140 in TASKS.md; optional design expansion is excluded. Use the corrected canonical gates from TO-121, not a hardcoded historical 18/18 denominator. GPT-6 owns this final decision.

After local/staging code acceptance, prepare the exact main commit, migration/function manifest, approved provider capability matrix, required secret names, backup evidence and rollback steps. Obtain owner authorization for hosted db/function changes, production deployment, credential changes and any live-money test; execute only the authorized scope.

Verify deployed commit/release rather than comparing page titles alone. Require canonical HTTPS routing, JSON /healthz and /readyz, the valid Supabase project, real role sessions, tenant denials, private KYC review, complete dispatch/customer journeys, selected payment webhook/entitlement/invoice proof, monitoring delivery and backup recovery. Exercise fresh and returning service-worker sessions at mobile/desktop widths. Record exact commands/counts, redacted runtime IDs, environment and artifacts.

Keep two verdicts separate: LOCAL/STAGING ENGINEERING VERIFIED (when justified), and FULLY OPERATIONAL (only after supported production workflows and mandatory owner actions are directly verified). A mandatory blocked/failed gate precludes FULLY OPERATIONAL. No known P0/P1 issue may remain unresolved without explicit owner acceptance.

Review branch/worktree disposition and TASKS.md/result consistency at close. Write agent-results/008-result.md plus umbrella agent-results/001-result.md only with truthful accepted evidence.

## Scope
- Rerun full maintained build/lint/test/security/runtime gates.
- Verify core user journey, auth/data authority, provider behavior, payment sandbox readiness, observability and recovery evidence.
- Separate AI-executable defects from owner-only deployment/credential/payment/database gates.
- Inspect and consolidate branches/worktrees before closure.
- Update TO-112 result with exact residual risks; do not copy stale historical pass counts.

## Hard gates
No `supabase db push`, real payment, credential rotation or production destructive/deploy action without explicit owner approval.

## Acceptance
`agent-results/008-result.md` contains exact final evidence and recommendation; TO-112 may be marked DONE only when engineering completion criteria are met and remaining actions are genuinely owner/business launch gates.
