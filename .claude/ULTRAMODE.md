# UltraMode — flash-first multi-model pipeline

> Leader-driven orchestration for getting real work done across a project's pending
> backlog while keeping cost low: **cheap models do the bulk, premium models only
> plan and judge.** This file is the brain; `scripts/ultra.ps1` seeds it into a
> CCR-fronted Claude Code session per project.

## Operating principle

| Who | Model (via CCR `<CCR-SUBAGENT-MODEL>` tag) | Role | Cost |
|-----|--------------------------------------------|------|------|
| **Leader** (this session) | Sonnet (`default`) / Opus (`think`) | Plan, route, judge, run tests | 💎 premium — used sparingly |
| `advisor-opus` | `anthropic,claude-opus-4-8` | Gate plans & final acceptance | 💎 premium — stages 2 & 5 only |
| `planner-glm` | `zai-glm,glm-5.2` | Decompose backlog (1M ctx) | 💲 cheap |
| `reviewer-glm` | `zai-glm,glm-5.2` | Independent second-model review | 💲 cheap |
| `coder-deepseek-pro` | `ollama-cloud,deepseek-v4-pro:cloud` | Heavy feature logic | 💲 cheap |
| `coder-kimi` | `ollama-cloud,kimi-k2.7-code:cloud` | 2nd parallel logic worker | 💲 cheap |
| `explorer-flash` / `chore-flash` / `tester-flash` / `docs-flash` | `ollama-cloud,deepseek-v4-flash:cloud` | Map, boilerplate, tests, docs — the bulk | 💲💲 cheapest |

**Flash-first rule:** push every task that is *not* novel feature logic to a `*-flash`
agent (mapping, scaffolding, test writing, docs, renames, config). Reserve
`coder-deepseek-pro` / `coder-kimi` for the actual hard logic. Reserve Opus for
stages 2 and 5 only.

## Hard gate before any spend — routing must be live

Run `scripts\verify-routing.ps1` (the launcher does this for you). If it reports
**NO-GO**, STOP and tell the user to relaunch via `start.bat`. Do **not** silently
grind on premium Anthropic — that defeats the entire point.

A `GO` verdict is a *prerequisites* check, not proof. Model tags drift and node's CA
path is untested by the static check, so the **first action of any run** is to PROVE
it: spawn one trivial `chore-flash` subagent and confirm a *fresh* `deepseek` / `kimi`
/ `glm` / `ollama.com` hit appears in the newest CCR log. Only then proceed to Stage 0.
If no cheap hit appears, the routing is not live — STOP and have the user relaunch.

## The pipeline

**Stage 0 — Map (cheap).** `explorer-flash` + the roo-code semantic index
(`roo-code-index-search`) + graphify/CRG MCP. Locate the pending-work source of
truth (task queue, ROADMAP, TODO/FIXME, failing tests). Output: a short inventory.

**Stage 1 — Decompose (cheap).** `planner-glm` reads the repo + backlog and returns
a dependency-ordered task list. Each task must name: files it owns, acceptance
criteria, and a runnable check. Mark what can run concurrently vs. what is blocked.

**Stage 2 — Plan gate (premium, leader + `advisor-opus`).** Pick a batch of 2–4
tasks. Assign **disjoint file scopes** — no two builders may touch the same file
(this is what makes parallelism safe). Define the test for each. `advisor-opus`
pressure-tests the batch. **STOP if any scopes overlap** — re-split first.

**Stage 3 — Build (cheap, parallel).** Dispatch in one shot:
- bulk (scaffold, tests, docs, config) → `*-flash` agents
- real logic → `coder-deepseek-pro` + `coder-kimi` on disjoint files
Each agent brief must say: stay strictly inside your assigned files; mirror existing
conventions; run your own local check; report files touched + check output.

**Stage 4 — Review (cheap, second model).** `reviewer-glm` reviews the diff for bugs,
edge cases, convention violations. Bounce concrete failures back to the builder.

**Stage 5 — Final gate (premium, leader + `advisor-opus`).** Leader runs the real
tests/lint (empirical proof, not vibes). `advisor-opus` gives the final accept/reject.
Update the project's task queue. Report what shipped + the exact test output.

## Cost guardrails
- Flash-first; Opus only at stages 2 & 5.
- One file = one owner per batch. Never let two builders share a file.
- Cap batch size (2–4 tasks) so review/gate stays tractable.
- Tests are the gate. A green self-report from a builder is not acceptance.
- If routing is not live, the whole run is premium — abort and relaunch instead.
