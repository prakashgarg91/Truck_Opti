-- TO-145 slice 3: load plans (versioned allocations of order lines onto trucks).
--
-- The server only STORES, RE-VALIDATES and APPROVES plans; the planning maths lives client side.
-- Tables: agency_load_plans (one row per plan version of a name), agency_load_plan_loads (one row
-- per truck), agency_load_plan_lines (order line quantities on a load) and agency_load_plan_unmet
-- (lines the planner could not place). Writes happen ONLY through SECURITY DEFINER commands that
-- take no agency id (agency from auth.uid() via resolve_caller_agency_for_scopes, scope
-- 'dispatcher'; the owner is always allowed). total_kg and utilization_pct are recomputed here.
--
-- Weight rule: weight = quantity x weight_per_unit_kg. When weight_per_unit_kg is NULL the weight
-- falls back to 1 kg per unit for unit 'kg' and 1000 kg per unit for unit 'tonne'; any other unit
-- without a weight is refused ('weight_missing') instead of being silently weighed as zero.
--
-- History is append-only: once a plan leaves 'draft' its loads, lines and unmet rows are frozen,
-- the plan identity never changes and plans are never deleted. The guards are triggers, so they
-- bind every role including service_role; only FK cascades (trigger depth > 1) pass.
-- No date logic is performed here (only timestamptz now()); any display of dates must use
-- Asia/Kolkata on the client.

-- Composite targets so child rows cannot link across agencies.
CREATE UNIQUE INDEX IF NOT EXISTS agency_trucks_id_agency_key ON public.agency_trucks (id, agency_id);
CREATE UNIQUE INDEX IF NOT EXISTS agency_order_lines_id_agency_key ON public.agency_order_lines (id, agency_id);

CREATE TABLE IF NOT EXISTS public.agency_load_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  batch_id UUID,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80 AND btrim(name) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded', 'cancelled')),
  plan_version INTEGER NOT NULL DEFAULT 1 CHECK (plan_version >= 1),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> '' AND char_length(idempotency_key) <= 200),
  payload_hash TEXT,
  approved_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_load_plans_approved_check CHECK (status <> 'approved' OR approved_at IS NOT NULL),
  CONSTRAINT agency_load_plans_batch_fk
    FOREIGN KEY (batch_id, agency_id)
    REFERENCES public.agency_order_batches (id, agency_id) ON DELETE SET NULL (batch_id),
  CONSTRAINT agency_load_plans_idem_key UNIQUE (agency_id, idempotency_key),
  CONSTRAINT agency_load_plans_lineage_key UNIQUE (agency_id, name, plan_version),
  CONSTRAINT agency_load_plans_tenant_key UNIQUE (id, agency_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_load_plans_one_approved_per_name
  ON public.agency_load_plans (agency_id, name) WHERE status = 'approved';

CREATE TABLE IF NOT EXISTS public.agency_load_plan_loads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  truck_id UUID NOT NULL,
  total_kg NUMERIC NOT NULL CHECK (total_kg >= 0 AND total_kg < 1e12 AND total_kg <> 'NaN'::numeric),
  utilization_pct NUMERIC NOT NULL CHECK (utilization_pct >= 0 AND utilization_pct < 1e9 AND utilization_pct <> 'NaN'::numeric),
  CONSTRAINT agency_load_plan_loads_plan_fk
    FOREIGN KEY (plan_id, agency_id) REFERENCES public.agency_load_plans (id, agency_id) ON DELETE CASCADE,
  CONSTRAINT agency_load_plan_loads_truck_fk
    FOREIGN KEY (truck_id, agency_id) REFERENCES public.agency_trucks (id, agency_id),
  CONSTRAINT agency_load_plan_loads_truck_key UNIQUE (plan_id, truck_id),
  CONSTRAINT agency_load_plan_loads_plan_key UNIQUE (id, plan_id),
  CONSTRAINT agency_load_plan_loads_tenant_key UNIQUE (id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.agency_load_plan_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id UUID NOT NULL,
  plan_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  order_line_id UUID NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0 AND quantity < 1e9 AND quantity <> 'NaN'::numeric),
  CONSTRAINT agency_load_plan_lines_load_fk
    FOREIGN KEY (load_id, plan_id) REFERENCES public.agency_load_plan_loads (id, plan_id) ON DELETE CASCADE,
  CONSTRAINT agency_load_plan_lines_load_tenant_fk
    FOREIGN KEY (load_id, agency_id) REFERENCES public.agency_load_plan_loads (id, agency_id) ON DELETE CASCADE,
  CONSTRAINT agency_load_plan_lines_plan_fk
    FOREIGN KEY (plan_id, agency_id) REFERENCES public.agency_load_plans (id, agency_id) ON DELETE CASCADE,
  CONSTRAINT agency_load_plan_lines_order_line_fk
    FOREIGN KEY (order_line_id, agency_id) REFERENCES public.agency_order_lines (id, agency_id),
  CONSTRAINT agency_load_plan_lines_line_key UNIQUE (plan_id, order_line_id)
);

CREATE TABLE IF NOT EXISTS public.agency_load_plan_unmet (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  plan_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  order_line_id UUID NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('too_heavy', 'no_truck')),
  CONSTRAINT agency_load_plan_unmet_plan_fk
    FOREIGN KEY (plan_id, agency_id) REFERENCES public.agency_load_plans (id, agency_id) ON DELETE CASCADE,
  CONSTRAINT agency_load_plan_unmet_order_line_fk
    FOREIGN KEY (order_line_id, agency_id) REFERENCES public.agency_order_lines (id, agency_id),
  CONSTRAINT agency_load_plan_unmet_line_key UNIQUE (plan_id, order_line_id)
);

