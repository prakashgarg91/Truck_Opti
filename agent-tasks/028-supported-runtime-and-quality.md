# TO-138 — Align supported Node runtime and close quality warnings

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** TO-121 before final gate validation. No production deployment.

## Goal and evidence

Local checks ran on Node 24.14.0, while root engines, Docker and CI select Node 20. The official Node schedule ends Node 20 support on 2026-04-30. Lint has 26 warnings. Build warns about browser-external PGlite Node APIs, dependency eval and large chunks.

## Allowed scope

package.json and lockfile if required; Dockerfile; .github/workflows/frontend-ci.yml; heroku.yml if necessary; frontend/package.json only where needed; the 26 current lint-warning locations; frontend/vite.config.ts and PGlite imports only for measured browser-boundary problems.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Align engine, CI and container to Node 24 LTS, verifying installed package engines and clean-install reproducibility. Do not blanket-upgrade dependencies: React Router is already 7.18.3 and fresh root/frontend production audits show zero vulnerabilities. Resolve the 26 recorded hook/type warnings without disabling rules or raising the warning cap. Investigate PGlite Node-only modules included in a browser build and use documented browser entry/imports where justified. Keep vendor eval/size warnings attributed to dependencies with a measured risk decision; do not promise removal by suppressing warnings or rewriting vendor files. Validate lazy-load/PWA sizes and initial-route assets.

## Required checks

Clean root/frontend npm ci on the intended runtime in CI; full build/lint/unit/packing/policy/routing and smoke. Target lint zero warnings in app code. Audit relevant root/frontend/legacy dependencies and check engines. Verify container/start health locally if available. Reference https://raw.githubusercontent.com/nodejs/Release/main/schedule.json.

## Acceptance

Build/CI/deploy select one supported runtime, app lint warnings are resolved, and remaining vendor warnings have an evidence-backed disposition.

## Handoff

Write agent-results/028-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
