# Housekeeping inventory (read-only)

Generated 2026-11-17 on `main` (HEAD 5c3c1a39). No deletes, no git writes, no commits. Every recommendation below is for the owner to approve; nothing has been changed.

Ages are measured from 2026-11-17. "Merged" means the branch tip is an ancestor of `main`. "Unique" is the `git cherry main <branch>` count of commits whose patch is not already on `main`.

## 0. Summary

| Item | Count | Recommended action | Risk |
|---|---|---|---|
| Local branches (excluding main) | 14 | 10 delete (merged), 2 delete after verify (stale, patch already on main), 2 keep (unique work) | Low for merged; low-medium for verify-first |
| Remote branches on origin (excluding main and HEAD) | 22 | 7 delete (merged), 2 delete after verify (stale), 13 keep and review (unique work) | Low for merged; medium for keep-review ones |
| heroku remote-tracking branch | 1 | Delete (merged), prune locally only | Low |
| Stashes | 3 | Review with owner: 1 likely obsolete (184 days), 1 likely obsolete (161 days), 1 safety snapshot (66 days). Do not drop without approval | Medium (drop is irreversible without `git fsck` recovery) |
| Worktrees registered to this repo | 23 linked plus 1 primary | Remove AWF worktrees only through the AWF cleanup tools or the procedure in section 3 | Medium (uncommitted work and running jobs) |
| Worktree dirs on disk under AWF worktrees root | 194 total: 23 this repo, 98 point to another repo, 73 without a `.git` file | Do not touch the 98 or the 73 from this repo. Report the 73 to the AWF owner | Low for the report, high if removed blindly |
| Legacy folder apps/desktop | 290 tracked files, last commit 2026-05-03 | Candidate for archive, owner decision. No code imports found | Medium (listed as an entry point in Repowise index) |
| Legacy folder apps/web | 201 tracked files, last commit 2026-09-06 | Keep. Launch gates and QA scripts depend on it | High if archived |
| Legacy folder .kilo | 1 tracked file, last commit 2026-09-27 | Keep unless owner confirms it is retired agent config | Low |

## 1. Branches (other than main)

Last commit date and subject are from the tip commit. Ahead and behind are `git rev-list --left-right --count main...<branch>`, where ahead is the second number. Diff is `git diff --shortstat main...<branch>`.

### 1a. Local branches

| Branch | Last commit | Subject | Ahead / behind | Merged into main | Unique (cherry) | Diff vs main | Recommendation | Note |
|---|---|---|---|---|---|---|---|---|
| awf/builder-20260717031349-8fdb1f | 2026-07-17 | merge: empty contact draft guard | 0 / 194 | yes | 0 | none | delete: merged | Checked out in AWF worktree; remove worktree first |
| awf/builder-20260717031405-86b7c5 | 2026-07-17 | merge: empty contact draft guard | 0 / 194 | yes | 0 | none | delete: merged | Checked out in AWF worktree |
| awf/builder-20260717032521-564665 | 2026-07-17 | test(phonepe): isolate runtime configuration cases | 0 / 190 | yes | 0 | none | delete: merged | Checked out in AWF worktree |
| awf/builder-20260717032527-81c044 | 2026-07-17 | test(phonepe): isolate runtime configuration cases | 0 / 190 | yes | 0 | none | delete: merged | Checked out in AWF worktree; has node_modules directory |
| awf/builder-20260717160103-869722 | 2026-07-17 | test(errors): cover safe user-facing fallbacks | 1 / 187 | no | 0 | 1 file, +43 | delete: stale, no unique work (verify first) | Patch-equivalent commit already on main; confirm before -D |
| awf/builder-20260718034641-ba3f6d | 2026-07-18 | fix(shipment): guarantee six-character IDs | 1 / 187 | no | 0 | 2 files, +50 -1 | delete: stale, no unique work (verify first) | Patch-equivalent on main; confirm the shipment ID fix is present on main |
| awf/builder-20260719042421-22fca6 | 2026-07-17 | docs(state): close AI factory hardening day | 0 / 187 | yes | 0 | none | delete: merged | Branch name date (07-19) differs from commit date (07-17) |
| awf/builder-20260719042421-72a077 | 2026-07-17 | docs(state): close AI factory hardening day | 0 / 187 | yes | 0 | none | delete: merged | Same tip as the sibling above |
| awf/builder-20260719042837-07d226 | 2026-07-17 | docs(state): close AI factory hardening day | 0 / 187 | yes | 0 | none | delete: merged | Same tip |
| awf/builder-20260719042837-c63f1a | 2026-07-17 | docs(state): close AI factory hardening day | 0 / 187 | yes | 0 | none | delete: merged | Same tip |
| awf/builder-20260719043318-c18c62 | 2026-07-17 | docs(state): close AI factory hardening day | 0 / 187 | yes | 0 | none | delete: merged | Same tip |
| heroku | 2026-09-11 | fix(incident): canonical-host 301 routing in server.js | 0 / 181 | yes | 0 | none | delete: merged | Local branch mirroring heroku/main |
| backup/cloud-sanitized-20260601-110912/Truck_Opti | 2026-06-01 | chore: cloud backup snapshot 2026-06-01 (sanitized) | 6 / 250 | no | 6 | 54 files, +1597 -829 | keep: has unique work | Backup snapshot; owner decision whether to retain |
| copilot/demo-accounts-and-audit-fix | 2026-06-09 | chore: bump qs past DoS advisory (GHSA-q8mj-m7cp-5q26) | 11 / 248 | no | 11 | 141 files, +12506 -1149 | keep: has unique work (unsure) | Probably superseded by merged origin/copilot/to109-demo-accounts-v2; owner to confirm before any delete |

