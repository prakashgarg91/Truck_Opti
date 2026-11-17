-- TO-152 S3: Razorpay webhook events (rulings section 3).
--
-- razorpay_webhook_events    append-only dedupe ledger, one row per x-razorpay-event-id. No foreign keys, so a
--                            row survives agency deletion. The row is inserted ONCE by subscription_webhook_process
--                            with result and processed_at already set; there is no UPDATE path for any role.
-- subscription_webhook_process(event id, event type, whole event body, sha256 of the raw body)
--                            service_role only. Wraps subscription_activate_payment / subscription_record_refund
--                            (no activation or refund logic is duplicated here).
--     Activation refusals (AMOUNT_MISMATCH, CURRENCY_MISMATCH, order_already_paid, payment_id_in_use,
--     subscription_cancelled, invalid_*, ...) are terminal: result failed_recorded, ok:true, code kept in `error`.
--     BILLING_NOT_CONFIGURED, billing_settings_changed, agency_not_operational and plan_change_blocked may clear
--     later: retryable:true with NO ledger row, bounded by razorpay_webhook_attempts (the 8th attempt is terminal).
--     Success   {ok:true, result: activated | replay | duplicate | orphan | failed_recorded | refunded | past_due | ignored}
--     Refusal   {ok:false, error:<lower_snake code>, retryable:bool}; retryable:true only for a transient failure,
--               in which case NOTHING (event row, payment row, subscription) was written, so the same event id
--               can be delivered again.
-- subscription_verify_webhook_signature(body, signature, secret)
--                            IMMUTABLE HMAC-SHA256 hex check, constant-time compare, internal (service_role only).
--
-- Signature verification is normally done by the Edge function before this call; the SQL helper exists so the same
-- check can be proven against RFC 4231 vectors on a real engine.

-- pgcrypto is present on Supabase. Engines without it (older PGlite harnesses) still apply this migration; there
-- the signature helper raises at call time (hmac missing) and verification stays in the TypeScript layer.
CREATE SCHEMA IF NOT EXISTS extensions;
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto unavailable (%); subscription_verify_webhook_signature will not run on this engine', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Events table (append-only, no FKs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_events (
  event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  order_id TEXT,
  payment_id TEXT,
  payload_sha256 TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ NOT NULL,
  result TEXT NOT NULL,
  error TEXT,
  payload JSONB,   -- set only for non-success results (failed_recorded, orphan) so ids and amounts are never lost
  CONSTRAINT razorpay_webhook_events_pkey PRIMARY KEY (event_id),
  CONSTRAINT razorpay_webhook_events_event_id_chk CHECK (event_id ~ '^[A-Za-z0-9_.:-]{1,128}$'),
  CONSTRAINT razorpay_webhook_events_type_chk CHECK (event_type ~ '^[A-Za-z0-9_.]{1,64}$'),
  CONSTRAINT razorpay_webhook_events_hash_chk CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT razorpay_webhook_events_result_chk CHECK (
    result IN ('activated', 'replay', 'orphan', 'failed_recorded', 'refunded', 'past_due', 'ignored')
  ),
  CONSTRAINT razorpay_webhook_events_error_len_chk CHECK (error IS NULL OR char_length(error) <= 200)
);

