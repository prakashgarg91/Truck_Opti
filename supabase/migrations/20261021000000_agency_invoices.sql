-- TO-148: agency freight invoices and collections (RECORD-ONLY).
--
-- The platform never holds or moves freight money: the agency collects into its own account and
-- records receipts here. All amounts are integer paise (bigint). Writes happen ONLY through three
-- SECURITY DEFINER commands that take no agency id (the agency comes from auth.uid() via
-- resolve_caller_agency_for_scopes, scope 'finance'; the owner is always allowed):
--   agency_invoice_issue, agency_invoice_record_payment, agency_invoice_cancel.
-- Totals are recomputed on the server (line amount = quantity * rate rounded half-up, GST split in
-- integer arithmetic). Status is derived from paid_paise and total_paise, never taken from the caller.
-- The billed client is public.agency_client_agreements (the TO-145 client table).

CREATE TABLE IF NOT EXISTS public.agency_invoices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  client_id UUID NOT NULL,
  invoice_number TEXT NOT NULL CHECK (btrim(invoice_number) <> ''),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'partly_paid', 'paid', 'cancelled')),
  supplier_state_code TEXT NOT NULL CHECK (supplier_state_code ~ '^(0[1-9]|[12][0-9]|3[0-8])$'),
  place_of_supply_state_code TEXT NOT NULL CHECK (place_of_supply_state_code ~ '^(0[1-9]|[12][0-9]|3[0-8])$'),
  gst_rate_pct INTEGER NOT NULL CHECK (gst_rate_pct IN (0, 5, 12, 18)),
  reverse_charge BOOLEAN NOT NULL DEFAULT FALSE,
  subtotal_paise BIGINT NOT NULL CHECK (subtotal_paise >= 0),
  cgst_paise BIGINT NOT NULL DEFAULT 0 CHECK (cgst_paise >= 0),
  sgst_paise BIGINT NOT NULL DEFAULT 0 CHECK (sgst_paise >= 0),
  igst_paise BIGINT NOT NULL DEFAULT 0 CHECK (igst_paise >= 0),
  round_off_paise BIGINT NOT NULL DEFAULT 0 CHECK (round_off_paise BETWEEN -99 AND 99),
  total_paise BIGINT NOT NULL CHECK (total_paise >= 0),
  paid_paise BIGINT NOT NULL DEFAULT 0 CHECK (paid_paise >= 0),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  request_hash TEXT,
  cancelled_reason TEXT,
  cancelled_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_invoices_client_fk
    FOREIGN KEY (client_id, agency_id)
    REFERENCES public.agency_client_agreements (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_invoices_number_key UNIQUE (agency_id, invoice_number),
  CONSTRAINT agency_invoices_idem_key UNIQUE (agency_id, idempotency_key),
  CONSTRAINT agency_invoices_tenant_key UNIQUE (id, agency_id),
  CONSTRAINT agency_invoices_total_sum CHECK (total_paise = subtotal_paise + cgst_paise + sgst_paise + igst_paise + round_off_paise),
  CONSTRAINT agency_invoices_paid_le_total CHECK (paid_paise <= total_paise),
  CONSTRAINT agency_invoices_reverse_charge_tax CHECK (NOT reverse_charge OR (cgst_paise = 0 AND sgst_paise = 0 AND igst_paise = 0)),
  CONSTRAINT agency_invoices_status_paid CHECK (
    (status = 'issued' AND paid_paise = 0)
    OR (status = 'partly_paid' AND paid_paise > 0 AND paid_paise < total_paise)
    OR (status = 'paid' AND paid_paise = total_paise)
    OR (status = 'cancelled' AND paid_paise = 0)
  )
);

