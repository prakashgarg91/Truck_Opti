-- Subscription invoice read path and usage/guard agreement (TO-152, contract audit findings 3, 7, 8).
--
-- 1. agency_subscription_invoices(): the agency's own GST subscription invoices (with their credit notes) for the
--    owner and active finance / viewer members. A command, not a table grant, so the response carries only what the
--    invoice itself shows (no supplier ledger internals, refund ids or agency ids). The table RLS stays as it is
--    (finance + owner); this RPC is the read path used by the billing page. Forward-only and additive.
-- 2. subscription_entitlement_snapshot(): usage now counts exactly what agency_subscription_assert counts
--    (same predicates), so the usage bar can never disagree with the limit refusal:
--      * orders_month: every order created in the IST month (cancelled orders included, as the guard does);
--      * staff: active memberships plus pending, unexpired invitations.

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
-- Entitlement snapshot: usage predicates identical to agency_subscription_assert (20261027).
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

  RETURN jsonb_build_object(
    'ok', true,
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
