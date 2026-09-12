# TO-112 — Production-readiness mission

## Objective
Turn the restored local-first deployment into a secure, fully functional production application using evidence-driven phases.

## First step
Run the repository's existing Phase-1/baseline checks referenced by the current production-readiness mission and record exact results before changing code.

## Required workstreams
- Verified completion/inventory of current product surfaces.
- Supabase restore-or-replace decision based on actual state.
- Production auth matrix with trusted Supabase/OAuth authority for privileged actions.
- Provider configuration and audit-policy fixes.
- Core workflow verification.
- Payment readiness without unauthorized real-money execution.
- Observability and security review.
- Final production gates.

## Hard gates
Do not run `supabase db push`, real payment transactions, credential rotation, or production-destructive operations without explicit owner approval. Treat `VITE_*` production changes as redeploy-requiring.

## Worker strategy
GPT-6 decomposes this mission into smaller numbered task files before delegating. GLM workers should receive only bounded slices such as auth, tests, provider adapters, or UI fixes—not the entire mission.

## Result
Each child task writes its own result. When TO-112 is ready for closure, write `agent-results/001-result.md` summarizing all accepted child evidence and remaining owner gates.
