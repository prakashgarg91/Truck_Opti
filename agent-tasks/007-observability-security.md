# TO-118 — Observability and security hardening

## Objective
Make failures visible and production risk reviewable before launch.

## 2026-09-30 execution update
This is an umbrella, not a single GLM implementation assignment. Execute the bounded briefs for TO-131 (021 safe errors), TO-132 (022 monitoring), TO-136 (026 final-schema/admin authorization proof), and TO-138 (028 supported runtime/quality). See TASKS.md and agent-results/010-result.md. GPT-6 consolidates accepted results into agent-results/007-result.md. Do not mark this umbrella DONE from source-regex or mocked tests alone.

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
