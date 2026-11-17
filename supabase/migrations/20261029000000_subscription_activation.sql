-- TO-152 S4: server-side subscription pricing, atomic payment activation and refunds.
--
-- Binding contract: docs/TO-152-rulings.md sections 3, 5, 7 and 8. Nothing here edits an earlier migration.
--
-- Money rules (all enforced in SQL, never by the caller):
--   * Integer paise only. Tax comes from subscription_tax_split (028): same state CGST = SGST =
--     half-up(taxable x 18 / 200), else IGST = half-up(taxable x 18 / 100). Tax is always taken from the
--     stored order snapshot, never as total minus subtotal.
--   * The client sends only {plan, cycle, coupon}. subscription_create_order prices from subscription_plans
--     and stores the full snapshot on payment_history; no amount, price or tax argument exists.
--   * subscription_activate_payment is the single activation path (verify and webhook both call it). One
--     transaction writes subscription + invoice + invoice number + coupon redemption + payment row; any
--     failure rolls the invoice number back. The order row is locked FOR UPDATE under a per-order advisory
--     lock; amount and currency are checked against the stored snapshot (AMOUNT_MISMATCH => payment failed,
--     nothing activated). Replay by the same payment id is {ok:true,replay:true}; a different payment id for
--     an already-paid order is 'order_already_paid'. Renewal starts at greatest(now, current_period_end).
--     The transaction-local flag app.subscription_paid = 'on' is set only inside this function, immediately
--     around the subscription UPDATE, and reset straight after (set_config(..., true)).
--   * subscription_record_refund is idempotent on the refund id (unique), credits proportional tax with
--     CGST = SGST, never exceeds the invoice (the 028 credit-note guard re-checks), marks the payment
--     refunded and cancels the subscription it paid for.
--   * The three money functions (and the read-only quote helper) are SECURITY DEFINER, search_path pinned,
--     EXECUTE revoked from PUBLIC/anon/authenticated and granted to service_role only.
--   * Typed refusals are returned as {ok:false,error:CODE}; a raw unique_violation never escapes: callers
--     serialise on an advisory lock, look the replay up first, and catch unique_violation as a backstop.
--   * Dates and month arithmetic use Asia/Kolkata.
--   * Money never goes missing: every refusal AFTER a Razorpay capture (AMOUNT_MISMATCH, currency, billing, agency,
--     cancelled subscription, order_already_paid, ...) goes through subscription_note_refusal, which stamps
--     metadata {captured_payment_id, refusal, at} on the order row, appends the id to metadata.refused_payment_ids
--     and sets razorpay_payment_id when it is NULL and not used elsewhere, so subscription_record_refund can find
--     the payment. A partial index on metadata ? 'refusal' lets ops list those rows. A refund that Razorpay already
--     processed but that cannot be credited-noted is persisted in the append-only subscription_refund_exceptions.
--   * LEGALITY NOTE (status guard): the subscriptions status-machine guard (subscriptions_guard_update) exempts
--     the definer owner (postgres / supabase_admin). These three functions run as that owner, so the legality
--     of every status change they make rests on this code (the cancelled-is-final rule, the paid flag, the
--     refund-cancels rule), not on the guard.

