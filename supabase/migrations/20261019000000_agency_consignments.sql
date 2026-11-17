-- TO-146: consignments (GR/LR note) with a pickup-to-receipt event trail.
--
-- Tables: agency_consignments (one per order), agency_gr_sequences (per agency and financial year,
-- never reused) and agency_consignment_events (append-only trail). Writes happen ONLY through the
-- SECURITY DEFINER commands below, which take no agency id (agency from auth.uid() via
-- resolve_caller_agency_for_scopes). Direct INSERT/UPDATE/DELETE is not granted to any client role.

CREATE TABLE IF NOT EXISTS public.agency_consignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  gr_number TEXT NOT NULL CHECK (btrim(gr_number) <> ''),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'picked_up', 'in_transit', 'delivered', 'receipt_confirmed', 'disputed')),
  qr_token TEXT NOT NULL CHECK (btrim(qr_token) <> ''),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT agency_consignments_order_fk
    FOREIGN KEY (order_id, agency_id)
    REFERENCES public.agency_orders (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_consignments_gr_key UNIQUE (agency_id, gr_number),
  CONSTRAINT agency_consignments_order_key UNIQUE (agency_id, order_id),
  CONSTRAINT agency_consignments_idem_key UNIQUE (agency_id, idempotency_key),
  CONSTRAINT agency_consignments_tenant_key UNIQUE (id, agency_id)
);

CREATE TABLE IF NOT EXISTS public.agency_gr_sequences (
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  fy TEXT NOT NULL CHECK (fy ~ '^[0-9]{4}-[0-9]{2}$'),
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  PRIMARY KEY (agency_id, fy)
);

