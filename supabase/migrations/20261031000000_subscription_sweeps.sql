-- Subscription sweeps (TO-152 S5, rulings section 4).
--
-- run_subscription_sweeps(p_as_of) is ONE idempotent, service-only command:
--   trial past trial_end            -> expired
--   active/past_due past period end -> grace (grace_end = current_period_end + 168 hours)
--   grace past grace_end            -> expired (a NULL grace_end falls back to period end + 168 hours)
-- then writes in-app reminders (T-7, T-3, T-1, T0, grace day 5) for subscriptions that are
-- still live AFTER those transitions (an expired trial gets no t_zero; T-1 and the expired
-- banner cover it). Boundaries are inclusive (<= p_as_of); all comparisons are absolute
-- timestamptz and every offset is an explicit number of hours (no calendar-day arithmetic), and
-- the function pins SET timezone = 'UTC', so the caller's session TimeZone cannot change results.
-- Per run each transition touches at most 5000 rows (FOR UPDATE SKIP LOCKED); the jsonb result
-- carries more_pending = true when eligible rows remain for the next run.
-- Every UPDATE is status-conditional, so a concurrent activation is never overwritten.
-- The sweep never sets the paid flag; it only uses edges the S1 status machine allows.
-- Scheduling: hourly pg_cron where available, else scripts/run-expiry-sweeps.mjs.

CREATE TABLE IF NOT EXISTS public.subscription_sweep_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  as_of TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  finished_at TIMESTAMPTZ,
  trials_expired INTEGER NOT NULL DEFAULT 0,
  grace_started INTEGER NOT NULL DEFAULT 0,
  grace_expired INTEGER NOT NULL DEFAULT 0,
  reminders_created INTEGER NOT NULL DEFAULT 0,
  result JSONB
);

CREATE TABLE IF NOT EXISTS public.subscription_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id),
  period_end TIMESTAMPTZ NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('t_minus_7', 't_minus_3', 't_minus_1', 't_zero', 'grace_day_5')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, period_end, kind)
);

ALTER TABLE public.subscription_sweep_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_sweep_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.subscription_reminders FROM PUBLIC, anon, authenticated;
-- service_role reads only: the SECURITY DEFINER function does the writing.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscription_sweep_runs FROM service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.subscription_reminders FROM service_role;
GRANT SELECT ON public.subscription_sweep_runs TO service_role;
GRANT SELECT ON public.subscription_reminders TO service_role;

DROP POLICY IF EXISTS subscription_sweep_runs_admin_select ON public.subscription_sweep_runs;
CREATE POLICY subscription_sweep_runs_admin_select ON public.subscription_sweep_runs
  FOR SELECT TO authenticated USING (public.is_admin_user());
GRANT SELECT ON public.subscription_sweep_runs TO authenticated;

-- A member reads reminders of their own agency's subscription (in-app display); no writes.
DROP POLICY IF EXISTS subscription_reminders_member_select ON public.subscription_reminders;
CREATE POLICY subscription_reminders_member_select ON public.subscription_reminders
  FOR SELECT TO authenticated
  USING (public.is_admin_user() OR public.subscription_usage_visible(subscription_id));
GRANT SELECT ON public.subscription_reminders TO authenticated;

-- Append-only: UPDATE/DELETE/TRUNCATE refused for everyone, superuser included.
DROP TRIGGER IF EXISTS subscription_sweep_runs_append_only ON public.subscription_sweep_runs;
CREATE TRIGGER subscription_sweep_runs_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_sweep_runs
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS subscription_sweep_runs_no_truncate ON public.subscription_sweep_runs;
CREATE TRIGGER subscription_sweep_runs_no_truncate
  BEFORE TRUNCATE ON public.subscription_sweep_runs
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS subscription_reminders_append_only ON public.subscription_reminders;
CREATE TRIGGER subscription_reminders_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_reminders
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS subscription_reminders_no_truncate ON public.subscription_reminders;
CREATE TRIGGER subscription_reminders_no_truncate
  BEFORE TRUNCATE ON public.subscription_reminders
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();

