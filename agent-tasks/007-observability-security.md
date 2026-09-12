# TO-118 — Observability and security hardening

## Objective
Make failures visible and production risk reviewable before launch.

## Depends on
TO-113 baseline plus accepted auth/provider/core fixes.

## Scope
- Logging/error reporting and health/readiness paths.
- Security-sensitive auth/data/provider/payment boundaries.
- Dependency/security scan findings relevant to deployable surfaces.
- Secret/data leakage, unsafe defaults, missing timeout/retry classification, and operational recovery evidence.
- Add tests first for behavior-changing fixes.

## Hard gates
No credential rotation, destructive production action or deployment without owner approval.

## Acceptance
No known unowned P0/P1 security/data-loss issue in scope; exact scan/test/build evidence and `agent-results/007-result.md`.