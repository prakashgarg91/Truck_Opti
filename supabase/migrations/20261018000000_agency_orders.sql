-- TO-145 slice 1: normalized sales orders and the import command.
--
-- Tables: agency_order_batches (one row per imported file, unique per agreement and file hash),
-- agency_orders (draft orders, unique per agreement and client order reference) and
-- agency_order_lines. Writes happen ONLY through SECURITY DEFINER commands that take no agency id
-- (the agency comes from auth.uid() via resolve_caller_agency_for_scopes, scope 'dispatcher').
-- The database re-validates every line: the client-side parser is a convenience, not the authority.
-- The whole import is atomic: any invalid line, or an order reference that already exists, refuses
-- the call and writes nothing, so an import never silently overwrites an order.

CREATE TABLE IF NOT EXISTS public.agency_order_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL,
  file_hash TEXT NOT NULL CHECK (btrim(file_hash) <> ''),
  row_count INTEGER NOT NULL CHECK (row_count >= 1),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT agency_order_batches_agreement_fk
    FOREIGN KEY (agreement_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_order_batches_file_key UNIQUE (agency_id, agreement_id, file_hash),
  CONSTRAINT agency_order_batches_idem_key UNIQUE (agency_id, idempotency_key),
  CONSTRAINT agency_order_batches_tenant_key UNIQUE (id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.agency_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  agreement_id UUID NOT NULL,
  batch_id UUID,
  client_order_ref TEXT NOT NULL CHECK (btrim(client_order_ref) <> ''),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'planned', 'cancelled')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_orders_agreement_fk
    FOREIGN KEY (agreement_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_orders_batch_fk
    FOREIGN KEY (batch_id, agency_id)
    REFERENCES public.agency_order_batches (id, agency_id) ON DELETE SET NULL (batch_id),
  CONSTRAINT agency_orders_ref_key UNIQUE (agency_id, agreement_id, client_order_ref),
  CONSTRAINT agency_orders_tenant_key UNIQUE (id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.agency_order_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  line_no INTEGER NOT NULL CHECK (line_no >= 1),
  sku TEXT NOT NULL CHECK (btrim(sku) <> ''),
  description TEXT,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit TEXT NOT NULL CHECK (unit IN ('kg', 'tonne', 'piece', 'carton')),
  weight_per_unit_kg NUMERIC CHECK (weight_per_unit_kg IS NULL OR weight_per_unit_kg >= 0),
  length_m NUMERIC CHECK (length_m IS NULL OR length_m > 0),
  width_m NUMERIC CHECK (width_m IS NULL OR width_m > 0),
  height_m NUMERIC CHECK (height_m IS NULL OR height_m > 0),
  pickup_site_id UUID REFERENCES public.agency_client_sites (id) ON DELETE RESTRICT,
  drop_site_id UUID REFERENCES public.agency_client_sites (id) ON DELETE RESTRICT,
  pickup_from TIMESTAMPTZ,
  pickup_to TIMESTAMPTZ,
  delivery_from TIMESTAMPTZ,
  delivery_to TIMESTAMPTZ,
  stackable BOOLEAN NOT NULL DEFAULT TRUE,
  fragile BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT agency_order_lines_order_fk
    FOREIGN KEY (order_id, agency_id)
    REFERENCES public.agency_orders (id, agency_id) ON DELETE CASCADE,
  CONSTRAINT agency_order_lines_line_key UNIQUE (order_id, line_no)
);

CREATE INDEX IF NOT EXISTS agency_order_lines_by_order ON public.agency_order_lines (order_id);
CREATE INDEX IF NOT EXISTS agency_orders_by_agreement ON public.agency_orders (agency_id, agreement_id, status);

ALTER TABLE public.agency_order_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_order_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_order_batches_select ON public.agency_order_batches;
CREATE POLICY agency_order_batches_select ON public.agency_order_batches
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_orders_select ON public.agency_orders;
CREATE POLICY agency_orders_select ON public.agency_orders
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_order_lines_select ON public.agency_order_lines;
CREATE POLICY agency_order_lines_select ON public.agency_order_lines
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

REVOKE ALL ON public.agency_order_batches, public.agency_orders, public.agency_order_lines FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_order_batches, public.agency_orders, public.agency_order_lines TO authenticated;
GRANT ALL ON public.agency_order_batches, public.agency_orders, public.agency_order_lines TO service_role;

CREATE OR REPLACE FUNCTION public.agency_order_import(
  p_agreement_id uuid,
  p_file_hash text,
  p_idempotency_key text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_lines CONSTANT integer := 2000;
  v_agency_id uuid;
  v_key text;
  v_hash text;
  v_agreement public.agency_client_agreements%ROWTYPE;
  v_existing public.agency_order_batches%ROWTYPE;
  v_count integer;
  v_problems jsonb := '[]'::jsonb;
  v_clash text[];
  v_batch uuid;
  v_orders integer := 0;
  v_lines integer := 0;
  i integer;
  l jsonb;
  v_ref text;
  v_unit text;
  v_pickup_site uuid;
  v_drop_site uuid;
  v_ts timestamptz;
  v_pf timestamptz;
  v_dt timestamptz;
  v_order uuid;
  r record;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  v_hash := btrim(coalesce(p_file_hash, ''));
  IF v_hash = '' THEN
    RAISE EXCEPTION 'File hash is required.';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'No order lines to import.';
  END IF;
  v_count := jsonb_array_length(p_lines);
  IF v_count > c_max_lines THEN
    RAISE EXCEPTION 'Too many lines in one import (maximum 2000).';
  END IF;

  SELECT * INTO v_agreement
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client agreement not found or access denied.';
  END IF;

  -- Serialise imports of the same agreement so duplicate detection cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_agency_id::text || ':' || p_agreement_id::text, 0));

  -- Replay of the same request, answered before any state rule.
  SELECT * INTO v_existing
  FROM public.agency_order_batches
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.agreement_id = p_agreement_id AND v_existing.file_hash = v_hash THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'batch_id', v_existing.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_agreement.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_active');
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_order_batches
  WHERE agency_id = v_agency_id AND agreement_id = p_agreement_id AND file_hash = v_hash;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'state', 'duplicate_batch', 'batch_id', v_existing.id);
  END IF;

  -- Validate every line again, collecting all problems.
  FOR i IN 0 .. v_count - 1 LOOP
    l := p_lines -> i;
    v_pickup_site := NULL;
    v_drop_site := NULL;

    IF jsonb_typeof(l) <> 'object' THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Line is not an object.');
      CONTINUE;
    END IF;

    v_unit := lower(btrim(coalesce(l ->> 'unit', '')));
    IF v_unit NOT IN ('kg', 'tonne', 'piece', 'carton') THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Unsupported unit.');
    END IF;

    IF coalesce(l ->> 'quantity', '') !~ '^[0-9]+(\.[0-9]+)?$' OR (l ->> 'quantity')::numeric <= 0 THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Quantity must be greater than zero.');
    END IF;

    IF coalesce(l ->> 'line_no', '') !~ '^[0-9]+$' OR (l ->> 'line_no')::numeric < 1 THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Line number must be at least 1.');
    END IF;

    IF btrim(coalesce(l ->> 'client_order_ref', '')) = '' THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Order reference is missing.');
    END IF;
    IF btrim(coalesce(l ->> 'sku', '')) = '' THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'SKU is missing.');
    END IF;

    SELECT s.id INTO v_pickup_site
    FROM public.agency_client_sites s
    WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
      AND lower(btrim(s.label)) = lower(btrim(coalesce(l ->> 'pickup_site', '')))
    ORDER BY (s.site_kind = 'ship_to'), s.id
    LIMIT 1;
    IF v_pickup_site IS NULL THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Pickup site not found.');
    END IF;

    SELECT s.id INTO v_drop_site
    FROM public.agency_client_sites s
    WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
      AND s.site_kind = 'ship_to'
      AND lower(btrim(s.label)) = lower(btrim(coalesce(l ->> 'drop_site', '')))
    ORDER BY s.id
    LIMIT 1;
    IF v_drop_site IS NULL THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Drop site not found.');
    END IF;

    -- Windows: only the pickup_from / delivery_to pair is compared (the same rule as the parser).
    v_pf := NULL;
    v_dt := NULL;
    BEGIN
      IF nullif(btrim(coalesce(l ->> 'pickup_from', '')), '') IS NOT NULL THEN
        v_pf := (l ->> 'pickup_from')::timestamptz;
      END IF;
      IF nullif(btrim(coalesce(l ->> 'delivery_to', '')), '') IS NOT NULL THEN
        v_dt := (l ->> 'delivery_to')::timestamptz;
      END IF;
      IF nullif(btrim(coalesce(l ->> 'pickup_to', '')), '') IS NOT NULL THEN
        v_ts := (l ->> 'pickup_to')::timestamptz;
      END IF;
      IF nullif(btrim(coalesce(l ->> 'delivery_from', '')), '') IS NOT NULL THEN
        v_ts := (l ->> 'delivery_from')::timestamptz;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'A date is not valid.');
      v_pf := NULL;
      v_dt := NULL;
    END;
    IF v_pf IS NOT NULL AND v_dt IS NOT NULL AND v_dt < v_pf THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Delivery window ends before pickup window.');
    END IF;
  END LOOP;

  -- (ref, line_no) must be unique inside the payload.
  FOR r IN
    SELECT min(ord) AS first_index, ref, ln
    FROM (
      SELECT (ordinality - 1)::integer AS ord,
             btrim(coalesce(e ->> 'client_order_ref', '')) AS ref,
             e ->> 'line_no' AS ln
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, ordinality)
    ) q
    GROUP BY ref, ln
    HAVING count(*) > 1 AND ref <> ''
  LOOP
    v_problems := v_problems || jsonb_build_object('index', r.first_index, 'message', 'Duplicate line in this import.');
  END LOOP;

  IF jsonb_array_length(v_problems) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lines', 'problems', v_problems);
  END IF;

  SELECT array_agg(DISTINCT o.client_order_ref ORDER BY o.client_order_ref)
    INTO v_clash
  FROM public.agency_orders o
  WHERE o.agency_id = v_agency_id
    AND o.agreement_id = p_agreement_id
    AND o.client_order_ref IN (
      SELECT btrim(e ->> 'client_order_ref') FROM jsonb_array_elements(p_lines) e
    );

  IF v_clash IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_exists', 'refs', to_jsonb(v_clash));
  END IF;

  INSERT INTO public.agency_order_batches (agency_id, agreement_id, file_hash, row_count, created_by, idempotency_key)
  VALUES (v_agency_id, p_agreement_id, v_hash, v_count, auth.uid(), v_key)
  RETURNING id INTO v_batch;

  FOR r IN
    SELECT DISTINCT btrim(e ->> 'client_order_ref') AS ref
    FROM jsonb_array_elements(p_lines) e
    ORDER BY 1
  LOOP
    INSERT INTO public.agency_orders (agency_id, agreement_id, batch_id, client_order_ref)
    VALUES (v_agency_id, p_agreement_id, v_batch, r.ref);
    v_orders := v_orders + 1;
  END LOOP;

  FOR i IN 0 .. v_count - 1 LOOP
    l := p_lines -> i;
    v_ref := btrim(l ->> 'client_order_ref');
    SELECT id INTO v_order
    FROM public.agency_orders
    WHERE agency_id = v_agency_id AND agreement_id = p_agreement_id AND client_order_ref = v_ref;

    INSERT INTO public.agency_order_lines (
      agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg,
      length_m, width_m, height_m, pickup_site_id, drop_site_id,
      pickup_from, pickup_to, delivery_from, delivery_to, stackable, fragile
    )
    SELECT
      v_agency_id, v_order, (l ->> 'line_no')::integer, btrim(l ->> 'sku'),
      nullif(btrim(coalesce(l ->> 'description', '')), ''),
      (l ->> 'quantity')::numeric, lower(btrim(l ->> 'unit')),
      nullif(l ->> 'weight_per_unit_kg', '')::numeric,
      nullif(l ->> 'length_m', '')::numeric, nullif(l ->> 'width_m', '')::numeric, nullif(l ->> 'height_m', '')::numeric,
      (SELECT s.id FROM public.agency_client_sites s
        WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
          AND lower(btrim(s.label)) = lower(btrim(l ->> 'pickup_site'))
        ORDER BY (s.site_kind = 'ship_to'), s.id LIMIT 1),
      (SELECT s.id FROM public.agency_client_sites s
        WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
          AND s.site_kind = 'ship_to' AND lower(btrim(s.label)) = lower(btrim(l ->> 'drop_site'))
        ORDER BY s.id LIMIT 1),
      nullif(l ->> 'pickup_from', '')::timestamptz, nullif(l ->> 'pickup_to', '')::timestamptz,
      nullif(l ->> 'delivery_from', '')::timestamptz, nullif(l ->> 'delivery_to', '')::timestamptz,
      coalesce((l ->> 'stackable')::boolean, TRUE), coalesce((l ->> 'fragile')::boolean, FALSE);
    v_lines := v_lines + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'state', 'created', 'batch_id', v_batch, 'orders_created', v_orders, 'lines_created', v_lines);
END;
$$;

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

  UPDATE public.agency_orders
  SET status = 'cancelled', version = version + 1, updated_at = now()
  WHERE id = p_order_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'cancelled', 'version', v_updated.version);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_order_import(uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_order_cancel(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_order_import(uuid, text, text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_order_cancel(uuid, integer) TO authenticated, service_role;
