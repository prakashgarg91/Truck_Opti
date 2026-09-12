# TO-HYG-002 — Audit and retire obsolete embedded G2G development tooling

## Priority

**Deferred behind TO-112 production readiness.** Do not let this hygiene task displace launch/security/core-flow work unless the G2G framework is actively breaking the current build, tests, packaging, or runtime.

## Objective

Determine which `apps/desktop/G2G/` and related TruckOptimum autonomous-development files are real product/runtime dependencies versus obsolete AI-development scaffolding, then safely consolidate/remove only the latter.

## Known surfaces to inspect

- `apps/desktop/G2G/`
- `apps/desktop/TruckOptimum/multi_agent_coordinator.py`
- `apps/desktop/TruckOptimum/development_automation_framework.py`
- `apps/desktop/TruckOptimum/auto_improvement_integration.py`
- `apps/desktop/TruckOptimum/start_with_auto_improvement.py`
- G2G-specific screenshot/log/evidence helpers and documentation

## Required approach

1. Search imports, entry points, package/build scripts, tests and docs for every candidate before deletion.
2. Classify each candidate as PRODUCT_RUNTIME, CURRENT_TOOLING, HISTORICAL_ONLY, or DEAD.
3. For code-coupled candidates, write/adjust tests before behavior-affecting removal or replacement.
4. Preserve any real UX/telemetry capability by moving it into normal product modules with clear ownership; do not preserve an autonomous coding framework merely because product code imports it.
5. Remove generated logs/evidence and agent coordination docs once no current code depends on them.
6. Update references/imports in the same task and run focused plus repository-level verification.
7. Do not alter packing logic, production auth/payment behavior, or deployment configuration as incidental cleanup.

## Acceptance

- No obsolete multi-agent development framework remains on active runtime/import paths.
- Any retained G2G-named code has a documented product purpose and tests.
- Generated logs/screenshots are not tracked as source-of-truth artifacts.
- `AGENTS.md`/`TASKS.md` remain the only development coordination authority.
- Write `agent-results/002-result.md` with classification, changes, commands and evidence.
