-- Unregistered seller mode (docs/FABLE-RULINGS-2026-11-18-C.md section 1).
--
-- The platform seller is not registered under GST yet, so subscriptions must be sellable without GST.
-- One switch on the single settings row (platform_billing_settings.gst_registered, default TRUE) decides tax:
--   * TRUE  (default): exactly the earlier behaviour; every existing rule, number and battery is unchanged.
--   * FALSE: the seller needs legal name, address and state code (no GSTIN; a GSTIN is refused). The quote has
--     taxable = plan price, CGST = SGST = IGST = 0, total = taxable, gst_rate_pct 0. Invoices are written at rate 0
--     with supplier_gstin NULL and zero tax columns; place of supply is still computed and stored; the same TO/yy-yy
--     number series continues. Credit notes of a rate-0 invoice carry zero tax (the pro-rata maths on the taxable
--     amount is unchanged: subscription_record_refund already yields zero tax when the invoice has none).
--   * Invoices and credit notes are snapshots: flipping the flag changes only later sales. An order priced under one
--     mode that is paid after the flag moved is refused as billing_settings_changed (same rule as a moved state),
--     never invoiced under the other mode.
--   * platform_gst_registered() exposes the flag only (anon + authenticated); never the settings row.
-- Functions changed (bodies copied whole from their latest definition, only the ruled lines edited):
--   platform_billing_settings_update (7 args, the 6-arg form is dropped), subscription_quote_order (029),
--   subscription_create_order (029), subscription_activate_payment (029), subscription_credit_note_guard (028).
-- Nothing here edits an earlier migration.

-- ---------------------------------------------------------------------------
-- 1. Settings column and invariant
-- ---------------------------------------------------------------------------
ALTER TABLE public.platform_billing_settings ADD COLUMN IF NOT EXISTS gst_registered BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.platform_billing_settings DROP CONSTRAINT IF EXISTS platform_billing_settings_unregistered_chk;
ALTER TABLE public.platform_billing_settings ADD CONSTRAINT platform_billing_settings_unregistered_chk
  CHECK (gst_registered OR gstin IS NULL);

-- ---------------------------------------------------------------------------
-- 2. Invoice constraints, relaxed only as far as the rate-0 invoice needs
-- ---------------------------------------------------------------------------
-- The earlier migration declared the rate check inline (auto-named); find it by its definition, not its name.
DO $mig$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
      FROM pg_constraint c
     WHERE c.conrelid = 'public.subscription_invoices'::regclass
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ~ 'gst_rate_pct = 18'
       AND c.conname <> 'subscription_invoices_tax_rule'
  LOOP
    EXECUTE format('ALTER TABLE public.subscription_invoices DROP CONSTRAINT %I', r.conname);
  END LOOP;
END
$mig$;

ALTER TABLE public.subscription_invoices DROP CONSTRAINT IF EXISTS subscription_invoices_gst_rate_chk;
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_gst_rate_chk
  CHECK (gst_rate_pct IN (0, 18));

ALTER TABLE public.subscription_invoices ALTER COLUMN supplier_gstin DROP NOT NULL;

-- A NULL supplier GSTIN is only legal on a rate-0 invoice; an 18% invoice must carry the supplier GSTIN.
ALTER TABLE public.subscription_invoices DROP CONSTRAINT IF EXISTS subscription_invoices_supplier_gstin_rate_chk;
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_supplier_gstin_rate_chk
  CHECK (gst_rate_pct = 0 OR supplier_gstin IS NOT NULL);

