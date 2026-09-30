# TO-121 — Repair canonical launch and closure gates

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** READY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** None. First recommended task.

## Goal and evidence

The launch/closure scripts require retired 0.dev-matrix handoff/standards files. 0.dev-matrix/AI-HANDOFF.md is absent. package.json still invokes the retired deep-error-scanner. This contradicts the current canonical control plane.

## Allowed scope

scripts/launch-readiness.ps1; scripts/close-day.ps1; scripts/track-errors.ps1; scripts/test-hidden-errors.ps1; package.json; scripts/deployment_safety.test.mjs; new focused gate tests under scripts/.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Replace retired document-presence checks with validation of AGENTS.md, ARCHITECTURE.md, TASKS.md, assigned briefs and result records. Preserve real build, lint, unit, packing, routing, dependency, runtime and deployment checks. Make launch-check report local engineering, environment prerequisites, workspace hygiene and owner-gated production checks separately. A skipped mandatory production gate must prevent a production-ready verdict. Make close-day consume TASKS.md and agent-results rather than generate a competing task/handoff system. Repair only active broken npm-script references; retire an obsolete command explicitly instead of restoring its old framework. Write reports under intentional logs/ or test-reports/ paths.

## Required checks

Test missing canonical file, failing command, missing browser/Python, unavailable live credentials, dirty unrelated user files, and a successful fixture. Run node --test scripts/*policy*.test.mjs scripts/deployment_safety.test.mjs scripts/test-server-routing.mjs, npm run launch-check and npm run close-day. Expected failures must remain failures; report the actual gate denominator instead of requiring historical 18/18.

## Acceptance

Both root commands run under the current operating contract, accurately distinguish PASS/FAIL/BLOCKED, and never recreate 0.dev-matrix planning documents.

## Handoff

Write agent-results/011-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
