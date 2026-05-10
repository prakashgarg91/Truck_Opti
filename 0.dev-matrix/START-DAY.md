# Start Day

Purpose: start work with current repo truth, fresh graph context, and one validated next slice instead of drifting into broad exploration.

Target: finish start-day in under 5 minutes for a normal repo.

## Standard Entry

Preferred repo-local entry:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\resume-work.ps1
```

If the repo does not yet have the helper, run the manual sequence below.

## Manual Start-Day Sequence

1. Read the newest entries in:
   - `0.dev-matrix/AI-HANDOFF.md`
   - `0.dev-matrix/STATE.md`
   - `0.dev-matrix/TASK.md`
   - `0.dev-matrix/LAUNCH_CHECKLIST.md`
   - `0.dev-matrix/LAST-CLOSEOUT.md`
2. Check the working tree before planning:

```powershell
git status --short
```

3. Refresh start-of-day maintenance when available:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\session-start-maintenance.ps1
```

4. Confirm the three retrieval layers are usable:
   - Roo bridge for semantic search
   - code-review-graph for impact and blast radius
   - Graphify for architecture map and freshness

5. Pick one smallest validated slice:
   - one user outcome
   - one owning repo
   - one cheapest falsifying validation command

6. If the repo will be worked through OpenHarness, launch it only after the truth files and graph state are current:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -Prompt "What is the next validated slice that moves this repo toward launch or revenue?"
```

## What Good Start-Day Looks Like

- repo state is truthful before coding starts
- graph tools are refreshed or explicitly marked fresh enough
- blockers are separated into human-blocked vs AI-executable work
- the next step already has a validation command
- no time is spent rediscovering yesterday's context

## Fast Failure Rules

- If `AI-HANDOFF.md` is stale, fix it before broad implementation.
- If `LAUNCH_CHECKLIST.md` still contains placeholders, repair launch focus first.
- If Graphify or code-review-graph is stale, refresh before architecture-heavy work.
- If Roo bridge has no matching Qdrant collection, note whether the repo is on true Qdrant search or fallback mode before relying on semantic search.
- If the slice has no validation command, the slice is not defined well enough yet.

## Recommended Output Of Start-Day

By the end of start-day, you should be able to say:

- what repo owns the current slice
- what is blocked
- what command will prove progress
- what the next earning or launch step is