CREATE TABLE IF NOT EXISTS public.agency_invoice_lines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL REFERENCES public.agency_invoices (id) ON DELETE RESTRICT,
  line_no INTEGER NOT NULL CHECK (line_no >= 1),
  description TEXT NOT NULL CHECK (btrim(description) <> ''),
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  rate_paise BIGINT NOT NULL CHECK (rate_paise >= 0),
  amount_paise BIGINT NOT NULL CHECK (amount_paise >= 0),
  CONSTRAINT agency_invoice_lines_line_key UNIQUE (invoice_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.agency_invoice_payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id UUID NOT NULL,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  method TEXT NOT NULL CHECK (method IN ('upi', 'bank', 'cash', 'cheque')),
  reference TEXT,
  received_on DATE NOT NULL,
  idempotency_key TEXT NOT NULL CHECK (btrim(idempotency_key) <> ''),
  created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agency_invoice_payments_invoice_fk
    FOREIGN KEY (invoice_id, agency_id)
    REFERENCES public.agency_invoices (id, agency_id) ON DELETE RESTRICT,
  CONSTRAINT agency_invoice_payments_idem_key UNIQUE (agency_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.agency_invoice_sequences (
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  fy TEXT NOT NULL CHECK (fy ~ '^[0-9]{4}-[0-9]{2}$'),
  last_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  PRIMARY KEY (agency_id, fy)
);

CREATE INDEX IF NOT EXISTS agency_invoices_by_client ON public.agency_invoices (agency_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agency_invoice_payments_by_invoice ON public.agency_invoice_payments (invoice_id);

ALTER TABLE public.agency_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_invoice_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agency_invoices_select ON public.agency_invoices;
CREATE POLICY agency_invoices_select ON public.agency_invoices
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

DROP POLICY IF EXISTS agency_invoice_lines_select ON public.agency_invoice_lines;
CREATE POLICY agency_invoice_lines_select ON public.agency_invoice_lines
  FOR SELECT TO authenticated
  USING (invoice_id IN (
    SELECT i.id FROM public.agency_invoices i
    WHERE i.agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]))
  ));

DROP POLICY IF EXISTS agency_invoice_payments_select ON public.agency_invoice_payments;
CREATE POLICY agency_invoice_payments_select ON public.agency_invoice_payments
  FOR SELECT TO authenticated
  USING (agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[])));

-- The sequence table is internal: no policy for authenticated, service_role only.

REVOKE ALL ON public.agency_invoices, public.agency_invoice_lines, public.agency_invoice_payments, public.agency_invoice_sequences
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agency_invoices, public.agency_invoice_lines, public.agency_invoice_payments TO authenticated;
GRANT ALL ON public.agency_invoices, public.agency_invoice_lines, public.agency_invoice_payments, public.agency_invoice_sequences TO service_role;

-- ---------------------------------------------------------------------------
-- Integrity: append-only ledgers, frozen money fields, payment ledger = paid_paise
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_invoice_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed.', TG_TABLE_NAME, TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$;

DROP TRIGGER IF EXISTS agency_invoice_lines_append_only ON public.agency_invoice_lines;
CREATE TRIGGER agency_invoice_lines_append_only
  BEFORE UPDATE OR DELETE ON public.agency_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.agency_invoice_append_only();

DROP TRIGGER IF EXISTS agency_invoice_payments_append_only ON public.agency_invoice_payments;
CREATE TRIGGER agency_invoice_payments_append_only
  BEFORE UPDATE OR DELETE ON public.agency_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.agency_invoice_append_only();

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
     OR NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'An issued invoice''s amounts, number, client and agency cannot be changed.' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agency_invoices_guard_frozen ON public.agency_invoices;
CREATE TRIGGER agency_invoices_guard_frozen
  BEFORE UPDATE OR DELETE ON public.agency_invoices
  FOR EACH ROW EXECUTE FUNCTION public.agency_invoice_guard_frozen();

-- Checked at commit: paid_paise equals the sum of the payment rows, and a cancelled invoice has none.
CREATE OR REPLACE FUNCTION public.agency_invoice_check_ledger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice uuid;
  v_paid bigint;
  v_status text;
  v_sum bigint;
