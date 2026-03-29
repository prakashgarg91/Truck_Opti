# Quality Baseline

This repository is a separate software product. Use this file as the standing quality bar for all future work.

## Core Direction

- `0.dev-matrix` is for repo-specific context, operating procedures, quality discipline, and codebase truth. Model-selection rules belong in `AGENTS.md`, not here.
- Use `0.dev-matrix` as the operating system for planning, status, task tracking, dependency mapping, patterns, discussion, and testing evidence.
- Build and judge the software as an integrated system, not as isolated file edits.
- Keep the codebase tree clean, professional, sustainable, and easy to onboard into.

## Quality Gates

- Verify end-to-end glue across UI, API, services, data, auth, jobs, infrastructure, and configuration.
- Do not accept "done" without evidence such as tests, builds, typechecks, health checks, audits, or runtime verification.
- Prefer durable architecture, clear ownership, low coupling, and maintainable naming over quick patches.
- Reduce dead code, drift, duplicate logic, misleading docs, and orphaned files whenever it is safe to do so.

## Documentation Discipline

- Keep `STATE.md`, `TASK.md`, `DISCUSSION.md`, `DEPENDENCIES.md`, and `PATTERNS.md` aligned with observed reality.
- Record integration risks, testing evidence, and architectural decisions where future agents can find them quickly.
- Treat this repo's `0.dev-matrix` as repo-local truth, not as a generic template for other apps.
