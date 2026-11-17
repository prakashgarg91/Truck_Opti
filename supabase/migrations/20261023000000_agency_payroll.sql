-- TO-150: agency driver payroll (MONEY code, integer paise).
--
-- Tables: agency_driver_rates (per driver rate card, versioned), agency_payroll_periods (open ->
-- closed, closed is immutable), agency_payroll_lines (one per driver per closed period) and
-- agency_payroll_adjustments (advances and deductions, accepted only while the period is open).
-- Writes happen ONLY through SECURITY DEFINER commands that take no agency id (the agency comes
-- from auth.uid() via resolve_caller_agency_for_scopes, scope 'finance'; the owner always passes).
--
-- Calculation (closed form, deterministic):
--   completed job  = agency_jobs.status 'delivered' with completed_at (Asia/Kolkata date) inside the
--                    period and not already paid (agency_payroll_line_jobs holds each paid job once).
--   tonnes per trip = floor((weight_kg + 500) / 1000)  (half-up, whole tonnes, per trip).
--   trips_paise    = sum per trip of round(distance_km * per_km_paise) + tonnes * per_tonne_paise.
--   base_paise     = the rate base, once per period, always.
--   earnings       = base + trips.
--   owed           = advances + deductions + carried_in.
--   net            = max(0, earnings - owed);  shortfall = max(0, owed - earnings).
--   carried_in     = shortfall of that driver's line in the latest earlier closed period.
-- The close is atomic (one function body = one transaction): either every line is written and the
-- period closes, or nothing changes.

-- ---------------------------------------------------------------------------
-- Completion source on agency_jobs
-- ---------------------------------------------------------------------------
ALTER TABLE public.agency_jobs ADD COLUMN IF NOT EXISTS distance_km NUMERIC;
ALTER TABLE public.agency_jobs ADD COLUMN IF NOT EXISTS weight_kg NUMERIC;
ALTER TABLE public.agency_jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE public.agency_jobs DROP CONSTRAINT IF EXISTS agency_jobs_distance_km_range;
ALTER TABLE public.agency_jobs ADD CONSTRAINT agency_jobs_distance_km_range
  CHECK (distance_km IS NULL OR distance_km BETWEEN 0 AND 100000);
ALTER TABLE public.agency_jobs DROP CONSTRAINT IF EXISTS agency_jobs_weight_kg_range;
ALTER TABLE public.agency_jobs ADD CONSTRAINT agency_jobs_weight_kg_range
  CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0 AND 1000000);

-- Payroll inputs are protected. The caller (a dispatcher writing agency_jobs directly through the
-- agency_job_owner_update policy runs as role authenticated) can never set completed_at, never
-- create a job as delivered, and once a job is delivered cannot change completed_at, distance_km,
-- weight_kg or driver_id. completed_at is write-once for EVERY role.
-- Only the database owner / service role (seed fixtures, SECURITY DEFINER commands, which run as
-- the owner) may INSERT with an explicit completed_at or a delivered status.
CREATE OR REPLACE FUNCTION public.agency_jobs_set_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_priv boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT v_priv THEN
      IF NEW.completed_at IS NOT NULL THEN
        RAISE EXCEPTION 'completed_at is set by the system and cannot be provided.';
      END IF;
      IF NEW.status = 'delivered' THEN
        RAISE EXCEPTION 'A job cannot be created as delivered.';
      END IF;
    END IF;
    IF NEW.status = 'delivered' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.completed_at IS NOT NULL AND NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'completed_at is write-once and cannot be changed.';
  END IF;

  -- Once a job has been delivered (or ever carried a completion time) its payroll inputs are frozen.
  IF (OLD.status = 'delivered' OR OLD.completed_at IS NOT NULL)
     AND (NEW.distance_km IS DISTINCT FROM OLD.distance_km
          OR NEW.weight_kg IS DISTINCT FROM OLD.weight_kg
          OR NEW.driver_id IS DISTINCT FROM OLD.driver_id) THEN
    RAISE EXCEPTION 'A delivered job is final: its driver, distance, weight and completion time cannot be changed.';
  END IF;

  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    -- Only the NULL -> now() stamp above is allowed; a caller never supplies completed_at.
    RAISE EXCEPTION 'completed_at is set by the system and cannot be provided.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_jobs_set_completed_at ON public.agency_jobs;