CREATE OR REPLACE FUNCTION public.run_subscription_sweeps(p_as_of timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET timezone = 'UTC'
AS $$
DECLARE
  c_batch CONSTANT integer := 5000;
  v_started timestamptz := clock_timestamp();
  v_run uuid := gen_random_uuid();
  v_trials integer := 0;
  v_grace integer := 0;
  v_gexp integer := 0;
  v_rem integer := 0;
  v_more boolean := false;
  v_result jsonb;
BEGIN
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'p_as_of is required' USING ERRCODE = '22004';
  END IF;

  -- API callers (PostgREST arrives as session_user authenticator) may not pass a future date:
  -- that would expire everyone. pg_cron and the migration session run as postgres/supabase_admin.
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND p_as_of > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'as_of_in_future' USING ERRCODE = '22023';
  END IF;

  -- One sweep at a time; a second caller waits, then finds nothing left to do.
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription_sweeps', 0));

  -- Snapshot of the rows as they are BEFORE this sweep (status, anchor): reminders are
  -- decided from this, then filtered by the post-transition state below. A temp table
  -- (indexed on id) so the live set is read once, not re-parsed per step.
  DROP TABLE IF EXISTS pg_temp.sub_sweep_pre;
  CREATE TEMP TABLE sub_sweep_pre ON COMMIT DROP AS
  SELECT s.id, s.status AS pre_status,
         CASE WHEN s.status = 'trial' THEN s.trial_end ELSE s.current_period_end END AS anchor,
         s.current_period_end AS pe
  FROM public.subscriptions s
  WHERE s.status IN ('trial', 'active', 'past_due', 'grace');
  CREATE UNIQUE INDEX sub_sweep_pre_id_idx ON sub_sweep_pre (id);
  ANALYZE sub_sweep_pre;

  -- Each transition is batched (LIMIT c_batch, SKIP LOCKED); anything left over is reported
  -- as more_pending and picked up by the next run.
  WITH moved AS (
    UPDATE public.subscriptions s
    SET status = 'expired'
    WHERE s.id IN (
      SELECT t.id FROM public.subscriptions t
      WHERE t.status = 'trial' AND t.trial_end IS NOT NULL AND t.trial_end <= p_as_of
      ORDER BY t.id LIMIT c_batch FOR UPDATE SKIP LOCKED)
    RETURNING s.id
  )
  SELECT count(*)::integer INTO v_trials FROM moved;
  v_more := v_more OR EXISTS (
    SELECT 1 FROM public.subscriptions t
    WHERE t.status = 'trial' AND t.trial_end IS NOT NULL AND t.trial_end <= p_as_of);

  WITH moved AS (
    UPDATE public.subscriptions s
    SET status = 'grace',
        grace_end = s.current_period_end + interval '168 hours'
    WHERE s.id IN (
      SELECT t.id FROM public.subscriptions t
      WHERE t.status IN ('active', 'past_due') AND t.current_period_end <= p_as_of
      ORDER BY t.id LIMIT c_batch FOR UPDATE SKIP LOCKED)
    RETURNING s.id
  )
  SELECT count(*)::integer INTO v_grace FROM moved;
  v_more := v_more OR EXISTS (
    SELECT 1 FROM public.subscriptions t
    WHERE t.status IN ('active', 'past_due') AND t.current_period_end <= p_as_of);

  -- Only rows that were already in grace before this sweep (not those just moved there).
  -- A grace row with no grace_end falls back to current_period_end + 168 hours.
  WITH moved AS (
    UPDATE public.subscriptions s
    SET status = 'expired'
    WHERE s.id IN (
      SELECT t.id FROM public.subscriptions t
      JOIN sub_sweep_pre p ON p.id = t.id AND p.pre_status = 'grace'
      WHERE t.status = 'grace'
        AND COALESCE(t.grace_end, t.current_period_end + interval '168 hours') <= p_as_of
      ORDER BY t.id LIMIT c_batch FOR UPDATE OF t SKIP LOCKED)
    RETURNING s.id
  )
  SELECT count(*)::integer INTO v_gexp FROM moved;
  v_more := v_more OR EXISTS (
    SELECT 1 FROM public.subscriptions t
    JOIN sub_sweep_pre p ON p.id = t.id AND p.pre_status = 'grace'
    WHERE t.status = 'grace'
      AND COALESCE(t.grace_end, t.current_period_end + interval '168 hours') <= p_as_of);

  -- Reminders: due instant D <= p_as_of < D + 24h, row still live after the transitions.
  WITH cand AS (
    SELECT p.id, p.anchor, k.kind, p.anchor + k.off AS due
    FROM sub_sweep_pre p
    JOIN public.subscriptions s ON s.id = p.id
    CROSS JOIN (VALUES
      ('t_minus_7', interval '-168 hours', false), ('t_minus_3', interval '-72 hours', false),
      ('t_minus_1', interval '-24 hours', false), ('t_zero', interval '0', false),
      ('grace_day_5', interval '120 hours', true)) AS k(kind, off, grace_kind)
    WHERE p.anchor IS NOT NULL
      AND s.status IN ('trial', 'active', 'past_due', 'grace')
      AND s.current_period_end = p.pe
      AND ((k.grace_kind AND p.pre_status = 'grace')
        OR (NOT k.grace_kind AND p.pre_status IN ('trial', 'active', 'past_due')))
  ), ins AS (
    INSERT INTO public.subscription_reminders (subscription_id, period_end, kind)
    SELECT c.id, c.anchor, c.kind FROM cand c
    WHERE c.due <= p_as_of AND p_as_of < c.due + interval '24 hours'
    ON CONFLICT (subscription_id, period_end, kind) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_rem FROM ins;

  v_result := jsonb_build_object(
    'ok', true,
    'trials_expired', v_trials,
    'grace_started', v_grace,
    'grace_expired', v_gexp,
    'reminders_created', v_rem,
    'more_pending', v_more,
    'run_id', v_run
  );

  INSERT INTO public.subscription_sweep_runs
    (id, as_of, started_at, finished_at, trials_expired, grace_started, grace_expired, reminders_created, result)
  VALUES (v_run, p_as_of, v_started, clock_timestamp(), v_trials, v_grace, v_gexp, v_rem, v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_subscription_sweeps(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_subscription_sweeps(timestamptz) TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS pg_cron;
      PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'truckopti-subscription-sweeps';
      PERFORM cron.schedule('truckopti-subscription-sweeps', '0 * * * *', 'SELECT public.run_subscription_sweeps()');
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'pg_cron could not be scheduled (%): use the Heroku Scheduler fallback scripts/run-expiry-sweeps.mjs', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'pg_cron is not available here: schedule scripts/run-expiry-sweeps.mjs externally every hour';
  END IF;
END
$cron$;