CREATE INDEX IF NOT EXISTS agency_load_plans_by_agency ON public.agency_load_plans (agency_id, name, plan_version);
CREATE INDEX IF NOT EXISTS agency_load_plan_loads_by_truck ON public.agency_load_plan_loads (agency_id, truck_id);
CREATE INDEX IF NOT EXISTS agency_load_plan_lines_by_order_line ON public.agency_load_plan_lines (agency_id, order_line_id);
CREATE INDEX IF NOT EXISTS agency_load_plan_lines_by_load ON public.agency_load_plan_lines (load_id);

-- ---------------------------------------------------------------------------
-- RLS and grants: reads for every active staff scope, no direct writes
-- ---------------------------------------------------------------------------
ALTER TABLE public.agency_load_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_load_plan_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_load_plan_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_load_plan_unmet ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_load_plans_select ON public.agency_load_plans;
CREATE POLICY agency_load_plans_select ON public.agency_load_plans
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_load_plan_loads_select ON public.agency_load_plan_loads;
CREATE POLICY agency_load_plan_loads_select ON public.agency_load_plan_loads
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_load_plan_lines_select ON public.agency_load_plan_lines;
CREATE POLICY agency_load_plan_lines_select ON public.agency_load_plan_lines
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_load_plan_unmet_select ON public.agency_load_plan_unmet;
CREATE POLICY agency_load_plan_unmet_select ON public.agency_load_plan_unmet
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

REVOKE ALL ON public.agency_load_plans, public.agency_load_plan_loads,
  public.agency_load_plan_lines, public.agency_load_plan_unmet FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_load_plans, public.agency_load_plan_loads,
  public.agency_load_plan_lines, public.agency_load_plan_unmet TO authenticated;
GRANT ALL ON public.agency_load_plans, public.agency_load_plan_loads,
  public.agency_load_plan_lines, public.agency_load_plan_unmet TO service_role;
REVOKE TRUNCATE ON public.agency_load_plans, public.agency_load_plan_loads,
  public.agency_load_plan_lines, public.agency_load_plan_unmet FROM service_role;

-- ---------------------------------------------------------------------------
-- Immutability guards (bind every role, service_role and superuser included)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_load_plans_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Nested (FK action) work runs at depth > 1. Only two things may pass here: the agency-delete cascade
  -- and the FK SET NULL actions on batch_id / approved_by / created_by. Every other nested statement
  -- falls through to the same checks as a top-level one, so a nested UPDATE cannot skip the guards.
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      -- Only the agency-delete cascade may remove a plan: the parent agency row must already be gone.
      IF EXISTS (SELECT 1 FROM public.transport_agencies a WHERE a.id = OLD.agency_id) THEN
        RAISE EXCEPTION 'agency_load_plans rows are never deleted; cancel the plan instead.'
          USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      RETURN OLD;
    END IF;
    IF TG_OP = 'UPDATE'
       AND (NEW.batch_id IS NULL OR NEW.batch_id IS NOT DISTINCT FROM OLD.batch_id)
       AND (NEW.approved_by IS NULL OR NEW.approved_by IS NOT DISTINCT FROM OLD.approved_by)
       AND (NEW.created_by IS NULL OR NEW.created_by IS NOT DISTINCT FROM OLD.created_by)
       AND (to_jsonb(NEW) - 'batch_id' - 'approved_by' - 'created_by')
           = (to_jsonb(OLD) - 'batch_id' - 'approved_by' - 'created_by') THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agency_load_plans rows are never deleted; cancel the plan instead.'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.agency_id IS DISTINCT FROM OLD.agency_id
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.plan_version IS DISTINCT FROM OLD.plan_version
       OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
       OR NEW.payload_hash IS DISTINCT FROM OLD.payload_hash
       OR NEW.batch_id IS DISTINCT FROM OLD.batch_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Load plan identity columns are immutable.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF OLD.approved_at IS NOT NULL AND (NEW.approved_at IS DISTINCT FROM OLD.approved_at
                                        OR NEW.approved_by IS DISTINCT FROM OLD.approved_by) THEN
      RAISE EXCEPTION 'Load plan approval is immutable.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.version < OLD.version THEN
      RAISE EXCEPTION 'Load plan version cannot decrease.' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    IF NEW.status = OLD.status THEN
      IF OLD.status <> 'draft' THEN
        RAISE EXCEPTION 'A load plan that left draft is frozen.' USING ERRCODE = 'integrity_constraint_violation';
      END IF;
    ELSIF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('approved', 'cancelled'))
      OR (OLD.status = 'approved' AND NEW.status IN ('cancelled', 'superseded'))
    ) THEN
      RAISE EXCEPTION 'Illegal load plan status transition % -> %.', OLD.status, NEW.status
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agency_load_plans_guard ON public.agency_load_plans;
CREATE TRIGGER agency_load_plans_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_load_plans
  FOR EACH ROW EXECUTE FUNCTION public.agency_load_plans_guard();

