import { supabase } from '../lib/supabase';

const TRIP_PHOTOS_BUCKET = 'trip-photos';

// Pinned signed-URL TTL (seconds) for in-session trip-photo rendering. The
// bucket is private (TO-142): stored references are canonical tokenless
// storage object URLs (…/storage/v1/object/{public|sign}/trip-photos/
// <user>/<job>/<file>) and every render mints a fresh expiring signed URL
// from the extracted object path. Issued signed URLs are not revocable before
// expiry; revocation requires object deletion or key rotation.
const TRIP_PHOTO_SIGNED_URL_EXPIRES_SECONDS = 60;

const TRIP_PHOTO_URL_PATTERN =
  /^https?:\/\/[^/]+\/storage\/v1\/object\/(?:public|sign)\/trip-photos\/(.+?)(?:\?.*)?$/;

/**
 * Resolves a stored trip-photo reference to a fresh expiring signed URL.
 * Returns null when the reference does not carry a recognizable object path
 * or signing fails — callers keep their existing empty-state handling.
 */
export async function resolveTripPhotoUrl(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;

  const match = url.match(TRIP_PHOTO_URL_PATTERN);
  if (!match) return null;

  const objectPath = match[1];
  if (!objectPath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(TRIP_PHOTOS_BUCKET)
      .createSignedUrl(objectPath, TRIP_PHOTO_SIGNED_URL_EXPIRES_SECONDS);

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
