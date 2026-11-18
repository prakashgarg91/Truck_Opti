-- Admin billing ops: read-only functions.
--
-- The admin Billing ops page needs data from tables an admin session cannot read (and must not be able to read
-- directly): razorpay_webhook_events, razorpay_webhook_attempts, subscription_coupons,
-- subscription_coupon_redemptions, and "approved agencies with no live subscription" (subscriptions).
-- Those tables stay closed; four SECURITY DEFINER readers expose exactly the fields the page shows.
--   * admin only (public.is_admin_user() inside); everyone else, including a missing sign-in claim, gets
--     {ok:false,error:'forbidden'}; anon has no EXECUTE.
--   * never the webhook payload, payload hash or error text.
--   * no write function exists.

CREATE OR REPLACE FUNCTION public.admin_agencies_without_subscription()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'name', a.company_name,
           'created_at', a.created_at,
           'owner_user_id', a.user_id,
           'owner_email', u.email
         ) ORDER BY a.created_at, a.id), '[]'::jsonb)
    INTO v_rows
    FROM public.transport_agencies a
    LEFT JOIN public.users u ON u.id = a.user_id
   WHERE a.status = 'approved'
     AND NOT EXISTS (
       SELECT 1 FROM public.subscriptions s
        WHERE s.agency_id = a.id
          AND s.status IN ('trial', 'active', 'past_due', 'grace')
     );

  RETURN jsonb_build_object('ok', TRUE, 'agencies', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_webhook_events(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'forbidden');
  END IF;
  v_limit := COALESCE(p_limit, 100);
  IF v_limit < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_limit');
  END IF;
  v_limit := LEAST(v_limit, 500);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'received_at', t.received_at,
           'event_id', t.event_id,
           'event_type', t.event_type,
           'result', t.result,
           'order_id', t.order_id,
           'payment_id', t.payment_id
         ) ORDER BY t.received_at DESC, t.event_id), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT e.received_at, e.event_id, e.event_type, e.result, e.order_id, e.payment_id
        FROM public.razorpay_webhook_events e
       ORDER BY e.received_at DESC, e.event_id
       LIMIT v_limit
    ) t;

  RETURN jsonb_build_object('ok', TRUE, 'events', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_webhook_attempts(p_limit integer DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'forbidden');
  END IF;
  v_limit := COALESCE(p_limit, 100);
  IF v_limit < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_limit');
  END IF;
  v_limit := LEAST(v_limit, 500);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'event_id', t.event_id,
           'attempt_no', t.attempt_no,
           'sqlstate_or_code', t.sqlstate_or_code,
           'at', t.at
         ) ORDER BY t.at DESC, t.event_id, t.attempt_no), '[]'::jsonb)
    INTO v_rows
    FROM (
      SELECT w.event_id, w.attempt_no, w.sqlstate_or_code, w.at
        FROM public.razorpay_webhook_attempts w
       ORDER BY w.at DESC, w.event_id, w.attempt_no
       LIMIT v_limit
    ) t;

  RETURN jsonb_build_object('ok', TRUE, 'attempts', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_subscription_coupons()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_user() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'forbidden');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', c.code,
           'percent_off', c.percent_off,
           'max_cycles', c.max_cycles,
           'monthly_only', c.monthly_only,
           'valid_until', c.valid_until,
           'max_redemptions', c.max_redemptions,
           'redemption_count', (SELECT count(*)::int FROM public.subscription_coupon_redemptions r WHERE r.coupon_code = c.code)
         ) ORDER BY c.code), '[]'::jsonb)
    INTO v_rows
    FROM public.subscription_coupons c;

  RETURN jsonb_build_object('ok', TRUE, 'coupons', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_agencies_without_subscription() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_webhook_events(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_webhook_attempts(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_subscription_coupons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_agencies_without_subscription() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_webhook_events(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_webhook_attempts(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_subscription_coupons() TO authenticated, service_role;