-- Loads, lines and unmet rows are frozen once the plan leaves draft.
CREATE OR REPLACE FUNCTION public.agency_load_plan_children_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_plan uuid;
  v_status text;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    IF TG_OP = 'DELETE' THEN
      -- Only a cascade from a deleted plan or agency may remove child rows.
      IF EXISTS (SELECT 1 FROM public.agency_load_plans p WHERE p.id = OLD.plan_id)
         AND EXISTS (SELECT 1 FROM public.transport_agencies a WHERE a.id = OLD.agency_id) THEN
        RAISE EXCEPTION 'Load plan rows cannot be deleted by a nested trigger.' USING ERRCODE = 'integrity_constraint_violation';
      END IF;
      RETURN OLD;
    END IF;
    -- Nested INSERT/UPDATE are not exempt: they fall through to the freeze checks below.
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_plan := OLD.plan_id;
  ELSE
    v_plan := NEW.plan_id;
  END IF;

  IF TG_OP = 'UPDATE' AND (NEW.plan_id IS DISTINCT FROM OLD.plan_id OR NEW.agency_id IS DISTINCT FROM OLD.agency_id) THEN
    RAISE EXCEPTION 'Load plan rows cannot move between plans.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT p.status INTO v_status FROM public.agency_load_plans p WHERE p.id = v_plan;
  IF v_status IS NOT NULL AND v_status <> 'draft' THEN
    RAISE EXCEPTION 'Load plan % is frozen once it leaves draft.', v_status USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agency_load_plan_loads_guard ON public.agency_load_plan_loads;
CREATE TRIGGER agency_load_plan_loads_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_load_plan_loads
  FOR EACH ROW EXECUTE FUNCTION public.agency_load_plan_children_guard();

DROP TRIGGER IF EXISTS agency_load_plan_lines_guard ON public.agency_load_plan_lines;
CREATE TRIGGER agency_load_plan_lines_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_load_plan_lines
  FOR EACH ROW EXECUTE FUNCTION public.agency_load_plan_children_guard();

DROP TRIGGER IF EXISTS agency_load_plan_unmet_guard ON public.agency_load_plan_unmet;
CREATE TRIGGER agency_load_plan_unmet_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.agency_load_plan_unmet
  FOR EACH ROW EXECUTE FUNCTION public.agency_load_plan_children_guard();

