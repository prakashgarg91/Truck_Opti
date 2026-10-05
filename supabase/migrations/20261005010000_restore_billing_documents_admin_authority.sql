-- =========================================================
-- TO-136: restore database-backed admin authority on the
-- billing-documents Storage policy.
--
-- Defect (reproduced behaviorally by scripts/admin_rls_proof.db.test.mjs,
-- cases A3/E6/E7 red before this migration):
--   20260517010000_billing_documents_bucket.sql created this policy AFTER the
--   20260418003000 role hardening, and it still derives admin authority from
--   auth.jwt() -> 'user_metadata' ->> 'role'. user_metadata is user-writable
--   (supabase.auth.updateUser), so any signed-in user who sets
--   user_metadata.role='admin' obtained full write access (INSERT/UPDATE/DELETE)
--   over every object in the billing-documents bucket, while a real admin
--   (public.users.role='admin') was denied.
--
-- Fix: rewrite the policy onto the database-backed predicate used by every
-- other hardened Storage policy (driver-docs, trip-photos in
-- 20260418003000_harden_role_claims_and_add_login_ids.sql).
--
-- Not changed here: the billing-documents bucket stays public-read (invoice
-- PDFs are linked by URL) and service-role writers are unaffected (BYPASSRLS).
-- =========================================================

DROP POLICY IF EXISTS "Admins can manage all billing documents" ON storage.objects;
CREATE POLICY "Admins can manage all billing documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'billing-documents'
  AND public.is_admin_user()
)
WITH CHECK (
  bucket_id = 'billing-documents'
  AND public.is_admin_user()
);
