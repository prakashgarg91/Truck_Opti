# TO-113 — Baseline and product inventory

## Objective
Establish current truth before production changes.

## Scope
- Inventory active frontend, apps/web, Supabase, payment, provider and deployment surfaces.
- Identify existing build/lint/test/security commands from maintained config.
- Classify each core user journey as verified, implemented-unverified, partial, missing or owner-blocked.
- Record current branches/worktrees/remotes when executing locally.

## Do not
- Change production credentials/config.
- Run `supabase db push`, deploy, payment transactions or destructive operations.
- Treat historical readiness counts as current evidence.

## Acceptance
Fresh command outputs and failures are captured in `agent-results/002-result.md`, with the next smallest code-fix task identified.