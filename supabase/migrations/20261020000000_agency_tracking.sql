-- TO-147: agency trip tracking pings and incidents.
--
-- Tables: agency_tracking_pings (one GPS ping per job and recorded_at) and agency_incidents
-- (per-agency dedupe key, optimistic version). Writes happen ONLY through SECURITY DEFINER
-- commands that take no agency id:
--   tracking_ping_record  - the assigned, actively employed driver (resolved from auth.uid()).
--   agency_incident_open / agency_incident_update - agency scopes dispatcher / fleet_manager.
--   agency_trip_live      - read summary for any active agency scope.
-- Refusals are jsonb {ok:false,error}; scope and approval failures raise through
-- resolve_caller_agency_for_scopes. Direct DML is revoked for authenticated.

CREATE TABLE IF NOT EXISTS public.agency_tracking_pings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.agency_jobs (id) ON DELETE CASCADE,
  driver_id UUID REFERENCES public.drivers (id) ON DELETE SET NULL,
  recorded_at TIMESTAMPTZ NOT NULL,
  lat NUMERIC(9, 6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng NUMERIC(9, 6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  speed_kmph NUMERIC CHECK (speed_kmph IS NULL OR (speed_kmph >= 0 AND speed_kmph <= 250)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_tracking_pings_job_time_key UNIQUE (job_id, recorded_at)
);

CREATE INDEX IF NOT EXISTS agency_tracking_pings_by_agency_job
  ON public.agency_tracking_pings (agency_id, job_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS agency_tracking_pings_by_driver
  ON public.agency_tracking_pings (driver_id);

CREATE TABLE IF NOT EXISTS public.agency_incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.agency_jobs (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('long_halt', 'overspeed', 'route_deviation', 'breakdown', 'accident', 'other')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  dedupe_key TEXT NOT NULL CHECK (btrim(dedupe_key) <> ''),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  resolution_note TEXT,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_incidents_dedupe_key UNIQUE (agency_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS agency_incidents_by_job ON public.agency_incidents (agency_id, job_id, status);

ALTER TABLE public.agency_tracking_pings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_incidents ENABLE ROW LEVEL SECURITY;

-- Driver ids owned by the caller. SECURITY DEFINER so the policy does not depend on drivers RLS.
CREATE OR REPLACE FUNCTION public.tracking_caller_driver_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.tracking_caller_driver_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tracking_caller_driver_ids() TO authenticated, service_role;

DROP POLICY IF EXISTS agency_tracking_pings_select ON public.agency_tracking_pings;
CREATE POLICY agency_tracking_pings_select ON public.agency_tracking_pings
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]))
    OR driver_id IN (SELECT public.tracking_caller_driver_ids())
  );

DROP POLICY IF EXISTS agency_incidents_select ON public.agency_incidents;
CREATE POLICY agency_incidents_select ON public.agency_incidents
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

REVOKE ALL ON public.agency_tracking_pings, public.agency_incidents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_tracking_pings, public.agency_incidents TO authenticated;
GRANT ALL ON public.agency_tracking_pings, public.agency_incidents TO service_role;

-- ---------------------------------------------------------------------------
-- Driver ping
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_ping_record(
  p_job_id uuid,
  p_lat numeric,
  p_lng numeric,
  p_speed_kmph numeric,
  p_recorded_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_rate_limit CONSTANT integer := 120;   -- pings accepted per job per hour, counted on server created_at
  c_total_cap CONSTANT integer := 20000;  -- hard lifetime cap of pings per job
  v_driver_id uuid;
  v_job public.agency_jobs%ROWTYPE;
  v_recent integer;
  v_total integer;
  v_id uuid;
  v_lat numeric;
  v_lng numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_assigned');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.tracking_caller_driver_ids()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_assigned');
  END IF;

  -- Share-lock the job so a concurrent reassignment or status change cannot slip past the checks below.
  SELECT * INTO v_job FROM public.agency_jobs WHERE id = p_job_id FOR SHARE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- The job must belong to an agency that currently employs one of the caller's driver rows.
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_driver_employment e
    WHERE e.agency_id = v_job.agency_id
      AND e.status = 'active'
      AND e.driver_id IN (SELECT public.tracking_caller_driver_ids())
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF NOT public.agency_is_operational(v_job.agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_operational');
  END IF;

  -- The job's assigned driver must be one of the caller's own driver rows.
  IF v_job.driver_id IS NULL OR v_job.driver_id NOT IN (SELECT public.tracking_caller_driver_ids()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_assigned');
  END IF;
  v_driver_id := v_job.driver_id;

  -- The assigned driver row itself must be actively employed by the job's agency.
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_driver_employment e
    WHERE e.agency_id = v_job.agency_id AND e.driver_id = v_driver_id AND e.status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_job.status NOT IN ('pending', 'accepted', 'in_transit') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_active');
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL OR p_lat < -90 OR p_lat > 90 OR p_lng < -180 OR p_lng > 180 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_coordinates');
  END IF;

  IF p_speed_kmph IS NULL OR p_speed_kmph < 0 OR p_speed_kmph > 250 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_speed');
  END IF;

  IF p_recorded_at IS NULL OR p_recorded_at > now() + interval '5 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'future_timestamp');
  END IF;

  IF p_recorded_at < now() - interval '24 hours' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_old');
  END IF;

  -- Serialise pings of one job so the guards and the duplicate check cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('tracking_ping:' || p_job_id::text, 0));

  v_lat := round(p_lat, 6);
  v_lng := round(p_lng, 6);

  SELECT p.id INTO v_id FROM public.agency_tracking_pings p WHERE p.job_id = p_job_id AND p.recorded_at = p_recorded_at;
  IF FOUND THEN
    -- Same instant: an exact resend is a replay; a different position is a conflict, never a silent replay.
    IF EXISTS (SELECT 1 FROM public.agency_tracking_pings p WHERE p.id = v_id AND p.lat = v_lat AND p.lng = v_lng) THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'ping_id', v_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'ping_conflict');
  END IF;

  -- Hard lifetime cap per job (count stops at the cap).
  SELECT count(*)::int INTO v_total FROM (
    SELECT 1 FROM public.agency_tracking_pings p WHERE p.job_id = p_job_id LIMIT c_total_cap
  ) t;
  IF v_total >= c_total_cap THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ping_cap_reached');
  END IF;

  -- Burst guard on SERVER time only: recorded_at is client supplied and must not widen or dodge the window.
  SELECT count(*)::int INTO v_recent
  FROM public.agency_tracking_pings p
  WHERE p.job_id = p_job_id
    AND p.created_at > now() - interval '1 hour';
  IF v_recent >= c_rate_limit THEN
    RETURN jsonb_build_object('ok', false, 'error', 'rate_limited');
  END IF;

  -- Minimum spacing (2 seconds) between distinct recorded_at values of one job.
  IF EXISTS (
    SELECT 1 FROM public.agency_tracking_pings p
    WHERE p.job_id = p_job_id
      AND p.recorded_at > p_recorded_at - interval '2 seconds'
      AND p.recorded_at < p_recorded_at + interval '2 seconds'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_frequent');
  END IF;

  INSERT INTO public.agency_tracking_pings (agency_id, job_id, driver_id, recorded_at, lat, lng, speed_kmph)
  VALUES (v_job.agency_id, p_job_id, v_driver_id, p_recorded_at, v_lat, v_lng, p_speed_kmph)
  ON CONFLICT (job_id, recorded_at) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'replay', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'ping_id', v_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- Incidents
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_incident_open(
  p_job_id uuid,
  p_kind text,
  p_details jsonb,
  p_dedupe_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_details jsonb;
  v_existing public.agency_incidents%ROWTYPE;
  v_id uuid;
  v_open integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('long_halt', 'overspeed', 'route_deviation', 'breakdown', 'accident', 'other') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  v_key := btrim(coalesce(p_dedupe_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dedupe_key_required');
  END IF;
  IF char_length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dedupe_key_too_long');
  END IF;

  v_details := coalesce(p_details, '{}'::jsonb);
  IF jsonb_typeof(v_details) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_details');
  END IF;
  IF length(v_details::text) > 4000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'details_too_large');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agency_jobs j WHERE j.id = p_job_id AND j.agency_id = v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agency_incident:' || v_agency_id::text || ':' || v_key, 0));

  SELECT * INTO v_existing FROM public.agency_incidents WHERE agency_id = v_agency_id AND dedupe_key = v_key;
  IF FOUND THEN
    -- A reused key is a replay only for the very same job and kind.
    IF v_existing.job_id IS DISTINCT FROM p_job_id OR v_existing.kind IS DISTINCT FROM p_kind THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'replay', true, 'incident_id', v_existing.id);
  END IF;

  -- Per-job open-incident limit, serialised per job.
  PERFORM pg_advisory_xact_lock(hashtextextended('agency_incident_job:' || p_job_id::text, 0));
  SELECT count(*)::int INTO v_open FROM public.agency_incidents i
  WHERE i.job_id = p_job_id AND i.agency_id = v_agency_id AND i.status IN ('open', 'acknowledged');
  IF v_open >= 50 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_open_incidents');
  END IF;

  INSERT INTO public.agency_incidents (agency_id, job_id, kind, status, dedupe_key, details, created_by)
  VALUES (v_agency_id, p_job_id, p_kind, 'open', v_key, v_details, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'incident_id', v_id, 'version', 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_incident_update(
  p_incident_id uuid,
  p_to_status text,
  p_expected_version integer,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_inc public.agency_incidents%ROWTYPE;
  v_note text;
  v_updated public.agency_incidents%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_to_status IS NULL OR p_to_status NOT IN ('acknowledged', 'resolved') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  SELECT * INTO v_inc
  FROM public.agency_incidents
  WHERE id = p_incident_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_inc.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_inc.version);
  END IF;

  IF v_inc.status = 'resolved'
     OR (v_inc.status = 'acknowledged' AND p_to_status = 'acknowledged') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition');
  END IF;

  v_note := NULL;
  IF p_to_status = 'resolved' THEN
    v_note := btrim(coalesce(p_note, ''));
    IF char_length(v_note) < 3 OR char_length(v_note) > 500 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'note_required');
    END IF;
  END IF;

  UPDATE public.agency_incidents
  SET status = p_to_status,
      resolution_note = coalesce(v_note, resolution_note),
      version = version + 1,
      updated_at = now()
  WHERE id = p_incident_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', v_updated.status, 'version', v_updated.version);
END;
$$;

-- ---------------------------------------------------------------------------
-- Live summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_trip_live(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_last jsonb;
  v_count integer;
  v_open integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agency_jobs j WHERE j.id = p_job_id AND j.agency_id = v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT jsonb_build_object(
           'recorded_at', p.recorded_at, 'lat', p.lat, 'lng', p.lng,
           'speed_kmph', p.speed_kmph, 'driver_id', p.driver_id)
    INTO v_last
  FROM public.agency_tracking_pings p
  WHERE p.job_id = p_job_id AND p.agency_id = v_agency_id
  ORDER BY p.recorded_at DESC
  LIMIT 1;

  -- Bounded count: never scans more than 100001 rows.
  SELECT count(*)::int INTO v_count FROM (
    SELECT 1 FROM public.agency_tracking_pings p
    WHERE p.job_id = p_job_id AND p.agency_id = v_agency_id
    LIMIT 100001
  ) t;

  SELECT count(*)::int INTO v_open
  FROM public.agency_incidents i
  WHERE i.job_id = p_job_id AND i.agency_id = v_agency_id AND i.status IN ('open', 'acknowledged');

  RETURN jsonb_build_object('ok', true, 'last_ping', v_last, 'ping_count', v_count, 'open_incidents', v_open);
END;
$$;

-- ---------------------------------------------------------------------------
-- Immutability: pings are append-only; incidents change only status, version, resolution_note
-- (and updated_at) through the update command. Applies to every role including service_role.
-- Referential cascades run as nested triggers (pg_trigger_depth() >= 2) and are allowed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tracking_pings_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() >= 2 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'agency_tracking_pings is append-only.' USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_incidents_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() >= 2 THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agency_incidents rows cannot be deleted.' USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id
     OR NEW.job_id IS DISTINCT FROM OLD.job_id
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.details IS DISTINCT FROM OLD.details
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'agency_incidents: only status, version and resolution_note may change.' USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agency_tracking_pings_immutable ON public.agency_tracking_pings;
CREATE TRIGGER agency_tracking_pings_immutable
  BEFORE UPDATE OR DELETE ON public.agency_tracking_pings
  FOR EACH ROW EXECUTE FUNCTION public.tracking_pings_immutable();

DROP TRIGGER IF EXISTS agency_incidents_guard ON public.agency_incidents;
CREATE TRIGGER agency_incidents_guard
  BEFORE UPDATE OR DELETE ON public.agency_incidents
  FOR EACH ROW EXECUTE FUNCTION public.agency_incidents_guard();

REVOKE ALL ON FUNCTION public.tracking_pings_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_incidents_guard() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.tracking_ping_record(uuid, numeric, numeric, numeric, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_incident_open(uuid, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_incident_update(uuid, text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_trip_live(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tracking_ping_record(uuid, numeric, numeric, numeric, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_incident_open(uuid, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_incident_update(uuid, text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_trip_live(uuid) TO authenticated, service_role;
