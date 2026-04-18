# Code Review: Supabase Admin Role RLS
**Ready for Production**: No
**Critical Issues**: 1

## Priority 1 (Must Fix)
- `auth.jwt() -> 'user_metadata' ->> 'role' = 'admin'` is used in live RLS policies, storage policies, and `SECURITY DEFINER` functions. `raw_user_meta_data` is user-editable via `supabase.auth.updateUser({ data: ... })`, so this is a real privilege-escalation path once the attacker refreshes their token.

## Evidence
- Frontend metadata writes are performed directly from the browser in `frontend/src/pages/ProfilePage.tsx` and `frontend/src/pages/CompanyProfilePage.tsx`.
- Frontend role resolution trusts `authUser.user_metadata?.role` before reading `public.users.role` in `frontend/src/stores/authStore.ts`.
- `public.users` still allows self-update, and `public.guard_user_role_mutations()` currently decides admin status from the same mutable JWT metadata.
- Vulnerable admin authorization appears in these migration-defined objects:
  - `20260418000000_secure_user_roles_and_customer_tracking.sql`
  - `20260416010000_graphify_gap_contract_fixes.sql`
  - `20260416000000_sync_trip_offer_tracking.sql`
  - `20260305000000_phase1_drivers.sql`
  - `20260308000000_driver_payouts.sql`
  - `20260306000000_driver_docs_bucket.sql`
  - `20260418002000_trip_photos_bucket.sql`

## Recommended Changes
- Replace all admin checks that read `user_metadata.role` with a single trusted helper backed by a server-controlled role source.
- Shortest safe path in this repo: use `public.users.role = 'admin'` through a helper such as `public.is_admin()` and patch `public.guard_user_role_mutations()` first so self-service metadata cannot unlock role changes.
- Follow-up hardening: remove the `user_metadata.role` fast path from frontend auth resolution and rely on `public.users.role` plus role-linked tables.

## Blast Radius
- Admin UI and admin-only data access for drivers, agencies, job offers, driver locations, contact inquiries, payouts, driver docs, trip photos, and shipment/trip RPCs.
- Legitimate admins whose authority exists only in `user_metadata.role` will lose access after the fix until their trusted role source is backfilled.