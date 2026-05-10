# OpenHarness

Purpose: use OpenHarness as the repo-local execution harness that carries the dev-matrix launch, validation, and handoff rules into agentic work.

## Standard Entry

From inside a repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1
```

One-shot prompt:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -Prompt "What is the next validated slice that moves this repo toward launch or revenue?"
```

Dry-run preview:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -DryRun -Prompt "Review the current launch blockers in this repo"
```

## Current Defaults

- provider: GitHub Copilot
- model: `gpt-5.4`
- effort: `max`
- session context: WATCH start-of-day script runs first unless skipped
- repo-local skill layer: `launch-revenue` and `delivery-guardrails`

## What The Launcher Does

The repo-local launcher forwards into the shared harness runtime under `D:\Github\openharness`, then appends the dev-matrix operating mode:

- pick the smallest validated slice
- prioritize launch, customer value, or revenue
- separate human-blocked from AI-executable work
- repair stale handoff or launch truth before broad implementation
- keep close-day short by validating during active work

## Useful Prompts

- `What is the smallest validated slice that moves this repo toward launch or revenue?`
- `Read AI-HANDOFF.md, STATE.md, TASK.md, and LAUNCH_CHECKLIST.md and tell me the next concrete task.`
- `Review the current changes and list bugs, risks, and missing tests.`
- `Map the owning files for auth, webhook verification, and payment capture in this repo.`
- `Repair delivery guardrails before feature work.`

## Recommended Workflow

1. Run repo start-day first.
2. Launch OpenHarness from the target repo.
3. Keep the prompt scoped to one validated slice.
4. Require proof before calling the slice done.
5. End with updated handoff and the next earning step.

## Optional Flags

Skip WATCH startup if you already ran start-day manually:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -SkipWatch
```

Override prompt only when you need a focused one-shot:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -Prompt "Review the readiness of the current release branch"
```

## Operational Rule

Do not treat OpenHarness as a permission to skip repo truth. If `AI-HANDOFF.md`, `LAUNCH_CHECKLIST.md`, spec gate, or validation evidence is stale, repair those first or ask OpenHarness to repair them first.