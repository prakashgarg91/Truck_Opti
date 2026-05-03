-- Historical note: trip photo tracking moved to public.job_offers.
-- Keep this migration as a replay-safe no-op so fresh resets match the live agency_jobs contract.
DO $$
BEGIN
  NULL;
END $$;
