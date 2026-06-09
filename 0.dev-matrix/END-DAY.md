# End Day

Purpose: close the session fast, keep repo truth current, and preserve the exact restart point for the next day.

Target: finish end-day in under 10 minutes.

## Standard Entry

Preferred repo-local entry:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\close-day.ps1
```

Meta cross-repo entry:

```powershell
powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\close-day.ps1
```

## Required End-Day Outputs

Before stopping, make sure the newest `AI-HANDOFF.md` entry contains:

- `Changed:`
- `Pending:`
- `Verified:`
- `Operational proof:`
- `Continue from:`
- `Next step:`
- `Technical debt:`
- `Blockers:`

Also make sure `LAUNCH_CHECKLIST.md` still has truthful values for:

- `Product outcome:`
- `Current launch slice:`
- `Current blocker:`
- `Next earning step:`

## Manual End-Day Sequence

1. Run the close-day helper.
2. Capture the real validation evidence from today's work.
3. Update handoff and launch focus files with changed work, pending work, and any new technical debt.
4. Check the working tree:

```powershell
git status --short
```

5. If commits are ready, verify upstream state and push intentionally.
6. Record any repeated blocker so it does not reset tomorrow.

## What End-Day Must Not Become

- a late full test marathon that should have happened during active work
- a vague handoff with no resume point
- a clean-sounding report without operational proof
- a place to hide that launch focus is still unclear

## Fast Failure Rules

- If heavy testing starts only at shutdown, move that validation into the next active slice.
- If `AI-HANDOFF.md` is vague, fix it before stopping.
- If `LAUNCH_CHECKLIST.md` is placeholder text, the repo is not truthfully ready for handoff.
- If the repo still depends on Roo fallback search, note that explicitly so the next session does not assume full Qdrant coverage.
- If pending work or new technical debt is omitted from the handoff, the repo truth is incomplete.

## Optional GitHub Backup Push

When work is already committed and ready to sync:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\close-day.ps1 -PushToGitHub
```

Use push as a deliberate final sync step, not as a substitute for handoff quality.