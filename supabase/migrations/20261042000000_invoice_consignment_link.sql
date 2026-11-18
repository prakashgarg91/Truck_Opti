-- Invoice -> consignment link.
--
-- Nothing linked a freight invoice to the consignment (GR) it bills, so the "Create invoice from consignment"
-- shortcut could invoice the same GR twice. This migration:
--   * adds agency_invoices.consignment_id (nullable) with a composite FK (consignment_id, agency_id) to
--     agency_consignments (id, agency_id), so an invoice can only point at a consignment of its own agency;
--   * adds a PARTIAL UNIQUE index: at most one NON-cancelled invoice per consignment (cancelled invoices free it);
--   * freezes consignment_id after issue (agency_invoice_guard_frozen, copied whole plus one comparison);
--   * extends agency_invoice_issue with ONE optional last argument p_consignment_id uuid DEFAULT NULL, copied whole
--     from its latest definition (20261035000000_subscription_write_guards.sql). A defaulted extra argument would create
--     a second overload (an 8-argument call would then be ambiguous), so the old 8-argument signature is dropped in
--     this migration and the grants are re-asserted. Typed refusals: consignment_not_found,
--     consignment_already_invoiced (with the existing invoice id and number). Replay is still answered first.

ALTER TABLE public.agency_invoices ADD COLUMN IF NOT EXISTS consignment_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.agency_invoices'::regclass AND conname = 'agency_invoices_consignment_fk'
  ) THEN
    ALTER TABLE public.agency_invoices
      ADD CONSTRAINT agency_invoices_consignment_fk
      FOREIGN KEY (consignment_id, agency_id)
      REFERENCES public.agency_consignments (id, agency_id) ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS agency_invoices_consignment_live_uidx
  ON public.agency_invoices (consignment_id)
  WHERE consignment_id IS NOT NULL AND status <> 'cancelled';

-- Immutability guard: unchanged except consignment_id is frozen too.
CREATE OR REPLACE FUNCTION public.agency_invoice_guard_frozen()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'agency_invoices rows cannot be deleted.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW.subtotal_paise IS DISTINCT FROM OLD.subtotal_paise
     OR NEW.cgst_paise IS DISTINCT FROM OLD.cgst_paise
     OR NEW.sgst_paise IS DISTINCT FROM OLD.sgst_paise
     OR NEW.igst_paise IS DISTINCT FROM OLD.igst_paise
     OR NEW.round_off_paise IS DISTINCT FROM OLD.round_off_paise
     OR NEW.total_paise IS DISTINCT FROM OLD.total_paise
     OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
     OR NEW.client_id IS DISTINCT FROM OLD.client_id
     OR NEW.consignment_id IS DISTINCT FROM OLD.consignment_id
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'An issued invoice''s amounts, number, client, consignment and agency cannot be changed.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The 8-argument signature must go: with the defaulted ninth argument both would match an 8-argument call.
DROP FUNCTION IF EXISTS public.agency_invoice_issue(uuid, jsonb, text, text, integer, boolean, boolean, text);

