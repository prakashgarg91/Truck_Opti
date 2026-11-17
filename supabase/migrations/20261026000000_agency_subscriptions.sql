-- TO-152 S1: agency-keyed subscriptions, trial rules, entitlement read model.
--
-- Binding contract: docs/TO-152-rulings.md sections 1 and 7. Entitlement follows the TENANT (the agency),
-- never the purchasing user. This migration only ALTERs the old user-keyed tables (no old migration is
-- edited) and does not enforce limits yet (S2 adds the guards behind platform_billing_settings).
--
-- What it does:
--   * subscriptions: + agency_id (FK transport_agencies), grace_end, first_paid_at, version; user_id becomes
--     the nullable PURCHASER (FK now ON DELETE SET NULL so a deleted purchaser never deletes the tenant's
--     billing history); subscriptions_user_id_key dropped; status CHECK trial|active|past_due|grace|expired|
--     cancelled ('paused' -> 'cancelled'); one live subscription per agency (partial unique index).
--   * Backfill via transport_agencies.user_id: several agencies -> oldest approved; none -> row kept with
--     agency_id NULL (never entitles). Every ambiguity is logged to the append-only
--     subscription_backfill_conflicts; no legacy row is deleted or rewritten except the paused status.
--   * subscription_plans: drivers_limit = 2 x trucks_limit (-1 stays unlimited); price_yearly = 10 x monthly.
--   * subscription_trial_claims (append-only, UNIQUE per agency, GSTIN and normalised phone) and
--     agency_subscription_start_trial().
--   * agency_subscription_entitlement() (any member scope, no argument), agency_subscription_state(uuid)
--     (service_role only) and the four legacy user-level RPCs re-pointed to the agency row (same signatures
--     and caller-bound behaviour; users with no agency keep the old user-keyed behaviour).
--
-- Entitlement reflects the STORED status. Time-based transitions (trial end, period end, grace end) belong
-- to the S5 sweeps; this migration never infers a status from a clock.

-- ---------------------------------------------------------------------------
-- 1. Plans
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscription_plans ADD COLUMN IF NOT EXISTS drivers_limit INTEGER;

UPDATE public.subscription_plans
   SET drivers_limit = CASE WHEN trucks_limit = -1 THEN -1 ELSE trucks_limit * 2 END
 WHERE drivers_limit IS NULL;

ALTER TABLE public.subscription_plans ALTER COLUMN drivers_limit SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.subscription_plans'::regclass AND conname = 'subscription_plans_drivers_limit_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_drivers_limit_check CHECK (drivers_limit = -1 OR drivers_limit >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.subscription_plans'::regclass AND conname = 'subscription_plans_prices_check'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD CONSTRAINT subscription_plans_prices_check CHECK (price_monthly >= 0 AND price_yearly >= 0);
  END IF;
END $$;

-- Seed fix (ruling 1): yearly = 10 x monthly, in paise (499000 / 1999000 / 4999000 / 14999000).
UPDATE public.subscription_plans
   SET price_yearly = price_monthly * 10
 WHERE price_yearly <> price_monthly * 10;

-- ---------------------------------------------------------------------------
-- 2. subscriptions: columns, status set, purchaser FK
-- ---------------------------------------------------------------------------
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS agency_id UUID REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS grace_end TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.subscriptions'::regclass AND conname = 'subscriptions_version_check'
  ) THEN
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_version_check CHECK (version >= 1);
  END IF;
END $$;

-- The purchaser is no longer the tenant key: nullable, unique dropped, FK no longer cascades the billing row.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_user_id_key;
ALTER TABLE public.subscriptions ALTER COLUMN user_id DROP NOT NULL;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.subscriptions'::regclass
       AND contype = 'f'
       AND confrelid = 'auth.users'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users (id) ON DELETE SET NULL;

-- Status set: drop whichever old status CHECK exists, move 'paused' to 'cancelled', add the new CHECK.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
     WHERE conrelid = 'public.subscriptions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.subscriptions DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

UPDATE public.subscriptions SET status = 'cancelled' WHERE status = 'paused';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trial', 'active', 'past_due', 'grace', 'expired', 'cancelled'));

-- Composite-FK target for child rows (invoices, redemptions, claims) that must agree on the tenant.
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_tenant_key UNIQUE (id, agency_id);

