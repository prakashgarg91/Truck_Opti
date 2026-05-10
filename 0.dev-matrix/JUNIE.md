# Junie — Optional Terminal Agent Standard

Purpose: define how Junie fits into the `0.dev-matrix` toolchain without creating repo churn or duplicating the main VS Code/Copilot workflow.

---

## Current Standard

- Junie is an **optional secondary agent**, not the default editing surface.
- Use the hardened user-scope wrapper: `C:\Users\Prakash\.junie\junie-zai.ps1`
- Default model path on this machine: custom `glm-5.1` through the Z.AI coding endpoint
- Current user-scope MCP config: `roo-code-index-bridge`, `code-review-graph`, `graphify`
- Current guidance source order in repos: use root `AGENTS.md` unless a repo explicitly needs `.junie/AGENTS.md`

Security baseline:

- Never store Junie API keys in repo files.
- Prefer `JUNIE_ZAI_API_KEY` in the current shell or the secure prompt path in `junie-zai.ps1`.
- The model profile under `C:\Users\Prakash\.junie\models\` must stay keyless.

---

## Standard Entry

Interactive repo session:

```powershell
$env:JUNIE_ZAI_API_KEY = "<key>"
powershell -ExecutionPolicy Bypass -File C:\Users\Prakash\.junie\junie-zai.ps1 --project D:\Github\<repo>
```

One-shot prompt:

```powershell
$env:JUNIE_ZAI_API_KEY = "<key>"
powershell -ExecutionPolicy Bypass -File C:\Users\Prakash\.junie\junie-zai.ps1 --project D:\Github\<repo> "Summarize the current blockers in this repo"
```

Review-oriented prompt:

```powershell
$env:JUNIE_ZAI_API_KEY = "<key>"
powershell -ExecutionPolicy Bypass -File C:\Users\Prakash\.junie\junie-zai.ps1 --project D:\Github\<repo> "Review the current changes and highlight bugs, risks, or missing tests"
```

---

## Best Use Cases

Use Junie when one of these is true:

1. You want a **second-opinion review** separate from the current VS Code/Copilot session.
2. You want a **terminal-native repo summary** or blocker digest without opening another IDE workflow.
3. You want a **prompt-driven comparison** between agents before committing to a risky implementation path.
4. You want a **headless or semi-headless task** that can later move into GitHub Action or CI automation.
5. You want a **read-mostly architecture pass** using Roo bridge, code-review-graph, and Graphify from Junie's MCP layer.
6. You want a **fast readiness or close-day review** using the same handoff, launch, spec, and blocker guardrails as the main dev-matrix flow.

Practical examples:

- "Review the current unstaged changes and list the top 3 risks."
- "Read AGENTS.md and AI-HANDOFF.md, then tell me the next validated slice."
- "Find the files that control auth/session refresh and summarize the call path."
- "Summarize what blocks launch in this repo in 5 bullets."
- "Compare two implementation options and recommend the lower-risk one."
- "Read AI-HANDOFF.md, LAUNCH_CHECKLIST.md, LAST-CLOSEOUT.md, and tell me which delivery guardrails are still blocked."

---

## When Not To Use It

Avoid Junie as the primary surface when:

- you need the full VS Code tool/memory flow that already exists in the current Copilot/dev-matrix session
- the task depends on repo-local editor state, notebook state, or UI interactions that are already better served by the current agent setup
- you are tempted to create repo-local `.junie` files just because Junie offers an import prompt on first run

Default rule: if root `AGENTS.md` and user-scope MCP are enough, do **not** add repo-local `.junie`.

Before asking Junie whether work is ready to stop or ship, use the same repo truth sources as the main flow: `AI-HANDOFF.md`, `LAUNCH_CHECKLIST.md`, `LAST-CLOSEOUT.md`, and the output of `0.dev-matrix/delivery-guardrails.shared.ps1` when available.

---

## Current Caveats

- Custom LLM model support is currently **EAP-only** in Junie.
- On this machine, the standalone headless flow can be flaky with some `--task` / `--review` paths; positional prompts through the wrapper are more reliable.
- Junie may offer to import detected `AGENTS.md`, MCP servers, and skills into `.junie/` on first open. Treat that as optional convenience, not a default action.
- Junie's approval model is separate from VS Code Copilot. Shell commands, MCP tools, and sensitive actions may still prompt unless allowlist or brave mode is configured.

---

## Repo-Local `.junie` Policy

Create repo-local `.junie/` only if at least one of these is true:

- the repo needs Junie-specific MCP config that should be shared across all contributors
- the repo needs Junie-specific guidelines that must differ from root `AGENTS.md`
- a CI or GitHub Action flow is being standardized around Junie for that repo

If you do create repo-local `.junie/`:

- keep secrets out of it
- prefer sharing only stable defaults
- document why the repo-local `.junie` layer exists in that repo's `0.dev-matrix/AI-HANDOFF.md` or `STATE.md`

---

## Recommended Next Layer

If Junie becomes a recurring tool in a repo, the next clean step is not to duplicate all repo guidance. The next clean step is:

1. keep root `AGENTS.md` as the main shared repo instructions
2. keep user-scope Junie MCP for shared machine tooling
3. add repo-local `.junie/` only for truly repo-specific Junie behavior
