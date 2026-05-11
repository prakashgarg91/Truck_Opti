---
name: launch-revenue
description: Prioritize the next validated slice that moves this repo closer to launch, customer value, or revenue without drifting past delivery guardrails.
---

# Launch Revenue

## When to use
Use when the user asks what to build next, how to finish pending work, how to unblock launch, how to make the repo earn, or how to focus the backlog on revenue.

## Workflow
1. Read the nearest `0.dev-matrix/STATE.md`, `0.dev-matrix/TASK.md`, `0.dev-matrix/AI-HANDOFF.md`, `0.dev-matrix/LAST-CLOSEOUT.md`, `0.dev-matrix/LAUNCH_CHECKLIST.md`, and repo README before proposing work.
2. Repair fast delivery guardrails first if handoff truth, launch focus, spec gate, or delivery-signal capture is stale.
3. Split blockers into:
   - human-blocked: credentials, payments, OAuth, legal, production config, external approvals
   - AI-executable: code, tests, docs, scripts, manifests, validation
4. Pick one smallest AI-executable slice unless a human-blocked item is the true bottleneck.
5. Validate immediately with the cheapest repo-local command that can falsify progress.
6. If a blocker or mistake repeats across sessions, capture it in the repo handoff and a normalized session in `D:\Github\PPF-Past-Present-Future`.
6. End every session with:
   - what changed
   - proof of validation
   - the next earning step
   - owner actions still blocking revenue

## Rules
- Do not start speculative features before the launch path is clear.
- Do not keep coding past missing handoff, launch focus, spec, or proof gaps; fix the guardrail first.
- Prefer shipping, unblock, validation, onboarding, payment, retention, or client-deliverable work over internal polishing.
- If the repo is tooling or internal, optimize for the downstream product repo it unlocks.
- When multiple paths exist, choose the one with the fastest route to measurable earning or launch evidence.
- Keep close-day under 10 minutes by doing heavy validation during active work instead of deferring it to shutdown.