-- ---------------------------------------------------------------------------
-- 3. Append-only audit tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.subscription_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only: % is not allowed.', TG_TABLE_NAME, TG_OP
    USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.subscription_append_only_guard() FROM PUBLIC, anon, authenticated;

-- Conflicts found while moving legacy user-keyed rows onto agencies. No FK on subscription_id: an audit row
-- must outlive whatever happens to the subscription it describes.
CREATE TABLE IF NOT EXISTS public.subscription_backfill_conflicts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription_id UUID NOT NULL,
  user_id UUID,
  reason TEXT NOT NULL CHECK (reason IN ('multiple_agencies', 'no_agency', 'live_collision')),
  candidate_agency_ids UUID[] NOT NULL DEFAULT '{}',
  chosen_agency_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One claim per agency, per GSTIN and per normalised phone (last 10 digits). Append-only: a claim is the
-- anti-abuse memory, so it also survives the agency (FK RESTRICT) and the claimant account (no FK).
CREATE TABLE IF NOT EXISTS public.subscription_trial_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id UUID NOT NULL REFERENCES public.transport_agencies (id) ON DELETE RESTRICT,
  subscription_id UUID,
  gstin_norm TEXT CHECK (gstin_norm IS NULL OR (gstin_norm = upper(btrim(gstin_norm)) AND gstin_norm <> '')),
  phone_norm TEXT CHECK (phone_norm IS NULL OR phone_norm ~ '^[0-9]{1,10}$'),
  claimed_by UUID,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subscription_trial_claims_agency_key UNIQUE (agency_id),
  CONSTRAINT subscription_trial_claims_gstin_key UNIQUE (gstin_norm),
  CONSTRAINT subscription_trial_claims_phone_key UNIQUE (phone_norm),
  CONSTRAINT subscription_trial_claims_subscription_fk
    FOREIGN KEY (subscription_id, agency_id)
    REFERENCES public.subscriptions (id, agency_id) ON DELETE RESTRICT
);

DROP TRIGGER IF EXISTS subscription_backfill_conflicts_append_only ON public.subscription_backfill_conflicts;
CREATE TRIGGER subscription_backfill_conflicts_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_backfill_conflicts
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS subscription_backfill_conflicts_no_truncate ON public.subscription_backfill_conflicts;
CREATE TRIGGER subscription_backfill_conflicts_no_truncate
  BEFORE TRUNCATE ON public.subscription_backfill_conflicts
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();

DROP TRIGGER IF EXISTS subscription_trial_claims_append_only ON public.subscription_trial_claims;
CREATE TRIGGER subscription_trial_claims_append_only
  BEFORE UPDATE OR DELETE ON public.subscription_trial_claims
  FOR EACH ROW EXECUTE FUNCTION public.subscription_append_only_guard();
DROP TRIGGER IF EXISTS subscription_trial_claims_no_truncate ON public.subscription_trial_claims;
CREATE TRIGGER subscription_trial_claims_no_truncate
  BEFORE TRUNCATE ON public.subscription_trial_claims
  FOR EACH STATEMENT EXECUTE FUNCTION public.subscription_append_only_guard();

ALTER TABLE public.subscription_backfill_conflicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_trial_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.subscription_backfill_conflicts, public.subscription_trial_claims FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.subscription_backfill_conflicts, public.subscription_trial_claims TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Backfill (row by row so nothing is lost and every ambiguity is logged)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_cands uuid[];
  v_chosen uuid;
  v_reason text;
  v_reasons text[];
  v_agency public.transport_agencies%ROWTYPE;
  v_digits text;
  v_gstin text;
  v_phone text;
  v_live text[] := ARRAY['trial', 'active', 'past_due', 'grace'];
