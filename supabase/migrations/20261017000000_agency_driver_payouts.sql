-- Agency driver payout requests as a database command (money code, wave 2 follow-up).
--
-- Before: the Edge function agency-portal-drivers create-payout inserted into driver_payouts with
-- the service role (owner-only, approval + legacy truck link checks, no idempotency key, no upper
-- bound, no staff scope), AND the table carried a direct INSERT policy for the agency owner
-- (agency_inserts_driver_payout), so the same insert was also possible straight through the API.
--
-- After:
--   * agency_driver_payout_request(driver, amount, note, idempotency_key): the ONLY way an agency
--     creates a payout request. SECURITY DEFINER, pinned search_path, no agency id argument, scope
--     'finance' (owner always), operational agency, approved driver with ACTIVE employment in the
--     caller's agency (employment is the authority), amount greater than zero with at most two
--     decimals and at most 500000.00 per request (a deliberate pilot guard rail, revisit with the
--     owner), note up to 500 characters, mandatory idempotency key with exact replay.
--   * the direct agency INSERT policy is dropped; the driver's own withdrawal insert is untouched.
--   * agency reads of payout rows become scope-aware (owner and finance).
--   * driver_payouts gains idempotency_key and requested_by (audit) and a positive-amount check
--     for new rows.
--   * (Opus review, 2026-11-08) the DRIVER's own withdrawal insert is tightened: a driver could insert
--     a row with status 'approved', any agency_id, a forged requested_by or an idempotency key, which
--     the admin mark-paid action would then pay in one click. The policy now allows only a plain
--     pending withdrawal. Replay lookups only consider the agency's own agency_pay rows. The
--     idempotency key is capped at 200 characters. Per-agency daily limits (100 requests, 2000000.00
--     rupees) are enforced inside the command; the rejection reason gets its own column so the
--     agency's note is no longer overwritten.
-- The request only creates a PENDING row; approval and payment stay with the platform admin flow.

ALTER TABLE public.driver_payouts
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_note text;

CREATE UNIQUE INDEX IF NOT EXISTS driver_payouts_agency_idempotency_key
  ON public.driver_payouts (agency_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

DO $chk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.driver_payouts'::regclass AND conname = 'driver_payouts_amount_positive'
  ) THEN
    -- NOT VALID: protects every new row without failing on historical data
    ALTER TABLE public.driver_payouts
      ADD CONSTRAINT driver_payouts_amount_positive CHECK (amount > 0) NOT VALID;
  END IF;
END
$chk$;

DROP POLICY IF EXISTS agency_inserts_driver_payout ON public.driver_payouts;

DROP POLICY IF EXISTS "driver_inserts_own_payout" ON public.driver_payouts;
CREATE POLICY "driver_inserts_own_payout" ON public.driver_payouts
  FOR INSERT TO authenticated
  WITH CHECK (
    driver_id IN (
      SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid()
    )
    AND type = 'withdrawal'
    AND status = 'pending'
    AND agency_id IS NULL
    AND idempotency_key IS NULL
    AND requested_by IS NULL
    AND processed_at IS NULL
    AND rejection_note IS NULL
  );

DROP POLICY IF EXISTS agency_reads_driver_payouts ON public.driver_payouts;
CREATE POLICY agency_reads_driver_payouts ON public.driver_payouts
  FOR SELECT TO authenticated
  USING (
    agency_id IN (SELECT public.agency_caller_agencies(ARRAY['finance']::text[]))
  );

CREATE OR REPLACE FUNCTION public.agency_driver_payout_request(
  p_driver_id uuid,
  p_amount numeric,
  p_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max CONSTANT numeric := 500000.00;
  c_daily_total CONSTANT numeric := 2000000.00;
  c_daily_count CONSTANT integer := 100;
  v_agency_id uuid;
  v_key text;
  v_note text;
  v_existing public.driver_payouts%ROWTYPE;
  v_row public.driver_payouts%ROWTYPE;
  v_today_total numeric;
  v_today_count integer;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['finance']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;
  IF char_length(v_key) > 200 THEN
    RAISE EXCEPTION 'Idempotency key is too long.';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Payout amount must be greater than zero.';
  END IF;
  IF p_amount <> round(p_amount, 2) THEN
    RAISE EXCEPTION 'Payout amount must have at most two decimal places.';
  END IF;
  IF p_amount > c_max THEN
    RAISE EXCEPTION 'Payout amount exceeds the per-request limit.';
  END IF;

  v_note := nullif(btrim(coalesce(p_note, '')), '');
  IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
    RAISE EXCEPTION 'Payout note is too long.';
  END IF;

  -- Replay first: a retry of a request that already succeeded must answer the same way even if
  -- the driver's status changed since.
  SELECT * INTO v_existing
  FROM public.driver_payouts
  WHERE agency_id = v_agency_id AND idempotency_key = v_key AND type = 'agency_pay';

  IF FOUND THEN
    IF v_existing.driver_id = p_driver_id
       AND v_existing.amount = p_amount
       AND v_existing.note IS NOT DISTINCT FROM v_note THEN
      RETURN jsonb_build_object(
        'ok', true,
        'state', 'idempotent_replay',
        'payout', jsonb_build_object('id', v_existing.id, 'amount', v_existing.amount, 'status', v_existing.status, 'requested_at', v_existing.requested_at)
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF NOT public.driver_is_approved_for_assignment(p_driver_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_approved');
  END IF;

  IF NOT public.driver_is_assigned_to_agency(p_driver_id, v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_employed');
  END IF;

  -- Per-agency daily guard rails (the platform admin approval is the other brake). A replay has
  -- already returned above, so it is never counted twice.
  SELECT coalesce(sum(p.amount), 0), count(*)::integer
    INTO v_today_total, v_today_count
  FROM public.driver_payouts p
  WHERE p.agency_id = v_agency_id
    AND p.type = 'agency_pay'
    AND p.status <> 'rejected'
    AND p.requested_at >= date_trunc('day', now());

  IF v_today_count >= c_daily_count OR v_today_total + p_amount > c_daily_total THEN
    RAISE EXCEPTION 'Daily payout limit for this agency reached.';
  END IF;

  BEGIN
    INSERT INTO public.driver_payouts (
      driver_id, agency_id, amount, status, type, note, idempotency_key, requested_by
    ) VALUES (
      p_driver_id, v_agency_id, p_amount, 'pending', 'agency_pay', v_note, v_key, auth.uid()
    )
    RETURNING * INTO v_row;
  EXCEPTION
    WHEN unique_violation THEN
      -- a concurrent call with the same key committed first: answer it as a replay or a reuse
      SELECT * INTO v_existing
      FROM public.driver_payouts
      WHERE agency_id = v_agency_id AND idempotency_key = v_key AND type = 'agency_pay';

      IF FOUND
         AND v_existing.driver_id = p_driver_id
         AND v_existing.amount = p_amount
         AND v_existing.note IS NOT DISTINCT FROM v_note THEN
        RETURN jsonb_build_object(
          'ok', true,
          'state', 'idempotent_replay',
          'payout', jsonb_build_object('id', v_existing.id, 'amount', v_existing.amount, 'status', v_existing.status, 'requested_at', v_existing.requested_at)
        );
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'created',
    'payout', jsonb_build_object('id', v_row.id, 'amount', v_row.amount, 'status', v_row.status, 'requested_at', v_row.requested_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agency_driver_payout_request(uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_driver_payout_request(uuid, numeric, text, text) TO authenticated, service_role;
