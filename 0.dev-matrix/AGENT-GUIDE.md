# VibeSys — Agent Guide

You are an AI agent. This file tells you how to use VibeSys to develop **any**
project to production quality, managed or unmanaged. Read it once, then drive.

## What VibeSys is
A harness, not a model. It makes the *cheapest capable* model ship correct code by
constraining it: a SPEC before code, an improve-grade plan written for the weakest
executor, a model-family-tuned worker prompt (harness emulation), and a
**deterministic proof gate** (the task's own command is run; the model never grades
itself). Quality comes from the harness.

## Invoke
```
# Windows:           vibesys.bat <command> [args]
# Any OS (Bun):      bun run packages/vibesys/src/cli.ts <command> [args]
# Any OS (Node 22+): node --experimental-strip-types packages/vibesys/src/cli.ts <command> [args]
```
Target any repo with `--repo <path>` / `-C <path>`, or `VIBESYS_REPO=<path>`.
With no `--repo`, commands act on the VibeSys repo itself.

## The one rule before you run: doctor
ALWAYS run `doctor` first on a new project. It will not let you waste a run.
```
vibesys doctor <repo>
```
It checks: a task board loads, actionable tasks exist, **every actionable task has
a proof command**, an AI executor is installed, git is present. Fix every `✗`
before continuing. If a task has no proof command, the gate has nothing to verify —
add one (see "Task board" below).

## Two ways to drive

### Unmanaged (hands-off) — preferred for a ready repo
```
vibesys --repo <repo> auto --all      # whole active/ready queue
vibesys --repo <repo> auto <task-id>  # one task
```
Per task it runs: ensure SPEC → ensure PLAN → [build → proof]×N, escalating the
model tier on each failure (flash → kimi → deepseek-pro), and STOPS as
`ship-ready` (proof passed) or `blocked` (exhausted/insufficient). Never fakes a
pass. Transcript: `artifacts/<task-id>/autopilot-result.json`.

### Managed (step the pipeline yourself)
```
vibesys --repo <repo> spec   <task-id>   # SPEC.json before any code
vibesys --repo <repo> plan   <task-id>   # improve-grade plan → plans/<id>.plan.md
vibesys --repo <repo> run    <task-id>   # dispatch build to the cheapest model
vibesys --repo <repo> review <task-id>   # runs the proof gate, then adversarial review
vibesys --repo <repo> ship   <task-id>   # prints git steps for human sign-off
```

## Task board (how a project declares work)
`<repo>/0.dev-matrix/AI-TASKS.json` (or `<repo>/AI-TASKS.json`). Accepted shapes:
top-level array, `{ "tasks": [ ... ] }`, or repo-keyed. Field aliases are normalized
(`definitionOfDone`→doneWhen, `validation[]`→validate). Minimum useful task:
```json
{ "tasks": [{
  "id": "PROJ-1",
  "title": "…",
  "status": "active",
  "why": "…",
  "doneWhen": "…",
  "validate": "npm run build && npm test",   // ← the proof gate. REQUIRED to run unmanaged.
  "ownerFiles": ["src/x.ts"]
}]}
```
The `validate` command is the contract: when it exits 0, the task is done.

## Hard rules you (and every worker) must honor
1. Never `git commit/push/reset` — changes stay in the working tree; a human signs off.
2. Never claim a command passed without its real output. The proof gate is the truth.
3. Touch only the files the plan names. Out of scope → STOP and report.
4. Missing creds/services/network → mark blocked, record why, STOP. Never fabricate.
5. One bounded task per run. Don't refactor unrelated code.
6. Preserve file line endings when editing (a flipped CRLF/LF makes a catastrophic diff).

## Where things land
- Plans: `<repo>/plans/<task-id>.plan.md`
- Artifacts/transcripts: `<repo>/artifacts/<task-id>/`
- Session memory: `<repo>/0.dev-matrix/AI-HANDOFF.md` (newest entry on top)

## Completing a pending project, start to finish
1. `vibesys doctor <repo>` → fix blockers.
2. Ensure `AI-TASKS.json` lists the work, each with a real `validate` command.
3. `vibesys --repo <repo> auto --all`.
4. For each task, read `artifacts/<id>/autopilot-result.json`; if `blocked`, read the
   reason, fix the plan or the blocker, re-run.
5. Review the diffs and `vibesys ship` each one — the human owns the final git action.
