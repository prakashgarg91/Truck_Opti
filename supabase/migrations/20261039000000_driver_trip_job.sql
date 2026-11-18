-- Driver trip page -> agency job resolver.
--
-- The driver trip page holds a job_offers.id; tracking_ping_record needs an agency_jobs.id, and drivers
-- cannot read agency_jobs under RLS. The only relation in the schema is
-- job_offers(shipment_id, driver_id) = agency_jobs(shipment_id, driver_id), so that is what is used here.
--
-- driver_trip_agency_job(p_offer_id) takes no driver or agency argument: the driver comes from auth.uid()
-- (drivers.user_id). It answers ONLY for the offer's own driver, and only when that driver is the assigned,
-- actively employed driver of an agency job on the offer's shipment. It exposes the job id, its status and
-- whether location sharing is possible (agency approved), nothing else. A foreign, unknown or NULL offer id
-- and a missing sign-in are indistinguishable (not_found), so there is no existence leak.

CREATE OR REPLACE FUNCTION public.driver_trip_agency_job(p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_offer public.job_offers%ROWTYPE;
  v_job_id uuid;
  v_status text;
  v_agency_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_offer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT o.* INTO v_offer
  FROM public.job_offers o
  WHERE o.id = p_offer_id
    AND o.driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = auth.uid());
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- An offer the driver did not take is not an assigned trip.
  IF v_offer.status IN ('declined', 'expired', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_assigned');
  END IF;

  -- The agency job of this shipment assigned to this driver, under an agency that actively employs the driver.
  -- Active jobs win over finished ones; then the newest.
  SELECT j.id, j.status, j.agency_id INTO v_job_id, v_status, v_agency_id
  FROM public.agency_jobs j
  WHERE j.shipment_id = v_offer.shipment_id
    AND j.driver_id = v_offer.driver_id
    AND EXISTS (
      SELECT 1 FROM public.agency_driver_employment e
      WHERE e.agency_id = j.agency_id AND e.driver_id = j.driver_id AND e.status = 'active'
    )
  ORDER BY (j.status IN ('pending', 'accepted', 'in_transit')) DESC, j.created_at DESC, j.id
  LIMIT 1;
  IF v_job_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_assigned');
  END IF;

  IF v_status NOT IN ('pending', 'accepted', 'in_transit') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'job_not_active');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'job_id', v_job_id,
    'job_status', v_status,
    'can_share_location', public.agency_is_operational(v_agency_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.driver_trip_agency_job(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_trip_agency_job(uuid) TO authenticated, service_role;
