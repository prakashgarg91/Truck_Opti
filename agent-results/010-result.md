# TruckOpti completion assessment — 2026-09-30

Assessment task: TO-ASSESS-010. Assessment completed; product verdict: NOT PRODUCTION READY.
Assessed source: main at b76c4cc37a4b1a2add4db7ddd274fc30b49bacdb, before these documentation changes.
Purpose: give the owner bounded GLM-5.3 Flash implementation prompts, not execute the attached mission or authorize production changes.

## Scope and authority

Read the attached mission, current AGENTS.md, ARCHITECTURE.md, TASKS.md, relevant results/briefs, source and policies. Used semantic search before source exploration. The attached mission's retired 0.dev-matrix handoff process is superseded by the canonical operating contract. React Router is already 7.18.3: do not repeat the obsolete router-upgrade task. No new feature expansion, architecture rewrite, agent router, branch or worktree is required.

This is an evidence-backed remaining-work list, not a guarantee of zero future defects. Source-level risks below require behavioral confirmation where stated. Live configuration and deployed schema were not inspected because the Heroku CLI session is expired. Historical September 11 findings are not asserted as current configuration facts.

## Fresh verification

| Check | Actual outcome |
| --- | --- |
| Frontend build/typecheck | PASS; 3,042 modules, build completed. Vendor/browser-external, eval, large-chunk and stale Browserslist warnings remain. |
| Frontend unit suite | PASS: 22 files, 358/358 tests. |
| Frontend lint | PASS exit status; 0 errors, 26 warnings. |
| Server routing | PASS: 10/10 tests, including local JSON health/readiness. |
| Packing contract | PASS: 18/18 tests. |
| Four configuration/deployment/payment/security policy suites | PASS: 12/12 tests. These do not prove hosted behavior. |
| Python authentication middleware unit tests | PASS: 6/6 using existing .venv Python; ordinary python command resolves to Windows Store alias. |
| Root and frontend production-dependency audits | PASS: 0 reported vulnerabilities in those audit scopes; not an exhaustive security assessment. |
| Public browser smoke against current local build | FAIL: 1/12 passed. |
| Wider frontend browser smoke against current local build | FAIL: 40/52 passed. |
| Independent login network probe | Current build requests /auth/v1/health on jbxncejtcbpcronndqlx.supabase.co and receives ERR_NAME_NOT_RESOLVED. |
| Live www.truckopti.in | HTTP 200 during this assessment. |
| Live truckopti.in | HTTP 200 after one redirect during this assessment. |
| Live /healthz and /readyz | Return SPA HTML instead of expected JSON: deployment drift/readiness gap. |
| Heroku release/config inspection | BLOCKED by expired CLI authentication; no production configuration values printed or changed. |
| Canonical launch/close-day gates | Not run end-to-end: source still requires retired missing handoff files and scanner references. TO121 repairs and then executes them. |
| Git fetch and divergence | Fetch succeeded; main is 14 ahead, 0 behind origin/main. No push performed. |

Browser reports: logs/public_frontend_smoke_report.json and logs/frontend_launch_smoke_report.json. Matching Playwright Chromium headless shell was installed into its normal cache after the initial missing-binary failure; subsequent failures are actual current-build smoke results. No source dependency or environment file was changed. Public-route console network errors include the dead backend and a connection-reset error; not every network error has been independently attributed.

Tests ran on host Node v24.14.0. Repository engines, Docker and CI still select Node 20. Testing one host version does not establish deployment runtime compatibility.

## Confirmed remaining gaps and source-level risks

