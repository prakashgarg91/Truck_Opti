# Anti-Hallucination Standard

## Purpose

Prevent AI agents from claiming work is done without delivering real, verifiable, working software. This is the single most important standard in the system.

## Core Principle

**Proof beats claims. Output beats labels. Working software beats documentation.**

No AI agent may declare work complete, claim a percentage, or close a day without machine-verifiable evidence. If it can't be checked by a script, it didn't happen.

---

## Rules

### 1. No Completion Claims Without Passing Gates

- An AI must not state any completion percentage (e.g., "95% done") unless the number correlates to a measurable metric: test pass rate, coverage percentage, features marked done in `features.json`, or tasks marked complete in `TASK.md`.
- If asked "how done is it?", the AI must answer with verifiable data, not feelings.
- Acceptable: "14 of 18 tests pass (78%). Coverage is 62%. 3 of 5 features land."
- Unacceptable: "About 90% done, just a few things left."

### 2. No Output Suppression in Evidence

- Close-day and launch-check scripts must capture command output to log files, not discard it with `*> $null`.
- LAST-CLOSEOUT.md must include or reference actual command output, not just PASS/FAIL labels.
- An AI reviewing a closeout must be able to see *what the commands actually printed*.

### 3. No Empty Deep Verification

- A close-day script must not have `$DeepVerificationTasks = @()`.
- Re-running the same command that launch-check already runs does not count as deep verification unless it runs with additional flags (e.g., `--coverage`, `--strict`, `--verbose`).
- Deep verification must test a *different dimension* than launch-check. If launch-check does lint + build, deep verification must do tests, coverage, or flow checks.

### 4. No Trivial Status Discipline

- Touching STATE.md with whitespace does not satisfy the status-update discipline gate.
- The gate must verify that the content of STATE.md reflects current reality: agent registrations should not be more than 7 days stale, and the top-level status summary must have been modified in the current session.

### 5. No Fire-and-Forget Vulnerability Remediation

- After `npm audit fix`, the launch-check or close-day must re-run tests to verify that the fix didn't break anything.
- Remaining vulnerabilities must be logged with severity, not just counted.

### 6. No Claims Without Runtime Proof

- "Backend works" requires an actual health-check response, not just `manage.py check` passing.
- "Frontend works" requires a build AND at least one test passing, not just a build.
- "Integration works" requires proof that frontend can reach backend, not just that both start independently.

### 7. No Overwriting Evidence

- LAST-CLOSEOUT.md must be appended or archived, not overwritten.
- The system must detect regression: if yesterday had 7 passes and today has 5, that must be flagged.

### 8. No Stale Data in Tracking Files

- features.json, issues.json, metrics.json must be validated against their schemas when schemas exist.
- Entries older than 30 days without updates must be flagged.

### 9. No Manager-Mode-Only Sessions

- If an AI spends an entire session in manager mode producing only documentation and status updates without any code change, test run, or build, the close-day hook must flag this as a documentation-only session.
- This is not automatically a failure, but it must be explicitly labeled so the human can decide if that was valuable.

### 10. No Duplicate Verification

- If launch-check already runs `npm run lint`, the close-day deep verification must not count `npm run lint` again as a separate pass. Duplicate gates inflate pass counts and create false confidence.

---

## Enforcement

These rules are enforced by:
- Hardened close-day scripts that capture output and detect regression
- Launch-check gates that validate JSON schemas and STATE.md freshness
- `AGENTS.md` workspace instructions plus targeted `.github/instructions`, `.github/agents`, and `.github/hooks` customizations that load the right policy for the task
- Human review of LAST-CLOSEOUT.md evidence

## For AI Agents Reading This

You are expected to deliver working software, not claims about working software. If you cannot prove something works, say so honestly. A truthful "this is broken and here's why" is worth more than a false "everything passes." Your credibility is built on honesty, not on pass counts.