CREATE TRIGGER trg_agency_jobs_set_completed_at
  BEFORE INSERT OR UPDATE ON public.agency_jobs
  FOR EACH ROW EXECUTE FUNCTION public.agency_jobs_set_completed_at();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agency_driver_rates (
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers (id) ON DELETE CASCADE,
  base_paise BIGINT NOT NULL CHECK (base_paise BETWEEN 0 AND 1000000000),
  per_km_paise BIGINT NOT NULL CHECK (per_km_paise BETWEEN 0 AND 1000000000),
  per_tonne_paise BIGINT NOT NULL CHECK (per_tonne_paise BETWEEN 0 AND 1000000000),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (agency_id, driver_id)
);

CREATE TABLE IF NOT EXISTS public.agency_payroll_periods (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  close_idempotency_key TEXT CHECK (close_idempotency_key IS NULL OR btrim(close_idempotency_key) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_payroll_periods_dates_check CHECK (period_end >= period_start),
  CONSTRAINT agency_payroll_periods_dates_key UNIQUE (agency_id, period_start, period_end),
  CONSTRAINT agency_payroll_periods_idem_key UNIQUE (agency_id, idempotency_key),
  CONSTRAINT agency_payroll_periods_tenant_key UNIQUE (id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.agency_payroll_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  base_paise BIGINT NOT NULL CHECK (base_paise >= 0),
  trips_paise BIGINT NOT NULL CHECK (trips_paise >= 0),
  advances_paise BIGINT NOT NULL CHECK (advances_paise >= 0),
  deductions_paise BIGINT NOT NULL CHECK (deductions_paise >= 0),
  net_paise BIGINT NOT NULL CHECK (net_paise >= 0),
  shortfall_paise BIGINT NOT NULL CHECK (shortfall_paise >= 0),
  carried_in_paise BIGINT NOT NULL DEFAULT 0 CHECK (carried_in_paise >= 0),
  trip_count INTEGER NOT NULL CHECK (trip_count >= 0),
  per_km_paise BIGINT NOT NULL DEFAULT 0 CHECK (per_km_paise >= 0),
  per_tonne_paise BIGINT NOT NULL DEFAULT 0 CHECK (per_tonne_paise >= 0),
  rate_version INTEGER NOT NULL DEFAULT 0 CHECK (rate_version >= 0),
  CONSTRAINT agency_payroll_lines_period_fk
    FOREIGN KEY (period_id, agency_id)
    REFERENCES public.agency_payroll_periods (id, agency_id) ON DELETE CASCADE,
  CONSTRAINT agency_payroll_lines_driver_key UNIQUE (period_id, driver_id)
);

CREATE TABLE IF NOT EXISTS public.agency_payroll_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  period_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('advance', 'deduction')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  reason TEXT NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 3 AND 200),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_payroll_adjustments_period_fk
    FOREIGN KEY (period_id, agency_id)
    REFERENCES public.agency_payroll_periods (id, agency_id) ON DELETE CASCADE
);

