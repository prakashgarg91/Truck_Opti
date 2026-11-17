-- Contract audit follow-ups (TO-152, audit rows 3, 6, 15).
--
-- 1. agency_subscription_invoices(): also returns the supplier legal name, supplier address, supplier GSTIN and the
--    recipient address stored on the invoice snapshot, so the billing page can print a complete tax invoice. Values
--    are returned as stored (NULL when the snapshot has none); nothing is invented. Existing keys are unchanged.
-- 2. subscription_entitlement_snapshot(): adds 'enforcement_enabled', read the same way agency_subscription_assert
--    reads it (to_regclass + platform_billing_settings), so the UI opens its gate while the server does not enforce.
-- 3. Order status 'planned': approving a load plan marks the plan's draft orders 'planned'; cancelling (or
--    superseding) the approved plan returns them to 'draft' unless another approved plan still holds a line of the
--    order. agency_order_cancel answers 'order_in_approved_plan' before the version and draft checks.
-- Forward-only; no existing object is dropped.

CREATE OR REPLACE FUNCTION public.agency_subscription_invoices()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_msg text;
  v_invoices jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sign_in_required');
  END IF;

  BEGIN
    v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance', 'viewer']::text[]);
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RETURN jsonb_build_object('ok', false, 'error', CASE v_msg
      WHEN 'Agency approval is required.' THEN 'agency_not_approved'
      WHEN 'Your access scope does not allow this action.' THEN 'forbidden_scope'
      WHEN 'No agency profile found for this account.' THEN 'no_agency'
      WHEN 'Multiple agency profiles found for this account.' THEN 'multiple_agencies'
      ELSE 'no_agency'
    END);
  END;

  SELECT coalesce(jsonb_agg(row_json ORDER BY issued_at DESC, invoice_number DESC), '[]'::jsonb)
    INTO v_invoices
  FROM (
    SELECT i.issued_at,
           i.invoice_number,
           jsonb_build_object(
             'id', i.id,
             'invoice_number', i.invoice_number,
             'issued_at', i.issued_at,
             'taxable_paise', i.taxable_paise,
             'cgst_paise', i.cgst_paise,
             'sgst_paise', i.sgst_paise,
             'igst_paise', i.igst_paise,
             'total_paise', i.total_paise,
             'place_of_supply_state_code', i.place_of_supply_state_code,
             'sac_code', i.sac_code,
             'recipient_name', i.recipient_name,
             'recipient_gstin', i.recipient_gstin,
             'recipient_address', i.recipient_address,
             'supplier_legal_name', i.supplier_legal_name,
             'supplier_address', i.supplier_address,
             'supplier_gstin', i.supplier_gstin,
             'credit_notes', coalesce((
               SELECT jsonb_agg(jsonb_build_object(
                        'id', c.id,
                        'credit_note_number', c.credit_note_number,
                        'issued_at', c.issued_at,
                        'total_paise', c.total_paise
                      ) ORDER BY c.issued_at ASC, c.credit_note_number ASC)
                 FROM public.subscription_credit_notes c
                WHERE c.invoice_id = i.id AND c.agency_id = i.agency_id
             ), '[]'::jsonb)
           ) AS row_json
      FROM public.subscription_invoices i
     WHERE i.agency_id = v_agency_id
     ORDER BY i.issued_at DESC, i.invoice_number DESC
     LIMIT 200
  ) s;

  RETURN jsonb_build_object('ok', true, 'invoices', v_invoices);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_subscription_invoices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_subscription_invoices() TO authenticated;

-- ---------------------------------------------------------------------------

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
-- 'planned' order status, maintained from the plan status transitions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_load_plan_order_status_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.agency_orders o
       SET status = 'planned', version = o.version + 1, updated_at = now()
     WHERE o.agency_id = NEW.agency_id
       AND o.status = 'draft'
       AND o.id IN (
         SELECT ol.order_id
           FROM public.agency_load_plan_lines li
           JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
          WHERE li.plan_id = NEW.id);
  ELSIF OLD.status = 'approved' AND NEW.status IN ('cancelled', 'superseded') THEN
    UPDATE public.agency_orders o
       SET status = 'draft', version = o.version + 1, updated_at = now()
     WHERE o.agency_id = NEW.agency_id
       AND o.status = 'planned'
       AND o.id IN (
         SELECT ol.order_id
           FROM public.agency_load_plan_lines li
           JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
          WHERE li.plan_id = NEW.id)
       AND NOT EXISTS (
         SELECT 1
           FROM public.agency_order_lines ol2
           JOIN public.agency_load_plan_lines li2 ON li2.order_line_id = ol2.id AND li2.agency_id = ol2.agency_id
           JOIN public.agency_load_plans p2 ON p2.id = li2.plan_id AND p2.agency_id = li2.agency_id
          WHERE ol2.order_id = o.id AND ol2.agency_id = o.agency_id
            AND p2.status = 'approved' AND p2.id <> NEW.id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.agency_load_plan_order_status_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agency_load_plans_order_status_sync ON public.agency_load_plans;
CREATE TRIGGER agency_load_plans_order_status_sync
  AFTER UPDATE OF status ON public.agency_load_plans
  FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.agency_load_plan_order_status_sync();

-- ---------------------------------------------------------------------------
-- agency_order_cancel: as 20261025000000 except the approved-plan refusal is answered before the version and
-- draft checks (an order in an approved plan is 'planned', so it would otherwise read 'order_not_draft').
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

  IF EXISTS (
    SELECT 1
    FROM public.agency_order_lines ol
    JOIN public.agency_load_plan_lines li ON li.order_line_id = ol.id AND li.agency_id = ol.agency_id
    JOIN public.agency_load_plans p ON p.id = li.plan_id AND p.agency_id = li.agency_id
    WHERE ol.order_id = p_order_id AND ol.agency_id = v_agency_id AND p.status = 'approved'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_in_approved_plan');
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

REVOKE ALL ON FUNCTION public.agency_order_cancel(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_order_cancel(uuid, integer) TO authenticated, service_role;
