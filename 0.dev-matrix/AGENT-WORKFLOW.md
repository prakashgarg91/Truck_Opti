# AGENT-WORKFLOW — Manager Mode + Two-Task Delivery

> Effective: 2026-05-14
> Purpose: make AI behave like a disciplined delivery system instead of a stream of disconnected edits.

---

## Core Constraint

**Keep at most 2 active tasks.**

- Always surface exactly 2 remaining gaps when work is active.
- Always surface exactly 2 remaining steps.
- Never open a third active work point until one current point is closed and verified.
- If nothing remains, say `none` explicitly.

## Canonical Files

- `0.dev-matrix/AI-TASKS.json` — machine-owned queue with dependencies and validation proof
- `0.dev-matrix/NEXT-2-TASKS.md` — generated current active pair and next pair
- `2-task.md` — compatibility mirror when a repo still expects the root task note

If they disagree, `AI-TASKS.json` wins.

## Tool Routing

Use the same retrieval stack in every repo:

1. Roo bridge targeted search
2. Graphify structure map
3. code-review-graph blast radius / impact
4. exact grep or file search confirmation

Do not start with broad file reads when one of those layers can narrow the owning surface first.

## Phase Gate Rule

Small tasks only work when they are phase-gated.

1. `analyze` — define the smallest falsifiable slice
2. `contract` or `spec` — freeze the ownership, interface, or acceptance rule
3. `validate` — name the exact proof command or runtime evidence
4. `realize` — make the smallest code or doc change that satisfies the slice
5. `prove` — run the validation and record the evidence

This is the useful AutoBE lesson: AI performs best when requirements, contract, validation, and realization happen in a fixed order instead of a single freeform mega-prompt.

## Manager And Helper Model Rule

The manager keeps quality. Helper models keep cost down.

| Role | Responsibility |
|------|---------------|
| Manager / Judge | chooses the two tasks, defines validation, verifies results, updates truth files |
| Cheap implementer | bounded code edit, search, or refactor slice through opencode / Claude Code / junie |
| User | strategy, business priority, unblock decisions |

### Cheap Helper Protocol

1. Give the helper one bounded slice, one owner, and one validation command.
2. Prefer cheaper helper models for implementation and repetitive cleanup.
3. Never let a helper model self-certify completion.
4. The manager reruns validation and decides whether the gap is closed.

## File Binding Rule

Use `0.dev-matrix/repo-layout-index.ps1` during cleanup, refactors, and rollout prep.

The layout index should surface:

- unlinked documents
- orphan documents
- isolated scripts or config files

Those findings should become one of three things: archive, explicit keep, or a queue item.

## Session Format

Start working responses with:

```text
REMAINING GAPS (2):
GAP-1: <one-line description> | owner: <file or module> | status: <state>
GAP-2: <one-line description> | owner: <file or module> | status: <state>

REMAINING STEPS (2):
STEP-1: <smallest next action> -> <validation command>
STEP-2: <smallest next action> -> <validation command>
```

Source these from `0.dev-matrix/NEXT-2-TASKS.md` when it exists instead of replanning from scratch.

## Definition Of Done

A task is done only when:

- code or config exists
- validation passed
- runtime proof exists when relevant
- truth files are updated

## Never Do

- Never keep more than 2 active tasks.
- Never let a helper model pick its own task or mark itself complete.
- Never call docs-only motion product progress unless the repo owner explicitly asked for docs-only work.
- Never claim hidden bugs are gone without actual static, test, or runtime proof.