CREATE INDEX IF NOT EXISTS razorpay_webhook_events_order_idx
  ON public.razorpay_webhook_events (order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS razorpay_webhook_events_payment_idx
  ON public.razorpay_webhook_events (payment_id) WHERE payment_id IS NOT NULL;

DROP TRIGGER IF EXISTS razorpay_webhook_events_append_only ON public.razorpay_webhook_events;
CREATE TRIGGER razorpay_webhook_events_append_only
  BEFORE UPDATE OR DELETE ON public.razorpay_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS razorpay_webhook_events_no_truncate ON public.razorpay_webhook_events;
CREATE TRIGGER razorpay_webhook_events_no_truncate
  BEFORE TRUNCATE ON public.razorpay_webhook_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();

ALTER TABLE public.razorpay_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.razorpay_webhook_events FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.razorpay_webhook_events TO service_role;

-- One row per failed or retried attempt of an event id (poison-event evidence). Written outside the rolled-back
-- sub-transaction, so it survives. Append-only, no FKs.
CREATE TABLE IF NOT EXISTS public.razorpay_webhook_attempts (
  event_id TEXT NOT NULL,
  attempt_no INTEGER NOT NULL CHECK (attempt_no >= 1),
  sqlstate_or_code TEXT NOT NULL CHECK (char_length(sqlstate_or_code) <= 200),
  at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT razorpay_webhook_attempts_pkey PRIMARY KEY (event_id, attempt_no)
);
DROP TRIGGER IF EXISTS razorpay_webhook_attempts_append_only ON public.razorpay_webhook_attempts;
CREATE TRIGGER razorpay_webhook_attempts_append_only
  BEFORE UPDATE OR DELETE ON public.razorpay_webhook_attempts
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS razorpay_webhook_attempts_no_truncate ON public.razorpay_webhook_attempts;
CREATE TRIGGER razorpay_webhook_attempts_no_truncate
  BEFORE TRUNCATE ON public.razorpay_webhook_attempts
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();
ALTER TABLE public.razorpay_webhook_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.razorpay_webhook_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.razorpay_webhook_attempts TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Signature helper (HMAC-SHA256 of the raw body, lower-case hex, constant-time compare)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_verify_webhook_signature(
  p_body text,
  p_signature text,
  p_secret text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_expected bytea;
  v_given bytea;
  v_diff integer := 0;
  v_i integer;
BEGIN
  IF p_body IS NULL OR p_signature IS NULL OR p_secret IS NULL OR p_secret = '' THEN
    RETURN FALSE;
  END IF;
  IF p_signature !~ '^[0-9A-Fa-f]{64}$' THEN
    RETURN FALSE;
  END IF;
  v_expected := extensions.hmac(convert_to(p_body, 'UTF8'), convert_to(p_secret, 'UTF8'), 'sha256');
  v_given := decode(lower(p_signature), 'hex');
  -- Both are exactly 32 bytes: fold every byte difference, no early exit.
  FOR v_i IN 0..31 LOOP
    v_diff := v_diff | (get_byte(v_expected, v_i) # get_byte(v_given, v_i));
  END LOOP;
  RETURN v_diff = 0;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. The webhook processor
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_webhook_process(
  p_event_id text,
  p_event_type text,
  p_payload jsonb,
  p_payload_sha256 text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text;
  v_existing public.razorpay_webhook_events%ROWTYPE;
  v_pay jsonb;
  v_ord jsonb;
  v_ref jsonb;
  v_amt jsonb;
  v_cur jsonb;
  v_order_id text;
  v_payment_id text;
  v_refund_id text;
  v_amount bigint;
  v_currency text;
  v_method text;
  v_result text;
  v_error text;
  v_act jsonb;
  v_row public.payment_history%ROWTYPE;
  v_sub_id uuid;
  v_constraint text;
  v_attempts integer;
  v_final boolean;
  v_code text;
  v_o1 text;
  v_o2 text;
BEGIN
  -- ---- Sanity: typed refusals, nothing recorded -------------------------------------------------------------
  IF p_event_id IS NULL OR p_event_id !~ '^[A-Za-z0-9_.:-]{1,128}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_event_id', 'retryable', FALSE);
  END IF;
  IF p_event_type IS NULL OR p_event_type !~ '^[A-Za-z0-9_.]{1,64}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_event_type', 'retryable', FALSE);
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_payload', 'retryable', FALSE);
  END IF;
  IF octet_length(p_payload::text) > 262144 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'payload_too_large', 'retryable', FALSE);
  END IF;
  IF p_payload_sha256 IS NULL OR lower(p_payload_sha256) !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_payload_hash', 'retryable', FALSE);
  END IF;
  v_hash := lower(p_payload_sha256);
  IF jsonb_typeof(p_payload -> 'event') = 'string' AND (p_payload ->> 'event') <> p_event_type THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'event_type_mismatch', 'retryable', FALSE);
  END IF;

  v_pay := p_payload #> '{payload,payment,entity}';
  v_ord := p_payload #> '{payload,order,entity}';
  v_ref := p_payload #> '{payload,refund,entity}';
  IF (v_pay IS NOT NULL AND jsonb_typeof(v_pay) <> 'object')
     OR (v_ord IS NOT NULL AND jsonb_typeof(v_ord) <> 'object')
     OR (v_ref IS NOT NULL AND jsonb_typeof(v_ref) <> 'object') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_payload', 'retryable', FALSE);
  END IF;

  IF v_pay IS NOT NULL THEN
    v_amt := v_pay -> 'amount';
    IF v_amt IS NULL OR jsonb_typeof(v_amt) <> 'number'
       OR (v_amt #>> '{}')::numeric <> trunc((v_amt #>> '{}')::numeric)
       OR (v_amt #>> '{}')::numeric < 0 OR (v_amt #>> '{}')::numeric > 9007199254740991 THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_amount', 'retryable', FALSE);
    END IF;
    v_cur := v_pay -> 'currency';
    IF v_cur IS NULL OR jsonb_typeof(v_cur) <> 'string' OR (v_cur #>> '{}') !~ '^[A-Za-z]{3}$' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_currency', 'retryable', FALSE);
    END IF;
  END IF;
  IF v_ref IS NOT NULL THEN
    v_amt := v_ref -> 'amount';
    IF v_amt IS NULL OR jsonb_typeof(v_amt) <> 'number'
       OR (v_amt #>> '{}')::numeric <> trunc((v_amt #>> '{}')::numeric)
       OR (v_amt #>> '{}')::numeric < 0 OR (v_amt #>> '{}')::numeric > 9007199254740991 THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_amount', 'retryable', FALSE);
    END IF;
    v_cur := v_ref -> 'currency';
    IF v_cur IS NOT NULL AND jsonb_typeof(v_cur) <> 'null'
       AND (jsonb_typeof(v_cur) <> 'string' OR (v_cur #>> '{}') !~ '^[A-Za-z]{3}$') THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_currency', 'retryable', FALSE);
    END IF;
  END IF;

  -- ---- Dedupe: advisory lock first, then the replay lookup --------------------------------------------------
  PERFORM pg_advisory_xact_lock(hashtextextended('rzpevt:' || p_event_id, 0));

  SELECT * INTO v_existing FROM public.razorpay_webhook_events WHERE event_id = p_event_id;
  IF FOUND THEN
    IF v_existing.payload_sha256 = v_hash THEN
      RETURN jsonb_build_object('ok', TRUE, 'result', 'duplicate', 'event_id', p_event_id,
                                'original_result', v_existing.result);
    END IF;
    RETURN jsonb_build_object('ok', FALSE, 'error', 'event_id_reused', 'retryable', FALSE);
  END IF;

  SELECT count(*) INTO v_attempts FROM public.razorpay_webhook_attempts WHERE event_id = p_event_id;
  v_final := v_attempts >= 7;   -- this call is the 8th attempt: it must end in a terminal ledger row

  -- ---- Processing: everything below rolls back together on a transient failure ------------------------------
  BEGIN
    -- Entity fields (non-string values are treated as absent).
    v_order_id := CASE WHEN jsonb_typeof(v_ord -> 'id') = 'string' THEN v_ord ->> 'id' END;
    IF v_order_id IS NULL OR btrim(v_order_id) = '' THEN
      v_order_id := CASE WHEN jsonb_typeof(v_pay -> 'order_id') = 'string' THEN v_pay ->> 'order_id' END;
    END IF;
    v_o1 := CASE WHEN jsonb_typeof(v_ord -> 'id') = 'string' THEN nullif(btrim(v_ord ->> 'id'), '') END;
    v_o2 := CASE WHEN jsonb_typeof(v_pay -> 'order_id') = 'string' THEN nullif(btrim(v_pay ->> 'order_id'), '') END;
    v_order_id := left(nullif(btrim(coalesce(v_order_id, '')), ''), 200);

    IF p_event_type IN ('payment.captured', 'order.paid', 'payment.failed') THEN
      v_payment_id := left(CASE WHEN jsonb_typeof(v_pay -> 'id') = 'string' THEN v_pay ->> 'id' END, 200);
    ELSIF p_event_type = 'refund.processed' THEN
      v_payment_id := left(CASE WHEN jsonb_typeof(v_ref -> 'payment_id') = 'string' THEN v_ref ->> 'payment_id' END, 200);
      v_refund_id := CASE WHEN jsonb_typeof(v_ref -> 'id') = 'string' THEN v_ref ->> 'id' END;
      v_order_id := NULL;
    ELSE
      v_payment_id := left(CASE WHEN jsonb_typeof(v_pay -> 'id') = 'string' THEN v_pay ->> 'id' END, 200);
    END IF;

    IF p_event_type IN ('payment.captured', 'order.paid') THEN
      IF v_pay IS NULL THEN
        v_result := 'failed_recorded';
        v_error := 'missing_payment_entity';
      ELSIF v_order_id IS NULL THEN
        v_result := 'orphan';
        v_error := 'missing_order_id';
      ELSIF v_o1 IS NOT NULL AND v_o2 IS NOT NULL AND v_o1 <> v_o2 THEN
        v_result := 'failed_recorded';
        v_error := 'order_id_mismatch';
      ELSE
        v_amount := (v_pay ->> 'amount')::numeric::bigint;
        v_currency := upper(v_pay ->> 'currency');
        v_method := CASE WHEN jsonb_typeof(v_pay -> 'method') = 'string' THEN v_pay ->> 'method' ELSE '' END;
        v_act := public.subscription_activate_payment(v_order_id, v_payment_id, v_amount, v_currency, v_method, 'webhook');
        IF coalesce((v_act ->> 'ok')::boolean, FALSE) THEN
          v_result := CASE WHEN coalesce((v_act ->> 'replay')::boolean, FALSE) THEN 'replay' ELSE 'activated' END;
        ELSIF coalesce((v_act ->> 'retryable')::boolean, FALSE) THEN
          RAISE EXCEPTION 'webhook_retry:activation_retryable' USING ERRCODE = 'P0001';
        ELSIF v_act ->> 'error' = 'order_not_found' THEN
          v_result := 'orphan';
        ELSIF v_act ->> 'error' IN ('BILLING_NOT_CONFIGURED', 'billing_settings_changed', 'agency_not_operational', 'plan_change_blocked')
              AND NOT v_final THEN
          -- May clear later: roll back the refusal notes too and let Razorpay retry (bounded by the attempts table).
          RAISE EXCEPTION 'webhook_retry:%', (v_act ->> 'error') USING ERRCODE = 'P0001';
        ELSE
          v_result := 'failed_recorded';
          v_error := left(coalesce(v_act ->> 'error', 'activation_refused'), 200);
        END IF;
      END IF;

    ELSIF p_event_type = 'payment.failed' THEN
      IF v_pay IS NULL OR v_order_id IS NULL THEN
        v_result := 'orphan';
        v_error := 'missing_order_id';
      ELSE
        -- Same per-order lock as activation, so a failure and a late capture queue instead of racing.
        PERFORM pg_advisory_xact_lock(hashtextextended('subpay:' || v_order_id, 0));
        SELECT * INTO v_row
          FROM public.payment_history
         WHERE razorpay_order_id = v_order_id AND agency_id IS NOT NULL
         FOR UPDATE;
        IF NOT FOUND THEN
          v_result := 'orphan';
        ELSIF v_row.status IN ('success', 'refunded') THEN
          v_result := 'ignored';
          v_error := 'order_already_paid';
        ELSE
          UPDATE public.payment_history
             SET status = 'failed',
                 error_message = CASE WHEN error_message ~ '^(AMOUNT|CURRENCY)_MISMATCH' THEN error_message
                   ELSE left('PAYMENT_FAILED: ' || coalesce(
                   CASE WHEN jsonb_typeof(v_pay -> 'error_code') = 'string' THEN v_pay ->> 'error_code' END, 'unknown'), 500) END,
                 metadata = coalesce(metadata, '{}'::jsonb)
                            || jsonb_build_object('last_failed_payment_id', v_payment_id, 'failed_at', clock_timestamp())
           WHERE id = v_row.id;
          -- Only a LIVE RENEWAL moves to past_due (active -> past_due is a legal S1 edge). A first purchase
          -- (trial, expired, grace, none) is left alone, and a failure never cancels.
          SELECT id INTO v_sub_id
            FROM public.subscriptions
           WHERE agency_id = v_row.agency_id AND status = 'active'
           FOR UPDATE;
          IF FOUND THEN
            UPDATE public.subscriptions SET status = 'past_due', updated_at = clock_timestamp() WHERE id = v_sub_id;
            v_result := 'past_due';
          ELSE
            v_result := 'failed_recorded';
            v_error := 'payment_failed';
          END IF;
        END IF;
      END IF;

    ELSIF p_event_type = 'refund.processed' THEN
      IF v_ref IS NULL OR v_refund_id IS NULL OR v_payment_id IS NULL THEN
        v_result := 'failed_recorded';
        v_error := 'missing_refund_entity';
      ELSE
        v_act := public.subscription_record_refund(v_payment_id, v_refund_id, (v_ref ->> 'amount')::numeric::bigint);
        IF coalesce((v_act ->> 'ok')::boolean, FALSE) THEN
          v_result := 'refunded';
        ELSIF coalesce((v_act ->> 'retryable')::boolean, FALSE) THEN
          RAISE EXCEPTION 'webhook_retry:refund_retryable' USING ERRCODE = 'P0001';
        ELSIF v_act ->> 'error' = 'payment_not_found' THEN
          v_result := 'orphan';
          v_error := 'payment_not_found';
        ELSE
          -- The refund already left Razorpay; subscription_record_refund keeps it in subscription_refund_exceptions.
          v_result := 'failed_recorded';
          v_error := left(coalesce(v_act ->> 'error', 'refund_refused'), 200);
        END IF;
      END IF;

    ELSE
      v_result := 'ignored';
    END IF;

    INSERT INTO public.razorpay_webhook_events
      (event_id, event_type, order_id, payment_id, payload_sha256, processed_at, result, error, payload)
    VALUES
      (p_event_id, p_event_type, v_order_id, v_payment_id, v_hash, clock_timestamp(), v_result, v_error,
       CASE WHEN v_result IN ('failed_recorded', 'orphan') THEN p_payload END);
  EXCEPTION
    WHEN unique_violation THEN
      -- Backstop: the advisory lock makes this unreachable unless another writer bypassed it. The sub-transaction
      -- rolled back every effect of this attempt; answer from the committed row.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      PERFORM set_config('app.subscription_paid', '', TRUE);
      IF coalesce(v_constraint, '') = 'razorpay_webhook_events_pkey' THEN
        SELECT * INTO v_existing FROM public.razorpay_webhook_events WHERE event_id = p_event_id;
        IF FOUND THEN
          IF v_existing.payload_sha256 = v_hash THEN
            RETURN jsonb_build_object('ok', TRUE, 'result', 'duplicate', 'event_id', p_event_id,
                                      'original_result', v_existing.result);
          END IF;
          RETURN jsonb_build_object('ok', FALSE, 'error', 'event_id_reused', 'retryable', FALSE);
        END IF;
      END IF;
      v_code := 'unique_violation:' || coalesce(v_constraint, '');
    WHEN OTHERS THEN
      -- Any other database error is treated as transient: the sub-transaction rolled back the event row, the
      -- payment row and the subscription, so Razorpay's retry of the same event id starts clean. The raw SQL
      -- message is never returned.
      PERFORM set_config('app.subscription_paid', '', TRUE);
      v_code := CASE WHEN SQLERRM LIKE 'webhook_retry:%' THEN substr(SQLERRM, 15) ELSE SQLSTATE END;
  END;

  -- Reached only from a handler. The sub-transaction is rolled back; the attempt is recorded OUTSIDE it.
  IF v_code IS NOT NULL THEN
    SELECT count(*) + 1 INTO v_attempts FROM public.razorpay_webhook_attempts WHERE event_id = p_event_id;
    INSERT INTO public.razorpay_webhook_attempts (event_id, attempt_no, sqlstate_or_code)
    VALUES (p_event_id, v_attempts, left(v_code, 200));
    IF v_attempts >= 8 THEN
      -- Poison event: terminal ledger row (with the body) so Razorpay stops retrying and ops can reconcile.
      INSERT INTO public.razorpay_webhook_events
        (event_id, event_type, order_id, payment_id, payload_sha256, processed_at, result, error, payload)
      VALUES (p_event_id, p_event_type, v_order_id, v_payment_id, v_hash, clock_timestamp(), 'failed_recorded',
              left(v_code, 200), p_payload);
      RETURN jsonb_build_object('ok', TRUE, 'result', 'failed_recorded', 'event_id', p_event_id, 'error', left(v_code, 200));
    END IF;
    RETURN jsonb_build_object('ok', FALSE, 'error', 'transient_failure', 'retryable', TRUE);
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'result', v_result, 'event_id', p_event_id,
                            'order_id', v_order_id, 'payment_id', v_payment_id, 'error', v_error);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Privileges: service_role only
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.subscription_webhook_process(text, text, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_webhook_process(text, text, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Abandoned checkout: release a pending order (so it stops reserving a coupon cycle)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_cancel_pending_order(p_razorpay_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.payment_history%ROWTYPE;
BEGIN
  IF p_razorpay_order_id IS NULL OR btrim(p_razorpay_order_id) = '' OR char_length(p_razorpay_order_id) > 200 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_order_id');
  END IF;
  -- Same per-order lock as activation: a cancel and a late capture queue instead of racing.
  PERFORM pg_advisory_xact_lock(hashtextextended('subpay:' || p_razorpay_order_id, 0));
  SELECT * INTO v_row
    FROM public.payment_history
   WHERE razorpay_order_id = p_razorpay_order_id AND agency_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'order_not_found');
  END IF;
  IF v_row.status = 'pending' THEN
    UPDATE public.payment_history
       SET status = 'failed',
           error_message = 'CANCELLED: checkout abandoned',
           metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('cancelled', TRUE, 'cancelled_at', clock_timestamp())
     WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', TRUE, 'result', 'cancelled');
  END IF;
  IF v_row.status = 'failed' AND coalesce((v_row.metadata ->> 'cancelled')::boolean, FALSE) THEN
    RETURN jsonb_build_object('ok', TRUE, 'result', 'already_cancelled');
  END IF;
  -- paid, refunded or failed for another reason: never touched.
  RETURN jsonb_build_object('ok', TRUE, 'result', 'not_pending', 'status', v_row.status);
END;
$$;

REVOKE ALL ON FUNCTION public.subscription_cancel_pending_order(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_cancel_pending_order(text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_verify_webhook_signature(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_verify_webhook_signature(text, text, text) TO service_role;
