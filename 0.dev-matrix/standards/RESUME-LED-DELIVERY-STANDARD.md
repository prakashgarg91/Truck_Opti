# Resume-Led Delivery Standard

## Purpose

Use the dev-matrix to help limited daily work sessions finish real launch work instead of reopening broad, half-built threads.

## Core Rule

Every session should do one of these three things:

1. advance the current launch slice
2. clear the current launch blocker
3. explicitly park unfinished work so the next session can resume cleanly

If a session does none of these, it is process churn.

## Start-Of-Session Workflow

Before writing code:

1. read `0.dev-matrix/AI-HANDOFF.md` first
2. run `git status`
3. run `0.dev-matrix/resume-work.ps1` when it exists
4. confirm the current launch slice and current blocker in `0.dev-matrix/LAUNCH_CHECKLIST.md`
5. choose the smallest launch-enabling step that fits the available time

`launch-check` is for readiness claims and close-day verification. It is not the default first command for every short restart.

## Launch-Focus Contract

Every launch-oriented repo must keep these lines current in `0.dev-matrix/LAUNCH_CHECKLIST.md`:

- `Product outcome:`
- `Current launch slice:`
- `Current blocker:`
- `Next earning step:`

These lines must describe the current money-facing path, not a vague long backlog.

## Half-Baked Work Rule

Do not open a new partially built lane while another unfinished lane is still the real blocker to launch.

Unfinished work must be one of these:

- the current launch slice
- the current blocker
- explicitly parked in `TASK.md` and `AI-HANDOFF.md` with a reason

If work is no longer launch-relevant, park it or archive it. Do not leave it mixed with active launch work.

## Short-Session Rule

When time is limited:

- prefer one shippable or unblock-only step
- avoid broad refactors unless they directly unblock launch
- leave the next step small enough for the next short session to resume immediately

## Close-Day Rule

Close-day is not complete unless the newest handoff entry and launch checklist tell the next AI exactly:

- what to resume
- what is blocking launch
- what the next earning-oriented step is

## Anti-Drift Rule

If a repo keeps accumulating half-baked work without launch movement, the dev-matrix should surface that drift through:

- stale or vague launch checklist entries
- vague `Next step:` handoff notes
- repeated close-day reports with no launch-blocker reduction

That state should be treated as a process failure, not normal progress.
