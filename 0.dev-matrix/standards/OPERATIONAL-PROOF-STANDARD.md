# Operational Proof Standard

## Purpose

Turn verification from a claim into a reusable proof record that the changed system behavior actually ran.

## Rule

Glue principles are not enough on their own. When a task changes behavior, the repo should retain the strongest non-destructive operational proof available for that path.

## Minimum Operational Proof

Operational proof should capture:

- the command, route, or flow that was exercised
- the scope of the proof, such as API, UI, worker, integration, or end-to-end
- the observed result, status code, or pass/fail outcome
- an artifact, report path, or log reference when one exists

## Acceptable Examples

- `npm run test:e2e` passed and the report lives in `0.dev-matrix/test-reports/e2e-latest.json`
- `GET /health` returned `200 OK` against the local stack
- `python launcher.py sandbox-e2e` passed and the result is captured in `0.dev-matrix/closeout-logs/closeout-2026-04-03_103541.log`

## Unacceptable Examples

- `works now`
- `verified manually`
- `looks good`
- `none`

## Close-Day / Handoff Contract

- The newest `AI-HANDOFF.md` entry must include `Operational proof:`.
- `Operational proof:` must not be `none`.
- If no runtime proof was run, the field must say `not run - <reason>` and the blocker must explain why that was acceptable for the session.
- Close-day reports should surface the latest operational proof line so the next reviewer can inspect it quickly.