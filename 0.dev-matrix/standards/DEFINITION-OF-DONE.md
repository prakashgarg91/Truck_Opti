# Definition Of Done

A task is only done when all of the following are true:

1. The requested behavior is implemented.
2. The smallest relevant validation command has passed.
3. Affected runtime files are updated:
   `STATE.md`, `TASK.md`, and `DISCUSSION.md` when appropriate.
4. Any reusable learning is promoted into `RULES.md` or `PATTERNS.md`.
5. Remaining risks, owner actions, or follow-ups are written down explicitly.
6. If the session is being closed for the day, the repo close-day hook has been run and evidenced.

## Not Done

A task is not done if:

- code was changed but not validated
- blockers or owner actions are implied instead of documented
- runtime status files still suggest outdated state
- the repo is left in a more confusing process state than before