BEGIN
  FOR r IN
    SELECT id, user_id, status FROM public.subscriptions WHERE agency_id IS NULL ORDER BY created_at, id
  LOOP
    v_chosen := NULL;
    v_reason := NULL;
    v_reasons := '{}';

    SELECT array_agg(ta.id ORDER BY ta.created_at NULLS LAST, ta.id)
      INTO v_cands
      FROM public.transport_agencies ta
     WHERE r.user_id IS NOT NULL AND ta.user_id = r.user_id;

    SELECT ta.id INTO v_chosen
      FROM public.transport_agencies ta
     WHERE r.user_id IS NOT NULL AND ta.user_id = r.user_id AND ta.status = 'approved'
     ORDER BY ta.created_at NULLS LAST, ta.id
     LIMIT 1;

    IF v_chosen IS NULL AND v_cands IS NOT NULL THEN
      v_chosen := v_cands[1];
    END IF;

    IF v_chosen IS NULL THEN
      v_reason := 'no_agency';
      v_reasons := array_append(v_reasons, 'no_agency'::text);
    ELSIF cardinality(v_cands) > 1 THEN
      v_reason := 'multiple_agencies';
      v_reasons := array_append(v_reasons, 'multiple_agencies'::text);
    END IF;

    IF v_chosen IS NOT NULL AND r.status = ANY (v_live) AND EXISTS (
      SELECT 1 FROM public.subscriptions o
       WHERE o.agency_id = v_chosen AND o.id <> r.id AND o.status = ANY (v_live)
    ) THEN
      v_reason := 'live_collision';
      v_reasons := array_append(v_reasons, 'live_collision'::text);
      v_chosen := NULL;
    END IF;

    IF v_chosen IS NOT NULL THEN
      UPDATE public.subscriptions SET agency_id = v_chosen WHERE id = r.id;

      -- An attached agency has had a subscription, so it has used its one trial: record the claim
      -- (same normalisation as agency_subscription_start_trial; conflicts are the point of the table).
      SELECT * INTO v_agency FROM public.transport_agencies WHERE id = v_chosen;
      v_gstin := nullif(upper(btrim(COALESCE(v_agency.gstin, ''))), '');
      v_digits := regexp_replace(COALESCE(v_agency.contact_phone, ''), '[^0-9]', '', 'g');
      v_phone := CASE WHEN length(v_digits) >= 10 THEN right(v_digits, 10) ELSE NULL END;
      INSERT INTO public.subscription_trial_claims (agency_id, subscription_id, gstin_norm, phone_norm, claimed_by)
      VALUES (v_chosen, r.id, v_gstin, v_phone, r.user_id)
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_reason IS NOT NULL THEN
      INSERT INTO public.subscription_backfill_conflicts
        (subscription_id, user_id, reason, candidate_agency_ids, chosen_agency_id, details)
      VALUES
        (r.id, r.user_id, v_reason, COALESCE(v_cands, '{}'), v_chosen,
         jsonb_build_object('status', r.status, 'reasons', to_jsonb(v_reasons),
                            'policy', 'oldest approved agency, else oldest agency'));
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Indexes, tenant immutability, versioning, RLS
-- ---------------------------------------------------------------------------
-- Shape CHECKs. Added NOT VALID (enforced for every new/updated row), then validated only when the
-- backfilled legacy rows already satisfy them.
ALTER TABLE public.subscriptions
  -- NOT added: status<>'trial' OR trial_end IS NOT NULL and status<>'grace' OR grace_end IS NOT NULL (battery S01.08/09/11 insert such rows).
  ADD CONSTRAINT subscriptions_period_order_check CHECK (current_period_end > current_period_start) NOT VALID;

DO $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['subscriptions_period_order_check'] LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.subscriptions VALIDATE CONSTRAINT %I', c);
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'legacy rows violate %; left NOT VALID', c;
    END;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_one_live_per_agency
  ON public.subscriptions (agency_id)
  WHERE status IN ('trial', 'active', 'past_due', 'grace');