1. **Readiness tooling does not match the operating contract.** launch-readiness.ps1, close-day.ps1 and the package deep-scan command depend on retired 0.dev-matrix files. Rebuild the gates around canonical documents and actual executable checks, not a fixed historical denominator. TO121.
2. **Cloud identity and device identity are conflated at the login surface.** GoogleSignInButton uses client-decoded GIS claims to link a local agency profile and loginLocal. This is explicitly device-local identity, not verified cloud authorization. Existing authSupabaseApi.signInWithGoogle is a useful starting point. Keep offline demo behavior isolated and enforce cloud privileges server-side. TO122.
3. **Office login can present no usable method.** Password/OTP flags and Google client availability drive contradictory disabled controls and setup strings. Provide truthful capability-based states and actual office provisioning/password behavior; do not enable a flag without a working provider. TO123/TO124.
4. **Backend availability has not been recovered or proven.** Historical Supabase hostname remains NXDOMAIN; current intended replacement and hosted data are unknown. Rehearse all migrations/functions/policies locally, identify restore/import and secret requirements, then obtain owner-gated hosted recovery. TO125.
5. **Driver KYC is a simulation, not an operational review system.** DriverKycPage uses timed progress and automatic acceptance. Existing upload UI work is DONE_UI_ONLY. Build private uploads, durable submissions, review state and audit records, then connect driver/admin screens. TO126–TO128.
6. **KYC storage needs privacy correction.** Repository migration 20260306000000_driver_docs_bucket.sql creates public driver-docs with public select; the later admin-policy hardening does not privatize it. Deployed state is unknown. Aadhaar/licence records must not be publicly readable. Preserve existing files and plan a controlled transition. MIME/size limits must match the real upload contract. TO126/TO136.
7. **Job-offer response is not atomic.** Current frontend directly updates job_offers and separately updates drivers. A later migration removes driver update policy, so zero-row success and partial assignment are credible risks. Existing offer modal exists: do not create an unnecessary new route based on the stale design audit. Prove behavior and replace with one authenticated transaction/RPC. TO129.
8. **Trip status/OTP replay correctness needs database tests.** The July OTP RPC increments total_trips whenever the resulting status is delivered, including a potential replay. Transition sequence, concurrent replay, client-supplied extra fields/timestamps and effective privileges need actual final-schema testing. Existing contract tests are not a live database proof. TO130/TO136.
9. **Safe error handling regressed.** Earlier sanitization was reverted in adminSupabaseApi and agencyPortalApi. Provider payload.error/error.message can become a displayed UserFacingError. Restore a safe finite error-code mapping without concealing useful corrective information. TO131.
10. **Production observability and deployment identity remain incomplete.** Logger suppresses production error output; Sentry needs explicit sanitization/release/config proof. Deployed health/readiness returning HTML contradicts local routing tests. Avoid recording tokens, Aadhaar, document URLs or sensitive payloads. TO132.
11. **Backup restore has incompatible framing and destructive sequencing risks.** Encryption stores salt + IV + ciphertext, while restore passes the full stored blob to a decrypt helper expecting the salt separately/excluded. Helper-only tests slice the prefix and do not exercise the real restore path. importSnapshot truncates then inserts without transaction; shape/hash validation and newer agency-profile fields need coverage. This is source evidence, not a destructive reproduction on owner data. TO133.
12. **Connected user journeys are not launch-proven.** Re-run persistent customer, driver, agency and admin journeys against disposable migrated local/staging backends, including cross-user denials, permission errors, reloads, empty states and real mutations. Public page rendering is insufficient. TO134–TO136.
13. **Payment readiness is conditional.** Existing source-policy tests cannot prove provider sandbox callbacks, signatures, concurrency, reconciliation or invoices. A missing provider may be an honest disabled capability, but then a revenue-ready verdict cannot pass. No real charge or provider setup without owner authority. TO137.
14. **Runtime, actual UX and repository closure remain unfinished.** Upgrade unsupported Node 20 to a supported version consistently and verify it; disposition 26 lint warnings and vendor warnings. The existing design audit is based partly on generated screens and stale route assumptions: audit the integrated app, including mobile, accessibility, bilingual and all state coverage. Main has 14 unpushed commits and 13 historical worktrees requiring safe inventory/consolidation. TO138–TO140.

## Detailed worker queue

Each linked file contains the task-level implementation prompt, exact ownership boundaries, dependencies, required tests, acceptance criteria and result path. Read agent-tasks/README.md for the shared execution contract. One writer on main; no worker independently claims project completion.

