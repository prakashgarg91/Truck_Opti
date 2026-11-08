-- Wave 2 launch blocker: database commands that replace the legacy Edge write paths
-- (supabase/functions/agency-portal-jobs update-status and assign-driver,
-- agency-portal-drivers assign-truck and unassign-truck). Those handlers wrote with the
-- service role and checked only the agency owner: no staff scopes, no transition rules,
-- no employment authority, no reservation awareness.
--
-- Each command is SECURITY DEFINER with a pinned search_path, takes NO agency id (the
-- acting agency comes from auth.uid() through resolve_caller_agency_for_scopes), returns
-- jsonb, and reports business refusals as {ok:false,error} rather than exceptions.
-- Scopes: job commands need dispatcher, truck commands need fleet_manager (owner always).
--
--   agency_job_set_status(job, status)
--       pending -> accepted | cancelled; accepted -> cancelled | delivered;
--       in_transit -> delivered; same status = unchanged; anything else invalid_transition.
--       Cancelling releases an active reservation through the existing job-cancel trigger.
--   agency_job_assign_driver(job, driver)
--       pending or accepted jobs only; driver must be approved and ACTIVELY EMPLOYED by
--       the agency (agency_driver_employment is the authority); refused while the job
--       holds an active reservation for a different driver.
--   agency_truck_assign_driver(truck, driver, expected_version) /
--   agency_truck_unassign_driver(truck, expected_version)
--       expected-version commands; the truck pairing is a default derived from employment.
--
-- Payout creation (agency-portal-drivers create-payout) is money code and stays on its
-- own task; it is NOT changed here.

-- Found by the real-PostgreSQL race test (scripts/race, R6): "a driver holds at most one truck" was
-- only an unlocked EXISTS check (in the command and in the truck trigger), so two concurrent
-- assignments to different trucks both succeeded. The unique index is the backstop; the
-- command turns its violation into the typed result.
DO $idx$
DECLARE
  v_dupes text;
BEGIN
  SELECT string_agg(d.driver_id::text, ', ')
    INTO v_dupes
  FROM (
    SELECT driver_id FROM public.agency_trucks
    WHERE driver_id IS NOT NULL
    GROUP BY driver_id
    HAVING count(*) > 1
  ) d;

  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate driver truck links block the unique index: %', v_dupes;
  END IF;
END
$idx$;

CREATE UNIQUE INDEX IF NOT EXISTS agency_trucks_one_truck_per_driver
  ON public.agency_trucks (driver_id)
  WHERE driver_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.agency_job_set_status(p_job_id uuid, p_status text)
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

  IF p_status IS NULL OR p_status NOT IN ('pending', 'accepted', 'in_transit', 'delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Unknown job status.';
  END IF;

  SELECT * INTO v_job
  FROM public.agency_jobs
  WHERE id = p_job_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job not found or access denied.';
  END IF;

  IF v_job.status = p_status THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unchanged', 'job', to_jsonb(v_job));
  END IF;

  IF NOT (
    (v_job.status = 'pending' AND p_status IN ('accepted', 'cancelled'))
    OR (v_job.status = 'accepted' AND p_status IN ('cancelled', 'delivered'))
    OR (v_job.status = 'in_transit' AND p_status = 'delivered')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition', 'from', v_job.status, 'to', p_status);
  END IF;

  UPDATE public.agency_jobs
  SET status = p_status,
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'updated', 'job', to_jsonb(v_updated));
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

  UPDATE public.agency_jobs
  SET driver_id = p_driver_id,
      assigned_at = now(),
      updated_at = now()
  WHERE id = p_job_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'assigned', 'job', to_jsonb(v_updated));
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_truck_assign_driver(p_truck_id uuid, p_driver_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_truck public.agency_trucks%ROWTYPE;
  v_updated public.agency_trucks%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['fleet_manager']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_truck
  FROM public.agency_trucks
  WHERE id = p_truck_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found or access denied.';
  END IF;

  IF v_truck.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_truck.version);
  END IF;

  IF v_truck.driver_id IS NOT DISTINCT FROM p_driver_id THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unchanged', 'truck', to_jsonb(v_truck), 'version', v_truck.version);
  END IF;

  IF NOT public.driver_is_assigned_to_agency(p_driver_id, v_agency_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_not_employed');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agency_trucks t
    WHERE t.driver_id = p_driver_id AND t.id <> p_truck_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'driver_already_assigned');
  END IF;

  BEGIN
    UPDATE public.agency_trucks
    SET driver_id = p_driver_id
    WHERE id = p_truck_id
    RETURNING * INTO v_updated;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', 'driver_already_assigned');
    WHEN raise_exception THEN
      IF SQLERRM IN ('Driver is already assigned to another truck.', 'Driver is already assigned to another agency.') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'driver_already_assigned');
      END IF;
      RAISE;
  END;

  RETURN jsonb_build_object('ok', true, 'state', 'assigned', 'truck', to_jsonb(v_updated), 'version', v_updated.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.agency_truck_unassign_driver(p_truck_id uuid, p_expected_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agency_id uuid;
  v_truck public.agency_trucks%ROWTYPE;
  v_updated public.agency_trucks%ROWTYPE;
BEGIN
  v_agency_id := public.resolve_caller_agency_for_scopes(ARRAY['fleet_manager']::text[]);

  IF NOT public.agency_is_operational(v_agency_id) THEN
    RAISE EXCEPTION 'Agency approval is required.';
  END IF;

  SELECT * INTO v_truck
  FROM public.agency_trucks
  WHERE id = p_truck_id AND agency_id = v_agency_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vehicle not found or access denied.';
  END IF;

  IF v_truck.version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'error', 'version_conflict', 'current_version', v_truck.version);
  END IF;

  IF v_truck.driver_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'state', 'unchanged', 'truck', to_jsonb(v_truck), 'version', v_truck.version);
  END IF;

  UPDATE public.agency_trucks
  SET driver_id = NULL
  WHERE id = p_truck_id
  RETURNING * INTO v_updated;

  RETURN jsonb_build_object('ok', true, 'state', 'unassigned', 'truck', to_jsonb(v_updated), 'version', v_updated.version);
END;
$$;

REVOKE ALL ON FUNCTION public.agency_job_set_status(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_job_assign_driver(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_truck_assign_driver(uuid, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.agency_truck_unassign_driver(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agency_job_set_status(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_job_assign_driver(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_truck_assign_driver(uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.agency_truck_unassign_driver(uuid, integer) TO authenticated, service_role;
