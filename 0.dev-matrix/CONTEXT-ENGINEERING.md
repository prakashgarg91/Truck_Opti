# 🧠 CONTEXT ENGINEERING — Universal AI Workflow
> **Purpose**: Keep AI context focused enough that modular changes remain accurate, efficient, and token-cheap.
> Consolidated from Truck_Opti and trading-rex-ai context engineering files.

---

## WORKING RULES

1. **Structure first.** Before editing anything, identify affected modules, contracts, registries, and the validation command. Run `get_minimal_context()` via code-review-graph.
2. **RPI loop for all non-trivial tasks:**
   - **Research**: inspect code and canonical docs as truth — never guess
   - **Plan**: compress intent into a short ordered sequence (3–7 steps max)
   - **Implement**: execute in focused context, validate after each step
3. **Prefer typed structures and manifests over long prose instructions.** A table of gates is better than 3 paragraphs about quality.
4. **For modular systems: update interfaces and shared contracts before consumer edits.** Don't fix 12 call sites before you've confirmed the new interface is correct.
5. **Validate continuously** — don't batch all validation to the end of a large task.

---

## CODE-REVIEW-GRAPH CONTEXT WORKFLOW (TOKEN-EFFICIENT)

Before any non-trivial edit:

```
Step 1 → get_minimal_context(task="<description>")       ~100 tokens — full picture
Step 2 → query_graph(target="<file or symbol>")          minimal detail — locate code
Step 3 → get_call_graph(name="<function>")               see what calls what
Step 4 → detect_changes(repo_root="<path>")              blast radius of your change
Step 5 → review_changes(repo_root="<path>")              final diff review
```

**Target: ≤5 tool calls, ≤800 total tokens of graph context per task.**

---

## SEMANTIC RETRIEVAL (ROO BRIDGE)

When searching for code by **intent or behaviour** (not exact string):

1. Use the Roo bridge MCP tools FIRST
2. Start with `search_roo_index`; use `detect_roo_index_collection` when workspace mapping needs confirmation
3. Treat results as hints — confirm every hit against real files before editing
4. Store only curated, durable context after validation

**Search priority order:**
1. Roo bridge semantic search (`search_roo_index`, `detect_roo_index_collection`)
2. `grep_search` / regex (exact string matches)
3. `file_search` (filename patterns)
4. `read_file` (after search has narrowed candidates)

---

## GOOD CANDIDATES FOR CURATED CONTEXT

Prioritize loading into context before a session:
- Latest `AI-HANDOFF.md` checkpoint
- Dependency manifests and module summaries
- Validated implementation snippets (not first-attempt code)
- Recurring failure diagnostics and verified fixes
- Cross-repo standards and template references (this folder)

---

## VALIDATION ORDER

1. **Structural truth**: docs, manifests, registries (read before code)
2. **Static reconciliation**: lint, type-check, import/export checks
3. **Runtime proof**: launch-check, tests, health checks, user flow

If a change only "works" with huge prompts and weak validation, the context system is still too noisy. Reduce scope.

---

## CONTEXT SMELLS (WARNING SIGNS)

| Smell | Fix |
|-------|-----|
| Need to read 20+ files to understand one change | Break task into smaller scoped subtasks |
| Second AI session has to re-discover context the first session had | Update `AI-HANDOFF.md` immediately |
| Grep returns 50+ results and you read all of them | Use semantic search first to narrow intent |
| Validation only works at the end | Validate after each implementation step |
| Long prose instruction required to keep AI on track | Convert to typed manifest or table |

---

## AI-HANDOFF.MD CONTRACT

Every session MUST end with `AI-HANDOFF.md` containing:

```markdown
## Task: <name>
## Status: <completed | in-progress | blocked>
## Last checkpoint: <what was done>
## Next step: <exact first action for next session>
## Blockers: <human actions needed, if any>
## Validated by: <command + result>
```

Without this, the next session restarts from scratch. That is wasted tokens and wasted time.

---

## 📎 SEE ALSO

- `QUALITY-BASELINE.md` — Definition of Done
- `RULES.md` — Rule 14–15 (CRG and Roo bridge usage rules)
- `WATCH.md` — Session start protocol and CRG daily workflow
