-- Follow-up from the independent review of 20261045 (2026-11-19). No earlier migration is edited.
--
-- 20261045 created the avatars bucket with ON CONFLICT DO NOTHING. On a database where the bucket was
-- made by hand (the old production project) its settings would stay as they were, and the app reads
-- avatars by public URL. Converge the settings instead. Safe on a fresh database: same values.
--
-- Considered and NOT done: revoking anon EXECUTE on public.generate_lr_number(). It is SECURITY INVOKER and
-- runs inside the shipments document-number trigger, which fires before row security is checked; revoking
-- it changes a signed-out insert's refusal from the row-security error to a function-permission error
-- (scripts/admin_rls_proof.db.test.mjs B-series pins the row-security refusal). The remaining exposure is
-- that a signed-out caller can advance the LR sequence through /rpc (gaps in LR numbers, no data access).
-- Recorded in TASKS.md for a proper fix (make the trigger function SECURITY DEFINER, then revoke).

UPDATE storage.buckets
   SET public = true,
       file_size_limit = 2097152,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
 WHERE id = 'avatars'
   AND (public IS DISTINCT FROM true
        OR file_size_limit IS DISTINCT FROM 2097152
        OR allowed_mime_types IS DISTINCT FROM ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
