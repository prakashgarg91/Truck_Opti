-- =========================================================
-- TO-126: Privatize driver-docs storage and add the
-- server-authoritative KYC document/submission record.
--
-- Forward migration (no destructive data change):
--   1. driver-docs bucket becomes PRIVATE (public = false), gains
--      application/pdf in its allowed MIME list (KYC kinds include PDF),
--      keeps the 5 MiB size limit.
--   2. The world-readable SELECT policy is dropped; owners and admins
--      read through RLS instead, everything else through short-lived
--      signed URLs minted by the trusted driver-kyc edge function.
--   3. Stale world-readable URL references stored on public.drivers are
--      nulled so the UI does not render dead public links after
--      privatization (documents stay in storage; the KYC flow supersedes
--      this legacy channel).
--   4. New public.driver_kyc_documents table: versioned document rows
--      (kind, file version, status, rejection reason, reviewer,
--      timestamps) with a DB-enforced monotonic version chain.
--      Accepted/rejected transitions are server-only: no UPDATE or
--      DELETE grant exists for anon/authenticated clients, so review can
--      only happen through the trusted edge function (service role).
-- =========================================================

-- ---------------------------------------------------------
-- 1. Privatize the bucket and allow PDF
-- ---------------------------------------------------------
UPDATE storage.buckets
SET public = false,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    file_size_limit = 5242880 -- 5 MiB
WHERE id = 'driver-docs';

-- ---------------------------------------------------------
-- 2. Storage policies: no public reads, owner/admin only
-- ---------------------------------------------------------

-- Remove world-readable access to every driver document.
DROP POLICY IF EXISTS "Public can view driver documents" ON storage.objects;

-- Owners keep authenticated read access to their own folder.
DROP POLICY IF EXISTS "Driver can view own driver documents" ON storage.objects;
CREATE POLICY "Driver can view own driver documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'driver-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- (Owner INSERT/UPDATE/DELETE policies from 20260306000000 and the admin
-- FOR ALL policy rewritten onto public.is_admin_user() in
-- 20260418003000 remain in force unchanged.)

-- ---------------------------------------------------------
-- 3. Null stale public driver-docs URL references
--    (columns stay; UIs already render null as "no document")
-- ---------------------------------------------------------
UPDATE public.drivers SET dl_url = NULL
WHERE dl_url LIKE '%/storage/v1/object/public/driver-docs/%';
UPDATE public.drivers SET rc_url = NULL
WHERE rc_url LIKE '%/storage/v1/object/public/driver-docs/%';
UPDATE public.drivers SET insurance_url = NULL
WHERE insurance_url LIKE '%/storage/v1/object/public/driver-docs/%';
UPDATE public.drivers SET selfie_url = NULL
WHERE selfie_url LIKE '%/storage/v1/object/public/driver-docs/%';

-- ---------------------------------------------------------
-- 4. Durable, versioned KYC document records
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.driver_kyc_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id        UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('rc_book', 'driving_license', 'aadhaar', 'truck_photo')),
  version          INTEGER NOT NULL CHECK (version >= 1),
  status           TEXT NOT NULL CHECK (status IN ('pending_review', 'accepted', 'rejected')),
  storage_path     TEXT NOT NULL,
  mime_type        TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes       BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  original_name    TEXT,
  rejection_reason TEXT,
  reviewed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  uploaded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (driver_id, kind, version)
);

CREATE INDEX IF NOT EXISTS idx_driver_kyc_documents_current
  ON public.driver_kyc_documents (driver_id, kind, version DESC);

ALTER TABLE public.driver_kyc_documents ENABLE ROW LEVEL SECURITY;

-- Owners and admins may read the version history of the documents.
DROP POLICY IF EXISTS "Driver can view own kyc documents" ON public.driver_kyc_documents;
CREATE POLICY "Driver can view own kyc documents"
ON public.driver_kyc_documents FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_admin_user()
);

-- Drivers register a new version of their own document; the trusted
-- driver-kyc edge function (service role) does the same after validating
-- file bytes. A DB trigger enforces the version chain and the
-- pending_review-only insert for every writer.
DROP POLICY IF EXISTS "Driver can upload own kyc documents" ON public.driver_kyc_documents;
CREATE POLICY "Driver can upload own kyc documents"
ON public.driver_kyc_documents FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins may view; deletion (retention/cleanup) stays an admin action.
-- There is intentionally NO UPDATE policy for anyone but the service
-- role: accept/reject transitions must go through the trusted edge
-- function, which checks the current version before writing.
DROP POLICY IF EXISTS "Admins can delete kyc documents" ON public.driver_kyc_documents;
CREATE POLICY "Admins can delete kyc documents"
ON public.driver_kyc_documents FOR DELETE
USING (public.is_admin_user());

REVOKE UPDATE, DELETE ON public.driver_kyc_documents FROM anon, authenticated;
REVOKE INSERT ON public.driver_kyc_documents FROM anon;

-- ---------------------------------------------------------
-- 5. Version-chain and ownership guard (BEFORE INSERT)
--    Enforced for every writer, including the service role, so the
--    stored record cannot drift from a strict per-(driver, kind)
--    version chain: v1, v2, v3... A replacement upload naturally
--    supersedes (invalidates) the review state of older versions.
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_driver_kyc_version_chain()
RETURNS TRIGGER AS $$
DECLARE
  v_caller       UUID := auth.uid();
  v_driver_user  UUID;
  v_max_version  INTEGER;
BEGIN
  -- Every insert starts a fresh review.
  IF NEW.status <> 'pending_review' THEN
    RAISE EXCEPTION 'driver_kyc_documents rows must be inserted as pending_review'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The document must belong to the same driver account as user_id.
  SELECT user_id INTO v_driver_user FROM public.drivers WHERE id = NEW.driver_id;
  IF v_driver_user IS NULL OR v_driver_user <> NEW.user_id THEN
    RAISE EXCEPTION 'KYC document driver does not belong to the uploading user'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Interactive callers may only register their own documents; the
  -- service role (trusted edge function) has already validated ownership.
  IF v_caller IS NOT NULL AND v_caller <> NEW.user_id THEN
    RAISE EXCEPTION 'KYC documents can only be uploaded by their owner'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Owner-scoped storage paths: {user_id}/{kind}/{token}.{ext} (no path
  -- traversal; the trusted function additionally enforces the randomized
  -- token shape before registering an upload).
  IF NEW.storage_path IS NULL
     OR NEW.storage_path NOT LIKE (NEW.user_id::text || '/' || NEW.kind || '/%')
     OR position('..' IN NEW.storage_path) > 0
     OR right(NEW.storage_path, 1) = '/' THEN
    RAISE EXCEPTION 'KYC storage path must be owner-scoped: {userId}/{kind}/{token}.{ext}'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Strict monotonic chain: exactly max(version)+1 for (driver, kind).
  SELECT COALESCE(MAX(version), 0) INTO v_max_version
  FROM public.driver_kyc_documents
  WHERE driver_id = NEW.driver_id AND kind = NEW.kind;

  IF NEW.version <> v_max_version + 1 THEN
    RAISE EXCEPTION 'KYC document version % is out of chain; expected %',
      NEW.version, v_max_version + 1
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_driver_kyc_version_chain ON public.driver_kyc_documents;
CREATE TRIGGER trg_driver_kyc_version_chain
BEFORE INSERT ON public.driver_kyc_documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_driver_kyc_version_chain();
