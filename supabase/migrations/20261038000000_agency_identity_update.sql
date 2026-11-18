-- Agency identity update: the one owner-only write path for GST/contact identity.
--
-- Problem: the Company Settings page saved GSTIN, phone, address and state into the login account
-- metadata (auth.updateUser), never into public.transport_agencies. The database reads agency identity
-- only from that row (trial claim: GSTIN + 10-digit phone; subscription place of supply: GSTIN/state;
-- freight invoices: supplier state), so what the owner typed never reached any command.
--
-- The existing RLS policy "Agencies: own record" is FOR ALL for the owner, so a direct UPDATE would also
-- reach rating, total_jobs, approved_by, bank and other fields. This command is the narrow, validated
-- path instead: it touches only company_name, gstin, contact_phone, address, state, and optionally
-- city and pincode (NULL = leave unchanged). status, approval fields, user_id, rating, bank and PAN
-- are never written.
--
-- Trial policy (conservative, documented): changing GSTIN or phone is allowed but never creates trial
-- eligibility. subscription_trial_claims is keyed by agency_id as well as GSTIN and phone, and existing
-- claim rows are not rewritten here, so an agency that already claimed a trial stays claimed, and an
-- edit to an identifier another agency already claimed still ends in trial_already_claimed.
--
-- Contract: jsonb, typed refusals (never an exception). Forward-only and additive.

CREATE OR REPLACE FUNCTION public.agency_identity_update(
  p_legal_name text,
  p_gstin text,
  p_phone text,
  p_address text,
  p_state text,
  p_expected_updated_at timestamptz DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_pincode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owned integer;
  v_agency public.transport_agencies%ROWTYPE;
  v_name text := btrim(COALESCE(p_legal_name, ''));
  v_gstin text := nullif(upper(btrim(COALESCE(p_gstin, ''))), '');
  v_digits text := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_phone text;
  v_state text := btrim(COALESCE(p_state, ''));
  v_state_code text;
  v_address text := nullif(btrim(COALESCE(p_address, '')), '');
  v_city text := nullif(btrim(COALESCE(p_city, '')), '');
  v_pincode text := nullif(btrim(COALESCE(p_pincode, '')), '');
  v_updated timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sign_in_required');
  END IF;

  SELECT count(*)::int INTO v_owned FROM public.transport_agencies WHERE user_id = v_uid;

  IF v_owned = 0 THEN
    IF EXISTS (SELECT 1 FROM public.agency_memberships WHERE user_id = v_uid AND status = 'active') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'forbidden_scope');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_owned > 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'multiple_agencies');
  END IF;

  SELECT * INTO v_agency FROM public.transport_agencies WHERE user_id = v_uid FOR UPDATE;
  IF v_agency.status NOT IN ('approved', 'pending') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_approved');
  END IF;

  IF v_name = '' OR length(v_name) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_name');
  END IF;

  -- Same 15-character GSTIN pattern as the trial claim. Blank means "not GST registered" (stored NULL).
  IF v_gstin IS NOT NULL AND v_gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_gstin');
  END IF;

  -- Same normalisation as the trial claim: digits only, the last 10 when there are at least 10.
  IF length(v_digits) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;
  v_phone := right(v_digits, 10);

  BEGIN
    v_state_code := public.subscription_place_of_supply(NULL, v_state);
  EXCEPTION WHEN OTHERS THEN
    v_state_code := NULL;
  END;
  IF v_state = '' OR v_state_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state');
  END IF;
  IF v_gstin IS NOT NULL AND left(v_gstin, 2) <> v_state_code THEN
    RETURN jsonb_build_object('ok', false, 'error', 'gstin_state_mismatch');
  END IF;

  -- Optimistic guard: the client sends the updated_at it loaded. Compared at millisecond precision so a
  -- JavaScript Date round trip still matches.
  IF p_expected_updated_at IS NOT NULL
     AND date_trunc('milliseconds', v_agency.updated_at) IS DISTINCT FROM date_trunc('milliseconds', p_expected_updated_at) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stale_version');
  END IF;

  UPDATE public.transport_agencies
     SET company_name = v_name,
         gstin = v_gstin,
         contact_phone = v_phone,
         address = v_address,
         state = v_state,
         city = COALESCE(v_city, city),
         pincode = COALESCE(v_pincode, pincode),
         updated_at = now()
   WHERE id = v_agency.id
  RETURNING updated_at INTO v_updated;

  RETURN jsonb_build_object(
    'ok', true,
    'agency_id', v_agency.id,
    'legal_name', v_name,
    'gstin', v_gstin,
    'phone', v_phone,
    'address', v_address,
    'state', v_state,
    'updated_at', v_updated
  );
END;
$$;

REVOKE ALL ON FUNCTION public.agency_identity_update(text, text, text, text, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_identity_update(text, text, text, text, text, timestamptz, text, text) TO authenticated;
