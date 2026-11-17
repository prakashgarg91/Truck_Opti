-- ===========================================================================
-- TO-152 S2: subscription limits (docs/TO-152-rulings.md section 2).
--
-- * public.agency_subscription_assert(p_agency_id, p_action, p_add): the internal guard. Not granted to any
--   API role; it is called only from the SECURITY DEFINER commands below.
-- * Typed errors, SQLSTATE = MESSAGE prefix, DETAIL is JSON {code,resource,limit,used,plan,status}:
--     SB001 SUBSCRIPTION_LIMIT_REACHED, SB002 SUBSCRIPTION_READ_ONLY, SB003 SUBSCRIPTION_DISPATCH_LOCKED.
-- * Enforcement is read from platform_billing_settings.enforcement_enabled through to_regclass (that table
--   is created by the NEXT migration, 20261028000000). A missing table or a false flag means OFF: the guard
--   returns at once and every command behaves exactly as before. The flag is also the rollback switch.
-- * Race safety: one transaction-scoped advisory lock per agency, taken BEFORE any row is read or tallied.
--   Usage is always derived from live rows; there are no counters.
-- * Month boundaries are Asia/Kolkata.
-- * Lock order is uniform: the per-agency 'sub:' advisory lock FIRST, then row locks. The lock-only helper
--   public.agency_subscription_lock(agency) is called at the START of agency_job_assign_driver,
--   agency_member_accept and agency_driver_invitation_accept (before their job/invitation/employment
--   FOR UPDATE), matching reserve_fleet_assignment. The guard re-takes the same lock (re-entrant).
-- * LAUNCH NOTE: an agency with NO subscription row is read-only and dispatch-locked (SB002) once enforcement
--   is ON. Every agency must start a trial or buy a plan BEFORE enforcement_enabled is switched on.
-- * agency_order_import: the guard runs AFTER line validation by design (replay safety: an idempotent replay
--   or an invalid payload is answered before any limit can trip).
-- * A seat already counted (add = 0, e.g. accepting a pending invitation) skips the limit comparison and only
--   gets the status checks, so it can still be accepted after a downgrade.
-- * The nine commands below are re-declared with CREATE OR REPLACE (grants are kept). Each body is the
--   latest earlier definition, unchanged except for the guard call, placed before the first write and
--   after any idempotent-replay answer so a retry never trips a limit.
-- ===========================================================================

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
  PERFORM pg_advisory_xact_lock(hashtextextended('sub:' || p_agency_id::text, 0));

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

  -- Status matrix. trial/active/past_due write and dispatch; grace dispatches but is read-only;
  -- expired/cancelled are read-only and dispatch-locked; no subscription is read-only.
  IF v_status IN ('trial', 'active', 'past_due') THEN
    NULL;
  ELSIF v_status = 'grace' AND p_action = 'dispatch' THEN
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

  IF p_action = 'dispatch' OR v_add = 0 THEN
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

