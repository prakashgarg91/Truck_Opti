# TO-139 — Audit implemented journeys for UX and accessibility gaps

**Owner:** GLM-5.3 Flash implementation; GPT-6 review.
**Status at assessment:** WAITING_DEPENDENCY.
**Spec:** ARCHITECTURE.md and TO-112 in agent-tasks/001-production-readiness.md, refined by agent-results/010-result.md.
**Dependencies:** Relevant core UI tasks accepted; follow Stitch status/guide and owner selection for P1/P2 design changes.

## Goal and evidence

The September design audit scores generated Stitch HTML and marks offer acceptance unreachable despite an existing dashboard modal. Generated-screen scores cannot establish actual app behavior or route completeness.

## Allowed scope

docs/design-audit.md; existing route components/layouts/support configuration affected by concrete findings; browser accessibility/route checks under scripts/.

## Implementation prompt

Follow the shared completion-task contract in agent-tasks/README.md. Complete this assigned slice only.

Refresh the actual application audit, including every current App route and action-to-API mapping. Reuse existing Stitch project/screens; no automatic mutation retries. Distinguish generated design quality from integrated route quality. Identify broken navigation, misleading success, fake data, missing empty/loading/error/permission states, labels/focus, contrast, mobile overflow, Hindi/English consistency and working Terms/Privacy/support targets. Test 390x844 and 1280x900, fresh/returning contexts and allowed/denied roles. Fix P0 journey defects one screen at a time. Document P1/P2 findings for owner selection; keep cosmetic expansion separate from engineering completion. Remove invented support phone numbers or replace with verified configured contact.

## Required checks

Real browser screenshots and action/network evidence for affected routes; keyboard and accessibility checks; public/authenticated smoke; build/lint/unit after each screen. Do not claim staging/provider-backed states from mocked UI tests. Report Stitch IDs/artifacts/mutations/retries as required.

## Acceptance

The implemented route inventory has no unresolved journey-breaking UX issue, and every supported action/state is backed by evidence or an explicit owner-accepted limitation.

## Handoff

Write agent-results/029-result.md with changed files, commands/directories/exit codes/counts, red/green regression evidence, evidence level (mock/local/staging/production), unresolved risks, owner gates, next recommendation and git state. A worker PASS means ready for GPT-6 review; it does not authorize DONE, deployment or live changes. If a dependency is missing, report BLOCKED and complete independent preparation without fabricating operational proof.
