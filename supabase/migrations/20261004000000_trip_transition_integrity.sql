-- TO-130: ordered, OTP-enforced trip transitions with exactly-once delivery effects.
--
-- Defects proven in 20260730110000_enforce_job_offer_otp_verification.sql:
--
--  1. Duplicate completion: total_trips is incremented whenever the *resulting*
--     status is 'delivered', so a replay (double click, realtime retry, API
--     retry) of the same completion increments the counter, the driver's
--     completion count and every earnings figure derived from it again.
--  2. No ordering: any status could be written in any order (jump forward,
--     rerun, move backward, or target a status from a non-active row).
--  3. No attempt bound on the 4-digit codes: 10,000 possibilities, unlimited
--     guesses. A failed OTP must be counted durably; that is only possible if
--     the failure path COMMITS (a RAISE would roll the counter back with the
--     rest of the transaction). This function therefore reports OTP failures
--     through the returned result_code instead of an exception, while every
--     structural/authorization error keeps raising.
--  4. Client-supplied timestamps were written verbatim (p_extra
--     'pickup_arrived_at' / 'journey_started_at' / 'delivery_arrived_at' /
--     'delivered_at'), so a driver could forge the trip chronology, and the
--     keys doubled as an undocumented transition trigger (p_extra ? ...).
--     Transitions are now status-driven only and every timestamp is set from
--     the server clock at the moment of the transition. p_extra timestamps
--     are ignored.
--  5. photo_loading_url / photo_delivery_url were accepted as arbitrary
--     strings. They are now restricted to this job's own trip-photos storage
--     path (/storage/v1/object/{public,sign}/trip-photos/<driver user>/<job>/),
--     which is also the only path the storage INSERT/UPDATE policies
--     (20260418002000_trip_photos_bucket.sql) authorize for the signed-in
--     driver.
--
-- Allowed sequence (documented cancellations are terminal):
--
--   accepted -> pickup_arrived -> in_transit -> delivery_arrived -> delivered
--
--   * pickup_arrived / delivery_arrived are unauthenticated waypoints;
--   * in_transit requires the correct pickup OTP and marks it verified;
--   * delivered requires the correct delivery OTP AND a previously verified
--     pickup OTP;
--   * a replay of the current status returns the authoritative state without
--     writing anything (exactly-once counter/payout/revenue effect);
--   * skipped or backward transitions are rejected;
--   * rows in 'pending', 'cancelled', 'declined' or 'expired' are not active
--     for driver progress. Cancellation is owned by the customer/agency
--     surfaces (shipments cancel + the agency "updates own" job_offers
--     policy) and is terminal for the driver.
--
-- OTP attempt bounds (consistent with the 4-digit contract): 5 attempts per
-- code, then the code locks for 15 minutes. A successful verification resets
-- the counter. Locked codes reject before comparison.
--
-- Direct table access is re-asserted: the OTP columns stay outside the
-- authenticated column grant, and authenticated UPDATE on job_offers is
-- revoked entirely, so no broad table grant can reopen a direct driver write
-- path around this function (PostgreSQL column-level REVOKE is a no-op while a
-- table-level grant is held; the table privilege must be revoked, which was
-- verified on a real PostgreSQL 17 engine).

-- ---------------------------------------------------------------------------
-- 1. Attempt/lock state (internal columns, never granted for SELECT).
-- ---------------------------------------------------------------------------
ALTER TABLE public.job_offers
  ADD COLUMN IF NOT EXISTS pickup_otp_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_otp_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pickup_otp_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_otp_locked_until TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. Progress function: ordered, OTP-enforced, replay-safe.
--    The return shape changes (result_code, otp_attempts_remaining), so the
--    function is dropped first.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.persist_driver_job_offer_progress(UUID, TEXT, JSONB);

