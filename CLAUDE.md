
<!-- STITCH_MCP_POLICY_START -->
### Stitch MCP policy (managed)

- Stitch MCP is the preferred design tool for UI/UX work when it is available. It is
  not called for backend-only, documentation-only, or non-visual work.
- Before any Stitch work: read this repository's instructions; inspect dirty state;
  understand the UI stack and the existing design system; call `stitch_status` and
  require `keyConfigured=true`; require `repoRoot` to equal this canonical repository.
- Call `stitch_guide` and follow its current workflow before the first design task in
  a session.
- List and reuse existing Stitch projects before creating new ones.
- One repository owns one Stitch project. Confirm project identity before mapping.
- Never expose credentials, including `STITCH_API_KEY`.
- Never retry a mutating call automatically (create, edit, delete, generate, variants,
  design-system mutations, delete_project, map). For ambiguous or timed-out mutations,
  recover through read-only inspection (`stitch_list_projects`, `stitch_list_screens`,
  `stitch_get_project`, `stitch_get_screen`).
- Retrieve journaled artifacts instead of repeatedly fetching or pasting oversized
  payloads.
- Adapt generated designs to this repository's existing components, design tokens,
  routing, APIs, state management, authentication, and accessibility requirements.
  Never paste generated code unchanged.
- Professional completion requires: route/screen coverage; action/button mapping; API
  mapping; loading, empty, error, success, and permission states; responsive behavior;
  keyboard navigation; contrast and semantic accessibility; typecheck; tests; and
  browser verification at desktop and mobile sizes.
- Repository restrictions override global standing permissions.
- Do not claim application completion merely because a design was generated.
- Report project IDs, screen IDs, artifact paths, mutation count, retry count, changed
  files, test evidence, and screenshots.
- Do not modify Stitch projects for non-UI tasks.
<!-- STITCH_MCP_POLICY_END -->

<!-- MAIN_ONLY_POLICY_START -->
### Main-only Git policy (managed)

- `main` is the only persistent branch; the primary checkout is the only persistent
  worktree.
- Do not create forks, feature branches, or worktrees without explicit owner approval.
- Writing agents are serialized on `main`: one writer at a time.
- Inspect dirty state before editing; never overwrite another agent's changes.
- Commit cohesive, verified changes directly to `main`.
- Fetch before work; pull only when fast-forward-safe.
- Never force-push.
- Push `main` only after tests pass.
- If concurrent writes are detected, stop rather than creating an automatic worktree.
- Temporary isolation (extra branches, worktrees, stashes) is prohibited unless the
  owner explicitly changes this policy.
<!-- MAIN_ONLY_POLICY_END -->
