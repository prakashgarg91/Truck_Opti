# ✅ QUALITY BASELINE — Universal Definition of Done
> **Applies to every repo in D:\Github.**
> Per-repo QUALITY-BASELINE.md adds stack-specific gate commands on top of this baseline.

---

## DEFINITION OF DONE

A task is **not done** until ALL of the following are true:

- [ ] Implementation is complete and the relevant validation command passes
- [ ] Security-sensitive work checked against `SECURITY.md §CHECKLIST`
- [ ] Dependency vulnerability status checked for affected package surfaces
- [ ] No duplicate docs spawned — new content consolidated into canonical files
- [ ] Task and state records updated (TASK.md / STATE.md / AI-HANDOFF.md)
- [ ] Working tree is clean or limited to intentional handoff files
- [ ] `AI-HANDOFF.md` updated so the next session resumes from an exact checkpoint

---

## MANDATORY EVIDENCE

When marking a task done, post to STATE.md or TASK.md:

| Field | Required |
|-------|---------- |
| Command run | Exact command with args |
| Result summary | Pass/fail + key numbers (0 errors, 5/5 tests, etc.) |
| Vulnerability status | `npm audit` / `pip-audit` result |
| Files changed | List of modified files |
| Docs impact | Where new docs went (or: no new docs created) |
| Owner blockers | Anything requiring human action |
| Continuation point | Next step for the following session |

---

## MINIMUM QUALITY GATES (NON-NEGOTIABLE)

These are the floor. A task claiming "done" below these thresholds is **not done**.

### Universal Gates
| Gate | What to check | Minimum pass |
|------|--------------|--------------|
| Lint / type-check | `ruff` / `mypy` / `tsc --noEmit` | 0 errors |
| Tests | project test command | All existing tests pass |
| Security (Node) | `npm audit` | 0 high/critical CVEs |
| Security (Python) | `pip-audit` or `uv run pip-audit` | 0 high/critical CVEs |

### Stack-Specific Gates (per repo)
Each repo's `QUALITY-BASELINE.md` defines the exact commands.
Common patterns:

| Stack | Gate command | Pass condition |
|-------|-------------|----------------|
| TypeScript/React | `npm run build` | Exit 0, 0 TS errors |
| Python | `python -m compileall src/` | 0 syntax errors |
| Python tests | `uv run pytest tests/ --tb=short -q` | All pass |
| Node frontend | `npm run lint` | 0 errors |
| All | `npm run launch-check` or equivalent | All gates PASS |

---

## DOCUMENTATION DISCIPLINE

- **Search before creating.** Before writing a new doc, search for existing ones.
- **Canonical locations only.** `AGENTS.md`, `.github/copilot-instructions.md`, and `0.dev-matrix/` docs must stay aligned — agent instructions, hooks, and context files must not drift into parallel systems.
- **Archive, don't leave duplicates.** Superseded docs go to `archive/` or are deleted, not left active alongside the replacement.
- **Keep `AI-HANDOFF.md` current.** Every session ends with an updated handoff so work continues from a specific checkpoint, not from scratch.

---

## HUMAN-BLOCKED TASKS

Tasks requiring production keys, OAuth browser sign-in, DNS changes, billing configuration, or external service setup are `[HUMAN-BLOCKED]`. AI agents must:

1. Skip `[HUMAN-BLOCKED]` tasks immediately — no workarounds
2. Document the block in `AI-HANDOFF.md` under `Blockers:`
3. Work on the next AI-executable task instead

---

## PHASE GATE RULE

A phase is complete only when **all tasks in that phase have passing validation output posted**.
Moving to the next phase with open failures is not allowed.

---

## CODE-REVIEW-GRAPH BLAST RADIUS CHECK

Before any refactor or multi-file change, run:
```
get_minimal_context(task="<what you're changing>")
```
Then check blast radius:
```
detect_changes(repo_root="<path>")
```
This prevents silent breakage of call sites found only at runtime.

---

## 📎 SEE ALSO

- `RULES.md` — Coding rules and anti-patterns
- `SECURITY.md` — Security safeguards
- `TESTING_PRINCIPLES.md` — Testing checklist
- `CONTEXT-ENGINEERING.md` — AI context efficiency
- Per-repo `QUALITY-BASELINE.md` — Stack-specific gate commands
