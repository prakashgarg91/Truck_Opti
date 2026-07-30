-- Enforce server-side pickup/delivery OTP verification for driver trip progress.
--
-- Before this migration, drivers could:
--   1. SELECT pickup_otp / delivery_otp via RLS stakeholder policy
--   2. UPDATE job_offers directly to "delivered" bypassing OTP UI
--   3. Call persist_driver_job_offer_progress without supplying OTPs
--
-- This closes all three paths.

ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS pickup_otp_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_otp_verified_at TIMESTAMPTZ;

-- Customers (shipment owners) fetch OTPs through this RPC instead of direct column reads.
CREATE OR REPLACE FUNCTION public.get_shipment_job_offer_tracking(
  p_shipment_id UUID
)
RETURNS TABLE (
  id UUID,
  shipment_id UUID,
  status TEXT,
  pickup_otp TEXT,
  delivery_otp TEXT,
  photo_loading_url TEXT,
  photo_delivery_url TEXT,
  drivers JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.shipments s
    LEFT JOIN public.customers c ON c.id = s.customer_id
    WHERE s.id = p_shipment_id
      AND (
        s.customer_id = auth.uid()
        OR s.created_by = auth.uid()
        OR c.created_by = auth.uid()
        OR public.is_admin_user()
      )
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  SELECT
    jo.id,
    jo.shipment_id,
    jo.status,
    jo.pickup_otp,
    jo.delivery_otp,
    jo.photo_loading_url,
    jo.photo_delivery_url,
    COALESCE(
      (
        SELECT to_jsonb(d)
        FROM (
          SELECT dr.full_name
          FROM public.drivers dr
          WHERE dr.id = jo.driver_id
        ) d
      ),
      'null'::jsonb
    ) AS drivers
  FROM public.job_offers jo
  WHERE jo.shipment_id = p_shipment_id
    AND jo.status IN (
      'pending', 'accepted', 'pickup_arrived', 'in_transit', 'delivery_arrived', 'delivered'
    )
  ORDER BY jo.offered_at DESC NULLS LAST
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.get_shipment_job_offer_tracking(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_shipment_job_offer_tracking(UUID) TO authenticated;

-- Drivers must not read OTP columns directly.
REVOKE SELECT (pickup_otp, delivery_otp) ON public.job_offers FROM authenticated;

-- Drivers must progress trips only through the RPC (not direct UPDATE).
DROP POLICY IF EXISTS "Job offers: driver updates own" ON public.job_offers;

CREATE OR REPLACE FUNCTION public.persist_driver_job_offer_progress(
  p_job_offer_id UUID,
  p_status TEXT DEFAULT NULL,
  p_extra JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
  job_offer_id UUID,
  status TEXT,
  pickup_arrived_at TIMESTAMPTZ,
  journey_started_at TIMESTAMPTZ,
  delivery_arrived_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  photo_loading_url TEXT,
  photo_delivery_url TEXT,
  total_trips INTEGER
) AS $$
DECLARE
  v_driver_id UUID;
  v_is_admin BOOLEAN := public.is_admin_user(auth.uid());
  v_current_status TEXT;
  v_pickup_otp TEXT;
  v_delivery_otp TEXT;
  v_pickup_otp_verified_at TIMESTAMPTZ;
  v_delivery_otp_verified_at TIMESTAMPTZ;
  v_requested_status TEXT := NULLIF(trim(p_status), '');
  v_pickup_otp_input TEXT := NULLIF(trim(p_extra ->> 'pickup_otp'), '');
  v_delivery_otp_input TEXT := NULLIF(trim(p_extra ->> 'delivery_otp'), '');
  v_job_offer_id UUID;
  v_status TEXT;
  v_pickup_arrived_at TIMESTAMPTZ;
  v_journey_started_at TIMESTAMPTZ;
  v_delivery_arrived_at TIMESTAMPTZ;
  v_delivered_at TIMESTAMPTZ;
  v_photo_loading_url TEXT;
  v_photo_delivery_url TEXT;
  v_total_trips INTEGER;
BEGIN
  SELECT
    jo.driver_id,
    jo.status,
    jo.pickup_otp,
    jo.delivery_otp,
    jo.pickup_otp_verified_at,
    jo.delivery_otp_verified_at
  INTO
    v_driver_id,
    v_current_status,
    v_pickup_otp,
    v_delivery_otp,
    v_pickup_otp_verified_at,
    v_delivery_otp_verified_at
  FROM public.job_offers jo
  JOIN public.drivers d ON d.id = jo.driver_id
  WHERE jo.id = p_job_offer_id
    AND (d.user_id = auth.uid() OR v_is_admin);

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Job offer not found or access denied';
  END IF;

  IF v_requested_status = 'in_transit'
     OR (p_extra ? 'journey_started_at' AND v_requested_status IS NULL) THEN
    IF v_pickup_otp_input IS NULL THEN
      RAISE EXCEPTION 'Pickup OTP is required before starting the journey';
    END IF;

    IF v_pickup_otp IS NULL OR v_pickup_otp_input <> v_pickup_otp THEN
      RAISE EXCEPTION 'Incorrect pickup OTP';
    END IF;

    v_pickup_otp_verified_at := COALESCE(v_pickup_otp_verified_at, NOW());
  END IF;

  IF v_requested_status = 'delivered'
     OR (p_extra ? 'delivered_at' AND v_requested_status IS NULL) THEN
    IF v_delivery_otp_input IS NULL THEN
      RAISE EXCEPTION 'Delivery OTP is required before completing the trip';
    END IF;

    IF v_delivery_otp IS NULL OR v_delivery_otp_input <> v_delivery_otp THEN
      RAISE EXCEPTION 'Incorrect delivery OTP';
    END IF;

    IF v_pickup_otp_verified_at IS NULL THEN
      RAISE EXCEPTION 'Pickup OTP must be verified before delivery completion';
    END IF;

    v_delivery_otp_verified_at := COALESCE(v_delivery_otp_verified_at, NOW());
  END IF;

  UPDATE public.job_offers jo
  SET status = COALESCE(v_requested_status, jo.status),
      pickup_arrived_at = COALESCE((p_extra ->> 'pickup_arrived_at')::TIMESTAMPTZ, jo.pickup_arrived_at),
      journey_started_at = COALESCE((p_extra ->> 'journey_started_at')::TIMESTAMPTZ, jo.journey_started_at),
      delivery_arrived_at = COALESCE((p_extra ->> 'delivery_arrived_at')::TIMESTAMPTZ, jo.delivery_arrived_at),
      delivered_at = COALESCE((p_extra ->> 'delivered_at')::TIMESTAMPTZ, jo.delivered_at),
      photo_loading_url = COALESCE(NULLIF(p_extra ->> 'photo_loading_url', ''), jo.photo_loading_url),
      photo_delivery_url = COALESCE(NULLIF(p_extra ->> 'photo_delivery_url', ''), jo.photo_delivery_url),
      pickup_otp_verified_at = COALESCE(v_pickup_otp_verified_at, jo.pickup_otp_verified_at),
      delivery_otp_verified_at = COALESCE(v_delivery_otp_verified_at, jo.delivery_otp_verified_at)
  WHERE jo.id = p_job_offer_id
  RETURNING
    jo.id,
    jo.status,
    jo.pickup_arrived_at,
    jo.journey_started_at,
    jo.delivery_arrived_at,
    jo.delivered_at,
    jo.photo_loading_url,
    jo.photo_delivery_url
  INTO
    v_job_offer_id,
    v_status,
    v_pickup_arrived_at,
    v_journey_started_at,
    v_delivery_arrived_at,
    v_delivered_at,
    v_photo_loading_url,
    v_photo_delivery_url;

  IF v_status = 'delivered' THEN
    UPDATE public.drivers d
    SET active_job_id = NULL,
        total_trips = COALESCE(d.total_trips, 0) + 1
    WHERE d.id = v_driver_id
    RETURNING d.total_trips INTO v_total_trips;
  ELSE
    SELECT d.total_trips
    INTO v_total_trips
    FROM public.drivers d
    WHERE d.id = v_driver_id;
  END IF;

  RETURN QUERY
  SELECT
    v_job_offer_id,
    v_status,
    v_pickup_arrived_at,
    v_journey_started_at,
    v_delivery_arrived_at,
    v_delivered_at,
    v_photo_loading_url,
    v_photo_delivery_url,
    COALESCE(v_total_trips, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.persist_driver_job_offer_progress(UUID, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.persist_driver_job_offer_progress(UUID, TEXT, JSONB) TO authenticated;