### 1b. Remote-tracking branches (origin and heroku)

| Branch | Last commit | Subject | Ahead / behind | Merged into main | Unique (cherry) | Diff vs main | Recommendation | Note |
|---|---|---|---|---|---|---|---|---|
| origin/claude/compassionate-mccarthy-cymfwp | 2026-11-03 | docs(board): accept TO-143-D2 and TO-144-D2 backend | 0 / 82 | yes | 0 | none | delete: merged | Remote delete needs owner approval |
| origin/claude/sunagents-kimi-glm-setup-kphdw7 | 2026-06-20 | Add Claude Code skill doc for the subagent CLI | 0 / 216 | yes | 0 | none | delete: merged | |
| origin/copilot/to109-demo-accounts-v2 | 2026-06-09 | feat: TO-109 4-digit OTP, demo accounts, audit fixes | 0 / 230 | yes | 0 | none | delete: merged | |
| origin/cursor/critical-bug-identification-03a8 | 2026-06-10 | fix(security): restore agency portal auth checks | 0 / 218 | yes | 0 | none | delete: merged | |
| origin/cursor/critical-bug-investigation-3c93 | 2026-06-08 | fix(security): close fleet update-truck cross-agency driver bypass | 0 / 230 | yes | 0 | none | delete: merged | |
| origin/cursor/critical-bug-investigation-8b28 | 2026-06-06 | fix(security): close agency driver guard gaps | 0 / 230 | yes | 0 | none | delete: merged | |
| origin/cursor/critical-bug-investigation-b163 | 2026-06-09 | fix(security): close fleet update-truck payout bypass | 0 / 230 | yes | 0 | none | delete: merged | |
| heroku/main | 2026-09-11 | fix(incident): canonical-host 301 routing in server.js | 0 / 181 | yes | 0 | none | delete: merged (remote-tracking) | Local prune only: `git remote prune heroku` (not run) |
| origin/cursor/critical-bug-investigation-50e9 | 2026-07-30 | fix(security): enforce server-side job-offer OTP verification | 1 / 198 | no | 0 | 3 files, +263 -25 | delete: stale, no unique work (verify first) | Security fix; grep main to confirm the OTP enforcement landed before deleting |
| origin/fix/offline-first-ci-20260912 | 2026-09-12 | fix(ci): validate supported offline-first frontend | 1 / 159 | no | 0 | 1 file, +9 -10 | delete: stale, no unique work (verify first) | Patch-equivalent on main |
| origin/chore/to113-baseline-20260912 | 2026-09-12 | docs(tasks): complete TO-113 baseline | 2 / 158 | no | 2 | 2 files, +59 -5 | keep: has unique work | Docs baseline; unsure whether still wanted |
| origin/dependabot/npm_and_yarn/frontend/npm_and_yarn-51502b6267 | 2026-07-03 | chore(deps-dev): bump the npm_and_yarn group | 1 / 199 | no | 1 | 2 files, +2036 -2090 | keep: has unique work (unsure) | Dependabot PR; check whether a newer bump already on main |
| origin/dependabot/pip/apps/web/pip-18c674f953 | 2026-08-05 | chore(deps): bump cryptography | 1 / 198 | no | 1 | 1 file, +1 -1 | keep: has unique work (unsure) | Dependabot PR against apps/web; main already bumped cryptography in b8659af7 (2026-07-03), so likely stale |
| origin/docs/readiness-results-20260912 | 2026-09-12 | docs(readiness): close verified slices | 4 / 154 | no | 4 | 4 files, +120 -6 | keep: has unique work | Readiness evidence; review before delete |
| origin/docs/to117-result-20260912 | 2026-09-12 | docs(readiness): close TO-117 code slice | 2 / 151 | no | 2 | 2 files, +65 -2 | keep: has unique work | |
| origin/fix/deployment-safety-20260912 | 2026-09-12 | fix(deploy): bind Heroku remote to approved app | 7 / 153 | no | 7 | 5 files, +96 -54 | keep: has unique work | Deployment-safety change; high priority to review, not to delete |
| origin/fix/to115-auth-policy-audit-20260912 | 2026-09-12 | fix(to115): audit enabled auth providers | 4 / 157 | no | 4 | 4 files, +94 -13 | keep: has unique work | |
| origin/fix/to115-feature-aware-launch-smoke-20260912 | 2026-09-12 | fix(to115): skip disabled email OTP fallback probe | 3 / 156 | no | 3 | 3 files, +27 -3 | keep: has unique work | |
| origin/fix/to116-core-launch-smoke-20260912 | 2026-09-12 | fix(to116): isolate optional cloud auth health | 4 / 155 | no | 4 | 4 files, +29 -4 | keep: has unique work | |
| origin/fix/to117-payment-webhook-secret-20260912 | 2026-09-12 | docs(to117): add payment provider handoff gates | 4 / 152 | no | 4 | 4 files, +47 -2 | keep: has unique work | |
| origin/fix/to118-observability-audit-20260912 | 2026-09-12 | test(to119): include frontend lint in maintained gates | 4 / 149 | no | 4 | 3 files, +63 -9 | keep: has unique work | |
| origin/fix/to118-payment-error-boundary-20260912 | 2026-09-12 | fix(to118): sanitize Razorpay verification errors | 5 / 150 | no | 5 | 5 files, +26 -4 | keep: has unique work | |
| origin/fix/to118-react-router-7-18-3-20260912 | 2026-09-12 | chore(to118): remove temporary lockfile workflow | 4 / 148 | no | 4 | 2 files, +41 -25 | keep: has unique work | |

