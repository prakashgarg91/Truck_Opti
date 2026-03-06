-- =========================================================
-- Create driver-docs storage bucket for driver document uploads
-- Date: 2026-03-06
-- =========================================================

-- Create bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-docs',
  'driver-docs',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for driver-docs bucket
-- Allow authenticated users to upload their own documents
CREATE POLICY "Driver can upload own documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'driver-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access to driver documents
CREATE POLICY "Public can view driver documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'driver-docs');

-- Allow drivers to update their own documents
CREATE POLICY "Driver can update own documents"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'driver-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow drivers to delete their own documents
CREATE POLICY "Driver can delete own documents"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'driver-docs'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow admins full access (admin role in user_metadata only)
-- BUG-021-FIX: removed OR clause that granted any authenticated user admin access
CREATE POLICY "Admins can manage all driver documents"
ON storage.objects FOR ALL
USING (
  bucket_id = 'driver-docs'
  AND (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);
