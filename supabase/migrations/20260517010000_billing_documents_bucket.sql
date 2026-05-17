-- =========================================================
-- Create billing-documents storage bucket for hosted invoice PDFs
-- Date: 2026-05-17
-- =========================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'billing-documents',
  'billing-documents',
  true,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view billing documents" ON storage.objects;
CREATE POLICY "Public can view billing documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'billing-documents');

DROP POLICY IF EXISTS "Admins can manage all billing documents" ON storage.objects;
CREATE POLICY "Admins can manage all billing documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'billing-documents'
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  bucket_id = 'billing-documents'
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);