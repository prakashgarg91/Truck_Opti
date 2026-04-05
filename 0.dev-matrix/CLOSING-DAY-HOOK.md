# Closing Day Hook

Run `npm run close-day` from repo root before ending the work day, before push, or before claiming readiness.

Start the session with `0.dev-matrix/resume-work.ps1` when it exists so background launch-check begins early instead of waiting for close-day.

For a short pause or context switch, use `0.dev-matrix/pause-work.ps1` plus a brief `AI-HANDOFF.md` update instead of the full close-day path.

The hook keeps close-day short: it reuses the latest background launch-check status from `resume-work.ps1`, verifies a continuation-ready `0.dev-matrix/AI-HANDOFF.md` entry for today, checks launch focus and status discipline, records `git status`, and writes `0.dev-matrix/LAST-CLOSEOUT.md`. Heavy verification should be done during active work or an explicit readiness pass, not deferred until close-day.

Required close-day handoff fields in the newest `AI-HANDOFF.md` entry:
- `Changed:`
- `Verified:`
- `Operational proof:`
- `Continue from:`
- `Next step:`
- `Blockers:`

Required launch-focus fields in `0.dev-matrix/LAUNCH_CHECKLIST.md`:
- `Product outcome:`
- `Current launch slice:`
- `Current blocker:`
- `Next earning step:`
