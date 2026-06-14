# INDEX -- 0.dev-matrix Operating Index

Purpose: provide one canonical entrypoint for session start, knowledge-ledger checks, test-first delivery, and closeout reconciliation.

## Required Read Order

1. `STATE.md` -- current blockers, alerts, and active systems
2. `AI-HANDOFF.md` -- newest truthful restart point
3. `TASK.md` -- active queue and owner/slice alignment
4. `INDEX.md` -- working protocol and document map

## Non-Negotiable Gates

- Zero-guessing: no non-trivial code change before Graphify and code-review-graph are used to map structure and blast radius.
- Context audit first: every requested change starts with a short report of likely files, dependency risk, first failing check, and proof command.
- Test-driven prompting: ask for the failing test first, confirm red, then implement the minimum code required for green.
- Micro-scoping: one bounded transaction, one owner, one proof command.
- Reconciliation: every session ends with changed work, pending work, proof, blockers, and new technical debt captured in `AI-HANDOFF.md`.

## Context Audit Template

Use this before implementation:

```text
CONTEXT AUDIT
Slice: <smallest transaction>
Files: <likely files or modules>
Dependencies: <what could break>
Test first: <test to write or failing check to run>
Proof: <command or executable validation>
```

## Prompt Order For Behavior Changes

1. Ask for the narrow test first.
2. Run it and capture the expected failure.
3. Ask for the minimum implementation.
4. Re-run the same test.
5. Run the next narrow build, lint, typecheck, or impact check.

## Canonical Documents

- `FACTORY-HIERARCHY.md` -- tiered model factory manual (haiku/sonnet/opus/Fable 5 + opencode workers)
- `FACTORY-FLOW.md` -- per-repo flow digest stamped into every onboarded repo (`update-repo-flow-docs.ps1` re-stamps)
- `OPENCODE-MANAGER.md` -- opencode lanes, default models, leases
- `AGENTS.md` -- repo-level AI contract
- `AGENT-WORKFLOW.md` -- manager mode and two-task discipline
- `START-DAY.md` -- session boot sequence
- `END-DAY.md` -- closeout sequence
- `WATCH.md` -- automation and retrieval layer
- `GRAPHIFY.md` -- structural map usage
- `CODE-REVIEW-GRAPH.md` -- impact and blast-radius usage
- `TESTING_PRINCIPLES.md` -- validation and proof standard
- `RULES.md` -- baseline process rules
- `LAUNCH_CHECKLIST.md` -- current launch focus
- `REPO-LAYOUT-INDEX.md` -- structural document and helper map
- `INDEX-OF-CODE.md` -- generated code index artifacts