CREATE OR REPLACE FUNCTION public.agency_subscription_lock(p_agency_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_agency_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('sub:' || p_agency_id::text, 0));
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.agency_subscription_lock(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agency_subscription_lock(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.agency_subscription_lock(uuid) FROM authenticated;

-- ---------------------------------------------------------------------------
-- Guarded commands (latest earlier definitions plus the guard call)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.agency_vehicle_create(
  p_rc_number text,
  p_vehicle_type text,
  p_insurance_expiry date DEFAULT NULL,
  p_fitness_expiry date DEFAULT NULL,
  p_permit_expiry date DEFAULT NULL,
  p_puc_expiry date DEFAULT NULL,
  p_payload_kg numeric DEFAULT NULL,
  p_body_length_m numeric DEFAULT NULL,
  p_body_width_m numeric DEFAULT NULL,
  p_body_height_m numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_catalog public.trucks%ROWTYPE;
  v_inserted public.agency_trucks%ROWTYPE;
  v_existing public.agency_trucks%ROWTYPE;
BEGIN
  IF p_rc_number IS NULL OR btrim(p_rc_number) = '' THEN
    RAISE EXCEPTION 'RC number is required.';
  END IF;

  IF p_vehicle_type IS NULL OR btrim(p_vehicle_type) = '' THEN
    RAISE EXCEPTION 'Vehicle type is required.';
  END IF;

  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['fleet_manager']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_catalog FROM public.trucks WHERE code = p_vehicle_type;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown vehicle type.';
  END IF;

  -- TO-152 S2 subscription guard. A replayed RC number adds no truck, so only a new RC is counted.
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_trucks t
    WHERE t.agency_id = v_agency_id AND t.rc_number = btrim(p_rc_number)
  ) THEN
    PERFORM public.agency_subscription_assert(v_agency_id, 'truck_add', 1);
  END IF;

  -- ONE atomic write; a replayed (agency_id, rc_number) conflicts on the
  -- settlement key and writes nothing.
  INSERT INTO public.agency_trucks (
    agency_id, vehicle_type, rc_number,
    insurance_expiry, fitness_expiry, permit_expiry, puc_expiry,
    payload_kg, body_length_m, body_width_m, body_height_m, notes
  ) VALUES (
    v_agency_id, p_vehicle_type, btrim(p_rc_number),
    p_insurance_expiry, p_fitness_expiry, p_permit_expiry, p_puc_expiry,
    p_payload_kg,
    COALESCE(p_body_length_m, v_catalog.length),
    COALESCE(p_body_width_m, v_catalog.width),
    COALESCE(p_body_height_m, v_catalog.height),
    p_notes
  )
  ON CONFLICT (agency_id, rc_number) DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'created',
      'vehicle', to_jsonb(v_inserted),
      'version', v_inserted.version
    );
  END IF;

  -- Idempotent replay: return the existing row unchanged.
  SELECT * INTO v_existing
  FROM public.agency_trucks
  WHERE agency_id = v_agency_id AND rc_number = btrim(p_rc_number);

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'idempotent_replay',
    'vehicle', to_jsonb(v_existing),
    'version', v_existing.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_member_invite(
  p_invited_email text,
  p_scope text,
  p_expires_in_days integer DEFAULT 7,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_email text := lower(btrim(coalesce(p_invited_email, '')));
  v_owner_email text;
  v_token text;
  v_existing public.agency_invitations%ROWTYPE;
  v_inserted public.agency_invitations%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY[]::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'Invited email is invalid.';
  END IF;

  IF p_scope IS NULL OR p_scope NOT IN ('dispatcher', 'fleet_manager', 'finance', 'viewer') THEN
    RAISE EXCEPTION 'Unknown membership scope.';
  END IF;

  IF p_expires_in_days IS NULL OR p_expires_in_days < 1 OR p_expires_in_days > 30 THEN
    RAISE EXCEPTION 'Invitation expiry must be between 1 and 30 days.';
  END IF;

  SELECT lower(btrim(u.email)) INTO v_owner_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_owner_email IS NOT NULL AND v_owner_email = v_email THEN
    RAISE EXCEPTION 'An agency owner cannot be invited to its own agency.';
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_invitations
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.invited_email = v_email AND v_existing.scope = p_scope THEN
      RETURN jsonb_build_object(
        'ok', true,
        'state', 'idempotent_replay',
        'invitation', to_jsonb(v_existing) - 'token_hash'
      );
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  -- TO-152 S2 subscription guard (a replay was answered above and adds no seat).
  PERFORM public.agency_subscription_assert(v_agency_id, 'staff_add', 1);

  -- Stale pending invitations for this email stop blocking a fresh one.
  UPDATE public.agency_invitations
  SET status = 'expired', version = version + 1
  WHERE agency_id = v_agency_id
    AND invited_email = v_email
    AND status = 'pending'
    AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM public.agency_invitations
    WHERE agency_id = v_agency_id AND invited_email = v_email AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_already_pending');
  END IF;

  v_token := public.agency_random_token();

  INSERT INTO public.agency_invitations (
    agency_id, invited_email, scope, token_hash, status, expires_at, idempotency_key, created_by
  ) VALUES (
    v_agency_id, v_email, p_scope, public.agency_token_hash(v_token), 'pending',
    now() + make_interval(days => p_expires_in_days), v_key, auth.uid()
  )
  RETURNING * INTO v_inserted;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'created',
    'token', v_token,
    'invitation', to_jsonb(v_inserted) - 'token_hash'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_member_accept(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_inv public.agency_invitations%ROWTYPE;
  v_membership public.agency_memberships%ROWTYPE;
  v_email text;
  v_state text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign-in is required.';
  END IF;

  IF btrim(coalesce(p_token, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  -- Lock order: subscription lock first, then rows. The agency is read without a row lock to know which lock.
  PERFORM public.agency_subscription_lock((
    SELECT i0.agency_id FROM public.agency_invitations i0
    WHERE i0.token_hash = public.agency_token_hash(btrim(p_token))
  ));

  SELECT * INTO v_inv
  FROM public.agency_invitations
  WHERE token_hash = public.agency_token_hash(btrim(p_token))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  -- No self-escalation: an owner cannot take a staff seat in its own agency.
  IF EXISTS (
    SELECT 1 FROM public.transport_agencies ta
    WHERE ta.id = v_inv.agency_id AND ta.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'An agency owner cannot accept a membership for its own agency.';
  END IF;

  IF NOT public.agency_is_operational(v_inv.agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_inv.status = 'accepted' THEN
    IF v_inv.accepted_by = v_caller THEN
      SELECT * INTO v_membership
      FROM public.agency_memberships m
      WHERE m.agency_id = v_inv.agency_id AND m.user_id = v_caller AND m.status = 'active';
      IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'membership', to_jsonb(v_membership));
      END IF;
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_revoked');
  END IF;

  IF v_inv.status = 'expired' OR v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_expired');
  END IF;

  v_email := public.agency_caller_email();
  IF v_email IS NULL OR v_email <> v_inv.invited_email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_recipient_mismatch');
  END IF;

  -- An existing active member keeps its scope: a fresh invitation never escalates.
  SELECT * INTO v_membership
  FROM public.agency_memberships m
  WHERE m.agency_id = v_inv.agency_id AND m.user_id = v_caller AND m.status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    v_state := 'already_member';
  ELSE
    -- TO-152 S2 subscription guard. The pending invitation already holds this seat, so it adds 0.
    PERFORM public.agency_subscription_assert(v_inv.agency_id, 'staff_add', 0);
    INSERT INTO public.agency_memberships (agency_id, user_id, scope, invitation_id, invited_by)
    VALUES (v_inv.agency_id, v_caller, v_inv.scope, v_inv.id, v_inv.created_by)
    RETURNING * INTO v_membership;
    v_state := 'accepted';
  END IF;

  UPDATE public.agency_invitations
  SET status = 'accepted', accepted_by = v_caller, accepted_at = now(), version = version + 1
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'state', v_state, 'membership', to_jsonb(v_membership));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_employment_create(
  p_driver_id uuid,
  p_licence_number text DEFAULT NULL,
  p_licence_class text DEFAULT NULL,
  p_licence_expiry date DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_inserted public.agency_driver_employment%ROWTYPE;
  v_existing public.agency_driver_employment%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['fleet_manager']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF NOT public.driver_is_approved_for_assignment(p_driver_id) THEN
    RAISE EXCEPTION 'Driver is not approved for assignment.';
  END IF;

  -- TO-152 S2 subscription guard. An active employment in this agency is a replay and adds no driver.
  IF NOT EXISTS (
    SELECT 1 FROM public.agency_driver_employment e
    WHERE e.driver_id = p_driver_id AND e.status = 'active' AND e.agency_id = v_agency_id
  ) THEN
    PERFORM public.agency_subscription_assert(v_agency_id, 'driver_add', 1);
  END IF;

  INSERT INTO public.agency_driver_employment (
    agency_id, driver_id, licence_number, licence_class, licence_expiry, contact_phone
  ) VALUES (
    v_agency_id, p_driver_id, p_licence_number, p_licence_class, p_licence_expiry, p_contact_phone
  )
  ON CONFLICT (driver_id) WHERE status = 'active' DO NOTHING
  RETURNING * INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'created',
      'employment', to_jsonb(v_inserted),
      'version', v_inserted.version
    );
  END IF;

  -- Active employment already exists: replay for the SAME agency, denial for
  -- a foreign one (mirrors the one-truck cross-agency posture).
  SELECT * INTO v_existing
  FROM public.agency_driver_employment
  WHERE driver_id = p_driver_id AND status = 'active';

  IF v_existing.agency_id = v_agency_id THEN
    RETURN jsonb_build_object(
      'ok', true,
      'state', 'idempotent_replay',
      'employment', to_jsonb(v_existing),
      'version', v_existing.version
    );
  END IF;

  RAISE EXCEPTION 'Driver already has an active employment record.';
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_driver_invitation_accept(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_driver_count integer;
  v_driver public.drivers%ROWTYPE;
  v_inv public.agency_driver_invitations%ROWTYPE;
  v_emp public.agency_driver_employment%ROWTYPE;
  v_state text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Sign-in is required.';
  END IF;

  SELECT count(*)::int INTO v_driver_count FROM public.drivers d WHERE d.user_id = v_caller;

  IF v_driver_count = 0 THEN
    RAISE EXCEPTION 'No driver profile found for this account.';
  END IF;

  IF v_driver_count > 1 THEN
    RAISE EXCEPTION 'Multiple driver profiles found for this account.';
  END IF;

  SELECT * INTO v_driver FROM public.drivers d WHERE d.user_id = v_caller;

  IF btrim(coalesce(p_token, '')) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  -- Lock order: subscription lock first, then rows. The agency is read without a row lock to know which lock.
  PERFORM public.agency_subscription_lock((
    SELECT i0.agency_id FROM public.agency_driver_invitations i0
    WHERE i0.token_hash = public.agency_token_hash(btrim(p_token))
  ));

  SELECT * INTO v_inv
  FROM public.agency_driver_invitations
  WHERE token_hash = public.agency_token_hash(btrim(p_token))
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_invalid');
  END IF;

  IF NOT public.agency_is_operational(v_inv.agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_inv.status = 'accepted' THEN
    IF v_inv.accepted_by = v_caller THEN
      SELECT * INTO v_emp FROM public.agency_driver_employment e WHERE e.id = v_inv.employment_id;
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'employment', to_jsonb(v_emp));
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_inv.status = 'revoked' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_revoked');
  END IF;

  IF v_inv.status = 'expired' OR v_inv.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_expired');
  END IF;

  IF regexp_replace(v_driver.phone, '[[:space:]]', '', 'g') <> v_inv.invited_phone THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_recipient_mismatch');
  END IF;

  IF NOT public.driver_is_approved_for_assignment(v_driver.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_approved');
  END IF;

  SELECT * INTO v_emp
  FROM public.agency_driver_employment e
  WHERE e.driver_id = v_driver.id AND e.status = 'active'
  FOR UPDATE;

  IF FOUND THEN
    IF v_emp.agency_id <> v_inv.agency_id THEN
      RETURN jsonb_build_object('ok', false, 'error', 'driver_already_employed_elsewhere');
    END IF;
    v_state := 'already_employed';
  ELSE
    -- TO-152 S2 subscription guard.
    PERFORM public.agency_subscription_assert(v_inv.agency_id, 'driver_add', 1);
    INSERT INTO public.agency_driver_employment (agency_id, driver_id, status)
    VALUES (v_inv.agency_id, v_driver.id, 'active')
    RETURNING * INTO v_emp;
    v_state := 'accepted';
  END IF;

  UPDATE public.agency_driver_invitations
  SET status = 'accepted',
      accepted_by = v_caller,
      accepted_at = now(),
      accepted_driver_id = v_driver.id,
      employment_id = v_emp.id,
      version = version + 1
  WHERE id = v_inv.id;

  RETURN jsonb_build_object('ok', true, 'state', v_state, 'employment', to_jsonb(v_emp));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_order_import(
  p_agreement_id uuid,
  p_file_hash text,
  p_idempotency_key text,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c_max_lines CONSTANT integer := 2000;
  v_agency_id uuid;
  v_key text;
  v_hash text;
  v_agreement public.agency_client_agreements%ROWTYPE;
  v_existing public.agency_order_batches%ROWTYPE;
  v_count integer;
  v_problems jsonb := '[]'::jsonb;
  v_clash text[];
  v_batch uuid;
  v_orders integer := 0;
  v_lines integer := 0;
  i integer;
  l jsonb;
  v_ref text;
  v_unit text;
  v_pickup_site uuid;
  v_drop_site uuid;
  v_ts timestamptz;
  v_pf timestamptz;
  v_dt timestamptz;
  v_order uuid;
  r record;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  v_key := btrim(coalesce(p_idempotency_key, ''));
  IF v_key = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  v_hash := btrim(coalesce(p_file_hash, ''));
  IF v_hash = '' THEN
    RAISE EXCEPTION 'File hash is required.';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'No order lines to import.';
  END IF;
  v_count := jsonb_array_length(p_lines);
  IF v_count > c_max_lines THEN
    RAISE EXCEPTION 'Too many lines in one import (maximum 2000).';
  END IF;

  SELECT * INTO v_agreement
  FROM public.agency_client_agreements
  WHERE id = p_agreement_id AND agency_id = v_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client agreement not found or access denied.';
  END IF;

  -- Serialise imports of the same agreement so duplicate detection cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_agency_id::text || ':' || p_agreement_id::text, 0));

  -- Replay of the same request, answered before any state rule.
  SELECT * INTO v_existing
  FROM public.agency_order_batches
  WHERE agency_id = v_agency_id AND idempotency_key = v_key;

  IF FOUND THEN
    IF v_existing.agreement_id = p_agreement_id AND v_existing.file_hash = v_hash THEN
      RETURN jsonb_build_object('ok', true, 'state', 'idempotent_replay', 'batch_id', v_existing.id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  IF v_agreement.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agreement_not_active');
  END IF;

  SELECT * INTO v_existing
  FROM public.agency_order_batches
  WHERE agency_id = v_agency_id AND agreement_id = p_agreement_id AND file_hash = v_hash;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'state', 'duplicate_batch', 'batch_id', v_existing.id);
  END IF;

  -- Validate every line again, collecting all problems.
  FOR i IN 0 .. v_count - 1 LOOP
    l := p_lines -> i;
    v_pickup_site := NULL;
    v_drop_site := NULL;

    IF jsonb_typeof(l) <> 'object' THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Line is not an object.');
      CONTINUE;
    END IF;

    v_unit := lower(btrim(coalesce(l ->> 'unit', '')));
    IF v_unit NOT IN ('kg', 'tonne', 'piece', 'carton') THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Unsupported unit.');
    END IF;

    IF coalesce(l ->> 'quantity', '') !~ '^[0-9]+(\.[0-9]+)?$' OR (l ->> 'quantity')::numeric <= 0 THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Quantity must be greater than zero.');
    END IF;

    IF coalesce(l ->> 'line_no', '') !~ '^[0-9]+$' OR (l ->> 'line_no')::numeric < 1 THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Line number must be at least 1.');
    END IF;

    IF btrim(coalesce(l ->> 'client_order_ref', '')) = '' THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Order reference is missing.');
    END IF;
    IF btrim(coalesce(l ->> 'sku', '')) = '' THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'SKU is missing.');
    END IF;

    SELECT s.id INTO v_pickup_site
    FROM public.agency_client_sites s
    WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
      AND lower(btrim(s.label)) = lower(btrim(coalesce(l ->> 'pickup_site', '')))
    ORDER BY (s.site_kind = 'ship_to'), s.id
    LIMIT 1;
    IF v_pickup_site IS NULL THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Pickup site not found.');
    END IF;

    SELECT s.id INTO v_drop_site
    FROM public.agency_client_sites s
    WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
      AND s.site_kind = 'ship_to'
      AND lower(btrim(s.label)) = lower(btrim(coalesce(l ->> 'drop_site', '')))
    ORDER BY s.id
    LIMIT 1;
    IF v_drop_site IS NULL THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Drop site not found.');
    END IF;

    -- Windows: only the pickup_from / delivery_to pair is compared (the same rule as the parser).
    v_pf := NULL;
    v_dt := NULL;
    BEGIN
      IF nullif(btrim(coalesce(l ->> 'pickup_from', '')), '') IS NOT NULL THEN
        v_pf := (l ->> 'pickup_from')::timestamptz;
      END IF;
      IF nullif(btrim(coalesce(l ->> 'delivery_to', '')), '') IS NOT NULL THEN
        v_dt := (l ->> 'delivery_to')::timestamptz;
      END IF;
      IF nullif(btrim(coalesce(l ->> 'pickup_to', '')), '') IS NOT NULL THEN
        v_ts := (l ->> 'pickup_to')::timestamptz;
      END IF;
      IF nullif(btrim(coalesce(l ->> 'delivery_from', '')), '') IS NOT NULL THEN
        v_ts := (l ->> 'delivery_from')::timestamptz;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'A date is not valid.');
      v_pf := NULL;
      v_dt := NULL;
    END;
    IF v_pf IS NOT NULL AND v_dt IS NOT NULL AND v_dt < v_pf THEN
      v_problems := v_problems || jsonb_build_object('index', i, 'message', 'Delivery window ends before pickup window.');
    END IF;
  END LOOP;

  -- (ref, line_no) must be unique inside the payload.
  FOR r IN
    SELECT min(ord) AS first_index, ref, ln
    FROM (
      SELECT (ordinality - 1)::integer AS ord,
             btrim(coalesce(e ->> 'client_order_ref', '')) AS ref,
             e ->> 'line_no' AS ln
      FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, ordinality)
    ) q
    GROUP BY ref, ln
    HAVING count(*) > 1 AND ref <> ''
  LOOP
    v_problems := v_problems || jsonb_build_object('index', r.first_index, 'message', 'Duplicate line in this import.');
  END LOOP;

  IF jsonb_array_length(v_problems) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lines', 'problems', v_problems);
  END IF;

  SELECT array_agg(DISTINCT o.client_order_ref ORDER BY o.client_order_ref)
    INTO v_clash
  FROM public.agency_orders o
  WHERE o.agency_id = v_agency_id
    AND o.agreement_id = p_agreement_id
    AND o.client_order_ref IN (
      SELECT btrim(e ->> 'client_order_ref') FROM jsonb_array_elements(p_lines) e
    );

  IF v_clash IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'order_exists', 'refs', to_jsonb(v_clash));
  END IF;

  -- TO-152 S2 subscription guard: this month's orders plus the distinct new orders in this file.
  PERFORM public.agency_subscription_assert(
    v_agency_id,
    'order_import',
    (SELECT count(DISTINCT btrim(e ->> 'client_order_ref'))::integer FROM jsonb_array_elements(p_lines) e)
  );

  INSERT INTO public.agency_order_batches (agency_id, agreement_id, file_hash, row_count, created_by, idempotency_key)
  VALUES (v_agency_id, p_agreement_id, v_hash, v_count, auth.uid(), v_key)
  RETURNING id INTO v_batch;

  FOR r IN
    SELECT DISTINCT btrim(e ->> 'client_order_ref') AS ref
    FROM jsonb_array_elements(p_lines) e
    ORDER BY 1
  LOOP
    INSERT INTO public.agency_orders (agency_id, agreement_id, batch_id, client_order_ref)
    VALUES (v_agency_id, p_agreement_id, v_batch, r.ref);
    v_orders := v_orders + 1;
  END LOOP;

  FOR i IN 0 .. v_count - 1 LOOP
    l := p_lines -> i;
    v_ref := btrim(l ->> 'client_order_ref');
    SELECT id INTO v_order
    FROM public.agency_orders
    WHERE agency_id = v_agency_id AND agreement_id = p_agreement_id AND client_order_ref = v_ref;

    INSERT INTO public.agency_order_lines (
      agency_id, order_id, line_no, sku, description, quantity, unit, weight_per_unit_kg,
      length_m, width_m, height_m, pickup_site_id, drop_site_id,
      pickup_from, pickup_to, delivery_from, delivery_to, stackable, fragile
    )
    SELECT
      v_agency_id, v_order, (l ->> 'line_no')::integer, btrim(l ->> 'sku'),
      nullif(btrim(coalesce(l ->> 'description', '')), ''),
      (l ->> 'quantity')::numeric, lower(btrim(l ->> 'unit')),
      nullif(l ->> 'weight_per_unit_kg', '')::numeric,
      nullif(l ->> 'length_m', '')::numeric, nullif(l ->> 'width_m', '')::numeric, nullif(l ->> 'height_m', '')::numeric,
      (SELECT s.id FROM public.agency_client_sites s
        WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
          AND lower(btrim(s.label)) = lower(btrim(l ->> 'pickup_site'))
        ORDER BY (s.site_kind = 'ship_to'), s.id LIMIT 1),
      (SELECT s.id FROM public.agency_client_sites s
        WHERE s.agency_id = v_agency_id AND s.agreement_id = p_agreement_id AND s.status = 'active'
          AND s.site_kind = 'ship_to' AND lower(btrim(s.label)) = lower(btrim(l ->> 'drop_site'))
        ORDER BY s.id LIMIT 1),
      nullif(l ->> 'pickup_from', '')::timestamptz, nullif(l ->> 'pickup_to', '')::timestamptz,
      nullif(l ->> 'delivery_from', '')::timestamptz, nullif(l ->> 'delivery_to', '')::timestamptz,
      coalesce((l ->> 'stackable')::boolean, TRUE), coalesce((l ->> 'fragile')::boolean, FALSE);
    v_lines := v_lines + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'state', 'created', 'batch_id', v_batch, 'orders_created', v_orders, 'lines_created', v_lines);
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_load_plan_approve(p_plan_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_plan public.agency_load_plans%ROWTYPE;
  v_problems jsonb;
  v_ids jsonb;
  v_clash jsonb;
  v_updated public.agency_load_plans%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher', 'fleet_manager', 'finance', 'viewer']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF v_agency_id NOT IN (SELECT public.agency_caller_agencies(ARRAY['dispatcher']::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
  END IF;

  -- One approval or cancellation at a time per agency: allocation clashes cannot race.
  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_approve:' || v_agency_id::text, 0));

  -- TO-152 S2 subscription guard (dispatch).
  PERFORM public.agency_subscription_assert(v_agency_id, 'dispatch', 1);

  SELECT * INTO v_plan
  FROM public.agency_load_plans
  WHERE id = p_plan_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_plan.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'illegal_transition', 'status', v_plan.status);
  END IF;

  IF p_expected_version IS NULL OR v_plan.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_plan.version);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.agency_load_plan_loads l WHERE l.plan_id = v_plan.id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_plan');
  END IF;

  -- Share-lock the order and truck rows so a concurrent cancel or maintenance block waits for this
  -- approval (and then sees the approved plan) instead of slipping in after the staleness check.
  PERFORM 1
  FROM public.agency_orders o
  WHERE o.agency_id = v_agency_id
    AND o.id IN (
      SELECT ol.order_id
      FROM public.agency_load_plan_lines li
      JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
      WHERE li.plan_id = v_plan.id)
  ORDER BY o.id
  FOR SHARE;

  PERFORM 1
  FROM public.agency_trucks t
  WHERE t.agency_id = v_agency_id
    AND t.id IN (SELECT l.truck_id FROM public.agency_load_plan_loads l WHERE l.plan_id = v_plan.id)
  ORDER BY t.id
  FOR SHARE;

  -- Re-validate against today's orders and trucks.
  SELECT coalesce(jsonb_agg(DISTINCT q.order_line_id), '[]'::jsonb) INTO v_ids
  FROM (
    SELECT li.order_line_id
    FROM public.agency_load_plan_lines li
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    JOIN public.agency_orders o ON o.id = ol.order_id AND o.agency_id = ol.agency_id
    WHERE li.plan_id = v_plan.id AND o.status = 'cancelled'
  ) q;

  SELECT coalesce(jsonb_agg(p), '[]'::jsonb) INTO v_problems
  FROM (
    SELECT jsonb_build_object('code', 'order_cancelled', 'order_line_id', x.order_line_id) AS p
    FROM jsonb_array_elements_text(v_ids) AS x(order_line_id)
    UNION ALL
    SELECT jsonb_build_object('code', 'truck_unavailable', 'truck_id', l.truck_id)
    FROM public.agency_load_plan_loads l
    JOIN public.agency_trucks t ON t.id = l.truck_id AND t.agency_id = l.agency_id
    WHERE l.plan_id = v_plan.id AND t.maintenance_blocked
    UNION ALL
    SELECT jsonb_build_object('code', 'over_allocated', 'order_line_id', li.order_line_id)
    FROM public.agency_load_plan_lines li
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE li.plan_id = v_plan.id AND li.quantity > ol.quantity
    UNION ALL
    SELECT jsonb_build_object('code', 'weight_missing', 'order_line_id', li.order_line_id)
    FROM public.agency_load_plan_lines li
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE li.plan_id = v_plan.id
      AND public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg) IS NULL
    UNION ALL
    SELECT jsonb_build_object('code', 'over_capacity', 'truck_id', l.truck_id,
                              'total_kg', sum(public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg)),
                              'payload_kg', coalesce(max(t.payload_kg), 0))
    FROM public.agency_load_plan_loads l
    JOIN public.agency_trucks t ON t.id = l.truck_id AND t.agency_id = l.agency_id
    JOIN public.agency_load_plan_lines li ON li.load_id = l.id
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE l.plan_id = v_plan.id
    GROUP BY l.id, l.truck_id
    HAVING sum(public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg)) > coalesce(max(t.payload_kg), 0)
  ) s;

  IF jsonb_array_length(v_problems) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_plan', 'order_line_ids', v_ids, 'problems', v_problems);
  END IF;

  -- A line may sit in only one APPROVED plan per name lineage (a newer version supersedes its own name).
  SELECT coalesce(jsonb_agg(DISTINCT li.order_line_id), '[]'::jsonb) INTO v_clash
  FROM public.agency_load_plan_lines li
  JOIN public.agency_load_plan_lines other ON other.order_line_id = li.order_line_id
                                          AND other.agency_id = li.agency_id
                                          AND other.plan_id <> li.plan_id
  JOIN public.agency_load_plans op ON op.id = other.plan_id AND op.agency_id = other.agency_id
  WHERE li.plan_id = v_plan.id AND op.status = 'approved' AND op.name <> v_plan.name;

  IF jsonb_array_length(v_clash) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'line_already_planned', 'order_line_ids', v_clash);
  END IF;

  -- Refresh the stored totals from the weights as they are now (the plan is still a draft).
  UPDATE public.agency_load_plan_loads l
  SET total_kg = round(s.total, 2),
      utilization_pct = CASE WHEN s.cap IS NOT NULL AND s.cap > 0 THEN round(s.total / s.cap * 100, 2) ELSE 0 END
  FROM (
    SELECT l2.id,
           sum(public.agency_load_plan_weight(li.quantity, ol.unit, ol.weight_per_unit_kg)) AS total,
           max(t.payload_kg) AS cap
    FROM public.agency_load_plan_loads l2
    JOIN public.agency_trucks t ON t.id = l2.truck_id AND t.agency_id = l2.agency_id
    JOIN public.agency_load_plan_lines li ON li.load_id = l2.id
    JOIN public.agency_order_lines ol ON ol.id = li.order_line_id AND ol.agency_id = li.agency_id
    WHERE l2.plan_id = v_plan.id
    GROUP BY l2.id
  ) s
  WHERE l.id = s.id;

  PERFORM pg_advisory_xact_lock(hashtextextended('load_plan_name:' || v_agency_id::text || ':' || v_plan.name, 0));

  UPDATE public.agency_load_plans
  SET status = 'superseded', version = version + 1
  WHERE agency_id = v_agency_id AND name = v_plan.name AND status = 'approved' AND id <> v_plan.id;

  UPDATE public.agency_load_plans
  SET status = 'approved', version = version + 1, approved_by = auth.uid(), approved_at = now()
  WHERE id = v_plan.id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'approved', 'version', v_updated.version);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'error', 'concurrent_conflict');
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_job_assign_driver(p_job_id uuid, p_driver_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_job public.agency_jobs%ROWTYPE;
  v_updated public.agency_jobs%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  -- Lock order: subscription lock first, then the job row (same as reserve_fleet_assignment).
  PERFORM public.agency_subscription_lock(v_agency_id);

  SELECT * INTO v_job
  FROM public.agency_jobs
  WHERE id = p_job_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or access denied.';
  END IF;

  IF v_job.status NOT IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_assignable');
  END IF;

  IF NOT public.driver_is_approved_for_assignment(p_driver_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_approved');
  END IF;

  IF NOT public.driver_is_assigned_to_agency(p_driver_id, v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_employed');
  END IF;

  IF v_job.driver_id IS NOT DISTINCT FROM p_driver_id THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unchanged', 'job', to_jsonb(v_job));
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fleet_assignment_reservations r
    WHERE r.agency_job_id = p_job_id
      AND r.status = 'active'
      AND r.driver_id IS DISTINCT FROM p_driver_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_has_reservation');
  END IF;

  -- TO-152 S2 subscription guard (dispatch).
  PERFORM public.agency_subscription_assert(v_agency_id, 'dispatch', 1);

  UPDATE public.agency_jobs
  SET driver_id = p_driver_id,
      assigned_at = now(),
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'assigned', 'job', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_fleet_assignment(
  p_agency_job_id uuid,
  p_job_offer_id uuid,
  p_vehicle_id uuid,
  p_driver_employment_id uuid,
  p_window_start timestamptz,
  p_window_end timestamptz,
  p_expected_vehicle_version integer,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_now timestamptz := NOW();
  v_job public.agency_jobs%ROWTYPE;
  v_employment public.agency_driver_employment%ROWTYPE;
  v_vehicle public.agency_trucks%ROWTYPE;
  v_offer public.job_offers%ROWTYPE;
  v_existing public.fleet_assignment_reservations%ROWTYPE;
  v_inserted public.fleet_assignment_reservations%ROWTYPE;
  v_message text;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['dispatcher']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  IF p_window_start IS NULL OR p_window_end IS NULL THEN
    RAISE EXCEPTION 'Reservation window is required.';
  END IF;

  IF p_window_end <= p_window_start THEN
    RAISE EXCEPTION 'Reservation window must end after it starts.';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'Idempotency key is required.';
  END IF;

  -- (a) Idempotent replay, scoped to the caller agency. Same key + same request
  --     returns the stored reservation; same key + different request is refused.
  SELECT * INTO v_existing
  FROM public.fleet_assignment_reservations
  WHERE agency_id = v_agency_id
    AND idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF v_existing.agency_job_id = p_agency_job_id
       AND v_existing.job_offer_id = p_job_offer_id
       AND v_existing.vehicle_id = p_vehicle_id
       AND v_existing.driver_employment_id = p_driver_employment_id
       AND v_existing.window_start = p_window_start
       AND v_existing.window_end = p_window_end THEN
      RETURN jsonb_build_object(
        'ok', true,
        'state', 'idempotent_replay',
        'reservation', to_jsonb(v_existing),
        'version', v_existing.version
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
  END IF;

  -- TO-152 S2 subscription guard (dispatch); a replay was answered above.
  PERFORM public.agency_subscription_assert(v_agency_id, 'dispatch', 1);

  -- (b) Settle this agency's stale offers first, so an expired hold never blocks.
  PERFORM public.release_stale_fleet_reservations(v_agency_id, v_now);

  -- (c) Caller-owned job, employment and vehicle. Foreign ids fail closed as
  --     not found, never as a different denial.
  SELECT * INTO v_job
  FROM public.agency_jobs
  WHERE id = p_agency_job_id
    AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agency job not found or access denied.';
  END IF;

  SELECT * INTO v_employment
  FROM public.agency_driver_employment
  WHERE id = p_driver_employment_id
    AND agency_id = v_agency_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employment record not found or access denied.';
  END IF;

  SELECT * INTO v_vehicle
  FROM public.agency_trucks
  WHERE id = p_vehicle_id
    AND agency_id = v_agency_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found or access denied.';
  END IF;

  IF v_job.status NOT IN ('pending', 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_job_not_open');
  END IF;

  -- (d) Expected vehicle version: the caller acted on a stale vehicle state.
  IF v_vehicle.version <> p_expected_vehicle_version THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'version_conflict',
      'current_version', v_vehicle.version
    );
  END IF;

  -- (e) TO-144-D1 eligibility, evaluated at BOTH window edges. The vehicle
  --     predicate covers availability, maintenance flag and blocked-until,
  --     and document expiry; the driver predicate covers active employment for
  --     this agency, approval and licence validity.
  IF NOT (
    public.agency_vehicle_allocation_eligible(p_vehicle_id, p_window_start)
    AND public.agency_vehicle_allocation_eligible(p_vehicle_id, p_window_end)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'vehicle_not_eligible');
  END IF;

  IF NOT (
    public.agency_driver_allocation_eligible(v_employment.driver_id, v_agency_id, p_window_start)
    AND public.agency_driver_allocation_eligible(v_employment.driver_id, v_agency_id, p_window_end)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_eligible');
  END IF;

  -- (f) The offer must be live for this job's shipment and this driver:
  --     pending and unexpired, or already accepted.
  SELECT * INTO v_offer
  FROM public.job_offers
  WHERE id = p_job_offer_id;

  IF NOT FOUND
     OR v_offer.shipment_id IS DISTINCT FROM v_job.shipment_id
     OR v_offer.driver_id IS DISTINCT FROM v_employment.driver_id
     OR NOT (
       v_offer.status = 'accepted'
       OR (v_offer.status = 'pending' AND v_offer.expires_at > v_now)
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'offer_not_active');
  END IF;

  -- (g) One active assignment per agency job (the partial unique index is the
  --     backstop for a concurrent insert, handled below).
  IF EXISTS (
    SELECT 1
    FROM public.fleet_assignment_reservations r
    WHERE r.agency_job_id = p_agency_job_id
      AND r.status = 'active'
  ) THEN
    SELECT * INTO v_existing
    FROM public.fleet_assignment_reservations
    WHERE agency_id = v_agency_id
      AND idempotency_key = p_idempotency_key;

    IF FOUND
       AND v_existing.agency_job_id = p_agency_job_id
       AND v_existing.job_offer_id = p_job_offer_id
       AND v_existing.vehicle_id = p_vehicle_id
       AND v_existing.driver_employment_id = p_driver_employment_id
       AND v_existing.window_start = p_window_start
       AND v_existing.window_end = p_window_end THEN
      RETURN jsonb_build_object(
        'ok', true,
        'state', 'idempotent_replay',
        'reservation', to_jsonb(v_existing),
        'version', v_existing.version
      );
    END IF;

    RETURN jsonb_build_object('ok', false, 'error', 'agency_job_already_assigned');
  END IF;

  -- (h) Write. The reservation is the authority for vehicle/driver allocation.
  --     agency_jobs.truck_id / driver_id are NOT written here: the TO-142 guard
  --     trg_agency_jobs_driver_assignment only admits a driver already on the
  --     legacy agency_trucks.driver_id model, which is a separate relationship
  --     from agency_driver_employment (see the header, section 7). The overlap
  --     guard raises inside the INSERT; the EXCEPTION block turns that into a
  --     typed result with nothing written.
  BEGIN
    INSERT INTO public.fleet_assignment_reservations (
      agency_id, agency_job_id, job_offer_id, vehicle_id, driver_employment_id, driver_id,
      window_start, window_end, status, idempotency_key
    ) VALUES (
      v_agency_id, p_agency_job_id, p_job_offer_id, p_vehicle_id, v_employment.id, v_employment.driver_id,
      p_window_start, p_window_end, 'active', p_idempotency_key
    )
    RETURNING * INTO v_inserted;
  EXCEPTION
    WHEN exclusion_violation THEN
      GET STACKED DIAGNOSTICS v_message = MESSAGE_TEXT;
      IF v_message LIKE 'Vehicle reservation%' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'vehicle_reserved');
      END IF;
      RETURN jsonb_build_object('ok', false, 'error', 'driver_reserved');
    WHEN unique_violation THEN
      SELECT * INTO v_existing
      FROM public.fleet_assignment_reservations
      WHERE agency_id = v_agency_id
        AND idempotency_key = p_idempotency_key;

      IF FOUND THEN
        IF v_existing.agency_job_id = p_agency_job_id
           AND v_existing.job_offer_id = p_job_offer_id
           AND v_existing.vehicle_id = p_vehicle_id
           AND v_existing.driver_employment_id = p_driver_employment_id
           AND v_existing.window_start = p_window_start
           AND v_existing.window_end = p_window_end THEN
          RETURN jsonb_build_object(
            'ok', true,
            'state', 'idempotent_replay',
            'reservation', to_jsonb(v_existing),
            'version', v_existing.version
          );
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'idempotency_key_reused');
      END IF;

      RETURN jsonb_build_object('ok', false, 'error', 'agency_job_already_assigned');
  END;

  -- Project the authoritative reservation onto the job (the jobs guard now
  -- admits an actively employed driver).
  UPDATE public.agency_jobs
  SET truck_id = p_vehicle_id,
      driver_id = v_employment.driver_id
  WHERE id = p_agency_job_id
    AND agency_id = v_agency_id;

  RETURN jsonb_build_object(
    'ok', true,
    'state', 'created',
    'reservation', to_jsonb(v_inserted),
    'version', v_inserted.version
  );
END;
$$;
