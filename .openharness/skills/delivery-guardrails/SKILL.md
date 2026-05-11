---
name: delivery-guardrails
description: Fail fast on missing handoff, launch, spec, and repeated-blocker evidence so work does not drift into vibe coding.
---

# Delivery Guardrails

## When to use
Use when starting work, before declaring a slice done, before close-day, or whenever repo truth may be stale.

## Workflow
1. Read the latest `0.dev-matrix/AI-HANDOFF.md`, `0.dev-matrix/LAST-CLOSEOUT.md`, `0.dev-matrix/LAUNCH_CHECKLIST.md`, and the task board.
2. If required fields are missing or placeholder, repair those files before writing more product code.
3. For product repos, confirm a spec artifact exists (`0.dev-matrix/SPEC.json`, `SPEC.json`, or `openapi.json`) before new feature work.
4. If the same blocker or error repeats, record it in the repo handoff and capture a normalized session in `D:\Github\PPF-Past-Present-Future`.
5. Keep close-day under 10 minutes by moving heavy validation into active work; close-day is only for fast guardrails, proof, and the next checkpoint.

## Rules
- Do not call a slice complete if handoff, launch focus, or proof is stale.
- Do not start a new feature when the spec gate is missing in a product repo.
- Use the delivery-intelligence hub to stop repeated blockers from resetting every session.
- If guardrails are blocked, fix them before broad implementation.
