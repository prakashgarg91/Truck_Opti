-- Expiry sweeps (wave 2 / TO-143-D3): nothing was expiring invitations or stale reservations
-- on its own. Expiry was lazy (checked when someone touched the row), so a driver invitation
-- stayed 'pending' forever and a stale offer kept a truck reserved until the agency next
-- reserved something.
--
-- run_expiry_sweeps(p_as_of) is ONE idempotent, service-only command that:
--   (a) expires pending agency_invitations past expires_at,
--   (b) expires pending agency_driver_invitations past expires_at,
--   (c) expires pending job offers that hold an active reservation (existing
--       release_stale_fleet_reservations; the offer trigger releases the reservation and the
--       job projection),
--   (d) logs the run in expiry_sweep_runs.
-- Scheduling: pg_cron every 5 minutes when the extension is available on the hosted plan;
-- otherwise run scripts/run-expiry-sweeps.mjs from Heroku Scheduler (10-minute minimum).
-- The sweeps already triggered inside reserve_fleet_assignment stay as a safety net.

CREATE TABLE IF NOT EXISTS public.expiry_sweep_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  as_of TIMESTAMPTZ NOT NULL,
  invitations_expired INTEGER NOT NULL DEFAULT 0,
  driver_invitations_expired INTEGER NOT NULL DEFAULT 0,
  reservations_released INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

ALTER TABLE public.expiry_sweep_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expiry_sweep_runs_admin_select ON public.expiry_sweep_runs;
CREATE POLICY expiry_sweep_runs_admin_select ON public.expiry_sweep_runs
  FOR SELECT TO authenticated
  USING (public.is_admin_user());

REVOKE ALL ON public.expiry_sweep_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.expiry_sweep_runs TO authenticated;
GRANT SELECT, INSERT ON public.expiry_sweep_runs TO service_role;

CREATE OR REPLACE FUNCTION public.run_expiry_sweeps(p_as_of timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv integer := 0;
  v_drv integer := 0;
  v_res integer := 0;
  v_run uuid;
BEGIN
  WITH expired AS (
    UPDATE public.agency_invitations i
    SET status = 'expired',
        version = i.version + 1,
        updated_at = now()
    WHERE i.status = 'pending'
      AND i.expires_at <= p_as_of
    RETURNING i.id
  )
  SELECT count(*)::integer INTO v_inv FROM expired;

  WITH expired AS (
    UPDATE public.agency_driver_invitations d
    SET status = 'expired',
        version = d.version + 1,
        updated_at = now()
    WHERE d.status = 'pending'
      AND d.expires_at <= p_as_of
    RETURNING d.id
  )
  SELECT count(*)::integer INTO v_drv FROM expired;

  v_res := public.release_stale_fleet_reservations(NULL, p_as_of);

  INSERT INTO public.expiry_sweep_runs (as_of, invitations_expired, driver_invitations_expired, reservations_released)
  VALUES (p_as_of, v_inv, v_drv, v_res)
  RETURNING id INTO v_run;

  RETURN jsonb_build_object(
    'ok', true,
    'invitations_expired', v_inv,
    'driver_invitations_expired', v_drv,
    'reservations_released', v_res,
    'run_id', v_run
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_expiry_sweeps(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_expiry_sweeps(timestamptz) TO service_role;

-- Schedule with pg_cron only where the extension exists (hosted Supabase plans); every other
-- environment (local PGlite, plain PostgreSQL) just notes the fallback and carries on.
DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'truckopti-expiry-sweeps';
      PERFORM cron.schedule('truckopti-expiry-sweeps', '*/5 * * * *', 'SELECT public.run_expiry_sweeps()');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron could not be scheduled (%): use the Heroku Scheduler fallback scripts/run-expiry-sweeps.mjs', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron is not available here: schedule scripts/run-expiry-sweeps.mjs externally every 5-10 minutes';
  END IF;
END
$cron$;
