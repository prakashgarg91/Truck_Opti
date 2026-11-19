-- agency_rate_cards table and avatars storage bucket: two objects the app uses that no earlier migration created
-- (found by the first hosted smoke test; the old production project had them by hand). Idempotent, so a database
-- that already has either keeps its data.
--
-- agency_rate_cards: written ONLY by supabase/functions/agency-portal-rates/index.ts through the SERVICE ROLE
-- (agency scoping and the portal scope check happen in the function via requireAgencyContext). Clients get no
-- direct access (least-privilege convention of 20261036000000). Columns come from the function insert
-- (index.ts:135-146), the update allow-list (:19-29) and the page type (frontend/src/services/agencyPortalApi.ts:51-65).
-- Constraints are no stricter than the function's own validation, which only requires three strings.
-- This is NOT agency_tariff_versions (per-client tariffs, 20261011000000); the two are unrelated.

CREATE TABLE IF NOT EXISTS public.agency_rate_cards (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id     UUID NOT NULL REFERENCES public.transport_agencies(id) ON DELETE CASCADE,
  vehicle_type  TEXT NOT NULL,
  origin_city   TEXT NOT NULL,
  dest_city     TEXT NOT NULL,
  rate_per_km   NUMERIC,
  flat_rate     NUMERIC,
  min_weight_kg NUMERIC,
  max_weight_kg NUMERIC,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from    TIMESTAMPTZ DEFAULT NOW(),
  valid_until   TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agency_rate_cards_agency_created_idx
  ON public.agency_rate_cards (agency_id, created_at DESC);

DROP TRIGGER IF EXISTS agency_rate_cards_updated_at ON public.agency_rate_cards;
CREATE TRIGGER agency_rate_cards_updated_at
  BEFORE UPDATE ON public.agency_rate_cards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.agency_rate_cards ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: only the service role (which bypasses RLS) reaches this table.
REVOKE ALL ON TABLE public.agency_rate_cards FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.agency_rate_cards TO service_role;

-- avatars bucket: ProfilePage.tsx:105-107 uploads to '<user id>/avatar.<ext>' with upsert and reads the file by
-- getPublicUrl, so the bucket is PUBLIC (read by anyone holding the URL); writes are limited to the caller's own folder.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own avatar" ON storage.objects;

CREATE POLICY "Anyone can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
