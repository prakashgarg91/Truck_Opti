# TO-140 result — repository consolidation (owner-extended scope)

Date: 2026-10-05. Executor: GLM-5.3 Flash workflow consolidation worker. Status: AWAITING_REVIEW (worker PASS = ready for GPT-6 review; not DONE).
Scope executed: delete only reviewed/merged or explicitly parked items with recorded proof. Nothing destructive beyond that.

## Headline facts (measured, replacing the stale premise)

- The shared worktree root `D:/Github/0.dev-matrix/data/ai-work-factory/worktrees/` contains **121 `builder-*` directories**, but only **11** are registered Truck_Opti worktrees. The other 110 are **not Truck_Opti**: 3 `.git` pointers → `D:/Github/ai-work-factory/.git`, 36 → `D:/Github/trading-rex-ai/.git`, 71 have no `.git` at all (e.g. `builder-20260906140507-635907` holds `dashboard/`, `server/`, `node_modules/`). All 110 were left untouched.
- The ask's "14 worktrees" and TASKS.md's "thirteen" both measure as **11 registered awf worktrees + 1 detached legacy worktree** (`D:/system files/Temp/Legacy-tmp/zcode-jobs/z-to-132/wt`).
- **0 Truck_Opti worktrees were removed**: 10 are dirty, 1 is clean but unmerged. `git worktree prune --dry-run -v` reported no prunable entries.
- **Exactly 1 deletion executed**: branch `stitch/driver-docs-upload-20260919` (`d66f10db`), proven merged.

## Commands run (exact, from `D:/Github/Truck_Opti`)

| Command | Result |
|---|---|
| `git worktree list` | main + 11 `awf/builder-*` worktrees + 1 detached Temp worktree |
| `git worktree prune --dry-run -v` | empty (exit 0) — no prunable registrations |
| `git branch -vv` / `git branch -r` / `git branch --merged main` / `--no-merged main` | data below |
| `git stash list` | 3 stashes |
| `git -c safe.directory=<wt> -C <wt> status --porcelain` (all 11) | dirty counts below; all 11 failed plain git first with "detected dubious ownership" (Administrators-owned `.git`), worked around per-invocation with `-c safe.directory=` (no persistent config change) |
| `git merge-base --is-ancestor <branch> main` (all 11 + parked branches) | merged/unmerged below |
| `git rev-list --count main..<branch>` / `<branch>..main` | unique/behind counts below |
| `git hash-object <file>` vs `git rev-parse main:<path>` | dirty-file divergence below |
| `git diff 38fe03e9 main -- frontend/src/utils/shipmentId{.ts,.test.ts}` | **empty** — byte-identical to main |
| `git diff 5430ae9a main -- frontend/src/utils/userFacingError.test.ts` | 40 insertions / 1 deletion — main is a strict superset; no unique content in the branch |
| `git branch -d stitch/driver-docs-upload-20260919` | exit 0: "Deleted branch … (was d66f10db)" |
| `git rev-parse origin/main`; `git rev-list --count origin/main..main`; `main..origin/main` | `366a1e7b`; **11 ahead / 0 behind** |
| `git status --short` (main) | no modified tracked files; 4 untracked paths (below) |
| `git ls-files --error-unmatch <path>` | `.serena/`, `.vscode/mcp.json.bak-qdrant-cleanup`, `closeout-logs/`, `.ai-work-factory/` untracked; `agent-results/completion-truth-20261002.md`, `agent-results/functional-coverage.md` **tracked** (commit `366a1e7b`) |
| `git check-ignore -v` (all untracked) | no matches — none are gitignored |

## Worktree dispositions (all 11: PARKED, none removed)

Merged = `git merge-base --is-ancestor <branch> main`; dirty = `status --porcelain` line count.