-- ---------------------------------------------------------------------------
-- 3. Admin settings command (7 arguments; the 6-argument form is dropped)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.platform_billing_settings_update(text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.platform_billing_settings_update(
  p_legal_name text,
  p_gstin text,
  p_address text,
  p_state_code text,
  p_sac_code text,
  p_enforcement_enabled boolean,
  p_gst_registered boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_gst_registered IS NULL THEN
    RAISE EXCEPTION 'invalid_gst_registered' USING ERRCODE = '22023';
  END IF;
  IF p_legal_name IS NULL OR btrim(p_legal_name) = '' THEN
    RAISE EXCEPTION 'invalid_legal_name' USING ERRCODE = '22023';
  END IF;
  IF p_gst_registered THEN
    IF p_gstin IS NULL OR p_gstin !~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
      RAISE EXCEPTION 'invalid_gstin' USING ERRCODE = '22023';
    END IF;
  ELSIF p_gstin IS NOT NULL AND btrim(p_gstin) <> '' THEN
    RAISE EXCEPTION 'gstin_not_allowed_when_unregistered' USING ERRCODE = '22023';
  END IF;
  IF p_address IS NULL OR btrim(p_address) = '' THEN
    RAISE EXCEPTION 'invalid_address' USING ERRCODE = '22023';
  END IF;
  IF p_state_code IS NULL OR p_state_code !~ '^(0[1-9]|[12][0-9]|3[0-8])$' THEN
    RAISE EXCEPTION 'invalid_state_code' USING ERRCODE = '22023';
  END IF;
  IF p_gst_registered AND left(p_gstin, 2) <> p_state_code THEN
    RAISE EXCEPTION 'gstin_state_mismatch' USING ERRCODE = '22023';
  END IF;
  IF p_sac_code IS NULL OR p_sac_code !~ '^[0-9]{6,8}$' THEN
    RAISE EXCEPTION 'invalid_sac_code' USING ERRCODE = '22023';
  END IF;
  IF p_enforcement_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_enforcement_enabled' USING ERRCODE = '22023';
  END IF;

  UPDATE public.platform_billing_settings
     SET legal_name = btrim(p_legal_name),
         gstin = CASE WHEN p_gst_registered THEN p_gstin ELSE NULL END,
         address = btrim(p_address),
         state_code = p_state_code,
         sac_code = p_sac_code,
         enforcement_enabled = p_enforcement_enabled,
         gst_registered = p_gst_registered,
         updated_at = now(),
         updated_by = auth.uid()
   WHERE TRUE;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_billing_settings_update(text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_billing_settings_update(text, text, text, text, text, boolean, boolean) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Public flag (the flag only, never the settings row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.platform_gst_registered()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce((SELECT s.gst_registered FROM public.platform_billing_settings s LIMIT 1), TRUE);
$$;

REVOKE ALL ON FUNCTION public.platform_gst_registered() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_gst_registered() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Quote, order, activation (from 20261029000000)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_quote_order(
  p_agency_id uuid,
  p_plan_tier text,
  p_billing_cycle text,
  p_coupon_code text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency public.transport_agencies%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_settings public.platform_billing_settings%ROWTYPE;
  v_cp public.subscription_coupons%ROWTYPE;
  v_code text;
  v_pos text;
  v_subtotal bigint;
  v_discount bigint := 0;
  v_taxable bigint;
  v_split record;
  v_used integer;
  v_others integer;
  v_pending integer;
  v_cur public.subscriptions%ROWTYPE;
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_not_found');
  END IF;
  IF p_billing_cycle IS NULL OR p_billing_cycle NOT IN ('monthly', 'yearly') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_cycle');
  END IF;

  SELECT * INTO v_plan
    FROM public.subscription_plans
   WHERE tier = lower(btrim(coalesce(p_plan_tier, ''))) AND coalesce(is_active, TRUE)
   ORDER BY created_at, id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'unknown_plan');
  END IF;

  SELECT * INTO v_agency FROM public.transport_agencies WHERE id = p_agency_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_not_found');
  END IF;
  IF v_agency.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_not_operational');
  END IF;
  IF v_agency.user_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_without_owner');
  END IF;

  SELECT * INTO v_settings FROM public.platform_billing_settings LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'BILLING_NOT_CONFIGURED');
  END IF;
  IF v_settings.gst_registered THEN
    IF v_settings.gstin IS NULL OR v_settings.state_code IS NULL OR v_settings.legal_name IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'BILLING_NOT_CONFIGURED');
    END IF;
  ELSIF v_settings.legal_name IS NULL OR v_settings.address IS NULL OR v_settings.state_code IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'BILLING_NOT_CONFIGURED');
  END IF;

  BEGIN
    v_pos := public.subscription_place_of_supply(v_agency.gstin, v_agency.state);
  EXCEPTION WHEN SQLSTATE '22023' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'BILLING_STATE_REQUIRED');
  END;

  v_subtotal := CASE p_billing_cycle WHEN 'yearly' THEN v_plan.price_yearly::bigint ELSE v_plan.price_monthly::bigint END;
  IF v_subtotal IS NULL OR v_subtotal <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'plan_not_purchasable');
  END IF;

  -- Plan switch policy: a different plan is refused while the paid live period still has more than 7 days left
  -- (support-assisted). It is allowed on a trial, once the period is within 7 days of ending, and after expiry;
  -- an agency whose latest subscription is cancelled has no live period and starts a fresh path.
  SELECT * INTO v_cur
    FROM public.subscriptions
   WHERE agency_id = p_agency_id AND status IN ('trial', 'active', 'past_due', 'grace')
   LIMIT 1;
  IF FOUND AND v_cur.status <> 'trial' AND v_cur.plan_id IS DISTINCT FROM v_plan.id
     AND v_cur.current_period_end > now() + interval '7 days' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'plan_change_blocked');
  END IF;

  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    v_code := upper(btrim(p_coupon_code));
    SELECT * INTO v_cp FROM public.subscription_coupons WHERE code = v_code;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'coupon_invalid');
    END IF;
    IF v_cp.valid_until IS NOT NULL AND v_cp.valid_until <= now() THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'coupon_expired');
    END IF;
    IF v_cp.monthly_only AND p_billing_cycle <> 'monthly' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'coupon_yearly_not_allowed');
    END IF;
    SELECT count(*) INTO v_used
      FROM public.subscription_coupon_redemptions r
     WHERE r.coupon_code = v_code AND r.agency_id = p_agency_id;
    -- Unpaid orders of the last 24 hours hold a reservation on the coupon.
    SELECT count(*) INTO v_pending
      FROM public.payment_history h
     WHERE h.coupon_code = v_code AND h.agency_id = p_agency_id AND h.status = 'pending'
       AND h.created_at > now() - interval '24 hours';
    IF v_used + v_pending >= v_cp.max_cycles THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'coupon_exhausted');
    END IF;
    IF v_cp.max_redemptions IS NOT NULL AND v_used = 0 THEN
      -- Distinct OTHER agencies that hold a redemption or a pending reservation.
      SELECT count(DISTINCT x.agency_id) INTO v_others
        FROM (
          SELECT r.agency_id FROM public.subscription_coupon_redemptions r WHERE r.coupon_code = v_code
          UNION
          SELECT h.agency_id FROM public.payment_history h
           WHERE h.coupon_code = v_code AND h.agency_id IS NOT NULL AND h.status = 'pending'
             AND h.created_at > now() - interval '24 hours'
        ) x
       WHERE x.agency_id <> p_agency_id;
      IF v_others >= v_cp.max_redemptions THEN
        RETURN jsonb_build_object('ok', FALSE, 'error', 'coupon_exhausted');
      END IF;
    END IF;
    -- Half-up(subtotal x percent / 100) in integer paise.
    v_discount := (2 * v_subtotal * v_cp.percent_off + 100) / 200;
  ELSE
    v_code := NULL;
  END IF;

  v_taxable := v_subtotal - v_discount;
  IF v_taxable <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'coupon_discount_too_large');
  END IF;
  IF v_settings.gst_registered THEN
    SELECT * INTO v_split FROM public.subscription_tax_split(v_taxable, v_settings.state_code, v_pos);
  ELSE
    -- Unregistered seller: no tax is computed or collected; the total is the taxable amount.
    SELECT 0::bigint AS cgst_paise, 0::bigint AS sgst_paise, 0::bigint AS igst_paise, v_taxable AS total_paise INTO v_split;
  END IF;
  IF v_split.total_paise > 2147483647 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'amount_too_large');
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'agency_id', p_agency_id,
    'owner_user_id', v_agency.user_id,
    'plan_id', v_plan.id,
    'plan_tier', v_plan.tier,
    'billing_cycle', p_billing_cycle,
    'coupon_code', v_code,
    'currency', 'INR',
    'subtotal_paise', v_subtotal,
    'discount_paise', v_discount,
    'taxable_paise', v_taxable,
    'cgst_paise', v_split.cgst_paise,
    'sgst_paise', v_split.sgst_paise,
    'igst_paise', v_split.igst_paise,
    'amount_paise', v_split.total_paise,
    'total_paise', v_split.total_paise,
    'quote_hash', md5(concat_ws('|', p_agency_id, v_plan.id, p_billing_cycle, coalesce(v_code, ''), v_subtotal,
                                v_discount, v_split.cgst_paise, v_split.sgst_paise, v_split.igst_paise, v_split.total_paise)),
    'supplier_state_code', v_settings.state_code,
    'pos_state_code', v_pos,
    'gst_registered', v_settings.gst_registered,
    'gst_rate_pct', CASE WHEN v_settings.gst_registered THEN 18 ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_create_order(
  p_agency_id uuid,
  p_plan_tier text,
  p_billing_cycle text,
  p_coupon_code text,
  p_razorpay_order_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q jsonb;
  v_row public.payment_history%ROWTYPE;
  v_plan_tier text;
  v_code text;
BEGIN
  IF p_razorpay_order_id IS NULL OR btrim(p_razorpay_order_id) = '' OR length(p_razorpay_order_id) > 128 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_order_id');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('suborder:' || p_razorpay_order_id, 0));

  -- Replay first: the same order id with the same request returns the stored snapshot.
  SELECT * INTO v_row FROM public.payment_history WHERE razorpay_order_id = p_razorpay_order_id;
  IF FOUND THEN
    v_code := CASE WHEN p_coupon_code IS NULL OR btrim(p_coupon_code) = '' THEN NULL ELSE upper(btrim(p_coupon_code)) END;
    SELECT tier INTO v_plan_tier FROM public.subscription_plans WHERE id = v_row.plan_id;
    IF v_row.agency_id IS NOT DISTINCT FROM p_agency_id
       AND v_plan_tier IS NOT DISTINCT FROM lower(btrim(coalesce(p_plan_tier, '')))
       AND v_row.billing_cycle IS NOT DISTINCT FROM p_billing_cycle
       AND v_row.coupon_code IS NOT DISTINCT FROM v_code THEN
      RETURN jsonb_build_object('ok', TRUE, 'replay', TRUE, 'order_id', v_row.razorpay_order_id,
        'agency_id', v_row.agency_id, 'plan_id', v_row.plan_id, 'billing_cycle', v_row.billing_cycle,
        'coupon_code', v_row.coupon_code, 'currency', v_row.currency,
        'gst_registered', coalesce((v_row.metadata ->> 'gst_registered')::boolean, TRUE),
        'subtotal_paise', v_row.subtotal_paise, 'discount_paise', v_row.discount_paise,
        'cgst_paise', v_row.cgst_paise, 'sgst_paise', v_row.sgst_paise, 'igst_paise', v_row.igst_paise,
        'amount_paise', v_row.amount, 'total_paise', v_row.amount, 'status', v_row.status,
        'quote_hash', md5(concat_ws('|', v_row.agency_id, v_row.plan_id, v_row.billing_cycle, coalesce(v_row.coupon_code, ''),
                                    v_row.subtotal_paise, v_row.discount_paise, v_row.cgst_paise, v_row.sgst_paise,
                                    v_row.igst_paise, v_row.amount)));
    END IF;
    RETURN jsonb_build_object('ok', FALSE, 'error', 'order_id_conflict');
  END IF;

  -- Serialise orders on the same coupon so the reservation counts in the quote cannot race.
  IF p_coupon_code IS NOT NULL AND btrim(p_coupon_code) <> '' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('subcoupon:' || upper(btrim(p_coupon_code)), 0));
  END IF;

  v_q := public.subscription_quote_order(p_agency_id, p_plan_tier, p_billing_cycle, p_coupon_code);
  IF coalesce((v_q ->> 'ok')::boolean, FALSE) IS NOT TRUE THEN
    RETURN v_q;
  END IF;

  BEGIN
    INSERT INTO public.payment_history (
      user_id, agency_id, plan_id, billing_cycle, subtotal_paise, discount_paise,
      cgst_paise, sgst_paise, igst_paise, coupon_code,
      amount, currency, payment_method, status, razorpay_order_id, metadata
    ) VALUES (
      (v_q ->> 'owner_user_id')::uuid, p_agency_id, (v_q ->> 'plan_id')::uuid, v_q ->> 'billing_cycle',
      (v_q ->> 'subtotal_paise')::bigint, (v_q ->> 'discount_paise')::bigint,
      (v_q ->> 'cgst_paise')::bigint, (v_q ->> 'sgst_paise')::bigint, (v_q ->> 'igst_paise')::bigint,
      v_q ->> 'coupon_code',
      (v_q ->> 'amount_paise')::integer, 'INR', 'upi', 'pending', p_razorpay_order_id,
      jsonb_build_object(
        'payment_provider', 'razorpay',
        'priced_by', 'server',
        'supplier_state_code', v_q ->> 'supplier_state_code',
        'pos_state_code', v_q ->> 'pos_state_code',
        'gst_registered', (v_q ->> 'gst_registered')::boolean
      )
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'order_id_conflict');
  END;

  RETURN (v_q - 'owner_user_id') || jsonb_build_object('replay', FALSE, 'order_id', p_razorpay_order_id, 'status', 'pending');
