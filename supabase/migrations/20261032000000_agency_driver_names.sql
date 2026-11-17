-- Agency driver directory: display names for the payroll screen.
--
-- public.drivers RLS is own-record or admin only, and agency_driver_employment has no
-- name, so agency staff could not show who a payroll line belongs to. This adds ONE
-- read command that exposes only the display name and the last 4 digits of the phone
-- of drivers the caller's agency currently or previously employed. Nothing else
-- (PAN, licence, address, full phone, bank, UPI) is returned and public.drivers RLS
-- is NOT widened. Forward-only and additive.

CREATE OR REPLACE FUNCTION public.agency_driver_directory()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_agency_id uuid;
  v_msg text;
  v_drivers jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'sign_in_required');
  END IF;

  BEGIN
    v_agency_id := public.resolve_caller_agency_for_scopes(
      ARRAY['finance', 'dispatcher', 'fleet_manager']::text[]
    );
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

  IF NOT EXISTS (
    SELECT 1 FROM public.transport_agencies ta WHERE ta.id = v_agency_id AND ta.status = 'approved'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'agency_not_approved');
  END IF;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('driver_id', x.driver_id, 'name', x.name, 'phone_last4', x.phone_last4)
           ORDER BY x.name, x.driver_id), '[]'::jsonb)
    INTO v_drivers
  FROM (
    SELECT d.id AS driver_id,
           btrim(d.full_name) AS name,
           CASE
             WHEN length(regexp_replace(COALESCE(d.phone, ''), '\D', '', 'g')) >= 4
               THEN right(regexp_replace(d.phone, '\D', '', 'g'), 4)
             ELSE NULL
           END AS phone_last4
    FROM public.drivers d
    WHERE d.id IN (
      SELECT e.driver_id FROM public.agency_driver_employment e WHERE e.agency_id = v_agency_id
    )
  ) x;

  RETURN jsonb_build_object('ok', true, 'drivers', v_drivers);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_driver_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_driver_directory() TO authenticated;
