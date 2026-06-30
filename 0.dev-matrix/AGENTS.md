# AGENTS -- 0.dev-matrix Operating Contract

Purpose: make every AI session behave like a disciplined engineering transaction instead of a freeform edit stream.

## Any Tool, Same Contract (entry map)

| Your tool | Reads this automatically | Then follow |
|-----------|--------------------------|-------------|
| Claude Code / Cowork | `.claude/CLAUDE.md` + SessionStart brief | this file + `INDEX.md` |
| opencode | `AGENTS.md` (this file) | `INDEX.md` |
| Codex CLI | `AGENTS.md` (this file) | `INDEX.md` |
| VS Code / Copilot | `.github/copilot-instructions.md` | this file + `INDEX.md` |
| JetBrains Junie | `docs/tools/JUNIE.md` setup | this file + `INDEX.md` |
| ANY other LLM (chat UI, local model, new agent) | nothing automatic | paste `prompts/ANY-AGENT-BOOTSTRAP.md` as the system/first prompt |

Quality is model-independent by design: `docs/factory/FREE-MODEL-EXCELLENCE.md`.
MCP servers per client: `docs/tools/MCP-STACK.md` (config snippets for all four formats).

## Mandatory Boot Sequence

Before planning or coding, read these files in order:

1. `STATE.md`
2. `INDEX.md`
3. newest relevant entry in `AI-HANDOFF.md`
4. `TASK.md`

If the task touches code or architecture, also consult the current structural ledger before editing:

- `graphify-out/GRAPH_REPORT.md` when it exists, otherwise `docs/tools/GRAPHIFY.md`
- `docs/tools/CODE-REVIEW-GRAPH.md`
- `docs/process/TESTING_PRINCIPLES.md` for any behavior change

## Zero-Guessing Gate

No code before a short context audit exists.

The context audit must state:

- the smallest requested slice
- the likely files or modules to touch
- the dependencies or blast radius that could break
- the first failing test or cheapest falsifying check
- the validation command that will prove the slice

Graphify is the structural map.
code-review-graph is the blast-radius check.
Use both before non-trivial edits.

## Test-First Gate

For new behavior, bug fixes, or refactors that can change behavior:

1. write or update the narrowest automated test first
2. run it and confirm it fails for the expected reason
3. implement the minimum change required
4. rerun the same test until it passes
5. run the next narrow validation only after the first one is green

If no automated test exists, create one when practical. If a test is not practical, explicitly name the narrowest executable substitute before editing.

## Transaction Size Rule

- Keep at most 2 active tasks.
- Work one bounded transaction at a time.
- Validate immediately after the first substantive edit.
- Do not open a large multi-file change without a fresh context audit.

## Implement-Review-Fix Loop

1. map the slice with Graphify
2. check impact with code-review-graph
3. drive the change through a red-green validation loop
4. re-run impact review after the change
5. stop and reset if the same bug-fix loop stalls twice without a clearer root cause

When stuck, open a fresh context with the exact error output plus the isolated module graph instead of continuing to patch blindly.

## Closeout Reconciliation

Before ending the session, update `AI-HANDOFF.md` with:

- `Changed:`
- `Pending:`
- `Verified:`
- `Operational proof:`
- `Continue from:`
- `Next step:`
- `Technical debt:`
- `Blockers:`

Do not leave undocumented drift between code, task state, and handoff.

## Canonical References

- `INDEX.md` -- operating entrypoint and audit template
- `docs/factory/AGENT-WORKFLOW.md` -- two-task manager mode
- `docs/factory/OPENCODE-MANAGER.md` -- scout/build/review lane orchestration and lease rules
- `docs/process/START-DAY.md` -- session initialization
- `docs/process/END-DAY.md` -- session reconciliation
- `docs/tools/WATCH.md` -- automation layer and tool routing