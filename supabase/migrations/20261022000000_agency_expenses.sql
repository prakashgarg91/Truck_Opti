-- TO-149: agency expenses, fuel fills and maintenance schedule.
--
-- Tables: agency_expenses (one row per expense, unique per agency and idempotency key),
-- agency_fuel_fills (odometer-ordered fills, each linked to its fuel expense),
-- agency_maintenance_items (service schedule per truck, optimistic version) and
-- agency_maintenance_services (audit of each completed service, idempotent per key).
-- Writes happen ONLY through SECURITY DEFINER commands that take no agency id (the agency comes
-- from auth.uid() via resolve_caller_agency_for_scopes). Write scopes: owner, fleet_manager and
-- finance. Every active scope reads. There is deliberately no delete command: expenses are a
-- financial record and are corrected by recording, not by removing.

CREATE TABLE IF NOT EXISTS public.agency_expenses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  truck_id UUID REFERENCES public.agency_trucks (id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (category IN ('fuel', 'toll', 'maintenance', 'driver_allowance', 'insurance', 'permit', 'other')),
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  spent_on DATE NOT NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 300),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_expenses_idem_key UNIQUE (agency_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.agency_fuel_fills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  truck_id UUID NOT NULL REFERENCES public.agency_trucks (id) ON DELETE RESTRICT,
  odometer_km NUMERIC NOT NULL CHECK (odometer_km >= 0),
  litres NUMERIC(8, 2) NOT NULL CHECK (litres >= 1 AND litres <= 1000),
  full_tank BOOLEAN NOT NULL DEFAULT TRUE,
  expense_id UUID REFERENCES public.agency_expenses (id) ON DELETE RESTRICT,
  filled_on DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agency_maintenance_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  truck_id UUID NOT NULL REFERENCES public.agency_trucks (id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (btrim(name) <> '' AND char_length(name) <= 100),
  interval_km INTEGER CHECK (interval_km IS NULL OR interval_km > 0),
  interval_days INTEGER CHECK (interval_days IS NULL OR interval_days > 0),
  last_service_km NUMERIC CHECK (last_service_km IS NULL OR last_service_km >= 0),
  last_service_on DATE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_maintenance_items_name_key UNIQUE (agency_id, truck_id, name)
);

CREATE TABLE IF NOT EXISTS public.agency_maintenance_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.agency_maintenance_items (id) ON DELETE RESTRICT,
  service_km NUMERIC NOT NULL CHECK (service_km >= 0),
  service_on DATE NOT NULL,
  cost_paise BIGINT NOT NULL DEFAULT 0 CHECK (cost_paise >= 0),
  expense_id UUID REFERENCES public.agency_expenses (id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_maintenance_services_idem_key UNIQUE (agency_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS agency_expenses_by_date ON public.agency_expenses (agency_id, spent_on);
CREATE INDEX IF NOT EXISTS agency_expenses_by_truck ON public.agency_expenses (truck_id) WHERE truck_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agency_fuel_fills_by_truck ON public.agency_fuel_fills (truck_id, odometer_km);
CREATE INDEX IF NOT EXISTS agency_maintenance_items_by_truck ON public.agency_maintenance_items (truck_id);
CREATE INDEX IF NOT EXISTS agency_maintenance_services_by_item ON public.agency_maintenance_services (item_id);

ALTER TABLE public.agency_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_fuel_fills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_maintenance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_maintenance_services ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_expenses_select ON public.agency_expenses;
CREATE POLICY agency_expenses_select ON public.agency_expenses
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_fuel_fills_select ON public.agency_fuel_fills;
CREATE POLICY agency_fuel_fills_select ON public.agency_fuel_fills
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_maintenance_items_select ON public.agency_maintenance_items;
CREATE POLICY agency_maintenance_items_select ON public.agency_maintenance_items
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_maintenance_services_select ON public.agency_maintenance_services;
CREATE POLICY agency_maintenance_services_select ON public.agency_maintenance_services
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

REVOKE ALL ON public.agency_expenses, public.agency_fuel_fills, public.agency_maintenance_items,
  public.agency_maintenance_services FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_expenses, public.agency_fuel_fills, public.agency_maintenance_items,
  public.agency_maintenance_services TO authenticated;
GRANT ALL ON public.agency_expenses, public.agency_fuel_fills, public.agency_maintenance_items,
  public.agency_maintenance_services TO service_role;

-- ---------------------------------------------------------------------------
-- agency_expense_record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_expense_record(
  p_truck_id uuid,
  p_category text,
  p_amount_paise bigint,
  p_spent_on date,
  p_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_note text;
  v_existing public.agency_expenses%ROWTYPE;
  v_id uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['fleet_manager', 'finance']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  v_note := nullif(btrim(coalesce(p_note, '')), '');

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agency_id::text || ':exp:' || v_key, 0));

  SELECT * INTO v_existing
  FROM public.agency_expenses
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.truck_id IS NOT DISTINCT FROM p_truck_id
       AND v_existing.category = p_category
       AND v_existing.amount_paise = p_amount_paise
       AND v_existing.spent_on = p_spent_on
       AND v_existing.note IS NOT DISTINCT FROM v_note THEN
      RETURN jsonb_build_object('ok', true, 'expense_id', v_existing.id, 'replay', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF p_category IS NULL OR p_category NOT IN ('fuel', 'toll', 'maintenance', 'driver_allowance', 'insurance', 'permit', 'other') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_category');
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 OR p_amount_paise > 100000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_spent_on IS NULL OR p_spent_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'future_date');
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_too_long');
  END IF;
  IF p_truck_id IS NULL THEN
    IF p_category IN ('fuel', 'toll', 'maintenance', 'driver_allowance') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'truck_required');
    END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.agency_trucks t WHERE t.id = p_truck_id AND t.agency_id = v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'truck_not_found');
  END IF;

  INSERT INTO public.agency_expenses (agency_id, truck_id, category, amount_paise, spent_on, note, idempotency_key, created_by)
  VALUES (v_agency_id, p_truck_id, p_category, p_amount_paise, p_spent_on, v_note, v_key, auth.uid())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'expense_id', v_id, 'replay', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_fuel_fill_record
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_fuel_fill_record(
  p_truck_id uuid,
  p_odometer_km numeric,
  p_litres numeric,
  p_full_tank boolean,
  p_amount_paise bigint,
  p_filled_on date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_full boolean;
  v_litres numeric;
  v_existing public.agency_expenses%ROWTYPE;
  v_fill public.agency_fuel_fills%ROWTYPE;
  v_previous numeric;
  v_expense uuid;
  v_fill_id uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['fleet_manager', 'finance']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  v_full := coalesce(p_full_tank, TRUE);
  v_litres := round(p_litres, 2);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agency_id::text || ':exp:' || v_key, 0));

  SELECT * INTO v_existing
  FROM public.agency_expenses
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    SELECT * INTO v_fill FROM public.agency_fuel_fills WHERE expense_id = v_existing.id;
    IF FOUND
       AND v_existing.category = 'fuel'
       AND v_existing.truck_id IS NOT DISTINCT FROM p_truck_id
       AND v_existing.amount_paise = p_amount_paise
       AND v_existing.spent_on = p_filled_on
       AND v_fill.odometer_km = p_odometer_km
       AND v_fill.litres = v_litres
       AND v_fill.full_tank = v_full THEN
      RETURN jsonb_build_object('ok', true, 'expense_id', v_existing.id, 'fill_id', v_fill.id, 'replay', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF p_litres IS NULL OR p_litres < 1 OR p_litres > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_litres');
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 OR p_amount_paise > 100000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_filled_on IS NULL OR p_filled_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'future_date');
  END IF;
  IF p_odometer_km IS NULL OR p_odometer_km < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_odometer');
  END IF;

  -- Lock the truck row so concurrent fills cannot both pass the odometer check.
  PERFORM 1 FROM public.agency_trucks t
  WHERE t.id = p_truck_id AND t.agency_id = v_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'truck_not_found');
  END IF;

  SELECT max(f.odometer_km) INTO v_previous
  FROM public.agency_fuel_fills f
  WHERE f.truck_id = p_truck_id AND f.agency_id = v_agency_id;

  IF v_previous IS NOT NULL AND p_odometer_km <= v_previous THEN
    RETURN jsonb_build_object('ok', false, 'error', 'odometer_not_increasing', 'previous_km', v_previous);
  END IF;

  INSERT INTO public.agency_expenses (agency_id, truck_id, category, amount_paise, spent_on, note, idempotency_key, created_by)
  VALUES (v_agency_id, p_truck_id, 'fuel', p_amount_paise, p_filled_on, NULL, v_key, auth.uid())
  RETURNING id INTO v_expense;

  INSERT INTO public.agency_fuel_fills (agency_id, truck_id, odometer_km, litres, full_tank, expense_id, filled_on)
  VALUES (v_agency_id, p_truck_id, p_odometer_km, v_litres, v_full, v_expense, p_filled_on)
  RETURNING id INTO v_fill_id;

  RETURN jsonb_build_object('ok', true, 'expense_id', v_expense, 'fill_id', v_fill_id, 'replay', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_maintenance_item_upsert
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_maintenance_item_upsert(
  p_truck_id uuid,
  p_name text,
  p_interval_km integer,
  p_interval_days integer,
  p_last_service_km numeric,
  p_last_service_on date,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_name text;
  v_item public.agency_maintenance_items%ROWTYPE;
  v_id uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['fleet_manager', 'finance']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  IF p_truck_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.agency_trucks t WHERE t.id = p_truck_id AND t.agency_id = v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'truck_not_found');
  END IF;

  v_name := btrim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;
  IF char_length(v_name) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_too_long');
  END IF;

  IF p_interval_km IS NULL AND p_interval_days IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'interval_required');
  END IF;
  IF (p_interval_km IS NOT NULL AND p_interval_km <= 0) OR (p_interval_days IS NOT NULL AND p_interval_days <= 0) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_interval');
  END IF;
  IF p_last_service_km IS NOT NULL AND p_last_service_km < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_km');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agency_id::text || ':mi:' || p_truck_id::text || ':' || lower(v_name), 0));

  SELECT * INTO v_item
  FROM public.agency_maintenance_items
  WHERE agency_id = v_agency_id AND truck_id = p_truck_id AND name = v_name
  FOR UPDATE;

  IF p_expected_version IS NULL THEN
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'name_exists');
    END IF;
    INSERT INTO public.agency_maintenance_items (agency_id, truck_id, name, interval_km, interval_days, last_service_km, last_service_on)
    VALUES (v_agency_id, p_truck_id, v_name, p_interval_km, p_interval_days, p_last_service_km, p_last_service_on)
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'item_id', v_id, 'version', 1);
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item_not_found');
  END IF;
  IF v_item.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_item.version);
  END IF;

  UPDATE public.agency_maintenance_items
  SET interval_km = p_interval_km,
      interval_days = p_interval_days,
      last_service_km = coalesce(p_last_service_km, last_service_km),
      last_service_on = coalesce(p_last_service_on, last_service_on),
      version = version + 1,
      updated_at = now()
  WHERE id = v_item.id;

  RETURN jsonb_build_object('ok', true, 'item_id', v_item.id, 'version', v_item.version + 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_maintenance_service_done
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_maintenance_service_done(
  p_item_id uuid,
  p_service_km numeric,
  p_service_on date,
  p_expected_version integer,
  p_cost_paise bigint,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_cost bigint;
  v_prior public.agency_maintenance_services%ROWTYPE;
  v_item public.agency_maintenance_items%ROWTYPE;
  v_expense uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['fleet_manager', 'finance']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;
  v_cost := coalesce(p_cost_paise, 0);

  PERFORM pg_advisory_xact_lock(hashtextextended(v_agency_id::text || ':svc:' || v_key, 0));

  SELECT * INTO v_prior
  FROM public.agency_maintenance_services
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_prior.item_id = p_item_id
       AND v_prior.service_km = p_service_km
       AND v_prior.service_on = p_service_on
       AND v_prior.cost_paise = v_cost THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'expense_id', v_prior.expense_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  SELECT * INTO v_item
  FROM public.agency_maintenance_items
  WHERE id = p_item_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'item_not_found');
  END IF;

  IF v_cost < 0 OR v_cost > 100000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_service_km IS NULL OR p_service_km < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_km');
  END IF;
  IF p_service_on IS NULL OR p_service_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'future_date');
  END IF;
  IF p_expected_version IS NULL OR v_item.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_item.version);
  END IF;
  IF v_item.last_service_km IS NOT NULL AND p_service_km < v_item.last_service_km THEN
    RETURN jsonb_build_object('ok', false, 'error', 'km_going_backwards', 'last_service_km', v_item.last_service_km);
  END IF;

  IF v_cost > 0 THEN
    INSERT INTO public.agency_expenses (agency_id, truck_id, category, amount_paise, spent_on, note, idempotency_key, created_by)
    VALUES (v_agency_id, v_item.truck_id, 'maintenance', v_cost, p_service_on, left('Service: ' || v_item.name, 300), 'svc:' || v_key, auth.uid())
    RETURNING id INTO v_expense;
  END IF;

  UPDATE public.agency_maintenance_items
  SET last_service_km = p_service_km,
      last_service_on = p_service_on,
      version = version + 1,
      updated_at = now()
  WHERE id = v_item.id;

  INSERT INTO public.agency_maintenance_services (agency_id, item_id, service_km, service_on, cost_paise, expense_id, idempotency_key, created_by)
  VALUES (v_agency_id, v_item.id, p_service_km, p_service_on, v_cost, v_expense, v_key, auth.uid());

  RETURN jsonb_build_object('ok', true, 'replay', false, 'expense_id', v_expense, 'version', v_item.version + 1);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_expense_summary (read command, every active scope)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_expense_summary(p_from date, p_to date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_by_category jsonb;
  v_by_truck jsonb;
  v_total bigint;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_range');
  END IF;
  IF (p_to - p_from) + 1 > 366 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'range_too_large');
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('category', q.category, 'total_paise', q.total) ORDER BY q.category), '[]'::jsonb)
    INTO v_by_category
  FROM (
    SELECT e.category, sum(e.amount_paise)::bigint AS total
    FROM public.agency_expenses e
    WHERE e.agency_id = v_agency_id AND e.spent_on BETWEEN p_from AND p_to
    GROUP BY e.category
  ) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('truck_id', q.truck_id, 'total_paise', q.total) ORDER BY q.truck_id), '[]'::jsonb)
    INTO v_by_truck
  FROM (
    SELECT e.truck_id, sum(e.amount_paise)::bigint AS total
    FROM public.agency_expenses e
    WHERE e.agency_id = v_agency_id AND e.spent_on BETWEEN p_from AND p_to AND e.truck_id IS NOT NULL
    GROUP BY e.truck_id
  ) q;

  SELECT coalesce(sum(e.amount_paise), 0)::bigint INTO v_total
  FROM public.agency_expenses e
  WHERE e.agency_id = v_agency_id AND e.spent_on BETWEEN p_from AND p_to;

  RETURN jsonb_build_object('ok', true, 'by_category', v_by_category, 'by_truck', v_by_truck, 'total_paise', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_expense_record(uuid, text, bigint, date, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_fuel_fill_record(uuid, numeric, numeric, boolean, bigint, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_maintenance_item_upsert(uuid, text, integer, integer, numeric, date, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_maintenance_service_done(uuid, numeric, date, integer, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_expense_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_expense_record(uuid, text, bigint, date, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_fuel_fill_record(uuid, numeric, numeric, boolean, bigint, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_maintenance_item_upsert(uuid, text, integer, integer, numeric, date, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_maintenance_service_done(uuid, numeric, date, integer, bigint, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_expense_summary(date, date) TO authenticated, service_role;