CREATE FUNCTION public.persist_driver_job_offer_progress(
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
  total_trips INTEGER,
  result_code TEXT,
  otp_attempts_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- 4-digit codes have only 10,000 possibilities: bound the guesses.
  c_max_otp_attempts CONSTANT INTEGER := 5;
  c_otp_lock_interval CONSTANT INTERVAL := INTERVAL '15 minutes';
  c_progress_statuses CONSTANT TEXT[] := ARRAY[
    'accepted', 'pickup_arrived', 'in_transit', 'delivery_arrived', 'delivered'
  ];

  v_is_admin BOOLEAN := public.is_admin_user(auth.uid());
  v_now TIMESTAMPTZ := NOW();

  v_driver_id UUID;
  v_driver_user_id UUID;
  v_current_status TEXT;
  v_current_rank INTEGER;
  v_requested_status TEXT := NULLIF(trim(p_status), '');
  v_requested_rank INTEGER;
  v_extra JSONB := COALESCE(p_extra, '{}'::JSONB);

  v_pickup_otp TEXT;
  v_delivery_otp TEXT;
  v_pickup_otp_attempts INTEGER := 0;
  v_delivery_otp_attempts INTEGER := 0;
  v_pickup_otp_locked_until TIMESTAMPTZ;
  v_delivery_otp_locked_until TIMESTAMPTZ;
  v_pickup_otp_input TEXT := NULLIF(trim(v_extra ->> 'pickup_otp'), '');
  v_delivery_otp_input TEXT := NULLIF(trim(v_extra ->> 'delivery_otp'), '');

  v_photo_loading TEXT;
  v_photo_delivery TEXT;

  v_job_offer_id UUID;
  v_status TEXT;
  v_pickup_arrived_at TIMESTAMPTZ;
  v_journey_started_at TIMESTAMPTZ;
  v_delivery_arrived_at TIMESTAMPTZ;
  v_delivered_at TIMESTAMPTZ;
  v_loading_url TEXT;
  v_delivery_url TEXT;
  v_total_trips INTEGER;

  v_result_code TEXT := 'OK';
  v_attempts_remaining INTEGER;
  v_attempts INTEGER;
BEGIN
  -- Lock the offer row first (same lock order as respond_to_job_offer: offer,
  -- then driver) so duplicate/concurrent progress calls serialize.
  SELECT
    jo.driver_id,
    jo.status,
    jo.pickup_otp,
    jo.delivery_otp,
    jo.pickup_otp_attempts,
    jo.delivery_otp_attempts,
    jo.pickup_otp_locked_until,
    jo.delivery_otp_locked_until,
    jo.pickup_arrived_at,
    jo.journey_started_at,
    jo.delivery_arrived_at,
    jo.delivered_at,
    jo.photo_loading_url,
    jo.photo_delivery_url
  INTO
    v_driver_id,
    v_current_status,
    v_pickup_otp,
    v_delivery_otp,
    v_pickup_otp_attempts,
    v_delivery_otp_attempts,
    v_pickup_otp_locked_until,
    v_delivery_otp_locked_until,
    v_pickup_arrived_at,
    v_journey_started_at,
    v_delivery_arrived_at,
    v_delivered_at,
    v_loading_url,
    v_delivery_url
  FROM public.job_offers jo
  JOIN public.drivers d ON d.id = jo.driver_id
  WHERE jo.id = p_job_offer_id
    AND (d.user_id = auth.uid() OR v_is_admin)
  FOR UPDATE OF jo;

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Job offer not found or access denied';
  END IF;

  -- Lock the driver row too (offer -> driver order); keeps total_trips and
  -- active_job_id updates serialized against respond_to_job_offer.
  SELECT d.user_id
    INTO v_driver_user_id
  FROM public.drivers d
  WHERE d.id = v_driver_id
  FOR UPDATE;

  v_current_rank := array_position(c_progress_statuses, v_current_status);

  IF v_requested_status IS NOT NULL THEN
    v_requested_rank := array_position(c_progress_statuses, v_requested_status);

    IF v_requested_rank IS NULL OR v_requested_status = 'accepted' THEN
      RAISE EXCEPTION 'Invalid trip status';
    END IF;

    IF v_current_rank IS NULL THEN
      RAISE EXCEPTION 'Trip is not active';
    END IF;

    IF v_requested_rank < v_current_rank THEN
      RAISE EXCEPTION 'Trip status cannot move backwards';
    END IF;

    IF v_requested_rank = v_current_rank THEN
      -- Replay/no-op: return the authoritative row, write nothing. This is the
      -- exactly-once path for duplicate completion calls.
      job_offer_id := p_job_offer_id;
      status := v_current_status;
      pickup_arrived_at := v_pickup_arrived_at;
      journey_started_at := v_journey_started_at;
      delivery_arrived_at := v_delivery_arrived_at;
      delivered_at := v_delivered_at;
      photo_loading_url := v_loading_url;
      photo_delivery_url := v_delivery_url;
      SELECT d.total_trips INTO v_total_trips FROM public.drivers d WHERE d.id = v_driver_id;
      total_trips := COALESCE(v_total_trips, 0);
      result_code := 'OK';
      otp_attempts_remaining := NULL;
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_requested_rank > v_current_rank + 1 THEN
      RAISE EXCEPTION 'Trip status must advance one step at a time';
    END IF;
  ELSE
    -- Photo-only updates are allowed only while the trip is still in progress;
    -- delivered rows are immutable for the driver (proof photos cannot be
    -- swapped after completion and payout).
    IF v_current_rank IS NULL THEN
      RAISE EXCEPTION 'Trip is not active';
    ELSIF v_current_rank >= 5 THEN
      RAISE EXCEPTION 'Trip is already completed';
    END IF;
  END IF;

  -- ---- OTP gates -----------------------------------------------------------
  -- Structural checks (what state the trip must already be in) run before any
  -- attempt is counted, so a skipped-pickup call never burns delivery guesses.
  IF v_requested_status = 'delivered' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.job_offers jo
      WHERE jo.id = p_job_offer_id AND jo.pickup_otp_verified_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Pickup OTP must be verified before delivery completion';
    END IF;
  END IF;

  IF v_requested_status = 'in_transit' THEN
    IF v_pickup_otp_input IS NULL THEN
      RAISE EXCEPTION 'Pickup OTP is required before starting the journey';
    END IF;

    IF v_pickup_otp_locked_until IS NOT NULL AND v_pickup_otp_locked_until > v_now THEN
      v_result_code := 'OTP_LOCKED';
      v_attempts_remaining := 0;
    ELSIF v_pickup_otp IS NULL OR v_pickup_otp_input <> v_pickup_otp THEN
      v_attempts := COALESCE(v_pickup_otp_attempts, 0) + 1;

      IF v_attempts >= c_max_otp_attempts THEN
        UPDATE public.job_offers jo
        SET pickup_otp_attempts = v_attempts,
            pickup_otp_locked_until = v_now + c_otp_lock_interval
        WHERE jo.id = p_job_offer_id;
        v_result_code := 'OTP_LOCKED';
        v_attempts_remaining := 0;
      ELSE
        UPDATE public.job_offers jo
        SET pickup_otp_attempts = v_attempts
        WHERE jo.id = p_job_offer_id;
        v_result_code := 'OTP_INCORRECT';
        v_attempts_remaining := c_max_otp_attempts - v_attempts;
      END IF;
    END IF;
  END IF;

  IF v_requested_status = 'delivered' AND v_result_code = 'OK' THEN
    IF v_delivery_otp_input IS NULL THEN
      RAISE EXCEPTION 'Delivery OTP is required before completing the trip';
    END IF;

    IF v_delivery_otp_locked_until IS NOT NULL AND v_delivery_otp_locked_until > v_now THEN
      v_result_code := 'OTP_LOCKED';
      v_attempts_remaining := 0;
    ELSIF v_delivery_otp IS NULL OR v_delivery_otp_input <> v_delivery_otp THEN
      v_attempts := COALESCE(v_delivery_otp_attempts, 0) + 1;

      IF v_attempts >= c_max_otp_attempts THEN
        UPDATE public.job_offers jo
        SET delivery_otp_attempts = v_attempts,
            delivery_otp_locked_until = v_now + c_otp_lock_interval
        WHERE jo.id = p_job_offer_id;
        v_result_code := 'OTP_LOCKED';
        v_attempts_remaining := 0;
      ELSE
        UPDATE public.job_offers jo
        SET delivery_otp_attempts = v_attempts
        WHERE jo.id = p_job_offer_id;
        v_result_code := 'OTP_INCORRECT';
        v_attempts_remaining := c_max_otp_attempts - v_attempts;
      END IF;
    END IF;
  END IF;

  -- An OTP failure commits its attempt state and returns the unchanged row.
  -- The caller must treat anything other than result_code 'OK' as a rejection.
  IF v_result_code <> 'OK' THEN
    job_offer_id := p_job_offer_id;
    status := v_current_status;
    pickup_arrived_at := v_pickup_arrived_at;
    journey_started_at := v_journey_started_at;
    delivery_arrived_at := v_delivery_arrived_at;
    delivered_at := v_delivered_at;
    photo_loading_url := v_loading_url;
    photo_delivery_url := v_delivery_url;
    SELECT d.total_trips INTO v_total_trips FROM public.drivers d WHERE d.id = v_driver_id;
    total_trips := COALESCE(v_total_trips, 0);
    result_code := v_result_code;
    otp_attempts_remaining := v_attempts_remaining;
    RETURN NEXT;
    RETURN;
  END IF;

  -- ---- Photo references (whitelisted keys only, job-scoped URLs only) ------
  IF v_extra ? 'photo_loading_url' THEN
    v_photo_loading := NULLIF(trim(v_extra ->> 'photo_loading_url'), '');
  END IF;
  IF v_extra ? 'photo_delivery_url' THEN
    v_photo_delivery := NULLIF(trim(v_extra ->> 'photo_delivery_url'), '');
  END IF;

  IF (v_photo_loading IS NOT NULL OR v_photo_delivery IS NOT NULL) AND NOT v_is_admin THEN
    IF (v_photo_loading IS NOT NULL
        AND NOT public.is_job_trip_photo_url(v_photo_loading, v_driver_user_id, p_job_offer_id))
       OR (v_photo_delivery IS NOT NULL
           AND NOT public.is_job_trip_photo_url(v_photo_delivery, v_driver_user_id, p_job_offer_id)) THEN
      RAISE EXCEPTION 'Invalid trip photo reference';
    END IF;
  END IF;

  -- ---- Transition write (server-authoritative timestamps) ------------------
  UPDATE public.job_offers jo
  SET status =
        COALESCE(v_requested_status, jo.status),
      pickup_arrived_at =
        CASE WHEN v_requested_rank = 2 THEN v_now ELSE jo.pickup_arrived_at END,
      journey_started_at =
        CASE WHEN v_requested_rank = 3 THEN v_now ELSE jo.journey_started_at END,
      delivery_arrived_at =
        CASE WHEN v_requested_rank = 4 THEN v_now ELSE jo.delivery_arrived_at END,
      delivered_at =
        CASE WHEN v_requested_rank = 5 THEN v_now ELSE jo.delivered_at END,
      pickup_otp_verified_at =
        CASE WHEN v_requested_rank = 3 THEN v_now ELSE jo.pickup_otp_verified_at END,
      delivery_otp_verified_at =
        CASE WHEN v_requested_rank = 5 THEN v_now ELSE jo.delivery_otp_verified_at END,
      pickup_otp_attempts =
        CASE WHEN v_requested_rank = 3 THEN 0 ELSE jo.pickup_otp_attempts END,
      delivery_otp_attempts =
        CASE WHEN v_requested_rank = 5 THEN 0 ELSE jo.delivery_otp_attempts END,
      pickup_otp_locked_until =
        CASE WHEN v_requested_rank = 3 THEN NULL ELSE jo.pickup_otp_locked_until END,
      delivery_otp_locked_until =
        CASE WHEN v_requested_rank = 5 THEN NULL ELSE jo.delivery_otp_locked_until END,
      photo_loading_url =
        COALESCE(v_photo_loading, jo.photo_loading_url),
      photo_delivery_url =
        COALESCE(v_photo_delivery, jo.photo_delivery_url)
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
    v_loading_url,
    v_delivery_url;

  -- ---- Delivery effect: exactly once --------------------------------------
  -- The status equality/replay and backward/forward checks above guarantee
  -- this branch only runs on the real delivery_arrived -> delivered step, so
  -- a replayed completion can never increment the counter again.
  IF v_status = 'delivered' THEN
    UPDATE public.drivers d
    SET active_job_id =
          CASE WHEN d.active_job_id = p_job_offer_id THEN NULL ELSE d.active_job_id END,
        total_trips = COALESCE(d.total_trips, 0) + 1
    WHERE d.id = v_driver_id
    RETURNING d.total_trips INTO v_total_trips;
  ELSE
    SELECT d.total_trips INTO v_total_trips FROM public.drivers d WHERE d.id = v_driver_id;
  END IF;

  job_offer_id := v_job_offer_id;
  status := v_status;
  pickup_arrived_at := v_pickup_arrived_at;
  journey_started_at := v_journey_started_at;
  delivery_arrived_at := v_delivery_arrived_at;
  delivered_at := v_delivered_at;
  photo_loading_url := v_loading_url;
  photo_delivery_url := v_delivery_url;
  total_trips := COALESCE(v_total_trips, 0);
  result_code := 'OK';
  otp_attempts_remaining :=
    CASE
      WHEN v_requested_rank = 3 THEN c_max_otp_attempts
      WHEN v_requested_rank = 5 THEN c_max_otp_attempts
      ELSE NULL
    END;
  RETURN NEXT;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Job-scoped trip-photo URL check.
--    The storage policies (20260418002000) only authorize the signed-in user's
--    own folder, and the driver UI uploads to <auth user>/<job offer>/<file>,
--    so a legitimate reference always carries that path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_job_trip_photo_url(
  p_url TEXT,
  p_user_id UUID,
  p_job_offer_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    p_url ~ '^https?://[^/]+/storage/v1/object/(public|sign)/trip-photos/[^/?]+/[^/?]+(\?.*)?$'
    AND (
      p_user_id IS NULL
      OR p_job_offer_id IS NULL
      OR position(
        '/trip-photos/' || p_user_id::text || '/' || p_job_offer_id::text || '/'
        in p_url
      ) > 0
    );
$$;

REVOKE ALL ON FUNCTION public.is_job_trip_photo_url(TEXT, UUID, UUID) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Function privileges: drivers only, through the RPC.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.persist_driver_job_offer_progress(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.persist_driver_job_offer_progress(UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.persist_driver_job_offer_progress(UUID, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.get_shipment_job_offer_tracking(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_shipment_job_offer_tracking(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_shipment_job_offer_tracking(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Re-assert direct table access limits.
--    A column-level REVOKE is a silent no-op while the role holds the
--    table-level privilege (verified on PostgreSQL 17), so the table SELECT
--    and UPDATE grants are revoked and only the non-secret columns are
--    granted back. OTPs and the internal attempt columns therefore stay
--    unreadable and unwritable for authenticated clients no matter which
--    broad table grant a later change may add, and the only write path left
--    is the SECURITY DEFINER RPC / service-role edge functions.
-- ---------------------------------------------------------------------------
REVOKE SELECT ON public.job_offers FROM authenticated;
GRANT SELECT (
  id, shipment_id, driver_id, offered_at, expires_at, responded_at, status,
  decline_reason, photo_loading_url, photo_delivery_url, pickup_arrived_at,
  journey_started_at, delivery_arrived_at, delivered_at,
  pickup_otp_verified_at, delivery_otp_verified_at
) ON public.job_offers TO authenticated;

REVOKE UPDATE ON public.job_offers FROM authenticated;
