# 🌳 TREE HYGIENE — Universal Repo Cleanliness Standard
> Keep every repo dealer-ready and easy to audit at any point.

---

## STANDARD

- The production tree should be easy to scan for a new agent in <60 seconds.
- Active code, launch docs, and evidence folders must be clearly separated.
- Remove junk files, merge leftovers, and accidental duplicates before pushing.
- Consolidate process docs into canonical files before creating new summaries or reports.
- Keep long-form docs in intentional zones (`0.dev-matrix/`, `docs/`) — not scattered in root.
- Archive superseded material instead of leaving active duplicates alongside replacements.

---

## ROOT DIRECTORY MUST-HAVES

Every repo should have at minimum:
```
/
├── .github/
│   └── copilot-instructions.md    ← AI agent instructions
├── .vscode/
│   └── mcp.json                   ← Qdrant + code-review-graph MCP config
├── .code-review-graphignore        ← CRG ignore rules
├── 0.dev-matrix/
│   ├── AI-HANDOFF.md              ← Session continuation checkpoint
│   ├── TASK.md                    ← Active tasks
│   ├── STATE.md                   ← Agent messages + sprint state
│   ├── RULES.md                   ← Coding rules (per-repo or ref to global)
│   └── SECURITY.md                ← Known vulns + per-repo security
└── README.md
```

---

## CLEANUP TRIGGERS

Run a cleanup sweep before:
- A major launch / deployment
- Onboarding a new AI agent session
- After a long sprint that produced many report/summary files

**Cleanup sweep steps:**
1. Delete or archive batch prompt history and stale continuation files in `0.dev-matrix/`
2. Merge duplicate report/test evidence into the canonical `0.dev-matrix/test-reports/` or a dated archive
3. Ensure no `*.bak`, `*.old`, `__pycache__`, `.DS_Store` in tracked files
4. Confirm `AI-HANDOFF.md` reflects current state (not from 2 sprints ago)

---

## KNOWN LEGACY AREAS (per repo)

Each repo's `TREE-HYGIENE.md` lists its own known legacy areas.

**Common cross-repo patterns:**
- Batch prompt history in `0.dev-matrix/` — prune when no longer operationally useful
- Accumulated launch/test evidence in `0.dev-matrix/test-reports/` — archive after launch
- Duplicate continuation/report docs — consolidate to one canonical operating note

---

## DOCUMENTATION PLACEMENT RULE

| Content type | Correct location |
|-------------|-----------------|
| Agent instructions | `.github/copilot-instructions.md` |
| Active tasks | `0.dev-matrix/TASK.md` |
| Sprint state | `0.dev-matrix/STATE.md` |
| Session checkpoint | `0.dev-matrix/AI-HANDOFF.md` |
| Coding rules | `0.dev-matrix/RULES.md` |
| Security | `0.dev-matrix/SECURITY.md` |
| Test evidence | `0.dev-matrix/test-reports/` |
| Architecture docs | `docs/` |
| API docs | `docs/` or `README.md` |
| Historical context | `0.dev-matrix/archive/` |

**Creating a new doc outside these locations requires justification in the commit message.**

---

## 📎 SEE ALSO

- `QUALITY-BASELINE.md` — Documentation discipline section
- `CONTEXT-ENGINEERING.md` — Good candidates for curated context
