# Deep Verification Standard

## Purpose

Launch readiness is the minimum bar. Professional close-of-day discipline should also search for hidden defects across features, paths, layers, and user flows.

## Required Deep Verification Coverage

Each repo should define the strongest available non-destructive checks for:

- frontend behavior and rendering
- backend/service health and integration behavior
- end-to-end or feature-flow execution
- hidden-error or deep-scan tooling
- bug-mapper or anomaly-detection tooling
- coverage or breadth checks where available

## Close-Day Rule

If a repo has dedicated deep verification commands, the close-day hook should run them and record pass/fail evidence.

## Professional Expectations

- Prefer real flows over shallow unit claims.
- Prefer multi-layer evidence over a single green command.
- Surface failures instead of deferring them silently.
- Keep the deep-verification suite repo-specific but policy-consistent.
