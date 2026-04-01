# Closing Day Standard

## Purpose

Every repo should have a repeatable close-of-day workflow so work ends with verified quality, updated status, and professional handoff discipline.

## Required Close-Day Outcomes

1. Launch/readiness verification is run.
2. Relevant tests/build checks are covered through launch-check.
3. Repo-specific deep verification commands are run when available.
4. Non-breaking dependency vulnerability remediation is attempted.
5. Remaining vulnerabilities are surfaced explicitly.
6. Runtime status files are updated or intentionally left unchanged with a clean repo.
7. A closeout report is written with timestamp, commands, results, and follow-up.

## Minimum Hook Behavior

A repo-local close-day hook should:

- run the repo launch-check
- run repo-specific deep verification commands for flows, frontend, backend, and bug hunting when available
- run dependency vulnerability remediation for supported package surfaces
- re-check vulnerability status after remediation
- check `STATE.md`, `TASK.md`, and `DISCUSSION.md` update discipline
- capture `git status`
- write a machine-readable or markdown closeout summary

## Required Documentation

Each repo must carry these close-day standard documents:

- `0.dev-matrix/CLOSING-DAY-HOOK.md` — local hook policy for the repo
- `0.dev-matrix/standards/DEEP-VERIFICATION-STANDARD.md` — deep verification policy (sourced from Github-manager master)
- `0.dev-matrix/standards/ANTI-HALLUCINATION-STANDARD.md` — anti-hallucination enforcement policy (sourced from Github-manager master)

## Deep Verification Rule

Every repo's close-day hook must have non-empty `$DeepVerificationTasks`. Running "no repo-specific deep checks configured" as a pass is not acceptable in a professional production system. The minimum acceptable deep check is the repo's code-quality gate (lint, type-check, or static analysis). Repos with a test suite must run coverage or flow checks.

## Professional Close-Day Rules

- Do not close the day on claims alone; use evidence.
- Do not hide failing gates inside a handoff.
- Do not leave vulnerability findings undocumented.
- Prefer a clean tree or an explicit handoff, never silent drift.

## Anti-Hallucination Enforcement

- Close-day scripts must capture actual command output in `0.dev-matrix/closeout-logs/` with dated filenames.
- Previous closeout reports must be archived before overwriting.
- Regression detection must compare current pass/fail counts against the previous closeout.
- Empty `$DeepVerificationTasks` is a FAIL, not a pass.
- Whitespace-only status file edits are detected and rejected.
- See `ANTI-HALLUCINATION-STANDARD.md` for the complete rule set.