-- Snapshot of every job paid by a closed line: one job can never be paid twice by one agency.
CREATE TABLE IF NOT EXISTS public.agency_payroll_line_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  period_id UUID NOT NULL,
  line_id UUID NOT NULL REFERENCES public.agency_payroll_lines (id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.drivers (id) ON DELETE RESTRICT,
  job_id UUID NOT NULL,
  distance_km NUMERIC,
  weight_kg NUMERIC,
  completed_at TIMESTAMPTZ,
  CONSTRAINT agency_payroll_line_jobs_job_key UNIQUE (agency_id, job_id),
  CONSTRAINT agency_payroll_line_jobs_period_fk
    FOREIGN KEY (period_id, agency_id)
    REFERENCES public.agency_payroll_periods (id, agency_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS agency_payroll_lines_by_driver ON public.agency_payroll_lines (driver_id);
CREATE INDEX IF NOT EXISTS agency_payroll_adjustments_by_period ON public.agency_payroll_adjustments (period_id, driver_id);

-- ---------------------------------------------------------------------------
-- Immutability: a closed period, its lines and its adjustments never change.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_guard_period()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'open' THEN
      RAISE EXCEPTION 'A payroll period can only be created open.';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'closed' THEN
    RAISE EXCEPTION 'A closed payroll period cannot be changed.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_payroll_guard_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.agency_payroll_periods p
      WHERE p.id = NEW.period_id AND p.status = 'open'
    ) THEN
      RAISE EXCEPTION 'A closed payroll period cannot be changed.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Payroll lines cannot be changed once written.';
END;
$$;

-- Used for adjustments and for the paid-job snapshot: rows exist only while the period is open
-- (adjustments) / are written once at close (snapshot) and never change or disappear after.
CREATE OR REPLACE FUNCTION public.agency_payroll_guard_adjustments()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_period_id uuid;
BEGIN
  v_period_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.period_id ELSE NEW.period_id END;
  IF EXISTS (
    SELECT 1 FROM public.agency_payroll_periods p
    WHERE p.id = v_period_id AND p.status = 'closed'
  ) THEN
    RAISE EXCEPTION 'A closed payroll period cannot be changed.';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_payroll_guard_line_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.agency_payroll_periods p
      WHERE p.id = NEW.period_id AND p.status = 'open'
    ) THEN
      RAISE EXCEPTION 'A closed payroll period cannot be changed.';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Paid job records cannot be changed once written.';
END;
$$;

DROP TRIGGER IF EXISTS trg_agency_payroll_guard_period ON public.agency_payroll_periods;
CREATE TRIGGER trg_agency_payroll_guard_period
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.agency_payroll_guard_period();

DROP TRIGGER IF EXISTS trg_agency_payroll_guard_lines ON public.agency_payroll_lines;
CREATE TRIGGER trg_agency_payroll_guard_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_payroll_lines
  FOR EACH ROW EXECUTE FUNCTION public.agency_payroll_guard_lines();

DROP TRIGGER IF EXISTS trg_agency_payroll_guard_adjustments ON public.agency_payroll_adjustments;
CREATE TRIGGER trg_agency_payroll_guard_adjustments
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_payroll_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.agency_payroll_guard_adjustments();

DROP TRIGGER IF EXISTS trg_agency_payroll_guard_line_jobs ON public.agency_payroll_line_jobs;
CREATE TRIGGER trg_agency_payroll_guard_line_jobs
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_payroll_line_jobs
  FOR EACH ROW EXECUTE FUNCTION public.agency_payroll_guard_line_jobs();

-- ---------------------------------------------------------------------------
-- RLS: finance scope and owner only; a driver reads only their own lines.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_caller_driver_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid();
$$;

ALTER TABLE public.agency_driver_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_payroll_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_payroll_line_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_driver_rates_select ON public.agency_driver_rates;
CREATE POLICY agency_driver_rates_select ON public.agency_driver_rates
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[])));

DROP POLICY IF EXISTS agency_payroll_periods_select ON public.agency_payroll_periods;
CREATE POLICY agency_payroll_periods_select ON public.agency_payroll_periods
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[])));

DROP POLICY IF EXISTS agency_payroll_lines_select ON public.agency_payroll_lines;
CREATE POLICY agency_payroll_lines_select ON public.agency_payroll_lines
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[]))
    OR driver_id IN (SELECT public.agency_payroll_caller_driver_ids())
  );

DROP POLICY IF EXISTS agency_payroll_adjustments_select ON public.agency_payroll_adjustments;
CREATE POLICY agency_payroll_adjustments_select ON public.agency_payroll_adjustments
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[])));

DROP POLICY IF EXISTS agency_payroll_line_jobs_select ON public.agency_payroll_line_jobs;
CREATE POLICY agency_payroll_line_jobs_select ON public.agency_payroll_line_jobs
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[])));

REVOKE ALL ON public.agency_driver_rates, public.agency_payroll_periods,
  public.agency_payroll_lines, public.agency_payroll_adjustments, public.agency_payroll_line_jobs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_driver_rates, public.agency_payroll_periods,
  public.agency_payroll_lines, public.agency_payroll_adjustments, public.agency_payroll_line_jobs TO authenticated;