CREATE TABLE IF NOT EXISTS public.agency_consignment_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  consignment_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE CASCADE,
  event TEXT NOT NULL CHECK (btrim(event) <> ''),
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  note TEXT CHECK (note IS NULL OR char_length(note) <= 500),
  version_after INTEGER,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_consignment_events_consignment_fk
    FOREIGN KEY (consignment_id, agency_id)
    REFERENCES public.agency_consignments (id, agency_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS agency_consignment_events_idem
  ON public.agency_consignment_events (agency_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS agency_consignment_events_by_consignment
  ON public.agency_consignment_events (consignment_id, created_at);

ALTER TABLE public.agency_consignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_gr_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_consignment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_consignments_select ON public.agency_consignments;
CREATE POLICY agency_consignments_select ON public.agency_consignments
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_gr_sequences_select ON public.agency_gr_sequences;
CREATE POLICY agency_gr_sequences_select ON public.agency_gr_sequences
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_consignment_events_select ON public.agency_consignment_events;
CREATE POLICY agency_consignment_events_select ON public.agency_consignment_events
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

REVOKE ALL ON public.agency_consignments, public.agency_gr_sequences, public.agency_consignment_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_gr_sequences, public.agency_consignment_events TO authenticated;
-- qr_token is deliberately NOT readable by clients: it is exposed only by agency_consignment_qr().
GRANT SELECT (id, agency_id, order_id, gr_number, status, version, created_at, updated_at, idempotency_key)
  ON public.agency_consignments TO authenticated;
GRANT ALL ON public.agency_consignments, public.agency_gr_sequences, public.agency_consignment_events TO service_role;

CREATE OR REPLACE FUNCTION public.agency_consignment_create(p_order_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_order public.agency_orders%ROWTYPE;
  v_existing public.agency_consignments%ROWTYPE;
  v_fy text;
  v_start integer;
  v_today date;
  v_seq integer;
  v_gr text;
  v_new public.agency_consignments%ROWTYPE;
BEGIN
  -- Any active scope resolves the agency (raises for revoked, unknown or unapproved callers).
  v_agency_id := public.resolve_caller_agency_for_scopes(
    ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]
  );

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF NOT (v_agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[]))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;
  IF char_length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'key_too_long');
  END IF;

  -- Serialise GR numbering and creation per agency.
  PERFORM pg_advisory_xact_lock(hashtextextended('agency_consignment:' || v_agency_id::text, 0));

  SELECT * INTO v_order
  FROM public.agency_orders
  WHERE id = p_order_id AND agency_id = v_agency_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_not_found');
  END IF;

  -- Replay of the same request, answered before any state rule.
  SELECT * INTO v_existing
  FROM public.agency_consignments
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.order_id = p_order_id THEN
      RETURN jsonb_build_object(
        'ok', true, 'replay', true,
        'consignment_id', v_existing.id, 'gr_number', v_existing.gr_number,
        'status', v_existing.status, 'version', v_existing.version
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_cancelled');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_consignments
    WHERE agency_id = v_agency_id AND order_id = p_order_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'consignment_exists');
  END IF;

  -- Financial year runs April to March: 'YYYY-YY'.
  -- Evaluated in India time, not UTC, so the year flips at local midnight on 1 April.
  v_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start := CASE WHEN extract(month FROM v_today)::int >= 4
                  THEN extract(year FROM v_today)::int
                  ELSE extract(year FROM v_today)::int - 1 END;
  v_fy := v_start::text || '-' || lpad(((v_start + 1) % 100)::text, 2, '0');

  INSERT INTO public.agency_gr_sequences AS s (agency_id, fy, last_seq)
  VALUES (v_agency_id, v_fy, 1)
  ON CONFLICT (agency_id, fy) DO UPDATE SET last_seq = s.last_seq + 1
  RETURNING s.last_seq INTO v_seq;

  v_gr := 'AGY/' || v_fy || '/' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.agency_consignments (agency_id, order_id, gr_number, status, qr_token, version, idempotency_key)
  VALUES (
    v_agency_id, p_order_id, v_gr, 'created',
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    1, v_key
  )
  RETURNING * INTO v_new;

  INSERT INTO public.agency_consignment_events (consignment_id, agency_id, event, from_status, to_status, actor, version_after)
  VALUES (v_new.id, v_agency_id, 'created', NULL, 'created', auth.uid(), 1);

  RETURN jsonb_build_object(
    'ok', true, 'consignment_id', v_new.id, 'gr_number', v_new.gr_number,
    'status', v_new.status, 'version', v_new.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_consignment_event(
  p_consignment_id uuid,
  p_event text,
  p_expected_version integer,
  p_idempotency_key text,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_event text;
  v_c public.agency_consignments%ROWTYPE;
  v_prev public.agency_consignment_events%ROWTYPE;
  v_to text;
  v_from text;
  v_note text;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(
    ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]
  );

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF NOT (v_agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager']::text[]))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;
  IF char_length(v_key) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'key_too_long');
  END IF;

  v_event := btrim(coalesce(p_event, ''));
  v_note := nullif(btrim(p_note), '');

  -- Serialise same-key requests so a concurrent duplicate replays instead of raising 23505.
  PERFORM pg_advisory_xact_lock(hashtext(v_agency_id::text || ':' || v_key));

  SELECT * INTO v_c
  FROM public.agency_consignments
  WHERE id = p_consignment_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Replay of the same request, answered before the state and version rules.
  SELECT * INTO v_prev
  FROM public.agency_consignment_events
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_prev.consignment_id = p_consignment_id AND v_prev.event = v_event THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'status', v_prev.to_status, 'version', v_prev.version_after);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_event NOT IN ('pickup_scanned', 'transit_started', 'delivery_scanned', 'receipt_signed', 'dispute_raised') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_event');
  END IF;

  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'note_too_long');
  END IF;

  IF p_expected_version IS NULL OR v_c.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_c.version);
  END IF;

  v_to := CASE
    WHEN v_event = 'pickup_scanned' AND v_c.status = 'created' THEN 'picked_up'
    WHEN v_event = 'transit_started' AND v_c.status = 'picked_up' THEN 'in_transit'
    WHEN v_event = 'delivery_scanned' AND v_c.status = 'in_transit' THEN 'delivered'
    WHEN v_event = 'receipt_signed' AND v_c.status = 'delivered' THEN 'receipt_confirmed'
    WHEN v_event = 'dispute_raised' AND v_c.status IN ('picked_up', 'in_transit', 'delivered') THEN 'disputed'
    ELSE NULL
  END;

  IF v_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition');
  END IF;

  v_from := v_c.status;

  UPDATE public.agency_consignments
  SET status = v_to, version = version + 1, updated_at = now()
  WHERE id = v_c.id
  RETURNING * INTO v_c;

  INSERT INTO public.agency_consignment_events
    (consignment_id, agency_id, event, from_status, to_status, actor, note, version_after, idempotency_key)
  VALUES
    (v_c.id, v_agency_id, v_event, v_from, v_to, auth.uid(), v_note, v_c.version, v_key);

  RETURN jsonb_build_object('ok', true, 'status', v_c.status, 'version', v_c.version);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_consignment_create(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_consignment_event(uuid, text, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_consignment_create(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_consignment_event(uuid, text, integer, text, text) TO authenticated, service_role;

-- Reads the QR token of one consignment: dispatcher scope (or owner) only. Viewer, finance and
-- fleet_manager read consignments but never the token.
CREATE OR REPLACE FUNCTION public.agency_consignment_qr(p_consignment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_token text;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(
    ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]
  );

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF NOT (v_agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[]))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  SELECT qr_token INTO v_token
  FROM public.agency_consignments
  WHERE id = p_consignment_id AND agency_id = v_agency_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'qr_token', v_token);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_consignment_qr(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_consignment_qr(uuid) TO authenticated, service_role;

-- Append-only trail: UPDATE and DELETE of events are refused for every role (service_role and
-- superuser included). Only FK cascades from a parent delete (trigger depth > 1) pass.
CREATE OR REPLACE FUNCTION public.agency_consignment_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'agency_consignment_events is append-only.' USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS agency_consignment_events_append_only ON public.agency_consignment_events;
CREATE TRIGGER agency_consignment_events_append_only
  BEFORE UPDATE OR DELETE ON public.agency_consignment_events
  FOR EACH ROW EXECUTE FUNCTION public.agency_consignment_events_append_only();

-- Identity columns of a consignment never change after creation, for any role.
CREATE OR REPLACE FUNCTION public.agency_consignments_freeze_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.gr_number IS DISTINCT FROM OLD.gr_number
     OR NEW.qr_token IS DISTINCT FROM OLD.qr_token
     OR NEW.order_id IS DISTINCT FROM OLD.order_id
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'Consignment identity columns are immutable.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agency_consignments_freeze_identity ON public.agency_consignments;
CREATE TRIGGER agency_consignments_freeze_identity
  BEFORE UPDATE ON public.agency_consignments
  FOR EACH ROW EXECUTE FUNCTION public.agency_consignments_freeze_identity();
