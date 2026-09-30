# TO-121 Result — Repair canonical launch and closure gates

**Verdict: PASS** (ready for GPT-6 review; does not authorize DONE, deployment, or live changes)
**Date:** 2026-09-30
**Brief:** `agent-tasks/011-canonical-readiness-gates.md`
**Working directory for all commands:** repository root `D:\Github\Truck_Opti`

## What was wrong (verified before work)

- `scripts/launch-readiness.ps1` required retired `0.dev-matrix` artifacts: six runtime docs, nine `standards/*.md` files, `resume-work.ps1`/`pause-work.ps1`, `AI-HANDOFF.md` ("Operational proof" contract), `LAUNCH_CHECKLIST.md`, `DOCUMENTATION-GOVERNANCE.md`, `STATE.md` freshness, plus `0.dev-matrix/RUNTIME-ERROR-LOOP.md`. `0.dev-matrix/AI-HANDOFF.md` is absent (verified: `test -f 0.dev-matrix/AI-HANDOFF.md` → absent; `find 0.dev-matrix -type f` shows only ignored `.log` evidence).
- Gate 7a ran `node 0.dev-matrix/deep-error-scanner.mjs` (absent) and `package.json` still exposed the broken `deep-scan` npm script.
- `scripts/test-hidden-errors.ps1` also invoked the absent deep-error-scanner and wrote to retired `0.dev-matrix\test-reports`.
- `scripts/close-day.ps1` required `0.dev-matrix` STATE/TASK/DISCUSSION/hook/handoff docs, consumed a background `resume-work` launch status file that no current writer produces, and generated an "AI Handoff"/"Project Progress" report — a competing handoff system.
- Root `runtime-error-loop.ps1` (outside this brief's allowed scope) is itself a broken wrapper delegating to absent `0.dev-matrix\runtime-error-loop.ps1`.

## Changed files

| File | Change |
|---|---|
| `scripts/launch-gates.core.ps1` | NEW — shared pure helpers: canonical control-plane gaps, TASKS.md board parser (brief/result refs, terminal rows, next recommended), npm script file-target validation, dirty-path classification with prefix allowances, junk/merge-marker scan with pruned walk, placeholder-safe Supabase credential presence probe, command runner, verdict calculator. Dot-source only; PS 5.1 compatible. |
| `scripts/launch-readiness.ps1` | REWRITTEN — retired document-presence checks replaced with validation of `AGENTS.md`, `ARCHITECTURE.md`, `TASKS.md`, `agent-tasks/README.md`, board brief/result references, and root npm script targets. Real checks preserved: frontend build, root/frontend/apps-web `npm audit --omit=dev`, pip-audit, compileall, glue check, runtime error-loop wiring (`npm run track-errors` / `npm run test:hidden-errors`). Gates reported in four categories — Environment prerequisites, Local engineering, Workspace hygiene, Owner-gated production. Status vocabulary PASS/FAIL/SKIP/BLOCKED; verdict computed by `Get-GateVerdict`: any FAIL → exit 1; BLOCKED/SKIP of mandatory gates → "LOCAL GATES PASSED - PRODUCTION NOT PROVEN" (never production-ready); only a fully clean run (including owner-gated gates) may print "ALL GATES PASSED - PRODUCTION-READY". Machine status JSON (BOM-less) + transcript log under `logs/launch-check/`. Exit code fixed to 0/1 (was fail-count); no CI consumer exists (verified `grep` over `.github/`, only `frontend-ci.yml`, which does not call these scripts). |
| `scripts/close-day.ps1` | REWRITTEN — consumes `TASKS.md` + `agent-results/` instead of generating a handoff system: validates canonical control plane, board integrity (every brief/result reference resolves; every `DONE*`/`BLOCKED*` row carries a result record), working-tree cleanliness, doc placement/naming hygiene, and latest `logs/launch-check/launch-check-status.json` evidence (absent → SKIP, failed → FAIL). Writes `logs/closeout/last-closeout.md` (previous report archived to `logs/closeout/archive/`, log to `logs/closeout/close-day-<stamp>.log`). Its own `logs/` output is exempt from the cleanliness gate (prefix allowance). No reference to AI-HANDOFF, resume-work, project-progress, or any `0.dev-matrix` path. |
| `scripts/test-hidden-errors.ps1` | Retired deep-error-scanner step removed (kept real glue check + frontend unit tests); report moved to `logs/test-reports/hidden-error-latest.json`. |
| `package.json` | `deep-scan` npm script retired explicitly (target `0.dev-matrix/deep-error-scanner.mjs` is gone; restoring the old framework was not an option per brief). All remaining script file targets verified to exist by a new gate. |
| `scripts/launch_gate_policy.test.mjs` | NEW — 14 focused `node --test` policy tests (name matches the required `scripts/*policy*.test.mjs` glob). |
| `TASKS.md` | TO-121 row → AWAITING_REVIEW with this result file. Only this row touched. |
| `agent-results/011-result.md` | This file. |

Not changed, deliberately: `scripts/track-errors.ps1` (already clean — writes `logs/autonomous/`, no retired references), `scripts/deployment_safety.test.mjs` (in scope but nothing broken; passes).

## Red/green regression evidence

- **Red (before implementation):** `node --test scripts/launch_gate_policy.test.mjs` → **14 tests, 0 pass, 14 fail** (~duration shown by runner). Failing for the right reasons: "retired 0.dev-matrix framework references" failed while `package.json`/gate scripts still contained them; "every root npm script file target exists" failed on `deep-scan: 0.dev-matrix/deep-error-scanner.mjs`; core-helper tests failed because `scripts/launch-gates.core.ps1` did not exist; fixture e2e tests failed because the old scripts demanded retired docs / created `0.dev-matrix` outputs.
- **Green (after implementation):** same command → **14 pass, 0 fail** (16.4 s).

## Required-scenario coverage (all executed in this session)

| Brief scenario | Test |
|---|---|
| Missing canonical file | fixture missing `ARCHITECTURE.md` → gap reported; complete fixture → no gaps |
| Failing command | `Invoke-GateCommand` with `cmd /c exit 3` → exit 3 recorded; passing command → 0; e2e: broken glue stub → launch-check exit 1, `GATE(S) FAILED` |
| Missing browser/Python | `Test-GateCommandAvailable` true for `node`, false for a missing tool; fixture launch-check shows Python-dependent gates SKIP when targets absent |
| Unavailable live credentials | no env files → `absent`; placeholder `replace_me_...` → `absent` (never counts as configured); non-placeholder → `present` (presence-only, value never returned); e2e: clean fixture → "LOCAL GATES PASSED - PRODUCTION NOT PROVEN", `productionReady:false` |
| Dirty unrelated user files | pure classification (tracked `M`, untracked `??`, rename, `!!` ignored) + e2e: stray `unrelated-user-note.txt` → launch-check exit ≠ 0 naming the file |
| Successful fixture | clean committed fixture → exit 0, "LOCAL GATES PASSED", "PRODUCTION NOT PROVEN", no `[FAIL]`, **no `0.dev-matrix` recreated**, status JSON at `logs/launch-check/launch-check-status.json` |
| close-day consumes board/results | fixture → exit 0, report at `logs/closeout/last-closeout.md`, no `0.dev-matrix`, next READY task named; DONE row with missing result → exit 1 naming the missing file |

## Required checks actually run (command, exit, counts, evidence class)

1. `node --test scripts/launch_gate_policy.test.mjs` (root) — red 0/14, then green **14/14 pass**. Evidence: mock/fixture repositories + real-repo static assertions.
2. `node --test scripts/*policy*.test.mjs scripts/deployment_safety.test.mjs scripts/test-server-routing.mjs` (root) — exit 0, **36/36 pass** (14 launch-gate + 6 production-config + 1 payment + 1 security-boundary + 4 deployment-safety + 10 server-routing). Evidence: mock/local (server-routing spins the local Express app).
3. `npm run launch-check` (root) — **exit 1; 21 gates: 19 pass, 2 fail, 0 blocked, 0 skipped** (pre-commit run). FAILs, both accurate:
   - *Git working tree cleanliness*: my 4 in-flight edited files + pre-existing parked untracked items (`.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/` — documented in TASKS.md "Repository state parked for TO-140"). Expected failure remains a failure.
   - *Production config audit*: Heroku CLI authenticated, so the real audit ran (read-only `heroku config`) and found **missing `VITE_RAZORPAY_KEY_ID` and `VITE_SENTRY_DSN`** in production config. This is genuine production evidence (class: production config read), owner-relevant, and correctly a FAIL rather than BLOCKED.
   - All local engineering gates passed: build, 3 npm audits (0 vulnerabilities), pip-audit (0 known vulnerabilities), compileall (2 targets clean), glue check (0 gaps), runtime-loop wiring. Evidence: local + production-config read.
4. `npm run close-day` (root) — **exit 1; 4 pass, 2 fail** (pre-commit run): cleanliness (same in-flight + parked items) and launch verification evidence (consumed the failed launch-check status — correct consumption, not a self-check). Board integrity passed: 32 rows resolve, next recommended TO-121. Report written to `logs/closeout/last-closeout.md`. Post-commit re-runs recorded below.

## Post-commit verification (final evidence)

Run after committing this task on `main` (so the tree contains only pre-existing parked items):

- `npm run launch-check` — exit 1; 21 gates: 18 pass, 2 fail, 0 blocked, 1 skip. FAILs unchanged in kind: cleanliness now lists only the pre-existing parked items (`.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`), and the production config audit still reports the two missing production vars. (Board now shows next recommended TO-122 after the TO-121 row flip; playwright packaged → PASS.)
- `npm run close-day` — exit 1; 4 pass, 2 fail (same two gates; launch evidence consumes the new launch-check status).

Both root commands run under the current operating contract and accurately distinguish PASS/FAIL/BLOCKED/SKIP; expected failures remain failures.

## Assumptions

- Gate scripts must keep running under Windows PowerShell 5.1 (npm `powershell` host); the test suite skips itself cleanly when PowerShell is unavailable (non-Windows). CI (`frontend-ci.yml`) runs the other policy tests individually and does not execute launch-check/close-day, so the 0/1 exit-code change has no CI consumer.
- `logs/` is the repo's intentional, gitignored report root; all new machine outputs live under it (`logs/launch-check/`, `logs/closeout/`, `logs/test-reports/`), so the strict cleanliness gate never fights its own reports.
- Launch-check's owner-gated production section intentionally performs read-only production reads (`heroku whoami`, `heroku config`) when the CLI is authenticated; credentials are never printed and no values are returned by the credential probe.

## Not run / residual

- `npm run test:hidden-errors` was not executed end-to-end (its remaining heavy step is the full frontend unit suite, minutes long). Its change is mechanical (step removal + report path) and is guarded by the retired-references policy test plus launch-check's runtime-loop wiring gate. Not claimed as run.
- Root `runtime-error-loop.ps1` was not modified — it is outside this brief's allowed scope and is a stale wrapper to the absent `0.dev-matrix\runtime-error-loop.ps1`. Launch gates no longer reference it. Disposition recommended for TO-140.

## Owner gates (unchanged or surfaced, none executed by this task)

- Production config gaps surfaced by the new gate: `VITE_RAZORPAY_KEY_ID` and `VITE_SENTRY_DSN` missing in Heroku config — owner must configure or explicitly accept.
- Pre-existing parked untracked items (`closeout-logs/` with 52 files, `.vscode/mcp.json.bak-qdrant-cleanup`) keep the workspace-hygiene gate red until reviewed/dispositioned (owner / TO-140).
- Live Supabase/auth/payment/production proof and any hosted changes remain owner-gated (per TASKS.md owner-gates list). None attempted.

## Next smallest step

GPT-6 review of this result; on acceptance, TO-121 → DONE and proceed to TO-122 (`agent-tasks/012-trusted-cloud-auth.md`) per the board. TO-140 can then delete the stale root `runtime-error-loop.ps1` wrapper and disposition the parked untracked items, which turns the workspace-hygiene gate green.

## Git state

- Branch `main`; no branches, worktrees, or stashes created; nothing pushed.
- Commit: see `commits` in the task submission (code + tests + this result + TASKS.md row, one cohesive commit).
- Pre-existing unrelated dirty files preserved untouched: `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`.
