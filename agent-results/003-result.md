# TO-114 — Production auth and Supabase authority result

Date: 2026-09-12

## What was verified
- Privileged admin and agency frontend services use Supabase Edge Functions for privileged operations rather than trusting browser role state as the mutation authority.
- Shared Edge Function authorization validates the caller bearer token with Supabase Auth and resolves role/agency authority from server-side database state before privileged service-role operations.
- Customer tenant access has an ownership-scoped RLS migration using authenticated user ownership (`auth.uid() = created_by`) for customer-owned rows.
- Existing focused frontend service tests for admin, agency and customer APIs passed in the current frontend suite.
- The bounded `apps/web` authentication middleware test passed in GitHub Actions.

## Fresh verification evidence
From PR #43 / GitHub Actions run `34682597700`:
- Frontend unit suite: 329/329 PASS across 19 files.
- `apps/web` bounded auth unit test: PASS.
- Production frontend build: PASS.
- Broader local-first launch smoke: 52/52 PASS.

## Authority conclusion
No code change to the trusted authorization boundary was justified by the evidence gathered in this slice. The maintained architecture already places privileged admin/agency mutations behind Supabase Edge Functions and server-side authority resolution. Browser role state remains a UX/navigation concern, not the final authorization authority.

## Restore-versus-replace decision
The current production Supabase project must be confirmed from the owner-controlled Supabase account. If project `jbxncejtcbpcronndqlx` is recoverable, restore/reconfigure it and run live credentialed proofs. If it is deleted or unrecoverable, create a replacement/migration plan before any database push, credential change or production redeploy.

## Remaining owner gates
- Confirm a live production Supabase project and its URL/public anon key.
- Configure production build-time `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only through an approved redeploy.
- Configure/confirm Google OAuth credentials if Google sign-in is the selected production login method.
- Run `npm run test:live-auth` and `npm run test:live-admin` against the real project with approved test credentials.
- No `supabase db push`, destructive database operation, credential rotation or production redeploy was performed.

## Acceptance
Code-side authority review is complete with focused test/build evidence. Live production Supabase/auth verification remains owner-blocked and is explicitly carried forward rather than represented as verified.