-- ---------------------------------------------------------------------------
-- 1. Coupons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_coupons (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z0-9_-]{3,32}$'),
  percent_off INTEGER NOT NULL CHECK (percent_off BETWEEN 1 AND 99),
  max_cycles INTEGER NOT NULL CHECK (max_cycles BETWEEN 1 AND 120),
  monthly_only BOOLEAN NOT NULL DEFAULT FALSE,
  valid_until TIMESTAMPTZ,
  max_redemptions INTEGER CHECK (max_redemptions IS NULL OR max_redemptions >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.subscription_coupons (code, percent_off, max_cycles, monthly_only, valid_until, max_redemptions)
VALUES ('FOUNDING50', 50, 3, TRUE, NULL, NULL)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.subscription_coupons ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_coupons FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.subscription_coupons TO service_role;

-- ---------------------------------------------------------------------------
-- 2. payment_history: the order snapshot
-- ---------------------------------------------------------------------------
ALTER TABLE public.payment_history
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES public.subscription_plans (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT,
  ADD COLUMN IF NOT EXISTS subtotal_paise BIGINT,
  ADD COLUMN IF NOT EXISTS discount_paise BIGINT,
  ADD COLUMN IF NOT EXISTS cgst_paise BIGINT,
  ADD COLUMN IF NOT EXISTS sgst_paise BIGINT,
  ADD COLUMN IF NOT EXISTS igst_paise BIGINT,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT REFERENCES public.subscription_coupons (code) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS subscription_invoice_id UUID;

-- Composite FKs: the subscription and the invoice a payment points at must belong to the same agency.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.payment_history'::regclass AND conname = 'payment_history_subscription_tenant_fk') THEN
    ALTER TABLE public.payment_history
      ADD CONSTRAINT payment_history_subscription_tenant_fk
      FOREIGN KEY (subscription_id, agency_id) REFERENCES public.subscriptions (id, agency_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.payment_history'::regclass AND conname = 'payment_history_invoice_tenant_fk') THEN
    ALTER TABLE public.payment_history
      ADD CONSTRAINT payment_history_invoice_tenant_fk
      FOREIGN KEY (subscription_invoice_id, agency_id) REFERENCES public.subscription_invoices (id, agency_id);
  END IF;
  -- A snapshotted order is internally consistent: amount = subtotal - discount + CGST + SGST + IGST.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.payment_history'::regclass AND conname = 'payment_history_snapshot_chk') THEN
    ALTER TABLE public.payment_history
      ADD CONSTRAINT payment_history_snapshot_chk CHECK (
        agency_id IS NULL
        OR (
          plan_id IS NOT NULL
          AND billing_cycle IN ('monthly', 'yearly')
          AND subtotal_paise IS NOT NULL AND subtotal_paise > 0
          AND discount_paise IS NOT NULL AND discount_paise >= 0 AND discount_paise < subtotal_paise
          AND cgst_paise IS NOT NULL AND cgst_paise >= 0
          AND sgst_paise IS NOT NULL AND sgst_paise = cgst_paise
          AND igst_paise IS NOT NULL AND igst_paise >= 0
          AND (cgst_paise = 0 OR igst_paise = 0)
          AND amount::bigint = subtotal_paise - discount_paise + cgst_paise + sgst_paise + igst_paise
          AND currency = 'INR'
          AND razorpay_order_id IS NOT NULL
        )
      );
  END IF;
  -- A successful snapshotted payment always carries the Razorpay payment id and its invoice.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.payment_history'::regclass AND conname = 'payment_history_success_chk') THEN
    ALTER TABLE public.payment_history
      ADD CONSTRAINT payment_history_success_chk CHECK (
        agency_id IS NULL
        OR status <> 'success'
        OR (razorpay_payment_id IS NOT NULL AND subscription_invoice_id IS NOT NULL AND subscription_id IS NOT NULL)
      );
  END IF;
END $$;

-- One order row per Razorpay order and one row per Razorpay payment (snapshotted rows only; legacy rows untouched).
CREATE UNIQUE INDEX IF NOT EXISTS payment_history_order_uidx
  ON public.payment_history (razorpay_order_id) WHERE agency_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS payment_history_payment_uidx
  ON public.payment_history (razorpay_payment_id) WHERE agency_id IS NOT NULL AND razorpay_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_history_by_agency ON public.payment_history (agency_id, created_at DESC) WHERE agency_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Coupon redemptions (append-only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscription_coupon_redemptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  coupon_code TEXT NOT NULL REFERENCES public.subscription_coupons (code) ON DELETE RESTRICT,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  cycle_no INTEGER NOT NULL CHECK (cycle_no >= 1 AND cycle_no <= 120),
  subscription_id UUID NOT NULL,
  payment_id UUID NOT NULL REFERENCES public.payment_history (id) ON DELETE RESTRICT,
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_coupon_redemptions_cycle_key UNIQUE (coupon_code, agency_id, cycle_no),
  CONSTRAINT subscription_coupon_redemptions_payment_key UNIQUE (payment_id),
  CONSTRAINT subscription_coupon_redemptions_subscription_fk
    FOREIGN KEY (subscription_id, agency_id) REFERENCES public.subscriptions (id, agency_id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS subscription_coupon_redemptions_append_only ON public.subscription_coupon_redemptions;
CREATE TRIGGER subscription_coupon_redemptions_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_coupon_redemptions
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS subscription_coupon_redemptions_no_truncate ON public.subscription_coupon_redemptions;
CREATE TRIGGER subscription_coupon_redemptions_no_truncate
  BEFORE TRUNCATE ON public.subscription_coupon_redemptions
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();

ALTER TABLE public.subscription_coupon_redemptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_coupon_redemptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.subscription_coupon_redemptions TO service_role;

-- ---------------------------------------------------------------------------
-- 3b. Refusal ledger support, refund exceptions, snapshot immutability
-- ---------------------------------------------------------------------------
-- Ops query: every order row that holds a captured payment the system refused.
CREATE INDEX IF NOT EXISTS payment_history_refusal_idx
  ON public.payment_history (created_at DESC) WHERE metadata ? 'refusal';

-- A refund Razorpay already processed that could not be recorded as a credit note (append-only, one row per
-- refund id and reason). Ops reconcile these by hand.
CREATE TABLE IF NOT EXISTS public.subscription_refund_exceptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  refund_id TEXT NOT NULL CHECK (btrim(refund_id) <> ''),
  payment_id TEXT NOT NULL CHECK (btrim(payment_id) <> ''),
  payment_row_id UUID,
  agency_id UUID,
  amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
  reason TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_refund_exceptions_key UNIQUE (refund_id, reason)
);

DROP TRIGGER IF EXISTS subscription_refund_exceptions_append_only ON public.subscription_refund_exceptions;
CREATE TRIGGER subscription_refund_exceptions_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_refund_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS subscription_refund_exceptions_no_truncate ON public.subscription_refund_exceptions;
CREATE TRIGGER subscription_refund_exceptions_no_truncate
  BEFORE TRUNCATE ON public.subscription_refund_exceptions
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();

ALTER TABLE public.subscription_refund_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.subscription_refund_exceptions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.subscription_refund_exceptions TO service_role;

-- The order snapshot of a priced (agency) row never changes, for every role including the definer owner.
-- Legacy rows (agency_id IS NULL) are untouched.
CREATE OR REPLACE FUNCTION public.payment_history_snapshot_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.agency_id IS NOT NULL AND (
       NEW.agency_id IS DISTINCT FROM OLD.agency_id
    OR NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.billing_cycle IS DISTINCT FROM OLD.billing_cycle
    OR NEW.subtotal_paise IS DISTINCT FROM OLD.subtotal_paise
    OR NEW.discount_paise IS DISTINCT FROM OLD.discount_paise
    OR NEW.cgst_paise IS DISTINCT FROM OLD.cgst_paise
    OR NEW.sgst_paise IS DISTINCT FROM OLD.sgst_paise
    OR NEW.igst_paise IS DISTINCT FROM OLD.igst_paise
    OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.razorpay_order_id IS DISTINCT FROM OLD.razorpay_order_id
  ) THEN
    RAISE EXCEPTION 'payment_history_snapshot_immutable: the priced order snapshot cannot change.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.payment_history_snapshot_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payment_history_snapshot_guard ON public.payment_history;
CREATE TRIGGER payment_history_snapshot_guard
  BEFORE UPDATE ON public.payment_history
  FOR EACH ROW EXECUTE FUNCTION public.payment_history_snapshot_guard();

-- Records a refusal against the order row without ever losing the captured Razorpay payment id.
-- Internal helper (called only by the money functions, which run as the owner).
CREATE OR REPLACE FUNCTION public.subscription_note_refusal(
  p_row_id uuid,
  p_payment_id text,
  p_refusal text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_row_id IS NULL OR p_payment_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.payment_history h
     SET metadata = coalesce(h.metadata, '{}'::jsonb)
                    || jsonb_build_object('captured_payment_id', p_payment_id, 'refusal', p_refusal,
                                          'at', clock_timestamp())
                    || jsonb_build_object('refused_payment_ids',
                         CASE WHEN coalesce(h.metadata -> 'refused_payment_ids', '[]'::jsonb) ? p_payment_id
                              THEN coalesce(h.metadata -> 'refused_payment_ids', '[]'::jsonb)
                              ELSE coalesce(h.metadata -> 'refused_payment_ids', '[]'::jsonb) || to_jsonb(p_payment_id) END),
         razorpay_payment_id = CASE
           WHEN h.razorpay_payment_id IS NULL
                AND NOT EXISTS (SELECT 1 FROM public.payment_history o
                                 WHERE o.razorpay_payment_id = p_payment_id AND o.agency_id IS NOT NULL AND o.id <> h.id)
           THEN p_payment_id ELSE h.razorpay_payment_id END,
         error_message = CASE WHEN p_error IS NULL THEN h.error_message ELSE left(p_error, 500) END
   WHERE h.id = p_row_id;
END;
$$;
REVOKE ALL ON FUNCTION public.subscription_note_refusal(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- Persists a refund exception (idempotent per refund id and reason); returns its id.
CREATE OR REPLACE FUNCTION public.subscription_note_refund_exception(
  p_refund_id text,
  p_payment_id text,
  p_payment_row_id uuid,
  p_agency_id uuid,
  p_amount_paise bigint,
  p_reason text,
  p_detail jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.subscription_refund_exceptions
    (refund_id, payment_id, payment_row_id, agency_id, amount_paise, reason, detail)
  VALUES (p_refund_id, p_payment_id, p_payment_row_id, p_agency_id, p_amount_paise, p_reason,
          coalesce(p_detail, '{}'::jsonb))
  ON CONFLICT (refund_id, reason) DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.subscription_refund_exceptions WHERE refund_id = p_refund_id AND reason = p_reason;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.subscription_note_refund_exception(text, text, uuid, uuid, bigint, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Quote (read-only pricing; the edge function needs the amount BEFORE it creates the Razorpay order)
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
  IF NOT FOUND OR v_settings.gstin IS NULL OR v_settings.state_code IS NULL OR v_settings.legal_name IS NULL THEN
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
  SELECT * INTO v_split FROM public.subscription_tax_split(v_taxable, v_settings.state_code, v_pos);
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
    'pos_state_code', v_pos
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Order creation (server-side price, one pending payment row, nothing else changes)
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
        'pos_state_code', v_q ->> 'pos_state_code'
      )
    );
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'order_id_conflict');
  END;

  RETURN (v_q - 'owner_user_id') || jsonb_build_object('replay', FALSE, 'order_id', p_razorpay_order_id, 'status', 'pending');
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Activation (the single path for verify and webhook)
-- ---------------------------------------------------------------------------
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
  IF NOT FOUND OR v_settings.gstin IS NULL OR v_settings.state_code IS NULL THEN
    PERFORM public.subscription_note_refusal(v_pay.id, p_payment_id, 'BILLING_NOT_CONFIGURED',
                                             'ACTIVATION_REFUSED: BILLING_NOT_CONFIGURED');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'BILLING_NOT_CONFIGURED');
  END IF;
  v_pos := v_pay.metadata ->> 'pos_state_code';
  v_supplier_state := v_pay.metadata ->> 'supplier_state_code';
  IF v_pos IS NULL OR v_supplier_state IS DISTINCT FROM v_settings.state_code THEN
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
      v_settings.legal_name, nullif(btrim(coalesce(v_settings.address, '')), ''), v_settings.gstin, v_settings.state_code,
      nullif(btrim(coalesce(v_agency.company_name, '')), ''), nullif(btrim(coalesce(v_agency.address, '')), ''),
      CASE WHEN upper(btrim(coalesce(v_agency.gstin, ''))) ~ '^(0[1-9]|[12][0-9]|3[0-8])[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'
                AND left(upper(btrim(v_agency.gstin)), 2) = v_pos
           THEN upper(btrim(v_agency.gstin)) END,
      v_pos,
      v_settings.sac_code, 18, v_taxable, v_pay.cgst_paise, v_pay.sgst_paise, v_pay.igst_paise, v_pay.amount::bigint, v_inv_at
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

-- ---------------------------------------------------------------------------
-- 7. Refund (credit note, payment refunded, subscription cancelled)
-- ---------------------------------------------------------------------------
-- Razorpay has ALREADY moved the money when this runs. Every refusal below therefore also persists a row in
-- subscription_refund_exceptions (append-only, one per refund id and reason) and returns its id, so a refund is
-- never lost just because it cannot be credit-noted.
CREATE OR REPLACE FUNCTION public.subscription_record_refund(
  p_payment_id text,
  p_refund_id text,
  p_amount_paise bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_cn_at timestamptz;
  v_pay public.payment_history%ROWTYPE;
  v_inv public.subscription_invoices%ROWTYPE;
  v_note public.subscription_credit_notes%ROWTYPE;
  v_sub public.subscriptions%ROWTYPE;
  v_s_taxable bigint;
  v_s_cgst bigint;
  v_s_sgst bigint;
  v_s_igst bigint;
  v_s_total bigint;
  v_remaining bigint;
  v_taxable bigint;
  v_cgst bigint;
  v_sgst bigint;
  v_igst bigint;
  v_c bigint;
  v_i bigint;
  v_number text;
  v_constraint text;
  v_exc uuid;
BEGIN
  IF p_payment_id IS NULL OR btrim(p_payment_id) = '' OR p_refund_id IS NULL OR btrim(p_refund_id) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_arguments');
  END IF;
  IF p_amount_paise IS NULL OR p_amount_paise <= 0 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_amount');
  END IF;
  IF p_payment_id !~ '^[A-Za-z0-9_-]{6,64}$' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_payment_id');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('subrefund:' || p_refund_id, 0));

  SELECT * INTO v_pay
    FROM public.payment_history
   WHERE razorpay_payment_id = p_payment_id AND agency_id IS NOT NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    -- A payment the system refused after capture is findable through the refusal ledger.
    SELECT * INTO v_pay
      FROM public.payment_history
     WHERE agency_id IS NOT NULL AND metadata -> 'refused_payment_ids' ? p_payment_id
     ORDER BY created_at DESC, id
     LIMIT 1
     FOR UPDATE;
  END IF;
  IF NOT FOUND THEN
    v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, NULL, NULL, p_amount_paise, 'payment_not_found');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_not_found', 'exception_id', v_exc);
  END IF;

  -- Idempotent on the refund id.
  SELECT * INTO v_note FROM public.subscription_credit_notes WHERE refund_id = p_refund_id;
  IF FOUND THEN
    IF v_note.invoice_id IS NOT DISTINCT FROM v_pay.subscription_invoice_id AND v_note.total_paise = p_amount_paise THEN
      RETURN jsonb_build_object('ok', TRUE, 'replay', TRUE, 'credit_note_id', v_note.id,
        'credit_note_number', v_note.credit_note_number, 'refund_id', p_refund_id,
        'taxable_paise', v_note.taxable_paise, 'cgst_paise', v_note.cgst_paise, 'sgst_paise', v_note.sgst_paise,
        'igst_paise', v_note.igst_paise, 'total_paise', v_note.total_paise);
    END IF;
    RETURN jsonb_build_object('ok', FALSE, 'error', 'refund_id_conflict');
  END IF;

  IF v_pay.status NOT IN ('success', 'refunded') OR v_pay.razorpay_payment_id IS DISTINCT FROM p_payment_id THEN
    -- A payment that was captured but never activated (refused, failed or pending): there is no invoice to credit.
    v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, v_pay.id, v_pay.agency_id, p_amount_paise,
               'payment_not_refundable', jsonb_build_object('order_status', v_pay.status, 'refusal', v_pay.metadata ->> 'refusal'));
    RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_not_refundable', 'exception_id', v_exc);
  END IF;
  IF v_pay.subscription_invoice_id IS NULL THEN
    v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, v_pay.id, v_pay.agency_id, p_amount_paise, 'payment_not_invoiced');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'payment_not_invoiced', 'exception_id', v_exc);
  END IF;

  SELECT * INTO v_inv FROM public.subscription_invoices WHERE id = v_pay.subscription_invoice_id FOR UPDATE;
  SELECT coalesce(sum(taxable_paise), 0), coalesce(sum(cgst_paise), 0), coalesce(sum(sgst_paise), 0),
         coalesce(sum(igst_paise), 0), coalesce(sum(total_paise), 0)
    INTO v_s_taxable, v_s_cgst, v_s_sgst, v_s_igst, v_s_total
    FROM public.subscription_credit_notes WHERE invoice_id = v_inv.id;

  v_remaining := v_inv.total_paise - v_s_total;
  IF p_amount_paise > v_remaining THEN
    v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, v_pay.id, v_pay.agency_id, p_amount_paise,
               'refund_exceeds_payment', jsonb_build_object('remaining_paise', v_remaining));
    RETURN jsonb_build_object('ok', FALSE, 'error', 'refund_exceeds_payment', 'remaining_paise', v_remaining,
                              'exception_id', v_exc);
  END IF;

  IF p_amount_paise = v_remaining THEN
    -- Closing note: takes exactly what is left of every component, so the invoice nets to zero.
    v_taxable := v_inv.taxable_paise - v_s_taxable;
    v_cgst := v_inv.cgst_paise - v_s_cgst;
    v_sgst := v_inv.sgst_paise - v_s_sgst;
    v_igst := v_inv.igst_paise - v_s_igst;
  ELSIF v_inv.supplier_state_code = v_inv.place_of_supply_state_code THEN
    -- Cumulative-target rounding: the tax credited after this note is half-up(refunded-so-far x invoice tax /
    -- invoice total), so a long series of tiny refunds reconciles exactly to the invoice. CGST = SGST; the odd
    -- paisa stays in the taxable value. Falls back to rounding this note on its own when the target is unusable.
    v_c := floor((2 * (v_s_total + p_amount_paise)::numeric * v_inv.cgst_paise + v_inv.total_paise)
                 / (2 * v_inv.total_paise::numeric))::bigint - v_s_cgst;
    IF v_c < 0 OR v_c > v_inv.cgst_paise - v_s_cgst OR p_amount_paise - 2 * v_c <= 0 THEN
      v_c := floor((2 * p_amount_paise::numeric * v_inv.cgst_paise + v_inv.total_paise) / (2 * v_inv.total_paise::numeric))::bigint;
      v_c := least(v_c, v_inv.cgst_paise - v_s_cgst);
    END IF;
    v_cgst := v_c;
    v_sgst := v_c;
    v_igst := 0;
    v_taxable := p_amount_paise - 2 * v_c;
  ELSE
    v_i := floor((2 * (v_s_total + p_amount_paise)::numeric * v_inv.igst_paise + v_inv.total_paise)
                 / (2 * v_inv.total_paise::numeric))::bigint - v_s_igst;
    IF v_i < 0 OR v_i > v_inv.igst_paise - v_s_igst OR p_amount_paise - v_i <= 0 THEN
      v_i := floor((2 * p_amount_paise::numeric * v_inv.igst_paise + v_inv.total_paise) / (2 * v_inv.total_paise::numeric))::bigint;
      v_i := least(v_i, v_inv.igst_paise - v_s_igst);
    END IF;
    v_cgst := 0;
    v_sgst := 0;
    v_igst := v_i;
    v_taxable := p_amount_paise - v_i;
  END IF;
  IF v_taxable <= 0 OR v_cgst < 0 OR v_sgst < 0 OR v_igst < 0 OR v_cgst <> v_sgst
     OR v_taxable + v_cgst + v_sgst + v_igst <> p_amount_paise THEN
    v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, v_pay.id, v_pay.agency_id, p_amount_paise, 'credit_note_unallocatable');
    RETURN jsonb_build_object('ok', FALSE, 'error', 'credit_note_unallocatable', 'exception_id', v_exc);
  END IF;

  BEGIN
    v_number := public.subscription_next_invoice_number('CN', v_now);
    -- Taken after the number is minted so number order equals date order; never before the invoice itself.
    v_cn_at := greatest(clock_timestamp(), v_now, v_inv.issued_at);
    INSERT INTO public.subscription_credit_notes
      (invoice_id, agency_id, credit_note_number, refund_id, taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, issued_at)
    VALUES
      (v_inv.id, v_inv.agency_id, v_number, p_refund_id, v_taxable, v_cgst, v_sgst, v_igst, p_amount_paise, v_cn_at)
    RETURNING * INTO v_note;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      SELECT * INTO v_note FROM public.subscription_credit_notes WHERE refund_id = p_refund_id;
      IF FOUND AND v_note.invoice_id = v_inv.id AND v_note.total_paise = p_amount_paise THEN
        RETURN jsonb_build_object('ok', TRUE, 'replay', TRUE, 'credit_note_id', v_note.id,
          'credit_note_number', v_note.credit_note_number, 'refund_id', p_refund_id);
      END IF;
      RETURN jsonb_build_object('ok', FALSE, 'error', 'refund_id_conflict');
    WHEN check_violation THEN
      v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, v_pay.id, v_pay.agency_id, p_amount_paise, 'credit_note_rejected');
      RETURN jsonb_build_object('ok', FALSE, 'error', 'credit_note_rejected', 'exception_id', v_exc);
    WHEN program_limit_exceeded THEN
      v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, v_pay.id, v_pay.agency_id, p_amount_paise, 'invoice_sequence_exhausted');
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invoice_sequence_exhausted', 'exception_id', v_exc);
    WHEN invalid_transaction_state THEN
      v_exc := public.subscription_note_refund_exception(p_refund_id, p_payment_id, v_pay.id, v_pay.agency_id, p_amount_paise, 'invalid_transaction_state');
      RETURN jsonb_build_object('ok', FALSE, 'error', 'invalid_transaction_state', 'retryable', TRUE, 'exception_id', v_exc);
  END;

  UPDATE public.payment_history
     SET status = 'refunded',
         metadata = coalesce(metadata, '{}'::jsonb)
                    || jsonb_build_object('last_refund_id', p_refund_id, 'refunded_at', v_now)
   WHERE id = v_pay.id;

  -- Cancel the subscription this payment paid for, unless a later paid invoice (one that is not yet fully
  -- credited, ordered by invoice date) has renewed it.
  SELECT * INTO v_sub FROM public.subscriptions WHERE id = v_pay.subscription_id FOR UPDATE;
  IF FOUND AND v_sub.status IN ('trial', 'active', 'past_due', 'grace')
     AND NOT EXISTS (
       SELECT 1
         FROM public.payment_history p2
         JOIN public.subscription_invoices i2 ON i2.id = p2.subscription_invoice_id
        WHERE p2.subscription_id = v_sub.id AND p2.id <> v_pay.id
          AND p2.status IN ('success', 'refunded')
          AND (i2.issued_at, i2.id) > (v_inv.issued_at, v_inv.id)
          AND coalesce((SELECT sum(c.total_paise) FROM public.subscription_credit_notes c WHERE c.invoice_id = i2.id), 0) < i2.total_paise
     ) THEN
    UPDATE public.subscriptions SET status = 'cancelled', cancelled_at = v_now, updated_at = v_now WHERE id = v_sub.id;
    v_sub.status := 'cancelled';
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'replay', FALSE,
    'credit_note_id', v_note.id,
    'credit_note_number', v_note.credit_note_number,
    'refund_id', p_refund_id,
    'taxable_paise', v_note.taxable_paise,
    'cgst_paise', v_note.cgst_paise,
    'sgst_paise', v_note.sgst_paise,
    'igst_paise', v_note.igst_paise,
    'total_paise', v_note.total_paise,
    'subscription_status', v_sub.status
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7b. Support-assisted re-subscription after a cancellation or refund
-- ---------------------------------------------------------------------------
-- A cancelled subscription is final. Support reopens an agency by inserting a fresh 'expired' row (an insert,
-- never a status change, so the status guard is not bypassed); the agency can then buy a plan.
CREATE OR REPLACE FUNCTION public.subscription_support_reopen(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency public.transport_agencies%ROWTYPE;
  v_last public.subscriptions%ROWTYPE;
  v_id uuid;
BEGIN
  IF p_agency_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_not_found');
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('subreopen:' || p_agency_id::text, 0));
  SELECT * INTO v_agency FROM public.transport_agencies WHERE id = p_agency_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_not_found');
  END IF;
  IF v_agency.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'agency_not_operational');
  END IF;
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE agency_id = p_agency_id AND status IN ('trial', 'active', 'past_due', 'grace')) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'subscription_live_exists');
  END IF;
  SELECT * INTO v_last FROM public.subscriptions WHERE agency_id = p_agency_id ORDER BY created_at DESC, id LIMIT 1;
  IF NOT FOUND OR v_last.status <> 'cancelled' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'subscription_not_cancelled');
  END IF;
  INSERT INTO public.subscriptions
    (user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, first_paid_at)
  VALUES
    (v_last.user_id, p_agency_id, v_last.plan_id, 'expired', v_last.billing_cycle, now() - interval '1 day', now(), v_last.first_paid_at)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', TRUE, 'subscription_id', v_id, 'status', 'expired');
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Privileges: service_role only; nothing inherited from PUBLIC or default grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.subscription_quote_order(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_quote_order(uuid, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_create_order(uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_create_order(uuid, text, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_activate_payment(text, text, bigint, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_activate_payment(text, text, bigint, text, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_record_refund(text, text, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_record_refund(text, text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.subscription_support_reopen(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.subscription_support_reopen(uuid) TO service_role;
