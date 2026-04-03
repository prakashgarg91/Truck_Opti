# Definition Of Done

A task is only done when all of the following are true:

1. The requested behavior is implemented.
2. The smallest relevant validation command has passed.
3. Affected runtime files are updated:
   `STATE.md`, `TASK.md`, and `DISCUSSION.md` when appropriate.
4. Any reusable learning is promoted into `RULES.md` or `PATTERNS.md`.
5. Remaining risks, owner actions, or follow-ups are written down explicitly.
6. Dependency vulnerability status for affected package surfaces is checked or explicitly deferred with a reason.
7. New documentation is consolidated into an existing canonical doc or placed in an approved canonical location.
8. If the session is being closed for the day, the repo close-day hook has been run and evidenced.
9. If the session is being closed for the day, `AI-HANDOFF.md` has a structured entry with `Changed:`, `Verified:`, `Continue from:`, `Next step:`, and `Blockers:`.
10. The working tree is clean or limited to intentional runtime handoff files.

## Not Done

A task is not done if:

- code was changed but not validated
- blockers or owner actions are implied instead of documented
- runtime status files still suggest outdated state
- safe vulnerability fixes were ignored or remaining alerts were left undocumented
- new docs were created without search/consolidation/placement review
- the repo was left with a vague end-of-day note instead of a continuation-ready handoff
- the repo still has dirty working-tree changes outside intentional runtime handoff files
- the repo is left in a more confusing process state than before