REVOKE ALL ON FUNCTION public.agency_load_plans_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_load_plan_children_guard() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------
-- Weight in kg of a quantity of an order line; NULL when it cannot be determined.
CREATE OR REPLACE FUNCTION public.agency_load_plan_weight(p_quantity numeric, p_unit text, p_weight_per_unit numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_quantity * CASE
    WHEN p_weight_per_unit IS NOT NULL AND p_weight_per_unit > 0 THEN p_weight_per_unit
    WHEN p_unit = 'kg' THEN 1
    WHEN p_unit = 'tonne' THEN 1000
    ELSE NULL
  END
$$;

-- Flattens an already structurally validated p_loads payload into one row per allocated line.
CREATE OR REPLACE FUNCTION public.agency_load_plan_flatten(p_loads jsonb)
RETURNS TABLE (load_idx integer, line_idx integer, truck_id uuid, order_line_id uuid, quantity numeric)
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT (l.i - 1)::integer, (n.j - 1)::integer,
         (l.e ->> 'truck_id')::uuid, (n.e ->> 'order_line_id')::uuid, (n.e ->> 'quantity')::numeric
  FROM jsonb_array_elements(p_loads) WITH ORDINALITY AS l(e, i)
  CROSS JOIN LATERAL jsonb_array_elements(l.e -> 'lines') WITH ORDINALITY AS n(e, j)
$$;

REVOKE ALL ON FUNCTION public.agency_load_plan_weight(numeric, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_load_plan_flatten(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agency_load_plan_weight(numeric, text, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.agency_load_plan_flatten(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- agency_order_cancel: unchanged from 20261018000000_agency_orders.sql except that it serialises with
-- plan approval and refuses to cancel an order that is allocated in an APPROVED load plan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_order_cancel(p_order_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_order public.agency_orders%ROWTYPE;
  v_updated public.agency_orders%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_approve:' || v_agency_id::text, 0));

  SELECT * INTO v_order
  FROM public.agency_orders
  WHERE id = p_order_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or access denied.';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unchanged', 'version', v_order.version);
  END IF;

  IF v_order.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_order.version);
  END IF;

  IF v_order.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_draft');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agency_order_lines ol
    JOIN public.agency_load_plan_lines li ON li.order_line_id = ol.id AND li.agency_id = ol.agency_id
    JOIN public.agency_load_plans p ON p.id = li.plan_id AND p.agency_id = li.agency_id
    WHERE ol.order_id = p_order_id AND ol.agency_id = v_agency_id AND p.status = 'approved'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_in_approved_plan');
  END IF;

  UPDATE public.agency_orders
  SET status = 'cancelled', version = version + 1, updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'cancelled', 'version', v_updated.version);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_order_cancel(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_order_cancel(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_load_plan_save
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_load_plan_save(
  p_name text,
  p_batch_id uuid,
  p_loads jsonb,
  p_unmet jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_loads CONSTANT integer := 200;
  c_max_lines CONSTANT integer := 5000;
  c_uuid CONSTANT text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
  c_qty CONSTANT text := '^[0-9]{1,9}(\.[0-9]{1,6})?$';
  v_agency_id uuid;
  v_key text;
  v_name text;
  v_unmet jsonb;
  v_hash text;
  v_existing public.agency_load_plans%ROWTYPE;
  v_n_loads integer;
  v_n_lines integer := 0;
  v_n_unmet integer;
  v_loads jsonb;
  v_load jsonb;
  v_line jsonb;
  v_i integer;
  v_j integer;
  v_structural jsonb := '[]'::jsonb;
  v_found jsonb;
  v_problems jsonb := '[]'::jsonb;
  v_code text;
  v_error text;
  v_plan_version integer;
  v_plan_id uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  -- Auth failures above RAISE (untyped, by design); anything unexpected below is a typed refusal.
  BEGIN
  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;
  IF char_length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'key_too_long');
  END IF;

  v_name := btrim(coalesce(p_name, ''));
  IF char_length(v_name) < 1 OR char_length(v_name) > 80 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  v_unmet := coalesce(p_unmet, '[]'::jsonb);
  IF p_loads IS NULL OR jsonb_typeof(p_loads) <> 'array' OR jsonb_typeof(v_unmet) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  -- Size bounds, checked before any per-element work.
  v_n_loads := jsonb_array_length(p_loads);
  v_n_unmet := jsonb_array_length(v_unmet);
  IF v_n_loads > c_max_loads OR v_n_unmet > c_max_lines THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_large');
  END IF;
  FOR v_i IN 0 .. v_n_loads - 1 LOOP
    v_load := p_loads -> v_i;
    IF jsonb_typeof(v_load) = 'object' AND jsonb_typeof(v_load -> 'lines') = 'array' THEN
      v_n_lines := v_n_lines + jsonb_array_length(v_load -> 'lines');
      IF v_n_lines > c_max_lines THEN
        RETURN jsonb_build_object('ok', false, 'error', 'too_large');
      END IF;
    END IF;
  END LOOP;

  -- Serialise on the idempotency key BEFORE the replay lookup, then on the plan lineage.
  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_key:' || v_agency_id::text || ':' || v_key, 0));

  v_hash := md5(jsonb_build_array(v_name, p_batch_id, p_loads, v_unmet)::text);

  SELECT * INTO v_existing
  FROM public.agency_load_plans
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.payload_hash IS NOT NULL AND v_existing.payload_hash = v_hash THEN
      RETURN jsonb_build_object(
        'ok', true, 'plan_id', v_existing.id, 'plan_version', v_existing.plan_version,
        'status', v_existing.status, 'version', v_existing.version, 'replay', true
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  -- Structural validation (so that the set-based casts below cannot raise).
  FOR v_i IN 0 .. v_n_loads - 1 LOOP
    v_load := p_loads -> v_i;
    IF coalesce(jsonb_typeof(v_load), '') <> 'object'
       OR coalesce(jsonb_typeof(v_load -> 'truck_id'), '') <> 'string'
       OR NOT coalesce((v_load ->> 'truck_id') ~ c_uuid, false)
       OR coalesce(jsonb_typeof(v_load -> 'lines'), '') <> 'array'
       OR coalesce(jsonb_array_length(v_load -> 'lines'), 0) = 0 THEN
      v_structural := v_structural || jsonb_build_object('code', 'invalid_payload', 'index', v_i, 'message', 'Load needs a truck_id and at least one line.');
      CONTINUE;
    END IF;
    FOR v_j IN 0 .. jsonb_array_length(v_load -> 'lines') - 1 LOOP
      v_line := (v_load -> 'lines') -> v_j;
      IF coalesce(jsonb_typeof(v_line), '') <> 'object'
         OR coalesce(jsonb_typeof(v_line -> 'order_line_id'), '') <> 'string'
         OR NOT coalesce((v_line ->> 'order_line_id') ~ c_uuid, false)
         OR coalesce(jsonb_typeof(v_line -> 'quantity'), '') <> 'number'
         OR NOT coalesce((v_line ->> 'quantity') ~ c_qty, false)
         OR coalesce((v_line ->> 'quantity')::numeric <= 0, true) THEN
        v_structural := v_structural || jsonb_build_object(
          'code', 'invalid_payload', 'index', v_i, 'line_index', v_j,
          'message', 'Line needs an order_line_id and a finite quantity greater than zero.');
      END IF;
    END LOOP;
    IF jsonb_array_length(v_structural) >= 50 THEN
      EXIT;
    END IF;
  END LOOP;

  FOR v_i IN 0 .. v_n_unmet - 1 LOOP
    v_line := v_unmet -> v_i;
    IF coalesce(jsonb_typeof(v_line), '') <> 'object'
       OR coalesce(jsonb_typeof(v_line -> 'order_line_id'), '') <> 'string'
       OR NOT coalesce((v_line ->> 'order_line_id') ~ c_uuid, false)
       OR coalesce(v_line ->> 'reason', '') NOT IN ('too_heavy', 'no_truck') THEN
      v_structural := v_structural || jsonb_build_object('code', 'invalid_unmet', 'index', v_i, 'message', 'Unmet entry needs an order_line_id and a reason of too_heavy or no_truck.');
      IF jsonb_array_length(v_structural) >= 50 THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_structural) > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_structural @> '[{"code":"invalid_payload"}]'::jsonb THEN 'invalid_payload' ELSE 'invalid_unmet' END,
      'problems', v_structural
    );
  END IF;

  -- Duplicate unmet lines.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_unmet) e GROUP BY e ->> 'order_line_id' HAVING count(*) > 1
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_unmet',
      'problems', jsonb_build_array(jsonb_build_object('code', 'invalid_unmet', 'message', 'An order line appears twice in unmet.')));
  END IF;

  IF p_batch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.agency_order_batches b WHERE b.id = p_batch_id AND b.agency_id = v_agency_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'batch_not_found');
  END IF;

  -- Semantic validation, one problem class at a time, in a fixed priority order.
  FOREACH v_code IN ARRAY ARRAY[
    'truck_used_twice', 'truck_not_found', 'order_line_not_found', 'order_cancelled',
    'line_allocated_twice', 'line_allocated_and_unmet', 'over_allocated', 'weight_missing', 'over_capacity'
  ]::text[] LOOP
    v_found := '[]'::jsonb;

    IF v_code = 'truck_used_twice' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.li) ORDER BY q.li), '[]'::jsonb) INTO v_found
      FROM (
        SELECT x.load_idx AS li
        FROM (SELECT DISTINCT f.load_idx, f.truck_id FROM public.agency_load_plan_flatten(p_loads) f) x
        WHERE x.load_idx > (SELECT min(y.load_idx)
                            FROM (SELECT DISTINCT f.load_idx, f.truck_id FROM public.agency_load_plan_flatten(p_loads) f) y
                            WHERE y.truck_id = x.truck_id)
        LIMIT 50
      ) q;

    ELSIF v_code = 'truck_not_found' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.load_idx) ORDER BY q.load_idx), '[]'::jsonb) INTO v_found
      FROM (
        SELECT DISTINCT f.load_idx
        FROM public.agency_load_plan_flatten(p_loads) f
        WHERE NOT EXISTS (
          SELECT 1 FROM public.agency_trucks t
          WHERE t.id = f.truck_id AND t.agency_id = v_agency_id AND NOT t.maintenance_blocked
        )
        ORDER BY f.load_idx LIMIT 50
      ) q;

    ELSIF v_code = 'order_line_not_found' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.line_idx, 'load_index', q.load_idx)), '[]'::jsonb) INTO v_found
      FROM (
        SELECT f.load_idx, f.line_idx
        FROM public.agency_load_plan_flatten(p_loads) f
        WHERE NOT EXISTS (SELECT 1 FROM public.agency_order_lines ol WHERE ol.id = f.order_line_id AND ol.agency_id = v_agency_id)
        ORDER BY f.load_idx, f.line_idx LIMIT 50
      ) q;
      IF jsonb_array_length(v_found) = 0 THEN
        SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'unmet_index', q.ord - 1)), '[]'::jsonb) INTO v_found
        FROM (
          SELECT u.ord
          FROM jsonb_array_elements(v_unmet) WITH ORDINALITY AS u(e, ord)
          WHERE NOT EXISTS (
            SELECT 1 FROM public.agency_order_lines ol
            WHERE ol.id = (u.e ->> 'order_line_id')::uuid AND ol.agency_id = v_agency_id
          )
          ORDER BY u.ord LIMIT 50
        ) q;
      END IF;

    ELSIF v_code = 'order_cancelled' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.line_idx, 'load_index', q.load_idx, 'order_line_id', q.order_line_id)), '[]'::jsonb) INTO v_found
      FROM (
        SELECT f.load_idx, f.line_idx, f.order_line_id
        FROM public.agency_load_plan_flatten(p_loads) f
        JOIN public.agency_order_lines ol ON ol.id = f.order_line_id AND ol.agency_id = v_agency_id
        JOIN public.agency_orders o ON o.id = ol.order_id AND o.agency_id = v_agency_id
        WHERE o.status = 'cancelled'
        ORDER BY f.load_idx, f.line_idx LIMIT 50
      ) q;

    ELSIF v_code = 'line_allocated_twice' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.line_idx, 'load_index', q.load_idx, 'order_line_id', q.order_line_id)), '[]'::jsonb) INTO v_found
      FROM (
        SELECT f.load_idx, f.line_idx, f.order_line_id
        FROM (
          SELECT g.*, row_number() OVER (PARTITION BY g.order_line_id ORDER BY g.load_idx, g.line_idx) AS rn
          FROM public.agency_load_plan_flatten(p_loads) g
        ) f
        WHERE f.rn > 1
        ORDER BY f.load_idx, f.line_idx LIMIT 50
      ) q;

    ELSIF v_code = 'line_allocated_and_unmet' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.line_idx, 'load_index', q.load_idx, 'order_line_id', q.order_line_id)), '[]'::jsonb) INTO v_found
      FROM (
        SELECT f.load_idx, f.line_idx, f.order_line_id
        FROM public.agency_load_plan_flatten(p_loads) f
        WHERE EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_unmet) u WHERE (u ->> 'order_line_id')::uuid = f.order_line_id
        )
        ORDER BY f.load_idx, f.line_idx LIMIT 50
      ) q;

    ELSIF v_code = 'over_allocated' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.line_idx, 'load_index', q.load_idx, 'order_line_id', q.order_line_id)), '[]'::jsonb) INTO v_found
      FROM (
        SELECT f.load_idx, f.line_idx, f.order_line_id
        FROM public.agency_load_plan_flatten(p_loads) f
        JOIN public.agency_order_lines ol ON ol.id = f.order_line_id AND ol.agency_id = v_agency_id
        WHERE f.quantity > ol.quantity
        ORDER BY f.load_idx, f.line_idx LIMIT 50
      ) q;

    ELSIF v_code = 'weight_missing' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.line_idx, 'load_index', q.load_idx, 'order_line_id', q.order_line_id)), '[]'::jsonb) INTO v_found
      FROM (
        SELECT f.load_idx, f.line_idx, f.order_line_id
        FROM public.agency_load_plan_flatten(p_loads) f
        JOIN public.agency_order_lines ol ON ol.id = f.order_line_id AND ol.agency_id = v_agency_id
        WHERE public.agency_load_plan_weight(f.quantity, ol.unit, ol.weight_per_unit_kg) IS NULL
        ORDER BY f.load_idx, f.line_idx LIMIT 50
      ) q;

    ELSIF v_code = 'over_capacity' THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('code', v_code, 'index', q.load_idx, 'total_kg', q.total, 'payload_kg', q.cap) ORDER BY q.load_idx), '[]'::jsonb) INTO v_found
      FROM (
        SELECT f.load_idx,
               sum(public.agency_load_plan_weight(f.quantity, ol.unit, ol.weight_per_unit_kg)) AS total,
               coalesce(max(t.payload_kg), 0) AS cap
        FROM public.agency_load_plan_flatten(p_loads) f
        JOIN public.agency_order_lines ol ON ol.id = f.order_line_id AND ol.agency_id = v_agency_id
        JOIN public.agency_trucks t ON t.id = f.truck_id AND t.agency_id = v_agency_id
        GROUP BY f.load_idx
        HAVING sum(public.agency_load_plan_weight(f.quantity, ol.unit, ol.weight_per_unit_kg)) > coalesce(max(t.payload_kg), 0)
        ORDER BY f.load_idx LIMIT 50
      ) q;
    END IF;

    IF jsonb_array_length(v_found) > 0 THEN
      IF v_error IS NULL THEN
        v_error := v_code;
      END IF;
      v_problems := v_problems || v_found;
    END IF;
  END LOOP;

  IF v_error IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', v_error, 'problems', v_problems);
  END IF;

  -- Plan lineage: next plan_version of (agency, name), serialised per name.
  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_name:' || v_agency_id::text || ':' || v_name, 0));

  SELECT coalesce(max(p.plan_version), 0) + 1 INTO v_plan_version
  FROM public.agency_load_plans p
  WHERE p.agency_id = v_agency_id AND p.name = v_name;

  BEGIN
    INSERT INTO public.agency_load_plans (
      agency_id, batch_id, name, status, plan_version, version, idempotency_key, payload_hash, created_by
    )
    VALUES (v_agency_id, p_batch_id, v_name, 'draft', v_plan_version, 1, v_key, v_hash, auth.uid())
    RETURNING id INTO v_plan_id;

    WITH per_load AS (
      SELECT f.load_idx, f.truck_id,
             sum(public.agency_load_plan_weight(f.quantity, ol.unit, ol.weight_per_unit_kg)) AS total,
             max(t.payload_kg) AS cap,
             gen_random_uuid() AS load_id
      FROM public.agency_load_plan_flatten(p_loads) f
      JOIN public.agency_order_lines ol ON ol.id = f.order_line_id AND ol.agency_id = v_agency_id
      JOIN public.agency_trucks t ON t.id = f.truck_id AND t.agency_id = v_agency_id
      GROUP BY f.load_idx, f.truck_id
    ),
    ins_loads AS (
      INSERT INTO public.agency_load_plan_loads (id, plan_id, agency_id, truck_id, total_kg, utilization_pct)
      SELECT pl.load_id, v_plan_id, v_agency_id, pl.truck_id, round(pl.total, 2),
             CASE WHEN pl.cap IS NOT NULL AND pl.cap > 0 THEN round(pl.total / pl.cap * 100, 2) ELSE 0 END
      FROM per_load pl
      RETURNING id
    )
    INSERT INTO public.agency_load_plan_lines (load_id, plan_id, agency_id, order_line_id, quantity)
    SELECT pl.load_id, v_plan_id, v_agency_id, f.order_line_id, f.quantity
    FROM public.agency_load_plan_flatten(p_loads) f
    JOIN per_load pl ON pl.load_idx = f.load_idx;

    INSERT INTO public.agency_load_plan_unmet (plan_id, agency_id, order_line_id, reason)
    SELECT v_plan_id, v_agency_id, (u.e ->> 'order_line_id')::uuid, u.e ->> 'reason'
    FROM jsonb_array_elements(v_unmet) AS u(e);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'concurrent_conflict');
  END;

  RETURN jsonb_build_object(
    'ok', true, 'plan_id', v_plan_id, 'plan_version', v_plan_version,
    'status', 'draft', 'version', 1, 'replay', false
  );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END;
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_load_plan_approve
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_load_plan_approve(p_plan_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_plan public.agency_load_plans%ROWTYPE;
  v_problems jsonb;
  v_ids jsonb;
  v_clash jsonb;
  v_updated public.agency_load_plans%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  -- One approval or cancellation at a time per agency: allocation clashes cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_approve:' || v_agency_id::text, 0));

  SELECT * INTO v_plan
  FROM public.agency_load_plans
  WHERE id = p_plan_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_plan.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'status', v_plan.status);
  END IF;

  IF p_expected_version IS NULL OR v_plan.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_plan.version);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agency_load_plan_loads l WHERE l.plan_id = v_plan.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_plan');
  END IF;

  -- Share-lock the order and truck rows so a concurrent cancel or maintenance block waits for this
  -- approval (and then sees the approved plan) instead of slipping in after the staleness check.
  PERFORM 1
  FROM public.agency_orders o
  WHERE o.agency_id = v_agency_id
    AND o.id IN (
      SELECT ol.order_id
      FROM public.agency_load_plan_lines li
      JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
      WHERE li.plan_id = v_plan.id)
  ORDER BY o.id
  FOR SHARE;

  PERFORM 1
  FROM public.agency_trucks t
  WHERE t.agency_id = v_agency_id
    AND t.id IN (SELECT l.truck_id FROM public.agency_load_plan_loads l WHERE l.plan_id = v_plan.id)
  ORDER BY t.id
  FOR SHARE;

  -- Re-validate against today's orders and trucks.
  SELECT coalesce(jsonb_agg(DISTINCT q.order_line_id), '[]'::jsonb) INTO v_ids
  FROM (
    SELECT li.order_line_id
    FROM public.agency_load_plan_lines li
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    JOIN public.agency_orders o ON o.id = ol.order_id AND o.agency_id = ol.agency_id
    WHERE li.plan_id = v_plan.id AND o.status = 'cancelled'
  ) q;

  SELECT coalesce(jsonb_agg(p), '[]'::jsonb) INTO v_problems
  FROM (
    SELECT jsonb_build_object('code', 'order_cancelled', 'order_line_id', x.order_line_id) AS p
    FROM jsonb_array_elements_text(v_ids) AS x(order_line_id)
    UNION ALL
    SELECT jsonb_build_object('code', 'truck_unavailable', 'truck_id', l.truck_id)
    FROM public.agency_load_plan_loads l
    JOIN public.agency_trucks t ON t.id = l.truck_id AND t.agency_id = l.agency_id
    WHERE l.plan_id = v_plan.id AND t.maintenance_blocked
    UNION ALL
    SELECT jsonb_build_object('code', 'over_allocated', 'order_line_id', li.order_line_id)
    FROM public.agency_load_plan_lines li
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE li.plan_id = v_plan.id AND li.quantity > ol.quantity
    UNION ALL
    SELECT jsonb_build_object('code', 'weight_missing', 'order_line_id', li.order_line_id)
    FROM public.agency_load_plan_lines li
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE li.plan_id = v_plan.id
      AND public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg) IS NULL
    UNION ALL
    SELECT jsonb_build_object('code', 'over_capacity', 'truck_id', l.truck_id,
                              'total_kg', sum(public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg)),
                              'payload_kg', coalesce(max(t.payload_kg), 0))
    FROM public.agency_load_plan_loads l
    JOIN public.agency_trucks t ON t.id = l.truck_id AND t.agency_id = l.agency_id
    JOIN public.agency_load_plan_lines li ON li.load_id = l.id
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE l.plan_id = v_plan.id
    GROUP BY l.id, l.truck_id
    HAVING sum(public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg)) > coalesce(max(t.payload_kg), 0)
  ) s;

  IF jsonb_array_length(v_problems) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_plan', 'order_line_ids', v_ids, 'problems', v_problems);
  END IF;

  -- A line may sit in only one APPROVED plan per name lineage (a newer version supersedes its own name).
  SELECT coalesce(jsonb_agg(DISTINCT li.order_line_id), '[]'::jsonb) INTO v_clash
  FROM public.agency_load_plan_lines li
  JOIN public.agency_load_plan_lines other ON other.order_line_id = li.order_line_id
                                          AND other.agency_id = li.agency_id
                                          AND other.plan_id <> li.plan_id
  JOIN public.agency_load_plans op ON op.id = other.plan_id AND op.agency_id = other.agency_id
  WHERE li.plan_id = v_plan.id AND op.status = 'approved' AND op.name <> v_plan.name;

  IF jsonb_array_length(v_clash) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'line_already_planned', 'order_line_ids', v_clash);
  END IF;

  -- Refresh the stored totals from the weights as they are now (the plan is still a draft).
  UPDATE public.agency_load_plan_loads l
  SET total_kg = round(s.total, 2),
      utilization_pct = CASE WHEN s.cap IS NOT NULL AND s.cap > 0 THEN round(s.total / s.cap * 100, 2) ELSE 0 END
  FROM (
    SELECT l2.id,
           sum(public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg)) AS total,
           max(t.payload_kg) AS cap
    FROM public.agency_load_plan_loads l2
    JOIN public.agency_trucks t ON t.id = l2.truck_id AND t.agency_id = l2.agency_id
    JOIN public.agency_load_plan_lines li ON li.load_id = l2.id
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE l2.plan_id = v_plan.id
    GROUP BY l2.id
  ) s
  WHERE l.id = s.id;

  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_name:' || v_agency_id::text || ':' || v_plan.name, 0));

  UPDATE public.agency_load_plans
  SET status = 'superseded', version = version + 1
  WHERE agency_id = v_agency_id AND name = v_plan.name AND status = 'approved' AND id <> v_plan.id;

  UPDATE public.agency_load_plans
  SET status = 'approved', version = version + 1, approved_by = auth.uid(), approved_at = now()
  WHERE id = v_plan.id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'approved', 'version', v_updated.version);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'concurrent_conflict');
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_load_plan_cancel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_load_plan_cancel(p_plan_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_plan public.agency_load_plans%ROWTYPE;
  v_updated public.agency_load_plans%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_approve:' || v_agency_id::text, 0));

  SELECT * INTO v_plan
  FROM public.agency_load_plans
  WHERE id = p_plan_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_plan.status NOT IN ('draft', 'approved') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'status', v_plan.status);
  END IF;

  IF p_expected_version IS NULL OR v_plan.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_plan.version);
  END IF;

  IF v_plan.status = 'approved' AND EXISTS (
    SELECT 1
    FROM public.agency_load_plan_lines li
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    JOIN public.agency_consignments c ON c.order_id = ol.order_id AND c.agency_id = ol.agency_id
    WHERE li.plan_id = v_plan.id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_consignments');
  END IF;

  UPDATE public.agency_load_plans
  SET status = 'cancelled', version = version + 1
  WHERE id = v_plan.id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'cancelled', 'version', v_updated.version);