BEGIN
  IF TG_TABLE_NAME = 'agency_invoices' THEN
    v_invoice := NEW.id;
  ELSE
    v_invoice := NEW.invoice_id;
  END IF;
  SELECT paid_paise, status INTO v_paid, v_status FROM public.agency_invoices WHERE id = v_invoice;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT coalesce(sum(amount_paise), 0)::bigint INTO v_sum FROM public.agency_invoice_payments WHERE invoice_id = v_invoice;
  IF v_sum <> v_paid THEN
    RAISE EXCEPTION 'Payment ledger mismatch for invoice %: payments % vs paid %', v_invoice, v_sum, v_paid
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_status = 'cancelled' AND v_sum > 0 THEN
    RAISE EXCEPTION 'Cancelled invoice % has payments.', v_invoice USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS agency_invoices_ledger_check ON public.agency_invoices;
CREATE CONSTRAINT TRIGGER agency_invoices_ledger_check
  AFTER INSERT OR UPDATE ON public.agency_invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.agency_invoice_check_ledger();

-- NOT attached to agency_invoice_payments: the battery seeds payment rows directly while the invoice's
-- paid_paise is still 0, so a payments-side check cannot hold there. The commands also assert the sum in-line.

-- ---------------------------------------------------------------------------
-- Issue
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_invoice_issue(
  p_client_id uuid,
  p_lines jsonb,
  p_supplier_state text,
  p_place_of_supply_state text,
  p_gst_rate_pct integer,
  p_reverse_charge boolean,
  p_round_off boolean,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  v_hash := md5(jsonb_build_object(
    'client', p_client_id, 'lines', p_lines, 'supplier', v_supplier, 'place', v_place,
    'rate', p_gst_rate_pct, 'rc', v_rc, 'ro', v_ro
  )::text);

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
    total_paise, paid_paise, version, idempotency_key, request_hash, created_by
  )
  VALUES (
    v_agency_id, p_client_id, v_number, 'issued', v_supplier, v_place,
    p_gst_rate_pct, v_rc, v_subtotal, v_cgst, v_sgst, v_igst, v_round,
    v_total, 0, 1, v_key, v_hash, auth.uid()
  )
  RETURNING id INTO v_invoice;

  FOR i IN 1 .. array_length(v_descs, 1) LOOP
    INSERT INTO public.agency_invoice_lines (invoice_id, line_no, description, quantity, rate_paise, amount_paise)
    VALUES (v_invoice, i, v_descs[i], v_qtys[i], v_rates[i], v_amts[i]);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'invoice_id', v_invoice, 'invoice_number', v_number);
END;
$$;