CREATE INDEX IF NOT EXISTS subscriptions_by_agency ON public.subscriptions (agency_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_by_purchaser ON public.subscriptions (user_id);

CREATE OR REPLACE FUNCTION public.subscriptions_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.agency_id IS NOT NULL AND NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
    RAISE EXCEPTION 'A subscription cannot move to another agency.' USING ERRCODE = '23514';
  END IF;
  -- Status machine (rulings section 1 and 4). Superuser sessions (fixtures, migrations) are exempt; every API
  -- role, service_role included, is bound. A paid order (the S3/S4 activation function) sets the
  -- transaction-local flag app.subscription_paid = 'on', which is what allows the "paid" edges.
  IF NEW.status IS DISTINCT FROM OLD.status AND current_user NOT IN ('postgres', 'supabase_admin') THEN
    IF OLD.status = 'cancelled' THEN
      RAISE EXCEPTION 'A cancelled subscription cannot change status.' USING ERRCODE = '23514';
    END IF;
    IF NEW.status = 'cancelled' AND OLD.status IN ('trial', 'active', 'past_due', 'grace') THEN
      NULL;
    ELSIF (OLD.status, NEW.status) IN (
      ('trial', 'active'), ('trial', 'expired'),
      ('active', 'past_due'), ('active', 'grace'),
      ('past_due', 'grace'), ('grace', 'expired')
    ) THEN
      NULL;
    ELSIF NEW.status = 'active' AND OLD.status IN ('past_due', 'grace', 'expired')
          AND COALESCE(current_setting('app.subscription_paid', true), '') = 'on' THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'Subscription status change % -> % is not allowed.', OLD.status, NEW.status
        USING ERRCODE = '23514';
    END IF;
  END IF;

  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.subscriptions_guard_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS subscriptions_guard_update ON public.subscriptions;
CREATE TRIGGER subscriptions_guard_update
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.subscriptions_guard_update();

DROP POLICY IF EXISTS "Users can view own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can create own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can update own subscription" ON public.subscriptions;
DROP POLICY IF EXISTS subscriptions_select_tenant ON public.subscriptions;
CREATE POLICY subscriptions_select_tenant ON public.subscriptions
  FOR SELECT TO authenticated
  USING (
    (agency_id IS NULL AND user_id = auth.uid())
    OR agency_id IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]))
  );

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.subscriptions FROM PUBLIC, anon, authenticated;

-- Billing identifiers (razorpay_*, payment_method_id) and the purchaser user_id are not for every member:
-- authenticated gets column-level SELECT on the rest. agency_subscription_entitlement() is the read path.
-- (select('*') from a client now fails with permission denied; RLS still scopes the rows.)
REVOKE SELECT ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end,
              trial_end, grace_end, first_paid_at, version, cancel_at_period_end, cancelled_at,
              created_at, updated_at)
  ON public.subscriptions TO authenticated;

