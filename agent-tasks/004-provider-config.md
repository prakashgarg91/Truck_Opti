# TO-115 — Provider configuration and audit policy

## Objective
Make external provider configuration explicit, validated and safe without making providers a source of core business truth.

## Depends on
TO-113 baseline; coordinate with TO-114 for auth-bound provider actions.

## Scope
- Inventory Google Maps, auth, payment and other production adapters actually used by current code.
- Validate required environment variables and fail-safe behavior without exposing secrets.
- Remove client-trusted privileged configuration where found.
- Add tests first for any provider fallback/error-path behavior change.
- Ensure provider failures degrade/report correctly rather than silently fabricating success.

## Hard gates
No credential rotation or production `VITE_*` change/redeploy without owner approval.

## Acceptance
Focused tests/config validation evidence and `agent-results/004-result.md`.