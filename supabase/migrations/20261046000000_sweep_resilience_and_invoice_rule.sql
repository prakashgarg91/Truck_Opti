-- Sweep resilience, two-way invoice GST rule, create-order replay rate.
--
-- 1. run_subscription_sweeps: one subscription that cannot be moved (seen on legacy data: a period whose end
--    equals its start violates the NOT VALID subscriptions_period_order_check as soon as the row is updated) made
--    the whole function raise, so every hourly run failed and no agency was ever moved to grace or expired.
--    Each transition now runs row by row inside its own BEGIN ... EXCEPTION block (a savepoint): a failing row is
--    counted and recorded in subscription_sweep_runs.failed / .failures and the sweep goes on. Qualifying rows,
--    transition rules, reminder rules, the advisory lock, the 5000-row batch and idempotency are unchanged; with no
--    failing row the same rows end in the same states as before. A row that failed stays eligible for the next run
--    but is not counted in more_pending (it would otherwise keep the flag true for ever).
-- 2. subscription_invoices: gst_rate_pct = 0 must hold exactly when supplier_gstin is NULL.
-- 3. subscription_create_order: the replay answer now returns gst_rate_pct like the first answer.

-- ---------------------------------------------------------------------------
-- 1. Sweep run record and function
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_sweep_runs ADD COLUMN IF NOT EXISTS failed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.subscription_sweep_runs ADD COLUMN IF NOT EXISTS failures JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.run_subscription_sweeps(p_as_of timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET timezone = 'UTC'
AS $$
DECLARE
  c_batch CONSTANT integer := 5000;
  c_max_failures CONSTANT integer := 50;
  v_started timestamptz := clock_timestamp();
  v_run uuid := gen_random_uuid();
  v_trials integer := 0;
  v_grace integer := 0;
  v_gexp integer := 0;
  v_rem integer := 0;
  v_more boolean := false;
  v_failed integer := 0;
  v_failures jsonb := '[]'::jsonb;
  v_failed_ids uuid[] := ARRAY[]::uuid[];
  v_ids uuid[];
  v_id uuid;
  v_n integer;
  v_result jsonb;
BEGIN
  IF p_as_of IS NULL THEN
    RAISE EXCEPTION 'p_as_of is required' USING ERRCODE = '22004';
  END IF;

  -- API callers (PostgREST arrives as session_user authenticator) may not pass a future date:
  -- that would expire everyone. pg_cron and the migration session run as postgres/supabase_admin.
  IF session_user NOT IN ('postgres', 'supabase_admin')
     AND p_as_of > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'as_of_in_future' USING ERRCODE = '22023';
  END IF;

  -- One sweep at a time; a second caller waits, then finds nothing left to do.
  PERFORM pg_advisory_xact_lock(hashtextextended('subscription_sweeps', 0));

  -- Snapshot of the rows as they are BEFORE this sweep (status, anchor): reminders are
  -- decided from this, then filtered by the post-transition state below. A temp table
  -- (indexed on id) so the live set is read once, not re-parsed per step.
  DROP TABLE IF EXISTS pg_temp.sub_sweep_pre;
  CREATE TEMP TABLE sub_sweep_pre ON COMMIT DROP AS
  SELECT s.id, s.status AS pre_status,
         CASE WHEN s.status = 'trial' THEN s.trial_end ELSE s.current_period_end END AS anchor,
         s.current_period_end AS pe
  FROM public.subscriptions s
  WHERE s.status IN ('trial', 'active', 'past_due', 'grace');
  CREATE UNIQUE INDEX sub_sweep_pre_id_idx ON sub_sweep_pre (id);
  ANALYZE sub_sweep_pre;

  -- Each transition is batched (LIMIT c_batch, SKIP LOCKED); the rows are locked first, then moved one at a time,
  -- each in its own savepoint. Anything left over is reported as more_pending and picked up by the next run.

  -- trial past trial_end -> expired
  SELECT coalesce(array_agg(x.id), ARRAY[]::uuid[]) INTO v_ids FROM (
    SELECT t.id FROM public.subscriptions t
    WHERE t.status = 'trial' AND t.trial_end IS NOT NULL AND t.trial_end <= p_as_of
    ORDER BY t.id LIMIT c_batch FOR UPDATE SKIP LOCKED) x;
  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      UPDATE public.subscriptions s SET status = 'expired' WHERE s.id = v_id AND s.status = 'trial';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_trials := v_trials + v_n;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failed_ids := v_failed_ids || v_id;
      IF jsonb_array_length(v_failures) < c_max_failures THEN
        v_failures := v_failures || jsonb_build_object('subscription_id', v_id, 'transition', 'trial>expired',
                                                      'sqlstate', SQLSTATE, 'message', left(SQLERRM, 200));
      END IF;
    END;
  END LOOP;
  v_more := v_more OR EXISTS (
    SELECT 1 FROM public.subscriptions t
    WHERE t.status = 'trial' AND t.trial_end IS NOT NULL AND t.trial_end <= p_as_of
      AND t.id <> ALL (v_failed_ids));

  -- active/past_due past period end -> grace
  SELECT coalesce(array_agg(x.id), ARRAY[]::uuid[]) INTO v_ids FROM (
    SELECT t.id FROM public.subscriptions t
    WHERE t.status IN ('active', 'past_due') AND t.current_period_end <= p_as_of
    ORDER BY t.id LIMIT c_batch FOR UPDATE SKIP LOCKED) x;
  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      UPDATE public.subscriptions s
      SET status = 'grace',
          grace_end = s.current_period_end + interval '168 hours'
      WHERE s.id = v_id AND s.status IN ('active', 'past_due');
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_grace := v_grace + v_n;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failed_ids := v_failed_ids || v_id;
      IF jsonb_array_length(v_failures) < c_max_failures THEN
        v_failures := v_failures || jsonb_build_object('subscription_id', v_id, 'transition', 'active>grace',
                                                      'sqlstate', SQLSTATE, 'message', left(SQLERRM, 200));
      END IF;
    END;
  END LOOP;
  v_more := v_more OR EXISTS (
    SELECT 1 FROM public.subscriptions t
    WHERE t.status IN ('active', 'past_due') AND t.current_period_end <= p_as_of
      AND t.id <> ALL (v_failed_ids));

  -- Only rows that were already in grace before this sweep (not those just moved there).
  -- A grace row with no grace_end falls back to current_period_end + 168 hours.
  SELECT coalesce(array_agg(x.id), ARRAY[]::uuid[]) INTO v_ids FROM (
    SELECT t.id FROM public.subscriptions t
    JOIN sub_sweep_pre p ON p.id = t.id AND p.pre_status = 'grace'
    WHERE t.status = 'grace'
      AND COALESCE(t.grace_end, t.current_period_end + interval '168 hours') <= p_as_of
    ORDER BY t.id LIMIT c_batch FOR UPDATE OF t SKIP LOCKED) x;
  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      UPDATE public.subscriptions s SET status = 'expired' WHERE s.id = v_id AND s.status = 'grace';
      GET DIAGNOSTICS v_n = ROW_COUNT;
      v_gexp := v_gexp + v_n;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
      v_failed_ids := v_failed_ids || v_id;
      IF jsonb_array_length(v_failures) < c_max_failures THEN
        v_failures := v_failures || jsonb_build_object('subscription_id', v_id, 'transition', 'grace>expired',
                                                      'sqlstate', SQLSTATE, 'message', left(SQLERRM, 200));
      END IF;
    END;
  END LOOP;
  v_more := v_more OR EXISTS (
    SELECT 1 FROM public.subscriptions t
    JOIN sub_sweep_pre p ON p.id = t.id AND p.pre_status = 'grace'
    WHERE t.status = 'grace'
      AND COALESCE(t.grace_end, t.current_period_end + interval '168 hours') <= p_as_of
      AND t.id <> ALL (v_failed_ids));

  -- Reminders: due instant D <= p_as_of < D + 24h, row still live after the transitions.
  WITH cand AS (
    SELECT p.id, p.anchor, k.kind, p.anchor + k.off AS due
    FROM sub_sweep_pre p
    JOIN public.subscriptions s ON s.id = p.id
    CROSS JOIN (VALUES
      ('t_minus_7', interval '-168 hours', false), ('t_minus_3', interval '-72 hours', false),
      ('t_minus_1', interval '-24 hours', false), ('t_zero', interval '0', false),
      ('grace_day_5', interval '120 hours', true)) AS k(kind, off, grace_kind)
    WHERE p.anchor IS NOT NULL
      AND s.status IN ('trial', 'active', 'past_due', 'grace')
      AND s.current_period_end = p.pe
      AND ((k.grace_kind AND p.pre_status = 'grace')
        OR (NOT k.grace_kind AND p.pre_status IN ('trial', 'active', 'past_due')))
  ), ins AS (
    INSERT INTO public.subscription_reminders (subscription_id, period_end, kind)
    SELECT c.id, c.anchor, c.kind FROM cand c
    WHERE c.due <= p_as_of AND p_as_of < c.due + interval '24 hours'
    ON CONFLICT (subscription_id, period_end, kind) DO NOTHING
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_rem FROM ins;

  v_result := jsonb_build_object(
    'ok', true,
    'trials_expired', v_trials,
    'grace_started', v_grace,
    'grace_expired', v_gexp,
    'reminders_created', v_rem,
    'failed', v_failed,
    'more_pending', v_more,
    'run_id', v_run
  );

  INSERT INTO public.subscription_sweep_runs
    (id, as_of, started_at, finished_at, trials_expired, grace_started, grace_expired, reminders_created,
     failed, failures, result)
  VALUES (v_run, p_as_of, v_started, clock_timestamp(), v_trials, v_grace, v_gexp, v_rem,
          v_failed, v_failures, v_result);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.run_subscription_sweeps(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_subscription_sweeps(timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Invoice rule both ways: rate 0 <=> no supplier GSTIN
-- ---------------------------------------------------------------------------
-- Safe to validate: gst_rate_pct is limited to 0 or 18. Registered-mode rows are rate 18 with a supplier GSTIN
-- (the older rule already forced a GSTIN on every rate-18 row) and unregistered-mode rows are rate 0 with a NULL
-- GSTIN (what subscription_activate_payment writes), so every existing row satisfies the equivalence. Only a
-- rate-0 row that carries a GSTIN would fail, and no code path writes one.
ALTER TABLE public.subscription_invoices DROP CONSTRAINT IF EXISTS subscription_invoices_supplier_gstin_rate_chk;
ALTER TABLE public.subscription_invoices ADD CONSTRAINT subscription_invoices_supplier_gstin_rate_chk
  CHECK ((gst_rate_pct = 0) = (supplier_gstin IS NULL));

-- ---------------------------------------------------------------------------
-- 3. subscription_create_order: replay answer carries gst_rate_pct too
-- ---------------------------------------------------------------------------
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
        'gst_rate_pct', coalesce(nullif(v_row.metadata ->> 'gst_rate_pct', '')::integer,
                                 CASE WHEN coalesce((v_row.metadata ->> 'gst_registered')::boolean, TRUE) THEN 18 ELSE 0 END),
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

REVOKE ALL ON FUNCTION public.subscription_create_order(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_create_order(uuid, text, text, text, text) TO service_role;