| Worktree (under the shared root) | Branch @ HEAD | Merged | Dirty (1 line = 1 entry) | Next action |
|---|---|---|---|---|
| `builder-20260717031349-8fdb1f` | `awf/builder-20260717031349-8fdb1f` @ `5739b45b` | yes | 1: `?? frontend/src/services/phonepePayment.test.ts` (`4c2ae577` ≠ main `77c919e7`) | Review untracked variant vs main, integrate or discard, then `git worktree remove` + `git branch -d` (owner-gated) |
| `builder-20260717031405-86b7c5` | @ `5739b45b` | yes | 1: `?? subscriptionApi.test.ts` (`52bb08d5` ≠ main `55b717f7`) | same |
| `builder-20260717032521-564665` | @ `0fb8bb2d` | yes | 2: ` M adminSupabaseApi.ts` (`af980f6d` ≠ `51f3d96c`), `?? adminSupabaseApi.test.ts` (`89324fc0` ≠ `95f58a6b`) | Review modified service + test variant, reconcile, then owner-gated removal |
| `builder-20260717032527-81c044` | @ `0fb8bb2d` | yes | 2: ` M agencyPortalApi.ts` (`70bd615f` ≠ `4e4194db`), `?? agencyPortalApi.test.ts` (`beba486d` ≠ `b3a54258`) | same |
| `builder-20260717160103-869722` | @ `5430ae9a` | **no** (1 unique commit `5430ae9a` `test(errors): cover safe user-facing fallbacks`, +43 lines) | **0 (clean)** | Content is a strict subset of main (`git diff` = main adds 40/removes 1). `git branch -d` refuses because the commit is not an ancestor; keep as historical ref or remove only with owner authorization |
| `builder-20260718034641-ba3f6d` | @ `38fe03e9` | **no** (1 unique commit `38fe03e9` `fix(shipment): guarantee six-character IDs`) | 1: `?? frontend/.impeccable/` | Both files byte-identical to main (`git diff` empty) — content already in main. Inspect `.impeccable/`, then owner-gated removal |
| `builder-20260719042421-22fca6` | @ `98520fc2` | yes | 1: `?? agencySupabaseApi.test.ts` (`2f4fed1e` ≠ main `1a8beb11`) | Review test variant vs main, reconcile, then owner-gated removal |
| `builder-20260719042421-72a077` | @ `98520fc2` | yes | 1: `?? agencyPortalApi.test.ts` (`beba486d` ≠ `b3a54258`) | same |
| `builder-20260719042837-07d226` | @ `98520fc2` | yes | 1: `?? agencySupabaseApi.test.ts` (`55d27b56` ≠ `1a8beb11`) | same |
| `builder-20260719042837-c63f1a` | @ `98520fc2` | yes | 1: `?? agencyPortalApi.test.ts` (`5eedc5f5` ≠ `b3a54258`) | same |
| `builder-20260719043318-c18c62` | @ `98520fc2` | yes | 1: `?? agencySupabaseApi.test.ts` (`ff3b3ef6` ≠ `1a8beb11`) | same |

Note: every dirty file **differs** from main's current version, so each worktree holds a real unintegrated variant. Ignored entries are minimal (3/2/3 sampled: `node_modules`-class), so removal would technically be possible after the dirty entries are resolved; it was not done because the rule is "clean AND merged".

## Legacy detached worktree (parked, not in the ask's named scope)

`D:/system files/Temp/Legacy-tmp/zcode-jobs/z-to-132/wt` — HEAD `2eaf61d8` ("fix(offers): accept job-scoped trip-photo URLs…, DB proof 21/21 (TO-130)"), **merged into main**, but dirty with 7 entries: `A agent-results/022-result.md`, `M frontend/src/components/ErrorBoundary.tsx`, `M frontend/src/main.tsx`, `M frontend/src/utils/logger.ts`, `A frontend/src/utils/monitoring.ts`, `A frontend/src/utils/monitoring.test.ts`, `M scripts/test-server-routing.mjs`. Next action: review/integrate that work, then owner-gated removal.

## Parked branches (preserved; only the proven-merged staged branch was deleted)

| Branch @ tip | Last commit | Merged into main | Unique vs main | Disposition / next action |
|---|---|---|---|---|
| `stitch/driver-docs-upload-20260919` @ `d66f10db` | 2026-09-19 | yes | 0 | **DELETED** via `git branch -d` (exit 0); tip remains reachable in main history |
| `backup/cloud-sanitized-20260601-110912/Truck_Opti` @ `dc5e1bbd` | 2026-06-01 | no | 6 | Preserved. Owner reviews divergent snapshot; delete only after explicit authorization |
| `copilot/demo-accounts-and-audit-fix` @ `c5f2c8cc` | 2026-06-09 | no | 11 | Preserved. Owner reviews 11 unique commits (includes `qs` advisory bump); delete only after authorization |
| `copilot/to109-demo-accounts-v2` @ `7609dc84` | 2026-06-09 | yes | 0 | Preserved per instruction (merged; 0 unique) — safe-to-delete candidate, owner-gated |
| `stitch/pilot-20260911` @ `ec3e48dd` | 2026-09-06 | yes | 0 | Preserved per instruction; safe-to-delete candidate, owner-gated |
| `sync-safety/pre-sync-20260912` @ `8724f757` | 2026-09-11 | yes | 0 | Preserved per instruction; safe-to-delete candidate, owner-gated |
| `ultra/referral` @ `cbd0737f` | 2026-06-25 | yes | 0 | Preserved per instruction; safe-to-delete candidate, owner-gated |
| `wip/local-20260630` @ `2fef8626` | 2026-06-30 | yes | 0 | Preserved per instruction; safe-to-delete candidate, owner-gated |