Not branches: `origin/HEAD` and `heroku/HEAD` are symbolic refs and must not be deleted.

Totals: local 14 (10 merged, 2 stale, 2 unique). Remote 22 origin plus 1 heroku/main (7 merged, 2 stale, 13 unique on origin).

## 2. Stashes

| Index | Message | Age (days) | Files touched (git stash show --stat) | Recommendation |
|---|---|---|---|---|
| stash@{0} | On main: sync-2026-09-12 full safety snapshot | 66 (2026-09-12) | 2 files, +56 -28: .vscode/mcp.json, frontend/src/pages/ContactPage.tsx | Keep until the owner confirms ContactPage changes are on main or intentionally dropped. Safety snapshot |
| stash@{1} | WIP on (no branch): 6f5cc272 merge: document project completion gaps | 161 (2026-06-09) | 36 files, +0 -1892: all deletions of Supabase skill reference files under a .claude skills folder | Probably obsolete. Review, then drop only with approval. Low-medium risk (it only deletes) |
| stash@{2} | On main: park broad service-layer and agency-portal refactor 2026-05-17 | 184 (2026-05-17) | 33 files, +599 -1467: frontend pages, server.js, supabase billing | Parked refactor, likely superseded by later TO-152 work. Owner must review before drop. High risk if dropped by mistake |

`refs/stash` also exists as a ref to the stash list. Dropping stashes is a git write and is not part of this inventory.

## 3. Worktrees

### 3a. Registered to this repo (git worktree list)

