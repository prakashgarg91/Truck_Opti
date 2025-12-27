🛠️ DEVELOPMENT.md

Universal Development & Execution Contract

Purpose:
This document defines how development is done, not what is being built.
It is project-agnostic, reusable across repositories, teams, and agents.

1️⃣ Role of This Document

development.md defines the rules of execution, validation, and truth for the entire project.

It exists to:

Prevent false or inflated progress

Enforce clean, traceable development

Eliminate gaps between code, UI, docs, and reality

Ensure every feature works end-to-end, not just in isolation

If behavior conflicts with this document → the behavior is wrong.

2️⃣ Mandatory Source-of-Truth Hierarchy

All development MUST follow this order strictly:

USER-REQUIREMENTS.md

Defines what the user wants

Human intent

Read-only for agents unless explicitly allowed

features.json

Machine-readable source of truth

Every feature, sub-feature, pipeline, dependency

Includes status, test results, and ownership

PROGRESS.md

Honest phase-wise progress tracking

Percentages must reflect real usability, not code presence

CONFESSION.md

Known bugs, gaps, failures, false passes

Must be brutally honest

MENU-CHART.md

Declares what menus and workflows claim to do

init. (init.sh / init.ps1 / init.bat)*

What actually executes when a user selects an option

❗ If any contradiction exists between these files, it must be resolved immediately.

3️⃣ Definition of “Feature Complete” (Non-Negotiable)

A feature is considered COMPLETE only if all conditions are met:

Core logic implemented

All dependencies resolved

UI (if any) reflects real state (not mock data)

Menu / command triggers real execution

Errors are handled and visible

Feature is tested using available tools

features.json marks:

implemented: true

tested: true

working: true

Any remaining limitations are documented in CONFESSION.md

Anything less = INCOMPLETE, regardless of code existence.

4️⃣ Development Loop (Mandatory Cycle)

Every task must follow this loop:

Understand → Implement → Test → Verify → Document → Sync Truth Files


Expanded:

Read USER-REQUIREMENTS.md

Check current status in features.json

Implement or fix the feature

Test using real execution paths

Verify UI / CLI / output behavior

Update:

features.json

PROGRESS.md

CONFESSION.md (if anything is imperfect)

Repeat until pass

No step may be skipped.

5️⃣ Truth Synchronization Rule

After any change, the following must be updated:

features.json → exact status & test result

PROGRESS.md → real progress (not aspirational)

CONFESSION.md → any discovered issues

MENU-CHART.md → if workflow/menu behavior changed

Out-of-sync documentation is treated as a bug.

6️⃣ Menu & Automation Discipline

If the project uses menus, commands, or automation scripts:

Menu options must do exactly what they claim

No placeholder actions

No silent execution

No fake “success” messages

Long operations must expose:

Progress

Current step

Errors

A menu that only looks functional is considered broken.

7️⃣ Codebase Hygiene Rules

Keep the codebase clean and minimal

Remove clutter, duplicates, and dead code

Do NOT delete any relevant file

Improve naming, structure, and modularity

Fix security issues and unsafe patterns when found

Cleanliness is not optional — it is part of correctness.

8️⃣ Testing & Validation Standards

Prefer real execution over mocks

Tests must reflect real user workflows

A passing test that doesn’t represent reality is a false pass

False passes must be declared in CONFESSION.md

Truth > green checkmarks.

9️⃣ Progress Integrity Rule

Progress percentages must reflect:

User-visible functionality

End-to-end usability

Stability under normal usage

If a feature exists but is:

Untested

Invisible

Manual when it should be automatic

→ it does not count as complete.

🔟 Reusable Skill Preservation (Optional but Encouraged)

When reusable knowledge is discovered:

Patterns

Scripts

Automation logic

Debugging workflows

(https://code.claude.com/docs/en/skills)
They should be stored using a project-agnostic skill format:

my-skill/
├── SKILL.md          # Core idea
├── reference.md      # Optional theory/docs
├── examples.md       # Optional usage
├── scripts/          # Optional helpers
└── templates/        # Optional templates


Skills must be generic and reusable across projects.

✅ Final Principle

If it works, it must be provable.
If it’s incomplete, it must be confessed.
If it’s claimed, it must be testable.

This document enforces engineering truth over perception. 