| Task | Worker brief | Current status | Dependencies |
| --- | --- | --- | --- |
| TO121 | [011: Repair canonical launch and closure gates](../agent-tasks/011-canonical-readiness-gates.md) | READY | None. First recommended task. |
| TO122 | [012: Connect Google login to trusted Supabase sessions](../agent-tasks/012-trusted-cloud-auth.md) | READY | None for local implementation. Live proof needs TO-125 and owner credentials. |
| TO123 | [013: Make every login surface usable and consistent](../agent-tasks/013-usable-auth-surfaces.md) | WAITING_DEPENDENCY | TO-122 and TO-124 accepted. Follow repository Stitch policy for UI work. |
| TO124 | [014: Audit real provider capability and fail closed](../agent-tasks/014-provider-capability-audits.md) | READY | None for implementation. Coordinate the cloud Google capability contract with TO-122. |
| TO125 | [015: Prepare a reproducible Supabase recovery and staging backend](../agent-tasks/015-supabase-recovery-rehearsal.md) | READY_LOCAL_OWNER_BLOCKED_HOSTED | Owner login is required to determine restore versus replace. Local schema rehearsal can proceed independently. |
| TO126 | [016: Implement private KYC storage and authoritative state](../agent-tasks/016-private-kyc-backend.md) | WAITING_DEPENDENCY | Local schema from TO-125; trusted cloud identity contract from TO-122. Hosted rollout is owner-gated. |
| TO127 | [017: Replace simulated driver KYC with real uploads](../agent-tasks/017-real-driver-kyc.md) | WAITING_DEPENDENCY | TO-122 and TO-126 accepted. Follow Stitch guide and reuse the integrated KYC screen. |
| TO128 | [018: Complete the admin KYC review loop](../agent-tasks/018-admin-kyc-review.md) | WAITING_DEPENDENCY | TO-126 and TO-127 accepted. Follow Stitch workflow for UI integration. |
| TO129 | [019: Make driver offer acceptance atomic and reachable](../agent-tasks/019-atomic-job-offer-response.md) | WAITING_DEPENDENCY | TO-122 and TO-125 local backend. Audit existing dashboard flow before adding any route. |
| TO130 | [020: Verify and repair trip transitions and OTP enforcement](../agent-tasks/020-trip-transition-integrity.md) | WAITING_DEPENDENCY | TO-125 and TO-129. Server mutation authority must remain intact. |
| TO131 | [021: Restore safe admin and agency error boundaries](../agent-tasks/021-safe-service-errors.md) | READY | None. Reproduce the current behavior before changing it. |
| TO132 | [022: Complete safe error reporting and health proof](../agent-tasks/022-sanitized-observability.md) | WAITING_DEPENDENCY | TO-131 accepted; owner DSN/access needed for live delivery proof. |
| TO133 | [023: Make local backup restoration safe and complete](../agent-tasks/023-atomic-backup-restore.md) | READY | None. Use fake Drive transports and an isolated in-memory PGlite database. |
| TO134 | [024: Prove the customer cloud business journey](../agent-tasks/024-customer-journey-proof.md) | WAITING_DEPENDENCY | TO-122/123/124/125 and accepted backend corrections. Staging test identities required. |
| TO135 | [025: Prove the dispatch-to-delivery business loop](../agent-tasks/025-driver-agency-journey-proof.md) | WAITING_DEPENDENCY | TO-126 through TO-130 and staging identities. TO-134 provides the shipment fixture. |
| TO136 | [026: Verify admin authority and final database policies](../agent-tasks/026-admin-and-rls-proof.md) | WAITING_DEPENDENCY | TO-125 and schema-changing tasks accepted. Use the fully migrated local/staging schema. |
| TO137 | [027: Prove payment state convergence in sandbox](../agent-tasks/027-payment-provider-proof.md) | READY_HARNESS_OWNER_BLOCKED_PROVIDER | TO-125 and trusted auth; provider sandbox credentials supplied by owner. Existing TO-117 code hardening is retained. |
| TO138 | [028: Align supported Node runtime and close quality warnings](../agent-tasks/028-supported-runtime-and-quality.md) | READY | TO-121 before final gate validation. No production deployment. |
| TO139 | [029: Audit implemented journeys for UX and accessibility gaps](../agent-tasks/029-actual-ui-completeness.md) | WAITING_DEPENDENCY | Relevant core UI tasks accepted; follow Stitch status/guide and owner selection for P1/P2 design changes. |
| TO140 | [030: Consolidate repository state and resolve obsolete tooling](../agent-tasks/030-repository-consolidation.md) | READY_AUDIT_ONLY | Code completion and review before cleanup; coordinate with GPT-6. Audit may proceed read-only now. |