-- usage_tracking's owner-read policy used to subquery subscriptions.user_id as the caller; with user_id no
-- longer selectable that would fail, so the same purchaser test moves into a definer helper (behaviour kept).
CREATE OR REPLACE FUNCTION public.subscription_usage_visible(p_subscription_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.id = p_subscription_id AND s.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.subscription_usage_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.subscription_usage_visible(uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can view own usage" ON public.usage_tracking;
CREATE POLICY "Users can view own usage" ON public.usage_tracking
  FOR SELECT TO authenticated
  USING (public.subscription_usage_visible(subscription_id));

-- ---------------------------------------------------------------------------
-- 6. Entitlement read model
-- ---------------------------------------------------------------------------
-- Internal builder: no caller checks (callers do those), not granted to any API role.
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
  SELECT count(*)::int INTO v_staff FROM public.agency_memberships WHERE agency_id = p_agency_id AND status = 'active';
  SELECT count(*)::int INTO v_drivers FROM public.agency_driver_employment WHERE agency_id = p_agency_id AND status = 'active';
  SELECT count(*)::int INTO v_orders
    FROM public.agency_orders
   WHERE agency_id = p_agency_id AND status <> 'cancelled'
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

CREATE OR REPLACE FUNCTION public.agency_subscription_entitlement()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  RETURN public.subscription_entitlement_snapshot(v_agency_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_subscription_state(p_agency_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_agency_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.transport_agencies WHERE id = p_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_found');
  END IF;
  RETURN public.subscription_entitlement_snapshot(p_agency_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Trial
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agency_subscription_start_trial()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owned integer;
  v_owned_ok integer;
  v_agency public.transport_agencies%ROWTYPE;
  v_gstin text;
  v_phone text;
  v_digits text;
  v_plan_id uuid;
  v_sub_id uuid;
  v_trial_end timestamptz;
  v_constraint text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::int, count(*) FILTER (WHERE status = 'approved')::int
    INTO v_owned, v_owned_ok
    FROM public.transport_agencies WHERE user_id = v_uid;

  IF v_owned = 0 THEN
    IF EXISTS (SELECT 1 FROM public.agency_memberships WHERE user_id = v_uid AND status = 'active') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
    END IF;
    RAISE EXCEPTION 'No agency profile found for this account.';
  END IF;
  IF v_owned_ok = 0 THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;
  IF v_owned_ok > 1 THEN
    RAISE EXCEPTION 'Multiple agency profiles found for this account.';
  END IF;

  SELECT * INTO v_agency FROM public.transport_agencies WHERE user_id = v_uid AND status = 'approved';

  -- Same per-agency lock the S2 limit guard uses, taken before any lookup so replays serialise.
  PERFORM pg_advisory_xact_lock(hashtextextended('sub:' || v_agency.id::text, 0));

  -- Identity: the anti-abuse key must be a real GSTIN and/or a phone that normalises to exactly 10 digits.
  -- A present-but-malformed identifier is refused (it would never collide with a real claim); with neither,
  -- there is nothing to key the one-trial rule on.
  v_gstin := nullif(upper(btrim(COALESCE(v_agency.gstin, ''))), '');
  v_digits := regexp_replace(COALESCE(v_agency.contact_phone, ''), '[^0-9]', '', 'g');
  v_phone := CASE WHEN length(v_digits) >= 10 THEN right(v_digits, 10) ELSE NULL END;

  IF (v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$')
     OR (v_digits <> '' AND v_phone IS NULL)
     OR (v_gstin IS NULL AND v_phone IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'identity_required');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.subscription_trial_claims c
     WHERE c.agency_id = v_agency.id
        OR (v_gstin IS NOT NULL AND c.gstin_norm = v_gstin)
        OR (v_phone IS NOT NULL AND c.phone_norm = v_phone)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'trial_already_claimed');
  END IF;

  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE agency_id = v_agency.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'subscription_exists');
  END IF;

  SELECT id INTO v_plan_id FROM public.subscription_plans WHERE tier = 'starter' AND is_active IS NOT FALSE;
  IF v_plan_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'plan_unavailable');
  END IF;

  v_trial_end := now() + interval '14 days';
  v_sub_id := gen_random_uuid();

  BEGIN
    INSERT INTO public.subscriptions
      (id, user_id, agency_id, plan_id, status, billing_cycle, current_period_start, current_period_end, trial_end)
    VALUES
      (v_sub_id, v_uid, v_agency.id, v_plan_id, 'trial', 'monthly', now(), v_trial_end, v_trial_end);

    INSERT INTO public.subscription_trial_claims (agency_id, subscription_id, gstin_norm, phone_norm, claimed_by)
    VALUES (v_agency.id, v_sub_id, v_gstin, v_phone, v_uid);
  EXCEPTION WHEN unique_violation THEN
    -- The subtransaction (subscription insert included) is rolled back; reply with a typed result.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint = 'subscriptions_one_live_per_agency' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'subscription_exists');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'trial_already_claimed');
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'agency_id', v_agency.id,
    'subscription_id', v_sub_id,
    'status', 'trial',
    'plan_tier', 'starter',
    'trial_end', v_trial_end
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8. Legacy user-level RPCs: same signatures and caller-bound guard, now resolved through the agency row.
--    A user who owns or staffs an agency reads that agency's subscription; a user with no agency keeps the
--    old purchaser-keyed row.
-- ---------------------------------------------------------------------------
-- p_write = false: read paths (owner, or any active member scope). p_write = true: usage-writing paths, which
-- resolve only the owner's agency or dispatcher / fleet_manager scopes. Both require an operational agency.
-- A row with no agency entitles only a user who owns no agency and holds no active membership.
CREATE OR REPLACE FUNCTION public.subscription_row_for_user(p_user_id uuid, p_statuses text[], p_write boolean DEFAULT false)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id
    FROM public.subscriptions s
   WHERE s.status = ANY (p_statuses)
     AND (
       s.agency_id IN (
         SELECT ta.id FROM public.transport_agencies ta
          WHERE ta.user_id = p_user_id AND public.agency_is_operational(ta.id)
         UNION
         SELECT m.agency_id
           FROM public.agency_memberships m
           JOIN public.transport_agencies ta2 ON ta2.id = m.agency_id
          WHERE m.user_id = p_user_id AND m.status = 'active'
            AND public.agency_is_operational(m.agency_id)
            AND (NOT p_write OR m.scope = ANY (ARRAY['dispatcher', 'fleet_manager']::text[]))
       )
       OR (
         s.agency_id IS NULL AND s.user_id = p_user_id
         AND NOT EXISTS (SELECT 1 FROM public.transport_agencies o WHERE o.user_id = p_user_id)
         AND NOT EXISTS (SELECT 1 FROM public.agency_memberships am WHERE am.user_id = p_user_id AND am.status = 'active')
       )
     )
   ORDER BY (s.agency_id IS NOT NULL) DESC, s.created_at DESC, s.id DESC
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.subscriptions s
     WHERE s.id = public.subscription_row_for_user(p_user_id, ARRAY['active', 'trial']::text[])
       AND s.current_period_end > NOW()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_plan(p_user_id uuid)
RETURNS TABLE (
  plan_name text,
  tier text,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT sp.name, sp.tier, s.status, s.current_period_end
    FROM public.subscriptions s
    JOIN public.subscription_plans sp ON s.plan_id = sp.id
   WHERE s.id = public.subscription_row_for_user(p_user_id, ARRAY['active', 'trial']::text[]);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_usage_limit(p_user_id uuid, p_resource text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_id uuid;
  v_limit integer;
  v_used integer;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  v_sub_id := public.subscription_row_for_user(p_user_id, ARRAY['active']::text[]);

  SELECT
    CASE p_resource
      WHEN 'shipments' THEN sp.shipments_monthly
      WHEN 'api_calls' THEN sp.api_calls_monthly
      WHEN 'sms' THEN sp.sms_included
      WHEN 'maps' THEN sp.maps_requests_monthly
    END INTO v_limit
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON s.plan_id = sp.id
  WHERE s.id = v_sub_id;

  IF v_limit = -1 THEN RETURN TRUE; END IF;

  SELECT
    CASE p_resource
      WHEN 'shipments' THEN ut.shipments_used
      WHEN 'api_calls' THEN ut.api_calls_used
      WHEN 'sms' THEN ut.sms_sent
      WHEN 'maps' THEN ut.maps_requests
    END INTO v_used
  FROM public.usage_tracking ut
  WHERE ut.subscription_id = v_sub_id
    AND ut.period_start <= NOW()
    AND ut.period_end > NOW()
  ORDER BY ut.period_start DESC
  LIMIT 1;

  RETURN COALESCE(v_used, 0) < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_usage(p_user_id uuid, p_resource text, p_amount integer DEFAULT 1)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sub_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Usage and plan RPCs are caller-bound to the authenticated user.'
      USING ERRCODE = '42501';
  END IF;

  IF p_resource IS NULL OR p_resource NOT IN ('shipments', 'api_calls', 'sms', 'maps') THEN
    RAISE EXCEPTION 'Unknown usage resource.' USING ERRCODE = '22023';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Usage amount must be between 1 and 1000.' USING ERRCODE = '22023';
  END IF;

  -- Write path: owner or dispatcher / fleet_manager only (a viewer or finance member cannot move counters).
  v_sub_id := public.subscription_row_for_user(p_user_id, ARRAY['active', 'trial']::text[], true);

  UPDATE public.usage_tracking ut
  SET
    shipments_used = CASE WHEN p_resource = 'shipments' THEN shipments_used + p_amount ELSE shipments_used END,
    api_calls_used = CASE WHEN p_resource = 'api_calls' THEN api_calls_used + p_amount ELSE api_calls_used END,
    sms_sent = CASE WHEN p_resource = 'sms' THEN sms_sent + p_amount ELSE sms_sent END,
    maps_requests = CASE WHEN p_resource = 'maps' THEN maps_requests + p_amount ELSE maps_requests END,
    updated_at = NOW()
  WHERE ut.subscription_id = v_sub_id
    AND ut.period_start <= NOW()
    AND ut.period_end > NOW();
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Privileges: revoke from PUBLIC and the API roles first, then grant explicitly.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.subscription_entitlement_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.subscription_row_for_user(uuid, text[], boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_subscription_entitlement() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.agency_subscription_start_trial() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agency_subscription_state(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_active_subscription(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_plan(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_usage_limit(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.increment_usage(uuid, text, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.agency_subscription_entitlement() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_subscription_start_trial() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agency_subscription_state(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_plan(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_usage_limit(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_usage(uuid, text, integer) TO authenticated;