GRANT ALL ON public.agency_driver_rates, public.agency_payroll_periods,
  public.agency_payroll_lines, public.agency_payroll_adjustments, public.agency_payroll_line_jobs TO service_role;

REVOKE ALL ON FUNCTION public.agency_payroll_caller_driver_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_payroll_caller_driver_ids() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_driver_rate_set
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_driver_rate_set(
  p_driver_id uuid,
  p_base_paise bigint,
  p_per_km_paise bigint,
  p_per_tonne_paise bigint,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_rate public.agency_driver_rates%ROWTYPE;
  v_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_driver_id IS NULL OR NOT public.driver_is_assigned_to_agency(p_driver_id, v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_employed');
  END IF;

  IF p_base_paise IS NULL OR p_per_km_paise IS NULL OR p_per_tonne_paise IS NULL
     OR p_base_paise < 0 OR p_per_km_paise < 0 OR p_per_tonne_paise < 0
     OR p_base_paise > 1000000000 OR p_per_km_paise > 1000000000 OR p_per_tonne_paise > 1000000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_rate');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payroll:' || v_agency_id::text, 0));

  SELECT * INTO v_rate
  FROM public.agency_driver_rates
  WHERE agency_id = v_agency_id AND driver_id = p_driver_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF coalesce(p_expected_version, -1) <> 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', 0);
    END IF;
    INSERT INTO public.agency_driver_rates (agency_id, driver_id, base_paise, per_km_paise, per_tonne_paise, version)
    VALUES (v_agency_id, p_driver_id, p_base_paise, p_per_km_paise, p_per_tonne_paise, 1);
    v_version := 1;
  ELSE
    IF p_expected_version IS DISTINCT FROM v_rate.version THEN
      RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_rate.version);
    END IF;
    UPDATE public.agency_driver_rates
    SET base_paise = p_base_paise,
        per_km_paise = p_per_km_paise,
        per_tonne_paise = p_per_tonne_paise,
        version = v_rate.version + 1,
        updated_at = now()
    WHERE agency_id = v_agency_id AND driver_id = p_driver_id
    RETURNING version INTO v_version;
  END IF;

  RETURN jsonb_build_object('ok', true, 'state', 'saved', 'version', v_version);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_payroll_adjust
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_adjust(
  p_period_id uuid,
  p_driver_id uuid,
  p_kind text,
  p_amount_paise bigint,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_period public.agency_payroll_periods%ROWTYPE;
  v_reason text;
  v_id uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_period
  FROM public.agency_payroll_periods
  WHERE id = p_period_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payroll period not found or access denied.';
  END IF;

  IF v_period.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'period_closed');
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('advance', 'deduction') THEN
    RAISE EXCEPTION 'Adjustment kind must be advance or deduction.';
  END IF;

  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RAISE EXCEPTION 'Adjustment amount must be greater than zero.';
  END IF;

  v_reason := btrim(coalesce(p_reason, ''));
  IF char_length(v_reason) < 3 OR char_length(v_reason) > 200 THEN
    RAISE EXCEPTION 'Reason must be between 3 and 200 characters.';
  END IF;

  IF p_driver_id IS NULL OR NOT public.driver_is_assigned_to_agency(p_driver_id, v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_employed');
  END IF;

  INSERT INTO public.agency_payroll_adjustments (period_id, agency_id, driver_id, kind, amount_paise, reason, created_by)
  VALUES (p_period_id, v_agency_id, p_driver_id, p_kind, p_amount_paise, v_reason, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'state', 'recorded', 'adjustment_id', v_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_payroll_open_period: creates an OPEN period so advances / deductions can be recorded
-- before the close. Idempotent on (agency, key).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_open_period(
  p_period_start date,
  p_period_end date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_days CONSTANT integer := 93;
  v_agency_id uuid;
  v_key text;
  v_period public.agency_payroll_periods%ROWTYPE;
  v_other public.agency_payroll_periods%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('payroll:' || v_agency_id::text, 0));

  SELECT * INTO v_period
  FROM public.agency_payroll_periods
  WHERE agency_id = v_agency_id AND (idempotency_key = v_key OR close_idempotency_key = v_key)
  ORDER BY created_at
  LIMIT 1;

  IF FOUND THEN
    IF v_period.period_start IS DISTINCT FROM p_period_start OR v_period.period_end IS DISTINCT FROM p_period_end THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'replay', true,
                              'period_id', v_period.id, 'status', v_period.status, 'version', v_period.version);
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_period');
  END IF;
  IF (p_period_end - p_period_start) + 1 > c_max_days THEN
    RETURN jsonb_build_object('ok', false, 'error', 'period_too_long');
  END IF;

  SELECT * INTO v_other
  FROM public.agency_payroll_periods
  WHERE agency_id = v_agency_id AND period_start = p_period_start AND period_end = p_period_end;
  IF FOUND THEN
    IF v_other.status = 'closed' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_closed', 'period_id', v_other.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'period_overlap');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_payroll_periods p
    WHERE p.agency_id = v_agency_id
      AND p.period_start <= p_period_end
      AND p.period_end >= p_period_start
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'period_overlap');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_payroll_periods p
    WHERE p.agency_id = v_agency_id AND p.status = 'closed' AND p.period_start > p_period_start
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'out_of_order');
  END IF;

  INSERT INTO public.agency_payroll_periods (agency_id, period_start, period_end, status, version, idempotency_key)
  VALUES (v_agency_id, p_period_start, p_period_end, 'open', 1, v_key)
  RETURNING * INTO v_period;

  RETURN jsonb_build_object('ok', true, 'state', 'opened', 'replay', false,
                            'period_id', v_period.id, 'status', 'open', 'version', v_period.version);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_payroll_close_period
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_close_period(
  p_period_start date,
  p_period_end date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_days CONSTANT integer := 93;
  v_agency_id uuid;
  v_key text;
  v_period public.agency_payroll_periods%ROWTYPE;
  v_other public.agency_payroll_periods%ROWTYPE;
  v_prev_period uuid;
  v_lines integer := 0;
  r record;
  v_rate public.agency_driver_rates%ROWTYPE;
  v_rate_version integer;
  v_base bigint;
  v_active boolean;
  v_line_id uuid;
  v_trips bigint;
  v_trip_count integer;
  v_adv bigint;
  v_ded bigint;
  v_carried bigint;
  v_earn bigint;
  v_owed bigint;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  -- Serialise payroll of one agency so replay, overlap and carry decisions cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('payroll:' || v_agency_id::text, 0));

  SELECT * INTO v_period
  FROM public.agency_payroll_periods
  WHERE agency_id = v_agency_id AND (idempotency_key = v_key OR close_idempotency_key = v_key)
  ORDER BY created_at
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF v_period.period_start IS DISTINCT FROM p_period_start OR v_period.period_end IS DISTINCT FROM p_period_end THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    IF v_period.status = 'closed' THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'replay', true,
                                'period_id', v_period.id, 'version', v_period.version);
    END IF;
  END IF;

  IF p_period_start IS NULL OR p_period_end IS NULL OR p_period_end < p_period_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_period');
  END IF;
  IF (p_period_end - p_period_start) + 1 > c_max_days THEN
    RETURN jsonb_build_object('ok', false, 'error', 'period_too_long');
  END IF;
  IF p_period_end >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'period_not_finished');
  END IF;

  IF v_period.id IS NULL THEN
    SELECT * INTO v_other
    FROM public.agency_payroll_periods
    WHERE agency_id = v_agency_id AND period_start = p_period_start AND period_end = p_period_end
    FOR UPDATE;

    IF FOUND THEN
      IF v_other.status = 'closed' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_closed', 'period_id', v_other.id);
      END IF;
      -- An open period for exactly these dates (opened under another key) is closed here.
      v_period := v_other;
    ELSIF EXISTS (
      SELECT 1 FROM public.agency_payroll_periods p
      WHERE p.agency_id = v_agency_id
        AND p.period_start <= p_period_end
        AND p.period_end >= p_period_start
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'period_overlap');
    END IF;
  END IF;

  -- Carry is only correct when periods close in order.
  IF EXISTS (
    SELECT 1 FROM public.agency_payroll_periods p
    WHERE p.agency_id = v_agency_id AND p.status = 'closed' AND p.period_start > p_period_start
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'out_of_order');
  END IF;

  -- Everything below is one sub-transaction: an out-of-range amount undoes the whole close.
  BEGIN
    IF v_period.id IS NULL THEN
      INSERT INTO public.agency_payroll_periods (agency_id, period_start, period_end, status, version, idempotency_key)
      VALUES (v_agency_id, p_period_start, p_period_end, 'open', 1, v_key)
      RETURNING * INTO v_period;
    END IF;

    -- The latest earlier closed period of this agency supplies carried-in shortfalls.
    SELECT p.id INTO v_prev_period
    FROM public.agency_payroll_periods p
    WHERE p.agency_id = v_agency_id AND p.status = 'closed' AND p.period_end < p_period_start
    ORDER BY p.period_end DESC
    LIMIT 1;

    -- Drivers: actively employed, OR with an unpaid delivered job, an adjustment, or a previous
    -- shortfall in this period, so earnings and debt are never lost when employment ended.
    FOR r IN
      SELECT d.driver_id FROM (
        SELECT e.driver_id
        FROM public.agency_driver_employment e
        WHERE e.agency_id = v_agency_id AND e.status = 'active'
        UNION
        SELECT j.driver_id
        FROM public.agency_jobs j
        WHERE j.agency_id = v_agency_id
          AND j.driver_id IS NOT NULL
          AND j.status = 'delivered'
          AND j.completed_at IS NOT NULL
          AND (j.completed_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_period_start AND p_period_end
          AND NOT EXISTS (
            SELECT 1 FROM public.agency_payroll_line_jobs lj
            WHERE lj.agency_id = j.agency_id AND lj.job_id = j.id
          )
        UNION
        SELECT a.driver_id
        FROM public.agency_payroll_adjustments a
        WHERE a.period_id = v_period.id
        UNION
        SELECT l.driver_id
        FROM public.agency_payroll_lines l
        WHERE v_prev_period IS NOT NULL AND l.period_id = v_prev_period AND l.shortfall_paise > 0
      ) d
      ORDER BY d.driver_id
    LOOP
      SELECT * INTO v_rate
      FROM public.agency_driver_rates
      WHERE agency_id = v_agency_id AND driver_id = r.driver_id;
      IF NOT FOUND THEN
        v_rate.base_paise := 0;
        v_rate.per_km_paise := 0;
        v_rate.per_tonne_paise := 0;
        v_rate_version := 0;
      ELSE
        v_rate_version := v_rate.version;
      END IF;

      -- The base salary is paid only to a driver who is actively employed at the close.
      SELECT EXISTS (
        SELECT 1 FROM public.agency_driver_employment e
        WHERE e.agency_id = v_agency_id AND e.driver_id = r.driver_id AND e.status = 'active'
      ) INTO v_active;
      v_base := CASE WHEN v_active THEN v_rate.base_paise ELSE 0 END;

      SELECT coalesce(sum(
               round(greatest(coalesce(j.distance_km, 0), 0) * v_rate.per_km_paise)
               + floor((greatest(coalesce(j.weight_kg, 0), 0) + 500) / 1000) * v_rate.per_tonne_paise
             ), 0)::bigint,
             count(*)::int
        INTO v_trips, v_trip_count
      FROM public.agency_jobs j
      WHERE j.agency_id = v_agency_id
        AND j.driver_id = r.driver_id
        AND j.status = 'delivered'
        AND j.completed_at IS NOT NULL
        AND (j.completed_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_period_start AND p_period_end
        AND NOT EXISTS (
          SELECT 1 FROM public.agency_payroll_line_jobs lj
          WHERE lj.agency_id = j.agency_id AND lj.job_id = j.id
        );

      SELECT coalesce(sum(a.amount_paise) FILTER (WHERE a.kind = 'advance'), 0)::bigint,
             coalesce(sum(a.amount_paise) FILTER (WHERE a.kind = 'deduction'), 0)::bigint
        INTO v_adv, v_ded
      FROM public.agency_payroll_adjustments a
      WHERE a.period_id = v_period.id AND a.driver_id = r.driver_id;

      v_carried := 0;
      IF v_prev_period IS NOT NULL THEN
        SELECT coalesce(l.shortfall_paise, 0) INTO v_carried
        FROM public.agency_payroll_lines l
        WHERE l.period_id = v_prev_period AND l.driver_id = r.driver_id;
        v_carried := coalesce(v_carried, 0);
      END IF;

      v_earn := v_base + v_trips;
      v_owed := v_adv + v_ded + v_carried;

      INSERT INTO public.agency_payroll_lines (
        period_id, agency_id, driver_id, base_paise, trips_paise, advances_paise, deductions_paise,
        net_paise, shortfall_paise, carried_in_paise, trip_count, per_km_paise, per_tonne_paise, rate_version
      ) VALUES (
        v_period.id, v_agency_id, r.driver_id, v_base, v_trips, v_adv, v_ded,
        greatest(0, v_earn - v_owed), greatest(0, v_owed - v_earn), v_carried, v_trip_count,
        v_rate.per_km_paise, v_rate.per_tonne_paise, v_rate_version
      )
      RETURNING id INTO v_line_id;

      -- Snapshot the paid jobs: a job can be paid by exactly one line, ever.
      INSERT INTO public.agency_payroll_line_jobs (
        agency_id, period_id, line_id, driver_id, job_id, distance_km, weight_kg, completed_at
      )
      SELECT j.agency_id, v_period.id, v_line_id, r.driver_id, j.id, j.distance_km, j.weight_kg, j.completed_at
      FROM public.agency_jobs j
      WHERE j.agency_id = v_agency_id
        AND j.driver_id = r.driver_id
        AND j.status = 'delivered'
        AND j.completed_at IS NOT NULL
        AND (j.completed_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN p_period_start AND p_period_end
        AND NOT EXISTS (
          SELECT 1 FROM public.agency_payroll_line_jobs lj
          WHERE lj.agency_id = j.agency_id AND lj.job_id = j.id
        );

      v_lines := v_lines + 1;
    END LOOP;

    UPDATE public.agency_payroll_periods
    SET status = 'closed', closed_at = now(), closed_by = auth.uid(), version = version + 1,
        close_idempotency_key = v_key
    WHERE id = v_period.id
    RETURNING * INTO v_period;

    RETURN jsonb_build_object('ok', true, 'state', 'closed', 'replay', false,
                              'period_id', v_period.id, 'version', v_period.version, 'lines', v_lines);
  EXCEPTION WHEN numeric_value_out_of_range THEN
    RETURN jsonb_build_object('ok', false, 'error', 'value_out_of_range');
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_payroll_my_lines: the caller's own closed lines only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_my_lines()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'lines', coalesce(jsonb_agg(
      jsonb_build_object(
        'period_id', l.period_id,
        'period_start', p.period_start,
        'period_end', p.period_end,
        'driver_id', l.driver_id,
        'base_paise', l.base_paise,
        'trips_paise', l.trips_paise,
        'advances_paise', l.advances_paise,
        'deductions_paise', l.deductions_paise,
        'net_paise', l.net_paise,
        'shortfall_paise', l.shortfall_paise,
        'carried_in_paise', l.carried_in_paise,
        'trip_count', l.trip_count
      ) ORDER BY p.period_start DESC, l.id
    ), '[]'::jsonb)
  )
  FROM public.agency_payroll_lines l
  JOIN public.agency_payroll_periods p ON p.id = l.period_id AND p.status = 'closed'
  WHERE l.driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION public.agency_driver_rate_set(uuid, bigint, bigint, bigint, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_payroll_adjust(uuid, uuid, text, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_payroll_open_period(date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_payroll_close_period(date, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_payroll_my_lines() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_driver_rate_set(uuid, bigint, bigint, bigint, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_payroll_adjust(uuid, uuid, text, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_payroll_open_period(date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_payroll_close_period(date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_payroll_my_lines() TO authenticated, service_role;