Recommended dispatch order:
- First TO121, then TO122 and TO124, then TO123 once its prerequisites are reviewed.
- Start TO125's local rehearsal promptly; hosted recovery is a separate owner gate.
- Independent ready tasks TO131, TO133 and TO138 may be dispatched next, serialized rather than overlapping writers.
- Execute TO126 → TO127 → TO128 and TO129 → TO130 after their backend/auth dependencies.
- Follow with TO132, TO134–TO136 and TO137, respecting each brief's dependency list.
- Finish TO139 and TO140, then reopen the existing TO119 final-production brief only after prerequisites are accepted.
- TO137 harness and TO140 read-only inventory can proceed while their owner-gated portions remain blocked.
- Optional UI P1/P2 changes still require owner selection. Existing approvals do not authorize production mutation.

## Coverage of the attached mission

| Mission area | Where it is covered |
| --- | --- |
| Inventory/current-state reconciliation | This assessment and TO140 |
| Domain, origin and deployment truth | TO121, TO124, TO132 and final TO119 |
| Backend recovery/migrations/storage | TO125, TO126, TO136 |
| Password, OTP, Google and role separation | TO122, TO123, TO124, TO136 |
| Core customer/driver/agency/admin operations | TO127–TO130, TO134–TO136 |
| Payments and revenue proof | TO137 |
| Security and data privacy | TO126, TO131, TO132, TO136 |
| Backup, recovery and operational resilience | TO125, TO132, TO133 |
| Runtime/build/lint/tests | TO121, TO138 and each brief's regression requirements |
| Actual responsive UX/accessibility | TO123, TO127, TO128, TO139 |
| Canonical docs, branches and worktrees | TO121, TO140 |
| Final release and business-operational verification | Existing TO119 / agent-tasks/008-final-production-gates.md |

## Owner-required inputs and actions

These cannot be substituted by enabling frontend flags or fabricating test evidence:
- Reauthenticate Heroku and identify the intended production app, deployed commit and domain/origin configuration. DNS is currently reachable; historical Error 1016 is not itself proof of today's origin root cause.
- Identify/recover the intended Supabase project; provide credentials through approved local secret stores, confirm backup/data disposition and approve any hosted migrations/functions/storage transition. Do not paste secrets into chat or commit them.
- Configure verified Google/Supabase OAuth origins and callbacks, office-account provisioning and password/reset behavior; provide SMTP/provider setup if email OTP is required. Phone OTP is optional unless explicitly in the launch contract.
- Supply dedicated test users for all roles, a test tenant and permission to use a disposable staging environment. Keep demo data clearly isolated.
- Provide PhonePe sandbox access, dedicated webhook secret and the required business/provider approval if paid bookings are in scope. Any real payment remains a separate explicit approval.
- Provide monitoring configuration and approve support/privacy/retention content and operational ownership. Where maps or another optional provider is absent, require a truthful tested fallback.
- Authorize the final production deploy/config/migration sequence and rollback window. Workers can produce local artifacts and exact commands without carrying out owner-gated actions.

Missing credentials should block only the affected hosted subtask. Workers must finish safe local work and record precise remaining owner steps.

## Repository disposition

No implementation, live migration, deployment, payment, credential rotation, merge, commit or push was performed in this assessment. No branches or worktrees were created or deleted.

Pre-existing untracked content was preserved:
- .vscode/mcp.json.bak-qdrant-cleanup
- closeout-logs/

Session changes are documentation only: TASKS.md, agent-tasks/README.md, the existing 007 and 008 briefs, 20 new briefs 011–030, this assessment result and the TO119 blocked-checkpoint result.