END;
$$;

CREATE OR REPLACE FUNCTION public.subscription_activate_payment(
  p_order_id text,
  p_payment_id text,
  p_amount_paise bigint,
  p_currency text,
  p_method text,
  p_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_pay public.payment_history%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_agency public.transport_agencies%ROWTYPE;
  v_settings public.platform_billing_settings%ROWTYPE;
  v_cp public.subscription_coupons%ROWTYPE;
  v_inv public.subscription_invoices%ROWTYPE;
  v_other uuid;
  v_base timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_number text;
  v_inv_at timestamptz;
  v_pos text;
  v_supplier_state text;
  v_method text;
  v_used integer;
  v_others integer;
  v_over_limit boolean := FALSE;
  v_taxable bigint;
  v_constraint text;
  v_sub_id uuid;
  v_sub_status text;
  v_flagged boolean := FALSE;
BEGIN
  IF p_order_id IS NULL OR btrim(p_order_id) = '' OR p_payment_id IS NULL OR btrim(p_payment_id) = ''
     OR p_amount_paise IS NULL OR p_currency IS NULL OR p_source IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_arguments');
  END IF;
  IF p_source NOT IN ('verify', 'webhook') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_source');
  END IF;
  IF p_payment_id !~ '^[A-Za-z0-9_-]{6,64}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_payment_id');
  END IF;

  -- One activation per order at a time; verify and webhook queue here, then see each other's result.
  PERFORM pg_advisory_xact_lock(hashtextextended('subpay:' || p_order_id, 0));

  SELECT * INTO v_pay
    FROM public.payment_history
   WHERE razorpay_order_id = p_order_id AND agency_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'order_not_found');
  END IF;

  -- Replay safety by payment id; any other payment id for a paid order is refused (and recorded, so ops can refund it).
  IF v_pay.status IN ('success', 'refunded') THEN
    IF v_pay.razorpay_payment_id IS NOT DISTINCT FROM p_payment_id THEN
      SELECT * INTO v_inv FROM public.subscription_invoices WHERE id = v_pay.subscription_invoice_id;
      SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_pay.subscription_id;
      RETURN jsonb_build_object('ok', TRUE, 'replay', TRUE,
        'subscription_id', v_pay.subscription_id, 'status', v_sub.status,
        'current_period_start', v_sub.current_period_start, 'current_period_end', v_sub.current_period_end,
        'invoice_id', v_pay.subscription_invoice_id, 'invoice_number', v_inv.invoice_number,
        'amount_paise', v_pay.amount::bigint, 'coupon_over_limit', FALSE);
    END IF;
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'order_already_paid');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'order_already_paid');
  END IF;

  -- Currency and amount are verified against the stored snapshot, never against the caller.
  IF p_currency <> 'INR' OR v_pay.currency IS DISTINCT FROM 'INR' THEN
    UPDATE public.payment_history
       SET status = 'failed',
           error_message = left('CURRENCY_MISMATCH: expected INR got ' || p_currency, 500)
     WHERE id = v_pay.id;
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'CURRENCY_MISMATCH');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'CURRENCY_MISMATCH');
  END IF;
  IF p_amount_paise <> v_pay.amount::bigint THEN
    UPDATE public.payment_history
       SET status = 'failed',
           error_message = left('AMOUNT_MISMATCH: expected ' || v_pay.amount || ' got ' || p_amount_paise, 500)
     WHERE id = v_pay.id;
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'AMOUNT_MISMATCH');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'AMOUNT_MISMATCH');
  END IF;

  SELECT id INTO v_other
    FROM public.payment_history
   WHERE razorpay_payment_id = p_payment_id AND agency_id IS NOT NULL AND id <> v_pay.id
   LIMIT 1;
  IF FOUND THEN
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'payment_id_in_use');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_id_in_use');
  END IF;

  -- The subscription this payment pays for: the live one, else the most recent.
  SELECT * INTO v_sub
    FROM public.subscriptions
   WHERE agency_id = v_pay.agency_id
   ORDER BY (status IN ('trial', 'active', 'past_due', 'grace')) DESC, created_at DESC, id
   LIMIT 1
   FOR UPDATE;
  IF FOUND AND v_sub.status = 'cancelled' THEN
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'subscription_cancelled',
                                             'ACTIVATION_REFUSED: subscription_cancelled');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'subscription_cancelled');
  END IF;

  SELECT * INTO v_agency FROM public.transport_agencies WHERE id = v_pay.agency_id;
  IF NOT FOUND OR v_agency.status <> 'approved' THEN
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'agency_not_operational',
                                             'ACTIVATION_REFUSED: agency_not_operational');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_not_operational');
  END IF;

  -- Plan switch policy (same rule as the quote): not while a paid period has more than 7 days left.
  IF v_sub.id IS NOT NULL AND v_sub.status IN ('active', 'past_due', 'grace')
     AND v_sub.plan_id IS DISTINCT FROM v_pay.plan_id AND v_sub.current_period_end > v_now + interval '7 days' THEN
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'plan_change_blocked',
                                             'ACTIVATION_REFUSED: plan_change_blocked');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'plan_change_blocked');
  END IF;

  SELECT * INTO v_settings FROM public.platform_billing_settings LIMIT 1;
  IF NOT FOUND
     OR (v_settings.gst_registered AND (v_settings.gstin IS NULL OR v_settings.state_code IS NULL))
     OR (NOT v_settings.gst_registered AND (v_settings.legal_name IS NULL OR v_settings.address IS NULL OR v_settings.state_code IS NULL)) THEN
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'BILLING_NOT_CONFIGURED',
                                             'ACTIVATION_REFUSED: BILLING_NOT_CONFIGURED');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'BILLING_NOT_CONFIGURED');
  END IF;
  v_pos := v_pay.metadata ->> 'pos_state_code';
  v_supplier_state := v_pay.metadata ->> 'supplier_state_code';
  -- An order priced under one GST mode is never invoiced under the other (orders without the marker are registered).
  IF v_pos IS NULL OR v_supplier_state IS DISTINCT FROM v_settings.state_code
     OR coalesce((v_pay.metadata ->> 'gst_registered')::boolean, TRUE) IS DISTINCT FROM v_settings.gst_registered THEN
    -- The supplier registration moved after the order was priced: refuse rather than invoice a different tax.
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'billing_settings_changed',
                                             'ACTIVATION_REFUSED: billing_settings_changed');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'billing_settings_changed');
  END IF;

  v_method := lower(coalesce(left(p_method, 32), ''));
  IF v_method NOT IN ('card', 'upi', 'netbanking', 'wallet') THEN
    v_method := v_pay.payment_method;
  END IF;

  BEGIN
    -- Coupon redemption: serialised on the coupon row; the quoted price is honoured even when a concurrent
    -- pending order already used the last cycle (then no redemption row is written and the result says so).
    IF v_pay.coupon_code IS NOT NULL THEN
      SELECT * INTO v_cp FROM public.subscription_coupons WHERE code = v_pay.coupon_code FOR UPDATE;
      SELECT count(*) INTO v_used
        FROM public.subscription_coupon_redemptions r
       WHERE r.coupon_code = v_pay.coupon_code AND r.agency_id = v_pay.agency_id;
      SELECT count(DISTINCT r.agency_id) INTO v_others
        FROM public.subscription_coupon_redemptions r WHERE r.coupon_code = v_pay.coupon_code;
      IF v_used >= v_cp.max_cycles
         OR (v_cp.max_redemptions IS NOT NULL AND v_used = 0 AND v_others >= v_cp.max_redemptions) THEN
        v_over_limit := TRUE;
      END IF;
    END IF;

    -- Period: a paid trial starts now; otherwise a renewal starts at greatest(now, current_period_end).
    IF v_sub.id IS NOT NULL THEN
      v_base := CASE WHEN v_sub.status = 'trial' THEN v_now ELSE greatest(v_now, v_sub.current_period_end) END;
    ELSE
      v_base := v_now;
    END IF;
    v_start := v_base;
    v_end := ((v_base AT TIME ZONE 'Asia/Kolkata')
              + CASE v_pay.billing_cycle WHEN 'yearly' THEN interval '1 year' ELSE interval '1 month' END)
             AT TIME ZONE 'Asia/Kolkata';

    -- Subscription: exactly one UPDATE (version +1). The paid flag is on only around this statement.
    IF v_sub.id IS NULL THEN
      INSERT INTO public.subscriptions
        (user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, first_paid_at)
      VALUES
        (v_pay.user_id, v_pay.agency_id, v_pay.plan_id, 'active', v_pay.billing_cycle, v_start, v_end, v_now)
      RETURNING id, status INTO v_sub_id, v_sub_status;
    ELSE
      PERFORM set_config('app.subscription_paid', 'on', TRUE);
      v_flagged := TRUE;
      UPDATE public.subscriptions
         SET status = 'active',
             plan_id = v_pay.plan_id,
             billing_cycle = v_pay.billing_cycle,
             current_period_start = v_start,
             current_period_end = v_end,
             grace_end = NULL,
             first_paid_at = coalesce(first_paid_at, v_now),
             cancel_at_period_end = FALSE,
             updated_at = v_now
       WHERE id = v_sub.id
       RETURNING id, status INTO v_sub_id, v_sub_status;
      PERFORM set_config('app.subscription_paid', '', TRUE);
      v_flagged := FALSE;
    END IF;

    -- Invoice: number minted and row inserted inside this transaction; a failure returns the number.
    -- The timestamp is taken AFTER the number is minted (the counter row lock is held to the end of the
    -- transaction), so number order equals date order.
    v_number := public.subscription_next_invoice_number('TO', v_now);
    v_inv_at := greatest(clock_timestamp(), v_now);
    v_taxable := v_pay.subtotal_paise - v_pay.discount_paise;
    INSERT INTO public.subscription_invoices (
      agency_id, invoice_number, series, fy,
      supplier_legal_name, supplier_address, supplier_gstin, supplier_state_code,
      recipient_name, recipient_address, recipient_gstin, place_of_supply_state_code,
      sac_code, gst_rate_pct, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at
    ) VALUES (
      v_pay.agency_id, v_number, 'TO', substr(v_number, 4, 5),
      v_settings.legal_name, nullif(btrim(coalesce(v_settings.address, '')), ''),
      CASE WHEN v_settings.gst_registered THEN v_settings.gstin END, v_settings.state_code,
      nullif(btrim(coalesce(v_agency.company_name, '')), ''), nullif(btrim(coalesce(v_agency.address, '')), ''),
      CASE WHEN upper(btrim(coalesce(v_agency.gstin, ''))) ~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
                AND left(upper(btrim(v_agency.gstin)), 2) = v_pos
           THEN upper(btrim(v_agency.gstin)) END,
      v_pos,
      v_settings.sac_code, CASE WHEN v_settings.gst_registered THEN 18 ELSE 0 END, v_taxable, v_pay.cgst_paise, v_pay.sgst_paise, v_pay.igst_paise, v_pay.amount::bigint, v_inv_at
    ) RETURNING * INTO v_inv;

    IF v_pay.coupon_code IS NOT NULL AND NOT v_over_limit THEN
      INSERT INTO public.subscription_coupon_redemptions (coupon_code, agency_id, cycle_no, subscription_id, payment_id, redeemed_at)
      VALUES (v_pay.coupon_code, v_pay.agency_id, v_used + 1, v_sub_id, v_pay.id, v_now);
    END IF;

    UPDATE public.payment_history
       SET status = 'success',
           razorpay_payment_id = p_payment_id,
           payment_method = v_method,
           subscription_id = v_sub_id,
           subscription_invoice_id = v_inv.id,
           error_message = NULL,
           metadata = (CASE WHEN coalesce(metadata, '{}'::jsonb) ? 'refusal'
                            THEN (metadata - 'refusal') || jsonb_build_object('prior_refusal', metadata -> 'refusal')
                            ELSE coalesce(metadata, '{}'::jsonb) END)
                      || jsonb_build_object('activation_source', p_source, 'razorpay_method', left(p_method, 32),
                                            'activated_at', v_now, 'coupon_over_limit', v_over_limit)
     WHERE id = v_pay.id;
  EXCEPTION
    WHEN unique_violation THEN
      -- Backstop only: the advisory lock and the replay lookup above make this unreachable in normal operation.
      -- The sub-transaction rolled back the subscription, invoice, number and redemption.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_flagged THEN
        PERFORM set_config('app.subscription_paid', '', TRUE);
      END IF;
      SELECT * INTO v_pay FROM public.payment_history WHERE id = v_pay.id;
      IF v_pay.status = 'success' AND v_pay.razorpay_payment_id IS NOT DISTINCT FROM p_payment_id THEN
        RETURN jsonb_build_object('ok', TRUE, 'replay', TRUE, 'subscription_id', v_pay.subscription_id);
      END IF;
      IF coalesce(v_constraint, '') LIKE '%payment_uidx%' THEN
        PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'payment_id_in_use');
        RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_id_in_use');
      END IF;
      PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'activation_conflict');
      RETURN jsonb_build_object('ok', FALSE, 'error', 'activation_conflict', 'retryable', TRUE);
    WHEN program_limit_exceeded THEN
      -- The invoice number sequence for the year is exhausted.
      PERFORM set_config('app.subscription_paid', '', TRUE);
      PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'invoice_sequence_exhausted',
                                               'ACTIVATION_REFUSED: invoice_sequence_exhausted');
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invoice_sequence_exhausted');
    WHEN invalid_transaction_state THEN
      PERFORM set_config('app.subscription_paid', '', TRUE);
      PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'invalid_transaction_state',
                                               'ACTIVATION_REFUSED: invalid_transaction_state');
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_transaction_state', 'retryable', TRUE);
    WHEN check_violation THEN
      -- The status guard and ledger constraints refuse with check_violation.
      PERFORM set_config('app.subscription_paid', '', TRUE);
      PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'activation_rejected',
                                               'ACTIVATION_REFUSED: activation_rejected');
      RETURN jsonb_build_object('ok', FALSE, 'error', 'activation_rejected');
  END;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'replay', FALSE,
    'subscription_id', v_sub_id,
    'status', v_sub_status,
    'current_period_start', v_start,
    'current_period_end', v_end,
    'invoice_id', v_inv.id,
    'invoice_number', v_inv.invoice_number,
    'amount_paise', v_pay.amount::bigint,
    'coupon_over_limit', v_over_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.subscription_quote_order(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_quote_order(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_create_order(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_create_order(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_activate_payment(text, text, bigint, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_activate_payment(text, text, bigint, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Credit-note guard (from 20261028000000): a rate-0 invoice takes zero-tax credit notes only
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_credit_note_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv public.subscription_invoices%ROWTYPE;
  v_taxable numeric;
  v_cgst numeric;
  v_sgst numeric;
  v_igst numeric;
  v_total numeric;
  v_expect numeric;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'CREDIT_NOTE_ISOLATION: credit notes must be issued under READ COMMITTED.' USING ERRCODE = 'invalid_transaction_state';
  END IF;
  SELECT * INTO v_inv FROM public.subscription_invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CREDIT_NOTE_INVOICE_NOT_FOUND' USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.agency_id IS NOT NULL AND NEW.agency_id <> v_inv.agency_id THEN
    RAISE EXCEPTION 'CREDIT_NOTE_AGENCY_MISMATCH' USING ERRCODE = 'foreign_key_violation';
  END IF;
  NEW.agency_id := v_inv.agency_id;
  IF NEW.issued_at < v_inv.issued_at THEN
    RAISE EXCEPTION 'CREDIT_NOTE_BEFORE_INVOICE' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(sum(taxable_paise), 0), coalesce(sum(cgst_paise), 0), coalesce(sum(sgst_paise), 0),
         coalesce(sum(igst_paise), 0), coalesce(sum(total_paise), 0)
    INTO v_taxable, v_cgst, v_sgst, v_igst, v_total
    FROM public.subscription_credit_notes WHERE invoice_id = NEW.invoice_id;

  v_taxable := v_taxable + NEW.taxable_paise;
  v_cgst := v_cgst + NEW.cgst_paise;
  v_sgst := v_sgst + NEW.sgst_paise;
  v_igst := v_igst + NEW.igst_paise;
  v_total := v_total + NEW.total_paise;

  IF v_total > v_inv.total_paise OR v_taxable > v_inv.taxable_paise
     OR v_cgst > v_inv.cgst_paise OR v_sgst > v_inv.sgst_paise OR v_igst > v_inv.igst_paise THEN
    RAISE EXCEPTION 'CREDIT_NOTE_EXCEEDS_INVOICE' USING ERRCODE = 'check_violation';
  END IF;
  IF v_taxable = v_inv.taxable_paise
     AND (v_cgst <> v_inv.cgst_paise OR v_sgst <> v_inv.sgst_paise OR v_igst <> v_inv.igst_paise) THEN
    RAISE EXCEPTION 'CREDIT_NOTE_TAX_INCOMPLETE' USING ERRCODE = 'check_violation';
  END IF;
  -- A note's own tax is within 1 paise of half-up 18% of its own taxable amount (CGST = SGST is
  -- already enforced by the table); only the closing note, which must exhaust the invoice, is exempt.
  IF v_taxable <> v_inv.taxable_paise THEN
    IF v_inv.gst_rate_pct = 0 THEN
      -- An invoice at rate 0 carries no tax, so its credit notes carry none either.
      IF NEW.cgst_paise <> 0 OR NEW.sgst_paise <> 0 OR NEW.igst_paise <> 0 THEN
        RAISE EXCEPTION 'CREDIT_NOTE_TAX_MISMATCH' USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_inv.supplier_state_code = v_inv.place_of_supply_state_code THEN
      v_expect := trunc((18 * NEW.taxable_paise::numeric + 100) / 200);
      IF abs(NEW.cgst_paise - v_expect) > 1 OR abs(NEW.sgst_paise - v_expect) > 1 OR NEW.igst_paise <> 0 THEN
        RAISE EXCEPTION 'CREDIT_NOTE_TAX_MISMATCH' USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      v_expect := trunc((18 * NEW.taxable_paise::numeric + 50) / 100);
      IF abs(NEW.igst_paise - v_expect) > 1 OR NEW.cgst_paise <> 0 OR NEW.sgst_paise <> 0 THEN
        RAISE EXCEPTION 'CREDIT_NOTE_TAX_MISMATCH' USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.subscription_credit_note_guard() FROM PUBLIC, anon, authenticated, service_role;