- Primary: `D:/Github/Truck_Opti` on `main` (5c3c1a39). Keep.
- 11 AWF branch worktrees under `D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/builder-*` on `awf/*` branches (9 merged, 2 stale, as in section 1a).
- 12 AWF detached worktrees `factory-cl-Truck_Opti-*` at 91b50f76 (detached HEAD). These are owned by the AWF job system. Two of them (`define-acceptance-6`, and the directory `builder-20260717032527-81c044`) contain a `node_modules` directory.

### 3b. Disk scan of the AWF worktrees root (no recursion into node_modules, no junctions followed)

| Category | Count | Note |
|---|---|---|
| Total directories | 194 | |
| `.git` file points to this repo (Truck_Opti) | 23 | Matches the 23 registered worktrees |
| `.git` file points to D:/Github/ai-work-factory | 98 | Other repo. Do not touch |
| No `.git` file | 73 | Orphan or partial directories, not linked to any repo. Do not touch from this repo. Report to the AWF owner |

Reparse check: a top-level attribute check on the 23 Truck worktrees found no ReparsePoint at the top level. Two `node_modules` directories are plain directories (attributes "Directory"). Nested junctions were not checked, by design.

Sizes were skipped (not needed for the recommendation).

### 3c. Safe removal procedure (for the owner to run or approve)

1. Check for live work first: `bus_status` and `worker_status` or `factory_status` from ai-work-factory. Do not remove a worktree a job is using. Claim the repo with the agent bus before any git write.
2. For each worktree with `node_modules`, list reparse points inside it without following them, for example `cmd //c "dir /AL /S /B <worktree>\node_modules"`. Remove each junction with `cmd //c "rmdir <junction>"` (no `/S`). Never use `rm -rf` on a path that may contain a junction.
3. Re-check that the worktree top level has no ReparsePoint.
4. `git worktree remove <path>` (no `--force`). If it refuses, run `git -C <path> status` and decide what to keep. Do not force.
5. After all removals, `git worktree prune` to clear stale metadata.
6. Delete the branch with `git branch -d <branch>` for merged ones (safe delete). Use `-D` only for the stale ones after the verification in section 1a.
7. For the detached `factory-cl-*` worktrees, use the AWF cleanup path (`zcode_task.py clean --id`, or `apply_worktree_cleanup`) instead of raw git, per the owner exception in the main-only policy.
8. Remote branch deletions use `git push origin --delete <branch>` and need owner approval.

## 4. Legacy folders (archive candidates)

Tracked file counts from `git ls-files <folder> | wc -l`. Imports were checked by grepping `frontend/src`, `supabase/functions`, `frontend/package.json`, `package.json`, `scripts` and `supabase/migrations` for the folder path and for `from`/`import` lines. No code imports were found.

| Folder | Tracked files | Last commit touching it | Imports from frontend or supabase | Other references | Recommendation | Risk |
|---|---|---|---|---|---|---|
| apps/desktop | 290 | 2026-05-03 c51c1e41 chore: sync launch hardening and vm handoff state | None found | Repowise index lists apps/desktop/TruckOpti_Microsoft/main.py and apps/desktop/TruckOptimum/app.py as entry points | Archive candidate. Owner decides; prefer a tag or an archive folder over deletion | Medium: Repowise still treats it as live |
| apps/web | 201 | 2026-09-06 0f3a4d97 security+quality sweep (root, apps-web, python) | None found | Live: scripts/launch-readiness.ps1 and launch-gates.core.ps1 run its audit and compile gates; scripts/qa/run_screenshot_test.sh and bug mappers use it; supabase migration comment mentions apps/web/otp_service.py; open dependabot PR targets apps/web | Keep. Not an archive candidate | High if archived: breaks launch gates |
| .kilo | 1 | 2026-09-27 7f6b2d28 chore(agent-config): preserve untracked developer skills, configs, and helper scripts | None found | Agent configuration | Keep unless owner confirms it is retired | Low |

## 5. Unsure items for the owner

- copilot/demo-accounts-and-audit-fix (11 unique commits, 5 months old): confirm it is superseded by origin/copilot/to109-demo-accounts-v2 before deleting.
- The two stale awf branches and origin/cursor/critical-bug-investigation-50e9 and origin/fix/offline-first-ci-20260912: these are patch-equivalent to main. Confirm the content is on main, then delete.
- stash@{0} (ContactPage.tsx) and stash@{2} (parked refactor): check whether the current main already has the intended change.
- The 73 directories without a `.git` file in the AWF worktrees root belong to no repository this inventory could identify. Leave them to the AWF owner.