-- ---------------------------------------------------------------------------
-- Record a payment (record-only: the agency collected the money itself)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_invoice_record_payment(
  p_invoice_id uuid,
  p_amount_paise bigint,
  p_method text,
  p_reference text,
  p_received_on date,
  p_expected_version integer,
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
  v_method text;
  v_ref text;
  v_inv public.agency_invoices%ROWTYPE;
  v_pay public.agency_invoice_payments%ROWTYPE;
  v_new_paid bigint;
  v_new_status text;
  v_new_version integer;
  v_sum bigint;
  v_constraint text;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  -- The invoice row lock serialises every payment on this invoice.
  SELECT * INTO v_inv
  FROM public.agency_invoices
  WHERE id = p_invoice_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;

  v_method := lower(btrim(coalesce(p_method, '')));
  v_ref := nullif(btrim(coalesce(p_reference, '')), '');

  -- Replay of the same request, answered before the version and state rules.
  SELECT * INTO v_pay
  FROM public.agency_invoice_payments
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_pay.invoice_id = p_invoice_id AND v_pay.amount_paise = p_amount_paise
       AND v_pay.method = v_method AND v_pay.received_on IS NOT DISTINCT FROM p_received_on
       AND v_pay.reference IS NOT DISTINCT FROM v_ref THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'paid_paise', v_inv.paid_paise,
                                'status', v_inv.status, 'version', v_inv.version);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_inv.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invoice_cancelled');
  END IF;

  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  IF v_method NOT IN ('upi', 'bank', 'cash', 'cheque') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_method');
  END IF;

  IF p_received_on IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_date');
  END IF;
  IF p_received_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'future_date');
  END IF;

  IF p_expected_version IS NULL OR v_inv.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_inv.version);
  END IF;

  IF p_amount_paise > v_inv.total_paise - v_inv.paid_paise THEN
    RETURN jsonb_build_object('ok', false, 'error', 'overpayment',
                              'outstanding_paise', v_inv.total_paise - v_inv.paid_paise);
  END IF;

  IF v_ref IS NOT NULL AND char_length(v_ref) > 100 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_reference');
  END IF;

  BEGIN
    INSERT INTO public.agency_invoice_payments (invoice_id, agency_id, amount_paise, method, reference, received_on, idempotency_key, created_by)
    VALUES (p_invoice_id, v_agency_id, p_amount_paise, v_method, v_ref, p_received_on, v_key, auth.uid());
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'agency_invoice_payments_idem_key' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
    END IF;
    RAISE;
  END;

  v_new_paid := v_inv.paid_paise + p_amount_paise;
  v_new_status := CASE WHEN v_new_paid = v_inv.total_paise THEN 'paid' ELSE 'partly_paid' END;

  UPDATE public.agency_invoices
  SET paid_paise = v_new_paid, status = v_new_status, version = version + 1, updated_at = now()
  WHERE id = p_invoice_id
  RETURNING version INTO v_new_version;

  -- Invariant guard: the payment rows must add up to paid_paise, or the whole call rolls back.
  SELECT coalesce(sum(amount_paise), 0)::bigint INTO v_sum
  FROM public.agency_invoice_payments WHERE invoice_id = p_invoice_id;
  IF v_sum <> v_new_paid THEN
    RAISE EXCEPTION 'Payment ledger mismatch for invoice %: payments % vs paid %', p_invoice_id, v_sum, v_new_paid;
  END IF;

  RETURN jsonb_build_object('ok', true, 'paid_paise', v_new_paid, 'status', v_new_status, 'version', v_new_version);
END;
$$;

-- ---------------------------------------------------------------------------
-- Cancel (only while nothing has been received)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_invoice_cancel(
  p_invoice_id uuid,
  p_expected_version integer,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_reason text;
  v_inv public.agency_invoices%ROWTYPE;
  v_new_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_inv
  FROM public.agency_invoices
  WHERE id = p_invoice_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_inv.status = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_cancelled');
  END IF;

  v_reason := btrim(coalesce(p_reason, ''));
  IF v_reason = '' OR char_length(v_reason) > 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  IF p_expected_version IS NULL OR v_inv.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_inv.version);
  END IF;

  IF v_inv.paid_paise > 0 OR EXISTS (
    SELECT 1 FROM public.agency_invoice_payments p WHERE p.invoice_id = p_invoice_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'has_payments');
  END IF;

  UPDATE public.agency_invoices
  SET status = 'cancelled', cancelled_reason = v_reason, cancelled_at = now(),
      version = version + 1, updated_at = now()
  WHERE id = p_invoice_id
  RETURNING version INTO v_new_version;

  RETURN jsonb_build_object('ok', true, 'status', 'cancelled', 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_invoice_issue(uuid, jsonb, text, text, integer, boolean, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_invoice_record_payment(uuid, bigint, text, text, date, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_invoice_cancel(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_invoice_issue(uuid, jsonb, text, text, integer, boolean, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_invoice_record_payment(uuid, bigint, text, text, date, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_invoice_cancel(uuid, integer, text) TO authenticated, service_role;
