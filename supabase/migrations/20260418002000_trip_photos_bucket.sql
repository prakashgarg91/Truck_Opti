-- Version the trip-photos storage bucket used by the driver trip workflow.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trip-photos',
  'trip-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Driver can upload own trip photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view trip photos" ON storage.objects;
DROP POLICY IF EXISTS "Driver can update own trip photos" ON storage.objects;
DROP POLICY IF EXISTS "Driver can delete own trip photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage all trip photos" ON storage.objects;

CREATE POLICY "Driver can upload own trip photos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'trip-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Anyone can view trip photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'trip-photos');

CREATE POLICY "Driver can update own trip photos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'trip-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Driver can delete own trip photos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'trip-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Admins can manage all trip photos"
ON storage.objects FOR ALL
USING (
  bucket_id = 'trip-photos'
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);