# Delivery Intelligence Bridge

This document explains how a repo joins the delivery-intelligence system after `0.dev-matrix` is copied into it.

## What This System Adds

- a Copilot `SessionStart` hook that shows delivery-intelligence hub status
- a Copilot `Stop` hook that reminds capture and summary workflow
- a central hub at `D:\Github\PPF-Past-Present-Future` that stores normalized sessions, reviews, and cross-repo batch summaries
- a control plane at `D:\Github\Quality-test-MCP` that tracks manifests, runs, and blocking evidence
- a sequencing repo at `D:\Github\rubic-cube` that defines the delivery phase algorithm

This does not duplicate the hub into every repo. The repo gets a thin hook bridge that points to the central hub.

## Four-Repo Delivery Stack

This delivery system now has four explicit roles:

- `0.dev-matrix`: policy, launch gates, repo hygiene, and cross-repo operational rules
- `Quality-test-MCP`: machine state for manifests, risk levels, run evidence, and blocked-vs-ready visibility
- `PPF-Past-Present-Future`: normalized session capture, gap reviews, and repeated failure learning
- `rubic-cube`: the state machine for deciding which delivery phase should happen next

If one layer is missing, vibe coding drifts:

- without `0.dev-matrix`, there are no universal gates
- without `Quality-test-MCP`, there is no machine-visible run state
- without `PPF-Past-Present-Future`, the same failures repeat across sessions
- without `rubic-cube`, phase order collapses into random activity

## Cube Principle Applied To Software

Rubik's cube solving works because each algorithm is tied to a known state. Software delivery should work the same way.

The practical translation is:

1. `inspect` — identify the owning repo, target user outcome, broken path, and cheapest validation
2. `cross` — define the slice, acceptance criteria, and gate commands
3. `first-two-layers` — implement one vertical slice and validate it immediately
4. `orient-last-layer` — surface hidden bugs in edge paths, fallbacks, and adjacent integrations
5. `permute-last-layer` — align manifests, docs, telemetry, and handoff
6. `release` — promote only with machine evidence and a recorded next earning step

The point is not a fantasy of permanent zero bugs. The point is zero unknown critical paths at release time.

## New Repo Bootstrap

After copying `0.dev-matrix` into a new repo, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\install-delivery-intelligence-hook.ps1
```

If you are onboarding all repos from the meta repo, run:

```powershell
powershell -ExecutionPolicy Bypass -File D:\Github\0.dev-matrix\update-mcp-configs.ps1
```

That root script now refreshes MCP config, `.code-review-graphignore`, the delivery-intelligence hook, and the repo-local OpenHarness launcher/skill for every repo under `D:\Github`.

It targets git repos for the root-wide rollout. For a non-git workspace or a repo before `git init`, run the repo-local installers directly inside that workspace.

## Day-To-Day Workflow

1. Start the target repo with OpenHarness using `powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1`, or continue a normal Copilot session when needed.
2. Let `Quality-test-MCP` resolve the manifest or bootstrap it from the repo path.
3. Follow the current `rubic-cube` phase instead of mixing planning, coding, debugging, and release work together.
4. Apply `0.dev-matrix` rules for validation, handoff, security, and launch readiness.
5. If the session produced a decision, blocker, validation result, or delivery lesson, capture it in `PPF-Past-Present-Future`.
6. Normalize the session, validate it, and rebuild the batch summary in the hub repo.
7. Promote the slice only when the control plane shows the required evidence.

The new fast delivery guardrail check in `0.dev-matrix/delivery-guardrails.shared.ps1` uses this hub as the repeated-blocker memory layer. For product repos, missing normalized session capture is now surfaced automatically during start-of-day and close-day so the same mistake does not reset across sessions.

## Repo OpenHarness Entry

After `update-mcp-configs.ps1` runs, every git repo gets:

- `0.dev-matrix/openharness.ps1` as the repo-local launcher
- `.openharness/skills/launch-revenue/SKILL.md` as the earning-focused OpenHarness skill

Use the launcher from inside the repo:

```powershell
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1
powershell -ExecutionPolicy Bypass -File .\0.dev-matrix\openharness.ps1 -Prompt "What is the smallest validated slice that moves this repo toward launch or revenue?"
```

The launcher reuses the shared OpenHarness install in `D:\Github\openharness`, runs the WATCH session-start context, and starts OpenHarness with Copilot on `gpt-5.4` and `effort=max`.
It also instructs OpenHarness to use both the `launch-revenue` and `delivery-guardrails` skills so repo truth, spec gate, and repeated-blocker capture are enforced before broad implementation.

## Hub Commands

```powershell
Set-Location D:\Github\PPF-Past-Present-Future
powershell -ExecutionPolicy Bypass -File .\tools\validate-session.ps1 -Path .\conversations\normalized\<session>.json
powershell -ExecutionPolicy Bypass -File .\tools\build-session-summary.ps1 -OutputPath $env:TEMP\ppf-session-summary.md
```

For the four-repo stack validation from the meta repo:

```powershell
Set-Location D:\Github\0.dev-matrix
python .\validate-delivery-stack.py
```

## Recommended Rule

Every repo should keep WATCH for sprint and repo context, and use this delivery-intelligence hook as a second layer for capturing delivery lessons across repos.

Practical rule: close-day should stay under 10 minutes. If a repo still needs heavy testing, Graphify refresh, or architecture cleanup at shutdown time, that work started too late and should move into the active slice on the next session.