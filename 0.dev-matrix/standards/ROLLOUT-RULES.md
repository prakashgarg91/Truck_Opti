# Rollout Rules

## Purpose

Use these rules when changing multiple repos at once.

## Rules

1. Audit first.
2. Standardize shape, not repo truth.
3. Prefer additive upgrades over destructive rewrites.
4. Preserve repo-specific overlays for domain, security, and launch behavior.
5. Record any repo that was skipped, deferred, or intentionally different.
6. Do not claim standardization is complete unless coverage is verified repo by repo.
7. Standardize tree hygiene expectations across repos and make them part of launch readiness.
8. Prefer moving stale material into explicit archive zones over leaving it mixed with active code.
9. Deep verification must be enabled in every repo's close-day hook. Empty `$DeepVerificationTasks` is not acceptable in a production system. If no runtime test suite exists yet, at minimum the code-quality gate (lint/static analysis) must be run as a named deep check.
10. Every repo must carry `0.dev-matrix/standards/DEEP-VERIFICATION-STANDARD.md`. Its presence must be enforced by the repo's launch-check gate.
11. Every repo must carry `0.dev-matrix/standards/ANTI-HALLUCINATION-STANDARD.md`. AI agents must read it before starting work. Its presence must be enforced by the repo's launch-check gate.
12. Close-day scripts must capture actual command output to dated log files in `0.dev-matrix/closeout-logs/`. Output suppression (`*> $null`) is forbidden in evidence-producing gates.
13. Close-day scripts must detect regression by comparing current pass/fail counts against the previous closeout. A drop in passes or rise in failures must be flagged.
14. Whitespace-only edits to status files (STATE.md, TASK.md) do not satisfy status-discipline gates. The system must verify real content changes via `git diff --stat`.
15. Every repo must carry `0.dev-matrix/standards/DOCUMENTATION-GOVERNANCE-STANDARD.md` and a repo-local `0.dev-matrix/DOCUMENTATION-GOVERNANCE.md`.
16. New docs must be consolidated into canonical zones; do not proliferate sibling FINAL/COPY/NEW/V2 report files in active paths.
17. Close-day must fail when new docs land in nonstandard locations or the working tree remains dirty beyond intentional runtime handoff files.
18. Every repo must carry `0.dev-matrix/AI-HANDOFF.md`, and close-day must fail unless the newest entry is dated today and contains `Changed:`, `Verified:`, `Continue from:`, `Next step:`, and `Blockers:`.
