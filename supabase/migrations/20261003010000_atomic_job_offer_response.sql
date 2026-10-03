-- TO-129: Make driver offer acceptance atomic and reachable.
--
-- The OTP-hardening migration (20260730110000) dropped the driver UPDATE policy
-- on job_offers, so the shipped browser flow (direct job_offers UPDATE followed
-- by a second direct drivers.active_job_id UPDATE) is no longer authorized and
-- was never atomic. This migration replaces both browser writes with one
-- trusted server transaction:
--
--   * ownership is resolved from auth.uid(), never from client input;
--   * the offer row and the driver row are locked (offer first, then driver —
--     the same order persist_driver_job_offer_progress uses) so duplicate
--     clicks, realtime replays and two concurrent accepts serialize instead of
--     racing;
--   * pending state, expiry, driver approval and an existing active trip are
--     all verified inside the transaction;
--   * duplicate accept/reject replays are idempotent: they return the current
--     authoritative state instead of writing again;
--   * every rejected path raises a controlled exception, so a zero-row result
--     can never be reported as success by a caller;
--   * the authoritative offer + active-job state is returned to the caller.

CREATE OR REPLACE FUNCTION public.respond_to_job_offer(
  p_job_offer_id UUID,
  p_accept BOOLEAN,
  p_decline_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
  offer_id UUID,
  offer_status TEXT,
  responded_at TIMESTAMPTZ,
  active_job_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_id UUID;
  v_driver_status TEXT;
  v_offer_driver_id UUID;
  v_offer_status TEXT;
  v_offer_expires_at TIMESTAMPTZ;
  v_offer_responded_at TIMESTAMPTZ;
  v_active_job_id UUID;
  v_new_status TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  IF p_accept IS NULL THEN
    RAISE EXCEPTION 'A response decision is required';
  END IF;

  -- Resolve the signed-in driver. Ownership comes from the session, never
  -- from client-supplied ids.
  SELECT d.id, d.status
    INTO v_driver_id, v_driver_status
  FROM public.drivers d
  WHERE d.user_id = auth.uid();

  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Driver profile not found for the signed-in user';
  END IF;

  -- Lock the offer row first (same order as persist_driver_job_offer_progress:
  -- offer row, then driver row) so concurrent responses queue here instead of
  -- interleaving.
  SELECT jo.driver_id, jo.status, jo.expires_at, jo.responded_at
    INTO v_offer_driver_id, v_offer_status, v_offer_expires_at, v_offer_responded_at
  FROM public.job_offers jo
  WHERE jo.id = p_job_offer_id
  FOR UPDATE;

  IF v_offer_driver_id IS NULL OR v_offer_driver_id <> v_driver_id THEN
    RAISE EXCEPTION 'Job offer not found or access denied';
  END IF;

  -- Lock the driver row and re-read the authoritative approval status and
  -- active trip after any concurrent response has committed.
  SELECT d.status, d.active_job_id
    INTO v_driver_status, v_active_job_id
  FROM public.drivers d
  WHERE d.id = v_driver_id
  FOR UPDATE;

  IF v_driver_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION 'Driver account is not approved to respond to offers';
  END IF;

  IF v_offer_status = 'pending'
     AND v_offer_expires_at IS NOT NULL
     AND v_offer_expires_at <= v_now THEN
    RAISE EXCEPTION 'Job offer has expired';
  END IF;

  IF p_accept THEN
    -- Idempotent replay: already accepted by this driver and still their
    -- active job, so return the authoritative state without writing again.
    IF v_offer_status = 'accepted' THEN
      IF v_active_job_id = p_job_offer_id THEN
        offer_status := v_offer_status;
        responded_at := v_offer_responded_at;
        active_job_id := v_active_job_id;
        offer_id := p_job_offer_id;
        RETURN NEXT;
        RETURN;
      END IF;

      RAISE EXCEPTION 'Job offer has already been accepted';
    END IF;

    IF v_offer_status <> 'pending' THEN
      IF v_offer_status = 'declined' THEN
        RAISE EXCEPTION 'Job offer has already been declined';
      END IF;
      RAISE EXCEPTION 'Job offer is no longer available';
    END IF;

    IF v_active_job_id IS NOT NULL THEN
      RAISE EXCEPTION 'Driver already has an active trip';
    END IF;

    v_new_status := 'accepted';

    UPDATE public.job_offers jo
    SET status = v_new_status,
        responded_at = COALESCE(jo.responded_at, v_now)
    WHERE jo.id = p_job_offer_id
    RETURNING jo.responded_at INTO v_offer_responded_at;

    UPDATE public.drivers d
    SET active_job_id = p_job_offer_id
    WHERE d.id = v_driver_id
    RETURNING d.active_job_id INTO v_active_job_id;
  ELSE
    -- Idempotent replay: already declined, so return the authoritative state
    -- without writing again.
    IF v_offer_status = 'declined' THEN
      offer_status := v_offer_status;
      responded_at := v_offer_responded_at;
      active_job_id := v_active_job_id;
      offer_id := p_job_offer_id;
      RETURN NEXT;
      RETURN;
    END IF;

    IF v_offer_status <> 'pending' THEN
      IF v_offer_status = 'accepted' THEN
        RAISE EXCEPTION 'Job offer has already been accepted';
      END IF;
      RAISE EXCEPTION 'Job offer is no longer available';
    END IF;

    v_new_status := 'declined';

    UPDATE public.job_offers jo
    SET status = v_new_status,
        responded_at = COALESCE(jo.responded_at, v_now),
        decline_reason = COALESCE(NULLIF(trim(p_decline_reason), ''), jo.decline_reason)
    WHERE jo.id = p_job_offer_id
    RETURNING jo.responded_at INTO v_offer_responded_at;
  END IF;

  offer_id := p_job_offer_id;
  offer_status := v_new_status;
  responded_at := v_offer_responded_at;
  active_job_id := v_active_job_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_job_offer(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_to_job_offer(UUID, BOOLEAN, TEXT) TO authenticated;