The following worktree identities were inventoried, not individually cleared for deletion. Every historical worktree is PARKED_PENDING_CONTENT_AND_INTEGRATION_AUDIT under TO140. A merged HEAD alone does not prove its uncommitted/ignored content can be discarded.

```text
worktree D:/Github/Truck_Opti
HEAD b76c4cc37a4b1a2add4db7ddd274fc30b49bacdb
branch refs/heads/main

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260717024529-08c397
HEAD 4485da82973e2c18aa9d1af0fb1225059d95fb94
branch refs/heads/awf/builder-20260717024529-08c397

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260717025526-67c4e8
HEAD ab40f6a3761a8202e805c32e5bc3ed7364f71d9b
branch refs/heads/awf/builder-20260717025526-67c4e8

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260717031349-8fdb1f
HEAD 5739b45b755d5c8444f6dd56367efae44a1dbab3
branch refs/heads/awf/builder-20260717031349-8fdb1f

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260717031405-86b7c5
HEAD 5739b45b755d5c8444f6dd56367efae44a1dbab3
branch refs/heads/awf/builder-20260717031405-86b7c5

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260717032521-564665
HEAD 0fb8bb2df0366a3164e3b046bd3bac6c1e5b52fc
branch refs/heads/awf/builder-20260717032521-564665

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260717032527-81c044
HEAD 0fb8bb2df0366a3164e3b046bd3bac6c1e5b52fc
branch refs/heads/awf/builder-20260717032527-81c044

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260717160103-869722
HEAD 5430ae9a45eb9b828b8e63f5319f8441cbdfcd96
branch refs/heads/awf/builder-20260717160103-869722

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260718034641-ba3f6d
HEAD 38fe03e959fbf049f82d826f57ac680fc8d94ded
branch refs/heads/awf/builder-20260718034641-ba3f6d

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260719042421-22fca6
HEAD 98520fc2f3c346cb6f3c3247eea7516c466ebf9b
branch refs/heads/awf/builder-20260719042421-22fca6

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260719042421-72a077
HEAD 98520fc2f3c346cb6f3c3247eea7516c466ebf9b
branch refs/heads/awf/builder-20260719042421-72a077

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260719042837-07d226
HEAD 98520fc2f3c346cb6f3c3247eea7516c466ebf9b
branch refs/heads/awf/builder-20260719042837-07d226

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260719042837-c63f1a
HEAD 98520fc2f3c346cb6f3c3247eea7516c466ebf9b
branch refs/heads/awf/builder-20260719042837-c63f1a

worktree D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-20260719043318-c18c62
HEAD 98520fc2f3c346cb6f3c3247eea7516c466ebf9b
branch refs/heads/awf/builder-20260719043318-c18c62

 M TASKS.md
 M agent-tasks/007-observability-security.md
 M agent-tasks/008-final-production-gates.md
 M agent-tasks/README.md

```

Other existing local branches require the same retained-work audit: backup/cloud-sanitized-20260601-110912/Truck_Opti; copilot/demo-accounts-and-audit-fix; copilot/to109-demo-accounts-v2; stitch/driver-docs-upload-20260919; stitch/pilot-20260911; sync-safety/pre-sync-20260912; ultra/referral; wip/local-20260630. Do not blind-merge or force-delete.

## Completion criteria

Report two verdicts: (1) engineering complete against the supported scope, and (2) fully operational in production. Fully operational requires both to pass.

Required evidence: accepted bounded tasks; no known unaccepted P0/P1 auth/privacy/data-loss/journey defects; connected role journeys and backend denials; real provider proof for enabled payments/auth; build/lint/tests and supported runtime; deployed release identity and JSON health/readiness; production domain/SPA/API routing; sanitized monitoring; backup/restore and rollback rehearsal; canonical task/result truth; understood/consolidated repository state; and authorized production verification. Any mandatory skipped or blocked gate prevents a fully operational verdict.

Next smallest task: TO121, agent-tasks/011-canonical-readiness-gates.md.

## Primary documentation consulted

- [Supabase Google authentication](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase private/public buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Official Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json): Node 20 end-of-life 2026-04-30; Node 24 is supported LTS on this assessment date.

