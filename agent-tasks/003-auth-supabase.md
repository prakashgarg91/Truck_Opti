# TO-114 — Production auth and Supabase authority

## Objective
Make privileged production actions rely only on trusted server/Supabase identity and authorization.

## Depends on
TO-113 baseline evidence.

## Scope
- Trace frontend auth/session claims to server/Supabase verification.
- Identify direct browser access to privileged agency/admin data.
- Define restore-versus-replace decision for current Supabase state from evidence.
- Add failing tests before any auth/authorization behavior change.
- Move privileged access behind trusted server/edge-function boundaries where required.

## Hard gates
No `supabase db push`, credential rotation, destructive database operation or production redeploy without explicit owner approval.

## Acceptance
Focused auth tests, build/lint evidence, documented remaining owner gates, and `agent-results/003-result.md`.