CREATE OR REPLACE FUNCTION public.agency_invoice_issue(
  p_client_id uuid,
  p_lines jsonb,
  p_supplier_state text,
  p_place_of_supply_state text,
  p_gst_rate_pct integer,
  p_reverse_charge boolean,
  p_round_off boolean,
  p_idempotency_key text,
  p_consignment_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_lines CONSTANT integer := 100;
  c_max_qty CONSTANT numeric := 1000000000;
  c_max_rate CONSTANT bigint := 1000000000000;
  c_max_amount CONSTANT numeric := 10000000000000;
  v_agency_id uuid;
  v_key text;
  v_hash text;
  v_existing public.agency_invoices%ROWTYPE;
  v_billed public.agency_invoices%ROWTYPE;
  v_count integer;
  v_problems jsonb := '[]'::jsonb;
  v_supplier text;
  v_place text;
  v_rc boolean;
  v_ro boolean;
  v_descs text[] := ARRAY[]::text[];
  v_qtys numeric[] := ARRAY[]::numeric[];
  v_rates bigint[] := ARRAY[]::bigint[];
  v_amts bigint[] := ARRAY[]::bigint[];
  v_desc text;
  v_qty numeric;
  v_rate bigint;
  v_amt numeric;
  v_bad boolean;
  v_subtotal bigint := 0;
  v_cgst bigint := 0;
  v_sgst bigint := 0;
  v_igst bigint := 0;
  v_pre_total bigint;
  v_total bigint;
  v_round bigint := 0;
  v_fy text;
  v_seq integer;
  v_number text;
  v_invoice uuid;
  v_ist_today date;
  v_start_year integer;
  i integer;
  l jsonb;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'settle', 0);

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  v_supplier := btrim(coalesce(p_supplier_state, ''));
  v_place := btrim(coalesce(p_place_of_supply_state, ''));
  v_rc := coalesce(p_reverse_charge, false);
  v_ro := coalesce(p_round_off, false);

  -- Serialise issuing per agency: the number sequence and the replay check cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('agency_invoice_issue:' || v_agency_id::text, 0));

  -- The consignment joins the request hash only when one is given, so the hash of a consignment-less request
  -- is byte-identical to the pre-link formula and old replays keep matching.
  v_hash := md5((jsonb_build_object(
    'client', p_client_id, 'lines', p_lines, 'supplier', v_supplier, 'place', v_place,
    'rate', p_gst_rate_pct, 'rc', v_rc, 'ro', v_ro
  ) || CASE WHEN p_consignment_id IS NULL THEN '{}'::jsonb
            ELSE jsonb_build_object('consignment', p_consignment_id) END)::text);

  -- Replay of the same request, answered before any other rule.
  SELECT * INTO v_existing
  FROM public.agency_invoices
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.request_hash IS NOT NULL AND v_existing.request_hash = v_hash THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'invoice_id', v_existing.id,
                                'invoice_number', v_existing.invoice_number);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_lines');
  END IF;
  v_count := jsonb_array_length(p_lines);
  IF v_count > c_max_lines THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_lines');
  END IF;

  IF p_gst_rate_pct IS NULL OR p_gst_rate_pct NOT IN (0, 5, 12, 18) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gst_rate');
  END IF;

  IF v_supplier !~ '^(0[1-9]|[12][0-9]|3[0-8])$' OR v_place !~ '^(0[1-9]|[12][0-9]|3[0-8])$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state_code');
  END IF;

  IF p_client_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.agency_client_agreements c WHERE c.id = p_client_id AND c.agency_id = v_agency_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_not_found');
  END IF;

  -- Optional link to the consignment (GR) this invoice bills. A foreign and a random id answer identically.
  IF p_consignment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.agency_consignments g WHERE g.id = p_consignment_id AND g.agency_id = v_agency_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'consignment_not_found');
    END IF;
    SELECT * INTO v_billed
    FROM public.agency_invoices i
    WHERE i.agency_id = v_agency_id AND i.consignment_id = p_consignment_id AND i.status <> 'cancelled'
    ORDER BY i.created_at, i.id
    LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'consignment_already_invoiced',
                                'invoice_id', v_billed.id, 'invoice_number', v_billed.invoice_number);
    END IF;
  END IF;

  -- Validate and price every line; the caller's own amounts are never read.
  FOR i IN 0 .. v_count - 1 LOOP
    l := p_lines -> i;
    v_bad := false;
    v_desc := NULL;
    v_qty := NULL;
    v_rate := NULL;

    IF jsonb_typeof(l) <> 'object' THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Line is not an object.');
      CONTINUE;
    END IF;

    IF jsonb_typeof(l -> 'description') = 'string' THEN
      v_desc := btrim(l ->> 'description');
    END IF;
    IF v_desc IS NULL OR v_desc = '' OR char_length(v_desc) > 500 THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Description is required (max 500 characters).');
      v_bad := true;
    END IF;

    IF jsonb_typeof(l -> 'quantity') = 'number' THEN
      v_qty := (l ->> 'quantity')::numeric;
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty > c_max_qty THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Quantity must be greater than zero.');
      v_bad := true;
    END IF;

    IF jsonb_typeof(l -> 'rate_paise') = 'number' AND (l ->> 'rate_paise') ~ '^-?[0-9]{1,18}$' THEN
      v_rate := (l ->> 'rate_paise')::bigint;
    END IF;
    IF v_rate IS NULL OR v_rate < 0 OR v_rate > c_max_rate THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Rate must be whole paise, zero or more.');
      v_bad := true;
    END IF;

    IF NOT v_bad THEN
      -- numeric round() rounds half away from zero; both factors are positive, so this is half-up.
      v_amt := round(v_qty * v_rate::numeric, 0);
      IF v_amt > c_max_amount THEN
        v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Line amount is too large.');
      ELSE
        v_descs := v_descs || v_desc;
        v_qtys := v_qtys || v_qty;
        v_rates := v_rates || v_rate;
        v_amts := v_amts || v_amt::bigint;
        v_subtotal := v_subtotal + v_amt::bigint;
      END IF;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_problems) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_line', 'problems', v_problems);
  END IF;

  IF v_subtotal <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_total');
  END IF;

  -- GST in whole paise, half-up. Intra-state: CGST = SGST = half the rate, each rounded half-up
  -- (the round-off absorbs any difference); inter-state: IGST at the full rate. Reverse charge: no tax.
  IF NOT v_rc AND p_gst_rate_pct > 0 THEN
    IF v_supplier = v_place THEN
      v_cgst := (v_subtotal * p_gst_rate_pct + 100) / 200;
      v_sgst := v_cgst;
    ELSE
      v_igst := (v_subtotal * p_gst_rate_pct + 50) / 100;
    END IF;
  END IF;

  v_pre_total := v_subtotal + v_cgst + v_sgst + v_igst;
  IF v_ro THEN
    v_total := ((v_pre_total + 50) / 100) * 100;
    v_round := v_total - v_pre_total;
  ELSE
    v_total := v_pre_total;
  END IF;

  -- Indian financial year (April to March) on the Indian calendar date.
  v_ist_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_start_year := CASE WHEN extract(month FROM v_ist_today) >= 4
                       THEN extract(year FROM v_ist_today)::integer
                       ELSE extract(year FROM v_ist_today)::integer - 1 END;
  v_fy := v_start_year::text || '-' || lpad(((v_start_year + 1) % 100)::text, 2, '0');

  -- Reached only after every refusal above, so a refused issue never consumes a number.
  INSERT INTO public.agency_invoice_sequences AS s (agency_id, fy, last_seq)
  VALUES (v_agency_id, v_fy, 1)
  ON CONFLICT (agency_id, fy) DO UPDATE SET last_seq = s.last_seq + 1
  RETURNING s.last_seq INTO v_seq;

  v_number := 'INV/' || v_fy || '/' || lpad(v_seq::text, 6, '0');

  INSERT INTO public.agency_invoices (
    agency_id, client_id, invoice_number, status, supplier_state_code, place_of_supply_state_code,
    gst_rate_pct, reverse_charge, subtotal_paise, cgst_paise, sgst_paise, igst_paise, round_off_paise,
    total_paise, paid_paise, version, idempotency_key, request_hash, created_by, consignment_id
  )
  VALUES (
    v_agency_id, p_client_id, v_number, 'issued', v_supplier, v_place,
    p_gst_rate_pct, v_rc, v_subtotal, v_cgst, v_sgst, v_igst, v_round,
    v_total, 0, 1, v_key, v_hash, auth.uid(), p_consignment_id
  )
  RETURNING id INTO v_invoice;

  FOR i IN 1 .. array_length(v_descs, 1) LOOP
    INSERT INTO public.agency_invoice_lines (invoice_id, line_no, description, quantity, rate_paise, amount_paise)
    VALUES (v_invoice, i, v_descs[i], v_qtys[i], v_rates[i], v_amts[i]);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice, 'invoice_number', v_number);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_invoice_issue(uuid, jsonb, text, text, integer, boolean, boolean, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_invoice_issue(uuid, jsonb, text, text, integer, boolean, boolean, text, uuid) TO authenticated, service_role;