END;
$$;

-- ---------------------------------------------------------------------------
-- agency_vehicle_update: unchanged from 20261012000000_staff_scope_enforcement.sql except that moving a
-- truck into maintenance is refused with 'truck_in_approved_plan' while it sits in an APPROVED load plan.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_vehicle_update(
  p_vehicle_id uuid,
  p_expected_version integer,
  p_patch jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_owned boolean;
  v_updated public.agency_trucks%ROWTYPE;
  v_current_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['fleet_manager']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.agency_trucks
    WHERE id = p_vehicle_id AND agency_id = v_agency_id
  ) INTO v_owned;
  IF NOT v_owned THEN
    RAISE EXCEPTION 'Vehicle not found or access denied.';
  END IF;

  -- Added by the load plan migration: a truck allocated in an APPROVED load plan cannot be moved into
  -- maintenance until that plan is cancelled. Serialised with plan approval and order cancel.
  IF p_patch ? 'maintenance_blocked' AND COALESCE((p_patch->>'maintenance_blocked')::boolean, false) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_approve:' || v_agency_id::text, 0));
    IF EXISTS (
      SELECT 1
      FROM public.agency_load_plan_loads l
      JOIN public.agency_load_plans p ON p.id = l.plan_id AND p.agency_id = l.agency_id
      WHERE l.truck_id = p_vehicle_id AND l.agency_id = v_agency_id AND p.status = 'approved'
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'truck_in_approved_plan');
    END IF;
  END IF;

  -- The version trigger bumps exactly once; the WHERE clause is the atomic
  -- expected-version check. A zero-row update IS the conflict (no write).
  UPDATE public.agency_trucks t SET
    is_available = CASE WHEN p_patch ? 'is_available' THEN COALESCE((p_patch->>'is_available')::boolean, t.is_available) ELSE t.is_available END,
    notes = CASE WHEN p_patch ? 'notes' THEN p_patch->>'notes' ELSE t.notes END,
    insurance_expiry = CASE WHEN p_patch ? 'insurance_expiry' THEN (p_patch->>'insurance_expiry')::date ELSE t.insurance_expiry END,
    fitness_expiry = CASE WHEN p_patch ? 'fitness_expiry' THEN (p_patch->>'fitness_expiry')::date ELSE t.fitness_expiry END,
    permit_expiry = CASE WHEN p_patch ? 'permit_expiry' THEN (p_patch->>'permit_expiry')::date ELSE t.permit_expiry END,
    puc_expiry = CASE WHEN p_patch ? 'puc_expiry' THEN (p_patch->>'puc_expiry')::date ELSE t.puc_expiry END,
    payload_kg = CASE WHEN p_patch ? 'payload_kg' THEN (p_patch->>'payload_kg')::numeric ELSE t.payload_kg END,
    body_length_m = CASE WHEN p_patch ? 'body_length_m' THEN (p_patch->>'body_length_m')::numeric ELSE t.body_length_m END,
    body_width_m = CASE WHEN p_patch ? 'body_width_m' THEN (p_patch->>'body_width_m')::numeric ELSE t.body_width_m END,
    body_height_m = CASE WHEN p_patch ? 'body_height_m' THEN (p_patch->>'body_height_m')::numeric ELSE t.body_height_m END,
    maintenance_blocked = CASE WHEN p_patch ? 'maintenance_blocked' THEN COALESCE((p_patch->>'maintenance_blocked')::boolean, t.maintenance_blocked) ELSE t.maintenance_blocked END,
    maintenance_block_reason = CASE WHEN p_patch ? 'maintenance_block_reason' THEN p_patch->>'maintenance_block_reason' ELSE t.maintenance_block_reason END,
    maintenance_blocked_until = CASE WHEN p_patch ? 'maintenance_blocked_until' THEN (p_patch->>'maintenance_blocked_until')::timestamptz ELSE t.maintenance_blocked_until END
  WHERE t.id = p_vehicle_id
    AND t.agency_id = v_agency_id
    AND t.version = p_expected_version
  RETURNING * INTO v_updated;

  IF v_updated.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'updated',
      'vehicle', to_jsonb(v_updated),
      'version', v_updated.version
    );
  END IF;

  SELECT version INTO v_current_version
  FROM public.agency_trucks
  WHERE id = p_vehicle_id;

  RETURN jsonb_build_object(
    'ok', false,
    'error', 'version_conflict',
    'current_version', v_current_version
  );
END;
$$;


REVOKE ALL ON FUNCTION public.agency_load_plan_save(text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_load_plan_approve(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_load_plan_cancel(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_load_plan_save(text, uuid, jsonb, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_load_plan_approve(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_load_plan_cancel(uuid, integer) TO authenticated, service_role;
