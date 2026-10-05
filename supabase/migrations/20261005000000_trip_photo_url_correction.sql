-- TO-130 correction: the job-scoped trip-photo URL check rejected every
-- legitimate reference produced by the driver UI.
--
-- DriverTripPage.tsx uploads to `${user.id}/${job.id}/${field}.${ext}` inside
-- the trip-photos bucket and stores the resulting public URL, so a legitimate
-- reference carries THREE path segments after /trip-photos/:
--
--   /storage/v1/object/{public,sign}/trip-photos/<driver user>/<job offer>/<file>
--
-- The check shipped in 20261004000000_trip_transition_integrity.sql matched
-- exactly two segments, so uploading a proof photo succeeded in storage but the
-- follow-up persist_driver_job_offer_progress call raised
-- 'Invalid trip photo reference' and the reference was never stored.
--
-- Proof: scripts/trip_transition_integrity.db.test.mjs case 15 was red before
-- this migration (the valid job-scoped URL raised) and is green after it.
--
-- This migration replaces only the shape regex. The ownership position check,
-- the function signature and the RPC that calls it are unchanged.
CREATE OR REPLACE FUNCTION public.is_job_trip_photo_url(
  p_url TEXT,
  p_user_id UUID,
  p_job_offer_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/trip-photos/[^/?]+/[^/?]+/[^/?]+(\?.*)?$'
    AND (
      p_user_id IS NULL
      OR p_job_offer_id IS NULL
      OR position(
        '/trip-photos/' || p_user_id::text || '/' || p_job_offer_id::text || '/'
        in p_url
      ) > 0
    );
$$;

-- CREATE OR REPLACE preserves the existing ACL; keep the original least
-- privilege posture explicit (the RPC calls this helper as its owner).
REVOKE ALL ON FUNCTION public.is_job_trip_photo_url(TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_job_trip_photo_url(TEXT, UUID, UUID) FROM anon;