No local branch has a remote counterpart for these refs (`git branch -r` lists only origin/* and heroku/main; no `stitch/*`).

## Stashes (preserved, none dropped)

1. `stash@{0}` — On main: `sync-2026-09-12 full safety snapshot (tracked mods + untracked, tree restored after)`
2. `stash@{1}` — WIP on (no branch): `6f5cc272 merge: document project completion gaps (copilot/identify-gaps)`
3. `stash@{2}` — On main: `park broad service-layer and agency-portal refactor 2026-05-17`

Next action for each: owner review before any `git stash drop`; not authorized here.

## Untracked path dispositions (none deleted, none committed)

| Path | Classification | Disposition |
|---|---|---|
| `.serena/` (5 files: cache + `project.yml`) | Local tool cache/config (Serena LSP) | Keep as local tool cache; never commit |
| `.vscode/mcp.json.bak-qdrant-cleanup` | Stale local backup of `.vscode/mcp.json` | Keep as stale backup; owner may delete |
| `closeout-logs/` (55 files, 293 KB: incident-2026-09-11, sync-2026-09-12, to128 serve/vite logs) | Closeout/session log evidence | Keep as evidence; not a commit candidate |
| `.ai-work-factory/quality.json` | Local factory quality profile (untracked; not in the ask's list) | Keep as local tool config |
| `agent-results/completion-truth-20261002.md`, `agent-results/functional-coverage.md` | **Tracked** (committed `366a1e7b`), not untracked | Ask's premise corrected; nothing to do |

## Regression / verification evidence

- No product file was moved, modified or deleted; only a branch ref was deleted, so no build/test rerun was performed or required by this slice. Evidence level: **local git metadata and working-tree inspection only** (no staging/production).
- Safe-delete proof: `git merge-base --is-ancestor d66f10db main` → true; `git rev-list --count main..d66f10db` → 0; not checked out in any worktree.
- Post-deletion: `git branch` no longer lists `stitch/driver-docs-upload-20260919`; `git rev-parse --verify refs/heads/stitch/driver-docs-upload-20260919` → fatal (gone, expected); all 11 worktrees and 3 stashes unchanged.

## Board changes (commit)

- `TASKS.md`: TO-140 row → AWAITING_REVIEW with result reference; "Repository state parked for TO-140" replaced with the measured final disposition; 2026-10-05 day-close entry added.
- `agent-results/030-result.md`: this file.
- Commit contains board/doc changes only; no push; no product code.

## Unresolved risks and owner gates

- 10 worktrees hold dirty content that differs from main; if pruned without review that content is lost. No such action taken.
- Branch deletions beyond the one executed (including the 5 merged zero-unique refs), stash drops, worktree force-removal, and integration of dirty worktree content remain owner-gated.
- The 110 non-Truck_Opti directories belong to other repositories' worktree registries; any cleanup there is that owner's decision.
- `.impeccable/` untracked dir in `builder-20260718034641-ba3f6d` and the Temp legacy worktree's 7 dirty entries need human/supervisor review.

## Next recommendation

1. GPT-6 review of this result and commit → TO-140 DONE.
2. Queue an owner-gated follow-up to review the 10 dirty worktree variants and the Temp legacy worktree content (monitoring/022 work) — integrate or explicitly archive.
3. After that review, one-shot removal of clean+merged worktrees and the 5 merged zero-unique parked branches (`copilot/to109-demo-accounts-v2`, `stitch/pilot-20260911`, `sync-safety/pre-sync-20260912`, `ultra/referral`, `wip/local-20260630`).
