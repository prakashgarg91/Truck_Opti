-- ===========================================================================
-- TO-152 rulings B section 1: subscription write guards (docs/FABLE-RULINGS-2026-11-17-B.md).
--
-- * agency_subscription_assert gains three actions (no new count limits; an unpaid agency can still finish
--   trips and collect its money):
--     record_add (resource 'records')    SB002 in grace, expired, cancelled, none.
--     settle     (resource 'settlement') open in grace; SB002 in expired, cancelled, none.
--     erp        (resource 'erp')        the record_add matrix, plus SB004 SUBSCRIPTION_FEATURE_NOT_IN_PLAN
--                                        when subscription_plans.erp_enabled is false (status is checked first).
-- * subscription_plans.erp_enabled boolean NOT NULL DEFAULT false; true for growth, professional, enterprise.
--   subscription_entitlement_snapshot gains features{erp}.
-- * Each guarded command is re-declared with CREATE OR REPLACE: the body is the latest earlier definition,
--   unchanged except for one PERFORM public.agency_subscription_assert(v_agency_id, '<action>', 0) placed after
--   scope resolution and before any other check or write. SECURITY DEFINER, search_path = public, pg_temp
--   (pg_temp added where the original pinned only 'public') and the original grants are kept.
-- * erp_event_ingest is service-role only and reports typed jsonb: its guard runs after the credential,
--   shape and duplicate-event checks (replays answered first) and immediately before agency_order_import;
--   a refusal is RETURNED as {ok:false, error, code}.
-- * Never guarded: agency_invoice_record_payment, agency_invoice_cancel, agency_consignment_event,
--   agency_consignment_qr, tracking_ping_record, agency_incident_open/update, agency_job_set_status,
--   agency_driver_payout_request, agency_order_cancel, agency_load_plan_cancel, agency_erp_connection_set_status,
--   agency_vehicle_update, agency_truck_unassign_driver, all reads, all subscription commands.
-- * Enforcement stays OFF by default (platform_billing_settings.enforcement_enabled); with it off the guard
--   returns at once, so every existing behaviour is unchanged.
-- ===========================================================================

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS erp_enabled boolean NOT NULL DEFAULT false;

UPDATE public.subscription_plans
   SET erp_enabled = (tier IN ('growth', 'professional', 'enterprise'));

