-- BATCH20 T1: Add trip photo columns to agency_jobs
ALTER TABLE agency_jobs
  ADD COLUMN IF NOT EXISTS photo_loading_url TEXT,
  ADD COLUMN IF NOT EXISTS photo_delivery_url TEXT;