CREATE OR REPLACE FUNCTION public.agency_subscription_assert(
  p_agency_id uuid,
  p_action text,
  p_add integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled boolean := false;
  v_add integer := coalesce(p_add, 1);
  v_resource text;
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_has_sub boolean;
  v_status text;
  v_tier text;
  v_limit integer;
  v_used integer;
  v_month_start timestamptz;
BEGIN
  v_resource := CASE p_action
    WHEN 'truck_add' THEN 'trucks'
    WHEN 'staff_add' THEN 'staff'
    WHEN 'driver_add' THEN 'drivers'
    WHEN 'order_import' THEN 'orders_month'
    WHEN 'dispatch' THEN 'dispatch'
    WHEN 'record_add' THEN 'records'
    WHEN 'settle' THEN 'settlement'
    WHEN 'erp' THEN 'erp'
    ELSE NULL
  END;
  IF v_resource IS NULL OR p_agency_id IS NULL OR v_add < 0 THEN
    RAISE EXCEPTION 'Unknown subscription action or invalid quantity.' USING ERRCODE = '22023';
  END IF;

  -- Enforcement OFF (default, or the settings table does not exist yet): no check at all.
  IF to_regclass('public.platform_billing_settings') IS NULL THEN
    RETURN;
  END IF;
  EXECUTE 'SELECT enforcement_enabled FROM public.platform_billing_settings LIMIT 1' INTO v_enabled;
  IF NOT coalesce(v_enabled, false) THEN
    RETURN;
  END IF;

  -- One lock per agency, held to the end of the transaction, BEFORE anything is read or tallied.
  -- Status-only actions (record_add, settle, erp) count nothing, so they take no lock (no deadlock with
  -- agency_order_import's agreement lock, no per-agency serialisation of every write).
  IF p_action NOT IN ('record_add', 'settle', 'erp') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('sub:' || p_agency_id::text, 0));
  END IF;

  SELECT s.* INTO v_sub
    FROM public.subscriptions s
   WHERE s.agency_id = p_agency_id
   ORDER BY (s.status IN ('trial', 'active', 'past_due', 'grace')) DESC, s.created_at DESC, s.id DESC
   LIMIT 1;
  v_has_sub := FOUND;

  IF v_has_sub THEN
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;
    IF v_plan.id IS NULL THEN
      -- Fail closed: a subscription whose plan row is missing is treated as read-only.
      RAISE EXCEPTION 'SB002 SUBSCRIPTION_READ_ONLY'
        USING ERRCODE = 'SB002',
              DETAIL = jsonb_build_object('code', 'SB002', 'resource', v_resource, 'limit', NULL, 'used', NULL,
                                          'plan', NULL, 'status', v_sub.status)::text;
    END IF;
    v_status := v_sub.status;
    v_tier := v_plan.tier;
  ELSE
    v_status := 'none';
    v_tier := NULL;
  END IF;

  -- Status matrix. trial/active/past_due write and dispatch; grace dispatches and settles (collects money,
  -- closes books) but is read-only for new records; expired/cancelled are read-only and dispatch-locked;
  -- no subscription is read-only. record_add and erp follow the write matrix; settle also opens in grace.
  IF v_status IN ('trial', 'active', 'past_due') THEN
    NULL;
  ELSIF v_status = 'grace' AND p_action IN ('dispatch', 'settle') THEN
    RETURN;
  ELSIF v_status IN ('expired', 'cancelled') AND p_action = 'dispatch' THEN
    RAISE EXCEPTION 'SB003 SUBSCRIPTION_DISPATCH_LOCKED'
      USING ERRCODE = 'SB003',
            DETAIL = jsonb_build_object('code', 'SB003', 'resource', v_resource, 'limit', NULL, 'used', NULL,
                                        'plan', v_tier, 'status', v_status)::text;
  ELSE
    RAISE EXCEPTION 'SB002 SUBSCRIPTION_READ_ONLY'
      USING ERRCODE = 'SB002',
            DETAIL = jsonb_build_object('code', 'SB002', 'resource', v_resource, 'limit', NULL, 'used', NULL,
                                        'plan', v_tier, 'status', v_status)::text;
  END IF;

  -- ERP is a plan feature: the status is checked first (above), then the plan flag.
  IF p_action = 'erp' AND NOT coalesce(v_plan.erp_enabled, false) THEN
    RAISE EXCEPTION 'SB004 SUBSCRIPTION_FEATURE_NOT_IN_PLAN'
      USING ERRCODE = 'SB004',
            DETAIL = jsonb_build_object('code', 'SB004', 'resource', v_resource, 'limit', NULL, 'used', NULL,
                                        'plan', v_tier, 'status', v_status)::text;
  END IF;

  -- The three write-guard actions have no count limit.
  IF p_action IN ('dispatch', 'record_add', 'settle', 'erp') OR v_add = 0 THEN
    RETURN;
  END IF;

  v_limit := coalesce(CASE p_action
    WHEN 'truck_add' THEN v_plan.trucks_limit
    WHEN 'staff_add' THEN v_plan.users_limit
    WHEN 'driver_add' THEN v_plan.drivers_limit
    ELSE v_plan.shipments_monthly
  END, 0);
  IF v_limit = -1 THEN
    RETURN;
  END IF;

  IF p_action = 'truck_add' THEN
    SELECT count(*)::integer INTO v_used FROM public.agency_trucks WHERE agency_id = p_agency_id;
  ELSIF p_action = 'staff_add' THEN
    SELECT (SELECT count(*) FROM public.agency_memberships m
             WHERE m.agency_id = p_agency_id AND m.status = 'active')
         + (SELECT count(*) FROM public.agency_invitations i
             WHERE i.agency_id = p_agency_id AND i.status = 'pending' AND i.expires_at > now())
      INTO v_used;
  ELSIF p_action = 'driver_add' THEN
    SELECT count(*)::integer INTO v_used
      FROM public.agency_driver_employment WHERE agency_id = p_agency_id AND status = 'active';
  ELSE
    v_month_start := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata';
    SELECT count(*)::integer INTO v_used
      FROM public.agency_orders
     WHERE agency_id = p_agency_id
       AND created_at >= v_month_start
       AND created_at < ((v_month_start AT TIME ZONE 'Asia/Kolkata') + interval '1 month') AT TIME ZONE 'Asia/Kolkata';
  END IF;

  IF v_used + v_add > v_limit THEN
    RAISE EXCEPTION 'SB001 SUBSCRIPTION_LIMIT_REACHED'
      USING ERRCODE = 'SB001',
            DETAIL = jsonb_build_object('code', 'SB001', 'resource', v_resource, 'limit', v_limit, 'used', v_used,
                                        'plan', v_tier, 'status', v_status)::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.agency_subscription_assert(uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agency_subscription_assert(uuid, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.agency_subscription_assert(uuid, text, integer) FROM authenticated;

CREATE OR REPLACE FUNCTION public.subscription_entitlement_snapshot(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub public.subscriptions%ROWTYPE;
  v_plan public.subscription_plans%ROWTYPE;
  v_found boolean;
  v_local timestamp;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_status text;
  v_trucks integer;
  v_staff integer;
  v_drivers integer;
  v_orders integer;
  v_enforced boolean := false;
BEGIN
  SELECT * INTO v_sub
    FROM public.subscriptions s
   WHERE s.agency_id = p_agency_id
   ORDER BY (s.status IN ('trial', 'active', 'past_due', 'grace')) DESC, s.created_at DESC, s.id DESC
   LIMIT 1;
  v_found := FOUND;

  IF v_found THEN
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id;
    v_status := v_sub.status;
  ELSE
    v_status := 'none';
  END IF;

  v_local := date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata');
  v_month_start := v_local AT TIME ZONE 'Asia/Kolkata';
  v_month_end := (v_local + interval '1 month') AT TIME ZONE 'Asia/Kolkata';

  SELECT count(*)::int INTO v_trucks FROM public.agency_trucks WHERE agency_id = p_agency_id;
  -- Same as the guard: active memberships plus pending, unexpired invitations.
  SELECT ((SELECT count(*) FROM public.agency_memberships m
            WHERE m.agency_id = p_agency_id AND m.status = 'active')
        + (SELECT count(*) FROM public.agency_invitations i
            WHERE i.agency_id = p_agency_id AND i.status = 'pending' AND i.expires_at > now()))::int
    INTO v_staff;
  SELECT count(*)::int INTO v_drivers FROM public.agency_driver_employment WHERE agency_id = p_agency_id AND status = 'active';
  -- Same as the guard: every order of the IST month, cancelled included.
  SELECT count(*)::int INTO v_orders
    FROM public.agency_orders
   WHERE agency_id = p_agency_id
     AND created_at >= v_month_start AND created_at < v_month_end;

  IF to_regclass('public.platform_billing_settings') IS NOT NULL THEN
    EXECUTE 'SELECT enforcement_enabled FROM public.platform_billing_settings LIMIT 1' INTO v_enforced;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enforcement_enabled', coalesce(v_enforced, false),
    'agency_id', p_agency_id,
    'status', v_status,
    'plan_tier', CASE WHEN v_found THEN v_plan.tier ELSE NULL END,
    'period_end', CASE WHEN v_found THEN v_sub.current_period_end ELSE NULL END,
    'grace_end', CASE WHEN v_found THEN v_sub.grace_end ELSE NULL END,
    'trial_end', CASE WHEN v_found THEN v_sub.trial_end ELSE NULL END,
    'can_write', v_status IN ('trial', 'active', 'past_due'),
    'can_dispatch', v_status IN ('trial', 'active', 'past_due', 'grace'),
    'features', jsonb_build_object('erp', CASE WHEN v_found THEN coalesce(v_plan.erp_enabled, false) ELSE false END),
    'limits', jsonb_build_object(
      'trucks', CASE WHEN v_found THEN v_plan.trucks_limit ELSE 0 END,
      'staff', CASE WHEN v_found THEN v_plan.users_limit ELSE 0 END,
      'drivers', CASE WHEN v_found THEN v_plan.drivers_limit ELSE 0 END,
      'orders_month', CASE WHEN v_found THEN v_plan.shipments_monthly ELSE 0 END
    ),
    'usage', jsonb_build_object(
      'trucks', v_trucks,
      'staff', v_staff,
      'drivers', v_drivers,
      'orders_month', v_orders
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.subscription_entitlement_snapshot(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- agency_consignment_create [record_add]
-- ---------------------------------------------------------------------------
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'record_add', 0);

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

REVOKE ALL ON FUNCTION public.agency_consignment_create(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_consignment_create(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_expense_record [record_add]
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
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'record_add', 0);

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;
  IF left(v_key, 4) = 'svc:' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_key');
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
  IF p_spent_on < ((now() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '5 years')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'date_too_old');
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

REVOKE ALL ON FUNCTION public.agency_expense_record(uuid, text, bigint, date, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_expense_record(uuid, text, bigint, date, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_fuel_fill_record [record_add]
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
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'record_add', 0);

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_required');
  END IF;
  IF left(v_key, 4) = 'svc:' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_key');
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

  IF p_litres IS NULL OR p_litres = 'NaN' OR p_litres < 1 OR p_litres > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_litres');
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 OR p_amount_paise > 100000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;
  IF p_filled_on IS NULL OR p_filled_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'future_date');
  END IF;
  IF p_filled_on < ((now() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '5 years')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'date_too_old');
  END IF;
  IF p_odometer_km IS NULL OR p_odometer_km = 'NaN' OR p_odometer_km < 0 OR p_odometer_km >= 10000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_odometer');
  END IF;

  -- Lock the truck row so concurrent fills cannot both pass the odometer check.
  PERFORM 1 FROM public.agency_trucks t
  WHERE t.id = p_truck_id AND t.agency_id = v_agency_id
  FOR NO KEY UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'truck_not_found');
  END IF;

  SELECT max(f.odometer_km) INTO v_previous
  FROM public.agency_fuel_fills f
  WHERE f.truck_id = p_truck_id AND f.agency_id = v_agency_id;

  IF v_previous IS NOT NULL AND p_odometer_km <= v_previous THEN
    RETURN jsonb_build_object('ok', false, 'error', 'odometer_not_increasing', 'previous_km', v_previous);
  END IF;
  IF v_previous IS NOT NULL AND p_odometer_km - v_previous > 5000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'odometer_jump_too_large', 'previous_km', v_previous);
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

REVOKE ALL ON FUNCTION public.agency_fuel_fill_record(uuid, numeric, numeric, boolean, bigint, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_fuel_fill_record(uuid, numeric, numeric, boolean, bigint, date, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_maintenance_item_upsert [record_add]
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
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'record_add', 0);

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
  IF p_last_service_km IS NOT NULL AND (p_last_service_km = 'NaN' OR p_last_service_km < 0 OR p_last_service_km >= 10000000) THEN
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

REVOKE ALL ON FUNCTION public.agency_maintenance_item_upsert(uuid, text, integer, integer, numeric, date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_maintenance_item_upsert(uuid, text, integer, integer, numeric, date, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_payroll_open_period [record_add]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_open_period(
  p_period_start date,
  p_period_end date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'record_add', 0);

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

REVOKE ALL ON FUNCTION public.agency_payroll_open_period(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_payroll_open_period(date, date, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_driver_rate_set [record_add]
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
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'record_add', 0);

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

REVOKE ALL ON FUNCTION public.agency_driver_rate_set(uuid, bigint, bigint, bigint, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_driver_rate_set(uuid, bigint, bigint, bigint, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_load_plan_save [record_add]
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'record_add', 0);

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

REVOKE ALL ON FUNCTION public.agency_load_plan_save(text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_load_plan_save(text, uuid, jsonb, jsonb, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_invoice_issue [settle]
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

REVOKE ALL ON FUNCTION public.agency_invoice_issue(uuid, jsonb, text, text, integer, boolean, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_invoice_issue(uuid, jsonb, text, text, integer, boolean, boolean, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_payroll_close_period [settle]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_payroll_close_period(
  p_period_start date,
  p_period_end date,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'settle', 0);

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

REVOKE ALL ON FUNCTION public.agency_payroll_close_period(date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_payroll_close_period(date, date, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_payroll_adjust [settle]
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
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'settle', 0);

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

REVOKE ALL ON FUNCTION public.agency_payroll_adjust(uuid, uuid, text, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_payroll_adjust(uuid, uuid, text, bigint, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_maintenance_service_done [settle]
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
SET search_path = public, pg_temp
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

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'settle', 0);

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
  IF p_service_km IS NULL OR p_service_km = 'NaN' OR p_service_km < 0 OR p_service_km >= 10000000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_km');
  END IF;
  IF p_service_on IS NULL OR p_service_on > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'future_date');
  END IF;
  IF p_service_on < ((now() AT TIME ZONE 'Asia/Kolkata')::date - INTERVAL '5 years')::date THEN
    RETURN jsonb_build_object('ok', false, 'error', 'date_too_old');
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

REVOKE ALL ON FUNCTION public.agency_maintenance_service_done(uuid, numeric, date, integer, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_maintenance_service_done(uuid, numeric, date, integer, bigint, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_erp_connection_create [erp]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_erp_connection_create(
  p_client_id uuid,
  p_agreement_id uuid,
  p_name text,
  p_kind text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_key text;
  v_name text;
  v_existing public.agency_erp_connections%ROWTYPE;
  v_agreement public.agency_client_agreements%ROWTYPE;
  v_secret text;
  v_id uuid;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'erp', 0);

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('erp_conn:' || v_agency_id::text, 0));

  SELECT * INTO v_existing
  FROM public.agency_erp_connections
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_existing.client_id = p_client_id AND v_existing.agreement_id = p_agreement_id
       AND v_existing.name = btrim(coalesce(p_name, '')) AND v_existing.kind = p_kind THEN
      RETURN jsonb_build_object('ok', true, 'connection_id', v_existing.id, 'secret', NULL, 'replay', true);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  v_name := btrim(coalesce(p_name, ''));
  IF v_name = '' OR char_length(v_name) > 60 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('csv_drop', 'webhook') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.agency_client_agreements
    WHERE id = p_client_id AND agency_id = v_agency_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'client_not_found');
  END IF;

  SELECT * INTO v_agreement
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_found');
  END IF;
  IF v_agreement.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_active');
  END IF;

  IF EXISTS (SELECT 1 FROM public.agency_erp_connections WHERE agency_id = v_agency_id AND name = v_name) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_exists');
  END IF;

  v_secret := public.agency_erp_new_secret();

  INSERT INTO public.agency_erp_connections (
    agency_id, client_id, agreement_id, name, kind, secret_hash, secret_hint, idempotency_key, created_by
  )
  VALUES (
    v_agency_id, p_client_id, p_agreement_id, v_name, p_kind,
    public.agency_erp_hash(v_secret), right(v_secret, 4), v_key, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'connection_id', v_id, 'secret', v_secret);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_erp_connection_create(uuid, uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_erp_connection_create(uuid, uuid, text, text, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- agency_erp_connection_rotate_secret [erp]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_erp_connection_rotate_secret(
  p_connection_id uuid,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_conn public.agency_erp_connections%ROWTYPE;
  v_secret text;
  v_new_version integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  -- Subscription write guard (rulings B 1): after scope resolution, before any other check or write.
  PERFORM public.agency_subscription_assert(v_agency_id, 'erp', 0);

  SELECT * INTO v_conn
  FROM public.agency_erp_connections
  WHERE id = p_connection_id AND agency_id = v_agency_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'connection_not_found');
  END IF;

  IF v_conn.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'connection_revoked');
  END IF;

  IF v_conn.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_conn.version);
  END IF;

  v_secret := public.agency_erp_new_secret();

  UPDATE public.agency_erp_connections
  SET secret_hash = public.agency_erp_hash(v_secret), secret_hint = right(v_secret, 4), version = version + 1
  WHERE id = p_connection_id
  RETURNING version INTO v_new_version;

  RETURN jsonb_build_object('ok', true, 'secret', v_secret, 'version', v_new_version);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_erp_connection_rotate_secret(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_erp_connection_rotate_secret(uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- erp_event_ingest [erp]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erp_event_ingest(
  p_connection_id uuid,
  p_secret text,
  p_external_event_id text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  c_max_lines CONSTANT integer := 2000;
  v_conn public.agency_erp_connections%ROWTYPE;
  v_found boolean;
  v_hash text;
  v_ext text;
  v_payload_hash text;
  v_event public.agency_erp_events%ROWTYPE;
  v_owner uuid;
  v_prev_claims text;
  v_prev_sub text;
  v_res jsonb;
  v_batch uuid;
  v_problems jsonb;
BEGIN
  -- 1. Credentials. Unknown connection and wrong secret are indistinguishable (same work, same answer).
  v_hash := public.agency_erp_hash(p_secret);
  SELECT * INTO v_conn FROM public.agency_erp_connections WHERE id = p_connection_id;
  v_found := FOUND;
  IF NOT v_found OR p_secret IS NULL OR v_conn.secret_hash IS DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_credentials');
  END IF;

  IF v_conn.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'connection_not_active');
  END IF;

  IF NOT public.agency_is_operational(v_conn.agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_operational');
  END IF;

  -- 2. Request shape, before anything is recorded.
  v_ext := btrim(coalesce(p_external_event_id, ''));
  IF v_ext = '' OR char_length(v_ext) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'event_id_required');
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_lines');
  END IF;
  IF jsonb_array_length(p_lines) > c_max_lines THEN
    RETURN jsonb_build_object('ok', false, 'error', 'too_many_lines');
  END IF;

  IF octet_length(p_lines::text) > 1048576 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'payload_too_large');
  END IF;

  v_payload_hash := public.agency_erp_hash(p_lines::text);

  -- 3. Serialise per connection + event id so duplicate detection cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('erp_ingest:' || p_connection_id::text || ':' || v_ext, 0));

  SELECT * INTO v_event
  FROM public.agency_erp_events
  WHERE connection_id = p_connection_id AND external_event_id = v_ext;
  IF FOUND THEN
    IF v_event.payload_hash <> v_payload_hash THEN
      RETURN jsonb_build_object('ok', false, 'error', 'event_id_reused');
    END IF;
    IF v_event.outcome = 'accepted' THEN
      RETURN jsonb_build_object('ok', true, 'outcome', 'duplicate', 'batch_id', v_event.batch_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'outcome', 'duplicate', 'error', 'invalid_lines', 'problems', v_event.problems);
  END IF;

  -- Subscription write guard (rulings B 1): after replays are answered, before any import. Typed refusal.
  BEGIN
    PERFORM public.agency_subscription_assert(v_conn.agency_id, 'erp', 0);
  EXCEPTION
    WHEN SQLSTATE 'SB002' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'subscription_read_only', 'code', 'SB002');
    WHEN SQLSTATE 'SB004' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'subscription_feature_not_in_plan', 'code', 'SB004');
  END;

  -- 4. Validated, atomic import: agency_order_import, unchanged. It resolves the agency from
  -- auth.uid(), so the agency owner is the acting identity for this transaction only; the
  -- caller's claims are restored straight after.
  SELECT user_id INTO v_owner FROM public.transport_agencies WHERE id = v_conn.agency_id;
  IF v_owner IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_operational');
  END IF;

  v_prev_claims := coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}');
  v_prev_sub := coalesce(current_setting('request.jwt.claim.sub', true), '');
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_owner::text, 'role', 'authenticated')::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', v_owner::text, true);
  BEGIN
    v_res := public.agency_order_import(v_conn.agreement_id, v_payload_hash, 'erp:' || v_ext, p_lines);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('request.jwt.claims', v_prev_claims, true);
    PERFORM set_config('request.jwt.claim.sub', v_prev_sub, true);
    RAISE;
  END;
  PERFORM set_config('request.jwt.claims', v_prev_claims, true);
  PERFORM set_config('request.jwt.claim.sub', v_prev_sub, true);

  IF coalesce((v_res ->> 'ok')::boolean, false) THEN
    v_batch := (v_res ->> 'batch_id')::uuid;
    INSERT INTO public.agency_erp_events (connection_id, agency_id, external_event_id, payload_hash, outcome, problems, batch_id)
    VALUES (p_connection_id, v_conn.agency_id, v_ext, v_payload_hash, 'accepted', NULL, v_batch);
    RETURN jsonb_build_object('ok', true, 'outcome', 'accepted', 'batch_id', v_batch, 'import', v_res);
  END IF;

  IF v_res ->> 'error' = 'idempotency_key_reused' THEN
    -- The same external id was already used on another feed of this agency with different content.
    RETURN jsonb_build_object('ok', false, 'error', 'event_id_reused');
  END IF;

  IF v_res ->> 'error' IS DISTINCT FROM 'invalid_lines' THEN
    -- Transient or state-dependent refusal: typed error, nothing stored, so a corrected retry works.
    RETURN jsonb_build_object('ok', false, 'error', coalesce(v_res ->> 'error', 'import_refused'))
      || CASE WHEN v_res ? 'refs' THEN jsonb_build_object('refs', v_res -> 'refs') ELSE '{}'::jsonb END;
  END IF;

  v_problems := coalesce(v_res -> 'problems', '[]'::jsonb);

  INSERT INTO public.agency_erp_events (connection_id, agency_id, external_event_id, payload_hash, outcome, problems)
  VALUES (p_connection_id, v_conn.agency_id, v_ext, v_payload_hash, 'rejected', v_problems);

  RETURN jsonb_build_object('ok', false, 'outcome', 'rejected', 'error', 'invalid_lines', 'problems', v_problems);
END;
$$;

REVOKE ALL ON FUNCTION public.erp_event_ingest(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_event_ingest(uuid, text, text, jsonb) TO service_role;
